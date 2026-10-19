import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite'
import { firestore, isFirebaseConfigured } from '../lib/firebase'
import { repairTextEncoding } from '../utils/textEncoding'
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

// Converte timestamp do Firestore (toDate) em ISO; string passa direto; resto vira null.
function toIsoOrNull(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString()
  if (typeof value === 'string' && value) return value
  return null
}

// F13: le a leitura gravada pelo cron syncBarStatus.mjs em `barra/suggestion`
// (via service account/REST). Read admin-only nas rules. O script le o
// `cond_barra` da Praticagem ZP21, grava aqui a leitura + campos de saude
// (lastAttemptAt/lastSuccessAt/lastError) e APLICA em barra/current quando o
// status do site muda (o botao Aplicar do AdminBarStatusPanel segue disponivel
// via saveBarStatus). Retorna null quando o Firebase nao esta configurado ou o
// doc nao existe. Com doc existente devolve SEMPRE um objeto (mesmo so com campos
// de falha, para o alerta aparecer antes da 1a leitura boa); status/label/tone
// ficam null quando o status gravado nao bate com o enum conhecido (defensivo —
// o admin nunca deve poder "aplicar" um status invalido).
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
  const fetchedAt = toIsoOrNull(data.fetchedAt)

  return {
    status: statusMeta?.value ?? null,
    label: statusMeta?.label ?? null,
    tone: statusMeta?.tone ?? null,
    sourceName: data.sourceName ?? 'Fonte externa',
    sourceUrl: data.sourceUrl ?? '',
    fetchedAt,
    siteDescription: repairTextEncoding(data.siteDescription ?? '') || '',
    restriction: repairTextEncoding(data.restriction ?? '') || '',
    lastAttemptAt: toIsoOrNull(data.lastAttemptAt),
    lastSuccessAt: toIsoOrNull(data.lastSuccessAt) ?? fetchedAt,
    lastError: repairTextEncoding(data.lastError ?? '') || '',
    lastErrorStage: data.lastErrorStage ?? '',
    lastAppliedAt: toIsoOrNull(data.lastAppliedAt),
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
