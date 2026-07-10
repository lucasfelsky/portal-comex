// Testes do trigger notifySupportTicketCreated (aba de suporte, backlog
// 2026-07-10).
// Cobre:
//   - Ticket vazio: ignora
//   - Sem admins ativos: nada envia (log info)
//   - Happy path: notificação in-app para admins (exceto o autor) + email
//     para todos os admins ativos+corporate
//   - Sem SMTP: in-app ainda é criada, email não (log info)
//   - Conteúdo: subject/text mencionam autor e mensagem; html usa BRAND_COLORS

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

const { notifySupportTicketCreated } = await import('../../functions/index.js')

const ADMIN_USER = {
  id: 'admin-1',
  name: 'Admin Root',
  email: 'admin@sqquimica.com',
  role: 'admin',
  status: 'Ativo',
}

const ADMIN_2 = {
  id: 'admin-2',
  name: 'Admin 2',
  email: 'admin2@sqquimica.com',
  role: 'admin',
  status: 'Ativo',
}

const BASE_TICKET = {
  authorId: 'user-1',
  authorName: 'Joana Compradora',
  authorEmail: 'joana@sqquimica.com',
  message: 'O dashboard não carrega os processos desde hoje cedo.',
  imageUrls: ['https://example.com/print-1.png'],
  status: 'aberto',
  priority: 3,
}

let handler

beforeEach(() => {
  vi.clearAllMocks()
  handler = getHandler(notifySupportTicketCreated)
  resetSecrets()
})

afterEach(() => {
  resetSecrets()
})

function makeEvent(ticket, params = { ticketId: 'ticket-1' }) {
  return { params, data: { data: () => ticket } }
}

function activateSmtp() {
  setSecretValue('SMTP_HOST', 'smtp.test.com')
  setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
  setSecretValue('SMTP_PASS', 'pass')
  setSecretValue('SMTP_FROM', 'Portal COMEX <noreply@sqquimica.com>')
  setupMailer()
}

describe('notifySupportTicketCreated', () => {
  it('ticket vazio -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [{ id: 'admin-1', data: ADMIN_USER }] })
    await handler(makeEvent(undefined))
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockBatch.commit).not.toHaveBeenCalled()
  })

  it('sem admins ativos -> nada envia (log info)', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET))
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockBatch.commit).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('happy path: in-app para admins + email para todos os admins', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'admin-2', data: ADMIN_2 },
      ],
    })
    await handler(makeEvent(BASE_TICKET))

    // In-app: um batch.set por admin (autor nao e' admin aqui).
    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    const notificationPayloads = mockBatch.set.mock.calls.map((call) => call[1])
    for (const payload of notificationPayloads) {
      expect(payload.type).toBe('support_ticket')
      expect(payload.title).toBe('Novo chamado de suporte')
      expect(payload.body).toContain('Joana Compradora')
    }
    const recipients = notificationPayloads.map((payload) => payload.recipientUserId)
    expect(recipients).toContain('admin-1')
    expect(recipients).toContain('admin-2')

    // Email: um por admin ativo+corporate.
    expect(mockSendMail).toHaveBeenCalledTimes(2)
    const toList = mockSendMail.mock.calls.map((call) => call[0].to)
    expect(toList).toContain('admin@sqquimica.com')
    expect(toList).toContain('admin2@sqquimica.com')
  })

  it('autor admin nao recebe a propria notificacao in-app', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'admin-2', data: ADMIN_2 },
      ],
    })
    await handler(makeEvent({ ...BASE_TICKET, authorId: 'admin-1', authorName: 'Admin Root' }))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockBatch.set.mock.calls[0][1].recipientUserId).toBe('admin-2')
  })

  it('sem SMTP: in-app ainda criada, email nao (log info)', async () => {
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_USER }],
    })
    await handler(makeEvent(BASE_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('subject/text mencionam autor e mensagem; link aponta para /admin/suporte', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [{ id: 'admin-1', data: ADMIN_USER }] })
    await handler(makeEvent(BASE_TICKET))

    const args = mockSendMail.mock.calls[0][0]
    expect(args.subject.toLowerCase()).toMatch(/suporte|chamado/i)
    expect(args.text).toContain('Joana Compradora')
    expect(args.text).toContain('O dashboard não carrega os processos desde hoje cedo.')
    expect(args.text).toContain('/admin/suporte')
    expect(args.html).toContain('/admin/suporte')
  })

  it('html do email usa tokens BRAND_COLORS', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [{ id: 'admin-1', data: ADMIN_USER }] })
    await handler(makeEvent(BASE_TICKET))

    const args = mockSendMail.mock.calls[0][0]
    expect(args.html).toContain('#00ae91')
    expect(args.html).toContain('#1f1c18')
  })
})
