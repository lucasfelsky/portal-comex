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
  matchCargoLots,
  summarizeCargoConferenceItem,
} from '../../src/features/processes/cargoConferenceItems'
import { deriveCargoReportRow } from '../../src/features/processes/cargoReportFormModel'

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

describe('busca pelo lote (fatia A2): lote do fornecedor e lote SQ de qualquer lote do item', () => {
  const { items } = buildCargoConferenceItems(ROWS, [])
  const names = (query, list = items) => listCargoSearchItems(list, query).map((item) => item.name)
  const [poliol, catalisador, resina, aditivo] = items
  const withPo = (id, lot, extra = {}) => row(id, { po: 'DEMO SEA 011-26', supplierLot: lot, ...extra })

  it('acha pelo lote do fornecedor e diz "Achado pelo lote <lote>"', () => {
    expect(names('A-1180')).toEqual(['Resina Acrílica RA-55'])
    expect(matchCargoConferenceItem(resina, 'A-1180')).toEqual({ ok: true, by: 'Achado pelo lote A-1180' })
    expect(matchCargoConferenceItem(poliol, 'L-2240')).toEqual({ ok: true, by: 'Achado pelo lote L-2240' })
  })

  it('casa por trecho do lote, com a pontuação do lote contando (mesma regra do código: sem forma compacta)', () => {
    expect(matchCargoConferenceItem(poliol, '2231')).toEqual({ ok: true, by: 'Achado pelo lote L-2231' })
    expect(matchCargoConferenceItem(catalisador, '991')).toEqual({ ok: true, by: 'Achado pelo lote Z-9910' })
    // O "-" faz parte do texto comparado: "l 2231" e "L2231" não acham "L-2231" (igual ao que o código já faz).
    expect(names('l 2231')).toEqual([])
    expect(names('l2231')).toEqual([])
  })

  it('não diferencia caixa nem acento, nem espaço repetido, no lote do fornecedor', () => {
    const list = buildCargoConferenceItems([row('a', { supplierLot: 'Lót-Ç 9A' }), row('b', { dbcorpCode: 'BA9', sqDescription: 'Outro', supplierDescription: 'X', supplierLot: 'ZZ-1' })], []).items
    expect(matchCargoConferenceItem(list[0], 'LOT-c  9a')).toEqual({ ok: true, by: 'Achado pelo lote Lót-Ç 9A' })
    expect(matchCargoConferenceItem(list[0], 'lót-ç')).toEqual({ ok: true, by: 'Achado pelo lote Lót-Ç 9A' })
    expect(names('LÓT-Ç', list)).toEqual(['Poliol Flex 3000'])
    expect(names('l-2231')).toEqual(['Poliol Flex 3000'])
    expect(names('  L-2231  ')).toEqual(['Poliol Flex 3000'])
  })

  it('o lote SQ é o mesmo valor de deriveCargoReportRow (lote + 3 primeiras letras da PO) e também acha o item', () => {
    const rows = [withPo('s1', 'L-2231'), withPo('s2', 'L-2232', { dbcorpCode: 'BA5033', sqDescription: 'Catalisador ZN-12', supplierDescription: 'ZINC CATALYST ZN12' })]
    const model = buildCargoConferenceItems(rows, [])
    expect(model.items[0].lots[0].lotSq).toBe(deriveCargoReportRow(rows[0], null).lotSq)
    expect(model.items[0].lots[0].lotSq).toBe('L-2231DEM')
    expect(matchCargoConferenceItem(model.items[0], 'l-2231dem')).toEqual({ ok: true, by: 'Achado pelo lote SQ L-2231DEM' })
    expect(matchCargoConferenceItem(model.items[1], '2232dem')).toEqual({ ok: true, by: 'Achado pelo lote SQ L-2232DEM' })
    expect(names('2232dem', model.items)).toEqual(['Catalisador ZN-12'])
  })

  it('quando o mesmo lote casa pelo fornecedor e pelo SQ, vale o do fornecedor (o lote conta uma vez só)', () => {
    const { items: list } = buildCargoConferenceItems([withPo('s1', 'L-2231')], [])
    expect(matchCargoConferenceItem(list[0], '2231')).toEqual({ ok: true, by: 'Achado pelo lote L-2231' })
  })

  it('vários lotes casando: o primeiro e "+N lotes" ("+1 lote" no singular)', () => {
    expect(matchCargoConferenceItem(poliol, '22')).toEqual({ ok: true, by: 'Achado pelo lote L-2231 +2 lotes' })
    expect(matchCargoConferenceItem(poliol, '223')).toEqual({ ok: true, by: 'Achado pelo lote L-2231 +1 lote' })
    expect(matchCargoLots(poliol, '22').map((found) => found.rowId)).toEqual(['r1', 'r2', 'r3'])
  })

  it('vários lotes casando só pelo lote SQ: o primeiro, SQ, e "+N lotes"', () => {
    const { items: list } = buildCargoConferenceItems([withPo('s1', 'L-2231'), withPo('s2', 'L-2232'), withPo('s3', 'L-2240')], [])
    expect(matchCargoConferenceItem(list[0], 'dem')).toEqual({ ok: true, by: 'Achado pelo lote SQ L-2231DEM +2 lotes' })
  })

  it('lote do fornecedor e lote SQ misturados: o primeiro lote que casa dá o texto', () => {
    const { items: list } = buildCargoConferenceItems([row('s1', { po: '', supplierLot: 'L-2231' }), withPo('s2', 'L-9000')], [])
    // "dem" só casa o lote SQ do 2º lote (o 1º não tem PO).
    expect(matchCargoConferenceItem(list[0], 'dem')).toEqual({ ok: true, by: 'Achado pelo lote SQ L-9000DEM' })
    expect(matchCargoConferenceItem(list[0], 'l-')).toEqual({ ok: true, by: 'Achado pelo lote L-2231 +1 lote' })
  })

  it('item sem lote: nunca casa por "Sem lote informado", por texto vazio nem por espaços', () => {
    expect(aditivo.lots[0].title).toBe('Sem lote informado')
    expect(names('sem lote')).toEqual([])
    expect(names('informado')).toEqual([])
    expect(matchCargoLots(aditivo, '')).toEqual([])
    expect(matchCargoLots(aditivo, '   ')).toEqual([])
    expect(matchCargoLots(poliol, '')).toEqual([])
    expect(matchCargoLots(poliol, '  ')).toEqual([])
    // Lote só de espaços também é "sem lote".
    const { items: list } = buildCargoConferenceItems([row('a', { supplierLot: '   ' })], [])
    expect(matchCargoLots(list[0], ' ')).toEqual([])
    expect(matchCargoLots(list[0], 'x')).toEqual([])
    // Busca vazia: acha tudo e não mostra motivo.
    expect(matchCargoConferenceItem(aditivo, '')).toEqual({ ok: true, by: '' })
    expect(matchCargoConferenceItem(aditivo, '   ')).toEqual({ ok: true, by: '' })
  })

  it('o lote de OUTRO item não traz este item', () => {
    expect(names('9910')).toEqual(['Catalisador ZN-12'])
    expect(matchCargoConferenceItem(poliol, '9910')).toEqual({ ok: false, by: '' })
    expect(matchCargoConferenceItem(resina, '2231')).toEqual({ ok: false, by: '' })
    expect(names('l-2240')).toEqual(['Poliol Flex 3000'])
  })

  it('precedência do motivo: nome SQ (sem motivo) > nome no fornecedor > código > lote', () => {
    const lotOf = (extra) => buildCargoConferenceItems([row('a', { dbcorpCode: 'BA7000', sqDescription: 'Bloco Azul', supplierDescription: 'ZZ BLOCK', ...extra })], []).items[0]
    expect(matchCargoConferenceItem(lotOf({ supplierLot: 'BLOCO-9' }), 'bloco')).toEqual({ ok: true, by: '' })
    expect(matchCargoConferenceItem(lotOf({ supplierLot: 'ZZ-9' }), 'zz')).toEqual({ ok: true, by: 'Achado pelo nome no fornecedor' })
    expect(matchCargoConferenceItem(lotOf({ supplierLot: 'BA7000-L' }), 'ba7000')).toEqual({ ok: true, by: 'Achado pelo código BA7000' })
    expect(matchCargoConferenceItem(lotOf({ supplierLot: 'XQ-77' }), 'xq-77')).toEqual({ ok: true, by: 'Achado pelo lote XQ-77' })
  })

  it('"Próximo item" (listCargoSearchItems) segue o filtro por lote', () => {
    expect(listCargoSearchItems(items, '22').map((item) => item.name)).toEqual(['Poliol Flex 3000'])
    expect(listCargoSearchItems(items, 'z-9910').map((item) => item.key)).toEqual([catalisador.key])
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
