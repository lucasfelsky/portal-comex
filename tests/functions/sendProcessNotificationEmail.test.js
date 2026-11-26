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
    expect(args.text).toContain('Olá, Maria')
    expect(args.text).toContain('Veja os detalhes do processo PO 12345')
  })

  it('happy path: receipt_divergence_reported tambem dispara (F17.4b)', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'receipt_divergence_reported',
        recipientUserId: RECIPIENT_UID,
        title: 'Divergência no recebimento',
        body: 'Logi da Silva registrou divergência no recebimento (Avaria) em PO 12345.',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)
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

  it('happy path: license_rejected tambem dispara (F17.5a)', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'license_rejected',
        recipientUserId: RECIPIENT_UID,
        title: 'Anuência indeferida',
        body: 'Admin Root marcou a anuência ANVISA como indeferida em PO 12345.',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('happy path: process_daily_alerts tambem dispara (F17.5a)', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'process_daily_alerts',
        recipientUserId: RECIPIENT_UID,
        title: 'Alertas operacionais do dia (1)',
        body: 'Free time de PO 1 vence em 2 dias (26/09/2026).',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  // F18b-1 (B4): `process_document_uploaded` NAO entra em
  // `EMAIL_NOTIFICATION_TYPES` (aviso da logistica e' so' in-app/push).
  it('process_document_uploaded -> NAO envia e-mail', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'process_document_uploaded',
        recipientUserId: RECIPIENT_UID,
        title: 'Novo documento no processo',
        body: 'Logi da Silva enviou Relatório de lavação (MSCU1234567) em PO 12345.',
      })
    )
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  // Relatorio de Carga: entra em `EMAIL_NOTIFICATION_TYPES` (diferente de
  // `process_document_uploaded`), o e-mail sai por este trigger.
  it('process_cargo_report_uploaded -> envia e-mail', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'process_cargo_report_uploaded',
        recipientUserId: RECIPIENT_UID,
        processId: 'proc-1',
        title: 'Relatório de Carga - PO 12345 - Resina Atlas',
        body: 'Relatório de Carga preenchido e disponível no Portal COMEX. Documentação necessária para emissão do COA está disponível na pasta do processo.',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)

    const args = mockSendMail.mock.calls[0][0]
    expect(args.to).toBe('maria@sqquimica.com')
    // assunto = titulo montado pelo trigger, SEM o prefixo "[Portal COMEX]".
    expect(args.subject).toBe('Relatório de Carga - PO 12345 - Resina Atlas')
    expect(args.subject).not.toContain('[Portal COMEX]')
    expect(args.html).toContain('processos?processo=proc-1&amp;aba=documents')
    expect(args.text).toContain('Processo: PO 12345 - Resina Atlas')
    expect(args.attachments).toHaveLength(1)
    expect(args.attachments[0].cid).toBe('cargo-report-banner@portal-comex')
    expect(args.attachments[0].contentType).toBe('image/jpeg')
    expect(args.html).toContain('src="cid:cargo-report-banner@portal-comex"')
    expect(args.text).toContain('Olá, Maria Souza.')
    expect(args.text).toContain('https://portal-comex.com/processos?processo=proc-1&aba=documents')
  })

  // S7: conferencia da logistica fechada: e-mail proprio (banner novo por CID), nao o do COMEX.
  it('process_cargo_report_conference -> envia o e-mail da conferencia com o banner inline novo', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'process_cargo_report_conference',
        recipientUserId: RECIPIENT_UID,
        processId: 'proc-1',
        title: 'Conferência do Relatório de Carga - PO 12345 - Resina Atlas',
        body: 'Conferência da logística concluída no Relatório de Carga. Etiquetas, contagem e dados do recebimento estão disponíveis na pasta do processo no Portal COMEX.',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)

    const args = mockSendMail.mock.calls[0][0]
    expect(args.to).toBe('maria@sqquimica.com')
    expect(args.subject).toBe('Conferência do Relatório de Carga - PO 12345 - Resina Atlas')
    expect(args.subject).not.toContain('[Portal COMEX]')
    expect(args.html).toContain('processos?processo=proc-1&amp;aba=documents')
    expect(args.html).toContain('alt="Conferência da Logística concluída no Relatório de Carga."')
    expect(args.html).toContain('src="cid:cargo-conference-banner@portal-comex"')
    expect(args.html).not.toContain('cargo-report-banner@portal-comex')
    expect(args.attachments).toHaveLength(1)
    expect(args.attachments[0]).toMatchObject({
      filename: 'cargo-conference-banner.jpg',
      cid: 'cargo-conference-banner@portal-comex',
      contentType: 'image/jpeg',
      contentDisposition: 'inline',
    })
    expect(args.text).toContain('Olá, Maria Souza.')
    expect(args.text).toContain('Conferência da Logística concluída no Relatório de Carga.')
    expect(args.text).toContain('Processo: PO 12345 - Resina Atlas')
    expect(args.text).toContain('https://portal-comex.com/processos?processo=proc-1&aba=documents')
  })

  // S10-J2: o e-mail aos usuários extrai a seção "Avarias e ressalvas" do `body` da notificação (sem leitura extra).
  describe('process_cargo_report_conference com avarias (S10-J2)', () => {
    const FIXED =
      'Conferência da logística concluída no Relatório de Carga. Etiquetas, contagem e dados do recebimento estão disponíveis na pasta do processo no Portal COMEX.'
    const TITLE = 'Conferência do Relatório de Carga - PO 12345 - Resina Atlas'
    const SECTION = [
      'Avarias e ressalvas: 2 itens, 3 fotos no Portal.',
      'Pallets: 23 contados de 25 informados pelo COMEX (divergente).',
      '• Item 1 · POLIOL PE-3000 · 2 fotos: Caixas molhadas no pallet 2.',
      '• Item 2 · ISOCIANATO MDI · 1 foto: Lacre <b>rompido</b>.',
    ]

    function configureSmtp() {
      setSecretValue('SMTP_HOST', 'smtp.test.com')
      setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
      setSecretValue('SMTP_PASS', 'pass')
      setupMailer()
    }

    async function sendWithBody(body) {
      configureSmtp()
      await handler(
        makeEvent({
          type: 'process_cargo_report_conference',
          recipientUserId: RECIPIENT_UID,
          processId: 'proc-1',
          title: TITLE,
          body,
        })
      )
      expect(mockSendMail).toHaveBeenCalledTimes(1)
      return mockSendMail.mock.calls[0][0]
    }

    it('body com a seção -> e-mail com a lista (html escapado e texto puro), assunto e anexo iguais', async () => {
      const args = await sendWithBody(`${FIXED}\n\n${SECTION.join('\n')}`)
      expect(args.subject).toBe(TITLE)
      expect(args.html).toContain('Avarias e ressalvas')
      expect(args.html).toContain('2 itens, 3 fotos no Portal.')
      expect(args.html).toContain('• Item 1 · POLIOL PE-3000 · 2 fotos: Caixas molhadas no pallet 2.')
      expect(args.html).toContain('Lacre &lt;b&gt;rompido&lt;/b&gt;.')
      expect(args.html).not.toContain('<b>rompido</b>')
      for (const line of SECTION) expect(args.text).toContain(line)
      // o corpo fixo longo do in-app não vai para o e-mail (texto curto do banner, decisão do Comex)
      expect(args.text).not.toContain('Etiquetas, contagem')
      expect(args.attachments).toHaveLength(1)
      expect(args.attachments[0].cid).toBe('cargo-conference-banner@portal-comex')
      // o log do trigger não carrega o texto da avaria
      expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('Caixas molhadas')
    })

    it('body de hoje (sem seção) -> e-mail igual ao de hoje, sem a seção de avarias', async () => {
      const args = await sendWithBody(FIXED)
      expect(args.html).not.toContain('Avarias e ressalvas')
      expect(args.text).not.toContain('Avarias e ressalvas')
      expect(args.text).toContain('Conferência da Logística concluída no Relatório de Carga.')
      expect(args.text).toContain('Processo: PO 12345 - Resina Atlas')
      expect(args.text).toContain('https://portal-comex.com/processos?processo=proc-1&aba=documents')
      expect(args.attachments).toHaveLength(1)
    })

    it('body com a seção e body de hoje: o HTML só difere pela seção', async () => {
      const today = await sendWithBody(FIXED)
      vi.clearAllMocks()
      const withSection = await sendWithBody(`${FIXED}\n\n${SECTION.join('\n')}`)
      expect(withSection.subject).toBe(today.subject)
      expect(withSection.html.length).toBeGreaterThan(today.html.length)
      expect(withSection.html.startsWith(today.html.slice(0, today.html.indexOf('Abrir processo no Portal COMEX')))).toBe(true)
    })
  })

  it('outro tipo de e-mail de processo -> texto puro, sem html nem anexos', async () => {
    setSecretValue('SMTP_HOST', 'smtp.test.com')
    setSecretValue('SMTP_USER', 'noreply@sqquimica.com')
    setSecretValue('SMTP_PASS', 'pass')
    setupMailer()

    await handler(
      makeEvent({
        type: 'process_question_answered',
        recipientUserId: RECIPIENT_UID,
        processId: 'proc-1',
        title: 'Sua duvida foi respondida',
        body: 'Veja os detalhes do processo PO 12345',
      })
    )
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const args = mockSendMail.mock.calls[0][0]
    expect(args.subject).toBe('[Portal COMEX] Sua duvida foi respondida')
    expect(args.html).toBeUndefined()
    expect(args.attachments).toBeUndefined()
    expect(args.text).toContain('Veja os detalhes do processo PO 12345')
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
