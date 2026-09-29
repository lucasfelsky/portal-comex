// L38: download autenticado dos documentos do processo.
//
// Function HTTP (v2 `onRequest`) que valida o ID token Firebase + claims
// (mesmo conjunto de `canReadProcessDocuments()` em storage.rules: admin OU
// logistica, status Ativo, e-mail @sqquimica.com), le o METADADO em
// `processes/{processId}/documents/{documentId}` e faz stream do arquivo
// com `Content-Disposition: attachment`. Usa o Admin SDK (ignora rules) - as
// storage.rules negam a leitura via SDK cliente, entao ninguem gera URL
// permanente (`getDownloadURL`) para estes arquivos.

import { pipeline } from 'node:stream/promises'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/logger'

const ALLOWED_ROLES = ['admin', 'logistica']
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export function canDownloadProcessDocuments(token) {
  if (!token || typeof token !== 'object') return false
  if (typeof token.role !== 'string' || !ALLOWED_ROLES.includes(token.role)) return false
  if (!/^\s*ativo\s*$/i.test(String(token.status ?? ''))) return false
  return String(token.email ?? '').toLowerCase().endsWith('@sqquimica.com')
}

export function resolveProcessDocumentStoragePath(processId, metadata) {
  const storagePath = String(metadata?.storagePath ?? '')
  if (!storagePath) return null
  if (!storagePath.startsWith(`processes/${processId}/documents/`)) return null
  const hasUnsafeSegment = storagePath.includes('..')
    || storagePath.includes('//')
    || storagePath.includes(String.fromCharCode(92))
    || storagePath.includes(String.fromCharCode(0))
  if (hasUnsafeSegment) return null
  return storagePath
}

export function buildContentDisposition(fileName) {
  const original = String(fileName ?? '')
  const fallback = original
    .replace(/[\r\n"]/g, '')
    .replace(/[^\w.\- ]/g, '_')
    .trim() || 'documento'
  const encoded = encodeURIComponent(original.replace(/[\r\n]/g, '') || 'documento')
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

function sendError(res, status, code) {
  res.status(status).json({ error: code })
}

export async function handleProcessDocumentDownload(req, res) {
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

  if (!canDownloadProcessDocuments(decoded)) {
    sendError(res, 403, 'permission-denied')
    return
  }

  const processId = req.query?.processId
  const documentId = req.query?.documentId
  if (
    typeof processId !== 'string' || !ID_PATTERN.test(processId)
    || typeof documentId !== 'string' || !ID_PATTERN.test(documentId)
  ) {
    sendError(res, 400, 'invalid-argument')
    return
  }

  let data
  try {
    const snapshot = await getFirestore().doc(`processes/${processId}/documents/${documentId}`).get()
    if (!snapshot.exists) {
      sendError(res, 404, 'not-found')
      return
    }
    data = snapshot.data() ?? {}
  } catch (error) {
    logger.error('Falha ao ler metadado do documento.', { processId, documentId, error })
    sendError(res, 500, 'internal')
    return
  }

  const storagePath = resolveProcessDocumentStoragePath(processId, data)
  if (!storagePath) {
    logger.warn('storagePath invalido no metadado do documento.', { processId, documentId })
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
    logger.error('Falha ao ler metadado do objeto.', { processId, documentId, error })
    sendError(res, 500, 'internal')
    return
  }
  objectMetadata = objectMetadata ?? {}

  res.status(200)
  res.setHeader('Content-Type', objectMetadata.contentType || data.mimeType || 'application/octet-stream')
  const size = Number(objectMetadata.size)
  if (Number.isFinite(size) && size >= 0) res.setHeader('Content-Length', String(size))
  res.setHeader('Content-Disposition', buildContentDisposition(data.name))
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  try {
    await pipeline(file.createReadStream(), res)
    logger.info('Download de documento do processo.', { processId, documentId, uid: decoded.uid })
  } catch (error) {
    logger.error('Falha no stream do documento.', { processId, documentId, error })
    if (!res.headersSent) sendError(res, 500, 'internal')
    else res.destroy(error)
  }
}

export const downloadProcessDocument = onRequest(
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
  handleProcessDocumentDownload
)
