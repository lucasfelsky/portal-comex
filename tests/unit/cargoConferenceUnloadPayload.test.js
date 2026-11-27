// Fatia C: ida e volta de `unloadByUnit` por `fromConferenceDoc` e `buildConferencePayload` (as MESMAS funções do celular e do
// computador), calculados (início, fim e data de recebimento) e a regra de 24 h POR UNIDADE no `validateCargoUnload` (que o
// computador e o diálogo de fechar chamam). Dados inventados.
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { EMPTY_CARGO_CONFERENCE } from '../../src/features/processes/cargoConferenceModel'
import { patchCargoUnloadUnit } from '../../src/features/processes/cargoConferenceUnload'
import {
  buildClosedConferencePayload,
  buildConferencePayload,
  fromConferenceDoc,
  validateCargoUnload,
} from '../../src/features/processes/cargoReportFormModel'

const ROWS = [{ id: 'r1' }, { id: 'r2' }]
const D = '2026-11-27T'
const MAP = {
  'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
  'CNT-2': { startAt: `${D}09:20`, endAt: `${D}10:30` },
  'CNT-3': { startAt: `${D}10:50`, endAt: '' },
}

function phoneDoc(overrides = {}) {
  return {
    ...buildConferencePayload({ ...EMPTY_CARGO_CONFERENCE, unloadByUnit: MAP, okByRowId: { r1: true }, revision: 2 }, ROWS, {
      actorName: 'Operador',
    }),
    updatedAt: new Date(2026, 10, 27, 11, 0),
    updatedByName: 'Operador',
    ...overrides,
  }
}

describe('buildConferencePayload: unloadByUnit e os calculados', () => {
  it('com unidades: grava o mapa, início = menor início, fim = maior fim das finalizadas e a data do início', () => {
    const payload = phoneDoc()
    expect(payload.unloadByUnit).toEqual(MAP)
    expect(payload.unloadStartAt).toBe(`${D}08:10`)
    expect(payload.unloadEndAt).toBe(`${D}10:30`)
    expect(payload.receivedDate).toBe('2026-11-27')
  })

  it('os calculados VENCEM o início/fim que vierem soltos (a tela e o doc não podem divergir)', () => {
    const payload = buildConferencePayload(
      { unloadByUnit: MAP, unloadStartAt: '2026-01-01T00:00', unloadEndAt: '2026-01-02T00:00', receivedDate: '2026-01-01', revision: 0 },
      ROWS,
      {}
    )
    expect(payload).toMatchObject({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}10:30`, receivedDate: '2026-11-27' })
  })

  it('poda entrada vazia, inválida e id ruim; mapa vazio grava {} e o início/fim seguem como vieram', () => {
    const payload = buildConferencePayload(
      {
        unloadByUnit: { a: { startAt: '', endAt: '' }, b: 'x', c: { startAt: `${D}08:00`, endAt: '' } },
        revision: 0,
      },
      ROWS,
      {}
    )
    expect(payload.unloadByUnit).toEqual({ c: { startAt: `${D}08:00`, endAt: '' } })
    const empty = buildConferencePayload(
      { unloadByUnit: {}, unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', revision: 0 },
      ROWS,
      {}
    )
    expect(empty.unloadByUnit).toEqual({})
    expect(empty).toMatchObject({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' })
  })

  it('doc antigo (sem a chave): o payload regrava exatamente os campos de hoje e NÃO inventa a chave nova', () => {
    const oldDoc = {
      status: 'aberta',
      revision: 5,
      receivedDate: '2026-11-24',
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
    }
    const state = fromConferenceDoc(oldDoc)
    expect('unloadByUnit' in state).toBe(false)
    const payload = buildConferencePayload({ ...state, revision: state.revision }, ROWS, { actorName: 'Op' })
    expect('unloadByUnit' in payload).toBe(false)
    expect(Object.keys(payload)).toHaveLength(22)
    expect(payload).toMatchObject({
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      receivedDate: '2026-11-24',
      revision: 6,
    })
  })

  it('o fechamento herda o mapa e os calculados', () => {
    const closed = buildClosedConferencePayload({ ...EMPTY_CARGO_CONFERENCE, unloadByUnit: MAP, revision: 1 }, ROWS, {
      actorName: 'Op',
      actorUid: 'u1',
      today: '2026-11-27',
    })
    expect(closed.unloadByUnit).toEqual(MAP)
    expect(closed).toMatchObject({ status: 'fechada', unloadStartAt: `${D}08:10`, unloadEndAt: `${D}10:30` })
  })
})

describe('fromConferenceDoc: unloadByUnit', () => {
  it('lê o mapa podado; doc com a chave vazia mantém {} (a chave existe no doc); doc sem a chave não a cria', () => {
    const state = fromConferenceDoc({ unloadByUnit: { ...MAP, lixo: 3, vazio: { startAt: '', endAt: '' } } })
    expect(state.unloadByUnit).toEqual(MAP)
    expect(fromConferenceDoc({ unloadByUnit: {} }).unloadByUnit).toEqual({})
    expect(fromConferenceDoc({ unloadByUnit: 'texto' }).unloadByUnit).toEqual({})
    expect('unloadByUnit' in fromConferenceDoc({})).toBe(false)
  })
})

describe('ida e volta celular <-> computador (descarga)', () => {
  it('um Salvar no COMPUTADOR (lê o doc do celular e grava de novo) NÃO apaga nem altera a descarga por unidade', () => {
    const doc = phoneDoc()
    const onDesktop = { ...fromConferenceDoc(doc, ROWS), notes: 'Conferido sem avarias' }
    const saved = buildConferencePayload({ ...onDesktop, revision: doc.revision }, ROWS, { actorName: 'Operador' })
    expect(saved.unloadByUnit).toEqual(MAP)
    expect(saved.unloadByUnit).not.toEqual({})
    expect(saved).toMatchObject({ unloadStartAt: doc.unloadStartAt, unloadEndAt: doc.unloadEndAt, receivedDate: doc.receivedDate })
    expect(saved.notes).toBe('Conferido sem avarias')
    const closed = buildClosedConferencePayload({ ...onDesktop, revision: doc.revision }, ROWS, { actorName: 'Operador' })
    expect(closed.unloadByUnit).toEqual(MAP)
  })

  it('o computador que edita OUTRA coisa e o celular que lê de volta enxergam o mesmo mapa', () => {
    const doc = phoneDoc()
    const onDesktop = { ...fromConferenceDoc(doc, ROWS), labelingOk: true }
    const saved = buildConferencePayload({ ...onDesktop, revision: doc.revision }, ROWS, { actorName: 'Operador' })
    const backOnPhone = fromConferenceDoc({ ...saved, updatedAt: new Date() }, ROWS)
    expect(backOnPhone.unloadByUnit).toEqual(MAP)
    expect(backOnPhone.labelingOk).toBe(true)
  })

  it('o celular preserva o que o computador gravou (unidades, calculados e data) e o doc só do computador segue igual', () => {
    const desktopDoc = buildConferencePayload(
      { unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', labelingOk: true, revision: 1 },
      ROWS,
      { actorName: 'Op' }
    )
    const onPhone = fromConferenceDoc(desktopDoc, ROWS)
    const saved = buildConferencePayload({ ...onPhone, revision: desktopDoc.revision }, ROWS, { actorName: 'Op' })
    expect(saved).toMatchObject({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' })
    expect('unloadByUnit' in saved).toBe(false)
  })

  it('celular com conferência anterior: a 1ª unidade traz o horário antigo como "legado" e o calculado o inclui', () => {
    const oldState = fromConferenceDoc({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40' })
    const edited = patchCargoUnloadUnit(oldState, 'CNT-1', { startAt: `${D}08:00` })
    const saved = buildConferencePayload({ ...edited, revision: 1 }, ROWS, {})
    expect(saved.unloadByUnit).toEqual({
      legado: { startAt: '2026-11-24T08:15', endAt: '2026-11-24T10:40' },
      'CNT-1': { startAt: `${D}08:00`, endAt: '' },
    })
    expect(saved).toMatchObject({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' })
  })

  it('remover todas as unidades de um doc que já tinha a chave grava {} (a chave é pegajosa nas rules)', () => {
    const state = fromConferenceDoc(phoneDoc(), ROWS)
    let next = state
    for (const unitId of Object.keys(MAP)) next = patchCargoUnloadUnit(next, unitId, { startAt: '', endAt: '' })
    const saved = buildConferencePayload({ ...next, revision: 3 }, ROWS, {})
    expect(saved.unloadByUnit).toEqual({})
    expect(saved).toMatchObject({ unloadStartAt: '', unloadEndAt: '', receivedDate: '' })
  })
})

describe('validateCargoUnload: 24 h POR UNIDADE', () => {
  it('sem unidades, a regra de sempre sobre início/fim', () => {
    expect(validateCargoUnload({ unloadStartAt: `${D}09:00`, unloadEndAt: `${D}08:00` })).toEqual({
      start: '',
      end: 'O fim da descarga deve ser igual ou posterior ao início.',
    })
    expect(validateCargoUnload({ unloadStartAt: '', unloadEndAt: '' })).toEqual({ start: '', end: '' })
    expect(validateCargoUnload()).toEqual({ start: '', end: '' })
  })

  it('início em 27/11 numa unidade e fim em 28/11 em outra NÃO dá erro (o Salvar do computador não trava)', () => {
    const unloadByUnit = {
      'CNT-1': { startAt: '2026-11-27T08:00', endAt: '' },
      'CNT-2': { startAt: '2026-11-28T09:00', endAt: '2026-11-28T10:00' },
    }
    const payload = buildConferencePayload({ unloadByUnit, revision: 0 }, ROWS, {})
    expect(payload.unloadStartAt).toBe('2026-11-27T08:00')
    expect(payload.unloadEndAt).toBe('2026-11-28T10:00')
    // o par derivado passaria de 24 h; por unidade não passa
    expect(validateCargoUnload({ unloadStartAt: payload.unloadStartAt, unloadEndAt: payload.unloadEndAt })).toMatchObject({
      end: 'A descarga passa de 24 horas. Confira as datas.',
    })
    expect(validateCargoUnload({ ...payload })).toEqual({ start: '', end: '', byUnit: {} })
  })

  it('erro dentro de uma unidade barra: 1ª mensagem de cada campo e o erro por unidade', () => {
    const unloadByUnit = {
      'CNT-1': { startAt: `${D}10:00`, endAt: `${D}09:00` },
      'CNT-2': { startAt: '', endAt: `${D}09:00` },
      'CNT-3': { startAt: `${D}08:00`, endAt: '2026-11-29T08:00' },
    }
    const result = validateCargoUnload({ unloadByUnit, unloadStartAt: '', unloadEndAt: '' })
    expect(result.end).toBe('O fim da descarga deve ser igual ou posterior ao início.')
    expect(result.start).toBe('Informe o início da descarga.')
    expect(result.byUnit['CNT-3']).toEqual({ start: '', end: 'A descarga passa de 24 horas. Confira as datas.' })
  })
})
