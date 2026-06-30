// Testes do callable adminCreateUser (S3 / custom claims).
//
// Estrategia de mock: todos os `vi.mock(...)` ficam ANTES do `import`
// estatico do codigo sob teste. O vitest 1.6+ hoista os `vi.mock` para
// o topo do arquivo, mas com `vi.hoisted` e factories o comportamento
// e' estavel e confiavel.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock factories (devem vir ANTES do `import` do codigo sob teste).
const { mockAuthApi, mockFirestoreApi, mockBatch } = vi.hoisted(() => ({
  mockAuthApi: {
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
  },
  mockFirestoreApi: {
    collection: vi.fn(),
    doc: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    add: vi.fn(),
    batch: vi.fn(),
    where: vi.fn(),
    FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP') },
  },
  mockBatch: {
    delete: vi.fn(),
    commit: vi.fn(),
  },
}))

vi.mock('firebase-admin/app', () => ({ initializeApp: () => undefined }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => mockAuthApi }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockFirestoreApi,
  FieldValue: mockFirestoreApi.FieldValue,
}))
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: vi.fn((opts, handler) => ({ __handler: typeof opts === 'function' ? opts : handler })),
  onDocumentUpdated: vi.fn((opts, handler) => ({ __handler: typeof opts === 'function' ? opts : handler })),
}))
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual('firebase-functions/v2/https')
  return {
    ...actual,
    onCall: vi.fn((opts, handler) => ({ __handler: typeof opts === 'function' ? opts : handler })),
    HttpsError: class HttpsError extends Error { constructor(c, m) { super(m); this.code = c } },
  }
})
vi.mock('firebase-functions/params', () => ({ defineSecret: vi.fn((n) => ({ name: n })) }))
vi.mock('firebase-functions/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }))

// Import estatico DEPOIS dos mocks. O vitest 1.6 ja' moveu os vi.mock
// para o topo do arquivo, entao o modulo carrega os mocks.
const { adminCreateUser } = await import('../../functions/index.js')

function getHandler(callable) {
  if (callable && typeof callable.__handler === 'function') return callable.__handler
  throw new Error('callable nao tem __handler — vi.mock nao foi aplicado')
}

const ACTOR_UID = 'admin-1'
const ACTOR_PROFILE = {
  uid: ACTOR_UID,
  name: 'Admin da Silva',
  email: 'admin@sqquimica.com',
  role: 'admin',
  status: 'Ativo',
}

let docRef

beforeEach(() => {
  vi.clearAllMocks()
  // Cria uma chain encadeavel: collection().doc().get() etc.
  // O `get` retorna o actorProfile por padrao — sobrescrito caso o teste queira outro.
  docRef = {
    get: vi.fn().mockResolvedValue({ exists: true, data: () => ACTOR_PROFILE }),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
  const collectionRef = {
    doc: vi.fn().mockReturnValue(docRef),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  }
  mockFirestoreApi.collection.mockReturnValue(collectionRef)
  mockFirestoreApi.doc.mockReturnValue(docRef)
  mockFirestoreApi.set.mockResolvedValue(undefined)
  mockFirestoreApi.get.mockResolvedValue({ exists: true, data: () => ACTOR_PROFILE })
  mockFirestoreApi.add.mockResolvedValue({ id: 'audit-id' })
  mockFirestoreApi.batch.mockReturnValue(mockBatch)
  mockBatch.commit.mockResolvedValue(undefined)
  mockBatch.delete.mockReturnValue(undefined)

  mockAuthApi.createUser.mockResolvedValue({ uid: 'new-uid-1' })
  mockAuthApi.setCustomUserClaims.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('adminCreateUser (S3 / custom claims)', () => {
  it('cria usuario + doc + setCustomUserClaims com role+status', async () => {
    const handler = getHandler(adminCreateUser)
    const auth = { uid: 'admin-1', token: { email: 'admin@sqquimica.com' } }

    const result = await handler({
      auth,
      data: {
        email: 'novo@sqquimica.com',
        password: 'senha-segura-123',
        name: 'Novo Funcionario',
        role: 'logistica',
        status: 'Ativo',
      },
    })

    expect(result).toEqual({ uid: 'new-uid-1', email: 'novo@sqquimica.com' })
    expect(mockAuthApi.createUser).toHaveBeenCalledWith({
      email: 'novo@sqquimica.com',
      password: 'senha-segura-123',
      displayName: 'Novo Funcionario',
      emailVerified: false,
    })

    // Doc Firestore criado via collection('users').doc(uid).set(...)
    expect(mockFirestoreApi.collection).toHaveBeenCalledWith('users')
    expect(docRef.set).toHaveBeenCalled()

    // S3: setCustomUserClaims chamado com role+status
    expect(mockAuthApi.setCustomUserClaims).toHaveBeenCalledWith('new-uid-1', {
      role: 'logistica',
      status: 'Ativo',
    })
  })

  it('rejeita email nao corporativo', async () => {
    const handler = getHandler(adminCreateUser)
    await expect(
      handler({
        auth: { uid: 'admin-1', token: { email: 'admin@sqquimica.com' } },
        data: { email: 'externo@gmail.com', password: 'senha-segura-123', name: 'X', role: 'user', status: 'Pendente' },
      })
    ).rejects.toThrow(/Use um email corporativo/)
    expect(mockAuthApi.createUser).not.toHaveBeenCalled()
    expect(mockAuthApi.setCustomUserClaims).not.toHaveBeenCalled()
  })

  it('rejeita role invalida', async () => {
    const handler = getHandler(adminCreateUser)
    await expect(
      handler({
        auth: { uid: 'admin-1', token: { email: 'admin@sqquimica.com' } },
        data: { email: 'novo@sqquimica.com', password: 'senha-segura-123', name: 'X', role: 'root', status: 'Ativo' },
      })
    ).rejects.toThrow(/Perfil de usuario invalido/)
    expect(mockAuthApi.setCustomUserClaims).not.toHaveBeenCalled()
  })

  it('rejeita status invalido', async () => {
    const handler = getHandler(adminCreateUser)
    await expect(
      handler({
        auth: { uid: 'admin-1', token: { email: 'admin@sqquimica.com' } },
        data: { email: 'novo@sqquimica.com', password: 'senha-segura-123', name: 'X', role: 'user', status: 'invalido' },
      })
    ).rejects.toThrow(/Status de usuario invalido/)
  })

  it('rejeita senha curta', async () => {
    const handler = getHandler(adminCreateUser)
    await expect(
      handler({
        auth: { uid: 'admin-1', token: { email: 'admin@sqquimica.com' } },
        data: { email: 'novo@sqquimica.com', password: '123', name: 'X', role: 'user', status: 'Pendente' },
      })
    ).rejects.toThrow(/pelo menos 6 caracteres/)
  })

  it('aplica defaults (role=user, status=Pendente) se nao vierem no payload', async () => {
    const handler = getHandler(adminCreateUser)
    await handler({
      auth: { uid: 'admin-1', token: { email: 'admin@sqquimica.com' } },
      data: { email: 'novo@sqquimica.com', password: 'senha-segura-123', name: 'Novo' },
    })
    expect(mockAuthApi.setCustomUserClaims).toHaveBeenCalledWith('new-uid-1', {
      role: 'user',
      status: 'Pendente',
    })
  })
})
