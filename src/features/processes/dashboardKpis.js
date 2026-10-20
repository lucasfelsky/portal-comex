// Ciclo 2a (redesign Fase 2 - Dashboard): faixa de KPIs.
// Modulo puro (sem React), testavel em unidade sem render.
// Reusa `getWeeklyArrivalProcesses` (WeeklyArrivalsCard.jsx) e
// `normalizeComparableText` (processStatus.js) — nao reimplementa
// nenhuma logica de status/data ja existente.
import { formatShortDate, getWeeklyArrivalProcesses, toDateKeyLocal } from './WeeklyArrivalsCard'
import { normalizeComparableText } from './processStatus'
import { getVoyageStatus } from './customsVisibility'
import { isDuimpUnderWater } from './arrivalCustoms'

// Predicados EXATOS (semantica de produto pinada no PLAN.md, secao
// "Passos 2a.1" — nao e' um fato do dominio, e uma decisao):
// - chegadasNaSemana: getWeeklyArrivalProcesses -> scheduled + unscheduled.
// - emTransito: status da VIAGEM (`getVoyageStatus`, D-5: DUIMP sob aguas nao
//   tira o processo de "em transito") normalizado 'embarcou' ou 'embarcado'.
// - aguardandoAtracacao: status da viagem normalizado 'aguardando atracacao'.
// - canalVermelho: parameterizationChannel === 'Vermelho' (trim, exato).
// Conta sobre a lista inteira recebida (sem filtrar favorito).
// F4a (D12): nota "+N vs. semana passada" do KPI "Chegadas na semana". A semana
// anterior usa a MESMA regra de `getWeeklyArrivalProcesses` com o relogio 7 dias
// atras (mesmo dia da semana ate o domingo anterior). Aproximacao assumida: a
// lista e' a de hoje, entao processos ja finalizados (em estoque) nao entram na
// contagem da semana passada.
export function getPreviousWeekArrivalsCount(processes, now = new Date()) {
  const list = Array.isArray(processes) ? processes : []
  const previousNow = new Date(now)
  previousNow.setDate(previousNow.getDate() - 7)
  const { scheduled, unscheduled } = getWeeklyArrivalProcesses(list, previousNow)
  return scheduled.length + unscheduled.length
}

export function getDashboardKpis(processes, now = new Date()) {
  const list = Array.isArray(processes) ? processes : []

  const { scheduled, unscheduled } = getWeeklyArrivalProcesses(list, now)
  const chegadasNaSemana = scheduled.length + unscheduled.length

  let emTransito = 0
  let aguardandoAtracacao = 0
  let canalVermelho = 0

  for (const process of list) {
    // Fora do "sob aguas" o status gravado segue valendo (identidade para
    // todo processo sem DUIMP antes da atracacao).
    const status = isDuimpUnderWater(process) ? getVoyageStatus(process, now) : process?.processStatus
    const normalizedStatus = normalizeComparableText(status)

    if (normalizedStatus === 'embarcou' || normalizedStatus === 'embarcado') {
      emTransito += 1
    }

    if (normalizedStatus === 'aguardando atracacao') {
      aguardandoAtracacao += 1
    }

    if (String(process?.parameterizationChannel ?? '').trim() === 'Vermelho') {
      canalVermelho += 1
    }
  }

  return { chegadasNaSemana, emTransito, aguardandoAtracacao, canalVermelho }
}

// ---------------------------------------------------------------------------
// F4a (Dashboard desktop, Dashboard.dc.html): textos derivados. Puros, sem React.
// ---------------------------------------------------------------------------

// D12: notas dos KPIs. "+N vs. semana passada" vem de
// `getPreviousWeekArrivalsCount`; "barra ..." do tom do status da barra; os
// demais textos sao fixos. `tone`: success | warning | danger | neutral.
export function getDashboardKpiNotes(kpis, previousWeekArrivals, barTone) {
  const delta = (kpis?.chegadasNaSemana ?? 0) - (previousWeekArrivals ?? 0)
  const arrivals =
    delta > 0
      ? { text: `+${delta} vs. semana passada`, tone: 'success' }
      : delta < 0
        ? { text: `−${Math.abs(delta)} vs. semana passada`, tone: 'neutral' }
        : { text: 'igual à semana passada', tone: 'neutral' }

  const berthing =
    barTone === 'warn'
      ? { text: 'barra com restrições', tone: 'warning' }
      : barTone === 'danger'
        ? { text: 'barra impraticável', tone: 'danger' }
        : barTone === 'ok'
          ? { text: 'barra praticável', tone: 'success' }
          : { text: 'condição da barra indisponível', tone: 'neutral' }

  return {
    chegadasNaSemana: arrivals,
    emTransito: { text: 'embarcados, a caminho', tone: 'neutral' },
    aguardandoAtracacao: berthing,
    canalVermelho:
      (kpis?.canalVermelho ?? 0) > 0
        ? { text: 'exige ação', tone: 'danger' }
        : { text: 'nenhum em canal vermelho', tone: 'neutral' },
  }
}

// Rotulos da pilula da barra com acentuacao (o repositorio guarda o rotulo
// operacional em caixa alta sem acento; o mock usa "Praticável c/ restrições").
const BAR_STATUS_DISPLAY_LABELS = {
  PRATICAVEL: 'Praticável',
  PRATICAVEL_RESTRICOES: 'Praticável c/ restrições',
  IMPRATICAVEL: 'Impraticável',
}

export function formatBarStatusLabel(barStatus) {
  return BAR_STATUS_DISPLAY_LABELS[barStatus?.status] ?? barStatus?.label ?? ''
}

// D10: resumo do comunicado = 140 primeiros caracteres de `content` (espacos e
// quebras de linha colapsados; "…" quando truncado). Nenhum campo novo no banco.
export const ANNOUNCEMENT_SUMMARY_MAX = 140

export function summarizeAnnouncement(content, max = ANNOUNCEMENT_SUMMARY_MAX) {
  const text = String(content ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

// "Hoje" / "Ontem" / dd/mm (+ano se de outro ano), pela data LOCAL do comunicado.
export function getAnnouncementDayLabel(announcement, now = new Date()) {
  const key = toDateKeyLocal(announcement?.updatedAt ?? announcement?.createdAt ?? '')
  if (!key) return ''
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === toDateKeyLocal(now)) return 'Hoje'
  if (key === toDateKeyLocal(yesterday)) return 'Ontem'
  return formatShortDate(key, now)
}
