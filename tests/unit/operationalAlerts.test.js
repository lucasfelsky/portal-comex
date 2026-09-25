// F17.5a (A-2): cobertura de `functions/src/process/operationalAlerts.js` -
// helpers de data/fuso, paridade do free time com o front
// (`src/features/processes/arrivalCustoms.js`) e as 4 regras de alerta.
// Este arquivo esta em `tests/unit/` (nao entra na contagem fixa do
// `audit-vault-counts`).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  ALERTS_TIME_ZONE,
  addDaysToKey,
  buildDailyAlertsText,
  buildOperationalAlerts,
  diffDaysBetweenKeys,
  formatDateKeyBr,
  getFreeTimeStatusMirror,
  getSaoPauloDateKey,
  normalizeClearanceOverdueDaysMirror,
  toSaoPauloDateKey,
} from '../../functions/src/process/operationalAlerts.js'
import { getFreeTimeStatus } from '../../src/features/processes/arrivalCustoms.js'

describe('ALERTS_TIME_ZONE', () => {
  it('e America/Sao_Paulo', () => {
    expect(ALERTS_TIME_ZONE).toBe('America/Sao_Paulo')
  })
})

describe('getSaoPauloDateKey', () => {
  it('02:30Z ainda e o dia anterior em BRT', () => {
    expect(getSaoPauloDateKey(new Date('2026-09-25T02:30:00Z'))).toBe('2026-09-24')
  })

  it('03:30Z ja virou o dia em BRT', () => {
    expect(getSaoPauloDateKey(new Date('2026-09-25T03:30:00Z'))).toBe('2026-09-25')
  })
})

describe('addDaysToKey', () => {
  it('virada de ano', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('diffDaysBetweenKeys', () => {
  it('virada de mes (fev bissexto)', () => {
    expect(diffDaysBetweenKeys('2026-02-27', '2026-03-01')).toBe(2)
  })
})

describe('toSaoPauloDateKey', () => {
  it('data pura YYYY-MM-DD', () => {
    expect(toSaoPauloDateKey('2026-09-24')).toBe('2026-09-24')
  })

  it('datetime-local sem fuso (slice 10)', () => {
    expect(toSaoPauloDateKey('2026-09-24T23:30')).toBe('2026-09-24')
  })

  it('ISO com Z convertido pro fuso de Sao Paulo', () => {
    expect(toSaoPauloDateKey('2026-09-25T01:00:00.000Z')).toBe('2026-09-24')
  })

  it('Timestamp (objeto com toDate)', () => {
    expect(toSaoPauloDateKey({ toDate: () => new Date('2026-09-25T01:00:00Z') })).toBe('2026-09-24')
  })

  it('lixo/null -> vazio', () => {
    expect(toSaoPauloDateKey('lixo')).toBe('')
    expect(toSaoPauloDateKey(null)).toBe('')
  })
})

describe('formatDateKeyBr', () => {
  it('dd/mm/aaaa', () => {
    expect(formatDateKeyBr('2026-09-24')).toBe('24/09/2026')
  })
})

describe('normalizeClearanceOverdueDaysMirror', () => {
  it.each([
    [undefined, 3],
    [0, 1],
    [99, 30],
    ['5', 5],
    [4.7, 4],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeClearanceOverdueDaysMirror(input)).toBe(expected)
  })
})

describe('getFreeTimeStatusMirror - paridade com getFreeTimeStatus (front)', () => {
  const categories = ['FCL', 'CONSOLIDADO', 'LCL']
  const freeTimeDaysOptions = [null, 0, 7]
  const presenceOptions = [
    { cargoPresenceInformed: undefined, cargoPresenceInformedAt: undefined },
    { cargoPresenceInformed: true, cargoPresenceInformedAt: '' },
    { cargoPresenceInformed: true, cargoPresenceInformedAt: '2026-09-20T10:00' },
  ]
  const containersOptions = [
    [],
    [{ id: 'CNT-1', returnedAt: '' }],
    [{ id: 'CNT-1', returnedAt: '2026-09-22' }],
  ]
  const todayKeys = ['2026-09-20', '2026-09-25', '2026-09-27', '2026-09-30']

  for (const category of categories) {
    for (const freeTimeDays of freeTimeDaysOptions) {
      for (const presence of presenceOptions) {
        for (const containers of containersOptions) {
          for (const todayKey of todayKeys) {
            const process = { category, freeTimeDays, containers, ...presence }
            const label = `${category}/ftd=${freeTimeDays}/presence=${presence.cargoPresenceInformedAt}/containers=${containers.length}/${todayKey}`

            it(label, () => {
              const [year, month, day] = todayKey.split('-').map(Number)
              const todayDate = new Date(year, month - 1, day, 12, 0)
              expect(getFreeTimeStatusMirror(process, todayKey)).toEqual(
                getFreeTimeStatus(process, todayDate)
              )
            })
          }
        }
      }
    }
  }
})

describe('buildOperationalAlerts', () => {
  const TODAY_KEY = '2026-09-24'
  const CLEARANCE_OVERDUE_DAYS = 3

  function build(processes) {
    return buildOperationalAlerts(processes, {
      todayKey: TODAY_KEY,
      clearanceOverdueDays: CLEARANCE_OVERDUE_DAYS,
    })
  }

  it('freeTime D-2 (presenca 19/09 + 7 dias)', () => {
    const process = {
      id: 'p1',
      category: 'FCL',
      freeTimeDays: 7,
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '2026-09-19T08:00',
    }
    const alerts = build([process])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'freeTime', daysRemaining: 2 })
  })

  it('freeTime D-5 (presenca 16/09 + 13 dias)', () => {
    const process = {
      id: 'p2',
      category: 'FCL',
      freeTimeDays: 13,
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '2026-09-16T08:00',
    }
    const alerts = build([process])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'freeTime', daysRemaining: 5 })
  })

  it.each([
    ['D-3', '2026-09-18T08:00', 15],
    ['D-1', '2026-09-16T08:00', 15],
    ['D-0', '2026-09-16T08:00', 8],
    ['vencido', '2026-09-01T08:00', 5],
  ])('freeTime %s -> nenhum alerta', (_label, presenceAt, days) => {
    const process = {
      id: 'p3',
      category: 'FCL',
      freeTimeDays: days,
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: presenceAt,
    }
    expect(build([process])).toHaveLength(0)
  })

  it('CONSOLIDADO com todos os vazios devolvidos -> nada', () => {
    const process = {
      id: 'p4',
      category: 'CONSOLIDADO',
      freeTimeDays: 7,
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '2026-09-19T08:00',
      containers: [{ id: 'CNT-1', returnedAt: '2026-09-20' }],
    }
    expect(build([process])).toHaveLength(0)
  })

  it('LCL -> nada (fora de FREE_TIME_CATEGORIES_MIRROR)', () => {
    const process = {
      id: 'p5',
      category: 'LCL',
      freeTimeDays: 7,
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '2026-09-19T08:00',
    }
    expect(build([process])).toHaveLength(0)
  })

  it('archived: true -> nada', () => {
    const process = {
      id: 'p6',
      category: 'FCL',
      freeTimeDays: 7,
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '2026-09-19T08:00',
      archived: true,
    }
    expect(build([process])).toHaveLength(0)
  })

  it('processStatus "Carga recebida" -> nada', () => {
    const process = {
      id: 'p7',
      category: 'FCL',
      freeTimeDays: 7,
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '2026-09-19T08:00',
      processStatus: 'Carga recebida',
    }
    expect(build([process])).toHaveLength(0)
  })

  it('etaOverdue maritimo: ETA 21/09 sem berthedAt -> days: 3, atracação', () => {
    const process = { id: 'p8', category: 'FCL', eta: '2026-09-21' }
    const alerts = build([process])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'etaOverdue', days: 3, arrivalLabel: 'atracação' })
  })

  it('ETA 22/09 -> 2 dias nao e >2 -> nada', () => {
    const process = { id: 'p9', category: 'FCL', eta: '2026-09-22' }
    expect(build([process])).toHaveLength(0)
  })

  it('AEREO ETA vencida -> chegada', () => {
    const process = { id: 'p10', category: 'AEREO', eta: '2026-09-21' }
    const alerts = build([process])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'etaOverdue', arrivalLabel: 'chegada' })
  })

  it('com berthedAt -> nada', () => {
    const process = { id: 'p11', category: 'FCL', eta: '2026-09-21', berthedAt: '2026-09-21T10:00' }
    expect(build([process])).toHaveLength(0)
  })

  it('clearanceOverdue: parameterizedAt 20/09 canal Amarelo sem clearanceCompletedAt -> days: 4', () => {
    const process = {
      id: 'p12',
      category: 'FCL',
      parameterizedAt: '2026-09-20T09:00',
      parameterizationChannel: 'Amarelo',
    }
    const alerts = build([process])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'clearanceOverdue', days: 4 })
  })

  it('canal Verde -> nada (ja desembaracado)', () => {
    const process = {
      id: 'p13',
      category: 'FCL',
      parameterizedAt: '2026-09-20T09:00',
      parameterizationChannel: 'Verde',
    }
    expect(build([process])).toHaveLength(0)
  })

  it('com clearanceCompletedAt -> nada', () => {
    const process = {
      id: 'p14',
      category: 'FCL',
      parameterizedAt: '2026-09-20T09:00',
      parameterizationChannel: 'Amarelo',
      clearanceCompletedAt: '2026-09-22T09:00',
    }
    expect(build([process])).toHaveLength(0)
  })

  it('parameterizedAt 21/09 (3 dias, nao >3) -> nada', () => {
    const process = {
      id: 'p15',
      category: 'FCL',
      parameterizedAt: '2026-09-21T09:00',
      parameterizationChannel: 'Amarelo',
    }
    expect(build([process])).toHaveLength(0)
  })

  it('duimpStatus Parametrizada sem parameterizedAt -> nada (sem data-base)', () => {
    const process = { id: 'p16', category: 'FCL', duimpStatus: 'Parametrizada', parameterizationChannel: 'Amarelo' }
    expect(build([process])).toHaveLength(0)
  })

  it('collectionWithoutCarrier: janela amanha sem carrierName -> alerta', () => {
    const process = {
      id: 'p17',
      category: 'FCL',
      collectionWindows: [{ id: 'W1', scheduledAt: '2026-09-25T13:00:00.000Z' }],
    }
    const alerts = build([process])
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'collectionWithoutCarrier' })
  })

  it('com carrierName -> nada', () => {
    const process = {
      id: 'p18',
      category: 'FCL',
      carrierName: 'Transportadora X',
      collectionWindows: [{ id: 'W1', scheduledAt: '2026-09-25T13:00:00.000Z' }],
    }
    expect(build([process])).toHaveLength(0)
  })

  it('janela 2026-09-26T01:30:00.000Z (= 25/09 22:30 BRT) -> alerta', () => {
    const process = {
      id: 'p19',
      category: 'FCL',
      collectionWindows: [{ id: 'W1', scheduledAt: '2026-09-26T01:30:00.000Z' }],
    }
    expect(build([process])).toHaveLength(1)
  })

  it('janela 2026-09-26T03:30:00.000Z (= 26/09 00:30 BRT) -> nada', () => {
    const process = {
      id: 'p20',
      category: 'FCL',
      collectionWindows: [{ id: 'W1', scheduledAt: '2026-09-26T03:30:00.000Z' }],
    }
    expect(build([process])).toHaveLength(0)
  })

  it('legado collectionScheduledAt sem janelas -> alerta', () => {
    const process = { id: 'p21', category: 'FCL', collectionScheduledAt: '2026-09-25T10:00' }
    expect(build([process])).toHaveLength(1)
  })

  it('ordem: freeTime D-2, freeTime D-5, collectionWithoutCarrier, etaOverdue, clearanceOverdue; empate por processId', () => {
    const processes = [
      {
        id: 'z-clearance',
        category: 'FCL',
        parameterizedAt: '2026-09-20T09:00',
        parameterizationChannel: 'Amarelo',
      },
      { id: 'y-eta', category: 'FCL', eta: '2026-09-21' },
      {
        id: 'x-collection',
        category: 'FCL',
        collectionWindows: [{ id: 'W1', scheduledAt: '2026-09-25T13:00:00.000Z' }],
      },
      {
        id: 'w-freetime-d5',
        category: 'FCL',
        freeTimeDays: 13,
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: '2026-09-16T08:00',
      },
      {
        id: 'v-freetime-d2',
        category: 'FCL',
        freeTimeDays: 7,
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: '2026-09-19T08:00',
      },
    ]
    const alerts = build(processes)
    expect(alerts.map((alert) => alert.kind)).toEqual([
      'freeTime',
      'freeTime',
      'collectionWithoutCarrier',
      'etaOverdue',
      'clearanceOverdue',
    ])
    expect(alerts[0].daysRemaining).toBe(2)
    expect(alerts[1].daysRemaining).toBe(5)
  })
})

describe('buildDailyAlertsText', () => {
  function labelFor(process) {
    return process.name
  }

  it('1 alerta termina em ponto final', () => {
    const alerts = [{ kind: 'clearanceOverdue', process: { name: 'PO 1' }, days: 4 }]
    const { title, body } = buildDailyAlertsText(alerts, labelFor)
    expect(title).toBe('Alertas operacionais do dia (1)')
    expect(body.endsWith('.')).toBe(true)
    expect(body).toContain('PO 1 parametrizada há 4 dias sem desembaraço')
  })

  it('10 alertas -> 8 itens + " e mais 2."', () => {
    const alerts = Array.from({ length: 10 }, (_, index) => ({
      kind: 'clearanceOverdue',
      process: { name: `PO ${index + 1}` },
      days: 4,
    }))
    const { title, body } = buildDailyAlertsText(alerts, labelFor)
    expect(title).toBe('Alertas operacionais do dia (10)')
    expect(body.endsWith('e mais 2.')).toBe(true)
    expect(body.split('; ')).toHaveLength(8)
  })

  it('textos exatos por tipo', () => {
    const alerts = [
      { kind: 'freeTime', process: { name: 'PO FT' }, daysRemaining: 2, deadlineKey: '2026-09-26' },
      { kind: 'collectionWithoutCarrier', process: { name: 'PO COL' }, dateKey: '2026-09-25' },
      { kind: 'etaOverdue', process: { name: 'PO ETA' }, days: 3, arrivalLabel: 'atracação' },
      { kind: 'clearanceOverdue', process: { name: 'PO DES' }, days: 4 },
    ]
    const { body } = buildDailyAlertsText(alerts, labelFor)
    expect(body).toContain('Free time de PO FT vence em 2 dias (26/09/2026)')
    expect(body).toContain('Coleta de PO COL amanhã (25/09/2026) sem transportadora')
    expect(body).toContain('ETA de PO ETA vencida há 3 dias sem atracação')
    expect(body).toContain('PO DES parametrizada há 4 dias sem desembaraço')
  })
})
