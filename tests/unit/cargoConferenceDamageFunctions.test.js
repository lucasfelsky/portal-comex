// S11 (J1): fotos de avaria da Conferência do Relatório de Carga no servidor: módulo puro
// (`functions/src/process/cargoConferenceDamage.js`), download HTTP e trigger de limpeza
// (`functions/src/process/cargoConferencePhotos.js`) com o Admin SDK mockado (nada de rede).
//
// @vitest-environment node

import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHandler,
  mockAuthApi,
  mockBucket,
  mockFirestoreApi,
  mockLogger,
  mockStorageFile,
  mocks,
} from '../setup-triggers.js'

vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-admin/storage', () => mocks.firebaseStorage())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())

const damage = await import('../../functions/src/process/cargoConferenceDamage.js')
const { downloadCargoConferencePhoto, syncCargoConferenceDamage } = await import(
  '../../functions/src/process/cargoConferencePhotos.js'
)
const { buildCargoPhotoPaths } = await import('../../src/features/processes/cargoConferencePhotos.js')

const downloadHandler = getHandler(downloadCargoConferencePhoto)
const syncHandler = getHandler(syncCargoConferenceDamage)

const BACKSLASH = String.fromCharCode(92)
const LOGISTICA = { uid: 'log-1', role: 'logistica', status: 'Ativo', email: 'log@sqquimica.com' }

function photoOf(id, rowId = 'r-1', processId = 'p1') {
  const { path, thumbPath } = buildCargoPhotoPaths({ processId, rowId, uid: 'log-1', photoId: id, now: 1700000000000 })
  return { id, path, thumbPath, width: 1600, height: 1200, size: 400000, uploadedAt: 1700000000000, byId: 'log-1' }
}

function conferenceWith(entries) {
  return {
    damageByRowId: Object.fromEntries(
      Object.entries(entries).map(([rowId, ids]) => [
        rowId,
        { flagged: true, note: 'caixa molhada', photos: ids.map((id) => photoOf(id, rowId)) },
      ])
    ),
  }
}

describe('paridade cliente x servidor', () => {
  it('o padrão do id da foto é o mesmo do modelo da conferência (functions/ não importa de src/)', async () => {
    const { CARGO_PHOTO_ID_PATTERN } = await import('../../src/features/processes/cargoConferenceIssues.js')
    expect(damage.CARGO_CONFERENCE_PHOTO_ID_PATTERN.source).toBe(CARGO_PHOTO_ID_PATTERN.source)
    expect(damage.CARGO_CONFERENCE_PHOTO_ID_PATTERN.flags).toBe(CARGO_PHOTO_ID_PATTERN.flags)
  })
})

describe('sanitizeCargoPhotoPathSegment e resolveCargoConferencePhotoPath', () => {
  it('caminho do cliente e do servidor concordam (mesmo saneamento) para qualquer rowId', () => {
    for (const rowId of ['r-8a9b-1', 'linha com espaço', 'a/b', 'ç.ã', '  r-1  ']) {
      const { path, thumbPath } = buildCargoPhotoPaths({ processId: 'p1', rowId, uid: 'log-1', photoId: 'abc123', now: 1 })
      expect(damage.resolveCargoConferencePhotoPath('p1', path, rowId)).toBe(path)
      expect(damage.resolveCargoConferencePhotoPath('p1', thumbPath, rowId)).toBe(thumbPath)
    }
  })

  it('aceita o caminho do processo (sem rowId: só confere o prefixo e a forma)', () => {
    const path = 'processes/p1/cargo-conference/r-1/1-u-abc.jpg'
    expect(damage.resolveCargoConferencePhotoPath('p1', path)).toBe(path)
  })

  it.each([
    ['outro processo', 'processes/OUTRO/cargo-conference/r-1/1-u-a.jpg'],
    ['pasta de documentos', 'processes/p1/documents/bl/1-u-a.pdf'],
    ['post-receipt', 'processes/p1/post-receipt/1-u-a.jpg'],
    ['traversal', 'processes/p1/cargo-conference/../../users/x'],
    ['traversal no meio', 'processes/p1/cargo-conference/r-1/../x.jpg'],
    ['barra dupla', 'processes/p1/cargo-conference//1-u-a.jpg'],
    ['barra invertida', `processes/p1/cargo-conference/r-1${BACKSLASH}x.jpg`],
    ['NUL', `processes/p1/cargo-conference/r-1/x${String.fromCharCode(0)}.jpg`],
    ['sem arquivo', 'processes/p1/cargo-conference/r-1/'],
    ['subpasta a mais', 'processes/p1/cargo-conference/r-1/x/1-u-a.jpg'],
    ['sem linha', 'processes/p1/cargo-conference/1-u-a.jpg'],
    ['vazio', ''],
    ['não é texto', null],
  ])('rejeita %s', (_label, path) => {
    expect(damage.resolveCargoConferencePhotoPath('p1', path)).toBeNull()
  })

  it('com rowId, o segmento da linha tem de ser o da linha dona da foto', () => {
    const path = 'processes/p1/cargo-conference/r-1/1-u-a.jpg'
    expect(damage.resolveCargoConferencePhotoPath('p1', path, 'r-1')).toBe(path)
    expect(damage.resolveCargoConferencePhotoPath('p1', path, 'r-2')).toBeNull()
  })

  it('sem processId -> null', () => {
    expect(damage.resolveCargoConferencePhotoPath('', 'processes//cargo-conference/r/x.jpg')).toBeNull()
  })
})

describe('findCargoConferencePhoto', () => {
  const conference = conferenceWith({ 'r-1': ['aaa', 'bbb'], 'r-2': ['ccc'] })

  it('acha a foto e a linha dona', () => {
    const found = damage.findCargoConferencePhoto(conference, 'ccc')
    expect(found.rowId).toBe('r-2')
    expect(found.photo.id).toBe('ccc')
  })

  it.each([['inexistente'], ['x/y'], [''], [undefined], [42]])('id %j -> null', (photoId) => {
    expect(damage.findCargoConferencePhoto(conference, photoId)).toBeNull()
  })

  it.each([[null], [{}], [{ damageByRowId: null }], [{ damageByRowId: { 'r-1': { photos: 'x' } } }]])(
    'doc %j sem fotos -> null',
    (data) => {
      expect(damage.findCargoConferencePhoto(data, 'aaa')).toBeNull()
    }
  )
})

describe('canDownloadCargoConferencePhotos (J1: só admin e logística)', () => {
  it('admin e logística ativos com e-mail corporativo', () => {
    expect(damage.canDownloadCargoConferencePhotos(LOGISTICA)).toBe(true)
    expect(damage.canDownloadCargoConferencePhotos({ ...LOGISTICA, role: 'admin', status: ' ativo ' })).toBe(true)
  })

  it.each(['tecnico', 'faturamento', 'user', 'compras', 'viewer', undefined])('papel %s -> não', (role) => {
    expect(damage.canDownloadCargoConferencePhotos({ ...LOGISTICA, role })).toBe(false)
  })

  it('status, e-mail e token inválidos -> não', () => {
    expect(damage.canDownloadCargoConferencePhotos({ ...LOGISTICA, status: 'Pendente' })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotos({ ...LOGISTICA, email: 'x@gmail.com' })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotos({ ...LOGISTICA, email: undefined })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotos(null)).toBe(false)
  })
})

describe('listRemovedCargoConferencePhotoPaths', () => {
  const before = conferenceWith({ 'r-1': ['aaa', 'bbb'], 'r-2': ['ccc'] })

  it('foto removida: apaga a foto e a miniatura dela, só', () => {
    const after = conferenceWith({ 'r-1': ['aaa'], 'r-2': ['ccc'] })
    const paths = damage.listRemovedCargoConferencePhotoPaths(before, after, 'p1')
    const removed = photoOf('bbb', 'r-1')
    expect(paths.sort()).toEqual([removed.path, removed.thumbPath].sort())
  })

  it('foto mantida: nada', () => {
    expect(damage.listRemovedCargoConferencePhotoPaths(before, structuredClone(before), 'p1')).toEqual([])
  })

  it('o doc novo SEM a chave damageByRowId nunca apaga nada', () => {
    expect(damage.listRemovedCargoConferencePhotoPaths(before, { status: 'aberta' }, 'p1')).toEqual([])
    expect(damage.listRemovedCargoConferencePhotoPaths(before, { damageByRowId: null }, 'p1')).toEqual([])
    expect(damage.listRemovedCargoConferencePhotoPaths(before, null, 'p1')).toEqual([])
  })

  it('doc novo com mapa vazio: as fotos anteriores saem', () => {
    const paths = damage.listRemovedCargoConferencePhotoPaths(before, { damageByRowId: {} }, 'p1')
    expect(paths).toHaveLength(6)
  })

  it('doc anterior sem fotos ou inexistente: nada', () => {
    expect(damage.listRemovedCargoConferencePhotoPaths(null, before, 'p1')).toEqual([])
    expect(damage.listRemovedCargoConferencePhotoPaths({}, before, 'p1')).toEqual([])
  })

  it('só caminhos do próprio processo e da própria linha (metadado adulterado não aponta para fora)', () => {
    const evil = conferenceWith({ 'r-1': ['aaa'] })
    evil.damageByRowId['r-1'].photos.push(
      { ...photoOf('eee', 'r-1'), path: 'processes/OUTRO/cargo-conference/r-1/1-u-e.jpg', thumbPath: 'users/x/y.jpg' },
      { ...photoOf('fff', 'r-1'), path: 'processes/p1/documents/bl/1-u-f.pdf', thumbPath: 'processes/p1/cargo-conference/r-9/1-u-f-t.jpg' }
    )
    const paths = damage.listRemovedCargoConferencePhotoPaths(evil, { damageByRowId: {} }, 'p1')
    expect(paths.sort()).toEqual([photoOf('aaa', 'r-1').path, photoOf('aaa', 'r-1').thumbPath].sort())
  })

  it('caminho ainda usado no doc novo (foto movida de linha) não sai', () => {
    const moved = photoOf('aaa', 'r-1')
    const after = { damageByRowId: { 'r-9': { flagged: true, note: '', photos: [moved] } } }
    expect(damage.listRemovedCargoConferencePhotoPaths(conferenceWith({ 'r-1': ['aaa'] }), after, 'p1')).toEqual([])
  })

  it('sem processId nada é apagado', () => {
    expect(damage.listRemovedCargoConferencePhotoPaths(before, { damageByRowId: {} }, '')).toEqual([])
  })

  it('respeita o teto de caminhos por gravação', () => {
    const many = {
      damageByRowId: Object.fromEntries(
        Array.from({ length: 150 }, (_, i) => [`r-${i}`, { flagged: true, note: '', photos: [photoOf(`p${i}`, `r-${i}`)] }])
      ),
    }
    const paths = damage.listRemovedCargoConferencePhotoPaths(many, { damageByRowId: {} }, 'p1')
    expect(paths).toHaveLength(damage.CARGO_CONFERENCE_MAX_REMOVED_PATHS)
  })
})

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

function createReq({
  method = 'GET',
  authorization = 'Bearer TOKEN',
  query = { processId: 'p1', photoId: 'bbb', size: 'thumb' },
} = {}) {
  return {
    method,
    query,
    headers: authorization ? { authorization } : {},
    get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  }
}

function mockConference(data) {
  const get = vi.fn().mockResolvedValue({ exists: data !== null, data: () => data ?? undefined })
  mockFirestoreApi.doc.mockReturnValue({ get })
  return get
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('downloadCargoConferencePhoto', () => {
  beforeEach(() => {
    mockAuthApi.verifyIdToken.mockResolvedValue(LOGISTICA)
    mockConference(conferenceWith({ 'r-1': ['aaa', 'bbb'] }))
    mockStorageFile.getMetadata.mockResolvedValue([{ contentType: 'image/jpeg', size: '4' }])
    mockStorageFile.createReadStream.mockImplementation(() => Readable.from([Buffer.from('JPEG')]))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('roda em us-central1', () => {
    expect(downloadCargoConferencePhoto.__opts.region).toBe('us-central1')
  })

  it('POST -> 405', async () => {
    const res = createRes()
    await downloadHandler(createReq({ method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
  })

  it.each([[''], ['Basic x'], ['Bearer ']])('Authorization "%s" -> 401 sem verificar token', async (authorization) => {
    const res = createRes()
    await downloadHandler(createReq({ authorization }), res)
    expect(res.statusCode).toBe(401)
    expect(mockAuthApi.verifyIdToken).not.toHaveBeenCalled()
  })

  it('token inválido -> 401 (checkRevoked=true)', async () => {
    mockAuthApi.verifyIdToken.mockRejectedValue(new Error('expired'))
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(401)
    expect(mockAuthApi.verifyIdToken).toHaveBeenCalledWith('TOKEN', true)
  })

  it.each([
    ['técnico', { ...LOGISTICA, role: 'tecnico' }],
    ['faturamento', { ...LOGISTICA, role: 'faturamento' }],
    ['user', { ...LOGISTICA, role: 'user' }],
    ['logística pendente', { ...LOGISTICA, status: 'Pendente' }],
    ['e-mail externo', { ...LOGISTICA, email: 'x@gmail.com' }],
  ])('%s -> 403 sem tocar o Firestore', async (_label, claims) => {
    mockAuthApi.verifyIdToken.mockResolvedValue(claims)
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(403)
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
  })

  it.each([
    [{ processId: '../users', photoId: 'bbb' }],
    [{ processId: 'p1/x', photoId: 'bbb' }],
    [{ processId: 'p1', photoId: 'a/b' }],
    [{ processId: 'p1', photoId: '' }],
    [{ processId: 'p1' }],
    [{ photoId: 'bbb' }],
    [{ processId: 'p1', photoId: 'bbb', size: 'huge' }],
    [{ processId: 'p1', photoId: 'bbb', size: ['thumb', 'full'] }],
  ])('query %j -> 400 sem tocar o Firestore', async (query) => {
    const res = createRes()
    await downloadHandler(createReq({ query }), res)
    expect(res.statusCode).toBe(400)
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
  })

  it('admin baixa a miniatura: 200 com os cabeçalhos de exibição', async () => {
    mockAuthApi.verifyIdToken.mockResolvedValue({ ...LOGISTICA, role: 'admin' })
    const res = createRes()
    await downloadHandler(createReq(), res)
    await flush()
    const expected = photoOf('bbb', 'r-1')
    expect(res.statusCode).toBe(200)
    expect(res.body()).toBe('JPEG')
    expect(res.headers['Content-Type']).toBe('image/jpeg')
    expect(res.headers['Content-Disposition']).toBe('inline')
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(res.headers['Content-Length']).toBe('4')
    expect(mockFirestoreApi.doc).toHaveBeenCalledWith('processes/p1/cargoReport/conference')
    expect(mockBucket.file).toHaveBeenCalledWith(expected.thumbPath)
  })

  it('logística baixa a foto inteira (size=full e sem size)', async () => {
    const expected = photoOf('aaa', 'r-1')
    for (const query of [
      { processId: 'p1', photoId: 'aaa', size: 'full' },
      { processId: 'p1', photoId: 'aaa' },
    ]) {
      mockBucket.file.mockClear()
      const res = createRes()
      await downloadHandler(createReq({ query }), res)
      await flush()
      expect(res.statusCode).toBe(200)
      expect(mockBucket.file).toHaveBeenCalledWith(expected.path)
    }
  })

  it('conferência inexistente -> 404', async () => {
    mockConference(null)
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(404)
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('foto não listada na conferência -> 404 sem tocar o Storage', async () => {
    const res = createRes()
    await downloadHandler(createReq({ query: { processId: 'p1', photoId: 'zzz', size: 'thumb' } }), res)
    expect(res.statusCode).toBe(404)
    expect(res.jsonBody).toEqual({ error: 'not-found' })
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('caminho de outro processo no doc -> 400 sem chamar bucket.file', async () => {
    const data = conferenceWith({ 'r-1': ['bbb'] })
    data.damageByRowId['r-1'].photos[0].thumbPath = 'processes/OUTRO/cargo-conference/r-1/1-u-b-t.jpg'
    mockConference(data)
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(400)
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('caminho de outra linha no doc -> 400', async () => {
    const data = conferenceWith({ 'r-1': ['bbb'] })
    data.damageByRowId['r-1'].photos[0].thumbPath = 'processes/p1/cargo-conference/r-2/1-u-b-t.jpg'
    mockConference(data)
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(400)
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('objeto ausente no Storage -> 404; erro do Storage -> 500', async () => {
    mockStorageFile.getMetadata.mockRejectedValueOnce({ code: 404 })
    const missing = createRes()
    await downloadHandler(createReq(), missing)
    expect(missing.statusCode).toBe(404)

    mockStorageFile.getMetadata.mockRejectedValueOnce(new Error('boom'))
    const broken = createRes()
    await downloadHandler(createReq(), broken)
    expect(broken.statusCode).toBe(500)
  })

  it('erro ao ler o Firestore -> 500', async () => {
    mockFirestoreApi.doc.mockReturnValue({ get: vi.fn().mockRejectedValue(new Error('down')) })
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(500)
  })

  it('erro do Storage com o caminho na mensagem: o log traz só o código', async () => {
    const leaky = Object.assign(new Error('No such object: bucket/processes/p1/cargo-conference/r-1/x.jpg'), { code: 500 })
    mockStorageFile.getMetadata.mockRejectedValueOnce(leaky)
    await downloadHandler(createReq(), createRes())
    mockStorageFile.getMetadata.mockResolvedValueOnce([{ size: '4' }])
    mockStorageFile.createReadStream.mockImplementationOnce(() => {
      const stream = new Readable({ read() {} })
      queueMicrotask(() => stream.destroy(leaky))
      return stream
    })
    await downloadHandler(createReq(), createRes())
    await flush()
    mockFirestoreApi.doc.mockReturnValueOnce({ get: vi.fn().mockRejectedValue(leaky) })
    await downloadHandler(createReq(), createRes())
    const logged = JSON.stringify([mockLogger.error.mock.calls, mockLogger.warn.mock.calls])
    expect(logged).toContain('Falha')
    expect(logged).not.toContain('cargo-conference')
    expect(logged).not.toContain('No such object')
  })

  it('o log não carrega caminho de arquivo', async () => {
    const res = createRes()
    await downloadHandler(createReq(), res)
    await flush()
    const logged = JSON.stringify(mockLogger.info.mock.calls)
    expect(logged).toContain('bbb')
    expect(logged).not.toContain('cargo-conference')
  })
})

describe('syncCargoConferenceDamage', () => {
  const event = (before, after, processId = 'p1') => ({
    params: { processId },
    data: {
      before: { exists: before !== null, data: () => before ?? undefined },
      after: { exists: after !== null, data: () => after ?? undefined },
    },
  })

  beforeEach(() => {
    mockStorageFile.delete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('apaga do bucket a foto e a miniatura removidas, com ignoreNotFound', async () => {
    const before = conferenceWith({ 'r-1': ['aaa', 'bbb'] })
    const after = conferenceWith({ 'r-1': ['aaa'] })
    await syncHandler(event(before, after))
    const removed = photoOf('bbb', 'r-1')
    expect(mockBucket.file.mock.calls.map(([path]) => path).sort()).toEqual([removed.path, removed.thumbPath].sort())
    expect(mockStorageFile.delete).toHaveBeenCalledTimes(2)
    expect(mockStorageFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  it('é idempotente: repetir o mesmo evento apaga os mesmos arquivos e não grava no Firestore', async () => {
    const before = conferenceWith({ 'r-1': ['aaa', 'bbb'] })
    const after = conferenceWith({ 'r-1': ['aaa'] })
    await syncHandler(event(before, after))
    await syncHandler(event(before, after))
    expect(mockStorageFile.delete).toHaveBeenCalledTimes(4)
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
    expect(mockFirestoreApi.set).not.toHaveBeenCalled()
  })

  it('gravação sem a chave damageByRowId não apaga nada', async () => {
    await syncHandler(event(conferenceWith({ 'r-1': ['aaa'] }), { status: 'aberta' }))
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('doc criado, apagado ou sem mudança de fotos: nada', async () => {
    const same = conferenceWith({ 'r-1': ['aaa'] })
    await syncHandler(event(null, same))
    await syncHandler(event(same, null))
    await syncHandler(event(same, structuredClone(same)))
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('processo sem id ou evento sem dados: nada, sem erro', async () => {
    await syncHandler({ params: {}, data: undefined })
    await syncHandler(event(conferenceWith({ 'r-1': ['aaa'] }), { damageByRowId: {} }, ''))
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('falha ao apagar um arquivo vira só log e não impede os outros', async () => {
    mockStorageFile.delete.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    await expect(
      syncHandler(event(conferenceWith({ 'r-1': ['aaa'] }), { damageByRowId: {} }))
    ).resolves.toBeUndefined()
    expect(mockStorageFile.delete).toHaveBeenCalledTimes(2)
    expect(mockLogger.warn).toHaveBeenCalled()
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain('cargo-conference')
  })

  it('erro do Storage com o caminho na mensagem: o log da limpeza traz só o código', async () => {
    mockStorageFile.delete.mockRejectedValue(
      Object.assign(new Error('No such object: bucket/processes/p1/cargo-conference/r-1/x.jpg'), { code: 403 })
    )
    await syncHandler(event(conferenceWith({ 'r-1': ['aaa'] }), { damageByRowId: {} }))
    const logged = JSON.stringify(mockLogger.warn.mock.calls)
    expect(logged).toContain('403')
    expect(logged).not.toContain('No such object')
    expect(logged).not.toContain('cargo-conference')
  })
})
