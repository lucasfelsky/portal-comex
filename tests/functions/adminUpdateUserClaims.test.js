// Testes do callable adminUpdateUserClaims (Sprint 5.1 / S3).
//
// Cobre:
//   - Validacao de payload (uid, role, status, pelo menos um dos dois)
//   - Bloqueio de autobloqueio do admin
//   - Update de Firestore (com statusTone e metadata)
//   - setCustomUserClaims com valores normalizados
//   - 404 quando uid nao existe
//   - Preservacao de role/status quando apenas um e' enviado

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock factories (DEVEM vir antes do import do modulo sob teste).
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
vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((opts, handler) => ({ __handler: typeof opts === 'function' ? opts : handler })),
  HttpsError: class HttpsError extends Error { constructor(c, m) { super(m); this.code = c } },
}))
vi.mock('firebase-functions/params', () => ({ defineSecret: vi.fn((n) => ({ name: n })) }))
vi.mock('firebase-functions/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }))

const { adminUpdateUserClaims } = await import('../../functions/index.js')

const ACTOR_UID = 'admin-1'
const ACTOR_PROFILE = {
  uid: ACTOR_UID,
  name: 'Admin da Silva',
  email: 'admin@sqquimica.com',
  role: 'admin',
  status: 'Ativo',
}

const TARGET_UID = 'target-uid'
const TARGET_PROFILE_BASE = {
  uid: TARGET_UID,
  role: 'user',
  status: 'Pendente',
  name: 'Target User',
}

let actorDocRef
let targetDocRef

function buildDocRef(existing) {
  return {
    get: vi.fn().mockResolvedValue({ exists: !!existing, data: () => existing }),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  actorDocRef = buildDocRef(ACTOR_PROFILE)
  targetDocRef = buildDocRef(TARGET_PROFILE_BASE)
  // collection('users').doc(...) — alterna entre actor/target conforme uid
  const collectionRef = {
    doc: vi.fn().mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef)),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  }
  mockFirestoreApi.collection.mockReturnValue(collectionRef)
  mockFirestoreApi.doc.mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef))
  mockFirestoreApi.set.mockResolvedValue(undefined)
  mockFirestoreApi.add.mockResolvedValue({ id: 'audit-id' })
  mockFirestoreApi.batch.mockReturnValue(mockBatch)
  mockBatch.commit.mockResolvedValue(undefined)
  mockBatch.delete.mockReturnValue(undefined)
  mockAuthApi.setCustomUserClaims.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function getHandler(callable) {
  if (callable && typeof callable.__handler === 'function') return callable.__handler
  throw new Error('callable nao tem __handler')
}

const authCtx = {
  uid: ACTOR_UID,
  token: { email: 'admin@sqquimica.com' },
  name: 'Admin da Silva',
  email: 'admin@sqquimica.com',
  role: 'admin',
  status: 'Ativo',
}

describe('adminUpdateUserClaims (S3)', () => {
  it('atualiza role E status, gravando no Firestore e claims', async () => {
    const handler = getHandler(adminUpdateUserClaims)
    const result = await handler({
      auth: authCtx,
      data: { uid: TARGET_UID, role: 'logistica', status: 'Ativo' },
    })

    expect(result).toEqual({ uid: TARGET_UID, role: 'logistica', status: 'Ativo' })
    expect(targetDocRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'logistica',
        status: 'Ativo',
        statusTone: 'ok',
        updatedById: ACTOR_UID,
        updatedByName: 'Admin da Silva',
      }),
      { merge: true }
    )
    expect(mockAuthApi.setCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      role: 'logistica',
      status: 'Ativo',
    })
  })

  it('preserva role ao atualizar apenas status', async () => {
    targetDocRef = buildDocRef({ ...TARGET_PROFILE_BASE, role: 'user', status: 'Pendente' })
    mockFirestoreApi.doc.mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef))
    const collectionRef = {
      doc: vi.fn().mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef)),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }
    mockFirestoreApi.collection.mockReturnValue(collectionRef)

    const handler = getHandler(adminUpdateUserClaims)
    const result = await handler({
      auth: authCtx,
      data: { uid: TARGET_UID, status: 'Ativo' },
    })

    expect(result.role).toBe('user')
    expect(result.status).toBe('Ativo')
    expect(mockAuthApi.setCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      role: 'user',
      status: 'Ativo',
    })
  })

  it('preserva status ao atualizar apenas role', async () => {
    targetDocRef = buildDocRef({ ...TARGET_PROFILE_BASE, role: 'user', status: 'Ativo' })
    mockFirestoreApi.doc.mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef))
    const collectionRef = {
      doc: vi.fn().mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef)),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }
    mockFirestoreApi.collection.mockReturnValue(collectionRef)

    const handler = getHandler(adminUpdateUserClaims)
    const result = await handler({
      auth: authCtx,
      data: { uid: TARGET_UID, role: 'admin' },
    })

    expect(result.role).toBe('admin')
    expect(result.status).toBe('Ativo')
  })

  it('rejeita payload sem role e sem status', async () => {
    const handler = getHandler(adminUpdateUserClaims)
    await expect(
      handler({ auth: authCtx, data: { uid: TARGET_UID } })
    ).rejects.toThrow(/role e\/ou status/)
    expect(mockAuthApi.setCustomUserClaims).not.toHaveBeenCalled()
  })

  it('rejeita role invalida', async () => {
    const handler = getHandler(adminUpdateUserClaims)
    await expect(
      handler({ auth: authCtx, data: { uid: TARGET_UID, role: 'root' } })
    ).rejects.toThrow(/Perfil de usuario invalido/)
  })

  it('rejeita status invalido', async () => {
    const handler = getHandler(adminUpdateUserClaims)
    await expect(
      handler({ auth: authCtx, data: { uid: TARGET_UID, status: 'pend' } })
    ).rejects.toThrow(/Status de usuario invalido/)
  })

  it('bloqueia admin de se autobloquear', async () => {
    const handler = getHandler(adminUpdateUserClaims)
    await expect(
      handler({ auth: authCtx, data: { uid: ACTOR_UID, status: 'Bloqueado' } })
    ).rejects.toThrow(/Nao e permitido bloquear o proprio usuario/)
    expect(mockAuthApi.setCustomUserClaims).not.toHaveBeenCalled()
  })

  it('admin pode atualizar o proprio role (rebaixamento permitido se nao for autobloqueio)', async () => {
    const handler = getHandler(adminUpdateUserClaims)
    await handler({ auth: authCtx, data: { uid: ACTOR_UID, role: 'user' } })
    // O role do proprio admin foi rebaixado para 'user' — permitido.
    expect(mockAuthApi.setCustomUserClaims).toHaveBeenCalledWith(ACTOR_UID, {
      role: 'user',
      status: 'Ativo',
    })
  })

  it('retorna 404 quando uid nao existe em users', async () => {
    const ghostRef = buildDocRef(null)
    mockFirestoreApi.doc.mockImplementation((uid) => {
      if (uid === ACTOR_UID) return actorDocRef
      if (uid === TARGET_UID) return targetDocRef
      return ghostRef
    })
    const collectionRef = {
      doc: vi.fn().mockImplementation(mockFirestoreApi.doc),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }
    mockFirestoreApi.collection.mockReturnValue(collectionRef)

    const handler = getHandler(adminUpdateUserClaims)
    await expect(
      handler({ auth: authCtx, data: { uid: 'fantasma', status: 'Ativo' } })
    ).rejects.toThrow(/Usuario nao encontrado/)
  })

  it('rejeita uid vazio', async () => {
    const handler = getHandler(adminUpdateUserClaims)
    await expect(
      handler({ auth: authCtx, data: { uid: '', status: 'Ativo' } })
    ).rejects.toThrow(/UID do usuario e obrigatorio/)
  })

  it('adminUpdateUserClaims: set no Firestore obedece ao contrato de 6 campos (Sprint 5.1 / L18)', async () => {
    // A rule `isAdminUserFieldsUpdate` exige que o write no Firestore
    // altere SOMENTE os 6 campos: role, status, statusTone, updatedAt,
    // updatedById, updatedByName. Se o callable enviar outros campos,
    // a rule bloqueia. Aqui validamos o contrato no codigo.
    const handler = getHandler(adminUpdateUserClaims)
    await handler({
      auth: authCtx,
      data: { uid: TARGET_UID, role: 'logistica', status: 'Ativo' },
    })

    expect(targetDocRef.set).toHaveBeenCalledTimes(1)
    const [payload, options] = targetDocRef.set.mock.calls[0]

    // 6 campos editados (incluindo updatedAt que vem de FieldValue.serverTimestamp()).
    const editedKeys = Object.keys(payload).sort()
    expect(editedKeys).toEqual(
      expect.arrayContaining(['role', 'status', 'statusTone', 'updatedAt', 'updatedById', 'updatedByName'])
    )
    // Nenhum campo extra (ex.: nao podemos ter 'name', 'email', 'area' no payload).
    const allowed = new Set(['role', 'status', 'statusTone', 'updatedAt', 'updatedById', 'updatedByName'])
    for (const key of editedKeys) {
      expect(allowed.has(key), `campo extra ${key} no payload de adminUpdateUserClaims`).toBe(true)
    }
    // options = { merge: true } para nao sobrescrever o doc inteiro.
    expect(options).toEqual({ merge: true })
    // updatedById e updatedByName vem do actor (auth context).
    expect(payload.updatedById).toBe(ACTOR_UID)
    expect(payload.updatedByName).toBe('Admin da Silva')
  })

  it('normaliza status com capitalizacao (Ativo/Bloqueado/Reprovado/Pendente)', async () => {
    targetDocRef = buildDocRef({ ...TARGET_PROFILE_BASE, role: 'user', status: 'Ativo' })
    mockFirestoreApi.doc.mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef))
    const collectionRef = {
      doc: vi.fn().mockImplementation((uid) => (uid === ACTOR_UID ? actorDocRef : targetDocRef)),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }
    mockFirestoreApi.collection.mockReturnValue(collectionRef)

    const handler = getHandler(adminUpdateUserClaims)
    await handler({ auth: authCtx, data: { uid: TARGET_UID, status: 'Reprovado' } })
    expect(mockAuthApi.setCustomUserClaims).toHaveBeenCalledWith(TARGET_UID, {
      role: 'user',
      status: 'Reprovado',
    })
  })
})
