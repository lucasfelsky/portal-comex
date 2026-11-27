import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { useUnsavedChangesGuard } from '../../contexts/UnsavedChangesContext'
import { deleteOwnCargoConferencePhotoFiles } from '../../services/cargoConferencePhotosRepository'
import { getCargoReport, saveCargoReportConference } from '../../services/cargoReportRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import {
  CARGO_CONFERENCE_MESSAGES,
  describeCargoReopenError,
  describeCargoSaveError,
  isCargoOffline,
  reopenCargoConference,
} from './cargoConferenceActions'
import {
  hasAnyCargoIssue,
  patchCargoRowIssue,
  readCargoRowIssue,
  stepCargoRowPallets,
  summarizeCargoPallets,
} from './cargoConferenceIssues'
import { addCargoPhoto, listUnsavedCargoPhotos, removeCargoPhoto } from './cargoConferencePhotos'
import { patchCargoUnloadUnit, removeCargoUnloadUnit, toCargoDateTimeKeyLocal } from './cargoConferenceUnload'
import {
  CARGO_PARTIAL_PALLETS_MAX,
  addCargoPartialPallet,
  expectedUnitsFromDerived,
  listCargoPartialPallets,
  removeCargoPartialPallet,
  setCargoRowUnits,
  stepCargoRowUnits,
} from './cargoConferenceUnits'
import {
  EMPTY_CARGO_CONFERENCE,
  cargoConferenceKey,
  evaluateCargoConferenceClose,
  markAllCargoRowsOk,
  setCargoConferenceLabel,
  summarizeCargoConferenceProgress,
  toggleCargoConferenceFlag,
} from './cargoConferenceModel'
import { buildCargoRegistry } from './cargoReportAutofill'
import {
  buildConferencePayload,
  canReopenCargoConference,
  canSaveCargoConference,
  deriveCargoReportRow,
  fromCargoReportDoc,
  fromConferenceDoc,
  getCargoReportStage,
  validateCargoUnload,
} from './cargoReportFormModel'
import { orderCargoFormByPurchaseOrder } from './cargoReportGroups'
import { cargoPackagingContext } from './cargoSupplierPackaging'
import { invalidateCargoConference } from './useCargoConferenceList'
import useCargoPhotoUploads from './useCargoPhotoUploads'
import { loadItemCatalogCached, loadSupplierCatalogCached } from './useCargoReportPackaging'

// S9-F do Relatório de Carga: estado e ações da tela de conferência do celular (um processo). Carrega o relatório do
// COMEX (`current`) e a conferência da logística (`conference`), calcula o que a tela mostra (progresso, Nº de emb.,
// pendências) e grava pelas MESMAS funções do computador (`cargoConferenceActions`). Sem conexão nada é enviado e o
// que foi digitado fica na tela (sem fila offline). Padrão replicado: guard `isMounted` na carga assíncrona.

const LOAD_ERROR_PREFIX = 'Não foi possível carregar o relatório de carga.'

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// S9-H: no celular a logística só SALVA; fechar a conferência (Excel, aviso e trava) fica no computador. O admin só
// acompanha e reabre.
// S10-I: contador de pallets por item, observação por item e o aviso do que o fechamento do computador vai cobrar
// (`evaluateCargoConferenceClose`): só INFORMA (faixa de pallets, selos e aviso ao salvar), nunca bloqueia o Salvar.
export default function useCargoConferenceScreen({ process, profile }) {
  const processId = process?.id
  const role = profile?.role
  const actorName = String(profile?.name ?? profile?.email ?? '').trim()
  const toast = useToast()
  const [reloadToken, setReloadToken] = useState(0)
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(null)
  const [conference, setConference] = useState(EMPTY_CARGO_CONFERENCE)
  const [saved, setSaved] = useState(EMPTY_CARGO_CONFERENCE)
  const [catalog, setCatalog] = useState(null)
  const [supplierCatalog, setSupplierCatalog] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!processId) return undefined
    let isMounted = true

    async function load() {
      setLoadState('loading')
      setLoadError('')
      setFeedback(null)
      try {
        const [report, catalogResult, supplierResult] = await Promise.all([
          getCargoReport(processId),
          loadItemCatalogCached().then(
            (data) => ({ data }),
            () => ({ data: null })
          ),
          loadSupplierCatalogCached(),
        ])
        if (!isMounted) return
        if (!report.current) {
          setForm(null)
          setLoadState('missing')
          return
        }
        const loaded = orderCargoFormByPurchaseOrder(fromCargoReportDoc(report.current), process)
        const savedConference = fromConferenceDoc(report.conference, report.current.rows, report.current)
        setCatalog(catalogResult.data)
        setSupplierCatalog(supplierResult.data)
        setForm(loaded)
        setSaved(savedConference)
        setConference(savedConference)
        setLoadState('ready')
      } catch (error) {
        if (!isMounted) return
        setLoadError(buildActionErrorMessage(LOAD_ERROR_PREFIX, error))
        setLoadState('error')
      }
    }

    load()
    return () => {
      isMounted = false
    }
    // `process` só alimenta o fornecedor de cada linha; recarregar a cada render de quem chama descartaria o que
    // a logística marcou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId, reloadToken])

  const rows = useMemo(() => form?.rows ?? [], [form])
  const packaging = useMemo(() => {
    const { supplierNameOf } = buildCargoRegistry({ itemCatalog: catalog, supplierCatalog, process })
    const supplierNameByRowId = {}
    for (const row of rows) supplierNameByRowId[row.id] = supplierNameOf(row)
    return { supplierCatalog, supplierNameByRowId }
  }, [catalog, supplierCatalog, process, rows])
  const derived = useMemo(
    () => rows.map((row) => deriveCargoReportRow(row, catalog, cargoPackagingContext(packaging, row.id))),
    [rows, catalog, packaging]
  )

  const stage = getCargoReportStage(form?.status, saved.status)
  const canSave = canSaveCargoConference(role, stage)
  const canReopen = canReopenCargoConference(role, stage)
  // Fatia B: Nº de emb. inteiro de cada lote (o esperado das unidades contadas); sem inteiro, sem esperado (D-11).
  const expectedUnits = useMemo(() => expectedUnitsFromDerived(rows, derived), [rows, derived])
  const dirty = form ? cargoConferenceKey(conference, rows) !== cargoConferenceKey(saved, rows) : false
  const unloadErrors = canSave ? validateCargoUnload(conference) : { start: '', end: '' }
  const hasUnloadError = Boolean(unloadErrors.start || unloadErrors.end)
  const progress = useMemo(() => summarizeCargoConferenceProgress(rows, conference), [rows, conference])
  const expectedPallets = form?.expectedPallets ?? null
  const pallets = useMemo(
    () => summarizeCargoPallets(rows, conference, expectedPallets),
    [rows, conference, expectedPallets]
  )
  // Avaria registrada e status diferente de "Com ressalva": o celular sugere (botão "Usar Com ressalva"), não troca.
  const suggestStatus = hasAnyCargoIssue(conference) && conference.receiptStatus !== 'com_ressalva'

  function edit(updater) {
    if (!canSave) return
    setConference(updater)
    setFeedback(null)
  }

  // S10-J1b: fotos de avaria. A foto enviada entra no item e fica "não salva" até o Salvar.
  const photoUploads = useCargoPhotoUploads({
    processId,
    uid: profile?.uid,
    conference,
    enabled: canSave,
    onUploaded: (rowId, photo) => edit((current) => addCargoPhoto(current, rowId, photo)),
  })

  // Sair com alteração não salva (ou com foto ainda subindo) pede confirmação (como no resto do app).
  useUnsavedChangesGuard(dirty || photoUploads.isUploading)

  const toggleOk = (rowId) => edit((current) => toggleCargoConferenceFlag(current, 'okByRowId', rowId))
  const stepPallets = (rowId, delta) => edit((current) => stepCargoRowPallets(current, rowId, delta))
  const stepUnits = (rowId, delta) => edit((current) => stepCargoRowUnits(current, rowId, delta))
  const setUnits = (rowId, value) => edit((current) => setCargoRowUnits(current, rowId, value))
  const setIssue = (rowId, changes) => edit((current) => patchCargoRowIssue(current, rowId, changes))
  const setLabel = (rowId, field, value) => edit((current) => setCargoConferenceLabel(current, rowId, field, value))

  // Fatia C: descarga por unidade. Cada edição devolve a conferência com o início, o fim e a data de recebimento já
  // recalculados; "agora" é o minuto local do aparelho (`YYYY-MM-DDTHH:mm`, como o campo). Sem correção automática: "Finalizar
  // agora" antes do início grava e mostra o erro (o Salvar barra).
  const setUnloadUnit = (unitId, changes) => edit((current) => patchCargoUnloadUnit(current, unitId, changes))
  const startUnloadNow = (unitId) => setUnloadUnit(unitId, { startAt: toCargoDateTimeKeyLocal(new Date()) })
  const finishUnloadNow = (unitId) => setUnloadUnit(unitId, { endAt: toCargoDateTimeKeyLocal(new Date()) })
  const removeUnloadUnit = (unitId) => edit((current) => removeCargoUnloadUnit(current, unitId))

  // Tira a foto do item (vale no Salvar). Foto enviada por mim e ainda não salva: apaga o arquivo agora (melhor esforço).
  function removePhoto(rowId, photoId) {
    if (!canSave) return
    const photo = readCargoRowIssue(conference, rowId).photos.find((item) => item?.id === photoId)
    edit((current) => removeCargoPhoto(current, rowId, photoId))
    if (photo && listUnsavedCargoPhotos(conference, saved).some((item) => item.id === photoId)) {
      deleteOwnCargoConferencePhotoFiles(processId, [photo], { uid: profile?.uid }).catch(() => {})
    }
  }
  const patch = (changes) => edit((current) => ({ ...current, ...changes }))
  const applySuggestedStatus = () => patch({ receiptStatus: 'com_ressalva' })

  // Pallet parcial: 1 pallet físico que aparece nos dois lotes; remover de um lado remove o pallet inteiro. `parts` =
  // [{ rowId, units }]. Devolve se adicionou (a folha só fecha quando adicionou).
  function addPartialPallet(parts) {
    if (!canSave) return false
    if (listCargoPartialPallets(conference).length >= CARGO_PARTIAL_PALLETS_MAX) {
      toast.error(`Limite de ${CARGO_PARTIAL_PALLETS_MAX} pallets parciais por conferência.`)
      return false
    }
    edit((current) => addCargoPartialPallet(current, parts))
    toast.success('Pallet parcial adicionado. Conta 1 pallet na carga.')
    return true
  }

  function removePartialPallet(partialId) {
    if (!canSave) return
    edit((current) => removeCargoPartialPallet(current, partialId))
    toast.success('Pallet parcial removido dos dois lotes')
  }

  function markAllOk() {
    if (!canSave) return
    setConference((current) => markAllCargoRowsOk(current, rows))
    setFeedback(null)
    toast.success('Todos os lotes marcados com OK. Pallets continuam por contar.')
  }

  // Estado gravado (salvar, fechar ou reabrir): tela e base de comparação ficam iguais.
  function applyPersisted(next) {
    const persisted = { ...EMPTY_CARGO_CONFERENCE, ...next }
    setSaved(persisted)
    setConference(persisted)
  }

  // Uma tarefa por vez (salvar, fechar, gravar de novo, reabrir).
  async function runWork(task) {
    if (busyRef.current) return
    busyRef.current = true
    setIsBusy(true)
    try {
      await task()
    } finally {
      busyRef.current = false
      setIsBusy(false)
    }
  }

  // Sem conexão: nada é enviado; banner + aviso que não some sozinho.
  function failOffline(text) {
    setFeedback({ kind: 'error', text })
    toast.error(text, { persist: true })
  }

  function save() {
    if (!canSave || busyRef.current || !dirty) return
    setFeedback(null)
    if (hasUnloadError) {
      setFeedback({ kind: 'error', text: CARGO_CONFERENCE_MESSAGES.invalidUnload })
      return
    }
    if (isCargoOffline()) {
      failOffline(CARGO_CONFERENCE_MESSAGES.offline)
      return
    }
    runWork(async () => {
      try {
        const payload = buildConferencePayload({ ...conference, revision: saved.revision }, rows, { actorName })
        await saveCargoReportConference(processId, payload, profile, {
          titleSuffix: form.titleSuffix,
          totalRows: rows.length,
        })
        applyPersisted({ ...payload, updatedAt: new Date(), updatedByName: actorName })
        invalidateCargoConference(processId)
        // O que o fechamento do computador vai cobrar (nada disso trava o Salvar).
        const { hints } = evaluateCargoConferenceClose(rows, payload, { expectedPallets, expectedUnitsByRowId: expectedUnits })
        setFeedback({
          kind: 'success',
          text: `Conferência salva às ${formatClock(new Date())}.`,
          notice: hints.length > 0 ? `No fechamento pelo computador: ${hints.join('; ')}.` : '',
        })
      } catch (error) {
        setFeedback(describeCargoSaveError(error, 'conference'))
      }
    })
  }

  function reopen() {
    if (!canReopen || busyRef.current) return
    if (isCargoOffline()) {
      failOffline(CARGO_CONFERENCE_MESSAGES.offlineReopen)
      return
    }
    runWork(async () => {
      setFeedback(null)
      try {
        applyPersisted(await reopenCargoConference({ processId, profile, savedConference: saved, actorName }))
        invalidateCargoConference(processId)
        setFeedback({ kind: 'success', text: CARGO_CONFERENCE_MESSAGES.conferenceReopened })
      } catch (error) {
        setFeedback(describeCargoReopenError(error))
      }
    })
  }

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])
  const photoTools = { processId, ...photoUploads, remove: removePhoto }

  return {
    loadState,
    loadError,
    form,
    rows,
    derived,
    conference,
    saved,
    stage,
    canSave,
    canReopen,
    dirty,
    unloadErrors,
    progress,
    pallets,
    suggestStatus,
    photoTools,
    isUploading: photoUploads.isUploading,
    feedback,
    isBusy,
    actorName,
    toggleOk,
    stepPallets,
    stepUnits,
    setUnits,
    addPartialPallet,
    removePartialPallet,
    expectedUnits,
    setIssue,
    setLabel,
    setUnloadUnit,
    startUnloadNow,
    finishUnloadNow,
    removeUnloadUnit,
    patch,
    applySuggestedStatus,
    markAllOk,
    save,
    reopen,
    reload,
  }
}
