// E-mail HTML do Relatorio de Carga (layout imagem + botao): modulo PURO
// (`functions/src/process/cargoReportEmail.js`, sem mocks).

import { createHash } from 'node:crypto'
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

// S10-J2: seção "Avarias e ressalvas" do e-mail da conferência. Sem linhas, o e-mail sai IDÊNTICO ao de antes da J2.
describe('buildCargoReportConferenceEmail: avarias (S10-J2)', () => {
  const CONFERENCE_SUBJECT = 'Conferência do Relatório de Carga - PO 123 - Resina Atlas'
  const CONF = { subject: CONFERENCE_SUBJECT, processId: 'proc-1', recipientName: 'Maria' }
  const LINES = [
    'Avarias e ressalvas: 2 itens, 3 fotos no Portal.',
    'Pallets: 23 contados de 25 informados pelo COMEX (divergente).',
    '• Item 1 · POLIOL PE-3000 · 2 fotos: Caixas molhadas no pallet 2.',
    '• Item 2 · ISOCIANATO MDI · 1 foto: Lacre rompido.',
  ]
  const sha = (value) => createHash('sha256').update(value).digest('hex')
  const withoutPath = (attachments) =>
    attachments.map((attachment) => {
      const copy = { ...attachment }
      delete copy.path
      return copy
    })

  // sha256 do `html` e do `text` gerados pela implementação de `origin/main` (181e4cb, antes da J2) para as mesmas entradas.
  const GOLDEN = {
    cid: {
      input: CONF,
      html: '2505dc7cc99a2aa28ea0dd0cbbd1b0c1e49e80d2d593b6a57dea40a8c7f8528e',
      text: '3c16988ee0775834301e3732cfb3a2695667656b5fc6bbbaeb218fe8e45dbcd0',
    },
    inline: {
      input: { ...CONF, bannerSrc: 'data:image/jpeg;base64,AAA' },
      html: 'beebde1dff57b81ff94bec5fabdeb787073b281a537de32d989df2697a9ea18e',
      text: '3c16988ee0775834301e3732cfb3a2695667656b5fc6bbbaeb218fe8e45dbcd0',
    },
    anon: {
      input: { processId: 'p' },
      html: '396ce327f685a7a1b523057680b213b748757874d355f90e6e3c0c3fe4e0d65d',
      text: '47c5f07d6633c1a5b83f28832333c493c0f38447d5f1cdc84ef2c603465a226f',
    },
  }

  it.each(Object.entries(GOLDEN))('sem linhas, html e text são byte a byte os de antes da J2 (%s)', (_name, golden) => {
    for (const extra of [{}, { damageLines: [] }, { damageLines: undefined }, { damageLines: ['', '   '] }, { damageLines: null }]) {
      const result = buildCargoReportConferenceEmail({ ...golden.input, ...extra })
      expect(sha(result.html)).toBe(golden.html)
      expect(sha(result.text)).toBe(golden.text)
    }
  })

  it('sem linhas, a chamada com damageLines vazio é igual à chamada sem o parâmetro (html, text, attachments e assunto)', () => {
    const plain = buildCargoReportConferenceEmail(CONF)
    const empty = buildCargoReportConferenceEmail({ ...CONF, damageLines: [] })
    expect(empty.html).toBe(plain.html)
    expect(empty.text).toBe(plain.text)
    expect(empty.attachments).toEqual(plain.attachments)
    expect(empty.subject).toBe(plain.subject)
    expect(plain.html).not.toContain('Avarias e ressalvas')
    expect(plain.attachments).toHaveLength(1)
    expect(withoutPath(plain.attachments)).toEqual([
      {
        filename: 'cargo-conference-banner.jpg',
        cid: 'cargo-conference-banner@portal-comex',
        contentType: 'image/jpeg',
        contentDisposition: 'inline',
      },
    ])
  })

  it('com linhas: seção entre o botão e o rodapé, título, cada linha em um parágrafo', () => {
    const { html } = buildCargoReportConferenceEmail({ ...CONF, damageLines: LINES })
    const button = html.indexOf('Abrir processo no Portal COMEX</a>')
    const section = html.indexOf('Avarias e ressalvas')
    const footer = html.indexOf('E-mail automático do Portal COMEX')
    expect(button).toBeGreaterThan(-1)
    expect(section).toBeGreaterThan(button)
    expect(footer).toBeGreaterThan(section)
    expect(html).toContain('2 itens, 3 fotos no Portal.')
    expect(html).toContain('Pallets: 23 contados de 25 informados pelo COMEX (divergente).')
    expect(html).toContain('• Item 1 · POLIOL PE-3000 · 2 fotos: Caixas molhadas no pallet 2.')
    expect(html).toContain('• Item 2 · ISOCIANATO MDI · 1 foto: Lacre rompido.')
    expect(html).toContain('width="600" class="sq-container"')
    expect(html.match(/<p style=/g)).toHaveLength(3)
  })

  it('com linhas: assunto, banner, anexos, botão, link e preheader iguais aos de hoje', () => {
    const plain = buildCargoReportConferenceEmail(CONF)
    const withDamage = buildCargoReportConferenceEmail({ ...CONF, damageLines: LINES })
    expect(withDamage.subject).toBe(plain.subject)
    expect(withDamage.attachments).toEqual(plain.attachments)
    expect(withDamage.html).toContain('cid:cargo-conference-banner@portal-comex')
    expect(withDamage.html).toContain('processo=proc-1&amp;aba=documents')
    expect(withDamage.html).toContain('<title>Conferência do Relatório de Carga - PO 123 - Resina Atlas</title>')
    const preheader = (html) => html.match(/color:#F4F7F7;">([^<]*)<\/div>/)[1]
    expect(preheader(withDamage.html)).toBe(preheader(plain.html))
    // tudo que não é a seção é igual: tirando a seção, o HTML é o de hoje
    const stripped = withDamage.html.replace(/\n<tr>\n<td align="center" style="padding:16px 0 0 0;">[\s\S]*?<\/table>\n<\/td>\n<\/tr>(?=\n<tr>\n<td align="center" style="padding:20px)/, '')
    expect(stripped).toBe(plain.html)
  })

  it('com linhas: texto puro leva as linhas antes do link', () => {
    const { text } = buildCargoReportConferenceEmail({ ...CONF, damageLines: LINES })
    const lines = text.split('\n')
    expect(lines.slice(lines.indexOf(LINES[0]), lines.indexOf(LINES[0]) + LINES.length)).toEqual(LINES)
    expect(text.indexOf(LINES[0])).toBeLessThan(text.indexOf('Abra o processo no Portal COMEX'))
    expect(text.indexOf('Processo: PO 123 - Resina Atlas')).toBeLessThan(text.indexOf(LINES[0]))
    expect(text).toContain('https://portal-comex.com/processos?processo=proc-1&aba=documents')
  })

  it('escapa HTML de cada linha (observação com <script>, aspas e &)', () => {
    const evil = [
      'Avarias e ressalvas: 1 item.',
      '• Item 1 · <img src=x onerror=alert(1)> · 1 foto: <script>alert("x")</script> & \'aspas\'',
    ]
    const { html, text } = buildCargoReportConferenceEmail({ ...CONF, damageLines: evil })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;aspas&#39;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    // o texto puro não é HTML: a linha segue como veio
    expect(text).toContain('<script>alert("x")</script>')
  })

  it('o e-mail do COMEX ignora damageLines (estágio COMEX intacto)', () => {
    const plain = buildCargoReportEmail(BASE)
    const withLines = buildCargoReportEmail({ ...BASE, damageLines: LINES })
    expect(withLines.html).toBe(plain.html)
    expect(withLines.text).toBe(plain.text)
  })
})
