// Testes do trigger notifySupportTicketResolved (suporte v2, 2026-07-11).
// Cobre:
//   - Update sem transição para 'resolvido' (aberto -> em_andamento,
//     resolvido -> resolvido): ignora
//   - Happy path (aberto -> resolvido): notificação in-app para o AUTOR
//     (type support_ticket_resolved) + email para o autor
//   - em_andamento -> resolvido também dispara
//   - Autor resolveu o próprio chamado: ignora (log info)
//   - Sem SMTP: in-app ainda é criada, email não (log info)
//   - Sem authorEmail: in-app criada, email não (log info)

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

const { notifySupportTicketResolved } = await import('../../functions/index.js')

const BASE_TICKET = {
  authorId: 'user-1',
  authorName: 'Joana Compradora',
  authorEmail: 'joana@sqquimica.com',
  message: 'O dashboard não carrega os processos desde hoje cedo.',
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
  handler = getHandler(notifySupportTicketResolved)
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

describe('notifySupportTicketResolved', () => {
  it('update sem transicao para resolvido (aberto -> em_andamento) -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, { ...BASE_TICKET, status: 'em_andamento' }))

    expect(mockBatch.commit).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('resolvido -> resolvido (so prioridade mudou) -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(RESOLVED_TICKET, { ...RESOLVED_TICKET, priority: 5 }))

    expect(mockBatch.commit).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('happy path (aberto -> resolvido): in-app + email para o autor', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    const payload = mockBatch.set.mock.calls[0][1]
    expect(payload.recipientUserId).toBe('user-1')
    expect(payload.type).toBe('support_ticket_resolved')
    expect(payload.title).toBe('Chamado de suporte resolvido')
    expect(payload.body).toContain('Admin Root')

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const args = mockSendMail.mock.calls[0][0]
    expect(args.to).toBe('joana@sqquimica.com')
    expect(args.subject).toMatch(/resolvido/i)
    expect(args.text).toContain('Admin Root')
    expect(args.text).toContain('O dashboard não carrega os processos desde hoje cedo.')
  })

  it('em_andamento -> resolvido tambem dispara', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent({ ...BASE_TICKET, status: 'em_andamento' }, RESOLVED_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('autor resolveu o proprio chamado -> ignora (log info)', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(
      makeEvent(BASE_TICKET, {
        ...RESOLVED_TICKET,
        resolvedById: 'user-1',
        resolvedByName: 'Joana Compradora',
      })
    )

    expect(mockBatch.commit).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('sem SMTP: in-app criada, email nao (log info)', async () => {
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('sem authorEmail: in-app criada, email nao (log info)', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, { ...RESOLVED_TICKET, authorEmail: '' }))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('html do email usa tokens BRAND_COLORS e nao aponta para rota admin', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    const args = mockSendMail.mock.calls[0][0]
    expect(args.html).toContain('#00ae91')
    expect(args.html).not.toContain('/admin/suporte')
  })
})
