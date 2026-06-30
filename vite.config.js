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

export default defineConfig(({ mode }) => {
  firebaseEnvGuard({ mode, envDir: undefined })

  return {
    plugins: [react()],
    server: { port: 5173 },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('firebase')) return 'firebase'
            if (id.includes('xlsx')) return 'spreadsheet'
            return undefined
          },
        },
      },
    },
  }
})