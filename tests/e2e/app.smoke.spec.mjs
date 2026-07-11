// E2E browser do Portal COMEX (S7, fechamento): navegador real (Chromium)
// contra os emuladores Firebase. Cobre o esqueleto do app que a suite
// jsdom não exercita — roteamento real, Firebase Web SDK de verdade
// (auth + firestore lite via wiring de emulador), CSS do FAB de suporte.
//
// Fluxos:
//   1. login -> dashboard (stat-cards renderizados)
//   2. navegação Dashboard -> Notícias -> Chegadas
//   3. usuário abre chamado de suporte -> "Meus chamados"
//   4. admin vê o chamado em /admin/suporte e resolve (loop do Suporte v2)
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  // Ha dois botoes "Entrar" (toggle Entrar/Cadastrar + submit) — mirar o submit.
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({
    timeout: 15_000,
  })
}

test.describe.configure({ mode: 'serial' })

test('login de usuário aprovado leva ao dashboard com stat-cards', async ({ page }) => {
  await login(page, E2E_USERS.user)

  await expect(page.locator('.dashboard-stat-row')).toBeVisible()
  await expect(page.getByText('Processos ativos')).toBeVisible()
  await expect(page.getByText('Chegadas (ETA) desta semana')).toBeVisible()
})

test('navegação: Dashboard -> Notícias -> Chegadas', async ({ page }) => {
  await login(page, E2E_USERS.user)

  await page.getByRole('link', { name: 'Notícias' }).click()
  await expect(page).toHaveURL(/\/news$/)

  await page.getByRole('link', { name: 'Chegadas' }).click()
  await expect(page).toHaveURL(/\/processos$/)
})

test('usuário abre chamado de suporte e vê em "Meus chamados"', async ({ page }) => {
  await login(page, E2E_USERS.user)

  await page.getByRole('button', { name: 'Abrir suporte' }).click()
  await page
    .getByPlaceholder(/Descreva o problema/)
    .fill('E2E: o gráfico do dashboard não carrega no meu navegador.')
  await page.getByRole('button', { name: 'Enviar chamado' }).click()

  await expect(page.getByText('Chamado enviado. A equipe administrativa foi notificada.')).toBeVisible()
  await expect(
    page.getByText('E2E: o gráfico do dashboard não carrega no meu navegador.')
  ).toBeVisible()
})

test('admin vê o chamado em /admin/suporte e resolve (Suporte v2)', async ({ page }) => {
  await login(page, E2E_USERS.admin)

  await page.goto('/admin/suporte')
  await expect(
    page.getByText('E2E: o gráfico do dashboard não carrega no meu navegador.')
  ).toBeVisible()

  await page.getByRole('button', { name: 'Iniciar atendimento' }).click()

  // Ao virar em_andamento o ticket SAI do filtro "Abertos" (default) —
  // trocar pra aba "Em andamento" antes de resolver.
  await page.getByRole('tablist').getByRole('button', { name: 'Em andamento' }).click()
  await expect(
    page.getByText('E2E: o gráfico do dashboard não carrega no meu navegador.')
  ).toBeVisible()

  await page.getByRole('button', { name: 'Marcar como resolvido' }).click()

  await page.getByRole('tablist').getByRole('button', { name: 'Resolvidos' }).click()
  await expect(page.getByText(/Resolvido por Admin E2E/)).toBeVisible()
})
