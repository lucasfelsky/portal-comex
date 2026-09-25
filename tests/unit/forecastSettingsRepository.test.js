// F17.5a (A-6): cobertura de `src/services/forecastSettingsRepository.js` -
// `operationalAlerts.clearanceOverdueDays` (default 3, clamp 1..30) e
// paridade com `normalizeClearanceOverdueDaysMirror`
// (`functions/src/process/operationalAlerts.js`). Modo local (sem
// Firestore) via `isFirebaseConfigured: false`. Este arquivo esta em
// `tests/unit/` (nao entra na contagem fixa do `audit-vault-counts`).
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: false,
  app: null,
  firestore: null,
}))

vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

const {
  getDefaultForecastSettings,
  normalizeOperationalAlerts,
  saveForecastSettings,
  getForecastSettings,
} = await import('../../src/services/forecastSettingsRepository.js')
const { normalizeClearanceOverdueDaysMirror } = await import(
  '../../functions/src/process/operationalAlerts.js'
)

beforeEach(() => {
  window.localStorage.clear()
})

describe('getDefaultForecastSettings', () => {
  it('operationalAlerts.clearanceOverdueDays default 3', () => {
    expect(getDefaultForecastSettings().operationalAlerts.clearanceOverdueDays).toBe(3)
  })
})

describe('normalizeOperationalAlerts', () => {
  it('clamp: 0 -> 1, 99 -> 30, ausente -> 3', () => {
    expect(normalizeOperationalAlerts({ clearanceOverdueDays: 0 }).clearanceOverdueDays).toBe(1)
    expect(normalizeOperationalAlerts({ clearanceOverdueDays: 99 }).clearanceOverdueDays).toBe(30)
    expect(normalizeOperationalAlerts({}).clearanceOverdueDays).toBe(3)
  })

  it.each([undefined, null, '', 'abc', 0, 1, 3, '5', 4.7, 30, 31, -2])(
    'paridade com normalizeClearanceOverdueDaysMirror para %s',
    (value) => {
      expect(normalizeOperationalAlerts({ clearanceOverdueDays: value }).clearanceOverdueDays).toBe(
        normalizeClearanceOverdueDaysMirror(value)
      )
    }
  )
})

describe('saveForecastSettings / getForecastSettings (modo local)', () => {
  it('salva e recupera clearanceOverdueDays: 7', async () => {
    await saveForecastSettings({
      ...getDefaultForecastSettings(),
      operationalAlerts: { clearanceOverdueDays: 7 },
    })
    const settings = await getForecastSettings()
    expect(settings.operationalAlerts.clearanceOverdueDays).toBe(7)
  })
})
