// L38: `downloadProcessDocument` (Cloud Function HTTP) + helpers puros.

import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockAuthApi,
  mockBucket,
  mockFirestoreApi,
  mockStorageFile,
  mocks,
  getHandler,
} from '../setup-triggers.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-admin/storage', () => mocks.firebaseStorage())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { downloadProcessDocument } = await import('../../functions/index.js')
const {
  canDownloadProcessDocuments,
  buildContentDisposition,
  resolveProcessDocumentStoragePath,
} = await import('../../functions/src/process/documentDownload.js')

const handler = getHandler(downloadProcessDocument)

const ADMIN = { uid: 'u1', role: 'admin', status: 'Ativo', email: 'admin@sqquimica.com' }
const VALID_PATH = 'processes/p1/documents/bl/1-u1-bl.pdf'
const BACKSLASH = String.fromCharCode(92)

function createRes() {
  const chunks = []
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    },
  })
  res.statusCode = 200
  res.headers = {}
  res.body = () => Buffer.concat(chunks).toString('utf8')
  res.status = vi.fn((code) => {
    res.statusCode = code
    return res
  })
  res.setHeader = vi.fn((name, value) => {
    res.headers[name] = value
  })
  res.json = vi.fn((payload) => {
    res.jsonBody = payload
    res.end()
    return res
  })
  return res
}

function createReq({ method = 'GET', authorization = 'Bearer TOKEN', query = { processId: 'p1', documentId: 'd1' } } = {}) {
  return {
    method,
    query,
    headers: authorization ? { authorization } : {},
    get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  }
}

function mockDocument(data) {
  const get = vi.fn().mockResolvedValue({
    exists: data !== null,
    data: () => data ?? undefined,
  })
  mockFirestoreApi.doc.mockReturnValue({ get })
  return get
}

beforeEach(() => {
  mockAuthApi.verifyIdToken.mockResolvedValue(ADMIN)
  mockDocument({ name: 'bl.pdf', storagePath: VALID_PATH, mimeType: 'application/pdf' })
  mockStorageFile.getMetadata.mockResolvedValue([{ contentType: 'application/pdf', size: '3' }])
  mockStorageFile.createReadStream.mockImplementation(() => Readable.from([Buffer.from('PDF')]))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('downloadProcessDocument - opcoes', () => {
  it('roda em us-central1', () => {
    expect(downloadProcessDocument.__opts.region).toBe('us-central1')
  })
})

describe('downloadProcessDocument - autenticacao', () => {
  it('POST -> 405', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('sem Authorization -> 401 sem verificar token', async () => {
    const res = createRes()
    await handler(createReq({ authorization: '' }), res)
    expect(res.statusCode).toBe(401)
    expect(mockAuthApi.verifyIdToken).not.toHaveBeenCalled()
  })

  it('Authorization Basic -> 401 sem verificar token', async () => {
    const res = createRes()
    await handler(createReq({ authorization: 'Basic x' }), res)
    expect(res.statusCode).toBe(401)
    expect(mockAuthApi.verifyIdToken).not.toHaveBeenCalled()
  })

  it('verifyIdToken rejeita -> 401 (checkRevoked=true)', async () => {
    mockAuthApi.verifyIdToken.mockRejectedValue(new Error('expired'))
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(401)
    expect(mockAuthApi.verifyIdToken).toHaveBeenCalledWith('TOKEN', true)
  })
})

describe('downloadProcessDocument - autorizacao', () => {
  const denied = [
    ['user Ativo', { ...ADMIN, role: 'user' }],
    ['compras Ativo', { ...ADMIN, role: 'compras' }],
    ['viewer Ativo', { ...ADMIN, role: 'viewer' }],
    ['admin Pendente', { ...ADMIN, status: 'Pendente' }],
    ['admin Bloqueado', { ...ADMIN, status: 'Bloqueado' }],
    ['admin e-mail externo', { ...ADMIN, email: 'admin@gmail.com' }],
    ['sem claim role', { uid: 'u1', status: 'Ativo', email: 'a@sqquimica.com' }],
  ]

  it.each(denied)('%s -> 403 sem tocar o Firestore', async (_label, claims) => {
    mockAuthApi.verifyIdToken.mockResolvedValue(claims)
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(403)
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
  })
})

describe('downloadProcessDocument - sucesso', () => {
  it('admin Ativo -> 200 com stream e headers de download', async () => {
    const res = createRes()
    await handler(createReq(), res)
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.statusCode).toBe(200)
    expect(res.body()).toBe('PDF')
    expect(res.headers['Content-Disposition']).toContain('attachment')
    expect(res.headers['Content-Disposition']).toContain("filename*=UTF-8''")
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(res.headers['Content-Type']).toBe('application/pdf')
    expect(mockFirestoreApi.doc).toHaveBeenCalledWith('processes/p1/documents/d1')
    expect(mockBucket.file).toHaveBeenCalledWith(VALID_PATH)
  })

  it('logistica com status " ativo " -> 200', async () => {
    mockAuthApi.verifyIdToken.mockResolvedValue({ ...ADMIN, role: 'logistica', status: ' ativo ' })
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(200)
  })

  it.each([
    'processes/p1/documents/fispq/ITEM-1/1-uid-f.pdf',
    'processes/p1/documents/containerWash/CNT-1/1-uid-w.pdf',
  ])('documento com escopo %s -> 200', async (storagePath) => {
    mockDocument({ name: 'x.pdf', storagePath })
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(200)
    expect(mockBucket.file).toHaveBeenCalledWith(storagePath)
  })
})

describe('downloadProcessDocument - validacao de entrada', () => {
  it.each([
    [{ processId: '../users', documentId: 'd1' }],
    [{ processId: 'p1/x', documentId: 'd1' }],
    [{ processId: '', documentId: 'd1' }],
    [{ processId: 'p1', documentId: 'a/b' }],
    [{ processId: 'p1' }],
  ])('query %j -> 400 sem tocar o Firestore', async (query) => {
    const res = createRes()
    await handler(createReq({ query }), res)
    expect(res.statusCode).toBe(400)
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
  })

  it('metadado inexistente -> 404', async () => {
    mockDocument(null)
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(404)
  })

  it.each([
    'processes/OUTRO/documents/bl/x.pdf',
    'processes/p1/post-receipt/x.jpg',
    'processes/p1/documents/../../users/x',
    'users/x',
    '',
  ])('storagePath "%s" -> 400 sem chamar bucket.file', async (storagePath) => {
    mockDocument({ name: 'x.pdf', storagePath })
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(400)
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('objeto ausente no Storage -> 404', async () => {
    mockStorageFile.getMetadata.mockRejectedValue({ code: 404 })
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(404)
  })

  it('erro inesperado do Storage -> 500', async () => {
    mockStorageFile.getMetadata.mockRejectedValue(new Error('boom'))
    const res = createRes()
    await handler(createReq(), res)
    expect(res.statusCode).toBe(500)
  })
})

describe('helpers puros', () => {
  it('canDownloadProcessDocuments', () => {
    expect(canDownloadProcessDocuments(ADMIN)).toBe(true)
    expect(canDownloadProcessDocuments({ ...ADMIN, role: 'logistica' })).toBe(true)
    expect(canDownloadProcessDocuments({ ...ADMIN, role: 'user' })).toBe(false)
    expect(canDownloadProcessDocuments({ ...ADMIN, status: 'Reprovado' })).toBe(false)
    expect(canDownloadProcessDocuments({ ...ADMIN, email: undefined })).toBe(false)
    expect(canDownloadProcessDocuments(null)).toBe(false)
  })

  it('resolveProcessDocumentStoragePath', () => {
    expect(resolveProcessDocumentStoragePath('p1', { storagePath: VALID_PATH })).toBe(VALID_PATH)
    expect(resolveProcessDocumentStoragePath('p1', { storagePath: 'processes/p1/documents//x' })).toBeNull()
    expect(resolveProcessDocumentStoragePath('p1', { storagePath: `processes/p1/documents/a${BACKSLASH}b` })).toBeNull()
    expect(resolveProcessDocumentStoragePath('p1', {})).toBeNull()
  })

  it('buildContentDisposition sem aspas/CRLF no fallback e com filename* codificado', () => {
    const header = buildContentDisposition('Relatório "final"\r\n.pdf')
    const fallback = header.match(/filename="([^"]*)"/)[1]
    expect(fallback).not.toMatch(/["\r\n]/)
    expect(header).not.toMatch(/[\r\n]/)
    expect(header).toContain('%C3%B3')
    expect(buildContentDisposition('')).toContain('filename="documento"')
  })
})
