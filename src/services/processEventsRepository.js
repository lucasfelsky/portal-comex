import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { repairTextEncoding } from '../utils/textEncoding'
import { LEAD_TIME_CATEGORIES, LEAD_TIME_EVENT_TYPES } from '../features/admin/leadTimeStats'

// F17.1b: leitura da subcolecao `processes/{id}/events` (historico de
// marcos gravado pelo trigger `recordProcessMilestoneEvents`). Server-only
// (sem seed local) - a subcolecao so existe no Firestore de verdade.
function timestampToIso(value) {
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return typeof value === 'string' ? value : ''
}

function normalizeEvent(rawEvent, fallbackId) {
  return {
    id: rawEvent?.id ?? fallbackId,
    type: String(rawEvent?.type ?? ''),
    field: String(rawEvent?.field ?? ''),
    value: rawEvent?.value ?? '',
    previousValue: rawEvent?.previousValue ?? '',
    actorId: String(rawEvent?.actorId ?? ''),
    actorName: repairTextEncoding(String(rawEvent?.actorName ?? '')),
    occurredAt: timestampToIso(rawEvent?.occurredAt) || String(rawEvent?.occurredAt ?? ''),
    recordedAt: timestampToIso(rawEvent?.recordedAt),
  }
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const occurredDiff = new Date(right.occurredAt ?? 0).getTime() - new Date(left.occurredAt ?? 0).getTime()
    if (occurredDiff !== 0) return occurredDiff
    return new Date(right.recordedAt ?? 0).getTime() - new Date(left.recordedAt ?? 0).getTime()
  })
}

export async function listProcessEvents(processId) {
  if (!processId) return []
  if (!isFirebaseConfigured || !firestore) return []

  const eventsQuery = query(
    collection(firestore, 'processes', processId, 'events'),
    orderBy('recordedAt', 'desc'),
    limit(100)
  )
  const snapshot = await getDocs(eventsQuery)

  return sortEvents(snapshot.docs.map((item) => normalizeEvent(item.data(), item.id)))
}

// F17.6: leitura server-only p/ o painel de lead time (`/admin/lead-time`).
// NAO usa `listProcesses()` - aquela funcao esconde recebidos ha' >7 dias
// (`isExpiredReceivedProcess`, `processesRepository.js`), exatamente os
// processos com lead time completo.
export async function listLeadTimeProcesses() {
  if (!isFirebaseConfigured || !firestore) return []

  const snapshot = await getDocs(collection(firestore, 'processes'))

  return snapshot.docs.map((item) => {
    const data = item.data() ?? {}
    return {
      id: item.id,
      category: String(data.category ?? ''),
      destination: String(data.destination ?? '').trim().toUpperCase(),
      archived: Boolean(data.archived),
    }
  })
}

// SEM `orderBy` de proposito: `where('type', 'in', [...])` + `orderBy`
// exigiria indice composto (proibido neste plano - deploy so' de hosting).
export async function listLeadTimeEvents(processId) {
  if (!processId) return []
  if (!isFirebaseConfigured || !firestore) return []

  const eventsQuery = query(
    collection(firestore, 'processes', processId, 'events'),
    where('type', 'in', LEAD_TIME_EVENT_TYPES)
  )
  const snapshot = await getDocs(eventsQuery)

  return snapshot.docs.map((item) => normalizeEvent(item.data(), item.id))
}

const LEAD_TIME_CHUNK_SIZE = 10

export async function loadLeadTimeDataset() {
  const processes = (await listLeadTimeProcesses()).filter(
    (process) => !process.archived && LEAD_TIME_CATEGORIES.includes(process.category)
  )

  const eventsByProcessId = {}

  for (let start = 0; start < processes.length; start += LEAD_TIME_CHUNK_SIZE) {
    const chunk = processes.slice(start, start + LEAD_TIME_CHUNK_SIZE)
    const chunkResults = await Promise.all(
      chunk.map((process) => listLeadTimeEvents(process.id))
    )
    chunk.forEach((process, index) => {
      eventsByProcessId[process.id] = chunkResults[index]
    })
  }

  return { processes, eventsByProcessId }
}
