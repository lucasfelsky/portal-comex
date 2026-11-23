// Pre-visualizacao simplificada de planilhas anexadas (Relatorio de carga, S1).
//
// Modulo PURO (sem React, sem firebase). A unica porta de entrada do SheetJS e'
// `readSpreadsheetPreview` (import() dinamico do `xlsx`, chunk `spreadsheet`):
// nenhum import estatico do pacote xlsx aqui, para o bundle principal nao pagar
// o custo da biblioteca.
//
// O SheetJS CE nao le estilos nem imagens: a pre-visualizacao NUNCA mostra cores,
// logo ou fontes do modelo (o dialogo avisa; o arquivo original vem do "Baixar").
//
// Duas formas de leitura:
//   - Modelo FR.CMX.001 (reconhecido pela coluna "PO / PROCESSO"): colunas do
//     cabecalho do modelo, so as linhas PREENCHIDAS do corpo (ate "OBSERVACOES")
//     e cartoes do cabecalho (No da DI, tipo de carga, status e data de
//     recebimento) quando as celulas existirem.
//   - Qualquer outra planilha: primeira linha de texto vira cabecalho (se tiver
//     >= 2 colunas); senao as colunas ficam A, B, C...

export const PREVIEW_MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024
export const PREVIEW_MAX_ROWS = 200
export const PREVIEW_MAX_COLS = 30

// Tetos de varredura: um `!ref` gigante (arquivo malicioso ou planilha formatada
// ate a ultima linha) nao pode travar a aba.
const MAX_SCAN_ROWS = 10000
const MAX_SCAN_COLS = 200
const MAX_META_ROWS = 200

const SHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
])
const SHEET_EXTENSIONS = new Set(['xlsx', 'xls', 'csv'])
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

function extensionOf(name) {
  const text = String(name ?? '').trim().toLowerCase()
  const dot = text.lastIndexOf('.')
  return dot === -1 ? '' : text.slice(dot + 1)
}

// 'sheet' (xlsx/xls/csv) | 'pdf' | 'image' | '' (sem pre-visualizacao).
export function getDocumentPreviewKind(mimeType, name) {
  const mime = String(mimeType ?? '').split(';')[0].trim().toLowerCase()
  const ext = extensionOf(name)
  if (SHEET_MIMES.has(mime)) return 'sheet'
  if (mime === 'application/pdf') return 'pdf'
  if (IMAGE_MIMES.has(mime)) return 'image'
  if (SHEET_EXTENSIONS.has(ext)) return 'sheet'
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return ''
}

// minusculas, sem acento, espacos colapsados.
function foldLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function collapseSpaces(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

// Formato de data do Excel (ignora trechos entre aspas/colchetes/escapes).
function isDateFormat(format) {
  if (typeof format !== 'string') return false
  const cleaned = format.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
  return /[dy]/i.test(cleaned)
}

// Serial do Excel -> `dd/mm/aaaa` (+ ` HH:MM` quando ha fracao). So getters UTC:
// o serial nao tem fuso, e `toISOString` nunca entra aqui.
function formatExcelSerial(serial) {
  if (!Number.isFinite(serial)) return ''
  const wholeDays = Math.floor(serial)
  const date = new Date(Date.UTC(1899, 11, 30) + wholeDays * 86400000)
  if (Number.isNaN(date.getTime())) return ''
  let text = `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`
  const fraction = serial - wholeDays
  if (fraction > 0) {
    const minutes = Math.round(fraction * 24 * 60)
    text += ` ${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`
  }
  return text
}

// Celula do SheetJS -> { text, kind, checked? }.
//   kind: 'text' | 'number' | 'bool' | 'error' | 'empty'
// Erros (#N/A, #DIV/0! das formulas das linhas vazias do modelo) viram texto vazio.
function describeCell(cell) {
  if (!cell || cell.t === 'z') return { text: '', kind: 'empty' }
  if (cell.t === 'e') return { text: '', kind: 'error' }
  if (cell.t === 'b') {
    const checked = Boolean(cell.v)
    return { text: checked ? 'Sim' : 'Não', kind: 'bool', checked }
  }
  if (cell.t === 'n' && typeof cell.v === 'number' && isDateFormat(cell.z)) {
    return { text: formatExcelSerial(cell.v), kind: 'number' }
  }
  const raw = cell.w != null ? cell.w : cell.v
  const text = raw == null ? '' : String(raw).replace(/\u00a0/g, ' ').trim()
  return { text, kind: cell.t === 'n' ? 'number' : 'text' }
}

function isBlank(info) {
  return info.kind === 'empty' || info.kind === 'error' || info.text === ''
}

// `'SQ QUIMICA'!$B$2:$O$40` -> { s, e } (ou null).
function parseAreaRef(ref, utils) {
  const first = String(ref ?? '').split(',')[0]
  const afterSheet = first.slice(first.lastIndexOf('!') + 1).replace(/\$/g, '')
  if (!afterSheet) return null
  try {
    const range = utils.decode_range(afterSheet)
    return Number.isFinite(range?.s?.r) && Number.isFinite(range?.e?.r) ? range : null
  } catch {
    return null
  }
}

function resolveRange(workbook, sheet, sheetIndex, utils) {
  const names = workbook?.Workbook?.Names ?? []
  const printArea = names.find(
    (entry) => entry?.Name === '_xlnm.Print_Area' && entry?.Sheet === sheetIndex
  )
  const fromPrintArea = printArea ? parseAreaRef(printArea.Ref, utils) : null
  if (fromPrintArea) return fromPrintArea
  return sheet?.['!ref'] ? utils.decode_range(sheet['!ref']) : null
}

function emptyPreview(sheets, sheetIndex) {
  return {
    sheets,
    sheetIndex,
    meta: [],
    columns: [],
    rows: [],
    totalRows: 0,
    truncatedRows: false,
    truncatedCols: false,
    recognizedModel: false,
  }
}

const META_FIELDS = [
  { key: 'di', label: 'Nº DA DI', pattern: /^n[º°o]?\.?\s*da\s+di\s*:?\s*(.*)$/i, mode: 'inline' },
  { key: 'cargoType', label: 'TIPO DE CARGA', pattern: /^tipo\s+de\s+carga\s*:?\s*(.*)$/i, mode: 'checkbox' },
  {
    key: 'receiptStatus',
    label: 'STATUS DO RECEBIMENTO',
    pattern: /^status\s+do\s+recebimento\s*:?\s*(.*)$/i,
    mode: 'checkbox',
    sentenceCase: true,
  },
  {
    key: 'receivedDate',
    label: 'DATA RECEBIMENTO',
    pattern: /^data\s+(?:de\s+)?recebimento\s*:?\s*(.*)$/i,
    mode: 'inline',
  },
]

function toSentenceCase(text) {
  const lower = String(text).toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Cartoes do cabecalho do modelo FR.CMX.001. So aparecem os que tiverem valor.
function extractMeta(readCell, range) {
  const found = {}
  const lastRow = Math.min(range.e.r, range.s.r + MAX_META_ROWS)
  const lastCol = Math.min(range.e.c, range.s.c + MAX_SCAN_COLS)

  for (let r = range.s.r; r <= lastRow; r += 1) {
    for (let c = range.s.c; c <= lastCol; c += 1) {
      const info = describeCell(readCell(r, c))
      if (info.kind !== 'text' || info.text === '') continue
      for (const field of META_FIELDS) {
        if (found[field.key]) continue
        const match = field.pattern.exec(info.text)
        if (!match) continue
        let value = collapseSpaces(match[1])

        if (!value && field.mode === 'checkbox') {
          // Opcoes na mesma linha, caixa de selecao (booleano) na linha de baixo.
          const checked = []
          for (let cc = c + 1; cc <= lastCol; cc += 1) {
            const option = describeCell(readCell(r, cc))
            if (option.kind !== 'text' || option.text === '') continue
            const box = describeCell(readCell(r + 1, cc))
            if (box.kind === 'bool' && box.checked) checked.push(collapseSpaces(option.text))
          }
          value = checked.join(' / ')
          if (value && field.sentenceCase) value = toSentenceCase(value)
        }

        if (!value && field.mode === 'inline') {
          // Valor na celula IMEDIATAMENTE a direita (so ela: no modelo a DI ocupa a
          // faixa mesclada B5:M5 e a celula N5 e' "REVISAO: 005", nao o valor).
          const next = describeCell(readCell(r, c + 1))
          if (!isBlank(next) && next.kind !== 'bool' && !/:\s*$/.test(next.text)) {
            value = collapseSpaces(next.text)
          }
        }

        if (value) found[field.key] = { key: field.key, label: field.label, value }
      }
    }
  }

  return META_FIELDS.map((field) => found[field.key]).filter(Boolean)
}

const MODEL_ANCHOR = 'po / processo'

// Procura a celula "PO / PROCESSO" (cabecalho do modelo) nas primeiras linhas.
function findModelHeader(readCell, range) {
  const lastRow = Math.min(range.e.r, range.s.r + 60)
  const lastCol = Math.min(range.e.c, range.s.c + MAX_SCAN_COLS)
  for (let r = range.s.r; r <= lastRow; r += 1) {
    for (let c = range.s.c; c <= lastCol; c += 1) {
      const info = describeCell(readCell(r, c))
      if (info.kind === 'text' && foldLabel(info.text) === MODEL_ANCHOR) return { r, c }
    }
  }
  return null
}

// Planilha fora do modelo: a primeira linha nao vazia e' cabecalho se tiver
// >= 2 celulas preenchidas e todas forem texto.
function findGenericHeader(readCell, range) {
  const lastRow = Math.min(range.e.r, range.s.r + MAX_SCAN_ROWS)
  const lastCol = Math.min(range.e.c, range.s.c + MAX_SCAN_COLS)
  for (let r = range.s.r; r <= lastRow; r += 1) {
    let filled = 0
    let allText = true
    for (let c = range.s.c; c <= lastCol; c += 1) {
      const info = describeCell(readCell(r, c))
      if (isBlank(info)) continue
      filled += 1
      if (info.kind !== 'text') allText = false
    }
    if (filled === 0) continue
    return filled >= 2 && allText ? { r } : null
  }
  return null
}

// workbook: resultado de `XLSX.read`; utils: `XLSX.utils` (injetado para o modulo
// continuar sem import estatico do SheetJS).
export function buildSheetPreview(workbook, utils, { sheetIndex } = {}) {
  const names = workbook?.SheetNames ?? []
  const sheetFlags = workbook?.Workbook?.Sheets ?? []
  const sheets = names
    .map((name, index) => ({ name, index, hidden: Boolean(sheetFlags[index]?.Hidden) }))
    .filter((sheet) => !sheet.hidden)
    .map(({ name, index }) => ({ name, index }))

  if (sheets.length === 0) return emptyPreview([], 0)

  const selected = sheets.find((sheet) => sheet.index === sheetIndex) ?? sheets[0]
  const sheet = workbook.Sheets?.[selected.name]
  const range = resolveRange(workbook, sheet, selected.index, utils)
  if (!sheet || !range) return emptyPreview(sheets, selected.index)

  const rowFlags = sheet['!rows'] ?? []
  const colFlags = sheet['!cols'] ?? []
  const readCell = (r, c) => sheet[utils.encode_cell({ r, c })]
  const isRowHidden = (r) => Boolean(rowFlags[r]?.hidden)
  const isColHidden = (c) => Boolean(colFlags[c]?.hidden)

  const modelHeader = findModelHeader(readCell, range)
  const header = modelHeader ?? findGenericHeader(readCell, range)

  // Colunas: do 1o ao ultimo cabecalho preenchido (modelo/generico), senao A, B, C...
  const lastScanCol = Math.min(range.e.c, range.s.c + MAX_SCAN_COLS)
  let firstCol = range.s.c
  let lastCol = lastScanCol
  if (header) {
    let first = -1
    let last = -1
    for (let c = range.s.c; c <= lastScanCol; c += 1) {
      if (isBlank(describeCell(readCell(header.r, c)))) continue
      if (first === -1) first = c
      last = c
    }
    if (first !== -1) {
      firstCol = first
      lastCol = last
    }
  }

  const visibleCols = []
  for (let c = firstCol; c <= lastCol; c += 1) {
    if (!isColHidden(c)) visibleCols.push(c)
  }
  const truncatedCols = visibleCols.length > PREVIEW_MAX_COLS
  const usedCols = visibleCols.slice(0, PREVIEW_MAX_COLS)

  const columns = usedCols.map((c) => {
    const label = header ? collapseSpaces(describeCell(readCell(header.r, c)).text) : ''
    return { label: label || utils.encode_col(c) }
  })

  const firstDataRow = header ? header.r + 1 : range.s.r
  const lastDataRow = Math.min(range.e.r, firstDataRow + MAX_SCAN_ROWS)
  const rows = []
  let totalRows = 0

  for (let r = firstDataRow; r <= lastDataRow; r += 1) {
    if (modelHeader && foldLabel(describeCell(readCell(r, modelHeader.c)).text).startsWith('observac')) {
      break
    }
    if (isRowHidden(r)) continue
    const cells = usedCols.map((c) => describeCell(readCell(r, c)))
    if (cells.every(isBlank)) continue
    totalRows += 1
    if (rows.length < PREVIEW_MAX_ROWS) rows.push(cells)
  }

  return {
    sheets,
    sheetIndex: selected.index,
    meta: modelHeader ? extractMeta(readCell, range) : [],
    columns,
    rows,
    totalRows,
    truncatedRows: totalRows > rows.length,
    truncatedCols,
    recognizedModel: Boolean(modelHeader),
  }
}

function decodeCsvText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

// Unico ponto com o SheetJS (import dinamico). `csv: true` decodifica o texto aqui
// (UTF-8, com fallback windows-1252) para nao estragar acentos.
export async function readSpreadsheetPreview(arrayBuffer, { sheetIndex, csv = false } = {}) {
  const { read, utils } = await import('xlsx')
  const workbook = csv
    ? read(decodeCsvText(arrayBuffer), { type: 'string', cellNF: true })
    : read(arrayBuffer, { type: 'array', cellStyles: true, cellNF: true, cellDates: false })
  return buildSheetPreview(workbook, utils, { sheetIndex })
}
