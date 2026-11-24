import { useEffect, useId, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import { getItemPackagingCatalog } from '../../services/itemPackagingCatalogRepository'
import {
  getCargoReport,
  saveCargoReportConference,
  saveCargoReportDraft,
} from '../../services/cargoReportRepository'
import { formatDateTime } from '../../utils/dateFormat'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import { CargoReportActionBar } from './CargoReportConcludeDialog'
import CargoReportImportDialog from './CargoReportImportDialog'
import CargoReportItems from './CargoReportItems'
import CargoReportReceiptSection from './CargoReportReceiptSection'
import {
  CARGO_CONFERENCE_STATUS,
  CARGO_REPORT_CONFLICT_CODE,
  CARGO_REPORT_LIMITS,
  CARGO_REPORT_MAX_ROWS,
  CARGO_REPORT_ROWS_LIMIT_MESSAGE,
  CARGO_STAGE,
  CARGO_TYPE_OPTIONS,
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
  formatCargoReportTitle,
  fromCargoReportDoc,
  fromConferenceDoc,
  getCargoReportStage,
  isCargoReportRowEmpty,
} from './cargoReportFormModel'
import { applyCargoReportImport } from './cargoReportImport'
import { formatCargoDateBr } from './cargoReportSheet'

// S3 do Relatório de Carga: formulário FR.CMX.001 dentro da aba Documentos do processo.
// COMEX (admin) preenche, salva rascunho e fecha a parte dele ("Salvar e fechar"); a logística marca o OK?
// e a contagem de cada linha, preenche as etiquetas WMS/SQ e o recebimento, e fecha a conferência dela
// (S6/S7; doc `conference`, separado para não conflitar com quem está editando). "Conferido por" é
// automático (quem salva a conferência). Estados: ver `getCargoReportStage`.
// Padrões replicados (não são util compartilhado): guard `isMounted` na carga assíncrona.

const CATALOG_TTL_MS = 5 * 60 * 1000
const EMPTY_CONFERENCE = {
  revision: 0,
  status: CARGO_CONFERENCE_STATUS.open,
  okByRowId: {},
  countOkByRowId: {},
  labelsByRowId: {},
  checkedByName: '',
  receiptStatus: '',
  receivedDate: '',
  nfNumber: '',
  notes: '',
  closedDate: '',
  closedById: '',
  closedByName: '',
  closedDocumentId: '',
  updatedAt: null,
  updatedByName: '',
}

const LOAD_ERROR_PREFIX = 'Não foi possível carregar o relatório de carga.'
const CATALOG_ERROR_PREFIX = 'Não foi possível carregar a tabela Item x Emb.'
const SAVE_ERROR_PREFIX = 'Não foi possível salvar o relatório de carga.'

const MESSAGES = {
  conflictDraft: 'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.',
  conflictConference:
    'Outra pessoa salvou a conferência. Recarregue para ver a versão atual antes de salvar de novo.',
  permissionDenied:
    'Sem permissão para editar. O COMEX preenche o relatório; a logística marca o OK? e a contagem, preenche as etiquetas e o recebimento e fecha a conferência.',
  invalidNumbers: 'Corrija os números destacados antes de salvar.',
  conferBanner:
    'Marque o OK? e a contagem de cada linha conferida, preencha as etiquetas WMS e SQ e os dados do recebimento. A conferência é salva separada do preenchimento do COMEX, então não conflita com quem está editando. O fechamento da conferência fica disponível quando o COMEX fechar a parte dele.',
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

// Cache de módulo (sessão): a tabela Item x Emb. tem ~276 KB; reaproveitada por 5 min e zerada em erro.
let catalogCache = null

function loadCatalogCached() {
  const now = Date.now()
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.promise

  const promise = getItemPackagingCatalog().catch((error) => {
    if (catalogCache?.promise === promise) catalogCache = null
    throw error
  })
  catalogCache = { promise, at: now }
  return promise
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

function conferenceKey(conference, rows) {
  const marks = rows.map((row) => [
    row.id,
    conference.okByRowId?.[row.id] === true,
    conference.countOkByRowId?.[row.id] === true,
    String(conference.labelsByRowId?.[row.id]?.wms ?? '').trim(),
    String(conference.labelsByRowId?.[row.id]?.sq ?? '').trim(),
  ])
  // "Conferido por" é automático (não digitado): fora da chave. O rodapé do recebimento entra.
  return JSON.stringify({
    marks,
    receiptStatus: conference.receiptStatus ?? '',
    receivedDate: conference.receivedDate ?? '',
    nfNumber: String(conference.nfNumber ?? '').trim(),
    notes: String(conference.notes ?? '').trim(),
  })
}

// dd/MM HH:mm no fuso local (getters locais, sem UTC); `null` -> ''.
function formatStamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${formatClock(date)}`
}

function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] ?? ''
}

function joinParts(...parts) {
  return parts.filter(Boolean).join(' ')
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// Rótulo e dica ficam fora um do outro: o nome acessível do campo é só o rótulo.
function TextField({ label, value, onChange, disabled, maxLength, hint, className = '', type = 'text', placeholder }) {
  const id = useId()
  return (
    <div className={`crf-field ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <span id={`${id}-hint`} className="auto">
          {hint}
        </span>
      ) : null}
    </div>
  )
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
  const [conference, setConference] = useState(EMPTY_CONFERENCE)
  const [savedConference, setSavedConference] = useState(EMPTY_CONFERENCE)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const importInputRef = useRef(null)

  useEffect(() => {
    if (!processId || !canOpen) return undefined
    let isMounted = true

    async function load() {
      setLoadState('loading')
      setLoadError('')
      setFeedback(null)
      setFieldErrors({})
      try {
        const [report, catalogResult] = await Promise.all([
          getCargoReport(processId),
          loadCatalogCached().then(
            (data) => ({ data, error: null }),
            (error) => ({ data: null, error })
          ),
        ])
        if (!isMounted) return

        // Conferência legada: etiquetas (S6) e rodapé do recebimento (S7) pré-preenchem a tela a partir do `current`.
        const savedConferenceData = fromConferenceDoc(report.conference, report.current?.rows, report.current)
        setCatalog(catalogResult.data)
        setCatalogError(
          catalogResult.error ? buildActionErrorMessage(CATALOG_ERROR_PREFIX, catalogResult.error) : ''
        )
        setSavedConference(savedConferenceData)
        setConference(savedConferenceData)

        if (report.current) {
          const loaded = fromCargoReportDoc(report.current)
          setForm(loaded)
          setBaseKey(formKey(loaded))
          setIsNew(false)
        } else {
          const initial = buildInitialCargoReport(process)
          setForm(initial)
          setBaseKey(formKey(initial))
          setIsNew(true)
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
  const derived = useMemo(() => rows.map((row) => deriveCargoReportRow(row, catalog)), [rows, catalog])
  const alertCount = useMemo(() => countCargoReportAlerts(rows, catalog), [rows, catalog])

  if (!processId || !canOpen) return null

  const hasNoPackaging = derived.some((item) => item.alerts.noPackaging)
  const draftDirty = form ? formKey(form) !== baseKey : false
  const conferenceDirty = form ? conferenceKey(conference, rows) !== conferenceKey(savedConference, rows) : false
  // S7: o admin só grava o `current`; a logística só grava a conferência.
  const isDirty = canEdit ? draftDirty : conferenceDirty
  const canSave = canEdit ? isDirty || isNew : isDirty
  const isLimitReached = rows.length >= CARGO_REPORT_MAX_ROWS
  const stage = getCargoReportStage(form?.status, savedConference.status)
  // COMEX fechado trava o preenchimento até o admin reabrir; a logística confere nos estados 1 e 2.
  const canEditFields = canEdit && stage === CARGO_STAGE.draft
  const canConferNow = canSaveCargoConference(role, stage)
  // S5: importar planilha só para o admin e enquanto a parte do COMEX está aberta.
  const canImport = canEditFields
  const actorName = String(profile?.name ?? profile?.email ?? '').trim()

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFeedback(null)
  }

  function changeRow(rowId, field, value) {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    }))
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

  function toggleOk(rowId) {
    if (!canConferNow) return
    setConference((current) => ({
      ...current,
      okByRowId: { ...current.okByRowId, [rowId]: current.okByRowId?.[rowId] !== true },
    }))
    setFeedback(null)
  }

  // S6: contagem e etiquetas são da logística; o admin só vê.
  function toggleCountOk(rowId) {
    if (!canConferNow) return
    setConference((current) => ({
      ...current,
      countOkByRowId: { ...current.countOkByRowId, [rowId]: current.countOkByRowId?.[rowId] !== true },
    }))
    setFeedback(null)
  }

  function patchConference(patch) {
    if (!canConferNow) return
    setConference((current) => ({ ...current, ...patch }))
    setFeedback(null)
  }

  function changeLabel(rowId, field, value) {
    if (!canConferNow) return
    setConference((current) => ({
      ...current,
      labelsByRowId: {
        ...current.labelsByRowId,
        [rowId]: { wms: '', sq: '', ...current.labelsByRowId?.[rowId], [field]: value },
      },
    }))
    setFeedback(null)
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
    setForm((current) => applyCargoReportImport(current, result))
    setFieldErrors({})
    setIsImportOpen(false)
    setFeedback({
      kind: 'success',
      text: `Planilha importada: ${plural(result.rows.length, 'linha', 'linhas')}. Confira e clique em "Salvar rascunho" para gravar.`,
    })
  }

  function describeSaveError(error, kind) {
    if (error?.code === CARGO_REPORT_CONFLICT_CODE) {
      return {
        kind: 'conflict',
        text: kind === 'conference' ? MESSAGES.conflictConference : MESSAGES.conflictDraft,
      }
    }
    if (error?.code === 'permission-denied') return { kind: 'error', text: MESSAGES.permissionDenied }
    return { kind: 'error', text: buildActionErrorMessage(SAVE_ERROR_PREFIX, error) }
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
    const persisted = { ...EMPTY_CONFERENCE, ...next }
    setSavedConference(persisted)
    setConference(persisted)
  }

  // Marca as células inválidas e mostra a mensagem (número inválido ou limite de linhas).
  function showPayloadErrors(errors) {
    const cells = {}
    for (const error of errors) {
      if (error.rowId) cells[`${error.rowId}:${error.field}`] = error.message
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
      setFeedback(describeSaveError(error, 'draft'))
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
    setIsSaving(true)
    try {
      await saveConference(savedConference.revision, rows)
      setFeedback({ kind: 'success', text: `Conferência salva às ${formatClock(new Date())}.` })
    } catch (error) {
      setFeedback(describeSaveError(error, 'conference'))
    }
    setIsSaving(false)
  }

  function handleDiscardConference() {
    setConference(savedConference)
    setFeedback(null)
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
  const cargoTypeHint = form.cargoType ? '' : 'Escolha um tipo'
  const tableBadge = catalog?.exists
    ? `Tabela Item x Emb. v${catalog.version}`
    : catalogError
      ? ''
      : 'Tabela Item x Emb. não importada'
  const versionMismatch =
    catalog?.exists && form.catalogVersion > 0 && form.catalogVersion !== catalog.version
  const comexStamp = joinParts(formatStamp(form.updatedAt), form.updatedByName ? `por ${firstName(form.updatedByName)}` : '')
  const logisticsStamp = joinParts(
    formatStamp(savedConference.updatedAt),
    savedConference.closedByName ? `por ${savedConference.closedByName}` : ''
  )
  const closedLabel = (area, word, stamp) => (stamp ? `${area}: ${word} em ${stamp}` : `${area}: ${word}`)
  const subtitle = isNew
    ? 'FR.CMX.001 · revisão 005 · Ainda não salvo'
    : `FR.CMX.001 · revisão 005 · salvo em ${formatDateTime(form.updatedAt)}${
        form.updatedByName ? ` por ${form.updatedByName}` : ''
      } · revisão ${form.revision}`

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

      <section className="crf-card" aria-label="Cabeçalho do relatório">
        <div className="crf-head">
          <div>
            <h3>{formatCargoReportTitle(form.titleSuffix)}</h3>
            <p className="sub">{subtitle}</p>
          </div>
          <div className="crf-badges">
            {stage === CARGO_STAGE.draft ? (
              <>
                <span className="inline-badge inline-badge--warn">COMEX: Rascunho</span>
                <span className="inline-badge documents-badge--neutral">Logística: Aguardando COMEX</span>
              </>
            ) : (
              <>
                <span className="inline-badge inline-badge--ok">{closedLabel('COMEX', 'Fechado', comexStamp)}</span>
                {stage === CARGO_STAGE.comexClosed ? (
                  <span className="inline-badge inline-badge--warn">Logística: Em conferência</span>
                ) : (
                  <span className="inline-badge inline-badge--ok">
                    {closedLabel('Logística', 'Fechada', logisticsStamp)}
                  </span>
                )}
              </>
            )}
            <span className="inline-badge">FR.CMX.001 R5</span>
          </div>
        </div>

        <div className="crf-grid top">
          <div className="crf-field">
            <label htmlFor={`${radioName}-duimp`}>Nº da DUIMP</label>
            <input
              id={`${radioName}-duimp`}
              type="text"
              value={process.duimpNumber ?? ''}
              placeholder="Sem DUIMP no processo"
              aria-describedby={`${radioName}-duimp-hint`}
              disabled
              readOnly
            />
            <span id={`${radioName}-duimp-hint`} className="auto">
              <Icon name="lock" size={12} /> Fixo: vem do processo
            </span>
          </div>

          <div className="crf-field" role="group" aria-label="Tipo de carga">
            <span id={`${radioName}-label`}>Tipo de carga</span>
            <div className="crf-radios" role="radiogroup" aria-labelledby={`${radioName}-label`}>
              {CARGO_TYPE_OPTIONS.map((option) => {
                const selected = form.cargoType === option.value
                return (
                  <label key={option.value} className={`crf-radio${selected ? ' on' : ''}${canEditFields ? '' : ' is-disabled'}`}>
                    <input
                      type="radio"
                      name={`${radioName}-cargo-type`}
                      value={option.value}
                      aria-label={option.label}
                      checked={selected}
                      disabled={!canEditFields}
                      onChange={() => patchForm({ cargoType: option.value })}
                    />
                    <i aria-hidden="true" />
                    <span aria-hidden="true">{isDesktop ? option.label : (option.shortLabel ?? option.label)}</span>
                  </label>
                )
              })}
            </div>
            <span className="auto muted">{cargoTypeHint}</span>
          </div>

          <TextField
            label="Título no relatório"
            value={form.titleSuffix}
            maxLength={CARGO_REPORT_LIMITS.text}
            disabled={!canEditFields}
            hint="PO / referência do processo"
            onChange={(value) => patchForm({ titleSuffix: value })}
          />
        </div>
      </section>

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
          </div>
        </div>

        <CargoReportItems
          rows={rows}
          derived={derived}
          okByRowId={conference.okByRowId}
          countOkByRowId={conference.countOkByRowId}
          labelsByRowId={conference.labelsByRowId}
          mode={editMode}
          variant={variant}
          onChangeRow={changeRow}
          onChangeLabel={changeLabel}
          onToggleOk={toggleOk}
          onToggleCountOk={toggleCountOk}
          onAddRow={addRow}
          canAddRow={canEditFields && !isLimitReached}
          errorsByCell={fieldErrors}
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
              OK?, contagem e etiquetas são da logística
            </span>
            <span>{`Limite do Portal: ${CARGO_REPORT_MAX_ROWS} linhas (${rows.length} usadas)`}</span>
          </p>
        ) : null}
      </section>

      <CargoReportReceiptSection
        conference={conference}
        onChange={patchConference}
        canEdit={canConferNow}
        checkedByPreview={canConferNow ? actorName : ''}
        radioName={radioName}
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
        stage={stage}
        isDesktop={isDesktop}
        isSaving={isSaving}
        canSave={canSave}
        conferenceDirty={conferenceDirty}
        onSaveDraft={handleSaveDraft}
        onSaveConference={handleSaveConference}
        onDiscardConference={handleDiscardConference}
        describeSaveError={describeSaveError}
        onErrors={showPayloadErrors}
        onPersisted={applyPersistedForm}
        onConferencePersisted={applyPersistedConference}
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
