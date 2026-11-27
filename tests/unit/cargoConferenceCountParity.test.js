// Fatia D: PARIDADE entre o cliente da Fatia B (`src/features/processes/cargoConferenceUnits.js` e
// `deriveCargoReportRow`) e as functions (`functions/src/process/cargoConferenceCount.js`): os leitores de unidades e de
// pallets parciais, o esperado por lote (D-23) e a regra de divergência têm de devolver o MESMO resultado.
//
// ATIVO desde o merge da Fatia B (#324). Se a B mudar a regra, o caso que falhar aponta qual. Única diferença conhecida e ACEITA (D-23): lote congelado SEM embalagem (`frozenNetWeightKg` nulo) e embalagem cadastrada
// depois: o cliente calcula ao vivo pelo catálogo (`resolveNetWeightKg`), as functions não leem o catálogo e o e-mail não
// aponta divergência nesse lote. Por isso o catálogo aqui é sempre `null` (sem contexto).

import { beforeAll, describe, expect, it } from 'vitest'

import {
  isCargoRowUnitsDivergent,
  readCargoPartialPallets,
  readCargoUnitsMap,
  readExpectedUnits,
  resolveCargoRowExpectedUnits,
} from '../../functions/src/process/cargoConferenceCount.js'

let client
let deriveCargoReportRow

beforeAll(async () => {
  client = await import('../../src/features/processes/cargoConferenceUnits.js')
  ;({ deriveCargoReportRow } = await import('../../src/features/processes/cargoReportFormModel.js'))
})

const ROW_IDS = ['r-1', 'r-2', 'r-3']

const UNITS_CASES = [
  ['inteiros válidos', { 'r-1': 5, 'r-2': 0, 'r-3': 99999 }],
  ['acima de 99999 e negativo', { 'r-1': 100000, 'r-2': -1 }],
  ['fracionário, texto, nulo e NaN', { 'r-1': 1.5, 'r-2': '7', 'r-3': null, 'r-9': Number.NaN }],
  ['linha que não existe', { 'r-9': 3, 'r-1': 2 }],
  ['não é mapa', [1, 2]],
  ['nulo', null],
  ['mapa com 250 entradas', Object.fromEntries(Array.from({ length: 250 }, (_, i) => [i < 3 ? ROW_IDS[i] : `x-${i}`, 1]))],
]

const part = (rowId, units) => ({ rowId, units })
const PARTIAL_CASES = [
  ['parcial válido com 2 partes', [{ id: 'pp-1', parts: [part('r-1', 30), part('r-2', 20)] }]],
  ['parcial com 1 parte (pallet incompleto)', [{ id: 'pp-1', parts: [part('r-1', 30)] }]],
  ['id inválido', [{ id: 'a b', parts: [part('r-1', 1)] }, { id: '', parts: [part('r-1', 1)] }]],
  ['id duplicado', [{ id: 'pp-1', parts: [part('r-1', 1)] }, { id: 'pp-1', parts: [part('r-2', 2)] }]],
  ['3 partes', [{ id: 'pp-1', parts: [part('r-1', 1), part('r-2', 1), part('r-3', 1)] }]],
  ['0 partes', [{ id: 'pp-1', parts: [] }]],
  ['rowId repetido na mesma parcial', [{ id: 'pp-1', parts: [part('r-1', 5), part('r-1', 6)] }]],
  ['unidades 0, 100000 e fracionária', [{ id: 'pp-1', parts: [part('r-1', 0), part('r-2', 100000)] }, { id: 'pp-2', parts: [part('r-3', 1.5)] }]],
  ['parte de linha inexistente', [{ id: 'pp-1', parts: [part('r-1', 4), part('r-9', 4)] }]],
  ['só linha inexistente', [{ id: 'pp-1', parts: [part('r-9', 4)] }]],
  ['mais de 50 parciais', Array.from({ length: 60 }, (_, i) => ({ id: `pp-${i}`, parts: [part('r-1', 1)] }))],
  ['não é lista', { id: 'pp-1' }],
]

const EXPECTED_CASES = [160, 159.9999999, 160.0000001, 160.5, 0, -1, null, undefined, '160', Number.NaN, Infinity, 1e-7]

const ROW_CASES = [
  ['congelado em frozenPackages', { frozenPackages: 160, quantityKg: 1, frozenNetWeightKg: 1 }],
  ['quantidade / peso líquido congelado', { frozenPackages: null, quantityKg: 4000, frozenNetWeightKg: 25 }],
  ['ruído de ponto flutuante', { quantityKg: 800.0000001, frozenNetWeightKg: 5 }],
  ['fracionário', { frozenPackages: null, quantityKg: 100, frozenNetWeightKg: 30 }],
  ['frozenPackages nulo e frozenNetWeightKg número', { frozenPackages: null, quantityKg: 1000, frozenNetWeightKg: 40 }],
  ['sem peso líquido congelado', { frozenPackages: null, quantityKg: 4000, frozenNetWeightKg: null }],
  ['quantidade zero', { quantityKg: 0, frozenNetWeightKg: 25 }],
  ['peso líquido zero', { quantityKg: 4000, frozenNetWeightKg: 0 }],
  ['linha sem congelados', { quantityKg: 4000 }],
]

describe('paridade functions x cliente da Fatia B', () => {
  it.each(UNITS_CASES)('readCargoUnitsMap = readUnitsMap: %s', (_name, value) => {
    expect(readCargoUnitsMap(value, ROW_IDS)).toEqual(client.readUnitsMap(value, ROW_IDS))
    expect(readCargoUnitsMap(value)).toEqual(client.readUnitsMap(value))
  })

  it.each(PARTIAL_CASES)('readCargoPartialPallets = readPartialPallets: %s', (_name, value) => {
    expect(readCargoPartialPallets(value, ROW_IDS)).toEqual(client.readPartialPallets(value, ROW_IDS))
    expect(readCargoPartialPallets(value)).toEqual(client.readPartialPallets(value))
  })

  it.each(EXPECTED_CASES.map((value) => [String(value), value]))('readExpectedUnits = cliente: %s', (_name, value) => {
    expect(readExpectedUnits(value)).toEqual(client.readExpectedUnits(value))
  })

  it('isCargoRowUnitsDivergent = cliente em toda a tabela unidades x esperado', () => {
    const values = [undefined, null, 0, 1, 50, 52, 150, 160, 160.5, -1, '160']
    for (const units of values) {
      for (const expected of values) {
        expect(isCargoRowUnitsDivergent(units, expected)).toBe(client.isCargoRowUnitsDivergent(units, expected))
      }
    }
  })

  it.each(ROW_CASES)('resolveCargoRowExpectedUnits = readExpectedUnits(deriveCargoReportRow(...).packages): %s', (_name, row) => {
    const fromClient = client.readExpectedUnits(deriveCargoReportRow(row, null, undefined).packages)
    expect(resolveCargoRowExpectedUnits(row)).toBe(fromClient)
  })
})
