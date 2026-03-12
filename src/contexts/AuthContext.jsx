import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { auth, db } from '../firebase'
import { onAuthStateChanged, reload, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

export const AuthContext = createContext()

const VALID_ROLES = ['user', 'comex', 'admin']

const normalizeRole = (rawRole) => {
  if (VALID_ROLES.includes(rawRole)) return rawRole
  if (rawRole === 'normal') return 'user'
  return 'user'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [name, setName] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)

  useEffect(() => {
    let profileUnsub = null

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      setProfileLoaded(false)

      if (profileUnsub) {
        profileUnsub()
        profileUnsub = null
      }

      if (!currentUser) {
        setRole(null)
        setName(null)
        setLoadingAuth(false)
        return
      }

      try {
        await reload(currentUser)
      } catch (err) {
        console.error('reload auth user error', err)
      }

      profileUnsub = await ensureAndSubscribeUserProfile(currentUser)
      setLoadingAuth(false)
    })

    return () => {
      unsub()
      if (profileUnsub) profileUnsub()
    }
  }, [])

  const ensureAndSubscribeUserProfile = async (firebaseUser) => {
    const ref = doc(db, 'users', firebaseUser.uid)
    const snap = await getDoc(ref)

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? null,
        name: firebaseUser.displayName ?? null,
        role: 'user',
        emailVerified: firebaseUser.emailVerified === true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    } else if (snap.data()?.emailVerified !== (firebaseUser.emailVerified === true)) {
      await updateDoc(ref, {
        emailVerified: firebaseUser.emailVerified === true,
        updatedAt: serverTimestamp()
      })
    }

    return onSnapshot(ref, (profileSnap) => {
      const data = profileSnap.data() || {}
      setRole(normalizeRole(data.role))
      setName(data.name || firebaseUser.displayName || firebaseUser.email || null)
      setProfileLoaded(true)
    })
  }

  const refreshUser = async () => {
    if (!auth.currentUser) return

    await reload(auth.currentUser)
    const verified = auth.currentUser.emailVerified === true

    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        emailVerified: verified,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('update emailVerified on refresh error', err)
    }

    setUser({ ...auth.currentUser })
  }

  const logout = async () => {
    await signOut(auth)
  }

  const value = useMemo(
    () => ({
      user,
      role,
      name,
      loading: loadingAuth || (user ? !profileLoaded : false),
      refreshUser,
      logout
    }),
    [user, role, name, loadingAuth, profileLoaded]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuthContext = () => useContext(AuthContext)
