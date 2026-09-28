// F18a: helpers puros da subcolecao `processes/{id}/documents`. Sem React,
// sem firebase. NAO importa de `processStatus.js`, `deriveProcessStatus.js`,
// `pendingFields.js`, `processCategories.js` nem `processLabels.js` -
// `tests/ui/ProcessesPage.test.jsx` mocka esses modulos com uma lista
// fechada de exports (mesma regra de `containers.js`/`purchaseOrders.js`).
//
// D1/D2/D9 do PLAN.md (F18a) + AD-1 do adendo do orquestrador (Invoice e
// Packing List por PO no CONSOLIDADO).

export const MAX_DOCUMENT_MB = 20

// D-1: 7 tipos de documento de nivel-processo/item/conteiner. `scope`
// determina que campo extra a rule/UI exige (`itemId`/`containerId`/
// `description`/`po`); `roles` = quem pode ENVIAR (nao confundir com quem
// pode LER - leitura e' admin || logistica, ver D5/D6).
export const DOCUMENT_TYPES = [
  { id: 'bl', label: 'BL/AWB', scope: 'process', roles: ['admin'] },
  { id: 'cargoReport', label: 'Relatório de carga', scope: 'process', roles: ['admin'] },
  { id: 'invoice', label: 'Invoice', scope: 'process', roles: ['admin'] },
  { id: 'packingList', label: 'Packing List', scope: 'process', roles: ['admin'] },
  { id: 'fispq', label: 'FISPQ', scope: 'item', roles: ['admin'] },
  { id: 'containerWash', label: 'Relatório de lavação', scope: 'container', roles: ['admin', 'logistica'] },
  { id: 'other', label: 'Outro', scope: 'free', roles: ['admin'] },
]

const DOCUMENT_TYPE_MAP = new Map(DOCUMENT_TYPES.map((type) => [type.id, type]))

// F18b-1 (B3): tipos de documento que geram marco no Historico. Espelhado
// (sem importar) em `functions/src/process/documentIndex.js` - teste de
// paridade em `tests/unit/processDocuments.test.js`.
export const DOCUMENT_MILESTONE_EVENT_TYPES = {
  bl: 'blUploaded',
  fispq: 'fispqUploaded',
  containerWash: 'containerWashUploaded',
}

// AD-1: no CONSOLIDADO, Invoice/Packing List sao 1 slot POR PO. Nas demais
// categorias continuam 1 slot por processo.
const PO_SCOPED_TYPES = new Set(['invoice', 'packingList'])

export function isProcessDocumentType(type) {
  return DOCUMENT_TYPE_MAP.has(type)
}

export function getDocumentTypeLabel(type) {
  return DOCUMENT_TYPE_MAP.get(type)?.label ?? type
}

// D6: aba "Histórico" e "Documentos" so admin/logistica.
export function canViewProcessRecords(role) {
  return role === 'admin' || role === 'logistica'
}

// D4/D5: admin envia qualquer tipo; logistica so `containerWash`.
export function canUploadDocumentType(role, type) {
  const definition = DOCUMENT_TYPE_MAP.get(type)
  if (!definition) return false
  if (role === 'admin') return definition.roles.includes('admin')
  if (role === 'logistica') return definition.roles.includes('logistica')
  return false
}

// D5: admin apaga qualquer documento; logistica so o proprio.
export function canDeleteDocument(profile, document) {
  const role = profile?.role
  if (role === 'admin') return true
  if (role === 'logistica') {
    return Boolean(document?.uploadedById) && document.uploadedById === profile?.uid
  }
  return false
}

function sanitizeSlotSegment(value) {
  return String(value ?? '').trim()
}

// D2/AD-1: monta o `slotKey` de um documento de processo. `po` obrigatorio
// para invoice/packingList quando `category === 'CONSOLIDADO'`.
export function buildDocumentSlotKey(type, { itemId, containerId, documentId, category, po } = {}) {
  if (type === 'fispq') return `fispq:${sanitizeSlotSegment(itemId)}`
  if (type === 'containerWash') return `containerWash:${sanitizeSlotSegment(containerId)}`
  if (type === 'other') return `other:${sanitizeSlotSegment(documentId)}`
  if (PO_SCOPED_TYPES.has(type) && category === 'CONSOLIDADO') {
    return `${type}:${sanitizeSlotSegment(po)}`
  }
  return type
}

// AD-1: extrai o numero da PO de um slotKey `invoice:<po>`/`packingList:<po>`.
// '' quando o slot nao e' escopado por PO (slot unico ou tipo sem PO).
export function getSlotKeyPoNumber(type, slotKey) {
  if (!PO_SCOPED_TYPES.has(type)) return ''
  const prefix = `${type}:`
  const value = String(slotKey ?? '')
  return value.startsWith(prefix) ? value.slice(prefix.length) : ''
}

function toMillis(value) {
  if (value == null) return 0
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

// D1/D9: agrupa documentos por `slotKey` (principal = mais novo por
// `uploadedAt`, "versao anterior" = 2o mais novo). Grupos `other:` sao
// sempre solteiros (1 documento por slot, sem versao). Desempate por `id`.
export function groupDocumentsBySlot(documents) {
  const list = Array.isArray(documents) ? documents : []
  const bySlot = new Map()

  for (const document of list) {
    const slotKey = String(document?.slotKey ?? '')
    if (!bySlot.has(slotKey)) bySlot.set(slotKey, [])
    bySlot.get(slotKey).push(document)
  }

  const groups = []
  for (const [slotKey, docs] of bySlot) {
    const sorted = [...docs].sort((left, right) => {
      const diff = toMillis(right?.uploadedAt) - toMillis(left?.uploadedAt)
      if (diff !== 0) return diff
      return String(right?.id ?? '').localeCompare(String(left?.id ?? ''))
    })

    groups.push({
      slotKey,
      type: sorted[0]?.type ?? '',
      primary: sorted[0] ?? null,
      previous: sorted[1] ?? null,
    })
  }

  return groups
}

export function formatDocumentSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) return ''

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(0)} KB`
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`
}

function sortUniqueStrings(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((value) => typeof value === 'string' && value)).values()].sort()
}

// F18b-1 (B1): normaliza `documentIndex` na leitura (`normalizeProcess`,
// `processesRepository.js`). Ausente/lixo -> `{ fispqItemIds: [], containerWashIds: [] }`.
// Gravado SO' pelo trigger `syncProcessDocumentIndex` - o cliente nunca envia
// esta chave (`toFirestorePayload` nao muda, teste dedicado).
export function normalizeDocumentIndex(raw) {
  return {
    fispqItemIds: sortUniqueStrings(raw?.fispqItemIds),
    containerWashIds: sortUniqueStrings(raw?.containerWashIds),
  }
}
