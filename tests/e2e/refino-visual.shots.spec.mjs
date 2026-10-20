// Capturas do refino visual (PLAN.md §1). NAO e teste de comportamento: gera
// PNGs a 1440x900 (full page) em `.agent-tmp/refino-shots/<fase>/<tela>-<light|dark>.png`
// para a comparacao lado a lado com os mock-ups e para o "ok" do Lucas.
//
// So roda com REFINO_SHOTS=1 (o job `e2e` do CI nao define a variavel, entao
// tudo abaixo e `skip` e nenhum seed e executado):
//   $env:REFINO_SHOTS='1'; npm run test:e2e
// (JDK 21; sobe auth/firestore/storage e o Vite apontando para os emuladores —
// nada toca producao.)
//
// Seed sintetico via REST do Firestore emulator (`Authorization: Bearer owner`,
// mesmo padrao de global-setup.mjs): processos em todos os status, canal
// Vermelho, ETA atualizada, inflamavel, dados pendentes, favoritos do admin,
// comunicados, barra, notificacoes, chamados e usuarios pendentes.
//
// Cada fase ACRESCENTA suas telas em PHASES (F1: login, dashboard, chegadas;
// F2: shell — sidebar, topbar, abas do admin, gaveta, paleta, suporte;
// F3: componentes e movimento — botoes, campos, chips, toast, vazio, skeleton,
// hover sem levantar, timeline + um catalogo de estados com asserts de CSS
// computado, ver o fim do arquivo; F4a: Dashboard — secoes com dados, estados
// carregando/erro/vazio, notebook, tablet e mobile).
// Uma tela pode ter `action(page)`: interacao depois do `ready` (abrir gaveta,
// paleta, modal) antes da captura.
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

test.skip(!process.env.REFINO_SHOTS, 'defina REFINO_SHOTS=1 para gerar as capturas do refino visual')

const AUTH_HOST = 'http://127.0.0.1:9099'
const FIRESTORE_HOST = 'http://127.0.0.1:8080'
const PROJECT_ID = 'demo-sqcomex'
const DOCS = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const OUT_ROOT = path.resolve(process.cwd(), '.agent-tmp', 'refino-shots')
const THEMES = ['light', 'dark']
const VIEWPORT = { width: 1440, height: 900 }

const shell = (page) => page.locator('.topbar').first()

// Telas por fase. `auth: false` = sem login (tela de acesso).
const PHASES = {
  f1: [
    { name: 'login', route: '/login', auth: false, ready: (page) => page.locator('.auth-screen--login').first() },
    { name: 'dashboard', route: '/', ready: (page) => page.getByRole('heading', { name: 'Visão geral' }) },
    { name: 'chegadas', route: '/processos', ready: (page) => page.locator('.process-list-card').first() },
    // Recolor das demais rotas (layout ainda antigo; prova que a paleta global nao quebrou nada).
    { name: 'noticias', route: '/news', ready: shell },
    { name: 'notificacoes', route: '/notifications', ready: shell },
    { name: 'admin-usuarios', route: '/admin/usuarios', ready: shell },
    { name: 'admin-comunicados', route: '/admin/comunicados', ready: shell },
    { name: 'admin-barra', route: '/admin/barra', ready: shell },
    { name: 'admin-previsoes', route: '/admin/previsoes', ready: shell },
    { name: 'admin-lead-time', route: '/admin/lead-time', ready: shell },
    { name: 'admin-suporte', route: '/admin/suporte', ready: shell },
    { name: '404', route: '/rota-que-nao-existe', ready: shell },
  ],
}
// Refino F2 (shell): as capturas mostram sidebar + topbar em todas as telas e
// os flutuantes abertos (gaveta, paleta, suporte, menu do usuario).
const dashboardReady = (page) => page.getByRole('heading', { name: 'Visão geral' })
PHASES.f2 = [
  { name: 'shell-dashboard', route: '/', ready: dashboardReady },
  { name: 'shell-chegadas', route: '/processos', ready: (page) => page.locator('.process-list-card').first() },
  {
    name: 'shell-detalhe-breadcrumb',
    route: '/processos',
    ready: (page) => page.locator('.process-list-card').first(),
    action: async (page) => {
      await page.locator('.process-item--button').first().click()
      await expect(page.locator('.topbar .breadcrumb')).toBeVisible()
    },
  },
  { name: 'shell-admin-usuarios', route: '/admin/usuarios', ready: shell },
  { name: 'shell-admin-barra', route: '/admin/barra', ready: shell },
  {
    name: 'gaveta-notificacoes',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await page.locator('.topbar .notifications__trigger').click()
      await expect(page.locator('.notifications__panel--drawer .notif-row').first()).toBeVisible()
    },
  },
  {
    name: 'paleta-busca',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await page.locator('.topbar__search').click()
      await page.getByLabel('Buscar comandos').fill('Solvente')
      await expect(page.locator('.command-palette__item--process').first()).toBeVisible({ timeout: 10_000 })
    },
  },
  {
    name: 'paleta-vazia',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await page.locator('.topbar__search').click()
      await expect(page.locator('.command-palette__item').first()).toBeVisible()
    },
  },
  {
    name: 'suporte-modal',
    route: '/processos',
    ready: (page) => page.locator('.process-list-card').first(),
    action: async (page) => {
      await page.getByRole('button', { name: 'Abrir suporte' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  {
    name: 'suporte-meus-chamados',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await page.getByRole('button', { name: 'Abrir suporte' }).click()
      await page.getByRole('button', { name: 'Meus chamados' }).click()
      await expect(page.getByRole('button', { name: 'Novo chamado' })).toBeVisible()
    },
  },
  {
    name: 'menu-usuario',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await page.locator('.topbar .topbar__user').click()
      await expect(page.getByRole('menu')).toBeVisible()
    },
  },
]
// Refino F3 (componentes e movimento): estados que aparecem nas paginas reais.
// `beforeGoto(page)` roda antes da navegacao (ex.: atrasar o Firestore para
// capturar o skeleton); `afterShot(page)` desfaz. As capturas usam movimento
// reduzido (instantaneo); o movimento em si e conferido pelos asserts de CSS
// computado do catalogo (fim do arquivo).
const delayProcessQueries = (ms) => async (page) => {
  await page.route('**/127.0.0.1:8080/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"collectionId":"processes"')) await new Promise((resolve) => setTimeout(resolve, ms))
    // O unroute da tela pode chegar antes do fim do atraso: ignora "already handled".
    await route.continue().catch(() => {})
  })
}
const failProcessQueries = async (page) => {
  await page.route('**/127.0.0.1:8080/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"collectionId":"processes"')) return route.abort('failed').catch(() => {})
    return route.continue().catch(() => {})
  })
}
const unrouteFirestore = (page) => page.unroute('**/127.0.0.1:8080/**')
const listReady = (page) => page.locator('.process-list-card').first()

PHASES.f3 = [
  { name: 'chegadas-botoes-campos', route: '/processos', ready: listReady },
  {
    name: 'chegadas-filtros-chips-foco',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      await page.getByLabel('Categoria').first().selectOption({ index: 1 })
      const search = page.locator('.process-filters__search')
      await search.fill('Resina')
      await expect(page.locator('.filter-chips-row .filter-chip').first()).toBeVisible()
      await search.focus()
    },
  },
  {
    name: 'chegadas-vazio',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      await page.locator('.process-filters__search').fill('zzzz-nao-existe')
      await expect(page.locator('.empty-state').first()).toBeVisible()
    },
  },
  {
    name: 'chegadas-hover-card',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      const row = page.locator('.process-item--button').nth(1)
      await expect(row).toBeVisible()
      await row.hover()
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'chegadas-foco-teclado-botao',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      await page.getByRole('button', { name: 'Novo processo' }).focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
    },
  },
  {
    name: 'chegadas-carregando-skeleton',
    route: '/processos',
    ready: listReady,
    beforeGoto: delayProcessQueries(6_000),
    afterShot: unrouteFirestore,
    action: async (page) => {
      await expect(page.locator('.process-card-skeleton').first()).toBeVisible()
    },
  },
  {
    name: 'dashboard-carregando-skeleton',
    route: '/',
    ready: dashboardReady,
    beforeGoto: delayProcessQueries(6_000),
    afterShot: unrouteFirestore,
    action: async (page) => {
      await expect(page.locator('.process-card-skeleton').first()).toBeVisible()
    },
  },
  {
    name: 'dashboard-erro-alerta-inline',
    route: '/',
    ready: dashboardReady,
    beforeGoto: failProcessQueries,
    afterShot: unrouteFirestore,
    action: async (page) => {
      await expect(page.locator('.error-banner--retry').first()).toBeVisible({ timeout: 15_000 })
    },
  },
  {
    name: 'toast-sucesso',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      await page.getByRole('button', { name: /^Exportar/ }).click()
      await expect(page.locator('.toast--success')).toBeVisible({ timeout: 15_000 })
    },
  },
  {
    name: 'toast-erro',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await page.getByRole('button', { name: 'Abrir suporte' }).click()
      await page.getByRole('dialog').locator('textarea').fill('Mensagem de teste para o toast de erro.')
      await page.context().setOffline(true)
      await page.getByRole('button', { name: 'Enviar chamado' }).click()
      await expect(page.locator('.toast--error')).toBeVisible({ timeout: 20_000 })
      await page.context().setOffline(false)
    },
  },
  {
    name: 'detalhe-timeline-favorito',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      await page.locator('.process-item--button').nth(1).click()
      await expect(page.locator('.process-detail-view .process-timeline')).toBeVisible()
    },
  },
  {
    name: 'detalhe-confirmar-excluir-destrutivo',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      await page.locator('.process-item--button').nth(1).click()
      await page.getByRole('button', { name: 'Mais ações' }).click()
      await page.getByRole('menuitem', { name: /Excluir processo/ }).click()
      await expect(page.locator('.confirm-dialog')).toBeVisible()
    },
  },
  {
    name: 'novo-processo-campos',
    route: '/processos',
    ready: listReady,
    action: async (page) => {
      await page.getByRole('button', { name: 'Novo processo' }).click()
      await expect(page.locator('.process-form').first()).toBeVisible()
    },
  },
  { name: 'admin-suporte-kpis-tags', route: '/admin/suporte', ready: shell },
  // Demais rotas: componentes globais (botoes, campos, tags, banners) em telas ainda
  // no layout antigo — prova de que o recolor/geometria da F3 nao quebrou nada.
  { name: 'dashboard', route: '/', ready: dashboardReady },
  { name: 'noticias', route: '/news', ready: shell },
  { name: 'notificacoes', route: '/notifications', ready: shell },
  { name: 'admin-usuarios', route: '/admin/usuarios', ready: shell },
  { name: 'admin-comunicados', route: '/admin/comunicados', ready: shell },
  { name: 'admin-barra', route: '/admin/barra', ready: shell },
  { name: 'admin-previsoes', route: '/admin/previsoes', ready: shell },
  { name: 'admin-lead-time', route: '/admin/lead-time', ready: shell },
  { name: '404', route: '/rota-que-nao-existe', ready: shell },
  { name: 'login-campos', route: '/login', auth: false, ready: (page) => page.locator('.auth-screen--login').first() },
]
// Refino F4a (Dashboard.dc.html): todas as secoes com dados, os 3 estados de cada
// uma (carregando, erro, vazio) e as viewports que NAO podem mudar de layout
// (notebook 1366x768 = modo compacto; tablet 900 e mobile 390 = arvore legada).
// `emptyDashboardQueries` responde 0 documentos para processos e comunicados
// (runQuery vazio) - o desktop mostra os 3 estados vazios do mock.
const emptyDashboardQueries = async (page) => {
  await page.route('**/127.0.0.1:8080/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"collectionId":"processes"') || body.includes('"collectionId":"announcements"')) {
      return route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ readTime: new Date().toISOString() }]),
        })
        .catch(() => {})
    }
    return route.continue().catch(() => {})
  })
}
const delayDashboardQueries = (ms) => async (page) => {
  await page.route('**/127.0.0.1:8080/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"collectionId":"processes"') || body.includes('"collectionId":"announcements"')) {
      await new Promise((resolve) => setTimeout(resolve, ms))
    }
    await route.continue().catch(() => {})
  })
}
const dashboardFull = async (page) => {
  await expect(page.locator('.dash-arrival').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.dash-fav').first()).toBeVisible()
  await expect(page.locator('.dash-announce--lead')).toBeVisible()
}
const resizeTo = (width, height) => async (page) => {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(400)
}
const restoreViewport = (page) => page.setViewportSize(VIEWPORT)

// A rolagem e do .main-content (nao da janela): fullPage nao alcanca o fim da
// pagina, entao as capturas do Dashboard usam viewport mais alta (1440x1000 = a
// prancheta do mock; 1440x1700 = pagina inteira, favoritos incluidos).
PHASES.f4a = [
  {
    name: 'dashboard',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await resizeTo(1440, 1000)(page)
      await dashboardFull(page)
    },
    afterShot: restoreViewport,
  },
  {
    name: 'dashboard-completo',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await resizeTo(1440, 1700)(page)
      await dashboardFull(page)
    },
    afterShot: restoreViewport,
  },
  {
    name: 'dashboard-hover-chegada-favorito',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await dashboardFull(page)
      await page.locator('.dash-arrival').nth(1).hover()
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'dashboard-foco-teclado',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await dashboardFull(page)
      await page.mouse.move(700, 880)
      await page.locator('.dash-arrival').first().focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(page.locator('.dash-arrival').first()).toBeFocused()
    },
  },
  {
    name: 'dashboard-carregando',
    route: '/',
    ready: dashboardReady,
    beforeGoto: delayDashboardQueries(6_000),
    afterShot: unrouteFirestore,
    action: async (page) => {
      await expect(page.locator('.dash-arrival--skeleton').first()).toBeVisible()
      await expect(page.locator('.dash-fav--skeleton').first()).toBeVisible()
    },
  },
  {
    name: 'dashboard-erro',
    route: '/',
    ready: dashboardReady,
    beforeGoto: failProcessQueries,
    afterShot: unrouteFirestore,
    action: async (page) => {
      await expect(page.locator('.dash-arrivals .error-banner--retry')).toBeVisible({ timeout: 15_000 })
    },
  },
  {
    name: 'dashboard-vazio',
    route: '/',
    ready: dashboardReady,
    beforeGoto: emptyDashboardQueries,
    afterShot: unrouteFirestore,
    action: async (page) => {
      await expect(page.locator('.dash-arrivals .empty-state')).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('.dash-announcements .empty-state')).toBeVisible()
      await expect(page.locator('.dash-favorites .empty-state')).toBeVisible()
    },
  },
  {
    name: 'dashboard-notebook-1366x768',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await resizeTo(1366, 768)(page)
      await dashboardFull(page)
    },
    afterShot: restoreViewport,
  },
  {
    name: 'dashboard-tablet-900',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await resizeTo(900, 1000)(page)
      await expect(page.locator('.dashboard-heading')).toBeVisible()
    },
    afterShot: restoreViewport,
  },
  {
    name: 'dashboard-mobile-390',
    route: '/',
    ready: dashboardReady,
    action: async (page) => {
      await resizeTo(390, 844)(page)
      await expect(page.locator('.dashboard-heading')).toBeVisible()
    },
    afterShot: restoreViewport,
  },
]
const PHASE = process.env.REFINO_PHASE || 'f4a'

// --- helpers de seed -------------------------------------------------------

// YYYY-MM-DD local manual (nunca toISOString: quebra em BRT).
function dateKey(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function fsValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } }
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fsValue(v)])) } }
  }
  return { stringValue: String(value) }
}

async function putDoc(collection, id, data) {
  const response = await fetch(`${DOCS}/${collection}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }),
  })
  if (!response.ok) throw new Error(`seed ${collection}/${id}: ${await response.text()}`)
}

async function patchFields(collection, id, data) {
  const mask = Object.keys(data)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&')
  const response = await fetch(`${DOCS}/${collection}/${id}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }),
  })
  if (!response.ok) throw new Error(`patch ${collection}/${id}: ${await response.text()}`)
}

async function uidOf({ email, password }) {
  const response = await fetch(
    `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )
  const payload = await response.json()
  if (!response.ok) throw new Error(`signIn ${email}: ${JSON.stringify(payload)}`)
  return payload.localId
}

function buildProcesses() {
  const base = {
    category: 'FCL',
    destination: 'ITAJAI',
    containerQuantity: 2,
    palletQuantity: 0,
    processNotes: '',
    carrierName: 'MSC',
    archived: false,
  }
  const updatedAt = (n) => isoMinutesAgo(n)
  return [
    {
      id: 'shot-aguardando-embarque',
      ...base,
      name: 'Resina epóxi — Shanghai',
      processNumber: '4500128734',
      processStatus: 'Aguardando Embarque',
      etd: dateKey(6),
      eta: dateKey(34),
      updatedAt: updatedAt(10),
    },
    {
      id: 'shot-embarcou',
      ...base,
      name: 'Solvente industrial — Ningbo',
      processNumber: '4500128801',
      processStatus: 'Embarcou',
      etd: dateKey(-12),
      eta: dateKey(9),
      shippedAt: dateKey(-12),
      etaOriginal: dateKey(6),
      warehouseDeliveryDateOverride: dateKey(4),
      updatedAt: updatedAt(20),
    },
    {
      id: 'shot-aguardando-atracacao',
      ...base,
      name: 'Pigmento orgânico — Hamburgo',
      processNumber: '4500128915',
      processStatus: 'Aguardando atracação',
      etd: dateKey(-25),
      eta: dateKey(2),
      shippedAt: dateKey(-25),
      warehouseDeliveryDateOverride: dateKey(5),
      updatedAt: updatedAt(30),
    },
    // Atrasado: ETA vencida sem sinal de chegada (aereo) com previsao de entrega na semana.
    {
      id: 'shot-atrasado',
      ...base,
      category: 'AEREO',
      containerQuantity: 0,
      name: 'Ácido cítrico anidro — Frankfurt',
      processNumber: '4500129355',
      processStatus: 'Embarcou',
      etd: dateKey(-9),
      eta: dateKey(-3),
      shippedAt: dateKey(-9),
      warehouseDeliveryDateOverride: dateKey(1),
      updatedAt: updatedAt(35),
    },
    {
      id: 'shot-atracacao-confirmada',
      ...base,
      name: 'Aditivo plastificante — Antuérpia',
      processNumber: '4500129022',
      processStatus: 'Atracação Confirmada',
      etd: dateKey(-30),
      eta: dateKey(0),
      shippedAt: dateKey(-30),
      berthed: true,
      berthedAt: `${dateKey(0)}T08:00`,
      dangerousGoods: true,
      imoClass: '3',
      unNumber: '1263',
      updatedAt: updatedAt(40),
    },
    {
      id: 'shot-duimp-registro',
      ...base,
      name: 'Catalisador — Houston',
      processNumber: '4500129133',
      processStatus: 'Aguardando registro da DUIMP',
      etd: dateKey(-33),
      eta: dateKey(-3),
      shippedAt: dateKey(-33),
      berthed: true,
      berthedAt: `${dateKey(-3)}T09:00`,
      updatedAt: updatedAt(50),
    },
    {
      id: 'shot-canal-vermelho',
      ...base,
      name: 'Silicone grau técnico — Xangai',
      processNumber: '4500129244',
      processStatus: 'Aguardando parametrização da DUIMP',
      etd: dateKey(-38),
      eta: dateKey(-6),
      shippedAt: dateKey(-38),
      berthed: true,
      berthedAt: `${dateKey(-6)}T10:00`,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Vermelho',
      updatedAt: updatedAt(60),
    },
    {
      id: 'shot-coleta-agendada',
      ...base,
      name: 'Emulsificante — Rotterdam',
      processNumber: '4500129355',
      processStatus: 'Coleta Agendada',
      etd: dateKey(-40),
      eta: dateKey(-9),
      shippedAt: dateKey(-40),
      berthed: true,
      berthedAt: `${dateKey(-9)}T07:30`,
      // valores longos de proposito: DUIMP + canal e anuencias ocupam a linha inteira do cartao
      duimpStatus: 'Parametrizada',
      licenses: [
        { id: 'lic-1', agency: 'MAPA', status: 'Deferida' },
        { id: 'lic-2', agency: 'ANVISA', status: 'Deferida' },
      ],
      parameterizationChannel: 'Verde',
      clearanceCompletedAt: `${dateKey(-5)}T14:00`,
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ id: 'w1', scheduledAt: `${dateKey(1)}T09:00`, notes: '' }],
      updatedAt: updatedAt(70),
    },
    {
      id: 'shot-carga-recebida',
      ...base,
      name: 'Antiespumante — Busan',
      processNumber: '4500129466',
      processStatus: 'Carga recebida',
      etd: dateKey(-52),
      eta: dateKey(-20),
      shippedAt: dateKey(-52),
      berthed: true,
      berthedAt: `${dateKey(-20)}T11:00`,
      cargoReceivedAt: `${dateKey(-1)}T16:00`,
      collectionStatus: 'Carga disponível em estoque',
      updatedAt: updatedAt(80),
    },
    // Dados pendentes: sem ETD/ETA nem transportadora.
    {
      id: 'shot-dados-pendentes',
      ...base,
      name: 'Surfactante — a definir',
      processNumber: '',
      carrierName: '',
      processStatus: 'Aguardando Embarque',
      etd: '',
      eta: '',
      updatedAt: updatedAt(90),
    },
  ]
}

async function seedAll() {
  const adminUid = await uidOf(E2E_USERS.admin)
  const processes = buildProcesses()
  for (const { id, ...data } of processes) await putDoc('processes', id, data)
  // 2 favoritos do admin
  await patchFields('users', adminUid, {
    favoriteProcessIds: ['shot-aguardando-atracacao', 'shot-coleta-agendada'],
  })

  const announcements = [
    {
      id: 'shot-ann-1',
      title: 'Janela de manutenção do sistema de câmbio',
      content: 'O sistema de câmbio ficará indisponível entre 22h e 23h desta sexta-feira. Planeje as remessas com antecedência.',
      channel: 'Banner interno',
      createdAt: isoMinutesAgo(90),
      updatedAt: isoMinutesAgo(90),
    },
    {
      id: 'shot-ann-2',
      title: 'Novo prazo de free time no terminal de Itajaí',
      content: 'O terminal passou a conceder 7 dias de free time para cargas de importação a partir do próximo mês.',
      channel: 'E-mail',
      createdAt: isoMinutesAgo(60 * 26),
      updatedAt: isoMinutesAgo(60 * 26),
    },
    {
      id: 'shot-ann-3',
      title: 'Reunião mensal de COMEX',
      content: 'A reunião mensal acontece na quinta-feira, às 10h, na sala de operações.',
      channel: 'Banner interno',
      createdAt: isoMinutesAgo(60 * 50),
      updatedAt: isoMinutesAgo(60 * 50),
    },
  ]
  for (const { id, ...data } of announcements) await putDoc('announcements', id, data)

  await putDoc('barra', 'current', {
    status: 'PRATICAVEL_RESTRICOES',
    notes: 'Restrição de calado para navios acima de 12 m.',
    updatedAt: isoMinutesAgo(25),
  })

  const notifications = [
    // Tipos REAIS emitidos pelo app (cobrem os 4 tons da gaveta: info/ok/warn/danger).
    ['process_question_answered', 'Nova resposta em Resina epóxi', 'Logística: coleta confirmada para amanhã às 09h.', 'shot-aguardando-embarque', false],
    ['favorite_process_updated', 'Status atualizado', 'Aguardando atracação → Atracação Confirmada.', 'shot-atracacao-confirmada', false],
    ['license_rejected', 'Anuência rejeitada', 'Silicone grau técnico: licença rejeitada pelo órgão anuente.', 'shot-canal-vermelho', false],
    ['collection_status_updated', 'Coleta agendada', 'Pigmento orgânico · janela de 08h às 12h.', 'shot-aguardando-atracacao', false],
    ['process_document_uploaded', 'Documento anexado', 'Solvente industrial · Packing List enviado.', 'shot-embarcou', true],
    ['process_question_created', 'Nova dúvida', 'Antiespumante: alguém perguntou sobre o ETA.', 'shot-carga-recebida', true],
  ]
  for (const [index, [type, title, body, processId, isRead]] of notifications.entries()) {
    await putDoc('notifications', `shot-notif-${index + 1}`, {
      recipientUserId: adminUid,
      actorUserId: 'shot-actor',
      actorName: 'Equipe COMEX',
      type,
      processId,
      messageId: '',
      title,
      body,
      targetTab: type === 'process_message' ? 'messages' : 'details',
      isRead,
      createdAt: isoMinutesAgo(15 + index * 55),
      readAt: isRead ? isoMinutesAgo(10) : null,
    })
  }

  const tickets = [
    ['aberto', 4, 'O filtro de ETA não considera o fuso horário.'],
    ['em_andamento', 3, 'Preciso exportar a lista de chegadas em planilha.'],
    ['resolvido', 2, 'Não consigo anexar o BL no processo.'],
  ]
  for (const [index, [status, priority, message]] of tickets.entries()) {
    await putDoc('supportTickets', `shot-ticket-${index + 1}`, {
      authorId: 'shot-user',
      authorName: 'Usuário E2E',
      authorEmail: E2E_USERS.user.email,
      message,
      imageUrls: [],
      status,
      priority,
      createdAt: isoMinutesAgo(60 * (index + 2)),
      updatedAt: isoMinutesAgo(60 * (index + 1)),
      contextPage: '/processos',
      replies: [],
    })
  }

  for (const [index, name] of ['Marina Souza', 'Rafael Lima'].entries()) {
    await putDoc('users', `shot-pending-${index + 1}`, {
      uid: `shot-pending-${index + 1}`,
      name,
      email: `pendente${index + 1}@sqquimica.com`,
      role: 'user',
      status: 'Pendente',
      statusTone: 'warn',
      area: index === 0 ? 'Comercial' : 'Logística',
      lastAccess: 'Aguardando aprovação',
      notes: 'Seed refino visual',
      favoriteProcessIds: [],
    })
  }
}

// --- capturas --------------------------------------------------------------

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({ timeout: 15_000 })
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await seedAll()
})

for (const theme of THEMES) {
  test(`capturas ${PHASE} - ${theme}`, async ({ browser }) => {
    test.setTimeout(180_000)
    const outDir = path.join(OUT_ROOT, PHASE)
    fs.mkdirSync(outDir, { recursive: true })

    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' })
    // Tema antes de qualquer navegacao (o script inline do index.html le o localStorage).
    await context.addInitScript((value) => {
      try {
        window.localStorage.setItem('pc-theme', value)
        // PTAX semeada: sem a callable (emuladores sem functions) o chip mostraria "--".
        window.localStorage.setItem(
          'sq-comex-ptax-rates',
          JSON.stringify({ usd: { sell: 5.4127 }, eur: { sell: 6.1234 } })
        )
      } catch {
        /* ignora */
      }
    }, theme)
    const page = await context.newPage()

    const screens = PHASES[PHASE] ?? []

    // 1) telas sem login primeiro
    for (const screen of screens.filter((s) => s.auth === false)) {
      await page.goto(screen.route)
      await expect(screen.ready(page)).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(600)
      await page.screenshot({ path: path.join(outDir, `${screen.name}-${theme}.png`), fullPage: true })
    }

    // 2) telas autenticadas (admin)
    await login(page, E2E_USERS.admin)
    for (const screen of screens.filter((s) => s.auth !== false)) {
      if (screen.beforeGoto) await screen.beforeGoto(page)
      await page.goto(screen.route)
      await expect(screen.ready(page)).toBeVisible({ timeout: 15_000 })
      if (screen.action) await screen.action(page)
      await page.waitForTimeout(800)
      await page.screenshot({ path: path.join(outDir, `${screen.name}-${theme}.png`), fullPage: true })
      if (screen.afterShot) await screen.afterShot(page)
    }

    await context.close()
  })
}

// =============================================================================
// F3 - catalogo de componentes (estados forcados via CDP) + CSS computado
// =============================================================================
// O catalogo monta, numa camada fixa sobre a app logada, as classes REAIS do app
// (.primary-button, .text-input, .filter-pill, .toast ...) na grade do
// Componentes.dc.html e forca :hover/:active/:focus por CDP (CSS.forcePseudoState).
// Depois le getComputedStyle e compara com o literal do mock (tema claro) e salva
// catalogo-componentes-<tema>.png. E a prova de "igual ao mock" que o reviewer
// confere sem precisar abrir o canvas.
const MOCK = {
  navy: 'rgb(0, 65, 83)',
  navy900: 'rgb(0, 50, 65)',
  navy50: 'rgb(232, 240, 242)',
  navy100: 'rgb(214, 227, 231)',
  ink: 'rgb(11, 36, 48)',
  mint: 'rgb(20, 221, 167)',
  mintHover: 'rgb(46, 232, 181)',
  mintActive: 'rgb(15, 185, 140)',
  danger: 'rgb(194, 54, 43)',
  dangerHover: 'rgb(168, 45, 35)',
  dangerActive: 'rgb(143, 37, 29)',
  disabledBg: 'rgb(227, 236, 234)',
  disabledInk: 'rgb(107, 127, 136)',
  border: 'rgb(213, 226, 222)',
  borderStrong: 'rgb(185, 203, 198)',
  control: 'rgb(107, 127, 136)',
  white: 'rgb(255, 255, 255)',
  bg: 'rgb(238, 242, 241)',
  transparent: 'rgba(0, 0, 0, 0)',
}

const ARRIVALS_PATH = 'M3 17h18l-2 3H5zM5 17V9h14v8M9 9V5h6v4'

function catalogHtml() {
  const states = ['rest', 'hover', 'active', 'focus', 'disabled']
  const types = [
    ['primary', 'Primário', 'Salvar'],
    ['secondary', 'Secundário', 'Exportar'],
    ['ghost', 'Fantasma', 'Cancelar'],
    ['danger', 'Destrutivo', 'Excluir'],
  ]
  const buttonRows = types
    .map(([type, label, text]) => {
      const cells = states
        .map((state) => {
          if (type === 'danger' && state === 'disabled') {
            return `<button type="button" class="danger-button" data-cat="danger-loading" aria-label="Excluindo"><span class="spinner" role="status" style="width:14px;height:14px;display:inline-block"><svg class="spinner__svg" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="9"/></svg></span>Carregando</button>`
          }
          return `<button type="button" class="${type}-button" data-cat="${type}-${state}"${state === 'disabled' ? ' disabled' : ''}>${text}</button>`
        })
        .join('')
      return `<span style="font-weight:700;font-size:12px">${label}</span>${cells}`
    })
    .join('')
  const head = `<span></span>${['Repouso', 'Hover', 'Pressionado', 'Foco', 'Desabilitado'].map((s) => `<span style="font-size:11px;color:var(--ink-soft)">${s}</span>`).join('')}`

  const pills = `
    <button type="button" class="filter-pill filter-pill--active" data-cat="pill-active"><span class="filter-pill__label">Todos</span><span class="filter-pill__count">48</span></button>
    <button type="button" class="filter-pill" data-cat="pill"><span class="filter-pill__label">Em trânsito</span><span class="filter-pill__count">17</span></button>
    <button type="button" class="filter-pill" data-cat="pill-alert"><span class="filter-pill__label">Docs pendentes</span><span class="filter-pill__count filter-pill__count--alert">3</span></button>
    <button type="button" class="filter-pill filter-pill--add" data-cat="pill-add"><span class="filter-pill__label">+ Filtro</span></button>`
  const chips = `
    <span class="filter-chip filter-chip--default filter-chip--md" data-cat="chip"><span class="filter-chip__label">Categoria: FCL</span><button type="button" class="filter-chip__remove" aria-label="Remover filtro Categoria" data-cat="chip-remove"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>
    <span class="filter-chip filter-chip--info filter-chip--md" data-cat="chip-info"><span class="filter-chip__label">Etapa: DUIMP pendente</span></span>`
  const tags = `
    <span class="status-tag status-tag--danger" data-cat="tag-danger">Carga inflamável</span>
    <span class="status-tag status-tag--warn" data-cat="tag-warn">Dados pendentes (2)</span>
    <span class="status-tag status-tag--neutral" data-cat="tag-neutral">MSC Aurora</span>
    <span class="status-tag status-tag--ok" data-cat="tag-ok">Canal verde</span>
    <span class="inline-badge" data-cat="badge">2 contêineres</span>`

  const skeleton = `
    <div class="process-card-skeleton" data-cat="skeleton-card"><div class="skeleton-process-card">
      <span class="skeleton" style="width:40%;height:12px;border-radius:6px"></span>
      <span class="skeleton" style="width:75%;height:18px;border-radius:6px"></span>
      <span class="skeleton" style="width:55%;height:12px;border-radius:6px"></span>
      <span class="skeleton skeleton-process-card__bar" style="width:100%;height:6px;border-radius:6px"></span>
      <span class="skeleton skeleton-process-card__pill" style="width:48%;height:26px;border-radius:999px"></span>
    </div></div>`

  return `
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start">
    <section style="grid-column:1 / -1;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:26px 28px;display:grid;gap:18px">
      <h2 style="margin:0;font-family:var(--font-heading);font-size:18px">Botões</h2>
      <div style="display:grid;grid-template-columns:96px repeat(5,minmax(140px,1fr));gap:10px 12px;align-items:center">${head}${buttonRows}</div>
    </section>
    <section style="background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:26px 28px;display:grid;gap:18px">
      <h2 style="margin:0;font-family:var(--font-heading);font-size:18px">Campos e filtros</h2>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px">
        <label class="field"><span data-cat="field-label">Número da PO</span><input class="text-input" data-cat="field-rest" placeholder="Ex.: 4500128734" /></label>
        <label class="field"><span>Contêiner</span><input class="text-input text-input--mono" data-cat="field-focus" value="MSCU 482913" /></label>
        <label class="field"><span>Data de devolução</span><input class="text-input" data-cat="field-error" value="31/02/2026" aria-invalid="true" /><small class="field-error" data-cat="field-error-msg">Data inválida. Use dd/mm/aaaa.</small></label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${pills}</div>
      <div class="filter-chips-row" style="margin:0"><span class="filter-chips-row__label">Filtros:</span>${chips}<button type="button" class="filter-chips-row__clear" data-cat="chips-clear">Limpar todos</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${tags}</div>
    </section>
    <section style="background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:26px 28px;display:grid;gap:14px">
      <h2 style="margin:0;font-family:var(--font-heading);font-size:18px">Feedback</h2>
      <div class="toast toast--success" role="status" data-cat="toast-success" style="max-width:none"><span class="toast__icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span><span class="toast__message">Documento enviado. A equipe COMEX foi avisada.</span><button type="button" class="toast__close" aria-label="Fechar">×</button></div>
      <div class="toast toast--error" role="alert" data-cat="toast-error" style="max-width:none"><span class="toast__icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5v6.5M12 17.5h.01"/></svg></span><span class="toast__message">Não foi possível salvar. Verifique a conexão.</span><button type="button" class="toast__close" aria-label="Fechar">×</button></div>
      <div class="error-banner error-banner--retry" role="alert" data-cat="banner-error"><span>Não foi possível salvar. Verifique a conexão e tente de novo.</span><button type="button" class="ghost-button" data-cat="banner-action">Tentar de novo</button></div>
      <div class="success-banner" data-cat="banner-success">Preferências salvas.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="empty-state" data-cat="empty"><svg class="icon empty-state__glyph" data-cat="empty-glyph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ARRIVALS_PATH}"/></svg><strong>Nenhuma chegada nesta semana</strong><p>Os próximos ETAs aparecem aqui assim que forem confirmados.</p></div>
        ${skeleton}
      </div>
      <div style="display:flex;align-items:center;gap:14px;padding-top:30px"><span class="tooltip tooltip--bottom" data-tooltip="Atualizado há 12 min pela ZP21" data-cat="tooltip" tabindex="0"><button type="button" class="ghost-button">Passe o mouse</button></span></div>
    </section>
  </div>`
}

// pseudo-estados a forcar: [seletor [data-cat], [pseudo...]]
const FORCED = [
  ['primary-hover', ['hover']],
  ['primary-active', ['hover', 'active']],
  ['primary-focus', ['focus', 'focus-visible']],
  ['secondary-hover', ['hover']],
  ['secondary-active', ['hover', 'active']],
  ['secondary-focus', ['focus', 'focus-visible']],
  ['ghost-hover', ['hover']],
  ['ghost-active', ['hover', 'active']],
  ['ghost-focus', ['focus', 'focus-visible']],
  ['danger-hover', ['hover']],
  ['danger-active', ['hover', 'active']],
  ['danger-focus', ['focus', 'focus-visible']],
  ['field-focus', ['focus']],
  ['tooltip', ['hover']],
]

async function mountCatalog(page, context) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({ timeout: 15_000 })
  await page.evaluate((html) => {
    const layer = document.createElement('div')
    layer.id = 'f3-catalog'
    layer.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;overflow:auto;box-sizing:border-box;padding:40px 48px;background:var(--bg);color:var(--ink);font-family:Manrope,system-ui,sans-serif'
    layer.innerHTML = html
    document.body.appendChild(layer)
  }, catalogHtml())
  const client = await context.newCDPSession(page)
  await client.send('DOM.enable')
  await client.send('CSS.enable')
  const { root } = await client.send('DOM.getDocument', { depth: -1 })
  for (const [cat, pseudo] of FORCED) {
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-cat="${cat}"]` })
    if (!nodeId) throw new Error(`catalogo sem [data-cat=${cat}]`)
    await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudo })
  }
  await page.waitForTimeout(500) // transicoes de 120/200 ms
}

// Estilo computado de [data-cat=cat] (ou do pseudo-elemento).
function computed(page, cat, props, pseudo = null) {
  return page.evaluate(
    ([c, p, ps]) => {
      const el = document.querySelector(`[data-cat="${c}"]`)
      const cs = getComputedStyle(el, ps)
      const out = Object.fromEntries(p.map((name) => [name, cs.getPropertyValue(name)]))
      if (!ps) {
        const r = el.getBoundingClientRect()
        out.__width = Math.round(r.width * 100) / 100
        out.__height = Math.round(r.height * 100) / 100
      }
      return out
    },
    [cat, props, pseudo]
  )
}

async function expectStyle(page, cat, expected, pseudo = null) {
  const got = await computed(page, cat, Object.keys(expected).filter((k) => !k.startsWith('__')), pseudo)
  const sizes = await computed(page, cat, [])
  for (const [prop, value] of Object.entries(expected)) {
    const actual = prop.startsWith('__') ? sizes[prop] : got[prop]
    if (value instanceof RegExp) expect(actual, `${cat} ${prop}`).toMatch(value)
    else expect(actual, `${cat} ${prop}`).toBe(value)
  }
}

for (const theme of THEMES) {
  test(`catalogo de componentes - ${theme}`, async ({ browser }) => {
    test.skip(PHASE !== 'f3', 'catalogo so na F3')
    test.setTimeout(120_000)
    const outDir = path.join(OUT_ROOT, 'f3')
    fs.mkdirSync(outDir, { recursive: true })
    // no-preference: o pressionado (scale .97) e as animacoes so existem fora do movimento reduzido.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1300 }, reducedMotion: 'no-preference' })
    await context.addInitScript((value) => {
      try {
        window.localStorage.setItem('pc-theme', value)
        window.localStorage.setItem('sq-comex-ptax-rates', JSON.stringify({ usd: { sell: 5.4127 }, eur: { sell: 6.1234 } }))
      } catch {
        /* ignora */
      }
    }, theme)
    const page = await context.newPage()
    await login(page, E2E_USERS.admin)
    await mountCatalog(page, context)

    if (theme === 'light') {
      const common = { __height: 44, 'border-top-left-radius': '12px', 'font-size': '14px', 'font-weight': '700' }
      // ---- botoes 4 x 5 estados (literais do Componentes.dc.html) ----
      await expectStyle(page, 'primary-rest', { ...common, 'background-color': MOCK.mint, color: MOCK.ink, 'border-top-width': '0px' })
      await expectStyle(page, 'primary-hover', {
        'background-color': MOCK.mintHover,
        'box-shadow': 'rgba(20, 221, 167, 0.35) 0px 6px 18px 0px',
      })
      await expectStyle(page, 'primary-active', { 'background-color': MOCK.mintActive, transform: 'matrix(0.97, 0, 0, 0.97, 0, 0)' })
      await expectStyle(page, 'primary-focus', {
        'background-color': MOCK.mint,
        'box-shadow': `${MOCK.white} 0px 0px 0px 3px, ${MOCK.navy} 0px 0px 0px 5px`,
      })
      await expectStyle(page, 'primary-disabled', { 'background-color': MOCK.disabledBg, color: MOCK.disabledInk, opacity: '1' })

      await expectStyle(page, 'secondary-rest', {
        ...common,
        'background-color': MOCK.white,
        color: MOCK.navy,
        'border-top-width': /^1(\.5)?px$/, // Chrome com DPR 1 arredonda 1.5px para 1px
        'border-top-color': MOCK.navy,
      })
      await expectStyle(page, 'secondary-hover', { 'background-color': MOCK.navy50, 'border-top-color': MOCK.navy })
      await expectStyle(page, 'secondary-active', {
        'background-color': MOCK.navy100,
        'border-top-color': MOCK.navy900,
        color: MOCK.navy,
        transform: 'matrix(0.97, 0, 0, 0.97, 0, 0)',
      })
      await expectStyle(page, 'secondary-focus', { 'box-shadow': `${MOCK.white} 0px 0px 0px 3px, ${MOCK.navy} 0px 0px 0px 5px` })
      await expectStyle(page, 'secondary-disabled', {
        'background-color': MOCK.white,
        'border-top-color': MOCK.border,
        color: MOCK.disabledInk,
      })

      await expectStyle(page, 'ghost-rest', { ...common, 'background-color': MOCK.transparent, color: MOCK.navy, 'border-top-width': '0px' })
      await expectStyle(page, 'ghost-hover', { 'background-color': MOCK.bg, color: MOCK.navy })
      await expectStyle(page, 'ghost-active', { 'background-color': MOCK.disabledBg, transform: 'matrix(0.97, 0, 0, 0.97, 0, 0)' })
      await expectStyle(page, 'ghost-focus', { 'box-shadow': `${MOCK.white} 0px 0px 0px 3px, ${MOCK.navy} 0px 0px 0px 5px` })
      await expectStyle(page, 'ghost-disabled', { 'background-color': MOCK.transparent, color: MOCK.disabledInk })

      await expectStyle(page, 'danger-rest', { ...common, 'background-color': MOCK.danger, color: MOCK.white })
      await expectStyle(page, 'danger-hover', { 'background-color': MOCK.dangerHover })
      await expectStyle(page, 'danger-active', { 'background-color': MOCK.dangerActive, transform: 'matrix(0.97, 0, 0, 0.97, 0, 0)' })
      await expectStyle(page, 'danger-focus', { 'box-shadow': `${MOCK.white} 0px 0px 0px 3px, ${MOCK.danger} 0px 0px 0px 5px` })
      // nenhum botao do catalogo corta o proprio conteudo (trilhos do arnes comportam o texto)
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll('#f3-catalog button[data-cat], #f3-catalog [data-cat] button')]
          .filter((b) => b.scrollWidth > b.clientWidth || b.scrollHeight > b.clientHeight)
          .map((b) => (b.dataset.cat || b.textContent).trim())
      )
      expect(clipped, 'botoes com conteudo cortado').toEqual([])
      const loading = await page.evaluate(() => {
        const b = document.querySelector('[data-cat="danger-loading"]')
        return { sw: b.scrollWidth, cw: b.clientWidth }
      })
      expect(loading.sw).toBeLessThanOrEqual(loading.cw)
      // carregando: spinner 14px + borda 2px (18px no total, como o span do mock), 0,8 s linear
      const spinner = await page.evaluate(() => {
        const s = document.querySelector('[data-cat="danger-loading"] .spinner')
        const cs = getComputedStyle(s)
        return {
          w: s.offsetWidth, // offsetWidth ignora a rotacao da animacao
          border: cs.borderTopWidth,
          top: cs.borderTopColor,
          duration: cs.animationDuration,
          timing: cs.animationTimingFunction,
          svg: getComputedStyle(s.querySelector('svg')).display,
        }
      })
      expect(spinner).toEqual({ w: 18, border: '2px', top: MOCK.white, duration: '0.8s', timing: 'linear', svg: 'none' })

      // ---- campos: repouso / foco / erro ----
      await expectStyle(page, 'field-rest', {
        __height: 44,
        'border-top-left-radius': '10px',
        'border-top-width': /^1(\.5)?px$/,
        'border-top-color': MOCK.control, // D1: #6b7f88 (o mock usa #9fb1b8, reprova WCAG 1.4.11)
        'font-size': '14px',
        'font-weight': '500',
        'padding-left': '14px',
        'background-color': MOCK.white,
        color: MOCK.ink,
      })
      await expectStyle(page, 'field-focus', {
        'border-top-color': MOCK.navy,
        'box-shadow': 'rgba(20, 221, 167, 0.28) 0px 0px 0px 4px',
        'font-family': /JetBrains Mono/,
      })
      await expectStyle(page, 'field-error', { 'border-top-color': MOCK.danger })
      await expectStyle(page, 'field-error-msg', { color: 'rgb(154, 42, 33)', 'font-size': '11px', 'font-weight': '600' })
      await expectStyle(page, 'field-label', { 'font-size': '13px', 'font-weight': '600', 'text-transform': 'none', color: MOCK.ink })

      // ---- chips e tags ----
      await expectStyle(page, 'pill-active', { __height: 36, 'background-color': MOCK.navy, color: MOCK.white, 'border-top-left-radius': '999px', 'font-size': '13px', 'font-weight': '600' })
      await expectStyle(page, 'pill', { __height: 36, 'background-color': MOCK.white, 'border-top-color': MOCK.border, color: MOCK.ink })
      await expectStyle(page, 'pill-add', { 'border-top-style': 'dashed', color: 'rgb(74, 100, 114)' })
      const count = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('[data-cat="pill-active"] .filter-pill__count'))
        return { size: cs.fontSize, family: cs.fontFamily, bg: cs.backgroundColor, pad: cs.paddingLeft }
      })
      expect(count.size).toBe('11px')
      expect(count.family).toMatch(/JetBrains Mono/)
      expect(count.bg).toBe('rgba(255, 255, 255, 0.18)')
      expect(count.pad).toBe('7px')
      // contador da pilula inativa: sem fundo nem padding (so o ativo tem a capsula)
      expect(
        await page.evaluate(() => {
          const cs = getComputedStyle(document.querySelector('[data-cat="pill"] .filter-pill__count'))
          return [cs.paddingLeft, cs.backgroundColor, cs.color]
        })
      ).toEqual(['0px', 'rgba(0, 0, 0, 0)', 'rgb(74, 100, 114)'])
      await expectStyle(page, 'chip', { __height: 32, 'background-color': MOCK.navy50, color: MOCK.navy, 'font-size': '13px', 'font-weight': '700', 'padding-left': '12px', 'padding-right': '6px' })
      await expectStyle(page, 'chip-info', { __height: 32, 'background-color': MOCK.navy50 }) // variantes semanticas seguem o mock? (so na linha de filtros)
      await expectStyle(page, 'chip-remove', { __width: 24, __height: 24 })
      await expectStyle(page, 'chips-clear', { color: 'rgb(154, 42, 33)', 'font-size': '13px', 'font-weight': '700' })
      await expectStyle(page, 'tag-danger', { __height: 26, 'background-color': 'rgb(253, 236, 234)', color: 'rgb(154, 42, 33)', 'font-size': '12px', 'font-weight': '700', 'padding-left': '10px' })
      await expectStyle(page, 'tag-warn', { __height: 26, 'background-color': 'rgb(253, 243, 220)', color: 'rgb(138, 90, 10)' })
      await expectStyle(page, 'tag-neutral', { __height: 26, 'background-color': 'rgb(236, 239, 240)', color: 'rgb(71, 88, 97)' })
      await expectStyle(page, 'badge', { __height: 26, 'padding-left': '10px', 'font-size': '12px' })

      // ---- feedback ----
      await expectStyle(page, 'toast-success', {
        'background-color': MOCK.ink,
        color: 'rgb(232, 244, 246)',
        'border-top-left-radius': '14px',
        'padding-top': '14px',
        'padding-left': '16px',
        'font-size': '14px',
        'font-weight': '600',
        'box-shadow': 'rgba(0, 65, 83, 0.18) 0px 20px 48px 0px',
      })
      const toastIcons = await page.evaluate(() =>
        ['success', 'error'].map((t) => {
          const i = document.querySelector(`[data-cat="toast-${t}"] .toast__icon`)
          const cs = getComputedStyle(i)
          return { w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, r: cs.borderTopLeftRadius, bg: cs.backgroundColor, color: cs.color }
        })
      )
      expect(toastIcons[0]).toEqual({ w: 28, h: 28, r: '999px', bg: MOCK.mint, color: MOCK.ink })
      expect(toastIcons[1]).toEqual({ w: 28, h: 28, r: '999px', bg: MOCK.danger, color: MOCK.white })
      await expectStyle(page, 'banner-error', { 'background-color': 'rgb(253, 236, 234)', color: 'rgb(154, 42, 33)', 'border-top-left-radius': '14px', 'font-size': '14px', 'font-weight': '600' })
      await expectStyle(page, 'banner-error', { width: '20px', height: '20px' }, '::before')
      await expectStyle(page, 'banner-action', { 'text-decoration-line': 'underline', 'font-size': '13px', 'font-weight': '700' })
      await expectStyle(page, 'banner-success', { 'background-color': 'rgb(226, 246, 240)', color: 'rgb(0, 96, 79)' })
      await expectStyle(page, 'empty', {
        'border-top-style': 'dashed',
        'border-top-width': '1px',
        'border-top-color': MOCK.borderStrong,
        'border-top-left-radius': '16px',
        'padding-top': '22px',
        'text-align': 'center',
      })
      await expectStyle(page, 'empty-glyph', { __width: 40, __height: 40, color: 'rgb(0, 120, 100)', 'stroke-width': '1.5px' })
      const empty = await page.evaluate(() => {
        const e = document.querySelector('[data-cat="empty"]')
        const t = getComputedStyle(e.querySelector('strong'))
        const p = getComputedStyle(e.querySelector('p'))
        return { t: [t.fontSize, t.fontWeight], p: [p.fontSize, p.lineHeight, p.color] }
      })
      expect(empty.t).toEqual(['14px', '700'])
      expect(empty.p).toEqual(['12px', '18px', 'rgb(74, 100, 114)'])
      // skeleton: shimmer 1,4 s linear infinito, gradiente base -> shine -> base, 200% 100%
      const skeleton = await page.evaluate(() => {
        const pieces = [...document.querySelectorAll('[data-cat="skeleton-card"] .skeleton')]
        const first = getComputedStyle(pieces[0])
        const card = getComputedStyle(document.querySelector('[data-cat="skeleton-card"]'))
        return {
          heights: pieces.map((p) => Math.round(p.getBoundingClientRect().height)),
          name: first.animationName,
          duration: first.animationDuration,
          timing: first.animationTimingFunction,
          iterations: first.animationIterationCount,
          size: first.backgroundSize,
          image: first.backgroundImage,
          cardBg: card.backgroundColor,
          cardRadius: card.borderTopLeftRadius,
          cardPad: card.paddingTop,
        }
      })
      expect(skeleton.heights).toEqual([12, 18, 12, 6, 26])
      expect(skeleton.name).toBe('motion-shimmer')
      expect(skeleton.duration).toBe('1.4s')
      expect(skeleton.timing).toBe('linear')
      expect(skeleton.iterations).toBe('infinite')
      expect(skeleton.size).toBe('200% 100%')
      expect(skeleton.image).toContain('rgb(227, 236, 234)')
      expect(skeleton.image).toContain('rgb(247, 250, 249)')
      expect(skeleton.cardBg).toBe('rgb(245, 248, 247)')
      expect([skeleton.cardRadius, skeleton.cardPad]).toEqual(['16px', '18px'])
      // tooltip (hover forcado no wrapper)
      await expectStyle(
        page,
        'tooltip',
        {
          'background-color': MOCK.ink,
          color: 'rgb(232, 244, 246)',
          'font-size': '12px',
          'font-weight': '600',
          'border-top-left-radius': '10px',
          'padding-top': '8px',
          'padding-left': '12px',
          opacity: '1',
        },
        '::after'
      )
    } else {
      // dark (o mock nao define): so o essencial de legibilidade e a troca navy -> menta
      await expectStyle(page, 'primary-rest', { 'background-color': MOCK.mint, color: MOCK.ink })
      await expectStyle(page, 'primary-focus', { 'box-shadow': /rgb\(15, 43, 53\) 0px 0px 0px 3px, rgb\(20, 221, 167\) 0px 0px 0px 5px/ })
      await expectStyle(page, 'secondary-rest', { color: MOCK.mint, 'border-top-color': MOCK.mint })
      await expectStyle(page, 'ghost-rest', { color: MOCK.mint })
      await expectStyle(page, 'primary-disabled', { 'background-color': 'rgb(22, 56, 69)', color: 'rgb(122, 154, 166)' })
      await expectStyle(page, 'field-focus', { 'border-top-color': MOCK.mint })
      await expectStyle(page, 'toast-success', { 'background-color': 'rgb(22, 56, 69)', 'border-top-width': '0px', 'border-left-width': '0px' })
      await expectStyle(page, 'pill-active', { 'background-color': MOCK.mint })
    }

    await page.screenshot({ path: path.join(outDir, `catalogo-componentes-${theme}.png`) })
    await context.close()
  })
}

// =============================================================================
// F3 - movimento (CSS computado em paginas reais; movimento NAO reduzido)
// =============================================================================
const E = 'cubic-bezier(0.4, 0, 0.2, 1)' // --ease-out
const E_IN = 'cubic-bezier(0.4, 0, 1, 1)' // --ease-in
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)' // --ease-spring

async function newMotionContext(browser, reducedMotion) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion })
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('pc-theme', 'light')
      window.localStorage.setItem('sq-comex-ptax-rates', JSON.stringify({ usd: { sell: 5.4127 }, eur: { sell: 6.1234 } }))
    } catch {
      /* ignora */
    }
  })
  return context
}

const anim = (page, selector, index = 0, pseudo = null) =>
  page.evaluate(
    ([sel, i, ps]) => {
      const el = document.querySelectorAll(sel)[i]
      if (!el) return null
      const cs = getComputedStyle(el, ps)
      return {
        name: cs.animationName,
        duration: cs.animationDuration,
        delay: cs.animationDelay,
        timing: cs.animationTimingFunction,
        fill: cs.animationFillMode,
      }
    },
    [selector, index, pseudo]
  )

test('movimento (CSS computado) - duracoes e curvas do Movimento.dc.html', async ({ browser }) => {
  test.skip(PHASE !== 'f3', 'movimento so na F3')
  test.setTimeout(180_000)
  const context = await newMotionContext(browser, 'no-preference')
  const page = await context.newPage()
  await login(page, E2E_USERS.admin)

  // 1) Entrada de pagina 500 ms + lista escalonada 300 ms (+40 ms, so os 8 primeiros) + contador de KPI
  await page.evaluate(() => window.sessionStorage.clear())
  await page.goto('/')
  const series = await page.evaluate(async () => {
    const out = []
    const t0 = performance.now()
    while (performance.now() - t0 < 4000) {
      out.push({ t: Math.round(performance.now() - t0), v: [...document.querySelectorAll('.stat-card__value')].map((el) => el.textContent) })
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return out
  })
  const page1 = await anim(page, '.page-fade--visible')
  expect(page1).toMatchObject({ name: 'motion-rise', duration: '0.5s', timing: E, fill: 'both' })
  const stagger = await page.evaluate(() =>
    [...document.querySelectorAll('.stagger__item')].map((el) => {
      const cs = getComputedStyle(el)
      return [el.style.getPropertyValue('--stagger-index'), cs.animationName, cs.animationDuration, cs.animationDelay, cs.animationTimingFunction]
    })
  )
  expect(stagger.length).toBeGreaterThanOrEqual(2)
  stagger.forEach(([idx, name, duration, delay, timing]) => {
    expect(name).toBe('motion-rise')
    expect(duration).toBe('0.3s')
    expect(timing).toBe(E)
    expect(delay).toBe(`${Math.min(Number(idx), 7) * 0.04}s`.replace(/^0s$/, '0s'))
  })
  // contador: sobe de 0 ao valor final em ~600 ms e nunca desce
  const numeric = series.filter((s) => s.v.some((x) => /^\d+$/.test(x)))
  expect(numeric.length).toBeGreaterThan(3)
  const col = series.map((s) => s.v.map((x) => (/^\d+$/.test(x) ? Number(x) : null)))
  const best = [0, 1, 2, 3].sort((a, b) => Math.max(...col.map((r) => r[b] ?? 0)) - Math.max(...col.map((r) => r[a] ?? 0)))[0]
  const values = col.map((r) => r[best]).filter((v) => v !== null && v !== undefined)
  const finalValue = values[values.length - 1]
  expect(finalValue).toBeGreaterThan(1)
  expect(values[0]).toBeLessThanOrEqual(Math.ceil(finalValue * 0.3))
  for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
  const firstNumericAt = series.find((s) => /^\d+$/.test(s.v[best])).t
  const reachedAt = series.find((s) => s.v[best] === String(finalValue)).t
  expect(reachedAt - firstNumericAt).toBeGreaterThan(300)
  expect(reachedAt - firstNumericAt).toBeLessThan(1100)
  expect(await page.evaluate(() => window.sessionStorage.getItem('pc-kpi-countup'))).toBe('1')
  // 2a carga da sessao: valor direto (sem contar)
  await page.goto('/')
  await expect(page.locator('.stat-card__value').first()).toHaveText(/^\d+$/, { timeout: 15_000 })
  const instant = await page.locator('.stat-card__value').allTextContents()
  expect(instant.some((v) => Number(v) === finalValue)).toBe(true)

  // 2) Pressionar: scale(.97) em 120 ms; hover do card so troca sombra/borda em 200 ms (sem levantar)
  await page.goto('/processos')
  await expect(page.locator('.process-item--button').first()).toBeVisible()
  const primary = page.getByRole('button', { name: 'Novo processo' })
  const box = await primary.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(250)
  const pressed = await primary.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { transform: cs.transform, td: cs.transitionDuration, tp: cs.transitionProperty }
  })
  expect(pressed.transform).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)')
  expect(pressed.tp).toContain('transform')
  expect(pressed.td.split(', ')).toContain('0.12s')
  // solta fora do botao: so queremos medir o pressionado, sem disparar o clique (abriria o formulario)
  await page.mouse.move(5, 5)
  await page.mouse.up()
  const card = page.locator('.process-item--button').nth(1)
  await card.hover()
  await page.waitForTimeout(400)
  const hover = await card.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { transform: cs.transform, shadow: cs.boxShadow, border: cs.borderTopColor, tp: cs.transitionProperty, td: cs.transitionDuration, tf: cs.transitionTimingFunction }
  })
  expect(hover.transform).toBe('none')
  expect(hover.shadow).toBe('rgba(0, 65, 83, 0.1) 0px 6px 18px 0px')
  expect(hover.border).toBe('rgb(185, 203, 198)')
  expect(hover.tp).not.toContain('transform')
  expect(hover.tp).toContain('box-shadow')
  expect(hover.tp).toContain('border-color')
  expect(hover.td.split(', ')).toContain('0.2s')
  expect(hover.tf).toContain(E)

  // 3) Favorito: scale(0 -> 1) em 300 ms com mola, so ao ativar
  // (a linha inteira tambem e role=button e herda o nome: usar a classe do botao de icone)
  const star = await page.locator('.action-icon-button[aria-label="Favoritar processo"]').first().elementHandle()
  await star.click()
  await expect(page.locator('.favorite-star--pop')).toHaveCount(1)
  const pop = await anim(page, '.favorite-star--pop')
  expect(pop).toMatchObject({ name: 'motion-pop', duration: '0.3s', timing: SPRING })
  await star.click() // desfavorita: sem animacao (restaura o seed)
  await page.waitForTimeout(600)
  await expect(page.locator('.favorite-star--pop')).toHaveCount(0)

  // 4) Timeline: preenche em 600 ms (segmentos em sequencia) e pontos com mola 100 + 150 ms * posicao
  await page.locator('.process-item--button').nth(1).click()
  await expect(page.locator('.process-detail-view .process-timeline')).toBeVisible()
  const timeline = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('.process-detail-view .process-timeline__bar--done')]
    const nodes = [...document.querySelectorAll('.process-detail-view .process-timeline__node--done, .process-detail-view .process-timeline__node--now')]
    const sec = (v) => parseFloat(v)
    return {
      fill: bars.map((b) => {
        const cs = getComputedStyle(b, '::after')
        return { name: cs.animationName, d: sec(cs.animationDuration), delay: sec(cs.animationDelay), timing: cs.animationTimingFunction, origin: cs.transformOrigin }
      }),
      dots: nodes.map((n) => {
        const cs = getComputedStyle(n)
        return { name: cs.animationName, d: cs.animationDuration, delay: sec(cs.animationDelay), timing: cs.animationTimingFunction }
      }),
    }
  })
  expect(timeline.fill.length).toBeGreaterThan(0)
  const fillEnd = Math.max(...timeline.fill.map((f) => f.d + f.delay))
  expect(Math.abs(fillEnd - 0.6)).toBeLessThan(0.002) // o trilho todo termina em 600 ms
  timeline.fill.forEach((f) => expect(f.name).toBe('motion-fill'))
  timeline.dots.forEach((d, i) => {
    expect(d.name).toBe('motion-pop')
    expect(d.d).toBe('0.3s')
    expect(d.timing).toBe(SPRING)
    expect(Math.abs(d.delay - (0.1 + 0.15 * i))).toBeLessThan(0.002)
  })

  // 5) Toast: mola de 300 ms, 5 s, pausa com o mouse, saida de 200 ms ease-in
  await page.goto('/processos')
  await expect(page.locator('.process-item--button').first()).toBeVisible()
  await page.getByRole('button', { name: /^Exportar/ }).click()
  const toast = page.locator('.toast--success')
  await expect(toast).toBeVisible({ timeout: 15_000 })
  expect(await anim(page, '.toast--success')).toMatchObject({ name: 'motion-toast-in', duration: '0.3s', timing: SPRING })
  await toast.hover()
  await page.waitForTimeout(6_000) // > 5 s: pausado, continua na tela
  await expect(toast).toBeVisible()
  await page.mouse.move(5, 5)
  await expect(toast).toBeHidden({ timeout: 8_000 })
  await page.getByRole('button', { name: /^Exportar/ }).click()
  await expect(page.locator('.toast--success')).toBeVisible({ timeout: 15_000 })
  await page.locator('.toast--success .toast__close').click()
  expect(await anim(page, '.toast--closing')).toMatchObject({ name: 'motion-toast-out', duration: '0.2s', timing: E_IN })

  // 6) Gaveta (300 ms ease-out / scrim 200 ms linear) e modal (300 ms) — saidas ~70%
  await page.locator('.topbar .notifications__trigger').click()
  await expect(page.locator('.notifications__panel--drawer')).toBeVisible()
  const drawer = await anim(page, '.notifications__panel--drawer')
  expect(drawer).toMatchObject({ name: 'notif-drawer-in', duration: '0.3s', timing: E })
  expect(await anim(page, '.notifications-backdrop')).toMatchObject({ name: 'motion-fade-in', duration: '0.2s', timing: 'linear' })
  await page.keyboard.press('Escape')
  const drawerOut = await anim(page, '.notifications__panel--closing')
  expect(drawerOut).toMatchObject({ name: 'notif-drawer-out', duration: '0.21s', timing: E_IN })
  expect(await anim(page, '.notifications-backdrop--closing')).toMatchObject({ name: 'motion-fade-out', duration: '0.14s', timing: E_IN })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Abrir suporte' }).click()
  await expect(page.locator('.support-modal--desktop, .modal').first()).toBeVisible()
  expect(await anim(page, '.modal-backdrop')).toMatchObject({ name: 'motion-fade-in', duration: '0.2s', timing: 'linear' })
  expect(await anim(page, '.modal')).toMatchObject({ name: 'motion-rise', duration: '0.3s', timing: E })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // 7) Skeleton: shimmer 1,4 s e troca por fade de 200 ms
  await page.route('**/127.0.0.1:8080/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"collectionId":"processes"')) await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.continue().catch(() => {})
  })
  await page.goto('/processos')
  await expect(page.locator('.process-card-skeleton .skeleton').first()).toBeVisible()
  expect(await anim(page, '.process-card-skeleton .skeleton')).toMatchObject({ name: 'motion-shimmer', duration: '1.4s', timing: 'linear' })
  await expect(page.locator('.process-item--button').first()).toBeVisible({ timeout: 15_000 })
  expect(await anim(page, '.process-list--scroll.skeleton-reveal')).toMatchObject({ name: 'motion-fade-in', duration: '0.2s', timing: 'linear' })
  await page.unroute('**/127.0.0.1:8080/**')

  await context.close()
})

test('movimento reduzido (CSS computado) - so fades de 150 ms, sem contador, escalonamento nem shimmer', async ({ browser }) => {
  test.skip(PHASE !== 'f3', 'movimento so na F3')
  test.setTimeout(120_000)
  const context = await newMotionContext(browser, 'reduce')
  const page = await context.newPage()
  await login(page, E2E_USERS.admin)
  await page.evaluate(() => window.sessionStorage.clear())
  await page.goto('/')
  await expect(page.locator('.stat-card__value').first()).toHaveText(/^\d+$/, { timeout: 15_000 })
  // sem contador: o primeiro valor numerico ja e o final
  const first = await page.locator('.stat-card__value').allTextContents()
  await page.waitForTimeout(900)
  expect(await page.locator('.stat-card__value').allTextContents()).toEqual(first)
  expect(await anim(page, '.page-fade--visible')).toMatchObject({ name: 'motion-fade-in', duration: '0.15s', timing: 'linear' })
  const delays = await page.evaluate(() =>
    [...document.querySelectorAll('.stagger__item')].map((el) => {
      const cs = getComputedStyle(el)
      return [cs.animationName, cs.animationDuration, cs.animationDelay]
    })
  )
  delays.forEach((d) => expect(d).toEqual(['motion-fade-in', '0.15s', '0s']))

  await page.goto('/processos')
  await expect(page.locator('.process-item--button').first()).toBeVisible()
  await page.getByRole('button', { name: /^Exportar/ }).click()
  await expect(page.locator('.toast--success')).toBeVisible({ timeout: 15_000 })
  expect((await anim(page, '.toast--success')).name).toBe('none')
  const primary = page.getByRole('button', { name: 'Novo processo' })
  const box = await primary.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(250)
  expect(await primary.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  await page.mouse.move(5, 5)
  await page.mouse.up()

  await page.locator('.process-item--button').nth(1).click()
  await expect(page.locator('.process-detail-view .process-timeline')).toBeVisible()
  const fade = await anim(page, '.process-detail-view .process-timeline__bar--done', 0, '::after')
  expect(fade).toMatchObject({ name: 'motion-fade-in', duration: '0.15s', delay: '0s' })

  await page.route('**/127.0.0.1:8080/**', async (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('"collectionId":"processes"')) await new Promise((resolve) => setTimeout(resolve, 2500))
    await route.continue().catch(() => {})
  })
  await page.goto('/processos')
  await expect(page.locator('.process-card-skeleton .skeleton').first()).toBeVisible()
  expect((await anim(page, '.process-card-skeleton .skeleton')).name).toBe('none')
  await page.unroute('**/127.0.0.1:8080/**')
  await context.close()
})
