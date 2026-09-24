// F17.2a: cobertura de containers.js (D-2, D-4, D-7).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  CONTAINER_TYPE_OPTIONS,
  MAX_CONTAINERS,
  createEmptyContainer,
  getCollectionWindowLabel,
  getContainerNumberWarning,
  getContainerOptionLabel,
  getContainerSpecialBadges,
  getContainerWindowRows,
  isContainerRemovalLocked,
  isOrphanCollectionWindow,
  linkCollectionWindowsToContainers,
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

// F17.2c (D-6): janelas de coleta x containers.
describe('linkCollectionWindowsToContainers (D-6)', () => {
  const containers = [{ id: 'CNT-1' }, { id: 'CNT-2' }]

  it('categoria fora de FCL/CONSOLIDADO -> containerId "" em toda janela', () => {
    const result = linkCollectionWindowsToContainers(
      [{ id: 'W1', containerId: 'CNT-1', containerNumber: 1 }],
      containers,
      'LCL'
    )
    expect(result[0].containerId).toBe('')
  })

  it('containerId existente e achado -> sincroniza containerNumber (indice + 1)', () => {
    const result = linkCollectionWindowsToContainers(
      [{ id: 'W1', containerId: 'CNT-2', containerNumber: 9 }],
      containers,
      'FCL'
    )
    expect(result[0].containerNumber).toBe(2)
    expect(result[0].containerId).toBe('CNT-2')
  })

  it('containerId existente e NAO achado -> janela orfa preservada intacta', () => {
    const window = { id: 'W1', containerId: 'CNT-REMOVIDO', containerNumber: 1 }
    const result = linkCollectionWindowsToContainers([window], containers, 'FCL')
    expect(result[0]).toEqual(window)
  })

  it('containerId vazio -> backfill pelo containerNumber legado', () => {
    const result = linkCollectionWindowsToContainers(
      [{ id: 'W1', containerNumber: 2 }],
      containers,
      'CONSOLIDADO'
    )
    expect(result[0].containerId).toBe('CNT-2')
    expect(result[0].containerNumber).toBe(2)
  })

  it('containerId vazio e containerNumber sem correspondente -> intacta', () => {
    const window = { id: 'W1', containerNumber: 9 }
    const result = linkCollectionWindowsToContainers([window], containers, 'FCL')
    expect(result[0]).toEqual(window)
  })

  it('nao-array -> []', () => {
    expect(linkCollectionWindowsToContainers(undefined, containers, 'FCL')).toEqual([])
  })
})

describe('isOrphanCollectionWindow (D-6)', () => {
  const containers = [{ id: 'CNT-1' }]

  it('containerId presente mas nao encontrado -> orfa', () => {
    expect(isOrphanCollectionWindow({ containerId: 'CNT-9' }, containers)).toBe(true)
  })

  it('containerId presente e encontrado -> nao orfa', () => {
    expect(isOrphanCollectionWindow({ containerId: 'CNT-1' }, containers)).toBe(false)
  })

  it('sem containerId -> nao orfa', () => {
    expect(isOrphanCollectionWindow({ containerId: '' }, containers)).toBe(false)
  })
})

describe('getContainerOptionLabel (D-6)', () => {
  it('numero do container quando presente', () => {
    expect(getContainerOptionLabel({ number: 'CSQU3054383' }, 0)).toBe('CSQU3054383')
  })

  it('fallback "Contêiner n" quando sem numero', () => {
    expect(getContainerOptionLabel({ number: '' }, 2)).toBe('Contêiner 3')
  })
})

describe('getCollectionWindowLabel (D-6)', () => {
  const containers = [{ id: 'CNT-1', number: 'CSQU3054383' }]

  it('FCL/CONSOLIDADO com container achado -> rotulo do container', () => {
    expect(
      getCollectionWindowLabel({ containerId: 'CNT-1' }, { category: 'FCL', containers })
    ).toBe('CSQU3054383')
  })

  it('containerId orfao -> "Contêiner removido"', () => {
    expect(
      getCollectionWindowLabel({ containerId: 'CNT-9' }, { category: 'CONSOLIDADO', containers })
    ).toBe('Contêiner removido')
  })

  it('sem containerId (legado) -> "Contêiner N"', () => {
    expect(
      getCollectionWindowLabel({ containerNumber: 3 }, { category: 'FCL', containers: [] })
    ).toBe('Contêiner 3')
  })

  it('LCL/AEREO -> "Janela de coleta"', () => {
    expect(getCollectionWindowLabel({}, { category: 'LCL', containers })).toBe('Janela de coleta')
    expect(getCollectionWindowLabel({}, { category: 'AEREO', containers })).toBe('Janela de coleta')
  })
})

// F17.2d-2 (D-10, Q7): 1 row por container + extraWindows.
describe('getContainerWindowRows (D-10)', () => {
  const containers = [{ id: 'CNT-1' }, { id: 'CNT-2' }]

  it('ordem de containers[]; container sem janela -> window: null', () => {
    const { rows } = getContainerWindowRows([], containers)
    expect(rows.map((row) => row.container.id)).toEqual(['CNT-1', 'CNT-2'])
    expect(rows.every((row) => row.window === null)).toBe(true)
  })

  it('janela achada por containerId entra na row correspondente', () => {
    const window = { id: 'W1', containerId: 'CNT-2', scheduledAt: '2026-01-01T10:00:00' }
    const { rows, extraWindows } = getContainerWindowRows([window], containers)
    expect(rows[0].window).toBeNull()
    expect(rows[1].window).toEqual(window)
    expect(extraWindows).toEqual([])
  })

  it('janela orfa (containerId de container removido) -> extraWindows', () => {
    const window = { id: 'W1', containerId: 'CNT-REMOVIDO', scheduledAt: '' }
    const { rows, extraWindows } = getContainerWindowRows([window], containers)
    expect(rows.every((row) => row.window === null)).toBe(true)
    expect(extraWindows).toEqual([window])
  })

  it('2a janela do mesmo container -> extraWindows', () => {
    const window1 = { id: 'W1', containerId: 'CNT-1', scheduledAt: '' }
    const window2 = { id: 'W2', containerId: 'CNT-1', scheduledAt: '' }
    const { rows, extraWindows } = getContainerWindowRows([window1, window2], containers)
    expect(rows[0].window).toEqual(window1)
    expect(extraWindows).toEqual([window2])
  })

  it('janela sem containerId -> extraWindows', () => {
    const window = { id: 'W1', containerId: '', scheduledAt: '' }
    const { extraWindows } = getContainerWindowRows([window], containers)
    expect(extraWindows).toEqual([window])
  })
})

describe('isContainerRemovalLocked (D-10, Q8)', () => {
  it('janela agendada (scheduledAt nao-vazio) -> true', () => {
    expect(
      isContainerRemovalLocked('CNT-1', [
        { containerId: 'CNT-1', scheduledAt: '2026-01-01T10:00:00' },
      ])
    ).toBe(true)
  })

  it('janela sem horario -> false', () => {
    expect(isContainerRemovalLocked('CNT-1', [{ containerId: 'CNT-1', scheduledAt: '' }])).toBe(
      false
    )
  })

  it('janela de outro container -> false', () => {
    expect(
      isContainerRemovalLocked('CNT-1', [
        { containerId: 'CNT-2', scheduledAt: '2026-01-01T10:00:00' },
      ])
    ).toBe(false)
  })

  it('sem janelas -> false', () => {
    expect(isContainerRemovalLocked('CNT-1', [])).toBe(false)
    expect(isContainerRemovalLocked('CNT-1', undefined)).toBe(false)
  })
})
