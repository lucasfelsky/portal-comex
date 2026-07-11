import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore/lite'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const isConfigured = Object.values(firebaseConfig).every(Boolean)

let firestore = null
let auth = null
let app = null
let storage = null

// E2E (Playwright): quando VITE_USE_FIREBASE_EMULATORS=true, o app inteiro
// conversa com os emuladores locais (portas fixas do bloco `emulators` em
// firebase.json) em vez do projeto real. Opt-in explicito de build/dev —
// nunca ativo em producao (a flag nao existe nos builds de deploy).
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'

if (isConfigured) {
  app = initializeApp(firebaseConfig)
  firestore = getFirestore(app)
  auth = getAuth(app)
  storage = getStorage(app)

  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
    connectStorageEmulator(storage, '127.0.0.1', 9199)
  }
}

// firebase/functions e' carregado sob demanda (dynamic import) -- so' baixa o
// chunk quando uma callable e' realmente chamada (pos-login), em vez de inflar
// o chunk "firebase" que ja carrega eager por causa do Auth/Firestore. Retorna
// null quando o Firebase nao esta configurado (dev/local sem backend), no mesmo
// espirito do antigo guard `if (!functions)`.
let functionsSingleton = null
export async function getCallable(name) {
  if (!isConfigured || !app) return null
  const { getFunctions, httpsCallable } = await import('firebase/functions')
  if (!functionsSingleton) {
    functionsSingleton = getFunctions(app)
  }
  return httpsCallable(functionsSingleton, name)
}

export { app, auth, firestore, storage, firebaseConfig, isConfigured as isFirebaseConfigured }
