// Conferência por item (Fatia B): unidades por lote e pallet parcial (módulo puro). Dados inventados.
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  CARGO_PARTIAL_PALLETS_MAX,
  CARGO_UNITS_ROW_MAX,
  addCargoPartialPallet,
  cargoRowUnitsInPartials,
  countCargoPartialPallets,
  describeCargoPartialCount,
  expectedUnitsFromDerived,
  formatCargoPalletsStrip,
  getCargoRowUnits,
  isCargoRowUnitsDivergent,
  listCargoPartialPallets,
  partialPalletsOfRow,
  readExpectedUnits,
  readPartialPallets,
  readUnitsMap,
  removeCargoPartialPallet,
  setCargoRowUnits,
  stepCargoRowUnits,
} from '../../src/features/processes/cargoConferenceUnits'

const EMPTY = { unitsByRowId: {}, partialPallets: [] }

describe('unidades por lote', () => {
  it('readUnitsMap: só inteiros de 0 a 99999; outro tipo e fora da faixa saem; com rowIds, só as linhas que existem', () => {
    const value = { a: 10, b: 0, c: -1, d: 100000, e: 1.5, f: '7', g: null, orfa: 4 }
    expect(readUnitsMap(value)).toEqual({ a: 10, b: 0, orfa: 4 })
    expect(readUnitsMap(value, ['a', 'b', 'c'])).toEqual({ a: 10, b: 0 })
    expect(readUnitsMap(undefined)).toEqual({})
    expect(readUnitsMap([1, 2])).toEqual({})
    expect(readUnitsMap({ a: CARGO_UNITS_ROW_MAX })).toEqual({ a: 99999 })
  })

  it('readUnitsMap corta em 200 entradas (o limite das rules)', () => {
    const many = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [`r${index}`, 1]))
    expect(Object.keys(readUnitsMap(many))).toHaveLength(200)
  })

  it('getCargoRowUnits: null = nunca contado; 0 é um valor', () => {
    expect(getCargoRowUnits(EMPTY, 'a')).toBeNull()
    expect(getCargoRowUnits({ unitsByRowId: { a: 0 } }, 'a')).toBe(0)
    expect(getCargoRowUnits({ unitsByRowId: { a: 12 } }, 'a')).toBe(12)
    expect(getCargoRowUnits({ unitsByRowId: { a: 'x' } }, 'a')).toBeNull()
    expect(getCargoRowUnits(undefined, 'a')).toBeNull()
  })

  it('setCargoRowUnits: limita a 0..99999, trunca, e vazio ou inválido tira a entrada; não muta', () => {
    const base = { unitsByRowId: { a: 5 } }
    expect(setCargoRowUnits(base, 'a', 12.9).unitsByRowId).toEqual({ a: 12 })
    expect(setCargoRowUnits(base, 'b', '40').unitsByRowId).toEqual({ a: 5, b: 40 })
    expect(setCargoRowUnits(base, 'a', -3).unitsByRowId).toEqual({ a: 0 })
    expect(setCargoRowUnits(base, 'a', 1e9).unitsByRowId).toEqual({ a: 99999 })
    expect(setCargoRowUnits(base, 'a', null).unitsByRowId).toEqual({})
    expect(setCargoRowUnits(base, 'a', '').unitsByRowId).toEqual({})
    expect(setCargoRowUnits(base, 'a', 'abc').unitsByRowId).toEqual({})
    expect(base).toEqual({ unitsByRowId: { a: 5 } })
  })

  it('stepCargoRowUnits soma sobre o valor mais recente e não passa de 0 nem de 99999', () => {
    let conference = EMPTY
    conference = stepCargoRowUnits(conference, 'a', 1)
    conference = stepCargoRowUnits(conference, 'a', 1)
    expect(getCargoRowUnits(conference, 'a')).toBe(2)
    conference = stepCargoRowUnits(conference, 'a', -1)
    conference = stepCargoRowUnits(conference, 'a', -1)
    conference = stepCargoRowUnits(conference, 'a', -1)
    expect(getCargoRowUnits(conference, 'a')).toBe(0)
    expect(getCargoRowUnits(stepCargoRowUnits({ unitsByRowId: { a: 99999 } }, 'a', 1), 'a')).toBe(99999)
  })

  it('readExpectedUnits: inteiro (com a tolerância do ponto flutuante) ou nada (D-11)', () => {
    expect(readExpectedUnits(100)).toBe(100)
    expect(readExpectedUnits(4000 / 25)).toBe(160)
    expect(readExpectedUnits(0.1 * 3 * 10)).toBe(3)
    expect(readExpectedUnits(9.8)).toBeNull()
    expect(readExpectedUnits(null)).toBeNull()
    expect(readExpectedUnits(undefined)).toBeNull()
    expect(readExpectedUnits(Number.NaN)).toBeNull()
    expect(readExpectedUnits('100')).toBeNull()
    expect(readExpectedUnits(-5)).toBeNull()
  })

  it('isCargoRowUnitsDivergent: contou (> 0) e o total difere do esperado; 0, sem contagem e sem esperado nunca divergem', () => {
    expect(isCargoRowUnitsDivergent(150, 160)).toBe(true)
    expect(isCargoRowUnitsDivergent(170, 160)).toBe(true)
    expect(isCargoRowUnitsDivergent(160, 160)).toBe(false)
    expect(isCargoRowUnitsDivergent(0, 160)).toBe(false)
    expect(isCargoRowUnitsDivergent(null, 160)).toBe(false)
    expect(isCargoRowUnitsDivergent(150, null)).toBe(false)
    expect(isCargoRowUnitsDivergent(150, undefined)).toBe(false)
  })

  it('expectedUnitsFromDerived liga cada linha ao Nº de emb. inteiro do relatório', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const derived = [{ packages: 100 }, { packages: 9.8 }, { packages: null }]
    expect(expectedUnitsFromDerived(rows, derived)).toEqual({ a: 100, b: null, c: null })
    expect(expectedUnitsFromDerived(undefined, undefined)).toEqual({})
  })
})

describe('pallet parcial: leitura e poda (D-6)', () => {
  const valid = { id: 'pp1', parts: [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }] }

  it('lê o parcial válido e descarta o inválido (id, partes, unidades, linha repetida)', () => {
    const list = readPartialPallets([
      valid,
      { id: 'sem espaço ruim!', parts: [{ rowId: 'r1', units: 1 }] },
      { id: 'pp2', parts: [] },
      { id: 'pp3', parts: [{ rowId: 'r1', units: 1 }, { rowId: 'r2', units: 1 }, { rowId: 'r3', units: 1 }] },
      { id: 'pp4', parts: [{ rowId: 'r1', units: 0 }] },
      { id: 'pp5', parts: [{ rowId: 'r1', units: 1.5 }] },
      { id: 'pp6', parts: [{ rowId: 'r1', units: 100000 }] },
      'texto',
      null,
    ])
    expect(list).toEqual([valid])
  })

  it('a mesma linha duas vezes no parcial fica com a primeira parte; id repetido fica com o primeiro', () => {
    expect(readPartialPallets([{ id: 'pp1', parts: [{ rowId: 'r1', units: 5 }, { rowId: 'r1', units: 9 }] }])).toEqual([
      { id: 'pp1', parts: [{ rowId: 'r1', units: 5 }] },
    ])
    expect(readPartialPallets([valid, { id: 'pp1', parts: [{ rowId: 'r9', units: 1 }] }])).toEqual([valid])
  })

  it('sem lista (doc antigo) lê vazio; corta em 50', () => {
    expect(readPartialPallets(undefined)).toEqual([])
    expect(readPartialPallets({})).toEqual([])
    const many = Array.from({ length: 70 }, (_, index) => ({ id: `p${index}`, parts: [{ rowId: 'r1', units: 1 }] }))
    expect(readPartialPallets(many)).toHaveLength(CARGO_PARTIAL_PALLETS_MAX)
  })

  it('D-6: a parte de linha removida sai; o parcial com 1 parte vira "pallet incompleto" e continua contando 1; sem partes, some', () => {
    const conference = { partialPallets: [valid, { id: 'pp2', parts: [{ rowId: 'r9', units: 4 }] }] }
    expect(listCargoPartialPallets(conference, ['r2', 'r6'])).toEqual([valid])
    expect(listCargoPartialPallets(conference, ['r2'])).toEqual([{ id: 'pp1', parts: [{ rowId: 'r2', units: 30 }] }])
    expect(countCargoPartialPallets(conference, ['r2'])).toBe(1)
    // As duas linhas do pp1 saíram e a única do pp2 também: nenhum pallet.
    expect(countCargoPartialPallets(conference, ['r1'])).toBe(0)
    // Sem a lista de linhas, a leitura não poda por linha.
    expect(countCargoPartialPallets(conference)).toBe(2)
  })
})

describe('pallet parcial: adicionar, remover e ver pelo lado de cada lote', () => {
  it('addCargoPartialPallet: 1 pallet físico com as duas partes; aparece nos DOIS lotes', () => {
    const conference = addCargoPartialPallet(EMPTY, [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }], { id: 'pp1' })
    expect(conference.partialPallets).toEqual([{ id: 'pp1', parts: [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }] }])
    expect(countCargoPartialPallets(conference)).toBe(1)
    expect(partialPalletsOfRow(conference, 'r2')).toEqual([
      { id: 'pp1', mine: { rowId: 'r2', units: 30 }, other: { rowId: 'r6', units: 20 } },
    ])
    expect(partialPalletsOfRow(conference, 'r6')).toEqual([
      { id: 'pp1', mine: { rowId: 'r6', units: 20 }, other: { rowId: 'r2', units: 30 } },
    ])
    expect(partialPalletsOfRow(conference, 'r1')).toEqual([])
  })

  it('"Nenhum (pallet incompleto)": 1 parte só, outro = null', () => {
    const conference = addCargoPartialPallet(EMPTY, [{ rowId: 'r1', units: 12 }], { id: 'pp1' })
    expect(partialPalletsOfRow(conference, 'r1')).toEqual([{ id: 'pp1', mine: { rowId: 'r1', units: 12 }, other: null }])
  })

  it('o id é gerado válido e único quando não vem; parcial inválido devolve a MESMA conferência', () => {
    const first = addCargoPartialPallet(EMPTY, [{ rowId: 'r1', units: 1 }])
    const second = addCargoPartialPallet(first, [{ rowId: 'r1', units: 2 }])
    const ids = second.partialPallets.map((item) => item.id)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/)
    expect(addCargoPartialPallet(EMPTY, [], { id: 'x' })).toBe(EMPTY)
    expect(addCargoPartialPallet(EMPTY, [{ rowId: 'r1', units: 0 }], { id: 'x' })).toBe(EMPTY)
    expect(addCargoPartialPallet(EMPTY, [{ rowId: 'r1', units: 1 }, { rowId: 'r1', units: 2 }], { id: 'x' })).toBe(EMPTY)
    expect(addCargoPartialPallet(EMPTY, [{ rowId: 'a', units: 1 }, { rowId: 'b', units: 1 }, { rowId: 'c', units: 1 }], { id: 'x' })).toBe(EMPTY)
  })

  it('lista cheia (50): não acrescenta', () => {
    const full = { partialPallets: Array.from({ length: 50 }, (_, index) => ({ id: `p${index}`, parts: [{ rowId: 'r1', units: 1 }] })) }
    expect(addCargoPartialPallet(full, [{ rowId: 'r1', units: 1 }], { id: 'novo' })).toBe(full)
  })

  it('removeCargoPartialPallet remove o pallet dos dois lotes de uma vez', () => {
    const conference = addCargoPartialPallet(EMPTY, [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }], { id: 'pp1' })
    const removed = removeCargoPartialPallet(conference, 'pp1')
    expect(removed.partialPallets).toEqual([])
    expect(partialPalletsOfRow(removed, 'r2')).toEqual([])
    expect(partialPalletsOfRow(removed, 'r6')).toEqual([])
    expect(removeCargoPartialPallet(conference, 'outro').partialPallets).toHaveLength(1)
  })

  it('uma linha pode estar em mais de um parcial; cargoRowUnitsInPartials soma as partes dela', () => {
    let conference = addCargoPartialPallet(EMPTY, [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }], { id: 'pp1' })
    conference = addCargoPartialPallet(conference, [{ rowId: 'r2', units: 5 }], { id: 'pp2' })
    expect(partialPalletsOfRow(conference, 'r2')).toHaveLength(2)
    expect(cargoRowUnitsInPartials(conference, 'r2')).toBe(35)
    expect(cargoRowUnitsInPartials(conference, 'r6')).toBe(20)
    expect(cargoRowUnitsInPartials(conference, 'r1')).toBe(0)
  })
})

describe('textos da faixa de pallets', () => {
  it('plural de "parcial"', () => {
    expect(describeCargoPartialCount(1)).toBe('1 parcial')
    expect(describeCargoPartialCount(2)).toBe('2 parciais')
  })

  it('com o total do COMEX: "N pallets contados de M informados pelo COMEX (inclui K parcial|parciais)"', () => {
    expect(formatCargoPalletsStrip({ counted: 22, partial: 1, expected: 22, state: 'confere' })).toBe(
      '22 pallets contados de 22 informados pelo COMEX (inclui 1 parcial)'
    )
    expect(formatCargoPalletsStrip({ counted: 21, partial: 2, expected: 22, state: 'divergente' })).toBe(
      '21 pallets contados de 22 informados pelo COMEX (inclui 2 parciais)'
    )
    expect(formatCargoPalletsStrip({ counted: 5, partial: 0, expected: 8, state: 'divergente' })).toBe(
      '5 pallets contados de 8 informados pelo COMEX'
    )
    expect(formatCargoPalletsStrip({ counted: 1, partial: 0, expected: 1, state: 'confere' })).toBe(
      '1 pallet contado de 1 informado pelo COMEX'
    )
  })

  it('sem o total: "N pallets contados. Total não informado pelo COMEX."', () => {
    expect(formatCargoPalletsStrip({ counted: 23, partial: 0, expected: null, state: 'semTotal' })).toBe(
      '23 pallets contados. Total não informado pelo COMEX.'
    )
    expect(formatCargoPalletsStrip({ counted: 1, partial: 0, expected: null, state: 'semTotal' })).toBe(
      '1 pallet contado. Total não informado pelo COMEX.'
    )
    expect(formatCargoPalletsStrip({ counted: 3, partial: 1, expected: null, state: 'semTotal' })).toBe(
      '3 pallets contados (inclui 1 parcial). Total não informado pelo COMEX.'
    )
  })
})
