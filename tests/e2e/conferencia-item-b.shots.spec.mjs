// Conferência por item (Fatia B): harness de capturas lado a lado (mock v5 x produto) e das asserções de CSS computado e de
// comportamento das UNIDADES por lote e do PALLET PARCIAL (contador de 20 px, textos do mock, selo "Unidades divergentes" no lote e
// no item, topo do item "8 pallets (7 inteiros + 1 parcial)" e "200 de 250 unidades", faixa "(inclui 1 parcial)", folha do
// parcial, somente leitura, alvos de 44 px, sem fixed no .page-fade, sem rolagem horizontal a 320 px, R-STICKY, e o Salvar gravando
// as chaves novas já aceitas pelas rules do emulador). Padrão de conferencia-item.shots.spec.mjs (Fatia A); a infraestrutura
// vem de conferencia-item.shared.mjs.
//
// So roda com CONF_SHOTS=1 E CONF_FATIA=b (o job `e2e` do CI nao define as variaveis, entao tudo abaixo e `skip`).
//   CONF_MOCK_HTML  caminho do mock v5 (HTML autocontido, FORA do repositorio)
//   CONF_ONLY       (opcional) nomes de estados separados por virgula: so esses estados sao capturados (rodada rapida)
//   CONF_AUTH_HOST / CONF_FIRESTORE_HOST  (opcionais) hosts dos emuladores quando as portas padrao ja estao em uso
// Comando (PowerShell, um por linha, na raiz; precisa de JDK 21 como o `npm run test:e2e`):
//   $env:CONF_SHOTS='1'
//   $env:CONF_FATIA='b'
//   $env:CONF_MOCK_HTML='<caminho do mock-conferencia-por-item-v5.html>'
//   node scripts/with-jdk.mjs node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,storage --project demo-sqcomex "npx playwright test conferencia-item-b"
//
// Saida (fora do git): .agent-tmp/conf-item-shots/b/<estado>-<1100|390|320>-<light|dark>-{mock,produto,lado-a-lado}.png
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  AEREO,
  AVARIA,
  E2E_USERS,
  EMPTY_CONFERENCE,
  FCL,
  LOGISTICA,
  MANY,
  MANY_ROWS,
  MOCK_HTML,
  MOCK_ROWS,
  SESSIONS,
  TARE_HINT,
  THEMES,
  captureSession,
  expectStickyOk,
  frameStrip,
  getDoc,
  newContext,
  openConference,
  openItemRow,
  openPage,
  putDoc,
  seedBase,
  shootMock,
  shotPath,
  sideBySide,
  typeSearch,
  waitConferenceReady,
} from './conferencia-item.shared.mjs'

const FATIA = String(process.env.CONF_FATIA ?? '').toLowerCase()
test.skip(!process.env.CONF_SHOTS || FATIA !== 'b', 'defina CONF_SHOTS=1 e CONF_FATIA=b para gerar as capturas da Fatia B')

const OUT_DIR = path.resolve(process.cwd(), '.agent-tmp', 'conf-item-shots', 'b')
const SIZES = [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
  { width: 1100, height: 800 },
]
const PHONE = SIZES[0]
const NARROW = SIZES[1]
const CONFERENCE_DOC = (processId) => `processes/${processId}/cargoReport/conference`

// ---------- conferência seed (cenários "Em andamento" e "Tudo conferido" do seed() do mock v5, agora com unidades e parcial) ----------

const PARTIAL_R2_R6 = { id: 'pp1', parts: [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }] }

function conferenceFor(scenario, { closed = false } = {}) {
  const base = { ...EMPTY_CONFERENCE }
  const damageByRowId = { r5: { flagged: true, note: AVARIA, photos: [] } }
  if (scenario === 'and') {
    Object.assign(base, {
      okByRowId: { r1: true, r2: true, r4: true, r5: true },
      palletsByRowId: { r1: 4, r2: 3, r3: 0, r4: 4, r5: 2, r6: 2, r7: 0 },
      unitsByRowId: { r1: 100, r2: 100, r4: 150, r5: 80 },
      partialPallets: [PARTIAL_R2_R6],
      damageByRowId,
      labelsByRowId: { r1: { wms: 'W-5012-A', sq: 'SQ-5012-A' }, r2: { wms: 'W-5012-B', sq: '' } },
    })
  } else if (scenario === 'tudo') {
    Object.assign(base, {
      okByRowId: Object.fromEntries(MOCK_ROWS.map((row) => [row.id, true])),
      palletsByRowId: { r1: 4, r2: 3, r3: 2, r4: 4, r5: 2, r6: 5, r7: 1 },
      unitsByRowId: Object.fromEntries(MOCK_ROWS.map((row) => [row.id, row.qty / row.net])),
      partialPallets: [PARTIAL_R2_R6],
      damageByRowId,
      labelsByRowId: Object.fromEntries(MOCK_ROWS.map((row) => [row.id, { wms: `W-${row.code}`, sq: `SQ-${row.code}` }])),
      receiptStatus: 'com_ressalva',
      labelingOk: true,
    })
  } else if (scenario === 'antigo') {
    // Conferência gravada ANTES da Fatia B: sem as chaves `unitsByRowId` e `partialPallets`.
    Object.assign(base, { okByRowId: { r1: true }, palletsByRowId: { r1: 4, r2: 3 } })
    delete base.unitsByRowId
    delete base.partialPallets
  } else if (scenario === 'many') {
    Object.assign(base, {
      okByRowId: Object.fromEntries(MANY_ROWS.slice(0, 6).map((row) => [row.id, true])),
      palletsByRowId: Object.fromEntries(MANY_ROWS.slice(0, 6).map((row) => [row.id, 1])),
    })
  }
  if (closed) Object.assign(base, { status: 'fechada', closedDate: '2026-11-27', closedByName: 'Operador Logística', closedDocumentId: 'demo-doc-1' })
  return base
}

async function setConference(processId, scenario, options) {
  await putDoc(CONFERENCE_DOC(processId), conferenceFor(scenario, options))
}

// ---------- estados (mock x produto) ----------

const mockClick = (selector) => (page) => page.evaluate((value) => document.querySelector(value)?.click(), selector)
// Abre a folha "Pallet parcial" do lote r2 (L-2232) no mock; `other` escolhe o outro lote no select; `submit` tenta adicionar vazio.
const mockSheet = ({ other = '', submit = false } = {}) => async (page) => {
  await mockClick('[data-act="parc"][data-id="r2"]')(page)
  if (other) {
    await page.evaluate((value) => {
      const select = document.getElementById('pc-o')
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }, other)
  }
  if (submit) await mockClick('[data-act="pcok"]')(page)
}

// Rola o cartão do lote `index` (0 = primeiro) da tela do item até o topo da área visível, para ver as unidades e o parcial.
const mockScrollLot = (index) => (page) =>
  page.evaluate((position) => {
    const scroller = document.getElementById('scr')
    const lot = scroller.querySelectorAll('.lot')[position]
    scroller.scrollTop = lot.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8
  }, index)

const ALL_STATES = [
  { name: 'b-lista-andamento', mock: { scen: 'and' }, prod: { scen: 'and' } },
  { name: 'b-lista-tudo-conferido', mock: { scen: 'tudo' }, prod: { scen: 'tudo' } },
  { name: 'b-lista-aereo', mock: { scen: 'and', carga: 'aereo' }, prod: { scen: 'and', process: AEREO } },
  { name: 'b-item1-unidades-e-parcial', mock: { scen: 'and', item: 'BA5012' }, prod: { scen: 'and', item: 'BA5012' } },
  { name: 'b-item2-divergente-e-avaria', mock: { scen: 'and', item: 'BA5033' }, prod: { scen: 'and', item: 'BA5033' } },
  { name: 'b-item3-parcial-no-outro-lote', mock: { scen: 'and', item: 'BA5190' }, prod: { scen: 'and', item: 'BA5190' } },
  { name: 'b-item4-sem-lote-sem-unidades', mock: { scen: 'and', item: 'BA6001' }, prod: { scen: 'and', item: 'BA6001' } },
  { name: 'b-item1-tudo-conferido', mock: { scen: 'tudo', item: 'BA5012' }, prod: { scen: 'tudo', item: 'BA5012' } },
  { name: 'b-folha-aberta', mock: { scen: 'and', item: 'BA5012' }, mockPrepare: mockSheet(), prod: { scen: 'and', item: 'BA5012', sheet: 'L-2232' } },
  {
    name: 'b-folha-com-outro-lote',
    mock: { scen: 'and', item: 'BA5012' },
    mockPrepare: mockSheet({ other: 'r6' }),
    prod: { scen: 'and', item: 'BA5012', sheet: 'L-2232', sheetOther: 'Resina Acrílica RA-55 · A-1180' },
  },
  { name: 'b-folha-erro', mock: { scen: 'and', item: 'BA5012' }, mockPrepare: mockSheet({ submit: true }), prod: { scen: 'and', item: 'BA5012', sheet: 'L-2232', sheetSubmit: true } },
  // Cartões do lote rolados até o topo (as unidades, o parcial e o "N das unidades..." ficam abaixo da primeira dobra).
  { name: 'b-item1-lote-L-2232-parcial-e-unidades', mock: { scen: 'and', item: 'BA5012' }, mockPrepare: mockScrollLot(1), prod: { scen: 'and', item: 'BA5012', scrollLot: 'L-2232' } },
  { name: 'b-item1-lote-L-2240-sem-unidades', mock: { scen: 'and', item: 'BA5012' }, mockPrepare: mockScrollLot(2), prod: { scen: 'and', item: 'BA5012', scrollLot: 'L-2240' } },
  { name: 'b-item2-lote-Z-9910-divergente', mock: { scen: 'and', item: 'BA5033' }, mockPrepare: mockScrollLot(0), prod: { scen: 'and', item: 'BA5033', scrollLot: 'Z-9910' } },
  { name: 'b-item3-lote-A-1180-parcial-no-outro-lote', mock: { scen: 'and', item: 'BA5190' }, mockPrepare: mockScrollLot(0), prod: { scen: 'and', item: 'BA5190', scrollLot: 'A-1180' } },
  { name: 'b-item1-lote-L-2232-leitura', mock: { scen: 'tudo', closed: true, item: 'BA5012' }, mockPrepare: mockScrollLot(1), prod: { scen: 'tudo', closed: true, item: 'BA5012', scrollLot: 'L-2232' } },
  { name: 'b-lista-fechada', mock: { scen: 'tudo', closed: true }, prod: { scen: 'tudo', closed: true } },
  { name: 'b-item1-somente-leitura', mock: { scen: 'tudo', closed: true, item: 'BA5012' }, prod: { scen: 'tudo', closed: true, item: 'BA5012' } },
  { name: 'b-admin-item1-fechada', mock: { role: 'admin', scen: 'tudo', closed: true, item: 'BA5012' }, prod: { as: 'admin', scen: 'tudo', closed: true, item: 'BA5012' } },
]

const ONLY = String(process.env.CONF_ONLY ?? '').split(',').map((name) => name.trim()).filter(Boolean)
const STATES = ONLY.length > 0 ? ALL_STATES.filter((state) => ONLY.includes(state.name)) : ALL_STATES

// ---------- captura do produto ----------

const lotCard = (page, lot) => page.getByRole('article', { name: lot ? `Lote ${lot}` : 'Sem lote informado' })

async function openSheet(page, lot) {
  await lotCard(page, lot).getByRole('button', { name: 'Pallet parcial', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Pallet parcial' })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(500)
  return dialog
}

async function shootProduct(page, state, size, theme, outDir) {
  const { process: processId = FCL, query = '', item = '', sheet = '', sheetOther = '', sheetSubmit = false, scrollLot = '' } = state.prod
  const file = shotPath(outDir, state.name, size, theme, 'produto')
  // A aba Conferência é só do celular e a largura é travada na ENTRADA (ConferencePage): a captura de 1100 px é a da tela aberta
  // no celular e girada (paisagem/tablet), então entra a 390 px e só depois a janela cresce.
  const wide = size.width > 720
  if (wide) await page.setViewportSize(PHONE)
  await openConference(page, processId)
  if (query) await typeSearch(page, query)
  if (item) await openItemRow(page, item)
  if (wide) await page.setViewportSize(size)
  await frameStrip(page)
  if (scrollLot) {
    await lotCard(page, scrollLot).evaluate((node) => {
      node.scrollIntoView({ block: 'start' })
      // A barra compacta do shell (50 px + área segura) cobre o topo: o cartão fica logo abaixo dela.
      for (const scroller of [document.scrollingElement, document.querySelector('.main-content')]) scroller?.scrollBy(0, -66)
    })
    await page.waitForTimeout(500)
  }
  if (sheet) {
    const dialog = await openSheet(page, sheet)
    if (sheetOther) await dialog.getByLabel('Dividido com').selectOption({ label: sheetOther })
    if (sheetSubmit) await dialog.getByRole('button', { name: 'Adicionar pallet parcial' }).click()
    await page.waitForTimeout(300)
  }
  // Diferença esperada (D-1): a dica "tara (embalagem vazia)" sob "Peso da emb." só existe no produto; fica mascarada e é
  // provada por asserção (não pelo olho).
  const mask = [page.locator('.ccf-meta small', { hasText: TARE_HINT })]
  await page.screenshot({ path: file, mask, maskColor: '#c8c8c8', animations: 'disabled' })
  return file
}

// ---------- seed e rodada ----------

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  if (!MOCK_HTML || !fs.existsSync(MOCK_HTML)) throw new Error('defina CONF_MOCK_HTML com o caminho do mock v5 (fora do repositório)')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await seedBase()
  await setConference(FCL, 'and')
  await setConference(AEREO, 'and')
  await setConference(MANY, 'many')
  SESSIONS.logistica = await captureSession(browser, LOGISTICA)
  SESSIONS.admin = await captureSession(browser, E2E_USERS.admin)
})

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`capturas lado a lado ${size.width}x${size.height} - ${theme}`, async ({ browser }) => {
      test.setTimeout(1_200_000)
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
          const mockFile = await shootMock(mockPage, state, size, theme, OUT_DIR)
          const productFile = await shootProduct(state.prod.as === 'admin' ? adminPage : productPage, state, size, theme, OUT_DIR)
          await sideBySide(browser, mockFile, productFile, shotPath(OUT_DIR, state.name, size, theme, 'lado-a-lado'), size, `${state.name} · ${theme}`, ' (dica de tara mascarada)')
        }
      } finally {
        await setConference(FCL, 'and')
        await setConference(AEREO, 'and')
        await productContext.close()
        await adminContext.close()
        await mockContext.close()
      }
    })
  }
}

// ---------- asserções (saem != 0) ----------

async function badTargets(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const selector = 'button, input, select, summary, [role="tab"]'
    const roots = [...document.querySelectorAll('.ccf-screen, .ccf-actionbar, .ccf-psheet')]
    return roots
      .flatMap((root) => [...root.querySelectorAll(selector)])
      .filter(visible)
      .filter((node) => !node.closest('.ccf-pal__num'))
      .map((node) => {
        // O contador mede a célula; a caixa de marcar mede o rótulo (alvo de toque de 44 px).
        const target = node.closest('.ccf-cnum') ?? (node.matches('input[type="checkbox"], input[type="radio"]') ? (node.closest('label') ?? node) : node)
        const rect = target.getBoundingClientRect()
        return { text: (node.getAttribute('aria-label') || node.textContent || node.className).trim().slice(0, 40), w: Math.round(rect.width), h: Math.round(rect.height) }
      })
      .filter((entry) => entry.w < 44 || entry.h < 44)
  })
}

async function fixedInsidePageFade(page) {
  return page.evaluate(() => [...document.querySelectorAll('.page-fade *')].filter((node) => getComputedStyle(node).position === 'fixed').map((node) => node.className))
}

test.describe('asserções (390 px, claro)', () => {
  let context
  let page

  test.beforeAll(async ({ browser }) => {
    context = await newContext(browser, 'light', PHONE, 'logistica')
    page = await openPage(context)
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test.beforeEach(async () => {
    await setConference(FCL, 'and')
    await setConference(AEREO, 'and')
    await setConference(MANY, 'many')
  })

  test('lista: faixa "(inclui 1 parcial)" com o selo, selo "Unidades divergentes" no item e pallets do item com o parcial', async () => {
    await openConference(page, FCL)
    const strip = page.locator('.ccf-strip .ccf-pallets')
    await expect(strip).toContainText('16 pallets contados de 22 informados pelo COMEX (inclui 1 parcial)')
    await expect(strip.getByText('Divergente')).toBeVisible()
    // Só o Catalisador (150 de 160) está divergente; o Poliol (200 de 250) tem um lote sem contagem e nenhum divergente.
    const row = (name) => page.getByRole('button', { name: `Abrir ${name}` })
    await expect(row('Catalisador ZN-12').getByText('Unidades divergentes')).toBeVisible()
    await expect(row('Poliol Flex 3000').getByText('Unidades divergentes')).toHaveCount(0)
    await expect(row('Poliol Flex 3000').getByText('8 pallets')).toBeVisible()
    await setConference(FCL, 'tudo')
    await openConference(page, FCL)
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('22 pallets contados de 22 informados pelo COMEX (inclui 1 parcial)')
    await expect(page.locator('.ccf-strip .ccf-pallets').getByText('Confere')).toBeVisible()
  })

  test('item: textos do mock (contador de unidades, esperado, parcial, topo do item) e número de 20 px', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('8 pallets (7 inteiros + 1 parcial)')
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('200 de 250 unidades')
    const first = lotCard(page, 'L-2231')
    await expect(first.getByText('Unidades contadas (todas as embalagens do lote)')).toBeVisible()
    await expect(first.getByText(/^Esperadas:/)).toHaveText('Esperadas: 100 (Nº de emb. do relatório)')
    await expect(first.getByLabel('Unidades contadas do Lote L-2231')).toHaveValue('100')
    await expect(first.getByRole('button', { name: /^Adicionar uma unidade/ })).toHaveText('+ Unidade')
    await expect(first.getByRole('button', { name: 'Pallet parcial', exact: true })).toBeVisible()
    // O parcial aparece nos DOIS lotes, com o texto do mock.
    await expect(lotCard(page, 'L-2232').locator('.ccf-parc')).toHaveText('Pallet parcial · 30 un. deste lote + 20 un. de Resina Acrílica RA-55 · A-1180')
    await expect(lotCard(page, 'L-2232').getByText('30 das unidades contadas estão em pallet parcial.')).toBeVisible()
    await expect(first.locator('.ccf-parc')).toHaveCount(0)
    // O lote sem unidades (L-2240) não tem selo de divergência, só "Esperadas: 50".
    await expect(lotCard(page, 'L-2240').getByText('Unidades divergentes')).toHaveCount(0)
    await expect(lotCard(page, 'L-2240').getByLabel('Unidades contadas do Lote L-2240')).toHaveValue('')
    // Número em 20 px (v5): o das unidades e o dos pallets.
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.ccf-cnum input, .ccf-pal__num b')].map((node) => getComputedStyle(node).fontSize))
    expect(sizes.length).toBeGreaterThanOrEqual(6)
    for (const value of sizes) expect(value, 'número dos contadores').toBe('20px')
    // Lixeira do parcial de 44x44.
    const trash = await lotCard(page, 'L-2232').getByRole('button', { name: 'Remover este pallet parcial' }).boundingBox()
    expect(trash.width).toBeGreaterThanOrEqual(44)
    expect(trash.height).toBeGreaterThanOrEqual(44)
  })

  test('item divergente: selo e caixa âmbar no lote e " · diferença de 10"; o Poliol e o Catalisador somam certo', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA5033')
    const lot = lotCard(page, 'Z-9910')
    await expect(lot.getByText('Unidades divergentes')).toBeVisible()
    await expect(lot.getByText(/^Esperadas:/)).toHaveText('Esperadas: 160 (Nº de emb. do relatório) · diferença de 10')
    const border = await lot.locator('.ccf-cnum').evaluate((node) => getComputedStyle(node).borderColor)
    const warning = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.color = 'var(--warning)'
      document.body.append(probe)
      const value = getComputedStyle(probe).color
      probe.remove()
      return value
    })
    expect(border).toBe(warning)
    await expect(lotCard(page, 'Z-9911').getByText('Unidades divergentes')).toHaveCount(0)
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('230 de 240 unidades')
  })

  test('digitar, "+ Unidade" e "−" mexem no total; 0 e vazio não divergem; número longo vai a 17 px só em 320 px', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    const lot = lotCard(page, 'L-2240')
    const input = lot.getByLabel('Unidades contadas do Lote L-2240')
    await input.fill('49')
    await expect(lot.getByText('Unidades divergentes')).toBeVisible()
    await lot.getByRole('button', { name: /^Adicionar uma unidade/ }).click()
    await expect(input).toHaveValue('50')
    await expect(lot.getByText('Unidades divergentes')).toHaveCount(0)
    await input.fill('0')
    await expect(lot.getByText('Unidades divergentes')).toHaveCount(0)
    await input.fill('')
    await expect(lot.getByText('Unidades divergentes')).toHaveCount(0)
    // Número longo (milhar): 20 px a 390 px.
    await input.fill('12345')
    await input.blur()
    await expect(input).toHaveValue('12.345')
    expect(await input.evaluate((node) => getComputedStyle(node).fontSize)).toBe('20px')
    await page.setViewportSize(NARROW)
    expect(await input.evaluate((node) => getComputedStyle(node).fontSize), 'número longo a 320 px').toBe('17px')
    await page.setViewportSize(PHONE)
  })

  test('folha do parcial: diálogo modal no body, foco no primeiro campo, texto do mock, Esc/Cancelar/fundo fecham', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    const dialog = await openSheet(page, 'L-2232')
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('heading', { name: 'Pallet parcial' })).toBeVisible()
    await expect(dialog).toContainText('Use quando um pallet tem unidades de mais de um lote ou item. Ele conta como 1 pallet na carga e aparece nos dois lotes. Pallets inteiros continuam no contador.')
    await expect(dialog.getByText('Poliol Flex 3000 · L-2232')).toBeVisible()
    await expect(dialog.getByLabel('Unidades deste lote no pallet')).toBeFocused()
    const select = dialog.getByLabel('Dividido com')
    const options = await select.locator('option').allInnerTexts()
    expect(options).toEqual([
      'Nenhum (pallet incompleto)',
      'Poliol Flex 3000 · L-2231',
      'Poliol Flex 3000 · L-2240',
      'Catalisador ZN-12 · Z-9910',
      'Catalisador ZN-12 · Z-9911',
      'Resina Acrílica RA-55 · A-1180',
      'Aditivo AX-7 · sem lote',
    ])
    await expect(dialog.getByLabel('Unidades do outro lote no pallet')).toHaveCount(0)
    await select.selectOption({ label: 'Resina Acrílica RA-55 · A-1180' })
    await expect(dialog.getByLabel('Unidades do outro lote no pallet')).toBeVisible()
    // Portal no body (nunca dentro do .page-fade), fundo travado, folha colada na base com cantos arredondados em cima.
    const info = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        inPageFade: Boolean(node.closest('.page-fade')),
        parentIsBody: node.parentElement.parentElement === document.body,
        bodyOverflow: getComputedStyle(document.body).overflow,
        bottom: rect.bottom,
        innerHeight: window.innerHeight,
        width: rect.width,
        innerWidth: window.innerWidth,
        radiusTop: style.borderTopLeftRadius,
        radiusBottom: style.borderBottomLeftRadius,
        paddingBottom: style.paddingBottom,
      }
    })
    expect(info.inPageFade).toBe(false)
    expect(info.parentIsBody).toBe(true)
    expect(info.bodyOverflow).toBe('hidden')
    expect(Math.abs(info.bottom - info.innerHeight)).toBeLessThanOrEqual(1)
    expect(info.width).toBe(info.innerWidth)
    expect(info.radiusTop).not.toBe('0px')
    expect(info.radiusBottom).toBe('0px')
    expect(await badTargets(page), 'alvos < 44x44 com a folha aberta').toEqual([])
    expect(await fixedInsidePageFade(page)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // O foco volta ao botão que abriu a folha.
    await expect(lotCard(page, 'L-2232').getByRole('button', { name: 'Pallet parcial', exact: true })).toBeFocused()
    await openSheet(page, 'L-2232')
    await page.getByRole('dialog', { name: 'Pallet parcial' }).getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('dialog', { name: 'Pallet parcial' })).toHaveCount(0)
    await openSheet(page, 'L-2232')
    await page.mouse.click(PHONE.width / 2, 40)
    await expect(page.getByRole('dialog', { name: 'Pallet parcial' })).toHaveCount(0)
    // Nada foi adicionado.
    await expect(lotCard(page, 'L-2232').locator('.ccf-parc')).toHaveCount(1)
  })

  test('folha do parcial: validação do mock e adicionar com e sem outro lote (conta 1, aparece nos dois, remove dos dois)', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    let dialog = await openSheet(page, 'L-2231')
    await dialog.getByRole('button', { name: 'Adicionar pallet parcial' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Informe as unidades deste lote no pallet.')
    await dialog.getByLabel('Unidades deste lote no pallet').fill('7')
    await dialog.getByLabel('Dividido com').selectOption({ label: 'Catalisador ZN-12 · Z-9910' })
    await dialog.getByRole('button', { name: 'Adicionar pallet parcial' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Informe as unidades do outro lote no pallet.')
    await dialog.getByLabel('Unidades do outro lote no pallet').fill('9')
    await dialog.getByRole('button', { name: 'Adicionar pallet parcial' }).click()
    await expect(page.getByRole('dialog', { name: 'Pallet parcial' })).toHaveCount(0)
    await expect(page.getByText('Pallet parcial adicionado. Conta 1 pallet na carga.')).toBeVisible()
    await expect(lotCard(page, 'L-2231').locator('.ccf-parc')).toHaveText('Pallet parcial · 7 un. deste lote + 9 un. de Catalisador ZN-12 · Z-9910')
    await expect(lotCard(page, 'L-2231').getByText('7 das unidades contadas estão em pallet parcial.')).toBeVisible()
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('9 pallets (7 inteiros + 2 parciais)')
    // "Nenhum (pallet incompleto)".
    dialog = await openSheet(page, 'L-2240')
    await dialog.getByLabel('Unidades deste lote no pallet').fill('5')
    await dialog.getByRole('button', { name: 'Adicionar pallet parcial' }).click()
    await expect(lotCard(page, 'L-2240').locator('.ccf-parc')).toHaveText('Pallet parcial · 5 un. deste lote · pallet incompleto')
    // O parcial vale como pallet contado: o lote L-2240 (0 inteiros) passa a ter "A contar"/"Sem contagem" fora; marca OK? e fica conferido.
    await expect(lotCard(page, 'L-2240').getByText('Sem contagem')).toHaveCount(0)
    await lotCard(page, 'L-2240').getByRole('button', { name: 'OK? do Lote L-2240' }).click()
    await expect(lotCard(page, 'L-2240').getByText('Conferido')).toBeVisible()
    // No outro item o mesmo pallet aparece; remover de lá tira dos dois lados.
    await page.getByRole('button', { name: 'Voltar aos itens' }).first().click()
    await waitConferenceReady(page)
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('18 pallets contados de 22 informados pelo COMEX (inclui 3 parciais)')
    await openItemRow(page, 'BA5033')
    await expect(lotCard(page, 'Z-9910').locator('.ccf-parc')).toHaveText('Pallet parcial · 9 un. deste lote + 7 un. de Poliol Flex 3000 · L-2231')
    await lotCard(page, 'Z-9910').getByRole('button', { name: 'Remover este pallet parcial' }).click()
    await expect(page.getByText('Pallet parcial removido dos dois lotes')).toBeVisible()
    await expect(lotCard(page, 'Z-9910').locator('.ccf-parc')).toHaveCount(0)
    await page.getByRole('button', { name: 'Voltar aos itens' }).first().click()
    await waitConferenceReady(page)
    await openItemRow(page, 'BA5012')
    await expect(lotCard(page, 'L-2231').locator('.ccf-parc')).toHaveCount(0)
    await expect(lotCard(page, 'L-2240').locator('.ccf-parc')).toHaveCount(1)
  })

  test('o Salvar grava unidades e parciais (aceitos pelas rules do emulador) e a conferência volta igual; o aviso do Salvar cita as unidades divergentes', async () => {
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    await lotCard(page, 'L-2231').getByLabel('Unidades contadas do Lote L-2231').fill('99')
    const dialog = await openSheet(page, 'L-2231')
    await dialog.getByLabel('Unidades deste lote no pallet').fill('7')
    await dialog.getByRole('button', { name: 'Adicionar pallet parcial' }).click()
    await page.locator('.ccf-actionbar').getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText(/^Conferência salva às/)).toBeVisible()
    await expect(page.getByText(/No fechamento pelo computador:.*2 lotes com unidades divergentes/)).toBeVisible()
    const saved = await getDoc(CONFERENCE_DOC(FCL))
    expect(saved.unitsByRowId).toMatchObject({ r1: 99, r2: 100, r4: 150, r5: 80 })
    expect(saved.partialPallets).toHaveLength(2)
    expect(saved.partialPallets[0]).toEqual({ id: 'pp1', parts: [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }] })
    expect(saved.partialPallets[1].parts).toEqual([{ rowId: 'r1', units: 7 }])
    expect(saved.partialPallets[1].id).toMatch(/^[A-Za-z0-9_-]{1,40}$/)
    // Recarregar: tudo volta como gravado (nada se perdeu na ida e volta).
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    await expect(lotCard(page, 'L-2231').getByLabel('Unidades contadas do Lote L-2231')).toHaveValue('99')
    await expect(lotCard(page, 'L-2231').locator('.ccf-parc')).toHaveText('Pallet parcial · 7 un. deste lote · pallet incompleto')
    await expect(lotCard(page, 'L-2232').locator('.ccf-parc')).toHaveCount(1)
  })

  test('conferência antiga (sem as chaves novas) abre igual e o primeiro Salvar grava as chaves vazias (aceitas pelas rules)', async () => {
    await putDoc(CONFERENCE_DOC(AEREO), conferenceFor('antigo'))
    await openConference(page, AEREO)
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('7 pallets contados de 22 informados pelo COMEX')
    await expect(page.locator('.ccf-strip .ccf-pallets')).not.toContainText('inclui')
    await openItemRow(page, 'BA5012')
    await expect(page.locator('.ccf-strip .ccf-pallets')).toContainText('7 pallets')
    await expect(page.locator('.ccf-strip .ccf-pallets')).not.toContainText('inteiros')
    await expect(lotCard(page, 'L-2231').getByLabel('Unidades contadas do Lote L-2231')).toHaveValue('')
    await expect(page.locator('.ccf-parc')).toHaveCount(0)
    await lotCard(page, 'L-2231').getByRole('button', { name: 'Adicionar um pallet à contagem do item 1' }).click()
    await page.locator('.ccf-actionbar').getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText(/^Conferência salva às/)).toBeVisible()
    const saved = await getDoc(CONFERENCE_DOC(AEREO))
    expect(saved.unitsByRowId).toEqual({})
    expect(saved.partialPallets).toEqual([])
  })

  test('somente leitura (fechada): sem campo, botão nem lixeira; o parcial e as unidades aparecem só para ler', async () => {
    await setConference(FCL, 'tudo', { closed: true })
    await openConference(page, FCL)
    await openItemRow(page, 'BA5012')
    await expect(page.getByLabel(/^Unidades contadas do Lote/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Pallet parcial', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remover este pallet parcial' })).toHaveCount(0)
    await expect(lotCard(page, 'L-2231').locator('.ccf-cnum')).toContainText('100')
    await expect(lotCard(page, 'L-2232').locator('.ccf-parc')).toHaveText('Pallet parcial · 30 un. deste lote + 20 un. de Resina Acrílica RA-55 · A-1180')
    expect(await badTargets(page), 'alvos < 44x44 (somente leitura)').toEqual([])
  })

  test('alvos de toque >= 44x44 e sem fixed no .page-fade (item com unidades e parcial; lista com selo)', async () => {
    await openConference(page, FCL)
    expect(await badTargets(page), 'lista').toEqual([])
    expect(await fixedInsidePageFade(page)).toEqual([])
    await openItemRow(page, 'BA5012')
    expect(await badTargets(page), 'item').toEqual([])
    await lotCard(page, 'L-2231').locator('summary').click()
    expect(await badTargets(page), 'item com Etiquetas, fotos e avaria aberto').toEqual([])
    expect(await fixedInsidePageFade(page)).toEqual([])
  })

  test('R-STICKY continua valendo na lista (16 itens: sem busca; busca; busca + Só pendentes)', async () => {
    await openConference(page, MANY)
    await expect(page.locator('.ccf-irow')).toHaveCount(16)
    await expectStickyOk(page, 'sem busca')
    await typeSearch(page, 'item demo')
    await expect(page.locator('.ccf-irow')).toHaveCount(16)
    await expectStickyOk(page, 'com busca')
    await page.getByRole('checkbox', { name: 'Só pendentes' }).check()
    await expect(page.locator('.ccf-irow')).toHaveCount(10)
    await expectStickyOk(page, 'busca + Só pendentes')
  })
})

test.describe('asserções (320 px)', () => {
  test('sem rolagem horizontal na lista, no item com parcial/unidades e com a folha aberta, claro e escuro', async ({ browser }) => {
    test.setTimeout(400_000)
    for (const theme of THEMES) {
      const context = await newContext(browser, theme, NARROW, 'logistica')
      try {
        const page = await openPage(context)
        await setConference(FCL, 'and')
        const noOverflow = () =>
          page.evaluate(() => ({
            page: document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth,
            main: document.querySelector('.main-content').scrollWidth <= document.querySelector('.main-content').clientWidth,
            modal: [...document.querySelectorAll('.ccf-psheet')].every((node) => node.scrollWidth <= node.clientWidth),
          }))
        await openConference(page, FCL)
        expect(await noOverflow(), `lista 320 ${theme}`).toMatchObject({ page: true, main: true })
        for (const code of ['BA5012', 'BA5033', 'BA5190']) {
          await openItemRow(page, code)
          expect(await noOverflow(), `item ${code} 320 ${theme}`).toMatchObject({ page: true, main: true })
          expect(await badTargets(page), `alvos item ${code} 320 ${theme}`).toEqual([])
          await page.goBack()
          await waitConferenceReady(page)
        }
        await openItemRow(page, 'BA5012')
        const dialog = await openSheet(page, 'L-2232')
        await dialog.getByLabel('Dividido com').selectOption({ label: 'Resina Acrílica RA-55 · A-1180' })
        expect(await noOverflow(), `folha 320 ${theme}`).toMatchObject({ page: true, main: true, modal: true })
        expect(await badTargets(page), `alvos da folha 320 ${theme}`).toEqual([])
        // Número longo: 17 px a 320 px.
        await page.keyboard.press('Escape')
        const input = lotCard(page, 'L-2240').getByLabel('Unidades contadas do Lote L-2240')
        await input.fill('12345')
        await input.blur()
        expect(await input.evaluate((node) => getComputedStyle(node).fontSize), `número longo 320 ${theme}`).toBe('17px')
        expect(await noOverflow(), `item com número longo 320 ${theme}`).toMatchObject({ page: true, main: true })
      } finally {
        await context.close()
      }
    }
  })
})

test.describe('asserções (1100 px)', () => {
  test('a folha vira caixa centrada, a tela do item cabe sem rolagem horizontal', async ({ browser }) => {
    test.setTimeout(200_000)
    // A tela entra a 390 px (a largura é travada na entrada) e a janela cresce depois (paisagem/tablet).
    const context = await newContext(browser, 'light', PHONE, 'logistica')
    try {
      const page = await openPage(context)
      await setConference(FCL, 'and')
      await openConference(page, FCL)
      await openItemRow(page, 'BA5012')
      await page.setViewportSize(SIZES[2])
      await page.waitForTimeout(400)
      const dialog = await openSheet(page, 'L-2232')
      const box = await dialog.boundingBox()
      expect(box.width).toBeLessThan(SIZES[2].width)
      expect(Math.abs(box.x + box.width / 2 - SIZES[2].width / 2)).toBeLessThanOrEqual(2)
      await page.keyboard.press('Escape')
      const fits = await page.evaluate(() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth)
      expect(fits).toBe(true)
    } finally {
      await context.close()
    }
  })
})
