// Fatia C: descarga por unidade (módulo puro). Dados inventados (repositório público).
import { describe, expect, it } from 'vitest'
import {
  cargoUnloadUnitState,
  deriveCargoUnloadBounds,
  formatCargoDuration,
  listCargoUnloadUnits,
  patchCargoUnloadUnit,
  readCargoUnloadView,
  readUnloadByUnit,
  removeCargoUnloadUnit,
  summarizeCargoUnload,
  toCargoDateTimeKeyLocal,
  validateCargoUnloadByUnit,
  validateCargoUnloadUnit,
} from '../../src/features/processes/cargoConferenceUnload'

const D = '2026-11-27T'
const FCL = {
  category: 'FCL',
  containers: [
    { id: 'CNT-1', number: 'DMOU1234560', type: '40HC' },
    { id: 'CNT-2', number: 'DMOU7654321', type: '40HC' },
    { id: 'CNT-3', number: 'DMOU2468135', type: '20DC' },
  ],
}
const CONFERENCE = {
  unloadByUnit: {},
  unloadStartAt: '',
  unloadEndAt: '',
  receivedDate: '',
}
const THREE = {
  'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
  'CNT-2': { startAt: `${D}09:20`, endAt: `${D}10:30` },
  'CNT-3': { startAt: `${D}10:50`, endAt: `${D}11:30` },
}

describe('listCargoUnloadUnits', () => {
  it('FCL: um por contêiner, na ordem do processo, com número e tipo', () => {
    expect(listCargoUnloadUnits(FCL, {})).toEqual([
      { id: 'CNT-1', title: 'Contêiner 1 · DMOU1234560', subtitle: "40' High Cube", kind: 'container' },
      { id: 'CNT-2', title: 'Contêiner 2 · DMOU7654321', subtitle: "40' High Cube", kind: 'container' },
      { id: 'CNT-3', title: 'Contêiner 3 · DMOU2468135', subtitle: "20' Dry", kind: 'container' },
    ])
  })

  it('CONSOLIDADO também; contêiner sem número e sem tipo', () => {
    const units = listCargoUnloadUnits({ category: 'CONSOLIDADO', containers: [{ id: 'CNT-9' }] }, {})
    expect(units).toEqual([{ id: 'CNT-9', title: 'Contêiner 1', subtitle: 'Tipo não informado', kind: 'container' }])
  })

  it('FCL sem containers[] expande pela quantidade (ids CNT-1..N, como o repositório)', () => {
    const units = listCargoUnloadUnits({ category: 'FCL', containerQuantity: 2 }, {})
    expect(units.map((unit) => unit.id)).toEqual(['CNT-1', 'CNT-2'])
  })

  it('LCL, AÉREO e processo sem contêiner: "Descarga única" (unica)', () => {
    for (const category of ['LCL', 'AEREO']) {
      expect(listCargoUnloadUnits({ category }, {})).toEqual([
        {
          id: 'unica',
          title: 'Descarga única',
          subtitle: 'Sem contêiner no processo (LCL ou aéreo)',
          kind: 'unica',
        },
      ])
    }
    expect(listCargoUnloadUnits(null, {}).map((unit) => unit.id)).toEqual(['unica'])
  })

  it('unidade gravada que saiu do processo nunca some: vem depois, como "Unidade fora do processo"', () => {
    const map = { 'CNT-2': THREE['CNT-2'], 'CNT-X': { startAt: `${D}07:00`, endAt: '' } }
    const units = listCargoUnloadUnits({ category: 'FCL', containers: [FCL.containers[0]] }, map)
    expect(units.map((unit) => [unit.id, unit.kind, unit.title])).toEqual([
      ['CNT-1', 'container', 'Contêiner 1 · DMOU1234560'],
      ['CNT-2', 'orphan', 'Unidade fora do processo 1'],
      ['CNT-X', 'orphan', 'Unidade fora do processo 2'],
    ])
    const single = listCargoUnloadUnits({ category: 'LCL' }, { 'CNT-1': THREE['CNT-1'] })
    expect(single.map((unit) => [unit.id, unit.kind, unit.title])).toEqual([
      ['unica', 'unica', 'Descarga única'],
      ['CNT-1', 'orphan', 'Unidade fora do processo'],
    ])
  })

  it('"unica" gravada num processo que agora tem contêineres vira órfã', () => {
    const units = listCargoUnloadUnits(FCL, { unica: { startAt: `${D}08:00`, endAt: '' } })
    expect(units.at(-1)).toMatchObject({ id: 'unica', kind: 'orphan' })
  })

  it('registro anterior (legado) vai por último, depois das órfãs', () => {
    const map = { 'CNT-X': { startAt: `${D}07:00`, endAt: '' }, legado: { startAt: `${D}06:00`, endAt: `${D}06:30` } }
    const units = listCargoUnloadUnits(FCL, map)
    expect(units.map((unit) => unit.kind)).toEqual(['container', 'container', 'container', 'orphan', 'legado'])
    expect(units.at(-1).title).toBe('Registro anterior (sem unidade)')
    expect(listCargoUnloadUnits(FCL, {}, { legacy: true }).at(-1).id).toBe('legado')
    expect(listCargoUnloadUnits(FCL, {}).some((unit) => unit.id === 'legado')).toBe(false)
  })
})

describe('readUnloadByUnit (poda)', () => {
  it('não-mapa vira {}; entrada vazia, inválida ou de id ruim sai', () => {
    for (const value of [null, undefined, [], 'x', 3]) expect(readUnloadByUnit(value)).toEqual({})
    expect(
      readUnloadByUnit({
        a: { startAt: '', endAt: '' },
        b: { startAt: 'ontem', endAt: 'hoje' },
        c: 'texto',
        d: null,
        '': { startAt: `${D}08:00`, endAt: '' },
        ['x'.repeat(65)]: { startAt: `${D}08:00`, endAt: '' },
        __bad__: { startAt: `${D}08:00`, endAt: '' },
        ok1: { startAt: `${D}08:00:30`, endAt: '' },
        ok2: { startAt: '', endAt: `${D}09:00` },
      })
    ).toEqual({ ok1: { startAt: `${D}08:00`, endAt: '' }, ok2: { startAt: '', endAt: `${D}09:00` } })
  })

  it('chave __proto__ não polui o resultado', () => {
    const value = JSON.parse(`{"__proto__":{"startAt":"${D}08:00","endAt":""},"a":{"startAt":"${D}08:00","endAt":""}}`)
    const result = readUnloadByUnit(value)
    expect(Object.keys(result)).toEqual(['a'])
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it('até 50 entradas', () => {
    const big = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`u${i}`, { startAt: `${D}08:00`, endAt: '' }]))
    expect(Object.keys(readUnloadByUnit(big))).toHaveLength(50)
  })
})

describe('validação por unidade (24 h POR unidade)', () => {
  it('fim sem início: erro no Início; fim antes do início e mais de 24 h: erro no Fim', () => {
    expect(validateCargoUnloadUnit({ startAt: '', endAt: `${D}09:00` })).toEqual({
      start: 'Informe o início da descarga.',
      end: '',
    })
    expect(validateCargoUnloadUnit({ startAt: `${D}09:00`, endAt: `${D}08:00` }).end).toBe(
      'O fim da descarga deve ser igual ou posterior ao início.'
    )
    expect(validateCargoUnloadUnit({ startAt: `${D}09:00`, endAt: '2026-11-28T09:01' }).end).toBe(
      'A descarga passa de 24 horas. Confira as datas.'
    )
    expect(validateCargoUnloadUnit({ startAt: `${D}09:00`, endAt: '2026-11-28T09:00' })).toEqual({ start: '', end: '' })
    expect(validateCargoUnloadUnit({ startAt: `${D}09:00`, endAt: '' })).toEqual({ start: '', end: '' })
    expect(validateCargoUnloadUnit({})).toEqual({ start: '', end: '' })
  })

  it('o mapa valida unidade por unidade: dias diferentes ENTRE unidades não é erro', () => {
    const map = {
      'CNT-1': { startAt: '2026-11-27T08:00', endAt: '' },
      'CNT-2': { startAt: '2026-11-28T10:00', endAt: '2026-11-28T11:00' },
    }
    expect(validateCargoUnloadByUnit(map)).toEqual({ start: '', end: '', byUnit: {} })
  })

  it('devolve a 1ª mensagem de cada campo e o erro de cada unidade; sem entradas, null', () => {
    const map = {
      a: { startAt: `${D}10:00`, endAt: `${D}09:00` },
      b: { startAt: '', endAt: `${D}09:00` },
      c: { startAt: `${D}10:00`, endAt: '2026-11-29T10:00' },
    }
    const result = validateCargoUnloadByUnit(map)
    expect(result.start).toBe('Informe o início da descarga.')
    expect(result.end).toBe('O fim da descarga deve ser igual ou posterior ao início.')
    expect(Object.keys(result.byUnit)).toEqual(['a', 'b', 'c'])
    expect(validateCargoUnloadByUnit({})).toBeNull()
    expect(validateCargoUnloadByUnit(undefined)).toBeNull()
  })
})

describe('cargoUnloadUnitState', () => {
  const now = { nowKey: `${D}11:40` }

  it('vazio, em andamento (minutos até agora), sem fim (fechada), erro e ok', () => {
    expect(cargoUnloadUnitState(undefined, now)).toEqual({ state: 'vazio' })
    expect(cargoUnloadUnitState({ startAt: '', endAt: '' }, now)).toEqual({ state: 'vazio' })
    expect(cargoUnloadUnitState({ startAt: `${D}10:50`, endAt: '' }, now)).toEqual({ state: 'andamento', minutes: 50 })
    expect(cargoUnloadUnitState({ startAt: `${D}10:50`, endAt: '' }, { ...now, closed: true })).toEqual({ state: 'semFim' })
    expect(cargoUnloadUnitState({ startAt: `${D}08:10`, endAt: `${D}09:35` }, now)).toEqual({ state: 'ok', minutes: 85 })
    expect(cargoUnloadUnitState({ startAt: '', endAt: `${D}09:35` }, now)).toMatchObject({ state: 'erro', field: 'start' })
    expect(cargoUnloadUnitState({ startAt: `${D}10:00`, endAt: `${D}09:00` }, now)).toMatchObject({
      state: 'erro',
      field: 'end',
      message: 'O fim da descarga deve ser igual ou posterior ao início.',
    })
    expect(cargoUnloadUnitState({ startAt: `${D}08:00`, endAt: '2026-11-29T08:00' }, now)).toMatchObject({
      state: 'erro',
      field: 'end',
      message: 'A descarga passa de 24 horas. Confira as datas.',
    })
  })

  it('início no futuro não dá minutos negativos', () => {
    expect(cargoUnloadUnitState({ startAt: `${D}12:00`, endAt: '' }, now)).toEqual({ state: 'andamento', minutes: 0 })
  })
})

describe('summarizeCargoUnload', () => {
  const units = listCargoUnloadUnits(FCL, {})
  const now = { nowKey: `${D}11:40` }

  it('3 finalizadas com sobreposição e intervalo: soma 195, corrido 180', () => {
    expect(summarizeCargoUnload(units, THREE, now)).toEqual({
      sumMinutes: 195,
      wallMinutes: 180,
      overlap: true,
      running: 0,
      withoutEnd: 0,
      finished: 3,
      firstStart: `${D}08:10`,
      lastEnd: `${D}11:30`,
    })
  })

  it('uma em andamento fica fora do total: 155 min, corrido 140, "1 em andamento"', () => {
    const map = { ...THREE, 'CNT-3': { startAt: `${D}10:50`, endAt: '' } }
    expect(summarizeCargoUnload(units, map, now)).toMatchObject({
      sumMinutes: 155,
      wallMinutes: 140,
      overlap: true,
      running: 1,
      finished: 2,
      lastEnd: `${D}10:30`,
    })
  })

  it('conferência fechada: a unidade sem fim conta como "sem fim", não como em andamento', () => {
    const map = { ...THREE, 'CNT-3': { startAt: `${D}10:50`, endAt: '' } }
    expect(summarizeCargoUnload(units, map, { ...now, closed: true })).toMatchObject({ running: 0, withoutEnd: 1, finished: 2 })
  })

  it('sem sobreposição (intervalos que só se encostam não contam): sem tempo corrido destacado', () => {
    const map = {
      'CNT-1': { startAt: `${D}08:00`, endAt: `${D}09:00` },
      'CNT-2': { startAt: `${D}09:00`, endAt: `${D}10:00` },
    }
    const result = summarizeCargoUnload(units, map, now)
    expect(result).toMatchObject({ sumMinutes: 120, wallMinutes: 120, overlap: false })
  })

  it('erro e vazio não entram; o primeiro início vale para qualquer unidade com início', () => {
    const map = {
      'CNT-1': { startAt: `${D}07:00`, endAt: `${D}06:00` },
      'CNT-2': { startAt: `${D}09:00`, endAt: `${D}09:30` },
    }
    expect(summarizeCargoUnload(units, map, now)).toMatchObject({
      sumMinutes: 30,
      finished: 1,
      firstStart: `${D}07:00`,
      lastEnd: `${D}09:30`,
    })
    expect(summarizeCargoUnload(units, {}, now)).toMatchObject({ sumMinutes: 0, finished: 0, firstStart: '', lastEnd: '' })
  })

  it('unidade em dias diferentes soma cada uma (a de virada de dia incluída)', () => {
    const map = {
      'CNT-1': { startAt: '2026-11-27T23:00', endAt: '2026-11-28T01:00' },
      'CNT-2': { startAt: '2026-11-28T08:00', endAt: '2026-11-28T09:00' },
    }
    expect(summarizeCargoUnload(units, map, now)).toMatchObject({ sumMinutes: 180, wallMinutes: 180, overlap: false })
  })
})

describe('deriveCargoUnloadBounds (o que o Excel e a impressão leem)', () => {
  it('menor início e maior fim: 08:10 a 11:30 (200 min), nunca a soma', () => {
    expect(deriveCargoUnloadBounds(THREE)).toEqual({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}11:30` })
  })

  it('em andamento entra no início e sai do fim', () => {
    const map = { ...THREE, 'CNT-3': { startAt: `${D}10:50`, endAt: '' } }
    expect(deriveCargoUnloadBounds(map)).toEqual({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}10:30` })
    expect(deriveCargoUnloadBounds({ a: { startAt: `${D}08:10`, endAt: '' } })).toEqual({
      unloadStartAt: `${D}08:10`,
      unloadEndAt: '',
    })
  })

  it('fim inválido (antes do início ou mais de 24 h) nunca vira o fim calculado; mapa vazio = vazio', () => {
    const map = {
      a: { startAt: `${D}09:00`, endAt: `${D}08:00` },
      b: { startAt: `${D}09:00`, endAt: '2026-11-29T09:00' },
      c: { startAt: '', endAt: `${D}23:00` },
    }
    expect(deriveCargoUnloadBounds(map)).toEqual({ unloadStartAt: `${D}09:00`, unloadEndAt: '' })
    expect(deriveCargoUnloadBounds({})).toEqual({ unloadStartAt: '', unloadEndAt: '' })
    expect(deriveCargoUnloadBounds(undefined)).toEqual({ unloadStartAt: '', unloadEndAt: '' })
  })

  it('unidades em dias diferentes: o fim é o maior de todos', () => {
    const map = {
      a: { startAt: '2026-11-27T23:00', endAt: '2026-11-28T01:00' },
      b: { startAt: '2026-11-28T08:00', endAt: '2026-11-28T09:00' },
    }
    expect(deriveCargoUnloadBounds(map)).toEqual({ unloadStartAt: '2026-11-27T23:00', unloadEndAt: '2026-11-28T09:00' })
  })
})

describe('patchCargoUnloadUnit / removeCargoUnloadUnit', () => {
  it('grava a unidade e recalcula início, fim e data de recebimento na conferência', () => {
    let next = patchCargoUnloadUnit(CONFERENCE, 'CNT-1', { startAt: `${D}08:10` })
    expect(next).toMatchObject({
      unloadByUnit: { 'CNT-1': { startAt: `${D}08:10`, endAt: '' } },
      unloadStartAt: `${D}08:10`,
      unloadEndAt: '',
      receivedDate: '2026-11-27',
    })
    next = patchCargoUnloadUnit(next, 'CNT-1', { endAt: `${D}09:35` })
    expect(next).toMatchObject({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}09:35`, receivedDate: '2026-11-27' })
    next = patchCargoUnloadUnit(next, 'CNT-2', { startAt: `${D}07:50` })
    expect(next).toMatchObject({ unloadStartAt: `${D}07:50`, unloadEndAt: `${D}09:35`, receivedDate: '2026-11-27' })
  })

  it('não muda o resto da conferência nem a original', () => {
    const base = { ...CONFERENCE, labelingOk: true, nfNumber: '123' }
    const next = patchCargoUnloadUnit(base, 'CNT-1', { startAt: `${D}08:10` })
    expect(next).toMatchObject({ labelingOk: true, nfNumber: '123' })
    expect(base.unloadByUnit).toEqual({})
  })

  it('apagar os dois campos poda a entrada; o mapa vazio zera início, fim e data', () => {
    let next = patchCargoUnloadUnit(CONFERENCE, 'CNT-1', { startAt: `${D}08:10`, endAt: `${D}09:00` })
    next = patchCargoUnloadUnit(next, 'CNT-1', { startAt: '', endAt: '' })
    expect(next).toMatchObject({ unloadByUnit: {}, unloadStartAt: '', unloadEndAt: '', receivedDate: '' })
  })

  it('só o fim (sem início) é mantido, para o erro aparecer (D-C3)', () => {
    const next = patchCargoUnloadUnit(CONFERENCE, 'CNT-1', { endAt: `${D}09:00` })
    expect(next.unloadByUnit).toEqual({ 'CNT-1': { startAt: '', endAt: `${D}09:00` } })
    expect(next.unloadEndAt).toBe('')
  })

  it('valor inválido vira vazio; id inválido não faz nada; o 51º não entra', () => {
    expect(patchCargoUnloadUnit(CONFERENCE, 'CNT-1', { startAt: 'abc' }).unloadByUnit).toEqual({})
    expect(patchCargoUnloadUnit(CONFERENCE, '', { startAt: `${D}08:00` })).toBe(CONFERENCE)
    const full = {
      ...CONFERENCE,
      unloadByUnit: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`u${i}`, { startAt: `${D}08:00`, endAt: '' }])),
    }
    expect(patchCargoUnloadUnit(full, 'novo', { startAt: `${D}08:00` })).toBe(full)
    expect(Object.keys(patchCargoUnloadUnit(full, 'u1', { endAt: `${D}09:00` }).unloadByUnit)).toHaveLength(50)
  })

  it('conferência anterior: a 1ª edição leva o início/fim antigo para "legado" (D-5)', () => {
    const old = { ...CONFERENCE, unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' }
    expect(readCargoUnloadView(old)).toEqual({ legado: { startAt: '2026-11-24T08:15', endAt: '2026-11-24T10:40' } })
    const next = patchCargoUnloadUnit(old, 'CNT-1', { startAt: '2026-11-27T08:00' })
    expect(next.unloadByUnit).toEqual({
      legado: { startAt: '2026-11-24T08:15', endAt: '2026-11-24T10:40' },
      'CNT-1': { startAt: '2026-11-27T08:00', endAt: '' },
    })
    // o legado fica entre os calculados enquanto existir
    expect(next).toMatchObject({
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      receivedDate: '2026-11-24',
    })
    expect(readCargoUnloadView(next)).toEqual(next.unloadByUnit)
  })

  it('"Remover horários": tira a unidade e recalcula; sem nada, zera (inclusive o legado ainda não materializado)', () => {
    const withTwo = patchCargoUnloadUnit(patchCargoUnloadUnit(CONFERENCE, 'CNT-1', { startAt: `${D}08:10`, endAt: `${D}09:00` }), 'CNT-X', {
      startAt: `${D}07:00`,
      endAt: `${D}07:30`,
    })
    const removed = removeCargoUnloadUnit(withTwo, 'CNT-X')
    expect(removed).toMatchObject({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}09:00` })
    expect(Object.keys(removed.unloadByUnit)).toEqual(['CNT-1'])
    const old = { ...CONFERENCE, unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' }
    expect(removeCargoUnloadUnit(old, 'legado')).toMatchObject({
      unloadByUnit: {},
      unloadStartAt: '',
      unloadEndAt: '',
      receivedDate: '',
    })
  })
})

describe('formatCargoDuration', () => {
  it('formata horas e minutos; sem valor, travessão', () => {
    expect(formatCargoDuration(85)).toBe('1 h 25 min')
    expect(formatCargoDuration(45)).toBe('45 min')
    expect(formatCargoDuration(120)).toBe('2 h')
    expect(formatCargoDuration(155)).toBe('2 h 35 min')
    expect(formatCargoDuration(0)).toBe('0 min')
    expect(formatCargoDuration(null)).toBe('—')
    expect(formatCargoDuration(Number.NaN)).toBe('—')
    expect(formatCargoDuration(undefined)).toBe('—')
  })
})

describe('toCargoDateTimeKeyLocal', () => {
  it('usa os getters LOCAIS (hora de parede do aparelho), nunca o UTC', () => {
    expect(toCargoDateTimeKeyLocal(new Date(2026, 10, 27, 11, 40, 59))).toBe('2026-11-27T11:40')
    expect(toCargoDateTimeKeyLocal(new Date(2026, 0, 5, 0, 7))).toBe('2026-01-05T00:07')
    // 23:30 local no fim do ano: o dia local não vira o do UTC
    expect(toCargoDateTimeKeyLocal(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31T23:30')
  })
})
