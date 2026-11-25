// S9-G do Relatório de Carga: a aba Conferência mostra os processos com previsão de chegada no armazém na semana vigente
// (segunda a domingo) e as pendências de semanas anteriores. Regras puras; o relógio é congelado (só `Date`) porque a
// previsão do Dashboard (`getEstimatedDeliveryDate`) lê a data do aparelho.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARGO_CONFERENCE_WEEKS,
  classifyCargoConferenceWeek,
  countCargoConferenceFilters,
  countCargoConferencesToDo,
  describeCargoConferenceArrival,
  filterCargoConferenceEntries,
  getCargoConferenceWeek,
  getCargoConferenceWeekKey,
  isCargoConferenceCandidate,
  isCargoConferenceEntryVisible,
  resolveCargoConferenceArrival,
  summarizeCargoConferenceEntry,
} from '../../src/features/processes/cargoConferenceList'
import { getEstimatedDeliveryDate } from '../../src/utils/deliveryForecast'

// Quarta 25/11/2026 10:00 (fuso do aparelho). Semana vigente: segunda 23/11 a domingo 29/11.
const WED = new Date(2026, 10, 25, 10, 0)
const iso = (...args) => new Date(...args).toISOString()
const at = (now) => {
  vi.setSystemTime(now)
  return now
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(WED)
})

afterEach(() => {
  vi.useRealTimers()
})

const REPORT = { current: { status: 'concluido', revision: 1, rows: [{ id: 'r-1', dbcorpCode: 'A1' }] }, conference: null }
const CLOSED = { current: REPORT.current, conference: { status: 'fechada', receiptStatus: 'sem_ressalva', okByRowId: { 'r-1': true }, countOkByRowId: { 'r-1': true } } }
const STARTED = { current: REPORT.current, conference: { receiptStatus: 'sem_ressalva' } }

// Carga recebida no CD no dia `day` de novembro (a chegada vale a data real do recebimento).
const received = (id, day, extra = {}) => ({
  id,
  name: `PROC ${id}`,
  category: 'FCL',
  archived: false,
  collectionStatus: 'Veículo no CD para descarga',
  cargoReceivedAt: iso(2026, 10, day, 15, 0),
  ...extra,
})
const inStock = (id, day) => received(id, day, { collectionStatus: 'Carga disponível em estoque' })
const entry = (process, report, now = WED) => summarizeCargoConferenceEntry(process, report, { now })

describe('semana vigente (segunda a domingo)', () => {
  it('de segunda a domingo, em qualquer dia da semana', () => {
    for (const day of [23, 24, 25, 26, 27, 28, 29]) {
      const now = at(new Date(2026, 10, day, 12, 0))
      expect(getCargoConferenceWeek(now), String(day)).toMatchObject({ startKey: '2026-11-23', endKey: '2026-11-29' })
    }
    expect(getCargoConferenceWeekKey(at(new Date(2026, 10, 30, 0, 5)))).toBe('2026-11-30')
    expect(getCargoConferenceWeek(new Date(2026, 10, 30, 0, 5))).toMatchObject({ startKey: '2026-11-30', endKey: '2026-12-06' })
  })

  it('o domingo termina a semana (o fim é o mesmo do card do Dashboard)', () => {
    expect(getCargoConferenceWeek(new Date(2026, 10, 29, 23, 59))).toMatchObject({ startKey: '2026-11-23', endKey: '2026-11-29' })
  })

  it('inclui segunda e domingo; exclui o domingo anterior e a segunda seguinte', () => {
    const week = (key) => classifyCargoConferenceWeek(key, WED)
    expect(week('2026-11-22')).toBe(CARGO_CONFERENCE_WEEKS.previous)
    expect(week('2026-11-23')).toBe(CARGO_CONFERENCE_WEEKS.current)
    expect(week('2026-11-29')).toBe(CARGO_CONFERENCE_WEEKS.current)
    expect(week('2026-11-30')).toBe(CARGO_CONFERENCE_WEEKS.future)
    expect(week('')).toBe(CARGO_CONFERENCE_WEEKS.none)
  })
})

describe('previsão de chegada', () => {
  it('carga já recebida: vale a data real do recebimento ("recebida")', () => {
    expect(resolveCargoConferenceArrival(received('a', 24), 'pos_recebimento', WED)).toEqual({
      key: '2026-11-24',
      source: 'recebida',
    })
  })

  it('sem janela de coleta: a previsão do Dashboard (ETA + dias úteis da categoria)', () => {
    const process = { id: 'e', category: 'FCL', archived: false, eta: '2026-11-16', collectionStatus: 'Carga a caminho do CD' }
    const expected = getEstimatedDeliveryDate(process)
    expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(resolveCargoConferenceArrival(process, 'em_rota', WED)).toEqual({ key: expected, source: 'previsao' })
    // FCL: ETA 16/11 (segunda) + 5 dias úteis, pulando o feriado de 20/11 = terça 24/11.
    expect(expected).toBe('2026-11-24')
  })

  it('coleta agendada: a entrega da janela (a coleta é sexta depois do corte do destino: segunda seguinte)', () => {
    const process = {
      id: 'c',
      category: 'FCL',
      archived: false,
      destination: 'Navegantes',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 27, 16, 0) }],
    }
    // Navegantes corta às 14h: coleta de sexta às 16h entrega na segunda 30/11 = semana seguinte.
    expect(resolveCargoConferenceArrival(process, 'coleta_agendada', WED)).toEqual({ key: '2026-11-30', source: 'previsao' })
    const before = { ...process, collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 27, 10, 0) }] }
    expect(resolveCargoConferenceArrival(before, 'coleta_agendada', WED).key).toBe('2026-11-27')
  })

  it('coleta agendada legada (`collectionScheduledAt`, sem `collectionWindows`) também vale', () => {
    const legacy = { id: 'l', category: 'FCL', archived: false, collectionScheduledAt: iso(2026, 10, 26, 9, 0) }
    expect(isCargoConferenceCandidate(legacy, WED)).toBe(true)
    expect(resolveCargoConferenceArrival(legacy, 'coleta_agendada', WED).key).toBe('2026-11-26')
  })

  it('sem previsão calculável (sem janela, sem ETA, sem recebimento): sem chegada e fora da lista', () => {
    const process = { id: 'n', category: 'FCL', archived: false, collectionStatus: 'Carga a caminho do CD' }
    expect(resolveCargoConferenceArrival(process, 'em_rota', WED)).toBeNull()
    expect(isCargoConferenceCandidate(process, WED)).toBe(false)
    const summary = entry(process, undefined)
    expect(summary).toMatchObject({ arrivalKey: '', week: CARGO_CONFERENCE_WEEKS.none })
  })

  it('texto curto pt-BR: "Chegada prevista seg 23/11" e, para carga recebida, "Chegada qua 25/11"', () => {
    expect(describeCargoConferenceArrival({ arrivalKey: '2026-11-23', arrivalSource: 'previsao' })).toBe('Chegada prevista seg 23/11')
    expect(describeCargoConferenceArrival({ arrivalKey: '2026-11-28', arrivalSource: 'previsao' })).toBe('Chegada prevista sáb 28/11')
    expect(describeCargoConferenceArrival({ arrivalKey: '2026-11-29', arrivalSource: 'previsao' })).toBe('Chegada prevista dom 29/11')
    expect(describeCargoConferenceArrival({ arrivalKey: '2026-11-25', arrivalSource: 'recebida' })).toBe('Chegada qua 25/11')
    expect(describeCargoConferenceArrival({ arrivalKey: '' })).toBe('')
  })
})

describe('quem entra e onde aparece', () => {
  it('semana vigente (segunda a domingo) entra; semana futura fica fora (nem é lida)', () => {
    expect(isCargoConferenceCandidate(received('seg', 23), WED)).toBe(true)
    expect(isCargoConferenceCandidate(received('dom', 29), WED)).toBe(true)
    const future = { id: 'f', category: 'FCL', archived: false, collectionScheduledAt: iso(2026, 10, 30, 9, 0) }
    expect(isCargoConferenceCandidate(future, WED)).toBe(false)
  })

  it('pendência de semana anterior (não fechada) aparece em "Para conferir"; a fechada da semana anterior não aparece', () => {
    const open = entry(received('antiga', 20), REPORT)
    const closed = entry(received('antiga-fechada', 20), CLOSED)
    expect(open.week).toBe(CARGO_CONFERENCE_WEEKS.previous)
    expect(isCargoConferenceCandidate(received('antiga', 20), WED)).toBe(true)
    expect(isCargoConferenceEntryVisible(open, 'pendentes')).toBe(true)
    expect(isCargoConferenceEntryVisible(open, 'fechadas')).toBe(false)
    expect(isCargoConferenceEntryVisible(closed, 'pendentes')).toBe(false)
    expect(isCargoConferenceEntryVisible(closed, 'fechadas')).toBe(false)
  })

  it('"Fechadas" = fechadas com chegada na semana vigente', () => {
    const closedNow = entry(received('hoje-fechada', 24), CLOSED)
    expect(isCargoConferenceEntryVisible(closedNow, 'fechadas')).toBe(true)
    expect(isCargoConferenceEntryVisible(closedNow, 'pendentes')).toBe(false)
  })

  it('Concluído (em estoque) só entra pela semana: na vigente aparece; fechado de semana anterior some', () => {
    const now = entry(inStock('estoque-hoje', 24), CLOSED)
    const oldClosed = entry(inStock('estoque-antigo', 18), CLOSED)
    const oldOpen = entry(inStock('estoque-antigo-aberto', 18), REPORT)
    expect(now.phase.phase).toBe('concluido')
    expect(isCargoConferenceEntryVisible(now, 'fechadas')).toBe(true)
    expect(isCargoConferenceEntryVisible(oldClosed, 'fechadas')).toBe(false)
    expect(isCargoConferenceEntryVisible(oldClosed, 'pendentes')).toBe(false)
    expect(isCargoConferenceEntryVisible(oldOpen, 'pendentes')).toBe(true)
  })

  it('processo sem relatório (bloqueado): aparece na semana vigente; o de semana anterior não (não há o que conferir)', () => {
    const blockedNow = entry(received('b-hoje', 24), { current: null, conference: null })
    const blockedOld = entry(received('b-antigo', 18), { current: null, conference: null })
    expect(blockedNow.state).toBe('sem')
    expect(isCargoConferenceEntryVisible(blockedNow, 'pendentes')).toBe(true)
    expect(isCargoConferenceEntryVisible(blockedOld, 'pendentes')).toBe(false)
  })

  it('semana anterior ainda carregando ou com erro de leitura entra (some só se virar bloqueado ou fechado)', () => {
    expect(isCargoConferenceEntryVisible(entry(received('c1', 18), undefined), 'pendentes')).toBe(true)
    expect(
      isCargoConferenceEntryVisible(summarizeCargoConferenceEntry(received('c2', 18), undefined, { now: WED, error: true }), 'pendentes')
    ).toBe(true)
  })

  it('arquivado e Atrasado seguem fora, mesmo com chegada na semana', () => {
    expect(isCargoConferenceCandidate(received('arq', 24, { archived: true, autoArchived: true }), WED)).toBe(false)
    const late = { id: 'late', category: 'FCL', archived: false, eta: '2026-11-01', collectionWindows: [] }
    expect(isCargoConferenceCandidate(late, WED)).toBe(false)
  })

  it('semana anterior vem primeiro na lista e as chips e o contador seguem a mesma regra', () => {
    const entries = [
      entry(received('atual-a', 24), REPORT),
      entry(received('atual-b', 26), STARTED),
      entry(received('antiga', 20), REPORT),
      entry(received('antiga-fechada', 20), CLOSED),
      entry(received('atual-fechada', 25), CLOSED),
      entry(received('atual-sem', 25), { current: null, conference: null }),
      entry(received('antiga-sem', 19), { current: null, conference: null }),
    ]
    const pendentes = filterCargoConferenceEntries(entries, { filter: 'pendentes', canSeeName: true, now: WED })
    expect(pendentes.map((item) => item.processId)).toEqual(['antiga', 'atual-a', 'atual-b', 'atual-sem'])
    expect(filterCargoConferenceEntries(entries, { filter: 'fechadas', canSeeName: true, now: WED }).map((item) => item.processId)).toEqual([
      'atual-fechada',
    ])
    expect(countCargoConferenceFilters(entries)).toEqual({ pendentes: 4, fechadas: 1 })
    // O contador do Menu = o que dá para conferir dentro de "Para conferir" (sem os bloqueados).
    expect(countCargoConferencesToDo(entries)).toBe(3)
    expect(countCargoConferencesToDo(entries)).toBe(
      pendentes.filter((item) => item.state === 'nova' || item.state === 'andamento').length
    )
  })
})

describe('virada da semana', () => {
  it('o mesmo processo muda de lugar quando o relógio passa de domingo para segunda', () => {
    const process = received('virada', 29)
    const sunday = at(new Date(2026, 10, 29, 23, 30))
    const before = entry(process, CLOSED, sunday)
    expect(before.week).toBe(CARGO_CONFERENCE_WEEKS.current)
    expect(isCargoConferenceEntryVisible(before, 'fechadas')).toBe(true)

    const monday = at(new Date(2026, 10, 30, 0, 30))
    const after = entry(process, CLOSED, monday)
    expect(after.week).toBe(CARGO_CONFERENCE_WEEKS.previous)
    expect(isCargoConferenceEntryVisible(after, 'fechadas')).toBe(false)
    expect(isCargoConferenceEntryVisible(after, 'pendentes')).toBe(false)

    // Não fechada: na segunda vira pendência de semana anterior (não some).
    const openAfter = entry(process, REPORT, monday)
    expect(openAfter.week).toBe(CARGO_CONFERENCE_WEEKS.previous)
    expect(isCargoConferenceEntryVisible(openAfter, 'pendentes')).toBe(true)
    expect(getCargoConferenceWeekKey(sunday)).not.toBe(getCargoConferenceWeekKey(monday))
  })

  it('a semana seguinte, que estava fora, entra quando chega a segunda', () => {
    const process = received('proxima', 30, { collectionStatus: 'Veículo no CD para descarga' })
    expect(isCargoConferenceCandidate(process, new Date(2026, 10, 29, 12, 0))).toBe(false)
    expect(isCargoConferenceCandidate(process, at(new Date(2026, 10, 30, 12, 0)))).toBe(true)
  })
})

describe('limite de 4 semanas para pendências antigas (S9-G)', () => {
  // Quarta 25/11/2026: semana vigente 23/11 a 29/11; o limite é a segunda 26/10 (4 semanas antes).
  const receivedOn = (id, month, day, extra = {}) => received(id, day, { cargoReceivedAt: iso(2026, month, day, 15, 0), ...extra })

  it('o limite é a segunda-feira de 4 semanas antes da vigente (fuso local)', () => {
    expect(getCargoConferenceWeek(WED).limitKey).toBe('2026-10-26')
    expect(getCargoConferenceWeek(new Date(2026, 10, 23, 0, 1)).limitKey).toBe('2026-10-26')
    expect(getCargoConferenceWeek(new Date(2026, 10, 29, 23, 59)).limitKey).toBe('2026-10-26')
    // Virou a semana: a janela anda 7 dias.
    expect(getCargoConferenceWeek(new Date(2026, 10, 30, 0, 30)).limitKey).toBe('2026-11-02')
  })

  it('fronteira exata: chegada na segunda de 4 semanas atrás entra; no domingo anterior sai', () => {
    expect(classifyCargoConferenceWeek('2026-10-26', WED)).toBe(CARGO_CONFERENCE_WEEKS.previous)
    expect(classifyCargoConferenceWeek('2026-10-25', WED)).toBe(CARGO_CONFERENCE_WEEKS.expired)
    expect(classifyCargoConferenceWeek('2026-11-22', WED)).toBe(CARGO_CONFERENCE_WEEKS.previous)
    expect(classifyCargoConferenceWeek('2026-11-23', WED)).toBe(CARGO_CONFERENCE_WEEKS.current)

    expect(isCargoConferenceCandidate(receivedOn('limite', 9, 26), WED)).toBe(true)
    expect(isCargoConferenceCandidate(receivedOn('fora', 9, 25), WED)).toBe(false)
    expect(isCargoConferenceCandidate(receivedOn('muito-antiga', 8, 1), WED)).toBe(false)
  })

  it('pendência de 3 semanas atrás aparece; a de 5 semanas atrás não (nem aberta, nem bloqueada)', () => {
    const threeWeeks = entry(receivedOn('tres', 10, 3), REPORT)
    const fiveWeeks = entry(receivedOn('cinco', 9, 21), REPORT)
    expect(threeWeeks.week).toBe(CARGO_CONFERENCE_WEEKS.previous)
    expect(fiveWeeks.week).toBe(CARGO_CONFERENCE_WEEKS.expired)
    expect(isCargoConferenceEntryVisible(threeWeeks, 'pendentes')).toBe(true)
    expect(isCargoConferenceEntryVisible(fiveWeeks, 'pendentes')).toBe(false)
    expect(isCargoConferenceEntryVisible(fiveWeeks, 'fechadas')).toBe(false)
  })

  it('contador, chips e lista concordam: o que passou do limite não conta', () => {
    const entries = [
      entry(receivedOn('atual', 10, 24), REPORT),
      entry(receivedOn('limite', 9, 26), STARTED),
      entry(receivedOn('fora', 9, 25), REPORT),
      entry(receivedOn('fora-andamento', 8, 15), STARTED),
    ]
    const pendentes = filterCargoConferenceEntries(entries, { filter: 'pendentes', canSeeName: true, now: WED })
    expect(pendentes.map((item) => item.processId)).toEqual(['limite', 'atual'])
    expect(countCargoConferenceFilters(entries)).toEqual({ pendentes: 2, fechadas: 0 })
    expect(countCargoConferencesToDo(entries)).toBe(2)
  })

  it('virada de semana empurra a janela: a mesma pendência sai quando passa de 4 semanas', () => {
    const process = receivedOn('empurrada', 10, 2)
    const wed = at(new Date(2026, 10, 25, 10, 0))
    expect(isCargoConferenceCandidate(process, wed)).toBe(true)
    // Segunda 30/11: o limite passa a ser 02/11 e a chegada de 02/11 ainda entra.
    expect(isCargoConferenceCandidate(process, at(new Date(2026, 10, 30, 0, 30)))).toBe(true)
    // Segunda 07/12: o limite é 09/11; a de 02/11 sai.
    const nextMonday = at(new Date(2026, 11, 7, 0, 30))
    expect(isCargoConferenceCandidate(process, nextMonday)).toBe(false)
    const out = entry(process, REPORT, nextMonday)
    expect(out.week).toBe(CARGO_CONFERENCE_WEEKS.expired)
    expect(isCargoConferenceEntryVisible(out, 'pendentes')).toBe(false)
    // O domingo 01/11 sai já na segunda 30/11.
    const sunday = receivedOn('domingo', 10, 1)
    expect(isCargoConferenceCandidate(sunday, wed)).toBe(true)
    expect(isCargoConferenceCandidate(sunday, at(new Date(2026, 10, 30, 0, 30)))).toBe(false)
  })
})
