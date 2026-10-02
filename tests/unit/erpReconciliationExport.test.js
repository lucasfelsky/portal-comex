// Conciliacao ERP (DBCorp) x Portal - F1: exportacao do resultado em .xlsx.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, writeFile: vi.fn() }
})

import {
  ERP_DIFF_KIND_LABELS,
  ERP_ONLY_CATEGORY_LABELS,
  buildErpReconciliationFileName,
  buildErpReconciliationSheets,
  exportErpReconciliationToXlsx,
} from '../../src/features/erp/erpReconciliationExport.js'
import { ERP_ONLY_CATEGORIES, runErpReconciliation } from '../../src/features/erp/reconcileErp.js'
import { parseDbcorpRows } from '../../src/features/erp/parseDbcorpRows.js'
import {
  FINANCIAL_SENTINEL_STRINGS,
  SCENARIO_TODAY,
  buildScenarioLooseRows,
  buildScenarioPortalProcesses,
  looseRowsToMatrix,
  makeLooseRow,
} from '../fixtures/erp/dbcorpSynthetic.js'

function scenarioResult() {
  const parsed = parseDbcorpRows(looseRowsToMatrix(buildScenarioLooseRows()))
  return runErpReconciliation({
    loaded: { rows: parsed.rows, warnings: parsed.warnings, meta: { fileName: 'sintetico.xlsx', rowCount: parsed.rows.length } },
    processes: buildScenarioPortalProcesses(),
    today: SCENARIO_TODAY,
    source: { id: 'dbcorp-xlsx', label: 'Planilha do DBCorp (.xlsx)' },
  })
}

beforeEach(() => {
  vi.mocked(XLSX.writeFile).mockClear()
})

describe('buildErpReconciliationSheets', () => {
  it('monta as 5 abas, na ordem, com colunas fixas', () => {
    const sheets = buildErpReconciliationSheets(scenarioResult())
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Resumo', 'Divergências', 'Só no ERP', 'Só no Portal', 'Avisos'])
    for (const sheet of sheets) {
      expect(sheet.columns.length).toBeGreaterThan(0)
      for (const row of sheet.rows) {
        expect(Object.keys(row)).toEqual(sheet.columns)
      }
    }
    const byName = Object.fromEntries(sheets.map((sheet) => [sheet.name, sheet]))
    expect(byName.Resumo.columns).toEqual(['Indicador', 'Valor'])
    expect(byName['Divergências'].columns).toEqual([
      'Processo', 'Categoria', 'Arquivado', 'Embarque (REF)', 'Regra de casamento', 'Campo', 'Comparação',
      'Tipo', 'Conta como divergência', 'Candidato à F2', 'Portal', 'ERP', 'Nota',
    ])
  })

  it('o Resumo inclui a fonte (sourceInfo) e as contagens', () => {
    const sheet = buildErpReconciliationSheets(scenarioResult())[0]
    const value = (label) => sheet.rows.find((row) => row.Indicador === label)?.Valor
    expect(value('Fonte')).toBe('Planilha do DBCorp (.xlsx)')
    expect(value('Arquivo')).toBe('sintetico.xlsx')
    expect(value('Gerado em')).toBe(SCENARIO_TODAY)
    expect(value('Linhas do ERP')).toBe(10)
    expect(value('Processos casados')).toBe(3)
    expect(value('Casados com divergências')).toBe(1)
    expect(value('Só no ERP')).toBe(5)
    expect(value('  Aguardando consolidação (provável)')).toBe(1)
    expect(value('Só no Portal (não encontrados nesta planilha)')).toBe(2)
    expect(value('  dos quais arquivados')).toBe(1)
  })

  it('cada diff, embarque so no ERP, processo so no Portal e aviso vira uma linha', () => {
    const result = scenarioResult()
    const sheets = Object.fromEntries(buildErpReconciliationSheets(result).map((sheet) => [sheet.name, sheet]))
    expect(sheets['Divergências'].rows).toHaveLength(result.matched.reduce((total, entry) => total + entry.diffs.length, 0))
    expect(sheets['Só no ERP'].rows).toHaveLength(result.erpOnly.length)
    expect(sheets['Só no Portal'].rows).toHaveLength(result.portalOnly.length)
    expect(sheets.Avisos.rows).toHaveLength(result.warnings.length)
    const etd = sheets['Divergências'].rows.find((row) => row.Campo === 'ETD')
    expect(etd).toMatchObject({
      Processo: 'BETA SEA 904-26', Tipo: ERP_DIFF_KIND_LABELS.divergente, 'Conta como divergência': 'Sim',
      'Candidato à F2': 'Sim', Portal: '2026-09-30', ERP: '2026-10-06',
    })
    expect(sheets['Só no ERP'].rows.map((row) => row.Categoria)).toContain('Aguardando consolidação (provável)')
    expect(sheets['Só no Portal'].rows.every((row) => row.Observação === 'Não encontrado nesta planilha')).toBe(true)
  })

  it('avisos exportam codigo, mensagem e referencias', () => {
    const rows = [makeLooseRow({ itemId: 'X-1', refEmbarque: 'DAP - ITAJAI' })].map((row) => ({ ...row, rowNumber: 7 }))
    const result = runErpReconciliation({
      loaded: { rows, warnings: [], meta: {} },
      processes: buildScenarioPortalProcesses(),
      today: SCENARIO_TODAY,
      source: { id: 'teste', label: 'Teste' },
    })
    const warnings = buildErpReconciliationSheets(result).find((sheet) => sheet.name === 'Avisos')
    expect(warnings.rows[0]).toMatchObject({ Código: 'aereo_inferido', Linha: 7, ItemPedCpId: 'X-1' })
  })

  it('resultado bloqueado: o Resumo informa o motivo e as demais abas ficam vazias', () => {
    const result = runErpReconciliation({
      loaded: { rows: [{ ...makeLooseRow({ itemId: 'X-1' }), rowNumber: 2 }], warnings: [], meta: {} },
      processes: [],
      today: SCENARIO_TODAY,
      source: { id: 'teste', label: 'Teste' },
    })
    const sheets = Object.fromEntries(buildErpReconciliationSheets(result).map((sheet) => [sheet.name, sheet]))
    expect(sheets.Resumo.rows.find((row) => row.Indicador === 'Conciliação bloqueada').Valor).toContain('não foram carregados')
    expect(sheets['Só no ERP'].rows).toEqual([])
    expect(sheets['Divergências'].rows).toEqual([])
  })

  it('aceita entrada vazia sem lancar', () => {
    const sheets = buildErpReconciliationSheets(null)
    expect(sheets).toHaveLength(5)
  })

  it('nenhuma coluna financeira nem sentinela financeira nas abas', () => {
    const sheets = buildErpReconciliationSheets(scenarioResult())
    const text = JSON.stringify(sheets)
    for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(text).not.toContain(sentinel)
    const columns = sheets.flatMap((sheet) => sheet.columns).join(' | ')
    expect(columns).not.toMatch(/moeda|pre[cç]o|frete|payment|vencimento|ptax|valor total|\bfob\b|\bcfr\b/i)
  })

  it('os rotulos de categoria tem paridade com ERP_ONLY_CATEGORIES', () => {
    expect(Object.keys(ERP_ONLY_CATEGORY_LABELS)).toEqual(ERP_ONLY_CATEGORIES.map((category) => category.key))
    for (const category of ERP_ONLY_CATEGORIES) {
      expect(ERP_ONLY_CATEGORY_LABELS[category.key]).toBe(category.label)
    }
  })
})

describe('buildErpReconciliationFileName', () => {
  it('usa a data LOCAL: conciliacao-erp-YYYY-MM-DD.xlsx', () => {
    expect(buildErpReconciliationFileName(new Date(2026, 9, 6, 0, 30))).toBe('conciliacao-erp-2026-10-06.xlsx')
    // fim do dia local nunca vira o dia seguinte (UTC) nem o anterior
    expect(buildErpReconciliationFileName(new Date(2026, 0, 1, 23, 59))).toBe('conciliacao-erp-2026-01-01.xlsx')
    expect(buildErpReconciliationFileName(new Date(2026, 11, 31, 0, 1))).toBe('conciliacao-erp-2026-12-31.xlsx')
  })
})

describe('exportErpReconciliationToXlsx', () => {
  it('monta o workbook com as 5 abas e baixa com o nome do dia', async () => {
    const result = scenarioResult()
    const fileName = await exportErpReconciliationToXlsx(result, new Date(2026, 9, 6, 12, 0))
    expect(fileName).toBe('conciliacao-erp-2026-10-06.xlsx')
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1)
    const [workbook, writtenName] = vi.mocked(XLSX.writeFile).mock.calls[0]
    expect(writtenName).toBe('conciliacao-erp-2026-10-06.xlsx')
    expect(workbook.SheetNames).toEqual(['Resumo', 'Divergências', 'Só no ERP', 'Só no Portal', 'Avisos'])
    const diffRows = XLSX.utils.sheet_to_json(workbook.Sheets['Divergências'])
    expect(diffRows.length).toBeGreaterThan(0)
    expect(diffRows[0]).toHaveProperty('Campo')
    const text = JSON.stringify(workbook.Sheets)
    for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(text).not.toContain(sentinel)
  })

  it('abas vazias mantem o cabecalho', async () => {
    await exportErpReconciliationToXlsx(null, new Date(2026, 9, 6))
    const [workbook] = vi.mocked(XLSX.writeFile).mock.calls[0]
    const header = XLSX.utils.sheet_to_json(workbook.Sheets['Só no Portal'], { header: 1 })[0]
    expect(header).toEqual(['Processo', 'Categoria', 'Arquivado', 'Observação'])
  })
})
