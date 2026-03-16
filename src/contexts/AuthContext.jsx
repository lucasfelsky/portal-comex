import { createContext, useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase'
import { getRolePermissions } from '../features/admin/rolePermissions'
import { syncNotificationRecipient } from '../services/notificationRecipientsRepository'
import { listUsers } from '../services/usersRepository'

export const AuthContext = createContext(null)

function normalizeCorporateEmail(email) {
  return email.trim().toLowerCase()
}

function isAllowedCorporateEmail(email) {
  return normalizeCorporateEmail(email).endsWith('@sqquimica.com')
}

function buildBaseProfile(user, existingProfile = null) {
  const role = existingProfile?.role ?? 'user'
  const isApproved = existingProfile?.status === 'Ativo'

  return {
    uid: user.uid,
    name: user.displayName ?? existingProfile?.name ?? user.email ?? 'Usuário',
    email: normalizeCorporateEmail(user.email ?? existingProfile?.email ?? ''),
    role,
    area: existingProfile?.area ?? 'Geral',
    status: isApproved ? 'Ativo' : existingProfile?.status ?? 'Pendente',
    statusTone: isApproved ? 'ok' : existingProfile?.statusTone ?? 'warn',
    lastAccess: existingProfile?.lastAccess ?? 'Aguardando aprovação',
    scopes: getRolePermissions(role),
    favoriteProcessIds: existingProfile?.favoriteProcessIds ?? [],
    notes: existingProfile?.notes ?? 'Cadastro corporativo aguardando análise administrativa.',
  }
}

async function ensureUserProfile(user) {
  const userRef = doc(firestore, 'users', user.uid)
  const snapshot = firestore ? await getDoc(userRef) : null
  const existingProfile = snapshot?.exists() ? snapshot.data() : null
  const baseProfile = buildBaseProfile(user, existingProfile)
  const now = new Date().toISOString()

  if (!firestore) {
    return baseProfile
  }

  if (!snapshot.exists()) {
    const profile = {
      ...baseProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    await setDoc(userRef, profile, { merge: true })
    await syncNotificationRecipient(profile)
    return profile
  }

  const mergedProfile = {
    ...snapshot.data(),
    uid: user.uid,
    email: baseProfile.email,
    name: user.displayName ?? snapshot.data().name ?? snapshot.data().email ?? 'Usuário',
    lastAccess:
      existingProfile?.status === 'Ativo' ? now : snapshot.data().lastAccess ?? baseProfile.lastAccess,
    updatedAt: serverTimestamp(),
  }

  await setDoc(userRef, mergedProfile, { merge: true })
  await syncNotificationRecipient({
    ...baseProfile,
    ...mergedProfile,
  })

  return {
    ...snapshot.data(),
    ...baseProfile,
    ...mergedProfile,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false)
      return undefined
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setLoading(true)
      setAuthError('')

      if (!nextUser) {
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      if (!isAllowedCorporateEmail(nextUser.email ?? '')) {
        await signOut(auth)
        setAuthError('A aplicação aceita apenas e-mails do domínio @sqquimica.com.')
        setLoading(false)
        return
      }

      try {
        const loadedProfile = await ensureUserProfile(nextUser)
        setUser(nextUser)
        setProfile(loadedProfile)
      } catch (error) {
        if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
          setAuthError(
            'O login funcionou, mas o Firestore recusou criar o perfil. Publique as regras com firebase deploy --only firestore:rules.'
          )
        } else {
          setAuthError('Não foi possível carregar o perfil do usuário.')
        }
        setUser(nextUser)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!profile?.uid || profile.role !== 'admin') {
      return undefined
    }

    let isMounted = true

    async function backfillNotificationRecipients() {
      try {
        const users = await listUsers()
        if (!isMounted) return

        await Promise.all(users.map((user) => syncNotificationRecipient(user)))
      } catch (error) {
        console.error('Falha ao sincronizar destinatários de notificação.', error)
      }
    }

    backfillNotificationRecipients()

    return () => {
      isMounted = false
    }
  }, [profile?.uid, profile?.role])

  async function login(email, password) {
    if (!auth) {
      throw new Error('Firebase Auth não configurado.')
    }

    if (!isAllowedCorporateEmail(email)) {
      throw new Error('Use um email corporativo @sqquimica.com.')
    }

    setAuthError('')
    await signInWithEmailAndPassword(auth, normalizeCorporateEmail(email), password)
  }

  async function register({ name, email, password }) {
    if (!auth) {
      throw new Error('Firebase Auth não configurado.')
    }

    if (!isAllowedCorporateEmail(email)) {
      throw new Error('Use um email corporativo @sqquimica.com.')
    }

    setAuthError('')
    const credentials = await createUserWithEmailAndPassword(
      auth,
      normalizeCorporateEmail(email),
      password
    )

    if (name.trim()) {
      await updateProfile(credentials.user, { displayName: name.trim() })
    }

    await ensureUserProfile({
      ...credentials.user,
      displayName: name.trim() || credentials.user.displayName,
    })
  }

  async function logout() {
    if (!auth) {
      return
    }

    await signOut(auth)
  }

  async function toggleFavoriteProcess(processId) {
    setProfile((currentProfile) => {
      if (!currentProfile) {
        return currentProfile
      }

      const currentFavorites = currentProfile.favoriteProcessIds ?? []
      const nextFavorites = currentFavorites.includes(processId)
        ? currentFavorites.filter((item) => item !== processId)
        : [...currentFavorites, processId]

      if (firestore) {
        setDoc(
          doc(firestore, 'users', currentProfile.uid),
          {
            favoriteProcessIds: nextFavorites,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((error) => {
          console.error('Falha ao atualizar favoritos do usuário.', error)
        })

        syncNotificationRecipient({
          ...currentProfile,
          favoriteProcessIds: nextFavorites,
        }).catch((error) => {
          console.error('Falha ao sincronizar preferências de notificação do usuário.', error)
        })
      }

      return {
        ...currentProfile,
        favoriteProcessIds: nextFavorites,
      }
    })
  }

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      authError,
      isAuthenticated: Boolean(user),
      isApproved: profile?.status === 'Ativo',
      login,
      register,
      logout,
      toggleFavoriteProcess,
    }),
    [authError, loading, profile, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
