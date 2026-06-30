import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite'
import { onSnapshot } from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { createAuditEvent } from './auditRepository'

const STORAGE_KEY = 'sq-comex-forecast-settings'
const DOCUMENT_ID = 'current'
const COLLECTION = 'forecastSettings'

export const CATEGORY_OPTIONS = ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO']

export const DEFAULT_FORECAST_SETTINGS = Object.freeze({
  destinations: [
    { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
    { match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 0 },
  ],
  categoryBusinessDays: {
    FCL: 5,
    LCL: 7,
    AEREO: 10,
    CONSOLIDADO: 5,
  },
  rollingCustoms: {
    enabled: true,
    businessDaysAfterBerth: 3,
    appliesTo: ['FCL', 'CONSOLIDADO'],
    duimpStatuses: ['aguardando registro', 'aguardando registro da duimp'],
  },
  updatedAt: null,
  updatedBy: null,
})

const CATEGORY_BUSINESS_DAY_BOUNDS = { min: 0, max: 30 }
const CUTOFF_HOUR_BOUNDS = { min: 0, max: 23 }
const CUTOFF_MINUTE_BOUNDS = { min: 0, max: 59 }

function clampInt(value, { min, max }, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const intValue = Math.trunc(parsed)
  if (intValue < min) return min
  if (intValue > max) return max
  return intValue
}

function normalizeString(value) {
  return String(value ?? '').trim()
}

function normalizeMatch(value) {
  return normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeDestination(rawDestination, fallback = DEFAULT_FORECAST_SETTINGS.destinations[0]) {
  if (!rawDestination || typeof rawDestination !== 'object') return fallback

  const match = normalizeMatch(rawDestination.match)
  const label = normalizeString(rawDestination.label) || (match ? match : fallback.label)
  const cutoffHour = clampInt(
    rawDestination.cutoffHour,
    CUTOFF_HOUR_BOUNDS,
    fallback.cutoffHour
  )
  const cutoffMinute = clampInt(
    rawDestination.cutoffMinute,
    CUTOFF_MINUTE_BOUNDS,
    fallback.cutoffMinute ?? 0
  )

  return { match, label, cutoffHour, cutoffMinute }
}

function normalizeCategoryBusinessDays(rawCategoryBusinessDays) {
  const fallback = DEFAULT_FORECAST_SETTINGS.categoryBusinessDays
  const source = rawCategoryBusinessDays ?? {}
  const result = {}

  for (const category of CATEGORY_OPTIONS) {
    result[category] = clampInt(
      source[category],
      CATEGORY_BUSINESS_DAY_BOUNDS,
      fallback[category]
    )
  }

  return result
}

function normalizeRollingCustoms(rawRollingCustoms) {
  const fallback = DEFAULT_FORECAST_SETTINGS.rollingCustoms
  const source = rawRollingCustoms ?? {}

  const appliesTo = Array.isArray(source.appliesTo)
    ? source.appliesTo
        .map((category) => normalizeString(category).toUpperCase())
        .filter((category) => CATEGORY_OPTIONS.includes(category))
    : fallback.appliesTo.slice()

  const duimpStatuses = Array.isArray(source.duimpStatuses)
    ? source.duimpStatuses
        .map((status) => normalizeText(status))
        .filter(Boolean)
    : fallback.duimpStatuses.slice()

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
    businessDaysAfterBerth: clampInt(
      source.businessDaysAfterBerth,
      CATEGORY_BUSINESS_DAY_BOUNDS,
      fallback.businessDaysAfterBerth
    ),
    appliesTo: appliesTo.length > 0 ? appliesTo : fallback.appliesTo.slice(),
    duimpStatuses: duimpStatuses.length > 0 ? duimpStatuses : fallback.duimpStatuses.slice(),
  }
}

function normalizeText(value) {
  return normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeUpdatedAt(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function normalizeForecastSettings(rawSettings) {
  const source = rawSettings ?? {}
  const destinations = Array.isArray(source.destinations)
    ? source.destinations
        .map((destination) => normalizeDestination(destination))
        .filter((destination) => destination.match)
    : DEFAULT_FORECAST_SETTINGS.destinations.slice()

  return {
    id: source.id ?? DOCUMENT_ID,
    destinations: destinations.length > 0 ? destinations : DEFAULT_FORECAST_SETTINGS.destinations.slice(),
    categoryBusinessDays: normalizeCategoryBusinessDays(source.categoryBusinessDays),
    rollingCustoms: normalizeRollingCustoms(source.rollingCustoms),
    updatedAt: normalizeUpdatedAt(source.updatedAt),
    updatedBy: source.updatedBy ?? null,
  }
}

function readLocalSettings() {
  const stored = window.localStorage.getItem(STORAGE_KEY)

  if (!stored) {
    return { ...DEFAULT_FORECAST_SETTINGS, id: DOCUMENT_ID, updatedAt: null, updatedBy: null }
  }

  try {
    return normalizeForecastSettings({ id: DOCUMENT_ID, ...JSON.parse(stored) })
  } catch {
    return { ...DEFAULT_FORECAST_SETTINGS, id: DOCUMENT_ID, updatedAt: null, updatedBy: null }
  }
}

function writeLocalSettings(settings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export async function getForecastSettings() {
  if (!isFirebaseConfigured || !firestore) {
    return readLocalSettings()
  }

  const snapshot = await getDoc(doc(firestore, COLLECTION, DOCUMENT_ID))

  if (!snapshot.exists()) {
    return { ...DEFAULT_FORECAST_SETTINGS, id: DOCUMENT_ID, updatedAt: null, updatedBy: null }
  }

  return normalizeForecastSettings({ id: snapshot.id, ...snapshot.data() })
}

function subscribeLocalSettings(onChange) {
  const settings = readLocalSettings()
  onChange(settings)
  return () => {}
}

export function subscribeForecastSettings(onChange) {
  if (!isFirebaseConfigured || !firestore) {
    return subscribeLocalSettings(onChange)
  }

  return onSnapshot(
    doc(firestore, COLLECTION, DOCUMENT_ID),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange({
          ...DEFAULT_FORECAST_SETTINGS,
          id: DOCUMENT_ID,
          updatedAt: null,
          updatedBy: null,
        })
        return
      }

      onChange(normalizeForecastSettings({ id: snapshot.id, ...snapshot.data() }))
    },
    (error) => {
      console.error('Não foi possível acompanhar as regras de previsão.', error)
    }
  )
}

function buildPayload(settings) {
  return {
    destinations: settings.destinations.map((destination) => ({
      match: destination.match,
      label: destination.label,
      cutoffHour: destination.cutoffHour,
      cutoffMinute: destination.cutoffMinute ?? 0,
    })),
    categoryBusinessDays: settings.categoryBusinessDays,
    rollingCustoms: {
      enabled: settings.rollingCustoms.enabled,
      businessDaysAfterBerth: settings.rollingCustoms.businessDaysAfterBerth,
      appliesTo: settings.rollingCustoms.appliesTo.slice(),
      duimpStatuses: settings.rollingCustoms.duimpStatuses.slice(),
    },
  }
}

export async function saveForecastSettings(draft, actor = null) {
  const normalized = normalizeForecastSettings({ id: DOCUMENT_ID, ...draft })

  if (!isFirebaseConfigured || !firestore) {
    const now = new Date().toISOString()
    const nextSettings = {
      ...normalized,
      updatedAt: now,
      updatedBy: actor ? { uid: actor.uid ?? null, name: actor.name ?? actor.email ?? 'Sistema local' } : null,
    }

    writeLocalSettings(nextSettings)
    await createAuditEvent({
      action: 'Regras de previsão atualizadas',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: DOCUMENT_ID,
    })
    return nextSettings
  }

  await setDoc(
    doc(firestore, COLLECTION, DOCUMENT_ID),
    {
      ...buildPayload(normalized),
      updatedAt: serverTimestamp(),
      updatedBy: actor
        ? { uid: actor.uid ?? null, name: actor.name ?? actor.email ?? 'Sistema' }
        : { uid: null, name: 'Sistema' },
    },
    { merge: true }
  )

  await createAuditEvent({
    action: 'Regras de previsão atualizadas',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: DOCUMENT_ID,
  })

  return {
    ...normalized,
    updatedAt: new Date().toISOString(),
    updatedBy: actor
      ? { uid: actor.uid ?? null, name: actor.name ?? actor.email ?? 'Sistema' }
      : { uid: null, name: 'Sistema' },
  }
}

export async function resetForecastSettings(actor = null) {
  return saveForecastSettings(DEFAULT_FORECAST_SETTINGS, {
    ...(actor ?? {}),
    name: actor?.name ?? actor?.email ?? 'Sistema',
  })
}

export function getDefaultForecastSettings() {
  return {
    ...DEFAULT_FORECAST_SETTINGS,
    destinations: DEFAULT_FORECAST_SETTINGS.destinations.map((destination) => ({ ...destination })),
    categoryBusinessDays: { ...DEFAULT_FORECAST_SETTINGS.categoryBusinessDays },
    rollingCustoms: {
      ...DEFAULT_FORECAST_SETTINGS.rollingCustoms,
      appliesTo: DEFAULT_FORECAST_SETTINGS.rollingCustoms.appliesTo.slice(),
      duimpStatuses: DEFAULT_FORECAST_SETTINGS.rollingCustoms.duimpStatuses.slice(),
    },
  }
}
