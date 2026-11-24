import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite'
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase'
import {
  CARGO_REPORT_ATTACHED_NOT_SAVED_CODE,
  CARGO_REPORT_CONFLICT_CODE,
} from '../features/processes/cargoReportFormModel'
import { createAuditEvent } from './auditRepository'
import { uploadProcessDocument } from './processDocumentsRepository'

// Formulário FR.CMX.001 (S3 do Relatório de Carga): 2 docs nomeados por processo.
//   processes/{id}/cargoReport/current     preenchimento do COMEX (só admin grava)
//   processes/{id}/cargoReport/conference  OK?, contagem, etiquetas WMS/SQ e "Conferido por" (admin e logística gravam)
// `revision` é trava otimista: a rule exige `revision == revisão atual + 1`.
const STORAGE_PREFIX = 'sq-comex-cargo-report:'
const COLLECTION_ID = 'processes'
const SUBCOLLECTION_ID = 'cargoReport'
const CURRENT_ID = 'current'
const CONFERENCE_ID = 'conference'
const NOT_AUTHENTICATED_MESSAGE = 'Usuário não autenticado: não foi possível gravar o relatório de carga.'

function toDateOrNull(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function withDate(data) {
  return data ? { ...data, updatedAt: toDateOrNull(data.updatedAt) } : null
}

function readLocalReport(processId) {
  const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${processId}`)
  if (!stored) return { current: null, conference: null }

  try {
    const parsed = JSON.parse(stored)
    return { current: parsed?.current ?? null, conference: parsed?.conference ?? null }
  } catch {
    return { current: null, conference: null }
  }
}

function writeLocalReport(processId, report) {
  window.localStorage.setItem(`${STORAGE_PREFIX}${processId}`, JSON.stringify(report))
}

function resolveActorName(actor) {
  return String(actor?.name ?? actor?.email ?? '').trim()
}

function revisionConflictError() {
  return Object.assign(new Error('revision-conflict'), { code: CARGO_REPORT_CONFLICT_CODE })
}

function cargoReportRef(processId, documentId) {
  return doc(firestore, COLLECTION_ID, processId, SUBCOLLECTION_ID, documentId)
}

// -> { current, conference } (cada um `null` se o doc não existe; `updatedAt` como Date|null).
export async function getCargoReport(processId) {
  if (!isFirebaseConfigured || !firestore) {
    const local = readLocalReport(processId)
    return { current: withDate(local.current), conference: withDate(local.conference) }
  }

  const [currentSnapshot, conferenceSnapshot] = await Promise.all([
    getDoc(cargoReportRef(processId, CURRENT_ID)),
    getDoc(cargoReportRef(processId, CONFERENCE_ID)),
  ])

  return {
    current: currentSnapshot.exists() ? withDate(currentSnapshot.data()) : null,
    conference: conferenceSnapshot.exists() ? withDate(conferenceSnapshot.data()) : null,
  }
}

// A rule nega gravar sobre revisão antiga com `permission-denied`: relê o doc para distinguir
// conflito de falta de permissão. Qualquer outro erro (ou falha na releitura) segue como veio.
async function classifyWriteError(error, ref, nextRevision) {
  if (error?.code !== 'permission-denied') return error

  try {
    const snapshot = await getDoc(ref)
    const serverRevision = snapshot.exists() && Number.isInteger(snapshot.data().revision) ? snapshot.data().revision : 0
    if (serverRevision !== nextRevision - 1) return revisionConflictError()
  } catch {
    // sem releitura, o erro original vale
  }
  return error
}

async function writeDocument(processId, documentId, payload, actor) {
  const actorName = resolveActorName(actor)

  if (!isFirebaseConfigured || !firestore) {
    const local = readLocalReport(processId)
    const stored = local[documentId]
    const currentRevision = Number.isInteger(stored?.revision) ? stored.revision : 0
    if (currentRevision !== payload.revision - 1) throw revisionConflictError()

    writeLocalReport(processId, {
      ...local,
      [documentId]: { ...payload, updatedAt: new Date().toISOString(), updatedById: 'local', updatedByName: actorName },
    })
    return
  }

  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)

  const ref = cargoReportRef(processId, documentId)
  try {
    // Sem `merge`: o doc inteiro é substituído, como a rule exige.
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp(), updatedById: uid, updatedByName: actorName })
  } catch (error) {
    throw await classifyWriteError(error, ref, payload.revision)
  }
}

// Auditoria é melhor-esforço: o doc já foi gravado, falha aqui não vira erro na tela.
async function tryAudit(event) {
  try {
    await createAuditEvent(event)
  } catch {
    // ignorado de propósito
  }
}

// -> { revision }. Lança `{ code: 'cargoReport/revision-conflict' }` se outra pessoa gravou antes.
export async function saveCargoReportDraft(processId, payload, actor = null) {
  await writeDocument(processId, CURRENT_ID, payload, actor)

  await tryAudit({
    action: 'Relatório de carga salvo (rascunho)',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: `${payload.titleSuffix} · revisão ${payload.revision} · ${payload.rows.length} linhas`,
  })

  return { revision: payload.revision }
}

// `meta` (opcional): `{ titleSuffix, totalRows }` para o texto da auditoria.
// `audits` só aceita escrita de admin: a conferência da logística não gera evento.
export async function saveCargoReportConference(processId, payload, actor = null, meta = {}) {
  await writeDocument(processId, CONFERENCE_ID, payload, actor)

  if (actor?.role === 'admin') {
    const okCount = Object.values(payload.okByRowId).filter(Boolean).length
    const totalRows = Number.isInteger(meta?.totalRows) ? meta.totalRows : Object.keys(payload.okByRowId).length
    await tryAudit({
      action: 'Conferência do relatório de carga salva',
      actor: actor?.name ?? actor?.email ?? 'Sistema',
      target: `${meta?.titleSuffix ?? ''} · ${okCount} de ${totalRows} linhas OK`,
    })
  }

  return { revision: payload.revision }
}

// ---------- S4: concluir e anexar, reabrir ----------

const NO_FIREBASE_MESSAGE = 'Documentos disponíveis apenas com o Firebase configurado.'

function attachedNotSavedError(documentId, cause) {
  return Object.assign(new Error('attached-not-saved'), { code: CARGO_REPORT_ATTACHED_NOT_SAVED_CODE, documentId, cause })
}

// Grava `current` como concluído, apontando para o documento anexado (`lastGenerated`).
async function writeConcluded(processId, { payload, documentId, actor, uid }) {
  const lastGenerated = { documentId, revision: payload.revision, at: serverTimestamp(), byId: uid }
  await writeDocument(processId, CURRENT_ID, { ...payload, lastGenerated }, actor)

  await tryAudit({
    action: 'Relatório de carga concluído e anexado',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: `${payload.titleSuffix} · revisão ${payload.revision} · ${payload.rows.length} linhas`,
  })
  return { revision: payload.revision, documentId }
}

// Ordem: (a) confere a revisão no servidor, sem anexar nada se já houver conflito; (b) anexa o xlsx
// pelo fluxo normal de documentos (o servidor rotaciona as versões e avisa por e-mail); (c) grava o
// formulário como concluído; (d) audita. Se (c) falhar depois do anexo, o erro leva o `documentId`
// (`cargoReport/attached-not-saved`) para a tela oferecer "Gravar de novo" sem anexar outra vez.
export async function concludeCargoReport(processId, { payload, file, category, actor } = {}) {
  if (!isFirebaseConfigured || !firestore) throw new Error(NO_FIREBASE_MESSAGE)

  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)

  const snapshot = await getDoc(cargoReportRef(processId, CURRENT_ID))
  const serverRevision = snapshot.exists() && Number.isInteger(snapshot.data().revision) ? snapshot.data().revision : 0
  if (serverRevision !== payload.revision - 1) throw revisionConflictError()

  const uploaded = await uploadProcessDocument(processId, {
    type: 'cargoReport',
    file,
    category,
    actor: { uid: actor?.uid ?? uid, name: actor?.name, role: actor?.role },
  })

  try {
    return await writeConcluded(processId, { payload, documentId: uploaded.id, actor, uid })
  } catch (error) {
    throw attachedNotSavedError(uploaded.id, error)
  }
}

// Só o passo (c), para o botão "Gravar de novo": o arquivo já está anexado e o aviso já saiu.
export async function retryConcludeWrite(processId, { payload, documentId, actor } = {}) {
  const uid = auth?.currentUser?.uid
  if (isFirebaseConfigured && firestore && !uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)
  return writeConcluded(processId, { payload, documentId, actor, uid })
}

export async function reopenCargoReport(processId, payload, actor = null) {
  await writeDocument(processId, CURRENT_ID, payload, actor)

  await tryAudit({
    action: 'Relatório de carga reaberto para correção',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: `${payload.titleSuffix} · revisão ${payload.revision}`,
  })

  return { revision: payload.revision }
}
