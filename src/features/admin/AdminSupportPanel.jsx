import { useEffect, useMemo, useState } from 'react'
import SelectField from '../../components/SelectField'
import useAuth from '../../hooks/useAuth'
import useMediaQuery from '../../hooks/useMediaQuery'
import StatCard from '../../components/StatCard'
import Skeleton from '../../components/Skeleton'
import TabButton from '../../components/TabButton'
import Icon from '../../components/Icon'
import { computeTrendDelta } from '../../utils/dashboardStats'
import {
  averageResolutionHours,
  buildWeeklyTicketSeries,
  countUnresolvedByPriority,
  formatResolutionHours,
} from '../../utils/supportStats'
import {
  SUPPORT_TICKET_MAX_REPLY_LENGTH,
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_STATUS_TONES,
  addSupportTicketReply,
  listAllSupportTickets,
  updateSupportTicket,
} from '../../services/supportTicketsRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'

// Aba de suporte — visão administrativa (backlog 2026-07-10; v2 em 2026-07-11).
// Admin visualiza os chamados abertos pelos usuários (mensagem + prints +
// autor), altera a prioridade (1 a 5, sendo 5 a máxima), inicia o atendimento
// (status 'em_andamento') e marca como resolvido (ou reabre). A notificação de
// novos chamados chega por email e pela central de notificações
// (notifySupportTicketCreated); ao resolver, o AUTOR é avisado pelos mesmos
// canais (notifySupportTicketResolved).

const PRIORITY_OPTIONS = [1, 2, 3, 4, 5]

// Refino F6b (AdminSuporte.dc.html): >= 1041px a aba escolhe uma arvore propria (indicadores com sparkline,
// abas segmentadas com contagem, chamado em 2 colunas); tablet e mobile ficam na arvore anterior, sem
// mudanca.
const DESKTOP_QUERY = '(min-width: 1041px)'

// Tom da etiqueta de status no desktop (mock: "Aberto" em perigo); a arvore anterior segue com
// SUPPORT_TICKET_STATUS_TONES (aberto = aviso).
const STATUS_PILL_TONES = { aberto: 'danger', em_andamento: 'info', resolvido: 'ok' }

// Traduz pathnames em labels legíveis para o contexto do chamado.
const PAGE_LABELS = {
  '/': 'Dashboard',
  '/news': 'Notícias',
  '/processos': 'Chegadas',
  '/notifications': 'Central de Notificações',
  '/menu': 'Menu',
  '/admin': 'Centro Administrativo',
  '/admin/usuarios': 'Admin · Usuários',
  '/admin/comunicados': 'Admin · Comunicados',
  '/admin/barra': 'Admin · Barra do porto',
  '/admin/previsoes': 'Admin · Previsões',
  '/admin/lead-time': 'Admin · Lead time',
  '/admin/suporte': 'Admin · Suporte',
}

// Abertos primeiro, depois em andamento; resolvidos por último.
const STATUS_SORT_RANK = { aberto: 0, em_andamento: 1, resolvido: 2 }

const PRIORITY_LABELS = {
  1: '1 · Muito baixa',
  2: '2 · Baixa',
  3: '3 · Média',
  4: '4 · Alta',
  5: '5 · Máxima',
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

// "19/10 09:14" pela data LOCAL (com o ano quando nao e o corrente); manual, nunca toISOString (BRT).
function formatShortDateTime(isoDate, now = new Date()) {
  if (!isoDate) return '—'
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return '—'
  const pad = (number) => String(number).padStart(2, '0')
  const day = `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}`
  const year = parsed.getFullYear() === now.getFullYear() ? '' : `/${parsed.getFullYear()}`
  return `${day}${year} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

// So a hora ("09:40") quando e hoje; data + hora nos demais dias.
function formatShortTime(isoDate, now = new Date()) {
  const parsed = new Date(isoDate)
  if (!isoDate || Number.isNaN(parsed.getTime())) return '—'
  const sameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  if (!sameDay) return formatShortDateTime(isoDate, now)
  const pad = (number) => String(number).padStart(2, '0')
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

// Iniciais do autor (ate 2 letras) para o avatar do chamado.
function getInitials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

// Sparkline 140x40 das ultimas semanas (mock: traco --primary-700, ponto final --primary).
function Sparkline({ counts }) {
  if (!Array.isArray(counts) || counts.length < 2) return null
  const width = 140
  const height = 40
  const padX = 3
  const padY = 6
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  const range = max - min
  const step = (width - padX * 2) / (counts.length - 1)
  const points = counts.map((value, index) => [
    padX + index * step,
    range === 0 ? height / 2 : height - padY - ((value - min) / range) * (height - padY * 2),
  ])
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg
      className="as-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Tendência das últimas ${counts.length} semanas`}
    >
      <polyline
        className="as-spark__line"
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="as-spark__dot" cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="3" />
    </svg>
  )
}

export default function AdminSupportPanel() {
  const { profile } = useAuth()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [tickets, setTickets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('aberto')
  const [ticketIndex, setTicketIndex] = useState(0)
  const [savingTicketId, setSavingTicketId] = useState(null)
  const [resolutionDrafts, setResolutionDrafts] = useState({})
  const [replyDrafts, setReplyDrafts] = useState({})
  const [sendingReplyTicketId, setSendingReplyTicketId] = useState(null)
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

  useEffect(() => {
    setTicketIndex(0)
  }, [statusFilter])

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

  const safeTicketIndex =
    visibleTickets.length === 0 ? 0 : Math.min(ticketIndex, visibleTickets.length - 1)
  const currentTicket = visibleTickets[safeTicketIndex] ?? null

  const openCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'aberto').length,
    [tickets]
  )

  const inProgressCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'em_andamento').length,
    [tickets]
  )
  const resolvedCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'resolvido').length,
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

  async function applyTicketUpdate(ticket, nextStatus, nextPriority, resolutionMessage = '') {
      setSavingTicketId(ticket.id)
      setError('')

      const isResolving = nextStatus === 'resolvido'

      try {
        await updateSupportTicket(
          ticket.id,
          { status: nextStatus, priority: nextPriority, resolutionMessage: isResolving ? resolutionMessage : '' },
          profile
        )

      setTickets((currentTickets) =>
        currentTickets.map((item) =>
          item.id === ticket.id
            ? {
                ...item,
                status: nextStatus,
                priority: nextPriority,
                resolvedAt: isResolving ? new Date().toISOString() : null,
                resolvedByName: isResolving ? (profile?.name ?? null) : null,
                resolutionMessage: isResolving ? resolutionMessage || null : null,
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

  async function sendTicketReply(ticket) {
    const draftMessage = (replyDrafts[ticket.id] ?? '').trim()
    if (!draftMessage) return

    setSendingReplyTicketId(ticket.id)
    setError('')

    try {
      const reply = await addSupportTicketReply(ticket.id, draftMessage, profile)

      setTickets((currentTickets) =>
        currentTickets.map((item) =>
          item.id === ticket.id ? { ...item, replies: [...item.replies, reply] } : item
        )
      )
      setReplyDrafts((current) => ({ ...current, [ticket.id]: '' }))
    } catch (sendError) {
      setError(buildActionErrorMessage('Não foi possível enviar a resposta.', sendError))
    } finally {
      setSendingReplyTicketId(null)
    }
  }

  // Refino F6b (AdminSuporte.dc.html): >= 1041px a aba ganha 3 indicadores com sparkline, abas segmentadas
  // com contagem e o chamado em 2 colunas (conversa a esquerda, resposta/prioridade/acoes a direita).
  // Tablet/mobile seguem na arvore abaixo, intacta. Estado e handlers sao os mesmos (vivem la em cima),
  // entao a troca ao vivo de breakpoint mantem os rascunhos de resposta e de encerramento.
  if (isDesktop) {
    const statusTabs = [
      { id: 'aberto', label: 'Abertos', count: openCount },
      { id: 'em_andamento', label: 'Em andamento', count: inProgressCount },
      { id: 'resolvido', label: 'Resolvidos', count: resolvedCount },
      { id: 'todos', label: 'Todos', count: tickets.length },
    ]
    const weeklyCounts = supportStats.weeklySeries.counts
    const weeklyDifference =
      supportStats.weeklySeries.currentWeekCount - supportStats.weeklySeries.previousWeekCount
    const ticket = currentTicket
    const isSaving = ticket ? savingTicketId === ticket.id : false
    const isResolved = ticket?.status === 'resolvido'
    const isInProgress = ticket?.status === 'em_andamento'
    const replyDraft = ticket ? (replyDrafts[ticket.id] ?? '') : ''
    const isSendingReply = ticket ? sendingReplyTicketId === ticket.id : false

    return (
      <div className="admin-panel admin-panel--support as-root">
        {error ? <div className="error-banner">{error}</div> : null}

        <section className="as-kpis" aria-label="Métricas de suporte">
          <div className="as-kpi">
            <span className="as-kpi__label">Tempo médio de resolução</span>
            <span className="as-kpi__value">
              {isLoading ? '—' : formatResolutionHours(supportStats.avgResolution)}
            </span>
          </div>
          <div className="as-kpi">
            <span className="as-kpi__label">Em aberto</span>
            <span className="as-kpi__value">{isLoading ? '—' : supportStats.unresolved.total}</span>
            <span className={`as-kpi__note${highPriorityCount > 0 ? ' as-kpi__note--danger' : ''}`}>
              {highPriorityCount > 0 ? `${highPriorityCount} de prioridade alta` : 'Nenhum de prioridade alta'}
            </span>
          </div>
          <div className="as-kpi">
            <span className="as-kpi__label">Chamados abertos por semana</span>
            <div className="as-kpi__row">
              <span className="as-kpi__value">
                {isLoading ? '—' : supportStats.weeklySeries.currentWeekCount}
              </span>
              <Sparkline counts={weeklyCounts} />
            </div>
            <span className="as-kpi__note">
              {`${weeklyDifference > 0 ? '+' : ''}${weeklyDifference} vs. semana anterior`}
              {supportStats.weeklyDelta !== null
                ? ` (${supportStats.weeklyDelta > 0 ? '+' : ''}${supportStats.weeklyDelta}%)`
                : ''}
            </span>
          </div>
        </section>

        <div className="as-head">
          <div className="as-head__text">
            <h3 className="as-title">Chamados de suporte</h3>
            <p className="as-subtitle">
              Demandas relatadas pelos usuários do portal.
              {openCount > 0 ? ` ${openCount} em aberto.` : ' Nenhum chamado em aberto.'}
            </p>
          </div>
          <div className="as-tabs" role="tablist" aria-label="Filtro de chamados">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.id}
                className={`as-tab${statusFilter === tab.id ? ' as-tab--active' : ''}`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label} <span className="as-tab__count">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="as-grid">
            <Skeleton variant="card" style={{ height: 320 }} />
            <Skeleton variant="card" style={{ height: 320 }} />
          </div>
        ) : visibleTickets.length === 0 || !ticket ? (
          <div className="empty-state">
            <strong>Nenhum chamado por aqui</strong>
            <p>
              {statusFilter === 'aberto'
                ? 'Não há chamados em aberto no momento.'
                : 'Nenhum chamado corresponde ao filtro selecionado.'}
            </p>
          </div>
        ) : (
          <section className="as-grid">
            <article className="ad-card as-ticket" key={ticket.id} aria-label="Chamado">
              <div className="as-ticket__head">
                <div className="as-author">
                  <span className="as-avatar" aria-hidden="true">
                    {getInitials(ticket.authorName)}
                  </span>
                  <div className="as-author__text">
                    <strong className="as-author__name">{ticket.authorName}</strong>
                    <span className="as-author__meta">
                      {ticket.authorEmail} · {formatShortDateTime(ticket.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="as-ticket__tools">
                  <span className={`ad-pill ad-pill--${STATUS_PILL_TONES[ticket.status] ?? 'danger'}`}>
                    {SUPPORT_TICKET_STATUS_LABELS[ticket.status] ?? 'Aberto'}
                  </span>
                  {visibleTickets.length > 1 ? (
                    <div className="as-pager">
                      <button
                        type="button"
                        className="as-pager__button"
                        aria-label="Chamado anterior"
                        onClick={() =>
                          setTicketIndex((safeTicketIndex - 1 + visibleTickets.length) % visibleTickets.length)
                        }
                      >
                        <Icon name="chevron-left" size={14} strokeWidth={2.2} />
                      </button>
                      <span
                        className="as-pager__counter"
                        aria-label={`Chamado ${safeTicketIndex + 1} de ${visibleTickets.length}`}
                      >
                        {safeTicketIndex + 1}/{visibleTickets.length}
                      </span>
                      <button
                        type="button"
                        className="as-pager__button"
                        aria-label="Próximo chamado"
                        onClick={() => setTicketIndex((safeTicketIndex + 1) % visibleTickets.length)}
                      >
                        <Icon name="chevron-right" size={14} strokeWidth={2.2} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <p className="as-message">{ticket.message}</p>

              {ticket.contextPage ? (
                <span className="as-context">
                  Contexto:{' '}
                  <strong>
                    {PAGE_LABELS[ticket.contextPage] ?? ticket.contextPage}
                    {ticket.contextProcessName
                      ? ` · ${ticket.contextProcessName}`
                      : ticket.contextProcessId
                        ? ` · processo ${ticket.contextProcessId.slice(0, 8)}`
                        : ''}
                  </strong>
                </span>
              ) : null}

              {ticket.imageUrls.length > 0 ? (
                <div className="as-shots">
                  {ticket.imageUrls.map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Abrir print ${index + 1}`}
                      className="as-shot"
                    >
                      <img src={url} alt={`Print ${index + 1} do chamado`} loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : null}

              {isResolved && ticket.resolvedByName ? (
                <p className="as-resolved-by">
                  Resolvido por {ticket.resolvedByName}
                  {ticket.resolvedAt ? ` em ${formatShortDateTime(ticket.resolvedAt)}` : ''}.
                </p>
              ) : null}

              {isResolved && ticket.resolutionMessage ? (
                <div className="as-resolution">
                  <h4 className="as-resolution__title">Resposta da equipe</h4>
                  <p className="as-resolution__text">{ticket.resolutionMessage}</p>
                </div>
              ) : null}

              <div className="as-thread">
                <h4 className="as-thread__title">Conversa com o usuário</h4>
                {ticket.replies.length > 0 ? (
                  <ul className="as-thread__list">
                    {ticket.replies.map((reply) => {
                      const fromUser = Boolean(reply.authorId) && reply.authorId === ticket.authorId
                      return (
                        <li
                          key={reply.id}
                          className={`as-bubble${fromUser ? ' as-bubble--user' : ' as-bubble--team'}`}
                        >
                          <p className="as-bubble__text">{reply.message}</p>
                          <span className="as-bubble__meta">
                            {reply.authorName} · {formatShortTime(reply.createdAt)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="as-thread__empty">Nenhuma resposta enviada ainda.</p>
                )}
              </div>
            </article>

            <aside className="ad-card as-side" aria-label="Atendimento">
              <label className="field">
                <span>Nova resposta</span>
                <textarea
                  className="text-input text-input--textarea as-reply"
                  value={replyDraft}
                  onChange={(event) =>
                    setReplyDrafts((current) => ({
                      ...current,
                      [ticket.id]: event.target.value,
                    }))
                  }
                  placeholder="Escreva a resposta ao usuário."
                  rows={5}
                  maxLength={SUPPORT_TICKET_MAX_REPLY_LENGTH}
                  disabled={isSendingReply}
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={isSendingReply || !replyDraft.trim()}
                onClick={() => sendTicketReply(ticket)}
              >
                {isSendingReply ? 'Enviando...' : 'Enviar resposta'}
              </button>

              <label className="field">
                <span>Prioridade</span>
                <SelectField
                  className="text-input"
                  value={ticket.priority}
                  disabled={isSaving}
                  onChange={(event) => applyTicketUpdate(ticket, ticket.status, Number(event.target.value))}
                >
                  {PRIORITY_OPTIONS.map((priorityOption) => (
                    <option key={priorityOption} value={priorityOption}>
                      {PRIORITY_LABELS[priorityOption]}
                    </option>
                  ))}
                </SelectField>
              </label>

              {!isResolved ? (
                <label className="field">
                  <span>Mensagem de encerramento (opcional)</span>
                  <textarea
                    className="text-input text-input--textarea as-closing"
                    value={resolutionDrafts[ticket.id] ?? ''}
                    onChange={(event) =>
                      setResolutionDrafts((current) => ({
                        ...current,
                        [ticket.id]: event.target.value,
                      }))
                    }
                    placeholder="Explique a resolução ou deixe instruções para o usuário"
                    rows={1}
                    disabled={isSaving}
                  />
                </label>
              ) : null}

              <div className="as-actions">
                {!isResolved && !isInProgress ? (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isSaving}
                    onClick={() => applyTicketUpdate(ticket, 'em_andamento', ticket.priority)}
                  >
                    {isSaving ? 'Salvando...' : 'Iniciar atendimento'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={
                    isResolved ? 'secondary-button' : isInProgress ? 'primary-button' : 'ghost-button as-resolve'
                  }
                  disabled={isSaving}
                  onClick={() =>
                    applyTicketUpdate(
                      ticket,
                      isResolved ? 'aberto' : 'resolvido',
                      ticket.priority,
                      resolutionDrafts[ticket.id] ?? ''
                    )
                  }
                >
                  {isSaving ? 'Salvando...' : isResolved ? 'Reabrir chamado' : 'Marcar como resolvido'}
                </button>
              </div>
            </aside>
          </section>
        )}
      </div>
    )
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

        <div className="support-tabs-row">
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

          {visibleTickets.length > 1 ? (
            <div className="support-ticket-pager">
              <button
                type="button"
                className="action-icon-button"
                aria-label="Chamado anterior"
                onClick={() =>
                  setTicketIndex(
                    (safeTicketIndex - 1 + visibleTickets.length) % visibleTickets.length
                  )
                }
              >
                <Icon name="chevron-left" />
              </button>
              <span className="support-ticket-pager__counter">
                {safeTicketIndex + 1} de {visibleTickets.length}
              </span>
              <button
                type="button"
                className="action-icon-button"
                aria-label="Próximo chamado"
                onClick={() => setTicketIndex((safeTicketIndex + 1) % visibleTickets.length)}
              >
                <Icon name="chevron-right" />
              </button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <Skeleton.Group count={3}>
            <div className="support-ticket-card" style={{ gap: 8, padding: 14 }}>
              <Skeleton variant="title" width="50%" />
              <Skeleton variant="text" />
              <Skeleton variant="text" width="30%" />
            </div>
          </Skeleton.Group>
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
            {[currentTicket].filter(Boolean).map((ticket) => {
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

                  {ticket.contextPage ? (
                    <p className="support-ticket-card__context">
                      <span className="detail-label">Contexto:</span>{' '}
                      {PAGE_LABELS[ticket.contextPage] ?? ticket.contextPage}
                      {ticket.contextProcessName ? ` · ${ticket.contextProcessName}` : ticket.contextProcessId ? ` · processo ${ticket.contextProcessId.slice(0, 8)}` : ''}
                    </p>
                  ) : null}

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

                  {isResolved && ticket.resolutionMessage ? (
                    <div className="detail-card detail-card--soft">
                      <span className="detail-label">Resposta da equipe</span>
                      <p>{ticket.resolutionMessage}</p>
                    </div>
                  ) : null}

                  <div className="support-ticket-card__replies">
                    <span className="detail-label">Conversa com o usuário</span>

                    {ticket.replies.length > 0 ? (
                      <ul className="support-ticket-card__replies-list">
                        {ticket.replies.map((reply) => (
                          <li key={reply.id} className="support-ticket-card__reply">
                            <span className="support-ticket-card__meta">
                              {reply.authorName} · {formatTicketDate(reply.createdAt)}
                            </span>
                            <p>{reply.message}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="support-ticket-card__meta">Nenhuma resposta enviada ainda.</p>
                    )}

                    <label className="field">
                      <span>Nova resposta</span>
                      <textarea
                        className="text-input text-input--textarea"
                        value={replyDrafts[ticket.id] ?? ''}
                        onChange={(event) =>
                          setReplyDrafts((current) => ({
                            ...current,
                            [ticket.id]: event.target.value,
                          }))
                        }
                        placeholder="Escreva uma resposta para o usuário"
                        rows={2}
                        maxLength={SUPPORT_TICKET_MAX_REPLY_LENGTH}
                        disabled={sendingReplyTicketId === ticket.id}
                      />
                    </label>

                    <div className="action-row">
                      <button
                        type="button"
                        className="ghost-button ghost-button--secondary"
                        disabled={
                          sendingReplyTicketId === ticket.id || !(replyDrafts[ticket.id] ?? '').trim()
                        }
                        onClick={() => sendTicketReply(ticket)}
                      >
                        {sendingReplyTicketId === ticket.id ? 'Enviando...' : 'Enviar resposta'}
                      </button>
                    </div>
                  </div>

                  {!isResolved ? (
                    <label className="field">
                      <span>Mensagem de encerramento (opcional)</span>
                      <textarea
                        className="text-input text-input--textarea"
                        value={resolutionDrafts[ticket.id] ?? ''}
                        onChange={(event) =>
                          setResolutionDrafts((current) => ({
                            ...current,
                            [ticket.id]: event.target.value,
                          }))
                        }
                        placeholder="Explique a resolução ou deixe instruções para o usuário"
                        rows={3}
                        disabled={isSaving}
                      />
                    </label>
                  ) : null}

                  <div className="action-row support-ticket-card__actions">
                    <label className="field support-ticket-card__priority">
                      <span>Prioridade</span>
                      <SelectField
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
                      </SelectField>
                    </label>

                    {!isResolved && !isInProgress ? (
                      <button
                        type="button"
                        className="ghost-button ghost-button--secondary"
                        disabled={isSaving}
                        onClick={() => applyTicketUpdate(ticket, 'em_andamento', ticket.priority)}
                      >
                        {isSaving ? 'Salvando...' : 'Iniciar atendimento'}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className={isResolved ? 'ghost-button ghost-button--secondary' : 'primary-button'}
                      disabled={isSaving}
                      onClick={() =>
                        applyTicketUpdate(
                          ticket,
                          isResolved ? 'aberto' : 'resolvido',
                          ticket.priority,
                          resolutionDrafts[ticket.id] ?? ''
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
