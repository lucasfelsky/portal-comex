import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore/lite'
import { isFirebaseConfigured, firestore } from '../lib/firebase'
import { adminUsersSeed } from '../data/mockData'
import { getRolePermissions } from '../features/admin/rolePermissions'
import { createAuditEvent } from './auditRepository'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'

const STORAGE_KEY = 'sq-comex-users'

async function recordUserAudit(event) {
  try {
    await createAuditEvent(event)
  } catch (error) {
    console.error('Falha ao registrar auditoria de usuário.', error)
  }
}

function normalizeUser(rawUser, fallbackId) {
  const role = rawUser.role ?? 'user'
  const resolvedId =
    typeof rawUser.id === 'string' && rawUser.id.trim()
      ? rawUser.id.trim()
      : typeof rawUser.uid === 'string' && rawUser.uid.trim()
        ? rawUser.uid.trim()
        : fallbackId

  return {
    id: resolvedId,
    name: rawUser.name ?? '',
    email: rawUser.email ?? '',
    role,
    area: rawUser.area ?? '',
    status: rawUser.status ?? 'Pendente',
    statusTone: rawUser.statusTone ?? 'warn',
    lastAccess: rawUser.lastAccess ?? 'Aguardando primeiro acesso',
    scopes: rawUser.scopes?.length ? rawUser.scopes : getRolePermissions(role),
    favoriteProcessIds: rawUser.favoriteProcessIds ?? [],
    notes: rawUser.notes ?? '',
  }
}

function readLocalUsers() {
  const storedUsers = window.localStorage.getItem(STORAGE_KEY)

  if (!storedUsers) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(adminUsersSeed))
    return adminUsersSeed
  }

  try {
    return JSON.parse(storedUsers)
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(adminUsersSeed))
    return adminUsersSeed
  }
}

function writeLocalUsers(users) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users))
}

function toFirestorePayload(user) {
  // Sprint 5.1 / L18: NAO inclui role/status/statusTone aqui — a fonte
  // da verdade sao as custom claims (atualizadas pelo callable). Incluir
  // faria o write falhar na rule `isAdminUserFieldsUpdate` (que so permite
  // 6 campos no update de admin).
  return {
    uid: user.id,
    name: user.name,
    email: user.email,
    area: user.area,
    lastAccess: user.lastAccess,
    scopes: user.scopes,
    favoriteProcessIds: user.favoriteProcessIds ?? [],
    notes: user.notes,
    updatedAt: serverTimestamp(),
  }
}

export async function listUsers() {
  if (!isFirebaseConfigured || !firestore) {
    return readLocalUsers().map((user) => normalizeUser(user))
  }

  const usersQuery = query(collection(firestore, 'users'), orderBy('name'))
  const snapshot = await getDocs(usersQuery)

  return snapshot.docs.map((item) => normalizeUser(item.data(), item.id))
}

export async function saveUser(user, actor = null) {
  const normalizedUser = normalizeUser(user, user.id)

  if (!isFirebaseConfigured || !firestore) {
    const currentUsers = readLocalUsers()
    const existingIndex = currentUsers.findIndex((item) => item.id === normalizedUser.id)

    if (existingIndex >= 0) {
      currentUsers[existingIndex] = normalizedUser
    } else {
      currentUsers.unshift(normalizedUser)
    }

    writeLocalUsers(currentUsers)
    await recordUserAudit({
      action: existingIndex >= 0 ? 'Usuário atualizado' : 'Usuário criado',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: normalizedUser.id,
    })
    return normalizedUser
  }

  // S3: em producao, role/status vao via callable para garantir que as custom
  // claims batam com o que foi persistido. O `setDoc` abaixo grava o espelho
  // em `users/{uid}` para exibicao. Em modo dev/local, mantemos o setDoc
  // direto (callable exige emulador).
  if (functions) {
    try {
      const updateClaims = httpsCallable(functions, 'adminUpdateUserClaims')
      await updateClaims({
        uid: normalizedUser.id,
        role: normalizedUser.role,
        status: normalizedUser.status,
      })
    } catch (error) {
      console.error('Falha ao sincronizar custom claims do usuario.', error)
      // Nao bloqueia o save — a role ainda vai como espelho em `users/{uid}`.
    }
  }

  await setDoc(
    doc(firestore, 'users', normalizedUser.id),
    toFirestorePayload(normalizedUser),
    { merge: true }
  )

  await recordUserAudit({
    action: 'Usuário atualizado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedUser.id,
  })

  return normalizedUser
}

export async function createUser(user, actor = null) {
  const generatedId = user.id || `USR-${Date.now()}`
  const normalizedUser = normalizeUser(
    {
      ...user,
      status: user.status ?? 'Pendente',
      statusTone: user.statusTone ?? 'warn',
    },
    generatedId
  )

  if (!isFirebaseConfigured || !firestore) {
    const currentUsers = readLocalUsers()
    currentUsers.unshift(normalizedUser)
    writeLocalUsers(currentUsers)
    await recordUserAudit({
      action: 'Usuário criado',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: normalizedUser.id,
    })
    return normalizedUser
  }

  await setDoc(doc(firestore, 'users', normalizedUser.id), toFirestorePayload(normalizedUser), {
    merge: true,
  })
  await recordUserAudit({
    action: 'Usuário criado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedUser.id,
  })
  return normalizedUser
}

export async function deleteUser(userId, actor = null) {
  if (!isFirebaseConfigured || !firestore) {
    const nextUsers = readLocalUsers().filter((item) => normalizeUser(item).id !== userId)
    writeLocalUsers(nextUsers)
    await recordUserAudit({
      action: 'Usuário removido',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: userId,
    })
    return
  }

  await deleteDoc(doc(firestore, 'users', userId))
  await recordUserAudit({
    action: 'Usuário removido',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: userId,
  })
}
