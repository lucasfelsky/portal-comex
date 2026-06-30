import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
