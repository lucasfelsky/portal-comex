// Testes do trigger sendPendingApprovalAdminEmail.
// Cobre:
//   - User com role=admin: ignora (mesmo que status=Pendente)
//   - User com status != Pendente (ex: Ativo): ignora
//   - Sem SMTP: ignora (log info)
//   - Sem admins ativos: nada envia
//   - Happy path: envia para todos admins ativos+corporate
//   - User vazio: ignora

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mocks,
  setupFirestoreChain,
  getHandler,
  mockLogger,
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

const { sendPendingApprovalAdminEmail } = await import('../../functions/index.js')

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

let handler

beforeEach(() => {
  vi.clearAllMocks()
  handler = getHandler(sendPendingApprovalAdminEmail)
  resetSecrets()
})

afterEach(() => {
  resetSecrets()
})

function makeEvent(pendingUser, params = { userId: 'new-1' }) {
  return { params, data: { data: () => pendingUser } }
}

function activateSmtp() {
  setSecretValue('SMTP_HOST', 'smtp.test.com')
  setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
  setSecretValue('SMTP_PASS', 'pass')
  setSecretValue('SMTP_FROM', 'Portal COMEX <noreply@sqquimica.com>')
  setupMailer()
}

describe('sendPendingApprovalAdminEmail', () => {
  it('user com role=admin -> ignora (mesmo status=Pendente)', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_USER }],
    })
    await handler(makeEvent({ id: 'admin-1', role: 'admin', status: 'Pendente' }))
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('user com status=Ativo -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_USER }],
    })
    await handler(makeEvent({ id: 'new-1', role: 'user', status: 'Ativo' }))
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('user com status=Bloqueado -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_USER }],
    })
    await handler(makeEvent({ id: 'new-1', role: 'user', status: 'Bloqueado' }))
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('sem SMTP -> ignora (log info)', async () => {
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_USER }],
    })
    await handler(makeEvent({ id: 'new-1', role: 'user', status: 'Pendente' }))
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('sem admins ativos -> nada envia (log info)', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent({ id: 'new-1', role: 'user', status: 'Pendente' }))
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('happy path: envia para todos admins ativos+corporate', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'admin-2', data: ADMIN_2 },
      ],
    })
    await handler(
      makeEvent({
        id: 'new-1',
        name: 'Joao Pendente',
        email: 'joao@sqquimica.com',
        role: 'user',
        status: 'Pendente',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(2)
    const toList = mockSendMail.mock.calls.map((c) => c[0].to)
    expect(toList).toContain('admin@sqquimica.com')
    expect(toList).toContain('admin2@sqquimica.com')
  })

  it('happy path: subject contem "aprovacao" e text menciona o nome do user pendente', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_USER }],
    })
    await handler(
      makeEvent({
        id: 'new-1',
        name: 'Joao da Silva',
        email: 'joao@sqquimica.com',
        role: 'user',
        status: 'Pendente',
      })
    )
    const args = mockSendMail.mock.calls[0][0]
    expect(args.subject.toLowerCase()).toMatch(/aprovac|pendente|novo cadastro/i)
    expect(args.text).toContain('Joao da Silva')
    expect(args.html).toBeDefined()
  })

  it('user vazio -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [{ id: 'admin-1', data: ADMIN_USER }] })
    await handler(makeEvent(undefined))
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})
