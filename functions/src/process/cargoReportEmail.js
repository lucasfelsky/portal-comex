// E-mail HTML do tipo `process_cargo_report_uploaded` (Relatorio de Carga) e, desde a S7, do tipo
// `process_cargo_report_conference` (`buildCargoReportConferenceEmail`: mesma estrutura, banner proprio).
//
// Layout IMAGEM + BOTAO: a arte (banner com logo, titulo, mensagem e cartao de
// documento) e' uma imagem pronta (`functions/assets/email/cargo-report-banner.jpg`)
// seguida do botao "Abrir processo no Portal COMEX" e de um rodape discreto.
// A mensagem exata (`CARGO_REPORT_NOTIFICATION_BODY`) vai no `alt` da imagem
// (clientes que bloqueiam imagem) e na versao texto puro; o processo vai no
// ASSUNTO e no texto puro.
//
// Modulo PURO: so' importa `node:url`, `./cargoReportNotification.js` e `./cargoConferenceCount.js` (tambem puro). Sem
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
import { parseCargoConferenceCountLines } from './cargoConferenceCount.js'
import {
  CARGO_REPORT_CONFERENCE_SUBJECT_PREFIX,
  CARGO_REPORT_NOTIFICATION_BODY,
  CARGO_REPORT_SUBJECT_PREFIX,
  extractCargoReportProcessLabel,
  sanitizeCargoReportText,
} from './cargoReportNotification.js'

export const CARGO_REPORT_EMAIL_BANNER_CID = 'cargo-report-banner@portal-comex'
export const CARGO_REPORT_EMAIL_BANNER_PATH = fileURLToPath(
  new URL('../../assets/email/cargo-report-banner.jpg', import.meta.url)
)

// S7: banner do e-mail "Conferencia da Logistica concluida" (arte propria, mesma entrega por CID).
export const CARGO_CONFERENCE_EMAIL_BANNER_CID = 'cargo-conference-banner@portal-comex'
export const CARGO_CONFERENCE_EMAIL_BANNER_PATH = fileURLToPath(
  new URL('../../assets/email/cargo-conference-banner.jpg', import.meta.url)
)
// Texto EXATO do corpo (L maiusculo, igual a arte): desenhado na imagem, no `alt`, na versao texto e no preheader.
export const CARGO_CONFERENCE_EMAIL_TEXT = 'Conferência da Logística concluída no Relatório de Carga.'

export const CTA_BG = '#008F76'
export const CTA_TEXT = '#FFFFFF'

const DEFAULT_APP_URL = 'https://portal-comex.com'
const FONT = 'Poppins, Arial, Helvetica, sans-serif'
const PAGE_BG = '#F4F7F7'
const FOOTER_TEXT = '#6b7b82'
// Fundo da celula da imagem da conferencia: com as imagens bloqueadas (Outlook) o `alt` aparece em branco sobre o navy.
const CONFERENCE_BANNER_BG = '#144155'
// S10-J2: cores da secao de avarias.
const DAMAGE_TITLE = '#144155'
const DAMAGE_TEXT = '#3d4f57'
const DAMAGE_BORDER = '#d6e0e3'
// Fatia D: pilula ambar da divergencia de unidades ("faltam 10", "2 a mais").
const COUNT_PILL_BG = '#FDF3DC'
const COUNT_PILL_TEXT = '#8A5A0A'

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

// S10-J2: secao "Avarias e ressalvas" (1 <tr> do container). A 1a linha (cabecalho) vira o titulo; as demais, uma por
// paragrafo, todas escapadas com `escapeEmailHtml`.
function buildDamageSectionHtml(lines, tableAttrs) {
  const [heading, ...rest] = lines
  const paragraphs = rest
    .map(
      (line) =>
        `<p style="margin:0 0 8px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${DAMAGE_TEXT};">${escapeEmailHtml(line)}</p>`
    )
    .join('\n')
  return `
<tr>
<td align="center" style="padding:16px 0 0 0;">
<table ${tableAttrs} width="600" class="sq-container" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid ${DAMAGE_BORDER};border-radius:14px;">
<tr>
<td align="left" style="padding:18px 22px 10px 22px;font-family:${FONT};font-size:16px;font-weight:600;line-height:22px;color:${DAMAGE_TITLE};">
Avarias e ressalvas
<div style="margin-top:4px;font-size:13px;font-weight:400;line-height:19px;color:${DAMAGE_TEXT};">${escapeEmailHtml(heading.replace(/^Avarias e ressalvas:\s*/, ''))}</div>
</td>
</tr>
<tr>
<td align="left" style="padding:0 22px 12px 22px;">
${paragraphs}
</td>
</tr>
</table>
</td>
</tr>`
}

// Fatia D: secao "Contagem" (1 <tr> do container, ANTES de "Avarias e ressalvas"), mesmo cartao das avarias. Os blocos
// vem de `parseCargoConferenceCountLines` (formato fixo das linhas do aviso): subtitulo = cabecalho sem "Contagem: ";
// sublista em maiusculas pequenas; parcial com "(N un.)" em negrito; lote divergente com contado/esperado em negrito e
// pilula ambar. Tudo escapado com `escapeEmailHtml`; linha fora do formato vira paragrafo simples (sem perder conteudo).
function buildCountSectionHtml(blocks, tableAttrs) {
  const paragraph = (html) =>
    `<p style="margin:0 0 8px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${DAMAGE_TEXT};">${html}</p>`
  const sublist = (text) =>
    `<p style="margin:6px 0 6px 0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.04em;line-height:18px;color:${DAMAGE_TITLE};text-transform:uppercase;">${escapeEmailHtml(text)}</p>`
  const pill = (text) =>
    ` <span style="display:inline-block;padding:1px 8px;border-radius:999px;background-color:${COUNT_PILL_BG};color:${COUNT_PILL_TEXT};font-family:${FONT};font-size:12px;font-weight:700;line-height:18px;white-space:nowrap;">${escapeEmailHtml(text)}</span>`

  let subtitle = ''
  const paragraphs = []
  for (const block of blocks) {
    if (block.kind === 'heading') {
      subtitle = block.text
    } else if (block.kind === 'label') {
      paragraphs.push(sublist(block.text))
    } else if (block.kind === 'partial') {
      const parts = block.parts.map((part) => `${escapeEmailHtml(part.label)} <b>(${part.units} un.)</b>`)
      paragraphs.push(paragraph(`• ${parts.join(' + ')}`))
    } else if (block.kind === 'divergent') {
      const counted = `<b>${block.counted}</b> ${block.counted === 1 ? 'contada' : 'contadas'}`
      const expected = `<b>${block.expected}</b> ${block.expected === 1 ? 'esperada' : 'esperadas'}`
      paragraphs.push(paragraph(`• ${escapeEmailHtml(block.label)}: ${counted} de ${expected}${pill(block.difference)}`))
    } else {
      paragraphs.push(paragraph(escapeEmailHtml(block.text)))
    }
  }
  const subtitleHtml = subtitle
    ? `\n<div style="margin-top:4px;font-size:13px;font-weight:400;line-height:19px;color:${DAMAGE_TEXT};">${escapeEmailHtml(subtitle)}</div>`
    : ''
  return `
<tr>
<td align="center" style="padding:16px 0 0 0;">
<table ${tableAttrs} width="600" class="sq-container" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid ${DAMAGE_BORDER};border-radius:14px;">
<tr>
<td align="left" style="padding:18px 22px 10px 22px;font-family:${FONT};font-size:16px;font-weight:600;line-height:22px;color:${DAMAGE_TITLE};">
Contagem${subtitleHtml}
</td>
</tr>
<tr>
<td align="left" style="padding:0 22px 12px 22px;">
${paragraphs.join('\n')}
</td>
</tr>
</table>
</td>
</tr>`
}

// S7: e-mail do fechamento da conferencia da logistica (`process_cargo_report_conference`). Mesma estrutura do
// e-mail do COMEX (container 600, banner por CID, botao, rodape); mudam a arte, o `alt`, o preheader e o texto puro.
// `subject` = assunto ja montado por `buildCargoReportConferenceSubject`.
// S10-J2: `damageLines` (linhas da secao "Avarias e ressalvas", de `buildCargoConferenceDamageLines`). Com linhas, entram
// uma tabela de 600 px entre o botao e o rodape e as linhas no texto puro, antes do link; SEM linhas, `html`, `text` e
// `attachments` saem IDENTICOS aos de antes (teste de igualdade). Cada linha e' escapada; fotos nao viajam no e-mail.
// Fatia D: `countLines` (linhas da secao "Contagem", de `buildCargoConferenceCountLines` ou do corpo da notificacao via
// `extractCargoConferenceCountLines`): entram ANTES das avarias (cartao proprio no HTML, com pilula ambar; linhas no
// texto puro). Sem linhas validas, nada muda (mesmo teste de igualdade).
export function buildCargoReportConferenceEmail({
  subject: rawSubject,
  processId,
  recipientName = '',
  appUrl = DEFAULT_APP_URL,
  bannerSrc,
  damageLines = [],
  countLines = [],
} = {}) {
  const subject = sanitizeCargoReportText(rawSubject) || CARGO_REPORT_CONFERENCE_SUBJECT_PREFIX
  const label = extractCargoReportProcessLabel(subject)
  const name = String(recipientName ?? '').trim()
  const url = buildCargoReportProcessUrl(processId, appUrl)
  const greeting = name ? `Olá, ${name}.` : 'Olá.'

  const damageList = (Array.isArray(damageLines) ? damageLines : [])
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean)
  const countList = (Array.isArray(countLines) ? countLines : [])
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean)

  const text = [
    greeting,
    '',
    CARGO_CONFERENCE_EMAIL_TEXT,
    '',
    ...(label ? [`Processo: ${label}`, ''] : []),
    ...(countList.length > 0 ? [...countList, ''] : []),
    ...(damageList.length > 0 ? [...damageList, ''] : []),
    'Abra o processo no Portal COMEX (aba Documentos):',
    url,
  ].join('\n')

  const useInlineSrc = typeof bannerSrc === 'string' && bannerSrc !== ''
  const imgSrc = useInlineSrc ? bannerSrc : `cid:${CARGO_CONFERENCE_EMAIL_BANNER_CID}`
  const attachments = useInlineSrc
    ? []
    : [
        {
          filename: 'cargo-conference-banner.jpg',
          path: CARGO_CONFERENCE_EMAIL_BANNER_PATH,
          cid: CARGO_CONFERENCE_EMAIL_BANNER_CID,
          contentType: 'image/jpeg',
          contentDisposition: 'inline',
        },
      ]

  const safeSubject = escapeEmailHtml(subject)
  const safePreheader = escapeEmailHtml(
    label
      ? `Conferência do Relatório de Carga do processo ${label} concluída no Portal COMEX.`
      : 'Conferência do Relatório de Carga concluída no Portal COMEX.'
  )
  const safeAlt = escapeEmailHtml(CARGO_CONFERENCE_EMAIL_TEXT)
  const safeUrl = escapeEmailHtml(url)
  const safeImgSrc = escapeEmailHtml(imgSrc)
  const tableAttrs = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'
  const damageSectionHtml = damageList.length > 0 ? buildDamageSectionHtml(damageList, tableAttrs) : ''
  const countSectionHtml =
    countList.length > 0 ? buildCountSectionHtml(parseCargoConferenceCountLines(countList), tableAttrs) : ''

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
<td align="center" bgcolor="${CONFERENCE_BANNER_BG}" style="padding:0;background-color:${CONFERENCE_BANNER_BG};border-radius:24px;">
<img src="${safeImgSrc}" width="600" alt="${safeAlt}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:24px;border:0;font-family:${FONT};font-size:24px;line-height:32px;font-weight:600;color:#FFFFFF;">
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
</tr>${countSectionHtml}${damageSectionHtml}
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
