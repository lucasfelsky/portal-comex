import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { isFirebaseConfigured, storage } from '../lib/firebase'
import {
  isPendingNewsMediaItem,
  normalizeDraftNewsMediaItems,
  normalizeNewsMediaItems,
} from '../utils/newsMedia'

function normalizeStringValue(value) {
  return String(value ?? '').trim()
}

function sanitizeFileName(value) {
  const normalizedValue = normalizeStringValue(value)
  const fallbackValue = normalizedValue || 'arquivo'
  const sanitizedValue = fallbackValue.replace(/[^\w.-]+/g, '-')

  return sanitizedValue || 'arquivo'
}

function sanitizePathSegment(value, fallbackValue) {
  const normalizedValue = normalizeStringValue(value)
  const sanitizedValue = normalizedValue.replace(/[^\w-]+/g, '-')

  return sanitizedValue || fallbackValue
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => {
      reject(new Error(`Nao foi possivel ler o arquivo "${normalizeStringValue(file?.name) || 'arquivo'}".`))
    }

    reader.readAsDataURL(file)
  })
}

function createStoredNewsMediaItem(mediaItem, overrides = {}) {
  return {
    id: normalizeStringValue(overrides.id ?? mediaItem?.id) || `NEWS-MEDIA-${Date.now()}`,
    url: normalizeStringValue(overrides.url ?? mediaItem?.url),
    storagePath: normalizeStringValue(overrides.storagePath ?? mediaItem?.storagePath),
    caption: normalizeStringValue(overrides.caption ?? mediaItem?.caption ?? mediaItem?.name) || 'Arquivo',
    name: normalizeStringValue(overrides.name ?? mediaItem?.name) || 'arquivo',
    mimeType: normalizeStringValue(overrides.mimeType ?? mediaItem?.mimeType),
    kind: overrides.kind === 'image' || overrides.kind === 'file' ? overrides.kind : mediaItem?.kind,
    size: Number.isFinite(overrides.size ?? mediaItem?.size) ? Number(overrides.size ?? mediaItem?.size) : null,
    uploadedAt:
      normalizeStringValue(overrides.uploadedAt ?? mediaItem?.uploadedAt) || new Date().toISOString(),
  }
}

async function uploadPendingNewsMediaItem(newsId, mediaItem, actorId, folderName) {
  const file = mediaItem?.file

  if (!file) {
    const normalizedMediaItem = normalizeNewsMediaItems([mediaItem])[0]
    return normalizedMediaItem ?? null
  }

  if (isFirebaseConfigured && storage) {
    const safeNewsId = sanitizePathSegment(newsId, 'noticia')
    const safeActorId = sanitizePathSegment(actorId, 'usuario')
    const storagePath = `news/${safeNewsId}/${folderName}/${Date.now()}-${safeActorId}-${sanitizeFileName(file.name)}`
    const storageRef = ref(storage, storagePath)

    await uploadBytes(storageRef, file, {
      contentType: mediaItem?.mimeType || file.type || 'application/octet-stream',
    })

    return createStoredNewsMediaItem(mediaItem, {
      url: await getDownloadURL(storageRef),
      storagePath,
    })
  }

  return createStoredNewsMediaItem(mediaItem, {
    url: await readFileAsDataUrl(file),
  })
}

async function resolveNewsMediaCollection(newsId, mediaItems, actorId, folderName) {
  const draftMediaItems = normalizeDraftNewsMediaItems(mediaItems)
  const uploadedStoragePaths = []

  try {
    const resolvedMediaItems = []

    for (const mediaItem of draftMediaItems) {
      if (!isPendingNewsMediaItem(mediaItem)) {
        const normalizedMediaItem = normalizeNewsMediaItems([mediaItem])[0]

        if (normalizedMediaItem) {
          resolvedMediaItems.push(normalizedMediaItem)
        }

        continue
      }

      const resolvedMediaItem = await uploadPendingNewsMediaItem(newsId, mediaItem, actorId, folderName)

      if (!resolvedMediaItem) {
        continue
      }

      if (resolvedMediaItem.storagePath) {
        uploadedStoragePaths.push(resolvedMediaItem.storagePath)
      }

      resolvedMediaItems.push(resolvedMediaItem)
    }

    return resolvedMediaItems
  } catch (error) {
    if (isFirebaseConfigured && storage && uploadedStoragePaths.length > 0) {
      await Promise.allSettled(
        uploadedStoragePaths.map((storagePath) => deleteObject(ref(storage, storagePath)))
      )
    }

    throw error
  }
}

export async function resolveNewsCoverImageForSave(newsId, coverImageItem, actorId = '') {
  const [resolvedCoverImage] = await resolveNewsMediaCollection(
    newsId,
    coverImageItem ? [coverImageItem] : [],
    actorId,
    'cover'
  )

  return resolvedCoverImage ?? null
}

export async function resolveNewsMediaItemsForSave(newsId, mediaItems, actorId = '') {
  return resolveNewsMediaCollection(newsId, mediaItems, actorId, 'attachments')
}

export async function deleteNewsMediaItems(mediaItems) {
  if (!isFirebaseConfigured || !storage) return

  const normalizedMediaItems = normalizeNewsMediaItems(mediaItems).filter((item) => item.storagePath)

  await Promise.allSettled(
    normalizedMediaItems.map((mediaItem) => deleteObject(ref(storage, mediaItem.storagePath)))
  )
}
