// Testes do trigger recordProcessMilestoneEvents (F17.1b).
// Cobre:
//   - admin marca berthed -> grava berthed + statusChanged, batch.commit 1x
//   - logistica leva a Carga recebida -> received + statusChanged
//   - sem updatedById (migracao) -> nenhum set/commit
//   - before/after ausente -> nada
//   - mudanca cosmetica -> nenhum commit
//   - mesmo event processado 2x -> mesmos ids (idempotencia)
//   - updatedByName com mojibake -> actorName reparado

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockBatch,
  mockFirestoreApi,
  mocks,
  setupFirestoreChain,
  getHandler,
} from '../setup-triggers.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { recordProcessMilestoneEvents } = await import('../../functions/index.js')

const PROCESS_ID = 'proc-1'

let handler

beforeEach(() => {
  vi.clearAllMocks()
  setupFirestoreChain({ processes: [{ id: PROCESS_ID, data: {} }] })
  handler = getHandler(recordProcessMilestoneEvents)
  mockFirestoreApi.batch.mockReturnValue(mockBatch)
  mockBatch.commit.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

function makeEvent(before, after, { processId = PROCESS_ID, id = 'evt-1', time } = {}) {
  return {
    id,
    time,
    params: { processId },
    data: { before: { data: () => before }, after: { data: () => after } },
  }
}

const PROCESS_BASE = {
  category: 'FCL',
  processStatus: 'Aguardando atracação',
  berthed: false,
}

describe('recordProcessMilestoneEvents', () => {
  it('admin marca berthed -> grava berthed + statusChanged, ids deterministicos, commit 1x', async () => {
    const before = { ...PROCESS_BASE }
    const after = {
      ...PROCESS_BASE,
      berthed: true,
      processStatus: 'Atracação Confirmada',
      updatedById: 'admin-1',
      updatedByName: 'Admin Um',
    }
    await handler(makeEvent(before, after, { id: 'evt-1' }))

    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    const calls = mockBatch.set.mock.calls
    const ids = calls.map(([ref]) => ref.id)
    expect(ids).toContain('evt-1_berthed')
    expect(ids).toContain('evt-1_statusChanged')

    for (const [, data] of calls) {
      expect(data.recordedAt).toBe('SERVER_TIMESTAMP')
      expect(data.actorId).toBe('admin-1')
      expect(data.actorName).toBe('Admin Um')
      expect(data.processId).toBe(PROCESS_ID)
    }
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
  })

  it('logistica leva a Veículo no CD para descarga + Carga recebida -> received + statusChanged', async () => {
    const before = { ...PROCESS_BASE, processStatus: 'Coleta Agendada', collectionStatus: 'Coleta Agendada' }
    const after = {
      ...PROCESS_BASE,
      processStatus: 'Carga recebida',
      collectionStatus: 'Veículo no CD para descarga',
      cargoReceivedAt: '2026-09-21T09:00:00.000Z',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    const types = mockBatch.set.mock.calls.map(([, data]) => data.type)
    expect(types).toContain('received')
    expect(types).toContain('statusChanged')
    expect(mockBatch.set.mock.calls.every(([, data]) => data.actorName === 'Logi da Silva')).toBe(true)
  })

  it('sem updatedById (caso migracao) -> nenhum set/commit', async () => {
    const before = { ...PROCESS_BASE }
    const after = { ...PROCESS_BASE, berthed: true, updatedById: '' }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
    expect(mockBatch.commit).not.toHaveBeenCalled()
  })

  it('before ausente -> nada', async () => {
    await handler(
      makeEvent(undefined, { ...PROCESS_BASE, updatedById: 'admin-1', updatedByName: 'Admin' })
    )
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('after ausente -> nada', async () => {
    await handler(makeEvent({ ...PROCESS_BASE }, undefined))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('mudanca cosmetica -> nenhum commit', async () => {
    const before = { ...PROCESS_BASE, processNotes: 'a' }
    const after = { ...PROCESS_BASE, processNotes: 'b', updatedById: 'admin-1', updatedByName: 'Admin' }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
    expect(mockBatch.commit).not.toHaveBeenCalled()
  })

  it('mesmo event processado 2x -> mesmos ids nas duas chamadas (idempotencia)', async () => {
    const before = { ...PROCESS_BASE }
    const after = {
      ...PROCESS_BASE,
      berthed: true,
      updatedById: 'admin-1',
      updatedByName: 'Admin',
    }
    const event = makeEvent(before, after, { id: 'evt-retry' })
    await handler(event)
    const firstIds = mockBatch.set.mock.calls.map(([ref]) => ref.id)
    vi.clearAllMocks()
    mockFirestoreApi.batch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)
    await handler(event)
    const secondIds = mockBatch.set.mock.calls.map(([ref]) => ref.id)
    expect(secondIds).toEqual(firstIds)
  })

  it('updatedByName com mojibake -> actorName reparado', async () => {
    const before = { ...PROCESS_BASE }
    const after = {
      ...PROCESS_BASE,
      berthed: true,
      updatedById: 'admin-1',
      updatedByName: 'JoÃ£o',
    }
    await handler(makeEvent(before, after))
    const [, data] = mockBatch.set.mock.calls[0]
    expect(data.actorName).toBe('João')
  })
})
