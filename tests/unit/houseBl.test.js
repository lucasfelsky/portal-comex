// D-F3-1: House BL unico nos maritimos (leitura houseBl || masterBl, edicao que
// limpa o masterBl legado e restaura o par original). Funcoes puras.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { applyHouseBlInput, getHouseBl, getHouseBlInputValue } from '../../src/features/processes/houseBl.js'

describe('getHouseBl', () => {
  it('caso-real: CR-69 devolve o House BL; sem ele, o MBL antigo; com os dois, o House BL', () => {
    expect(getHouseBl({ houseBl: 'HBL-1' })).toBe('HBL-1')
    expect(getHouseBl({ masterBl: 'MBL-1' })).toBe('MBL-1')
    expect(getHouseBl({ houseBl: 'HBL-1', masterBl: 'MBL-1' })).toBe('HBL-1')
    expect(getHouseBl({ houseBl: '  ', masterBl: 'MBL-1' })).toBe('MBL-1')
  })

  it('caso-real: CR-69 nao objeto ou nada preenchido -> vazio (e aparda os espacos)', () => {
    expect(getHouseBl(null)).toBe('')
    expect(getHouseBl(undefined)).toBe('')
    expect(getHouseBl({})).toBe('')
    expect(getHouseBl({ houseBl: ' ', masterBl: '' })).toBe('')
    expect(getHouseBl({ houseBl: '  HBL-1  ' })).toBe('HBL-1')
  })
})

describe('getHouseBlInputValue', () => {
  it('caso-real: CR-69 devolve o houseBl CRU (o espaco digitado continua) e, sem ele, o masterBl cru', () => {
    expect(getHouseBlInputValue({ houseBl: 'HBL-1 ' })).toBe('HBL-1 ')
    expect(getHouseBlInputValue({ houseBl: 'HBL-1', masterBl: 'MBL-1' })).toBe('HBL-1')
    expect(getHouseBlInputValue({ houseBl: '', masterBl: 'MBL-1' })).toBe('MBL-1')
    expect(getHouseBlInputValue({ houseBl: '   ', masterBl: 'MBL-1 ' })).toBe('MBL-1 ')
    expect(getHouseBlInputValue({})).toBe('')
    expect(getHouseBlInputValue(null)).toBe('')
  })
})

describe('applyHouseBlInput', () => {
  const legacy = { masterBl: 'MBL-1', houseBl: '' }

  it('caso-real: CR-69 editar um legado grava o houseBl e limpa o masterBl', () => {
    expect(applyHouseBlInput({ ...legacy }, 'HBL-9', legacy)).toMatchObject({ houseBl: 'HBL-9', masterBl: '' })
    expect(applyHouseBlInput({ ...legacy }, '', legacy)).toMatchObject({ houseBl: '', masterBl: '' })
  })

  it('caso-real: CR-69 voltar exatamente ao valor da base restaura o par gravado (legado)', () => {
    const edited = applyHouseBlInput({ ...legacy }, 'HBL-9', legacy)
    expect(applyHouseBlInput(edited, 'MBL-1', legacy)).toMatchObject({ houseBl: '', masterBl: 'MBL-1' })
  })

  it('caso-real: CR-69 base com os dois preenchidos: o valor igual ao houseBl restaura os dois da base', () => {
    const both = { houseBl: 'HBL-2', masterBl: 'MBL-OCULTO' }
    const edited = applyHouseBlInput({ ...both }, 'HBL-3', both)
    expect(edited).toMatchObject({ houseBl: 'HBL-3', masterBl: '' })
    expect(applyHouseBlInput(edited, 'HBL-2', both)).toMatchObject({ houseBl: 'HBL-2', masterBl: 'MBL-OCULTO' })
  })

  it('caso-real: CR-69 a igualdade e exata: so o espaco a mais conta como edicao', () => {
    expect(applyHouseBlInput({ ...legacy }, 'MBL-1 ', legacy)).toMatchObject({ houseBl: 'MBL-1 ', masterBl: '' })
  })

  it('caso-real: CR-69 sem base nunca restaura', () => {
    expect(applyHouseBlInput({ ...legacy }, 'MBL-1')).toMatchObject({ houseBl: 'MBL-1', masterBl: '' })
    expect(applyHouseBlInput({ ...legacy }, 'MBL-1', null)).toMatchObject({ houseBl: 'MBL-1', masterBl: '' })
  })

  it('caso-real: CR-69 preserva as outras chaves do rascunho e nao muta a entrada', () => {
    const draft = { id: 'PROC-1', name: 'ALFA SEA 962-26', category: 'FCL', masterBl: 'MBL-1', houseBl: '', items: [1] }
    const next = applyHouseBlInput(draft, 'HBL-5', draft)
    expect(next).toEqual({ ...draft, houseBl: 'HBL-5', masterBl: '' })
    expect(draft.masterBl).toBe('MBL-1')
    expect(next.items).toBe(draft.items)
  })

  it('caso-real: CR-69 valor nulo vira vazio', () => {
    expect(applyHouseBlInput({ ...legacy }, undefined)).toMatchObject({ houseBl: '', masterBl: '' })
    expect(applyHouseBlInput({ ...legacy }, null, legacy)).toMatchObject({ houseBl: '', masterBl: '' })
  })
})
