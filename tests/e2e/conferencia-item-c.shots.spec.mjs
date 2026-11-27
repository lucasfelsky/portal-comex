// Conferência por item (Fatia C): harness de capturas lado a lado (mock v5 x produto) e das asserções da DESCARGA POR UNIDADE (aba
// Recebimento do celular, cartão "Descarga por unidade"): selos, total (soma das finalizadas), avisos de em andamento / sem fim, aviso
// de sobreposição com o tempo corrido em tamanho de TEXTO, Primeiro início e Data de recebimento, "Descarga única" (aéreo), fechada,
// admin, Iniciar/Finalizar agora gravando `unloadByUnit` e os calculados (já aceitos pelas rules do emulador), erro de horários,
// registro anterior e unidade fora do processo, alvos de 44 px, sem fixed no .page-fade e sem rolagem horizontal a 320 px.
// Padrão de conferencia-item-b.shots.spec.mjs; a infraestrutura vem de conferencia-item.shared.mjs.
//
// So roda com CONF_SHOTS=1 E CONF_FATIA=c (o job `e2e` do CI nao define as variaveis, entao tudo abaixo e `skip`).
//   CONF_MOCK_HTML  caminho do mock v5 (HTML autocontido, FORA do repositorio)
//   CONF_ONLY       (opcional) nomes de estados separados por virgula: so esses estados sao capturados (rodada rapida)
//   CONF_AUTH_HOST / CONF_FIRESTORE_HOST  (opcionais) hosts dos emuladores quando as portas padrao ja estao em uso
// Comando (PowerShell, um por linha, na raiz; precisa de JDK 21 como o `npm run test:e2e`):
//   $env:CONF_SHOTS='1'
//   $env:CONF_FATIA='c'
//   $env:CONF_MOCK_HTML='<caminho do mock-conferencia-por-item-v5.html>'
//   node scripts/with-jdk.mjs node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,storage --project demo-sqcomex "npx playwright test conferencia-item-c"
//
// Saida (fora do git): .agent-tmp/conf-item-shots/c/<estado>-<1100|390|320>-<light|dark>-{mock,produto,lado-a-lado}.png
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
  MOCK_HTML,
  MOCK_ROWS,
  SESSIONS,
  THEMES,
  captureSession,
  getDoc,
  newContext,
  openConference,
  openPage,
  putDoc,
  seedBase,
  shootMock,
  shotPath,
  sideBySide,
} from './conferencia-item.shared.mjs'

const FATIA = String(process.env.CONF_FATIA ?? '').toLowerCase()
test.skip(!process.env.CONF_SHOTS || FATIA !== 'c', 'defina CONF_SHOTS=1 e CONF_FATIA=c para gerar as capturas da Fatia C')

const OUT_DIR = path.resolve(process.cwd(), '.agent-tmp', 'conf-item-shots', 'c')
const SIZES = [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
  { width: 1100, height: 800 },
]
const PHONE = SIZES[0]
const NARROW = SIZES[1]
const CONFERENCE_DOC = (processId) => `processes/${processId}/cargoReport/conference`
const D = '2026-11-27T'

// ---------- conferência seed (cenários do mock v5 + a descarga por unidade de cada estado) ----------

const PARTIAL_R2_R6 = { id: 'pp1', parts: [{ rowId: 'r2', units: 30 }, { rowId: 'r6', units: 20 }] }
const FCL_RUNNING = {
  'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
  'CNT-2': { startAt: `${D}09:20`, endAt: `${D}10:30` },
  'CNT-3': { startAt: `${D}10:50`, endAt: '' },
}
const FCL_DONE = {
  'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
  'CNT-2': { startAt: `${D}09:40`, endAt: `${D}10:30` },
  'CNT-3': { startAt: `${D}10:45`, endAt: `${D}11:30` },
}

// Os calculados que o app grava: menor início e maior fim das unidades finalizadas (o rodapé do FR.CMX.001 não muda).
function derive(map) {
  const entries = Object.values(map)
  const starts = entries.map((entry) => entry.startAt).filter(Boolean).sort()
  const ends = entries.filter((entry) => entry.startAt && entry.endAt && entry.endAt >= entry.startAt).map((entry) => entry.endAt).sort()
  const unloadStartAt = starts[0] ?? ''
  return { unloadStartAt, unloadEndAt: ends.at(-1) ?? '', receivedDate: unloadStartAt.slice(0, 10) }
}

function conferenceFor(scenario, { closed = false, process: processId = FCL } = {}) {
  const base = { ...EMPTY_CONFERENCE }
  const damageByRowId = { r5: { flagged: true, note: AVARIA, photos: [] } }
  const done = scenario === 'tudo'
  Object.assign(base, {
    okByRowId: done ? Object.fromEntries(MOCK_ROWS.map((row) => [row.id, true])) : { r1: true, r2: true, r4: true, r5: true },
    palletsByRowId: done ? { r1: 4, r2: 3, r3: 2, r4: 4, r5: 2, r6: 5, r7: 1 } : { r1: 4, r2: 3, r3: 0, r4: 4, r5: 2, r6: 2, r7: 0 },
    unitsByRowId: done ? Object.fromEntries(MOCK_ROWS.map((row) => [row.id, row.qty / row.net])) : { r1: 100, r2: 100, r4: 150, r5: 80 },
    partialPallets: [PARTIAL_R2_R6],
    damageByRowId,
    labelsByRowId: done ? Object.fromEntries(MOCK_ROWS.map((row) => [row.id, { wms: `W-${row.code}`, sq: `SQ-${row.code}` }])) : { r1: { wms: 'W-5012-A', sq: 'SQ-5012-A' } },
    receiptStatus: done ? 'com_ressalva' : '',
    labelingOk: done,
  })
  const fcl = processId === FCL
  let unload = null
  if (scenario === 'and') unload = fcl ? FCL_RUNNING : { unica: { startAt: `${D}08:10`, endAt: '' } }
  else if (scenario === 'tudo') unload = fcl ? FCL_DONE : { unica: { startAt: `${D}08:10`, endAt: `${D}09:35` } }
  else if (scenario === 'erro') unload = { 'CNT-1': { startAt: `${D}10:00`, endAt: `${D}09:00` } }
  else if (scenario === 'fora') unload = { 'CNT-1': FCL_DONE['CNT-1'], 'CNT-9': { startAt: `${D}07:00`, endAt: `${D}07:30` } }
  if (unload) Object.assign(base, { unloadByUnit: unload, ...derive(unload) })
  // Conferência gravada ANTES da Fatia C: só início/fim únicos, sem a chave `unloadByUnit`.
  if (scenario === 'antigo') Object.assign(base, { unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' })
  if (closed) Object.assign(base, { status: 'fechada', closedDate: '2026-11-27', closedByName: 'Operador Logística', closedDocumentId: 'demo-doc-1' })
  return base
}

async function setConference(processId, scenario, options) {
  await putDoc(CONFERENCE_DOC(processId), conferenceFor(scenario, { ...options, process: processId }))
}

// ---------- estados (mock x produto) ----------

// `frame`: 'card' (topo do cartão "Descarga por unidade") ou 'total' (topo da caixa do tempo total). Estado sem `mock` = só produto.
const ALL_STATES = [
  { name: 'c-fcl-andamento', mock: { scen: 'and' }, prod: { scen: 'and' }, frame: 'card' },
  { name: 'c-fcl-andamento-total', mock: { scen: 'and' }, prod: { scen: 'and' }, frame: 'total' },
  { name: 'c-fcl-tudo-finalizado', mock: { scen: 'tudo' }, prod: { scen: 'tudo' }, frame: 'card' },
  { name: 'c-fcl-tudo-finalizado-total', mock: { scen: 'tudo' }, prod: { scen: 'tudo' }, frame: 'total' },
  { name: 'c-aereo-descarga-unica', mock: { scen: 'and', carga: 'aereo' }, prod: { scen: 'and', process: AEREO }, frame: 'card' },
  { name: 'c-fechada-sem-fim', mock: { scen: 'and', closed: true }, prod: { scen: 'and', closed: true }, frame: 'card' },
  { name: 'c-fechada-sem-fim-total', mock: { scen: 'and', closed: true }, prod: { scen: 'and', closed: true }, frame: 'total' },
  { name: 'c-admin-somente-leitura', mock: { role: 'admin', scen: 'and' }, prod: { as: 'admin', scen: 'and' }, frame: 'card' },
  // Só no produto (o mock não tem estes estados): PNG do produto e nota no PR.
  { name: 'c-erro-de-horarios', prod: { scen: 'erro' }, frame: 'card' },
  { name: 'c-registro-anterior', prod: { scen: 'antigo' }, frame: 'card' },
  { name: 'c-unidade-fora-do-processo', prod: { scen: 'fora' }, frame: 'card' },
]

const ONLY = String(process.env.CONF_ONLY ?? '').split(',').map((name) => name.trim()).filter(Boolean)
const STATES = ONLY.length > 0 ? ALL_STATES.filter((state) => ONLY.includes(state.name)) : ALL_STATES

const CARD = 'section[aria-label="Descarga por unidade"]'

// Mock: aba Recebimento e o cartão (ou a caixa do total) no topo da área rolável.
const mockPrepare = (frame) => async (page) => {
  await page.evaluate(() => document.querySelector('[data-act="tab"][data-v="rec"]')?.click())
  await page.waitForTimeout(200)
  await page.evaluate((target) => {
    const scroller = document.getElementById('scr')
    const node = target === 'total' ? scroller.querySelector('.total') : scroller.querySelector('section.card[aria-label="Descarga por unidade"]')
    scroller.scrollTop = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8
  }, frame)
}

async function frameProduct(page, frame) {
  await page.locator(frame === 'total' ? `${CARD} .ccf-total` : CARD).evaluate((node) => {
    node.scrollIntoView({ block: 'start' })
    // A barra compacta do shell (50 px + área segura) cobre o topo: o alvo fica logo abaixo dela.
    for (const scroller of [document.scrollingElement, document.querySelector('.main-content')]) scroller?.scrollBy(0, -66)
  })
  await page.waitForTimeout(500)
}

async function openReceipt(page, processId) {
  await openConference(page, processId)
  await page.getByRole('tab', { name: 'Recebimento' }).click()
  await expect(page.locator(CARD)).toBeVisible()
  await page.waitForTimeout(300)
}

async function shootProduct(page, state, size, theme, outDir) {
  const { process: processId = FCL } = state.prod
  const file = shotPath(outDir, state.name, size, theme, 'produto')
  // A largura da aba Conferência é travada na ENTRADA: a captura de 1100 px é a da tela aberta a 390 px e girada.
  const wide = size.width > 720
  if (wide) await page.setViewportSize(PHONE)
  await openReceipt(page, processId)
  if (wide) await page.setViewportSize(size)
  await frameProduct(page, state.frame)
  await page.screenshot({ path: file, animations: 'disabled' })
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
          const productFile = await shootProduct(state.prod.as === 'admin' ? adminPage : productPage, state, size, theme, OUT_DIR)
          if (!state.mock) continue
          const mockFile = await shootMock(mockPage, { ...state, mockPrepare: mockPrepare(state.frame) }, size, theme, OUT_DIR)
          await sideBySide(browser, mockFile, productFile, shotPath(OUT_DIR, state.name, size, theme, 'lado-a-lado'), size, `${state.name} · ${theme}`)
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

// Alvos do cartão de descarga e da barra de ações: botões >= 44x44 e campos de data/hora >= 46 px de altura.
async function badTargets(page) {
  return page.evaluate((cardSelector) => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const roots = [...document.querySelectorAll(`${cardSelector}, .ccf-actionbar`)]
    return roots
      .flatMap((root) => [...root.querySelectorAll('button, input')])
      .filter(visible)
      .map((node) => {
        const rect = node.getBoundingClientRect()
        const minHeight = node.matches('input[type="datetime-local"]') ? 46 : 44
        return { text: (node.getAttribute('aria-label') || node.textContent || node.className).trim().slice(0, 50), w: Math.round(rect.width), h: Math.round(rect.height), minHeight }
      })
      .filter((entry) => entry.w < 44 || entry.h < entry.minHeight)
  }, CARD)
}

async function fixedInsidePageFade(page) {
  return page.evaluate(() => [...document.querySelectorAll('.page-fade *')].filter((node) => getComputedStyle(node).position === 'fixed').map((node) => node.className))
}

const unit = (page, title) => page.locator('.ccf-unit', { has: page.locator('.ccf-unit__t', { hasText: title }) })
const FIELD = (kind, title) => `${kind} da descarga · ${title}`
const C1 = 'Contêiner 1 · DMOU1234560'
const C2 = 'Contêiner 2 · DMOU7654321'
const C3 = 'Contêiner 3 · DMOU2468135'
const save = (page) => page.locator('.ccf-actionbar').getByRole('button', { name: 'Salvar' })

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
  })

  test('FCL em andamento: selos, total, avisos, sobreposição em tamanho de texto, primeiro início e data de recebimento', async () => {
    await openReceipt(page, FCL)
    const card = page.locator(CARD)
    await expect(card.getByText('Uma linha para cada contêiner do processo. Cada unidade tem o seu início e o seu fim. Horários de Brasília.')).toBeVisible()
    await expect(unit(page, C1).locator('.ccf-badge')).toHaveText('1 h 25 min')
    await expect(unit(page, C2).locator('.ccf-badge')).toHaveText('1 h 10 min')
    await expect(unit(page, C3).locator('.ccf-badge')).toHaveText('Em andamento · 50 min até agora')
    await expect(unit(page, C3)).toHaveClass(/ccf-unit--run/)
    await expect(unit(page, C1)).not.toHaveClass(/ccf-unit--run/)
    const total = card.locator('.ccf-total')
    await expect(total.getByText('Tempo total de descarga')).toBeVisible()
    await expect(total.locator(':scope > b')).toHaveText('2 h 35 min')
    await expect(total.getByText('Soma das durações de 2 unidades finalizadas.')).toBeVisible()
    await expect(total.getByText('1 unidade em andamento não entra no total. O total é recalculado quando você informar o fim.')).toBeVisible()
    const overlap = total.locator('.ccf-note', { hasText: 'Há unidades que se sobrepõem.' })
    await expect(overlap).toContainText('O total soma cada unidade (mão de obra); o tempo corrido, do primeiro início ao último fim sem repetir a sobreposição, é de 2 h 20 min.')
    await expect(overlap.locator('b')).toHaveText('2 h 20 min')
    const sizes = await page.evaluate(() => {
      const bold = document.querySelector('.ccf-total .ccf-note b')
      const note = bold.closest('.ccf-note')
      return {
        bold: getComputedStyle(bold).fontSize,
        note: getComputedStyle(note).fontSize,
        whiteSpace: getComputedStyle(bold).whiteSpace,
        total: getComputedStyle(document.querySelector('.ccf-total > b')).fontSize,
      }
    })
    expect(sizes.bold, 'o tempo corrido tem o tamanho do texto do aviso').toBe(sizes.note)
    expect(sizes.bold, 'o tempo corrido não é o número grande').not.toBe('26px')
    expect(sizes.total).toBe('26px')
    expect(sizes.whiteSpace).toBe('nowrap')
    const pair = card.locator('.ccf-pair')
    await expect(pair.locator('.ccf-field', { hasText: 'Primeiro início' })).toContainText('27/11/2026 08:10')
    await expect(pair.locator('.ccf-field', { hasText: 'Data de recebimento' })).toContainText('27/11/2026')
    // O tipo do contêiner (small do título, que está em Sora) usa a mesma fonte de texto do restante do cartão (Manrope), não a do sistema.
    const fonts = await page.evaluate(() => ({
      type: getComputedStyle(document.querySelector('.ccf-unit__t small')).fontFamily,
      sub: getComputedStyle(document.querySelector('section[aria-label="Descarga por unidade"] > .ccf-sub')).fontFamily,
      title: getComputedStyle(document.querySelector('.ccf-unit__t')).fontFamily,
    }))
    expect(fonts.type).toBe(fonts.sub)
    expect(fonts.type).toContain('Manrope')
    expect(fonts.title).toContain('Sora')
    // O cartão antigo (campos únicos, "Tempo total") saiu do Recebimento.
    await expect(page.getByLabel('Início da descarga', { exact: true })).toHaveCount(0)
  })

  test('AÉREO: "Descarga única", total "—" e "Soma das durações de 0 unidades finalizadas."', async () => {
    await openReceipt(page, AEREO)
    const card = page.locator(CARD)
    await expect(card.getByText('Este processo não tem contêineres. A descarga é uma só. Horários de Brasília.')).toBeVisible()
    await expect(unit(page, 'Descarga única')).toContainText('Sem contêiner no processo (LCL ou aéreo)')
    await expect(card.locator('.ccf-total > b')).toHaveText('—')
    await expect(card.getByText('Soma das durações de 0 unidades finalizadas.')).toBeVisible()
    await expect(card.getByText('1 unidade em andamento não entra no total. O total é recalculado quando você informar o fim.')).toBeVisible()
  })

  test('fechada: "Sem fim informado", aviso da unidade sem fim, campos desabilitados e sem Iniciar/Finalizar agora', async () => {
    await setConference(FCL, 'and', { closed: true })
    await openReceipt(page, FCL)
    const card = page.locator(CARD)
    await expect(unit(page, C3).locator('.ccf-badge')).toHaveText('Sem fim informado')
    await expect(card.getByText('1 unidade ficou sem fim e não entra no total.')).toBeVisible()
    await expect(card.getByText('em andamento não entra')).toHaveCount(0)
    for (const input of await card.locator('input').all()) await expect(input).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Iniciar agora' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Finalizar agora' })).toHaveCount(0)
    expect(await badTargets(page), 'alvos (fechada)').toEqual([])
  })

  test('admin só acompanha: campos desabilitados e sem botões de descarga', async ({ browser }) => {
    const adminContext = await newContext(browser, 'light', PHONE, 'admin')
    try {
      const adminPage = await openPage(adminContext)
      await openReceipt(adminPage, FCL)
      for (const input of await adminPage.locator(`${CARD} input`).all()) await expect(input).toBeDisabled()
      await expect(adminPage.getByRole('button', { name: 'Iniciar agora' })).toHaveCount(0)
      await expect(adminPage.getByRole('button', { name: 'Finalizar agora' })).toHaveCount(0)
      await expect(adminPage.locator(`${CARD} .ccf-total > b`)).toHaveText('2 h 35 min')
    } finally {
      await adminContext.close()
    }
  })

  test('fluxo: Iniciar agora, Finalizar agora e Salvar gravam unloadByUnit e os calculados (aceitos pelas rules)', async () => {
    await putDoc(CONFERENCE_DOC(FCL), conferenceFor('vazio'))
    await openReceipt(page, FCL)
    await expect(page.getByText('Não iniciada')).toHaveCount(3)
    await unit(page, C1).getByRole('button', { name: 'Iniciar agora' }).click()
    await expect(page.getByLabel(FIELD('Início', C1))).toHaveValue('2026-11-27T11:40')
    await expect(unit(page, C1).locator('.ccf-badge')).toContainText('Em andamento')
    await unit(page, C1).getByRole('button', { name: 'Finalizar agora' }).click()
    await expect(page.getByLabel(FIELD('Fim', C1))).toHaveValue('2026-11-27T11:40')
    await expect(page.locator(`${CARD} .ccf-total > b`)).toHaveText('0 min')
    await expect(save(page)).toBeEnabled()
    await save(page).click()
    await expect(page.getByText(/^Conferência salva às/)).toBeVisible()
    const saved = await getDoc(CONFERENCE_DOC(FCL))
    expect(saved.unloadByUnit['CNT-1']).toEqual({ startAt: '2026-11-27T11:40', endAt: '2026-11-27T11:40' })
    expect(saved.unloadStartAt).toBe('2026-11-27T11:40')
    expect(saved.unloadEndAt).toBe('2026-11-27T11:40')
    expect(saved.receivedDate).toBe('2026-11-27')
    await expect(save(page)).toBeDisabled()
  })

  test('digitar as três unidades: total 3 h 15 min, tempo corrido 3 h, e o doc leva o menor início e o maior fim', async () => {
    await putDoc(CONFERENCE_DOC(FCL), conferenceFor('vazio'))
    await openReceipt(page, FCL)
    const times = [
      [C1, `${D}08:10`, `${D}09:35`],
      [C2, `${D}09:20`, `${D}10:30`],
      [C3, `${D}10:50`, `${D}11:30`],
    ]
    for (const [title, start, end] of times) {
      await page.getByLabel(FIELD('Início', title)).fill(start)
      await page.getByLabel(FIELD('Fim', title)).fill(end)
    }
    await expect(page.locator(`${CARD} .ccf-total > b`)).toHaveText('3 h 15 min')
    await expect(page.locator(`${CARD} .ccf-total .ccf-note b`)).toHaveText('3 h')
    await save(page).click()
    await expect(page.getByText(/^Conferência salva às/)).toBeVisible()
    const saved = await getDoc(CONFERENCE_DOC(FCL))
    expect(saved).toMatchObject({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}11:30`, receivedDate: '2026-11-27' })
    expect(Object.keys(saved.unloadByUnit).sort()).toEqual(['CNT-1', 'CNT-2', 'CNT-3'])
  })

  test('erro de horários: mensagem, aria-invalid no Fim, "Corrigir horários" e o Salvar não grava', async () => {
    await putDoc(CONFERENCE_DOC(FCL), conferenceFor('vazio'))
    await openReceipt(page, FCL)
    await page.getByLabel(FIELD('Início', C1)).fill(`${D}10:00`)
    await page.getByLabel(FIELD('Fim', C1)).fill(`${D}09:00`)
    await expect(unit(page, C1).getByRole('alert')).toHaveText('O fim da descarga deve ser igual ou posterior ao início.')
    await expect(page.getByLabel(FIELD('Fim', C1))).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel(FIELD('Início', C1))).not.toHaveAttribute('aria-invalid', 'true')
    await expect(unit(page, C1).locator('.ccf-badge')).toHaveText('Corrigir horários')
    await save(page).click()
    await expect(page.getByText('Corrija o horário da descarga antes de salvar.')).toBeVisible()
    const stored = await getDoc(CONFERENCE_DOC(FCL))
    expect(stored.unloadByUnit).toBeUndefined()
  })

  test('registro anterior: horários antigos só leitura; a 1ª edição os leva para o mapa como "legado"', async () => {
    await putDoc(CONFERENCE_DOC(AEREO), conferenceFor('antigo', { process: AEREO }))
    await openReceipt(page, AEREO)
    await expect(unit(page, 'Registro anterior (sem unidade)').locator('.ccf-badge')).toHaveText('2 h 25 min')
    await expect(page.getByLabel(FIELD('Início', 'Registro anterior (sem unidade)'))).toBeDisabled()
    await expect(page.getByLabel(FIELD('Início', 'Registro anterior (sem unidade)'))).toHaveValue('2026-11-24T08:15')
    await unit(page, 'Descarga única').getByRole('button', { name: 'Iniciar agora' }).click()
    await save(page).click()
    await expect(page.getByText(/^Conferência salva às/)).toBeVisible()
    const saved = await getDoc(CONFERENCE_DOC(AEREO))
    expect(saved.unloadByUnit.legado).toEqual({ startAt: '2026-11-24T08:15', endAt: '2026-11-24T10:40' })
    expect(saved.unloadByUnit.unica).toEqual({ startAt: '2026-11-27T11:40', endAt: '' })
    expect(saved.unloadStartAt).toBe('2026-11-24T08:15')
    expect(saved.unloadEndAt).toBe('2026-11-24T10:40')
  })

  test('unidade fora do processo: só leitura, entra no total e some só com "Remover horários" + Salvar', async () => {
    await putDoc(CONFERENCE_DOC(FCL), conferenceFor('fora'))
    await openReceipt(page, FCL)
    const orphan = unit(page, 'Unidade fora do processo')
    await expect(orphan.locator('.ccf-badge')).toHaveText('30 min')
    await expect(page.getByLabel(FIELD('Início', 'Unidade fora do processo'))).toBeDisabled()
    await expect(page.locator(`${CARD} .ccf-total > b`)).toHaveText('1 h 55 min')
    await orphan.getByRole('button', { name: 'Remover horários' }).click()
    await expect(page.locator('.ccf-unit__t', { hasText: 'Unidade fora do processo' })).toHaveCount(0)
    await expect(page.locator(`${CARD} .ccf-total > b`)).toHaveText('1 h 25 min')
    await save(page).click()
    await expect(page.getByText(/^Conferência salva às/)).toBeVisible()
    const saved = await getDoc(CONFERENCE_DOC(FCL))
    expect(Object.keys(saved.unloadByUnit)).toEqual(['CNT-1'])
    expect(saved.unloadStartAt).toBe(`${D}08:10`)
  })

  test('alvos de toque >= 44x44 (campos de data/hora >= 46 px) e sem fixed no .page-fade', async () => {
    await openReceipt(page, FCL)
    expect(await badTargets(page), 'FCL em andamento').toEqual([])
    expect(await fixedInsidePageFade(page)).toEqual([])
    await setConference(FCL, 'vazio')
    await openReceipt(page, FCL)
    expect(await badTargets(page), 'FCL sem descarga (Iniciar agora)').toEqual([])
    await setConference(FCL, 'fora')
    await openReceipt(page, FCL)
    expect(await badTargets(page), 'com unidade fora do processo (Remover horários)').toEqual([])
    await setConference(FCL, 'erro')
    await openReceipt(page, FCL)
    expect(await badTargets(page), 'com erro').toEqual([])
  })
})

test.describe('asserções (320 px)', () => {
  test('sem rolagem horizontal e com alvos de 44 px no cartão, em todos os estados, claro e escuro', async ({ browser }) => {
    test.setTimeout(400_000)
    for (const theme of THEMES) {
      const context = await newContext(browser, theme, NARROW, 'logistica')
      try {
        const page = await openPage(context)
        const noOverflow = () =>
          page.evaluate(() => ({
            page: document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth,
            main: document.querySelector('.main-content').scrollWidth <= document.querySelector('.main-content').clientWidth,
            card: [...document.querySelectorAll('section[aria-label="Descarga por unidade"]')].every((node) => node.scrollWidth <= node.clientWidth),
            total: [...document.querySelectorAll('.ccf-total')].every((node) => node.scrollWidth <= node.clientWidth),
          }))
        for (const [scenario, processId] of [['and', FCL], ['tudo', FCL], ['and', AEREO], ['erro', FCL], ['antigo', AEREO], ['fora', FCL]]) {
          await setConference(processId, scenario)
          await openReceipt(page, processId)
          expect(await noOverflow(), `${scenario} ${processId} 320 ${theme}`).toEqual({ page: true, main: true, card: true, total: true })
          expect(await badTargets(page), `alvos ${scenario} ${processId} 320 ${theme}`).toEqual([])
        }
      } finally {
        await context.close()
      }
    }
  })
})

test.describe('asserções (1100 px)', () => {
  test('a tela aberta a 390 px e girada cabe sem rolagem horizontal e o tempo corrido não quebra', async ({ browser }) => {
    test.setTimeout(200_000)
    const context = await newContext(browser, 'light', PHONE, 'logistica')
    try {
      const page = await openPage(context)
      await setConference(FCL, 'and')
      await openReceipt(page, FCL)
      await page.setViewportSize(SIZES[2])
      await page.waitForTimeout(400)
      const fits = await page.evaluate(() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth)
      expect(fits).toBe(true)
      const box = await page.locator('.ccf-total .ccf-note b').boundingBox()
      expect(box.height, 'o tempo corrido numa linha só').toBeLessThan(30)
    } finally {
      await context.close()
    }
  })
})
