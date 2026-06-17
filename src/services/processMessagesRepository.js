import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { createAuditEvent } from './auditRepository'
import { repairTextEncoding } from '../utils/textEncoding'

// As conversas ficam no Firestore porque FCM é um canal de entrega de notificações,
// não um armazenamento de histórico. A estrutura em subcoleção por processo
// mantém o histórico escalável e deixa a integração com push aberta para uma
// etapa futura, caso o projeto adicione service worker e backend/admin SDK.
function getStorageKey(processId) {
  return `sq-comex-process-messages:${processId}`
}

function normalizeMessage(rawMessage, fallbackId) {
  return {
    id: rawMessage?.id ?? fallbackId,
    processId: String(rawMessage?.processId ?? ''),
    authorId: String(rawMessage?.authorId ?? ''),
    authorName: repairTextEncoding(String(rawMessage?.authorName ?? 'Usuário')),
    authorEmail: String(rawMessage?.authorEmail ?? ''),
    content: repairTextEncoding(String(rawMessage?.content ?? '').trim()),
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
    details.includes('unavailable')
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

async function recordProcessMessageDeletionAudit(payload, actor = null) {
  try {
    await createAuditEvent({
      action: 'Mensagem removida do processo',
      actor: actor?.name ?? actor?.email ?? 'Sistema',
      target: payload.processId,
    })
  } catch (error) {
    console.error('Falha ao registrar auditoria da exclusão da mensagem do processo.', error)
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
      authorName: repairTextEncoding(
        actor?.name ?? actor?.email ?? message?.authorName ?? 'Usuário'
      ),
      authorEmail: actor?.email ?? message?.authorEmail ?? '',
      createdAt: new Date().toISOString(),
    },
    `MSG-${Date.now()}`
  )

  if (!payload.content) {
    throw new Error('A mensagem não pode ficar vazia.')
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

export async function deleteProcessMessage(processId, messageId, actor = null) {
  const normalizedProcessId = String(processId ?? '').trim()
  const normalizedMessageId = String(messageId ?? '').trim()

  if (!normalizedProcessId || !normalizedMessageId) {
    throw new Error('Mensagem inválida para exclusão.')
  }

  const currentMessages = readLocalMessages(normalizedProcessId)
  const deletedMessage =
    currentMessages.find((item) => item.id === normalizedMessageId) ??
    normalizeMessage({ id: normalizedMessageId, processId: normalizedProcessId }, normalizedMessageId)

  if (!isFirebaseConfigured || !firestore) {
    writeLocalMessages(
      normalizedProcessId,
      currentMessages.filter((item) => item.id !== normalizedMessageId)
    )
    await recordProcessMessageDeletionAudit(deletedMessage, actor)
    return
  }

  try {
    await deleteDoc(doc(firestore, 'processes', normalizedProcessId, 'messages', normalizedMessageId))
  } catch (error) {
    if (!shouldFallbackToLocal(error)) {
      throw error
    }

    writeLocalMessages(
      normalizedProcessId,
      currentMessages.filter((item) => item.id !== normalizedMessageId)
    )
  }

  await recordProcessMessageDeletionAudit(deletedMessage, actor)
}
