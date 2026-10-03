// Conciliacao ERP (DBCorp) x Portal - F1. Adaptador da fonte "planilha .xlsx do
// DBCorp": File/Blob/ArrayBuffer -> `looseRows` (via `parseDbcorpRows`). O
// `xlsx` entra SO' por `import('xlsx')` dinamico (fora do bundle inicial).
// Unico import estatico: `./parseDbcorpRows.js`.
//
// Limites contra arquivo hostil/enorme: 10 MB, assinatura zip, `sheetRows`,
// recorte de 64 colunas, `maxRows`. Aceita so' `.xlsx` de verdade: `.xls`, CSV
// e HTML interpretariam texto de data em padrao US.
import { parseDbcorpRows } from './parseDbcorpRows.js'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_COLUMNS = 64
// Linhas alem de `maxRows`: cabecalho deslocado (ate a linha 5) + folga de 1.
const EXTRA_ROWS = 6
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]
const NOT_XLSX_MESSAGE = 'Envie o .xlsx exportado do DBCorp (.xls/CSV/HTML não é aceito)'

function formatLimit(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

async function toBytes(file) {
  if (file instanceof Uint8Array) {
    if (file.byteLength > MAX_BYTES) throw new Error('O arquivo passa de 10 MB.')
    return file
  }
  if (file instanceof ArrayBuffer) {
    if (file.byteLength > MAX_BYTES) throw new Error('O arquivo passa de 10 MB.')
    return new Uint8Array(file)
  }
  if (file && typeof file.arrayBuffer === 'function') {
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      throw new Error('O arquivo passa de 10 MB.')
    }
    const buffer = await file.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) throw new Error('O arquivo passa de 10 MB.')
    return new Uint8Array(buffer)
  }
  throw new Error('Arquivo inválido: esperado File, Blob ou ArrayBuffer.')
}

function hasZipSignature(bytes) {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

// -> { rows: looseRows, warnings, meta: { fileName, sheetName, rowCount } }
export async function readDbcorpWorkbook(file, { maxRows = 5000 } = {}) {
  const bytes = await toBytes(file)
  if (!hasZipSignature(bytes)) throw new Error(NOT_XLSX_MESSAGE)

  const { read, utils } = await import('xlsx')
  const workbook = read(bytes, {
    type: 'array',
    cellDates: false,
    sheetRows: maxRows + EXTRA_ROWS,
  })

  if (workbook.Workbook?.WBProps?.date1904) {
    throw new Error(
      'A planilha usa o calendário 1904 (Excel para Mac); exporte novamente o .xlsx do DBCorp.'
    )
  }

  const sheetName = workbook.SheetNames.includes('Sheet') ? 'Sheet' : workbook.SheetNames[0]
  if (!sheetName) throw new Error('A planilha não possui abas válidas.')
  const sheet = workbook.Sheets[sheetName]

  let matrix = []
  if (sheet && sheet['!ref']) {
    const range = utils.decode_range(sheet['!ref'])
    // A partir de A1 (as linhas em branco do topo contam): o indice da matriz
    // + 1 e' o numero da linha na planilha, como o admin enxerga no Excel.
    const clipped = {
      s: { r: 0, c: 0 },
      e: {
        r: Math.min(range.e.r, maxRows + EXTRA_ROWS - 1),
        c: Math.min(range.e.c, MAX_COLUMNS - 1),
      },
    }
    matrix = utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', range: clipped })
  }

  // `parseDbcorpRows` pula as linhas totalmente vazias (inclusive as de um
  // `!ref` inflado pela formatacao do Excel).
  const parsed = parseDbcorpRows(matrix)
  if (parsed.rows.length > maxRows) {
    throw new Error(`A planilha passa de ${formatLimit(maxRows)} linhas; exporte um recorte menor.`)
  }

  return {
    rows: parsed.rows,
    warnings: parsed.warnings,
    meta: {
      fileName: typeof file?.name === 'string' ? file.name : '',
      sheetName,
      rowCount: parsed.rows.length,
    },
  }
}

// Fonte injetavel no modal (contrato `ErpSource`). A API do DBCorp (F5) entra
// como outro objeto com `inputKind: 'request'`, sem mudar o resto.
export const dbcorpXlsxSource = {
  id: 'dbcorp-xlsx',
  label: 'Planilha do DBCorp (.xlsx)',
  inputKind: 'file',
  accept: '.xlsx',
  load: (file) => readDbcorpWorkbook(file),
}
