// F17.5a (A-2): regras puras de alertas operacionais diarios (job agendado
// `sendDailyProcessAlerts`). Modulo PURO - importa SO de `./milestones.js`
// (ja puro, proibido de importar `shared.js`). Zero I/O aqui - o runner
// (`./dailyAlerts.js`) e' quem le/grava Firestore. Ver PLAN.md A-2.

import {
  hasArrivalSignalMirror,
  hasParameterizationSignalMirror,
  isCustomsClearedMirror,
} from './milestones.js'

export const ALERTS_TIME_ZONE = 'America/Sao_Paulo'
export const DEFAULT_CLEARANCE_OVERDUE_DAYS = 3
export const CLEARANCE_OVERDUE_DAYS_BOUNDS = { min: 1, max: 30 }
export const ETA_OVERDUE_DAYS = 2
export const FREE_TIME_ALERT_DAYS = [5, 2]
export const FREE_TIME_CATEGORIES_MIRROR = ['FCL', 'CONSOLIDADO']

function pad2(value) {
  return String(value).padStart(2, '0')
}

// O runtime das functions roda em UTC - o "hoje" tem que ser calculado no
// fuso de Sao Paulo (America/Sao_Paulo), NUNCA via `toISOString()`/`getDate()`
// (viraria o dia anterior entre 21h e 23h59 BRT).
export function getSaoPauloDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ALERTS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseDateKey(key) {
  const [year, month, day] = String(key ?? '').split('-').map(Number)
  return { year, month, day }
}

// Aritmetica de calendario via `Date.UTC` - independe do fuso do processo
// que estiver rodando o Node.
export function addDaysToKey(key, days) {
  const { year, month, day } = parseDateKey(key)
  const date = new Date(Date.UTC(year, month - 1, day + Number(days)))
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

export function diffDaysBetweenKeys(fromKey, toKey) {
  const from = parseDateKey(fromKey)
  const to = parseDateKey(toKey)
  const fromMs = Date.UTC(from.year, from.month - 1, from.day)
  const toMs = Date.UTC(to.year, to.month - 1, to.day)
  return Math.round((toMs - fromMs) / 86400000)
}

export function toSaoPauloDateKey(value) {
  if (value == null) return ''
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return getSaoPauloDateKey(value.toDate())
  }

  const trimmed = String(value).trim()
  if (!trimmed) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed.slice(0, 10)

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return ''
  return getSaoPauloDateKey(date)
}

export function formatDateKeyBr(key) {
  const parts = String(key ?? '').split('-')
  if (parts.length !== 3) return String(key ?? '')
  const [year, month, day] = parts
  if (!year || !month || !day) return String(key ?? '')
  return `${day}/${month}/${year}`
}

// Paridade com `normalizeOperationalAlerts` (`forecastSettingsRepository.js`,
// A-6): `undefined`/nao-finito -> default 3; senao clamp 1..30 (inteiro
// truncado).
export function normalizeClearanceOverdueDaysMirror(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_CLEARANCE_OVERDUE_DAYS
  const intValue = Math.trunc(parsed)
  if (intValue < CLEARANCE_OVERDUE_DAYS_BOUNDS.min) return CLEARANCE_OVERDUE_DAYS_BOUNDS.min
  if (intValue > CLEARANCE_OVERDUE_DAYS_BOUNDS.max) return CLEARANCE_OVERDUE_DAYS_BOUNDS.max
  return intValue
}

// Espelhos locais (identicos aos de `src/features/processes/arrivalCustoms.js`)
// - `functions/` nao pode importar de `src/`.
function hasDateValueMirror(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object' && typeof value.toDate === 'function') return true
  return false
}

function hasCargoPresenceSignalLocal(process) {
  return hasDateValueMirror(process?.cargoPresenceInformedAt) || process?.cargoPresenceInformed === true
}

// Espelho de `getFreeTimeStatus` (`arrivalCustoms.js`) recebendo a CHAVE do
// dia (`todayKey`) em vez de um `Date`. Teste de paridade em
// `tests/unit/operationalAlerts.test.js`.
export function getFreeTimeStatusMirror(process, todayKey) {
  if (!FREE_TIME_CATEGORIES_MIRROR.includes(process?.category)) return null

  if (process?.freeTimeDays == null) {
    return { state: 'not-informed', deadlineKey: null, daysRemaining: null }
  }

  if (!hasCargoPresenceSignalLocal(process)) {
    return { state: 'waiting-presence', deadlineKey: null, daysRemaining: null }
  }

  if (!hasDateValueMirror(process?.cargoPresenceInformedAt)) {
    return { state: 'presence-without-date', deadlineKey: null, daysRemaining: null }
  }

  const containers = Array.isArray(process?.containers) ? process.containers : []
  if (containers.length > 0 && containers.every((container) => hasDateValueMirror(container?.returnedAt))) {
    return { state: 'closed', deadlineKey: null, daysRemaining: null }
  }

  const presenceDateKey = String(process.cargoPresenceInformedAt).slice(0, 10)
  const deadlineKey = addDaysToKey(presenceDateKey, Number(process.freeTimeDays))
  const daysRemaining = diffDaysBetweenKeys(todayKey, deadlineKey)

  let state = 'running'
  if (daysRemaining === 0) state = 'due-today'
  else if (daysRemaining < 0) state = 'overdue'

  return { state, deadlineKey, daysRemaining }
}

// Monta os alertas do dia (sem texto final - o rotulo e' montado pelo
// runner via `buildDailyAlertsText`). Ignora arquivados e recebidos (defesa
// em profundidade - a query do runner ja filtra recebidos).
export function buildOperationalAlerts(processes, { todayKey, clearanceOverdueDays }) {
  const alerts = []
  const list = Array.isArray(processes) ? processes : []

  for (const process of list) {
    if (process?.archived === true) continue
    if (String(process?.processStatus ?? '').trim() === 'Carga recebida') continue

    const processId = process?.id

    const freeTimeStatus = getFreeTimeStatusMirror(process, todayKey)
    if (freeTimeStatus?.state === 'running' && FREE_TIME_ALERT_DAYS.includes(freeTimeStatus.daysRemaining)) {
      alerts.push({
        kind: 'freeTime',
        processId,
        process,
        sortRank: freeTimeStatus.daysRemaining === 2 ? 0 : 1,
        daysRemaining: freeTimeStatus.daysRemaining,
        deadlineKey: freeTimeStatus.deadlineKey,
      })
    }

    if (!String(process?.carrierName ?? '').trim()) {
      const tomorrowKey = addDaysToKey(todayKey, 1)
      const scheduledKeys = new Set()
      const windows = Array.isArray(process?.collectionWindows) ? process.collectionWindows : []
      for (const window of windows) {
        const key = toSaoPauloDateKey(window?.scheduledAt)
        if (key) scheduledKeys.add(key)
      }
      const legacyKey = toSaoPauloDateKey(process?.collectionScheduledAt)
      if (legacyKey) scheduledKeys.add(legacyKey)

      if (scheduledKeys.has(tomorrowKey)) {
        alerts.push({
          kind: 'collectionWithoutCarrier',
          processId,
          process,
          sortRank: 2,
          dateKey: tomorrowKey,
        })
      }
    }

    const etaKey = toSaoPauloDateKey(process?.eta)
    if (etaKey && !hasArrivalSignalMirror(process)) {
      const days = diffDaysBetweenKeys(etaKey, todayKey)
      if (days > ETA_OVERDUE_DAYS) {
        alerts.push({
          kind: 'etaOverdue',
          processId,
          process,
          sortRank: 3,
          days,
          arrivalLabel: process?.category === 'AEREO' ? 'chegada' : 'atracação',
        })
      }
    }

    if (hasParameterizationSignalMirror(process) && !isCustomsClearedMirror(process)) {
      const paramKey = toSaoPauloDateKey(process?.parameterizedAt)
      if (paramKey) {
        const days = diffDaysBetweenKeys(paramKey, todayKey)
        if (days > clearanceOverdueDays) {
          alerts.push({
            kind: 'clearanceOverdue',
            processId,
            process,
            sortRank: 4,
            days,
          })
        }
      }
    }
  }

  return alerts.sort((a, b) => {
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank
    return String(a.processId ?? '').localeCompare(String(b.processId ?? ''))
  })
}

export function buildDailyAlertsText(alerts, labelFor) {
  const title = `Alertas operacionais do dia (${alerts.length})`

  const itemTexts = alerts.map((alert) => {
    const label = labelFor(alert.process)

    if (alert.kind === 'freeTime') {
      return `Free time de ${label} vence em ${alert.daysRemaining} dias (${formatDateKeyBr(alert.deadlineKey)})`
    }
    if (alert.kind === 'collectionWithoutCarrier') {
      return `Coleta de ${label} amanhã (${formatDateKeyBr(alert.dateKey)}) sem transportadora`
    }
    if (alert.kind === 'etaOverdue') {
      return `ETA de ${label} vencida há ${alert.days} dias sem ${alert.arrivalLabel}`
    }
    if (alert.kind === 'clearanceOverdue') {
      return `${label} parametrizada há ${alert.days} dias sem desembaraço`
    }
    return ''
  })

  const limited = itemTexts.slice(0, 8)
  const remaining = itemTexts.length - limited.length
  const body = remaining > 0 ? `${limited.join('; ')} e mais ${remaining}.` : `${limited.join('; ')}.`

  return { title, body }
}
