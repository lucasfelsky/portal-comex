// F17.1a: cobertura da tabela D-B (PLAN.md) - uma linha de teste por linha
// da tabela + compatibilidade (campo novo E equivalente atual) + precedencia.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  deriveProcessStatus,
  resolveCargoReceivedAt,
  isCustomsCleared,
  PRE_ARRIVAL_STATUSES,
} from '../../src/features/processes/deriveProcessStatus.js'

function baseMaritime(overrides = {}) {
  return {
    category: 'FCL',
    ...overrides,
  }
}

function baseAir(overrides = {}) {
  return {
    category: 'AEREO',
    ...overrides,
  }
}

describe('deriveProcessStatus - linha 1 (Carga recebida)', () => {
  it('collectionStatus em status de CD -> Carga recebida', () => {
    expect(
      deriveProcessStatus(baseMaritime({ collectionStatus: 'Veículo no CD para descarga' }))
    ).toBe('Carga recebida')
    expect(
      deriveProcessStatus(baseMaritime({ collectionStatus: 'Carga disponível em estoque' }))
    ).toBe('Carga recebida')
  })

  it('vence qualquer outro sinal (precedencia maxima)', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          collectionStatus: 'Carga recebida',
          duimpStatus: 'Aguardando registro da DUIMP',
          berthed: false,
        })
      )
    ).toBe('Carga recebida')
  })
})

describe('deriveProcessStatus - linha 2 (Coleta Agendada)', () => {
  it('collectionStatus "Coleta Agendada" + janela com scheduledAt -> Coleta Agendada', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-01-01T10:00:00.000Z' }],
        })
      )
    ).toBe('Coleta Agendada')
  })

  it('"Carga a caminho do CD" + janela agendada tambem casa', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          collectionStatus: 'Carga a caminho do CD',
          collectionWindows: [{ scheduledAt: '2026-01-01T10:00:00.000Z' }],
        })
      )
    ).toBe('Coleta Agendada')
  })

  it('compat: collectionScheduledAt legado (sem collectionWindows) tambem casa', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          collectionStatus: 'Coleta Agendada',
          collectionScheduledAt: '2026-01-01T10:00:00.000Z',
        })
      )
    ).toBe('Coleta Agendada')
  })

  it('"Coleta Agendada" sem janela com scheduledAt cai pra linha 3', () => {
    const process = baseMaritime({
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [],
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
    })
    expect(deriveProcessStatus(process)).toBe('Aguardando agendamento de coleta')
  })

  it('janela com scheduledAt vazio ("") NAO casa a linha 2 (normalizeCollectionWindow preserva "")', () => {
    const process = baseMaritime({
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ scheduledAt: '' }],
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
    })
    expect(deriveProcessStatus(process)).toBe('Aguardando agendamento de coleta')
  })
})

describe('deriveProcessStatus - linha 3 (Aguardando agendamento de coleta)', () => {
  it('clearanceCompletedAt preenchido + licencas ok -> Aguardando agendamento de coleta', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          duimpStatus: 'Parametrizada',
          parameterizationChannel: 'Amarelo',
          clearanceCompletedAt: '2026-01-01T10:00',
          mapaStatus: 'Liberado',
        })
      )
    ).toBe('Aguardando agendamento de coleta')
  })

  it('compat: duimp parametrizada + canal Verde (sem clearanceCompletedAt) -> Aguardando agendamento de coleta', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          duimpStatus: 'Parametrizada',
          parameterizationChannel: 'Verde',
        })
      )
    ).toBe('Aguardando agendamento de coleta')
  })

  it('Amarelo + MAPA "Aguardando MAPA" (nao liberado) -> Aguardando desembaraço (linha 3 falha, linha 4 casa)', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          duimpStatus: 'Parametrizada',
          parameterizationChannel: 'Amarelo',
          clearanceCompletedAt: '2026-01-01T10:00',
          mapaStatus: 'Aguardando MAPA',
        })
      )
    ).toBe('Aguardando desembaraço')
  })

  it('Verde + MAPA "Aguardando MAPA" -> Aguardando desembaraço', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          duimpStatus: 'Parametrizada',
          parameterizationChannel: 'Verde',
          mapaStatus: 'Aguardando MAPA',
        })
      )
    ).toBe('Aguardando desembaraço')
  })

  it('Verde + MAPA vazio -> Aguardando agendamento de coleta', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          duimpStatus: 'Parametrizada',
          parameterizationChannel: 'Verde',
          mapaStatus: '',
        })
      )
    ).toBe('Aguardando agendamento de coleta')
  })

  it('licenses com uma "Em análise" bloqueia a linha 3', () => {
    expect(
      deriveProcessStatus(
        baseMaritime({
          duimpStatus: 'Parametrizada',
          parameterizationChannel: 'Verde',
          licenses: [{ status: 'Deferida' }, { status: 'Em análise' }],
        })
      )
    ).toBe('Aguardando desembaraço')
  })

  it('licenses todas Deferida libera mesmo sem checar MAPA (aereo)', () => {
    expect(
      deriveProcessStatus(
        baseAir({
          duimpStatus: 'Parametrizada',
          parameterizationChannel: 'Verde',
          licenses: [{ status: 'Deferida' }],
        })
      )
    ).toBe('Aguardando agendamento de coleta')
  })
})

describe('deriveProcessStatus - linha 4 (Aguardando desembaraço)', () => {
  it('parameterizedAt preenchido -> Aguardando desembaraço', () => {
    expect(deriveProcessStatus(baseMaritime({ parameterizedAt: '2026-01-01T10:00' }))).toBe(
      'Aguardando desembaraço'
    )
  })

  it('compat: duimpStatus "Parametrizada" (sem canal) -> Aguardando desembaraço', () => {
    expect(deriveProcessStatus(baseMaritime({ duimpStatus: 'Parametrizada' }))).toBe(
      'Aguardando desembaraço'
    )
  })
})

describe('deriveProcessStatus - linha 5 (Aguardando parametrização da DUIMP)', () => {
  it('duimpRegisteredAt preenchido -> Aguardando parametrização da DUIMP', () => {
    expect(
      deriveProcessStatus(baseMaritime({ duimpRegisteredAt: '2026-01-01T10:00' }))
    ).toBe('Aguardando parametrização da DUIMP')
  })

  it('compat: duimpStatus "Aguardando parametrização da DUIMP" -> mesmo status', () => {
    expect(
      deriveProcessStatus(baseMaritime({ duimpStatus: 'Aguardando parametrização da DUIMP' }))
    ).toBe('Aguardando parametrização da DUIMP')
  })

  it('duimpStatus vazio NAO casa a linha 5 (nunca usar !== "Aguardando registro da DUIMP")', () => {
    expect(
      deriveProcessStatus(baseMaritime({ duimpStatus: '', cargoPresenceInformed: true }))
    ).toBe('Aguardando registro da DUIMP')
  })
})

describe('deriveProcessStatus - linha 6 (Aguardando registro da DUIMP)', () => {
  it('cargoPresenceInformedAt preenchido -> Aguardando registro da DUIMP', () => {
    expect(
      deriveProcessStatus(baseMaritime({ cargoPresenceInformedAt: '2026-01-01T10:00' }))
    ).toBe('Aguardando registro da DUIMP')
  })

  it('compat: cargoPresenceInformed === true -> mesmo status', () => {
    expect(deriveProcessStatus(baseMaritime({ cargoPresenceInformed: true }))).toBe(
      'Aguardando registro da DUIMP'
    )
  })
})

describe('deriveProcessStatus - linha 7 (Atracação Confirmada)', () => {
  it('maritimo: berthedAt preenchido -> Atracação Confirmada', () => {
    expect(deriveProcessStatus(baseMaritime({ berthedAt: '2026-01-01T10:00' }))).toBe(
      'Atracação Confirmada'
    )
  })

  it('compat maritimo: berthed === true -> mesmo status', () => {
    expect(deriveProcessStatus(baseMaritime({ berthed: true }))).toBe('Atracação Confirmada')
  })

  it('aereo: arrivedAt preenchido -> Atracação Confirmada', () => {
    expect(deriveProcessStatus(baseAir({ arrivedAt: '2026-01-01T10:00' }))).toBe(
      'Atracação Confirmada'
    )
  })

  it('compat aereo: arrived === true -> mesmo status', () => {
    expect(deriveProcessStatus(baseAir({ arrived: true }))).toBe('Atracação Confirmada')
  })

  it('aereo NAO reage a "berthed" (sinal errado pra categoria)', () => {
    expect(deriveProcessStatus(baseAir({ berthed: true }))).not.toBe('Atracação Confirmada')
  })

  it('maritimo NAO reage a "arrived" (sinal errado pra categoria)', () => {
    expect(deriveProcessStatus(baseMaritime({ arrived: true }))).not.toBe('Atracação Confirmada')
  })
})

describe('deriveProcessStatus - linhas 8/9 (shippedAt, dormente ate F17.2)', () => {
  const today = new Date('2026-06-15T12:00:00-03:00')

  it('shippedAt + eta <= hoje -> Aguardando atracação', () => {
    expect(
      deriveProcessStatus(baseMaritime({ shippedAt: '2026-06-01', eta: '2026-06-14' }), today)
    ).toBe('Aguardando atracação')
  })

  it('shippedAt + eta === hoje -> Aguardando atracação', () => {
    expect(
      deriveProcessStatus(baseMaritime({ shippedAt: '2026-06-01', eta: '2026-06-15' }), today)
    ).toBe('Aguardando atracação')
  })

  it('shippedAt + eta futura -> Embarcou', () => {
    expect(
      deriveProcessStatus(baseMaritime({ shippedAt: '2026-06-01', eta: '2026-06-20' }), today)
    ).toBe('Embarcou')
  })

  it('usa data local as 22:00 (bug de UTC): eta hoje continua Aguardando atracação', () => {
    const lateNight = new Date('2026-06-15T22:00:00-03:00')
    expect(
      deriveProcessStatus(baseMaritime({ shippedAt: '2026-06-01', eta: '2026-06-15' }), lateNight)
    ).toBe('Aguardando atracação')
  })
})

describe('deriveProcessStatus - linha 10 (fallback D-A pre-chegada)', () => {
  it('preserva "Atracação Confirmada" gravado quando nao ha sinal -> Aguardando atracação', () => {
    expect(
      deriveProcessStatus(baseMaritime({ processStatus: 'Atracação Confirmada', berthed: false }))
    ).toBe('Aguardando atracação')
  })

  it('gravado vazio/lixo -> Aguardando Embarque', () => {
    expect(deriveProcessStatus(baseMaritime({ processStatus: '' }))).toBe('Aguardando Embarque')
    expect(deriveProcessStatus(baseMaritime({ processStatus: 'lixo-invalido' }))).toBe(
      'Aguardando Embarque'
    )
  })

  it('gravado ja e um dos 3 valores de PRE_ARRIVAL_STATUSES -> preserva', () => {
    PRE_ARRIVAL_STATUSES.forEach((status) => {
      expect(deriveProcessStatus(baseMaritime({ processStatus: status }))).toBe(status)
    })
  })
})

describe('isCustomsCleared (AD-1)', () => {
  it('clearanceCompletedAt preenchido -> true mesmo sem duimp/canal', () => {
    expect(isCustomsCleared({ clearanceCompletedAt: '2026-01-01T10:00' })).toBe(true)
  })

  it('duimp Parametrizada + canal Verde (legado) -> true', () => {
    expect(
      isCustomsCleared({ duimpStatus: 'Parametrizada', parameterizationChannel: 'Verde' })
    ).toBe(true)
  })

  it('duimp Parametrizada + canal Amarelo sem clearance -> false', () => {
    expect(
      isCustomsCleared({ duimpStatus: 'Parametrizada', parameterizationChannel: 'Amarelo' })
    ).toBe(false)
  })
})

describe('resolveCargoReceivedAt (D-D)', () => {
  it('derivado != Carga recebida -> zera', () => {
    expect(resolveCargoReceivedAt('Embarcou', '2026-01-01T00:00:00.000Z', 'NOW')).toBe('')
  })

  it('derivado Carga recebida + data existente -> preserva', () => {
    expect(resolveCargoReceivedAt('Carga recebida', '2026-01-01T00:00:00.000Z', 'NOW')).toBe(
      '2026-01-01T00:00:00.000Z'
    )
  })

  it('derivado Carga recebida + sem data -> grava nowIso', () => {
    expect(resolveCargoReceivedAt('Carga recebida', '', 'NOW')).toBe('NOW')
  })
})
