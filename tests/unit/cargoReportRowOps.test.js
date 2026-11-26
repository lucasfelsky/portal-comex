// S9-B do Relatorio de Carga: operacoes puras por linha (inserir, duplicar, dividir, mover, remover/desfazer,
// mover de PO). Nenhuma funcao muta a entrada; linhas novas ganham id novo; teto de 200 linhas.
import { describe, expect, it } from 'vitest'
import { CARGO_REPORT_MAX_ROWS, createEmptyCargoReportRow } from '../../src/features/processes/cargoReportFormModel'
import {
  duplicateCargoRow,
  insertCargoRow,
  insertCargoRowInPurchaseOrder,
  moveCargoRow,
  moveCargoRowToPurchaseOrder,
  removeCargoRow,
  replaceCargoRowsWithLots,
  restoreCargoRow,
  splitCargoRow,
  suggestCargoSplit,
} from '../../src/features/processes/cargoReportRowOps'

const row = (id, overrides = {}) => ({ ...createEmptyCargoReportRow(id), ...overrides })
const ids = (rows) => rows.map((item) => item.id)
const manyRows = (count) => Array.from({ length: count }, (_, index) => row(`r${index + 1}`, { po: 'P' }))

const PURCHASE_ORDERS = [
  { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
  { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
  { po: '4500903', reference: '', supplierName: 'ORION CHEM CO' },
]

describe('insertCargoRow', () => {
  const base = [row('a', { po: 'ACME', sqDescription: 'X', quantityKg: 10 }), row('b', { po: 'ZZ' })]

  it('insere acima e abaixo herdando so o PO, com id novo, sem mutar a entrada', () => {
    const snapshot = JSON.stringify(base)
    const above = insertCargoRow(base, 'b', 'above')
    expect(ids(above.rows).slice(0, 1)).toEqual(['a'])
    expect(above.rows[1].id).toBe(above.insertedId)
    expect(above.rows[2].id).toBe('b')
    expect(above.rows[1]).toMatchObject({ po: 'ZZ', sqDescription: '', quantityKg: null, dbcorpCode: '' })

    const below = insertCargoRow(base, 'a', 'below')
    expect(below.rows[1].id).toBe(below.insertedId)
    expect(below.rows[1].po).toBe('ACME')
    expect(below.insertedId).not.toBe('a')
    expect(JSON.stringify(base)).toBe(snapshot)
  })

  it('no teto de 200 linhas nada muda e devolve limit', () => {
    const full = manyRows(CARGO_REPORT_MAX_ROWS)
    const result = insertCargoRow(full, 'r1', 'below')
    expect(result.error).toBe('limit')
    expect(result.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
    expect(ids(result.rows)).toEqual(ids(full))
  })

  it('linha inexistente devolve invalid', () => {
    expect(insertCargoRow(base, 'nope', 'above').error).toBe('invalid')
  })
})

describe('duplicateCargoRow', () => {
  it('copia logo abaixo sem lote e sem valores congelados', () => {
    const original = row('a', {
      po: 'P',
      dbcorpCode: 'AD5240',
      supplierLot: 'L1',
      quantityKg: 100,
      packageWeightKg: 1.2,
      frozenNetWeightKg: 25,
      frozenPackages: 4,
    })
    const result = duplicateCargoRow([original, row('b')], 'a')
    expect(ids(result.rows)).toEqual(['a', result.insertedId, 'b'])
    expect(result.rows[1]).toMatchObject({
      po: 'P',
      dbcorpCode: 'AD5240',
      quantityKg: 100,
      packageWeightKg: 1.2,
      supplierLot: '',
      frozenNetWeightKg: null,
      frozenPackages: null,
    })
    expect(result.rows[0].supplierLot).toBe('L1')
    expect(result.insertedId).not.toBe('a')
  })

  it('respeita o teto de 200 linhas', () => {
    expect(duplicateCargoRow(manyRows(CARGO_REPORT_MAX_ROWS), 'r5').error).toBe('limit')
  })
})

describe('suggestCargoSplit', () => {
  it('1000 em 3 = 330 / 330 / 340 (base em blocos de 10 kg, resto no ultimo)', () => {
    expect(suggestCargoSplit(1000, 3).map((lot) => lot.quantityKg)).toEqual([330, 330, 340])
    expect(suggestCargoSplit(1000, 3).every((lot) => lot.supplierLot === '')).toBe(true)
  })

  it('a soma sempre fecha no total, inclusive com total pequeno ou fracionado', () => {
    for (const [total, count] of [[40000, 4], [25, 3], [7, 10], [1234.5, 6], [3, 2]]) {
      const sum = suggestCargoSplit(total, count).reduce((acc, lot) => acc + lot.quantityKg, 0)
      expect(Math.abs(sum - total)).toBeLessThan(0.0005)
      expect(suggestCargoSplit(total, count).every((lot) => lot.quantityKg > 0)).toBe(true)
    }
  })
})

describe('splitCargoRow', () => {
  const rows = [row('a'), row('b', { po: 'PO', sqDescription: 'ITEM', dbcorpCode: 'AD1', quantityKg: 1000, packageWeightKg: 1.5, frozenNetWeightKg: 25 }), row('c')]
  const lots = (...quantities) => quantities.map((quantityKg, index) => ({ supplierLot: `L${index + 1}`, quantityKg }))

  it('troca a linha por N linhas no mesmo lugar, mesmas descricoes/PO/codigo/tara e ids novos', () => {
    const result = splitCargoRow(rows, 'b', lots(330, 330, 340))
    expect(result.insertedIds).toHaveLength(3)
    expect(ids(result.rows)).toEqual(['a', ...result.insertedIds, 'c'])
    expect(result.rows.slice(1, 4).map((item) => item.quantityKg)).toEqual([330, 330, 340])
    expect(result.rows.slice(1, 4).map((item) => item.supplierLot)).toEqual(['L1', 'L2', 'L3'])
    for (const item of result.rows.slice(1, 4)) {
      expect(item).toMatchObject({ po: 'PO', sqDescription: 'ITEM', dbcorpCode: 'AD1', packageWeightKg: 1.5, frozenNetWeightKg: null })
    }
    expect(new Set(ids(result.rows)).size).toBe(5)
    expect(result.insertedIds).not.toContain('b')
  })

  it('aceita de 2 a 10 lotes e quantidade digitada em texto pt-BR', () => {
    expect(splitCargoRow(rows, 'b', lots(500, 500)).insertedIds).toHaveLength(2)
    expect(splitCargoRow(rows, 'b', lots(...Array(10).fill(100))).insertedIds).toHaveLength(10)
    const text = splitCargoRow(rows, 'b', [{ supplierLot: '', quantityKg: '600,5' }, { supplierLot: '', quantityKg: '399,5' }])
    expect(text.rows[1].quantityKg).toBe(600.5)
  })

  it('numero de lotes fora de 2..10 devolve count', () => {
    expect(splitCargoRow(rows, 'b', lots(1000)).error).toBe('count')
    expect(splitCargoRow(rows, 'b', lots(...Array(11).fill(1000 / 11))).error).toBe('count')
    expect(splitCargoRow(rows, 'b', []).error).toBe('count')
  })

  it('soma errada devolve sum e as linhas ficam intactas', () => {
    const snapshot = JSON.stringify(rows)
    const result = splitCargoRow(rows, 'b', lots(330, 330, 330))
    expect(result.error).toBe('sum')
    expect(JSON.stringify(result.rows)).toBe(snapshot)
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('soma dentro de 0,0005 kg fecha; 0,001 kg de diferenca nao', () => {
    const near = [row('x', { quantityKg: 100 })]
    expect(splitCargoRow(near, 'x', lots(50.0002, 50)).error).toBeUndefined()
    expect(splitCargoRow(near, 'x', lots(50.001, 50)).error).toBe('sum')
  })

  it('quantidade zero, negativa ou invalida devolve invalid', () => {
    expect(splitCargoRow(rows, 'b', lots(1000, 0)).error).toBe('invalid')
    expect(splitCargoRow(rows, 'b', lots(1500, -500)).error).toBe('invalid')
    expect(splitCargoRow(rows, 'b', [{ quantityKg: 'abc' }, { quantityKg: 1000 }]).error).toBe('invalid')
    expect(splitCargoRow(rows, 'b', [{ quantityKg: '' }, { quantityKg: 1000 }]).error).toBe('invalid')
  })

  it('linha sem quantidade valida nao divide', () => {
    expect(splitCargoRow(rows, 'a', lots(1, 1)).error).toBe('invalid')
  })

  it('199 linhas + dividir em 3 passaria de 200: limit; em 2 cabe', () => {
    const near = manyRows(199)
    near[10] = row('r11', { quantityKg: 90 })
    expect(splitCargoRow(near, 'r11', lots(30, 30, 30)).error).toBe('limit')
    const ok = splitCargoRow(near, 'r11', lots(45, 45))
    expect(ok.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
  })
})

describe('moveCargoRow', () => {
  const rows = [row('a'), row('b'), row('c')]

  it('troca com o vizinho e nao muta a entrada', () => {
    expect(ids(moveCargoRow(rows, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(ids(moveCargoRow(rows, 'b', 1))).toEqual(['a', 'c', 'b'])
    expect(ids(rows)).toEqual(['a', 'b', 'c'])
  })

  it('nas pontas e no-op', () => {
    expect(ids(moveCargoRow(rows, 'a', -1))).toEqual(['a', 'b', 'c'])
    expect(ids(moveCargoRow(rows, 'c', 1))).toEqual(['a', 'b', 'c'])
    expect(ids(moveCargoRow(rows, 'nope', 1))).toEqual(['a', 'b', 'c'])
  })

  it('com groupOf nao cruza o grupo', () => {
    const grouped = [row('a', { po: 'X' }), row('b', { po: 'X' }), row('c', { po: 'Y' })]
    const groupOf = (item) => item.po
    expect(ids(moveCargoRow(grouped, 'b', 1, groupOf))).toEqual(['a', 'b', 'c'])
    expect(ids(moveCargoRow(grouped, 'c', -1, groupOf))).toEqual(['a', 'b', 'c'])
    expect(ids(moveCargoRow(grouped, 'b', -1, groupOf))).toEqual(['b', 'a', 'c'])
  })
})

describe('removeCargoRow e restoreCargoRow (desfazer)', () => {
  const rows = [row('a'), row('b'), row('c'), row('d')]

  it('remover devolve a linha e o indice; desfazer volta ao mesmo indice', () => {
    const { rows: after, removed } = removeCargoRow(rows, 'c')
    expect(ids(after)).toEqual(['a', 'b', 'd'])
    expect(removed.index).toBe(2)
    expect(removed.row.id).toBe('c')
    expect(ids(restoreCargoRow(after, removed))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('desfazer nao duplica quando o id ja existe', () => {
    const { rows: after, removed } = removeCargoRow(rows, 'b')
    const once = restoreCargoRow(after, removed)
    expect(ids(restoreCargoRow(once, removed))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('desfazer depois de outra insercao ou remocao limita o indice ao tamanho', () => {
    const { rows: afterRemove, removed } = removeCargoRow(rows, 'd')
    const shorter = removeCargoRow(afterRemove, 'b').rows
    expect(ids(restoreCargoRow(shorter, removed))).toEqual(['a', 'c', 'd'])

    const longer = insertCargoRow(afterRemove, 'a', 'above').rows
    expect(ids(restoreCargoRow(longer, removed)).filter((id) => id === 'd')).toHaveLength(1)
    expect(restoreCargoRow(longer, removed)).toHaveLength(5)
  })

  it('remover linha inexistente nao muda nada; restaurar sem removed e no-op; no teto nao restaura', () => {
    expect(removeCargoRow(rows, 'nope').removed).toBeNull()
    expect(ids(restoreCargoRow(rows, null))).toEqual(ids(rows))
    const full = manyRows(CARGO_REPORT_MAX_ROWS)
    expect(restoreCargoRow(full, { row: row('x'), index: 0 })).toHaveLength(CARGO_REPORT_MAX_ROWS)
  })
})

describe('moveCargoRowToPurchaseOrder', () => {
  const rows = [
    row('a1', { po: 'ACME SEA 011-26' }),
    row('a2', { po: 'ACME SEA 011-26' }),
    row('n1', { po: 'NOVA SEA 034-26' }),
    row('n2', { po: 'NOVA SEA 034-26' }),
  ]

  it('troca o po pela referencia e reposiciona no fim do grupo de destino', () => {
    const result = moveCargoRowToPurchaseOrder(rows, 'a1', PURCHASE_ORDERS[1], PURCHASE_ORDERS)
    expect(ids(result)).toEqual(['a2', 'n1', 'n2', 'a1'])
    expect(result.find((item) => item.id === 'a1').po).toBe('NOVA SEA 034-26')
    expect(ids(rows)).toEqual(['a1', 'a2', 'n1', 'n2'])
  })

  it('PO sem referencia usa o numero do pedido', () => {
    const result = moveCargoRowToPurchaseOrder(rows, 'a1', PURCHASE_ORDERS[2], PURCHASE_ORDERS)
    expect(result.find((item) => item.id === 'a1').po).toBe('4500903')
    expect(ids(result)).toEqual(['a2', 'n1', 'n2', 'a1'])
  })

  it('PO de destino sem itens fica entre os grupos certos', () => {
    // 3 POs: a PO do meio (NOVA) esta vazia; linhas so na 1a e na 3a.
    const sparse = [
      row('a1', { po: 'ACME SEA 011-26' }),
      row('a2', { po: 'ACME SEA 011-26' }),
      row('o1', { po: '4500903' }),
    ]
    const result = moveCargoRowToPurchaseOrder(sparse, 'o1', PURCHASE_ORDERS[1], PURCHASE_ORDERS)
    expect(ids(result)).toEqual(['a1', 'a2', 'o1'])
    expect(result[2].po).toBe('NOVA SEA 034-26')

    const moved = moveCargoRowToPurchaseOrder(sparse, 'a1', PURCHASE_ORDERS[1], PURCHASE_ORDERS)
    expect(ids(moved)).toEqual(['a2', 'a1', 'o1'])
    expect(moved[1].po).toBe('NOVA SEA 034-26')
  })

  it('mover para o inicio quando o destino e a 1a PO e nao tem itens', () => {
    const tail = [row('n1', { po: 'NOVA SEA 034-26' }), row('o1', { po: '4500903' })]
    const result = moveCargoRowToPurchaseOrder(tail, 'o1', PURCHASE_ORDERS[0], PURCHASE_ORDERS)
    expect(ids(result)).toEqual(['o1', 'n1'])
    expect(result[0].po).toBe('ACME SEA 011-26')
  })

  it('mesma PO ou PO desconhecida e no-op', () => {
    expect(ids(moveCargoRowToPurchaseOrder(rows, 'a1', PURCHASE_ORDERS[0], PURCHASE_ORDERS))).toEqual(ids(rows))
    expect(ids(moveCargoRowToPurchaseOrder(rows, 'a1', { po: '999' }, PURCHASE_ORDERS))).toEqual(ids(rows))
  })

  it('linha de relatorio antigo (PO = numero do pedido) tambem e reconhecida', () => {
    const legacy = [row('l1', { po: '4500901' }), row('l2', { po: '4500902' })]
    const result = moveCargoRowToPurchaseOrder(legacy, 'l1', PURCHASE_ORDERS[1], PURCHASE_ORDERS)
    expect(ids(result)).toEqual(['l2', 'l1'])
    expect(result[1].po).toBe('NOVA SEA 034-26')
  })
})

describe('insertCargoRowInPurchaseOrder ("Linha nesta PO")', () => {
  it('entra no fim do grupo da PO, ja com a referencia', () => {
    const rows = [row('a1', { po: 'ACME SEA 011-26' }), row('n1', { po: 'NOVA SEA 034-26' })]
    const result = insertCargoRowInPurchaseOrder(rows, PURCHASE_ORDERS[0], PURCHASE_ORDERS)
    expect(ids(result.rows)).toEqual(['a1', result.insertedId, 'n1'])
    expect(result.rows[1].po).toBe('ACME SEA 011-26')
  })

  it('PO sem itens: entra depois do ultimo grupo anterior; no teto devolve limit', () => {
    const rows = [row('a1', { po: 'ACME SEA 011-26' })]
    const result = insertCargoRowInPurchaseOrder(rows, PURCHASE_ORDERS[2], PURCHASE_ORDERS)
    expect(ids(result.rows)).toEqual(['a1', result.insertedId])
    expect(result.rows[1].po).toBe('4500903')
    expect(insertCargoRowInPurchaseOrder(manyRows(CARGO_REPORT_MAX_ROWS), PURCHASE_ORDERS[0], PURCHASE_ORDERS).error).toBe('limit')
  })
})

describe('S11-C: replaceCargoRowsWithLots (Ler COAs)', () => {
  const item = (id, overrides = {}) =>
    row(id, { po: 'GOO SEA 185-26', dbcorpCode: 'BA5012', supplierDescription: 'FORN', sqDescription: 'POLIOL', packageWeightKg: 200, quantityKg: 4000, ...overrides })
  const base = [row('x', { po: 'X' }), item('a'), item('b', { supplierLot: 'ANT' }), row('z', { po: 'Z' })]

  it('troca as linhas do item por uma por lote, no lugar da primeira, com id novo e frozen nulos', () => {
    const snapshot = JSON.stringify(base)
    const result = replaceCargoRowsWithLots(base, ['a', 'b'], [
      { supplierLot: '  L1 ', quantityKg: 1500 },
      { supplierLot: 'L2', quantityKg: null },
      { supplierLot: 'L3', quantityKg: '2.500' },
    ])
    expect(result.error).toBeUndefined()
    expect(result.rows).toHaveLength(5)
    expect(result.rows[0].id).toBe('x')
    expect(result.rows[4].id).toBe('z')
    expect(result.insertedIds).toEqual(result.rows.slice(1, 4).map((created) => created.id))
    expect(result.insertedIds.every((id) => !['a', 'b'].includes(id))).toBe(true)
    expect(result.rows.slice(1, 4).map((created) => [created.supplierLot, created.quantityKg])).toEqual([
      ['L1', 1500],
      ['L2', null],
      ['L3', 2500],
    ])
    expect(result.rows[1]).toMatchObject({
      po: 'GOO SEA 185-26',
      dbcorpCode: 'BA5012',
      supplierDescription: 'FORN',
      sqDescription: 'POLIOL',
      packageWeightKg: 200,
      wmsLabel: '',
      count: null,
      frozenNetWeightKg: null,
      frozenPackages: null,
    })
    expect(Object.keys(result.rows[1])).toEqual(Object.keys(createEmptyCargoReportRow('k')))
    expect(JSON.stringify(base)).toBe(snapshot)
  })

  it('usa o template informado em vez da primeira linha', () => {
    const result = replaceCargoRowsWithLots(base, ['a', 'b'], [{ supplierLot: 'L1', quantityKg: 10 }], {
      template: item('t', { sqDescription: 'OUTRO' }),
    })
    expect(result.rows[1].sqDescription).toBe('OUTRO')
  })

  it('não confere a soma (quem decide é a prévia) e aceita 1 lote', () => {
    const result = replaceCargoRowsWithLots(base, ['a', 'b'], [{ supplierLot: 'L1', quantityKg: 1 }])
    expect(result.error).toBeUndefined()
    expect(result.rows).toHaveLength(3)
  })

  it('invalid: linha inexistente, sem linhas, sem lotes, quantidade <= 0 ou inválida, lote que não é texto', () => {
    const lots = [{ supplierLot: 'L1', quantityKg: 10 }]
    expect(replaceCargoRowsWithLots(base, ['nope'], lots).error).toBe('invalid')
    expect(replaceCargoRowsWithLots(base, ['a', 'nope'], lots).error).toBe('invalid')
    expect(replaceCargoRowsWithLots(base, [], lots).error).toBe('invalid')
    expect(replaceCargoRowsWithLots(base, ['a'], []).error).toBe('invalid')
    expect(replaceCargoRowsWithLots(base, ['a'], [{ supplierLot: 'L1', quantityKg: 0 }]).error).toBe('invalid')
    expect(replaceCargoRowsWithLots(base, ['a'], [{ supplierLot: 'L1', quantityKg: -5 }]).error).toBe('invalid')
    expect(replaceCargoRowsWithLots(base, ['a'], [{ supplierLot: 'L1', quantityKg: 'abc' }]).error).toBe('invalid')
    expect(replaceCargoRowsWithLots(base, ['a'], [{ supplierLot: null, quantityKg: 5 }]).error).toBe('invalid')
    expect(ids(replaceCargoRowsWithLots(base, ['nope'], lots).rows)).toEqual(ids(base))
  })

  it('teto de 200 linhas: passa de 200 = limit (nada muda); exatamente 200 cabe', () => {
    const full = [...manyRows(CARGO_REPORT_MAX_ROWS - 1), item('a')]
    const lots = (count) => Array.from({ length: count }, (_, index) => ({ supplierLot: `L${index}`, quantityKg: 1 }))
    const over = replaceCargoRowsWithLots(full, ['a'], lots(2))
    expect(over.error).toBe('limit')
    expect(ids(over.rows)).toEqual(ids(full))
    const exact = replaceCargoRowsWithLots(full, ['a'], lots(1))
    expect(exact.error).toBeUndefined()
    expect(exact.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
    // trocar 2 linhas por 3 estoura quando o relatório já está cheio
    const full2 = [...manyRows(CARGO_REPORT_MAX_ROWS - 2), item('a'), item('b')]
    expect(replaceCargoRowsWithLots(full2, ['a', 'b'], lots(3)).error).toBe('limit')
    const same = replaceCargoRowsWithLots(full2, ['a', 'b'], lots(2))
    expect(same.error).toBeUndefined()
    expect(same.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
    expect(replaceCargoRowsWithLots([item('a')], ['a'], lots(CARGO_REPORT_MAX_ROWS + 1)).error).toBe('invalid')
  })
})
