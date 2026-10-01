import { describe, expect, it } from 'vitest'
import { formatCargoUnit, formatContainerCount, formatPalletCount } from '../../src/utils/cargoUnits'

describe('cargoUnits', () => {
  it('singular so quando a quantidade e exatamente 1', () => {
    expect(formatContainerCount(1)).toBe('1 contêiner')
    expect(formatContainerCount('1')).toBe('1 contêiner')
    expect(formatPalletCount(1)).toBe('1 pallet')
  })

  it('plural para 0, 2 ou mais', () => {
    expect(formatContainerCount(0)).toBe('0 contêineres')
    expect(formatContainerCount(2)).toBe('2 contêineres')
    expect(formatContainerCount(40)).toBe('40 contêineres')
    expect(formatPalletCount(0)).toBe('0 pallets')
    expect(formatPalletCount(3)).toBe('3 pallets')
  })

  it('vazio/undefined/NaN contam como 0 (plural), sem "undefined" nem "NaN" no texto', () => {
    expect(formatContainerCount(undefined)).toBe('0 contêineres')
    expect(formatContainerCount(null)).toBe('0 contêineres')
    expect(formatContainerCount('')).toBe('0 contêineres')
    expect(formatContainerCount('abc')).toBe('0 contêineres')
  })

  it('formatCargoUnit aceita rotulos arbitrarios', () => {
    expect(formatCargoUnit(1, 'volume', 'volumes')).toBe('1 volume')
    expect(formatCargoUnit(5, 'volume', 'volumes')).toBe('5 volumes')
  })

  it('nao usa mais a grafia "container" sem acento', () => {
    expect(formatContainerCount(1)).not.toMatch(/container/)
    expect(formatContainerCount(3)).not.toMatch(/containers/)
  })
})
