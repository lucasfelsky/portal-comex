// Smoke test for deliveryForecast.js (pure function verification).
// Run: node scripts/smoke-forecast.mjs
//
// Builds three settings shapes (default, Itapoa cutoff=11h, Itapoa cutoff=13h)
// and exercises the same process payload against each:
//   - destination: "Itapoa"
//   - collectionStatus: "Coleta Agendada"
//   - collectionScheduledAt: 2026-07-15T11:30:00-03:00
//   - category: "FCL"
//   - eta: a few business days out
//   - berthed: false (so rolling customs is off)
//
// Assertions:
//   - With default (cutoff=12h), 11:30 is BEFORE cutoff => Vespertino, same day.
//   - With Itapoa cutoff=11h, 11:30 is AFTER cutoff   => Matutino, next business day.
//   - With Itapoa cutoff=13h, 11:30 is BEFORE cutoff  => Vespertino, same day.

import {
  DEFAULT_FORECAST_SETTINGS,
  getScheduledCollectionDeliveryDate,
  getScheduledCollectionDeliveryShift,
  getAutomaticEstimatedDeliveryDate,
  getEstimatedDeliveryDate,
} from '../src/utils/deliveryForecast.js'

const baseProcess = {
  destination: 'Itapoa',
  collectionStatus: 'Coleta Agendada',
  collectionScheduledAt: '2026-07-15T11:30:00-03:00',
  category: 'FCL',
  eta: '2026-07-20',
  berthed: false,
  duimpStatus: 'aguardando registro',
}

const itapoa11 = {
  ...DEFAULT_FORECAST_SETTINGS,
  destinations: [
    { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
    { match: 'itapoa', label: 'Itapoá', cutoffHour: 11, cutoffMinute: 0 },
  ],
  categoryBusinessDays: { ...DEFAULT_FORECAST_SETTINGS.categoryBusinessDays },
  rollingCustoms: {
    ...DEFAULT_FORECAST_SETTINGS.rollingCustoms,
    appliesTo: [...DEFAULT_FORECAST_SETTINGS.rollingCustoms.appliesTo],
    duimpStatuses: [...DEFAULT_FORECAST_SETTINGS.rollingCustoms.duimpStatuses],
  },
}

const itapoa13 = {
  ...DEFAULT_FORECAST_SETTINGS,
  destinations: [
    { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
    { match: 'itapoa', label: 'Itapoá', cutoffHour: 13, cutoffMinute: 0 },
  ],
  categoryBusinessDays: { ...DEFAULT_FORECAST_SETTINGS.categoryBusinessDays },
  rollingCustoms: {
    ...DEFAULT_FORECAST_SETTINGS.rollingCustoms,
    appliesTo: [...DEFAULT_FORECAST_SETTINGS.rollingCustoms.appliesTo],
    duimpStatuses: [...DEFAULT_FORECAST_SETTINGS.rollingCustoms.duimpStatuses],
  },
}

let failures = 0
function expect(label, actual, expected) {
  const ok = actual === expected
  const tag = ok ? '✅' : '❌'
  console.log(`${tag} ${label}\n   got: ${JSON.stringify(actual)}\n   exp: ${JSON.stringify(expected)}`)
  if (!ok) failures += 1
}

const cases = [
  { name: 'default (Itapoa 12h)', settings: DEFAULT_FORECAST_SETTINGS },
  { name: 'Itapoa 11h (after cutoff)', settings: itapoa11 },
  { name: 'Itapoa 13h (before cutoff)', settings: itapoa13 },
]

for (const c of cases) {
  console.log(`\n=== ${c.name} ===`)
  expect(
    `[${c.name}] getScheduledCollectionDeliveryShift`,
    getScheduledCollectionDeliveryShift(baseProcess, c.settings),
    c.name.includes('11h') ? 'Matutino' : 'Vespertino',
  )
  expect(
    `[${c.name}] getScheduledCollectionDeliveryDate`,
    getScheduledCollectionDeliveryDate(baseProcess, c.settings),
    c.name.includes('11h') ? '2026-07-16' : '2026-07-15',
  )
  expect(
    `[${c.name}] shouldUseRollingCustomsForecast - via getEstimatedDeliveryDate (berthed=false)`,
    getEstimatedDeliveryDate(baseProcess, 'FCL', c.settings),
    getAutomaticEstimatedDeliveryDate(baseProcess, 'FCL', c.settings),
  )
  const autoDate = getAutomaticEstimatedDeliveryDate(baseProcess, 'FCL', c.settings)
  // Process branch returns the LATER of (collection date, ETA) — ETA wins
  // because 2026-07-20 > 2026-07-15.
  expect(
    `[${c.name}] getAutomaticEstimatedDeliveryDate (process) === max(collection, ETA)`,
    autoDate,
    '2026-07-20',
  )
  // ETA-only branch adds 5 business days to 2026-07-20 (Mon) = 2026-07-27.
  expect(
    `[${c.name}] getAutomaticEstimatedDeliveryDate (eta only) === 2026-07-27`,
    getAutomaticEstimatedDeliveryDate(baseProcess.eta, baseProcess.category, c.settings),
    '2026-07-27',
  )
}

console.log(`\n${failures === 0 ? '✅ All cases passed' : `❌ ${failures} case(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
