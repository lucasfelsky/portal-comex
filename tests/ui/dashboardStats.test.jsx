// Testes do util puro de estatísticas do Dashboard (backlog v0.12:
// stat-cards com trend + sparkline). Datas são passadas explicitamente
// via `now` — sem dependência do relógio real.
import { describe, expect, it } from 'vitest'
import {
  buildWeeklyEtaSeries,
  computeTrendDelta,
  countActiveProcesses,
  startOfCalendarWeek,
} from '../../src/utils/dashboardStats'

// Quarta-feira 2026-07-08 -> semana-calendário 2026-07-06 (seg) .. 12 (dom).
const NOW = new Date('2026-07-08T12:00:00')

describe('startOfCalendarWeek', () => {
  it('quarta-feira volta para a segunda da mesma semana', () => {
    const start = startOfCalendarWeek(new Date('2026-07-08T15:30:00'))
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(6)
    expect(start.getHours()).toBe(0)
  })

  it('domingo pertence a semana que comecou na segunda anterior', () => {
    const start = startOfCalendarWeek(new Date('2026-07-12T09:00:00'))
    expect(start.getDate()).toBe(6)
  })

  it('segunda-feira e o proprio inicio da semana', () => {
    const start = startOfCalendarWeek(new Date('2026-07-06T00:30:00'))
    expect(start.getDate()).toBe(6)
  })
})

describe('buildWeeklyEtaSeries', () => {
  it('conta ETAs por semana-calendario, semana atual no fim da serie', () => {
    const processes = [
      { id: 'a', eta: '2026-07-10' }, // semana atual
      { id: 'b', eta: '2026-07-06' }, // semana atual (segunda)
      { id: 'c', eta: '2026-07-12' }, // semana atual (domingo)
      { id: 'd', eta: '2026-07-03' }, // semana anterior
      { id: 'e', eta: '2026-08-15' }, // futuro, fora da serie
      { id: 'f', eta: '' }, // sem ETA, ignorado
      { id: 'g', eta: 'data-invalida' }, // invalida, ignorada
    ]

    const series = buildWeeklyEtaSeries(processes, { now: NOW, weeks: 4 })

    expect(series.counts).toHaveLength(4)
    expect(series.currentWeekCount).toBe(3)
    expect(series.previousWeekCount).toBe(1)
    expect(series.counts[3]).toBe(3)
    expect(series.counts[2]).toBe(1)
  })

  it('ETA anterior a janela da serie e descartada', () => {
    const processes = [{ id: 'old', eta: '2026-01-05' }]
    const series = buildWeeklyEtaSeries(processes, { now: NOW, weeks: 4 })
    expect(series.counts.every((count) => count === 0)).toBe(true)
  })

  it('lista vazia/invalida -> serie zerada', () => {
    expect(buildWeeklyEtaSeries([], { now: NOW }).currentWeekCount).toBe(0)
    expect(buildWeeklyEtaSeries(null, { now: NOW }).currentWeekCount).toBe(0)
  })
})

describe('computeTrendDelta', () => {
  it('calcula percentual inteiro (atual vs anterior)', () => {
    expect(computeTrendDelta(3, 2)).toBe(50)
    expect(computeTrendDelta(1, 2)).toBe(-50)
    expect(computeTrendDelta(2, 2)).toBe(0)
  })

  it('sem base de comparacao (anterior = 0) retorna null', () => {
    expect(computeTrendDelta(5, 0)).toBeNull()
  })

  it('entradas nao numericas retornam null', () => {
    expect(computeTrendDelta(NaN, 2)).toBeNull()
    expect(computeTrendDelta(2, undefined)).toBeNull()
  })
})

describe('countActiveProcesses', () => {
  it('exclui apenas processos ja em estoque (isProcessTrulyFinalized)', () => {
    const processes = [
      { id: 'a', collectionStatus: 'Coleta Agendada' },
      { id: 'b', collectionStatus: 'Carga disponivel em estoque' },
      { id: 'c', collectionStatus: '' },
    ]
    expect(countActiveProcesses(processes)).toBe(2)
  })

  it('lista vazia/invalida -> 0', () => {
    expect(countActiveProcesses([])).toBe(0)
    expect(countActiveProcesses(undefined)).toBe(0)
  })
})
