// Conferência por item (Fatia B): ida e volta das chaves novas (`unitsByRowId`, `partialPallets`) por `fromConferenceDoc` e
// `buildConferencePayload` (as MESMAS funções do celular e do computador). Um Salvar no computador não pode apagar o que o
// celular gravou, e o celular preserva o que o computador gravou. Doc antigo (sem as chaves) abre igual. Dados inventados.
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { EMPTY_CARGO_CONFERENCE, cargoConferenceKey } from '../../src/features/processes/cargoConferenceModel'
import {
  addCargoPartialPallet,
  setCargoRowUnits,
} from '../../src/features/processes/cargoConferenceUnits'
import {
  buildClosedConferencePayload,
  buildConferencePayload,
  fromConferenceDoc,
} from '../../src/features/processes/cargoReportFormModel'

const ROWS = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]
const PARTIALS = [
  { id: 'pp1', parts: [{ rowId: 'r1', units: 30 }, { rowId: 'r2', units: 20 }] },
  { id: 'pp2', parts: [{ rowId: 'r3', units: 7 }] },
]

// Doc como o servidor devolve depois de um Salvar do celular (as 5 chaves de dados do Relatório de Carga + as novas).
function phoneDoc(overrides = {}) {
  return {
    ...buildConferencePayload(
      {
        okByRowId: { r1: true, r2: true },
        palletsByRowId: { r1: 4, r2: 3 },
        unitsByRowId: { r1: 100, r2: 0, r3: 12 },
        partialPallets: PARTIALS,
        receiptStatus: 'sem_ressalva',
        revision: 2,
      },
      ROWS,
      { actorName: 'Operador' }
    ),
    updatedAt: new Date(2026, 10, 27, 9, 0),
    updatedByName: 'Operador',
    ...overrides,
  }
}

describe('buildConferencePayload: as chaves da Fatia B', () => {
  it('grava `unitsByRowId` e `partialPallets` SEMPRE (vazias quando não usadas: as chaves são pegajosas nas rules)', () => {
    const payload = buildConferencePayload({ revision: 0 }, ROWS, { actorName: 'Op' })
    expect(payload.unitsByRowId).toEqual({})
    expect(payload.partialPallets).toEqual([])
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(['unitsByRowId', 'partialPallets']))
  })

  it('grava unidades (inclusive 0) e parciais, e o fechamento herda as duas chaves', () => {
    const payload = buildConferencePayload({ unitsByRowId: { r1: 100, r2: 0 }, partialPallets: PARTIALS, revision: 1 }, ROWS, {})
    expect(payload.unitsByRowId).toEqual({ r1: 100, r2: 0 })
    expect(payload.partialPallets).toEqual(PARTIALS)
    const closed = buildClosedConferencePayload({ unitsByRowId: { r1: 100 }, partialPallets: PARTIALS, revision: 1 }, ROWS, {
      actorName: 'Op',
      actorUid: 'u1',
      today: '2026-11-27',
    })
    expect(closed.unitsByRowId).toEqual({ r1: 100 })
    expect(closed.partialPallets).toEqual(PARTIALS)
    expect(closed.status).toBe('fechada')
  })

  it('D-6: poda a linha removida (unidades e parte de parcial); o parcial com 1 parte vira "pallet incompleto"; sem partes, some', () => {
    const payload = buildConferencePayload(
      {
        unitsByRowId: { r1: 10, removida: 5 },
        partialPallets: [
          { id: 'pp1', parts: [{ rowId: 'r1', units: 30 }, { rowId: 'removida', units: 20 }] },
          { id: 'pp2', parts: [{ rowId: 'removida', units: 4 }] },
        ],
        revision: 0,
      },
      [{ id: 'r1' }],
      {}
    )
    expect(payload.unitsByRowId).toEqual({ r1: 10 })
    expect(payload.partialPallets).toEqual([{ id: 'pp1', parts: [{ rowId: 'r1', units: 30 }] }])
  })

  it('descarta entradas inválidas na gravação (as rules só validam tipo e tamanho)', () => {
    const payload = buildConferencePayload(
      {
        unitsByRowId: { r1: -1, r2: 1.5, r3: 99999 },
        partialPallets: [{ id: 'mau id', parts: [{ rowId: 'r1', units: 5 }] }, { id: 'ok', parts: [{ rowId: 'r1', units: 0 }] }],
        revision: 0,
      },
      ROWS,
      {}
    )
    expect(payload.unitsByRowId).toEqual({ r3: 99999 })
    expect(payload.partialPallets).toEqual([])
  })
})

describe('fromConferenceDoc: as chaves da Fatia B', () => {
  it('doc antigo (sem as chaves) abre igual: sem unidades e sem parciais', () => {
    const old = fromConferenceDoc({ schemaVersion: 1, revision: 3, status: 'aberta', okByRowId: { r1: true } }, ROWS)
    expect(old.unitsByRowId).toEqual({})
    expect(old.partialPallets).toEqual([])
    expect(old.okByRowId).toEqual({ r1: true })
    expect(fromConferenceDoc(null).unitsByRowId).toEqual({})
    expect(fromConferenceDoc(undefined).partialPallets).toEqual([])
  })

  it('lê as unidades e os parciais gravados', () => {
    const read = fromConferenceDoc(phoneDoc(), ROWS)
    expect(read.unitsByRowId).toEqual({ r1: 100, r2: 0, r3: 12 })
    expect(read.partialPallets).toEqual(PARTIALS)
  })

  it('o estado vazio e o lido de um doc vazio têm as mesmas chaves novas', () => {
    expect(EMPTY_CARGO_CONFERENCE.unitsByRowId).toEqual({})
    expect(EMPTY_CARGO_CONFERENCE.partialPallets).toEqual([])
    expect(Object.keys(fromConferenceDoc({})).sort()).toEqual(Object.keys(EMPTY_CARGO_CONFERENCE).sort())
  })
})

describe('ida e volta celular <-> computador', () => {
  it('um Salvar no COMPUTADOR (lê o doc do celular e grava de novo) NÃO apaga as unidades nem os parciais', () => {
    const doc = phoneDoc()
    // O computador (CargoReportForm) lê com fromConferenceDoc e grava com buildConferencePayload, sem tocar nas chaves novas.
    const onDesktop = { ...fromConferenceDoc(doc, ROWS), notes: 'Conferido sem avarias' }
    const saved = buildConferencePayload({ ...onDesktop, revision: doc.revision }, ROWS, { actorName: 'Operador' })
    expect(saved.unitsByRowId).toEqual(doc.unitsByRowId)
    expect(saved.partialPallets).toEqual(doc.partialPallets)
    expect(saved.palletsByRowId).toEqual(doc.palletsByRowId)
    expect(saved.notes).toBe('Conferido sem avarias')
    // E o fechamento no computador também leva as duas chaves.
    const closed = buildClosedConferencePayload({ ...onDesktop, revision: doc.revision }, ROWS, { actorName: 'Operador' })
    expect(closed.unitsByRowId).toEqual(doc.unitsByRowId)
    expect(closed.partialPallets).toEqual(doc.partialPallets)
  })

  it('o CELULAR preserva o que o computador gravou (ida, volta e ida de novo ficam idênticos)', () => {
    const fromDesktop = buildConferencePayload(
      { ...fromConferenceDoc(phoneDoc(), ROWS), receiptStatus: 'com_ressalva', revision: 3 },
      ROWS,
      { actorName: 'Admin' }
    )
    const onPhone = fromConferenceDoc({ ...fromDesktop, updatedAt: new Date(2026, 10, 27, 10, 0) }, ROWS)
    const again = buildConferencePayload({ ...onPhone, revision: fromDesktop.revision }, ROWS, { actorName: 'Operador' })
    expect(again.unitsByRowId).toEqual(fromDesktop.unitsByRowId)
    expect(again.partialPallets).toEqual(fromDesktop.partialPallets)
    expect(again.receiptStatus).toBe('com_ressalva')
  })

  it('o celular edita (unidades e parcial novo) sobre o que veio do doc e grava tudo', () => {
    const base = fromConferenceDoc(phoneDoc(), ROWS)
    let next = setCargoRowUnits(base, 'r3', 14)
    next = addCargoPartialPallet(next, [{ rowId: 'r3', units: 2 }, { rowId: 'r1', units: 3 }], { id: 'pp3' })
    const payload = buildConferencePayload({ ...next, revision: base.revision }, ROWS, {})
    expect(payload.unitsByRowId).toEqual({ r1: 100, r2: 0, r3: 14 })
    expect(payload.partialPallets.map((item) => item.id)).toEqual(['pp1', 'pp2', 'pp3'])
  })

  it('a chave de "sujo" enxerga a mudança de unidades e de parciais (e ignora linha removida)', () => {
    const base = fromConferenceDoc(phoneDoc(), ROWS)
    const key = cargoConferenceKey(base, ROWS)
    expect(cargoConferenceKey(setCargoRowUnits(base, 'r1', 101), ROWS)).not.toBe(key)
    expect(cargoConferenceKey(addCargoPartialPallet(base, [{ rowId: 'r1', units: 1 }], { id: 'pp9' }), ROWS)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, unitsByRowId: { ...base.unitsByRowId, removida: 9 } }, ROWS)).toBe(
      cargoConferenceKey(base, ROWS)
    )
    expect(cargoConferenceKey(base, ROWS)).toBe(key)
  })
})
