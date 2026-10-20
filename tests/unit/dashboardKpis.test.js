// Testes do util puro `getDashboardKpis` (Ciclo 2a — redesign Fase 2,
// faixa de KPIs do Dashboard). Sem render: cobre so' os 4 contadores.
//
// Relogio pinado numa data conhecida (mesma quinta-feira 2026-07-09
// usada em `getWeeklyArrivalProcesses.test.js`, semana-calendario
// 2026-07-06 (seg) .. 2026-07-12 (dom)) pra `chegadasNaSemana` ser
// deterministico sem depender do relogio real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_SUMMARY_MAX,
  formatBarStatusLabel,
  getAnnouncementDayLabel,
  getDashboardKpiNotes,
  getDashboardKpis,
  getPreviousWeekArrivalsCount,
  summarizeAnnouncement,
} from '../../src/features/processes/dashboardKpis'

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

  describe('DUIMP sob aguas (D-5)', () => {
    it('admin: processo sob aguas com status de DUIMP e ETA futura conta em emTransito', () => {
      const processes = [
        {
          id: 'p-1',
          category: 'FCL',
          shippedAt: '2026-07-01',
          eta: '2026-08-01',
          duimpRegisteredAt: '2026-07-08T09:00',
          processStatus: 'Aguardando parametrização da DUIMP',
        },
      ]
      const kpis = getDashboardKpis(processes, NOW)
      expect(kpis.emTransito).toBe(1)
      expect(kpis.aguardandoAtracacao).toBe(0)
    })

    it('admin: sob aguas com ETA vencida conta em aguardandoAtracacao', () => {
      const processes = [
        {
          id: 'p-1',
          category: 'FCL',
          shippedAt: '2026-06-01',
          eta: '2026-07-01',
          duimpRegisteredAt: '2026-07-08T09:00',
          processStatus: 'Aguardando parametrização da DUIMP',
        },
      ]
      const kpis = getDashboardKpis(processes, NOW)
      expect(kpis.aguardandoAtracacao).toBe(1)
      expect(kpis.emTransito).toBe(0)
    })

    it('com atracacao a DUIMP nao conta em transito', () => {
      const processes = [
        {
          id: 'p-1',
          category: 'FCL',
          shippedAt: '2026-07-01',
          eta: '2026-07-05',
          berthedAt: '2026-07-06T08:00',
          duimpRegisteredAt: '2026-07-08T09:00',
          processStatus: 'Aguardando parametrização da DUIMP',
        },
      ]
      expect(getDashboardKpis(processes, NOW).emTransito).toBe(0)
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

// ---------------------------------------------------------------------------
// F4a (Dashboard desktop): nota "+N vs. semana passada", rotulo da barra,
// resumo de comunicado (D10) e "Hoje / Ontem / dd/mm".
// ---------------------------------------------------------------------------
describe('getPreviousWeekArrivalsCount (D12)', () => {
  const lastWeek = (id) => ({
    id,
    processStatus: 'Embarcou',
    collectionStatus: 'Aguardando agendamento de coleta',
    collectionWindows: [],
    // semana anterior: quinta 2026-07-02 .. domingo 2026-07-05
    warehouseDeliveryDateOverride: '2026-07-03',
  })
  const thisWeek = (id) => ({ ...lastWeek(id), warehouseDeliveryDateOverride: '2026-07-10' })

  it('conta so as chegadas previstas para a semana anterior (mesma regra da semana atual)', () => {
    const processes = [lastWeek('a'), lastWeek('b'), thisWeek('c')]
    expect(getPreviousWeekArrivalsCount(processes, NOW)).toBe(2)
    expect(getDashboardKpis(processes, NOW).chegadasNaSemana).toBe(1)
  })

  it('lista vazia, null e undefined dao 0', () => {
    expect(getPreviousWeekArrivalsCount([], NOW)).toBe(0)
    expect(getPreviousWeekArrivalsCount(null, NOW)).toBe(0)
    expect(getPreviousWeekArrivalsCount(undefined, NOW)).toBe(0)
  })
})

describe('getDashboardKpiNotes (D12)', () => {
  const kpis = { chegadasNaSemana: 17, emTransito: 9, aguardandoAtracacao: 4, canalVermelho: 1 }

  it('chegadas: "+N vs. semana passada" em success; queda e igualdade em neutral', () => {
    expect(getDashboardKpiNotes(kpis, 13, 'warn').chegadasNaSemana).toEqual({
      text: '+4 vs. semana passada',
      tone: 'success',
    })
    expect(getDashboardKpiNotes(kpis, 20, 'warn').chegadasNaSemana).toEqual({
      text: '−3 vs. semana passada',
      tone: 'neutral',
    })
    expect(getDashboardKpiNotes(kpis, 17, 'warn').chegadasNaSemana).toEqual({
      text: 'igual à semana passada',
      tone: 'neutral',
    })
  })

  it('em transito e fixo; atracacao segue o tom da barra; canal vermelho exige acao so quando ha', () => {
    const notes = getDashboardKpiNotes(kpis, 13, 'warn')
    expect(notes.emTransito).toEqual({ text: 'embarcados, a caminho', tone: 'neutral' })
    expect(notes.aguardandoAtracacao).toEqual({ text: 'barra com restrições', tone: 'warning' })
    expect(notes.canalVermelho).toEqual({ text: 'exige ação', tone: 'danger' })

    expect(getDashboardKpiNotes(kpis, 13, 'danger').aguardandoAtracacao.tone).toBe('danger')
    expect(getDashboardKpiNotes(kpis, 13, 'ok').aguardandoAtracacao).toEqual({
      text: 'barra praticável',
      tone: 'success',
    })
    expect(getDashboardKpiNotes(kpis, 13, undefined).aguardandoAtracacao.tone).toBe('neutral')
    expect(getDashboardKpiNotes({ ...kpis, canalVermelho: 0 }, 13, 'ok').canalVermelho.tone).toBe('neutral')
  })
})

describe('formatBarStatusLabel', () => {
  it('acentua os 3 status; desconhecido cai no rotulo do repositorio', () => {
    expect(formatBarStatusLabel({ status: 'PRATICAVEL' })).toBe('Praticável')
    expect(formatBarStatusLabel({ status: 'PRATICAVEL_RESTRICOES' })).toBe('Praticável c/ restrições')
    expect(formatBarStatusLabel({ status: 'IMPRATICAVEL' })).toBe('Impraticável')
    expect(formatBarStatusLabel({ status: 'OUTRO', label: 'OUTRO' })).toBe('OUTRO')
    expect(formatBarStatusLabel(null)).toBe('')
  })
})

describe('summarizeAnnouncement (D10)', () => {
  it('texto curto passa inteiro; espacos e quebras de linha colapsam', () => {
    expect(summarizeAnnouncement('  Reunião\n\nmensal   de COMEX ')).toBe('Reunião mensal de COMEX')
    expect(summarizeAnnouncement(undefined)).toBe('')
  })

  it('140 primeiros caracteres + reticencias; exatamente 140 nao trunca', () => {
    const exact = 'a'.repeat(140)
    expect(summarizeAnnouncement(exact)).toBe(exact)
    const long = `${'b'.repeat(140)}cdef`
    expect(summarizeAnnouncement(long)).toBe(`${'b'.repeat(140)}…`)
    expect(ANNOUNCEMENT_SUMMARY_MAX).toBe(140)
  })
})

describe('getAnnouncementDayLabel', () => {
  it('Hoje / Ontem / dd/mm (com ano quando de outro ano), pela data local', () => {
    expect(getAnnouncementDayLabel({ updatedAt: '2026-07-09T08:00:00' }, NOW)).toBe('Hoje')
    expect(getAnnouncementDayLabel({ updatedAt: '2026-07-08T23:30:00' }, NOW)).toBe('Ontem')
    expect(getAnnouncementDayLabel({ updatedAt: '2026-07-01T10:00:00' }, NOW)).toBe('01/07')
    expect(getAnnouncementDayLabel({ updatedAt: '2025-12-31T10:00:00' }, NOW)).toBe('31/12/2025')
    expect(getAnnouncementDayLabel({ createdAt: '2026-07-09T01:00:00' }, NOW)).toBe('Hoje')
    expect(getAnnouncementDayLabel({}, NOW)).toBe('')
  })
})
