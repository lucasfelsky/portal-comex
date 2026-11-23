// Pre-visualizacao do e-mail do Relatorio de Carga: grava o HTML em disco, SEM
// enviar nada (sem SMTP, sem secrets, sem Firebase). O banner (JPEG) vai
// embutido como data URI para o arquivo abrir sozinho no navegador.
//
// Uso:
//   node scripts/previewCargoReportEmail.mjs [--out <caminho.html>]
// Sem `--out`, grava em `<tmp do SO>/portal-comex-cargo-report-email.html`
// (nunca dentro do repo).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CARGO_REPORT_EMAIL_BANNER_PATH,
  buildCargoReportEmail,
} from '../functions/src/process/cargoReportEmail.js'
import { buildCargoReportSubject } from '../functions/src/process/cargoReportNotification.js'

function resolveOutputPath(argv) {
  const index = argv.indexOf('--out')
  if (index !== -1 && argv[index + 1]) return path.resolve(argv[index + 1])
  return path.join(os.tmpdir(), 'portal-comex-cargo-report-email.html')
}

function main() {
  const bannerBase64 = fs.readFileSync(CARGO_REPORT_EMAIL_BANNER_PATH).toString('base64')
  const bannerSrc = `data:image/jpeg;base64,${bannerBase64}`

  const { html } = buildCargoReportEmail({
    subject: buildCargoReportSubject({
      category: 'FCL',
      processNumber: '9036',
      name: 'BETA SEA 904-26',
    }),
    processId: 'AbC123xYz',
    recipientName: 'Maria Souza',
    bannerSrc,
  })

  const outputPath = resolveOutputPath(process.argv.slice(2))
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, html, 'utf8')
  console.log(outputPath)
}

main()
