// S4 do Relatório de Carga: gerador do Excel do FR.CMX.001 R5 (patch do sheet1.xml com fflate) e
// integridade do template publicado. Fixtures SINTÉTICAS (nunca o catálogo real).
// Ambiente node: o xlsx gerado é aberto com `unzipSync` (fflate) E com SheetJS.
import fs from 'node:fs'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import {
  CARGO_REPORT_XLSX_MIME,
  buildCargoReportXlsx,
} from '../../src/features/processes/cargoReportExcel'
import { createEmptyCargoReportRow, fromCargoReportDoc } from '../../src/features/processes/cargoReportFormModel'
import { readCargoReportWorkbook } from '../../src/features/processes/cargoReportImport'
import { buildCargoReportSheet } from '../../src/features/processes/cargoReportSheet'

const TEMPLATE_URL = new URL('../../src/features/processes/cargoReportTemplate.xlsx', import.meta.url)
const TEMPLATE = new Uint8Array(fs.readFileSync(TEMPLATE_URL))
const SHEET_PATH = 'xl/worksheets/sheet1.xml'

const EXPECTED_ENTRIES = [
  '[Content_Types].xml',
  '_rels/.rels',
  'docProps/app.xml',
  'docProps/core.xml',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/_rels/sheet1.xml.rels',
  'xl/drawings/drawing1.xml',
  'xl/drawings/_rels/drawing1.xml.rels',
  'xl/media/image1.png',
  'xl/printerSettings/printerSettings1.bin',
  'xl/featurePropertyBag/featurePropertyBag.xml',
  'xl/sharedStrings.xml',
  'xl/styles.xml',
  'xl/theme/theme1.xml',
]

// Partes que o gerador não pode alterar (byte a byte).
const UNTOUCHED = [
  'xl/styles.xml',
  'xl/theme/theme1.xml',
  'xl/drawings/drawing1.xml',
  'xl/drawings/_rels/drawing1.xml.rels',
  'xl/media/image1.png',
  'xl/printerSettings/printerSettings1.bin',
  'xl/featurePropertyBag/featurePropertyBag.xml',
  '[Content_Types].xml',
  'xl/workbook.xml',
  'xl/sharedStrings.xml',
]

const CATALOG = {
  items: [
    { code: 'AD5240', description: 'DEA FOAM', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'RE5116', description: 'DEGALAN', packagingType: 'CAIXA', netWeightKg: 25 },
    { code: 'MO5190', description: 'MONOMERO', packagingType: 'BALDE', netWeightKg: 5 },
    { code: 'AD5241', description: 'DEA FOAM 2', packagingType: 'BOMBONA', netWeightKg: 25 },
  ],
}
const PROCESS = { name: 'ACME SEA 021-26', duimpNumber: '25BR00001234567' }

function makeRow(id, overrides) {
  return { ...createEmptyCargoReportRow(id), ...overrides }
}

// Cenário do mock s4-confirm: FCL, 5 linhas, RE5116 sem lote nem peso, ZZ9999 sem embalagem.
function mockScenarioForm(overrides = {}) {
  return {
    ...fromCargoReportDoc({ revision: 4, cargoType: 'FCL', titleSuffix: 'ACME SEA 021-26' }),
    rows: [
      makeRow('a', {
        po: '4500123',
        dbcorpCode: 'AD5240',
        supplierDescription: 'DEA FOAM14339 - BOMBONA 25KG',
        sqDescription: 'DEA FOAM14339 - BB 25KG',
        supplierLot: 'DF2406A',
        quantityKg: 12500,
        packageWeightKg: 1.2,
      }),
      makeRow('b', {
        po: '4500123',
        dbcorpCode: 'RE5116',
        supplierDescription: 'DEGALAN 64/12 N - CX 25KG',
        sqDescription: 'DEGALAN 64/12 N - CX 25KG',
        quantityKg: 5000,
      }),
      makeRow('c', {
        po: '4500123',
        dbcorpCode: 'ZZ9999',
        supplierDescription: 'ADITIVO NOVO XR - 20KG',
        sqDescription: 'ADITIVO NOVO XR',
        supplierLot: 'XR0911',
        quantityKg: 800,
        packageWeightKg: 0.9,
      }),
      makeRow('d', {
        po: '4500123',
        dbcorpCode: 'MO5190',
        supplierDescription: 'MONOMERO EXEMPLO - BLD 5KG',
        sqDescription: 'MONOMERO EXEMPLO - BLD 5KG',
        supplierLot: 'ME2407',
        quantityKg: 1000,
        packageWeightKg: 0.4,
      }),
      makeRow('e', {
        po: '4500123',
        dbcorpCode: 'AD5241',
        supplierDescription: 'DEA FOAM14340 - BOMBONA 25KG',
        sqDescription: 'DEA FOAM14340 - BB 25KG',
        supplierLot: 'DF2406B',
        quantityKg: 2500,
        packageWeightKg: 1.2,
      }),
    ],
    notes: 'Palete 3 com avaria na embalagem externa, conteúdo íntegro.',
    labeledBy: 'Operador do armazém',
    labelMadeBy: 'Comex',
    receiptStatus: 'sem_ressalva',
    receivedDate: '2026-11-22',
    completedDate: '2026-11-23',
    nfNumber: '000.123.456',
    ...overrides,
  }
}

// S6: etiquetas, OK? e contagem OK são da conferência da logística (a linha b fica sem contagem OK).
const MOCK_CONFERENCE = {
  okByRowId: { a: true, b: true, d: true },
  countOkByRowId: { a: true, d: true },
  labelsByRowId: {
    a: { wms: 'WMS-77120', sq: 'SQ-001245' },
    b: { wms: 'WMS-77121', sq: 'SQ-001246' },
    d: { wms: 'WMS-77125', sq: 'SQ-001249' },
  },
  checkedByName: 'Operador Logística',
}

function buildSheet(form = mockScenarioForm(), conference = MOCK_CONFERENCE) {
  return buildCargoReportSheet(form, { process: PROCESS, conference, catalog: CATALOG })
}

function generate(sheet = buildSheet()) {
  const bytes = buildCargoReportXlsx(TEMPLATE, sheet)
  return {
    bytes,
    files: unzipSync(bytes),
    book: XLSX.read(bytes, { type: 'array', cellFormula: true }),
  }
}

function sheetXml(files) {
  return strFromU8(files[SHEET_PATH])
}

function cellXml(xml, ref) {
  const match = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(xml)
  return match ? match[0] : null
}

describe('template publicado (asset)', () => {
  const files = unzipSync(TEMPLATE)

  it('contém exatamente as 16 entradas do modelo saneado', () => {
    expect(Object.keys(files).sort()).toEqual([...EXPECTED_ENTRIES].sort())
  })

  it('só traz as strings da aba SQ QUIMICA, sem o catálogo Item x Emb.', () => {
    const shared = strFromU8(files['xl/sharedStrings.xml'])
    expect((shared.match(/<si>/g) ?? []).length).toBeLessThanOrEqual(40)
    expect(shared).not.toContain('Item x Emb.')
  })

  it('nenhum arquivo carrega nome de colaborador, metadado do SharePoint nem caminho local', () => {
    for (const [name, data] of Object.entries(files)) {
      const text = Buffer.from(data).toString('latin1')
      for (const forbidden of ['Fernando', 'USUARIO', 'absPath', 'customXml', 'sheet2', 'Dell Aquila', 'ContentTypeId']) {
        expect(text.includes(forbidden), `${name} contém ${forbidden}`).toBe(false)
      }
    }
  })

  it('workbook com 1 aba, recálculo ao abrir e propriedades do Portal', () => {
    const workbook = strFromU8(files['xl/workbook.xml'])
    expect((workbook.match(/<sheet /g) ?? []).length).toBe(1)
    expect(workbook).toContain('<sheet name="SQ QUIMICA"')
    expect(workbook).toContain('fullCalcOnLoad="1"')
    expect(strFromU8(files['docProps/core.xml'])).toContain('<dc:creator>SQ Química</dc:creator>')
    expect(strFromU8(files['docProps/core.xml'])).toContain('<cp:lastModifiedBy>Portal COMEX</cp:lastModifiedBy>')
  })

  it('mantém as caixas de seleção de célula do Excel 365', () => {
    expect(strFromU8(files['xl/featurePropertyBag/featurePropertyBag.xml'])).toContain('type="Checkbox"')
  })

  it('linhas 9-36 saem sem fórmula nem valor de erro nas colunas H, M e O', () => {
    const xml = strFromU8(files[SHEET_PATH])
    expect(/<f[ >]/.test(xml)).toBe(false)
    expect(xml).not.toContain('#N/A')
    expect(xml).not.toContain('Item x Emb.')
  })

  it('o SheetJS abre o template com uma aba só', () => {
    const book = XLSX.read(TEMPLATE, { type: 'array' })
    expect(book.SheetNames).toEqual(['SQ QUIMICA'])
  })
})

describe('cenário do mock (FCL, 5 linhas)', () => {
  const { bytes, files, book } = generate()
  const xml = sheetXml(files)
  const ws = book.Sheets['SQ QUIMICA']

  it('gera um zip válido com as mesmas 16 entradas e o MIME do xlsx', () => {
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Object.keys(files).sort()).toEqual([...EXPECTED_ENTRIES].sort())
    expect(CARGO_REPORT_XLSX_MIME).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(book.SheetNames).toEqual(['SQ QUIMICA'])
  })

  it('cabeçalho: título, nº da DUIMP e caixa FCL marcada', () => {
    expect(ws.D2.v).toBe('RELATÓRIO DE CARGA - ACME SEA 021-26')
    expect(ws.B5.v).toBe('Nº da DUIMP: 25BR00001234567')
    expect(ws.C7).toMatchObject({ t: 'b', v: true })
    expect(ws.D7).toMatchObject({ t: 'b', v: false })
    expect(ws.E7).toMatchObject({ t: 'b', v: false })
    expect(xml).toContain('<c r="C7" s="6" t="b"><v>1</v></c>')
    expect(ws.N2.v).toBe('FR.CMX.001')
    expect(ws.N5.v).toBe('REVISÃO: 005')
  })

  it('S6: etiquetas e contagem vêm da conferência; linha sem contagem OK deixa a coluna L como no modelo', () => {
    expect(ws.I10.v).toBe('WMS-77121')
    expect(ws.J10.v).toBe('SQ-001246')
    expect(cellXml(xml, 'L10')).not.toContain('<v>')
    expect(ws.L11?.v).toBeUndefined()
    expect(ws.L12.v).toBe('OK')
  })

  it('linha 9: textos, números e fórmulas com cache', () => {
    expect(ws.B9.v).toBe('4500123')
    expect(ws.C9.v).toBe('AD5240')
    expect(ws.F9.v).toBe('OK')
    expect(ws.G9.v).toBe('DF2406A')
    expect(ws.H9.f).toBe('G9&(LEFT(B9,3))')
    expect(ws.H9.v).toBe('DF2406A450')
    expect(ws.I9.v).toBe('WMS-77120')
    expect(ws.J9.v).toBe('SQ-001245')
    expect(ws.K9.v).toBe(12500)
    expect(ws.K9.t).toBe('n')
    expect(ws.L9.v).toBe('OK')
    expect(ws.L9.t).toBe('s')
    expect(ws.M9.v).toBe(25)
    expect(ws.M9.f).toBeUndefined()
    expect(ws.N9.v).toBe(1.2)
    expect(ws.O9.f).toBe('K9/M9')
    expect(ws.O9.v).toBe(500)
  })

  it('RE5116 sem lote: H vazia e sem fórmula; sem peso: N vazia', () => {
    expect(ws.C10.v).toBe('RE5116')
    expect(ws.H10).toBeUndefined()
    expect(cellXml(xml, 'H10')).not.toContain('<f>')
    expect(ws.N10).toBeUndefined()
    expect(ws.O10.f).toBe('K10/M10')
  })

  it('ZZ9999 sem embalagem: M e O vazias e sem fórmula; lote SQ calculado', () => {
    expect(ws.M11).toBeUndefined()
    expect(ws.O11).toBeUndefined()
    expect(cellXml(xml, 'M11')).not.toContain('<f>')
    expect(cellXml(xml, 'O11')).not.toContain('<f>')
    expect(ws.H11.v).toBe('XR0911450')
  })

  it('coluna OK? só nas linhas conferidas', () => {
    expect(ws.F9.v).toBe('OK')
    expect(ws.F10.v).toBe('OK')
    expect(ws.F11).toBeUndefined()
    expect(ws.F12.v).toBe('OK')
    expect(ws.F13).toBeUndefined()
  })

  it('linhas 14 a 36 ficam vazias, sem fórmula e sem erro', () => {
    for (let line = 14; line <= 36; line += 1) {
      for (const col of ['B', 'H', 'M', 'O']) {
        const cell = cellXml(xml, `${col}${line}`)
        expect(cell, `${col}${line}`).not.toBeNull()
        expect(cell).not.toContain('<f>')
      }
    }
    expect(xml).not.toContain('#N/A')
    expect(xml).not.toContain('#DIV/0!')
    expect(xml).not.toContain('Item x Emb.')
  })

  it('rodapé: rótulo + valor, datas dd/mm/aaaa, observações e ressalva', () => {
    expect(ws.I38.v).toBe('CONFERÊNCIA: Operador Logística')
    expect(ws.L37.v).toBe('ETIQUETAGEM: Operador do armazém')
    expect(ws.L38.v).toBe('CONFECÇÃO ETIQUETA: Comex')
    expect(ws.I39.v).toBe('DATA RECEBIMENTO: 22/11/2026')
    expect(ws.L39.v).toBe('DATA CONCLUSÃO: 23/11/2026')
    expect(ws.I40.v).toBe('Nº DA NF: 000.123.456')
    expect(ws.B38.v).toBe('Palete 3 com avaria na embalagem externa, conteúdo íntegro.')
    expect(ws.D40).toMatchObject({ t: 'b', v: false })
    expect(ws.E40).toMatchObject({ t: 'b', v: true })
    expect(xml).toContain('<c r="E40" s="87" t="b"><v>1</v></c>')
  })

  it('sem DUIMP no processo, B5 traz só o rótulo Nº da DUIMP: e o modelo não mostra mais Nº da DI', () => {
    const sheet = buildCargoReportSheet(mockScenarioForm(), { process: {}, conference: MOCK_CONFERENCE, catalog: CATALOG })
    const { book: other } = generate(sheet)
    expect(other.Sheets['SQ QUIMICA'].B5.v).toBe('Nº da DUIMP:')
  })

  it('com_ressalva marca D40 e não E40', () => {
    const { book: other } = generate(buildSheet(mockScenarioForm({ receiptStatus: 'com_ressalva' })))
    expect(other.Sheets['SQ QUIMICA'].D40.v).toBe(true)
    expect(other.Sheets['SQ QUIMICA'].E40.v).toBe(false)
  })

  it('campos vazios mantêm só o rótulo original do modelo', () => {
    const form = mockScenarioForm({
      labeledBy: '',
      labelMadeBy: '',
      receivedDate: '',
      completedDate: '',
      nfNumber: '',
      notes: '',
      receiptStatus: '',
    })
    const { book: other } = generate(buildSheet(form, { okByRowId: {}, checkedByName: '' }))
    const sheet = other.Sheets['SQ QUIMICA']
    expect(sheet.I38.v).toBe('CONFERÊNCIA:')
    expect(sheet.L37.v).toBe('ETIQUETAGEM:')
    expect(sheet.L38.v).toBe('CONFECÇÃO ETIQUETA:')
    expect(sheet.I39.v).toBe('DATA RECEBIMENTO:')
    expect(sheet.L39.v).toBe('DATA CONCLUSÃO:')
    expect(sheet.I40.v).toBe('Nº DA NF: ')
    expect(sheet.B38).toBeUndefined()
    expect(sheet.D40.v).toBe(false)
    expect(sheet.E40.v).toBe(false)
  })
})

describe('fidelidade ao modelo', () => {
  const { files } = generate()
  const templateFiles = unzipSync(TEMPLATE)
  const xml = sheetXml(files)

  it.each(UNTOUCHED)('%s sai byte a byte igual ao template', (name) => {
    expect(Buffer.from(files[name]).equals(Buffer.from(templateFiles[name]))).toBe(true)
  })

  it('o sheet1.xml mantém mesclas, formatação condicional, página e desenho', () => {
    expect(xml).toContain('<mergeCells count="14">')
    expect((xml.match(/<conditionalFormatting /g) ?? []).length).toBe(2)
    expect(xml).toContain('paperSize="9"')
    expect(xml).toContain('orientation="landscape"')
    expect(xml).toContain('<drawing r:id="rId2"/>')
    expect(xml).not.toContain('Item x Emb.')
    expect(xml).not.toContain('calcChain')
  })

  it('o estilo (s) de cada célula escrita é preservado', () => {
    const original = strFromU8(templateFiles[SHEET_PATH])
    for (const ref of ['D2', 'B5', 'C7', 'B9', 'G9', 'H9', 'K9', 'M9', 'O9', 'B38', 'I38', 'L37', 'D40']) {
      const before = /s="(\d+)"/.exec(cellXml(original, ref))[1]
      const after = /s="(\d+)"/.exec(cellXml(xml, ref))[1]
      expect(after, ref).toBe(before)
    }
  })

  it('o resultado é determinístico (mesma folha, mesmos bytes)', () => {
    const first = buildCargoReportXlsx(TEMPLATE, buildSheet())
    const second = buildCargoReportXlsx(TEMPLATE, buildSheet())
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true)
  })
})

describe('tipo de carga', () => {
  it('AÉREO: as 3 caixas desmarcadas, G6 = AÉREO e G7 = X', () => {
    const { book, files } = generate(buildSheet(mockScenarioForm({ cargoType: 'AEREO' })))
    const ws = book.Sheets['SQ QUIMICA']
    expect(ws.C7.v).toBe(false)
    expect(ws.D7.v).toBe(false)
    expect(ws.E7.v).toBe(false)
    expect(ws.G6.v).toBe('AÉREO')
    expect(ws.G7.v).toBe('X')
    expect(/s="(\d+)"/.exec(cellXml(sheetXml(files), 'G6'))[1]).toBe('8')
    expect(/s="(\d+)"/.exec(cellXml(sheetXml(files), 'G7'))[1]).toBe('7')
  })

  it('tipo vazio: nada em G6/G7 e as 3 caixas desmarcadas', () => {
    const { book } = generate(buildSheet(mockScenarioForm({ cargoType: '' })))
    const ws = book.Sheets['SQ QUIMICA']
    expect(ws.G6).toBeUndefined()
    expect(ws.G7).toBeUndefined()
    expect([ws.C7.v, ws.D7.v, ws.E7.v]).toEqual([false, false, false])
  })

  it('LCL e CONSOLIDADO marcam a caixa certa', () => {
    const lcl = generate(buildSheet(mockScenarioForm({ cargoType: 'LCL' }))).book.Sheets['SQ QUIMICA']
    expect([lcl.C7.v, lcl.D7.v, lcl.E7.v]).toEqual([false, true, false])
    const cons = generate(buildSheet(mockScenarioForm({ cargoType: 'CONSOLIDADO' }))).book.Sheets['SQ QUIMICA']
    expect([cons.C7.v, cons.D7.v, cons.E7.v]).toEqual([false, false, true])
  })
})

describe('escape e limites', () => {
  it('título com & < > " gera XML válido e lê o texto original', () => {
    const title = 'A&B <C> "D"'
    const { book, files } = generate(buildSheet(mockScenarioForm({ titleSuffix: title })))
    expect(book.Sheets['SQ QUIMICA'].D2.v).toBe(`RELATÓRIO DE CARGA - ${title}`)
    expect(sheetXml(files)).toContain('A&amp;B &lt;C&gt; &quot;D&quot;')
  })

  it('caractere de controle é removido do texto', () => {
    const { book } = generate(buildSheet(mockScenarioForm({ notes: 'obs\u0001erva\u0008ção\tok' })))
    expect(book.Sheets['SQ QUIMICA'].B38.v).toBe('observação\tok')
  })

  it('texto com padrões especiais de substituição é gravado como veio', () => {
    const { book } = generate(buildSheet(mockScenarioForm({ notes: "custo $& e $1 e $' ok" })))
    expect(book.Sheets['SQ QUIMICA'].B38.v).toBe("custo $& e $1 e $' ok")
  })

  it('28 linhas preenchem até a linha 36', () => {
    const rows = Array.from({ length: 28 }, (_, index) => makeRow(`r-${index}`, { po: `45${String(index).padStart(5, '0')}`, dbcorpCode: 'AD5240', supplierLot: `L${index}` }))
    const { book } = generate(buildSheet(mockScenarioForm({ rows })))
    const ws = book.Sheets['SQ QUIMICA']
    expect(ws.B36.v).toBe('4500027')
    expect(ws.H36.f).toBe('G36&(LEFT(B36,3))')
  })

  it('mais de 200 linhas na folha geram erro explícito (o formulário já bloqueia)', () => {
    const sheet = buildSheet()
    sheet.rows = Array.from({ length: 201 }, (_, index) => ({ ...sheet.rows[0], id: `r-${index}` }))
    expect(() => buildCargoReportXlsx(TEMPLATE, sheet)).toThrow(/200 linhas/)
  })

  it('célula ausente no modelo é erro explícito, nunca inserção silenciosa', () => {
    const broken = unzipSync(TEMPLATE)
    broken[SHEET_PATH] = new TextEncoder().encode(strFromU8(broken[SHEET_PATH]).replace(/<c r="I40"[^>]*\/>|<c r="I40"[\s\S]*?<\/c>/, ''))
    expect(() => buildCargoReportXlsx(zipSync(broken), buildSheet())).toThrow('Célula I40 não encontrada no modelo FR.CMX.001')
  })
})

describe('amostra para o Lucas', () => {
  it('grava o xlsx do cenário do mock quando CARGO_REPORT_SAMPLE_OUT existe', () => {
    const out = process.env.CARGO_REPORT_SAMPLE_OUT
    if (!out) return
    const bytes = buildCargoReportXlsx(TEMPLATE, buildSheet())
    fs.writeFileSync(out, bytes)
    expect(fs.statSync(out).size).toBeGreaterThan(10000)
  })
})

// ---------------------------------------------------------------------------
// Mais de 28 linhas: o gerador insere (N - 28) linhas clonando o estilo e desloca o rodapé.
// ---------------------------------------------------------------------------
function manyRowsForm(count, overrides = {}) {
  const rows = Array.from({ length: count }, (_, index) =>
    makeRow(`m-${index}`, {
      po: `45${String(index).padStart(5, '0')}`,
      dbcorpCode: index % 2 === 0 ? 'AD5240' : 'RE5116',
      supplierDescription: `DESCRICAO FORNECEDOR ${index}`,
      sqDescription: `DESCRICAO SQ ${index}`,
      supplierLot: `L${index}`,
      quantityKg: 1000 + index,
      packageWeightKg: 1.5,
    })
  )
  return mockScenarioForm({ rows, ...overrides })
}

// Conferência das amostras com muitas linhas: OK?, contagem e etiquetas só nas linhas dadas.
function manyRowsConference(count, { okIds = [], countOkIds = [] } = {}) {
  const labelsByRowId = Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`m-${index}`, { wms: `WMS-${index}`, sq: `SQ-${index}` }])
  )
  return {
    okByRowId: Object.fromEntries(okIds.map((id) => [id, true])),
    countOkByRowId: Object.fromEntries(countOkIds.map((id) => [id, true])),
    labelsByRowId,
    checkedByName: 'Operador Logística',
  }
}

const FOOTER_ROWS = { notes: 38, conference: 38, labeled: 37, labelMade: 38, received: 39, completed: 39, nf: 40, box: 40 }

describe.each([29, 45, 200])('xlsx com %i linhas (acima das 28 do modelo)', (count) => {
  const extra = count - 28
  const { bytes, files, book } = generate(
    buildSheet(
      manyRowsForm(count),
      manyRowsConference(count, { okIds: ['m-0', `m-${count - 1}`], countOkIds: ['m-0', `m-${count - 1}`] })
    )
  )
  const xml = sheetXml(files)
  const ws = book.Sheets['SQ QUIMICA']
  const lastRow = 8 + count

  it('abre no SheetJS com 1 aba e as mesmas 16 entradas', () => {
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Object.keys(files).sort()).toEqual([...EXPECTED_ENTRIES].sort())
    expect(book.SheetNames).toEqual(['SQ QUIMICA'])
  })

  it('a 1ª, a linha 36 e a última linha de dados têm os valores e as fórmulas certas', () => {
    for (const [index, line] of [[0, 9], [27, 36], [count - 1, lastRow]]) {
      expect(ws[`B${line}`].v).toBe(`45${String(index).padStart(5, '0')}`)
      expect(ws[`G${line}`].v).toBe(`L${index}`)
      expect(ws[`H${line}`].f).toBe(`G${line}&(LEFT(B${line},3))`)
      expect(ws[`H${line}`].v).toBe(`L${index}450`)
      expect(ws[`K${line}`].v).toBe(1000 + index)
      expect(ws[`O${line}`].f).toBe(`K${line}/M${line}`)
      expect(ws[`M${line}`].v).toBe(25)
    }
    expect(ws[`F${lastRow}`].v).toBe('OK')
    expect(ws[`L${lastRow}`].v).toBe('OK')
    expect(ws[`I${lastRow}`].v).toBe(`WMS-${count - 1}`)
    expect(ws[`J${lastRow}`].v).toBe(`SQ-${count - 1}`)
    expect(ws[`L${lastRow - 1}`]?.v).not.toBe('OK')
  })

  it('o rodapé desceu junto: rótulos, valores e caixas de ressalva nas linhas deslocadas', () => {
    expect(ws[`B${FOOTER_ROWS.notes + extra}`].v).toBe('Palete 3 com avaria na embalagem externa, conteúdo íntegro.')
    expect(ws[`I${FOOTER_ROWS.conference + extra}`].v).toBe('CONFERÊNCIA: Operador Logística')
    expect(ws[`L${FOOTER_ROWS.labeled + extra}`].v).toBe('ETIQUETAGEM: Operador do armazém')
    expect(ws[`L${FOOTER_ROWS.labelMade + extra}`].v).toBe('CONFECÇÃO ETIQUETA: Comex')
    expect(ws[`I${FOOTER_ROWS.received + extra}`].v).toBe('DATA RECEBIMENTO: 22/11/2026')
    expect(ws[`L${FOOTER_ROWS.completed + extra}`].v).toBe('DATA CONCLUSÃO: 23/11/2026')
    expect(ws[`I${FOOTER_ROWS.nf + extra}`].v).toBe('Nº DA NF: 000.123.456')
    expect(ws[`D${FOOTER_ROWS.box + extra}`]).toMatchObject({ t: 'b', v: false })
    expect(ws[`E${FOOTER_ROWS.box + extra}`]).toMatchObject({ t: 'b', v: true })
    // os rótulos fixos do modelo também desceram
    expect(ws[`B${37 + extra}`].v).toBe('OBSERVAÇÕES:')
    expect(ws[`I${37 + extra}`].v).toBe('RESPONSÁVEIS')
    expect(ws[`B${39 + extra}`].v).toBe('STATUS DO RECEBIMENTO:')
    expect(ws[`D${39 + extra}`].v).toBe('COM RESSALVA')
    // e o estilo da caixa foi preservado (checkbox de célula do Excel 365)
    expect(xml).toContain(`<c r="E${40 + extra}" s="87" t="b"><v>1</v></c>`)
  })

  it('mesclas do cabeçalho ficam e as do rodapé descem; dimensão e formatação condicional acompanham', () => {
    expect(xml).toContain('<mergeCells count="14">')
    for (const ref of ['B2:C4', 'D2:M4', 'N2:O4', 'N5:O7', 'B5:M5', 'B6:B7']) expect(xml).toContain(`<mergeCell ref="${ref}"/>`)
    for (const ref of [`B${37 + extra}:H${37 + extra}`, `I${37 + extra}:K${37 + extra}`, `L${37 + extra}:O${37 + extra}`, `I${38 + extra}:K${38 + extra}`, `L${38 + extra}:O${38 + extra}`, `I${39 + extra}:K${39 + extra}`, `L${39 + extra}:O${39 + extra}`, `I${40 + extra}:O${40 + extra}`]) {
      expect(xml).toContain(`<mergeCell ref="${ref}"/>`)
    }
    expect(xml).not.toContain('<mergeCell ref="B37:H37"/>')
    expect(xml).toContain(`<dimension ref="B1:O${40 + extra}"/>`)
    expect(xml).toContain(`<conditionalFormatting sqref="G9:G${36 + extra}">`)
    expect(xml).toContain(`<conditionalFormatting sqref="N9:N${36 + extra}">`)
    expect(ws['!ref']).toBe(`B1:O${40 + extra}`)
  })

  it('linhas contíguas 1 a (40 + extra), cada uma uma vez, com 14 células de dados (B a O)', () => {
    const rows = [...xml.matchAll(/<row r="(\d+)"/g)].map((match) => Number(match[1]))
    expect(rows).toEqual(Array.from({ length: 40 + extra }, (_, index) => index + 1))
    for (let line = 9; line <= 40 + extra; line += 1) {
      const row = new RegExp(`<row r="${line}"[\\s\\S]*?</row>`).exec(xml)[0]
      expect((row.match(/<c r="/g) ?? []).length).toBe(14)
      expect([...row.matchAll(/<c r="[A-Z]+(\d+)"/g)].every((match) => Number(match[1]) === line)).toBe(true)
    }
  })

  it('as linhas novas copiam o estilo de uma linha de dados (molde: linha 34)', () => {
    const styles = (line) => [...new RegExp(`<row r="${line}"[\\s\\S]*?</row>`).exec(xml)[0].matchAll(/ s="(\d+)"/g)].map((match) => match[1])
    expect(styles(35)).toEqual(styles(34))
    expect(styles(34 + extra)).toEqual(styles(34))
    // a borda grossa da última linha e o estilo da penúltima continuam no fim da tabela
    const template = strFromU8(unzipSync(TEMPLATE)[SHEET_PATH])
    const templateStyles = (line) => [...new RegExp(`<row r="${line}"[\\s\\S]*?</row>`).exec(template)[0].matchAll(/ s="(\d+)"/g)].map((match) => match[1])
    expect(styles(35 + extra)).toEqual(templateStyles(35))
    expect(styles(36 + extra)).toEqual(templateStyles(36))
    expect(styles(40 + extra)).toEqual(templateStyles(40))
  })

  it('área de impressão e cabeçalho repetido no workbook; página com largura 1 e altura livre', () => {
    const workbook = strFromU8(files['xl/workbook.xml'])
    expect(workbook).toContain(`'SQ QUIMICA'!$B$2:$O$${40 + extra}</definedName>`)
    expect(workbook).not.toContain("$B$2:$O$40</definedName>")
    expect(workbook).toContain(`<definedName name="_xlnm.Print_Titles" localSheetId="0">'SQ QUIMICA'!$8:$8</definedName>`)
    expect(xml).toContain('fitToHeight="0"')
    expect(xml).not.toContain('scale="48"')
    expect(xml).toContain('orientation="landscape"')
    expect(xml).toContain('<pageSetUpPr fitToPage="1"/>')
  })

  it('logo, estilos, tema e caixas de seleção seguem byte a byte iguais ao template', () => {
    const templateFiles = unzipSync(TEMPLATE)
    for (const name of ['xl/styles.xml', 'xl/theme/theme1.xml', 'xl/drawings/drawing1.xml', 'xl/media/image1.png', 'xl/featurePropertyBag/featurePropertyBag.xml', '[Content_Types].xml']) {
      expect(Buffer.from(files[name]).equals(Buffer.from(templateFiles[name])), name).toBe(true)
    }
    expect(xml).toContain('<drawing r:id="rId2"/>')
    expect(xml).not.toContain('<dataValidations')
    expect(xml).not.toContain('<hyperlinks')
  })

  it('sem fórmula solta nem erro, e o XML tem 1 só <sheetData>', () => {
    expect(xml).not.toContain('#N/A')
    expect(xml).not.toContain('#DIV/0!')
    expect((xml.match(/<sheetData>/g) ?? []).length).toBe(1)
    // 2 fórmulas por linha preenchida (lote SQ e nº de embalagens)
    expect((xml.match(/<f>/g) ?? []).length).toBe(2 * count)
  })
})

describe('xlsx acima de 28 linhas: ida e volta pelo importador da S5', () => {
  it('o arquivo gerado com 45 linhas é lido de volta com as 45 linhas', async () => {
    const { bytes } = generate(buildSheet(manyRowsForm(45)))
    const file = new File([bytes], 'volta.xlsx', { type: CARGO_REPORT_XLSX_MIME })

    const result = await readCargoReportWorkbook(file)

    expect(result.fatal).toBeNull()
    expect(result.rows).toHaveLength(45)
    expect(result.rows[0]).toMatchObject({ po: '4500000', dbcorpCode: 'AD5240', supplierLot: 'L0', quantityKg: 1000 })
    expect(result.rows[44]).toMatchObject({ po: '4500044', supplierLot: 'L44', quantityKg: 1044 })
    // S6: etiquetas e contagem são da conferência e não voltam pelo importador.
    expect(result.rows[0]).toMatchObject({ wmsLabel: '', sqLabel: '', count: null })
    expect(result.cargoType).toBe('FCL')
  })

  it('com 200 linhas também volta inteiro; o rodapé deslocado não vira linha', async () => {
    const { bytes } = generate(buildSheet(manyRowsForm(200)))
    const result = await readCargoReportWorkbook(new File([bytes], 'volta200.xlsx', { type: CARGO_REPORT_XLSX_MIME }))
    expect(result.fatal).toBeNull()
    expect(result.rows).toHaveLength(200)
    expect(result.rows[199].supplierLot).toBe('L199')
  })
})

describe('xlsx até 28 linhas segue idêntico ao de antes', () => {
  it('28 linhas não alteram workbook nem a página (sem fitToHeight, escala 48, área até a linha 40)', () => {
    const { files: out } = generate(buildSheet(manyRowsForm(28)))
    const templateFiles = unzipSync(TEMPLATE)
    expect(Buffer.from(out['xl/workbook.xml']).equals(Buffer.from(templateFiles['xl/workbook.xml']))).toBe(true)
    const xml = sheetXml(out)
    expect(xml).toContain('scale="48"')
    expect(xml).not.toContain('fitToHeight')
    expect(xml).toContain('<dimension ref="B1:O40"/>')
  })
})

describe('amostra com 45 linhas para o Lucas', () => {
  it('grava o xlsx de 45 linhas, FCL e COM RESSALVA, quando CARGO_REPORT_SAMPLE45_OUT existe', () => {
    const out = process.env.CARGO_REPORT_SAMPLE45_OUT
    if (!out) return
    const form = manyRowsForm(45, { receiptStatus: 'com_ressalva', cargoType: 'FCL' })
    fs.writeFileSync(out, buildCargoReportXlsx(TEMPLATE, buildSheet(form)))
    expect(fs.statSync(out).size).toBeGreaterThan(10000)
  })
})
