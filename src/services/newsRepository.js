import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { normalizeNewsMediaItems } from '../utils/newsMedia'
import { createAuditEvent } from './auditRepository'
import { deleteNewsMediaItems } from './newsMediaStorage'

const STORAGE_KEY = 'sq-comex-news'

function normalizeReferences(references) {
  if (!Array.isArray(references)) return []

  return references
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeCoverImageItem(rawNewsItem) {
  const coverImage = String(rawNewsItem?.coverImage ?? '').trim()
  const coverImageStoragePath = String(rawNewsItem?.coverImageStoragePath ?? '').trim()
  const coverImageName = String(rawNewsItem?.coverImageName ?? '').trim()
  const coverImageMimeType = String(rawNewsItem?.coverImageMimeType ?? '').trim()
  const coverImageUploadedAt = String(rawNewsItem?.coverImageUploadedAt ?? '').trim()
  const coverImageSize = Number.isFinite(rawNewsItem?.coverImageSize) && Number(rawNewsItem.coverImageSize) > 0
    ? Number(rawNewsItem.coverImageSize)
    : null

  if (!coverImage) {
    return null
  }

  return normalizeNewsMediaItems([
    {
      id: 'NEWS-COVER',
      url: coverImage,
      storagePath: coverImageStoragePath,
      caption: coverImageName || 'Capa da noticia',
      name: coverImageName || 'capa-noticia',
      mimeType: coverImageMimeType || 'image/jpeg',
      kind: 'image',
      size: coverImageSize,
      uploadedAt: coverImageUploadedAt,
    },
  ])[0] ?? null
}

function normalizeNewsItem(rawNewsItem, fallbackId) {
  const coverImageItem = normalizeCoverImageItem(rawNewsItem)

  return {
    id: rawNewsItem.id ?? fallbackId,
    title: rawNewsItem.title ?? '',
    content: rawNewsItem.content ?? '',
    coverImage: coverImageItem?.url ?? '',
    coverImageStoragePath: coverImageItem?.storagePath ?? '',
    coverImageName: coverImageItem?.name ?? '',
    coverImageMimeType: coverImageItem?.mimeType ?? '',
    coverImageSize: coverImageItem?.size ?? null,
    coverImageUploadedAt: coverImageItem?.uploadedAt ?? '',
    coverImageItem,
    mediaItems: normalizeNewsMediaItems(rawNewsItem.mediaItems),
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

async function recordNewsAudit(event) {
  try {
    await createAuditEvent(event)
  } catch (error) {
    console.error('Falha ao registrar auditoria da noticia.', error)
  }
}

async function cleanupDeletedNewsMedia(newsItem) {
  const coverImageItem = newsItem?.coverImageItem ? [newsItem.coverImageItem] : []

  try {
    await deleteNewsMediaItems([...(newsItem?.mediaItems ?? []), ...coverImageItem])
  } catch (error) {
    console.error('Falha ao remover arquivos da noticia no Storage.', error)
  }
}

export function createNewsItemId() {
  if (isFirebaseConfigured && firestore) {
    return doc(collection(firestore, 'news')).id
  }

  return `NEWS-${Date.now()}`
}

export async function listNews() {
  if (!isFirebaseConfigured || !firestore) {
    return sortNews(readLocalNews().map((item) => normalizeNewsItem(item)))
  }

  const snapshot = await getDocs(collection(firestore, 'news'))

  return sortNews(
    snapshot.docs.map((item) => {
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
  )
}

export async function saveNewsItem(newsItem, actor = null) {
  const normalizedNewsItem = normalizeNewsItem(newsItem, newsItem.id || createNewsItemId())
  const isEditing = Boolean(newsItem.id)
  const now = new Date().toISOString()

  if (!isFirebaseConfigured || !firestore) {
    const currentNews = readLocalNews().map((item) => normalizeNewsItem(item))
    const nextNewsItem = {
      ...normalizedNewsItem,
      id: normalizedNewsItem.id || createNewsItemId(),
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

    await recordNewsAudit({
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
    coverImageStoragePath: normalizedNewsItem.coverImageStoragePath,
    coverImageName: normalizedNewsItem.coverImageName,
    coverImageMimeType: normalizedNewsItem.coverImageMimeType,
    coverImageSize: normalizedNewsItem.coverImageSize,
    coverImageUploadedAt: normalizedNewsItem.coverImageUploadedAt,
    mediaItems: normalizedNewsItem.mediaItems,
    references: normalizedNewsItem.references,
    updatedAt: serverTimestamp(),
  }

  await setDoc(
    doc(firestore, 'news', normalizedNewsItem.id),
    {
      ...payload,
      ...(isEditing ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  )

  await recordNewsAudit({
    action: isEditing ? 'Noticia atualizada' : 'Noticia publicada',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedNewsItem.id,
  })

  return {
    ...normalizedNewsItem,
    createdAt: isEditing ? normalizedNewsItem.createdAt || now : now,
    updatedAt: now,
  }
}

export async function removeNewsItem(newsItemOrId, actor = null) {
  const normalizedNewsItem =
    newsItemOrId && typeof newsItemOrId === 'object'
      ? normalizeNewsItem(newsItemOrId, newsItemOrId.id)
      : null
  const newsItemId =
    normalizedNewsItem?.id || String(newsItemOrId ?? '').trim()

  if (!newsItemId) {
    throw new Error('Noticia invalida para exclusao.')
  }

  if (!isFirebaseConfigured || !firestore) {
    const nextNews = readLocalNews()
      .map((item) => normalizeNewsItem(item))
      .filter((item) => item.id !== newsItemId)

    writeLocalNews(nextNews)

    await recordNewsAudit({
      action: 'Noticia removida',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: newsItemId,
    })

    return
  }

  await deleteDoc(doc(firestore, 'news', newsItemId))
  await cleanupDeletedNewsMedia(normalizedNewsItem)
  await recordNewsAudit({
    action: 'Noticia removida',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: newsItemId,
  })
}
