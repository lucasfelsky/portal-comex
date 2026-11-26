// S10-I do Relatório de Carga: contador de pallets, total do COMEX, observação por item e status sugerido (módulo puro).
import { describe, expect, it } from 'vitest'
import {
  applyCargoIssueStatusSuggestion,
  cargoRowPallets,
  formatCargoPalletsSummary,
  hasCargoRowIssue,
  listCargoIssueRows,
  normalizeCargoPhoto,
  patchCargoRowIssue,
  readCargoRowIssue,
  readDamageMap,
  readExpectedPallets,
  readPalletsMap,
  setCargoRowPallets,
  stepCargoRowPallets,
  summarizeCargoPallets,
} from '../../src/features/processes/cargoConferenceIssues'
import { EMPTY_CARGO_CONFERENCE } from '../../src/features/processes/cargoConferenceModel'
import { createEmptyCargoReportRow } from '../../src/features/processes/cargoReportFormModel'

const rows = [
  { ...createEmptyCargoReportRow('r-1'), dbcorpCode: 'AD5240', quantityKg: 100 },
  { ...createEmptyCargoReportRow('r-2'), dbcorpCode: 'RE5116', quantityKg: 200 },
  { ...createEmptyCargoReportRow('r-3'), dbcorpCode: 'MO5190', quantityKg: 300 },
]
const photo = (id) => ({ id, path: `p/${id}.jpg`, thumbPath: `p/${id}-t.jpg`, width: 1600, height: 1200, size: 900, uploadedAt: 1, byId: 'u1' })

describe('contador por item', () => {
  it('"+" soma de 1 em 1, "−" volta e para em 0, e o teto é 999', () => {
    let conference = EMPTY_CARGO_CONFERENCE
    conference = stepCargoRowPallets(conference, 'r-1', 1)
    conference = stepCargoRowPallets(conference, 'r-1', 1)
    expect(cargoRowPallets(conference, 'r-1')).toEqual({ count: 2, legacyOk: false })
    conference = stepCargoRowPallets(conference, 'r-1', -1)
    expect(conference.palletsByRowId['r-1']).toBe(1)
    conference = stepCargoRowPallets(conference, 'r-1', -5)
    expect(conference.palletsByRowId['r-1']).toBe(0)
    expect(setCargoRowPallets(conference, 'r-1', 5000).palletsByRowId['r-1']).toBe(999)
    expect(setCargoRowPallets(conference, 'r-1', -3).palletsByRowId['r-1']).toBe(0)
    expect(setCargoRowPallets(conference, 'r-1', 4.9).palletsByRowId['r-1']).toBe(4)
    expect(EMPTY_CARGO_CONFERENCE.palletsByRowId).toEqual({})
  })

  it('0 gravado é diferente de nunca contado', () => {
    const zero = setCargoRowPallets(EMPTY_CARGO_CONFERENCE, 'r-1', 0)
    expect(cargoRowPallets(zero, 'r-1').count).toBe(0)
    expect(cargoRowPallets(EMPTY_CARGO_CONFERENCE, 'r-1').count).toBeNull()
  })

  it('setCargoRowPallets apaga o legado "Contagem OK" só da linha tocada', () => {
    const legacy = { ...EMPTY_CARGO_CONFERENCE, countOkByRowId: { 'r-1': true, 'r-2': true } }
    expect(cargoRowPallets(legacy, 'r-1')).toEqual({ count: null, legacyOk: true })
    const next = stepCargoRowPallets(legacy, 'r-1', 1)
    expect(next.countOkByRowId).toEqual({ 'r-2': true })
    expect(cargoRowPallets(next, 'r-1')).toEqual({ count: 1, legacyOk: false })
    expect(legacy.countOkByRowId).toEqual({ 'r-1': true, 'r-2': true })
  })

  it('readPalletsMap: inteiro 0..999, só linhas que existem, o resto sai', () => {
    const raw = { 'r-1': 3, 'r-2': 0, 'r-3': 1000, 'r-4': -1, 'r-5': 2.5, 'r-6': '7', 'r-7': null, 'r-orfa': 4 }
    expect(readPalletsMap(raw)).toEqual({ 'r-1': 3, 'r-2': 0, 'r-orfa': 4 })
    expect(readPalletsMap(raw, ['r-1', 'r-2'])).toEqual({ 'r-1': 3, 'r-2': 0 })
    expect(readPalletsMap(null)).toEqual({})
    expect(readPalletsMap([1, 2])).toEqual({})
  })
})

describe('total de pallets do COMEX', () => {
  it('readExpectedPallets: só inteiro 1..9999', () => {
    expect(readExpectedPallets(1)).toBe(1)
    expect(readExpectedPallets(9999)).toBe(9999)
    expect(readExpectedPallets(0)).toBeNull()
    expect(readExpectedPallets(10000)).toBeNull()
    expect(readExpectedPallets(2.5)).toBeNull()
    expect(readExpectedPallets('7')).toBeNull()
    expect(readExpectedPallets(null)).toBeNull()
    expect(readExpectedPallets(undefined)).toBeNull()
  })

  it('summarizeCargoPallets: soma só as linhas preenchidas e compara com o total', () => {
    const conference = { ...EMPTY_CARGO_CONFERENCE, palletsByRowId: { 'r-1': 2, 'r-2': 3, 'r-3': 1, 'r-vazia': 9 } }
    const withEmpty = [...rows, createEmptyCargoReportRow('r-vazia')]
    expect(summarizeCargoPallets(withEmpty, conference, 6)).toEqual({ counted: 6, expected: 6, state: 'confere', difference: 0 })
    expect(summarizeCargoPallets(withEmpty, conference, 8)).toEqual({ counted: 6, expected: 8, state: 'divergente', difference: -2 })
    expect(summarizeCargoPallets(withEmpty, conference, 4)).toEqual({ counted: 6, expected: 4, state: 'divergente', difference: 2 })
    expect(summarizeCargoPallets(withEmpty, conference, null)).toEqual({ counted: 6, expected: null, state: 'semTotal', difference: 0 })
  })

  it('nada contado com total informado é divergente (0 gravado ou sem entrada)', () => {
    expect(summarizeCargoPallets(rows, EMPTY_CARGO_CONFERENCE, 5).state).toBe('divergente')
    const zeros = { ...EMPTY_CARGO_CONFERENCE, palletsByRowId: { 'r-1': 0, 'r-2': 0, 'r-3': 0 } }
    expect(summarizeCargoPallets(rows, zeros, 5)).toMatchObject({ counted: 0, state: 'divergente', difference: -5 })
  })

  it('linha removida (fora de `rows`) não entra na soma', () => {
    const conference = { ...EMPTY_CARGO_CONFERENCE, palletsByRowId: { 'r-1': 2, 'r-removida': 40 } }
    expect(summarizeCargoPallets(rows, conference, 2).state).toBe('confere')
  })

  it('formatCargoPalletsSummary nos 3 estados (com e sem o selo no texto)', () => {
    expect(formatCargoPalletsSummary({ counted: 23, expected: 23, state: 'confere' })).toBe(
      'Pallets da carga: 23 contados de 23 informados pelo COMEX.'
    )
    expect(formatCargoPalletsSummary({ counted: 23, expected: 25, state: 'divergente' })).toBe(
      'Pallets da carga: 23 contados de 25 informados pelo COMEX. Divergente.'
    )
    expect(formatCargoPalletsSummary({ counted: 23, expected: 25, state: 'divergente' }, { withState: false })).toBe(
      'Pallets da carga: 23 contados de 25 informados pelo COMEX.'
    )
    expect(formatCargoPalletsSummary({ counted: 23, expected: null, state: 'semTotal' })).toBe(
      'Pallets da carga: 23 contados. Total não informado pelo COMEX.'
    )
    expect(formatCargoPalletsSummary({ counted: 1, expected: 1, state: 'confere' })).toBe(
      'Pallets da carga: 1 contado de 1 informado pelo COMEX.'
    )
  })
})

describe('observação (avaria / ressalva) por item', () => {
  it('readDamageMap: nota aparada e cortada em 1.000; sem nota e sem foto a entrada some (flagged é derivado)', () => {
    const map = readDamageMap({
      'r-1': { flagged: false, note: `  ${'a'.repeat(1001)}  `, photos: [] },
      'r-2': { flagged: false, note: '   ', photos: [] },
      'r-3': { flagged: true, note: '', photos: [] },
      'r-4': 'texto',
      'r-5': { note: 'x' },
      'r-6': { flagged: false, note: '', photos: [photo('f')] },
    })
    expect(map['r-1']).toMatchObject({ flagged: true })
    expect(map['r-1'].note).toHaveLength(1000)
    expect(map['r-2']).toBeUndefined()
    // Legado: `flagged: true` sem nota e sem foto é SEM avaria e sai do mapa.
    expect(map['r-3']).toBeUndefined()
    expect(map['r-4']).toBeUndefined()
    expect(map['r-5']).toEqual({ flagged: true, note: 'x', photos: [] })
    expect(map['r-6']).toEqual({ flagged: true, note: '', photos: [photo('f')] })
    expect(Object.keys(readDamageMap({ 'r-1': { note: 'a' }, 'r-2': { note: 'b' } }, ['r-2']))).toEqual(['r-2'])
  })

  it('readDamageMap: até 5 fotos válidas e sem id repetido', () => {
    const photos = [photo('a'), photo('b'), photo('b'), photo('c'), photo('d'), photo('e'), photo('f'), { ...photo('x y') }]
    const entry = readDamageMap({ 'r-1': { flagged: false, note: 'n', photos } })['r-1']
    expect(entry.photos.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(normalizeCargoPhoto({ ...photo('ok'), width: 0 })).toBeNull()
    expect(normalizeCargoPhoto({ ...photo('ok'), path: '' })).toBeNull()
    expect(normalizeCargoPhoto({ ...photo('ok'), path: 'a'.repeat(301) })).toBeNull()
    expect(normalizeCargoPhoto(photo('ok'))).toEqual(photo('ok'))
  })

  it('hasCargoRowIssue: só nota ou só foto contam (os dois também); nota em branco, nada e flag legado sozinho não', () => {
    const legacy = { ...EMPTY_CARGO_CONFERENCE, damageByRowId: { 'r-1': { flagged: true, note: '', photos: [] } } }
    expect(hasCargoRowIssue(legacy, 'r-1')).toBe(false)
    expect(readCargoRowIssue(legacy, 'r-1').flagged).toBe(false)
    const note = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { note: 'amassado' })
    expect(hasCargoRowIssue(note, 'r-1')).toBe(true)
    const withPhoto = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { photos: [photo('a')] })
    expect(hasCargoRowIssue(withPhoto, 'r-1')).toBe(true)
    const blank = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { note: '   ' })
    expect(hasCargoRowIssue(blank, 'r-1')).toBe(false)
    expect(blank.damageByRowId['r-1'].flagged).toBe(false)
    const both = patchCargoRowIssue(note, 'r-1', { photos: [photo('a')] })
    expect(hasCargoRowIssue(both, 'r-1')).toBe(true)
    expect(hasCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-9')).toBe(false)
  })

  it('patchCargoRowIssue deriva o flagged (nota ou foto) e ignora o que o chamador mandar', () => {
    const forced = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { flagged: true })
    expect(forced.damageByRowId).toEqual({})
    const noted = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { note: 'amassado', flagged: false })
    expect(noted.damageByRowId['r-1']).toEqual({ flagged: true, note: 'amassado', photos: [] })
    const photoOnly = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { photos: [photo('a')] })
    expect(photoOnly.damageByRowId['r-1'].flagged).toBe(true)
  })

  it('remover a última foto de um item sem nota derruba o flagged e tira a entrada; com nota, o flagged fica', () => {
    const withPhoto = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { photos: [photo('a')] })
    const removed = patchCargoRowIssue(withPhoto, 'r-1', { photos: [] })
    expect(removed.damageByRowId).toEqual({})
    expect(hasCargoRowIssue(removed, 'r-1')).toBe(false)
    const withNote = patchCargoRowIssue(withPhoto, 'r-1', { note: 'molhado' })
    const keep = patchCargoRowIssue(withNote, 'r-1', { photos: [] })
    expect(keep.damageByRowId['r-1']).toEqual({ flagged: true, note: 'molhado', photos: [] })
    const apagada = patchCargoRowIssue(keep, 'r-1', { note: '' })
    expect(apagada.damageByRowId).toEqual({})
  })

  it('patchCargoRowIssue mescla, não muta e tira a entrada que fica vazia', () => {
    const noted = patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-1', { note: 'abc ' })
    expect(noted.damageByRowId['r-1']).toEqual({ flagged: true, note: 'abc ', photos: [] })
    const both = patchCargoRowIssue(noted, 'r-1', { photos: [photo('a')] })
    expect(both.damageByRowId['r-1']).toEqual({ flagged: true, note: 'abc ', photos: [photo('a')] })
    const cleared = patchCargoRowIssue(patchCargoRowIssue(both, 'r-1', { note: '' }), 'r-1', { photos: [] })
    expect(cleared.damageByRowId).toEqual({})
    expect(EMPTY_CARGO_CONFERENCE.damageByRowId).toEqual({})
  })

  it('listCargoIssueRows devolve só as linhas preenchidas com avaria', () => {
    const conference = patchCargoRowIssue(
      patchCargoRowIssue(EMPTY_CARGO_CONFERENCE, 'r-2', { note: 'molhado' }),
      'r-vazia',
      { note: 'x' }
    )
    const list = listCargoIssueRows([...rows, createEmptyCargoReportRow('r-vazia')], conference)
    expect(list.map((row) => row.id)).toEqual(['r-2'])
  })
})

describe('status sugerido pela avaria', () => {
  const withIssue = (conference) => patchCargoRowIssue(conference, 'r-1', { note: 'Caixa amassada' })

  it('status vazio + 1ª avaria -> "Com ressalva"', () => {
    const result = applyCargoIssueStatusSuggestion(EMPTY_CARGO_CONFERENCE, withIssue(EMPTY_CARGO_CONFERENCE))
    expect(result.suggested).toBe(true)
    expect(result.conference.receiptStatus).toBe('com_ressalva')
  })

  it('"Sem ressalva" escolhido não muda sozinho', () => {
    const base = { ...EMPTY_CARGO_CONFERENCE, receiptStatus: 'sem_ressalva' }
    const result = applyCargoIssueStatusSuggestion(base, withIssue(base))
    expect(result.suggested).toBe(false)
    expect(result.conference.receiptStatus).toBe('sem_ressalva')
  })

  it('"Com ressalva" já escolhido fica; a 2ª avaria não sugere de novo', () => {
    const base = { ...EMPTY_CARGO_CONFERENCE, receiptStatus: 'com_ressalva' }
    expect(applyCargoIssueStatusSuggestion(base, withIssue(base)).suggested).toBe(false)
    const first = withIssue(EMPTY_CARGO_CONFERENCE)
    const second = patchCargoRowIssue(first, 'r-2', { photos: [photo('b')] })
    const result = applyCargoIssueStatusSuggestion(first, second)
    expect(result.suggested).toBe(false)
    expect(result.conference.receiptStatus).toBe('')
  })
})
