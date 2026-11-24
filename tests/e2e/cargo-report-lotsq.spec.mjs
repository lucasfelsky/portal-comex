// S6 do Relatorio de Carga: coluna LOTE SQ sem corte (desktop 1280 e 1440, mobile 390 e impressao A4).
// Mede o layout real no Chromium: o <col> da tabela acompanha o maior lote, o cartao mobile quebra o
// texto em vez de vazar e a folha de impressao usa ate 2 linhas na mesma altura de linha.
// So roda com CARGO_LOTSQ_E2E=1 (o job `e2e` do CI nao define a variavel e o spec fica `skip`):
//   $env:CARGO_LOTSQ_E2E='1'; node scripts/with-jdk.mjs node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,storage --project demo-sqcomex "npx playwright test tests/e2e/cargo-report-lotsq.spec.mjs"
import { expect, test } from '@playwright/test'
import { E2E_USERS } from './global-setup.mjs'

const FIRESTORE_HOST = 'http://127.0.0.1:8080'
const PROJECT_ID = 'demo-sqcomex'
const DOCS = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const PROCESS_ID = 'e2e-lotsq'
const PO = 'GOO 021-26'
const MM_TO_PX = 96 / 25.4

test.skip(!process.env.CARGO_LOTSQ_E2E, 'defina CARGO_LOTSQ_E2E=1 para medir a coluna LOTE SQ')
test.describe.configure({ mode: 'serial' })

// Lotes do fornecedor com letras largas (G, O, W, M) e o exemplo do Lucas; lote SQ = lote + 3 primeiras letras do PO.
const SUPPLIER_LOTS = ['2609G00020GO', '2609G00020GOWM88', '2609G00020GOWMWM8888', '2609G00020']
const LOT_SQ = SUPPLIER_LOTS.map((lot) => `${lot}GOO`)

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

async function putDoc(path, data) {
  const response = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }),
  })
  if (!response.ok) throw new Error(`seed ${path}: ${await response.text()}`)
}

async function seedProcessAndReport() {
  await putDoc(`processes/${PROCESS_ID}`, {
    id: PROCESS_ID,
    category: 'FCL',
    name: 'GOO SEA 021-26',
    processNumber: 'GOO 021-26',
    destination: 'ITAJAI',
    processStatus: 'Embarcou',
    etd: '2026-11-01',
    eta: '2026-12-10',
    supplierName: 'GOO CHEM CO.',
    originLocation: 'Shanghai, CN',
    incoterm: 'CFR',
    items: [{ id: 'it-1', commercialName: 'Produto de teste', quantity: 1000 }],
    documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] },
    archived: false,
    updatedAt: new Date().toISOString(),
  })

  const rows = SUPPLIER_LOTS.map((supplierLot, index) => ({
    id: `r-lotsq-${index + 1}`,
    po: PO,
    dbcorpCode: 'AD5240',
    supplierDescription: 'DESCRICAO FORNECEDOR DE TESTE',
    sqDescription: 'DESCRICAO SQ DE TESTE',
    supplierLot,
    wmsLabel: '',
    sqLabel: '',
    quantityKg: 1000 + index,
    count: null,
    packageWeightKg: 1.2,
    frozenNetWeightKg: null,
    frozenPackages: null,
  }))
  await putDoc(`processes/${PROCESS_ID}/cargoReport/current`, {
    schemaVersion: 1,
    formCode: 'FR.CMX.001',
    formRevision: '005',
    revision: 1,
    status: 'rascunho',
    cargoType: 'FCL',
    titleSuffix: 'GOO SEA 021-26',
    rows,
    notes: '',
    labeledBy: '',
    labelMadeBy: '',
    nfNumber: '',
    receiptStatus: '',
    receivedDate: '',
    completedDate: '',
    catalogVersion: 0,
    lastGenerated: null,
    updatedAt: new Date().toISOString(),
    updatedById: 'seed',
    updatedByName: 'Seed E2E',
  })
}

async function login(page, { email, password }) {
  await page.goto('/login')
  await page.getByPlaceholder('nome@sqquimica.com').fill(email)
  await page.getByPlaceholder('Sua senha').fill(password)
  await page.locator('button[type="submit"]', { hasText: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({ timeout: 15_000 })
}

async function openForm(page) {
  await login(page, E2E_USERS.admin)
  await page.goto(`/processos?processo=${PROCESS_ID}&aba=documents`)
  await page.getByRole('button', { name: 'Preencher no Portal' }).click()
  await expect(page.getByRole('heading', { name: /RELATÓRIO DE CARGA - GOO SEA 021-26/ })).toBeVisible({ timeout: 15_000 })
}

const noHorizontalPageScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.beforeAll(async () => {
  await seedProcessAndReport()
})

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`desktop ${viewport.width}: LOTE SQ inteiro, sem corte e sem rolagem horizontal da página`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openForm(page)

    const table = page.locator('table.crf')
    await expect(table).toBeVisible()
    const cells = page.locator('table.crf tbody tr[data-row-index] td:nth-child(7)')
    await expect(cells).toHaveCount(LOT_SQ.length)

    const measures = await cells.evaluateAll((nodes) =>
      nodes.map((node) => ({ text: node.textContent, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }))
    )
    measures.forEach((measure, index) => {
      expect(measure.text, `linha ${index + 1}`).toBe(LOT_SQ[index])
      expect(measure.scrollWidth, `linha ${index + 1} (${measure.text}) cortada`).toBeLessThanOrEqual(measure.clientWidth)
    })
    expect(await noHorizontalPageScroll(page)).toBe(true)
  })
}

test('mobile 390: Lote SQ do cartao com o texto completo, sem vazar do cartao', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openForm(page)

  const cards = page.locator('.crf-rc')
  await expect(cards).toHaveCount(LOT_SQ.length)

  const measures = await cards.evaluateAll((nodes) =>
    nodes.map((card) => {
      const pair = [...card.querySelectorAll('.crf-pair')].find(
        (item) => item.querySelector('.crf-pair__label')?.textContent.trim() === 'Lote SQ'
      )
      const calc = pair?.querySelector('.crf-calc')
      return calc ? { text: calc.textContent, scrollWidth: calc.scrollWidth, clientWidth: calc.clientWidth } : null
    })
  )
  measures.forEach((measure, index) => {
    expect(measure, `cartao ${index + 1} sem o par Lote SQ`).not.toBeNull()
    expect(measure.text).toBe(LOT_SQ[index])
    expect(measure.scrollWidth, `cartao ${index + 1} (${measure.text}) vaza`).toBeLessThanOrEqual(measure.clientWidth)
  })
  expect(await noHorizontalPageScroll(page)).toBe(true)
})

test('impressao A4 paisagem: lotes completos em ate 2 linhas, sem reticencias e sem aumentar a altura da linha', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await page.setViewportSize({ width: 1123, height: 794 })
  await openForm(page)

  await page.getByRole('button', { name: 'Imprimir / Salvar PDF' }).click()
  // escondida na tela (display: none): o role `region` so aparece com a midia de impressao
  await expect(page.locator('section.crf-print')).toBeAttached()
  await page.emulateMedia({ media: 'print' })

  const lots = page.locator('.crf-print__table tbody tr .crf-print__lot')
  const measures = await lots.evaluateAll((nodes) =>
    nodes
      .filter((node) => node.textContent.trim() !== '')
      .map((node) => ({
        text: node.textContent,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      }))
  )
  // 4 linhas x (LOTE FORNEC. + LOTE SQ)
  expect(measures).toHaveLength(SUPPLIER_LOTS.length * 2)
  const expectedTexts = [...SUPPLIER_LOTS, ...LOT_SQ].sort()
  expect(measures.map((measure) => measure.text).sort()).toEqual(expectedTexts)
  // +1 px: clientHeight/scrollHeight sao inteiros arredondados de uma altura fracionaria (7,47 px a 5,6 pt);
  // uma 3a linha (+7,5 px) continua reprovando.
  for (const measure of measures) {
    expect(measure.scrollWidth, `${measure.text} cortado na largura`).toBeLessThanOrEqual(measure.clientWidth + 1)
    expect(measure.scrollHeight, `${measure.text} cortado na altura`).toBeLessThanOrEqual(measure.clientHeight + 1)
  }

  const rowHeights = await page.locator('.crf-print__table tbody tr').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height)
  )
  expect(rowHeights).toHaveLength(28)
  for (const height of rowHeights) expect(height).toBeLessThanOrEqual(4.6 * MM_TO_PX + 1)
})
