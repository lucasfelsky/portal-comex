// F4 (backlog 2026-07-12): métricas do painel de suporte, derivadas 100%
// dos tickets já carregados (createdAt/resolvedAt/status/priority) — sem
// query nova. Mesmo espírito do dashboardStats (PR #24): util puro com
// `now` injetável, consumido por StatCards no AdminSupportPanel.
import { startOfCalendarWeek } from './dashboardStats'

function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// Média de horas entre abertura e resolução dos tickets RESOLVIDOS.
// null quando não há nenhum resolvido com as duas datas (card mostra "—").
export function averageResolutionHours(tickets) {
  const durations = (Array.isArray(tickets) ? tickets : [])
    .filter((ticket) => ticket?.status === 'resolvido')
    .map((ticket) => {
      const createdAt = parseDate(ticket.createdAt)
      const resolvedAt = parseDate(ticket.resolvedAt)
      if (!createdAt || !resolvedAt) return null
      const hours = (resolvedAt - createdAt) / (60 * 60 * 1000)
      return hours >= 0 ? hours : null
    })
    .filter((hours) => hours !== null)

  if (durations.length === 0) return null
  return durations.reduce((sum, hours) => sum + hours, 0) / durations.length
}

// "18h" até 2 dias; acima disso "2,5 d" — leitura rápida no card.
export function formatResolutionHours(hours) {
  if (hours === null || !Number.isFinite(hours)) return '—'
  if (hours < 48) return `${Math.round(hours)}h`
  const days = hours / 24
  return `${days.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} d`
}

// Não resolvidos (aberto + em_andamento), com breakdown por prioridade
// (5 = máxima). Alimenta o card "Em aberto" e o detalhe por prioridade.
export function countUnresolvedByPriority(tickets) {
  const unresolved = (Array.isArray(tickets) ? tickets : []).filter(
    (ticket) => ticket?.status !== 'resolvido'
  )
  const byPriority = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

  for (const ticket of unresolved) {
    const priority = Number(ticket.priority)
    if (byPriority[priority] !== undefined) byPriority[priority] += 1
  }

  return { total: unresolved.length, byPriority }
}

// Série semanal de ABERTURAS (createdAt) nas últimas `weeks` semanas-
// calendário, terminando na atual — sparkline + delta do card de volume.
export function buildWeeklyTicketSeries(tickets, { now = new Date(), weeks = 8 } = {}) {
  const currentWeekStart = startOfCalendarWeek(now)
  const seriesStart = new Date(currentWeekStart)
  seriesStart.setDate(seriesStart.getDate() - (weeks - 1) * 7)

  const counts = new Array(weeks).fill(0)

  for (const ticket of Array.isArray(tickets) ? tickets : []) {
    const createdAt = parseDate(ticket?.createdAt)
    if (!createdAt) continue

    const weekStart = startOfCalendarWeek(createdAt)
    const weekIndex = Math.round((weekStart - seriesStart) / (7 * 24 * 60 * 60 * 1000))
    if (weekIndex < 0 || weekIndex >= weeks) continue

    counts[weekIndex] += 1
  }

  return {
    counts,
    currentWeekCount: counts[weeks - 1],
    previousWeekCount: weeks >= 2 ? counts[weeks - 2] : 0,
  }
}
