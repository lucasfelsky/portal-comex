// E-mail HTML do tipo `process_cargo_report_uploaded` (Relatorio de Carga).
//
// Layout IMAGEM + BOTAO: a arte (banner com logo, titulo, mensagem e cartao de
// documento) e' uma imagem pronta (`functions/assets/email/cargo-report-banner.jpg`)
// seguida do botao "Abrir processo no Portal COMEX" e de um rodape discreto.
// A mensagem exata (`CARGO_REPORT_NOTIFICATION_BODY`) vai no `alt` da imagem
// (clientes que bloqueiam imagem) e na versao texto puro; o processo vai no
// ASSUNTO e no texto puro.
//
// Modulo PURO: so' importa `node:url` e `./cargoReportNotification.js`. Sem
// SDK do Firebase, sem cliente SMTP e sem o modulo `core` compartilhado (mesmo
// padrao dos demais modulos puros de `functions/src/process/`: importavel por
// teste e pelo script de pre-visualizacao sem mocks nem secrets). Devolve
// `{ subject, text, html, attachments }`; quem envia e' o chamador
// (`./documents.js` e `sendProcessNotificationEmail` em `./index.js`).
//
// Imagem por CID (D1): o banner viaja DENTRO da mensagem (anexo inline) em vez
// de uma URL em `public/`. Hosting em `public/` acoplaria o e-mail ao deploy do
// Hosting (function no ar antes do Hosting = imagem quebrada) e o Outlook
// bloqueia imagem remota por padrao. O deploy de functions empacota
// `functions/` inteira, entao `functions/assets/email/` vai junto.

import { fileURLToPath } from 'node:url'
import {
  CARGO_REPORT_NOTIFICATION_BODY,
  CARGO_REPORT_SUBJECT_PREFIX,
  extractCargoReportProcessLabel,
  sanitizeCargoReportText,
} from './cargoReportNotification.js'

export const CARGO_REPORT_EMAIL_BANNER_CID = 'cargo-report-banner@portal-comex'
export const CARGO_REPORT_EMAIL_BANNER_PATH = fileURLToPath(
  new URL('../../assets/email/cargo-report-banner.jpg', import.meta.url)
)

export const CTA_BG = '#008F76'
export const CTA_TEXT = '#FFFFFF'

const DEFAULT_APP_URL = 'https://portal-comex.com'
const FONT = 'Poppins, Arial, Helvetica, sans-serif'
const PAGE_BG = '#F4F7F7'
const FOOTER_TEXT = '#6b7b82'

// Mesma semantica de `escapeHtml` do modulo `core` compartilhado, duplicada
// aqui para manter este modulo puro.
export function escapeEmailHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildCargoReportProcessUrl(processId, appUrl = DEFAULT_APP_URL) {
  const base = `${String(appUrl ?? DEFAULT_APP_URL).replace(/\/+$/, '')}/processos`
  const id = String(processId ?? '').trim()
  if (!id) return base
  return `${base}?processo=${encodeURIComponent(id)}&aba=documents`
}

// `subject` = assunto ja montado por `buildCargoReportSubject` (sem prefixo
// "[Portal COMEX]"; no envio via notificacao e' o proprio `title` do doc).
// Aqui so' e' sanitizado de novo (sem CR/LF) antes de virar header.
export function buildCargoReportEmail({
  subject: rawSubject,
  processId,
  recipientName = '',
  appUrl = DEFAULT_APP_URL,
  bannerSrc,
} = {}) {
  const subject = sanitizeCargoReportText(rawSubject) || CARGO_REPORT_SUBJECT_PREFIX
  const label = extractCargoReportProcessLabel(subject)
  const name = String(recipientName ?? '').trim()
  const url = buildCargoReportProcessUrl(processId, appUrl)
  const greeting = name ? `Olá, ${name}.` : 'Olá.'

  const text = [
    greeting,
    '',
    CARGO_REPORT_NOTIFICATION_BODY,
    '',
    ...(label ? [`Processo: ${label}`, ''] : []),
    'Abra o processo no Portal COMEX (aba Documentos):',
    url,
  ].join('\n')

  const useInlineSrc = typeof bannerSrc === 'string' && bannerSrc !== ''
  const imgSrc = useInlineSrc ? bannerSrc : `cid:${CARGO_REPORT_EMAIL_BANNER_CID}`
  const attachments = useInlineSrc
    ? []
    : [
        {
          filename: 'cargo-report-banner.jpg',
          path: CARGO_REPORT_EMAIL_BANNER_PATH,
          cid: CARGO_REPORT_EMAIL_BANNER_CID,
          contentType: 'image/jpeg',
          contentDisposition: 'inline',
        },
      ]

  const safeSubject = escapeEmailHtml(subject)
  const safePreheader = escapeEmailHtml(
    label
      ? `Relatório de Carga do processo ${label} disponível no Portal COMEX.`
      : 'Relatório de Carga disponível no Portal COMEX.'
  )
  const safeAlt = escapeEmailHtml(CARGO_REPORT_NOTIFICATION_BODY)
  const safeUrl = escapeEmailHtml(url)
  const safeImgSrc = escapeEmailHtml(imgSrc)
  const tableAttrs = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'

  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${safeSubject}</title>
<style>
@media only screen and (max-width:620px) {
  .sq-container { width:100% !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">${safePreheader}</div>
<table ${tableAttrs} width="100%" bgcolor="${PAGE_BG}" style="width:100%;background-color:${PAGE_BG};">
<tr>
<td align="center" style="padding:24px 12px;">
<table ${tableAttrs} width="600" class="sq-container" style="width:100%;max-width:600px;">
<tr>
<td align="center" style="padding:0;">
<img src="${safeImgSrc}" width="600" alt="${safeAlt}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:24px;border:0">
</td>
</tr>
<tr>
<td align="center" style="padding:28px 0 8px 0;">
<table ${tableAttrs} align="center">
<tr>
<td align="center" bgcolor="${CTA_BG}" style="border-radius:14px;background-color:${CTA_BG};">
<a href="${safeUrl}" target="_blank" style="display:inline-block;padding:17px 36px;font-family:${FONT};font-size:16px;font-weight:600;line-height:22px;color:${CTA_TEXT};text-decoration:none;border-radius:14px;">Abrir processo no Portal COMEX</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:20px 12px 0 12px;font-family:${FONT};font-size:12px;line-height:18px;color:${FOOTER_TEXT};text-align:center;">
E-mail automático do Portal COMEX
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`

  return { subject, text, html, attachments }
}
