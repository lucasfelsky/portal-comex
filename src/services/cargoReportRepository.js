import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite'
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase'
import {
  CARGO_REPORT_ATTACHED_NOT_SAVED_CODE,
  CARGO_REPORT_CONFLICT_CODE,
} from '../features/processes/cargoReportFormModel'
import { createAuditEvent } from './auditRepository'
import { uploadProcessDocument } from './processDocumentsRepository'

// Formulário FR.CMX.001 (S3 do Relatório de Carga): 2 docs nomeados por processo.
//   processes/{id}/cargoReport/current     preenchimento do COMEX (só admin grava; `concluido` = parte do COMEX fechada)
//   processes/{id}/cargoReport/conference  OK?, contagem, etiquetas WMS/SQ, "Conferido por" automático e recebimento
//                                          (S7: só a logística grava e fecha; o admin só reabre)
// `revision` é trava otimista: a rule exige `revision == revisão atual + 1`.
const STORAGE_PREFIX = 'sq-comex-cargo-report:'
const COLLECTION_ID = 'processes'
const SUBCOLLECTION_ID = 'cargoReport'
const CURRENT_ID = 'current'
const CONFERENCE_ID = 'conference'
const DAMAGE_ID = 'damage'
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

// `scope` (S7) diz qual doc mudou no servidor: 'current' (COMEX alterou ou reabriu) ou 'conference'.
function revisionConflictError(scope = '') {
  return Object.assign(new Error('revision-conflict'), { code: CARGO_REPORT_CONFLICT_CODE, ...(scope ? { scope } : {}) })
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

// S10-J2b: espelho das avarias da conferência (`processes/{id}/cargoReport/damage`, gravado por trigger no fechamento).
// -> dados com `updatedAt` como Date|null, ou `null` se não existe (ou sem Firebase: o espelho só existe no servidor).
export async function getCargoConferenceDamage(processId) {
  if (!isFirebaseConfigured || !firestore) return null

  const snapshot = await getDoc(cargoReportRef(processId, DAMAGE_ID))
  return snapshot.exists() ? withDate(snapshot.data()) : null
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
// `audits` só aceita escrita de admin: a conferência da logística não gera evento (S7: o admin não grava
// mais o conteúdo da conferência, então o ramo de auditoria abaixo fica inerte).
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

// Reabre a parte do COMEX (`current` volta a rascunho). A rule nega enquanto a conferência está fechada:
// a tela reabre a conferência antes (`reopenCargoReportConference`).
export async function reopenCargoReport(processId, payload, actor = null) {
  await writeDocument(processId, CURRENT_ID, payload, actor)

  await tryAudit({
    action: 'Relatório de carga reaberto para correção',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: `${payload.titleSuffix} · revisão ${payload.revision}`,
  })

  return { revision: payload.revision }
}

// ---------- S7: fechar e reabrir a conferência da logística ----------

async function readServerDocument(processId, documentId) {
  if (!isFirebaseConfigured || !firestore) return readLocalReport(processId)[documentId]
  const snapshot = await getDoc(cargoReportRef(processId, documentId))
  return snapshot.exists() ? snapshot.data() : null
}

function readRevision(data) {
  return Number.isInteger(data?.revision) ? data.revision : 0
}

// Grava a conferência já fechada, apontando para o Excel anexado (`closedDocumentId`).
async function writeClosedConference(processId, { payload, documentId, actor }) {
  await writeDocument(processId, CONFERENCE_ID, { ...payload, closedDocumentId: documentId }, actor)
  return { revision: payload.revision, documentId }
}

// A revisão que já está salva no servidor viaja no erro (não enumerável) para a tela passar a refletir a conferência
// aberta gravada e o próximo "Salvar e fechar" não dar conflito.
function withSavedRevision(error, revision) {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, 'savedRevision', { value: revision, configurable: true })
  }
  return error
}

// Ordem (S10-J2b): (a) relê `current` e `conference` no servidor, sem gravar nem anexar nada se houver conflito
// (COMEX alterou ou reabriu depois que a tela abriu, ou a conferência mudou); (b) grava a conferência ABERTA
// (`openPayload`, r+1) com o conteúdo final: o aviso do servidor lê esse conteúdo; (c) anexa o xlsx pelo fluxo normal
// de documentos como a logística (o servidor rotaciona as versões e manda o aviso da conferência); (d) grava a
// conferência como fechada (`payload`, r+2), apontando para o anexo. Se (c) falhar, o erro leva `savedRevision`
// (a conferência ficou salva em r+1). Se (d) falhar depois do anexo, o erro leva o `documentId`
// (`cargoReport/attached-not-saved`) e também `savedRevision`, para a tela oferecer "Gravar de novo" sem anexar outra vez.
export async function closeCargoReportConference(
  processId,
  { openPayload, payload, file, category, actor, currentRevision } = {}
) {
  if (!isFirebaseConfigured || !firestore) throw new Error(NO_FIREBASE_MESSAGE)

  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)

  const [current, conference] = await Promise.all([
    readServerDocument(processId, CURRENT_ID),
    readServerDocument(processId, CONFERENCE_ID),
  ])
  if (current?.status !== 'concluido' || readRevision(current) !== currentRevision) {
    throw revisionConflictError('current')
  }
  if (readRevision(conference) !== openPayload.revision - 1) throw revisionConflictError('conference')

  await writeDocument(processId, CONFERENCE_ID, openPayload, actor)

  let uploaded
  try {
    uploaded = await uploadProcessDocument(processId, {
      type: 'cargoReport',
      file,
      category,
      actor: { uid: actor?.uid ?? uid, name: actor?.name, role: actor?.role },
    })
  } catch (error) {
    throw withSavedRevision(error, openPayload.revision)
  }

  try {
    return await writeClosedConference(processId, { payload, documentId: uploaded.id, actor })
  } catch (error) {
    throw withSavedRevision(attachedNotSavedError(uploaded.id, error), openPayload.revision)
  }
}

// Só o passo (c), para o botão "Gravar de novo": o arquivo já está anexado e o aviso já saiu.
export async function retryCloseConferenceWrite(processId, { payload, documentId, actor } = {}) {
  const uid = auth?.currentUser?.uid
  if (isFirebaseConfigured && firestore && !uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)
  return writeClosedConference(processId, { payload, documentId, actor })
}

// Só o admin reabre. Relê o doc do servidor e grava a cópia EXATA do conteúdo com `revision + 1`, status
// `aberta` e a trilha de fechamento zerada: a rule só aceita mudança nessas chaves (e nos carimbos).
export async function reopenCargoReportConference(processId, actor = null) {
  const server = await readServerDocument(processId, CONFERENCE_ID)
  if (!server || server.status !== 'fechada') throw revisionConflictError('conference')

  // `updatedAt/ById/ByName` são refeitos por `writeDocument`.
  // S8: conferência fechada antes da S8 não tem as chaves da descarga/etiquetagem; o padrão entra ANTES do spread
  // (o valor do servidor vence) para a rule `hasAll` aceitar. É o único "acréscimo" que a rule de reabrir permite.
  const content = { unloadStartAt: '', unloadEndAt: '', labelingOk: false, ...server }
  for (const key of ['updatedAt', 'updatedById', 'updatedByName']) delete content[key]
  const payload = {
    ...content,
    revision: readRevision(server) + 1,
    status: 'aberta',
    closedDate: '',
    closedById: '',
    closedByName: '',
    closedDocumentId: '',
  }
  await writeDocument(processId, CONFERENCE_ID, payload, actor)

  await tryAudit({
    action: 'Conferência do relatório de carga reaberta',
    actor: actor?.name ?? actor?.email ?? 'Sistema',
    target: `Conferência reaberta · revisão ${payload.revision}`,
  })

  return { revision: payload.revision }
}
