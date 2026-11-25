// S9-A: `loadErpProcessReference` (referencia de UM processo para o Relatorio de
// Carga). OBRIGATORIO mockar Firebase: sem isso um teste que escapasse falaria com
// o projeto real. Mesmo padrao de tests/services/erpReferenceRepository.test.js.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDoc, mockGetDoc, mockGetDocs, state } = vi.hoisted(() => ({
  mockDoc: vi.fn((_db, collectionName, id) => ({ path: `${collectionName}/${id}` })),
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  state: { configured: true, docs: {} },
}))

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return state.configured
  },
  firestore: {},
  auth: { currentUser: null },
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
}))

vi.mock('../../src/services/auditRepository', () => ({ createAuditEvent: vi.fn() }))

import { loadErpProcessReference } from '../../src/services/erpReferenceRepository'

const SNAPSHOT_ID = 'SNAPSHOT-ATUAL'
const LATEST_PATH = 'erpSnapshots/latest'

const snap = (data) => ({ exists: () => data !== undefined, data: () => data })

function setDocs(docs) {
  state.docs = docs
  mockGetDoc.mockImplementation(async (ref) => snap(state.docs[ref.path]))
}

const latest = (overrides = {}) => ({
  snapshotId: SNAPSHOT_ID,
  updatedAt: { toMillis: () => 1760000000000 },
  hints: 3,
  ...overrides,
})

const hint = (overrides = {}) => ({
  snapshotId: SNAPSHOT_ID,
  matchRule: 'pedido',
  shipment: {
    kind: 'FCL',
    items: [{ commercialName: 'RESINA OMEGA', pedido: '9000', quantityKg: 1000, sqCode: 'SQ-1', supplierRef: 'REF 1', itemId: 'IT-1' }],
  },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  state.configured = true
  setDocs({})
})

describe('loadErpProcessReference', () => {
  it('hint do mesmo snapshot: devolve snapshot, hint normalizado e stale = false (2 leituras)', async () => {
    setDocs({ [LATEST_PATH]: latest(), 'erpProcessHints/proc-1': hint() })
    const result = await loadErpProcessReference('proc-1')
    expect(result.stale).toBe(false)
    expect(result.snapshot).toEqual({ snapshotId: SNAPSHOT_ID, updatedAtMs: 1760000000000 })
    expect(result.hint.snapshotId).toBe(SNAPSHOT_ID)
    expect(result.hint.matchRule).toBe('pedido')
    expect(result.hint.shipment.items).toEqual([
      { commercialName: 'RESINA OMEGA', pedido: '9000', quantityKg: 1000, sqCode: 'SQ-1', supplierRef: 'REF 1', itemId: 'IT-1' },
    ])
    // Passou por toErpReferenceShipment: o recorte completo tem as 12 chaves.
    expect(Object.keys(result.hint.shipment)).toHaveLength(12)
    expect(mockGetDoc).toHaveBeenCalledTimes(2)
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(mockGetDoc.mock.calls.map(([ref]) => ref.path)).toEqual([LATEST_PATH, 'erpProcessHints/proc-1'])
  })

  it('hint antigo (sem os campos novos) normaliza com "" nos 3', async () => {
    setDocs({
      [LATEST_PATH]: latest(),
      'erpProcessHints/proc-1': hint({ shipment: { items: [{ commercialName: 'RESINA', pedido: '9', quantityKg: 5 }] } }),
    })
    const result = await loadErpProcessReference('proc-1')
    expect(result.hint.shipment.items[0]).toMatchObject({ sqCode: '', supplierRef: '', itemId: '' })
  })

  it('hint de outro snapshot: hint = null e stale = true', async () => {
    setDocs({ [LATEST_PATH]: latest(), 'erpProcessHints/proc-1': hint({ snapshotId: 'SNAPSHOT-VELHO' }) })
    const result = await loadErpProcessReference('proc-1')
    expect(result).toEqual({ snapshot: { snapshotId: SNAPSHOT_ID, updatedAtMs: 1760000000000 }, hint: null, stale: true })
  })

  it('processo sem hint: hint = null e stale = false', async () => {
    setDocs({ [LATEST_PATH]: latest() })
    const result = await loadErpProcessReference('proc-1')
    expect(result).toEqual({ snapshot: { snapshotId: SNAPSHOT_ID, updatedAtMs: 1760000000000 }, hint: null, stale: false })
  })

  it('sem `latest` (ou com snapshotId vazio): null e nao le o hint', async () => {
    setDocs({ 'erpProcessHints/proc-1': hint() })
    expect(await loadErpProcessReference('proc-1')).toBeNull()
    expect(mockGetDoc).toHaveBeenCalledTimes(1)
    setDocs({ [LATEST_PATH]: latest({ snapshotId: '' }), 'erpProcessHints/proc-1': hint() })
    expect(await loadErpProcessReference('proc-1')).toBeNull()
  })

  it('`updatedAt` sem toMillis vira updatedAtMs = null', async () => {
    setDocs({ [LATEST_PATH]: latest({ updatedAt: null }) })
    expect((await loadErpProcessReference('proc-1')).snapshot.updatedAtMs).toBeNull()
  })

  it('sem Firebase configurado, ou com id vazio/invalido: null e nenhuma leitura', async () => {
    state.configured = false
    expect(await loadErpProcessReference('proc-1')).toBeNull()
    state.configured = true
    expect(await loadErpProcessReference('')).toBeNull()
    expect(await loadErpProcessReference('   ')).toBeNull()
    expect(await loadErpProcessReference(undefined)).toBeNull()
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('o erro de leitura do Firestore (ex.: sem permissao) sobe para quem chamou', async () => {
    mockGetDoc.mockRejectedValue(new Error('permission-denied'))
    await expect(loadErpProcessReference('proc-1')).rejects.toThrow('permission-denied')
  })
})
