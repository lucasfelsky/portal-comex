// F17.2c/F17.2d-2 (D-1): cobertura de purchaseOrders.js (POs do CONSOLIDADO).
// F17.2d-2 (Q6/Q1): cada PO virou objeto `{ po, reference, supplierName }`.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  MAX_PURCHASE_ORDERS,
  MIN_CONSOLIDATED_PURCHASE_ORDERS,
  canSeePurchaseOrderDetails,
  clearRemovedPurchaseOrderLinks,
  formatPurchaseOrderLine,
  formatPurchaseOrdersSummary,
  getProcessPurchaseOrders,
  getPurchaseOrderNumbers,
  getPurchaseOrderSearchTerms,
  normalizeItemPoNumber,
  normalizePurchaseOrders,
} from '../../src/features/processes/purchaseOrders.js'

describe('normalizePurchaseOrders', () => {
  it('nao-array -> []', () => {
    expect(normalizePurchaseOrders(undefined)).toEqual([])
    expect(normalizePurchaseOrders(null)).toEqual([])
    expect(normalizePurchaseOrders('PO-1')).toEqual([])
  })

  it('string vira objeto com reference/supplierName vazios', () => {
    expect(normalizePurchaseOrders([' PO-1 ', '', '   ', 'PO-2'])).toEqual([
      { po: 'PO-1', reference: '', supplierName: '' },
      { po: 'PO-2', reference: '', supplierName: '' },
    ])
  })

  it('objeto: po sempre trim; reference/supplierName trim por default', () => {
    expect(
      normalizePurchaseOrders([{ po: ' PO-1 ', reference: ' REF-1 ', supplierName: ' ACME ' }])
    ).toEqual([{ po: 'PO-1', reference: 'REF-1', supplierName: 'ACME' }])
  })

  it('trimText: false preserva espacos em reference/supplierName (draft)', () => {
    expect(
      normalizePurchaseOrders(
        [{ po: 'PO-1', reference: 'ACME ', supplierName: 'ACME ' }],
        { trimText: false }
      )
    ).toEqual([{ po: 'PO-1', reference: 'ACME ', supplierName: 'ACME ' }])
  })

  it('dedup case-insensitive por po preservando a 1a grafia (string + objeto)', () => {
    expect(
      normalizePurchaseOrders(['PO-1', { po: 'po-1', reference: 'R' }, 'Po-1'])
    ).toEqual([{ po: 'PO-1', reference: '', supplierName: '' }])
  })

  it('teto de 50', () => {
    const raw = Array.from({ length: 60 }, (_, i) => `PO-${i}`)
    expect(normalizePurchaseOrders(raw)).toHaveLength(MAX_PURCHASE_ORDERS)
  })

  it('MIN_CONSOLIDATED_PURCHASE_ORDERS e 2', () => {
    expect(MIN_CONSOLIDATED_PURCHASE_ORDERS).toBe(2)
  })
})

describe('getPurchaseOrderNumbers', () => {
  it('aceita strings e objetos, trim, descarta vazios', () => {
    expect(getPurchaseOrderNumbers([' PO-1 ', { po: 'PO-2' }, '', { po: '  ' }])).toEqual([
      'PO-1',
      'PO-2',
    ])
  })

  it('nao-array -> []', () => {
    expect(getPurchaseOrderNumbers(undefined)).toEqual([])
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

  it('array de objetos ja preenchidos -> preservado (trim), NAO preenche supplierName', () => {
    expect(
      getProcessPurchaseOrders({
        category: 'CONSOLIDADO',
        purchaseOrders: [{ po: ' PO-1 ', reference: '', supplierName: '' }],
        supplierName: 'ACME',
      })
    ).toEqual([{ po: 'PO-1', reference: '', supplierName: '' }])
  })

  it('array de strings + supplierName do processo -> preenche todas as POs', () => {
    expect(
      getProcessPurchaseOrders({
        category: 'CONSOLIDADO',
        purchaseOrders: ['PO-1', 'PO-2'],
        supplierName: 'ACME',
      })
    ).toEqual([
      { po: 'PO-1', reference: '', supplierName: 'ACME' },
      { po: 'PO-2', reference: '', supplierName: 'ACME' },
    ])
  })

  it('lista mista (string + objeto que ja tem supplierName) -> NAO preenche', () => {
    expect(
      getProcessPurchaseOrders({
        category: 'CONSOLIDADO',
        purchaseOrders: ['PO-1', { po: 'PO-2', reference: '', supplierName: 'BETA' }],
        supplierName: 'ACME',
      })
    ).toEqual([
      { po: 'PO-1', reference: '', supplierName: '' },
      { po: 'PO-2', reference: '', supplierName: 'BETA' },
    ])
  })

  it('sem array (doc legado) -> fallback processNumber + supplierName preenche', () => {
    expect(
      getProcessPurchaseOrders({ category: 'CONSOLIDADO', processNumber: '9999', supplierName: 'ACME' })
    ).toEqual([{ po: '9999', reference: '', supplierName: 'ACME' }])
  })

  it('sem array e sem processNumber -> []', () => {
    expect(getProcessPurchaseOrders({ category: 'CONSOLIDADO' })).toEqual([])
  })

  it('fallback usa code quando processNumber ausente', () => {
    expect(getProcessPurchaseOrders({ category: 'CONSOLIDADO', code: '1234' })).toEqual([
      { po: '1234', reference: '', supplierName: '' },
    ])
  })
})

describe('formatPurchaseOrdersSummary', () => {
  it('vazia -> ""', () => {
    expect(formatPurchaseOrdersSummary([])).toBe('')
  })

  it('1 PO (objeto) -> "PO: A"', () => {
    expect(formatPurchaseOrdersSummary([{ po: 'A' }])).toBe('PO: A')
  })

  it('2 POs (objetos) -> "POs: A, B"', () => {
    expect(formatPurchaseOrdersSummary([{ po: 'A' }, { po: 'B' }])).toBe('POs: A, B')
  })

  it('5 POs (strings legadas) -> "POs: A, B (+3)"', () => {
    expect(formatPurchaseOrdersSummary(['A', 'B', 'C', 'D', 'E'])).toBe('POs: A, B (+3)')
  })
})

describe('normalizeItemPoNumber', () => {
  it('valor presente na lista (objetos) -> mantido', () => {
    expect(normalizeItemPoNumber('PO-1', [{ po: 'PO-1' }, { po: 'PO-2' }])).toBe('PO-1')
  })

  it('valor fora da lista -> ""', () => {
    expect(normalizeItemPoNumber('PO-3', [{ po: 'PO-1' }, { po: 'PO-2' }])).toBe('')
  })

  it('trim antes de comparar', () => {
    expect(normalizeItemPoNumber(' PO-1 ', [{ po: 'PO-1' }])).toBe('PO-1')
  })

  it('lista vazia/ausente -> ""', () => {
    expect(normalizeItemPoNumber('PO-1', [])).toBe('')
    expect(normalizeItemPoNumber('PO-1', undefined)).toBe('')
  })

  it('funciona tambem com lista de strings legadas', () => {
    expect(normalizeItemPoNumber('PO-1', ['PO-1', 'PO-2'])).toBe('PO-1')
  })
})

describe('clearRemovedPurchaseOrderLinks', () => {
  it('limpa poNumber de itens fora da lista atual (objetos)', () => {
    const items = [
      { id: '1', poNumber: 'PO-1' },
      { id: '2', poNumber: 'PO-2' },
    ]
    expect(clearRemovedPurchaseOrderLinks(items, [{ po: 'PO-1' }])).toEqual([
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

describe('canSeePurchaseOrderDetails', () => {
  it('flag de ROLE - boolean puro', () => {
    expect(canSeePurchaseOrderDetails(true)).toBe(true)
    expect(canSeePurchaseOrderDetails(false)).toBe(false)
    expect(canSeePurchaseOrderDetails(undefined)).toBe(false)
  })
})

describe('formatPurchaseOrderLine', () => {
  const order = { po: 'PO-1', reference: 'REF-1', supplierName: 'ACME' }

  it('sem canSeeDetails -> so po', () => {
    expect(formatPurchaseOrderLine(order, false)).toBe('PO-1')
  })

  it('com canSeeDetails -> po + referencia + fornecedor', () => {
    expect(formatPurchaseOrderLine(order, true)).toBe('PO-1 · Ref.: REF-1 · Fornecedor: ACME')
  })

  it('com canSeeDetails mas sem reference/supplierName -> so po', () => {
    expect(formatPurchaseOrderLine({ po: 'PO-1', reference: '', supplierName: '' }, true)).toBe(
      'PO-1'
    )
  })

  it('string legada -> so po, mesmo com canSeeDetails', () => {
    expect(formatPurchaseOrderLine('PO-1', true)).toBe('PO-1')
  })
})

describe('getPurchaseOrderSearchTerms', () => {
  const list = [
    { po: 'PO-1', reference: 'REF-1', supplierName: 'ACME' },
    { po: 'PO-2', reference: '', supplierName: '' },
  ]

  it('sem canSeeDetails -> so os po', () => {
    expect(getPurchaseOrderSearchTerms(list, false)).toEqual(['PO-1', 'PO-2'])
  })

  it('com canSeeDetails -> po + reference + supplierName (quando presentes)', () => {
    expect(getPurchaseOrderSearchTerms(list, true)).toEqual(['PO-1', 'REF-1', 'ACME', 'PO-2'])
  })

  it('lista de strings legadas -> so os po, mesmo com canSeeDetails', () => {
    expect(getPurchaseOrderSearchTerms(['PO-1', 'PO-2'], true)).toEqual(['PO-1', 'PO-2'])
  })
})
