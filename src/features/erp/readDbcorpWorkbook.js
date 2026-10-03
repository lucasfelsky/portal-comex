// Conciliacao ERP (DBCorp) x Portal - F1. Adaptador da fonte "planilha .xlsx do
// DBCorp": File/Blob/ArrayBuffer -> `looseRows` (via `parseDbcorpRows`). O
// `xlsx` entra SO' por `import('xlsx')` dinamico (fora do bundle inicial).
// Unico import estatico: `./parseDbcorpRows.js`.
//
// Limites contra arquivo hostil/enorme: 10 MB, assinatura zip, tamanho
// descompactado declarado (60 MB e 20x o arquivo), `sheetRows`, recorte de 64
// colunas, `maxRows`. Aceita so' `.xlsx` de verdade: `.xls`, CSV e HTML
// interpretariam texto de data em padrao US.
import { parseDbcorpRows } from './parseDbcorpRows.js'

const MAX_BYTES = 10 * 1024 * 1024
export const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024
export const MAX_EXPANSION_RATIO = 20
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

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50
const EOCD_MIN_BYTES = 22
const EOCD_MAX_COMMENT_BYTES = 0xffff
const CENTRAL_ENTRY_MIN_BYTES = 46
const ZIP64_MARKER_16 = 0xffff
const ZIP64_MARKER_32 = 0xffffffff

// Inspeciona SO' os cabecalhos do zip (diretorio central), sem descompactar:
// soma o tamanho descompactado declarado de cada entrada. Barra a "zip bomb"
// honesta antes do `XLSX.read`. Os tamanhos declarados podem mentir; a
// mitigacao completa (Web Worker) fica fora da F1.
// -> { ok, reason: null | 'zip_invalido' | 'zip64' | 'acima_do_limite' | 'taxa_de_expansao',
//      entries, uncompressedBytes }
export function inspectZipExpansion(
  bytes,
  { maxUncompressedBytes = MAX_UNCOMPRESSED_BYTES, maxRatio = MAX_EXPANSION_RATIO } = {}
) {
  const result = (reason, entries = 0, uncompressedBytes = 0) => ({
    ok: reason === null,
    reason,
    entries,
    uncompressedBytes,
  })
  const length = bytes instanceof Uint8Array ? bytes.byteLength : 0
  if (length < EOCD_MIN_BYTES) return result('zip_invalido')
  const view = new DataView(bytes.buffer, bytes.byteOffset, length)

  // Fim do diretorio central: de tras para frente (o comentario e' opcional).
  const lowest = Math.max(0, length - EOCD_MIN_BYTES - EOCD_MAX_COMMENT_BYTES)
  let eocd = -1
  for (let index = length - EOCD_MIN_BYTES; index >= lowest; index -= 1) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index
      break
    }
  }
  if (eocd < 0) return result('zip_invalido')

  const entryCount = view.getUint16(eocd + 10, true)
  const directorySize = view.getUint32(eocd + 12, true)
  const directoryOffset = view.getUint32(eocd + 16, true)
  if (
    entryCount === ZIP64_MARKER_16 ||
    directorySize === ZIP64_MARKER_32 ||
    directoryOffset === ZIP64_MARKER_32
  ) {
    return result('zip64')
  }
  if (directoryOffset + directorySize > length) return result('zip_invalido')

  let position = directoryOffset
  let total = 0
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (position + CENTRAL_ENTRY_MIN_BYTES > length) return result('zip_invalido')
    if (view.getUint32(position, true) !== CENTRAL_ENTRY_SIGNATURE) return result('zip_invalido')
    const declared = view.getUint32(position + 24, true)
    if (declared === ZIP64_MARKER_32) return result('zip64')
    total += declared
    const nameLength = view.getUint16(position + 28, true)
    const extraLength = view.getUint16(position + 30, true)
    const commentLength = view.getUint16(position + 32, true)
    position += CENTRAL_ENTRY_MIN_BYTES + nameLength + extraLength + commentLength
    if (position > length) return result('zip_invalido')
  }

  if (total > maxUncompressedBytes) return result('acima_do_limite', entryCount, total)
  if (total > maxRatio * length) return result('taxa_de_expansao', entryCount, total)
  return result(null, entryCount, total)
}

function expansionError(inspection, byteLength) {
  const megabytes = Math.ceil(inspection.uncompressedBytes / (1024 * 1024))
  switch (inspection.reason) {
    case 'acima_do_limite':
      return new Error(
        `O .xlsx descompactado teria ${megabytes} MB, acima do limite de ${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)} MB; exporte um recorte menor do DBCorp.`
      )
    case 'taxa_de_expansao':
      return new Error(
        `O .xlsx descompactado teria ${Math.ceil(inspection.uncompressedBytes / byteLength)} vezes o tamanho do arquivo (limite ${MAX_EXPANSION_RATIO}×); o arquivo parece corrompido. Exporte novamente o .xlsx do DBCorp.`
      )
    case 'zip64':
      return new Error(
        'O .xlsx usa o formato ZIP64 (arquivo grande demais para esta tela); exporte um recorte menor do DBCorp.'
      )
    default:
      return new Error(
        'O arquivo não é um .xlsx válido (a estrutura do ZIP está ilegível); exporte novamente do DBCorp.'
      )
  }
}

// -> { rows: looseRows, warnings, meta: { fileName, sheetName, rowCount } }
export async function readDbcorpWorkbook(file, { maxRows = 5000 } = {}) {
  const bytes = await toBytes(file)
  if (!hasZipSignature(bytes)) throw new Error(NOT_XLSX_MESSAGE)

  // Antes do `import('xlsx')`/`read`: o SheetJS descompacta tudo de uma vez.
  const inspection = inspectZipExpansion(bytes)
  if (!inspection.ok) throw expansionError(inspection, bytes.byteLength)

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

  const limitError = () =>
    new Error(`A planilha passa de ${formatLimit(maxRows)} linhas; exporte um recorte menor.`)

  // Conteudo na ULTIMA linha da janela lida: o `sheetRows` pode ter cortado
  // dados, e o corte nao pode ser silencioso.
  const edgeRow = matrix[maxRows + EXTRA_ROWS - 1]
  if (Array.isArray(edgeRow) && edgeRow.some((cell) => String(cell ?? '').trim() !== '')) {
    throw limitError()
  }

  // `parseDbcorpRows` pula as linhas totalmente vazias (inclusive as de um
  // `!ref` inflado pela formatacao do Excel).
  const parsed = parseDbcorpRows(matrix)
  if (parsed.rows.length > maxRows) throw limitError()

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
