// Fatia D: seção "Contagem" no e-mail da conferência (`buildCargoReportConferenceEmail`, módulo PURO, sem mocks):
// cenários a-e do mock aprovado v2 (HTML, texto puro, assunto, preheader, anexos), golden do e-mail de hoje e do "só
// avaria", igualdade entre o caminho direto e o caminho via corpo da notificação, escape e pílula. Dados inventados.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  buildCargoConferenceDamageText,
  buildCargoConferenceNoticeSections,
  extractCargoConferenceDamageLines,
} from '../../functions/src/process/cargoConferenceDamage.js'
import { extractCargoConferenceCountLines } from '../../functions/src/process/cargoConferenceCount.js'
import { buildCargoReportConferenceEmail } from '../../functions/src/process/cargoReportEmail.js'
import {
  CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY,
  buildCargoReportConferenceSubject,
} from '../../functions/src/process/cargoReportNotification.js'

const sha = (value) => createHash('sha256').update(value).digest('hex')
const withoutPath = (attachments) =>
  attachments.map((attachment) => {
    const copy = { ...attachment }
    delete copy.path
    return copy
  })

// ---------- fixtures (mesmos cenários do mock v2) ----------

const row = (id, sqDescription, supplierLot, frozenPackages) => ({
  id,
  po: '4501',
  dbcorpCode: '1001',
  supplierDescription: '',
  sqDescription,
  supplierLot,
  quantityKg: 1000,
  frozenNetWeightKg: null,
  frozenPackages,
})
const ROWS = [
  row('r-1', 'Catalisador ZN-12', 'Z-9910', 160),
  row('r-2', 'Poliol Flex 3000', 'L-2240', 50),
  row('r-3', 'Poliol Flex 3000', 'L-2232', 100),
  row('r-4', 'Resina Acrílica RA-55', 'A-1180', 80),
  row('r-5', 'Catalisador ZN-12', 'Z-9911', 60),
  row('r-6', 'Aditivo AX-7', 'X-0041', 40),
]
const MATCHING = { 'r-1': 160, 'r-2': 50, 'r-3': 100, 'r-4': 80, 'r-5': 60, 'r-6': 40 }
const DIVERGENT = { ...MATCHING, 'r-1': 150, 'r-2': 52 }
const P1 = { id: 'pp-1', parts: [{ rowId: 'r-3', units: 30 }, { rowId: 'r-4', units: 20 }] }
const P2 = { id: 'pp-2', parts: [{ rowId: 'r-5', units: 25 }, { rowId: 'r-6', units: 10 }] }
const PALLETS_20 = { 'r-1': 4, 'r-2': 4, 'r-3': 3, 'r-4': 3, 'r-5': 3, 'r-6': 3 }
const PALLETS_22 = { 'r-1': 4, 'r-2': 4, 'r-3': 4, 'r-4': 4, 'r-5': 3, 'r-6': 3 }
const DAMAGE = {
  'r-5': {
    flagged: true,
    note: '2 sacos rasgados na lateral do pallet, produto exposto.',
    photos: ['f1', 'f2'].map((id) => ({ id, path: 'x', thumbPath: 'y', width: 1600, height: 1200 })),
  },
}
const CURRENT = { rows: ROWS, expectedPallets: 22 }

const E_NAMES = [['Poliol Flex 3000', 'L-2240'], ['Catalisador ZN-12', 'Z-9910'], ['Resina Acrílica RA-55', 'A-1180'], ['Aditivo AX-7', 'X-0041']]
const E_ROWS = Array.from({ length: 14 }, (_, i) => {
  const [name, lot] = E_NAMES[i % 4]
  const counted = (i % 3 === 0 ? 150 : i % 3 === 1 ? 52 : 97) + i
  const expected = (i % 3 === 0 ? 160 : i % 3 === 1 ? 50 : 100) + i
  return { counted, row: row(`e-${i}`, name, lot.replace(/\d+$/, (m) => String(Number(m) + Math.floor(i / 4))), expected) }
})

const SCENARIOS = {
  a: { conference: { unitsByRowId: MATCHING, palletsByRowId: PALLETS_22 }, current: CURRENT },
  b: { conference: { unitsByRowId: MATCHING, palletsByRowId: PALLETS_20, partialPallets: [P1, P2] }, current: CURRENT },
  c: { conference: { unitsByRowId: DIVERGENT, palletsByRowId: PALLETS_22 }, current: CURRENT },
  d: {
    conference: { unitsByRowId: DIVERGENT, palletsByRowId: PALLETS_20, partialPallets: [P1, P2], damageByRowId: DAMAGE },
    current: CURRENT,
  },
  e: {
    conference: {
      unitsByRowId: { ...Object.fromEntries(E_ROWS.map((item) => [item.row.id, item.counted])), 'r-3': 100, 'r-4': 80 },
      palletsByRowId: { ...Object.fromEntries(E_ROWS.map((item) => [item.row.id, 1])), 'r-3': 4, 'r-4': 3 },
      partialPallets: [P1],
    },
    current: { rows: [...E_ROWS.map((item) => item.row), ROWS[2], ROWS[3]], expectedPallets: 22 },
  },
}

const PROCESS = { category: 'FCL', processNumber: '9036', name: 'DEMO SEA 001-26' }
const LABEL = 'PO 9036 - DEMO SEA 001-26'
const URL = 'https://portal-comex.com/processos?processo=AbC123xYz&aba=documents'
const PREHEADER = `Conferência do Relatório de Carga do processo ${LABEL} concluída no Portal COMEX.`
const SUFFIX = ' (com divergências)'

function sectionsOf(key) {
  return buildCargoConferenceNoticeSections(SCENARIOS[key].conference, SCENARIOS[key].current)
}

// Caminho direto (e-mail da lista, sem usuário): linhas da função de seções.
function buildDirect(key, extra = {}) {
  const sections = sectionsOf(key)
  return buildCargoReportConferenceEmail({
    subject: buildCargoReportConferenceSubject(PROCESS, { divergent: sections.divergent }),
    processId: 'AbC123xYz',
    recipientName: 'Ana Souza',
    countLines: sections.countLines,
    damageLines: sections.damageLines,
    ...extra,
  })
}

// Caminho via corpo (e-mail dos usuários do Portal): corpo montado como em `documents.js`, lido com os extratores.
function buildViaBody(key, extra = {}) {
  const sections = sectionsOf(key)
  const sectionsText = [buildCargoConferenceDamageText(sections.countLines), buildCargoConferenceDamageText(sections.damageLines)]
    .filter(Boolean)
    .join('\n\n')
  const body = `${CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY}${sectionsText ? `\n\n${sectionsText}` : ''}`
  return buildCargoReportConferenceEmail({
    subject: buildCargoReportConferenceSubject(PROCESS, { divergent: sections.divergent }),
    processId: 'AbC123xYz',
    recipientName: 'Ana Souza',
    damageLines: extractCargoConferenceDamageLines(body),
    countLines: extractCargoConferenceCountLines(body),
    ...extra,
  })
}

const PILL_STYLE =
  'display:inline-block;padding:1px 8px;border-radius:999px;background-color:#FDF3DC;color:#8A5A0A;font-family:Poppins, Arial, Helvetica, sans-serif;font-size:12px;font-weight:700;line-height:18px;white-space:nowrap;'
const pill = (text) => ` <span style="${PILL_STYLE}">${text}</span>`

// ---------- golden: o e-mail de hoje não muda ----------

describe('buildCargoReportConferenceEmail: sem Contagem o e-mail é o de hoje', () => {
  const CONFERENCE_SUBJECT = 'Conferência do Relatório de Carga - PO 123 - Resina Atlas'
  const CONF = { subject: CONFERENCE_SUBJECT, processId: 'proc-1', recipientName: 'Maria' }
  // sha256 do `html` e do `text` de `origin/main` (181e4cb, antes da J2), os mesmos de `cargoReportEmail.test.js`.
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

  it.each(Object.entries(GOLDEN))('countLines vazio/ausente/inválido: html e text byte a byte os de hoje (%s)', (_name, golden) => {
    for (const extra of [{}, { countLines: [] }, { countLines: undefined }, { countLines: null }, { countLines: ['', '  '] }, { countLines: 'x' }]) {
      const result = buildCargoReportConferenceEmail({ ...golden.input, ...extra })
      expect(sha(result.html)).toBe(golden.html)
      expect(sha(result.text)).toBe(golden.text)
    }
  })

  // sha256 gerado em `origin/main` c6adfa8 (ANTES da Fatia D) com as 4 linhas de avaria de `cargoReportEmail.test.js`.
  const DAMAGE_LINES = [
    'Avarias e ressalvas: 2 itens, 3 fotos no Portal.',
    'Pallets: 23 contados de 25 informados pelo COMEX (divergente).',
    '• Item 1 · POLIOL PE-3000 · 2 fotos: Caixas molhadas no pallet 2.',
    '• Item 2 · ISOCIANATO MDI · 1 foto: Lacre rompido.',
  ]
  const DAMAGE_GOLDEN = {
    cid: {
      input: { ...CONF, damageLines: DAMAGE_LINES },
      html: '630e36042870905d0372bf801d1fdc5edd826058ca707f0091e087615ebbf7cb',
      text: 'b6d76dd188fb381aff5f8c1934bbcbebebe6dc3b428154b77806180f19ebda90',
    },
    inline: {
      input: { ...CONF, damageLines: DAMAGE_LINES, bannerSrc: 'data:image/jpeg;base64,AAA' },
      html: '6ecd459decd2effbf9fef43478bbd09ca6461fa21c8236ffefe333c18a163f82',
      text: 'b6d76dd188fb381aff5f8c1934bbcbebebe6dc3b428154b77806180f19ebda90',
    },
  }

  it.each(Object.entries(DAMAGE_GOLDEN))('só avaria (sem Contagem): html e text byte a byte os de antes da Fatia D (%s)', (_name, golden) => {
    for (const extra of [{}, { countLines: [] }, { countLines: undefined }, { countLines: null }]) {
      const result = buildCargoReportConferenceEmail({ ...golden.input, ...extra })
      expect(sha(result.html)).toBe(golden.html)
      expect(sha(result.text)).toBe(golden.text)
    }
  })

  it('cenário a (nada): html, texto, assunto e anexos idênticos ao de hoje', () => {
    const sections = sectionsOf('a')
    expect(sections.countLines).toEqual([])
    expect(sections.damageLines).toEqual([])
    const today = buildCargoReportConferenceEmail({
      subject: buildCargoReportConferenceSubject(PROCESS),
      processId: 'AbC123xYz',
      recipientName: 'Ana Souza',
    })
    for (const result of [buildDirect('a'), buildViaBody('a')]) {
      expect(result.html).toBe(today.html)
      expect(result.text).toBe(today.text)
      expect(result.subject).toBe(today.subject)
      expect(result.subject).toBe(`Conferência do Relatório de Carga - ${LABEL}`)
      expect(withoutPath(result.attachments)).toEqual(withoutPath(today.attachments))
    }
  })
})

// ---------- cenários b-e ----------

describe('buildCargoReportConferenceEmail: seção Contagem (cenários do mock v2)', () => {
  it('cenário d: texto puro exato (Contagem antes de Avarias, "Processo:" sem sufixo)', () => {
    const expected = [
      'Olá, Ana Souza.',
      '',
      'Conferência da Logística concluída no Relatório de Carga.',
      '',
      `Processo: ${LABEL}`,
      '',
      'Contagem: 2 pallets parciais, 2 lotes com unidades divergentes.',
      'Pallets parciais:',
      '• Poliol Flex 3000 · Lote L-2232 (30 un.) + Resina Acrílica RA-55 · Lote A-1180 (20 un.)',
      '• Catalisador ZN-12 · Lote Z-9911 (25 un.) + Aditivo AX-7 · Lote X-0041 (10 un.)',
      'Unidades divergentes:',
      '• Catalisador ZN-12 · Lote Z-9910: 150 contadas de 160 esperadas (faltam 10).',
      '• Poliol Flex 3000 · Lote L-2240: 52 contadas de 50 esperadas (2 a mais).',
      '',
      'Avarias e ressalvas: 1 item, 2 fotos no Portal.',
      'Pallets: 22 contados de 22 informados pelo COMEX (confere), inclui 2 parciais.',
      '• Item 5 · Catalisador ZN-12 · 2 fotos: 2 sacos rasgados na lateral do pallet, produto exposto.',
      '',
      'Abra o processo no Portal COMEX (aba Documentos):',
      URL,
    ].join('\n')
    expect(buildDirect('d').text).toBe(expected)
  })

  it('cenário b: só parciais, assunto SEM sufixo, sem pílula nem sublista de unidades', () => {
    const { subject, html, text } = buildDirect('b')
    expect(subject).toBe(`Conferência do Relatório de Carga - ${LABEL}`)
    expect(text).toContain(
      [
        'Contagem: 2 pallets parciais.',
        'Pallets: 22 contados de 22 informados pelo COMEX (confere), inclui 2 parciais.',
        'Pallets parciais:',
      ].join('\n')
    )
    expect(html).toContain('Pallets parciais')
    expect(html).not.toContain('Unidades divergentes')
    expect(html).not.toContain('border-radius:999px')
    expect(html).not.toContain('Avarias e ressalvas')
  })

  it('cenário c: só divergência, assunto COM sufixo no assunto e no <title>', () => {
    const { subject, html, text } = buildDirect('c')
    expect(subject).toBe(`Conferência do Relatório de Carga - ${LABEL}${SUFFIX}`)
    expect(html).toContain(`<title>Conferência do Relatório de Carga - ${LABEL}${SUFFIX}</title>`)
    expect(text).toContain('Pallets: 22 contados de 22 informados pelo COMEX (confere).\nUnidades divergentes:')
    expect(html).not.toContain('Pallets parciais')
  })

  it('cenários c, d e e: "Processo:" e preheader SEM o sufixo', () => {
    for (const key of ['c', 'd', 'e']) {
      for (const result of [buildDirect(key), buildViaBody(key)]) {
        expect(result.subject.endsWith(SUFFIX)).toBe(true)
        expect(result.text).toContain(`Processo: ${LABEL}\n`)
        expect(result.text).not.toContain(`Processo: ${LABEL}${SUFFIX}`)
        expect(result.html).toContain(`>${PREHEADER}</div>`)
        expect(result.html).toContain(`<title>${result.subject}</title>`)
        expect(result.html.split('(com divergências)')).toHaveLength(2) // só no <title>
      }
    }
  })

  it('cenário d: ordem botão < Contagem < Avarias < rodapé e contado/esperado em negrito com a pílula âmbar', () => {
    const { html } = buildDirect('d')
    const positions = ['Abrir processo no Portal COMEX</a>', '\nContagem', '\nAvarias e ressalvas', 'E-mail automático do Portal COMEX'].map((marker) => html.indexOf(marker))
    expect(positions.every((position) => position > 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(html).toContain(`• Catalisador ZN-12 · Lote Z-9910: <b>150</b> contadas de <b>160</b> esperadas${pill('faltam 10')}</p>`)
    expect(html).toContain(`• Poliol Flex 3000 · Lote L-2240: <b>52</b> contadas de <b>50</b> esperadas${pill('2 a mais')}</p>`)
    expect(html).toContain('• Poliol Flex 3000 · Lote L-2232 <b>(30 un.)</b> + Resina Acrílica RA-55 · Lote A-1180 <b>(20 un.)</b></p>')
    expect(html).toContain('• Catalisador ZN-12 · Lote Z-9911 <b>(25 un.)</b> + Aditivo AX-7 · Lote X-0041 <b>(10 un.)</b></p>')
    expect(html).toContain('>2 pallets parciais, 2 lotes com unidades divergentes.</div>')
    // sublistas: 12 px, 700, espaçamento .04em, maiúsculas, cor #144155, sem os dois-pontos
    expect(html).toContain(
      '<p style="margin:6px 0 6px 0;font-family:Poppins, Arial, Helvetica, sans-serif;font-size:12px;font-weight:700;letter-spacing:.04em;line-height:18px;color:#144155;text-transform:uppercase;">Pallets parciais</p>'
    )
    expect(html).toContain('>Unidades divergentes</p>')
    expect(html).not.toContain('Pallets parciais:')
    // a linha de pallets fica só em Avarias (uma vez)
    expect(html.split('contados de 22 informados').length).toBe(2)
    expect(html).toContain('(confere), inclui 2 parciais.')
  })

  it('cenário e (14 lotes + 1 parcial): 10 pílulas, "+ 4 lotes no Portal." e 1 pallet parcial; assunto com sufixo', () => {
    const { html, text, subject } = buildDirect('e')
    expect(subject.endsWith(SUFFIX)).toBe(true)
    expect(html.split('border-radius:999px').length - 1).toBe(10)
    expect(html).toContain('+ 4 lotes no Portal.')
    expect(html).toContain('>1 pallet parcial, 14 lotes com unidades divergentes.</div>')
    expect(text).toContain('+ 4 lotes no Portal.')
    expect(html).toContain(pill('faltam 3'))
  })

  it('singular: "1 contada de 2 esperadas" com pílula "falta 1" e "1 a mais"', () => {
    const lines = ['Contagem: 2 lotes com unidades divergentes.', 'Unidades divergentes:', '• A · Lote 1: 1 contada de 2 esperadas (falta 1).', '• B · Lote 2: 2 contadas de 1 esperada (1 a mais).']
    const { html } = buildCargoReportConferenceEmail({ subject: 'Conferência do Relatório de Carga', processId: 'p', countLines: lines })
    expect(html).toContain(`• A · Lote 1: <b>1</b> contada de <b>2</b> esperadas${pill('falta 1')}</p>`)
    expect(html).toContain(`• B · Lote 2: <b>2</b> contadas de <b>1</b> esperada${pill('1 a mais')}</p>`)
  })

  it('cenários b-e: anexos iguais aos de hoje (banner da conferência por CID)', () => {
    const today = buildCargoReportConferenceEmail({ subject: 'x', processId: 'p' })
    for (const key of ['b', 'c', 'd', 'e']) {
      expect(withoutPath(buildDirect(key).attachments)).toEqual(withoutPath(today.attachments))
    }
    expect(buildDirect('d', { bannerSrc: 'data:image/jpeg;base64,AAA' }).attachments).toEqual([])
  })

  it('caminho direto == caminho via corpo da notificação (html, texto, assunto, anexos) nos cenários a-e', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      for (const extra of [{}, { bannerSrc: 'data:image/jpeg;base64,AAA' }]) {
        const direct = buildDirect(key, extra)
        const viaBody = buildViaBody(key, extra)
        expect(viaBody.html).toBe(direct.html)
        expect(viaBody.text).toBe(direct.text)
        expect(viaBody.subject).toBe(direct.subject)
        expect(withoutPath(viaBody.attachments)).toEqual(withoutPath(direct.attachments))
      }
    }
  })
})

// ---------- escape ----------

describe('buildCargoReportConferenceEmail: escape na Contagem', () => {
  it('nome e lote com HTML, aspas e "&" saem escapados no HTML (parcial, divergente e linha solta)', () => {
    const evil = { ...row('r-1', '<script>alert("x")</script> & Cia', `L'1 <b>`, 160) }
    const conference = { unitsByRowId: { 'r-1': 150 }, partialPallets: [{ id: 'pp-1', parts: [{ rowId: 'r-1', units: 5 }] }] }
    const sections = buildCargoConferenceNoticeSections(conference, { rows: [evil], expectedPallets: 3 })
    const { html } = buildCargoReportConferenceEmail({ subject: 'Conferência do Relatório de Carga', processId: 'p', countLines: sections.countLines })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>L')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cia · Lote L&#39;1 &lt;b&gt;')
    expect(html.split('&lt;script&gt;').length - 1).toBe(2) // parcial e divergente
  })

  it('linha fora do formato vira parágrafo escapado, sem pílula', () => {
    const { html } = buildCargoReportConferenceEmail({
      subject: 'Conferência do Relatório de Carga',
      processId: 'p',
      countLines: ['Contagem: algo.', '• <img src=x onerror=1> 150 contadas de 160 esperadas', 'Texto <i>solto</i>'],
    })
    expect(html).toContain('• &lt;img src=x onerror=1&gt; 150 contadas de 160 esperadas</p>')
    expect(html).toContain('Texto &lt;i&gt;solto&lt;/i&gt;</p>')
    expect(html).not.toContain('border-radius:999px')
    expect(html).not.toContain('<img src=x')
  })
})
