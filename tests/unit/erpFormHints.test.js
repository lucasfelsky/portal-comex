// Avisos "ERP" do formulario de edicao (`buildErpFormHints`): o mesmo mapa de
// `buildErpFieldHints`, para o RASCUNHO, com o que o clique no chip grava
// (`apply`). Fixtures 100% sinteticas (prefixos gregos, PEDIDO 9000-9999, REF de
// consolidado 9nn-26).
import { describe, expect, it } from 'vitest'
import {
  ERP_FORM_APPLY_FIELDS,
  allowedErpApplyOperations,
  buildErpFieldHints,
  buildErpFormHints,
} from '../../src/features/erp/erpReference.js'
import { makePortalProcess } from '../fixtures/erp/dbcorpSynthetic.js'

const SNAPSHOT_ID = 'AAAAAAAAAAAAAAAAAAAA'
const STAMP_MS = new Date(2026, 9, 2, 14, 30).getTime()
const SNAPSHOT = { snapshotId: SNAPSHOT_ID, updatedAtMs: STAMP_MS }
const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']

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

const hintOf = (value, matchRule = 'pedido') => ({ snapshotId: SNAPSHOT_ID, matchRule, shipment: value })
const portal = (overrides = {}) =>
  makePortalProcess({ id: 'p-1', name: 'BETA SEA 904-26', processNumber: '9036', category: 'FCL', ...overrides })
const consolidated = (overrides = {}) =>
  makePortalProcess({ id: 'p-con', name: 'CON CN 929-26', category: 'CONSOLIDADO', ...overrides })

// Toda chamada confere a allowlist: nenhum `op.field` fora de ERP_FORM_APPLY_FIELDS.
function formHints(process, recorte, { matchRule = 'pedido', incotermOptions = INCOTERMS } = {}) {
  const hints = buildErpFormHints(process, { snapshot: SNAPSHOT, hint: hintOf(recorte, matchRule) }, { incotermOptions })
  const all = [...Object.values(hints.fields), ...Object.values(hints.po), ...Object.values(hints.quantity)]
  for (const entry of all) {
    for (const operation of entry.apply ?? []) expect(ERP_FORM_APPLY_FIELDS).toContain(operation.field)
  }
  return hints
}
const fieldHintsOf = (process, recorte, matchRule = 'pedido') =>
  buildErpFieldHints(process, { snapshot: SNAPSHOT, hint: hintOf(recorte, matchRule) })

// Reducer do formulario: so' grava o campo (os efeitos colaterais da pagina nao
// mudam o que o nucleo compara nestes cenarios).
const applyOps = (draft, ops) => ops.reduce((current, operation) => ({ ...current, [operation.field]: operation.value }), draft)

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const inner of Object.values(value)) deepFreeze(inner)
  }
  return value
}

const RICH = shipment({
  incoterm: 'CFR',
  transport: {
    etd: '2026-10-06',
    eta: '2026-11-14',
    destination: 'ITAJAI',
    blAwb: 'BL9036',
    origin: 'HAMBURG',
    vessel: { name: 'BETA FAME', raw: 'BETA FAME 12W', voyage: '12W' },
    diNumber: 'DI-9036',
    diDate: '2026-10-20',
  },
  orders: [{ pedido: '9036', poRef: 'BETA SEA 904-26', poBase: '', exporter: 'BETA TRADING' }],
})

describe('buildErpFormHints - paridade com buildErpFieldHints', () => {
  it('mesmas chaves, kind, ariaLabel e portalFields; mesmo texto quando ha valor aplicavel', () => {
    const process = portal()
    const form = formHints(process, RICH)
    const base = fieldHintsOf(process, RICH)
    expect(Object.keys(form.fields).sort()).toEqual(Object.keys(base.fields).sort())
    expect(Object.keys(form.fields).sort()).toEqual([
      'bl', 'destination', 'duimpNumber', 'duimpRegisteredAt', 'eta', 'etd', 'incoterm', 'origin', 'supplier', 'vessel',
    ])
    for (const key of Object.keys(base.fields)) {
      const hint = form.fields[key]
      expect(hint, key).toHaveProperty('apply')
      expect(hint.kind, key).toBe(base.fields[key].kind)
      expect(hint.ariaLabel, key).toBe(base.fields[key].ariaLabel)
      expect(hint.portalFields, key).toEqual(base.fields[key].portalFields)
      if (hint.apply !== null && key !== 'duimpRegisteredAt') expect(hint.text, key).toBe(base.fields[key].text)
    }
  })

  it('PO e quantidade tambem espelham o mapa base', () => {
    const recorte = shipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      orders: [{ pedido: '9112', poRef: 'GAMA SEA 911-26', poBase: '', exporter: 'DELTA TRADING' }],
      items: [{ commercialName: 'RESINA OMEGA', pedido: '9112', quantityKg: 1000 }],
    })
    const process = consolidated({
      purchaseOrders: [{ po: '9112', reference: '', supplierName: '' }],
      items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', poNumber: '9112', quantity: 10 }],
    })
    const form = formHints(process, recorte, { matchRule: 'consolidado:ref' })
    const base = fieldHintsOf(process, recorte, 'consolidado:ref')
    expect(Object.keys(form.po)).toEqual(Object.keys(base.po))
    expect(Object.keys(form.quantity)).toEqual(Object.keys(base.quantity))
    expect(Object.keys(form.po)).toEqual(['9112'])
    expect(Object.keys(form.quantity)).toEqual(['9112|RESINA OMEGA'])
    for (const [key, hint] of Object.entries(form.po)) {
      expect({ ...hint, apply: undefined }).toEqual({ ...base.po[key], apply: undefined })
      expect(hint.text).toBe(base.po[key].text)
    }
    for (const [key, hint] of Object.entries(form.quantity)) {
      expect(hint.text).toBe(base.quantity[key].text)
      expect(hint.ariaLabel).toBe(base.quantity[key].ariaLabel)
    }
  })
})

describe('buildErpFormHints - campos simples e recalculo ao vivo', () => {
  it('ETA divergente -> [{ eta }]; aplicado, o aviso some', () => {
    const recorte = shipment({ transport: { eta: '2026-11-14' } })
    const draft = portal({ eta: '2026-10-20' })
    const hints = formHints(draft, recorte)
    expect(hints.fields.eta.apply).toEqual([{ field: 'eta', value: '2026-11-14' }])
    expect(hints.fields.eta.text).toBe('No ERP: 14/11/2026 · planilha de 02/10/2026')
    expect(formHints(applyOps(draft, hints.fields.eta.apply), recorte).fields.eta).toBeUndefined()
  })

  it('ETD vazio no Portal -> [{ etd }]; aplicado, o aviso some', () => {
    const recorte = shipment({ transport: { etd: '2026-10-06' } })
    const draft = portal({ etd: '' })
    const hints = formHints(draft, recorte)
    expect(hints.fields.etd.kind).toBe('portal_sem_dado')
    expect(hints.fields.etd.apply).toEqual([{ field: 'etd', value: '2026-10-06' }])
    expect(formHints(applyOps(draft, hints.fields.etd.apply), recorte).fields.etd).toBeUndefined()
  })

  it('data do ERP em formato inesperado -> so aviso, com o motivo no texto', () => {
    const recorte = shipment({ transport: { eta: '14/11/2026' } })
    const hint = formHints(portal({ eta: '2026-10-20' }), recorte).fields.eta
    expect(hint.apply).toBeNull()
    expect(hint.text).toContain('data do ERP em formato inesperado')
  })

  it('Destino, Nº DUIMP e Origem: uma operacao cada e o aviso some depois de aplicar', () => {
    const recorte = shipment({
      transport: { destination: 'ITAJAI', diNumber: 'DI-9036', origin: 'HAMBURG' },
    })
    const draft = portal({ destination: 'NAVEGANTES', duimpNumber: '', originLocation: '' })
    const hints = formHints(draft, recorte)
    expect(hints.fields.destination.apply).toEqual([{ field: 'destination', value: 'ITAJAI' }])
    expect(hints.fields.duimpNumber.apply).toEqual([{ field: 'duimpNumber', value: 'DI-9036' }])
    expect(hints.fields.origin.apply).toEqual([{ field: 'originLocation', value: 'HAMBURG' }])
    for (const key of ['destination', 'duimpNumber', 'origin']) {
      const next = formHints(applyOps(draft, hints.fields[key].apply), recorte)
      expect(next.fields[key], key).toBeUndefined()
    }
  })

  it('Fornecedor (nao consolidado) -> [{ supplierName }]', () => {
    const recorte = shipment({
      orders: [{ pedido: '9036', poRef: 'BETA SEA 904-26', poBase: '', exporter: 'BETA TRADING' }],
    })
    const draft = portal({ supplierName: '' })
    const hints = formHints(draft, recorte)
    expect(hints.fields.supplier.apply).toEqual([{ field: 'supplierName', value: 'BETA TRADING' }])
    expect(formHints(applyOps(draft, hints.fields.supplier.apply), recorte).fields.supplier).toBeUndefined()
  })
})

describe('buildErpFormHints - navio, BL, DUIMP e Incoterm', () => {
  it('navio com viagem no ERP -> vesselName + voyage', () => {
    const recorte = shipment({ transport: { vessel: { name: 'BETA FAME', raw: 'BETA FAME 12W', voyage: '12W' } } })
    const draft = portal({ vesselName: 'ALFA MAERSK', voyage: '639W' })
    const hint = formHints(draft, recorte).fields.vessel
    expect(hint.apply).toEqual([
      { field: 'vesselName', value: 'BETA FAME' },
      { field: 'voyage', value: '12W' },
    ])
    expect(formHints(applyOps(draft, hint.apply), recorte).fields.vessel).toBeUndefined()
  })

  it('navio sem viagem no ERP -> so vesselName (nunca voyage vazio)', () => {
    const recorte = shipment({ transport: { vessel: { name: 'BETA FAME', raw: 'BETA FAME', voyage: '' } } })
    const hint = formHints(portal({ vesselName: 'ALFA MAERSK', voyage: '639W' }), recorte).fields.vessel
    expect(hint.apply).toEqual([{ field: 'vesselName', value: 'BETA FAME' }])
    expect(hint.apply.some((operation) => operation.field === 'voyage')).toBe(false)
  })

  it('BL maritimo -> houseBl; AEREO -> so aviso, mandando conferir MAWB ou HAWB', () => {
    const maritime = shipment({ transport: { blAwb: 'BL9036' } })
    const sea = formHints(portal({ houseBl: '' }), maritime).fields.bl
    expect(sea.apply).toEqual([{ field: 'houseBl', value: 'BL9036' }])
    expect(formHints(applyOps(portal({ houseBl: '' }), sea.apply), maritime).fields.bl).toBeUndefined()

    const air = shipment({ kind: 'AEREO', portalCategory: 'AEREO', transport: { blAwb: 'AWB9036' } })
    const hint = formHints(portal({ category: 'AEREO', mawb: '', hawb: '' }), air).fields.bl
    expect(hint.kind).toBe('portal_sem_dado')
    expect(hint.apply).toBeNull()
    expect(hint.text).toContain('MAWB ou HAWB')
  })

  it('Registro da DUIMP mantem a hora que ja esta no rascunho', () => {
    const recorte = shipment({ transport: { diDate: '2026-10-20' } })
    const draft = portal({ duimpRegisteredAt: '2026-10-10T14:30' })
    const hint = formHints(draft, recorte).fields.duimpRegisteredAt
    expect(hint.kind).toBe('divergente')
    expect(hint.apply).toEqual([{ field: 'duimpRegisteredAt', value: '2026-10-20T14:30' }])
    expect(hint.text).not.toContain('00:00')
    expect(formHints(applyOps(draft, hint.apply), recorte).fields.duimpRegisteredAt).toBeUndefined()
  })

  it('Registro da DUIMP vazio entra como T00:00 e o texto avisa', () => {
    const recorte = shipment({ transport: { diDate: '2026-10-20' } })
    const draft = portal({ duimpRegisteredAt: '' })
    const hint = formHints(draft, recorte).fields.duimpRegisteredAt
    expect(hint.apply).toEqual([{ field: 'duimpRegisteredAt', value: '2026-10-20T00:00' }])
    expect(hint.text).toContain('a hora entra como 00:00')
    expect(formHints(applyOps(draft, hint.apply), recorte).fields.duimpRegisteredAt).toBeUndefined()
  })

  it('Incoterm na lista -> operacao com a opcao da lista; fora da lista (ou sem lista) -> so aviso', () => {
    const inList = shipment({ incoterm: 'cfr' })
    const hint = formHints(portal({ incoterm: 'FOB' }), inList).fields.incoterm
    expect(hint.apply).toEqual([{ field: 'incoterm', value: 'CFR' }])

    const outside = shipment({ incoterm: 'XYZ' })
    const blocked = formHints(portal({ incoterm: 'FOB' }), outside).fields.incoterm
    expect(blocked.apply).toBeNull()
    expect(blocked.text).toContain('fora da lista de Incoterms do Portal')

    const withoutList = formHints(portal({ incoterm: 'FOB' }), inList, { incotermOptions: [] }).fields.incoterm
    expect(withoutList.apply).toBeNull()
  })
})

describe('buildErpFormHints - POs do consolidado', () => {
  const twoOrders = shipment({
    kind: 'CONSOLIDADO',
    portalCategory: 'CONSOLIDADO',
    key: 'CON CN 929-26',
    orders: [
      { pedido: '9112', poRef: 'GAMA SEA 911-26', poBase: '', exporter: 'DELTA TRADING' },
      { pedido: '9113', poRef: 'GAMA SEA 912-26', poBase: '', exporter: 'ZETA TRADING' },
    ],
  })
  const run = (process, recorte = twoOrders) => formHints(process, recorte, { matchRule: 'consolidado:ref' })

  it('Portal sem POs -> acrescenta todas, ja com referencia e fornecedor; aplicado, nada acende', () => {
    const draft = consolidated({ purchaseOrders: [] })
    const hints = run(draft)
    expect(hints.fields.poSet.kind).toBe('portal_sem_dado')
    expect(hints.fields.poSet.apply).toEqual([
      {
        field: 'purchaseOrders',
        value: [
          { po: '9112', reference: 'GAMA SEA 911-26', supplierName: 'DELTA TRADING' },
          { po: '9113', reference: 'GAMA SEA 912-26', supplierName: 'ZETA TRADING' },
        ],
      },
    ])
    const next = run(applyOps(draft, hints.fields.poSet.apply))
    expect(next.fields).toEqual({})
    expect(next.po).toEqual({})
  })

  it('falta uma e sobra outra -> so acrescenta a que falta e preserva a que sobra; o aviso restante nao aplica', () => {
    const existing = { po: '9112', reference: 'GAMA SEA 911-26', supplierName: 'DELTA TRADING' }
    const extra = { po: '9199', reference: '', supplierName: '' }
    const draft = consolidated({ purchaseOrders: [existing, extra] })
    const hints = run(draft)
    expect(hints.fields.poSet.kind).toBe('divergente')
    const [operation] = hints.fields.poSet.apply
    expect(operation.field).toBe('purchaseOrders')
    expect(operation.value).toEqual([
      existing,
      extra,
      { po: '9113', reference: 'GAMA SEA 912-26', supplierName: 'ZETA TRADING' },
    ])
    expect(operation.value[0]).toBe(existing)
    expect(operation.value[1]).toBe(extra)

    const after = run(applyOps(draft, hints.fields.poSet.apply))
    expect(after.fields.poSet.kind).toBe('divergente')
    expect(after.fields.poSet.apply).toBeNull()
    expect(after.fields.poSet.text).toContain('sobram POs no Portal')
  })

  it('so sobra (nada falta) -> so aviso, com o motivo', () => {
    const draft = consolidated({
      purchaseOrders: [
        { po: '9112', reference: 'GAMA SEA 911-26', supplierName: 'DELTA TRADING' },
        { po: '9113', reference: 'GAMA SEA 912-26', supplierName: 'ZETA TRADING' },
        { po: '9199', reference: '', supplierName: '' },
      ],
    })
    const hint = run(draft).fields.poSet
    expect(hint.apply).toBeNull()
    expect(hint.text).toContain('sobram POs no Portal: remova à mão se for o caso')
  })

  it('Ref. e fornecedor de uma PO -> uma operacao purchaseOrders que muda so a PO alvo', () => {
    const other = { po: '9113', reference: 'GAMA SEA 912-26', supplierName: 'ZETA TRADING' }
    const draft = consolidated({
      purchaseOrders: [{ po: '9112', reference: '', supplierName: 'GAMA TRADING' }, other],
    })
    const hints = run(draft)
    expect(Object.keys(hints.po)).toEqual(['9112'])
    const [operation] = hints.po['9112'].apply
    expect(operation.field).toBe('purchaseOrders')
    expect(operation.value).toEqual([
      { po: '9112', reference: 'GAMA SEA 911-26', supplierName: 'DELTA TRADING' },
      other,
    ])
    expect(operation.value[1]).toBe(other)
    expect(run(applyOps(draft, hints.po['9112'].apply)).po).toEqual({})
  })

  it('POs legadas em string nao sao tratadas como vazias (o form normaliza antes)', () => {
    const draft = consolidated({
      purchaseOrders: [
        { po: '9112', reference: 'GAMA SEA 911-26', supplierName: 'DELTA TRADING' },
        { po: '9113', reference: 'GAMA SEA 912-26', supplierName: 'ZETA TRADING' },
      ],
    })
    expect(run(draft).fields).toEqual({})
  })
})

describe('buildErpFormHints - quantidade', () => {
  const omega = (quantityKg) => ({ commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg })

  it('1 linha no grupo -> operacao items que muda so a linha alvo; aplicado, o aviso some', () => {
    const recorte = shipment({ items: [omega(1500.5)] })
    const other = { id: 'i-2', commercialName: 'RESINA SIGMA', quantity: 5 }
    const draft = portal({ items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 0 }, other] })
    const hints = formHints(draft, recorte)
    expect(Object.keys(hints.quantity)).toEqual(['|RESINA OMEGA'])
    const [operation] = hints.quantity['|RESINA OMEGA'].apply
    expect(operation.field).toBe('items')
    expect(operation.value).toEqual([{ id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 1500.5 }, other])
    expect(operation.value[1]).toBe(other)
    expect(formHints(applyOps(draft, hints.quantity['|RESINA OMEGA'].apply), recorte).quantity).toEqual({})
  })

  it('2 linhas no grupo -> so aviso ("2 linhas"), sem distribuir a soma', () => {
    const recorte = shipment({ items: [omega(1500.5)] })
    const draft = portal({
      items: [
        { id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 750 },
        { id: 'i-2', commercialName: 'Resina Omega', quantity: 750 },
      ],
    })
    const hint = formHints(draft, recorte).quantity['|RESINA OMEGA']
    expect(hint.apply).toBeNull()
    expect(hint.text).toContain('o Portal tem 2 linhas deste item: ajuste à mão')
  })

  it('consolidado: a chave leva a PO e cada PO conta as suas linhas', () => {
    const recorte = shipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      orders: [
        { pedido: '9112', poRef: 'GAMA SEA 911-26', poBase: '', exporter: 'DELTA TRADING' },
        { pedido: '9113', poRef: 'GAMA SEA 912-26', poBase: '', exporter: 'ZETA TRADING' },
      ],
      items: [
        { commercialName: 'RESINA OMEGA', pedido: '9112', quantityKg: 1000 },
        { commercialName: 'RESINA OMEGA', pedido: '9113', quantityKg: 200 },
      ],
    })
    const draft = consolidated({
      purchaseOrders: [
        { po: '9112', reference: 'GAMA SEA 911-26', supplierName: 'DELTA TRADING' },
        { po: '9113', reference: 'GAMA SEA 912-26', supplierName: 'ZETA TRADING' },
      ],
      items: [
        { id: 'i-1', commercialName: 'RESINA OMEGA', poNumber: '9112', quantity: 100 },
        { id: 'i-2', commercialName: 'RESINA OMEGA', poNumber: '9113', quantity: 200 },
      ],
    })
    const hints = formHints(draft, recorte, { matchRule: 'consolidado:ref' })
    expect(Object.keys(hints.quantity)).toEqual(['9112|RESINA OMEGA'])
    const [operation] = hints.quantity['9112|RESINA OMEGA'].apply
    expect(operation.value.map((item) => item.quantity)).toEqual([1000, 200])
  })
})

describe('buildErpFormHints - sem referencia utilizavel e sem mutacao', () => {
  it('hint de outro snapshot, hint ausente ou reference nulo -> mapas vazios', () => {
    const recorte = shipment({ transport: { destination: 'ITAJAI' } })
    const process = portal({ destination: 'NAVEGANTES' })
    const empty = { fields: {}, po: {}, quantity: {} }
    expect(
      buildErpFormHints(process, { snapshot: SNAPSHOT, hint: { ...hintOf(recorte), snapshotId: 'BBBBBBBBBBBBBBBBBBBB' } })
    ).toEqual(empty)
    expect(buildErpFormHints(process, { snapshot: SNAPSHOT, hint: null })).toEqual(empty)
    expect(buildErpFormHints(process, null)).toEqual(empty)
    expect(buildErpFormHints(null, { snapshot: SNAPSHOT, hint: hintOf(recorte) })).toEqual(empty)
  })

  it('rascunho congelado em profundidade nao e mutado (campos, POs e itens)', () => {
    const recorte = shipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      transport: { eta: '2026-11-14' },
      orders: [
        { pedido: '9112', poRef: 'GAMA SEA 911-26', poBase: '', exporter: 'DELTA TRADING' },
        { pedido: '9113', poRef: 'GAMA SEA 912-26', poBase: '', exporter: 'ZETA TRADING' },
      ],
      items: [{ commercialName: 'RESINA OMEGA', pedido: '9112', quantityKg: 1000 }],
    })
    const draft = deepFreeze(
      consolidated({
        eta: '2026-10-20',
        purchaseOrders: [{ po: '9112', reference: '', supplierName: '' }],
        items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', poNumber: '9112', quantity: 1 }],
      })
    )
    const hints = formHints(draft, recorte, { matchRule: 'consolidado:ref' })
    expect(hints.fields.eta.apply).not.toBeNull()
    expect(hints.fields.poSet.apply).not.toBeNull()
    expect(hints.po['9112'].apply).not.toBeNull()
    expect(hints.quantity['9112|RESINA OMEGA'].apply).not.toBeNull()
    expect(draft.purchaseOrders).toEqual([{ po: '9112', reference: '', supplierName: '' }])
    expect(draft.items[0].quantity).toBe(1)
  })

  it('a allowlist de campos aplicaveis nunca inclui status, categoria, nº do processo, MAWB/HAWB nem financeiro', () => {
    for (const forbidden of ['processStatus', 'category', 'processNumber', 'name', 'masterBl', 'mawb', 'hawb']) {
      expect(ERP_FORM_APPLY_FIELDS).not.toContain(forbidden)
    }
    expect(ERP_FORM_APPLY_FIELDS).toEqual([
      'destination', 'etd', 'eta', 'vesselName', 'voyage', 'houseBl', 'duimpNumber',
      'duimpRegisteredAt', 'incoterm', 'supplierName', 'originLocation', 'purchaseOrders', 'items',
    ])
  })
})

describe('allowedErpApplyOperations', () => {
  it('todas validas -> devolve o PROPRIO array (mesma referencia)', () => {
    const apply = [
      { field: 'vesselName', value: 'NAVIO TESTE' },
      { field: 'voyage', value: '001E' },
    ]
    expect(allowedErpApplyOperations(apply)).toBe(apply)
  })

  it('mistura -> so as operacoes da allowlist', () => {
    const apply = [
      { field: 'processStatus', value: 'Entregue' },
      { field: 'category', value: 'FCL' },
      { field: 'processNumber', value: '9999' },
      { field: 'demurrageDailyRateUsd', value: 100 },
      { field: 'eta', value: '2026-10-20' },
    ]
    expect(allowedErpApplyOperations(apply)).toEqual([{ field: 'eta', value: '2026-10-20' }])
  })

  it('operacoes malformadas -> null', () => {
    for (const bad of [null, 'eta', { value: 'x' }, { field: 42, value: 'x' }, { field: 'eta' }, ['eta', 'x'], { field: '__proto__', value: {} }]) {
      expect(allowedErpApplyOperations([bad])).toBeNull()
    }
  })

  it('apply nao-array -> null', () => {
    for (const bad of [null, undefined, {}, { field: 'eta', value: 'x' }, 'eta']) {
      expect(allowedErpApplyOperations(bad)).toBeNull()
    }
  })

  it('lista so de proibidos -> null', () => {
    expect(
      allowedErpApplyOperations([
        { field: 'processStatus', value: 'Entregue' },
        { field: 'category', value: 'FCL' },
      ])
    ).toBeNull()
  })
})
