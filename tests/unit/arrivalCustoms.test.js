// F17.3a (D-1): cobertura do modulo puro de chegada/CE/free time/presenca.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  FREE_TIME_CATEGORIES,
  CE_HOUSE_CATEGORIES,
  APPROX_DATE_FIELDS,
  normalizeDateTimeLocal,
  normalizeOptionalInteger,
  normalizeOptionalDecimal,
  hasArrivalSignal,
  hasCargoPresenceSignal,
  isLegacyArrivalWithoutDate,
  isLegacyCargoPresenceWithoutDate,
  isApproxDate,
  normalizeMigratedApproxFields,
  applyArrivalDateEdit,
  sanitizeArrivalFields,
  getFreeTimeStatus,
} from '../../src/features/processes/arrivalCustoms.js'

describe('constantes', () => {
  it('FREE_TIME_CATEGORIES / CE_HOUSE_CATEGORIES / APPROX_DATE_FIELDS', () => {
    expect(FREE_TIME_CATEGORIES).toEqual(['FCL', 'CONSOLIDADO'])
    expect(CE_HOUSE_CATEGORIES).toEqual(['LCL', 'CONSOLIDADO'])
    expect(APPROX_DATE_FIELDS).toEqual(['berthedAt', 'arrivedAt'])
  })
})

describe('normalizeDateTimeLocal', () => {
  it('YYYY-MM-DDTHH:mm passa direto', () => {
    expect(normalizeDateTimeLocal('2026-09-20T10:00')).toBe('2026-09-20T10:00')
  })

  it('YYYY-MM-DDTHH:mm:ss corta em 16', () => {
    expect(normalizeDateTimeLocal('2026-09-20T10:00:30')).toBe('2026-09-20T10:00')
  })

  it('YYYY-MM-DD vira T00:00', () => {
    expect(normalizeDateTimeLocal('2026-09-20')).toBe('2026-09-20T00:00')
  })

  it('Timestamp fake (toDate) vira horario local', () => {
    const fake = { toDate: () => new Date(2026, 8, 10, 8, 30) }
    expect(normalizeDateTimeLocal(fake)).toBe('2026-09-10T08:30')
  })

  it('ISO parseavel vira horario local (nunca toISOString)', () => {
    const result = normalizeDateTimeLocal('2026-09-20T10:00:00.000Z')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('invalido -> string vazia', () => {
    expect(normalizeDateTimeLocal('lixo-invalido')).toBe('')
    expect(normalizeDateTimeLocal('')).toBe('')
    expect(normalizeDateTimeLocal(null)).toBe('')
    expect(normalizeDateTimeLocal(undefined)).toBe('')
  })
})

describe('normalizeOptionalInteger / normalizeOptionalDecimal', () => {
  it("'' / null / undefined -> null", () => {
    expect(normalizeOptionalInteger('')).toBeNull()
    expect(normalizeOptionalInteger(null)).toBeNull()
    expect(normalizeOptionalInteger(undefined)).toBeNull()
    expect(normalizeOptionalDecimal('')).toBeNull()
  })

  it("'0' -> 0 (valor valido, distinto de nao informado)", () => {
    expect(normalizeOptionalInteger('0')).toBe(0)
    expect(normalizeOptionalDecimal('0')).toBe(0)
  })

  it("'12,5' -> 12.5 (decimal aceita virgula)", () => {
    expect(normalizeOptionalDecimal('12,5')).toBe(12.5)
  })

  it('negativo/NaN -> null', () => {
    expect(normalizeOptionalInteger('-1')).toBeNull()
    expect(normalizeOptionalDecimal('-1')).toBeNull()
    expect(normalizeOptionalInteger('abc')).toBeNull()
    expect(normalizeOptionalDecimal('abc')).toBeNull()
  })

  it('inteiro trunca decimais', () => {
    expect(normalizeOptionalInteger('7.9')).toBe(7)
  })
})

describe('sinais compat (hasArrivalSignal / hasCargoPresenceSignal)', () => {
  it('maritimo: berthedAt preenchido -> true', () => {
    expect(hasArrivalSignal({ category: 'FCL', berthedAt: '2026-09-20T10:00' })).toBe(true)
  })

  it('maritimo: berthed bool legado -> true mesmo sem data', () => {
    expect(hasArrivalSignal({ category: 'FCL', berthed: true })).toBe(true)
  })

  it('maritimo: nada -> false', () => {
    expect(hasArrivalSignal({ category: 'FCL' })).toBe(false)
  })

  it('aereo: arrivedAt/arrived', () => {
    expect(hasArrivalSignal({ category: 'AEREO', arrivedAt: '2026-09-20T10:00' })).toBe(true)
    expect(hasArrivalSignal({ category: 'AEREO', arrived: true })).toBe(true)
    expect(hasArrivalSignal({ category: 'AEREO' })).toBe(false)
  })

  it('categoria errada nao reage ao sinal (aereo com berthed / maritimo com arrived)', () => {
    expect(hasArrivalSignal({ category: 'AEREO', berthed: true })).toBe(false)
    expect(hasArrivalSignal({ category: 'FCL', arrived: true })).toBe(false)
  })

  it('categoria vazia/desconhecida -> false', () => {
    expect(hasArrivalSignal({})).toBe(false)
  })

  it('hasCargoPresenceSignal: data ou bool', () => {
    expect(hasCargoPresenceSignal({ cargoPresenceInformedAt: '2026-09-20T10:00' })).toBe(true)
    expect(hasCargoPresenceSignal({ cargoPresenceInformed: true })).toBe(true)
    expect(hasCargoPresenceSignal({})).toBe(false)
  })
})

describe('isLegacyArrivalWithoutDate / isLegacyCargoPresenceWithoutDate', () => {
  it('bool true e data vazia -> legado', () => {
    expect(isLegacyArrivalWithoutDate({ category: 'FCL', berthed: true })).toBe(true)
    expect(isLegacyArrivalWithoutDate({ category: 'AEREO', arrived: true })).toBe(true)
    expect(isLegacyCargoPresenceWithoutDate({ cargoPresenceInformed: true })).toBe(true)
  })

  it('com data preenchida NAO e legado', () => {
    expect(
      isLegacyArrivalWithoutDate({ category: 'FCL', berthed: true, berthedAt: '2026-09-20T10:00' })
    ).toBe(false)
  })

  it('sem bool -> false', () => {
    expect(isLegacyArrivalWithoutDate({ category: 'FCL' })).toBe(false)
  })
})

describe('isApproxDate / normalizeMigratedApproxFields', () => {
  it('isApproxDate le migratedApproxFields', () => {
    expect(isApproxDate({ migratedApproxFields: ['berthedAt'] }, 'berthedAt')).toBe(true)
    expect(isApproxDate({ migratedApproxFields: ['berthedAt'] }, 'arrivedAt')).toBe(false)
    expect(isApproxDate({}, 'berthedAt')).toBe(false)
  })

  it('normalizeMigratedApproxFields filtra por APPROX_DATE_FIELDS + dedup + so com data preenchida', () => {
    const process = { berthedAt: '2026-09-20T10:00' }
    expect(normalizeMigratedApproxFields(['berthedAt', 'berthedAt', 'x'], process)).toEqual(['berthedAt'])
  })

  it('sem data preenchida -> []', () => {
    expect(normalizeMigratedApproxFields(['berthedAt'], {})).toEqual([])
  })

  it('nao-array -> []', () => {
    expect(normalizeMigratedApproxFields('berthedAt', {})).toEqual([])
    expect(normalizeMigratedApproxFields(undefined, {})).toEqual([])
  })
})

describe('applyArrivalDateEdit', () => {
  it('preencher berthedAt -> berthed true e remove o marcador aproximado', () => {
    const draft = { berthedAt: '', berthed: false, migratedApproxFields: ['berthedAt'] }
    const next = applyArrivalDateEdit(draft, 'berthedAt', '2026-09-20T10:00')
    expect(next.berthedAt).toBe('2026-09-20T10:00')
    expect(next.berthed).toBe(true)
    expect(next.migratedApproxFields).toEqual([])
  })

  it('limpar berthedAt -> berthed false', () => {
    const draft = { berthedAt: '2026-09-20T10:00', berthed: true, migratedApproxFields: [] }
    const next = applyArrivalDateEdit(draft, 'berthedAt', '')
    expect(next.berthedAt).toBe('')
    expect(next.berthed).toBe(false)
  })

  it('arrivedAt e cargoPresenceInformedAt espelham os bools corretos', () => {
    expect(applyArrivalDateEdit({ arrived: false }, 'arrivedAt', '2026-09-20T10:00').arrived).toBe(true)
    expect(
      applyArrivalDateEdit({ cargoPresenceInformed: false }, 'cargoPresenceInformedAt', '2026-09-20T10:00')
        .cargoPresenceInformed
    ).toBe(true)
  })

  it('campo fora da lista so grava o valor', () => {
    expect(applyArrivalDateEdit({ ceMercante: '' }, 'ceMercante', 'CE-1')).toEqual({ ceMercante: 'CE-1' })
  })
})

describe('sanitizeArrivalFields', () => {
  it('LCL nao tem free time/demurrage, mas tem ceHouse', () => {
    const result = sanitizeArrivalFields({
      category: 'LCL',
      berthedAt: '2026-09-20T10:00',
      ceHouse: 'HBL-1',
      freeTimeDays: '7',
    })
    expect(result.freeTimeDays).toBeNull()
    expect(result.demurrageDailyRateUsd).toBeNull()
    expect(result.ceHouse).toBe('HBL-1')
    expect(result.berthed).toBe(true)
  })

  it('FCL nao tem ceHouse, tem free time', () => {
    const result = sanitizeArrivalFields({ category: 'FCL', ceHouse: 'X', freeTimeDays: '5' })
    expect(result.ceHouse).toBe('')
    expect(result.freeTimeDays).toBe(5)
  })

  it('AEREO nao tem CE nem free time, so terminal/arrivedAt', () => {
    const result = sanitizeArrivalFields({
      category: 'AEREO',
      arrivedAt: '2026-09-20T10:00',
      ceMercante: 'X',
      terminalName: 'Terminal 1',
      freeTimeDays: '5',
    })
    expect(result.ceMercante).toBe('')
    expect(result.ceHouse).toBe('')
    expect(result.freeTimeDays).toBeNull()
    expect(result.terminalName).toBe('Terminal 1')
    expect(result.arrived).toBe(true)
    expect(result.berthedAt).toBe('')
  })

  it('categoria desconhecida -> tudo vazio/false/null', () => {
    const result = sanitizeArrivalFields({ category: 'X' })
    expect(result).toEqual({
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
    })
  })

  it('legado berthed true sem data -> continua berthed true (dual-write)', () => {
    const result = sanitizeArrivalFields({ category: 'FCL', berthed: true })
    expect(result.berthed).toBe(true)
    expect(result.berthedAt).toBe('')
  })
})

describe('getFreeTimeStatus', () => {
  it('fora de FREE_TIME_CATEGORIES -> null', () => {
    expect(getFreeTimeStatus({ category: 'LCL' })).toBeNull()
    expect(getFreeTimeStatus({ category: 'AEREO' })).toBeNull()
  })

  it('freeTimeDays null -> not-informed', () => {
    expect(getFreeTimeStatus({ category: 'FCL', freeTimeDays: null })).toEqual({
      state: 'not-informed',
      deadlineKey: null,
      daysRemaining: null,
    })
  })

  it('sem sinal de presenca -> waiting-presence', () => {
    expect(getFreeTimeStatus({ category: 'FCL', freeTimeDays: 7 }).state).toBe('waiting-presence')
  })

  it('presenca via bool legado sem data -> presence-without-date', () => {
    expect(
      getFreeTimeStatus({ category: 'FCL', freeTimeDays: 7, cargoPresenceInformed: true }).state
    ).toBe('presence-without-date')
  })

  it('containers todos devolvidos -> closed', () => {
    const result = getFreeTimeStatus({
      category: 'FCL',
      freeTimeDays: 7,
      cargoPresenceInformedAt: '2026-09-01T10:00',
      containers: [{ returnedAt: '2026-09-05T10:00' }],
    })
    expect(result.state).toBe('closed')
  })

  it('presenca 2026-09-01T10:00 + 7 dias -> deadlineKey 2026-09-08; hoje 08 -> due-today; hoje 10 -> overdue -2', () => {
    const process = {
      category: 'FCL',
      freeTimeDays: 7,
      cargoPresenceInformedAt: '2026-09-01T10:00',
    }
    const dueToday = getFreeTimeStatus(process, new Date(2026, 8, 8))
    expect(dueToday).toEqual({ state: 'due-today', deadlineKey: '2026-09-08', daysRemaining: 0 })

    const overdue = getFreeTimeStatus(process, new Date(2026, 8, 10))
    expect(overdue).toEqual({ state: 'overdue', deadlineKey: '2026-09-08', daysRemaining: -2 })

    const running = getFreeTimeStatus(process, new Date(2026, 8, 3))
    expect(running.state).toBe('running')
    expect(running.daysRemaining).toBe(5)
  })
})
