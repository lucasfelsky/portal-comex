// Ciclo 2a (redesign Fase 2 - Dashboard): faixa de KPIs.
// Modulo puro (sem React), testavel em unidade sem render.
// Reusa `getWeeklyArrivalProcesses` (WeeklyArrivalsCard.jsx) e
// `normalizeComparableText` (processStatus.js) — nao reimplementa
// nenhuma logica de status/data ja existente.
import { getWeeklyArrivalProcesses } from './WeeklyArrivalsCard'
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
