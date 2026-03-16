import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { createAuditEvent } from './auditRepository'

const STORAGE_KEY = 'sq-comex-announcements'

function normalizeAnnouncement(rawAnnouncement, fallbackId) {
  return {
    id: rawAnnouncement.id ?? fallbackId,
    title: rawAnnouncement.title ?? '',
    content: rawAnnouncement.content ?? '',
    channel: rawAnnouncement.channel ?? 'Banner interno',
    createdAt: rawAnnouncement.createdAt ?? new Date().toISOString(),
    updatedAt: rawAnnouncement.updatedAt ?? rawAnnouncement.createdAt ?? new Date().toISOString(),
  }
}

function readLocalAnnouncements() {
  const storedAnnouncements = window.localStorage.getItem(STORAGE_KEY)

  if (!storedAnnouncements) {
    return []
  }

  try {
    return JSON.parse(storedAnnouncements)
  } catch {
    return []
  }
}

function writeLocalAnnouncements(announcements) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(announcements))
}

function sortAnnouncements(announcements) {
  return [...announcements].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime()

    return rightTime - leftTime
  })
}

export async function listAnnouncements() {
  if (!isFirebaseConfigured || !firestore) {
    return sortAnnouncements(readLocalAnnouncements().map((item) => normalizeAnnouncement(item)))
  }

  const announcementsQuery = query(collection(firestore, 'announcements'), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(announcementsQuery)

  return snapshot.docs.map((item) => {
    const data = item.data()

    return normalizeAnnouncement(
      {
        ...data,
        createdAt:
          typeof data.createdAt?.toDate === 'function'
            ? data.createdAt.toDate().toISOString()
            : data.createdAt,
        updatedAt:
          typeof data.updatedAt?.toDate === 'function'
            ? data.updatedAt.toDate().toISOString()
            : data.updatedAt,
      },
      item.id
    )
  })
}

export async function saveAnnouncement(announcement, actor = null) {
  const normalizedAnnouncement = normalizeAnnouncement(announcement, announcement.id)
  const isEditing = Boolean(normalizedAnnouncement.id)
  const now = new Date().toISOString()

  if (!isFirebaseConfigured || !firestore) {
    const currentAnnouncements = readLocalAnnouncements().map((item) => normalizeAnnouncement(item))
    const nextAnnouncement = {
      ...normalizedAnnouncement,
      id: normalizedAnnouncement.id || `ANN-${Date.now()}`,
      createdAt: normalizedAnnouncement.createdAt || now,
      updatedAt: now,
    }
    const existingIndex = currentAnnouncements.findIndex((item) => item.id === nextAnnouncement.id)

    if (existingIndex >= 0) {
      currentAnnouncements[existingIndex] = nextAnnouncement
    } else {
      currentAnnouncements.unshift(nextAnnouncement)
    }

    writeLocalAnnouncements(sortAnnouncements(currentAnnouncements))
    await createAuditEvent({
      action: existingIndex >= 0 ? 'Comunicado atualizado' : 'Comunicado publicado',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: nextAnnouncement.id,
    })
    return nextAnnouncement
  }

  const payload = {
    title: normalizedAnnouncement.title,
    content: normalizedAnnouncement.content,
    channel: normalizedAnnouncement.channel,
    updatedAt: serverTimestamp(),
  }

  if (isEditing) {
    await updateDoc(doc(firestore, 'announcements', normalizedAnnouncement.id), payload)
  } else {
    const createdRef = await addDoc(collection(firestore, 'announcements'), {
      ...payload,
      createdAt: serverTimestamp(),
    })

    await createAuditEvent({
      action: 'Comunicado publicado',
      actor: actor?.name ?? actor?.email ?? 'Sistema',
      target: createdRef.id,
    })

    return {
      ...normalizedAnnouncement,
      id: createdRef.id,
      createdAt: now,
      updatedAt: now,
    }
  }

  await createAuditEvent({
    action: 'Comunicado atualizado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedAnnouncement.id,
  })

  return {
    ...normalizedAnnouncement,
    updatedAt: now,
  }
}

export async function removeAnnouncement(announcementId, actor = null) {
  if (!isFirebaseConfigured || !firestore) {
    const nextAnnouncements = readLocalAnnouncements()
      .map((item) => normalizeAnnouncement(item))
      .filter((item) => item.id !== announcementId)

    writeLocalAnnouncements(nextAnnouncements)
    await createAuditEvent({
      action: 'Comunicado removido',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: announcementId,
    })
    return
  }

  await deleteDoc(doc(firestore, 'announcements', announcementId))
  await createAuditEvent({
    action: 'Comunicado removido',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: announcementId,
  })
}
