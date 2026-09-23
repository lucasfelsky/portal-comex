// F17.1b: cobertura de listProcessEvents (leitura server-only da subcolecao
// processes/{id}/events). Mesmo padrao de mock de
// tests/services/processesRepository.test.js.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCollection, mockQuery, mockOrderBy, mockLimit, mockGetDocs } = vi.hoisted(() => ({
  mockCollection: vi.fn(),
  mockQuery: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
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
  getDocs: (...args) => mockGetDocs(...args),
}))

import { listProcessEvents } from '../../src/services/processEventsRepository'

beforeEach(() => {
  vi.clearAllMocks()
  firebaseConfigured = true
  mockCollection.mockReturnValue('COLLECTION_REF')
  mockOrderBy.mockReturnValue('ORDER_BY')
  mockLimit.mockReturnValue('LIMIT')
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
