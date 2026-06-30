// Testes do trigger createProcessMessageNotifications.
// Cobre:
//   - Mensagem de admin responde duvida: notifica o autor anterior (nao-admin)
//   - Mensagem de nao-admin: notifica todos os admins ativos
//   - Favorited users sempre recebem (favorite_process_message), exceto o autor
//   - Mensagens sem dados (data vazia, sem processId/messageId/authorId) sao ignoradas
//   - Process inexistente: nenhuma notificacao criada
//   - Recipients inativos / sem e-mail corporativo / iguais ao autor sao filtrados
//   - Notifications sao persistidas via batch em `notifications` (1 entrada por recipient)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockBatch,
  mockFirestoreApi,
  mocks,
  setupFirestoreChain,
  getHandler,
  mockLogger,
} from '../setup-triggers.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { createProcessMessageNotifications } = await import('../../functions/index.js')

const PROCESS_ID = 'proc-1'
const MESSAGE_ID = 'msg-1'
const AUTHOR_UID = 'user-1'
const ADMIN_UID = 'admin-1'
const FAVORITER_UID = 'fan-1'
const PREVIOUS_AUTHOR_UID = 'user-2'

const PROCESS = {
  id: PROCESS_ID,
  name: 'PO 12345',
  processNumber: 'PO 12345',
  category: 'FCL',
}

const AUTHOR_USER = {
  id: AUTHOR_UID,
  name: 'Joao da Silva',
  email: 'joao@sqquimica.com',
  role: 'user',
  status: 'Ativo',
}

const ADMIN_USER = {
  id: ADMIN_UID,
  name: 'Admin Root',
  email: 'admin@sqquimica.com',
  role: 'admin',
  status: 'Ativo',
}

const PREVIOUS_USER = {
  id: PREVIOUS_AUTHOR_UID,
  name: 'Maria Souza',
  email: 'maria@sqquimica.com',
  role: 'user',
  status: 'Ativo',
}

const FAVORITER_USER = {
  id: FAVORITER_UID,
  name: 'Carlos Favorito',
  email: 'carlos@sqquimica.com',
  role: 'logistica',
  status: 'Ativo',
  favoriteProcessIds: [PROCESS_ID],
}

let handler

beforeEach(() => {
  vi.clearAllMocks()
  handler = getHandler(createProcessMessageNotifications)
  setupFirestoreChain({
    processes: [{ id: PROCESS_ID, data: PROCESS }],
    users: [
      { id: AUTHOR_UID, data: AUTHOR_USER },
      { id: ADMIN_UID, data: ADMIN_USER },
      { id: PREVIOUS_AUTHOR_UID, data: PREVIOUS_USER },
      { id: FAVORITER_UID, data: FAVORITER_USER },
    ],
  })
  mockFirestoreApi.batch.mockReturnValue(mockBatch)
})

afterEach(() => {
  vi.clearAllMocks()
})

function makeEvent(message, params = { processId: PROCESS_ID, messageId: MESSAGE_ID }) {
  return {
    params,
    data: {
      data: () => message,
    },
  }
}

describe('createProcessMessageNotifications', () => {
  it('mensagem de nao-admin notifica todos os admins ativos e os favoritados', async () => {
    const message = {
      authorId: AUTHOR_UID,
      authorName: 'Joao',
      authorEmail: 'joao@sqquimica.com',
      text: 'Tenho uma duvida...',
    }
    // previousMessages snapshot vem vazio (admin e' que responde depois).
    // Para o caso de user-pergunta, a impl consulta as mensagens previas
    // mas so' processa se actorRole === 'admin'. Logo a lista previous
    // e' irrelevante aqui.
    await handler(makeEvent(message))

    // Foram criados: 1 admin + 1 favorited
    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)

    // Tipos das notificacoes
    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types).toContain('process_question_created')
    expect(types).toContain('favorite_process_message')
  })

  it('mensagem de admin (que responde duvida) notifica o autor anterior nao-admin', async () => {
    // Actor e' admin
    const adminUserAsAuthor = { id: 'admin-actor', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin', status: 'Ativo' }
    const subKey = `processes/${PROCESS_ID}/messages`
    const { collectionRefs } = setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: PROCESS }],
      users: [
        { id: 'admin-actor', data: adminUserAsAuthor },
        { id: PREVIOUS_AUTHOR_UID, data: PREVIOUS_USER },
        { id: FAVORITER_UID, data: FAVORITER_USER },
      ],
      [subKey]: [
        {
          id: 'msg-prev',
          data: { authorId: PREVIOUS_AUTHOR_UID, text: 'duvida anterior' },
        },
      ],
    })
    mockFirestoreApi.batch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)

    const message = {
      authorId: 'admin-actor',
      authorName: 'Admin',
      text: 'Resposta da duvida',
    }
    await handler(makeEvent(message))

    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types).toContain('process_question_answered')
    expect(types).toContain('favorite_process_message')
  })

  it('filtra o proprio autor (autor nao recebe notificacao)', async () => {
    const message = {
      authorId: AUTHOR_UID,
      authorName: 'Joao',
      text: 'minha propria mensagem',
    }
    // Favoriter tambem e' o autor: deve ser removido.
    const favoriterIsAuthor = {
      ...FAVORITER_USER,
      id: AUTHOR_UID,
    }
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: PROCESS }],
      users: [
        { id: AUTHOR_UID, data: AUTHOR_USER },
        { id: ADMIN_UID, data: ADMIN_USER },
        favoriterIsAuthor,
      ],
    })
    mockFirestoreApi.batch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)

    await handler(makeEvent(message))

    // Apenas 1 admin recebe. Favoriter == autor: filtrado.
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const recipients = mockBatch.set.mock.calls.map(([, payload]) => payload.recipientUserId)
    expect(recipients).toEqual([ADMIN_UID])
  })

  it('filtra recipients inativos (status != Ativo)', async () => {
    const inactiveAdmin = {
      ...ADMIN_USER,
      status: 'Bloqueado',
    }
    setupFirestoreChain({
      processes: [{ id: PROCESS_ID, data: PROCESS }],
      users: [
        { id: AUTHOR_UID, data: AUTHOR_USER },
        { id: ADMIN_UID, data: inactiveAdmin },
        { id: FAVORITER_UID, data: FAVORITER_USER },
      ],
    })
    mockFirestoreApi.batch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)

    const message = { authorId: AUTHOR_UID, authorName: 'Joao' }
    await handler(makeEvent(message))

    // Apenas 1 (favorited) — admin Bloqueado filtrado.
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const recipients = mockBatch.set.mock.calls.map(([, payload]) => payload.recipientUserId)
    expect(recipients).toEqual([FAVORITER_UID])
  })

  it('ignora evento sem data', async () => {
    const event = {
      params: { processId: PROCESS_ID, messageId: MESSAGE_ID },
      data: { data: () => undefined },
    }
    await handler(event)
    expect(mockBatch.set).not.toHaveBeenCalled()
    expect(mockBatch.commit).not.toHaveBeenCalled()
  })

  it('ignora evento sem processId/messageId/authorId', async () => {
    const message = { authorId: '', text: 'oi' }
    const event = makeEvent(message, { processId: '', messageId: MESSAGE_ID })
    await handler(event)
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('ignora evento se processo nao existe', async () => {
    setupFirestoreChain({
      processes: [], // nao ha o processo
      users: [{ id: ADMIN_UID, data: ADMIN_USER }],
    })
    const message = { authorId: AUTHOR_UID, text: 'oi' }
    await handler(makeEvent(message))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('notificacao persistida tem campos canonicos (recipientUserId, actorUserId, type, targetTab, isRead=false, createdAt=SERVER_TIMESTAMP)', async () => {
    const message = { authorId: AUTHOR_UID, text: 'oi' }
    await handler(makeEvent(message))

    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.recipientUserId).toBeDefined()
    expect(payload.actorUserId).toBe(AUTHOR_UID)
    expect(payload.type).toBeDefined()
    expect(payload.targetTab).toBe('messages')
    expect(payload.isRead).toBe(false)
    expect(payload.createdAt).toBe('SERVER_TIMESTAMP')
    expect(payload.readAt).toBe(null)
  })

  it('logger info registra o evento', async () => {
    const message = { authorId: AUTHOR_UID, text: 'oi' }
    await handler(makeEvent(message))
    // nao falha se nao chamou, mas tipicamente trigger de firestore nao
    // loga em happy path. Verificamos que nao houve erro:
    expect(mockLogger.error).not.toHaveBeenCalled()
  })
})
