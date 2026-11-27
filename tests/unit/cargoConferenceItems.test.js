// Conferência por item (Fatia A): módulo puro que agrupa as linhas do relatório em itens dentro de cada PO, a busca e o
// progresso. Dados inventados (nenhum dado real).
import { describe, expect, it } from 'vitest'

import {
  buildCargoConferenceItems,
  describeCargoLot,
  foldCargoSearchText,
  listCargoSearchItems,
  locateCargoItem,
  matchCargoConferenceItem,
  summarizeCargoConferenceItem,
} from '../../src/features/processes/cargoConferenceItems'

const row = (id, overrides = {}) => ({
  id,
  po: '',
  dbcorpCode: 'BA5012',
  sqDescription: 'Poliol Flex 3000',
  supplierDescription: 'POLYETHER POLYOL PE-3000',
  supplierLot: `L-${id}`,
  ...overrides,
})

const ROWS = [
  row('r1', { supplierLot: 'L-2231' }),
  row('r2', { supplierLot: 'L-2232' }),
  row('r3', { supplierLot: 'L-2240', supplierDescription: 'POLYETHER POLYOL PE-3000 TYPE B' }),
  row('r4', { dbcorpCode: 'BA5033', sqDescription: 'Catalisador ZN-12', supplierDescription: 'ZINC CATALYST ZN12', supplierLot: 'Z-9910' }),
  row('r5', { dbcorpCode: 'BA5190', sqDescription: 'Resina Acrílica RA-55', supplierDescription: 'ACRYLIC RESIN AR-55 (50%)', supplierLot: 'A-1180' }),
  row('r6', { dbcorpCode: 'BA6001', sqDescription: 'Aditivo AX-7', supplierDescription: 'ADDITIVE AX7 POWDER', supplierLot: '' }),
]

describe('foldCargoSearchText', () => {
  it('tira acento, caixa e espaço repetido', () => {
    expect(foldCargoSearchText('  Resina   Acrílica  RA-55 ')).toBe('resina acrilica ra-55')
    expect(foldCargoSearchText(null)).toBe('')
    expect(foldCargoSearchText(undefined)).toBe('')
  })
})

describe('describeCargoLot', () => {
  it('"Lote X" ou "Sem lote informado"', () => {
    expect(describeCargoLot({ supplierLot: ' L-9 ' })).toBe('Lote L-9')
    expect(describeCargoLot({ supplierLot: '' })).toBe('Sem lote informado')
    expect(describeCargoLot({})).toBe('Sem lote informado')
  })
})

describe('buildCargoConferenceItems: itens (D-2)', () => {
  it('agrupa as linhas pelo código do item, na ordem da primeira aparição, com os lotes dentro', () => {
    const model = buildCargoConferenceItems(ROWS, [])
    expect(model.grouped).toBe(false)
    expect(model.groups).toHaveLength(1)
    expect(model.items.map((item) => item.name)).toEqual(['Poliol Flex 3000', 'Catalisador ZN-12', 'Resina Acrílica RA-55', 'Aditivo AX-7'])
    expect(model.items[0].lots.map((lot) => lot.title)).toEqual(['Lote L-2231', 'Lote L-2232', 'Lote L-2240'])
    expect(model.items[0].lots.map((lot) => lot.rowIndex)).toEqual([0, 1, 2])
    expect(model.items[3].lots[0].title).toBe('Sem lote informado')
    expect(model.items[0].code).toBe('BA5012')
  })

  it('o código é normalizado (caixa e espaço): "ba5012 " e "BA5012" são o mesmo item', () => {
    const model = buildCargoConferenceItems([row('a', { dbcorpCode: 'ba5012 ' }), row('b', { dbcorpCode: 'BA5012' })], [])
    expect(model.items).toHaveLength(1)
    expect(model.items[0].code).toBe('BA5012')
  })

  it('sem código: agrupa pela descrição SQ dobrada; sem as duas, pela do fornecedor; sem nada, a linha é um item só', () => {
    const model = buildCargoConferenceItems(
      [
        row('a', { dbcorpCode: '', sqDescription: 'Aditivo Novo' }),
        row('b', { dbcorpCode: '', sqDescription: ' ADITIVO   novo ' }),
        row('c', { dbcorpCode: '', sqDescription: '', supplierDescription: 'Fornecedor X' }),
        row('d', { dbcorpCode: '', sqDescription: '', supplierDescription: 'fornecedor x' }),
        row('e', { dbcorpCode: '', sqDescription: '', supplierDescription: '' }),
        row('f', { dbcorpCode: '', sqDescription: '', supplierDescription: '' }),
      ],
      []
    )
    expect(model.items.map((item) => item.rowIds)).toEqual([['a', 'b'], ['c', 'd'], ['e'], ['f']])
    // O nome cai na descrição SQ, depois na do fornecedor, depois em "Item N" (N = posição da linha no relatório).
    expect(model.items.map((item) => item.name)).toEqual(['Aditivo Novo', 'Fornecedor X', 'Item 5', 'Item 6'])
    expect(model.items[0].code).toBe('')
  })

  it('o nome é a primeira descrição SQ não vazia do item', () => {
    const model = buildCargoConferenceItems([row('a', { sqDescription: '' }), row('b', { sqDescription: 'Poliol B' })], [])
    expect(model.items[0].name).toBe('Poliol B')
  })

  it('consolidado: o mesmo código em duas POs são dois itens, cada um no grupo da sua PO; linha sem PO vai no grupo final', () => {
    const orders = [
      { po: '4500901', reference: 'DEMO SEA 011-26', supplierName: 'Fornecedor Alfa Ltda' },
      { po: '4500902', reference: 'DEMO SEA 012-26', supplierName: 'Fornecedor Beta SA' },
    ]
    const rows = [
      row('a', { po: 'DEMO SEA 011-26' }),
      row('b', { po: 'DEMO SEA 011-26' }),
      row('c', { po: 'DEMO SEA 012-26' }),
      row('d', { po: 'SEM RECONHECER' }),
    ]
    const model = buildCargoConferenceItems(rows, orders)
    expect(model.grouped).toBe(true)
    expect(model.groups.map((group) => [group.id, group.label, group.supplier, group.items.length])).toEqual([
      ['po0', 'DEMO SEA 011-26', 'Fornecedor Alfa Ltda', 1],
      ['po1', 'DEMO SEA 012-26', 'Fornecedor Beta SA', 1],
      ['orphans', 'Linhas sem PO desta consolidada', '', 1],
    ])
    expect(model.items).toHaveLength(3)
    expect(new Set(model.items.map((item) => item.key)).size).toBe(3)
    expect(model.items[0].rowIds).toEqual(['a', 'b'])
    expect(model.keyByRowId.get('c')).toBe(model.items[1].key)
    expect(model.itemByKey.get(model.items[2].key).rowIds).toEqual(['d'])
  })

  it('PO sem nenhuma linha não vira grupo; relatório vazio não quebra', () => {
    const orders = [
      { po: '1', reference: 'A', supplierName: '' },
      { po: '2', reference: 'B', supplierName: '' },
    ]
    expect(buildCargoConferenceItems([row('a', { po: 'B' })], orders).groups.map((group) => group.label)).toEqual(['B'])
    expect(buildCargoConferenceItems([], []).items).toEqual([])
    expect(buildCargoConferenceItems(undefined, undefined).items).toEqual([])
  })
})

describe('buildCargoConferenceItems: nome do fornecedor (D-3)', () => {
  it('a referência é o nome do primeiro lote que o tem; o lote de nome diferente (dobrado) ganha o selo', () => {
    const [item] = buildCargoConferenceItems(ROWS, []).items
    expect(item.supplierName).toBe('POLYETHER POLYOL PE-3000')
    expect(item.lots.map((lot) => lot.differentName)).toEqual([false, false, true])
  })

  it('diferença só de caixa, acento ou espaço não conta como nome diferente', () => {
    const model = buildCargoConferenceItems(
      [row('a', { supplierDescription: 'Polyol  Ácido' }), row('b', { supplierDescription: 'POLYOL ACIDO' })],
      []
    )
    expect(model.items[0].lots.map((lot) => lot.differentName)).toEqual([false, false])
  })

  it('lote sem nome nunca ganha o selo; a referência pula o lote sem nome; sem nenhum nome a linha some', () => {
    const [first] = buildCargoConferenceItems([row('a', { supplierDescription: '' }), row('b', { supplierDescription: 'NOME B' })], []).items
    expect(first.supplierName).toBe('NOME B')
    expect(first.lots.map((lot) => lot.differentName)).toEqual([false, false])
    const [none] = buildCargoConferenceItems([row('a', { supplierDescription: '' })], []).items
    expect(none.supplierName).toBe('')
    expect(none.lots[0].differentName).toBe(false)
  })
})

describe('matchCargoConferenceItem: busca', () => {
  const { items } = buildCargoConferenceItems(ROWS, [])
  const names = (query) => listCargoSearchItems(items, query).map((item) => item.name)

  it('sem texto (ou só espaço) acha tudo, sem motivo', () => {
    expect(matchCargoConferenceItem(items[0], '')).toEqual({ ok: true, by: '' })
    expect(matchCargoConferenceItem(items[0], '   ')).toEqual({ ok: true, by: '' })
    expect(names('')).toHaveLength(4)
  })

  it('acha pelo nome da SQ sem diferenciar caixa nem acento, e não diz o motivo', () => {
    expect(names('acrilica')).toEqual(['Resina Acrílica RA-55'])
    expect(names('  ACRÍLICA  ')).toEqual(['Resina Acrílica RA-55'])
    expect(matchCargoConferenceItem(items[2], 'acrilica')).toEqual({ ok: true, by: '' })
  })

  it('acha pelo nome no fornecedor e diz "Achado pelo nome no fornecedor"', () => {
    expect(names('zinc catalyst')).toEqual(['Catalisador ZN-12'])
    expect(matchCargoConferenceItem(items[1], 'zinc catalyst')).toEqual({ ok: true, by: 'Achado pelo nome no fornecedor' })
    // O nome do fornecedor de QUALQUER lote vale, inclusive o diferente.
    expect(names('type b')).toEqual(['Poliol Flex 3000'])
  })

  it('acha pelo código e diz "Achado pelo código <código>"', () => {
    expect(names('ba5190')).toEqual(['Resina Acrílica RA-55'])
    expect(matchCargoConferenceItem(items[2], 'ba5190')).toEqual({ ok: true, by: 'Achado pelo código BA5190' })
  })

  it('sem resultado: lista vazia', () => {
    expect(names('tinta')).toEqual([])
    expect(matchCargoConferenceItem(items[0], 'tinta')).toEqual({ ok: false, by: '' })
  })
})

describe('summarizeCargoConferenceItem e locateCargoItem', () => {
  const { items } = buildCargoConferenceItems(ROWS, [])
  const conference = {
    okByRowId: { r1: true, r2: true, r3: true, r4: true },
    palletsByRowId: { r1: 4, r2: 3, r3: 2, r4: 0 },
    countOkByRowId: {},
    damageByRowId: { r2: { flagged: true, note: 'Tambor amassado', photos: [] } },
  }

  it('item conferido = todos os lotes conferidos (OK? e pelo menos 1 pallet); sem parciais, pallets = só os inteiros', () => {
    expect(summarizeCargoConferenceItem(items[0], conference)).toEqual({
      total: 3,
      done: 3,
      full: true,
      percent: 100,
      pallets: 9,
      whole: 9,
      partial: 0,
      units: { counted: 0, expected: null },
      unitsDivergent: false,
      hasIssue: true,
    })
    // r4 tem OK? mas 0 pallet: não conta.
    expect(summarizeCargoConferenceItem(items[1], conference)).toMatchObject({ total: 1, done: 0, full: false, percent: 0, pallets: 0, hasIssue: false })
  })

  it('um lote pendente deixa o item incompleto, com o percentual dos lotes', () => {
    const partial = { ...conference, okByRowId: { r1: true, r2: true } }
    expect(summarizeCargoConferenceItem(items[0], partial)).toMatchObject({ total: 3, done: 2, full: false, percent: 67 })
  })

  it('a posição do item é na lista sem filtro ("Item 2 de 4")', () => {
    expect(locateCargoItem(items, items[1].key)).toEqual({ index: 2, total: 4 })
    expect(locateCargoItem(items, 'nao-existe')).toEqual({ index: 0, total: 4 })
  })
})

// ---------- Fatia B: pallets parciais e unidades no item ----------

describe('Fatia B: summarizeCargoConferenceItem com parciais e unidades', () => {
  const model = buildCargoConferenceItems(ROWS, [])
  const [poliol, catalisador] = model.items
  const base = { okByRowId: {}, countOkByRowId: {}, palletsByRowId: { r1: 4, r2: 3 }, unitsByRowId: {}, partialPallets: [] }

  it('pallets = inteiros + parciais; um parcial dividido entre dois lotes do MESMO item conta 1', () => {
    const conference = { ...base, partialPallets: [{ id: 'pp1', parts: [{ rowId: 'r1', units: 30 }, { rowId: 'r2', units: 20 }] }] }
    expect(summarizeCargoConferenceItem(poliol, conference)).toMatchObject({ pallets: 8, whole: 7, partial: 1 })
  })

  it('o parcial dividido com OUTRO item conta 1 em cada um (e 1 só na carga)', () => {
    const conference = { ...base, partialPallets: [{ id: 'pp1', parts: [{ rowId: 'r2', units: 30 }, { rowId: 'r4', units: 20 }] }] }
    expect(summarizeCargoConferenceItem(poliol, conference)).toMatchObject({ pallets: 8, whole: 7, partial: 1 })
    expect(summarizeCargoConferenceItem(catalisador, conference)).toMatchObject({ pallets: 1, whole: 0, partial: 1 })
  })

  it('unidades do item: contadas x esperadas (só lotes com Nº de emb. inteiro entram no esperado)', () => {
    const conference = { ...base, unitsByRowId: { r1: 100, r2: 100 } }
    const expected = { r1: 100, r2: 100, r3: 50, r4: 160 }
    expect(summarizeCargoConferenceItem(poliol, conference, expected).units).toEqual({ counted: 200, expected: 250 })
    expect(summarizeCargoConferenceItem(poliol, conference, { r1: 100, r2: 100, r3: null }).units).toEqual({ counted: 200, expected: 200 })
    expect(summarizeCargoConferenceItem(poliol, conference, null).units).toEqual({ counted: 200, expected: null })
  })

  it('contados e esperados somam sobre o MESMO conjunto de lotes (nunca "150 de 100" sem selo)', () => {
    // r3 não tem Nº de emb. inteiro e contou 50; r1 tem 100 esperadas e contou 100: só r1 entra nos dois lados.
    const conference = { ...base, unitsByRowId: { r1: 100, r3: 50 } }
    const summary = summarizeCargoConferenceItem(poliol, conference, { r1: 100, r2: 100, r3: null })
    expect(summary.units).toEqual({ counted: 100, expected: 200 })
    expect(summary.unitsDivergent).toBe(false)
    // Sem nenhum lote com esperado: só o contado de todos os lotes.
    expect(summarizeCargoConferenceItem(poliol, conference, { r1: null, r2: null, r3: null }).units).toEqual({ counted: 150, expected: null })
  })

  it('o item conta só os parciais que têm parte em lote DELE: o terceiro item não ganha o pallet dos outros', () => {
    const [, , resina] = model.items
    const conference = { ...base, palletsByRowId: { r1: 4, r5: 2 }, partialPallets: [{ id: 'pp1', parts: [{ rowId: 'r2', units: 30 }, { rowId: 'r4', units: 20 }] }] }
    expect(summarizeCargoConferenceItem(poliol, conference)).toMatchObject({ partial: 1, whole: 4, pallets: 5 })
    expect(summarizeCargoConferenceItem(catalisador, conference)).toMatchObject({ partial: 1, whole: 0, pallets: 1 })
    expect(summarizeCargoConferenceItem(resina, conference)).toMatchObject({ partial: 0, whole: 2, pallets: 2 })
  })

  it('o parcial com as duas partes dentro do mesmo item conta 1 nele e 0 nos outros', () => {
    const [, , resina] = model.items
    const conference = { ...base, palletsByRowId: {}, partialPallets: [{ id: 'pp1', parts: [{ rowId: 'r1', units: 30 }, { rowId: 'r3', units: 20 }] }] }
    expect(summarizeCargoConferenceItem(poliol, conference)).toMatchObject({ partial: 1, pallets: 1 })
    expect(summarizeCargoConferenceItem(catalisador, conference)).toMatchObject({ partial: 0, pallets: 0 })
    expect(summarizeCargoConferenceItem(resina, conference)).toMatchObject({ partial: 0, pallets: 0 })
  })

  it('unitsDivergent: algum lote contou e difere do esperado; 0, sem contagem e sem esperado não divergem', () => {
    const expected = { r1: 100, r2: 100, r3: 50 }
    expect(summarizeCargoConferenceItem(poliol, { ...base, unitsByRowId: { r1: 90 } }, expected).unitsDivergent).toBe(true)
    expect(summarizeCargoConferenceItem(poliol, { ...base, unitsByRowId: { r1: 100, r2: 100, r3: 50 } }, expected).unitsDivergent).toBe(false)
    expect(summarizeCargoConferenceItem(poliol, { ...base, unitsByRowId: { r1: 0 } }, expected).unitsDivergent).toBe(false)
    expect(summarizeCargoConferenceItem(poliol, base, expected).unitsDivergent).toBe(false)
    expect(summarizeCargoConferenceItem(poliol, { ...base, unitsByRowId: { r1: 90 } }, { r1: null }).unitsDivergent).toBe(false)
    expect(summarizeCargoConferenceItem(poliol, { ...base, unitsByRowId: { r1: 90 } }).unitsDivergent).toBe(false)
  })

  it('o item fica conferido com o parcial contando como pallet (OK? em todos os lotes)', () => {
    const conference = {
      ...base,
      okByRowId: { r1: true, r2: true, r3: true },
      palletsByRowId: {},
      partialPallets: [{ id: 'pp1', parts: [{ rowId: 'r1', units: 1 }] }, { id: 'pp2', parts: [{ rowId: 'r2', units: 1 }, { rowId: 'r3', units: 1 }] }],
    }
    expect(summarizeCargoConferenceItem(poliol, conference)).toMatchObject({ done: 3, full: true, pallets: 2, partial: 2 })
  })

  it('infoByRowId guarda o nome do item e o lote de cada linha (o outro lote do parcial)', () => {
    expect(model.infoByRowId.get('r2')).toEqual({ name: 'Poliol Flex 3000', lot: 'L-2232' })
    expect(model.infoByRowId.get('r6')).toEqual({ name: 'Aditivo AX-7', lot: '' })
    expect(model.infoByRowId.get('nao-existe')).toBeUndefined()
  })
})
