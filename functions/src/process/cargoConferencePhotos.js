// S11 (J1): fotos de avaria por item da Conferência do Relatório de Carga.
// - `downloadCargoConferencePhoto` (HTTP): serve a foto (`size=full`) ou a miniatura (`size=thumb`) pelo Admin SDK
//   (as storage.rules negam a leitura pelo SDK cliente: ninguém gera URL permanente, L38). Modelo:
//   `documentDownload.js`. Valida token + claims (admin/logística) e que a foto está listada em
//   `processes/{id}/cargoReport/conference.damageByRowId` e que o caminho pertence ao processo e à linha.
//   S10-J2: técnico e faturamento (ativos, @sqquimica.com) também baixam, mas só a foto que consta no espelho
//   `processes/{id}/cargoReport/damage` E ainda está em `conference.damageByRowId` (o espelho não guarda caminho:
//   o caminho sai sempre da conferência). Fora do espelho ou removida da conferência -> 404.
// - `syncCargoConferenceDamage` (trigger), dois trabalhos independentes (falha de um não impede o outro):
//   1. limpeza: apaga do Storage a foto que saiu do doc da conferência. Só age quando há `before` e `after`, só
//      quando o doc novo TEM `damageByRowId`, só em caminhos do próprio processo, e é idempotente (`ignoreNotFound`);
//   2. espelho (S10-J2): ao fechar, grava `cargoReport/damage` (`set` sem merge, sem caminho de arquivo) a partir da
//      conferência + `cargoReport/current`, para técnico/faturamento lerem avarias e fotos. Não grava na conferência
//      (sem laço: o espelho é outro doc e não dispara este trigger).
// Logs: ids do processo/foto e uid; nunca o caminho do arquivo, a observação nem o conteúdo.

import { pipeline } from 'node:stream/promises'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/logger'
import {
  CARGO_CONFERENCE_MAX_REMOVED_PATHS,
  CARGO_CONFERENCE_PHOTO_ID_PATTERN,
  buildCargoDamageMirror,
  canDownloadCargoConferencePhotos,
  canDownloadCargoConferencePhotosAsReader,
  findCargoConferencePhoto,
  isPhotoInCargoDamageMirror,
  listRemovedCargoConferencePhotoPaths,
  resolveCargoConferencePhotoFile,
  shouldWriteCargoDamageMirror,
  summarizeCargoConferenceDamage,
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

  const isOperator = canDownloadCargoConferencePhotos(decoded)
  if (!isOperator && !canDownloadCargoConferencePhotosAsReader(decoded)) {
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

  // S10-J2: técnico/faturamento só baixam foto do espelho; sem espelho ou foto fora dele -> 404.
  if (!isOperator) {
    try {
      const mirrorSnapshot = await getFirestore().doc(`processes/${processId}/cargoReport/damage`).get()
      if (!mirrorSnapshot.exists || !isPhotoInCargoDamageMirror(mirrorSnapshot.data() ?? {}, photoId)) {
        sendError(res, 404, 'not-found')
        return
      }
    } catch (error) {
      logger.error('Falha ao ler o espelho de avarias do Relatório de Carga.', { processId, photoId, error: error?.code })
      sendError(res, 500, 'internal')
      return
    }
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

// Espelho `cargoReport/damage`: lê o `current` (linhas e total de pallets), resume e grava (`set`, sem merge). Falha só
// vira log com o id do processo e o código do erro. `current` ausente: não grava (não apaga o espelho anterior).
export async function writeCargoDamageMirror(processId, after) {
  const firestore = getFirestore()
  const currentSnapshot = await firestore.doc(`processes/${processId}/cargoReport/current`).get()
  if (!currentSnapshot.exists) {
    logger.warn('Relatório de Carga sem o doc current: espelho de avarias não gravado.', { processId })
    return false
  }
  const summary = summarizeCargoConferenceDamage(after, currentSnapshot.data() ?? {})
  const mirror = { ...buildCargoDamageMirror(summary, after), updatedAt: FieldValue.serverTimestamp() }
  await firestore.doc(`processes/${processId}/cargoReport/damage`).set(mirror)
  return true
}

export const syncCargoConferenceDamage = onDocumentWritten(
  { document: 'processes/{processId}/cargoReport/conference' },
  async (event) => {
    const processId = event.params.processId
    const before = readSnapshotData(event.data?.before)
    const after = readSnapshotData(event.data?.after)
    if (!processId || !after) return

    // 1. Limpeza das fotos removidas (só com `before` e `after`, como antes da J2).
    if (before) {
      try {
        await deleteRemovedCargoConferencePhotos(processId, before, after)
      } catch (error) {
        logger.warn('Falha ao limpar fotos removidas da conferência.', { processId, error: error?.code })
      }
    }

    // 2. Espelho para técnico/faturamento (S10-J2): só no fechamento novo.
    if (shouldWriteCargoDamageMirror(before, after)) {
      try {
        await writeCargoDamageMirror(processId, after)
      } catch (error) {
        logger.warn('Falha ao gravar o espelho de avarias da conferência.', { processId, error: error?.code })
      }
    }
  }
)
