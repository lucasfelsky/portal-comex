import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { createAuditEvent } from './auditRepository'

// As conversas ficam no Firestore porque FCM e um canal de entrega de notificacoes,
// nao um armazenamento de historico. A estrutura em subcolecao por processo
// mantem o historico escalavel e deixa a integracao com push aberta para uma
// etapa futura, caso o projeto adicione service worker e backend/admin SDK.
function getStorageKey(processId) {
  return `sq-comex-process-messages:${processId}`
}

function normalizeMessage(rawMessage, fallbackId) {
  return {
    id: rawMessage?.id ?? fallbackId,
    processId: String(rawMessage?.processId ?? ''),
    authorId: String(rawMessage?.authorId ?? ''),
    authorName: String(rawMessage?.authorName ?? 'Usuario'),
    authorEmail: String(rawMessage?.authorEmail ?? ''),
    content: String(rawMessage?.content ?? '').trim(),
    createdAt: rawMessage?.createdAt ?? new Date().toISOString(),
  }
}

function readLocalMessages(processId) {
  const stored = window.localStorage.getItem(getStorageKey(processId))

  if (!stored) return []

  try {
    return JSON.parse(stored).map((item) => normalizeMessage(item))
  } catch {
    return []
  }
}

function writeLocalMessages(processId, messages) {
  window.localStorage.setItem(getStorageKey(processId), JSON.stringify(messages))
}

function sortMessages(messages) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.createdAt ?? 0).getTime()
    return leftTime - rightTime
  })
}

function shouldFallbackToLocal(error) {
  const details = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase()
  return (
    details.includes('blocked') ||
    details.includes('client') ||
    details.includes('network') ||
    details.includes('fetch') ||
    details.includes('unavailable') ||
    details.includes('permission-denied') ||
    details.includes('permission denied')
  )
}

async function recordProcessMessageAudit(payload) {
  try {
    await createAuditEvent({
      action: 'Mensagem registrada no processo',
      actor: payload.authorName,
      target: payload.processId,
    })
  } catch (error) {
    console.error('Falha ao registrar auditoria da mensagem do processo.', error)
  }
}

export async function listProcessMessages(processId) {
  if (!processId) {
    return []
  }

  if (!isFirebaseConfigured || !firestore) {
    return sortMessages(readLocalMessages(processId))
  }

  try {
    const messagesQuery = query(
      collection(firestore, 'processes', processId, 'messages'),
      orderBy('createdAt', 'asc')
    )
    const snapshot = await getDocs(messagesQuery)

    return snapshot.docs.map((item) => {
      const data = item.data()

      return normalizeMessage(
        {
          ...data,
          createdAt:
            typeof data.createdAt?.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
        },
        item.id
      )
    })
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }

    return sortMessages(readLocalMessages(processId))
  }
}

export async function createProcessMessage(processId, message, actor = null) {
  const payload = normalizeMessage(
    {
      ...message,
      processId,
      authorId: actor?.uid ?? actor?.id ?? message?.authorId ?? '',
      authorName: actor?.name ?? actor?.email ?? message?.authorName ?? 'Usuario',
      authorEmail: actor?.email ?? message?.authorEmail ?? '',
      createdAt: new Date().toISOString(),
    },
    `MSG-${Date.now()}`
  )

  if (!payload.content) {
    throw new Error('A mensagem nao pode ficar vazia.')
  }

  if (!isFirebaseConfigured || !firestore) {
    const currentMessages = readLocalMessages(processId)
    writeLocalMessages(processId, sortMessages([...currentMessages, payload]))
    await recordProcessMessageAudit(payload)
    return payload
  }

  try {
    await addDoc(collection(firestore, 'processes', processId, 'messages'), {
      processId,
      authorId: payload.authorId,
      authorName: payload.authorName,
      authorEmail: payload.authorEmail,
      content: payload.content,
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }

    const currentMessages = readLocalMessages(processId)
    writeLocalMessages(processId, sortMessages([...currentMessages, payload]))
  }

  await recordProcessMessageAudit(payload)

  return payload
}
