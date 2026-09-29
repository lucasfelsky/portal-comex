// L38 (Parte C, opcional): revoga os `firebaseStorageDownloadTokens` dos
// documentos do processo JA enviados (`processes/*/documents/**`). Objetos
// enviados pelo SDK cliente carregam um token de download; quem ja gerou uma
// URL com `getDownloadURL` (ou a vazou) continua com acesso ate' o token ser
// removido. O app novo baixa via Cloud Function `downloadProcessDocument`
// (Admin SDK, sem token), entao remover o token nao afeta nenhum fluxo.
//
// NUNCA toca `post-receipt/`, `news/` nem `supportTickets/`: essas URLs estao
// PERSISTIDAS no Firestore - revogar quebraria imagens em producao.
//
// Uso:
//   node scripts/revokeProcessDocumentTokens.mjs          # dry-run (default), lista, nao escreve
//   node scripts/revokeProcessDocumentTokens.mjs --apply  # remove os tokens
//   node scripts/revokeProcessDocumentTokens.mjs --help   # uso, exit 0, SEM exigir env
//
// Env: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY +
// FIREBASE_STORAGE_BUCKET.
//
// ZONA VERMELHA: `--apply` escreve em producao (e ate' o dry-run exige
// credencial). Quem roda e' o Lucas, depois do deploy de functions + hosting +
// storage.rules (ver PLAN.md, secao Deploy).

import { pathToFileURL } from 'node:url'

const DOCUMENT_PATH_PATTERN = /^processes\/[^/]+\/documents\//

function normalizePrivateKey(value) {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
}

function printHelp() {
  console.log(`
Uso: node scripts/revokeProcessDocumentTokens.mjs [--apply] [--help]

  (sem flags)  dry-run - lista os objetos de "processes/*/documents/**" que
               ainda tem firebaseStorageDownloadTokens, nao escreve.
  --apply      remove os tokens (ZONA VERMELHA - so' apos ler o dry-run).
               Nunca toca post-receipt/, news/ nem supportTickets/.
  --help       mostra este uso e sai (nao exige nenhuma env).

Env obrigatoria (dry-run/apply): FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL +
FIREBASE_PRIVATE_KEY + FIREBASE_STORAGE_BUCKET.
`)
}

// Pura: recebe `[{ name, metadata }]` (metadata = objeto de metadados do GCS)
// e devolve so' os documentos do processo que ainda tem token de download.
export function planTokenRevocation(files) {
  return (Array.isArray(files) ? files : []).filter((file) => {
    const name = String(file?.name ?? '')
    if (!DOCUMENT_PATH_PATTERN.test(name)) return false
    const tokens = file?.metadata?.metadata?.firebaseStorageDownloadTokens
    return typeof tokens === 'string' ? tokens.trim().length > 0 : Boolean(tokens)
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    printHelp()
    return
  }
  const apply = args.includes('--apply')

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET
  const missing = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY',
    !bucketName && 'FIREBASE_STORAGE_BUCKET',
  ].filter(Boolean)
  if (missing.length > 0) {
    throw new Error(`Variaveis ausentes: ${missing.join(', ')}.`)
  }

  const { cert, initializeApp } = await import('firebase-admin/app')
  const { getStorage } = await import('firebase-admin/storage')
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: bucketName,
  })
  const bucket = getStorage().bucket()

  const [files] = await bucket.getFiles({ prefix: 'processes/' })
  const targets = planTokenRevocation(files.map((file) => ({ name: file.name, metadata: file.metadata })))

  console.log(`${targets.length} objeto(s) de documentos do processo com token de download:`)
  for (const target of targets) console.log(`  - ${target.name}`)

  if (!apply) {
    console.log('\nDry-run - nada foi escrito. Rode com --apply so apos ler esta lista.')
    return
  }

  let ok = 0
  let failed = 0
  for (const target of targets) {
    try {
      await bucket.file(target.name).setMetadata({ metadata: { firebaseStorageDownloadTokens: null } })
      ok += 1
      console.log(`OK    ${target.name}`)
    } catch (error) {
      failed += 1
      console.error(`FALHA ${target.name}: ${error instanceof Error ? error.message : error}`)
    }
  }
  console.log(`\nRevogacao concluida: ${ok} ok, ${failed} falha(s).`)
  if (failed > 0) process.exitCode = 1
}

// Guard de execucao: so' roda como entrypoint (o teste importa a funcao pura).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`Revogacao falhou: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
}
