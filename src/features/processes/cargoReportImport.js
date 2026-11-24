// S5 do Relatório de Carga: importa uma planilha antiga (FR.CMX.001, revisão 5) para
// as linhas do formulário. Módulo puro (sem React, sem firebase): o parser trabalha sobre uma
// matriz de valores e localiza tudo por RÓTULO (cabeçalho por texto, fim da tabela pelo rodapé),
// nunca por posição fixa, porque o usuário insere linhas e o rodapé se desloca nos relatórios reais.
// O único ponto com leitura de arquivo (SheetJS, carregado sob demanda) é `readCargoReportWorkbook`.
// Colunas calculadas (lote SQ, peso líquido por embalagem, nº de embalagens) NÃO são importadas: o Portal
// recalcula com a tabela Item x Emb. atual. OK?, etiquetas WMS/SQ e contagem também não (S6): são da
// conferência da logística; as colunas continuam RECONHECIDAS no cabeçalho, com o valor ignorado.
import { inspectZipExpansion } from '../erp/readDbcorpWorkbook'
import { normalizeItemCode } from './cargoReportCatalog'
import {
  CARGO_REPORT_LIMITS,
  CARGO_REPORT_MAX_ROWS,
  CARGO_TYPE_OPTIONS,
  createCargoReportRowId,
  createEmptyCargoReportRow,
  deriveCargoReportRow,
  parseCargoNumber,
} from './cargoReportFormModel'

export const CARGO_REPORT_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024
export const CARGO_REPORT_IMPORT_MAX_REVISION = 5
export const CARGO_REPORT_IMPORT_SCAN = { headerRows: 40, rows: 300, cols: 30, sheets: 10 }

const NOT_CHANGED = 'Nada foi alterado no formulário.'

// Código -> { title, message }. `message` é texto, ou função quando leva dados do arquivo.
export const CARGO_REPORT_IMPORT_ERRORS = {
  'too-big': {
    title: 'Arquivo grande demais.',
    message: `O limite é 5 MB e um Relatório de Carga costuma ter menos de 200 KB. Confira se escolheu o arquivo certo. ${NOT_CHANGED}`,
  },
  'invalid-format': {
    title: 'Formato inválido.',
    message: `Use o arquivo .xlsx do Relatório de Carga (FR.CMX.001). Arquivos .xls, .csv e PDF não são aceitos. ${NOT_CHANGED}`,
  },
  'zip-bomb': {
    title: 'Arquivo suspeito.',
    message: `O conteúdo descompactado é grande demais para um Relatório de Carga (arquivo corrompido ou malicioso). ${NOT_CHANGED}`,
  },
  'model-not-recognized': {
    title: 'Modelo não reconhecido.',
    message: `Esperado: aba "SQ QUIMICA" com os cabeçalhos do FR.CMX.001 revisão 5. ${NOT_CHANGED}`,
  },
  'missing-columns': {
    title: 'Colunas ausentes.',
    message: (missing) =>
      `Não encontrei ${missing}. O arquivo precisa das colunas PO / PROCESSO, CÓD. DBCORP, DESCRIÇÃO SQ, LOTE FORNECEDOR e QTD (KG). ${NOT_CHANGED}`,
  },
  'too-many-rows': {
    title: 'Linhas demais.',
    message: (total) =>
      `O arquivo tem ${total} linhas preenchidas; o Portal aceita até ${CARGO_REPORT_MAX_ROWS}. Divida em dois relatórios. ${NOT_CHANGED}`,
  },
  'no-rows': {
    title: 'Nenhuma linha preenchida.',
    message: `Não há itens abaixo dos cabeçalhos. ${NOT_CHANGED}`,
  },
  'unsupported-revision': {
    title: 'Revisão não suportada.',
    message: (revision) =>
      `Este arquivo é da revisão ${revision} do FR.CMX.001; o Portal importa apenas a revisão 005. ${NOT_CHANGED}`,
  },
}

function buildFatal(code, detail) {
  const { title, message } = CARGO_REPORT_IMPORT_ERRORS[code]
  return { code, title, message: typeof message === 'function' ? message(detail) : message }
}

// Rótulo "dobrado": sem acento, `º`/`°` -> `o`, NBSP -> espaço, minúsculas, espaços colapsados,
// "A / B" -> "a/b" e sem `:` final.
export function foldCargoLabel(value) {
  if (value === undefined || value === null) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[º°]/g, 'o')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
    .replace(/:$/, '')
    .trim()
}

const startsWithAny = (folded, prefixes) => prefixes.some((prefix) => folded.startsWith(prefix))

// Primeiro casamento vence; cada `key` é usada uma vez por cabeçalho. A ordem importa:
// `lotSq` antes de `supplierLot`/`sqLabel` e `packages` antes de `quantityKg`.
export const CARGO_REPORT_IMPORT_COLUMNS = [
  {
    key: 'po',
    label: 'PO / PROCESSO',
    required: true,
    imported: true,
    match: (folded) => ['po/processo', 'po', 'processo', 'pedido'].includes(folded),
  },
  {
    key: 'dbcorpCode',
    label: 'CÓD. DBCORP',
    required: true,
    imported: true,
    match: (folded) => folded.includes('dbcorp') || ['cod.', 'codigo', 'cod'].includes(folded),
  },
  {
    key: 'supplierDescription',
    label: 'DESCRIÇÃO FORNECEDOR',
    required: false,
    imported: true,
    match: (folded) => folded.startsWith('descricao') && folded.includes('fornec'),
  },
  {
    key: 'sqDescription',
    label: 'DESCRIÇÃO SQ',
    required: true,
    imported: true,
    match: (folded) => folded.startsWith('descricao sq'),
  },
  { key: 'ok', label: 'OK?', required: false, imported: false, match: (folded) => folded === 'ok?' || folded === 'ok' },
  {
    key: 'lotSq',
    label: 'LOTE SQ',
    required: false,
    imported: false,
    match: (folded) => folded.startsWith('lote sq'),
  },
  {
    key: 'supplierLot',
    label: 'LOTE FORNECEDOR',
    required: true,
    imported: true,
    match: (folded) => folded.startsWith('lote') && folded.includes('fornec'),
  },
  {
    key: 'wmsLabel',
    label: 'ETIQUETA WMS',
    required: false,
    imported: false,
    match: (folded) => folded.includes('etiqueta') && folded.includes('wms'),
  },
  {
    key: 'sqLabel',
    label: 'ETIQUETA SQ',
    required: false,
    imported: false,
    match: (folded) => folded.includes('etiqueta') && (folded.endsWith(' sq') || folded.includes(' sq ')),
  },
  {
    key: 'packages',
    label: 'Nº DE EMB.',
    required: false,
    imported: false,
    match: (folded) => startsWithAny(folded, ['no de emb', 'n de emb', 'qtd de emb']),
  },
  {
    key: 'quantityKg',
    label: 'QTD (KG)',
    required: true,
    imported: true,
    match: (folded) => startsWithAny(folded, ['qtd', 'quantidade']),
  },
  {
    key: 'count',
    label: 'CONTAGEM',
    required: false,
    imported: false,
    match: (folded) => folded.startsWith('contagem'),
  },
  {
    key: 'netWeight',
    label: 'PESO LIQ POR EMB.',
    required: false,
    imported: false,
    match: (folded) => folded.startsWith('peso liq'),
  },
  {
    key: 'packageWeightKg',
    label: 'PESO DA EMB. (KG)',
    required: false,
    imported: true,
    match: (folded) => startsWithAny(folded, ['peso da emb', 'peso emb', 'tara']),
  },
]

const TEXT_FIELDS = {
  po: 'text',
  dbcorpCode: 'text',
  supplierDescription: 'description',
  sqDescription: 'description',
  supplierLot: 'text',
}
const NUMBER_PARSERS = { quantityKg: parseCargoNumber, packageWeightKg: parseCargoNumber }
const CHECKED_TEXTS = ['x', 'sim', 'true', 'verdadeiro', '✓', '✔']
const FOOTER_PREFIXES = ['observacoes', 'responsaveis', 'status do recebimento']
const REVISION_PATTERN = /revis[aã]o\s*:?\s*0*(\d{1,3})/i

// Coluna 0-based -> letra do Excel (A, B, ..., Z, AA, ...).
function columnLetter(index) {
  let value = index + 1
  let letters = ''
  while (value > 0) {
    const rest = (value - 1) % 26
    letters = String.fromCharCode(65 + rest) + letters
    value = Math.floor((value - 1) / 26)
  }
  return letters
}

function columnIndex(letters) {
  let value = 0
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64)
  return value - 1
}

function emptyParse(fatal = null) {
  return {
    fatal,
    headerRow: 0,
    headerRange: '',
    sourceRevision: null,
    cargoType: '',
    cargoTypeRead: false,
    rows: [],
    warnings: [],
    missingOptional: [],
  }
}

function isBlankCell(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return true
  if (typeof value === 'string') return value.replace(/\u00a0/g, ' ').trim() === ''
  return false
}

function readCellText(value, max) {
  if (typeof value === 'boolean' || value === undefined || value === null) return ''
  return String(value)
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// Cabeçalho = linha, entre as primeiras `headerRows`, com MAIS colunas reconhecidas.
function locateHeader(matrix) {
  const limit = Math.min(matrix.length, CARGO_REPORT_IMPORT_SCAN.headerRows)
  let best = null

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : []
    const columns = {}
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const folded = foldCargoLabel(row[colIndex])
      if (!folded) continue
      const column = CARGO_REPORT_IMPORT_COLUMNS.find((item) => !(item.key in columns) && item.match(folded))
      if (column) columns[column.key] = colIndex
    }
    const found = Object.keys(columns).length
    if (found > 0 && (!best || found > best.found)) best = { rowIndex, columns, found }
  }

  return best && best.found >= 3 ? best : null
}

function readSourceRevision(matrix, headerIndex) {
  for (let rowIndex = 0; rowIndex < headerIndex; rowIndex += 1) {
    for (const cell of Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : []) {
      if (typeof cell !== 'string') continue
      const match = REVISION_PATTERN.exec(cell.normalize('NFC'))
      if (match) return Number(match[1])
    }
  }
  return null
}

function isChecked(value) {
  return value === true || (typeof value === 'string' && CHECKED_TEXTS.includes(foldCargoLabel(value)))
}

// Tipo de carga: rótulo (FCL/LCL/CONSOLIDADO/AÉREO) com a célula IMEDIATAMENTE abaixo marcada.
function readCargoType(matrix, headerIndex) {
  const marked = new Set()
  for (let rowIndex = 0; rowIndex + 1 < headerIndex; rowIndex += 1) {
    const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : []
    const below = Array.isArray(matrix[rowIndex + 1]) ? matrix[rowIndex + 1] : []
    row.forEach((cell, colIndex) => {
      const folded = foldCargoLabel(cell)
      if (!folded) return
      const option = CARGO_TYPE_OPTIONS.find((item) => foldCargoLabel(item.value) === folded)
      if (option && isChecked(below[colIndex])) marked.add(option.value)
    })
  }
  return marked.size === 1 ? { cargoType: [...marked][0], cargoTypeRead: true } : { cargoType: '', cargoTypeRead: false }
}

function isFooterRow(row) {
  return (Array.isArray(row) ? row : []).some((cell) => {
    const folded = foldCargoLabel(cell)
    return folded !== '' && startsWithAny(folded, FOOTER_PREFIXES)
  })
}

// `matrix`: valores já sem erros de fórmula. `firstRow`/`firstCol`: linha e coluna do Excel da
// posição [0][0] (para mensagens e `headerRange`).
export function parseCargoReportMatrix(matrix, { firstRow = 1, firstCol = 0 } = {}) {
  const source = Array.isArray(matrix) ? matrix : []
  const header = locateHeader(source)
  if (!header) return emptyParse(buildFatal('model-not-recognized'))

  const { columns, rowIndex: headerIndex } = header
  const headerRow = firstRow + headerIndex
  const positions = Object.values(columns)
  const headerRange = `${columnLetter(firstCol + Math.min(...positions))}${headerRow}:${columnLetter(
    firstCol + Math.max(...positions)
  )}${headerRow}`

  const sourceRevision = readSourceRevision(source, headerIndex)
  if (sourceRevision !== null && sourceRevision > CARGO_REPORT_IMPORT_MAX_REVISION) {
    return { ...emptyParse(buildFatal('unsupported-revision', String(sourceRevision).padStart(3, '0'))), headerRow, headerRange, sourceRevision }
  }

  const missingRequired = CARGO_REPORT_IMPORT_COLUMNS.filter((item) => item.required && !(item.key in columns)).map(
    (item) => item.label
  )
  if (missingRequired.length > 0) {
    return { ...emptyParse(buildFatal('missing-columns', missingRequired.join(', '))), headerRow, headerRange, sourceRevision }
  }
  const missingOptional = CARGO_REPORT_IMPORT_COLUMNS.filter(
    (item) => item.imported && !item.required && !(item.key in columns)
  ).map((item) => item.label)

  const rows = []
  const warnings = []
  let filledRows = 0

  for (let rowIndex = headerIndex + 1; rowIndex < source.length; rowIndex += 1) {
    const cells = Array.isArray(source[rowIndex]) ? source[rowIndex] : []
    if (isFooterRow(cells)) break

    const importedColumns = CARGO_REPORT_IMPORT_COLUMNS.filter((item) => item.imported && item.key in columns)
    if (importedColumns.every((item) => isBlankCell(cells[columns[item.key]]))) continue

    filledRows += 1
    if (filledRows > CARGO_REPORT_MAX_ROWS) continue

    const excelRow = firstRow + rowIndex
    const row = createEmptyCargoReportRow(createCargoReportRowId())
    for (const item of importedColumns) {
      const raw = cells[columns[item.key]]
      if (item.key in TEXT_FIELDS) {
        const max = CARGO_REPORT_LIMITS[TEXT_FIELDS[item.key]]
        row[item.key] =
          item.key === 'dbcorpCode' ? normalizeItemCode(readCellText(raw, max)).slice(0, max) : readCellText(raw, max)
        continue
      }

      const parsed = isBlankCell(raw) ? null : NUMBER_PARSERS[item.key](raw)
      if (parsed === null) continue
      if (Number.isNaN(parsed) || parsed < 0) {
        const shown = String(raw).trim().slice(0, 40)
        warnings.push({
          row: excelRow,
          message: `Linha ${excelRow}: ${item.label} inválido ("${shown}"); ficou vazio.`,
        })
        continue
      }
      row[item.key] = parsed
    }
    rows.push(row)
  }

  const cargoType = readCargoType(source, headerIndex)
  const base = { headerRow, headerRange, sourceRevision, ...cargoType, missingOptional }
  if (filledRows > CARGO_REPORT_MAX_ROWS) {
    return { ...emptyParse(buildFatal('too-many-rows', filledRows)), ...base }
  }
  if (filledRows === 0) return { ...emptyParse(buildFatal('no-rows')), ...base }

  return { ...emptyParse(), ...base, rows, warnings }
}

// Mesma regra de alertas do formulário (falta lote, falta peso da embalagem, sem embalagem cadastrada).
export function countCargoReportImportAlerts(rows, catalog) {
  let total = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    total += Object.values(deriveCargoReportRow(row, catalog).alerts).filter(Boolean).length
  }
  return total
}

// Troca as linhas do rascunho (ids novos) e o tipo de carga, se estava marcado no arquivo.
// Todo o resto do formulário fica como está; nada é gravado aqui.
export function applyCargoReportImport(form, imported) {
  return {
    ...form,
    rows: imported.rows.map((row) => ({ ...row, id: createCargoReportRowId() })),
    cargoType: imported.cargoTypeRead ? imported.cargoType : form.cargoType,
  }
}

// Objeto de aba do SheetJS -> matriz de valores (sem `sheet_to_json`: controle explícito de erros de
// fórmula e de `!ref` inflado). Corta em `maxRows` x `maxCols` a partir do início do `!ref`.
export function buildCargoReportSheetMatrix(sheet, { maxRows, maxCols } = {}) {
  const limitRows = maxRows ?? CARGO_REPORT_IMPORT_SCAN.rows
  const limitCols = maxCols ?? CARGO_REPORT_IMPORT_SCAN.cols
  const empty = { matrix: [], firstRow: 1, firstCol: 0 }
  const ref = typeof sheet?.['!ref'] === 'string' ? /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(sheet['!ref']) : null
  if (!ref) return empty

  const startCol = columnIndex(ref[1])
  const startRow = Number(ref[2])
  const endCol = ref[3] ? columnIndex(ref[3]) : startCol
  const endRow = ref[4] ? Number(ref[4]) : startRow
  const firstCol = Math.min(startCol, endCol)
  const firstRow = Math.min(startRow, endRow)
  const lastCol = Math.min(Math.max(startCol, endCol), firstCol + limitCols - 1)
  const lastRow = Math.min(Math.max(startRow, endRow), firstRow + limitRows - 1)

  const matrix = []
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const values = []
    for (let col = firstCol; col <= lastCol; col += 1) {
      const cell = sheet[`${columnLetter(col)}${rowNumber}`]
      if (!cell || cell.t === 'e') values.push('')
      else if (cell.t === 'b') values.push(Boolean(cell.v))
      else values.push(cell.v === undefined || cell.v === null ? '' : cell.v)
    }
    matrix.push(values)
  }
  return { matrix, firstRow, firstCol }
}

async function toBytes(file) {
  if (file && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  if (file && typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'))
      reader.readAsArrayBuffer(file)
    })
  }
  throw new Error('Falha ao ler o arquivo.')
}

function hasZipSignature(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

const SKIPPED_SHEET = 'item x emb.'
const TARGET_SHEET = 'sq quimica'

function parseSheet(workbook, name) {
  const { matrix, firstRow, firstCol } = buildCargoReportSheetMatrix(workbook.Sheets?.[name], {
    maxRows: CARGO_REPORT_IMPORT_SCAN.rows,
    maxCols: CARGO_REPORT_IMPORT_SCAN.cols,
  })
  return parseCargoReportMatrix(matrix, { firstRow, firstCol })
}

// Escolhe a aba: "SQ QUIMICA"; senão a primeira (exceto "Item x Emb.") que tenha o cabeçalho do modelo.
function pickSheet(workbook) {
  const names = (Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : []).slice(0, CARGO_REPORT_IMPORT_SCAN.sheets)

  const named = names.find((name) => foldCargoLabel(name) === TARGET_SHEET)
  if (named !== undefined) return { sheetName: named, ...parseSheet(workbook, named) }

  for (const name of names) {
    if (foldCargoLabel(name) === SKIPPED_SHEET) continue
    const result = parseSheet(workbook, name)
    const code = result.fatal?.code
    if (code !== 'model-not-recognized' && code !== 'missing-columns') return { sheetName: name, ...result }
  }
  return { sheetName: '', ...emptyParse(buildFatal('model-not-recognized')) }
}

// Lê o .xlsx escolhido. NUNCA lança para falha esperada: devolve `fatal` ({ code, title, message }).
export async function readCargoReportWorkbook(file) {
  const fileName = typeof file?.name === 'string' ? file.name : ''
  const early = (code, size = file?.size) => ({
    ...emptyParse(buildFatal(code)),
    fileName,
    fileSize: typeof size === 'number' ? size : 0,
    sheetName: '',
  })

  if (typeof file?.size === 'number' && file.size > CARGO_REPORT_IMPORT_MAX_FILE_BYTES) return early('too-big')

  const bytes = await toBytes(file)
  if (bytes.byteLength > CARGO_REPORT_IMPORT_MAX_FILE_BYTES) return early('too-big', bytes.byteLength)
  if (!hasZipSignature(bytes)) return early('invalid-format', bytes.byteLength)

  // Antes do `read`: o SheetJS descompacta tudo de uma vez.
  const inspection = inspectZipExpansion(bytes)
  if (!inspection.ok) {
    const isBomb = ['zip64', 'acima_do_limite', 'taxa_de_expansao'].includes(inspection.reason)
    return early(isBomb ? 'zip-bomb' : 'invalid-format', bytes.byteLength)
  }

  let workbook
  try {
    const { read } = await import('xlsx')
    workbook = read(bytes, { type: 'array', cellDates: false })
  } catch {
    return early('invalid-format', bytes.byteLength)
  }

  return { fileName, fileSize: bytes.byteLength, ...pickSheet(workbook) }
}
