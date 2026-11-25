// S3 do Relatorio de Carga: modulo puro do formulario FR.CMX.001 (papeis, formulas do Excel R5,
// alertas, normalizacao e payloads). Fixtures SINTETICAS: nunca o catalogo real.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CARGO_REPORT_CONFLICT_CODE,
  CARGO_REPORT_LIMITS,
  CARGO_REPORT_MAX_ROWS,
  CARGO_TYPE_OPTIONS,
  RECEIPT_STATUS_OPTIONS,
  buildCargoReportPayload,
  buildClosedConferencePayload,
  buildConcludedCargoReportPayload,
  buildConferencePayload,
  buildInitialCargoReport,
  buildReopenedCargoReportPayload,
  canCloseCargoConference,
  canConcludeCargoReport,
  canConferCargoReport,
  canEditCargoReport,
  canOpenCargoReport,
  canReopenCargoConference,
  canReopenCargoReportComex,
  canSaveCargoConference,
  cargoDatePart,
  computeCargoUnloadMinutes,
  computeLotSq,
  computePackages,
  countCargoReportAlerts,
  createEmptyCargoReportRow,
  deriveCargoReportRow,
  formatCargoNumber,
  freezeCargoReportRows,
  formatCargoReportTitle,
  fromCargoReportDoc,
  fromConferenceDoc,
  getCargoReportStage,
  isCargoReportRowEmpty,
  normalizeCargoLabel,
  parseCargoCount,
  parseCargoNumber,
  readDateTimeKey,
  resolveCargoReceivedDate,
  resolveNetWeightKg,
  toCargoDateKey,
  validateCargoUnload,
} from '../../src/features/processes/cargoReportFormModel'

const CATALOG = {
  items: [
    { code: 'AD5240', description: 'DEA FOAM', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'RE5116', description: 'DEGALAN', packagingType: 'CAIXA', netWeightKg: 25 },
    { code: 'MO5190', description: 'MONOMERO', packagingType: 'BALDE', netWeightKg: 5 },
    { code: 'AD5241', description: 'DEA FOAM 2', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'SEMPESO', description: 'SEM PESO', packagingType: '', netWeightKg: null },
  ],
}

function makeRow(overrides = {}) {
  return { ...createEmptyCargoReportRow('r-1'), ...overrides }
}

// Allowlist literal das rules (secao C do PLAN): copia de `isValidCargoReportCurrent`.
const RULE_ALLOWLIST = [
  'schemaVersion', 'formCode', 'formRevision', 'revision', 'status',
  'cargoType', 'titleSuffix', 'rows', 'notes',
  'receiptStatus', 'receivedDate', 'completedDate', 'nfNumber',
  'catalogVersion', 'lastGenerated', 'updatedAt', 'updatedById', 'updatedByName',
  'autofill', // S9-C: opcional (fora do hasAll das rules)
]

describe('papeis', () => {
  it('admin edita; logistica confere e nao edita', () => {
    expect(canEditCargoReport('admin')).toBe(true)
    expect(canEditCargoReport('logistica')).toBe(false)
    expect(canConferCargoReport('admin')).toBe(true)
    expect(canConferCargoReport('logistica')).toBe(true)
  })

  it('tecnico, faturamento e demais perfis nao abrem o formulario', () => {
    for (const role of ['admin', 'logistica']) expect(canOpenCargoReport(role)).toBe(true)
    for (const role of ['tecnico', 'faturamento', 'user', 'viewer', 'compras', undefined, '']) {
      expect(canOpenCargoReport(role)).toBe(false)
      expect(canEditCargoReport(role)).toBe(false)
      expect(canConferCargoReport(role)).toBe(false)
    }
  })
})

describe('opcoes', () => {
  it('tipos de carga: FCL, LCL, CONSOLIDADO e AEREO (rotulo com acento)', () => {
    expect(CARGO_TYPE_OPTIONS.map((option) => option.value)).toEqual(['FCL', 'LCL', 'CONSOLIDADO', 'AEREO'])
    expect(CARGO_TYPE_OPTIONS.find((option) => option.value === 'AEREO').label).toBe('AÉREO')
    expect(CARGO_TYPE_OPTIONS.find((option) => option.value === 'CONSOLIDADO').shortLabel).toBe('CONS.')
  })

  it('status do recebimento segue o vocabulario do FR R5', () => {
    expect(RECEIPT_STATUS_OPTIONS.map((option) => option.value)).toEqual(['', 'sem_ressalva', 'com_ressalva'])
    expect(CARGO_REPORT_CONFLICT_CODE).toBe('cargoReport/revision-conflict')
  })
})

describe('computeLotSq (H = G & LEFT(B,3))', () => {
  it('concatena o lote com as 3 primeiras letras do PO', () => {
    expect(computeLotSq('DF2406A', '4500123')).toBe('DF2406A450')
    expect(computeLotSq('ME2407', '4500123')).toBe('ME2407450')
  })

  it('lote vazio resulta em vazio (diferenca deliberada do Excel)', () => {
    expect(computeLotSq('', '4500123')).toBe('')
    expect(computeLotSq('   ', '4500123')).toBe('')
    expect(computeLotSq(null, '4500123')).toBe('')
  })

  it('PO curto ou vazio e espacos nas pontas', () => {
    expect(computeLotSq('DF2406A', '45')).toBe('DF2406A45')
    expect(computeLotSq('DF2406A', '')).toBe('DF2406A')
    expect(computeLotSq('  DF2406A  ', '  4500123  ')).toBe('DF2406A450')
  })
})

describe('resolveNetWeightKg (VLOOKUP na tabela Item x Emb.)', () => {
  it('resolve por codigo, ignorando caixa e espacos', () => {
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: 'ad5240' }), CATALOG)).toBe(25)
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: '  MO5190 ' }), CATALOG)).toBe(5)
  })

  it('codigo fora da tabela ou item sem peso resulta em null', () => {
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: 'ZZ9999' }), CATALOG)).toBeNull()
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: 'SEMPESO' }), CATALOG)).toBeNull()
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: '' }), CATALOG)).toBeNull()
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: 'AD5240' }), null)).toBeNull()
  })

  it('o peso congelado tem precedencia sobre a tabela', () => {
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: 'AD5240', frozenNetWeightKg: 20 }), CATALOG)).toBe(20)
  })
})

describe('computePackages (O = K/M)', () => {
  it('divide a quantidade pelo peso liquido, sem arredondar o dado', () => {
    expect(computePackages(12500, 25)).toBe(500)
    expect(computePackages(5000, 25)).toBe(200)
    expect(computePackages(2500, 25)).toBe(100)
    expect(computePackages(1000, 5)).toBe(200)
    expect(computePackages(100, 3)).toBeCloseTo(33.3333333, 5)
  })

  it('quantidade ou peso null/0 resulta em null', () => {
    expect(computePackages(null, 25)).toBeNull()
    expect(computePackages(0, 25)).toBeNull()
    expect(computePackages(1000, null)).toBeNull()
    expect(computePackages(1000, 0)).toBeNull()
  })

  it('aceita a quantidade ainda como texto de edicao', () => {
    expect(computePackages('12.500', 25)).toBe(500)
    expect(computePackages('abc', 25)).toBeNull()
  })
})

describe('alertas por linha', () => {
  it('codigo + lote vazio = missingLot', () => {
    const derived = deriveCargoReportRow(makeRow({ dbcorpCode: 'AD5240', packageWeightKg: 1.2 }), CATALOG)
    expect(derived.alerts).toEqual({ missingLot: true, missingPackageWeight: false, noPackaging: false })
  })

  it('codigo + peso da embalagem null = missingPackageWeight', () => {
    const derived = deriveCargoReportRow(makeRow({ dbcorpCode: 'AD5240', supplierLot: 'L1' }), CATALOG)
    expect(derived.alerts).toEqual({ missingLot: false, missingPackageWeight: true, noPackaging: false })
  })

  it('codigo fora da tabela (ou sem peso) = noPackaging', () => {
    const complete = { supplierLot: 'L1', packageWeightKg: 1 }
    expect(deriveCargoReportRow(makeRow({ dbcorpCode: 'ZZ9999', ...complete }), CATALOG).alerts.noPackaging).toBe(true)
    expect(deriveCargoReportRow(makeRow({ dbcorpCode: 'SEMPESO', ...complete }), CATALOG).alerts.noPackaging).toBe(true)
    expect(deriveCargoReportRow(makeRow({ dbcorpCode: 'AD5240', ...complete }), CATALOG).alerts.noPackaging).toBe(false)
  })

  it('linha sem codigo nao gera alerta', () => {
    const derived = deriveCargoReportRow(makeRow({ po: '4500123', sqDescription: 'ITEM' }), CATALOG)
    expect(derived.alerts).toEqual({ missingLot: false, missingPackageWeight: false, noPackaging: false })
  })

  it('derivados da linha completa: lote SQ, peso liquido e embalagens', () => {
    const derived = deriveCargoReportRow(
      makeRow({ po: '4500123', dbcorpCode: 'AD5240', supplierLot: 'DF2406A', quantityKg: 12500, packageWeightKg: 1.2 }),
      CATALOG
    )
    expect(derived.lotSq).toBe('DF2406A450')
    expect(derived.netWeightKg).toBe(25)
    expect(derived.packages).toBe(500)
  })

  it('o valor congelado de embalagens tem precedencia', () => {
    const derived = deriveCargoReportRow(
      makeRow({ dbcorpCode: 'AD5240', quantityKg: 12500, frozenPackages: 42 }),
      CATALOG
    )
    expect(derived.packages).toBe(42)
  })

  it('countCargoReportAlerts soma 3 no cenario do mock (RE5116 x2 + ZZ9999)', () => {
    const rows = [
      makeRow({ id: 'a', po: '4500123', dbcorpCode: 'AD5240', supplierLot: 'DF2406A', quantityKg: 12500, packageWeightKg: 1.2 }),
      makeRow({ id: 'b', po: '4500123', dbcorpCode: 'RE5116', quantityKg: 5000 }),
      makeRow({ id: 'c', po: '4500123', dbcorpCode: 'ZZ9999', supplierLot: 'XR0911', quantityKg: 800, packageWeightKg: 0.9 }),
      makeRow({ id: 'd', po: '4500123', dbcorpCode: 'MO5190', supplierLot: 'ME2407', quantityKg: 1000, packageWeightKg: 0.4 }),
    ]
    expect(countCargoReportAlerts(rows, CATALOG)).toBe(3)
  })
})

describe('numeros', () => {
  it('parseCargoNumber', () => {
    expect(parseCargoNumber('12.500')).toBe(12500)
    expect(parseCargoNumber('1,2')).toBe(1.2)
    expect(parseCargoNumber('')).toBeNull()
    expect(parseCargoNumber('abc')).toBeNaN()
  })

  it('parseCargoCount exige inteiro nao negativo', () => {
    expect(parseCargoCount('500')).toBe(500)
    expect(parseCargoCount('1.000')).toBe(1000)
    expect(parseCargoCount('')).toBeNull()
    expect(parseCargoCount('2,5')).toBeNaN()
    expect(parseCargoCount('x')).toBeNaN()
  })

  it('formatCargoNumber em pt-BR', () => {
    expect(formatCargoNumber(25, { decimals: 1 })).toBe('25,0')
    expect(formatCargoNumber(12500)).toBe('12.500')
    expect(formatCargoNumber(1.2)).toBe('1,2')
    expect(formatCargoNumber(5, { minDecimals: 1 })).toBe('5,0')
    expect(formatCargoNumber(100 / 3, { maxDecimals: 2 })).toBe('33,33')
    expect(formatCargoNumber(null)).toBe('')
    expect(formatCargoNumber(Number.NaN)).toBe('')
  })

  it('formatCargoReportTitle', () => {
    expect(formatCargoReportTitle('ACME SEA 021-26')).toBe('RELATÓRIO DE CARGA - ACME SEA 021-26')
  })
})

describe('buildInitialCargoReport', () => {
  const process = {
    id: 'P1',
    name: 'ACME SEA 021-26',
    processNumber: '4500123',
    category: 'AEREO',
    items: [
      { id: 'i1', commercialName: 'DEA FOAM14339 - BB 25KG', quantity: 12500 },
      { id: 'i2', commercialName: 'ADITIVO NOVO XR', quantity: 0 },
    ],
  }

  it('categoria AEREO preseleciona o tipo; desconhecida fica vazia', () => {
    expect(buildInitialCargoReport(process).cargoType).toBe('AEREO')
    expect(buildInitialCargoReport({ ...process, category: 'OUTRA' }).cargoType).toBe('')
    expect(buildInitialCargoReport({ ...process, category: undefined }).cargoType).toBe('')
  })

  it('titulo vem do nome do processo, com fallback no numero', () => {
    expect(buildInitialCargoReport(process).titleSuffix).toBe('ACME SEA 021-26')
    expect(buildInitialCargoReport({ ...process, name: '  ' }).titleSuffix).toBe('4500123')
  })

  it('linhas pre-preenchidas a partir dos itens (quantidade 0 vira null)', () => {
    const form = buildInitialCargoReport(process)
    expect(form.revision).toBe(0)
    expect(form.status).toBe('rascunho')
    expect(form.catalogVersion).toBe(0)
    expect(form.rows).toHaveLength(2)
    // S9-C: PO / PROCESSO = referência do processo (name), não mais o número do pedido.
    expect(form.rows[0]).toMatchObject({ po: 'ACME SEA 021-26', sqDescription: 'DEA FOAM14339 - BB 25KG', quantityKg: 12500 })
    expect(form.rows.every((row) => row.po === 'ACME SEA 021-26')).toBe(true)
    expect(form.rows[1].quantityKg).toBeNull()
    expect(new Set(form.rows.map((row) => row.id)).size).toBe(2)
  })

  it('sem referência (name vazio) o PO / PROCESSO cai no número do processo', () => {
    const form = buildInitialCargoReport({ ...process, name: '  ' })
    expect(form.rows.every((row) => row.po === '4500123')).toBe(true)
  })

  it('CONSOLIDADO usa a referência da PO de cada item (sem referência, o número da PO)', () => {
    const form = buildInitialCargoReport({
      ...process,
      category: 'CONSOLIDADO',
      purchaseOrders: [
        { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME' },
        { po: '4500902', reference: '', supplierName: 'NOVA' },
      ],
      items: [
        { id: 'i1', commercialName: 'A', quantity: 1, poNumber: '4500901' },
        { id: 'i2', commercialName: 'B', quantity: 2, poNumber: '4500902' },
        { id: 'i3', commercialName: 'C', quantity: 3, poNumber: '4500999' },
      ],
    })
    expect(form.rows.map((row) => row.po)).toEqual(['ACME SEA 011-26', '4500902', '4500999'])
  })

  it('o formulário novo já tem o autofill vazio (sem marcas)', () => {
    expect(buildInitialCargoReport(process).autofill).toEqual({ schemaVersion: 1, snapshotId: '', rows: {} })
  })

  it('CONSOLIDADO usa o PO de cada item', () => {
    const form = buildInitialCargoReport({
      ...process,
      category: 'CONSOLIDADO',
      processNumber: '',
      items: [
        { id: 'i1', commercialName: 'A', quantity: 1, poNumber: '4500111' },
        { id: 'i2', commercialName: 'B', quantity: 2, poNumber: '4500222' },
      ],
    })
    expect(form.cargoType).toBe('CONSOLIDADO')
    expect(form.rows.map((row) => row.po)).toEqual(['4500111', '4500222'])
  })

  it('corta no teto de linhas', () => {
    const items = Array.from({ length: CARGO_REPORT_MAX_ROWS + 7 }, (_, index) => ({ id: `i${index}`, commercialName: `Item ${index}`, quantity: 1 }))
    expect(buildInitialCargoReport({ ...process, items }).rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
  })
})

describe('buildCargoReportPayload', () => {
  const baseForm = () => ({
    ...fromCargoReportDoc({ revision: 3, status: 'rascunho', cargoType: 'FCL', titleSuffix: ' ACME ' }),
    rows: [
      makeRow({ id: 'a', po: ' 4500123 ', dbcorpCode: 'AD5240', supplierLot: 'DF2406A', quantityKg: '12.500', count: '500', packageWeightKg: '1,2' }),
      makeRow({ id: 'vazia' }),
      makeRow({ id: 'b', po: '4500123', dbcorpCode: 'RE5116', quantityKg: 5000, count: null, packageWeightKg: null }),
    ],
    notes: '  obs  ',
  })

  it('descarta linhas vazias, aplica trim e soma 1 na revisao', () => {
    const { payload, errors } = buildCargoReportPayload(baseForm(), { catalogVersion: 3 })
    expect(errors).toEqual([])
    expect(payload.revision).toBe(4)
    expect(payload.catalogVersion).toBe(3)
    expect(payload.titleSuffix).toBe('ACME')
    expect(payload.notes).toBe('obs')
    expect(payload.rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect(payload.rows[0]).toMatchObject({ po: '4500123', quantityKg: 12500, count: 500, packageWeightKg: 1.2 })
  })

  it('numero invalido gera erro com rowId e campo, sem gravar numero', () => {
    const form = baseForm()
    form.rows[0].quantityKg = 'abc'
    form.rows[2].count = '2,5'
    const { errors } = buildCargoReportPayload(form)
    expect(errors).toEqual([
      { rowId: 'a', field: 'quantityKg', message: 'Número inválido' },
      { rowId: 'b', field: 'count', message: 'Número inválido' },
    ])
  })

  it('linhas acima do teto geram o erro do limite', () => {
    const form = baseForm()
    form.rows = Array.from({ length: CARGO_REPORT_MAX_ROWS + 1 }, (_, index) => makeRow({ id: `r-${index}`, po: `45${index}` }))
    const { payload, errors } = buildCargoReportPayload(form)
    expect(errors).toEqual([
      {
        field: 'rows',
        message:
          'O relatório já tem 200 linhas, o limite do Portal. Para mais itens, gere um segundo relatório.',
      },
    ])
    expect(payload.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
  })

  it('o payload nao grava colunas calculadas nem DUIMP e cada linha tem 13 chaves', () => {
    const { payload } = buildCargoReportPayload(baseForm())
    const serialized = JSON.stringify(payload)
    for (const forbidden of ['lotSq', 'netWeightKg', '"packages"', 'duimp', 'Duimp']) {
      expect(serialized).not.toContain(forbidden)
    }
    for (const row of payload.rows) expect(Object.keys(row)).toHaveLength(13)
  })

  it('as chaves do payload estao contidas na allowlist da rule', () => {
    const { payload } = buildCargoReportPayload(baseForm())
    for (const key of Object.keys(payload)) expect(RULE_ALLOWLIST).toContain(key)
    // S7: 18 chaves no `current` (sem labeledBy/labelMadeBy); o repositório acrescenta updatedAt/ById/ByName.
    // S9-C: + `autofill` opcional na allowlist (19); sem ele o payload segue com 15 chaves.
    expect(RULE_ALLOWLIST).toHaveLength(19)
    expect(Object.keys(payload)).toHaveLength(RULE_ALLOWLIST.length - 4)
    expect(payload).not.toHaveProperty('autofill')
    expect(payload).not.toHaveProperty('labeledBy')
    expect(payload).not.toHaveProperty('labelMadeBy')
  })

  it('a allowlist literal confere com o texto de firestore.rules', () => {
    const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8')
    const body = rules.slice(rules.indexOf('function isValidCargoReportCurrent'))
    const first = body.slice(body.indexOf('hasOnly(['), body.indexOf('])'))
    const keys = [...first.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1])
    expect(keys.sort()).toEqual([...RULE_ALLOWLIST].sort())
  })

  it('preserva frozen*, lastGenerated e completedDate do doc', () => {
    const lastGenerated = { documentId: 'd1', revision: 2, at: '2026-11-22T10:00:00Z', byId: 'u1' }
    const form = fromCargoReportDoc({
      revision: 5,
      completedDate: '2026-11-22',
      lastGenerated,
      rows: [{ id: 'a', po: '1', frozenNetWeightKg: 25, frozenPackages: 500 }],
    })
    const { payload } = buildCargoReportPayload(form)
    expect(payload.rows[0]).toMatchObject({ frozenNetWeightKg: 25, frozenPackages: 500 })
    expect(payload.lastGenerated).toEqual(lastGenerated)
    expect(payload.completedDate).toBe('2026-11-22')
    expect(payload.revision).toBe(6)
  })

  it('mantem o status do form e normaliza enums e datas invalidas', () => {
    const { payload } = buildCargoReportPayload({
      ...baseForm(),
      status: 'concluido',
      cargoType: 'AÉREO',
      receiptStatus: 'conforme',
      receivedDate: '22/11/2026',
    })
    expect(payload.status).toBe('concluido')
    expect(payload.cargoType).toBe('')
    expect(payload.receiptStatus).toBe('')
    expect(payload.receivedDate).toBe('')
  })

  it('formulario novo (revisao 0) grava a revisao 1', () => {
    expect(buildCargoReportPayload(buildInitialCargoReport({ name: 'X', items: [] })).payload.revision).toBe(1)
  })
})

const CONFERENCE_KEYS = [
  'schemaVersion', 'revision', 'status', 'okByRowId', 'countOkByRowId', 'labelsByRowId', 'checkedByName',
  'receiptStatus', 'receivedDate', 'nfNumber', 'notes', 'unloadStartAt', 'unloadEndAt', 'labelingOk',
  'closedDate', 'closedById', 'closedByName', 'closedDocumentId',
]

describe('buildConferencePayload', () => {
  it('poda ids orfaos, converte para booleano, soma 1 na revisao e devolve as 18 chaves (S8)', () => {
    const payload = buildConferencePayload(
      { okByRowId: { a: true, b: 0, orfa: true }, revision: 2 },
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      { actorName: '  Operador  ' }
    )
    expect(payload).toEqual({
      schemaVersion: 1,
      revision: 3,
      status: 'aberta',
      okByRowId: { a: true, b: false },
      countOkByRowId: {},
      labelsByRowId: {},
      checkedByName: 'Operador',
      receiptStatus: '',
      receivedDate: '',
      nfNumber: '',
      notes: '',
      unloadStartAt: '',
      unloadEndAt: '',
      labelingOk: false,
      closedDate: '',
      closedById: '',
      closedByName: '',
      closedDocumentId: '',
    })
    expect(Object.keys(payload)).toEqual(CONFERENCE_KEYS)
    // O repositório acrescenta updatedAt/updatedById/updatedByName: 18 + 3 = 21 chaves nas rules.
    expect(CONFERENCE_KEYS).toHaveLength(18)
  })

  it('S6: poda id orfao nos 3 mapas e força booleano na contagem', () => {
    const payload = buildConferencePayload(
      {
        okByRowId: { a: true, orfa: true },
        countOkByRowId: { a: 1, b: false, orfa: true },
        labelsByRowId: { a: { wms: 'W1', sq: 'S1' }, orfa: { wms: 'X', sq: 'Y' } },
        revision: 0,
      },
      [{ id: 'a' }, { id: 'b' }],
      { actorName: 'Op' }
    )
    expect(payload.okByRowId).toEqual({ a: true })
    expect(payload.countOkByRowId).toEqual({ a: true, b: false })
    expect(payload.labelsByRowId).toEqual({ a: { wms: 'W1', sq: 'S1' } })
  })

  it('S7: etiqueta vira MAIÚSCULAS (pt-BR), com trim; corte em 120 vale DEPOIS das maiúsculas; entrada vazia some', () => {
    const payload = buildConferencePayload(
      {
        labelsByRowId: {
          a: { wms: `  ${'w'.repeat(200)}  `, sq: ' s ' },
          b: { wms: '   ', sq: '' },
          c: { wms: 'wms-ç ß', sq: 'ação' },
          d: 'texto solto',
          e: { wms: 'ß'.repeat(100), sq: '' },
        },
        revision: 0,
      },
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      { actorName: 'Op' }
    )
    expect(payload.labelsByRowId.a).toEqual({ wms: 'W'.repeat(120), sq: 'S' })
    expect(payload.labelsByRowId).not.toHaveProperty('b')
    expect(payload.labelsByRowId.c).toEqual({ wms: 'WMS-Ç SS', sq: 'AÇÃO' })
    expect(payload.labelsByRowId).not.toHaveProperty('d')
    // 100 x "ß" viram 200 letras ("SS"): o corte em 120 vale depois da conversão.
    expect(payload.labelsByRowId.e.wms).toBe('S'.repeat(120))
  })

  it('S7: "Conferido por" é SEMPRE o actorName, mesmo se o input trouxer outro nome; corta em 120', () => {
    const payload = buildConferencePayload({ okByRowId: {}, checkedByName: 'Outra Pessoa', revision: 0 }, [], {
      actorName: 'x'.repeat(200),
    })
    expect(payload.checkedByName).toBe('x'.repeat(120))
    expect(payload.revision).toBe(1)
    expect(buildConferencePayload({ checkedByName: 'Outra Pessoa', revision: 0 }, [], { actorName: 'Logística' }).checkedByName).toBe(
      'Logística'
    )
    expect(buildConferencePayload({ checkedByName: 'Outra Pessoa', revision: 0 }, []).checkedByName).toBe('')
  })

  it('S7: rodapé do recebimento normalizado (enum inválido, data inválida, NF e observações cortadas)', () => {
    const invalid = buildConferencePayload(
      { receiptStatus: 'conforme', receivedDate: '24/11/2026', nfNumber: 'n'.repeat(41), notes: '  obs  ', revision: 0 },
      [],
      { actorName: 'Op' }
    )
    expect(invalid).toMatchObject({ receiptStatus: '', receivedDate: '', notes: 'obs' })
    // S9-E: o limite de 40 por NF vale ao ADICIONAR na tela; ao gravar só o TOTAL (1.000) é limitado.
    expect(invalid.nfNumber).toBe('n'.repeat(41))

    const valid = buildConferencePayload(
      { receiptStatus: 'com_ressalva', receivedDate: '2026-11-22', nfNumber: ' 000.123 ', notes: 'x'.repeat(2500), revision: 0 },
      [],
      { actorName: 'Op' }
    )
    expect(valid).toMatchObject({ receiptStatus: 'com_ressalva', receivedDate: '2026-11-22', nfNumber: '000.123' })
    expect(valid.notes).toHaveLength(2000)
  })
})

describe('S7: buildClosedConferencePayload', () => {
  it('fecha com a trilha de quem fechou; closedDocumentId fica vazio (o repositório preenche)', () => {
    const payload = buildClosedConferencePayload(
      { okByRowId: { a: true }, receiptStatus: 'sem_ressalva', revision: 4 },
      [{ id: 'a' }],
      { actorName: ' Operador Logística ', actorUid: 'log-1', today: '2026-11-24' }
    )
    expect(Object.keys(payload)).toEqual(CONFERENCE_KEYS)
    expect(payload).toMatchObject({
      revision: 5,
      status: 'fechada',
      checkedByName: 'Operador Logística',
      receiptStatus: 'sem_ressalva',
      closedDate: '2026-11-24',
      closedById: 'log-1',
      closedByName: 'Operador Logística',
      closedDocumentId: '',
    })
  })

  it('closedDate usa o dia local (toCargoDateKey), nunca UTC; data inválida vira vazio', () => {
    const lateEvening = new Date(2026, 10, 24, 23, 30)
    const payload = buildClosedConferencePayload({ revision: 0 }, [], {
      actorName: 'Op',
      actorUid: 'u1',
      today: toCargoDateKey(lateEvening),
    })
    expect(payload.closedDate).toBe('2026-11-24')
    expect(buildClosedConferencePayload({ revision: 0 }, [], { actorName: 'Op', actorUid: 'u1', today: '24/11' }).closedDate).toBe('')
  })
})

describe('normalizeCargoLabel (S7)', () => {
  it('MAIÚSCULAS pt-BR, trim e corte em 120; vazio e não texto viram vazio', () => {
    expect(normalizeCargoLabel(' wms-ç ã ')).toBe('WMS-Ç Ã')
    expect(normalizeCargoLabel('ß')).toBe('SS')
    expect(normalizeCargoLabel('a'.repeat(130))).toHaveLength(120)
    expect(normalizeCargoLabel(null)).toBe('')
    expect(normalizeCargoLabel(undefined)).toBe('')
  })
})

describe('fromConferenceDoc (S6/S7)', () => {
  it('lê os mapas, ignora não booleano e etiqueta que não é mapa, e corta etiqueta em 120', () => {
    const conference = fromConferenceDoc({
      revision: 4,
      okByRowId: { a: true, b: 'sim' },
      countOkByRowId: { a: false, b: true, c: 1 },
      labelsByRowId: { a: { wms: 'x'.repeat(200), sq: 'S' }, b: 'solto', c: { wms: 7 } },
      checkedByName: ' Op ',
    })
    expect(conference.revision).toBe(4)
    expect(conference.okByRowId).toEqual({ a: true })
    expect(conference.countOkByRowId).toEqual({ a: false, b: true })
    expect(conference.labelsByRowId.a).toEqual({ wms: 'X'.repeat(120), sq: 'S' })
    expect(conference.labelsByRowId).not.toHaveProperty('b')
    expect(conference.labelsByRowId.c).toEqual({ wms: '', sq: '' })
    expect(conference.checkedByName).toBe('Op')
  })

  it('S7: etiqueta minúscula legada é lida em MAIÚSCULAS (doc e linhas legadas)', () => {
    expect(fromConferenceDoc({ labelsByRowId: { a: { wms: 'wms-1', sq: 'sq-ç' } } }).labelsByRowId.a).toEqual({
      wms: 'WMS-1',
      sq: 'SQ-Ç',
    })
    expect(fromConferenceDoc(null, [{ id: 'a', wmsLabel: 'w1', sqLabel: '' }]).labelsByRowId).toEqual({
      a: { wms: 'W1', sq: '' },
    })
  })

  it('doc sem labelsByRowId pré-preenche as etiquetas pelas linhas legadas do current; count legado não vira contagem', () => {
    const legacyRows = [
      { id: 'a', wmsLabel: 'W1', sqLabel: '', count: 40 },
      { id: 'b', wmsLabel: '', sqLabel: '', count: 3 },
    ]
    const conference = fromConferenceDoc({ revision: 2, okByRowId: { a: true }, checkedByName: 'Op' }, legacyRows)
    expect(conference.labelsByRowId).toEqual({ a: { wms: 'W1', sq: '' } })
    expect(conference.countOkByRowId).toEqual({})
  })

  it('doc nulo (conferência ainda não gravada) também pré-preenche pelas linhas legadas', () => {
    const conference = fromConferenceDoc(null, [{ id: 'a', wmsLabel: '', sqLabel: 'S1' }])
    expect(conference.revision).toBe(0)
    expect(conference.labelsByRowId).toEqual({ a: { wms: '', sq: 'S1' } })
  })

  it('doc COM labelsByRowId (mesmo vazio) não pré-preenche: o legado deixa de ser lido', () => {
    const conference = fromConferenceDoc({ revision: 1, labelsByRowId: {} }, [{ id: 'a', wmsLabel: 'W1', sqLabel: 'S1' }])
    expect(conference.labelsByRowId).toEqual({})
  })

  it('S7: doc sem status é aberta; status fechada traz a trilha; qualquer outro valor é aberta', () => {
    expect(fromConferenceDoc({ revision: 1 }).status).toBe('aberta')
    expect(fromConferenceDoc({ status: 'x' }).status).toBe('aberta')
    const closed = fromConferenceDoc({
      revision: 3,
      status: 'fechada',
      receiptStatus: '',
      closedDate: '2026-11-24',
      closedById: 'log-1',
      closedByName: 'Op',
      closedDocumentId: 'd1',
    })
    expect(closed).toMatchObject({
      status: 'fechada',
      closedDate: '2026-11-24',
      closedById: 'log-1',
      closedByName: 'Op',
      closedDocumentId: 'd1',
    })
    // Aberta ignora uma trilha órfã.
    expect(fromConferenceDoc({ status: 'aberta', closedDate: '2026-11-24', closedById: 'x' })).toMatchObject({
      closedDate: '',
      closedById: '',
    })
  })

  it('S9-E: nfNumber é a lista "NF1; NF2": normaliza espaços, vazias e duplicadas e limita o TOTAL a 1.000 por NF inteira', () => {
    const build = (nfNumber) => buildConferencePayload({ nfNumber, revision: 0 }, [], { actorName: 'Op' }).nfNumber
    expect(build('a ;b;; a')).toBe('a; b')
    expect(build('  000.123.456 ')).toBe('000.123.456')
    expect(build('123, 124')).toBe('123, 124')
    expect(build(undefined)).toBe('')

    const nfs = Array.from({ length: 23 }, (_, index) => String(index).padStart(2, '0').padEnd(40, 'x'))
    const tooMuch = [...nfs, 'y'.repeat(40)].join('; ')
    expect(tooMuch.length).toBeGreaterThan(1000)
    expect(build(tooMuch)).toBe(nfs.join('; '))
    expect(CARGO_REPORT_LIMITS.nfList).toBe(1000)
    expect(CARGO_REPORT_LIMITS.nf).toBe(40)
  })

  it('S9-E: fromConferenceDoc lê a lista; o legado do current (40 caracteres, sem ";") é UMA NF', () => {
    expect(fromConferenceDoc({ receiptStatus: '', nfNumber: ' 1;2 ; 1 ' }).nfNumber).toBe('1; 2')
    expect(fromConferenceDoc({ revision: 1 }, [], { nfNumber: 'NF 12/1' }).nfNumber).toBe('NF 12/1')
    expect(fromConferenceDoc({ revision: 1 }, [], { nfNumber: '123, 124' }).nfNumber).toBe('123, 124')
    const nfs = Array.from({ length: 30 }, (_, index) => String(index).padStart(2, '0').padEnd(40, 'x'))
    expect(fromConferenceDoc({ receiptStatus: '', nfNumber: nfs.join('; ') }).nfNumber.length).toBeLessThanOrEqual(1000)
  })

  it('S9-E: o current continua em 40 (nfNumber legado), só a conferência aceita a lista', () => {
    const { payload } = buildCargoReportPayload({
      ...fromCargoReportDoc({ revision: 1, status: 'rascunho', cargoType: 'FCL' }),
      rows: [makeRow({ id: 'a', po: '1' })],
      nfNumber: 'x'.repeat(60),
    })
    expect(payload.nfNumber).toBe('x'.repeat(40))
  })

  it('S7: doc sem receiptStatus (anterior à S7) pré-preenche o rodapé pelo current legado; com a chave, não', () => {
    const legacyCurrent = {
      notes: ' Palete 3 avariado ',
      receiptStatus: 'com_ressalva',
      receivedDate: '2026-11-22',
      nfNumber: '000.123.456',
    }
    const prefilled = fromConferenceDoc({ revision: 2, checkedByName: 'Op' }, [], legacyCurrent)
    expect(prefilled).toMatchObject({
      notes: 'Palete 3 avariado',
      receiptStatus: 'com_ressalva',
      receivedDate: '2026-11-22',
      nfNumber: '000.123.456',
    })
    expect(fromConferenceDoc(null, [], legacyCurrent).notes).toBe('Palete 3 avariado')

    const own = fromConferenceDoc({ revision: 3, receiptStatus: '', receivedDate: '', nfNumber: '', notes: '' }, [], legacyCurrent)
    expect(own).toMatchObject({ notes: '', receiptStatus: '', receivedDate: '', nfNumber: '' })
  })
})

describe('S7: getCargoReportStage', () => {
  it('3 estados derivados de current.status e conference.status; doc ausente = rascunho', () => {
    expect(getCargoReportStage('rascunho', 'aberta')).toBe('rascunho')
    expect(getCargoReportStage(undefined, undefined)).toBe('rascunho')
    expect(getCargoReportStage('rascunho', 'fechada')).toBe('rascunho')
    expect(getCargoReportStage('concluido', 'aberta')).toBe('comexFechado')
    expect(getCargoReportStage('concluido', undefined)).toBe('comexFechado')
    expect(getCargoReportStage('concluido', 'fechada')).toBe('concluido')
  })
})

describe('S7: matriz de permissões por papel e estado (B2/B3)', () => {
  const stages = ['rascunho', 'comexFechado', 'concluido']

  it('salvar a conferência: só a logística, nos estados 1 e 2', () => {
    expect(stages.map((stage) => canSaveCargoConference('logistica', stage))).toEqual([true, true, false])
    for (const role of ['admin', 'tecnico', 'faturamento', 'user', undefined]) {
      expect(stages.map((stage) => canSaveCargoConference(role, stage))).toEqual([false, false, false])
    }
  })

  it('fechar a conferência: só a logística, só com o COMEX fechado', () => {
    expect(stages.map((stage) => canCloseCargoConference('logistica', stage))).toEqual([false, true, false])
    for (const role of ['admin', 'tecnico', 'faturamento', 'user']) {
      expect(stages.map((stage) => canCloseCargoConference(role, stage))).toEqual([false, false, false])
    }
  })

  it('reabrir a conferência: só o admin, no estado 3', () => {
    expect(stages.map((stage) => canReopenCargoConference('admin', stage))).toEqual([false, false, true])
    for (const role of ['logistica', 'tecnico', 'faturamento', 'user']) {
      expect(stages.map((stage) => canReopenCargoConference(role, stage))).toEqual([false, false, false])
    }
  })

  it('reabrir a parte do COMEX: só o admin, nos estados 2 e 3', () => {
    expect(stages.map((stage) => canReopenCargoReportComex('admin', stage))).toEqual([false, true, true])
    for (const role of ['logistica', 'tecnico', 'faturamento', 'user']) {
      expect(stages.map((stage) => canReopenCargoReportComex(role, stage))).toEqual([false, false, false])
    }
  })
})

describe('fromCargoReportDoc e isCargoReportRowEmpty', () => {
  it('tolera doc parcial e dados de tipo errado', () => {
    const form = fromCargoReportDoc({ cargoType: 'XYZ', rows: 'nao-lista', revision: 'a', notes: 5 })
    expect(form).toMatchObject({ revision: 0, cargoType: '', rows: [], notes: '', status: 'rascunho', lastGenerated: null })
    expect(fromCargoReportDoc(null).rows).toEqual([])
  })

  it('linha sem id ganha id novo e o doc corta no teto', () => {
    const form = fromCargoReportDoc({ rows: Array.from({ length: CARGO_REPORT_MAX_ROWS + 12 }, () => ({ po: '1' })) })
    expect(form.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
    expect(form.rows.every((row) => row.id.startsWith('r-'))).toBe(true)
    expect(new Set(form.rows.map((row) => row.id)).size).toBe(CARGO_REPORT_MAX_ROWS)
  })

  it('converte updatedAt para Date', () => {
    const form = fromCargoReportDoc({ updatedAt: { toDate: () => new Date(2026, 10, 22, 19, 52) } })
    expect(form.updatedAt).toBeInstanceOf(Date)
  })

  it('isCargoReportRowEmpty ignora id e frozen', () => {
    expect(isCargoReportRowEmpty(makeRow({ frozenNetWeightKg: 5 }))).toBe(true)
    expect(isCargoReportRowEmpty(makeRow({ quantityKg: '' }))).toBe(true)
    expect(isCargoReportRowEmpty(makeRow({ po: ' ' }))).toBe(true)
    expect(isCargoReportRowEmpty(makeRow({ count: 0 }))).toBe(false)
    expect(isCargoReportRowEmpty(makeRow({ wmsLabel: 'W' }))).toBe(false)
  })
})

describe('S4: toCargoDateKey', () => {
  it('usa o dia local, sem deslocar para UTC', () => {
    expect(toCargoDateKey(new Date(2026, 10, 22, 23, 30))).toBe('2026-11-22')
    expect(toCargoDateKey(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })
})

describe('S4: canConcludeCargoReport', () => {
  it('só admin conclui e reabre', () => {
    expect(canConcludeCargoReport('admin')).toBe(true)
    expect(canConcludeCargoReport('logistica')).toBe(false)
    expect(canConcludeCargoReport('compras')).toBe(false)
    expect(canConcludeCargoReport(undefined)).toBe(false)
  })
})

describe('S4: freezeCargoReportRows', () => {
  it('congela peso líquido e nº de embalagens pela tabela vigente', () => {
    const [row] = freezeCargoReportRows([makeRow({ dbcorpCode: 'AD5240', quantityKg: 12500 })], CATALOG)
    expect(row.frozenNetWeightKg).toBe(25)
    expect(row.frozenPackages).toBe(500)
  })

  it('código fora da tabela ou sem quantidade congela null', () => {
    const rows = freezeCargoReportRows(
      [makeRow({ id: 'a', dbcorpCode: 'ZZ9999', quantityKg: 800 }), makeRow({ id: 'b', dbcorpCode: 'AD5240' })],
      CATALOG
    )
    expect(rows[0]).toMatchObject({ frozenNetWeightKg: null, frozenPackages: null })
    expect(rows[1]).toMatchObject({ frozenNetWeightKg: 25, frozenPackages: null })
  })

  it('linha já congelada mantém o congelado, mesmo com a tabela diferente', () => {
    const changed = { items: [{ code: 'AD5240', description: 'X', packagingType: 'B', netWeightKg: 50 }] }
    const [row] = freezeCargoReportRows(
      [makeRow({ dbcorpCode: 'AD5240', quantityKg: 12500, frozenNetWeightKg: 25, frozenPackages: 500 })],
      changed
    )
    expect(row).toMatchObject({ frozenNetWeightKg: 25, frozenPackages: 500 })
  })
})

describe('S4: buildConcludedCargoReportPayload', () => {
  const form = () => ({
    ...fromCargoReportDoc({ revision: 4, status: 'rascunho', cargoType: 'FCL', titleSuffix: 'ACME', receiptStatus: 'sem_ressalva' }),
    rows: [
      makeRow({ id: 'a', po: '4500123', dbcorpCode: 'AD5240', supplierLot: 'DF2406A', quantityKg: '12.500', count: '500', packageWeightKg: '1,2' }),
      makeRow({ id: 'vazia' }),
      makeRow({ id: 'b', po: '4500123', dbcorpCode: 'ZZ9999', quantityKg: 800 }),
    ],
  })

  it('conclui com a data do dia, revisão + 1 e linhas congeladas', () => {
    const { payload, errors } = buildConcludedCargoReportPayload(form(), {
      catalogVersion: 3,
      catalog: CATALOG,
      today: '2026-11-23',
    })
    expect(errors).toEqual([])
    expect(payload).toMatchObject({ status: 'concluido', completedDate: '2026-11-23', revision: 5, catalogVersion: 3 })
    expect(payload.rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect(payload.rows[0]).toMatchObject({ quantityKg: 12500, frozenNetWeightKg: 25, frozenPackages: 500 })
    expect(payload.rows[1]).toMatchObject({ frozenNetWeightKg: null, frozenPackages: null })
  })

  it('cada linha tem 13 chaves e as chaves do payload estão na allowlist da rule, sem colunas calculadas', () => {
    const { payload } = buildConcludedCargoReportPayload(form(), { catalog: CATALOG, today: '2026-11-23' })
    for (const row of payload.rows) expect(Object.keys(row)).toHaveLength(13)
    for (const key of Object.keys(payload)) expect(RULE_ALLOWLIST).toContain(key)
    const serialized = JSON.stringify(payload)
    for (const forbidden of ['lotSq', '"netWeightKg"', '"packages"']) expect(serialized).not.toContain(forbidden)
  })

  it('número inválido e linhas acima do teto bloqueiam como no rascunho', () => {
    const invalid = form()
    invalid.rows[0].quantityKg = 'abc'
    expect(buildConcludedCargoReportPayload(invalid, { catalog: CATALOG, today: '2026-11-23' }).errors).toEqual([
      { rowId: 'a', field: 'quantityKg', message: 'Número inválido' },
    ])

    const many = form()
    many.rows = Array.from({ length: CARGO_REPORT_MAX_ROWS + 1 }, (_, index) => makeRow({ id: `r-${index}`, po: `45${index}` }))
    const { errors } = buildConcludedCargoReportPayload(many, { catalog: CATALOG, today: '2026-11-23' })
    expect(errors.map((error) => error.field)).toEqual(['rows'])
  })

  it('lastGenerated fica como veio (o repositório o substitui)', () => {
    const lastGenerated = { documentId: 'd0', revision: 2, at: '2026-11-20T10:00:00Z', byId: 'u1' }
    const { payload } = buildConcludedCargoReportPayload({ ...form(), lastGenerated }, { catalog: CATALOG, today: '2026-11-23' })
    expect(payload.lastGenerated).toEqual(lastGenerated)
  })
})

describe('S4: buildReopenedCargoReportPayload', () => {
  it('volta a rascunho, zera os congelados e a data de conclusão e preserva lastGenerated', () => {
    const lastGenerated = { documentId: 'd1', revision: 5, at: '2026-11-23T10:00:00Z', byId: 'u1' }
    const concluded = fromCargoReportDoc({
      revision: 5,
      status: 'concluido',
      completedDate: '2026-11-23',
      lastGenerated,
      rows: [{ id: 'a', po: '1', dbcorpCode: 'AD5240', quantityKg: 12500, frozenNetWeightKg: 25, frozenPackages: 500 }],
    })
    const { payload, errors } = buildReopenedCargoReportPayload(concluded, { catalogVersion: 3 })
    expect(errors).toEqual([])
    expect(payload).toMatchObject({ status: 'rascunho', completedDate: '', revision: 6, catalogVersion: 3, lastGenerated })
    expect(payload.rows[0]).toMatchObject({ frozenNetWeightKg: null, frozenPackages: null, quantityKg: 12500 })
    expect(Object.keys(payload.rows[0])).toHaveLength(13)
  })
})

describe('S8: readDateTimeKey / cargoDatePart', () => {
  it('aceita YYYY-MM-DDTHH:mm; com segundos ou fração, corta nos minutos', () => {
    expect(readDateTimeKey('2026-11-24T08:15')).toBe('2026-11-24T08:15')
    expect(readDateTimeKey('2026-11-24T08:15:30')).toBe('2026-11-24T08:15')
    expect(readDateTimeKey('2026-11-24T08:15:30.250')).toBe('2026-11-24T08:15')
  })

  it('rejeita formato, ano fora de 2020–2099, hora 24, minuto 60, mês e dia fora de faixa e não texto', () => {
    for (const value of [
      '2026-11-24 08:15',
      '24/11/2026 08:15',
      '2026-11-24',
      '2019-11-24T08:15',
      '2100-01-01T08:15',
      '2026-11-24T24:00',
      '2026-11-24T08:60',
      '2026-13-01T08:00',
      '2026-00-10T08:00',
      '2026-11-00T08:00',
      '2026-11-32T08:00',
      '',
      null,
      undefined,
      20261124,
    ]) {
      expect(readDateTimeKey(value)).toBe('')
    }
  })

  it('não confere o calendário (2026-02-30 passa pelo padrão, como receivedDate); o seletor nativo não gera isso', () => {
    expect(readDateTimeKey('2026-02-30T08:00')).toBe('2026-02-30T08:00')
  })

  it('cargoDatePart devolve só o dia; inválido vira vazio', () => {
    expect(cargoDatePart('2026-11-24T08:15')).toBe('2026-11-24')
    expect(cargoDatePart('2026-11-24 08:15')).toBe('')
    expect(cargoDatePart('')).toBe('')
    expect(cargoDatePart(undefined)).toBe('')
  })
})

describe('S8: resolveCargoReceivedDate (data de recebimento = dia do início da descarga)', () => {
  it('com início, vale o dia do início mesmo que receivedDate venha diferente', () => {
    expect(resolveCargoReceivedDate({ unloadStartAt: '2026-11-24T08:15', receivedDate: '2026-01-01' })).toBe('2026-11-24')
    expect(resolveCargoReceivedDate({ unloadStartAt: '2026-11-24T23:30', receivedDate: '' })).toBe('2026-11-24')
  })

  it('sem início, vale o receivedDate legado; sem nenhum dos dois, vazio', () => {
    expect(resolveCargoReceivedDate({ unloadStartAt: '', receivedDate: '2026-11-20' })).toBe('2026-11-20')
    expect(resolveCargoReceivedDate({ receivedDate: '20/11/2026' })).toBe('')
    expect(resolveCargoReceivedDate({})).toBe('')
    expect(resolveCargoReceivedDate()).toBe('')
  })
})

describe('S8: computeCargoUnloadMinutes', () => {
  it('diferença de parede em minutos: mesmo dia, virada de dia e fim igual ao início', () => {
    expect(computeCargoUnloadMinutes('2026-11-24T08:15', '2026-11-24T10:40')).toBe(145)
    expect(computeCargoUnloadMinutes('2026-11-24T23:30', '2026-11-25T01:10')).toBe(100)
    expect(computeCargoUnloadMinutes('2026-11-24T08:15', '2026-11-24T08:15')).toBe(0)
  })

  it('fim antes do início, valor faltando ou inválido: null', () => {
    expect(computeCargoUnloadMinutes('2026-11-24T10:40', '2026-11-24T08:15')).toBeNull()
    expect(computeCargoUnloadMinutes('', '2026-11-24T08:15')).toBeNull()
    expect(computeCargoUnloadMinutes('2026-11-24T08:15', '')).toBeNull()
    expect(computeCargoUnloadMinutes('2026-11-24 08:15', '2026-11-24T10:40')).toBeNull()
  })

  it('conta pelos componentes do texto, sem Date local nem toISOString', () => {
    const spy = vi.spyOn(Date.prototype, 'toISOString')
    try {
      expect(computeCargoUnloadMinutes('2026-03-08T01:00', '2026-03-08T04:00')).toBe(180)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('S8: validateCargoUnload', () => {
  it('sem erro: vazio, só início, início e fim válidos e fim igual ao início', () => {
    const none = { start: '', end: '' }
    expect(validateCargoUnload({ unloadStartAt: '', unloadEndAt: '' })).toEqual(none)
    expect(validateCargoUnload({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '' })).toEqual(none)
    expect(validateCargoUnload({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40' })).toEqual(none)
    expect(validateCargoUnload({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T08:15' })).toEqual(none)
    expect(validateCargoUnload()).toEqual(none)
  })

  it('fim sem início: erro no início; fim antes do início e mais de 24 h: erro no fim (mensagens exatas)', () => {
    expect(validateCargoUnload({ unloadStartAt: '', unloadEndAt: '2026-11-24T10:40' })).toEqual({
      start: 'Informe o início da descarga.',
      end: '',
    })
    expect(validateCargoUnload({ unloadStartAt: '2026-11-24T10:40', unloadEndAt: '2026-11-24T08:15' })).toEqual({
      start: '',
      end: 'O fim da descarga deve ser igual ou posterior ao início.',
    })
    expect(validateCargoUnload({ unloadStartAt: '2026-11-24T08:00', unloadEndAt: '2026-11-26T09:45' })).toEqual({
      start: '',
      end: 'A descarga passa de 24 horas. Confira as datas.',
    })
  })

  it('o limite é 1.440 min: 24 h exatas passam; 1.441 min falham', () => {
    expect(validateCargoUnload({ unloadStartAt: '2026-11-24T08:00', unloadEndAt: '2026-11-25T08:00' }).end).toBe('')
    expect(validateCargoUnload({ unloadStartAt: '2026-11-24T08:00', unloadEndAt: '2026-11-25T08:01' }).end).toBe(
      'A descarga passa de 24 horas. Confira as datas.'
    )
  })
})

describe('S8: buildConferencePayload com descarga, etiquetagem e data derivada', () => {
  it('grava início e fim (sem segundos) e receivedDate = dia do início, ignorando o valor que veio', () => {
    const payload = buildConferencePayload(
      {
        unloadStartAt: '2026-11-24T08:15:40',
        unloadEndAt: '2026-11-24T10:40',
        receivedDate: '2026-01-01',
        labelingOk: true,
        revision: 0,
      },
      [],
      { actorName: 'Op' }
    )
    expect(payload).toMatchObject({
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      receivedDate: '2026-11-24',
      labelingOk: true,
    })
    expect(Object.keys(payload)).toHaveLength(18)
    // O tempo total é derivado: nenhuma chave de minutos entra no payload.
    expect(Object.keys(payload).some((key) => /minutes/i.test(key))).toBe(false)
  })

  it('sem início, mantém o receivedDate legado; início inválido some', () => {
    expect(buildConferencePayload({ receivedDate: '2026-11-20', revision: 0 }, [], {}).receivedDate).toBe('2026-11-20')
    const invalid = buildConferencePayload({ unloadStartAt: '24/11/2026 08:15', unloadEndAt: 'x', revision: 0 }, [], {})
    expect(invalid).toMatchObject({ unloadStartAt: '', unloadEndAt: '', receivedDate: '' })
  })

  it('labelingOk só é true com o booleano true', () => {
    for (const value of ['true', 1, 'sim', null, undefined, false]) {
      expect(buildConferencePayload({ labelingOk: value, revision: 0 }, [], {}).labelingOk).toBe(false)
    }
    expect(buildConferencePayload({ labelingOk: true, revision: 0 }, [], {}).labelingOk).toBe(true)
  })

  it('o fechamento herda as chaves novas', () => {
    const closed = buildClosedConferencePayload(
      { unloadStartAt: '2026-11-24T08:15', labelingOk: true, revision: 1 },
      [],
      { actorName: 'Op', actorUid: 'u1', today: '2026-11-24' }
    )
    expect(closed).toMatchObject({ unloadStartAt: '2026-11-24T08:15', receivedDate: '2026-11-24', labelingOk: true })
    expect(Object.keys(closed)).toEqual(CONFERENCE_KEYS)
  })
})

describe('S8: fromConferenceDoc com as chaves novas', () => {
  it('doc anterior (sem as chaves) lê vazio, vazio e sem OK; o receivedDate gravado é preservado', () => {
    const conference = fromConferenceDoc({ revision: 2, status: 'aberta', receiptStatus: '', receivedDate: '2026-11-20' })
    expect(conference).toMatchObject({ unloadStartAt: '', unloadEndAt: '', labelingOk: false, receivedDate: '2026-11-20' })
  })

  it('lê início, fim e etiquetagem; valor inválido vira vazio e labelingOk só com booleano true', () => {
    const doc = { receiptStatus: '', unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', labelingOk: true }
    expect(fromConferenceDoc(doc)).toMatchObject({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', labelingOk: true })
    expect(fromConferenceDoc({ ...doc, unloadStartAt: 'x', labelingOk: 'true' })).toMatchObject({
      unloadStartAt: '',
      labelingOk: false,
    })
  })
})

describe('S9-D: embalagem por item + fornecedor (peso líquido por fornecedor)', () => {
  const SUPPLIERS = {
    exists: true,
    version: 1,
    aliases: [{ fromKey: 'GOOYER CHEMICAL CO', toKey: 'GOOYER CHEMICALS LTD' }],
    entries: [
      { code: 'AD5240', supplierKey: 'GOOYER CHEMICALS LTD', supplierName: 'Gooyer Chemicals Ltd', packagingType: 'TAMBOR', netWeightKg: 200, packageWeightKg: 9.2 },
      { code: 'AD5240', supplierKey: 'ORION CHEM CO', supplierName: 'Orion Chem Co', packagingType: 'IBC', netWeightKg: 1000, packageWeightKg: 62 },
      { code: 'ZZ9999', supplierKey: 'GOOYER CHEMICALS LTD', supplierName: 'Gooyer Chemicals Ltd', packagingType: 'BALDE', netWeightKg: 20, packageWeightKg: null },
    ],
  }
  const context = (supplierName) => ({ supplierName, supplierCatalog: SUPPLIERS })

  it('sem contexto vale só a tabela Item x Emb., como antes (e o tipo vem como "padrão do item")', () => {
    const derived = deriveCargoReportRow(makeRow({ dbcorpCode: 'AD5240', quantityKg: 1000 }), CATALOG)
    expect(derived).toMatchObject({ netWeightKg: 25, packages: 40, packaging: { packagingType: 'BOMBONA', via: 'default' } })
    expect(derived.alerts.noPackaging).toBe(false)
  })

  it('o peso líquido e o nº de embalagens saem do fornecedor da linha (deste fornecedor)', () => {
    const row = makeRow({ dbcorpCode: 'AD5240', quantityKg: 4000 })
    expect(deriveCargoReportRow(row, CATALOG, context('GOOYER CHEMICALS LTD'))).toMatchObject({
      netWeightKg: 200,
      packages: 20,
      packaging: { packagingType: 'TAMBOR', via: 'supplier' },
    })
    expect(deriveCargoReportRow(row, CATALOG, context('Orion Chem, Co.'))).toMatchObject({ netWeightKg: 1000, packages: 4 })
  })

  it('fornecedor sem linha cai no padrão do item; nome parecido chega pelo alias', () => {
    const row = makeRow({ dbcorpCode: 'AD5240', quantityKg: 1000 })
    expect(deriveCargoReportRow(row, CATALOG, context('OUTRA EMPRESA'))).toMatchObject({ netWeightKg: 25, packaging: { via: 'default' } })
    expect(deriveCargoReportRow(row, CATALOG, context('Gooyer Chemical Co.'))).toMatchObject({ netWeightKg: 200 })
  })

  it('item só no cadastro do fornecedor (fora da tabela Item x Emb.) tem embalagem para aquele fornecedor, não para os outros', () => {
    const row = makeRow({ dbcorpCode: 'ZZ9999', quantityKg: 100 })
    expect(deriveCargoReportRow(row, CATALOG, context('GOOYER CHEMICALS LTD')).alerts.noPackaging).toBe(false)
    expect(deriveCargoReportRow(row, CATALOG, context('ORION CHEM CO')).alerts.noPackaging).toBe(true)
    expect(deriveCargoReportRow(row, CATALOG, context('ORION CHEM CO')).packaging).toBeNull()
  })

  it('resolveNetWeightKg: o congelado continua com precedência e o fornecedor vale sem congelado', () => {
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: 'AD5240' }), CATALOG, context('GOOYER CHEMICALS LTD'))).toBe(200)
    expect(resolveNetWeightKg(makeRow({ dbcorpCode: 'AD5240', frozenNetWeightKg: 20 }), CATALOG, context('GOOYER CHEMICALS LTD'))).toBe(20)
  })

  it('countCargoReportAlerts usa o fornecedor de cada linha', () => {
    const rows = [
      makeRow({ id: 'a', dbcorpCode: 'ZZ9999', supplierLot: 'L', packageWeightKg: 1 }),
      makeRow({ id: 'b', dbcorpCode: 'ZZ9999', supplierLot: 'L', packageWeightKg: 1 }),
    ]
    const packaging = { supplierCatalog: SUPPLIERS, supplierNameByRowId: { a: 'GOOYER CHEMICALS LTD', b: 'ORION CHEM CO' } }
    expect(countCargoReportAlerts(rows, CATALOG)).toBe(2)
    expect(countCargoReportAlerts(rows, CATALOG, packaging)).toBe(1)
  })

  it('freezeCargoReportRows e buildConcludedCargoReportPayload congelam o peso líquido do fornecedor da linha', () => {
    const rows = [
      makeRow({ id: 'a', dbcorpCode: 'AD5240', quantityKg: 4000 }),
      makeRow({ id: 'b', dbcorpCode: 'AD5240', quantityKg: 4000 }),
    ]
    const packaging = { supplierCatalog: SUPPLIERS, supplierNameByRowId: { a: 'GOOYER CHEMICALS LTD', b: 'ORION CHEM CO' } }
    const frozen = freezeCargoReportRows(rows, CATALOG, packaging)
    expect(frozen.map((row) => [row.frozenNetWeightKg, row.frozenPackages])).toEqual([
      [200, 20],
      [1000, 4],
    ])

    const form = { ...fromCargoReportDoc({ revision: 1, status: 'rascunho', cargoType: 'FCL', titleSuffix: 'ACME' }), rows }
    const { payload } = buildConcludedCargoReportPayload(form, { catalog: CATALOG, packaging, today: '2026-11-25' })
    expect(payload.rows.map((row) => row.frozenNetWeightKg)).toEqual([200, 1000])
    // sem o contexto, o congelamento é o de sempre (padrão do item)
    expect(buildConcludedCargoReportPayload(form, { catalog: CATALOG, today: '2026-11-25' }).payload.rows.map((row) => row.frozenNetWeightKg)).toEqual([25, 25])
  })
})
