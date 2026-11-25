// S11 (J1): lógica PURA das fotos de avaria da Conferência do Relatório de Carga (sem firebase-admin nem
// firebase-functions: testada em `tests/unit` sem mocks).
//
// Dados: `processes/{id}/cargoReport/conference.damageByRowId` = `{ [rowId]: { flagged, note, photos: Photo[] } }`,
// `Photo = { id, path, thumbPath, width, height, size, uploadedAt, byId }` (shape fixado em
// `src/features/processes/cargoConferenceIssues.js`). Arquivos em
// `processes/{processId}/cargo-conference/{rowId}/{ts}-{uid}-{photoId}[-t].jpg` (rowId saneado em `[\w-]`).
// O Storage não lê o Firestore: o vínculo foto <-> processo/linha é conferido aqui, a partir do doc da conferência.

export const CARGO_CONFERENCE_PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/
// Teto de caminhos apagados por gravação (5 fotos x 2 arquivos x 200 linhas é o máximo teórico das rules; o cliente
// limita a 30 fotos). Acima disso o resto fica órfão (some com o processo) e o trigger registra o aviso.
export const CARGO_CONFERENCE_MAX_REMOVED_PATHS = 200

const ALLOWED_DOWNLOAD_ROLES = ['admin', 'logistica']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Mesmo saneamento do cliente (`buildCargoPhotoPaths`): só `[\w-]`; o resto vira "-".
export function sanitizeCargoPhotoPathSegment(value, fallback = 'item') {
  const text = String(value ?? '').trim().replace(/[^\w-]+/g, '-')
  return text || fallback
}

export function cargoConferencePhotoPrefix(processId) {
  return `processes/${processId}/cargo-conference/`
}

// Perfis que baixam a foto na J1: admin e logística ativos com e-mail corporativo (técnico/faturamento entram na J2,
// pelo espelho `cargoReport/damage`).
export function canDownloadCargoConferencePhotos(token) {
  if (!isPlainObject(token)) return false
  if (typeof token.role !== 'string' || !ALLOWED_DOWNLOAD_ROLES.includes(token.role)) return false
  if (!/^\s*ativo\s*$/i.test(String(token.status ?? ''))) return false
  return String(token.email ?? '').toLowerCase().endsWith('@sqquimica.com')
}

// Caminho do arquivo dentro do processo: `processes/{id}/cargo-conference/{rowId}/{arquivo}`, sem `..`, `//`, `\` ou
// NUL (mesmo teste de `resolveProcessDocumentStoragePath`). Com `rowId`, o segmento da linha tem de ser o da linha
// (saneado) dona da foto. Inválido -> null.
export function resolveCargoConferencePhotoPath(processId, path, rowId) {
  const storagePath = typeof path === 'string' ? path : ''
  if (!processId || !storagePath) return null
  const prefix = cargoConferencePhotoPrefix(processId)
  if (!storagePath.startsWith(prefix)) return null
  const hasUnsafeSegment = storagePath.includes('..')
    || storagePath.includes('//')
    || storagePath.includes(String.fromCharCode(92))
    || storagePath.includes(String.fromCharCode(0))
  if (hasUnsafeSegment) return null
  const segments = storagePath.slice(prefix.length).split('/')
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null
  if (rowId !== undefined && segments[0] !== sanitizeCargoPhotoPathSegment(rowId)) return null
  return storagePath
}

function listRowPhotos(conferenceData) {
  const map = conferenceData?.damageByRowId
  if (!isPlainObject(map)) return []
  const result = []
  for (const [rowId, entry] of Object.entries(map)) {
    if (!isPlainObject(entry) || !Array.isArray(entry.photos)) continue
    for (const photo of entry.photos) {
      if (isPlainObject(photo)) result.push({ rowId, photo })
    }
  }
  return result
}

// Procura a foto pelo id em toda a conferência. Não achou (ou id inválido) -> null.
export function findCargoConferencePhoto(conferenceData, photoId) {
  if (typeof photoId !== 'string' || !CARGO_CONFERENCE_PHOTO_ID_PATTERN.test(photoId)) return null
  const found = listRowPhotos(conferenceData).find(({ photo }) => photo.id === photoId)
  return found ?? null
}

// Caminho do arquivo a servir (`full` = foto reduzida; `thumb` = miniatura) já validado contra o processo e a linha.
export function resolveCargoConferencePhotoFile(processId, found, size) {
  if (!found) return null
  const raw = size === 'thumb' ? found.photo.thumbPath : found.photo.path
  return resolveCargoConferencePhotoPath(processId, raw, found.rowId)
}

function collectPaths(conferenceData, { processId } = {}) {
  const all = new Set()
  const owned = new Set()
  for (const { rowId, photo } of listRowPhotos(conferenceData)) {
    for (const raw of [photo.path, photo.thumbPath]) {
      if (typeof raw !== 'string' || !raw) continue
      all.add(raw)
      if (processId && resolveCargoConferencePhotoPath(processId, raw, rowId)) owned.add(raw)
    }
  }
  return { all, owned }
}

// Arquivos a apagar do Storage: estavam no doc "antes" e não estão no "depois" (foto removida). Travas:
// - "depois" sem a chave `damageByRowId` (ou doc apagado) NUNCA apaga nada (uma gravação sem a chave não é remoção);
// - só caminhos do próprio processo/linha (metadado adulterado não aponta para fora);
// - caminho ainda referenciado no "depois" (foto movida de linha) não sai.
export function listRemovedCargoConferencePhotoPaths(before, after, processId) {
  if (!processId || !isPlainObject(before) || !isPlainObject(after)) return []
  if (!('damageByRowId' in after) || !isPlainObject(after.damageByRowId)) return []
  const kept = collectPaths(after).all
  const removed = [...collectPaths(before, { processId }).owned].filter((path) => !kept.has(path))
  return removed.slice(0, CARGO_CONFERENCE_MAX_REMOVED_PATHS)
}
