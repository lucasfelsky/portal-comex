
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/logger';
import nodemailer from 'nodemailer';
import {
  ALLOWED_ROLES, ALLOWED_STATUSES, APP_URL, BRAND_COLORS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
  normalizeString, normalizeEmail, normalizeList, isCorporateEmail, isActiveStatus, repairTextEncoding, escapeHtml, getRolePermissions, getStatusTone, getDefaultLastAccess, getDefaultNotes, getUserDisplayName, getMailer, getEmailFromAddress, getUserProfile, listActiveAdminUsers, recordAuditEvent, assertActiveAdmin, deleteNotificationsForRecipient
} from '../core/shared.js';

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
