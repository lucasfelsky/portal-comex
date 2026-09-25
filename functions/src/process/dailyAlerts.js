// F17.5a (A-3): runner do job agendado `sendDailyProcessAlerts`
// (`./index.js` faz o wiring do `onSchedule`, A-4 - este arquivo NAO importa
// `firebase-functions/v2/scheduler` para ficar testavel isolado, sem
// simular o scheduler).

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import {
  normalizeString,
  repairTextEncoding,
  buildRecipientProcessLabel,
  listActiveAdminUsers,
  shouldNotify,
  prefCategoryForType,
  sendPushForEntries,
} from '../core/shared.js'
import {
  buildDailyAlertsText,
  buildOperationalAlerts,
  getSaoPauloDateKey,
  normalizeClearanceOverdueDaysMirror,
} from './operationalAlerts.js'

export const DAILY_ALERTS_NOTIFICATION_TYPE = 'process_daily_alerts'

export function buildDailyAlertsNotificationId(todayKey, uid) {
  return `daily_alerts_${todayKey}_${uid}`.replace(/[^A-Za-z0-9_-]/g, '_')
}

function isAlreadyExistsError(error) {
  if (error?.code === 6 || error?.code === 'already-exists') return true
  return /already exists/i.test(String(error?.message ?? ''))
}

export async function runDailyProcessAlerts({ firestore = getFirestore(), now = new Date() } = {}) {
  const todayKey = getSaoPauloDateKey(now)

  const settingsSnapshot = await firestore.collection('forecastSettings').doc('current').get()
  const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() : null
  const clearanceOverdueDays = normalizeClearanceOverdueDaysMirror(
    settingsData?.operationalAlerts?.clearanceOverdueDays
  )

  const processesSnapshot = await firestore
    .collection('processes')
    .where('processStatus', '!=', 'Carga recebida')
    .get()
  const processes = processesSnapshot.docs
    .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
    .filter((process) => process?.archived !== true)

  const alerts = buildOperationalAlerts(processes, { todayKey, clearanceOverdueDays })

  if (alerts.length === 0) {
    logger.info('Nenhum alerta operacional hoje.', { todayKey })
    return { todayKey, alerts: 0, created: 0, skipped: 0 }
  }

  const admins = await listActiveAdminUsers(firestore)
  const { title, body } = buildDailyAlertsText(alerts, (process) =>
    buildRecipientProcessLabel(process, 'admin')
  )
  const repairedTitle = repairTextEncoding(title)
  const repairedBody = repairTextEncoding(body)

  const userDataByUid = new Map(admins.map((admin) => [normalizeString(admin.id), admin]))

  let created = 0
  let skipped = 0
  let lastError = null
  const createdEntries = []

  for (const admin of admins) {
    const uid = normalizeString(admin.id)
    if (!uid) continue
    if (!shouldNotify(admin, prefCategoryForType(DAILY_ALERTS_NOTIFICATION_TYPE), 'inApp')) continue

    const docId = buildDailyAlertsNotificationId(todayKey, uid)

    try {
      await firestore
        .collection('notifications')
        .doc(docId)
        .create({
          recipientUserId: uid,
          actorUserId: '',
          actorName: 'Portal COMEX',
          type: DAILY_ALERTS_NOTIFICATION_TYPE,
          processId: '',
          messageId: '',
          title: repairedTitle,
          body: repairedBody,
          targetTab: 'messages',
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
        })

      created += 1
      createdEntries.push({
        recipientUserId: uid,
        title: repairedTitle,
        body: repairedBody,
      })
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        skipped += 1
      } else {
        lastError = error
        logger.error('Falha ao gravar alerta operacional diario.', {
          uid,
          reason: String(error?.message ?? error ?? 'unknown'),
        })
      }
    }
  }

  if (createdEntries.length > 0) {
    const pushEntries = createdEntries.filter((entry) =>
      shouldNotify(
        userDataByUid.get(entry.recipientUserId),
        prefCategoryForType(DAILY_ALERTS_NOTIFICATION_TYPE),
        'push'
      )
    )
    try {
      await sendPushForEntries(pushEntries, userDataByUid)
    } catch (error) {
      logger.error('Falha ao enviar push dos alertas operacionais diarios.', {
        reason: String(error?.message ?? error ?? 'unknown'),
      })
    }
  }

  if (lastError) {
    throw lastError
  }

  return { todayKey, alerts: alerts.length, created, skipped }
}
