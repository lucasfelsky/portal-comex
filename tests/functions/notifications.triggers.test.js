// Testes REAIS das triggers de notificacao (Fluxo D da Integracao end-to-end)
// rodando contra o emulador Firestore + Functions. Complementa os testes
// unitarios mockados de tests/functions/*: aqui as functions
// createProcessMessageNotifications / createProcessUpdateNotifications rodam
// de verdade no emulador de Functions, disparadas por escritas no Firestore.
//
// Como rodar (precisa de JDK 11+ e `npm install --prefix functions`):
//   npm run test:notifications
// que sobe firestore+functions (via scripts/with-jdk.mjs) e roda este arquivo.
//
// Quando FIRESTORE_EMULATOR_HOST NAO esta setado (ex.: `npm test` normal), o
// describe inteiro e' pulado — a suite padrao continua verde sem Java.
// O filtro `vitest run emulator` do test:rules NAO casa com este arquivo
// (o caminho nao contem "emulator"), entao as duas suites nao se misturam:
// test:rules sobe so firestore+storage, esta aqui exige functions tambem.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const EMULATOR_UP = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const describeEmulator = EMULATOR_UP ? describe : describe.skip

// Primeira execucao de cada trigger no emulador tem cold start (~5-10s).
const TRIGGER_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 300

describeEmulator('triggers de notificacao (emulador functions)', () => {
  let app
  let db

  beforeAll(async () => {
    app = initializeApp({ projectId: 'demo-sqcomex' }, 'notifications-triggers-test')
    db = getFirestore(app)

    // Usuarios seedados uma vez; os testes isolam-se por processId, entao nao
    // ha clearFirestore aqui (evita corrida com triggers assincronas).
    const users = {
      'admin-1': { role: 'admin', status: 'Ativo', email: 'admin1@sqquimica.com', name: 'Admin Um' },
      'admin-bloqueado': { role: 'admin', status: 'Bloqueado', email: 'admin2@sqquimica.com', name: 'Admin Bloqueado' },
      'admin-externo': { role: 'admin', status: 'Ativo', email: 'externo@gmail.com', name: 'Admin Externo' },
      'user-1': { role: 'user', status: 'Ativo', email: 'user1@sqquimica.com', name: 'Usuario Um' },
      'log-1': { role: 'logistica', status: 'Ativo', email: 'log1@sqquimica.com', name: 'Logistica Um' },
      'fav-1': {
        role: 'user',
        status: 'Ativo',
        email: 'fav1@sqquimica.com',
        name: 'Favoritador',
        favoriteProcessIds: ['proc-msg-user', 'proc-msg-admin', 'proc-upd-admin', 'proc-upd-log'],
      },
    }
    await Promise.all(
      Object.entries(users).map(([uid, data]) => db.collection('users').doc(uid).set(data))
    )
  }, TRIGGER_TIMEOUT_MS)

  afterAll(async () => {
    if (app) await deleteApp(app)
  })

  // Espera as triggers materializarem notificacoes do processo. `expected` e'
  // o minimo de docs aguardado; retorna todos os que existirem ao estabilizar.
  async function waitForNotifications(processId, expected) {
    const deadline = Date.now() + TRIGGER_TIMEOUT_MS - 2_000
    let docs = []
    while (Date.now() < deadline) {
      const snapshot = await db.collection('notifications').where('processId', '==', processId).get()
      docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      if (docs.length >= expected) return docs
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    return docs
  }

  it(
    'mensagem de user notifica admins ativos corporativos + favoritos (nunca o autor)',
    async () => {
      const processId = 'proc-msg-user'
      await db.collection('processes').doc(processId).set({
        name: 'Processo Mensagem User',
        processNumber: 'PO-1001',
        category: 'FCL',
      })

      await db.collection('processes').doc(processId).collection('messages').add({
        authorId: 'user-1',
        authorName: 'Usuario Um',
        body: 'Tenho uma duvida sobre o processo.',
        createdAt: Timestamp.now(),
      })

      // Esperados: admin-1 (duvida) + fav-1 (favorito). Excluidos: o autor,
      // admin-bloqueado (status), admin-externo (email nao corporativo).
      const docs = await waitForNotifications(processId, 2)
      const byRecipient = new Map(docs.map((doc) => [doc.recipientUserId, doc]))

      expect(byRecipient.size).toBe(2)

      const adminNotification = byRecipient.get('admin-1')
      expect(adminNotification).toBeTruthy()
      expect(adminNotification.type).toBe('process_question_created')
      expect(adminNotification.title).toBe('Nova duvida em processo')
      expect(adminNotification.actorUserId).toBe('user-1')
      expect(adminNotification.isRead).toBe(false)

      const favoriteNotification = byRecipient.get('fav-1')
      expect(favoriteNotification).toBeTruthy()
      expect(favoriteNotification.type).toBe('favorite_process_message')

      expect(byRecipient.has('user-1')).toBe(false)
      expect(byRecipient.has('admin-bloqueado')).toBe(false)
      expect(byRecipient.has('admin-externo')).toBe(false)
    },
    TRIGGER_TIMEOUT_MS
  )

  it(
    'resposta de admin notifica o autor da duvida anterior (process_question_answered)',
    async () => {
      const processId = 'proc-msg-admin'
      await db.collection('processes').doc(processId).set({
        name: 'Processo Resposta Admin',
        processNumber: 'PO-1002',
        category: 'LCL',
      })

      const messages = db.collection('processes').doc(processId).collection('messages')
      await messages.add({
        authorId: 'user-1',
        authorName: 'Usuario Um',
        body: 'Duvida original.',
        createdAt: Timestamp.fromMillis(Date.now() - 60_000),
      })
      // Aguarda a trigger da primeira mensagem (admin-1 + fav-1) antes de
      // postar a resposta, pra nao misturar as contagens.
      await waitForNotifications(processId, 2)

      await messages.add({
        authorId: 'admin-1',
        authorName: 'Admin Um',
        body: 'Segue a resposta.',
        createdAt: Timestamp.now(),
      })

      // Novas: user-1 (resposta) + fav-1 (favorito, de novo). Total >= 4.
      const docs = await waitForNotifications(processId, 4)
      const replyNotifications = docs.filter((doc) => doc.type === 'process_question_answered')

      expect(replyNotifications).toHaveLength(1)
      expect(replyNotifications[0].recipientUserId).toBe('user-1')
      expect(replyNotifications[0].actorUserId).toBe('admin-1')
      expect(replyNotifications[0].title).toBe('Sua duvida recebeu uma resposta')
    },
    TRIGGER_TIMEOUT_MS
  )

  it(
    'update relevante por admin notifica favoritos (favorite_process_updated)',
    async () => {
      const processId = 'proc-upd-admin'
      const processRef = db.collection('processes').doc(processId)
      await processRef.set({
        name: 'Processo Update Admin',
        processNumber: 'PO-1003',
        category: 'FCL',
        eta: '2026-07-20',
      })

      await processRef.update({
        eta: '2026-07-25', // campo coberto por sanitizeProcessForComparison
        updatedById: 'admin-1',
        updatedByName: 'Admin Um',
      })

      const docs = await waitForNotifications(processId, 1)
      const updated = docs.filter((doc) => doc.type === 'favorite_process_updated')

      expect(updated).toHaveLength(1)
      expect(updated[0].recipientUserId).toBe('fav-1')
      expect(updated[0].actorUserId).toBe('admin-1')
      expect(updated[0].body).toContain('ETA atualizada')
    },
    TRIGGER_TIMEOUT_MS
  )

  it(
    'observacoes pos-recebimento por logistica notificam admins + favoritos',
    async () => {
      const processId = 'proc-upd-log'
      const processRef = db.collection('processes').doc(processId)
      await processRef.set({
        name: 'Processo Update Logistica',
        processNumber: 'PO-1004',
        category: 'AEREO',
        postReceiptNotes: '',
      })

      await processRef.update({
        postReceiptNotes: 'Carga recebida com avaria leve na embalagem.',
        updatedById: 'log-1',
        updatedByName: 'Logistica Um',
      })

      const docs = await waitForNotifications(processId, 2)
      const postReceipt = docs.filter((doc) => doc.type === 'post_receipt_notes_updated')
      const recipients = postReceipt.map((doc) => doc.recipientUserId).sort()

      expect(recipients).toEqual(['admin-1', 'fav-1'])
      postReceipt.forEach((doc) => {
        expect(doc.title).toBe('Observacoes pos-recebimento atualizadas')
        expect(doc.actorUserId).toBe('log-1')
      })
    },
    TRIGGER_TIMEOUT_MS
  )
})
