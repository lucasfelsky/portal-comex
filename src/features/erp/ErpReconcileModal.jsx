import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import TabButton from '../../components/TabButton'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import { getLocalDateKey } from '../processes/shipmentConfirmation'
import { BLOCKED_MESSAGES, ERP_ONLY_CATEGORIES, runErpReconciliation } from './reconcileErp.js'
import { formatErpReferenceStamp } from './erpReference.js'
import ErpCreateProcessesPanel from './ErpCreateProcessesPanel.jsx'
import { buildErpCreationCandidates, buildErpCreationRecheck } from './erpProcessDraft.js'
import {
  ERP_DIFF_KIND_LABELS,
  ERP_FLAG_LABELS,
  ERP_MATCH_RULE_LABELS,
  exportErpReconciliationToXlsx,
} from './erpReconciliationExport.js'

// Importar do DBCorp (conciliacao ERP x Portal, F1 + PR 3). O modal recebe os
// processos ja carregados na pagina e as FONTES como objetos `ErpSource`
// (`inputKind: 'file' | 'request'`): trocar a planilha pela API do DBCorp (F5)
// nao muda nada daqui. Compara a fonte com os processos (nenhum dado de
// processo e' alterado) e, logo depois, chama `onSaveReference(result)` — um
// callback injetado pela pagina — para guardar a planilha como REFERENCIA do
// ERP (avisos "ERP" no detalhe). O modal nao conhece o servico. Se o admin
// pedir, baixa o resultado em .xlsx.
//
// F3 (criar processos): com o callback `onCreateProcesses` (injetado pela pagina,
// que e' a dona do servico) o modal ganha a aba "Criar processos". O modal monta
// os rascunhos pelo nucleo puro, entrega ao callback os escolhidos (com a funcao
// `recheck`, que reconcilia de novo com a lista fresca) e, no fim, concilia de novo
// e regrava a referencia do ERP. Nada aqui grava processo.

const TABS = [
  { id: 'summary', label: 'Resumo' },
  { id: 'diffs', label: 'Divergências' },
  { id: 'erpOnly', label: 'Só no ERP' },
  { id: 'portalOnly', label: 'Só no Portal' },
  { id: 'warnings', label: 'Avisos' },
]

const KIND_BADGE_CLASS = {
  divergente: 'inline-badge--danger',
  portal_sem_dado: 'inline-badge--warn',
  erp_atrasado: 'inline-badge--warn',
  erp_conflito: 'inline-badge--warn',
  erp_sem_dado: 'inline-badge--warn',
  formato: '',
  informativo: '',
}

const PORTAL_EMPTY_MESSAGE = BLOCKED_MESSAGES.lista_portal_vazia

// Lista vazia estavel (a mesma referencia a cada render: entra nas dependencias do useMemo).
const NO_PROCESSES = []

function isVisibleDiff(diff, showMinor) {
  return diff.counts || diff.kind === 'erp_sem_dado' || showMinor
}

function SummaryItem({ label, value, muted = false }) {
  return (
    <div className={`erp-reconcile__metric${muted ? ' erp-reconcile__metric--muted' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// "27" ou, com casados arquivados, "27 (1 arquivado)" / "27 (2 arquivados)".
function formatMatched(summary) {
  const archived = summary.matchedArchived ?? 0
  if (archived <= 0) return summary.matched
  return `${summary.matched} (${archived} ${archived === 1 ? 'arquivado' : 'arquivados'})`
}

function SummaryTab({ result }) {
  const { summary, sourceInfo } = result
  return (
    <div className="erp-reconcile__section">
      <p className="erp-reconcile__meta">
        Fonte: <strong>{sourceInfo.label || sourceInfo.source || '—'}</strong>
        {sourceInfo.fileName ? <> · Arquivo: <strong>{sourceInfo.fileName}</strong></> : null}
        {sourceInfo.fetchedAt ? <> · Carregado em {sourceInfo.fetchedAt}</> : null}
        {sourceInfo.generatedOn ? <> · Conciliado em {sourceInfo.generatedOn}</> : null}
      </p>
      <dl className="erp-reconcile__metrics">
        <SummaryItem label="Linhas do ERP" value={summary.erpRows} />
        <SummaryItem label="Embarques no ERP" value={summary.shipments} />
        <SummaryItem label="Embarques ativos" value={summary.activeShipments} />
        <SummaryItem label="Processos casados" value={formatMatched(summary)} />
        <SummaryItem label="Casados com divergências" value={summary.matchedWithDiffs} />
        <SummaryItem label="Campos sem dado no ERP" value={summary.erpMissingFields} />
        <SummaryItem label="Só no ERP" value={summary.erpOnly} />
        <SummaryItem label="Só no Portal (não encontrado nesta planilha)" value={summary.portalOnly} />
        <SummaryItem label="Avisos" value={summary.warnings} />
      </dl>
      <h4 className="erp-reconcile__subtitle">Só no ERP, por categoria</h4>
      <dl className="erp-reconcile__metrics">
        {ERP_ONLY_CATEGORIES.map((category) => (
          <SummaryItem
            key={category.key}
            label={category.label}
            value={summary.erpOnlyByCategory[category.key] ?? 0}
            muted={!summary.erpOnlyByCategory[category.key]}
          />
        ))}
      </dl>
    </div>
  )
}

function DiffsTab({ result, showMinor }) {
  const entries = result.matched
    .map((entry) => ({ entry, diffs: entry.diffs.filter((diff) => isVisibleDiff(diff, showMinor)) }))
    .filter((item) => item.diffs.length > 0)
  const hiddenCount = showMinor
    ? 0
    : result.matched.reduce(
        (total, entry) => total + entry.diffs.filter((diff) => !isVisibleDiff(diff, false)).length,
        0
      )

  if (entries.length === 0) {
    return (
      <div className="empty-state" role="status">
        <strong>Nenhuma divergência nos processos casados.</strong>
        {hiddenCount > 0 ? (
          <p>Há diferenças de formato ou informativas: ligue a opção acima para vê-las.</p>
        ) : null}
      </div>
    )
  }

  return (
    <ul className="erp-reconcile__list">
      {entries.map(({ entry, diffs }) => (
        <li key={entry.processId || entry.processName} className="erp-reconcile__card">
          <div className="erp-reconcile__card-head">
            <strong>{entry.processName || entry.processId}</strong>
            <span className="inline-badge">{entry.category}</span>
            {entry.archived ? <span className="inline-badge inline-badge--warn">Arquivado</span> : null}
            <span className="erp-reconcile__muted">
              Embarque {entry.shipmentKey} · {ERP_MATCH_RULE_LABELS[entry.matchRule] ?? entry.matchRule}
            </span>
          </div>
          <ul className="erp-reconcile__diffs">
            {diffs.map((diff, index) => (
              <li key={`${diff.field}-${diff.label}-${index}`} className="erp-reconcile__diff">
                <div className="erp-reconcile__diff-head">
                  <strong>{diff.label}</strong>
                  <span className={`inline-badge ${KIND_BADGE_CLASS[diff.kind] ?? ''}`.trim()}>
                    {ERP_DIFF_KIND_LABELS[diff.kind] ?? diff.kind}
                  </span>
                  <span className="erp-reconcile__muted">{diff.authorityLabel}</span>
                </div>
                <div className="erp-reconcile__values">
                  <span>Portal: <strong>{diff.portal || '—'}</strong></span>
                  <span>ERP: <strong>{diff.erp || '—'}</strong></span>
                </div>
                {diff.note ? <p className="erp-reconcile__note">{diff.note}</p> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function ErpOnlyTab({ result }) {
  if (result.erpOnly.length === 0) {
    return (
      <div className="empty-state" role="status">
        <strong>Nenhum embarque ativo do ERP está fora do Portal.</strong>
      </div>
    )
  }
  return (
    <div className="erp-reconcile__section">
      {ERP_ONLY_CATEGORIES.map((category) => {
        const items = result.erpOnly.filter((item) => item.category === category.key)
        if (items.length === 0) return null
        return (
          <section key={category.key} className="erp-reconcile__group">
            <h4 className="erp-reconcile__subtitle">
              {category.label} ({items.length})
            </h4>
            <ul className="erp-reconcile__list">
              {items.map((item) => (
                <li key={`${item.kind}|${item.shipmentKey}`} className="erp-reconcile__card">
                  <div className="erp-reconcile__card-head">
                    <strong>{item.shipmentKey}</strong>
                    <span className="inline-badge">{item.kind}</span>
                    {item.flags.map((flag) => (
                      <span key={flag} className="inline-badge inline-badge--warn">
                        {ERP_FLAG_LABELS[flag] ?? flag}
                      </span>
                    ))}
                  </div>
                  <div className="erp-reconcile__values">
                    <span>Pedidos: <strong>{item.pedidos.join(', ') || '—'}</strong></span>
                    <span>Exportador: <strong>{item.exporter || '—'}</strong></span>
                    <span>Status: <strong>{item.statuses.join(', ') || '—'}</strong></span>
                    <span>ETD: <strong>{item.etd || '—'}</strong></span>
                    <span>ETA: <strong>{item.eta || '—'}</strong></span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function PortalOnlyTab({ result }) {
  if (result.portalOnly.length === 0) {
    return (
      <div className="empty-state" role="status">
        <strong>Todos os processos do Portal foram encontrados nesta planilha.</strong>
      </div>
    )
  }
  return (
    <div className="erp-reconcile__section">
      <p className="erp-reconcile__muted">Não encontrado nesta planilha (o recorte do export é desconhecido).</p>
      <ul className="erp-reconcile__list">
        {result.portalOnly.map((item) => (
          <li key={item.processId || item.processName} className="erp-reconcile__card">
            <div className="erp-reconcile__card-head">
              <strong>{item.processName || item.processId}</strong>
              <span className="inline-badge">{item.category}</span>
              {item.archived ? <span className="inline-badge inline-badge--warn">Arquivado</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Avisos de embarques ja concluidos no ERP ficam ocultos por padrao (ruido do
// historico); o export leva todos. `visibleWarnings` ja vem filtrada.
function WarningsTab({ totalCount, visibleWarnings, concludedCount, showConcluded, onToggleConcluded }) {
  const hiddenCount = showConcluded ? 0 : concludedCount
  let list
  if (visibleWarnings.length === 0) {
    list = (
      <div className="empty-state" role="status">
        <strong>{totalCount === 0 ? 'Nenhum aviso.' : 'Nenhum aviso de embarque ativo.'}</strong>
      </div>
    )
  } else {
    list = (
      <ul className="erp-reconcile__list">
        {visibleWarnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`} className="erp-reconcile__card">
            <div className="erp-reconcile__card-head">
              <span className="inline-badge inline-badge--warn">{warning.code}</span>
              <span>{warning.message}</span>
            </div>
          </li>
        ))}
      </ul>
    )
  }
  if (concludedCount === 0) return list

  return (
    <div className="erp-reconcile__section">
      {hiddenCount > 0 ? (
        <p className="erp-reconcile__muted">
          {hiddenCount === 1
            ? '1 aviso de embarque concluído oculto.'
            : `${hiddenCount} avisos de embarques concluídos ocultos.`}
        </p>
      ) : null}
      <label className="erp-reconcile__toggle">
        <input
          type="checkbox"
          checked={showConcluded}
          onChange={(event) => onToggleConcluded(event.target.checked)}
        />
        <span>Mostrar avisos de embarques concluídos ({concludedCount})</span>
      </label>
      {list}
    </div>
  )
}

// So' renderiza o resultado (sem estado de fonte/arquivo): abas por TabButton.
// `createTab` (F3, opcional): { count, content } acrescenta a aba "Criar processos"
// depois de "Só no ERP"; sem ele nada muda.
export function ErpReconcileResults({ result, showMinor = false, createTab = null }) {
  const [tab, setTab] = useState('summary')
  const [showConcludedWarnings, setShowConcludedWarnings] = useState(false)

  if (!result) return null
  if (result.blocked) {
    return <div className="error-banner">{result.blockedMessage || PORTAL_EMPTY_MESSAGE}</div>
  }

  const concludedCount = result.warnings.filter((warning) => warning.concludedShipment).length
  const visibleWarnings = result.warnings.filter(
    (warning) => showConcludedWarnings || !warning.concludedShipment
  )
  const counts = {
    diffs: result.matched.filter((entry) => entry.diffs.some((diff) => isVisibleDiff(diff, showMinor))).length,
    erpOnly: result.erpOnly.length,
    portalOnly: result.portalOnly.length,
    warnings: visibleWarnings.length,
    create: createTab ? createTab.count : undefined,
  }
  const tabs = createTab
    ? [...TABS.slice(0, 3), { id: 'create', label: 'Criar processos' }, ...TABS.slice(3)]
    : TABS

  return (
    <div className="erp-reconcile__results">
      <div className="erp-reconcile__tabs" role="group" aria-label="Seções do resultado">
        {tabs.map((item) => (
          <TabButton key={item.id} active={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
            {counts[item.id] !== undefined ? ` (${counts[item.id]})` : ''}
          </TabButton>
        ))}
      </div>
      {tab === 'summary' ? <SummaryTab result={result} /> : null}
      {tab === 'diffs' ? <DiffsTab result={result} showMinor={showMinor} /> : null}
      {tab === 'erpOnly' ? <ErpOnlyTab result={result} /> : null}
      {tab === 'create' && createTab ? createTab.content : null}
      {tab === 'portalOnly' ? <PortalOnlyTab result={result} /> : null}
      {tab === 'warnings' ? (
        <WarningsTab
          totalCount={result.warnings.length}
          visibleWarnings={visibleWarnings}
          concludedCount={concludedCount}
          showConcluded={showConcludedWarnings}
          onToggleConcluded={setShowConcludedWarnings}
        />
      ) : null}
    </div>
  )
}

function pluralProcesses(count) {
  return `${count} ${count === 1 ? 'processo' : 'processos'}`
}

// "Referência do ERP salva: 3 processos." (+ " K sem aviso (embarque grande demais).")
function formatSavedReference(counts) {
  const skipped = counts?.hintsSkipped ?? 0
  const base = `Referência do ERP salva: ${pluralProcesses(counts?.hints ?? 0)}.`
  return skipped > 0 ? `${base} ${skipped} sem aviso (embarque grande demais).` : base
}

// "Referência atual: planilha de DD/MM/AAAA HH:mm" — SO' a partir da prop (a
// pagina e' a dona do estado da referencia; nao ha segunda fonte aqui).
function formatCurrentReference(referenceInfo) {
  if (!referenceInfo) return 'Nenhuma referência do ERP salva ainda.'
  // Importacoes ao mesmo tempo (varios lotes) deixaram hints faltando: nenhum aviso
  // vale ate uma nova importacao completa.
  if (referenceInfo.incomplete) {
    return 'A referência do ERP salva está incompleta (outra importação gravou ao mesmo tempo). Importe a planilha de novo.'
  }
  const stamp = formatErpReferenceStamp(referenceInfo.updatedAtMs, { withTime: true })
  return stamp ? `Referência atual: planilha de ${stamp}` : 'Referência atual: planilha salva (sem data).'
}

export default function ErpReconcileModal({
  open,
  onClose,
  processes,
  sources,
  onSaveReference,
  referenceInfo = null,
  isSavingReference = false,
  onCreateProcesses,
  isCreatingProcesses = false,
}) {
  const sourceList = Array.isArray(sources) ? sources : []
  const processList = Array.isArray(processes) ? processes : NO_PROCESSES
  const [sourceId, setSourceId] = useState(sourceList[0]?.id ?? '')
  const [phase, setPhase] = useState('idle') // idle | loading | done
  const [savePhase, setSavePhase] = useState('idle') // idle | saving | saved | failed
  const [saveCounts, setSaveCounts] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [showMinor, setShowMinor] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState('')
  // F3: criacao de processos (so' com `onCreateProcesses`).
  const [isCreatingLocal, setIsCreatingLocal] = useState(false)
  const [createProgress, setCreateProgress] = useState(null)
  const [createSummary, setCreateSummary] = useState(null)
  const [createError, setCreateError] = useState('')
  const creatingRef = useRef(false)
  // Ultima conciliacao bem-sucedida: a planilha lida, a fonte e o dia. Reconferir e
  // conciliar de novo depois de criar usa a MESMA planilha com a lista fresca.
  const lastRunRef = useRef(null)
  const fileLabelId = useId()
  const fileStatusId = useId()
  const fileInputRef = useRef(null)
  const runIdRef = useRef(0)
  const isMountedRef = useRef(true)

  // Padrao isMounted + id da execucao: um carregamento que termina depois de
  // fechar o modal (ou de iniciar outro) nao escreve no estado.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const source = sourceList.find((item) => item.id === sourceId) ?? sourceList[0] ?? null
  const isPortalEmpty = processList.length === 0
  const isLoading = phase === 'loading'
  // A trava vem da PAGINA (`isSavingReference`): o modal continua montado ao
  // fechar, e o estado local zera no fechamento, mas a gravacao segue em voo.
  const isSaving = savePhase === 'saving' || isSavingReference
  // A trava de criacao tambem vem da PAGINA (`isCreatingProcesses`): ao reabrir o
  // modal com o lote ainda em voo, o estado local ja zerou.
  const isCreating = isCreatingLocal || isCreatingProcesses
  const isFileDisabled = isLoading || isPortalEmpty || isSaving || isCreating
  const canCreateProcesses = typeof onCreateProcesses === 'function' && Boolean(result) && !result.blocked
  const creationCandidates = useMemo(
    () =>
      canCreateProcesses
        ? buildErpCreationCandidates(result, { today: result.sourceInfo?.generatedOn ?? '', processes: processList })
        : [],
    [canCreateProcesses, result, processList]
  )

  // Grava a planilha como referencia do ERP. A conciliacao ja esta na tela: uma
  // falha aqui nunca apaga o resultado.
  async function saveReference(next, runId) {
    setSavePhase('saving')
    setSaveError('')
    setSaveCounts(null)
    try {
      const saved = await onSaveReference(next)
      if (!isMountedRef.current || runId !== runIdRef.current) return
      setSaveCounts(saved?.counts ?? null)
      setSavePhase('saved')
    } catch (saveFailure) {
      if (!isMountedRef.current || runId !== runIdRef.current) return
      setSaveError(
        buildActionErrorMessage('Conciliação ok, mas não foi possível salvar a referência do ERP.', saveFailure)
      )
      setSavePhase('failed')
    }
  }

  async function runSource(input) {
    if (!source || isPortalEmpty) return
    runIdRef.current += 1
    const runId = runIdRef.current
    setPhase('loading')
    setSavePhase('idle')
    setSaveError('')
    setSaveCounts(null)
    setError('')
    setResult(null)
    setCreateProgress(null)
    setCreateSummary(null)
    setCreateError('')
    lastRunRef.current = null
    try {
      const loaded = await source.load(input)
      const today = getLocalDateKey(new Date())
      const next = runErpReconciliation({
        loaded,
        processes: processList,
        today,
        source,
      })
      if (!isMountedRef.current || runId !== runIdRef.current) return
      lastRunRef.current = { loaded, source, today }
      setResult(next)
      setPhase('done')
      const canSave = !next.blocked && next.summary.erpRows > 0 && processList.length > 0
      if (canSave && typeof onSaveReference === 'function') await saveReference(next, runId)
    } catch (loadError) {
      if (!isMountedRef.current || runId !== runIdRef.current) return
      setError(buildActionErrorMessage('Não foi possível conciliar com o ERP.', loadError))
      setPhase('idle')
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setSelectedFileName(file.name || '')
    try {
      await runSource(file)
    } finally {
      // Permite escolher o mesmo arquivo de novo.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Cria os processos escolhidos pelo callback da pagina. O modal nao conhece o
  // servico: entrega `{ key, process }` por rascunho e a funcao `recheck`, que
  // reconcilia a MESMA planilha com a lista fresca que a pagina acabou de ler.
  async function handleCreateProcesses(drafts) {
    const snapshot = lastRunRef.current
    if (typeof onCreateProcesses !== 'function' || !snapshot) return
    if (creatingRef.current || isCreatingProcesses) return
    creatingRef.current = true
    setIsCreatingLocal(true)
    const runId = runIdRef.current
    const list = Array.isArray(drafts) ? drafts : []
    const isCurrentRun = () => isMountedRef.current && runId === runIdRef.current
    setCreateError('')
    setCreateSummary(null)
    setCreateProgress({ done: 0, total: list.length })

    const recheck = (fresh) =>
      buildErpCreationRecheck(
        runErpReconciliation({ loaded: snapshot.loaded, processes: fresh, today: snapshot.today, source: snapshot.source }),
        { today: snapshot.today, processes: fresh }
      )
    const onProgress = (value) => {
      if (isCurrentRun()) setCreateProgress(value)
    }

    try {
      const outcome = await onCreateProcesses(
        list.map((draft) => ({ key: draft.key, process: draft.process })),
        { onProgress, recheck }
      )
      if (isCurrentRun()) {
        setCreateSummary(outcome)
        if (Array.isArray(outcome?.processes) && outcome.processes.length > 0) {
          const next = runErpReconciliation({
            loaded: snapshot.loaded,
            processes: outcome.processes,
            today: snapshot.today,
            source: snapshot.source,
          })
          setResult(next)
          // D-F3-3: os criados passam a ter aviso "ERP" e deixam de contar como "so' no ERP".
          const created = Array.isArray(outcome.created) ? outcome.created.length : 0
          if (created > 0 && typeof onSaveReference === 'function' && !next.blocked) {
            await saveReference(next, runId)
          }
        }
      }
    } catch (createFailure) {
      if (isCurrentRun()) {
        setCreateError(buildActionErrorMessage('Não foi possível criar os processos.', createFailure))
      }
    } finally {
      creatingRef.current = false
      if (isMountedRef.current) {
        setIsCreatingLocal(false)
        if (runId === runIdRef.current) setCreateProgress(null)
      }
    }
  }

  async function handleExport() {
    if (!result || result.blocked) return
    setIsExporting(true)
    setError('')
    try {
      await exportErpReconciliationToXlsx(result, new Date())
    } catch (exportError) {
      if (isMountedRef.current) {
        setError(buildActionErrorMessage('Não foi possível exportar o resultado.', exportError))
      }
    } finally {
      if (isMountedRef.current) setIsExporting(false)
    }
  }

  function handleClose() {
    runIdRef.current += 1
    setPhase('idle')
    setSavePhase('idle')
    setSaveError('')
    setSaveCounts(null)
    setError('')
    setResult(null)
    setShowMinor(false)
    setIsExporting(false)
    setSelectedFileName('')
    // A criacao em voo continua na pagina: aqui so' some o que o modal mostrava.
    setCreateProgress(null)
    setCreateSummary(null)
    setCreateError('')
    lastRunRef.current = null
    onClose?.()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar do DBCorp" wide>
      <div className="erp-reconcile">
        <p className="erp-reconcile__hint">
          {typeof onCreateProcesses === 'function'
            ? 'A planilha vira a referência do ERP para os avisos. Processos existentes não são alterados; novos processos só são criados na aba Criar processos, depois da sua confirmação.'
            : 'A planilha vira a referência do ERP para os avisos nos processos. Nenhum dado dos processos é alterado.'}
        </p>
        <p className="erp-reconcile__hint">{formatCurrentReference(referenceInfo)}</p>

        {isPortalEmpty ? <div className="error-banner">{PORTAL_EMPTY_MESSAGE}</div> : null}

        <div className="erp-reconcile__source">
          {sourceList.length > 1 ? (
            <label className="erp-reconcile__field">
              <span>Fonte</span>
              <select value={source?.id ?? ''} onChange={(event) => setSourceId(event.target.value)} disabled={isLoading}>
                {sourceList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {source && source.inputKind === 'file' ? (
            <div className="erp-reconcile__field erp-reconcile__file">
              <span id={fileLabelId}>Arquivo ({source.label})</span>
              <div className="file-picker">
                <label
                  className={`ghost-button file-picker__button${isFileDisabled ? ' file-picker__button--disabled' : ''}`}
                >
                  <input
                    className="file-picker__input"
                    ref={fileInputRef}
                    type="file"
                    accept={source.accept}
                    onChange={handleFileChange}
                    disabled={isFileDisabled}
                    aria-labelledby={fileLabelId}
                    aria-describedby={fileStatusId}
                  />
                  Escolher arquivo
                </label>
                <span className="file-picker__status" id={fileStatusId}>
                  {selectedFileName || 'Nenhum arquivo escolhido'}
                </span>
              </div>
            </div>
          ) : null}

          {source && source.inputKind === 'request' ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => runSource(undefined)}
              disabled={isLoading || isPortalEmpty || isSaving || isCreating}
            >
              Carregar de {source.label}
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="empty-state" role="status">
            <strong>Conciliando…</strong>
            <p>Lendo a fonte e comparando com os processos do Portal.</p>
          </div>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}

        {savePhase === 'saving' ? (
          <div className="empty-state" role="status">
            <strong>Salvando a referência do ERP…</strong>
          </div>
        ) : null}

        {savePhase === 'idle' && isSavingReference ? (
          <div className="empty-state" role="status">
            <strong>Uma importação anterior ainda está salvando a referência do ERP.</strong>
          </div>
        ) : null}

        {savePhase === 'saved' ? (
          <div className="success-banner" role="status">
            {formatSavedReference(saveCounts)}
          </div>
        ) : null}

        {savePhase === 'failed' ? <div className="error-banner">{saveError}</div> : null}

        {phase === 'done' && result ? (
          <>
            {result.blocked ? null : (
              <label className="erp-reconcile__toggle">
                <input
                  type="checkbox"
                  checked={showMinor}
                  onChange={(event) => setShowMinor(event.target.checked)}
                />
                <span>Mostrar diferenças de formato/informativas</span>
              </label>
            )}
            <ErpReconcileResults
              result={result}
              showMinor={showMinor}
              createTab={
                canCreateProcesses
                  ? {
                      count: creationCandidates.filter((draft) => draft.creatable).length,
                      content: (
                        <ErpCreateProcessesPanel
                          candidates={creationCandidates}
                          disabled={isLoading || isSaving || isPortalEmpty || isCreating}
                          isCreating={isCreating}
                          progress={createProgress}
                          summary={createSummary}
                          error={createError}
                          portalOnlyCount={result.portalOnly.length}
                          onConfirm={handleCreateProcesses}
                        />
                      ),
                    }
                  : null
              }
            />
          </>
        ) : null}

        <div className="erp-reconcile__actions">
          <button type="button" className="ghost-button" onClick={handleClose}>
            Fechar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleExport}
            disabled={!result || Boolean(result.blocked) || isExporting || isLoading}
          >
            {isExporting ? 'Exportando…' : 'Exportar resultado'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
