// F18a (D7): triggers de documentos do processo.
//
// - `rotateProcessDocumentVersions`: mantem so' 2 documentos por `slotKey`
//   (principal + versao anterior), apagando o METADADO dos demais (o
//   ARQUIVO some via `deleteProcessDocumentFile`, reagindo ao delete do
//   metadado). `slotKey` que comeca com `other:` nunca rotaciona (cada
//   "Outro" e' independente, sem versao - D2).
// - `deleteProcessDocumentFile`: apaga o arquivo no Storage quando o
//   METADADO e' apagado (rotacao OU exclusao manual/cascata).
// - `cleanupDeletedProcessData`: quando o PROCESSO e' excluido, apaga as
//   subcolecoes (`events`/`messages`/`documents`, via `recursiveDelete`) e
//   TODOS os arquivos em `processes/{id}/` (documentos + `post-receipt`
//   orfaos).
//
// Este arquivo pode importar `firebase-admin`/`firebase-functions` (ao
// contrario de `milestones.js`, que fica puro por causa do teste sem
// mocks) - os handlers batem direto no Admin SDK, como os demais triggers
// de `functions/src/process/index.js`.

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/logger';

function toMillis(value) {
  if (value == null) return 0
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

// D7: funcao PURA - recebe `[{ id, uploadedAt }]` (mesmo `slotKey`) e
// devolve quais manter (2 mais recentes) e quais apagar. Desempate por
// `id` (maior vence, mesmo criterio de `groupDocumentsBySlot` em
// `src/features/processes/processDocuments.js` - paridade testada).
export function planDocumentRotation(docs) {
  const list = Array.isArray(docs) ? docs : []
  if (list.length === 0) return { keep: [], remove: [] }

  const sorted = [...list].sort((left, right) => {
    const diff = toMillis(right?.uploadedAt) - toMillis(left?.uploadedAt)
    if (diff !== 0) return diff
    return String(right?.id ?? '').localeCompare(String(left?.id ?? ''))
  })

  return {
    keep: sorted.slice(0, 2).map((item) => item.id),
    remove: sorted.slice(2).map((item) => item.id),
  }
}

export const rotateProcessDocumentVersions = onDocumentCreated(
  { document: 'processes/{processId}/documents/{documentId}' },
  async (event) => {
    const created = event.data?.data()
    if (!created) return

    const slotKey = String(created.slotKey ?? '')
    if (!slotKey || slotKey.startsWith('other:')) return

    const processId = event.params.processId
    const firestore = getFirestore()
    const documentsCollection = firestore.collection('processes').doc(processId).collection('documents')

    const snapshot = await documentsCollection.where('slotKey', '==', slotKey).get()
    const docs = snapshot.docs.map((doc) => ({ id: doc.id, uploadedAt: doc.data()?.uploadedAt }))

    const { remove } = planDocumentRotation(docs)
    if (remove.length === 0) return

    const batch = firestore.batch()
    for (const id of remove) {
      batch.delete(documentsCollection.doc(id))
    }
    await batch.commit()

    logger.info('Documentos de processo rotacionados.', {
      processId,
      slotKey,
      removed: remove.length,
    })
  }
)

export const deleteProcessDocumentFile = onDocumentDeleted(
  { document: 'processes/{processId}/documents/{documentId}' },
  async (event) => {
    const deleted = event.data?.data()
    if (!deleted) return

    const processId = event.params.processId
    const storagePath = String(deleted.storagePath ?? '')
    const expectedPrefix = `processes/${processId}/documents/`

    // Defesa contra metadado adulterado: so' apaga arquivos dentro do
    // proprio processo/subpasta de documentos.
    if (!storagePath || !storagePath.startsWith(expectedPrefix)) return

    try {
      await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true })
    } catch (error) {
      logger.warn('Falha ao apagar arquivo de documento do processo.', {
        processId,
        storagePath,
        error: error?.message,
      })
    }
  }
)

export const cleanupDeletedProcessData = onDocumentDeleted(
  { document: 'processes/{processId}' },
  async (event) => {
    const processId = event.params.processId
    const firestore = getFirestore()

    try {
      await firestore.recursiveDelete(firestore.collection('processes').doc(processId))
    } catch (error) {
      logger.warn('Falha ao apagar subcolecoes do processo excluido.', {
        processId,
        error: error?.message,
      })
    }

    try {
      await getStorage().bucket().deleteFiles({ prefix: `processes/${processId}/` })
    } catch (error) {
      logger.warn('Falha ao apagar arquivos do processo excluido.', {
        processId,
        error: error?.message,
      })
    }
  }
)
