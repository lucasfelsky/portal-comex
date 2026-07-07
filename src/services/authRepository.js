import { getCallable } from '../lib/firebase'

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
  const callable = await getCallable('sendCustomVerificationEmail')
  if (!callable) {
    return { success: true, alreadyVerified: false }
  }

  const result = await withCallableTimeout(
    callable(payload),
    'Tempo limite excedido ao enviar o email de verificação.'
  )
  return result.data
}

export async function sendCustomPasswordResetEmail(email) {
  const callable = await getCallable('sendCustomPasswordResetEmail')
  if (!callable) {
    throw new Error('Firebase Functions não configurado para redefinição de senha.')
  }

  const result = await withCallableTimeout(
    callable({ email }),
    'Tempo limite excedido ao enviar o email de redefinição de senha.'
  )
  return result.data
}
