import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'

const STORAGE_KEY = 'sq-comex-notification-recipients'

function normalizeRecipient(rawRecipient, fallbackId) {
  const resolvedId =
    typeof rawRecipient?.uid === 'string' && rawRecipient.uid.trim()
      ? rawRecipient.uid.trim()
      : typeof rawRecipient?.id === 'string' && rawRecipient.id.trim()
        ? rawRecipient.id.trim()
        : fallbackId

  return {
    uid: resolvedId,
    name: String(rawRecipient?.name ?? '').trim(),
    email: String(rawRecipient?.email ?? '').trim().toLowerCase(),
    role: String(rawRecipient?.role ?? 'user').trim() || 'user',
    isActive: rawRecipient?.status === 'Ativo' || rawRecipient?.isActive === true,
    favoriteProcessIds: Array.isArray(rawRecipient?.favoriteProcessIds)
      ? rawRecipient.favoriteProcessIds.filter(Boolean)
      : [],
  }
}

function readLocalRecipients() {
  const storedRecipients = window.localStorage.getItem(STORAGE_KEY)

  if (!storedRecipients) return []

  try {
    return JSON.parse(storedRecipients)
  } catch {
    return []
  }
}

function writeLocalRecipients(recipients) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipients))
}

function toFirestorePayload(recipient) {
  return {
    uid: recipient.uid,
    name: recipient.name,
    email: recipient.email,
    role: recipient.role,
    isActive: Boolean(recipient.isActive),
    favoriteProcessIds: recipient.favoriteProcessIds,
    updatedAt: serverTimestamp(),
  }
}

export async function listNotificationRecipients() {
  if (!isFirebaseConfigured || !firestore) {
    return readLocalRecipients().map((item) => normalizeRecipient(item))
  }

  const snapshot = await getDocs(query(collection(firestore, 'notificationRecipients')))
  return snapshot.docs.map((item) => normalizeRecipient(item.data(), item.id))
}

export async function syncNotificationRecipient(user) {
  const normalizedRecipient = normalizeRecipient(user, user?.uid ?? user?.id)

  if (!normalizedRecipient.uid) return normalizedRecipient

  if (!isFirebaseConfigured || !firestore) {
    const currentRecipients = readLocalRecipients().map((item) => normalizeRecipient(item))
    const existingIndex = currentRecipients.findIndex((item) => item.uid === normalizedRecipient.uid)

    if (existingIndex >= 0) {
      currentRecipients[existingIndex] = normalizedRecipient
    } else {
      currentRecipients.unshift(normalizedRecipient)
    }

    writeLocalRecipients(currentRecipients)
    return normalizedRecipient
  }

  await setDoc(
    doc(firestore, 'notificationRecipients', normalizedRecipient.uid),
    toFirestorePayload(normalizedRecipient),
    { merge: true }
  )

  return normalizedRecipient
}

export async function deleteNotificationRecipient(userId) {
  const normalizedId = String(userId ?? '').trim()

  if (!normalizedId) return

  if (!isFirebaseConfigured || !firestore) {
    const nextRecipients = readLocalRecipients()
      .map((item) => normalizeRecipient(item))
      .filter((item) => item.uid !== normalizedId)
    writeLocalRecipients(nextRecipients)
    return
  }

  await deleteDoc(doc(firestore, 'notificationRecipients', normalizedId))
}
