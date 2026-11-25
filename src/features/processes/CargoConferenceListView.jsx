import { useMemo } from 'react'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import {
  CARGO_CONFERENCE_STATES,
  CARGO_CONFERENCE_WEEKS,
  countCargoConferenceFilters,
  describeCargoConferenceArrival,
  describeCargoConferenceCategory,
  describeCargoConferenceSupplier,
  describeCargoConferenceWhen,
  filterCargoConferenceEntries,
} from './cargoConferenceList'
import { getDerivedStatusToneClass } from './processDerivedStatus'
import { getProcessTitle } from './processLabels'

// S9-F do Relatório de Carga: lista da aba Conferência (celular).
// (O arquivo é CargoConferenceListView e não CargoConferenceList: no Windows, um import sem extensão de
// "CargoConferenceList" resolveria cargoConferenceList.js, o módulo puro.)
// "Fechadas" com contagem, botão Atualizar e um cartão por processo com progresso "X de Y itens conferidos" e o selo do
// COMEX / da conferência. Processo sem Relatório de Carga fica bloqueado com a explicação (e o toque só avisa).
// Apresentação: o estado do filtro e da busca fica na página (sobrevive a abrir e voltar do detalhe).

export const CARGO_CONFERENCE_FILTERS = [
  { value: 'pendentes', label: 'Para conferir' },
  { value: 'fechadas', label: 'Fechadas' },
]

const BLOCKED_NOTE = 'O COMEX ainda não criou o Relatório de Carga deste processo. Sem ele não há o que conferir.'
const BLOCKED_TOAST = 'Sem Relatório de Carga do COMEX: nada para conferir ainda.'
const ERROR_NOTE = 'Não foi possível ler o relatório. Toque para tentar de novo.'

function ProgressBar({ done, total }) {
  const percent = total > 0 ? Math.round((done * 100) / total) : 0
  return (
    <span className="ccf-bar" aria-hidden="true">
      <i style={{ width: `${percent}%` }} />
    </span>
  )
}

function StateBadge({ entry }) {
  if (entry.state === CARGO_CONFERENCE_STATES.closed) {
    return <span className="ccf-badge ccf-badge--ok">Conferência fechada</span>
  }
  return entry.comexStatus === 'rascunho' ? (
    <span className="ccf-badge ccf-badge--warn">COMEX em rascunho</span>
  ) : (
    <span className="ccf-badge ccf-badge--ok">COMEX fechado</span>
  )
}

function EntryCard({ entry, title, now, onOpen, onBlocked, onRetry }) {
  const { process, phase, state } = entry
  const blocked = state === CARGO_CONFERENCE_STATES.blocked
  const failed = state === CARGO_CONFERENCE_STATES.error
  const loading = state === CARGO_CONFERENCE_STATES.loading
  const meta = [
    describeCargoConferenceCategory(process?.category),
    describeCargoConferenceSupplier(process),
    describeCargoConferenceWhen(process, phase.phase, now),
  ]
    .filter(Boolean)
    .join(' · ')
  const arrival = describeCargoConferenceArrival(entry)

  function handleClick() {
    if (blocked) onBlocked()
    else if (failed) onRetry(entry.processId)
    else if (!loading) onOpen(entry.processId)
  }

  return (
    <button
      type="button"
      className={`ccf-entry${blocked ? ' ccf-entry--blocked' : ''}`}
      aria-disabled={blocked || loading ? 'true' : undefined}
      onClick={handleClick}
    >
      <span className="ccf-entry__row">
        <span className="ccf-entry__title">{title}</span>
        <span className={getDerivedStatusToneClass(phase)}>{phase.label}</span>
      </span>
      <span className="ccf-sub">{meta}</span>
      {arrival ? (
        <span className="ccf-entry__row ccf-entry__row--start">
          <span className="ccf-sub">{arrival}</span>
          {entry.week === CARGO_CONFERENCE_WEEKS.previous ? (
            <span className="ccf-badge ccf-badge--warn">Semana anterior</span>
          ) : null}
        </span>
      ) : null}
      {blocked ? <span className="ccf-note ccf-note--warn">{BLOCKED_NOTE}</span> : null}
      {failed ? <span className="ccf-note ccf-note--danger">{ERROR_NOTE}</span> : null}
      {loading ? <span className="ccf-sub">Carregando…</span> : null}
      {!blocked && !failed && !loading ? (
        <>
          <ProgressBar done={entry.done} total={entry.total} />
          <span className="ccf-entry__row">
            <span className="ccf-sub">
              <b>{entry.done}</b> de {entry.total} itens conferidos
            </span>
            <StateBadge entry={entry} />
          </span>
        </>
      ) : null}
    </button>
  )
}

export default function CargoConferenceListView({
  entries,
  status,
  isAdmin,
  canSeeName,
  filter,
  query,
  onFilterChange,
  onQueryChange,
  onRefresh,
  onRetryEntry,
  onOpen,
}) {
  const toast = useToast()
  const now = new Date()
  const counts = useMemo(() => countCargoConferenceFilters(entries), [entries])
  const visible = filterCargoConferenceEntries(entries, { filter, query, canSeeName, now })
  const isLoading = status === 'loading'
  const isRefreshing = isLoading && entries.length > 0

  return (
    <div className="ccf-list">
      <div className="ccf-listhead">
        <span className="ccf-badge ccf-badge--info">{isAdmin ? 'Admin · só acompanha' : 'Logística'}</span>
        <button type="button" className="secondary-button ccf-refresh" disabled={isLoading} onClick={onRefresh}>
          <Icon name="refresh" size={16} />
          {isRefreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      <input
        type="search"
        className="ccf-search"
        aria-label="Buscar processo, fornecedor ou tipo"
        placeholder="Buscar processo, fornecedor ou tipo"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />

      <div className="ccf-chips" role="group" aria-label="Filtro">
        {CARGO_CONFERENCE_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="ccf-chip"
            aria-pressed={filter === option.value}
            onClick={() => onFilterChange(option.value)}
          >
            {option.label}
            <small>{counts[option.value]}</small>
          </button>
        ))}
      </div>

      <p className="ccf-sub">Previsão de chegada nesta semana, mais conferências abertas de semanas anteriores.</p>

      {status === 'error' && entries.length === 0 ? (
        <div className="error-banner error-banner--retry" role="alert">
          <span>Não foi possível carregar os processos.</span>
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {isLoading && entries.length === 0 ? (
        <div className="ccf-skeletons" role="status" aria-label="Carregando processos">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : null}

      {status === 'ready' && visible.length === 0 ? (
        <div className="ccf-note" role="status">
          {query ? 'Nada por aqui. Tente outra busca.' : 'Nenhum processo com previsão de chegada nesta semana.'}
        </div>
      ) : null}

      <div className="ccf-entries">
        {visible.map((entry) => (
          <EntryCard
            key={entry.processId}
            entry={entry}
            title={getProcessTitle(entry.process, canSeeName)}
            now={now}
            onOpen={onOpen}
            onBlocked={() => toast.info(BLOCKED_TOAST)}
            onRetry={onRetryEntry}
          />
        ))}
      </div>
    </div>
  )
}
