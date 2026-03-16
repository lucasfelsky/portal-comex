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

const STORAGE_KEY = 'sq-comex-news'

function normalizeMediaItems(mediaItems) {
  if (!Array.isArray(mediaItems)) return []

  return mediaItems
    .map((item, index) => ({
      id: item?.id ?? `MEDIA-${index + 1}`,
      url: item?.url ?? '',
      caption: item?.caption ?? '',
    }))
    .filter((item) => item.url)
}

function normalizeReferences(references) {
  if (!Array.isArray(references)) return []

  return references
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeNewsItem(rawNewsItem, fallbackId) {
  return {
    id: rawNewsItem.id ?? fallbackId,
    title: rawNewsItem.title ?? '',
    content: rawNewsItem.content ?? '',
    coverImage: rawNewsItem.coverImage ?? '',
    mediaItems: normalizeMediaItems(rawNewsItem.mediaItems),
    references: normalizeReferences(rawNewsItem.references),
    createdAt: rawNewsItem.createdAt ?? new Date().toISOString(),
    updatedAt: rawNewsItem.updatedAt ?? rawNewsItem.createdAt ?? new Date().toISOString(),
  }
}

function readLocalNews() {
  const storedNews = window.localStorage.getItem(STORAGE_KEY)

  if (!storedNews) {
    return []
  }

  try {
    return JSON.parse(storedNews)
  } catch {
    return []
  }
}

function writeLocalNews(newsItems) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newsItems))
}

function sortNews(newsItems) {
  return [...newsItems].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime()

    return rightTime - leftTime
  })
}

export async function listNews() {
  if (!isFirebaseConfigured || !firestore) {
    return sortNews(readLocalNews().map((item) => normalizeNewsItem(item)))
  }

  const newsQuery = query(collection(firestore, 'news'), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(newsQuery)

  return snapshot.docs.map((item) => {
    const data = item.data()

    return normalizeNewsItem(
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

export async function saveNewsItem(newsItem, actor = null) {
  const normalizedNewsItem = normalizeNewsItem(newsItem, newsItem.id)
  const isEditing = Boolean(normalizedNewsItem.id)
  const now = new Date().toISOString()

  if (!isFirebaseConfigured || !firestore) {
    const currentNews = readLocalNews().map((item) => normalizeNewsItem(item))
    const nextNewsItem = {
      ...normalizedNewsItem,
      id: normalizedNewsItem.id || `NEWS-${Date.now()}`,
      createdAt: normalizedNewsItem.createdAt || now,
      updatedAt: now,
    }
    const existingIndex = currentNews.findIndex((item) => item.id === nextNewsItem.id)

    if (existingIndex >= 0) {
      currentNews[existingIndex] = nextNewsItem
    } else {
      currentNews.unshift(nextNewsItem)
    }

    writeLocalNews(sortNews(currentNews))

    await createAuditEvent({
      action: existingIndex >= 0 ? 'Noticia atualizada' : 'Noticia publicada',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: nextNewsItem.id,
    })

    return nextNewsItem
  }

  const payload = {
    title: normalizedNewsItem.title,
    content: normalizedNewsItem.content,
    coverImage: normalizedNewsItem.coverImage,
    mediaItems: normalizedNewsItem.mediaItems,
    references: normalizedNewsItem.references,
    updatedAt: serverTimestamp(),
  }

  if (isEditing) {
    await updateDoc(doc(firestore, 'news', normalizedNewsItem.id), payload)
  } else {
    const createdRef = await addDoc(collection(firestore, 'news'), {
      ...payload,
      createdAt: serverTimestamp(),
    })

    await createAuditEvent({
      action: 'Noticia publicada',
      actor: actor?.name ?? actor?.email ?? 'Sistema',
      target: createdRef.id,
    })

    return {
      ...normalizedNewsItem,
      id: createdRef.id,
      createdAt: now,
      updatedAt: now,
    }
  }

  await createAuditEvent({
    action: 'Noticia atualizada',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedNewsItem.id,
  })

  return {
    ...normalizedNewsItem,
    updatedAt: now,
  }
}

export async function removeNewsItem(newsItemId, actor = null) {
  if (!isFirebaseConfigured || !firestore) {
    const nextNews = readLocalNews()
      .map((item) => normalizeNewsItem(item))
      .filter((item) => item.id !== newsItemId)

    writeLocalNews(nextNews)

    await createAuditEvent({
      action: 'Noticia removida',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: newsItemId,
    })

    return
  }

  await deleteDoc(doc(firestore, 'news', newsItemId))
  await createAuditEvent({
    action: 'Noticia removida',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: newsItemId,
  })
}
