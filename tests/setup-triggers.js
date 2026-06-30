// Helpers compartilhados para tests de triggers Firestore (functions/index.js).
// Cada spec importa este arquivo APOS declarar os seus `vi.mock` (porque
// o `vi.mock` nao pode ficar em helper — precisa ser hoisted no test file).
//
// Fornece:
//   - mockFirestoreApi / mockBatch: firestore chain encadeavel
//   - mockAuthApi: auth api
//   - mockLogger / mockNodemailer: logger + nodemailer
//   - setSecretValue / resetSecrets: configura SMTP secrets
//   - setupFirestoreChain: monta collectionMap -> chain encadeavel
//   - setupMailer: instala mockNodemailer.createTransport
//   - getHandler: extrai o __handler do callable mockado

import { vi } from 'vitest'

export const mockAuthApi = {
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
  setCustomUserClaims: vi.fn(),
}

export const mockFirestoreApi = {
  collection: vi.fn(),
  doc: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  add: vi.fn(),
  batch: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP') },
}

export const mockBatch = {
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(),
}

export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

export const mockNodemailer = {
  createTransport: vi.fn(),
}

const mockSecretValues = {}

export const setSecretValue = (name, value) => {
  mockSecretValues[name] = value
}

export const resetSecrets = () => {
  for (const key of Object.keys(mockSecretValues)) delete mockSecretValues[key]
}

// Devolve a definicao padrao de `vi.mock` para os modulos do Firebase /
// nodemailer. Cada spec importa isto e faz:
//   vi.mock('firebase-admin/app', mocks.firebaseApp)
//   ... etc
export const mocks = {
  firebaseApp: { initializeApp: () => undefined },
  firebaseAuth: { getAuth: () => mockAuthApi },
  firebaseFirestore: () => ({
    getFirestore: () => mockFirestoreApi,
    FieldValue: mockFirestoreApi.FieldValue,
  }),
  firebaseFirestoreTriggers: () => ({
    onDocumentCreated: vi.fn((opts, handler) => ({ __handler: typeof opts === 'function' ? opts : handler })),
    onDocumentUpdated: vi.fn((opts, handler) => ({ __handler: typeof opts === 'function' ? opts : handler })),
  }),
  firebaseHttps: () => ({
    onCall: vi.fn((opts, handler) => ({ __handler: typeof opts === 'function' ? opts : handler })),
    HttpsError: class HttpsError extends Error { constructor(c, m) { super(m); this.code = c } },
  }),
  firebaseParams: () => ({
    defineSecret: vi.fn((name) => ({
      name,
      value: () => mockSecretValues[name] ?? '',
    })),
  }),
  firebaseLogger: () => ({ logger: mockLogger }),
  nodemailer: () => ({ default: mockNodemailer }),
}

// Constroi uma chain encadeavel a partir de um mapa de colecoes.
// collectionMap: { 'users': [{id, data}], 'processes': [{id, data}], ... }
// Subcollection: 'processes/{pid}/messages'
//
// where(field, op, value) filtra docs de verdade (==, array-contains, in).
// orderBy().limit().get() devolve os docs encadeados.
export function setupFirestoreChain(collectionMap = {}) {
  const collectionRefs = new Map()
  const subCollectionRefs = new Map()

  function buildDocs(items = []) {
    return items.map((d) => {
      const exists = d.exists !== false
      const dataSnapshot = d.data ?? {}
      return {
        id: d.id,
        get: vi.fn().mockResolvedValue({
          exists,
          id: d.id,
          data: () => dataSnapshot,
        }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        collection: vi.fn(),
      }
    })
  }

  function filterDocs(docList, whereClauses) {
    return docList.filter((d) => {
      const data = d._data ?? {}
      for (const w of whereClauses) {
        const { field, op, value } = w
        if (op === '==') {
          if (data[field] !== value) return false
        } else if (op === 'array-contains') {
          if (!Array.isArray(data[field]) || !data[field].includes(value)) return false
        } else if (op === 'in') {
          if (!Array.isArray(value) || !value.includes(data[field])) return false
        } else if (op === '!=') {
          if (data[field] === value) return false
        }
      }
      return true
    })
  }

  function buildCollectionRef(docList) {
    const state = { whereClauses: [] }

    const ref = {
      doc: vi.fn((id) => {
        if (id) {
          return docList.find((d) => d.id === id) ?? {
            id,
            get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
            set: vi.fn().mockResolvedValue(undefined),
            collection: vi.fn(),
          }
        }
        return {
          id: `auto-${Math.random().toString(36).slice(2, 10)}`,
          get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
          set: vi.fn().mockResolvedValue(undefined),
        }
      }),
      where: vi.fn((field, op, value) => {
        state.whereClauses.push({ field, op, value })
        return ref
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(() => {
        const filtered = filterDocs(docList, state.whereClauses)
        state.whereClauses = []
        return Promise.resolve({
          docs: filtered.map((d) => ({ id: d.id, data: () => d._data ?? {} })),
          empty: filtered.length === 0,
        })
      }),
    }
    return ref
  }

  for (const [name, items] of Object.entries(collectionMap)) {
    if (name.includes('/')) continue
    const docRefs = buildDocs(items)
    for (const [i, d] of items.entries()) {
      docRefs[i]._data = d.data ?? {}
    }
    const ref = buildCollectionRef(docRefs)
    collectionRefs.set(name, ref)

    // patch docRef.collection em cada doc do docRefs (mesmo objeto retornado por ref.doc(id))
    for (const [i, d] of items.entries()) {
      docRefs[i].collection = vi.fn((subName) =>
        getSubCollection(`${name}/${d.id}`, subName)
      )
    }
  }

  // Pre-cria subcollections referenciadas em collectionMap
  for (const [key, items] of Object.entries(collectionMap)) {
    if (!key.includes('/')) continue
    const parts = key.split('/')
    const parent = `${parts[0]}/${parts[1]}`
    const subName = parts[2]
    getSubCollection(parent, subName)
  }

  function getSubCollection(parent, subName) {
    const key = `${parent}/${subName}`
    if (!subCollectionRefs.has(key)) {
      const items = collectionMap[key] ?? []
      const docRefs = buildDocs(items)
      for (const [i, d] of items.entries()) {
        docRefs[i]._data = d.data ?? {}
      }
      subCollectionRefs.set(key, buildCollectionRef(docRefs))
    }
    return subCollectionRefs.get(key)
  }

  // Patch docRef.collection para devolver a subcollection
  for (const [name] of collectionRefs) {
    const original = collectionRefs.get(name)
    for (const fakeDoc of (collectionMap[name] ?? [])) {
      // nothing to patch — subcollection is built lazily by the impl
    }
  }

  mockFirestoreApi.collection.mockImplementation((name) => {
    if (collectionRefs.has(name)) return collectionRefs.get(name)
    if (subCollectionRefs.has(name)) return subCollectionRefs.get(name)
    return {
      doc: vi.fn().mockReturnValue({
        id: 'auto',
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        set: vi.fn().mockResolvedValue(undefined),
        collection: vi.fn().mockReturnThis(),
      }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    }
  })

  mockFirestoreApi.doc.mockImplementation((path) => {
    if (!path) {
      return { id: 'auto', get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn() }
    }
    const parts = path.split('/')
    const collection = parts[0]
    const id = parts[1]
    const ref = collectionRefs.get(collection)
    if (ref) return ref.doc(id)
    return { id, get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }), set: vi.fn() }
  })

  mockFirestoreApi.batch.mockReturnValue(mockBatch)
  mockBatch.commit.mockResolvedValue(undefined)
  mockBatch.set.mockReturnThis()
  mockBatch.update.mockReturnThis()
  mockBatch.delete.mockReturnThis()

  return { collectionRefs, subCollectionRefs, getSubCollection }
}

export function getHandler(callable) {
  if (callable && typeof callable.__handler === 'function') return callable.__handler
  throw new Error('callable nao tem __handler — vi.mock nao foi aplicado')
}

export const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-1' })
export function setupMailer() {
  mockNodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail })
}
