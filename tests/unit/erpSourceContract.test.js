// Conciliacao ERP (DBCorp) x Portal - F1: contrato da FONTE. O mesmo dataset
// entra (a) como planilha .xlsx e (b) como objetos "tipo API" (sem rowNumber,
// PEDIDO numerico, datas ISO com hora e slots ja preenchidos). Os dois passam
// por `runErpReconciliation` e o resultado, sem os campos que dependem da
// origem, tem de ser identico: e' isso que deixa a API do DBCorp (F5) entrar
// sem tocar normalizacao, agrupamento, casamento, UI nem guarda.
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { normalizeErpItemRows, validateErpItemRow } from '../../src/features/erp/erpItemRow.js'
import { parseDbcorpRows } from '../../src/features/erp/parseDbcorpRows.js'
import { dbcorpXlsxSource } from '../../src/features/erp/readDbcorpWorkbook.js'
import { runErpReconciliation } from '../../src/features/erp/reconcileErp.js'
import {
  SCENARIO_TODAY,
  buildScenarioApiRows,
  buildScenarioLooseRows,
  buildScenarioPortalProcesses,
  looseRowsToMatrix,
} from '../fixtures/erp/dbcorpSynthetic.js'

const ORIGIN_KEYS = new Set(['rowNumber', 'rowNumbers', 'source', 'sourceInfo'])

function stripOrigin(value) {
  if (Array.isArray(value)) return value.map(stripOrigin)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ORIGIN_KEYS.has(key))
        .map(([key, inner]) => [key, stripOrigin(inner)])
    )
  }
  return value
}

// Fonte "tipo API": nada de arquivo, so' um pedido que devolve `looseRows`.
const apiSource = {
  id: 'dbcorp-api-sintetica',
  label: 'API sintetica',
  inputKind: 'request',
  accept: undefined,
  load: async () => ({
    rows: buildScenarioApiRows(),
    warnings: [],
    meta: { fetchedAt: '2026-10-02T09:00:00', rowCount: buildScenarioApiRows().length },
  }),
}

function xlsxFile() {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(looseRowsToMatrix(buildScenarioLooseRows())), 'Sheet')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
}

async function reconcileWith(source, input) {
  const loaded = await source.load(input)
  return runErpReconciliation({
    loaded,
    processes: buildScenarioPortalProcesses(),
    today: SCENARIO_TODAY,
    source,
  })
}

describe('contrato ErpSource', () => {
  it('cada fonte declara id, label, inputKind (file|request) e load()', () => {
    for (const source of [dbcorpXlsxSource, apiSource]) {
      expect(typeof source.id).toBe('string')
      expect(typeof source.label).toBe('string')
      expect(['file', 'request']).toContain(source.inputKind)
      expect(typeof source.load).toBe('function')
    }
    expect(dbcorpXlsxSource.inputKind).toBe('file')
    expect(dbcorpXlsxSource.accept).toBe('.xlsx')
    expect(apiSource.inputKind).toBe('request')
  })

  it('load() devolve { rows, warnings, meta } nas duas fontes', async () => {
    const fromFile = await dbcorpXlsxSource.load(xlsxFile())
    const fromApi = await apiSource.load()
    for (const loaded of [fromFile, fromApi]) {
      expect(Array.isArray(loaded.rows)).toBe(true)
      expect(Array.isArray(loaded.warnings)).toBe(true)
      expect(typeof loaded.meta).toBe('object')
    }
    expect(fromFile.rows).toHaveLength(10)
    expect(fromApi.rows).toHaveLength(10)
    expect(fromApi.rows.every((row) => row.rowNumber === null)).toBe(true)
    expect(fromFile.rows.every((row) => Number.isInteger(row.rowNumber))).toBe(true)
  })
})

describe('normalizeErpItemRows e o ponto unico de normalizacao', () => {
  it('as duas formas de entrada geram o mesmo ErpItemRow (fora origem e linha)', async () => {
    const fromMatrix = normalizeErpItemRows(parseDbcorpRows(looseRowsToMatrix(buildScenarioLooseRows())).rows, { source: 'a' })
    const fromApi = normalizeErpItemRows(buildScenarioApiRows(), { source: 'b' })
    expect(fromApi.warnings).toEqual([])
    expect(fromMatrix.warnings).toEqual([])
    expect(fromApi.blocking).toBeNull()
    expect(stripOrigin(fromApi.rows)).toEqual(stripOrigin(fromMatrix.rows))
    for (const row of [...fromMatrix.rows, ...fromApi.rows]) {
      expect(validateErpItemRow(row)).toEqual([])
    }
    expect(fromMatrix.rows[0].source).toBe('a')
    expect(fromApi.rows[0].source).toBe('b')
    expect(fromApi.rows[0].rowNumber).toBeNull()
  })

  it('PEDIDO numerico, datas ISO com hora e serial chegam iguais', () => {
    const [fromApi] = normalizeErpItemRows(buildScenarioApiRows()).rows
    expect(fromApi.pedido).toBe('9036')
    expect(fromApi.etd).toBe('2026-10-06')
    expect(fromApi.eta).toBe('2026-10-14')
  })
})

describe('mesmo dataset, duas fontes, mesmo resultado', () => {
  it('matriz parseada x xlsx real x objetos "tipo API": deepEqual sem rowNumber/source/sourceInfo', async () => {
    const parsed = parseDbcorpRows(looseRowsToMatrix(buildScenarioLooseRows()))
    const fromMatrix = runErpReconciliation({
      loaded: { rows: parsed.rows, warnings: parsed.warnings, meta: { fileName: 'matriz', rowCount: parsed.rows.length } },
      processes: buildScenarioPortalProcesses(),
      today: SCENARIO_TODAY,
      source: { id: 'matriz', label: 'Matriz' },
    })
    const fromFile = await reconcileWith(dbcorpXlsxSource, new File([xlsxFile()], 'sintetico.xlsx'))
    const fromApi = await reconcileWith(apiSource)

    // sanidade: o dataset nao e trivial
    expect(fromApi.summary).toMatchObject({ erpRows: 10, shipments: 8, matched: 3, matchedWithDiffs: 1, erpOnly: 5, portalOnly: 2 })
    expect(fromApi.matched.flatMap((entry) => entry.diffs).length).toBeGreaterThan(0)

    expect(stripOrigin(fromFile)).toEqual(stripOrigin(fromApi))
    expect(stripOrigin(fromMatrix)).toEqual(stripOrigin(fromApi))
  })

  it('sourceInfo identifica a fonte e e o unico lugar onde elas diferem', async () => {
    const fromFile = await reconcileWith(dbcorpXlsxSource, new File([xlsxFile()], 'sintetico.xlsx'))
    const fromApi = await reconcileWith(apiSource)
    expect(fromFile.sourceInfo).toMatchObject({ source: 'dbcorp-xlsx', fileName: 'sintetico.xlsx', generatedOn: SCENARIO_TODAY })
    expect(fromApi.sourceInfo).toMatchObject({
      source: 'dbcorp-api-sintetica', label: 'API sintetica', fileName: '', fetchedAt: '2026-10-02T09:00:00', rowCount: 10,
    })
    expect(Object.keys(fromFile.sourceInfo)).toEqual(Object.keys(fromApi.sourceInfo))
  })
})
