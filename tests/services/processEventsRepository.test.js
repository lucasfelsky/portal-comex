// F17.1b: cobertura de listProcessEvents (leitura server-only da subcolecao
// processes/{id}/events). Mesmo padrao de mock de
// tests/services/processesRepository.test.js.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCollection, mockQuery, mockOrderBy, mockLimit, mockWhere, mockGetDocs } = vi.hoisted(() => ({
  mockCollection: vi.fn(),
  mockQuery: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockGetDocs: vi.fn(),
}))

let firebaseConfigured = true

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseConfigured
  },
  firestore: {},
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  limit: (...args) => mockLimit(...args),
  where: (...args) => mockWhere(...args),
  getDocs: (...args) => mockGetDocs(...args),
}))

import {
  listProcessEvents,
  listLeadTimeProcesses,
  listLeadTimeEvents,
  loadLeadTimeDataset,
} from '../../src/services/processEventsRepository'
import { LEAD_TIME_EVENT_TYPES } from '../../src/features/admin/leadTimeStats'

beforeEach(() => {
  vi.clearAllMocks()
  firebaseConfigured = true
  mockCollection.mockReturnValue('COLLECTION_REF')
  mockOrderBy.mockReturnValue('ORDER_BY')
  mockLimit.mockReturnValue('LIMIT')
  mockWhere.mockReturnValue('WHERE')
  mockQuery.mockReturnValue('QUERY_REF')
})

describe('listProcessEvents', () => {
  it('sem processId -> []', async () => {
    expect(await listProcessEvents('')).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('nao configurado -> []', async () => {
    firebaseConfigured = false
    expect(await listProcessEvents('p1')).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('monta path/query corretos', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] })
    await listProcessEvents('p1')
    expect(mockCollection).toHaveBeenCalledWith({}, 'processes', 'p1', 'events')
    expect(mockOrderBy).toHaveBeenCalledWith('recordedAt', 'desc')
    expect(mockLimit).toHaveBeenCalledWith(100)
    expect(mockQuery).toHaveBeenCalledWith('COLLECTION_REF', 'ORDER_BY', 'LIMIT')
  })

  it('converte Timestamp (recordedAt/occurredAt) para ISO', async () => {
    const toDate = () => new Date('2026-09-20T10:00:00.000Z')
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'e1',
          data: () => ({
            type: 'berthed',
            occurredAt: '2026-09-20T10:00:00.000Z',
            recordedAt: { toDate },
          }),
        },
      ],
    })
    const result = await listProcessEvents('p1')
    expect(result[0].recordedAt).toBe('2026-09-20T10:00:00.000Z')
  })

  it('reordena por occurredAt desc', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'e1', data: () => ({ type: 'a', occurredAt: '2026-09-20T10:00:00.000Z', recordedAt: '2026-09-20T10:00:00.000Z' }) },
        { id: 'e2', data: () => ({ type: 'b', occurredAt: '2026-09-21T10:00:00.000Z', recordedAt: '2026-09-21T10:00:00.000Z' }) },
      ],
    })
    const result = await listProcessEvents('p1')
    expect(result.map((event) => event.id)).toEqual(['e2', 'e1'])
  })

  it('actorName com mojibake e reparado', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'e1', data: () => ({ type: 'berthed', actorName: 'JoÃ£o', occurredAt: '2026-09-20T10:00:00.000Z' }) },
      ],
    })
    const result = await listProcessEvents('p1')
    expect(result[0].actorName).toBe('João')
  })
})

// F17.6: leitura server-only p/ o painel de lead time.
describe('listLeadTimeProcesses', () => {
  it('nao configurado -> []', async () => {
    firebaseConfigured = false
    expect(await listLeadTimeProcesses()).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('mapeia archived/destination upper', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'p1',
          data: () => ({ category: 'FCL', destination: ' navegantes - sc ', archived: true }),
        },
        {
          id: 'p2',
          data: () => ({ category: 'LCL', destination: 'itapoa' }),
        },
      ],
    })
    const result = await listLeadTimeProcesses()
    expect(result).toEqual([
      { id: 'p1', category: 'FCL', destination: 'NAVEGANTES - SC', archived: true },
      { id: 'p2', category: 'LCL', destination: 'ITAPOA', archived: false },
    ])
  })
})

describe('listLeadTimeEvents', () => {
  it('sem processId -> []', async () => {
    expect(await listLeadTimeEvents('')).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('nao configurado -> []', async () => {
    firebaseConfigured = false
    expect(await listLeadTimeEvents('p1')).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('chama where(type,in,LEAD_TIME_EVENT_TYPES) e NAO chama orderBy', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] })
    await listLeadTimeEvents('p1')
    expect(mockWhere).toHaveBeenCalledWith('type', 'in', LEAD_TIME_EVENT_TYPES)
    expect(mockOrderBy).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledWith('COLLECTION_REF', 'WHERE')
  })
})

describe('loadLeadTimeDataset', () => {
  it('pula arquivado e categoria invalida (nao consulta eventos deles)', async () => {
    mockGetDocs.mockImplementation((queryOrRef) => {
      if (queryOrRef === 'COLLECTION_REF') {
        return Promise.resolve({
          docs: [
            { id: 'p1', data: () => ({ category: 'FCL', destination: 'ITAPOA', archived: false }) },
            { id: 'p2', data: () => ({ category: 'FCL', destination: 'ITAPOA', archived: true }) },
            { id: 'p3', data: () => ({ category: 'OUTRA', destination: 'ITAPOA', archived: false }) },
          ],
        })
      }
      return Promise.resolve({ docs: [] })
    })

    const { processes, eventsByProcessId } = await loadLeadTimeDataset()

    expect(processes.map((process) => process.id)).toEqual(['p1'])
    expect(Object.keys(eventsByProcessId)).toEqual(['p1'])
  })
})
