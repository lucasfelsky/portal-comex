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

/**
 * Define as custom claims `role` e `status` em um usuário.
 * Deve ser chamado em todo ponto que altera role/status para que as rules
 * passem a ler de `request.auth.token` em vez de fazer `firestore.get(users/{uid})`.
 * Falha não quebra a operação principal (log apenas) — o backfill cobre gaps.
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

function buildNewsPublishedEmailMessage(newsItem, recipient) {
  const title = repairTextEncoding(normalizeString(newsItem?.title || 'Nova notícia publicada'))
  const content = repairTextEncoding(normalizeString(newsItem?.content))
  const recipientName = repairTextEncoding(normalizeString(recipient?.name))
  const greeting = recipientName ? `Olá, ${recipientName}.` : 'Olá.'
  const safeTitle = escapeHtml(title)
  const safeContent = escapeHtml(content).replaceAll('\n', '<br />')

  return {
    subject: `[Portal COMEX] Nova notícia: ${title}`,
    text: [
      greeting,
      '',
      'Uma nova notícia foi publicada no Portal COMEX.',
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
      <div style="font-family: Arial, sans-serif; color: ${BRAND_COLORS.ink}; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Uma nova notícia foi publicada no <strong>Portal COMEX</strong>.</p>
        <div style="padding: 16px 18px; border-radius: 14px; background: ${BRAND_COLORS.bgTint1}; border: 1px solid ${BRAND_COLORS.border};">
          <p style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">${safeTitle}</p>
          <p style="margin: 0;">${safeContent || 'Acesse o portal para visualizar a notícia completa.'}</p>
        </div>
        <p style="margin-top: 18px;">
          <a
            href="${APP_URL}/news"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: ${BRAND_COLORS.primary}; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Ver notícia no portal
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
    throw new Error('Link de ação do Firebase sem oobCode.')
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
  const greeting = safeRecipientName ? `Olá, ${safeRecipientName}.` : 'Olá.'

  return {
    subject: '[Portal COMEX] Confirme o seu email corporativo',
    text: [
      greeting,
      '',
      'Seu cadastro no Portal COMEX foi criado.',
      'Para liberar o acesso, confirme o seu email corporativo no link abaixo:',
      verificationLink,
      '',
      'Se você não solicitou esse cadastro, ignore esta mensagem.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: ${BRAND_COLORS.ink}; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Seu cadastro no <strong>Portal COMEX</strong> foi criado.</p>
        <p>Para liberar o acesso, confirme o seu email corporativo no botão abaixo:</p>
        <p>
          <a
            href="${verificationLink}"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: ${BRAND_COLORS.primary}; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Confirmar email
          </a>
        </p>
        <p style="word-break: break-all;">Se preferir, copie e cole este link no navegador:<br />${verificationLink}</p>
        <p>Se você não solicitou esse cadastro, ignore esta mensagem.</p>
      </div>
    `,
  }
}

function buildPasswordResetEmailMessage({ recipientName, resetLink }) {
  const safeRecipientName = repairTextEncoding(normalizeString(recipientName))
  const greeting = safeRecipientName ? `Olá, ${safeRecipientName}.` : 'Olá.'

  return {
    subject: '[Portal COMEX] Redefina a sua senha',
    text: [
      greeting,
      '',
      'Recebemos uma solicitação para redefinir a sua senha do Portal COMEX.',
      'Use o link abaixo para cadastrar uma nova senha:',
      resetLink,
      '',
      'Se você não fez essa solicitação, ignore esta mensagem.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: ${BRAND_COLORS.ink}; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Recebemos uma solicitação para redefinir a sua senha do <strong>Portal COMEX</strong>.</p>
        <p>Use o botão abaixo para cadastrar uma nova senha:</p>
        <p>
          <a
            href="${resetLink}"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: ${BRAND_COLORS.primary}; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Redefinir senha
          </a>
        </p>
        <p style="word-break: break-all;">Se preferir, copie e cole este link no navegador:<br />${resetLink}</p>
        <p>Se você não fez essa solicitação, ignore esta mensagem.</p>
      </div>
    `,
  }
}

function buildPendingApprovalAdminEmailMessage({ pendingUser, adminRecipient }) {
  const recipientName = repairTextEncoding(normalizeString(adminRecipient?.name))
  const greeting = recipientName ? `Olá, ${recipientName}.` : 'Olá.'
  const pendingUserName = repairTextEncoding(normalizeString(pendingUser?.name)) || 'Usuário sem nome'
  const pendingUserEmail = normalizeEmail(pendingUser?.email)
  const pendingUserArea = repairTextEncoding(normalizeString(pendingUser?.area)) || 'Não informada'
  const pendingUserStatus = repairTextEncoding(normalizeString(pendingUser?.status || 'Pendente'))

  return {
    subject: '[Portal COMEX] Novo cadastro pendente de aprovação',
    text: [
      greeting,
      '',
      'Um novo usuário se cadastrou no Portal COMEX e aguarda aprovação administrativa.',
      '',
      `Nome: ${pendingUserName}`,
      `Email: ${pendingUserEmail || 'Não informado'}`,
      `Área: ${pendingUserArea}`,
      `Status: ${pendingUserStatus}`,
      '',
      'Acesse o painel administrativo para revisar e aprovar o cadastro:',
      `${APP_URL}/admin`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: ${BRAND_COLORS.ink}; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Um novo usuário se cadastrou no <strong>Portal COMEX</strong> e aguarda aprovação administrativa.</p>
        <div style="padding: 16px 18px; border-radius: 14px; background: ${BRAND_COLORS.bgTint1}; border: 1px solid ${BRAND_COLORS.border};">
          <p style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">${escapeHtml(pendingUserName)}</p>
          <p style="margin: 0 0 6px;"><strong>Email:</strong> ${escapeHtml(pendingUserEmail || 'Não informado')}</p>
          <p style="margin: 0 0 6px;"><strong>Área:</strong> ${escapeHtml(pendingUserArea)}</p>
          <p style="margin: 0;"><strong>Status:</strong> ${escapeHtml(pendingUserStatus)}</p>
        </div>
        <p style="margin-top: 18px;">
          <a
            href="${APP_URL}/admin"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: ${BRAND_COLORS.primary}; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Revisar cadastro pendente
          </a>
        </p>
      </div>
    `,
  }
}

function buildSupportTicketAdminEmailMessage({ ticket, ticketId, adminRecipient }) {
  const recipientName = repairTextEncoding(normalizeString(adminRecipient?.name))
  const greeting = recipientName ? `Olá, ${recipientName}.` : 'Olá.'
  const authorName = repairTextEncoding(normalizeString(ticket?.authorName)) || 'Usuário sem nome'
  const authorEmail = normalizeEmail(ticket?.authorEmail)
  const message = repairTextEncoding(normalizeString(ticket?.message)) || '(sem mensagem)'
  const imageCount = Array.isArray(ticket?.imageUrls) ? ticket.imageUrls.length : 0
  const priority = Number.isFinite(Number(ticket?.priority)) ? Number(ticket.priority) : 3

  return {
    subject: '[Portal COMEX] Novo chamado de suporte',
    text: [
      greeting,
      '',
      'Um novo chamado de suporte foi aberto no Portal COMEX.',
      '',
      `Aberto por: ${authorName}`,
      `Email: ${authorEmail || 'Não informado'}`,
      `Prioridade: ${priority}`,
      imageCount > 0 ? `Anexos: ${imageCount} imagem(ns)` : 'Anexos: nenhum',
      '',
      'Mensagem:',
      message,
      '',
      'Acesse a aba de suporte para triar o chamado:',
      `${APP_URL}/admin/suporte`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: ${BRAND_COLORS.ink}; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Um novo chamado de suporte foi aberto no <strong>Portal COMEX</strong>.</p>
        <div style="padding: 16px 18px; border-radius: 14px; background: ${BRAND_COLORS.bgTint1}; border: 1px solid ${BRAND_COLORS.border};">
          <p style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">${escapeHtml(authorName)}</p>
          <p style="margin: 0 0 6px;"><strong>Email:</strong> ${escapeHtml(authorEmail || 'Não informado')}</p>
          <p style="margin: 0 0 6px;"><strong>Prioridade:</strong> ${escapeHtml(String(priority))}</p>
          <p style="margin: 0 0 10px;"><strong>Anexos:</strong> ${escapeHtml(imageCount > 0 ? `${imageCount} imagem(ns)` : 'nenhum')}</p>
          <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
        </div>
        <p style="margin-top: 18px;">
          <a
            href="${APP_URL}/admin/suporte"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: ${BRAND_COLORS.primary}; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Abrir aba de suporte
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
    throw new Error(`Nenhuma cotação PTAX encontrada para ${currencyCode}.`)
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
    throw new HttpsError('unauthenticated', 'Usuário não autenticado.')
  }

  const actorProfile = await getUserProfile(authContext.uid)

  if (!actorProfile || actorProfile.role !== 'admin' || !isActiveStatus(actorProfile.status)) {
    throw new HttpsError('permission-denied', 'Apenas administradores ativos podem executar esta ação.')
  }

  return actorProfile
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
    throw new HttpsError('invalid-argument', 'Perfil de usuário inválido.')
  }

  if (!ALLOWED_STATUSES.has(requestedStatus)) {
    throw new HttpsError('invalid-argument', 'Status de usuário inválido.')
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
    action: 'Usuário criado',
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
    throw new HttpsError('invalid-argument', 'UID do usuário é obrigatório.')
  }

  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'Não é permitido excluir o próprio usuário logado.')
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
    action: 'Usuário removido',
    actor: getUserDisplayName(actorProfile, actorProfile.email),
    target: uid,
  })

  return { success: true }
})

/**
 * Atualiza role e/ou status de um usuário, persistindo em ambos:
 *   - Firestore `users/{uid}` (exibição, relatórios, histórico)
 *   - Firebase Auth custom claims `role`/`status` (autorização via rules)
 *
 * O front NÃO escreve mais direto em `users/{uid}.role`/`.status` — usa este callable.
 * Substitui o write direto que existia no AdminUsersPanel.
 */
export const adminUpdateUserClaims = onCall(async (request) => {
  const actorProfile = await assertActiveAdmin(request.auth)
  const uid = normalizeString(request.data?.uid)
  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID do usuário é obrigatório.')
  }

  const requestedRole = request.data?.role === undefined ? null : normalizeString(request.data.role)
  const requestedStatus = request.data?.status === undefined ? null : normalizeString(request.data.status)

  if (requestedRole !== null && !ALLOWED_ROLES.has(requestedRole)) {
    throw new HttpsError('invalid-argument', 'Perfil de usuário inválido.')
  }
  if (requestedStatus !== null && !ALLOWED_STATUSES.has(requestedStatus)) {
    throw new HttpsError('invalid-argument', 'Status de usuário inválido.')
  }
  if (requestedRole === null && requestedStatus === null) {
    throw new HttpsError('invalid-argument', 'Informe role e/ou status para atualizar.')
  }

  // Não permite admin se autobloquear / se rebaixar.
  if (uid === request.auth.uid && requestedStatus !== null && requestedStatus !== 'Ativo') {
    throw new HttpsError('failed-precondition', 'Não é permitido bloquear o próprio usuário logado.')
  }

  const userRef = getFirestore().collection('users').doc(uid)
  const snapshot = await userRef.get()
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Usuário não encontrado.')
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
    action: 'Claims do usuário atualizadas',
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
    throw new HttpsError('invalid-argument', 'UID do usuário é obrigatório.')
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
      throw new HttpsError('unauthenticated', 'Usuário não autenticado.')
    }

    const requestedUid = normalizeString(request.data?.uid)
    const actorProfile = await getUserProfile(request.auth.uid)
    const actorIsAdmin = actorProfile?.role === 'admin' && isActiveStatus(actorProfile?.status)
    const targetUid = requestedUid && actorIsAdmin ? requestedUid : request.auth.uid
    const targetUser = await getAuth().getUser(targetUid)
    const targetEmail = normalizeEmail(targetUser.email)

    if (!targetEmail) {
      throw new HttpsError('failed-precondition', 'Usuário sem email cadastrado.')
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
        'SMTP não configurado nas Cloud Functions para enviar o email de verificação.'
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
      throw new HttpsError('invalid-argument', 'Email é obrigatório.')
    }

    if (!isCorporateEmail(email)) {
      throw new HttpsError('invalid-argument', 'Use um email corporativo @sqquimica.com.')
    }

    const mailer = getMailer()

    if (!mailer) {
      throw new HttpsError(
        'failed-precondition',
        'SMTP não configurado nas Cloud Functions para enviar o email de redefinição.'
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
    throw new HttpsError('unavailable', 'Não foi possível consultar a PTAX no momento.')
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
      logger.info('SMTP não configurado. Email de notícia não enviado.', {
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
      logger.error('Falha ao enviar algumas notificações de notícia.', {
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
      logger.info('SMTP não configurado. Email de aprovação pendente não enviado.', {
        userId: event.params.userId,
      })
      return
    }

    const adminRecipients = await listActiveAdminUsers()

    if (adminRecipients.length === 0) {
      logger.info('Nenhum admin ativo encontrado para o aviso de aprovação pendente.', {
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
      logger.error('Falha ao enviar alguns emails de aprovação pendente.', {
        userId: event.params.userId,
        failedRecipients: failedRecipients.map((entry) => ({
          email: normalizeEmail(entry.recipient.email),
          reason: String(entry.result.reason?.message ?? entry.result.reason ?? 'unknown'),
        })),
      })
    }
  }
)

// Aba de suporte (backlog 2026-07-10): quando um usuário abre um chamado em
// `supportTickets/{ticketId}` (create direto do client, validado pelas rules),
// este trigger avisa os admins por DOIS canais independentes:
//   1. notificação in-app (`createNotifications`, type `support_ticket`) —
//      criada mesmo sem SMTP configurado;
//   2. e-mail (mesmo padrão de `sendPendingApprovalAdminEmail`).
// O autor não recebe a própria notificação (caso um admin abra chamado).
export const notifySupportTicketCreated = onDocumentCreated(
  {
    document: 'supportTickets/{ticketId}',
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const ticket = event.data?.data()
    if (!ticket) return

    const ticketId = event.params.ticketId
    const authorId = normalizeString(ticket.authorId)
    const authorName = repairTextEncoding(normalizeString(ticket.authorName)) || 'Usuário'
    const messageSnippet = repairTextEncoding(normalizeString(ticket.message)).slice(0, 140)

    await recordAuditEvent({
      action: 'Chamado de suporte aberto',
      actor: authorName,
      target: ticketId,
    })

    const adminRecipients = await listActiveAdminUsers()

    if (adminRecipients.length === 0) {
      logger.info('Nenhum admin ativo encontrado para o aviso de chamado de suporte.', {
        ticketId,
      })
      return
    }

    const notificationRecipients = adminRecipients.filter((admin) => admin.id !== authorId)

    try {
      await createNotifications(
        notificationRecipients.map((admin) => ({
          recipientUserId: admin.id,
          actorUserId: authorId,
          actorName: authorName,
          type: 'support_ticket',
          processId: '',
          messageId: ticketId,
          title: 'Novo chamado de suporte',
          body: `${authorName}: ${messageSnippet}`,
          targetTab: 'suporte',
        }))
      )
    } catch (error) {
      logger.error('Falha ao criar notificações in-app do chamado de suporte.', {
        ticketId,
        reason: String(error?.message ?? error ?? 'unknown'),
      })
    }

    const mailer = getMailer()

    if (!mailer) {
      logger.info('SMTP não configurado. Email de chamado de suporte não enviado.', {
        ticketId,
      })
      return
    }

    const results = await Promise.allSettled(
      adminRecipients.map(async (adminRecipient) => {
        const message = buildSupportTicketAdminEmailMessage({
          ticket,
          ticketId,
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
      logger.error('Falha ao enviar alguns emails de chamado de suporte.', {
        ticketId,
        failedRecipients: failedRecipients.map((entry) => ({
          email: normalizeEmail(entry.recipient.email),
          reason: String(entry.result.reason?.message ?? entry.result.reason ?? 'unknown'),
        })),
      })
    }
  }
)
