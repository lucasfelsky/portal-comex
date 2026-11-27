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

  it('F9: pref inApp=false suprime a notificacao in-app (sem batch.set)', async () => {
    setupFirestoreChain({
      users: [
        {
          id: 'user-1',
          data: {
            name: 'Joana',
            fcmTokens: ['tok-a'],
            notificationPreferences: { suporte: { inApp: false } },
          },
        },
      ],
    })

    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    expect(mockBatch.set).not.toHaveBeenCalled()
    expect(mockBatch.commit).not.toHaveBeenCalled()
    // Push segue LIGADO (canal independente).
    expect(mockMessagingApi.sendEachForMulticast).toHaveBeenCalledTimes(1)
  })

  it('F9: pref push=false suprime o push (in-app segue)', async () => {
    setupFirestoreChain({
      users: [
        {
          id: 'user-1',
          data: {
            name: 'Joana',
            fcmTokens: ['tok-a'],
            notificationPreferences: { suporte: { push: false } },
          },
        },
      ],
    })

    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockMessagingApi.sendEachForMulticast).not.toHaveBeenCalled()
  })

  it('F9: pref de OUTRA categoria nao afeta suporte (default ligado)', async () => {
    setupFirestoreChain({
      users: [
        {
          id: 'user-1',
          data: {
            name: 'Joana',
            fcmTokens: ['tok-a'],
            notificationPreferences: { noticias: { inApp: false, push: false } },
          },
        },
      ],
    })

    await handler(makeEvent(BASE_TICKET, RESOLVED_TICKET))

    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    expect(mockMessagingApi.sendEachForMulticast).toHaveBeenCalledTimes(1)
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

// Fatia D (D-28): teto do corpo do PUSH. O FCM recusa payload > ~4 KB com `messaging/invalid-argument`, código que está
// em DEAD_TOKEN_CODES (apagaria tokens VIVOS). O corpo do push sai cortado; o doc in-app segue com o texto inteiro.
describe('push FCM: teto do corpo (D-28)', () => {
  const FCM_PAYLOAD_LIMIT_BYTES = 4096
  const ticketWithResolution = (resolutionMessage) => ({ ...RESOLVED_TICKET, resolutionMessage })
  const sentBody = () => mockMessagingApi.sendEachForMulticast.mock.calls[0][0].notification.body
  const graphemeEnds = (text) => {
    const ends = new Set([0])
    for (const { index, segment } of new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(text)) {
      ends.add(index + segment.length)
    }
    return ends
  }

  // Simula o FCM: mensagem acima de 4 KB -> `messaging/invalid-argument` em todos os tokens.
  function simulateFcmSizeLimit() {
    mockMessagingApi.sendEachForMulticast.mockImplementation(async (message) => {
      const tooBig = Buffer.byteLength(JSON.stringify(message)) > FCM_PAYLOAD_LIMIT_BYTES
      const responses = message.tokens.map(() =>
        tooBig ? { success: false, error: { code: 'messaging/invalid-argument' } } : { success: true }
      )
      return { successCount: tooBig ? 0 : responses.length, failureCount: tooBig ? responses.length : 0, responses }
    })
  }

  beforeEach(() => {
    setupFirestoreChain({
      users: [{ id: 'user-1', data: { name: 'Joana', fcmTokens: ['tok-a', 'tok-b'] } }],
    })
  })

  it('corpo de 3.000 caracteres: push com no máximo 1.000 e reticências; o doc in-app guarda o corpo inteiro', async () => {
    const long = 'Contagem de pallets e lotes divergentes. '.repeat(75).trim()
    expect(long.length).toBeGreaterThan(3000)

    await handler(makeEvent(BASE_TICKET, ticketWithResolution(long)))

    const body = sentBody()
    expect(body.length).toBeLessThanOrEqual(1000)
    expect(body.endsWith('…')).toBe(true)
    const fullBody = `Seu chamado foi resolvido por Admin Root: ${long}`
    expect(fullBody.startsWith(body.slice(0, -1))).toBe(true)
    const inApp = mockBatch.set.mock.calls[0][1]
    expect(inApp.body).toBe(fullBody)
  })

  it('corpo curto (até 1.000 caracteres) segue idêntico, sem reticências', async () => {
    const short = 'x'.repeat(900)
    await handler(makeEvent(BASE_TICKET, ticketWithResolution(short)))
    expect(sentBody()).toBe(`Seu chamado foi resolvido por Admin Root: ${short}`)
    expect(sentBody().includes('…')).toBe(false)
  })

  it('o corte nunca parte emoji nem acento composto (corte por grafemas)', async () => {
    const family = '👨‍👩‍👧‍👦' // emoji ZWJ: 1 grafema, 11 unidades UTF-16
    const bodies = [
      'ação '.repeat(400), // acentos
      `${'a'.repeat(30)}${'😀'.repeat(900)}`, // pares substitutos
      'é'.repeat(800), // letra + acento combinante (NFD)
      `${family}`.repeat(300), // sequências ZWJ
    ]
    for (const text of bodies) {
      mockMessagingApi.sendEachForMulticast.mockClear()
      const full = `Seu chamado foi resolvido por Admin Root: ${text}`
      await handler(makeEvent(BASE_TICKET, ticketWithResolution(text)))
      const body = sentBody()
      const kept = body.slice(0, -1)
      expect(body.endsWith('…')).toBe(true)
      expect(body.isWellFormed()).toBe(true) // nenhum substituto solto
      expect(full.startsWith(kept.trimEnd())).toBe(true)
      expect(graphemeEnds(full).has(kept.length)).toBe(true) // termina numa fronteira de grafema
      expect(Array.from(body.slice(0, -1)).length).toBeGreaterThan(0)
    }
  })

  it('corpo cheio de emoji (4 bytes cada) fica abaixo de 3.000 bytes UTF-8', async () => {
    await handler(makeEvent(BASE_TICKET, ticketWithResolution('😀'.repeat(1500))))
    expect(Buffer.byteLength(sentBody())).toBeLessThanOrEqual(3000)
  })

  it('erro de tamanho do FCM NÃO apaga tokens vivos: o corte impede o invalid-argument por payload grande', async () => {
    const huge = 'Contagem e avarias do fechamento da conferência. '.repeat(200) // ~9,8 KB, o pior caso do aviso
    // Controle: SEM o corte, esta mensagem passaria de 4 KB e o FCM simulado devolveria invalid-argument (tokens apagados).
    const uncut = { tokens: ['tok-a', 'tok-b'], notification: { title: 'Conferência', body: huge } }
    expect(Buffer.byteLength(JSON.stringify(uncut))).toBeGreaterThan(FCM_PAYLOAD_LIMIT_BYTES)

    simulateFcmSizeLimit()
    await handler(makeEvent(BASE_TICKET, ticketWithResolution(huge)))

    expect(mockMessagingApi.sendEachForMulticast).toHaveBeenCalledTimes(1)
    const sent = mockMessagingApi.sendEachForMulticast.mock.calls[0][0]
    expect(Buffer.byteLength(JSON.stringify(sent))).toBeLessThan(FCM_PAYLOAD_LIMIT_BYTES)
    expect(mockFirestoreApi.FieldValue.arrayRemove).not.toHaveBeenCalled()
  })

  it('pior caso de bytes (emoji) também não dispara invalid-argument nem apaga tokens', async () => {
    simulateFcmSizeLimit()
    await handler(makeEvent(BASE_TICKET, ticketWithResolution('😀'.repeat(5000))))
    expect(mockFirestoreApi.FieldValue.arrayRemove).not.toHaveBeenCalled()
  })
})
