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
import {
  CARGO_REPORT_CONFLICT_CODE,
  CARGO_REPORT_LIMITS,
  CARGO_REPORT_MAX_ROWS,
  CARGO_REPORT_ROWS_LIMIT_MESSAGE,
  CARGO_TYPE_OPTIONS,
  RECEIPT_STATUS_OPTIONS,
  buildCargoReportPayload,
  buildConferencePayload,
  buildInitialCargoReport,
  canConferCargoReport,
  canEditCargoReport,
  canOpenCargoReport,
  countCargoReportAlerts,
  createCargoReportRowId,
  createEmptyCargoReportRow,
  deriveCargoReportRow,
  formatCargoReportTitle,
  fromCargoReportDoc,
  fromConferenceDoc,
  isCargoReportRowEmpty,
} from './cargoReportFormModel'
import { applyCargoReportImport } from './cargoReportImport'

// S3 do Relatório de Carga: formulário FR.CMX.001 dentro da aba Documentos do processo.
// COMEX (admin) preenche e salva rascunho; a logística só marca o OK? de cada linha e informa
// quem conferiu (doc `conference`, separado para não conflitar com quem está editando).
// Padrões replicados (não são util compartilhado): guard `isMounted` na carga assíncrona.

const CATALOG_TTL_MS = 5 * 60 * 1000
const EMPTY_CONFERENCE = { revision: 0, okByRowId: {}, checkedByName: '' }

const LOAD_ERROR_PREFIX = 'Não foi possível carregar o relatório de carga.'
const CATALOG_ERROR_PREFIX = 'Não foi possível carregar a tabela Item x Emb.'
const SAVE_ERROR_PREFIX = 'Não foi possível salvar o relatório de carga.'

const MESSAGES = {
  conflictDraft: 'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.',
  conflictConference:
    'Outra pessoa salvou a conferência. Recarregue para ver a versão atual antes de salvar de novo.',
  permissionDenied:
    'Sem permissão para editar. O COMEX preenche o relatório e a logística só marca o OK? e o "Conferido por".',
  conferenceFailed: 'Rascunho salvo, mas não foi possível salvar o "Conferido por".',
  invalidNumbers: 'Corrija os números destacados antes de salvar.',
  conferBanner:
    'Marque o OK? de cada linha conferida e informe quem conferiu. A conferência é salva separada do preenchimento do COMEX, então não conflita com quem está editando.',
  notFilled: 'O COMEX ainda não preencheu este relatório no Portal.',
  noPackaging:
    'Itens sem tipo e peso na tabela aparecem como "Sem embalagem cadastrada". Peça ao admin para atualizar a tabela em Admin › Relatório de Carga.',
  catalogMissing:
    'A tabela Item x Emb. ainda não foi importada. Peso líquido e nº de embalagens ficam vazios até o admin importar em Admin › Relatório de Carga.',
  lockedForConference: 'Relatório concluído pelo COMEX. Para alterar a conferência, peça ao COMEX para reabrir.',
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
  const marks = rows.map((row) => [row.id, conference.okByRowId?.[row.id] === true])
  return JSON.stringify({ marks, name: String(conference.checkedByName ?? '').trim() })
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
  const canConfer = canConferCargoReport(role)
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

        const savedConferenceData = fromConferenceDoc(report.conference)
        setCatalog(catalogResult.data)
        setCatalogError(
          catalogResult.error ? buildActionErrorMessage(CATALOG_ERROR_PREFIX, catalogResult.error) : ''
        )
        setSavedConference(savedConferenceData)

        // Logística sem nome informado: pré-preenche só na tela com o próprio nome.
        const prefillName = !canEdit && !savedConferenceData.checkedByName ? String(profile?.name ?? '').trim() : ''
        setConference({ ...savedConferenceData, checkedByName: prefillName || savedConferenceData.checkedByName })

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
  }, [processId, canOpen, canEdit, reloadToken])

  const rows = useMemo(() => form?.rows ?? [], [form])
  const derived = useMemo(() => rows.map((row) => deriveCargoReportRow(row, catalog)), [rows, catalog])
  const alertCount = useMemo(() => countCargoReportAlerts(rows, catalog), [rows, catalog])

  if (!processId || !canOpen) return null

  const hasNoPackaging = derived.some((item) => item.alerts.noPackaging)
  const draftDirty = form ? formKey(form) !== baseKey : false
  const conferenceDirty = form ? conferenceKey(conference, rows) !== conferenceKey(savedConference, rows) : false
  const isDirty = canEdit ? draftDirty || conferenceDirty : conferenceDirty
  const canSave = canEdit ? isDirty || isNew : isDirty
  const isLimitReached = rows.length >= CARGO_REPORT_MAX_ROWS
  // S4: concluído trava o preenchimento e a conferência até o COMEX reabrir.
  const isConcluded = form?.status === 'concluido'
  const canEditFields = canEdit && !isConcluded
  const canConferNow = canConfer && !isConcluded
  // S5: importar planilha só para o admin e enquanto o relatório não está concluído.
  const canImport = canEditFields

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

  async function saveConference(revision, savedRows) {
    const payload = buildConferencePayload(
      { okByRowId: conference.okByRowId, checkedByName: conference.checkedByName, revision },
      savedRows
    )
    await saveCargoReportConference(processId, payload, profile, {
      titleSuffix: form.titleSuffix,
      totalRows: savedRows.length,
    })
    setSavedConference({
      revision: payload.revision,
      okByRowId: payload.okByRowId,
      checkedByName: payload.checkedByName,
    })
    setConference((current) => ({
      ...current,
      revision: payload.revision,
      okByRowId: payload.okByRowId,
      checkedByName: payload.checkedByName,
    }))
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

    const nameChanged =
      String(conference.checkedByName ?? '').trim() !== String(savedConference.checkedByName ?? '').trim()
    let conferenceFailed = false
    if (nameChanged) {
      try {
        await saveConference(savedConference.revision, saved.rows)
      } catch {
        conferenceFailed = true
      }
    }

    setFeedback(
      conferenceFailed
        ? { kind: 'error', text: MESSAGES.conferenceFailed }
        : { kind: 'success', text: `Rascunho salvo às ${formatClock(new Date())}. Nada foi enviado por e-mail.` }
    )
    setIsSaving(false)
  }

  async function handleSaveConference() {
    if (!canConferNow || canEdit || isSaving || !canSave) return
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
  const subtitle = isNew
    ? 'FR.CMX.001 · revisão 005 · Ainda não salvo'
    : `FR.CMX.001 · revisão 005 · salvo em ${formatDateTime(form.updatedAt)}${
        form.updatedByName ? ` por ${form.updatedByName}` : ''
      } · revisão ${form.revision}`

  // Conflito oferece "Recarregar"; a barra de ações pode trazer a própria ação (ex.: "Gravar de novo").
  const feedbackAction =
    feedback?.action ??
    (feedback?.kind === 'conflict' ? { label: 'Recarregar', run: () => setReloadToken((token) => token + 1) } : null)

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

      {!canEdit ? (
        <div className="crf-note crf-note--info">{isConcluded ? MESSAGES.lockedForConference : MESSAGES.conferBanner}</div>
      ) : null}
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
            {isConcluded ? (
              <span className="inline-badge inline-badge--ok">Concluído</span>
            ) : canEdit ? (
              <span className="inline-badge inline-badge--warn">Rascunho</span>
            ) : (
              <span className="inline-badge inline-badge--ok">Conferência da logística</span>
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
          mode={editMode}
          variant={variant}
          onChangeRow={changeRow}
          onToggleOk={toggleOk}
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
              OK? é marcado pela logística
            </span>
            <span>{`Limite do Portal: ${CARGO_REPORT_MAX_ROWS} linhas (${rows.length} usadas)`}</span>
          </p>
        ) : null}
      </section>

      <section className="crf-card" aria-label="Responsáveis e recebimento">
        <h3>Responsáveis e recebimento</h3>
        <p className="sub">Texto livre. A data de conclusão é preenchida ao concluir.</p>
        <div className="crf-foot">
          <TextField
            label="Conferido por"
            value={conference.checkedByName}
            maxLength={CARGO_REPORT_LIMITS.text}
            disabled={!canConferNow}
            onChange={(value) => {
              setConference((current) => ({ ...current, checkedByName: value }))
              setFeedback(null)
            }}
          />
          <TextField
            label="Etiquetado por"
            value={form.labeledBy}
            maxLength={CARGO_REPORT_LIMITS.text}
            disabled={!canEditFields}
            onChange={(value) => patchForm({ labeledBy: value })}
          />
          <TextField
            label="Etiqueta feita por"
            value={form.labelMadeBy}
            maxLength={CARGO_REPORT_LIMITS.text}
            disabled={!canEditFields}
            onChange={(value) => patchForm({ labelMadeBy: value })}
          />
          <div className="crf-field">
            <label htmlFor={`${radioName}-receipt`}>Status do recebimento</label>
            <select
              id={`${radioName}-receipt`}
              value={form.receiptStatus}
              disabled={!canEditFields}
              onChange={(event) => patchForm({ receiptStatus: event.target.value })}
            >
              {RECEIPT_STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'none'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Data de recebimento"
            type="date"
            value={form.receivedDate}
            disabled={!canEditFields}
            onChange={(value) => patchForm({ receivedDate: value })}
          />
          <TextField
            label="Nº da NF"
            value={form.nfNumber}
            maxLength={CARGO_REPORT_LIMITS.nf}
            disabled={!canEditFields}
            onChange={(value) => patchForm({ nfNumber: value })}
          />
        </div>
        <div className="crf-field crf-field--notes">
          <label htmlFor={`${radioName}-notes`}>Observações</label>
          <textarea
            id={`${radioName}-notes`}
            value={form.notes}
            maxLength={CARGO_REPORT_LIMITS.notes}
            disabled={!canEditFields}
            onChange={(event) => patchForm({ notes: event.target.value })}
          />
        </div>
      </section>

      {feedbackNode}

      <CargoReportActionBar
        process={process}
        processId={processId}
        profile={profile}
        form={form}
        conference={conference}
        savedConference={savedConference}
        catalog={catalog}
        isDesktop={isDesktop}
        isSaving={isSaving}
        canSave={canSave}
        conferenceDirty={conferenceDirty}
        onSaveDraft={handleSaveDraft}
        onSaveConference={handleSaveConference}
        onDiscardConference={handleDiscardConference}
        saveConference={saveConference}
        describeSaveError={describeSaveError}
        onErrors={showPayloadErrors}
        onPersisted={applyPersistedForm}
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
