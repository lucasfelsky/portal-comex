// S9-B do Relatorio de Carga: agrupamento das linhas por PO no CONSOLIDADO (referencia, legado por numero,
// linha sem PO, PO sem item, ordenacao estavel).
import { describe, expect, it } from 'vitest'
import { createEmptyCargoReportRow } from '../../src/features/processes/cargoReportFormModel'
import {
  groupCargoRowsByPurchaseOrder,
  orderCargoFormByPurchaseOrder,
  orderCargoRowsByPurchaseOrder,
  resolveCargoRowPurchaseOrder,
  sumCargoRowsKg,
} from '../../src/features/processes/cargoReportGroups'

const row = (id, po, quantityKg = null) => ({ ...createEmptyCargoReportRow(id), po, quantityKg })
const ids = (rows) => rows.map((item) => item.id)

const ORDERS = [
  { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
  { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
  { po: '4500903', reference: 'ÓRION Sea 007-26', supplierName: 'ORION CHEM CO' },
]

describe('resolveCargoRowPurchaseOrder', () => {
  it('casa pela referencia, sem acento, caixa e espacos repetidos', () => {
    expect(resolveCargoRowPurchaseOrder('ACME SEA 011-26', ORDERS)).toBe(0)
    expect(resolveCargoRowPurchaseOrder('  nova   sea 034-26 ', ORDERS)).toBe(1)
    expect(resolveCargoRowPurchaseOrder('orion sea 007-26', ORDERS)).toBe(2)
  })

  it('relatorio antigo: casa pelo numero da PO (inclusive com pontuacao)', () => {
    expect(resolveCargoRowPurchaseOrder('4500902', ORDERS)).toBe(1)
    expect(resolveCargoRowPurchaseOrder('4.500.903', ORDERS)).toBe(2)
  })

  it('PO sem referencia casa pelo numero', () => {
    expect(resolveCargoRowPurchaseOrder('77', [{ po: '77', reference: '', supplierName: '' }])).toBe(0)
  })

  it('texto livre, vazio ou digitos soltos de uma referencia nao casam por engano', () => {
    expect(resolveCargoRowPurchaseOrder('', ORDERS)).toBe(-1)
    expect(resolveCargoRowPurchaseOrder('OUTRA PO 1-26', ORDERS)).toBe(-1)
    // "ACME 4500901 X" tem letras: nao entra na regra de digitos.
    expect(resolveCargoRowPurchaseOrder('ACME 4500901 X', ORDERS)).toBe(-1)
    expect(resolveCargoRowPurchaseOrder('4500999', ORDERS)).toBe(-1)
    expect(resolveCargoRowPurchaseOrder('ACME SEA 011-26', [])).toBe(-1)
  })
})

describe('groupCargoRowsByPurchaseOrder', () => {
  it('agrupa na ordem do processo, com subtotal e rowIndex da linha', () => {
    const rows = [
      row('n1', 'NOVA SEA 034-26', 100),
      row('a1', 'ACME SEA 011-26', '1.000,5'),
      row('n2', 'NOVA SEA 034-26', 50),
    ]
    const groups = groupCargoRowsByPurchaseOrder(rows, ORDERS)
    expect(groups.map((group) => group.index)).toEqual([0, 1, 2])
    expect(groups[0].rows.map((entry) => [entry.row.id, entry.rowIndex])).toEqual([['a1', 1]])
    expect(groups[0].totalKg).toBe(1000.5)
    expect(groups[1].rows.map((entry) => entry.row.id)).toEqual(['n1', 'n2'])
    expect(groups[1].totalKg).toBe(150)
  })

  it('PO sem linha aparece com 0 kg e sem grupo "sem PO"', () => {
    const groups = groupCargoRowsByPurchaseOrder([row('a1', 'ACME SEA 011-26', 10)], ORDERS)
    expect(groups).toHaveLength(3)
    expect(groups[2]).toMatchObject({ rows: [], totalKg: 0 })
    expect(groups.every((group) => group.purchaseOrder)).toBe(true)
  })

  it('linha sem PO reconhecida vai para o grupo final null', () => {
    const groups = groupCargoRowsByPurchaseOrder([row('x', 'LIVRE', 5), row('a1', 'ACME SEA 011-26', 10)], ORDERS)
    expect(groups).toHaveLength(4)
    expect(groups[3].purchaseOrder).toBeNull()
    expect(groups[3].rows.map((entry) => entry.row.id)).toEqual(['x'])
    expect(groups[3].totalKg).toBe(5)
  })

  it('sem POs (nao consolidado) nao quebra', () => {
    expect(groupCargoRowsByPurchaseOrder([row('a', 'X')], [])).toHaveLength(1)
    expect(groupCargoRowsByPurchaseOrder([], ORDERS).every((group) => group.rows.length === 0)).toBe(true)
  })
})

describe('orderCargoRowsByPurchaseOrder', () => {
  const rows = [
    row('x', 'LIVRE'),
    row('o1', 'ORION SEA 007-26'),
    row('a1', 'ACME SEA 011-26'),
    row('n1', '4500902'),
    row('a2', 'ACME SEA 011-26'),
    row('x2', ''),
  ]

  it('agrupa pela ordem de purchaseOrders, sem PO por ultimo, estavel dentro do grupo', () => {
    expect(ids(orderCargoRowsByPurchaseOrder(rows, ORDERS))).toEqual(['a1', 'a2', 'n1', 'o1', 'x', 'x2'])
  })

  it('e idempotente e nao muta a entrada', () => {
    const once = orderCargoRowsByPurchaseOrder(rows, ORDERS)
    expect(ids(orderCargoRowsByPurchaseOrder(once, ORDERS))).toEqual(ids(once))
    expect(ids(rows)).toEqual(['x', 'o1', 'a1', 'n1', 'a2', 'x2'])
  })

  it('sem POs devolve copia na mesma ordem', () => {
    const copy = orderCargoRowsByPurchaseOrder(rows, [])
    expect(copy).not.toBe(rows)
    expect(ids(copy)).toEqual(ids(rows))
  })
})

describe('orderCargoFormByPurchaseOrder', () => {
  const consolidated = { category: 'CONSOLIDADO', purchaseOrders: ORDERS }

  it('ordena so o CONSOLIDADO e devolve o mesmo form quando nada muda', () => {
    const form = { revision: 3, rows: [row('n1', 'NOVA SEA 034-26'), row('a1', 'ACME SEA 011-26')] }
    const ordered = orderCargoFormByPurchaseOrder(form, consolidated)
    expect(ids(ordered.rows)).toEqual(['a1', 'n1'])
    expect(ordered.revision).toBe(3)
    expect(orderCargoFormByPurchaseOrder(ordered, consolidated)).toBe(ordered)
    expect(orderCargoFormByPurchaseOrder(form, { category: 'FCL' })).toBe(form)
  })
})

describe('sumCargoRowsKg', () => {
  it('soma numeros e texto pt-BR; vazio e invalido contam 0', () => {
    expect(sumCargoRowsKg([row('a', 'P', 10.5), row('b', 'P', '1.000'), row('c', 'P', null), row('d', 'P', 'abc')])).toBe(1010.5)
    expect(sumCargoRowsKg([])).toBe(0)
  })
})
