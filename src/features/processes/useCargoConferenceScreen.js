import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { useUnsavedChangesGuard } from '../../contexts/UnsavedChangesContext'
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
  EMPTY_CARGO_CONFERENCE,
  cargoConferenceKey,
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
  const dirty = form ? cargoConferenceKey(conference, rows) !== cargoConferenceKey(saved, rows) : false
  const unloadErrors = canSave ? validateCargoUnload(conference) : { start: '', end: '' }
  const hasUnloadError = Boolean(unloadErrors.start || unloadErrors.end)
  const progress = useMemo(() => summarizeCargoConferenceProgress(rows, conference), [rows, conference])

  // Sair com alteração não salva pede confirmação (como no resto do app).
  useUnsavedChangesGuard(dirty)

  function edit(updater) {
    if (!canSave) return
    setConference(updater)
    setFeedback(null)
  }

  const toggleOk = (rowId) => edit((current) => toggleCargoConferenceFlag(current, 'okByRowId', rowId))
  const toggleCount = (rowId) => edit((current) => toggleCargoConferenceFlag(current, 'countOkByRowId', rowId))
  const setLabel = (rowId, field, value) => edit((current) => setCargoConferenceLabel(current, rowId, field, value))
  const patch = (changes) => edit((current) => ({ ...current, ...changes }))

  function markAllOk() {
    if (!canSave) return
    setConference((current) => markAllCargoRowsOk(current, rows))
    setFeedback(null)
    toast.success('Todos os itens marcados com OK e Contagem')
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
        setFeedback({ kind: 'success', text: `Conferência salva às ${formatClock(new Date())}.` })
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
    feedback,
    isBusy,
    actorName,
    toggleOk,
    toggleCount,
    setLabel,
    patch,
    markAllOk,
    save,
    reopen,
    reload,
  }
}
