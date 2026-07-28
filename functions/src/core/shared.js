
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/logger';
import nodemailer from 'nodemailer';

const EMAIL_NOTIFICATION_TYPES = new Set([
  'process_question_created',
  'process_question_answered',
  'favorite_process_message',
  'favorite_process_updated',
  'post_receipt_notes_updated',
])

const ALLOWED_ROLES = new Set(['admin', 'user', 'logistica'])
const ALLOWED_STATUSES = new Set(['Ativo', 'Pendente', 'Bloqueado', 'Reprovado'])
const RESTRICTED_PROCESS_CATEGORIES = new Set(['FCL', 'LCL', 'AEREO'])

const ROLE_PERMISSIONS_MAP = {
  admin: ['Usuários', 'Permissões', 'Comunicados', 'Auditoria', 'Processos'],
  user: ['Dashboard', 'Processos'],
  logistica: ['Dashboard', 'Processos'],
}

// Cores da marca (sprint 8 / sprint 6.7). Espelham os tokens do
// `src/styles.css` do Portal COMEX e do `globals.css` do IntelliQuote.
// Como Cloud Functions não tem acesso ao `:root` do CSS, essas cores
// são injetadas inline nos templates de email. Manter sincronizado
// com o design system (Portal COMEX `:root` + IntelliQuote globals.css).
const BRAND_COLORS = {
  ink: '#1f1c18',
  inkSoft: '#4a5560',
  primary: '#00ae91',
  primary700: '#008f76',
  primary50: '#e3f5f0',
  surface: '#ffffff',
  surfaceAlt: '#eef4f1',
  border: '#dce9e5',
  borderStrong: '#b7cdc5',
  bgTint1: '#eef7f6',
  bgTint2: '#e6f1f2',
}

const SMTP_HOST = defineSecret('SMTP_HOST')
const SMTP_PORT = defineSecret('SMTP_PORT')
const SMTP_USER = defineSecret('SMTP_USER')
const SMTP_PASS = defineSecret('SMTP_PASS')
const SMTP_FROM = defineSecret('SMTP_FROM')
const APP_URL = 'https://portal-comex.com'
const MOJIBAKE_PATTERN_SOURCE = '[A-Za-z0-9][\u00c3\u00c2\u00e2][^\s]'
const MOJIBAKE_PATTERN = new RegExp(MOJIBAKE_PATTERN_SOURCE)
const MOJIBAKE_GLOBAL_PATTERN = new RegExp(MOJIBAKE_PATTERN_SOURCE, 'g')
function normalizeString(value) {
  return String(value ?? '').trim()
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase()
}

function normalizeList(items) {
  return Array.isArray(items) ? items.filter(Boolean) : []
}

function normalizeTimestamp(value) {
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString()
  }

  return normalizeString(value)
}

function isCorporateEmail(email) {
  return normalizeEmail(email).endsWith('@sqquimica.com')
}

function isActiveStatus(status) {
  return normalizeString(status).toLowerCase() === 'ativo'
}

function countMojibakeMarkers(value) {
  return (String(value ?? '').match(MOJIBAKE_GLOBAL_PATTERN) ?? []).length
}

function repairTextEncoding(value) {
  if (typeof value !== 'string') return value
  if (!MOJIBAKE_PATTERN.test(value)) return value

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff))
    const repaired = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

    if (!repaired) return value
    if (countMojibakeMarkers(repaired) > countMojibakeMarkers(value)) return value

    return repaired
  } catch {
    return value
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getRolePermissions(role) {
  return ROLE_PERMISSIONS_MAP[role] ?? ROLE_PERMISSIONS_MAP.user
}

function getStatusTone(status) {
  if (status === 'Ativo') return 'ok'
  if (status === 'Bloqueado' || status === 'Reprovado') return 'neutral'
  return 'warn'
}

function getDefaultLastAccess(status) {
  if (status === 'Ativo') return 'Aguardando primeiro acesso'
  if (status === 'Bloqueado') return 'Acesso bloqueado'
  if (status === 'Reprovado') return 'Cadastro reprovado'
  return 'Aguardando aprovação'
}

function getDefaultNotes(status) {
  if (status === 'Ativo') return 'Acesso liberado.'
  if (status === 'Bloqueado') return 'Acesso bloqueado pela administração.'
  if (status === 'Reprovado') return 'Cadastro reprovado pela administração.'
  return 'Cadastro corporativo aguardando aprovação administrativa.'
}

function getUserDisplayName(user, fallback = 'Usuário') {
  return repairTextEncoding(
    normalizeString(user?.name ?? user?.displayName ?? user?.email ?? fallback) || fallback
  )
}

function normalizePostReceiptImages(images) {
  if (!Array.isArray(images)) return []

  return images
    .map((rawImage, index) => {
      const image = rawImage && typeof rawImage === 'object' ? rawImage : { url: rawImage }

      return {
        id: normalizeString(image.id) || `POST-RECEIPT-IMAGE-${index + 1}`,
        url: normalizeString(image.url),
        storagePath: normalizeString(image.storagePath),
        name: normalizeString(image.name) || `Imagem ${index + 1}`,
        mimeType: normalizeString(image.mimeType) || 'image/jpeg',
        size:
          Number.isFinite(Number(image.size)) && Number(image.size) > 0
            ? Number(image.size)
            : null,
        uploadedAt: normalizeString(image.uploadedAt),
      }
    })
    .filter((image) => image.url)
}

function buildProcessLabel(process) {
  const name = normalizeString(process?.name)
  if (name) return name

  const processNumber = normalizeString(process?.processNumber)
  return processNumber ? `PO ${processNumber}` : 'processo'
}

function canShowProcessNameForRole(process, role) {
  const category = normalizeString(process?.category)
  return role === 'admin' || !RESTRICTED_PROCESS_CATEGORIES.has(category)
}

function buildRecipientProcessLabel(process, role) {
  if (canShowProcessNameForRole(process, role)) {
    const processName = normalizeString(process?.name)
    if (processName) return processName
  }

  const processNumber = normalizeString(process?.processNumber)
  return processNumber ? `PO ${processNumber}` : buildProcessLabel(process)
}

function buildFavoriteNotificationBody(processLabel, actorName) {
  return `${actorName} registrou uma nova mensagem em ${processLabel}, que está nos seus favoritos.`
}

function buildAdminNotificationBody(processLabel, actorName) {
  return `${actorName} registrou uma nova dúvida em ${processLabel}.`
}

function buildReplyNotificationBody(processLabel, actorName) {
  return `${actorName} respondeu uma dúvida sua em ${processLabel}.`
}

function buildPostReceiptNotesNotificationBody(processLabel, actorName) {
  return `${actorName} registrou observações pós-recebimento da carga em ${processLabel}.`
}

function buildFavoriteProcessUpdatedTitle(processLabel) {
  return `Processo atualizado: ${processLabel}`
}

function formatDateLabel(value) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function buildProcessUpdateSummary(previousProcess, nextProcess) {
  const changes = []

  if (normalizeString(previousProcess?.processStatus) !== normalizeString(nextProcess?.processStatus)) {
    changes.push(`status alterado para ${normalizeString(nextProcess?.processStatus) || '-'}`)
  }

  if (normalizeString(previousProcess?.eta) !== normalizeString(nextProcess?.eta)) {
    changes.push(`ETA atualizada para ${formatDateLabel(nextProcess?.eta)}`)
  }

  if (normalizeString(previousProcess?.etd) !== normalizeString(nextProcess?.etd)) {
    changes.push(`ETD atualizada para ${formatDateLabel(nextProcess?.etd)}`)
  }

  if (normalizeString(previousProcess?.destination) !== normalizeString(nextProcess?.destination)) {
    changes.push(`destino atualizado para ${normalizeString(nextProcess?.destination) || '-'}`)
  }

  if (normalizeString(previousProcess?.processNotes) !== normalizeString(nextProcess?.processNotes)) {
    changes.push('observações do processo atualizadas')
  }

  if (
    normalizeString(previousProcess?.postReceiptNotes) !==
    normalizeString(nextProcess?.postReceiptNotes)
  ) {
    changes.push('observações pós-recebimento atualizadas')
  }

  if (
    JSON.stringify(normalizePostReceiptImages(previousProcess?.postReceiptImages)) !==
    JSON.stringify(normalizePostReceiptImages(nextProcess?.postReceiptImages))
  ) {
    changes.push('imagens pós-recebimento atualizadas')
  }

  if (JSON.stringify(nextProcess?.items ?? []) !== JSON.stringify(previousProcess?.items ?? [])) {
    changes.push('itens vinculados atualizados')
  }

  if (changes.length === 0) {
    return 'dados do processo atualizados.'
  }

  if (changes.length === 1) {
    return `${changes[0]}.`
  }

  return `${changes.slice(0, 2).join(' e ')}.`
}

function sanitizeProcessForComparison(process) {
  if (!process) return null

  return {
    name: normalizeString(process.name),
    category: normalizeString(process.category),
    processNumber: normalizeString(process.processNumber),
    destination: normalizeString(process.destination),
    etd: normalizeString(process.etd),
    eta: normalizeString(process.eta),
    etaOriginal: normalizeString(process.etaOriginal),
    processStatus: normalizeString(process.processStatus),
    containerQuantity: Number(process.containerQuantity ?? 0),
    palletQuantity: Number(process.palletQuantity ?? 0),
    processNotes: normalizeString(process.processNotes),
    postReceiptNotes: normalizeString(process.postReceiptNotes),
    postReceiptImages: normalizePostReceiptImages(process.postReceiptImages),
    cargoReceivedAt: normalizeTimestamp(process.cargoReceivedAt),
    berthed: Boolean(process.berthed),
    arrived: Boolean(process.arrived),
    cargoPresenceInformed: Boolean(process.cargoPresenceInformed),
    duimpStatus: normalizeString(process.duimpStatus),
    parameterizationChannel: normalizeString(process.parameterizationChannel),
    collectionStatus: normalizeString(process.collectionStatus),
    collectionScheduledAt: normalizeString(process.collectionScheduledAt),
    collectionWindows: Array.isArray(process.collectionWindows)
      ? process.collectionWindows.map((window) => ({
          id: normalizeString(window?.id),
          containerNumber: Number(window?.containerNumber ?? 0),
          scheduledAt: normalizeTimestamp(window?.scheduledAt),
          notes: normalizeString(window?.notes),
        }))
      : [],
    mapaStatus: normalizeString(process.mapaStatus),
    mapaInspectionScheduledAt: normalizeString(process.mapaInspectionScheduledAt),
    dtaStatus: normalizeString(process.dtaStatus),
    dtaLoadingScheduledAt: normalizeString(process.dtaLoadingScheduledAt),
    dtaArrivalAtItajai: normalizeString(process.dtaArrivalAtItajai),
    items: Array.isArray(process.items)
      ? process.items.map((item) => ({
          commercialName: normalizeString(item?.commercialName),
          quantity: Number(item?.quantity ?? 0),
        }))
      : [],
  }
}

function hasMeaningfulProcessChanges(previousProcess, nextProcess) {
  return (
    JSON.stringify(sanitizeProcessForComparison(previousProcess)) !==
    JSON.stringify(sanitizeProcessForComparison(nextProcess))
  )
}

function hasPostReceiptContentChanged(previousProcess, nextProcess) {
  return (
    normalizeString(previousProcess?.postReceiptNotes) !==
      normalizeString(nextProcess?.postReceiptNotes) ||
    JSON.stringify(normalizePostReceiptImages(previousProcess?.postReceiptImages)) !==
      JSON.stringify(normalizePostReceiptImages(nextProcess?.postReceiptImages))
  )
}

function getMailer() {
  const host = normalizeString(SMTP_HOST.value())
  const port = Number(SMTP_PORT.value() ?? 587)
  const user = normalizeString(SMTP_USER.value())
  const pass = normalizeString(SMTP_PASS.value())

  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

function getEmailFromAddress() {
  const configuredFrom = normalizeString(SMTP_FROM.value())
  const fallbackAddress = normalizeString(SMTP_USER.value())
  const baseAddress = configuredFrom || fallbackAddress

  if (!baseAddress) return ''
  if (baseAddress.includes('<') && baseAddress.includes('>')) return baseAddress

  return `Portal COMEX <${baseAddress}>`
}

function buildEmailMessage(notification, recipient) {
  const title = repairTextEncoding(normalizeString(notification.title || 'Atualização em processo'))
  const greetingName = repairTextEncoding(normalizeString(recipient?.name))
  const greeting = greetingName ? `Olá, ${greetingName}.` : 'Olá.'

  return {
    subject: `[Portal COMEX] ${title}`,
    text: [
      greeting,
      '',
      repairTextEncoding(normalizeString(notification.body)),
      '',
      'Acesse o Portal COMEX para visualizar os detalhes:',
      APP_URL,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}
async function getUserProfile(uid) {
  const normalizedUid = normalizeString(uid)
  if (!normalizedUid) return null

  const snapshot = await getFirestore().collection('users').doc(normalizedUid).get()
  if (!snapshot.exists) return null

  return {
    id: snapshot.id,
    ...snapshot.data(),
  }
}

async function listActiveAdminUsers() {
  const snapshot = await getFirestore().collection('users').where('role', '==', 'admin').get()

  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((user) => isActiveStatus(user.status) && isCorporateEmail(user.email))
}

async function listActiveFavoriteUsers(processId) {
  const normalizedProcessId = normalizeString(processId)
  if (!normalizedProcessId) return []

  const snapshot = await getFirestore()
    .collection('users')
    .where('favoriteProcessIds', 'array-contains', normalizedProcessId)
    .get()

  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((user) => isActiveStatus(user.status))
}

async function recordAuditEvent(event) {
  try {
    await getFirestore().collection('audits').add({
      action: normalizeString(event?.action),
      actor: repairTextEncoding(normalizeString(event?.actor)),
      target: normalizeString(event?.target),
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (error) {
    logger.error('Falha ao registrar auditoria.', error)
  }
}

async function assertActiveAdmin(authContext) {
  if (!authContext?.uid) {
    throw new HttpsError('unauthenticated', 'Usuário não autenticado.')
  }

  // Lê role/status das custom claims (fonte da verdade desde Sprint 5.1 / L18).
  // Antes lia do Firestore, mas o ensureUserProfile do client não persiste
  // role/status no Firestore — só nas claims. Isso fazia o assertActiveAdmin
  // falhar para admins que fizeram self-register e foram promovidos depois.
  const role = normalizeString(authContext.token?.role)
  const status = normalizeString(authContext.token?.status)

  if (role !== 'admin' || !isActiveStatus(status)) {
    // Fallback: lê do Firestore caso as claims não estejam no token ainda
    // (ex: admin recém-promovido que ainda não fez reload).
    const actorProfile = await getUserProfile(authContext.uid)
    if (!actorProfile || actorProfile.role !== 'admin' || !isActiveStatus(actorProfile.status)) {
      throw new HttpsError('permission-denied', 'Apenas administradores ativos podem executar esta ação.')
    }
    return actorProfile
  }

  // Claims válidas — busca o nome no Firestore para auditoria.
  const actorProfile = await getUserProfile(authContext.uid)
  return actorProfile ?? { id: authContext.uid, name: authContext.token?.email ?? 'Admin', email: authContext.token?.email ?? '' }
}

async function assertApprovedCaller(authContext) {
  if (!authContext?.uid) {
    throw new HttpsError('unauthenticated', 'Usuário não autenticado.')
  }

  if (!isCorporateEmail(authContext.token?.email)) {
    throw new HttpsError('permission-denied', 'Email corporativo @sqquimica.com é obrigatório.')
  }

  const actorProfile = await getUserProfile(authContext.uid)

  if (!actorProfile || !isActiveStatus(actorProfile.status)) {
    throw new HttpsError('permission-denied', 'Usuário sem acesso ativo.')
  }

  return actorProfile
}

// F9 (backlog 2026-07-12): preferencias de notificacao por usuario.
// users/{uid}.notificationPreferences = { processos|noticias|suporte:
//   { inApp, email, push } }. DEFAULT LIGADO: so silencia com false
// explicito — quem nunca configurou continua recebendo tudo.
function prefCategoryForType(type) {
  const normalizedType = normalizeString(type)
  if (normalizedType.startsWith('support_ticket')) return 'suporte'
  if (normalizedType.startsWith('news')) return 'noticias'
  return 'processos'
}

function shouldNotify(userData, category, channel) {
  const value = userData?.notificationPreferences?.[category]?.[channel]
  return value !== false
}

async function createNotifications(entries) {
  const normalizedEntries = entries.filter(
    (entry) => normalizeString(entry?.recipientUserId) && normalizeString(entry?.title) && normalizeString(entry?.body)
  )

  if (normalizedEntries.length === 0) return

  const firestore = getFirestore()

  // F9: carrega o doc de cada destinatario UMA vez (prefs + fcmTokens) e
  // gateia in-app e push por preferencia. Default ligado.
  const uniqueUids = [...new Set(normalizedEntries.map((entry) => normalizeString(entry.recipientUserId)))]
  const userDataByUid = new Map()
  for (const uid of uniqueUids) {
    try {
      const snapshot = await firestore.collection('users').doc(uid).get()
      userDataByUid.set(uid, snapshot.exists ? snapshot.data() : null)
    } catch (error) {
      userDataByUid.set(uid, null)
    }
  }

  const inAppEntries = normalizedEntries.filter((entry) =>
    shouldNotify(
      userDataByUid.get(normalizeString(entry.recipientUserId)),
      prefCategoryForType(entry.type),
      'inApp'
    )
  )

  const batch = firestore.batch()

  inAppEntries.forEach((entry) => {
    const docRef = firestore.collection('notifications').doc()

    batch.set(docRef, {
      recipientUserId: normalizeString(entry.recipientUserId),
      actorUserId: normalizeString(entry.actorUserId),
      actorName: repairTextEncoding(normalizeString(entry.actorName)),
      type: normalizeString(entry.type || 'process_message'),
      processId: normalizeString(entry.processId),
      messageId: normalizeString(entry.messageId),
      title: repairTextEncoding(normalizeString(entry.title)),
      body: repairTextEncoding(normalizeString(entry.body)),
      targetTab: normalizeString(entry.targetTab || 'messages'),
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    })
  })

  if (inAppEntries.length > 0) {
    await batch.commit()
  }

  // F6 (backlog 2026-07-12): push (FCM) best-effort na sequencia do in-app.
  // Qualquer falha aqui NAO afeta as notificacoes ja gravadas.
  // F9: push tem gate proprio (preferencia por tipo x canal).
  const pushEntries = normalizedEntries.filter((entry) =>
    shouldNotify(
      userDataByUid.get(normalizeString(entry.recipientUserId)),
      prefCategoryForType(entry.type),
      'push'
    )
  )
  try {
    await sendPushForEntries(pushEntries, userDataByUid)
  } catch (error) {
    logger.error('Falha ao enviar push das notificacoes.', {
      reason: String(error?.message ?? error ?? 'unknown'),
    })
  }
}

// F6: envia push web (FCM) para os tokens salvos em users/{uid}.fcmTokens[]
// (persistidos pelo useFcm no client). Tokens mortos (app desinstalado,
// permissao revogada) sao removidos do doc no retorno do multicast.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

async function sendPushForEntries(entries, userDataByUid = new Map()) {
  const firestore = getFirestore()

  for (const entry of entries) {
    const uid = normalizeString(entry.recipientUserId)
    const userData = userDataByUid.get(uid)
    if (!userData) continue

    const tokens = Array.isArray(userData.fcmTokens)
      ? userData.fcmTokens.filter(Boolean)
      : []
    if (tokens.length === 0) continue

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: repairTextEncoding(normalizeString(entry.title)),
        body: repairTextEncoding(normalizeString(entry.body)),
      },
      webpush: {
        fcmOptions: { link: APP_URL },
      },
    })

    const deadTokens = response.responses
      .map((item, index) => ({ item, token: tokens[index] }))
      .filter(({ item }) => item.error && DEAD_TOKEN_CODES.has(item.error.code))
      .map(({ token }) => token)

    if (deadTokens.length > 0) {
      try {
        await firestore
          .collection('users')
          .doc(uid)
          .update({ fcmTokens: FieldValue.arrayRemove(...deadTokens) })
        logger.info('Tokens FCM mortos removidos do perfil.', {
          uid,
          removed: deadTokens.length,
        })
      } catch (cleanupError) {
        logger.warn('Falha ao limpar tokens FCM mortos.', {
          uid,
          reason: String(cleanupError?.message ?? cleanupError ?? 'unknown'),
        })
      }
    }
  }
}

async function deleteNotificationsForRecipient(uid) {
  const normalizedUid = normalizeString(uid)
  if (!normalizedUid) return

  const firestore = getFirestore()
  const snapshot = await firestore
    .collection('notifications')
    .where('recipientUserId', '==', normalizedUid)
    .get()

  if (snapshot.empty) return

  const batch = firestore.batch()
  snapshot.docs.forEach((docSnapshot) => batch.delete(docSnapshot.ref))
  await batch.commit()
}

// export everything so domains can use it
export {
  EMAIL_NOTIFICATION_TYPES, ALLOWED_ROLES, ALLOWED_STATUSES, RESTRICTED_PROCESS_CATEGORIES, ROLE_PERMISSIONS_MAP, BRAND_COLORS,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL, MOJIBAKE_PATTERN, MOJIBAKE_GLOBAL_PATTERN,
  normalizeString, normalizeEmail, normalizeList, normalizeTimestamp, isCorporateEmail, isActiveStatus, countMojibakeMarkers, repairTextEncoding, escapeHtml, getRolePermissions, getStatusTone, getDefaultLastAccess, getDefaultNotes, getUserDisplayName,
  normalizePostReceiptImages, buildProcessLabel, canShowProcessNameForRole, buildRecipientProcessLabel, buildFavoriteNotificationBody, buildAdminNotificationBody, buildReplyNotificationBody, buildPostReceiptNotesNotificationBody, buildFavoriteProcessUpdatedTitle, formatDateLabel, buildProcessUpdateSummary, sanitizeProcessForComparison, hasMeaningfulProcessChanges, hasPostReceiptContentChanged, getMailer, getEmailFromAddress, buildEmailMessage,
  getUserProfile, listActiveAdminUsers, listActiveFavoriteUsers, recordAuditEvent, assertActiveAdmin, assertApprovedCaller, prefCategoryForType, shouldNotify, createNotifications, sendPushForEntries, deleteNotificationsForRecipient
};
