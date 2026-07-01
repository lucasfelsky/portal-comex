// scripts/set-admin-claims.cjs
//
// Ferramenta de emergencia para setar custom claims em um usuario do
// Firebase Auth quando o painel admin (/admin/usuarios) nao esta'
// acessivel (ex: admin bloqueado com status=Pendente).
//
// Uso:
//   1. Coloque a service account key em ./serviceAccountKey.json
//      (baixada de Firebase Console > Project Settings > Service Accounts
//      > Generate new private key).
//   2. Rode:
//        node scripts/set-admin-claims.cjs <UID> <role> <status>
//      Exemplo (promover a admin):
//        node scripts/set-admin-claims.cjs 9WdeD9D3mvdIvF2Li27ma1W4jD22 admin Ativo
//   3. Apos rodar, o usuario precisa:
//      - Logout/login no app, OU
//      - Clicar no botao "Forcar reload das claims" na tela de Acesso pendente
//
// Seguranca:
//   - NUNCA commite o serviceAccountKey.json (ja' esta' no .gitignore).
//   - O script so' le a SA key do filesystem local, nunca do repo.
//
// Origem: Sprint 6.7 / hotfix de "admin vendo Acesso pendente".

const path = require('path')
const fs = require('fs')

const UID = process.argv[2]
const ROLE = process.argv[3] || 'admin'
const STATUS = process.argv[4] || 'Ativo'

if (!UID) {
  console.error('Uso: node scripts/set-admin-claims.cjs <UID> [role] [status]')
  console.error('  role padrao: admin')
  console.error('  status padrao: Ativo')
  console.error('Exemplo: node scripts/set-admin-claims.cjs 9WdeD9D3mvdIvF2Li27ma1W4jD22 admin Ativo')
  process.exit(1)
}

const VALID_ROLES = new Set(['user', 'admin', 'logistica', 'compras', 'viewer'])
const VALID_STATUSES = new Set(['Pendente', 'Ativo', 'Bloqueado', 'Reprovado'])

if (!VALID_ROLES.has(ROLE)) {
  console.error(`role invalida: ${ROLE}. Valores aceitos: ${[...VALID_ROLES].join(', ')}`)
  process.exit(1)
}

if (!VALID_STATUSES.has(STATUS)) {
  console.error(`status invalido: ${STATUS}. Valores aceitos: ${[...VALID_STATUSES].join(', ')}`)
  process.exit(1)
}

const SA_PATHS = [
  path.resolve(process.cwd(), 'serviceAccountKey.json'),
  path.resolve(process.cwd(), '..', 'serviceAccountKey.json'),
  path.resolve(process.env.APPDATA || '', 'serviceAccountKey.json'),
  path.resolve(process.env.HOME || '', 'serviceAccountKey.json'),
]

// Tambem aceita o path via env var GOOGLE_APPLICATION_CREDENTIALS
// (mesmo padrao de scripts/syncCustomClaims.mjs).
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  SA_PATHS.unshift(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS))
}

const saPath = SA_PATHS.find((p) => fs.existsSync(p))
if (!saPath) {
  console.error('serviceAccountKey.json nao encontrado em nenhum dos paths:')
  for (const p of SA_PATHS) console.error('  -', p)
  console.error('')
  console.error('Como obter:')
  console.error('  Firebase Console > Project Settings > Service Accounts > Generate new private key')
  console.error('  Salve o JSON em: ./serviceAccountKey.json (raiz do projeto, ja esta no .gitignore)')
  process.exit(1)
}

const admin = require('firebase-admin')

if (!admin.apps.length) {
  const serviceAccount = require(saPath)
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

async function run() {
  console.log('Setando custom claims...')
  console.log('  uid:', UID)
  console.log('  role:', ROLE)
  console.log('  status:', STATUS)

  await admin.auth().setCustomUserClaims(UID, { role: ROLE, status: STATUS })

  // Confirma leitura
  const userRecord = await admin.auth().getUser(UID)
  console.log('')
  console.log('Custom claims apos setCustomUserClaims:')
  console.log(JSON.stringify(userRecord.customClaims, null, 2))

  console.log('')
  console.log('OK. O usuario precisa fazer logout/login (ou clicar em "Forcar reload das claims")')
  console.log('para que o front leia as novas claims.')
}

run().catch((error) => {
  console.error('Erro:', error?.message ?? error)
  process.exit(1)
})
