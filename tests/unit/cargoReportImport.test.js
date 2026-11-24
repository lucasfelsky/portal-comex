// S5 do Relatório de Carga: importação de planilha antiga (FR.CMX.001 R5 ou anterior).
// Fixtures 100% SINTÉTICAS, geradas por código (nunca os relatórios reais, nunca um .xlsx no repo).
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  CARGO_REPORT_IMPORT_MAX_FILE_BYTES,
  CARGO_REPORT_IMPORT_SCAN,
  applyCargoReportImport,
  buildCargoReportSheetMatrix,
  countCargoReportImportAlerts,
  foldCargoLabel,
  parseCargoReportMatrix,
  readCargoReportWorkbook,
} from '../../src/features/processes/cargoReportImport.js'
import {
  buildCargoReportPayload,
  buildInitialCargoReport,
  createEmptyCargoReportRow,
} from '../../src/features/processes/cargoReportFormModel.js'

// Rótulos REAIS do R5 (B8:O8), inclusive os espaços múltiplos.
const R5_HEADER = [
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

// Linha de dados na ordem do R5 (as colunas calculadas e o OK? ficam como no arquivo real).
function r5Row({
  po = '4500123',
  code = 'AD5240',
  supplierDescription = 'DEA FOAM14339 – BOMBONA 25KG',
  sqDescription = 'DEA FOAM14339 - BB 25KG',
  ok = null,
  lot = 'DF2406A',
  lotSq = null,
  wms = null,
  sqLabel = null,
  qty = 12500,
  count = null,
  net = null,
  packageWeight = 1.2,
  packages = null,
} = {}) {
  return [po, code, supplierDescription, sqDescription, ok, lot, lotSq, wms, sqLabel, qty, count, net, packageWeight, packages]
}

const FILLED_ROWS = [
  r5Row({ code: 'AD5240' }),
  r5Row({ code: 'RE5116', sqDescription: 'DEGALAN 64/12 N - CX 25KG', lot: '', qty: 5000, packageWeight: null }),
  r5Row({ code: 'ZZ9999', sqDescription: 'ADITIVO NOVO XR', lot: 'XR0911', qty: 800 }),
  r5Row({ code: 'MO5190', sqDescription: 'MONOMERO EXEMPLO - BLD 5KG', lot: 'ME2407', qty: 1000 }),
  r5Row({ code: 'AD5241', sqDescription: 'DEA FOAM14340 - BB 25KG', lot: 'DF2406B', qty: 2500 }),
]

// Monta o .xlsx no layout do modelo: coluna A vazia (começa em B), título em D2, `N2` = código do
// formulário, `N5` = revisão, tipo de carga em B6:E7 e cabeçalho em `headerRow`.
function buildSheet({
  revision = 'REVISÃO: 005',
  checked = { CONSOLIDADO: true },
  headerRow = 8,
  header = R5_HEADER,
  rows = FILLED_ROWS,
  physicalRows = 28,
  footer = true,
  trailingRows = [],
} = {}) {
  const aoa = []
  const put = (excelRow, excelCol, value) => {
    while (aoa.length < excelRow) aoa.push([])
    aoa[excelRow - 1][excelCol] = value
  }

  put(2, 3, 'RELATÓRIO DE CARGA - ACME SEA 021-26')
  put(2, 13, 'FR.CMX.001')
  put(5, 1, 'Nº da DI: ')
  if (revision !== null) put(5, 13, revision)
  put(6, 1, 'Tipo de carga:')
  ;['FCL', 'LCL', 'CONSOLIDADO'].forEach((label, index) => {
    put(6, 2 + index, label)
    if (label in checked) put(7, 2 + index, checked[label])
  })
  header.forEach((label, index) => put(headerRow, 1 + index, label))
  rows.forEach((row, rowIndex) => row.forEach((value, index) => put(headerRow + 1 + rowIndex, 1 + index, value)))

  const lastDataRow = headerRow + Math.max(physicalRows, rows.length)
  if (footer) {
    put(lastDataRow + 1, 1, 'OBSERVAÇÕES:')
    put(lastDataRow + 3, 1, 'RESPONSÁVEIS')
    put(lastDataRow + 3, 7, 'STATUS DO RECEBIMENTO:')
  }
  // Texto REAL abaixo do rodapé (não deve entrar nas linhas importadas).
  trailingRows.forEach((row, rowIndex) => row.forEach((value, index) => put(lastDataRow + 5 + rowIndex, 1 + index, value)))

  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  // Linhas vazias do modelo: fórmulas com cache de erro e o OK? com um espaço.
  for (let excelRow = headerRow + 1 + rows.length; excelRow <= lastDataRow; excelRow += 1) {
    sheet[`H${excelRow}`] = { t: 's', v: '', f: `G${excelRow}&LEFT(B${excelRow},3)` }
    sheet[`M${excelRow}`] = { t: 'e', v: 42, f: `VLOOKUP(C${excelRow},'Item x Emb.'!A:D,4,0)` }
    sheet[`O${excelRow}`] = { t: 'e', v: 42, f: `K${excelRow}/M${excelRow}` }
    sheet[`F${excelRow}`] = { t: 's', v: ' ' }
  }
  return sheet
}

function buildCargoReportFile({
  sheetName = 'SQ QUIMICA',
  extraSheetsBefore = [],
  extraSheets = [],
  name = 'relatorio.xlsx',
  ...sheetOptions
} = {}) {
  const workbook = XLSX.utils.book_new()
  for (const [extraName, extraSheet] of extraSheetsBefore) XLSX.utils.book_append_sheet(workbook, extraSheet, extraName)
  XLSX.utils.book_append_sheet(workbook, buildSheet(sheetOptions), sheetName)
  for (const [extraName, extraSheet] of extraSheets) XLSX.utils.book_append_sheet(workbook, extraSheet, extraName)
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new File([bytes], name)
}

const importFile = (options) => readCargoReportWorkbook(buildCargoReportFile(options))

describe('foldCargoLabel', () => {
  it('dobra rótulos do modelo', () => {
    expect(foldCargoLabel('Nº DE EMB.')).toBe('no de emb.')
    expect(foldCargoLabel('LOTE    FORNECEDOR')).toBe('lote fornecedor')
    expect(foldCargoLabel('PO / PROCESSO')).toBe('po/processo')
    expect(foldCargoLabel('Tipo de carga:')).toBe('tipo de carga')
    expect(foldCargoLabel('QTD\n(KG)')).toBe('qtd (kg)')
    expect(foldCargoLabel(null)).toBe('')
  })
})

describe('relatório no modelo R5', () => {
  it('lê as 5 linhas, o tipo de carga, a revisão e o cabeçalho B8:O8', async () => {
    const result = await importFile()

    expect(result.fatal).toBeNull()
    expect(result.sheetName).toBe('SQ QUIMICA')
    expect(result.fileName).toBe('relatorio.xlsx')
    expect(result.headerRange).toBe('B8:O8')
    expect(result.headerRow).toBe(8)
    expect(result.sourceRevision).toBe(5)
    expect(result.cargoType).toBe('CONSOLIDADO')
    expect(result.cargoTypeRead).toBe(true)
    expect(result.rows).toHaveLength(5)
    expect(result.warnings).toEqual([])
    expect(result.missingOptional).toEqual([])
    expect(result.rows[0]).toMatchObject({
      po: '4500123',
      dbcorpCode: 'AD5240',
      supplierDescription: 'DEA FOAM14339 – BOMBONA 25KG',
      sqDescription: 'DEA FOAM14339 - BB 25KG',
      supplierLot: 'DF2406A',
      quantityKg: 12500,
      packageWeightKg: 1.2,
      count: null,
    })
    expect(result.rows[1].supplierLot).toBe('')
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(5)
  })

  it('ignora as colunas calculadas e o OK?, mesmo digitados à mão', async () => {
    const result = await importFile({
      rows: [r5Row({ ok: true, lotSq: 'XYZ', net: 0.2, packages: 10 })],
    })

    expect(result.fatal).toBeNull()
    expect(Object.keys(result.rows[0]).sort()).toEqual(Object.keys(createEmptyCargoReportRow('x')).sort())
    expect(result.rows[0].frozenNetWeightKg).toBeNull()
    expect(result.rows[0].frozenPackages).toBeNull()
    for (const key of ['lotSq', 'netWeightKg', 'packages', 'ok']) expect(result.rows[0]).not.toHaveProperty(key)
    expect(Object.values(result.rows[0])).not.toContain('XYZ')
  })

  it('relatório antigo com linhas inseridas: cabeçalho na linha 10 e rodapé deslocado', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => r5Row({ po: `PO${index}`, lot: `L${index}` }))
    const result = await importFile({ headerRow: 10, rows, physicalRows: 31 })

    expect(result.fatal).toBeNull()
    expect(result.headerRange).toBe('B10:O10')
    expect(result.rows).toHaveLength(10)
    expect(result.rows[9].po).toBe('PO9')
  })

  it('o rodapé encerra a leitura: linha preenchida abaixo dele não entra', async () => {
    const result = await importFile({
      rows: [r5Row({ po: 'ANTES' })],
      physicalRows: 3,
      trailingRows: [r5Row({ po: 'DEPOIS DO RODAPE', code: 'ZZ0001', qty: 99 })],
    })

    expect(result.fatal).toBeNull()
    expect(result.rows.map((row) => row.po)).toEqual(['ANTES'])
  })
})

describe('tolerância de rótulo', () => {
  it('mapeia sinônimos, quebras de linha e colunas em outra ordem', async () => {
    const header = ['Descricao SQ', 'Cod. DBCorp', 'PO', 'QTD\n(KG)', 'lote do fornecedor']
    const rows = [['ÓLEO TESTE', 'ab1234', '4500999', '2.500', 'LT01']]
    const result = await importFile({ header, rows, physicalRows: 1 })

    expect(result.fatal).toBeNull()
    expect(result.rows[0]).toMatchObject({
      sqDescription: 'ÓLEO TESTE',
      dbcorpCode: 'AB1234',
      po: '4500999',
      quantityKg: 2500,
      supplierLot: 'LT01',
    })
  })
})

describe('conversões', () => {
  it('números em formatos do Excel e texto', async () => {
    const result = await importFile({
      rows: [
        r5Row({ qty: 12500, packageWeight: '1,5' }),
        r5Row({ qty: '12.500', packageWeight: '25' }),
        r5Row({ po: 4500123, lot: 26030086, code: ' ap5012 ', qty: '1,5', count: 40 }),
      ],
    })

    expect(result.fatal).toBeNull()
    expect(result.warnings).toEqual([])
    expect(result.rows[0]).toMatchObject({ quantityKg: 12500, packageWeightKg: 1.5 })
    expect(result.rows[1]).toMatchObject({ quantityKg: 12500, packageWeightKg: 25 })
    expect(result.rows[2]).toMatchObject({
      po: '4500123',
      supplierLot: '26030086',
      dbcorpCode: 'AP5012',
      quantityKg: 1.5,
      count: null,
    })
  })

  it('valor inválido vira vazio com aviso da linha do Excel', async () => {
    const result = await importFile({
      rows: [r5Row({ qty: 'abc' }), r5Row({ packageWeight: 'x1' }), r5Row({ qty: -3 })],
    })

    expect(result.fatal).toBeNull()
    expect(result.rows[0].quantityKg).toBeNull()
    expect(result.rows[1].packageWeightKg).toBeNull()
    expect(result.rows[2].quantityKg).toBeNull()
    expect(result.warnings).toEqual([
      { row: 9, message: 'Linha 9: QTD (KG) inválido ("abc"); ficou vazio.' },
      { row: 10, message: 'Linha 10: PESO DA EMB. (KG) inválido ("x1"); ficou vazio.' },
      { row: 11, message: 'Linha 11: QTD (KG) inválido ("-3"); ficou vazio.' },
    ])
  })

  it('S6: etiquetas WMS/SQ e contagem do arquivo são ignoradas, sem aviso de CONTAGEM', async () => {
    const result = await importFile({
      rows: [r5Row({ wms: 'WMS-77120', sqLabel: 'SQ-001245', count: 40 }), r5Row({ count: 2.5 })],
    })

    expect(result.fatal).toBeNull()
    expect(result.warnings).toEqual([])
    expect(result.missingOptional).toEqual([])
    for (const row of result.rows) expect(row).toMatchObject({ wmsLabel: '', sqLabel: '', count: null })
  })

  it('S6: as colunas de etiqueta e contagem continuam reconhecidas no cabeçalho (B8:O8)', async () => {
    const result = await importFile({ rows: [r5Row({ wms: 'W', sqLabel: 'S', count: 3 })] })
    expect(result.headerRange).toBe('B8:O8')
    expect(result.rows).toHaveLength(1)
  })

  it('normaliza texto: espaços, NBSP e corte da descrição em 200', async () => {
    const result = await importFile({
      rows: [r5Row({ lot: 'JB260110A01HB ', sqDescription: ` ${'A'.repeat(260)} `, supplierDescription: 'X\u00a0 Y' })],
    })

    expect(result.rows[0].supplierLot).toBe('JB260110A01HB')
    expect(result.rows[0].sqDescription).toBe('A'.repeat(200))
    expect(result.rows[0].supplierDescription).toBe('X Y')
  })
})

describe('linhas vazias e limite', () => {
  it('pula linha vazia no meio e ignora linhas só com #N/A e espaço', async () => {
    const empty = r5Row({ po: null, code: null, supplierDescription: null, sqDescription: null, lot: null, qty: null, packageWeight: null })
    const result = await importFile({ rows: [r5Row({ po: 'A' }), empty, r5Row({ po: 'B' })] })

    expect(result.rows.map((row) => row.po)).toEqual(['A', 'B'])
  })

  it('200 linhas passam (mais que as 28 do modelo) e 201 viram too-many-rows com o total', async () => {
    const make = (total) => Array.from({ length: total }, (_, index) => r5Row({ po: `PO${index}` }))

    const beyondTemplate = await importFile({ rows: make(45) })
    expect(beyondTemplate.fatal).toBeNull()
    expect(beyondTemplate.rows).toHaveLength(45)

    const ok = await importFile({ rows: make(200) })
    expect(ok.fatal).toBeNull()
    expect(ok.rows).toHaveLength(200)

    const tooMany = await importFile({ rows: make(201) })
    expect(tooMany.fatal.code).toBe('too-many-rows')
    expect(tooMany.fatal.message).toContain('201')
    expect(tooMany.fatal.message).toContain('o Portal aceita até 200')
    expect(tooMany.rows).toEqual([])
  })

  it('sem nenhuma linha preenchida: no-rows', async () => {
    const result = await importFile({ rows: [] })
    expect(result.fatal.code).toBe('no-rows')
    expect(result.fatal.title).toBe('Nenhuma linha preenchida.')
  })
})

describe('cabeçalho e colunas', () => {
  it('sem cabeçalho reconhecível: model-not-recognized', async () => {
    const result = await importFile({ header: ['A', 'B', 'C'] })
    expect(result.fatal.code).toBe('model-not-recognized')
    expect(result.fatal.message).toContain('Nada foi alterado no formulário.')
  })

  it('sem CÓD. DBCORP e QTD (KG): missing-columns com os 2 rótulos', async () => {
    const header = R5_HEADER.filter((label) => !label.startsWith('CÓD.') && !label.startsWith('QTD'))
    const result = await importFile({ header, rows: [['4500123']] })

    expect(result.fatal.code).toBe('missing-columns')
    expect(result.fatal.message).toContain('CÓD. DBCORP')
    expect(result.fatal.message).toContain('QTD (KG)')
  })

  it('coluna opcional ausente vai para missingOptional e o campo fica vazio', async () => {
    const header = R5_HEADER.filter((label) => label !== 'PESO DA EMB. (KG)')
    const rows = [r5Row()].map((row) => row.filter((_, index) => index !== 12))
    const result = await importFile({ header, rows })

    expect(result.fatal).toBeNull()
    expect(result.missingOptional).toEqual(['PESO DA EMB. (KG)'])
    expect(result.rows[0].packageWeightKg).toBeNull()
  })
})

describe('revisão do formulário', () => {
  it('revisão 006 é recusada com a revisão na mensagem', async () => {
    const result = await importFile({ revision: 'REVISÃO: 006' })
    expect(result.fatal.code).toBe('unsupported-revision')
    expect(result.fatal.message).toContain('006')
  })

  it('revisão 004 passa; sem revisão passa com null', async () => {
    const old = await importFile({ revision: 'REVISÃO: 004' })
    expect(old.fatal).toBeNull()
    expect(old.sourceRevision).toBe(4)

    const none = await importFile({ revision: null })
    expect(none.fatal).toBeNull()
    expect(none.sourceRevision).toBeNull()
  })

  it('as mensagens falam só da revisão 5 (sem "ou anterior")', async () => {
    const model = await importFile({ header: ['A', 'B', 'C'] })
    expect(model.fatal.message).toContain('revisão 5')
    expect(model.fatal.message).not.toContain('anterior')

    const revision = await importFile({ revision: 'REVISÃO: 007' })
    expect(revision.fatal.message).toContain('007')
    expect(revision.fatal.message).toContain('apenas a revisão 005')
    expect(revision.fatal.message).not.toContain('anterior')
  })
})

describe('tipo de carga', () => {
  it('nenhum ou dois marcados: não lê', async () => {
    const none = await importFile({ checked: {} })
    expect(none.cargoType).toBe('')
    expect(none.cargoTypeRead).toBe(false)

    const two = await importFile({ checked: { FCL: true, LCL: true } })
    expect(two.cargoType).toBe('')
    expect(two.cargoTypeRead).toBe(false)
  })

  it('texto "X" abaixo do rótulo vale como marcado', async () => {
    const result = await importFile({ checked: { LCL: 'X' } })
    expect(result.cargoType).toBe('LCL')
    expect(result.cargoTypeRead).toBe(true)
  })

  it('FALSE explícito não conta como marcado', async () => {
    const result = await importFile({ checked: { FCL: false, LCL: true } })
    expect(result.cargoType).toBe('LCL')
  })
})

describe('abas', () => {
  const capa = () => XLSX.utils.aoa_to_sheet([['Capa do arquivo']])

  it('escolhe "SQ QUIMICA" mesmo com outras abas', async () => {
    const result = await importFile({ extraSheetsBefore: [['Capa', capa()]] })
    expect(result.fatal).toBeNull()
    expect(result.sheetName).toBe('SQ QUIMICA')
  })

  it('sem a aba "SQ QUIMICA": usa a primeira com o cabeçalho do modelo', async () => {
    const result = await importFile({ sheetName: 'Plan1' })
    expect(result.fatal).toBeNull()
    expect(result.sheetName).toBe('Plan1')
  })

  it('só "Item x Emb.": model-not-recognized', async () => {
    const result = await importFile({ sheetName: 'Item x Emb.' })
    expect(result.fatal.code).toBe('model-not-recognized')
  })
})

describe('arquivo', () => {
  it('maior que 5 MB: too-big sem ler os bytes', async () => {
    let read = false
    const file = {
      name: 'grande.xlsx',
      size: CARGO_REPORT_IMPORT_MAX_FILE_BYTES + 1,
      arrayBuffer: () => {
        read = true
        return Promise.resolve(new ArrayBuffer(0))
      },
    }
    const result = await readCargoReportWorkbook(file)

    expect(result.fatal.code).toBe('too-big')
    expect(result.fileName).toBe('grande.xlsx')
    expect(read).toBe(false)
  })

  it('texto puro e .xls (BIFF) são formato inválido', async () => {
    const text = await readCargoReportWorkbook(new File(['isto não é uma planilha'], 'a.xlsx'))
    expect(text.fatal.code).toBe('invalid-format')

    const xls = await readCargoReportWorkbook(new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])], 'a.xls'))
    expect(xls.fatal.code).toBe('invalid-format')
  })

  it('zip com assinatura mas estrutura ilegível: invalid-format', async () => {
    const result = await readCargoReportWorkbook(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])], 'a.xlsx'))
    expect(result.fatal.code).toBe('invalid-format')
  })

  it('zip bomb gerado por código: zip-bomb', async () => {
    const aoa = Array.from({ length: 200 }, () => ['A'.repeat(32000)])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), 'SQ QUIMICA')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true })
    expect(bytes.byteLength).toBeLessThan(CARGO_REPORT_IMPORT_MAX_FILE_BYTES)

    const result = await readCargoReportWorkbook(new File([bytes], 'bomba.xlsx'))
    expect(result.fatal.code).toBe('zip-bomb')
    expect(result.fatal.title).toBe('Arquivo suspeito.')
  })
})

describe('parseCargoReportMatrix', () => {
  it('usa firstRow/firstCol para o headerRange', () => {
    const matrix = [
      ['PO / PROCESSO', 'CÓD. DBCORP', 'DESCRIÇÃO SQ', 'LOTE FORNECEDOR', 'QTD (KG)'],
      ['1', 'AB1', 'X', 'L1', 10],
    ]
    const result = parseCargoReportMatrix(matrix, { firstRow: 4, firstCol: 2 })
    expect(result.fatal).toBeNull()
    expect(result.headerRange).toBe('C4:G4')
    expect(result.rows).toHaveLength(1)
  })

  it('matriz vazia: model-not-recognized', () => {
    expect(parseCargoReportMatrix([]).fatal.code).toBe('model-not-recognized')
    expect(parseCargoReportMatrix(null).fatal.code).toBe('model-not-recognized')
  })
})

describe('applyCargoReportImport e alertas', () => {
  const baseForm = () => ({
    ...buildInitialCargoReport({ processNumber: '4500123', name: 'ACME SEA 021-26', category: 'FCL', items: [] }),
    revision: 4,
    cargoType: 'FCL',
    titleSuffix: 'ACME SEA 021-26',
    rows: [createEmptyCargoReportRow('antiga-1'), createEmptyCargoReportRow('antiga-2')],
    notes: 'Observação do COMEX',
    labeledBy: 'Fulano',
    catalogVersion: 3,
    lastGenerated: { documentId: 'd1', revision: 3, at: 'ontem', byId: 'u1' },
  })

  it('troca as linhas por ids novos e preserva o resto do formulário', async () => {
    const form = baseForm()
    const imported = await importFile()
    const applied = applyCargoReportImport(form, imported)

    expect(applied.rows).toHaveLength(5)
    const oldIds = form.rows.map((row) => row.id)
    const newIds = applied.rows.map((row) => row.id)
    expect(new Set(newIds).size).toBe(5)
    expect(newIds.some((id) => oldIds.includes(id))).toBe(false)
    expect(newIds).not.toEqual(imported.rows.map((row) => row.id))
    expect(applied.cargoType).toBe('CONSOLIDADO')
    expect(applied).toMatchObject({
      revision: 4,
      titleSuffix: 'ACME SEA 021-26',
      notes: 'Observação do COMEX',
      labeledBy: 'Fulano',
      catalogVersion: 3,
      lastGenerated: form.lastGenerated,
    })
  })

  it('mantém o tipo de carga quando o arquivo não marca nenhum', async () => {
    const imported = await importFile({ checked: {} })
    expect(applyCargoReportImport(baseForm(), imported).cargoType).toBe('FCL')
  })

  it('o payload de gravação sai sem erros, com revisão + 1 e sem coluna calculada', async () => {
    const imported = await importFile()
    const { payload, errors } = buildCargoReportPayload(applyCargoReportImport(baseForm(), imported), { catalogVersion: 3 })

    expect(errors).toEqual([])
    expect(payload.revision).toBe(5)
    expect(payload.cargoType).toBe('CONSOLIDADO')
    expect(payload.rows).toHaveLength(5)
    for (const key of ['lotSq', 'netWeightKg', 'packages', 'ok']) expect(payload.rows[0]).not.toHaveProperty(key)
  })

  it('conta os mesmos alertas do formulário', async () => {
    const catalog = {
      exists: true,
      version: 3,
      items: [
        { code: 'AD5240', description: 'DEA FOAM', packagingType: 'BOMBONA', netWeightKg: 25 },
        { code: 'RE5116', description: 'DEGALAN', packagingType: 'CAIXA', netWeightKg: 25 },
        { code: 'MO5190', description: 'MONOMERO', packagingType: 'BALDE', netWeightKg: 5 },
        { code: 'AD5241', description: 'DEA FOAM 2', packagingType: 'BOMBONA', netWeightKg: 25 },
      ],
    }
    const imported = await importFile()

    // RE5116 sem lote e sem peso da embalagem (2) + ZZ9999 fora da tabela (1).
    expect(countCargoReportImportAlerts(imported.rows, catalog)).toBe(3)
    expect(countCargoReportImportAlerts([], catalog)).toBe(0)
  })
})

describe('buildCargoReportSheetMatrix (recorte de 300 x 30)', () => {
  // Aba sintética (sem XLSX.write): `!ref` inflado como o de um arquivo malicioso.
  const inflatedSheet = {
    '!ref': 'A1:XFD1048576',
    A1: { t: 's', v: 'DENTRO-A1' },
    AD300: { t: 'n', v: 7 },
    B301: { t: 's', v: 'FORA' },
    AE2: { t: 's', v: 'FORA' },
    XFD1048576: { t: 's', v: 'FORA' },
  }

  it('o recorte padrão é 300 linhas x 30 colunas e as células fora dele não entram', () => {
    expect(CARGO_REPORT_IMPORT_SCAN).toMatchObject({ rows: 300, cols: 30 })

    const { matrix, firstRow, firstCol } = buildCargoReportSheetMatrix(inflatedSheet)

    expect(firstRow).toBe(1)
    expect(firstCol).toBe(0)
    expect(matrix).toHaveLength(300)
    expect(matrix.every((row) => row.length === 30)).toBe(true)
    expect(matrix[0][0]).toBe('DENTRO-A1')
    expect(matrix[299][29]).toBe(7)
    expect(matrix.flat()).not.toContain('FORA')
  })

  it('respeita os limites informados e a origem do !ref (C4)', () => {
    const sheet = {
      '!ref': 'C4:Z99',
      C4: { t: 's', v: 'topo' },
      D4: { t: 'e', v: 42 },
      E4: { t: 'b', v: true },
      F4: { t: 'n', v: 12 },
      C5: { t: 's', v: 'abaixo' },
      C6: { t: 's', v: 'FORA' },
    }
    const { matrix, firstRow, firstCol } = buildCargoReportSheetMatrix(sheet, { maxRows: 2, maxCols: 4 })

    expect(firstRow).toBe(4)
    expect(firstCol).toBe(2)
    expect(matrix).toEqual([
      ['topo', '', true, 12],
      ['abaixo', '', '', ''],
    ])
  })

  it('!ref de uma célula só e aba sem !ref', () => {
    expect(buildCargoReportSheetMatrix({ '!ref': 'B2', B2: { t: 's', v: 'x' } })).toEqual({
      matrix: [['x']],
      firstRow: 2,
      firstCol: 1,
    })
    expect(buildCargoReportSheetMatrix({})).toEqual({ matrix: [], firstRow: 1, firstCol: 0 })
    expect(buildCargoReportSheetMatrix(undefined)).toEqual({ matrix: [], firstRow: 1, firstCol: 0 })
  })
})
