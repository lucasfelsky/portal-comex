// F18a (D7): triggers de documentos do processo.
// Cobre:
//   - rotateProcessDocumentVersions: 3 docs no slot apaga o mais antigo; 2
//     docs nao apaga; slotKey `other:` nunca rotaciona.
//   - deleteProcessDocumentFile: apaga o arquivo quando o storagePath bate
//     com o prefixo do processo; NAO apaga quando o path esta fora dele.
//   - cleanupDeletedProcessData: chama recursiveDelete + deleteFiles com o
//     prefixo do processo; falha do Storage nao impede o recursiveDelete.
//   - planDocumentRotation (funcao pura).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockBatch,
  mockBucket,
  mockFirestoreApi,
  mockStorageFile,
  mocks,
  setupFirestoreChain,
  getHandler,
} from '../setup-triggers.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-admin/storage', () => mocks.firebaseStorage())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const {
  rotateProcessDocumentVersions,
  deleteProcessDocumentFile,
  cleanupDeletedProcessData,
  planDocumentRotation,
} = await import('../../functions/index.js')

const { groupDocumentsBySlot } = await import('../../src/features/processes/processDocuments.js')

const PROCESS_ID = 'proc-1'

afterEach(() => {
  vi.clearAllMocks()
})

describe('planDocumentRotation (pura)', () => {
  it('mantem os 2 mais recentes e remove o resto', () => {
    const docs = [
      { id: 'd1', uploadedAt: '2026-09-01T10:00:00.000Z' },
      { id: 'd2', uploadedAt: '2026-09-02T10:00:00.000Z' },
      { id: 'd3', uploadedAt: '2026-09-03T10:00:00.000Z' },
    ]
    const { keep, remove } = planDocumentRotation(docs)
    expect(keep).toEqual(['d3', 'd2'])
    expect(remove).toEqual(['d1'])
  })

  it('com 2 docs nao remove nada', () => {
    const docs = [
      { id: 'd1', uploadedAt: '2026-09-01T10:00:00.000Z' },
      { id: 'd2', uploadedAt: '2026-09-02T10:00:00.000Z' },
    ]
    const { remove } = planDocumentRotation(docs)
    expect(remove).toEqual([])
  })

  it('lista vazia -> keep/remove vazios', () => {
    expect(planDocumentRotation([])).toEqual({ keep: [], remove: [] })
  })
})

describe('rotateProcessDocumentVersions', () => {
  beforeEach(() => {
    mockFirestoreApi.batch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)
  })

  function makeEvent(created, { documentId = 'new-doc', processId = PROCESS_ID } = {}) {
    return {
      params: { processId, documentId },
      data: { data: () => created },
    }
  }

  it('3 documentos no mesmo slot apaga o mais antigo (batch.delete + commit)', async () => {
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {} }],
      'processes/proc-1/documents': [
        { id: 'd1', data: { slotKey: 'bl', uploadedAt: '2026-09-01T10:00:00.000Z' } },
        { id: 'd2', data: { slotKey: 'bl', uploadedAt: '2026-09-02T10:00:00.000Z' } },
        { id: 'new-doc', data: { slotKey: 'bl', uploadedAt: '2026-09-03T10:00:00.000Z' } },
      ],
    })
    const handler = getHandler(rotateProcessDocumentVersions)

    await handler(makeEvent({ slotKey: 'bl', uploadedAt: '2026-09-03T10:00:00.000Z' }))

    expect(mockBatch.delete).toHaveBeenCalledTimes(1)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
  })

  it('2 documentos no slot nao apaga nada (sem commit)', async () => {
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {} }],
      'processes/proc-1/documents': [
        { id: 'd1', data: { slotKey: 'bl', uploadedAt: '2026-09-01T10:00:00.000Z' } },
        { id: 'new-doc', data: { slotKey: 'bl', uploadedAt: '2026-09-02T10:00:00.000Z' } },
      ],
    })
    const handler = getHandler(rotateProcessDocumentVersions)

    await handler(makeEvent({ slotKey: 'bl', uploadedAt: '2026-09-02T10:00:00.000Z' }))

    expect(mockBatch.delete).not.toHaveBeenCalled()
    expect(mockBatch.commit).not.toHaveBeenCalled()
  })

  it('slotKey "other:xxx" nunca rotaciona', async () => {
    setupFirestoreChain({ processes: [{ id: PROCESS_ID, data: {} }], 'processes/proc-1/documents': [] })
    const handler = getHandler(rotateProcessDocumentVersions)

    await handler(makeEvent({ slotKey: 'other:new-doc', uploadedAt: '2026-09-01T10:00:00.000Z' }))

    expect(mockFirestoreApi.batch).not.toHaveBeenCalled()
  })

  it('sem dado criado (delete concorrente) -> nada', async () => {
    const handler = getHandler(rotateProcessDocumentVersions)
    await handler({ params: { processId: PROCESS_ID, documentId: 'x' }, data: { data: () => undefined } })
    expect(mockFirestoreApi.batch).not.toHaveBeenCalled()
  })
})

describe('deleteProcessDocumentFile', () => {
  function makeEvent(deleted, { processId = PROCESS_ID, documentId = 'doc-1' } = {}) {
    return {
      params: { processId, documentId },
      data: { data: () => deleted },
    }
  }

  it('storagePath dentro do prefixo do processo -> apaga o arquivo', async () => {
    const handler = getHandler(deleteProcessDocumentFile)
    await handler(makeEvent({ storagePath: 'processes/proc-1/documents/bl/123-uid-a.pdf' }))

    expect(mockBucket.file).toHaveBeenCalledWith('processes/proc-1/documents/bl/123-uid-a.pdf')
    expect(mockStorageFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  it('storagePath FORA do prefixo do processo -> NAO apaga', async () => {
    const handler = getHandler(deleteProcessDocumentFile)
    await handler(makeEvent({ storagePath: 'processes/outro-proc/documents/bl/123-uid-a.pdf' }))

    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('sem storagePath -> NAO apaga', async () => {
    const handler = getHandler(deleteProcessDocumentFile)
    await handler(makeEvent({}))
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('falha do Storage e logada, nao relancada', async () => {
    mockStorageFile.delete.mockRejectedValueOnce(new Error('boom'))
    const handler = getHandler(deleteProcessDocumentFile)
    await expect(
      handler(makeEvent({ storagePath: 'processes/proc-1/documents/bl/123-uid-a.pdf' }))
    ).resolves.toBeUndefined()
  })
})

describe('cleanupDeletedProcessData', () => {
  beforeEach(() => {
    setupFirestoreChain({ processes: [{ id: PROCESS_ID, data: {} }] })
  })

  it('chama recursiveDelete + deleteFiles com o prefixo do processo', async () => {
    const handler = getHandler(cleanupDeletedProcessData)
    await handler({ params: { processId: PROCESS_ID } })

    expect(mockFirestoreApi.recursiveDelete).toHaveBeenCalledTimes(1)
    expect(mockBucket.deleteFiles).toHaveBeenCalledWith({ prefix: 'processes/proc-1/' })
  })

  it('falha do Storage NAO impede o recursiveDelete', async () => {
    mockBucket.deleteFiles.mockRejectedValueOnce(new Error('boom'))
    const handler = getHandler(cleanupDeletedProcessData)
    await expect(handler({ params: { processId: PROCESS_ID } })).resolves.toBeUndefined()
    expect(mockFirestoreApi.recursiveDelete).toHaveBeenCalledTimes(1)
  })

  it('falha do recursiveDelete NAO impede a tentativa de deleteFiles', async () => {
    mockFirestoreApi.recursiveDelete.mockRejectedValueOnce(new Error('boom'))
    const handler = getHandler(cleanupDeletedProcessData)
    await expect(handler({ params: { processId: PROCESS_ID } })).resolves.toBeUndefined()
    expect(mockBucket.deleteFiles).toHaveBeenCalledTimes(1)
  })
})

// Paridade src x functions (D7): a ordenacao de versionamento (mais novo
// primeiro, desempate por id) e' a MESMA regra usada por
// `groupDocumentsBySlot` (leitura/UI, `src/`) e `planDocumentRotation`
// (trigger, `functions/`).
describe('paridade groupDocumentsBySlot x planDocumentRotation', () => {
  it('mesma ordem de manter/remover para o mesmo conjunto', () => {
    const docs = [
      { id: 'd1', slotKey: 'bl', uploadedAt: '2026-09-01T10:00:00.000Z' },
      { id: 'd2', slotKey: 'bl', uploadedAt: '2026-09-03T10:00:00.000Z' },
      { id: 'd3', slotKey: 'bl', uploadedAt: '2026-09-02T10:00:00.000Z' },
    ]
    const [group] = groupDocumentsBySlot(docs)
    const { keep } = planDocumentRotation(docs)

    expect(keep).toEqual([group.primary.id, group.previous.id])
  })
})
