import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { repairTextEncoding } from '../utils/textEncoding'

const STORAGE_KEY = 'sq-comex-notifications'
const NOTIFICATIONS_CHANGED_EVENT = 'sq-comex-notifications-changed'
const READ_NOTIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000

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
    actorName: repairTextEncoding(String(rawNotification?.actorName ?? '')),
    type: String(rawNotification?.type ?? 'process_message'),
    processId: String(rawNotification?.processId ?? ''),
    messageId: String(rawNotification?.messageId ?? ''),
    title: repairTextEncoding(String(rawNotification?.title ?? '').trim()),
    body: repairTextEncoding(String(rawNotification?.body ?? '').trim()),
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

function isExpiredReadNotification(notification, now = Date.now()) {
  if (!notification?.isRead || !notification?.readAt) return false

  const readAtTime = new Date(notification.readAt).getTime()
  if (Number.isNaN(readAtTime)) return false

  return now - readAtTime > READ_NOTIFICATION_RETENTION_MS
}

function partitionExpiredNotifications(notifications, now = Date.now()) {
  return notifications.reduce(
    (result, notification) => {
      if (isExpiredReadNotification(notification, now)) {
        result.expired.push(notification)
      } else {
        result.active.push(notification)
      }

      return result
    },
    { active: [], expired: [] }
  )
}

function buildProcessLabel(process) {
  const name = String(process?.name ?? '').trim()
  if (name) return name

  const processNumber = String(process?.processNumber ?? '').trim()
  return processNumber ? `PO ${processNumber}` : 'processo'
}

function canShowProcessNameForRole(process, role) {
  const category = String(process?.category ?? '').trim()
  const normalizedRole = String(role ?? '').trim()
  const isRestrictedCategory = ['FCL', 'LCL', 'AEREO'].includes(category)

  return normalizedRole === 'admin' || !isRestrictedCategory
}

function buildRecipientProcessLabel(process, role) {
  if (canShowProcessNameForRole(process, role)) {
    const processName = String(process?.name ?? '').trim()
    if (processName) return processName
  }

  const processNumber = String(process?.processNumber ?? '').trim()
  return processNumber ? `PO ${processNumber}` : buildProcessLabel(process)
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

function buildPostReceiptNotesNotificationBody(processLabel, actorName) {
  return `${actorName} registrou observações pós-recebimento da carga em ${processLabel}.`
}

function buildFavoriteProcessUpdatedTitle(processLabel) {
  return `Processo atualizado: ${processLabel}`
}

function buildFavoriteProcessUpdatedBody(processLabel, updateSummary) {
  return `${processLabel}: ${updateSummary}`
}

function formatDateLabel(value) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function buildProcessUpdateSummary(previousProcess, nextProcess) {
  const changes = []

  if (String(previousProcess?.processStatus ?? '') !== String(nextProcess?.processStatus ?? '')) {
    changes.push(`status alterado para ${nextProcess?.processStatus || '-'}`)
  }

  if (String(previousProcess?.eta ?? '') !== String(nextProcess?.eta ?? '')) {
    changes.push(`ETA atualizada para ${formatDateLabel(nextProcess?.eta)}`)
  }

  if (String(previousProcess?.etd ?? '') !== String(nextProcess?.etd ?? '')) {
    changes.push(`ETD atualizada para ${formatDateLabel(nextProcess?.etd)}`)
  }

  if (String(previousProcess?.destination ?? '') !== String(nextProcess?.destination ?? '')) {
    changes.push(`destino atualizado para ${nextProcess?.destination || '-'}`)
  }

  if (String(previousProcess?.processNotes ?? '') !== String(nextProcess?.processNotes ?? '')) {
    changes.push('observações do processo atualizadas')
  }

  if (String(previousProcess?.postReceiptNotes ?? '') !== String(nextProcess?.postReceiptNotes ?? '')) {
    changes.push('observações pós-recebimento atualizadas')
  }

  if (
    JSON.stringify(normalizePostReceiptImages(previousProcess?.postReceiptImages)) !==
    JSON.stringify(normalizePostReceiptImages(nextProcess?.postReceiptImages))
  ) {
    changes.push('imagens pos-recebimento atualizadas')
  }

  if (JSON.stringify(previousProcess?.items ?? []) !== JSON.stringify(nextProcess?.items ?? [])) {
    changes.push('itens vinculados atualizados')
  }

  if (changes.length === 0) {
    return 'dados do processo atualizados.'
  }

  if (changes.length === 1) {
    return `${changes[0]}.`
  }

  return `${changes.slice(0, 2).join(' e ')}.`
}

function sanitizeProcessForComparison(process) {
  if (!process) return null

  return {
    name: String(process.name ?? '').trim(),
    category: String(process.category ?? '').trim(),
    processNumber: String(process.processNumber ?? '').trim(),
    destination: String(process.destination ?? '').trim(),
    etd: String(process.etd ?? '').trim(),
    eta: String(process.eta ?? '').trim(),
    etaOriginal: String(process.etaOriginal ?? '').trim(),
    processStatus: String(process.processStatus ?? '').trim(),
    containerQuantity: Number(process.containerQuantity ?? 0),
    palletQuantity: Number(process.palletQuantity ?? 0),
    processNotes: String(process.processNotes ?? '').trim(),
    postReceiptNotes: String(process.postReceiptNotes ?? '').trim(),
    postReceiptImages: normalizePostReceiptImages(process.postReceiptImages),
    cargoReceivedAt: String(process.cargoReceivedAt ?? '').trim(),
    berthed: Boolean(process.berthed),
    arrived: Boolean(process.arrived),
    cargoPresenceInformed: Boolean(process.cargoPresenceInformed),
    duimpStatus: String(process.duimpStatus ?? '').trim(),
    parameterizationChannel: String(process.parameterizationChannel ?? '').trim(),
    collectionStatus: String(process.collectionStatus ?? '').trim(),
    collectionScheduledAt: String(process.collectionScheduledAt ?? '').trim(),
    mapaStatus: String(process.mapaStatus ?? '').trim(),
    mapaInspectionScheduledAt: String(process.mapaInspectionScheduledAt ?? '').trim(),
    dtaStatus: String(process.dtaStatus ?? '').trim(),
    dtaLoadingScheduledAt: String(process.dtaLoadingScheduledAt ?? '').trim(),
    dtaArrivalAtItajai: String(process.dtaArrivalAtItajai ?? '').trim(),
    items: Array.isArray(process.items)
      ? process.items.map((item) => ({
          commercialName: String(item?.commercialName ?? '').trim(),
          quantity: Number(item?.quantity ?? 0),
        }))
      : [],
  }
}

function hasMeaningfulProcessChanges(previousProcess, nextProcess) {
  return (
    JSON.stringify(sanitizeProcessForComparison(previousProcess)) !==
    JSON.stringify(sanitizeProcessForComparison(nextProcess))
  )
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
    const currentNotifications = readLocalNotifications().map((item) => normalizeNotification(item))
    const { active, expired } = partitionExpiredNotifications(currentNotifications)

    if (expired.length > 0) {
      writeLocalNotifications(sortNotifications(active))
      notifyNotificationsChanged(expired.map((item) => item.recipientUserId))
    }

    return sortNotifications(active.filter((item) => item.recipientUserId === normalizedRecipientId))
  }

  const notificationsQuery = query(
    collection(firestore, 'notifications'),
    where('recipientUserId', '==', normalizedRecipientId)
  )
  const snapshot = await getDocs(notificationsQuery)
  const normalizedNotifications = snapshot.docs.map((item) => {
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
  const { active, expired } = partitionExpiredNotifications(normalizedNotifications)

  if (expired.length > 0) {
    await Promise.all(expired.map((item) => deleteDoc(doc(firestore, 'notifications', item.id))))
    notifyNotificationsChanged([normalizedRecipientId])
  }

  return sortNotifications(active)
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

// As funções de notificação usadas pelo front foram removidas: o backend
// (functions/index.js) é a fonte de verdade e gera notificações a partir
// dos gatilhos de processo, mensagens e observações de pós-recebimento.

export { NOTIFICATIONS_CHANGED_EVENT }
