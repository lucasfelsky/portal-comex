import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { createAuditEvent } from './auditRepository'

const STORAGE_KEY = 'sq-comex-bar-status'
const DOCUMENT_ID = 'current'

export const BAR_STATUS_OPTIONS = [
  { value: 'PRATICAVEL', label: 'PRATICAVEL', tone: 'ok' },
  { value: 'PRATICAVEL_RESTRICOES', label: 'PRATICAVEL C/ RESTRICOES', tone: 'warn' },
  { value: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' },
]

function getDefaultBarStatus() {
  return {
    id: DOCUMENT_ID,
    status: 'PRATICAVEL',
    notes: 'Sem apontamentos operacionais no momento.',
    updatedAt: new Date().toISOString(),
  }
}

function normalizeBarStatus(rawStatus) {
  const fallback = getDefaultBarStatus()
  const statusValue = rawStatus?.status ?? fallback.status
  const statusMeta =
    BAR_STATUS_OPTIONS.find((option) => option.value === statusValue) ?? BAR_STATUS_OPTIONS[0]

  return {
    id: rawStatus?.id ?? DOCUMENT_ID,
    status: statusMeta.value,
    label: statusMeta.label,
    tone: statusMeta.tone,
    notes: rawStatus?.notes ?? fallback.notes,
    updatedAt: rawStatus?.updatedAt ?? fallback.updatedAt,
  }
}

function readLocalStatus() {
  const storedStatus = window.localStorage.getItem(STORAGE_KEY)

  if (!storedStatus) {
    return getDefaultBarStatus()
  }

  try {
    return JSON.parse(storedStatus)
  } catch {
    return getDefaultBarStatus()
  }
}

function writeLocalStatus(status) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status))
}

export async function getBarStatus() {
  if (!isFirebaseConfigured || !firestore) {
    return normalizeBarStatus(readLocalStatus())
  }

  const snapshot = await getDoc(doc(firestore, 'barra', DOCUMENT_ID))

  if (!snapshot.exists()) {
    return getDefaultBarStatus()
  }

  const data = snapshot.data()

  return normalizeBarStatus({
    id: snapshot.id,
    ...data,
    updatedAt:
      typeof data.updatedAt?.toDate === 'function' ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  })
}

export async function saveBarStatus(status, actor = null) {
  const normalizedStatus = normalizeBarStatus(status)
  const now = new Date().toISOString()

  if (!isFirebaseConfigured || !firestore) {
    const nextStatus = {
      ...normalizedStatus,
      updatedAt: now,
    }

    writeLocalStatus(nextStatus)
    await createAuditEvent({
      action: 'Status da barra atualizado',
      actor: actor?.name ?? actor?.email ?? 'Sistema local',
      target: normalizedStatus.label,
    })
    return nextStatus
  }

  await setDoc(
    doc(firestore, 'barra', DOCUMENT_ID),
    {
      status: normalizedStatus.status,
      notes: normalizedStatus.notes,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  await createAuditEvent({
    action: 'Status da barra atualizado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: normalizedStatus.label,
  })

  return {
    ...normalizedStatus,
    updatedAt: now,
  }
}
