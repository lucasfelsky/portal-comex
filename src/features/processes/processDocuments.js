// F18a: helpers puros da subcolecao `processes/{id}/documents`. Sem React,
// sem firebase. NAO importa de `processStatus.js`, `deriveProcessStatus.js`,
// `pendingFields.js`, `processCategories.js` nem `processLabels.js` -
// `tests/ui/ProcessesPage.test.jsx` mocka esses modulos com uma lista
// fechada de exports (mesma regra de `containers.js`/`purchaseOrders.js`).
// Importa APENAS `./shipmentConfirmation` e `./purchaseOrders` (ZERO imports
// e nao mockados nesse teste) para as pendencias de embarque confirmado.
//
// D1/D2/D9 do PLAN.md (F18a) + AD-1 do adendo do orquestrador (Invoice e
// Packing List por PO no CONSOLIDADO).

import { isShipmentConfirmed } from './shipmentConfirmation'
import { getProcessPurchaseOrders } from './purchaseOrders'

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

// Invoice que tambem contem o Packing List: slot do PL coberto pela Invoice.
// '' quando o slot nao e' de Invoice. Espelhado em
// functions/src/process/documentIndex.js (paridade testada).
export function getPackingListSlotKeyForInvoice(slotKey) {
  const value = String(slotKey ?? '')
  if (value === 'invoice') return 'packingList'
  if (value.startsWith('invoice:') && value.length > 'invoice:'.length) {
    return 'packingList:' + value.slice('invoice:'.length)
  }
  return ''
}

// Vinculo vale so' quando a Invoice ATUAL (primary) do slot tem o flag.
// Devolve o doc da Invoice ou null.
export function getInvoicePackingListLink(groups, invoiceSlotKey) {
  const list = Array.isArray(groups) ? groups : []
  const group = list.find((candidate) => candidate?.slotKey === invoiceSlotKey)
  return group?.primary?.alsoPackingList === true ? group.primary : null
}

export const DROP_MULTIPLE_FILES_MESSAGE = 'Solte apenas um arquivo por vez.'

// Arrastar e soltar: `true` quando o drag carrega arquivos (e nao texto/link).
export function isFileDragEvent(event) {
  return Array.from(event?.dataTransfer?.types ?? []).includes('Files')
}

// Arrastar e soltar: exatamente 1 arquivo vira `file`; 0 -> 'empty',
// >1 -> 'multiple' (recusa, sem escolher um arbitrario).
export function pickSingleDroppedFile(dataTransfer) {
  const files = Array.from(dataTransfer?.files ?? [])
  if (files.length === 0) return { file: null, error: 'empty' }
  if (files.length > 1) return { file: null, error: 'multiple' }
  return { file: files[0], error: null }
}

// F18b-2 (E4): virgula decimal pt-BR ("1,2 MB", como no artboard). Unico
// chamador e' o painel (`ProcessDocumentsPanel.jsx`).
export function formatDocumentSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) return ''

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(0)} KB`
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

function sortUniqueStrings(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((value) => typeof value === 'string' && value)).values()].sort()
}

// Tipos de documento de nivel-processo cujo `slotKey` entra em
// `documentIndex.processSlotKeys`. Espelho de `functions/src/process/documentIndex.js`.
const PROCESS_SLOT_DOCUMENT_TYPES = ['bl', 'cargoReport', 'invoice', 'packingList']

// F18b-1 (B1): normaliza `documentIndex` na leitura (`normalizeProcess`,
// `processesRepository.js`). Ausente/lixo -> `{ fispqItemIds: [], containerWashIds: [], processSlotKeys: [] }`.
// `processSlotKeys` tem 3 estados: indice ausente/nao-objeto -> `[]` (vazio
// CONHECIDO); objeto legado sem o array -> `null` (DESCONHECIDO, nao gera
// pendencia); array -> limpo/ordenado. Idempotente.
// Gravado SO' pelo trigger `syncProcessDocumentIndex` - o cliente nunca envia
// esta chave (`toFirestorePayload` nao muda, teste dedicado).
export function normalizeDocumentIndex(raw) {
  const isObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
  let processSlotKeys = []
  if (isObject) {
    processSlotKeys = Array.isArray(raw.processSlotKeys) ? sortUniqueStrings(raw.processSlotKeys) : null
  }
  return {
    fispqItemIds: sortUniqueStrings(raw?.fispqItemIds),
    containerWashIds: sortUniqueStrings(raw?.containerWashIds),
    processSlotKeys,
  }
}

// F18b-2 (E4): categorias que tem lavacao de conteiner (FCL/CONSOLIDADO).
// Constante LOCAL - nao importa de `processCategories.js` (mock fechado de
// `tests/ui/ProcessesPage.test.jsx`).
export const CONTAINER_WASH_CATEGORIES = ['FCL', 'CONSOLIDADO']

// F18b-2 (E4): mesma regra de `functions/src/process/documentIndex.js:40-54`
// (`buildDocumentIndex`) - espelhada aqui (sem importar) porque `src/` nao
// pode importar de `functions/`. Paridade testada em
// `tests/unit/processDocuments.test.js`.
export function getDocumentIndexFromDocuments(documents) {
  const list = Array.isArray(documents) ? documents : []
  const fispqItemIds = []
  const containerWashIds = []
  const processSlotKeys = []

  for (const document of list) {
    if (
      PROCESS_SLOT_DOCUMENT_TYPES.includes(document?.type) &&
      typeof document?.slotKey === 'string' &&
      document.slotKey
    ) {
      processSlotKeys.push(document.slotKey)
    }
    if (document?.type === 'fispq' && document?.itemId) fispqItemIds.push(String(document.itemId))
    if (document?.type === 'containerWash' && document?.containerId) {
      containerWashIds.push(String(document.containerId))
    }
  }

  // Invoice atual marcada "tambem contem o Packing List" cobre o slot do PL.
  for (const group of groupDocumentsBySlot(list)) {
    if (group.type === 'invoice' && group.primary?.alsoPackingList === true) {
      const packingSlot = getPackingListSlotKeyForInvoice(group.slotKey)
      if (packingSlot) processSlotKeys.push(packingSlot)
    }
  }

  return {
    fispqItemIds: sortUniqueStrings(fispqItemIds),
    containerWashIds: sortUniqueStrings(containerWashIds),
    processSlotKeys: sortUniqueStrings(processSlotKeys),
  }
}

// F18b-2 (E4/E5): pendencias derivadas do `documentIndex` (FISPQ de item IMO
// + lavacao de conteiner devolvido + BL/Relatorio de carga/Invoice/Packing
// List com embarque confirmado, so' quando `processSlotKeys` e' array). Item/conteiner sem `id` persistido e'
// ignorado (registrado como limitacao conhecida no PLAN.md).
export function buildDocumentPendingFields(process, index) {
  const fispqItemIds = new Set(index?.fispqItemIds ?? [])
  const containerWashIds = new Set(index?.containerWashIds ?? [])
  const fields = []
  const processSlotKeys = Array.isArray(index?.processSlotKeys) ? new Set(index.processSlotKeys) : null

  const items = Array.isArray(process?.items) ? process.items : []
  for (const item of items) {
    const itemId = typeof item?.id === 'string' ? item.id : ''
    if (!itemId) continue
    if (item?.dangerousGoods !== true) continue
    if (fispqItemIds.has(itemId)) continue
    const name = String(item?.commercialName ?? '').trim() || 'Item sem nome'
    fields.push({
      id: `fispq:${itemId}`,
      field: 'documents',
      label: `FISPQ do item ${name}`,
      stage: 0,
    })
  }

  if (processSlotKeys && isShipmentConfirmed(process)) {
    if (!processSlotKeys.has('bl')) {
      fields.push({ id: 'bl', field: 'documents', label: 'BL/AWB', stage: 1 })
    }
    if (!processSlotKeys.has('cargoReport')) {
      fields.push({ id: 'cargoReport', field: 'documents', label: 'Relatório de carga', stage: 1 })
    }
    if (process?.category === 'CONSOLIDADO') {
      for (const order of getProcessPurchaseOrders(process)) {
        const po = String(order?.po ?? '').trim()
        if (!po) continue
        const invoiceSlot = buildDocumentSlotKey('invoice', { category: 'CONSOLIDADO', po })
        const packingSlot = buildDocumentSlotKey('packingList', { category: 'CONSOLIDADO', po })
        if (!processSlotKeys.has(invoiceSlot)) {
          fields.push({ id: invoiceSlot, field: 'documents', label: `Invoice da PO ${po}`, stage: 1 })
        }
        if (!processSlotKeys.has(packingSlot)) {
          fields.push({ id: packingSlot, field: 'documents', label: `Packing List da PO ${po}`, stage: 1 })
        }
      }
    } else {
      if (!processSlotKeys.has('invoice')) {
        fields.push({ id: 'invoice', field: 'documents', label: 'Invoice', stage: 1 })
      }
      if (!processSlotKeys.has('packingList')) {
        fields.push({ id: 'packingList', field: 'documents', label: 'Packing List', stage: 1 })
      }
    }
  }

  if (CONTAINER_WASH_CATEGORIES.includes(process?.category)) {
    const containers = Array.isArray(process?.containers) ? process.containers : []
    containers.forEach((container, index_) => {
      const containerId = typeof container?.id === 'string' ? container.id : ''
      if (!containerId) return
      if (!String(container?.returnedAt ?? '').trim()) return
      if (containerWashIds.has(containerId)) return
      const label = String(container?.number ?? '').trim() || `Contêiner ${index_ + 1}`
      fields.push({
        id: `containerWash:${containerId}`,
        field: 'documents',
        label: `Relatório de lavação do contêiner ${label}`,
        stage: 4,
      })
    })
  }

  return fields
}

// F18b-2 (E5): usado por `pendingFields.js` (getPendingFields, admin) e pelo
// contador da aba "Documentos" (`ProcessDetailView.jsx`, admin/logistica).
export function getDocumentPendingFields(process) {
  return buildDocumentPendingFields(process, normalizeDocumentIndex(process?.documentIndex))
}

const UNLINKED_REASON_ITEM_REMOVED = 'Item removido'
const UNLINKED_REASON_ITEM_NOT_IMO = 'Item não é mais IMO'
const UNLINKED_REASON_CONTAINER_REMOVED = 'Contêiner removido'
const UNLINKED_REASON_CATEGORY_NO_CONTAINERS = 'Categoria atual sem contêineres'
const UNLINKED_REASON_PO_REMOVED = 'PO removida'
const UNLINKED_REASON_CATEGORY_CHANGED = 'Categoria mudou'
const UNLINKED_REASON_UNKNOWN_TYPE = 'Tipo não reconhecido'

// F18b-2 (E2/E4): grupos de documento que nao aparecem em nenhuma secao hoje
// (item/conteiner/PO removido, categoria mudou, tipo desconhecido). `groups`
// = `groupDocumentsBySlot(documents)`; `purchaseOrders` por argumento (NAO
// importa `purchaseOrders.js`). Nunca apaga nada - so' rotula o motivo.
export function getUnlinkedDocumentGroups(groups, process, purchaseOrders) {
  const list = Array.isArray(groups) ? groups : []
  const items = Array.isArray(process?.items) ? process.items : []
  const containers = Array.isArray(process?.containers) ? process.containers : []
  const poNumbers = new Set(
    (Array.isArray(purchaseOrders) ? purchaseOrders : [])
      .map((order) => String(order?.po ?? '').trim())
      .filter(Boolean)
  )
  const category = process?.category

  const result = []

  for (const group of list) {
    const slotKey = String(group?.slotKey ?? '')
    let reason = ''

    if (slotKey.startsWith('fispq:')) {
      const itemId = slotKey.slice('fispq:'.length)
      const item = items.find((candidate) => String(candidate?.id ?? '') === itemId)
      if (!item) reason = UNLINKED_REASON_ITEM_REMOVED
      else if (item?.dangerousGoods !== true) reason = UNLINKED_REASON_ITEM_NOT_IMO
    } else if (slotKey.startsWith('containerWash:')) {
      const containerId = slotKey.slice('containerWash:'.length)
      if (!CONTAINER_WASH_CATEGORIES.includes(category)) {
        reason = UNLINKED_REASON_CATEGORY_NO_CONTAINERS
      } else {
        const container = containers.find((candidate) => String(candidate?.id ?? '') === containerId)
        if (!container) reason = UNLINKED_REASON_CONTAINER_REMOVED
      }
    } else if (slotKey.startsWith('other:')) {
      reason = ''
    } else if (slotKey === 'bl' || slotKey === 'cargoReport') {
      reason = ''
    } else if (slotKey === 'invoice' || slotKey === 'packingList') {
      if (category === 'CONSOLIDADO') reason = UNLINKED_REASON_CATEGORY_CHANGED
    } else if (slotKey.startsWith('invoice:') || slotKey.startsWith('packingList:')) {
      const [type, po] = slotKey.split(':')
      if (category !== 'CONSOLIDADO') reason = UNLINKED_REASON_CATEGORY_CHANGED
      else if (!poNumbers.has(po)) reason = UNLINKED_REASON_PO_REMOVED
      void type
    } else {
      reason = UNLINKED_REASON_UNKNOWN_TYPE
    }

    if (reason) result.push({ ...group, reason })
  }

  return result
}

const FILE_KIND_BY_MIME = {
  'application/pdf': 'PDF',
  'text/csv': 'CSV',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'image/jpeg': 'Imagem',
  'image/png': 'Imagem',
  'image/webp': 'Imagem',
  'image/gif': 'Imagem',
}

const FILE_KIND_BY_EXTENSION = {
  pdf: 'PDF',
  csv: 'CSV',
  xls: 'Excel',
  xlsx: 'Excel',
  doc: 'Word',
  docx: 'Word',
  jpg: 'Imagem',
  jpeg: 'Imagem',
  png: 'Imagem',
  webp: 'Imagem',
  gif: 'Imagem',
}

function extensionFromName(name) {
  const value = String(name ?? '').trim().toLowerCase()
  return value.includes('.') ? value.split('.').pop() : ''
}

// F18b-2 (E4): rotulo curto do tipo de arquivo (whitelist de
// `src/utils/storageUploadValidation.js:28-53`, espelhada aqui - modulo
// puro, sem importar util nao-mockado). '' quando nao reconhecido.
export function getDocumentFileKindLabel(mimeType, name) {
  const mime = String(mimeType ?? '').trim().toLowerCase()
  if (FILE_KIND_BY_MIME[mime]) return FILE_KIND_BY_MIME[mime]
  const ext = extensionFromName(name)
  return FILE_KIND_BY_EXTENSION[ext] ?? ''
}
