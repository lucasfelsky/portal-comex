// Tests do AuthContext (S3 / custom claims).
// Cobre: fluxo de login, perfil derivado de claims, forceClaimsRefresh,
// normalizacao de status, guard de email corporativo, refresh, logout.
//
// Environment: jsdom (configurado via setup-ui.js + comment no topo).

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import React from 'react'

// --- Mocks de firebase/auth e firebase/firestore/lite ---
// Estrategia: mockar ANTES de importar AuthContext.
// O vitest 1.6+ faz hoisting de vi.mock quando ha factory function; aqui usamos
// vi.hoisted para os spies que precisam ser referenciados nos factories.

const {
  mockOnAuthStateChanged,
  mockSignInWithEmailAndPassword,
  mockCreateUserWithEmailAndPassword,
  mockSignOut,
  mockUpdateProfile,
  mockReload,
  mockApplyActionCode,
  mockGetIdTokenResult,
  mockFirestore,
  mockDoc,
  mockGetDoc,
  mockSetDoc,
  mockServerTimestamp,
  mockHttpsCallable,
  mockRequestCustomVerificationEmail,
  mockRequestCustomPasswordResetEmail,
} = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    mockOnAuthStateChanged: vi.fn(),
    mockSignInWithEmailAndPassword: vi.fn(),
    mockCreateUserWithEmailAndPassword: vi.fn(),
    mockSignOut: vi.fn(),
    mockUpdateProfile: vi.fn(),
    mockReload: vi.fn(),
    mockApplyActionCode: vi.fn(),
    mockGetIdTokenResult: vi.fn(),
    mockFirestore: { __doc: null },
    mockDoc: vi.fn(),
    mockGetDoc: vi.fn(),
    mockSetDoc: vi.fn(),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockHttpsCallable: vi.fn(),
    mockRequestCustomVerificationEmail: vi.fn(),
    mockRequestCustomPasswordResetEmail: vi.fn(),
  }
})

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: null, __mockAuth: true }),
  onAuthStateChanged: mockOnAuthStateChanged,
  signInWithEmailAndPassword: (...args) => mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args) => mockCreateUserWithEmailAndPassword(...args),
  signOut: (...args) => mockSignOut(...args),
  updateProfile: (...args) => mockUpdateProfile(...args),
  reload: (...args) => mockReload(...args),
  applyActionCode: (...args) => mockApplyActionCode(...args),
}))

vi.mock('firebase/firestore/lite', () => ({
  getFirestore: () => mockFirestore,
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
}))

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (...args) => mockHttpsCallable(...args),
}))

vi.mock('../../src/lib/firebase', () => {
  // O objeto auth e' mutavel (refreshAuthenticatedUser seta currentUser);
  // o getter permite resetar entre testes via firebaseMod.auth.currentUser = null.
  const auth = { currentUser: null, __mockAuth: true }
  return {
    get auth() { return auth },
    auth,
    firestore: mockFirestore,
    functions: {},
    isFirebaseConfigured: true,
  }
})

vi.mock('../../src/services/authRepository', () => ({
  sendCustomPasswordResetEmail: (...args) => mockRequestCustomPasswordResetEmail(...args),
  sendCustomVerificationEmail: (...args) => mockRequestCustomVerificationEmail(...args),
}))

import { AuthContext, AuthProvider } from '../../src/contexts/AuthContext'

// --- Helpers ---

function setupAuthObserver(initialUser) {
  // onAuthStateChanged e' chamado imediatamente com o user inicial. Capturamos
  // o callback para o AuthProvider poder "emitir" mudancas durante o teste.
  let observerCb = null
  // Reaplica a implementation (vi.clearAllMocks zera o mockImplementation)
  mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
    observerCb = cb
    // Emite o user inicial de forma assincrona (igual ao Firebase real).
    queueMicrotask(() => cb(initialUser))
    return () => {} // unsubscribe
  })
  return {
    emit: (user) => observerCb && observerCb(user),
  }
}

function makeUser({ uid = 'uid-1', email = 'maria@sqquimica.com', displayName = 'Maria' } = {}) {
  // O AuthContext chama user.getIdTokenResult() via getUserClaims (S3).
  // Encadeamos no proprio mockUser para que o spy `mockGetIdTokenResult`
  // seja o source-of-truth das claims por teste.
  const user = {
    uid,
    email,
    displayName,
    emailVerified: true,
    getIdTokenResult: (...args) => mockGetIdTokenResult(...args),
  }
  return user
}

function setupClaimsMock({ role = 'user', status = 'Ativo' } = {}) {
  // Importante: re-aplica a implementation apos clearAllMocks.
  // No vitest 1.6, vi.clearAllMocks() reseta a implementation default
  // (vi.fn() retorna undefined), entao precisamos usar mockImplementation
  // para preservar o controle.
  mockGetIdTokenResult.mockImplementation(async () => ({
    claims: { role, status },
  }))
}

function setupEmptyFirestore() {
  // getDoc -> snapshot com exists() e data() (METODOS, nao boolean/funcao)
  // porque o codigo faz snapshot?.exists() e snapshot.data().
  mockGetDoc.mockResolvedValue({
    exists: () => false,
    data: () => null,
  })
  mockDoc.mockReturnValue({ id: 'fake-doc-ref' })
  mockSetDoc.mockResolvedValue(undefined)
  mockServerTimestamp.mockReturnValue('SERVER_TIMESTAMP')
}

beforeEach(async () => {
  vi.clearAllMocks()
  // O mock de auth e' mutavel; o teste "refreshAuthenticatedUser" seta
  // auth.currentUser, entao precisamos resetar entre testes.
  const { auth: authMock } = await import('../../src/lib/firebase')
  authMock.currentUser = null
  // defaults saudaveis
  setupEmptyFirestore()
  setupClaimsMock()
  mockSignOut.mockResolvedValue(undefined)
  mockReload.mockResolvedValue(undefined)
  mockUpdateProfile.mockResolvedValue(undefined)
  mockApplyActionCode.mockResolvedValue(undefined)
  mockCreateUserWithEmailAndPassword.mockResolvedValue({
    user: makeUser({ uid: 'new-uid', email: 'novo@sqquimica.com', displayName: 'Novo' }),
  })
  mockSignInWithEmailAndPassword.mockResolvedValue({ user: makeUser() })
  mockHttpsCallable.mockReturnValue(() => Promise.resolve({ data: { success: true } }))
  mockRequestCustomVerificationEmail.mockResolvedValue({ success: true })
  mockRequestCustomPasswordResetEmail.mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Tests ---

describe('AuthProvider', () => {
  it('carrega o perfil do Firebase Auth e expoe role/status das claims (S3)', async () => {
    const user = makeUser({ email: 'admin@sqquimica.com' })
    mockGetIdTokenResult.mockResolvedValue({ claims: { role: 'admin', status: 'Ativo' } })
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: 'uid-1', name: 'Admin', role: 'user', status: 'Pendente' }),
    })
    const observer = setupAuthObserver(user)

    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    // O fluxo async completo (onAuthStateChanged via queueMicrotask,
    // getIdTokenResult, getDoc, setDoc) leva varios microtasks/ticks.
    await waitFor(() => {
      expect(result.current.profile).not.toBeNull()
    }, { timeout: 5000 })
    expect(result.current.profile.role).toBe('admin')
    expect(result.current.profile.status).toBe('Ativo')
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.hasAccess).toBe(true)
    expect(result.current.isApproved).toBe(true)
    expect(result.current.user).toBe(user)
    // ensureUserProfile persiste o perfil mesclado; setDoc foi chamado.
    expect(mockSetDoc).toHaveBeenCalled()

    // role/status vem das claims, NAO do Firestore (Sprint 5.1 / L18).
    expect(result.current.profile.role).toBe('admin')
    expect(result.current.profile.status).toBe('Ativo')
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.hasAccess).toBe(true)
    expect(result.current.isApproved).toBe(true)
    expect(result.current.user).toBe(user)

    // ensureUserProfile persiste o perfil mesclado; setDoc foi chamado.
    expect(mockSetDoc).toHaveBeenCalled()
  })

  it('aplica defaults (user, Pendente) quando claims ausentes', async () => {
    const user = makeUser()
    mockGetIdTokenResult.mockResolvedValue({ claims: {} })
    setupAuthObserver(user)

    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile.role).toBe('user')
    expect(result.current.profile.status).toBe('Pendente')
    expect(result.current.hasAccess).toBe(false)
  })

  it('bloqueia email fora de @sqquimica.com (signOut + authError)', async () => {
    const outsider = makeUser({ email: 'externo@gmail.com' })
    setupAuthObserver(outsider)

    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockSignOut).toHaveBeenCalledWith({ currentUser: null, __mockAuth: true })
    expect(result.current.profile).toBeNull()
    expect(result.current.authError).toMatch(/sqquimica\.com/)
  })

  it('rejeita login com email nao corporativo', async () => {
    const observer = setupAuthObserver(null)
    render(
      <AuthProvider>
        <AuthContext.Consumer>
          {(ctx) => <button onClick={() => ctx.login('externo@gmail.com', 'senha')}>login</button>}
        </AuthContext.Consumer>
      </AuthProvider>
    )
    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(
        result.current.login('externo@gmail.com', 'senha123')
      ).rejects.toThrow(/corporativo/)
    })
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled()
  })

  it('login com email corporativo chama signInWithEmailAndPassword', async () => {
    const observer = setupAuthObserver(null)
    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.login('Maria@sqquimica.com', 'senha123')
    })
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
      { currentUser: null, __mockAuth: true },
      'maria@sqquimica.com', // normalized to lowercase + trim
      'senha123'
    )
  })

  it('logout chama signOut', async () => {
    const user = makeUser()
    setupAuthObserver(user)
    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.logout()
    })
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('refreshAuthenticatedUser com forceClaimsRefresh=true passa o flag para getIdTokenResult', async () => {
    const user = makeUser()
    // Importa o mock de auth e seta currentUser ANTES do render.
    const firebaseMod = await import('../../src/lib/firebase')
    firebaseMod.auth.currentUser = user
    setupAuthObserver(user)
    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Limpa o mock e redefine para retornar claims diferentes
    mockGetIdTokenResult.mockClear()
    mockGetIdTokenResult.mockResolvedValue({ claims: { role: 'logistica', status: 'Ativo' } })
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: 'uid-1', name: 'M', role: 'user', status: 'Pendente' }),
    })

    await act(async () => {
      await result.current.refreshAuthenticatedUser({ forceClaimsRefresh: true })
    })

    // O getIdTokenResult foi chamado com forceRefresh=true.
    const calls = mockGetIdTokenResult.mock.calls
    expect(calls.some((c) => c[0] === true)).toBe(true)

    // role foi atualizado para logistica
    expect(result.current.profile.role).toBe('logistica')
  })

  it('mostra authError quando Firestore recusa criar o perfil (permission-denied)', async () => {
    const user = makeUser()
    setupClaimsMock()
    const permError = Object.assign(new Error('permission-denied'), { code: 'permission-denied' })
    mockGetDoc.mockRejectedValue(permError)
    setupAuthObserver(user)

    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authError).toMatch(/Firestore recusou/)
    // Mesmo com erro, o user e setado (o profile fica null).
    expect(result.current.user).toBe(user)
    expect(result.current.profile).toBeNull()
  })

  it('register chama createUser + updateProfile + ensureUserProfile', async () => {
    setupAuthObserver(null)
    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.register({
        name: 'Novo User',
        email: 'novo@sqquimica.com',
        password: 'senha-segura-123',
      })
    })
    expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
      { currentUser: null, __mockAuth: true },
      'novo@sqquimica.com',
      'senha-segura-123'
    )
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'new-uid' }),
      { displayName: 'Novo User' }
    )
    // O ensureUserProfile chamou setDoc (espelhando metadata no Firestore).
    expect(mockSetDoc).toHaveBeenCalled()
    // Email de verificacao e' disparado (mas a promise e' nao-awaited no codigo).
    // Nao bloqueia o cadastro.
  })
})


