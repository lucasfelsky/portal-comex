// F17.1a/F17.2b/F17.3a/F17.3b: migracao do `processStatus` legado pro
// derivado (deriveProcessStatus) + migracao de `mapaStatus` legado pro
// `licenses[]` multi-orgao (F17.2b D-11) + migracao de `berthed`/`arrived`
// sem data pro `berthedAt`/`arrivedAt` aproximado (F17.3a D-3) + relatorio de
// DUIMP legada sem data (F17.3b D-10, `duimpDates` - NUNCA escreve) + fusao
// do vocabulario de `collectionStatus` (F17.4a D-10, `collectionStatusA5`).
// `MIGRATION_STEPS` tem 5 passos EM SEQUENCIA (`mapaToLicenses` ->
// `arrivalDates` -> `duimpDates` -> `collectionStatusA5` ->
// `recalcProcessStatus` - cada passo le as `changes` do anterior ja
// aplicadas em memoria). `containers[]` ja migrou via F17.2a (nao precisou
// de passo, so' de expansao lazy na leitura).
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
import {
  getLegacyDuimpLevel,
  isLegacyDuimpRegisteredWithoutDate,
  isLegacyParameterizedWithoutDate,
} from '../src/features/processes/arrivalCustoms.js'
import {
  canonicalizeCollectionStatus,
  normalizeComparableText,
} from '../src/features/processes/processStatus.js'

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

function isAirCategoryForMigration(category) {
  return category === 'AEREO'
}

/**
 * F17.3a (D-3): plano puro (sem I/O) de migracao de `berthed`/`arrived`
 * legado sem data pro `berthedAt`/`arrivedAt` aproximado (marcado em
 * `migratedApproxFields`), a partir do `eta` (`YYYY-MM-DD` valido). Presenca
 * de carga (`cargoPresenceInformed` sem `cargoPresenceInformedAt`) NUNCA
 * ganha data inventada - so' `needs-review` (A1: seria a data-base do free
 * time). Nunca rebaixa (so' ACRESCENTA campos).
 *
 * F17.3b (D-10): correcao do achado do reviewer do F17.3a - antes o
 * `needs-review` da presenca so entrava se `type === 'unchanged'`, entao um
 * doc com chegada aproximada (ou chegada `needs-review`) E presenca sem data
 * perdia o 2o motivo no relatorio. Agora acumula `reviewReasons[]` (um por
 * motivo) e `reasons[]` (todos os motivos, incluindo o de aproximacao).
 */
export function planArrivalDatesMigration(processes) {
  return (Array.isArray(processes) ? processes : []).map((doc) => {
    const category = doc?.category ?? ''
    const changes = {}
    const migratedApproxFields = Array.isArray(doc?.migratedApproxFields)
      ? [...doc.migratedApproxFields]
      : []
    const reasons = []
    const reviewReasons = []
    let approxType = null

    function planArrivalDate(boolField, dateField) {
      if (doc?.[boolField] !== true || hasValue(doc?.[dateField])) return
      const eta = String(doc?.eta ?? '').slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(eta)) {
        changes[dateField] = `${eta}T00:00`
        if (!migratedApproxFields.includes(dateField)) migratedApproxFields.push(dateField)
        changes.migratedApproxFields = migratedApproxFields
        approxType = `${dateField}-approx`
        reasons.push(`${boolField}=true sem ${dateField}, migrado a partir do eta (aproximado)`)
        return
      }
      const reviewReason = `${boolField}=true sem ${dateField} e sem eta valido`
      reviewReasons.push(reviewReason)
      reasons.push(reviewReason)
    }

    if (isMaritimeCategoryForMigration(category)) {
      planArrivalDate('berthed', 'berthedAt')
    } else if (isAirCategoryForMigration(category)) {
      planArrivalDate('arrived', 'arrivedAt')
    }

    if (doc?.cargoPresenceInformed === true && !hasValue(doc?.cargoPresenceInformedAt)) {
      const reviewReason = 'cargoPresenceInformed=true sem cargoPresenceInformedAt'
      reviewReasons.push(reviewReason)
      reasons.push(reviewReason)
    }

    if (Object.keys(changes).length > 0) {
      changes.updatedById = ''
      changes.updatedByName = MIGRATION_ACTOR_NAME
    }

    const type = approxType ?? (reviewReasons.length > 0 ? 'needs-review' : 'unchanged')
    const reason = reasons.length > 0 ? reasons.join('; ') : 'sem sinal legado pendente'

    return {
      id: doc?.id ?? '',
      category,
      before: '',
      after: changes.berthedAt ?? changes.arrivedAt ?? '',
      type,
      reason,
      reviewReasons,
      changes: Object.keys(changes).length > 0 ? changes : null,
    }
  })
}

/**
 * F17.3b (D-10): plano puro (sem I/O) - SO RELATORIO, nunca escreve
 * (`changes: null` sempre). Nao inventa `duimpRegisteredAt`/`parameterizedAt`/
 * `clearanceCompletedAt` a partir de `eta`/`updatedAt` - essas datas
 * alimentam o lead time presenca->desembaraco (F17.6) e o alerta
 * "parametrizada sem desembaraco" (F17.5); data falsa contaminaria os dois.
 * Processo ja `Carga recebida` e' historico - nao entra em revisao.
 */
export function planDuimpDatesMigration(processes) {
  return (Array.isArray(processes) ? processes : []).map((doc) => {
    const category = doc?.category ?? ''
    const base = { id: doc?.id ?? '', category, before: '', after: '' }

    if (String(doc?.processStatus ?? '').trim() === 'Carga recebida') {
      return {
        ...base,
        type: 'unchanged',
        reason: 'carga recebida - historico, sem revisao',
        reviewReasons: [],
        changes: null,
      }
    }

    const reviewReasons = []

    if (isLegacyDuimpRegisteredWithoutDate(doc)) {
      reviewReasons.push(`duimpStatus="${doc?.duimpStatus ?? ''}" sem duimpRegisteredAt`)
    }
    if (isLegacyParameterizedWithoutDate(doc)) {
      reviewReasons.push('duimpStatus=Parametrizada sem parameterizedAt')
    }
    if (
      getLegacyDuimpLevel(doc?.duimpStatus) === 3 &&
      String(doc?.parameterizationChannel ?? '').trim() === 'Verde' &&
      !hasValue(doc?.clearanceCompletedAt)
    ) {
      reviewReasons.push('Parametrizada + Verde sem clearanceCompletedAt (desembaraco sem data real)')
    }

    return {
      ...base,
      type: reviewReasons.length > 0 ? 'needs-review' : 'unchanged',
      reason: reviewReasons.length > 0 ? reviewReasons.join('; ') : 'sem sinal legado pendente',
      reviewReasons,
      changes: null,
    }
  })
}

/**
 * F17.4a (D-10): plano puro (sem I/O) de migracao do `collectionStatus`
 * legado ('Carga recebida' / 'Carga em Conferência/Etiquetagem', com ou sem
 * acento) pro valor fundido (A5) 'Carga recebida, em conferência'. Nunca
 * rebaixa - os 2 legados e o novo derivam o mesmo `processStatus` ('Carga
 * recebida'), entao a fusao e' dentro da mesma etapa. `'Aguardando liberação
 * no Terminal'` (D-3) vira `needs-review` (sem escrita) - nao ha destino
 * canonico seguro. Nao toca `processStatus`.
 */
export function planCollectionStatusA5Migration(processes) {
  return (Array.isArray(processes) ? processes : []).map((doc) => {
    const category = doc?.category ?? ''
    const collectionStatus = String(doc?.collectionStatus ?? '')
    const normalizedStatus = normalizeComparableText(collectionStatus).trim()
    const base = { id: doc?.id ?? '', category, before: collectionStatus, after: collectionStatus }

    if (
      normalizedStatus === 'carga recebida' ||
      normalizedStatus === 'carga em conferencia/etiquetagem'
    ) {
      const canonicalStatus = canonicalizeCollectionStatus(collectionStatus)
      return {
        ...base,
        after: canonicalStatus,
        type: 'collection-status-a5',
        reason: 'collectionStatus legado fundido em "Carga recebida, em conferência" (A5)',
        changes: {
          collectionStatus: canonicalStatus,
          updatedById: '',
          updatedByName: MIGRATION_ACTOR_NAME,
        },
      }
    }

    if (normalizedStatus === 'aguardando liberacao no terminal') {
      return {
        ...base,
        type: 'needs-review',
        reason: '"Aguardando liberação no Terminal" saiu da lista do app (F17.4a D-3) - sem destino canonico seguro, requer revisao manual',
        changes: null,
      }
    }

    return { ...base, type: 'unchanged', reason: 'sem sinal legado pendente', changes: null }
  })
}

// F17.2b/F17.3a/F17.3b/F17.4a (D-11/D-3/D-10/D-10): passos EM SEQUENCIA - `mapaToLicenses`
// primeiro (suas `changes` entram no doc em memoria), depois `arrivalDates`,
// depois `duimpDates` (so' relatorio, nunca escreve), depois
// `collectionStatusA5` (fusao do vocabulario de coleta, F17.4a D-10), e por
// ultimo `recalcProcessStatus` (ja le `licenses[]`/`berthedAt`/`arrivedAt`
// como fonte autoritativa).
export const MIGRATION_STEPS = [
  { id: 'mapaToLicenses', plan: planMapaToLicensesMigration },
  { id: 'arrivalDates', plan: planArrivalDatesMigration },
  { id: 'duimpDates', plan: planDuimpDatesMigration },
  { id: 'collectionStatusA5', plan: planCollectionStatusA5Migration },
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
        // F17.3b (D-10): compat com os passos que nao preenchem o campo.
        reviewReasons: stepResult.reviewReasons ?? (stepResult.type === 'needs-review' ? [stepResult.reason] : []),
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
    // F17.3b (D-10): total de MOTIVOS de revisao do passo (pode ser > que
    // `needs-review` acima quando um doc `<dateField>-approx` tambem carrega
    // um motivo de revisao, ex.: presenca sem data).
    const reviewReasonsCount = plan.reduce((total, doc) => {
      const step = doc.steps.find((item) => item.stepId === stepId)
      return total + (step?.reviewReasons?.length ?? 0)
    }, 0)
    if (reviewReasonsCount > 0) {
      console.log(`    needs-review (motivos): ${reviewReasonsCount}`)
    }
  }

  console.log('\nid | categoria | campos do PATCH')
  for (const doc of plan) {
    if (!doc.changes) continue
    console.log(`${doc.id} | ${doc.category} | ${Object.keys(doc.changes).join(', ')}`)
  }

  // F17.3b (D-10): itera `reviewReasons` de QUALQUER passo (nao so'
  // `type === 'needs-review'`) - 1 linha por motivo.
  const needsReview = plan.flatMap((doc) =>
    doc.steps.flatMap((step) =>
      (step.reviewReasons ?? []).map((reviewReason) => ({
        id: doc.id,
        stepId: step.stepId,
        reviewReason,
      }))
    )
  )
  if (needsReview.length > 0) {
    console.log('\nPrecisam de revisao humana (nenhuma escrita proposta pelo passo):')
    for (const item of needsReview) {
      console.log(`  - ${item.id} (${item.stepId}): ${item.reviewReason}`)
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
