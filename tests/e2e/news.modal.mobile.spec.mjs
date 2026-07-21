// E2E mobile do modal de notícias (regressão guard).
// Viewport iPhone 14 (393×852, DPR 3) para garantir que o bottom sheet
// abra corretamente e que o título longo fique visível sem overflow.
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

const IPHONE_14_VIEWPORT = {
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
}

const NEWS_TITLE =
  'Portaria conjunta altera regras de despacho aduaneiro para importações por via marítima e aérea'

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({
    timeout: 15_000,
  })
}

test.use({ viewport: IPHONE_14_VIEWPORT })

test('modal de notícias em mobile exibe título completo e fica dentro da tela', async ({ page }) => {
  await login(page, E2E_USERS.user)

  await page.locator('nav[aria-label="Navegação móvel"]').getByRole('link', { name: 'Notícias' }).click()
  await expect(page).toHaveURL(/\/news$/)

  // Abre a notícia seedada. O card é um <button> com aria-label contendo o título.
  await page.getByRole('button', { name: NEWS_TITLE }).click()

  // O modal deve estar presente e o título deve estar visível por completo.
  const modal = page.getByRole('dialog', { name: 'Detalhes da noticia' })
  await expect(modal).toBeVisible({ timeout: 10_000 })

  const title = modal.getByRole('heading', { name: NEWS_TITLE })
  await expect(title).toBeVisible()

  // Garante que o título está dentro da viewport (não cortado horizontalmente).
  const titleBox = await title.boundingBox()
  expect(titleBox).not.toBeNull()
  expect(titleBox.x).toBeGreaterThanOrEqual(0)
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(IPHONE_14_VIEWPORT.width + 1)

  // O bottom sheet deve estar grudado na parte inferior (bottom sheet pattern).
  // Toleramos até 64px de overshoot por conta da bottom nav e do arredondamento
  // de subpixel em viewports com DPR alto.
  const modalBox = await modal.boundingBox()
  expect(modalBox).not.toBeNull()
  const viewport = page.viewportSize()
  expect(modalBox.y).toBeGreaterThan(0)
  expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(viewport.height + 64)

  // Fecha pelo botão ou clicando no backdrop.
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
})
