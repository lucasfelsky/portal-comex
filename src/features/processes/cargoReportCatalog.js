// S2 do Relatório de Carga: tabela mestra "Item x Emb." (aba do FR.CMX.001 rev. 005).
// Módulo puro (sem React, sem firebase): leitura da aba, normalização, validação, diff e o
// lookup `getItemPackaging` que a S3 consome. O único ponto com `import('xlsx')` (dinâmico) é
// `readItemPackagingWorkbook`; o doc gravado fica em `cargoReportCatalog/itemPackaging`.
//
// ATENÇÃO: o reparo de mojibake NÃO é aplicado à descrição. Descrições legítimas da planilha real
// (EMULSÃO, ORGÂNICO, TITÂNIO) casam o padrão de mojibake e seriam "consertadas" por engano.
import { inspectZipExpansion } from '../erp/readDbcorpWorkbook'

export const ITEM_PACKAGING_SHEET_NAME = 'Item x Emb.'
export const ITEM_PACKAGING_SCHEMA_VERSION = 1
export const ITEM_PACKAGING_MAX_ITEMS = 5000
export const ITEM_PACKAGING_MAX_FILE_BYTES = 5 * 1024 * 1024
export const ITEM_PACKAGING_MAX_DOC_BYTES = 900000
export const ITEM_PACKAGING_LIMITS = {
  code: 32,
  description: 200,
  packagingType: 40,
  maxWeightKg: 100000,
}

export const ITEM_PACKAGING_INVALID_FILE_MESSAGE =
  'Arquivo inválido: use um .xlsx com a aba "Item x Emb." e as colunas ITEM, DESCRIÇÃO, TIPO EMB. e PESO LIQ / POR EMB.'
export const ITEM_PACKAGING_FILE_TOO_BIG_MESSAGE =
  'Arquivo maior que 5 MB. Exporte só a aba "Item x Emb." e tente de novo.'
export const ITEM_PACKAGING_DOC_TOO_BIG_MESSAGE =
  'A tabela ficaria grande demais para o Portal (limite ~900 KB).'
const ITEM_PACKAGING_EXPANSION_MESSAGE =
  'Arquivo grande demais depois de descompactado. Exporte só a aba "Item x Emb." e tente de novo.'

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,31}$/
const DOC_METADATA_MARGIN_BYTES = 1024
const MAX_SHEETS_TO_SCAN = 20
const NBSP_PATTERN = /\u00a0/g

function emptyText(value) {
  return value === undefined || value === null
}

export function normalizeItemCode(value) {
  if (emptyText(value)) return ''
  return String(value).replace(NBSP_PATTERN, ' ').trim().toUpperCase()
}

export function normalizeCatalogText(value) {
  if (emptyText(value)) return ''
  return String(value).normalize('NFC').replace(NBSP_PATTERN, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizePackagingType(value) {
  return normalizeCatalogText(value).toLocaleUpperCase('pt-BR')
}

function roundWeight(number) {
  return Math.round(number * 1000) / 1000
}

// -> number | null (vazio) | NaN (inválido). Aceita "12,5", "1.000", "1.350,5", "12.5" e "5 kg".
export function parseCatalogWeight(value) {
  if (emptyText(value)) return null
  if (typeof value === 'number') return Number.isFinite(value) ? roundWeight(value) : Number.NaN

  const text = String(value)
    .replace(NBSP_PATTERN, ' ')
    .trim()
    .replace(/kg$/i, '')
    .replace(/\s+/g, '')
  if (text === '') return null

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    return roundWeight(Number(text.replace(/\./g, '').replace(',', '.')))
  }
  if (/^\d+(,\d+)?$/.test(text)) return roundWeight(Number(text.replace(',', '.')))
  if (/^\d+(\.\d+)?$/.test(text)) return roundWeight(Number(text))

  return Number.NaN
}

// Rótulo "dobrado": minúsculas, sem acento, espaços (inclusive quebra de linha) colapsados.
function foldLabel(value) {
  if (emptyText(value)) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function locateColumns(row) {
  if (!Array.isArray(row)) return null
  const columns = { code: -1, description: -1, packagingType: -1, weight: -1 }

  row.forEach((cell, index) => {
    const label = foldLabel(cell)
    if (!label) return
    if (columns.code < 0 && label === 'item') columns.code = index
    else if (columns.description < 0 && label === 'descricao') columns.description = index
    else if (
      columns.packagingType < 0 &&
      (label === 'tipo emb.' || label === 'tipo emb' || label === 'tipo de embalagem')
    ) {
      columns.packagingType = index
    } else if (columns.weight < 0 && label.startsWith('peso liq')) columns.weight = index
  })

  return Object.values(columns).every((index) => index >= 0) ? columns : null
}

function firstNonEmptyRow(rows) {
  if (!Array.isArray(rows)) return null
  return rows.find((row) => Array.isArray(row) && row.some((cell) => normalizeCatalogText(cell) !== '')) ?? null
}

// -> nome da aba | null. 1º pelo nome ("Item x Emb."); senão a 1ª cujo cabeçalho é reconhecido.
export function findItemPackagingSheet(sheetNames, headerRowsBySheet = {}) {
  const names = Array.isArray(sheetNames) ? sheetNames : []
  const target = foldLabel(ITEM_PACKAGING_SHEET_NAME)
  const byName = names.find((name) => foldLabel(name) === target)
  if (byName !== undefined) return byName

  // O valor de cada aba pode ser a linha de cabeçalho ou a lista de linhas lidas do topo.
  const headerOf = (name) => {
    const value = headerRowsBySheet?.[name]
    return Array.isArray(value) && Array.isArray(value[0]) ? firstNonEmptyRow(value) : value
  }
  const byHeader = names.find((name) => locateColumns(headerOf(name)) !== null)
  return byHeader ?? null
}

function emptyStats() {
  return { rows: 0, withPackaging: 0, withoutPackaging: 0, packagingTypes: {} }
}

function rawCellText(value) {
  return emptyText(value) ? '' : String(value).trim()
}

export function summarizeItemPackaging(items) {
  const summary = { withPackaging: 0, withoutPackaging: 0 }
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.packagingType && item?.netWeightKg !== null && item?.netWeightKg !== undefined) {
      summary.withPackaging += 1
    } else {
      summary.withoutPackaging += 1
    }
  }
  return summary
}

// `matrix`: sheet_to_json(header: 1); índice + 1 = linha do Excel.
// -> { items, errors: [{ row, code, message }], warnings: [...], stats, fatal }
export function parseItemPackagingMatrix(matrix) {
  const result = { items: [], errors: [], warnings: [], stats: emptyStats(), fatal: '' }
  const rows = Array.isArray(matrix) ? matrix : []

  const headerIndex = rows.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => normalizeCatalogText(cell) !== '')
  )
  const columns = headerIndex >= 0 ? locateColumns(rows[headerIndex]) : null
  if (!columns) {
    result.fatal = ITEM_PACKAGING_INVALID_FILE_MESSAGE
    return result
  }

  const firstRowByCode = new Map()

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    if (!Array.isArray(row)) continue

    const excelRow = index + 1
    const code = normalizeItemCode(row[columns.code])
    const description = normalizeCatalogText(row[columns.description])
    const packagingType = normalizePackagingType(row[columns.packagingType])
    const rawWeight = row[columns.weight]
    const weight = parseCatalogWeight(rawWeight)
    const hasWeightCell = rawCellText(rawWeight) !== ''

    if (!code && !description && !packagingType && !hasWeightCell) continue

    result.stats.rows += 1
    const rowErrors = []
    const addError = (message) => rowErrors.push({ row: excelRow, code, message })

    if (!code) {
      addError('código vazio')
    } else if (!CODE_PATTERN.test(code)) {
      addError(`código inválido: "${code}" (use letras, números e . _ / -, até ${ITEM_PACKAGING_LIMITS.code} caracteres, sem espaços)`)
    } else if (firstRowByCode.has(code)) {
      addError(`código repetido: ${code} (já na linha ${firstRowByCode.get(code)})`)
    }

    if (Number.isNaN(weight)) {
      addError(`peso inválido: "${rawCellText(rawWeight)}" (use número, ex. 12,5)`)
    } else if (weight !== null && (weight <= 0 || weight > ITEM_PACKAGING_LIMITS.maxWeightKg)) {
      addError(
        `peso fora do limite: "${rawCellText(rawWeight)}" (use um valor maior que 0 e até ${ITEM_PACKAGING_LIMITS.maxWeightKg.toLocaleString('pt-BR')} kg)`
      )
    }

    if (description.length > ITEM_PACKAGING_LIMITS.description) {
      addError(`descrição longa demais (${description.length} caracteres; máximo ${ITEM_PACKAGING_LIMITS.description})`)
    }
    if (packagingType.length > ITEM_PACKAGING_LIMITS.packagingType) {
      addError(`tipo de embalagem longo demais (${packagingType.length} caracteres; máximo ${ITEM_PACKAGING_LIMITS.packagingType})`)
    }

    if (rowErrors.length > 0) {
      result.errors.push(...rowErrors)
      continue
    }

    firstRowByCode.set(code, excelRow)

    const netWeightKg = weight === null ? null : weight
    result.items.push({ code, description, packagingType, netWeightKg })

    if (packagingType && netWeightKg === null) {
      result.warnings.push({ row: excelRow, code, message: 'tipo de embalagem preenchido sem peso' })
    } else if (!packagingType && netWeightKg !== null) {
      result.warnings.push({ row: excelRow, code, message: 'peso preenchido sem tipo de embalagem' })
    }
    if (!description) {
      result.warnings.push({ row: excelRow, code, message: 'descrição vazia' })
    }
    if (packagingType) {
      result.stats.packagingTypes[packagingType] = (result.stats.packagingTypes[packagingType] ?? 0) + 1
    }
  }

  const summary = summarizeItemPackaging(result.items)
  result.stats.withPackaging = summary.withPackaging
  result.stats.withoutPackaging = summary.withoutPackaging

  if (result.stats.rows > ITEM_PACKAGING_MAX_ITEMS) {
    result.fatal = `A planilha tem mais de ${ITEM_PACKAGING_MAX_ITEMS.toLocaleString('pt-BR')} itens.`
  }

  return result
}

const DIFF_FIELDS = ['description', 'packagingType', 'netWeightKg']

function toCatalogItem(item) {
  return {
    code: normalizeItemCode(item?.code),
    description: typeof item?.description === 'string' ? item.description : '',
    packagingType: typeof item?.packagingType === 'string' ? item.packagingType : '',
    netWeightKg: typeof item?.netWeightKg === 'number' && Number.isFinite(item.netWeightKg) ? item.netWeightKg : null,
  }
}

// Comparação por código normalizado; a ordem segue `nextItems` (novos/alterados) e `currentItems` (removidos).
export function diffItemPackagingCatalogs(currentItems, nextItems) {
  const current = new Map()
  for (const raw of Array.isArray(currentItems) ? currentItems : []) {
    const item = toCatalogItem(raw)
    if (item.code && !current.has(item.code)) current.set(item.code, item)
  }

  const diff = { added: [], changed: [], removed: [], unchanged: 0 }
  const seen = new Set()

  for (const raw of Array.isArray(nextItems) ? nextItems : []) {
    const after = toCatalogItem(raw)
    if (!after.code || seen.has(after.code)) continue
    seen.add(after.code)

    const before = current.get(after.code)
    if (!before) {
      diff.added.push(after.code)
      continue
    }

    const fields = DIFF_FIELDS.filter((field) => before[field] !== after[field])
    if (fields.length === 0) diff.unchanged += 1
    else diff.changed.push({ code: after.code, fields, before, after })
  }

  for (const code of current.keys()) {
    if (!seen.has(code)) diff.removed.push(code)
  }

  return diff
}

function utf8Bytes(text) {
  return new TextEncoder().encode(text).length
}

// Estimativa pela regra de tamanho de documento do Firestore (nome do campo + 1; string = UTF-8 + 1;
// número 8; null 1; +32 por mapa) mais uma margem fixa para os metadados do doc.
export function estimateItemPackagingDocBytes(items) {
  let total = DOC_METADATA_MARGIN_BYTES + 'items'.length + 1

  for (const item of Array.isArray(items) ? items : []) {
    total += 32
    total += 'code'.length + 1 + utf8Bytes(String(item?.code ?? '')) + 1
    total += 'description'.length + 1 + utf8Bytes(String(item?.description ?? '')) + 1
    total += 'packagingType'.length + 1 + utf8Bytes(String(item?.packagingType ?? '')) + 1
    total += 'netWeightKg'.length + 1 + (typeof item?.netWeightKg === 'number' ? 8 : 1)
  }

  return total
}

export function buildItemPackagingIndex(items) {
  const index = new Map()
  for (const raw of Array.isArray(items) ? items : []) {
    const item = toCatalogItem(raw)
    if (item.code && !index.has(item.code)) index.set(item.code, item)
  }
  return index
}

const indexCache = new WeakMap()

function resolveIndex(catalog) {
  if (catalog instanceof Map) return catalog
  const items = Array.isArray(catalog) ? catalog : catalog?.items
  if (!Array.isArray(items)) return null

  let index = indexCache.get(items)
  if (!index) {
    index = buildItemPackagingIndex(items)
    indexCache.set(items, index)
  }
  return index
}

// Contrato consumido pela S3. `catalog`: `{ items }`, array ou Map(code -> item).
// -> { code, description, packagingType, netWeightKg } | null (`netWeightKg: null` = sem peso cadastrado).
export function getItemPackaging(catalog, code) {
  const index = resolveIndex(catalog)
  const key = normalizeItemCode(code)
  if (!index || !key) return null

  const item = index.get(key)
  return item ? toCatalogItem(item) : null
}

export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Este navegador não permite calcular o hash do arquivo (exige conexão segura, HTTPS).')
  }
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  const digest = await subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function toBytes(file) {
  if (file && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  if (file && typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error(ITEM_PACKAGING_INVALID_FILE_MESSAGE))
      reader.readAsArrayBuffer(file)
    })
  }
  throw new Error(ITEM_PACKAGING_INVALID_FILE_MESSAGE)
}

function hasZipSignature(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

function buildFatalResult(fatal, meta) {
  return { items: [], errors: [], warnings: [], stats: emptyStats(), fatal, ...meta, estimatedBytes: 0 }
}

// Lê a aba "Item x Emb." de um .xlsx. Rejeita (throw) arquivo > 5 MB ou que não seja .xlsx;
// problemas de conteúdo voltam em `fatal`/`errors` para a prévia.
export async function readItemPackagingWorkbook(file) {
  const sourceFileName = typeof file?.name === 'string' ? file.name : ''
  if (typeof file?.size === 'number' && file.size > ITEM_PACKAGING_MAX_FILE_BYTES) {
    throw new Error(ITEM_PACKAGING_FILE_TOO_BIG_MESSAGE)
  }

  const bytes = await toBytes(file)
  if (bytes.byteLength > ITEM_PACKAGING_MAX_FILE_BYTES) throw new Error(ITEM_PACKAGING_FILE_TOO_BIG_MESSAGE)
  if (!hasZipSignature(bytes)) throw new Error(ITEM_PACKAGING_INVALID_FILE_MESSAGE)

  // Antes do `read`: o SheetJS descompacta tudo de uma vez.
  const inspection = inspectZipExpansion(bytes)
  if (!inspection.ok) {
    throw new Error(
      inspection.reason === 'zip_invalido' ? ITEM_PACKAGING_INVALID_FILE_MESSAGE : ITEM_PACKAGING_EXPANSION_MESSAGE
    )
  }

  const sourceSha256 = await sha256Hex(bytes)
  const { read, utils } = await import('xlsx')
  const workbook = read(bytes, { type: 'array', cellDates: false })
  const toMatrix = (sheet) => utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', range: 0 })

  const sheetNames = workbook.SheetNames ?? []
  let sheetName = findItemPackagingSheet(sheetNames)
  if (sheetName === null) {
    const headerRows = {}
    for (const name of sheetNames.slice(0, MAX_SHEETS_TO_SCAN)) {
      headerRows[name] = firstNonEmptyRow(toMatrix(workbook.Sheets[name]))
    }
    sheetName = findItemPackagingSheet(sheetNames, headerRows)
  }

  const meta = { sourceFileName, sourceSheetName: sheetName ?? '', sourceSha256 }
  if (sheetName === null) return buildFatalResult(ITEM_PACKAGING_INVALID_FILE_MESSAGE, meta)

  const parsed = parseItemPackagingMatrix(toMatrix(workbook.Sheets[sheetName]))
  const estimatedBytes = estimateItemPackagingDocBytes(parsed.items)
  const fatal =
    parsed.fatal || (estimatedBytes > ITEM_PACKAGING_MAX_DOC_BYTES ? ITEM_PACKAGING_DOC_TOO_BIG_MESSAGE : '')

  return { ...parsed, fatal, ...meta, estimatedBytes }
}
