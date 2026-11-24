// S3 do Relatorio de Carga: modulo puro do formulario FR.CMX.001 (papeis, formulas do Excel R5,
// alertas, normalizacao e payloads). Fixtures SINTETICAS: nunca o catalogo real.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CARGO_REPORT_CONFLICT_CODE,
  CARGO_REPORT_MAX_ROWS,
  CARGO_TYPE_OPTIONS,
  RECEIPT_STATUS_OPTIONS,
  buildCargoReportPayload,
  buildConcludedCargoReportPayload,
  buildConferencePayload,
  buildInitialCargoReport,
  buildReopenedCargoReportPayload,
  canConcludeCargoReport,
  canConferCargoReport,
  canEditCargoReport,
  canOpenCargoReport,
  computeLotSq,
  computePackages,
  countCargoReportAlerts,
  createEmptyCargoReportRow,
  deriveCargoReportRow,
  formatCargoNumber,
  freezeCargoReportRows,
  formatCargoReportTitle,
  fromCargoReportDoc,
  isCargoReportRowEmpty,
  parseCargoCount,
  parseCargoNumber,
  resolveNetWeightKg,
  toCargoDateKey,
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
  'cargoType', 'titleSuffix', 'rows', 'notes', 'labeledBy', 'labelMadeBy',
  'receiptStatus', 'receivedDate', 'completedDate', 'nfNumber',
  'catalogVersion', 'lastGenerated', 'updatedAt', 'updatedById', 'updatedByName',
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
    expect(form.rows[0]).toMatchObject({ po: '4500123', sqDescription: 'DEA FOAM14339 - BB 25KG', quantityKg: 12500 })
    expect(form.rows[1].quantityKg).toBeNull()
    expect(new Set(form.rows.map((row) => row.id)).size).toBe(2)
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
    expect(Object.keys(payload)).toHaveLength(RULE_ALLOWLIST.length - 3)
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

describe('buildConferencePayload', () => {
  it('poda ids orfaos, converte para booleano e soma 1 na revisao', () => {
    const payload = buildConferencePayload(
      { okByRowId: { a: true, b: 0, orfa: true }, checkedByName: '  Operador  ', revision: 2 },
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    )
    expect(payload).toEqual({
      schemaVersion: 1,
      revision: 3,
      okByRowId: { a: true, b: false },
      checkedByName: 'Operador',
    })
  })

  it('corta o nome em 120 caracteres', () => {
    const payload = buildConferencePayload({ okByRowId: {}, checkedByName: 'x'.repeat(200), revision: 0 }, [])
    expect(payload.checkedByName).toHaveLength(120)
    expect(payload.revision).toBe(1)
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
