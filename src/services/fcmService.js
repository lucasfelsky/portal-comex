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

import { getMessaging, getToken, onMessage, deleteToken, isSupported } from 'firebase/messaging'
import { app } from '../lib/firebase'

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY ?? ''

let messagingInstance = null
let cachedSupport = null

export async function isFcmSupported() {
  if (cachedSupport !== null) return cachedSupport
  if (!VAPID_KEY) {
    cachedSupport = false
    return false
  }
  try {
    cachedSupport = await isSupported()
  } catch {
    cachedSupport = false
  }
  return cachedSupport
}

function getMessagingInstance() {
  if (messagingInstance) return messagingInstance
  if (!app) return null
  try {
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
  const messaging = getMessagingInstance()
  if (!messaging) return null
  try {
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

export function onFcmMessage(callback) {
  const messaging = getMessagingInstance()
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}

export async function revokeFcmToken() {
  const messaging = getMessagingInstance()
  if (!messaging) return false
  try {
    await deleteToken(messaging)
    return true
  } catch (error) {
    console.error('Falha ao revogar token FCM.', error)
    return false
  }
}
