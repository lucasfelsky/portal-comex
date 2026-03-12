// src/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  // <-- SUBSTITUA por suas credenciais do Firebase Web App
  apiKey: "AIzaSyDH6ZMNKqlqv8H9-MYmUzcEQjK1724fotk",
  authDomain: "sq-comex-updates-3d22f.firebaseapp.com",
  projectId: "sq-comex-updates-3d22f",
  storageBucket: "sq-comex-updates-3d22f.firebasestorage.app",
  messagingSenderId: "705697815580",
  appId: "1:705697815580:web:aeca500550136c88f693d9",
  measurementId: "G-Q57TX1SHPV"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
