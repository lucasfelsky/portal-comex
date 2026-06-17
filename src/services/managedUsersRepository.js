import { httpsCallable } from 'firebase/functions'
import { functions, isFirebaseConfigured } from '../lib/firebase'

const CALLABLE_TIMEOUT_MS = 15000

function withCallableTimeout(promise, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, CALLABLE_TIMEOUT_MS)
    }),
  ])
}

async function callManagedUserFunction(functionName, payload, timeoutMessage) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error('Firebase Functions nao configurado para gestao de usuarios.')
  }

  const callable = httpsCallable(functions, functionName)
  const result = await withCallableTimeout(callable(payload), timeoutMessage)
  return result.data
}

export async function createManagedAuthUser({ email, password, name, role, area, status, notes }) {
  return callManagedUserFunction(
    'adminCreateUser',
    { email, password, name, role, area, status, notes },
    'Tempo limite excedido ao criar o usuario.'
  )
}

export async function updateManagedUserPassword({ uid, password }) {
  return callManagedUserFunction(
    'adminUpsertUserPassword',
    {
      uid: String(uid ?? '').trim(),
      password: String(password ?? ''),
    },
    'Tempo limite excedido ao atualizar a senha do usuario.'
  )
}

export async function deleteManagedUser(uid) {
  return callManagedUserFunction(
    'adminDeleteUser',
    {
      uid: String(uid ?? '').trim(),
    },
    'Tempo limite excedido ao excluir o usuario.'
  )
}
