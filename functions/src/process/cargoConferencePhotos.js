// S11 (J1): fotos de avaria por item da Conferência do Relatório de Carga.
// - `downloadCargoConferencePhoto` (HTTP): serve a foto (`size=full`) ou a miniatura (`size=thumb`) pelo Admin SDK
//   (as storage.rules negam a leitura pelo SDK cliente: ninguém gera URL permanente, L38). Modelo:
//   `documentDownload.js`. Valida token + claims (admin/logística) e que a foto está listada em
//   `processes/{id}/cargoReport/conference.damageByRowId` e que o caminho pertence ao processo e à linha.
// - `syncCargoConferenceDamage` (trigger): apaga do Storage a foto que saiu do doc da conferência. Só age quando o doc
//   novo TEM `damageByRowId`, só em caminhos do próprio processo, não grava no Firestore (sem laço) e é idempotente
//   (`ignoreNotFound`). Falha só vira log.
// Logs: ids do processo/foto e uid; nunca o caminho do arquivo nem o conteúdo.

import { pipeline } from 'node:stream/promises'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/logger'
import {
  CARGO_CONFERENCE_MAX_REMOVED_PATHS,
  CARGO_CONFERENCE_PHOTO_ID_PATTERN,
  canDownloadCargoConferencePhotos,
  findCargoConferencePhoto,
  listRemovedCargoConferencePhotoPaths,
  resolveCargoConferencePhotoFile,
} from './cargoConferenceDamage.js'

const PROCESS_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const PHOTO_SIZES = ['thumb', 'full']

function sendError(res, status, code) {
  res.status(status).json({ error: code })
}

export async function handleCargoConferencePhotoDownload(req, res) {
  if (req.method !== 'GET') {
    sendError(res, 405, 'method-not-allowed')
    return
  }

  const authorization = String(req.get?.('Authorization') ?? req.headers?.authorization ?? '')
  if (!authorization.startsWith('Bearer ') || !authorization.slice(7).trim()) {
    sendError(res, 401, 'unauthenticated')
    return
  }

  let decoded
  try {
    decoded = await getAuth().verifyIdToken(authorization.slice(7).trim(), true)
  } catch {
    sendError(res, 401, 'unauthenticated')
    return
  }

  if (!canDownloadCargoConferencePhotos(decoded)) {
    sendError(res, 403, 'permission-denied')
    return
  }

  const processId = req.query?.processId
  const photoId = req.query?.photoId
  const size = req.query?.size === undefined ? 'full' : req.query.size
  if (
    typeof processId !== 'string' || !PROCESS_ID_PATTERN.test(processId)
    || typeof photoId !== 'string' || !CARGO_CONFERENCE_PHOTO_ID_PATTERN.test(photoId)
    || typeof size !== 'string' || !PHOTO_SIZES.includes(size)
  ) {
    sendError(res, 400, 'invalid-argument')
    return
  }

  let data
  try {
    const snapshot = await getFirestore().doc(`processes/${processId}/cargoReport/conference`).get()
    if (!snapshot.exists) {
      sendError(res, 404, 'not-found')
      return
    }
    data = snapshot.data() ?? {}
  } catch (error) {
    logger.error('Falha ao ler a conferência do Relatório de Carga.', { processId, photoId, error: error?.code })
    sendError(res, 500, 'internal')
    return
  }

  // 404 (e não 403) para não revelar se a foto existe em outro processo.
  const found = findCargoConferencePhoto(data, photoId)
  if (!found) {
    sendError(res, 404, 'not-found')
    return
  }

  const storagePath = resolveCargoConferencePhotoFile(processId, found, size)
  if (!storagePath) {
    logger.warn('Caminho de foto da conferência fora do processo ou da linha.', { processId, photoId })
    sendError(res, 400, 'invalid-argument')
    return
  }

  const file = getStorage().bucket().file(storagePath)
  let objectMetadata
  try {
    const result = await file.getMetadata()
    objectMetadata = Array.isArray(result) ? result[0] : result
  } catch (error) {
    if (error?.code === 404) {
      sendError(res, 404, 'not-found')
      return
    }
    logger.error('Falha ao ler metadado da foto da conferência.', { processId, photoId, error: error?.code })
    sendError(res, 500, 'internal')
    return
  }
  objectMetadata = objectMetadata ?? {}

  res.status(200)
  // O app sempre grava JPEG (storage.rules exigem `image/jpeg`): o tipo não vem do objeto.
  res.setHeader('Content-Type', 'image/jpeg')
  const length = Number(objectMetadata.size)
  if (Number.isFinite(length) && length >= 0) res.setHeader('Content-Length', String(length))
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  try {
    await pipeline(file.createReadStream(), res)
    logger.info('Download de foto da conferência.', { processId, photoId, size, uid: decoded.uid })
  } catch (error) {
    logger.error('Falha no stream da foto da conferência.', { processId, photoId, error: error?.code })
    if (!res.headersSent) sendError(res, 500, 'internal')
    else res.destroy(error)
  }
}

export const downloadCargoConferencePhoto = onRequest(
  {
    region: 'us-central1',
    cors: [
      /^https:\/\/(www\.)?portal-comex\.com$/,
      'https://sq-comex-updates-3d22f.web.app',
      'https://sq-comex-updates-3d22f.firebaseapp.com',
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
    ],
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  handleCargoConferencePhotoDownload
)

function readSnapshotData(snapshot) {
  if (!snapshot || snapshot.exists === false) return null
  return snapshot.data?.() ?? null
}

// Apaga cada arquivo removido (melhor esforço: um que falha não impede os outros). Devolve quantos saíram.
export async function deleteRemovedCargoConferencePhotos(processId, before, after) {
  const paths = listRemovedCargoConferencePhotoPaths(before, after, processId)
  if (paths.length === 0) return 0
  if (paths.length >= CARGO_CONFERENCE_MAX_REMOVED_PATHS) {
    logger.warn('Limite de fotos removidas por gravação atingido; o restante fica até o processo ser apagado.', {
      processId,
      limit: CARGO_CONFERENCE_MAX_REMOVED_PATHS,
    })
  }

  const bucket = getStorage().bucket()
  const results = await Promise.allSettled(paths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) {
    logger.warn('Falha ao apagar foto removida da conferência.', {
      processId,
      failed: failed.length,
      error: failed[0].reason?.code,
    })
  }
  return results.length - failed.length
}

export const syncCargoConferenceDamage = onDocumentWritten(
  { document: 'processes/{processId}/cargoReport/conference' },
  async (event) => {
    const processId = event.params.processId
    const before = readSnapshotData(event.data?.before)
    const after = readSnapshotData(event.data?.after)
    if (!processId || !before || !after) return

    try {
      await deleteRemovedCargoConferencePhotos(processId, before, after)
    } catch (error) {
      logger.warn('Falha ao limpar fotos removidas da conferência.', { processId, error: error?.code })
    }
  }
)
