// Service worker do Firebase Cloud Messaging (Sprint 22).
// Recebe mensagens em background e exibe notificacao nativa.
//
// Configuracao necessaria:
//   1. firebaseConfig: copiar de .env (mesmo projeto do app)
//   2. VITE_FCM_VAPID_KEY: gerada em Firebase Console > Project Settings >
//      Cloud Messaging > Web Push certificates.
//
// As constantes vem de import.meta.env no Vite, mas service workers
// nao acessam o build. Por isso a config abaixo e populada via
// no-cache redirect ou substituicao em build (Vite faz isso via
// `import.meta.url` e Workbox). Aqui usamos um placeholder que sera
// substituido por Vite plugin ou manualmente.

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js'
)

firebase.initializeApp({
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  storageBucket: '__FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? payload.data?.title ?? 'Portal COMEX'
  const options = {
    body: payload.notification?.body ?? payload.data?.body ?? '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data ?? {},
    tag: payload.data?.tag ?? 'sq-comex',
    requireInteraction: false,
  }
  self.registration.showNotification(title, options)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
      return null
    })
  )
})
