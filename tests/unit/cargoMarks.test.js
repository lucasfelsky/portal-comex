// getCargoMarks (remake mobile): os mesmos sinais dos selos de texto de carga,
// em forma de dado para os icones. Zero regra nova: inflamavel/perigosa vem de
// operationalOptions e o volume segue a precedencia do resumo de Chegadas.
import { describe, expect, it } from 'vitest'
import { getCargoMarks } from '../../src/features/processes/operationalOptions.js'

const item = (imoClass) => ({ id: 'i1', commercialName: 'X', dangerousGoods: true, imoClass })

describe('getCargoMarks - inflamavel e perigosa', () => {
  it.each(['2.1', '3', '4.1'])('item perigoso com IMO %s = inflamavel (e perigosa)', (imoClass) => {
    const marks = getCargoMarks({ category: 'FCL', items: [item(imoClass)] })
    expect(marks.flammable).toBe(true)
    expect(marks.dangerous).toBe(true)
  })

  it('item perigoso fora das classes inflamaveis = so perigosa', () => {
    const marks = getCargoMarks({ category: 'FCL', items: [item('8')] })
    expect(marks.flammable).toBe(false)
    expect(marks.dangerous).toBe(true)
  })

  it('legado de nivel-processo (flag sem itens classificados) segue valendo', () => {
    expect(getCargoMarks({ dangerousGoods: true, imoClass: '3', items: [] })).toMatchObject({
      flammable: true,
      dangerous: true,
    })
    expect(getCargoMarks({ dangerousGoods: true, imoClass: '8', items: [] })).toMatchObject({
      flammable: false,
      dangerous: true,
    })
  })

  it('carga comum e processo vazio/ausente: nenhuma marca', () => {
    const plain = { category: 'FCL', items: [{ id: 'i1', commercialName: 'X', dangerousGoods: false }] }
    expect(getCargoMarks(plain)).toEqual({ flammable: false, dangerous: false, volume: null })
    expect(getCargoMarks(undefined)).toEqual({ flammable: false, dangerous: false, volume: null })
    expect(getCargoMarks({})).toEqual({ flammable: false, dangerous: false, volume: null })
  })
})

describe('getCargoMarks - volume (mesma precedencia do resumo de Chegadas)', () => {
  it('conteineres quando a categoria os mostra, com singular/plural', () => {
    expect(getCargoMarks({ category: 'FCL', containerQuantity: 2 }).volume).toEqual({
      count: 2,
      label: '2 contêineres',
    })
    expect(getCargoMarks({ category: 'FCL', containerQuantity: 1 }).volume).toEqual({
      count: 1,
      label: '1 contêiner',
    })
    expect(getCargoMarks({ category: 'CONSOLIDADO', containerQuantity: 3 }).volume?.label).toBe('3 contêineres')
  })

  it('0 conteineres = sem volume de conteiner (cai nos pallets, se houver)', () => {
    expect(getCargoMarks({ category: 'FCL', containerQuantity: 0 }).volume).toBeNull()
    expect(getCargoMarks({ category: 'FCL', containerQuantity: 0, palletQuantity: 5 }).volume).toEqual({
      count: 5,
      label: '5 pallets',
    })
  })

  it('conteiner vence pallet quando os dois existem', () => {
    expect(getCargoMarks({ category: 'FCL', containerQuantity: 2, palletQuantity: 9 }).volume?.label).toBe(
      '2 contêineres'
    )
  })

  it('aereo e LCL nao mostram conteiner: usam os pallets', () => {
    expect(getCargoMarks({ category: 'AEREO', containerQuantity: 4, palletQuantity: 2 }).volume).toEqual({
      count: 2,
      label: '2 pallets',
    })
    expect(getCargoMarks({ category: 'LCL', containerQuantity: 4, palletQuantity: 1 }).volume).toEqual({
      count: 1,
      label: '1 pallet',
    })
    expect(getCargoMarks({ category: 'AEREO', containerQuantity: 4 }).volume).toBeNull()
  })
})
