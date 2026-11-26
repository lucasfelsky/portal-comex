// S11-B: serviço cliente da leitura automática de COA (Tess).
// - `readProcessCoa`: chama a callable do mesmo nome (admin; um documento por vez, em sequência) com o timeout
//   longo de 300 s; erro vira `Error` com `code` fixo e mensagem pt-BR.
// - `listCoaReads`: lê `processes/{id}/coaReads` (só admin lê; ninguém grava pelo cliente).
// - `readCoaReadDoc`: leitura TOLERANTE do documento gravado pela function. Tipos, cortes e enums espelham
//   `functions/src/process/coaRead.js` (paridade testada em `tests/unit/coaReadsRepository.test.js`).

import { collection, getDocs } from 'firebase/firestore/lite'
import { firestore, getCallable, isFirebaseConfigured } from '../lib/firebase'

export const COA_READ_CALLABLE_TIMEOUT_MS = 300000

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_KG = 10000000
const MAX_CERTIFICATES = 60
const MAX_VALIDATION_WARNINGS = 50
const LIMITS = {
  name: 200,
  alias: 80,
  aliases: 10,
  batch: 64,
  po: 120,
  raw: 200,
  unit: 16,
  packageType: 32,
  supplier: 200,
  warning: 200,
  warnings: 20,
}
const STATUSES = ['reading', 'done', 'failed']

const ERROR_MESSAGES = {
  'not-configured': 'A leitura automática de COA ainda não está configurada no servidor.',
  'report-closed': 'O relatório já foi fechado; a leitura de COA é só no rascunho.',
  'not-pdf': 'Só PDF é lido automaticamente.',
  'too-large': 'Arquivo maior que 20 MB.',
  'tess-too-large': 'Arquivo maior que 20 MB.',
  attempts: 'Limite de leituras deste arquivo atingido.',
  'daily-limit': 'Limite diário de leituras deste processo atingido. Tente amanhã.',
  'tess-timeout': 'A leitura demorou demais. Tente de novo.',
  'tess-rate-limit': 'O serviço de leitura pediu uma pausa. Tente de novo em 1 minuto.',
  'tess-storage-full':
    'O espaço de arquivos da Tess está cheio (30 arquivos). Apague arquivos antigos no painel da Tess e tente de novo.',
  'tess-auth': 'A Tess recusou as credenciais do Portal. Confira a chave e o workspace no servidor.',
  'tess-unavailable': 'O serviço de leitura está indisponível agora. Tente de novo em alguns minutos.',
  'tess-error': 'O serviço de leitura está indisponível agora. Tente de novo em alguns minutos.',
  'invalid-response': 'A leitura voltou num formato inválido. Tente de novo.',
  'tess-bad-response': 'A leitura voltou num formato inválido. Tente de novo.',
  busy: 'Outra leitura de COA está em andamento. Tente de novo em 1 minuto.',
  'deadline-exceeded': 'Ainda lendo. Clique em Ler COAs de novo em 1 minuto.',
  'permission-denied': 'Só administradores ativos podem ler COAs.',
  unauthenticated: 'Sua sessão expirou. Entre de novo para ler os COAs.',
  'not-found': 'O COA não foi encontrado. Ele pode ter sido excluído.',
  'invalid-file': 'Não foi possível abrir o arquivo do COA.',
}
const FALLBACK_ERROR_MESSAGE = 'Não foi possível ler o COA agora. Tente de novo.'

export function describeCoaReadError(code) {
  return ERROR_MESSAGES[String(code ?? '')] ?? FALLBACK_ERROR_MESSAGE
}

function createCoaReadError(code) {
  const error = new Error(describeCoaReadError(code))
  error.code = code
  return error
}

// Código estável a partir do erro do SDK de functions: `details.code` (da function) manda; sem ele, pedido
// recusado pelo limite de 1 instância (`resource-exhausted`/`unavailable`) = leitura em andamento.
export function getCoaReadErrorCode(error) {
  const detail = error?.details?.code
  if (typeof detail === 'string' && detail) return detail
  const raw = String(error?.code ?? '').replace(/^functions\//, '')
  if (raw === 'deadline-exceeded') return 'deadline-exceeded'
  if (raw === 'resource-exhausted' || raw === 'unavailable') return 'busy'
  if (raw === 'permission-denied' || raw === 'unauthenticated' || raw === 'not-found') return raw
  return 'unknown'
}

// Espelho de coaRead.js (functions): controle sem regex por causa do no-control-regex do lint.
function isControlCode(code) {
  return code <= 0x1f || code === 0x7f
}

// Cada sequencia de caracteres de controle (inclui quebra de linha e tab) vira UM espaco.
function replaceControlChars(text) {
  let out = ''
  let inRun = false
  for (const char of text) {
    if (isControlCode(char.codePointAt(0))) {
      if (!inRun) out += ' '
      inRun = true
    } else {
      out += char
      inRun = false
    }
  }
  return out
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null
  const cleaned = replaceControlChars(value).trim()
  if (!cleaned) return null
  const chars = Array.from(cleaned)
  return chars.length > max ? chars.slice(0, max).join('').trim() : cleaned
}

function cleanTextList(value, maxItems, maxChars) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const item of value) {
    const text = cleanText(item, maxChars)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= maxItems) break
  }
  return out
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positiveKg(value) {
  const number = finiteNumber(value)
  return number !== null && number > 0 && number <= MAX_KG ? number : null
}

function cleanDate(value) {
  if (typeof value !== 'string') return null
  const match = DATE_PATTERN.exec(value.trim())
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  const valid = date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
  return valid ? `${year}-${month}-${day}` : null
}

function readQuantity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const quantity = {
    raw: cleanText(raw.raw, LIMITS.raw) ?? '',
    value: finiteNumber(raw.value),
    unit: cleanText(raw.unit, LIMITS.unit) ?? '',
    kg: positiveKg(raw.kg),
  }
  if (!quantity.raw && quantity.value === null && !quantity.unit && quantity.kg === null) return null
  return quantity
}

function readPackaging(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const count = finiteNumber(raw.packageCount)
  const packaging = {
    raw: cleanText(raw.raw, LIMITS.raw) ?? '',
    packageCount: count !== null && Number.isInteger(count) && count > 0 && count <= 1000000 ? count : null,
    packageNetKg: positiveKg(raw.packageNetKg),
    packageType: cleanText(raw.packageType, LIMITS.packageType),
  }
  if (!packaging.raw && packaging.packageCount === null && packaging.packageNetKg === null && !packaging.packageType) {
    return null
  }
  return packaging
}

function readCertificate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const productName = cleanText(raw.productName, LIMITS.name)
  const batchNumber = cleanText(raw.batchNumber, LIMITS.batch)
  if (!productName || !batchNumber) return null
  const page = finiteNumber(raw.page)
  const expiryDate = cleanDate(raw.expiryDate)
  return {
    page: page !== null && Number.isInteger(page) && page >= 1 && page <= 10000 ? page : null,
    productName,
    productNameLocal: cleanText(raw.productNameLocal, LIMITS.name),
    productAliases: cleanTextList(raw.productAliases, LIMITS.aliases, LIMITS.alias),
    batchNumber,
    poReference: cleanText(raw.poReference, LIMITS.po),
    quantity: readQuantity(raw.quantity),
    packaging: readPackaging(raw.packaging),
    manufactureDate: cleanDate(raw.manufactureDate),
    expiryDate,
    expiryKind: expiryDate !== null && (raw.expiryKind === 'expiry' || raw.expiryKind === 'retest') ? raw.expiryKind : null,
    supplierName: cleanText(raw.supplierName, LIMITS.supplier),
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low',
    warnings: cleanTextList(raw.warnings, LIMITS.warnings, LIMITS.warning),
  }
}

function readTime(value) {
  if (value == null) return null
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : value
  }
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

function readCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function readCoaReadDoc(raw, documentId = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!STATUSES.includes(raw.status)) return null
  const certificates = []
  if (Array.isArray(raw.certificates)) {
    for (const item of raw.certificates) {
      const certificate = readCertificate(item)
      if (certificate) certificates.push(certificate)
      if (certificates.length >= MAX_CERTIFICATES) break
    }
  }
  const errorCode = cleanText(raw.error?.code, 64)
  return {
    documentId: String(documentId ?? ''),
    status: raw.status,
    promptVersion: cleanText(raw.promptVersion, 64) ?? '',
    generation: cleanText(raw.generation, 64) ?? '',
    fileSize: readCount(raw.fileSize),
    documentType: raw.documentType === 'coa' || raw.documentType === 'not_coa' ? raw.documentType : null,
    certificates,
    warnings: cleanTextList(raw.warnings, LIMITS.warnings, LIMITS.warning),
    validationWarnings: cleanTextList(raw.validationWarnings, MAX_VALIDATION_WARNINGS, LIMITS.warning),
    error: errorCode ? { code: errorCode } : null,
    attempts: readCount(raw.attempts),
    tessCredits: readCount(raw.tessCredits),
    lastTessCallAt: readTime(raw.lastTessCallAt),
    requestedByName: cleanText(raw.requestedByName, LIMITS.name) ?? '',
    startedAt: readTime(raw.startedAt),
    finishedAt: readTime(raw.finishedAt),
    durationMs: raw.durationMs == null ? null : readCount(raw.durationMs),
  }
}

// Um documento por vez (a Tess limita 1 requisição por segundo; o servidor aceita 1 leitura por vez).
export async function readProcessCoa(processId, documentId, { force = false } = {}) {
  const callable = await getCallable('readProcessCoa', { timeout: COA_READ_CALLABLE_TIMEOUT_MS })
  if (!callable) throw createCoaReadError('not-configured')

  let data
  try {
    const response = await callable({ processId, documentId, force: force === true })
    data = response?.data
  } catch (error) {
    throw createCoaReadError(getCoaReadErrorCode(error))
  }

  const status = data?.status
  if (!STATUSES.includes(status)) throw createCoaReadError('invalid-response')
  return {
    status,
    cached: data.cached === true,
    read: readCoaReadDoc(data.read, documentId),
  }
}

export async function listCoaReads(processId) {
  if (!isFirebaseConfigured || !firestore || !processId) return {}
  const snapshot = await getDocs(collection(firestore, 'processes', processId, 'coaReads'))
  const reads = {}
  for (const entry of snapshot.docs) {
    const read = readCoaReadDoc(entry.data(), entry.id)
    if (read) reads[entry.id] = read
  }
  return reads
}
