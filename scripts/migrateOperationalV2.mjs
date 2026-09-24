// F17.1a/F17.2b: migracao do `processStatus` legado pro derivado
// (deriveProcessStatus) + migracao de `mapaStatus` legado pro `licenses[]`
// multi-orgao (F17.2b D-11). `MIGRATION_STEPS` tem hoje 2 passos EM SEQUENCIA
// (`mapaToLicenses` primeiro - suas `changes` entram no doc antes do 2o passo
// recalcular `processStatus`) - `berthedAt`, `containers[]` ja migraram via
// F17.2a (nao precisaram de passo, so' de expansao lazy na leitura).
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
import { buildLegacyMapaLicense, mapLegacyMapaStatus } from '../src/features/processes/licenses.js'

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

export function fromFirestoreValue(value) {
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

const MAPA_MIGRATION_ACTOR_NAME = MIGRATION_ACTOR_NAME

function isMaritimeCategoryForMigration(category) {
  return category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO'
}

/**
 * F17.2b (D-11): plano puro (sem I/O) de migracao de `mapaStatus` legado pro
 * `licenses[]` multi-orgao. Reusa `buildLegacyMapaLicense`/`mapLegacyMapaStatus`
 * de `src/features/processes/licenses.js` (sem copia).
 */
export function planMapaToLicensesMigration(processes) {
  return (Array.isArray(processes) ? processes : []).map((doc) => {
    const category = doc?.category ?? ''
    const mapaStatus = String(doc?.mapaStatus ?? '').trim()
    const base = { id: doc?.id ?? '', category, before: mapaStatus, after: mapaStatus }

    if (Array.isArray(doc?.licenses)) {
      return { ...base, type: 'unchanged', reason: 'ja tem licenses[]', changes: null }
    }

    if (!mapaStatus) {
      return { ...base, type: 'unchanged', reason: 'mapaStatus vazio', changes: null }
    }

    if (!isMaritimeCategoryForMigration(category)) {
      return {
        ...base,
        type: 'skipped',
        reason: 'categoria nao maritima com mapaStatus preenchido (o app sempre limpou isso - nao migra)',
        changes: null,
      }
    }

    const { status, known } = mapLegacyMapaStatus(mapaStatus)
    if (!known) {
      return {
        ...base,
        type: 'needs-review',
        reason: `valor de mapaStatus fora do mapeamento conhecido: "${mapaStatus}"`,
        changes: null,
      }
    }

    return {
      ...base,
      after: status,
      type: 'mapa-to-licenses',
      reason: 'mapaStatus legado migrado pra licenses[]',
      changes: {
        licenses: [buildLegacyMapaLicense(doc)],
        updatedById: '',
        updatedByName: MAPA_MIGRATION_ACTOR_NAME,
      },
    }
  })
}

// F17.2b (D-11): passos EM SEQUENCIA - `mapaToLicenses` primeiro (suas
// `changes` entram no doc em memoria antes de `recalcProcessStatus` rodar
// `deriveProcessStatus`, que ja le `licenses[]` como fonte autoritativa).
export const MIGRATION_STEPS = [
  { id: 'mapaToLicenses', plan: planMapaToLicensesMigration },
  { id: 'recalcProcessStatus', plan: planProcessStatusMigration },
]

/**
 * F17.2b (D-11): roda `MIGRATION_STEPS` em sequencia sobre uma copia em
 * memoria de cada doc, juntando as `changes` de todos os passos num UNICO
 * PATCH por doc. Devolve `{ id, category, steps: [{ stepId, type, reason,
 * before, after }], changes }` - `changes: null` quando nenhum passo propos
 * escrita.
 */
export function planOperationalMigration(processes, { nowIso } = {}) {
  const sourceDocs = Array.isArray(processes) ? processes : []
  const workingDocs = sourceDocs.map((doc) => ({ ...doc }))
  const reports = workingDocs.map((doc) => ({
    id: doc?.id ?? '',
    category: doc?.category ?? '',
    steps: [],
    changes: {},
  }))

  for (const migrationStep of MIGRATION_STEPS) {
    const stepPlan = migrationStep.plan(workingDocs, { nowIso })

    stepPlan.forEach((stepResult, index) => {
      const report = reports[index]
      report.steps.push({
        stepId: migrationStep.id,
        type: stepResult.type,
        reason: stepResult.reason,
        before: stepResult.before,
        after: stepResult.after,
      })

      if (stepResult.changes) {
        Object.assign(report.changes, stepResult.changes)
        Object.assign(workingDocs[index], stepResult.changes)
      }
    })
  }

  return reports.map((report) => ({
    ...report,
    changes: Object.keys(report.changes).length > 0 ? report.changes : null,
  }))
}

export function toFirestoreFieldValue(value) {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return { doubleValue: value }
  if (value === null || value === undefined) return { nullValue: null }
  if (Array.isArray(value)) {
    if (value.length === 0) return { arrayValue: {} }
    return { arrayValue: { values: value.map((item) => toFirestoreFieldValue(item)) } }
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, toFirestoreFieldValue(item)])
        ),
      },
    }
  }
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

// F17.2b (D-11): `plan` agora vem de `planOperationalMigration` - 1 entrada
// por doc, com `steps` (1 por passo de `MIGRATION_STEPS`) + `changes`
// (PATCH unico, ou null).
function printReport(plan) {
  console.log(`\nProcessos lidos: ${plan.length}`)

  const totalsByStep = {}
  for (const migrationStep of MIGRATION_STEPS) totalsByStep[migrationStep.id] = {}

  for (const doc of plan) {
    for (const step of doc.steps) {
      const stepTotals = totalsByStep[step.stepId] ?? (totalsByStep[step.stepId] = {})
      stepTotals[step.type] = (stepTotals[step.type] ?? 0) + 1
    }
  }

  console.log('\nTotais por passo:')
  for (const [stepId, totals] of Object.entries(totalsByStep)) {
    console.log(`  ${stepId}:`)
    for (const [type, count] of Object.entries(totals)) {
      console.log(`    ${type}: ${count}`)
    }
  }

  console.log('\nid | categoria | campos do PATCH')
  for (const doc of plan) {
    if (!doc.changes) continue
    console.log(`${doc.id} | ${doc.category} | ${Object.keys(doc.changes).join(', ')}`)
  }

  const needsReview = plan.flatMap((doc) =>
    doc.steps
      .filter((step) => step.type === 'needs-review')
      .map((step) => ({ id: doc.id, ...step }))
  )
  if (needsReview.length > 0) {
    console.log('\nPrecisam de revisao humana (nenhuma escrita proposta pelo passo):')
    for (const item of needsReview) {
      console.log(`  - ${item.id} (${item.stepId}): ${item.reason}`)
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
  const plan = planOperationalMigration(processes)

  printReport(plan)

  if (!APPLY) {
    console.log('\nDry-run - nada foi escrito. Rode com --apply so' + " apos ler este relatorio.")
    return
  }

  const writable = plan.filter((doc) => doc.changes)
  console.log(`\nAplicando ${writable.length} escrita(s)...`)
  for (const doc of writable) {
    await applyStep(accessToken, doc)
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
