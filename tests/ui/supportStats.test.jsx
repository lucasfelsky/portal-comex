// F4 (backlog 2026-07-12): métricas do painel de suporte. Util puro com
// `now` explícito — sem dependência do relógio real (lição do PR #22).
import { describe, expect, it } from 'vitest'
import {
  averageResolutionHours,
  buildWeeklyTicketSeries,
  countUnresolvedByPriority,
  formatResolutionHours,
} from '../../src/utils/supportStats'

const NOW = new Date('2026-07-08T12:00:00')

describe('averageResolutionHours', () => {
  it('media apenas dos resolvidos com as duas datas', () => {
    const tickets = [
      // 24h
      {
        status: 'resolvido',
        createdAt: '2026-07-01T10:00:00',
        resolvedAt: '2026-07-02T10:00:00',
      },
      // 48h
      {
        status: 'resolvido',
        createdAt: '2026-07-01T10:00:00',
        resolvedAt: '2026-07-03T10:00:00',
      },
      // abertos/invalidos nao entram
      { status: 'aberto', createdAt: '2026-07-01T10:00:00' },
      { status: 'resolvido', createdAt: '2026-07-01T10:00:00', resolvedAt: null },
    ]
    expect(averageResolutionHours(tickets)).toBe(36)
  })

  it('resolvedAt anterior ao createdAt e descartado (dado corrompido)', () => {
    const tickets = [
      {
        status: 'resolvido',
        createdAt: '2026-07-02T10:00:00',
        resolvedAt: '2026-07-01T10:00:00',
      },
    ]
    expect(averageResolutionHours(tickets)).toBeNull()
  })

  it('sem resolvidos -> null', () => {
    expect(averageResolutionHours([])).toBeNull()
    expect(averageResolutionHours(null)).toBeNull()
  })
})

describe('formatResolutionHours', () => {
  it('abaixo de 48h mostra horas inteiras', () => {
    expect(formatResolutionHours(17.6)).toBe('18h')
  })

  it('48h ou mais mostra dias com 1 decimal (pt-BR)', () => {
    expect(formatResolutionHours(60)).toBe('2,5 d')
  })

  it('null -> travessao', () => {
    expect(formatResolutionHours(null)).toBe('—')
  })
})

describe('countUnresolvedByPriority', () => {
  it('conta aberto + em_andamento com breakdown por prioridade', () => {
    const tickets = [
      { status: 'aberto', priority: 5 },
      { status: 'em_andamento', priority: 5 },
      { status: 'aberto', priority: 3 },
      { status: 'resolvido', priority: 4 },
    ]
    const result = countUnresolvedByPriority(tickets)
    expect(result.total).toBe(3)
    expect(result.byPriority[5]).toBe(2)
    expect(result.byPriority[3]).toBe(1)
    expect(result.byPriority[4]).toBe(0)
  })
})

describe('buildWeeklyTicketSeries', () => {
  it('conta aberturas por semana-calendario, atual no fim', () => {
    const tickets = [
      { createdAt: '2026-07-07T09:00:00' }, // semana atual
      { createdAt: '2026-07-12T23:00:00' }, // semana atual (domingo)
      { createdAt: '2026-07-03T09:00:00' }, // semana anterior
      { createdAt: '2026-01-01T09:00:00' }, // fora da janela
      { createdAt: '' }, // ignorado
    ]
    const series = buildWeeklyTicketSeries(tickets, { now: NOW, weeks: 4 })
    expect(series.currentWeekCount).toBe(2)
    expect(series.previousWeekCount).toBe(1)
    expect(series.counts).toHaveLength(4)
  })
})
