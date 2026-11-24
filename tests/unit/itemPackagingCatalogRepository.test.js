// S2 do Relatório de Carga: cobertura de `src/services/itemPackagingCatalogRepository.js`
// (trava otimista por `version`, formato do payload, uid do autor, auditoria melhor-esforço e
// fallback localStorage). Firestore mockado; as rules reais são exercidas em tests/firebase.
//
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { isFirebaseConfigured: true, uid: 'admin-uid' },
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  createAuditEvent: vi.fn(),
  transaction: { get: vi.fn(), set: vi.fn() },
}))

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return mocks.config.isFirebaseConfigured
  },
  firestore: { __fake: 'firestore' },
  get auth() {
    return mocks.config.uid ? { currentUser: { uid: mocks.config.uid } } : { currentUser: null }
  },
}))

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, collectionId, documentId) => ({ path: `${collectionId}/${documentId}` }),
  getDoc: (...args) => mocks.getDoc(...args),
  runTransaction: (...args) => mocks.runTransaction(...args),
  serverTimestamp: () => '__SERVER_TIMESTAMP__',
}))

vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: (...args) => mocks.createAuditEvent(...args),
}))

const {
  ITEM_PACKAGING_VERSION_CONFLICT_CODE,
  getItemPackagingCatalog,
  saveItemPackagingCatalog,
} = await import('../../src/services/itemPackagingCatalogRepository.js')

const ITEMS = [
  { code: 'MO5079', description: 'SEA THEICTA - BLD 5KG', packagingType: 'BALDE', netWeightKg: 5 },
  { code: 'AM9774', description: '2606 - AMOSTRA', packagingType: '', netWeightKg: null },
]

const input = (overrides = {}) => ({
  items: ITEMS,
  sourceFileName: 'FR.CMX.001.xlsx',
  sourceSheetName: 'Item x Emb.',
  sourceSha256: 'a'.repeat(64),
  expectedVersion: 3,
  summary: { added: 1, changed: 2, removed: 3 },
  ...overrides,
})

function snapshotOf(data) {
  return { exists: () => data !== undefined, data: () => data }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.config.isFirebaseConfigured = true
  mocks.config.uid = 'admin-uid'
  mocks.createAuditEvent.mockResolvedValue(undefined)
  mocks.transaction.get.mockResolvedValue(snapshotOf({ version: 3 }))
  mocks.runTransaction.mockImplementation(async (_db, callback) => callback(mocks.transaction))
})

describe('saveItemPackagingCatalog (Firestore)', () => {
  it('grava dentro de runTransaction, sem merge, com version = esperada + 1 e autoria do uid', async () => {
    const result = await saveItemPackagingCatalog(input(), { name: 'Lucas', email: 'lucas@sqquimica.com' })

    expect(result).toEqual({ version: 4, itemCount: 2 })
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.transaction.get).toHaveBeenCalledWith({ path: 'cargoReportCatalog/itemPackaging' })
    expect(mocks.transaction.set).toHaveBeenCalledTimes(1)

    const [ref, payload, options] = mocks.transaction.set.mock.calls[0]
    expect(ref).toEqual({ path: 'cargoReportCatalog/itemPackaging' })
    expect(options).toBeUndefined()
    expect(Object.keys(payload).sort()).toEqual(
      [
        'importedAt',
        'importedById',
        'importedByName',
        'itemCount',
        'items',
        'schemaVersion',
        'sourceFileName',
        'sourceSha256',
        'sourceSheetName',
        'version',
      ].sort()
    )
    expect(payload).toMatchObject({
      schemaVersion: 1,
      version: 4,
      itemCount: 2,
      items: ITEMS,
      sourceFileName: 'FR.CMX.001.xlsx',
      sourceSheetName: 'Item x Emb.',
      sourceSha256: 'a'.repeat(64),
      importedAt: '__SERVER_TIMESTAMP__',
      importedById: 'admin-uid',
      importedByName: 'Lucas',
    })
  })

  it('primeira importação: doc inexistente e expectedVersion 0 grava a versão 1', async () => {
    mocks.transaction.get.mockResolvedValue(snapshotOf(undefined))

    const result = await saveItemPackagingCatalog(input({ expectedVersion: 0 }), { name: 'Lucas' })

    expect(result.version).toBe(1)
    expect(mocks.transaction.set.mock.calls[0][1].version).toBe(1)
  })

  it('conflito: versão atual diferente da esperada lança catalog/version-conflict e não grava', async () => {
    mocks.transaction.get.mockResolvedValue(snapshotOf({ version: 4 }))

    await expect(saveItemPackagingCatalog(input(), { name: 'Lucas' })).rejects.toMatchObject({
      code: ITEM_PACKAGING_VERSION_CONFLICT_CODE,
    })
    expect(ITEM_PACKAGING_VERSION_CONFLICT_CODE).toBe('catalog/version-conflict')
    expect(mocks.transaction.set).not.toHaveBeenCalled()
    expect(mocks.createAuditEvent).not.toHaveBeenCalled()
  })

  it('conflito: tabela já existe mas a prévia foi feita sobre "sem tabela" (expectedVersion 0)', async () => {
    mocks.transaction.get.mockResolvedValue(snapshotOf({ version: 1 }))

    await expect(saveItemPackagingCatalog(input({ expectedVersion: 0 }), null)).rejects.toMatchObject({
      code: 'catalog/version-conflict',
    })
    expect(mocks.transaction.set).not.toHaveBeenCalled()
  })

  it('sem usuário autenticado: erro claro, sem abrir transação', async () => {
    mocks.config.uid = ''

    await expect(saveItemPackagingCatalog(input(), { name: 'Lucas' })).rejects.toThrow(/não autenticado/i)
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })

  it('nome do autor: usa o e-mail sem nome e corta em 120 caracteres', async () => {
    await saveItemPackagingCatalog(input(), { email: 'lucas@sqquimica.com' })
    expect(mocks.transaction.set.mock.calls[0][1].importedByName).toBe('lucas@sqquimica.com')

    await saveItemPackagingCatalog(input(), { name: 'N'.repeat(300) })
    expect(mocks.transaction.set.mock.calls[1][1].importedByName).toHaveLength(120)
  })

  it('auditoria: 1 evento com versão, contagens e arquivo', async () => {
    await saveItemPackagingCatalog(input(), { name: 'Lucas' })

    expect(mocks.createAuditEvent).toHaveBeenCalledTimes(1)
    expect(mocks.createAuditEvent).toHaveBeenCalledWith({
      action: 'Tabela Item x Emb. importada',
      actor: 'Lucas',
      target: 'Versão 4 · 2 itens · +1 novos · ~2 alterados · -3 removidos · FR.CMX.001.xlsx',
    })
  })

  it('falha da auditoria é ignorada (a tabela já foi gravada)', async () => {
    mocks.createAuditEvent.mockRejectedValue(new Error('audits indisponível'))

    await expect(saveItemPackagingCatalog(input(), { name: 'Lucas' })).resolves.toEqual({ version: 4, itemCount: 2 })
    expect(mocks.transaction.set).toHaveBeenCalledTimes(1)
  })
})

describe('getItemPackagingCatalog (Firestore)', () => {
  it('doc inexistente: versão 0 e lista vazia', async () => {
    mocks.getDoc.mockResolvedValue(snapshotOf(undefined))

    await expect(getItemPackagingCatalog()).resolves.toMatchObject({ exists: false, version: 0, items: [], itemCount: 0 })
  })

  it('normaliza itens com shape inesperado e converte o Timestamp', async () => {
    const importedAt = new Date('2026-11-23T19:40:00Z')
    mocks.getDoc.mockResolvedValue(
      snapshotOf({
        version: 3,
        items: [ITEMS[0], { code: 'ZZ0001' }, { code: 'ZZ0002', netWeightKg: 'abc' }],
        sourceFileName: 'a.xlsx',
        importedAt: { toDate: () => importedAt },
        importedById: 'u1',
        importedByName: 'Lucas',
      })
    )

    const catalog = await getItemPackagingCatalog()

    expect(catalog).toMatchObject({ exists: true, version: 3, itemCount: 3, importedAt, importedByName: 'Lucas' })
    expect(catalog.items[1]).toEqual({ code: 'ZZ0001', description: '', packagingType: '', netWeightKg: null })
    expect(catalog.items[2].netWeightKg).toBeNull()
  })
})

describe('modo local (Firebase não configurado)', () => {
  beforeEach(() => {
    mocks.config.isFirebaseConfigured = false
  })

  it('grava e lê em localStorage, sem tocar no Firestore', async () => {
    await expect(saveItemPackagingCatalog(input({ expectedVersion: 0 }), { name: 'Lucas' })).resolves.toEqual({
      version: 1,
      itemCount: 2,
    })

    const catalog = await getItemPackagingCatalog()
    expect(catalog).toMatchObject({ exists: true, version: 1, itemCount: 2, importedById: 'local' })
    expect(mocks.runTransaction).not.toHaveBeenCalled()
    expect(mocks.getDoc).not.toHaveBeenCalled()
  })

  it('mantém a trava de versão também no modo local', async () => {
    await saveItemPackagingCatalog(input({ expectedVersion: 0 }), { name: 'Lucas' })

    await expect(saveItemPackagingCatalog(input({ expectedVersion: 0 }), { name: 'Lucas' })).rejects.toMatchObject({
      code: 'catalog/version-conflict',
    })
  })

  it('sem nada gravado: tabela inexistente', async () => {
    await expect(getItemPackagingCatalog()).resolves.toMatchObject({ exists: false, version: 0 })
  })
})
