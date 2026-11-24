import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore/lite'
import { auth, firestore, isFirebaseConfigured } from '../lib/firebase'
import { ITEM_PACKAGING_SCHEMA_VERSION } from '../features/processes/cargoReportCatalog'
import { createAuditEvent } from './auditRepository'

// Tabela mestra "Item x Emb." do Relatório de Carga: doc único `cargoReportCatalog/itemPackaging`
// (admin grava, admin e logística leem; rules em firestore.rules). `version` é trava otimista:
// o cliente grava dentro de `runTransaction` e a rule exige `version == versão atual + 1`.
const STORAGE_KEY = 'sq-comex-item-packaging-catalog'
const COLLECTION_ID = 'cargoReportCatalog'
const DOCUMENT_ID = 'itemPackaging'
const MAX_ACTOR_NAME = 120

export const ITEM_PACKAGING_VERSION_CONFLICT_CODE = 'catalog/version-conflict'
const NOT_AUTHENTICATED_MESSAGE = 'Usuário não autenticado: não foi possível gravar a tabela.'

function text(value) {
  return typeof value === 'string' ? value : ''
}

// Itens com shape inesperado viram campos vazios (`''`/`null`) em vez de quebrar a leitura.
function normalizeStoredItem(item) {
  const weight = item?.netWeightKg
  return {
    code: text(item?.code),
    description: text(item?.description),
    packagingType: text(item?.packagingType),
    netWeightKg: typeof weight === 'number' && Number.isFinite(weight) ? weight : null,
  }
}

function toDateOrNull(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function buildResult(data, exists) {
  if (!exists || !data) {
    return {
      exists: false,
      version: 0,
      items: [],
      itemCount: 0,
      sourceFileName: '',
      sourceSheetName: '',
      sourceSha256: '',
      importedAt: null,
      importedById: '',
      importedByName: '',
    }
  }

  const items = Array.isArray(data.items) ? data.items.map(normalizeStoredItem) : []
  const version = Number.isInteger(data.version) ? data.version : 0

  return {
    exists: true,
    version,
    items,
    itemCount: items.length,
    sourceFileName: text(data.sourceFileName),
    sourceSheetName: text(data.sourceSheetName),
    sourceSha256: text(data.sourceSha256),
    importedAt: toDateOrNull(data.importedAt),
    importedById: text(data.importedById),
    importedByName: text(data.importedByName),
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
  return Object.assign(new Error('version-conflict'), { code: ITEM_PACKAGING_VERSION_CONFLICT_CODE })
}

function resolveActorName(actor) {
  const name = actor?.name ?? actor?.email ?? 'Usuário'
  return String(name).slice(0, MAX_ACTOR_NAME)
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('pt-BR')
}

export async function getItemPackagingCatalog() {
  if (!isFirebaseConfigured || !firestore) {
    const local = readLocalCatalog()
    return buildResult(local, local !== undefined)
  }

  const snapshot = await getDoc(doc(firestore, COLLECTION_ID, DOCUMENT_ID))
  return buildResult(snapshot.exists() ? snapshot.data() : undefined, snapshot.exists())
}

// -> { version, itemCount }. `expectedVersion`: versão que serviu de base à prévia (0 = sem tabela).
// Se outra importação gravou no meio, lança `{ code: 'catalog/version-conflict' }` sem gravar nada.
export async function saveItemPackagingCatalog(
  { items, sourceFileName, sourceSheetName, sourceSha256, expectedVersion, summary },
  actor = null
) {
  const nextVersion = expectedVersion + 1
  const actorName = resolveActorName(actor)
  const payload = {
    schemaVersion: ITEM_PACKAGING_SCHEMA_VERSION,
    version: nextVersion,
    items,
    itemCount: items.length,
    sourceFileName,
    sourceSheetName,
    sourceSha256,
    importedByName: actorName,
  }

  if (!isFirebaseConfigured || !firestore) {
    const local = readLocalCatalog()
    const currentVersion = Number.isInteger(local?.version) ? local.version : 0
    if (currentVersion !== expectedVersion) throw versionConflictError()

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, importedAt: new Date().toISOString(), importedById: 'local' })
    )
  } else {
    const uid = auth?.currentUser?.uid
    if (!uid) throw new Error(NOT_AUTHENTICATED_MESSAGE)

    const ref = doc(firestore, COLLECTION_ID, DOCUMENT_ID)
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(ref)
      const currentVersion = snapshot.exists() && Number.isInteger(snapshot.data().version) ? snapshot.data().version : 0
      if (currentVersion !== expectedVersion) throw versionConflictError()

      // Sem `merge`: o doc inteiro é substituído, como a rule exige.
      transaction.set(ref, { ...payload, importedAt: serverTimestamp(), importedById: uid })
    })
  }

  // Auditoria é melhor-esforço: a tabela já foi gravada, falha aqui não vira erro na tela.
  try {
    await createAuditEvent({
      action: 'Tabela Item x Emb. importada',
      actor: actor?.name ?? actor?.email ?? 'Sistema',
      target: `Versão ${nextVersion} · ${formatCount(items.length)} itens · +${summary?.added ?? 0} novos · ~${summary?.changed ?? 0} alterados · -${summary?.removed ?? 0} removidos · ${sourceFileName}`,
    })
  } catch {
    // ignorado de propósito
  }

  return { version: nextVersion, itemCount: items.length }
}
