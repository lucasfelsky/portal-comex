// S9-C do Relatório de Carga: preenchimento automático (processo + FUP), marcas de origem, prévia do "Atualizar" e
// aviso de quantidade divergente. Módulo puro; fixtures sintéticas do mock (GOOYER SEA 001-26 / 4500871 e a
// consolidada CON DG 009-26 com 3 POs).
import { describe, expect, it } from 'vitest'
import { erpItemGroupKey, erpOrderKey } from '../../src/features/erp/reconcileErp'
import {
  CARGO_DIFF_KINDS,
  SOURCE_MARK_FIELDS,
  SOURCE_MARK_TITLES,
  applyCargoDiff,
  autofillForBlankRow,
  autofillForCopies,
  autofillForPurchaseOrder,
  buildAutofilledCargoReport,
  buildCargoRegistry,
  buildCargoSources,
  cellOrigin,
  describeCargoAutofillNote,
  diffCargoReportAgainstSources,
  fillCargoRowFromRegistry,
  matchCargoRowsForSupplier,
  quantityMismatchByRowId,
  refillCargoTares,
  resolveCargoProcessReference,
  resolveCargoSupplierName,
  restoreAutofillEntry,
  supplierNameForRow,
  takeAutofillEntry,
} from '../../src/features/processes/cargoReportAutofill'
import {
  CARGO_REPORT_MAX_ROWS,
  buildCargoReportPayload,
  cargoOrderKey,
  computeLotSq,
  createEmptyCargoReportRow,
  fromCargoReportDoc,
  readCargoAutofill,
} from '../../src/features/processes/cargoReportFormModel'
import { groupCargoRowsByPurchaseOrder } from '../../src/features/processes/cargoReportGroups'
import { splitCargoRow } from '../../src/features/processes/cargoReportRowOps'
import { normalizeSupplierKey } from '../../src/features/processes/cargoSupplierPackaging'

const FCL = {
  id: 'p-fcl',
  name: 'GOOYER SEA 001-26',
  processNumber: '4500871',
  category: 'FCL',
  supplierName: 'GOOYER CHEMICALS LTD',
  items: [
    { id: 'i1', commercialName: 'POLIOL PE-3000', quantity: 40000 },
    { id: 'i2', commercialName: 'CATALISADOR ZN-12', quantity: 4000 },
    { id: 'i3', commercialName: 'RESINA ACRÍLICA RA-55', quantity: 20000 },
  ],
}

const CONS = {
  id: 'p-cons',
  name: 'CON DG 009-26',
  processNumber: '',
  category: 'CONSOLIDADO',
  purchaseOrders: [
    { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
    { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
    { po: '4500903', reference: '', supplierName: 'ORION CHEM CO' },
  ],
  items: [
    { id: 'c1', commercialName: 'RESINA EPOXI ER-100', quantity: 18000, poNumber: '4500901' },
    { id: 'c2', commercialName: 'ENDURECEDOR EH-20', quantity: 6000, poNumber: '4500901' },
    { id: 'c3', commercialName: 'POLIOL PE-3000', quantity: 8000, poNumber: '4500903' },
  ],
}

const fupItem = (overrides = {}) => ({
  commercialName: 'POLIOL PE-3000',
  pedido: '4500871',
  quantityKg: 40000,
  sqCode: 'BA5012',
  supplierRef: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
  itemId: '1001',
  ...overrides,
})

const FCL_FUP = [
  fupItem(),
  fupItem({ commercialName: 'CATALISADOR ZN-12', quantityKg: 4000, sqCode: 'BA5033', supplierRef: 'ZINC CATALYST ZN-12 PAIL 25 KG', itemId: '1002' }),
  fupItem({ commercialName: 'RESINA ACRILICA RA-55', quantityKg: 20000, sqCode: 'BA5190', supplierRef: 'ACRYLIC RESIN RA-55 BULK DRUM', itemId: '1003' }),
]

function reference(items, { snapshotId = 'snap-1', stale = false, updatedAtMs = 1_764_000_000_000, exporters } = {}) {
  const orders = (exporters ?? ['GOOYER CHEMICALS LTD']).map((exporter) => ({ pedido: '4500871', poRef: '', poBase: '', exporter }))
  return {
    snapshot: { snapshotId, updatedAtMs },
    hint: stale ? null : { snapshotId, matchRule: 'name', shipment: { orders, items } },
    stale,
  }
}

function fill(process, ref) {
  const sources = buildCargoSources(process, ref)
  return { sources, ...buildAutofilledCargoReport(process, sources) }
}

describe('PO / PROCESSO = referência do processo', () => {
  it('FCL: PO = name em todas as linhas e o LOTE SQ usa as 3 letras da referência (L1GOO, não L1450)', () => {
    const { form } = fill(FCL, reference(FCL_FUP))
    expect(form.rows).toHaveLength(3)
    expect(form.rows.every((row) => row.po === 'GOOYER SEA 001-26')).toBe(true)
    expect(computeLotSq('L1', form.rows[0].po)).toBe('L1GOO')
    expect(computeLotSq('L1', '4500871')).toBe('L1450')
  })

  it('name vazio cai no número do processo', () => {
    expect(resolveCargoProcessReference({ name: '  ', processNumber: '4500871' })).toBe('4500871')
    const { form } = fill({ ...FCL, name: '' }, reference(FCL_FUP))
    expect(form.rows.every((row) => row.po === '4500871')).toBe(true)
  })

  it('CÓD. = sqCode, DESC. FORNECEDOR = supplierRef, DESC. SQ = item do processo, QTD = FUP', () => {
    const { form } = fill(FCL, reference(FCL_FUP))
    expect(form.rows[0]).toMatchObject({
      dbcorpCode: 'BA5012',
      supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
      sqDescription: 'POLIOL PE-3000',
      quantityKg: 40000,
    })
    // O nome do item é o do processo (com acento), não o do FUP.
    expect(form.rows[2].sqDescription).toBe('RESINA ACRÍLICA RA-55')
    expect(form.rows[2].dbcorpCode).toBe('BA5190')
  })

  it('a chave de ligação e a do pedido são as mesmas de erpItemGroupKey e erpOrderKey', () => {
    const sources = buildCargoSources(CONS, reference([fupItem({ pedido: '4500901', commercialName: 'RESINA EPOXI ER-100' })]))
    const candidate = sources.candidates.find((item) => item.origin === 'match')
    expect(candidate.groupKey).toBe(erpItemGroupKey({ commercialName: 'RESINA EPOXI ER-100', poNumber: '4500901' }, true))
    expect(cargoOrderKey('PO-09036')).toBe(erpOrderKey('PO-09036'))
    expect(cargoOrderKey('GOOYER SEA 001-26')).toBe(erpOrderKey('GOOYER SEA 001-26'))
  })

  it('o formulário nasce com autofill: marca de origem por célula e entrada por linha', () => {
    const { form } = fill(FCL, reference(FCL_FUP, { snapshotId: 'snap-9' }))
    expect(form.autofill.snapshotId).toBe('snap-9')
    const entry = form.autofill.rows[form.rows[0].id]
    expect(entry.key).toBe('fup:1001')
    expect(entry.base).toEqual({
      po: 'GOOYER SEA 001-26',
      dbcorpCode: 'BA5012',
      supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
      sqDescription: 'POLIOL PE-3000',
      quantityKg: 40000,
    })
  })
})

describe('itens só de um lado e embarques', () => {
  it('item do processo sem linha no FUP vira "só no processo" na pendência e fica fora das linhas', () => {
    const { form, pending } = fill(FCL, reference(FCL_FUP.slice(0, 2)))
    expect(form.rows).toHaveLength(2)
    expect(form.rows.map((row) => row.sqDescription)).toEqual(['POLIOL PE-3000', 'CATALISADOR ZN-12'])
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ kind: CARGO_DIFF_KINDS.onlyProcess, defaultOn: false, applicable: true })
    expect(pending[0].title).toContain('RESINA ACRÍLICA RA-55')
    expect(pending[0].detail).toContain('não existe no FUP')
  })

  it('item só no FUP vira "só no FUP" na pendência, desmarcado', () => {
    const extra = fupItem({ commercialName: 'SOLVENTE XIL-9', sqCode: 'BA5301', supplierRef: 'XYLENE BLEND XIL-9 DRUM 180 KG', quantityKg: 1800, itemId: '1004' })
    const { form, pending } = fill(FCL, reference([...FCL_FUP, extra]))
    expect(form.rows).toHaveLength(3)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ kind: CARGO_DIFF_KINDS.onlyFup, defaultOn: false })
    expect(pending[0].detail).toBe('BA5301 · XYLENE BLEND XIL-9 DRUM 180 KG · 1.800 kg · não existe no processo')
  })

  it('pedido em 2 embarques: só as linhas do embarque casado entram, sem somar entre embarques', () => {
    // O recorte gravado (erpProcessHints) já traz só o embarque casado: as linhas do outro embarque nunca chegam aqui.
    const sources = buildCargoSources(FCL, reference([fupItem({ quantityKg: 25000 })]))
    const { form, pending } = buildAutofilledCargoReport(FCL, sources)
    expect(form.rows).toHaveLength(1)
    expect(form.rows[0].quantityKg).toBe(25000)
    expect(pending.map((item) => item.kind)).toEqual([CARGO_DIFF_KINDS.onlyProcess, CARGO_DIFF_KINDS.onlyProcess])
  })

  it('o mesmo item em 2 linhas do FUP gera 2 linhas de relatório (uma por linha do FUP)', () => {
    const lines = [fupItem({ quantityKg: 15000, itemId: '1001' }), fupItem({ quantityKg: 25000, itemId: '1005' })]
    const { form } = fill(FCL, reference(lines))
    expect(form.rows.filter((row) => row.sqDescription === 'POLIOL PE-3000').map((row) => row.quantityKg)).toEqual([15000, 25000])
  })
})

describe('quantidade divergente', () => {
  it('FUP 4.500 x processo 4.000: a linha leva 4.500 e o aviso mostra 4.000', () => {
    const fup = [FCL_FUP[0], { ...FCL_FUP[1], quantityKg: 4500 }, FCL_FUP[2]]
    const { form } = fill(FCL, reference(fup))
    const row = form.rows.find((item) => item.sqDescription === 'CATALISADOR ZN-12')
    expect(row.quantityKg).toBe(4500)
    expect(quantityMismatchByRowId(form, FCL)).toEqual({ [row.id]: 4000 })
  })

  it('quantidades iguais: sem aviso', () => {
    const { form } = fill(FCL, reference(FCL_FUP))
    expect(quantityMismatchByRowId(form, FCL)).toEqual({})
  })

  it('lotes divididos somam o item: sem aviso quando a soma fecha, aviso em todas as linhas quando não fecha', () => {
    const { form } = fill(FCL, reference(FCL_FUP))
    const target = form.rows[1]
    const split = splitCargoRow(form.rows, target.id, [
      { supplierLot: 'A', quantityKg: 1500 },
      { supplierLot: 'B', quantityKg: 2500 },
    ])
    expect(quantityMismatchByRowId({ ...form, rows: split.rows }, FCL)).toEqual({})
    // Um lote editado depois da divisão: a soma (3.500) deixa de fechar com o item (4.000) e todas as linhas avisam.
    const edited = split.rows.map((row) => (row.id === split.insertedIds[1] ? { ...row, quantityKg: 2000 } : row))
    expect(quantityMismatchByRowId({ ...form, rows: edited }, FCL)).toEqual({
      [split.insertedIds[0]]: 4000,
      [split.insertedIds[1]]: 4000,
    })
  })

  it('grupo sem quantidade digitada não avisa', () => {
    const rows = [{ ...createEmptyCargoReportRow('r1'), po: 'GOOYER SEA 001-26', sqDescription: 'POLIOL PE-3000', quantityKg: null }]
    expect(quantityMismatchByRowId({ rows }, FCL)).toEqual({})
  })
})

describe('consolidado', () => {
  const consFup = [
    fupItem({ commercialName: 'RESINA EPOXI ER-100', pedido: '4500901', quantityKg: 18000, sqCode: 'BA5101', supplierRef: 'EPOXY ER-100', itemId: '2001' }),
    fupItem({ commercialName: 'ENDURECEDOR EH-20', pedido: '4500901', quantityKg: 6000, sqCode: 'BA5102', supplierRef: 'HARDENER EH-20', itemId: '2002' }),
    fupItem({ commercialName: 'POLIOL PE-3000', pedido: '4500903', quantityKg: 8000, sqCode: 'BA5012', supplierRef: 'POLYOL PE-3000', itemId: '2003' }),
  ]

  it('cada linha leva a referência da PO do item; PO sem referência usa o número; PO sem item aparece vazia', () => {
    const { form } = fill(CONS, reference(consFup))
    expect(form.rows.map((row) => row.po)).toEqual(['ACME SEA 011-26', 'ACME SEA 011-26', '4500903'])
    const groups = groupCargoRowsByPurchaseOrder(form.rows, CONS.purchaseOrders)
    expect(groups.map((group) => group.rows.length)).toEqual([2, 0, 1])
  })

  it('casa o pedido do FUP com a PO pelos dígitos (erpOrderKey), mesmo com formatação diferente', () => {
    const fup = [fupItem({ ...consFup[0], pedido: 'PO-4500901' })]
    const { form } = fill(CONS, reference(fup))
    expect(form.rows[0].po).toBe('ACME SEA 011-26')
  })

  it('a ordem do array é a da tela (por PO)', () => {
    const { form } = fill(CONS, reference([consFup[2], consFup[0], consFup[1]]))
    expect(form.rows.map((row) => row.dbcorpCode)).toEqual(['BA5101', 'BA5102', 'BA5012'])
  })
})

describe('sem FUP utilizável', () => {
  it('hint ausente: preenche só do processo (marca P) e não gera pendência', () => {
    const { form, pending, sources } = fill(FCL, null)
    expect(sources.fupInfo.hasFup).toBe(false)
    expect(form.rows).toHaveLength(3)
    expect(form.rows[0]).toMatchObject({ po: 'GOOYER SEA 001-26', sqDescription: 'POLIOL PE-3000', quantityKg: 40000, dbcorpCode: '' })
    expect(pending).toEqual([])
    const entry = form.autofill.rows[form.rows[0].id]
    expect(entry.key).toBe('proc:i1')
    expect(cellOrigin(form.rows[0], entry, 'quantityKg')).toBe('P')
    expect(cellOrigin(form.rows[0], entry, 'dbcorpCode')).toBe('')
  })

  it('hint de outro snapshot (stale): só processo, sem pendências, e a nota explica', () => {
    const { pending, sources } = fill(FCL, reference([], { stale: true }))
    expect(sources.fupInfo).toMatchObject({ hasFup: false, stale: true })
    expect(pending).toEqual([])
    expect(describeCargoAutofillNote(sources)).toContain('desatualizado')
  })

  it('hint antigo (sem sqCode, supplierRef e itemId): missingFields e nota pedindo nova importação', () => {
    const old = FCL_FUP.map((item) => ({ ...item, sqCode: '', supplierRef: '', itemId: '' }))
    const { form, sources } = fill(FCL, reference(old))
    expect(sources.fupInfo.missingFields).toBe(true)
    expect(form.rows).toHaveLength(3)
    expect(form.rows[0].dbcorpCode).toBe('')
    expect(describeCargoAutofillNote(sources)).toContain('importe o FUP de novo')
    expect(form.autofill.rows[form.rows[0].id].key).toMatch(/^fup:/)
  })

  it('notas: com FUP, sem FUP e erro de leitura', () => {
    expect(describeCargoAutofillNote({ fupInfo: { hasFup: true, missingFields: false } })).toContain('vêm do FUP importado')
    expect(describeCargoAutofillNote({ fupInfo: { hasFup: false } })).toContain('Sem FUP para este processo')
    expect(describeCargoAutofillNote({ fupInfo: { hasFup: false }, readError: true })).toContain('Não foi possível ler o FUP')
  })

  it('fornecedor: do processo; sem ele, o exportador do FUP (vários: o 1º em ordem alfabética)', () => {
    expect(resolveCargoSupplierName(FCL, null)).toEqual({ name: 'GOOYER CHEMICALS LTD', via: 'process', multiple: false })
    const semFornecedor = { ...FCL, supplierName: '' }
    expect(resolveCargoSupplierName(semFornecedor, reference([], { exporters: ['ORION CHEM CO', 'GOOYER CHEMICALS LTD'] }))).toEqual({
      name: 'GOOYER CHEMICALS LTD',
      via: 'fup',
      multiple: true,
    })
    expect(resolveCargoSupplierName(semFornecedor, null)).toEqual({ name: '', via: '', multiple: false })
  })
})

describe('marcas de origem', () => {
  const base = { po: 'GOOYER SEA 001-26', dbcorpCode: 'BA5012', supplierDescription: 'X', sqDescription: 'POLIOL', quantityKg: 40000 }
  const row = { ...createEmptyCargoReportRow('r1'), po: 'GOOYER SEA 001-26', dbcorpCode: 'BA5012', supplierDescription: 'X', sqDescription: 'POLIOL', quantityKg: 40000 }

  it('P (processo), F (FUP), ✎ quando diferente e vazio quando a base não tem o campo', () => {
    const entry = { key: 'fup:1', base }
    expect(cellOrigin(row, entry, 'po')).toBe('P')
    expect(cellOrigin(row, entry, 'sqDescription')).toBe('P')
    expect(cellOrigin(row, entry, 'dbcorpCode')).toBe('F')
    expect(cellOrigin(row, entry, 'supplierDescription')).toBe('F')
    expect(cellOrigin(row, entry, 'quantityKg')).toBe('F')
    expect(cellOrigin({ ...row, dbcorpCode: 'BA9999' }, entry, 'dbcorpCode')).toBe('E')
    expect(cellOrigin({ ...row, quantityKg: '40.000' }, entry, 'quantityKg')).toBe('F')
    expect(cellOrigin({ ...row, quantityKg: '41.000' }, entry, 'quantityKg')).toBe('E')
    expect(cellOrigin(row, { key: 'fup:1', base: { po: base.po } }, 'dbcorpCode')).toBe('')
    expect(cellOrigin(row, undefined, 'po')).toBe('')
  })

  it('tara do cadastro é C e quantidade de item só do processo é P', () => {
    expect(cellOrigin({ ...row, packageWeightKg: 9.2 }, { key: 'fup:1', base: { packageWeightKg: 9.2 } }, 'packageWeightKg')).toBe('C')
    expect(cellOrigin(row, { key: 'proc:i1', base }, 'quantityKg')).toBe('P')
  })

  it('linha só no FUP: a Descrição SQ também é do FUP', () => {
    expect(cellOrigin(row, { key: 'fup:1', base, fupOnly: true }, 'sqDescription')).toBe('F')
  })
})

describe('autofill gravado e lido', () => {
  it('readCargoAutofill: só linhas existentes, só os 6 campos com tipo certo, snapshotId até 40', () => {
    const rows = [{ id: 'r1' }, { id: 'r2' }]
    const result = readCargoAutofill(
      {
        schemaVersion: 7,
        snapshotId: 'x'.repeat(60),
        rows: {
          r1: { key: 'fup:1', base: { po: 'A', quantityKg: 5, extra: 'x', dbcorpCode: 7, supplierDescription: null } },
          fantasma: { key: 'fup:2', base: { po: 'B' } },
          r2: 'texto',
        },
      },
      rows
    )
    expect(result.schemaVersion).toBe(1)
    expect(result.snapshotId).toHaveLength(40)
    expect(Object.keys(result.rows)).toEqual(['r1'])
    expect(result.rows.r1).toEqual({ key: 'fup:1', base: { po: 'A', quantityKg: 5 } })
  })

  it('ausente ou de tipo errado vira o mapa vazio', () => {
    for (const value of [undefined, null, 'x', [], { rows: [] }]) {
      expect(readCargoAutofill(value, [{ id: 'r1' }])).toEqual({ schemaVersion: 1, snapshotId: '', rows: {} })
    }
  })

  it('o payload poda o mapa às linhas gravadas e omite a chave quando não sobra entrada', () => {
    const { form } = fill(FCL, reference(FCL_FUP))
    const kept = form.rows[0]
    const withEmpty = { ...form, rows: [kept, createEmptyCargoReportRow('vazia')] }
    withEmpty.autofill = { ...form.autofill, rows: { ...form.autofill.rows, vazia: { key: '', base: { po: 'X' } } } }
    const { payload } = buildCargoReportPayload(withEmpty)
    expect(Object.keys(payload.autofill.rows)).toEqual([kept.id])
    // S10-I: + `expectedPallets` (sempre gravado).
    expect(Object.keys(payload)).toHaveLength(17)

    const semEntradas = buildCargoReportPayload({ ...form, rows: [kept], autofill: { ...form.autofill, rows: {} } }).payload
    expect(semEntradas).not.toHaveProperty('autofill')
    expect(Object.keys(semEntradas)).toHaveLength(16)
  })

  it('o que foi gravado volta igual ao ler o doc', () => {
    const { form } = fill(FCL, reference(FCL_FUP))
    const { payload } = buildCargoReportPayload(form)
    const back = fromCargoReportDoc(payload)
    expect(back.autofill).toEqual(payload.autofill)
    expect(back.rows[0].po).toBe('GOOYER SEA 001-26')
  })

  it('doc sem autofill (relatório antigo) lê com o mapa vazio', () => {
    expect(fromCargoReportDoc({ rows: [{ id: 'r1' }] }).autofill).toEqual({ schemaVersion: 1, snapshotId: '', rows: {} })
  })
})

describe('prévia do Atualizar', () => {
  function filled() {
    const { form } = fill(FCL, reference(FCL_FUP))
    return form
  }

  it('reimportação do FUP com os mesmos valores (outro snapshotId): tudo em dia', () => {
    const form = filled()
    const sources = buildCargoSources(FCL, reference(FCL_FUP, { snapshotId: 'snap-2' }))
    expect(diffCargoReportAgainstSources(form, form.autofill, sources)).toEqual([])
  })

  it('Qtd nova no FUP: 1 item de quantidade, marcado, com a linha e os dois valores', () => {
    const form = filled()
    const fup = [FCL_FUP[0], { ...FCL_FUP[1], quantityKg: 4500 }, FCL_FUP[2]]
    const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(FCL, reference(fup, { snapshotId: 'snap-2' })))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: CARGO_DIFF_KINDS.quantity, defaultOn: true, edited: false, applicable: true, source: 'F' })
    expect(items[0].title).toBe('CATALISADOR ZN-12: quantidade')
    expect(items[0].detail).toBe('Linha 2: 4.000 kg → 4.500 kg (FUP)')
  })

  it('célula editada: o item vem desmarcado e avisa; a não editada vem marcada; aplicar só os marcados', () => {
    const form = filled()
    const edited = { ...form, rows: form.rows.map((row, index) => (index === 0 ? { ...row, supplierDescription: 'MINHA DESCRIÇÃO' } : row)) }
    const fup = [
      { ...FCL_FUP[0], supplierRef: 'POLYETHER POLYOL PE-3000 STEEL DRUM 200 KG' },
      { ...FCL_FUP[1], quantityKg: 4500 },
      FCL_FUP[2],
    ]
    const items = diffCargoReportAgainstSources(edited, edited.autofill, buildCargoSources(FCL, reference(fup, { snapshotId: 'snap-2' })))
    const text = items.find((item) => item.kind === CARGO_DIFF_KINDS.text)
    const quantity = items.find((item) => item.kind === CARGO_DIFF_KINDS.quantity)
    expect(text.edited).toBe(true)
    expect(text.defaultOn).toBe(false)
    expect(text.detail.endsWith(' (você editou esta célula)')).toBe(true)
    expect(quantity.defaultOn).toBe(true)

    const applied = applyCargoDiff(edited, edited.autofill, items, items.filter((item) => item.defaultOn).map((item) => item.id), { snapshotId: 'snap-2' })
    expect(applied.error).toBeUndefined()
    expect(applied.form.rows[0].supplierDescription).toBe('MINHA DESCRIÇÃO')
    expect(applied.form.rows[1].quantityKg).toBe(4500)
    expect(applied.form.autofill.snapshotId).toBe('snap-2')
    // A base do campo aplicado é atualizada: a célula volta a ter a marca F.
    expect(cellOrigin(applied.form.rows[1], applied.form.autofill.rows[applied.form.rows[1].id], 'quantityKg')).toBe('F')
    // A célula editada continua ✎.
    expect(cellOrigin(applied.form.rows[0], applied.form.autofill.rows[applied.form.rows[0].id], 'supplierDescription')).toBe('E')
  })

  it('aplicar uma célula editada (marcada à mão) troca o valor e devolve a marca F', () => {
    const form = filled()
    const edited = { ...form, rows: form.rows.map((row, index) => (index === 0 ? { ...row, supplierDescription: 'MINHA' } : row)) }
    const fup = [{ ...FCL_FUP[0], supplierRef: 'NOVA REF' }, FCL_FUP[1], FCL_FUP[2]]
    const items = diffCargoReportAgainstSources(edited, edited.autofill, buildCargoSources(FCL, reference(fup)))
    const result = applyCargoDiff(edited, edited.autofill, items, [items[0].id])
    expect(result.form.rows[0].supplierDescription).toBe('NOVA REF')
    expect(cellOrigin(result.form.rows[0], result.form.autofill.rows[result.form.rows[0].id], 'supplierDescription')).toBe('F')
  })

  it('PO do processo mudou: item de PO com origem P', () => {
    const form = filled()
    const renamed = { ...FCL, name: 'GOOYER SEA 002-26' }
    const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(renamed, reference(FCL_FUP)))
    expect(items).toHaveLength(3)
    expect(items.every((item) => item.kind === CARGO_DIFF_KINDS.po && item.source === 'P' && item.defaultOn)).toBe(true)
  })

  it('linha dividida em lotes com Qtd nova: item não aplicável explicando a divisão', () => {
    const form = filled()
    const target = form.rows[1]
    const split = splitCargoRow(form.rows, target.id, [
      { supplierLot: 'A', quantityKg: 1500 },
      { supplierLot: 'B', quantityKg: 2500 },
    ])
    const autofill = { ...form.autofill, rows: autofillForCopies(form.autofill.rows, target.id, split.insertedIds, { dropSource: true }) }
    const splitForm = { ...form, rows: split.rows, autofill }
    const fup = [FCL_FUP[0], { ...FCL_FUP[1], quantityKg: 5000 }, FCL_FUP[2]]
    const items = diffCargoReportAgainstSources(splitForm, autofill, buildCargoSources(FCL, reference(fup, { snapshotId: 'snap-2' })))
    expect(items).toHaveLength(1)
    expect(items[0].applicable).toBe(false)
    expect(items[0].detail).toBe('A linha foi dividida em 2 lotes: ajuste à mão (soma 4.000 kg → 5.000 kg do FUP)')
    const applied = applyCargoDiff(splitForm, autofill, items, [items[0].id])
    expect(applied.form).toBe(splitForm)
  })

  it('lotes divididos que somam o FUP não geram diferença', () => {
    const form = filled()
    const target = form.rows[1]
    const split = splitCargoRow(form.rows, target.id, [
      { supplierLot: 'A', quantityKg: 1500 },
      { supplierLot: 'B', quantityKg: 2500 },
    ])
    const autofill = { ...form.autofill, rows: autofillForCopies(form.autofill.rows, target.id, split.insertedIds, { dropSource: true }) }
    const items = diffCargoReportAgainstSources({ ...form, rows: split.rows, autofill }, autofill, buildCargoSources(FCL, reference(FCL_FUP, { snapshotId: 'snap-2' })))
    expect(items).toEqual([])
  })

  it('linha só no FUP (nova no FUP) e linha removida do relatório voltam como itens desmarcados', () => {
    const form = filled()
    const extra = fupItem({ commercialName: 'SOLVENTE XIL-9', sqCode: 'BA5301', quantityKg: 1800, itemId: '1004', supplierRef: 'XYLENE' })
    const withoutSecond = { ...form, rows: form.rows.filter((_, index) => index !== 1) }
    const items = diffCargoReportAgainstSources(withoutSecond, withoutSecond.autofill, buildCargoSources(FCL, reference([...FCL_FUP, extra], { snapshotId: 'snap-2' })))
    expect(items.map((item) => item.kind)).toEqual([CARGO_DIFF_KINDS.onlyFup, CARGO_DIFF_KINDS.onlyFup])
    expect(items.every((item) => item.defaultOn === false)).toBe(true)
    const applied = applyCargoDiff(withoutSecond, withoutSecond.autofill, items, [items[0].id, items[1].id])
    expect(applied.form.rows).toHaveLength(4)
    const added = applied.form.rows.at(-1)
    expect(applied.form.autofill.rows[added.id].fupOnly).toBe(true)
    expect(cellOrigin(added, applied.form.autofill.rows[added.id], 'sqDescription')).toBe('F')
  })

  it('linha cujo item sumiu do FUP e do processo: informativa, sem checkbox', () => {
    const form = filled()
    const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources({ ...FCL, items: FCL.items.slice(0, 2) }, reference(FCL_FUP.slice(0, 2))))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: CARGO_DIFF_KINDS.gone, applicable: false, defaultOn: false, apply: null })
    expect(items[0].detail).toContain('Remova pelo ⋯')
  })

  it('sem FUP agora (stale), as linhas do FUP não viram "fora do FUP"', () => {
    const form = filled()
    const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(FCL, reference([], { stale: true })))
    expect(items.some((item) => item.kind === CARGO_DIFF_KINDS.gone)).toBe(false)
    // As linhas já existem: nada de "só no processo" (aplicar duplicaria as linhas).
    expect(items).toEqual([])
  })

  it('relatório salvo com FUP e reaberto com hint stale ou ausente: prévia sem adições nem diferenças', () => {
    const form = filled()
    const reopened = { ...form, rows: form.rows.map((row) => ({ ...row })) }
    for (const ref of [reference([], { stale: true }), null]) {
      const items = diffCargoReportAgainstSources(reopened, reopened.autofill, buildCargoSources(FCL, ref))
      expect(items.filter((item) => item.kind === CARGO_DIFF_KINDS.onlyProcess)).toEqual([])
      expect(items).toEqual([])
    }
  })

  it('sem FUP agora, item do processo sem linha (removida) continua proposto; as demais linhas do FUP não duplicam', () => {
    const form = filled()
    const trimmed = { ...form, rows: form.rows.filter((_, index) => index !== 1) }
    const items = diffCargoReportAgainstSources(trimmed, trimmed.autofill, buildCargoSources(FCL, null))
    expect(items.map((item) => item.kind)).toEqual([CARGO_DIFF_KINDS.onlyProcess])
    expect(items[0].title).toContain('CATALISADOR ZN-12')
  })

  it('a chave proc: é cortada em 140 caracteres (igual na gravação e na leitura)', () => {
    const longId = 'x'.repeat(200)
    const process = { ...FCL, items: [{ id: longId, commercialName: 'POLIOL PE-3000', quantity: 1 }] }
    const { form } = fill(process, null)
    const key = form.autofill.rows[form.rows[0].id].key
    expect(key).toHaveLength(140)
    const { payload } = buildCargoReportPayload(form)
    expect(fromCargoReportDoc(payload).autofill.rows[form.rows[0].id].key).toBe(key)
  })

  it('item do processo antes sem FUP: a linha só do processo ganha Cód. e Descrição Fornecedor quando o FUP chega', () => {
    const { form } = fill(FCL, null)
    const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(FCL, reference(FCL_FUP)))
    expect(items.map((item) => item.kind).sort()).toEqual([CARGO_DIFF_KINDS.code, CARGO_DIFF_KINDS.code, CARGO_DIFF_KINDS.code, CARGO_DIFF_KINDS.text, CARGO_DIFF_KINDS.text, CARGO_DIFF_KINDS.text].sort())
    expect(items.every((item) => item.defaultOn)).toBe(true) // células vazias: nada é sobrescrito
    const applied = applyCargoDiff(form, form.autofill, items, items.map((item) => item.id))
    expect(applied.form.rows[0]).toMatchObject({ dbcorpCode: 'BA5012', supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG' })
    expect(applied.form.autofill.rows[applied.form.rows[0].id].key).toBe('fup:1001')
  })

  describe('relatório antigo (sem autofill)', () => {
    const legacyForm = () => ({
      revision: 4,
      rows: [
        { ...createEmptyCargoReportRow('old-1'), po: '4500871', dbcorpCode: 'BA5012', sqDescription: 'POLIOL PE-3000', quantityKg: 40000 },
        { ...createEmptyCargoReportRow('old-2'), po: '4500871', dbcorpCode: 'BA5033', sqDescription: 'CATALISADOR ZN-12', quantityKg: 4000 },
      ],
      autofill: { schemaVersion: 1, snapshotId: '', rows: {} },
    })

    it('toda diferença vem desmarcada com "origem não registrada"; PO 4500871 -> referência', () => {
      const form = legacyForm()
      const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(FCL, reference(FCL_FUP)))
      const po = items.find((item) => item.kind === CARGO_DIFF_KINDS.po)
      expect(po.title).toBe('POLIOL PE-3000: PO / PROCESSO')
      expect(po.detail).toBe('Linha 1: “4500871” → “GOOYER SEA 001-26” (origem não registrada)')
      const fieldItems = items.filter((item) => item.apply?.type === 'field')
      expect(fieldItems.length).toBeGreaterThan(0)
      expect(fieldItems.every((item) => item.edited && item.defaultOn === false)).toBe(true)
      expect(fieldItems.every((item) => item.detail.endsWith('(origem não registrada)'))).toBe(true)
      // O item do FUP sem linha no relatório vem à parte, também desmarcado.
      expect(items.filter((item) => item.kind === CARGO_DIFF_KINDS.onlyFup)).toHaveLength(1)
    })

    it('aplicar troca o PO e cria a base (a célula passa a ter a marca P)', () => {
      const form = legacyForm()
      const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(FCL, reference(FCL_FUP)))
      const poItems = items.filter((item) => item.kind === CARGO_DIFF_KINDS.po)
      const applied = applyCargoDiff(form, form.autofill, items, poItems.map((item) => item.id))
      expect(applied.form.rows.map((row) => row.po)).toEqual(['GOOYER SEA 001-26', 'GOOYER SEA 001-26'])
      expect(cellOrigin(applied.form.rows[0], applied.form.autofill.rows['old-1'], 'po')).toBe('P')
      expect(applied.form.autofill.rows['old-1'].key).toBe('fup:1001')
    })

    it('o relatório antigo nunca é refeito sozinho: sem diferenças, nada muda', () => {
      const form = legacyForm()
      const same = { ...form, rows: form.rows.map((row) => ({ ...row, po: 'GOOYER SEA 001-26' })) }
      const items = diffCargoReportAgainstSources(same, same.autofill, buildCargoSources({ ...FCL, items: FCL.items.slice(0, 2) }, reference(FCL_FUP.slice(0, 2))))
      expect(items.every((item) => item.kind !== CARGO_DIFF_KINDS.po)).toBe(true)
    })
  })

  it('200 linhas: aplicar "só no FUP" devolve error limit e o formulário intacto', () => {
    const rows = Array.from({ length: CARGO_REPORT_MAX_ROWS }, (_, index) => createEmptyCargoReportRow(`r${index}`))
    const form = { rows, autofill: { schemaVersion: 1, snapshotId: '', rows: {} } }
    const extra = fupItem({ commercialName: 'SOLVENTE XIL-9', itemId: '1004' })
    const sources = buildCargoSources({ ...FCL, items: [] }, reference([extra]))
    const items = diffCargoReportAgainstSources(form, form.autofill, sources)
    const add = items.find((item) => item.kind === CARGO_DIFF_KINDS.onlyFup)
    const result = applyCargoDiff(form, form.autofill, items, [add.id])
    expect(result.error).toBe('limit')
    expect(result.form).toBe(form)
    expect(result.form.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
  })

  it('consolidado: aplicar "só no FUP" põe a linha no fim do grupo da PO', () => {
    const consFup = [
      fupItem({ commercialName: 'RESINA EPOXI ER-100', pedido: '4500901', quantityKg: 18000, sqCode: 'BA5101', supplierRef: 'EPOXY', itemId: '2001' }),
      fupItem({ commercialName: 'POLIOL PE-3000', pedido: '4500903', quantityKg: 8000, sqCode: 'BA5012', supplierRef: 'POLYOL', itemId: '2003' }),
    ]
    const processWithTwo = { ...CONS, items: [CONS.items[0], CONS.items[2]] }
    const { form } = fill(processWithTwo, reference(consFup))
    const extra = fupItem({ commercialName: 'PLASTIFICANTE DOP', pedido: '4500902', quantityKg: 22000, sqCode: 'BA5201', supplierRef: 'DOP', itemId: '2004' })
    const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(processWithTwo, reference([...consFup, extra], { snapshotId: 'snap-2' })))
    const add = items.find((item) => item.kind === CARGO_DIFF_KINDS.onlyFup)
    const applied = applyCargoDiff(form, form.autofill, items, [add.id], { purchaseOrders: CONS.purchaseOrders })
    expect(applied.form.rows.map((row) => row.po)).toEqual(['ACME SEA 011-26', 'NOVA SEA 034-26', '4500903'])
  })
})

describe('autofill acompanha as operações por linha', () => {
  const entries = {
    a: { key: 'fup:1', base: { po: 'P1', quantityKg: 5 } },
    b: { key: 'fup:2', base: { dbcorpCode: 'X' }, fupOnly: true },
  }

  it('inserir herda só a base do PO', () => {
    expect(autofillForBlankRow(entries, 'a', 'n')).toEqual({ ...entries, n: { key: '', base: { po: 'P1' } } })
    expect(autofillForBlankRow(entries, 'b', 'n')).toEqual(entries)
  })

  it('duplicar copia a entrada inteira; dividir também e tira a original', () => {
    const copy = autofillForCopies(entries, 'a', ['n1'])
    expect(copy.n1).toEqual(entries.a)
    expect(copy.n1).not.toBe(entries.a)
    expect(copy.n1.base).not.toBe(entries.a.base)
    const split = autofillForCopies(entries, 'b', ['n1', 'n2'], { dropSource: true })
    expect(Object.keys(split).sort()).toEqual(['a', 'n1', 'n2'])
    expect(split.n2.fupOnly).toBe(true)
  })

  it('mover para outra PO regrava a base do PO (marca P), com ou sem entrada anterior', () => {
    expect(autofillForPurchaseOrder(entries, 'a', 'P2').a.base).toEqual({ po: 'P2', quantityKg: 5 })
    expect(autofillForPurchaseOrder(entries, 'novo', 'P2').novo).toEqual({ key: '', base: { po: 'P2' } })
  })

  it('remover leva a entrada e desfazer devolve', () => {
    const taken = takeAutofillEntry(entries, 'a')
    expect(taken.entry).toEqual(entries.a)
    expect(taken.entries).not.toHaveProperty('a')
    expect(restoreAutofillEntry(taken.entries, 'a', taken.entry)).toEqual(entries)
    expect(restoreAutofillEntry(taken.entries, 'a', null)).toEqual(taken.entries)
  })
})

// ---------- S9-D: peso da embalagem do cadastro (marca C) ----------

describe('S9-D: tara do cadastro de embalagens (marca C)', () => {
  const ITEMS = {
    items: [
      { code: 'BA5012', description: 'POLIOL PE-3000', packagingType: 'TAMBOR', netWeightKg: 200 },
      { code: 'BA5033', description: 'CATALISADOR ZN-12', packagingType: 'BOMBONA', netWeightKg: 25 },
    ],
  }
  const entryOf = (code, supplierName, tare) => ({
    code,
    supplierKey: normalizeSupplierKey(supplierName),
    supplierName,
    packagingType: supplierName ? 'TAMBOR' : '',
    netWeightKg: supplierName ? 200 : null,
    packageWeightKg: tare,
  })
  const suppliers = (entries, aliases = []) => ({ exists: true, version: 1, entries, entryCount: entries.length, aliases })
  // FUP do consolidado: o mesmo polial em duas POs (cada uma com o seu fornecedor).
  const CONS_FUP = [
    fupItem({ pedido: '4500903', quantityKg: 8000, itemId: '2001' }),
    fupItem({ pedido: '4500901', quantityKg: 5000, itemId: '2002' }),
  ]
  const REGISTRY = suppliers([
    entryOf('BA5012', 'GOOYER CHEMICALS LTD', 9.2),
    entryOf('BA5012', 'ORION CHEM CO', 11.5),
    entryOf('BA5033', '', 1.1),
  ])
  const packagingFor = (process, supplierCatalog = REGISTRY, reference) =>
    buildCargoRegistry({ itemCatalog: ITEMS, supplierCatalog, process, reference })
  const fillWithRegistry = (process, ref, supplierCatalog = REGISTRY) => {
    const sources = buildCargoSources(process, ref)
    return { sources, ...buildAutofilledCargoReport(process, sources, packagingFor(process, supplierCatalog, ref)) }
  }

  it('FCL: a tara entra gravada na linha, com a base C, pelo fornecedor do processo; sem cadastro a tara fica vazia', () => {
    const { form } = fillWithRegistry(FCL, reference(FCL_FUP))
    expect(form.rows[0]).toMatchObject({ dbcorpCode: 'BA5012', packageWeightKg: 9.2 }) // item + fornecedor
    expect(form.rows[1]).toMatchObject({ dbcorpCode: 'BA5033', packageWeightKg: 1.1 }) // padrão do item
    expect(form.rows[2]).toMatchObject({ dbcorpCode: 'BA5190', packageWeightKg: null }) // sem cadastro
    expect(form.autofill.rows[form.rows[0].id].base.packageWeightKg).toBe(9.2)
    expect(form.autofill.rows[form.rows[2].id].base).not.toHaveProperty('packageWeightKg')
    expect(cellOrigin(form.rows[0], form.autofill.rows[form.rows[0].id], 'packageWeightKg')).toBe('C')
    expect(cellOrigin(form.rows[2], form.autofill.rows[form.rows[2].id], 'packageWeightKg')).toBe('')
  })

  it('FCL sem fornecedor no processo usa o EXPORTADOR do FUP', () => {
    const process = { ...FCL, supplierName: '' }
    const ref = reference(FCL_FUP, { exporters: ['Orion Chem, Co.'] })
    const { form } = fillWithRegistry(process, ref)
    expect(form.rows[0].packageWeightKg).toBe(11.5)
  })

  it('consolidado: cada linha usa o fornecedor da PO dela (PO sem fornecedor cai no padrão)', () => {
    const process = {
      ...CONS,
      purchaseOrders: [
        { po: '4500901', reference: 'GOO SEA 001-26', supplierName: 'GOOYER CHEMICALS LTD' },
        { po: '4500903', reference: 'ORION SEA 007-26', supplierName: 'ORION CHEM CO' },
      ],
      items: [
        { id: 'c1', commercialName: 'POLIOL PE-3000', quantity: 8000, poNumber: '4500903' },
        { id: 'c2', commercialName: 'POLIOL PE-3000', quantity: 5000, poNumber: '4500901' },
      ],
    }
    const { form } = fillWithRegistry(process, reference(CONS_FUP))
    const byPo = Object.fromEntries(form.rows.map((row) => [row.po, row.packageWeightKg]))
    expect(byPo).toEqual({ 'GOO SEA 001-26': 9.2, 'ORION SEA 007-26': 11.5 })
  })

  it('supplierNameForRow: processo, EXPORTADOR do FUP e PO do consolidado (não é gravado na linha)', () => {
    expect(supplierNameForRow({ po: 'qualquer' }, FCL, null)).toBe('GOOYER CHEMICALS LTD')
    const exporters = reference(FCL_FUP, { exporters: ['ZETA CO', 'ALFA CO'] })
    expect(supplierNameForRow({}, { ...FCL, supplierName: '' }, exporters)).toBe('ALFA CO')
    expect(supplierNameForRow({ po: 'ACME SEA 011-26' }, CONS, null)).toBe('ACME RESINS CO')
    expect(supplierNameForRow({ po: '4500902' }, CONS, null)).toBe('NOVA POLYMERS') // legado: número da PO
    expect(supplierNameForRow({ po: 'sem casamento' }, CONS, null)).toBe('')
    const { form } = fillWithRegistry(FCL, reference(FCL_FUP))
    expect(Object.keys(form.rows[0])).toHaveLength(13)
  })

  it('sem cadastro por fornecedor (null): tara vazia, nada quebra', () => {
    const { form } = fillWithRegistry(FCL, reference(FCL_FUP), null)
    expect(form.rows.map((row) => row.packageWeightKg)).toEqual([null, null, null])
  })

  it('digitar o código (ao sair do campo): tara vazia e Descrição SQ vazia vêm do cadastro', () => {
    const registry = packagingFor(FCL)
    const row = { ...createEmptyCargoReportRow('r1'), dbcorpCode: 'ba5012' }
    const form = { rows: [row], autofill: { schemaVersion: 1, snapshotId: '', rows: {} } }
    const next = fillCargoRowFromRegistry(form, 'r1', registry)
    expect(next.rows[0]).toMatchObject({ packageWeightKg: 9.2, sqDescription: 'POLIOL PE-3000' })
    expect(next.autofill.rows.r1.base.packageWeightKg).toBe(9.2)
    expect(cellOrigin(next.rows[0], next.autofill.rows.r1, 'packageWeightKg')).toBe('C')
    // Descrição SQ preenchida do catálogo não ganha marca (só a tara é do cadastro, com base C)
    expect(next.autofill.rows.r1.base).not.toHaveProperty('sqDescription')
  })

  it('digitar o código não sobrescreve tara nem descrição já preenchidas e não suja o form à toa', () => {
    const registry = packagingFor(FCL)
    const filled = { ...createEmptyCargoReportRow('r1'), dbcorpCode: 'BA5012', packageWeightKg: '8', sqDescription: 'MINHA DESCRIÇÃO' }
    const form = { rows: [filled], autofill: { schemaVersion: 1, snapshotId: '', rows: {} } }
    expect(fillCargoRowFromRegistry(form, 'r1', registry)).toBe(form)
    const unknown = { rows: [{ ...createEmptyCargoReportRow('r2'), dbcorpCode: 'ZZ9999' }], autofill: form.autofill }
    expect(fillCargoRowFromRegistry(unknown, 'r2', registry)).toBe(unknown)
    const noCode = { rows: [createEmptyCargoReportRow('r3')], autofill: form.autofill }
    expect(fillCargoRowFromRegistry(noCode, 'r3', registry)).toBe(noCode)
  })

  describe('refillCargoTares ("Cadastrar para" e troca de fornecedor)', () => {
    const base = (id, overrides) => ({ ...createEmptyCargoReportRow(id), dbcorpCode: 'BA5190', ...overrides })
    const NEW_REGISTRY = suppliers([entryOf('BA5190', 'GOOYER CHEMICALS LTD', 9.5)])
    const formOf = (rows, entries = {}) => ({ rows, autofill: { schemaVersion: 1, snapshotId: '', rows: entries } })

    it('preenche as linhas do mesmo código + fornecedor com tara vazia ou ainda igual à base C; tara editada fica', () => {
      const oldBase = { key: '', base: { packageWeightKg: 8 } }
      const form = formOf(
        [
          base('empty'),
          base('stillBase', { packageWeightKg: 8 }),
          base('edited', { packageWeightKg: 7 }),
          base('typedNoBase', { packageWeightKg: '3,5' }),
          base('otherCode', { dbcorpCode: 'BA5012' }),
        ],
        { stillBase: oldBase, edited: oldBase }
      )
      const registry = packagingFor(FCL, NEW_REGISTRY)
      const match = matchCargoRowsForSupplier('BA5190', 'Gooyer Chemicals Ltd', registry)
      const result = refillCargoTares(form, registry, match)
      expect(result.rowIds).toEqual(['empty', 'stillBase'])
      const byId = Object.fromEntries(result.form.rows.map((row) => [row.id, row.packageWeightKg]))
      expect(byId).toEqual({ empty: 9.5, stillBase: 9.5, edited: 7, typedNoBase: '3,5', otherCode: null })
      expect(result.form.autofill.rows.empty.base.packageWeightKg).toBe(9.5)
      expect(result.form.autofill.rows.stillBase.base.packageWeightKg).toBe(9.5)
      expect(result.form.autofill.rows.edited.base.packageWeightKg).toBe(8)
      expect(form.rows[0].packageWeightKg).toBeNull() // não muta o que recebeu
    })

    it('outro fornecedor ou nada a mudar devolve o mesmo form', () => {
      const form = formOf([base('a')])
      const registry = packagingFor({ ...FCL, supplierName: 'ORION CHEM CO' }, NEW_REGISTRY)
      expect(refillCargoTares(form, registry).form).toBe(form)
      const done = formOf([base('a', { packageWeightKg: 9.5 })], { a: { key: '', base: { packageWeightKg: 9.5 } } })
      expect(refillCargoTares(done, packagingFor(FCL, NEW_REGISTRY)).form).toBe(done)
    })

    it('matchCargoRowsForSupplier respeita os aliases (nome parecido do processo acha o cadastro)', () => {
      const aliases = [{ fromKey: 'GOOYER CHEMICAL CO', toKey: 'GOOYER CHEMICALS LTD' }]
      const aliased = suppliers([entryOf('BA5190', 'GOOYER CHEMICALS LTD', 9.5)], aliases)
      const registry = packagingFor({ ...FCL, supplierName: 'Gooyer Chemical Co.' }, aliased)
      const match = matchCargoRowsForSupplier('ba5190', 'GOOYER CHEMICALS LTD', registry)
      expect(refillCargoTares(formOf([base('a')]), registry, match).rowIds).toEqual(['a'])
    })
  })

  describe('prévia do Atualizar: item "peso da emb."', () => {
    const SOURCES = (process = FCL) => buildCargoSources(process, reference(FCL_FUP))
    const tareItems = (items) => items.filter((item) => item.kind === CARGO_DIFF_KINDS.tare)
    const editFirstTare = (form, value) => ({
      ...form,
      rows: form.rows.map((row, index) => (index === 0 ? { ...row, packageWeightKg: value } : row)),
    })

    it('cadastro igual ao que foi gravado: nenhum item de peso da emb.', () => {
      const registry = packagingFor(FCL)
      const sources = SOURCES()
      const { form } = buildAutofilledCargoReport(FCL, sources, registry)
      expect(tareItems(diffCargoReportAgainstSources(form, form.autofill, sources, registry))).toEqual([])
    })

    it('cadastro mudou: linha com a base C vira item marcado (defaultOn) e aplicar troca a tara e a base', () => {
      const sources = SOURCES()
      const { form } = buildAutofilledCargoReport(FCL, sources, packagingFor(FCL))
      const changed = packagingFor(FCL, suppliers([entryOf('BA5012', 'GOOYER CHEMICALS LTD', 10), entryOf('BA5033', '', 1.1)]))
      const items = tareItems(diffCargoReportAgainstSources(form, form.autofill, sources, changed))
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        kind: 'peso da emb.',
        source: 'C',
        edited: false,
        defaultOn: true,
        applicable: true,
        rowIds: [form.rows[0].id],
      })
      expect(items[0].title).toBe('BA5012 · GOOYER CHEMICALS LTD: peso da embalagem')
      expect(items[0].detail).toBe('Linha 1: 9,2 kg → 10 kg (cadastro)')

      const applied = applyCargoDiff(form, form.autofill, items, [items[0].id])
      expect(applied.form.rows[0].packageWeightKg).toBe(10)
      expect(applied.form.autofill.rows[form.rows[0].id].base.packageWeightKg).toBe(10)
      expect(cellOrigin(applied.form.rows[0], applied.form.autofill.rows[form.rows[0].id], 'packageWeightKg')).toBe('C')
    })

    it('tara editada não é sobrescrita sem aparecer: item desmarcado "(você editou esta célula)"', () => {
      const sources = SOURCES()
      const { form } = buildAutofilledCargoReport(FCL, sources, packagingFor(FCL))
      const edited = editFirstTare(form, '8,8')
      const changed = packagingFor(FCL, suppliers([entryOf('BA5012', 'GOOYER CHEMICALS LTD', 10)]))
      const [item] = tareItems(diffCargoReportAgainstSources(edited, edited.autofill, sources, changed))
      expect(item).toMatchObject({ edited: true, defaultOn: false, applicable: true })
      expect(item.detail).toBe('Linha 1: 8,8 kg → 10 kg (cadastro) (você editou esta célula)')
      // sem escolher, nada muda
      expect(applyCargoDiff(edited, edited.autofill, [item], []).form).toBe(edited)
    })

    it('cadastro igual à base com tara editada não propõe nada (o usuário já decidiu)', () => {
      const sources = SOURCES()
      const registry = packagingFor(FCL)
      const { form } = buildAutofilledCargoReport(FCL, sources, registry)
      const edited = editFirstTare(form, '8,8')
      expect(tareItems(diffCargoReportAgainstSources(edited, edited.autofill, sources, registry))).toEqual([])
    })

    it('tara digitada sem base C não entra; linha sem tara e sem base recebe a proposta marcada', () => {
      const sources = SOURCES()
      const registry = packagingFor(FCL)
      const common = { po: 'GOOYER SEA 001-26', dbcorpCode: 'BA5012', sqDescription: 'POLIOL PE-3000' }
      const typed = { ...createEmptyCargoReportRow('t'), ...common, packageWeightKg: 7 }
      const blank = { ...createEmptyCargoReportRow('b'), ...common }
      const none = { schemaVersion: 1, snapshotId: '', rows: {} }
      expect(tareItems(diffCargoReportAgainstSources({ rows: [typed] }, none, sources, registry))).toEqual([])
      const [item] = tareItems(diffCargoReportAgainstSources({ rows: [blank] }, none, sources, registry))
      expect(item).toMatchObject({ edited: false, defaultOn: true, rowIds: ['b'] })
      const applied = applyCargoDiff({ rows: [blank] }, none, [item], [item.id])
      expect(applied.form.rows[0].packageWeightKg).toBe(9.2)
      expect(applied.form.autofill.rows.b.base.packageWeightKg).toBe(9.2)
    })

    it('várias linhas do mesmo código + fornecedor viram um item só', () => {
      const registry = packagingFor(FCL, suppliers([entryOf('BA5012', 'GOOYER CHEMICALS LTD', 9.2)]))
      const sources = SOURCES()
      const row = (id) => ({
        ...createEmptyCargoReportRow(id),
        po: 'GOOYER SEA 001-26',
        dbcorpCode: 'BA5012',
        sqDescription: 'POLIOL PE-3000',
      })
      const form = { rows: [row('x'), row('y')], autofill: { schemaVersion: 1, snapshotId: '', rows: {} } }
      const items = tareItems(diffCargoReportAgainstSources(form, form.autofill, sources, registry))
      expect(items).toHaveLength(1)
      expect(items[0].rowIds).toEqual(['x', 'y'])
      expect(items[0].detail).toBe('Linhas 1, 2: (vazio) → 9,2 kg (cadastro)')
    })

    it('"só no FUP" aplicado já entra com a tara do cadastro', () => {
      const process = { ...FCL, items: FCL.items.slice(1) } // POLIOL fica só no FUP
      const registry = packagingFor(process)
      const sources = buildCargoSources(process, reference(FCL_FUP))
      const { form } = buildAutofilledCargoReport(process, sources, registry)
      const items = diffCargoReportAgainstSources(form, form.autofill, sources, registry)
      const add = items.find((item) => item.kind === CARGO_DIFF_KINDS.onlyFup)
      expect(add).toBeDefined()
      const applied = applyCargoDiff(form, form.autofill, [add], [add.id], { packaging: registry })
      const added = applied.form.rows.at(-1)
      expect(added).toMatchObject({ dbcorpCode: 'BA5012', packageWeightKg: 9.2 })
      expect(applied.form.autofill.rows[added.id].base.packageWeightKg).toBe(9.2)
    })

    it('mover a linha de PO no consolidado troca o fornecedor e, portanto, a tara proposta', () => {
      const process = {
        ...CONS,
        purchaseOrders: [
          { po: '4500901', reference: 'GOO SEA 001-26', supplierName: 'GOOYER CHEMICALS LTD' },
          { po: '4500903', reference: 'ORION SEA 007-26', supplierName: 'ORION CHEM CO' },
        ],
        items: [{ id: 'c1', commercialName: 'POLIOL PE-3000', quantity: 8000, poNumber: '4500903' }],
      }
      const registry = packagingFor(process)
      const { form, sources } = fillWithRegistry(process, reference(CONS_FUP))
      expect(form.rows[0].packageWeightKg).toBe(11.5)
      const moved = { ...form, rows: [{ ...form.rows[0], po: 'GOO SEA 001-26' }] }
      const items = diffCargoReportAgainstSources(moved, moved.autofill, sources, registry)
      const [item] = tareItems(items)
      expect(item.detail).toBe('Linha 1: 11,5 kg → 9,2 kg (cadastro)')
    })
  })
})

// ---------- S11-C: marca L (veio do COA) ----------

describe('S11-C: marca L (lote e quantidade vindos do COA)', () => {
  const lotRow = { ...createEmptyCargoReportRow('r1'), supplierLot: 'L1', quantityKg: 1500 }

  it('lote igual à base = L; lote editado = E; sem base = sem marca', () => {
    expect(SOURCE_MARK_TITLES.L).toBe('Veio do COA')
    expect(SOURCE_MARK_FIELDS.has('supplierLot')).toBe(true)
    expect(cellOrigin(lotRow, { key: 'fup:1', base: { supplierLot: 'L1' } }, 'supplierLot')).toBe('L')
    expect(cellOrigin({ ...lotRow, supplierLot: 'L9' }, { key: 'fup:1', base: { supplierLot: 'L1' } }, 'supplierLot')).toBe('E')
    expect(cellOrigin(lotRow, { key: 'fup:1', base: { quantityKg: 1500 } }, 'supplierLot')).toBe('')
    expect(cellOrigin(lotRow, undefined, 'supplierLot')).toBe('')
  })

  it('quantidade com entry.coa = L (mesmo com chave do FUP ou do processo); editada = E; sem coa continua F/P', () => {
    expect(cellOrigin(lotRow, { key: 'fup:1', base: { quantityKg: 1500 }, coa: true }, 'quantityKg')).toBe('L')
    expect(cellOrigin(lotRow, { key: 'proc:i1', base: { quantityKg: 1500 }, coa: true }, 'quantityKg')).toBe('L')
    expect(cellOrigin({ ...lotRow, quantityKg: 1400 }, { key: 'fup:1', base: { quantityKg: 1500 }, coa: true }, 'quantityKg')).toBe('E')
    expect(cellOrigin(lotRow, { key: 'fup:1', base: { quantityKg: 1500 } }, 'quantityKg')).toBe('F')
    expect(cellOrigin(lotRow, { key: 'proc:i1', base: { quantityKg: 1500 } }, 'quantityKg')).toBe('P')
  })

  it('duplicar/dividir copia o coa, mas a base do lote do COA não vai (o lote da cópia é digitado)', () => {
    const entries = { a: { key: 'fup:1', base: { quantityKg: 5, supplierLot: 'L1' }, coa: true } }
    const copy = autofillForCopies(entries, 'a', ['n1', 'n2'], { dropSource: true })
    expect(copy.n1).toEqual({ key: 'fup:1', base: { quantityKg: 5 }, coa: true })
    expect(copy.n2.coa).toBe(true)
    expect(entries.a.base.supplierLot).toBe('L1')
    expect(copy).not.toHaveProperty('a')
    // mover de PO mantém a base do lote (a marca L continua)
    expect(autofillForPurchaseOrder(entries, 'a', 'P2').a).toEqual({ key: 'fup:1', base: { quantityKg: 5, supplierLot: 'L1', po: 'P2' }, coa: true })
  })

  describe('"Atualizar" não troca a quantidade que veio do COA sem o usuário marcar', () => {
    const filled = () => {
      const { form } = fill(FCL, reference(FCL_FUP))
      const rows = form.rows.map((row, index) => (index === 1 ? { ...row, quantityKg: 3500 } : row))
      const [, second] = form.rows
      const entries = { ...form.autofill.rows, [second.id]: { ...form.autofill.rows[second.id], base: { ...form.autofill.rows[second.id].base, quantityKg: 3500 }, coa: true } }
      return { ...form, rows, autofill: { ...form.autofill, rows: entries } }
    }

    it('diferença de quantidade do FUP numa linha com coa vem desmarcada, com o sufixo "(veio do COA)"', () => {
      const form = filled()
      const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(FCL, reference(FCL_FUP, { snapshotId: 'snap-2' })))
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({ kind: CARGO_DIFF_KINDS.quantity, defaultOn: false, applicable: true, edited: false })
      expect(items[0].detail).toBe('Linha 2: 3.500 kg → 4.000 kg (FUP) (veio do COA)')
    })

    it('a mesma diferença numa linha SEM coa continua marcada', () => {
      const { form } = fill(FCL, reference(FCL_FUP))
      const rows = form.rows.map((row, index) => (index === 1 ? { ...row, quantityKg: 3500 } : row))
      const entries = { ...form.autofill.rows }
      const secondId = form.rows[1].id
      entries[secondId] = { ...entries[secondId], base: { ...entries[secondId].base, quantityKg: 3500 } }
      const same = { ...form, rows, autofill: { ...form.autofill, rows: entries } }
      const items = diffCargoReportAgainstSources(same, same.autofill, buildCargoSources(FCL, reference(FCL_FUP, { snapshotId: 'snap-2' })))
      expect(items[0].defaultOn).toBe(true)
      expect(items[0].detail).not.toContain('veio do COA')
    })

    it('se o usuário marcar e aplicar, a quantidade volta a ser do FUP (F) e a marca L sai', () => {
      const form = filled()
      const items = diffCargoReportAgainstSources(form, form.autofill, buildCargoSources(FCL, reference(FCL_FUP, { snapshotId: 'snap-2' })))
      const applied = applyCargoDiff(form, form.autofill, items, [items[0].id], { snapshotId: 'snap-2' })
      const second = applied.form.rows[1]
      expect(second.quantityKg).toBe(4000)
      expect(applied.form.autofill.rows[second.id].coa).toBeUndefined()
      expect(cellOrigin(second, applied.form.autofill.rows[second.id], 'quantityKg')).toBe('F')
    })
  })
})
