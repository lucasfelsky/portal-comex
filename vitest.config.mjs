import { defineConfig } from 'vitest/config'

// Config de teste para o Portal COMEX.
// Existe um `vite.config.js` (usado pelo build de producao) que nao
// interfere — vitest prioriza este arquivo.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs,ts}'],
    testTimeout: 30000,
    hookTimeout: 60000,
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
