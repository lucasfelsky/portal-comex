import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { createAuditEvent } from './auditRepository'

const STORAGE_KEY = 'sq-comex-bar-status'
const DOCUMENT_ID = 'current'
const SUGGESTION_DOCUMENT_ID = 'suggestion'

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

// F13 (backlog 2026-07-12): le a SUGESTAO gravada pelo cron syncBarStatus.mjs
// em `barra/suggestion` (via service account/REST). Read admin-only nas rules.
// Retorna null quando nao ha sugestao, quando o Firebase nao esta configurado,
// ou quando o status sugerido nao bate com o enum conhecido (defensivo — o
// admin nunca deve poder "aplicar" um status invalido). NUNCA toca
// barra/current — a decisao de aplicar continua humana (botao Aplicar no
// AdminBarStatusPanel chama saveBarStatus).
export async function getBarSuggestion() {
  if (!isFirebaseConfigured || !firestore) {
    return null
  }

  const snapshot = await getDoc(doc(firestore, 'barra', SUGGESTION_DOCUMENT_ID))

  if (!snapshot.exists()) {
    return null
  }

  const data = snapshot.data()
  const statusMeta = BAR_STATUS_OPTIONS.find((option) => option.value === data.status)

  if (!statusMeta) {
    return null
  }

  return {
    status: statusMeta.value,
    label: statusMeta.label,
    tone: statusMeta.tone,
    sourceName: data.sourceName ?? 'Fonte externa',
    sourceUrl: data.sourceUrl ?? '',
    fetchedAt:
      typeof data.fetchedAt?.toDate === 'function'
        ? data.fetchedAt.toDate().toISOString()
        : data.fetchedAt ?? null,
  }
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
