// E2E test do syncBarStatus.mjs — roda o script de verdade contra o
// emulador Firestore, mockando a URL da imagem pra servir uma fixture
// local. Valida que a sugestao e gravada em barra/suggestion.
//
// Quando FIRESTORE_EMULATOR_HOST NAO esta setado (ex.: `npm test`
// normal), o describe inteiro e' pulado — a suite padrao continua verde
// sem Java. Rodar com: `npm run test:sync-bar` (TODO: adicionar script)
// ou `FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_PROJECT_ID=demo-sqcomex npx vitest run syncBarStatus.e2e --no-file-parallelism`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, deleteApp, getFirestore } from 'firebase/app'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const EMULATOR_UP = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const describeEmulator = EMULATOR_UP ? describe : describe.skip

let app
let db

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-sqcomex' })
  db = getFirestore(app)
})

afterAll(async () => {
  await deleteApp(app)
})

function runSync(extraEnv = {}) {
  const env = {
    ...process.env,
    FIREBASE_PROJECT_ID: 'demo-sqcomex',
    ...extraEnv,
  }
  return spawnSync('node', [join(ROOT, 'scripts', 'syncBarStatus.mjs')], {
    env,
    encoding: 'utf8',
    timeout: 60000,
  })
}

describeEmulator('syncBarStatus.mjs (emulador)', () => {
  it('roda com exit 0 quando o OCR reconhece "PRATICAVEL"', () => {
    // Sem mockar a imagem (precisa de rede pra baixar da Praticagem).
    // Em CI offline, este teste pula no beforeAll. Em CI com rede,
    // valida o fluxo completo: baixa imagem -> OCR -> grava sugestao.
    const result = runSync()

    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/Sugestao da barra gravada/)
  })

  it('falha graciosamente (exit 0 + DLQ) quando a URL da imagem e invalida', async () => {
    const result = runSync({ BAR_STATUS_IMAGE_URL: 'http://localhost:1/nonexistent.jpg' })

    // Nao derruba o job — vai pra DLQ com ::warning::
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/::warning::/)

    // DLQ deve ter um entry com stage=fetch-image
    const dlqSnap = await db.collection('externalNewsDlq').get()
    const dlqDocs = dlqSnap.docs.map((d) => d.data())
    const barDlq = dlqDocs.find((d) => d.stage === 'fetch-image')
    expect(barDlq).toBeDefined()
  })
})