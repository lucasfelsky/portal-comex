// E2E browser do Portal COMEX (S7, fechamento — 2026-07-11).
//
// Como rodar:
//   npm run test:e2e
// que sobe os emuladores (auth/firestore/storage, via scripts/with-jdk.mjs)
// com `emulators:exec` e roda `playwright test` dentro deles. O webServer
// abaixo sobe o Vite com VITE_USE_FIREBASE_EMULATORS=true + config demo,
// então o app conversa 100% com os emuladores — nada toca produção.
//
// Gate: os specs só rodam quando FIRESTORE_EMULATOR_HOST está setado
// (global-setup falha rápido com mensagem clara caso contrário).
import { defineConfig } from '@playwright/test'

const DEMO_ENV = {
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-sqcomex.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-sqcomex',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-sqcomex.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:demo',
  VITE_USE_FIREBASE_EMULATORS: 'true',
}

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.mjs',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 60_000,
    env: DEMO_ENV,
  },
})
