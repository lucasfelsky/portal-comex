import { createContext, useEffect, useMemo, useState } from 'react'
import {
  applyActionCode,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite'
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase'
import { getUserClaims } from '../lib/claims'
import { getRolePermissions } from '../features/admin/rolePermissions'
import {
  sendCustomPasswordResetEmail as requestCustomPasswordResetEmail,
  sendCustomVerificationEmail as requestCustomVerificationEmail,
} from '../services/authRepository'

export const AuthContext = createContext(null)

function normalizeCorporateEmail(email) {
  return email.trim().toLowerCase()
}

function normalizeProfileStatus(status) {
  const normalizedStatus = String(status ?? '')
    .trim()
    .toLowerCase()

  if (normalizedStatus === 'ativo') return 'Ativo'
  if (normalizedStatus === 'bloqueado') return 'Bloqueado'
  if (normalizedStatus === 'reprovado') return 'Reprovado'
  return 'Pendente'
}

function getDefaultStatusTone(status) {
  if (status === 'Ativo') return 'ok'
  if (status === 'Bloqueado' || status === 'Reprovado') return 'neutral'
  return 'warn'
}

function getDefaultLastAccess(status) {
  if (status === 'Ativo') return 'Aguardando primeiro acesso'
  if (status === 'Bloqueado') return 'Acesso bloqueado'
  if (status === 'Reprovado') return 'Cadastro reprovado'
  return 'Aguardando aprovação'
}

function getDefaultNotes(status) {
  if (status === 'Ativo') return 'Acesso liberado.'
  if (status === 'Bloqueado') return 'Acesso bloqueado pela administração.'
  if (status === 'Reprovado') return 'Cadastro reprovado pela administração.'
  return 'Cadastro corporativo aguardando aprovação administrativa.'
}

function isAllowedCorporateEmail(email) {
  return normalizeCorporateEmail(email).endsWith('@sqquimica.com')
}

function buildBaseProfile(user, claims, existingProfile = null) {
  // Sprint 5.1 / L18: claims sao a UNICA fonte de role/status. Sem fallback
  // para `existingProfile` — o Firestore e' read-only de role/status desde
  // 5.1. Se claims nao existirem, defaults seguros sao aplicados.
  const role = claims?.role ?? 'user'
  const status = normalizeProfileStatus(claims?.status)

  return {
    uid: user.uid,
    name: user.displayName ?? existingProfile?.name ?? user.email ?? 'Usuário',
    email: normalizeCorporateEmail(user.email ?? existingProfile?.email ?? ''),
    role,
    area: existingProfile?.area ?? 'Geral',
    status,
    statusTone: getDefaultStatusTone(status),
    lastAccess: existingProfile?.lastAccess ?? getDefaultLastAccess(status),
    scopes: getRolePermissions(role),
    favoriteProcessIds: existingProfile?.favoriteProcessIds ?? [],
    notes: existingProfile?.notes ?? getDefaultNotes(status),
  }
}

async function ensureUserProfile(user, { forceRefresh = false } = {}) {
  const userRef = doc(firestore, 'users', user.uid)
  const snapshot = firestore ? await getDoc(userRef) : null
  const existingProfile = snapshot?.exists() ? snapshot.data() : null
  // Claims sao SEMPRE a fonte primaria (L18). forceRefresh apos um
  // adminUpdateUserClaims garante que o novo role/status seja visto
  // sem precisar de logout/login.
  const claims = await getUserClaims(user, { forceRefresh })
  const baseProfile = buildBaseProfile(user, claims, existingProfile)
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
    return profile
  }

  const mergedProfile = {
    ...snapshot.data(),
    uid: user.uid,
    email: baseProfile.email,
    name: user.displayName ?? snapshot.data().name ?? snapshot.data().email ?? 'Usuário',
    lastAccess:
      normalizeProfileStatus(claims.status) === 'Ativo'
        ? now
        : snapshot.data().lastAccess ?? baseProfile.lastAccess,
    updatedAt: serverTimestamp(),
  }

  // NAO persistimos role/status aqui — fonte da verdade sao as custom
  // claims (L18). Apenas espelhamos metadata (name, email, lastAccess).
  // O callable `adminUpdateUserClaims` e' a unica porta de entrada para
  // alteracao de role/status; ver [[Limitações conhecidas]] L18.
  await setDoc(userRef, mergedProfile, { merge: true })

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

    // O envio do email não pode travar o cadastro. Se falhar aqui,
    // o usuário ainda consegue reenviar na tela de verificação.
    requestCustomVerificationEmail().catch((error) => {
      console.error('Falha ao enviar email de verificação após cadastro.', error)
    })
  }

  async function logout() {
    if (!auth) {
      return
    }

    await signOut(auth)
  }

  async function requestPasswordReset(email) {
    if (!auth) {
      throw new Error('Firebase Auth não configurado.')
    }

    if (!isAllowedCorporateEmail(email)) {
      throw new Error('Use um email corporativo @sqquimica.com.')
    }

    setAuthError('')
    await requestCustomPasswordResetEmail(normalizeCorporateEmail(email))
  }

  async function resendVerificationEmail(payload) {
    if (!auth) {
      throw new Error('Firebase Auth não configurado.')
    }

    setAuthError('')
    return requestCustomVerificationEmail(payload)
  }

  async function refreshAuthenticatedUser({ forceClaimsRefresh = false } = {}) {
    if (!auth?.currentUser) {
      return null
    }

    await reload(auth.currentUser)
    const refreshedUser = auth.currentUser
    const refreshedProfile = await ensureUserProfile(refreshedUser, {
      forceRefresh: forceClaimsRefresh,
    })
    setUser({ ...refreshedUser })
    setProfile(refreshedProfile)
    return refreshedUser
  }

  async function confirmEmailVerification(oobCode) {
    if (!auth) {
      throw new Error('Firebase Auth não configurado.')
    }

    const normalizedCode = String(oobCode ?? '').trim()

    if (!normalizedCode) {
      throw new Error('Código de verificação não informado.')
    }

    await applyActionCode(auth, normalizedCode)
    return refreshAuthenticatedUser()
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
      }

      return {
        ...currentProfile,
        favoriteProcessIds: nextFavorites,
      }
    })
  }

  const value = useMemo(
    () => {
      const isEmailVerified = user?.emailVerified === true
      const hasAccess = normalizeProfileStatus(profile?.status) === 'Ativo'

      return {
        user,
        profile,
        loading,
        authError,
        isAuthenticated: Boolean(user),
        isEmailVerified,
        hasAccess,
        isApproved: hasAccess,
        login,
        register,
        logout,
        requestPasswordReset,
        resendVerificationEmail,
        refreshAuthenticatedUser,
        confirmEmailVerification,
        toggleFavoriteProcess,
      }
    },
    [authError, loading, profile, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
