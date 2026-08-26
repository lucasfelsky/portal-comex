// Testes do util puro `getDashboardKpis` (Ciclo 2a — redesign Fase 2,
// faixa de KPIs do Dashboard). Sem render: cobre so' os 4 contadores.
//
// Relogio pinado numa data conhecida (mesma quinta-feira 2026-07-09
// usada em `getWeeklyArrivalProcesses.test.js`, semana-calendario
// 2026-07-06 (seg) .. 2026-07-12 (dom)) pra `chegadasNaSemana` ser
// deterministico sem depender do relogio real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboardKpis } from '../../src/features/processes/dashboardKpis'

const NOW = new Date('2026-07-09T14:00:00-03:00')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getDashboardKpis', () => {
  it('lista vazia -> os 4 contadores zerados', () => {
    expect(getDashboardKpis([], NOW)).toEqual({
      chegadasNaSemana: 0,
      emTransito: 0,
      aguardandoAtracacao: 0,
      canalVermelho: 0,
    })
  })

  it('lista null/undefined -> os 4 contadores zerados (sem lancar erro)', () => {
    expect(getDashboardKpis(null, NOW)).toEqual({
      chegadasNaSemana: 0,
      emTransito: 0,
      aguardandoAtracacao: 0,
      canalVermelho: 0,
    })
    expect(getDashboardKpis(undefined, NOW)).toEqual({
      chegadasNaSemana: 0,
      emTransito: 0,
      aguardandoAtracacao: 0,
      canalVermelho: 0,
    })
  })

  describe('chegadasNaSemana', () => {
    it('conta processo com janela de coleta na semana (scheduled)', () => {
      const processes = [
        {
          id: 'p-scheduled',
          processStatus: 'Coleta Agendada',
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-07-10T08:00:00-03:00' }],
        },
      ]
      expect(getDashboardKpis(processes, NOW).chegadasNaSemana).toBe(1)
    })

    it('conta processo sem janela mas com previsao automatica na semana (unscheduled)', () => {
      const processes = [
        {
          id: 'p-unscheduled',
          processStatus: 'Aguardando agendamento de coleta',
          collectionStatus: 'Aguardando agendamento de coleta',
          collectionWindows: [],
          warehouseDeliveryDateOverride: '2026-07-09',
        },
      ]
      expect(getDashboardKpis(processes, NOW).chegadasNaSemana).toBe(1)
    })

    it('soma scheduled + unscheduled', () => {
      const processes = [
        {
          id: 'p-scheduled',
          processStatus: 'Coleta Agendada',
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-07-10T08:00:00-03:00' }],
        },
        {
          id: 'p-unscheduled',
          processStatus: 'Aguardando agendamento de coleta',
          collectionStatus: 'Aguardando agendamento de coleta',
          collectionWindows: [],
          warehouseDeliveryDateOverride: '2026-07-12',
        },
      ]
      expect(getDashboardKpis(processes, NOW).chegadasNaSemana).toBe(2)
    })

    it('NAO conta processo ja finalizado (em estoque) nem previsao fora da semana', () => {
      const processes = [
        {
          id: 'p-in-stock',
          processStatus: 'Carga recebida',
          collectionStatus: 'Carga disponível em estoque',
          collectionWindows: [],
          warehouseDeliveryDateOverride: '2026-07-09',
        },
        {
          id: 'p-far-future',
          processStatus: 'Aguardando agendamento de coleta',
          collectionStatus: 'Aguardando agendamento de coleta',
          collectionWindows: [],
          warehouseDeliveryDateOverride: '2026-08-15',
        },
      ]
      expect(getDashboardKpis(processes, NOW).chegadasNaSemana).toBe(0)
    })
  })

  describe('emTransito', () => {
    it('conta processStatus "Embarcou" (grafia canonica)', () => {
      const processes = [{ id: 'p-1', processStatus: 'Embarcou' }]
      expect(getDashboardKpis(processes, NOW).emTransito).toBe(1)
    })

    it('conta processStatus "Embarcado" (grafia usada nas fixtures)', () => {
      const processes = [{ id: 'p-1', processStatus: 'Embarcado' }]
      expect(getDashboardKpis(processes, NOW).emTransito).toBe(1)
    })

    it('conta as duas grafias somadas, sem contar outros status', () => {
      const processes = [
        { id: 'p-1', processStatus: 'Embarcou' },
        { id: 'p-2', processStatus: 'Embarcado' },
        { id: 'p-3', processStatus: 'Aguardando Embarque' },
      ]
      expect(getDashboardKpis(processes, NOW).emTransito).toBe(2)
    })
  })

  describe('aguardandoAtracacao', () => {
    it('conta "Aguardando atracação" (com acento, grafia canonica)', () => {
      const processes = [{ id: 'p-1', processStatus: 'Aguardando atracação' }]
      expect(getDashboardKpis(processes, NOW).aguardandoAtracacao).toBe(1)
    })

    it('conta variacao sem acento (normalizeComparableText remove diacritico)', () => {
      const processes = [{ id: 'p-1', processStatus: 'aguardando atracacao' }]
      expect(getDashboardKpis(processes, NOW).aguardandoAtracacao).toBe(1)
    })

    it('NAO conta outros status', () => {
      const processes = [
        { id: 'p-1', processStatus: 'Embarcou' },
        { id: 'p-2', processStatus: 'Atracação Confirmada' },
      ]
      expect(getDashboardKpis(processes, NOW).aguardandoAtracacao).toBe(0)
    })
  })

  describe('canalVermelho', () => {
    it('conta parameterizationChannel "Vermelho" exato', () => {
      const processes = [{ id: 'p-1', parameterizationChannel: 'Vermelho' }]
      expect(getDashboardKpis(processes, NOW).canalVermelho).toBe(1)
    })

    it('conta com espacos ao redor (trim aplicado)', () => {
      const processes = [{ id: 'p-1', parameterizationChannel: '  Vermelho  ' }]
      expect(getDashboardKpis(processes, NOW).canalVermelho).toBe(1)
    })

    it('NAO conta outros canais (Verde, Amarelo, Cinza) nem vazio/ausente', () => {
      const processes = [
        { id: 'p-1', parameterizationChannel: 'Verde' },
        { id: 'p-2', parameterizationChannel: 'Amarelo' },
        { id: 'p-3', parameterizationChannel: '' },
        { id: 'p-4' },
      ]
      expect(getDashboardKpis(processes, NOW).canalVermelho).toBe(0)
    })
  })

  it('os 4 contadores sao independentes entre si (fixture combinada)', () => {
    const processes = [
      // chegadasNaSemana + canalVermelho
      {
        id: 'p-scheduled',
        processStatus: 'Coleta Agendada',
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ scheduledAt: '2026-07-10T08:00:00-03:00' }],
        parameterizationChannel: 'Vermelho',
      },
      // emTransito
      { id: 'p-transito', processStatus: 'Embarcado' },
      // aguardandoAtracacao
      { id: 'p-atracacao', processStatus: 'Aguardando atracação' },
      // nenhum KPI (processo neutro, fora da semana)
      {
        id: 'p-neutro',
        processStatus: 'Aguardando Embarque',
        collectionStatus: 'Aguardando agendamento de coleta',
        collectionWindows: [],
        warehouseDeliveryDateOverride: '2026-08-15',
        parameterizationChannel: 'Verde',
      },
    ]

    expect(getDashboardKpis(processes, NOW)).toEqual({
      chegadasNaSemana: 1,
      emTransito: 1,
      aguardandoAtracacao: 1,
      canalVermelho: 1,
    })
  })
})
