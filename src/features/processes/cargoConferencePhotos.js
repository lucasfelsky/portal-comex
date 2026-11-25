// S11 (J1) do Relatório de Carga: regras PURAS das fotos de avaria por item da Conferência (sem React e sem Firebase):
// constantes de redução, caminhos do Storage, limites (5 por item, 30 por conferência) e lista de fotos não salvas.
// Dados: `conference.damageByRowId[rowId].photos[]`, `Photo = { id, path, thumbPath, width, height, size, uploadedAt, byId }`
// (shape fixado em `cargoConferenceIssues.js`). Os arquivos ficam em
// `processes/{processId}/cargo-conference/{rowId}/{ts}-{uid}-{photoId}.jpg` (1.600 px) e `...-{photoId}-t.jpg`
// (miniatura 400 px); as storage.rules exigem o uid no nome e a function de download confere o caminho contra o doc.

import {
  CARGO_PHOTOS_PER_CONFERENCE,
  CARGO_PHOTOS_PER_ROW,
  CARGO_PHOTO_ID_PATTERN,
} from './cargoConferenceIssues'

export const CARGO_PHOTO_MAX_EDGE = 1600
export const CARGO_PHOTO_THUMB_EDGE = 400
export const CARGO_PHOTO_JPEG_QUALITY = 0.82
export const CARGO_PHOTO_MAX_BYTES = 3 * 1024 * 1024
// Limites 5 por item e 30 por conferência: vêm de `cargoConferenceIssues.js` (mesma fonte do modelo da conferência).
export const CARGO_PHOTO_ROW_LIMIT = CARGO_PHOTOS_PER_ROW
export const CARGO_PHOTO_CONFERENCE_LIMIT = CARGO_PHOTOS_PER_CONFERENCE

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Mesmo saneamento de `sanitizeCargoPhotoPathSegment` (functions/src/process/cargoConferenceDamage.js): só `[\w-]`.
function sanitizeSegment(value, label) {
  const text = String(value ?? '').trim().replace(/[^\w-]+/g, '-')
  if (!text) throw new Error(`Foto da conferência sem ${label}.`)
  return text
}

// A function de download compara o `processId` cru (`[A-Za-z0-9_-]{1,128}`, igual a `downloadProcessDocument`); por isso o
// cliente NÃO sanea o processId (como faz com linha e uid): id fora do padrão é recusado, em vez de gerar arquivos que
// o servidor nunca serviria nem apagaria.
const PROCESS_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

// Id da foto (`[A-Za-z0-9_-]{1,40}`, o formato que o doc da conferência aceita).
export function createCargoPhotoId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `p${uuid.replace(/-/g, '')}`
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

// Caminhos da foto reduzida e da miniatura. `now` (ms ou Date) entra no nome e mantém a ordem de envio.
export function buildCargoPhotoPaths({ processId, rowId, uid, photoId, now = Date.now() } = {}) {
  const id = String(photoId ?? '')
  if (!CARGO_PHOTO_ID_PATTERN.test(id)) throw new Error('Id de foto da conferência inválido.')
  const stamp = Math.trunc(now instanceof Date ? now.getTime() : Number(now))
  if (!Number.isFinite(stamp) || stamp < 0) throw new Error('Data de envio da foto inválida.')
  const process = String(processId ?? '')
  if (!PROCESS_ID_PATTERN.test(process)) throw new Error('Id de processo inválido para a foto da conferência.')
  const folder = `processes/${process}/cargo-conference/${sanitizeSegment(rowId, 'item')}`
  const base = `${folder}/${stamp}-${sanitizeSegment(uid, 'usuário')}-${id}`
  return { path: `${base}.jpg`, thumbPath: `${base}-t.jpg` }
}

function rowPhotos(conference, rowId) {
  const photos = conference?.damageByRowId?.[rowId]?.photos
  return Array.isArray(photos) ? photos : []
}

function allPhotos(conference) {
  const map = conference?.damageByRowId
  if (!isPlainObject(map)) return []
  return Object.keys(map).flatMap((rowId) => rowPhotos(conference, rowId))
}

// Fotos da conferência inteira (as já no estado do item, salvas ou não).
export function countCargoPhotos(conference) {
  return allPhotos(conference).length
}

function pendingCount(pendingByRow, rowId) {
  const value = Number(pendingByRow?.[rowId])
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

// Vagas que sobram: `row` (no item) e `total` (na conferência), contando as fotos do estado e as em envio
// (`pendingByRow` = { [rowId]: n }).
export function cargoPhotoRoom(conference, rowId, pendingByRow = {}) {
  const pendingTotal = Object.keys(pendingByRow ?? {}).reduce((sum, key) => sum + pendingCount(pendingByRow, key), 0)
  const row = CARGO_PHOTO_ROW_LIMIT - rowPhotos(conference, rowId).length - pendingCount(pendingByRow, rowId)
  const total = CARGO_PHOTO_CONFERENCE_LIMIT - countCargoPhotos(conference) - pendingTotal
  return { row: Math.max(0, row), total: Math.max(0, total) }
}

// Texto que explica o botão desabilitado; '' quando ainda cabe foto.
export function describeCargoPhotoLimit(room) {
  if (room.total <= 0) return `Limite de ${CARGO_PHOTO_CONFERENCE_LIMIT} fotos por conferência atingido.`
  if (room.row <= 0) return `Limite de ${CARGO_PHOTO_ROW_LIMIT} fotos por item atingido.`
  return ''
}

// Ao escolher várias fotos entram as que cabem (na ordem escolhida) e o resto vira aviso:
// "2 fotos não entraram: limite de 5 por item."
export function admitCargoPhotoFiles(files, room) {
  const list = Array.from(files ?? [])
  const capacity = Math.max(0, Math.min(room.row, room.total))
  const accepted = list.slice(0, capacity)
  const rejected = list.length - accepted.length
  if (rejected === 0) return { accepted, rejected: 0, message: '' }
  const subject = rejected === 1 ? '1 foto não entrou' : `${rejected} fotos não entraram`
  const limit = room.row <= room.total
    ? `${CARGO_PHOTO_ROW_LIMIT} por item`
    : `${CARGO_PHOTO_CONFERENCE_LIMIT} por conferência`
  return { accepted, rejected, message: `${subject}: limite de ${limit}.` }
}

// Fotos que estão no estado da tela e não no que foi gravado por último (enviadas e ainda não salvas).
export function listUnsavedCargoPhotos(conference, saved) {
  const savedIds = new Set(allPhotos(saved).map((photo) => photo?.id))
  return allPhotos(conference).filter((photo) => photo && !savedIds.has(photo.id))
}
