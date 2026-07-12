import { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import StatCard from '../../components/StatCard'
import TabButton from '../../components/TabButton'
import { computeTrendDelta } from '../../utils/dashboardStats'
import {
  averageResolutionHours,
  buildWeeklyTicketSeries,
  countUnresolvedByPriority,
  formatResolutionHours,
} from '../../utils/supportStats'
import {
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_STATUS_TONES,
  listAllSupportTickets,
  updateSupportTicket,
} from '../../services/supportTicketsRepository'

// Aba de suporte — visão administrativa (backlog 2026-07-10; v2 em 2026-07-11).
// Admin visualiza os chamados abertos pelos usuários (mensagem + prints +
// autor), altera a prioridade (1 a 5, sendo 5 a máxima), inicia o atendimento
// (status 'em_andamento') e marca como resolvido (ou reabre). A notificação de
// novos chamados chega por email e pela central de notificações
// (notifySupportTicketCreated); ao resolver, o AUTOR é avisado pelos mesmos
// canais (notifySupportTicketResolved).

const PRIORITY_OPTIONS = [1, 2, 3, 4, 5]

// Abertos primeiro, depois em andamento; resolvidos por último.
const STATUS_SORT_RANK = { aberto: 0, em_andamento: 1, resolvido: 2 }

const PRIORITY_LABELS = {
  1: '1 · Muito baixa',
  2: '2 · Baixa',
  3: '3 · Média',
  4: '4 · Alta',
  5: '5 · Máxima',
}

function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

function formatTicketDate(isoDate) {
  if (!isoDate) return '—'
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return '—'

  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminSupportPanel() {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('aberto')
  const [savingTicketId, setSavingTicketId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadTickets() {
      setIsLoading(true)

      try {
        const loadedTickets = await listAllSupportTickets()
        if (isMounted) setTickets(loadedTickets)
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar os chamados.', loadError))
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadTickets()

    return () => {
      isMounted = false
    }
  }, [])

  const visibleTickets = useMemo(() => {
    const filteredTickets =
      statusFilter === 'todos'
        ? tickets
        : tickets.filter((ticket) => ticket.status === statusFilter)

    // Abertos primeiro (depois em andamento, resolvidos por último), por
    // prioridade (5 -> 1); dentro da mesma prioridade, mais recente primeiro.
    return [...filteredTickets].sort((left, right) => {
      if (left.status !== right.status) {
        return (STATUS_SORT_RANK[left.status] ?? 0) - (STATUS_SORT_RANK[right.status] ?? 0)
      }
      if (left.priority !== right.priority) {
        return right.priority - left.priority
      }
      return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime()
    })
  }, [tickets, statusFilter])

  const openCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'aberto').length,
    [tickets]
  )

  // F4 (backlog 2026-07-12): metricas derivadas dos proprios tickets.
  const supportStats = useMemo(() => {
    const weeklySeries = buildWeeklyTicketSeries(tickets)
    return {
      avgResolution: averageResolutionHours(tickets),
      unresolved: countUnresolvedByPriority(tickets),
      weeklySeries,
      weeklyDelta: computeTrendDelta(
        weeklySeries.currentWeekCount,
        weeklySeries.previousWeekCount
      ),
    }
  }, [tickets])

  const highPriorityCount =
    supportStats.unresolved.byPriority[4] + supportStats.unresolved.byPriority[5]

  async function applyTicketUpdate(ticket, nextStatus, nextPriority) {
    setSavingTicketId(ticket.id)
    setError('')

    const isResolving = nextStatus === 'resolvido'

    try {
      await updateSupportTicket(ticket.id, { status: nextStatus, priority: nextPriority }, profile)

      setTickets((currentTickets) =>
        currentTickets.map((item) =>
          item.id === ticket.id
            ? {
                ...item,
                status: nextStatus,
                priority: nextPriority,
                resolvedAt: isResolving ? new Date().toISOString() : null,
                resolvedByName: isResolving ? (profile?.name ?? null) : null,
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      )
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível atualizar o chamado.', saveError))
    } finally {
      setSavingTicketId(null)
    }
  }

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}

      {!isLoading && tickets.length > 0 ? (
        <div className="dashboard-stat-row" aria-label="Métricas de suporte">
          <StatCard
            label="Tempo médio de resolução"
            value={formatResolutionHours(supportStats.avgResolution)}
            icon="check"
          />
          <StatCard
            label={
              highPriorityCount > 0
                ? `Em aberto (${highPriorityCount} de prioridade alta)`
                : 'Em aberto'
            }
            value={String(supportStats.unresolved.total)}
            icon="help"
          />
          <StatCard
            label="Chamados abertos por semana"
            value={String(supportStats.weeklySeries.currentWeekCount)}
            icon="trend"
            trend={
              supportStats.weeklyDelta === null
                ? null
                : { delta: supportStats.weeklyDelta, period: 'vs. semana anterior' }
            }
            sparkline={supportStats.weeklySeries.counts}
          />
        </div>
      ) : null}

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>Chamados de suporte</h3>
            <p>
              Demandas relatadas pelos usuários do portal.
              {openCount > 0 ? ` ${openCount} em aberto.` : ' Nenhum chamado em aberto.'}
            </p>
          </div>
        </div>

        <div className="tab-row" role="tablist" aria-label="Filtro de chamados">
          <TabButton active={statusFilter === 'aberto'} onClick={() => setStatusFilter('aberto')}>
            Abertos
          </TabButton>
          <TabButton
            active={statusFilter === 'em_andamento'}
            onClick={() => setStatusFilter('em_andamento')}
          >
            Em andamento
          </TabButton>
          <TabButton
            active={statusFilter === 'resolvido'}
            onClick={() => setStatusFilter('resolvido')}
          >
            Resolvidos
          </TabButton>
          <TabButton active={statusFilter === 'todos'} onClick={() => setStatusFilter('todos')}>
            Todos
          </TabButton>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <strong>Carregando chamados</strong>
            <p>Buscando as demandas de suporte registradas.</p>
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum chamado por aqui</strong>
            <p>
              {statusFilter === 'aberto'
                ? 'Não há chamados em aberto no momento.'
                : 'Nenhum chamado corresponde ao filtro selecionado.'}
            </p>
          </div>
        ) : (
          <div className="detail-stack">
            {visibleTickets.map((ticket) => {
              const isSaving = savingTicketId === ticket.id
              const isResolved = ticket.status === 'resolvido'
              const isInProgress = ticket.status === 'em_andamento'

              return (
                <div key={ticket.id} className="detail-card support-ticket-card">
                  <div className="support-ticket-card__head">
                    <div>
                      <strong>{ticket.authorName}</strong>
                      <span className="support-ticket-card__meta">
                        {ticket.authorEmail} · {formatTicketDate(ticket.createdAt)}
                      </span>
                    </div>
                    <span
                      className={`status-tag status-tag--${SUPPORT_TICKET_STATUS_TONES[ticket.status] ?? 'warn'}`}
                    >
                      {SUPPORT_TICKET_STATUS_LABELS[ticket.status] ?? 'Aberto'}
                    </span>
                  </div>

                  <p className="support-ticket-card__message">{ticket.message}</p>

                  {ticket.imageUrls.length > 0 ? (
                    <div className="support-ticket-card__images">
                      {ticket.imageUrls.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          title={`Abrir print ${index + 1}`}
                        >
                          <img src={url} alt={`Print ${index + 1} do chamado`} loading="lazy" />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {isResolved && ticket.resolvedByName ? (
                    <p className="support-ticket-card__meta">
                      Resolvido por {ticket.resolvedByName}
                      {ticket.resolvedAt ? ` em ${formatTicketDate(ticket.resolvedAt)}` : ''}.
                    </p>
                  ) : null}

                  <div className="action-row support-ticket-card__actions">
                    <label className="field support-ticket-card__priority">
                      <span>Prioridade</span>
                      <select
                        className="text-input"
                        value={ticket.priority}
                        disabled={isSaving}
                        onChange={(event) =>
                          applyTicketUpdate(ticket, ticket.status, Number(event.target.value))
                        }
                      >
                        {PRIORITY_OPTIONS.map((priorityOption) => (
                          <option key={priorityOption} value={priorityOption}>
                            {PRIORITY_LABELS[priorityOption]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {!isResolved && !isInProgress ? (
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isSaving}
                        onClick={() => applyTicketUpdate(ticket, 'em_andamento', ticket.priority)}
                      >
                        {isSaving ? 'Salvando...' : 'Iniciar atendimento'}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className={isResolved ? 'ghost-button' : 'primary-button'}
                      disabled={isSaving}
                      onClick={() =>
                        applyTicketUpdate(
                          ticket,
                          isResolved ? 'aberto' : 'resolvido',
                          ticket.priority
                        )
                      }
                    >
                      {isSaving
                        ? 'Salvando...'
                        : isResolved
                          ? 'Reabrir chamado'
                          : 'Marcar como resolvido'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </article>
    </>
  )
}
