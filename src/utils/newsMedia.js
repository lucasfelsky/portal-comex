const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i

const MIME_TYPES_BY_EXTENSION = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

function normalizeStringValue(value) {
  return String(value ?? '').trim()
}

function normalizeMediaSize(value) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null
}

function isBrowserFile(value) {
  return typeof File !== 'undefined' && value instanceof File
}

function getFileExtension(value) {
  const normalizedValue = normalizeStringValue(value)
  const sanitizedValue = normalizedValue.split('?')[0].split('#')[0]
  const segments = sanitizedValue.split('.')

  return segments.length > 1 ? segments.pop().toLowerCase() : ''
}

function buildBaseNewsMediaItem(rawMediaItem, index) {
  const sourceItem =
    rawMediaItem && typeof rawMediaItem === 'object' ? rawMediaItem : { url: rawMediaItem }
  const url = normalizeStringValue(sourceItem.url)
  const previewUrl = normalizeStringValue(sourceItem.previewUrl)
  const caption = normalizeStringValue(sourceItem.caption)
  const name = normalizeStringValue(sourceItem.name) || caption || `Arquivo ${index + 1}`
  const mimeType =
    normalizeStringValue(sourceItem.mimeType) || inferMimeType(url) || inferMimeType(name)
  const normalizedItem = {
    id:
      normalizeStringValue(sourceItem.id) ||
      `NEWS-MEDIA-${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    previewUrl,
    storagePath: normalizeStringValue(sourceItem.storagePath),
    caption: caption || name,
    name,
    mimeType,
    kind: sourceItem.kind === 'image' || sourceItem.kind === 'file' ? sourceItem.kind : '',
    size: normalizeMediaSize(sourceItem.size),
    uploadedAt: normalizeStringValue(sourceItem.uploadedAt),
    file: isBrowserFile(sourceItem.file) ? sourceItem.file : null,
    isPending: Boolean(sourceItem.isPending) || isBrowserFile(sourceItem.file),
  }

  return {
    ...normalizedItem,
    kind: normalizedItem.kind || (isImageNewsMediaItem(normalizedItem) ? 'image' : 'file'),
  }
}

export function inferMimeType(value) {
  const normalizedValue = normalizeStringValue(value)

  if (!normalizedValue) return ''

  if (normalizedValue.startsWith('data:')) {
    const mimeType = normalizedValue.slice(5, normalizedValue.indexOf(';'))
    return normalizeStringValue(mimeType)
  }

  const extension = getFileExtension(normalizedValue)
  return MIME_TYPES_BY_EXTENSION[extension] ?? ''
}

export function isImageNewsMediaItem(mediaItem) {
  const mimeType = normalizeStringValue(mediaItem?.mimeType) || inferMimeType(mediaItem?.url)

  if (mimeType.startsWith('image/')) {
    return true
  }

  const candidateName = normalizeStringValue(mediaItem?.name) || normalizeStringValue(mediaItem?.caption)
  return IMAGE_EXTENSION_PATTERN.test(normalizeStringValue(mediaItem?.url)) || IMAGE_EXTENSION_PATTERN.test(candidateName)
}

export function normalizeNewsMediaItems(mediaItems) {
  if (!Array.isArray(mediaItems)) return []

  return mediaItems
    .map((item, index) => buildBaseNewsMediaItem(item, index))
    .map((item) => ({
      id: item.id,
      url: item.url,
      storagePath: item.storagePath,
      caption: item.caption,
      name: item.name,
      mimeType: item.mimeType,
      kind: item.kind,
      size: item.size,
      uploadedAt: item.uploadedAt,
    }))
    .filter((item) => item.url)
}

export function normalizeDraftNewsMediaItems(mediaItems) {
  if (!Array.isArray(mediaItems)) return []

  return mediaItems
    .map((item, index) => buildBaseNewsMediaItem(item, index))
    .filter((item) => item.url || item.previewUrl || item.file)
}

export function isPendingNewsMediaItem(mediaItem) {
  return Boolean(mediaItem?.isPending) || isBrowserFile(mediaItem?.file)
}

export function toNewsMediaPreviewUrl(mediaItem) {
  return normalizeStringValue(mediaItem?.previewUrl) || normalizeStringValue(mediaItem?.url)
}

export function revokeNewsMediaPreview(mediaItem) {
  const previewUrl = normalizeStringValue(mediaItem?.previewUrl)

  if (previewUrl.startsWith('blob:') && typeof URL !== 'undefined') {
    URL.revokeObjectURL(previewUrl)
  }
}

export function buildPendingNewsMediaItems(fileList, options = {}) {
  const files = Array.from(fileList ?? [])
  const imagesOnly = options.imagesOnly === true

  return files.map((file, index) => {
    const fileName = normalizeStringValue(file?.name) || 'arquivo'
    const mimeType = normalizeStringValue(file?.type) || inferMimeType(fileName)

    if (imagesOnly && !String(mimeType).startsWith('image/')) {
      throw new Error(`O arquivo "${fileName}" nao e uma imagem valida.`)
    }

    const isImage = mimeType.startsWith('image/')
    const previewUrl =
      isImage && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : ''

    return {
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      url: previewUrl,
      previewUrl,
      storagePath: '',
      caption: fileName,
      name: fileName,
      mimeType,
      kind: isImage ? 'image' : 'file',
      size: normalizeMediaSize(file?.size),
      uploadedAt: '',
      file,
      isPending: true,
    }
  })
}

export function getNewsMediaDisplayName(mediaItem) {
  return normalizeStringValue(mediaItem?.name) || normalizeStringValue(mediaItem?.caption) || 'Arquivo anexado'
}

export function formatNewsMediaSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return ''
  }

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`
}

export function areSameNewsMediaItems(leftMediaItem, rightMediaItem) {
  const leftStoragePath = normalizeStringValue(leftMediaItem?.storagePath)
  const rightStoragePath = normalizeStringValue(rightMediaItem?.storagePath)

  if (leftStoragePath || rightStoragePath) {
    return Boolean(leftStoragePath) && leftStoragePath === rightStoragePath
  }

  return (
    normalizeStringValue(leftMediaItem?.url) === normalizeStringValue(rightMediaItem?.url) &&
    normalizeStringValue(leftMediaItem?.name) === normalizeStringValue(rightMediaItem?.name)
  )
}

export function getRemovedNewsMediaItems(previousMediaItems, nextMediaItems) {
  const normalizedPreviousItems = normalizeNewsMediaItems(previousMediaItems)
  const normalizedNextItems = normalizeNewsMediaItems(nextMediaItems)

  return normalizedPreviousItems.filter((previousItem) => {
    return !normalizedNextItems.some((nextItem) => areSameNewsMediaItems(previousItem, nextItem))
  })
}

export function getAddedNewsMediaItems(previousMediaItems, nextMediaItems) {
  return getRemovedNewsMediaItems(nextMediaItems, previousMediaItems)
}
