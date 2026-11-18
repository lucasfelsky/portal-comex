// QA geometrico do remake mobile (PLAN.md F7). NAO e teste de comportamento de
// produto: mede a geometria real (Chromium) das telas mobile (<=720px) e falha
// se houver estouro horizontal, alvo de toque < 44px, rotulo de etapa cortado,
// h1 duplicado, erro de console, tab bar errada, `position: fixed` do detalhe
// fora da viewport (risco do bloco de contencao da F5) ou se o conjunto novo
// vazar para tablet/desktop.
//
// So roda com QA_MOBILE=1 (o job `e2e` do CI nao define a variavel, entao tudo
// abaixo e `skip` e nenhum seed e executado):
//   $env:QA_MOBILE='1'
//   node scripts/with-jdk.mjs node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,storage --project demo-sqcomex "npx playwright test qa-mobile"
// Capturas (nao sao gate, nao sao versionadas):
//   .agent-tmp/qa-mobile/<viewport>/<tela>-<tema>[-rm].png
// Indice dos achados: .agent-tmp/qa-mobile/INDEX.md (regerado a cada teste).
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

test.skip(!process.env.QA_MOBILE, 'defina QA_MOBILE=1 para rodar o QA geometrico do remake mobile')

const AUTH_HOST = 'http://127.0.0.1:9099'
const FIRESTORE_HOST = 'http://127.0.0.1:8080'
const PROJECT_ID = 'demo-sqcomex'
const DOCS = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const OUT_ROOT = path.resolve(process.cwd(), '.agent-tmp', 'qa-mobile')
// ppid = processo do runner: estavel entre reinicios de worker (um teste que
// falha reinicia o worker), diferente a cada execucao.
const FINDINGS_FILE = path.join(OUT_ROOT, `_findings-${process.ppid}.jsonl`)

const MOBILE_VIEWPORTS = [
  [320, 640],
  [360, 740],
  [390, 844],
  [430, 932],
]
const THEMES = ['light', 'dark']
const MOTIONS = ['normal', 'reduce']
// Fora do mobile: o conjunto novo nao pode aparecer.
const WIDE_VIEWPORTS = [
  [721, 900],
  [768, 1024],
  [1040, 800],
  [1041, 800],
  [1280, 800],
]
const MOBILE_ONLY_SELECTORS = [
  '.m-hero',
  '.m-marks',
  '.m-bsheet',
  '.m-scrim',
  '.m-stack-under',
  '.m-fbtn',
  '.m-kpi',
  '.m-route',
  '.m-fav',
  '.m-pc',
  '.m-card',
  '.mobile-page-header__art',
  '.mobile-page-header__ship',
  '.mobile-page-header__brand',
  '.mobile-bottom-nav',
]

// Achados que pedem decisao de produto (nao sao bug): entram fixos no INDEX.
// Vazio desde a decisao do Lucas (18/11/2026): rodape fixo na folha de filtros, folha fecha ao
// exportar, KPI de 4+ digitos sem sparkline (3 digitos: traco mais grosso) e rotulos de etapa
// mantidos em 10px.
const PRODUCT_DECISIONS = []

// --- seed minimo via REST do emulador ------------------------------------------

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

async function putDoc(collection, id, data, mask = null) {
  const query = mask ? `?${mask.map((field) => `updateMask.fieldPaths=${field}`).join('&')}` : ''
  const response = await fetch(`${DOCS}/${collection}/${id}${query}`, {
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
    // Nome longo: estressa quebra de linha de titulo/hero a 320px.
    [
      'qa-7',
      'Dispersão aquosa de polímero acrílico estireno modificado para revestimentos arquitetônicos — Rotterdam',
      '4500129988',
      'Aguardando Embarque',
      4,
      30,
    ],
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
  // 110 chegadas hoje em transito: KPIs de 3 digitos (sparkline vs valor a 320px).
  const bulk = Array.from({ length: 110 }, (_, index) => index)
  for (let start = 0; start < bulk.length; start += 22) {
    await Promise.all(
      bulk.slice(start, start + 22).map((n) =>
        putDoc('processes', `qa-bulk-${n}`, {
          ...base,
          name: `Lote de teste ${n + 1}`,
          processNumber: `45002${String(10000 + n)}`,
          processStatus: 'Embarcou',
          etd: dateKey(-10),
          eta: dateKey(0),
          // Entrega prevista hoje (override manual): entra em "Chegadas na semana".
          warehouseDeliveryDateOverride: dateKey(0),
          updatedAt: isoMinutesAgo(300 + n),
        })
      )
    )
  }
  // Favoritos do admin (Inicio mostra o trajeto do 1o e a lista compacta dos demais).
  await putDoc('users', adminUid, { favoriteProcessIds: ['qa-3', 'qa-1', 'qa-7'] }, ['favoriteProcessIds'])

  await putDoc('announcements', 'qa-ann-1', {
    title: 'Janela de manutenção do sistema de câmbio',
    content: 'O sistema de câmbio ficará indisponível entre 22h e 23h desta sexta-feira.',
    channel: 'Banner interno',
    createdAt: isoMinutesAgo(90),
    updatedAt: isoMinutesAgo(90),
  })
  const notifications = [
    ['qa-notif-1', 'process_question_answered', 'Nova resposta em Resina epóxi', 'Logística: coleta confirmada para amanhã às 09h.', 15, false],
    ['qa-notif-2', 'process_question_answered', 'Documentos pendentes em Pigmento orgânico', 'Faltam a fatura comercial e o packing list para liberar a DUIMP.', 55, false],
    ['qa-notif-3', 'process_question_answered', 'Atualização de ETA em Solvente industrial', 'O navio antecipou a chegada em dois dias.', 400, true],
  ]
  for (const [id, type, title, body, minutes, isRead] of notifications) {
    await putDoc('notifications', id, {
      recipientUserId: adminUid,
      actorUserId: 'qa-actor',
      actorName: 'Equipe COMEX',
      type,
      processId: 'qa-1',
      messageId: '',
      title,
      body,
      targetTab: 'details',
      isRead,
      createdAt: isoMinutesAgo(minutes),
      readAt: isRead ? isoMinutesAgo(minutes - 5) : null,
    })
  }
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

// --- navegacao -------------------------------------------------------------------

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
  await expect(page.locator('.main-content')).toBeVisible({ timeout: 15_000 })
}

async function newSession(browser, { width, height, theme, motion }, credentials) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
    hasTouch: width <= 720,
    isMobile: false,
  })
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
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  await login(page, credentials)
  return { context, page, consoleErrors }
}

// O contador do KPI (useCountUp, JS, ~600ms) nao e animacao CSS: espera ele terminar
// (some o span .m-sr do valor final) para medir o numero na largura final.
async function waitKpiCountUp(page) {
  await page
    .waitForFunction(() => !document.querySelector('.m-kpi .stat-card__value .m-sr'), null, { timeout: 8_000 })
    .catch(() => {})
}

// Termina as animacoes finitas (as infinitas nao terminam) e espera 2 frames:
// scrollWidth so e confiavel com tudo no estado final.
async function settle(page) {
  await page.waitForTimeout(350)
  const finishAll = () =>
    page.evaluate(() => {
      document.getAnimations().forEach((animation) => {
        try {
          if (animation.effect?.getTiming().iterations !== Infinity) animation.finish()
        } catch {
          /* transicao/animacao ja cancelada */
        }
      })
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
  await finishAll()
  await page.waitForTimeout(120)
  await finishAll()
}

// --- medida (roda no navegador) ----------------------------------------------------

function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const de = document.documentElement
    const hiddenByAncestor = (el) => Boolean(el.closest('[inert], [aria-hidden="true"]'))
    const isVis = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const cs = getComputedStyle(node)
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false
      }
      return true
    }
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
    }

    const out = {
      vw,
      vh,
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      bodyScrollW: document.body.scrollWidth,
    }

    // Alvos de toque.
    const targetSel =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="switch"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
    // Area de toque efetiva: varre do centro para fora (elementFromPoint) em cada
    // eixo menor que 44px e mede ate onde o ponto ainda cai no controle (o
    // `::before` de 44px conta; extensao assimetrica tambem). Retorna 'ok' |
    // 'fail' | 'neighbor' (a area esbarra em outro controle) | 'unknown' (a
    // varredura saiu da viewport antes de fechar 44px).
    let lastFail = ''
    let lastNeighbor = ''
    const hitState = (el, r) => {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const owner = el.closest('label')
      // Regiao realmente visivel do controle: viewport e ancestrais que recortam
      // (overflow != visible, ex.: trilho de chips, folha que rola). Fora dela a
      // varredura nao conclui nada ('off').
      let cl = 0
      let ct = 0
      let cr = vw
      let cb = vh
      for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
        const ncs = getComputedStyle(node)
        if (ncs.overflowX === 'visible' && ncs.overflowY === 'visible') continue
        const nb = node.getBoundingClientRect()
        cl = Math.max(cl, nb.left)
        ct = Math.max(ct, nb.top)
        cr = Math.min(cr, nb.right)
        cb = Math.min(cb, nb.bottom)
      }
      const probe = (x, y) => {
        if (x < cl || y < ct || x >= cr || y >= cb) return 'off'
        const hit = document.elementFromPoint(x, y)
        if (!hit) return 'off'
        if (el === hit || el.contains(hit) || owner?.contains(hit)) return 'in'
        // Rolagem passando por baixo de camada fixa (tab bar, barra compacta, toast, folha):
        // o que esta coberto nao e medivel, igual a fora da tela.
        if (hit.closest('.mobile-bottom-nav, .mobile-nav-compact, .toast-container, .m-scrim, .m-bsheet') && !el.closest('.m-bsheet')) return 'off'
        const other = hit.closest(targetSel)
        if (other && other !== el) {
          lastNeighbor = sigOf(other, other.getBoundingClientRect())
          return 'neighbor'
        }
        lastFail = `cai em ${hit ? sigOf(hit, hit.getBoundingClientRect()) : 'nada'}`
        return 'out'
      }
      let result = 'ok'
      for (const axis of ['x', 'y']) {
        const dim = axis === 'x' ? r.width : r.height
        if (dim >= 44) continue
        const at = (d) => (axis === 'x' ? probe(cx + d, cy) : probe(cx, cy + d))
        // Centro fora da regiao visivel ou coberto por outra camada (barra fixa,
        // pilula): nao da para medir sem rolar; fica 'unknown' (o fluxo real clica nele).
        if (at(0) !== 'in') return 'unknown'
        let lo = 0
        let hi = 0
        let stopLo = 'in'
        let stopHi = 'in'
        for (let d = 1; d <= 30; d += 1) {
          stopLo = at(-d)
          if (stopLo !== 'in') break
          lo = d
        }
        for (let d = 1; d <= 30; d += 1) {
          stopHi = at(d)
          if (stopHi !== 'in') break
          hi = d
        }
        const size = lo + hi + 1
        if (size >= 43) continue
        // A varredura saiu da regiao visivel (viewport, folha que rola, trilho): nao
        // conclui nada, mesmo que do outro lado haja um vizinho.
        if (stopLo === 'off' || stopHi === 'off') {
          if (result === 'ok') result = 'unknown'
        } else if (stopLo === 'neighbor' || stopHi === 'neighbor') {
          // Linhas de chips encostadas dividem a fronteira das areas de 44px (gap 10 = 5 + 5):
          // ate 2px de diferenca e' arredondamento de subpixel, nao sobreposicao real.
          if (size >= 41) continue
          lastFail = `eixo ${axis}: ${size}px de area antes de esbarrar em ${lastNeighbor}`
          if (result === 'ok') result = 'neighbor'
        } else {
          lastFail = `eixo ${axis}: ${size}px de area (${lastFail})`
          return 'fail'
        }
      }
      return result
    }
    const sigOf = (el, r) =>
      `${el.tagName.toLowerCase()}.${(el.className?.toString() ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`
    const nameOf = (el) =>
      el.getAttribute('aria-label') ||
      (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) ||
      el.getAttribute('placeholder') ||
      ''
    // Camada modal aberta (folha de filtros, dialogo): o resto da tela esta coberto.
    const modalLayer = document.querySelector('.m-bsheet, .modal-backdrop, .action-sheet-backdrop')
    const detailLayer = document.querySelector('.process-detail-view:not([data-m-leaving="true"])')
    const bySig = new Map()
    out.coveredReachable = []
    for (const el of document.querySelectorAll(targetSel)) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue
      if (hiddenByAncestor(el) || !isVis(el)) continue
      if (el.closest('.m-sr, .sr-only, .visually-hidden') || /skip/.test(el.className?.toString() ?? '')) continue
      const r = el.getBoundingClientRect()
      // Detalhe aberto: o que fica fora da camada, dentro da viewport, e' coberto
      // por ela; se ainda e' focavel (nao inert/aria-hidden), Tab chega la.
      if (detailLayer && !detailLayer.contains(el) && !(modalLayer && modalLayer.contains(el))) {
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        if (cx >= 0 && cy >= 0 && cx < vw && cy < vh) {
          const hit = document.elementFromPoint(cx, cy)
          if (hit && detailLayer.contains(hit)) out.coveredReachable.push(`${sigOf(el, r)} "${nameOf(el)}"`)
        }
        continue
      }
      if (modalLayer && !modalLayer.contains(el)) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'inline') continue // links em texto corrido (WCAG 2.5.8)
      if (r.width >= 44 && r.height >= 44) continue
      // Campo dentro de rotulo (pilula de busca, switch): o alvo e o rotulo.
      const owner = el.closest('label')
      if (owner && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        const lr = owner.getBoundingClientRect()
        if (lr.width >= 44 && lr.height >= 44) continue
      }
      const sig = sigOf(el, r)
      const state = hitState(el, r)
      const entry = bySig.get(sig) ?? { ok: 0, fail: 0, neighbor: 0, unknown: 0, names: [] }
      entry[state] += 1
      if (state !== 'ok' && entry.names.length < 2) entry.names.push(`${nameOf(el)}${state === 'fail' || state === 'neighbor' ? ' | ' + lastFail : ''}`)
      bySig.set(sig, entry)
    }
    out.smallTargets = []
    out.neighborTargets = []
    out.unverifiedTargets = []
    for (const [sig, e] of bySig) {
      const label = `${sig} (${e.names.map((n) => `"${n}"`).join(', ')}${e.fail + e.neighbor + e.unknown + e.ok > 1 ? `; ${e.ok + e.fail + e.neighbor + e.unknown} no total` : ''})`
      if (e.fail > 0) out.smallTargets.push(label)
      else if (e.neighbor > 0) out.neighborTargets.push(label)
      else if (e.unknown > 0 && e.ok === 0) out.unverifiedTargets.push(label)
    }

    // h1 visiveis na arvore de acessibilidade (sem inert/aria-hidden/display:none).
    out.h1 = [...document.querySelectorAll('h1')]
      .filter((el) => !hiddenByAncestor(el) && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => (el.textContent || '').trim().slice(0, 40))

    // Rotulos das etapas: texto dentro da propria coluna, do trilho e da tela.
    // Mede as 5 etapas como "atual" (o rotulo atual e' mais pesado, 800, e mais
    // largo): o pior caso, nao so' o estado que o seed mostra.
    out.routeLabels = []
    for (const route of document.querySelectorAll('.m-route')) {
      const steps = [...route.querySelectorAll('.m-route__step')]
      if (!steps.length || hiddenByAncestor(route) || !isVis(route)) continue
      const saved = steps.map((li) => li.className)
      for (let now = 0; now < steps.length; now += 1) {
        steps.forEach((li, index) => {
          li.className = `m-route__step m-route__step--${index < now ? 'done' : index === now ? 'now' : 'todo'}`
        })
        for (const li of steps) {
          const span = li.querySelector('span')
          const range = document.createRange()
          range.selectNodeContents(span)
          const text = range.getBoundingClientRect()
          const col = li.getBoundingClientRect()
          const rr = route.getBoundingClientRect()
          const isNow = li.classList.contains('m-route__step--now')
          out.routeLabels.push({
            text: `${span.textContent.trim()}${isNow ? ' (atual)' : ''}`,
            textW: Math.round(text.width * 10) / 10,
            colW: Math.round(col.width * 10) / 10,
            overflowCol: Math.round((text.width - col.width) * 10) / 10,
            outRoute: Math.max(rr.left - text.left, text.right - rr.right, 0),
            outViewport: Math.max(-text.left, text.right - vw, 0),
            clipped: span.scrollWidth > span.clientWidth + 1,
            fontPx: parseFloat(getComputedStyle(span).fontSize),
          })
        }
      }
      steps.forEach((li, index) => {
        li.className = saved[index]
      })
    }

    // Reticencias (texto truncado): so informativo.
    out.ellipsis = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) continue
      const cs = getComputedStyle(el)
      if (cs.textOverflow !== 'ellipsis' || hiddenByAncestor(el) || !isVis(el)) continue
      out.ellipsis.push(`${el.tagName.toLowerCase()}.${(el.className?.toString() ?? '').split(/\s+/)[0]} "${(el.textContent || '').trim().slice(0, 28)}"`)
    }

    // Tab bar.
    const nav = document.querySelector('.mobile-bottom-nav')
    out.tabbar = nav ? box(nav) : null
    out.tabbarVisible = Boolean(nav && isVis(nav) && nav.getBoundingClientRect().top < vh - 20)

    // Animacoes infinitas rodando e navio decorativo.
    out.infiniteAnimations = document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations === Infinity && a.playState === 'running')
      .map((a) => a.animationName || a.transitionProperty || a.constructor.name)
    const ship = document.querySelector('.mobile-page-header__ship')
    out.shipVisible = Boolean(ship && isVis(ship))

    // KPI: valor x sparkline (sobreposicao).
    out.kpiOverlap = []
    for (const card of document.querySelectorAll('.m-kpi')) {
      const spark = card.querySelector('.stat-card__sparkline')
      const value = card.querySelector('.stat-card__value')
      if (!spark || !value || !isVis(spark)) continue
      // Durante a contagem o valor parcial fica num span aria-hidden e o final num .m-sr
      // (visualmente oculto): mede so o texto visivel.
      const range = document.createRange()
      range.selectNodeContents(value.querySelector('span[aria-hidden="true"]') ?? value)
      const v = range.getBoundingClientRect()
      const s = spark.getBoundingClientRect()
      const c = card.getBoundingClientRect()
      const horizontal = Math.min(v.right, s.right) - Math.max(v.left, s.left)
      const vertical = Math.min(v.bottom, s.bottom) - Math.max(v.top, s.top)
      const line = spark.querySelector('.stat-card__sparkline-line')
      const strokeUnits = line ? Number.parseFloat(getComputedStyle(line).strokeWidth) : 0
      out.kpiOverlap.push({
        wide: card.getAttribute('data-wide-value'),
        strokePx: Math.round(strokeUnits * (s.width / 100) * 100) / 100,
        value: value.textContent.trim().slice(0, 6),
        overlapX: Math.round(horizontal * 10) / 10,
        overlapY: Math.round(vertical * 10) / 10,
        gap: Math.round((s.left - v.right) * 10) / 10,
        cardRightGap: Math.round((c.right - s.right) * 10) / 10,
      })
    }

    // Toast x tab bar (pilula).
    const toast = document.querySelector('.toast-container .toast')
    out.toast = toast && isVis(toast) ? box(toast) : null

    // Folha de filtros.
    const sheet = document.querySelector('.m-bsheet')
    if (sheet && isVis(sheet)) {
      const apply = sheet.querySelector('.m-bsheet__foot .m-btn-mint')
      const exp = sheet.querySelector('.m-bsheet__foot .m-bsheet__export')
      const clear = sheet.querySelector('.m-bsheet__foot .m-ghost')
      const body = sheet.querySelector('.m-bsheet__body')
      const foot = sheet.querySelector('.m-bsheet__foot')
      const sheetBox = box(sheet)
      out.sheet = {
        box: sheetBox,
        scrollable: Boolean(body && body.scrollHeight > body.clientHeight + 1),
        sheetScrollable: sheet.scrollHeight > sheet.clientHeight + 1,
        bodyBox: body ? box(body) : null,
        footBox: foot ? box(foot) : null,
        footPaddingBottom: foot ? Number.parseFloat(getComputedStyle(foot).paddingBottom) : null,
        clearBox: clear ? box(clear) : null,
        applyBox: apply ? box(apply) : null,
        exportBox: exp ? box(exp) : null,
        exportText: exp ? exp.innerText.trim() : null,
        exportVisibleNote: (() => {
          const note = sheet.querySelector('.m-bsheet__export-note')
          return note && isVis(note) ? note.innerText.trim() : null
        })(),
      }
    }

    // Detalhe: bloco de contencao do `position: fixed` e ancoragem na viewport.
    const view = document.querySelector('.process-detail-view')
    if (view) {
      const cbProps = (el) => {
        const cs = getComputedStyle(el)
        const found = []
        if (cs.transform !== 'none') found.push(`transform:${cs.transform.slice(0, 40)}`)
        if (cs.filter !== 'none') found.push(`filter:${cs.filter}`)
        if (cs.perspective !== 'none') found.push('perspective')
        if (cs.backdropFilter && cs.backdropFilter !== 'none') found.push('backdrop-filter')
        if (/transform|filter|perspective/.test(cs.willChange)) found.push(`will-change:${cs.willChange}`)
        if (/layout|paint|strict|content/.test(cs.contain)) found.push(`contain:${cs.contain}`)
        if (cs.containerType && cs.containerType !== 'normal') found.push(`container-type:${cs.containerType}`)
        return found
      }
      const label = (el) => `${el.tagName.toLowerCase()}.${(el.className?.toString() ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
      const above = []
      for (let node = view.parentElement; node && node !== document.documentElement; node = node.parentElement) {
        const found = cbProps(node)
        if (found.length) above.push(`${label(node)} {${found.join(', ')}}`)
      }
      const fixed = []
      for (const sel of ['.process-detail-toolbar', '.process-detail-mobilebar']) {
        const el = view.querySelector(sel)
        if (!el) continue
        const cs = getComputedStyle(el)
        fixed.push({ sel, position: cs.position, box: box(el) })
      }
      out.detail = {
        viewBox: box(view),
        viewPosition: getComputedStyle(view).position,
        viewCb: cbProps(view),
        ancestorsWithContainingBlock: above,
        fixed,
        scrolled: view.getAttribute('data-m-scrolled') === 'true',
        scrollTop: view.scrollTop,
        scrollHeight: view.scrollHeight,
      }
    }

    // Dialogos/folhas fixos: backdrop e caixa dentro da viewport.
    out.dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .filter(isVis)
      .map((el) => {
        const backdrop = el.closest('.modal-backdrop, .action-sheet-backdrop, .m-scrim') || el.parentElement
        return { label: label2(el), box: box(el), backdrop: backdrop ? box(backdrop) : null }
      })
    function label2(el) {
      return `${el.tagName.toLowerCase()}.${(el.className?.toString() ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
    }

    return out
  })
}

// --- registro dos achados ------------------------------------------------------------

function recordFinding(entry) {
  fs.mkdirSync(OUT_ROOT, { recursive: true })
  fs.appendFileSync(FINDINGS_FILE, `${JSON.stringify(entry)}\n`)
}

function writeIndex() {
  const rows = fs.existsSync(FINDINGS_FILE)
    ? fs
        .readFileSync(FINDINGS_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
  const byCheck = new Map()
  for (const row of rows) {
    const key = `${row.level}|${row.check}`
    if (!byCheck.has(key)) byCheck.set(key, { level: row.level, check: row.check, items: new Map() })
    const group = byCheck.get(key)
    const itemKey = row.detail
    if (!group.items.has(itemKey)) group.items.set(itemKey, new Set())
    group.items.get(itemKey).add(row.combo)
  }
  const lines = [
    '# QA mobile (F7) - indice dos achados',
    '',
    `Gerado em ${new Date().toLocaleString('pt-BR')} (ppid ${process.ppid}). Capturas em .agent-tmp/qa-mobile/<viewport>/<tela>-<tema>[-rm].png.`,
    '',
    '## Falhas (bug)',
  ]
  const fails = [...byCheck.values()].filter((group) => group.level === 'fail')
  if (fails.length === 0) lines.push('', 'Nenhuma.')
  for (const group of fails) {
    lines.push('', `### ${group.check}`)
    for (const [detail, combos] of group.items) lines.push(`- ${detail}  <- ${[...combos].slice(0, 6).join('; ')}${combos.size > 6 ? ` (+${combos.size - 6})` : ''}`)
  }
  lines.push('', '## Informativos (nao reprovam)')
  const infos = [...byCheck.values()].filter((group) => group.level === 'info')
  if (infos.length === 0) lines.push('', 'Nenhum.')
  for (const group of infos) {
    lines.push('', `### ${group.check}`)
    for (const [detail, combos] of group.items) lines.push(`- ${detail}  <- ${[...combos].slice(0, 4).join('; ')}${combos.size > 4 ? ` (+${combos.size - 4})` : ''}`)
  }
  lines.push('', '## Decisoes de produto pendentes (nao decididas pela QA)')
  if (PRODUCT_DECISIONS.length === 0) lines.push('- Nenhuma.')
  for (const item of PRODUCT_DECISIONS) lines.push(`- ${item}`)
  lines.push('')
  fs.writeFileSync(path.join(OUT_ROOT, 'INDEX.md'), lines.join('\n'))
}

// Soft-expect + registro (um achado por falha).
function makeChecker(combo) {
  const fail = (check, detail) => {
    recordFinding({ level: 'fail', check, detail, combo })
    expect.soft(false, `[${combo}] ${check}: ${detail}`).toBe(true)
  }
  const info = (check, detail) => recordFinding({ level: 'info', check, detail, combo })
  return { fail, info }
}

// Checagens comuns a toda tela mobile.
async function checkScreen(page, combo, screen, { tabbar, motion, width, skipTargets = false }) {
  const { fail, info } = makeChecker(`${combo} ${screen}`)
  const m = await measure(page)

  // Sem estouro horizontal.
  if (m.scrollW > m.clientW) fail('scrollWidth > clientWidth', `${m.scrollW} > ${m.clientW} (${screen})`)

  // Alvos de toque.
  for (const desc of skipTargets ? [] : m.smallTargets) fail('alvo de toque < 44px', `${screen}: ${desc}`)
  for (const desc of skipTargets ? [] : m.neighborTargets) fail('area de toque de 44px esbarra em controle vizinho', `${screen}: ${desc}`)
  for (const desc of m.coveredReachable) {
    fail('controle coberto pela camada do detalhe continua alcancavel (Tab/leitor de tela)', `${screen}: ${desc}`)
  }
  for (const desc of m.unverifiedTargets) info('alvo de toque nao verificavel (fora da viewport)', `${screen}: ${desc}`)

  // h1 unico.
  if (m.h1.length !== 1) fail('h1 unico por tela', `${screen}: ${m.h1.length} h1 (${m.h1.map((t) => `"${t}"`).join(', ')})`)

  // Rotulos das 5 etapas.
  for (const label of m.routeLabels) {
    const probs = []
    if (label.overflowCol > 0.5) probs.push(`${label.overflowCol}px alem da coluna (${label.textW}>${label.colW})`)
    if (label.outRoute > 0.5) probs.push(`${label.outRoute.toFixed(1)}px fora do trilho`)
    if (label.outViewport > 0.5) probs.push(`${label.outViewport.toFixed(1)}px fora da tela`)
    if (label.clipped) probs.push('cortado (scrollWidth>clientWidth)')
    if (probs.length) fail('rotulo de etapa cortado/transbordando', `${screen}: "${label.text}" ${label.fontPx}px ${probs.join('; ')}`)
  }

  // Sparkline x valor do KPI. 3 digitos (wide): traco renderizado >= 1,6px; 4+ (xwide): sem sparkline (nem entra na lista).
  for (const kpi of m.kpiOverlap) {
    if (kpi.wide === 'xwide') fail('sparkline deveria estar oculta com 4+ digitos', `valor "${kpi.value}"`)
    if (kpi.wide === 'wide' && kpi.strokePx < 1.6) fail('traco da sparkline fino demais com 3 digitos', `valor "${kpi.value}": ${kpi.strokePx}px`)
    if (kpi.overlapX > 0 && kpi.overlapY > 0) {
      fail('sparkline encosta/sobrepoe o valor do KPI', `valor "${kpi.value}": sobreposicao ${kpi.overlapX}px (folga ${kpi.gap}px)`)
    } else if (kpi.gap < 4) {
      fail('sparkline encosta no valor do KPI', `valor "${kpi.value}": folga ${kpi.gap}px`)
    }
  }

  // Tab bar.
  if (tabbar === 'visible' && !m.tabbarVisible) fail('tab bar deveria estar visivel', `${screen}: ${JSON.stringify(m.tabbar)}`)
  if (tabbar === 'hidden' && m.tabbarVisible) fail('tab bar deveria estar oculta', `${screen}: ${JSON.stringify(m.tabbar)}`)
  if (tabbar === 'visible' && m.tabbar && (m.tabbar.left < 0 || m.tabbar.right > m.vw)) {
    fail('tab bar fora da largura', `${screen}: ${Math.round(m.tabbar.left)}..${Math.round(m.tabbar.right)} de ${m.vw}`)
  }

  // Movimento reduzido.
  if (motion === 'reduce') {
    if (m.infiniteAnimations.length) fail('animacao infinita com movimento reduzido', `${screen}: ${m.infiniteAnimations.join(', ')}`)
    if (m.shipVisible) fail('navio decorativo visivel com movimento reduzido', screen)
  }

  // Folha de filtros dentro da viewport; botoes alcancaveis.
  if (m.sheet) {
    const { box: b, applyBox, exportBox, clearBox, footBox, bodyBox, scrollable, sheetScrollable } = m.sheet
    if (b.bottom > m.vh + 1 || b.left < -1 || b.right > m.vw + 1) {
      fail('folha de filtros fora da viewport', `${JSON.stringify(b)}`)
    }
    // Rodape fixo (decisao do Lucas): CTA, Limpar e Exportar SEMPRE a vista, rolando ou nao o corpo.
    if (!footBox) fail('folha sem rodape fixo (.m-bsheet__foot)', screen)
    if (sheetScrollable) fail('a folha inteira rola (so o corpo deveria rolar)', screen)
    for (const [name, target] of [['Ver N processos', applyBox], ['Exportar', exportBox], ['Limpar', clearBox]]) {
      if (!target) continue
      if (target.bottom > m.vh + 1 || target.top < 0) fail(`botao "${name}" fora da viewport`, JSON.stringify(target))
      if (target.height < 44 || target.width < 44) fail(`botao "${name}" abaixo de 44px`, JSON.stringify(target))
    }
    if (footBox && bodyBox && bodyBox.bottom > footBox.top + 1) fail('corpo da folha invade o rodape', JSON.stringify({ bodyBox, footBox }))
    if (footBox && Math.abs(footBox.bottom - b.bottom) > 1) fail('rodape nao encosta no fim da folha', JSON.stringify({ footBox, sheet: b }))
    if (bodyBox && bodyBox.height < 140) fail('corpo da folha pequeno demais para filtrar', `${Math.round(bodyBox.height)}px em ${m.vw}x${m.vh}`)
    if (scrollable) info('corpo da folha de filtros rola (rodape segue a vista)', `${screen} a ${m.vw}x${m.vh}`)
  }

  // Toast acima da pilula (nao pode cobrir a tab bar).
  if (m.toast && m.tabbar && m.tabbarVisible) {
    const overlap = Math.min(m.toast.bottom, m.tabbar.bottom) - Math.max(m.toast.top, m.tabbar.top)
    const overlapX = Math.min(m.toast.right, m.tabbar.right) - Math.max(m.toast.left, m.tabbar.left)
    if (overlap > 0 && overlapX > 0) fail('toast sobrepoe a tab bar', `${screen}: toast ${Math.round(m.toast.top)}..${Math.round(m.toast.bottom)} x tab bar ${Math.round(m.tabbar.top)}..${Math.round(m.tabbar.bottom)}`)
  }
  if (m.toast && (m.toast.left < 0 || m.toast.right > m.vw)) fail('toast fora da largura', JSON.stringify(m.toast))

  // Dialogos fixos ancorados na viewport.
  for (const dialog of m.dialogs) {
    if (dialog.box.left < -1 || dialog.box.right > m.vw + 1 || dialog.box.top < -1 || dialog.box.bottom > m.vh + 1) {
      fail('dialogo fixo fora da viewport', `${screen}: ${dialog.label} ${JSON.stringify(dialog.box)}`)
    }
    if (dialog.backdrop && screen.startsWith('detalhe')) {
      const b = dialog.backdrop
      if (Math.abs(b.left) > 1 || Math.abs(b.top) > 1 || Math.abs(b.right - m.vw) > 1 || Math.abs(b.bottom - m.vh) > 1) {
        fail('backdrop do dialogo nao cobre a viewport (bloco de contencao)', `${screen}: ${JSON.stringify(b)}`)
      }
    }
  }

  for (const item of m.ellipsis) info('texto truncado com reticencias', `${screen}: ${item}`)
  void width
  return m
}

// Detalhe aberto: `position: fixed` ancora na viewport (risco do containing block).
function checkDetailAnchoring(m, combo, screen, { settled }) {
  const { fail } = makeChecker(`${combo} ${screen}`)
  if (!m.detail) {
    fail('detalhe nao encontrado', screen)
    return
  }
  const d = m.detail
  for (const item of d.ancestorsWithContainingBlock) {
    fail('ancestral do detalhe forma bloco de contencao (quebra position:fixed)', `${screen}${settled ? '' : ' (logo apos abrir)'}: ${item}`)
  }
  if (!settled) return
  if (d.viewPosition !== 'fixed') fail('camada do detalhe nao e fixed', `${screen}: ${d.viewPosition}`)
  if (d.viewCb.length) fail('camada do detalhe tem propriedade que forma bloco de contencao', `${screen}: ${d.viewCb.join(', ')}`)
  const v = d.viewBox
  if (Math.abs(v.left) > 1 || Math.abs(v.top) > 1 || Math.abs(v.right - m.vw) > 1 || Math.abs(v.bottom - m.vh) > 1) {
    fail('camada do detalhe nao cobre a viewport', `${screen}: ${JSON.stringify(v)} vs ${m.vw}x${m.vh}`)
  }
  for (const item of d.fixed) {
    if (item.position !== 'fixed') continue
    const b = item.box
    if (item.sel === '.process-detail-toolbar') {
      if (Math.abs(b.bottom - m.vh) > 1.5 || b.left < -1 || b.right > m.vw + 1) {
        fail('barra de acao fixa nao ancora no rodape da viewport', `${screen}: ${JSON.stringify(b)} vs ${m.vw}x${m.vh}`)
      }
    } else if (Math.abs(b.top) > 1.5 || b.left < -1 || b.right > m.vw + 1) {
      fail('barra do topo fixa nao ancora no topo da viewport', `${screen}: ${JSON.stringify(b)}`)
    }
  }
}

// Erros de console: ruido de ambiente (rede/funcoes ausentes nos emuladores e
// requisicoes abortadas pela navegacao do proprio teste) fica so informativo.
const ENV_NOISE = /Failed to load resource|net::ERR|ERR_CONNECTION|cloudfunctions|getDailyPtaxRates|RPC_ERROR|HTTP error has no status|Request failed with error: undefined|Falha ao carregar/i
function reportConsole(consoleErrors, combo) {
  const { fail, info } = makeChecker(combo)
  for (const raw of new Set(consoleErrors)) {
    const text = raw.replace(/^\[[^\]]+\]\s*/, '')
    if (ENV_NOISE.test(text)) info('console.error de ambiente (rede/abortado)', text.slice(0, 140))
    else fail('console.error', text.slice(0, 200))
  }
}

// --- fluxos ---------------------------------------------------------------------------

async function shot(page, vp, screen, theme, motion) {
  const dir = path.join(OUT_ROOT, vp)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${screen}-${theme}${motion === 'reduce' ? '-rm' : ''}.png`) })
}

async function openDetailFromCard(page) {
  await page.goto('/processos')
  await expect(page.locator('.m-pc').first()).toBeVisible({ timeout: 15_000 })
  await settle(page)
  await page.locator('.m-pc').first().click()
  await page.locator('.process-detail-view').waitFor({ state: 'visible', timeout: 10_000 })
}

async function openDetailFromFavorite(page) {
  await page.goto('/')
  await expect(page.locator('.m-fav__open').first()).toBeVisible({ timeout: 15_000 })
  await settle(page)
  await page.locator('.m-fav__open').first().click()
  await page.locator('.process-detail-view').waitFor({ state: 'visible', timeout: 10_000 })
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  fs.mkdirSync(OUT_ROOT, { recursive: true })
  // Limpa achados de execucoes anteriores (outro ppid); o da execucao atual fica.
  for (const name of fs.readdirSync(OUT_ROOT)) {
    if (name.startsWith('_findings-') && name !== path.basename(FINDINGS_FILE)) fs.rmSync(path.join(OUT_ROOT, name))
  }
  await seed()
})

test.afterEach(() => {
  writeIndex()
})

// Telas do mobile para o admin (e, no ultimo teste de cada viewport, o menu do usuario).
for (const [width, height] of MOBILE_VIEWPORTS) {
  for (const theme of THEMES) {
    for (const motion of MOTIONS) {
      const vp = `${width}x${height}`
      const combo = `${vp} ${theme}${motion === 'reduce' ? ' rm' : ''}`
      test(`mobile ${combo}`, async ({ browser }) => {
        test.setTimeout(480_000)
        const { context, page, consoleErrors } = await newSession(browser, { width, height, theme, motion }, E2E_USERS.admin)
        const opts = { motion, width }

        // Inicio ----------------------------------------------------------------
        await page.goto('/')
        await expect(page.locator('.m-kpis')).toBeVisible({ timeout: 15_000 })
        await expect(page.locator('.m-fav').first()).toBeVisible({ timeout: 15_000 })
        await waitKpiCountUp(page)
        await settle(page)
        await checkScreen(page, combo, 'inicio', { tabbar: 'visible', ...opts })
        await shot(page, vp, 'inicio', theme, motion)

        // Chegadas + folha de filtros ----------------------------------------------
        await page.goto('/processos')
        await expect(page.locator('.m-pc').first()).toBeVisible({ timeout: 15_000 })
        await settle(page)
        await checkScreen(page, combo, 'chegadas', { tabbar: 'visible', ...opts })
        await shot(page, vp, 'chegadas', theme, motion)

        await page.locator('.m-fbtn').click()
        await expect(page.locator('.m-bsheet--on')).toBeVisible()
        // Rascunho diferente do aplicado: o export so enxerga o aplicado (item 5).
        await page.locator('.m-bsheet .m-chip', { hasText: 'Marítimo' }).first().click()
        await settle(page)
        const sheetM = await checkScreen(page, combo, 'chegadas-filtros', { tabbar: 'visible', ...opts })
        {
          const { fail } = makeChecker(`${combo} chegadas-filtros`)
          const text = `${sheetM.sheet?.exportText ?? ''} ${sheetM.sheet?.exportVisibleNote ?? ''}`
          if (!/lista atual/i.test(text)) fail('Exportar sem aviso visivel de que filtros nao aplicados nao entram', `texto visivel: "${text.trim()}"`)
        }
        await shot(page, vp, 'chegadas-filtros', theme, motion)

        // Toast apos exportar (so uma vez por viewport/tema, no modo normal): nao cobre a pilula.
        if (motion === 'normal' && theme === 'light') {
          const exportButton = page.locator('.m-bsheet__export')
          if (await exportButton.isEnabled()) {
            await exportButton.click()
            // A folha fecha ao exportar: o toast nao cobre mais Limpar/Ver N.
            await expect(page.locator('.m-bsheet')).toHaveCount(0, { timeout: 5_000 })
            const toast = page.locator('.toast-container .toast').first()
            if (await toast.isVisible({ timeout: 6_000 }).catch(() => false)) {
              await settle(page)
              await checkScreen(page, combo, 'chegadas-toast', { tabbar: 'visible', skipTargets: true, ...opts })
              await shot(page, vp, 'chegadas-toast', theme, motion)
            }
          }
        }
        await page.keyboard.press('Escape')
        await expect(page.locator('.m-bsheet')).toHaveCount(0, { timeout: 5_000 })

        // Detalhe aberto pelo cartao -------------------------------------------------
        await openDetailFromCard(page)
        checkDetailAnchoring(await measure(page), combo, 'detalhe-cartao', { settled: false })
        await settle(page)
        const detail = await checkScreen(page, combo, 'detalhe-cartao', { tabbar: 'hidden', ...opts })
        checkDetailAnchoring(detail, combo, 'detalhe-cartao', { settled: true })
        await shot(page, vp, 'detalhe-cartao', theme, motion)

        // Rolado (barra compacta navy) e dialogo fixo (Excluir) ancorados.
        await page.locator('.process-detail-view').evaluate((el) => el.scrollTo({ top: 400 }))
        await settle(page)
        const scrolled = await checkScreen(page, combo, 'detalhe-cartao-rolado', { tabbar: 'hidden', ...opts })
        checkDetailAnchoring(scrolled, combo, 'detalhe-cartao-rolado', { settled: true })
        await shot(page, vp, 'detalhe-cartao-rolado', theme, motion)

        await page.getByRole('button', { name: 'Mais ações' }).click()
        await page.getByRole('menuitem', { name: /Excluir processo/ }).click()
        await expect(page.getByRole('alertdialog').or(page.getByRole('dialog')).first()).toBeVisible()
        await settle(page)
        const dialogM = await checkScreen(page, combo, 'detalhe-dialogo-excluir', { tabbar: 'hidden', ...opts })
        checkDetailAnchoring(dialogM, combo, 'detalhe-dialogo-excluir', { settled: true })
        await shot(page, vp, 'detalhe-dialogo-excluir', theme, motion)
        await page.getByRole('button', { name: 'Cancelar' }).click()

        // Voltar: a tab bar volta e a lista continua montada.
        await page.getByRole('button', { name: /^Voltar/ }).first().click()
        await expect(page.locator('.process-detail-view')).toHaveCount(0, { timeout: 5_000 })
        await settle(page)
        await checkScreen(page, combo, 'chegadas-apos-voltar', { tabbar: 'visible', ...opts })

        // Detalhe aberto pelo favorito do Inicio (caminho exigido pela F5) ----------
        await openDetailFromFavorite(page)
        checkDetailAnchoring(await measure(page), combo, 'detalhe-favorito', { settled: false })
        await settle(page)
        const detailFav = await checkScreen(page, combo, 'detalhe-favorito', { tabbar: 'hidden', ...opts })
        checkDetailAnchoring(detailFav, combo, 'detalhe-favorito', { settled: true })
        await shot(page, vp, 'detalhe-favorito', theme, motion)
        await page.getByRole('button', { name: 'Mais ações' }).click()
        await page.getByRole('menuitem', { name: /Excluir processo/ }).click()
        await expect(page.getByRole('alertdialog').or(page.getByRole('dialog')).first()).toBeVisible()
        await settle(page)
        const dialogFav = await checkScreen(page, combo, 'detalhe-favorito-dialogo-excluir', { tabbar: 'hidden', ...opts })
        checkDetailAnchoring(dialogFav, combo, 'detalhe-favorito-dialogo-excluir', { settled: true })
        await page.getByRole('button', { name: 'Cancelar' }).click()

        // Noticias, Avisos, Menu --------------------------------------------------------
        await page.goto('/news')
        await expect(page.locator('.m-news').first()).toBeVisible({ timeout: 15_000 })
        await settle(page)
        await checkScreen(page, combo, 'noticias', { tabbar: 'visible', ...opts })
        await shot(page, vp, 'noticias', theme, motion)

        await page.goto('/notifications')
        await expect(page.locator('.m-nrow').first()).toBeVisible({ timeout: 15_000 })
        await settle(page)
        await checkScreen(page, combo, 'avisos', { tabbar: 'visible', ...opts })
        await shot(page, vp, 'avisos', theme, motion)

        await page.goto('/menu')
        await expect(page.locator('.m-menu')).toBeVisible({ timeout: 15_000 })
        await settle(page)
        await checkScreen(page, combo, 'menu-admin', { tabbar: 'visible', ...opts })
        await shot(page, vp, 'menu-admin', theme, motion)

        // Erros de console (ruido de rede do emulador/funcoes ausentes fica so informativo).
        reportConsole(consoleErrors, combo)

        await context.close()
      })
    }
  }

  // Menu do usuario comum (sem Administracao): claro/escuro, movimento normal.
  for (const theme of THEMES) {
    const vp = `${width}x${height}`
    const combo = `${vp} ${theme} user`
    test(`mobile ${combo} menu`, async ({ browser }) => {
      test.setTimeout(120_000)
      const { context, page, consoleErrors } = await newSession(browser, { width, height, theme, motion: 'normal' }, E2E_USERS.user)
      await page.goto('/')
      await expect(page.locator('.m-kpis')).toBeVisible({ timeout: 15_000 })
      await waitKpiCountUp(page)
      await settle(page)
      await checkScreen(page, combo, 'inicio-user', { tabbar: 'visible', motion: 'normal', width })
      await shot(page, vp, 'inicio-user', theme, 'normal')
      await page.goto('/menu')
      await expect(page.locator('.m-menu')).toBeVisible({ timeout: 15_000 })
      await settle(page)
      await checkScreen(page, combo, 'menu-user', { tabbar: 'visible', motion: 'normal', width })
      await shot(page, vp, 'menu-user', theme, 'normal')
      reportConsole(consoleErrors, combo)
      await context.close()
    })
  }
}

// Bump da tab bar: so ao trocar de aba, nunca no primeiro paint. Conta os
// `animationstart` de m-bump (um listener de captura instalado antes do app
// carregar), em vez de amostrar getAnimations() numa janela curta: sob carga a
// janela de 500ms da animacao passa batida.
test('mobile tab bar: m-bump so ao trocar de aba', async ({ browser }) => {
  test.setTimeout(180_000)
  const { context, page } = await newSession(browser, { width: 390, height: 844, theme: 'light', motion: 'normal' }, E2E_USERS.admin)
  await context.addInitScript(() => {
    window.__bumpStarts = 0
    document.addEventListener(
      'animationstart',
      (event) => {
        if (event.animationName === 'm-bump') window.__bumpStarts += 1
      },
      true
    )
  })
  const { fail } = makeChecker('390x844 light bump')
  const starts = () => page.evaluate(() => window.__bumpStarts)
  await page.goto('/processos')
  await page.locator('.mobile-bottom-nav').waitFor({ state: 'visible' })
  await page.waitForTimeout(1500)
  const firstPaint = await starts()
  if (firstPaint > 0) fail('m-bump rodou no primeiro paint', `${firstPaint} animacao(oes) ate 1,5s depois de montar a tab bar`)
  await page.locator('.mobile-bottom-nav a[aria-label="Notícias"]').click()
  const ran = await expect
    .poll(starts, { timeout: 5_000 })
    .toBeGreaterThan(firstPaint)
    .then(() => true)
    .catch(() => false)
  if (!ran) fail('m-bump nao rodou ao trocar de aba', 'esperado >= 1 animationstart depois do clique')
  await context.close()
})

// Fora do mobile: nada do conjunto novo aparece.
for (const [width, height] of WIDE_VIEWPORTS) {
  const vp = `${width}x${height}`
  test(`sem conjunto mobile em ${vp}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const { context, page } = await newSession(browser, { width, height, theme: 'light', motion: 'normal' }, E2E_USERS.admin)
    const combo = `${vp} light wide`
    const { fail } = makeChecker(combo)
    const countVisible = (selectors) =>
      page.evaluate((list) => {
        const out = {}
        for (const sel of list) {
          out[sel] = [...document.querySelectorAll(sel)].filter((el) => {
            const r = el.getBoundingClientRect()
            if (r.width < 1 || r.height < 1) return false
            for (let node = el; node && node !== document.body; node = node.parentElement) {
              const cs = getComputedStyle(node)
              if (cs.display === 'none' || cs.visibility === 'hidden') return false
            }
            return true
          }).length
        }
        return out
      }, selectors)
    const verify = async (screen) => {
      await settle(page)
      const counts = await countVisible(MOBILE_ONLY_SELECTORS)
      for (const [sel, n] of Object.entries(counts)) {
        if (n > 0) fail('conjunto mobile visivel fora do mobile', `${screen}: ${sel} x${n}`)
      }
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (scroll > 0) fail('scrollWidth > clientWidth', `${screen}: +${scroll}`)
      await shot(page, vp, screen, 'light', 'normal')
    }
    await page.goto('/')
    await expect(page.locator('.main-content')).toBeVisible()
    await verify('wide-inicio')
    await page.goto('/processos')
    await expect(page.locator('.process-item--button, .chg-row__main').first()).toBeVisible({ timeout: 15_000 })
    await verify('wide-chegadas')
    await page.locator('.process-item--button, .chg-row__main').first().click()
    await page.locator('.process-detail-view').waitFor({ state: 'visible', timeout: 10_000 })
    await verify('wide-detalhe')
    await page.goto('/news')
    await expect(page.locator('.main-content')).toBeVisible()
    await verify('wide-noticias')
    await page.goto('/notifications')
    await expect(page.locator('.main-content')).toBeVisible()
    await verify('wide-avisos')
    await context.close()
  })
}
