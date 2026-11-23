// E-mail HTML do Relatorio de Carga (layout imagem + botao): modulo PURO
// (`functions/src/process/cargoReportEmail.js`, sem mocks).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  CARGO_REPORT_EMAIL_BANNER_CID,
  CARGO_REPORT_EMAIL_BANNER_PATH,
  CTA_BG,
  CTA_TEXT,
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
