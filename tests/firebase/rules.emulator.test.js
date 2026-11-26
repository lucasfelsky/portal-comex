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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

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

  describe('externalNewsDlq (DLQ do RSS sync — read admin-only)', () => {
    it('admin le a DLQ', async () => {
      await assertSucceeds(getDoc(doc(admin(), 'externalNewsDlq/d1')))
    })

    it('user aprovado e logistica NAO leem a DLQ', async () => {
      await assertFails(getDoc(doc(approvedUser(), 'externalNewsDlq/d1')))
      await assertFails(getDoc(doc(logistics(), 'externalNewsDlq/d1')))
    })

    it('anonimo NAO le a DLQ', async () => {
      await assertFails(getDoc(doc(anon(), 'externalNewsDlq/d1')))
    })

    it('write fechado ate pra admin (so a service account do sync grava)', async () => {
      await assertFails(setDoc(doc(admin(), 'externalNewsDlq/d1'), { stage: 'fetch-feed' }))
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

    it('self adiciona/remove fcmTokens (F6), com teto de 10', async () => {
      await seed((db) =>
        setDoc(doc(db, 'users/user-1'), {
          uid: 'user-1',
          name: 'Usuario Teste',
          email: 'user@sqquimica.com',
          role: 'user',
          status: 'Ativo',
          statusTone: 'ok',
          fcmTokens: [],
        })
      )
      const db = approvedUser('user-1')
      await assertSucceeds(
        updateDoc(doc(db, 'users/user-1'), { fcmTokens: ['tok-1', 'tok-2'] })
      )
      // Acima do teto de 10: negado.
      await assertFails(
        updateDoc(doc(db, 'users/user-1'), {
          fcmTokens: Array.from({ length: 11 }, (_, i) => `tok-${i}`),
        })
      )
      // Tipo errado: negado.
      await assertFails(updateDoc(doc(db, 'users/user-1'), { fcmTokens: 'nao-e-lista' }))
    })

    it('self salva notificationPreferences (F9); tipo errado negado', async () => {
      await seed((db) =>
        setDoc(doc(db, 'users/user-1'), {
          uid: 'user-1',
          name: 'Usuario Teste',
          email: 'user@sqquimica.com',
          role: 'user',
          status: 'Ativo',
          statusTone: 'ok',
        })
      )
      const db = approvedUser('user-1')
      await assertSucceeds(
        updateDoc(doc(db, 'users/user-1'), {
          notificationPreferences: { noticias: { email: false } },
        })
      )
      await assertFails(
        updateDoc(doc(db, 'users/user-1'), { notificationPreferences: 'nao-e-mapa' })
      )
    })

    it('outro usuario NAO mexe nos fcmTokens de alguem', async () => {
      await seed((db) =>
        setDoc(doc(db, 'users/user-1'), {
          uid: 'user-1',
          name: 'Usuario Teste',
          email: 'user@sqquimica.com',
          role: 'user',
          status: 'Ativo',
          statusTone: 'ok',
          fcmTokens: [],
        })
      )
      const outro = approvedUser('user-2', { email: 'u2@sqquimica.com' })
      await assertFails(updateDoc(doc(outro, 'users/user-1'), { fcmTokens: ['tok-x'] }))
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

    // Fix admin-user-edit-permission-denied: documenta o invariante em que o
    // fix se apoia (a rule `isAdminUserFieldsUpdate` NAO muda). O `setDoc`
    // amplo que o cliente disparava no caminho admin (name/area) e' o que
    // causava permission-denied quando o doc-alvo divergia da allowlist —
    // o fix passa a usar SOMENTE o callable `adminUpdateUserClaims` (Admin
    // SDK, ignora rules) para esse caminho.
    it('admin setDoc merge amplo (name/area) sobre doc que so tem uid/role eh negado (bug que o fix elimina)', async () => {
      await seed((db) => setDoc(doc(db, 'users/alvo-legado'), { uid: 'alvo-legado', role: 'user' }))
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'users/alvo-legado'),
          { name: 'Novo Nome', area: 'Compras' },
          { merge: true }
        )
      )
    })

    it('admin updateDoc so com a allowlist (role/status/statusTone/updatedAt/updatedById/updatedByName) eh permitido', async () => {
      await seed((db) =>
        setDoc(doc(db, 'users/alvo-allowlist'), {
          uid: 'alvo-allowlist',
          role: 'user',
          status: 'Pendente',
          statusTone: 'warn',
          email: 'alvo-allowlist@sqquimica.com',
          name: 'Alvo',
        })
      )
      await assertSucceeds(
        updateDoc(doc(admin('admin-1'), 'users/alvo-allowlist'), {
          role: 'logistica',
          status: 'Ativo',
          statusTone: 'ok',
          updatedAt: serverTimestamp(),
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
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

    // PR #2 do backlog (auditoria preventiva de drift): harden admin
    // create/update em processes com hasOnly dos 32 campos reais.
    it('admin NAO cria processo com campo fora da allowlist', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p4'), {
          name: 'P',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
          forbiddenField: 'qualquer',
        })
      )
    })

    it('admin NAO atualiza processo com campo fora da allowlist', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p5'), { name: 'Orig' }))
      const db = admin('admin-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p5'), {
          name: 'Editado',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
          forbiddenField: 'qualquer',
        })
      )
    })

    // F18b-1 (B1): `documentIndex` e' gravado SO' pelo trigger
    // `syncProcessDocumentIndex` (Admin SDK ignora rules) - o cliente NUNCA
    // pode gravar essa chave, nem admin nem logistica.
    it('admin NAO atualiza processo com documentIndex no payload', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p-doc-idx-1'), { name: 'Orig' }))
      const db = admin('admin-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p-doc-idx-1'), {
          name: 'Editado',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
          documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [] },
        })
      )
    })

    it('logistica NAO atualiza processo com documentIndex no payload', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/p-doc-idx-2'), {
          name: 'Orig',
          category: 'FCL',
          postReceiptNotes: '',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p-doc-idx-2'), {
          updatedById: 'log-1',
          updatedByName: 'Logi',
          postReceiptNotes: 'Carga descarregada',
          documentIndex: { fispqItemIds: [], containerWashIds: ['CNT-1'] },
        })
      )
    })

    it('admin cria processo com todos os 78 campos validos (F17.2a/F17.2b/F17.2c/F17.3a/F17.3b/F17.2d-1)', async () => {
      const db = admin('admin-1')
      await assertSucceeds(
        setDoc(doc(db, 'processes/p6'), {
          name: 'P completo',
          category: 'FCL',
          processNumber: 'PO-9999',
          destination: 'Itajai',
          etd: '2026-08-01',
          eta: '2026-08-20',
          etaOriginal: '2026-08-20',
          processStatus: 'Embarcado',
          containerQuantity: 1,
          palletQuantity: 10,
          processNotes: 'notas',
          warehouseDeliveryDateOverride: '',
          postReceiptNotes: '',
          postReceiptImages: [],
          cargoReceivedAt: '',
          items: [],
          berthed: false,
          arrived: false,
          cargoPresenceInformed: false,
          duimpStatus: '',
          parameterizationChannel: '',
          collectionStatus: '',
          collectionScheduledAt: '',
          collectionWindows: [],
          mapaStatus: '',
          mapaInspectionScheduledAt: '',
          dtaStatus: '',
          dtaLoadingScheduledAt: '',
          dtaArrivalAtItajai: '',
          // F17.2a (D-1/D-10): 22 campos novos.
          supplierName: 'Fornecedor Atlas',
          originLocation: 'Hamburgo',
          incoterm: 'FOB',
          forwarderName: 'Agente XPTO',
          unNumber: '',
          imoClass: '',
          shippedAt: '',
          vesselName: '',
          voyage: '',
          vesselImo: '',
          flightNumber: '',
          masterBl: '',
          houseBl: '',
          mawb: '',
          hawb: '',
          transshipmentPort: '',
          // F17.2d-1 (D-8, Q3): ETD do transbordo.
          transshipmentEtd: '',
          dangerousGoods: false,
          transshipment: false,
          grossWeightKg: 0,
          volumeM3: 0,
          chargeableWeightKg: 0,
          packagesQuantity: 0,
          containers: [],
          // F17.2b (D-1/D-12): campo novo.
          licenses: [],
          // F17.2c: campo novo.
          purchaseOrders: [],
          // F17.3a (D-9): 9 campos novos.
          berthedAt: '',
          arrivedAt: '',
          ceMercante: '',
          ceHouse: '',
          terminalName: '',
          freeTimeDays: 0,
          demurrageDailyRateUsd: 0,
          cargoPresenceInformedAt: '',
          migratedApproxFields: [],
          // F17.3b: DUIMP completa, conferencia, exigencia (6 campos novos).
          duimpNumber: '',
          duimpRegisteredAt: '',
          parameterizedAt: '',
          customsInspectionScheduledAt: '',
          customsRequirement: false,
          customsRequirementNotes: '',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
          updatedAt: new Date(),
        })
      )
    })

    // F17.3a (D-9): chegada com data, CE/terminal, free time, presenca.
    it('admin atualiza berthedAt + ceMercante + freeTimeDays', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p24'), { name: 'Orig', category: 'FCL' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p24'), {
          berthedAt: '2026-09-20T10:00',
          ceMercante: 'CE-1',
          freeTimeDays: 7,
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com 11 migratedApproxFields', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p25'), {
          name: 'P',
          migratedApproxFields: Array.from({ length: 11 }, (_, index) => `campo-${index}`),
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com migratedApproxFields fora do shape (nao-list)', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p26'), {
          name: 'P',
          migratedApproxFields: 'x',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO atualiza berthedAt', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p27'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p27'), {
          berthedAt: '2026-09-20T10:00',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO atualiza cargoPresenceInformedAt', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p28'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p28'), {
          cargoPresenceInformedAt: '2026-09-20T10:00',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO atualiza freeTimeDays', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p29'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p29'), {
          freeTimeDays: 7,
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.3b (D-9): DUIMP completa, conferencia, exigencia.
    it('admin atualiza duimpNumber + parameterizedAt + customsRequirement', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p30'), { name: 'Orig', category: 'FCL' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p30'), {
          duimpNumber: 'DU-2026-001',
          parameterizedAt: '2026-09-20T10:00',
          customsRequirement: true,
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO atualiza duimpNumber', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p31'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p31'), {
          duimpNumber: 'DU-2026-001',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO atualiza parameterizedAt', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p32'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p32'), {
          parameterizedAt: '2026-09-20T10:00',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO atualiza customsRequirementNotes', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p33'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p33'), {
          customsRequirementNotes: 'nota',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.2b (D-12): casos de `licenses[]`.
    it('admin atualiza licenses (2 itens)', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p20'), { name: 'Orig', category: 'FCL' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p20'), {
          licenses: [
            { id: 'LIC-1', agency: 'MAPA', lpcoNumber: '', status: 'Em análise', inspectionScheduledAt: '', deferredAt: '', notes: '' },
            { id: 'LIC-2', agency: 'ANVISA', lpcoNumber: '', status: 'Aguardando registro', inspectionScheduledAt: '', deferredAt: '', notes: '' },
          ],
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com 11 licenses', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p21'), {
          name: 'P',
          licenses: Array.from({ length: 11 }, (_, index) => ({ id: `LIC-${index + 1}` })),
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com licenses fora do shape (nao-list)', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p22'), {
          name: 'P',
          licenses: 'x',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO atualiza licenses', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p23'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p23'), {
          licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Deferida' }],
        })
      )
    })

    it('admin grava mapaStatus vazio (compat de 1 release)', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p24'), { name: 'Orig', category: 'FCL' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p24'), {
          mapaStatus: '',
          mapaInspectionScheduledAt: '',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    // F17.2c (D-8): casos de `purchaseOrders[]`.
    it('admin atualiza purchaseOrders com 2 POs', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p25'), { name: 'Orig', category: 'CONSOLIDADO' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p25'), {
          purchaseOrders: ['PO-A', 'PO-B'],
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com 51 purchaseOrders', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p26'), {
          name: 'P',
          purchaseOrders: Array.from({ length: 51 }, (_, index) => `PO-${index + 1}`),
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com purchaseOrders fora do shape (nao-list)', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p27'), {
          name: 'P',
          purchaseOrders: 'x',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO atualiza purchaseOrders', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p28'), { name: 'Orig', category: 'CONSOLIDADO' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p28'), {
          purchaseOrders: ['PO-A'],
        })
      )
    })

    // F17.2d-2 (D-2, Q6): purchaseOrders vira objetos { po, reference, supplierName }.
    it('admin atualiza purchaseOrders com objetos { po, reference, supplierName }', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p30'), { name: 'Orig', category: 'CONSOLIDADO' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p30'), {
          purchaseOrders: [
            { po: 'PO-A', reference: 'REF-1', supplierName: 'ACME' },
            { po: 'PO-B', reference: '', supplierName: '' },
          ],
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com 51 objetos purchaseOrders', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p31'), {
          name: 'P',
          purchaseOrders: Array.from({ length: 51 }, (_, index) => ({
            po: `PO-${index + 1}`,
            reference: '',
            supplierName: '',
          })),
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO atualiza purchaseOrders de objetos', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p32'), { name: 'Orig', category: 'CONSOLIDADO' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p32'), {
          purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: '' }],
        })
      )
    })

    // F17.2d-2 (D-11, Q7): logistica avanca collectionStatus num processo com
    // 2 janelas por container (uma por containerId), ordenadas por horario.
    it('logistica avanca com 2 janelas por container (containerId, ordenadas por horario)', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/p33'), {
          name: 'P',
          category: 'FCL',
          collectionWindows: [
            {
              id: 'WIN-1',
              containerNumber: 1,
              containerId: 'CNT-1',
              scheduledAt: '2026-07-08T09:00:00.000Z',
              notes: '',
            },
            {
              id: 'WIN-2',
              containerNumber: 2,
              containerId: 'CNT-2',
              scheduledAt: '2026-07-08T10:00:00.000Z',
              notes: '',
            },
          ],
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p33'), {
          collectionStatus: 'Carga disponível em estoque',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.2c (D-8): `containerId` nas janelas nao quebra `hasScheduledCollection`
    // (sem validacao de shape de `collectionWindows`).
    it('logistica avanca collectionStatus num processo cujas janelas tem containerId', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/p29'), {
          name: 'P',
          collectionWindows: [
            {
              id: 'WIN-1',
              containerNumber: 1,
              containerId: 'CNT-1',
              scheduledAt: '2026-07-08T10:00:00.000Z',
              notes: '',
            },
          ],
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p29'), {
          collectionStatus: 'Carga disponível em estoque',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.2a (D-10): admin atualiza shippedAt/containers/masterBl (embarque
    // e transito) - continua succeeds.
    it('admin atualiza shippedAt + containers (2 itens) + masterBl', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p15'), { name: 'Orig', category: 'FCL' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p15'), {
          shippedAt: '2026-09-20',
          masterBl: 'MBL-123',
          containers: [
            { id: 'CNT-1', number: 'CSQU3054383', seal: 'LACRE-1', type: '40DC' },
            { id: 'CNT-2', number: 'CSQU3054384', seal: 'LACRE-2', type: '40DC' },
          ],
          updatedById: 'admin-1',
          updatedByName: 'Admin',
          updatedAt: new Date(),
        })
      )
    })

    it('admin NAO cria processo com containers acima do limite (41)', async () => {
      const containers = Array.from({ length: 41 }, (_, idx) => ({
        id: `CNT-${idx + 1}`,
        number: '',
        seal: '',
        type: '',
      }))
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p16'), {
          name: 'P',
          category: 'FCL',
          containers,
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com containers como string', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p17'), {
          name: 'P',
          category: 'FCL',
          containers: 'x',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO atualiza shippedAt', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p18'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p18'), {
          shippedAt: '2026-09-20',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // IMO do navio (rastreio): admin-only, string de 7 digitos ou ''.
    it('admin atualiza vesselImo valido e vazio', async () => {
      await seed((db) => setDoc(doc(db, 'processes/pimo1'), { name: 'Orig', category: 'FCL' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/pimo1'), {
          vesselImo: '9787027',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
      await assertSucceeds(
        updateDoc(doc(db, 'processes/pimo1'), {
          vesselImo: '',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO grava vesselImo fora do formato (6 digitos, prefixo IMO, numero)', async () => {
      await seed((db) => setDoc(doc(db, 'processes/pimo2'), { name: 'Orig', category: 'FCL' }))
      const db = admin('admin-1')
      for (const value of ['978702', 'IMO 9787027', 9787027]) {
        await assertFails(
          updateDoc(doc(db, 'processes/pimo2'), {
            vesselImo: value,
            updatedById: 'admin-1',
            updatedByName: 'Admin',
          })
        )
      }
    })

    it('logistica NAO atualiza vesselImo', async () => {
      await seed((db) => setDoc(doc(db, 'processes/pimo3'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/pimo3'), {
          vesselImo: '9787027',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.2d-1 (D-8, Q3): ETD do transbordo - admin-only, mesma allowlist.
    it('logistica NAO atualiza transshipmentEtd', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p18b'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p18b'), {
          transshipmentEtd: '2026-09-20',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO atualiza containers', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p19'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p19'), {
          containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: '', type: '' }],
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO atualiza supplierName', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p20'), { name: 'Orig', category: 'FCL' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p20'), {
          supplierName: 'Fornecedor X',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // PR #3 do backlog (auditoria preventiva de drift, 2026-07-08):
    // valida SHAPE e TAMANHO de postReceiptImages em admin.
    it('admin NAO cria processo com postReceiptImages acima do limite (11)', async () => {
      const images = Array.from({ length: 11 }, (_, idx) => ({
        id: `img-${idx}`,
        url: `https://example.com/img-${idx}.jpg`,
        name: `foto-${idx}.jpg`,
        mimeType: 'image/jpeg',
      }))
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p7'), {
          name: 'P',
          postReceiptNotes: '',
          postReceiptImages: images,
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO cria processo com postReceiptImages como string', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'processes/p8'), {
          name: 'P',
          postReceiptNotes: '',
          postReceiptImages: 'nao-eh-list',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    // F16.8 (swipe-to-arquivar, admin-only): archived/archivedAt/archivedBy
    // sao' aditivos na allowlist de isAdminProcessFields(); logistica e
    // usuario comum tem suas proprias allowlists (isLogisticsPostReceiptUpdate,
    // isLogisticsCollectionStatusUpdate) que NAO incluem esses 3 campos.
    it('admin arquiva processo (archived/archivedAt/archivedBy)', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p9'), { name: 'Orig' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p9'), {
          archived: true,
          archivedAt: new Date(),
          archivedBy: 'Admin',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
          updatedAt: new Date(),
        })
      )
    })

    it('admin restaura processo (archived: false)', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/p10'), {
          name: 'Orig',
          archived: true,
          archivedAt: new Date(),
          archivedBy: 'Admin',
        })
      )
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p10'), {
          archived: false,
          archivedAt: null,
          archivedBy: '',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
          updatedAt: new Date(),
        })
      )
    })

    it('logistica NAO arquiva processo', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p11'), { name: 'Orig' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p11'), {
          archived: true,
          archivedAt: new Date(),
          archivedBy: 'Logistica',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
          updatedAt: new Date(),
        })
      )
    })

    it('usuario comum NAO arquiva processo', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p12'), { name: 'Orig' }))
      const db = approvedUser('user-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p12'), {
          archived: true,
          archivedAt: new Date(),
          archivedBy: 'Usuario',
          updatedById: 'user-1',
          updatedByName: 'Usuario',
          updatedAt: new Date(),
        })
      )
    })

    // PLAN.md — campo transportadora no fluxo de coleta: carrierName entra
    // na allowlist de isAdminProcessFields() (admin-only). Logistica nao'
    // esta' listada em isLogisticsPostReceiptUpdate nem em
    // isLogisticsCollectionStatusUpdate, logo fica sem poder gravar.
    it('admin atualiza carrierName', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p13'), { name: 'Orig', collectionStatus: 'Coleta Agendada' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/p13'), {
          carrierName: 'Rapido Sul',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO atualiza carrierName', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p14'), { name: 'Orig', collectionStatus: 'Coleta Agendada' }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/p14'), {
          carrierName: 'Rapido Sul',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })
  })

  describe('processes — atualizacao por logistica (ramos especificos)', () => {
    // post-receipt: logistica so' mexe em postReceiptNotes/postReceiptImages (+ updatedAt/By).
    it('logistica faz update de pos-recebimento valido', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/pr1'), {
          name: 'P',
          postReceiptNotes: '',
          postReceiptImages: [],
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/pr1'), {
          postReceiptNotes: 'Recebido ok',
          postReceiptImages: [],
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // PR #3 do backlog (auditoria preventiva de drift, 2026-07-08):
    // valida SHAPE (is list) e TAMANHO (size() <= 10) de
    // postReceiptImages. Antes a regra de negocio "max N imagens"
    // era so do app; agora a rule t rejeita.
    for (let i = 0; i < 10; i++) {
      it(`logistica aceita postReceiptImages com ${i + 1} imagem(s) (limite 10)`, async () => {
        await seed((db) =>
          setDoc(doc(db, 'processes/pr4'), {
            name: 'P',
            postReceiptNotes: '',
            postReceiptImages: [],
            updatedById: 'x',
            updatedByName: 'y',
          })
        )
        const images = Array.from({ length: i + 1 }, (_, idx) => ({
          id: `img-${idx}`,
          url: `https://example.com/img-${idx}.jpg`,
          name: `foto-${idx}.jpg`,
          mimeType: 'image/jpeg',
        }))
        const db = logistics('log-1')
        await assertSucceeds(
          updateDoc(doc(db, 'processes/pr4'), {
            postReceiptNotes: 'Recebido',
            postReceiptImages: images,
            updatedAt: 'now',
            updatedById: 'log-1',
            updatedByName: 'Logistica',
          })
        )
      })
    }

    it('logistica NAO aceita postReceiptImages com 11 imagens (acima do limite)', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/pr5'), {
          name: 'P',
          postReceiptNotes: '',
          postReceiptImages: [],
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const images = Array.from({ length: 11 }, (_, idx) => ({
        id: `img-${idx}`,
        url: `https://example.com/img-${idx}.jpg`,
        name: `foto-${idx}.jpg`,
        mimeType: 'image/jpeg',
      }))
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/pr5'), {
          postReceiptNotes: 'Recebido',
          postReceiptImages: images,
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO aceita postReceiptImages como string (shape invalido)', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/pr6'), {
          name: 'P',
          postReceiptNotes: '',
          postReceiptImages: [],
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/pr6'), {
          postReceiptNotes: 'Recebido',
          postReceiptImages: 'nao-eh-list',
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

    // F17.4b (B-3): divergencia no recebimento - logistica grava os 3
    // campos validos junto de um status pos-recebimento.
    it('logistica grava status pos-recebimento + 3 campos de divergencia validos', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div1'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/div1'), {
          collectionStatus: 'Carga recebida, em conferência',
          receiptDivergence: true,
          receiptDivergenceType: 'Avaria',
          receiptDivergenceNotes: 'caixa amassada',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava receiptDivergenceType fora do vocabulario ("Outro")', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div2'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div2'), {
          collectionStatus: 'Carga recebida, em conferência',
          receiptDivergence: true,
          receiptDivergenceType: 'Outro',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava receiptDivergence como string ("true")', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div3'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div3'), {
          collectionStatus: 'Carga recebida, em conferência',
          receiptDivergence: 'true',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava receiptDivergenceNotes com 2001 caracteres', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div4'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div4'), {
          collectionStatus: 'Carga recebida, em conferência',
          receiptDivergence: true,
          receiptDivergenceType: 'Avaria',
          receiptDivergenceNotes: 'x'.repeat(2001),
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava divergencia junto de collectionStatus final pre-coleta', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div5'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div5'), {
          collectionStatus: 'Coleta Agendada',
          receiptDivergence: true,
          receiptDivergenceType: 'Avaria',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.4b (D6): complementa o caso l.999 (`logistica NAO atualiza
    // containers`) - `containers[].returnedAt` (devolucao de vazio) so' admin,
    // mesmo junto de um collectionStatus valido.
    it('logistica NAO grava containers com returnedAt junto de collectionStatus', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div6'), {
          name: 'P',
          category: 'FCL',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: '', type: '', returnedAt: '' }],
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div6'), {
          collectionStatus: 'Carga recebida, em conferência',
          containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: '', type: '', returnedAt: '2026-09-10' }],
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.4b (B-3/D6): admin grava os 3 campos validos + containers[0].returnedAt.
    it('admin grava divergencia valida + containers[0].returnedAt', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div7'), {
          name: 'P',
          category: 'FCL',
          containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: '', type: '', returnedAt: '' }],
        })
      )
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/div7'), {
          receiptDivergence: true,
          receiptDivergenceType: 'Avaria',
          receiptDivergenceNotes: 'nota',
          containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: '', type: '', returnedAt: '2026-09-10' }],
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('admin NAO grava receiptDivergenceType fora do vocabulario ("Outro")', async () => {
      await seed((db) => setDoc(doc(db, 'processes/div8'), { name: 'P', category: 'FCL' }))
      const db = admin('admin-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div8'), {
          receiptDivergence: true,
          receiptDivergenceType: 'Outro',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    // F17.4b-fix: logistica anexa postReceiptImages no MESMO update de
    // status + divergencia (D1 - 1 write so').
    it('logistica grava status pos-recebimento + divergencia "Lote" + postReceiptImages num unico update', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div9'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          postReceiptImages: [],
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      const images = [
        { id: 'img-0', url: 'https://example.com/img-0.jpg', name: 'foto-0.jpg', mimeType: 'image/jpeg' },
        { id: 'img-1', url: 'https://example.com/img-1.jpg', name: 'foto-1.jpg', mimeType: 'image/jpeg' },
      ]
      await assertSucceeds(
        updateDoc(doc(db, 'processes/div9'), {
          collectionStatus: 'Carga recebida, em conferência',
          receiptDivergence: true,
          receiptDivergenceType: 'Lote',
          receiptDivergenceNotes: 'lote trocado',
          postReceiptImages: images,
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava 11 postReceiptImages junto do status + divergencia', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div10'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          postReceiptImages: [],
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      const images = Array.from({ length: 11 }, (_, idx) => ({
        id: `img-${idx}`,
        url: `https://example.com/img-${idx}.jpg`,
        name: `foto-${idx}.jpg`,
        mimeType: 'image/jpeg',
      }))
      await assertFails(
        updateDoc(doc(db, 'processes/div10'), {
          collectionStatus: 'Carga recebida, em conferência',
          receiptDivergence: true,
          receiptDivergenceType: 'Avaria',
          postReceiptImages: images,
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava postReceiptImages como string junto do status + divergencia', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div11'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          postReceiptImages: [],
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div11'), {
          collectionStatus: 'Carga recebida, em conferência',
          receiptDivergence: true,
          receiptDivergenceType: 'Avaria',
          postReceiptImages: 'nao-eh-list',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava postReceiptNotes junto do status de coleta', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/div12'), {
          name: 'P',
          collectionScheduledAt: '2026-07-01T10:00',
          collectionStatus: 'Coleta Agendada',
          postReceiptNotes: '',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/div12'), {
          collectionStatus: 'Carga recebida, em conferência',
          postReceiptNotes: 'nota geral',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.4b-fix (D6): admin grava o tipo novo 'Lote'.
    it('admin grava divergencia "Lote"', async () => {
      await seed((db) => setDoc(doc(db, 'processes/div13'), { name: 'P', category: 'FCL' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/div13'), {
          receiptDivergence: true,
          receiptDivergenceType: 'Lote',
          receiptDivergenceNotes: 'lote trocado',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

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
      // F17.1a: fecha a lacuna herdada do F17.0 - legado que so era
      // canonicalizado na LEITURA, mas a rule ainda nao bloqueava a
      // logistica de gravá-lo via API.
      'Aguardando agendamento',
      // F17.4a (D-3): 'Aguardando liberação no Terminal' saiu da lista do
      // app e entrou como pre-coleta na rule.
      'Aguardando liberação no Terminal',
    ]) {
      it(`logistica NAO volta para status pre-coleta "${preCollectionStatus}"`, async () => {
        await seed((db) =>
          setDoc(doc(db, 'processes/cs-back'), {
            name: 'P',
            collectionScheduledAt: '2026-07-08T10:00',
            collectionStatus: 'Carga em Conferência/Etiquetagem', // ja em pos-coleta
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

    // Regressao (3o bug de prod, 2026-07-08): o app migrou de
    // `collectionScheduledAt` (string unica) para `collectionWindows` (array
    // de janelas multi-container, com `scheduledAt` por janela). A rule
    // `hasScheduledCollection()` so checava o campo legado, entao qualquer
    // processo no schema multi-container caia no permission-denied mesmo com
    // coleta marcada. O app faz fallback novo→legado em
    // `src/utils/collectionWindows.js#getCollectionWindows`, mas a rule
    // precisa aceitar os dois schemas.
    it('logistica avanca com collectionWindows (schema novo, multi-container)', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/cw-ok'), {
          name: 'P',
          // so' collectionWindows (sem collectionScheduledAt legado).
          collectionWindows: [
            {
              id: 'WIN-1',
              containerNumber: 1,
              scheduledAt: '2026-07-08T10:00:00.000Z',
              notes: '',
            },
          ],
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/cw-ok'), {
          collectionStatus: 'Carga disponível em estoque',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica avanca para status intermediario com collectionWindows', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/cw-target'), {
          name: 'P',
          collectionWindows: [
            { id: 'WIN-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' },
          ],
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/cw-target'), {
          collectionStatus: 'Veículo no CD para descarga',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO avanca com collectionWindows vazio', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/cw-empty'), {
          name: 'P',
          collectionWindows: [],
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/cw-empty'), {
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO avanca com collectionWindows sem scheduledAt na janela[0]', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/cw-no-sched'), {
          name: 'P',
          collectionWindows: [
            { id: 'WIN-1', containerNumber: 1, scheduledAt: '', notes: '' },
          ],
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/cw-no-sched'), {
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.1a (D-F): a logistica passa a gravar tambem `processStatus`
    // (so' 'Coleta Agendada' ou 'Carga recebida') e `cargoReceivedAt`.
    it('logistica grava collectionStatus + processStatus "Carga recebida" + cargoReceivedAt', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f171-1'), {
          name: 'P',
          collectionScheduledAt: '2026-07-08T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/f171-1'), {
          collectionStatus: 'Veículo no CD para descarga',
          processStatus: 'Carga recebida',
          cargoReceivedAt: '2026-07-08T12:00:00.000Z',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // F17.4a (A5): valor fundido novo - admin grava com sucesso.
    it('admin grava collectionStatus "Carga recebida, em conferência"', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f174a-admin'), {
          name: 'P',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/f174a-admin'), {
          collectionStatus: 'Carga recebida, em conferência',
          updatedAt: 'now',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    // F17.4a (A5): valor fundido novo - logistica grava com sucesso.
    it('logistica grava collectionStatus "Carga recebida, em conferência" + processStatus "Carga recebida" + cargoReceivedAt', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f174a-1'), {
          name: 'P',
          collectionScheduledAt: '2026-07-08T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/f174a-1'), {
          collectionStatus: 'Carga recebida, em conferência',
          processStatus: 'Carga recebida',
          cargoReceivedAt: '2026-07-08T12:00:00.000Z',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica grava collectionStatus + processStatus "Coleta Agendada" + cargoReceivedAt vazio', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f171-2'), {
          name: 'P',
          collectionScheduledAt: '2026-07-08T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/f171-2'), {
          collectionStatus: 'Carga a caminho do CD',
          processStatus: 'Coleta Agendada',
          cargoReceivedAt: '',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    for (const invalidProcessStatus of ['Aguardando agendamento de coleta', 'Embarcou']) {
      it(`logistica NAO grava processStatus "${invalidProcessStatus}" (fora da allowlist D-F)`, async () => {
        await seed((db) =>
          setDoc(doc(db, 'processes/f171-3'), {
            name: 'P',
            collectionScheduledAt: '2026-07-08T10:00',
            collectionStatus: 'Coleta Agendada',
            updatedById: 'x',
            updatedByName: 'y',
          })
        )
        const db = logistics('log-1')
        await assertFails(
          updateDoc(doc(db, 'processes/f171-3'), {
            collectionStatus: 'Carga em Conferência/Etiquetagem',
            processStatus: invalidProcessStatus,
            updatedAt: 'now',
            updatedById: 'log-1',
            updatedByName: 'Logistica',
          })
        )
      })
    }

    it('logistica NAO grava processStatus "Carga recebida" sem coleta agendada', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f171-4'), {
          name: 'P',
          collectionStatus: 'Coleta Agendada', // sem collectionScheduledAt/collectionWindows
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/f171-4'), {
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          processStatus: 'Carga recebida',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava cargoReceivedAt como numero', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f171-5'), {
          name: 'P',
          collectionScheduledAt: '2026-07-08T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/f171-5'), {
          collectionStatus: 'Veículo no CD para descarga',
          processStatus: 'Carga recebida',
          cargoReceivedAt: 123,
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    it('logistica NAO grava processStatus junto de collectionStatus final pre-coleta', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f171-6'), {
          name: 'P',
          collectionScheduledAt: '2026-07-08T10:00',
          collectionStatus: 'Carga em Conferência/Etiquetagem',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/f171-6'), {
          collectionStatus: 'Coleta Agendada', // tentando voltar atras
          processStatus: 'Coleta Agendada',
          updatedAt: 'now',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
        })
      )
    })

    // Documenta que a rule NAO tem enum de status pro admin (so' a
    // logistica tem allowlist de valor via D-F).
    it('admin grava processStatus "Aguardando desembaraço"', async () => {
      await seed((db) => setDoc(doc(db, 'processes/f171-7'), { name: 'Orig' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/f171-7'), {
          processStatus: 'Aguardando desembaraço',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    // AD-1: `clearanceCompletedAt` antecipado do F17.3 - so' admin grava.
    it('admin grava clearanceCompletedAt', async () => {
      await seed((db) => setDoc(doc(db, 'processes/f171-ad1-admin'), { name: 'Orig' }))
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'processes/f171-ad1-admin'), {
          clearanceCompletedAt: '2026-08-01T10:00',
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    })

    it('logistica NAO grava clearanceCompletedAt', async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/f171-ad1-log'), {
          name: 'P',
          collectionScheduledAt: '2026-07-08T10:00',
          collectionStatus: 'Coleta Agendada',
          updatedById: 'x',
          updatedByName: 'y',
        })
      )
      const db = logistics('log-1')
      await assertFails(
        updateDoc(doc(db, 'processes/f171-ad1-log'), {
          clearanceCompletedAt: '2026-08-01T10:00',
          updatedById: 'log-1',
          updatedByName: 'Logistica',
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

  describe('events (subcollection, F17.1b)', () => {
    beforeEach(async () => {
      await seed((db) =>
        setDoc(doc(db, 'processes/p1/events/e1'), {
          type: 'berthed',
          field: 'berthed',
          value: true,
          previousValue: false,
          actorId: 'admin-1',
          actorName: 'Admin',
          occurredAt: '2026-09-20T10:00:00.000Z',
          processId: 'p1',
        })
      )
    })

    it('usuario aprovado comum NAO le (F18a Decisao 10)', async () => {
      await assertFails(getDoc(doc(approvedUser('user-1'), 'processes/p1/events/e1')))
    })

    it('logistica le', async () => {
      await assertSucceeds(getDoc(doc(logistics('log-1'), 'processes/p1/events/e1')))
    })

    it('admin le', async () => {
      await assertSucceeds(getDoc(doc(admin('admin-1'), 'processes/p1/events/e1')))
    })

    it('anonimo NAO le', async () => {
      await assertFails(getDoc(doc(anon(), 'processes/p1/events/e1')))
    })

    it('usuario com status Pendente NAO le', async () => {
      const db = approvedUser('user-pend', { status: 'Pendente' })
      await assertFails(getDoc(doc(db, 'processes/p1/events/e1')))
    })

    it('usuario com email nao corporativo NAO le', async () => {
      const db = approvedUser('user-gmail', { email: 'alguem@gmail.com' })
      await assertFails(getDoc(doc(db, 'processes/p1/events/e1')))
    })

    it('admin NAO cria evento novo (so o trigger, via admin SDK, grava)', async () => {
      await assertFails(
        setDoc(doc(admin('admin-1'), 'processes/p1/events/e2'), {
          type: 'berthed',
          processId: 'p1',
        })
      )
    })

    it('admin NAO atualiza evento existente', async () => {
      await assertFails(
        updateDoc(doc(admin('admin-1'), 'processes/p1/events/e1'), { value: false })
      )
    })

    it('admin NAO apaga evento', async () => {
      await assertFails(deleteDoc(doc(admin('admin-1'), 'processes/p1/events/e1')))
    })

    it('logistica NAO cria evento', async () => {
      await assertFails(
        setDoc(doc(logistics('log-1'), 'processes/p1/events/e2'), { type: 'berthed', processId: 'p1' })
      )
    })

    it('usuario aprovado comum NAO cria evento', async () => {
      await assertFails(
        setDoc(doc(approvedUser('user-1'), 'processes/p1/events/e2'), { type: 'berthed', processId: 'p1' })
      )
    })
  })

  describe('documents (subcollection, F18a + AD-1)', () => {
    beforeEach(async () => {
      await seed(async (db) => {
        await setDoc(doc(db, 'processes/p1'), { category: 'FCL' })
        await setDoc(doc(db, 'processes/p-consolidado'), { category: 'CONSOLIDADO' })
        await setDoc(doc(db, 'processes/p-lcl'), { category: 'LCL' })
      })
    })

    function baseFields(overrides = {}) {
      return {
        type: 'bl',
        slotKey: 'bl',
        name: 'BL.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: 'processes/p1/documents/bl/1-admin-1-BL.pdf',
        uploadedAt: serverTimestamp(),
        uploadedById: 'admin-1',
        uploadedByName: 'Admin',
        uploadedByRole: 'admin',
        ...overrides,
      }
    }

    it('admin cria bl', async () => {
      await assertSucceeds(setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), baseFields()))
    })

    it('admin cria cargoReport', async () => {
      await assertSucceeds(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'cargoReport',
            slotKey: 'cargoReport',
            storagePath: 'processes/p1/documents/cargoReport/1-admin-1-relatorio.pdf',
          })
        )
      )
    })

    it('admin cria fispq com itemId', async () => {
      await assertSucceeds(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'fispq',
            slotKey: 'fispq:ITEM-1',
            itemId: 'ITEM-1',
            storagePath: 'processes/p1/documents/fispq/ITEM-1/1-admin-1-fispq.pdf',
          })
        )
      )
    })

    it('fispq sem itemId falha', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'fispq',
            slotKey: 'fispq:ITEM-1',
            storagePath: 'processes/p1/documents/fispq/ITEM-1/1-admin-1-fispq.pdf',
          })
        )
      )
    })

    it('admin cria other com description', async () => {
      await assertSucceeds(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'other',
            slotKey: 'other:d1',
            description: 'nota fiscal',
            storagePath: 'processes/p1/documents/other/1-admin-1-nf.pdf',
          })
        )
      )
    })

    it('other sem description falha', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'other',
            slotKey: 'other:d1',
            storagePath: 'processes/p1/documents/other/1-admin-1-nf.pdf',
          })
        )
      )
    })

    it('admin cria containerWash em FCL', async () => {
      await assertSucceeds(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'containerWash',
            slotKey: 'containerWash:CNT-1',
            containerId: 'CNT-1',
            storagePath: 'processes/p1/documents/containerWash/CNT-1/1-admin-1-lavacao.pdf',
          })
        )
      )
    })

    it('containerWash em LCL falha (mesmo pra admin)', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p-lcl/documents/d1'),
          baseFields({
            type: 'containerWash',
            slotKey: 'containerWash:CNT-1',
            containerId: 'CNT-1',
            storagePath: 'processes/p-lcl/documents/containerWash/CNT-1/1-admin-1-lavacao.pdf',
          })
        )
      )
    })

    it('logistica cria containerWash em FCL', async () => {
      await assertSucceeds(
        setDoc(
          doc(logistics('log-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'containerWash',
            slotKey: 'containerWash:CNT-1',
            containerId: 'CNT-1',
            storagePath: 'processes/p1/documents/containerWash/CNT-1/1-log-1-lavacao.pdf',
            uploadedById: 'log-1',
            uploadedByName: 'Logistica',
            uploadedByRole: 'logistica',
          })
        )
      )
    })

    it('logistica cria containerWash em CONSOLIDADO', async () => {
      await assertSucceeds(
        setDoc(
          doc(logistics('log-1'), 'processes/p-consolidado/documents/d1'),
          baseFields({
            type: 'containerWash',
            slotKey: 'containerWash:CNT-1',
            containerId: 'CNT-1',
            storagePath: 'processes/p-consolidado/documents/containerWash/CNT-1/1-log-1-lavacao.pdf',
            uploadedById: 'log-1',
            uploadedByName: 'Logistica',
            uploadedByRole: 'logistica',
          })
        )
      )
    })

    it('logistica cria containerWash em LCL falha', async () => {
      await assertFails(
        setDoc(
          doc(logistics('log-1'), 'processes/p-lcl/documents/d1'),
          baseFields({
            type: 'containerWash',
            slotKey: 'containerWash:CNT-1',
            containerId: 'CNT-1',
            storagePath: 'processes/p-lcl/documents/containerWash/CNT-1/1-log-1-lavacao.pdf',
            uploadedById: 'log-1',
            uploadedByName: 'Logistica',
            uploadedByRole: 'logistica',
          })
        )
      )
    })

    it('logistica NAO cria bl', async () => {
      await assertFails(
        setDoc(
          doc(logistics('log-1'), 'processes/p1/documents/d1'),
          baseFields({ uploadedById: 'log-1', uploadedByName: 'Logistica', uploadedByRole: 'logistica' })
        )
      )
    })

    // AD-1: invoice/packingList no CONSOLIDADO exigem poNumber == sufixo do slotKey.
    it('AD-1: admin cria invoice no CONSOLIDADO com poNumber == sufixo do slotKey', async () => {
      await assertSucceeds(
        setDoc(
          doc(admin('admin-1'), 'processes/p-consolidado/documents/d1'),
          baseFields({
            type: 'invoice',
            slotKey: 'invoice:PO-1',
            poNumber: 'PO-1',
            storagePath: 'processes/p-consolidado/documents/invoice/PO-1/1-admin-1-invoice.pdf',
          })
        )
      )
    })

    it('AD-1: admin cria invoice no CONSOLIDADO SEM poNumber falha', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p-consolidado/documents/d1'),
          baseFields({
            type: 'invoice',
            slotKey: 'invoice',
            storagePath: 'processes/p-consolidado/documents/invoice/1-admin-1-invoice.pdf',
          })
        )
      )
    })

    it('AD-1: poNumber diferente do sufixo do slotKey falha', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p-consolidado/documents/d1'),
          baseFields({
            type: 'invoice',
            slotKey: 'invoice:PO-1',
            poNumber: 'PO-2',
            storagePath: 'processes/p-consolidado/documents/invoice/PO-1/1-admin-1-invoice.pdf',
          })
        )
      )
    })

    it('AD-1: slot por PO recusado fora do CONSOLIDADO (FCL)', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'invoice',
            slotKey: 'invoice:PO-1',
            poNumber: 'PO-1',
            storagePath: 'processes/p1/documents/invoice/PO-1/1-admin-1-invoice.pdf',
          })
        )
      )
    })

    it('admin cria invoice em FCL sem PO (slot unico)', async () => {
      await assertSucceeds(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({
            type: 'invoice',
            slotKey: 'invoice',
            storagePath: 'processes/p1/documents/invoice/1-admin-1-invoice.pdf',
          })
        )
      )
    })

    it('campo extra fora da allowlist falha', async () => {
      await assertFails(
        setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), { ...baseFields(), extra: 'x' })
      )
    })

    it('size acima de 20 MB falha', async () => {
      await assertFails(
        setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), baseFields({ size: 20971521 }))
      )
    })

    it('slotKey errado falha', async () => {
      await assertFails(
        setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), baseFields({ slotKey: 'bl-errado' }))
      )
    })

    it('storagePath de outro processo falha', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({ storagePath: 'processes/p-outro/documents/bl/1-admin-1-BL.pdf' })
        )
      )
    })

    it('storagePath com uid de outro usuario falha', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p1/documents/d1'),
          baseFields({ storagePath: 'processes/p1/documents/bl/1-outro-uid-BL.pdf' })
        )
      )
    })

    it('uploadedById forjado (diferente do auth.uid) falha', async () => {
      await assertFails(
        setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), baseFields({ uploadedById: 'outro-uid' }))
      )
    })

    it('uploadedByRole forjado falha', async () => {
      await assertFails(
        setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), baseFields({ uploadedByRole: 'logistica' }))
      )
    })

    it('processo inexistente falha', async () => {
      await assertFails(
        setDoc(
          doc(admin('admin-1'), 'processes/p-inexistente/documents/d1'),
          baseFields({ storagePath: 'processes/p-inexistente/documents/bl/1-admin-1-BL.pdf' })
        )
      )
    })

    it('usuario comum nao le nem cria', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/documents/d1'), baseFields()))
      await assertFails(getDoc(doc(approvedUser('user-1'), 'processes/p1/documents/d1')))
      await assertFails(
        setDoc(doc(approvedUser('user-1'), 'processes/p1/documents/d2'), baseFields({ uploadedById: 'user-1' }))
      )
    })

    it('usuario Pendente nao le', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/documents/d1'), baseFields()))
      const db = approvedUser('user-pend', { status: 'Pendente' })
      await assertFails(getDoc(doc(db, 'processes/p1/documents/d1')))
    })

    it('anonimo nao le nem cria', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/documents/d1'), baseFields()))
      await assertFails(getDoc(doc(anon(), 'processes/p1/documents/d1')))
      await assertFails(setDoc(doc(anon(), 'processes/p1/documents/d2'), baseFields()))
    })

    // Perfis `tecnico`/`faturamento`: so leem cargoReport/coaOriginal (get e
    // query filtrada por type); nunca escrevem.
    describe.each(['tecnico', 'faturamento'])('perfil leitor %s', (role) => {
      const reader = (uid = `${role}-1`, overrides = {}) =>
        testEnv
          .authenticatedContext(uid, {
            email: `${role}@sqquimica.com`,
            role,
            status: 'Ativo',
            name: 'Leitor',
            ...overrides,
          })
          .firestore()

      const coaFields = (overrides = {}) =>
        baseFields({
          type: 'coaOriginal',
          slotKey: 'coaOriginal',
          storagePath: 'processes/p1/documents/coaOriginal/1-admin-1-coa.pdf',
          ...overrides,
        })

      const cargoFields = (overrides = {}) =>
        baseFields({
          type: 'cargoReport',
          slotKey: 'cargoReport',
          storagePath: 'processes/p1/documents/cargoReport/1-admin-1-cr.pdf',
          ...overrides,
        })

      beforeEach(async () => {
        await seed(async (db) => {
          await setDoc(doc(db, 'processes/p1/documents/coa1'), coaFields({ uploadedAt: new Date() }))
          await setDoc(doc(db, 'processes/p1/documents/cr1'), cargoFields({ uploadedAt: new Date() }))
          await setDoc(doc(db, 'processes/p1/documents/bl1'), baseFields({ uploadedAt: new Date() }))
          await setDoc(
            doc(db, 'processes/p1/documents/inv1'),
            baseFields({
              type: 'invoice',
              slotKey: 'invoice',
              storagePath: 'processes/p1/documents/invoice/1-admin-1-inv.pdf',
              uploadedAt: new Date(),
            })
          )
          await setDoc(
            doc(db, 'processes/p1/documents/oth1'),
            baseFields({
              type: 'other',
              slotKey: 'other:oth1',
              description: 'x',
              storagePath: 'processes/p1/documents/other/1-admin-1-x.pdf',
              uploadedAt: new Date(),
            })
          )
        })
      })

      it('le (get) cargoReport e coaOriginal', async () => {
        await assertSucceeds(getDoc(doc(reader(), 'processes/p1/documents/cr1')))
        await assertSucceeds(getDoc(doc(reader(), 'processes/p1/documents/coa1')))
      })

      it('NAO le (get) bl, invoice nem other', async () => {
        await assertFails(getDoc(doc(reader(), 'processes/p1/documents/bl1')))
        await assertFails(getDoc(doc(reader(), 'processes/p1/documents/inv1')))
        await assertFails(getDoc(doc(reader(), 'processes/p1/documents/oth1')))
      })

      it('list SEM filtro e negada', async () => {
        await assertFails(getDocs(collection(reader(), 'processes/p1/documents')))
      })

      it("list com where('type','in',[cargoReport, coaOriginal]) e permitida", async () => {
        await assertSucceeds(
          getDocs(
            query(
              collection(reader(), 'processes/p1/documents'),
              where('type', 'in', ['cargoReport', 'coaOriginal'])
            )
          )
        )
      })

      it('list filtrada por tipo nao liberado e negada', async () => {
        await assertFails(
          getDocs(query(collection(reader(), 'processes/p1/documents'), where('type', 'in', ['bl', 'coaOriginal'])))
        )
        await assertFails(
          getDocs(query(collection(reader(), 'processes/p1/documents'), where('type', '==', 'bl')))
        )
      })

      it('NAO cria, atualiza nem exclui documentos', async () => {
        await assertFails(
          setDoc(
            doc(reader(), 'processes/p1/documents/novo'),
            coaFields({ uploadedById: `${role}-1`, uploadedByRole: role, uploadedByName: 'Leitor' })
          )
        )
        await assertFails(updateDoc(doc(reader(), 'processes/p1/documents/coa1'), { name: 'outro.pdf' }))
        await assertFails(deleteDoc(doc(reader(), 'processes/p1/documents/coa1')))
        await assertFails(deleteDoc(doc(reader(), 'processes/p1/documents/cr1')))
      })

      it('leitor Pendente ou com e-mail externo NAO le', async () => {
        await assertFails(getDoc(doc(reader('pend-1', { status: 'Pendente' }), 'processes/p1/documents/coa1')))
        await assertFails(getDoc(doc(reader('ext-1', { email: 'x@gmail.com' }), 'processes/p1/documents/coa1')))
      })

      it('NAO le o historico (events)', async () => {
        await seed((db) => setDoc(doc(db, 'processes/p1/events/e1'), { type: 'berthed', processId: 'p1' }))
        await assertFails(getDoc(doc(reader(), 'processes/p1/events/e1')))
      })
    })

    // S11-A: o COA vira LISTA de arquivos - 1 slot por arquivo (`coaOriginal:<id>`), sem rotacao.
    // O slot fixo legado (`coaOriginal`) deixa de ser aceito no create, mas os docs antigos
    // continuam legiveis/apagaveis; admin renomeia (description) igual ao documento adicional.
    describe('coaOriginal (D-1/D-2/D-3)', () => {
      const coaFields = (overrides = {}) =>
        baseFields({
          type: 'coaOriginal',
          slotKey: 'coaOriginal:d1',
          storagePath: 'processes/p1/documents/coaOriginal/1-admin-1-coa.pdf',
          ...overrides,
        })
      const renameUpdate = (overrides = {}) => ({
        description: 'Lote ABC-123',
        descriptionUpdatedAt: serverTimestamp(),
        descriptionUpdatedById: 'admin-1',
        ...overrides,
      })
      const coaPath = 'processes/p1/documents/d1'
      const staffDb = (role, uid = `${role}-1`) =>
        testEnv
          .authenticatedContext(uid, { email: `${role}@sqquimica.com`, role, status: 'Ativo', name: 'Equipe' })
          .firestore()

      it('admin cria coaOriginal (slot coaOriginal:<id>)', async () => {
        await assertSucceeds(setDoc(doc(admin('admin-1'), coaPath), coaFields()))
      })

      it('admin cria coaOriginal em processo CONSOLIDADO (com poNumber) e LCL (sem poNumber)', async () => {
        await assertSucceeds(
          setDoc(
            doc(admin('admin-1'), 'processes/p-consolidado/documents/d1'),
            coaFields({
              storagePath: 'processes/p-consolidado/documents/coaOriginal/1-admin-1-coa.pdf',
              poNumber: 'PO-1',
            })
          )
        )
        await assertSucceeds(
          setDoc(
            doc(admin('admin-1'), 'processes/p-lcl/documents/d1'),
            coaFields({ storagePath: 'processes/p-lcl/documents/coaOriginal/1-admin-1-coa.pdf' })
          )
        )
      })


      // S11-D1 (COA por PO): no CONSOLIDADO o COA exige `poNumber`; nos demais nao pode ter.
      // Slot (`coaOriginal:<id>`) e storagePath nao levam a PO.
      const consolidatedPath = 'processes/p-consolidado/documents/d1'
      const consolidatedCoaFields = (overrides = {}) =>
        coaFields({
          storagePath: 'processes/p-consolidado/documents/coaOriginal/1-admin-1-coa.pdf',
          poNumber: 'PO-1',
          ...overrides,
        })
      const consolidatedCoaWithoutPo = (overrides = {}) => {
        const fields = consolidatedCoaFields(overrides)
        delete fields.poNumber
        return fields
      }
      const linkUpdate = (overrides = {}) => ({
        poNumber: 'PO-2',
        poNumberUpdatedAt: serverTimestamp(),
        poNumberUpdatedById: 'admin-1',
        ...overrides,
      })

      describe('create por categoria (poNumber)', () => {
        it('admin cria coaOriginal em processo CONSOLIDADO COM poNumber', async () => {
          await assertSucceeds(setDoc(doc(admin('admin-1'), consolidatedPath), consolidatedCoaFields()))
        })

        it('admin cria coaOriginal em LCL e FCL SEM poNumber', async () => {
          await assertSucceeds(
            setDoc(
              doc(admin('admin-1'), 'processes/p-lcl/documents/d1'),
              coaFields({ storagePath: 'processes/p-lcl/documents/coaOriginal/1-admin-1-coa.pdf' })
            )
          )
          await assertSucceeds(setDoc(doc(admin('admin-1'), coaPath), coaFields()))
        })

        it('CONSOLIDADO SEM poNumber falha (inclusive com slot e caminho validos)', async () => {
          await assertFails(setDoc(doc(admin('admin-1'), consolidatedPath), consolidatedCoaWithoutPo()))
        })

        it('CONSOLIDADO com poNumber vazio, 65 caracteres ou nao-string falha; 1 e 64 caracteres passam', async () => {
          for (const poNumber of ['', 'x'.repeat(65), 123, null, true, ['PO-1']]) {
            await assertFails(setDoc(doc(admin('admin-1'), consolidatedPath), consolidatedCoaFields({ poNumber })))
          }
          await assertSucceeds(setDoc(doc(admin('admin-1'), consolidatedPath), consolidatedCoaFields({ poNumber: 'P' })))
          await assertSucceeds(
            setDoc(
              doc(admin('admin-1'), 'processes/p-consolidado/documents/d2'),
              consolidatedCoaFields({ slotKey: 'coaOriginal:d2', poNumber: 'P'.repeat(64) })
            )
          )
        })

        it('LCL e FCL COM poNumber falham', async () => {
          await assertFails(
            setDoc(
              doc(admin('admin-1'), 'processes/p-lcl/documents/d1'),
              coaFields({ storagePath: 'processes/p-lcl/documents/coaOriginal/1-admin-1-coa.pdf', poNumber: 'PO-1' })
            )
          )
          await assertFails(setDoc(doc(admin('admin-1'), coaPath), coaFields({ poNumber: 'PO-1' })))
        })

        it('processo sem categoria e tratado como nao consolidado (sem poNumber passa, com poNumber falha)', async () => {
          await seed((db) => setDoc(doc(db, 'processes/p-sem-categoria'), { name: 'legado' }))
          const path = 'processes/p-sem-categoria/documents/d1'
          const storagePath = 'processes/p-sem-categoria/documents/coaOriginal/1-admin-1-coa.pdf'
          await assertFails(setDoc(doc(admin('admin-1'), path), coaFields({ storagePath, poNumber: 'PO-1' })))
          await assertSucceeds(setDoc(doc(admin('admin-1'), path), coaFields({ storagePath })))
        })

        it('CONSOLIDADO: storagePath com a PO no caminho falha (o COA nao usa segmento de PO)', async () => {
          await assertFails(
            setDoc(
              doc(admin('admin-1'), consolidatedPath),
              consolidatedCoaFields({
                storagePath: 'processes/p-consolidado/documents/coaOriginal/PO-1/1-admin-1-coa.pdf',
              })
            )
          )
        })

        it('CONSOLIDADO: slot com a PO (coaOriginal:<po>:<id>) ou slot legado falha', async () => {
          for (const slotKey of ['coaOriginal:PO-1', 'coaOriginal:PO1:d1', 'coaOriginal', 'coaOriginal:']) {
            await assertFails(setDoc(doc(admin('admin-1'), consolidatedPath), consolidatedCoaFields({ slotKey })))
          }
        })

        it('CONSOLIDADO: 2 COAs na mesma PO e COAs em POs diferentes passam (1 slot por arquivo)', async () => {
          const db = admin('admin-1')
          await assertSucceeds(setDoc(doc(db, consolidatedPath), consolidatedCoaFields()))
          await assertSucceeds(
            setDoc(
              doc(db, 'processes/p-consolidado/documents/d2'),
              consolidatedCoaFields({ slotKey: 'coaOriginal:d2', storagePath: 'processes/p-consolidado/documents/coaOriginal/2-admin-1-coa.pdf' })
            )
          )
          await assertSucceeds(
            setDoc(
              doc(db, 'processes/p-consolidado/documents/d3'),
              consolidatedCoaFields({
                slotKey: 'coaOriginal:d3',
                poNumber: 'PO-2',
                storagePath: 'processes/p-consolidado/documents/coaOriginal/3-admin-1-coa.pdf',
              })
            )
          )
        })

        it('logistica, tecnico e faturamento NAO criam coaOriginal no CONSOLIDADO (nem com poNumber)', async () => {
          for (const role of ['logistica', 'tecnico', 'faturamento']) {
            await assertFails(
              setDoc(
                doc(staffDb(role), consolidatedPath),
                consolidatedCoaFields({
                  uploadedById: `${role}-1`,
                  uploadedByRole: role,
                  uploadedByName: 'Equipe',
                  storagePath: `processes/p-consolidado/documents/coaOriginal/1-${role}-1-coa.pdf`,
                })
              )
            )
          }
        })

        it('a regra do poNumber so vale para COA: bl, cargoReport e other no CONSOLIDADO continuam sem poNumber', async () => {
          const db = admin('admin-1')
          await assertSucceeds(
            setDoc(
              doc(db, 'processes/p-consolidado/documents/b1'),
              baseFields({ storagePath: 'processes/p-consolidado/documents/bl/1-admin-1-BL.pdf' })
            )
          )
          await assertSucceeds(
            setDoc(
              doc(db, 'processes/p-consolidado/documents/c1'),
              baseFields({
                type: 'cargoReport',
                slotKey: 'cargoReport',
                storagePath: 'processes/p-consolidado/documents/cargoReport/1-admin-1-cr.pdf',
              })
            )
          )
          await assertSucceeds(
            setDoc(
              doc(db, 'processes/p-consolidado/documents/o1'),
              baseFields({
                type: 'other',
                slotKey: 'other:o1',
                description: 'Laudo',
                storagePath: 'processes/p-consolidado/documents/other/1-admin-1-laudo.pdf',
              })
            )
          )
        })
      })


      it('2 COAs no mesmo processo passam (1 slot por arquivo, nada e rotacionado)', async () => {
        await assertSucceeds(setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), coaFields()))
        await assertSucceeds(
          setDoc(
            doc(admin('admin-1'), 'processes/p1/documents/d2'),
            coaFields({
              slotKey: 'coaOriginal:d2',
              storagePath: 'processes/p1/documents/coaOriginal/2-admin-1-coa.pdf',
            })
          )
        )
      })

      it('aceita o id do slot com 1 e com 64 caracteres alfanumericos', async () => {
        await assertSucceeds(
          setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), coaFields({ slotKey: 'coaOriginal:a' }))
        )
        await assertSucceeds(
          setDoc(
            doc(admin('admin-1'), 'processes/p1/documents/d2'),
            coaFields({ slotKey: `coaOriginal:${'Z9'.repeat(32)}` })
          )
        )
      })

      it("slotKey invalido falha: 'coaOriginal' (legado), 'coaOriginal:', com barra, hifen, 65 caracteres, outro tipo", async () => {
        const invalidSlots = [
          'coaOriginal',
          'coaOriginal:',
          'coaOriginal:a/b',
          'coaOriginal:a-b',
          'coaOriginal:a b',
          `coaOriginal:${'x'.repeat(65)}`,
          'cargoReport',
          'bl',
          'other:d1',
        ]
        for (const slotKey of invalidSlots) {
          await assertFails(setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), coaFields({ slotKey })))
        }
      })

      it('logistica NAO cria coaOriginal', async () => {
        await assertFails(
          setDoc(
            doc(logistics('log-1'), 'processes/p1/documents/d1'),
            coaFields({
              uploadedById: 'log-1',
              uploadedByRole: 'logistica',
              uploadedByName: 'Logistica',
              storagePath: 'processes/p1/documents/coaOriginal/1-log-1-coa.pdf',
            })
          )
        )
      })

      it('coaOriginal com storagePath de outro tipo falha', async () => {
        await assertFails(
          setDoc(
            doc(admin('admin-1'), 'processes/p1/documents/d1'),
            coaFields({ storagePath: 'processes/p1/documents/bl/1-admin-1-coa.pdf' })
          )
        )
      })

      it('admin e logistica leem coaOriginal (novo e legado); usuario comum nao', async () => {
        await seed(async (db) => {
          await setDoc(doc(db, 'processes/p1/documents/coa1'), coaFields({ slotKey: 'coaOriginal:coa1', uploadedAt: new Date() }))
          await setDoc(doc(db, 'processes/p1/documents/legado'), coaFields({ slotKey: 'coaOriginal', uploadedAt: new Date() }))
        })
        for (const id of ['coa1', 'legado']) {
          await assertSucceeds(getDoc(doc(admin('admin-1'), `processes/p1/documents/${id}`)))
          await assertSucceeds(getDoc(doc(logistics('log-1'), `processes/p1/documents/${id}`)))
          await assertFails(getDoc(doc(approvedUser('user-1'), `processes/p1/documents/${id}`)))
        }
      })

      it('tecnico e faturamento continuam lendo coaOriginal (novo e legado)', async () => {
        await seed(async (db) => {
          await setDoc(doc(db, 'processes/p1/documents/coa1'), coaFields({ slotKey: 'coaOriginal:coa1', uploadedAt: new Date() }))
          await setDoc(doc(db, 'processes/p1/documents/legado'), coaFields({ slotKey: 'coaOriginal', uploadedAt: new Date() }))
        })
        for (const role of ['tecnico', 'faturamento']) {
          for (const id of ['coa1', 'legado']) {
            await assertSucceeds(getDoc(doc(staffDb(role), `processes/p1/documents/${id}`)))
          }
        }
      })

      describe('renomear (description + carimbos)', () => {
        it('admin renomeia o COA novo e o legado', async () => {
          await seed(async (db) => {
            await setDoc(doc(db, coaPath), coaFields({ uploadedAt: new Date() }))
            await setDoc(doc(db, 'processes/p1/documents/legado'), coaFields({ slotKey: 'coaOriginal', uploadedAt: new Date() }))
          })
          await assertSucceeds(updateDoc(doc(admin('admin-1'), coaPath), renameUpdate()))
          await assertSucceeds(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/legado'), renameUpdate()))
        })

        it('aceita description com 1 e com 120 caracteres; rejeita vazia e com 121', async () => {
          await seed((db) => setDoc(doc(db, coaPath), coaFields({ uploadedAt: new Date() })))
          const ref = doc(admin('admin-1'), coaPath)
          await assertSucceeds(updateDoc(ref, renameUpdate({ description: 'A' })))
          await assertSucceeds(updateDoc(ref, renameUpdate({ description: 'x'.repeat(120) })))
          await assertFails(updateDoc(ref, renameUpdate({ description: '' })))
          await assertFails(updateDoc(ref, renameUpdate({ description: 'x'.repeat(121) })))
        })

        it.each(['logistica', 'tecnico', 'faturamento'])('%s NAO renomeia o COA', async (role) => {
          await seed((db) => setDoc(doc(db, coaPath), coaFields({ uploadedAt: new Date() })))
          await assertFails(updateDoc(doc(staffDb(role), coaPath), renameUpdate({ descriptionUpdatedById: `${role}-1` })))
        })

        it('usuario comum e anonimo NAO renomeiam o COA', async () => {
          await seed((db) => setDoc(doc(db, coaPath), coaFields({ uploadedAt: new Date() })))
          await assertFails(updateDoc(doc(approvedUser('user-1'), coaPath), renameUpdate({ descriptionUpdatedById: 'user-1' })))
          await assertFails(updateDoc(doc(anon(), coaPath), renameUpdate()))
        })

        it('renomear junto com name, storagePath, slotKey, type ou uploadedById falha', async () => {
          await seed((db) => setDoc(doc(db, coaPath), coaFields({ uploadedAt: new Date() })))
          const ref = doc(admin('admin-1'), coaPath)
          await assertFails(updateDoc(ref, renameUpdate({ name: 'outro.pdf' })))
          await assertFails(
            updateDoc(ref, renameUpdate({ storagePath: 'processes/p1/documents/coaOriginal/9-admin-1-outro.pdf' }))
          )
          await assertFails(updateDoc(ref, renameUpdate({ slotKey: 'coaOriginal:outro' })))
          await assertFails(updateDoc(ref, renameUpdate({ type: 'other' })))
          await assertFails(updateDoc(ref, renameUpdate({ uploadedById: 'admin-2' })))
        })

        it('update sem carimbos (so description) ou com descriptionUpdatedAt fora do request.time falha', async () => {
          await seed((db) => setDoc(doc(db, coaPath), coaFields({ uploadedAt: new Date() })))
          const ref = doc(admin('admin-1'), coaPath)
          await assertFails(updateDoc(ref, { description: 'Lote ABC-123' }))
          await assertFails(updateDoc(ref, renameUpdate({ descriptionUpdatedAt: new Date('2020-01-01') })))
          await assertFails(updateDoc(ref, renameUpdate({ descriptionUpdatedById: 'admin-2' })))
        })

        it('o mesmo update continua falhando em BL (so other e coaOriginal renomeiam)', async () => {
          await seed((db) => setDoc(doc(db, 'processes/p1/documents/b1'), baseFields({ uploadedAt: new Date() })))
          await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/b1'), renameUpdate()))
        })
      })

      // S11-D1: vincular o COA a uma PO (so admin, so CONSOLIDADO, so poNumber + carimbos).
      describe('vincular a uma PO (poNumber + carimbos)', () => {
        const legacyPath = 'processes/p-consolidado/documents/legado'
        const fclPath = 'processes/p1/documents/fcl1'
        const lclPath = 'processes/p-lcl/documents/lcl1'
        const invoicePath = 'processes/p-consolidado/documents/inv1'

        beforeEach(async () => {
          await seed(async (db) => {
            await setDoc(doc(db, consolidatedPath), consolidatedCoaFields({ uploadedAt: new Date() }))
            await setDoc(
              doc(db, legacyPath),
              consolidatedCoaWithoutPo({ slotKey: 'coaOriginal', uploadedAt: new Date() })
            )
            await setDoc(
              doc(db, fclPath),
              coaFields({ slotKey: 'coaOriginal:fcl1', uploadedAt: new Date() })
            )
            await setDoc(
              doc(db, lclPath),
              coaFields({
                slotKey: 'coaOriginal:lcl1',
                storagePath: 'processes/p-lcl/documents/coaOriginal/1-admin-1-coa.pdf',
                uploadedAt: new Date(),
              })
            )
            await setDoc(
              doc(db, invoicePath),
              baseFields({
                type: 'invoice',
                slotKey: 'invoice:PO-1',
                poNumber: 'PO-1',
                storagePath: 'processes/p-consolidado/documents/invoice/PO-1/1-admin-1-inv.pdf',
                uploadedAt: new Date(),
              })
            )
          })
        })

        it('admin vincula o COA legado (slot coaOriginal, sem poNumber) a uma PO', async () => {
          await assertSucceeds(updateDoc(doc(admin('admin-1'), legacyPath), linkUpdate()))
        })

        it('admin vincula COA novo sem poNumber e troca a PO de um COA que ja tem (PO removida)', async () => {
          await seed((db) =>
            setDoc(
              doc(db, 'processes/p-consolidado/documents/semPo'),
              consolidatedCoaWithoutPo({ slotKey: 'coaOriginal:semPo', uploadedAt: new Date() })
            )
          )
          await assertSucceeds(updateDoc(doc(admin('admin-1'), 'processes/p-consolidado/documents/semPo'), linkUpdate()))
          await assertSucceeds(updateDoc(doc(admin('admin-1'), consolidatedPath), linkUpdate({ poNumber: 'PO-9' })))
        })

        it('vincular mantem slot, storagePath e name (so poNumber e carimbos mudam)', async () => {
          await assertSucceeds(updateDoc(doc(admin('admin-1'), legacyPath), linkUpdate()))
          const snapshot = await assertSucceeds(getDoc(doc(admin('admin-1'), legacyPath)))
          expect(snapshot.data().poNumber).toBe('PO-2')
          expect(snapshot.data().slotKey).toBe('coaOriginal')
          expect(snapshot.data().storagePath).toBe('processes/p-consolidado/documents/coaOriginal/1-admin-1-coa.pdf')
          expect(snapshot.data().poNumberUpdatedById).toBe('admin-1')
        })

        it('poNumber com 1 e 64 caracteres passa; vazio, 65, nao-string, nulo e remocao falham', async () => {
          const ref = doc(admin('admin-1'), legacyPath)
          await assertSucceeds(updateDoc(ref, linkUpdate({ poNumber: 'P' })))
          await assertSucceeds(updateDoc(ref, linkUpdate({ poNumber: 'P'.repeat(64) })))
          for (const poNumber of ['', 'P'.repeat(65), 123, null, true, ['PO-1']]) {
            await assertFails(updateDoc(ref, linkUpdate({ poNumber })))
          }
          await assertFails(updateDoc(doc(admin('admin-1'), consolidatedPath), linkUpdate({ poNumber: deleteField() })))
        })

        it('processo FCL ou LCL: vincular falha (com ou sem poNumber previo)', async () => {
          await assertFails(updateDoc(doc(admin('admin-1'), fclPath), linkUpdate()))
          await assertFails(updateDoc(doc(admin('admin-1'), lclPath), linkUpdate()))
        })

        it('vincular junto com name, storagePath, description, slotKey, type, uploadedAt ou uploadedById falha', async () => {
          const ref = doc(admin('admin-1'), legacyPath)
          await assertFails(updateDoc(ref, linkUpdate({ name: 'outro.pdf' })))
          await assertFails(
            updateDoc(
              ref,
              linkUpdate({ storagePath: 'processes/p-consolidado/documents/coaOriginal/9-admin-1-outro.pdf' })
            )
          )
          await assertFails(updateDoc(ref, linkUpdate({ description: 'Lote ABC-123' })))
          await assertFails(updateDoc(ref, linkUpdate({ slotKey: 'coaOriginal:outro' })))
          await assertFails(updateDoc(ref, linkUpdate({ type: 'other' })))
          await assertFails(updateDoc(ref, linkUpdate({ uploadedAt: new Date('2020-01-01') })))
          await assertFails(updateDoc(ref, linkUpdate({ uploadedById: 'admin-2' })))
          await assertFails(updateDoc(ref, linkUpdate({ size: 1 })))
          await assertFails(updateDoc(ref, linkUpdate({ alsoPackingList: true })))
        })

        it('renomear junto com poNumber falha (cada update faz uma coisa so)', async () => {
          await assertFails(
            updateDoc(doc(admin('admin-1'), legacyPath), {
              description: 'Lote ABC-123',
              descriptionUpdatedAt: serverTimestamp(),
              descriptionUpdatedById: 'admin-1',
              poNumber: 'PO-2',
            })
          )
        })

        it('sem carimbos, com poNumberUpdatedAt fora do request.time ou carimbo de outro uid falha', async () => {
          const ref = doc(admin('admin-1'), legacyPath)
          await assertFails(updateDoc(ref, { poNumber: 'PO-2' }))
          await assertFails(updateDoc(ref, { poNumber: 'PO-2', poNumberUpdatedAt: serverTimestamp() }))
          await assertFails(updateDoc(ref, { poNumber: 'PO-2', poNumberUpdatedById: 'admin-1' }))
          await assertFails(updateDoc(ref, linkUpdate({ poNumberUpdatedAt: new Date('2020-01-01') })))
          await assertFails(updateDoc(ref, linkUpdate({ poNumberUpdatedById: 'admin-2' })))
        })

        it.each(['logistica', 'tecnico', 'faturamento'])('%s NAO vincula o COA a uma PO', async (role) => {
          const stamp = { poNumberUpdatedById: `${role}-1` }
          await assertFails(updateDoc(doc(staffDb(role), legacyPath), linkUpdate(stamp)))
          await assertFails(updateDoc(doc(staffDb(role), consolidatedPath), linkUpdate(stamp)))
        })

        it('usuario comum e anonimo NAO vinculam o COA a uma PO', async () => {
          await assertFails(updateDoc(doc(approvedUser('user-1'), legacyPath), linkUpdate({ poNumberUpdatedById: 'user-1' })))
          await assertFails(updateDoc(doc(anon(), legacyPath), linkUpdate()))
        })

        it('o mesmo update falha em invoice, packingList, bl e other (so coaOriginal vincula PO)', async () => {
          await seed(async (db) => {
            await setDoc(
              doc(db, 'processes/p-consolidado/documents/pl1'),
              baseFields({
                type: 'packingList',
                slotKey: 'packingList:PO-1',
                poNumber: 'PO-1',
                storagePath: 'processes/p-consolidado/documents/packingList/PO-1/1-admin-1-pl.pdf',
                uploadedAt: new Date(),
              })
            )
            await setDoc(
              doc(db, 'processes/p-consolidado/documents/b1'),
              baseFields({ storagePath: 'processes/p-consolidado/documents/bl/1-admin-1-BL.pdf', uploadedAt: new Date() })
            )
            await setDoc(
              doc(db, 'processes/p-consolidado/documents/o1'),
              baseFields({
                type: 'other',
                slotKey: 'other:o1',
                description: 'Laudo',
                storagePath: 'processes/p-consolidado/documents/other/1-admin-1-laudo.pdf',
                uploadedAt: new Date(),
              })
            )
          })
          for (const path of [invoicePath, 'processes/p-consolidado/documents/pl1', 'processes/p-consolidado/documents/b1', 'processes/p-consolidado/documents/o1']) {
            await assertFails(updateDoc(doc(admin('admin-1'), path), linkUpdate()))
          }
        })

        it('o vinculo da PO nao abre outros updates: nome do COA e vinculo Invoice->PL continuam como antes', async () => {
          await assertSucceeds(
            updateDoc(doc(admin('admin-1'), consolidatedPath), {
              description: 'Lote ABC-123',
              descriptionUpdatedAt: serverTimestamp(),
              descriptionUpdatedById: 'admin-1',
            })
          )
          await assertSucceeds(
            updateDoc(doc(admin('admin-1'), invoicePath), {
              alsoPackingList: true,
              alsoPackingListUpdatedAt: serverTimestamp(),
              alsoPackingListUpdatedById: 'admin-1',
            })
          )
          await assertFails(updateDoc(doc(admin('admin-1'), consolidatedPath), { name: 'outro.pdf' }))
        })

        it('admin, logistica, tecnico e faturamento leem o COA com poNumber; usuario comum nao', async () => {
          await assertSucceeds(getDoc(doc(admin('admin-1'), consolidatedPath)))
          await assertSucceeds(getDoc(doc(logistics('log-1'), consolidatedPath)))
          for (const role of ['tecnico', 'faturamento']) {
            await assertSucceeds(getDoc(doc(staffDb(role), consolidatedPath)))
            await assertSucceeds(getDoc(doc(staffDb(role), legacyPath)))
          }
          await assertFails(getDoc(doc(approvedUser('user-1'), consolidatedPath)))
        })

        it('leitor lista os COAs do consolidado com where(type in [cargoReport, coaOriginal])', async () => {
          const snapshot = await assertSucceeds(
            getDocs(
              query(
                collection(staffDb('tecnico'), 'processes/p-consolidado/documents'),
                where('type', 'in', ['cargoReport', 'coaOriginal'])
              )
            )
          )
          expect(snapshot.docs.map((item) => item.id).sort()).toEqual(['d1', 'legado'])
        })

        it('admin exclui o COA com poNumber e o legado sem PO; logistica, tecnico e faturamento NAO', async () => {
          for (const role of ['logistica', 'tecnico', 'faturamento']) {
            await assertFails(deleteDoc(doc(staffDb(role), consolidatedPath)))
            await assertFails(deleteDoc(doc(staffDb(role), legacyPath)))
          }
          await assertSucceeds(deleteDoc(doc(admin('admin-1'), consolidatedPath)))
          await assertSucceeds(deleteDoc(doc(admin('admin-1'), legacyPath)))
        })
      })

      describe('excluir', () => {
        it('admin exclui o COA novo e o legado; logistica, tecnico e faturamento NAO', async () => {
          await seed(async (db) => {
            await setDoc(doc(db, coaPath), coaFields({ uploadedAt: new Date() }))
            await setDoc(doc(db, 'processes/p1/documents/legado'), coaFields({ slotKey: 'coaOriginal', uploadedAt: new Date() }))
          })
          for (const role of ['logistica', 'tecnico', 'faturamento']) {
            await assertFails(deleteDoc(doc(staffDb(role), coaPath)))
          }
          await assertSucceeds(deleteDoc(doc(admin('admin-1'), coaPath)))
          await assertSucceeds(deleteDoc(doc(admin('admin-1'), 'processes/p1/documents/legado')))
        })
      })
    })

    // Invoice que tambem contem o Packing List: unico update permitido em
    // documento (admin, doc invoice, so as 3 chaves do vinculo).
    describe('vinculo Invoice -> Packing List (alsoPackingList)', () => {
      const invoiceFields = (overrides = {}) =>
        baseFields({
          type: 'invoice',
          slotKey: 'invoice',
          storagePath: 'processes/p1/documents/invoice/1-admin-1-inv.pdf',
          ...overrides,
        })
      const linkUpdate = (overrides = {}) => ({
        alsoPackingList: true,
        alsoPackingListUpdatedAt: serverTimestamp(),
        alsoPackingListUpdatedById: 'admin-1',
        ...overrides,
      })
      const invoicePath = 'processes/p1/documents/inv1'

      it('admin cria invoice com alsoPackingList: true', async () => {
        await assertSucceeds(
          setDoc(doc(admin('admin-1'), invoicePath), invoiceFields({ alsoPackingList: true }))
        )
      })

      it('admin cria invoice com alsoPackingList: false', async () => {
        await assertSucceeds(
          setDoc(doc(admin('admin-1'), invoicePath), invoiceFields({ alsoPackingList: false }))
        )
      })

      it('alsoPackingList em documento que nao e invoice falha (bl e packingList)', async () => {
        await assertFails(setDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), baseFields({ alsoPackingList: true })))
        await assertFails(
          setDoc(
            doc(admin('admin-1'), 'processes/p1/documents/d2'),
            baseFields({
              type: 'packingList',
              slotKey: 'packingList',
              storagePath: 'processes/p1/documents/packingList/1-admin-1-pl.pdf',
              alsoPackingList: true,
            })
          )
        )
      })

      it('alsoPackingList nao booleano falha no create', async () => {
        await assertFails(setDoc(doc(admin('admin-1'), invoicePath), invoiceFields({ alsoPackingList: 'sim' })))
        await assertFails(setDoc(doc(admin('admin-1'), invoicePath), invoiceFields({ alsoPackingList: 1 })))
      })

      it('admin atualiza o vinculo na invoice com as 3 chaves validas (marcar e desmarcar)', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertSucceeds(updateDoc(doc(admin('admin-1'), invoicePath), linkUpdate()))
        await assertSucceeds(updateDoc(doc(admin('admin-1'), invoicePath), linkUpdate({ alsoPackingList: false })))
      })

      it('o mesmo update em documento bl falha', async () => {
        await seed((db) => setDoc(doc(db, 'processes/p1/documents/d1'), baseFields()))
        await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), linkUpdate()))
      })

      it('o mesmo update em packingList falha', async () => {
        await seed((db) =>
          setDoc(
            doc(db, 'processes/p1/documents/pl1'),
            baseFields({
              type: 'packingList',
              slotKey: 'packingList',
              storagePath: 'processes/p1/documents/packingList/1-admin-1-pl.pdf',
            })
          )
        )
        await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/pl1'), linkUpdate()))
      })

      it('update junto com name, storagePath, slotKey, type ou uploadedById falha', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        const ref = doc(admin('admin-1'), invoicePath)
        await assertFails(updateDoc(ref, linkUpdate({ name: 'outro.pdf' })))
        await assertFails(updateDoc(ref, linkUpdate({ storagePath: 'processes/p1/documents/invoice/x.pdf' })))
        await assertFails(updateDoc(ref, linkUpdate({ slotKey: 'invoice:PO-1' })))
        await assertFails(updateDoc(ref, linkUpdate({ type: 'bl' })))
        await assertFails(updateDoc(ref, linkUpdate({ uploadedById: 'admin-2' })))
      })

      it('update so de name/storagePath na invoice falha', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        const ref = doc(admin('admin-1'), invoicePath)
        await assertFails(updateDoc(ref, { name: 'outro.pdf' }))
        await assertFails(updateDoc(ref, { storagePath: 'processes/p1/documents/invoice/x.pdf' }))
      })

      it('update com chave extra desconhecida falha', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertFails(updateDoc(doc(admin('admin-1'), invoicePath), linkUpdate({ extra: 'x' })))
      })

      it('update com alsoPackingList nao booleano falha', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertFails(updateDoc(doc(admin('admin-1'), invoicePath), linkUpdate({ alsoPackingList: 'sim' })))
      })

      it('update com alsoPackingListUpdatedById de outro uid falha', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertFails(
          updateDoc(doc(admin('admin-1'), invoicePath), linkUpdate({ alsoPackingListUpdatedById: 'admin-2' }))
        )
      })

      it('update com alsoPackingListUpdatedAt fora do request.time falha', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertFails(
          updateDoc(doc(admin('admin-1'), invoicePath), linkUpdate({ alsoPackingListUpdatedAt: new Date('2020-01-01') }))
        )
      })

      it('update sem a trilha de auditoria (so o booleano) falha', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertFails(updateDoc(doc(admin('admin-1'), invoicePath), { alsoPackingList: true }))
      })

      it('logistica nao atualiza o vinculo', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertFails(
          updateDoc(doc(logistics('log-1'), invoicePath), linkUpdate({ alsoPackingListUpdatedById: 'log-1' }))
        )
      })

      it('usuario aprovado comum e anonimo nao atualizam o vinculo', async () => {
        await seed((db) => setDoc(doc(db, invoicePath), invoiceFields()))
        await assertFails(
          updateDoc(doc(approvedUser('user-1'), invoicePath), linkUpdate({ alsoPackingListUpdatedById: 'user-1' }))
        )
        await assertFails(updateDoc(doc(anon(), invoicePath), linkUpdate()))
      })
    })

    // Renomear o documento adicional: admin muda so o nome exibido
    // (`description`) + trilha de auditoria; nunca o arquivo nem outro tipo.
    describe('renomear documento adicional (description)', () => {
      const otherFields = (overrides = {}) =>
        baseFields({
          type: 'other',
          slotKey: 'other:o1',
          description: 'Certificado',
          storagePath: 'processes/p1/documents/other/1-admin-1-cert.pdf',
          ...overrides,
        })
      const renameUpdate = (overrides = {}) => ({
        description: 'Laudo técnico',
        descriptionUpdatedAt: serverTimestamp(),
        descriptionUpdatedById: 'admin-1',
        ...overrides,
      })
      const otherPath = 'processes/p1/documents/o1'

      it('admin renomeia o documento adicional (description + carimbos)', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        await assertSucceeds(updateDoc(doc(admin('admin-1'), otherPath), renameUpdate()))
      })

      it('admin renomeia o documento adicional no CONSOLIDADO', async () => {
        const path = 'processes/p-consolidado/documents/o1'
        await seed((db) =>
          setDoc(
            doc(db, path),
            otherFields({ storagePath: 'processes/p-consolidado/documents/other/1-admin-1-cert.pdf' })
          )
        )
        await assertSucceeds(updateDoc(doc(admin('admin-1'), path), renameUpdate()))
      })

      it('aceita description com 1 e com 120 caracteres (mesmo limite do create)', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        const ref = doc(admin('admin-1'), otherPath)
        await assertSucceeds(updateDoc(ref, renameUpdate({ description: 'A' })))
        await assertSucceeds(updateDoc(ref, renameUpdate({ description: 'x'.repeat(120) })))
      })

      // Base do tratamento no painel: documento excluido por outro admin com o dialogo
      // aberto vira permission-denied (nao not-found), entao a UI recarrega a lista.
      it('renomear documento que nao existe mais (excluido) falha', async () => {
        await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/gone'), renameUpdate()))
      })

      it('o mesmo update em bl falha', async () => {
        await seed((db) => setDoc(doc(db, 'processes/p1/documents/d1'), baseFields()))
        await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), renameUpdate()))
      })

      it('o mesmo update em invoice falha', async () => {
        await seed((db) =>
          setDoc(
            doc(db, 'processes/p1/documents/inv1'),
            baseFields({
              type: 'invoice',
              slotKey: 'invoice',
              storagePath: 'processes/p1/documents/invoice/1-admin-1-inv.pdf',
            })
          )
        )
        await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/inv1'), renameUpdate()))
      })

      it('o mesmo update em packingList, cargoReport, fispq e containerWash falha', async () => {
        await seed(async (db) => {
          await setDoc(
            doc(db, 'processes/p1/documents/pl1'),
            baseFields({
              type: 'packingList',
              slotKey: 'packingList',
              storagePath: 'processes/p1/documents/packingList/1-admin-1-pl.pdf',
            })
          )
          await setDoc(
            doc(db, 'processes/p1/documents/cr1'),
            baseFields({
              type: 'cargoReport',
              slotKey: 'cargoReport',
              storagePath: 'processes/p1/documents/cargoReport/1-admin-1-cr.pdf',
            })
          )
          await setDoc(
            doc(db, 'processes/p1/documents/fq1'),
            baseFields({
              type: 'fispq',
              slotKey: 'fispq:ITEM-1',
              itemId: 'ITEM-1',
              storagePath: 'processes/p1/documents/fispq/ITEM-1/1-admin-1-fispq.pdf',
            })
          )
          await setDoc(
            doc(db, 'processes/p1/documents/cw1'),
            baseFields({
              type: 'containerWash',
              slotKey: 'containerWash:C-1',
              containerId: 'C-1',
              storagePath: 'processes/p1/documents/containerWash/C-1/1-admin-1-wash.pdf',
            })
          )
        })
        for (const id of ['pl1', 'cr1', 'fq1', 'cw1']) {
          await assertFails(updateDoc(doc(admin('admin-1'), `processes/p1/documents/${id}`), renameUpdate()))
        }
      })

      it('renomear junto com name, storagePath, slotKey, type ou uploadedById falha', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        const ref = doc(admin('admin-1'), otherPath)
        await assertFails(updateDoc(ref, renameUpdate({ name: 'outro.pdf' })))
        await assertFails(updateDoc(ref, renameUpdate({ storagePath: 'processes/p1/documents/other/x.pdf' })))
        await assertFails(updateDoc(ref, renameUpdate({ slotKey: 'other:o2' })))
        await assertFails(updateDoc(ref, renameUpdate({ type: 'bl' })))
        await assertFails(updateDoc(ref, renameUpdate({ uploadedById: 'admin-2' })))
      })

      it('update so de name/storagePath no documento adicional falha', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        const ref = doc(admin('admin-1'), otherPath)
        await assertFails(updateDoc(ref, { name: 'outro.pdf' }))
        await assertFails(updateDoc(ref, { storagePath: 'processes/p1/documents/other/x.pdf' }))
      })

      it('description vazia, com mais de 120 caracteres ou nao string falha', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        const ref = doc(admin('admin-1'), otherPath)
        await assertFails(updateDoc(ref, renameUpdate({ description: '' })))
        await assertFails(updateDoc(ref, renameUpdate({ description: 'x'.repeat(121) })))
        await assertFails(updateDoc(ref, renameUpdate({ description: 123 })))
      })

      it('update sem os carimbos (so description) falha', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        await assertFails(updateDoc(doc(admin('admin-1'), otherPath), { description: 'Laudo técnico' }))
      })

      it('update com descriptionUpdatedById de outro uid falha', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        await assertFails(
          updateDoc(doc(admin('admin-1'), otherPath), renameUpdate({ descriptionUpdatedById: 'admin-2' }))
        )
      })

      it('update com descriptionUpdatedAt fora do request.time falha', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        await assertFails(
          updateDoc(doc(admin('admin-1'), otherPath), renameUpdate({ descriptionUpdatedAt: new Date('2020-01-01') }))
        )
      })

      it('update com chave extra desconhecida falha', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        await assertFails(updateDoc(doc(admin('admin-1'), otherPath), renameUpdate({ extra: 'x' })))
      })

      it('misturar renome com o vinculo Invoice->Packing List falha (no other e na invoice)', async () => {
        const mixed = {
          alsoPackingList: true,
          alsoPackingListUpdatedAt: serverTimestamp(),
          alsoPackingListUpdatedById: 'admin-1',
        }
        await seed(async (db) => {
          await setDoc(doc(db, otherPath), otherFields())
          await setDoc(
            doc(db, 'processes/p1/documents/inv1'),
            baseFields({
              type: 'invoice',
              slotKey: 'invoice',
              storagePath: 'processes/p1/documents/invoice/1-admin-1-inv.pdf',
            })
          )
        })
        await assertFails(updateDoc(doc(admin('admin-1'), otherPath), renameUpdate(mixed)))
        await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/inv1'), renameUpdate(mixed)))
      })

      it('logistica nao renomeia', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        await assertFails(
          updateDoc(doc(logistics('log-1'), otherPath), renameUpdate({ descriptionUpdatedById: 'log-1' }))
        )
      })

      it('usuario aprovado comum e anonimo nao renomeiam', async () => {
        await seed((db) => setDoc(doc(db, otherPath), otherFields()))
        await assertFails(
          updateDoc(doc(approvedUser('user-1'), otherPath), renameUpdate({ descriptionUpdatedById: 'user-1' }))
        )
        await assertFails(updateDoc(doc(anon(), otherPath), renameUpdate()))
      })

      it('o vinculo Invoice->Packing List continua funcionando com a rule combinada', async () => {
        await seed((db) =>
          setDoc(
            doc(db, 'processes/p1/documents/inv1'),
            baseFields({
              type: 'invoice',
              slotKey: 'invoice',
              storagePath: 'processes/p1/documents/invoice/1-admin-1-inv.pdf',
            })
          )
        )
        await assertSucceeds(
          updateDoc(doc(admin('admin-1'), 'processes/p1/documents/inv1'), {
            alsoPackingList: true,
            alsoPackingListUpdatedAt: serverTimestamp(),
            alsoPackingListUpdatedById: 'admin-1',
          })
        )
      })
    })

    it('update de name falha mesmo para admin (documento imutavel, exceto o vinculo Invoice->Packing List e o renome do documento adicional)', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/documents/d1'), baseFields()))
      await assertFails(updateDoc(doc(admin('admin-1'), 'processes/p1/documents/d1'), { name: 'outro.pdf' }))
    })

    it('logistica apaga o proprio; NAO apaga o de outro', async () => {
      await seed(async (db) => {
        await setDoc(doc(db, 'processes/p1/documents/own'), baseFields({ uploadedById: 'log-1' }))
        await setDoc(doc(db, 'processes/p1/documents/other-doc'), baseFields({ uploadedById: 'admin-1' }))
      })
      await assertSucceeds(deleteDoc(doc(logistics('log-1'), 'processes/p1/documents/own')))
      await assertFails(deleteDoc(doc(logistics('log-1'), 'processes/p1/documents/other-doc')))
    })

    it('admin apaga qualquer documento', async () => {
      await seed((db) => setDoc(doc(db, 'processes/p1/documents/d1'), baseFields({ uploadedById: 'log-1' })))
      await assertSucceeds(deleteDoc(doc(admin('admin-1'), 'processes/p1/documents/d1')))
    })
  })

  describe('coaReads (leitura de COA)', () => {
    const readPath = 'processes/p1/coaReads/d1'
    const staffDb = (role, uid = `${role}-1`, overrides = {}) =>
      testEnv
        .authenticatedContext(uid, { email: `${role}@sqquimica.com`, role, status: 'Ativo', name: 'Equipe', ...overrides })
        .firestore()

    beforeEach(async () => {
      await seed((db) =>
        setDoc(doc(db, readPath), {
          schemaVersion: 1,
          promptVersion: 'coa-tess-2026-11-25',
          status: 'done',
          documentType: 'coa',
          certificates: [],
          attempts: 1,
        })
      )
    })

    it('admin le o resultado e lista a subcolecao', async () => {
      await assertSucceeds(getDoc(doc(admin('admin-1'), readPath)))
      await assertSucceeds(getDocs(collection(admin('admin-1'), 'processes/p1/coaReads')))
    })

    it.each(['logistica', 'tecnico', 'faturamento', 'user', 'compras', 'viewer'])('%s NAO le nem lista', async (role) => {
      const db = staffDb(role)
      await assertFails(getDoc(doc(db, readPath)))
      await assertFails(getDocs(collection(db, 'processes/p1/coaReads')))
    })

    it('anonimo NAO le', async () => {
      await assertFails(getDoc(doc(anon(), readPath)))
      await assertFails(getDocs(collection(anon(), 'processes/p1/coaReads')))
    })

    it('admin bloqueado ou com e-mail externo NAO le', async () => {
      await assertFails(getDoc(doc(admin('admin-2', { status: 'Bloqueado' }), readPath)))
      await assertFails(getDoc(doc(admin('admin-3', { email: 'externo@gmail.com' }), readPath)))
    })

    it('nenhum cliente grava: admin nao cria, atualiza nem apaga; logistica nao cria', async () => {
      const adminDb = admin('admin-1')
      await assertFails(setDoc(doc(adminDb, 'processes/p1/coaReads/d2'), { status: 'done' }))
      await assertFails(updateDoc(doc(adminDb, readPath), { status: 'failed' }))
      await assertFails(deleteDoc(doc(adminDb, readPath)))
      await assertFails(setDoc(doc(staffDb('logistica'), 'processes/p1/coaReads/d3'), { status: 'done' }))
    })
  })

  describe('colecoes admin-only (forecastSettings / news / barra)', () => {
    // PR #2 do backlog (auditoria preventiva de drift): harden admin
    // com hasOnly. Cada colecao agora tem allowlist propria.
    // news e forecastSettings NAO foram hardenizadas neste PR (escopo
    // do PR era processes/announcements/barra). Mantemos o spec generico
    // para essas 2.
    for (const col of ['forecastSettings', 'news']) {
      it(`${col}: usuario aprovado le, mas nao escreve; admin escreve`, async () => {
        await assertSucceeds(getDoc(doc(approvedUser(), `${col}/x`)))
        await assertFails(setDoc(doc(approvedUser(), `${col}/x`), { a: 1 }))
        await assertSucceeds(setDoc(doc(admin(), `${col}/x`), { a: 1 }))
      })
    }

    // barra: hasOnly([status, notes, updatedAt]).
    it('barra: admin escreve com campos validos', async () => {
      await assertSucceeds(
        setDoc(doc(admin(), 'barra/current'), {
          status: 'PRATICAVEL',
          notes: '',
          updatedAt: new Date(),
        })
      )
    })

    it('barra: admin NAO escreve com campo fora da allowlist', async () => {
      await assertFails(
        setDoc(doc(admin(), 'barra/x'), {
          status: 'PRATICAVEL',
          notes: '',
          updatedAt: new Date(),
          forbiddenField: 'qualquer',
        })
      )
    })

    it('barra: usuario aprovado NAO escreve', async () => {
      await assertFails(
        setDoc(doc(approvedUser(), 'barra/x'), {
          status: 'PRATICAVEL',
          notes: '',
          updatedAt: new Date(),
        })
      )
    })
  })

  describe('barra/suggestion (F13 — sugestao semi-automatica da Praticagem)', () => {
    // F13 (backlog 2026-07-12): barra/suggestion e' gravada pelo script
    // syncBarStatus.mjs via service account (REST, bypassa rules). Read
    // admin-only (pro banner "Fonte externa sugere" no AdminBarStatusPanel),
    // write fechado. Igual externalNewsDlq.
    it('admin le barra/suggestion', async () => {
      await assertSucceeds(getDoc(doc(admin(), 'barra/suggestion')))
    })

    it('usuario aprovado NAO le barra/suggestion', async () => {
      await assertFails(getDoc(doc(approvedUser(), 'barra/suggestion')))
    })

    it('logistica NAO le barra/suggestion', async () => {
      await assertFails(getDoc(doc(logistics(), 'barra/suggestion')))
    })

    it('anonimo NAO le barra/suggestion', async () => {
      await assertFails(getDoc(doc(anon(), 'barra/suggestion')))
    })

    it('admin NAO escreve barra/suggestion (so service account via REST)', async () => {
      await assertFails(
        setDoc(doc(admin(), 'barra/suggestion'), {
          status: 'PRATICAVEL',
          sourceName: 'Praticagem ZP21',
        })
      )
    })
  })

  describe('forecastSettings — regras de previsao (read approved / write admin, sem allowlist)', () => {
    // A rule de forecastSettings (firestore.rules) e' puramente por role:
    // read: isApprovedUser(); create/update/delete: isAdmin(). NAO tem
    // allowlist de campo (diferente de barra/processes/announcements), entao
    // os casos cobrem role + os verbos CRUD que a rule concede, com o payload
    // real gravado por saveForecastSettings (forecastSettings/current).
    const forecastPayload = () => ({
      destinations: [
        { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
        { match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 0 },
      ],
      categoryBusinessDays: { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 },
      rollingCustoms: {
        enabled: true,
        businessDaysAfterBerth: 3,
        appliesTo: ['FCL', 'CONSOLIDADO'],
        duimpStatuses: ['aguardando registro'],
      },
      updatedAt: new Date(),
      updatedBy: { uid: 'admin-1', name: 'Admin' },
    })

    it('admin cria/atualiza forecastSettings com o payload real (merge)', async () => {
      await assertSucceeds(setDoc(doc(admin(), 'forecastSettings/current'), forecastPayload()))
    })

    it('admin atualiza doc existente (rollingCustoms.enabled off)', async () => {
      await seed((db) => setDoc(doc(db, 'forecastSettings/current'), forecastPayload()))
      await assertSucceeds(
        updateDoc(doc(admin(), 'forecastSettings/current'), {
          'rollingCustoms.enabled': false,
          updatedAt: new Date(),
        })
      )
    })

    it('admin apaga forecastSettings (a rule concede delete)', async () => {
      await seed((db) => setDoc(doc(db, 'forecastSettings/current'), forecastPayload()))
      await assertSucceeds(deleteDoc(doc(admin(), 'forecastSettings/current')))
    })

    it('logistica le mas NAO escreve nem apaga', async () => {
      await seed((db) => setDoc(doc(db, 'forecastSettings/current'), forecastPayload()))
      await assertSucceeds(getDoc(doc(logistics(), 'forecastSettings/current')))
      await assertFails(setDoc(doc(logistics(), 'forecastSettings/current'), forecastPayload()))
      await assertFails(deleteDoc(doc(logistics(), 'forecastSettings/current')))
    })

    it('usuario comum aprovado le mas NAO escreve', async () => {
      await seed((db) => setDoc(doc(db, 'forecastSettings/current'), forecastPayload()))
      await assertSucceeds(getDoc(doc(approvedUser(), 'forecastSettings/current')))
      await assertFails(setDoc(doc(approvedUser(), 'forecastSettings/current'), forecastPayload()))
    })

    it('usuario nao-aprovado (status Pendente) NAO le', async () => {
      await seed((db) => setDoc(doc(db, 'forecastSettings/current'), forecastPayload()))
      const pending = approvedUser('pend-1', { status: 'Pendente' })
      await assertFails(getDoc(doc(pending, 'forecastSettings/current')))
    })

    it('anonimo NAO le forecastSettings', async () => {
      await seed((db) => setDoc(doc(db, 'forecastSettings/current'), forecastPayload()))
      await assertFails(getDoc(doc(anon(), 'forecastSettings/current')))
    })
  })

  describe('announcements — admin hasOnly', () => {
    // PR #2 do backlog: hasOnly([title, content, channel, updatedAt])
    // para update; create adiciona createdAt.
    it('admin cria announcement com campos validos', async () => {
      const db = admin('admin-1')
      await assertSucceeds(
        setDoc(doc(db, 'announcements/a1'), {
          title: 'T',
          content: 'C',
          channel: 'geral',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      )
    })

    it('admin atualiza announcement com campos validos', async () => {
      await seed((db) =>
        setDoc(doc(db, 'announcements/a2'), { title: 'Orig', content: 'C' })
      )
      const db = admin('admin-1')
      await assertSucceeds(
        updateDoc(doc(db, 'announcements/a2'), {
          title: 'Edit',
          content: 'C2',
          channel: 'geral',
          updatedAt: new Date(),
        })
      )
    })

    it('admin NAO escreve announcement com campo fora da allowlist', async () => {
      const db = admin('admin-1')
      await assertFails(
        setDoc(doc(db, 'announcements/a3'), {
          title: 'T',
          content: 'C',
          channel: 'geral',
          createdAt: new Date(),
          updatedAt: new Date(),
          forbiddenField: 'qualquer',
        })
      )
    })

    it('usuario aprovado NAO escreve announcement', async () => {
      await assertFails(
        setDoc(doc(approvedUser(), 'announcements/a4'), {
          title: 'T',
          content: 'C',
          channel: 'geral',
          updatedAt: new Date(),
        })
      )
    })
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

    it('reproduz o setDoc merge de ensureUserProfile (AuthContext.jsx) apos aprovacao do admin', async () => {
      const db = approvedUser('user-1')
      await assertSucceeds(
        setDoc(
          doc(db, 'users/user-1'),
          {
            uid: 'user-1',
            name: 'maria.leonor@sqquimica.com',
            area: 'Geral',
            lastAccess: '2026-07-23T19:19:15.244Z',
            favoriteProcessIds: [],
            notes: 'Cadastro corporativo aguardando aprovação administrativa.',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      )
    })

    // Bug de prod 2026-07-23: notificationPreferences: null e' o default
    // gravado pelo ensureUserProfile ate' o usuario configurar preferencias
    // (buildBaseProfile). Um self-update que nao mexe nesse campo o preserva
    // como null (vindo do doc existente) — sem o `== null` na rule, isso
    // negava TODO self-update (nome/area/favoritos/etc) de qualquer usuario
    // que nunca tivesse configurado notificacoes. Ver firestore.rules.
    it('permite self-update quando notificationPreferences existente e null (default de novo usuario)', async () => {
      await seed((db) =>
        setDoc(doc(db, 'users/user-3'), {
          uid: 'user-3',
          role: 'user',
          status: 'Ativo',
          statusTone: 'ok',
          email: 'user3@sqquimica.com',
          name: 'Maria Leonor Wiese',
          area: 'Geral',
          favoriteProcessIds: [],
          notificationPreferences: null,
        })
      )
      const db = approvedUser('user-3', { email: 'user3@sqquimica.com' })
      await assertSucceeds(
        setDoc(
          doc(db, 'users/user-3'),
          {
            uid: 'user-3',
            name: 'Maria Leonor Wiese',
            area: 'Geral',
            lastAccess: '2026-07-23T19:19:15.244Z',
            favoriteProcessIds: [],
            notes: 'Cadastro corporativo aguardando aprovação administrativa.',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      )
    })

    it('nega notificationPreferences com shape invalido (nem map nem null)', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(
          doc(db, 'users/user-1'),
          { notificationPreferences: 'ligado' },
          { merge: true }
        )
      )
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

  describe('supportTickets — aba de suporte (backlog 2026-07-10)', () => {
    const validTicket = (overrides = {}) => ({
      authorId: 'user-1',
      authorName: 'Usuario Teste',
      authorEmail: 'user@sqquimica.com',
      message: 'O dashboard nao carrega.',
      imageUrls: [],
      status: 'aberto',
      priority: 3,
      createdAt: 'now',
      updatedAt: 'now',
      ...overrides,
    })

    it('usuario aprovado cria o proprio chamado valido', async () => {
      const db = approvedUser('user-1')
      await assertSucceeds(setDoc(doc(db, 'supportTickets/t1'), validTicket()))
    })

    it('nega create com authorId de outro usuario', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'supportTickets/t2'), validTicket({ authorId: 'outro' }))
      )
    })

    it('nega create com authorEmail divergente do token', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'supportTickets/t3'), validTicket({ authorEmail: 'falso@sqquimica.com' }))
      )
    })

    it('nega create com status != aberto', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'supportTickets/t4'), validTicket({ status: 'resolvido' }))
      )
    })

    it('nega create com prioridade != 3 (default obrigatorio)', async () => {
      const db = approvedUser('user-1')
      await assertFails(setDoc(doc(db, 'supportTickets/t5'), validTicket({ priority: 5 })))
    })

    it('nega create com mensagem vazia', async () => {
      const db = approvedUser('user-1')
      await assertFails(setDoc(doc(db, 'supportTickets/t6'), validTicket({ message: '' })))
    })

    it('nega create com mais de 5 imagens', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(
          doc(db, 'supportTickets/t7'),
          validTicket({ imageUrls: ['a', 'b', 'c', 'd', 'e', 'f'] })
        )
      )
    })

    it('nega create com campo fora da allowlist', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'supportTickets/t8'), validTicket({ resolvedAt: 'hack' }))
      )
    })

    it('anonimo nao cria chamado', async () => {
      await assertFails(setDoc(doc(anon(), 'supportTickets/t9'), validTicket()))
    })

    it('autor le o proprio chamado; outro usuario nao', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tr'), validTicket()))
      await assertSucceeds(getDoc(doc(approvedUser('user-1'), 'supportTickets/tr')))
      await assertFails(
        getDoc(doc(approvedUser('user-2', { email: 'u2@sqquimica.com' }), 'supportTickets/tr'))
      )
    })

    it('admin le chamado de qualquer usuario', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tr2'), validTicket()))
      await assertSucceeds(getDoc(doc(admin(), 'supportTickets/tr2')))
    })

    it('admin atualiza status e prioridade (triagem)', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tu'), validTicket()))
      await assertSucceeds(
        updateDoc(doc(admin(), 'supportTickets/tu'), {
          status: 'resolvido',
          priority: 5,
          resolvedAt: 'now',
          resolvedById: 'admin-1',
          resolvedByName: 'Admin',
          updatedAt: 'now',
        })
      )
    })

    it('admin move o chamado para em_andamento (suporte v2)', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tu-ea'), validTicket()))
      await assertSucceeds(
        updateDoc(doc(admin(), 'supportTickets/tu-ea'), {
          status: 'em_andamento',
          priority: 4,
          updatedAt: 'now',
        })
      )
    })

    it('admin resolve o chamado com mensagem de resolucao', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tu-res-msg'), validTicket({ status: 'em_andamento' })))
      await assertSucceeds(
        updateDoc(doc(admin(), 'supportTickets/tu-res-msg'), {
          status: 'resolvido',
          priority: 4,
          resolvedAt: 'now',
          resolvedById: 'admin-1',
          resolvedByName: 'Admin E2E',
          resolutionMessage: 'Verifique se o cache do navegador esta limpo.',
          updatedAt: 'now',
        })
      )
    })

    it('nega create ja nascendo em_andamento (create exige aberto)', async () => {
      const db = approvedUser('user-1')
      await assertFails(
        setDoc(doc(db, 'supportTickets/t-ea'), validTicket({ status: 'em_andamento' }))
      )
    })

    it('nega update de admin com status fora da lista (aberto/em_andamento/resolvido)', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tu-inv'), validTicket()))
      await assertFails(
        updateDoc(doc(admin(), 'supportTickets/tu-inv'), {
          status: 'cancelado',
          priority: 3,
          updatedAt: 'now',
        })
      )
    })

    it('nega update de admin com prioridade fora de 1..5', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tu2'), validTicket()))
      await assertFails(
        updateDoc(doc(admin(), 'supportTickets/tu2'), {
          status: 'aberto',
          priority: 9,
          updatedAt: 'now',
        })
      )
    })

    it('nega update de admin fora da allowlist (mensagem do autor)', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tu3'), validTicket()))
      await assertFails(
        updateDoc(doc(admin(), 'supportTickets/tu3'), {
          status: 'aberto',
          priority: 3,
          message: 'admin reescrevendo a mensagem',
          updatedAt: 'now',
        })
      )
    })

    it('autor NAO atualiza o proprio chamado (triagem e do admin)', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tu4'), validTicket()))
      await assertFails(
        updateDoc(doc(approvedUser('user-1'), 'supportTickets/tu4'), {
          status: 'resolvido',
          priority: 3,
          updatedAt: 'now',
        })
      )
    })

    it('delete: admin pode, autor nao', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/td'), validTicket()))
      await assertFails(deleteDoc(doc(approvedUser('user-1'), 'supportTickets/td')))
      await assertSucceeds(deleteDoc(doc(admin(), 'supportTickets/td')))
    })

    it('admin adiciona replies (thread, suporte v3)', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tr-reply'), validTicket()))
      await assertSucceeds(
        updateDoc(doc(admin(), 'supportTickets/tr-reply'), {
          replies: [
            {
              id: 'reply-1',
              authorId: 'admin-1',
              authorName: 'Admin E2E',
              message: 'Estamos verificando o problema.',
              createdAt: 'now',
            },
          ],
          updatedAt: 'now',
        })
      )
    })

    it('nega admin encolhendo replies (append-only)', async () => {
      await seed((db) =>
        setDoc(
          doc(db, 'supportTickets/tr-shrink'),
          validTicket({
            replies: [
              {
                id: 'reply-1',
                authorId: 'admin-1',
                authorName: 'Admin E2E',
                message: 'Primeira resposta.',
                createdAt: 'now',
              },
              {
                id: 'reply-2',
                authorId: 'admin-1',
                authorName: 'Admin E2E',
                message: 'Segunda resposta.',
                createdAt: 'now',
              },
            ],
          })
        )
      )
      await assertFails(
        updateDoc(doc(admin(), 'supportTickets/tr-shrink'), {
          replies: [
            {
              id: 'reply-1',
              authorId: 'admin-1',
              authorName: 'Admin E2E',
              message: 'Primeira resposta.',
              createdAt: 'now',
            },
          ],
          updatedAt: 'now',
        })
      )
    })

    it('nega admin mandando 51 replies (teto)', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tr-teto'), validTicket()))
      const tooManyReplies = Array.from({ length: 51 }, (_, index) => ({
        id: `reply-${index}`,
        authorId: 'admin-1',
        authorName: 'Admin E2E',
        message: `Resposta ${index}`,
        createdAt: 'now',
      }))
      await assertFails(
        updateDoc(doc(admin(), 'supportTickets/tr-teto'), {
          replies: tooManyReplies,
          updatedAt: 'now',
        })
      )
    })

    it('autor nao-admin nao consegue escrever replies', async () => {
      await seed((db) => setDoc(doc(db, 'supportTickets/tr-autor'), validTicket()))
      await assertFails(
        updateDoc(doc(approvedUser('user-1'), 'supportTickets/tr-autor'), {
          replies: [
            {
              id: 'reply-1',
              authorId: 'user-1',
              authorName: 'Usuario Teste',
              message: 'Eu mesmo respondendo.',
              createdAt: 'now',
            },
          ],
          updatedAt: 'now',
        })
      )
    })
  })

  // ----------------------------------------------------------------
  // PR 3 (Importar do DBCorp): referencia do ERP. Colecoes SO admin; o hint e o
  // meta nao tem `delete`; o `latest` so' aponta para um meta que existe.
  // ----------------------------------------------------------------
  describe('erpSnapshots e erpProcessHints (PR 3)', () => {
    const SNAP = 'AbCdEfGhIjKlMnOpQrSt'
    const SNAP2 = 'ZyXwVuTsRqPoNmLkJiHg'
    const ADMIN_UID = 'admin-1'

    const validShipment = (overrides = {}) => ({
      kind: 'FCL',
      portalCategory: 'FCL',
      key: 'ALFA SEA 900-26',
      incoterm: 'CFR',
      originHint: '',
      stage: 1,
      statuses: ['EMBARCOU'],
      statusNf: ['Pendente'],
      orders: [{ pedido: '9000', poRef: 'ALFA SEA 900-26', poBase: '', exporter: 'ALFA CHEM' }],
      items: [{ commercialName: 'RESINA OMEGA', pedido: '9000', quantityKg: 1000 }],
      transport: {
        etd: '2026-10-06',
        eta: '2026-10-14',
        vessel: { name: 'ALFA MAERSK', raw: 'ALFA MAERSK 639W', voyage: '639W' },
        blAwb: '',
        origin: '',
        destination: '',
        diNumber: '',
        diDate: '',
      },
      conflicts: [],
      ...overrides,
    })

    const validCounts = () => ({
      erpRows: 10,
      shipments: 6,
      activeShipments: 5,
      matched: 2,
      matchedArchived: 0,
      matchedWithDiffs: 1,
      erpOnly: 3,
      portalOnly: 1,
      warnings: 4,
      hints: 2,
      hintsSkipped: 0,
    })

    const validMeta = (snapshotId = SNAP, overrides = {}) => ({
      snapshotId,
      createdAt: serverTimestamp(),
      createdById: ADMIN_UID,
      createdByName: 'Admin',
      sourceInfo: {
        source: 'dbcorp-xlsx',
        label: 'DBCorp (.xlsx)',
        fileName: 'planilha.xlsx',
        fetchedAt: '',
        rowCount: 10,
        generatedOn: '2026-10-02',
      },
      counts: validCounts(),
      ...overrides,
    })

    const validLatest = (snapshotId = SNAP, overrides = {}) => ({
      snapshotId,
      updatedAt: serverTimestamp(),
      updatedById: ADMIN_UID,
      updatedByName: 'Admin',
      fileName: 'planilha.xlsx',
      hints: 2,
      ...overrides,
    })

    const validHint = (snapshotId = SNAP, overrides = {}) => ({
      snapshotId,
      savedAt: serverTimestamp(),
      savedById: ADMIN_UID,
      matchRule: 'pedido',
      shipment: validShipment(),
      ...overrides,
    })

    // Seed (sem rules) de uma referencia completa ja existente.
    const seedReference = (snapshotId = SNAP) =>
      seed(async (db) => {
        await setDoc(doc(db, `erpSnapshots/${snapshotId}`), validMeta(snapshotId))
        await setDoc(doc(db, 'erpSnapshots/latest'), validLatest(snapshotId))
        await setDoc(doc(db, 'erpProcessHints/p-1'), validHint(snapshotId))
      })

    // `ops` = [[caminho, dados], ...] num unico batch, como o servico grava.
    const commitBatch = (db, ops) => {
      const batch = writeBatch(db)
      for (const [path, data] of ops) batch.set(doc(db, path), data)
      return batch.commit()
    }

    it('erp-rules: admin grava meta + 2 hints + latest num writeBatch e le os 4 e a query por snapshotId', async () => {
      const db = admin()
      await assertSucceeds(
        commitBatch(db, [
          [`erpSnapshots/${SNAP}`, validMeta()],
          ['erpProcessHints/p-1', validHint()],
          ['erpProcessHints/p-2', validHint(SNAP, { matchRule: 'consolidado:ref' })],
          ['erpSnapshots/latest', validLatest()],
        ])
      )
      await assertSucceeds(getDoc(doc(db, `erpSnapshots/${SNAP}`)))
      await assertSucceeds(getDoc(doc(db, 'erpSnapshots/latest')))
      await assertSucceeds(getDoc(doc(db, 'erpProcessHints/p-1')))
      await assertSucceeds(getDoc(doc(db, 'erpProcessHints/p-2')))
      const found = await assertSucceeds(
        getDocs(query(collection(db, 'erpProcessHints'), where('snapshotId', '==', SNAP)))
      )
      if (found.size !== 2) throw new Error(`esperava 2 hints, veio ${found.size}`)
    })

    it('erp-rules: logistica nao le nem grava', async () => {
      await seedReference()
      const db = logistics()
      await assertFails(getDoc(doc(db, `erpSnapshots/${SNAP}`)))
      await assertFails(getDoc(doc(db, 'erpSnapshots/latest')))
      await assertFails(getDoc(doc(db, 'erpProcessHints/p-1')))
      await assertFails(setDoc(doc(db, 'erpProcessHints/p-9'), validHint(SNAP, { savedById: 'log-1' })))
      await assertFails(setDoc(doc(db, `erpSnapshots/${SNAP2}`), validMeta(SNAP2, { createdById: 'log-1' })))
    })

    it('erp-rules: user aprovado nao le nem grava', async () => {
      await seedReference()
      const db = approvedUser('user-1')
      await assertFails(getDoc(doc(db, `erpSnapshots/${SNAP}`)))
      await assertFails(getDoc(doc(db, 'erpSnapshots/latest')))
      await assertFails(getDoc(doc(db, 'erpProcessHints/p-1')))
      await assertFails(setDoc(doc(db, 'erpProcessHints/p-9'), validHint(SNAP, { savedById: 'user-1' })))
      await assertFails(setDoc(doc(db, `erpSnapshots/${SNAP2}`), validMeta(SNAP2, { createdById: 'user-1' })))
    })

    it('erp-rules: anonimo nao le nem grava', async () => {
      await seedReference()
      const db = anon()
      await assertFails(getDoc(doc(db, `erpSnapshots/${SNAP}`)))
      await assertFails(getDoc(doc(db, 'erpSnapshots/latest')))
      await assertFails(getDoc(doc(db, 'erpProcessHints/p-1')))
      await assertFails(setDoc(doc(db, 'erpProcessHints/p-9'), validHint()))
      await assertFails(setDoc(doc(db, `erpSnapshots/${SNAP2}`), validMeta(SNAP2)))
    })

    it('erp-rules: admin Pendente e admin com e-mail fora de @sqquimica.com nao gravam', async () => {
      // Controle: o admin valido grava o mesmo hint.
      await assertSucceeds(setDoc(doc(admin(), 'erpProcessHints/p-ok'), validHint()))
      const pending = admin('admin-1', { status: 'Pendente' })
      await assertFails(setDoc(doc(pending, 'erpProcessHints/p-1'), validHint()))
      await assertFails(setDoc(doc(pending, `erpSnapshots/${SNAP2}`), validMeta(SNAP2)))
      const external = admin('admin-1', { email: 'alguem@gmail.com' })
      await assertFails(setDoc(doc(external, 'erpProcessHints/p-1'), validHint()))
      await assertFails(setDoc(doc(external, `erpSnapshots/${SNAP2}`), validMeta(SNAP2)))
    })

    it('erp-rules: hint com campo extra e negado', async () => {
      await assertFails(setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint(SNAP, { total: 987654.32 })))
      await assertSucceeds(setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint()))
    })

    it('erp-rules: shipment com chave extra (total) e negado', async () => {
      await assertFails(
        setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint(SNAP, { shipment: validShipment({ total: 987654.32 }) }))
      )
      await assertFails(
        setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint(SNAP, { shipment: validShipment({ nfDate: '2099-12-31' }) }))
      )
    })

    it('erp-rules: transport com chave extra e vessel com chave extra sao negados', async () => {
      const base = validShipment()
      await assertFails(
        setDoc(
          doc(admin(), 'erpProcessHints/p-1'),
          validHint(SNAP, { shipment: { ...base, transport: { ...base.transport, tracking: 'X' } } })
        )
      )
      await assertFails(
        setDoc(
          doc(admin(), 'erpProcessHints/p-1'),
          validHint(SNAP, {
            shipment: {
              ...base,
              transport: { ...base.transport, vessel: { ...base.transport.vessel, imo: '1234567' } },
            },
          })
        )
      )
    })

    it('erp-rules: 301 itens negado e 300 passa', async () => {
      const items = (count) =>
        Array.from({ length: count }, (_, index) => ({ commercialName: `ITEM ${index}`, pedido: '9000', quantityKg: 1 }))
      await assertFails(
        setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint(SNAP, { shipment: validShipment({ items: items(301) }) }))
      )
      await assertSucceeds(
        setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint(SNAP, { shipment: validShipment({ items: items(300) }) }))
      )
    })

    it('erp-rules: savedById de outro uid e savedAt literal sao negados', async () => {
      await assertFails(setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint(SNAP, { savedById: 'outro-uid' })))
      await assertFails(setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint(SNAP, { savedAt: new Date() })))
      await assertSucceeds(setDoc(doc(admin(), 'erpProcessHints/p-1'), validHint()))
    })

    it('erp-rules: meta com campo extra e meta com snapshotId diferente do id do doc sao negados', async () => {
      await assertFails(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta(SNAP, { total: 1 })))
      await assertFails(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta(SNAP2)))
      await assertSucceeds(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta()))
    })

    it('erp-rules: update do meta (imutavel) e negado', async () => {
      await seedReference()
      await assertFails(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta()))
      await assertFails(updateDoc(doc(admin(), `erpSnapshots/${SNAP}`), { createdByName: 'Outro' }))
    })

    it('erp-rules: latest (create) apontando para snapshot inexistente e latest com campo extra sao negados', async () => {
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP)))
      // Controle: com o meta no mesmo batch, o mesmo latest passa.
      await assertSucceeds(
        commitBatch(admin(), [
          [`erpSnapshots/${SNAP}`, validMeta()],
          ['erpSnapshots/latest', validLatest(SNAP)],
        ])
      )
      await seed((db) => setDoc(doc(db, `erpSnapshots/${SNAP2}`), validMeta(SNAP2)))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP2, { total: 1 })))
    })

    it('erp-rules: delete do admin em meta, latest e hint e negado; matchRule fora da lista e negado', async () => {
      await seedReference()
      await assertFails(deleteDoc(doc(admin(), `erpSnapshots/${SNAP}`)))
      await assertFails(deleteDoc(doc(admin(), 'erpSnapshots/latest')))
      await assertFails(deleteDoc(doc(admin(), 'erpProcessHints/p-1')))
      await assertFails(setDoc(doc(admin(), 'erpProcessHints/p-2'), validHint(SNAP, { matchRule: 'xyz' })))
      for (const matchRule of ['pedido', 'po', 'po-base', 'consolidado:ref', 'consolidado:pedidos']) {
        await assertSucceeds(setDoc(doc(admin(), `erpProcessHints/p-${matchRule}`), validHint(SNAP, { matchRule })))
      }
    })

    it('erp-rules: caminho de UPDATE: um 2o writeBatch (meta2 + hint sobrescrito + latest para meta2) passa', async () => {
      await seedReference(SNAP)
      await assertSucceeds(
        commitBatch(admin(), [
          [`erpSnapshots/${SNAP2}`, validMeta(SNAP2)],
          ['erpProcessHints/p-1', validHint(SNAP2, { matchRule: 'po' })],
          ['erpSnapshots/latest', validLatest(SNAP2)],
        ])
      )
      const latest = await assertSucceeds(getDoc(doc(admin(), 'erpSnapshots/latest')))
      if (latest.data().snapshotId !== SNAP2) throw new Error('latest nao apontou para o novo snapshot')
      const hint = await assertSucceeds(getDoc(doc(admin(), 'erpProcessHints/p-1')))
      if (hint.data().snapshotId !== SNAP2) throw new Error('hint nao foi sobrescrito')
    })

    it('erp-rules: update do latest para meta inexistente e negado', async () => {
      await seedReference(SNAP)
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP2)))
      await assertFails(updateDoc(doc(admin(), 'erpSnapshots/latest'), { snapshotId: SNAP2, updatedAt: serverTimestamp() }))
      // Controle: com o meta2 criado antes, o update passa.
      await seed((db) => setDoc(doc(db, `erpSnapshots/${SNAP2}`), validMeta(SNAP2)))
      await assertSucceeds(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP2)))
    })

    it('erp-rules: orders 101, conflicts 21, statuses 21 e statusNf 11 sao negados (100/20/20/10 passam)', async () => {
      const many = (count, make) => Array.from({ length: count }, (_, index) => make(index))
      const order = (index) => ({ pedido: String(9000 + index), poRef: '', poBase: '', exporter: 'ALFA' })
      const conflict = (index) => ({ field: 'eta', values: [`2026-10-${String((index % 28) + 1).padStart(2, '0')}`] })
      const text = (index) => `S${index}`
      const cases = [
        ['orders', order, 100],
        ['conflicts', conflict, 20],
        ['statuses', text, 20],
        ['statusNf', text, 10],
      ]
      for (const [field, make, max] of cases) {
        await assertSucceeds(
          setDoc(doc(admin(), 'erpProcessHints/p-ok'), validHint(SNAP, { shipment: validShipment({ [field]: many(max, make) }) }))
        )
        await assertFails(
          setDoc(
            doc(admin(), 'erpProcessHints/p-big'),
            validHint(SNAP, { shipment: validShipment({ [field]: many(max + 1, make) }) })
          )
        )
      }
    })

    it('erp-rules: conflitos de incoterm e originHint (slot vazio no recorte) passam; a rule so limita a lista (o filtro de campo e do cliente)', async () => {
      const conflicts = [
        { field: 'incoterm', values: ['CFR', 'FOB'] },
        { field: 'originHint', values: ['HAMBURG', 'SANTOS'] },
      ]
      await assertSucceeds(
        setDoc(
          doc(admin(), 'erpProcessHints/p-conflito'),
          validHint(SNAP, { shipment: validShipment({ incoterm: '', originHint: '', conflicts }) })
        )
      )
    })

    it('erp-rules: meta com createdById de outro uid e com createdAt literal sao negados', async () => {
      await assertFails(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta(SNAP, { createdById: 'outro-uid' })))
      await assertFails(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta(SNAP, { createdAt: new Date() })))
      await assertSucceeds(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta()))
    })

    it('erp-rules: latest com updatedById de outro uid e negado', async () => {
      await seed((db) => setDoc(doc(db, `erpSnapshots/${SNAP}`), validMeta()))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { updatedById: 'outro-uid' })))
      await assertSucceeds(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP)))
    })

    it('erp-rules: latest exige hints inteiro >= 0 (sem o campo, negativo, fracionario ou texto sao negados; 0 passa)', async () => {
      await seed((db) => setDoc(doc(db, `erpSnapshots/${SNAP}`), validMeta()))
      const withoutHints = validLatest(SNAP)
      delete withoutHints.hints
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), withoutHints))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { hints: -1 })))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { hints: 1.5 })))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { hints: '2' })))
      await assertSucceeds(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { hints: 0 })))
      await assertSucceeds(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { hints: 1000 })))
    })

    it('erp-rules: latest com payload de meta e id curto (erpSnapshots/abc) com payload de meta sao negados', async () => {
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validMeta()))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/abc'), validMeta('abc')))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/abc'), validMeta(SNAP)))
    })

    it('erp-rules: processId de 129 caracteres e negado e 128 passa', async () => {
      await assertFails(setDoc(doc(admin(), `erpProcessHints/${'a'.repeat(129)}`), validHint()))
      await assertSucceeds(setDoc(doc(admin(), `erpProcessHints/${'a'.repeat(128)}`), validHint()))
    })

    it('erp-rules: getDocs com query e getDocs da colecao sao negados para logistica e user', async () => {
      await seedReference()
      for (const db of [logistics(), approvedUser('user-1')]) {
        await assertFails(getDocs(query(collection(db, 'erpProcessHints'), where('snapshotId', '==', SNAP))))
        await assertFails(getDocs(collection(db, 'erpProcessHints')))
        await assertFails(getDocs(collection(db, 'erpSnapshots')))
      }
      await assertSucceeds(getDocs(collection(admin(), 'erpSnapshots')))
    })

    it('erp-rules: batch de 450 operacoes (meta + 448 hints + latest) passa', async () => {
      const ops = [[`erpSnapshots/${SNAP}`, validMeta()]]
      for (let index = 0; index < 448; index += 1) ops.push([`erpProcessHints/p-${index}`, validHint()])
      ops.push(['erpSnapshots/latest', validLatest()])
      if (ops.length !== 450) throw new Error(`esperava 450 operacoes, montei ${ops.length}`)
      await assertSucceeds(commitBatch(admin(), ops))
    })

    it('erp-rules: fileName de 256 (meta e latest) e createdByName/updatedByName de 121 sao negados', async () => {
      const longName = 'x'.repeat(256)
      const sourceInfo = { ...validMeta().sourceInfo, fileName: longName }
      await assertFails(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta(SNAP, { sourceInfo })))
      await assertFails(setDoc(doc(admin(), `erpSnapshots/${SNAP}`), validMeta(SNAP, { createdByName: 'x'.repeat(121) })))
      // Controle: 255 e 120 passam.
      await assertSucceeds(
        setDoc(
          doc(admin(), `erpSnapshots/${SNAP}`),
          validMeta(SNAP, { sourceInfo: { ...sourceInfo, fileName: 'x'.repeat(255) }, createdByName: 'x'.repeat(120) })
        )
      )
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { fileName: longName })))
      await assertFails(setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { updatedByName: 'x'.repeat(121) })))
      await assertSucceeds(
        setDoc(doc(admin(), 'erpSnapshots/latest'), validLatest(SNAP, { fileName: 'x'.repeat(255), updatedByName: 'x'.repeat(120) }))
      )
    })
  })

  // D6 revista: SO' config/cargoReportRecipients esta aberto (tela /admin/relatorio-carga).
  // Validacao de shape feita por join(',') + regex por lista (rules nao iteram listas).
  describe('config/cargoReportRecipients (tela admin, D6 revista)', () => {
    const PATH = 'config/cargoReportRecipients'
    const valid = (overrides = {}) => ({
      tecnico: ['tec@sqquimica.com'],
      faturamento: ['fiscal@sqquimica.com'],
      ...overrides,
    })
    const seedDoc = () => seed((db) => setDoc(doc(db, PATH), valid()))
    const fifty = (count) => Array.from({ length: count }, (_, index) => `user${index}@sqquimica.com`)

    it('admin le com o doc ausente e com o doc presente', async () => {
      await assertSucceeds(getDoc(doc(admin(), PATH)))
      await seedDoc()
      await assertSucceeds(getDoc(doc(admin(), PATH)))
    })

    it('admin cria com setDoc valido (inclusive listas vazias)', async () => {
      await assertSucceeds(setDoc(doc(admin(), PATH), valid()))
      await seed((db) => deleteDoc(doc(db, PATH)))
      await assertSucceeds(setDoc(doc(admin(), PATH), { tecnico: [], faturamento: [] }))
    })

    it('admin atualiza com setDoc e com updateDoc parcial valido', async () => {
      await seedDoc()
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ tecnico: ['a@sqquimica.com', 'b@sqquimica.com'] })))
      await assertSucceeds(updateDoc(doc(admin(), PATH), { faturamento: ['novo@sqquimica.com'] }))
      await assertSucceeds(updateDoc(doc(admin(), PATH), { tecnico: [] }))
    })

    it('50 itens passam e 51 falham', async () => {
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ tecnico: fifty(50) })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ tecnico: fifty(51) })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ faturamento: fifty(51) })))
    })

    it('falham: campo extra, so um campo no create, e update que deixa de ser valido', async () => {
      await assertFails(setDoc(doc(admin(), PATH), { ...valid(), updatedAt: 'x' }))
      await assertFails(setDoc(doc(admin(), PATH), { tecnico: ['a@sqquimica.com'] }))
      await assertFails(setDoc(doc(admin(), PATH), { faturamento: ['a@sqquimica.com'] }))
      await seedDoc()
      await assertFails(updateDoc(doc(admin(), PATH), { updatedAt: 'x' }))
      await assertFails(updateDoc(doc(admin(), PATH), { tecnico: ['externo@gmail.com'] }))
    })

    it('falham itens fora do padrao: maiuscula, dominio externo, sem local-part, virgula, espaco', async () => {
      const bad = [
        'Maiuscula@sqquimica.com',
        'externo@gmail.com',
        'x@sub.sqquimica.com',
        '@sqquimica.com',
        'a,b@sqquimica.com',
        'a b@sqquimica.com',
        ' a@sqquimica.com',
        'joão@sqquimica.com',
      ]
      // Nota: uma lista com UM unico item '' (`['']`) passa na rule (join = '' casa o grupo opcional).
      // E' benigno: o backend e a normalizacao do cliente descartam string vazia; a UI nunca grava isso.
      // Combinado com outros itens ('' + e-mail) o join ganha virgula e a rule nega (coberto abaixo).
      for (const email of bad) {
        await assertFails(setDoc(doc(admin(), PATH), valid({ tecnico: [email] })))
        await assertFails(setDoc(doc(admin(), PATH), valid({ faturamento: ['ok@sqquimica.com', email] })))
      }
      await assertFails(setDoc(doc(admin(), PATH), valid({ tecnico: ['ok@sqquimica.com', ''] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ tecnico: ['', 'ok@sqquimica.com'] })))
    })

    it('documenta limitacao conhecida e benigna: item unico com virgula ou vazio passa na rule', async () => {
      // O join(',') de UM unico item e' a propria string: 'a@sqquimica.com,b@sqquimica.com' casa o regex.
      // Limitacao conhecida da rule (rules nao iteram listas). Benigna: so' admin ativo escreve, dominio e
      // charset seguem travados em @sqquimica.com, backend e cliente normalizam/descartam e a UI valida
      // item a item (a validacao estrita por item fica no cliente). Se a rule for endurecida, inverter aqui.
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ tecnico: ['a@sqquimica.com,b@sqquimica.com'] })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ faturamento: [''] })))
    })

    it('falham: duplicado, item nao-string e campo string em vez de lista', async () => {
      await assertFails(setDoc(doc(admin(), PATH), valid({ tecnico: ['a@sqquimica.com', 'a@sqquimica.com'] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ tecnico: [42] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ tecnico: ['a@sqquimica.com', 42] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ faturamento: 'a@sqquimica.com' })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ faturamento: null })))
    })

    it('admin NAO deleta', async () => {
      await seedDoc()
      await assertFails(deleteDoc(doc(admin(), PATH)))
    })

    it('user aprovado, logistica e anonimo nao leem nem gravam', async () => {
      await seedDoc()
      for (const db of [approvedUser(), logistics(), anon()]) {
        await assertFails(getDoc(doc(db, PATH)))
        await assertFails(setDoc(doc(db, PATH), valid()))
        await assertFails(updateDoc(doc(db, PATH), { tecnico: [] }))
        await assertFails(deleteDoc(doc(db, PATH)))
      }
    })

    it('admin Pendente e admin com e-mail nao corporativo nao leem nem gravam', async () => {
      await seedDoc()
      for (const db of [admin('admin-p', { status: 'Pendente' }), admin('admin-x', { email: 'admin@gmail.com' })]) {
        await assertFails(getDoc(doc(db, PATH)))
        await assertFails(setDoc(doc(db, PATH), valid()))
      }
    })

    it('admin nao le nem grava outro doc de config (catch-all continua valendo)', async () => {
      await assertFails(getDoc(doc(admin(), 'config/outroDoc')))
      await assertFails(setDoc(doc(admin(), 'config/outroDoc'), valid()))
    })
  })

  // S2 do Relatorio de Carga: tabela mestra "Item x Emb." (doc unico cargoReportCatalog/itemPackaging).
  // Admin grava (create version 1; update version atual + 1 = trava otimista); admin e logistica leem.
  // Rules nao iteram listas: so' o shape, a contagem e o 1o item sao validados aqui.
  describe('cargoReportCatalog/itemPackaging (S2)', () => {
    const PATH = 'cargoReportCatalog/itemPackaging'
    const ADMIN_UID = 'admin-1'
    const SHA = 'a'.repeat(64)
    const item = (index = 0) => ({
      code: `AA${String(index).padStart(4, '0')}`,
      description: `ITEM ${index}`,
      packagingType: index % 2 === 0 ? 'BALDE' : '',
      netWeightKg: index % 2 === 0 ? 5 : null,
    })
    const items = (count) => Array.from({ length: count }, (_, index) => item(index))
    const valid = (overrides = {}) => {
      const list = overrides.items ?? items(3)
      return {
        schemaVersion: 1,
        version: 1,
        items: list,
        itemCount: list.length,
        sourceFileName: 'FR.CMX.001 - RELATORIO DE CARGA.R5.xlsx',
        sourceSheetName: 'Item x Emb.',
        sourceSha256: SHA,
        importedAt: serverTimestamp(),
        importedById: ADMIN_UID,
        importedByName: 'Admin',
        ...overrides,
      }
    }
    const seedDoc = (version = 1) =>
      seed((db) => setDoc(doc(db, PATH), { ...valid({ version }), importedAt: new Date('2026-11-01T10:00:00Z') }))
    const tecnico = () =>
      testEnv
        .authenticatedContext('tec-1', { email: 'tec@sqquimica.com', role: 'tecnico', status: 'Ativo', name: 'Tecnico' })
        .firestore()

    it('admin le com o doc ausente e presente; logistica le o doc presente', async () => {
      await assertSucceeds(getDoc(doc(admin(), PATH)))
      await seedDoc()
      await assertSucceeds(getDoc(doc(admin(), PATH)))
      await assertSucceeds(getDoc(doc(logistics(), PATH)))
    })

    it('user aprovado, tecnico e anonimo nao leem', async () => {
      await seedDoc()
      for (const db of [approvedUser(), tecnico(), anon()]) {
        await assertFails(getDoc(doc(db, PATH)))
      }
    })

    it('logistica, user aprovado, tecnico e anonimo nao gravam', async () => {
      for (const db of [logistics(), approvedUser(), tecnico(), anon()]) {
        await assertFails(setDoc(doc(db, PATH), valid()))
      }
      await seedDoc()
      for (const db of [logistics(), approvedUser(), tecnico(), anon()]) {
        await assertFails(setDoc(doc(db, PATH), valid({ version: 2 })))
      }
    })

    it('admin Pendente e admin com e-mail nao corporativo nao leem nem gravam', async () => {
      await seedDoc()
      for (const db of [admin('admin-p', { status: 'Pendente' }), admin('admin-x', { email: 'admin@gmail.com' })]) {
        await assertFails(getDoc(doc(db, PATH)))
        await assertFails(setDoc(doc(db, PATH), valid({ version: 2, importedById: 'admin-p' })))
      }
    })

    it('admin cria com version 1; create com version 2 falha', async () => {
      await assertSucceeds(setDoc(doc(admin(), PATH), valid()))
      await seed((db) => deleteDoc(doc(db, PATH)))
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 2 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 0 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 1.5 })))
    })

    it('trava otimista: update exige version atual + 1', async () => {
      await seedDoc(3)
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 3 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 5 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 1 })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ version: 4 })))
    })

    it('falham: campo extra, chave faltando e itemCount divergente', async () => {
      await assertFails(setDoc(doc(admin(), PATH), { ...valid(), extra: 'x' }))
      const missing = valid()
      delete missing.sourceSheetName
      await assertFails(setDoc(doc(admin(), PATH), missing))
      await assertFails(setDoc(doc(admin(), PATH), valid({ itemCount: 4 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ schemaVersion: 2 })))
    })

    it('falham: lista vazia, 5001 itens, item 0 com chave extra, sem code string ou com chave faltando', async () => {
      await assertFails(setDoc(doc(admin(), PATH), valid({ items: [] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ items: items(5001) })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ items: [{ ...item(0), extra: 1 }, item(1)] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ items: [{ ...item(0), code: 42 }, item(1)] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ items: [{ description: 'x', packagingType: '', netWeightKg: null }] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ items: [{ code: 'AA0001', description: 'x', packagingType: '' }] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ items: ['AA0001'] })))
    })

    it('5000 itens pequenos passam', async () => {
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ items: items(5000) })))
    })

    it('falham: sourceSha256 maiusculo, curto ou nao-string; arquivo e aba fora do limite', async () => {
      await assertFails(setDoc(doc(admin(), PATH), valid({ sourceSha256: 'A'.repeat(64) })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ sourceSha256: 'a'.repeat(63) })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ sourceSha256: 42 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ sourceFileName: '' })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ sourceFileName: 'x'.repeat(256) })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ sourceSheetName: 'x'.repeat(65) })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ sourceFileName: 'x'.repeat(255), sourceSheetName: 'x'.repeat(64) })))
    })

    it('falham: importedById de outro uid, importedAt literal e importedByName com 121 chars', async () => {
      await assertFails(setDoc(doc(admin(), PATH), valid({ importedById: 'outro-uid' })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ importedAt: new Date('2026-11-01T10:00:00Z') })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ importedByName: 'x'.repeat(121) })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ importedByName: 'x'.repeat(120) })))
    })

    it('admin NAO deleta', async () => {
      await seedDoc()
      await assertFails(deleteDoc(doc(admin(), PATH)))
    })

    it('admin nao le nem grava outro doc de cargoReportCatalog (catch-all continua valendo)', async () => {
      await assertFails(getDoc(doc(admin(), 'cargoReportCatalog/outroDoc')))
      await assertFails(setDoc(doc(admin(), 'cargoReportCatalog/outroDoc'), valid()))
    })
  })

  // S9-D do Relatorio de Carga: embalagens por item + fornecedor (doc unico cargoReportCatalog/supplierPackaging).
  // Admin grava (create version 1; update version atual + 1 = trava otimista); admin e logistica leem.
  // Rules nao iteram listas: so' o shape, as contagens e o 1o elemento sao validados aqui.
  describe('cargoReportCatalog/supplierPackaging (S9)', () => {
    const PATH = 'cargoReportCatalog/supplierPackaging'
    const ADMIN_UID = 'admin-1'
    const entry = (index = 0) => ({
      code: `AA${String(index).padStart(4, '0')}`,
      supplierKey: 'GOOYER CHEMICALS LTD',
      supplierName: 'Gooyer Chemicals Ltd',
      packagingType: 'TAMBOR',
      netWeightKg: 200,
      packageWeightKg: index % 2 === 0 ? 9.2 : null,
    })
    const entries = (count) => Array.from({ length: count }, (_, index) => entry(index))
    const valid = (overrides = {}) => {
      const list = overrides.entries ?? entries(3)
      return {
        schemaVersion: 1,
        version: 1,
        entries: list,
        entryCount: list.length,
        aliases: [{ fromKey: 'GOOYER CHEMICAL CO', toKey: 'GOOYER CHEMICALS LTD' }],
        updatedAt: serverTimestamp(),
        updatedById: ADMIN_UID,
        updatedByName: 'Admin',
        ...overrides,
      }
    }
    const seedDoc = (version = 1) =>
      seed((db) => setDoc(doc(db, PATH), { ...valid({ version }), updatedAt: new Date('2026-11-01T10:00:00Z') }))
    const roleDb = (role) =>
      testEnv
        .authenticatedContext(`${role}-1`, { email: `${role}@sqquimica.com`, role, status: 'Ativo', name: role })
        .firestore()

    it('admin le com o doc ausente e presente; logistica le o doc presente', async () => {
      await assertSucceeds(getDoc(doc(admin(), PATH)))
      await seedDoc()
      await assertSucceeds(getDoc(doc(admin(), PATH)))
      await assertSucceeds(getDoc(doc(logistics(), PATH)))
    })

    it('tecnico, faturamento, user aprovado e anonimo nao leem', async () => {
      await seedDoc()
      for (const db of [roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]) {
        await assertFails(getDoc(doc(db, PATH)))
      }
    })

    it('logistica, tecnico, faturamento, user aprovado e anonimo nao gravam', async () => {
      const others = () => [logistics(), roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]
      for (const db of others()) await assertFails(setDoc(doc(db, PATH), valid()))
      await seedDoc()
      for (const db of others()) await assertFails(setDoc(doc(db, PATH), valid({ version: 2 })))
    })

    it('admin cria com version 1 e atualiza para a versao 2; versao repetida ou pulada falha', async () => {
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 2 })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid()))
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 1 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ version: 3 })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ version: 2 })))
    })

    it('admin Pendente e admin com e-mail nao corporativo nao leem nem gravam', async () => {
      await seedDoc()
      for (const db of [admin('admin-p', { status: 'Pendente' }), admin('admin-x', { email: 'admin@gmail.com' })]) {
        await assertFails(getDoc(doc(db, PATH)))
        await assertFails(setDoc(doc(db, PATH), valid({ version: 2, updatedById: 'admin-p' })))
      }
    })

    it('falham: campo extra, chave faltando, entryCount divergente e schemaVersion 2', async () => {
      await assertFails(setDoc(doc(admin(), PATH), { ...valid(), extra: 'x' }))
      const missing = valid()
      delete missing.aliases
      await assertFails(setDoc(doc(admin(), PATH), missing))
      await assertFails(setDoc(doc(admin(), PATH), valid({ entryCount: 4 })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ schemaVersion: 2 })))
    })

    it('lista de entradas vazia passa; 5001 entradas falha; 5000 entradas pequenas passam', async () => {
      await assertFails(setDoc(doc(admin(), PATH), valid({ entries: entries(5001) })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ entries: [] })))
      await seed((db) => deleteDoc(doc(db, PATH)))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ entries: entries(5000) })))
    })

    it('falham: entrada 0 com 5 ou 7 chaves, sem code string, com supplierKey nao-string ou nao-mapa', async () => {
      const fiveKeys = { ...entry(0) }
      delete fiveKeys.packageWeightKg
      await assertFails(setDoc(doc(admin(), PATH), valid({ entries: [fiveKeys, entry(1)] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ entries: [{ ...entry(0), extra: 1 }, entry(1)] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ entries: [{ ...entry(0), code: 42 }, entry(1)] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ entries: [{ ...entry(0), supplierKey: null }, entry(1)] })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ entries: ['AA0001'] })))
    })

    it('aliases: lista com 1000 passa; 1001 e nao-lista falham', async () => {
      const aliases = (count) => Array.from({ length: count }, (_, index) => ({ fromKey: `A${index}`, toKey: 'B' }))
      await assertFails(setDoc(doc(admin(), PATH), valid({ aliases: aliases(1001) })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ aliases: 'x' })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ aliases: aliases(1000) })))
    })

    it('falham: updatedById de outro uid, updatedAt literal e updatedByName com 121 chars', async () => {
      await assertFails(setDoc(doc(admin(), PATH), valid({ updatedById: 'outro-uid' })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ updatedAt: new Date('2026-11-01T10:00:00Z') })))
      await assertFails(setDoc(doc(admin(), PATH), valid({ updatedByName: 'x'.repeat(121) })))
      await assertSucceeds(setDoc(doc(admin(), PATH), valid({ updatedByName: 'x'.repeat(120) })))
    })

    it('admin NAO deleta', async () => {
      await seedDoc()
      await assertFails(deleteDoc(doc(admin(), PATH)))
    })

    it('itemPackaging (S2) continua igual: admin e logistica leem; outro doc de cargoReportCatalog segue negado', async () => {
      await assertSucceeds(getDoc(doc(admin(), 'cargoReportCatalog/itemPackaging')))
      await assertSucceeds(getDoc(doc(logistics(), 'cargoReportCatalog/itemPackaging')))
      await assertFails(getDoc(doc(admin(), 'cargoReportCatalog/outroDoc')))
    })
  })

  // S3 do Relatorio de Carga: formulario FR.CMX.001 em 2 docs nomeados por processo.
  // `current` so' admin grava (revision = anterior + 1, trava otimista); `conference` admin e logistica
  // (coluna OK? + "Conferido por"); Tecnico/Faturamento nao leem; outros ids caem no catch-all.
  describe('processes/{id}/cargoReport (S3)', () => {
    const PID = 'p-cr'
    const CUR = `processes/${PID}/cargoReport/current`
    const CONF = `processes/${PID}/cargoReport/conference`
    const row = (index = 0, overrides = {}) => ({
      id: `r-${index}`,
      po: '4500123',
      dbcorpCode: 'AD5240',
      supplierDescription: 'DEA FOAM - BOMBONA 25KG',
      sqDescription: 'DEA FOAM - BB 25KG',
      supplierLot: 'DF2406A',
      wmsLabel: '',
      sqLabel: '',
      quantityKg: 1000,
      count: 10,
      packageWeightKg: 1.2,
      frozenNetWeightKg: null,
      frozenPackages: null,
      ...overrides,
    })
    const rows = (count) => Array.from({ length: count }, (_, index) => row(index))
    const current = (overrides = {}) => ({
      schemaVersion: 1,
      formCode: 'FR.CMX.001',
      formRevision: '005',
      revision: 1,
      status: 'rascunho',
      cargoType: 'FCL',
      titleSuffix: 'ACME SEA 021-26',
      rows: rows(2),
      notes: '',
      nfNumber: '',
      receiptStatus: '',
      receivedDate: '',
      completedDate: '',
      catalogVersion: 3,
      lastGenerated: null,
      updatedAt: serverTimestamp(),
      updatedById: 'admin-1',
      updatedByName: 'Admin',
      ...overrides,
    })
    // S8: 21 chaves (S7 + unloadStartAt, unloadEndAt, labelingOk). `checkedByName` e' travado no nome da claim da logistica ('Logistica').
    const conference = (overrides = {}) => ({
      schemaVersion: 1,
      revision: 1,
      status: 'aberta',
      okByRowId: { 'r-0': true, 'r-1': false },
      countOkByRowId: { 'r-0': true, 'r-1': false },
      labelsByRowId: { 'r-0': { wms: 'WMS-77120', sq: 'SQ-0001' } },
      checkedByName: 'Logistica',
      receiptStatus: '',
      receivedDate: '',
      nfNumber: '',
      notes: '',
      unloadStartAt: '',
      unloadEndAt: '',
      labelingOk: false,
      closedDate: '',
      closedById: '',
      closedByName: '',
      closedDocumentId: '',
      updatedAt: serverTimestamp(),
      updatedById: 'log-1',
      updatedByName: 'Logistica',
      ...overrides,
    })
    const CLOSED_DOC_ID = 'doc-cr-log'
    const closedConference = (overrides = {}) =>
      conference({
        status: 'fechada',
        closedDate: '2026-11-24',
        closedById: 'log-1',
        closedByName: 'Logistica',
        closedDocumentId: CLOSED_DOC_ID,
        ...overrides,
      })
    const seedProcess = () => seed((db) => setDoc(doc(db, `processes/${PID}`), { name: 'ACME SEA 021-26' }))
    const seedCurrent = async (revision = 1, status = 'rascunho') => {
      await seedProcess()
      await seed((db) =>
        setDoc(doc(db, CUR), { ...current({ revision, status }), updatedAt: new Date('2026-11-01T10:00:00Z') })
      )
    }
    // Conferencia semeada: `status` aberta|fechada; `legacy` = doc anterior a S7 (9 chaves, sem `status`).
    const seedConference = (revision = 1, status = 'aberta') =>
      seed((db) =>
        setDoc(doc(db, CONF), {
          ...(status === 'fechada' ? closedConference({ revision }) : conference({ revision })),
          updatedAt: new Date('2026-11-01T11:00:00Z'),
        })
      )
    const seedLegacyConference = (revision = 1) =>
      seed((db) =>
        setDoc(doc(db, CONF), {
          schemaVersion: 1,
          revision,
          okByRowId: { 'r-0': true },
          countOkByRowId: {},
          labelsByRowId: {},
          checkedByName: 'Nome digitado',
          updatedAt: new Date('2026-11-01T11:00:00Z'),
          updatedById: 'admin-1',
          updatedByName: 'Admin',
        })
      )
    const cargoDocFields = (overrides = {}) => ({
      type: 'cargoReport',
      slotKey: 'cargoReport',
      name: 'FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 4096,
      storagePath: `processes/${PID}/documents/cargoReport/1-log-1-x.xlsx`,
      uploadedAt: serverTimestamp(),
      uploadedById: 'log-1',
      uploadedByName: 'Logistica',
      uploadedByRole: 'logistica',
      ...overrides,
    })
    const seedCargoDoc = (uploadedById = 'log-1', type = 'cargoReport') =>
      seed((db) =>
        setDoc(doc(db, `processes/${PID}/documents/${CLOSED_DOC_ID}`), {
          ...cargoDocFields({ type, slotKey: type, uploadedById }),
          uploadedAt: new Date('2026-11-01T11:30:00Z'),
        })
      )
    const roleDb = (role) =>
      testEnv
        .authenticatedContext(`${role}-1`, { email: `${role}@sqquimica.com`, role, status: 'Ativo', name: role })
        .firestore()

    describe('current', () => {
      it('admin cria revision 1 e le; logistica le e NAO grava', async () => {
        await seedProcess()
        await assertSucceeds(setDoc(doc(admin(), CUR), current()))
        await assertSucceeds(getDoc(doc(admin(), CUR)))
        await assertSucceeds(getDoc(doc(logistics(), CUR)))
        await assertFails(setDoc(doc(logistics('log-1'), CUR), current({ revision: 2, updatedById: 'log-1', updatedByName: 'Logistica' })))
      })

      it('tecnico e faturamento nao leem nem gravam', async () => {
        await seedCurrent()
        for (const role of ['tecnico', 'faturamento']) {
          await assertFails(getDoc(doc(roleDb(role), CUR)))
          await assertFails(setDoc(doc(roleDb(role), CUR), current({ revision: 2, updatedById: `${role}-1`, updatedByName: role })))
        }
      })

      it('usuario aprovado e anonimo nao leem nem gravam', async () => {
        await seedCurrent()
        for (const db of [approvedUser(), anon()]) {
          await assertFails(getDoc(doc(db, CUR)))
          await assertFails(setDoc(doc(db, CUR), current({ revision: 2 })))
        }
      })

      it('admin Pendente e admin com e-mail externo sao negados', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin('admin-1', { status: 'Pendente' }), CUR), current()))
        await assertFails(setDoc(doc(admin('admin-1', { email: 'admin@gmail.com' }), CUR), current()))
      })

      it('revisao: create com 2 falha; update atual + 1 passa; igual ou + 2 falham', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin(), CUR), current({ revision: 2 })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 1 })))
        await assertFails(setDoc(doc(admin(), CUR), current({ revision: 1 })))
        await assertFails(setDoc(doc(admin(), CUR), current({ revision: 3 })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2 })))
      })

      it('processo inexistente falha', async () => {
        await assertFails(setDoc(doc(admin(), CUR), current()))
      })

      it('shape: campo extra, chave faltando, formCode/formRevision e status errados falham', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin(), CUR), current({ extra: 1 })))
        const { notes: _notes, ...semNotes } = current()
        await assertFails(setDoc(doc(admin(), CUR), semNotes))
        await assertFails(setDoc(doc(admin(), CUR), current({ formCode: 'FR.CMX.002' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ formRevision: '006' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ status: 'aberto' })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ status: 'concluido' })))
      })

      it('cargoType: AEREO passa, AÉREO (com acento) e valor desconhecido falham, vazio passa', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin(), CUR), current({ cargoType: 'AÉREO' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ cargoType: 'RODOVIARIO' })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ cargoType: '', revision: 1 })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ cargoType: 'AEREO', revision: 2 })))
      })

      it('linhas: 201 falham e 200 passam; rows[0] com chave extra/faltando ou id vazio falha', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin(), CUR), current({ rows: rows(201) })))
        await assertFails(setDoc(doc(admin(), CUR), current({ rows: [{ ...row(0), extra: 1 }] })))
        const { po: _po, ...semPo } = row(0)
        await assertFails(setDoc(doc(admin(), CUR), current({ rows: [semPo] })))
        await assertFails(setDoc(doc(admin(), CUR), current({ rows: [row(0, { id: '' })] })))
        await assertFails(setDoc(doc(admin(), CUR), current({ rows: [row(0, { id: 'x'.repeat(65) })] })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ rows: rows(200) })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ rows: [], revision: 2 })))
      })

      // S9: `autofill` e' opcional (19 chaves no hasOnly, 18 no hasAll); o cliente valida cada entrada.
      describe('autofill (S9)', () => {
        const autofill = (overrides = {}) => ({
          schemaVersion: 1,
          snapshotId: 'snap-20261124',
          rows: {
            'r-0': { key: 'fup:12345', base: { po: 'ACME SEA 021-26', dbcorpCode: 'AD5240', quantityKg: 1000 } },
          },
          ...overrides,
        })
        const manyRows = (count) =>
          Object.fromEntries(Array.from({ length: count }, (_, index) => [`r-${index}`, { key: '', base: {} }]))

        it('admin grava rascunho com autofill valido; sem autofill (relatorio e bundle antigos) tambem passa', async () => {
          await seedProcess()
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ autofill: autofill() })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2 })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 3, autofill: autofill({ snapshotId: '' }) })))
        })

        it('autofill com chave extra, schemaVersion 2, snapshotId de 41, rows de 201 entradas ou nao-mapa falha', async () => {
          await seedProcess()
          await assertFails(setDoc(doc(admin(), CUR), current({ autofill: autofill({ extra: 1 }) })))
          await assertFails(setDoc(doc(admin(), CUR), current({ autofill: autofill({ schemaVersion: 2 }) })))
          await assertFails(setDoc(doc(admin(), CUR), current({ autofill: autofill({ snapshotId: 'x'.repeat(41) }) })))
          await assertFails(setDoc(doc(admin(), CUR), current({ autofill: autofill({ rows: manyRows(201) }) })))
          await assertFails(setDoc(doc(admin(), CUR), current({ autofill: autofill({ rows: [] }) })))
          await assertFails(setDoc(doc(admin(), CUR), current({ autofill: 'x' })))
          const { rows: _rows, ...semRows } = autofill()
          await assertFails(setDoc(doc(admin(), CUR), current({ autofill: semRows })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ autofill: autofill({ rows: manyRows(200) }) })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2, autofill: autofill({ snapshotId: 'x'.repeat(40) }) })))
        })

        it('logistica NAO grava current com autofill', async () => {
          await seedCurrent()
          await assertFails(
            setDoc(
              doc(logistics('log-1'), CUR),
              current({ revision: 2, autofill: autofill(), updatedById: 'log-1', updatedByName: 'Logistica' })
            )
          )
        })

        it('COMEX fechado (concluir) grava com autofill', async () => {
          await seedProcess()
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ status: 'concluido', autofill: autofill() })))
        })
      })

      // S11-I: `expectedPallets` (total de pallets informado pelo COMEX) e' opcional (20 chaves no hasOnly, 18 no
      // hasAll), int 1..9999 ou null, e "pegajosa": depois de gravada a chave nao pode sumir.
      describe('expectedPallets (S11-I)', () => {
        it('25 e null passam', async () => {
          await seedProcess()
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ expectedPallets: 25 })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2, expectedPallets: null })))
        })

        it('sem a chave (relatorio e bundle antigos) passa enquanto o doc nao a tem', async () => {
          await seedProcess()
          await assertSucceeds(setDoc(doc(admin(), CUR), current()))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2 })))
          // Depois que o bundle novo grava a chave, ela passa a ser obrigatoria.
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 3, expectedPallets: 25 })))
          await assertFails(setDoc(doc(admin(), CUR), current({ revision: 4 })))
        })

        it('limites: 1 e 9999 passam; 0, 10000, 2.5 e "7" (texto) falham', async () => {
          await seedProcess()
          await assertFails(setDoc(doc(admin(), CUR), current({ expectedPallets: 0 })))
          await assertFails(setDoc(doc(admin(), CUR), current({ expectedPallets: 10000 })))
          await assertFails(setDoc(doc(admin(), CUR), current({ expectedPallets: 2.5 })))
          await assertFails(setDoc(doc(admin(), CUR), current({ expectedPallets: '7' })))
          await assertFails(setDoc(doc(admin(), CUR), current({ expectedPallets: -1 })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ expectedPallets: 1 })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2, expectedPallets: 9999 })))
        })

        it('REMOVER a chave depois de gravada falha (bundle antigo recebe "Sem permissao" em vez de apagar o total)', async () => {
          await seedProcess()
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ expectedPallets: 25 })))
          await assertFails(setDoc(doc(admin(), CUR), current({ revision: 2 })))
          // Mudar o valor, ou voltar para null, continua permitido (a chave segue presente).
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2, expectedPallets: 30 })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 3, expectedPallets: null })))
          await assertFails(setDoc(doc(admin(), CUR), current({ revision: 4 })))
        })

        it('doc gravado com null tambem e pegajoso; fechar e reabrir a parte do COMEX levam a chave', async () => {
          await seedProcess()
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ expectedPallets: null })))
          await assertFails(setDoc(doc(admin(), CUR), current({ revision: 2 })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2, status: 'concluido', expectedPallets: 12 })))
          await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 3, status: 'rascunho', expectedPallets: 12 })))
        })

        it('a logistica NAO grava o current (nem com expectedPallets)', async () => {
          await seedCurrent()
          await assertFails(
            setDoc(
              doc(logistics('log-1'), CUR),
              current({ revision: 2, expectedPallets: 25, updatedById: 'log-1', updatedByName: 'Logistica' })
            )
          )
        })

        it('campo extra continua falhando junto com a chave nova', async () => {
          await seedProcess()
          await assertFails(setDoc(doc(admin(), CUR), current({ expectedPallets: 25, extra: 1 })))
        })
      })

      it('datas, status do recebimento e limites de texto', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin(), CUR), current({ receivedDate: '22/11/2026' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ completedDate: '2026-1-2' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ receiptStatus: 'conforme' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ titleSuffix: 'x'.repeat(121) })))
        await assertFails(setDoc(doc(admin(), CUR), current({ notes: 'x'.repeat(2001) })))
        await assertFails(setDoc(doc(admin(), CUR), current({ nfNumber: 'x'.repeat(41) })))
        await assertFails(setDoc(doc(admin(), CUR), current({ catalogVersion: -1 })))
        await assertSucceeds(
          setDoc(doc(admin(), CUR), current({ receivedDate: '2026-11-22', receiptStatus: 'com_ressalva', titleSuffix: 'x'.repeat(120) }))
        )
      })

      it('autoria: uid de outro, updatedAt literal e nome diferente da claim falham', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin(), CUR), current({ updatedById: 'outro-uid' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ updatedAt: new Date('2026-11-01T10:00:00Z') })))
        await assertFails(setDoc(doc(admin(), CUR), current({ updatedByName: 'Outro Nome' })))
      })

      it('lastGenerated: mapa com 4 chaves passa e com 3 falha', async () => {
        await seedProcess()
        const lastGenerated = { documentId: 'd1', revision: 1, at: 'x', byId: 'admin-1' }
        await assertFails(setDoc(doc(admin(), CUR), current({ lastGenerated: { documentId: 'd1', revision: 1, at: 'x' } })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ lastGenerated })))
      })

      it('delete negado ate para admin; outro id em cargoReport cai no catch-all', async () => {
        await seedCurrent()
        await assertFails(deleteDoc(doc(admin(), CUR)))
        await assertFails(getDoc(doc(admin(), `processes/${PID}/cargoReport/outro`)))
        await assertFails(setDoc(doc(admin(), `processes/${PID}/cargoReport/outro`), current()))
      })

      it('S7: payload com labeledBy ou labelMadeBy falha; sem eles passa', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(admin(), CUR), current({ labeledBy: 'Fulano' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ labelMadeBy: 'Fulano' })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current()))
      })

      it('S7: rascunho -> rascunho e rascunho -> concluido passam; concluido -> concluido falha', async () => {
        await seedCurrent(1, 'rascunho')
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2, status: 'rascunho' })))
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 3, status: 'concluido' })))
        await assertFails(setDoc(doc(admin(), CUR), current({ revision: 4, status: 'concluido' })))
      })

      it('S7: concluido -> rascunho passa com a conferencia ausente ou aberta', async () => {
        await seedCurrent(1, 'concluido')
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 2, status: 'rascunho' })))
        await seedCurrent(3, 'concluido')
        await seedConference(1, 'aberta')
        await assertSucceeds(setDoc(doc(admin(), CUR), current({ revision: 4, status: 'rascunho' })))
      })

      it('S7: concluido -> rascunho FALHA com a conferencia fechada', async () => {
        await seedCurrent(1, 'concluido')
        await seedConference(1, 'fechada')
        await assertFails(setDoc(doc(admin(), CUR), current({ revision: 2, status: 'rascunho' })))
      })

      it('S7: logistica nao grava o current em nenhum dos 3 estados', async () => {
        const payload = (revision, status) =>
          current({ revision, status, updatedById: 'log-1', updatedByName: 'Logistica' })
        await seedCurrent(1, 'rascunho')
        await assertFails(setDoc(doc(logistics(), CUR), payload(2, 'rascunho')))
        await seedCurrent(1, 'concluido')
        await assertFails(setDoc(doc(logistics(), CUR), payload(2, 'rascunho')))
        await seedConference(1, 'fechada')
        await assertFails(setDoc(doc(logistics(), CUR), payload(2, 'rascunho')))
      })
    })

    describe('conference', () => {
      it('sem current a criacao falha', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(logistics(), CONF), conference()))
        await assertFails(setDoc(doc(admin(), CONF), conference({ updatedById: 'admin-1', updatedByName: 'Admin' })))
      })

      it('com current: logistica cria revision 1 e le; admin le mas NAO cria nem salva conteudo', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(admin(), CONF), conference({ updatedById: 'admin-1', updatedByName: 'Admin' })))
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference()))
        await assertSucceeds(getDoc(doc(logistics(), CONF)))
        await assertSucceeds(getDoc(doc(admin(), CONF)))
        await assertFails(
          setDoc(doc(admin(), CONF), conference({ revision: 2, updatedById: 'admin-1', updatedByName: 'Admin' }))
        )
      })

      it('logistica atualiza a propria conferencia (+ 1); revisao errada falha', async () => {
        await seedCurrent()
        await seedConference(1)
        await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 1 })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 3 })))
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
      })

      it('create com revisao diferente de 1 falha', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
      })

      it('tecnico, faturamento, usuario aprovado e anonimo nao leem nem gravam em nenhum estado', async () => {
        for (const stage of ['rascunho', 'concluido']) {
          await seedCurrent(1, stage)
          await seedConference(1)
          for (const db of [roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]) {
            await assertFails(getDoc(doc(db, CONF)))
            await assertFails(setDoc(doc(db, CONF), conference({ revision: 2 })))
          }
        }
        await seedConference(2, 'fechada')
        for (const db of [roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]) {
          await assertFails(getDoc(doc(db, CONF)))
          await assertFails(setDoc(doc(db, CONF), conference({ revision: 3 })))
        }
      })

      it('okByRowId: valor nao booleano e mais de 200 chaves falham; 200 passam', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ okByRowId: { 'r-0': 'sim' } })))
        const ok = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`r-${index}`, true]))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ okByRowId: ok(201) })))
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ okByRowId: ok(200) })))
      })

      it('S6: logistica cria com etiquetas e contagem; ambos leem o conteudo', async () => {
        await seedCurrent()
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference()))
        const fromLogistics = await assertSucceeds(getDoc(doc(logistics(), CONF)))
        expect(fromLogistics.data().labelsByRowId).toEqual({ 'r-0': { wms: 'WMS-77120', sq: 'SQ-0001' } })
        expect(fromLogistics.data().countOkByRowId).toEqual({ 'r-0': true, 'r-1': false })
        const fromAdmin = await assertSucceeds(getDoc(doc(admin(), CONF)))
        expect(fromAdmin.data().labelsByRowId).toEqual({ 'r-0': { wms: 'WMS-77120', sq: 'SQ-0001' } })
      })

      it('S6: payload sem labelsByRowId ou sem countOkByRowId falha (bundle antigo nao apaga dados)', async () => {
        await seedCurrent()
        const { labelsByRowId: _labels, ...semEtiquetas } = conference()
        const { countOkByRowId: _count, ...semContagem } = conference()
        await assertFails(setDoc(doc(logistics(), CONF), semEtiquetas))
        await assertFails(setDoc(doc(logistics(), CONF), semContagem))
      })

      it('S6: countOkByRowId com valor nao booleano e mais de 200 chaves falham; 200 passam', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ countOkByRowId: { 'r-0': 'sim' } })))
        const flags = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`r-${index}`, true]))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ countOkByRowId: flags(201) })))
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ countOkByRowId: flags(200) })))
      })

      it('S6: labelsByRowId como texto ou lista falha; 201 entradas falham; 200 passam', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ labelsByRowId: 'WMS-1' })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ labelsByRowId: [{ wms: 'W', sq: 'S' }] })))
        const labels = (count) =>
          Object.fromEntries(Array.from({ length: count }, (_, index) => [`r-${index}`, { wms: 'W', sq: 'S' }]))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ labelsByRowId: labels(201) })))
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ labelsByRowId: labels(200) })))
      })

      it('S6: etiqueta com 121 caracteres e ACEITA pela rule (limite de 120 e do cliente; rules nao iteram mapas)', async () => {
        await seedCurrent()
        await assertSucceeds(
          setDoc(doc(logistics(), CONF), conference({ labelsByRowId: { 'r-0': { wms: 'x'.repeat(121), sq: '' } } }))
        )
      })

      it('checkedByName de 121 falha; shape com campo extra falha', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ checkedByName: 'x'.repeat(121) })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ extra: 1 })))
      })

      it('S7: checkedByName diferente da claim da logistica falha (Conferido por automatico e travado)', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ checkedByName: 'Outra Pessoa' })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ checkedByName: '' })))
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ checkedByName: 'Logistica' })))
      })

      it('autoria: uid de outro e nome diferente da claim falham', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ updatedById: 'outro-uid' })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ updatedByName: 'Outro Nome' })))
      })

      it('delete negado ate para admin', async () => {
        await seedCurrent()
        await seedConference(1)
        await assertFails(deleteDoc(doc(admin(), CONF)))
        await assertFails(deleteDoc(doc(logistics(), CONF)))
      })

      it('S7: logistica salva a conferencia aberta nos estados 1 (rascunho) e 2 (COMEX fechado)', async () => {
        await seedCurrent(1, 'rascunho')
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 1 })))
        await seedCurrent(2, 'concluido')
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
      })

      it('S7: shape novo: status, receiptStatus, receivedDate, nfNumber, notes e closedByName invalidos falham', async () => {
        await seedCurrent()
        await assertFails(setDoc(doc(logistics(), CONF), conference({ status: 'x' })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ receiptStatus: 'x' })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ receivedDate: '24/11/2026' })))
        // S10 (S9-E): nfNumber da conferencia e uma lista de NFs de ate 1000 caracteres (o limite de 40 e do current).
        await assertFails(setDoc(doc(logistics(), CONF), conference({ nfNumber: 'x'.repeat(1001) })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ notes: 'x'.repeat(2001) })))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ closedByName: 'x'.repeat(121) })))
        await assertSucceeds(
          setDoc(
            doc(logistics(), CONF),
            conference({
              receiptStatus: 'com_ressalva',
              receivedDate: '2026-11-22',
              nfNumber: 'x'.repeat(40),
              notes: 'x'.repeat(2000),
            })
          )
        )
      })

      it('S10: lista de NFs: 1000 caracteres passa, 1001 falha, 41 caracteres passa', async () => {
        await seedCurrent()
        const list = (size) =>
          Array.from({ length: Math.ceil(size / 10) }, (_, index) => String(1000000000 + index))
            .join('; ')
            .slice(0, size)
        expect(list(1000)).toHaveLength(1000)
        await assertFails(setDoc(doc(logistics(), CONF), conference({ nfNumber: list(1001) })))
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ nfNumber: list(1000) })))
        await seedConference(1)
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2, nfNumber: 'x'.repeat(41) })))
      })

      it('S7: payload sem status ou sem notes (bundle antigo) falha; revisao errada falha', async () => {
        await seedCurrent()
        const { status: _status, ...semStatus } = conference()
        const { notes: _notes, ...semNotes } = conference()
        await assertFails(setDoc(doc(logistics(), CONF), semStatus))
        await assertFails(setDoc(doc(logistics(), CONF), semNotes))
        await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
      })

      it('S7: conferencia legada SEM status (9 chaves) conta como aberta: logistica atualiza com o payload novo', async () => {
        await seedCurrent()
        await seedLegacyConference(1)
        await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
      })

      // S11-I: `palletsByRowId` (contador por item) e `damageByRowId` (observacao por item) sao opcionais (23 chaves no
      // hasOnly, 21 no hasAll), so' o formato do mapa e' validado (<= 200 entradas) e as duas chaves sao "pegajosas".
      describe('palletsByRowId e damageByRowId (S11-I)', () => {
        const pallets = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`r-${index}`, 3]))
        const damage = (count) =>
          Object.fromEntries(
            Array.from({ length: count }, (_, index) => [`r-${index}`, { flagged: true, note: 'amassado', photos: [] }])
          )
        const FILLED_MAPS = {
          palletsByRowId: { 'r-0': 3, 'r-1': 0 },
          damageByRowId: { 'r-0': { flagged: true, note: 'Tambor amassado', photos: [] } },
        }

        it('logistica grava os dois mapas e a admin/logistica leem o conteudo', async () => {
          await seedCurrent()
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference(FILLED_MAPS)))
          const snapshot = await assertSucceeds(getDoc(doc(admin(), CONF)))
          expect(snapshot.data().palletsByRowId).toEqual({ 'r-0': 3, 'r-1': 0 })
          expect(snapshot.data().damageByRowId['r-0'].note).toBe('Tambor amassado')
          await assertSucceeds(getDoc(doc(logistics(), CONF)))
        })

        it('mapas vazios passam; sem as chaves (doc e bundle antigos) tambem passam', async () => {
          await seedCurrent()
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ palletsByRowId: {}, damageByRowId: {} })))
          await seedConference(1)
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
        })

        it('mapa com 201 entradas falha; com 200 passa', async () => {
          await seedCurrent()
          await assertFails(setDoc(doc(logistics(), CONF), conference({ palletsByRowId: pallets(201) })))
          await assertFails(setDoc(doc(logistics(), CONF), conference({ damageByRowId: damage(201) })))
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ palletsByRowId: pallets(200) })))
          // A chave de pallets ja gravada e' pegajosa: o 2o write leva as duas.
          await assertSucceeds(
            setDoc(
              doc(logistics(), CONF),
              conference({ revision: 2, palletsByRowId: pallets(200), damageByRowId: damage(200) })
            )
          )
        })

        it('tipo errado (texto, lista, numero, null) falha nos dois mapas', async () => {
          await seedCurrent()
          for (const key of ['palletsByRowId', 'damageByRowId']) {
            for (const wrong of ['x', [1], 5, null]) {
              await assertFails(setDoc(doc(logistics(), CONF), conference({ [key]: wrong })))
            }
          }
        })

        it('REMOVER os mapas depois de gravados falha: bundle antigo (sem as chaves) nao apaga contagem nem avaria', async () => {
          await seedCurrent()
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference(FILLED_MAPS)))
          // Bundle antigo: payload de 21 chaves, sem os mapas.
          await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
          // So' uma das chaves some: tambem falha.
          await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2, palletsByRowId: { 'r-0': 1 } })))
          await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2, damageByRowId: {} })))
          // Bundle novo: as duas chaves presentes (podem ficar vazias).
          await assertSucceeds(
            setDoc(doc(logistics(), CONF), conference({ revision: 2, palletsByRowId: {}, damageByRowId: {} }))
          )
        })

        it('doc antigo sem as chaves: o bundle antigo continua gravando; o novo passa a gravar as chaves', async () => {
          await seedCurrent()
          await seedConference(1)
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ revision: 3, ...FILLED_MAPS })))
          await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 4 })))
        })

        it('`notes` legado continua aceito (nao e travado): conferencia pre-S7 copia o `notes` do current', async () => {
          await seedCurrent()
          await assertSucceeds(setDoc(doc(logistics(), CONF), conference({ ...FILLED_MAPS, notes: 'registro antigo' })))
        })

        it('tecnico, faturamento, usuario aprovado e anonimo nao gravam os mapas', async () => {
          await seedCurrent()
          for (const db of [roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]) {
            await assertFails(setDoc(doc(db, CONF), conference({ ...FILLED_MAPS })))
          }
        })

        it('logistica fecha a conferencia levando os mapas (estado 2, com documento cargoReport proprio)', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1)
          await seedCargoDoc('log-1')
          await assertSucceeds(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, ...FILLED_MAPS })))
        })
      })

      describe('fechar (logistica)', () => {
        it('estado 2 com documento cargoReport proprio: fecha', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1)
          await seedCargoDoc('log-1')
          await assertSucceeds(setDoc(doc(logistics(), CONF), closedConference({ revision: 2 })))
        })

        it('estado 2 sem conferencia previa (create ja fechando): passa com o documento proprio', async () => {
          await seedCurrent(1, 'concluido')
          await seedCargoDoc('log-1')
          await assertSucceeds(setDoc(doc(logistics(), CONF), closedConference({ revision: 1 })))
        })

        it('estado 1 (COMEX em rascunho): fechar falha', async () => {
          await seedCurrent(1, 'rascunho')
          await seedConference(1)
          await seedCargoDoc('log-1')
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2 })))
        })

        it('falha com documento de outro uid, de outro tipo ou inexistente', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1)
          await seedCargoDoc('outro-uid')
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2 })))
          await seedCargoDoc('log-1', 'bl')
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2 })))
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, closedDocumentId: 'nao-existe' })))
        })

        it('falha com closedById de outro, closedDate invalida ou closedByName diferente da claim', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1)
          await seedCargoDoc('log-1')
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, closedById: 'outro-uid' })))
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, closedDate: '24/11/2026' })))
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, closedDate: '' })))
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, closedByName: 'Outra Pessoa' })))
        })

        it('fechada com closure vazia falha; aberta com closure preenchida falha', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1)
          await seedCargoDoc('log-1')
          await assertFails(
            setDoc(
              doc(logistics(), CONF),
              closedConference({ revision: 2, closedDate: '', closedById: '', closedByName: '', closedDocumentId: '' })
            )
          )
          await assertFails(
            setDoc(
              doc(logistics(), CONF),
              conference({
                revision: 2,
                closedDate: '2026-11-24',
                closedById: 'log-1',
                closedByName: 'Logistica',
                closedDocumentId: CLOSED_DOC_ID,
              })
            )
          )
        })

        it('qualquer gravacao da logistica sobre conferencia ja fechada falha (salvar, refechar, reabrir)', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1, 'fechada')
          await seedCargoDoc('log-1')
          await assertFails(setDoc(doc(logistics(), CONF), conference({ revision: 2 })))
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2 })))
          await assertFails(
            setDoc(
              doc(logistics(), CONF),
              conference({ revision: 2, closedDate: '', closedById: '', closedByName: '', closedDocumentId: '' })
            )
          )
        })
      })

      describe('reabrir (admin)', () => {
        const reopened = (overrides = {}) =>
          conference({ revision: 2, updatedById: 'admin-1', updatedByName: 'Admin', ...overrides })
        const adminReopened = async (overrides = {}) => {
          await seedCurrent(1, 'concluido')
          await seedConference(1, 'fechada')
          return setDoc(doc(admin(), CONF), reopened(overrides))
        }

        it('fechada -> aberta com a closure zerada e o conteudo intacto passa', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1, 'fechada')
          await assertSucceeds(setDoc(doc(admin(), CONF), reopened()))
          const snapshot = await assertSucceeds(getDoc(doc(logistics(), CONF)))
          expect(snapshot.data().status).toBe('aberta')
          expect(snapshot.data().closedDocumentId).toBe('')
          expect(snapshot.data().checkedByName).toBe('Logistica')
        })

        it('S10: admin reabre conferencia fechada com a lista de NFs de 1000 caracteres (copia o texto do servidor)', async () => {
          const nfNumber = Array.from({ length: 100 }, (_, index) => String(10000000 + index))
            .join('; ')
            .padEnd(1000, '0')
          expect(nfNumber).toHaveLength(1000)
          await seedCurrent(1, 'concluido')
          await seed((db) =>
            setDoc(doc(db, CONF), { ...closedConference({ revision: 1, nfNumber }), updatedAt: new Date('2026-11-01T11:00:00Z') })
          )
          await assertFails(setDoc(doc(admin(), CONF), reopened({ nfNumber: nfNumber.slice(0, 999) })))
          await assertSucceeds(setDoc(doc(admin(), CONF), reopened({ nfNumber })))
        })

        it('S11-I: reabre conferencia fechada COM os mapas (copia exata passa); mudar ou remover os mapas falha', async () => {
          const maps = {
            palletsByRowId: { 'r-0': 3 },
            damageByRowId: { 'r-0': { flagged: true, note: 'Tambor amassado', photos: [] } },
          }
          const seedClosedWithMaps = async () => {
            await seedCurrent(1, 'concluido')
            await seed((db) =>
              setDoc(doc(db, CONF), { ...closedConference({ revision: 1, ...maps }), updatedAt: new Date('2026-11-01T11:00:00Z') })
            )
          }
          await seedClosedWithMaps()
          // Admin mexe no conteudo dos mapas: a reabertura so' aceita mudar os carimbos e o fechamento.
          await assertFails(setDoc(doc(admin(), CONF), reopened({ ...maps, palletsByRowId: { 'r-0': 4 } })))
          await assertFails(setDoc(doc(admin(), CONF), reopened({ ...maps, damageByRowId: {} })))
          // Admin com o bundle antigo (sem as chaves) tambem nao apaga: a chave e' pegajosa.
          await assertFails(setDoc(doc(admin(), CONF), reopened()))
          await assertSucceeds(setDoc(doc(admin(), CONF), reopened({ ...maps })))
          const snapshot = await assertSucceeds(getDoc(doc(logistics(), CONF)))
          expect(snapshot.data()).toMatchObject({ status: 'aberta', ...maps })
        })

        it('S11-I: reabre conferencia fechada ANTES dos mapas (sem as chaves): a copia sem as chaves passa e nao as cria', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1, 'fechada')
          await assertSucceeds(setDoc(doc(admin(), CONF), reopened()))
          const snapshot = await assertSucceeds(getDoc(doc(logistics(), CONF)))
          expect(snapshot.data()).not.toHaveProperty('palletsByRowId')
          expect(snapshot.data()).not.toHaveProperty('damageByRowId')
        })

        it('reabrir mudando okByRowId, labelsByRowId, notes ou checkedByName falha', async () => {
          await assertFails(adminReopened({ okByRowId: { 'r-0': false } }))
          await assertFails(adminReopened({ labelsByRowId: { 'r-0': { wms: 'OUTRA', sq: '' } } }))
          await assertFails(adminReopened({ notes: 'texto do admin' }))
          await assertFails(adminReopened({ checkedByName: 'Admin' }))
        })

        it('admin nao fecha, nao salva conteudo e nao cria; reabrir doc ja aberto falha', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1, 'aberta')
          await assertFails(setDoc(doc(admin(), CONF), reopened()))
          await assertFails(setDoc(doc(admin(), CONF), reopened({ okByRowId: { 'r-0': false } })))
          await assertFails(
            setDoc(
              doc(admin(), CONF),
              closedConference({ revision: 2, updatedById: 'admin-1', updatedByName: 'Admin' })
            )
          )
        })

        it('reabrir com revisao errada falha', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1, 'fechada')
          await assertFails(setDoc(doc(admin(), CONF), reopened({ revision: 3 })))
          await assertFails(setDoc(doc(admin(), CONF), reopened({ revision: 1 })))
        })
      })

      // S8: descarga (texto YYYY-MM-DDTHH:mm sem fuso), etiquetagem OK e `receivedDate` = dia do inicio.
      describe('S8: descarga, etiquetagem e vinculo da data de recebimento', () => {
        const UNLOAD = { unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' }
        const write = (overrides = {}) => setDoc(doc(logistics(), CONF), conference(overrides))
        // Doc fechado gravado pela S7 (18 chaves, sem as 3 novas); `receivedDate` preenchido pelo rodape antigo.
        const seedS7ClosedConference = (revision = 1, overrides = {}) =>
          seed((db) => {
            const { unloadStartAt: _start, unloadEndAt: _end, labelingOk: _ok, ...s7 } = closedConference({ revision, ...overrides })
            return setDoc(doc(db, CONF), { ...s7, updatedAt: new Date('2026-11-01T11:00:00Z') })
          })

        it('a. estados 1 e 2: grava descarga completa, fim = inicio, so inicio e virada de dia', async () => {
          for (const status of ['rascunho', 'concluido']) {
            await seedCurrent(1, status)
            await seed((db) => deleteDoc(doc(db, CONF)))
            await assertSucceeds(write({ ...UNLOAD, labelingOk: true }))
            await assertSucceeds(write({ ...UNLOAD, revision: 2, unloadEndAt: UNLOAD.unloadStartAt }))
            await assertSucceeds(write({ revision: 3, unloadStartAt: UNLOAD.unloadStartAt, receivedDate: '2026-11-24' }))
            await assertSucceeds(
              write({ revision: 4, unloadStartAt: '2026-11-24T23:30', unloadEndAt: '2026-11-25T01:10', receivedDate: '2026-11-24' })
            )
          }
        })

        it('b. shape: formato, calendario, tipo, fim antes do inicio, fim sem inicio e chave extra falham', async () => {
          await seedCurrent()
          const invalid = [
            { ...UNLOAD, unloadEndAt: '2026-11-24T08:00' },
            { unloadEndAt: '2026-11-24T10:40' },
            { ...UNLOAD, unloadStartAt: '24/11/2026 08:15' },
            { ...UNLOAD, unloadStartAt: '2026-11-24 08:15' },
            { ...UNLOAD, unloadStartAt: '2026-11-24T08:15:00' },
            { ...UNLOAD, unloadStartAt: '2019-11-24T08:15', receivedDate: '2019-11-24' },
            { ...UNLOAD, unloadEndAt: '2026-11-24T10:61' },
            { ...UNLOAD, unloadEndAt: 12 },
            { ...UNLOAD, unloadStartAt: 12 },
            { ...UNLOAD, labelingOk: 'sim' },
            { ...UNLOAD, labelingOk: 1 },
            { ...UNLOAD, unloadMinutes: 145 },
          ]
          for (const overrides of invalid) await assertFails(write(overrides))
          await assertSucceeds(write({ ...UNLOAD, labelingOk: false }))
        })

        // Cada caso abaixo tem UMA unica violacao possivel: o formato (regex). O vinculo com receivedDate esta
        // satisfeito e, no fim invalido, o fim e' lexicograficamente MAIOR que o inicio (a ordem nao pode ser a causa).
        it('b. formato do inicio: hora, minuto, mes e dia fora de faixa falham mesmo sem fim', async () => {
          await seedCurrent()
          const invalidStart = [
            ['2026-11-24T24:00', '2026-11-24'],
            ['2026-11-24T25:00', '2026-11-24'],
            ['2026-11-24T08:60', '2026-11-24'],
            ['2026-13-01T08:00', '2026-13-01'],
            ['2026-00-10T08:00', '2026-00-10'],
            ['2026-11-32T08:00', '2026-11-32'],
            ['2026-11-00T08:00', '2026-11-00'],
            ['2026-11-24T08:15:00', '2026-11-24'],
            ['2026-11-24T08:15T', '2026-11-24'],
            ['2100-01-01T08:00', '2100-01-01'],
            ['2026-11-24 08:15', '2026-11-24'],
          ]
          for (const [unloadStartAt, receivedDate] of invalidStart) {
            await assertFails(write({ unloadStartAt, unloadEndAt: '', receivedDate }))
          }
        })

        it('b. formato do fim: hora, minuto, mes, dia, sufixo e espaco falham com inicio valido e fim "maior"', async () => {
          await seedCurrent()
          const invalidEnd = [
            ['2026-11-24T08:15', '2026-11-24T24:00'],
            ['2026-11-24T08:15', '2026-11-24T25:00'],
            ['2026-11-24T08:15', '2026-11-24T10:60'],
            ['2026-11-24T08:15', '2026-13-24T10:00'],
            ['2026-11-24T08:15', '2026-11-32T10:00'],
            ['2026-11-24T08:15', '2026-11-24T10:40T'],
            ['2026-11-24T08:15', '2100-01-01T10:00'],
            ['2026-11-24T08:15', '2026-11-24T10:40:00'],
            ['2026-11-23T08:15', '2026-11-24 10:40'],
            ['2026-11-23T08:15', '2026-11-24/10:40'],
          ]
          for (const [unloadStartAt, unloadEndAt] of invalidEnd) {
            await assertFails(write({ unloadStartAt, unloadEndAt, receivedDate: unloadStartAt.slice(0, 10) }))
          }
        })

        it('b. limites validos do formato passam (00:00, 23:59, mes 12, dia 31, ano 2020 e 2099)', async () => {
          await seedCurrent()
          const valid = [
            ['2020-01-01T00:00', '2020-01-01T00:00'],
            ['2026-12-31T23:59', '2026-12-31T23:59'],
            ['2099-12-31T08:00', '2099-12-31T23:59'],
          ]
          let revision = 1
          for (const [unloadStartAt, unloadEndAt] of valid) {
            await assertSucceeds(write({ revision, unloadStartAt, unloadEndAt, receivedDate: unloadStartAt.slice(0, 10) }))
            revision += 1
          }
        })

        it('b. payload sem qualquer uma das 3 chaves (bundle S7) falha', async () => {
          await seedCurrent()
          for (const key of ['unloadStartAt', 'unloadEndAt', 'labelingOk']) {
            const { [key]: _removed, ...partial } = conference()
            await assertFails(setDoc(doc(logistics(), CONF), partial))
          }
        })

        it('c. vinculo: receivedDate precisa ser o dia do inicio; sem inicio o legado passa', async () => {
          await seedCurrent()
          await assertFails(write({ ...UNLOAD, receivedDate: '2026-11-23' }))
          await assertFails(write({ ...UNLOAD, receivedDate: '' }))
          await assertFails(
            write({ unloadStartAt: '2026-11-24T23:30', unloadEndAt: '2026-11-25T01:10', receivedDate: '2026-11-25' })
          )
          await assertSucceeds(write({ receivedDate: '2026-11-20' }))
          await assertSucceeds(write({ revision: 2, receivedDate: '' }))
        })

        it('d. fecha no estado 2 com descarga e data derivada; data divergente falha', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1)
          await seedCargoDoc('log-1')
          await assertFails(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, ...UNLOAD, receivedDate: '2026-11-20' })))
          await assertSucceeds(setDoc(doc(logistics(), CONF), closedConference({ revision: 2, ...UNLOAD, labelingOk: true })))
        })

        it('e. conferencia fechada: logistica nao muda etiquetagem, inicio nem data', async () => {
          await seedCurrent(1, 'concluido')
          await seedConference(1, 'fechada')
          await seedCargoDoc('log-1')
          await assertFails(write({ revision: 2, labelingOk: true }))
          await assertFails(write({ revision: 2, ...UNLOAD }))
          await assertFails(write({ revision: 2, receivedDate: '2026-11-25' }))
        })

        describe('admin', () => {
          const reopen = (overrides = {}) =>
            setDoc(doc(admin(), CONF), conference({ revision: 2, updatedById: 'admin-1', updatedByName: 'Admin', ...overrides }))
          const FILLED = { ...UNLOAD, labelingOk: true }
          const seedFilled = async () => {
            await seedCurrent(1, 'concluido')
            await seed((db) =>
              setDoc(doc(db, CONF), { ...closedConference({ revision: 1, ...FILLED }), updatedAt: new Date('2026-11-01T11:00:00Z') })
            )
          }

          it('grava conteudo com as chaves novas em doc aberto: falha', async () => {
            await seedCurrent(1, 'concluido')
            await seedConference(1, 'aberta')
            await assertFails(reopen({ ...FILLED }))
            await assertFails(reopen({ labelingOk: true }))
          })

          it('reabre doc fechado mantendo os 3 valores: passa', async () => {
            await seedFilled()
            await assertSucceeds(reopen({ ...FILLED }))
            const snapshot = await assertSucceeds(getDoc(doc(logistics(), CONF)))
            expect(snapshot.data()).toMatchObject({ status: 'aberta', labelingOk: true, ...UNLOAD })
          })

          it('reabre mudando inicio, fim, etiquetagem ou data de recebimento: falha', async () => {
            await seedFilled()
            await assertFails(reopen({ ...FILLED, unloadStartAt: '2026-11-24T08:00' }))
            await assertFails(reopen({ ...FILLED, unloadEndAt: '2026-11-24T11:00' }))
            await assertFails(reopen({ ...FILLED, labelingOk: false }))
            await assertFails(reopen({ ...FILLED, receivedDate: '2026-11-25' }))
          })

          it('reabre doc S7 (sem as chaves) so acrescentando o padrao; data de recebimento mantida', async () => {
            await seedCurrent(1, 'concluido')
            await seedS7ClosedConference(1, { receivedDate: '2026-11-20' })
            await assertFails(reopen({ receivedDate: '2026-11-20', labelingOk: true }))
            await assertFails(reopen({ receivedDate: '2026-11-20', unloadStartAt: '2026-11-20T08:00' }))
            await assertFails(reopen({ receivedDate: '2026-11-21' }))
            await assertSucceeds(reopen({ receivedDate: '2026-11-20' }))
            const snapshot = await assertSucceeds(getDoc(doc(admin(), CONF)))
            expect(snapshot.data()).toMatchObject({
              status: 'aberta',
              receivedDate: '2026-11-20',
              unloadStartAt: '',
              unloadEndAt: '',
              labelingOk: false,
            })
          })
        })

        it('g. tecnico, faturamento, usuario aprovado e anonimo nao gravam conferencia com as chaves novas', async () => {
          await seedCurrent()
          for (const db of [roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]) {
            await assertFails(setDoc(doc(db, CONF), conference({ ...UNLOAD, labelingOk: true })))
          }
        })
      })
    })

    // S10-J2: espelho `cargoReport/damage` (gravado so pelo trigger, Admin SDK) e trava `cargoReport/conferenceNotice` (sem match).
    describe('damage e conferenceNotice (S10-J2)', () => {
      const DAMAGE = `processes/${PID}/cargoReport/damage`
      const NOTICE = `processes/${PID}/cargoReport/conferenceNotice`
      const mirror = (overrides = {}) => ({
        schemaVersion: 1,
        conferenceRevision: 3,
        closedDate: '2026-11-24',
        closedByName: 'Logistica',
        receiptStatus: 'com_ressalva',
        pallets: { counted: 23, expected: 25 },
        items: [{ rowId: 'r-0', index: 1, label: 'DEA FOAM', code: 'AD5240', note: 'Caixas molhadas', flagged: true, photos: [{ id: 'aaa', width: 1600, height: 1200 }] }],
        itemCount: 1,
        photoCount: 1,
        updatedAt: new Date('2026-11-24T16:00:00Z'),
        ...overrides,
      })
      const seedDamage = async () => {
        await seedProcess()
        await seed((db) => setDoc(doc(db, DAMAGE), mirror()))
      }
      const seedNotice = async () => {
        await seedProcess()
        await seed((db) => setDoc(doc(db, NOTICE), { documentId: CLOSED_DOC_ID, sentAt: new Date('2026-11-24T16:00:00Z') }))
      }

      it('admin, logistica, tecnico e faturamento leem o espelho', async () => {
        await seedDamage()
        for (const db of [admin(), logistics(), roleDb('tecnico'), roleDb('faturamento')]) {
          await assertSucceeds(getDoc(doc(db, DAMAGE)))
        }
      })

      it('usuario comum, compras, viewer, nao aprovado e anonimo NAO leem o espelho', async () => {
        await seedDamage()
        const denied = [
          approvedUser(),
          roleDb('compras'),
          roleDb('viewer'),
          testEnv.authenticatedContext('tec-pend', { email: 'tec@sqquimica.com', role: 'tecnico', status: 'Pendente', name: 'Tec' }).firestore(),
          testEnv.authenticatedContext('tec-ext', { email: 'tec@gmail.com', role: 'tecnico', status: 'Ativo', name: 'Tec' }).firestore(),
          anon(),
        ]
        for (const db of denied) await assertFails(getDoc(doc(db, DAMAGE)))
      })

      it('ninguem grava, atualiza nem apaga o espelho (nem admin nem logistica)', async () => {
        await seedDamage()
        for (const db of [admin(), logistics(), roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]) {
          await assertFails(setDoc(doc(db, DAMAGE), mirror({ itemCount: 2 })))
          await assertFails(updateDoc(doc(db, DAMAGE), { itemCount: 2 }))
          await assertFails(deleteDoc(doc(db, DAMAGE)))
        }
        const fresh = `processes/${PID}-novo/cargoReport/damage`
        await assertFails(setDoc(doc(admin(), fresh), mirror()))
        await assertFails(setDoc(doc(logistics(), fresh), mirror()))
      })

      it('tecnico e faturamento seguem sem ler current e conference', async () => {
        await seedCurrent()
        await seedConference()
        for (const role of ['tecnico', 'faturamento']) {
          await assertFails(getDoc(doc(roleDb(role), CUR)))
          await assertFails(getDoc(doc(roleDb(role), CONF)))
        }
      })

      it('conferenceNotice: ninguem le nem grava (sem regra = negado)', async () => {
        await seedNotice()
        const everyone = [admin(), logistics(), roleDb('tecnico'), roleDb('faturamento'), approvedUser(), anon()]
        for (const db of everyone) {
          await assertFails(getDoc(doc(db, NOTICE)))
          await assertFails(setDoc(doc(db, NOTICE), { documentId: 'x', sentAt: serverTimestamp() }))
          await assertFails(updateDoc(doc(db, NOTICE), { documentId: 'x' }))
          await assertFails(deleteDoc(doc(db, NOTICE)))
        }
      })
    })

    describe('documents cargoReport (S7)', () => {
      const DOC_PATH = `processes/${PID}/documents/d-new`

      it('logistica cria cargoReport no estado 2 (COMEX fechado, conferencia aberta)', async () => {
        await seedCurrent(1, 'concluido')
        await assertSucceeds(setDoc(doc(logistics(), DOC_PATH), cargoDocFields()))
        await seedConference(1, 'aberta')
        await assertSucceeds(setDoc(doc(logistics(), `${DOC_PATH}-2`), cargoDocFields()))
      })

      it('logistica NAO cria cargoReport no estado 1, no estado 3 nem sem current', async () => {
        await seedProcess()
        await assertFails(setDoc(doc(logistics(), DOC_PATH), cargoDocFields()))
        await seedCurrent(1, 'rascunho')
        await assertFails(setDoc(doc(logistics(), DOC_PATH), cargoDocFields()))
        await seedCurrent(2, 'concluido')
        await seedConference(1, 'fechada')
        await assertFails(setDoc(doc(logistics(), DOC_PATH), cargoDocFields()))
      })

      it('logistica continua sem criar bl, mesmo no estado 2', async () => {
        await seedCurrent(1, 'concluido')
        await assertFails(
          setDoc(
            doc(logistics(), DOC_PATH),
            cargoDocFields({
              type: 'bl',
              slotKey: 'bl',
              storagePath: `processes/${PID}/documents/bl/1-log-1-x.pdf`,
            })
          )
        )
      })

      it('admin cria cargoReport em qualquer estado', async () => {
        const adminFields = cargoDocFields({
          storagePath: `processes/${PID}/documents/cargoReport/1-admin-1-x.xlsx`,
          uploadedById: 'admin-1',
          uploadedByName: 'Admin',
          uploadedByRole: 'admin',
        })
        await seedProcess()
        await assertSucceeds(setDoc(doc(admin(), `${DOC_PATH}-a`), adminFields))
        await seedCurrent(1, 'rascunho')
        await assertSucceeds(setDoc(doc(admin(), `${DOC_PATH}-b`), adminFields))
        await seedCurrent(2, 'concluido')
        await seedConference(1, 'fechada')
        await assertSucceeds(setDoc(doc(admin(), `${DOC_PATH}-c`), adminFields))
      })

      it('logistica NAO apaga o proprio cargoReport e continua apagando o proprio containerWash', async () => {
        await seedProcess()
        await seedCargoDoc('log-1')
        await assertFails(deleteDoc(doc(logistics(), `processes/${PID}/documents/${CLOSED_DOC_ID}`)))
        await seed((db) =>
          setDoc(doc(db, `processes/${PID}/documents/d-wash`), {
            ...cargoDocFields({
              type: 'containerWash',
              slotKey: 'containerWash:CNT-1',
              containerId: 'CNT-1',
              storagePath: `processes/${PID}/documents/containerWash/CNT-1/1-log-1-x.pdf`,
            }),
            uploadedAt: new Date('2026-11-01T11:30:00Z'),
          })
        )
        await assertSucceeds(deleteDoc(doc(logistics(), `processes/${PID}/documents/d-wash`)))
        await assertSucceeds(deleteDoc(doc(admin(), `processes/${PID}/documents/${CLOSED_DOC_ID}`)))
      })
    })
  })

  describe('catch-all', () => {
    it('colecao desconhecida eh negada ate pra admin', async () => {
      await assertFails(getDoc(doc(admin(), 'colecaoAleatoria/x')))
      await assertFails(setDoc(doc(admin(), 'colecaoAleatoria/x'), { a: 1 }))
    })
  })
})
