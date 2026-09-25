// F17.6: painel de lead time por modal x porto (util puro, sem I/O).
// Consome processos + eventos (`processes/{id}/events`, ja lidos por
// `processEventsRepository.js`) e produz amostras/estatistica/sugestao.
// Ver decisoes D-4..D-10 no PLAN.md da feature.
import { countBusinessDaysBetween } from '../../utils/deliveryForecast'

export const LEAD_TIME_EVENT_TYPES = [
  'shipped',
  'berthed',
  'arrived',
  'cargoPresence',
  'cleared',
  'collectionScheduled',
  'received',
]

export const LEAD_TIME_SEGMENTS = [
  { id: 'transit', label: 'Embarque → Atracação/Chegada', unit: 'corridos' },
  { id: 'customs', label: 'Presença de carga → Desembaraço', unit: 'corridos' },
  { id: 'toCollection', label: 'Desembaraço → Coleta', unit: 'corridos' },
  { id: 'collectionToReceipt', label: 'Coleta → Recebimento', unit: 'corridos' },
  { id: 'total', label: 'Embarque → Recebimento', unit: 'corridos' },
  { id: 'arrivalToReceiptBusiness', label: 'Atracação/Chegada → Recebimento', unit: 'uteis' },
]

export const MIN_SAMPLE_SIZE = 3
export const MIN_SAMPLE_FOR_SUGGESTION = 5
export const MAX_PLAUSIBLE_DAYS = 180
export const LEAD_TIME_CATEGORIES = ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO']

// Mesmos limites de `CATEGORY_BUSINESS_DAY_BOUNDS`
// (`forecastSettingsRepository.js:65`) - duplicado aqui por ser modulo puro
// sem dependencia de servicos (mesmo padrao de outras constantes
// espelhadas no repo, ex.: `isCollectionScheduleRetainingStatus`).
const CATEGORY_BUSINESS_DAY_BOUNDS = { min: 0, max: 30 }

export const PERIOD_OPTIONS = [
  { id: '90', days: 90, label: 'Últimos 90 dias' },
  { id: '180', days: 180, label: 'Últimos 180 dias' },
  { id: '365', days: 365, label: 'Últimos 365 dias' },
  { id: 'all', days: null, label: 'Todo o histórico' },
]

const ARRIVAL_TYPE_BY_CATEGORY = {
  FCL: 'berthed',
  LCL: 'berthed',
  CONSOLIDADO: 'berthed',
  AEREO: 'arrived',
}

const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/

// D-9: NUNCA converter a data pra ISO em UTC pra gerar a chave (quebra em
// BRT). Segue o padrao `toDateKey`/`toDateKeyLocal` do repo (nomes
// diferentes, mesma ideia): string sem fuso -> primeiros 10 chars (ja e
// BRT, F17.1b); ISO com Z/offset ou Date -> formata via Intl no fuso de
// Sao Paulo.
export function toSaoPauloDateKey(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return formatDateInSaoPaulo(value)
  }

  const text = String(value ?? '').trim()
  if (!text) return ''

  if (ISO_DATE_TIME_RE.test(text) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) {
    return text.slice(0, 10)
  }

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''

  return formatDateInSaoPaulo(date)
}

function formatDateInSaoPaulo(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Dias corridos entre duas chaves `YYYY-MM-DD` (Date.UTC evita DST).
export function diffCalendarDays(startKey, endKey) {
  const start = parseDateKeyUtc(startKey)
  const end = parseDateKeyUtc(endKey)
  if (start === null || end === null) return null
  return Math.round((end - start) / 86400000)
}

function parseDateKeyUtc(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''))
  if (!match) return null
  const [, y, m, d] = match
  return Date.UTC(Number(y), Number(m) - 1, Number(d))
}

export function getTodayKeySaoPaulo(now = new Date()) {
  return formatDateInSaoPaulo(now)
}

function normalizePortText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

// D-10: mesma regra de `findDestinationRule` (`deliveryForecast.js`),
// reimplementada localmente (modulo puro, sem import de `processes/`).
export function resolvePortLabel(destination, destinations) {
  const normalizedDestination = normalizePortText(destination)
  if (!normalizedDestination) return 'Sem destino'

  const rules = Array.isArray(destinations) ? destinations : []
  const rule = rules.find((entry) => normalizedDestination.includes(normalizePortText(entry?.match)))

  return rule?.label || String(destination).trim() || 'Sem destino'
}

// Escolhe, por tipo, o evento com `recordedAt` mais recente (D-6: reflete
// re-disparo do trigger apos correcao de status).
function pickLatestEventByType(events, type) {
  const candidates = (events ?? []).filter((event) => event?.type === type)
  if (candidates.length === 0) return null

  return candidates.reduce((latest, current) => {
    if (!latest) return current
    const latestTime = new Date(latest.recordedAt ?? 0).getTime()
    const currentTime = new Date(current.recordedAt ?? 0).getTime()
    return currentTime > latestTime ? current : latest
  }, null)
}

function resolveCollectionDateKey(event) {
  if (!event) return ''
  const fromValue = toSaoPauloDateKey(String(event.value ?? '').slice(0, 10))
  if (fromValue) return fromValue
  return toSaoPauloDateKey(event.occurredAt)
}

function buildCalendarSegment(startKey, endKey) {
  const days = diffCalendarDays(startKey, endKey)
  if (days === null) return { days: null, endKey: endKey || null, reason: !startKey || !endKey ? 'missing' : null }
  if (days < 0) return { days, endKey, reason: 'negative' }
  if (days > MAX_PLAUSIBLE_DAYS) return { days, endKey, reason: 'outlier' }
  return { days, endKey, reason: null }
}

// Monta as amostras de um processo (D-4..D-6). Processo arquivado ou fora
// de LEAD_TIME_CATEGORIES nao gera amostra.
export function buildProcessSamples(process, events) {
  const excluded = { negative: 0, outlier: 0, invalid: 0 }
  const samples = []

  const category = String(process?.category ?? '').toUpperCase()
  if (process?.archived === true || !LEAD_TIME_CATEGORIES.includes(category)) {
    return { samples, excluded }
  }

  const portLabelInput = process?.destination ?? ''

  const shippedEvent = pickLatestEventByType(events, 'shipped')
  const arrivalType = ARRIVAL_TYPE_BY_CATEGORY[category]
  const arrivalEvent = arrivalType ? pickLatestEventByType(events, arrivalType) : null
  const cargoPresenceEvent = pickLatestEventByType(events, 'cargoPresence')
  const clearedEvent = pickLatestEventByType(events, 'cleared')
  const collectionEvent = pickLatestEventByType(events, 'collectionScheduled')
  const receivedEvent = pickLatestEventByType(events, 'received')

  const shippedKey = toSaoPauloDateKey(shippedEvent?.occurredAt)
  const arrivalKey = toSaoPauloDateKey(arrivalEvent?.occurredAt)
  const cargoPresenceKey = toSaoPauloDateKey(cargoPresenceEvent?.occurredAt)
  const clearedKey = toSaoPauloDateKey(clearedEvent?.occurredAt)
  const collectionKey = collectionEvent ? resolveCollectionDateKey(collectionEvent) : ''
  const receivedKey = toSaoPauloDateKey(receivedEvent?.occurredAt)

  // Marco nao alcancado ainda (evento ausente) NAO e' descarte - o processo
  // simplesmente nao chegou nessa fase, e' o caso mais comum enquanto em
  // transito. So conta em `excluded.invalid` quando o EVENTO EXISTE mas a
  // data nao pode ser resolvida (dado corrompido).
  function pushCalendarSample(segmentId, startEvent, startKey, endEvent, endKey) {
    if (!startEvent || !endEvent) return
    if (!startKey || !endKey) {
      excluded.invalid += 1
      return
    }
    const { days, reason } = buildCalendarSegment(startKey, endKey)
    if (reason === 'negative') {
      excluded.negative += 1
      return
    }
    if (reason === 'outlier') {
      excluded.outlier += 1
      return
    }
    samples.push({ category, portLabel: portLabelInput, segmentId, days, endKey })
  }

  pushCalendarSample('transit', shippedEvent, shippedKey, arrivalEvent, arrivalKey)
  pushCalendarSample('customs', cargoPresenceEvent, cargoPresenceKey, clearedEvent, clearedKey)
  pushCalendarSample('toCollection', clearedEvent, clearedKey, collectionEvent, collectionKey)
  pushCalendarSample('collectionToReceipt', collectionEvent, collectionKey, receivedEvent, receivedKey)
  pushCalendarSample('total', shippedEvent, shippedKey, receivedEvent, receivedKey)

  if (arrivalEvent && receivedEvent) {
    if (!arrivalKey || !receivedKey) {
      excluded.invalid += 1
    } else {
      const businessDays = countBusinessDaysBetween(arrivalKey, receivedKey)
      if (businessDays === null) {
        excluded.negative += 1
      } else if (businessDays > MAX_PLAUSIBLE_DAYS) {
        excluded.outlier += 1
      } else {
        samples.push({
          category,
          portLabel: portLabelInput,
          segmentId: 'arrivalToReceiptBusiness',
          days: businessDays,
          endKey: receivedKey,
        })
      }
    }
  }

  return { samples, excluded }
}

export function computeStats(values) {
  const list = (values ?? []).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  const n = list.length

  if (n === 0) {
    return { n: 0, median: null, p80: null }
  }

  const median =
    n % 2 === 1 ? list[(n - 1) / 2] : (list[n / 2 - 1] + list[n / 2]) / 2

  const p80 = list[Math.ceil(0.8 * n) - 1]

  return { n, median, p80 }
}

const ALL_PORTS_LABEL = 'Todos os portos'

// D-9/D-10: agrupa amostras por categoria x porto e monta os relatorios de
// cada trecho. `periodDays` filtra pela data de FIM do trecho (`endKey`);
// `null` = sem filtro (todo o historico).
export function buildLeadTimeReport({ processes, eventsByProcessId, destinations, periodDays, todayKey }) {
  const allSamples = []
  const excludedTotal = { negative: 0, outlier: 0, invalid: 0 }

  for (const process of processes ?? []) {
    const events = eventsByProcessId?.[process?.id] ?? []
    const { samples, excluded } = buildProcessSamples(process, events)
    allSamples.push(...samples)
    excludedTotal.negative += excluded.negative
    excludedTotal.outlier += excluded.outlier
    excludedTotal.invalid += excluded.invalid
  }

  const minEndKey = computeMinEndKey(periodDays, todayKey)
  const filteredSamples = minEndKey
    ? allSamples.filter((sample) => sample.endKey >= minEndKey)
    : allSamples

  const groups = LEAD_TIME_CATEGORIES.map((category) => {
    const categorySamples = filteredSamples.filter((sample) => sample.category === category)
    const portLabels = new Set(
      categorySamples.map((sample) => resolvePortLabel(sample.portLabel, destinations))
    )

    const rows = [...portLabels]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((portLabel) => buildRow(categorySamples, destinations, portLabel, false))

    if (categorySamples.length > 0) {
      rows.push(buildRow(categorySamples, destinations, ALL_PORTS_LABEL, true))
    }

    return { category, rows }
  }).filter((group) => group.rows.length > 0)

  return {
    groups,
    sampleCount: filteredSamples.length,
    excluded: excludedTotal,
  }
}

function computeMinEndKey(periodDays, todayKey) {
  if (!periodDays || !todayKey) return null
  const todayUtc = parseDateKeyUtc(todayKey)
  if (todayUtc === null) return null
  const minUtc = todayUtc - periodDays * 86400000
  const date = new Date(minUtc)
  return formatUtcDateKey(date)
}

function formatUtcDateKey(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildRow(categorySamples, destinations, portLabel, isAll) {
  const rowSamples = isAll
    ? categorySamples
    : categorySamples.filter((sample) => resolvePortLabel(sample.portLabel, destinations) === portLabel)

  const segments = {}
  for (const segment of LEAD_TIME_SEGMENTS) {
    const values = rowSamples
      .filter((sample) => sample.segmentId === segment.id)
      .map((sample) => sample.days)
    const stats = computeStats(values)
    segments[segment.id] = { ...stats, sufficient: stats.n >= MIN_SAMPLE_SIZE }
  }

  return { portLabel, isAll, segments }
}

// D-8: sugestao de dias uteis por modal, a partir da linha "Todos os
// portos" do trecho `arrivalToReceiptBusiness`.
export function buildBusinessDaysSuggestions(report, categoryBusinessDays) {
  return LEAD_TIME_CATEGORIES.map((category) => {
    const group = report?.groups?.find((entry) => entry.category === category)
    const allRow = group?.rows?.find((row) => row.isAll)
    const stat = allRow?.segments?.arrivalToReceiptBusiness ?? { n: 0, median: null, p80: null }
    const current = Number(categoryBusinessDays?.[category] ?? 0)

    let suggested = null
    if (stat.n >= MIN_SAMPLE_FOR_SUGGESTION && stat.median !== null) {
      const clamped = clampInt(
        Math.ceil(stat.median),
        CATEGORY_BUSINESS_DAY_BOUNDS.min,
        CATEGORY_BUSINESS_DAY_BOUNDS.max
      )
      suggested = clamped !== current ? clamped : null
    }

    return {
      category,
      current,
      n: stat.n,
      median: stat.median,
      p80: stat.p80,
      suggested,
    }
  })
}

function clampInt(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}
