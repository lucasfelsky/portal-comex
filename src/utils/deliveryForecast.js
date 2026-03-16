function pad(value) {
  return String(value).padStart(2, '0')
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
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

function getBusinessDaysToAdd(category) {
  if (category === 'LCL') return 7
  if (category === 'AEREO') return 10
  if (category === 'FCL' || category === 'CONSOLIDADO') return 5
  return 0
}

export function getEstimatedDeliveryDate(eta, category) {
  const baseDate = parseDate(eta)
  const businessDays = getBusinessDaysToAdd(category)

  if (!baseDate || !businessDays) return ''

  let currentDate = new Date(baseDate)
  let addedDays = 0

  while (addedDays < businessDays) {
    currentDate = addDays(currentDate, 1)
    if (isBusinessDay(currentDate)) {
      addedDays += 1
    }
  }

  return toDateKey(currentDate)
}
