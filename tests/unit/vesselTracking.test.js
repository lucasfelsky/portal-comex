import { describe, expect, it } from 'vitest'
import {
  buildMarineTrafficUrl,
  buildVesselFinderDetailsUrl,
  buildVesselFinderEmbedUrl,
  buildVesselFinderSearchUrl,
  getVesselTrackingTarget,
  isValidVesselImo,
  normalizeVesselImo,
} from '../../src/features/processes/vesselTracking'

describe('vesselTracking - IMO', () => {
  it('aceita IMOs com digito verificador correto', () => {
    expect(isValidVesselImo('9787027')).toBe(true)
    expect(isValidVesselImo('9481726')).toBe(true)
  })

  it('rejeita digito verificador errado', () => {
    expect(isValidVesselImo('9787028')).toBe(false)
  })

  it('normaliza prefixo IMO e espacos', () => {
    expect(normalizeVesselImo('IMO 9787027')).toBe('9787027')
    expect(normalizeVesselImo(' 978 7027 ')).toBe('9787027')
    expect(isValidVesselImo('IMO 9787027')).toBe(true)
  })

  it('vazio/null/undefined sao validos (campo opcional)', () => {
    expect(isValidVesselImo('')).toBe(true)
    expect(isValidVesselImo(null)).toBe(true)
    expect(isValidVesselImo(undefined)).toBe(true)
  })

  it('rejeita tamanho errado e nao numericos', () => {
    expect(isValidVesselImo('12345678')).toBe(false)
    expect(isValidVesselImo('ABC1234')).toBe(false)
  })
})

describe('vesselTracking - URLs', () => {
  it('embed contem imo e track=true', () => {
    const url = buildVesselFinderEmbedUrl('9787027', { height: 420, referrer: 'https://x.test/a?b=1' })
    expect(url.startsWith('https://www.vesselfinder.com/aismap?')).toBe(true)
    expect(url).toContain('imo=9787027')
    expect(url).toContain('track=true')
    expect(url).toContain('height=420')
    expect(url).toContain(`ra=${encodeURIComponent('https://x.test/a?b=1')}`)
  })

  it('links externos e busca por nome', () => {
    expect(buildVesselFinderDetailsUrl('9787027')).toBe('https://www.vesselfinder.com/vessels/details/9787027')
    expect(buildMarineTrafficUrl('9787027')).toBe('https://www.marinetraffic.com/en/ais/details/ships/imo:9787027')
    expect(buildVesselFinderSearchUrl('EVER BLOOM')).toBe(
      `https://www.vesselfinder.com/vessels?name=${encodeURIComponent('EVER BLOOM')}`
    )
  })
})

describe('vesselTracking - getVesselTrackingTarget', () => {
  it('aereo -> null', () => {
    expect(getVesselTrackingTarget({ category: 'AEREO', vesselName: 'X', vesselImo: '9787027' })).toBeNull()
  })

  it('FCL sem nome e sem IMO -> null', () => {
    expect(getVesselTrackingTarget({ category: 'FCL', masterBl: 'MBL1' })).toBeNull()
  })

  it('FCL com IMO -> embed', () => {
    expect(
      getVesselTrackingTarget({ category: 'FCL', vesselName: 'EVER BLOOM', voyage: '12E', vesselImo: '9787027' })
    ).toEqual({ mode: 'embed', imo: '9787027', name: 'EVER BLOOM', voyage: '12E' })
  })

  it('LCL so com nome -> search', () => {
    expect(getVesselTrackingTarget({ category: 'LCL', vesselName: ' EVER BLOOM ' })).toEqual({
      mode: 'search',
      name: 'EVER BLOOM',
    })
  })

  it('IMO invalido com nome cai para busca', () => {
    expect(getVesselTrackingTarget({ category: 'FCL', vesselName: 'A', vesselImo: '9787028' })).toEqual({
      mode: 'search',
      name: 'A',
    })
  })
})
