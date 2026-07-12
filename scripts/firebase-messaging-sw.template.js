// TEMPLATE do service worker de FCM (F6, backlog 2026-07-12).
// NAO e' servido direto: o plugin `messagingSwPlugin` (vite.config.js)
// substitui os placeholders __FIREBASE_*__ pelas VITE_FIREBASE_* e:
//   - build: emite dist/firebase-messaging-sw.js
//   - dev:   serve /firebase-messaging-sw.js via middleware
// Recebe mensagens em background e exibe notificacao nativa.

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
