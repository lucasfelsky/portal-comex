// Testes do trigger sendNewsPublishedEmail.
// Cobre:
//   - Sem SMTP: ignora (log info)
//   - Sem usuarios Ativos+corporate: nada envia
//   - Happy path: envia para todos usuarios Ativos+corporate
//   - Filtra usuarios nao-Ativos ou email nao-corporativo
//   - Dedup por email (mesmo user com 2 docs: envia 1x)
//   - Falha em um recipient NAO derruba os demais (Promise.allSettled)
//   - news vazia: ignora

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

const { sendNewsPublishedEmail } = await import('../../functions/index.js')

const NEWS = {
  id: 'news-1',
  title: 'SISCOMEX: nova portaria 123/2026',
  content: 'Detalhes da portaria...',
}

let handler

beforeEach(() => {
  vi.clearAllMocks()
  handler = getHandler(sendNewsPublishedEmail)
  resetSecrets()
})

afterEach(() => {
  resetSecrets()
})

function makeEvent(newsItem, params = { newsId: 'news-1' }) {
  return { params, data: { data: () => newsItem } }
}

function activateSmtp() {
  setSecretValue('SMTP_HOST', 'smtp.test.com')
  setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
  setSecretValue('SMTP_PASS', 'pass')
  setSecretValue('SMTP_FROM', 'Portal COMEX <noreply@sqquimica.com>')
  setupMailer()
}

describe('sendNewsPublishedEmail', () => {
  it('sem SMTP -> ignora (log info)', async () => {
    setupFirestoreChain({
      users: [{ id: 'u1', data: { name: 'A', email: 'a@sqquimica.com', status: 'Ativo' } }],
    })
    await handler(makeEvent(NEWS))
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('sem usuarios Ativos+corporate -> nada envia', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'u1', data: { name: 'A', email: 'a@gmail.com', status: 'Ativo' } },
        { id: 'u2', data: { name: 'B', email: 'b@sqquimica.com', status: 'Bloqueado' } },
      ],
    })
    await handler(makeEvent(NEWS))
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('happy path: envia para todos usuarios Ativos+corporate', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'u1', data: { name: 'Maria', email: 'maria@sqquimica.com', status: 'Ativo' } },
        { id: 'u2', data: { name: 'Joao', email: 'joao@sqquimica.com', status: 'Ativo' } },
      ],
    })
    await handler(makeEvent(NEWS))
    expect(mockSendMail).toHaveBeenCalledTimes(2)
    const toList = mockSendMail.mock.calls.map((c) => c[0].to)
    expect(toList).toContain('maria@sqquimica.com')
    expect(toList).toContain('joao@sqquimica.com')
  })

  it('filtra usuarios nao-Ativos ou email nao-corporativo', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'u1', data: { name: 'Maria', email: 'maria@sqquimica.com', status: 'Ativo' } },
        { id: 'u2', data: { name: 'Externo', email: 'externo@gmail.com', status: 'Ativo' } },
        { id: 'u3', data: { name: 'Bloqueado', email: 'b@sqquimica.com', status: 'Bloqueado' } },
      ],
    })
    await handler(makeEvent(NEWS))
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(mockSendMail.mock.calls[0][0].to).toBe('maria@sqquimica.com')
  })

  it('dedup por email (mesmo email em 2 docs: 1 envio)', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'u1', data: { name: 'Maria', email: 'maria@sqquimica.com', status: 'Ativo' } },
        { id: 'u2', data: { name: 'Maria2', email: 'maria@sqquimica.com', status: 'Ativo' } },
      ],
    })
    await handler(makeEvent(NEWS))
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('falha em um recipient NAO derruba os demais', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [
        { id: 'u1', data: { name: 'Maria', email: 'maria@sqquimica.com', status: 'Ativo' } },
        { id: 'u2', data: { name: 'Joao', email: 'joao@sqquimica.com', status: 'Ativo' } },
      ],
    })
    mockSendMail
      .mockRejectedValueOnce(new Error('smtp fail'))
      .mockResolvedValueOnce({ messageId: 'm-2' })

    await handler(makeEvent(NEWS))
    expect(mockSendMail).toHaveBeenCalledTimes(2)
    // logger.error deve registrar a falha
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('news vazia -> ignora', async () => {
    activateSmtp()
    setupFirestoreChain({ users: [] })
    await handler(makeEvent(undefined))
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('email enviado tem subject com titulo e text com saudacao', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [{ id: 'u1', data: { name: 'Maria Souza', email: 'maria@sqquimica.com', status: 'Ativo' } }],
    })
    await handler(makeEvent(NEWS))
    const args = mockSendMail.mock.calls[0][0]
    expect(args.subject).toContain('SISCOMEX')
    expect(args.text).toContain('Ola, Maria Souza')
    expect(args.html).toBeDefined()
  })

  // Regressao sprint 8: HTML do email usa tokens do design system
  // (BRAND_COLORS) ao inves das cores legacy hardcoded.
  it('html do email usa tokens BRAND_COLORS (sem #184054 / #f4faf9)', async () => {
    activateSmtp()
    setupFirestoreChain({
      users: [{ id: 'u1', data: { name: 'Maria', email: 'maria@sqquimica.com', status: 'Ativo' } }],
    })
    await handler(makeEvent(NEWS))
    const args = mockSendMail.mock.calls[0][0]
    // Cores legacy NAO podem mais aparecer
    expect(args.html).not.toContain('#184054')
    expect(args.html).not.toContain('#f4faf9')
    // Cores do design system DEVEM aparecer
    expect(args.html).toContain('#00ae91') // primary
    expect(args.html).toContain('#1f1c18') // ink
  })
})
