// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { auth, db } from '../firebase'
import {
  onAuthStateChanged,
  signOut,
  reload
} from 'firebase/auth'
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'firebase/firestore'

export const AuthContext = createContext()

const normalizeRole = (rawRole) => {
  if (rawRole === 'comex' || rawRole === 'admin') return 'comex'
  return 'normal'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [name, setName] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)

  useEffect(() => {
    let profileUnsub = null

    const unsub = onAuthStateChanged(auth, async (usr) => {
      setUser(usr)
      setProfileLoaded(false)

      if (profileUnsub) {
        profileUnsub()
        profileUnsub = null
      }

      if (!usr) {
        setRole(null)
        setName(null)
        setLoading(false)
        return
      }

      try {
        await reload(usr)
      } catch {}

      profileUnsub = await loadUserProfile(usr.uid)
      setLoading(false)
    })

    return () => {
      unsub()
      if (profileUnsub) profileUnsub()
    }
  }, [])

  const loadUserProfile = async (uid) => {
    const ref = doc(db, 'users', uid)

    let snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        email: auth.currentUser?.email || null,
        name: auth.currentUser?.displayName || null,
        role: 'normal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      snap = await getDoc(ref)
    }

    const data = snap.data()
    setName(data.name || auth.currentUser?.displayName || auth.currentUser?.email)
    setRole(normalizeRole(data.role))
    setProfileLoaded(true)

    return onSnapshot(ref, (ds) => {
      const d = ds.data()
      setName(d?.name || null)
      setRole(normalizeRole(d?.role))
    })
  }

  const refreshUser = async () => {
    if (auth.currentUser) {
      await reload(auth.currentUser)
      await loadUserProfile(auth.currentUser.uid)
    }
  }

  const logout = async () => {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        name,
        loading: loading || !profileLoaded,
        refreshUser,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => useContext(AuthContext)
