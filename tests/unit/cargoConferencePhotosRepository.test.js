// S11 (J1): envio, limpeza e download das fotos de avaria (firebase/storage e fetch mockados; nada de rede).
//
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRef, mockUploadBytesResumable, mockDeleteObject, mockGetIdToken, mockAuth } = vi.hoisted(() => ({
  mockRef: vi.fn((_storage, path) => ({ fullPath: path })),
  mockUploadBytesResumable: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockGetIdToken: vi.fn(),
  mockAuth: { currentUser: null },
}))

let firebaseConfigured = true
let storageValue = {}

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseConfigured
  },
  get storage() {
    return storageValue
  },
  auth: mockAuth,
  firebaseConfig: { projectId: 'proj-test' },
}))

vi.mock('firebase/storage', () => ({
  ref: (...args) => mockRef(...args),
  uploadBytesResumable: (...args) => mockUploadBytesResumable(...args),
  deleteObject: (...args) => mockDeleteObject(...args),
}))

const {
  buildCargoPhotoDownloadEndpoint,
  deleteOwnCargoConferencePhotoFiles,
  downloadCargoConferencePhotoBlob,
  uploadCargoConferencePhoto,
} = await import('../../src/services/cargoConferencePhotosRepository.js')

const prepared = {
  full: { blob: { size: 300 }, width: 1600, height: 1200 },
  thumb: { blob: { size: 100 }, width: 400, height: 300 },
}

// Task falsa do Storage: `plan[path]` decide o que acontece ao enviar cada caminho.
function installUploads(plan = {}) {
  const uploaded = []
  mockUploadBytesResumable.mockImplementation((reference, blob, metadata) => {
    const path = reference.fullPath
    const behavior = plan[path.endsWith('-t.jpg') ? 'thumb' : 'full'] ?? 'ok'
    const handlers = {}
    const task = {
      cancel: vi.fn(() => handlers.error?.(Object.assign(new Error('canceled'), { code: 'storage/canceled' }))),
      on: (_event, onProgress, onError, onComplete) => {
        Object.assign(handlers, { error: onError })
        queueMicrotask(() => {
          if (behavior === 'ok') {
            onProgress({ bytesTransferred: Math.floor(blob.size / 2) })
            onProgress({ bytesTransferred: blob.size })
            uploaded.push({ path, blob, metadata })
            onComplete()
          } else if (behavior === 'hang') {
            onProgress({ bytesTransferred: 1 })
          } else {
            onProgress({ bytesTransferred: 1 })
            onError(Object.assign(new Error('rede'), { code: behavior }))
          }
        })
      },
    }
    return task
  })
  return uploaded
}

beforeEach(() => {
  vi.clearAllMocks()
  firebaseConfigured = true
  storageValue = {}
  mockAuth.currentUser = { uid: 'log-1', getIdToken: mockGetIdToken }
  mockGetIdToken.mockResolvedValue('TOKEN')
  mockDeleteObject.mockResolvedValue(undefined)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('uploadCargoConferencePhoto', () => {
  it('envia a foto e a miniatura como image/jpeg, sem metadata, com o uid no nome, e devolve o Photo', async () => {
    const uploaded = installUploads()
    const photo = await uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'log-1', now: 1700000000000 })

    expect(uploaded).toHaveLength(2)
    expect(uploaded[0].path).toBe(photo.path)
    expect(uploaded[1].path).toBe(photo.thumbPath)
    for (const item of uploaded) {
      expect(item.metadata).toEqual({ contentType: 'image/jpeg' })
      expect(item.path).toMatch(/^processes\/p1\/cargo-conference\/r-1\/1700000000000-log-1-[A-Za-z0-9_-]+(-t)?\.jpg$/)
    }
    expect(photo).toEqual({
      id: expect.stringMatching(/^[A-Za-z0-9_-]{1,40}$/),
      path: expect.any(String),
      thumbPath: expect.any(String),
      width: 1600,
      height: 1200,
      size: 300,
      uploadedAt: 1700000000000,
      byId: 'log-1',
    })
    expect(photo.path.endsWith(`${photo.id}.jpg`)).toBe(true)
    expect(photo.thumbPath.endsWith(`${photo.id}-t.jpg`)).toBe(true)
  })

  it('sem uid nas opções usa o usuário logado', async () => {
    installUploads()
    const photo = await uploadCargoConferencePhoto('p1', 'r-1', prepared)
    expect(photo.byId).toBe('log-1')
    expect(photo.path).toContain('-log-1-')
  })

  it('relata progresso de 0 a 100 somando os 2 arquivos, em ordem crescente', async () => {
    installUploads()
    const values = []
    await uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'log-1', onProgress: (value) => values.push(value) })
    expect(values.at(-1)).toBe(100)
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true)
    expect(values.every((value) => value >= 0 && value <= 100)).toBe(true)
  })

  it('falha de rede no 2º arquivo apaga o 1º (rollback) e propaga o erro com o código', async () => {
    installUploads({ thumb: 'storage/retry-limit-exceeded' })
    await expect(uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'log-1' })).rejects.toMatchObject({
      code: 'storage/retry-limit-exceeded',
    })
    const deleted = mockDeleteObject.mock.calls.map(([reference]) => reference.fullPath)
    expect(deleted).toHaveLength(2)
    expect(deleted.some((path) => path.endsWith('.jpg') && !path.endsWith('-t.jpg'))).toBe(true)
    expect(deleted.some((path) => path.endsWith('-t.jpg'))).toBe(true)
  })

  it('falha no 1º arquivo não envia a miniatura e limpa o que for preciso', async () => {
    installUploads({ full: 'storage/unauthorized' })
    await expect(uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'log-1' })).rejects.toMatchObject({
      code: 'storage/unauthorized',
    })
    expect(mockUploadBytesResumable).toHaveBeenCalledTimes(1)
    expect(mockDeleteObject).toHaveBeenCalled()
  })

  it('o rollback é melhor esforço: falha ao apagar não esconde o erro do envio', async () => {
    installUploads({ thumb: 'storage/unknown' })
    mockDeleteObject.mockRejectedValue(new Error('sem rede'))
    await expect(uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'log-1' })).rejects.toMatchObject({
      code: 'storage/unknown',
    })
  })

  it('cancelar pelo AbortSignal interrompe o envio e faz o rollback', async () => {
    installUploads({ full: 'hang' })
    const controller = new AbortController()
    const pending = uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'log-1', signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'storage/canceled' })
    expect(mockDeleteObject).toHaveBeenCalled()
  })

  it('sinal já cancelado nem começa o envio do arquivo', async () => {
    installUploads()
    const controller = new AbortController()
    controller.abort()
    await expect(
      uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'log-1', signal: controller.signal })
    ).rejects.toMatchObject({ code: 'storage/canceled' })
    expect(mockUploadBytesResumable).not.toHaveBeenCalled()
  })

  it('sem Firebase, sem sessão ou sem foto preparada: erro antes de enviar', async () => {
    firebaseConfigured = false
    await expect(uploadCargoConferencePhoto('p1', 'r-1', prepared, { uid: 'u' })).rejects.toThrow()
    firebaseConfigured = true
    mockAuth.currentUser = null
    await expect(uploadCargoConferencePhoto('p1', 'r-1', prepared)).rejects.toMatchObject({ code: 'unauthenticated' })
    await expect(uploadCargoConferencePhoto('p1', 'r-1', {}, { uid: 'u' })).rejects.toMatchObject({
      code: 'invalid-argument',
    })
    expect(mockUploadBytesResumable).not.toHaveBeenCalled()
  })

  it('nunca gera URL permanente: o módulo não importa getDownloadURL', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/services/cargoConferencePhotosRepository.js', import.meta.url), 'utf8')
    )
    expect(source).not.toMatch(/getDownloadURL/)
  })
})

describe('deleteOwnCargoConferencePhotoFiles', () => {
  const own = {
    byId: 'log-1',
    path: 'processes/p1/cargo-conference/r-1/1-log-1-a.jpg',
    thumbPath: 'processes/p1/cargo-conference/r-1/1-log-1-a-t.jpg',
  }
  const other = {
    byId: 'admin-1',
    path: 'processes/p1/cargo-conference/r-1/1-admin-1-b.jpg',
    thumbPath: 'processes/p1/cargo-conference/r-1/1-admin-1-b-t.jpg',
  }

  it('apaga foto e miniatura só das fotos do próprio uid', async () => {
    const count = await deleteOwnCargoConferencePhotoFiles('p1', [own, other])
    expect(count).toBe(2)
    expect(mockDeleteObject.mock.calls.map(([reference]) => reference.fullPath)).toEqual([own.path, own.thumbPath])
  })

  it('uid nas opções vale mais que o usuário logado', async () => {
    await deleteOwnCargoConferencePhotoFiles('p1', [own, other], { uid: 'admin-1' })
    expect(mockDeleteObject.mock.calls.map(([reference]) => reference.fullPath)).toEqual([other.path, other.thumbPath])
  })

  it('ignora caminho fora da pasta da conferência DO PROCESSO e entrada inválida', async () => {
    const evil = { byId: 'log-1', path: 'processes/p1/documents/bl/1-log-1-x.pdf', thumbPath: 'users/x' }
    const otherFolder = {
      byId: 'log-1',
      path: 'processes/p1/documents/cargo-conference/1-log-1-x.jpg',
      thumbPath: 'processes/OUTRO/cargo-conference/r-1/1-log-1-x-t.jpg',
    }
    const traversal = {
      byId: 'log-1',
      path: 'processes/p1/cargo-conference/../documents/bl/1-log-1-x.pdf',
      thumbPath: 'processes/p1/cargo-conference/r-1/1-log-1-ok-t.jpg',
    }
    await deleteOwnCargoConferencePhotoFiles('p1', [evil, otherFolder, null, { byId: 'log-1' }], { uid: 'log-1' })
    await deleteOwnCargoConferencePhotoFiles('p1', 'x')
    await deleteOwnCargoConferencePhotoFiles('', [own])
    expect(mockDeleteObject).not.toHaveBeenCalled()
    await deleteOwnCargoConferencePhotoFiles('p1', [traversal], { uid: 'log-1' })
    expect(mockDeleteObject.mock.calls.map(([reference]) => reference.fullPath)).toEqual([traversal.thumbPath])
  })

  it('melhor esforço: falha ao apagar um arquivo não lança nem impede os outros', async () => {
    mockDeleteObject.mockRejectedValueOnce(new Error('x'))
    await expect(deleteOwnCargoConferencePhotoFiles('p1', [own])).resolves.toBe(2)
    expect(mockDeleteObject).toHaveBeenCalledTimes(2)
  })

  it('sem Firebase ou sem sessão: não faz nada', async () => {
    firebaseConfigured = false
    expect(await deleteOwnCargoConferencePhotoFiles('p1', [own], { uid: 'log-1' })).toBe(0)
    firebaseConfigured = true
    mockAuth.currentUser = null
    expect(await deleteOwnCargoConferencePhotoFiles('p1', [own])).toBe(0)
    expect(mockDeleteObject).not.toHaveBeenCalled()
  })
})

describe('buildCargoPhotoDownloadEndpoint', () => {
  it('produção: Cloud Functions us-central1', () => {
    expect(buildCargoPhotoDownloadEndpoint()).toBe(
      'https://us-central1-proj-test.cloudfunctions.net/downloadCargoConferencePhoto'
    )
  })

  it('emulador local', () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true')
    expect(buildCargoPhotoDownloadEndpoint()).toBe(
      'http://127.0.0.1:5001/proj-test/us-central1/downloadCargoConferencePhoto'
    )
  })
})

describe('downloadCargoConferencePhotoBlob', () => {
  const okResponse = (blob = { size: 9 }) => ({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(blob) })

  it('chama a function com o ID token e devolve o blob', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('BLOB'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(downloadCargoConferencePhotoBlob('p 1', 'ph-1', 'thumb')).resolves.toBe('BLOB')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://us-central1-proj-test.cloudfunctions.net/downloadCargoConferencePhoto?processId=p%201&photoId=ph-1&size=thumb'
    )
    expect(init.headers.Authorization).toBe('Bearer TOKEN')
  })

  it('tamanho padrão = full', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    await downloadCargoConferencePhotoBlob('p1', 'ph-1')
    expect(fetchMock.mock.calls[0][0]).toContain('size=full')
  })

  it.each([
    [401, 'unauthenticated'],
    [403, 'permission-denied'],
    [404, 'storage/object-not-found'],
    [500, undefined],
  ])('HTTP %s -> código %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }))
    const error = await downloadCargoConferencePhotoBlob('p1', 'ph-1', 'full').catch((caught) => caught)
    expect(error.code).toBe(code)
  })

  it('falha de rede -> unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(downloadCargoConferencePhotoBlob('p1', 'ph-1', 'thumb')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('sem sessão -> unauthenticated; tamanho inválido -> invalid-argument; sem Firebase -> erro', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(downloadCargoConferencePhotoBlob('p1', 'ph-1', 'huge')).rejects.toMatchObject({
      code: 'invalid-argument',
    })
    mockAuth.currentUser = null
    await expect(downloadCargoConferencePhotoBlob('p1', 'ph-1', 'thumb')).rejects.toMatchObject({
      code: 'unauthenticated',
    })
    firebaseConfigured = false
    await expect(downloadCargoConferencePhotoBlob('p1', 'ph-1', 'thumb')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
