// F6 (backlog 2026-07-12): push FCM plugado no createNotifications.
// Exercita via notifySupportTicketResolved (autor com fcmTokens no perfil):
//   - happy path: sendEachForMulticast com os tokens do destinatario
//   - destinatario sem tokens / sem doc: nenhum push, in-app segue normal
//   - tokens mortos no retorno: arrayRemove no doc do usuario
//   - messaging explodindo: in-app NAO e' afetado (best-effort)

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mocks,
  setupFirestoreChain,
  getHandler,
  mockBatch,
  mockMessagingApi,
  mockFirestoreApi,
  setSecretValue,
  resetSecrets,
} from '../setup-triggers.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-admin/messaging', () => mocks.firebaseMessaging())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { notifySupportTicketResolved } = await import('../../functions/index.js')

const BASE_TICKET = {
  authorId: 'user-1',
  authorName: 'Joana Compradora',
  authorEmail: 'joana@sqquimica.com',
  message: 'O dashboard não carrega os processos.',
  imageUrls: [],
  status: 'aberto',
  priority: 3,
}

const RESOLVED_TICKET = {
  ...BASE_TICKET,
  status: 'resolvido',
  resolvedById: 'admin-1',
  resolvedByName: 'Admin Root',
}

let handler

beforeEach(() => {
  vi.clearAllMocks()
  mockMessagingApi.sendEachForMulticast.mockResolvedValue({
    successCount: 2,
    failureCount: 0,
    responses: [{ success: true }, { success: true }],
  })
  handler = getHandler(notifySupportTicketResolved)
  resetSecrets()
})

function makeEvent(before, after, params = { ticketId: 'ticket-1' }) {
  return {
    params,
    data: {
      before: { data: () => before },
      after: { data: () => after },
    },
  }
}

describe('push FCM no createNotifications (via notifySupportTicketResolved)', () => {
  it('happy path: multicast com os tokens do destinatario + link do app', async () => {
    setupFirestoreChain({
      users: [
        { id: 'user-1', data: { name: 'Joana', fcmTokens: ['tok-a', 'tok-b'] } },
      ],
    })

    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    // In-app criada normalmente.
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)

    // Push multicast pros tokens do autor.
    expect(mockMessagingApi.sendEachForMulticast).toHaveBeenCalledTimes(1)
    const message = mockMessagingApi.sendEachForMulticast.mock.calls[0][0]
    expect(message.tokens).toEqual(['tok-a', 'tok-b'])
    expect(message.notification.title).toBe('Chamado de suporte resolvido')
    expect(message.notification.body).toContain('Admin Root')
    expect(message.webpush.fcmOptions.link).toContain('portal-comex.com')
  })

  it('destinatario sem tokens: in-app segue, nenhum push', async () => {
    setupFirestoreChain({
      users: [{ id: 'user-1', data: { name: 'Joana' } }],
    })

    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    expect(mockMessagingApi.sendEachForMulticast).not.toHaveBeenCalled()
  })

  it('destinatario sem doc users: nenhum push, sem erro', async () => {
    setupFirestoreChain({ users: [] })

    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    expect(mockMessagingApi.sendEachForMulticast).not.toHaveBeenCalled()
  })

  it('tokens mortos no retorno: arrayRemove no doc do usuario', async () => {
    setupFirestoreChain({
      users: [
        { id: 'user-1', data: { name: 'Joana', fcmTokens: ['tok-vivo', 'tok-morto'] } },
      ],
    })
    mockMessagingApi.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    })

    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    // update com arrayRemove do token morto no doc do user.
    const userDoc = mockFirestoreApi.collection.mock.results
      .map((r) => r.value)
      .filter(Boolean)
    // Verificacao via FieldValue.arrayRemove chamado com o token morto.
    expect(mockFirestoreApi.FieldValue.arrayRemove).toHaveBeenCalledWith('tok-morto')
  })

  it('messaging explodindo: in-app NAO e afetado (best-effort)', async () => {
    setupFirestoreChain({
      users: [{ id: 'user-1', data: { name: 'Joana', fcmTokens: ['tok-a'] } }],
    })
    mockMessagingApi.sendEachForMulticast.mockRejectedValue(new Error('FCM down'))

    await expect(handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))).resolves.toBeUndefined()
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
  })
})
