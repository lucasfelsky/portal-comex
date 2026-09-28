// F18a: upload/lista/download/exclusao de `processes/{id}/documents`
// (metadado imutavel; a rotacao de versao e a exclusao do ARQUIVO ficam a
// cargo dos triggers `rotateProcessDocumentVersions`/`deleteProcessDocumentFile`
// - ver functions/src/process/documents.js). Server-only (sem seed local),
// mesmo padrao de `processEventsRepository.js`.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore/lite'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { firestore, isFirebaseConfigured, storage } from '../lib/firebase'
import { repairTextEncoding } from '../utils/textEncoding'
import { validateFileUpload, MAX_DOCUMENT_BYTES } from '../utils/storageUploadValidation'
import { buildDocumentSlotKey } from '../features/processes/processDocuments'

function normalizeStringValue(value) {
  return String(value ?? '').trim()
}

function sanitizeFileName(value) {
  const normalizedValue = normalizeStringValue(value)
  const fallbackValue = normalizedValue || 'documento'
  const sanitizedValue = fallbackValue.replace(/[^\w.-]+/g, '-')

  return sanitizedValue || 'documento'
}

function sanitizePathSegment(value, fallbackValue = 'x') {
  const normalizedValue = normalizeStringValue(value)
  const sanitizedValue = normalizedValue.replace(/[^\w-]+/g, '-')

  return sanitizedValue || fallbackValue
}

function timestampToIso(value) {
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return typeof value === 'string' ? value : ''
}

function normalizeDocument(rawDocument, fallbackId) {
  return {
    id: rawDocument?.id ?? fallbackId,
    type: String(rawDocument?.type ?? ''),
    slotKey: String(rawDocument?.slotKey ?? ''),
    itemId: rawDocument?.itemId ?? '',
    containerId: rawDocument?.containerId ?? '',
    poNumber: rawDocument?.poNumber ?? '',
    description: repairTextEncoding(String(rawDocument?.description ?? '')),
    name: repairTextEncoding(String(rawDocument?.name ?? '')),
    mimeType: String(rawDocument?.mimeType ?? ''),
    size: Number.isFinite(rawDocument?.size) ? Number(rawDocument.size) : 0,
    storagePath: String(rawDocument?.storagePath ?? ''),
    uploadedAt: timestampToIso(rawDocument?.uploadedAt) || String(rawDocument?.uploadedAt ?? ''),
    uploadedById: String(rawDocument?.uploadedById ?? ''),
    uploadedByName: repairTextEncoding(String(rawDocument?.uploadedByName ?? '')),
    uploadedByRole: String(rawDocument?.uploadedByRole ?? ''),
  }
}

export async function listProcessDocuments(processId) {
  if (!processId) return []
  if (!isFirebaseConfigured || !firestore) return []

  const snapshot = await getDocs(collection(firestore, 'processes', processId, 'documents'))

  return snapshot.docs.map((item) => normalizeDocument(item.data(), item.id))
}

// D3: monta o storagePath (sem/com escopo) - espelha a rule
// `isValidProcessDocumentStoragePath` do firestore.rules.
function buildStoragePath(processId, type, { itemId, containerId, po, uid, fileName, documentId }) {
  const safeName = sanitizeFileName(fileName)
  const prefix = `processes/${processId}/documents/${type}`
  const timestamp = Date.now()

  if (type === 'fispq') {
    return `${prefix}/${sanitizePathSegment(itemId)}/${timestamp}-${uid}-${safeName}`
  }
  if (type === 'containerWash') {
    return `${prefix}/${sanitizePathSegment(containerId)}/${timestamp}-${uid}-${safeName}`
  }
  if ((type === 'invoice' || type === 'packingList') && po) {
    return `${prefix}/${sanitizePathSegment(po)}/${timestamp}-${uid}-${safeName}`
  }
  // documentId so entra no slotKey de `other`, nunca no storagePath.
  void documentId
  return `${prefix}/${timestamp}-${uid}-${safeName}`
}

/**
 * Envia um documento novo (metadado + arquivo). `actor` = { uid, name, role }.
 * `category` do processo determina se invoice/packingList sao 1 slot por
 * processo ou por PO (AD-1 - so no CONSOLIDADO, exige `po`).
 */
export async function uploadProcessDocument(
  processId,
  { type, file, itemId, containerId, description, po, category, actor } = {}
) {
  if (!isFirebaseConfigured || !firestore || !storage) {
    throw new Error('Documentos disponíveis apenas com o Firebase configurado.')
  }

  const mimeType = validateFileUpload(file, { maxBytes: MAX_DOCUMENT_BYTES })

  const documentsCollection = collection(firestore, 'processes', processId, 'documents')
  const documentRef = doc(documentsCollection)

  const slotKey = buildDocumentSlotKey(type, {
    itemId,
    containerId,
    documentId: documentRef.id,
    category,
    po,
  })

  const storagePath = buildStoragePath(processId, type, {
    itemId,
    containerId,
    po: category === 'CONSOLIDADO' ? po : '',
    uid: actor?.uid ?? 'x',
    fileName: file?.name,
    documentId: documentRef.id,
  })

  const storageRef = ref(storage, storagePath)

  await uploadBytes(storageRef, file, { contentType: mimeType })

  try {
    const payload = {
      type,
      slotKey,
      name: repairTextEncoding(normalizeStringValue(file?.name) || 'documento'),
      mimeType,
      size: Number(file?.size ?? 0),
      storagePath,
      uploadedAt: serverTimestamp(),
      uploadedById: actor?.uid ?? '',
      uploadedByName: repairTextEncoding(normalizeStringValue(actor?.name)),
      uploadedByRole: actor?.role ?? '',
    }

    if (type === 'fispq') payload.itemId = itemId
    if (type === 'containerWash') payload.containerId = containerId
    if (type === 'other') payload.description = repairTextEncoding(normalizeStringValue(description))
    if ((type === 'invoice' || type === 'packingList') && category === 'CONSOLIDADO') {
      payload.poNumber = po
    }

    await setDoc(documentRef, payload)

    return normalizeDocument({ ...payload, uploadedAt: new Date().toISOString() }, documentRef.id)
  } catch (error) {
    await deleteObject(storageRef).catch(() => {})
    throw error
  }
}

// A exclusao do ARQUIVO fica a cargo do trigger `deleteProcessDocumentFile`
// (D7) - aqui so apagamos o metadado (imutavel, mas deletavel).
export async function deleteProcessDocument(processId, documentId) {
  if (!isFirebaseConfigured || !firestore) return
  await deleteDoc(doc(firestore, 'processes', processId, 'documents', documentId))
}

// D8: download sob demanda - a URL NUNCA e' persistida.
export async function getProcessDocumentDownloadUrl(storagePath) {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Documentos disponíveis apenas com o Firebase configurado.')
  }
  return getDownloadURL(ref(storage, storagePath))
}
