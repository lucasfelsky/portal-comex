// S9-F do Relatório de Carga: regras da conferência compartilhadas entre o computador e o celular (módulo puro).
import { describe, expect, it } from 'vitest'
import {
  EMPTY_CARGO_CONFERENCE,
  cargoConferenceKey,
  isCargoRowConferred,
  listCargoConferencePendings,
  markAllCargoRowsOk,
  setCargoConferenceLabel,
  summarizeCargoConferenceProgress,
  toggleCargoConferenceFlag,
} from '../../src/features/processes/cargoConferenceModel'
import { CARGO_CONFERENCE_STATUS, createEmptyCargoReportRow } from '../../src/features/processes/cargoReportFormModel'

const rows = [
  { ...createEmptyCargoReportRow('r-1'), dbcorpCode: 'AD5240', quantityKg: 100 },
  { ...createEmptyCargoReportRow('r-2'), dbcorpCode: 'RE5116', quantityKg: 200 },
  { ...createEmptyCargoReportRow('r-3'), dbcorpCode: 'MO5190', quantityKg: 300 },
]

describe('estado vazio e chave de "sujo"', () => {
  it('EMPTY_CARGO_CONFERENCE tem as 19 chaves da conferência lida, aberta e vazia', () => {
    expect(Object.keys(EMPTY_CARGO_CONFERENCE)).toHaveLength(19)
    expect(EMPTY_CARGO_CONFERENCE).toMatchObject({
      revision: 0,
      status: CARGO_CONFERENCE_STATUS.open,
      okByRowId: {},
      countOkByRowId: {},
      labelsByRowId: {},
      nfNumber: '',
      labelingOk: false,
      updatedAt: null,
    })
  })

  it('a chave ignora metadados de leitura e "Conferido por", mas enxerga as marcas e o recebimento', () => {
    const base = { ...EMPTY_CARGO_CONFERENCE }
    const key = cargoConferenceKey(base, rows)
    expect(cargoConferenceKey({ ...base, checkedByName: 'Fulano', updatedByName: 'X', updatedAt: new Date(), revision: 9 }, rows)).toBe(key)
    expect(cargoConferenceKey({ ...base, okByRowId: { 'r-1': true } }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, countOkByRowId: { 'r-2': true } }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, labelsByRowId: { 'r-1': { wms: 'W1', sq: '' } } }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, nfNumber: '48213' }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, labelingOk: true }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, unloadStartAt: '2026-11-24T08:00' }, rows)).not.toBe(key)
    // Espaços nas pontas não sujam: a gravação os remove.
    expect(cargoConferenceKey({ ...base, notes: '   ', nfNumber: ' ' }, rows)).toBe(key)
  })

  it('a chave é a mesma de antes (formato fixo) para os mesmos dados', () => {
    const conference = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': true },
      labelsByRowId: { 'r-1': { wms: ' W1 ', sq: 'S1' } },
      receiptStatus: 'sem_ressalva',
      nfNumber: '48213; 48214',
    }
    expect(cargoConferenceKey(conference, rows.slice(0, 1))).toBe(
      JSON.stringify({
        marks: [['r-1', true, false, 'W1', 'S1']],
        receiptStatus: 'sem_ressalva',
        receivedDate: '',
        unloadStartAt: '',
        unloadEndAt: '',
        labelingOk: false,
        nfNumber: '48213; 48214',
        notes: '',
      })
    )
  })
})

describe('marcas por linha', () => {
  it('toggleCargoConferenceFlag alterna só a linha pedida e não muta', () => {
    const base = { ...EMPTY_CARGO_CONFERENCE, okByRowId: { 'r-2': true } }
    const once = toggleCargoConferenceFlag(base, 'okByRowId', 'r-1')
    expect(once.okByRowId).toEqual({ 'r-2': true, 'r-1': true })
    expect(base.okByRowId).toEqual({ 'r-2': true })
    expect(toggleCargoConferenceFlag(once, 'okByRowId', 'r-1').okByRowId['r-1']).toBe(false)
    expect(toggleCargoConferenceFlag(base, 'countOkByRowId', 'r-1').countOkByRowId).toEqual({ 'r-1': true })
  })

  it('setCargoConferenceLabel mantém a outra etiqueta da linha', () => {
    const wms = setCargoConferenceLabel(EMPTY_CARGO_CONFERENCE, 'r-1', 'wms', 'W-1')
    expect(wms.labelsByRowId['r-1']).toEqual({ wms: 'W-1', sq: '' })
    const both = setCargoConferenceLabel(wms, 'r-1', 'sq', 'S-1')
    expect(both.labelsByRowId['r-1']).toEqual({ wms: 'W-1', sq: 'S-1' })
    expect(EMPTY_CARGO_CONFERENCE.labelsByRowId).toEqual({})
  })

  it('markAllCargoRowsOk marca OK? e Contagem em todas as linhas e deixa as etiquetas', () => {
    const base = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': false },
      labelsByRowId: { 'r-1': { wms: 'W', sq: 'S' } },
    }
    const next = markAllCargoRowsOk(base, rows)
    expect(next.okByRowId).toEqual({ 'r-1': true, 'r-2': true, 'r-3': true })
    expect(next.countOkByRowId).toEqual({ 'r-1': true, 'r-2': true, 'r-3': true })
    expect(next.labelsByRowId).toBe(base.labelsByRowId)
    expect(base.okByRowId['r-1']).toBe(false)
  })
})

describe('progresso', () => {
  it('linha conferida = OK? e Contagem (só um dos dois não conta)', () => {
    const conference = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': true, 'r-2': true },
      countOkByRowId: { 'r-1': true, 'r-3': true },
    }
    expect(isCargoRowConferred(conference, 'r-1')).toBe(true)
    expect(isCargoRowConferred(conference, 'r-2')).toBe(false)
    expect(isCargoRowConferred(conference, 'r-3')).toBe(false)
    expect(summarizeCargoConferenceProgress(rows, conference)).toEqual({ done: 1, total: 3 })
    expect(summarizeCargoConferenceProgress([], conference)).toEqual({ done: 0, total: 0 })
  })
})

describe('pendências do fechamento', () => {
  it('vazia: todas as pendências, com os textos de sempre (e o Nº da NF)', () => {
    expect(listCargoConferencePendings(rows, EMPTY_CARGO_CONFERENCE)).toEqual([
      '3 linhas sem OK?',
      '3 linhas sem contagem',
      'Status do recebimento não informado',
      'Início da descarga não informado',
      'Etiquetagem sem OK',
      'Nº da NF não informado',
    ])
  })

  it('o computador junta com ", " (texto idêntico ao de hoje)', () => {
    expect(listCargoConferencePendings(rows.slice(0, 1), EMPTY_CARGO_CONFERENCE).join(', ')).toBe(
      '1 linha sem OK?, 1 linha sem contagem, Status do recebimento não informado, Início da descarga não informado, Etiquetagem sem OK, Nº da NF não informado'
    )
  })

  it('início sem fim pede o fim; tudo preenchido não deixa pendência; linha vazia não conta', () => {
    const base = {
      ...EMPTY_CARGO_CONFERENCE,
      receiptStatus: 'sem_ressalva',
      unloadStartAt: '2026-11-24T08:00',
      labelingOk: true,
      nfNumber: '48213',
    }
    expect(listCargoConferencePendings([], base)).toEqual(['Fim da descarga não informado'])
    const done = {
      ...base,
      unloadEndAt: '2026-11-24T09:00',
      okByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
      countOkByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
    }
    expect(listCargoConferencePendings([...rows, createEmptyCargoReportRow('r-vazia')], done)).toEqual([])
  })
})
