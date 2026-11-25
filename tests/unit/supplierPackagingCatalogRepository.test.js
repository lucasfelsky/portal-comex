// S9-D do Relatório de Carga: cobertura de `src/services/supplierPackagingCatalogRepository.js` (trava otimista por
// `version`, formato do payload, uid do autor, "Cadastrar para" sobre a versão atual, auditoria melhor-esforço e
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
  SUPPLIER_PACKAGING_LIMIT_CODE,
  SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE,
  getSupplierPackagingCatalog,
  saveSupplierPackagingCatalog,
  upsertSupplierPackagingEntry,
} = await import('../../src/services/supplierPackagingCatalogRepository.js')

const GOOYER = {
  code: 'BA5012',
  supplierKey: 'GOOYER CHEMICALS LTD',
  supplierName: 'Gooyer Chemicals Ltd',
  packagingType: 'TAMBOR',
  netWeightKg: 200,
  packageWeightKg: 9.2,
}
const DEFAULT_TARE = {
  code: 'BA5033',
  supplierKey: '',
  supplierName: '',
  packagingType: '',
  netWeightKg: null,
  packageWeightKg: 1.1,
}
const ALIASES = [{ fromKey: 'GOOYER CHEMICAL CO', toKey: 'GOOYER CHEMICALS LTD' }]

function snapshotOf(data) {
  return { exists: () => data !== undefined, data: () => data }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.config.isFirebaseConfigured = true
  mocks.config.uid = 'admin-uid'
  mocks.createAuditEvent.mockResolvedValue(undefined)
  mocks.transaction.get.mockResolvedValue(snapshotOf({ version: 3, entries: [GOOYER, DEFAULT_TARE], aliases: ALIASES }))
  mocks.runTransaction.mockImplementation(async (_db, callback) => callback(mocks.transaction))
})

describe('saveSupplierPackagingCatalog (Firestore)', () => {
  it('grava dentro de runTransaction, sem merge, com version = esperada + 1, 8 chaves e autoria do uid', async () => {
    const result = await saveSupplierPackagingCatalog(
      { entries: [GOOYER, DEFAULT_TARE], aliases: ALIASES },
      { expectedVersion: 3, actor: { name: 'Lucas', email: 'lucas@sqquimica.com' } }
    )

    expect(result).toMatchObject({ exists: true, version: 4, entryCount: 2, aliases: ALIASES })
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.transaction.get).toHaveBeenCalledWith({ path: 'cargoReportCatalog/supplierPackaging' })
    expect(mocks.transaction.set).toHaveBeenCalledTimes(1)

    const [ref, payload, options] = mocks.transaction.set.mock.calls[0]
    expect(ref).toEqual({ path: 'cargoReportCatalog/supplierPackaging' })
    expect(options).toBeUndefined()
    expect(Object.keys(payload).sort()).toEqual(
      ['aliases', 'entries', 'entryCount', 'schemaVersion', 'updatedAt', 'updatedById', 'updatedByName', 'version'].sort()
    )
    expect(payload).toMatchObject({
      schemaVersion: 1,
      version: 4,
      entryCount: 2,
      entries: [GOOYER, DEFAULT_TARE],
      aliases: ALIASES,
      updatedAt: '__SERVER_TIMESTAMP__',
      updatedById: 'admin-uid',
      updatedByName: 'Lucas',
    })
    expect(Object.keys(payload.entries[0])).toHaveLength(6)
  })

  it('primeira gravação: doc inexistente e expectedVersion 0 grava a versão 1', async () => {
    mocks.transaction.get.mockResolvedValue(snapshotOf(undefined))
    const result = await saveSupplierPackagingCatalog({ entries: [GOOYER], aliases: [] }, { expectedVersion: 0 })
    expect(result.version).toBe(1)
    expect(mocks.transaction.set.mock.calls[0][1].version).toBe(1)
  })

  it('conflito: versão atual diferente da esperada lança catalog/version-conflict e não grava', async () => {
    mocks.transaction.get.mockResolvedValue(snapshotOf({ version: 4 }))

    await expect(
      saveSupplierPackagingCatalog({ entries: [GOOYER], aliases: [] }, { expectedVersion: 3, actor: { name: 'Lucas' } })
    ).rejects.toMatchObject({ code: SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE })
    expect(SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE).toBe('catalog/version-conflict')
    expect(mocks.transaction.set).not.toHaveBeenCalled()
    expect(mocks.createAuditEvent).not.toHaveBeenCalled()
  })

  it('conflito: cadastro já existe mas a prévia foi feita sobre "sem cadastro" (expectedVersion 0)', async () => {
    mocks.transaction.get.mockResolvedValue(snapshotOf({ version: 1 }))
    await expect(saveSupplierPackagingCatalog({ entries: [], aliases: [] }, { expectedVersion: 0 })).rejects.toMatchObject({
      code: 'catalog/version-conflict',
    })
  })

  it('sem usuário autenticado: erro claro, sem abrir transação', async () => {
    mocks.config.uid = ''
    await expect(saveSupplierPackagingCatalog({ entries: [], aliases: [] }, { expectedVersion: 3 })).rejects.toThrow(
      /não autenticado/i
    )
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })

  it('tetos: mais de 5.000 entradas ou de 1.000 aliases recusa antes de abrir a transação', async () => {
    const many = Array.from({ length: 5001 }, (_, index) => ({ ...GOOYER, code: `A${index}` }))
    await expect(saveSupplierPackagingCatalog({ entries: many, aliases: [] }, { expectedVersion: 3 })).rejects.toMatchObject({
      code: SUPPLIER_PACKAGING_LIMIT_CODE,
    })
    const aliases = Array.from({ length: 1001 }, (_, index) => ({ fromKey: `A${index}`, toKey: 'B' }))
    await expect(saveSupplierPackagingCatalog({ entries: [], aliases }, { expectedVersion: 3 })).rejects.toMatchObject({
      code: 'catalog/limit',
    })
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })

  it('nome do autor: usa o e-mail sem nome e corta em 120 caracteres', async () => {
    await saveSupplierPackagingCatalog({ entries: [], aliases: [] }, { expectedVersion: 3, actor: { email: 'lucas@sqquimica.com' } })
    expect(mocks.transaction.set.mock.calls[0][1].updatedByName).toBe('lucas@sqquimica.com')
    await saveSupplierPackagingCatalog({ entries: [], aliases: [] }, { expectedVersion: 3, actor: { name: 'N'.repeat(300) } })
    expect(mocks.transaction.set.mock.calls[1][1].updatedByName).toHaveLength(120)
  })

  it('auditoria: 1 evento com versão e contagens; a falha da auditoria é ignorada', async () => {
    await saveSupplierPackagingCatalog(
      { entries: [GOOYER, DEFAULT_TARE], aliases: ALIASES },
      { expectedVersion: 3, actor: { name: 'Lucas' }, summary: { added: 1, changed: 2, removed: 3 } }
    )
    expect(mocks.createAuditEvent).toHaveBeenCalledWith({
      action: 'Embalagens por fornecedor atualizadas',
      actor: 'Lucas',
      target: 'Versão 4 · 2 embalagens · 1 nomes juntados · +1 novas · ~2 alteradas · -3 removidas',
    })

    mocks.createAuditEvent.mockRejectedValue(new Error('audits indisponível'))
    await expect(
      saveSupplierPackagingCatalog({ entries: [], aliases: [] }, { expectedVersion: 3, actor: { name: 'Lucas' } })
    ).resolves.toMatchObject({ version: 4 })
  })
})

describe('upsertSupplierPackagingEntry ("Cadastrar para <fornecedor>")', () => {
  const NEW_ENTRY = { ...GOOYER, code: 'BA5190', packageWeightKg: 9.5 }

  it('acrescenta UMA entrada sobre a versão atual, preservando as demais e os aliases (version + 1)', async () => {
    const result = await upsertSupplierPackagingEntry(NEW_ENTRY, { name: 'Lucas' })

    expect(mocks.runTransaction).toHaveBeenCalledTimes(1)
    const payload = mocks.transaction.set.mock.calls[0][1]
    expect(payload.version).toBe(4)
    expect(payload.entries).toEqual([GOOYER, DEFAULT_TARE, NEW_ENTRY])
    expect(payload.entryCount).toBe(3)
    expect(payload.aliases).toEqual(ALIASES)
    expect(payload.updatedById).toBe('admin-uid')
    expect(result).toMatchObject({ exists: true, version: 4, entryCount: 3 })
    expect(result.entries[2]).toEqual(NEW_ENTRY)
  })

  it('troca a entrada de mesmo código + fornecedor em vez de duplicar', async () => {
    await upsertSupplierPackagingEntry({ ...GOOYER, packageWeightKg: 10 }, { name: 'Lucas' })
    const { entries } = mocks.transaction.set.mock.calls[0][1]
    expect(entries).toHaveLength(2)
    expect(entries[0].packageWeightKg).toBe(10)
  })

  it('cadastro ainda inexistente: cria a versão 1', async () => {
    mocks.transaction.get.mockResolvedValue(snapshotOf(undefined))
    await upsertSupplierPackagingEntry(NEW_ENTRY, { name: 'Lucas' })
    const payload = mocks.transaction.set.mock.calls[0][1]
    expect(payload).toMatchObject({ version: 1, entries: [NEW_ENTRY], aliases: [] })
  })

  it('teto de 5.000 entradas: lança catalog/limit e não grava', async () => {
    const full = Array.from({ length: 5000 }, (_, index) => ({ ...GOOYER, code: `A${index}` }))
    mocks.transaction.get.mockResolvedValue(snapshotOf({ version: 3, entries: full, aliases: [] }))
    await expect(upsertSupplierPackagingEntry(NEW_ENTRY, { name: 'Lucas' })).rejects.toMatchObject({
      code: SUPPLIER_PACKAGING_LIMIT_CODE,
    })
    expect(mocks.transaction.set).not.toHaveBeenCalled()
  })

  it('sem usuário autenticado: erro claro; auditoria com código, fornecedor e versão', async () => {
    await upsertSupplierPackagingEntry(NEW_ENTRY, { name: 'Lucas' })
    expect(mocks.createAuditEvent).toHaveBeenCalledWith({
      action: 'Embalagem por fornecedor cadastrada',
      actor: 'Lucas',
      target: 'BA5190 · Gooyer Chemicals Ltd · versão 4',
    })

    mocks.config.uid = ''
    await expect(upsertSupplierPackagingEntry(NEW_ENTRY, { name: 'Lucas' })).rejects.toThrow(/não autenticado/i)
  })
})

describe('getSupplierPackagingCatalog (Firestore)', () => {
  it('doc inexistente: versão 0 e listas vazias', async () => {
    mocks.getDoc.mockResolvedValue(snapshotOf(undefined))
    await expect(getSupplierPackagingCatalog()).resolves.toMatchObject({
      exists: false,
      version: 0,
      entries: [],
      entryCount: 0,
      aliases: [],
    })
  })

  it('normaliza entradas e aliases com shape inesperado e converte o Timestamp', async () => {
    const updatedAt = new Date('2026-11-25T10:00:00Z')
    mocks.getDoc.mockResolvedValue(
      snapshotOf({
        version: 2,
        entries: [GOOYER, { code: 'ZZ0001' }, { code: 'ZZ0002', netWeightKg: 'abc', packageWeightKg: 3 }],
        aliases: [ALIASES[0], null],
        updatedAt: { toDate: () => updatedAt },
        updatedById: 'u1',
        updatedByName: 'Lucas',
      })
    )

    const catalog = await getSupplierPackagingCatalog()

    expect(catalog).toMatchObject({ exists: true, version: 2, entryCount: 3, updatedAt, updatedByName: 'Lucas' })
    expect(catalog.entries[1]).toEqual({
      code: 'ZZ0001',
      supplierKey: '',
      supplierName: '',
      packagingType: '',
      netWeightKg: null,
      packageWeightKg: null,
    })
    expect(catalog.entries[2]).toMatchObject({ netWeightKg: null, packageWeightKg: 3 })
    expect(catalog.aliases).toEqual([ALIASES[0], { fromKey: '', toKey: '' }])
  })

  it('leitura negada (rules ainda não publicadas) propaga o erro: quem lê decide cair no padrão do item', async () => {
    mocks.getDoc.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    await expect(getSupplierPackagingCatalog()).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('modo local (Firebase não configurado)', () => {
  beforeEach(() => {
    mocks.config.isFirebaseConfigured = false
  })

  it('grava e lê em localStorage, sem tocar no Firestore', async () => {
    await expect(
      saveSupplierPackagingCatalog({ entries: [GOOYER], aliases: ALIASES }, { expectedVersion: 0, actor: { name: 'Lucas' } })
    ).resolves.toMatchObject({ version: 1, entryCount: 1 })

    const catalog = await getSupplierPackagingCatalog()
    expect(catalog).toMatchObject({ exists: true, version: 1, entryCount: 1, aliases: ALIASES, updatedById: 'local' })
    expect(mocks.runTransaction).not.toHaveBeenCalled()
    expect(mocks.getDoc).not.toHaveBeenCalled()
  })

  it('mantém a trava de versão e o "Cadastrar para" soma sobre o que já existe', async () => {
    await saveSupplierPackagingCatalog({ entries: [GOOYER], aliases: [] }, { expectedVersion: 0 })
    await expect(saveSupplierPackagingCatalog({ entries: [], aliases: [] }, { expectedVersion: 0 })).rejects.toMatchObject({
      code: 'catalog/version-conflict',
    })

    const saved = await upsertSupplierPackagingEntry({ ...GOOYER, code: 'BA5190' }, { name: 'Lucas' })
    expect(saved).toMatchObject({ version: 2, entryCount: 2 })
    expect((await getSupplierPackagingCatalog()).entries.map((entry) => entry.code)).toEqual(['BA5012', 'BA5190'])
  })

  it('JSON corrompido no localStorage vira "sem cadastro"', async () => {
    window.localStorage.setItem('sq-comex-supplier-packaging-catalog', '{nao e json')
    await expect(getSupplierPackagingCatalog()).resolves.toMatchObject({ exists: false })
  })
})
