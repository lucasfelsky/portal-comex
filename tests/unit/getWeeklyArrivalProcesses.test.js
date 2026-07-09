import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getWeeklyArrivalProcesses, getWeekRange } from '../../src/features/processes/WeeklyArrivalsCard'

// PR #13 (2026-07-09): o Lucas reportou que processos com
// previsao de entrega no MESMO DIA somem do card 'Chegadas
// da semana'. Root cause: comparacao de datas em ms tinha
// problema de timezone - `new Date('YYYY-MM-DD')` vira meia-
// noite UTC, mas `start.getTime()` era meia-noite local. Em
// BRT (UTC-3), meia-noite local = 03:00 UTC, e a previsao
// (00:00 UTC) caia ANTES de `start` (03:00 UTC), fazendo o
// filtro descartar o processo.
describe('getWeeklyArrivalProcesses (PR #13: previsao no mesmo dia)', () => {
  it('inclui processo com previsao HOJE na secao unscheduled', () => {
    // now = 2026-07-09 14:00 BRT (quinta-feira)
    // semana: 2026-07-09 ate 2026-07-12
    // previsao calculada: 2026-07-09 (hoje, janela matutino)
    const now = new Date('2026-07-09T14:00:00-03:00')
    const processes = [
      {
        id: 'p-hoje',
        name: 'TEST HOJE',
        processNumber: 'TEST-HOJE',
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ scheduledAt: '2026-07-09T08:00:00-03:00' }],
      },
    ]
    const result = getWeeklyArrivalProcesses(processes, now)
    // O processo tem janela agendada HOJE, entao cai em
    // "scheduled" (com janela na semana) E nao' em
    // "unscheduled".
    expect(result.scheduled.map(s => s.process.id)).toContain('p-hoje')
  })

  it('inclui processo SEM janela mas com previsao HOJE na secao unscheduled', async () => {
    // Mesmo caso mas SEM collectionWindows (so' previsao automatica).
    // Aqui e' onde o bug original aparecia.
    const now = new Date('2026-07-09T14:00:00-03:00')
    const processes = [
      {
        id: 'p-previsao-hoje',
        name: 'TEST PREVISAO HOJE',
        processNumber: 'TEST-PH',
        collectionStatus: 'Aguardando agendamento de coleta',
        collectionWindows: [],
        warehouseDeliveryDateOverride: '2026-07-09', // previsao manual
      },
    ]
    const result = getWeeklyArrivalProcesses(processes, now)
    expect(result.unscheduled.map(u => u.process.id)).toContain('p-previsao-hoje')
  })

  it('inclui processo com previsao no inicio da semana (quinta)', () => {
    const now = new Date('2026-07-09T14:00:00-03:00')
    const processes = [
      {
        id: 'p-quinta',
        name: 'TEST QUINTA',
        processNumber: 'TEST-Q',
        collectionStatus: 'Aguardando agendamento de coleta',
        collectionWindows: [],
        warehouseDeliveryDateOverride: '2026-07-09',
      },
    ]
    const result = getWeeklyArrivalProcesses(processes, now)
    expect(result.unscheduled.length).toBe(1)
    expect(result.unscheduled[0].process.id).toBe('p-quinta')
  })

  it('inclui processo com previsao no final da semana (domingo)', () => {
    const now = new Date('2026-07-09T14:00:00-03:00')
    const processes = [
      {
        id: 'p-domingo',
        name: 'TEST DOMINGO',
        processNumber: 'TEST-D',
        collectionStatus: 'Aguardando agendamento de coleta',
        collectionWindows: [],
        warehouseDeliveryDateOverride: '2026-07-12', // domingo
      },
    ]
    const result = getWeeklyArrivalProcesses(processes, now)
    expect(result.unscheduled.length).toBe(1)
    expect(result.unscheduled[0].process.id).toBe('p-domingo')
  })

  it('EXCLUI processo com previsao antes da semana (semana passada)', () => {
    const now = new Date('2026-07-09T14:00:00-03:00')
    const processes = [
      {
        id: 'p-passado',
        name: 'TEST PASSADO',
        processNumber: 'TEST-P',
        collectionStatus: 'Aguardando agendamento de coleta',
        collectionWindows: [],
        warehouseDeliveryDateOverride: '2026-07-05', // domingo passado
      },
    ]
    const result = getWeeklyArrivalProcesses(processes, now)
    expect(result.unscheduled).toEqual([])
  })

  it('EXCLUI processo com previsao depois da semana (semana que vem)', () => {
    const now = new Date('2026-07-09T14:00:00-03:00')
    const processes = [
      {
        id: 'p-futuro',
        name: 'TEST FUTURO',
        processNumber: 'TEST-F',
        collectionStatus: 'Aguardando agendamento de coleta',
        collectionWindows: [],
        warehouseDeliveryDateOverride: '2026-07-20',
      },
    ]
    const result = getWeeklyArrivalProcesses(processes, now)
    expect(result.unscheduled).toEqual([])
  })

  it('getWeekRange retorna inicio da semana (meia-noite local) e domingo 23:59:59.999 local', () => {
    // PR #13: o spec nao' hardcoda valores em UTC porque o teste
    // precisa rodar identico em BRT (UTC-3) e em UTC (CI linux).
    // Em vez disso, valida as PROPRIEDADES da data:
    // - start: meia-noite local
    // - end: domingo 23:59:59.999 local
    // - diferenca entre start e end <= 6 dias
    const now = new Date('2026-07-09T14:00:00-03:00') // quinta
    const { start, end } = getWeekRange(now)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    // Domingo = getDay() === 0
    expect(end.getDay()).toBe(0)
    // Diferenca entre start e end <= 6 dias (0 se hoje = domingo)
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBeLessThanOrEqual(6.01)
    expect(days).toBeGreaterThanOrEqual(0)
  })
})
