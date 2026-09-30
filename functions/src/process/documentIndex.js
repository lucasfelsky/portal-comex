// F18b-1 (B1-B4): logica PURA do indice de documentos do processo
// (`documentIndex`) + marcos/aviso de upload da logistica.
//
// Este arquivo NAO importa `firebase-admin`/`firebase-functions` nem
// `../core/shared.js` (mesmo motivo de `milestones.js`: importavel por
// teste e pelo script de backfill sem mocks). Espelha (sem importar)
// `DOCUMENT_TYPES`/labels de `src/features/processes/processDocuments.js`
// porque `functions/` nao pode importar de `src/` (o deploy empacota so'
// `functions/`) - o teste de paridade compara os dois lados. Importa
// `buildEventDocId`/`toIsoOccurredAt` de `./milestones.js` (tambem puro).

import { buildEventDocId, toIsoOccurredAt } from './milestones.js'

// Espelho de `DOCUMENT_TYPES` (`src/features/processes/processDocuments.js:16-24`).
export const DOCUMENT_TYPE_LABELS = {
  bl: 'BL/AWB',
  cargoReport: 'Relatório de carga',
  invoice: 'Invoice',
  packingList: 'Packing List',
  fispq: 'FISPQ',
  containerWash: 'Relatório de lavação',
  other: 'Outro',
}

// B3: quais tipos de documento geram marco no Historico. Espelhado (sem
// importar) em `src/features/processes/processDocuments.js` - teste de
// paridade em `tests/unit/processDocuments.test.js`.
export const DOCUMENT_MILESTONE_EVENT_TYPES = {
  bl: 'blUploaded',
  fispq: 'fispqUploaded',
  containerWash: 'containerWashUploaded',
}

function toMillis(value) {
  if (value == null) return 0
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

// Espelho de getPackingListSlotKeyForInvoice (front).
function getPackingListSlotKeyForInvoice(slotKey) {
  const value = String(slotKey ?? '')
  if (value === 'invoice') return 'packingList'
  if (value.startsWith('invoice:') && value.length > 'invoice:'.length) {
    return 'packingList:' + value.slice('invoice:'.length)
  }
  return ''
}

// Espelho de `PROCESS_SLOT_DOCUMENT_TYPES` (`src/features/processes/processDocuments.js`).
const PROCESS_SLOT_DOCUMENT_TYPES = ['bl', 'cargoReport', 'invoice', 'packingList']

function sortUnique(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((value) => typeof value === 'string' && value)).values()].sort()
}

// B1: recalcula `{ fispqItemIds, containerWashIds, processSlotKeys }` a partir da subcolecao
// `documents` INTEIRA (autocura - nunca acumula incrementalmente).
export function buildDocumentIndex(docs) {
  const list = Array.isArray(docs) ? docs : []
  const fispqItemIds = []
  const containerWashIds = []
  const processSlotKeys = []

  for (const doc of list) {
    if (PROCESS_SLOT_DOCUMENT_TYPES.includes(doc?.type) && typeof doc?.slotKey === 'string' && doc.slotKey) {
      processSlotKeys.push(doc.slotKey)
    }
    if (doc?.type === 'fispq' && doc?.itemId) fispqItemIds.push(String(doc.itemId))
    if (doc?.type === 'containerWash' && doc?.containerId) containerWashIds.push(String(doc.containerId))
  }

  // Invoice ATUAL (maior uploadedAt, desempate id maior - mesmo criterio de
  // groupDocumentsBySlot no front) marcada com alsoPackingList cobre o slot
  // do Packing List.
  const currentInvoiceBySlot = new Map()
  for (const doc of list) {
    if (doc?.type !== 'invoice' || typeof doc?.slotKey !== 'string' || !doc.slotKey) continue
    const best = currentInvoiceBySlot.get(doc.slotKey)
    if (!best) {
      currentInvoiceBySlot.set(doc.slotKey, doc)
      continue
    }
    const diff = toMillis(doc.uploadedAt) - toMillis(best.uploadedAt)
    if (diff > 0 || (diff === 0 && String(doc.id ?? '').localeCompare(String(best.id ?? '')) > 0)) {
      currentInvoiceBySlot.set(doc.slotKey, doc)
    }
  }
  for (const [slotKey, doc] of currentInvoiceBySlot) {
    if (doc.alsoPackingList === true) {
      const packingSlot = getPackingListSlotKeyForInvoice(slotKey)
      if (packingSlot) processSlotKeys.push(packingSlot)
    }
  }

  return {
    fispqItemIds: sortUnique(fispqItemIds),
    containerWashIds: sortUnique(containerWashIds),
    processSlotKeys: sortUnique(processSlotKeys),
  }
}

// B1: normaliza o `documentIndex` cru (do doc do processo) pro mesmo shape
// de `buildDocumentIndex` - usado pra comparar "index atual" x "index novo"
// sem write inutil (`isSameDocumentIndex`).
// `processSlotKeys` em 3 estados (paridade com `normalizeDocumentIndex` do
// front): ausente/nao-objeto -> `[]`; objeto sem array (legado) -> `null`;
// array -> limpo/ordenado.
export function normalizeDocumentIndexMirror(raw) {
  const isObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
  let processSlotKeys = []
  if (isObject) {
    processSlotKeys = Array.isArray(raw.processSlotKeys) ? sortUnique(raw.processSlotKeys) : null
  }
  return {
    fispqItemIds: sortUnique(raw?.fispqItemIds),
    containerWashIds: sortUnique(raw?.containerWashIds),
    processSlotKeys,
  }
}

function sameStringArray(a, b) {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function sameOptionalStringArray(a, b) {
  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray && bIsArray) return sameStringArray(a, b)
  return !aIsArray && !bIsArray
}

// `processSlotKeys`: ambos arrays e iguais, OU nenhum dos dois e' array
// (`null` x `[]` = diferente; ambos sem o campo = igual).
export function isSameDocumentIndex(a, b) {
  return sameStringArray(a?.fispqItemIds ?? [], b?.fispqItemIds ?? []) &&
    sameStringArray(a?.containerWashIds ?? [], b?.containerWashIds ?? []) &&
    sameOptionalStringArray(a?.processSlotKeys, b?.processSlotKeys)
}

// B2: nome do escopo do documento (item/conteiner) pra frase do marco/aviso.
// FISPQ -> `items[].commercialName` do `itemId` (fallback o id); lavacao ->
// `containers[].number`, senao `Contêiner N` pela posicao no array, senao o
// `containerId`; demais tipos -> ''.
export function describeDocumentScope(process, document) {
  const type = document?.type

  if (type === 'fispq') {
    const itemId = String(document?.itemId ?? '')
    if (!itemId) return ''
    const items = Array.isArray(process?.items) ? process.items : []
    const item = items.find((candidate) => String(candidate?.id ?? '') === itemId)
    const commercialName = String(item?.commercialName ?? '').trim()
    return commercialName || itemId
  }

  if (type === 'containerWash') {
    const containerId = String(document?.containerId ?? '')
    if (!containerId) return ''
    const containers = Array.isArray(process?.containers) ? process.containers : []
    const index = containers.findIndex((candidate) => String(candidate?.id ?? '') === containerId)
    if (index === -1) return containerId
    const number = String(containers[index]?.number ?? '').trim()
    return number || `Contêiner ${index + 1}`
  }

  return ''
}

// B2: corpo da notificacao `process_document_uploaded`. Sem parenteses
// quando o escopo esta vazio (tipos de processo, ex.: BL).
export function buildDocumentUploadedNotificationBody(processLabel, actorName, typeLabel, scopeLabel) {
  const scopePart = scopeLabel ? ` (${scopeLabel})` : ''
  return `${actorName} enviou ${typeLabel}${scopePart} em ${processLabel}.`
}

// B3: monta o documento de evento de marco (`blUploaded`/`fispqUploaded`/
// `containerWashUploaded`), mesmo shape de `buildMilestoneEvents`
// (`milestones.js:433-447`). Devolve `null` quando o tipo nao gera marco.
export function buildDocumentMilestoneEvent({
  processId,
  eventId,
  eventTime,
  document,
  process,
  repairText,
} = {}) {
  const eventType = DOCUMENT_MILESTONE_EVENT_TYPES[document?.type]
  if (!eventType) return null

  const repair = typeof repairText === 'function' ? repairText : (value) => value
  const actorId = String(document?.uploadedById ?? '').trim()
  const actorName = repair(String(document?.uploadedByName ?? '').trim())
  const value = describeDocumentScope(process, document)

  const { occurredAt, occurredAtSource } = toIsoOccurredAt({
    fieldValue: document?.uploadedAt,
    eventTime,
  })

  const data = {
    type: eventType,
    field: 'documents',
    value,
    previousValue: '',
    actorId,
    actorName,
    occurredAt,
    occurredAtSource,
    processId,
  }

  for (const key of Object.keys(data)) {
    if (data[key] === undefined) data[key] = ''
  }

  return {
    id: buildEventDocId(eventId, eventType, processId, document?.uploadedAt),
    data,
  }
}
