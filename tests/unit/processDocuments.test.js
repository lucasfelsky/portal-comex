// F18a: helpers puros de src/features/processes/processDocuments.js +
// paridade com functions/src/process/documents.js (planDocumentRotation).

import { describe, expect, it } from 'vitest'
import {
  CONTAINER_WASH_CATEGORIES,
  DOCUMENT_MILESTONE_EVENT_TYPES,
  DOCUMENT_TYPES,
  buildDocumentPendingFields,
  buildDocumentSlotKey,
  canDeleteDocument,
  canUploadDocumentType,
  canViewProcessRecords,
  formatDocumentSize,
  getDocumentFileKindLabel,
  getDocumentIndexFromDocuments,
  getDocumentPendingFields,
  getDocumentTypeLabel,
  getSlotKeyPoNumber,
  getUnlinkedDocumentGroups,
  groupDocumentsBySlot,
  isFileDragEvent,
  isProcessDocumentType,
  normalizeDocumentIndex,
  pickSingleDroppedFile,
} from '../../src/features/processes/processDocuments'
import {
  DOCUMENT_MILESTONE_EVENT_TYPES as DOCUMENT_MILESTONE_EVENT_TYPES_FUNCTIONS,
  DOCUMENT_TYPE_LABELS,
  buildDocumentIndex,
  buildDocumentUploadedNotificationBody,
  describeDocumentScope,
  isSameDocumentIndex,
  normalizeDocumentIndexMirror,
} from '../../functions/src/process/documentIndex.js'

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
  it('bytes/KB/MB (virgula decimal pt-BR)', () => {
    expect(formatDocumentSize(500)).toBe('500 B')
    expect(formatDocumentSize(2048)).toBe('2 KB')
    expect(formatDocumentSize(3 * 1024 * 1024)).toBe('3,0 MB')
  })

  it('valores invalidos -> string vazia', () => {
    expect(formatDocumentSize(0)).toBe('')
    expect(formatDocumentSize(-1)).toBe('')
    expect(formatDocumentSize(NaN)).toBe('')
  })
})

// F18b-1 (B1): leitura do documentIndex (normalizeProcess).
describe('normalizeDocumentIndex', () => {
  it('ausente -> vazio CONHECIDO (processSlotKeys: [])', () => {
    const empty = { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] }
    expect(normalizeDocumentIndex(undefined)).toEqual(empty)
    expect(normalizeDocumentIndex(null)).toEqual(empty)
    expect(normalizeDocumentIndex([])).toEqual(empty)
    expect(normalizeDocumentIndex('x')).toEqual(empty)
  })

  it('objeto legado sem processSlotKeys -> null (desconhecido)', () => {
    expect(normalizeDocumentIndex({ fispqItemIds: ['A'] })).toEqual({
      fispqItemIds: ['A'],
      containerWashIds: [],
      processSlotKeys: null,
    })
  })

  it('paridade com normalizeDocumentIndexMirror (functions) e idempotencia', () => {
    const samples = [
      undefined,
      null,
      {},
      { fispqItemIds: ['A'] },
      { processSlotKeys: ['bl', 'bl', 1] },
      { processSlotKeys: 'x' },
    ]
    for (const sample of samples) {
      expect(normalizeDocumentIndex(sample)).toEqual(normalizeDocumentIndexMirror(sample))
      expect(normalizeDocumentIndex(normalizeDocumentIndex(sample))).toEqual(normalizeDocumentIndex(sample))
    }
  })

  it('lixo (nao-array, itens nao-string, duplicados) -> limpo/ordenado', () => {
    expect(
      normalizeDocumentIndex({
        fispqItemIds: ['ITEM-2', 'ITEM-1', 'ITEM-1', 123, null, ''],
        containerWashIds: 'nao-e-array',
      })
    ).toEqual({ fispqItemIds: ['ITEM-1', 'ITEM-2'], containerWashIds: [], processSlotKeys: null })
  })
})

// F18b-1 (B2/B3): paridade src x functions - `DOCUMENT_MILESTONE_EVENT_TYPES`
// (src) tem que ser IGUAL ao de `functions/` (deploy nao empacota `src/`).
describe('paridade DOCUMENT_MILESTONE_EVENT_TYPES src x functions', () => {
  it('mesmo mapa tipo -> evento', () => {
    expect(DOCUMENT_MILESTONE_EVENT_TYPES).toEqual(DOCUMENT_MILESTONE_EVENT_TYPES_FUNCTIONS)
  })

  it('so bl/fispq/containerWash geram marco', () => {
    expect(Object.keys(DOCUMENT_MILESTONE_EVENT_TYPES).sort()).toEqual(
      ['bl', 'containerWash', 'fispq'].sort()
    )
  })
})

// F18b-1 (B2): paridade dos labels de tipo (src `DOCUMENT_TYPES` x functions
// `DOCUMENT_TYPE_LABELS`).
describe('paridade DOCUMENT_TYPE_LABELS src x functions', () => {
  it('mesmo label por tipo', () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_LABELS[type.id]).toBe(type.label)
    }
  })
})

// F18b-1 (B2): funcoes puras de `functions/src/process/documentIndex.js`
// (mesmo modulo usado pelo trigger e pelo script de backfill).
describe('buildDocumentIndex/describeDocumentScope/buildDocumentUploadedNotificationBody (puras)', () => {
  it('buildDocumentIndex agrupa fispq/containerWash, ordenado e sem duplicata', () => {
    const index = buildDocumentIndex([
      { type: 'fispq', itemId: 'ITEM-2' },
      { type: 'fispq', itemId: 'ITEM-1' },
      { type: 'fispq', itemId: 'ITEM-1' },
      { type: 'containerWash', containerId: 'CNT-1' },
      { type: 'bl', slotKey: 'bl' },
      { type: 'invoice', slotKey: 'invoice:PO-1' },
      { type: 'other', slotKey: 'other:x' },
    ])
    expect(index).toEqual({
      fispqItemIds: ['ITEM-1', 'ITEM-2'],
      containerWashIds: ['CNT-1'],
      processSlotKeys: ['bl', 'invoice:PO-1'],
    })
  })

  it('buildDocumentIndex de lista vazia -> todos vazios', () => {
    const empty = { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] }
    expect(buildDocumentIndex([])).toEqual(empty)
    expect(buildDocumentIndex(undefined)).toEqual(empty)
  })

  it('isSameDocumentIndex: null x [] em processSlotKeys = diferente; ambos sem o campo = igual', () => {
    const base = { fispqItemIds: [], containerWashIds: [] }
    expect(isSameDocumentIndex({ ...base, processSlotKeys: null }, { ...base, processSlotKeys: [] })).toBe(false)
    expect(isSameDocumentIndex(base, base)).toBe(true)
    expect(isSameDocumentIndex({ ...base, processSlotKeys: ['bl'] }, { ...base, processSlotKeys: ['bl'] })).toBe(true)
    expect(isSameDocumentIndex({ ...base, processSlotKeys: ['bl'] }, { ...base, processSlotKeys: [] })).toBe(false)
  })

  it('isSameDocumentIndex compara por conteudo (ordem normalizada)', () => {
    expect(
      isSameDocumentIndex(
        { fispqItemIds: ['A', 'B'], containerWashIds: [] },
        normalizeDocumentIndexMirror({ fispqItemIds: ['B', 'A'], containerWashIds: [] })
      )
    ).toBe(true)
    expect(
      isSameDocumentIndex({ fispqItemIds: ['A'], containerWashIds: [] }, { fispqItemIds: ['A', 'B'], containerWashIds: [] })
    ).toBe(false)
  })

  it('describeDocumentScope: fispq usa commercialName do item (fallback o id)', () => {
    const process = { items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas' }] }
    expect(describeDocumentScope(process, { type: 'fispq', itemId: 'ITEM-1' })).toBe('Resina Atlas')
    expect(describeDocumentScope(process, { type: 'fispq', itemId: 'ITEM-999' })).toBe('ITEM-999')
    expect(describeDocumentScope(process, { type: 'fispq', itemId: '' })).toBe('')
  })

  it('describeDocumentScope: containerWash usa number (fallback Contêiner N, fallback o id)', () => {
    const process = { containers: [{ id: 'CNT-1', number: 'MSCU1234567' }, { id: 'CNT-2', number: '' }] }
    expect(describeDocumentScope(process, { type: 'containerWash', containerId: 'CNT-1' })).toBe('MSCU1234567')
    expect(describeDocumentScope(process, { type: 'containerWash', containerId: 'CNT-2' })).toBe('Contêiner 2')
    expect(describeDocumentScope(process, { type: 'containerWash', containerId: 'CNT-999' })).toBe('CNT-999')
  })

  it('describeDocumentScope: demais tipos -> string vazia', () => {
    expect(describeDocumentScope({}, { type: 'bl' })).toBe('')
    expect(describeDocumentScope({}, { type: 'invoice' })).toBe('')
  })

  it('buildDocumentUploadedNotificationBody: com escopo usa parenteses, sem escopo nao', () => {
    expect(buildDocumentUploadedNotificationBody('PO 123', 'Logi da Silva', 'FISPQ', 'Resina Atlas')).toBe(
      'Logi da Silva enviou FISPQ (Resina Atlas) em PO 123.'
    )
    expect(buildDocumentUploadedNotificationBody('PO 123', 'Logi da Silva', 'BL/AWB', '')).toBe(
      'Logi da Silva enviou BL/AWB em PO 123.'
    )
  })
})

// F18b-2 (E4): getDocumentIndexFromDocuments - paridade com buildDocumentIndex
// (functions), mesma regra.
describe('getDocumentIndexFromDocuments', () => {
  it('mesmo resultado de buildDocumentIndex (functions) para a mesma entrada', () => {
    const docs = [
      { type: 'fispq', itemId: 'ITEM-2' },
      { type: 'fispq', itemId: 'ITEM-1' },
      { type: 'containerWash', containerId: 'CNT-1' },
      { type: 'bl', slotKey: 'bl' },
      { type: 'invoice', slotKey: 'invoice:PO-1' },
      { type: 'other', slotKey: 'other:x' },
    ]
    expect(getDocumentIndexFromDocuments(docs)).toEqual(buildDocumentIndex(docs))
  })

  it('lista vazia -> todos vazios', () => {
    const empty = { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] }
    expect(getDocumentIndexFromDocuments([])).toEqual(empty)
    expect(getDocumentIndexFromDocuments(undefined)).toEqual(empty)
  })
})

describe('CONTAINER_WASH_CATEGORIES', () => {
  it('so FCL/CONSOLIDADO', () => {
    expect(CONTAINER_WASH_CATEGORIES).toEqual(['FCL', 'CONSOLIDADO'])
  })
})

// F18b-2 (E4): buildDocumentPendingFields/getDocumentPendingFields.
describe('buildDocumentPendingFields', () => {
  it('item IMO com id fora do indice -> pendencia fispq:<id>', () => {
    const process = {
      category: 'FCL',
      items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true }],
    }
    const fields = buildDocumentPendingFields(process, { fispqItemIds: [], containerWashIds: [] })
    expect(fields).toEqual([
      { id: 'fispq:ITEM-1', field: 'documents', label: 'FISPQ do item Resina Atlas', stage: 0 },
    ])
  })

  it('item sem commercialName -> "Item sem nome"', () => {
    const process = { category: 'FCL', items: [{ id: 'ITEM-1', dangerousGoods: true }] }
    const [field] = buildDocumentPendingFields(process, { fispqItemIds: [], containerWashIds: [] })
    expect(field.label).toBe('FISPQ do item Item sem nome')
  })

  it('item IMO ja no indice -> sem pendencia', () => {
    const process = {
      category: 'FCL',
      items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true }],
    }
    expect(buildDocumentPendingFields(process, { fispqItemIds: ['ITEM-1'], containerWashIds: [] })).toEqual([])
  })

  it('item sem id persistido e' + ' item nao-IMO -> ignorados', () => {
    const process = {
      category: 'FCL',
      items: [
        { commercialName: 'Sem id', dangerousGoods: true },
        { id: 'ITEM-2', commercialName: 'Nao perigoso', dangerousGoods: false },
      ],
    }
    expect(buildDocumentPendingFields(process, { fispqItemIds: [], containerWashIds: [] })).toEqual([])
  })

  it('conteiner devolvido fora do indice (FCL/CONSOLIDADO) -> pendencia containerWash:<id>', () => {
    const process = {
      category: 'FCL',
      containers: [{ id: 'CNT-1', number: 'MSCU1234567', returnedAt: '2026-09-01' }],
    }
    const fields = buildDocumentPendingFields(process, { fispqItemIds: [], containerWashIds: [] })
    expect(fields).toEqual([
      {
        id: 'containerWash:CNT-1',
        field: 'documents',
        label: 'Relatório de lavação do contêiner MSCU1234567',
        stage: 4,
      },
    ])
  })

  it('conteiner sem returnedAt -> sem pendencia', () => {
    const process = { category: 'FCL', containers: [{ id: 'CNT-1', returnedAt: '' }] }
    expect(buildDocumentPendingFields(process, { fispqItemIds: [], containerWashIds: [] })).toEqual([])
  })

  it('categoria fora de FCL/CONSOLIDADO -> nunca gera pendencia de lavacao', () => {
    const process = {
      category: 'LCL',
      containers: [{ id: 'CNT-1', returnedAt: '2026-09-01' }],
    }
    expect(buildDocumentPendingFields(process, { fispqItemIds: [], containerWashIds: [] })).toEqual([])
  })
})

describe('buildDocumentPendingFields - embarque confirmado (BL/Relatorio/Invoice/Packing)', () => {
  const noDocs = { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] }
  const ids = (fields) => fields.map((field) => field.id)

  it.each(['FCL', 'LCL', 'AEREO'])('%s embarcado sem documentos -> 4 pendencias com labels e stage 1', (category) => {
    const fields = buildDocumentPendingFields({ category, shippedAt: '2026-09-01' }, noDocs)
    expect(fields).toEqual([
      { id: 'bl', field: 'documents', label: 'BL/AWB', stage: 1 },
      { id: 'cargoReport', field: 'documents', label: 'Relatório de carga', stage: 1 },
      { id: 'invoice', field: 'documents', label: 'Invoice', stage: 1 },
      { id: 'packingList', field: 'documents', label: 'Packing List', stage: 1 },
    ])
  })

  it('sem shippedAt -> nenhum dos 4', () => {
    expect(buildDocumentPendingFields({ category: 'FCL' }, noDocs)).toEqual([])
  })

  it('embarcado com os 4 presentes -> nenhum', () => {
    const index = { ...noDocs, processSlotKeys: ['bl', 'cargoReport', 'invoice', 'packingList'] }
    expect(buildDocumentPendingFields({ category: 'LCL', shippedAt: '2026-09-01' }, index)).toEqual([])
  })

  it('CONSOLIDADO: 1 pendencia de invoice/packing por PO', () => {
    const process = {
      category: 'CONSOLIDADO',
      shippedAt: '2026-09-01',
      purchaseOrders: [{ po: '4500130' }, { po: '4500131' }],
    }
    const fields = buildDocumentPendingFields(process, { ...noDocs, processSlotKeys: ['bl', 'cargoReport'] })
    expect(ids(fields)).toEqual([
      'invoice:4500130',
      'packingList:4500130',
      'invoice:4500131',
      'packingList:4500131',
    ])
    expect(fields[0].label).toBe('Invoice da PO 4500130')
    expect(fields[1].label).toBe('Packing List da PO 4500130')
    expect(fields.every((field) => field.stage === 1)).toBe(true)
  })

  it('CONSOLIDADO com slot unico `invoice` no indice ainda cobra invoice:<po>', () => {
    const process = { category: 'CONSOLIDADO', shippedAt: '2026-09-01', purchaseOrders: [{ po: '4500130' }] }
    const fields = buildDocumentPendingFields(process, { ...noDocs, processSlotKeys: ['bl', 'cargoReport', 'invoice'] })
    expect(ids(fields)).toEqual(['invoice:4500130', 'packingList:4500130'])
  })

  it('CONSOLIDADO sem POs -> so bl/cargoReport', () => {
    const fields = buildDocumentPendingFields(
      { category: 'CONSOLIDADO', shippedAt: '2026-09-01', purchaseOrders: [] },
      noDocs
    )
    expect(ids(fields)).toEqual(['bl', 'cargoReport'])
  })

  it('indice legado (processSlotKeys null) -> nenhum dos 4, mas FISPQ continua', () => {
    const process = {
      category: 'FCL',
      shippedAt: '2026-09-01',
      items: [{ id: 'ITEM-1', commercialName: 'Resina', dangerousGoods: true }],
    }
    const fields = buildDocumentPendingFields(process, {
      fispqItemIds: [],
      containerWashIds: [],
      processSlotKeys: null,
    })
    expect(ids(fields)).toEqual(['fispq:ITEM-1'])
  })

  it('getDocumentPendingFields: documentIndex ausente + embarcado -> gera os 4', () => {
    const fields = getDocumentPendingFields({ category: 'FCL', shippedAt: '2026-09-01' })
    expect(ids(fields)).toEqual(['bl', 'cargoReport', 'invoice', 'packingList'])
  })

  it('ordem: FISPQ, documentos de embarque, lavacao', () => {
    const process = {
      category: 'FCL',
      shippedAt: '2026-09-01',
      items: [{ id: 'ITEM-1', commercialName: 'Resina', dangerousGoods: true }],
      containers: [{ id: 'CNT-1', number: 'M1', returnedAt: '2026-09-02' }],
    }
    expect(ids(buildDocumentPendingFields(process, noDocs))).toEqual([
      'fispq:ITEM-1',
      'bl',
      'cargoReport',
      'invoice',
      'packingList',
      'containerWash:CNT-1',
    ])
  })
})

describe('getDocumentPendingFields', () => {
  it('le process.documentIndex (normalizado)', () => {
    const process = {
      category: 'FCL',
      items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true }],
      documentIndex: { fispqItemIds: ['ITEM-1'] },
    }
    expect(getDocumentPendingFields(process)).toEqual([])
  })
})

// F18b-2 (E4): getUnlinkedDocumentGroups.
describe('getUnlinkedDocumentGroups', () => {
  const purchaseOrders = [{ po: 'PO-1' }, { po: 'PO-2' }]

  it('fispq: item removido / item nao-IMO / vinculado', () => {
    const process = { category: 'FCL', items: [{ id: 'ITEM-1', dangerousGoods: false }] }
    const groups = [
      { slotKey: 'fispq:ITEM-999', primary: { id: 'd1' } },
      { slotKey: 'fispq:ITEM-1', primary: { id: 'd2' } },
    ]
    const result = getUnlinkedDocumentGroups(groups, process, purchaseOrders)
    expect(result).toEqual([
      { slotKey: 'fispq:ITEM-999', primary: { id: 'd1' }, reason: 'Item removido' },
      { slotKey: 'fispq:ITEM-1', primary: { id: 'd2' }, reason: 'Item não é mais IMO' },
    ])
  })

  it('containerWash: categoria sem conteineres / conteiner removido', () => {
    const groups = [{ slotKey: 'containerWash:CNT-1', primary: { id: 'd1' } }]
    expect(getUnlinkedDocumentGroups(groups, { category: 'LCL', containers: [] }, [])).toEqual([
      { slotKey: 'containerWash:CNT-1', primary: { id: 'd1' }, reason: 'Categoria atual sem contêineres' },
    ])
    expect(getUnlinkedDocumentGroups(groups, { category: 'FCL', containers: [] }, [])).toEqual([
      { slotKey: 'containerWash:CNT-1', primary: { id: 'd1' }, reason: 'Contêiner removido' },
    ])
    expect(
      getUnlinkedDocumentGroups(
        groups,
        { category: 'FCL', containers: [{ id: 'CNT-1' }] },
        []
      )
    ).toEqual([])
  })

  it('invoice/packingList: categoria mudou / PO removida / vinculado', () => {
    const groups = [{ slotKey: 'invoice:PO-9', primary: { id: 'd1' } }]
    expect(getUnlinkedDocumentGroups(groups, { category: 'FCL' }, [])).toEqual([
      { slotKey: 'invoice:PO-9', primary: { id: 'd1' }, reason: 'Categoria mudou' },
    ])
    expect(getUnlinkedDocumentGroups(groups, { category: 'CONSOLIDADO' }, purchaseOrders)).toEqual([
      { slotKey: 'invoice:PO-9', primary: { id: 'd1' }, reason: 'PO removida' },
    ])
    expect(
      getUnlinkedDocumentGroups(
        [{ slotKey: 'invoice:PO-1', primary: { id: 'd1' } }],
        { category: 'CONSOLIDADO' },
        purchaseOrders
      )
    ).toEqual([])
    expect(
      getUnlinkedDocumentGroups(
        [{ slotKey: 'invoice', primary: { id: 'd1' } }],
        { category: 'CONSOLIDADO' },
        purchaseOrders
      )
    ).toEqual([{ slotKey: 'invoice', primary: { id: 'd1' }, reason: 'Categoria mudou' }])
  })

  it('bl/cargoReport/other: sempre vinculados', () => {
    const groups = [
      { slotKey: 'bl', primary: { id: 'd1' } },
      { slotKey: 'cargoReport', primary: { id: 'd2' } },
      { slotKey: 'other:doc-1', primary: { id: 'd3' } },
    ]
    expect(getUnlinkedDocumentGroups(groups, { category: 'FCL' }, [])).toEqual([])
  })

  it('slotKey de tipo desconhecido -> "Tipo não reconhecido"', () => {
    const groups = [{ slotKey: 'unknown:1', primary: { id: 'd1' } }]
    expect(getUnlinkedDocumentGroups(groups, { category: 'FCL' }, [])).toEqual([
      { slotKey: 'unknown:1', primary: { id: 'd1' }, reason: 'Tipo não reconhecido' },
    ])
  })
})

// F18b-2 (E4): getDocumentFileKindLabel.
describe('getDocumentFileKindLabel', () => {
  it('reconhece por mimeType', () => {
    expect(getDocumentFileKindLabel('application/pdf', 'a.pdf')).toBe('PDF')
    expect(getDocumentFileKindLabel('application/vnd.ms-excel', 'a.xls')).toBe('Excel')
    expect(
      getDocumentFileKindLabel(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'a.xlsx'
      )
    ).toBe('Excel')
    expect(getDocumentFileKindLabel('text/csv', 'a.csv')).toBe('CSV')
    expect(getDocumentFileKindLabel('application/msword', 'a.doc')).toBe('Word')
    expect(getDocumentFileKindLabel('image/png', 'a.png')).toBe('Imagem')
  })

  it('sem mimeType, cai pra extensao do nome', () => {
    expect(getDocumentFileKindLabel('', 'relatorio.pdf')).toBe('PDF')
    expect(getDocumentFileKindLabel(undefined, 'planilha.XLSX')).toBe('Excel')
  })

  it('nao reconhecido -> string vazia', () => {
    expect(getDocumentFileKindLabel('application/zip', 'a.zip')).toBe('')
    expect(getDocumentFileKindLabel('', '')).toBe('')
  })
})

describe('isFileDragEvent', () => {
  it('true so quando types contem Files', () => {
    expect(isFileDragEvent({ dataTransfer: { types: ['Files'] } })).toBe(true)
    expect(isFileDragEvent({ dataTransfer: { types: ['text/plain'] } })).toBe(false)
    expect(isFileDragEvent({})).toBe(false)
  })
})

describe('pickSingleDroppedFile', () => {
  it('0 -> empty, 1 -> file, 2 -> multiple', () => {
    const a = { name: 'a' }
    expect(pickSingleDroppedFile({ files: [] })).toEqual({ file: null, error: 'empty' })
    expect(pickSingleDroppedFile(undefined)).toEqual({ file: null, error: 'empty' })
    expect(pickSingleDroppedFile({ files: [a] })).toEqual({ file: a, error: null })
    expect(pickSingleDroppedFile({ files: [a, { name: 'b' }] })).toEqual({ file: null, error: 'multiple' })
  })
})
