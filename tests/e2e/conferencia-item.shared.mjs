// Conferência por item (Fatias B e C): infraestrutura compartilhada dos harnesses de captura lado a lado (mock v5 x produto).
// Não é um spec (o Playwright só roda `*.spec.mjs`); é importado pelos specs `conferencia-item-*.shots.spec.mjs`. Mesmo padrão do
// harness da Fatia A (`conferencia-item.shots.spec.mjs`, que segue com a sua própria cópia): seed sintético por REST no emulador
// (`Authorization: Bearer owner`), SÓ com os dados inventados do mock v5; sessões já autenticadas; captura do mock por `file://`.
// Variáveis (as mesmas da Fatia A): CONF_MOCK_HTML (mock v5, FORA do repositório), CONF_AUTH_HOST / CONF_FIRESTORE_HOST (rodada
// isolada com portas deslocadas quando as padrão estão em uso por outra sessão).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

export { E2E_USERS }
export const MOCK_HTML = process.env.CONF_MOCK_HTML ?? ''
export const AUTH_HOST = process.env.CONF_AUTH_HOST ?? 'http://127.0.0.1:9099'
export const FIRESTORE_HOST = process.env.CONF_FIRESTORE_HOST ?? 'http://127.0.0.1:8080'
export const PROJECT_ID = 'demo-sqcomex'
const DOCS = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
export const FROZEN_NOW = new Date('2026-11-27T11:40:00-03:00')
export const THEMES = ['light', 'dark']
export const DESKTOP = { width: 1280, height: 800 }
export const LOGISTICA = { email: 'e2e-logistica@sqquimica.com', password: 'senha-e2e-logistica', name: 'Operador Logística', role: 'logistica', status: 'Ativo' }
export const FCL = 'demo-001'
export const AEREO = 'demo-aereo'
export const MANY = 'demo-16'
export const TARE_HINT = 'tara (embalagem vazia)'
export const AVARIA = '2 sacos rasgados na lateral do pallet, produto exposto.'

// ---------- dados inventados (iguais aos do mock v5) ----------

export const MOCK_ROWS = [
  { id: 'r1', code: 'BA5012', sq: 'Poliol Flex 3000', sup: 'POLYETHER POLYOL PE-3000', lot: 'L-2231', qty: 20000, net: 200, pk: 9.8, pkg: 'Tambor 200 L' },
  { id: 'r2', code: 'BA5012', sq: 'Poliol Flex 3000', sup: 'POLYETHER POLYOL PE-3000', lot: 'L-2232', qty: 20000, net: 200, pk: 9.8, pkg: 'Tambor 200 L' },
  { id: 'r3', code: 'BA5012', sq: 'Poliol Flex 3000', sup: 'POLYETHER POLYOL PE-3000 TYPE B', lot: 'L-2240', qty: 10000, net: 200, pk: null, pkg: 'Tambor 200 L' },
  { id: 'r4', code: 'BA5033', sq: 'Catalisador ZN-12', sup: 'ZINC CATALYST ZN12', lot: 'Z-9910', qty: 4000, net: 25, pk: 0.12, pkg: 'Saco 25 kg' },
  { id: 'r5', code: 'BA5033', sq: 'Catalisador ZN-12', sup: 'ZINC CATALYST ZN12', lot: 'Z-9911', qty: 2000, net: 25, pk: 0.12, pkg: 'Saco 25 kg' },
  { id: 'r6', code: 'BA5190', sq: 'Resina Acrílica RA-55', sup: 'ACRYLIC RESIN AR-55 (50%)', lot: 'A-1180', qty: 20000, net: 200, pk: 9.5, pkg: 'Tambor 200 L' },
  { id: 'r7', code: 'BA6001', sq: 'Aditivo AX-7', sup: 'ADDITIVE AX7 POWDER', lot: '', qty: 300, net: 25, pk: 0.4, pkg: 'Saco 25 kg' },
]
export const ITEM_NAMES = { BA5012: 'Poliol Flex 3000', BA5033: 'Catalisador ZN-12', BA5190: 'Resina Acrílica RA-55', BA6001: 'Aditivo AX-7' }
export const MANY_ROWS = Array.from({ length: 16 }, (_, index) => {
  const n = String(index + 1).padStart(2, '0')
  return { id: `m${n}`, code: `ZZ01${n}`, sq: `Item Demo ${n}`, sup: `DEMO ITEM ${n}`, lot: `LD-${n}`, qty: 1000, net: 25, pk: 0.2, pkg: 'Saco 25 kg' }
})

// ---------- REST do emulador ----------

function fsValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } }
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fsValue(v)])) } }
  return { stringValue: String(value) }
}

function fromFsValue(value) {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('stringValue' in value) return value.stringValue
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFsValue)
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, fromFsValue(v)]))
  return undefined
}

export async function putDoc(docPath, data) {
  const response = await fetch(`${DOCS}/${docPath}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }),
  })
  if (!response.ok) throw new Error(`seed ${docPath}: ${await response.text()}`)
}

// Lê um doc pelo emulador (para provar o que o produto gravou, já aceito pelas rules).
export async function getDoc(docPath) {
  const response = await fetch(`${DOCS}/${docPath}`, { headers: { Authorization: 'Bearer owner' } })
  if (!response.ok) throw new Error(`leitura ${docPath}: ${await response.text()}`)
  const body = await response.json()
  return Object.fromEntries(Object.entries(body.fields ?? {}).map(([k, v]) => [k, fromFsValue(v)]))
}

async function post(url, body) {
  const response = await fetch(`${AUTH_HOST}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  })
  return { ok: response.ok, payload: await response.json() }
}

async function ensureUser(user) {
  const signUp = await post('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', {
    email: user.email,
    password: user.password,
    returnSecureToken: true,
  })
  if (!signUp.ok) return
  const uid = signUp.payload.localId
  await post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    localId: uid,
    displayName: user.name,
    emailVerified: true,
    customAttributes: JSON.stringify({ role: user.role, status: user.status, name: user.name }),
  })
  await putDoc(`users/${uid}`, {
    uid,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    statusTone: 'ok',
    area: user.role === 'admin' ? 'Admin' : 'Logística',
    lastAccess: 'Seed conferência por item',
    notes: 'Seed conferência por item',
    favoriteProcessIds: [],
  })
}

function reportRow(row) {
  return {
    id: row.id,
    po: '',
    dbcorpCode: row.code,
    supplierDescription: row.sup,
    sqDescription: row.sq,
    supplierLot: row.lot,
    wmsLabel: '',
    sqLabel: '',
    quantityKg: row.qty,
    count: null,
    packageWeightKg: row.pk,
    frozenNetWeightKg: null,
    frozenPackages: null,
  }
}

async function seedProcess(id, { category, rows, expectedPallets }) {
  const containers =
    category === 'FCL'
      ? [
          { id: 'CNT-1', type: '40HC', number: 'DMOU 1234560', seal: '', returnedAt: '' },
          { id: 'CNT-2', type: '40HC', number: 'DMOU 7654321', seal: '', returnedAt: '' },
          { id: 'CNT-3', type: '20DC', number: 'DMOU 2468135', seal: '', returnedAt: '' },
        ]
      : []
  await putDoc(`processes/${id}`, {
    id,
    category,
    name: 'DEMO 001',
    processNumber: 'DEMO 001',
    destination: 'ITAJAI',
    processStatus: 'Carga recebida',
    cargoReceivedAt: '2026-11-26T15:00:00.000Z',
    etd: '2026-11-01',
    eta: '2026-11-20',
    supplierName: 'Fornecedor Alfa Ltda',
    originLocation: 'Shanghai, CN',
    incoterm: 'CFR',
    containerQuantity: containers.length,
    containers,
    items: [{ id: 'it-1', commercialName: 'Item demo', quantity: 1000 }],
    documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] },
    archived: false,
    updatedAt: FROZEN_NOW.toISOString(),
  })
  await putDoc(`processes/${id}/cargoReport/current`, {
    schemaVersion: 1,
    formCode: 'FR.CMX.001',
    formRevision: '005',
    revision: 1,
    status: 'concluido',
    cargoType: category,
    titleSuffix: 'DEMO 001',
    rows: rows.map(reportRow),
    expectedPallets,
    notes: '',
    labeledBy: '',
    labelMadeBy: '',
    nfNumber: '',
    receiptStatus: '',
    receivedDate: '',
    completedDate: '2026-11-26',
    catalogVersion: 1,
    lastGenerated: null,
    updatedAt: FROZEN_NOW.toISOString(),
    updatedById: 'seed',
    updatedByName: 'Seed conferência por item',
  })
}

export const EMPTY_CONFERENCE = {
  schemaVersion: 1,
  revision: 2,
  status: 'aberta',
  okByRowId: {},
  countOkByRowId: {},
  palletsByRowId: {},
  unitsByRowId: {},
  partialPallets: [],
  damageByRowId: {},
  labelsByRowId: {},
  checkedByName: '',
  receiptStatus: '',
  receivedDate: '',
  nfNumber: '',
  notes: '',
  unloadStartAt: '',
  unloadEndAt: '',
  labelingOk: false,
  closedDate: '',
  closedById: '',
  closedByName: '',
  closedDocumentId: '',
  updatedAt: FROZEN_NOW.toISOString(),
  updatedByName: '',
}

// Usuários, catálogo Item x Emb. e os 3 processos (FCL do mock, AÉREO e a variante de 16 itens). Quem chama grava a conferência.
export async function seedBase() {
  await ensureUser(LOGISTICA)
  await ensureUser(E2E_USERS.admin)
  await putDoc('cargoReportCatalog/itemPackaging', {
    version: 1,
    sourceFileName: 'demo.xlsx',
    sourceSheetName: 'Item x Emb.',
    sourceSha256: 'demo',
    importedAt: FROZEN_NOW.toISOString(),
    importedById: 'seed',
    importedByName: 'Seed conferência por item',
    items: MOCK_ROWS.map((row) => ({ code: row.code, description: row.sup, packagingType: row.pkg, netWeightKg: row.net })).filter(
      (item, index, list) => list.findIndex((other) => other.code === item.code) === index
    ),
  })
  await seedProcess(FCL, { category: 'FCL', rows: MOCK_ROWS, expectedPallets: 22 })
  await seedProcess(AEREO, { category: 'AEREO', rows: MOCK_ROWS, expectedPallets: 22 })
  await seedProcess(MANY, { category: 'FCL', rows: MANY_ROWS, expectedPallets: 16 })
}

// ---------- infraestrutura de navegador ----------

// Sessões já autenticadas (um login por usuário no começo da rodada; o Firebase Auth guarda a sessão no IndexedDB).
export const SESSIONS = {}

export async function newContext(browser, theme, viewport, who) {
  const context = await browser.newContext({
    viewport,
    storageState: SESSIONS[who],
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
    reducedMotion: 'reduce',
  })
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem('pc-theme', value)
    } catch {
      /* ignora */
    }
  }, theme)
  return context
}

export async function openPage(context) {
  const page = await context.newPage()
  await page.clock.setFixedTime(FROZEN_NOW)
  return page
}

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({ timeout: 20_000 })
}

export async function captureSession(browser, credentials) {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  try {
    const page = await context.newPage()
    await login(page, credentials)
    return await context.storageState({ indexedDB: true })
  } finally {
    await context.close()
  }
}

export async function waitConferenceReady(page) {
  await expect(page.locator('.ccf-screen .ccf-strip').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.ccf-screen .ccf-skeletons')).toHaveCount(0, { timeout: 20_000 })
  await page.waitForTimeout(350)
}

export async function openConference(page, processId) {
  await page.goto(`/conferencia?processo=${processId}`)
  await waitConferenceReady(page)
}

// Digita na busca e fecha o teclado (Enter), como a pessoa faz antes de tocar num item.
export async function typeSearch(page, text) {
  const box = page.getByRole('textbox', { name: 'Buscar item pelo nome' })
  await box.fill(text)
  await box.press('Enter')
}

export async function openItemRow(page, code) {
  await page.getByRole('button', { name: `Abrir ${ITEM_NAMES[code] ?? code}` }).click()
  await expect(page.locator('.ccf-lot').first()).toBeVisible()
  await page.waitForTimeout(250)
}

// Rola a página até o topo da faixa ficar logo abaixo da barra compacta (enquadramento parecido com o do mock).
export async function frameStrip(page) {
  await page.evaluate(() => {
    const strip = document.querySelector('.ccf-screen .ccf-strip')
    if (strip) window.scrollTo(0, Math.max(0, strip.getBoundingClientRect().top + window.scrollY - 62))
  })
  await page.waitForTimeout(700)
}

export function shotPath(outDir, state, size, theme, kind) {
  return path.join(outDir, `${state}-${size.width}-${theme}-${kind}.png`)
}

// ---------- captura do mock ----------

// `state.mock`: { role, scen, carga, closed, query, item }; `prepare(page)` (opcional) mexe no mock depois dos botões (abrir a folha).
export async function shootMock(page, state, size, theme, outDir) {
  await page.setViewportSize(size)
  await page.goto(pathToFileURL(MOCK_HTML).href)
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
  const click = (selector) => page.evaluate((value) => document.querySelector(value)?.click(), selector)
  const { role = 'logistica', scen = 'and', carga = 'fcl', closed = false, query = '', item = '' } = state.mock
  await click(`[data-role="${role}"]`)
  await click(`[data-scen="${scen}"]`)
  await click(`[data-carga="${carga}"]`)
  await click(`[data-closed="${closed ? 1 : 0}"]`)
  await click(`[data-sq="${query}"]`)
  if (item) await click(`.irow[data-code="${item}"]`)
  if (state.mockPrepare) await state.mockPrepare(page)
  await page.evaluate(() => document.fonts?.ready)
  await page.addStyleTag({
    content: `
      body{padding:0!important}
      .page{display:block!important;max-width:none!important;margin:0!important}
      header,.toolbar,.side{display:none!important}
      .stage{display:block!important}
      .phone{width:${size.width}px!important;max-width:none!important;height:${size.height}px!important;min-height:0!important;padding:0!important;margin:0!important;border-radius:0!important;box-shadow:none!important;position:static!important;background:transparent!important}
      .screen{width:${size.width}px!important;height:${size.height}px!important;border-radius:0!important}
    `,
  })
  await page.waitForTimeout(400)
  const file = shotPath(outDir, state.name, size, theme, 'mock')
  await page.locator('#screen').screenshot({ path: file, animations: 'disabled' })
  return file
}

export async function sideBySide(browser, mockFile, productFile, outFile, size, label, note = '') {
  const toData = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
  const page = await browser.newPage({ viewport: { width: size.width * 2 + 90, height: size.height + 90 } })
  await page.setContent(`<!doctype html><body style="margin:0;background:#5c6b73;font:600 13px sans-serif;color:#fff">
    <div style="display:flex;gap:30px;padding:20px">
      <figure style="margin:0"><figcaption style="margin-bottom:6px">mock v5 · ${label}</figcaption><img src="${toData(mockFile)}" style="display:block"></figure>
      <figure style="margin:0"><figcaption style="margin-bottom:6px">produto · ${label}${note}</figcaption><img src="${toData(productFile)}" style="display:block"></figure>
    </div></body>`)
  await page.screenshot({ path: outFile, fullPage: true })
  await page.close()
}

// ---------- R-STICKY (a barra "Buscar item" da lista; igual à da Fatia A) ----------

// Medidas da barra "Buscar item" no ponto de rolagem atual (a página rola no celular; o .main-content acima de 1040 px).
async function measureSearchBar(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.ccf-searchwrap')
    const main = document.querySelector('.main-content')
    const compact = document.querySelector('.mobile-nav-compact')
    const compactShown = Boolean(compact) && compact.classList.contains('mobile-nav-compact--visible')
    const probe = document.createElement('div')
    probe.style.background = 'var(--bg)'
    document.body.append(probe)
    const bgToken = getComputedStyle(probe).backgroundColor
    probe.remove()
    const r = wrap.getBoundingClientRect()
    const m = main.getBoundingClientRect()
    const scroller = getComputedStyle(main).overflowY === 'auto' ? main : document.scrollingElement
    const visibleTop = compactShown ? compact.getBoundingClientRect().bottom : scroller === main ? m.top : 0
    const first = (x, y) => document.elementsFromPoint(x, y)[0] ?? null
    const insideWrap = (x, y) => Boolean(first(x, y)?.closest('.ccf-searchwrap'))
    const xs = [2, Math.round(window.innerWidth / 2), window.innerWidth - 2]
    const style = getComputedStyle(wrap)
    return {
      position: style.position,
      background: style.backgroundColor,
      bgToken,
      top: r.top,
      left: r.left,
      width: r.width,
      mainLeft: m.left,
      mainWidth: m.width,
      visibleTop,
      scrollTop: scroller.scrollTop,
      stuck: wrap.classList.contains('ccf-searchwrap--stuck'),
      topHits: xs.map((x) => insideWrap(x, r.top + 1)),
      bottomHits: xs.map((x) => insideWrap(x, r.bottom - 1)),
      topOwners: xs.map((x) => first(x, r.top + 1)?.className ?? null),
    }
  })
}

export async function scrollPage(page, value) {
  await page.evaluate((y) => {
    const main = document.querySelector('.main-content')
    const scroller = getComputedStyle(main).overflowY === 'auto' ? main : document.scrollingElement
    scroller.scrollTop = y
  }, value)
  await page.waitForTimeout(500)
}

export async function expectStickyOk(page, label) {
  const { natural, max } = await page.evaluate(() => {
    const wrap = document.querySelector('.ccf-searchwrap')
    const main = document.querySelector('.main-content')
    const scroller = getComputedStyle(main).overflowY === 'auto' ? main : document.scrollingElement
    const fixedTop = Number.parseFloat(getComputedStyle(wrap).top) || 0
    const base = scroller === main ? main.getBoundingClientRect().top : 0
    const natural = wrap.getBoundingClientRect().top - base + scroller.scrollTop - fixedTop
    return { natural: Math.round(natural), max: scroller.scrollHeight - scroller.clientHeight }
  })
  expect(max, `${label}: a lista precisa rolar`).toBeGreaterThan(natural + 250)
  await scrollPage(page, 0)
  expect((await measureSearchBar(page)).stuck, `${label}: scrollTop 0 sem a classe stuck`).toBe(false)
  for (const y of [natural, natural + 1, natural + 200, max]) {
    await scrollPage(page, y)
    const m = await measureSearchBar(page)
    const at = `${label} @${y}`
    expect(m.position, `${at}: position`).toBe('sticky')
    expect(m.background, `${at}: fundo opaco (sem alfa)`).toMatch(/^rgb\(/)
    expect(m.background, `${at}: fundo = var(--bg)`).toBe(m.bgToken)
    expect(Math.abs(m.top - m.visibleTop), `${at}: folga com o topo visível (${m.top} x ${m.visibleTop})`).toBeLessThanOrEqual(0.5)
    expect(m.topHits, `${at}: o que está sobre a borda de cima da barra (${m.topOwners.join(' | ')})`).toEqual([true, true, true])
    expect(m.bottomHits, `${at}: o que está sobre a borda de baixo da barra`).toEqual([true, true, true])
    expect(Math.abs(m.width - m.mainWidth), `${at}: largura`).toBeLessThanOrEqual(1)
    expect(Math.abs(m.left - m.mainLeft), `${at}: borda esquerda`).toBeLessThanOrEqual(1)
    expect(m.stuck, `${at}: classe stuck quando rolado`).toBe(true)
  }
  await scrollPage(page, 0)
  expect((await measureSearchBar(page)).stuck, `${label}: de volta ao topo, sem stuck`).toBe(false)
}
