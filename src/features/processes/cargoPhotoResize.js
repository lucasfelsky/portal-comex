// S11 (J1): redução da foto de avaria no aparelho, antes do envio (só navegador: canvas). A foto sempre é recodificada
// em JPEG (inclusive a menor que o limite), o que também tira EXIF/GPS. Lado maior 1.600 px (miniatura 400 px).
// A câmera vem do `<input type="file" capture>` da interface (sem acesso direto ao fluxo de vídeo).

import {
  CARGO_PHOTO_JPEG_QUALITY,
  CARGO_PHOTO_MAX_BYTES,
  CARGO_PHOTO_MAX_EDGE,
  CARGO_PHOTO_THUMB_EDGE,
} from './cargoConferencePhotos'

export const CARGO_PHOTO_UNREADABLE_CODE = 'cargoPhoto/unreadable'
export const CARGO_PHOTO_NOT_IMAGE_CODE = 'cargoPhoto/not-image'
export const CARGO_PHOTO_TOO_LARGE_CODE = 'cargoPhoto/too-large'

export const CARGO_PHOTO_UNREADABLE_MESSAGE =
  'Não foi possível ler esta foto. Tire de novo ou escolha uma foto JPG ou PNG.'
export const CARGO_PHOTO_NOT_IMAGE_MESSAGE = 'Escolha uma foto (arquivo de imagem).'
export const CARGO_PHOTO_TOO_LARGE_MESSAGE = 'A foto ficou grande demais mesmo reduzida. Tire de novo.'
export const CARGO_PHOTO_HUGE_MESSAGE = 'A foto é grande demais para este aparelho. Tire de novo com uma resolução menor.'

// Foto de origem acima disto (cerca de 150 megapixels) não é decodificada: em aparelho de pouca memória o navegador
// devolve canvas zerado ou derruba a aba.
export const CARGO_PHOTO_MAX_SOURCE_PIXELS = 150_000_000

// Qualidades tentadas em ordem se a primeira passar do limite do Storage (< 3 MB; raro a 1.600 px).
const FALLBACK_QUALITIES = [0.7, 0.6, 0.5]
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i
// Alguns seletores de arquivo (Android, apps de mensagem) entregam a foto sem tipo ou como octet-stream: vale pela extensão.
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

function createPhotoError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

// `image/*`; HEIC/HEIF sem tipo e arquivo `application/octet-stream` com extensão de imagem (.jpg, .heic...) também valem
// (o conteúdo ainda é validado ao decodificar). Outro tipo (PDF, planilha...) é recusado.
export function isCargoPhotoFile(file) {
  if (!file) return false
  const type = String(file.type ?? '').trim().toLowerCase()
  if (type.startsWith('image/')) return true
  if (!GENERIC_TYPES.has(type)) return false
  return IMAGE_EXTENSIONS.test(String(file.name ?? ''))
}

async function decodeWithBitmap(file) {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close?.(),
    }
  } catch {
    return null
  }
}

function waitForImage(image) {
  if (typeof image.decode === 'function') return image.decode()
  return new Promise((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('decode'))
  })
}

async function decodeWithImageElement(file) {
  if (typeof Image !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const url = URL.createObjectURL(file)
  const release = () => URL.revokeObjectURL?.(url)
  try {
    const image = new Image()
    image.src = url
    await waitForImage(image)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('empty')
    return { source: image, width, height, release }
  } catch {
    release()
    return null
  }
}

// `createImageBitmap(..., { imageOrientation: 'from-image' })` com reserva em `<img>` + `decode()`.
async function decodeCargoPhoto(file) {
  if (!isCargoPhotoFile(file)) throw createPhotoError(CARGO_PHOTO_NOT_IMAGE_CODE, CARGO_PHOTO_NOT_IMAGE_MESSAGE)
  const decoded = (await decodeWithBitmap(file)) ?? (await decodeWithImageElement(file))
  if (!decoded || !(decoded.width > 0) || !(decoded.height > 0)) {
    throw createPhotoError(CARGO_PHOTO_UNREADABLE_CODE, CARGO_PHOTO_UNREADABLE_MESSAGE)
  }
  if (decoded.width * decoded.height > CARGO_PHOTO_MAX_SOURCE_PIXELS) {
    decoded.release()
    throw createPhotoError(CARGO_PHOTO_TOO_LARGE_CODE, CARGO_PHOTO_HUGE_MESSAGE)
  }
  return decoded
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? null), 'image/jpeg', quality)
  })
}

// Canvas ainda transparente em todos os pontos de uma grade 5 x 5 = o desenho não aconteceu (foto opaca nunca fica assim).
function isCanvasUndrawn(context, width, height) {
  if (typeof context.getImageData !== 'function') return false
  const steps = 4
  try {
    for (let i = 0; i <= steps; i += 1) {
      for (let j = 0; j <= steps; j += 1) {
        const x = Math.round(((width - 1) * i) / steps)
        const y = Math.round(((height - 1) * j) / steps)
        if (context.getImageData(x, y, 1, 1).data[3] !== 0) return false
      }
    }
    return true
  } catch {
    return false
  }
}

// Lado maior = `maxEdge` (nunca amplia), mantendo a proporção; sempre recodifica em JPEG.
async function renderJpeg(decoded, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height))
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw createPhotoError(CARGO_PHOTO_UNREADABLE_CODE, CARGO_PHOTO_UNREADABLE_MESSAGE)
  if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high'
  context.drawImage(decoded.source, 0, 0, width, height)
  // Aparelho sem memória devolve canvas zerado (nada desenhado) sem erro: recusa em vez de enviar JPEG em branco.
  if (isCanvasUndrawn(context, width, height)) {
    throw createPhotoError(CARGO_PHOTO_UNREADABLE_CODE, CARGO_PHOTO_UNREADABLE_MESSAGE)
  }
  // Fundo branco por baixo: PNG com transparência não vira preto no JPEG.
  context.globalCompositeOperation = 'destination-over'
  context.fillStyle = 'white'
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'source-over'

  for (const attempt of [quality, ...FALLBACK_QUALITIES.filter((value) => value < quality)]) {
    const blob = await canvasToBlob(canvas, attempt)
    if (!blob) throw createPhotoError(CARGO_PHOTO_UNREADABLE_CODE, CARGO_PHOTO_UNREADABLE_MESSAGE)
    if (blob.size < CARGO_PHOTO_MAX_BYTES) return { blob, width, height }
  }
  throw createPhotoError(CARGO_PHOTO_TOO_LARGE_CODE, CARGO_PHOTO_TOO_LARGE_MESSAGE)
}

// Reduz uma foto: `{ blob (image/jpeg), width, height }`. Erros com `code` `cargoPhoto/*`.
export async function resizeCargoPhoto(file, { maxEdge = CARGO_PHOTO_MAX_EDGE, quality = CARGO_PHOTO_JPEG_QUALITY } = {}) {
  const decoded = await decodeCargoPhoto(file)
  try {
    return await renderJpeg(decoded, maxEdge, quality)
  } finally {
    decoded.release()
  }
}

// Foto reduzida (1.600 px) + miniatura (400 px), decodificando o arquivo uma vez só.
export async function prepareCargoPhoto(file) {
  const decoded = await decodeCargoPhoto(file)
  try {
    const full = await renderJpeg(decoded, CARGO_PHOTO_MAX_EDGE, CARGO_PHOTO_JPEG_QUALITY)
    const thumb = await renderJpeg(decoded, CARGO_PHOTO_THUMB_EDGE, CARGO_PHOTO_JPEG_QUALITY)
    return { full, thumb }
  } finally {
    decoded.release()
  }
}
