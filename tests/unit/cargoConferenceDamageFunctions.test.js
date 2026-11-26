// S11 (J1) + S10-J2: fotos de avaria da Conferência do Relatório de Carga no servidor: módulo puro
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
  mockStorageApi,
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

// ---------- S10-J2: resumo, seção do aviso, espelho e leitor ----------

const CURRENT_ROW = (id, extra = {}) => ({ id, po: 'PO1', dbcorpCode: `C-${id}`, sqDescription: `Desc ${id}`, quantityKg: 100, ...extra })
const PHOTO_LITE = (id) => ({ id, path: `processes/p1/cargo-conference/r/${id}.jpg`, thumbPath: `processes/p1/cargo-conference/r/${id}-t.jpg`, width: 1600, height: 1200, size: 1, uploadedAt: 1, byId: 'u' })

describe('summarizeCargoConferenceDamage', () => {
  const current = {
    expectedPallets: 25,
    rows: [
      CURRENT_ROW('r-1', { sqDescription: 'POLIOL PE-3000' }),
      CURRENT_ROW('r-2', { sqDescription: '', supplierDescription: 'ISOCIANATO MDI' }),
      CURRENT_ROW('r-3', { sqDescription: '  ', supplierDescription: '' }),
    ],
  }

  it('rótulo = descrição SQ, senão a do fornecedor, senão "Item N"; ordem e número vêm das linhas do relatório', () => {
    const conference = {
      damageByRowId: {
        'r-3': { flagged: true, note: '', photos: [] },
        'r-2': { flagged: false, note: 'riscado', photos: [] },
        'r-1': { flagged: false, note: '', photos: [PHOTO_LITE('aaa')] },
      },
    }
    const summary = damage.summarizeCargoConferenceDamage(conference, current)
    expect(summary.items.map((item) => [item.index, item.rowId, item.label])).toEqual([
      [1, 'r-1', 'POLIOL PE-3000'],
      [2, 'r-2', 'ISOCIANATO MDI'],
      [3, 'r-3', 'Item 3'],
    ])
    expect(summary.itemCount).toBe(3)
    expect(summary.photoCount).toBe(1)
    expect(summary.items[0]).toMatchObject({ code: 'C-r-1', note: '', flagged: false, photoCount: 1 })
    expect(summary.items[0].photos).toEqual([{ id: 'aaa', width: 1600, height: 1200 }])
  })

  it('sem avaria: nenhuma linha vira item (nota só de espaços, entrada vazia e fotos inválidas não contam)', () => {
    const conference = {
      damageByRowId: {
        'r-1': { flagged: false, note: '   ', photos: [] },
        'r-2': { flagged: false, note: '', photos: [{ id: 'x/y' }, { nope: true }, null] },
        'r-3': 'texto',
      },
    }
    const summary = damage.summarizeCargoConferenceDamage(conference, current)
    expect(summary.items).toEqual([])
    expect(summary.itemCount).toBe(0)
    expect(summary.photoCount).toBe(0)
  })

  it('linha removida do relatório (avaria antiga) e linha vazia ficam de fora', () => {
    const conference = {
      damageByRowId: {
        'r-9': { flagged: true, note: 'linha que já não existe', photos: [PHOTO_LITE('zzz')] },
        'r-vazia': { flagged: true, note: 'x', photos: [] },
        'r-1': { flagged: true, note: 'ok', photos: [] },
      },
    }
    const withEmpty = { ...current, rows: [...current.rows, { id: 'r-vazia', po: '', quantityKg: null, count: '' }] }
    const summary = damage.summarizeCargoConferenceDamage(conference, withEmpty)
    expect(summary.items.map((item) => item.rowId)).toEqual(['r-1'])
    expect(summary.photoCount).toBe(0)
  })

  it('tetos: 5 fotos por item e 30 no total; id repetido conta uma vez', () => {
    const many = (prefix, n) => Array.from({ length: n }, (_, i) => PHOTO_LITE(`${prefix}${i}`))
    const rows = Array.from({ length: 8 }, (_, i) => CURRENT_ROW(`r-${i}`))
    const conference = {
      damageByRowId: Object.fromEntries(
        rows.map((row, i) => [row.id, { flagged: true, note: '', photos: [...many(`p${i}-`, 7), PHOTO_LITE(`p${i}-0`)] }])
      ),
    }
    const summary = damage.summarizeCargoConferenceDamage(conference, { rows })
    expect(summary.items[0].photos).toHaveLength(5)
    expect(summary.items[0].photoCount).toBe(5)
    expect(summary.photoCount).toBe(30)
    expect(summary.items.reduce((sum, item) => sum + item.photos.length, 0)).toBe(30)
    expect(summary.items[6].photos).toHaveLength(0)
    expect(summary.itemCount).toBe(8)
  })

  it('nota aparada e cortada em 1.000 caracteres', () => {
    const conference = { damageByRowId: { 'r-1': { flagged: false, note: `  ${'a'.repeat(1500)}  `, photos: [] } } }
    expect(damage.summarizeCargoConferenceDamage(conference, current).items[0].note).toHaveLength(1000)
  })

  it('pallets: confere, divergente e sem total (0 contados também diverge; total inválido = sem total)', () => {
    const rows = [CURRENT_ROW('r-1'), CURRENT_ROW('r-2')]
    const at = (palletsByRowId, expectedPallets) =>
      damage.summarizeCargoConferenceDamage({ palletsByRowId, damageByRowId: {} }, { rows, expectedPallets }).pallets
    expect(at({ 'r-1': 10, 'r-2': 15 }, 25)).toEqual({ counted: 25, expected: 25, state: 'confere' })
    expect(at({ 'r-1': 10, 'r-2': 13 }, 25)).toEqual({ counted: 23, expected: 25, state: 'divergente' })
    expect(at({}, 25)).toEqual({ counted: 0, expected: 25, state: 'divergente' })
    expect(at({ 'r-1': 10 }, null)).toEqual({ counted: 10, expected: null, state: 'semTotal' })
    expect(at({ 'r-1': 10 }, 0)).toMatchObject({ expected: null, state: 'semTotal' })
    expect(at({ 'r-1': 10 }, '25')).toMatchObject({ expected: null, state: 'semTotal' })
    expect(at({ 'r-1': 1000, 'r-2': -1, 'r-9': 5 }, 25).counted).toBe(0)
  })

  it('doc nulo ou malformado: resumo vazio, sem erro', () => {
    for (const [conference, currentDoc] of [[null, null], [{}, {}], [{ damageByRowId: 'x' }, { rows: 'y' }]]) {
      const summary = damage.summarizeCargoConferenceDamage(conference, currentDoc)
      expect(summary).toMatchObject({ items: [], itemCount: 0, photoCount: 0, pallets: { counted: 0, expected: null, state: 'semTotal' } })
    }
  })
})

describe('buildCargoConferenceDamageLines / buildCargoConferenceDamageText', () => {
  const item = (index, extra = {}) => ({
    rowId: `r-${index}`, index, label: `Desc ${index}`, code: '', note: 'Caixas molhadas.', flagged: true, photoCount: 0, photos: [], ...extra,
  })
  const summaryOf = (items, extra = {}) => ({
    items,
    itemCount: items.length,
    photoCount: items.reduce((sum, i) => sum + (i.photoCount ?? 0), 0),
    pallets: { counted: 23, expected: null, state: 'semTotal' },
    ...extra,
  })

  it('sem item: lista vazia e texto vazio (aviso de hoje)', () => {
    expect(damage.buildCargoConferenceDamageLines(summaryOf([]))).toEqual([])
    expect(damage.buildCargoConferenceDamageLines(null)).toEqual([])
    expect(damage.buildCargoConferenceDamageText([])).toBe('')
    expect(damage.buildCargoConferenceDamageText(null)).toBe('')
  })

  it('cabeçalho, item com fotos e observação (formato do plano)', () => {
    const lines = damage.buildCargoConferenceDamageLines(
      summaryOf([
        item(1, { label: 'POLIOL PE-3000', photoCount: 2, photos: [{ id: 'a' }, { id: 'b' }], note: 'Caixas molhadas no pallet 2.' }),
        item(2, { label: 'ISOCIANATO MDI', photoCount: 1, photos: [{ id: 'c' }], note: 'Lacre rompido.' }),
      ])
    )
    expect(lines).toEqual([
      'Avarias e ressalvas: 2 itens, 3 fotos no Portal.',
      '• Item 1 · POLIOL PE-3000 · 2 fotos: Caixas molhadas no pallet 2.',
      '• Item 2 · ISOCIANATO MDI · 1 foto: Lacre rompido.',
    ])
  })

  it('singular: "1 item, 1 foto"', () => {
    const lines = damage.buildCargoConferenceDamageLines(summaryOf([item(1, { photoCount: 1, photos: [{ id: 'a' }] })]))
    expect(lines[0]).toBe('Avarias e ressalvas: 1 item, 1 foto no Portal.')
  })

  it('sem foto nenhuma: sem o trecho "fotos no Portal" e sem "· N fotos" na linha', () => {
    const lines = damage.buildCargoConferenceDamageLines(summaryOf([item(1)]))
    expect(lines).toEqual(['Avarias e ressalvas: 1 item.', '• Item 1 · Desc 1: Caixas molhadas.'])
  })

  it('foto sem observação e só marcada', () => {
    const lines = damage.buildCargoConferenceDamageLines(
      summaryOf([
        item(1, { note: '', photoCount: 1, photos: [{ id: 'a' }] }),
        item(2, { note: '', photoCount: 0, flagged: true }),
        item(3, { note: '   ', photoCount: 3, photos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
      ])
    )
    expect(lines[1]).toBe('• Item 1 · Desc 1 · 1 foto: (sem observação)')
    expect(lines[2]).toBe('• Item 2 · Desc 2: avaria registrada, sem observação')
    expect(lines[3]).toBe('• Item 3 · Desc 3 · 3 fotos: (sem observação)')
  })

  it('rótulo "Item N" (item sem descrição) não repete o número', () => {
    const lines = damage.buildCargoConferenceDamageLines(summaryOf([item(3, { label: 'Item 3' })]))
    expect(lines[1]).toBe('• Item 3: Caixas molhadas.')
  })

  it('linha de pallets só quando o COMEX informou o total: divergente e confere', () => {
    const base = [item(1)]
    const divergent = damage.buildCargoConferenceDamageLines(summaryOf(base, { pallets: { counted: 23, expected: 25, state: 'divergente' } }))
    expect(divergent[1]).toBe('Pallets: 23 contados de 25 informados pelo COMEX (divergente).')
    const equal = damage.buildCargoConferenceDamageLines(summaryOf(base, { pallets: { counted: 25, expected: 25, state: 'confere' } }))
    expect(equal[1]).toBe('Pallets: 25 contados de 25 informados pelo COMEX (confere).')
    const single = damage.buildCargoConferenceDamageLines(summaryOf(base, { pallets: { counted: 1, expected: 1, state: 'confere' } }))
    expect(single[1]).toBe('Pallets: 1 contado de 1 informado pelo COMEX (confere).')
    const none = damage.buildCargoConferenceDamageLines(summaryOf(base))
    expect(none.some((line) => line.startsWith('Pallets:'))).toBe(false)
  })

  it('12 itens: 10 linhas e "+ 2 itens no Portal."; 11 itens: "+ 1 item no Portal."', () => {
    const lines = damage.buildCargoConferenceDamageLines(summaryOf(Array.from({ length: 12 }, (_, i) => item(i + 1))))
    expect(lines).toHaveLength(1 + 10 + 1)
    expect(lines[0]).toBe('Avarias e ressalvas: 12 itens.')
    expect(lines.at(-1)).toBe('+ 2 itens no Portal.')
    expect(lines.filter((line) => line.startsWith('• '))).toHaveLength(10)
    const eleven = damage.buildCargoConferenceDamageLines(summaryOf(Array.from({ length: 11 }, (_, i) => item(i + 1))))
    expect(eleven.at(-1)).toBe('+ 1 item no Portal.')
    const ten = damage.buildCargoConferenceDamageLines(summaryOf(Array.from({ length: 10 }, (_, i) => item(i + 1))))
    expect(ten.some((line) => line.startsWith('+ '))).toBe(false)
  })

  it('rótulo do item: 120 caracteres passam inteiros; 121 são cortados em 120 com reticências (sem espaço sobrando)', () => {
    const exact = damage.buildCargoConferenceDamageLines(summaryOf([item(1, { label: 'L'.repeat(120) })]))
    expect(exact[1]).toBe(`• Item 1 · ${'L'.repeat(120)}: Caixas molhadas.`)
    const long = damage.buildCargoConferenceDamageLines(summaryOf([item(1, { label: 'L'.repeat(300) })]))
    expect(long[1]).toBe(`• Item 1 · ${'L'.repeat(120)}…: Caixas molhadas.`)
    const spaced = damage.buildCargoConferenceDamageLines(summaryOf([item(1, { label: `${'M'.repeat(119)} ${'N'.repeat(50)}` })]))
    expect(spaced[1]).toBe(`• Item 1 · ${'M'.repeat(119)}…: Caixas molhadas.`)
  })

  it('rótulo curto e o fallback "Item N" não mudam com o corte', () => {
    const lines = damage.buildCargoConferenceDamageLines(
      summaryOf([item(1, { label: 'POLIOL PE-3000' }), item(2, { label: 'Item 2' }), item(3, { label: 'a\n b' })])
    )
    expect(lines[1]).toBe('• Item 1 · POLIOL PE-3000: Caixas molhadas.')
    expect(lines[2]).toBe('• Item 2: Caixas molhadas.')
    expect(lines[3]).toBe('• Item 3 · a b: Caixas molhadas.')
  })

  it('observação de 300 caracteres é cortada em 200 com reticências; 200 exatos não são cortados', () => {
    const long = damage.buildCargoConferenceDamageLines(summaryOf([item(1, { note: 'a'.repeat(300) })]))
    expect(long[1]).toBe(`• Item 1 · Desc 1: ${'a'.repeat(200)}…`)
    const exact = damage.buildCargoConferenceDamageLines(summaryOf([item(1, { note: 'b'.repeat(200) })]))
    expect(exact[1]).toBe(`• Item 1 · Desc 1: ${'b'.repeat(200)}`)
  })

  it('quebras de linha na observação viram espaço (1 linha por item); o texto junta as linhas com \\n', () => {
    const lines = damage.buildCargoConferenceDamageLines(summaryOf([item(1, { note: 'a\n\nb\r\nc' })]))
    expect(lines[1]).toBe('• Item 1 · Desc 1: a b c')
    expect(damage.buildCargoConferenceDamageText(lines)).toBe(lines.join('\n'))
    expect(damage.buildCargoConferenceDamageText(['a', '', 'b'])).toBe('a\nb')
  })
})

describe('extractCargoConferenceDamageLines', () => {
  const FIXED = 'Conferência da logística concluída no Relatório de Carga. Etiquetas, contagem e dados do recebimento estão disponíveis na pasta do processo no Portal COMEX.'

  it('lê a seção depois do marcador (ida e volta com o texto do aviso)', () => {
    const lines = ['Avarias e ressalvas: 1 item.', 'Pallets: 1 contado de 1 informado pelo COMEX (confere).', '• Item 1 · Desc 1: ok']
    const body = `${FIXED}\n\n${damage.buildCargoConferenceDamageText(lines)}`
    expect(damage.extractCargoConferenceDamageLines(body)).toEqual(lines)
    expect(damage.extractCargoConferenceDamageLines(body.replaceAll('\n', '\r\n'))).toEqual(lines)
  })

  it('body de hoje, vazio ou que não é texto: lista vazia', () => {
    expect(damage.extractCargoConferenceDamageLines(FIXED)).toEqual([])
    expect(damage.extractCargoConferenceDamageLines('')).toEqual([])
    expect(damage.extractCargoConferenceDamageLines(undefined)).toEqual([])
    expect(damage.extractCargoConferenceDamageLines(42)).toEqual([])
  })

  it('o marcador só vale no início da linha (texto de observação não engana)', () => {
    expect(damage.extractCargoConferenceDamageLines('• Item 1: Avarias e ressalvas: x')).toEqual([])
  })
})

describe('buildCargoDamageMirror', () => {
  const current = { expectedPallets: 25, rows: [CURRENT_ROW('r-1', { sqDescription: 'POLIOL' }), CURRENT_ROW('r-2')] }
  const conference = {
    revision: 7,
    status: 'fechada',
    closedDate: '2026-11-24',
    closedByName: 'Logi Um',
    closedById: 'log-1',
    receiptStatus: 'com_ressalva',
    nfNumber: '12345, 67890',
    labelsByRowId: { 'r-1': { wms: 'ABC', sq: 'DEF' } },
    unloadStartAt: '2026-11-24T10:00',
    unloadEndAt: '2026-11-24T12:00',
    notes: 'nota geral sigilosa',
    palletsByRowId: { 'r-1': 10, 'r-2': 13 },
    damageByRowId: {
      'r-1': { flagged: true, note: 'Caixas molhadas', photos: [PHOTO_LITE('aaa'), PHOTO_LITE('bbb')] },
    },
  }
  const mirror = () => damage.buildCargoDamageMirror(damage.summarizeCargoConferenceDamage(conference, current), conference)

  it('tem exatamente as 10 chaves do plano', () => {
    expect(Object.keys(mirror()).sort()).toEqual(
      ['closedByName', 'closedDate', 'conferenceRevision', 'itemCount', 'items', 'pallets', 'photoCount', 'receiptStatus', 'schemaVersion', 'updatedAt'].sort()
    )
    expect(mirror()).toMatchObject({
      schemaVersion: 1,
      conferenceRevision: 7,
      closedDate: '2026-11-24',
      closedByName: 'Logi Um',
      receiptStatus: 'com_ressalva',
      pallets: { counted: 23, expected: 25 },
      itemCount: 1,
      photoCount: 2,
      updatedAt: null,
    })
    expect(mirror().items).toEqual([
      {
        rowId: 'r-1', index: 1, label: 'POLIOL', code: 'C-r-1', note: 'Caixas molhadas', flagged: true,
        photos: [{ id: 'aaa', width: 1600, height: 1200 }, { id: 'bbb', width: 1600, height: 1200 }],
      },
    ])
  })

  it('sem caminho de arquivo, thumbPath, byId, NF, etiquetas, descarga nem notas gerais', () => {
    const json = JSON.stringify(mirror())
    for (const forbidden of ['path', 'thumbPath', 'byId', 'nfNumber', 'labelsByRowId', 'unload', 'cargo-conference', 'closedById', 'sigilosa', '12345', 'wms']) {
      expect(json).not.toContain(forbidden)
    }
  })

  it('o espelho só copia id, largura e altura: campos extras do resumo (caminho, miniatura, autor) não vazam', () => {
    const summary = {
      items: [
        {
          rowId: 'r-1', index: 1, label: 'POLIOL', code: 'C1', note: 'x', flagged: true, photoCount: 1, path: 'processes/p1/cargo-conference/r-1/a.jpg',
          photos: [{ id: 'aaa', width: 10, height: 20, path: 'processes/p1/cargo-conference/r-1/a.jpg', thumbPath: 'processes/p1/cargo-conference/r-1/a-t.jpg', byId: 'log-1', size: 5, uploadedAt: 1 }],
        },
      ],
      itemCount: 1,
      photoCount: 1,
      pallets: { counted: 1, expected: 1, state: 'confere', difference: 0 },
    }
    const built = damage.buildCargoDamageMirror(summary, conference)
    expect(built.items[0].photos).toEqual([{ id: 'aaa', width: 10, height: 20 }])
    expect(Object.keys(built.items[0]).sort()).toEqual(['code', 'flagged', 'index', 'label', 'note', 'photos', 'rowId'])
    expect(Object.keys(built.pallets).sort()).toEqual(['counted', 'expected'])
    const json = JSON.stringify(built)
    for (const forbidden of ['cargo-conference', 'thumbPath', 'byId', 'log-1', 'uploadedAt']) expect(json).not.toContain(forbidden)
  })

  it('fechar sem avaria: itemCount 0 e itens vazios (apaga a avaria de um fechamento anterior)', () => {
    const clean = { ...conference, damageByRowId: {} }
    const empty = damage.buildCargoDamageMirror(damage.summarizeCargoConferenceDamage(clean, current), clean)
    expect(empty).toMatchObject({ itemCount: 0, photoCount: 0, items: [] })
  })

  it('revisão e total do COMEX inválidos viram 0 e null', () => {
    const odd = damage.buildCargoDamageMirror(
      damage.summarizeCargoConferenceDamage({}, { rows: [], expectedPallets: 'x' }),
      { revision: 'x' }
    )
    expect(odd).toMatchObject({ conferenceRevision: 0, pallets: { counted: 0, expected: null }, closedDate: '', closedByName: '' })
  })
})

describe('shouldWriteCargoDamageMirror', () => {
  it('aberta -> fechada: sim', () => {
    expect(damage.shouldWriteCargoDamageMirror({ status: 'aberta', revision: 3 }, { status: 'fechada', revision: 4 })).toBe(true)
  })

  it('fechada -> fechada com a mesma revisão: não; com revisão nova: sim', () => {
    expect(damage.shouldWriteCargoDamageMirror({ status: 'fechada', revision: 4 }, { status: 'fechada', revision: 4 })).toBe(false)
    expect(damage.shouldWriteCargoDamageMirror({ status: 'fechada', revision: 4 }, { status: 'fechada', revision: 5 })).toBe(true)
  })

  it('sem before (criada já fechada): sim', () => {
    expect(damage.shouldWriteCargoDamageMirror(null, { status: 'fechada', revision: 1 })).toBe(true)
  })

  it('fechada -> aberta (reabrir), aberta -> aberta e doc apagado: não', () => {
    expect(damage.shouldWriteCargoDamageMirror({ status: 'fechada', revision: 4 }, { status: 'aberta', revision: 5 })).toBe(false)
    expect(damage.shouldWriteCargoDamageMirror({ status: 'aberta', revision: 1 }, { status: 'aberta', revision: 2 })).toBe(false)
    expect(damage.shouldWriteCargoDamageMirror({ status: 'fechada', revision: 4 }, null)).toBe(false)
    expect(damage.shouldWriteCargoDamageMirror(null, { revision: 1 })).toBe(false)
  })
})

describe('canDownloadCargoConferencePhotosAsReader e isPhotoInCargoDamageMirror', () => {
  it('técnico e faturamento ativos com e-mail corporativo', () => {
    for (const role of ['tecnico', 'faturamento']) {
      expect(damage.canDownloadCargoConferencePhotosAsReader({ ...LOGISTICA, role, status: ' ATIVO ' })).toBe(true)
    }
  })

  it.each(['admin', 'logistica', 'user', 'compras', 'viewer', undefined])('papel %s -> não é leitor', (role) => {
    expect(damage.canDownloadCargoConferencePhotosAsReader({ ...LOGISTICA, role })).toBe(false)
  })

  it('status, e-mail e token inválidos -> não', () => {
    const reader = { ...LOGISTICA, role: 'tecnico' }
    expect(damage.canDownloadCargoConferencePhotosAsReader({ ...reader, status: 'Pendente' })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotosAsReader({ ...reader, status: 'Bloqueado' })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotosAsReader({ ...reader, email: 'x@gmail.com' })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotosAsReader({ ...reader, email: undefined })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotosAsReader(null)).toBe(false)
  })

  it('admin/logística: a regra da J1 não muda (técnico e faturamento seguem fora de canDownloadCargoConferencePhotos)', () => {
    expect(damage.canDownloadCargoConferencePhotos({ ...LOGISTICA, role: 'tecnico' })).toBe(false)
    expect(damage.canDownloadCargoConferencePhotos(LOGISTICA)).toBe(true)
  })

  it('foto no espelho: só pelo id, em qualquer item', () => {
    const mirror = { items: [{ photos: [{ id: 'aaa' }] }, { photos: [{ id: 'bbb' }, { id: 'ccc' }] }] }
    expect(damage.isPhotoInCargoDamageMirror(mirror, 'ccc')).toBe(true)
    expect(damage.isPhotoInCargoDamageMirror(mirror, 'zzz')).toBe(false)
    expect(damage.isPhotoInCargoDamageMirror(mirror, 'a/b')).toBe(false)
    expect(damage.isPhotoInCargoDamageMirror(mirror, undefined)).toBe(false)
    expect(damage.isPhotoInCargoDamageMirror(null, 'aaa')).toBe(false)
    expect(damage.isPhotoInCargoDamageMirror({ items: 'x' }, 'aaa')).toBe(false)
    expect(damage.isPhotoInCargoDamageMirror({ items: [{ photos: null }] }, 'aaa')).toBe(false)
  })
})

function mockDocs(docs, { failOn } = {}) {
  const sets = []
  mockFirestoreApi.doc.mockImplementation((path) => ({
    get: vi.fn(async () => {
      if (failOn === path) throw Object.assign(new Error(`down ${path} nota-secreta`), { code: 'unavailable' })
      const data = docs[path]
      return { exists: data !== undefined, data: () => data }
    }),
    set: vi.fn(async (data) => {
      sets.push({ path, data })
    }),
  }))
  return sets
}

describe('downloadCargoConferencePhoto: técnico e faturamento (S10-J2)', () => {
  const CONF_PATH = 'processes/p1/cargoReport/conference'
  const MIRROR_PATH = 'processes/p1/cargoReport/damage'
  const mirrorWith = (...ids) => ({ items: [{ rowId: 'r-1', photos: ids.map((id) => ({ id, width: 1, height: 1 })) }] })

  beforeEach(() => {
    mockAuthApi.verifyIdToken.mockResolvedValue({ ...LOGISTICA, role: 'tecnico' })
    mockStorageFile.getMetadata.mockResolvedValue([{ contentType: 'image/jpeg', size: '4' }])
    mockStorageFile.createReadStream.mockImplementation(() => Readable.from([Buffer.from('JPEG')]))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each(['tecnico', 'faturamento'])('%s com foto no espelho e na conferência: 200 (caminho vem da conferência)', async (role) => {
    mockAuthApi.verifyIdToken.mockResolvedValue({ ...LOGISTICA, role })
    mockDocs({ [MIRROR_PATH]: mirrorWith('bbb'), [CONF_PATH]: conferenceWith({ 'r-1': ['aaa', 'bbb'] }) })
    const res = createRes()
    await downloadHandler(createReq(), res)
    await flush()
    expect(res.statusCode).toBe(200)
    expect(res.body()).toBe('JPEG')
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(mockBucket.file).toHaveBeenCalledWith(photoOf('bbb', 'r-1').thumbPath)
  })

  it('foto só no espelho (já removida da conferência): 404 sem tocar o Storage', async () => {
    mockDocs({ [MIRROR_PATH]: mirrorWith('bbb'), [CONF_PATH]: conferenceWith({ 'r-1': ['aaa'] }) })
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(404)
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('foto só na conferência (fora do espelho): 404 sem ler a conferência', async () => {
    const reads = []
    mockDocs({ [MIRROR_PATH]: mirrorWith('aaa'), [CONF_PATH]: conferenceWith({ 'r-1': ['aaa', 'bbb'] }) })
    const original = mockFirestoreApi.doc.getMockImplementation()
    mockFirestoreApi.doc.mockImplementation((path) => {
      reads.push(path)
      return original(path)
    })
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(404)
    expect(reads).toEqual([MIRROR_PATH])
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('sem espelho: 404 (a conferência nem é lida)', async () => {
    mockDocs({ [CONF_PATH]: conferenceWith({ 'r-1': ['bbb'] }) })
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(404)
    expect(res.jsonBody).toEqual({ error: 'not-found' })
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('arquivo sumido do Storage: 404', async () => {
    mockDocs({ [MIRROR_PATH]: mirrorWith('bbb'), [CONF_PATH]: conferenceWith({ 'r-1': ['bbb'] }) })
    mockStorageFile.getMetadata.mockRejectedValueOnce({ code: 404 })
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(404)
  })

  it('erro ao ler o espelho: 500 e o log traz só o código', async () => {
    mockDocs({}, { failOn: MIRROR_PATH })
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(500)
    const logged = JSON.stringify(mockLogger.error.mock.calls)
    expect(logged).toContain('unavailable')
    expect(logged).not.toContain('nota-secreta')
  })

  it.each([
    ['user', { ...LOGISTICA, role: 'user' }],
    ['compras', { ...LOGISTICA, role: 'compras' }],
    ['viewer', { ...LOGISTICA, role: 'viewer' }],
    ['técnico pendente', { ...LOGISTICA, role: 'tecnico', status: 'Pendente' }],
    ['técnico bloqueado', { ...LOGISTICA, role: 'tecnico', status: 'Bloqueado' }],
    ['técnico com e-mail externo', { ...LOGISTICA, role: 'tecnico', email: 'x@gmail.com' }],
  ])('%s -> 403 sem tocar o Firestore', async (_label, claims) => {
    mockAuthApi.verifyIdToken.mockResolvedValue(claims)
    mockDocs({ [MIRROR_PATH]: mirrorWith('bbb'), [CONF_PATH]: conferenceWith({ 'r-1': ['bbb'] }) })
    const res = createRes()
    await downloadHandler(createReq(), res)
    expect(res.statusCode).toBe(403)
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
  })

  it('admin e logística seguem sem espelho (comportamento da J1): 200 lendo só a conferência', async () => {
    for (const role of ['admin', 'logistica']) {
      mockAuthApi.verifyIdToken.mockResolvedValue({ ...LOGISTICA, role })
      mockDocs({ [CONF_PATH]: conferenceWith({ 'r-1': ['bbb'] }) })
      const res = createRes()
      await downloadHandler(createReq(), res)
      await flush()
      expect(res.statusCode).toBe(200)
      expect(mockFirestoreApi.doc).toHaveBeenCalledTimes(1)
      expect(mockFirestoreApi.doc).toHaveBeenCalledWith(CONF_PATH)
      mockFirestoreApi.doc.mockClear()
    }
  })

  it('query inválida de técnico: 400 sem tocar o Firestore', async () => {
    mockDocs({})
    const res = createRes()
    await downloadHandler(createReq({ query: { processId: '../users', photoId: 'bbb' } }), res)
    expect(res.statusCode).toBe(400)
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
  })
})

describe('syncCargoConferenceDamage: espelho cargoReport/damage (S10-J2)', () => {
  const CONF_PATH = 'processes/p1/cargoReport/conference'
  const CUR_PATH = 'processes/p1/cargoReport/current'
  const MIRROR_PATH = 'processes/p1/cargoReport/damage'
  const event = (before, after, processId = 'p1') => ({
    params: { processId },
    data: {
      before: { exists: before !== null, data: () => before ?? undefined },
      after: { exists: after !== null, data: () => after ?? undefined },
    },
  })
  const current = {
    expectedPallets: 25,
    rows: [CURRENT_ROW('r-1', { sqDescription: 'POLIOL' }), CURRENT_ROW('r-2')],
  }
  const closed = (extra = {}) => ({
    ...conferenceWith({ 'r-1': ['aaa', 'bbb'] }),
    status: 'fechada',
    revision: 5,
    closedDate: '2026-11-24',
    closedByName: 'Logi Um',
    receiptStatus: 'com_ressalva',
    palletsByRowId: { 'r-1': 10, 'r-2': 13 },
    ...extra,
  })
  const opened = (extra = {}) => ({ ...conferenceWith({ 'r-1': ['aaa', 'bbb'] }), status: 'aberta', revision: 4, ...extra })

  beforeEach(() => {
    mockStorageFile.delete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('aberta -> fechada: grava o espelho (set sem merge) com updatedAt do servidor e sem caminho de arquivo', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    await syncHandler(event(opened(), closed()))
    expect(sets).toHaveLength(1)
    expect(sets[0].path).toBe(MIRROR_PATH)
    expect(sets[0].data).toMatchObject({
      schemaVersion: 1,
      conferenceRevision: 5,
      closedDate: '2026-11-24',
      closedByName: 'Logi Um',
      receiptStatus: 'com_ressalva',
      pallets: { counted: 23, expected: 25 },
      itemCount: 1,
      photoCount: 2,
      updatedAt: 'SERVER_TIMESTAMP',
    })
    expect(sets[0].data.items[0].photos.map((photo) => photo.id)).toEqual(['aaa', 'bbb'])
    expect(JSON.stringify(sets[0].data)).not.toContain('cargo-conference')
    expect(mockFirestoreApi.set).not.toHaveBeenCalled()
  })

  it('o espelho não grava na conferência (sem laço): só o doc damage é escrito', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    await syncHandler(event(opened(), closed()))
    expect(sets.map((entry) => entry.path)).toEqual([MIRROR_PATH])
    expect(sets.some((entry) => entry.path === CONF_PATH)).toBe(false)
  })

  it('fechar sem avaria grava itemCount 0 (sobrescreve a avaria de um fechamento anterior)', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    await syncHandler(event(opened({ damageByRowId: {} }), closed({ damageByRowId: {} })))
    expect(sets).toHaveLength(1)
    expect(sets[0].data).toMatchObject({ itemCount: 0, photoCount: 0, items: [] })
  })

  it('fechada -> fechada na mesma revisão, reabrir e edição aberta: não grava nem lê o current', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    await syncHandler(event(closed(), closed()))
    await syncHandler(event(closed(), opened({ revision: 6 })))
    await syncHandler(event(opened(), opened({ revision: 5 })))
    expect(sets).toEqual([])
    expect(mockFirestoreApi.doc).not.toHaveBeenCalled()
  })

  it('fechada -> fechada com revisão nova (fechou de novo): regrava', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    await syncHandler(event(closed(), closed({ revision: 6 })))
    expect(sets).toHaveLength(1)
    expect(sets[0].data.conferenceRevision).toBe(6)
  })

  it('conferência criada já fechada (bundle antigo, sem before): grava o espelho e não roda a limpeza', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    await syncHandler(event(null, closed()))
    expect(sets).toHaveLength(1)
    expect(mockBucket.file).not.toHaveBeenCalled()
  })

  it('doc apagado (sem after): nada', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    await syncHandler(event(closed(), null))
    expect(sets).toEqual([])
  })

  it('reabrir e fechar de novo com foto removida no meio: o espelho novo não tem a foto, e a limpeza apaga o arquivo', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    const reopened = opened({ revision: 6 })
    const closedAgain = closed({ revision: 7, ...conferenceWith({ 'r-1': ['aaa'] }) })
    await syncHandler(event(reopened, closedAgain))
    expect(sets[0].data.items[0].photos.map((photo) => photo.id)).toEqual(['aaa'])
    const removed = photoOf('bbb', 'r-1')
    expect(mockBucket.file.mock.calls.map(([path]) => path).sort()).toEqual([removed.path, removed.thumbPath].sort())
  })

  it('limpeza e espelho são independentes: falha da limpeza não impede o espelho', async () => {
    const sets = mockDocs({ [CUR_PATH]: current })
    mockStorageFile.delete.mockRejectedValue(Object.assign(new Error('boom'), { code: 403 }))
    await syncHandler(event(opened(), closed({ ...conferenceWith({ 'r-1': ['aaa'] }) })))
    expect(sets).toHaveLength(1)
  })

  it.each([
    ['delete lança de forma síncrona (escapa do allSettled)', () => mockStorageFile.delete.mockImplementationOnce(() => {
      throw Object.assign(new Error('x segredo-do-storage'), { code: 'internal' })
    })],
    ['bucket.file() lança de forma síncrona', () => mockBucket.file.mockImplementationOnce(() => {
      throw Object.assign(new Error('x segredo-do-storage'), { code: 'internal' })
    })],
    ['getStorage().bucket() lança de forma síncrona (bucket padrão não configurado)', () => mockStorageApi.bucket.mockImplementationOnce(() => {
      throw Object.assign(new Error('x segredo-do-storage'), { code: 'internal' })
    })],
  ])('limpeza: %s -> o espelho ainda é gravado e o warn leva só processId e código', async (_label, breakStorage) => {
    const sets = mockDocs({ [CUR_PATH]: current })
    breakStorage()
    await expect(
      syncHandler(event(opened(), closed({ ...conferenceWith({ 'r-1': ['aaa'] }) })))
    ).resolves.toBeUndefined()
    expect(sets).toHaveLength(1)
    expect(sets[0].path).toBe(MIRROR_PATH)
    expect(sets[0].data.itemCount).toBe(1)
    const cleanupWarn = mockLogger.warn.mock.calls.find(([message]) => String(message).includes('limpar fotos'))
    expect(cleanupWarn).toBeDefined()
    expect(cleanupWarn[1]).toEqual({ processId: 'p1', error: 'internal' })
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain('segredo-do-storage')
  })

  it('falha ao ler o current ou ao gravar o espelho: só log com processId e código (sem texto de avaria)', async () => {
    mockDocs({}, { failOn: CUR_PATH })
    await expect(syncHandler(event(opened(), closed()))).resolves.toBeUndefined()
    mockFirestoreApi.doc.mockImplementation(() => ({
      get: vi.fn(async () => ({ exists: true, data: () => current })),
      set: vi.fn(async () => {
        throw Object.assign(new Error('Caixas molhadas nota-secreta'), { code: 'unavailable' })
      }),
    }))
    await expect(syncHandler(event(opened(), closed()))).resolves.toBeUndefined()
    const logged = JSON.stringify(mockLogger.warn.mock.calls)
    expect(logged).toContain('unavailable')
    expect(logged).toContain('p1')
    expect(logged).not.toContain('nota-secreta')
    expect(logged).not.toContain('Caixas molhadas')
  })

  it('current ausente: não grava o espelho (não apaga o anterior)', async () => {
    const sets = mockDocs({})
    await syncHandler(event(opened(), closed()))
    expect(sets).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalled()
  })
})
