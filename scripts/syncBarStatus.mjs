// F13 (backlog 2026-07-12): sync semi-automático do status da Barra do Rio
// Itajaí/Navegantes. A fonte oficial é a Praticagem ZP21 — o status de
// praticabilidade é publicado como uma imagem (barra-praticavel.jpg) no
// site praticoszp21.com.br. Este script baixa a imagem, faz OCR com
// tesseract.js, mapeia o texto extraído pro enum de 3 valores do Portal
// COMEX e grava a SUGESTÃO em `barra/suggestion` (Firestore). NUNCA toca
// `barra/current` — a decisão de aplicar continua humana (admin clica
// "Aplicar" no AdminBarStatusPanel, que chama saveBarStatus).
//
// Molde exato: scripts/syncExternalNews.mjs (GitHub Actions cron horário
// + REST + DLQ + service account bypassa rules). A collection
// `barra/suggestion` é read admin-only, write fechado (só service
// account), igual `externalNewsDlq`.

import crypto from 'node:crypto'
import { createWorker } from 'tesseract.js'

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

// URL da imagem oficial da Praticagem ZP21 com o status da barra. Pode
// ser sobrescrita por env (testes com imagem fixture).
const BAR_STATUS_IMAGE_URL =
  process.env.BAR_STATUS_IMAGE_URL ??
  'https://praticoszp21.com.br/wp-content/uploads/2023/10/barra-praticavel.jpg'

// Mapeamento do texto extraído pelo OCR pro enum do Portal COMEX
// (src/services/barStatusRepository.js). O OCR retorna o texto da imagem
// ("PRATICÁVEL", "PRATICÁVEL C/ RESTRIÇÕES", "IMPRATICÁVEL"); este map
// normaliza acentos/case pra cair no value canonico.
const BAR_STATUS_BY_TEXT = {
  praticavel: { value: 'PRATICAVEL', label: 'PRATICAVEL', tone: 'ok' },
  praticavel_restricoes: {
    value: 'PRATICAVEL_RESTRICOES',
    label: 'PRATICAVEL C/ RESTRICOES',
    tone: 'warn',
  },
  impraticavel: { value: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' },
}

function normalizeOcrText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9\s/]/g, ' ') // mantém só alfanuméricos, espaço e barra
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function mapOcrTextToStatus(rawText) {
  const normalized = normalizeOcrText(rawText)
  if (!normalized) return null

  // Ordem importa: "praticavel c/ restricoes" deve ser checado antes de
  // "praticavel" sozinho (subset).
  if (
    normalized.includes('praticavel') &&
    (normalized.includes('restricoes') || normalized.includes('restricao'))
  ) {
    return BAR_STATUS_BY_TEXT.praticavel_restricoes
  }
  if (normalized.includes('impraticavel')) {
    return BAR_STATUS_BY_TEXT.impraticavel
  }
  if (normalized.includes('praticavel')) {
    return BAR_STATUS_BY_TEXT.praticavel
  }
  return null
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

async function fetchBarStatusImage() {
  const response = await fetch(BAR_STATUS_IMAGE_URL, {
    headers: {
      Accept: 'image/jpeg, image/png, image/*',
      'User-Agent': 'Portal-COMEX-BarStatus-Bot/1.0',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem da barra (HTTP ${response.status}).`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0) {
    throw new Error('Imagem da barra baixada esta vazia.')
  }
  return buffer
}

async function ocrBarStatusImage(imageBuffer) {
  // tesseract.js carrega os modelos de linguagem no primeiro run; em
  // CI isso pode demorar ~10-20s. Usamos 'por' (português) porque a
  // imagem tem acentuação ("PRATICÁVEL").
  const worker = await createWorker('por')
  try {
    const { data } = await worker.recognize(imageBuffer)
    return data.text ?? ''
  } finally {
    await worker.terminate()
  }
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
  })

  if (!response.ok) {
    throw new Error('Falha ao obter token OAuth para gravar sugestao da barra.')
  }

  const payloadResponse = await response.json()
  return payloadResponse.access_token
}

function toFirestoreValue(value) {
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } }
  }
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

async function upsertBarSuggestion(suggestion, accessToken) {
  // Grava em barra/suggestion (doc unico "current"). O script NUNCA toca
  // barra/current — a decisao de aplicar continua humana.
  const requestUrl = `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/barra/suggestion`

  const response = await fetch(requestUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toFirestoreDocument(suggestion)),
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`Falha ao gravar sugestao da barra: ${errorPayload}`)
  }
}

async function recordDlqEntry(entry, accessToken) {
  // DLQ reusa a collection externalNewsDlq (mesmo padrao do news sync).
  // Falhas aqui sao melhor-esforco: nunca derrubam o sync principal.
  const dlqId = `DLQ-bar-status-${entry.stage}-${Date.now()}-${crypto.randomUUID()}`
  const requestUrl = `${FIRESTORE_REST_BASE}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/externalNewsDlq/${encodeURIComponent(dlqId)}`
  const payload = {
    sourceId: 'bar-status-sync',
    sourceName: 'Praticagem ZP21',
    stage: entry.stage, // 'fetch-image' | 'ocr' | 'map-status' | 'upsert-suggestion'
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
    })
  } catch (dlqError) {
    console.error('Falha ao gravar DLQ do bar-status:', dlqError)
  }
}

async function main() {
  ensureEnvironment()

  const accessToken = await getAccessToken()

  // 1. Baixa a imagem
  let imageBuffer
  try {
    imageBuffer = await fetchBarStatusImage()
  } catch (fetchError) {
    console.error(fetchError.message)
    await recordDlqEntry({ stage: 'fetch-image', error: fetchError.message }, accessToken)
    console.log('::warning::Falha ao baixar imagem da barra (registrada na DLQ).')
    return
  }

  // 2. OCR
  let rawOcrText
  try {
    rawOcrText = await ocrBarStatusImage(imageBuffer)
  } catch (ocrError) {
    console.error(ocrError.message)
    await recordDlqEntry({ stage: 'ocr', error: ocrError.message }, accessToken)
    console.log('::warning::Falha no OCR da imagem da barra (registrada na DLQ).')
    return
  }

  console.log('OCR output:', JSON.stringify(rawOcrText.trim()))

  // 3. Mapeia pro enum
  const matchedStatus = mapOcrTextToStatus(rawOcrText)
  if (!matchedStatus) {
    const errorMessage = `OCR nao matched nenhum status conhecido. Texto: ${rawOcrText.trim().slice(0, 200)}`
    console.error(errorMessage)
    await recordDlqEntry({ stage: 'map-status', error: errorMessage }, accessToken)
    console.log('::warning::Nao foi possivel mapear o texto extraido pro enum de status (registrado na DLQ).')
    return
  }

  // 4. Grava sugestao em barra/suggestion
  const suggestion = {
    status: matchedStatus.value,
    label: matchedStatus.label,
    tone: matchedStatus.tone,
    sourceName: 'Praticagem ZP21',
    sourceUrl: BAR_STATUS_IMAGE_URL,
    rawOcrText: rawOcrText.trim().slice(0, 500),
    fetchedAt: new Date().toISOString(),
  }

  try {
    await upsertBarSuggestion(suggestion, accessToken)
  } catch (upsertError) {
    console.error(upsertError.message)
    await recordDlqEntry({ stage: 'upsert-suggestion', error: upsertError.message }, accessToken)
    console.log('::warning::Falha ao gravar sugestao da barra (registrada na DLQ).')
    return
  }

  console.log(`Sugestao da barra gravada: ${matchedStatus.label} (tom: ${matchedStatus.tone}).`)
}

// Roda o main() apenas quando executado diretamente (node scripts/syncBarStatus.mjs),
// nao quando importado por testes unitarios.
import { fileURLToPath } from 'node:url'
const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (IS_MAIN) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}