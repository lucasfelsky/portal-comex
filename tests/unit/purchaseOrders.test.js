// F17.2c (D-1): cobertura de purchaseOrders.js (POs do CONSOLIDADO).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  MAX_PURCHASE_ORDERS,
  MIN_CONSOLIDATED_PURCHASE_ORDERS,
  clearRemovedPurchaseOrderLinks,
  formatPurchaseOrdersSummary,
  getProcessPurchaseOrders,
  normalizeItemPoNumber,
  normalizePurchaseOrders,
} from '../../src/features/processes/purchaseOrders.js'

describe('normalizePurchaseOrders', () => {
  it('nao-array -> []', () => {
    expect(normalizePurchaseOrders(undefined)).toEqual([])
    expect(normalizePurchaseOrders(null)).toEqual([])
    expect(normalizePurchaseOrders('PO-1')).toEqual([])
  })

  it('trim e descarta vazios', () => {
    expect(normalizePurchaseOrders([' PO-1 ', '', '   ', 'PO-2'])).toEqual(['PO-1', 'PO-2'])
  })

  it('dedup case-insensitive preservando a 1a grafia', () => {
    expect(normalizePurchaseOrders(['PO-1', 'po-1', 'Po-1'])).toEqual(['PO-1'])
  })

  it('teto de 50', () => {
    const raw = Array.from({ length: 60 }, (_, i) => `PO-${i}`)
    expect(normalizePurchaseOrders(raw)).toHaveLength(MAX_PURCHASE_ORDERS)
  })

  it('MIN_CONSOLIDATED_PURCHASE_ORDERS e 2', () => {
    expect(MIN_CONSOLIDATED_PURCHASE_ORDERS).toBe(2)
  })
})

describe('getProcessPurchaseOrders', () => {
  it('categoria != CONSOLIDADO -> []', () => {
    expect(getProcessPurchaseOrders({ category: 'FCL', purchaseOrders: ['PO-1'] })).toEqual([])
  })

  it('array presente e AUTORITATIVO mesmo vazio', () => {
    expect(
      getProcessPurchaseOrders({ category: 'CONSOLIDADO', purchaseOrders: [], processNumber: 'X' })
    ).toEqual([])
  })

  it('array presente com valores -> normalizado', () => {
    expect(
      getProcessPurchaseOrders({ category: 'CONSOLIDADO', purchaseOrders: [' PO-1 ', 'PO-1'] })
    ).toEqual(['PO-1'])
  })

  it('sem array (doc legado) -> fallback processNumber', () => {
    expect(
      getProcessPurchaseOrders({ category: 'CONSOLIDADO', processNumber: '9999' })
    ).toEqual(['9999'])
  })

  it('sem array e sem processNumber -> []', () => {
    expect(getProcessPurchaseOrders({ category: 'CONSOLIDADO' })).toEqual([])
  })

  it('fallback usa code quando processNumber ausente', () => {
    expect(getProcessPurchaseOrders({ category: 'CONSOLIDADO', code: '1234' })).toEqual(['1234'])
  })
})

describe('formatPurchaseOrdersSummary', () => {
  it('vazia -> ""', () => {
    expect(formatPurchaseOrdersSummary([])).toBe('')
  })

  it('1 PO -> "PO: A"', () => {
    expect(formatPurchaseOrdersSummary(['A'])).toBe('PO: A')
  })

  it('2 POs -> "POs: A, B"', () => {
    expect(formatPurchaseOrdersSummary(['A', 'B'])).toBe('POs: A, B')
  })

  it('5 POs -> "POs: A, B (+3)"', () => {
    expect(formatPurchaseOrdersSummary(['A', 'B', 'C', 'D', 'E'])).toBe('POs: A, B (+3)')
  })
})

describe('normalizeItemPoNumber', () => {
  it('valor presente na lista -> mantido', () => {
    expect(normalizeItemPoNumber('PO-1', ['PO-1', 'PO-2'])).toBe('PO-1')
  })

  it('valor fora da lista -> ""', () => {
    expect(normalizeItemPoNumber('PO-3', ['PO-1', 'PO-2'])).toBe('')
  })

  it('trim antes de comparar', () => {
    expect(normalizeItemPoNumber(' PO-1 ', ['PO-1'])).toBe('PO-1')
  })

  it('lista vazia/ausente -> ""', () => {
    expect(normalizeItemPoNumber('PO-1', [])).toBe('')
    expect(normalizeItemPoNumber('PO-1', undefined)).toBe('')
  })
})

describe('clearRemovedPurchaseOrderLinks', () => {
  it('limpa poNumber de itens fora da lista atual', () => {
    const items = [
      { id: '1', poNumber: 'PO-1' },
      { id: '2', poNumber: 'PO-2' },
    ]
    expect(clearRemovedPurchaseOrderLinks(items, ['PO-1'])).toEqual([
      { id: '1', poNumber: 'PO-1' },
      { id: '2', poNumber: '' },
    ])
  })

  it('itens sem poNumber ficam intactos', () => {
    const items = [{ id: '1', commercialName: 'x' }]
    expect(clearRemovedPurchaseOrderLinks(items, [])).toEqual(items)
  })

  it('nao-array -> []', () => {
    expect(clearRemovedPurchaseOrderLinks(undefined, ['PO-1'])).toEqual([])
  })
})
