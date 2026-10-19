// Sync do status da Barra do Rio Itajai/Navegantes (fonte oficial: Praticagem
// ZP21, https://praticoszp21.com.br/).
//
// Fluxo atual (substitui o OCR da imagem, removido):
//   1. baixa o HTML da home da praticagem;
//   2. le o JSON inline `cond_barra` (o mesmo que o JS do site usa para escolher
//      a imagem exibida ao publico) e mapeia o CODIGO para o enum do Portal COMEX;
//   3. valida codigo x descricao (so por contradicao) e grava a leitura em
//      `barra/suggestion`, com campos de saude (lastAttemptAt/lastSuccessAt/lastError);
//   4. quando o status DO SITE muda (edge-triggered) e difere de `barra/current`,
//      APLICA em `barra/current` (so `status` + `updatedAt`, preservando `notes`)
//      e registra o evento em `audits`.
//
// Causa raiz do OCR antigo: o <img> estatico da pagina SEMPRE aponta para
// barra-praticavel.jpg; o navegador troca o src pelo codigo de `cond_barra`.
// Ler a imagem estatica (ou fazer OCR dela) dizia PRATICAVEL mesmo com a barra
// impraticavel. O codigo do JSON e a fonte da verdade.
//
// Falhas (fetch, parse, codigo desconhecido, leitura de estado) NUNCA aplicam
// nada: vao para a DLQ (`externalNewsDlq`) + `lastError` na suggestion, saem com
// exit 0 + `::warning::` (96 execucoes/dia: exit 1 geraria e-mail a cada 15 min).
// O alerta e o painel Admin -> Barra. Falta de env/OAuth -> exit 1.
//
// Molde: scripts/syncExternalNews.mjs (GitHub Actions cron + REST + DLQ +
// service account bypassa rules). So imports `node:*` (o workflow nao roda npm ci).

import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

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

// Modo emulador (testes E2E): com FIRESTORE_EMULATOR_HOST setado, o sync
// grava no emulador Firestore (REST local + Bearer "owner", sem OAuth).
const FIRESTORE_EMULATOR_HOST = String(process.env.FIRESTORE_EMULATOR_HOST ?? '').trim()
const FIRESTORE_REST_BASE = FIRESTORE_EMULATOR_HOST
  ? `http://${FIRESTORE_EMULATOR_HOST}/v1`
  : 'https://firestore.googleapis.com/v1'

// Pagina oficial da Praticagem ZP21. Pode ser sobrescrita por env (testes).
export const BAR_STATUS_PAGE_URL = process.env.BAR_STATUS_PAGE_URL ?? 'https://praticoszp21.com.br/'

const REQUEST_TIMEOUT_MS = 20000

const SOURCE_NAME = 'Praticagem ZP21'
const AUDIT_ACTOR = 'Praticagem ZP21 (automático)'

// Mesmos { value, label, tone } de BAR_STATUS_OPTIONS (src/services/barStatusRepository.js).
// Labels SEM acento: sao o enum persistido; nao mudar.
const STATUS_PRATICAVEL = { value: 'PRATICAVEL', label: 'PRATICAVEL', tone: 'ok' }
const STATUS_PRATICAVEL_RESTRICOES = {
  value: 'PRATICAVEL_RESTRICOES',
  label: 'PRATICAVEL C/ RESTRICOES',
  tone: 'warn',
}
const STATUS_IMPRATICAVEL = { value: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' }

export const BAR_STATUS_BY_CODE = {
  1: STATUS_PRATICAVEL,
  2: STATUS_IMPRATICAVEL,
  3: STATUS_PRATICAVEL_RESTRICOES,
  4: STATUS_PRATICAVEL_RESTRICOES,
  5: STATUS_PRATICAVEL_RESTRICOES,
}

function normalizeComparable(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Quebras de linha viram espaco: texto vindo do site vai para stdout/stderr e
// lastError; sem isso, uma linha iniciando com "::error::" injetaria comandos
// de workflow do GitHub Actions.
function singleLine(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ')
}

export function clip(value, max) {
  return singleLine(value).trim().slice(0, max)
}

// O codigo e a fonte da verdade. So rejeita a contradicao PERIGOSA: codigo 1
// (praticavel) com descricao "impraticavel". Codigos 2/3/4/5 nunca sao
// rejeitados pela descricao (direcao cautelosa); "restri" no codigo 1 tambem nao
// (ex.: "Praticavel sem restricoes").
function isContradictory(code, description) {
  return code === '1' && normalizeComparable(description).includes('impraticavel')
}

export function parseBarConditionFromHtml(html) {
  const matches = [...String(html ?? '').matchAll(/\bcond_barra\s*=\s*(\[[\s\S]*?\])\s*;/g)]
  if (matches.length === 0) {
    return { ok: false, stage: 'parse-status', error: 'Variável cond_barra não encontrada na página da praticagem.' }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      stage: 'parse-status',
      error: `cond_barra aparece ${matches.length} vezes na página da praticagem.`,
    }
  }
  const match = matches[0]

  let parsed
  try {
    parsed = JSON.parse(match[1])
  } catch {
    return { ok: false, stage: 'parse-status', error: 'JSON de cond_barra inválido.' }
  }

  const item = Array.isArray(parsed) ? parsed[0] : undefined
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { ok: false, stage: 'parse-status', error: 'cond_barra vazio ou em formato inesperado.' }
  }

  const code = String(item.condicao_barra ?? '').trim()
  const siteDescription = clip(item.desc_condicao_barra, 200)
  const restriction = clip(item.restricao, 200)

  if (!Object.prototype.hasOwnProperty.call(BAR_STATUS_BY_CODE, code)) {
    return {
      ok: false,
      stage: 'unknown-code',
      error: `Código de condição da barra desconhecido: "${clip(code, 40)}" (descrição: "${clip(siteDescription, 80)}").`,
    }
  }

  if (isContradictory(code, siteDescription)) {
    return {
      ok: false,
      stage: 'inconsistent-status',
      error: `Código ${code} contradiz a descrição do site: "${clip(siteDescription, 80)}".`,
    }
  }

  return { ok: true, code, status: BAR_STATUS_BY_CODE[code], siteDescription, restriction }
}

// Edge-triggered: so aplica quando o status do SITE mudou desde a ultima leitura
// bem-sucedida E difere do que ja esta em barra/current. Um override manual do
// admin vale ate a proxima mudanca do site.
export function decideAutoApply({ siteStatus, previousSiteStatus, currentStatus }) {
  return siteStatus !== (previousSiteStatus ?? null) && siteStatus !== (currentStatus ?? null)
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

  if (!FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY') || !FIREBASE_PRIVATE_KEY.includes('END PRIVATE KEY')) {
    throw new Error('FIREBASE_PRIVATE_KEY invalida: a chave nao esta em formato PEM.')
  }
}

async function fetchBarStatusPage() {
  const response = await fetch(BAR_STATUS_PAGE_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Portal-COMEX-BarStatus-Bot/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Falha ao baixar a página da praticagem (HTTP ${response.status}).`)
  }

  const html = await response.text()
  if (!html.trim()) {
    throw new Error('Página da praticagem baixada está vazia.')
  }
  return html
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error('Falha ao obter token OAuth para gravar o status da barra.')
  }

  const payloadResponse = await response.json()
  return payloadResponse.access_token
}

function toFirestoreValue(value) {
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } }
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (value === null) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  return { stringValue: String(value ?? '') }
}

function toFirestoreDocument(data) {
  return {
    fields: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])
    ),
  }
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

function documentsUrl(path) {
  return `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`
}

async function readDocument(path, accessToken) {
  const response = await fetch(documentsUrl(path), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Falha ao ler ${path} (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`)
  }
  return fromFirestoreDocument(await response.json())
}

// PATCH com updateMask: so os campos listados sao escritos. Campo listado na
// mascara e ausente do corpo e APAGADO pelo Firestore (usado p/ remover o
// rawOcrText legado).
async function patchDocument(path, data, fieldPaths, accessToken) {
  const mask = fieldPaths.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&')
  const response = await fetch(`${documentsUrl(path)}?${mask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toFirestoreDocument(data)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Falha ao gravar ${path} (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`)
  }
}

async function createAuditDocument(data, accessToken) {
  const response = await fetch(documentsUrl('audits'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toFirestoreDocument(data)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Falha ao gravar evento de auditoria (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`)
  }
}

async function recordDlqEntry(entry, accessToken) {
  // DLQ reusa a collection externalNewsDlq (mesmo padrao do news sync).
  // Falhas aqui sao melhor-esforco: nunca derrubam o sync principal.
  const dlqId = `DLQ-bar-status-${entry.stage}-${Date.now()}-${crypto.randomUUID()}`
  const requestUrl = `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/externalNewsDlq/${encodeURIComponent(dlqId)}`
  const payload = {
    sourceId: 'bar-status-sync',
    sourceName: SOURCE_NAME,
    stage: entry.stage,
    error: String(entry.error ?? '').slice(0, 4000),
    failedAt: new Date().toISOString(),
  }

  try {
    await fetch(requestUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toFirestoreDocument(payload)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (dlqError) {
    console.error('Falha ao gravar DLQ do bar-status:', dlqError)
  }
}

// Registra a falha: DLQ + campos de saude na suggestion (mascara exata, nunca
// toca siteStatus/status/lastSuccessAt) + ::warning::. Melhor-esforco.
async function recordFailure(stage, message, accessToken) {
  const text = singleLine(message)
  console.error(`[${stage}] ${text}`)
  await recordDlqEntry({ stage, error: text }, accessToken)

  try {
    await patchDocument(
      'barra/suggestion',
      { lastAttemptAt: new Date(), lastError: text.slice(0, 500), lastErrorStage: stage },
      ['lastAttemptAt', 'lastError', 'lastErrorStage'],
      accessToken
    )
  } catch (healthError) {
    console.error('Falha ao gravar o estado de falha da barra:', healthError.message)
  }

  console.log(`::warning::Sync da barra falhou (${stage}): ${text.slice(0, 200)} (registrado na DLQ e na suggestion).`)
}

async function main() {
  ensureEnvironment()

  const accessToken = await getAccessToken()

  // 1. Baixa a pagina
  let html
  try {
    html = await fetchBarStatusPage()
  } catch (fetchError) {
    await recordFailure('fetch-page', fetchError.message, accessToken)
    return
  }

  // 2. Le e valida cond_barra
  const parsed = parseBarConditionFromHtml(html)
  if (!parsed.ok) {
    await recordFailure(parsed.stage, parsed.error, accessToken)
    return
  }

  // 3. Estado atual (nao aplica sem saber o estado)
  let suggestion
  let current
  try {
    suggestion = await readDocument('barra/suggestion', accessToken)
    current = await readDocument('barra/current', accessToken)
  } catch (readError) {
    await recordFailure('read-state', readError.message, accessToken)
    return
  }

  // 4. Decide
  const shouldApply = decideAutoApply({
    siteStatus: parsed.status.value,
    previousSiteStatus: suggestion?.siteStatus ?? null,
    currentStatus: current?.status ?? null,
  })

  const now = new Date()

  // 5. Aplica em barra/current (so status + updatedAt; notes preservado)
  if (shouldApply) {
    try {
      await patchDocument(
        'barra/current',
        { status: parsed.status.value, updatedAt: now },
        ['status', 'updatedAt'],
        accessToken
      )
    } catch (applyError) {
      // Sem atualizar siteStatus: o proximo run tenta de novo.
      await recordFailure('apply-current', applyError.message, accessToken)
      return
    }

    try {
      await createAuditDocument(
        {
          action: 'Status da barra atualizado',
          actor: AUDIT_ACTOR,
          target: parsed.status.label,
          createdAt: now,
        },
        accessToken
      )
    } catch (auditError) {
      const auditMessage = singleLine(auditError.message)
      console.error(auditMessage)
      await recordDlqEntry({ stage: 'audit', error: auditMessage }, accessToken)
      console.log('::warning::Falha ao registrar o evento de auditoria da barra (registrada na DLQ).')
    }
  }

  // 6. Grava a leitura bem-sucedida na suggestion
  const suggestionData = {
    status: parsed.status.value,
    label: parsed.status.label,
    tone: parsed.status.tone,
    siteCode: parsed.code,
    siteStatus: parsed.status.value,
    siteDescription: parsed.siteDescription,
    restriction: parsed.restriction,
    sourceName: SOURCE_NAME,
    sourceUrl: BAR_STATUS_PAGE_URL,
    fetchedAt: now,
    lastAttemptAt: now,
    lastSuccessAt: now,
    lastError: '',
    lastErrorStage: '',
  }
  const suggestionMask = [
    'status',
    'label',
    'tone',
    'siteCode',
    'siteStatus',
    'siteDescription',
    'restriction',
    'sourceName',
    'sourceUrl',
    'fetchedAt',
    'lastAttemptAt',
    'lastSuccessAt',
    'lastError',
    'lastErrorStage',
    'rawOcrText', // ausente do corpo: apaga o campo legado do OCR
  ]
  if (shouldApply) {
    suggestionData.lastAppliedAt = now
    suggestionData.lastAppliedStatus = parsed.status.value
    suggestionMask.push('lastAppliedAt', 'lastAppliedStatus')
  }

  try {
    await patchDocument('barra/suggestion', suggestionData, suggestionMask, accessToken)
  } catch (upsertError) {
    // recordFailure grava DLQ + lastError/lastErrorStage/lastAttemptAt (melhor-esforco),
    // para o painel mostrar "failing".
    await recordFailure('upsert-suggestion', upsertError.message, accessToken)
    return
  }

  console.log(
    shouldApply
      ? `Barra: ${parsed.status.label} (código ${parsed.code}) — aplicado automaticamente em barra/current.`
      : `Barra: ${parsed.status.label} (código ${parsed.code}) — sem mudança no site; barra/current mantido.`
  )
}

// Roda o main() apenas quando executado diretamente (node scripts/syncBarStatus.mjs),
// nao quando importado por testes unitarios.
const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (IS_MAIN) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
