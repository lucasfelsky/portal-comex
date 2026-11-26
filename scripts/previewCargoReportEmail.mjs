// Pre-visualizacao do e-mail do Relatorio de Carga: grava o HTML em disco, SEM
// enviar nada (sem SMTP, sem secrets, sem Firebase). O banner (JPEG) vai
// embutido como data URI para o arquivo abrir sozinho no navegador.
//
// Uso:
//   node scripts/previewCargoReportEmail.mjs [--conferencia [--avarias]] [--out <caminho.html>]
// `--conferencia` gera o e-mail da conferencia da logistica (S7, banner proprio). `--avarias` (S10-J2, com
// `--conferencia`) inclui a secao "Avarias e ressalvas" com 2 itens de exemplo (uma observacao com HTML para conferir o
// escape). Sem `--out`, grava em
// `<tmp do SO>/portal-comex-cargo-report-email.html` (ou `...-conference-email.html`; nunca dentro do repo).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CARGO_CONFERENCE_EMAIL_BANNER_PATH,
  CARGO_REPORT_EMAIL_BANNER_PATH,
  buildCargoReportConferenceEmail,
  buildCargoReportEmail,
} from '../functions/src/process/cargoReportEmail.js'
import {
  buildCargoConferenceDamageLines,
  summarizeCargoConferenceDamage,
} from '../functions/src/process/cargoConferenceDamage.js'
import {
  buildCargoReportConferenceSubject,
  buildCargoReportSubject,
} from '../functions/src/process/cargoReportNotification.js'

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

function main() {
  const argv = process.argv.slice(2)
  const isConference = argv.includes('--conferencia')
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

main()
