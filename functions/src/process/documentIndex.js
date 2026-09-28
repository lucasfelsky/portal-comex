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

function sortUnique(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((value) => typeof value === 'string' && value)).values()].sort()
}

// B1: recalcula `{ fispqItemIds, containerWashIds }` a partir da subcolecao
// `documents` INTEIRA (autocura - nunca acumula incrementalmente).
export function buildDocumentIndex(docs) {
  const list = Array.isArray(docs) ? docs : []
  const fispqItemIds = []
  const containerWashIds = []

  for (const doc of list) {
    if (doc?.type === 'fispq' && doc?.itemId) fispqItemIds.push(String(doc.itemId))
    if (doc?.type === 'containerWash' && doc?.containerId) containerWashIds.push(String(doc.containerId))
  }

  return {
    fispqItemIds: sortUnique(fispqItemIds),
    containerWashIds: sortUnique(containerWashIds),
  }
}

// B1: normaliza o `documentIndex` cru (do doc do processo) pro mesmo shape
// de `buildDocumentIndex` - usado pra comparar "index atual" x "index novo"
// sem write inutil (`isSameDocumentIndex`).
export function normalizeDocumentIndexMirror(raw) {
  return {
    fispqItemIds: sortUnique(raw?.fispqItemIds),
    containerWashIds: sortUnique(raw?.containerWashIds),
  }
}

function sameStringArray(a, b) {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

export function isSameDocumentIndex(a, b) {
  return sameStringArray(a?.fispqItemIds ?? [], b?.fispqItemIds ?? []) &&
    sameStringArray(a?.containerWashIds ?? [], b?.containerWashIds ?? [])
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
