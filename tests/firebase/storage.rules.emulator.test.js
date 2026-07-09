// Testes REAIS das storage.rules com @firebase/rules-unit-testing contra o
// emulador de Storage (+ Firestore, porque o spec continua semeando o doc
// `users/{uid}` para o caso `firestore.get` em outras rules — mas as
// storage.rules LEEM role/status do CUSTOM CLAIM, espelhando o que
// firestore.rules ja' faz (Sprint 5.1, 2026-06-30)).
//
// PR #4 do backlog (2026-07-09): storage.rules agora valida mime
// whitelist, size limit, anti path-traversal e metadata vazia em
// write. Custom claims em vez de firestore.get.
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
import { ref, uploadString, getMetadata, uploadBytes } from 'firebase/storage'

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

  // PR #4 do backlog (2026-07-09): storage.rules leem role/status
  // do CUSTOM CLAIM, nao do doc `users/{uid}`. Mantemos o
  // `beforeEach` semeando o doc para o caso de `firestore.get` em
  // outras rules (firestore.rules usa para algumas checagens), mas
  // as storage rules ignoram o doc e olham o token.
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

  // storage() de um contexto autenticado. PR #4: agora passamos
  // role/status como custom claims (espelhando o que Sprint 5.1 ja'
  // faz em prod). Antes passava so' email e a rule lia o role do
  // doc users/{uid}.
  const storageAs = (uid, email, role = null, status = null) => {
    const claims = { email }
    if (role) claims.role = role
    if (status) claims.status = status
    return testEnv.authenticatedContext(uid, claims).storage()
  }

  const anonStorage = () => testEnv.unauthenticatedContext().storage()

  // Semeia um objeto (bypass de rules) pra testar leitura.
  const seedObject = (path) =>
    testEnv.withSecurityRulesDisabled((ctx) => uploadString(ref(ctx.storage(), path), 'conteudo'))

  describe('post-receipt (processes/{pid}/post-receipt/{file})', () => {
    const PATH = 'processes/p1/post-receipt/foto.png'

    // PR #4 do backlog (2026-07-09): helpers que enviam upload
    // com contentType valido (espelha o que o app faz em
    // postReceiptImagesStorage.js).
    const uploadImage = async (uid, email, role, status, path, contentType = 'image/png') => {
      const blob = new Blob(['conteudo'], { type: contentType })
      return uploadBytes(
        ref(storageAs(uid, email, role, status), path),
        blob,
        { contentType }
      )
    }

    it('admin faz upload', async () => {
      await assertSucceeds(uploadImage('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo', PATH))
    })

    it('logistica faz upload', async () => {
      await assertSucceeds(uploadImage('log-1', 'log@sqquimica.com', 'logistica', 'Ativo', PATH))
    })

    it('usuario comum NAO faz upload', async () => {
      await assertFails(uploadImage('user-1', 'user@sqquimica.com', 'user', 'Ativo', PATH))
    })

    it('usuario Pendente NAO faz upload', async () => {
      await assertFails(uploadImage('pend-1', 'pend@sqquimica.com', 'user', 'Pendente', PATH))
    })

    it('admin com email nao-corporativo NAO faz upload', async () => {
      await assertFails(uploadImage('gmail-1', 'admin@gmail.com', 'admin', 'Ativo', PATH))
    })

    it('anonimo NAO faz upload', async () => {
      await assertFails(
        uploadBytes(ref(anonStorage(), PATH), new Blob(['x'], { type: 'image/png' }), { contentType: 'image/png' })
      )
    })

    it('usuario aprovado LE o objeto; anonimo NAO', async () => {
      await seedObject(PATH)
      await assertSucceeds(getMetadata(ref(storageAs('user-1', 'user@sqquimica.com', 'user', 'Ativo'), PATH)))
      await assertFails(getMetadata(ref(anonStorage(), PATH)))
    })

    // PR #4 do backlog (2026-07-09): mime whitelist (espelha
    // storageUploadValidation.js).
    it('upload com mime fora da whitelist FALHA (mesmo para admin)', async () => {
      const evilPath = 'processes/p1/post-receipt/evil.txt'
      await assertFails(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), evilPath),
          new Blob(['x'], { type: 'text/plain' }),
          { contentType: 'text/plain' }
        )
      )
    })

    // PR #4 do backlog (2026-07-09): anti path-traversal.
    it('upload com "/" no filename FALHA (path traversal)', async () => {
      // Mesmo que o sanitize do app nao gere "/", a rule tem que
      // defender em profundidade.
      const evilPath = 'processes/p1/post-receipt/../../admin/foo.png'
      await assertFails(uploadImage('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo', evilPath))
    })

    it('upload com filename > 200 chars FALHA', async () => {
      const longName = 'a'.repeat(201) + '.png'
      const evilPath = `processes/p1/post-receipt/${longName}`
      await assertFails(uploadImage('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo', evilPath))
    })

    it('upload com contentType "application/octet-stream" FALHA', async () => {
      const path = 'processes/p1/post-receipt/bin.png'
      await assertFails(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), path),
          new Blob(['x'], { type: 'application/octet-stream' }),
          { contentType: 'application/octet-stream' }
        )
      )
    })
  })

  describe('news (news/{newsId}/{folder}/{file})', () => {
    const PATH = 'news/n1/cover/img.png'

    it('admin faz upload', async () => {
      await assertSucceeds(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), PATH),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })

    it('logistica NAO faz upload (news e admin-only)', async () => {
      await assertFails(
        uploadBytes(
          ref(storageAs('log-1', 'log@sqquimica.com', 'logistica', 'Ativo'), PATH),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })

    it('usuario comum NAO faz upload', async () => {
      await assertFails(
        uploadBytes(
          ref(storageAs('user-1', 'user@sqquimica.com', 'user', 'Ativo'), PATH),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })

    it('usuario aprovado LE o objeto', async () => {
      await seedObject(PATH)
      await assertSucceeds(getMetadata(ref(storageAs('user-1', 'user@sqquimica.com', 'user', 'Ativo'), PATH)))
    })

    // PR #4 do backlog (2026-07-09): folder traversal em news.
    it('upload em folder invalido FALHA', async () => {
      const evilPath = 'news/n1/../admin/foto.png'
      await assertFails(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), evilPath),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })

    it('upload com folder "cover" NAO permite mime de arquivo (PDF)', async () => {
      const evilPath = 'news/n1/cover/foto.pdf'
      await assertFails(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), evilPath),
          new Blob(['x'], { type: 'application/pdf' }),
          { contentType: 'application/pdf' }
        )
      )
    })

    it('upload com folder "attachments" permite PDF (file contentType)', async () => {
      const path = 'news/n1/attachments/doc.pdf'
      await assertSucceeds(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), path),
          new Blob(['x'], { type: 'application/pdf' }),
          { contentType: 'application/pdf' }
        )
      )
    })
  })

  // PR #4 do backlog (2026-07-09): status case-insensitive (L18
  // ja' documentava). Status "Ativo" / "ativo" / " Ativo " devem
  // passar.
  describe('status case-insensitive (L18)', () => {
    it('status lowercase "ativo" PASSA (espelha L18 da firestore.rules)', async () => {
      const PATH = 'processes/p1/post-receipt/foto.png'
      await assertSucceeds(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'ativo'), PATH),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })

    it('status " Ativo " com espacos PASSA', async () => {
      const PATH = 'processes/p2/post-receipt/foto.png'
      await assertSucceeds(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', ' Ativo '), PATH),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })

    it('status "Pendente" FALHA', async () => {
      const PATH = 'processes/p1/post-receipt/foto.png'
      await assertFails(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Pendente'), PATH),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })
  })
})
