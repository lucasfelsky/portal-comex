import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore/lite'
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase'
import {
  SUPPLIER_PACKAGING_SCHEMA_VERSION,
  checkSupplierPackagingLimits,
  withSupplierPackagingEntry,
} from '../features/processes/cargoSupplierPackaging'
import { createAuditEvent } from './auditRepository'

// Embalagens por item + fornecedor do Relatório de Carga (S9-D): doc único `cargoReportCatalog/supplierPackaging`
// (admin grava; admin e logística leem; rules em firestore.rules). `version` é trava otimista: o cliente grava dentro
// de `runTransaction` e a rule exige `version == versão atual + 1`. Sem Firebase configurado (modo local) o doc vive
// em `localStorage`.
const STORAGE_KEY = 'sq-comex-supplier-packaging-catalog'
const COLLECTION_ID = 'cargoReportCatalog'
const DOCUMENT_ID = 'supplierPackaging'
const MAX_ACTOR_NAME = 120

export const SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE = 'catalog/version-conflict'
export const SUPPLIER_PACKAGING_LIMIT_CODE = 'catalog/limit'
const NOT_AUTHENTICATED_MESSAGE = 'Usuário não autenticado: não foi possível gravar o cadastro.'

function text(value) {
  return typeof value === 'string' ? value : ''
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Itens com shape inesperado viram campos vazios (`''`/`null`) em vez de quebrar a leitura.
function normalizeStoredEntry(entry) {
  return {
    code: text(entry?.code),
    supplierKey: text(entry?.supplierKey),
    supplierName: text(entry?.supplierName),
    packagingType: text(entry?.packagingType),
    netWeightKg: numberOrNull(entry?.netWeightKg),
    packageWeightKg: numberOrNull(entry?.packageWeightKg),
  }
}

function normalizeStoredAlias(alias) {
  return { fromKey: text(alias?.fromKey), toKey: text(alias?.toKey) }
}

function toDateOrNull(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function buildResult(data, exists) {
  if (!exists || !data) {
    return { exists: false, version: 0, entries: [], entryCount: 0, aliases: [], updatedAt: null, updatedById: '', updatedByName: '' }
  }
  const entries = Array.isArray(data.entries) ? data.entries.map(normalizeStoredEntry) : []
  const aliases = Array.isArray(data.aliases) ? data.aliases.map(normalizeStoredAlias) : []
  return {
    exists: true,
    version: Number.isInteger(data.version) ? data.version : 0,
    entries,
    entryCount: entries.length,
    aliases,
    updatedAt: toDateOrNull(data.updatedAt),
    updatedById: text(data.updatedById),
    updatedByName: text(data.updatedByName),
  }
}

function readLocalCatalog() {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return undefined
  try {
    return JSON.parse(stored)
  } catch {
    return undefined
  }
}

function versionConflictError() {
  return Object.assign(new Error('version-conflict'), { code: SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE })
}

function limitError(message) {
  return Object.assign(new Error(message), { code: SUPPLIER_PACKAGING_LIMIT_CODE })
}

function resolveActorName(actor) {
  const name = actor?.name ?? actor?.email ?? 'Usuário'
  return String(name).slice(0, MAX_ACTOR_NAME)
}

function currentVersionOf(data) {
  return Number.isInteger(data?.version) ? data.version : 0
}

function buildPayload({ entries, aliases, version, actorName }) {
  return {
    schemaVersion: SUPPLIER_PACKAGING_SCHEMA_VERSION,
    version,
    entries,
    entryCount: entries.length,
    aliases,
    updatedByName: actorName,
  }
}

// Auditoria é melhor-esforço: o cadastro já foi gravado, falha aqui não vira erro na tela.
async function audit(action, target, actor) {
  try {
    await createAuditEvent({ action, actor: actor?.name ?? actor?.email ?? 'Sistema', target })
  } catch {
    // ignorado de propósito
  }
}

// Lê o cadastro. Sem o doc (ou sem Firebase) devolve `exists: false` com listas vazias.
export async function getSupplierPackagingCatalog() {
  if (!isFirebaseConfigured || !firestore) {
    const local = readLocalCatalog()
    return buildResult(local, local !== undefined)
  }
  const snapshot = await getDoc(doc(firestore, COLLECTION_ID, DOCUMENT_ID))
  return buildResult(snapshot.exists() ? snapshot.data() : undefined, snapshot.exists())
}

// Grava o conteúdo inteiro (importação e "juntar nomes"). -> cadastro gravado (mesmo formato de `get`).
// `expectedVersion`: versão que serviu de base à prévia (0 = sem cadastro). Se outra gravação entrou no meio,
// lança `{ code: 'catalog/version-conflict' }` sem gravar nada. `summary` só alimenta o texto da auditoria.
export async function saveSupplierPackagingCatalog({ entries, aliases }, { expectedVersion, actor = null, summary } = {}) {
  const tooBig = checkSupplierPackagingLimits(entries, aliases)
  if (tooBig) throw limitError(tooBig)

  const nextVersion = expectedVersion + 1
  const payload = buildPayload({ entries, aliases, version: nextVersion, actorName: resolveActorName(actor) })

  if (!isFirebaseConfigured || !firestore) {
    if (currentVersionOf(readLocalCatalog()) !== expectedVersion) throw versionConflictError()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, updatedAt: new Date().toISOString(), updatedById: 'local' })
    )
  } else {
    const uid = auth?.currentUser?.uid
    if (!uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)

    const ref = doc(firestore, COLLECTION_ID, DOCUMENT_ID)
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(ref)
      if (currentVersionOf(snapshot.exists() ? snapshot.data() : null) !== expectedVersion) throw versionConflictError()
      // Sem `merge`: o doc inteiro é substituído, como a rule exige.
      transaction.set(ref, { ...payload, updatedAt: serverTimestamp(), updatedById: uid })
    })
  }

  await audit(
    'Embalagens por fornecedor atualizadas',
    `Versão ${nextVersion} · ${entries.length.toLocaleString('pt-BR')} embalagens · ${aliases.length.toLocaleString('pt-BR')} nomes juntados` +
      (summary ? ` · +${summary.added ?? 0} novas · ~${summary.changed ?? 0} alteradas · -${summary.removed ?? 0} removidas` : ''),
    actor
  )
  return buildResult({ ...payload, updatedAt: new Date(), updatedById: auth?.currentUser?.uid ?? 'local' }, true)
}

// "Cadastrar para <fornecedor>": acrescenta ou troca UMA entrada (mesmo código + fornecedor) sobre a versão atual,
// dentro da transação (sem `expectedVersion`: o cliente não precisa ter o cadastro inteiro em mãos). Preserva as
// demais entradas e os aliases. -> cadastro gravado (mesmo formato de `get`).
export async function upsertSupplierPackagingEntry(entry, actor = null) {
  const actorName = resolveActorName(actor)
  let saved

  if (!isFirebaseConfigured || !firestore) {
    const local = readLocalCatalog()
    const current = buildResult(local, local !== undefined)
    const entries = withSupplierPackagingEntry(current.entries, entry)
    const tooBig = checkSupplierPackagingLimits(entries, current.aliases)
    if (tooBig) throw limitError(tooBig)
    const payload = buildPayload({ entries, aliases: current.aliases, version: current.version + 1, actorName })
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, updatedAt: new Date().toISOString(), updatedById: 'local' })
    )
    saved = buildResult({ ...payload, updatedAt: new Date(), updatedById: 'local' }, true)
  } else {
    const uid = auth?.currentUser?.uid
    if (!uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)

    const ref = doc(firestore, COLLECTION_ID, DOCUMENT_ID)
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(ref)
      const current = buildResult(snapshot.exists() ? snapshot.data() : undefined, snapshot.exists())
      const entries = withSupplierPackagingEntry(current.entries, entry)
      const tooBig = checkSupplierPackagingLimits(entries, current.aliases)
      if (tooBig) throw limitError(tooBig)
      const payload = buildPayload({ entries, aliases: current.aliases, version: current.version + 1, actorName })
      transaction.set(ref, { ...payload, updatedAt: serverTimestamp(), updatedById: uid })
      saved = buildResult({ ...payload, updatedAt: new Date(), updatedById: uid }, true)
    })
  }

  await audit('Embalagem por fornecedor cadastrada', `${entry.code} · ${entry.supplierName} · versão ${saved.version}`, actor)
  return saved
}
