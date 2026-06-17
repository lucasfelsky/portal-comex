import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import { getFirestore } from 'firebase/firestore/lite'
import { getStorage } from 'firebase/storage'

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
let functions = null
let storage = null

if (isConfigured) {
  app = initializeApp(firebaseConfig)
  firestore = getFirestore(app)
  auth = getAuth(app)
  functions = getFunctions(app)
  storage = getStorage(app)
}

export { app, auth, firestore, functions, storage, firebaseConfig, isConfigured as isFirebaseConfigured }
