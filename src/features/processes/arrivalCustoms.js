// F17.3a (D-1): camada pura de compatibilidade para chegada (atracacao
// maritima / chegada aerea), CE/terminal, free time e presenca de carga.
// ZERO imports - roda no app, no script de migracao (Node ESM puro) e e'
// seguro pro mock fechado de `tests/ui/ProcessesPage.test.jsx`. Categorias e
// texto comparados por literal/normalizacao LOCAL (mesmo padrao de
// `./licenses.js`, D-1 do F17.2b). Ver PLAN.md secao "Decisoes tomadas" D-1.

export const FREE_TIME_CATEGORIES = ['FCL', 'CONSOLIDADO']
export const CE_HOUSE_CATEGORIES = ['LCL', 'CONSOLIDADO']
export const APPROX_DATE_FIELDS = ['berthedAt', 'arrivedAt']

function isMaritimeCategoryLocal(category) {
  return category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO'
}

function isAirCategoryLocal(category) {
  return category === 'AEREO'
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function hasDateValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object' && typeof value.toDate === 'function') return true
  return false
}

// D-1: NUNCA `toISOString()` - horario local (`getFullYear/getMonth/...`)
// pra nao virar o dia anterior em BRT (UTC-3).
export function normalizeDateTimeLocal(value) {
  if (value == null) return ''

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate()
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }

  const trimmed = String(value).trim()
  if (!trimmed) return ''

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed.slice(0, 16)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00`
  }

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

// D-1: `0` e' valor VALIDO ("sem free time"), distinto de "nao informado"
// (`null`). NAO usar `normalizeInteger`/`normalizeDecimal` de
// `operationalOptions.js` (devolvem 0 pra entrada invalida).
export function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(String(value).trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.trunc(parsed)
}

export function normalizeOptionalDecimal(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).trim().replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

// Mesma semantica da funcao privada `hasArrivalSignal` de
// `deriveProcessStatus.js` (D-15 - o arquivo passa a importar daqui).
export function hasArrivalSignal(process) {
  if (isMaritimeCategoryLocal(process?.category)) {
    return hasDateValue(process?.berthedAt) || process?.berthed === true
  }
  if (isAirCategoryLocal(process?.category)) {
    return hasDateValue(process?.arrivedAt) || process?.arrived === true
  }
  return false
}

export function hasCargoPresenceSignal(process) {
  return hasDateValue(process?.cargoPresenceInformedAt) || process?.cargoPresenceInformed === true
}

export function isLegacyArrivalWithoutDate(process) {
  if (isMaritimeCategoryLocal(process?.category)) {
    return process?.berthed === true && !hasDateValue(process?.berthedAt)
  }
  if (isAirCategoryLocal(process?.category)) {
    return process?.arrived === true && !hasDateValue(process?.arrivedAt)
  }
  return false
}

export function isLegacyCargoPresenceWithoutDate(process) {
  return process?.cargoPresenceInformed === true && !hasDateValue(process?.cargoPresenceInformedAt)
}

export function isApproxDate(process, field) {
  return Array.isArray(process?.migratedApproxFields) && process.migratedApproxFields.includes(field)
}

// D-1: so' as strings de `APPROX_DATE_FIELDS`, dedup, e so' as que AINDA tem
// data preenchida no processo (o marcador cai sozinho quando a data e'
// limpa/editada).
export function normalizeMigratedApproxFields(raw, process) {
  if (!Array.isArray(raw)) return []
  const deduped = [...new Set(raw.filter((field) => APPROX_DATE_FIELDS.includes(field)))]
  return deduped.filter((field) => hasDateValue(process?.[field]))
}

// D-1: so' pra `berthedAt`/`arrivedAt`/`cargoPresenceInformedAt` - grava a
// data, espelha o bool legado (preencher -> true; limpar -> false) e remove
// o campo de `migratedApproxFields` (a edicao manual encerra a aproximacao).
export function applyArrivalDateEdit(draft, field, value) {
  if (field !== 'berthedAt' && field !== 'arrivedAt' && field !== 'cargoPresenceInformedAt') {
    return { ...draft, [field]: value }
  }

  const boolField =
    field === 'berthedAt' ? 'berthed' : field === 'arrivedAt' ? 'arrived' : 'cargoPresenceInformed'
  const nextHasDate = hasDateValue(value)
  const migratedApproxFields = Array.isArray(draft?.migratedApproxFields)
    ? draft.migratedApproxFields.filter((item) => item !== field)
    : []

  return {
    ...draft,
    [field]: value,
    [boolField]: nextHasDate,
    migratedApproxFields,
  }
}

// D-1: limpeza por categoria dos campos novos - mesmo padrao de
// `sanitizeCargoAndTransitFields` (F17.2a). So' recebe os campos que le; o
// chamador espalha o resultado por cima do objeto normalizado.
export function sanitizeArrivalFields(process) {
  const category = process?.category
  const migratedApproxFields = normalizeMigratedApproxFields(process?.migratedApproxFields, process)

  if (isMaritimeCategoryLocal(category)) {
    const berthedAt = normalizeDateTimeLocal(process?.berthedAt)
    const berthed = hasArrivalSignal({ category, berthedAt, berthed: process?.berthed })

    return {
      berthedAt,
      arrivedAt: '',
      berthed,
      arrived: false,
      ceMercante: String(process?.ceMercante ?? '').trim(),
      ceHouse: CE_HOUSE_CATEGORIES.includes(category) ? String(process?.ceHouse ?? '').trim() : '',
      terminalName: String(process?.terminalName ?? '').trim(),
      freeTimeDays: FREE_TIME_CATEGORIES.includes(category)
        ? normalizeOptionalInteger(process?.freeTimeDays)
        : null,
      demurrageDailyRateUsd: FREE_TIME_CATEGORIES.includes(category)
        ? normalizeOptionalDecimal(process?.demurrageDailyRateUsd)
        : null,
      migratedApproxFields,
    }
  }

  if (isAirCategoryLocal(category)) {
    const arrivedAt = normalizeDateTimeLocal(process?.arrivedAt)
    const arrived = hasArrivalSignal({ category, arrivedAt, arrived: process?.arrived })

    return {
      berthedAt: '',
      arrivedAt,
      berthed: false,
      arrived,
      ceMercante: '',
      ceHouse: '',
      terminalName: String(process?.terminalName ?? '').trim(),
      freeTimeDays: null,
      demurrageDailyRateUsd: null,
      migratedApproxFields,
    }
  }

  return {
    berthedAt: '',
    arrivedAt: '',
    berthed: false,
    arrived: false,
    ceMercante: '',
    ceHouse: '',
    terminalName: '',
    freeTimeDays: null,
    demurrageDailyRateUsd: null,
    migratedApproxFields: [],
  }
}

function toLocalDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// D-1 (A1): prazo de devolucao do vazio conta da PRESENCA DE CARGA (nao da
// atracacao). So' FCL/CONSOLIDADO (`FREE_TIME_CATEGORIES`).
export function getFreeTimeStatus(process, today = new Date()) {
  if (!FREE_TIME_CATEGORIES.includes(process?.category)) return null

  if (process?.freeTimeDays == null) {
    return { state: 'not-informed', deadlineKey: null, daysRemaining: null }
  }

  if (!hasCargoPresenceSignal(process)) {
    return { state: 'waiting-presence', deadlineKey: null, daysRemaining: null }
  }

  if (!hasDateValue(process?.cargoPresenceInformedAt)) {
    return { state: 'presence-without-date', deadlineKey: null, daysRemaining: null }
  }

  const containers = Array.isArray(process?.containers) ? process.containers : []
  if (containers.length > 0 && containers.every((container) => hasDateValue(container?.returnedAt))) {
    return { state: 'closed', deadlineKey: null, daysRemaining: null }
  }

  const presenceDateKey = String(process.cargoPresenceInformedAt).slice(0, 10)
  const [year, month, day] = presenceDateKey.split('-').map(Number)
  const deadlineDate = new Date(year, month - 1, day + Number(process.freeTimeDays))
  const deadlineKey = toLocalDateKey(deadlineDate)

  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const daysRemaining = Math.round((deadlineDate.getTime() - todayDate.getTime()) / 86400000)

  let state = 'running'
  if (daysRemaining === 0) state = 'due-today'
  else if (daysRemaining < 0) state = 'overdue'

  return { state, deadlineKey, daysRemaining }
}
