// F17.2a: cobertura de containers.js (D-2, D-4, D-7).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  CONTAINER_TYPE_OPTIONS,
  MAX_CONTAINERS,
  createEmptyContainer,
  getContainerNumberWarning,
  getContainerSpecialBadges,
  normalizeContainerNumber,
  normalizeContainers,
  validateContainerNumber,
} from '../../src/features/processes/containers.js'

describe('normalizeContainerNumber', () => {
  it('normaliza maiusculas e remove tudo fora de [A-Z0-9]', () => {
    expect(normalizeContainerNumber(' csqu 305438-3 ')).toBe('CSQU3054383')
  })

  it('vazio -> string vazia', () => {
    expect(normalizeContainerNumber('')).toBe('')
    expect(normalizeContainerNumber(null)).toBe('')
  })
})

describe('validateContainerNumber (D-7)', () => {
  it('vazio -> status empty', () => {
    expect(validateContainerNumber('').status).toBe('empty')
  })

  it('CSQU3054383 -> valido', () => {
    expect(validateContainerNumber('CSQU3054383').status).toBe('valid')
  })

  it('MSCU1234566 -> valido', () => {
    expect(validateContainerNumber('MSCU1234566').status).toBe('valid')
  })

  it('TGHU1234560 -> digito verificador invalido (esperado 7)', () => {
    const result = validateContainerNumber('TGHU1234560')
    expect(result.status).toBe('checkDigit')
    expect(result.expectedCheckDigit).toBe(7)
  })

  it('formato invalido (letras/digitos errados) -> status format', () => {
    expect(validateContainerNumber('AB1234567').status).toBe('format')
    expect(validateContainerNumber('ABCD123456').status).toBe('format')
  })

  it('getContainerNumberWarning: mensagens exatas', () => {
    expect(getContainerNumberWarning('AB1234567')).toBe(
      'Formato fora do padrão ISO 6346 (4 letras + 7 dígitos).'
    )
    expect(getContainerNumberWarning('TGHU1234560')).toBe(
      'Dígito verificador não confere (esperado: 7).'
    )
    expect(getContainerNumberWarning('CSQU3054383')).toBe('')
    expect(getContainerNumberWarning('')).toBe('')
  })
})

describe('normalizeContainers (D-4)', () => {
  it('categoria fora de FCL/CONSOLIDADO -> sempre []', () => {
    expect(normalizeContainers([{ number: 'CSQU3054383' }], { category: 'LCL' })).toEqual([])
    expect(normalizeContainers([{ number: 'CSQU3054383' }], { category: 'AEREO' })).toEqual([])
  })

  it('ids ausentes -> deterministicos CNT-n (ordem de leitura)', () => {
    const result = normalizeContainers(
      [{ number: 'a' }, { number: 'b' }],
      { category: 'FCL' }
    )
    expect(result.map((c) => c.id)).toEqual(['CNT-1', 'CNT-2'])
  })

  it('tipo desconhecido -> string vazia', () => {
    const result = normalizeContainers([{ number: 'x', type: 'INVALIDO' }], { category: 'FCL' })
    expect(result[0].type).toBe('')
  })

  it('teto de 40 itens', () => {
    const raw = Array.from({ length: 50 }, (_, i) => ({ number: `N${i}` }))
    const result = normalizeContainers(raw, { category: 'FCL' })
    expect(result).toHaveLength(MAX_CONTAINERS)
  })

  it('expansao lazy por containerQuantity quando array vazio', () => {
    const result = normalizeContainers([], { category: 'FCL', containerQuantity: 3 })
    expect(result.map((c) => c.id)).toEqual(['CNT-1', 'CNT-2', 'CNT-3'])
  })

  it('expansao lazy por collectionWindows[].containerNumber quando array vazio', () => {
    const result = normalizeContainers(undefined, {
      category: 'CONSOLIDADO',
      containerQuantity: 1,
      collectionWindows: [{ containerNumber: 4 }],
    })
    expect(result).toHaveLength(4)
  })

  it('array ja preenchido NAO expande mesmo com containerQuantity maior', () => {
    const result = normalizeContainers([{ number: 'x' }], {
      category: 'FCL',
      containerQuantity: 5,
    })
    expect(result).toHaveLength(1)
  })
})

describe('getContainerSpecialBadges', () => {
  it('containers 40RF gera badge Reefer', () => {
    expect(getContainerSpecialBadges([{ type: '40RF' }])).toEqual(['Reefer'])
  })

  it('ISOTANK gera badge ISO tank', () => {
    expect(getContainerSpecialBadges([{ type: 'ISOTANK' }])).toEqual(['ISO tank'])
  })

  it('ordem fixa Reefer antes de ISO tank quando ambos presentes', () => {
    expect(getContainerSpecialBadges([{ type: 'ISOTANK' }, { type: '20RF' }])).toEqual([
      'Reefer',
      'ISO tank',
    ])
  })

  it('sem containers especiais -> array vazio', () => {
    expect(getContainerSpecialBadges([{ type: '20DC' }])).toEqual([])
    expect(getContainerSpecialBadges([])).toEqual([])
  })
})

describe('createEmptyContainer', () => {
  it('cria container vazio com o id informado', () => {
    expect(createEmptyContainer('CNT-1')).toEqual({
      id: 'CNT-1',
      number: '',
      seal: '',
      type: '',
      returnedAt: '',
    })
  })
})

describe('CONTAINER_TYPE_OPTIONS', () => {
  it('tem os 10 tipos da D-2', () => {
    expect(CONTAINER_TYPE_OPTIONS).toHaveLength(10)
  })
})
