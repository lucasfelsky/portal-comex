// Pre-visualizacao do e-mail do Relatorio de Carga: grava o HTML em disco, SEM
// enviar nada (sem SMTP, sem secrets, sem Firebase). O banner (JPEG) vai
// embutido como data URI para o arquivo abrir sozinho no navegador.
//
// Uso:
//   node scripts/previewCargoReportEmail.mjs [--conferencia [--avarias]] [--out <caminho.html>]
//   node scripts/previewCargoReportEmail.mjs --conferencia --cenario <a|b|c|d|e> [--eml] [--out <base>]
// `--conferencia` gera o e-mail da conferencia da logistica (S7, banner proprio). `--avarias` (S10-J2, com
// `--conferencia`) inclui a secao "Avarias e ressalvas" com 2 itens de exemplo (uma observacao com HTML para conferir o
// escape). Sem `--out`, grava em
// `<tmp do SO>/portal-comex-cargo-report-email.html` (ou `...-conference-email.html`; nunca dentro do repo).
//
// Fatia D: `--cenario` (com `--conferencia`) monta os cenarios do mock aprovado, com dados INVENTADOS, e passa pelo
// caminho REAL do aviso (resumo -> corpo da notificacao -> leitura do corpo -> e-mail):
//   a  igual ao de hoje (sem parcial e sem divergencia)     d  parcial + divergencia + avaria
//   b  pallets parciais                                     e  mais de 10 lotes divergentes (+ 1 parcial)
//   c  unidades divergentes
// Grava `<base>.html` (abre no navegador), `<base>.txt` (texto puro do e-mail) e `<base>-app.txt` (titulo e corpo da
// notificacao do app/push). `<base>` = `--out` sem a extensao `.html`, ou `<tmp do SO>/portal-comex-conferencia-<x>`.
// `--eml` grava tambem `<base>.eml`: mensagem multipart (texto + HTML, banner por CID) para abrir no Outlook e
// encaminhar a contas Gmail/Outlook de teste (D-29). Nada e' enviado daqui.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import {
  CARGO_CONFERENCE_EMAIL_BANNER_PATH,
  CARGO_REPORT_EMAIL_BANNER_PATH,
  buildCargoReportConferenceEmail,
  buildCargoReportEmail,
} from '../functions/src/process/cargoReportEmail.js'
import {
  buildCargoConferenceDamageLines,
  buildCargoConferenceDamageText,
  buildCargoConferenceNoticeSections,
  extractCargoConferenceDamageLines,
  summarizeCargoConferenceDamage,
} from '../functions/src/process/cargoConferenceDamage.js'
import { extractCargoConferenceCountLines } from '../functions/src/process/cargoConferenceCount.js'
import {
  CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY,
  buildCargoReportConferenceSubject,
  buildCargoReportSubject,
} from '../functions/src/process/cargoReportNotification.js'

const SCENARIO_KEYS = ['a', 'b', 'c', 'd', 'e']

function resolveOutputPath(argv, isConference) {
  const index = argv.indexOf('--out')
  if (index !== -1 && argv[index + 1]) return path.resolve(argv[index + 1])
  return path.join(
    os.tmpdir(),
    isConference ? 'portal-comex-cargo-report-conference-email.html' : 'portal-comex-cargo-report-email.html'
  )
}

// Exemplo da secao de avarias: 2 itens (3 fotos), pallets divergentes, observacao com <b> (deve sair escapada).
function buildSampleDamageLines() {
  const current = {
    expectedPallets: 25,
    rows: [
      { id: 'r-1', sqDescription: 'POLIOL PE-3000', supplierDescription: '', dbcorpCode: '1001', quantityKg: 1000 },
      { id: 'r-2', sqDescription: '', supplierDescription: 'ISOCIANATO MDI', dbcorpCode: '1002', quantityKg: 500 },
    ],
  }
  const photo = (id) => ({ id, path: 'x', thumbPath: 'y', width: 1600, height: 1200 })
  const conference = {
    palletsByRowId: { 'r-1': 12, 'r-2': 11 },
    damageByRowId: {
      'r-1': { flagged: true, note: 'Caixas molhadas no pallet 2.', photos: [photo('f1'), photo('f2')] },
      'r-2': { flagged: false, note: 'Lacre rompido <b>sem foto do lacre</b>', photos: [photo('f3')] },
    },
  }
  return buildCargoConferenceDamageLines(summarizeCargoConferenceDamage(conference, current))
}

// ---------- cenarios a-e da Fatia D (dados inventados: nada de processo, fornecedor ou lote reais) ----------

const SCENARIO_PROCESS = { category: 'FCL', processNumber: '9036', name: 'DEMO SEA 001-26' }

function scenarioRow(id, sqDescription, supplierLot, frozenPackages) {
  return { id, po: '4501', dbcorpCode: '1001', sqDescription, supplierLot, quantityKg: 1000, frozenNetWeightKg: null, frozenPackages }
}

function buildScenario(key) {
  const rows = [
    scenarioRow('r-1', 'Catalisador ZN-12', 'Z-9910', 160),
    scenarioRow('r-2', 'Poliol Flex 3000', 'L-2240', 50),
    scenarioRow('r-3', 'Poliol Flex 3000', 'L-2232', 100),
    scenarioRow('r-4', 'Resina Acrílica RA-55', 'A-1180', 80),
    scenarioRow('r-5', 'Catalisador ZN-12', 'Z-9911', 60),
    scenarioRow('r-6', 'Aditivo AX-7', 'X-0041', 40),
  ]
  const matching = { 'r-1': 160, 'r-2': 50, 'r-3': 100, 'r-4': 80, 'r-5': 60, 'r-6': 40 }
  const divergent = { ...matching, 'r-1': 150, 'r-2': 52 }
  const p1 = { id: 'pp-1', parts: [{ rowId: 'r-3', units: 30 }, { rowId: 'r-4', units: 20 }] }
  const p2 = { id: 'pp-2', parts: [{ rowId: 'r-5', units: 25 }, { rowId: 'r-6', units: 10 }] }
  const pallets20 = { 'r-1': 4, 'r-2': 4, 'r-3': 3, 'r-4': 3, 'r-5': 3, 'r-6': 3 }
  const pallets22 = { 'r-1': 4, 'r-2': 4, 'r-3': 4, 'r-4': 4, 'r-5': 3, 'r-6': 3 }
  const photo = (id) => ({ id, path: 'x', thumbPath: 'y', width: 1600, height: 1200 })
  const current = { rows, expectedPallets: 22 }

  if (key === 'a') return { conference: { unitsByRowId: matching, palletsByRowId: pallets22 }, current }
  if (key === 'b') {
    return { conference: { unitsByRowId: matching, palletsByRowId: pallets20, partialPallets: [p1, p2] }, current }
  }
  if (key === 'c') return { conference: { unitsByRowId: divergent, palletsByRowId: pallets22 }, current }
  if (key === 'd') {
    return {
      conference: {
        unitsByRowId: divergent,
        palletsByRowId: pallets20,
        partialPallets: [p1, p2],
        damageByRowId: {
          'r-5': {
            flagged: true,
            note: '2 sacos rasgados na lateral do pallet, produto exposto.',
            photos: [photo('f1'), photo('f2')],
          },
        },
      },
      current,
    }
  }
  // e: 14 lotes divergentes + 1 pallet parcial (L-2232 + A-1180).
  const names = [['Poliol Flex 3000', 'L-2240'], ['Catalisador ZN-12', 'Z-9910'], ['Resina Acrílica RA-55', 'A-1180'], ['Aditivo AX-7', 'X-0041']]
  const many = Array.from({ length: 14 }, (_, i) => {
    const [name, lot] = names[i % 4]
    return {
      counted: (i % 3 === 0 ? 150 : i % 3 === 1 ? 52 : 97) + i,
      row: scenarioRow(`e-${i}`, name, lot.replace(/\d+$/, (match) => String(Number(match) + Math.floor(i / 4))), (i % 3 === 0 ? 160 : i % 3 === 1 ? 50 : 100) + i),
    }
  })
  return {
    conference: {
      unitsByRowId: { ...Object.fromEntries(many.map((item) => [item.row.id, item.counted])), 'r-3': 100, 'r-4': 80 },
      palletsByRowId: { ...Object.fromEntries(many.map((item) => [item.row.id, 1])), 'r-3': 4, 'r-4': 3 },
      partialPallets: [p1],
    },
    current: { rows: [...many.map((item) => item.row), rows[2], rows[3]], expectedPallets: 22 },
  }
}

// Caminho REAL do aviso (`notifyCargoReportUploaded` -> `sendProcessNotificationEmail`): secoes -> corpo da notificacao
// -> leitura das secoes do corpo -> e-mail. Devolve o titulo/assunto, o corpo do app e a funcao que monta o e-mail.
function buildScenarioNotice(key) {
  const { conference, current } = buildScenario(key)
  const sections = buildCargoConferenceNoticeSections(conference, current)
  const subject = buildCargoReportConferenceSubject(SCENARIO_PROCESS, { divergent: sections.divergent })
  const sectionsText = [buildCargoConferenceDamageText(sections.countLines), buildCargoConferenceDamageText(sections.damageLines)]
    .filter(Boolean)
    .join('\n\n')
  const body = `${CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY}${sectionsText ? `\n\n${sectionsText}` : ''}`
  const buildEmail = (extra = {}) =>
    buildCargoReportConferenceEmail({
      subject,
      processId: 'AbC123xYz',
      recipientName: 'Ana Souza',
      damageLines: extractCargoConferenceDamageLines(body),
      countLines: extractCargoConferenceCountLines(body),
      ...extra,
    })
  return { subject, body, buildEmail }
}

function composeEml(message) {
  const composer = new MailComposer({
    from: 'Portal COMEX <portal-comex@example.com>',
    to: 'Ana Souza <ana.souza@example.com>',
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  })
  return new Promise((resolve, reject) => {
    composer.compile().build((error, buffer) => (error ? reject(error) : resolve(buffer)))
  })
}

async function runScenario(argv, key) {
  const notice = buildScenarioNotice(key)
  const bannerSrc = `data:image/jpeg;base64,${fs.readFileSync(CARGO_CONFERENCE_EMAIL_BANNER_PATH).toString('base64')}`
  const outIndex = argv.indexOf('--out')
  const base =
    outIndex !== -1 && argv[outIndex + 1]
      ? path.resolve(argv[outIndex + 1]).replace(/\.html$/i, '')
      : path.join(os.tmpdir(), `portal-comex-conferencia-${key}`)
  fs.mkdirSync(path.dirname(base), { recursive: true })

  const browserEmail = notice.buildEmail({ bannerSrc })
  const files = [
    [`${base}.html`, browserEmail.html],
    [`${base}.txt`, browserEmail.text],
    [`${base}-app.txt`, `Título: ${notice.subject}\n\n${notice.body}\n`],
  ]
  if (argv.includes('--eml')) files.push([`${base}.eml`, await composeEml(notice.buildEmail())])
  for (const [file, content] of files) {
    fs.writeFileSync(file, content, typeof content === 'string' ? 'utf8' : undefined)
    console.log(file)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const isConference = argv.includes('--conferencia')

  const scenarioIndex = argv.indexOf('--cenario')
  if (scenarioIndex !== -1) {
    const key = String(argv[scenarioIndex + 1] ?? '').toLowerCase()
    if (!isConference) {
      console.error('--cenario exige --conferencia.')
      process.exit(1)
    }
    if (!SCENARIO_KEYS.includes(key)) {
      console.error(`Cenário inválido: "${argv[scenarioIndex + 1] ?? ''}". Use ${SCENARIO_KEYS.join(', ')}.`)
      process.exit(1)
    }
    await runScenario(argv, key)
    return
  }

  const bannerPath = isConference ? CARGO_CONFERENCE_EMAIL_BANNER_PATH : CARGO_REPORT_EMAIL_BANNER_PATH
  const bannerBase64 = fs.readFileSync(bannerPath).toString('base64')
  const bannerSrc = `data:image/jpeg;base64,${bannerBase64}`

  const sampleProcess = { category: 'FCL', processNumber: '9036', name: 'BETA SEA 904-26' }
  const build = isConference ? buildCargoReportConferenceEmail : buildCargoReportEmail
  const { html } = build({
    subject: (isConference ? buildCargoReportConferenceSubject : buildCargoReportSubject)(sampleProcess),
    processId: 'AbC123xYz',
    recipientName: 'Maria Souza',
    bannerSrc,
    ...(isConference && argv.includes('--avarias') ? { damageLines: buildSampleDamageLines() } : {}),
  })

  const outputPath = resolveOutputPath(argv, isConference)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, html, 'utf8')
  console.log(outputPath)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
