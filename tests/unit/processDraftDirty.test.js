// UX-3a (D6): comparacao normalizada do draft de processo. Nao entra na
// contagem `tests.totalFiles` do audit-vault-counts.cjs.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { areProcessDraftsEquivalent } from '../../src/features/processes/processDraftDirty'

describe('areProcessDraftsEquivalent', () => {
  it('objetos identicos sao equivalentes', () => {
    const draft = { name: 'Importação Atlas', category: 'FCL', containerQuantity: 2 }
    expect(areProcessDraftsEquivalent(draft, { ...draft })).toBe(true)
  })

  it('strings com espacos nas pontas sao equivalentes apos trim', () => {
    expect(areProcessDraftsEquivalent({ name: '  x ' }, { name: 'x' })).toBe(true)
  })

  it('null, undefined e string vazia sao equivalentes entre si', () => {
    expect(areProcessDraftsEquivalent({ notes: null }, { notes: undefined })).toBe(true)
    expect(areProcessDraftsEquivalent({ notes: undefined }, { notes: '' })).toBe(true)
    expect(areProcessDraftsEquivalent({ notes: '' }, { notes: null })).toBe(true)
  })

  it("numero e string numerica sao equivalentes ('5' == 5)", () => {
    expect(areProcessDraftsEquivalent({ containerQuantity: '5' }, { containerQuantity: 5 })).toBe(
      true
    )
  })

  it("'' e 0 NAO sao equivalentes", () => {
    expect(areProcessDraftsEquivalent({ containerQuantity: '' }, { containerQuantity: 0 })).toBe(
      false
    )
  })

  it('item novo em items torna os drafts diferentes', () => {
    const baseline = { items: [{ id: 'i1', commercialName: 'A', quantity: 1 }] }
    const draft = {
      items: [
        { id: 'i1', commercialName: 'A', quantity: 1 },
        { id: 'i2', commercialName: 'B', quantity: 1 },
      ],
    }
    expect(areProcessDraftsEquivalent(draft, baseline)).toBe(false)
  })

  it('PO removida das purchaseOrders torna os drafts diferentes', () => {
    const baseline = { purchaseOrders: ['PO-1', 'PO-2'] }
    const draft = { purchaseOrders: ['PO-1'] }
    expect(areProcessDraftsEquivalent(draft, baseline)).toBe(false)
  })

  it('container alterado dentro de um array aninhado torna os drafts diferentes', () => {
    const baseline = { containers: [{ number: 'ABCU1234567', type: '40HC' }] }
    const draft = { containers: [{ number: 'ABCU1234567', type: '20DV' }] }
    expect(areProcessDraftsEquivalent(draft, baseline)).toBe(false)
  })

  it('ordem de chaves diferente no objeto ainda e equivalente', () => {
    const draft = { name: 'Atlas', category: 'FCL' }
    const baseline = { category: 'FCL', name: 'Atlas' }
    expect(areProcessDraftsEquivalent(draft, baseline)).toBe(true)
  })

  it('funcoes sao ignoradas na comparacao', () => {
    const noop = () => {}
    expect(
      areProcessDraftsEquivalent({ name: 'Atlas', onSave: noop }, { name: 'Atlas', onSave: () => {} })
    ).toBe(true)
  })
})
