// Regressão do bug reportado pelo Lucas em 2026-07-21: onSnapshot (SDK
// "completo" do Firestore) não aceita uma referência/instância criada pelo
// SDK "lite" (usado no resto do app pra bundle menor) — throw "Expected
// type 'Ni', but it was: a custom wd object" assim que o painel de
// Previsões monta (useForecastSettings -> subscribeForecastSettings ->
// onSnapshot). Esse erro só aparece com o SDK real de verdade contra um
// Firestore de verdade (emulador aqui) — testes jsdom/vitest mockam o
// repositório inteiro e nunca exercitam essa classe de bug.
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({
    timeout: 15_000,
  })
}

test('admin abre Previsões sem erro de console (onSnapshot lite/completo)', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await login(page, E2E_USERS.admin)

  await page.goto('/admin/previsoes')
  await expect(page.getByRole('heading', { name: 'Destinos e cutoff' })).toBeVisible()

  // A subscrição via onSnapshot é assíncrona — dá um instante pro listener
  // conectar (e, se ainda bugado, pro erro estourar) antes de checar.
  await page.waitForTimeout(1_000)

  expect(pageErrors.map((error) => error.message)).toEqual([])
})
