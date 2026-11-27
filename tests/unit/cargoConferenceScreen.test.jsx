// S9-F do Relatório de Carga: tela de conferência de um processo no celular (CargoConferenceScreen). Repositórios
// mockados; catálogos sintéticos. Cobre a logística (conferir, salvar, falha de rede, fechar), COMEX em rascunho,
// conferência fechada, admin (só acompanha e reabre), consolidado em grupos e o relatório antigo com NF de 40 caracteres.
// S10-I: contador de pallets por item, total do COMEX, observação por item e o aviso do fechamento do computador.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockGetCargoReport = vi.fn()
const mockSaveConference = vi.fn()
const mockClose = vi.fn()
const mockRetryClose = vi.fn()
const mockReopen = vi.fn()
const mockGenerate = vi.fn()
const mockInvalidate = vi.fn()
const mockPrepare = vi.fn()
const mockUploadPhoto = vi.fn()
const mockDeleteOwnPhotos = vi.fn()
const mockDownloadPhoto = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportConference: (...args) => mockSaveConference(...args),
  closeCargoReportConference: (...args) => mockClose(...args),
  retryCloseConferenceWrite: (...args) => mockRetryClose(...args),
  reopenCargoReportConference: (...args) => mockReopen(...args),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({
  generateCargoReportFile: (...args) => mockGenerate(...args),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: vi.fn().mockResolvedValue({
    exists: true,
    version: 3,
    itemCount: 2,
    items: [
      { code: 'AD5240', description: 'DEA FOAM', packagingType: 'BOMBONA', netWeightKg: 25 },
      { code: 'RE5116', description: 'DEGALAN', packagingType: 'CAIXA', netWeightKg: 25 },
    ],
  }),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  getSupplierPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, entries: [], entryCount: 0, aliases: [] }),
  upsertSupplierPackagingEntry: vi.fn(),
}))
// S10-J1b: fotos de avaria (redução no aparelho e Storage/function mockados; nada de rede).
vi.mock('../../src/features/processes/cargoPhotoResize', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareCargoPhoto: (...args) => mockPrepare(...args),
}))
vi.mock('../../src/services/cargoConferencePhotosRepository', () => ({
  uploadCargoConferencePhoto: (...args) => mockUploadPhoto(...args),
  deleteOwnCargoConferencePhotoFiles: (...args) => mockDeleteOwnPhotos(...args),
  downloadCargoConferencePhotoBlob: (...args) => mockDownloadPhoto(...args),
}))
// A invalidação do cache da lista é espiada (a carga da lista tem testes próprios).
vi.mock('../../src/features/processes/useCargoConferenceList', () => ({
  invalidateCargoConference: (...args) => mockInvalidate(...args),
}))

import { ToastProvider } from '../../src/components/Toast'
import { UnsavedChangesProvider } from '../../src/contexts/UnsavedChangesContext'
import CargoConferenceScreen from '../../src/features/processes/CargoConferenceScreen'
import { clearCargoPhotoCache } from '../../src/features/processes/useCargoPhotoUrls'

const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }
const ADMIN = { uid: 'admin-1', name: 'Lucas Admin', email: 'lucas@sqquimica.com', role: 'admin' }

const PROCESS = {
  id: 'p1',
  name: 'ACME SEA 021-26',
  processNumber: '4500123',
  category: 'FCL',
  supplierName: 'ACME CHEMICALS',
  collectionWindows: [{ id: 'w1', scheduledAt: new Date(2099, 0, 5, 10, 0).toISOString() }],
  archived: false,
}

const row = (overrides = {}) => ({
  id: 'r-1',
  po: '4500123',
  dbcorpCode: 'AD5240',
  supplierDescription: 'DEA FOAM14339 - BOMBONA 25KG',
  sqDescription: 'DEA FOAM14339 - BB 25KG',
  supplierLot: 'DF2406A',
  wmsLabel: '',
  sqLabel: '',
  quantityKg: 12500,
  count: 500,
  packageWeightKg: 1.2,
  frozenNetWeightKg: null,
  frozenPackages: null,
  ...overrides,
})

const ROWS = [
  row({ id: 'r-1' }),
  row({ id: 'r-2', dbcorpCode: 'RE5116', sqDescription: 'DEGALAN 64/12 N - CX 25KG', supplierLot: 'RE1', quantityKg: 5000 }),
  row({ id: 'r-3', dbcorpCode: 'ZZ9999', sqDescription: '', supplierDescription: 'ADITIVO NOVO XR', supplierLot: '', quantityKg: 800 }),
]

const currentDoc = (overrides = {}) => ({
  schemaVersion: 1,
  formCode: 'FR.CMX.001',
  formRevision: '005',
  revision: 4,
  status: 'concluido',
  cargoType: 'FCL',
  titleSuffix: 'ACME SEA 021-26',
  rows: ROWS,
  notes: '',
  nfNumber: '',
  receiptStatus: '',
  receivedDate: '',
  completedDate: '2026-11-23',
  catalogVersion: 3,
  lastGenerated: null,
  updatedAt: new Date(2026, 10, 23, 19, 52),
  updatedByName: 'Lucas',
  ...overrides,
})

const conferenceDoc = (overrides = {}) => ({
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
  updatedAt: new Date(2026, 10, 24, 9, 0),
  updatedByName: '',
  ...overrides,
})

// A tela lê o item pela URL (`?item=`): sempre dentro de um roteador.
const inRouter = (ui) => <MemoryRouter initialEntries={['/conferencia?processo=p1']}>{ui}</MemoryRouter>
const render = (ui, options) => rtlRender(inRouter(ui), { wrapper: ToastProvider, ...options })

async function renderScreen({ profile = LOGISTICA, process = PROCESS, current, conference, onBack, onClosed, wrapper } = {}) {
  mockGetCargoReport.mockResolvedValue({
    current: current === undefined ? currentDoc() : current,
    conference: conference === undefined ? conferenceDoc() : conference,
  })
  const props = { onBack: onBack ?? vi.fn(), onClosed: onClosed ?? vi.fn() }
  const element = <CargoConferenceScreen process={process} profile={profile} canSeeName {...props} />
  const user = userEvent.setup()
  const utils = wrapper ? rtlRender(element, { wrapper }) : render(element)
  await screen.findByRole('tablist')
  return { user, ...props, ...utils }
}

// Conferência por item: a lista mostra só os itens; os lotes (cartões) ficam na tela do item. Cada linha de ROWS é um item
// de 1 lote (códigos diferentes); o título do lote é "Lote <lote>" ou "Sem lote informado".
const ITEM_NAME = { 1: 'DEA FOAM14339 - BB 25KG', 2: 'DEGALAN 64/12 N - CX 25KG', 3: 'ADITIVO NOVO XR' }
const LOT_TITLE = { 1: 'Lote DF2406A', 2: 'Lote RE1', 3: 'Sem lote informado' }
const okButton = (n) => screen.getByRole('button', { name: `OK? do ${LOT_TITLE[n]}` })
const plusButton = (n) => screen.getByRole('button', { name: `Adicionar um pallet à contagem do item ${n}` })
const minusButton = (n) => screen.getByRole('button', { name: `Tirar um pallet da contagem do item ${n}` })
const progressText = () => screen.getByText(/de \d+ itens conferidos/)
const palletsStrip = () => screen.getByText(/^Pallets da carga:/).closest('p')
const openReceipt = (user) => user.click(screen.getByRole('tab', { name: 'Recebimento' }))
const lotCard = (n) => screen.getByRole('article', { name: LOT_TITLE[n] })
const openItem = (user, n) => user.click(screen.getByRole('button', { name: `Abrir ${ITEM_NAME[n]}` }))
const backToItems = (user) => user.click(screen.getAllByRole('button', { name: 'Voltar aos itens' })[0])
// Abre o item `n`, conta `times` pallets e volta à lista (para olhar a faixa do topo).
async function countIn(user, n, times = 1) {
  await openItem(user, n)
  for (let index = 0; index < times; index += 1) await user.click(plusButton(n))
  await backToItems(user)
}

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

let clock = 0
let consoleSpy

beforeEach(() => {
  vi.clearAllMocks()
  setOnline(true)
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockSaveConference.mockResolvedValue({ revision: 3 })
  mockClose.mockResolvedValue({ revision: 3, documentId: 'doc-9' })
  mockReopen.mockResolvedValue({ revision: 3 })
  mockGenerate.mockResolvedValue(new File(['x'], 'FR.CMX.001.xlsx'))
  // O catálogo Item x Emb. é cacheado por 5 min no módulo: o relógio (só `Date`) avança a cada teste para não herdar o cache.
  vi.useFakeTimers({ toFake: ['Date'] })
  clock += 10 * 60 * 1000
  vi.setSystemTime(new Date(2026, 10, 24, 14, 5).getTime() + clock)
})

afterEach(() => {
  vi.useRealTimers()
  consoleSpy.mockRestore()
  setOnline(true)
})

describe('logística, COMEX fechado: conferir itens', () => {
  it('lista só os itens com a faixa; a tela do item mostra o lote com Qtd, Nº de emb., pesos e a dica de tara', async () => {
    const { user } = await renderScreen()
    expect(screen.getByRole('heading', { level: 2, name: 'ACME SEA 021-26' })).toBeInTheDocument()
    expect(progressText().querySelector('b')).toHaveTextContent('0')
    expect(screen.getByText(/de 3 itens conferidos · 0 de 3 lotes · FCL · ACME CHEMICALS/)).toBeInTheDocument()
    // A lista não tem cartões de lote: só uma linha por item.
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    for (const n of [1, 2, 3]) expect(screen.getByRole('button', { name: `Abrir ${ITEM_NAME[n]}` })).toBeInTheDocument()

    await openItem(user, 1)
    expect(screen.getByRole('heading', { level: 2, name: ITEM_NAME[1] })).toBeInTheDocument()
    expect(screen.getByText('Item 1 de 3')).toBeInTheDocument()
    const first = lotCard(1)
    expect(within(first).getByText('12.500 kg')).toBeInTheDocument()
    expect(within(first).getByText('500')).toBeInTheDocument()
    expect(within(first).getByText('BOMBONA')).toBeInTheDocument()
    expect(within(first).getByText('25 kg')).toBeInTheDocument()
    expect(within(first).getByText('1,2 kg')).toBeInTheDocument()
    expect(within(first).getByText('tara (embalagem vazia)')).toBeInTheDocument()
    expect(screen.getByText(/Cód\. AD5240/)).toBeInTheDocument()

    // Sem Descrição SQ: o nome cai na do fornecedor; sem lote: "Sem lote informado"; sem peso líquido na tabela: traços.
    await backToItems(user)
    await openItem(user, 3)
    expect(screen.getByRole('heading', { level: 2, name: 'ADITIVO NOVO XR' })).toBeInTheDocument()
    expect(within(lotCard(3)).getAllByText('—', { selector: 'dd' })).toHaveLength(2)
  })

  it('contador: "+ Pallet" 3 vezes = 3 (anunciado), "−" volta e fica desabilitado em 0', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    const first = lotCard(1)
    expect(within(first).getByText('Pallets contados (inteiros)')).toBeInTheDocument()
    expect(minusButton(1)).toBeDisabled()
    expect(plusButton(1)).toHaveTextContent('+ Pallet')
    for (let index = 0; index < 3; index += 1) await user.click(plusButton(1))
    const status = within(first).getByRole('status')
    expect(status).toHaveTextContent('3 pallets contados no item 1')
    expect(minusButton(1)).toBeEnabled()
    await user.click(minusButton(1))
    expect(within(first).getByRole('status')).toHaveTextContent('2 pallets contados no item 1')
    await user.click(minusButton(1))
    await user.click(minusButton(1))
    expect(within(first).getByRole('status')).toHaveTextContent('0 pallets contados no item 1')
    expect(minusButton(1)).toBeDisabled()
    // Os outros itens não mexem.
    await user.click(screen.getByRole('button', { name: /Próximo item/ }))
    expect(within(lotCard(2)).getByRole('status')).toHaveTextContent('0 pallets contados no item 2')
  })

  it('o contador alvos de toque de 56 px: botões grandes com classe própria', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    expect(plusButton(1)).toHaveClass('ccf-pal__btn', 'ccf-pal__btn--plus')
    expect(minusButton(1)).toHaveClass('ccf-pal__btn')
  })

  it('lote "Sem contagem" até contar; só vira "Conferido" com OK? e pelo menos 1 pallet', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    const first = lotCard(1)
    expect(within(first).getByText('Sem contagem')).toBeInTheDocument()
    await user.click(okButton(1))
    expect(okButton(1)).toHaveAttribute('aria-pressed', 'true')
    // OK? sem pallets não conclui (0 gravado ou nunca contado).
    expect(screen.queryByText('Conferido')).not.toBeInTheDocument()
    await user.click(plusButton(1))
    expect(screen.getByText('Conferido')).toBeInTheDocument()
    expect(within(first).queryByText('Sem contagem')).not.toBeInTheDocument()
    expect(screen.getByText(/de 1 lote conferido · Cód\. AD5240/).querySelector('b')).toHaveTextContent('1')
    await user.click(minusButton(1))
    expect(screen.queryByText('Conferido')).not.toBeInTheDocument()
    expect(within(first).getByText('Sem contagem')).toBeInTheDocument()
    await user.click(plusButton(1))
    await user.click(okButton(1))
    expect(okButton(1)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('Conferido')).not.toBeInTheDocument()
    await backToItems(user)
    expect(progressText().querySelector('b')).toHaveTextContent('0')
  })

  it('"Marcar todos OK" marca SÓ o OK? (os pallets continuam por contar) e avisa por toast', async () => {
    const { user } = await renderScreen()
    await user.click(screen.getByRole('button', { name: 'Marcar todos OK' }))
    expect(await screen.findByText('Todos os lotes marcados com OK. Pallets continuam por contar.')).toBeInTheDocument()
    expect(screen.queryByText('Conferido')).not.toBeInTheDocument()
    expect(progressText().textContent).toMatch(/^0 de 3/)
    for (const n of [1, 2, 3]) {
      await openItem(user, n)
      expect(okButton(n)).toHaveAttribute('aria-pressed', 'true')
      expect(lotCard(n)).toHaveTextContent('Sem contagem')
      await backToItems(user)
    }
    await countIn(user, 2)
    expect(progressText().textContent).toMatch(/^1 de 3/)
  })

  it('"Só pendentes" esconde os itens conferidos e avisa quando não sobra nenhum', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    await user.click(okButton(1))
    await user.click(plusButton(1))
    await backToItems(user)
    await user.click(screen.getByRole('checkbox', { name: 'Só pendentes' }))
    // Ligar o filtro zera os fixados: o item 1, já conferido, sai da lista; sobram os pendentes.
    expect(screen.queryByRole('button', { name: `Abrir ${ITEM_NAME[1]}` })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Abrir ${ITEM_NAME[2]}` })).toBeInTheDocument()
    expect(screen.getByText(/^de 3 itens$/).querySelector('b')).toHaveTextContent('2')
    await user.click(screen.getByRole('button', { name: 'Marcar todos OK' }))
    await countIn(user, 2)
    await countIn(user, 3)
    // Os itens tocados ficam na lista; o aviso confirma o fim.
    expect(screen.getByText('Todos os itens estão conferidos.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Abrir ${ITEM_NAME[1]}` })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Abrir ${ITEM_NAME[2]}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Abrir ${ITEM_NAME[3]}` })).toBeInTheDocument()
    // Trocar o filtro zera os fixados: sem pendentes, sobra só o aviso.
    await user.click(screen.getByRole('checkbox', { name: 'Só pendentes' }))
    await user.click(screen.getByRole('checkbox', { name: 'Só pendentes' }))
    expect(screen.getByText('Todos os itens estão conferidos.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Abrir / })).not.toBeInTheDocument()
  })

  it('etiqueta digitada em minúsculas fica em MAIÚSCULAS e vai assim no payload', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    const wms = screen.getByLabelText('Etiqueta WMS da linha 1')
    expect(wms).toHaveAttribute('autocapitalize', 'characters')
    await user.type(wms, 'wms-ç1')
    expect(wms).toHaveValue('WMS-Ç1')
    await user.type(screen.getByLabelText('Etiqueta SQ da linha 1'), 'sq9')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].labelsByRowId).toEqual({ 'r-1': { wms: 'WMS-Ç1', sq: 'SQ9' } })
  })
})

describe('logística: aba Recebimento', () => {
  it('status por botões, descarga, tempo total, data fixa, etiquetagem e NFs em chips (sem o campo geral Observações)', async () => {
    const { user } = await renderScreen()
    await openReceipt(user)
    expect(screen.getByRole('tab', { name: 'Recebimento' })).toHaveAttribute('aria-selected', 'true')

    expect(screen.getByText('Operador Logística')).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Status do recebimento' })
    expect(within(group).getAllByRole('button')).toHaveLength(3)
    await user.click(within(group).getByRole('button', { name: 'Com ressalva' }))
    expect(within(group).getByRole('button', { name: 'Com ressalva' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Não informado' })).toHaveAttribute('aria-pressed', 'false')
    // S10-I: sai o campo geral "Observações"; entra o cartão "Ressalvas e avarias".
    expect(screen.queryByRole('textbox', { name: 'Observações' })).not.toBeInTheDocument()
    expect(screen.queryByText('Observações', { selector: 'h3' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Ressalvas e avarias' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Início da descarga'), { target: { value: '2026-11-24T08:10' } })
    fireEvent.change(screen.getByLabelText('Fim da descarga'), { target: { value: '2026-11-24T09:40' } })
    expect(screen.getByText('90 min')).toBeInTheDocument()
    expect(screen.getByText('24/11/2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Etiquetagem OK' }))
    expect(screen.getByRole('button', { name: 'Etiquetagem OK' })).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByLabelText('Nº da NF'), '48213{Enter}')
    await user.type(screen.getByLabelText('Nº da NF'), '48214{Enter}')
    const chips = within(screen.getByRole('list', { name: 'NFs adicionadas' }))
    expect(chips.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['48213', '48214'])
    expect(screen.getByText(/48213; 48214/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const [processId, payload, actor, meta] = mockSaveConference.mock.calls[0]
    expect(processId).toBe('p1')
    expect(actor).toBe(LOGISTICA)
    expect(meta).toEqual({ titleSuffix: 'ACME SEA 021-26', totalRows: 3 })
    expect(payload).toMatchObject({
      revision: 3,
      status: 'aberta',
      checkedByName: 'Operador Logística',
      receiptStatus: 'com_ressalva',
      receivedDate: '2026-11-24',
      unloadStartAt: '2026-11-24T08:10',
      unloadEndAt: '2026-11-24T09:40',
      labelingOk: true,
      nfNumber: '48213; 48214',
      notes: '',
    })
  })

  it('descarga inválida (fim antes do início) mostra o erro, zera o tempo e não salva', async () => {
    const { user } = await renderScreen()
    await openReceipt(user)
    fireEvent.change(screen.getByLabelText('Início da descarga'), { target: { value: '2026-11-24T10:00' } })
    fireEvent.change(screen.getByLabelText('Fim da descarga'), { target: { value: '2026-11-24T09:00' } })
    expect(screen.getByText('O fim da descarga deve ser igual ou posterior ao início.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fim da descarga')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/ min$/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Corrija o horário da descarga antes de salvar.')).toBeInTheDocument()
    expect(mockSaveConference).not.toHaveBeenCalled()
  })
})

describe('salvar e falhas', () => {
  it('Salvar fica desabilitado sem alteração, grava e mostra a hora; o cache da lista é invalidado', async () => {
    const { user } = await renderScreen()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await openItem(user, 2)
    await user.click(okButton(2))
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/^Conferência salva às \d{2}:\d{2}\.$/)).toBeInTheDocument()
    expect(mockSaveConference.mock.calls[0][1]).toMatchObject({ okByRowId: { 'r-2': true }, revision: 3 })
    expect(mockInvalidate).toHaveBeenCalledWith('p1')
    // Depois de gravar, tela e base ficam iguais: Salvar desabilita de novo.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it.each([
    ['falha de rede do Firestore (unavailable)', () => mockSaveConference.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }))],
    ['TypeError de fetch', () => mockSaveConference.mockRejectedValue(new TypeError('Failed to fetch'))],
  ])('%s: avisa "Sem conexão…" e mantém o que foi digitado', async (_name, arrange) => {
    arrange()
    const { user } = await renderScreen()
    await openItem(user, 1)
    await user.type(screen.getByLabelText('Etiqueta WMS da linha 1'), 'abc')
    await user.click(okButton(1))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sem conexão. A conferência não foi salva: confira o sinal e toque em Salvar de novo.')
    expect(screen.getByLabelText('Etiqueta WMS da linha 1')).toHaveValue('ABC')
    expect(okButton(1)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(mockInvalidate).not.toHaveBeenCalled()
  })

  it('aparelho offline: nada é enviado; banner e aviso que não some sozinho', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    await user.click(okButton(1))
    setOnline(false)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(mockSaveConference).not.toHaveBeenCalled()
    const message = 'Sem conexão. A conferência não foi salva: confira o sinal e toque em Salvar de novo.'
    expect(screen.getAllByText(message)).toHaveLength(2)
    expect(okButton(1)).toHaveAttribute('aria-pressed', 'true')
    // Voltou o sinal: salva de verdade.
    setOnline(true)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
  })

  it('conflito de revisão: aviso com "Recarregar", que lê o relatório de novo', async () => {
    mockSaveConference.mockRejectedValue(Object.assign(new Error('x'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderScreen()
    await openItem(user, 1)
    await user.click(okButton(1))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Outra pessoa salvou a conferência. Recarregue para ver a versão atual antes de salvar de novo.')
    mockGetCargoReport.mockClear()
    await user.click(within(alert).getByRole('button', { name: 'Recarregar' }))
    await waitFor(() => expect(mockGetCargoReport).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(okButton(1)).toHaveAttribute('aria-pressed', 'false'))
  })
})

// S9-H: no celular a logística só SALVA; o fechamento da conferência fica no computador.
describe('só salvar no celular (fechar fica no computador)', () => {
  it.each([
    ['COMEX fechado', {}],
    ['COMEX ainda em rascunho', { status: 'rascunho' }],
  ])('%s: a barra tem só "Salvar" (largura toda) e a orientação "use o computador"', async (_name, currentOverrides) => {
    const { user } = await renderScreen({ current: currentDoc(currentOverrides) })
    const bar = screen.getByRole('group', { name: 'Ações da conferência' })
    const buttons = within(bar).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Salvar'])
    expect(buttons[0]).toHaveClass('primary-button')
    expect(screen.queryByRole('button', { name: /fechar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const note = screen.getByText('Para fechar a conferência, use o computador.')
    expect(note).toHaveAttribute('role', 'note')
    expect(screen.queryByText(/O COMEX ainda não fechou a parte dele/)).not.toBeInTheDocument()
    // A nota vale para as duas abas.
    await openReceipt(user)
    expect(screen.getByText('Para fechar a conferência, use o computador.')).toBeInTheDocument()
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('"Salvar" começa desabilitado, habilita ao conferir e grava (sem fechar nada)', async () => {
    const { user } = await renderScreen({ current: currentDoc({ status: 'rascunho' }) })
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await openItem(user, 1)
    await user.click(okButton(1))
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].status).toBe('aberta')
    expect(mockClose).not.toHaveBeenCalled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('conferência fechada e admin não mostram a orientação (nada a fechar aqui)', async () => {
    const closed = conferenceDoc({ status: 'fechada', closedDocumentId: 'd' })
    const { unmount } = await renderScreen({ conference: closed })
    expect(screen.queryByText('Para fechar a conferência, use o computador.')).not.toBeInTheDocument()
    unmount()
    await renderScreen({ profile: ADMIN })
    expect(screen.queryByText('Para fechar a conferência, use o computador.')).not.toBeInTheDocument()
  })
})

describe('conferência já fechada (logística)', () => {
  const closed = () =>
    conferenceDoc({
      status: 'fechada',
      closedDate: '2026-11-24',
      closedByName: 'Operador Logística',
      closedDocumentId: 'doc-1',
      okByRowId: { 'r-1': true },
      countOkByRowId: { 'r-1': true },
      labelsByRowId: { 'r-1': { wms: 'w1', sq: 'sq1' } },
      receiptStatus: 'sem_ressalva',
      unloadStartAt: '2026-11-24T08:00',
      nfNumber: '3321; 3322',
      notes: 'ok',
    })

  it('tudo somente leitura, nota "Conferência fechada…" e barra só com "Voltar à lista"', async () => {
    const { user, onBack } = await renderScreen({ conference: closed() })
    expect(screen.getByText('Conferência fechada. Para corrigir, peça ao COMEX para reabrir.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar todos OK' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Só pendentes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar e fechar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir conferência' })).not.toBeInTheDocument()

    // Tela do item: OK? desabilitado, contador só leitura (o registro antigo, Contagem OK, aparece como "OK"), etiquetas em texto.
    await openItem(user, 1)
    expect(okButton(1)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /pallet/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Observação da avaria/ })).not.toBeInTheDocument()
    expect(lotCard(1)).toHaveTextContent('OK')
    expect(screen.queryByLabelText('Etiqueta WMS da linha 1')).not.toBeInTheDocument()
    expect(screen.getByText('W1')).toBeInTheDocument()
    // Só leitura: "Voltar aos itens" e "Próximo item" (o item 1 não é o último).
    const bar = screen.getByRole('group', { name: 'Ações da conferência' })
    expect(within(bar).getAllByRole('button').map((button) => button.textContent)).toEqual(['Voltar aos itens', 'Próximo item'])
    await backToItems(user)

    await openReceipt(user)
    expect(screen.getByRole('button', { name: 'Sem ressalva' })).toBeDisabled()
    expect(screen.getByLabelText('Início da descarga')).toBeDisabled()
    // `conference.notes` antigo: só leitura, num bloco "Observações (registro antigo)".
    expect(screen.queryByRole('textbox', { name: 'Observações' })).not.toBeInTheDocument()
    expect(screen.getByText('Observações (registro antigo)')).toBeInTheDocument()
    expect(screen.getByText('ok', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nº da NF')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'NFs adicionadas' })).getAllByRole('listitem')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('admin: só acompanha e reabre', () => {
  it('nenhum controle editável, sem Salvar; com conferência aberta a barra só volta à lista', async () => {
    const { user, onBack } = await renderScreen({ profile: ADMIN })
    expect(
      screen.getByText('Admin só acompanha no celular. Quem preenche e fecha a conferência é a logística.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar todos OK' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar e fechar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir conferência' })).not.toBeInTheDocument()
    await openItem(user, 1)
    expect(okButton(1)).toBeDisabled()
    await backToItems(user)
    await openReceipt(user)
    expect(screen.getByText('(logística)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nº da NF')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('com a conferência fechada: "Reabrir conferência" reabre e a tela fica aberta (ainda só leitura)', async () => {
    const { user } = await renderScreen({
      profile: ADMIN,
      conference: conferenceDoc({ status: 'fechada', closedDate: '2026-11-24', closedByName: 'Operador', closedDocumentId: 'd', okByRowId: { 'r-1': true } }),
    })
    expect(
      screen.getByText('Admin só acompanha no celular. Quem preenche e fecha a conferência é a logística; você pode reabrir esta.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reabrir conferência' }))
    await waitFor(() => expect(mockReopen).toHaveBeenCalledWith('p1', ADMIN))
    expect(await screen.findByText('Conferência reaberta. A logística pode corrigir e fechar de novo.')).toBeInTheDocument()
    expect(
      screen.getByText('Admin só acompanha no celular. Quem preenche e fecha a conferência é a logística.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir conferência' })).not.toBeInTheDocument()
    await openItem(user, 1)
    expect(okButton(1)).toBeDisabled()
    expect(okButton(1)).toHaveAttribute('aria-pressed', 'true')
    expect(mockInvalidate).toHaveBeenCalledWith('p1')
  })

  it('falha ao reabrir: aviso de erro e a conferência continua fechada', async () => {
    mockReopen.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    const { user } = await renderScreen({
      profile: ADMIN,
      conference: conferenceDoc({ status: 'fechada', closedDocumentId: 'd' }),
    })
    await user.click(screen.getByRole('button', { name: 'Reabrir conferência' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sem permissão para editar/)
    expect(screen.getByRole('button', { name: 'Reabrir conferência' })).toBeEnabled()
  })
})

describe('consolidado com grupos por PO', () => {
  const consolidated = {
    ...PROCESS,
    category: 'CONSOLIDADO',
    supplierName: '',
    purchaseOrders: [
      { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
      { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
    ],
  }
  const groupedRows = [
    row({ id: 'g-1', po: 'ACME SEA 011-26', sqDescription: 'RESINA EPOXI ER-100' }),
    row({ id: 'g-2', po: 'ACME SEA 011-26', dbcorpCode: 'RE5116', sqDescription: 'ENDURECEDOR EH-20' }),
    row({ id: 'g-3', po: 'NOVA SEA 034-26', sqDescription: 'PLASTIFICANTE DOP' }),
    row({ id: 'g-4', po: 'SEM RECONHECER', sqDescription: 'ITEM SOLTO' }),
  ]

  it('cabeçalho por PO com "X de Y conferidos" (itens) que muda ao marcar; item sem PO no grupo final', async () => {
    const { user } = await renderScreen({
      process: consolidated,
      current: currentDoc({ cargoType: 'CONSOLIDADO', rows: groupedRows }),
    })
    const acme = screen.getByRole('region', { name: 'ACME SEA 011-26' })
    expect(within(acme).getByText(/ACME RESINS CO · 0 de 2 conferidos/)).toBeInTheDocument()
    expect(within(acme).getAllByRole('button')).toHaveLength(2)
    const nova = screen.getByRole('region', { name: 'NOVA SEA 034-26' })
    expect(within(nova).getByText(/NOVA POLYMERS · 0 de 1 conferidos/)).toBeInTheDocument()
    const orphans = screen.getByRole('region', { name: 'Linhas sem PO desta consolidada' })
    expect(within(orphans).getByText('ITEM SOLTO')).toBeInTheDocument()
    expect(within(orphans).getByText(/0 de 1 conferidos/)).toBeInTheDocument()
    expect(screen.getByText(/de 4 itens conferidos · 0 de 4 lotes · CONSOLIDADO · 2 POs/)).toBeInTheDocument()

    // O mesmo código em POs diferentes (AD5240 em 3 grupos) são itens diferentes, cada um no seu grupo. A numeração dos
    // lotes é a da lista inteira (a linha 3 está no 2º grupo).
    await user.click(within(nova).getByRole('button', { name: 'Abrir PLASTIFICANTE DOP' }))
    expect(screen.getByText('Item 3 de 4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'OK? do Lote DF2406A' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar um pallet à contagem do item 3' }))
    await backToItems(user)
    expect(within(screen.getByRole('region', { name: 'NOVA SEA 034-26' })).getByText(/NOVA POLYMERS · 1 de 1 conferidos/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'ACME SEA 011-26' })).getByText(/0 de 2 conferidos/)).toBeInTheDocument()
  })

  it('só pendentes tira os itens conferidos dentro do grupo, mantendo o cabeçalho', async () => {
    const { user } = await renderScreen({
      process: consolidated,
      current: currentDoc({ cargoType: 'CONSOLIDADO', rows: groupedRows }),
      conference: conferenceDoc({ okByRowId: { 'g-1': true }, countOkByRowId: { 'g-1': true } }),
    })
    await user.click(screen.getByRole('checkbox', { name: 'Só pendentes' }))
    const acme = screen.getByRole('region', { name: 'ACME SEA 011-26' })
    expect(within(acme).getAllByRole('button')).toHaveLength(1)
    expect(within(acme).getByText(/1 de 2 conferidos/)).toBeInTheDocument()
  })
})

describe('relatório antigo com NF de 40 caracteres', () => {
  it('lê como 1 chip e adicionar outra grava "<antiga>; <nova>"', async () => {
    const old = 'NF 12/1 - 123, 124 / 000.999.888.777'
    const { user } = await renderScreen({ conference: conferenceDoc({ nfNumber: old }) })
    await openReceipt(user)
    const list = screen.getByRole('list', { name: 'NFs adicionadas' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText(old)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nº da NF'), '555{Enter}')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].nfNumber).toBe(`${old}; 555`)
  })

  it('legado do `current` (conferência anterior à S7) também vira chip', async () => {
    const { user } = await renderScreen({
      current: currentDoc({ nfNumber: 'NF-9', receiptStatus: 'sem_ressalva' }),
      conference: { okByRowId: {} },
    })
    await openReceipt(user)
    expect(within(screen.getByRole('list', { name: 'NFs adicionadas' })).getByText('NF-9')).toBeInTheDocument()
  })
})

// S10-I: total de pallets do COMEX x soma contada (só INFORMA no celular; nunca bloqueia o Salvar).
describe('pallets da carga: faixa e selo', () => {
  const withTotal = (expectedPallets) => currentDoc({ expectedPallets })

  it('divergente: "3 contados de 5 informados pelo COMEX" com o selo Divergente', async () => {
    const { user } = await renderScreen({ current: withTotal(5) })
    // Nada contado ainda: 0 de 5 já é divergência.
    expect(palletsStrip()).toHaveTextContent('Pallets da carga: 0 contados de 5 informados pelo COMEX.')
    expect(within(palletsStrip()).getByText('Divergente')).toHaveClass('ccf-badge--warn')
    await countIn(user, 1, 2)
    await countIn(user, 2)
    expect(palletsStrip()).toHaveTextContent('Pallets da carga: 3 contados de 5 informados pelo COMEX.')
    expect(within(palletsStrip()).getByText('Divergente')).toBeInTheDocument()
  })

  it('confere: selo "Confere" quando a soma bate com o total', async () => {
    const { user } = await renderScreen({ current: withTotal(2) })
    await countIn(user, 1)
    await countIn(user, 3)
    expect(palletsStrip()).toHaveTextContent('Pallets da carga: 2 contados de 2 informados pelo COMEX.')
    expect(within(palletsStrip()).getByText('Confere')).toHaveClass('ccf-badge--ok')
    expect(within(palletsStrip()).queryByText('Divergente')).not.toBeInTheDocument()
  })

  it('sem total do COMEX (relatório antigo): sem comparação, selo "Sem total"', async () => {
    const { user } = await renderScreen()
    await countIn(user, 1)
    expect(palletsStrip()).toHaveTextContent('Pallets da carga: 1 contado. Total não informado pelo COMEX.')
    expect(within(palletsStrip()).getByText('Sem total')).toBeInTheDocument()
  })

  it('a soma ignora a contagem de linhas que o COMEX já removeu', async () => {
    await renderScreen({
      current: withTotal(4),
      conference: conferenceDoc({ palletsByRowId: { 'r-1': 4, 'r-removida': 30 } }),
    })
    expect(within(palletsStrip()).getByText('Confere')).toBeInTheDocument()
  })
})

describe('observação (avaria / ressalva) por item e status sugerido', () => {
  const noteBox = (n) => screen.getByRole('textbox', { name: `Observação da avaria ou ressalva do item ${n}` })
  const openMore = (user, n) => user.click(within(lotCard(n)).getByText('Etiquetas, fotos e avaria'))

  it('não há botão para registrar avaria: lote sem nada não tem avaria, e escrever a observação marca o lote', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    await openMore(user, 1)
    const first = lotCard(1)
    expect(screen.queryByRole('button', { name: /Registrar avaria/ })).not.toBeInTheDocument()
    expect(within(first).getByText('Observação da avaria ou ressalva (opcional)')).toBeInTheDocument()
    expect(within(first).getByText('0 de 1.000')).toBeInTheDocument()
    expect(within(first).queryByText('Avaria registrada')).not.toBeInTheDocument()
    await user.type(noteBox(1), 'Caixa amassada')
    expect(within(first).getByText('Avaria registrada')).toHaveClass('ccf-badge--danger')

    await backToItems(user)
    await openReceipt(user)
    const group = screen.getByRole('group', { name: 'Status do recebimento' })
    // O celular NÃO troca sozinho.
    expect(within(group).getByRole('button', { name: 'Não informado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Há item com avaria. Status sugerido: Com ressalva.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Usar Com ressalva' }))
    expect(within(group).getByRole('button', { name: 'Com ressalva' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Status sugerido/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usar Com ressalva' })).not.toBeInTheDocument()
  })

  it('com "Sem ressalva" escolhido a sugestão aparece e nada muda sozinho', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc({ receiptStatus: 'sem_ressalva' }) })
    await openItem(user, 2)
    await openMore(user, 2)
    await user.type(noteBox(2), 'Caixa amassada')
    await backToItems(user)
    await openReceipt(user)
    const group = screen.getByRole('group', { name: 'Status do recebimento' })
    expect(within(group).getByRole('button', { name: 'Sem ressalva' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Há item com avaria. Status sugerido: Com ressalva.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar Com ressalva' })).toBeEnabled()
  })

  it('"Com ressalva" já escolhido: sem sugestão', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc({ receiptStatus: 'com_ressalva' }) })
    await openItem(user, 1)
    await openMore(user, 1)
    await user.type(noteBox(1), 'Caixa amassada')
    await backToItems(user)
    await openReceipt(user)
    expect(screen.queryByText(/Status sugerido/)).not.toBeInTheDocument()
  })

  it('a observação escrita conta como avaria, aparece em "Ressalvas e avarias" e vai no payload', async () => {
    const { user } = await renderScreen()
    await openItem(user, 2)
    await openMore(user, 2)
    await user.type(noteBox(2), '  Caixas molhadas no pallet 2  ')
    const second = lotCard(2)
    expect(within(second).getByText('31 de 1.000')).toBeInTheDocument()
    expect(within(second).getByText('Avaria registrada')).toBeInTheDocument()
    await backToItems(user)
    expect(
      within(screen.getByRole('button', { name: `Abrir ${ITEM_NAME[2]}` })).getByText('Avaria registrada')
    ).toBeInTheDocument()
    await openReceipt(user)
    const card = screen.getByRole('region', { name: 'Ressalvas e avarias' })
    expect(within(card).getByText('DEGALAN 64/12 N - CX 25KG · Lote RE1')).toBeInTheDocument()
    expect(within(card).getByText(/Caixas molhadas no pallet 2/)).toBeInTheDocument()
    expect(within(card).getByText('As observações ficam no lote.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload.damageByRowId).toEqual({ 'r-2': { flagged: true, note: 'Caixas molhadas no pallet 2', photos: [] } })
    expect(payload.palletsByRowId).toEqual({})
  })

  it('sem avaria: o cartão explica como registrar', async () => {
    const { user } = await renderScreen()
    await openReceipt(user)
    const card = screen.getByRole('region', { name: 'Ressalvas e avarias' })
    expect(card).toHaveTextContent(
      'Nenhuma avaria registrada. Para registrar, volte à aba Itens, abra o item e use Etiquetas, fotos e avaria no lote.'
    )
    expect(screen.queryByRole('button', { name: 'Usar Com ressalva' })).not.toBeInTheDocument()
  })

  it('o legado `notes` aparece só para leitura e é repassado no payload', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc({ notes: 'Palete 3 avariado (registro antigo)' }) })
    await openItem(user, 1)
    await user.click(okButton(1))
    await backToItems(user)
    await openReceipt(user)
    expect(screen.getByText('Observações (registro antigo)')).toBeInTheDocument()
    expect(screen.getByText('Palete 3 avariado (registro antigo)')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Observações' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].notes).toBe('Palete 3 avariado (registro antigo)')
  })
})

describe('salvar com divergência: só avisa, nunca bloqueia', () => {
  it('divergência SEM observação grava normalmente e o banner traz "No fechamento pelo computador: ..."', async () => {
    const { user } = await renderScreen({ current: currentDoc({ expectedPallets: 5 }) })
    await openItem(user, 1)
    await user.click(okButton(1))
    await user.click(plusButton(1))
    await user.click(plusButton(1))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].palletsByRowId).toEqual({ 'r-1': 2 })
    expect(await screen.findByText(/^Conferência salva às \d{2}:\d{2}\.$/)).toBeInTheDocument()
    const notice = screen.getByText(/^No fechamento pelo computador:/)
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toHaveTextContent(
      'pallets divergentes (2 de 5) sem observação em nenhum item — escreva uma observação no item'
    )
    expect(notice).toHaveTextContent('2 itens sem OK? ou sem pallets')
    expect(notice.textContent.endsWith('.')).toBe(true)
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('com observação em algum item o aviso vira a pendência informativa (e o status sugerido entra)', async () => {
    const { user } = await renderScreen({ current: currentDoc({ expectedPallets: 5 }) })
    await openItem(user, 1)
    await user.click(plusButton(1))
    await user.click(within(lotCard(1)).getByText('Etiquetas, fotos e avaria'))
    await user.type(screen.getByRole('textbox', { name: 'Observação da avaria ou ressalva do item 1' }), 'Faltou 1 pallet')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const notice = await screen.findByText(/^No fechamento pelo computador:/)
    expect(notice).toHaveTextContent('pallets divergentes (1 de 5), com observação')
    expect(notice).not.toHaveTextContent('sem observação em nenhum item')
    expect(notice).toHaveTextContent('1 item com avaria e status diferente de "Com ressalva"')
  })

  it('sem nada pendente, o texto de hoje (sem aviso)', async () => {
    const complete = conferenceDoc({
      okByRowId: { 'r-1': true, 'r-2': true, 'r-3': true },
      palletsByRowId: { 'r-1': 1, 'r-2': 1, 'r-3': 1 },
      receiptStatus: 'sem_ressalva',
      unloadStartAt: '2026-11-24T08:00',
      unloadEndAt: '2026-11-24T09:00',
      labelingOk: true,
      nfNumber: '48213',
      receivedDate: '2026-11-24',
    })
    const { user } = await renderScreen({ current: currentDoc({ expectedPallets: 3 }), conference: complete })
    await openItem(user, 1)
    await user.type(screen.getByLabelText('Etiqueta WMS da linha 1'), 'w1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/^Conferência salva às \d{2}:\d{2}\.$/)).toBeInTheDocument()
    expect(screen.queryByText(/No fechamento pelo computador/)).not.toBeInTheDocument()
  })

  it('"Salvar" nunca fica bloqueado pela divergência; a única trava é a descarga inválida', async () => {
    const { user } = await renderScreen({ current: currentDoc({ expectedPallets: 50 }) })
    await openItem(user, 1)
    await user.click(plusButton(1))
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /fechar/i })).not.toBeInTheDocument()
  })
})

describe('relatório antigo (Contagem OK sem número) no celular', () => {
  it('lê "OK (registro antigo)" e já conta como conferido; tocar no contador troca o legado pelo número', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ okByRowId: { 'r-1': true, 'r-2': true }, countOkByRowId: { 'r-1': true } }),
    })
    expect(progressText().querySelector('b')).toHaveTextContent('1')
    // Sem número falso: a soma não conta o legado.
    expect(screen.getByText(/^Pallets da carga: 0 contados/)).toBeInTheDocument()
    await openItem(user, 1)
    const first = lotCard(1)
    expect(within(first).getByRole('status')).toHaveTextContent('Contagem OK (registro antigo) no item 1')
    expect(within(first).getByText('Conferido')).toBeInTheDocument()
    expect(within(first).queryByText('Sem contagem')).not.toBeInTheDocument()
    await user.click(plusButton(1))
    expect(within(first).getByRole('status')).toHaveTextContent('1 pallet contado no item 1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload.palletsByRowId).toEqual({ 'r-1': 1 })
    expect(payload.countOkByRowId).toEqual({})
  })

  it('o legado de uma linha que não foi tocada segue gravado como estava', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ okByRowId: { 'r-1': true }, countOkByRowId: { 'r-1': true, 'r-2': true } }),
    })
    await openItem(user, 1)
    await user.click(plusButton(1))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].countOkByRowId).toEqual({ 'r-2': true })
  })
})

describe('somente leitura (admin e conferência fechada) com pallets e avaria', () => {
  const filled = {
    okByRowId: { 'r-1': true },
    palletsByRowId: { 'r-1': 4, 'r-2': 0 },
    damageByRowId: { 'r-1': { flagged: true, note: 'Tambor amassado na lateral', photos: [] } },
  }

  it('conferência fechada: contador e observação só texto; admin só lê', async () => {
    for (const profile of [LOGISTICA, ADMIN]) {
      const { user, unmount } = await renderScreen({
        profile,
        conference: conferenceDoc({ ...filled, status: 'fechada', closedDate: '2026-11-24', closedByName: 'Op', closedDocumentId: 'd' }),
      })
      await openItem(user, 1)
      const first = lotCard(1)
      expect(within(first).queryByRole('button', { name: /pallet/i })).not.toBeInTheDocument()
      expect(within(first).queryByRole('textbox')).not.toBeInTheDocument()
      expect(within(first).getByText('4')).toBeInTheDocument()
      expect(within(first).getByText('Pallets contados (inteiros)')).toBeInTheDocument()
      expect(within(first).getByText('Tambor amassado na lateral')).toBeInTheDocument()
      expect(within(first).getByText('Avaria registrada')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Próximo item/ }))
      expect(within(lotCard(2)).getByText('0')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Próximo item/ }))
      // Lote nunca contado: traço no lugar do número.
      expect(lotCard(3).querySelector('.ccf-pal--ro')).toHaveTextContent('—')
      unmount()
    }
  })

  it('reabrir mantém a contagem e a observação', async () => {
    const { user } = await renderScreen({
      profile: ADMIN,
      conference: conferenceDoc({ ...filled, status: 'fechada', closedDate: '2026-11-24', closedByName: 'Op', closedDocumentId: 'd' }),
    })
    await user.click(screen.getByRole('button', { name: 'Reabrir conferência' }))
    await waitFor(() => expect(mockReopen).toHaveBeenCalledWith('p1', ADMIN))
    await screen.findByText('Conferência reaberta. A logística pode corrigir e fechar de novo.')
    await openItem(user, 1)
    const first = lotCard(1)
    expect(within(first).getByText('4')).toBeInTheDocument()
    expect(within(first).getByText('Tambor amassado na lateral')).toBeInTheDocument()
  })
})

describe('abas, barra inferior e saída', () => {
  it('abas com teclado (setas, Home e End) e aria-controls no painel ativo', async () => {
    const { user } = await renderScreen()
    const items = screen.getByRole('tab', { name: 'Itens' })
    const receipt = screen.getByRole('tab', { name: 'Recebimento' })
    expect(items).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('tabpanel')
    expect(items).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveAttribute('aria-labelledby', items.id)

    items.focus()
    await user.keyboard('{ArrowRight}')
    expect(receipt).toHaveAttribute('aria-selected', 'true')
    expect(receipt).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', receipt.id)
    await user.keyboard('{Home}')
    expect(items).toHaveAttribute('aria-selected', 'true')
    expect(items).toHaveFocus()
    await user.keyboard('{End}')
    expect(receipt).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(items).toHaveAttribute('aria-selected', 'true')
  })

  it('a barra inferior está no body (portal), fora da tela, e o voltar tem alvo de 44 px', async () => {
    const { container } = await renderScreen()
    const bar = screen.getByRole('group', { name: 'Ações da conferência' })
    expect(bar).toHaveClass('ccf-actionbar')
    expect(bar.parentElement).toBe(document.body)
    expect(container.contains(bar)).toBe(false)
    expect(within(bar).getByRole('button', { name: 'Salvar' })).toHaveClass('primary-button')
    expect(within(bar).queryByRole('button', { name: /fechar/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar para a lista' })).toHaveClass('ccf-iconbtn')
  })

  it('sair com alteração não salva pede confirmação; sem alteração volta direto', async () => {
    const onBack = vi.fn()
    const wrapper = ({ children }) => (
      <MemoryRouter>
        <ToastProvider>
          <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
        </ToastProvider>
      </MemoryRouter>
    )
    const { user } = await renderScreen({ onBack, wrapper })
    await user.click(screen.getByRole('button', { name: 'Voltar para a lista' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    await openItem(user, 1)
    await user.click(okButton(1))
    await backToItems(user)
    await user.click(screen.getByRole('button', { name: 'Voltar para a lista' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    const confirm = await screen.findByRole('alertdialog', { name: 'Descartar alterações?' })
    await user.click(within(confirm).getByRole('button', { name: 'Descartar alterações' }))
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(2))
  })

  it('relatório inexistente (o COMEX ainda não criou): explica e só deixa voltar', async () => {
    mockGetCargoReport.mockResolvedValue({ current: null, conference: null })
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<CargoConferenceScreen process={PROCESS} profile={LOGISTICA} canSeeName onBack={onBack} onClosed={vi.fn()} />)
    expect(
      await screen.findByText('O COMEX ainda não criou o Relatório de Carga deste processo. Sem ele não há o que conferir.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('erro de leitura: "Tentar novamente" lê de novo', async () => {
    mockGetCargoReport.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'unavailable' }))
    const user = userEvent.setup()
    render(<CargoConferenceScreen process={PROCESS} profile={LOGISTICA} canSeeName onBack={vi.fn()} onClosed={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar o relatório de carga.')
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc() })
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
  })
})

describe('fotos de avaria por lote (S10-J1b)', () => {
  const saved = (id, rowId = 'r-1') => ({
    id,
    path: `processes/p1/cargo-conference/${rowId}/1-log-1-${id}.jpg`,
    thumbPath: `processes/p1/cargo-conference/${rowId}/1-log-1-${id}-t.jpg`,
    width: 1600,
    height: 1200,
    size: 120000,
    uploadedAt: 1700000000000,
    byId: 'log-1',
  })
  const withPhotos = (count, note = '') => ({
    damageByRowId: {
      'r-1': { flagged: true, note, photos: Array.from({ length: count }, (_, index) => saved(`s${index + 1}`)) },
    },
  })
  const closedConference = (extra = {}) =>
    conferenceDoc({ status: 'fechada', closedDate: '2026-11-24', closedByName: 'Op', closedDocumentId: 'd', ...extra })
  const chooseCamera = (user, n, file) => user.upload(screen.getByLabelText(`Foto da câmera do item ${n}`), file)
  const jpeg = (name = 'avaria.jpg') => new File(['x'], name, { type: 'image/jpeg' })
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeEach(() => {
    clearCargoPhotoCache()
    mockPrepare.mockReset()
    mockUploadPhoto.mockReset()
    mockDeleteOwnPhotos.mockReset()
    mockDownloadPhoto.mockReset()
    mockPrepare.mockImplementation(async () => ({
      full: { blob: new Blob(['f']), width: 1600, height: 1200 },
      thumb: { blob: new Blob(['t']), width: 400, height: 300 },
    }))
    mockDownloadPhoto.mockImplementation(async () => new Blob(['img']))
    mockDeleteOwnPhotos.mockResolvedValue(0)
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    // Desmonta antes de devolver o URL original (o cleanup do hook revoga as URLs locais).
    cleanup()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('cada lote tem "Tirar foto" e "Anexar" (logística com a conferência aberta)', async () => {
    const { user } = await renderScreen()
    for (const n of [1, 2, 3]) {
      await openItem(user, n)
      const card = lotCard(n)
      await user.click(within(card).getByText('Etiquetas, fotos e avaria'))
      expect(within(card).getByRole('button', { name: `Tirar foto do item ${n}` })).toBeEnabled()
      expect(within(card).getByRole('button', { name: `Anexar fotos ao item ${n}` })).toBeEnabled()
      await backToItems(user)
    }
  })

  it('a foto enviada entra no lote como NÃO salva: o lote vira "Avaria registrada" e nada é gravado até o Salvar', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    mockUploadPhoto.mockResolvedValue(saved('pnovo'))
    await chooseCamera(user, 1, jpeg())
    const first = lotCard(1)
    expect(await within(first).findByRole('img', { name: 'Foto 1 do item 1' })).toBeInTheDocument()
    expect(within(first).getByText('Avaria registrada')).toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: /Registrar avaria/ })).not.toBeInTheDocument()
    expect(mockSaveConference).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('Salvar grava o metadado da foto (id, caminhos, tamanho, quem enviou) na observação do lote', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    mockUploadPhoto.mockResolvedValue(saved('pnovo'))
    await chooseCamera(user, 1, jpeg())
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    await user.type(screen.getByRole('textbox', { name: 'Observação da avaria ou ressalva do item 1' }), 'Caixas molhadas')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload.damageByRowId['r-1']).toEqual({
      flagged: true,
      note: 'Caixas molhadas',
      photos: [saved('pnovo')],
    })
    expect(await screen.findByText(/^Conferência salva às \d{2}:\d{2}\.$/)).toBeInTheDocument()
  })

  it('"Salvar" fica desabilitado enquanto uma foto sobe, com o motivo em texto, e libera quando termina', async () => {
    let finish
    mockUploadPhoto.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const { user } = await renderScreen()
    await openItem(user, 1)
    await user.click(okButton(1))
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    await chooseCamera(user, 1, jpeg())
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(screen.getByText('Aguarde o envio das fotos.')).toHaveAttribute('role', 'status')
    finish(saved('pnovo'))
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(screen.queryByText('Aguarde o envio das fotos.')).not.toBeInTheDocument()
  })

  it('falha de rede no envio: mensagem no lote, "Tentar de novo" e a foto entra; Salvar segue a liberar', async () => {
    mockUploadPhoto.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    mockUploadPhoto.mockResolvedValueOnce(saved('pnovo'))
    const { user } = await renderScreen()
    await openItem(user, 2)
    await chooseCamera(user, 2, jpeg())
    const second = lotCard(2)
    expect(await within(second).findByRole('alert')).toHaveTextContent('Sem conexão. A foto não foi enviada')
    await user.click(within(second).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(second).findByRole('img', { name: 'Foto 1 do item 2' })).toBeInTheDocument()
    expect(mockPrepare).toHaveBeenCalledTimes(1)
  })

  it('foto SEM observação: o banner do Salvar avisa "1 item com foto sem observação"; com observação some', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    mockUploadPhoto.mockResolvedValue(saved('pnovo'))
    await chooseCamera(user, 1, jpeg())
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const notice = await screen.findByText(/^No fechamento pelo computador:/)
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toHaveTextContent('1 item com foto sem observação')
    expect(mockSaveConference).toHaveBeenCalledTimes(1)

    await user.type(screen.getByRole('textbox', { name: 'Observação da avaria ou ressalva do item 1' }), 'Caixa rasgada')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(2))
    const second = await screen.findByText(/^No fechamento pelo computador:/)
    expect(second).not.toHaveTextContent('com foto sem observação')
  })

  it('avaria sem foto continua válida (nada a avisar sobre foto)', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    await user.click(within(lotCard(1)).getByText('Etiquetas, fotos e avaria'))
    await user.type(screen.getByRole('textbox', { name: 'Observação da avaria ou ressalva do item 1' }), 'Pallet torto')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const notice = await screen.findByText(/^No fechamento pelo computador:/)
    expect(notice).not.toHaveTextContent('foto')
  })

  it('a faixa conta as fotos da conferência e a aba Recebimento mostra "N foto(s)" por lote', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc(withPhotos(2, 'Molhadas')) })
    expect(screen.getByText('2 de 30 fotos de avaria')).toBeInTheDocument()
    await openReceipt(user)
    const card = screen.getByRole('region', { name: 'Ressalvas e avarias' })
    expect(within(card).getByText('2 fotos')).toBeInTheDocument()
  })

  it('remover foto já salva: some do lote e o Salvar grava sem ela (o arquivo sai pelo servidor, não pelo cliente)', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc(withPhotos(2, 'Molhadas')) })
    await openItem(user, 1)
    await screen.findByRole('img', { name: 'Foto 2 do item 1' })
    await user.click(screen.getByRole('button', { name: 'Remover foto 1 do item 1' }))
    expect(screen.queryByRole('img', { name: 'Foto 2 do item 1' })).not.toBeInTheDocument()
    expect(mockDeleteOwnPhotos).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].damageByRowId['r-1'].photos.map((item) => item.id)).toEqual(['s2'])
  })

  it('remover foto enviada agora e ainda não salva apaga o arquivo do próprio uid (sem órfão)', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    mockUploadPhoto.mockResolvedValue(saved('pnovo'))
    await chooseCamera(user, 1, jpeg())
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    await user.click(screen.getByRole('button', { name: 'Remover foto 1 do item 1' }))
    expect(mockDeleteOwnPhotos).toHaveBeenCalledWith('p1', [saved('pnovo')], { uid: 'log-1' })
  })

  it('avaria automática: foto liga, remover a última foto sem observação desliga e a entrada sai do payload', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    const first = lotCard(1)
    expect(within(first).queryByText('Avaria registrada')).not.toBeInTheDocument()
    mockUploadPhoto.mockResolvedValue(saved('pnovo'))
    await chooseCamera(user, 1, jpeg())
    await within(first).findByRole('img', { name: 'Foto 1 do item 1' })
    expect(within(first).getByText('Avaria registrada')).toBeInTheDocument()
    await user.click(within(first).getByRole('button', { name: 'Remover foto 1 do item 1' }))
    expect(within(first).queryByText('Avaria registrada')).not.toBeInTheDocument()
    await user.click(okButton(1))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].damageByRowId).toEqual({})
  })

  it('avaria automática: com observação, remover a última foto mantém a avaria; apagar a observação (sem foto) a derruba', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    const first = lotCard(1)
    mockUploadPhoto.mockResolvedValue(saved('pnovo'))
    await chooseCamera(user, 1, jpeg())
    await within(first).findByRole('img', { name: 'Foto 1 do item 1' })
    await user.type(screen.getByRole('textbox', { name: 'Observação da avaria ou ressalva do item 1' }), 'Caixa rasgada')
    await user.click(within(first).getByRole('button', { name: 'Remover foto 1 do item 1' }))
    expect(within(first).getByText('Avaria registrada')).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Observação da avaria ou ressalva do item 1' }))
    expect(within(first).queryByText('Avaria registrada')).not.toBeInTheDocument()
  })

  it('lote com avaria só por foto (sem texto) aparece como "(sem observação)"', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    mockUploadPhoto.mockResolvedValue(saved('pnovo'))
    await chooseCamera(user, 1, jpeg())
    await screen.findByRole('img', { name: 'Foto 1 do item 1' })
    await backToItems(user)
    await openReceipt(user)
    expect(screen.getByText('(sem observação)')).toBeInTheDocument()
  })

  it('legado: lote com flagged verdadeiro, sem observação e sem foto, é SEM avaria e a gravação o tira do mapa', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ damageByRowId: { 'r-1': { flagged: true, note: '', photos: [] } } }),
    })
    await openItem(user, 1)
    const first = lotCard(1)
    expect(within(first).queryByText('Avaria registrada')).not.toBeInTheDocument()
    await user.click(okButton(1))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].damageByRowId).toEqual({})
  })

  it('legado só com flagged verdadeiro: a conferência abre limpa (Salvar desabilitado, sem aviso de alteração pendente)', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ damageByRowId: { 'r-1': { flagged: true, note: '', photos: [] } } }),
    })
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await openItem(user, 1)
    expect(within(lotCard(1)).queryByText('Avaria registrada')).not.toBeInTheDocument()
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('5 fotos no lote: os dois botões ficam desabilitados com o motivo; os outros lotes seguem liberados', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc(withPhotos(5, 'Muitas')) })
    await openItem(user, 1)
    expect(screen.getByRole('button', { name: 'Tirar foto do item 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Anexar fotos ao item 1' })).toBeDisabled()
    expect(screen.getByText('Limite de 5 fotos por item atingido.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Próximo item/ }))
    await user.click(within(lotCard(2)).getByText('Etiquetas, fotos e avaria'))
    expect(screen.getByRole('button', { name: 'Tirar foto do item 2' })).toBeEnabled()
  })

  it('conferência fechada: miniaturas e ampliar, sem "×", sem Tirar foto e sem Anexar', async () => {
    const { user } = await renderScreen({ conference: closedConference(withPhotos(2, 'Molhadas')) })
    await openItem(user, 1)
    const first = lotCard(1)
    expect(await within(first).findByRole('img', { name: 'Foto 2 do item 1' })).toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: /Remover foto|Tirar foto|Anexar/ })).not.toBeInTheDocument()
    expect(within(first).queryByLabelText(/Foto da câmera|Arquivos de foto/)).not.toBeInTheDocument()
    await user.click(within(first).getByRole('button', { name: 'Foto 1 do item 1' }))
    expect(await screen.findByRole('dialog', { name: 'Foto da avaria' })).toBeInTheDocument()
  })

  it('admin vê as fotos (só leitura) e abre o visualizador', async () => {
    const { user } = await renderScreen({ profile: ADMIN, conference: conferenceDoc(withPhotos(3, 'Molhadas')) })
    await openItem(user, 1)
    const first = lotCard(1)
    expect(await within(first).findByRole('img', { name: 'Foto 3 do item 1' })).toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: /Remover foto|Tirar foto|Anexar/ })).not.toBeInTheDocument()
    await user.click(within(first).getByRole('button', { name: 'Foto 2 do item 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Foto da avaria' })
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Foto 2 de 3 · Item 1 · DEA FOAM14339 - BB 25KG')
    expect(mockDownloadPhoto).toHaveBeenCalledWith('p1', 's2', 'full')
  })

  it('reabrir a conferência mantém as fotos', async () => {
    const { user } = await renderScreen({ profile: ADMIN, conference: closedConference(withPhotos(2, 'Molhadas')) })
    await user.click(screen.getByRole('button', { name: 'Reabrir conferência' }))
    await waitFor(() => expect(mockReopen).toHaveBeenCalledWith('p1', ADMIN))
    await screen.findByText('Conferência reaberta. A logística pode corrigir e fechar de novo.')
    await openItem(user, 1)
    expect(await within(lotCard(1)).findByRole('img', { name: 'Foto 2 do item 1' })).toBeInTheDocument()
  })

  it('sair com foto ainda subindo pede confirmação, como alteração não salva', async () => {
    mockUploadPhoto.mockImplementation(() => new Promise(() => {}))
    const onBack = vi.fn()
    const wrapper = ({ children }) => (
      <MemoryRouter>
        <ToastProvider>
          <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
        </ToastProvider>
      </MemoryRouter>
    )
    const { user } = await renderScreen({ onBack, wrapper })
    await openItem(user, 1)
    await chooseCamera(user, 1, jpeg())
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
    // Voltar aos itens não perde nada; sair da conferência (Voltar para a lista) pede a confirmação.
    await backToItems(user)
    await user.click(screen.getByRole('button', { name: 'Voltar para a lista' }))
    expect(onBack).not.toHaveBeenCalled()
    expect(await screen.findByRole('alertdialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
  })
})

// Polimento do contador (pós S10-I): "Só pendentes" não esconde o item em contagem; selo neutro "A contar".
describe('"Só pendentes" mantém o item em contagem (fixados)', () => {
  const onlyPendingBox = () => screen.getByRole('checkbox', { name: 'Só pendentes' })
  const item = (n) => screen.queryByRole('button', { name: `Abrir ${ITEM_NAME[n]}` })

  it('contar pallets de um item pendente: ao virar conferido o item permanece sob o dedo', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc({ okByRowId: { 'r-1': true } }) })
    await user.click(onlyPendingBox())
    expect(item(1)).toBeInTheDocument()
    await countIn(user, 1)
    expect(within(item(1)).getByText('Conferido')).toBeInTheDocument()
    expect(item(1)).toBeInTheDocument()
    // Os contadores seguem o dado real (1 conferido), com ou sem o item fixado.
    expect(progressText().querySelector('b')).toHaveTextContent('1')
    expect(item(2)).toBeInTheDocument()
  })

  it('um item conferido que ninguém tocou continua escondido pelo filtro', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ okByRowId: { 'r-1': true }, palletsByRowId: { 'r-1': 2 } }),
    })
    await user.click(onlyPendingBox())
    expect(item(1)).not.toBeInTheDocument()
    expect(item(2)).toBeInTheDocument()
  })

  it('tocar, focar ou editar fixa o item; trocar o filtro zera os fixados', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ okByRowId: { 'r-2': true }, palletsByRowId: { 'r-2': 1 } }),
    })
    await user.click(onlyPendingBox())
    expect(item(2)).not.toBeInTheDocument()
    // Item 1 pendente: foco na etiqueta fixa; depois de marcar OK? e contar, o item fica.
    await openItem(user, 1)
    await user.type(screen.getByLabelText('Etiqueta WMS da linha 1'), 'x')
    await user.click(okButton(1))
    await user.click(plusButton(1))
    await backToItems(user)
    expect(item(1)).toBeInTheDocument()
    // Trocar o filtro (desligar e ligar) zera o fixado: o item 1, já conferido, sai da lista.
    await user.click(onlyPendingBox())
    expect(item(2)).toBeInTheDocument()
    await user.click(onlyPendingBox())
    expect(item(1)).not.toBeInTheDocument()
    expect(item(2)).not.toBeInTheDocument()
  })

  it('o fixado vale só dentro da sessão da tela: ao remontar, nada fixado', async () => {
    const { user, unmount } = await renderScreen()
    await user.click(onlyPendingBox())
    await openItem(user, 1)
    await user.click(okButton(1))
    await user.click(plusButton(1))
    await backToItems(user)
    expect(item(1)).toBeInTheDocument()
    unmount()
    cleanup()
    const next = await renderScreen({
      conference: conferenceDoc({ okByRowId: { 'r-1': true }, palletsByRowId: { 'r-1': 1 } }),
    })
    await next.user.click(onlyPendingBox())
    expect(item(1)).not.toBeInTheDocument()
  })

  it('o fixado só muda a lista: o aviso de todos conferidos e o dado gravado seguem o estado real', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ okByRowId: { 'r-2': true, 'r-3': true }, palletsByRowId: { 'r-2': 1, 'r-3': 1 } }),
    })
    await user.click(onlyPendingBox())
    await openItem(user, 1)
    await user.click(okButton(1))
    await user.click(plusButton(1))
    await backToItems(user)
    expect(screen.getByText('Todos os itens estão conferidos.')).toBeInTheDocument()
    expect(item(1)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const saved = mockSaveConference.mock.calls[0][1]
    expect(saved.palletsByRowId).toEqual({ 'r-1': 1, 'r-2': 1, 'r-3': 1 })
    expect(saved.okByRowId).toEqual({ 'r-1': true, 'r-2': true, 'r-3': true })
  })
})

describe('selo neutro "A contar"', () => {
  it('com o total do COMEX informado, o lote nunca contado mostra "A contar" (neutro) e não "Sem contagem"', async () => {
    const { user } = await renderScreen({ current: currentDoc({ expectedPallets: 5 }) })
    for (const n of [1, 2, 3]) {
      await openItem(user, n)
      expect(within(lotCard(n)).getByText('A contar')).toHaveClass('ccf-badge')
      expect(within(lotCard(n)).queryByText('Sem contagem')).not.toBeInTheDocument()
      if (n === 1) {
        // Neutro de verdade: só a classe base, sem nenhuma variante de cor (uma asserção por classe, não vácua).
        const neutral = within(lotCard(1)).getByText('A contar')
        expect(neutral.className).toBe('ccf-badge')
        for (const variant of ['ccf-badge--ok', 'ccf-badge--warn', 'ccf-badge--danger', 'ccf-badge--info']) {
          expect(neutral).not.toHaveClass(variant)
        }
      }
      await backToItems(user)
    }
  })

  it('conferência fechada (logística) ou só leitura (admin): lote nunca contado segue "Sem contagem", sem "A contar"', async () => {
    const closed = conferenceDoc({ status: 'fechada', closedDate: '2026-11-24', closedByName: 'Op', closedDocumentId: 'd' })
    const first = await renderScreen({ current: currentDoc({ expectedPallets: 5 }), conference: closed })
    await openItem(first.user, 1)
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(within(lotCard(1)).getByText('Sem contagem')).toBeInTheDocument()
    first.unmount()
    cleanup()
    const second = await renderScreen({ profile: ADMIN, current: currentDoc({ expectedPallets: 5 }), conference: conferenceDoc() })
    await openItem(second.user, 1)
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(within(lotCard(1)).getByText('Sem contagem')).toBeInTheDocument()
  })

  it('sem o total do COMEX não há "A contar" (segue "Sem contagem")', async () => {
    const { user } = await renderScreen()
    await openItem(user, 1)
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(within(lotCard(1)).getByText('Sem contagem')).toBeInTheDocument()
  })

  it('tudo contado e conferindo: nenhum "A contar" e a faixa mostra "Confere"', async () => {
    await renderScreen({
      current: currentDoc({ expectedPallets: 3 }),
      conference: conferenceDoc({ palletsByRowId: { 'r-1': 1, 'r-2': 1, 'r-3': 1 } }),
    })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(within(palletsStrip()).getByText('Confere')).toBeInTheDocument()
  })
})
