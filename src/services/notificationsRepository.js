import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { listNotificationRecipients } from './notificationRecipientsRepository'

const STORAGE_KEY = 'sq-comex-notifications'
const NOTIFICATIONS_CHANGED_EVENT = 'sq-comex-notifications-changed'

function notifyNotificationsChanged(recipientUserIds = []) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, {
      detail: {
        recipientUserIds,
      },
    })
  )
}

function normalizeNotification(rawNotification, fallbackId) {
  return {
    id: rawNotification?.id ?? fallbackId,
    recipientUserId: String(rawNotification?.recipientUserId ?? ''),
    actorUserId: String(rawNotification?.actorUserId ?? ''),
    actorName: String(rawNotification?.actorName ?? ''),
    type: String(rawNotification?.type ?? 'process_message'),
    processId: String(rawNotification?.processId ?? ''),
    messageId: String(rawNotification?.messageId ?? ''),
    title: String(rawNotification?.title ?? '').trim(),
    body: String(rawNotification?.body ?? '').trim(),
    targetTab: String(rawNotification?.targetTab ?? 'messages'),
    isRead: Boolean(rawNotification?.isRead),
    createdAt: rawNotification?.createdAt ?? new Date().toISOString(),
    readAt: rawNotification?.readAt ?? null,
  }
}

function readLocalNotifications() {
  const storedNotifications = window.localStorage.getItem(STORAGE_KEY)

  if (!storedNotifications) return []

  try {
    return JSON.parse(storedNotifications)
  } catch {
    return []
  }
}

function writeLocalNotifications(notifications) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
}

function sortNotifications(notifications) {
  return [...notifications].sort((left, right) => {
    const leftTime = new Date(left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.createdAt ?? 0).getTime()
    return rightTime - leftTime
  })
}

function buildProcessLabel(process) {
  const name = String(process?.name ?? '').trim()
  if (name) return name

  const processNumber = String(process?.processNumber ?? '').trim()
  return processNumber ? `PO ${processNumber}` : 'processo'
}

function buildFavoriteNotificationBody(processLabel, actorName) {
  return `${actorName} registrou uma nova mensagem em ${processLabel}, que está nos seus favoritos.`
}

function buildAdminNotificationBody(processLabel, actorName) {
  return `${actorName} registrou uma nova dúvida em ${processLabel}.`
}

function buildReplyNotificationBody(processLabel, actorName) {
  return `${actorName} respondeu uma dúvida sua em ${processLabel}.`
}

function buildNotificationEntries(recipients, baseEntry) {
  return recipients.map((recipientUserId) => ({
    id: `NTF-${Date.now()}-${recipientUserId}-${Math.random().toString(36).slice(2, 8)}`,
    recipientUserId,
    actorUserId: baseEntry.actorUserId,
    actorName: baseEntry.actorName,
    type: baseEntry.type,
    processId: baseEntry.processId,
    messageId: baseEntry.messageId,
    title: baseEntry.title,
    body: baseEntry.body,
    targetTab: 'messages',
    isRead: false,
    createdAt: new Date().toISOString(),
    readAt: null,
  }))
}

function toFirestorePayload(notification) {
  return {
    recipientUserId: notification.recipientUserId,
    actorUserId: notification.actorUserId,
    actorName: notification.actorName,
    type: notification.type,
    processId: notification.processId,
    messageId: notification.messageId,
    title: notification.title,
    body: notification.body,
    targetTab: notification.targetTab,
    isRead: notification.isRead,
    createdAt: serverTimestamp(),
    readAt: notification.readAt,
  }
}

export async function listNotifications(recipientUserId) {
  const normalizedRecipientId = String(recipientUserId ?? '').trim()

  if (!normalizedRecipientId) return []

  if (!isFirebaseConfigured || !firestore) {
    return sortNotifications(
      readLocalNotifications()
        .map((item) => normalizeNotification(item))
        .filter((item) => item.recipientUserId === normalizedRecipientId)
    )
  }

  const notificationsQuery = query(
    collection(firestore, 'notifications'),
    where('recipientUserId', '==', normalizedRecipientId)
  )
  const snapshot = await getDocs(notificationsQuery)

  return sortNotifications(
    snapshot.docs.map((item) => {
      const data = item.data()

      return normalizeNotification(
        {
          ...data,
          createdAt:
            typeof data.createdAt?.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          readAt:
            typeof data.readAt?.toDate === 'function'
              ? data.readAt.toDate().toISOString()
              : data.readAt,
        },
        item.id
      )
    })
  )
}

export async function markNotificationAsRead(notificationId) {
  const normalizedId = String(notificationId ?? '').trim()

  if (!normalizedId) return

  if (!isFirebaseConfigured || !firestore) {
    const currentNotifications = readLocalNotifications().map((item) => normalizeNotification(item))
    const touchedRecipients = currentNotifications
      .filter((item) => item.id === normalizedId)
      .map((item) => item.recipientUserId)
    const nextNotifications = currentNotifications.map((item) =>
      item.id === normalizedId
        ? { ...item, isRead: true, readAt: new Date().toISOString() }
        : item
    )
    writeLocalNotifications(nextNotifications)
    notifyNotificationsChanged(touchedRecipients)
    return
  }

  const currentNotifications = await getDocs(
    query(collection(firestore, 'notifications'), where('__name__', '==', normalizedId))
  )
  const touchedRecipients = currentNotifications.docs.map((item) =>
    String(item.data()?.recipientUserId ?? '')
  )

  await updateDoc(doc(firestore, 'notifications', normalizedId), {
    isRead: true,
    readAt: serverTimestamp(),
  })

  notifyNotificationsChanged(touchedRecipients)
}

export async function markAllNotificationsAsRead(recipientUserId) {
  const notifications = await listNotifications(recipientUserId)
  const unreadNotifications = notifications.filter((item) => !item.isRead)

  await Promise.all(unreadNotifications.map((item) => markNotificationAsRead(item.id)))
}

export async function createNotifications(notifications) {
  const normalizedNotifications = notifications
    .map((item) => normalizeNotification(item, item?.id))
    .filter((item) => item.recipientUserId && item.title && item.body)

  if (normalizedNotifications.length === 0) return []

  if (!isFirebaseConfigured || !firestore) {
    const currentNotifications = readLocalNotifications().map((item) => normalizeNotification(item))
    writeLocalNotifications(sortNotifications([...normalizedNotifications, ...currentNotifications]))
    notifyNotificationsChanged(normalizedNotifications.map((item) => item.recipientUserId))
    return normalizedNotifications
  }

  await Promise.all(
    normalizedNotifications.map((notification) =>
      setDoc(doc(firestore, 'notifications', notification.id), toFirestorePayload(notification))
    )
  )

  notifyNotificationsChanged(normalizedNotifications.map((item) => item.recipientUserId))

  return normalizedNotifications
}

export { NOTIFICATIONS_CHANGED_EVENT }

export async function createProcessMessageNotifications({
  actor,
  process,
  message,
  existingMessages = [],
}) {
  const actorUserId = String(actor?.uid ?? actor?.id ?? '').trim()

  if (!actorUserId || !process?.id || !message?.id) return []

  const recipients = await listNotificationRecipients()
  const recipientById = new Map(recipients.map((item) => [item.uid, item]))
  const activeRecipients = recipients.filter((item) => item.isActive)
  const processLabel = buildProcessLabel(process)
  const actorName = actor?.name ?? actor?.email ?? 'Usuário'
  const notificationMap = new Map()

  const pushNotification = (recipientUserId, type, title, body) => {
    if (!recipientUserId || recipientUserId === actorUserId) return
    if (!recipientById.has(recipientUserId)) return
    if (notificationMap.has(recipientUserId)) return

    notificationMap.set(recipientUserId, {
      recipientUserId,
      actorUserId,
      actorName,
      type,
      processId: process.id,
      messageId: message.id,
      title,
      body,
    })
  }

  if (actor?.role === 'admin') {
    const latestExternalMessage = [...existingMessages]
      .reverse()
      .find((item) => {
        if (!item?.authorId || item.authorId === actorUserId) return false
        return recipientById.get(item.authorId)?.role !== 'admin'
      })

    if (latestExternalMessage?.authorId) {
      pushNotification(
        latestExternalMessage.authorId,
        'process_question_answered',
        'Sua dúvida recebeu uma resposta',
        buildReplyNotificationBody(processLabel, actorName)
      )
    }
  } else {
    activeRecipients
      .filter((item) => item.role === 'admin')
      .forEach((item) => {
        pushNotification(
          item.uid,
          'process_question_created',
          'Nova dúvida em processo',
          buildAdminNotificationBody(processLabel, actorName)
        )
      })
  }

  activeRecipients
    .filter((item) => item.role !== 'admin' && item.favoriteProcessIds.includes(process.id))
    .forEach((item) => {
      pushNotification(
        item.uid,
        'favorite_process_message',
        'Atualização em processo favoritado',
        buildFavoriteNotificationBody(processLabel, actorName)
      )
    })

  return createNotifications(
    Array.from(notificationMap.values()).flatMap((entry) =>
      buildNotificationEntries([entry.recipientUserId], entry)
    )
  )
}
