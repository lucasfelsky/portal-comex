// Testes do trigger notifySupportTicketReplied (suporte v3 — thread, 2026-08-11).
// Cobre:
//   - Update sem mudança em `replies` (ex.: só prioridade mudou): ignora
//   - Reply novo: notificação in-app (type support_ticket_reply) + email para o autor
//   - Mesmo write que responde E resolve: ignora (notifySupportTicketResolved já avisa)
//   - Reply do próprio autor: ignora (log info)
//   - Sem SMTP: in-app criada, email não (log info)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mocks,
  setupFirestoreChain,
  getHandler,
  mockLogger,
  mockBatch,
  setSecretValue,
  resetSecrets,
  setupMailer,
  mockSendMail,
} from '../setup-triggers.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { notifySupportTicketReplied } = await import('../../functions/index.js')

const BASE_TICKET = {
  authorId: 'user-1',
  authorName: 'Joana Compradora',
  authorEmail: 'joana@sqquimica.com',
  message: 'O dashboard não carrega os processos desde hoje cedo.',
  imageUrls: [],
  status: 'aberto',
  priority: 3,
  replies: [],
}

const REPLY = {
  id: 'reply-1',
  authorId: 'admin-1',
  authorName: 'Admin Root',
  message: 'Estamos verificando o problema, já te atualizamos.',
  createdAt: '2026-08-11T12:00:00.000Z',
}

const REPLIED_TICKET = {
  ...BASE_TICKET,
  replies: [REPLY],
}

let handler

beforeEach(() => {
  vi.clearAllMocks()
  handler = getHandler(notifySupportTicketReplied)
  resetSecrets()
})

afterEach(() => {
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

function activateSmtp() {
  setSecretValue('SMTP_HOST', 'smtp.test.com')
  setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
  setSecretValue('SMTP_PASS', 'pass')
  setSecretValue('SMTP_FROM', 'Portal COMEX <noreply@sqquimica.com>')
  setupMailer()
}

describe('notifySupportTicketReplied', () => {
  it('update sem mudanca em replies (so prioridade mudou) -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, { ...BASE_TICKET, priority: 5 }))

    expect(mockBatch.commit).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('reply novo: in-app + email para o autor', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, REPLIED_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    const payload = mockBatch.set.mock.calls[0][1]
    expect(payload.recipientUserId).toBe('user-1')
    expect(payload.type).toBe('support_ticket_reply')
    expect(payload.title).toBe('Nova resposta no seu chamado')
    expect(payload.body).toContain('Admin Root')

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const args = mockSendMail.mock.calls[0][0]
    expect(args.to).toBe('joana@sqquimica.com')
    expect(args.subject).toMatch(/resposta/i)
    expect(args.text).toContain('Admin Root')
    expect(args.text).toContain(REPLY.message)
  })

  it('mesmo write que responde E resolve -> ignora (resolved ja avisa)', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(
      makeEvent(BASE_TICKET, {
        ...REPLIED_TICKET,
        status: 'resolvido',
        resolvedById: 'admin-1',
        resolvedByName: 'Admin Root',
      })
    )

    expect(mockBatch.commit).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('reply do proprio autor -> ignora (log info)', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(
      makeEvent(BASE_TICKET, {
        ...BASE_TICKET,
        replies: [{ ...REPLY, authorId: 'user-1', authorName: 'Joana Compradora' }],
      })
    )

    expect(mockBatch.commit).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('sem SMTP: in-app criada, email nao (log info)', async () => {
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, REPLIED_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })
})
