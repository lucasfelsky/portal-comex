// F18a: helpers puros de src/features/processes/processDocuments.js +
// paridade com functions/src/process/documents.js (planDocumentRotation).

import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_TYPES,
  buildDocumentSlotKey,
  canDeleteDocument,
  canUploadDocumentType,
  canViewProcessRecords,
  formatDocumentSize,
  getDocumentTypeLabel,
  getSlotKeyPoNumber,
  groupDocumentsBySlot,
  isProcessDocumentType,
} from '../../src/features/processes/processDocuments'

describe('DOCUMENT_TYPES', () => {
  it('tem os 7 tipos esperados', () => {
    expect(DOCUMENT_TYPES.map((type) => type.id)).toEqual([
      'bl', 'cargoReport', 'invoice', 'packingList', 'fispq', 'containerWash', 'other',
    ])
  })

  it('isProcessDocumentType/getDocumentTypeLabel', () => {
    expect(isProcessDocumentType('bl')).toBe(true)
    expect(isProcessDocumentType('inexistente')).toBe(false)
    expect(getDocumentTypeLabel('bl')).toBe('BL/AWB')
    expect(getDocumentTypeLabel('containerWash')).toBe('Relatório de lavação')
  })
})

describe('canViewProcessRecords', () => {
  it('admin/logistica veem; user/undefined nao', () => {
    expect(canViewProcessRecords('admin')).toBe(true)
    expect(canViewProcessRecords('logistica')).toBe(true)
    expect(canViewProcessRecords('user')).toBe(false)
    expect(canViewProcessRecords(undefined)).toBe(false)
  })
})

describe('canUploadDocumentType', () => {
  it('admin envia qualquer tipo', () => {
    for (const type of DOCUMENT_TYPES.map((t) => t.id)) {
      expect(canUploadDocumentType('admin', type)).toBe(true)
    }
  })

  it('logistica so envia containerWash', () => {
    expect(canUploadDocumentType('logistica', 'containerWash')).toBe(true)
    expect(canUploadDocumentType('logistica', 'bl')).toBe(false)
    expect(canUploadDocumentType('logistica', 'invoice')).toBe(false)
  })

  it('user nunca envia', () => {
    expect(canUploadDocumentType('user', 'bl')).toBe(false)
  })

  it('tipo invalido -> false', () => {
    expect(canUploadDocumentType('admin', 'inexistente')).toBe(false)
  })
})

describe('canDeleteDocument', () => {
  it('admin apaga qualquer documento', () => {
    expect(canDeleteDocument({ role: 'admin', uid: 'admin-1' }, { uploadedById: 'log-1' })).toBe(true)
  })

  it('logistica apaga so o proprio', () => {
    expect(canDeleteDocument({ role: 'logistica', uid: 'log-1' }, { uploadedById: 'log-1' })).toBe(true)
    expect(canDeleteDocument({ role: 'logistica', uid: 'log-1' }, { uploadedById: 'log-2' })).toBe(false)
  })

  it('user nunca apaga', () => {
    expect(canDeleteDocument({ role: 'user', uid: 'u-1' }, { uploadedById: 'u-1' })).toBe(false)
  })
})

describe('buildDocumentSlotKey', () => {
  it('bl/cargoReport -> igual ao type', () => {
    expect(buildDocumentSlotKey('bl')).toBe('bl')
    expect(buildDocumentSlotKey('cargoReport')).toBe('cargoReport')
  })

  it('fispq -> fispq:<itemId>', () => {
    expect(buildDocumentSlotKey('fispq', { itemId: 'ITEM-1' })).toBe('fispq:ITEM-1')
  })

  it('containerWash -> containerWash:<containerId>', () => {
    expect(buildDocumentSlotKey('containerWash', { containerId: 'CNT-1' })).toBe('containerWash:CNT-1')
  })

  it('other -> other:<documentId>', () => {
    expect(buildDocumentSlotKey('other', { documentId: 'doc-1' })).toBe('other:doc-1')
  })

  it('invoice/packingList fora do CONSOLIDADO -> slot unico', () => {
    expect(buildDocumentSlotKey('invoice', { category: 'FCL', po: 'PO-1' })).toBe('invoice')
    expect(buildDocumentSlotKey('packingList', { category: 'AEREO' })).toBe('packingList')
  })

  it('AD-1: invoice/packingList no CONSOLIDADO -> slot por PO', () => {
    expect(buildDocumentSlotKey('invoice', { category: 'CONSOLIDADO', po: 'PO-1' })).toBe('invoice:PO-1')
    expect(buildDocumentSlotKey('packingList', { category: 'CONSOLIDADO', po: 'PO-2' })).toBe('packingList:PO-2')
  })
})

describe('getSlotKeyPoNumber (AD-1)', () => {
  it('extrai a PO de invoice/packingList escopados', () => {
    expect(getSlotKeyPoNumber('invoice', 'invoice:PO-1')).toBe('PO-1')
    expect(getSlotKeyPoNumber('packingList', 'packingList:PO-2')).toBe('PO-2')
  })

  it('slot unico ou tipo sem PO -> string vazia', () => {
    expect(getSlotKeyPoNumber('invoice', 'invoice')).toBe('')
    expect(getSlotKeyPoNumber('bl', 'bl')).toBe('')
    expect(getSlotKeyPoNumber('fispq', 'fispq:ITEM-1')).toBe('')
  })
})

describe('groupDocumentsBySlot', () => {
  it('agrupa por slotKey, principal = mais novo, previous = 2o mais novo', () => {
    const docs = [
      { id: 'd1', slotKey: 'bl', uploadedAt: '2026-09-01T10:00:00.000Z' },
      { id: 'd2', slotKey: 'bl', uploadedAt: '2026-09-03T10:00:00.000Z' },
      { id: 'd3', slotKey: 'bl', uploadedAt: '2026-09-02T10:00:00.000Z' },
    ]
    const [group] = groupDocumentsBySlot(docs)
    expect(group.slotKey).toBe('bl')
    expect(group.primary.id).toBe('d2')
    expect(group.previous.id).toBe('d3')
  })

  it('grupo solteiro (sem versao anterior)', () => {
    const docs = [{ id: 'd1', slotKey: 'other:doc-1', uploadedAt: '2026-09-01T10:00:00.000Z' }]
    const [group] = groupDocumentsBySlot(docs)
    expect(group.primary.id).toBe('d1')
    expect(group.previous).toBeNull()
  })

  it('lista vazia -> []', () => {
    expect(groupDocumentsBySlot([])).toEqual([])
    expect(groupDocumentsBySlot(undefined)).toEqual([])
  })

  it('2 slots diferentes -> 2 grupos', () => {
    const docs = [
      { id: 'd1', slotKey: 'bl', uploadedAt: '2026-09-01T10:00:00.000Z' },
      { id: 'd2', slotKey: 'cargoReport', uploadedAt: '2026-09-01T10:00:00.000Z' },
    ]
    expect(groupDocumentsBySlot(docs)).toHaveLength(2)
  })
})

describe('formatDocumentSize', () => {
  it('bytes/KB/MB', () => {
    expect(formatDocumentSize(500)).toBe('500 B')
    expect(formatDocumentSize(2048)).toBe('2 KB')
    expect(formatDocumentSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('valores invalidos -> string vazia', () => {
    expect(formatDocumentSize(0)).toBe('')
    expect(formatDocumentSize(-1)).toBe('')
    expect(formatDocumentSize(NaN)).toBe('')
  })
})
