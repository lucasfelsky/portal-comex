// F17.1a: migracao do `processStatus` legado pro derivado
// (deriveProcessStatus). So recalcula `processStatus` (+ `cargoReceivedAt`
// quando entra em "Carga recebida" sem data). Estrutura pensada pra crescer:
// `MIGRATION_STEPS` tem hoje 1 passo ativo (`recalcProcessStatus`) - mapa,
// `berthedAt`, `containers[]` entram como passos novos no F17.2/F17.3.
//
// Uso:
//   node scripts/migrateOperationalV2.mjs          # dry-run (default), le e imprime, nao escreve
//   node scripts/migrateOperationalV2.mjs --apply  # escreve (so os campos propostos)
//   node scripts/migrateOperationalV2.mjs --help   # uso, exit 0, SEM exigir env
//
// Env (mesma service account de scripts/auditCollectionStatus.mjs):
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//   ou FIRESTORE_EMULATOR_HOST (+ FIREBASE_PROJECT_ID) pro emulador.
//
// ZONA VERMELHA: `--apply` escreve em producao. NAO rodar aqui - e' do Lucas,
// depois de ler o relatorio do dry-run. Ver PLAN.md secao "Deploy".

import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { deriveProcessStatus, resolveCargoReceivedAt } from '../src/features/processes/deriveProcessStatus.js'
import { getProcessStage } from '../src/features/processes/processStage.js'

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

const MIGRATION_ACTOR_NAME = 'Migração F17.1'

function printHelp() {
  console.log(`
Uso: node scripts/migrateOperationalV2.mjs [--apply] [--help]

  (sem flags)  dry-run - le todos os processos, imprime o plano, nao escreve.
  --apply      aplica as escritas propostas (ZONA VERMELHA - so' apos o Lucas
               ler o relatorio do dry-run).
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

function hasValue(value) {
  return String(value ?? '').trim() !== ''
}

/**
 * F17.1a (D-B) + AD-2: plano puro de migracao (sem I/O), testavel isolado.
 * Um passo por processo: 'legacy-received' (a), 'needs-review' (AD-2, nao
 * rebaixa etapa), 'recalc' (b) ou 'unchanged' (c).
 */
export function planProcessStatusMigration(processes, { nowIso } = {}) {
  const now = nowIso || new Date().toISOString()

  return (Array.isArray(processes) ? processes : []).map((process) => {
    const gravado = String(process?.processStatus ?? '').trim()
    const derived = deriveProcessStatus(process)

    const base = {
      id: process?.id ?? '',
      category: process?.category ?? '',
      before: gravado,
      after: derived,
    }

    // (a) gravado 'Carga recebida' e derivado diferente: NAO rebaixa. Propoe
    // o efeito que o atalho antigo do admin teria gravado (promove pra
    // estoque; o sanitize preserva via shouldPreserveStockCollectionStatus).
    if (gravado === 'Carga recebida' && derived !== 'Carga recebida') {
      return {
        ...base,
        after: gravado,
        type: 'legacy-received',
        reason: 'legacy-received',
        changes: {
          collectionStatus: 'Carga disponível em estoque',
          updatedById: '',
          updatedByName: MIGRATION_ACTOR_NAME,
        },
      }
    }

    if (derived === gravado) {
      return { ...base, type: 'unchanged', reason: 'unchanged', changes: null }
    }

    // AD-2: a migracao nunca rebaixa etapa (ex.: canal Amarelo sem
    // clearanceCompletedAt derivaria pra tras do que o admin ja avancou
    // manualmente). Fica pra revisao humana.
    const derivedStage = getProcessStage({ processStatus: derived }).currentStage
    const gravadoStage = getProcessStage({ processStatus: gravado }).currentStage
    if (derivedStage < gravadoStage) {
      return {
        ...base,
        type: 'needs-review',
        reason: `etapa derivada (${derived}) e anterior a gravada (${gravado}) - provavel dado faltante (ex.: clearanceCompletedAt)`,
        changes: null,
      }
    }

    const changes = {
      processStatus: derived,
      updatedById: '',
      updatedByName: MIGRATION_ACTOR_NAME,
    }
    if (derived === 'Carga recebida' && !hasValue(process?.cargoReceivedAt)) {
      changes.cargoReceivedAt = resolveCargoReceivedAt(derived, process?.cargoReceivedAt, now)
    }

    return { ...base, type: 'recalc', reason: 'recalc', changes }
  })
}

function toFirestoreFieldValue(value) {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return { doubleValue: value }
  return { nullValue: null }
}

async function applyStep(accessToken, step) {
  const fields = Object.fromEntries(
    Object.entries(step.changes ?? {}).map(([key, value]) => [key, toFirestoreFieldValue(value)])
  )
  const updateMask = Object.keys(step.changes ?? {})
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&')

  const url =
    `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/processes/${step.id}` +
    `?${updateMask}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`Falha ao aplicar migracao em ${step.id}: ${errorPayload}`)
  }
}

function printReport(plan) {
  const byType = {
    'legacy-received': [],
    'needs-review': [],
    recalc: [],
    unchanged: [],
  }
  for (const step of plan) {
    ;(byType[step.type] ?? (byType[step.type] = [])).push(step)
  }

  console.log(`\nProcessos lidos: ${plan.length}`)
  console.log('id | categoria | antes | depois | motivo')
  for (const step of plan) {
    if (step.type === 'unchanged') continue
    console.log(`${step.id} | ${step.category} | ${step.before} | ${step.after} | ${step.reason}`)
  }

  console.log('\nTotais por tipo:')
  for (const [type, steps] of Object.entries(byType)) {
    console.log(`  ${type}: ${steps.length}`)
  }

  if (byType['needs-review'].length > 0) {
    console.log('\nPrecisam de revisao humana (nenhuma escrita proposta):')
    for (const step of byType['needs-review']) {
      console.log(`  - ${step.id}: ${step.reason}`)
    }
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
  const plan = planProcessStatusMigration(processes)

  printReport(plan)

  if (!APPLY) {
    console.log('\nDry-run - nada foi escrito. Rode com --apply so' + " apos ler este relatorio.")
    return
  }

  const writable = plan.filter((step) => step.changes)
  console.log(`\nAplicando ${writable.length} escrita(s)...`)
  for (const step of writable) {
    await applyStep(accessToken, step)
  }
  console.log('Migracao aplicada.')
}

// Guard de execucao: so' roda quando o arquivo e' o entrypoint (permite o
// teste importar `planProcessStatusMigration` sem efeito colateral).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`Migracao falhou: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
}
