// Fix admin-user-edit-permission-denied: o callable `adminUpdateUserClaims`
// passa a ser o UNICO escritor no caminho admin de `saveUser` (recebe
// name/area alem de role/status). O `setDoc` amplo que existia antes disparava
// permission-denied quando o doc-alvo divergia da allowlist de
// `isAdminUserFieldsUpdate` (rule). Este teste cobre o branch Firebase de
// `saveUser`: o callable e chamado com uid/role/status/name/area e o
// `setDoc` NAO e mais chamado nesse caminho.
//
// Environment: node (default do vitest.config.mjs para tests/services/**).

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCallable, mockUpdateClaims, mockSetDoc, mockDoc, mockCreateAuditEvent } = vi.hoisted(() => {
  return {
    mockGetCallable: vi.fn(),
    mockUpdateClaims: vi.fn(),
    mockSetDoc: vi.fn(),
    mockDoc: vi.fn(),
    mockCreateAuditEvent: vi.fn(),
  }
})

vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: true,
  firestore: {},
  getCallable: (...args) => mockGetCallable(...args),
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  doc: (...args) => mockDoc(...args),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  deleteDoc: vi.fn(),
}))

vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: (...args) => mockCreateAuditEvent(...args),
}))

import { saveUser } from '../../src/services/usersRepository'

beforeEach(() => {
  vi.clearAllMocks()
  mockDoc.mockReturnValue({ id: 'fake-doc-ref' })
  mockGetCallable.mockResolvedValue(mockUpdateClaims)
  mockUpdateClaims.mockResolvedValue({ data: { success: true } })
  mockCreateAuditEvent.mockResolvedValue(undefined)
})

describe('saveUser (branch Firebase, caminho admin)', () => {
  it('chama o callable com uid/role/status/name/area e NAO chama setDoc', async () => {
    const result = await saveUser({
      id: 'uid-alvo',
      name: 'Maria Souza',
      email: 'maria@sqquimica.com',
      area: 'Compras',
      role: 'logistica',
      status: 'Ativo',
    })

    expect(mockGetCallable).toHaveBeenCalledWith('adminUpdateUserClaims')
    expect(mockUpdateClaims).toHaveBeenCalledTimes(1)
    expect(mockUpdateClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'uid-alvo',
        role: 'logistica',
        status: 'Ativo',
        name: 'Maria Souza',
        area: 'Compras',
      })
    )
    expect(mockSetDoc).not.toHaveBeenCalled()
    expect(result.id).toBe('uid-alvo')
  })

  it('alvo sem notes/scopes no input nao dispara setDoc nem quebra o fluxo', async () => {
    await saveUser({
      id: 'uid-sem-extras',
      name: 'Joao Lima',
      email: 'joao@sqquimica.com',
      area: 'Logistica',
      role: 'user',
      status: 'Pendente',
      // sem notes, sem scopes
    })

    expect(mockUpdateClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'uid-sem-extras',
        role: 'user',
        status: 'Pendente',
        name: 'Joao Lima',
        area: 'Logistica',
      })
    )
    expect(mockSetDoc).not.toHaveBeenCalled()
    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
  })
})
