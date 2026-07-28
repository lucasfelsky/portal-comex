
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
  normalizeString, normalizeEmail, isCorporateEmail, isActiveStatus, repairTextEncoding, escapeHtml, getMailer, getEmailFromAddress, shouldNotify
} from '../core/shared.js';

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
        notificationPreferences: user.notificationPreferences ?? null,
      }))
      .filter((user) => isActiveStatus(user.status) && isCorporateEmail(user.email))
      // F9: preferencia noticias x email. Default ligado.
      .filter((user) => shouldNotify(user, 'noticias', 'email'))

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
