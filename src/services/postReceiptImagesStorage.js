import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { isFirebaseConfigured, storage } from '../lib/firebase'
import {
  isPendingPostReceiptImage,
  normalizeDraftPostReceiptImages,
  normalizePostReceiptImages,
} from '../utils/postReceiptImages'
import { validateImageUpload } from '../utils/storageUploadValidation'

function normalizeStringValue(value) {
  return String(value ?? '').trim()
}

function sanitizeFileName(value) {
  const normalizedValue = normalizeStringValue(value)
  const fallbackValue = normalizedValue || 'imagem.jpg'
  const sanitizedValue = fallbackValue.replace(/[^\w.-]+/g, '-')

  return sanitizedValue || 'imagem.jpg'
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
      reject(new Error(`Nao foi possivel ler o arquivo "${normalizeStringValue(file?.name) || 'imagem'}".`))
    }

    reader.readAsDataURL(file)
  })
}

function createStoredImage(image, overrides = {}) {
  return {
    id: normalizeStringValue(overrides.id ?? image?.id) || `POST-RECEIPT-IMAGE-${Date.now()}`,
    url: normalizeStringValue(overrides.url ?? image?.url),
    storagePath: normalizeStringValue(overrides.storagePath ?? image?.storagePath),
    name: normalizeStringValue(overrides.name ?? image?.name) || 'imagem.jpg',
    mimeType: normalizeStringValue(overrides.mimeType ?? image?.mimeType) || 'image/jpeg',
    size: Number.isFinite(overrides.size ?? image?.size) ? Number(overrides.size ?? image?.size) : null,
    uploadedAt:
      normalizeStringValue(overrides.uploadedAt ?? image?.uploadedAt) || new Date().toISOString(),
  }
}

function isSameStoredImage(leftImage, rightImage) {
  const leftStoragePath = normalizeStringValue(leftImage?.storagePath)
  const rightStoragePath = normalizeStringValue(rightImage?.storagePath)

  if (leftStoragePath || rightStoragePath) {
    return leftStoragePath && leftStoragePath === rightStoragePath
  }

  return (
    normalizeStringValue(leftImage?.url) === normalizeStringValue(rightImage?.url) &&
    normalizeStringValue(leftImage?.name) === normalizeStringValue(rightImage?.name)
  )
}

export async function resolvePostReceiptImagesForSave(processId, images, actorId = '') {
  const draftImages = normalizeDraftPostReceiptImages(images)
  const uploadedStoragePaths = []

  try {
    const resolvedImages = []

    for (const image of draftImages) {
      if (!isPendingPostReceiptImage(image)) {
        const normalizedImage = normalizePostReceiptImages([image])[0]

        if (normalizedImage) {
          resolvedImages.push(normalizedImage)
        }

        continue
      }

      const file = image.file

      if (!file) continue
      validateImageUpload(file)

      if (isFirebaseConfigured && storage) {
        const safeProcessId = sanitizePathSegment(processId, 'processo')
        const safeActorId = sanitizePathSegment(actorId, 'usuario')
        const storagePath = `processes/${safeProcessId}/post-receipt/${Date.now()}-${safeActorId}-${sanitizeFileName(file.name)}`
        const storageRef = ref(storage, storagePath)

        await uploadBytes(storageRef, file, {
          contentType: image.mimeType || file.type || 'image/jpeg',
        })

        uploadedStoragePaths.push(storagePath)

        resolvedImages.push(
          createStoredImage(image, {
            url: await getDownloadURL(storageRef),
            storagePath,
          })
        )

        continue
      }

      resolvedImages.push(
        createStoredImage(image, {
          url: await readFileAsDataUrl(file),
        })
      )
    }

    return resolvedImages
  } catch (error) {
    if (isFirebaseConfigured && storage && uploadedStoragePaths.length > 0) {
      await Promise.allSettled(
        uploadedStoragePaths.map((storagePath) => deleteObject(ref(storage, storagePath)))
      )
    }

    throw error
  }
}

export async function deletePostReceiptImages(images) {
  if (!isFirebaseConfigured || !storage) return

  const normalizedImages = normalizePostReceiptImages(images).filter((image) => image.storagePath)

  await Promise.allSettled(
    normalizedImages.map((image) => deleteObject(ref(storage, image.storagePath)))
  )
}

export function getRemovedPostReceiptImages(previousImages, nextImages) {
  const normalizedPreviousImages = normalizePostReceiptImages(previousImages)
  const normalizedNextImages = normalizePostReceiptImages(nextImages)

  return normalizedPreviousImages.filter((previousImage) => {
    return !normalizedNextImages.some((nextImage) => isSameStoredImage(previousImage, nextImage))
  })
}

export function getAddedPostReceiptImages(previousImages, nextImages) {
  return getRemovedPostReceiptImages(nextImages, previousImages)
}
