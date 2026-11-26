// S11-F: a fila da leitura automática do COA para e é limpa quando a conta sai ou muda (AuthContext -> coaAutoReadSession
// -> coaAutoReadQueue). AuthProvider REAL com firebase/auth e Firestore mockados; a callable `readProcessCoa` é mockada
// (nunca chama a Tess). Dados inventados.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

const {
  mockOnAuthStateChanged,
  mockGetIdTokenResult,
  mockReadProcessCoa,
} = vi.hoisted(() => ({
  mockOnAuthStateChanged: vi.fn(),
  mockGetIdTokenResult: vi.fn(),
  mockReadProcessCoa: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn(),
  reload: vi.fn(),
  applyActionCode: vi.fn(),
}))

vi.mock('firebase/firestore/lite', () => ({
  doc: vi.fn(() => ({ id: 'ref' })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'TS'),
}))

vi.mock('../../src/lib/firebase', () => ({
  auth: { currentUser: null },
  firestore: {},
  functions: {},
  isFirebaseConfigured: true,
}))

vi.mock('../../src/services/authRepository', () => ({
  sendCustomPasswordResetEmail: vi.fn(),
  sendCustomVerificationEmail: vi.fn(),
}))

vi.mock('../../src/services/coaReadsRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, readProcessCoa: (...args) => mockReadProcessCoa(...args) }
})

import { AuthProvider } from '../../src/contexts/AuthContext'
import {
  enqueueCoaAutoRead,
  getCoaAutoReadState,
  registerCoaAutoReadMount,
  resetCoaAutoRead,
} from '../../src/features/processes/coaAutoReadQueue'

const doc = (id) => ({ id, type: 'coaOriginal', name: `${id}.pdf`, mimeType: 'application/pdf' })
const done = (id) => ({ status: 'done', cached: false, read: { documentId: id, status: 'done', documentType: 'coa', certificates: [] } })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const KEY = 'p1|'
const calledIds = () => mockReadProcessCoa.mock.calls.map((call) => call[1])

function makeUser(uid) {
  return { uid, email: `${uid}@sqquimica.com`, displayName: uid, emailVerified: true, getIdTokenResult: (...args) => mockGetIdTokenResult(...args) }
}

let emitAuth
let role

beforeEach(() => {
  vi.clearAllMocks()
  resetCoaAutoRead()
  role = 'admin'
  mockGetIdTokenResult.mockImplementation(async () => ({ claims: { role, status: 'Ativo' } }))
  mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
    emitAuth = (user) => callback(user)
    return () => {}
  })
})

afterEach(() => {
  resetCoaAutoRead()
})

async function mountProvider() {
  const view = render(<AuthProvider>{null}</AuthProvider>)
  await act(async () => {
    await emitAuth(makeUser('admin-a'))
  })
  return view
}

// Enfileira como o card faria: componente montado + 3 PDFs; a 1ª leitura fica pendente.
async function startQueue() {
  let resolveFirst
  mockReadProcessCoa
    .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
    .mockResolvedValue(done('x'))
  registerCoaAutoReadMount('p1')
  expect(enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])).toBe(3)
  await flush()
  expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 3 })
  return resolveFirst
}

describe('AuthContext -> fila da leitura automática de COA', () => {
  it('logout (onAuthStateChanged sem usuário) esvazia a fila; o arquivo em andamento termina e nada mais é lido', async () => {
    await mountProvider()
    const resolveFirst = await startQueue()

    await act(async () => {
      await emitAuth(null)
    })
    expect(getCoaAutoReadState().progress).toEqual({})

    resolveFirst(done('a'))
    for (let index = 0; index < 3; index += 1) await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('outro usuário entrando (uid novo) esvazia a fila do anterior', async () => {
    await mountProvider()
    const resolveFirst = await startQueue()

    await act(async () => {
      await emitAuth(makeUser('admin-b'))
    })
    await waitFor(() => expect(getCoaAutoReadState().progress).toEqual({}))

    resolveFirst(done('a'))
    for (let index = 0; index < 3; index += 1) await flush()
    expect(calledIds()).toEqual(['a'])
  })

  it('o mesmo usuário recarregando o perfil (mesmo uid e perfil) não mexe na fila', async () => {
    await mountProvider()
    const resolveFirst = await startQueue()

    await act(async () => {
      await emitAuth(makeUser('admin-a'))
    })
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 3 })

    resolveFirst(done('a'))
    for (let index = 0; index < 4; index += 1) await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c'])
  })

  it('o mesmo usuário perdendo o perfil de admin (claims novas) esvazia a fila', async () => {
    await mountProvider()
    const resolveFirst = await startQueue()

    role = 'logistica'
    await act(async () => {
      await emitAuth(makeUser('admin-a'))
    })
    await waitFor(() => expect(getCoaAutoReadState().progress).toEqual({}))

    resolveFirst(done('a'))
    for (let index = 0; index < 3; index += 1) await flush()
    expect(calledIds()).toEqual(['a'])
  })
})
