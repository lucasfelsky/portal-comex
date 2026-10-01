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
  updateDoc,
  writeBatch,
} from 'firebase/firestore/lite'
import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { auth, firebaseConfig, firestore, isFirebaseConfigured, storage } from '../lib/firebase'
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
    alsoPackingList: rawDocument?.alsoPackingList === true,
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
  { type, file, itemId, containerId, description, po, category, alsoPackingList, actor } = {}
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
    if (type === 'invoice' && alsoPackingList === true) payload.alsoPackingList = true
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
// `unlinkPreviousId`: ao excluir a Invoice atual cuja versao anterior tem
// `alsoPackingList`, desfaz o vinculo da anterior NO MESMO batch (atomico:
// se a exclusao falhar, a anterior nao fica alterada).
export async function deleteProcessDocument(processId, documentId, { unlinkPreviousId = '', actor } = {}) {
  if (!isFirebaseConfigured || !firestore) return
  const target = doc(firestore, 'processes', processId, 'documents', documentId)
  if (!unlinkPreviousId) {
    await deleteDoc(target)
    return
  }
  const batch = writeBatch(firestore)
  batch.update(doc(firestore, 'processes', processId, 'documents', unlinkPreviousId), {
    alsoPackingList: false,
    alsoPackingListUpdatedAt: serverTimestamp(),
    alsoPackingListUpdatedById: actor?.uid ?? '',
  })
  batch.delete(target)
  await batch.commit()
}

// Marca/desmarca que a Invoice tambem contem o Packing List. A rule so'
// aceita estas 3 chaves, em doc `invoice`, por admin.
export async function setInvoicePackingListLink(processId, documentId, included, actor) {
  if (!isFirebaseConfigured || !firestore) return
  await updateDoc(doc(firestore, 'processes', processId, 'documents', documentId), {
    alsoPackingList: included === true,
    alsoPackingListUpdatedAt: serverTimestamp(),
    alsoPackingListUpdatedById: actor?.uid ?? '',
  })
}

// Renomeia o documento adicional (`other`): muda so' o nome exibido
// (`description`). A rule so' aceita estas 3 chaves; o arquivo (name/storagePath) nunca muda.
export async function renameAdditionalDocument(processId, documentId, description, actor) {
  if (!isFirebaseConfigured || !firestore) return
  const value = repairTextEncoding(normalizeStringValue(description))
  if (!value) throw new Error('Informe o nome do documento.')
  await updateDoc(doc(firestore, 'processes', processId, 'documents', documentId), {
    description: value,
    descriptionUpdatedAt: serverTimestamp(),
    descriptionUpdatedById: actor?.uid ?? '',
  })
}

// L38: download autenticado. Nenhuma URL de Storage e' gerada nem persistida
// (D8): o cliente chama a Cloud Function HTTP `downloadProcessDocument` com o
// ID token e salva o blob (as storage.rules negam a leitura via SDK cliente).
export function buildProcessDocumentDownloadEndpoint() {
  const projectId = firebaseConfig?.projectId
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    return `http://127.0.0.1:5001/${projectId}/us-central1/downloadProcessDocument`
  }
  return `https://us-central1-${projectId}.cloudfunctions.net/downloadProcessDocument`
}

function buildDownloadError(message, code) {
  const error = new Error(message)
  if (code) error.code = code
  return error
}

const DOWNLOAD_STATUS_CODES = {
  401: 'unauthenticated',
  403: 'permission-denied',
  404: 'storage/object-not-found',
}

export async function downloadProcessDocumentBlob(processId, documentId) {
  if (!isFirebaseConfigured) {
    throw new Error('Documentos disponíveis apenas com o Firebase configurado.')
  }
  if (!auth?.currentUser) {
    throw buildDownloadError('Sessão expirada.', 'unauthenticated')
  }

  const token = await auth.currentUser.getIdToken()
  const url = `${buildProcessDocumentDownloadEndpoint()}?processId=${encodeURIComponent(processId)}&documentId=${encodeURIComponent(documentId)}`

  let response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw buildDownloadError('Falha de rede ao baixar o documento.', 'unavailable')
  }

  if (!response.ok) {
    const code = DOWNLOAD_STATUS_CODES[response.status]
    throw buildDownloadError('Não foi possível baixar o documento.', code)
  }
  return response.blob()
}

export function saveBlobAsFile(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
