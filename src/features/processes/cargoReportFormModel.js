// S3 do Relatório de Carga: formulário FR.CMX.001 (rev. 005) preenchido no Portal.
// Módulo puro (sem React, sem firebase): papéis, fórmulas que espelham o Excel R5 (lote SQ,
// peso líquido por lookup, nº de embalagens), alertas, normalização e montagem dos payloads
// gravados em `processes/{id}/cargoReport/current` e `.../conference`.
// As colunas calculadas (lote SQ, peso líquido, nº de embalagens) NUNCA são gravadas.
import { getItemPackaging, normalizeItemCode, parseCatalogWeight } from './cargoReportCatalog'

export const CARGO_REPORT_FORM_CODE = 'FR.CMX.001'
export const CARGO_REPORT_FORM_REVISION = '005'
export const CARGO_REPORT_SCHEMA_VERSION = 1
// Teto de segurança do Portal (UI, importador, repositório e rules). O modelo FR.CMX.001 tem 28 linhas de
// dados numa página; acima disso o Excel e a impressão ganham linhas extras e várias páginas.
export const CARGO_REPORT_MAX_ROWS = 200
export const CARGO_REPORT_TEMPLATE_ROWS = 28
export const CARGO_REPORT_TITLE_PREFIX = 'RELATÓRIO DE CARGA - '
export const CARGO_REPORT_LIMITS = { text: 120, description: 200, notes: 2000, nf: 40, rowId: 64 }
export const CARGO_REPORT_CONFLICT_CODE = 'cargoReport/revision-conflict'
export const CARGO_REPORT_ATTACHED_NOT_SAVED_CODE = 'cargoReport/attached-not-saved'
export const CARGO_REPORT_ROWS_LIMIT_MESSAGE =
  'O relatório já tem 200 linhas, o limite do Portal. Para mais itens, gere um segundo relatório.'
export const CARGO_REPORT_INVALID_NUMBER_MESSAGE = 'Número inválido'

export const CARGO_TYPE_OPTIONS = [
  { value: 'FCL', label: 'FCL' },
  { value: 'LCL', label: 'LCL' },
  { value: 'CONSOLIDADO', label: 'CONSOLIDADO', shortLabel: 'CONS.' },
  { value: 'AEREO', label: 'AÉREO' },
]

export const RECEIPT_STATUS_OPTIONS = [
  { value: '', label: 'Não informado' },
  { value: 'sem_ressalva', label: 'Sem ressalva' },
  { value: 'com_ressalva', label: 'Com ressalva' },
]

const CARGO_TYPE_VALUES = CARGO_TYPE_OPTIONS.map((option) => option.value)
const RECEIPT_STATUS_VALUES = RECEIPT_STATUS_OPTIONS.map((option) => option.value)
const STATUS_VALUES = ['rascunho', 'concluido']
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Campos de texto e numéricos da linha (a ordem espelha as 13 chaves aceitas pelas rules).
const ROW_TEXT_FIELDS = [
  ['po', 'text'],
  ['dbcorpCode', 'text'],
  ['supplierDescription', 'description'],
  ['sqDescription', 'description'],
  ['supplierLot', 'text'],
  ['wmsLabel', 'text'],
  ['sqLabel', 'text'],
]
const ROW_NUMBER_FIELDS = ['quantityKg', 'count', 'packageWeightKg']

// ---------- papéis ----------

export function canEditCargoReport(role) {
  return role === 'admin'
}

export function canConferCargoReport(role) {
  return role === 'admin' || role === 'logistica'
}

export function canOpenCargoReport(role) {
  return role === 'admin' || role === 'logistica'
}

// ---------- linhas ----------

export function createCargoReportRowId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `r-${uuid}`
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyCargoReportRow(id = createCargoReportRowId()) {
  return {
    id,
    po: '',
    dbcorpCode: '',
    supplierDescription: '',
    sqDescription: '',
    supplierLot: '',
    wmsLabel: '',
    sqLabel: '',
    quantityKg: null,
    count: null,
    packageWeightKg: null,
    frozenNetWeightKg: null,
    frozenPackages: null,
  }
}

function clip(value, max) {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

function readText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function readDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value) ? value : ''
}

function readRowId(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  return id.length >= 1 && id.length <= CARGO_REPORT_LIMITS.rowId ? id : createCargoReportRowId()
}

function readLastGenerated(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = ['documentId', 'revision', 'at', 'byId']
  return keys.every((key) => key in value) && Object.keys(value).length === keys.length ? { ...value } : null
}

function normalizeRowFromDoc(raw) {
  const row = createEmptyCargoReportRow(readRowId(raw?.id))
  for (const [field, limit] of ROW_TEXT_FIELDS) {
    row[field] = readText(raw?.[field], CARGO_REPORT_LIMITS[limit])
  }
  row.quantityKg = readNumber(raw?.quantityKg)
  row.packageWeightKg = readNumber(raw?.packageWeightKg)
  row.count = readCount(raw?.count)
  row.frozenNetWeightKg = readNumber(raw?.frozenNetWeightKg)
  row.frozenPackages = readNumber(raw?.frozenPackages)
  return row
}

function sanitizeEnum(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : ''
}

function toDateOrNull(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Form a partir do doc lido. Tolerante: chave ausente ou de tipo errado vira `''`/`null`.
export function fromCargoReportDoc(data) {
  const doc = data && typeof data === 'object' ? data : {}
  const rows = Array.isArray(doc.rows) ? doc.rows.slice(0, CARGO_REPORT_MAX_ROWS) : []

  return {
    revision: Number.isInteger(doc.revision) && doc.revision >= 0 ? doc.revision : 0,
    status: STATUS_VALUES.includes(doc.status) ? doc.status : 'rascunho',
    cargoType: sanitizeEnum(doc.cargoType, CARGO_TYPE_VALUES),
    titleSuffix: readText(doc.titleSuffix, CARGO_REPORT_LIMITS.text),
    rows: rows.map(normalizeRowFromDoc),
    notes: readText(doc.notes, CARGO_REPORT_LIMITS.notes),
    labeledBy: readText(doc.labeledBy, CARGO_REPORT_LIMITS.text),
    labelMadeBy: readText(doc.labelMadeBy, CARGO_REPORT_LIMITS.text),
    nfNumber: readText(doc.nfNumber, CARGO_REPORT_LIMITS.nf),
    receiptStatus: sanitizeEnum(doc.receiptStatus, RECEIPT_STATUS_VALUES),
    receivedDate: readDateKey(doc.receivedDate),
    completedDate: readDateKey(doc.completedDate),
    catalogVersion: Number.isInteger(doc.catalogVersion) && doc.catalogVersion >= 0 ? doc.catalogVersion : 0,
    lastGenerated: readLastGenerated(doc.lastGenerated),
    updatedAt: toDateOrNull(doc.updatedAt),
    updatedByName: readText(doc.updatedByName, CARGO_REPORT_LIMITS.text),
  }
}

// Form NÃO salvo (revision 0), pré-preenchido com os dados do processo.
export function buildInitialCargoReport(process) {
  const category = typeof process?.category === 'string' ? process.category : ''
  const processNumber = clip(process?.processNumber, CARGO_REPORT_LIMITS.text)
  const items = Array.isArray(process?.items) ? process.items.slice(0, CARGO_REPORT_MAX_ROWS) : []

  const rows = items.map((item) => {
    const row = createEmptyCargoReportRow()
    row.po = clip(category === 'CONSOLIDADO' ? item?.poNumber : process?.processNumber, CARGO_REPORT_LIMITS.text)
    row.sqDescription = clip(item?.commercialName, CARGO_REPORT_LIMITS.description)
    const quantity = Number(item?.quantity)
    row.quantityKg = Number.isFinite(quantity) && quantity > 0 ? quantity : null
    return row
  })

  return {
    revision: 0,
    status: 'rascunho',
    cargoType: CARGO_TYPE_VALUES.includes(category) ? category : '',
    titleSuffix: clip(process?.name, CARGO_REPORT_LIMITS.text) || processNumber,
    rows,
    notes: '',
    labeledBy: '',
    labelMadeBy: '',
    nfNumber: '',
    receiptStatus: '',
    receivedDate: '',
    completedDate: '',
    catalogVersion: 0,
    lastGenerated: null,
    updatedAt: null,
    updatedByName: '',
  }
}

// ---------- números ----------

// -> number | null (vazio) | NaN (inválido). Mesmo parser da tabela Item x Emb.
export function parseCargoNumber(text) {
  return parseCatalogWeight(text)
}

// Contagem: inteiro >= 0, senão NaN.
export function parseCargoCount(text) {
  const value = parseCatalogWeight(text)
  if (value === null || Number.isNaN(value)) return value
  return Number.isInteger(value) && value >= 0 ? value : Number.NaN
}

// `decimals` fixa as casas; sem ele vale `minDecimals` (0) até `maxDecimals` (3). `null` -> ''.
export function formatCargoNumber(value, { decimals, minDecimals = 0, maxDecimals = 3 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const minimum = decimals ?? minDecimals
  const maximum = decimals ?? maxDecimals
  return value.toLocaleString('pt-BR', { minimumFractionDigits: minimum, maximumFractionDigits: maximum })
}

// Os campos numéricos ficam como texto durante a edição; aqui viram número ou `null` (vazio/inválido).
function numericOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = parseCargoNumber(value)
    return parsed === null || Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function isBlankNumeric(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

// ---------- fórmulas (espelham o Excel R5) ----------

// `H = G & LEFT(B,3)`. Diferença deliberada: com o lote do fornecedor vazio o resultado é `''`
// (o Excel mostraria só as 3 letras do PO).
export function computeLotSq(supplierLot, po) {
  const lot = String(supplierLot ?? '').trim()
  if (!lot) return ''
  return lot + String(po ?? '').trim().slice(0, 3)
}

// `M = VLOOKUP(C, 'Item x Emb.'!A:D, 4, 0)`. O valor congelado (S4) tem precedência.
export function resolveNetWeightKg(row, catalog) {
  if (typeof row?.frozenNetWeightKg === 'number' && Number.isFinite(row.frozenNetWeightKg)) {
    return row.frozenNetWeightKg
  }
  return getItemPackaging(catalog, row?.dbcorpCode)?.netWeightKg ?? null
}

// `O = K/M`, sem arredondar no dado.
export function computePackages(quantityKg, netWeightKg) {
  const quantity = numericOrNull(quantityKg)
  const net = numericOrNull(netWeightKg)
  if (quantity === null || net === null || quantity === 0 || net === 0) return null
  const result = quantity / net
  return Number.isFinite(result) ? result : null
}

export function deriveCargoReportRow(row, catalog) {
  const netWeightKg = resolveNetWeightKg(row, catalog)
  const frozenPackages =
    typeof row?.frozenPackages === 'number' && Number.isFinite(row.frozenPackages) ? row.frozenPackages : null
  const packages = frozenPackages ?? computePackages(row?.quantityKg, netWeightKg)
  const hasCode = normalizeItemCode(row?.dbcorpCode) !== ''

  return {
    lotSq: computeLotSq(row?.supplierLot, row?.po),
    netWeightKg,
    packages,
    alerts: {
      missingLot: hasCode && String(row?.supplierLot ?? '').trim() === '',
      missingPackageWeight: hasCode && numericOrNull(row?.packageWeightKg) === null,
      noPackaging: hasCode && (getItemPackaging(catalog, row?.dbcorpCode) === null || netWeightKg === null),
    },
  }
}

export function countCargoReportAlerts(rows, catalog) {
  let total = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const { alerts } = deriveCargoReportRow(row, catalog)
    total += Object.values(alerts).filter(Boolean).length
  }
  return total
}

// ---------- payloads ----------

export function isCargoReportRowEmpty(row) {
  return (
    ROW_TEXT_FIELDS.every(([field]) => String(row?.[field] ?? '').trim() === '') &&
    ROW_NUMBER_FIELDS.every((field) => isBlankNumeric(row?.[field]))
  )
}

export function formatCargoReportTitle(titleSuffix) {
  return CARGO_REPORT_TITLE_PREFIX + String(titleSuffix ?? '')
}

function buildPayloadRow(row, errors) {
  const payloadRow = { id: readRowId(row?.id) }
  for (const [field, limit] of ROW_TEXT_FIELDS) {
    payloadRow[field] = clip(row?.[field], CARGO_REPORT_LIMITS[limit])
  }

  const parsers = { quantityKg: parseCargoNumber, packageWeightKg: parseCargoNumber, count: parseCargoCount }
  for (const field of ROW_NUMBER_FIELDS) {
    const raw = row?.[field]
    const parsed = isBlankNumeric(raw) ? null : parsers[field](raw)
    if (Number.isNaN(parsed)) {
      errors.push({ rowId: payloadRow.id, field, message: CARGO_REPORT_INVALID_NUMBER_MESSAGE })
      payloadRow[field] = null
    } else {
      payloadRow[field] = parsed
    }
  }

  payloadRow.frozenNetWeightKg = readNumber(row?.frozenNetWeightKg)
  payloadRow.frozenPackages = readNumber(row?.frozenPackages)
  return payloadRow
}

// -> { payload, errors }. Sem `updatedAt/ById/ByName` (o repositório acrescenta) e sem coluna calculada.
export function buildCargoReportPayload(form, { catalogVersion = 0 } = {}) {
  const errors = []
  const filledRows = (Array.isArray(form?.rows) ? form.rows : []).filter((row) => !isCargoReportRowEmpty(row))
  if (filledRows.length > CARGO_REPORT_MAX_ROWS) {
    errors.push({ field: 'rows', message: CARGO_REPORT_ROWS_LIMIT_MESSAGE })
  }

  const rows = filledRows.slice(0, CARGO_REPORT_MAX_ROWS).map((row) => buildPayloadRow(row, errors))
  const revision = Number.isInteger(form?.revision) && form.revision >= 0 ? form.revision : 0

  const payload = {
    schemaVersion: CARGO_REPORT_SCHEMA_VERSION,
    formCode: CARGO_REPORT_FORM_CODE,
    formRevision: CARGO_REPORT_FORM_REVISION,
    revision: revision + 1,
    status: STATUS_VALUES.includes(form?.status) ? form.status : 'rascunho',
    cargoType: sanitizeEnum(form?.cargoType, CARGO_TYPE_VALUES),
    titleSuffix: clip(form?.titleSuffix, CARGO_REPORT_LIMITS.text),
    rows,
    notes: clip(form?.notes, CARGO_REPORT_LIMITS.notes),
    labeledBy: clip(form?.labeledBy, CARGO_REPORT_LIMITS.text),
    labelMadeBy: clip(form?.labelMadeBy, CARGO_REPORT_LIMITS.text),
    receiptStatus: sanitizeEnum(form?.receiptStatus, RECEIPT_STATUS_VALUES),
    receivedDate: readDateKey(form?.receivedDate),
    completedDate: readDateKey(form?.completedDate),
    nfNumber: clip(form?.nfNumber, CARGO_REPORT_LIMITS.nf),
    catalogVersion: Number.isInteger(catalogVersion) && catalogVersion >= 0 ? catalogVersion : 0,
    lastGenerated: readLastGenerated(form?.lastGenerated),
  }

  return { payload, errors }
}

// S6: o que é da logística no doc `conference`. Coluna nova "da logística" = 1 item aqui + 1 chave
// nas rules (`isValidCargoReportConference`) + a fixture do audit-vault.
// Mapas `{ [rowId]: boolean }` (OK? e contagem OK) e campos de texto por linha (etiquetas WMS e SQ).
export const CONFERENCE_FLAG_MAPS = ['okByRowId', 'countOkByRowId']
export const CONFERENCE_LABEL_FIELDS = ['wms', 'sq']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

// Conferência da logística: poda chaves de linhas que não existem mais, força booleanos e corta
// as etiquetas em 120 caracteres. `labelsByRowId` só guarda linha com alguma etiqueta preenchida.
export function buildConferencePayload({ okByRowId, countOkByRowId, labelsByRowId, checkedByName, revision }, rows) {
  const sources = { okByRowId, countOkByRowId }
  const maps = Object.fromEntries(CONFERENCE_FLAG_MAPS.map((name) => [name, {}]))
  const labels = {}
  const labelSource = isPlainObject(labelsByRowId) ? labelsByRowId : {}

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.id
    if (typeof id !== 'string') continue
    for (const name of CONFERENCE_FLAG_MAPS) {
      const source = isPlainObject(sources[name]) ? sources[name] : {}
      if (hasOwn(source, id)) maps[name][id] = Boolean(source[id])
    }
    const entry = isPlainObject(labelSource[id]) ? labelSource[id] : null
    if (!entry) continue
    const clipped = Object.fromEntries(CONFERENCE_LABEL_FIELDS.map((field) => [field, clip(entry[field], CARGO_REPORT_LIMITS.text)]))
    if (CONFERENCE_LABEL_FIELDS.some((field) => clipped[field] !== '')) labels[id] = clipped
  }

  return {
    schemaVersion: CARGO_REPORT_SCHEMA_VERSION,
    revision: (Number.isInteger(revision) && revision >= 0 ? revision : 0) + 1,
    okByRowId: maps.okByRowId,
    countOkByRowId: maps.countOkByRowId,
    labelsByRowId: labels,
    checkedByName: clip(checkedByName, CARGO_REPORT_LIMITS.text),
  }
}

function readFlagMap(value) {
  const result = {}
  if (isPlainObject(value)) {
    for (const [id, flag] of Object.entries(value)) {
      if (typeof flag === 'boolean') result[id] = flag
    }
  }
  return result
}

function readLabelsMap(value) {
  const result = {}
  if (!isPlainObject(value)) return result
  for (const [id, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue
    result[id] = Object.fromEntries(CONFERENCE_LABEL_FIELDS.map((field) => [field, readText(entry[field], CARGO_REPORT_LIMITS.text)]))
  }
  return result
}

// Conferência anterior à S6 (sem a chave `labelsByRowId`): as etiquetas que o COMEX digitou nas linhas
// do `current` pré-preenchem a tela. A 1ª gravação da conferência as persiste; `count` antigo (número
// de embalagens) não tem tradução para "Contagem OK" e é ignorado.
function labelsFromLegacyRows(legacyRows) {
  const result = {}
  for (const row of Array.isArray(legacyRows) ? legacyRows : []) {
    const id = typeof row?.id === 'string' ? row.id : ''
    if (!id) continue
    const wms = readText(row.wmsLabel, CARGO_REPORT_LIMITS.text)
    const sq = readText(row.sqLabel, CARGO_REPORT_LIMITS.text)
    if (wms || sq) result[id] = { wms, sq }
  }
  return result
}

// Conferência lida do doc (chave órfã é ignorada na leitura pela tela).
export function fromConferenceDoc(data, legacyRows = []) {
  const doc = isPlainObject(data) ? data : {}
  return {
    revision: Number.isInteger(doc.revision) && doc.revision >= 0 ? doc.revision : 0,
    okByRowId: readFlagMap(doc.okByRowId),
    countOkByRowId: readFlagMap(doc.countOkByRowId),
    labelsByRowId: hasOwn(doc, 'labelsByRowId') ? readLabelsMap(doc.labelsByRowId) : labelsFromLegacyRows(legacyRows),
    checkedByName: readText(doc.checkedByName, CARGO_REPORT_LIMITS.text),
    updatedAt: toDateOrNull(doc.updatedAt),
    updatedByName: readText(doc.updatedByName, CARGO_REPORT_LIMITS.text),
  }
}

// ---------- S4: concluir e reabrir ----------

export function canConcludeCargoReport(role) {
  return role === 'admin'
}

// `YYYY-MM-DD` no fuso local (getFullYear/getMonth/getDate): nunca via UTC.
export function toCargoDateKey(date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Congela o peso líquido e o nº de embalagens de cada linha com a tabela vigente. Valor já
// congelado é mantido. `null` quando o item não tem embalagem cadastrada ou falta quantidade.
export function freezeCargoReportRows(rows, catalog) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const frozenNetWeightKg = resolveNetWeightKg(row, catalog)
    const keptPackages = readNumber(row?.frozenPackages)
    return {
      ...row,
      frozenNetWeightKg,
      frozenPackages: keptPackages ?? computePackages(row?.quantityKg, frozenNetWeightKg),
    }
  })
}

// -> { payload, errors }. Mesma validação do rascunho; `lastGenerated` fica como veio (o
// repositório o substitui depois do anexo).
export function buildConcludedCargoReportPayload(form, { catalogVersion = 0, catalog = null, today = '' } = {}) {
  const { payload, errors } = buildCargoReportPayload(
    { ...form, status: 'concluido', completedDate: today },
    { catalogVersion }
  )
  return { payload: { ...payload, rows: freezeCargoReportRows(payload.rows, catalog) }, errors }
}

// Reabrir volta a calcular pela tabela atual: zera os valores congelados e a data de conclusão.
export function buildReopenedCargoReportPayload(form, { catalogVersion = 0 } = {}) {
  const { payload, errors } = buildCargoReportPayload({ ...form, status: 'rascunho', completedDate: '' }, { catalogVersion })
  const rows = payload.rows.map((row) => ({ ...row, frozenNetWeightKg: null, frozenPackages: null }))
  return { payload: { ...payload, rows }, errors }
}
