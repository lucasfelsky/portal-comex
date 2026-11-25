import { inspectZipExpansion } from '../erp/readDbcorpWorkbook'
import {
  ITEM_PACKAGING_LIMITS,
  ITEM_PACKAGING_MAX_DOC_BYTES,
  ITEM_PACKAGING_MAX_FILE_BYTES,
  ITEM_PACKAGING_MAX_ITEMS,
  getItemPackaging,
  normalizeCatalogText,
  normalizeItemCode,
  normalizePackagingType,
  parseCatalogWeight,
} from './cargoReportCatalog'

// S9-D do Relatório de Carga: embalagens por item + fornecedor (doc `cargoReportCatalog/supplierPackaging`).
// Módulo puro (sem React nem firebase; o único `import('xlsx')` é dinâmico, em `readSupplierPackagingWorkbook`).
//
// Entrada do cadastro: { code, supplierKey, supplierName, packagingType, netWeightKg, packageWeightKg }.
// `supplierKey = ''` é o PADRÃO do item: só a tara padrão; tipo e peso líquido do padrão continuam vindo da tabela
// Item x Emb. (`itemPackaging`). Busca em 3 níveis (`resolveCargoPackaging`): item + fornecedor; padrão do item;
// nada. O fornecedor é reconhecido pelo nome normalizado (`normalizeSupplierKey`) e "juntar nomes" grava `aliases`
// (um nível, sem ciclo).

export const SUPPLIER_PACKAGING_SCHEMA_VERSION = 1
export const SUPPLIER_PACKAGING_MAX_ENTRIES = ITEM_PACKAGING_MAX_ITEMS
export const SUPPLIER_PACKAGING_MAX_ALIASES = 1000
export const SUPPLIER_PACKAGING_MAX_DOC_BYTES = ITEM_PACKAGING_MAX_DOC_BYTES
export const SUPPLIER_PACKAGING_LIMITS = { ...ITEM_PACKAGING_LIMITS, supplierName: 160 }

export const SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE =
  'Arquivo inválido: use um .xlsx com as colunas ITEM, FORNECEDOR, TIPO EMB., PESO LÍQ. (KG) e PESO DA EMB. (KG).'
export const SUPPLIER_PACKAGING_DOC_TOO_BIG_MESSAGE = 'O cadastro ficaria grande demais para o Portal (limite ~900 KB).'
export const SUPPLIER_PACKAGING_TOO_MANY_MESSAGE = `O cadastro passaria de ${SUPPLIER_PACKAGING_MAX_ENTRIES.toLocaleString('pt-BR')} embalagens.`

// Mesmo padrão de código da tabela Item x Emb. (S2).
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,31}$/
const DOC_METADATA_MARGIN_BYTES = 1024
const MAX_SHEETS_TO_SCAN = 20
const PREFERRED_SHEET = 'embalagens por fornecedor'

function emptyValue(value) {
  return value === undefined || value === null
}

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// ---------- fornecedor: nome normalizado e "juntar nomes" ----------

// Sem acento, MAIÚSCULAS, tudo que não é A-Z/0-9 vira espaço, espaços colapsados. Não remove sufixos (LTD, CO, INC).
export function normalizeSupplierKey(name) {
  if (emptyValue(name)) return ''
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

// Aliases válidos (as duas chaves em texto, diferentes entre si), sem repetir `fromKey`.
function sanitizeAliases(aliases) {
  const seen = new Set()
  const result = []
  for (const alias of Array.isArray(aliases) ? aliases : []) {
    const fromKey = textOf(alias?.fromKey)
    const toKey = textOf(alias?.toKey)
    if (!fromKey || !toKey || fromKey === toKey || seen.has(fromKey)) continue
    seen.add(fromKey)
    result.push({ fromKey, toKey })
  }
  return result
}

const aliasMapCache = new WeakMap()

function aliasMapOf(aliases) {
  if (!Array.isArray(aliases)) return new Map()
  let map = aliasMapCache.get(aliases)
  if (!map) {
    map = new Map(sanitizeAliases(aliases).map((alias) => [alias.fromKey, alias.toKey]))
    aliasMapCache.set(aliases, map)
  }
  return map
}

// Chave do nome que vale: o nome normalizado, seguindo os aliases até um nome que não aponta para outro.
// Protegido contra ciclo (dado corrompido): para ao repetir um nome.
export function canonicalSupplierKey(key, aliases) {
  let current = normalizeSupplierKey(key)
  if (!current) return ''
  const map = aliasMapOf(aliases)
  const seen = new Set()
  while (map.has(current) && !seen.has(current)) {
    seen.add(current)
    current = map.get(current)
  }
  return current
}

// "Juntar nomes": `fromKeys` passam a valer como `toKey`. Um nível: quem apontava para um nome juntado passa a
// apontar para o destino, e o destino nunca é origem de alias (sem ciclo). -> aliases novos (nunca muta).
export function joinSupplierNames(aliases, fromKeys, toKey) {
  let next = sanitizeAliases(aliases)
  const target = canonicalSupplierKey(toKey, next)
  if (!target) return next

  for (const raw of Array.isArray(fromKeys) ? fromKeys : []) {
    const from = canonicalSupplierKey(raw, next)
    if (!from || from === target) continue
    next = next.map((alias) => (alias.toKey === from ? { ...alias, toKey: target } : alias))
    next.push({ fromKey: from, toKey: target })
  }
  return sanitizeAliases(next)
}

function firstWord(key) {
  return key.split(' ')[0] ?? ''
}

// Sugestão de nomes parecidos: mesma 1ª palavra com 4 letras ou mais. SÓ sugestão (quem junta é o admin).
// `keys`: chaves normalizadas. -> [{ word, keys: [...] }] com 2 nomes ou mais, em ordem alfabética.
export function suggestSimilarSuppliers(keys) {
  const groups = new Map()
  for (const raw of Array.isArray(keys) ? keys : []) {
    const key = normalizeSupplierKey(raw)
    const word = firstWord(key)
    if (word.length < 4) continue
    if (!groups.has(word)) groups.set(word, new Set())
    groups.get(word).add(key)
  }
  return [...groups.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([word, set]) => ({ word, keys: [...set].sort() }))
    .sort((a, b) => a.word.localeCompare(b.word))
}

// ---------- entradas ----------

function toEntry(raw) {
  return {
    code: normalizeItemCode(raw?.code),
    supplierKey: textOf(raw?.supplierKey),
    supplierName: textOf(raw?.supplierName),
    packagingType: textOf(raw?.packagingType),
    netWeightKg: numberOrNull(raw?.netWeightKg),
    packageWeightKg: numberOrNull(raw?.packageWeightKg),
  }
}

export function supplierPackagingEntryId(entry) {
  return `${normalizeItemCode(entry?.code)}|${textOf(entry?.supplierKey)}`
}

// Troca a entrada de mesmo código + fornecedor ou acrescenta no fim. -> lista nova.
export function withSupplierPackagingEntry(entries, entry) {
  const list = Array.isArray(entries) ? entries : []
  const id = supplierPackagingEntryId(entry)
  const index = list.findIndex((item) => supplierPackagingEntryId(item) === id)
  if (index < 0) return [...list, toEntry(entry)]
  return list.map((item, position) => (position === index ? toEntry(entry) : item))
}

const indexCache = new WeakMap()

// Índices do cadastro: por código + fornecedor canônico (a entrada com a chave exata vence a que só chega por alias)
// e padrão por código. Guardado por objeto do cadastro (a leitura devolve objetos novos a cada gravação).
function indexOf(supplierCatalog) {
  if (!supplierCatalog || typeof supplierCatalog !== 'object') return null
  let index = indexCache.get(supplierCatalog)
  if (index) return index

  const aliases = supplierCatalog.aliases
  const suppliers = new Map()
  const defaults = new Map()
  for (const raw of Array.isArray(supplierCatalog.entries) ? supplierCatalog.entries : []) {
    const entry = toEntry(raw)
    if (!entry.code) continue
    if (entry.supplierKey === '') {
      if (!defaults.has(entry.code)) defaults.set(entry.code, entry)
      continue
    }
    const canonical = canonicalSupplierKey(entry.supplierKey, aliases)
    if (!canonical) continue
    const id = `${entry.code}|${canonical}`
    const exact = normalizeSupplierKey(entry.supplierKey) === canonical
    const held = suppliers.get(id)
    if (!held || (exact && !held.exact)) suppliers.set(id, { entry, exact })
  }
  index = { suppliers, defaults }
  indexCache.set(supplierCatalog, index)
  return index
}

// Busca em 3 níveis (ordem do mock aprovado):
//   1º entrada do item + fornecedor; 2º padrão do item = tabela Item x Emb. + tara de `entries[code, '']`; 3º `null`.
// -> { packagingType, netWeightKg, packageWeightKg, via: 'supplier' | 'default' } | null.
// `netWeightKg: null` = o item existe mas sem peso cadastrado (a tela trata como "Sem embalagem cadastrada").
export function resolveCargoPackaging(code, supplierName, { itemCatalog = null, supplierCatalog = null } = {}) {
  const normalizedCode = normalizeItemCode(code)
  if (!normalizedCode) return null

  const index = indexOf(supplierCatalog)
  const supplierKey = index ? canonicalSupplierKey(supplierName, supplierCatalog.aliases) : ''
  if (index && supplierKey) {
    const found = index.suppliers.get(`${normalizedCode}|${supplierKey}`)?.entry
    if (found) {
      return {
        packagingType: found.packagingType,
        netWeightKg: found.netWeightKg,
        packageWeightKg: found.packageWeightKg,
        via: 'supplier',
      }
    }
  }

  const item = getItemPackaging(itemCatalog, normalizedCode)
  if (!item) return null
  return {
    packagingType: item.packagingType,
    netWeightKg: item.netWeightKg,
    packageWeightKg: index?.defaults.get(normalizedCode)?.packageWeightKg ?? null,
    via: 'default',
  }
}

// Contexto de uma linha para `deriveCargoReportRow`. `packaging` = { supplierCatalog, supplierNameByRowId }.
export function cargoPackagingContext(packaging, rowId) {
  if (!packaging) return undefined
  return {
    supplierCatalog: packaging.supplierCatalog ?? null,
    supplierName: packaging.supplierNameByRowId?.[rowId] ?? '',
  }
}

// ---------- validação de uma entrada (diálogos) ----------

function checkWeight(raw, { required, label }) {
  const weight = parseCatalogWeight(raw)
  if (weight === null) return required ? { error: `Informe o ${label}.` } : { value: null }
  if (Number.isNaN(weight)) return { error: `${label[0].toUpperCase()}${label.slice(1)} inválido (use número, ex. 12,5).` }
  if (weight <= 0 || weight > ITEM_PACKAGING_LIMITS.maxWeightKg) {
    return {
      error: `${label[0].toUpperCase()}${label.slice(1)} fora do limite (maior que 0 e até ${ITEM_PACKAGING_LIMITS.maxWeightKg.toLocaleString('pt-BR')} kg).`,
    }
  }
  return { value: weight }
}

// Entrada de um fornecedor (tipo e peso líquido obrigatórios; tara opcional). -> { entry, errors }
// `errors`: { code?, supplierName?, packagingType?, netWeightKg?, packageWeightKg? } (vazio = válida).
export function buildSupplierPackagingEntry(input) {
  const errors = {}
  const code = normalizeItemCode(input?.code)
  if (!code) errors.code = 'Informe o código do item.'
  else if (!CODE_PATTERN.test(code)) errors.code = 'Código inválido (letras, números e . _ / -, sem espaços).'

  const supplierName = normalizeCatalogText(input?.supplierName)
  const supplierKey = normalizeSupplierKey(supplierName)
  if (!supplierKey) errors.supplierName = 'Informe o fornecedor.'
  else if (supplierName.length > SUPPLIER_PACKAGING_LIMITS.supplierName) errors.supplierName = 'Nome do fornecedor longo demais.'

  const packagingType = normalizePackagingType(input?.packagingType)
  if (!packagingType) errors.packagingType = 'Informe o tipo da embalagem.'
  else if (packagingType.length > ITEM_PACKAGING_LIMITS.packagingType) errors.packagingType = 'Tipo longo demais.'

  const net = checkWeight(input?.netWeightKg, { required: true, label: 'peso líquido' })
  if (net.error) errors.netWeightKg = net.error
  const tare = checkWeight(input?.packageWeightKg, { required: false, label: 'peso da embalagem' })
  if (tare.error) errors.packageWeightKg = tare.error

  const entry = {
    code,
    supplierKey,
    supplierName,
    packagingType,
    netWeightKg: net.value ?? null,
    packageWeightKg: tare.value ?? null,
  }
  return { entry, errors }
}

// ---------- importação de planilha ----------

function foldLabel(value) {
  if (emptyValue(value)) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function locateColumns(row) {
  if (!Array.isArray(row)) return null
  const columns = { code: -1, supplier: -1, packagingType: -1, net: -1, tare: -1 }
  row.forEach((cell, index) => {
    const label = foldLabel(cell)
    if (!label) return
    if (columns.code < 0 && label === 'item') columns.code = index
    else if (columns.supplier < 0 && label === 'fornecedor') columns.supplier = index
    else if (
      columns.packagingType < 0 &&
      (label === 'tipo emb.' || label === 'tipo emb' || label === 'tipo de embalagem' || label === 'tipo')
    ) {
      columns.packagingType = index
    } else if (columns.net < 0 && label.startsWith('peso liq')) columns.net = index
    else if (columns.tare < 0 && (label.startsWith('peso da emb') || label.startsWith('peso emb') || label === 'tara')) {
      columns.tare = index
    }
  })
  return Object.values(columns).every((index) => index >= 0) ? columns : null
}

function rawCellText(value) {
  return emptyValue(value) ? '' : String(value).trim()
}

function hasText(row) {
  return Array.isArray(row) && row.some((cell) => normalizeCatalogText(cell) !== '')
}

// `matrix`: sheet_to_json(header: 1); índice + 1 = linha do Excel.
// -> { entries, errors: [{ row, code, message }], warnings: [...], stats: { rows, suppliers, defaults }, fatal }
export function parseSupplierPackagingMatrix(matrix) {
  const result = { entries: [], errors: [], warnings: [], stats: { rows: 0, suppliers: 0, defaults: 0 }, fatal: '' }
  const rows = Array.isArray(matrix) ? matrix : []
  const headerIndex = rows.findIndex(hasText)
  const columns = headerIndex >= 0 ? locateColumns(rows[headerIndex]) : null
  if (!columns) {
    result.fatal = SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE
    return result
  }

  const firstRowById = new Map()

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    if (!Array.isArray(row)) continue

    const excelRow = index + 1
    const code = normalizeItemCode(row[columns.code])
    const supplierName = normalizeCatalogText(row[columns.supplier])
    const packagingType = normalizePackagingType(row[columns.packagingType])
    const rawNet = row[columns.net]
    const rawTare = row[columns.tare]
    const net = parseCatalogWeight(rawNet)
    const tare = parseCatalogWeight(rawTare)
    const hasNetCell = rawCellText(rawNet) !== ''
    const hasTareCell = rawCellText(rawTare) !== ''

    if (!code && !supplierName && !packagingType && !hasNetCell && !hasTareCell) continue

    result.stats.rows += 1
    const rowErrors = []
    const addError = (message) => rowErrors.push({ row: excelRow, code, message })
    const supplierKey = normalizeSupplierKey(supplierName)
    const isDefault = supplierName === ''

    if (!code) addError('código vazio')
    else if (!CODE_PATTERN.test(code)) {
      addError(`código inválido: "${code}" (use letras, números e . _ / -, até ${ITEM_PACKAGING_LIMITS.code} caracteres, sem espaços)`)
    }
    if (!isDefault && !supplierKey) addError(`fornecedor inválido: "${supplierName}" (use letras ou números)`)
    else if (supplierName.length > SUPPLIER_PACKAGING_LIMITS.supplierName) {
      addError(`fornecedor longo demais (${supplierName.length} caracteres; máximo ${SUPPLIER_PACKAGING_LIMITS.supplierName})`)
    }

    const checkWeightCell = (value, raw, label) => {
      if (Number.isNaN(value)) addError(`${label} inválido: "${rawCellText(raw)}" (use número, ex. 12,5)`)
      else if (value !== null && (value <= 0 || value > ITEM_PACKAGING_LIMITS.maxWeightKg)) {
        addError(
          `${label} fora do limite: "${rawCellText(raw)}" (use um valor maior que 0 e até ${ITEM_PACKAGING_LIMITS.maxWeightKg.toLocaleString('pt-BR')} kg)`
        )
      }
    }
    checkWeightCell(net, rawNet, 'peso líquido')
    checkWeightCell(tare, rawTare, 'peso da embalagem')

    if (packagingType.length > ITEM_PACKAGING_LIMITS.packagingType) {
      addError(`tipo de embalagem longo demais (${packagingType.length} caracteres; máximo ${ITEM_PACKAGING_LIMITS.packagingType})`)
    }

    if (isDefault) {
      if (tare === null) addError('padrão do item (fornecedor vazio) precisa do peso da embalagem')
    } else {
      if (!packagingType) addError('linha de fornecedor precisa do tipo da embalagem')
      if (net === null) addError('linha de fornecedor precisa do peso líquido')
    }

    const id = `${code}|${supplierKey}`
    if (code && firstRowById.has(id)) {
      addError(`${isDefault ? 'padrão do item' : 'item e fornecedor'} repetido: ${code}${isDefault ? '' : ` · ${supplierName}`} (já na linha ${firstRowById.get(id)})`)
    }

    if (rowErrors.length > 0) {
      result.errors.push(...rowErrors)
      continue
    }
    firstRowById.set(id, excelRow)

    if (isDefault) {
      if (packagingType || net !== null) {
        result.warnings.push({
          row: excelRow,
          code,
          message: 'tipo e peso líquido do padrão foram ignorados (valem os da tabela Item x Emb.)',
        })
      }
      result.entries.push({ code, supplierKey: '', supplierName: '', packagingType: '', netWeightKg: null, packageWeightKg: tare })
      result.stats.defaults += 1
    } else {
      if (tare === null) result.warnings.push({ row: excelRow, code, message: 'sem peso da embalagem' })
      result.entries.push({ code, supplierKey, supplierName, packagingType, netWeightKg: net, packageWeightKg: tare })
      result.stats.suppliers += 1
    }
  }

  if (result.stats.rows > SUPPLIER_PACKAGING_MAX_ENTRIES) {
    result.fatal = SUPPLIER_PACKAGING_TOO_MANY_MESSAGE
  }
  return result
}

const DIFF_FIELDS = ['supplierName', 'packagingType', 'netWeightKg', 'packageWeightKg']

// Comparação por código + fornecedor. -> { added: [entry], changed: [{ id, code, supplierKey, fields, before, after }],
// removed: [entry], unchanged }. A ordem segue `next` (novos/alterados) e `current` (removidos).
export function diffSupplierPackaging(currentEntries, nextEntries) {
  const current = new Map()
  for (const raw of Array.isArray(currentEntries) ? currentEntries : []) {
    const entry = toEntry(raw)
    const id = supplierPackagingEntryId(entry)
    if (entry.code && !current.has(id)) current.set(id, entry)
  }

  const diff = { added: [], changed: [], removed: [], unchanged: 0 }
  const seen = new Set()
  for (const raw of Array.isArray(nextEntries) ? nextEntries : []) {
    const after = toEntry(raw)
    const id = supplierPackagingEntryId(after)
    if (!after.code || seen.has(id)) continue
    seen.add(id)

    const before = current.get(id)
    if (!before) {
      diff.added.push(after)
      continue
    }
    const fields = DIFF_FIELDS.filter((field) => before[field] !== after[field])
    if (fields.length === 0) diff.unchanged += 1
    else diff.changed.push({ id, code: after.code, supplierKey: after.supplierKey, fields, before, after })
  }
  for (const [id, entry] of current) {
    if (!seen.has(id)) diff.removed.push(entry)
  }
  return diff
}

function utf8Bytes(text) {
  return new TextEncoder().encode(text).length
}

// Estimativa pela regra de tamanho de documento do Firestore (mesma régua da tabela Item x Emb.).
export function estimateSupplierPackagingDocBytes(entries, aliases = []) {
  let total = DOC_METADATA_MARGIN_BYTES + 'entries'.length + 1 + 'aliases'.length + 1
  for (const item of Array.isArray(entries) ? entries : []) {
    total += 32
    total += 'code'.length + 1 + utf8Bytes(textOf(item?.code)) + 1
    total += 'supplierKey'.length + 1 + utf8Bytes(textOf(item?.supplierKey)) + 1
    total += 'supplierName'.length + 1 + utf8Bytes(textOf(item?.supplierName)) + 1
    total += 'packagingType'.length + 1 + utf8Bytes(textOf(item?.packagingType)) + 1
    total += 'netWeightKg'.length + 1 + (typeof item?.netWeightKg === 'number' ? 8 : 1)
    total += 'packageWeightKg'.length + 1 + (typeof item?.packageWeightKg === 'number' ? 8 : 1)
  }
  for (const alias of Array.isArray(aliases) ? aliases : []) {
    total += 32
    total += 'fromKey'.length + 1 + utf8Bytes(textOf(alias?.fromKey)) + 1
    total += 'toKey'.length + 1 + utf8Bytes(textOf(alias?.toKey)) + 1
  }
  return total
}

// Mensagem de teto (entradas, aliases, bytes) ou '' quando cabe. Usada antes de gravar.
export function checkSupplierPackagingLimits(entries, aliases = []) {
  if ((entries?.length ?? 0) > SUPPLIER_PACKAGING_MAX_ENTRIES) return SUPPLIER_PACKAGING_TOO_MANY_MESSAGE
  if ((aliases?.length ?? 0) > SUPPLIER_PACKAGING_MAX_ALIASES) {
    return `O cadastro passaria de ${SUPPLIER_PACKAGING_MAX_ALIASES.toLocaleString('pt-BR')} nomes juntados.`
  }
  if (estimateSupplierPackagingDocBytes(entries, aliases) > SUPPLIER_PACKAGING_MAX_DOC_BYTES) {
    return SUPPLIER_PACKAGING_DOC_TOO_BIG_MESSAGE
  }
  return ''
}

// ---------- leitura do .xlsx ----------

async function toBytes(file) {
  if (file && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  if (file && typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error(SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE))
      reader.readAsArrayBuffer(file)
    })
  }
  throw new Error(SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE)
}

function hasZipSignature(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

const FILE_TOO_BIG_MESSAGE = 'Arquivo maior que 5 MB. Exporte só a aba das embalagens e tente de novo.'
const EXPANSION_MESSAGE = 'Arquivo grande demais depois de descompactado. Exporte só a aba das embalagens e tente de novo.'

// Lê a 1ª aba reconhecida (a de nome "Embalagens por fornecedor" primeiro). Arquivo > 5 MB ou que não seja .xlsx
// rejeita (throw); problemas de conteúdo voltam em `fatal`/`errors` para a prévia.
export async function readSupplierPackagingWorkbook(file) {
  const sourceFileName = typeof file?.name === 'string' ? file.name : ''
  if (typeof file?.size === 'number' && file.size > ITEM_PACKAGING_MAX_FILE_BYTES) throw new Error(FILE_TOO_BIG_MESSAGE)

  const bytes = await toBytes(file)
  if (bytes.byteLength > ITEM_PACKAGING_MAX_FILE_BYTES) throw new Error(FILE_TOO_BIG_MESSAGE)
  if (!hasZipSignature(bytes)) throw new Error(SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE)

  // Antes do `read`: o SheetJS descompacta tudo de uma vez.
  const inspection = inspectZipExpansion(bytes)
  if (!inspection.ok) {
    throw new Error(inspection.reason === 'zip_invalido' ? SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE : EXPANSION_MESSAGE)
  }

  const { read, utils } = await import('xlsx')
  const workbook = read(bytes, { type: 'array', cellDates: false })
  const toMatrix = (sheet) => utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', range: 0 })
  const names = (workbook.SheetNames ?? []).slice(0, MAX_SHEETS_TO_SCAN)
  const ordered = [...names.filter((name) => foldLabel(name) === PREFERRED_SHEET), ...names.filter((name) => foldLabel(name) !== PREFERRED_SHEET)]

  for (const name of ordered) {
    const matrix = toMatrix(workbook.Sheets[name])
    const header = matrix.find(hasText)
    if (!locateColumns(header)) continue
    const parsed = parseSupplierPackagingMatrix(matrix)
    const estimatedBytes = estimateSupplierPackagingDocBytes(parsed.entries)
    const fatal = parsed.fatal || (estimatedBytes > SUPPLIER_PACKAGING_MAX_DOC_BYTES ? SUPPLIER_PACKAGING_DOC_TOO_BIG_MESSAGE : '')
    return { ...parsed, fatal, sourceFileName, sourceSheetName: name, estimatedBytes }
  }
  return {
    entries: [],
    errors: [],
    warnings: [],
    stats: { rows: 0, suppliers: 0, defaults: 0 },
    fatal: SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE,
    sourceFileName,
    sourceSheetName: '',
    estimatedBytes: 0,
  }
}

// ---------- tabela do admin (linhas por item) ----------

// Linhas da tabela "Embalagens por item e fornecedor": um item por código (união da tabela Item x Emb. e do
// cadastro por fornecedor), na ordem do código. `defaultPackaging`: tipo e peso líquido da tabela Item x Emb. e a
// tara do padrão; `registered` = tem tipo e peso líquido. `suppliers`: entradas do item, em ordem de nome.
export function buildSupplierPackagingRows({ itemCatalog = null, supplierCatalog = null } = {}) {
  const items = Array.isArray(itemCatalog?.items) ? itemCatalog.items : []
  const entries = Array.isArray(supplierCatalog?.entries) ? supplierCatalog.entries : []
  const byCode = new Map()

  const rowOf = (code) => {
    if (!byCode.has(code)) {
      byCode.set(code, {
        code,
        description: '',
        defaultPackaging: { packagingType: '', netWeightKg: null, packageWeightKg: null, registered: false },
        suppliers: [],
      })
    }
    return byCode.get(code)
  }

  for (const raw of items) {
    const code = normalizeItemCode(raw?.code)
    if (!code) continue
    const row = rowOf(code)
    const packagingType = textOf(raw?.packagingType)
    const netWeightKg = numberOrNull(raw?.netWeightKg)
    row.description = textOf(raw?.description)
    row.defaultPackaging = { ...row.defaultPackaging, packagingType, netWeightKg, registered: Boolean(packagingType) && netWeightKg !== null }
  }
  for (const raw of entries) {
    const entry = toEntry(raw)
    if (!entry.code) continue
    const row = rowOf(entry.code)
    if (entry.supplierKey === '') row.defaultPackaging = { ...row.defaultPackaging, packageWeightKg: entry.packageWeightKg }
    else row.suppliers.push(entry)
  }

  const rows = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
  for (const row of rows) row.suppliers.sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'pt-BR'))
  return rows
}

// Filtros da tabela: 'all' | 'supplier' (item com fornecedor) | 'none' (item sem embalagem cadastrada) + busca por
// código, descrição ou fornecedor.
export function filterSupplierPackagingRows(rows, filter = 'all', query = '') {
  const term = foldLabel(query)
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (filter === 'supplier' && row.suppliers.length === 0) return false
    if (filter === 'none' && row.defaultPackaging.registered) return false
    if (!term) return true
    return (
      foldLabel(row.code).includes(term) ||
      foldLabel(row.description).includes(term) ||
      row.suppliers.some((entry) => foldLabel(entry.supplierName).includes(term))
    )
  })
}

// Nomes de fornecedor do cadastro, agrupados pelo nome que vale (aliases aplicados).
// -> [{ key, name, entryCount, joined: [{ fromKey, name }] }] em ordem de nome.
export function buildSupplierNameList(supplierCatalog) {
  const entries = Array.isArray(supplierCatalog?.entries) ? supplierCatalog.entries : []
  const aliases = supplierCatalog?.aliases
  const groups = new Map()
  const namesByKey = new Map()

  for (const raw of entries) {
    const entry = toEntry(raw)
    if (!entry.supplierKey) continue
    if (!namesByKey.has(entry.supplierKey)) namesByKey.set(entry.supplierKey, entry.supplierName || entry.supplierKey)
    const key = canonicalSupplierKey(entry.supplierKey, aliases)
    if (!groups.has(key)) groups.set(key, { key, entryCount: 0, members: new Set() })
    const group = groups.get(key)
    group.entryCount += 1
    group.members.add(entry.supplierKey)
  }

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      name: namesByKey.get(group.key) ?? group.key,
      entryCount: group.entryCount,
      joined: [...group.members]
        .filter((member) => member !== group.key)
        .map((member) => ({ fromKey: member, name: namesByKey.get(member) ?? member })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

// Tipos de embalagem para o select do cadastro rápido: os já usados nas duas tabelas (mais usados primeiro) e,
// no fim, os de sempre que ainda não apareceram.
export const DEFAULT_PACKAGING_TYPES = ['TAMBOR', 'BOMBONA', 'IBC', 'BALDE', 'SACO']

export function collectPackagingTypes({ itemCatalog = null, supplierCatalog = null } = {}) {
  const counts = new Map()
  const count = (value) => {
    const type = normalizePackagingType(value)
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  for (const item of Array.isArray(itemCatalog?.items) ? itemCatalog.items : []) count(item?.packagingType)
  for (const entry of Array.isArray(supplierCatalog?.entries) ? supplierCatalog.entries : []) count(entry?.packagingType)

  const used = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([type]) => type)
  return [...used, ...DEFAULT_PACKAGING_TYPES.filter((type) => !counts.has(type))]
}
