import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ERP_BLOCK_REASON_LABELS,
  ERP_CREATE_TYPE_FILTERS,
  formatKgBr,
  formatProcessCount,
} from './erpProcessDraft.js'

// Aba "Criar processos" do modal "Importar do DBCorp" (F3). So' apresenta e
// coleta a escolha do admin: os rascunhos chegam prontos (`candidates`, do nucleo
// puro `erpProcessDraft.js`) e a gravacao sai por `onConfirm`, que o modal liga ao
// callback `onCreateProcesses` da pagina. Este arquivo importa so' `react` e o
// nucleo puro: nenhum servico, nenhuma rede.

// 'AAAA-MM-DD' -> 'DD/MM/AAAA' por fatiamento de texto (sem objeto Date: nao ha
// virada de dia por fuso).
function formatDateBr(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—'
}

function formatItems(preview) {
  const count = preview.itemCount
  return `${count} ${count === 1 ? 'item' : 'itens'} · ${formatKgBr(preview.totalKg)} kg`
}

function formatResultSummary(summary) {
  const created = summary.created.length
  const skipped = summary.skipped.length
  const failed = summary.failed.length
  return [
    `${formatProcessCount(created)} ${created === 1 ? 'criado' : 'criados'}`,
    `${skipped} ${skipped === 1 ? 'pulado' : 'pulados'}`,
    `${failed} com erro`,
  ].join(' · ')
}

// Checkbox "Selecionar todos": `indeterminate` so' existe como propriedade do DOM.
function SelectAllCheckbox({ label, checked, partial, disabled, onChange }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial
  }, [partial])
  return (
    <label className="erp-reconcile__toggle">
      <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  )
}

function CreateRow({ draft, selected, disabled, onToggle }) {
  const { preview } = draft
  return (
    <li className="erp-reconcile__card erp-create__row">
      <div className="erp-reconcile__card-head">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={() => onToggle(draft.key)}
          aria-label={preview.name}
        />
        <strong>{preview.name}</strong>
        <span className="inline-badge">{preview.badge}</span>
        {preview.shipped ? <span className="inline-badge">Embarque confirmado</span> : null}
        {preview.duimp ? <span className="inline-badge">DUIMP</span> : null}
        {draft.needsReview ? <span className="inline-badge inline-badge--warn">Conferir antes</span> : null}
      </div>
      <div className="erp-reconcile__values">
        <span>Fornecedor: <strong>{preview.supplierLabel || '—'}</strong></span>
        <span>Navio / viagem: <strong>{preview.vesselLabel || '—'}</strong></span>
        <span>ETD: <strong>{formatDateBr(preview.etd)}</strong></span>
        <span>ETA: <strong>{formatDateBr(preview.eta)}</strong></span>
        <span>POs: <strong>{preview.orderLabels.join(' · ') || '—'}</strong></span>
        <span><strong>{formatItems(preview)}</strong></span>
      </div>
      {draft.warnings.length > 0 ? (
        <ul className="erp-create__warnings">
          {draft.warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

// Aviso (nao bloqueia): processo do Portal sem embarque casado pode ser um destes
// embarques gravado com outro tipo ou nome; criar de novo duplicaria.
function PortalOnlyNotice({ count }) {
  if (!count) return null
  return (
    <p className="erp-reconcile__note" role="note">
      {count === 1 ? '1 processo do Portal não casou' : `${count} processos do Portal não casaram`} com nenhum embarque
      desta planilha (aba &quot;Só no Portal&quot;). Se algum deles for um destes embarques gravado com outro tipo ou
      nome, criar de novo duplica o processo: confira antes.
    </p>
  )
}

function ResultList({ title, entries, describe }) {
  if (entries.length === 0) return null
  return (
    <section className="erp-reconcile__group">
      <h5 className="erp-reconcile__subtitle">{title} ({entries.length})</h5>
      <ul className="erp-create__result-list">
        {entries.map((entry) => (
          <li key={entry.key}>{describe(entry)}</li>
        ))}
      </ul>
    </section>
  )
}

function ResultRegion({ summary, titleRef }) {
  return (
    <section className="erp-reconcile__section erp-create__result" aria-labelledby="erp-create-result-title">
      <h4 className="erp-reconcile__subtitle" id="erp-create-result-title" ref={titleRef} tabIndex={-1}>
        Resultado da criação
      </h4>
      <p className="erp-reconcile__note" role="status">{formatResultSummary(summary)}</p>
      <ResultList
        title="Criados"
        entries={summary.created}
        describe={(entry) =>
          entry.note ? `${entry.name} (${entry.id}) — Criado (${entry.note})` : `${entry.name} (${entry.id})`
        }
      />
      <ResultList
        title="Pulados (já existiam)"
        entries={summary.skipped}
        describe={(entry) => (entry.existingName ? `${entry.name} — já existe: ${entry.existingName}` : entry.name)}
      />
      <ResultList title="Com erro" entries={summary.failed} describe={(entry) => `${entry.name}: ${entry.message}`} />
      {summary.auditFailed ? (
        <p className="erp-reconcile__muted">O registro de auditoria do lote não foi gravado (os processos foram criados).</p>
      ) : null}
      {summary.refreshFailed ? (
        <p className="erp-reconcile__muted">
          A lista de processos não pôde ser recarregada; o resultado usa a lista local. Recarregue a página.
        </p>
      ) : null}
    </section>
  )
}

export default function ErpCreateProcessesPanel({
  candidates,
  disabled = false,
  isCreating = false,
  progress = null,
  summary = null,
  error = '',
  portalOnlyCount = 0,
  onConfirm,
}) {
  const filterId = useId()
  const [selected, setSelected] = useState(() => new Set())
  const [typeFilter, setTypeFilter] = useState('all')
  const [confirming, setConfirming] = useState(false)
  const confirmTitleRef = useRef(null)
  const resultTitleRef = useRef(null)
  const createButtonRef = useRef(null)
  const restoreFocusRef = useRef(false)

  const list = useMemo(() => (Array.isArray(candidates) ? candidates : []), [candidates])
  const creatable = useMemo(() => list.filter((draft) => draft.creatable), [list])
  const blocked = useMemo(() => list.filter((draft) => !draft.creatable), [list])
  const creatableKeys = useMemo(() => new Set(creatable.map((draft) => draft.key)), [creatable])

  // A selecao descarta o que saiu da lista ou deixou de ser criavel: a lista de
  // escolhidos e' sempre derivada de `creatable` (e a selecao e' podada a cada clique).
  const selectedDrafts = useMemo(() => creatable.filter((draft) => selected.has(draft.key)), [creatable, selected])
  const matchesFilter = (draft) => typeFilter === 'all' || draft.kind === typeFilter
  const visible = creatable.filter(matchesFilter)
  const hiddenSelected = selectedDrafts.filter((draft) => !matchesFilter(draft)).length

  // Grupos por categoria do "Só no ERP", na ordem em que aparecem.
  const groups = []
  for (const draft of visible) {
    let group = groups.find((entry) => entry.label === draft.erpCategoryLabel)
    if (!group) {
      group = { label: draft.erpCategoryLabel, drafts: [] }
      groups.push(group)
    }
    group.drafts.push(draft)
  }

  const busy = isCreating
  const canCreate = selectedDrafts.length > 0 && !disabled && !busy

  useEffect(() => {
    if (confirming) confirmTitleRef.current?.focus()
  }, [confirming])

  useEffect(() => {
    if (!confirming && restoreFocusRef.current) {
      restoreFocusRef.current = false
      createButtonRef.current?.focus()
    }
  }, [confirming])

  useEffect(() => {
    if (summary) resultTitleRef.current?.focus()
  }, [summary])

  function pruned(previous) {
    return new Set([...previous].filter((key) => creatableKeys.has(key)))
  }

  function toggleOne(key) {
    setSelected((previous) => {
      const next = pruned(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleGroup(eligible, allSelected) {
    setSelected((previous) => {
      const next = pruned(previous)
      for (const draft of eligible) {
        if (allSelected) next.delete(draft.key)
        else next.add(draft.key)
      }
      return next
    })
  }

  function handleConfirm() {
    if (!canCreate) return
    setConfirming(false)
    onConfirm?.(selectedDrafts)
  }

  function handleBack() {
    restoreFocusRef.current = true
    setConfirming(false)
  }

  const progressTotal = progress?.total ?? 0
  const progressDone = progress?.done ?? 0
  const progressText = progress
    ? `Criando ${Math.min(progressDone + 1, progressTotal)} de ${progressTotal}…`
    : 'Criação em andamento…'

  if (confirming && !busy) {
    return (
      <div className="erp-reconcile__section erp-create">
        <h4 className="erp-reconcile__subtitle" ref={confirmTitleRef} tabIndex={-1}>
          Confirme os processos a criar
        </h4>
        <p className="erp-reconcile__note">
          {selectedDrafts.length === 1
            ? 'Será criado 1 processo no Portal.'
            : `Serão criados ${selectedDrafts.length} processos no Portal.`}{' '}
          Processos existentes não são alterados.
        </p>
        <PortalOnlyNotice count={portalOnlyCount} />
        <ul className="erp-create__result-list">
          {selectedDrafts.map((draft) => (
            <li key={draft.key}>{draft.preview.name}</li>
          ))}
        </ul>
        <div className="erp-create__buttons">
          <button type="button" className="ghost-button" onClick={handleBack}>
            Voltar
          </button>
          <button type="button" className="primary-button" onClick={handleConfirm} disabled={!canCreate}>
            Confirmar criação
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="erp-reconcile__section erp-create">
      {error ? <div className="error-banner">{error}</div> : null}
      {busy ? (
        <div className="empty-state" role="status">
          <strong>{progressText}</strong>
        </div>
      ) : null}
      {summary ? <ResultRegion summary={summary} titleRef={resultTitleRef} /> : null}

      {list.length === 0 ? (
        <div className="empty-state" role="status">
          <strong>Nenhum embarque do ERP está disponível para criar.</strong>
        </div>
      ) : (
        <>
          <p className="erp-reconcile__muted">
            Só embarques &quot;Aguardando embarque&quot; e &quot;Embarcado sem processo no Portal&quot; podem virar processo.
            Contêineres, pallets, peso e cubagem ficam como dados pendentes no processo criado.
          </p>
          <PortalOnlyNotice count={portalOnlyCount} />
          <div className="erp-create__toolbar">
            <label className="erp-reconcile__field" htmlFor={filterId}>
              <span>Tipo</span>
              <select
                id={filterId}
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                disabled={busy}
              >
                {ERP_CREATE_TYPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="primary-button"
              ref={createButtonRef}
              onClick={() => setConfirming(true)}
              disabled={!canCreate}
            >
              Criar {formatProcessCount(selectedDrafts.length)}
            </button>
          </div>
          {hiddenSelected > 0 ? (
            <p className="erp-reconcile__muted">
              {hiddenSelected === 1
                ? '1 selecionado oculto pelo filtro.'
                : `${hiddenSelected} selecionados ocultos pelo filtro.`}
            </p>
          ) : null}

          {groups.length === 0 ? (
            <div className="empty-state" role="status">
              <strong>{creatable.length === 0 ? 'Nenhum embarque criável nesta planilha.' : 'Nenhum embarque deste tipo.'}</strong>
            </div>
          ) : null}

          {groups.map((group) => {
            const eligible = group.drafts.filter((draft) => !draft.needsReview)
            const selectedEligible = eligible.filter((draft) => selected.has(draft.key)).length
            const allSelected = eligible.length > 0 && selectedEligible === eligible.length
            return (
              <section key={group.label} className="erp-reconcile__group">
                <h4 className="erp-reconcile__subtitle">
                  {group.label} ({group.drafts.length})
                </h4>
                <SelectAllCheckbox
                  label={`Selecionar todos de ${group.label} (${eligible.length})`}
                  checked={allSelected}
                  partial={selectedEligible > 0 && !allSelected}
                  disabled={busy || eligible.length === 0}
                  onChange={() => toggleGroup(eligible, allSelected)}
                />
                <ul className="erp-reconcile__list">
                  {group.drafts.map((draft) => (
                    <CreateRow
                      key={draft.key}
                      draft={draft}
                      selected={selected.has(draft.key)}
                      disabled={busy}
                      onToggle={toggleOne}
                    />
                  ))}
                </ul>
              </section>
            )
          })}

          {blocked.length > 0 ? (
            <section className="erp-reconcile__group">
              <h4 className="erp-reconcile__subtitle">Não criáveis ({blocked.length})</h4>
              <ul className="erp-reconcile__list">
                {blocked.map((draft) => (
                  <li key={draft.key} className="erp-reconcile__card">
                    <div className="erp-reconcile__card-head">
                      <strong>{draft.preview.name || draft.shipmentKey}</strong>
                      <span className="inline-badge">{draft.preview.badge || draft.kind}</span>
                    </div>
                    <p className="erp-reconcile__note">
                      {ERP_BLOCK_REASON_LABELS[draft.blockReason] ?? draft.blockReason}
                      {draft.existingName ? <> <strong>já existe: {draft.existingName}</strong></> : null}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
