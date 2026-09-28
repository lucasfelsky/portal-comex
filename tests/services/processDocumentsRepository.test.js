// F18a: cobertura de processDocumentsRepository.js (upload/lista/download/
// exclusao de processes/{id}/documents). Mesmo padrao de mock de
// tests/services/processEventsRepository.test.js.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCollection,
  mockDoc,
  mockGetDocs,
  mockSetDoc,
  mockDeleteDoc,
  mockServerTimestamp,
  mockRef,
  mockUploadBytes,
  mockDeleteObject,
  mockGetDownloadURL,
} = vi.hoisted(() => ({
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockSetDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  mockRef: vi.fn(),
  mockUploadBytes: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockGetDownloadURL: vi.fn(),
}))

let firebaseConfigured = true

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseConfigured
  },
  firestore: {},
  storage: {},
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
}))

vi.mock('firebase/storage', () => ({
  ref: (...args) => mockRef(...args),
  uploadBytes: (...args) => mockUploadBytes(...args),
  deleteObject: (...args) => mockDeleteObject(...args),
  getDownloadURL: (...args) => mockGetDownloadURL(...args),
}))

import {
  deleteProcessDocument,
  getProcessDocumentDownloadUrl,
  listProcessDocuments,
  uploadProcessDocument,
} from '../../src/services/processDocumentsRepository'

beforeEach(() => {
  vi.clearAllMocks()
  firebaseConfigured = true
  mockCollection.mockReturnValue('COLLECTION_REF')
  mockDoc.mockImplementation((...args) => (args.length > 1 ? 'DOC_REF' : { id: 'new-doc-id' }))
  mockRef.mockReturnValue('STORAGE_REF')
  mockUploadBytes.mockResolvedValue(undefined)
  mockSetDoc.mockResolvedValue(undefined)
  mockDeleteDoc.mockResolvedValue(undefined)
  mockDeleteObject.mockResolvedValue(undefined)
  mockGetDownloadURL.mockResolvedValue('https://example.com/file')
})

describe('listProcessDocuments', () => {
  it('sem processId -> []', async () => {
    expect(await listProcessDocuments('')).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('nao configurado -> []', async () => {
    firebaseConfigured = false
    expect(await listProcessDocuments('p1')).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('normaliza documentos (Timestamp -> ISO, texto reparado)', async () => {
    const toDate = () => new Date('2026-09-20T10:00:00.000Z')
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'd1',
          data: () => ({
            type: 'bl',
            slotKey: 'bl',
            name: 'BL.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            storagePath: 'processes/p1/documents/bl/1-uid-BL.pdf',
            uploadedAt: { toDate },
            uploadedById: 'uid-1',
            uploadedByName: 'JoÃ£o',
            uploadedByRole: 'admin',
          }),
        },
      ],
    })
    const result = await listProcessDocuments('p1')
    expect(result[0]).toMatchObject({
      id: 'd1',
      type: 'bl',
      uploadedAt: '2026-09-20T10:00:00.000Z',
      uploadedByName: 'João',
    })
  })
})

describe('uploadProcessDocument', () => {
  const actor = { uid: 'uid-1', name: 'Admin', role: 'admin' }
  const file = { name: 'bl.pdf', size: 2048, type: 'application/pdf' }

  it('nao configurado -> lanca erro sem chamar uploadBytes', async () => {
    firebaseConfigured = false
    await expect(uploadProcessDocument('p1', { type: 'bl', file, actor })).rejects.toThrow()
    expect(mockUploadBytes).not.toHaveBeenCalled()
  })

  it('sobe o arquivo e grava o metadado (slotKey/storagePath/contentType)', async () => {
    const result = await uploadProcessDocument('p1', { type: 'bl', file, actor })

    expect(mockUploadBytes).toHaveBeenCalledWith('STORAGE_REF', file, { contentType: 'application/pdf' })
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [, payload] = mockSetDoc.mock.calls[0]
    expect(payload.type).toBe('bl')
    expect(payload.slotKey).toBe('bl')
    expect(payload.storagePath).toMatch(/^processes\/p1\/documents\/bl\/\d+-uid-1-bl\.pdf$/)
    expect(payload.uploadedById).toBe('uid-1')
    expect(payload.uploadedAt).toBe('SERVER_TIMESTAMP')
    expect(result.id).toBe('new-doc-id')
  })

  it('fispq inclui itemId no payload e no storagePath', async () => {
    await uploadProcessDocument('p1', { type: 'fispq', file, itemId: 'ITEM-1', actor })
    const [, payload] = mockSetDoc.mock.calls[0]
    expect(payload.itemId).toBe('ITEM-1')
    expect(payload.slotKey).toBe('fispq:ITEM-1')
  })

  it('other exige description no payload', async () => {
    await uploadProcessDocument('p1', { type: 'other', file, description: 'nota fiscal', actor })
    const [, payload] = mockSetDoc.mock.calls[0]
    expect(payload.description).toBe('nota fiscal')
  })

  it('CONSOLIDADO grava poNumber para invoice', async () => {
    await uploadProcessDocument('p1', { type: 'invoice', file, category: 'CONSOLIDADO', po: 'PO-1', actor })
    const [, payload] = mockSetDoc.mock.calls[0]
    expect(payload.poNumber).toBe('PO-1')
    expect(payload.slotKey).toBe('invoice:PO-1')
  })

  it('setDoc falha -> rollback deleteObject e relanca o erro', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(uploadProcessDocument('p1', { type: 'bl', file, actor })).rejects.toThrow('permission-denied')
    expect(mockDeleteObject).toHaveBeenCalledWith('STORAGE_REF')
  })

  it('mime fora da whitelist rejeita antes de subir', async () => {
    const badFile = { name: 'evil.exe', size: 10, type: 'application/octet-stream' }
    await expect(uploadProcessDocument('p1', { type: 'bl', file: badFile, actor })).rejects.toThrow()
    expect(mockUploadBytes).not.toHaveBeenCalled()
  })
})

describe('deleteProcessDocument', () => {
  it('chama deleteDoc', async () => {
    await deleteProcessDocument('p1', 'd1')
    expect(mockDeleteDoc).toHaveBeenCalled()
  })

  it('nao configurado -> nao chama deleteDoc', async () => {
    firebaseConfigured = false
    await deleteProcessDocument('p1', 'd1')
    expect(mockDeleteDoc).not.toHaveBeenCalled()
  })
})

describe('getProcessDocumentDownloadUrl', () => {
  it('resolve a URL', async () => {
    const url = await getProcessDocumentDownloadUrl('processes/p1/documents/bl/1-uid-bl.pdf')
    expect(url).toBe('https://example.com/file')
  })

  it('nao configurado -> lanca erro', async () => {
    firebaseConfigured = false
    await expect(getProcessDocumentDownloadUrl('x')).rejects.toThrow()
  })
})
