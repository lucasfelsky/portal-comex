// Auditoria de dados: processos com collectionStatus inconsistente.
//
// Detecta processos onde `collectionStatus` ainda e' "Coleta Agendada" mas
// TODAS as janelas de coleta ja' venceram (scheduledAt < now). Nesses casos a
// coleta (provavelmente) ja' aconteceu e a logistica esqueceu de avancar o
// status — precisa de intervencao manual. Origem: incidente de 2026-07-08
// (bugs de schema legado vs collectionWindows) + backlog L21/L22.
//
// Uso:
//   node scripts/auditCollectionStatus.mjs                  # relatorio, exit 0
//   node scripts/auditCollectionStatus.mjs --fail-on-findings  # exit 2 se achar algo (pra cron/CI)
//
// Env:
//   AUDIT_GRACE_HOURS  janela de tolerancia em horas apos o scheduledAt antes
//                      de considerar vencida (default 12 — coleta marcada pra
//                      manha' de hoje ainda pode estar em andamento a' tarde).
//
// Producao (GitHub Actions / manual): exige FIREBASE_PROJECT_ID +
// FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (mesma service account do
// syncExternalNews; leitura via REST).
// Emulador (testes E2E): com FIRESTORE_EMULATOR_HOST setado, le do emulador
// com Bearer "owner" — so' FIREBASE_PROJECT_ID e' obrigatoria.

import crypto from 'node:crypto'

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL

function normalizePrivateKey(value) {
  if (!value) return ''

  return String(value)
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
}

const FIREBASE_PRIVATE_KEY = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)

const FIRESTORE_EMULATOR_HOST = String(process.env.FIRESTORE_EMULATOR_HOST ?? '').trim()
const FIRESTORE_REST_BASE = FIRESTORE_EMULATOR_HOST
  ? `http://${FIRESTORE_EMULATOR_HOST}/v1`
  : 'https://firestore.googleapis.com/v1'

const GRACE_HOURS = Number.isFinite(Number(process.env.AUDIT_GRACE_HOURS))
  ? Number(process.env.AUDIT_GRACE_HOURS)
  : 12

const FAIL_ON_FINDINGS = process.argv.includes('--fail-on-findings')

// Mesmo vocabulario da rule isPreCollectionStatus / do app.
const SCHEDULED_STATUS = 'Coleta Agendada'

function ensureEnvironment() {
  if (FIRESTORE_EMULATOR_HOST) {
    if (!FIREBASE_PROJECT_ID) {
      throw new Error('Variaveis ausentes: FIREBASE_PROJECT_ID (obrigatoria mesmo no emulador).')
    }
    return
  }

  const missingVariables = [
    !FIREBASE_PROJECT_ID && 'FIREBASE_PROJECT_ID',
    !FIREBASE_CLIENT_EMAIL && 'FIREBASE_CLIENT_EMAIL',
    !FIREBASE_PRIVATE_KEY && 'FIREBASE_PRIVATE_KEY',
  ].filter(Boolean)

  if (missingVariables.length > 0) {
    throw new Error(`Variaveis ausentes: ${missingVariables.join(', ')}`)
  }
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getAccessToken() {
  if (FIRESTORE_EMULATOR_HOST) {
    return 'owner'
  }

  const nowInSeconds = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowInSeconds,
    exp: nowInSeconds + 3600,
  }

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(FIREBASE_PRIVATE_KEY, 'base64url')
  const assertion = `${unsignedToken}.${signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw new Error('Falha ao obter token OAuth para ler processos.')
  }

  const payloadResponse = await response.json()
  return payloadResponse.access_token
}

// Decodifica um valor tipado do Firestore REST pro equivalente JS.
function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('nullValue' in value) return null
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map((item) => fromFirestoreValue(item))
  }
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, fromFirestoreValue(item)])
    )
  }
  return null
}

function fromFirestoreDocument(document) {
  const id = String(document.name ?? '').split('/').pop()
  const data = Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [key, fromFirestoreValue(value)])
  )
  return { id, ...data }
}

async function listAllProcesses(accessToken) {
  const processes = []
  let pageToken = ''

  do {
    const url = new URL(
      `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/processes`
    )
    url.searchParams.set('pageSize', '300')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const errorPayload = await response.text()
      throw new Error(`Falha ao listar processes: ${errorPayload}`)
    }

    const payload = await response.json()
    for (const document of payload.documents ?? []) {
      processes.push(fromFirestoreDocument(document))
    }
    pageToken = payload.nextPageToken ?? ''
  } while (pageToken)

  return processes
}

// Mesma semantica de src/utils/collectionWindows.js#getCollectionWindows:
// prioriza o schema novo (array collectionWindows) e cai pro legado
// (string collectionScheduledAt) quando o array esta vazio/ausente.
function getScheduledDates(process) {
  const windows = Array.isArray(process.collectionWindows) ? process.collectionWindows : []
  const fromWindows = windows
    .map((window) => (window && typeof window === 'object' ? String(window.scheduledAt ?? '').trim() : ''))
    .filter(Boolean)

  if (fromWindows.length > 0) return fromWindows

  const legacy = String(process.collectionScheduledAt ?? '').trim()
  return legacy ? [legacy] : []
}

function findInconsistencies(processes, now = new Date()) {
  const cutoff = now.getTime() - GRACE_HOURS * 60 * 60 * 1000
  const findings = []

  for (const process of processes) {
    if (String(process.collectionStatus ?? '').trim() !== SCHEDULED_STATUS) continue

    const scheduledDates = getScheduledDates(process)
    if (scheduledDates.length === 0) continue

    const parsed = scheduledDates
      .map((value) => ({ value, time: new Date(value).getTime() }))
      .filter((item) => !Number.isNaN(item.time))
    if (parsed.length === 0) continue

    // Inconsistente = TODAS as janelas vencidas (com a tolerancia). Se ainda
    // existe janela futura, o status "Coleta Agendada" continua legitimo.
    const allOverdue = parsed.every((item) => item.time < cutoff)
    if (!allOverdue) continue

    const latest = parsed.reduce((left, right) => (left.time >= right.time ? left : right))
    findings.push({
      id: process.id,
      processNumber: process.processNumber ?? '',
      name: process.name ?? '',
      lastScheduledAt: latest.value,
      overdueDays: Math.floor((now.getTime() - latest.time) / (24 * 60 * 60 * 1000)),
      windowCount: parsed.length,
    })
  }

  return findings.sort((left, right) => right.overdueDays - left.overdueDays)
}

async function main() {
  ensureEnvironment()

  const accessToken = await getAccessToken()
  const processes = await listAllProcesses(accessToken)
  const findings = findInconsistencies(processes)

  console.log(`Auditoria de collectionStatus: ${processes.length} processos lidos (tolerancia ${GRACE_HOURS}h).`)

  if (findings.length === 0) {
    console.log('Nenhuma inconsistencia: nenhum processo "Coleta Agendada" com todas as janelas vencidas.')
    return
  }

  console.log(`\n${findings.length} processo(s) com "${SCHEDULED_STATUS}" e todas as janelas vencidas:\n`)
  for (const finding of findings) {
    const label = [finding.processNumber, finding.name].filter(Boolean).join(' — ') || '(sem identificacao)'
    console.log(
      `- ${finding.id}: ${label} | ultima janela ${finding.lastScheduledAt} ` +
      `(${finding.overdueDays} dia(s) atras, ${finding.windowCount} janela(s))`
    )
  }
  console.log('\nAcao: confirmar com a logistica e avancar o collectionStatus manualmente no app.')

  if (FAIL_ON_FINDINGS) {
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error(`Auditoria falhou: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
