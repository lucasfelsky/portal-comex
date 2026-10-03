// Conciliacao ERP (DBCorp) x Portal - F1: texto, colunas, parser, normalizacao e
// adaptador .xlsx. Fixtures 100% sinteticas (tests/fixtures/erp).
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  INCOTERMS,
  cleanCell,
  daysBetween,
  digitsOnly,
  foldText,
  normalizeDocNumber,
  parseErpDate,
  parseQuantityKg,
  parseRefEmbarque,
  parseVessel,
  squashVessel,
  supplierMatches,
} from '../../src/features/erp/erpText.js'
import {
  DBCORP_COLUMNS,
  findDbcorpHeaderRow,
  normalizeDbcorpHeader,
  resolveDbcorpColumns,
} from '../../src/features/erp/dbcorpColumns.js'
import { parseDbcorpRows } from '../../src/features/erp/parseDbcorpRows.js'
import {
  ERP_ITEM_ROW_KEYS,
  normalizeErpItemRows,
  validateErpItemRow,
} from '../../src/features/erp/erpItemRow.js'
import { dbcorpXlsxSource, readDbcorpWorkbook } from '../../src/features/erp/readDbcorpWorkbook.js'
import { INCOTERM_OPTIONS } from '../../src/features/processes/operationalOptions.js'
import {
  DBCORP_HEADERS,
  FINANCIAL_SENTINEL_STRINGS,
  looseRowsToMatrix,
  makeLooseRow,
} from '../fixtures/erp/dbcorpSynthetic.js'

function expectNoSentinel(value) {
  const text = JSON.stringify(value)
  for (const sentinel of FINANCIAL_SENTINEL_STRINGS) {
    expect(text).not.toContain(sentinel)
  }
}

function makeXlsx(matrix, { sheetName = 'Sheet', mutate } = {}) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(matrix)
  if (mutate) mutate(sheet, workbook)
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

describe('erpText - normalizadores', () => {
  it('caso-real: CR-08 celula " " vira vazio; NBSP e espacos sao colapsados', () => {
    expect(cleanCell(' ')).toBe('')
    expect(cleanCell('\u00a0\u00a0')).toBe('')
    expect(cleanCell('  LCL \u00a0 -   FOB  ')).toBe('LCL - FOB')
    expect(cleanCell(null)).toBe('')
    expect(cleanCell(undefined)).toBe('')
    expect(cleanCell(9012)).toBe('9012')
  })

  it('foldText: sem acento, maiusculas, espacos colapsados', () => {
    expect(foldText('  Itajaí   porto ')).toBe('ITAJAI PORTO')
    expect(foldText('Atracação')).toBe('ATRACACAO')
  })

  it('digitsOnly: PO 9036, PO-9036 e 09036 -> 9036; sem digito -> vazio', () => {
    expect(digitsOnly('PO 9036')).toBe('9036')
    expect(digitsOnly('PO-9036')).toBe('9036')
    expect(digitsOnly('09036')).toBe('9036')
    expect(digitsOnly('PO-09036')).toBe('9036')
    expect(digitsOnly('0')).toBe('0')
    expect(digitsOnly('ABC')).toBe('')
    expect(digitsOnly('')).toBe('')
    expect(digitsOnly(null)).toBe('')
  })

  it('normalizeDocNumber: maiusculas e so alfanumerico', () => {
    expect(normalizeDocNumber('ab-12 / 34.x')).toBe('AB1234X')
  })

  it('INCOTERMS tem paridade com INCOTERM_OPTIONS do Portal', () => {
    expect(INCOTERMS).toEqual(INCOTERM_OPTIONS)
  })
})

describe('erpText - parseErpDate', () => {
  it('caso-real: CR-11 serial do Excel vira a data ISO exata', () => {
    expect(parseErpDate(46301)).toEqual({ date: '2026-10-06', warning: null })
    expect(parseErpDate(46309)).toEqual({ date: '2026-10-14', warning: null })
    expect(parseErpDate(46281)).toEqual({ date: '2026-09-16', warning: null })
    expect(parseErpDate(46023)).toEqual({ date: '2026-01-01', warning: null })
  })

  it('serial com fracao: floor + aviso data_com_hora (nao adivinha fuso)', () => {
    expect(parseErpDate(46301.75)).toEqual({ date: '2026-10-06', warning: 'data_com_hora' })
  })

  it('serial fora de 36526..73050: vazio + data_fora_do_intervalo', () => {
    expect(parseErpDate(36525)).toEqual({ date: '', warning: 'data_fora_do_intervalo' })
    expect(parseErpDate(73051)).toEqual({ date: '', warning: 'data_fora_do_intervalo' })
    expect(parseErpDate(100)).toEqual({ date: '', warning: 'data_fora_do_intervalo' })
    expect(parseErpDate(36526).date).toBe('2000-01-01')
    expect(parseErpDate(73050).date).toBe('2099-12-31')
    expect(parseErpDate(Number.NaN)).toEqual({ date: '', warning: 'data_invalida' })
  })

  it('texto: YYYY-MM-DD, DD/MM/YYYY e datetime sem fuso', () => {
    expect(parseErpDate('2026-10-06')).toEqual({ date: '2026-10-06', warning: null })
    expect(parseErpDate('06/10/2026')).toEqual({ date: '2026-10-06', warning: null })
    expect(parseErpDate('2026-10-06T00:00:00')).toEqual({ date: '2026-10-06', warning: null })
    expect(parseErpDate('2026-10-06T23:59')).toEqual({ date: '2026-10-06', warning: null })
    expect(parseErpDate('2026-10-06T08:30:15.250')).toEqual({ date: '2026-10-06', warning: null })
  })

  it('texto com fuso (Z ou offset): vazio + data_com_fuso', () => {
    expect(parseErpDate('2026-10-06T00:00:00Z')).toEqual({ date: '', warning: 'data_com_fuso' })
    expect(parseErpDate('2026-10-06T00:00:00-03:00')).toEqual({ date: '', warning: 'data_com_fuso' })
    expect(parseErpDate('2026-10-06T00:00:00+0300')).toEqual({ date: '', warning: 'data_com_fuso' })
  })

  it('caso-real: CR-12 texto US m/d/yy nao e interpretado', () => {
    expect(parseErpDate('10/6/26')).toEqual({ date: '', warning: 'data_invalida' })
    expect(parseErpDate('10/06/26')).toEqual({ date: '', warning: 'data_invalida' })
    expect(parseErpDate('amanha')).toEqual({ date: '', warning: 'data_invalida' })
  })

  it('calendario validado por ida e volta (31/02, mes 13, hora 25)', () => {
    expect(parseErpDate('31/02/2026')).toEqual({ date: '', warning: 'data_invalida' })
    expect(parseErpDate('2026-13-01')).toEqual({ date: '', warning: 'data_invalida' })
    expect(parseErpDate('2026-10-06T25:00:00')).toEqual({ date: '', warning: 'data_invalida' })
    expect(parseErpDate('29/02/2028').date).toBe('2028-02-29')
    expect(parseErpDate('29/02/2027')).toEqual({ date: '', warning: 'data_invalida' })
  })

  it('vazio, nulo e objeto Date', () => {
    expect(parseErpDate('')).toEqual({ date: '', warning: null })
    expect(parseErpDate(' ')).toEqual({ date: '', warning: null })
    expect(parseErpDate(null)).toEqual({ date: '', warning: null })
    expect(parseErpDate(undefined)).toEqual({ date: '', warning: null })
    expect(parseErpDate(new Date(2026, 9, 6))).toEqual({ date: '', warning: 'data_invalida' })
  })

  it('daysBetween: aritmetica em UTC pelas partes (ida, volta, mudanca de mes)', () => {
    expect(daysBetween('2026-09-30', '2026-10-06')).toBe(6)
    expect(daysBetween('2026-10-06', '2026-09-30')).toBe(-6)
    expect(daysBetween('2026-10-06', '2026-10-06')).toBe(0)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
    expect(daysBetween('', '2026-03-01')).toBeNull()
  })
})

describe('erpText - quantidade, navio e fornecedor', () => {
  it('parseQuantityKg: numero, pt-BR com virgula, vazio e invalido', () => {
    expect(parseQuantityKg(1500.5)).toEqual({ value: 1500.5, warning: null })
    expect(parseQuantityKg('1.234,56')).toEqual({ value: 1234.56, warning: null })
    expect(parseQuantityKg('1234.56')).toEqual({ value: 1234.56, warning: null })
    expect(parseQuantityKg('800')).toEqual({ value: 800, warning: null })
    expect(parseQuantityKg('')).toEqual({ value: null, warning: 'quantidade_invalida' })
    expect(parseQuantityKg(null)).toEqual({ value: null, warning: 'quantidade_invalida' })
    expect(parseQuantityKg('abc')).toEqual({ value: null, warning: 'quantidade_invalida' })
    expect(parseQuantityKg(Number.POSITIVE_INFINITY)).toEqual({ value: null, warning: 'quantidade_invalida' })
  })

  it('caso-real: CR-15 navio em 5 formatos separa nome e viagem', () => {
    expect(parseVessel('ALFA MAERSK 639W')).toEqual({ name: 'ALFA MAERSK', voyage: '639W' })
    expect(parseVessel('GAMA SHIPPING CHILE/0BDOYW1MA')).toEqual({ name: 'GAMA SHIPPING CHILE', voyage: '0BDOYW1MA' })
    expect(parseVessel('DELTA FAR / 1')).toEqual({ name: 'DELTA FAR', voyage: '1' })
    expect(parseVessel('EPSILON CGM TORIO (0BDPJW1MA)')).toEqual({ name: 'EPSILON CGM TORIO', voyage: '0BDPJW1MA' })
    expect(parseVessel('OMEGA BLOOM 1628-089S')).toEqual({ name: 'OMEGA BLOOM', voyage: '1628-089S' })
  })

  it('parseVessel: placeholders e vazio viram vazio; nome sem viagem fica inteiro', () => {
    expect(parseVessel('AMOSTRA')).toEqual({ name: '', voyage: '' })
    expect(parseVessel('courier')).toEqual({ name: '', voyage: '' })
    expect(parseVessel('NACIONAL')).toEqual({ name: '', voyage: '' })
    expect(parseVessel('')).toEqual({ name: '', voyage: '' })
    expect(parseVessel('  ')).toEqual({ name: '', voyage: '' })
    expect(parseVessel('GAMA GRANDE')).toEqual({ name: 'GAMA GRANDE', voyage: '' })
  })

  it('caso-real: CR-23 squashVessel ignora V-/V./VOY, separador e acento', () => {
    const reference = squashVessel('OMEGA BLOOM', '1628-089S')
    expect(reference).toBe('OMEGABLOOM1628089S')
    expect(squashVessel('OMEGA BLOOM', 'V-1628-089S')).toBe(reference)
    expect(squashVessel('OMEGA BLOOM', 'V.1628-089S')).toBe(reference)
    expect(squashVessel('OMEGA BLOOM', 'VOY 1628-089S')).toBe(reference)
    expect(squashVessel('OMEGA BLOOM 1628-089S')).toBe(reference)
    for (const raw of ['OMEGA BLOOM/1628-089S', 'OMEGA BLOOM / 1628-089S', 'OMEGA BLOOM (1628-089S)', 'OMEGA BLOOM 1628-089S']) {
      const parsed = parseVessel(raw)
      expect(squashVessel(parsed.name, parsed.voyage)).toBe(reference)
    }
    expect(squashVessel('ALFA SÃO LUIS', '1')).toBe('ALFASAOLUIS1')
  })

  it('caso-real: CR-03 supplierMatches: igual, sufixo/complemento e diferente', () => {
    expect(supplierMatches('alfa chem', 'ALFA CHEM')).toBe('ok')
    expect(supplierMatches('ALFA CHEM', 'ALFA CHEM 2')).toBe('formato')
    expect(supplierMatches('ALFA CHEM 2', 'ALFA CHEM')).toBe('formato')
    expect(supplierMatches('BETA', 'BETA (GAMA)')).toBe('formato')
    expect(supplierMatches('BETA', 'BETAMAX')).toBe('diverge')
    expect(supplierMatches('ALFA CHEM', 'DELTA CHEM')).toBe('diverge')
    expect(supplierMatches('', 'ALFA CHEM')).toBe('diverge')
  })
})

describe('erpText - parseRefEmbarque', () => {
  it('consolidado: CON CN|DG nnn-aa', () => {
    expect(parseRefEmbarque('CON CN 929-26')).toMatchObject({
      shipmentKind: 'CONSOLIDADO', consolidatedRef: 'CON CN 929-26', warning: null,
    })
    expect(parseRefEmbarque(' con  dg 909-26 ')).toMatchObject({
      shipmentKind: 'CONSOLIDADO', consolidatedRef: 'CON DG 909-26',
    })
  })

  it('caso-real: CR-10 espaco duplo em LCL -  FOB SHANGHAI', () => {
    expect(parseRefEmbarque('LCL -  FOB SHANGHAI')).toEqual({
      shipmentKind: 'LCL', consolidatedRef: '', incoterm: 'FOB', originHint: 'SHANGHAI', warning: null,
    })
    expect(parseRefEmbarque('FCL - CFR HAMBURG')).toMatchObject({
      shipmentKind: 'FCL', incoterm: 'CFR', originHint: 'HAMBURG',
    })
    expect(parseRefEmbarque('LCL - FOB BUENOS AIRES').originHint).toBe('BUENOS AIRES')
  })

  it('AMOSTRA, COURIER e NACIONAL pela REF', () => {
    expect(parseRefEmbarque('AMOSTRA').shipmentKind).toBe('AMOSTRA')
    expect(parseRefEmbarque('COURIER').shipmentKind).toBe('AMOSTRA')
    expect(parseRefEmbarque('NACIONAL').shipmentKind).toBe('NACIONAL')
  })

  it('caso-real: CR-25 aereo por hipotese D-9b: os 4 formatos reais de DAP/FCA, espaco duplo e PO com AIR', () => {
    const cases = [
      ['DAP - ITAJAI', 'DAP', ''],
      ['DAP - ITAJAÍ', 'DAP', ''],
      ['DAP ITAJAI', 'DAP', ''],
      ['FCA - SHANGHAI ', 'FCA', 'SHANGHAI'],
      ['DAP  -  ITAJAI', 'DAP', ''],
    ]
    for (const [ref, incoterm, originHint] of cases) {
      expect(parseRefEmbarque(ref, 'ALFA SEA 900-26'), ref).toEqual({
        shipmentKind: 'AEREO', consolidatedRef: '', incoterm, originHint, warning: 'aereo_inferido',
      })
    }
    // 6o caso: PO com o token AIR e REF vazia.
    expect(parseRefEmbarque('', 'ALFA AIR 906-26')).toEqual({
      shipmentKind: 'AEREO', consolidatedRef: '', incoterm: '', originHint: '', warning: 'aereo_inferido',
    })
  })

  it('caso-real: CR-25 precedencia: FCL - FCA HALLE e LCL – FCA ELSTERAUE continuam FCL e LCL', () => {
    expect(parseRefEmbarque('FCL - FCA HALLE', 'ALFA SEA 900-26')).toEqual({
      shipmentKind: 'FCL', consolidatedRef: '', incoterm: 'FCA', originHint: 'HALLE', warning: null,
    })
    expect(parseRefEmbarque('LCL – FCA ELSTERAUE', 'ALFA SEA 900-26')).toEqual({
      shipmentKind: 'LCL', consolidatedRef: '', incoterm: 'FCA', originHint: 'ELSTERAUE', warning: null,
    })
  })

  it('caso-real: CR-25 as demais classes nao viram aereo', () => {
    for (const ref of ['CON CN 929-26', 'FCL - FOB BUSAN', 'LCL - FOB KOBE', 'AMOSTRA', 'COURIER', 'NACIONAL']) {
      expect(parseRefEmbarque(ref, 'ALFA SEA 900-26').warning, ref).toBeNull()
      expect(parseRefEmbarque(ref, 'ALFA SEA 900-26').shipmentKind, ref).not.toBe('AEREO')
    }
    // O token AIR so conta quando os passos 1 a 4 falham.
    expect(parseRefEmbarque('FCL - FOB BUSAN', 'ALFA AIR 906-26').shipmentKind).toBe('FCL')
  })

  it('caso-real: CR-26 PO com SAMPLE e REF LCL sai LCL (a REF manda, nao a palavra SAMPLE)', () => {
    const parsed = parseRefEmbarque('LCL -  FOB SHANGHAI', 'XI SAMPLE 905-26')
    expect(parsed.shipmentKind).toBe('LCL')
    expect(parsed.warning).toBeNull()
    expect(parsed.originHint).toBe('SHANGHAI')
  })

  it('REF desconhecida: INDEFINIDO + ref_desconhecida', () => {
    expect(parseRefEmbarque('XYZ 123', 'ALFA SEA 900-26')).toMatchObject({
      shipmentKind: 'INDEFINIDO', warning: 'ref_desconhecida',
    })
    expect(parseRefEmbarque('', 'ALFA SEA 900-26').warning).toBe('ref_desconhecida')
  })
})

describe('dbcorpColumns', () => {
  it('sao 39 colunas: 17 obrigatorias, 12 opcionais, 8 financeiras e 2 descartadas', () => {
    expect(DBCORP_COLUMNS).toHaveLength(39)
    const canonical = DBCORP_COLUMNS.filter((column) => column.group === 'canonical')
    expect(canonical).toHaveLength(29)
    expect(canonical.filter((column) => column.required)).toHaveLength(17)
    expect(canonical.filter((column) => !column.required)).toHaveLength(12)
    expect(DBCORP_COLUMNS.filter((column) => column.group === 'financial')).toHaveLength(8)
    expect(DBCORP_COLUMNS.filter((column) => column.group === 'discarded')).toHaveLength(2)
    // financeiras/descartadas nunca ganham chave canonica
    for (const column of DBCORP_COLUMNS.filter((item) => item.group !== 'canonical')) {
      expect(column.key).toBeNull()
    }
  })

  it('os cabecalhos exatos batem com a planilha (inclui "NF\'S " com espaco no fim)', () => {
    expect(DBCORP_COLUMNS.map((column) => column.header)).toEqual(DBCORP_HEADERS)
    expect(DBCORP_COLUMNS.find((column) => column.key === 'nfNumbers').header).toBe("NF'S ")
  })

  it('normalizeDbcorpHeader: trim, espacos, acento, maiusculas, º/° e apostrofo tipografico', () => {
    expect(normalizeDbcorpHeader("NF'S ")).toBe("NF'S")
    expect(normalizeDbcorpHeader("NF’S")).toBe("NF'S")
    expect(normalizeDbcorpHeader('Nº DI')).toBe('NO DI')
    expect(normalizeDbcorpHeader('N° DI')).toBe('NO DI')
    expect(normalizeDbcorpHeader('  data   emissão (di) ')).toBe('DATA EMISSAO (DI)')
    expect(normalizeDbcorpHeader('itemPedCpId')).toBe('ITEMPEDCPID')
  })

  it('resolveDbcorpColumns: cabecalho completo resolve as 29 chaves, inclusive "NF\'S "', () => {
    const resolved = resolveDbcorpColumns(DBCORP_HEADERS)
    expect(Object.keys(resolved.index)).toHaveLength(29)
    expect(resolved.index.nfNumbers).toBe(DBCORP_HEADERS.indexOf("NF'S "))
    expect(resolved.index.itemId).toBe(38)
    expect(resolved.missingRequired).toEqual([])
    expect(resolved.missingOptional).toEqual([])
    expect(resolved.unknown).toEqual([])
    expect(resolved.duplicated).toEqual([])
  })

  it('resolveDbcorpColumns: duplicada (vale a 1a), desconhecida e obrigatoria ausente com nome original', () => {
    const header = DBCORP_HEADERS.filter((name) => name !== 'PEDIDO' && name !== 'ItemPedCpId')
    header.push('STATUS', 'COLUNA EXTRA')
    const resolved = resolveDbcorpColumns(header)
    expect(resolved.missingRequired).toEqual(['PEDIDO', 'ItemPedCpId'])
    expect(resolved.duplicated).toEqual(['STATUS'])
    expect(resolved.unknown).toEqual(['COLUNA EXTRA'])
    expect(resolved.index.status).toBe(0)
  })

  it('resolveDbcorpColumns: colunas financeiras sao reconhecidas (nao viram desconhecidas) e nunca mapeadas', () => {
    const resolved = resolveDbcorpColumns(DBCORP_HEADERS)
    expect(resolved.unknown).toEqual([])
    expect(Object.keys(resolved.index)).not.toContain('MOEDA')
    expect(Object.values(resolved.index)).not.toContain(DBCORP_HEADERS.indexOf('MOEDA'))
  })

  it('findDbcorpHeaderRow: acha o cabecalho na linha 3 e nao acha alem da linha 5', () => {
    expect(findDbcorpHeaderRow([DBCORP_HEADERS])).toEqual({ rowIndex: 0, rowNumber: 1 })
    expect(findDbcorpHeaderRow([['Relatorio'], [], DBCORP_HEADERS])).toEqual({ rowIndex: 2, rowNumber: 3 })
    expect(findDbcorpHeaderRow([[], [], [], [], [], DBCORP_HEADERS])).toBeNull()
    expect(findDbcorpHeaderRow([['A', 'B']])).toBeNull()
  })
})

describe('parseDbcorpRows', () => {
  it('mapeia coluna -> chave com valores crus e numero da linha', () => {
    const matrix = looseRowsToMatrix([
      makeLooseRow({ itemId: 'A-1', pedido: 9012, etd: 46301, quantityKg: 1500.5 }),
      makeLooseRow({ itemId: 'A-2', pedido: 9013, etd: '06/10/2026' }),
    ])
    const { rows, warnings, headerRowNumber } = parseDbcorpRows(matrix)
    expect(headerRowNumber).toBe(1)
    expect(warnings).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ itemId: 'A-1', pedido: 9012, etd: 46301, quantityKg: 1500.5, rowNumber: 2 })
    expect(rows[1]).toMatchObject({ itemId: 'A-2', etd: '06/10/2026', rowNumber: 3 })
  })

  it('pula linhas totalmente vazias sem perder o numero das demais', () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'A-1' })])
    matrix.push(Array(39).fill(''), [], Array(39).fill(' '))
    matrix.push(looseRowsToMatrix([makeLooseRow({ itemId: 'A-2' })])[1])
    const { rows } = parseDbcorpRows(matrix)
    expect(rows.map((row) => [row.itemId, row.rowNumber])).toEqual([['A-1', 2], ['A-2', 6]])
  })

  it('caso-real: CR-13 DATA PRONTIDAO texto livre fica cru', () => {
    const matrix = looseRowsToMatrix([
      makeLooseRow({ itemId: 'A-1', readinessText: 'SEP 25TH' }),
      makeLooseRow({ itemId: 'A-2', readinessText: 'ASAP' }),
    ])
    const { rows } = parseDbcorpRows(matrix)
    expect(rows.map((row) => row.readinessText)).toEqual(['SEP 25TH', 'ASAP'])
  })

  it('caso-real: CR-14 IPI/II como fracao ficam crus no parser e viram numero na normalizacao', () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'A-1', ipiRate: 0.0325, iiRate: 0.1 })])
    const { rows } = parseDbcorpRows(matrix)
    expect(rows[0].ipiRate).toBe(0.0325)
    const normalized = normalizeErpItemRows(rows, { source: 'teste' })
    expect(normalized.rows[0].ipiRate).toBe(0.0325)
    expect(normalized.rows[0].iiRate).toBe(0.1)
  })

  it('caso-real: CR-16 ETA FINAL chega ao ErpItemRow (e e uma data ISO)', () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'A-1', etaFinal: 46309 })])
    const { rows } = parseDbcorpRows(matrix)
    expect(rows[0].etaFinal).toBe(46309)
    expect(normalizeErpItemRows(rows).rows[0].etaFinal).toBe('2026-10-14')
  })

  it('cabecalho na linha 3: aviso cabecalho_deslocado com a linha; linhas mantem a numeracao da planilha', () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'A-1' })], { leadingRows: [['Relatorio sintetico'], []] })
    const { rows, warnings, headerRowNumber } = parseDbcorpRows(matrix)
    expect(headerRowNumber).toBe(3)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ code: 'cabecalho_deslocado', ref: { rowNumber: 3 } })
    expect(warnings[0].message).toContain('linha 3')
    expect(rows[0].rowNumber).toBe(4)
  })

  it('coluna duplicada e coluna desconhecida geram aviso', () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'A-1' })])
    matrix[0] = [...matrix[0], 'STATUS', 'COLUNA EXTRA']
    const { warnings } = parseDbcorpRows(matrix)
    expect(warnings.map((warning) => warning.code).sort()).toEqual(['coluna_desconhecida', 'coluna_duplicada'])
  })

  it('sem cabecalho nas 5 primeiras linhas: erro explicito', () => {
    expect(() => parseDbcorpRows([['x'], ['y']])).toThrow('Cabeçalho do DBCorp não encontrado nas 5 primeiras linhas')
    expect(() => parseDbcorpRows([])).toThrow('Cabeçalho do DBCorp não encontrado')
  })

  it('cabecalho sem PEDIDO e ItemPedCpId: erro listando os nomes originais', () => {
    const matrix = looseRowsToMatrix([makeLooseRow()], {
      headers: DBCORP_HEADERS.filter((name) => name !== 'PEDIDO' && name !== 'ItemPedCpId'),
    })
    expect(() => parseDbcorpRows(matrix)).toThrow('Colunas obrigatórias ausentes no DBCorp: PEDIDO, ItemPedCpId')
  })

  it('nenhuma sentinela financeira em JSON.stringify({rows, warnings})', () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'A-1' }), makeLooseRow({ itemId: 'A-2' })])
    // sanidade: a matriz de entrada TEM as sentinelas
    expect(JSON.stringify(matrix)).toContain('FIN-SENTINEL-7731')
    const { rows, warnings } = parseDbcorpRows(matrix)
    expectNoSentinel({ rows, warnings })
  })
})

describe('normalizeErpItemRows', () => {
  it('caso-real: CR-08 celula " " vira vazio e PEDIDO numerico vira texto sem decimal', () => {
    const { rows } = normalizeErpItemRows(
      [makeLooseRow({ itemId: 'A-1', pedido: 9012, exporter: ' ', blAwb: '\u00a0' })],
      { source: 'teste' }
    )
    expect(rows[0].pedido).toBe('9012')
    expect(rows[0].exporter).toBe('')
    expect(rows[0].blAwb).toBe('')
    expect(rows[0].source).toBe('teste')
  })

  it('o ErpItemRow tem as 29 chaves canonicas, origem/linha e os 6 slots (37 chaves)', () => {
    expect(ERP_ITEM_ROW_KEYS).toHaveLength(37)
    expect(new Set(ERP_ITEM_ROW_KEYS).size).toBe(37)
    const { rows } = normalizeErpItemRows([makeLooseRow({ itemId: 'A-1' })], { source: 'teste' })
    expect(Object.keys(rows[0])).toEqual(ERP_ITEM_ROW_KEYS)
    expect(validateErpItemRow(rows[0])).toEqual([])
  })

  it('ItemPedCpId duplicado: mantem a 1a linha e avisa com as linhas descartadas', () => {
    const loose = [
      { ...makeLooseRow({ itemId: 'DUP-1', commercialName: 'PRIMEIRA' }), rowNumber: 2 },
      { ...makeLooseRow({ itemId: 'DUP-1', commercialName: 'SEGUNDA' }), rowNumber: 5 },
      { ...makeLooseRow({ itemId: 'DUP-1', commercialName: 'TERCEIRA' }), rowNumber: 9 },
    ]
    const { rows, warnings } = normalizeErpItemRows(loose)
    expect(rows).toHaveLength(1)
    expect(rows[0].commercialName).toBe('PRIMEIRA')
    const warning = warnings.find((item) => item.code === 'item_id_duplicado')
    expect(warning).toBeTruthy()
    expect(warning.message).toContain('5, 9')
    expect(warning.ref).toMatchObject({ rowNumber: 2, itemId: 'DUP-1' })
  })

  it('ItemPedCpId vazio: aviso item_id_vazio e a linha continua', () => {
    const { rows, warnings } = normalizeErpItemRows([{ ...makeLooseRow({ itemId: '' }), rowNumber: 7 }])
    expect(rows).toHaveLength(1)
    expect(warnings.find((item) => item.code === 'item_id_vazio').ref.rowNumber).toBe(7)
  })

  it('coluna de data obrigatoria com mais de 50% invalida bloqueia (blocking)', () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      makeLooseRow({ itemId: `B-${index}`, etd: index < 4 ? '10/6/26' : 46301 })
    )
    const { blocking } = normalizeErpItemRows(rows)
    expect(blocking).toMatchObject({ code: 'coluna_data_irreconhecivel', column: 'ETD (EMBARQUE)' })
    expect(blocking.message).toContain('ETD (EMBARQUE)')
  })

  it('nao bloqueia com menos de 5 celulas preenchidas, nem com exatamente 50%', () => {
    const few = Array.from({ length: 4 }, (_, index) => makeLooseRow({ itemId: `C-${index}`, eta: '10/6/26' }))
    expect(normalizeErpItemRows(few).blocking).toBeNull()
    const half = Array.from({ length: 6 }, (_, index) =>
      makeLooseRow({ itemId: `D-${index}`, eta: index < 3 ? '10/6/26' : 46309 })
    )
    expect(normalizeErpItemRows(half).blocking).toBeNull()
  })

  it('dados invalidos viram aviso por celula, sem derrubar a linha', () => {
    const { rows, warnings } = normalizeErpItemRows([
      { ...makeLooseRow({ itemId: 'E-1', etd: '10/6/26', eta: 100, diDate: 46301.5, quantityKg: 'abc' }), rowNumber: 4 },
    ])
    expect(rows[0].etd).toBe('')
    expect(rows[0].eta).toBe('')
    expect(rows[0].diDate).toBe('2026-10-06')
    expect(rows[0].quantityKg).toBeNull()
    expect(warnings.map((item) => item.code).sort()).toEqual([
      'data_com_hora', 'data_fora_do_intervalo', 'data_invalida', 'quantidade_invalida',
    ])
    expect(warnings.every((item) => item.ref.rowNumber === 4)).toBe(true)
  })

  it('slots saem da REF e do navio (CR-10, CR-15)', () => {
    const { rows } = normalizeErpItemRows([
      makeLooseRow({ itemId: 'F-1', refEmbarque: 'LCL -  FOB SHANGHAI', vesselRaw: 'OMEGA BLOOM 1628-089S' }),
    ])
    expect(rows[0]).toMatchObject({
      shipmentKind: 'LCL', incoterm: 'FOB', originHint: 'SHANGHAI', vesselName: 'OMEGA BLOOM', voyage: '1628-089S',
    })
  })

  it('slots ja preenchidos pela fonte (API) nao sao sobrescritos', () => {
    const { rows, warnings } = normalizeErpItemRows([
      makeLooseRow({
        itemId: 'G-1', refEmbarque: 'XYZ', shipmentKind: 'FCL', incoterm: 'CFR', originHint: 'HAMBURG',
        vesselRaw: 'DELTA BRIDGE/105W', vesselName: 'DELTA BRIDGE', voyage: '105W',
      }),
    ])
    expect(rows[0]).toMatchObject({
      shipmentKind: 'FCL', incoterm: 'CFR', originHint: 'HAMBURG', vesselName: 'DELTA BRIDGE', voyage: '105W',
    })
    expect(warnings.find((item) => item.code === 'ref_desconhecida')).toBeUndefined()
  })

  it('aviso aereo_inferido e ref_desconhecida saem na normalizacao', () => {
    const { warnings, rows } = normalizeErpItemRows([
      { ...makeLooseRow({ itemId: 'H-1', refEmbarque: 'DAP - ITAJAI' }), rowNumber: 2 },
      { ...makeLooseRow({ itemId: 'H-2', refEmbarque: 'XYZ 1' }), rowNumber: 3 },
    ])
    expect(rows.map((row) => row.shipmentKind)).toEqual(['AEREO', 'INDEFINIDO'])
    expect(warnings.map((item) => [item.code, item.ref.rowNumber])).toEqual([
      ['aereo_inferido', 2],
      ['ref_desconhecida', 3],
    ])
  })

  it('prefixo FEDEX:/DHL: na coluna BL / AWB vai para tracking', () => {
    const { rows } = normalizeErpItemRows([
      makeLooseRow({ itemId: 'I-1', blAwb: 'FEDEX: 123456789' }),
      makeLooseRow({ itemId: 'I-2', blAwb: 'DHL:99887766', tracking: 'JA-EXISTE' }),
      makeLooseRow({ itemId: 'I-3', blAwb: 'MAEU123' }),
    ])
    expect(rows[0]).toMatchObject({ blAwb: '', tracking: 'FEDEX: 123456789' })
    expect(rows[1]).toMatchObject({ blAwb: '', tracking: 'JA-EXISTE' })
    expect(rows[2]).toMatchObject({ blAwb: 'MAEU123', tracking: '' })
  })

  it('validateErpItemRow: chave desconhecida, ausente e tipos errados', () => {
    const { rows } = normalizeErpItemRows([makeLooseRow({ itemId: 'J-1' })])
    const errors = validateErpItemRow({ ...rows[0], extra: 1, etd: '06/10/2026', quantityKg: '10', itemId: 5 })
    expect(errors).toContain('chave desconhecida: extra')
    expect(errors).toContain('etd deve ser YYYY-MM-DD ou vazio')
    expect(errors).toContain('quantityKg deve ser número ou null')
    expect(errors).toContain('itemId deve ser texto')
    const { itemId, ...withoutItemId } = rows[0]
    expect(itemId).toBe('J-1')
    expect(validateErpItemRow(withoutItemId)).toContain('chave ausente: itemId')
    expect(validateErpItemRow(null)).toEqual(['a linha precisa ser um objeto'])
  })

  it('nenhuma sentinela financeira em JSON.stringify({rows, warnings, blocking})', () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'K-1', etd: '10/6/26' }), makeLooseRow({ itemId: 'K-2' })])
    const parsed = parseDbcorpRows(matrix)
    const normalized = normalizeErpItemRows(parsed.rows, { source: 'teste' })
    expectNoSentinel({ rows: normalized.rows, warnings: normalized.warnings, blocking: normalized.blocking })
  })
})

describe('readDbcorpWorkbook (xlsx real)', () => {
  const baseMatrix = () =>
    looseRowsToMatrix([
      makeLooseRow({ itemId: 'W-1', etd: 46301, eta: 46309 }),
      makeLooseRow({ itemId: 'W-2', etd: 46281, eta: 46309 }),
    ])

  it('le o arquivo; a data serial vira ISO exata depois da normalizacao', async () => {
    const result = await readDbcorpWorkbook(makeXlsx(baseMatrix()))
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].etd).toBe(46301)
    expect(result.meta).toEqual({ fileName: '', sheetName: 'Sheet', rowCount: 2 })
    const { rows } = normalizeErpItemRows(result.rows)
    expect(rows.map((row) => [row.etd, row.eta])).toEqual([
      ['2026-10-06', '2026-10-14'],
      ['2026-09-16', '2026-10-14'],
    ])
    expectNoSentinel(result)
  })

  it('aceita File e Uint8Array e guarda o nome do arquivo', async () => {
    const buffer = makeXlsx(baseMatrix())
    const fromFile = await readDbcorpWorkbook(new File([buffer], 'dados-sinteticos.xlsx'))
    expect(fromFile.meta.fileName).toBe('dados-sinteticos.xlsx')
    expect(fromFile.rows).toHaveLength(2)
    const fromBytes = await readDbcorpWorkbook(new Uint8Array(buffer))
    expect(fromBytes.rows).toHaveLength(2)
    await expect(readDbcorpWorkbook({ nome: 'x' })).rejects.toThrow('Arquivo inválido')
  })

  it('aba Sheet ausente: usa a 1a; com Sheet presente, ela vence mesmo fora de ordem', async () => {
    const renamed = await readDbcorpWorkbook(makeXlsx(baseMatrix(), { sheetName: 'Dados' }))
    expect(renamed.meta.sheetName).toBe('Dados')
    expect(renamed.rows).toHaveLength(2)

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['outra aba']]), 'Capa')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(baseMatrix()), 'Sheet')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const result = await readDbcorpWorkbook(buffer)
    expect(result.meta.sheetName).toBe('Sheet')
    expect(result.rows).toHaveLength(2)
  })

  it('!ref inflado para A1:AM20000 com 3 linhas reais: 2 linhas de dados', async () => {
    const buffer = makeXlsx(baseMatrix(), {
      mutate: (sheet) => {
        sheet['!ref'] = 'A1:AM20000'
      },
    })
    const result = await readDbcorpWorkbook(buffer)
    expect(result.rows).toHaveLength(2)
    expect(result.meta.rowCount).toBe(2)
  })

  it('linhas em branco antes do cabecalho: aviso cabecalho_deslocado e linhas com a numeracao do Excel', async () => {
    const matrix = looseRowsToMatrix([makeLooseRow({ itemId: 'W-1' })], { leadingRows: [[], []] })
    const result = await readDbcorpWorkbook(makeXlsx(matrix))
    expect(result.warnings.map((item) => item.code)).toEqual(['cabecalho_deslocado'])
    expect(result.warnings[0].ref.rowNumber).toBe(3)
    expect(result.rows[0].rowNumber).toBe(4)
  })

  it('12 linhas com maxRows:10: erro de limite', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeLooseRow({ itemId: `L-${index}` }))
    const buffer = makeXlsx(looseRowsToMatrix(rows))
    await expect(readDbcorpWorkbook(buffer, { maxRows: 10 })).rejects.toThrow(
      'A planilha passa de 10 linhas; exporte um recorte menor.'
    )
    const ok = await readDbcorpWorkbook(buffer, { maxRows: 12 })
    expect(ok.rows).toHaveLength(12)
  })

  it('o limite padrao e 5.000 linhas (mensagem com separador de milhar)', async () => {
    const rows = Array.from({ length: 5001 }, (_, index) => makeLooseRow({ itemId: `M-${index}` }))
    const buffer = makeXlsx(looseRowsToMatrix(rows))
    await expect(readDbcorpWorkbook(buffer)).rejects.toThrow(
      'A planilha passa de 5.000 linhas; exporte um recorte menor.'
    )
  }, 60000)

  it('CSV ou HTML com 06/10/2026 e rejeitado pela assinatura (nao e zip)', async () => {
    const encoder = new TextEncoder()
    const csv = encoder.encode('PEDIDO,ETD (EMBARQUE)\n9012,06/10/2026\n')
    const html = encoder.encode('<html><table><tr><td>06/10/2026</td></tr></table></html>')
    const message = 'Envie o .xlsx exportado do DBCorp (.xls/CSV/HTML não é aceito)'
    await expect(readDbcorpWorkbook(csv)).rejects.toThrow(message)
    await expect(readDbcorpWorkbook(html)).rejects.toThrow(message)
    await expect(readDbcorpWorkbook(new File([csv], 'dados.csv'))).rejects.toThrow(message)
  })

  it('arquivo acima de 10 MB e rejeitado antes de ler', async () => {
    const huge = new Uint8Array(10 * 1024 * 1024 + 1)
    huge.set([0x50, 0x4b, 0x03, 0x04])
    await expect(readDbcorpWorkbook(huge)).rejects.toThrow('10 MB')
    let read = false
    const fake = { size: 10 * 1024 * 1024 + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0) } }
    await expect(readDbcorpWorkbook(fake)).rejects.toThrow('10 MB')
    expect(read).toBe(false)
  })

  it('calendario 1904 e rejeitado', async () => {
    const buffer = makeXlsx(baseMatrix(), {
      mutate: (_sheet, workbook) => {
        workbook.Workbook = { WBProps: { date1904: true } }
      },
    })
    await expect(readDbcorpWorkbook(buffer)).rejects.toThrow('calendário 1904')
  })

  it('cabecalho irreconhecivel vira erro explicito', async () => {
    await expect(readDbcorpWorkbook(makeXlsx([['a', 'b'], [1, 2]]))).rejects.toThrow(
      'Cabeçalho do DBCorp não encontrado nas 5 primeiras linhas'
    )
  })

  it('dbcorpXlsxSource: fonte de arquivo .xlsx que usa o leitor', async () => {
    expect(dbcorpXlsxSource).toMatchObject({ inputKind: 'file', accept: '.xlsx' })
    expect(typeof dbcorpXlsxSource.id).toBe('string')
    expect(typeof dbcorpXlsxSource.label).toBe('string')
    const loaded = await dbcorpXlsxSource.load(makeXlsx(baseMatrix()))
    expect(loaded.rows).toHaveLength(2)
    expect(loaded.meta.rowCount).toBe(2)
  })
})
