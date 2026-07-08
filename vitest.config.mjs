import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

// Alias dos subpaths de firebase-admin/firebase-functions usados por
// functions/index.js -> copia da RAIZ (resolvida aqui via require.resolve,
// que honra o `exports` de cada pacote).
//
// Por que: quando `functions/node_modules` existe (ex.: apos um deploy, que
// exige `npm install --prefix functions`), o import em functions/index.js
// resolve pra copia de functions/, enquanto o `vi.mock('firebase-admin/app')`
// no teste resolve pra copia da raiz -> ids diferentes, o mock nao casa, e os
// tests/functions/* quebram (63 falhas). Forcando ambos pra mesma copia (raiz),
// o vi.mock volta a casar independentemente de functions/node_modules existir.
// So afeta estes pacotes de backend; o front usa `firebase/*` (SDK client),
// intocado. Config so' de teste — nao mexe no build (vite.config.js).
const firebaseBackendAlias = Object.fromEntries(
  [
    'firebase-admin/app',
    'firebase-admin/auth',
    'firebase-admin/firestore',
    'firebase-functions/v2/firestore',
    'firebase-functions/v2/https',
    'firebase-functions/params',
    'firebase-functions/logger',
    'nodemailer',
  ].map((spec) => [spec, require.resolve(spec)])
)

// Config de teste para o Portal COMEX.
// Existe um `vite.config.js` (usado pelo build de producao) que nao
// interfere — vitest prioriza este arquivo.
//
// Environments por path:
//   - tests/firebase/**, tests/functions/**, tests/setup-ui.js : 'node'
//   - tests/ui/** : 'jsdom' (componentes React + hooks)
export default defineConfig({
  plugins: [react()],
  test: {
    alias: firebaseBackendAlias,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/ui/**', 'jsdom'],
      ['tests/**/*.test.{jsx,tsx}', 'jsdom'],
    ],
    include: [
      'tests/**/*.test.{js,mjs,ts}',
      'tests/**/*.test.{jsx,tsx}',
    ],
    testTimeout: 30000,
    hookTimeout: 60000,
    setupFiles: ['./tests/setup-ui.js'],
    server: {
      deps: {
        // Forca o vitest a transformar firebase-* e nodemailer no mesmo
        // grafo do test runner. Sem isso, modulos externos com `exports`
        // complexos (firebase-functions@7.x, firebase-admin) podem
        // resolver antes do vi.mock ser aplicado.
        inline: [/^firebase-functions/, /^firebase-admin/, /^nodemailer/],
      },
    },
  },
})
