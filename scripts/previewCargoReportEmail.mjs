// Pre-visualizacao do e-mail do Relatorio de Carga: grava o HTML em disco, SEM
// enviar nada (sem SMTP, sem secrets, sem Firebase). O banner (JPEG) vai
// embutido como data URI para o arquivo abrir sozinho no navegador.
//
// Uso:
//   node scripts/previewCargoReportEmail.mjs [--conferencia] [--out <caminho.html>]
// `--conferencia` gera o e-mail da conferencia da logistica (S7, banner proprio). Sem `--out`, grava em
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
  })

  const outputPath = resolveOutputPath(argv, isConference)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, html, 'utf8')
  console.log(outputPath)
}

main()
