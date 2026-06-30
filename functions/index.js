import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import nodemailer from 'nodemailer'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/logger'

initializeApp()

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
  admin: ['Usuarios', 'Permissoes', 'Comunicados', 'Auditoria', 'Processos'],
  user: ['Dashboard', 'Processos'],
  logistica: ['Dashboard', 'Processos'],
}

const SMTP_HOST = defineSecret('SMTP_HOST')
const SMTP_PORT = defineSecret('SMTP_PORT')
const SMTP_USER = defineSecret('SMTP_USER')
const SMTP_PASS = defineSecret('SMTP_PASS')
const SMTP_FROM = defineSecret('SMTP_FROM')

const PTAX_API_BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'
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
  return 'Aguardando aprovacao'
}

function getDefaultNotes(status) {
  if (status === 'Ativo') return 'Acesso liberado.'
  if (status === 'Bloqueado') return 'Acesso bloqueado pela administracao.'
  if (status === 'Reprovado') return 'Cadastro reprovado pela administracao.'
  return 'Cadastro corporativo aguardando aprovacao administrativa.'
}

function getUserDisplayName(user, fallback = 'Usuario') {
  return repairTextEncoding(
    normalizeString(user?.name ?? user?.displayName ?? user?.email ?? fallback) || fallback
  )
}

/**
 * Define as custom claims `role` e `status` em um usuario.
 * Deve ser chamado em todo ponto que altera role/status para que as rules
 * passem a ler de `request.auth.token` em vez de fazer `firestore.get(users/{uid})`.
 * Falha nao quebra a operacao principal (log apenas) — o backfill cobre gaps.
 */
async function setRoleStatusClaims(uid, role, status) {
  const safeRole = ALLOWED_ROLES.has(role) ? role : 'user'
  const safeStatus = ALLOWED_STATUSES.has(status) ? status : 'Pendente'
  try {
    await getAuth().setCustomUserClaims(uid, { role: safeRole, status: safeStatus })
  } catch (error) {
    logger.error('Falha ao setar custom claims', { uid, role: safeRole, status: safeStatus, error: error?.message })
  }
}

function sanitizeUserPayload(rawUser, overrides = {}) {
  const roleCandidate = normalizeString(overrides.role ?? rawUser?.role ?? 'user')
  const statusCandidate = normalizeString(overrides.status ?? rawUser?.status ?? 'Pendente')
  const role = ALLOWED_ROLES.has(roleCandidate) ? roleCandidate : 'user'
  const status = ALLOWED_STATUSES.has(statusCandidate) ? statusCandidate : 'Pendente'
  const favoriteProcessIds = normalizeList(
    overrides.favoriteProcessIds ?? rawUser?.favoriteProcessIds ?? []
  )

  return {
    uid: normalizeString(overrides.uid ?? rawUser?.uid),
    name: getUserDisplayName({ name: overrides.name ?? rawUser?.name, email: rawUser?.email }, ''),
    email: normalizeEmail(overrides.email ?? rawUser?.email),
    role,
    area: repairTextEncoding(normalizeString(overrides.area ?? rawUser?.area ?? 'Geral')) || 'Geral',
    status,
    statusTone: getStatusTone(status),
    lastAccess:
      repairTextEncoding(normalizeString(overrides.lastAccess ?? rawUser?.lastAccess)) ||
      getDefaultLastAccess(status),
    scopes: getRolePermissions(role),
    favoriteProcessIds,
    notes:
      repairTextEncoding(normalizeString(overrides.notes ?? rawUser?.notes)) ||
      getDefaultNotes(status),
  }
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
  return `${actorName} registrou uma nova mensagem em ${processLabel}, que esta nos seus favoritos.`
}

function buildAdminNotificationBody(processLabel, actorName) {
  return `${actorName} registrou uma nova duvida em ${processLabel}.`
}

function buildReplyNotificationBody(processLabel, actorName) {
  return `${actorName} respondeu uma duvida sua em ${processLabel}.`
}

function buildPostReceiptNotesNotificationBody(processLabel, actorName) {
  return `${actorName} registrou observacoes pos-recebimento da carga em ${processLabel}.`
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
    changes.push('observacoes do processo atualizadas')
  }

  if (
    normalizeString(previousProcess?.postReceiptNotes) !==
    normalizeString(nextProcess?.postReceiptNotes)
  ) {
    changes.push('observacoes pos-recebimento atualizadas')
  }

  if (
    JSON.stringify(normalizePostReceiptImages(previousProcess?.postReceiptImages)) !==
    JSON.stringify(normalizePostReceiptImages(nextProcess?.postReceiptImages))
  ) {
    changes.push('imagens pos-recebimento atualizadas')
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
  const title = repairTextEncoding(normalizeString(notification.title || 'Atualizacao em processo'))
  const greetingName = repairTextEncoding(normalizeString(recipient?.name))
  const greeting = greetingName ? `Ola, ${greetingName}.` : 'Ola.'

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

function buildNewsPublishedEmailMessage(newsItem, recipient) {
  const title = repairTextEncoding(normalizeString(newsItem?.title || 'Nova noticia publicada'))
  const content = repairTextEncoding(normalizeString(newsItem?.content))
  const recipientName = repairTextEncoding(normalizeString(recipient?.name))
  const greeting = recipientName ? `Ola, ${recipientName}.` : 'Ola.'
  const safeTitle = escapeHtml(title)
  const safeContent = escapeHtml(content).replaceAll('\n', '<br />')

  return {
    subject: `[Portal COMEX] Nova noticia: ${title}`,
    text: [
      greeting,
      '',
      'Uma nova noticia foi publicada no Portal COMEX.',
      '',
      title,
      '',
      content,
      '',
      'Acesse o Portal COMEX para visualizar os detalhes:',
      `${APP_URL}/news`,
    ]
      .filter(Boolean)
      .join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #184054; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Uma nova noticia foi publicada no <strong>Portal COMEX</strong>.</p>
        <div style="padding: 16px 18px; border-radius: 14px; background: #f4faf9; border: 1px solid rgba(24, 64, 84, 0.12);">
          <p style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">${safeTitle}</p>
          <p style="margin: 0;">${safeContent || 'Acesse o portal para visualizar a noticia completa.'}</p>
        </div>
        <p style="margin-top: 18px;">
          <a
            href="${APP_URL}/news"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #184054; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Ver noticia no portal
          </a>
        </p>
      </div>
    `,
  }
}

function buildCustomEmailActionLink(actionLink, routePath) {
  const parsedActionLink = new URL(actionLink)
  const oobCode = parsedActionLink.searchParams.get('oobCode')

  if (!oobCode) {
    throw new Error('Link de acao do Firebase sem oobCode.')
  }

  const customLink = new URL(routePath, APP_URL)
  customLink.searchParams.set('mode', 'verifyEmail')
  customLink.searchParams.set('oobCode', oobCode)
  customLink.searchParams.set('apiKey', parsedActionLink.searchParams.get('apiKey') ?? '')
  customLink.searchParams.set('lang', 'pt-BR')

  return customLink.toString()
}

function buildVerificationEmailMessage({ recipientName, verificationLink }) {
  const safeRecipientName = repairTextEncoding(normalizeString(recipientName))
  const greeting = safeRecipientName ? `Ola, ${safeRecipientName}.` : 'Ola.'

  return {
    subject: '[Portal COMEX] Confirme o seu email corporativo',
    text: [
      greeting,
      '',
      'Seu cadastro no Portal COMEX foi criado.',
      'Para liberar o acesso, confirme o seu email corporativo no link abaixo:',
      verificationLink,
      '',
      'Se voce nao solicitou esse cadastro, ignore esta mensagem.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #184054; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Seu cadastro no <strong>Portal COMEX</strong> foi criado.</p>
        <p>Para liberar o acesso, confirme o seu email corporativo no botao abaixo:</p>
        <p>
          <a
            href="${verificationLink}"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #184054; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Confirmar email
          </a>
        </p>
        <p style="word-break: break-all;">Se preferir, copie e cole este link no navegador:<br />${verificationLink}</p>
        <p>Se voce nao solicitou esse cadastro, ignore esta mensagem.</p>
      </div>
    `,
  }
}

function buildPasswordResetEmailMessage({ recipientName, resetLink }) {
  const safeRecipientName = repairTextEncoding(normalizeString(recipientName))
  const greeting = safeRecipientName ? `Ola, ${safeRecipientName}.` : 'Ola.'

  return {
    subject: '[Portal COMEX] Redefina a sua senha',
    text: [
      greeting,
      '',
      'Recebemos uma solicitacao para redefinir a sua senha do Portal COMEX.',
      'Use o link abaixo para cadastrar uma nova senha:',
      resetLink,
      '',
      'Se voce nao fez essa solicitacao, ignore esta mensagem.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #184054; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Recebemos uma solicitacao para redefinir a sua senha do <strong>Portal COMEX</strong>.</p>
        <p>Use o botao abaixo para cadastrar uma nova senha:</p>
        <p>
          <a
            href="${resetLink}"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #184054; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Redefinir senha
          </a>
        </p>
        <p style="word-break: break-all;">Se preferir, copie e cole este link no navegador:<br />${resetLink}</p>
        <p>Se voce nao fez essa solicitacao, ignore esta mensagem.</p>
      </div>
    `,
  }
}

function buildPendingApprovalAdminEmailMessage({ pendingUser, adminRecipient }) {
  const recipientName = repairTextEncoding(normalizeString(adminRecipient?.name))
  const greeting = recipientName ? `Ola, ${recipientName}.` : 'Ola.'
  const pendingUserName = repairTextEncoding(normalizeString(pendingUser?.name)) || 'Usuario sem nome'
  const pendingUserEmail = normalizeEmail(pendingUser?.email)
  const pendingUserArea = repairTextEncoding(normalizeString(pendingUser?.area)) || 'Nao informada'
  const pendingUserStatus = repairTextEncoding(normalizeString(pendingUser?.status || 'Pendente'))

  return {
    subject: '[Portal COMEX] Novo cadastro pendente de aprovacao',
    text: [
      greeting,
      '',
      'Um novo usuario se cadastrou no Portal COMEX e aguarda aprovacao administrativa.',
      '',
      `Nome: ${pendingUserName}`,
      `Email: ${pendingUserEmail || 'Nao informado'}`,
      `Area: ${pendingUserArea}`,
      `Status: ${pendingUserStatus}`,
      '',
      'Acesse o painel administrativo para revisar e aprovar o cadastro:',
      `${APP_URL}/admin`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #184054; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Um novo usuario se cadastrou no <strong>Portal COMEX</strong> e aguarda aprovacao administrativa.</p>
        <div style="padding: 16px 18px; border-radius: 14px; background: #f4faf9; border: 1px solid rgba(24, 64, 84, 0.12);">
          <p style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">${escapeHtml(pendingUserName)}</p>
          <p style="margin: 0 0 6px;"><strong>Email:</strong> ${escapeHtml(pendingUserEmail || 'Nao informado')}</p>
          <p style="margin: 0 0 6px;"><strong>Area:</strong> ${escapeHtml(pendingUserArea)}</p>
          <p style="margin: 0;"><strong>Status:</strong> ${escapeHtml(pendingUserStatus)}</p>
        </div>
        <p style="margin-top: 18px;">
          <a
            href="${APP_URL}/admin"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #184054; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Revisar cadastro pendente
          </a>
        </p>
      </div>
    `,
  }
}

function formatDateForPtax(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${month}-${day}-${year}`
}

function getPtaxDateRange() {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 7)

  return {
    start: formatDateForPtax(startDate),
    end: formatDateForPtax(endDate),
  }
}

async function fetchCurrencyRate(currencyCode) {
  const { start, end } = getPtaxDateRange()
  const requestUrl =
    `${PTAX_API_BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${currencyCode}'&@dataInicial='${start}'&@dataFinalCotacao='${end}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`

  const response = await fetch(requestUrl, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Falha ao consultar PTAX para ${currencyCode}.`)
  }

  const payload = await response.json()
  const latestRate = payload?.value?.[0]

  if (!latestRate) {
    throw new Error(`Nenhuma cotacao PTAX encontrada para ${currencyCode}.`)
  }

  return {
    currencyCode,
    buy: Number(latestRate.cotacaoCompra ?? 0),
    sell: Number(latestRate.cotacaoVenda ?? 0),
    quotedAt: latestRate.dataHoraCotacao ?? null,
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
    throw new HttpsError('unauthenticated', 'Usuario nao autenticado.')
  }

  const actorProfile = await getUserProfile(authContext.uid)

  if (!actorProfile || actorProfile.role !== 'admin' || !isActiveStatus(actorProfile.status)) {
    throw new HttpsError('permission-denied', 'Apenas administradores ativos podem executar esta acao.')
  }

  return actorProfile
}

async function assertApprovedCaller(authContext) {
  if (!authContext?.uid) {
    throw new HttpsError('unauthenticated', 'Usuario nao autenticado.')
  }

  if (!isCorporateEmail(authContext.token?.email)) {
    throw new HttpsError('permission-denied', 'Email corporativo @sqquimica.com e obrigatorio.')
  }

  const actorProfile = await getUserProfile(authContext.uid)

  if (!actorProfile || !isActiveStatus(actorProfile.status)) {
    throw new HttpsError('permission-denied', 'Usuario sem acesso ativo.')
  }

  return actorProfile
}

async function createNotifications(entries) {
  const normalizedEntries = entries.filter(
    (entry) => normalizeString(entry?.recipientUserId) && normalizeString(entry?.title) && normalizeString(entry?.body)
  )

  if (normalizedEntries.length === 0) return

  const firestore = getFirestore()
  const batch = firestore.batch()

  normalizedEntries.forEach((entry) => {
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

  await batch.commit()
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

export const adminCreateUser = onCall(async (request) => {
  const actorProfile = await assertActiveAdmin(request.auth)
  const email = normalizeEmail(request.data?.email)
  const password = String(request.data?.password ?? '')
  const requestedRole = normalizeString(request.data?.role || 'user')
  const requestedStatus = normalizeString(request.data?.status || 'Pendente')

  if (!isCorporateEmail(email)) {
    throw new HttpsError('invalid-argument', 'Use um email corporativo @sqquimica.com.')
  }

  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'A senha deve ter pelo menos 6 caracteres.')
  }

  if (!ALLOWED_ROLES.has(requestedRole)) {
    throw new HttpsError('invalid-argument', 'Perfil de usuario invalido.')
  }

  if (!ALLOWED_STATUSES.has(requestedStatus)) {
    throw new HttpsError('invalid-argument', 'Status de usuario invalido.')
  }

  const createdUser = await getAuth().createUser({
    email,
    password,
    displayName: normalizeString(request.data?.name) || undefined,
    emailVerified: false,
  })

  const userProfile = sanitizeUserPayload(
    {
      ...request.data,
      uid: createdUser.uid,
      email,
      favoriteProcessIds: [],
    },
    {
      uid: createdUser.uid,
      email,
      role: requestedRole,
      status: requestedStatus,
      favoriteProcessIds: [],
    }
  )

  await getFirestore().collection('users').doc(createdUser.uid).set({
    ...userProfile,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await setRoleStatusClaims(createdUser.uid, requestedRole, requestedStatus)

  await recordAuditEvent({
    action: 'Usuario criado',
    actor: getUserDisplayName(actorProfile, actorProfile.email),
    target: createdUser.uid,
  })

  return {
    uid: createdUser.uid,
    email,
  }
})

export const adminDeleteUser = onCall(async (request) => {
  const actorProfile = await assertActiveAdmin(request.auth)
  const uid = normalizeString(request.data?.uid)

  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID do usuario e obrigatorio.')
  }

  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'Nao e permitido excluir o proprio usuario logado.')
  }

  try {
    await getAuth().deleteUser(uid)
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') {
      throw error
    }
  }

  const firestore = getFirestore()
  const batch = firestore.batch()

  batch.delete(firestore.collection('users').doc(uid))

  await batch.commit()
  await deleteNotificationsForRecipient(uid)

  await recordAuditEvent({
    action: 'Usuario removido',
    actor: getUserDisplayName(actorProfile, actorProfile.email),
    target: uid,
  })

  return { success: true }
})

/**
 * Atualiza role e/ou status de um usuario, persistindo em ambos:
 *   - Firestore `users/{uid}` (exibicao, relatorios, historico)
 *   - Firebase Auth custom claims `role`/`status` (autorizacao via rules)
 *
 * O front NAO escreve mais direto em `users/{uid}.role`/`.status` — usa este callable.
 * Substitui o write direto que existia no AdminUsersPanel.
 */
export const adminUpdateUserClaims = onCall(async (request) => {
  const actorProfile = await assertActiveAdmin(request.auth)
  const uid = normalizeString(request.data?.uid)
  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID do usuario e obrigatorio.')
  }

  const requestedRole = request.data?.role === undefined ? null : normalizeString(request.data.role)
  const requestedStatus = request.data?.status === undefined ? null : normalizeString(request.data.status)

  if (requestedRole !== null && !ALLOWED_ROLES.has(requestedRole)) {
    throw new HttpsError('invalid-argument', 'Perfil de usuario invalido.')
  }
  if (requestedStatus !== null && !ALLOWED_STATUSES.has(requestedStatus)) {
    throw new HttpsError('invalid-argument', 'Status de usuario invalido.')
  }
  if (requestedRole === null && requestedStatus === null) {
    throw new HttpsError('invalid-argument', 'Informe role e/ou status para atualizar.')
  }

  // Nao permite admin se autobloquear / se rebaixar.
  if (uid === request.auth.uid && requestedStatus !== null && requestedStatus !== 'Ativo') {
    throw new HttpsError('failed-precondition', 'Nao e permitido bloquear o proprio usuario logado.')
  }

  const userRef = getFirestore().collection('users').doc(uid)
  const snapshot = await userRef.get()
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Usuario nao encontrado.')
  }
  const current = snapshot.data() ?? {}

  const nextRole = requestedRole ?? current.role ?? 'user'
  const nextStatus = requestedStatus ?? current.status ?? 'Pendente'

  const safeRole = ALLOWED_ROLES.has(nextRole) ? nextRole : 'user'
  const safeStatus = ALLOWED_STATUSES.has(nextStatus) ? nextStatus : 'Pendente'

  await userRef.set(
    {
      role: safeRole,
      status: safeStatus,
      statusTone: getStatusTone(safeStatus),
      updatedAt: FieldValue.serverTimestamp(),
      updatedById: request.auth.uid,
      updatedByName: actorProfile.name ?? actorProfile.email,
    },
    { merge: true }
  )

  await setRoleStatusClaims(uid, safeRole, safeStatus)

  await recordAuditEvent({
    action: 'Claims do usuario atualizadas',
    actor: getUserDisplayName(actorProfile, actorProfile.email),
    target: uid,
  })

  return { uid, role: safeRole, status: safeStatus }
})

export const adminUpsertUserPassword = onCall(async (request) => {
  await assertActiveAdmin(request.auth)

  const uid = normalizeString(request.data?.uid)
  const password = String(request.data?.password ?? '')

  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID do usuario e obrigatorio.')
  }

  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'A senha deve ter pelo menos 6 caracteres.')
  }

  await getAuth().updateUser(uid, { password })

  return { success: true }
})

export const sendCustomVerificationEmail = onCall(
  {
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario nao autenticado.')
    }

    const requestedUid = normalizeString(request.data?.uid)
    const actorProfile = await getUserProfile(request.auth.uid)
    const actorIsAdmin = actorProfile?.role === 'admin' && isActiveStatus(actorProfile?.status)
    const targetUid = requestedUid && actorIsAdmin ? requestedUid : request.auth.uid
    const targetUser = await getAuth().getUser(targetUid)
    const targetEmail = normalizeEmail(targetUser.email)

    if (!targetEmail) {
      throw new HttpsError('failed-precondition', 'Usuario sem email cadastrado.')
    }

    if (!isCorporateEmail(targetEmail)) {
      throw new HttpsError('invalid-argument', 'Use um email corporativo @sqquimica.com.')
    }

    if (targetUser.emailVerified) {
      return { success: true, alreadyVerified: true }
    }

    const mailer = getMailer()

    if (!mailer) {
      throw new HttpsError(
        'failed-precondition',
        'SMTP nao configurado nas Cloud Functions para enviar o email de verificacao.'
      )
    }

    const firebaseActionLink = await getAuth().generateEmailVerificationLink(targetEmail, {
      url: `${APP_URL}/verificar-email`,
      handleCodeInApp: false,
    })
    const verificationLink = buildCustomEmailActionLink(firebaseActionLink, '/verificar-email')
    const message = buildVerificationEmailMessage({
      recipientName: targetUser.displayName ?? '',
      verificationLink,
    })

    await mailer.sendMail({
      from: getEmailFromAddress(),
      to: targetEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })

    return { success: true, alreadyVerified: false }
  }
)

export const sendCustomPasswordResetEmail = onCall(
  {
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (request) => {
    const email = normalizeEmail(request.data?.email)

    if (!email) {
      throw new HttpsError('invalid-argument', 'Email e obrigatorio.')
    }

    if (!isCorporateEmail(email)) {
      throw new HttpsError('invalid-argument', 'Use um email corporativo @sqquimica.com.')
    }

    const mailer = getMailer()

    if (!mailer) {
      throw new HttpsError(
        'failed-precondition',
        'SMTP nao configurado nas Cloud Functions para enviar o email de redefinicao.'
      )
    }

    let targetUser

    try {
      targetUser = await getAuth().getUserByEmail(email)
    } catch (error) {
      if (error?.code === 'auth/user-not-found') {
        return { success: true, emailSent: false }
      }

      throw error
    }

    const resetLink = await getAuth().generatePasswordResetLink(email, {
      url: APP_URL,
      handleCodeInApp: false,
    })
    const message = buildPasswordResetEmailMessage({
      recipientName: targetUser.displayName ?? '',
      resetLink,
    })

    await mailer.sendMail({
      from: getEmailFromAddress(),
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })

    return { success: true, emailSent: true }
  }
)

export const getDailyPtaxRates = onCall(async (request) => {
  await assertApprovedCaller(request.auth)

  const [usdResult, eurResult] = await Promise.allSettled([
    fetchCurrencyRate('USD'),
    fetchCurrencyRate('EUR'),
  ])

  const usdRate = usdResult.status === 'fulfilled' ? usdResult.value : null
  const eurRate = eurResult.status === 'fulfilled' ? eurResult.value : null

  if (usdResult.status === 'rejected') {
    logger.error('Falha ao consultar PTAX para USD.', usdResult.reason)
  }

  if (eurResult.status === 'rejected') {
    logger.error('Falha ao consultar PTAX para EUR.', eurResult.reason)
  }

  if (!usdRate && !eurRate) {
    throw new HttpsError('unavailable', 'Nao foi possivel consultar a PTAX no momento.')
  }

  return {
    usd: usdRate,
    eur: eurRate,
    updatedAt: usdRate?.quotedAt || eurRate?.quotedAt || null,
  }
})

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
      normalizeString(message.authorName || message.authorEmail || 'Usuario')
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
          'Sua duvida recebeu uma resposta',
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
          'Nova duvida em processo',
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
        'Atualizacao em processo favoritado',
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
    const actorName = getUserDisplayName(actorProfile, normalizeString(after.updatedByName || 'Usuario'))
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
          'Observacoes pos-recebimento atualizadas',
          buildPostReceiptNotesNotificationBody(processLabel, actorName)
        )
      })

      favoriteUsers.forEach((favoriteUser) => {
        const processLabel = buildRecipientProcessLabel(process, normalizeString(favoriteUser.role))
        maybeAddNotification(
          favoriteUser,
          'post_receipt_notes_updated',
          'Observacoes pos-recebimento atualizadas',
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

    const mailer = getMailer()

    if (!mailer) {
      logger.info('SMTP nao configurado. Email de notificacao nao enviado.', {
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

export const sendNewsPublishedEmail = onDocumentCreated(
  {
    document: 'news/{newsId}',
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const newsItem = event.data?.data()
    if (!newsItem) return

    const mailer = getMailer()

    if (!mailer) {
      logger.info('SMTP nao configurado. Email de noticia nao enviado.', {
        newsId: event.params.newsId,
      })
      return
    }

    const usersSnapshot = await getFirestore().collection('users').get()
    const recipients = usersSnapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .map((user) => ({
        id: normalizeString(user.id),
        name: repairTextEncoding(normalizeString(user.name)),
        email: normalizeEmail(user.email),
        status: normalizeString(user.status),
      }))
      .filter((user) => isActiveStatus(user.status) && isCorporateEmail(user.email))

    const uniqueRecipients = Array.from(new Map(recipients.map((user) => [user.email, user])).values())

    const results = await Promise.allSettled(
      uniqueRecipients.map(async (recipient) => {
        const message = buildNewsPublishedEmailMessage(newsItem, recipient)

        await mailer.sendMail({
          from: getEmailFromAddress(),
          to: recipient.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        })
      })
    )

    const failedRecipients = results
      .map((result, index) => ({ result, recipient: uniqueRecipients[index] }))
      .filter((entry) => entry.result.status === 'rejected')

    if (failedRecipients.length > 0) {
      logger.error('Falha ao enviar algumas notificacoes de noticia.', {
        newsId: event.params.newsId,
        failedRecipients: failedRecipients.map((entry) => ({
          email: entry.recipient.email,
          reason: String(entry.result.reason?.message ?? entry.result.reason ?? 'unknown'),
        })),
      })
    }
  }
)

export const sendPendingApprovalAdminEmail = onDocumentCreated(
  {
    document: 'users/{userId}',
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const pendingUser = event.data?.data()
    if (!pendingUser) return

    const role = normalizeString(pendingUser.role).toLowerCase() || 'user'
    const status = normalizeString(pendingUser.status).toLowerCase() || 'pendente'

    if (role === 'admin' || status !== 'pendente') return

    const mailer = getMailer()

    if (!mailer) {
      logger.info('SMTP nao configurado. Email de aprovacao pendente nao enviado.', {
        userId: event.params.userId,
      })
      return
    }

    const adminRecipients = await listActiveAdminUsers()

    if (adminRecipients.length === 0) {
      logger.info('Nenhum admin ativo encontrado para o aviso de aprovacao pendente.', {
        userId: event.params.userId,
      })
      return
    }

    const results = await Promise.allSettled(
      adminRecipients.map(async (adminRecipient) => {
        const message = buildPendingApprovalAdminEmailMessage({
          pendingUser,
          adminRecipient,
        })

        await mailer.sendMail({
          from: getEmailFromAddress(),
          to: normalizeEmail(adminRecipient.email),
          subject: message.subject,
          text: message.text,
          html: message.html,
        })
      })
    )

    const failedRecipients = results
      .map((result, index) => ({ result, recipient: adminRecipients[index] }))
      .filter((entry) => entry.result.status === 'rejected')

    if (failedRecipients.length > 0) {
      logger.error('Falha ao enviar alguns emails de aprovacao pendente.', {
        userId: event.params.userId,
        failedRecipients: failedRecipients.map((entry) => ({
          email: normalizeEmail(entry.recipient.email),
          reason: String(entry.result.reason?.message ?? entry.result.reason ?? 'unknown'),
        })),
      })
    }
  }
)
