// Estatísticas do Dashboard (backlog de design v0.12: stat-cards com
// trend up/down % e sparklines — dados 100% derivados dos processos
// reais, nada sintético).
//
// Semântica de semana: CALENDÁRIO, segunda 00:00 → domingo 23:59. É
// diferente de propósito do `getWeekRange` do WeeklyArrivalsCard (que é
// "hoje até domingo", janela restante): buckets semanais precisam ser
// comparáveis entre si pra trend/sparkline fazerem sentido.
import { isProcessTrulyFinalized } from '../features/processes/processStatus'

// Segunda-feira 00:00 da semana da data. getDay(): domingo=0.
export function startOfCalendarWeek(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const dayOfWeek = start.getDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

function parseEtaDate(eta) {
  if (!eta) return null
  // ETAs vêm como 'YYYY-MM-DD'; ancorar ao meio-dia local evita o doc
  // pular de dia por interpretação UTC do construtor.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(eta))
    ? new Date(`${eta}T12:00:00`)
    : new Date(eta)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// Série semanal de chegadas (ETA): conta processos com ETA em cada uma
// das últimas `weeks` semanas-calendário, terminando na semana atual.
// Retorna { counts, currentWeekCount, previousWeekCount } — counts[i]
// é a semana mais antiga, counts[counts.length - 1] é a atual.
export function buildWeeklyEtaSeries(processes, { now = new Date(), weeks = 8 } = {}) {
  const currentWeekStart = startOfCalendarWeek(now)
  const seriesStart = new Date(currentWeekStart)
  seriesStart.setDate(seriesStart.getDate() - (weeks - 1) * 7)

  const counts = new Array(weeks).fill(0)

  for (const process of Array.isArray(processes) ? processes : []) {
    const etaDate = parseEtaDate(process?.eta)
    if (!etaDate) continue

    const weekStart = startOfCalendarWeek(etaDate)
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

// Delta percentual (inteiro) entre semana atual e anterior. Sem base de
// comparação (anterior = 0) retorna null — o card fica sem trend em vez
// de mostrar um % enganoso.
export function computeTrendDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// Processos ativos = ainda não entraram em estoque (mesmo sinal
// consolidado usado pelo WeeklyArrivalsCard).
export function countActiveProcesses(processes) {
  return (Array.isArray(processes) ? processes : []).filter(
    (process) => !isProcessTrulyFinalized(process)
  ).length
}
