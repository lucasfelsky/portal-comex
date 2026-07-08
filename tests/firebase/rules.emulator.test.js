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

  const logistics = (uid = 'log-1', overrides = {}) =>
    testEnv
      .authenticatedContext(uid, {
        email: 'log@sqquimica.com',
        role: 'logistica',
        status: 'Ativo',
        name: 'Logistica',
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

    it('admin cria user doc de outro', async () => {
      await assertSucceeds(
        setDoc(doc(admin('admin-1'), 'users/novo'), {
          uid: 'novo',
          role: 'user',
          status: 'Ativo',
          statusTone: 'ok',
          email: 'novo@sqquimica.com',
          name: 'Novo',
        })
      )
    })

    it('admin apaga user; o proprio usuario NAO se apaga', async () => {
      await seed((db) => setDoc(doc(db, 'users/alvo'), { uid: 'alvo', role: 'user' }))
      await assertFails(deleteDoc(doc(approvedUser('alvo'), 'users/alvo')))
      await assertSucceeds(deleteDoc(doc(admin('admin-1'), 'users/alvo')))
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

    it('admin atualiza processo (updatedById/Name corretos)', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1'), { name: 'Orig', updatedById: 'x', updatedByName: 'y' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p1'), { name: 'Editado', updatedById: 'admin-1', updatedByName: 'Admin' })
      )
    })

    it('admin apaga processo; logistica e usuario comum NAO', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1'), { name: 'Orig' }))
      await assertSucceeds(deleteDoc(doc(admin('admin-1'), 'processes/p1')))
      await seed((db) => setDoc(doc(db, 'processes/p1'), { name: 'Orig' }))
      await assertFails(deleteDoc(doc(logistics('log-1'), 'processes/p1')))
      await assertFails(deleteDoc(doc(approvedUser('user-1'), 'processes/p1')))
    })
  })

  describe('processes — atualizacao por logistica (ramos especificos)', () => {
    // post-receipt: logistica so' mexe em postReceiptNotes/postReceiptImages (+ updatedAt/By).
    it('logistica faz update de pos-recebimento valido', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/pr1'), { name: 'P', postReceiptNotes: '', updatedById: 'x', updatedByName: 'y' })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/pr1'), {
          postReceiptNotes: 'Recebido ok',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO altera campo fora da whitelist de pos-recebimento', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/pr2'), { name: 'P', postReceiptNotes: '', updatedById: 'x', updatedByName: 'y' })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/pr2'), {
          name: 'Renomeado', // fora da whitelist
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO faz update com updatedByName != myName()', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/pr3'), { name: 'P', postReceiptNotes: '', updatedById: 'x', updatedByName: 'y' })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/pr3'), {
          postReceiptNotes: 'x',
          updatedById: 'log-1',
          updatedByName: 'Outro Nome',
        })
      )
    })

    // collection-status: exige coleta agendada (collectionScheduledAt + status agendado)
    // e transicao para um status pos-coleta, mexendo so' em collectionStatus (+ updatedAt/By).
    it('logistica avanca collectionStatus quando ha coleta agendada', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/cs1'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/cs1'), {
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO avanca collectionStatus sem coleta agendada', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/cs2'), {
          name: 'P',
          collectionStatus: 'Coleta Agendada', // sem collectionScheduledAt
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/cs2'), {
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // Regressao (bug de prod 2026-07-06): processo em status de fluxo do CD que
    // o antigo isScheduledCollectionStatus (lista hardcoded) NAO conhecia
    // ('Carga sendo descarregada no CD', 'Carga a caminho do CD') fazia o
    // hasScheduledCollection() falhar -> logistica travada com permission-denied
    // ao salvar o status pos-coleta. A regra passou a exigir so' que exista uma
    // coleta agendada (collectionScheduledAt), sem allowlist de status atual.
    for (const currentStatus of [
      'Carga sendo descarregada no CD',
      'Carga a caminho do CD',
      'Veículo no CD para descarga',
    ]) {
      it(`logistica avanca a partir de "${currentStatus}" (tinha coleta agendada)`, async () => {
        await seed((db) =>
          setDoc(doc(db, 'processes/cs-flow'), {
            name: 'P',
            collectionScheduledAt: '2026-06-30T23:59',
            collectionStatus: currentStatus,
            updatedById: 'x',
            updatedByName: 'y',
          })
        )
        const db = logistics('log-1')
        await assertSucceeds(
          updateDoc(doc(db, 'processes/cs-flow'), {
            collectionStatus: 'Carga disponível em estoque',
            updatedAt: 'now',
            updatedById: 'log-1',
            updatedByName: 'Logistica',
          })
        )
      })
    }

    it('logistica NAO avanca pra status que nao e pos-coleta', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/cs3'), {
          name: 'P',
          collectionScheduledAt: '2026-06-30T23:59',
          collectionStatus: 'Veículo no CD para descarga',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/cs3'), {
          collectionStatus: 'Coleta Agendada', // nao e' pos-coleta
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // Regressao (2o bug de prod, 2026-07-08): a allowlist de DESTINO
    // (isPostCollectionStatus) so aceitava 3 status ('Carga em
    // Conferencia/Etiquetagem', 'Carga em processo de Entrada', 'Carga
    // disponivel em estoque'). Quando a logistica tentava avancar para
    // qualquer um dos status intermediarios do fluxo do CD ('Carga a caminho
    // do CD', 'Veiculo no CD para descarga', 'Carga sendo descarregada no
    // CD'), a rule negava com permission-denied. A regra agora aceita
    // qualquer status de destino desde que NAO seja pre-coleta (i.e. NAO
    // pode voltar para 'Coleta Agendada' ou anterior) — o mesmo padrao de
    // invariante estrutural aplicado em hasScheduledCollection().
    for (const targetStatus of [
      'Carga a caminho do CD',
      'Veículo no CD para descarga',
      'Carga sendo descarregada no CD',
    ]) {
      it(`logistica avanca para status intermediario "${targetStatus}" (com coleta agendada)`, async () => {
        await seed((db) =>
          setDoc(doc(db, 'processes/cs-target'), {
            name: 'P',
            collectionScheduledAt: '2026-07-08T10:00',
            collectionStatus: 'Coleta Agendada',
            updatedById: 'x',
            updatedByName: 'y',
          })
        )
        const db = logistics('log-1')
        await assertSucceeds(
          updateDoc(doc(db, 'processes/cs-target'), {
            collectionStatus: targetStatus,
            updatedAt: 'now',
            updatedById: 'log-1',
            updatedByName: 'Logistica',
          })
        )
      })
    }

    for (const preCollectionStatus of [
      'Aguardando agendamento de coleta',
      'Coleta Agendada',
    ]) {
      it(`logistica NAO volta para status pre-coleta "${preCollectionStatus}"`, async () => {
        await seed((db) =>
          setDoc(doc(db, 'processes/cs-back'), {
            name: 'P',
            collectionScheduledAt: '2026-07-08T10:00',
            collectionStatus: 'Carga em Conferência/Etiquetagem', // ja' em pos-coleta
            updatedById: 'x',
            updatedByName: 'y',
          })
        )
        const db = logistics('log-1')
        await assertFails(
          updateDoc(doc(db, 'processes/cs-back'), {
            collectionStatus: preCollectionStatus, // tentando voltar atras
            updatedAt: 'now',
            updatedById: 'log-1',
            updatedByName: 'Logistica',
          })
        )
      })
    }
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

    it('usuario aprovado le mensagem', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/messages/m1'), { content: 'oi', authorId: 'x' }))
      await assertSucceeds(getDoc(doc(approvedUser('user-1'), 'processes/p1/messages/m1')))
    })

    it('mensagem e imutavel (update: false ate pra admin)', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/messages/m1'), { content: 'oi', authorId: 'x' }))
      await assertFails(updateDoc(doc(admin(), 'processes/p1/messages/m1'), { content: 'editado' }))
    })

    it('admin apaga mensagem; usuario comum NAO', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/messages/m1'), { content: 'oi', authorId: 'x' }))
      await assertFails(deleteDoc(doc(approvedUser('user-1'), 'processes/p1/messages/m1')))
      await assertSucceeds(deleteDoc(doc(admin('admin-1'), 'processes/p1/messages/m1')))
    })
  })

  describe('colecoes admin-only (forecastSettings / news / barra)', () => {
    for (const col of ['forecastSettings', 'news', 'barra']) {
      it(`${col}: usuario aprovado le, mas nao escreve; admin escreve`, async () => {
        await assertSucceeds(getDoc(doc(approvedUser(), `${col}/x`)))
        await assertFails(setDoc(doc(approvedUser(), `${col}/x`), { a: 1 }))
        await assertSucceeds(setDoc(doc(admin(), `${col}/x`), { a: 1 }))
      })
    }
  })

  describe('isAdmin — defense-in-depth (claim de role admin nao basta)', () => {
    it('claim role=admin com email nao-corporativo NAO eh admin', async () => {
      const db = admin('fake-admin', { email: 'admin@gmail.com' })
      await assertFails(setDoc(doc(db, 'announcements/a1'), { title: 'x' }))
      await assertFails(getDoc(doc(db, 'audits/x')))
    })

    it('claim role=admin com status Pendente NAO eh admin', async () => {
      const db = admin('fake-admin', { status: 'Pendente' })
      await assertFails(setDoc(doc(db, 'announcements/a1'), { title: 'x' }))
    })
  })

  describe('hasActiveStatus — regex de status', () => {
    it('aceita ATIVO em maiuscula (case-insensitive)', async () => {
      const db = approvedUser('u-caps', { status: 'ATIVO' })
      await assertSucceeds(getDoc(doc(db, 'announcements/a1')))
    })

    it('rejeita status parecido mas diferente (Ativado)', async () => {
      const db = approvedUser('u-ativado', { status: 'Ativado' })
      await assertFails(getDoc(doc(db, 'announcements/a1')))
    })
  })

  describe('isSelfRegistration — condicao a condicao', () => {
    const ctxFor = (uid, email) =>
      testEnv.authenticatedContext(uid, { email }).firestore()

    const base = (uid, email, overrides = {}) => ({
      uid,
      role: 'user',
      email,
      status: 'Pendente',
      statusTone: 'warn',
      ...overrides,
    })

    it('nega quando o email do doc != email do token', async () => {
      const db = ctxFor('s1', 's1@sqquimica.com')
      await assertFails(setDoc(doc(db, 'users/s1'), base('s1', 'outro@sqquimica.com')))
    })

    it('nega quando status != Pendente', async () => {
      const db = ctxFor('s2', 's2@sqquimica.com')
      await assertFails(setDoc(doc(db, 'users/s2'), base('s2', 's2@sqquimica.com', { status: 'Ativo' })))
    })

    it('nega quando statusTone != warn', async () => {
      const db = ctxFor('s3', 's3@sqquimica.com')
      await assertFails(setDoc(doc(db, 'users/s3'), base('s3', 's3@sqquimica.com', { statusTone: 'ok' })))
    })

    it('nega auto-cadastro com email nao-corporativo', async () => {
      const db = ctxFor('s4', 's4@gmail.com')
      await assertFails(setDoc(doc(db, 'users/s4'), base('s4', 's4@gmail.com')))
    })
  })

  describe('isAllowedSelfUserUpdate — whitelist de campos', () => {
    beforeEach(async () => {
      await seed((db) =>
        setDoc(doc(db, 'users/user-1'), {
          uid: 'user-1',
          role: 'user',
          status: 'Ativo',
          statusTone: 'ok',
          email: 'user@sqquimica.com',
          name: 'Nome',
          area: 'COMEX',
          favoriteProcessIds: [],
        })
      )
    })

    it('permite atualizar area e favoriteProcessIds', async () => {
      const db = approvedUser('user-1')
      await assertSucceeds(updateDoc(doc(db, 'users/user-1'), { area: 'Logistica' }))
      await assertSucceeds(updateDoc(doc(db, 'users/user-1'), { favoriteProcessIds: ['p1', 'p2'] }))
    })

    it('nega mudar o proprio email', async () => {
      const db = approvedUser('user-1')
      await assertFails(updateDoc(doc(db, 'users/user-1'), { email: 'novo@sqquimica.com' }))
    })

    it('nega escrever campo fora da whitelist', async () => {
      const db = approvedUser('user-1')
      await assertFails(updateDoc(doc(db, 'users/user-1'), { hacked: true }))
    })

    it('nega atualizar user doc de outra pessoa', async () => {
      await seed((db) => setDoc(doc(db, 'users/outro'), { uid: 'outro', role: 'user', name: 'X' }))
      const db = approvedUser('user-1')
      await assertFails(updateDoc(doc(db, 'users/outro'), { name: 'Invadido' }))
    })
  })

  describe('notifications — nao-dono', () => {
    it('nao atualiza notificacao de outro usuario', async () => {
      await seed((db) => setDoc(doc(db, 'notifications/x'), { recipientUserId: 'outro', isRead: false }))
      const db = approvedUser('user-1')
      await assertFails(updateDoc(doc(db, 'notifications/x'), { isRead: true }))
    })
  })

  describe('messages — validacao de campos', () => {
    it('nega mensagem com content vazio', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'processes/p1/messages/mc'), {
          processId: 'p1',
          content: '',
          authorId: 'user-1',
          authorEmail: 'user@sqquimica.com',
          authorName: 'Usuario Teste',
        })
      )
    })

    it('nega mensagem com processId divergente do path', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'processes/p1/messages/mp'), {
          processId: 'OUTRO',
          content: 'oi',
          authorId: 'user-1',
          authorEmail: 'user@sqquimica.com',
          authorName: 'Usuario Teste',
        })
      )
    })

    it('nega mensagem com authorEmail divergente do token', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'processes/p1/messages/me'), {
          processId: 'p1',
          content: 'oi',
          authorId: 'user-1',
          authorEmail: 'falso@sqquimica.com',
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
