// F17.2a: cobertura de operationalOptions.js (D-2).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  IMO_CLASS_OPTIONS,
  INCOTERM_OPTIONS,
  getImoClassLabel,
  getItemDangerousGoodsLabel,
  hasDangerousGoods,
  isLegacyProcessDangerousGoods,
  isValidUnNumber,
  itemsHaveDangerousGoods,
  normalizeDecimal,
  normalizeImoClass,
  normalizeInteger,
  normalizeItemDangerousGoods,
  normalizeUnNumber,
  resolveProcessDangerousGoods,
} from '../../src/features/processes/operationalOptions.js'

describe('INCOTERM_OPTIONS', () => {
  it('tem os 11 Incoterms 2020', () => {
    expect(INCOTERM_OPTIONS).toHaveLength(11)
    expect(INCOTERM_OPTIONS).toContain('EXW')
    expect(INCOTERM_OPTIONS).toContain('DDP')
  })
})

describe('IMO_CLASS_OPTIONS', () => {
  it('tem as 15 classes/divisoes IMDG', () => {
    expect(IMO_CLASS_OPTIONS).toHaveLength(15)
  })

  it('valor gravado e o codigo, label tem acento', () => {
    const classe3 = IMO_CLASS_OPTIONS.find((option) => option.value === '3')
    expect(classe3.label).toBe('3 — Líquidos inflamáveis')
  })
})

describe('normalizeUnNumber', () => {
  it("remove prefixo 'UN' e espacos", () => {
    expect(normalizeUnNumber('UN 1203')).toBe('1203')
    expect(normalizeUnNumber('un1203')).toBe('1203')
    expect(normalizeUnNumber(' 1203 ')).toBe('1203')
  })
})

describe('isValidUnNumber', () => {
  it('4 digitos -> valido', () => {
    expect(isValidUnNumber('UN 1203')).toBe(true)
  })

  it('formato invalido -> invalido', () => {
    expect(isValidUnNumber('120')).toBe(false)
    expect(isValidUnNumber('ABCD')).toBe(false)
    expect(isValidUnNumber('')).toBe(false)
  })
})

describe('normalizeImoClass / getImoClassLabel', () => {
  it('valor valido preservado', () => {
    expect(normalizeImoClass('3')).toBe('3')
    expect(normalizeImoClass('2.1')).toBe('2.1')
  })

  it('valor invalido -> vazio', () => {
    expect(normalizeImoClass('99')).toBe('')
  })

  it('label do valor gravado', () => {
    expect(getImoClassLabel('3')).toBe('3 — Líquidos inflamáveis')
    expect(getImoClassLabel('')).toBe('')
  })
})

describe('normalizeDecimal', () => {
  it('aceita virgula e converte pra numero', () => {
    expect(normalizeDecimal('12,5')).toBe(12.5)
  })

  it('aceita ponto', () => {
    expect(normalizeDecimal('12.5')).toBe(12.5)
  })

  it('negativo -> 0', () => {
    expect(normalizeDecimal('-5')).toBe(0)
  })

  it('NaN/vazio -> 0', () => {
    expect(normalizeDecimal('')).toBe(0)
    expect(normalizeDecimal('abc')).toBe(0)
  })
})

describe('normalizeInteger', () => {
  it('inteiro valido', () => {
    expect(normalizeInteger('5')).toBe(5)
  })

  it('negativo/NaN -> 0', () => {
    expect(normalizeInteger('-3')).toBe(0)
    expect(normalizeInteger('abc')).toBe(0)
  })
})

// F17.2d-1 (D-4, Q4): carga perigosa POR ITEM - chaves esparsas.
describe('normalizeItemDangerousGoods', () => {
  it('item nao-perigoso -> objeto vazio (sem chaves)', () => {
    expect(normalizeItemDangerousGoods({ dangerousGoods: false })).toEqual({})
    expect(normalizeItemDangerousGoods({})).toEqual({})
  })

  it('item perigoso -> chaves normalizadas', () => {
    expect(
      normalizeItemDangerousGoods({ dangerousGoods: true, unNumber: 'UN 1203', imoClass: '3' })
    ).toEqual({ dangerousGoods: true, unNumber: '1203', imoClass: '3' })
  })
})

describe('itemsHaveDangerousGoods', () => {
  it('algum item perigoso -> true', () => {
    expect(itemsHaveDangerousGoods([{ dangerousGoods: true }])).toBe(true)
  })

  it('nenhum item perigoso/array vazio/nao-array -> false', () => {
    expect(itemsHaveDangerousGoods([{ dangerousGoods: false }])).toBe(false)
    expect(itemsHaveDangerousGoods([])).toBe(false)
    expect(itemsHaveDangerousGoods(undefined)).toBe(false)
  })
})

describe('hasDangerousGoods / isLegacyProcessDangerousGoods', () => {
  it('flag de processo true -> hasDangerousGoods true', () => {
    expect(hasDangerousGoods({ dangerousGoods: true, items: [] })).toBe(true)
  })

  it('algum item perigoso -> hasDangerousGoods true', () => {
    expect(hasDangerousGoods({ dangerousGoods: false, items: [{ dangerousGoods: true }] })).toBe(true)
  })

  it('legado (flag true, nenhum item perigoso) -> isLegacyProcessDangerousGoods true', () => {
    expect(isLegacyProcessDangerousGoods({ dangerousGoods: true, items: [] })).toBe(true)
  })

  it('item ja classificado -> isLegacyProcessDangerousGoods false', () => {
    expect(
      isLegacyProcessDangerousGoods({ dangerousGoods: true, items: [{ dangerousGoods: true }] })
    ).toBe(false)
  })
})

describe('resolveProcessDangerousGoods', () => {
  it('algum item perigoso nos proximos itens -> flag deriva dos itens, trio zerado', () => {
    expect(
      resolveProcessDangerousGoods(
        { dangerousGoods: false, unNumber: '', imoClass: '', items: [] },
        [{ dangerousGoods: true, unNumber: '1203', imoClass: '3' }]
      )
    ).toEqual({ dangerousGoods: true, unNumber: '', imoClass: '' })
  })

  it('nenhum item perigoso, mas o processo TINHA item perigoso (flag derivada) -> zera', () => {
    expect(
      resolveProcessDangerousGoods(
        { dangerousGoods: true, unNumber: '', imoClass: '', items: [{ dangerousGoods: true }] },
        []
      )
    ).toEqual({ dangerousGoods: false, unNumber: '', imoClass: '' })
  })

  it('legado (nunca teve item perigoso) -> preserva o trio de processo', () => {
    expect(
      resolveProcessDangerousGoods(
        { dangerousGoods: true, unNumber: 'UN-1', imoClass: '3', items: [] },
        []
      )
    ).toEqual({ dangerousGoods: true, unNumber: 'UN-1', imoClass: '3' })
  })
})

describe('getItemDangerousGoodsLabel', () => {
  it('so classe', () => {
    expect(getItemDangerousGoodsLabel({ imoClass: '3' })).toBe('Carga perigosa · Classe 3')
  })

  it('classe e ONU', () => {
    expect(getItemDangerousGoodsLabel({ imoClass: '3', unNumber: '1203' })).toBe(
      'Carga perigosa · Classe 3 · ONU 1203'
    )
  })

  it('sem classe nem ONU', () => {
    expect(getItemDangerousGoodsLabel({})).toBe('Carga perigosa')
  })
})
