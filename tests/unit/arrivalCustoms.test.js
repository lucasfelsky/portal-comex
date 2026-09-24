// F17.3a (D-1): cobertura do modulo puro de chegada/CE/free time/presenca.
// F17.3b (D-1): DUIMP completa (numero + datas), canal, conferencia,
// exigencia e pre-preenchimento do desembaraco no Verde.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  FREE_TIME_CATEGORIES,
  CE_HOUSE_CATEGORIES,
  APPROX_DATE_FIELDS,
  DUIMP_STATUS_WAITING_REGISTRATION,
  DUIMP_STATUS_WAITING_PARAMETERIZATION,
  DUIMP_STATUS_PARAMETERIZED,
  CUSTOMS_INSPECTION_CHANNELS,
  CUSTOMS_REQUIREMENT_CHANNELS,
  CUSTOMS_DATE_FIELDS,
  EMPTY_CUSTOMS_CLEARANCE_FIELDS,
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
  getLegacyDuimpLevel,
  getDateDuimpLevel,
  getEffectiveDuimpLevel,
  hasDuimpRegistrationSignal,
  hasParameterizationSignal,
  isLegacyDuimpRegisteredWithoutDate,
  isLegacyParameterizedWithoutDate,
  deriveDuimpStatus,
  sanitizeCustomsClearanceFields,
  applyCustomsEdit,
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

describe('F17.3b: constantes DUIMP', () => {
  it('status/canais/campos de data', () => {
    expect(DUIMP_STATUS_WAITING_REGISTRATION).toBe('Aguardando registro da DUIMP')
    expect(DUIMP_STATUS_WAITING_PARAMETERIZATION).toBe('Aguardando parametrização da DUIMP')
    expect(DUIMP_STATUS_PARAMETERIZED).toBe('Parametrizada')
    expect(CUSTOMS_INSPECTION_CHANNELS).toEqual(['Amarelo', 'Vermelho'])
    expect(CUSTOMS_REQUIREMENT_CHANNELS).toEqual(['Amarelo', 'Vermelho', 'Cinza'])
    expect(CUSTOMS_DATE_FIELDS).toEqual(['duimpRegisteredAt', 'parameterizedAt'])
  })

  it('EMPTY_CUSTOMS_CLEARANCE_FIELDS congelado com as 9 chaves', () => {
    expect(EMPTY_CUSTOMS_CLEARANCE_FIELDS).toEqual({
      duimpStatus: '',
      parameterizationChannel: '',
      clearanceCompletedAt: '',
      duimpNumber: '',
      duimpRegisteredAt: '',
      parameterizedAt: '',
      customsInspectionScheduledAt: '',
      customsRequirement: false,
      customsRequirementNotes: '',
    })
    expect(Object.isFrozen(EMPTY_CUSTOMS_CLEARANCE_FIELDS)).toBe(true)
  })
})

describe('getLegacyDuimpLevel', () => {
  it('os 5 valores do vocabulario + sem acento/caixa', () => {
    expect(getLegacyDuimpLevel('Aguardando registro')).toBe(1)
    expect(getLegacyDuimpLevel('Aguardando registro da DUIMP')).toBe(1)
    expect(getLegacyDuimpLevel('Registrada, aguardando parametrização')).toBe(2)
    expect(getLegacyDuimpLevel('Aguardando parametrização da DUIMP')).toBe(2)
    expect(getLegacyDuimpLevel('Parametrizada')).toBe(3)
    expect(getLegacyDuimpLevel('PARAMETRIZADA')).toBe(3)
    expect(getLegacyDuimpLevel('aguardando registro da duimp')).toBe(1)
  })

  it('desconhecido/vazio -> 0', () => {
    expect(getLegacyDuimpLevel('')).toBe(0)
    expect(getLegacyDuimpLevel(undefined)).toBe(0)
    expect(getLegacyDuimpLevel('lixo')).toBe(0)
  })
})

describe('getEffectiveDuimpLevel', () => {
  it('data vence legado menor', () => {
    const process = { duimpStatus: 'Aguardando registro', parameterizedAt: '2026-09-20T10:00' }
    expect(getEffectiveDuimpLevel(process)).toBe(3)
  })

  it('legado vence data menor', () => {
    const process = { duimpStatus: 'Parametrizada', cargoPresenceInformed: true }
    expect(getEffectiveDuimpLevel(process)).toBe(3)
  })
})

describe('deriveDuimpStatus', () => {
  it('presenca sozinha -> vazio (nao gera "Aguardando registro" espurio)', () => {
    expect(deriveDuimpStatus({ cargoPresenceInformed: true })).toBe('')
  })

  it('legado "Aguardando registro" preservado (sem data nova)', () => {
    expect(deriveDuimpStatus({ duimpStatus: 'Aguardando registro' })).toBe(
      DUIMP_STATUS_WAITING_REGISTRATION
    )
  })

  it('duimpRegisteredAt -> Aguardando parametrização da DUIMP', () => {
    expect(deriveDuimpStatus({ duimpRegisteredAt: '2026-09-20T10:00' })).toBe(
      DUIMP_STATUS_WAITING_PARAMETERIZATION
    )
  })

  it('parameterizedAt -> Parametrizada', () => {
    expect(deriveDuimpStatus({ parameterizedAt: '2026-09-20T10:00' })).toBe(DUIMP_STATUS_PARAMETERIZED)
  })

  it('ignoreLegacy com legado Parametrizada e so registro -> Aguardando parametrização da DUIMP', () => {
    const process = { duimpStatus: 'Parametrizada', duimpRegisteredAt: '2026-09-20T10:00' }
    expect(deriveDuimpStatus(process, { ignoreLegacy: true })).toBe(DUIMP_STATUS_WAITING_PARAMETERIZATION)
  })
})

describe('sanitizeCustomsClearanceFields', () => {
  it('sem presenca -> tudo vazio', () => {
    expect(sanitizeCustomsClearanceFields({})).toEqual(EMPTY_CUSTOMS_CLEARANCE_FIELDS)
  })

  it('Verde zera conferencia/exigencia/notas', () => {
    const result = sanitizeCustomsClearanceFields({
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Verde',
      customsInspectionScheduledAt: '2026-09-21T10:00',
      customsRequirement: true,
      customsRequirementNotes: 'nota',
    })
    expect(result.duimpStatus).toBe('Parametrizada')
    expect(result.parameterizationChannel).toBe('Verde')
    expect(result.customsInspectionScheduledAt).toBe('')
    expect(result.customsRequirement).toBe(false)
    expect(result.customsRequirementNotes).toBe('')
  })

  it('Amarelo sem check zera notas', () => {
    const result = sanitizeCustomsClearanceFields({
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Amarelo',
      customsInspectionScheduledAt: '2026-09-21T10:00',
      customsRequirement: false,
      customsRequirementNotes: 'nota que nao deveria ficar',
    })
    expect(result.customsInspectionScheduledAt).toBe('2026-09-21T10:00')
    expect(result.customsRequirement).toBe(false)
    expect(result.customsRequirementNotes).toBe('')
  })

  it('Amarelo com check preserva a descricao da exigencia', () => {
    const result = sanitizeCustomsClearanceFields({
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Amarelo',
      customsRequirement: true,
      customsRequirementNotes: 'exigencia X',
    })
    expect(result.customsRequirement).toBe(true)
    expect(result.customsRequirementNotes).toBe('exigencia X')
  })

  it('Cinza preserva notas mesmo sem exigencia marcada', () => {
    const result = sanitizeCustomsClearanceFields({
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Cinza',
      customsRequirement: false,
      customsRequirementNotes: 'procedimento especial',
    })
    expect(result.customsRequirementNotes).toBe('procedimento especial')
  })

  it('trimText: false preserva espaco final (draft em edicao)', () => {
    const result = sanitizeCustomsClearanceFields(
      {
        cargoPresenceInformed: true,
        parameterizedAt: '2026-09-20T10:00',
        parameterizationChannel: 'Cinza',
        duimpNumber: 'DU-1 ',
        customsRequirementNotes: 'nota ',
      },
      { trimText: false }
    )
    expect(result.duimpNumber).toBe('DU-1 ')
    expect(result.customsRequirementNotes).toBe('nota ')
  })
})

describe('applyCustomsEdit', () => {
  it('limpar parameterizedAt de legado Parametrizada com registro -> Aguardando parametrização da DUIMP', () => {
    const draft = {
      duimpStatus: 'Parametrizada',
      duimpRegisteredAt: '2026-09-19T10:00',
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Verde',
    }
    const next = applyCustomsEdit(draft, 'parameterizedAt', '')
    expect(next.duimpStatus).toBe(DUIMP_STATUS_WAITING_PARAMETERIZATION)
    // canal so' e' zerado depois do sanitize (sanitizeCustomsClearanceFields),
    // nao dentro do applyCustomsEdit.
    const sanitized = sanitizeCustomsClearanceFields(next)
    expect(sanitized.parameterizationChannel).toBe('')
  })

  it('parameterizedAt com Verde e desembaraco vazio -> pre-preenche', () => {
    const draft = { parameterizationChannel: 'Verde', clearanceCompletedAt: '' }
    const next = applyCustomsEdit(draft, 'parameterizedAt', '2026-09-20T10:00')
    expect(next.clearanceCompletedAt).toBe('2026-09-20T10:00')
  })

  it('desembaraco editado manualmente != parametrizacao nao e sobrescrito', () => {
    const draft = {
      parameterizationChannel: 'Verde',
      parameterizedAt: '2026-09-20T10:00',
      clearanceCompletedAt: '2026-09-22T10:00',
    }
    const next = applyCustomsEdit(draft, 'parameterizedAt', '2026-09-21T10:00')
    expect(next.clearanceCompletedAt).toBe('2026-09-22T10:00')
  })

  it('canal Verde -> Amarelo com desembaraco = parametrizacao -> limpa', () => {
    const draft = {
      parameterizationChannel: 'Verde',
      parameterizedAt: '2026-09-20T10:00',
      clearanceCompletedAt: '2026-09-20T10:00',
    }
    const next = applyCustomsEdit(draft, 'parameterizationChannel', 'Amarelo')
    expect(next.clearanceCompletedAt).toBe('')
  })

  it('canal -> Verde com desembaraco vazio e parametrizacao preenchida -> pre-preenche', () => {
    const draft = { parameterizationChannel: 'Amarelo', parameterizedAt: '2026-09-20T10:00', clearanceCompletedAt: '' }
    const next = applyCustomsEdit(draft, 'parameterizationChannel', 'Verde')
    expect(next.clearanceCompletedAt).toBe('2026-09-20T10:00')
  })

  it('campo fora da lista so grava o valor', () => {
    expect(applyCustomsEdit({ duimpNumber: '' }, 'duimpNumber', 'DU-1')).toEqual({ duimpNumber: 'DU-1' })
  })
})

describe('hasDuimpRegistrationSignal / hasParameterizationSignal', () => {
  it('nivel efetivo >= 2 / >= 3', () => {
    expect(hasDuimpRegistrationSignal({ duimpRegisteredAt: '2026-09-20T10:00' })).toBe(true)
    expect(hasDuimpRegistrationSignal({ cargoPresenceInformed: true })).toBe(false)
    expect(hasParameterizationSignal({ parameterizedAt: '2026-09-20T10:00' })).toBe(true)
    expect(hasParameterizationSignal({ duimpRegisteredAt: '2026-09-20T10:00' })).toBe(false)
  })
})

describe('isLegacyDuimpRegisteredWithoutDate / isLegacyParameterizedWithoutDate', () => {
  it('legado sem data nova -> true', () => {
    expect(isLegacyDuimpRegisteredWithoutDate({ duimpStatus: 'Aguardando parametrização da DUIMP' })).toBe(
      true
    )
    expect(isLegacyParameterizedWithoutDate({ duimpStatus: 'Parametrizada' })).toBe(true)
  })

  it('com data nova -> false', () => {
    expect(
      isLegacyDuimpRegisteredWithoutDate({
        duimpStatus: 'Aguardando parametrização da DUIMP',
        duimpRegisteredAt: '2026-09-20T10:00',
      })
    ).toBe(false)
    expect(
      isLegacyParameterizedWithoutDate({ duimpStatus: 'Parametrizada', parameterizedAt: '2026-09-20T10:00' })
    ).toBe(false)
  })
})

describe('getDateDuimpLevel', () => {
  it('parameterizedAt > duimpRegisteredAt > presenca > 0', () => {
    expect(getDateDuimpLevel({ parameterizedAt: '2026-09-20T10:00' })).toBe(3)
    expect(getDateDuimpLevel({ duimpRegisteredAt: '2026-09-20T10:00' })).toBe(2)
    expect(getDateDuimpLevel({ cargoPresenceInformed: true })).toBe(1)
    expect(getDateDuimpLevel({})).toBe(0)
  })
})
