import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import {
  getCargoReport,
  saveCargoReportConference,
  saveCargoReportDraft,
} from '../../services/cargoReportRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import {
  buildAutofilledCargoReport,
  buildCargoRegistry,
  buildCargoSources,
  describeCargoAutofillNote,
  quantityMismatchByRowId,
} from './cargoReportAutofill'
import { CARGO_CONFERENCE_MESSAGES, describeCargoSaveError } from './cargoConferenceActions'
import { summarizeCargoPallets } from './cargoConferenceIssues'
import CargoConferenceIssuesCard from './CargoConferenceIssuesCard'
import { EMPTY_CARGO_CONFERENCE, cargoConferenceKey } from './cargoConferenceModel'
import { CargoReportActionBar } from './CargoReportConcludeDialog'
import CargoReportHeaderCard from './CargoReportHeaderCard'
import CargoReportImportDialog from './CargoReportImportDialog'
import CargoReportItems from './CargoReportItems'
import CargoReportQuickPackagingDialog from './CargoReportQuickPackagingDialog'
import CargoReportReceiptSection from './CargoReportReceiptSection'
import CargoReportRefreshPanel, { CargoInfoIcon } from './CargoReportRefreshPanel'
import CargoReportSplitDialog from './CargoReportSplitDialog'
import {
  CARGO_REPORT_MAX_ROWS,
  CARGO_REPORT_ROWS_LIMIT_MESSAGE,
  CARGO_STAGE,
  buildCargoReportPayload,
  buildConferencePayload,
  buildInitialCargoReport,
  canEditCargoReport,
  canOpenCargoReport,
  canSaveCargoConference,
  countCargoReportAlerts,
  createCargoReportRowId,
  createEmptyCargoReportRow,
  deriveCargoReportRow,
  fromCargoReportDoc,
  fromConferenceDoc,
  getCargoReportStage,
  isCargoReportRowEmpty,
  resolveCargoExpectedPallets,
  validateCargoUnload,
} from './cargoReportFormModel'
import { orderCargoFormByPurchaseOrder, getCargoReportPurchaseOrders } from './cargoReportGroups'
import { applyCargoReportImport } from './cargoReportImport'
import { formatCargoDateBr } from './cargoReportSheet'
import { cargoPackagingContext } from './cargoSupplierPackaging'
import useCargoConferenceEdit from './useCargoConferenceEdit'
import useCargoReportAutofill, { fetchCargoReference } from './useCargoReportAutofill'
import useCargoReportPackaging, {
  SUPPLIER_CATALOG_ERROR_MESSAGE,
  loadItemCatalogCached,
  loadSupplierCatalogCached,
} from './useCargoReportPackaging'
import useCargoReportRowActions from './useCargoReportRowActions'

// S3 do Relatório de Carga: formulário FR.CMX.001 dentro da aba Documentos do processo.
// COMEX (admin) preenche, salva rascunho e fecha a parte dele ("Salvar e fechar"); a logística marca o OK?
// e conta os pallets de cada linha, preenche as etiquetas WMS/SQ e o recebimento, e fecha a conferência dela
// (S6/S7; doc `conference`, separado para não conflitar com quem está editando). "Conferido por" é
// automático (quem salva a conferência). Estados: ver `getCargoReportStage`.
// Padrões replicados (não são util compartilhado): guard `isMounted` na carga assíncrona.

const LOAD_ERROR_PREFIX = 'Não foi possível carregar o relatório de carga.'
const CATALOG_ERROR_PREFIX = 'Não foi possível carregar a tabela Item x Emb.'

const MESSAGES = {
  invalidNumbers: 'Corrija os números destacados antes de salvar.',
  conferBanner:
    'Marque o OK? e conte os pallets de cada linha conferida, registre as avarias, preencha as etiquetas WMS e SQ e os dados do recebimento. A conferência é salva separada do preenchimento do COMEX, então não conflita com quem está editando. O fechamento da conferência fica disponível quando o COMEX fechar a parte dele.',
  conferBannerComexClosed:
    'O COMEX fechou a parte dele. Confira os itens, preencha o recebimento e use "Salvar e fechar conferência".',
  adminBannerComexClosed:
    'Aguardando conferência da logística. Parte do COMEX fechada: a logística preenche a conferência e fecha a parte dela.',
  adminBannerDone: 'Relatório concluído: COMEX e logística fecharam as partes.',
  notFilled: 'O COMEX ainda não preencheu este relatório no Portal.',
  noPackaging:
    'Itens sem tipo e peso na tabela aparecem como "Sem embalagem cadastrada". Peça ao admin para atualizar a tabela em Admin › Relatório de Carga.',
  catalogMissing:
    'A tabela Item x Emb. ainda não foi importada. Peso líquido e nº de embalagens ficam vazios até o admin importar em Admin › Relatório de Carga.',
}

function pad(value) {
  return String(value).padStart(2, '0')
}

// HH:MM no fuso local (getHours/getMinutes, sem conversão para UTC).
function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Chave de comparação do que o usuário pode ter alterado (ignora metadados de leitura).
function formKey(form) {
  return JSON.stringify({ ...form, updatedAt: null, updatedByName: '' })
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export default function CargoReportForm({ process, profile, variant, onClose }) {
  const processId = process?.id
  const role = profile?.role
  const canOpen = canOpenCargoReport(role)
  const canEdit = canEditCargoReport(role)
  const isDesktop = variant === 'desktop'
  const radioName = useId()

  const [reloadToken, setReloadToken] = useState(0)
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(null)
  const [isNew, setIsNew] = useState(false)
  const [baseKey, setBaseKey] = useState('')
  const [conference, setConference] = useState(EMPTY_CARGO_CONFERENCE)
  const [savedConference, setSavedConference] = useState(EMPTY_CARGO_CONFERENCE)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [supplierCatalog, setSupplierCatalog] = useState(null)
  const [supplierCatalogFailed, setSupplierCatalogFailed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const importInputRef = useRef(null)
  // S9-B/C: POs do consolidado (vazio nos demais tipos) e preenchimento automático (processo + FUP).
  const purchaseOrders = useMemo(() => getCargoReportPurchaseOrders(process), [process])
  const clearFeedback = useCallback(() => setFeedback(null), [])
  const autofill = useCargoReportAutofill({
    process,
    form,
    setForm,
    purchaseOrders,
    onApplied: clearFeedback,
    itemCatalog: catalog,
    supplierCatalog,
    onSupplierCatalog: setSupplierCatalog,
  })
  const refreshButtonRef = useRef(null)
  const wasPanelOpenRef = useRef(false)
  const isDraftNow = Boolean(canEdit && form && getCargoReportStage(form.status, savedConference.status) === CARGO_STAGE.draft)
  const { fetched: referenceFetched, refetch: refetchReference } = autofill
  // COMEX reaberto depois de carregar fechado: o FUP ainda não foi lido.
  useEffect(() => {
    if (loadState === 'ready' && isDraftNow && !referenceFetched) refetchReference()
  }, [loadState, isDraftNow, referenceFetched, refetchReference])
  // A prévia desmonta ao aplicar ou dispensar: o foco volta ao botão Atualizar em vez de cair no body.
  const isPanelOpen = Boolean(autofill.panel)
  useEffect(() => {
    if (wasPanelOpenRef.current && !isPanelOpen) refreshButtonRef.current?.focus()
    wasPanelOpenRef.current = isPanelOpen
  }, [isPanelOpen])
  const quantityMismatch = useMemo(
    () => (canEdit && form ? quantityMismatchByRowId(form, process) : {}),
    [canEdit, form, process]
  )

  useEffect(() => {
    if (!processId || !canOpen) return undefined
    let isMounted = true

    async function load() {
      setLoadState('loading')
      setLoadError('')
      setFeedback(null)
      setFieldErrors({})
      try {
        const [report, catalogResult, supplierResult] = await Promise.all([
          getCargoReport(processId),
          loadItemCatalogCached().then(
            (data) => ({ data, error: null }),
            (error) => ({ data: null, error })
          ),
          loadSupplierCatalogCached(),
        ])
        if (!isMounted) return

        // Conferência legada: etiquetas (S6) e rodapé do recebimento (S7) pré-preenchem a tela a partir do `current`.
        const savedConferenceData = fromConferenceDoc(report.conference, report.current?.rows, report.current)
        setCatalog(catalogResult.data)
        setSupplierCatalog(supplierResult.data)
        setSupplierCatalogFailed(Boolean(supplierResult.error))
        setCatalogError(
          catalogResult.error ? buildActionErrorMessage(CATALOG_ERROR_PREFIX, catalogResult.error) : ''
        )
        setSavedConference(savedConferenceData)
        setConference(savedConferenceData)

        // S9-C: só o admin com o COMEX em rascunho lê o FUP (as rules negam os demais).
        const isDraftStage = getCargoReportStage(report.current?.status, savedConferenceData.status) === CARGO_STAGE.draft
        const referenceResult = canEdit && isDraftStage ? await fetchCargoReference(processId) : null
        if (!isMounted) return

        if (report.current) {
          // Consolidado: a ordem do array vira a da tela (por PO) ANTES do baseKey, para nao sujar o formulario.
          const loaded = orderCargoFormByPurchaseOrder(fromCargoReportDoc(report.current), process)
          setForm(loaded)
          setBaseKey(formKey(loaded))
          setIsNew(false)
          autofill.initialize({
            reference: referenceResult?.reference,
            error: referenceResult?.error,
            fetched: referenceResult !== null,
          })
        } else {
          // Relatório novo: preenchido do processo e do FUP (itens só de um lado ficam na prévia, desmarcados).
          const registry = buildCargoRegistry({
            itemCatalog: catalogResult.data,
            supplierCatalog: supplierResult.data,
            process,
            reference: referenceResult?.reference,
          })
          const built = referenceResult
            ? buildAutofilledCargoReport(process, buildCargoSources(process, referenceResult.reference), registry)
            : { form: buildInitialCargoReport(process), pending: [] }
          const initial = orderCargoFormByPurchaseOrder(built.form, process)
          setForm(initial)
          setBaseKey(formKey(initial))
          setIsNew(true)
          autofill.initialize({
            reference: referenceResult?.reference,
            error: referenceResult?.error,
            pending: built.pending,
            fetched: referenceResult !== null,
          })
        }
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
    // `process` e `profile` só alimentam o pré-preenchimento da 1ª carga; recarregar a cada
    // render de quem chama descartaria o que o usuário digitou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId, canOpen, reloadToken])

  const rows = useMemo(() => form?.rows ?? [], [form])
  // S9-D: embalagens por item + fornecedor (peso líquido por fornecedor, tara do cadastro, cadastro rápido).
  const packagingTools = useCargoReportPackaging({
    process,
    profile,
    registry: autofill.registry,
    rows,
    setForm,
    setSupplierCatalog,
    canEdit: isDraftNow,
    onChanged: clearFeedback,
  })
  const { packaging } = packagingTools
  const derived = useMemo(
    () => rows.map((row) => deriveCargoReportRow(row, catalog, cargoPackagingContext(packaging, row.id))),
    [rows, catalog, packaging]
  )
  const alertCount = useMemo(() => countCargoReportAlerts(rows, catalog, packaging), [rows, catalog, packaging])
  // S10-I: soma dos pallets contados x total do COMEX (o total em edição ainda é texto).
  const expectedPallets = resolveCargoExpectedPallets(form?.expectedPallets)
  const palletsSummary = useMemo(
    () => summarizeCargoPallets(rows, conference, expectedPallets),
    [rows, conference, expectedPallets]
  )
  // S9-B: operações por linha do menu ⋯ (levam a origem das células, `autofill`, junto).
  const rowActions = useCargoReportRowActions({
    rows,
    setForm,
    purchaseOrders,
    onChanged: () => setFeedback(null),
    autofillRows: form?.autofill?.rows,
  })

  // COMEX fechado trava o preenchimento até o admin reabrir; a logística confere nos estados 1 e 2.
  const stage = getCargoReportStage(form?.status, savedConference.status)
  const canConferNow = canSaveCargoConference(role, stage)
  // S6/S10-I: OK?, pallets, etiquetas e observações são da logística; o admin só vê.
  const edit = useCargoConferenceEdit({ canConferNow, conference, setConference, setFeedback })

  if (!processId || !canOpen) return null

  const hasNoPackaging = derived.some((item) => item.alerts.noPackaging)
  const draftDirty = form ? formKey(form) !== baseKey : false
  const conferenceDirty = form ? cargoConferenceKey(conference, rows) !== cargoConferenceKey(savedConference, rows) : false
  // S7: o admin só grava o `current`; a logística só grava a conferência.
  const isDirty = canEdit ? draftDirty : conferenceDirty
  const canSave = canEdit ? isDirty || isNew : isDirty
  const isLimitReached = rows.length >= CARGO_REPORT_MAX_ROWS
  const canEditFields = canEdit && stage === CARGO_STAGE.draft
  // S8: erros da descarga (fim sem início, fim antes do início, mais de 24 h) só aparecem para quem edita.
  const unloadErrors = canConferNow ? validateCargoUnload(conference) : { start: '', end: '' }
  const hasUnloadError = Boolean(unloadErrors.start || unloadErrors.end)
  // S5: importar planilha só para o admin e enquanto a parte do COMEX está aberta.
  const canImport = canEditFields
  const actorName = String(profile?.name ?? profile?.email ?? '').trim()

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFeedback(null)
  }

  function changeRow(rowId, field, value) {
    setForm((current) => {
      const next = { ...current, rows: current.rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)) }
      // Consolidado: trocar o PO da linha muda o grupo dela; o array acompanha a tela.
      return field === 'po' ? orderCargoFormByPurchaseOrder(next, process) : next
    })
    setFieldErrors((current) => {
      const key = `${rowId}:${field}`
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
    setFeedback(null)
  }

  function addRow() {
    setForm((current) =>
      current.rows.length >= CARGO_REPORT_MAX_ROWS
        ? current
        : { ...current, rows: [...current.rows, createEmptyCargoReportRow(createCargoReportRowId())] }
    )
  }

  function handleImportFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportFile(file)
    setIsImportOpen(true)
  }

  // Só troca as linhas (e o tipo de carga) na tela: gravar continua sendo o "Salvar rascunho".
  function handleApplyImport(result) {
    setForm((current) => orderCargoFormByPurchaseOrder(applyCargoReportImport(current, result), process))
    setFieldErrors({})
    setIsImportOpen(false)
    setFeedback({
      kind: 'success',
      text: `Planilha importada: ${plural(result.rows.length, 'linha', 'linhas')}. Confira e clique em "Salvar rascunho" para gravar.`,
    })
  }

  // Grava a conferência com o nome de quem salva (`actorName`); a tela passa a refletir o que foi gravado.
  async function saveConference(revision, savedRows) {
    const payload = buildConferencePayload({ ...conference, revision }, savedRows, { actorName })
    await saveCargoReportConference(processId, payload, profile, {
      titleSuffix: form.titleSuffix,
      totalRows: savedRows.length,
    })
    applyPersistedConference({ ...payload, updatedAt: new Date(), updatedByName: actorName })
  }

  // Estado gravado da conferência (salvar, fechar ou reabrir): tela e base de comparação ficam iguais.
  function applyPersistedConference(next) {
    const persisted = { ...EMPTY_CARGO_CONFERENCE, ...next }
    setSavedConference(persisted)
    setConference(persisted)
    edit.clearSuggestion()
  }

  // Marca as células inválidas e mostra a mensagem (número inválido ou limite de linhas).
  function showPayloadErrors(errors) {
    const cells = {}
    for (const error of errors) {
      if (error.rowId) cells[`${error.rowId}:${error.field}`] = error.message
      else if (error.field === 'expectedPallets') cells.expectedPallets = error.message
    }
    setFieldErrors(cells)
    const limitError = errors.find((error) => error.field === 'rows')
    setFeedback({ kind: 'error', text: limitError?.message ?? MESSAGES.invalidNumbers })
  }

  async function handleSaveDraft() {
    if (!canEditFields || isSaving || !canSave) return
    setFeedback(null)
    setFieldErrors({})

    const { payload, errors } = buildCargoReportPayload(form, { catalogVersion: catalog?.exists ? catalog.version : 0 })
    if (errors.length > 0) {
      showPayloadErrors(errors)
      return
    }

    setIsSaving(true)
    try {
      await saveCargoReportDraft(processId, payload, profile)
    } catch (error) {
      setFeedback(describeCargoSaveError(error, 'draft'))
      setIsSaving(false)
      return
    }

    // O formulário passa a refletir exatamente o que foi gravado (linhas vazias descartadas).
    const saved = fromCargoReportDoc({
      ...payload,
      updatedAt: new Date(),
      updatedByName: String(profile?.name ?? profile?.email ?? '').trim(),
    })
    setForm(saved)
    setBaseKey(formKey(saved))
    setIsNew(false)

    setFeedback({ kind: 'success', text: `Rascunho salvo às ${formatClock(new Date())}. Nada foi enviado por e-mail.` })
    setIsSaving(false)
  }

  async function handleSaveConference() {
    if (!canConferNow || isSaving || !canSave) return
    setFeedback(null)
    if (hasUnloadError) {
      setFeedback({ kind: 'error', text: CARGO_CONFERENCE_MESSAGES.invalidUnload })
      return
    }
    setIsSaving(true)
    try {
      await saveConference(savedConference.revision, rows)
      setFeedback({ kind: 'success', text: `Conferência salva às ${formatClock(new Date())}.` })
    } catch (error) {
      setFeedback(describeCargoSaveError(error, 'conference'))
    }
    setIsSaving(false)
  }

  function handleDiscardConference() {
    setConference(savedConference)
    setFeedback(null)
    edit.clearSuggestion()
  }

  // O formulário passa a refletir o que foi gravado (concluir e reabrir, feitos pela barra de ações).
  function applyPersistedForm(payload, extra = {}) {
    const next = fromCargoReportDoc({
      ...payload,
      ...extra,
      updatedAt: new Date(),
      updatedByName: String(profile?.name ?? profile?.email ?? '').trim(),
    })
    setForm(next)
    setBaseKey(formKey(next))
    setIsNew(false)
  }

  function handleBack() {
    if (isDirty) setIsLeaveOpen(true)
    else onClose?.()
  }

  const backBar = (
    <div className="crf-top">
      <button type="button" className="ghost-button crf-back" onClick={handleBack}>
        ‹ Documentos
      </button>
      <h3>Relatório de Carga</h3>
    </div>
  )

  if (loadState === 'loading') {
    return (
      <div className="crf-wrap" role="status" aria-label="Carregando relatório de carga">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="crf-wrap">
        {backBar}
        <div className="error-banner error-banner--retry" role="alert">
          <span>{loadError}</span>
          <button type="button" className="ghost-button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!canEdit && isNew) {
    return (
      <div className="crf-wrap">
        {backBar}
        <EmptyState illustration="inbox" title="Relatório de carga" message={MESSAGES.notFilled} />
      </div>
    )
  }

  const editMode = canEditFields ? 'edit' : canConferNow ? 'confer' : 'view'
  const tableBadge = catalog?.exists
    ? `Tabela Item x Emb. v${catalog.version}`
    : catalogError
      ? ''
      : 'Tabela Item x Emb. não importada'
  const versionMismatch =
    catalog?.exists && form.catalogVersion > 0 && form.catalogVersion !== catalog.version
  // S9-C: nota do relatório novo (o que o Portal preencheu e de onde veio) enquanto ele não é salvo.
  const newReportNote = isNew && canEditFields ? describeCargoAutofillNote(autofill) : ''

  // Conflito oferece "Recarregar"; a barra de ações pode trazer a própria ação (ex.: "Gravar de novo").
  const feedbackAction =
    feedback?.action ??
    (feedback?.kind === 'conflict' ? { label: 'Recarregar', run: () => setReloadToken((token) => token + 1) } : null)

  // Banner por papel e estado (S7).
  let stageBanner = ''
  if (canEdit) {
    if (stage === CARGO_STAGE.comexClosed) stageBanner = MESSAGES.adminBannerComexClosed
    else if (stage === CARGO_STAGE.done) stageBanner = MESSAGES.adminBannerDone
  } else if (stage === CARGO_STAGE.draft) stageBanner = MESSAGES.conferBanner
  else if (stage === CARGO_STAGE.comexClosed) stageBanner = MESSAGES.conferBannerComexClosed
  else {
    const closedOn = formatCargoDateBr(savedConference.closedDate)
    stageBanner = `Conferência fechada${savedConference.closedByName ? ` por ${savedConference.closedByName}` : ''}${
      closedOn ? ` em ${closedOn}` : ''
    }. Para corrigir, peça ao COMEX para reabrir.`
  }

  const feedbackNode = feedback ? (
    feedback.kind === 'success' ? (
      <div className="success-banner" role="status">
        {feedback.text}
      </div>
    ) : (
      <div className={`error-banner${feedbackAction ? ' error-banner--retry' : ''}`} role="alert">
        <span>{feedback.text}</span>
        {feedbackAction ? (
          <button type="button" className="ghost-button" onClick={feedbackAction.run}>
            {feedbackAction.label}
          </button>
        ) : null}
      </div>
    )
  ) : null

  return (
    <div className={`crf-wrap${isDesktop ? '' : ' crf-wrap--mobile'}`}>
      {backBar}

      {stageBanner ? <div className="crf-note crf-note--info">{stageBanner}</div> : null}
      {catalogError ? (
        <div className="error-banner" role="alert">
          {catalogError}
        </div>
      ) : null}
      {catalog && !catalog.exists ? <div className="crf-note crf-note--info">{MESSAGES.catalogMissing}</div> : null}
      {supplierCatalogFailed ? <div className="crf-note crf-note--info">{SUPPLIER_CATALOG_ERROR_MESSAGE}</div> : null}
      {versionMismatch ? (
        <div className="crf-note crf-note--warn">
          {`Tabela Item x Emb. versão ${catalog.version} em uso. Este relatório foi calculado com a versão ${form.catalogVersion}; salvar recalcula o peso líquido e o nº de embalagens.`}
        </div>
      ) : null}
      {catalog?.exists && hasNoPackaging ? <div className="crf-note crf-note--info">{MESSAGES.noPackaging}</div> : null}
      {isLimitReached ? (
        <div className="error-banner" role="alert">
          {CARGO_REPORT_ROWS_LIMIT_MESSAGE}
        </div>
      ) : null}

      <CargoReportHeaderCard
        form={form}
        process={process}
        stage={stage}
        savedConference={savedConference}
        isNew={isNew}
        isDesktop={isDesktop}
        canEditFields={canEditFields}
        onPatch={patchForm}
        palletsSummary={palletsSummary}
        expectedError={fieldErrors.expectedPallets}
        source={
          canEditFields
            ? {
                fupInfo: autofill.fupInfo,
                supplier: autofill.supplier,
                readError: autofill.readError,
                isConsolidated: autofill.sources.context.isConsolidated,
              }
            : null
        }
      />

      <section className="crf-card crf-card--items" aria-label="Itens do relatório">
        <div className="crf-head">
          <div>
            <h3>Itens</h3>
            <p className="sub">Digite PO, código e lotes. Lote SQ, peso líquido e nº de embalagens são calculados.</p>
          </div>
          <div className="crf-badges">
            {alertCount > 0 ? (
              <span className="inline-badge inline-badge--warn">{plural(alertCount, 'alerta', 'alertas')}</span>
            ) : null}
            {tableBadge ? <span className="inline-badge">{tableBadge}</span> : null}
            {canEditFields ? (
              <button
                ref={refreshButtonRef}
                type="button"
                className="secondary-button crf-refresh-btn"
                disabled={autofill.busy}
                onClick={autofill.openRefresh}
              >
                <Icon name="refresh" size={16} />
                Atualizar do processo e do FUP
              </button>
            ) : null}
          </div>
        </div>

        {autofill.refreshError ? (
          <div className="error-banner" role="alert">
            {autofill.refreshError}
          </div>
        ) : null}
        {newReportNote ? (
          <div className="crf-note crf-note--info crf-refresh">
            <CargoInfoIcon />
            <div className="crf-refresh__body">
              <b>Relatório novo.</b> {newReportNote}
            </div>
          </div>
        ) : null}
        {canEditFields ? (
          <CargoReportRefreshPanel
            panel={autofill.panel}
            onToggle={autofill.toggleItem}
            onApply={autofill.applySelected}
            onDismiss={autofill.dismiss}
          />
        ) : null}

        <CargoReportItems
          rows={rows}
          derived={derived}
          okByRowId={conference.okByRowId}
          countOkByRowId={conference.countOkByRowId}
          palletsByRowId={conference.palletsByRowId}
          labelsByRowId={conference.labelsByRowId}
          mode={editMode}
          variant={variant}
          onChangeRow={changeRow}
          onChangeLabel={edit.changeLabel}
          onToggleOk={edit.toggleOk}
          onStepPallets={edit.stepPallets}
          onAddRow={addRow}
          canAddRow={canEditFields && !isLimitReached}
          errorsByCell={fieldErrors}
          purchaseOrders={purchaseOrders}
          isConsolidated={purchaseOrders.length > 0}
          onRowAction={canEditFields ? rowActions.handleRowAction : undefined}
          newRowIds={rowActions.newRowIds}
          focusRequest={rowActions.focusRequest}
          autofillRows={form.autofill?.rows}
          quantityMismatch={quantityMismatch}
          supplierNameByRowId={packagingTools.supplierNameByRowId}
          onQuickPackaging={canEditFields ? packagingTools.openQuick : undefined}
          onCodeBlur={canEditFields ? packagingTools.handleCodeBlur : undefined}
        />

        {isDesktop ? (
          <p className="crf-leg">
            <span>
              <b className="crf-leg__calc" />
              Coluna calculada pelo Portal (não digitar)
            </span>
            <span>
              <b className="crf-leg__warn" />
              Falta lote ou peso da embalagem
            </span>
            <span>
              <b className="crf-leg__ok" />
              OK?, pallets contados e etiquetas são da logística
            </span>
            <span>{`Limite do Portal: ${CARGO_REPORT_MAX_ROWS} linhas (${rows.length} usadas)`}</span>
          </p>
        ) : null}
      </section>

      {canEditFields && rowActions.splitRow ? (
        <CargoReportSplitDialog
          key={rowActions.splitRow.id}
          row={rowActions.splitRow}
          rowCount={rows.length}
          mobile={!isDesktop}
          onApply={rowActions.applySplit}
          onCancel={rowActions.cancelSplit}
        />
      ) : null}

      {canEditFields && packagingTools.quick ? (
        <CargoReportQuickPackagingDialog key={packagingTools.quick.code} mobile={!isDesktop} {...packagingTools.quick} />
      ) : null}

      <CargoConferenceIssuesCard
        rows={rows}
        conference={conference}
        summary={palletsSummary}
        canEdit={canConferNow}
        isDesktop={isDesktop}
        onIssueChange={edit.setIssue}
      />

      <CargoReportReceiptSection
        conference={conference}
        onChange={edit.patchConference}
        canEdit={canConferNow}
        checkedByPreview={canConferNow ? actorName : ''}
        radioName={radioName}
        unloadErrors={unloadErrors}
        statusSuggested={edit.statusSuggested}
      />

      {feedbackNode}

      <CargoReportActionBar
        process={process}
        processId={processId}
        profile={profile}
        form={form}
        conference={conference}
        savedConference={savedConference}
        catalog={catalog}
        packaging={packaging}
        stage={stage}
        isDesktop={isDesktop}
        isSaving={isSaving}
        canSave={canSave}
        conferenceDirty={conferenceDirty}
        onSaveDraft={handleSaveDraft}
        onSaveConference={handleSaveConference}
        onDiscardConference={handleDiscardConference}
        onErrors={showPayloadErrors}
        onPersisted={applyPersistedForm}
        onConferencePersisted={applyPersistedConference}
        onSuggestStatus={edit.suggestStatusForClose}
        onFeedback={setFeedback}
        renderImport={(busy) =>
          canImport ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                aria-label="Planilha .xlsx do Relatório de Carga"
                onChange={handleImportFileChange}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => importInputRef.current?.click()}
              >
                Importar de planilha
              </button>
            </>
          ) : null
        }
      />

      {canImport ? (
        <CargoReportImportDialog
          open={isImportOpen}
          file={importFile}
          catalog={catalog}
          currentRowCount={rows.filter((row) => !isCargoReportRowEmpty(row)).length}
          onChooseAnother={() => importInputRef.current?.click()}
          onClose={() => setIsImportOpen(false)}
          onApply={handleApplyImport}
        />
      ) : null}

      <ConfirmDialog
        open={isLeaveOpen}
        title="Descartar alterações?"
        message="As alterações deste relatório ainda não foram salvas."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        tone="danger"
        onConfirm={() => {
          setIsLeaveOpen(false)
          onClose?.()
        }}
        onCancel={() => setIsLeaveOpen(false)}
      />
    </div>
  )
}
