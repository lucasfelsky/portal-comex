// S11-B: leitura automatica de COA (Tess) - modulo PURO (sem SDK, sem rede, sem relogio).
//
// Aqui ficam as constantes, a permissao, a validacao do pedido e da configuracao, a decisao de cache/limites,
// a validacao ESTRITA do JSON devolvido pelo agente (o texto do PDF e' dado, nunca instrucao) e os formatos
// gravados em `processes/{processId}/coaReads/{documentId}`. O contrato do JSON do agente e' o do prompt em
// `docs/coa/prompt-agente-coa.md` (chaves em snake_case, `schema_version: 1`).
//
// Privacidade: nada daqui vai para log, exceto `buildCoaLogFields` (somente ids, contagens, status e codigos).

export const COA_READ_SCHEMA_VERSION = 1
// Sobe quando o prompt do agente muda na Tess: o cache de leituras e' por versao do prompt.
export const COA_PROMPT_VERSION = 'coa-tess-2026-11-25'

export const COA_LIMITS = Object.freeze({
  maxBytes: 20971520,
  maxAttemptsPerDocument: 3,
  maxCallsPerProcessPerDay: 60,
  maxCertificates: 60,
  maxOutputChars: 200000,
  leaseMs: 320000,
  preventiveCleanupMax: 5,
})

export const COA_DAY_MS = 24 * 60 * 60 * 1000

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const TESS_ID_PATTERN = /^[0-9]{1,12}$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_KG = 10000000
const MAX_VALIDATION_WARNINGS = 50

const TEXT_LIMITS = Object.freeze({
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
})

// Controle (C0 e DEL) sem regex: o lint (no-control-regex) nao aceita literal com essa faixa.
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

function hasSpaceOrControl(text) {
  for (const char of text) {
    if (/\s/.test(char) || isControlCode(char.codePointAt(0))) return true
  }
  return false
}

// Admin ativo com e-mail corporativo, SO por claims (sem fallback em `users/{uid}`). Mesma regra de
// `canDownloadProcessDocuments` (documentDownload.js) restrita ao papel `admin`.
export function canReadProcessCoa(token) {
  if (!token || typeof token !== 'object') return false
  if (token.role !== 'admin') return false
  if (!/^\s*ativo\s*$/i.test(String(token.status ?? ''))) return false
  return String(token.email ?? '').toLowerCase().endsWith('@sqquimica.com')
}

export function parseCoaRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'invalid-argument' }
  const { processId, documentId } = data
  if (typeof processId !== 'string' || !ID_PATTERN.test(processId)) return { error: 'invalid-argument' }
  if (typeof documentId !== 'string' || !ID_PATTERN.test(documentId)) return { error: 'invalid-argument' }
  const force = data.force === undefined || data.force === null ? false : data.force
  if (typeof force !== 'boolean') return { error: 'invalid-argument' }
  return { processId, documentId, force }
}

// D-12: chave nao vazia (sem espaco/controle dentro); agente e workspace so' inteiros (a Tess usa ids inteiros).
export function readTessConfig({ apiKey, agentId, workspaceId } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  const agent = typeof agentId === 'string' ? agentId.trim() : ''
  const workspace = typeof workspaceId === 'string' ? workspaceId.trim() : ''
  if (!key || hasSpaceOrControl(key)) return { error: 'not-configured' }
  if (!TESS_ID_PATTERN.test(agent) || Number(agent) <= 0) return { error: 'not-configured' }
  if (!TESS_ID_PATTERN.test(workspace) || Number(workspace) <= 0) return { error: 'not-configured' }
  return { apiKey: key, agentId: Number(agent), workspaceId: workspace }
}

export function isPdfSignature(bytes) {
  if (!bytes || typeof bytes.length !== 'number' || bytes.length < 5) return false
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
}

export function toMillis(value) {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') return value.toMillis()
    if (typeof value.toDate === 'function') return value.toDate().getTime()
    return 0
  }
  const parsed = Date.parse(String(value))
  return Number.isNaN(parsed) ? 0 : parsed
}

export function toIso(ms) {
  return new Date(ms).toISOString()
}

// Tentativas contam por versao do prompt: prompt novo zera o limite de 3 chamadas do documento.
export function getEffectiveAttempts(existing) {
  if (!existing || existing.promptVersion !== COA_PROMPT_VERSION) return 0
  const attempts = Number(existing.attempts)
  return Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0
}

// D-6/D-7/D-8. `error` presente = pedido recusado (o chamador NAO le); sem `error`, `action` manda.
export function decideCoaReadAction({ existing, generation, now, force = false, callsLast24h = 0 } = {}) {
  const status = existing?.status
  if (status === 'reading' && toMillis(existing.leaseUntil) > now) return { action: 'reading' }

  const cacheValid = status === 'done'
    && existing.promptVersion === COA_PROMPT_VERSION
    && String(existing.generation ?? '') === String(generation ?? '')
  if (cacheValid && !force) return { action: 'cached' }

  if (getEffectiveAttempts(existing) >= COA_LIMITS.maxAttemptsPerDocument) {
    return { action: 'read', error: 'attempts' }
  }
  if (callsLast24h >= COA_LIMITS.maxCallsPerProcessPerDay) {
    return { action: 'read', error: 'daily-limit' }
  }
  return { action: 'read' }
}

export function parseAgentOutputText(text) {
  if (typeof text !== 'string') return { ok: false, code: 'invalid-response' }
  if (text.length > COA_LIMITS.maxOutputChars) return { ok: false, code: 'too-large' }

  let body = text.trim()
  const fenced = body.match(/^```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```$/)
  if (fenced) body = fenced[1].trim()
  if (!body) return { ok: false, code: 'invalid-response' }

  let value
  try {
    value = JSON.parse(body)
  } catch {
    return { ok: false, code: 'invalid-response' }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'invalid-response' }
  if (value.schema_version !== 1) return { ok: false, code: 'schema-version' }
  if (value.document_type !== 'coa' && value.document_type !== 'not_coa') return { ok: false, code: 'invalid-response' }
  if (value.document_type === 'coa' && !Array.isArray(value.certificates)) return { ok: false, code: 'invalid-response' }
  return { ok: true, value }
}

// ---------------------------------------------------------------------------
// Normalizacao (D-13): tipos, cortes e enums estritos; chave desconhecida e' descartada.
// ---------------------------------------------------------------------------

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
  if (typeof value !== 'string') return { value: null, invalid: false }
  const match = DATE_PATTERN.exec(value.trim())
  if (!match) return { value: null, invalid: value.trim() !== '' }
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  const valid = date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
  return valid ? { value: `${year}-${month}-${day}`, invalid: false } : { value: null, invalid: true }
}

function foldKey(value) {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeQuantity(raw, notes) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const quantity = {
    raw: cleanText(raw.raw, TEXT_LIMITS.raw) ?? '',
    value: finiteNumber(raw.value),
    unit: cleanText(raw.unit, TEXT_LIMITS.unit) ?? '',
    kg: positiveKg(raw.kg),
  }
  if (raw.kg !== null && raw.kg !== undefined && quantity.kg === null) {
    notes.push('quantidade em kg inválida ignorada')
  }
  if (!quantity.raw && quantity.value === null && !quantity.unit && quantity.kg === null) return null
  return quantity
}

function normalizePackaging(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const count = finiteNumber(raw.package_count)
  const packaging = {
    raw: cleanText(raw.raw, TEXT_LIMITS.raw) ?? '',
    packageCount: count !== null && Number.isInteger(count) && count > 0 && count <= 1000000 ? count : null,
    packageNetKg: positiveKg(raw.package_net_kg),
    packageType: cleanText(raw.package_type, TEXT_LIMITS.packageType),
  }
  if (!packaging.raw && packaging.packageCount === null && packaging.packageNetKg === null && !packaging.packageType) {
    return null
  }
  return packaging
}

function normalizeCertificate(raw, notes) {
  const productName = cleanText(raw.product_name, TEXT_LIMITS.name)
  const batchNumber = cleanText(raw.batch_number, TEXT_LIMITS.batch)
  const page = finiteNumber(raw.page)
  const pageNumber = page !== null && Number.isInteger(page) && page >= 1 && page <= 10000 ? page : null
  const where = pageNumber === null ? 'sem página' : `página ${pageNumber}`

  if (!batchNumber) {
    notes.push(`certificado sem lote ignorado (${where})`)
    return null
  }
  if (!productName) {
    notes.push(`certificado sem produto ignorado (${where})`)
    return null
  }

  const localNotes = []
  const manufacture = cleanDate(raw.manufacture_date)
  const expiry = cleanDate(raw.expiry_date)
  if (manufacture.invalid) localNotes.push('data de fabricação inválida ignorada')
  if (expiry.invalid) localNotes.push('data de validade inválida ignorada')
  const quantity = normalizeQuantity(raw.quantity, localNotes)
  for (const note of localNotes) notes.push(`${note} (${where})`)

  const expiryKind = expiry.value !== null && (raw.expiry_kind === 'expiry' || raw.expiry_kind === 'retest')
    ? raw.expiry_kind
    : null

  return {
    page: pageNumber,
    productName,
    productNameLocal: cleanText(raw.product_name_local, TEXT_LIMITS.name),
    productAliases: cleanTextList(raw.product_aliases, TEXT_LIMITS.aliases, TEXT_LIMITS.alias),
    batchNumber,
    poReference: cleanText(raw.po_reference, TEXT_LIMITS.po),
    quantity,
    packaging: normalizePackaging(raw.packaging),
    manufactureDate: manufacture.value,
    expiryDate: expiry.value,
    expiryKind,
    supplierName: cleanText(raw.supplier_name, TEXT_LIMITS.supplier),
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low',
    warnings: cleanTextList(raw.warnings, TEXT_LIMITS.warnings, TEXT_LIMITS.warning),
  }
}

export function normalizeCoaExtraction(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const documentType = source.document_type === 'coa' || source.document_type === 'not_coa'
    ? source.document_type
    : null
  const warnings = cleanTextList(source.warnings, TEXT_LIMITS.warnings, TEXT_LIMITS.warning)
  const notes = []
  const certificates = []

  if (documentType === 'coa' && Array.isArray(source.certificates)) {
    const seen = new Set()
    let overflow = false
    for (const rawCertificate of source.certificates) {
      if (!rawCertificate || typeof rawCertificate !== 'object' || Array.isArray(rawCertificate)) continue
      const certificate = normalizeCertificate(rawCertificate, notes)
      if (!certificate) continue
      // Mesmo lote + mesmo produto repetido no mesmo PDF = 1 certificado.
      const key = `${foldKey(certificate.batchNumber)}|${foldKey(certificate.productName)}`
      if (seen.has(key)) continue
      seen.add(key)
      if (certificates.length >= COA_LIMITS.maxCertificates) {
        overflow = true
        continue
      }
      certificates.push(certificate)
    }
    if (overflow) notes.push(`mais de ${COA_LIMITS.maxCertificates} certificados: só os primeiros ${COA_LIMITS.maxCertificates} foram mantidos`)
  }

  return {
    documentType,
    certificates,
    warnings,
    validationWarnings: notes.slice(0, MAX_VALIDATION_WARNINGS).map((note) => cleanText(note, TEXT_LIMITS.warning)),
  }
}

export function sumTessCredits(values) {
  if (!Array.isArray(values)) return 0
  let total = 0
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) total += value
  }
  return Math.round(total * 1e9) / 1e9
}

// ---------------------------------------------------------------------------
// Documentos gravados em `processes/{processId}/coaReads/{documentId}` (so' a function grava).
// Tempos em ISO 8601 (string): `lastTessCallAt` e' consultado por `>=` e ISO compara lexicograficamente.
// ---------------------------------------------------------------------------

export function buildCoaReadingDoc({
  generation,
  fileSize,
  attempts,
  nowMs,
  requestedById,
  requestedByName = '',
  tessContractVersion,
  previous = null,
}) {
  // O arquivo pendente de uma leitura anterior deste documento (DELETE que falhou) segue registrado para a
  // limpeza preventiva achar.
  const keepPending = previous?.tessFilePending === true && Number.isSafeInteger(previous?.tessFileId)
  return {
    schemaVersion: COA_READ_SCHEMA_VERSION,
    promptVersion: COA_PROMPT_VERSION,
    tessContractVersion,
    status: 'reading',
    generation: String(generation ?? ''),
    fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : 0,
    documentType: null,
    certificates: [],
    warnings: [],
    validationWarnings: [],
    error: null,
    attempts,
    lastTessCallAt: toIso(nowMs),
    leaseUntil: toIso(nowMs + COA_LIMITS.leaseMs),
    tessFileId: keepPending ? previous.tessFileId : null,
    tessFilePending: keepPending,
    tessResponseId: null,
    tessCredits: 0,
    requestedById: String(requestedById ?? ''),
    requestedByName: cleanText(requestedByName, TEXT_LIMITS.name) ?? '',
    startedAt: toIso(nowMs),
    finishedAt: null,
    durationMs: null,
  }
}

function finishDoc(base, patch, { finishedAtMs, durationMs, tessCredits, tessFileId, tessFilePending, tessResponseId }) {
  return {
    ...base,
    ...patch,
    leaseUntil: null,
    tessFileId: tessFileId ?? null,
    tessFilePending: tessFilePending === true,
    tessResponseId: tessResponseId ?? null,
    tessCredits: Number.isFinite(tessCredits) && tessCredits >= 0 ? tessCredits : 0,
    finishedAt: toIso(finishedAtMs),
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null,
  }
}

export function buildCoaReadDoc(base, extraction, finish) {
  return finishDoc(
    base,
    {
      status: 'done',
      documentType: extraction.documentType,
      certificates: extraction.certificates,
      warnings: extraction.warnings,
      validationWarnings: extraction.validationWarnings,
      error: null,
    },
    finish
  )
}

export function buildCoaFailureDoc(base, code, finish) {
  return finishDoc(
    base,
    {
      status: 'failed',
      documentType: null,
      certificates: [],
      warnings: [],
      validationWarnings: [],
      error: { code: String(code || 'internal') },
    },
    finish
  )
}

// Devolvido ao cliente: sem lease, sem quem pediu (id), sem ids da Tess.
const PRIVATE_DOC_FIELDS = ['leaseUntil', 'requestedById', 'tessFileId', 'tessResponseId']

export function toPublicCoaRead(doc) {
  if (!doc || typeof doc !== 'object') return null
  const copy = { ...doc }
  for (const key of PRIVATE_DOC_FIELDS) delete copy[key]
  return copy
}

// Unico ponto que alimenta o log: ids, uid, status, contagem, creditos, duracao e codigo de erro.
// NUNCA conteudo do COA, nome de arquivo, produto, lote, PO, `output`, chave ou workspace.
export function buildCoaLogFields({
  processId,
  documentId,
  uid,
  status,
  cached,
  certificateCount,
  credits,
  durationMs,
  errorCode,
}) {
  const fields = { processId, documentId, uid, status }
  if (cached !== undefined) fields.cached = Boolean(cached)
  if (certificateCount !== undefined) fields.certificates = Number(certificateCount) || 0
  if (credits !== undefined) fields.credits = Number(credits) || 0
  if (durationMs !== undefined) fields.durationMs = Number(durationMs) || 0
  if (errorCode) fields.errorCode = String(errorCode)
  return fields
}
