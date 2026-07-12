import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

// Falha o build (npm run build) se faltar qualquer variavel do Firebase.
// Evita publicar um bundle com Firebase Auth desativado ("Firebase Auth
// nao configurado"). No `vite dev` apenas avisa, para nao travar quem quer
// rodar o app sem backend (mock/preview).
function firebaseEnvGuard({ mode, envDir }) {
  const env = loadEnv(mode, envDir ?? process.cwd(), 'VITE_')
  const missing = REQUIRED_FIREBASE_ENV.filter((key) => !env[key])

  if (missing.length === 0) return

  if (mode === 'production' || process.env.NODE_ENV === 'production' || mode === 'build') {
    throw new Error(
      `\n[firebase-env-guard] Build cancelado: faltam variaveis do Firebase: ${missing.join(', ')}.\n` +
        `Crie/verifique o arquivo .env (veja .env.example) ou injete as variaveis VITE_FIREBASE_* no CI.\n` +
        `Sem elas o app publica com Firebase Auth desativado e o login quebra com "Firebase Auth nao configurado".\n`
    )
  }

  console.warn(
    `\n[firebase-env-guard] AVISO: rodando sem config do Firebase (${missing.join(', ')}).\n` +
      `Login/cadastro ficam desativados neste modo. Defina as VITE_FIREBASE_* para habilitar.\n`
  )
}

// F6 (backlog 2026-07-12): o service worker de FCM nao passa pelo bundle do
// Vite (precisa viver em /firebase-messaging-sw.js na raiz), entao os
// placeholders __FIREBASE_*__ do template sao substituidos aqui:
//  - build: emite o asset final em dist/
//  - dev: serve o conteudo substituido via middleware
function messagingSwPlugin({ mode }) {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const replacements = {
    __FIREBASE_API_KEY__: env.VITE_FIREBASE_API_KEY ?? '',
    __FIREBASE_AUTH_DOMAIN__: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    __FIREBASE_PROJECT_ID__: env.VITE_FIREBASE_PROJECT_ID ?? '',
    __FIREBASE_STORAGE_BUCKET__: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    __FIREBASE_MESSAGING_SENDER_ID__: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    __FIREBASE_APP_ID__: env.VITE_FIREBASE_APP_ID ?? '',
  }

  function renderSw() {
    const template = readFileSync(
      resolve(process.cwd(), 'scripts/firebase-messaging-sw.template.js'),
      'utf-8'
    )
    return Object.entries(replacements).reduce(
      (content, [placeholder, value]) => content.replaceAll(placeholder, value),
      template
    )
  }

  return {
    name: 'messaging-sw',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: renderSw(),
      })
    },
    configureServer(server) {
      server.middlewares.use('/firebase-messaging-sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(renderSw())
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  firebaseEnvGuard({ mode, envDir: undefined })

  return {
    plugins: [react(), messagingSwPlugin({ mode })],
    server: { port: 5173 },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            // firebase/messaging fica num chunk separado porque so e' importado
            // dinamicamente (fcmService.js) -- se cair no bucket "firebase"
            // junto com auth/firestore, o import dinamico perde o efeito: o
            // arquivo inteiro (que ja carrega eager por causa do Auth) ficaria
            // maior, em vez do FCM baixar sob demanda pos-login.
            if (id.includes('firebase/messaging')) return 'firebase-messaging'
            // firebase/functions tambem so' e' importado dinamicamente
            // (lib/firebase.js getCallable) -- chunk proprio, carregado sob
            // demanda quando a primeira callable roda (pos-login).
            if (id.includes('firebase/functions')) return 'firebase-functions'
            if (id.includes('firebase')) return 'firebase'
            if (id.includes('xlsx')) return 'spreadsheet'
            return undefined
          },
        },
      },
    },
  }
})