// Specs de getProcessStatusDetail / getArrivalNoteLabel e do contrato de tom
// entre getProcessStatusTone (tag crua) e getProcessDerivedStatus (selo).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  getArrivalNoteLabel,
  getProcessDerivedStatus,
  getProcessStatusDetail,
} from '../../src/features/processes/processDerivedStatus'
import {
  CD_EN_ROUTE_STATUS,
  getProcessStatusTone,
  processStatusOptions,
} from '../../src/features/processes/processStatus'

beforeAll(() => {
  // Relogio congelado em 2026-07-09 14:00 BRT (fake timers: o default `now`
  // das funcoes e `new Date()`).
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-09T14:00:00-03:00'))
})

afterAll(() => {
  vi.useRealTimers()
})

const base = { category: 'FCL', eta: '2026-08-01', collectionWindows: [] }

describe('contrato de tom: tag crua x selo derivado', () => {
  const farFuture = { category: 'FCL', eta: '2099-01-01', collectionWindows: [] }

  it.each([...processStatusOptions])('processStatus %j tem o mesmo tom do selo derivado', (status) => {
    const derived = getProcessDerivedStatus({ ...farFuture, processStatus: status })
    expect(getProcessStatusTone(status)).toBe(derived.tone)
  })

  it('collectionStatus "Carga a caminho do CD" tem o mesmo tom do selo derivado', () => {
    const derived = getProcessDerivedStatus({ ...farFuture, collectionStatus: CD_EN_ROUTE_STATUS })
    expect(getProcessStatusTone(CD_EN_ROUTE_STATUS)).toBe(derived.tone)
  })

  it('tons novos explicitos', () => {
    expect(getProcessStatusTone('Aguardando registro da DUIMP')).toBe('info')
    expect(getProcessStatusTone('Aguardando agendamento de coleta')).toBe('info')
    expect(getProcessStatusTone('Embarcou')).toBe('neutral')
  })
})

describe('getProcessStatusDetail - redundante devolve vazio', () => {
  it.each([
    ['FCL Embarcou', { ...base, processStatus: 'Embarcou' }],
    [
      'FCL Atracação Confirmada',
      { ...base, processStatus: 'Atracação Confirmada', berthedAt: '2026-07-06T08:00' },
    ],
    [
      'AEREO Atracação Confirmada (Chegada confirmada)',
      { ...base, category: 'AEREO', processStatus: 'Atracação Confirmada', arrivedAt: '2026-07-06T08:00' },
    ],
    ['AEREO Aguardando atracação (Aguardando chegada)', { ...base, category: 'AEREO', processStatus: 'Aguardando atracação' }],
    ['Aguardando Embarque', { ...base, processStatus: 'Aguardando Embarque' }],
    [
      'Aguardando desembaraço',
      { ...base, processStatus: 'Aguardando desembaraço', berthedAt: '2026-07-06T08:00' },
    ],
    [
      'Aguardando agendamento de coleta',
      { ...base, processStatus: 'Aguardando agendamento de coleta', berthedAt: '2026-07-06T08:00' },
    ],
    [
      'collectionStatus Coleta Agendada com janela futura',
      {
        ...base,
        berthedAt: '2026-07-06T08:00',
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ id: 'w', containerNumber: 1, scheduledAt: '2026-07-10T09:00:00-03:00' }],
      },
    ],
    ['collectionStatus Carga a caminho do CD', { ...base, collectionStatus: 'Carga a caminho do CD' }],
  ])('%s', (_label, process) => {
    expect(getProcessStatusDetail(process)).toBe('')
  })
})

describe('getProcessStatusDetail - nao redundante devolve o texto', () => {
  it('Aguardando parametrização da DUIMP com atracação e DUIMP registrada', () => {
    expect(
      getProcessStatusDetail({
        ...base,
        processStatus: 'Aguardando parametrização da DUIMP',
        berthedAt: '2026-07-06T08:00',
        duimpRegisteredAt: '2026-07-08T09:00',
      }),
    ).toBe('Aguardando parametrização da DUIMP')
  })

  it('DUIMP sob águas (derivado Embarcado) mantém o texto da DUIMP', () => {
    const process = {
      ...base,
      eta: '2099-01-15',
      processStatus: 'Aguardando parametrização da DUIMP',
      shippedAt: '2026-07-01',
      duimpRegisteredAt: '2026-07-07T09:00',
    }
    expect(getProcessDerivedStatus(process).label).toBe('Embarcado')
    expect(getProcessStatusDetail(process)).toBe('Aguardando parametrização da DUIMP')
  })

  it('Aguardando registro da DUIMP com presença de carga (derivado No porto)', () => {
    expect(
      getProcessStatusDetail({
        ...base,
        processStatus: 'Aguardando registro da DUIMP',
        berthedAt: '2026-07-06T08:00',
        cargoPresenceInformedAt: '2026-07-07T09:00',
      }),
    ).toBe('Aguardando registro da DUIMP')
  })

  it('Embarcou + collectionStatus Aguardando agendamento de coleta (derivado Embarcado)', () => {
    const process = {
      ...base,
      processStatus: 'Embarcou',
      collectionStatus: 'Aguardando agendamento de coleta',
    }
    expect(getProcessDerivedStatus(process).label).toBe('Embarcado')
    expect(getProcessStatusDetail(process)).toBe('Aguardando agendamento de coleta')
  })
})

describe('getProcessStatusDetail - bordas', () => {
  it("source 'processStatus' ignora o collectionStatus", () => {
    expect(
      getProcessStatusDetail(
        { ...base, processStatus: 'Embarcou', collectionStatus: 'Aguardando' },
        { source: 'processStatus' },
      ),
    ).toBe('')
  })

  it('processo nulo devolve vazio', () => {
    expect(getProcessStatusDetail(null)).toBe('')
  })
})

describe('getArrivalNoteLabel', () => {
  it('Carga a caminho do CD -> sem nota', () => {
    expect(getArrivalNoteLabel({ ...base, collectionStatus: 'Carga a caminho do CD' })).toBe('')
  })

  it('Carga recebida, em conferência -> sem nota', () => {
    expect(getArrivalNoteLabel({ ...base, collectionStatus: 'Carga recebida, em conferência' })).toBe('')
  })

  it('Coleta Agendada com janela passada (Em rota) -> sem nota', () => {
    expect(
      getArrivalNoteLabel({
        ...base,
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ id: 'w', containerNumber: 1, scheduledAt: '2020-01-01T09:00:00-03:00' }],
      }),
    ).toBe('')
  })

  it('Embarcou + Aguardando agendamento de coleta -> "Coleta ainda não agendada"', () => {
    expect(
      getArrivalNoteLabel({
        ...base,
        processStatus: 'Embarcou',
        collectionStatus: 'Aguardando agendamento de coleta',
      }),
    ).toBe('Coleta ainda não agendada')
  })
})
