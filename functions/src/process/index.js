
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/logger';
import nodemailer from 'nodemailer';
import {
  EMAIL_NOTIFICATION_TYPES, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
  normalizeString, normalizeEmail, isActiveStatus, isCorporateEmail, repairTextEncoding, getUserDisplayName, buildProcessLabel, buildRecipientProcessLabel, buildFavoriteNotificationBody, buildAdminNotificationBody, buildReplyNotificationBody, buildPostReceiptNotesNotificationBody, buildCollectionStatusNotificationBody, buildFavoriteProcessUpdatedTitle, buildReceiptDivergenceNotificationBody, buildLicenseRejectedNotificationBody, buildProcessUpdateSummary, hasMeaningfulProcessChanges, hasPostReceiptContentChanged, normalizePostReceiptImages, getMailer, getEmailFromAddress, buildEmailMessage, getUserProfile, listActiveAdminUsers, listActiveFavoriteUsers, shouldNotify, createNotifications
} from '../core/shared.js';
import { buildMilestoneEvents } from './milestones.js';
import { runDailyProcessAlerts } from './dailyAlerts.js';
import { hasCollectionStatusChangedMirror, getDisplayedCollectionStatusMirror } from '../core/collectionStatus.js';
import { isReceiptDivergenceReportedMirror, normalizeReceiptDivergenceFieldsMirror } from '../core/receiptDivergence.js';
import { getNewlyRejectedLicensesMirror } from '../core/licenses.js';

export const createProcessMessageNotifications = onDocumentCreated(
  {
    document: 'processes/{processId}/messages/{messageId}',
  },
  async (event) => {
    const message = event.data?.data()
    if (!message) return

    const processId = normalizeString(event.params.processId || message.processId)
    const messageId = normalizeString(event.params.messageId)
    const actorUserId = normalizeString(message.authorId)

    if (!processId || !messageId || !actorUserId) return

    const firestore = getFirestore()
    const processSnapshot = await firestore.collection('processes').doc(processId).get()
    if (!processSnapshot.exists) return

    const process = {
      id: processSnapshot.id,
      ...processSnapshot.data(),
    }
    const actorProfile = await getUserProfile(actorUserId)
    const actorRole = normalizeString(actorProfile?.role)
    const actorName = getUserDisplayName(
      actorProfile,
      normalizeString(message.authorName || message.authorEmail || 'Usuário')
    )
    const notificationMap = new Map()

    const maybeAddNotification = (recipient, type, title, body) => {
      const recipientUserId = normalizeString(recipient?.id ?? recipient?.uid)

      if (!recipientUserId || recipientUserId === actorUserId || !isActiveStatus(recipient?.status)) {
        return
      }

      if (notificationMap.has(recipientUserId)) {
        return
      }

      notificationMap.set(recipientUserId, {
        recipientUserId,
        actorUserId,
        actorName,
        type,
        processId,
        messageId,
        title,
        body,
        targetTab: 'messages',
      })
    }

    if (actorRole === 'admin') {
      const previousMessagesSnapshot = await firestore
        .collection('processes')
        .doc(processId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()

      for (const messageSnapshot of previousMessagesSnapshot.docs) {
        if (messageSnapshot.id === messageId) continue

        const previousMessage = messageSnapshot.data()
        const previousAuthorId = normalizeString(previousMessage.authorId)
        if (!previousAuthorId || previousAuthorId === actorUserId) continue

        const previousAuthorProfile = await getUserProfile(previousAuthorId)
        if (!previousAuthorProfile || previousAuthorProfile.role === 'admin') continue

        maybeAddNotification(
          previousAuthorProfile,
          'process_question_answered',
          'Sua dúvida recebeu uma resposta',
          buildReplyNotificationBody(buildProcessLabel(process), actorName)
        )
        break
      }
    } else {
      const activeAdmins = await listActiveAdminUsers()

      activeAdmins.forEach((adminUser) => {
        maybeAddNotification(
          adminUser,
          'process_question_created',
          'Nova dúvida em processo',
          buildAdminNotificationBody(buildProcessLabel(process), actorName)
        )
      })
    }

    const favoriteUsers = await listActiveFavoriteUsers(processId)

    favoriteUsers.forEach((favoriteUser) => {
      const processLabel = buildRecipientProcessLabel(process, normalizeString(favoriteUser.role))
      maybeAddNotification(
        favoriteUser,
        'favorite_process_message',
        'Atualização em processo favoritado',
        buildFavoriteNotificationBody(processLabel, actorName)
      )
    })

    await createNotifications(Array.from(notificationMap.values()))
  }
)
export const createProcessUpdateNotifications = onDocumentUpdated(
  {
    document: 'processes/{processId}',
  },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()

    if (!before || !after) return

    const processId = normalizeString(event.params.processId)
    const actorUserId = normalizeString(after.updatedById)
    if (!processId || !actorUserId) return

    const actorProfile = await getUserProfile(actorUserId)
    if (!actorProfile || !isActiveStatus(actorProfile.status)) return

    const actorRole = normalizeString(actorProfile.role)
    const actorName = getUserDisplayName(actorProfile, normalizeString(after.updatedByName || 'Usuário'))
    const process = {
      id: processId,
      ...after,
    }
    const notificationMap = new Map()

    const maybeAddNotification = (recipient, type, title, body) => {
      const recipientUserId = normalizeString(recipient?.id ?? recipient?.uid)

      if (!recipientUserId || recipientUserId === actorUserId || !isActiveStatus(recipient?.status)) {
        return
      }

      if (notificationMap.has(recipientUserId)) {
        return
      }

      notificationMap.set(recipientUserId, {
        recipientUserId,
        actorUserId,
        actorName,
        type,
        processId,
        messageId: '',
        title,
        body,
        targetTab: 'messages',
      })
    }

    // F17.4b (B-6): notificacao `receipt_divergence_reported` (admin +
    // favoritos, COM e-mail) na TRANSICAO false->true da divergencia no
    // recebimento. First-wins (l.158): no mesmo write vence sobre
    // `collection_status_updated`/`favorite_process_updated`. Ator (admin ou
    // logistica) nunca recebe (guarda dentro de maybeAddNotification).
    if (
      (actorRole === 'admin' || actorRole === 'logistica') &&
      isReceiptDivergenceReportedMirror(before, after)
    ) {
      const activeAdmins = await listActiveAdminUsers()
      const favoriteUsers = await listActiveFavoriteUsers(processId)
      const divergenceType = normalizeReceiptDivergenceFieldsMirror(after).receiptDivergenceType

      activeAdmins.forEach((adminUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(adminUser.role))
        maybeAddNotification(
          adminUser,
          'receipt_divergence_reported',
          'Divergência no recebimento',
          buildReceiptDivergenceNotificationBody(processLabel, actorName, divergenceType)
        )
      })

      favoriteUsers.forEach((favoriteUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(favoriteUser.role))
        maybeAddNotification(
          favoriteUser,
          'receipt_divergence_reported',
          'Divergência no recebimento',
          buildReceiptDivergenceNotificationBody(processLabel, actorName, divergenceType)
        )
      })
    }

    // F17.5a (A-7): notificacao `license_rejected` (admins, COM e-mail) na
    // TRANSICAO de uma anuencia para `Indeferida` (L33). So' admin edita
    // `licenses` (rules) -> so' ator admin. First-wins (maybeAddNotification)
    // sobre `favorite_process_updated` abaixo - admin favorito recebe
    // `license_rejected`; favoritos nao-admin seguem recebendo
    // `favorite_process_updated` ("anuências atualizadas").
    if (actorRole === 'admin') {
      const rejectedLicenses = getNewlyRejectedLicensesMirror(before, after)

      if (rejectedLicenses.length > 0) {
        const agenciesLabel = [...new Set(rejectedLicenses.map((license) => license.agency))].join(', ')
        const activeAdmins = await listActiveAdminUsers()

        activeAdmins.forEach((adminUser) => {
          const processLabel = buildRecipientProcessLabel(process, normalizeString(adminUser.role))
          maybeAddNotification(
            adminUser,
            'license_rejected',
            'Anuência indeferida',
            buildLicenseRejectedNotificationBody(processLabel, actorName, agenciesLabel)
          )
        })
      }
    }

    // F17.4a (D-8): notificacao quando a LOGISTICA muda `collectionStatus`
    // (admins + favoritos). Sem e-mail (categoria `processos` automatica via
    // `prefCategoryForType`). first-wins de `maybeAddNotification` evita
    // duplicidade com o ramo de post-recebimento abaixo (a logistica nao
    // grava `collectionStatus` e `postReceiptNotes` no mesmo write).
    if (actorRole === 'logistica' && hasCollectionStatusChangedMirror(before.collectionStatus, after.collectionStatus)) {
      const activeAdmins = await listActiveAdminUsers()
      const favoriteUsers = await listActiveFavoriteUsers(processId)
      const statusLabel = getDisplayedCollectionStatusMirror(after.collectionStatus)

      activeAdmins.forEach((adminUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(adminUser.role))
        maybeAddNotification(
          adminUser,
          'collection_status_updated',
          'Status de coleta atualizado',
          buildCollectionStatusNotificationBody(processLabel, actorName, statusLabel)
        )
      })

      favoriteUsers.forEach((favoriteUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(favoriteUser.role))
        maybeAddNotification(
          favoriteUser,
          'collection_status_updated',
          'Status de coleta atualizado',
          buildCollectionStatusNotificationBody(processLabel, actorName, statusLabel)
        )
      })
    }

    if (
      actorRole === 'logistica' &&
      hasPostReceiptContentChanged(before, after) &&
      (normalizeString(after.postReceiptNotes) || normalizePostReceiptImages(after.postReceiptImages).length > 0)
    ) {
      const activeAdmins = await listActiveAdminUsers()
      const favoriteUsers = await listActiveFavoriteUsers(processId)

      activeAdmins.forEach((adminUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(adminUser.role))
        maybeAddNotification(
          adminUser,
          'post_receipt_notes_updated',
          'Observações pós-recebimento atualizadas',
          buildPostReceiptNotesNotificationBody(processLabel, actorName)
        )
      })

      favoriteUsers.forEach((favoriteUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(favoriteUser.role))
        maybeAddNotification(
          favoriteUser,
          'post_receipt_notes_updated',
          'Observações pós-recebimento atualizadas',
          buildPostReceiptNotesNotificationBody(processLabel, actorName)
        )
      })
    }

    if (actorRole === 'admin' && hasMeaningfulProcessChanges(before, after)) {
      const updateSummary = buildProcessUpdateSummary(before, after)
      const favoriteUsers = await listActiveFavoriteUsers(processId)

      favoriteUsers.forEach((favoriteUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(favoriteUser.role))
        maybeAddNotification(
          favoriteUser,
          'favorite_process_updated',
          buildFavoriteProcessUpdatedTitle(processLabel),
          `${processLabel}: ${updateSummary}`
        )
      })
    }

    await createNotifications(Array.from(notificationMap.values()))
  }
)
// F17.1b: trigger SEPARADO de `createProcessUpdateNotifications` (D-1) - grava
// marcos operacionais em `processes/{processId}/events/{eventId}`. Falha de
// um nao derruba o outro; escrita em subcolecao NAO reaciona este trigger
// (so reage a `onDocumentUpdated('processes/{processId}')`, o pai).
export const recordProcessMilestoneEvents = onDocumentUpdated(
  {
    document: 'processes/{processId}',
  },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()

    if (!before || !after) return

    const processId = normalizeString(event.params.processId)
    const actorUserId = normalizeString(after.updatedById)
    if (!processId || !actorUserId) return

    const events = buildMilestoneEvents(before, after, {
      processId,
      eventId: event.id,
      eventTime: event.time,
      repairText: repairTextEncoding,
    })

    if (events.length === 0) return

    const firestore = getFirestore()
    const batch = firestore.batch()
    const eventsCollection = firestore.collection('processes').doc(processId).collection('events')

    for (const { id, data } of events) {
      batch.set(eventsCollection.doc(id), { ...data, recordedAt: FieldValue.serverTimestamp() })
    }

    await batch.commit()

    logger.info('Marcos de processo registrados.', {
      processId,
      types: events.map((item) => item.data.type),
    })
  }
)
export const sendProcessNotificationEmail = onDocumentCreated(
  {
    document: 'notifications/{notificationId}',
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const notification = event.data?.data()

    if (!notification) return
    if (!EMAIL_NOTIFICATION_TYPES.has(normalizeString(notification.type))) return

    const recipientUserId = normalizeString(notification.recipientUserId)
    if (!recipientUserId) return

    const recipient = await getUserProfile(recipientUserId)
    const recipientEmail = normalizeEmail(recipient?.email)

    if (!recipient || !isActiveStatus(recipient.status) || !isCorporateEmail(recipientEmail)) {
      return
    }

    // F9: preferencia do destinatario (processos x email). Default ligado.
    if (!shouldNotify(recipient, 'processos', 'email')) {
      logger.info('Email de notificacao suprimido por preferencia do usuario.', {
        recipientUserId,
      })
      return
    }

    const mailer = getMailer()

    if (!mailer) {
      logger.info('SMTP não configurado. Email de notificação não enviado.', {
        notificationId: event.params.notificationId,
        recipientUserId,
      })
      return
    }

    const message = buildEmailMessage(notification, recipient)

    await mailer.sendMail({
      from: getEmailFromAddress(),
      to: recipientEmail,
      subject: message.subject,
      text: message.text,
    })
  }
)

// F17.5a (A-4): job agendado que monta 1 resumo diario por admin (free time
// D-5/D-2, ETA vencida, parametrizada sem desembaraco, coleta amanha sem
// transportadora). O emulador de Functions carrega esta function mas nao
// dispara agendamentos (sem Pub/Sub/Scheduler emulado) - `runDailyProcessAlerts`
// e' testado direto (`tests/unit/dailyProcessAlerts.test.js` +
// `tests/functions/notifications.triggers.test.js`).
export const sendDailyProcessAlerts = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'us-central1',
    retryCount: 2,
  },
  async () => {
    const result = await runDailyProcessAlerts()
    logger.info('Alertas operacionais diarios processados.', result)
  }
)
