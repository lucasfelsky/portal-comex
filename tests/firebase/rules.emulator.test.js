// Testes REAIS das firestore.rules com @firebase/rules-unit-testing rodando
// contra o emulador Firestore. Complementa:
//   - rules.parse.test.js    (sintaxe via firebase deploy --dry-run)
//   - rules.structure.test.js (spec textual via regex)
// aqui validamos COMPORTAMENTO (assertSucceeds/assertFails) por role/status.
//
// Como rodar (precisa de JDK 11+ — ver RUNBOOK, secao do JDK):
//   npm run test:rules
// que sobe o emulador (via scripts/with-jdk.mjs) e roda este arquivo.
//
// Quando FIRESTORE_EMULATOR_HOST NAO esta setado (ex.: `npm test` normal, sem
// emulador), o describe inteiro e' pulado — assim a suite padrao continua
// verde sem exigir Java/emulador.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = join(HERE, '..', '..', 'firestore.rules')

// So' roda quando o emulador esta de pe (setado por `firebase emulators:exec`).
const EMULATOR_UP = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const describeEmulator = EMULATOR_UP ? describe : describe.skip

describeEmulator('firestore.rules (emulador)', () => {
  let testEnv

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-sqcomex',
      firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
    })
  })

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup()
  })

  beforeEach(async () => {
    if (testEnv) await testEnv.clearFirestore()
  })

  // --- helpers de contexto (claims = request.auth.token) ---
  const approvedUser = (uid = 'user-1', overrides = {}) =>
    testEnv
      .authenticatedContext(uid, {
        email: 'user@sqquimica.com',
        role: 'user',
        status: 'Ativo',
        name: 'Usuario Teste',
        ...overrides,
      })
      .firestore()

  const admin = (uid = 'admin-1', overrides = {}) =>
    testEnv
      .authenticatedContext(uid, {
        email: 'admin@sqquimica.com',
        role: 'admin',
        status: 'Ativo',
        name: 'Admin',
        ...overrides,
      })
      .firestore()

  const anon = () => testEnv.unauthenticatedContext().firestore()

  const seed = (fn) => testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()))

  // ----------------------------------------------------------------
  describe('anonimo', () => {
    it('nao le announcements', async () => {
      await assertFails(getDoc(doc(anon(), 'announcements/a1')))
    })
    it('nao le processes', async () => {
      await assertFails(getDoc(doc(anon(), 'processes/p1')))
    })
    it('nao escreve users', async () => {
      await assertFails(setDoc(doc(anon(), 'users/x'), { uid: 'x' }))
    })
  })

  describe('usuario aprovado (role user, Ativo, email corporativo)', () => {
    it('le conteudo geral (announcements/news/forecast/barra/externalNews/processes)', async () => {
      const db = approvedUser()
      await assertSucceeds(getDoc(doc(db, 'announcements/a1')))
      await assertSucceeds(getDoc(doc(db, 'news/n1')))
      await assertSucceeds(getDoc(doc(db, 'forecastSettings/default')))
      await assertSucceeds(getDoc(doc(db, 'barra/status')))
      await assertSucceeds(getDoc(doc(db, 'externalNews/e1')))
      await assertSucceeds(getDoc(doc(db, 'processes/p1')))
    })

    it('NAO cria/edita conteudo de admin (announcements)', async () => {
      const db = approvedUser()
      await assertFails(setDoc(doc(db, 'announcements/a1'), { title: 'x' }))
    })

    it('le o proprio user doc, mas nao o de outro', async () => {
      const db = approvedUser('user-1')
      await assertSucceeds(getDoc(doc(db, 'users/user-1')))
      await assertFails(getDoc(doc(db, 'users/outro')))
    })

    it('NAO le audits', async () => {
      await assertFails(getDoc(doc(approvedUser(), 'audits/x')))
    })

    it('NAO escreve externalNews', async () => {
      await assertFails(setDoc(doc(approvedUser(), 'externalNews/e1'), { title: 'x' }))
    })
  })

  describe('bloqueios de isApprovedUser', () => {
    it('email nao-corporativo eh bloqueado mesmo com role/status ok', async () => {
      const db = approvedUser('u-gmail', { email: 'alguem@gmail.com' })
      await assertFails(getDoc(doc(db, 'announcements/a1')))
    })

    it('status Pendente eh bloqueado', async () => {
      const db = approvedUser('u-pend', { status: 'Pendente' })
      await assertFails(getDoc(doc(db, 'announcements/a1')))
    })

    it('sem claim de role/status eh bloqueado', async () => {
      const db = testEnv
        .authenticatedContext('u-sem', { email: 'sem@sqquimica.com' })
        .firestore()
      await assertFails(getDoc(doc(db, 'announcements/a1')))
    })
  })

  describe('admin', () => {
    it('cria, edita e apaga announcement', async () => {
      const db = admin()
      await assertSucceeds(setDoc(doc(db, 'announcements/a1'), { title: 'Aviso' }))
      await assertSucceeds(updateDoc(doc(db, 'announcements/a1'), { title: 'Editado' }))
      await assertSucceeds(deleteDoc(doc(db, 'announcements/a1')))
    })

    it('le audits e cria audit', async () => {
      const db = admin()
      await assertSucceeds(getDoc(doc(db, 'audits/x')))
      await assertSucceeds(setDoc(doc(db, 'audits/x'), { action: 'test' }))
    })

    it('le qualquer user doc', async () => {
      await assertSucceeds(getDoc(doc(admin(), 'users/outro')))
    })

    it('NAO escreve externalNews (write:false vale ate pra admin)', async () => {
      await assertFails(setDoc(doc(admin(), 'externalNews/e1'), { title: 'x' }))
    })

    it('NAO edita audit ja criado (update/delete: false)', async () => {
      await seed((db) => setDoc(doc(db, 'audits/x'), { action: 'orig' }))
      await assertFails(updateDoc(doc(admin(), 'audits/x'), { action: 'novo' }))
      await assertFails(deleteDoc(doc(admin(), 'audits/x')))
    })
  })

  describe('userCredentials (server-only)', () => {
    it('ninguem le (nem admin)', async () => {
      await assertFails(getDoc(doc(admin(), 'userCredentials/user-1')))
      await assertFails(getDoc(doc(approvedUser(), 'userCredentials/user-1')))
    })
  })

  describe('notifications (dono-only)', () => {
    beforeEach(async () => {
      await seed(async (db) => {
        await setDoc(doc(db, 'notifications/own'), { recipientUserId: 'user-1', isRead: false })
        await setDoc(doc(db, 'notifications/other'), { recipientUserId: 'outro', isRead: false })
        await setDoc(doc(db, 'notifications/own-read'), { recipientUserId: 'user-1', isRead: true })
      })
    })

    it('le a propria, nao le a de outro', async () => {
      const db = approvedUser('user-1')
      await assertSucceeds(getDoc(doc(db, 'notifications/own')))
      await assertFails(getDoc(doc(db, 'notifications/other')))
    })

    it('marca a propria como lida (isRead/readAt), mas nao muda outros campos', async () => {
      const db = approvedUser('user-1')
      await assertSucceeds(updateDoc(doc(db, 'notifications/own'), { isRead: true, readAt: 'now' }))
      await assertFails(updateDoc(doc(db, 'notifications/own'), { recipientUserId: 'hacker' }))
    })

    it('so apaga a propria se ja estiver lida', async () => {
      const db = approvedUser('user-1')
      await assertFails(deleteDoc(doc(db, 'notifications/own'))) // isRead:false
      await assertSucceeds(deleteDoc(doc(db, 'notifications/own-read'))) // isRead:true
    })

    it('ninguem cria notification pelo client', async () => {
      await assertFails(setDoc(doc(approvedUser(), 'notifications/nova'), { recipientUserId: 'user-1' }))
    })
  })

  describe('users — auto-cadastro e self-update', () => {
    it('self-registration valido (role user, Pendente, warn, email casado) eh permitido', async () => {
      const db = testEnv
        .authenticatedContext('self-1', { email: 'novo@sqquimica.com' })
        .firestore()
      await assertSucceeds(
        setDoc(doc(db, 'users/self-1'), {
          uid: 'self-1',
          role: 'user',
          email: 'novo@sqquimica.com',
          status: 'Pendente',
          statusTone: 'warn',
        })
      )
    })

    it('self-registration tentando role admin eh negado', async () => {
      const db = testEnv
        .authenticatedContext('self-2', { email: 'novo2@sqquimica.com' })
        .firestore()
      await assertFails(
        setDoc(doc(db, 'users/self-2'), {
          uid: 'self-2',
          role: 'admin',
          email: 'novo2@sqquimica.com',
          status: 'Pendente',
          statusTone: 'warn',
        })
      )
    })

    it('self pode atualizar name, mas nao role/status', async () => {
      await seed((db) =>
        setDoc(doc(db, 'users/user-1'), {
          uid: 'user-1',
          role: 'user',
          status: 'Ativo',
          statusTone: 'ok',
          email: 'user@sqquimica.com',
          name: 'Antigo',
        })
      )
      const db = approvedUser('user-1')
      await assertSucceeds(updateDoc(doc(db, 'users/user-1'), { name: 'Novo Nome' }))
      await assertFails(updateDoc(doc(db, 'users/user-1'), { role: 'admin' }))
      await assertFails(updateDoc(doc(db, 'users/user-1'), { status: 'Ativo', role: 'admin' }))
    })
  })

  describe('processes — create/update por role', () => {
    it('admin cria com updatedById/Name corretos', async () => {
      const db = admin('admin-1')
      await assertSucceeds(
        setDoc(doc(db, 'processes/p1'), {
          name: 'Processo',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria com updatedById de outro', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p2'), {
          name: 'Processo',
          updatedById: 'outro',
          updatedByName: 'Admin',
        })
      )
    })

    it('usuario comum NAO cria processo', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'processes/p3'), {
          name: 'Processo',
          updatedById: 'user-1',
          updatedByName: 'Usuario Teste',
        })
      )
    })
  })

  describe('messages (subcollection)', () => {
    it('usuario aprovado cria mensagem com autor casado', async () => {
      const db = approvedUser('user-1')
      await assertSucceeds(
        setDoc(doc(db, 'processes/p1/messages/m1'), {
          processId: 'p1',
          content: 'Ola',
          authorId: 'user-1',
          authorEmail: 'user@sqquimica.com',
          authorName: 'Usuario Teste',
        })
      )
    })

    it('nega mensagem com authorId falsificado', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'processes/p1/messages/m2'), {
          processId: 'p1',
          content: 'Ola',
          authorId: 'outro',
          authorEmail: 'user@sqquimica.com',
          authorName: 'Usuario Teste',
        })
      )
    })
  })

  describe('catch-all', () => {
    it('colecao desconhecida eh negada ate pra admin', async () => {
      await assertFails(getDoc(doc(admin(), 'colecaoAleatoria/x')))
      await assertFails(setDoc(doc(admin(), 'colecaoAleatoria/x'), { a: 1 }))
    })
  })
})
