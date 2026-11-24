// E-mail HTML do Relatorio de Carga (layout imagem + botao): modulo PURO
// (`functions/src/process/cargoReportEmail.js`, sem mocks).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  CARGO_CONFERENCE_EMAIL_BANNER_CID,
  CARGO_CONFERENCE_EMAIL_BANNER_PATH,
  CARGO_CONFERENCE_EMAIL_TEXT,
  CARGO_REPORT_EMAIL_BANNER_CID,
  CARGO_REPORT_EMAIL_BANNER_PATH,
  CTA_BG,
  CTA_TEXT,
  buildCargoReportConferenceEmail,
  buildCargoReportEmail,
  buildCargoReportProcessUrl,
  escapeEmailHtml,
} from '../../functions/src/process/cargoReportEmail.js'
import { CARGO_REPORT_NOTIFICATION_BODY } from '../../functions/src/process/cargoReportNotification.js'

const SUBJECT = 'Relatório de Carga - PO 123 - Resina Atlas'
const BASE = { subject: SUBJECT, processId: 'proc-1', recipientName: 'Maria' }

describe('buildCargoReportEmail', () => {
  it('assunto = o informado, SEM prefixo "[Portal COMEX]", e <title> igual ao assunto', () => {
    const { subject, html } = buildCargoReportEmail(BASE)
    expect(subject).toBe(SUBJECT)
    expect(subject).not.toContain('[Portal COMEX]')
    expect(html).toContain(`<title>${SUBJECT}</title>`)
  })

  it('assunto sem CR/LF (header injection) e com padrao quando vazio', () => {
    const { subject } = buildCargoReportEmail({ ...BASE, subject: 'Relatório de Carga - A\r\nBcc: x@evil.com' })
    expect(/[\r\n]/.test(subject)).toBe(false)
    expect(subject).toBe('Relatório de Carga - A Bcc: x@evil.com')
    expect(buildCargoReportEmail({ ...BASE, subject: '' }).subject).toBe('Relatório de Carga')
    expect(buildCargoReportEmail({ processId: 'p' }).text).not.toContain('Processo:')
  })

  it('imagem unica por CID: src igual ao cid do anexo e alt = mensagem exata', () => {
    const { html, attachments } = buildCargoReportEmail(BASE)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].cid).toBe(CARGO_REPORT_EMAIL_BANNER_CID)
    expect(attachments[0].contentType).toBe('image/jpeg')
    expect(attachments[0].contentDisposition).toBe('inline')
    expect(attachments[0].path).toBe(CARGO_REPORT_EMAIL_BANNER_PATH)
    expect(html).toContain(`src="cid:${attachments[0].cid}"`)
    expect(html).toContain(`alt="${CARGO_REPORT_NOTIFICATION_BODY}"`)
    expect(html.match(/<img /g)).toHaveLength(1)
    expect(html).toContain('width="600"')
    expect(html).toContain('display:block;width:100%;max-width:600px;height:auto;border-radius:24px;border:0')
  })

  it('banner existe em disco, e JPEG e a pasta de assets nao tem PNG', () => {
    expect(CARGO_REPORT_EMAIL_BANNER_PATH.endsWith('cargo-report-banner.jpg')).toBe(true)
    expect(existsSync(CARGO_REPORT_EMAIL_BANNER_PATH)).toBe(true)

    const jpeg = readFileSync(CARGO_REPORT_EMAIL_BANNER_PATH)
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)

    const files = readdirSync(dirname(CARGO_REPORT_EMAIL_BANNER_PATH))
    expect(files.filter((file) => file.endsWith('.png'))).toEqual([])
  })

  it('botao: href do deep link, cores e tipografia novas', () => {
    const { html } = buildCargoReportEmail(BASE)
    expect(CTA_BG).toBe('#008F76')
    expect(CTA_TEXT).toBe('#FFFFFF')
    expect(html).toContain('href="https://portal-comex.com/processos?processo=proc-1&amp;aba=documents"')
    expect(html).toContain('Abrir processo no Portal COMEX')
    expect(html).toContain(`bgcolor="${CTA_BG}"`)
    expect(html).toContain(`background-color:${CTA_BG}`)
    expect(html).toContain(`color:${CTA_TEXT}`)
    expect(html).toContain('padding:17px 36px')
    expect(html).toContain('font-size:16px')
    expect(html).toContain('font-weight:600')
    expect(html).toContain('border-radius:14px')
    expect(html).toContain('font-family:Poppins, Arial, Helvetica, sans-serif')
  })

  it('deep link: URL com id codificado e & escapado no href', () => {
    expect(buildCargoReportProcessUrl('a/b?c&d')).toBe(
      'https://portal-comex.com/processos?processo=a%2Fb%3Fc%26d&aba=documents'
    )
    expect(buildCargoReportProcessUrl('')).toBe('https://portal-comex.com/processos')

    const url = buildCargoReportProcessUrl('a/b?c&d')
    const { html } = buildCargoReportEmail({ ...BASE, processId: 'a/b?c&d' })
    expect(html).toContain(escapeEmailHtml(url))
    expect(html).toContain('&amp;aba=documents')
  })

  it('layout enxuto: sem cabecalho navy, bloco do processo, mensagem em texto, faixa verde nem link de texto', () => {
    const { html } = buildCargoReportEmail(BASE)
    expect(html).toContain('#F4F7F7')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('display:none')
    expect(html).toContain('#6b7b82')
    expect(html).toContain('E-mail automático do Portal COMEX')
    expect(html).not.toContain('#144155')
    expect(html).not.toContain('#E8F5F1')
    expect(html).not.toContain('Se o botão não funcionar')
    expect(html).not.toContain('DOCUMENTOS DO PROCESSO')
    // a mensagem so aparece no alt (1 ocorrencia), nunca como paragrafo.
    expect(html.split(CARGO_REPORT_NOTIFICATION_BODY)).toHaveLength(2)
    // a URL aparece so no href do botao (sem link de texto abaixo).
    expect(html.match(/href="/g)).toHaveLength(1)
  })

  it('sem referencias a PNG/logo antiga, svg, script, filtro nem emoji', () => {
    const { html, text, attachments } = buildCargoReportEmail(BASE)
    expect(html).not.toContain('sq-quimica')
    expect(html).not.toContain('.png')
    expect(JSON.stringify(attachments)).not.toContain('sq-quimica')
    expect(JSON.stringify(attachments)).not.toContain('.png')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('filter:')
    expect(/\p{Extended_Pictographic}/u.test(html)).toBe(false)
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)
  })

  it('escapa rotulo no html (preheader/titulo) e nao permite injecao', () => {
    const { html } = buildCargoReportEmail({
      subject: 'Relatório de Carga - <script>alert("x")</script> O\'Neil & Cia',
      processId: 'p',
      recipientName: `O'Neil "Q" & Cia`,
    })
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;')
    expect(html).toContain('&#39;')
    expect(html).toContain('&amp; Cia')
    expect(escapeEmailHtml(null)).toBe('')
    expect(escapeEmailHtml(undefined)).toBe('')
  })

  it('bannerSrc (preview): sem anexos e <img> usa o src informado', () => {
    const { attachments, html } = buildCargoReportEmail({ ...BASE, bannerSrc: 'data:image/jpeg;base64,AAA' })
    expect(attachments).toEqual([])
    expect(html).toContain('src="data:image/jpeg;base64,AAA"')
    expect(html).not.toContain('cid:')
  })

  it('text: saudacao, mensagem exata, rotulo do processo e URL crua (sem &amp;)', () => {
    const withName = buildCargoReportEmail(BASE).text
    expect(withName.startsWith('Olá, Maria.')).toBe(true)
    expect(withName).toContain(CARGO_REPORT_NOTIFICATION_BODY)
    expect(withName).toContain('Processo: PO 123 - Resina Atlas')
    expect(withName).toContain('https://portal-comex.com/processos?processo=proc-1&aba=documents')
    expect(withName).not.toContain('&amp;')

    const withoutName = buildCargoReportEmail({ ...BASE, recipientName: '' }).text
    expect(withoutName.startsWith('Olá.')).toBe(true)
  })
})

// S7: e-mail da conferência da logística (banner próprio, mesma estrutura do e-mail do COMEX).
describe('buildCargoReportConferenceEmail (S7)', () => {
  const CONFERENCE_SUBJECT = 'Conferência do Relatório de Carga - PO 123 - Resina Atlas'
  const CONF = { subject: CONFERENCE_SUBJECT, processId: 'proc-1', recipientName: 'Maria' }
  const ALT = 'Conferência da Logística concluída no Relatório de Carga.'

  it('texto do corpo e constantes EXATOS (L maiúsculo, igual à arte)', () => {
    expect(CARGO_CONFERENCE_EMAIL_TEXT).toBe(ALT)
    expect(CARGO_CONFERENCE_EMAIL_BANNER_CID).toBe('cargo-conference-banner@portal-comex')
    expect(CARGO_CONFERENCE_EMAIL_BANNER_PATH.endsWith('cargo-conference-banner.jpg')).toBe(true)
  })

  it('assunto sanitizado (sem CR/LF), sem "[Portal COMEX]" e <title> igual ao assunto', () => {
    const { subject, html } = buildCargoReportConferenceEmail(CONF)
    expect(subject).toBe(CONFERENCE_SUBJECT)
    expect(subject).not.toContain('[Portal COMEX]')
    expect(html).toContain(`<title>${CONFERENCE_SUBJECT}</title>`)

    const injected = buildCargoReportConferenceEmail({ ...CONF, subject: 'Conferência do Relatório de Carga - A\r\nBcc: x@evil.com' })
    expect(/[\r\n]/.test(injected.subject)).toBe(false)
    expect(injected.subject).toBe('Conferência do Relatório de Carga - A Bcc: x@evil.com')
    expect(buildCargoReportConferenceEmail({ ...CONF, subject: '' }).subject).toBe('Conferência do Relatório de Carga')
  })

  it('1 anexo inline por CID (image/jpeg, inline, path do arquivo) e src igual ao cid; alt exato; uma só imagem', () => {
    const { html, attachments } = buildCargoReportConferenceEmail(CONF)
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toEqual({
      filename: 'cargo-conference-banner.jpg',
      path: CARGO_CONFERENCE_EMAIL_BANNER_PATH,
      cid: CARGO_CONFERENCE_EMAIL_BANNER_CID,
      contentType: 'image/jpeg',
      contentDisposition: 'inline',
    })
    expect(html).toContain(`src="cid:${attachments[0].cid}"`)
    expect(html).toContain(`alt="${ALT}"`)
    expect(html.match(/<img /g)).toHaveLength(1)
    expect(html).toContain('width="600"')
    expect(html).not.toContain(`cid:${CARGO_REPORT_EMAIL_BANNER_CID}`)
  })

  it('fundo navy na célula da imagem e estilo no alt: a frase fica branca e legível com as imagens bloqueadas', () => {
    const { html } = buildCargoReportConferenceEmail(CONF)
    expect(html).toContain('bgcolor="#144155" style="padding:0;background-color:#144155;border-radius:24px;"')
    expect(html).toContain(
      'display:block;width:100%;max-width:600px;height:auto;border-radius:24px;border:0;font-family:Poppins, Arial, Helvetica, sans-serif;font-size:24px;line-height:32px;font-weight:600;color:#FFFFFF;'
    )
  })

  it('o arquivo existe, é JPEG (FF D8 FF), 1200 x 800, e a pasta de assets continua sem PNG', () => {
    expect(existsSync(CARGO_CONFERENCE_EMAIL_BANNER_PATH)).toBe(true)
    const jpeg = readFileSync(CARGO_CONFERENCE_EMAIL_BANNER_PATH)
    expect([jpeg[0], jpeg[1], jpeg[2]]).toEqual([0xff, 0xd8, 0xff])

    // SOF0/SOF2: [marcador][len 2][precisão 1][altura 2][largura 2]
    let offset = 2
    let size = null
    while (offset < jpeg.length) {
      if (jpeg[offset] !== 0xff) break
      const marker = jpeg[offset + 1]
      const length = jpeg.readUInt16BE(offset + 2)
      if (marker === 0xc0 || marker === 0xc2) {
        size = { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) }
        break
      }
      offset += 2 + length
    }
    expect(size).toEqual({ width: 1200, height: 800 })

    const files = readdirSync(dirname(CARGO_CONFERENCE_EMAIL_BANNER_PATH))
    expect(files.filter((file) => file.endsWith('.png'))).toEqual([])
    expect(files).toEqual(expect.arrayContaining(['cargo-report-banner.jpg', 'cargo-conference-banner.jpg']))
  })

  it('o corpo é só a arte e o botão: a frase aparece 1 vez (alt) e nada de "sq-quimica", .png ou SVG', () => {
    const { html, attachments } = buildCargoReportConferenceEmail(CONF)
    expect(html.split(ALT)).toHaveLength(2)
    expect(html).not.toContain('Etiquetas, contagem')
    expect(html).not.toContain('sq-quimica')
    expect(html).not.toContain('.png')
    expect(JSON.stringify(attachments)).not.toContain('.png')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<script')
  })

  it('botão com o deep link escapado, rodapé e preheader com o rótulo do processo', () => {
    const { html } = buildCargoReportConferenceEmail({ ...CONF, processId: 'a/b?c&d' })
    expect(html).toContain(`href="${escapeEmailHtml(buildCargoReportProcessUrl('a/b?c&d'))}"`)
    expect(html).toContain('Abrir processo no Portal COMEX')
    expect(html).toContain(`bgcolor="${CTA_BG}"`)
    expect(html).toContain('E-mail automático do Portal COMEX')
    expect(html).toContain('Conferência do Relatório de Carga do processo PO 123 - Resina Atlas concluída no Portal COMEX.')
    expect(html.match(/href="/g)).toHaveLength(1)
  })

  it('nome do processo e do destinatário com HTML saem escapados', () => {
    const { html } = buildCargoReportConferenceEmail({
      subject: 'Conferência do Relatório de Carga - <script>alert("x")</script> O\'Neil & Cia',
      processId: 'p',
      recipientName: 'x',
    })
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&#39;')
    expect(html).toContain('&amp; Cia')
  })

  it('texto puro: saudação, texto exato, Processo e URL crua', () => {
    const { text } = buildCargoReportConferenceEmail(CONF)
    expect(text).toBe(
      [
        'Olá, Maria.',
        '',
        ALT,
        '',
        'Processo: PO 123 - Resina Atlas',
        '',
        'Abra o processo no Portal COMEX (aba Documentos):',
        'https://portal-comex.com/processos?processo=proc-1&aba=documents',
      ].join('\n')
    )
    expect(buildCargoReportConferenceEmail({ processId: 'p' }).text).not.toContain('Processo:')
    expect(buildCargoReportConferenceEmail({ processId: 'p' }).text.startsWith('Olá.')).toBe(true)
  })

  it('bannerSrc (preview): sem anexos e <img> usa o src informado', () => {
    const { attachments, html } = buildCargoReportConferenceEmail({ ...CONF, bannerSrc: 'data:image/jpeg;base64,AAA' })
    expect(attachments).toEqual([])
    expect(html).toContain('src="data:image/jpeg;base64,AAA"')
    expect(html).not.toContain('cid:')
  })

  it('o e-mail do COMEX segue sem mudança (banner antigo, sem fundo navy)', () => {
    const { html, attachments } = buildCargoReportEmail(BASE)
    expect(attachments[0].cid).toBe(CARGO_REPORT_EMAIL_BANNER_CID)
    expect(html).not.toContain('#144155')
  })
})
