// Seed dos emuladores para o E2E browser (S7).
//
// Cria dois usuários no Auth emulator (admin + user comum), com custom
// claims (fonte única de role/status desde Sprint 5.1) e email verificado,
// e pré-seeda os docs `users/{uid}` no Firestore emulator via REST com
// `Authorization: Bearer owner` (bypass de rules, só existe no emulador).
//
// O doc precisa existir ANTES do primeiro login: o caminho de criação do
// ensureUserProfile escreve role/status vindos das claims, e as rules de
// self-registration só aceitam role 'user' + status 'Pendente' — um admin
// logando pela primeira vez sem doc seedado seria negado.
const AUTH_HOST = 'http://127.0.0.1:9099'
const FIRESTORE_HOST = 'http://127.0.0.1:8080'
const PROJECT_ID = 'demo-sqcomex'

export const E2E_USERS = {
  admin: {
    email: 'e2e-admin@sqquimica.com',
    password: 'senha-e2e-admin',
    name: 'Admin E2E',
    role: 'admin',
    status: 'Ativo',
  },
  user: {
    email: 'e2e-user@sqquimica.com',
    password: 'senha-e2e-user',
    name: 'Usuario E2E',
    role: 'user',
    status: 'Ativo',
  },
}

async function requireEmulator() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'E2E browser exige os emuladores de pé. Rode via `npm run test:e2e` ' +
        '(emulators:exec) em vez de `playwright test` direto.'
    )
  }
}

async function authFetch(path, body) {
  const response = await fetch(`${AUTH_HOST}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Auth emulator ${path}: ${JSON.stringify(payload)}`)
  }
  return payload
}

async function createAuthUser({ email, password, name, role, status }) {
  const signUp = await authFetch(
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    { email, password, returnSecureToken: true }
  )
  const localId = signUp.localId

  await authFetch(
    `/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    {
      localId,
      displayName: name,
      emailVerified: true,
      customAttributes: JSON.stringify({ role, status, name }),
    }
  )

  return localId
}

function firestoreString(value) {
  return { stringValue: String(value) }
}

async function seedUserDoc(uid, { email, name, role, status }) {
  const response = await fetch(
    `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?documentId=${uid}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner',
      },
      body: JSON.stringify({
        fields: {
          uid: firestoreString(uid),
          name: firestoreString(name),
          email: firestoreString(email),
          role: firestoreString(role),
          status: firestoreString(status),
          // isAllowedSelfUserUpdate compara statusTone por igualdade — a key
          // PRECISA existir no doc, senão a rule erra e nega o merge que o
          // ensureUserProfile faz no login.
          statusTone: firestoreString(status === 'Ativo' ? 'ok' : 'warn'),
          area: firestoreString('Geral'),
          lastAccess: firestoreString('Aguardando aprovação'),
          notes: firestoreString('Seed E2E'),
          favoriteProcessIds: { arrayValue: { values: [] } },
        },
      }),
    }
  )
  if (!response.ok) {
    throw new Error(`Firestore emulator seed users/${uid}: ${await response.text()}`)
  }
}

async function clearFirestore() {
  await fetch(
    `${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  )
}

async function clearAuth() {
  await fetch(`${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  })
}

export default async function globalSetup() {
  await requireEmulator()
  await clearAuth()
  await clearFirestore()

  for (const user of Object.values(E2E_USERS)) {
    const uid = await createAuthUser(user)
    await seedUserDoc(uid, user)
  }
}
