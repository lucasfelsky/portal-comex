// F18a (D7): triggers de documentos do processo.
// Cobre:
//   - rotateProcessDocumentVersions: 3 docs no slot apaga o mais antigo; 2
//     docs nao apaga; slotKey `other:` nunca rotaciona.
//   - deleteProcessDocumentFile: apaga o arquivo quando o storagePath bate
//     com o prefixo do processo; NAO apaga quando o path esta fora dele.
//   - cleanupDeletedProcessData: chama recursiveDelete + deleteFiles com o
//     prefixo do processo; falha do Storage nao impede o recursiveDelete.
//   - planDocumentRotation (funcao pura).
//   - notifyCargoReportUploaded: aviso do Relatorio de Carga (in-app + e-mail).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockBatch,
  mockBucket,
  mockFirestoreApi,
  mockStorageFile,
  mockLogger,
  mocks,
  mockSendMail,
  resetSecrets,
  setSecretValue,
  setupFirestoreChain,
  setupMailer,
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
  syncProcessDocumentIndex,
  recordProcessDocumentEvents,
  notifyCargoReportUploaded,
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

// F18b-1 (B1): `syncProcessDocumentIndex`.
describe('syncProcessDocumentIndex', () => {
  function makeEvent({ processId = PROCESS_ID } = {}) {
    return { params: { processId } }
  }

  it('recalcula o index a partir da subcolecao inteira e escreve SO documentIndex', async () => {
    const { collectionRefs } = setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {} }],
      'processes/proc-1/documents': [
        { id: 'd1', data: { type: 'fispq', itemId: 'ITEM-1' } },
        { id: 'd2', data: { type: 'containerWash', containerId: 'CNT-1' } },
        { id: 'd3', data: { type: 'bl', slotKey: 'bl' } },
      ],
    })
    const handler = getHandler(syncProcessDocumentIndex)
    const processRef = collectionRefs.get('processes').doc(PROCESS_ID)

    await handler(makeEvent())

    expect(processRef.update).toHaveBeenCalledTimes(1)
    expect(processRef.update).toHaveBeenCalledWith({
      documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: ['CNT-1'], processSlotKeys: ['bl'] },
    })
  })

  it('Invoice atual com alsoPackingList: true -> processSlotKeys inclui invoice e packingList', async () => {
    const { collectionRefs } = setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {} }],
      'processes/proc-1/documents': [
        { id: 'd1', data: { type: 'invoice', slotKey: 'invoice', alsoPackingList: true, uploadedAt: '2026-09-02T10:00:00.000Z' } },
        { id: 'd0', data: { type: 'invoice', slotKey: 'invoice', uploadedAt: '2026-09-01T10:00:00.000Z' } },
      ],
    })
    const handler = getHandler(syncProcessDocumentIndex)
    const processRef = collectionRefs.get('processes').doc(PROCESS_ID)

    await handler(makeEvent())

    expect(processRef.update).toHaveBeenCalledWith({
      documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: ['invoice', 'packingList'] },
    })
  })

  it('so a Invoice ANTERIOR com flag -> packingList fora do index', async () => {
    const { collectionRefs } = setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {} }],
      'processes/proc-1/documents': [
        { id: 'd0', data: { type: 'invoice', slotKey: 'invoice', alsoPackingList: true, uploadedAt: '2026-09-01T10:00:00.000Z' } },
        { id: 'd1', data: { type: 'invoice', slotKey: 'invoice', uploadedAt: '2026-09-02T10:00:00.000Z' } },
      ],
    })
    const handler = getHandler(syncProcessDocumentIndex)
    const processRef = collectionRefs.get('processes').doc(PROCESS_ID)

    await handler(makeEvent())

    expect(processRef.update).toHaveBeenCalledWith({
      documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: ['invoice'] },
    })
  })

  it('index igual ao atual -> nao escreve (sem write inutil)', async () => {
    const { collectionRefs } = setupFirestoreChain({
      processes: [
        {
          id: PROCESS_ID,
          data: { documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [], processSlotKeys: [] } },
        },
      ],
      'processes/proc-1/documents': [{ id: 'd1', data: { type: 'fispq', itemId: 'ITEM-1' } }],
    })
    const handler = getHandler(syncProcessDocumentIndex)
    const processRef = collectionRefs.get('processes').doc(PROCESS_ID)

    await handler(makeEvent())

    expect(processRef.update).not.toHaveBeenCalled()
  })

  it('index legado (sem processSlotKeys) com subcolecao equivalente -> ESCREVE com processSlotKeys', async () => {
    const { collectionRefs } = setupFirestoreChain({
      processes: [
        { id: PROCESS_ID, data: { documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [] } } },
      ],
      'processes/proc-1/documents': [{ id: 'd1', data: { type: 'fispq', itemId: 'ITEM-1' } }],
    })
    const handler = getHandler(syncProcessDocumentIndex)
    const processRef = collectionRefs.get('processes').doc(PROCESS_ID)

    await handler(makeEvent())

    expect(processRef.update).toHaveBeenCalledWith({
      documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [], processSlotKeys: [] },
    })
  })

  it('delete: subcolecao ja sem o documento apagado -> index recalculado fica vazio', async () => {
    const { collectionRefs } = setupFirestoreChain({
      processes: [
        { id: PROCESS_ID, data: { documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [] } } },
      ],
      'processes/proc-1/documents': [],
    })
    const handler = getHandler(syncProcessDocumentIndex)
    const processRef = collectionRefs.get('processes').doc(PROCESS_ID)

    await handler(makeEvent())

    expect(processRef.update).toHaveBeenCalledWith({
      documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] },
    })
  })

  it('processo inexistente (cascata de cleanupDeletedProcessData) -> nao escreve', async () => {
    const { collectionRefs } = setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {}, exists: false }],
    })
    const handler = getHandler(syncProcessDocumentIndex)
    const processRef = collectionRefs.get('processes').doc(PROCESS_ID)

    await handler(makeEvent())

    expect(processRef.update).not.toHaveBeenCalled()
  })
})

// F18b-1 (B3/B4): `recordProcessDocumentEvents` - marcos + aviso da logistica.
describe('recordProcessDocumentEvents', () => {
  const ADMIN_1 = { id: 'admin-1', name: 'Admin Um', email: 'admin1@sqquimica.com', role: 'admin', status: 'Ativo' }
  const ADMIN_2 = { id: 'admin-2', name: 'Admin Dois', email: 'admin2@sqquimica.com', role: 'admin', status: 'Ativo' }

  function makeEvent(created, { processId = PROCESS_ID, documentId = 'doc-1', id = 'evt-1', time } = {}) {
    return {
      id,
      time,
      params: { processId, documentId },
      data: { data: () => created },
    }
  }

  beforeEach(() => {
    mockFirestoreApi.batch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)
  })

  it('bl enviado por admin -> grava marco blUploaded, SEM aviso (ator e admin)', async () => {
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {} }],
      users: [ADMIN_1, ADMIN_2].map((user) => ({ id: user.id, data: user })),
    })
    const handler = getHandler(recordProcessDocumentEvents)

    await handler(
      makeEvent({
        type: 'bl',
        uploadedById: 'admin-1',
        uploadedByName: 'Admin Um',
        uploadedByRole: 'admin',
        uploadedAt: '2026-09-20T10:00:00.000Z',
      })
    )

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [[ref, data]] = mockBatch.set.mock.calls
    expect(ref.id).toBe('evt-1_blUploaded')
    expect(data.type).toBe('blUploaded')
    expect(data.value).toBe('')
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
  })

  it('fispq com itemId -> marco fispqUploaded com o nome comercial do item', async () => {
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: { items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas' }] } }],
      users: [ADMIN_1].map((user) => ({ id: user.id, data: user })),
    })
    const handler = getHandler(recordProcessDocumentEvents)

    await handler(
      makeEvent({
        type: 'fispq',
        itemId: 'ITEM-1',
        uploadedById: 'admin-1',
        uploadedByName: 'Admin Um',
        uploadedByRole: 'admin',
        uploadedAt: '2026-09-20T10:00:00.000Z',
      })
    )

    const [, data] = mockBatch.set.mock.calls[0]
    expect(data.type).toBe('fispqUploaded')
    expect(data.value).toBe('Resina Atlas')
  })

  it('containerWash enviado por LOGISTICA -> marco containerWashUploaded + aviso a admins ativos (nao ao ator)', async () => {
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: { containers: [{ id: 'CNT-1', number: 'MSCU1234567' }] } }],
      users: [
        { id: ADMIN_1.id, data: ADMIN_1 },
        { id: ADMIN_2.id, data: ADMIN_2 },
        { id: 'logi-1', data: { id: 'logi-1', role: 'logistica', status: 'Ativo', email: 'logi@sqquimica.com' } },
      ],
    })
    const handler = getHandler(recordProcessDocumentEvents)

    await handler(
      makeEvent({
        type: 'containerWash',
        containerId: 'CNT-1',
        uploadedById: 'logi-1',
        uploadedByName: 'Logi da Silva',
        uploadedByRole: 'logistica',
        uploadedAt: '2026-09-20T10:00:00.000Z',
      })
    )

    const eventSetCalls = mockBatch.set.mock.calls.filter(([, data]) => data?.type === 'containerWashUploaded')
    expect(eventSetCalls).toHaveLength(1)
    expect(eventSetCalls[0][1].value).toBe('MSCU1234567')

    const notificationSetCalls = mockBatch.set.mock.calls.filter(
      ([, data]) => data?.type === 'process_document_uploaded'
    )
    expect(notificationSetCalls).toHaveLength(2)
    const recipients = notificationSetCalls.map(([, data]) => data.recipientUserId).sort()
    expect(recipients).toEqual(['admin-1', 'admin-2'])
    for (const [, data] of notificationSetCalls) {
      expect(data.targetTab).toBe('documents')
      expect(data.actorUserId).toBe('logi-1')
      expect(data.body).toContain('Logi da Silva')
      expect(data.body).toContain('Relatório de lavação')
      expect(data.body).toContain('MSCU1234567')
    }
  })

  it('invoice/other/cargoReport nao geram marco', async () => {
    for (const type of ['invoice', 'other', 'cargoReport']) {
      setupFirestoreChain({ processes: [{ id: PROCESS_ID, data: {} }], users: [] })
      const handler = getHandler(recordProcessDocumentEvents)
      await handler(
        makeEvent({
          type,
          uploadedById: 'admin-1',
          uploadedByName: 'Admin Um',
          uploadedByRole: 'admin',
          uploadedAt: '2026-09-20T10:00:00.000Z',
        })
      )
      expect(mockBatch.set).not.toHaveBeenCalled()
      vi.clearAllMocks()
      mockFirestoreApi.batch.mockReturnValue(mockBatch)
      mockBatch.commit.mockResolvedValue(undefined)
    }
  })

  it('admin enviando NAO gera aviso (so a logistica notifica admins)', async () => {
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: {} }],
      users: [ADMIN_1, ADMIN_2].map((user) => ({ id: user.id, data: user })),
    })
    const handler = getHandler(recordProcessDocumentEvents)

    await handler(
      makeEvent({
        type: 'containerWash',
        containerId: 'CNT-1',
        uploadedById: 'admin-1',
        uploadedByName: 'Admin Um',
        uploadedByRole: 'admin',
        uploadedAt: '2026-09-20T10:00:00.000Z',
      })
    )

    const notificationSetCalls = mockBatch.set.mock.calls.filter(
      ([, data]) => data?.type === 'process_document_uploaded'
    )
    expect(notificationSetCalls).toHaveLength(0)
  })

  it('falha ao gravar o marco NAO impede o aviso da logistica', async () => {
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: { containers: [{ id: 'CNT-1', number: 'MSCU1234567' }] } }],
      users: [
        { id: ADMIN_1.id, data: ADMIN_1 },
        { id: 'logi-1', data: { id: 'logi-1', role: 'logistica', status: 'Ativo', email: 'logi@sqquimica.com' } },
      ],
    })
    mockBatch.commit.mockRejectedValueOnce(new Error('boom'))
    const handler = getHandler(recordProcessDocumentEvents)

    await handler(
      makeEvent({
        type: 'containerWash',
        containerId: 'CNT-1',
        uploadedById: 'logi-1',
        uploadedByName: 'Logi da Silva',
        uploadedByRole: 'logistica',
        uploadedAt: '2026-09-20T10:00:00.000Z',
      })
    )

    const notificationSetCalls = mockBatch.set.mock.calls.filter(
      ([, data]) => data?.type === 'process_document_uploaded'
    )
    expect(notificationSetCalls).toHaveLength(1)
  })

  it('processo inexistente -> nada', async () => {
    setupFirestoreChain({ processes: [], users: [] })
    const handler = getHandler(recordProcessDocumentEvents)
    await handler(makeEvent({ type: 'bl', uploadedById: 'admin-1', uploadedByRole: 'admin' }))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('sem dado criado (delete concorrente) -> nada', async () => {
    const handler = getHandler(recordProcessDocumentEvents)
    await handler({ params: { processId: PROCESS_ID, documentId: 'x' }, data: { data: () => undefined } })
    expect(mockBatch.set).not.toHaveBeenCalled()
  })
})

// Notificacao "Relatorio de Carga": `notifyCargoReportUploaded`.
describe('notifyCargoReportUploaded', () => {
  const BODY =
    'Relatório de Carga preenchido e disponível no Portal COMEX. Documentação necessária para emissão do COA está disponível na pasta do processo.'
  const ADMIN_1 = { id: 'admin-1', name: 'Admin Um', email: 'admin1@sqquimica.com', role: 'admin', status: 'Ativo' }
  const ADMIN_2 = { id: 'admin-2', name: 'Admin Dois', email: 'admin2@sqquimica.com', role: 'admin', status: 'Ativo' }
  const LOGI_1 = { id: 'logi-1', name: 'Logi Um', email: 'logi@sqquimica.com', role: 'logistica', status: 'Ativo' }
  const LOGI_BLOCKED = { id: 'logi-2', name: 'Logi Dois', email: 'logi2@sqquimica.com', role: 'logistica', status: 'Bloqueado' }
  const TEC_1 = { id: 'tec-1', name: 'Tecnico Um', email: 'tecnico@sqquimica.com', role: 'user', status: 'Ativo' }
  const PROCESS = { processNumber: '12345', category: 'FCL', name: 'Resina Atlas' }
  const CARGO_REPORT = {
    type: 'cargoReport',
    uploadedById: 'admin-1',
    uploadedByName: 'Admin Um',
    uploadedByRole: 'admin',
    uploadedAt: '2026-09-20T10:00:00.000Z',
  }

  function makeEvent(created, { processId = PROCESS_ID, documentId = 'doc-1' } = {}) {
    return { id: 'evt-1', params: { processId, documentId }, data: { data: () => created } }
  }

  function setupChain({ users, config, processes = [{ id: PROCESS_ID, data: PROCESS }] } = {}) {
    setupFirestoreChain({
      processes,
      users: (users ?? [ADMIN_1, ADMIN_2, LOGI_1]).map((user) => ({ id: user.id, data: user })),
      ...(config === undefined ? {} : { config: [{ id: 'cargoReportRecipients', data: config }] }),
    })
  }

  function cargoNotifications() {
    return mockBatch.set.mock.calls
      .map(([, data]) => data)
      .filter((data) => data?.type === 'process_cargo_report_uploaded')
  }

  function configureSmtp() {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()
  }

  beforeEach(() => {
    resetSecrets()
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' })
    mockFirestoreApi.batch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)
  })

  afterEach(() => {
    resetSecrets()
  })

  it('cargoReport por admin-1 -> notifica admin-2, logistica ativa e tecnico com conta (nao o ator)', async () => {
    setupChain({
      users: [ADMIN_1, ADMIN_2, LOGI_1, LOGI_BLOCKED, TEC_1],
      config: { tecnico: ['tecnico@sqquimica.com'], faturamento: [] },
    })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    const notifications = cargoNotifications()
    expect(notifications.map((data) => data.recipientUserId).sort()).toEqual(['admin-2', 'logi-1', 'tec-1'])
    for (const data of notifications) {
      expect(data.body).toBe(BODY)
      expect(data.targetTab).toBe('documents')
      expect(data.messageId).toBe('')
      expect(data.processId).toBe(PROCESS_ID)
      expect(data.actorUserId).toBe('admin-1')
      expect(data.actorName).toBe('Admin Um')
    }

    // titulo fixo pedido pelo Comex: IGUAL para todos os perfis (FCL mostra o nome tambem a nao-admin).
    const titleOf = (uid) => notifications.find((data) => data.recipientUserId === uid).title
    expect(titleOf('admin-2')).toBe('Relatório de Carga - PO 12345 - Resina Atlas')
    expect(titleOf('logi-1')).toBe('Relatório de Carga - PO 12345 - Resina Atlas')
    expect(titleOf('tec-1')).toBe('Relatório de Carga - PO 12345 - Resina Atlas')

    // todos tem conta: nenhum e-mail direto (o e-mail deles sai por sendProcessNotificationEmail).
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('e-mail da config SEM usuario -> e-mail direto (1 envio) e sem in-app para ele', async () => {
    setupChain({ config: { tecnico: [], faturamento: ['Fiscal@sqquimica.com'] } })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const [mail] = mockSendMail.mock.calls[0]
    expect(mail.to).toBe('fiscal@sqquimica.com')
    expect(mail.subject).toBe('Relatório de Carga - PO 12345 - Resina Atlas')
    expect(mail.text).toContain(BODY)
    expect(cargoNotifications().map((data) => data.recipientUserId).sort()).toEqual(['admin-2', 'logi-1'])

    // HTML (imagem + botao) + deep link + banner por CID. O processo vai no
    // assunto e no texto puro (mesmo assunto para todos os perfis).
    expect(mail.html).toContain('aba=documents')
    expect(mail.html).toContain(`processo=${PROCESS_ID}`)
    expect(mail.html).toContain(`alt="${BODY}"`)
    expect(mail.text).toContain('Processo: PO 12345 - Resina Atlas')
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].cid).toBe('cargo-report-banner@portal-comex')
    expect(mail.attachments[0].contentType).toBe('image/jpeg')
    expect(mail.text).toContain(`https://portal-comex.com/processos?processo=${PROCESS_ID}&aba=documents`)
  })

  it('e-mail direto escapa HTML do nome do processo (categoria nao restrita)', async () => {
    setupChain({
      config: { tecnico: [], faturamento: ['fiscal@sqquimica.com'] },
      processes: [{ id: PROCESS_ID, data: { processNumber: '', category: 'Granel', name: '<b>Resina</b>' } }],
    })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const [mail] = mockSendMail.mock.calls[0]
    expect(mail.html).toContain('&lt;b&gt;Resina&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>Resina</b>')
  })

  it('e-mail direto: CONSOLIDADO usa so o nome e o assunto nunca tem CR/LF', async () => {
    setupChain({
      config: { tecnico: [], faturamento: ['fiscal@sqquimica.com'] },
      processes: [
        { id: PROCESS_ID, data: { processNumber: '', category: 'CONSOLIDADO', name: 'CON CN 901-26\r\nBcc: x@evil.com' } },
      ],
    })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const [mail] = mockSendMail.mock.calls[0]
    expect(mail.subject).toBe('Relatório de Carga - CON CN 901-26 Bcc: x@evil.com')
    expect(/[\r\n]/.test(mail.subject)).toBe(false)
    expect(cargoNotifications().every((data) => data.title === mail.subject)).toBe(true)
  })

  it('mesmo usuario em tecnico, faturamento e logistica -> 1 notificacao', async () => {
    setupChain({
      users: [ADMIN_1, LOGI_1],
      config: { tecnico: ['logi@sqquimica.com'], faturamento: ['logi@sqquimica.com'] },
    })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    const notifications = cargoNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].recipientUserId).toBe('logi-1')
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('e-mail nao-corporativo na config -> nem notificacao nem sendMail', async () => {
    setupChain({ users: [ADMIN_1], config: { tecnico: ['externo@gmail.com'], faturamento: [] } })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(cargoNotifications()).toHaveLength(0)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('usuario da config encontrado mas bloqueado -> nao recebe nada (nem e-mail direto)', async () => {
    setupChain({
      users: [ADMIN_1, { ...TEC_1, status: 'Bloqueado' }],
      config: { tecnico: ['tecnico@sqquimica.com'], faturamento: [] },
    })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(cargoNotifications()).toHaveLength(0)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it("documento de outro tipo ('bl', 'invoice') -> nada", async () => {
    for (const type of ['bl', 'invoice']) {
      setupChain({ config: { tecnico: ['fiscal@sqquimica.com'], faturamento: [] } })
      configureSmtp()

      await getHandler(notifyCargoReportUploaded)(makeEvent({ ...CARGO_REPORT, type }))

      expect(mockBatch.set).not.toHaveBeenCalled()
      expect(mockSendMail).not.toHaveBeenCalled()
      vi.clearAllMocks()
      mockFirestoreApi.batch.mockReturnValue(mockBatch)
      mockBatch.commit.mockResolvedValue(undefined)
    }
  })

  it('doc config/cargoReportRecipients ausente -> so admin + logistica', async () => {
    setupChain({ users: [ADMIN_1, ADMIN_2, LOGI_1, TEC_1] })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(cargoNotifications().map((data) => data.recipientUserId).sort()).toEqual(['admin-2', 'logi-1'])
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('SMTP sem secrets -> notificacoes in-app gravadas, sendMail nao chamado', async () => {
    setupChain({ config: { tecnico: [], faturamento: ['fiscal@sqquimica.com'] } })
    setupMailer()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(cargoNotifications().map((data) => data.recipientUserId).sort()).toEqual(['admin-2', 'logi-1'])
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('falha no sendMail do 1o e-mail direto nao impede o 2o', async () => {
    setupChain({
      users: [ADMIN_1],
      config: { tecnico: ['alfa@sqquimica.com'], faturamento: ['zeta@sqquimica.com'] },
    })
    configureSmtp()
    mockSendMail.mockRejectedValueOnce(new Error('smtp down'))

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(mockSendMail).toHaveBeenCalledTimes(2)
    expect(mockSendMail.mock.calls.map(([mail]) => mail.to)).toEqual(['alfa@sqquimica.com', 'zeta@sqquimica.com'])
  })

  it('falha no in-app (batch.commit) nao impede o e-mail direto', async () => {
    setupChain({ config: { tecnico: ['fiscal@sqquimica.com'], faturamento: [] } })
    configureSmtp()
    mockBatch.commit.mockRejectedValueOnce(new Error('boom'))

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('logs so com contagens (sem e-mail nem nome)', async () => {
    setupChain({ config: { tecnico: ['externo@gmail.com'], faturamento: ['fiscal@sqquimica.com'] } })
    configureSmtp()

    await getHandler(notifyCargoReportUploaded)(makeEvent(CARGO_REPORT))

    const finalCall = mockLogger.info.mock.calls.find(([message]) => message === 'Relatorio de Carga notificado.')
    expect(finalCall[1]).toEqual({
      processId: PROCESS_ID,
      inAppRecipients: 2,
      directEmails: 1,
      ignoredNonCorporate: 1,
      failedDirectEmails: 0,
    })
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('fiscal@sqquimica.com')
  })

  it('processo inexistente / sem dado criado -> nada', async () => {
    setupChain({ processes: [] })
    configureSmtp()
    const handler = getHandler(notifyCargoReportUploaded)

    await handler(makeEvent(CARGO_REPORT))
    await handler({ id: 'evt-1', params: { processId: PROCESS_ID, documentId: 'x' }, data: { data: () => undefined } })

    expect(mockBatch.set).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
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
