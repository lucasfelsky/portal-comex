import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage'
import { auth, firebaseConfig, isFirebaseConfigured, storage } from '../lib/firebase'
import { buildCargoPhotoPaths, createCargoPhotoId } from '../features/processes/cargoConferencePhotos'

// S11 (J1): fotos de avaria por item da Conferência do Relatório de Carga (Storage). Nenhuma URL permanente de
// download é gerada (L38); a leitura passa pela function HTTP `downloadCargoConferencePhoto` com o ID token.

function buildError(message, code) {
  const error = new Error(message)
  if (code) error.code = code
  return error
}

function requireStorage() {
  if (!isFirebaseConfigured || !storage) {
    throw buildError('Fotos disponíveis apenas com o Firebase configurado.', 'unavailable')
  }
}

function currentUid() {
  return String(auth?.currentUser?.uid ?? '').trim()
}

// Envia 1 arquivo JPEG (sem metadata além do contentType) e acompanha os bytes enviados.
function uploadOne(path, blob, { onBytes, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(buildError('Envio cancelado.', 'storage/canceled'))
      return
    }
    const task = uploadBytesResumable(ref(storage, path), blob, { contentType: 'image/jpeg' })
    const onAbort = () => task.cancel?.()
    signal?.addEventListener?.('abort', onAbort)
    const finish = (callback) => (value) => {
      signal?.removeEventListener?.('abort', onAbort)
      callback(value)
    }
    task.on(
      'state_changed',
      (snapshot) => onBytes?.(snapshot.bytesTransferred),
      finish(reject),
      finish(() => resolve(path))
    )
  })
}

// Envia a foto reduzida e depois a miniatura (um arquivo por vez). `prepared` = `{ full, thumb }` de
// `prepareCargoPhoto`. Falha em qualquer arquivo apaga o que já subiu (rollback) e propaga o erro do Storage (com o
// `code`). `onProgress(0..100)` soma os dois arquivos. Devolve o `Photo` que entra no estado do item.
export async function uploadCargoConferencePhoto(processId, rowId, prepared, { uid, onProgress, signal, now } = {}) {
  requireStorage()
  const ownerUid = String(uid ?? '').trim() || currentUid()
  if (!ownerUid) throw buildError('Sessão expirada.', 'unauthenticated')
  const full = prepared?.full
  const thumb = prepared?.thumb
  if (!full?.blob || !thumb?.blob) throw buildError('Foto não preparada para envio.', 'invalid-argument')

  const uploadedAt = Number.isFinite(now) ? Math.trunc(now) : Date.now()
  const photoId = createCargoPhotoId()
  const { path, thumbPath } = buildCargoPhotoPaths({ processId, rowId, uid: ownerUid, photoId, now: uploadedAt })
  const totalBytes = full.blob.size + thumb.blob.size
  const uploaded = []

  const report = (bytes) => {
    if (typeof onProgress !== 'function' || totalBytes <= 0) return
    onProgress(Math.min(100, Math.round((bytes / totalBytes) * 100)))
  }

  try {
    await uploadOne(path, full.blob, { onBytes: (bytes) => report(bytes), signal })
    uploaded.push(path)
    await uploadOne(thumbPath, thumb.blob, { onBytes: (bytes) => report(full.blob.size + bytes), signal })
    uploaded.push(thumbPath)
  } catch (error) {
    // O arquivo que falhou no meio do envio pode ter ficado parcial: tenta apagar os 2 caminhos (ignora o que não existe).
    await Promise.allSettled([path, thumbPath].map((target) => deleteObject(ref(storage, target))))
    throw error
  }
  report(totalBytes)

  return {
    id: photoId,
    path,
    thumbPath,
    width: full.width,
    height: full.height,
    size: full.blob.size,
    uploadedAt,
    byId: ownerUid,
  }
}

// Apaga do Storage os arquivos de fotos ENVIADAS PELO PRÓPRIO USUÁRIO (`byId`) e ainda não salvas ("Descartar
// alterações"); melhor esforço (as storage.rules só deixam apagar o próprio envio). Foto de outra pessoa nunca é tocada
// aqui: a remoção de foto salva é do trigger `syncCargoConferenceDamage`.
export async function deleteOwnCargoConferencePhotoFiles(processId, photos, { uid } = {}) {
  if (!isFirebaseConfigured || !storage || !processId) return 0
  const ownerUid = String(uid ?? '').trim() || currentUid()
  if (!ownerUid) return 0
  const prefix = `processes/${processId}/cargo-conference/`
  const paths = (Array.isArray(photos) ? photos : [])
    .filter((photo) => photo && photo.byId === ownerUid)
    .flatMap((photo) => [photo.path, photo.thumbPath])
    .filter((path) => typeof path === 'string' && path.startsWith(prefix) && !path.includes('..'))
  await Promise.allSettled(paths.map((path) => deleteObject(ref(storage, path))))
  return paths.length
}

export function buildCargoPhotoDownloadEndpoint() {
  const projectId = firebaseConfig?.projectId
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    return `http://127.0.0.1:5001/${projectId}/us-central1/downloadCargoConferencePhoto`
  }
  return `https://us-central1-${projectId}.cloudfunctions.net/downloadCargoConferencePhoto`
}

const DOWNLOAD_STATUS_CODES = {
  401: 'unauthenticated',
  403: 'permission-denied',
  404: 'storage/object-not-found',
}

// Baixa a foto (`size: 'full'`) ou a miniatura (`'thumb'`) como blob. Mesmos códigos de erro de
// `downloadProcessDocumentBlob`.
export async function downloadCargoConferencePhotoBlob(processId, photoId, size = 'full') {
  if (!isFirebaseConfigured) {
    throw buildError('Fotos disponíveis apenas com o Firebase configurado.')
  }
  if (size !== 'thumb' && size !== 'full') {
    throw buildError('Tamanho de foto inválido.', 'invalid-argument')
  }
  if (!auth?.currentUser) {
    throw buildError('Sessão expirada.', 'unauthenticated')
  }

  const token = await auth.currentUser.getIdToken()
  const query = `processId=${encodeURIComponent(processId)}&photoId=${encodeURIComponent(photoId)}&size=${size}`
  let response
  try {
    response = await fetch(`${buildCargoPhotoDownloadEndpoint()}?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw buildError('Falha de rede ao baixar a foto.', 'unavailable')
  }

  if (!response.ok) {
    throw buildError('Não foi possível baixar a foto.', DOWNLOAD_STATUS_CODES[response.status])
  }
  return response.blob()
}
