import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { repairTextEncoding } from '../utils/textEncoding'

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
