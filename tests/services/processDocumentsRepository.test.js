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
  mockUpdateDoc,
  mockBatch,
  mockWriteBatch,
  mockServerTimestamp,
  mockRef,
  mockUploadBytes,
  mockDeleteObject,
  mockGetIdToken,
  mockAuth,
} = vi.hoisted(() => ({
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockSetDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockBatch: { update: vi.fn(), delete: vi.fn(), commit: vi.fn() },
  mockWriteBatch: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  mockRef: vi.fn(),
  mockUploadBytes: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockGetIdToken: vi.fn(),
  mockAuth: { currentUser: null },
}))

let firebaseConfigured = true

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseConfigured
  },
  firestore: {},
  storage: {},
  auth: mockAuth,
  firebaseConfig: { projectId: 'proj-test' },
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  writeBatch: (...args) => mockWriteBatch(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
}))

vi.mock('firebase/storage', () => ({
  ref: (...args) => mockRef(...args),
  uploadBytes: (...args) => mockUploadBytes(...args),
  deleteObject: (...args) => mockDeleteObject(...args),
}))

import {
  deleteProcessDocument,
  buildProcessDocumentDownloadEndpoint,
  downloadProcessDocumentBlob,
  listProcessDocuments,
  renameAdditionalDocument,
  saveBlobAsFile,
  setInvoicePackingListLink,
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
  mockGetIdToken.mockResolvedValue('TOKEN')
  mockAuth.currentUser = { getIdToken: mockGetIdToken }
  vi.unstubAllEnvs()
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

describe('listProcessDocuments - nome com acento', () => {
  it('description correta com â/Ã/Â nao e corrompida na leitura', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'o1',
          data: () => ({
            type: 'other',
            slotKey: 'other:o1',
            description: 'Contrato de câmbio',
            name: 'contrato.pdf',
          }),
        },
      ],
    })
    const result = await listProcessDocuments('p1')
    expect(result[0].description).toBe('Contrato de câmbio')
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

  it('invoice com alsoPackingList: true grava o campo; sem o flag nao grava', async () => {
    await uploadProcessDocument('p1', { type: 'invoice', file, alsoPackingList: true, actor })
    expect(mockSetDoc.mock.calls[0][1].alsoPackingList).toBe(true)
    await uploadProcessDocument('p1', { type: 'invoice', file, alsoPackingList: false, actor })
    expect('alsoPackingList' in mockSetDoc.mock.calls[1][1]).toBe(false)
    await uploadProcessDocument('p1', { type: 'invoice', file, actor })
    expect('alsoPackingList' in mockSetDoc.mock.calls[2][1]).toBe(false)
  })

  it('bl/packingList com alsoPackingList: true NAO gravam o campo', async () => {
    await uploadProcessDocument('p1', { type: 'bl', file, alsoPackingList: true, actor })
    await uploadProcessDocument('p1', { type: 'packingList', file, alsoPackingList: true, actor })
    expect('alsoPackingList' in mockSetDoc.mock.calls[0][1]).toBe(false)
    expect('alsoPackingList' in mockSetDoc.mock.calls[1][1]).toBe(false)
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

  it('com unlinkPreviousId: desfaz o vinculo da anterior e exclui no MESMO batch', async () => {
    mockWriteBatch.mockReturnValue(mockBatch)
    mockBatch.commit.mockResolvedValue(undefined)
    await deleteProcessDocument('p1', 'new', { unlinkPreviousId: 'old', actor: { uid: 'uid-1' } })
    expect(mockDeleteDoc).not.toHaveBeenCalled()
    expect(mockUpdateDoc).not.toHaveBeenCalled()
    expect(mockBatch.update).toHaveBeenCalledWith('DOC_REF', {
      alsoPackingList: false,
      alsoPackingListUpdatedAt: 'SERVER_TIMESTAMP',
      alsoPackingListUpdatedById: 'uid-1',
    })
    expect(mockBatch.delete).toHaveBeenCalledWith('DOC_REF')
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    expect(mockDoc).toHaveBeenCalledWith({}, 'processes', 'p1', 'documents', 'old')
    expect(mockDoc).toHaveBeenCalledWith({}, 'processes', 'p1', 'documents', 'new')
  })
})

describe('setInvoicePackingListLink', () => {
  it('chama updateDoc so com as 3 chaves do vinculo', async () => {
    await setInvoicePackingListLink('p1', 'd1', true, { uid: 'uid-1' })
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
    const [ref, payload] = mockUpdateDoc.mock.calls[0]
    expect(ref).toBe('DOC_REF')
    expect(payload).toEqual({
      alsoPackingList: true,
      alsoPackingListUpdatedAt: 'SERVER_TIMESTAMP',
      alsoPackingListUpdatedById: 'uid-1',
    })
    expect(mockDoc).toHaveBeenCalledWith({}, 'processes', 'p1', 'documents', 'd1')
  })

  it('included diferente de true grava false', async () => {
    await setInvoicePackingListLink('p1', 'd1', 'sim', { uid: 'uid-1' })
    expect(mockUpdateDoc.mock.calls[0][1].alsoPackingList).toBe(false)
  })

  it('nao configurado -> nao chama updateDoc', async () => {
    firebaseConfigured = false
    await setInvoicePackingListLink('p1', 'd1', false, { uid: 'uid-1' })
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })
})

describe('renameAdditionalDocument', () => {
  it('chama updateDoc so com description (aparada) e os 2 carimbos', async () => {
    await renameAdditionalDocument('p1', 'o1', '  Laudo  ', { uid: 'uid-1' })
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
    expect(mockUpdateDoc).toHaveBeenCalledWith('DOC_REF', {
      description: 'Laudo',
      descriptionUpdatedAt: 'SERVER_TIMESTAMP',
      descriptionUpdatedById: 'uid-1',
    })
    expect(mockDoc).toHaveBeenCalledWith({}, 'processes', 'p1', 'documents', 'o1')
  })

  it('nome correto com acento (câmbio, NÃO) e gravado intacto, sem U+FFFD', async () => {
    for (const nome of ['Contrato de câmbio', 'CONTRATO DE CÂMBIO', 'NÃO CONFORMIDADE']) {
      mockUpdateDoc.mockClear()
      await renameAdditionalDocument('p1', 'o1', `  ${nome}  `, { uid: 'uid-1' })
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'DOC_REF',
        expect.objectContaining({ description: nome })
      )
    }
  })

  it('nome vazio (so espacos) rejeita e nao chama updateDoc', async () => {
    await expect(renameAdditionalDocument('p1', 'o1', '   ', { uid: 'uid-1' })).rejects.toThrow(
      'Informe o nome do documento.'
    )
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('nao configurado -> nao chama updateDoc', async () => {
    firebaseConfigured = false
    await renameAdditionalDocument('p1', 'o1', 'Laudo', { uid: 'uid-1' })
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })
})

describe('buildProcessDocumentDownloadEndpoint', () => {
  it('producao: Cloud Function us-central1', () => {
    expect(buildProcessDocumentDownloadEndpoint()).toBe(
      'https://us-central1-proj-test.cloudfunctions.net/downloadProcessDocument'
    )
  })

  it('emulador: 127.0.0.1:5001', () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true')
    expect(buildProcessDocumentDownloadEndpoint()).toBe(
      'http://127.0.0.1:5001/proj-test/us-central1/downloadProcessDocument'
    )
  })
})

describe('downloadProcessDocumentBlob', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('envia Bearer token + query codificada e devolve o blob', async () => {
    const blob = new Blob(['PDF'])
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(blob) })

    const result = await downloadProcessDocumentBlob('p 1', 'd/1')

    expect(result).toBe(blob)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://us-central1-proj-test.cloudfunctions.net/downloadProcessDocument?processId=p%201&documentId=d%2F1'
    )
    expect(options.headers.Authorization).toBe('Bearer TOKEN')
  })

  it.each([
    [401, 'unauthenticated'],
    [403, 'permission-denied'],
    [404, 'storage/object-not-found'],
  ])('status %s -> code %s', async (status, code) => {
    fetchMock.mockResolvedValue({ ok: false, status })
    await expect(downloadProcessDocumentBlob('p1', 'd1')).rejects.toMatchObject({ code })
  })

  it('status 500 -> erro sem code mapeado', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const error = await downloadProcessDocumentBlob('p1', 'd1').catch((e) => e)
    expect(error.message).toBe('Não foi possível baixar o documento.')
    expect(error.code).toBeUndefined()
  })

  it('fetch rejeita -> unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(downloadProcessDocumentBlob('p1', 'd1')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('sem currentUser -> unauthenticated e nao chama fetch', async () => {
    mockAuth.currentUser = null
    await expect(downloadProcessDocumentBlob('p1', 'd1')).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('nao configurado -> lanca erro', async () => {
    firebaseConfigured = false
    await expect(downloadProcessDocumentBlob('p1', 'd1')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('saveBlobAsFile', () => {
  it('cria e revoga object URL e clica o anchor com download', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:abc')
    const revokeObjectURL = vi.fn()
    const anchor = { click: vi.fn(), style: {} }
    const body = { appendChild: vi.fn(), removeChild: vi.fn() }
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body })

    saveBlobAsFile(new Blob(['x']), 'bl.pdf')

    expect(createObjectURL).toHaveBeenCalled()
    expect(anchor.download).toBe('bl.pdf')
    expect(anchor.href).toBe('blob:abc')
    expect(body.appendChild).toHaveBeenCalledWith(anchor)
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(body.removeChild).toHaveBeenCalledWith(anchor)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:abc')

    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
