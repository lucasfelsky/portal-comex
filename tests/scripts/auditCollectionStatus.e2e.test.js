// Teste E2E REAL do scripts/auditCollectionStatus.mjs: roda o script de
// verdade (child_process) contra o emulador Firestore com processos seedados.
//
// Como rodar (precisa de JDK 11+):
//   npm run test:audit-status
//
// Quando FIRESTORE_EMULATOR_HOST NAO esta setado (ex.: `npm test` normal), o
// describe inteiro e' pulado — a suite padrao continua verde sem Java.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = join(HERE, '..', '..', 'scripts', 'auditCollectionStatus.mjs')
const PROJECT_ID = 'demo-sqcomex'

const EMULATOR_UP = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const describeEmulator = EMULATOR_UP ? describe : describe.skip

const RUN_TIMEOUT_MS = 30_000

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function isoHoursAhead(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function runAudit(extraArgs = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...extraArgs], {
      env: {
        ...process.env,
        FIREBASE_PROJECT_ID: PROJECT_ID,
        ...extraEnv,
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`audit nao terminou\nstdout: ${stdout}\nstderr: ${stderr}`))
    }, RUN_TIMEOUT_MS - 5_000)
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

describeEmulator('auditCollectionStatus.mjs (emulador)', () => {
  let app
  let db

  beforeAll(async () => {
    app = initializeApp({ projectId: PROJECT_ID }, 'audit-collection-status-e2e')
    db = getFirestore(app)

    // Inconsistente: Coleta Agendada com TODAS as janelas vencidas (2 janelas).
    await db.collection('processes').doc('proc-vencido').set({
      name: 'Processo Vencido',
      processNumber: 'PC-001',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [
        { id: 'w1', containerNumber: 1, scheduledAt: isoHoursAgo(72), notes: '' },
        { id: 'w2', containerNumber: 2, scheduledAt: isoHoursAgo(48), notes: '' },
      ],
    })

    // Legitimo: Coleta Agendada com pelo menos 1 janela FUTURA.
    await db.collection('processes').doc('proc-futuro').set({
      name: 'Processo Futuro',
      processNumber: 'PC-002',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [
        { id: 'w1', containerNumber: 1, scheduledAt: isoHoursAgo(48), notes: '' },
        { id: 'w2', containerNumber: 2, scheduledAt: isoHoursAhead(24), notes: '' },
      ],
    })

    // Inconsistente (schema LEGADO): collectionScheduledAt vencido, sem windows.
    await db.collection('processes').doc('proc-legado').set({
      name: 'Processo Legado',
      processNumber: 'PC-003',
      collectionStatus: 'Coleta Agendada',
      collectionScheduledAt: isoHoursAgo(100),
    })

    // Fora do escopo: janela vencida mas status ja' avancou.
    await db.collection('processes').doc('proc-coletado').set({
      name: 'Processo Coletado',
      processNumber: 'PC-004',
      collectionStatus: 'Em transferencia para Itajai',
      collectionWindows: [
        { id: 'w1', containerNumber: 1, scheduledAt: isoHoursAgo(72), notes: '' },
      ],
    })

    // Dentro da tolerancia: vencida ha' 2h com grace default de 12h.
    await db.collection('processes').doc('proc-recente').set({
      name: 'Processo Recente',
      processNumber: 'PC-005',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [
        { id: 'w1', containerNumber: 1, scheduledAt: isoHoursAgo(2), notes: '' },
      ],
    })

    // Sem janela nenhuma: aguardando agendamento (nao entra).
    await db.collection('processes').doc('proc-sem-janela').set({
      name: 'Processo Sem Janela',
      processNumber: 'PC-006',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [],
    })
  }, RUN_TIMEOUT_MS)

  afterAll(async () => {
    if (app) await deleteApp(app)
  })

  it(
    'lista so os inconsistentes (todas as janelas vencidas), cobrindo schema novo e legado',
    async () => {
      const result = await runAudit()

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('6 processos lidos')

      // Inconsistentes aparecem.
      expect(result.stdout).toContain('proc-vencido')
      expect(result.stdout).toContain('PC-001')
      expect(result.stdout).toContain('proc-legado')

      // Legitimos ficam fora.
      expect(result.stdout).not.toContain('proc-futuro')
      expect(result.stdout).not.toContain('proc-coletado')
      expect(result.stdout).not.toContain('proc-sem-janela')

      // Vencida ha' 2h esta dentro da tolerancia default (12h).
      expect(result.stdout).not.toContain('proc-recente')

      expect(result.stdout).toContain('2 processo(s)')
    },
    RUN_TIMEOUT_MS
  )

  it('AUDIT_GRACE_HOURS=0 derruba a tolerancia e pega a janela recem-vencida', async () => {
    const result = await runAudit([], { AUDIT_GRACE_HOURS: '0' })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('proc-recente')
    expect(result.stdout).toContain('3 processo(s)')
  }, RUN_TIMEOUT_MS)

  it('--fail-on-findings sai com exit 2 quando ha inconsistencia', async () => {
    const result = await runAudit(['--fail-on-findings'])

    expect(result.status).toBe(2)
  }, RUN_TIMEOUT_MS)
})
