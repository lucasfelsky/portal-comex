// S9-F do Relatório de Carga: carga da lista e do contador (cache de módulo). Repositórios mockados; relógio real
// (o cache de 2 min é conferido avançando só `Date`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListProcesses = vi.fn()
const mockGetCargoReport = vi.fn()

vi.mock('../../src/services/processesRepository', () => ({
  listProcesses: (...args) => mockListProcesses(...args),
}))
vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
}))

import {
  CARGO_CONFERENCE_CACHE_TTL_MS,
  CARGO_CONFERENCE_CONCURRENCY,
  invalidateCargoConference,
  loadCargoConferenceEntries,
  resetCargoConferenceCache,
  subscribeCargoConferenceChanges,
} from '../../src/features/processes/useCargoConferenceList'

const NOW = new Date(2026, 10, 25, 10, 0)

const candidate = (id) => ({
  id,
  name: `PROC ${id}`,
  category: 'FCL',
  archived: false,
  collectionStatus: 'Carga a caminho do CD',
})
const notCandidate = (id) => ({ id, name: `PROC ${id}`, category: 'FCL', archived: false, processStatus: 'Embarcou' })

const REPORT = {
  current: { status: 'concluido', revision: 1, rows: [{ id: 'r-1', dbcorpCode: 'A1' }] },
  conference: null,
}

function bigList(candidates = 60, others = 240) {
  return [
    ...Array.from({ length: candidates }, (_, index) => candidate(`c${index}`)),
    ...Array.from({ length: others }, (_, index) => notCandidate(`o${index}`)),
  ]
}

beforeEach(() => {
  resetCargoConferenceCache()
  mockListProcesses.mockReset()
  mockGetCargoReport.mockReset()
  mockGetCargoReport.mockResolvedValue(REPORT)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('muitos processos', () => {
  it('300 processos, 60 candidatos: 1 listProcesses e exatamente 60 leituras, nunca mais de 4 ao mesmo tempo', async () => {
    mockListProcesses.mockResolvedValue(bigList())
    let running = 0
    let peak = 0
    mockGetCargoReport.mockImplementation(async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running -= 1
      return REPORT
    })

    const result = await loadCargoConferenceEntries({ now: NOW })

    expect(mockListProcesses).toHaveBeenCalledTimes(1)
    expect(mockGetCargoReport).toHaveBeenCalledTimes(60)
    expect(new Set(mockGetCargoReport.mock.calls.map(([id]) => id)).size).toBe(60)
    expect(peak).toBeLessThanOrEqual(CARGO_CONFERENCE_CONCURRENCY)
    expect(peak).toBeGreaterThan(1)
    expect(result.processes).toHaveLength(300)
    expect(result.entries).toHaveLength(60)
    expect(result.entries.every((entry) => entry.state === 'nova')).toBe(true)
    expect(result.todo).toBe(60)
  })

  it('só os candidatos são lidos (nenhum relatório de processo fora da lista)', async () => {
    mockListProcesses.mockResolvedValue(bigList(3, 10))
    await loadCargoConferenceEntries({ now: NOW })
    expect(mockGetCargoReport.mock.calls.map(([id]) => id).sort()).toEqual(['c0', 'c1', 'c2'])
  })
})

describe('cache de 2 minutos', () => {
  it('a 2ª chamada dentro de 2 min não lê nada; depois do TTL relê tudo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    mockListProcesses.mockResolvedValue(bigList(5, 5))
    await loadCargoConferenceEntries({ now: NOW })
    expect(mockGetCargoReport).toHaveBeenCalledTimes(5)

    vi.setSystemTime(new Date(NOW.getTime() + CARGO_CONFERENCE_CACHE_TTL_MS - 1000))
    await loadCargoConferenceEntries({ now: NOW })
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
    expect(mockGetCargoReport).toHaveBeenCalledTimes(5)

    vi.setSystemTime(new Date(NOW.getTime() + CARGO_CONFERENCE_CACHE_TTL_MS + 1000))
    await loadCargoConferenceEntries({ now: NOW })
    expect(mockListProcesses).toHaveBeenCalledTimes(2)
    expect(mockGetCargoReport).toHaveBeenCalledTimes(10)
  })

  it('`force` relê a lista e todos os relatórios', async () => {
    mockListProcesses.mockResolvedValue(bigList(4, 0))
    await loadCargoConferenceEntries({ now: NOW })
    await loadCargoConferenceEntries({ now: NOW, force: true })
    expect(mockListProcesses).toHaveBeenCalledTimes(2)
    expect(mockGetCargoReport).toHaveBeenCalledTimes(8)
  })

  it('invalidar um processo relê só aquele', async () => {
    mockListProcesses.mockResolvedValue(bigList(4, 0))
    await loadCargoConferenceEntries({ now: NOW })
    mockGetCargoReport.mockClear()
    invalidateCargoConference('c2')
    await loadCargoConferenceEntries({ now: NOW })
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
    expect(mockGetCargoReport.mock.calls).toEqual([['c2']])
  })

  it('invalidar avisa quem assinou (o contador do Menu) com o id do processo', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCargoConferenceChanges(listener)
    invalidateCargoConference('c1')
    expect(listener).toHaveBeenCalledWith('c1')
    unsubscribe()
    invalidateCargoConference('c1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('invalidar durante a leitura lê de novo (o resultado velho não vence)', async () => {
    mockListProcesses.mockResolvedValue([candidate('c1')])
    let release
    mockGetCargoReport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ current: { ...REPORT.current, rows: [] }, conference: null })
        })
    )
    const loading = loadCargoConferenceEntries({ now: NOW })
    await vi.waitFor(() => expect(mockGetCargoReport).toHaveBeenCalledTimes(1))
    invalidateCargoConference('c1')
    release()
    const result = await loading
    expect(mockGetCargoReport).toHaveBeenCalledTimes(2)
    expect(result.entries[0]).toMatchObject({ processId: 'c1', total: 1, state: 'nova' })
  })
})

describe('carga compartilhada', () => {
  it('contador e lista na mesma montagem fazem 1 carga só', async () => {
    mockListProcesses.mockResolvedValue(bigList(6, 0))
    const [first, second] = await Promise.all([
      loadCargoConferenceEntries({ now: NOW }),
      loadCargoConferenceEntries({ now: NOW }),
    ])
    expect(first).toBe(second)
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
    expect(mockGetCargoReport).toHaveBeenCalledTimes(6)
  })

  it('quem entra depois também recebe o progresso', async () => {
    mockListProcesses.mockResolvedValue(bigList(5, 0))
    const early = vi.fn()
    const late = vi.fn()
    const first = loadCargoConferenceEntries({ now: NOW, onProgress: early })
    const second = loadCargoConferenceEntries({ now: NOW, onProgress: late })
    await Promise.all([first, second])
    expect(early.mock.calls.length).toBeGreaterThan(1)
    expect(late).toHaveBeenCalled()
  })
})

describe('falhas e progresso', () => {
  it('falha em 1 processo vira cartão de erro e o resto segue', async () => {
    mockListProcesses.mockResolvedValue(bigList(3, 0))
    mockGetCargoReport.mockImplementation(async (id) => {
      if (id === 'c1') throw Object.assign(new Error('x'), { code: 'unavailable' })
      return REPORT
    })
    const result = await loadCargoConferenceEntries({ now: NOW })
    const byId = Object.fromEntries(result.entries.map((entry) => [entry.processId, entry.state]))
    expect(byId).toEqual({ c0: 'nova', c1: 'erro', c2: 'nova' })
    expect(result.todo).toBe(2)
  })

  it('falha ao listar os processos rejeita e a próxima tentativa lê de novo', async () => {
    mockListProcesses.mockRejectedValueOnce(new Error('rede'))
    await expect(loadCargoConferenceEntries({ now: NOW })).rejects.toThrow('rede')
    mockListProcesses.mockResolvedValue([candidate('c1')])
    const result = await loadCargoConferenceEntries({ now: NOW })
    expect(result.entries).toHaveLength(1)
  })

  it('onProgress: primeiro os cartões "carregando" e, a cada relatório, o cartão completo', async () => {
    mockListProcesses.mockResolvedValue(bigList(3, 2))
    const snapshots = []
    await loadCargoConferenceEntries({ now: NOW, onProgress: (entries) => snapshots.push(entries.map((entry) => entry.state)) })
    expect(snapshots[0]).toEqual(['carregando', 'carregando', 'carregando'])
    expect(snapshots.at(-1)).toEqual(['nova', 'nova', 'nova'])
    expect(snapshots.length).toBe(4)
    const loadedCounts = snapshots.map((states) => states.filter((state) => state === 'nova').length)
    expect(loadedCounts).toEqual([0, 1, 2, 3])
  })

  it('relatório inexistente (sem `current`) vira "sem" e não entra no contador', async () => {
    mockListProcesses.mockResolvedValue(bigList(2, 0))
    mockGetCargoReport.mockImplementation(async (id) => (id === 'c0' ? { current: null, conference: null } : REPORT))
    const result = await loadCargoConferenceEntries({ now: NOW })
    expect(result.entries.map((entry) => entry.state)).toEqual(['sem', 'nova'])
    expect(result.todo).toBe(1)
  })
})
