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
// - `syncProcessDocumentIndex` (F18b-1 B1): recalcula `documentIndex` do
//   processo (SO' campo gravado por trigger, nunca pelo cliente - rules)
//   a partir da subcolecao `documents` INTEIRA, em transacao (autocura).
// - `recordProcessDocumentEvents` (F18b-1 B3/B4): marcos
//   `blUploaded`/`fispqUploaded`/`containerWashUploaded` no Historico +
//   aviso `process_document_uploaded` para admins quando quem envia e' a
//   logistica. Trigger SEPARADO (falha de marco/aviso nao impede o sync).
//
// Este arquivo pode importar `firebase-admin`/`firebase-functions` (ao
// contrario de `milestones.js`, que fica puro por causa do teste sem
// mocks) - os handlers batem direto no Admin SDK, como os demais triggers
// de `functions/src/process/index.js`.

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/logger';
import {
  DOCUMENT_TYPE_LABELS,
  buildDocumentIndex,
  buildDocumentMilestoneEvent,
  buildDocumentUploadedNotificationBody,
  describeDocumentScope,
  isSameDocumentIndex,
  normalizeDocumentIndexMirror,
} from './documentIndex.js';
import {
  buildRecipientProcessLabel,
  createNotifications,
  listActiveAdminUsers,
  repairTextEncoding,
} from '../core/shared.js';

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

// F18b-1 (B1): recalcula `documentIndex` do processo a partir da
// subcolecao `documents` INTEIRA (autocura), em transacao (2 uploads
// simultaneos no mesmo processo nao deixam index velho). SO' este trigger
// grava `documentIndex` - o cliente nunca (nenhuma allowlist de
// `firestore.rules` contem o campo, testado em `rules.emulator.test.js`).
// Nao toca `updatedAt`/`updatedById`/`updatedByName` do processo - o write
// atravessa `createProcessUpdateNotifications`/`recordProcessMilestoneEvents`
// (os 2 triggers de `onDocumentUpdated('processes/{processId}')`), mas
// `sanitizeProcessForComparison` (allowlist, `core/shared.js`) ignora
// `documentIndex` -> `hasMeaningfulProcessChanges` = false -> nenhuma
// notificacao/marco espurio (testado nos 2 arquivos de teste dedicados).
export const syncProcessDocumentIndex = onDocumentWritten(
  { document: 'processes/{processId}/documents/{documentId}' },
  async (event) => {
    const processId = event.params.processId
    const firestore = getFirestore()
    const processRef = firestore.collection('processes').doc(processId)
    const documentsCollectionRef = processRef.collection('documents')

    await firestore.runTransaction(async (transaction) => {
      const processSnapshot = await transaction.get(processRef)
      // Cascata de `cleanupDeletedProcessData`: processo ja apagado, nada a
      // sincronizar.
      if (!processSnapshot.exists) return

      const documentsSnapshot = await transaction.get(documentsCollectionRef)
      const nextIndex = buildDocumentIndex(documentsSnapshot.docs.map((doc) => doc.data()))
      const currentIndex = normalizeDocumentIndexMirror(processSnapshot.data()?.documentIndex)

      if (isSameDocumentIndex(currentIndex, nextIndex)) return

      await transaction.update(processRef, { documentIndex: nextIndex })
    })
  }
)

// F18b-1 (B3/B4): marco `blUploaded`/`fispqUploaded`/`containerWashUploaded`
// no Historico + aviso `process_document_uploaded` para admins (SO' quando
// quem envia e' a logistica). Trigger SEPARADO de `syncProcessDocumentIndex`
// e de `rotateProcessDocumentVersions` (falha de um nao derruba o outro) -
// try/catch proprio pra marco e pra aviso (um nao impede o outro).
export const recordProcessDocumentEvents = onDocumentCreated(
  { document: 'processes/{processId}/documents/{documentId}' },
  async (event) => {
    const created = event.data?.data()
    if (!created) return

    const processId = event.params.processId
    const firestore = getFirestore()
    const processSnapshot = await firestore.collection('processes').doc(processId).get()
    if (!processSnapshot.exists) return

    const process = { id: processSnapshot.id, ...processSnapshot.data() }

    try {
      const milestoneEvent = buildDocumentMilestoneEvent({
        processId,
        eventId: event.id,
        eventTime: event.time,
        document: created,
        process,
        repairText: repairTextEncoding,
      })

      if (milestoneEvent) {
        const batch = firestore.batch()
        const eventRef = firestore
          .collection('processes')
          .doc(processId)
          .collection('events')
          .doc(milestoneEvent.id)
        batch.set(eventRef, { ...milestoneEvent.data, recordedAt: FieldValue.serverTimestamp() })
        await batch.commit()

        logger.info('Marco de documento registrado.', {
          processId,
          type: milestoneEvent.data.type,
        })
      }
    } catch (error) {
      logger.warn('Falha ao registrar marco de documento.', {
        processId,
        error: error?.message,
      })
    }

    try {
      if (String(created?.uploadedByRole ?? '') === 'logistica') {
        const activeAdmins = await listActiveAdminUsers()
        const actorUserId = String(created?.uploadedById ?? '')
        const actorName = repairTextEncoding(String(created?.uploadedByName ?? ''))
        const typeLabel = DOCUMENT_TYPE_LABELS[created?.type] ?? String(created?.type ?? '')
        const scopeLabel = describeDocumentScope(process, created)

        const notifications = activeAdmins
          .filter((admin) => String(admin?.id ?? '') !== actorUserId)
          .map((admin) => ({
            recipientUserId: admin.id,
            actorUserId,
            actorName,
            type: 'process_document_uploaded',
            processId,
            messageId: '',
            title: 'Novo documento no processo',
            body: buildDocumentUploadedNotificationBody(
              buildRecipientProcessLabel(process, String(admin?.role ?? '')),
              actorName,
              typeLabel,
              scopeLabel
            ),
            targetTab: 'documents',
          }))

        await createNotifications(notifications)
      }
    } catch (error) {
      logger.warn('Falha ao notificar upload de documento.', {
        processId,
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
