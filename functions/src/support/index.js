
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/logger';
import nodemailer from 'nodemailer';
import {
  APP_URL, BRAND_COLORS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
  normalizeString, normalizeEmail, repairTextEncoding, escapeHtml, getMailer, getEmailFromAddress, getUserProfile, listActiveAdminUsers, recordAuditEvent, shouldNotify, createNotifications
} from '../core/shared.js';

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
// Suporte v2: e-mail ao AUTOR quando o chamado dele é marcado como resolvido
// (mesmo molde do buildSupportTicketAdminEmailMessage, na direção oposta).
function buildSupportTicketResolvedAuthorEmailMessage({ ticket, resolvedByName }) {
  const authorName = repairTextEncoding(normalizeString(ticket?.authorName)) || 'Usuário'
  const greeting = `Olá, ${authorName}.`
  const message = repairTextEncoding(normalizeString(ticket?.message)) || '(sem mensagem)'
  const resolverName = repairTextEncoding(normalizeString(resolvedByName)) || 'a equipe administrativa'
  const resolutionMessage = repairTextEncoding(normalizeString(ticket?.resolutionMessage)) || ''

  const textLines = [
    greeting,
    '',
    `Seu chamado de suporte no Portal COMEX foi marcado como resolvido por ${resolverName}.`,
  ]
  if (resolutionMessage) {
    textLines.push('', 'Resposta da equipe:', resolutionMessage)
  }
  textLines.push('', 'Chamado:', message, '', 'Se o problema persistir, abra um novo chamado pelo botão Suporte no portal:', APP_URL)

  return {
    subject: '[Portal COMEX] Seu chamado de suporte foi resolvido',
    text: textLines.join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: ${BRAND_COLORS.ink}; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p>Seu chamado de suporte no <strong>Portal COMEX</strong> foi marcado como <strong>resolvido</strong> por ${escapeHtml(resolverName)}.</p>
        ${resolutionMessage ? `<div style="padding: 16px 18px; border-radius: 14px; background: ${BRAND_COLORS.primary}; color: #ffffff; border: 1px solid ${BRAND_COLORS.border}; margin-bottom: 16px;"><p style="margin: 0; font-weight: 700;">Resposta da equipe:</p><p style="margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml(resolutionMessage)}</p></div>` : ''}
        <div style="padding: 16px 18px; border-radius: 14px; background: ${BRAND_COLORS.bgTint1}; border: 1px solid ${BRAND_COLORS.border};">
          <p style="margin: 0; font-weight: 700;">Chamado:</p>
          <p style="margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
        </div>
        <p style="margin-top: 18px;">Se o problema persistir, abra um novo chamado pelo botão <strong>Suporte</strong> no portal.</p>
        <p style="margin-top: 18px;">
          <a
            href="${APP_URL}"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: ${BRAND_COLORS.primary}; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Abrir o Portal COMEX
          </a>
        </p>
      </div>
    `,
  }
}
// Suporte v3 (thread, 2026-08-11): e-mail ao AUTOR quando o time responde no
// chamado sem necessariamente resolvê-lo (mesmo molde do
// buildSupportTicketResolvedAuthorEmailMessage).
function buildSupportTicketReplyAuthorEmailMessage({ ticket, reply }) {
  const authorName = repairTextEncoding(normalizeString(ticket?.authorName)) || 'Usuário'
  const greeting = `Olá, ${authorName}.`
  const message = repairTextEncoding(normalizeString(ticket?.message)) || '(sem mensagem)'
  const replyAuthorName = repairTextEncoding(normalizeString(reply?.authorName)) || 'a equipe administrativa'
  const replyMessage = repairTextEncoding(normalizeString(reply?.message)) || ''

  const textLines = [
    greeting,
    '',
    `${replyAuthorName} respondeu no seu chamado de suporte no Portal COMEX.`,
  ]
  if (replyMessage) {
    textLines.push('', 'Resposta:', replyMessage)
  }
  textLines.push('', 'Chamado:', message, '', 'Acesse o botão Suporte no portal para ver a conversa completa:', APP_URL)

  return {
    subject: '[Portal COMEX] Nova resposta no seu chamado de suporte',
    text: textLines.join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: ${BRAND_COLORS.ink}; line-height: 1.5;">
        <p>${escapeHtml(greeting)}</p>
        <p><strong>${escapeHtml(replyAuthorName)}</strong> respondeu no seu chamado de suporte no <strong>Portal COMEX</strong>.</p>
        ${replyMessage ? `<div style="padding: 16px 18px; border-radius: 14px; background: ${BRAND_COLORS.primary}; color: #ffffff; border: 1px solid ${BRAND_COLORS.border}; margin-bottom: 16px;"><p style="margin: 0; font-weight: 700;">Resposta:</p><p style="margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml(replyMessage)}</p></div>` : ''}
        <div style="padding: 16px 18px; border-radius: 14px; background: ${BRAND_COLORS.bgTint1}; border: 1px solid ${BRAND_COLORS.border};">
          <p style="margin: 0; font-weight: 700;">Chamado:</p>
          <p style="margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
        </div>
        <p style="margin-top: 18px;">Acesse o botão <strong>Suporte</strong> no portal para ver a conversa completa.</p>
        <p style="margin-top: 18px;">
          <a
            href="${APP_URL}"
            style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: ${BRAND_COLORS.primary}; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Abrir o Portal COMEX
          </a>
        </p>
      </div>
    `,
  }
}
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

    // F9: preferencia suporte x email de cada admin. Default ligado.
    const emailRecipients = adminRecipients.filter((adminRecipient) =>
      shouldNotify(adminRecipient, 'suporte', 'email')
    )

    const results = await Promise.allSettled(
      emailRecipients.map(async (adminRecipient) => {
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
      .map((result, index) => ({ result, recipient: emailRecipients[index] }))
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
// Suporte v2: quando um admin marca o chamado como resolvido, o AUTOR é
// avisado por DOIS canais independentes (mesmo desenho do
// notifySupportTicketCreated, na direção oposta):
//   1. notificação in-app (type `support_ticket_resolved`) — o clique abre o
//      modal de suporte do usuário (desvio no handleOpenNotification do
//      AppLayout), não a aba admin;
//   2. e-mail ao autor (se SMTP configurado).
// Dispara só na TRANSIÇÃO para 'resolvido' (reabrir e re-resolver notifica de
// novo, intencional). Admin que resolve o próprio chamado não é notificado.
// A auditoria fica no client (updateSupportTicket já registra o evento).
export const notifySupportTicketResolved = onDocumentUpdated(
  {
    document: 'supportTickets/{ticketId}',
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return

    const becameResolved = before.status !== 'resolvido' && after.status === 'resolvido'
    if (!becameResolved) return

    const ticketId = event.params.ticketId
    const authorId = normalizeString(after.authorId)
    const authorEmail = normalizeEmail(after.authorEmail)
    const resolvedById = normalizeString(after.resolvedById)
    const resolvedByName = repairTextEncoding(normalizeString(after.resolvedByName)) || 'Equipe administrativa'
    const messageSnippet = repairTextEncoding(normalizeString(after.message)).slice(0, 140)

    if (!authorId) {
      logger.info('Chamado resolvido sem authorId; aviso ao autor ignorado.', { ticketId })
      return
    }

    if (resolvedById && resolvedById === authorId) {
      logger.info('Autor resolveu o próprio chamado; aviso ao autor ignorado.', { ticketId })
      return
    }

    try {
      await createNotifications([
        {
          recipientUserId: authorId,
          actorUserId: resolvedById,
          actorName: resolvedByName,
          type: 'support_ticket_resolved',
          processId: '',
          messageId: ticketId,
          title: 'Chamado de suporte resolvido',
          body: `Seu chamado foi resolvido por ${resolvedByName}${after.resolutionMessage ? ': ' + repairTextEncoding(normalizeString(after.resolutionMessage)) : ': ' + messageSnippet}`,
          targetTab: 'suporte',
        },
      ])
    } catch (error) {
      logger.error('Falha ao criar notificação in-app de chamado resolvido.', {
        ticketId,
        reason: String(error?.message ?? error ?? 'unknown'),
      })
    }

    const mailer = getMailer()

    if (!mailer) {
      logger.info('SMTP não configurado. Email de chamado resolvido não enviado.', { ticketId })
      return
    }

    if (!authorEmail) {
      logger.info('Chamado resolvido sem email do autor; email não enviado.', { ticketId })
      return
    }

    // F9: preferencia suporte x email do AUTOR. Default ligado.
    const authorProfile = await getUserProfile(authorId)
    if (!shouldNotify(authorProfile, 'suporte', 'email')) {
      logger.info('Email de chamado resolvido suprimido por preferencia do autor.', { ticketId })
      return
    }

    try {
      const message = buildSupportTicketResolvedAuthorEmailMessage({
        ticket: after,
        resolvedByName,
      })

      await mailer.sendMail({
        from: getEmailFromAddress(),
        to: authorEmail,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    } catch (error) {
      logger.error('Falha ao enviar email de chamado resolvido ao autor.', {
        ticketId,
        reason: String(error?.message ?? error ?? 'unknown'),
      })
    }
  }
)
// Suporte v3 (thread, 2026-08-11): quando o admin acrescenta uma resposta em
// `replies[]` sem necessariamente resolver o chamado, o AUTOR é avisado por
// DOIS canais independentes (mesmo desenho do notifySupportTicketResolved):
//   1. notificação in-app (type `support_ticket_reply`) — o clique abre o
//      modal de suporte do usuário (mesmo desvio de support_ticket_resolved);
//   2. e-mail ao autor (se SMTP configurado).
// Guard contra notificação dupla: se o MESMO write responde E resolve, só o
// notifySupportTicketResolved avisa (evita 2 emails pro autor). Admin que
// responde ao próprio chamado não é notificado.
export const notifySupportTicketReplied = onDocumentUpdated(
  {
    document: 'supportTickets/{ticketId}',
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return

    const beforeReplies = Array.isArray(before.replies) ? before.replies : []
    const afterReplies = Array.isArray(after.replies) ? after.replies : []
    if (afterReplies.length <= beforeReplies.length) return

    const becameResolved = before.status !== 'resolvido' && after.status === 'resolvido'
    if (becameResolved) return

    const ticketId = event.params.ticketId
    const authorId = normalizeString(after.authorId)

    if (!authorId) {
      logger.info('Resposta em chamado sem authorId; aviso ao autor ignorado.', { ticketId })
      return
    }

    const reply = afterReplies[afterReplies.length - 1]
    const replyAuthorId = normalizeString(reply?.authorId)
    const replyAuthorName = repairTextEncoding(normalizeString(reply?.authorName)) || 'Equipe administrativa'
    const replySnippet = repairTextEncoding(normalizeString(reply?.message)).slice(0, 140)

    if (replyAuthorId && replyAuthorId === authorId) {
      logger.info('Autor respondeu ao próprio chamado; aviso ao autor ignorado.', { ticketId })
      return
    }

    try {
      await createNotifications([
        {
          recipientUserId: authorId,
          actorUserId: replyAuthorId,
          actorName: replyAuthorName,
          type: 'support_ticket_reply',
          processId: '',
          messageId: ticketId,
          title: 'Nova resposta no seu chamado',
          body: `${replyAuthorName}: ${replySnippet}`,
          targetTab: 'suporte',
        },
      ])
    } catch (error) {
      logger.error('Falha ao criar notificação in-app de resposta em chamado de suporte.', {
        ticketId,
        reason: String(error?.message ?? error ?? 'unknown'),
      })
    }

    const mailer = getMailer()

    if (!mailer) {
      logger.info('SMTP não configurado. Email de resposta em chamado não enviado.', { ticketId })
      return
    }

    const authorEmail = normalizeEmail(after.authorEmail)

    if (!authorEmail) {
      logger.info('Resposta em chamado sem email do autor; email não enviado.', { ticketId })
      return
    }

    // F9: preferencia suporte x email do AUTOR. Default ligado.
    const authorProfile = await getUserProfile(authorId)
    if (!shouldNotify(authorProfile, 'suporte', 'email')) {
      logger.info('Email de resposta em chamado suprimido por preferencia do autor.', { ticketId })
      return
    }

    try {
      const message = buildSupportTicketReplyAuthorEmailMessage({
        ticket: after,
        reply,
      })

      await mailer.sendMail({
        from: getEmailFromAddress(),
        to: authorEmail,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    } catch (error) {
      logger.error('Falha ao enviar email de resposta em chamado ao autor.', {
        ticketId,
        reason: String(error?.message ?? error ?? 'unknown'),
      })
    }
  }
)
