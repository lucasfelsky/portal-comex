// E2E REAL do scripts/syncBarStatus.mjs: roda o script de verdade (child_process)
// contra o emulador Firestore, com a "home da praticagem" servida por um HTTP
// server local (fixtures em tests/fixtures/barra). Cobre: leitura do cond_barra,
// aplicacao edge-triggered em barra/current (preservando notes), evento em audits,
// override manual respeitado, e falhas (HTTP 500 / sem cond_barra) -> DLQ + campos
// de saude na suggestion, sem tocar barra/current.
//
// Como rodar (precisa de JDK 11+):
//   npm run test:sync-bar
// que sobe o emulador Firestore (via scripts/with-jdk.mjs) e roda este arquivo.
//
// Quando FIRESTORE_EMULATOR_HOST NAO esta setado (ex.: `npm test` normal), o
// describe inteiro e' pulado — a suite padrao continua verde sem Java.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = join(HERE, '..', '..', 'scripts', 'syncBarStatus.mjs')
const FIXTURES_DIR = join(HERE, '..', 'fixtures', 'barra')
const PROJECT_ID = 'demo-sqcomex'

const EMULATOR_UP = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const describeEmulator = EMULATOR_UP ? describe : describe.skip

const SYNC_TIMEOUT_MS = 60_000

const HTML_IMPRATICAVEL = fs.readFileSync(
  join(FIXTURES_DIR, 'zp21-home-impraticavel-2024-12-09.html'),
  'utf8'
)
const HTML_PRATICAVEL = fs.readFileSync(join(FIXTURES_DIR, 'zp21-home-praticavel-2026-10-19.html'), 'utf8')

describeEmulator('syncBarStatus.mjs (emulador)', () => {
  let app
  let db
  let server
  let baseUrl
  // O que o "site da praticagem" responde: 'impraticavel' | 'praticavel' | 'http500' | 'semdados'
  let mode = 'impraticavel'
  let lastSuccessAtStep3

  // spawn assincrono (NAO spawnSync): o server mock vive NESTE processo.
  function runSync() {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT_PATH], {
        env: {
          ...process.env,
          FIREBASE_PROJECT_ID: PROJECT_ID,
          BAR_STATUS_PAGE_URL: `${baseUrl}/`,
        },
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`sync nao terminou no prazo\nstdout: ${stdout}\nstderr: ${stderr}`))
      }, SYNC_TIMEOUT_MS - 5_000)
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (status) => {
        clearTimeout(timer)
        resolve({ status, stdout, stderr })
      })
    })
  }

  async function clearCollection(name) {
    const snapshot = await db.collection(name).get()
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()))
  }

  async function readData(path) {
    const snapshot = await db.doc(path).get()
    return snapshot.exists ? snapshot.data() : null
  }

  beforeAll(async () => {
    app = initializeApp({ projectId: PROJECT_ID }, 'sync-bar-status-e2e')
    db = getFirestore(app)

    server = http.createServer((req, res) => {
      if (mode === 'http500') {
        res.writeHead(500)
        res.end('erro proposital')
      } else if (mode === 'semdados') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html>sem dados</html>')
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(mode === 'impraticavel' ? HTML_IMPRATICAVEL : HTML_PRATICAVEL)
      }
    })
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    // Estado limpo (o emulador e' compartilhado com --no-file-parallelism).
    await db.doc('barra/current').delete()
    await db.doc('barra/suggestion').delete()
    await clearCollection('audits')
    await clearCollection('externalNewsDlq')
  }, SYNC_TIMEOUT_MS)

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (app) await deleteApp(app)
  })

  it(
    '1) site muda (impraticável) com current diferente: aplica, preserva notes, grava audit e saúde',
    async () => {
      const seedUpdatedAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'))
      await db.doc('barra/current').set({
        status: 'PRATICAVEL',
        notes: 'Nota do admin',
        updatedAt: seedUpdatedAt,
      })
      await db.doc('barra/suggestion').set({
        status: 'PRATICAVEL',
        rawOcrText: 'x',
        fetchedAt: '2026-01-01T00:00:00.000Z',
      })
      mode = 'impraticavel'

      const run = await runSync()
      expect(run.status).toBe(0)
      expect(run.stdout).toContain('aplicado automaticamente')

      const current = await readData('barra/current')
      expect(current.status).toBe('IMPRATICAVEL')
      expect(current.notes).toBe('Nota do admin')
      expect(typeof current.updatedAt.toDate).toBe('function')
      expect(current.updatedAt.toMillis()).toBeGreaterThan(seedUpdatedAt.toMillis())
      expect(Object.keys(current).sort()).toEqual(['notes', 'status', 'updatedAt'])

      const suggestion = await readData('barra/suggestion')
      expect(suggestion.siteStatus).toBe('IMPRATICAVEL')
      expect(suggestion.siteCode).toBe('2')
      expect(suggestion.restriction).toBe('Correnteza')
      expect(suggestion.lastError).toBe('')
      expect(typeof suggestion.lastSuccessAt.toDate).toBe('function')
      expect(suggestion.lastAppliedAt).toBeDefined()
      expect('rawOcrText' in suggestion).toBe(false)

      const audits = await db.collection('audits').get()
      expect(audits.size).toBe(1)
      const audit = audits.docs[0].data()
      expect(audit.actor).toBe('Praticagem ZP21 (automático)')
      expect(audit.target).toBe('IMPRATICAVEL')
      expect(typeof audit.createdAt.toDate).toBe('function')
    },
    SYNC_TIMEOUT_MS
  )

  it(
    '2) override manual do admin é respeitado enquanto o site não muda',
    async () => {
      await db.doc('barra/current').update({ status: 'PRATICAVEL_RESTRICOES' })
      mode = 'impraticavel'

      const run = await runSync()
      expect(run.status).toBe(0)
      expect(run.stdout).toContain('sem mudança no site')

      const current = await readData('barra/current')
      expect(current.status).toBe('PRATICAVEL_RESTRICOES')
      const audits = await db.collection('audits').get()
      expect(audits.size).toBe(1)
    },
    SYNC_TIMEOUT_MS
  )

  it(
    '3) site muda para praticável: aplica de novo, notes preservado, 2 audits',
    async () => {
      mode = 'praticavel'

      const run = await runSync()
      expect(run.status).toBe(0)

      const current = await readData('barra/current')
      expect(current.status).toBe('PRATICAVEL')
      expect(current.notes).toBe('Nota do admin')
      const audits = await db.collection('audits').get()
      expect(audits.size).toBe(2)

      const suggestion = await readData('barra/suggestion')
      lastSuccessAtStep3 = suggestion.lastSuccessAt.toMillis()
    },
    SYNC_TIMEOUT_MS
  )

  it(
    '4) site responde 500: exit 0 + ::warning::, DLQ fetch-page, saúde da suggestion, current intacto',
    async () => {
      mode = 'http500'

      const run = await runSync()
      expect(run.status).toBe(0)
      expect(run.stdout).toContain('::warning::')

      const suggestion = await readData('barra/suggestion')
      expect(suggestion.siteStatus).toBe('PRATICAVEL')
      expect(suggestion.lastSuccessAt.toMillis()).toBe(lastSuccessAtStep3)
      expect(suggestion.lastError).not.toBe('')
      expect(suggestion.lastErrorStage).toBe('fetch-page')
      expect(suggestion.lastAttemptAt.toMillis()).toBeGreaterThan(suggestion.lastSuccessAt.toMillis())

      const current = await readData('barra/current')
      expect(current.status).toBe('PRATICAVEL')

      const dlq = await db.collection('externalNewsDlq').get()
      const stages = dlq.docs.map((doc) => doc.data().stage)
      expect(stages).toContain('fetch-page')
    },
    SYNC_TIMEOUT_MS
  )

  it(
    '5) site sem cond_barra: parse-status na suggestion e na DLQ, current intacto',
    async () => {
      mode = 'semdados'

      const run = await runSync()
      expect(run.status).toBe(0)

      const suggestion = await readData('barra/suggestion')
      expect(suggestion.lastErrorStage).toBe('parse-status')
      expect(suggestion.siteStatus).toBe('PRATICAVEL')

      const current = await readData('barra/current')
      expect(current.status).toBe('PRATICAVEL')

      const dlq = await db.collection('externalNewsDlq').get()
      const stages = dlq.docs.map((doc) => doc.data().stage)
      expect(stages).toContain('parse-status')
    },
    SYNC_TIMEOUT_MS
  )

  it(
    '6) site volta ao normal (sem mudança): limpa o erro, current intacto, audits ainda 2',
    async () => {
      mode = 'praticavel'

      const run = await runSync()
      expect(run.status).toBe(0)

      const suggestion = await readData('barra/suggestion')
      expect(suggestion.lastError).toBe('')
      expect(suggestion.lastErrorStage).toBe('')

      const current = await readData('barra/current')
      expect(current.status).toBe('PRATICAVEL')
      const audits = await db.collection('audits').get()
      expect(audits.size).toBe(2)
    },
    SYNC_TIMEOUT_MS
  )
})
