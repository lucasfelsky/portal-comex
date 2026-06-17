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

export async function sendCustomVerificationEmail(payload = {}) {
  if (!isFirebaseConfigured || !functions) {
    return { success: true, alreadyVerified: false }
  }

  const callable = httpsCallable(functions, 'sendCustomVerificationEmail')
  const result = await withCallableTimeout(
    callable(payload),
    'Tempo limite excedido ao enviar o email de verificação.'
  )
  return result.data
}

export async function sendCustomPasswordResetEmail(email) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error('Firebase Functions não configurado para redefinição de senha.')
  }

  const callable = httpsCallable(functions, 'sendCustomPasswordResetEmail')
  const result = await withCallableTimeout(
    callable({ email }),
    'Tempo limite excedido ao enviar o email de redefinição de senha.'
  )
  return result.data
}
