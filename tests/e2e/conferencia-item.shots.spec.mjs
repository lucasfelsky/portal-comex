// Conferência por item (Fatia A): harness de capturas lado a lado (mock v5 x produto) e das asserções de CSS computado e
// de comportamento (R-STICKY, contador de 20 px, dica de tara, alvos de 44 px, sem fixed no .page-fade, sem rolagem
// horizontal, textos do mock, busca mantida, Próximo item, voltar do aparelho e rolagem). Padrão de refino-visual.shots.spec.mjs.
//
// So roda com CONF_SHOTS=1 (o job `e2e` do CI nao define a variavel, entao tudo abaixo e `skip` e nenhum seed e executado).
//   CONF_FATIA   a | b | c  (estados; a Fatia A so tem os estados "a")
//   CONF_MOCK_HTML  caminho do mock v5 (HTML autocontido, FORA do repositorio)
//   CONF_AUTH_HOST / CONF_FIRESTORE_HOST  (opcionais) hosts dos emuladores quando as portas padrao ja estao em uso
//                (rodada isolada: config do Playwright/Vite/firebase com portas deslocadas, so em .agent-tmp, fora do git)
// Comando (PowerShell, um por linha, na raiz; precisa de JDK 21 como o `npm run test:e2e`):
//   $env:CONF_SHOTS='1'
//   $env:CONF_FATIA='a'
//   $env:CONF_MOCK_HTML='<caminho do mock-conferencia-por-item-v5.html>'
//   node scripts/with-jdk.mjs node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,storage --project demo-sqcomex "npx playwright test conferencia-item"
//
// Seed sintetico via REST do emulador (`Authorization: Bearer owner`), SO com os dados inventados do mock: processo "DEMO 001"
// (FCL, 3 conteineres, "Fornecedor Alfa Ltda"), um segundo AEREO e uma variante de 16 itens ("Item Demo 01..16"). Nenhum dado real.
// Saida (fora do git): .agent-tmp/conf-item-shots/<fatia>/<estado>-<390|320>-<light|dark>-{mock,produto,lado-a-lado}.png
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

test.skip(!process.env.CONF_SHOTS, 'defina CONF_SHOTS=1 para gerar as capturas da conferência por item')

const FATIA = String(process.env.CONF_FATIA ?? 'a').toLowerCase()
const MOCK_HTML = process.env.CONF_MOCK_HTML ?? ''
const OUT_DIR = path.resolve(process.cwd(), '.agent-tmp', 'conf-item-shots', FATIA)
// Os hosts dos emuladores podem ser trocados por variável (rodada isolada quando as portas padrão já estão em uso).
const AUTH_HOST = process.env.CONF_AUTH_HOST ?? 'http://127.0.0.1:9099'
const FIRESTORE_HOST = process.env.CONF_FIRESTORE_HOST ?? 'http://127.0.0.1:8080'
const PROJECT_ID = 'demo-sqcomex'
const DOCS = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const FROZEN_NOW = new Date('2026-11-27T11:40:00-03:00')
const THEMES = ['light', 'dark']
const SIZES = [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]
const DESKTOP = { width: 1280, height: 800 }
const LOGISTICA = { email: 'e2e-logistica@sqquimica.com', password: 'senha-e2e-logistica', name: 'Operador Logística', role: 'logistica', status: 'Ativo' }
const FCL = 'demo-001'
const AEREO = 'demo-aereo'
const MANY = 'demo-16'
const TARE_HINT = 'tara (embalagem vazia)'

// ---------- dados inventados (iguais aos do mock v5) ----------

const MOCK_ROWS = [
  { id: 'r1', code: 'BA5012', sq: 'Poliol Flex 3000', sup: 'POLYETHER POLYOL PE-3000', lot: 'L-2231', qty: 20000, net: 200, pk: 9.8, pkg: 'Tambor 200 L' },
  { id: 'r2', code: 'BA5012', sq: 'Poliol Flex 3000', sup: 'POLYETHER POLYOL PE-3000', lot: 'L-2232', qty: 20000, net: 200, pk: 9.8, pkg: 'Tambor 200 L' },
  { id: 'r3', code: 'BA5012', sq: 'Poliol Flex 3000', sup: 'POLYETHER POLYOL PE-3000 TYPE B', lot: 'L-2240', qty: 10000, net: 200, pk: null, pkg: 'Tambor 200 L' },
  { id: 'r4', code: 'BA5033', sq: 'Catalisador ZN-12', sup: 'ZINC CATALYST ZN12', lot: 'Z-9910', qty: 4000, net: 25, pk: 0.12, pkg: 'Saco 25 kg' },
  { id: 'r5', code: 'BA5033', sq: 'Catalisador ZN-12', sup: 'ZINC CATALYST ZN12', lot: 'Z-9911', qty: 2000, net: 25, pk: 0.12, pkg: 'Saco 25 kg' },
  { id: 'r6', code: 'BA5190', sq: 'Resina Acrílica RA-55', sup: 'ACRYLIC RESIN AR-55 (50%)', lot: 'A-1180', qty: 20000, net: 200, pk: 9.5, pkg: 'Tambor 200 L' },
  { id: 'r7', code: 'BA6001', sq: 'Aditivo AX-7', sup: 'ADDITIVE AX7 POWDER', lot: '', qty: 300, net: 25, pk: 0.4, pkg: 'Saco 25 kg' },
]
const ITEM_NAMES = { BA5012: 'Poliol Flex 3000', BA5033: 'Catalisador ZN-12', BA5190: 'Resina Acrílica RA-55', BA6001: 'Aditivo AX-7' }
const AVARIA = '2 sacos rasgados na lateral do pallet, produto exposto.'
const MANY_ROWS = Array.from({ length: 16 }, (_, index) => {
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

async function putDoc(docPath, data) {
  const response = await fetch(`${DOCS}/${docPath}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }),
  })
  if (!response.ok) throw new Error(`seed ${docPath}: ${await response.text()}`)
}

async function post(url, body) {
  const response = await fetch(`${AUTH_HOST}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  })
  return { ok: response.ok, payload: await response.json() }
}

// Usuário (logística e admin), como em refino-visual.shots.spec.mjs (createLogisticaUser). Se já existe (o global-setup do
// E2E criou o admin), não faz nada.
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
    // 'Carga recebida' + cargoReceivedAt na semana vigente: o processo entra na lista de conferência (o Portal limpa a cascata de coleta
    // de quem não tem DUIMP/coleta; esse é o caminho curto que o refino visual também usa).
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

const EMPTY_CONFERENCE = {
  schemaVersion: 1,
  revision: 2,
  status: 'aberta',
  okByRowId: {},
  countOkByRowId: {},
  palletsByRowId: {},
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

// Cenários "Em andamento" e "Tudo conferido" do seed() do mock (Fatia A: sem unidades, parciais nem descarga por unidade).
function conferenceFor(scenario, { closed = false } = {}) {
  const base = { ...EMPTY_CONFERENCE }
  const damageByRowId = { r5: { flagged: true, note: AVARIA, photos: [] } }
  if (scenario === 'and') {
    Object.assign(base, {
      okByRowId: { r1: true, r2: true, r4: true, r5: true },
      palletsByRowId: { r1: 4, r2: 3, r3: 0, r4: 4, r5: 2, r6: 2, r7: 0 },
      damageByRowId,
      labelsByRowId: { r1: { wms: 'W-5012-A', sq: 'SQ-5012-A' }, r2: { wms: 'W-5012-B', sq: '' } },
    })
  } else if (scenario === 'tudo') {
    Object.assign(base, {
      okByRowId: Object.fromEntries(MOCK_ROWS.map((row) => [row.id, true])),
      palletsByRowId: { r1: 4, r2: 3, r3: 2, r4: 4, r5: 2, r6: 5, r7: 1 },
      damageByRowId,
      labelsByRowId: Object.fromEntries(MOCK_ROWS.map((row) => [row.id, { wms: `W-${row.code}`, sq: `SQ-${row.code}` }])),
      receiptStatus: 'com_ressalva',
      labelingOk: true,
    })
  } else if (scenario === 'many') {
    // 6 dos 16 itens conferidos: o "Só pendentes" esconde 6 e a lista segue comprida.
    Object.assign(base, {
      okByRowId: Object.fromEntries(MANY_ROWS.slice(0, 6).map((row) => [row.id, true])),
      palletsByRowId: Object.fromEntries(MANY_ROWS.slice(0, 6).map((row) => [row.id, 1])),
    })
  }
  if (closed) Object.assign(base, { status: 'fechada', closedDate: '2026-11-27', closedByName: 'Operador Logística', closedDocumentId: 'demo-doc-1' })
  return base
}

async function setConference(processId, scenario, options) {
  await putDoc(`processes/${processId}/cargoReport/conference`, conferenceFor(scenario, options))
}

async function seedAll() {
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
    items: [
      ...MOCK_ROWS.map((row) => ({ code: row.code, description: row.sup, packagingType: row.pkg, netWeightKg: row.net })),
    ].filter((item, index, list) => list.findIndex((other) => other.code === item.code) === index),
  })
  await seedProcess(FCL, { category: 'FCL', rows: MOCK_ROWS, expectedPallets: 22 })
  await seedProcess(AEREO, { category: 'AEREO', rows: MOCK_ROWS, expectedPallets: 22 })
  await seedProcess(MANY, { category: 'FCL', rows: MANY_ROWS, expectedPallets: 16 })
  await setConference(FCL, 'and')
  await setConference(AEREO, 'and')
  await setConference(MANY, 'many')
}

// ---------- estados (mock x produto) ----------
// mock: { role, scen, carga, closed, query, item } (botões da barra do mock); produto: { as, process, scen, closed, query, item }.

const STATES = [
  { name: 'lista-andamento', mock: { scen: 'and' }, prod: { scen: 'and' } },
  { name: 'lista-busca-resultado', mock: { scen: 'and', query: 'acrilica' }, prod: { scen: 'and', query: 'acrilica' } },
  { name: 'lista-busca-sem-resultado', mock: { scen: 'and', query: 'tinta' }, prod: { scen: 'and', query: 'tinta' } },
  { name: 'lista-busca-fornecedor', mock: { scen: 'and', query: 'zinc catalyst' }, prod: { scen: 'and', query: 'zinc catalyst' } },
  { name: 'lista-aereo', mock: { scen: 'and', carga: 'aereo' }, prod: { scen: 'and', process: AEREO } },
  { name: 'lista-tudo-conferido', mock: { scen: 'tudo' }, prod: { scen: 'tudo' } },
  { name: 'item1-andamento', mock: { scen: 'and', item: 'BA5012' }, prod: { scen: 'and', item: 'BA5012' } },
  { name: 'item2-avaria', mock: { scen: 'and', item: 'BA5033' }, prod: { scen: 'and', item: 'BA5033' } },
  { name: 'item4-sem-lote', mock: { scen: 'and', item: 'BA6001' }, prod: { scen: 'and', item: 'BA6001' } },
  { name: 'item1-tudo-conferido', mock: { scen: 'tudo', item: 'BA5012' }, prod: { scen: 'tudo', item: 'BA5012' } },
  { name: 'lista-fechada', mock: { scen: 'tudo', closed: true }, prod: { scen: 'tudo', closed: true } },
  { name: 'item1-fechada', mock: { scen: 'tudo', closed: true, item: 'BA5012' }, prod: { scen: 'tudo', closed: true, item: 'BA5012' } },
  { name: 'admin-lista-fechada', mock: { role: 'admin', scen: 'tudo', closed: true }, prod: { as: 'admin', scen: 'tudo', closed: true } },
]

// ---------- infraestrutura ----------

// Sessões já autenticadas (um login por usuário no começo da rodada; o Firebase Auth guarda a sessão no IndexedDB).
const SESSIONS = {}

async function newContext(browser, theme, viewport, who) {
  const context = await browser.newContext({
    viewport,
    storageState: SESSIONS[who],
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
    reducedMotion: 'reduce',
  })
  // Tema antes de qualquer navegação (o script inline do index.html lê o localStorage).
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem('pc-theme', value)
    } catch {
      /* ignora */
    }
  }, theme)
  return context
}

async function openPage(context) {
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

// Entra no desktop (o título "Visão geral" é conferido lá) e guarda a sessão; os contextos do celular já nascem autenticados.
async function captureSession(browser, credentials) {
  const context = await browser.newContext({ viewport: DESKTOP, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  try {
    const page = await context.newPage()
    await login(page, credentials)
    return await context.storageState({ indexedDB: true })
  } finally {
    await context.close()
  }
}

async function waitConferenceReady(page) {
  await expect(page.locator('.ccf-screen .ccf-strip').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.ccf-screen .ccf-skeletons')).toHaveCount(0, { timeout: 20_000 })
  await page.waitForTimeout(350)
}

async function openConference(page, processId) {
  await page.goto(`/conferencia?processo=${processId}`)
  await waitConferenceReady(page)
}

// Digita na busca e fecha o teclado (Enter), como a pessoa faz antes de tocar num item: com o campo em foco a barra de ações e a
// navegação de baixo saem de cena e voltam no blur, o que mudaria o alvo do toque no meio do clique.
async function typeSearch(page, text) {
  const box = page.getByRole('textbox', { name: 'Buscar item pelo nome' })
  await box.fill(text)
  await box.press('Enter')
}

async function openItemRow(page, code) {
  await page.getByRole('button', { name: `Abrir ${ITEM_NAMES[code] ?? code}` }).click()
  await expect(page.locator('.ccf-lot').first()).toBeVisible()
  await page.waitForTimeout(250)
}

// Rola a página até o topo da faixa ficar logo abaixo da barra compacta (enquadramento parecido com o do mock).
async function frameStrip(page) {
  await page.evaluate(() => {
    const strip = document.querySelector('.ccf-screen .ccf-strip')
    if (strip) window.scrollTo(0, Math.max(0, strip.getBoundingClientRect().top + window.scrollY - 62))
  })
  await page.waitForTimeout(700)
}

function shotPath(state, size, theme, kind) {
  return path.join(OUT_DIR, `${state}-${size.width}-${theme}-${kind}.png`)
}

// ---------- captura do mock ----------

async function shootMock(page, state, size, theme) {
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
  const file = shotPath(state.name, size, theme, 'mock')
  await page.locator('#screen').screenshot({ path: file, animations: 'disabled' })
  return file
}

// ---------- captura do produto ----------

async function shootProduct(page, state, size, theme) {
  const { process: processId = FCL, query = '', item = '' } = state.prod
  const file = shotPath(state.name, size, theme, 'produto')
  await openConference(page, processId)
  if (query) await typeSearch(page, query)
  if (item) await openItemRow(page, item)
  await frameStrip(page)
  // Diferença esperada (D-1): a dica "tara (embalagem vazia)" sob "Peso da emb." só existe no produto; fica mascarada e é
  // provada por asserção (não pelo olho).
  const mask = [page.locator('.ccf-meta small', { hasText: TARE_HINT })]
  await page.screenshot({ path: file, mask, maskColor: '#c8c8c8', animations: 'disabled' })
  return file
}

async function sideBySide(browser, mockFile, productFile, outFile, size, label) {
  const toData = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
  const page = await browser.newPage({ viewport: { width: size.width * 2 + 90, height: size.height + 90 } })
  await page.setContent(`<!doctype html><body style="margin:0;background:#5c6b73;font:600 13px sans-serif;color:#fff">
    <div style="display:flex;gap:30px;padding:20px">
      <figure style="margin:0"><figcaption style="margin-bottom:6px">mock v5 · ${label}</figcaption><img src="${toData(mockFile)}" style="display:block"></figure>
      <figure style="margin:0"><figcaption style="margin-bottom:6px">produto · ${label} (dica de tara mascarada)</figcaption><img src="${toData(productFile)}" style="display:block"></figure>
    </div></body>`)
  await page.screenshot({ path: outFile, fullPage: true })
  await page.close()
}

// ---------- seed e rodada ----------

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  if (FATIA !== 'a') throw new Error(`CONF_FATIA='${FATIA}': esta rodada só tem os estados da Fatia A (b e c entram com as suas fatias)`)
  if (!MOCK_HTML || !fs.existsSync(MOCK_HTML)) throw new Error('defina CONF_MOCK_HTML com o caminho do mock v5 (fora do repositório)')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await seedAll()
  SESSIONS.logistica = await captureSession(browser, LOGISTICA)
  SESSIONS.admin = await captureSession(browser, E2E_USERS.admin)
})

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`capturas lado a lado ${size.width}x${size.height} - ${theme}`, async ({ browser }) => {
      test.setTimeout(900_000)
      const productContext = await newContext(browser, theme, size, 'logistica')
      const adminContext = await newContext(browser, theme, size, 'admin')
      const mockContext = await newContext(browser, theme, size)
      try {
        const productPage = await openPage(productContext)
        const adminPage = await openPage(adminContext)
        const mockPage = await mockContext.newPage()

        for (const state of STATES) {
          const { process: processId = FCL, scen = 'and', closed = false } = state.prod
          await setConference(processId, scen, { closed })
          const mockFile = await shootMock(mockPage, state, size, theme)
          const productFile = await shootProduct(state.prod.as === 'admin' ? adminPage : productPage, state, size, theme)
          await sideBySide(browser, mockFile, productFile, shotPath(state.name, size, theme, 'lado-a-lado'), size, `${state.name} · ${theme}`)
        }
        await setConference(FCL, 'and')
        await setConference(AEREO, 'and')
      } finally {
        await productContext.close()
        await adminContext.close()
        await mockContext.close()
      }
    })
  }
}

// ---------- asserções (saem != 0) ----------

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
      bottom: r.bottom,
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

async function scrollPage(page, value) {
  await page.evaluate((y) => {
    const main = document.querySelector('.main-content')
    const scroller = getComputedStyle(main).overflowY === 'auto' ? main : document.scrollingElement
    scroller.scrollTop = y
  }, value)
  await page.waitForTimeout(500)
}

async function stickyTargets(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.ccf-searchwrap')
    const main = document.querySelector('.main-content')
    const scroller = getComputedStyle(main).overflowY === 'auto' ? main : document.scrollingElement
    const fixedTop = Number.parseFloat(getComputedStyle(wrap).top) || 0
    const base = scroller === main ? main.getBoundingClientRect().top : 0
    const natural = wrap.getBoundingClientRect().top - base + scroller.scrollTop - fixedTop
    return { natural: Math.round(natural), max: scroller.scrollHeight - scroller.clientHeight }
  })
}

async function expectStickyOk(page, label) {
  const { natural, max } = await stickyTargets(page)
  expect(max, `${label}: a lista precisa rolar`).toBeGreaterThan(natural + 250)
  // Antes de fixar, no topo (sem classe) e depois, 1 px, 200 px e até o fim.
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
    // Prova visual (fora do git): a barra fixa logo abaixo da barra compacta, com a lista passando por baixo.
    if (y === natural + 200) await page.screenshot({ path: path.join(OUT_DIR, `sticky-${label.replace(/[^a-z0-9]+/gi, '-')}-390.png`) })
  }
  await scrollPage(page, 0)
  expect((await measureSearchBar(page)).stuck, `${label}: de volta ao topo, sem stuck`).toBe(false)
}

test.describe('asserções (390 px, claro)', () => {
  let context
  let page

  test.beforeAll(async ({ browser }) => {
    context = await newContext(browser, 'light', SIZES[0], 'logistica')
    page = await openPage(context)
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test.beforeEach(async () => {
    await setConference(FCL, 'and')
    await setConference(MANY, 'many')
  })

  test('R-STICKY: busca sticky opaca, sem folga, nada aparece atrás (lista de 16 itens; busca; busca + Só pendentes)', async () => {
    await openConference(page, MANY)
    await expect(page.locator('.ccf-irow')).toHaveCount(16)
    await expectStickyOk(page, 'sem busca')

    await typeSearch(page, 'item demo')
    await expect(page.locator('.ccf-irow')).toHaveCount(16)
    await expectStickyOk(page, 'com busca')

    await page.getByRole('checkbox', { name: 'Só pendentes' }).check()
    // 6 itens conferidos saem; a busca e o filtro valem juntos.
    await expect(page.locator('.ccf-irow')).toHaveCount(10)
    await expect(page.getByText(/^10 de 16 itens$/)).toBeVisible()
    await expectStickyOk(page, 'busca + Só pendentes')
  })

  test('lista: textos do mock e busca (acrilica, zinc catalyst, tinta)', async () => {
    await openConference(page, FCL)
    const search = page.getByRole('textbox', { name: 'Buscar item pelo nome' })
    await expect(search).toHaveAttribute('placeholder', 'Buscar item')
    await expect(page.locator('.ccf-irow')).toHaveCount(4)
    await typeSearch(page, 'acrilica')
    await expect(page.locator('.ccf-irow')).toHaveCount(1)
    await expect(page.getByText(/^1 de 4 itens$/)).toBeVisible()
    await typeSearch(page, 'zinc catalyst')
    await expect(page.getByText('Achado pelo nome no fornecedor')).toBeVisible()
    await typeSearch(page, 'ba6001')
    await expect(page.getByText('Achado pelo código BA6001')).toBeVisible()
    await typeSearch(page, 'tinta')
    await expect(page.getByText('Nenhum item encontrado para “tinta”.')).toBeVisible()
    await page.getByRole('button', { name: 'Limpar busca' }).and(page.locator('.secondary-button')).click()
    await expect(search).toHaveValue('')
    await expect(page.locator('.ccf-irow')).toHaveCount(4)
  })

  test('item: textos do mock, dica de tara, "Falta informar" e contador de 20 px', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    await expect(page.getByText('Item 1 de 4')).toBeVisible()
    await expect(page.getByText('Nome no fornecedor:').first()).toBeVisible()
    await expect(page.getByText('Nome diferente do fornecedor')).toBeVisible()
    await expect(page.getByText('Pallets contados (inteiros)').first()).toBeVisible()
    await expect(page.getByText('Etiquetas, fotos e avaria').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Próximo item/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Salvar' })).toBeVisible()

    // D-1: com peso, o <small> sob "Peso da emb." tem o texto exato; sem peso (L-2240), "Falta informar" e NENHUMA dica.
    const cell = (lot) => page.getByRole('article', { name: `Lote ${lot}` }).locator('.ccf-meta__item', { has: page.locator('dt', { hasText: 'Peso da emb.' }) })
    for (const lot of ['L-2231', 'L-2232']) {
      await expect(cell(lot).locator('small')).toHaveText(TARE_HINT)
      await expect(cell(lot).getByText('Falta informar')).toHaveCount(0)
    }
    await expect(cell('L-2240').getByText('Falta informar')).toBeVisible()
    await expect(cell('L-2240').locator('small')).toHaveCount(0)
    // O "Nº de emb." tem o seu <small> (tipo da embalagem) no mesmo padrão.
    await expect(page.getByRole('article', { name: 'Lote L-2231' }).locator('.ccf-meta__item', { has: page.locator('dt', { hasText: 'Nº de emb.' }) }).locator('small')).toHaveText('Tambor 200 L')

    const sizes = await page.evaluate(() => [...document.querySelectorAll('.ccf-pal__num b')].map((node) => getComputedStyle(node).fontSize))
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) expect(size, 'número do contador de pallets').toBe('20px')
  })

  test('item sem lote e item com avaria (details abre sozinho)', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA6001')
    await expect(page.getByText('Item 4 de 4')).toBeVisible()
    await expect(page.getByRole('article', { name: 'Sem lote informado' })).toBeVisible()
    // Último item: "Voltar aos itens" no lugar de "Próximo item".
    await expect(page.locator('.ccf-actionbar').getByRole('button', { name: 'Voltar aos itens' })).toBeVisible()
    await expect(page.locator('.ccf-actionbar').getByRole('button', { name: /Próximo item/ })).toHaveCount(0)
    await page.locator('.ccf-actionbar').getByRole('button', { name: 'Voltar aos itens' }).click()
    await openItemRow(page, 'BA5033')
    await expect(page.locator('.ccf-more[open]')).toHaveCount(1)
    await expect(page.locator('.ccf-more[open] textarea').first()).toHaveValue(AVARIA)
  })

  test('alvos de toque >= 44x44 (lista com busca, item e item aberto), sem fixed no .page-fade', async () => {
    const checkTargets = async (label) => {
      const bad = await page.evaluate(() => {
        const visible = (node) => {
          const rect = node.getBoundingClientRect()
          const style = getComputedStyle(node)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        }
        const selector = 'button, input, select, summary, [role="tab"]'
        const roots = [...document.querySelectorAll('.ccf-screen, .ccf-actionbar')]
        const nodes = roots.flatMap((root) => [...root.querySelectorAll(selector)])
        return nodes
          .filter(visible)
          // O contador mede a célula; a caixa de marcar mede o rótulo (alvo de toque de 44 px).
          .filter((node) => !node.closest('.ccf-pal__num'))
          .map((node) => {
            const target = node.matches('input[type="checkbox"], input[type="radio"]') ? (node.closest('label') ?? node) : node
            const rect = target.getBoundingClientRect()
            return { text: (node.getAttribute('aria-label') || node.textContent || node.className).trim().slice(0, 40), w: Math.round(rect.width), h: Math.round(rect.height) }
          })
          .filter((item) => item.w < 44 || item.h < 44)
      })
      expect(bad, `${label}: alvos menores que 44x44`).toEqual([])
      const fixed = await page.evaluate(() =>
        [...document.querySelectorAll('.page-fade *')].filter((node) => getComputedStyle(node).position === 'fixed').map((node) => node.className)
      )
      expect(fixed, `${label}: position: fixed dentro do .page-fade`).toEqual([])
    }
    await openConference(page, FCL)
    await typeSearch(page, 'poliol')
    await checkTargets('lista com busca')
    await openItemRow(page, 'BA5012')
    await checkTargets('item')
    await page.locator('.ccf-lot').first().locator('summary').click()
    await checkTargets('item com Etiquetas, fotos e avaria aberto')
  })

  test('busca mantida ao voltar; Próximo item pula o que ficou fora; voltar do aparelho; rolagem restaurada', async () => {
    await openConference(page, FCL)
    const search = page.getByRole('textbox', { name: 'Buscar item pelo nome' })
    await typeSearch(page, 'a')
    await expect(page.locator('.ccf-irow')).toHaveCount(4)
    // Busca "ax7": só o Aditivo; "Próximo item" não anda e o item é o último da busca.
    await typeSearch(page, 'ax7')
    await expect(page.locator('.ccf-irow')).toHaveCount(1)
    await openItemRow(page, 'BA6001')
    await expect(page.locator('.ccf-actionbar').getByRole('button', { name: /Próximo item/ })).toHaveCount(0)
    await page.goBack()
    await waitConferenceReady(page)
    expect(page.url()).toContain('/conferencia?processo=demo-001')
    expect(page.url()).not.toContain('item=')
    await expect(search).toHaveValue('ax7')

    // Variante de 16 itens, busca "5": só os itens 05 e 15. O Próximo item pula os 9 do meio, na posição da lista inteira.
    await openConference(page, MANY)
    await typeSearch(page, '5')
    await expect(page.locator('.ccf-irow')).toHaveCount(2)
    await page.getByRole('button', { name: 'Abrir Item Demo 05' }).click()
    await expect(page.getByText('Item 5 de 16')).toBeVisible()
    await page.locator('.ccf-actionbar').getByRole('button', { name: /Próximo item/ }).click()
    await expect(page.getByText('Item 15 de 16')).toBeVisible()
    await expect(page.locator('.ccf-actionbar').getByRole('button', { name: /Próximo item/ })).toHaveCount(0)
    // O Próximo item trocou a entrada do histórico: um só voltar leva à lista, com a busca mantida.
    await page.goBack()
    await waitConferenceReady(page)
    await expect(page.getByRole('textbox', { name: 'Buscar item pelo nome' })).toHaveValue('5')
    await expect(page.locator('.ccf-irow')).toHaveCount(2)

    // A lista de 16 itens volta na mesma posição de rolagem.
    await openConference(page, MANY)
    await scrollPage(page, 420)
    const before = (await measureSearchBar(page)).scrollTop
    expect(before).toBeGreaterThan(300)
    await page.getByRole('button', { name: /^Abrir Item Demo 12$/ }).click()
    await expect(page.locator('.ccf-lot').first()).toBeVisible()
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => document.scrollingElement.scrollTop), 'abrir o item sobe ao topo').toBeLessThan(5)
    await page.goBack()
    await waitConferenceReady(page)
    await expect.poll(() => page.evaluate(() => document.scrollingElement.scrollTop)).toBeGreaterThan(before - 4)
  })

  test('com o campo de busca em foco (teclado aberto) a barra de ações e a navegação de baixo saem de cena', async () => {
    await openConference(page, FCL)
    const search = page.getByRole('textbox', { name: 'Buscar item pelo nome' })
    await search.focus()
    await expect(page.locator('body.ccf-kbd')).toHaveCount(1)
    await expect(page.locator('.ccf-actionbar')).toBeHidden()
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden()
    await page.keyboard.press('Enter')
    await expect(page.locator('body.ccf-kbd')).toHaveCount(0)
    await expect(page.locator('.ccf-actionbar')).toBeVisible()
  })
})

test.describe('asserções (320 px)', () => {
  test('sem rolagem horizontal na lista e no item, claro e escuro', async ({ browser }) => {
    test.setTimeout(300_000)
    for (const theme of THEMES) {
      const context = await newContext(browser, theme, SIZES[1], 'logistica')
      try {
        const page = await openPage(context)
        await setConference(FCL, 'and')
        const noOverflow = () =>
          page.evaluate(() => ({
            page: document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth,
            main: document.querySelector('.main-content').scrollWidth <= document.querySelector('.main-content').clientWidth,
            sizes: [...document.querySelectorAll('.ccf-pal__num b')].map((node) => getComputedStyle(node).fontSize),
          }))
        await openConference(page, FCL)
        expect(await noOverflow(), `lista 320 ${theme}`).toMatchObject({ page: true, main: true })
        await typeSearch(page, 'acrilica')
        expect(await noOverflow(), `lista com busca 320 ${theme}`).toMatchObject({ page: true, main: true })
        await typeSearch(page, '')
        for (const code of ['BA5012', 'BA5033']) {
          await openItemRow(page, code)
          expect(await noOverflow(), `item ${code} 320 ${theme}`).toMatchObject({ page: true, main: true })
          await page.goBack()
          await waitConferenceReady(page)
        }
      } finally {
        await context.close()
      }
    }
  })
})
