import { getCollectionWindows } from '../../utils/collectionWindows'
import { summarizeCargoConferenceProgress } from './cargoConferenceModel'
import { fromCargoReportDoc, fromConferenceDoc, CARGO_CONFERENCE_STATUS } from './cargoReportFormModel'
import { DERIVED_STATUS_PHASES, getProcessDerivedStatus } from './processDerivedStatus'
import { getProcessTitle } from './processLabels'
import { normalizeComparableText } from './processStatus'
import { getProcessPurchaseOrders } from './purchaseOrders'

// S9-F do Relatório de Carga: lista e contador da aba Conferência (celular). Módulo puro, sem React e sem Firebase:
// quem lê os dados (processos e relatórios) é `useCargoConferenceList`; aqui ficam as regras de quem entra na lista,
// o estado de cada cartão, o texto de "quando", a busca, a ordem e a contagem do que falta conferir.

// Fases em que existe carga para conferir (Atrasado só existe antes de haver coleta datada; Concluído entra enquanto o
// processo não é arquivado, porque "Carga disponível em estoque" vira Concluído antes de Recebida no CD).
export const CARGO_CONFERENCE_PHASES = [
  DERIVED_STATUS_PHASES.COLETA_AGENDADA,
  DERIVED_STATUS_PHASES.EM_ROTA,
  DERIVED_STATUS_PHASES.POS_RECEBIMENTO,
  DERIVED_STATUS_PHASES.CONCLUIDO,
]

// Arquivado (manual ou automático, 7 dias depois do recebimento) sai da lista, como em Chegadas.
export function isCargoConferenceCandidate(process, now = new Date()) {
  if (!process || process.archived === true) return false
  return CARGO_CONFERENCE_PHASES.includes(getProcessDerivedStatus(process, now).phase)
}

export const CARGO_CONFERENCE_STATES = {
  loading: 'carregando',
  error: 'erro',
  blocked: 'sem',
  fresh: 'nova',
  inProgress: 'andamento',
  closed: 'fechada',
}

// `report`: `{ current, conference }` de `getCargoReport` (ou `undefined` enquanto não chegou). `error`: a leitura falhou.
// -> { processId, process, state, done, total, comexStatus: 'rascunho' | 'concluido' | '', phase: { phase, label, tone } }
export function summarizeCargoConferenceEntry(process, report, { error = false, now = new Date() } = {}) {
  const base = {
    processId: process?.id ?? '',
    process,
    done: 0,
    total: 0,
    comexStatus: '',
    phase: getProcessDerivedStatus(process, now),
  }
  if (error) return { ...base, state: CARGO_CONFERENCE_STATES.error }
  if (!report) return { ...base, state: CARGO_CONFERENCE_STATES.loading }
  if (!report.current) return { ...base, state: CARGO_CONFERENCE_STATES.blocked }

  const form = fromCargoReportDoc(report.current)
  const conference = fromConferenceDoc(report.conference, report.current.rows, report.current)
  const { done, total } = summarizeCargoConferenceProgress(form.rows, conference)
  const comexStatus = form.status === 'concluido' ? 'concluido' : 'rascunho'
  let state = CARGO_CONFERENCE_STATES.inProgress
  if (conference.status === CARGO_CONFERENCE_STATUS.closed) state = CARGO_CONFERENCE_STATES.closed
  else if (done === 0 && !conference.receiptStatus && !conference.nfNumber) state = CARGO_CONFERENCE_STATES.fresh
  return { ...base, state, done, total, comexStatus }
}

// ---------- texto de "quando" e de fornecedor ----------

function pad(value) {
  return String(value).padStart(2, '0')
}

// Dias de calendário (no fuso do aparelho) de `date` em relação a `now`: nunca converter para UTC.
function calendarDayDiff(date, now) {
  const left = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const right = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((left.getTime() - right.getTime()) / 86400000)
}

function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDayMonth(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

function toValidDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Janelas de coleta com data (dual schema: `getCollectionWindows` já lê o legado `collectionScheduledAt`), em ordem.
function datedWindowDates(process) {
  return getCollectionWindows(process)
    .map((window) => toValidDate(window?.scheduledAt))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime())
}

// Próxima coleta datada (a mais cedo que ainda não passou) ou `null`.
function nextCollectionDate(process, now) {
  return datedWindowDates(process).find((date) => date.getTime() >= now.getTime()) ?? null
}

function lastCollectionDate(process, now) {
  const past = datedWindowDates(process).filter((date) => date.getTime() < now.getTime())
  return past.length > 0 ? past[past.length - 1] : null
}

function describeCollectionDay(date, now) {
  const diff = calendarDayDiff(date, now)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  return formatDayMonth(date)
}

// "Coleta hoje 14:00" / "Coleta amanhã 09:30" / "Coleta 28/11 10:00"; em rota "Coleta feita 24/11" ou "A caminho do CD";
// recebida "Recebida hoje" / "Recebida ontem" / "Recebida 21/11" ou "Recebida no CD".
export function describeCargoConferenceWhen(process, phase, now = new Date()) {
  if (phase === DERIVED_STATUS_PHASES.COLETA_AGENDADA) {
    const next = nextCollectionDate(process, now)
    return next ? `Coleta ${describeCollectionDay(next, now)} ${formatClock(next)}` : 'Coleta agendada'
  }
  if (phase === DERIVED_STATUS_PHASES.EM_ROTA) {
    const last = lastCollectionDate(process, now)
    return last ? `Coleta feita ${formatDayMonth(last)}` : 'A caminho do CD'
  }
  if (phase === DERIVED_STATUS_PHASES.POS_RECEBIMENTO || phase === DERIVED_STATUS_PHASES.CONCLUIDO) {
    const received = toValidDate(process?.cargoReceivedAt)
    if (!received) return 'Recebida no CD'
    const diff = calendarDayDiff(received, now)
    if (diff === 0) return 'Recebida hoje'
    if (diff === -1) return 'Recebida ontem'
    return `Recebida ${formatDayMonth(received)}`
  }
  return ''
}

export function describeCargoConferenceCategory(category) {
  return category === 'AEREO' ? 'AÉREO' : String(category ?? '')
}

// FCL/LCL/AÉREO: o fornecedor do processo; CONSOLIDADO: quantas POs.
export function describeCargoConferenceSupplier(process) {
  if (process?.category === 'CONSOLIDADO') {
    const count = getProcessPurchaseOrders(process).length
    return `${count} ${count === 1 ? 'PO' : 'POs'}`
  }
  return String(process?.supplierName ?? '').trim() || 'Fornecedor não informado'
}

// ---------- filtro, busca e ordem ----------

function searchText(process, canSeeName) {
  const orders = getProcessPurchaseOrders(process)
  return normalizeComparableText(
    [
      getProcessTitle(process, canSeeName),
      process?.processNumber,
      process?.supplierName,
      ...orders.flatMap((order) => [order.po, order.reference, order.supplierName]),
      process?.category,
      describeCargoConferenceCategory(process?.category),
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function phaseRank(entry) {
  const index = CARGO_CONFERENCE_PHASES.indexOf(entry.phase?.phase)
  const rank = index < 0 ? CARGO_CONFERENCE_PHASES.length : index
  // Sem relatório (bloqueado) e com erro de leitura vão para o fim.
  return entry.state === CARGO_CONFERENCE_STATES.blocked || entry.state === CARGO_CONFERENCE_STATES.error
    ? rank + CARGO_CONFERENCE_PHASES.length
    : rank
}

function collectionTime(entry, now) {
  if (entry.phase?.phase !== DERIVED_STATUS_PHASES.COLETA_AGENDADA) return 0
  return nextCollectionDate(entry.process, now)?.getTime() ?? Number.MAX_SAFE_INTEGER
}

// `filter`: 'pendentes' (tudo que não está fechado) | 'fechadas'. `query`: busca sem acento e sem caixa.
// Ordem: Coleta agendada (data crescente), Carga a caminho do CD, Recebida no CD, Concluído; bloqueados e com erro
// no fim; empate pelo título.
export function filterCargoConferenceEntries(
  entries,
  { filter = 'pendentes', query = '', canSeeName = false, now = new Date() } = {}
) {
  const needle = normalizeComparableText(query).trim()
  const closedOnly = filter === 'fechadas'
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => (entry.state === CARGO_CONFERENCE_STATES.closed) === closedOnly)
    .filter((entry) => !needle || searchText(entry.process, canSeeName).includes(needle))
    .map((entry) => ({
      entry,
      rank: phaseRank(entry),
      time: collectionTime(entry, now),
      title: String(getProcessTitle(entry.process, canSeeName) ?? ''),
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank || left.time - right.time || left.title.localeCompare(right.title, 'pt-BR')
    )
    .map((item) => item.entry)
}

// Contador da aba: o que ainda falta conferir (nova ou em andamento). Bloqueados, fechadas, com erro e em
// carregamento não entram.
export function countCargoConferencesToDo(entries) {
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry.state === CARGO_CONFERENCE_STATES.fresh || entry.state === CARGO_CONFERENCE_STATES.inProgress
  ).length
}

// Contagem por filtro para os chips: "Para conferir" = tudo que não é fechada; "Fechadas" = fechada.
export function countCargoConferenceFilters(entries) {
  const list = Array.isArray(entries) ? entries : []
  const closed = list.filter((entry) => entry.state === CARGO_CONFERENCE_STATES.closed).length
  return { pendentes: list.length - closed, fechadas: closed }
}
