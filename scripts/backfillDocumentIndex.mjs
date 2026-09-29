// F18b-1 (B5): backfill do `documentIndex` (F18a -> F18b-1). O trigger
// `syncProcessDocumentIndex` so' recalcula quando um documento e' criado ou
// apagado - processos que ja tinham documentos ANTES do deploy do F18b-1
// ficam com `documentIndex` ausente ate' o proximo upload/exclusao naquele
// processo. Este script cobre a janela: le cada processo + a subcolecao
// `documents` inteira, e propoe (ou aplica) o `documentIndex` correto.
//
// Recalcula tambem `documentIndex.processSlotKeys` (slots BL/Relatorio de
// carga/Invoice/Packing List usados pela pendencia de embarque confirmado).
//
// Uso:
//   node scripts/backfillDocumentIndex.mjs          # dry-run (default), le e imprime, nao escreve
//   node scripts/backfillDocumentIndex.mjs --apply  # escreve (SO' o campo documentIndex)
//   node scripts/backfillDocumentIndex.mjs --help   # uso, exit 0, SEM exigir env
//
// Env (mesma service account de scripts/migrateOperationalV2.mjs):
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//   ou FIRESTORE_EMULATOR_HOST (+ FIREBASE_PROJECT_ID) pro emulador.
//
// ZONA VERMELHA: `--apply` escreve em producao. NAO rodar aqui (nem o
// dry-run - exige credencial) - e' do Lucas, depois de ler o relatorio do
// dry-run. Ver PLAN.md secao "Deploy F18b-1". Tem que rodar ANTES do
// deploy do F18b-2.

import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  buildDocumentIndex,
  isSameDocumentIndex,
  normalizeDocumentIndexMirror,
} from '../functions/src/process/documentIndex.js'

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

const APPLY = process.argv.includes('--apply')
const SHOW_HELP = process.argv.includes('--help')

function printHelp() {
  console.log(`
Uso: node scripts/backfillDocumentIndex.mjs [--apply] [--help]

  (sem flags)  dry-run - le todos os processos + a subcolecao "documents" de
               cada um, imprime o plano, nao escreve.
  --apply      aplica as escritas propostas (ZONA VERMELHA - so' apos o Lucas
               ler o relatorio do dry-run). Escreve SO' o campo
               "documentIndex" (o write dispara os triggers de processo, mas
               index-only nunca notifica nem gera marco - F18b-1 B1). Tambem grava
               "processSlotKeys" (slots BL/Relatorio de carga/Invoice/Packing List).
  --help       mostra este uso e sai (nao exige nenhuma env).

Env obrigatoria (dry-run/apply): FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL +
FIREBASE_PRIVATE_KEY (ou FIRESTORE_EMULATOR_HOST + FIREBASE_PROJECT_ID).
`)
}

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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw new Error('Falha ao obter token OAuth para ler/escrever processos.')
  }

  const payloadResponse = await response.json()
  return payloadResponse.access_token
}

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

// Paginado - le a subcolecao `processes/{processId}/documents` INTEIRA (o
// mesmo escopo que `syncProcessDocumentIndex` le em cada create/delete).
async function listProcessDocuments(accessToken, processId) {
  const documents = []
  let pageToken = ''

  do {
    const url = new URL(
      `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/processes/${processId}/documents`
    )
    url.searchParams.set('pageSize', '300')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (response.status === 404) return documents

    if (!response.ok) {
      const errorPayload = await response.text()
      throw new Error(`Falha ao listar documents de ${processId}: ${errorPayload}`)
    }

    const payload = await response.json()
    for (const document of payload.documents ?? []) {
      documents.push(fromFirestoreDocument(document))
    }
    pageToken = payload.nextPageToken ?? ''
  } while (pageToken)

  return documents
}

/**
 * F18b-1 (B5): plano puro (sem I/O) de backfill - 1 entrada por processo.
 * `documentsByProcessId` = `{ [processId]: doc[] }`. Processo sem documentos
 * e sem `documentIndex` previo fica `changed: false` (nada a fazer).
 */
export function planDocumentIndexBackfill(processes, documentsByProcessId = {}) {
  return (Array.isArray(processes) ? processes : []).map((process) => {
    const docs = documentsByProcessId?.[process?.id] ?? []
    const before = normalizeDocumentIndexMirror(process?.documentIndex)
    const after = buildDocumentIndex(docs)

    return {
      id: process?.id ?? '',
      before,
      after,
      changed: !isSameDocumentIndex(before, after),
    }
  })
}

function toStringArrayFieldValue(list) {
  if (!Array.isArray(list) || list.length === 0) return { arrayValue: {} }
  return { arrayValue: { values: list.map((value) => ({ stringValue: value })) } }
}

async function applyBackfillEntry(accessToken, entry) {
  const url =
    `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/processes/${entry.id}` +
    `?updateMask.fieldPaths=documentIndex&currentDocument.exists=true`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        documentIndex: {
          mapValue: {
            fields: {
              fispqItemIds: toStringArrayFieldValue(entry.after.fispqItemIds),
              containerWashIds: toStringArrayFieldValue(entry.after.containerWashIds),
              processSlotKeys: toStringArrayFieldValue(entry.after.processSlotKeys),
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`Falha ao aplicar backfill em ${entry.id}: ${errorPayload}`)
  }
}

function printReport(plan) {
  console.log(`\nProcessos lidos: ${plan.length}`)

  const changed = plan.filter((entry) => entry.changed)
  console.log(`Processos com documentIndex desatualizado: ${changed.length}`)

  for (const entry of changed) {
    console.log(
      `${entry.id} | atual: ${JSON.stringify(entry.before)} -> proposto: ${JSON.stringify(entry.after)}`
    )
  }
}

async function main() {
  if (SHOW_HELP) {
    printHelp()
    return
  }

  ensureEnvironment()

  const accessToken = await getAccessToken()
  const processes = await listAllProcesses(accessToken)

  const documentsByProcessId = {}
  for (const process of processes) {
    documentsByProcessId[process.id] = await listProcessDocuments(accessToken, process.id)
  }

  const plan = planDocumentIndexBackfill(processes, documentsByProcessId)
  printReport(plan)

  if (!APPLY) {
    console.log('\nDry-run - nada foi escrito. Rode com --apply so' + " apos ler este relatorio.")
    return
  }

  const writable = plan.filter((entry) => entry.changed)
  console.log(`\nAplicando ${writable.length} escrita(s)...`)
  for (const entry of writable) {
    await applyBackfillEntry(accessToken, entry)
  }
  console.log('Backfill aplicado.')
}

// Guard de execucao: so' roda quando o arquivo e' o entrypoint (permite o
// teste importar `planDocumentIndexBackfill` sem efeito colateral).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`Backfill falhou: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
}
