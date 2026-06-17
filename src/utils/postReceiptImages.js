export const MAX_POST_RECEIPT_IMAGES = 6
export const MAX_POST_RECEIPT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

function normalizeStringValue(value) {
  return String(value ?? '').trim()
}

function normalizeImageSize(value) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null
}

function isBrowserFile(value) {
  return typeof File !== 'undefined' && value instanceof File
}

function formatImageName(value) {
  return normalizeStringValue(value) || 'imagem.jpg'
}

function buildBaseImage(rawImage, index) {
  const sourceImage = rawImage && typeof rawImage === 'object' ? rawImage : { url: rawImage }

  return {
    id: normalizeStringValue(sourceImage.id) || `POST-RECEIPT-IMAGE-${index + 1}`,
    url: normalizeStringValue(sourceImage.url),
    previewUrl: normalizeStringValue(sourceImage.previewUrl),
    storagePath: normalizeStringValue(sourceImage.storagePath),
    name: formatImageName(sourceImage.name || `Imagem ${index + 1}`),
    mimeType: normalizeStringValue(sourceImage.mimeType) || 'image/jpeg',
    size: normalizeImageSize(sourceImage.size),
    uploadedAt: normalizeStringValue(sourceImage.uploadedAt),
    file: isBrowserFile(sourceImage.file) ? sourceImage.file : null,
    isPending: Boolean(sourceImage.isPending) || isBrowserFile(sourceImage.file),
  }
}

export function normalizePostReceiptImages(images) {
  if (!Array.isArray(images)) return []

  return images
    .map((image, index) => buildBaseImage(image, index))
    .map((image) => ({
      id: image.id,
      url: image.url,
      storagePath: image.storagePath,
      name: image.name,
      mimeType: image.mimeType,
      size: image.size,
      uploadedAt: image.uploadedAt,
    }))
    .filter((image) => image.url)
}

export function normalizeDraftPostReceiptImages(images) {
  if (!Array.isArray(images)) return []

  return images
    .map((image, index) => buildBaseImage(image, index))
    .filter((image) => image.url || image.previewUrl || image.file)
}

export function isPendingPostReceiptImage(image) {
  return Boolean(image?.isPending) || isBrowserFile(image?.file)
}

export function toPostReceiptImagePreviewUrl(image) {
  return normalizeStringValue(image?.previewUrl) || normalizeStringValue(image?.url)
}

export function revokePostReceiptImagePreview(image) {
  const previewUrl = normalizeStringValue(image?.previewUrl)

  if (previewUrl.startsWith('blob:') && typeof URL !== 'undefined') {
    URL.revokeObjectURL(previewUrl)
  }
}

export function buildPendingPostReceiptImages(fileList) {
  const files = Array.from(fileList ?? [])

  return files.map((file, index) => {
    if (!String(file?.type ?? '').startsWith('image/')) {
      throw new Error(`O arquivo "${formatImageName(file?.name)}" nao e uma imagem valida.`)
    }

    if (Number(file?.size ?? 0) > MAX_POST_RECEIPT_IMAGE_SIZE_BYTES) {
      throw new Error(
        `A imagem "${formatImageName(file?.name)}" excede o limite de ${formatPostReceiptImageSize(MAX_POST_RECEIPT_IMAGE_SIZE_BYTES)}.`
      )
    }

    return {
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      url: '',
      previewUrl:
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : '',
      storagePath: '',
      name: formatImageName(file?.name),
      mimeType: normalizeStringValue(file?.type) || 'image/jpeg',
      size: normalizeImageSize(file?.size),
      uploadedAt: '',
      file,
      isPending: true,
    }
  })
}

export function formatPostReceiptImageSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) return ''

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(0)} KB`
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`
}
