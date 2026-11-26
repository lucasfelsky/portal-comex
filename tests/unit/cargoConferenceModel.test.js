// S9-F do Relatório de Carga: regras da conferência compartilhadas entre o computador e o celular (módulo puro).
// S10-I: pallets por item, divergência x total do COMEX, avaria por item e o bloqueio do fechamento.
import { describe, expect, it } from 'vitest'
import {
  EMPTY_CARGO_CONFERENCE,
  cargoConferenceKey,
  describeCargoRow,
  evaluateCargoConferenceClose,
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
  it('EMPTY_CARGO_CONFERENCE tem as 21 chaves da conferência lida, aberta e vazia', () => {
    expect(Object.keys(EMPTY_CARGO_CONFERENCE)).toHaveLength(21)
    expect(EMPTY_CARGO_CONFERENCE).toMatchObject({
      revision: 0,
      status: CARGO_CONFERENCE_STATUS.open,
      okByRowId: {},
      countOkByRowId: {},
      palletsByRowId: {},
      damageByRowId: {},
      labelsByRowId: {},
      nfNumber: '',
      labelingOk: false,
      updatedAt: null,
    })
  })

  it('a chave ignora metadados de leitura e "Conferido por", mas enxerga as marcas, os pallets, a avaria e o recebimento', () => {
    const base = { ...EMPTY_CARGO_CONFERENCE }
    const key = cargoConferenceKey(base, rows)
    const meta = { checkedByName: 'Fulano', updatedByName: 'X', updatedAt: new Date(), revision: 9 }
    expect(cargoConferenceKey({ ...base, ...meta }, rows)).toBe(key)
    expect(cargoConferenceKey({ ...base, okByRowId: { 'r-1': true } }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, countOkByRowId: { 'r-2': true } }, rows)).not.toBe(key)
    // Pallets: muda com o número e 0 gravado é diferente de nunca contado.
    expect(cargoConferenceKey({ ...base, palletsByRowId: { 'r-2': 3 } }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, palletsByRowId: { 'r-2': 0 } }, rows)).not.toBe(key)
    // Avaria = nota ou foto: o `flagged` legado sozinho (sem nota e sem foto) não suja a chave.
    const flagged = { 'r-1': { flagged: true, note: '', photos: [] } }
    const noted = { 'r-1': { flagged: true, note: 'amassado', photos: [] } }
    const photoOnly = { 'r-1': { flagged: true, note: '', photos: [{ id: 'p1' }] } }
    expect(cargoConferenceKey({ ...base, damageByRowId: flagged }, rows)).toBe(key)
    expect(cargoConferenceKey({ ...base, damageByRowId: noted }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, damageByRowId: photoOnly }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, labelsByRowId: { 'r-1': { wms: 'W1', sq: '' } } }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, nfNumber: '48213' }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, labelingOk: true }, rows)).not.toBe(key)
    expect(cargoConferenceKey({ ...base, unloadStartAt: '2026-11-24T08:00' }, rows)).not.toBe(key)
    // Espaços nas pontas não sujam: a gravação os remove.
    expect(cargoConferenceKey({ ...base, notes: '   ', nfNumber: ' ' }, rows)).toBe(key)
    const blank = { 'r-1': { flagged: false, note: '  ', photos: [] } }
    expect(cargoConferenceKey({ ...base, damageByRowId: blank }, rows)).toBe(key)
  })

  it('a chave tem formato fixo para os mesmos dados', () => {
    const conference = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': true },
      labelsByRowId: { 'r-1': { wms: ' W1 ', sq: 'S1' } },
      receiptStatus: 'sem_ressalva',
      nfNumber: '48213; 48214',
    }
    expect(cargoConferenceKey(conference, rows.slice(0, 1))).toBe(
      JSON.stringify({
        marks: [['r-1', true, false, null, false, '', [], 'W1', 'S1']],
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
  })

  it('setCargoConferenceLabel mantém a outra etiqueta da linha', () => {
    const wms = setCargoConferenceLabel(EMPTY_CARGO_CONFERENCE, 'r-1', 'wms', 'W-1')
    expect(wms.labelsByRowId['r-1']).toEqual({ wms: 'W-1', sq: '' })
    const both = setCargoConferenceLabel(wms, 'r-1', 'sq', 'S-1')
    expect(both.labelsByRowId['r-1']).toEqual({ wms: 'W-1', sq: 'S-1' })
    expect(EMPTY_CARGO_CONFERENCE.labelsByRowId).toEqual({})
  })

  it('markAllCargoRowsOk marca só o OK? (os pallets não são marcáveis em lote) e deixa as etiquetas', () => {
    const base = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': false },
      palletsByRowId: { 'r-2': 4 },
      labelsByRowId: { 'r-1': { wms: 'W', sq: 'S' } },
    }
    const next = markAllCargoRowsOk(base, rows)
    expect(next.okByRowId).toEqual({ 'r-1': true, 'r-2': true, 'r-3': true })
    expect(next.countOkByRowId).toEqual({})
    expect(next.palletsByRowId).toEqual({ 'r-2': 4 })
    expect(next.labelsByRowId).toBe(base.labelsByRowId)
    expect(base.okByRowId['r-1']).toBe(false)
  })

  it('describeCargoRow usa a descrição SQ, depois a do fornecedor, depois "Item N"', () => {
    expect(describeCargoRow({ sqDescription: ' POLIOL ', supplierDescription: 'X' }, 1)).toBe('POLIOL')
    expect(describeCargoRow({ sqDescription: '', supplierDescription: 'Fornecedor' }, 2)).toBe('Fornecedor')
    expect(describeCargoRow({}, 3)).toBe('Item 3')
  })
})

describe('progresso', () => {
  it('linha conferida = OK? e pelo menos 1 pallet (0 pallet, só OK? ou só pallets não conta)', () => {
    const conference = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
      palletsByRowId: { 'r-1': 1, 'r-2': 0, 'r-4': 9 },
    }
    expect(isCargoRowConferred(conference, 'r-1')).toBe(true)
    expect(isCargoRowConferred(conference, 'r-2')).toBe(false)
    expect(isCargoRowConferred(conference, 'r-3')).toBe(false)
    expect(isCargoRowConferred(conference, 'r-4')).toBe(false)
    expect(summarizeCargoConferenceProgress(rows, conference)).toEqual({ done: 1, total: 3 })
    expect(summarizeCargoConferenceProgress([], conference)).toEqual({ done: 0, total: 0 })
  })

  it('relatório antigo: OK? + Contagem OK (sem número) conta como conferido; legado sem OK? não; o número vence o legado', () => {
    const conference = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': true, 'r-3': true },
      countOkByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
      palletsByRowId: { 'r-3': 0 },
    }
    expect(isCargoRowConferred(conference, 'r-1')).toBe(true)
    expect(isCargoRowConferred(conference, 'r-2')).toBe(false)
    expect(isCargoRowConferred(conference, 'r-3')).toBe(false)
  })
})

describe('pendências do fechamento', () => {
  it('vazia: todas as pendências, com os textos de sempre (e o Nº da NF), sem total do COMEX', () => {
    expect(listCargoConferencePendings(rows, EMPTY_CARGO_CONFERENCE)).toEqual([
      '3 itens sem OK? ou sem pallets contados',
      'Total de pallets não informado pelo COMEX',
      'Status do recebimento não informado',
      'Início da descarga não informado',
      'Etiquetagem sem OK',
      'Nº da NF não informado',
    ])
  })

  it('o computador junta com ", " e o singular fica no singular', () => {
    const pendings = listCargoConferencePendings(rows.slice(0, 1), EMPTY_CARGO_CONFERENCE, { expectedPallets: 4 })
    expect(pendings.join(', ')).toBe(
      '1 item sem OK? ou sem pallets contados, Status do recebimento não informado, Início da descarga não informado, Etiquetagem sem OK, Nº da NF não informado'
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
    expect(listCargoConferencePendings([], base, { expectedPallets: null })).toEqual([
      'Total de pallets não informado pelo COMEX',
      'Fim da descarga não informado',
    ])
    const done = {
      ...base,
      unloadEndAt: '2026-11-24T09:00',
      okByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
      palletsByRowId: { 'r-1': 1, 'r-2': 2, 'r-3': 3 },
    }
    const result = evaluateCargoConferenceClose([...rows, createEmptyCargoReportRow('r-vazia')], done, {
      expectedPallets: 6,
    })
    expect(result).toEqual({ blocking: [], pendings: [], hints: [] })
  })
})

describe('evaluateCargoConferenceClose: pallets, divergência e avaria', () => {
  const complete = {
    ...EMPTY_CARGO_CONFERENCE,
    receiptStatus: 'com_ressalva',
    unloadStartAt: '2026-11-24T08:00',
    unloadEndAt: '2026-11-24T09:00',
    labelingOk: true,
    nfNumber: '48213',
    okByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
    palletsByRowId: { 'r-1': 2, 'r-2': 3, 'r-3': 1 },
  }
  const issue = (note) => ({ flagged: note.trim() !== '', note, photos: [] })

  it('soma igual ao total: sem bloqueio e sem pendência', () => {
    expect(evaluateCargoConferenceClose(rows, complete, { expectedPallets: 6 })).toEqual({
      blocking: [],
      pendings: [],
      hints: [],
    })
  })

  it('divergência sem observação em nenhum item BLOQUEIA, com o texto exato', () => {
    const result = evaluateCargoConferenceClose(rows, complete, { expectedPallets: 8 })
    expect(result.blocking).toEqual([
      'Pallets divergentes: 6 contados de 8 informados pelo COMEX. Para fechar, escreva uma observação em pelo menos um item explicando a diferença ou a avaria.',
    ])
    // Bloqueada, a divergência não vira pendência repetida; o celular recebe a frase curta.
    expect(result.pendings).toEqual([])
    expect(result.hints).toEqual([
      'pallets divergentes (6 de 8) sem observação em nenhum item — escreva uma observação no item',
    ])
  })

  it('divergência com observação escrita em OUTRO item libera e vira pendência informativa', () => {
    const conference = { ...complete, damageByRowId: { 'r-3': issue('Caixas molhadas no pallet 2') } }
    const result = evaluateCargoConferenceClose(rows, conference, { expectedPallets: 8 })
    expect(result.blocking).toEqual([])
    expect(result.pendings).toEqual(['Pallets divergentes: 6 contados de 8 informados pelo COMEX (com observação)'])
    expect(result.hints).toEqual(['pallets divergentes (6 de 8), com observação'])
  })

  it('só foto (ou o flag legado sem nota e sem foto) NÃO libera a divergência', () => {
    const onlyFlag = { ...complete, damageByRowId: { 'r-1': { flagged: true, note: '', photos: [] } } }
    expect(evaluateCargoConferenceClose(rows, onlyFlag, { expectedPallets: 8 }).blocking).toHaveLength(1)
    const photo = { id: 'p1', path: 'a', thumbPath: 'b', width: 10, height: 10, size: 1, uploadedAt: 1, byId: 'u' }
    const onlyPhoto = { ...complete, damageByRowId: { 'r-1': { flagged: false, note: '   ', photos: [photo] } } }
    expect(evaluateCargoConferenceClose(rows, onlyPhoto, { expectedPallets: 8 }).blocking).toHaveLength(1)
  })

  it('nada contado (0 pallets) com total informado também é divergência', () => {
    const result = evaluateCargoConferenceClose(rows, EMPTY_CARGO_CONFERENCE, { expectedPallets: 5 })
    expect(result.blocking[0]).toMatch(/^Pallets divergentes: 0 contados de 5 informados pelo COMEX\./)
  })

  it('sem total do COMEX não compara: pendência informativa, nunca bloqueio', () => {
    const result = evaluateCargoConferenceClose(rows, complete, { expectedPallets: null })
    expect(result.blocking).toEqual([])
    expect(result.pendings).toEqual(['Total de pallets não informado pelo COMEX'])
    expect(result.hints).toEqual(['total de pallets não informado pelo COMEX'])
  })

  it('avaria com status diferente de "Com ressalva" é pendência; com "Com ressalva" não', () => {
    const withIssue = {
      ...complete,
      receiptStatus: 'sem_ressalva',
      damageByRowId: { 'r-1': issue('y'), 'r-2': issue('x') },
    }
    const result = evaluateCargoConferenceClose(rows, withIssue, { expectedPallets: 6 })
    expect(result.pendings).toEqual([
      '2 itens com avaria registrada, mas o status do recebimento não é "Com ressalva"',
    ])
    expect(result.hints).toEqual(['2 itens com avaria e status diferente de "Com ressalva"'])

    const single = { ...complete, receiptStatus: '', damageByRowId: { 'r-1': issue('x') } }
    expect(evaluateCargoConferenceClose(rows, single, { expectedPallets: 6 }).pendings).toEqual([
      '1 item com avaria registrada, mas o status do recebimento não é "Com ressalva"',
      'Status do recebimento não informado',
    ])

    const ok = { ...complete, damageByRowId: { 'r-1': issue('x') } }
    expect(evaluateCargoConferenceClose(rows, ok, { expectedPallets: 6 }).pendings).toEqual([])
  })

  it('item sem OK? ou sem pallets: texto exato e a ordem do mock (itens, divergência, total, avaria, status, descarga...)', () => {
    const conference = {
      ...EMPTY_CARGO_CONFERENCE,
      palletsByRowId: { 'r-1': 1 },
      damageByRowId: { 'r-1': issue('amassado') },
    }
    const result = evaluateCargoConferenceClose(rows, conference, { expectedPallets: 4 })
    expect(result.blocking).toEqual([])
    expect(result.pendings).toEqual([
      '3 itens sem OK? ou sem pallets contados',
      'Pallets divergentes: 1 contados de 4 informados pelo COMEX (com observação)',
      '1 item com avaria registrada, mas o status do recebimento não é "Com ressalva"',
      'Status do recebimento não informado',
      'Início da descarga não informado',
      'Etiquetagem sem OK',
      'Nº da NF não informado',
    ])
    expect(result.hints[0]).toBe('3 itens sem OK? ou sem pallets')
  })

  it('observação de linha que não existe mais não libera o bloqueio', () => {
    const conference = { ...complete, damageByRowId: { 'r-removida': issue('texto') } }
    expect(evaluateCargoConferenceClose(rows, conference, { expectedPallets: 8 }).blocking).toHaveLength(1)
  })

  it('relatório antigo (Contagem OK sem número) conta como contado, sem inventar pallets na soma', () => {
    const legacy = {
      ...EMPTY_CARGO_CONFERENCE,
      okByRowId: { 'r-1': true },
      countOkByRowId: { 'r-1': true },
    }
    const result = evaluateCargoConferenceClose(rows.slice(0, 1), legacy, { expectedPallets: null })
    expect(result.pendings).not.toContain('1 item sem OK? ou sem pallets contados')
  })
})

describe('evaluateCargoConferenceClose: foto sem observação (S10-J1b)', () => {
  const photo = (id) => ({ id, path: 'a', thumbPath: 'b', width: 10, height: 10, size: 1, uploadedAt: 1, byId: 'u' })
  const complete = {
    ...EMPTY_CARGO_CONFERENCE,
    receiptStatus: 'com_ressalva',
    unloadStartAt: '2026-11-24T08:00',
    unloadEndAt: '2026-11-24T09:00',
    labelingOk: true,
    nfNumber: '48213',
    okByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
    palletsByRowId: { 'r-1': 2, 'r-2': 3, 'r-3': 1 },
  }

  it('item com foto e sem observação escrita vira pendência (não bloqueia); com observação some', () => {
    const withPhoto = { ...complete, damageByRowId: { 'r-1': { flagged: true, note: '', photos: [photo('a')] } } }
    const result = evaluateCargoConferenceClose(rows, withPhoto, { expectedPallets: 6 })
    expect(result.blocking).toEqual([])
    expect(result.pendings).toEqual(['1 item com foto, mas sem observação'])
    expect(result.hints).toEqual(['1 item com foto sem observação'])

    const written = { ...complete, damageByRowId: { 'r-1': { flagged: true, note: 'Caixa amassada', photos: [photo('a')] } } }
    expect(evaluateCargoConferenceClose(rows, written, { expectedPallets: 6 }).pendings).toEqual([])
  })

  it('observação só com espaços conta como sem observação; vários itens vão no plural', () => {
    const many = {
      ...complete,
      damageByRowId: {
        'r-1': { flagged: true, note: '   ', photos: [photo('a')] },
        'r-2': { flagged: true, note: '', photos: [photo('b'), photo('c')] },
      },
    }
    expect(evaluateCargoConferenceClose(rows, many, { expectedPallets: 6 }).pendings).toEqual([
      '2 itens com foto, mas sem observação',
    ])
  })

  it('avaria sem foto não gera essa pendência; a ordem fica: avaria x status, foto sem observação, status', () => {
    const noPhoto = { ...complete, damageByRowId: { 'r-1': { flagged: true, note: '', photos: [] } } }
    expect(evaluateCargoConferenceClose(rows, noPhoto, { expectedPallets: 6 }).pendings).toEqual([])
    const ordered = {
      ...complete,
      receiptStatus: '',
      damageByRowId: { 'r-1': { flagged: true, note: '', photos: [photo('a')] } },
    }
    expect(evaluateCargoConferenceClose(rows, ordered, { expectedPallets: 6 }).pendings).toEqual([
      '1 item com avaria registrada, mas o status do recebimento não é "Com ressalva"',
      '1 item com foto, mas sem observação',
      'Status do recebimento não informado',
    ])
  })
})
