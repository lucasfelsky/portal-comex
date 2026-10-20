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
// F2: shell — sidebar, topbar, abas do admin, gaveta, paleta, suporte).
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
const PHASE = process.env.REFINO_PHASE || 'f2'

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
      processNumber: 'PO 4500128734',
      processStatus: 'Aguardando Embarque',
      etd: dateKey(6),
      eta: dateKey(34),
      updatedAt: updatedAt(10),
    },
    {
      id: 'shot-embarcou',
      ...base,
      name: 'Solvente industrial — Ningbo',
      processNumber: 'PO 4500128801',
      processStatus: 'Embarcou',
      etd: dateKey(-12),
      eta: dateKey(9),
      shippedAt: dateKey(-12),
      etaOriginal: dateKey(6),
      updatedAt: updatedAt(20),
    },
    {
      id: 'shot-aguardando-atracacao',
      ...base,
      name: 'Pigmento orgânico — Hamburgo',
      processNumber: 'PO 4500128915',
      processStatus: 'Aguardando atracação',
      etd: dateKey(-25),
      eta: dateKey(2),
      shippedAt: dateKey(-25),
      updatedAt: updatedAt(30),
    },
    {
      id: 'shot-atracacao-confirmada',
      ...base,
      name: 'Aditivo plastificante — Antuérpia',
      processNumber: 'PO 4500129022',
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
      processNumber: 'PO 4500129133',
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
      processNumber: 'PO 4500129244',
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
      processNumber: 'PO 4500129355',
      processStatus: 'Coleta Agendada',
      etd: dateKey(-40),
      eta: dateKey(-9),
      shippedAt: dateKey(-40),
      berthed: true,
      berthedAt: `${dateKey(-9)}T07:30`,
      duimpStatus: 'Parametrizada',
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
      processNumber: 'PO 4500129466',
      processStatus: 'Carga recebida',
      etd: dateKey(-52),
      eta: dateKey(-20),
      shippedAt: dateKey(-52),
      berthed: true,
      berthedAt: `${dateKey(-20)}T11:00`,
      cargoReceivedAt: `${dateKey(-1)}T16:00`,
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
    favoriteProcessIds: ['shot-embarcou', 'shot-canal-vermelho'],
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
      await page.goto(screen.route)
      await expect(screen.ready(page)).toBeVisible({ timeout: 15_000 })
      if (screen.action) await screen.action(page)
      await page.waitForTimeout(800)
      await page.screenshot({ path: path.join(outDir, `${screen.name}-${theme}.png`), fullPage: true })
    }

    await context.close()
  })
}
