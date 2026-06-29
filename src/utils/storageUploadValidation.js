// Validação de uploads de Storage no Portal COMEX.
// Limites e whitelist centralizados para post-receipt (imagens) e news media
// (cover = imagem, attachments = imagem/PDF/planilha/documento).
//
// Antes deste utilitário, postReceiptImagesStorage.js e newsMediaStorage.js só
// sanitizavam o nome do arquivo (replace /[^\w.-]+/g,'-') — sem checar mime nem
// tamanho. Limites duros ficavam implícitos no console do Firebase (ver Limitações
// conhecidas L12).

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

export const MAX_IMAGE_MB = 5
export const MAX_FILE_MB = 5

const IMAGE_MIME_WHITELIST = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const FILE_MIME_WHITELIST = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const EXTENSION_MIME_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function inferMimeType(file) {
  const declared = String(file?.type ?? '').trim().toLowerCase()

  if (declared) return declared

  const name = String(file?.name ?? '').toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop() : ''

  return EXTENSION_MIME_MAP[ext] ?? ''
}

function assertValidSize(file, maxBytes, label) {
  const size = Number(file?.size ?? 0)

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`${label} inválido ou vazio.`)
  }

  if (size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024))
    throw new Error(`${label} excede o tamanho máximo de ${maxMb} MB.`)
  }
}

export function validateImageUpload(file, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  assertValidSize(file, maxBytes, 'Imagem')

  const mime = inferMimeType(file)

  if (!IMAGE_MIME_WHITELIST.has(mime)) {
    throw new Error('Formato de imagem não permitido. Use JPG, PNG, WebP ou GIF.')
  }

  return mime
}

export function validateFileUpload(file, { maxBytes = MAX_FILE_BYTES } = {}) {
  assertValidSize(file, maxBytes, 'Arquivo')

  const mime = inferMimeType(file)

  if (!FILE_MIME_WHITELIST.has(mime)) {
    throw new Error(
      'Tipo de arquivo não permitido. Use imagem (JPG/PNG/WebP/GIF), PDF, planilha (XLS/XLSX/CSV) ou documento (DOC/DOCX).'
    )
  }

  return mime
}
