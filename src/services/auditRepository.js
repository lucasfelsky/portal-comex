import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'

const STORAGE_KEY = 'sq-comex-audits'

function readLocalAudits() {
  const storedAudits = window.localStorage.getItem(STORAGE_KEY)

  if (!storedAudits) {
    return []
  }

  try {
    return JSON.parse(storedAudits)
  } catch {
    return []
  }
}

function writeLocalAudits(audits) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(audits))
}

export async function createAuditEvent(event) {
  const payload = {
    ...event,
    createdAt: new Date().toISOString(),
  }

  if (!isFirebaseConfigured || !firestore) {
    const currentAudits = readLocalAudits()
    writeLocalAudits([payload, ...currentAudits].slice(0, 50))
    return payload
  }

  await addDoc(collection(firestore, 'audits'), {
    ...event,
    createdAt: serverTimestamp(),
  })

  return payload
}

export async function listAuditEvents(maxItems = 20) {
  if (!isFirebaseConfigured || !firestore) {
    return readLocalAudits().slice(0, maxItems)
  }

  const auditsQuery = query(
    collection(firestore, 'audits'),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  )
  const snapshot = await getDocs(auditsQuery)

  return snapshot.docs.map((item) => {
    const data = item.data()

    return {
      id: item.id,
      ...data,
      createdAt:
        typeof data.createdAt?.toDate === 'function'
          ? data.createdAt.toDate().toISOString()
          : data.createdAt ?? null,
    }
  })
}
