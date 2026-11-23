// S1 - pre-visualizacao simplificada de planilhas anexadas (Relatorio de carga).
// Workbooks montados em memoria com o SheetJS (padrao de erpDbcorpParse.test.js).
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  PREVIEW_MAX_COLS,
  PREVIEW_MAX_ROWS,
  PREVIEW_MAX_SPREADSHEET_BYTES,
  buildSheetPreview,
  getDocumentPreviewKind,
  readSpreadsheetPreview,
} from '../../src/features/processes/spreadsheetPreview.js'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function put(sheet, address, value) {
  if (value && typeof value === 'object') {
    sheet[address] = value
  } else if (typeof value === 'boolean') {
    sheet[address] = { t: 'b', v: value }
  } else if (typeof value === 'number') {
    sheet[address] = { t: 'n', v: value }
  } else {
    sheet[address] = { t: 's', v: value }
  }
}

function workbookOf(sheets) {
  return {
    SheetNames: sheets.map((entry) => entry.name),
    Sheets: Object.fromEntries(sheets.map((entry) => [entry.name, entry.sheet])),
  }
}

const MODEL_HEADERS = [
  'PO / PROCESSO',
  'CÓD. DBCORP',
  'DESCRIÇÃO FORNECEDOR',
  'DESCRIÇÃO SQ',
  'OK?',
  'LOTE    FORNECEDOR',
  'LOTE SQ    (ETIQUETA)',
  'ETIQUETA WMS',
  'ETIQUETA SQ',
  'QTD (KG)',
  'CONTAGEM',
  'PESO LIQ POR EMB.',
  'PESO DA EMB. (KG)',
  'Nº DE EMB.',
]
const MODEL_COLUMNS = 'BCDEFGHIJKLMNO'.split('')

// Imita o FR.CMX.001: cabecalho na linha 8, corpo 9-36, rodape 37-40, area de
// impressao B2:O40 e formulas das linhas vazias em cache (#N/A / #DIV/0!).
function buildModelWorkbook({ filled = 2, withFooter = true } = {}) {
  const sheet = {}
  put(sheet, 'D2', 'RELATÓRIO DE CARGA - ')
  put(sheet, 'N2', 'FR.CMX.001')
  put(sheet, 'B5', 'Nº da DI: 26/0123456-7')
  put(sheet, 'N5', 'REVISÃO: 005')
  put(sheet, 'B6', 'Tipo de carga:')
  put(sheet, 'C6', 'FCL')
  put(sheet, 'D6', 'LCL')
  put(sheet, 'E6', 'CONSOLIDADO')
  put(sheet, 'C7', true)
  put(sheet, 'D7', false)
  put(sheet, 'E7', false)
  MODEL_HEADERS.forEach((label, index) => put(sheet, `${MODEL_COLUMNS[index]}8`, label))

  for (let row = 9; row <= 36; row += 1) {
    const isFilled = row - 9 < filled
    if (isFilled) {
      put(sheet, `B${row}`, `PO 90${row}`)
      put(sheet, `C${row}`, `MO50${row}`)
      put(sheet, `D${row}`, 'SEA THEICTA - BLD 5KG')
      put(sheet, `E${row}`, 'SEA THEICTA 5KG')
      put(sheet, `F${row}`, 'Sim')
      put(sheet, `G${row}`, 'L240812')
      put(sheet, `H${row}`, { t: 's', v: 'L240812PO9', w: 'L240812PO9' })
      put(sheet, `K${row}`, { t: 'n', v: 1200, w: '1.200,00' })
      put(sheet, `M${row}`, { t: 'n', v: 5, w: '5,00' })
      put(sheet, `O${row}`, { t: 'n', v: 240, w: '240,0' })
    } else {
      put(sheet, `H${row}`, { t: 's', v: '', w: '' })
      put(sheet, `M${row}`, { t: 'e', v: 42, w: '#N/A' })
      put(sheet, `O${row}`, { t: 'e', v: 42, w: '#N/A' })
      if (row === 36) put(sheet, `F${row}`, ' ')
    }
  }

  if (withFooter) {
    put(sheet, 'B37', 'OBSERVAÇÕES:')
    put(sheet, 'I37', 'RESPONSÁVEIS')
    put(sheet, 'L37', 'ETIQUETAGEM:')
    put(sheet, 'I38', 'CONFERÊNCIA:')
    put(sheet, 'B39', 'STATUS DO RECEBIMENTO:')
    put(sheet, 'D39', 'COM RESSALVA')
    put(sheet, 'E39', 'SEM RESSALVA')
    put(sheet, 'I39', 'DATA RECEBIMENTO: 20/11/2026')
    put(sheet, 'D40', false)
    put(sheet, 'E40', true)
    put(sheet, 'I40', 'Nº DA NF: ')
  }

  sheet['!ref'] = 'B1:O40'
  const workbook = workbookOf([
    { name: 'SQ QUIMICA', sheet },
    { name: 'Item x Emb.', sheet: XLSX.utils.aoa_to_sheet([['ITEM', 'DESCRIÇÃO'], ['A1', 'Resina']]) },
  ])
  workbook.Workbook = {
    Names: [{ Name: '_xlnm.Print_Area', Sheet: 0, Ref: "'SQ QUIMICA'!$B$2:$O$40" }],
    Sheets: [{ Hidden: 0 }, { Hidden: 0 }],
  }
  return workbook
}

describe('getDocumentPreviewKind', () => {
  it('classifica por MIME e por extensão', () => {
    expect(getDocumentPreviewKind(XLSX_MIME, 'a.xlsx')).toBe('sheet')
    expect(getDocumentPreviewKind('application/vnd.ms-excel', 'a.xls')).toBe('sheet')
    expect(getDocumentPreviewKind('text/csv', 'a.csv')).toBe('sheet')
    expect(getDocumentPreviewKind('application/octet-stream', 'REL.XLSX')).toBe('sheet')
    expect(getDocumentPreviewKind('application/pdf', 'a.pdf')).toBe('pdf')
    expect(getDocumentPreviewKind('', 'a.pdf')).toBe('pdf')
    expect(getDocumentPreviewKind('image/png', 'a.png')).toBe('image')
    expect(getDocumentPreviewKind('', 'foto.JPEG')).toBe('image')
  })

  it('devolve vazio para docx e tipos desconhecidos', () => {
    expect(
      getDocumentPreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')
    ).toBe('')
    expect(getDocumentPreviewKind('application/zip', 'a.zip')).toBe('')
    expect(getDocumentPreviewKind('', '')).toBe('')
    expect(getDocumentPreviewKind(undefined, undefined)).toBe('')
  })
})

describe('buildSheetPreview — modelo FR.CMX.001', () => {
  it('reconhece o modelo e monta colunas do cabeçalho (espaços colapsados)', () => {
    const preview = buildSheetPreview(buildModelWorkbook(), XLSX.utils)
    expect(preview.recognizedModel).toBe(true)
    expect(preview.columns.map((column) => column.label)).toEqual([
      'PO / PROCESSO',
      'CÓD. DBCORP',
      'DESCRIÇÃO FORNECEDOR',
      'DESCRIÇÃO SQ',
      'OK?',
      'LOTE FORNECEDOR',
      'LOTE SQ (ETIQUETA)',
      'ETIQUETA WMS',
      'ETIQUETA SQ',
      'QTD (KG)',
      'CONTAGEM',
      'PESO LIQ POR EMB.',
      'PESO DA EMB. (KG)',
      'Nº DE EMB.',
    ])
  })

  it('traz só as linhas preenchidas (ignora vazias com #N/A e o rodapé)', () => {
    const preview = buildSheetPreview(buildModelWorkbook({ filled: 3 }), XLSX.utils)
    expect(preview.totalRows).toBe(3)
    expect(preview.rows).toHaveLength(3)
    expect(preview.truncatedRows).toBe(false)
    const first = preview.rows[0]
    expect(first[0].text).toBe('PO 909')
    expect(first[9].text).toBe('1.200,00')
    expect(first[9].kind).toBe('number')
    // M (PESO LIQ) e O (Nº DE EMB.) preenchidos; K/L... vazios.
    expect(first[11].text).toBe('5,00')
    const everything = preview.rows.flat().map((cell) => cell.text)
    expect(everything).not.toContain('OBSERVAÇÕES:')
    expect(everything).not.toContain('#N/A')
  })

  it('lê os cartões do cabeçalho: DI, tipo de carga, status e data de recebimento', () => {
    const preview = buildSheetPreview(buildModelWorkbook(), XLSX.utils)
    expect(preview.meta).toEqual([
      { key: 'di', label: 'Nº DA DI', value: '26/0123456-7' },
      { key: 'cargoType', label: 'TIPO DE CARGA', value: 'FCL' },
      { key: 'receiptStatus', label: 'STATUS DO RECEBIMENTO', value: 'Sem ressalva' },
      { key: 'receivedDate', label: 'DATA RECEBIMENTO', value: '20/11/2026' },
    ])
  })

  it('omite os cartões sem valor (nenhuma caixa marcada, DI sem número)', () => {
    const workbook = buildModelWorkbook()
    const sheet = workbook.Sheets['SQ QUIMICA']
    put(sheet, 'C7', false)
    put(sheet, 'E40', false)
    put(sheet, 'B5', 'Nº da DI: ')
    put(sheet, 'I39', 'DATA RECEBIMENTO:')
    const preview = buildSheetPreview(workbook, XLSX.utils)
    expect(preview.meta).toEqual([])
  })

  it('formata a data de recebimento vinda de uma célula de data do Excel (dd/mm/aaaa)', () => {
    const workbook = buildModelWorkbook()
    const sheet = workbook.Sheets['SQ QUIMICA']
    delete sheet.I39
    put(sheet, 'I39', 'DATA RECEBIMENTO:')
    put(sheet, 'J39', { t: 'n', v: 46346, z: 'm/d/yy', w: '11/20/26' })
    const preview = buildSheetPreview(workbook, XLSX.utils)
    expect(preview.meta.find((item) => item.key === 'receivedDate')?.value).toBe('20/11/2026')
  })

  it('lista só as abas visíveis e a primeira não oculta é a padrão', () => {
    const workbook = buildModelWorkbook()
    workbook.Workbook.Sheets = [{ Hidden: 1 }, { Hidden: 0 }]
    const preview = buildSheetPreview(workbook, XLSX.utils)
    expect(preview.sheets).toEqual([{ name: 'Item x Emb.', index: 1 }])
    expect(preview.sheetIndex).toBe(1)
    expect(preview.recognizedModel).toBe(false)
    expect(preview.columns.map((column) => column.label)).toEqual(['ITEM', 'DESCRIÇÃO'])
    expect(preview.rows[0].map((cell) => cell.text)).toEqual(['A1', 'Resina'])
  })

  it('troca de aba pelo índice', () => {
    const preview = buildSheetPreview(buildModelWorkbook(), XLSX.utils, { sheetIndex: 1 })
    expect(preview.sheetIndex).toBe(1)
    expect(preview.sheets.map((sheet) => sheet.name)).toEqual(['SQ QUIMICA', 'Item x Emb.'])
    expect(preview.columns.map((column) => column.label)).toEqual(['ITEM', 'DESCRIÇÃO'])
  })
})

describe('buildSheetPreview — planilha genérica', () => {
  it('booleano vira kind bool com checked; erro vira kind error com texto vazio', () => {
    const sheet = {}
    put(sheet, 'A1', 'Item')
    put(sheet, 'B1', 'Conferido')
    put(sheet, 'C1', 'Valor')
    put(sheet, 'A2', 'Resina')
    put(sheet, 'B2', true)
    put(sheet, 'C2', { t: 'e', v: 7, w: '#DIV/0!' })
    put(sheet, 'A3', 'Solvente')
    put(sheet, 'B3', false)
    sheet['!ref'] = 'A1:C3'
    const preview = buildSheetPreview(workbookOf([{ name: 'S', sheet }]), XLSX.utils)

    expect(preview.rows[0][1]).toEqual({ text: 'Sim', kind: 'bool', checked: true })
    expect(preview.rows[1][1]).toEqual({ text: 'Não', kind: 'bool', checked: false })
    expect(preview.rows[0][2]).toEqual({ text: '', kind: 'error' })
  })

  it('linha só com erros/vazios não conta como preenchida', () => {
    const sheet = {}
    put(sheet, 'A1', 'Item')
    put(sheet, 'B1', 'Valor')
    put(sheet, 'A2', { t: 's', v: '', w: '' })
    put(sheet, 'B2', { t: 'e', v: 42, w: '#N/A' })
    put(sheet, 'A3', 'Resina')
    sheet['!ref'] = 'A1:B3'
    const preview = buildSheetPreview(workbookOf([{ name: 'S', sheet }]), XLSX.utils)
    expect(preview.totalRows).toBe(1)
    expect(preview.rows[0][0].text).toBe('Resina')
  })

  it('a área de impressão limita a faixa lida', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Item', 'Qtd', 'Fora'],
      ['A', 1, 'x'],
      ['B', 2, 'y'],
      ['C', 3, 'z'],
    ])
    const workbook = workbookOf([{ name: 'S', sheet }])
    workbook.Workbook = { Names: [{ Name: '_xlnm.Print_Area', Sheet: 0, Ref: "'S'!$A$1:$B$3" }] }
    const preview = buildSheetPreview(workbook, XLSX.utils)
    expect(preview.columns.map((column) => column.label)).toEqual(['Item', 'Qtd'])
    expect(preview.rows.map((cells) => cells[0].text)).toEqual(['A', 'B'])
  })

  it('corta em 200 linhas e informa o total', () => {
    const aoa = [['Item', 'Qtd']]
    for (let index = 1; index <= 250; index += 1) aoa.push([`ITEM-${index}`, index])
    const preview = buildSheetPreview(workbookOf([{ name: 'S', sheet: XLSX.utils.aoa_to_sheet(aoa) }]), XLSX.utils)
    expect(PREVIEW_MAX_ROWS).toBe(200)
    expect(preview.rows).toHaveLength(200)
    expect(preview.totalRows).toBe(250)
    expect(preview.truncatedRows).toBe(true)
  })

  it('corta em 30 colunas', () => {
    const header = Array.from({ length: 40 }, (_, index) => `COL ${index + 1}`)
    const body = Array.from({ length: 40 }, (_, index) => index + 1)
    const preview = buildSheetPreview(
      workbookOf([{ name: 'S', sheet: XLSX.utils.aoa_to_sheet([header, body]) }]),
      XLSX.utils
    )
    expect(PREVIEW_MAX_COLS).toBe(30)
    expect(preview.columns).toHaveLength(30)
    expect(preview.rows[0]).toHaveLength(30)
    expect(preview.truncatedCols).toBe(true)
  })

  it('sem cabeçalho de texto, as colunas ficam A, B, C', () => {
    const sheet = XLSX.utils.aoa_to_sheet([[1, 2, 3], [4, 5, 6]])
    const preview = buildSheetPreview(workbookOf([{ name: 'S', sheet }]), XLSX.utils)
    expect(preview.columns.map((column) => column.label)).toEqual(['A', 'B', 'C'])
    expect(preview.totalRows).toBe(2)
  })

  it('planilha vazia devolve zero linhas', () => {
    const preview = buildSheetPreview(workbookOf([{ name: 'S', sheet: {} }]), XLSX.utils)
    expect(preview.rows).toEqual([])
    expect(preview.totalRows).toBe(0)
    expect(preview.sheets).toEqual([{ name: 'S', index: 0 }])
  })

  it('pula linhas e colunas ocultas', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Item', 'Segredo', 'Qtd'],
      ['A', 'x', 1],
      ['B', 'y', 2],
    ])
    sheet['!cols'] = [{}, { hidden: true }, {}]
    sheet['!rows'] = [{}, {}, { hidden: true }]
    const preview = buildSheetPreview(workbookOf([{ name: 'S', sheet }]), XLSX.utils)
    expect(preview.columns.map((column) => column.label)).toEqual(['Item', 'Qtd'])
    expect(preview.rows.map((cells) => cells.map((cell) => cell.text))).toEqual([['A', '1']])
  })
})

describe('readSpreadsheetPreview', () => {
  it('lê um .xlsx de ida e volta (XLSX.write -> preview)', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['PO / PROCESSO', 'CÓD. DBCORP', 'QTD (KG)'],
        ['PO 9036', 'MO5079', 1200],
      ]),
      'SQ QUIMICA'
    )
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const preview = await readSpreadsheetPreview(buffer)
    expect(preview.recognizedModel).toBe(true)
    expect(preview.sheets).toEqual([{ name: 'SQ QUIMICA', index: 0 }])
    expect(preview.columns.map((column) => column.label)).toEqual(['PO / PROCESSO', 'CÓD. DBCORP', 'QTD (KG)'])
    expect(preview.rows[0].map((cell) => cell.text)).toEqual(['PO 9036', 'MO5079', '1200'])
  })

  it('lê .csv em UTF-8 sem estragar acentos', async () => {
    const bytes = new TextEncoder().encode('Item,Descrição\nA1,Água mineral\n')
    const preview = await readSpreadsheetPreview(bytes.buffer, { csv: true })
    expect(preview.columns.map((column) => column.label)).toEqual(['Item', 'Descrição'])
    expect(preview.rows[0].map((cell) => cell.text)).toEqual(['A1', 'Água mineral'])
  })

  it('o limite de tamanho da planilha é 5 MB', () => {
    expect(PREVIEW_MAX_SPREADSHEET_BYTES).toBe(5 * 1024 * 1024)
  })
})
