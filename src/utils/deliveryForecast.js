function pad(value) {
  return String(value).padStart(2, '0')
}

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'

const DEFAULT_CATEGORY_BUSINESS_DAYS = {
  FCL: 5,
  LCL: 7,
  AEREO: 10,
  CONSOLIDADO: 5,
}

const DEFAULT_ROLLING_CUSTOMS = Object.freeze({
  enabled: true,
  businessDaysAfterBerth: 3,
  appliesTo: Object.freeze(['FCL', 'CONSOLIDADO']),
  duimpStatuses: Object.freeze(['aguardando registro', 'aguardando registro da duimp']),
})

const DEFAULT_DESTINATIONS = Object.freeze([
  Object.freeze({ match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 }),
  Object.freeze({ match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 0 }),
])

export const DEFAULT_FORECAST_SETTINGS = Object.freeze({
  destinations: DEFAULT_DESTINATIONS,
  categoryBusinessDays: DEFAULT_CATEGORY_BUSINESS_DAYS,
  rollingCustoms: DEFAULT_ROLLING_CUSTOMS,
  updatedAt: null,
  updatedBy: null,
})

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function getCurrentDateInTimeZone(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)

  if (!year || !month || !day) return startOfDay(new Date())

  return new Date(year, month - 1, day)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getEasterDate(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function getNationalHolidayKeys(year) {
  const easter = getEasterDate(year)

  return new Set([
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
    toDateKey(addDays(easter, -48)),
    toDateKey(addDays(easter, -47)),
    toDateKey(addDays(easter, -2)),
    toDateKey(easter),
    toDateKey(addDays(easter, 60)),
  ])
}

function isBusinessDay(date) {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  return !getNationalHolidayKeys(date.getFullYear()).has(toDateKey(date))
}

function isCollectionScheduled(status) {
  return normalizeText(status) === 'coleta agendada'
}

function isAfterCutoff(date, cutoffHour) {
  const scheduledMinutes =
    date.getHours() * 60 +
    date.getMinutes() +
    date.getSeconds() / 60 +
    date.getMilliseconds() / 60000

  return scheduledMinutes > cutoffHour * 60
}

function getNextBusinessDay(date) {
  let currentDate = startOfDay(date)

  do {
    currentDate = addDays(currentDate, 1)
  } while (!isBusinessDay(currentDate))

  return currentDate
}

function addBusinessDays(date, businessDays) {
  let currentDate = startOfDay(date)
  let addedDays = 0

  while (addedDays < businessDays) {
    currentDate = addDays(currentDate, 1)
    if (isBusinessDay(currentDate)) {
      addedDays += 1
    }
  }

  return currentDate
}

function resolveSettings(settings) {
  if (settings && typeof settings === 'object') return settings
  return DEFAULT_FORECAST_SETTINGS
}

function resolveDestinations(settings) {
  const candidates = settings?.destinations
  if (Array.isArray(candidates) && candidates.length > 0) return candidates
  return DEFAULT_DESTINATIONS
}

function findDestinationRule(settings, destination) {
  if (!destination) return null
  const normalizedDestination = normalizeText(destination)
  if (!normalizedDestination) return null
  return resolveDestinations(settings).find((entry) =>
    normalizedDestination.includes(normalizeText(entry?.match))
  ) ?? null
}

export function getScheduledCollectionDeliveryDate(process, settings) {
  if (!process || !isCollectionScheduled(process.collectionStatus)) return ''

  const scheduledAt = parseDateTime(process.collectionScheduledAt)
  if (!scheduledAt) return ''

  const resolvedSettings = resolveSettings(settings)
  const rule = findDestinationRule(resolvedSettings, process.destination)
  if (!rule) return ''

  const scheduledDate = startOfDay(scheduledAt)
  const isWeekend = !isBusinessDay(scheduledDate)
  const afterCutoff = isAfterCutoff(scheduledAt, rule.cutoffHour)

  if (isWeekend || afterCutoff) {
    return toDateKey(getNextBusinessDay(scheduledDate))
  }

  return toDateKey(scheduledDate)
}

export function getScheduledCollectionDeliveryShift(process, settings) {
  if (!process || !isCollectionScheduled(process.collectionStatus)) return ''

  const scheduledAt = parseDateTime(process.collectionScheduledAt)
  if (!scheduledAt) return ''

  const resolvedSettings = resolveSettings(settings)
  const rule = findDestinationRule(resolvedSettings, process.destination)
  if (!rule) return 'Vespertino'

  const scheduledDate = startOfDay(scheduledAt)
  const isWeekend = !isBusinessDay(scheduledDate)
  if (isWeekend) return 'Matutino'
  if (isAfterCutoff(scheduledAt, rule.cutoffHour)) return 'Matutino'

  return 'Vespertino'
}

function getBusinessDaysToAdd(category, settings) {
  const resolvedSettings = resolveSettings(settings)
  const map = resolvedSettings?.categoryBusinessDays ?? DEFAULT_CATEGORY_BUSINESS_DAYS
  const value = map?.[category]
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function normalizeDeliveryDateOverride(value) {
  const normalizedValue = String(value ?? '').trim()
  const date = parseDate(normalizedValue)
  return date ? toDateKey(date) : ''
}

function ensureDeliveryNotBeforeEta(deliveryDate, eta) {
  const parsedDeliveryDate = parseDate(deliveryDate)
  if (!parsedDeliveryDate) return ''

  const parsedEta = parseDate(eta)
  if (!parsedEta || parsedDeliveryDate >= parsedEta) return toDateKey(parsedDeliveryDate)

  return toDateKey(parsedEta)
}

function getRollingCustomsForecastBaseDate(process) {
  const currentDate = getCurrentDateInTimeZone(SAO_PAULO_TIME_ZONE)
  const etaDate = parseDate(process?.eta)

  if (etaDate && etaDate > currentDate) return etaDate

  return currentDate
}

function shouldUseRollingCustomsForecast(process, settings) {
  if (!process || typeof process !== 'object') return false

  const resolvedSettings = resolveSettings(settings)
  const rolling = resolvedSettings?.rollingCustoms ?? DEFAULT_ROLLING_CUSTOMS
  if (!rolling?.enabled) return false

  const appliesTo = Array.isArray(rolling.appliesTo) ? rolling.appliesTo : []
  if (!appliesTo.includes(process.category)) return false
  if (!process.berthed) return false

  const duimpStatus = normalizeText(process.duimpStatus)
  const allowedStatuses = Array.isArray(rolling.duimpStatuses)
    ? rolling.duimpStatuses.map((status) => normalizeText(status))
    : []

  if (allowedStatuses.length === 0) return !duimpStatus
  if (!duimpStatus) return true
  return allowedStatuses.includes(duimpStatus)
}

export function getAutomaticEstimatedDeliveryDate(processOrEta, category, settings) {
  if (typeof processOrEta === 'object' && processOrEta !== null) {
    const scheduledCollectionDate = getScheduledCollectionDeliveryDate(processOrEta, settings)
    if (scheduledCollectionDate) {
      return ensureDeliveryNotBeforeEta(scheduledCollectionDate, processOrEta.eta)
    }

    if (shouldUseRollingCustomsForecast(processOrEta, settings)) {
      const resolvedSettings = resolveSettings(settings)
      const rolling = resolvedSettings?.rollingCustoms ?? DEFAULT_ROLLING_CUSTOMS
      const rollingForecastDate = toDateKey(
        addBusinessDays(getRollingCustomsForecastBaseDate(processOrEta), rolling.businessDaysAfterBerth)
      )
      return ensureDeliveryNotBeforeEta(rollingForecastDate, processOrEta.eta)
    }

    return ensureDeliveryNotBeforeEta(
      getAutomaticEstimatedDeliveryDate(processOrEta.eta, processOrEta.category, settings),
      processOrEta.eta
    )
  }

  const eta = processOrEta
  const baseDate = parseDate(eta)
  const businessDays = getBusinessDaysToAdd(category, settings)

  if (!baseDate || !businessDays) return ''

  return toDateKey(addBusinessDays(baseDate, businessDays))
}

export function getEstimatedDeliveryDate(processOrEta, category, settings) {
  if (typeof processOrEta === 'object' && processOrEta !== null) {
    const manualDate = normalizeDeliveryDateOverride(processOrEta.warehouseDeliveryDateOverride)
    if (manualDate) return manualDate
  }

  return getAutomaticEstimatedDeliveryDate(processOrEta, category, settings)
}
