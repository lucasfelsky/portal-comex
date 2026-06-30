// Testes do trigger sendProcessNotificationEmail.
// Cobre:
//   - Tipo de notificacao nao-EMAIL_NOTIFICATION_TYPES: ignora
//   - Recipient inativo ou sem email corporativo: ignora
//   - Sem SMTP configurado: ignora (loga info)
//   - Happy path: envia email via nodemailer com subject e text formatados

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

const { sendProcessNotificationEmail } = await import('../../functions/index.js')

const RECIPIENT_UID = 'recipient-1'
const RECIPIENT_USER = {
  id: RECIPIENT_UID,
  name: 'Maria Souza',
  email: 'maria@sqquimica.com',
  role: 'logistica',
  status: 'Ativo',
}

let handler

beforeEach(() => {
  vi.clearAllMocks()
  handler = getHandler(sendProcessNotificationEmail)
  resetSecrets()
  setupFirestoreChain({
    users: [{ id: RECIPIENT_UID, data: RECIPIENT_USER }],
  })
})

afterEach(() => {
  resetSecrets()
})

function makeEvent(notification, params = { notificationId: 'n-1' }) {
  return { params, data: { data: () => notification } }
}

describe('sendProcessNotificationEmail', () => {
  it('tipo nao-EMAIL_NOTIFICATION_TYPES -> ignora', async () => {
    await handler(
      makeEvent({
        type: 'unknown_type',
        recipientUserId: RECIPIENT_UID,
        title: 'foo',
        body: 'bar',
      })
    )
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('recipient inativo -> ignora', async () => {
    setupFirestoreChain({
      users: [{ id: RECIPIENT_UID, data: { ...RECIPIENT_USER, status: 'Bloqueado' } }],
    })
    await handler(
      makeEvent({
        type: 'process_question_answered',
        recipientUserId: RECIPIENT_UID,
        title: 'foo',
        body: 'bar',
      })
    )
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('recipient com email nao-corporativo -> ignora', async () => {
    setupFirestoreChain({
      users: [{ id: RECIPIENT_UID, data: { ...RECIPIENT_USER, email: 'maria@gmail.com' } }],
    })
    await handler(
      makeEvent({
        type: 'process_question_answered',
        recipientUserId: RECIPIENT_UID,
        title: 'foo',
        body: 'bar',
      })
    )
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('sem SMTP configurado -> ignora (log info)', async () => {
    // nao chama setSecretValue
    await handler(
      makeEvent({
        type: 'process_question_answered',
        recipientUserId: RECIPIENT_UID,
        title: 'foo',
        body: 'bar',
      })
    )
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('happy path: envia email com subject [Portal COMEX] e text formatado', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setSecretValue('SMTP_FROM', 'Portal COMEX <noreply@sqquimica.com>')
    setupMailer()

    await handler(
      makeEvent({
        type: 'process_question_answered',
        recipientUserId: RECIPIENT_UID,
        title: 'Sua duvida foi respondida',
        body: 'Veja os detalhes do processo PO 12345',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const args = mockSendMail.mock.calls[0][0]
    expect(args.to).toBe('maria@sqquimica.com')
    expect(args.subject).toMatch(/\[Portal COMEX\]/)
    expect(args.subject).toContain('Sua duvida foi respondida')
    expect(args.text).toContain('Ola, Maria')
    expect(args.text).toContain('Veja os detalhes do processo PO 12345')
  })

  it('happy path: post_receipt_notes_updated tambem dispara', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'post_receipt_notes_updated',
        recipientUserId: RECIPIENT_UID,
        title: 'Obs atualizadas',
        body: 'body',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('recipientUserId vazio -> ignora', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'process_question_answered',
        recipientUserId: '',
        title: 'foo',
        body: 'bar',
      })
    )
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('notificacao sem dados -> ignora', async () => {
    await handler({ params: { notificationId: 'n' }, data: { data: () => undefined } })
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})
