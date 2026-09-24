// F17.2c (D-5): cobertura de `containerId` em collectionWindows.js. Primeiro
// teste unitario deste util (nao entra na contagem `tests.totalFiles` do
// audit-vault-counts.cjs, que so soma tests/firebase + tests/functions +
// tests/ui).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  addCollectionWindow,
  createCollectionWindow,
  getCollectionWindows,
  normalizeCollectionWindow,
  normalizeCollectionWindows,
  serializeCollectionWindowsForFirestore,
} from '../../src/utils/collectionWindows.js'

describe('normalizeCollectionWindow - containerId (D-5)', () => {
  it('preserva e trima containerId', () => {
    const result = normalizeCollectionWindow({ containerId: ' CNT-1 ', scheduledAt: '' }, 0)
    expect(result.containerId).toBe('CNT-1')
  })

  it('containerId ausente -> ""', () => {
    const result = normalizeCollectionWindow({ scheduledAt: '' }, 0)
    expect(result.containerId).toBe('')
  })

  it('containerId nao-string -> ""', () => {
    const result = normalizeCollectionWindow({ containerId: 123, scheduledAt: '' }, 0)
    expect(result.containerId).toBe('')
  })
})

describe('createCollectionWindow/addCollectionWindow repassam containerId', () => {
  it('createCollectionWindow com containerId', () => {
    expect(createCollectionWindow({ containerId: 'CNT-2' }).containerId).toBe('CNT-2')
  })

  it('createCollectionWindow default ""', () => {
    expect(createCollectionWindow({}).containerId).toBe('')
  })

  it('addCollectionWindow repassa containerId', () => {
    const result = addCollectionWindow([], { containerId: 'CNT-3' })
    expect(result[0].containerId).toBe('CNT-3')
  })
})

describe('serializeCollectionWindowsForFirestore grava containerId', () => {
  it('inclui a chave containerId no payload serializado', () => {
    const serialized = serializeCollectionWindowsForFirestore([
      { id: 'W1', containerNumber: 1, containerId: 'CNT-1', scheduledAt: '', notes: '' },
    ])
    expect(serialized[0]).toEqual({
      id: 'W1',
      containerNumber: 1,
      containerId: 'CNT-1',
      scheduledAt: '',
      notes: '',
    })
  })
})

describe('janela legada sem containerId continua normalizando', () => {
  it('array de janelas legado (sem containerId) normaliza com containerId ""', () => {
    const result = normalizeCollectionWindows([{ id: 'W1', containerNumber: 1, scheduledAt: '2026-01-01T10:00:00' }])
    expect(result[0].containerId).toBe('')
    expect(result[0].containerNumber).toBe(1)
  })
})

describe('fallback collectionScheduledAt intacto (dual schema)', () => {
  it('so legacyScheduledAt -> 1 janela com containerNumber = containerQuantity', () => {
    const result = normalizeCollectionWindows(undefined, {
      legacyScheduledAt: '2026-01-01T10:00:00',
      containerQuantity: 3,
    })
    expect(result).toHaveLength(1)
    expect(result[0].containerNumber).toBe(3)
    expect(result[0].containerId).toBe('')
  })

  it('getCollectionWindows le o fallback legado do processo', () => {
    const windows = getCollectionWindows({
      collectionScheduledAt: '2026-01-01T10:00:00',
      containerQuantity: 1,
    })
    expect(windows).toHaveLength(1)
  })
})

// F17.2d-2 (D-12): comparador estavel - janela sem scheduledAt vai pro fim
// (nunca NaN); empate preserva ordem de entrada.
describe('normalizeCollectionWindows - ordenacao estavel (D-12)', () => {
  it('[vazia, 10h, 09h] -> [09h, 10h, vazia]', () => {
    const result = normalizeCollectionWindows([
      { id: 'W-vazia', containerNumber: 1, scheduledAt: '' },
      { id: 'W-10h', containerNumber: 2, scheduledAt: '2026-01-01T10:00:00' },
      { id: 'W-09h', containerNumber: 3, scheduledAt: '2026-01-01T09:00:00' },
    ])
    expect(result.map((w) => w.id)).toEqual(['W-09h', 'W-10h', 'W-vazia'])
  })

  it('empate de horario preserva ordem de entrada', () => {
    const result = normalizeCollectionWindows([
      { id: 'W-A', containerNumber: 1, scheduledAt: '2026-01-01T10:00:00' },
      { id: 'W-B', containerNumber: 2, scheduledAt: '2026-01-01T10:00:00' },
    ])
    expect(result.map((w) => w.id)).toEqual(['W-A', 'W-B'])
  })

  it('todas vazias preservam ordem de entrada', () => {
    const result = normalizeCollectionWindows([
      { id: 'W-A', containerNumber: 1, scheduledAt: '' },
      { id: 'W-B', containerNumber: 2, scheduledAt: '' },
    ])
    expect(result.map((w) => w.id)).toEqual(['W-A', 'W-B'])
  })

  it('addCollectionWindow tambem empurra vazia pro fim', () => {
    const existing = normalizeCollectionWindows([
      { id: 'W-10h', containerNumber: 1, scheduledAt: '2026-01-01T10:00:00' },
    ])
    const result = addCollectionWindow(existing, { containerNumber: 2, scheduledAt: '' })
    expect(result[0].scheduledAt).toBe(existing[0].scheduledAt)
    expect(result[1].scheduledAt).toBe('')
  })
})
