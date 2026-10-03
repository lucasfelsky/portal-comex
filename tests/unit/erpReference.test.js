// Referencia do ERP (PR 3, "Importar do DBCorp"): recorte do embarque guardado,
// payload/lotes da gravacao e avisos "ERP" ao vivo. Fixtures 100% sinteticas
// (prefixos gregos, PEDIDO 9000-9999, REF de consolidado 9nn-26).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ERP_MATCH_RULES,
  ERP_REFERENCE_CONFLICT_FIELDS,
  categoryFlagsFor,
  diffProcessAgainstReference,
  erpItemGroupKey,
  erpOrderKey,
  runErpReconciliation,
  toErpReferenceShipment,
} from '../../src/features/erp/reconcileErp.js'
import {
  EMPTY_ERP_HINTS,
  ERP_HINT_KINDS,
  ERP_HINT_LIMITS,
  ERP_HINT_TARGET_LABELS,
  buildErpFieldHints,
  buildErpReferencePayload,
  estimateErpHintBytes,
  formatErpReferenceStamp,
  planErpReferenceBatches,
} from '../../src/features/erp/erpReference.js'
import {
  FINANCIAL_SENTINEL_STRINGS,
  SCENARIO_TODAY,
  buildScenarioLooseRows,
  buildScenarioPortalProcesses,
  makeLooseRow,
  makePortalProcess,
} from '../fixtures/erp/dbcorpSynthetic.js'

const SNAPSHOT_ID = 'AAAAAAAAAAAAAAAAAAAA'
const STAMP_MS = new Date(2026, 9, 2, 14, 30).getTime()
const SNAPSHOT = { snapshotId: SNAPSHOT_ID, updatedAtMs: STAMP_MS }
const STAMP_TEXT = 'planilha de 02/10/2026'
const SOURCE = { id: 'teste', label: 'Fonte de teste' }

function run({ rows, processes, today = SCENARIO_TODAY } = {}) {
  const loose = rows.map((row, index) => ({ rowNumber: index + 2, ...row }))
  return runErpReconciliation({
    loaded: { rows: loose, warnings: [], meta: { fileName: 'teste.xlsx', rowCount: loose.length } },
    processes,
    today,
    source: SOURCE,
  })
}

function runScenario() {
  return run({ rows: buildScenarioLooseRows(), processes: buildScenarioPortalProcesses() })
}

// Recorte "a mao" (o formato que o Firestore devolve).
const EMPTY_TRANSPORT = {
  etd: '',
  eta: '',
  vessel: { name: '', raw: '', voyage: '' },
  blAwb: '',
  origin: '',
  destination: '',
  diNumber: '',
  diDate: '',
}

function shipment({ transport = {}, ...overrides } = {}) {
  return {
    kind: 'FCL',
    portalCategory: 'FCL',
    key: 'BETA SEA 904-26',
    incoterm: '',
    originHint: '',
    stage: 1,
    statuses: ['EMBARCOU'],
    statusNf: [],
    orders: [],
    items: [],
    transport: { ...EMPTY_TRANSPORT, ...transport },
    conflicts: [],
    ...overrides,
  }
}

const hintOf = (value, matchRule = 'pedido', snapshotId = SNAPSHOT_ID) => ({ snapshotId, matchRule, shipment: value })
const portal = (overrides = {}) =>
  makePortalProcess({ id: 'p-1', name: 'BETA SEA 904-26', processNumber: '9036', category: 'FCL', ...overrides })
const hintsFor = (process, value, matchRule = 'pedido') =>
  buildErpFieldHints(process, { snapshot: SNAPSHOT, hint: hintOf(value, matchRule) })

const entryOf = (result, processId) => result.matched.find((entry) => entry.processId === processId)

// Varredura recursiva: todo valor do objeto.
function walk(value, visit, pathParts = []) {
  visit(value, pathParts)
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, [...pathParts, index]))
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) walk(inner, visit, [...pathParts, key])
  }
}

const RECORTE_KEYS = [
  'conflicts', 'incoterm', 'items', 'key', 'kind', 'orders', 'originHint', 'portalCategory', 'stage',
  'statusNf', 'statuses', 'transport',
]

describe('toErpReferenceShipment - recorte do embarque', () => {
  it('chaves exatas em todos os niveis (12 no topo, 4 por pedido, 3 por item, 8 no transporte, 3 no navio)', () => {
    const result = runScenario()
    expect(result.matched.length).toBeGreaterThanOrEqual(3)
    for (const entry of result.matched) {
      const recorte = entry.referenceShipment
      expect(Object.keys(recorte).sort()).toEqual(RECORTE_KEYS)
      for (const order of recorte.orders) expect(Object.keys(order).sort()).toEqual(['exporter', 'pedido', 'poBase', 'poRef'])
      for (const item of recorte.items) expect(Object.keys(item).sort()).toEqual(['commercialName', 'pedido', 'quantityKg'])
      expect(Object.keys(recorte.transport).sort()).toEqual([
        'blAwb', 'destination', 'diDate', 'diNumber', 'eta', 'etd', 'origin', 'vessel',
      ])
      expect(Object.keys(recorte.transport.vessel).sort()).toEqual(['name', 'raw', 'voyage'])
      for (const conflict of recorte.conflicts) {
        expect(Object.keys(conflict).sort()).toEqual(['field', 'values'])
        expect(ERP_REFERENCE_CONFLICT_FIELDS).toContain(conflict.field)
      }
    }
  })

  it('sem dado financeiro, sem campos de origem da planilha e sem undefined (varredura recursiva)', () => {
    const result = runScenario()
    const FORBIDDEN_KEYS = [
      'rowNumbers', 'itemId', 'sqCode', 'ncm', 'tracking', 'etaFinal', 'active', 'concludedByNf', 'nfDate',
    ]
    for (const entry of result.matched) {
      const json = JSON.stringify(entry.referenceShipment)
      for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(json).not.toContain(sentinel)
      walk(entry.referenceShipment, (value, pathParts) => {
        expect(value, pathParts.join('.')).not.toBeUndefined()
        const last = pathParts[pathParts.length - 1]
        if (typeof last === 'string') expect(FORBIDDEN_KEYS, pathParts.join('.')).not.toContain(last)
      })
    }
  })

  it('conflitos de tracking e etaFinal saem do recorte; os 8 que os comparadores leem ficam', () => {
    const rows = [
      makeLooseRow({ itemId: 'K-1', pedido: 9036, poRef: 'BETA SEA 904-26', tracking: 'TRK-A', etaFinal: 46330, eta: 46309 }),
      makeLooseRow({ itemId: 'K-2', pedido: 9036, poRef: 'BETA SEA 904-26', tracking: 'TRK-B', etaFinal: 46331, eta: 46310 }),
    ]
    const result = run({ rows, processes: [portal()] })
    // O embarque agrupado tinha os 3 conflitos (aviso por campo)...
    const conflictWarnings = result.warnings.filter((warning) => warning.code === 'conflito_no_grupo').map((w) => w.message)
    expect(conflictWarnings.some((message) => message.includes('tracking'))).toBe(true)
    expect(conflictWarnings.some((message) => message.includes('etaFinal'))).toBe(true)
    // ...mas o recorte so' leva o que `compareProcess` le.
    const fields = entryOf(result, 'p-1').referenceShipment.conflicts.map((conflict) => conflict.field)
    expect(fields).toEqual(['eta'])
  })

  it('e idempotente: normalizar o recorte de novo nao muda nada', () => {
    const result = runScenario()
    for (const entry of result.matched) {
      expect(toErpReferenceShipment(entry.referenceShipment)).toEqual(entry.referenceShipment)
      expect(toErpReferenceShipment(toErpReferenceShipment(entry.referenceShipment))).toEqual(
        toErpReferenceShipment(entry.referenceShipment)
      )
    }
  })

  it('defensivo: campo ausente ou de tipo errado vira "", [] ou null, nunca undefined', () => {
    const empty = toErpReferenceShipment(undefined)
    expect(Object.keys(empty).sort()).toEqual(RECORTE_KEYS)
    expect(empty).toMatchObject({ kind: '', stage: null, orders: [], items: [], conflicts: [], statuses: [] })
    const messy = toErpReferenceShipment({
      kind: 5,
      stage: 'x',
      orders: 'x',
      items: [null, 3, { commercialName: 'RESINA', quantityKg: 'abc', pedido: 9 }],
      statuses: ['EMBARCOU', 7],
      transport: { eta: 20261006, vessel: 'x' },
      conflicts: [
        { field: 'tracking', values: ['a', 'b'] },
        { field: 'eta', values: 'x' },
        { field: 'eta', values: ['2026-10-06', 9] },
      ],
    })
    expect(messy.kind).toBe('')
    expect(messy.stage).toBeNull()
    expect(messy.orders).toEqual([])
    expect(messy.items).toEqual([{ commercialName: 'RESINA', pedido: '', quantityKg: null }])
    expect(messy.statuses).toEqual(['EMBARCOU'])
    expect(messy.transport.eta).toBe('')
    expect(messy.transport.vessel).toEqual({ name: '', raw: '', voyage: '' })
    expect(messy.conflicts).toEqual([{ field: 'eta', values: ['2026-10-06'] }])
    walk(messy, (value, pathParts) => expect(value, pathParts.join('.')).not.toBeUndefined())
  })
})

describe('diffProcessAgainstReference - paridade com a conciliacao', () => {
  const stripPoSetNote = (diffs) => diffs.map((diff) => (diff.field === 'poSet' ? { ...diff, note: '' } : diff))

  function expectParity(result, processes) {
    expect(result.matched.length).toBeGreaterThan(0)
    for (const entry of result.matched) {
      const process = processes.find((item) => item.id === entry.processId)
      const live = diffProcessAgainstReference(process, hintOf(entry.referenceShipment, entry.matchRule))
      expect(stripPoSetNote(live), `${entry.processId} (${entry.matchRule})`).toEqual(stripPoSetNote(entry.diffs))
    }
  }

  it('cenario sintetico completo: todo matched[] tem o mesmo diff ao vivo (ignorando so a nota do poSet)', () => {
    const processes = buildScenarioPortalProcesses()
    const result = run({ rows: buildScenarioLooseRows(), processes })
    expectParity(result, processes)
    // Todo matchRule produzido e' uma das regras que as rules do Firestore aceitam.
    for (const entry of result.matched) expect(ERP_MATCH_RULES).toContain(entry.matchRule)
  })

  it('as 5 regras de casamento e as 2 familias de categoria (mismatch e incompativel) tambem batem', () => {
    const rows = [
      // pedido (categoria incompativel: FCL no Portal, LCL no ERP)
      makeLooseRow({ itemId: 'P-1', pedido: 9036, poRef: 'BETA SEA 904-26', refEmbarque: 'LCL - FOB KOBE', destination: 'KOBE' }),
      // po (name == poRef, processNumber diferente)
      makeLooseRow({ itemId: 'P-2', pedido: 9050, poRef: 'GAMA SEA 905-26', refEmbarque: 'FCL - CFR HAMBURG', vesselRaw: 'ALFA MAERSK 639W' }),
      // po-base (PO dividida)
      makeLooseRow({ itemId: 'P-3', pedido: 9060, poRef: 'LAMBDA SEA 906-26.2', refEmbarque: 'LCL - FOB KOBE' }),
      // consolidado:ref (Portal gravado como FCL => categoryMismatch)
      makeLooseRow({ itemId: 'C-1', pedido: 9010, poRef: 'ALFA SEA 901-26', refEmbarque: 'CON CN 929-26', exporter: 'ALFA CHEM' }),
      makeLooseRow({ itemId: 'C-2', pedido: 9011, poRef: 'GAMA SEA 902-26', refEmbarque: 'CON CN 929-26', exporter: 'GAMA TRADING' }),
      // consolidado:pedidos (REF do name ausente no ERP; casa pelos pedidos)
      makeLooseRow({ itemId: 'D-1', pedido: 9020, poRef: 'DELTA SEA 903-26', refEmbarque: 'CON DG 930-26', exporter: 'DELTA TRADING' }),
      makeLooseRow({ itemId: 'D-2', pedido: 9021, poRef: 'TETA SEA 904-26', refEmbarque: 'CON DG 930-26', exporter: 'TETA TRADING' }),
    ]
    const processes = [
      makePortalProcess({ id: 'p-incompat', name: 'ZETA SEA 910-26', processNumber: '9036', category: 'FCL' }),
      makePortalProcess({ id: 'p-po', name: 'gama sea 905-26', processNumber: '9999', category: 'FCL', vesselName: 'ALFA MAERSK', voyage: '639W' }),
      makePortalProcess({ id: 'p-base', name: 'LAMBDA SEA 906-26', processNumber: '', category: 'LCL' }),
      makePortalProcess({
        id: 'p-con-fcl', name: 'CON CN 929-26', processNumber: '', category: 'FCL',
        purchaseOrders: [{ po: '9010', reference: '', supplierName: '' }],
      }),
      makePortalProcess({
        id: 'p-con-pedidos', name: 'CONSOLIDADO SEM REF', processNumber: '', category: 'CONSOLIDADO',
        purchaseOrders: [
          { po: '9020', reference: 'DELTA SEA 903-26', supplierName: 'DELTA TRADING' },
          { po: '9021', reference: '', supplierName: 'OUTRO' },
        ],
        items: [],
      }),
    ]
    const result = run({ rows, processes })
    expect(result.matched.map((entry) => entry.matchRule).sort()).toEqual(
      ['consolidado:pedidos', 'consolidado:ref', 'pedido', 'po', 'po-base']
    )
    expect(entryOf(result, 'p-incompat').diffs.some((diff) => diff.field === 'category')).toBe(true)
    expect(entryOf(result, 'p-con-fcl').diffs.some((diff) => diff.field === 'category')).toBe(true)
    expectParity(result, processes)
    for (const entry of result.matched) expect(ERP_MATCH_RULES).toContain(entry.matchRule)
  })

  it('categoryFlagsFor: os 3 ramos (consolidado:ref, consolidado:pedidos e os demais com e sem categoria compativel)', () => {
    const lcl = { kind: 'LCL' }
    expect(categoryFlagsFor('consolidado:ref', 'FCL', lcl)).toEqual({ categoryMismatch: true, categoryIncompatible: false })
    expect(categoryFlagsFor('consolidado:ref', 'CONSOLIDADO', lcl)).toEqual({ categoryMismatch: false, categoryIncompatible: false })
    expect(categoryFlagsFor('consolidado:pedidos', 'FCL', lcl)).toEqual({ categoryMismatch: false, categoryIncompatible: false })
    expect(categoryFlagsFor('pedido', 'FCL', lcl)).toEqual({ categoryMismatch: false, categoryIncompatible: true })
    expect(categoryFlagsFor('po', 'LCL', lcl)).toEqual({ categoryMismatch: false, categoryIncompatible: false })
    expect(categoryFlagsFor('po-base', 'AEREO', { kind: 'AMOSTRA' })).toEqual({ categoryMismatch: false, categoryIncompatible: false })
    expect(categoryFlagsFor('pedido', '', lcl).categoryIncompatible).toBe(true)
  })

  it('hint nulo, {}, shipment com items "x", transport ausente e matchRule desconhecido: [] e nunca lanca', () => {
    const process = portal()
    const valid = shipment()
    expect(diffProcessAgainstReference(process, null)).toEqual([])
    expect(diffProcessAgainstReference(process, undefined)).toEqual([])
    expect(diffProcessAgainstReference(process, {})).toEqual([])
    expect(diffProcessAgainstReference(process, hintOf({ ...valid, items: 'x' }))).toEqual([])
    const { transport, ...withoutTransport } = valid
    expect(transport).toBeDefined()
    expect(diffProcessAgainstReference(process, hintOf(withoutTransport))).toEqual([])
    expect(diffProcessAgainstReference(process, hintOf(valid, 'xyz'))).toEqual([])
    expect(diffProcessAgainstReference(null, hintOf(valid))).toEqual([])
    expect(diffProcessAgainstReference(process, { matchRule: 'pedido', shipment: 'x' })).toEqual([])
    // Controle: com o recorte valido a funcao devolve diffs reais (nao e' sempre []).
    expect(Array.isArray(diffProcessAgainstReference(process, hintOf(shipment({ transport: { destination: 'KOBE' } }))))).toBe(true)
    expect(diffProcessAgainstReference(process, hintOf(shipment({ transport: { destination: 'KOBE' } }))).length).toBeGreaterThan(0)
  })
})

describe('scope dos diffs (chaves ja calculadas pelo nucleo)', () => {
  const conRows = [
    makeLooseRow({
      itemId: 'S-1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 929-26', exporter: 'ALFA CHEM',
      commercialName: 'SOLVENTE PI', quantityKg: 2000,
    }),
    makeLooseRow({
      itemId: 'S-2', pedido: 9011, poRef: 'GAMA SEA 906-26', refEmbarque: 'CON CN 929-26', exporter: 'GAMA TRADING',
      commercialName: 'SOLVENTE PI', quantityKg: 3000,
    }),
  ]
  const conProcess = () =>
    makePortalProcess({
      id: 'p-con', name: 'CON CN 929-26', processNumber: '', category: 'CONSOLIDADO',
      purchaseOrders: [
        { po: '9010', reference: '', supplierName: '' },
        { po: 'PO-09011', reference: 'OUTRA REF', supplierName: 'DELTA TRADING' },
      ],
      items: [
        { id: 'i-1', commercialName: 'SOLVENTE PI', quantity: 0, poNumber: '9010' },
        { id: 'i-2', commercialName: 'Solvente Pi', quantity: 2500, poNumber: 'PO-09011' },
      ],
    })

  it('poReference, supplier e quantity do consolidado levam scope em TODOS os kinds (inclusive portal_sem_dado)', () => {
    const result = run({ rows: conRows, processes: [conProcess()] })
    const diffs = entryOf(result, 'p-con').diffs
    const scoped = diffs.filter((diff) => ['poReference', 'supplier', 'quantity'].includes(diff.field))
    expect(scoped.length).toBeGreaterThanOrEqual(5)
    expect(new Set(scoped.map((diff) => diff.kind))).toEqual(new Set(['portal_sem_dado', 'divergente']))
    for (const diff of scoped) {
      expect(diff.scope, `${diff.field}/${diff.kind}`).toBeDefined()
      expect(typeof diff.scope.po).toBe('string')
      expect(diff.scope.poKey).toBe(erpOrderKey(diff.scope.po))
      if (diff.field === 'quantity') expect(diff.scope.nameKey).toBe('SOLVENTE PI')
    }
    const emptyRef = diffs.find((diff) => diff.field === 'poReference' && diff.kind === 'portal_sem_dado')
    expect(emptyRef.scope).toEqual({ po: '9010', poKey: '9010' })
    const otherPo = diffs.find((diff) => diff.field === 'supplier' && diff.kind === 'divergente')
    expect(otherPo.scope.poKey).toBe('9011')
    const emptyQuantity = diffs.find((diff) => diff.field === 'quantity' && diff.kind === 'portal_sem_dado')
    expect(emptyQuantity.scope).toEqual({ po: '9010', poKey: '9010', nameKey: 'SOLVENTE PI' })
  })

  it('fora do consolidado: quantidade leva poKey vazio e o fornecedor do processo NAO leva scope', () => {
    const rows = [makeLooseRow({ itemId: 'F-1', pedido: 9036, poRef: 'BETA SEA 904-26', exporter: 'BETA TRADING', commercialName: 'RESINA OMEGA', quantityKg: 1500.5 })]
    const result = run({
      rows,
      processes: [portal({ supplierName: 'OUTRO FORNECEDOR', items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 1500 }] })],
    })
    const diffs = entryOf(result, 'p-1').diffs
    const supplier = diffs.find((diff) => diff.field === 'supplier')
    expect(supplier.kind).toBe('divergente')
    expect('scope' in supplier).toBe(false)
    const quantity = diffs.find((diff) => diff.field === 'quantity')
    expect(quantity.scope).toEqual({ po: '', poKey: '', nameKey: 'RESINA OMEGA' })
    // Diffs sem escopo continuam sem a chave `scope`.
    expect('scope' in diffs.find((diff) => diff.field === 'category' || diff.field === 'etd' || diff.field === 'supplier')).toBe(false)
  })

  it('erpOrderKey e erpItemGroupKey: os digitos, ou o texto dobrado quando nao ha digito', () => {
    expect(erpOrderKey('PO-09036')).toBe('9036')
    expect(erpOrderKey('ALFA SEA')).toBe('ALFA SEA')
    expect(erpOrderKey('  alfa   sea ')).toBe('ALFA SEA')
    expect(erpItemGroupKey({ commercialName: 'Resina ômega', quantity: 1 }, false)).toBe('|RESINA OMEGA')
    expect(erpItemGroupKey({ commercialName: 'Resina ômega', poNumber: 'PO-9010' }, true)).toBe('9010|RESINA OMEGA')
    expect(erpItemGroupKey({ name: 'Solvente', poNumber: 'ALFA SEA' }, true)).toBe('ALFA SEA|SOLVENTE')
  })

  it('PO sem digitos (ALFA SEA) casa por foldText: o aviso da PO sai na chave do nucleo', () => {
    const process = makePortalProcess({
      id: 'p-con', name: 'CON CN 929-26', category: 'CONSOLIDADO',
      purchaseOrders: [{ po: 'alfa  sea', reference: '', supplierName: 'ALFA CHEM' }],
    })
    const recorte = shipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      orders: [{ pedido: 'ALFA SEA', poRef: 'ALFA SEA 905-26', poBase: '', exporter: 'ALFA CHEM' }],
    })
    const hints = hintsFor(process, recorte, 'consolidado:ref')
    expect(Object.keys(hints.po)).toEqual(['ALFA SEA'])
    expect(hints.po['ALFA SEA'].text).toBe(`No ERP: Ref. ALFA SEA 905-26 · vazio no Portal · ${STAMP_TEXT}`)
  })
})

describe('buildErpReferencePayload', () => {
  it('lanca com resultado bloqueado e com resultado invalido', () => {
    expect(() => buildErpReferencePayload({ blocked: 'lista_portal_vazia' })).toThrow(/bloqueada/)
    expect(() => buildErpReferencePayload(null)).toThrow()
    expect(() => buildErpReferencePayload('x')).toThrow()
  })

  it('cenario sintetico: 1 hint por casado, counts com as 11 chaves, sourceInfo com as 6 e JSON sem sentinelas', () => {
    const result = runScenario()
    const payload = buildErpReferencePayload(result)
    expect(payload.hints.map((hint) => hint.processId).sort()).toEqual(result.matched.map((entry) => entry.processId).sort())
    expect(payload.skipped).toEqual([])
    expect(Object.keys(payload.counts).sort()).toEqual([
      'activeShipments', 'erpOnly', 'erpRows', 'hints', 'hintsSkipped', 'matched', 'matchedArchived',
      'matchedWithDiffs', 'portalOnly', 'shipments', 'warnings',
    ])
    expect(payload.counts).toMatchObject({ erpRows: 10, matched: result.summary.matched, hints: result.matched.length, hintsSkipped: 0 })
    expect(Object.keys(payload.sourceInfo).sort()).toEqual(['fetchedAt', 'fileName', 'generatedOn', 'label', 'rowCount', 'source'])
    expect(payload.sourceInfo).toMatchObject({ source: 'teste', fileName: 'teste.xlsx', generatedOn: SCENARIO_TODAY })
    const json = JSON.stringify(payload)
    for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(json).not.toContain(sentinel)
    walk(payload, (value, pathParts) => expect(value, pathParts.join('.')).not.toBeUndefined())
    for (const hint of payload.hints) {
      expect(Object.keys(hint).sort()).toEqual(['matchRule', 'processId', 'shipment'])
      expect(ERP_MATCH_RULES).toContain(hint.matchRule)
    }
  })

  // Resultado minimo (o payload so' le matched[], sourceInfo e summary).
  const resultWith = (matched) => ({
    blocked: null,
    sourceInfo: { source: 's', label: 'l', fileName: 'x.xlsx', fetchedAt: '', rowCount: 1, generatedOn: '2026-10-02' },
    summary: { erpRows: 1, shipments: 1, activeShipments: 1, matched: matched.length, matchedArchived: 0, matchedWithDiffs: 0 },
    matched,
  })
  const matchedEntry = (processId, recorte, matchRule = 'pedido') => ({ processId, matchRule, referenceShipment: recorte })
  const many = (count, make) => Array.from({ length: count }, (_, index) => make(index))
  const item = (index) => ({ commercialName: `ITEM ${index}`, pedido: '9000', quantityKg: 1 })
  const order = (index) => ({ pedido: String(9000 + index), poRef: '', poBase: '', exporter: 'ALFA' })
  const conflict = (index) => ({ field: 'eta', values: [`2026-10-${String((index % 28) + 1).padStart(2, '0')}`, '2027-01-01'] })

  it('300 itens, 100 pedidos, 20 conflitos, 20 statuses e 10 statusNf passam; 1 a mais pula com o motivo certo', () => {
    const ok = shipment({
      items: many(300, item),
      orders: many(100, order),
      conflicts: many(20, conflict),
      statuses: many(20, (index) => `S${index}`),
      statusNf: many(10, (index) => `N${index}`),
    })
    expect(buildErpReferencePayload(resultWith([matchedEntry('p-ok', ok)])).hints).toHaveLength(1)

    const cases = [
      ['itens_demais', shipment({ items: many(301, item) })],
      ['pedidos_demais', shipment({ orders: many(101, order) })],
      ['conflitos_demais', shipment({ conflicts: many(21, conflict) })],
      ['conflitos_demais', shipment({ conflicts: [{ field: 'eta', values: many(21, (index) => `v${index}`) }] })],
      ['status_demais', shipment({ statuses: many(21, (index) => `S${index}`) })],
      ['status_demais', shipment({ statusNf: many(11, (index) => `N${index}`) })],
    ]
    for (const [reason, recorte] of cases) {
      const payload = buildErpReferencePayload(resultWith([matchedEntry('p-1', recorte)]))
      expect(payload.hints, reason).toEqual([])
      expect(payload.skipped, reason).toEqual([{ processId: 'p-1', reason }])
      expect(payload.counts.hintsSkipped).toBe(1)
    }
  })

  it('hint acima de 200.000 bytes pula por "tamanho" (sem truncar) e o limite exato passa', () => {
    const bigName = 'X'.repeat(1000)
    const heavy = shipment({ items: many(250, (index) => ({ commercialName: `${bigName}${index}`, pedido: '9000', quantityKg: 1 })) })
    expect(JSON.stringify(heavy).length).toBeGreaterThan(ERP_HINT_LIMITS.maxHintBytes)
    const payload = buildErpReferencePayload(resultWith([matchedEntry('p-1', heavy)]))
    expect(payload.skipped).toEqual([{ processId: 'p-1', reason: 'tamanho' }])
    const light = shipment({ items: many(250, (index) => ({ commercialName: `${'X'.repeat(500)}${index}`, pedido: '9000', quantityKg: 1 })) })
    expect(JSON.stringify(light).length).toBeLessThan(ERP_HINT_LIMITS.maxHintBytes)
    expect(buildErpReferencePayload(resultWith([matchedEntry('p-1', light)])).hints).toHaveLength(1)
  })

  it('id invalido (vazio, 129 caracteres, com /, "." , ".." e __x__) e regra desconhecida viram skipped', () => {
    const recorte = shipment()
    const payload = buildErpReferencePayload(
      resultWith([
        matchedEntry('', recorte),
        matchedEntry('a'.repeat(129), recorte),
        matchedEntry('a/b', recorte),
        matchedEntry('.', recorte),
        matchedEntry('..', recorte),
        matchedEntry('__nome__', recorte),
        matchedEntry('a'.repeat(128), recorte),
        matchedEntry('p-regra', recorte, 'xyz'),
        { processId: 'p-sem-recorte', matchRule: 'pedido' },
      ])
    )
    expect(payload.hints.map((hint) => hint.processId)).toEqual(['a'.repeat(128)])
    expect(payload.skipped.map((entry) => entry.reason)).toEqual([
      'id_invalido', 'id_invalido', 'id_invalido', 'id_invalido', 'id_invalido', 'id_invalido',
      'regra_desconhecida', 'sem_recorte',
    ])
    expect(payload.counts).toMatchObject({ hints: 1, hintsSkipped: 8 })
  })

  it('o nome do arquivo e cortado em 255 (e um rotulo, nao dado comparado)', () => {
    const result = resultWith([])
    result.sourceInfo.fileName = 'f'.repeat(300)
    expect(buildErpReferencePayload(result).sourceInfo.fileName).toHaveLength(ERP_HINT_LIMITS.maxFileName)
  })
})

describe('paridade das rules do Firestore com o cliente', () => {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8')
  const numbersOf = (pattern) => [...rules.matchAll(pattern)].map((match) => Number(match[1]))

  it('os tetos da rule sao os de ERP_HINT_LIMITS', () => {
    expect(numbersOf(/shipment\.items\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxItems])
    expect(numbersOf(/shipment\.orders\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxOrders])
    expect(numbersOf(/shipment\.conflicts\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxConflicts])
    expect(numbersOf(/shipment\.statuses\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxStatuses])
    expect(numbersOf(/shipment\.statusNf\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxStatusNf])
    // meta e latest: o mesmo teto de fileName nos dois.
    expect(numbersOf(/fileName\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxFileName, ERP_HINT_LIMITS.maxFileName])
    expect(numbersOf(/createdByName\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxName])
    expect(numbersOf(/updatedByName\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxName])
    expect(numbersOf(/processId\.size\(\) <= (\d+)/g)).toEqual([ERP_HINT_LIMITS.maxProcessIdLength])
  })

  it('a lista de matchRule da rule e ERP_MATCH_RULES', () => {
    const match = /matchRule in \[([^\]]*)\]/.exec(rules)
    expect(match).not.toBeNull()
    const inRule = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
    expect([...inRule].sort()).toEqual([...ERP_MATCH_RULES].sort())
  })

  it('todo literal de regra do nucleo (rule: "x" / rule = "x") esta em ERP_MATCH_RULES', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/features/erp/reconcileErp.js'), 'utf8')
    const literals = [...source.matchAll(/\brule\s*[:=]\s*'([^']+)'/g)].map((match) => match[1])
    expect(literals.length).toBeGreaterThanOrEqual(5)
    for (const literal of literals) expect(ERP_MATCH_RULES, literal).toContain(literal)
    expect(new Set(literals)).toEqual(new Set(ERP_MATCH_RULES))
  })

  it('os conflitos permitidos na rule do hint sao os 8 que os comparadores leem', () => {
    expect(ERP_REFERENCE_CONFLICT_FIELDS).toEqual(['etd', 'eta', 'vessel', 'blAwb', 'origin', 'destination', 'diNumber', 'diDate'])
  })
})

describe('planErpReferenceBatches', () => {
  const small = (count) => Array.from({ length: count }, () => 5000)
  const opsOf = (plan) => plan.map((batch) => batch.ops)

  it('27 hints pequenos: 1 lote de 29 operacoes (meta + 27 + latest)', () => {
    const plan = planErpReferenceBatches(small(27))
    expect(opsOf(plan)).toEqual([29])
    expect(plan[0]).toMatchObject({ hasMeta: true, hasLatest: true })
    expect(plan[0].hintIndexes).toHaveLength(27)
  })

  it('bordas de operacoes: 448 -> [450]; 449 -> [450, 1] (latest sozinho); 450 -> [450, 2]; 0 hints -> [2]', () => {
    expect(opsOf(planErpReferenceBatches(small(448)))).toEqual([450])
    const plan449 = planErpReferenceBatches(small(449))
    expect(opsOf(plan449)).toEqual([450, 1])
    expect(plan449[1]).toMatchObject({ hasMeta: false, hasLatest: true, hintIndexes: [] })
    expect(opsOf(planErpReferenceBatches(small(450)))).toEqual([450, 2])
    expect(opsOf(planErpReferenceBatches([]))).toEqual([2])
    expect(opsOf(planErpReferenceBatches(small(1000)))).toEqual([450, 450, 102])
  })

  it('por bytes: 30 hints de 150.000 bytes nunca passam de 4 MiB por lote; meta so no 1o e latest so no ultimo', () => {
    const plan = planErpReferenceBatches(Array.from({ length: 30 }, () => 150000))
    expect(plan.length).toBeGreaterThan(1)
    for (const batch of plan) expect(batch.bytes).toBeLessThanOrEqual(ERP_HINT_LIMITS.maxBatchBytes)
    expect(plan.filter((batch) => batch.hasMeta)).toEqual([plan[0]])
    expect(plan.filter((batch) => batch.hasLatest)).toEqual([plan[plan.length - 1]])
    const indexes = plan.flatMap((batch) => batch.hintIndexes)
    expect(indexes).toEqual(Array.from({ length: 30 }, (_, index) => index))
  })

  it('estimateErpHintBytes cresce com o recorte', () => {
    const light = estimateErpHintBytes({ shipment: shipment() })
    const heavy = estimateErpHintBytes({ shipment: shipment({ items: Array.from({ length: 50 }, (_, index) => ({ commercialName: `ITEM ${index}`, pedido: '9', quantityKg: 1 })) }) })
    expect(heavy).toBeGreaterThan(light)
    expect(light).toBeGreaterThan(0)
  })
})

describe('formatErpReferenceStamp', () => {
  it('data e hora LOCAIS do import (nunca ISO)', () => {
    expect(formatErpReferenceStamp(new Date(2026, 9, 2, 14, 30).getTime(), { withTime: true })).toBe('02/10/2026 14:30')
    expect(formatErpReferenceStamp(new Date(2026, 9, 2, 14, 30).getTime())).toBe('02/10/2026')
    expect(formatErpReferenceStamp(new Date(2026, 0, 5, 3, 7).getTime(), { withTime: true })).toBe('05/01/2026 03:07')
    expect(formatErpReferenceStamp(null)).toBe('')
    expect(formatErpReferenceStamp(Number.NaN)).toBe('')
  })
})

describe('buildErpFieldHints - quando o aviso acende', () => {
  it('ERP_HINT_KINDS e so divergente e portal_sem_dado; os rotulos incluem Origem', () => {
    expect(ERP_HINT_KINDS).toEqual(['divergente', 'portal_sem_dado'])
    expect(ERP_HINT_TARGET_LABELS.origin).toBe('Origem')
    expect(Object.isFrozen(EMPTY_ERP_HINTS)).toBe(true)
  })

  it('ref-caso: R-01 navio divergente acende e, corrigido no Portal, apaga', () => {
    const recorte = shipment({ transport: { vessel: { name: 'BETA FAME', raw: 'BETA FAME 12W', voyage: '12W' } } })
    const wrong = portal({ vesselName: 'ALFA MAERSK', voyage: '639W' })
    const hints = hintsFor(wrong, recorte)
    expect(hints.fields.vessel).toMatchObject({ kind: 'divergente', ariaLabel: 'Navio no ERP: BETA FAME 12W' })
    expect(hints.fields.vessel.text).toBe(`No ERP: BETA FAME 12W · ${STAMP_TEXT}`)
    const fixed = portal({ vesselName: 'BETA FAME', voyage: '12W' })
    expect(hintsFor(fixed, recorte).fields).toEqual({})
  })

  it('ref-caso: R-02 NAVEGANTES x ITAJAI acende no destino; ITAJAI x ITAJAÍ e so formato e nao acende', () => {
    const itajai = shipment({ transport: { destination: 'ITAJAI' } })
    const different = hintsFor(portal({ destination: 'NAVEGANTES' }), itajai)
    expect(different.fields.destination).toMatchObject({ kind: 'divergente', ariaLabel: 'Destino no ERP: ITAJAI' })
    expect(different.fields.destination.text).toBe(`No ERP: ITAJAI · ${STAMP_TEXT}`)
    expect(hintsFor(portal({ destination: 'ITAJAÍ' }), itajai).fields).toEqual({})
  })

  it('ref-caso: R-03 fornecedor da PO "9112" no consolidado acende na PO (1 chip junta Ref. e Fornecedor)', () => {
    const recorte = shipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      orders: [{ pedido: '9112', poRef: 'GAMA SEA 911-26', poBase: '', exporter: 'DELTA TRADING' }],
    })
    const process = makePortalProcess({
      id: 'p-con', name: 'CON CN 929-26', category: 'CONSOLIDADO',
      purchaseOrders: [{ po: '9112', reference: '', supplierName: 'GAMA TRADING' }],
    })
    const hints = hintsFor(process, recorte, 'consolidado:ref')
    expect(Object.keys(hints.po)).toEqual(['9112'])
    expect(hints.po['9112'].kind).toBe('divergente')
    // Caso misto: so a parte vazia leva "(vazio no Portal)".
    expect(hints.po['9112'].text).toBe(
      `No ERP: Ref. GAMA SEA 911-26 (vazio no Portal); Fornecedor DELTA TRADING · ${STAMP_TEXT}`
    )
    expect(hints.po['9112'].ariaLabel).toBe('PO 9112 no ERP: Ref. GAMA SEA 911-26; Fornecedor DELTA TRADING')
    expect(hints.fields).toEqual({})

    // Todas as partes vazias: o "vazio no Portal" vai no fim, uma vez so.
    const emptyAll = makePortalProcess({
      id: 'p-con', name: 'CON CN 929-26', category: 'CONSOLIDADO',
      purchaseOrders: [{ po: '9112', reference: '', supplierName: '' }],
    })
    const allEmpty = hintsFor(emptyAll, recorte, 'consolidado:ref').po['9112']
    expect(allEmpty.kind).toBe('portal_sem_dado')
    expect(allEmpty.text).toBe(
      `No ERP: Ref. GAMA SEA 911-26; Fornecedor DELTA TRADING · vazio no Portal · ${STAMP_TEXT}`
    )
  })

  it('ref-caso: R-04 quantidade 1500 x 1500,5 acende (texto de soma) e, corrigida, apaga', () => {
    const recorte = shipment({
      items: [
        { commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg: 1000 },
        { commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg: 500.5 },
      ],
    })
    const wrong = portal({ items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 1500 }] })
    const hints = hintsFor(wrong, recorte)
    expect(Object.keys(hints.quantity)).toEqual(['|RESINA OMEGA'])
    expect(hints.quantity['|RESINA OMEGA']).toMatchObject({
      kind: 'divergente',
      ariaLabel: 'Quantidade de RESINA OMEGA no ERP (soma do item): 1500,500 kg',
      text: `No ERP (soma do item): 1500,500 kg · Portal soma 1500,000 kg · ${STAMP_TEXT}`,
    })
    const fixed = portal({ items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 1500.5 }] })
    expect(hintsFor(fixed, recorte).quantity).toEqual({})
  })

  it('ref-caso: R-05 navio escrito com "V-" na viagem e so formato e nao acende', () => {
    const recorte = shipment({ transport: { vessel: { name: 'ALFA MAERSK', raw: 'ALFA MAERSK 639W', voyage: '639W' } } })
    expect(hintsFor(portal({ vesselName: 'ALFA MAERSK', voyage: 'V-639W' }), recorte).fields).toEqual({})
  })

  it('ref-caso: R-06 viagem parcial do ERP (CR-28) e so informativa e nao acende', () => {
    const recorte = shipment({ transport: { vessel: { name: 'ALFA MAERSK', raw: 'ALFA MAERSK 639', voyage: '639' } } })
    expect(hintsFor(portal({ vesselName: 'ALFA MAERSK', voyage: '639W' }), recorte).fields).toEqual({})
  })

  it('ref-caso: R-07 hint de outro snapshot nao acende', () => {
    const recorte = shipment({ transport: { destination: 'ITAJAI' } })
    const process = portal({ destination: 'NAVEGANTES' })
    expect(Object.keys(hintsFor(process, recorte).fields)).toEqual(['destination'])
    const stale = buildErpFieldHints(process, { snapshot: SNAPSHOT, hint: hintOf(recorte, 'pedido', 'BBBBBBBBBBBBBBBBBBBB') })
    expect(stale).toEqual({ fields: {}, po: {}, quantity: {} })
    expect(buildErpFieldHints(process, { snapshot: SNAPSHOT, hint: null })).toEqual({ fields: {}, po: {}, quantity: {} })
    expect(buildErpFieldHints(process, null)).toEqual({ fields: {}, po: {}, quantity: {} })
  })

  it('ref-caso: R-08 FCL no Portal x LCL no ERP (CR-29): categoria nao acende, destino divergente acende', () => {
    const recorte = shipment({ kind: 'LCL', portalCategory: 'LCL', transport: { destination: 'ITAJAI' } })
    const process = portal({ destination: 'NAVEGANTES' })
    const diffs = diffProcessAgainstReference(process, hintOf(recorte))
    expect(diffs.find((diff) => diff.field === 'category')?.kind).toBe('divergente')
    expect(Object.keys(hintsFor(process, recorte).fields)).toEqual(['destination'])
  })

  it('ref-caso: R-09 dois itens do Portal com o mesmo nome (750 + 750) x ERP 1500,5: um unico aviso, com o texto de soma', () => {
    const recorte = shipment({ items: [{ commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg: 1500.5 }] })
    const process = portal({
      items: [
        { id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 750 },
        { id: 'i-2', commercialName: 'Resina Omega', quantity: 750 },
      ],
    })
    const hints = hintsFor(process, recorte)
    expect(Object.keys(hints.quantity)).toEqual(['|RESINA OMEGA'])
    expect(hints.quantity['|RESINA OMEGA'].text).toContain('soma do item')
    expect(hints.quantity['|RESINA OMEGA'].text).toContain('Portal soma 1500,000 kg')
  })

  it('ref-caso: R-10 ETA vazia no Portal acende "vazio no Portal"; igual ao ERP apaga; outra data vira divergente', () => {
    const recorte = shipment({ transport: { eta: '2026-10-06' } })
    const empty = hintsFor(portal({ eta: '' }), recorte).fields.eta
    expect(empty).toEqual({
      kind: 'portal_sem_dado',
      ariaLabel: 'ETA no ERP: 06/10/2026',
      text: `No ERP: 06/10/2026 · vazio no Portal · ${STAMP_TEXT}`,
      portalFields: ['eta'],
    })
    expect(hintsFor(portal({ eta: '2026-10-06' }), recorte).fields).toEqual({})
    const other = hintsFor(portal({ eta: '2026-10-20' }), recorte).fields.eta
    expect(other.kind).toBe('divergente')
    expect(other.text).toBe(`No ERP: 06/10/2026 · ${STAMP_TEXT}`)
    expect(other.text).not.toContain('vazio no Portal')
  })

  it('ref-caso: R-12 Origem vazia no Portal acende; Origem preenchida com outro texto e informativa e nao acende', () => {
    const recorte = shipment({ transport: { origin: 'HAMBURG' } })
    const empty = hintsFor(portal({ originLocation: '' }), recorte).fields.origin
    expect(empty.kind).toBe('portal_sem_dado')
    expect(empty.ariaLabel).toBe('Origem no ERP: HAMBURG')
    expect(empty.portalFields).toEqual(['originLocation'])
    expect(hintsFor(portal({ originLocation: 'ROTTERDAM' }), recorte).fields).toEqual({})
  })

  it('ref-caso: R-16 quantidade zerada no Portal acende na chave do grupo, com o texto de quantidade vazia', () => {
    const recorte = shipment({ items: [{ commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg: 1500.5 }] })
    const process = portal({ items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 0 }] })
    const hints = hintsFor(process, recorte)
    expect(hints.quantity['|RESINA OMEGA']).toEqual({
      kind: 'portal_sem_dado',
      ariaLabel: 'Quantidade de RESINA OMEGA no ERP (soma do item): 1500,500 kg',
      text: `No ERP (soma do item): 1500,500 kg · vazio no Portal · ${STAMP_TEXT}`,
      portalFields: ['items'],
    })
  })

  it('ref-caso: R-17 nao geram aviso: processNumber vazio, item do ERP ausente no Portal e erp_sem_dado', () => {
    const base = shipment({ orders: [{ pedido: '9036', poRef: 'BETA SEA 904-26', poBase: '', exporter: '' }] })
    // pedido vazio no Portal (portal_sem_dado de um campo fora do mapa)
    const noNumber = portal({ processNumber: '' })
    expect(diffProcessAgainstReference(noNumber, hintOf(base)).some((diff) => diff.field === 'pedido' && diff.kind === 'portal_sem_dado')).toBe(true)
    expect(hintsFor(noNumber, base).fields).toEqual({})
    // item do ERP que nao existe no Portal (portal_sem_dado em `items`)
    const withItem = shipment({ ...base, items: [{ commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg: 10 }] })
    const noItem = portal()
    expect(diffProcessAgainstReference(noItem, hintOf(withItem)).some((diff) => diff.field === 'items' && diff.kind === 'portal_sem_dado')).toBe(true)
    expect(hintsFor(noItem, withItem)).toEqual({ fields: {}, po: {}, quantity: {} })
    // erp_sem_dado: navio preenchido no Portal e vazio no ERP
    const withVessel = portal({ vesselName: 'ALFA MAERSK', voyage: '639W' })
    expect(diffProcessAgainstReference(withVessel, hintOf(base)).some((diff) => diff.field === 'vessel' && diff.kind === 'erp_sem_dado')).toBe(true)
    expect(hintsFor(withVessel, base).fields).toEqual({})
  })

  it('nao acendem formato, informativo, erp_sem_dado, erp_atrasado nem erp_conflito (so os 2 kinds acendem)', () => {
    const base = shipment({ stage: 0, orders: [{ pedido: '9036', poRef: 'BETA SEA 904-26', poBase: '', exporter: '' }] })
    const cases = {
      formato: [portal({ destination: 'ITAJAÍ' }), shipment({ transport: { destination: 'ITAJAI' } })],
      informativo: [portal({ originLocation: 'ROTTERDAM' }), shipment({ transport: { origin: 'HAMBURG' } })],
      erp_sem_dado: [portal({ eta: '2026-10-06' }), base],
      erp_atrasado: [portal({ processStatus: 'Carga recebida' }), base],
      erp_conflito: [
        portal({ eta: '2026-10-05' }),
        shipment({ conflicts: [{ field: 'eta', values: ['2026-10-06', '2026-10-07'] }] }),
      ],
    }
    for (const [kind, [process, recorte]] of Object.entries(cases)) {
      const diffs = diffProcessAgainstReference(process, hintOf(recorte))
      expect(diffs.some((diff) => diff.kind === kind), `${kind} existe no nucleo`).toBe(true)
      expect(hintsFor(process, recorte), kind).toEqual({ fields: {}, po: {}, quantity: {} })
    }
  })

  it('cada aviso tem exatamente as chaves ariaLabel, kind, portalFields e text', () => {
    const recorte = shipment({
      incoterm: 'CFR',
      transport: {
        etd: '2026-10-06', eta: '2026-10-14', destination: 'ITAJAI', blAwb: 'BL9036', origin: 'HAMBURG',
        vessel: { name: 'BETA FAME', raw: 'BETA FAME 12W', voyage: '12W' }, diNumber: 'DI-9036', diDate: '2026-10-20',
      },
      orders: [{ pedido: '9036', poRef: 'BETA SEA 904-26', poBase: '', exporter: 'BETA TRADING' }],
    })
    const hints = hintsFor(portal(), recorte)
    expect(Object.keys(hints.fields).sort()).toEqual([
      'bl', 'destination', 'duimpNumber', 'duimpRegisteredAt', 'eta', 'etd', 'incoterm', 'origin', 'supplier', 'vessel',
    ])
    for (const hint of Object.values(hints.fields)) {
      expect(Object.keys(hint).sort()).toEqual(['ariaLabel', 'kind', 'portalFields', 'text'])
      expect(ERP_HINT_KINDS).toContain(hint.kind)
      expect(hint.ariaLabel).toContain('no ERP: ')
      expect(hint.text.startsWith('No ERP: ')).toBe(true)
      expect(hint.text.endsWith(STAMP_TEXT)).toBe(true)
    }
    expect(hints.fields.etd.ariaLabel).toBe('ETD no ERP: 06/10/2026')
    expect(hints.fields.duimpRegisteredAt.ariaLabel).toBe('Registro da DUIMP no ERP: 20/10/2026')
    expect(hints.fields.duimpNumber.ariaLabel).toBe('Nº da DUIMP no ERP: DI-9036')
    expect(hints.fields.supplier.ariaLabel).toBe('Fornecedor no ERP: BETA TRADING')
    expect(hints.fields.bl.portalFields).toEqual(['masterBl', 'houseBl'])
    expect(hints.fields.etd.portalFields).toEqual(['etd', 'shippedAt'])
  })

  it('valor longo do ERP e cortado em 120 caracteres so na exibicao', () => {
    const long = 'Y'.repeat(300)
    const hints = hintsFor(portal({ destination: 'NAVEGANTES' }), shipment({ transport: { destination: long } }))
    expect(hints.fields.destination.text).toContain(`${'Y'.repeat(120)}…`)
    expect(hints.fields.destination.text).not.toContain('Y'.repeat(121))
    expect(hints.fields.destination.ariaLabel).toBe(`Destino no ERP: ${'Y'.repeat(120)}…`)
  })

  it('chaves por poKey (consolidado) e por groupKey (quantidade)', () => {
    const recorte = shipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      orders: [
        { pedido: '9010', poRef: 'ALFA SEA 905-26', poBase: '', exporter: 'ALFA CHEM' },
        { pedido: '9011', poRef: 'GAMA SEA 906-26', poBase: '', exporter: 'GAMA TRADING' },
      ],
      items: [
        { commercialName: 'SOLVENTE PI', pedido: '9010', quantityKg: 2000 },
        { commercialName: 'SOLVENTE PI', pedido: '9011', quantityKg: 3000 },
      ],
    })
    const process = makePortalProcess({
      id: 'p-con', name: 'CON CN 929-26', category: 'CONSOLIDADO',
      purchaseOrders: [
        { po: '9010', reference: 'ALFA SEA 905-26', supplierName: 'ALFA CHEM' },
        { po: '9011', reference: 'GAMA SEA 906-26', supplierName: 'OUTRO' },
      ],
      items: [
        { id: 'i-1', commercialName: 'SOLVENTE PI', quantity: 2000, poNumber: '9010' },
        { id: 'i-2', commercialName: 'SOLVENTE PI', quantity: 100, poNumber: '9011' },
      ],
    })
    const hints = hintsFor(process, recorte, 'consolidado:ref')
    expect(Object.keys(hints.po)).toEqual(['9011'])
    expect(Object.keys(hints.quantity)).toEqual(['9011|SOLVENTE PI'])
    expect(hints.quantity['9011|SOLVENTE PI'].text).toBe(
      `No ERP (soma do item): 3000,000 kg · Portal soma 100,000 kg · ${STAMP_TEXT}`
    )
    expect(hints.po['9011'].text).toBe(`No ERP: Fornecedor GAMA TRADING · ${STAMP_TEXT}`)
  })
})
