// S4 do Relatório de Carga: folha pura (Excel e impressão leem a mesma). Fixtures SINTÉTICAS.
import { describe, expect, it } from 'vitest'
import { CARGO_REPORT_MAX_ROWS, createEmptyCargoReportRow, fromCargoReportDoc } from '../../src/features/processes/cargoReportFormModel'
import {
  buildCargoReportFileName,
  buildCargoReportSheet,
  describeCargoReportAlerts,
  formatCargoDateBr,
  formatCargoDateTimeBr,
  formatCargoUnloadSummary,
  isPortalGeneratedCargoReport,
} from '../../src/features/processes/cargoReportSheet'

const CATALOG = {
  items: [
    { code: 'AD5240', description: 'DEA FOAM', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'RE5116', description: 'DEGALAN', packagingType: 'CAIXA', netWeightKg: 25 },
  ],
}

const PROCESS = { name: 'ACME SEA 021-26', duimpNumber: '25BR00001234567' }

function makeRow(overrides = {}) {
  return { ...createEmptyCargoReportRow('r-1'), ...overrides }
}

function makeForm(rows, overrides = {}) {
  return {
    ...fromCargoReportDoc({ revision: 2, cargoType: 'FCL', titleSuffix: 'ACME SEA 021-26' }),
    rows,
    ...overrides,
  }
}

describe('S9-D: buildCargoReportSheet com embalagem por fornecedor', () => {
  const SUPPLIERS = {
    exists: true,
    version: 1,
    aliases: [],
    entries: [
      { code: 'AD5240', supplierKey: 'ORION CHEM CO', supplierName: 'Orion Chem Co', packagingType: 'IBC', netWeightKg: 1000, packageWeightKg: 62 },
    ],
  }
  const form = makeForm([
    makeRow({ id: 'a', dbcorpCode: 'AD5240', supplierLot: 'L1', quantityKg: '2.000', packageWeightKg: '62' }),
    makeRow({ id: 'b', dbcorpCode: 'AD5240', supplierLot: 'L2', quantityKg: '2.000', packageWeightKg: '1,2' }),
  ])

  it('o peso líquido e o nº de embalagens de cada linha saem do fornecedor dela; sem o contexto vale o padrão', () => {
    const packaging = { supplierCatalog: SUPPLIERS, supplierNameByRowId: { a: 'Orion Chem, Co.', b: 'GOOYER CHEMICALS LTD' } }
    const sheet = buildCargoReportSheet(form, { process: PROCESS, catalog: CATALOG, packaging })
    expect(sheet.rows.map((row) => [row.netWeightKg, row.packages, row.packageWeightKg])).toEqual([
      [1000, 2, 62],
      [25, 80, 1.2],
    ])
    const plain = buildCargoReportSheet(form, { process: PROCESS, catalog: CATALOG })
    expect(plain.rows.map((row) => row.netWeightKg)).toEqual([25, 25])
  })

  it('o valor congelado ao concluir continua valendo sobre o fornecedor', () => {
    const frozen = makeForm([makeRow({ id: 'a', dbcorpCode: 'AD5240', quantityKg: '2.000', frozenNetWeightKg: 20, frozenPackages: 100 })])
    const packaging = { supplierCatalog: SUPPLIERS, supplierNameByRowId: { a: 'ORION CHEM CO' } }
    const [row] = buildCargoReportSheet(frozen, { process: PROCESS, catalog: CATALOG, packaging }).rows
    expect([row.netWeightKg, row.packages]).toEqual([20, 100])
  })
})

describe('buildCargoReportSheet', () => {
  it('monta cabeçalho, linhas calculadas, OK da conferência e rodapé vindo da conferência (S7)', () => {
    // O rodapé do `current` (legado) NÃO vale: a folha lê tudo da conferência da logística.
    const form = makeForm(
      [
        makeRow({
          id: 'a',
          po: '4500123',
          dbcorpCode: 'AD5240',
          supplierLot: 'DF2406A',
          quantityKg: '12.500',
          wmsLabel: 'WMS-LEGADO',
          count: '500',
          packageWeightKg: '1,2',
        }),
      ],
      {
        receivedDate: '2020-01-01',
        completedDate: '2026-11-23',
        nfNumber: 'NF-LEGADA',
        receiptStatus: 'sem_ressalva',
        notes: 'obs legada',
      }
    )
    const sheet = buildCargoReportSheet(form, {
      process: PROCESS,
      conference: {
        okByRowId: { a: true },
        countOkByRowId: { a: true },
        labelsByRowId: { a: { wms: 'WMS-77120', sq: 'SQ-0001' } },
        checkedByName: ' Operador Logística ',
        receivedDate: '2026-11-22',
        nfNumber: ' 000.123.456 ',
        receiptStatus: 'com_ressalva',
        notes: ' Palete 3 avariado ',
      },
      catalog: CATALOG,
    })

    expect(sheet).toMatchObject({
      titleSuffix: 'ACME SEA 021-26',
      title: 'RELATÓRIO DE CARGA - ACME SEA 021-26',
      duimpNumber: '25BR00001234567',
      cargoType: 'FCL',
      checkedByName: 'Operador Logística',
      receivedDateBr: '22/11/2026',
      completedDateBr: '23/11/2026',
      nfNumber: '000.123.456',
      receiptStatus: 'com_ressalva',
      notes: 'Palete 3 avariado',
      alerts: [],
    })
    // S7: "Etiquetado por"/"Etiqueta feita por" saíram da folha.
    expect(sheet).not.toHaveProperty('labeledBy')
    expect(sheet).not.toHaveProperty('labelMadeBy')
    expect(sheet.rows).toHaveLength(1)
    expect(sheet.rows[0]).not.toHaveProperty('count')
    expect(sheet.rows[0]).toMatchObject({
      po: '4500123',
      dbcorpCode: 'AD5240',
      ok: true,
      supplierLot: 'DF2406A',
      lotSq: 'DF2406A450',
      wmsLabel: 'WMS-77120',
      sqLabel: 'SQ-0001',
      quantityKg: 12500,
      countOk: true,
      netWeightKg: 25,
      packageWeightKg: 1.2,
      packages: 500,
    })
  })

  it('S6: etiquetas legadas do current não valem; sem conferência etiquetas vazias e contagem sem OK', () => {
    const form = makeForm([makeRow({ id: 'a', po: '1', wmsLabel: 'LEGADO-W', sqLabel: 'LEGADO-S', count: 40 })])
    for (const conference of [null, {}, { labelsByRowId: {} }]) {
      const sheet = buildCargoReportSheet(form, { process: PROCESS, conference, catalog: CATALOG })
      expect(sheet.rows[0]).toMatchObject({ wmsLabel: '', sqLabel: '', countOk: false })
    }
  })

  it('S7: DATA CONCLUSÃO = data de fechamento da logística quando a conferência está fechada; senão a do COMEX', () => {
    const form = makeForm([makeRow({ id: 'a', po: '1' })], { completedDate: '2026-11-23' })
    const open = buildCargoReportSheet(form, { process: PROCESS, conference: { status: 'aberta', closedDate: '' }, catalog: CATALOG })
    expect(open.completedDateBr).toBe('23/11/2026')
    const legacy = buildCargoReportSheet(form, { process: PROCESS, conference: {}, catalog: CATALOG })
    expect(legacy.completedDateBr).toBe('23/11/2026')
    const closed = buildCargoReportSheet(form, {
      process: PROCESS,
      conference: { status: 'fechada', closedDate: '2026-11-24' },
      catalog: CATALOG,
    })
    expect(closed.completedDateBr).toBe('24/11/2026')
  })

  it('S7: etiquetas saem em MAIÚSCULAS mesmo com dado legado em minúsculas; enum e data inválidos viram vazio', () => {
    const form = makeForm([makeRow({ id: 'a', po: '1' })])
    const sheet = buildCargoReportSheet(form, {
      process: PROCESS,
      conference: {
        labelsByRowId: { a: { wms: 'wms-ç1', sq: ' sq-ã2 ' } },
        receiptStatus: 'conforme',
        receivedDate: '22/11/2026',
      },
      catalog: CATALOG,
    })
    expect(sheet.rows[0]).toMatchObject({ wmsLabel: 'WMS-Ç1', sqLabel: 'SQ-Ã2' })
    expect(sheet.receiptStatus).toBe('')
    expect(sheet.receivedDateBr).toBe('')
  })

  it('descarta linhas vazias, não corta nas 28 do modelo, para no teto e usa ok=false sem conferência', () => {
    const rows = [makeRow({ id: 'vazia' }), ...Array.from({ length: CARGO_REPORT_MAX_ROWS + 3 }, (_, index) => makeRow({ id: `r-${index}`, po: `45${index}` }))]
    const sheet = buildCargoReportSheet(makeForm(rows), { process: PROCESS, conference: null, catalog: CATALOG })
    expect(sheet.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
    expect(sheet.rows.every((row) => row.ok === false)).toBe(true)
    expect(sheet.rows.some((row) => row.id === 'vazia')).toBe(false)
  })

  it('valores congelados vencem a tabela: mudar a tabela depois de concluir não muda a folha', () => {
    const frozenRow = makeRow({
      id: 'a',
      po: '4500123',
      dbcorpCode: 'AD5240',
      supplierLot: 'L1',
      quantityKg: 12500,
      frozenNetWeightKg: 25,
      frozenPackages: 500,
    })
    const changedCatalog = { items: [{ code: 'AD5240', description: 'X', packagingType: 'BOMBONA', netWeightKg: 50 }] }
    const emptyCatalog = { items: [] }

    for (const catalog of [CATALOG, changedCatalog, emptyCatalog, null]) {
      const sheet = buildCargoReportSheet(makeForm([frozenRow]), { process: PROCESS, conference: {}, catalog })
      expect(sheet.rows[0]).toMatchObject({ netWeightKg: 25, packages: 500 })
    }
  })

  it('gera alertas na ordem da linha (lote, peso da embalagem, sem embalagem)', () => {
    const form = makeForm([
      makeRow({ id: 'a', po: '1', dbcorpCode: 'RE5116', quantityKg: 5000 }),
      makeRow({ id: 'b', po: '1', dbcorpCode: 'ZZ9999', supplierLot: 'XR0911', packageWeightKg: 0.9, quantityKg: 800 }),
    ])
    const sheet = buildCargoReportSheet(form, { process: PROCESS, conference: {}, catalog: CATALOG })
    expect(sheet.alerts).toEqual([
      { rowId: 'a', code: 'RE5116', kind: 'missingLot' },
      { rowId: 'a', code: 'RE5116', kind: 'missingPackageWeight' },
      { rowId: 'b', code: 'ZZ9999', kind: 'noPackaging' },
    ])
    expect(sheet.rows[1]).toMatchObject({ netWeightKg: null, packages: null })
  })

  it('sem DUIMP ou conferência devolve strings vazias', () => {
    const sheet = buildCargoReportSheet(makeForm([]), { process: {}, conference: undefined, catalog: null })
    expect(sheet).toMatchObject({
      duimpNumber: '',
      checkedByName: '',
      receivedDateBr: '',
      completedDateBr: '',
      notes: '',
      nfNumber: '',
      receiptStatus: '',
    })
  })
})

describe('S8: buildCargoReportSheet com descarga, etiquetagem e data de recebimento derivada', () => {
  const conferenceWith = (overrides = {}) => ({ checkedByName: 'Operador Logística', ...overrides })
  const build = (conference) => buildCargoReportSheet(makeForm([]), { process: PROCESS, conference, catalog: null })

  it('traz início, fim, tempo total, resumo e etiquetagem OK', () => {
    const sheet = build(
      conferenceWith({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', labelingOk: true })
    )
    expect(sheet).toMatchObject({
      unloadStartBr: '24/11/2026 08:15',
      unloadEndBr: '24/11/2026 10:40',
      unloadTotalMinutes: 145,
      unloadSummary: 'DESCARGA: 24/11/2026, 08:15 ÀS 10:40 · TEMPO TOTAL: 145 MIN',
      labelingOk: true,
    })
  })

  it('receivedDateBr é o dia do início, mesmo com receivedDate divergente ou vazio', () => {
    expect(build(conferenceWith({ unloadStartAt: '2026-11-24T08:15', receivedDate: '2026-11-20' })).receivedDateBr).toBe('24/11/2026')
    expect(build(conferenceWith({ unloadStartAt: '2026-11-24T08:15', receivedDate: '' })).receivedDateBr).toBe('24/11/2026')
  })

  it('legado sem início: receivedDateBr vem do valor gravado', () => {
    expect(build(conferenceWith({ receivedDate: '2026-11-20' })).receivedDateBr).toBe('20/11/2026')
  })

  it('sem conferência ou sem descarga: vazio, null e false', () => {
    for (const conference of [undefined, conferenceWith()]) {
      expect(build(conference)).toMatchObject({
        receivedDateBr: '',
        unloadStartBr: '',
        unloadEndBr: '',
        unloadTotalMinutes: null,
        unloadSummary: '',
        labelingOk: false,
      })
    }
  })

  it('só labelingOk === true conta; fim antes do início não gera tempo total', () => {
    expect(build(conferenceWith({ labelingOk: 'true' })).labelingOk).toBe(false)
    const sheet = build(conferenceWith({ unloadStartAt: '2026-11-24T10:40', unloadEndAt: '2026-11-24T08:15' }))
    expect(sheet.unloadTotalMinutes).toBeNull()
    expect(sheet.unloadSummary).toBe('DESCARGA: 24/11/2026, 10:40 ÀS 08:15')
  })

  it('o tempo total não vira chave gravável: a folha nunca expõe "unloadMinutes"', () => {
    expect(build(conferenceWith())).not.toHaveProperty('unloadMinutes')
  })
})

describe('S8: formatCargoDateTimeBr / formatCargoUnloadSummary', () => {
  it('data e hora por split, sem Date; inválido vira vazio', () => {
    expect(formatCargoDateTimeBr('2026-11-24T08:15')).toBe('24/11/2026 08:15')
    expect(formatCargoDateTimeBr('2026-11-24T08:15:59')).toBe('24/11/2026 08:15')
    expect(formatCargoDateTimeBr('2026-11-24 08:15')).toBe('')
    expect(formatCargoDateTimeBr('')).toBe('')
    expect(formatCargoDateTimeBr(null)).toBe('')
  })

  it('resumo nos 4 formatos do Excel (X1)', () => {
    expect(formatCargoUnloadSummary('2026-11-24T08:15', '2026-11-24T10:40')).toBe(
      'DESCARGA: 24/11/2026, 08:15 ÀS 10:40 · TEMPO TOTAL: 145 MIN'
    )
    expect(formatCargoUnloadSummary('2026-11-24T23:30', '2026-11-25T01:10')).toBe(
      'DESCARGA: 24/11/2026 23:30 ATÉ 25/11/2026 01:10 · TEMPO TOTAL: 100 MIN'
    )
    expect(formatCargoUnloadSummary('2026-11-24T08:15', '')).toBe('DESCARGA: INÍCIO 24/11/2026 08:15')
    expect(formatCargoUnloadSummary('', '')).toBe('')
    // Fim sem início não gera linha (a tela bloqueia; aqui o resumo só não inventa).
    expect(formatCargoUnloadSummary('', '2026-11-24T10:40')).toBe('')
  })
})

describe('formatCargoDateBr', () => {
  it('converte por split, sem Date', () => {
    expect(formatCargoDateBr('2026-11-22')).toBe('22/11/2026')
    expect(formatCargoDateBr('2026-01-05')).toBe('05/01/2026')
  })

  it('vazio ou inválido vira vazio', () => {
    expect(formatCargoDateBr('')).toBe('')
    expect(formatCargoDateBr(null)).toBe('')
    expect(formatCargoDateBr('22/11/2026')).toBe('')
  })
})

describe('buildCargoReportFileName', () => {
  it('usa o prefixo do modelo e a extensão xlsx', () => {
    expect(buildCargoReportFileName('ACME SEA 021-26')).toBe('FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx')
  })

  it('remove caracteres proibidos e colapsa espaços', () => {
    const name = buildCargoReportFileName('A/B:C  D\\E*F?G"H<I>J|K\u0001L')
    expect(name).toBe('FR.CMX.001 - RELATORIO DE CARGA - A B C D E F G H I J K L.xlsx')
    expect(name.slice('FR.CMX.001 - RELATORIO DE CARGA - '.length)).not.toMatch(/[\\/:*?"<>|]/)
  })

  it('título vazio vira SEM TITULO e o nome cabe em 200 caracteres', () => {
    expect(buildCargoReportFileName('')).toBe('FR.CMX.001 - RELATORIO DE CARGA - SEM TITULO.xlsx')
    expect(buildCargoReportFileName(' / : ')).toBe('FR.CMX.001 - RELATORIO DE CARGA - SEM TITULO.xlsx')
    const long = buildCargoReportFileName('x'.repeat(500))
    expect(long.length).toBeLessThanOrEqual(200)
    expect(long.endsWith('.xlsx')).toBe(true)
  })
})

describe('isPortalGeneratedCargoReport', () => {
  const portalDoc = {
    type: 'cargoReport',
    uploadedByRole: 'admin',
    name: 'FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx',
  }

  it('nome do Portal enviado por admin é do Portal', () => {
    expect(isPortalGeneratedCargoReport(portalDoc)).toBe(true)
  })

  it('S7: nome do Portal enviado pela logística (fechamento da conferência) também é do Portal', () => {
    expect(isPortalGeneratedCargoReport({ ...portalDoc, uploadedByRole: 'logistica' })).toBe(true)
    expect(isPortalGeneratedCargoReport({ ...portalDoc, uploadedByRole: 'user' })).toBe(false)
  })

  it('xlsx manual, outro tipo, outro perfil ou extensão diferente não são', () => {
    expect(isPortalGeneratedCargoReport({ ...portalDoc, name: 'RELATORIO DE CARGA - ACME SEA 021-26.xlsx' })).toBe(false)
    expect(isPortalGeneratedCargoReport({ ...portalDoc, uploadedByRole: 'tecnico' })).toBe(false)
    expect(isPortalGeneratedCargoReport({ ...portalDoc, type: 'bl' })).toBe(false)
    expect(isPortalGeneratedCargoReport({ ...portalDoc, name: 'FR.CMX.001 - RELATORIO DE CARGA - X.pdf' })).toBe(false)
    expect(isPortalGeneratedCargoReport(null)).toBe(false)
  })
})

describe('describeCargoReportAlerts', () => {
  const lot = { code: 'RE5116', kind: 'missingLot' }
  const weight = { code: 'RE5116', kind: 'missingPackageWeight' }
  const none = { code: 'ZZ9999', kind: 'noPackaging' }

  it('1 alerta', () => {
    expect(describeCargoReportAlerts([lot])).toBe('falta lote em RE5116')
  })

  it('2 alertas usam "e" antes do último', () => {
    expect(describeCargoReportAlerts([lot, weight])).toBe('falta lote em RE5116 e falta peso da embalagem em RE5116')
  })

  it('3 alertas seguem o texto do mock', () => {
    expect(describeCargoReportAlerts([lot, weight, none])).toBe(
      'falta lote em RE5116, falta peso da embalagem em RE5116 e ZZ9999 sem embalagem cadastrada'
    )
  })

  it('lista vazia ou inválida devolve vazio', () => {
    expect(describeCargoReportAlerts([])).toBe('')
    expect(describeCargoReportAlerts(undefined)).toBe('')
  })
})
