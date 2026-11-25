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

  describe('process documents (processes/{pid}/documents/... - F18a + AD-1)', () => {
    const uploadDoc = (uid, email, role, status, path, contentType = 'application/pdf') =>
      uploadBytes(
        ref(storageAs(uid, email, role, status), path),
        new Blob(['conteudo'], { type: contentType }),
        { contentType }
      )

    it('admin sobe PDF em bl (sem escopo)', async () => {
      await assertSucceeds(
        uploadDoc('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo', 'processes/p1/documents/bl/1-admin-1-bl.pdf')
      )
    })

    it('admin sobe XLSX em invoice (sem escopo)', async () => {
      await assertSucceeds(
        uploadDoc(
          'admin-1', 'admin@sqquimica.com', 'admin', 'Ativo',
          'processes/p1/documents/invoice/1-admin-1-invoice.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      )
    })

    it('admin sobe DOCX em cargoReport', async () => {
      await assertSucceeds(
        uploadDoc(
          'admin-1', 'admin@sqquimica.com', 'admin', 'Ativo',
          'processes/p1/documents/cargoReport/1-admin-1-relatorio.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      )
    })

    it('admin sobe PDF em coaOriginal (sem escopo)', async () => {
      await assertSucceeds(
        uploadDoc(
          'admin-1', 'admin@sqquimica.com', 'admin', 'Ativo',
          'processes/p1/documents/coaOriginal/1-admin-1-coa.pdf'
        )
      )
    })

    it('logistica NAO sobe em coaOriginal', async () => {
      await assertFails(
        uploadDoc(
          'log-1', 'log@sqquimica.com', 'logistica', 'Ativo',
          'processes/p1/documents/coaOriginal/1-log-1-coa.pdf'
        )
      )
    })

    it.each(['tecnico', 'faturamento'])('%s NAO sobe em coaOriginal/cargoReport e NAO le via SDK', async (role) => {
      const email = `${role}@sqquimica.com`
      await assertFails(
        uploadDoc(`${role}-1`, email, role, 'Ativo', `processes/p1/documents/coaOriginal/1-${role}-1-coa.pdf`)
      )
      await assertFails(
        uploadDoc(`${role}-1`, email, role, 'Ativo', `processes/p1/documents/cargoReport/1-${role}-1-cr.pdf`)
      )
      await seedObject('processes/p1/documents/coaOriginal/1-admin-1-coa.pdf')
      await assertFails(
        getMetadata(ref(storageAs(`${role}-1`, email, role, 'Ativo'), 'processes/p1/documents/coaOriginal/1-admin-1-coa.pdf'))
      )
    })

    it('admin sobe imagem em fispq/{itemId} (com escopo)', async () => {
      await assertSucceeds(
        uploadDoc(
          'admin-1', 'admin@sqquimica.com', 'admin', 'Ativo',
          'processes/p1/documents/fispq/ITEM-1/1-admin-1-fispq.png', 'image/png'
        )
      )
    })

    it('admin sobe PDF em invoice/{po} (CONSOLIDADO, com escopo)', async () => {
      await assertSucceeds(
        uploadDoc(
          'admin-1', 'admin@sqquimica.com', 'admin', 'Ativo',
          'processes/p1/documents/invoice/PO-1/1-admin-1-invoice.pdf'
        )
      )
    })

    it('logistica sobe em containerWash/{cid}', async () => {
      await assertSucceeds(
        uploadDoc(
          'log-1', 'log@sqquimica.com', 'logistica', 'Ativo',
          'processes/p1/documents/containerWash/CNT-1/1-log-1-lavacao.pdf'
        )
      )
    })

    it('S7: logistica sobe XLSX em cargoReport com o proprio uid (Excel do fechamento da conferencia)', async () => {
      await assertSucceeds(
        uploadDoc(
          'log-1', 'log@sqquimica.com', 'logistica', 'Ativo',
          'processes/p1/documents/cargoReport/1-log-1-relatorio.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      )
    })

    it('S7: logistica NAO sobe em cargoReport com o uid de outro', async () => {
      await assertFails(
        uploadDoc(
          'log-1', 'log@sqquimica.com', 'logistica', 'Ativo',
          'processes/p1/documents/cargoReport/1-admin-1-relatorio.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      )
    })

    it('logistica NAO sobe em bl', async () => {
      await assertFails(
        uploadDoc('log-1', 'log@sqquimica.com', 'logistica', 'Ativo', 'processes/p1/documents/bl/1-log-1-bl.pdf')
      )
    })

    it('logistica NAO sobe em fispq', async () => {
      await assertFails(
        uploadDoc(
          'log-1', 'log@sqquimica.com', 'logistica', 'Ativo',
          'processes/p1/documents/fispq/ITEM-1/1-log-1-fispq.pdf'
        )
      )
    })

    it('usuario comum NAO le nem sobe', async () => {
      await assertFails(
        uploadDoc('user-1', 'user@sqquimica.com', 'user', 'Ativo', 'processes/p1/documents/bl/1-user-1-bl.pdf')
      )
      await seedObject('processes/p1/documents/bl/1-admin-1-bl.pdf')
      await assertFails(
        getMetadata(ref(storageAs('user-1', 'user@sqquimica.com', 'user', 'Ativo'), 'processes/p1/documents/bl/1-admin-1-bl.pdf'))
      )
    })

    it('NINGUEM le via SDK cliente (L38: leitura so pela function)', async () => {
      await seedObject('processes/p1/documents/bl/1-admin-1-bl.pdf')
      await assertFails(
        getMetadata(ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), 'processes/p1/documents/bl/1-admin-1-bl.pdf'))
      )
      await assertFails(
        getMetadata(ref(storageAs('log-1', 'log@sqquimica.com', 'logistica', 'Ativo'), 'processes/p1/documents/bl/1-admin-1-bl.pdf'))
      )
      await assertFails(
        getMetadata(ref(storageAs('user-1', 'user@sqquimica.com', 'user', 'Ativo'), 'processes/p1/documents/bl/1-admin-1-bl.pdf'))
      )
    })

    it('acima de 20 MB falha', async () => {
      const bigBlob = new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: 'application/pdf' })
      await assertFails(
        uploadBytes(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), 'processes/p1/documents/bl/1-admin-1-grande.pdf'),
          bigBlob,
          { contentType: 'application/pdf' }
        )
      )
    })

    it('mime fora da whitelist falha (mesmo para admin)', async () => {
      await assertFails(
        uploadDoc(
          'admin-1', 'admin@sqquimica.com', 'admin', 'Ativo',
          'processes/p1/documents/bl/1-admin-1-evil.exe', 'application/octet-stream'
        )
      )
    })

    it('nome de arquivo sem o proprio uid falha', async () => {
      await assertFails(
        uploadDoc('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo', 'processes/p1/documents/bl/1-outro-uid-bl.pdf')
      )
    })

    it('delete: admin apaga qualquer', async () => {
      const { deleteObject } = await import('firebase/storage')
      await seedObject('processes/p1/documents/containerWash/CNT-1/1-log-1-lavacao.pdf')
      await assertSucceeds(
        deleteObject(
          ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), 'processes/p1/documents/containerWash/CNT-1/1-log-1-lavacao.pdf')
        )
      )
    })

    it('delete: logistica NAO apaga arquivo de outro uid', async () => {
      const { deleteObject } = await import('firebase/storage')
      await seedObject('processes/p1/documents/containerWash/CNT-2/1-admin-1-lavacao.pdf')
      await assertFails(
        deleteObject(
          ref(storageAs('log-1', 'log@sqquimica.com', 'logistica', 'Ativo'), 'processes/p1/documents/containerWash/CNT-2/1-admin-1-lavacao.pdf')
        )
      )
    })

    it('delete: logistica apaga o proprio arquivo', async () => {
      const { deleteObject } = await import('firebase/storage')
      await seedObject('processes/p1/documents/containerWash/CNT-3/1-log-1-lavacao.pdf')
      await assertSucceeds(
        deleteObject(
          ref(storageAs('log-1', 'log@sqquimica.com', 'logistica', 'Ativo'), 'processes/p1/documents/containerWash/CNT-3/1-log-1-lavacao.pdf')
        )
      )
    })
  })

  // S11 (J1): fotos de avaria por item da Conferencia do Relatorio de Carga. Leitura so' pela function
  // `downloadCargoConferencePhoto` (Admin SDK); so' a logistica envia JPEG < 3 MB com o proprio uid no nome.
  describe('cargo-conference (processes/{pid}/cargo-conference/{rowId}/{file}) - fotos de avaria', () => {
    const OWN = 'processes/p1/cargo-conference/r-1/1700000000000-log-1-photo1.jpg'
    const OWN_THUMB = 'processes/p1/cargo-conference/r-1/1700000000000-log-1-photo1-t.jpg'
    const LOG = ['log-1', 'log@sqquimica.com', 'logistica', 'Ativo']

    const uploadPhoto = (who, path, { contentType = 'image/jpeg', bytes = 8, metadata } = {}) =>
      uploadBytes(
        ref(storageAs(...who), path),
        new Blob([new Uint8Array(bytes)], { type: contentType }),
        { contentType, ...(metadata ? { customMetadata: metadata } : {}) }
      )

    it('logistica sobe JPEG proprio < 3 MB (foto e miniatura)', async () => {
      await assertSucceeds(uploadPhoto(LOG, OWN))
      await assertSucceeds(uploadPhoto(LOG, OWN_THUMB))
    })

    it('rowId com 64 caracteres passa; com 65 falha', async () => {
      await assertSucceeds(uploadPhoto(LOG, `processes/p1/cargo-conference/${'a'.repeat(64)}/1-log-1-p.jpg`))
      await assertFails(uploadPhoto(LOG, `processes/p1/cargo-conference/${'a'.repeat(65)}/1-log-1-p.jpg`))
    })

    // Guardas do rowId (isSafeFileName + so' pontos): cada caso e' barrado pelas rules, nao pelo SDK.
    it.each([
      ['espaco', 'a b'],
      ['acento', 'ça'],
      ['dois pontos', '..'],
      ['um ponto', '.'],
      ['ponto no meio', 'a.b/c'],
      ['barra codificada', 'a%2Fb'],
      ['ponto codificado', '%2e%2e'],
      ['vazio', ''],
    ])('rowId invalido (%s) falha', async (_label, rowId) => {
      await assertFails(uploadPhoto(LOG, `processes/p1/cargo-conference/${rowId}/1-log-1-p.jpg`))
    })

    it('PNG falha (o app sempre recodifica em JPEG)', async () => {
      await assertFails(uploadPhoto(LOG, 'processes/p1/cargo-conference/r-1/1-log-1-png.jpg', { contentType: 'image/png' }))
    })

    it('arquivo que nao e imagem falha', async () => {
      await assertFails(
        uploadPhoto(LOG, 'processes/p1/cargo-conference/r-1/1-log-1-doc.jpg', { contentType: 'application/pdf' })
      )
    })

    it('3 MB falha; logo abaixo de 3 MB passa', async () => {
      await assertFails(uploadPhoto(LOG, 'processes/p1/cargo-conference/r-1/1-log-1-big.jpg', { bytes: 3 * 1024 * 1024 }))
      await assertSucceeds(
        uploadPhoto(LOG, 'processes/p1/cargo-conference/r-1/1-log-1-ok.jpg', { bytes: 3 * 1024 * 1024 - 1 })
      )
    })

    it('nome com o uid de outro falha', async () => {
      await assertFails(uploadPhoto(LOG, 'processes/p1/cargo-conference/r-1/1700000000000-admin-1-photo1.jpg'))
    })

    it('nome fora do formato {ts}-{uid}-{id} falha', async () => {
      await assertFails(uploadPhoto(LOG, 'processes/p1/cargo-conference/r-1/foto.jpg'))
    })

    it('metadata customizada falha', async () => {
      await assertFails(uploadPhoto(LOG, 'processes/p1/cargo-conference/r-1/1-log-1-meta.jpg', { metadata: { a: 'b' } }))
    })

    it.each([
      ['admin', ['admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'], '1-admin-1-a.jpg'],
      ['tecnico', ['tec-1', 'tec@sqquimica.com', 'tecnico', 'Ativo'], '1-tec-1-a.jpg'],
      ['faturamento', ['fat-1', 'fat@sqquimica.com', 'faturamento', 'Ativo'], '1-fat-1-a.jpg'],
      ['usuario comum', ['user-1', 'user@sqquimica.com', 'user', 'Ativo'], '1-user-1-a.jpg'],
      ['logistica pendente', ['log-1', 'log@sqquimica.com', 'logistica', 'Pendente'], '1-log-1-a.jpg'],
      ['logistica com e-mail externo', ['log-1', 'log@gmail.com', 'logistica', 'Ativo'], '1-log-1-a.jpg'],
    ])('%s NAO sobe', async (_label, who, fileName) => {
      await assertFails(uploadPhoto(who, `processes/p1/cargo-conference/r-1/${fileName}`))
    })

    it('anonimo NAO sobe', async () => {
      await assertFails(
        uploadBytes(ref(anonStorage(), OWN), new Blob(['x'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
      )
    })

    it('sobrescrever (update) falha', async () => {
      // Caminho proprio do teste: o emulador nao limpa o Storage entre os testes e esta pasta nao aceita reenvio.
      const path = 'processes/p1/cargo-conference/r-1/1700000000001-log-1-overwrite.jpg'
      await assertSucceeds(uploadPhoto(LOG, path))
      await assertFails(uploadPhoto(LOG, path))
    })

    it('NINGUEM le via SDK cliente (a leitura e so pela function)', async () => {
      await seedObject(OWN)
      for (const who of [
        LOG,
        ['admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'],
        ['tec-1', 'tec@sqquimica.com', 'tecnico', 'Ativo'],
        ['user-1', 'user@sqquimica.com', 'user', 'Ativo'],
      ]) {
        await assertFails(getMetadata(ref(storageAs(...who), OWN)))
      }
      await assertFails(getMetadata(ref(anonStorage(), OWN)))
    })

    it('delete: logistica apaga o proprio envio', async () => {
      const { deleteObject } = await import('firebase/storage')
      await seedObject(OWN)
      await assertSucceeds(deleteObject(ref(storageAs(...LOG), OWN)))
    })

    it('delete: logistica NAO apaga o envio de outro uid', async () => {
      const { deleteObject } = await import('firebase/storage')
      const other = 'processes/p1/cargo-conference/r-1/1700000000000-admin-1-photo2.jpg'
      await seedObject(other)
      await assertFails(deleteObject(ref(storageAs(...LOG), other)))
    })

    it('delete: admin e tecnico nao apagam (a limpeza e do trigger com Admin SDK)', async () => {
      const { deleteObject } = await import('firebase/storage')
      await seedObject(OWN)
      await assertFails(deleteObject(ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), OWN)))
      await assertFails(deleteObject(ref(storageAs('tec-1', 'tec@sqquimica.com', 'tecnico', 'Ativo'), OWN)))
    })
  })

  describe('supportTickets ({uid}/{file}) — aba de suporte (backlog 2026-07-10)', () => {
    const uploadTo = (uid, email, role, status, path, contentType = 'image/png') =>
      uploadBytes(
        ref(storageAs(uid, email, role, status), path),
        new Blob(['print'], { type: contentType }),
        { contentType }
      )

    it('usuario aprovado sobe print na PROPRIA pasta', async () => {
      await assertSucceeds(
        uploadTo('user-1', 'user@sqquimica.com', 'user', 'Ativo', 'supportTickets/user-1/print.png')
      )
    })

    it('usuario NAO sobe print na pasta de outro uid', async () => {
      await assertFails(
        uploadTo('user-1', 'user@sqquimica.com', 'user', 'Ativo', 'supportTickets/outro/print.png')
      )
    })

    it('mime fora da whitelist de imagem FALHA (pdf)', async () => {
      await assertFails(
        uploadTo(
          'user-1',
          'user@sqquimica.com',
          'user',
          'Ativo',
          'supportTickets/user-1/doc.pdf',
          'application/pdf'
        )
      )
    })

    it('usuario Pendente NAO sobe print', async () => {
      await assertFails(
        uploadTo('pend-1', 'pend@sqquimica.com', 'user', 'Pendente', 'supportTickets/pend-1/print.png')
      )
    })

    it('anonimo NAO sobe print', async () => {
      await assertFails(
        uploadBytes(
          ref(anonStorage(), 'supportTickets/anon/print.png'),
          new Blob(['x'], { type: 'image/png' }),
          { contentType: 'image/png' }
        )
      )
    })

    it('leitura: qualquer usuario aprovado le (admin ve anexos na triagem)', async () => {
      await seedObject('supportTickets/user-1/print.png')
      await assertSucceeds(
        getMetadata(ref(storageAs('admin-1', 'admin@sqquimica.com', 'admin', 'Ativo'), 'supportTickets/user-1/print.png'))
      )
    })
  })
})
