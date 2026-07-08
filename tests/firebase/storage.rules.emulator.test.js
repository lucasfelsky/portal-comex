// Testes REAIS das storage.rules com @firebase/rules-unit-testing contra o
// emulador de Storage (+ Firestore, porque as storage.rules leem o perfil do
// usuario via firestore.get(users/{uid}) — role/status NAO vem de claims aqui,
// diferente das firestore.rules).
//
// Como rodar: npm run test:rules (sobe firestore+storage no emulador via
// scripts/with-jdk.mjs -> JDK 21). Sem FIREBASE_STORAGE_EMULATOR_HOST (ex.:
// `npm test` normal) o describe inteiro e' pulado.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { ref, uploadString, getMetadata } from 'firebase/storage'

const HERE = dirname(fileURLToPath(import.meta.url))
const STORAGE_RULES = join(HERE, '..', '..', 'storage.rules')
const FIRESTORE_RULES = join(HERE, '..', '..', 'firestore.rules')

const EMULATOR_UP = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST)
const describeEmulator = EMULATOR_UP ? describe : describe.skip

describeEmulator('storage.rules (emulador)', () => {
  let testEnv

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-sqcomex',
      firestore: { rules: readFileSync(FIRESTORE_RULES, 'utf8') },
      storage: { rules: readFileSync(STORAGE_RULES, 'utf8') },
    })
  })

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup()
  })

  // As storage.rules leem role/status do doc users/{uid} no Firestore.
  // Semeia os perfis a cada teste (perfil = fonte da verdade aqui).
  beforeEach(async () => {
    if (!testEnv) return
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users/admin-1'), { role: 'admin', status: 'Ativo' })
      await setDoc(doc(db, 'users/log-1'), { role: 'logistica', status: 'Ativo' })
      await setDoc(doc(db, 'users/user-1'), { role: 'user', status: 'Ativo' })
      await setDoc(doc(db, 'users/pend-1'), { role: 'user', status: 'Pendente' })
      await setDoc(doc(db, 'users/gmail-1'), { role: 'admin', status: 'Ativo' })
    })
  })

  // storage() de um contexto autenticado (email vai pro token; role/status
  // vem do perfil semeado acima).
  const storageAs = (uid, email) =>
    testEnv.authenticatedContext(uid, { email }).storage()

  const anonStorage = () => testEnv.unauthenticatedContext().storage()

  // Semeia um objeto (bypass de rules) pra testar leitura.
  const seedObject = (path) =>
    testEnv.withSecurityRulesDisabled((ctx) => uploadString(ref(ctx.storage(), path), 'conteudo'))

  describe('post-receipt (processes/{pid}/post-receipt/{file})', () => {
    const PATH = 'processes/p1/post-receipt/foto.png'

    it('admin faz upload', async () => {
      await assertSucceeds(uploadString(ref(storageAs('admin-1', 'admin@sqquimica.com'), PATH), 'x'))
    })

    it('logistica faz upload', async () => {
      await assertSucceeds(uploadString(ref(storageAs('log-1', 'log@sqquimica.com'), PATH), 'x'))
    })

    it('usuario comum NAO faz upload', async () => {
      await assertFails(uploadString(ref(storageAs('user-1', 'user@sqquimica.com'), PATH), 'x'))
    })

    it('usuario Pendente NAO faz upload', async () => {
      await assertFails(uploadString(ref(storageAs('pend-1', 'pend@sqquimica.com'), PATH), 'x'))
    })

    it('admin com email nao-corporativo NAO faz upload', async () => {
      await assertFails(uploadString(ref(storageAs('gmail-1', 'admin@gmail.com'), PATH), 'x'))
    })

    it('anonimo NAO faz upload', async () => {
      await assertFails(uploadString(ref(anonStorage(), PATH), 'x'))
    })

    it('usuario aprovado LE o objeto; anonimo NAO', async () => {
      await seedObject(PATH)
      await assertSucceeds(getMetadata(ref(storageAs('user-1', 'user@sqquimica.com'), PATH)))
      await assertFails(getMetadata(ref(anonStorage(), PATH)))
    })
  })

  describe('news (news/{newsId}/{folder}/{file})', () => {
    const PATH = 'news/n1/cover/img.png'

    it('admin faz upload', async () => {
      await assertSucceeds(uploadString(ref(storageAs('admin-1', 'admin@sqquimica.com'), PATH), 'x'))
    })

    it('logistica NAO faz upload (news e admin-only)', async () => {
      await assertFails(uploadString(ref(storageAs('log-1', 'log@sqquimica.com'), PATH), 'x'))
    })

    it('usuario comum NAO faz upload', async () => {
      await assertFails(uploadString(ref(storageAs('user-1', 'user@sqquimica.com'), PATH), 'x'))
    })

    it('usuario aprovado LE o objeto', async () => {
      await seedObject(PATH)
      await assertSucceeds(getMetadata(ref(storageAs('user-1', 'user@sqquimica.com'), PATH)))
    })
  })
})
