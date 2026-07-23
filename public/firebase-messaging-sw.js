// firebase-messaging-sw.js — Service Worker do Firebase Cloud Messaging.
// Necessário para receber push notifications em background (app fechado
// ou em segundo plano). O FCM registra este SW automaticamente quando
// getToken() é chamado com a opção serviceWorkerRegistration.
//
// Deve estar em public/ para ser servido na raiz do domínio.
// Usa importScripts para carregar o SDK do Firebase compatível com SW.

importScripts('https://www.gstatic.com/firebasejs/10.10.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.10.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSy...fotk',
  authDomain: 'sq-comex-updates-3d22f.firebaseapp.com',
  projectId: 'sq-comex-updates-3d22f',
  storageBucket: 'sq-comex-updates-3d22f.firebasestorage.app',
  messagingSenderId: '705697815580',
  appId: '1:705697815580:web:aeca500550136c88f693d9',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  // O FCM já exibe a notificação automaticamente quando o payload tem
  // campo `notification`. Este handler é para extras/custom data.
  console.log('Mensagem FCM recebida em background:', payload)
})