// QA geometrico de responsividade do desktop (PLAN.md "QA de responsividade").
// NAO e teste de comportamento de produto: mede a geometria real (Chromium) do
// shell em viewports de notebook/desktop e falha se a topbar quebrar de linha,
// o titulo for cortado, as abas do Admin quebrarem, o FAB de Suporte voltar ou
// o "Sair" reaparecer no rodape da sidebar.
//
// So roda com QA_RESP=1 (o job `e2e` do CI nao define a variavel, entao tudo
// abaixo e `skip` e nenhum seed e executado):
//   $env:QA_RESP='1'
//   node scripts/with-jdk.mjs node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,storage --project demo-sqcomex "npx playwright test qa-responsividade"
// Capturas (nao sao gate): .agent-tmp/qa-resp/after/<viewport>/<rota>-<tema>.png
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

test.skip(!process.env.QA_RESP, 'defina QA_RESP=1 para rodar o QA geometrico de responsividade')

const AUTH_HOST = 'http://127.0.0.1:9099'
const FIRESTORE_HOST = 'http://127.0.0.1:8080'
const PROJECT_ID = 'demo-sqcomex'
const DOCS = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const OUT_ROOT = path.resolve(process.cwd(), '.agent-tmp', 'qa-resp', 'after')

const LIGHT_VIEWPORTS = [
  [1041, 800],
  [1093, 533],
  [1200, 800],
  [1280, 552],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
]
const DARK_VIEWPORTS = [
  [1093, 533],
  [1440, 900],
]
const ROUTES = [
  { route: '/', key: 'dashboard' },
  { route: '/processos', key: 'processos' },
  { route: '/news', key: 'news' },
  { route: '/notifications', key: 'notifications' },
  { route: '/admin/usuarios', key: 'admin-usuarios' },
  { route: '/admin/comunicados', key: 'admin-comunicados' },
  { route: '/admin/lead-time', key: 'admin-lead-time' },
  { route: '/admin/suporte', key: 'admin-suporte' },
]

// --- seed minimo via REST do emulador (copiado de refino-visual.shots.spec.mjs) ---

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

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

// YYYY-MM-DD manual em horario local (nunca toISOString: quebra em BRT).
function dateKey(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function seed() {
  const adminUid = await uidOf(E2E_USERS.admin)
  const base = {
    category: 'FCL',
    destination: 'ITAJAI',
    containerQuantity: 2,
    palletQuantity: 0,
    processNotes: '',
    carrierName: 'MSC',
    archived: false,
  }
  const processes = [
    ['qa-1', 'Resina epóxi — Shanghai', '4500128734', 'Aguardando Embarque', 6, 34],
    ['qa-2', 'Solvente industrial — Ningbo', '4500128801', 'Embarcou', -12, 9],
    ['qa-3', 'Pigmento orgânico — Hamburgo', '4500128915', 'Aguardando atracação', -25, 2],
    ['qa-4', 'Aditivo plastificante — Antuérpia', '4500129022', 'Atracação Confirmada', -30, 0],
    ['qa-5', 'Ácido cítrico anidro — Frankfurt', '4500129355', 'Embarcou', -9, 3],
    ['qa-6', 'Silicone grau técnico — Busan', '4500129411', 'Aguardando Embarque', 12, 40],
  ]
  for (const [index, [id, name, processNumber, processStatus, etd, eta]] of processes.entries()) {
    await putDoc('processes', id, {
      ...base,
      name,
      processNumber,
      processStatus,
      etd: dateKey(etd),
      eta: dateKey(eta),
      updatedAt: isoMinutesAgo(10 + index * 7),
    })
  }
  await putDoc('announcements', 'qa-ann-1', {
    title: 'Janela de manutenção do sistema de câmbio',
    content: 'O sistema de câmbio ficará indisponível entre 22h e 23h desta sexta-feira.',
    channel: 'Banner interno',
    createdAt: isoMinutesAgo(90),
    updatedAt: isoMinutesAgo(90),
  })
  await putDoc('notifications', 'qa-notif-1', {
    recipientUserId: adminUid,
    actorUserId: 'qa-actor',
    actorName: 'Equipe COMEX',
    type: 'process_question_answered',
    processId: 'qa-1',
    messageId: '',
    title: 'Nova resposta em Resina epóxi',
    body: 'Logística: coleta confirmada para amanhã às 09h.',
    targetTab: 'details',
    isRead: false,
    createdAt: isoMinutesAgo(15),
    readAt: null,
  })
  await putDoc('supportTickets', 'qa-ticket-1', {
    authorId: 'qa-user',
    authorName: 'Usuário E2E',
    authorEmail: E2E_USERS.user.email,
    message: 'QA: o filtro de ETA não considera o fuso horário.',
    imageUrls: [],
    status: 'aberto',
    priority: 3,
    createdAt: isoMinutesAgo(120),
    updatedAt: isoMinutesAgo(60),
    contextPage: '/processos',
    replies: [],
  })
}

// --- navegacao -------------------------------------------------------------

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({ timeout: 15_000 })
}

// --- medida (roda no navegador) ----------------------------------------------

function measure(page) {
  return page.evaluate(() => {
    const isVis = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      const cs = getComputedStyle(el)
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
    }
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
    }
    const de = document.documentElement
    const out = {
      vw: window.innerWidth,
      vh: window.innerHeight,
      docScrollW: de.scrollWidth,
      docClientW: de.clientWidth,
    }
    const main = document.querySelector('.main-content')
    if (main) out.main = { sw: main.scrollWidth, cw: main.clientWidth }

    const topbar = document.querySelector('.topbar')
    if (topbar) {
      out.topbarHeight = topbar.getBoundingClientRect().height
      const parts = [
        ['heading', topbar.querySelector('.topbar__title-wrap')],
        ['busca', topbar.querySelector('.topbar__search')],
        ['ptax', topbar.querySelector('.topbar__ptax')],
        ['sino', topbar.querySelector('.notifications__trigger')],
        ['usuario', topbar.querySelector('.topbar__user')],
      ]
      out.topbarParts = parts
        .filter(([, el]) => el && isVis(el))
        .map(([name, el]) => ({ name, ...rect(el) }))
    }

    const title = document.querySelector('.topbar__title')
    out.title = title && isVis(title) ? { text: title.textContent.trim(), sw: title.scrollWidth, cw: title.clientWidth } : null

    const tabs = document.querySelector('.admin-tabs--desktop')
    if (tabs && isVis(tabs)) {
      const nav = rect(tabs)
      const items = [...tabs.querySelectorAll('.admin-tab')].filter(isVis)
      const active = tabs.querySelector('.admin-tab.tab-button--active')
      out.adminTabs = {
        nav,
        tops: items.map((el) => el.getBoundingClientRect().top),
        active: active && isVis(active) ? rect(active) : null,
      }
    }

    const fab = document.querySelector('.support-fab__trigger')
    out.fabVisible = Boolean(fab && isVis(fab))
    out.logoutCount = document.querySelectorAll('.sidebar-logout-button').length
    return out
  })
}

// --- spec ------------------------------------------------------------------


test.beforeAll(async () => {
  await seed()
})

const matrix = [
  ...LIGHT_VIEWPORTS.map(([w, h]) => [w, h, 'light']),
  ...DARK_VIEWPORTS.map(([w, h]) => [w, h, 'dark']),
]

for (const [width, height, theme] of matrix) {
  const vp = `${width}x${height}`
  test(`geometria ${vp} ${theme}`, async ({ browser }) => {
    test.setTimeout(180_000)
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
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
    await login(page, E2E_USERS.admin)

    const outDir = path.join(OUT_ROOT, vp)
    fs.mkdirSync(outDir, { recursive: true })

    for (const { route, key } of ROUTES) {
      const tag = `[${vp} ${theme} ${route}]`
      await page.goto(route)
      await expect(page.locator('.topbar')).toBeVisible({ timeout: 15_000 })
      if (route.startsWith('/admin')) {
        await expect(page.locator('.admin-tabs--desktop')).toBeVisible({ timeout: 15_000 })
      }
      await page.waitForTimeout(900)

      const m = await measure(page)

      // G1 - topbar numa linha
      const maxTopbar = height <= 800 ? 64 : 77
      expect.soft(m.topbarHeight, `${tag} G1 altura da topbar (max ${maxTopbar})`).toBeLessThanOrEqual(maxTopbar)
      // Centro vertical (nao o top): o titulo de 1 linha e mais baixo que os
      // controles de 44px e fica centralizado, entao o top dele difere sem quebra.
      const centers = m.topbarParts.map((part) => (part.top + part.bottom) / 2)
      const spread = Math.max(...centers) - Math.min(...centers)
      expect.soft(
        spread,
        `${tag} G1 topbar em 1 linha (dispersao do centro vertical ${spread.toFixed(1)}px: ${m.topbarParts
          .map((part) => `${part.name}@${Math.round((part.top + part.bottom) / 2)}`)
          .join(' ')})`
      ).toBeLessThan(8)

      // G2 - titulo sem reticencias de 1093 para cima (D5: em 1041 so registra)
      if (m.title) {
        const clipped = m.title.sw > m.title.cw
        if (width >= 1093) {
          expect.soft(clipped, `${tag} G2 titulo cortado (${m.title.sw}>${m.title.cw}): ${m.title.text}`).toBe(false)
        } else if (clipped) {
          test.info().annotations.push({
            type: 'G2-1041',
            description: `${tag} titulo com reticencias tolerado (${m.title.sw}>${m.title.cw})`,
          })
        }
      }

      // G3 - abas do Admin numa linha, aba ativa inteira dentro do nav
      if (route.startsWith('/admin')) {
        expect.soft(Boolean(m.adminTabs), `${tag} G3 abas do admin presentes`).toBe(true)
        if (m.adminTabs) {
          const tabTops = m.adminTabs.tops
          expect.soft(
            Math.max(...tabTops) - Math.min(...tabTops),
            `${tag} G3 abas em 1 linha (tops ${tabTops.map(Math.round).join(',')})`
          ).toBeLessThanOrEqual(2)
          const { nav, active } = m.adminTabs
          expect.soft(Boolean(active), `${tag} G3 aba ativa visivel`).toBe(true)
          if (active) {
            expect.soft(
              active.left >= nav.left - 1 && active.right <= nav.right + 1,
              `${tag} G3 aba ativa fora do nav (aba ${Math.round(active.left)}-${Math.round(active.right)}, nav ${Math.round(nav.left)}-${Math.round(nav.right)})`
            ).toBe(true)
          }
        }
      }

      // G4 - sem FAB; Suporte no rodape da sidebar
      expect.soft(m.fabVisible, `${tag} G4 FAB de suporte nao pode aparecer`).toBe(false)
      const support = page.locator('.sidebar__foot').getByRole('button', { name: 'Abrir suporte' })
      await expect.soft(support, `${tag} G4 Suporte no rodape da sidebar`).toBeVisible()

      // G5 - sem rolagem horizontal
      expect.soft(m.docScrollW, `${tag} G5 documento com rolagem horizontal`).toBeLessThanOrEqual(m.docClientW + 1)
      if (m.main) {
        expect.soft(m.main.sw, `${tag} G5 .main-content com rolagem horizontal`).toBeLessThanOrEqual(m.main.cw + 1)
      }

      // G6 - A2/A3
      if (route === '/news' || route === '/notifications') {
        expect.soft(m.title, `${tag} G6 topbar sem titulo duplicado`).toBeNull()
        await expect.soft(page.locator('.topbar__title'), `${tag} G6 .topbar__title`).toHaveCount(0)
      }
      expect.soft(m.logoutCount, `${tag} G6 Sair fora do rodape da sidebar`).toBe(0)

      await page.screenshot({ path: path.join(outDir, `${key}-${theme}.png`) })
    }

    // G4 (comportamento): o Suporte do rodape abre o formulario
    await page.goto('/')
    await expect(page.locator('.topbar')).toBeVisible()
    await page.locator('.sidebar__foot').getByRole('button', { name: 'Abrir suporte' }).click()
    await expect(page.getByLabel('O que aconteceu?')).toBeVisible()

    await context.close()
  })
}
