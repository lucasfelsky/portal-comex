// Aba de suporte (backlog 2026-07-10).
// - Usuário aprovado abre chamado (create direto no Firestore, validado
//   pelas rules: autor = caller, status 'aberto', prioridade 3, até 5 prints).
// - Prints sobem antes para o Storage em `supportTickets/{uid}/{ts}-{nome}`
//   (rollback em falha, mesmo padrão de postReceiptImagesStorage).
// - Admin tria (status/prioridade) via updateDoc com allowlist nas rules.
// - O aviso aos admins (in-app + email) sai da Cloud Function
//   `notifySupportTicketCreated` (Admin SDK), não do client.
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore/lite'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { firestore, isFirebaseConfigured, storage } from '../lib/firebase'
import { validateImageUpload } from '../utils/storageUploadValidation'
import { createAuditEvent } from './auditRepository'

const STORAGE_KEY = 'sq-comex-support-tickets'

export const SUPPORT_TICKET_STATUSES = ['aberto', 'resolvido']
export const SUPPORT_TICKET_DEFAULT_PRIORITY = 3
export const SUPPORT_TICKET_MAX_IMAGES = 5
export const SUPPORT_TICKET_MAX_MESSAGE_LENGTH = 4000

function normalizeStringValue(value) {
  return String(value ?? '').trim()
}

function sanitizeFileName(value) {
  const normalizedValue = normalizeStringValue(value)
  const fallbackValue = normalizedValue || 'print.jpg'
  const sanitizedValue = fallbackValue.replace(/[^\w.-]+/g, '-')

  return sanitizedValue || 'print.jpg'
}

function sanitizePathSegment(value, fallbackValue) {
  const normalizedValue = normalizeStringValue(value)
  const sanitizedValue = normalizedValue.replace(/[^\w-]+/g, '-')

  return sanitizedValue || fallbackValue
}

function toIsoString(value) {
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (typeof value === 'string' && value) return value
  return null
}

function normalizeTicket(rawTicket, fallbackId) {
  const priority = Number(rawTicket.priority)

  return {
    id: rawTicket.id ?? fallbackId,
    authorId: normalizeStringValue(rawTicket.authorId),
    authorName: normalizeStringValue(rawTicket.authorName) || 'Usuário',
    authorEmail: normalizeStringValue(rawTicket.authorEmail),
    message: String(rawTicket.message ?? ''),
    imageUrls: Array.isArray(rawTicket.imageUrls)
      ? rawTicket.imageUrls.map((url) => normalizeStringValue(url)).filter(Boolean)
      : [],
    status: SUPPORT_TICKET_STATUSES.includes(rawTicket.status) ? rawTicket.status : 'aberto',
    priority:
      Number.isFinite(priority) && priority >= 1 && priority <= 5
        ? priority
        : SUPPORT_TICKET_DEFAULT_PRIORITY,
    createdAt: toIsoString(rawTicket.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(rawTicket.updatedAt) ?? toIsoString(rawTicket.createdAt),
    resolvedAt: toIsoString(rawTicket.resolvedAt),
    resolvedByName: normalizeStringValue(rawTicket.resolvedByName) || null,
  }
}

function readLocalTickets() {
  const storedTickets = window.localStorage.getItem(STORAGE_KEY)

  if (!storedTickets) {
    return []
  }

  try {
    return JSON.parse(storedTickets)
  } catch {
    return []
  }
}

function writeLocalTickets(tickets) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
}

function sortTickets(tickets) {
  return [...tickets].sort((left, right) => {
    const leftTime = new Date(left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.createdAt ?? 0).getTime()

    return rightTime - leftTime
  })
}

async function uploadTicketImages(files, authorId) {
  const uploadedStoragePaths = []
  const imageUrls = []

  try {
    for (const file of files) {
      validateImageUpload(file)

      const safeAuthorId = sanitizePathSegment(authorId, 'usuario')
      const storagePath = `supportTickets/${safeAuthorId}/${Date.now()}-${sanitizeFileName(file.name)}`
      const storageRef = ref(storage, storagePath)

      await uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
      })

      uploadedStoragePaths.push(storagePath)
      imageUrls.push(await getDownloadURL(storageRef))
    }

    return imageUrls
  } catch (error) {
    if (uploadedStoragePaths.length > 0) {
      await Promise.allSettled(
        uploadedStoragePaths.map((storagePath) => deleteObject(ref(storage, storagePath)))
      )
    }

    throw error
  }
}

export async function createSupportTicket({ message, files = [] }, profile) {
  const normalizedMessage = String(message ?? '').trim()

  if (!normalizedMessage) {
    throw new Error('Descreva o problema antes de enviar o chamado.')
  }

  if (normalizedMessage.length > SUPPORT_TICKET_MAX_MESSAGE_LENGTH) {
    throw new Error(`A mensagem pode ter no máximo ${SUPPORT_TICKET_MAX_MESSAGE_LENGTH} caracteres.`)
  }

  if (files.length > SUPPORT_TICKET_MAX_IMAGES) {
    throw new Error(`Anexe no máximo ${SUPPORT_TICKET_MAX_IMAGES} imagens.`)
  }

  const authorId = normalizeStringValue(profile?.uid)
  const authorName = normalizeStringValue(profile?.name) || 'Usuário'
  const authorEmail = normalizeStringValue(profile?.email)

  if (!isFirebaseConfigured || !firestore) {
    const now = new Date().toISOString()
    const localTicket = normalizeTicket({
      id: `SUP-${Date.now()}`,
      authorId,
      authorName,
      authorEmail,
      message: normalizedMessage,
      imageUrls: [],
      status: 'aberto',
      priority: SUPPORT_TICKET_DEFAULT_PRIORITY,
      createdAt: now,
      updatedAt: now,
    })

    writeLocalTickets(sortTickets([localTicket, ...readLocalTickets()]))
    return localTicket
  }

  const imageUrls = storage ? await uploadTicketImages(files, authorId) : []

  const createdRef = await addDoc(collection(firestore, 'supportTickets'), {
    authorId,
    authorName,
    authorEmail,
    message: normalizedMessage,
    imageUrls,
    status: 'aberto',
    priority: SUPPORT_TICKET_DEFAULT_PRIORITY,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return normalizeTicket(
    {
      authorId,
      authorName,
      authorEmail,
      message: normalizedMessage,
      imageUrls,
      status: 'aberto',
      priority: SUPPORT_TICKET_DEFAULT_PRIORITY,
      createdAt: new Date().toISOString(),
    },
    createdRef.id
  )
}

export async function listMySupportTickets(uid) {
  const normalizedUid = normalizeStringValue(uid)
  if (!normalizedUid) return []

  if (!isFirebaseConfigured || !firestore) {
    return sortTickets(
      readLocalTickets()
        .map((item) => normalizeTicket(item))
        .filter((item) => item.authorId === normalizedUid)
    )
  }

  // Sem orderBy no servidor de propósito: `where + orderBy` exigiria índice
  // composto (firestore.indexes.json está vazio). Ordenamos no client.
  const ticketsQuery = query(
    collection(firestore, 'supportTickets'),
    where('authorId', '==', normalizedUid)
  )
  const snapshot = await getDocs(ticketsQuery)

  return sortTickets(snapshot.docs.map((item) => normalizeTicket(item.data(), item.id)))
}

export async function listAllSupportTickets() {
  if (!isFirebaseConfigured || !firestore) {
    return sortTickets(readLocalTickets().map((item) => normalizeTicket(item)))
  }

  const ticketsQuery = query(collection(firestore, 'supportTickets'), orderBy('createdAt', 'desc'))
  const snapshot = await getDocs(ticketsQuery)

  return snapshot.docs.map((item) => normalizeTicket(item.data(), item.id))
}

export async function updateSupportTicket(ticketId, { status, priority }, actor = null) {
  const normalizedStatus = SUPPORT_TICKET_STATUSES.includes(status) ? status : null
  const normalizedPriority = Number(priority)

  if (!normalizedStatus) {
    throw new Error('Status inválido para o chamado.')
  }

  if (!Number.isInteger(normalizedPriority) || normalizedPriority < 1 || normalizedPriority > 5) {
    throw new Error('A prioridade deve ser um número inteiro de 1 a 5.')
  }

  const isResolved = normalizedStatus === 'resolvido'

  if (!isFirebaseConfigured || !firestore) {
    const now = new Date().toISOString()
    const nextTickets = readLocalTickets()
      .map((item) => normalizeTicket(item))
      .map((item) =>
        item.id === ticketId
          ? {
              ...item,
              status: normalizedStatus,
              priority: normalizedPriority,
              resolvedAt: isResolved ? now : null,
              resolvedByName: isResolved ? (actor?.name ?? 'Sistema local') : null,
              updatedAt: now,
            }
          : item
      )

    writeLocalTickets(nextTickets)
    return nextTickets.find((item) => item.id === ticketId) ?? null
  }

  await updateDoc(doc(firestore, 'supportTickets', ticketId), {
    status: normalizedStatus,
    priority: normalizedPriority,
    resolvedAt: isResolved ? serverTimestamp() : null,
    resolvedById: isResolved ? (normalizeStringValue(actor?.uid) || null) : null,
    resolvedByName: isResolved ? (normalizeStringValue(actor?.name) || null) : null,
    updatedAt: serverTimestamp(),
  })

  await createAuditEvent({
    action: isResolved ? 'Chamado de suporte resolvido' : 'Chamado de suporte atualizado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: ticketId,
  })

  return null
}
