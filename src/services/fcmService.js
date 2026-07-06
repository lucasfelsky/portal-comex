// fcmService: wrapper de Firebase Cloud Messaging (Sprint 22).
// Pede permissao, obtem token, escuta mensagens em foreground, faz
// unsubscribe.
//
// Requer:
//   - VITE_FCM_VAPID_KEY (gerada em Firebase Console)
//   - Service worker /firebase-messaging-sw.js (em public/)
//   - HTTPS em producao
//
// Se VITE_FCM_VAPID_KEY nao estiver setado, todas as funcoes sao no-op
// e `isSupported()` retorna false. Isso permite que o codigo do app
// funcione normalmente em dev ou antes da configuracao.

import { app } from '../lib/firebase'

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY ?? ''

let messagingModulePromise = null
let messagingInstance = null
let cachedSupport = null

// Import dinamico: so baixa o chunk de firebase/messaging quando FCM e
// realmente usado (pos-login, sob demanda), em vez de inflar o chunk
// "firebase" que ja carrega eager por causa do Auth/Firestore.
function loadMessagingModule() {
  if (!messagingModulePromise) {
    messagingModulePromise = import('firebase/messaging')
  }
  return messagingModulePromise
}

export async function isFcmSupported() {
  if (cachedSupport !== null) return cachedSupport
  if (!VAPID_KEY) {
    cachedSupport = false
    return false
  }
  try {
    const { isSupported } = await loadMessagingModule()
    cachedSupport = await isSupported()
  } catch {
    cachedSupport = false
  }
  return cachedSupport
}

async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance
  if (!app) return null
  try {
    const { getMessaging } = await loadMessagingModule()
    messagingInstance = getMessaging(app)
  } catch {
    messagingInstance = null
  }
  return messagingInstance
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  const result = await Notification.requestPermission()
  return result
}

export async function getFcmToken() {
  if (!(await isFcmSupported())) return null
  const messaging = await getMessagingInstance()
  if (!messaging) return null
  try {
    const { getToken } = await loadMessagingModule()
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      ),
    })
    return token
  } catch (error) {
    console.error('Falha ao obter token FCM.', error)
    return null
  }
}

export async function onFcmMessage(callback) {
  const messaging = await getMessagingInstance()
  if (!messaging) return () => {}
  const { onMessage } = await loadMessagingModule()
  return onMessage(messaging, callback)
}

export async function revokeFcmToken() {
  const messaging = await getMessagingInstance()
  if (!messaging) return false
  try {
    const { deleteToken } = await loadMessagingModule()
    await deleteToken(messaging)
    return true
  } catch (error) {
    console.error('Falha ao revogar token FCM.', error)
    return false
  }
}
