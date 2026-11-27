// Conferência por item (Fatia B): a tela do celular com unidades por lote e pallet parcial (fluxo completo: contar unidades,
// divergência, folha do parcial, "lote conferido" com parcial, faixa e total do item, remover dos dois lotes, aviso do Salvar e
// gravação das chaves novas). Repositórios mockados; dados inventados.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockGetCargoReport = vi.fn()
const mockSaveConference = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportConference: (...args) => mockSaveConference(...args),
  closeCargoReportConference: vi.fn(),
  retryCloseConferenceWrite: vi.fn(),
  reopenCargoReportConference: vi.fn(),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({ generateCargoReportFile: vi.fn() }))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: vi.fn().mockResolvedValue({
    exists: true,
    version: 3,
    itemCount: 2,
    items: [
      { code: 'BA5012', description: 'POLYETHER POLYOL', packagingType: 'TAMBOR', netWeightKg: 25 },
      { code: 'BA5033', description: 'ZINC CATALYST', packagingType: 'SACO', netWeightKg: 25 },
    ],
  }),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  getSupplierPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, entries: [], entryCount: 0, aliases: [] }),
  upsertSupplierPackagingEntry: vi.fn(),
}))
vi.mock('../../src/services/cargoConferencePhotosRepository', () => ({
  uploadCargoConferencePhoto: vi.fn(),
  deleteOwnCargoConferencePhotoFiles: vi.fn(),
  downloadCargoConferencePhotoBlob: vi.fn(),
}))
vi.mock('../../src/features/processes/useCargoConferenceList', () => ({ invalidateCargoConference: vi.fn() }))

import { ToastProvider } from '../../src/components/Toast'
import CargoConferenceScreen from '../../src/features/processes/CargoConferenceScreen'

const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }
const PROCESS = { id: 'p1', name: 'DEMO 001', processNumber: 'DEMO 001', category: 'FCL', supplierName: 'Fornecedor Alfa Ltda', archived: false }

const row = (overrides = {}) => ({
  id: 'r-1',
  po: '',
  dbcorpCode: 'BA5012',
  supplierDescription: 'POLYETHER POLYOL PE-3000',
  sqDescription: 'Poliol Flex 3000',
  supplierLot: 'L-2231',
  wmsLabel: '',
  sqLabel: '',
  quantityKg: 2500, // 25 kg líquidos por embalagem: 100 esperadas
  count: null,
  packageWeightKg: 9.8,
  frozenNetWeightKg: null,
  frozenPackages: null,
  ...overrides,
})

const ROWS = [
  row({ id: 'r-1' }),
  row({ id: 'r-2', supplierLot: 'L-2232', quantityKg: 5000 }), // 200 esperadas
  row({ id: 'r-3', dbcorpCode: 'BA5033', supplierDescription: 'ZINC CATALYST ZN12', sqDescription: 'Catalisador ZN-12', supplierLot: 'Z-9910', quantityKg: 1000 }), // 40 esperadas
]

const currentDoc = (overrides = {}) => ({
  schemaVersion: 1,
  formCode: 'FR.CMX.001',
  formRevision: '005',
  revision: 4,
  status: 'concluido',
  cargoType: 'FCL',
  titleSuffix: 'DEMO 001',
  rows: ROWS,
  expectedPallets: 6,
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

async function renderScreen({ conference = conferenceDoc(), current = currentDoc(), profile = LOGISTICA } = {}) {
  mockGetCargoReport.mockResolvedValue({ current, conference })
  const user = userEvent.setup()
  rtlRender(
    <MemoryRouter initialEntries={['/conferencia?processo=p1']}>
      <CargoConferenceScreen process={PROCESS} profile={profile} canSeeName onBack={vi.fn()} />
    </MemoryRouter>,
    { wrapper: ToastProvider }
  )
  await screen.findByRole('tablist')
  return { user }
}

const openItem = (user, name) => user.click(screen.getByRole('button', { name: `Abrir ${name}` }))
const backToItems = (user) => user.click(screen.getAllByRole('button', { name: 'Voltar aos itens' })[0])
const lot = (title) => screen.getByRole('article', { name: title })
const strip = () => screen.getByText(/pallets? contados?/).closest('p')
const itemStrip = () => document.querySelector('.ccf-strip .ccf-pallets')

let clock = 0
let consoleSpy
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  mockSaveConference.mockResolvedValue({ revision: 3 })
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  // O catálogo Item x Emb. é cacheado por 5 min no módulo: o relógio avança a cada teste para não herdar o cache.
  vi.useFakeTimers({ toFake: ['Date'] })
  clock += 10 * 60 * 1000
  vi.setSystemTime(new Date(2026, 10, 27, 11, 40).getTime() + clock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  consoleSpy.mockRestore()
})

describe('unidades contadas por lote', () => {
  it('digitar, "+ Unidade" e "−" mexem no total do lote; o esperado é o Nº de emb. do relatório', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    const first = lot('Lote L-2231')
    expect(within(first).getByText(/^Esperadas:/)).toHaveTextContent('Esperadas: 100 (Nº de emb. do relatório)')
    expect(within(lot('Lote L-2232')).getByText(/^Esperadas:/)).toHaveTextContent('Esperadas: 200')
    const input = within(first).getByLabelText('Unidades contadas do Lote L-2231')
    await user.type(input, '98')
    expect(input).toHaveValue('98')
    await user.click(within(first).getByRole('button', { name: 'Adicionar uma unidade à contagem do item 1' }))
    expect(input).toHaveValue('99')
    await user.click(within(first).getByRole('button', { name: 'Tirar uma unidade da contagem do item 1' }))
    expect(input).toHaveValue('98')
    // 98 de 100: divergente, com a diferença.
    expect(within(first).getByText('Unidades divergentes')).toBeInTheDocument()
    expect(within(first).getByText(/^Esperadas:/)).toHaveTextContent('· diferença de 2')
    // Igual ao esperado: sai a divergência. 0 e vazio não divergem.
    await user.clear(input)
    await user.type(input, '100')
    expect(within(first).queryByText('Unidades divergentes')).not.toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '0')
    expect(within(first).queryByText('Unidades divergentes')).not.toBeInTheDocument()
    await user.clear(input)
    expect(within(first).queryByText('Unidades divergentes')).not.toBeInTheDocument()
  })

  it('o topo do item soma as unidades ("U de E unidades") e a lista mostra o selo "Unidades divergentes" no item', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    expect(itemStrip()).toHaveTextContent('0 de 300 unidades')
    await user.type(within(lot('Lote L-2231')).getByLabelText('Unidades contadas do Lote L-2231'), '100')
    await user.type(within(lot('Lote L-2232')).getByLabelText('Unidades contadas do Lote L-2232'), '190')
    expect(itemStrip()).toHaveTextContent('290 de 300 unidades')
    await backToItems(user)
    const row1 = screen.getByRole('button', { name: 'Abrir Poliol Flex 3000' })
    expect(within(row1).getByText('Unidades divergentes')).toHaveClass('ccf-badge--warn')
    expect(within(screen.getByRole('button', { name: 'Abrir Catalisador ZN-12' })).queryByText('Unidades divergentes')).not.toBeInTheDocument()
  })

  it('não é obrigatório: sem unidades nenhum selo e o Salvar avisa só do que já avisava', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc({ okByRowId: { 'r-1': true }, palletsByRowId: { 'r-1': 1 } }) })
    expect(screen.queryByText('Unidades divergentes')).not.toBeInTheDocument()
    await openItem(user, 'Poliol Flex 3000')
    await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'Adicionar um pallet à contagem do item 1' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].unitsByRowId).toEqual({})
    expect(mockSaveConference.mock.calls[0][1].partialPallets).toEqual([])
    expect(screen.queryByText(/unidades divergentes/)).not.toBeInTheDocument()
  })

  it('o Salvar grava as unidades e avisa "N lote(s) com unidades divergentes" no fechamento pelo computador (sem bloquear)', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    await user.type(within(lot('Lote L-2231')).getByLabelText('Unidades contadas do Lote L-2231'), '90')
    await user.type(within(lot('Lote L-2232')).getByLabelText('Unidades contadas do Lote L-2232'), '200')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].unitsByRowId).toEqual({ 'r-1': 90, 'r-2': 200 })
    expect(await screen.findByText(/No fechamento pelo computador:/)).toHaveTextContent('1 lote com unidades divergentes')
  })
})

describe('pallet parcial', () => {
  async function addPartial(user, { mine, otherLabel, other }) {
    await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'Pallet parcial' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pallet parcial' })
    await user.type(within(dialog).getByLabelText('Unidades deste lote no pallet'), mine)
    if (otherLabel) {
      await user.selectOptions(within(dialog).getByLabelText('Dividido com'), otherLabel)
      await user.type(within(dialog).getByLabelText('Unidades do outro lote no pallet'), other)
    }
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar pallet parcial' }))
  }

  it('divide o pallet com OUTRO lote: aparece nos DOIS lotes, conta 1 na carga e a folha fecha com o aviso do mock', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    await addPartial(user, { mine: '30', otherLabel: 'Catalisador ZN-12 · Z-9910', other: '20' })
    expect(screen.queryByRole('dialog', { name: 'Pallet parcial' })).not.toBeInTheDocument()
    expect(await screen.findByText('Pallet parcial adicionado. Conta 1 pallet na carga.')).toBeInTheDocument()
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toHaveTextContent(
      'Pallet parcial · 30 un. deste lote + 20 un. de Catalisador ZN-12 · Z-9910'
    )
    expect(screen.getByText('30 das unidades contadas estão em pallet parcial.')).toBeInTheDocument()
    // O topo do item conta o parcial.
    expect(itemStrip()).toHaveTextContent('1 pallet (0 inteiros + 1 parcial)')
    // No outro item o mesmo pallet aparece, com as unidades dele.
    await backToItems(user)
    await openItem(user, 'Catalisador ZN-12')
    expect(lot('Lote Z-9910').querySelector('.ccf-parc')).toHaveTextContent(
      'Pallet parcial · 20 un. deste lote + 30 un. de Poliol Flex 3000 · L-2231'
    )
    expect(screen.getByText('20 das unidades contadas estão em pallet parcial.')).toBeInTheDocument()
  })

  it('o parcial vale como pallet contado ("lote conferido" com OK?), a faixa conta 1 só e mostra "(inclui 1 parcial)"', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    expect(within(lot('Lote L-2231')).getByText('A contar')).toBeInTheDocument()
    await addPartial(user, { mine: '30', otherLabel: 'Catalisador ZN-12 · Z-9910', other: '20' })
    await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'OK? do Lote L-2231' }))
    expect(within(lot('Lote L-2231')).getByText('Conferido')).toBeInTheDocument()
    expect(within(lot('Lote L-2231')).queryByText('A contar')).not.toBeInTheDocument()
    await backToItems(user)
    // 1 pallet físico (nos dois lotes) em 6 informados.
    expect(strip()).toHaveTextContent('1 pallet contado de 6 informados pelo COMEX (inclui 1 parcial)')
    expect(within(strip()).getByText('Divergente')).toBeInTheDocument()
  })

  it('pallet inteiro + parcial somam no item e na carga ("N pallets (W inteiros + K parcial)") e fecham o total', async () => {
    const { user } = await renderScreen({ current: currentDoc({ expectedPallets: 5 }) })
    await openItem(user, 'Poliol Flex 3000')
    for (let index = 0; index < 4; index += 1) {
      await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'Adicionar um pallet à contagem do item 1' }))
    }
    await addPartial(user, { mine: '30', otherLabel: 'Poliol Flex 3000 · L-2232', other: '20' })
    // Um parcial dividido entre dois lotes do MESMO item conta 1.
    expect(itemStrip()).toHaveTextContent('5 pallets (4 inteiros + 1 parcial)')
    await backToItems(user)
    expect(strip()).toHaveTextContent('5 pallets contados de 5 informados pelo COMEX (inclui 1 parcial)')
    expect(within(strip()).getByText('Confere')).toBeInTheDocument()
  })

  it('"Nenhum (pallet incompleto)" cria um parcial de 1 parte; remover em um lote remove o pallet dos dois ("removido dos dois lotes")', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    await addPartial(user, { mine: '12' })
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toHaveTextContent('Pallet parcial · 12 un. deste lote · pallet incompleto')
    await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'Pallet parcial' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pallet parcial' })
    await user.type(within(dialog).getByLabelText('Unidades deste lote no pallet'), '30')
    await user.selectOptions(within(dialog).getByLabelText('Dividido com'), 'Poliol Flex 3000 · L-2232')
    await user.type(within(dialog).getByLabelText('Unidades do outro lote no pallet'), '20')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(lot('Lote L-2232').querySelectorAll('.ccf-parc')).toHaveLength(1)
    // Remover o pallet dividido pelo outro lote tira o cartão dos dois.
    await user.click(within(lot('Lote L-2232')).getByRole('button', { name: 'Remover este pallet parcial' }))
    expect(await screen.findByText('Pallet parcial removido dos dois lotes')).toBeInTheDocument()
    expect(lot('Lote L-2232').querySelector('.ccf-parc')).toBeNull()
    expect(lot('Lote L-2231').querySelectorAll('.ccf-parc')).toHaveLength(1)
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toHaveTextContent('pallet incompleto')
  })

  it('Cancelar e Esc fecham a folha sem adicionar', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'Pallet parcial' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Pallet parcial' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Pallet parcial' })).not.toBeInTheDocument()
    await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'Pallet parcial' }))
    await screen.findByRole('dialog', { name: 'Pallet parcial' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Pallet parcial' })).not.toBeInTheDocument()
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toBeNull()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  // Sair do item com a folha aberta ZERA a folha: reabrir o mesmo item (ou abrir outro) não a traz de volta.
  const openSheetOf = async (user, lotTitle) => {
    await user.click(within(lot(lotTitle)).getByRole('button', { name: 'Pallet parcial' }))
    return screen.findByRole('dialog', { name: 'Pallet parcial' })
  }
  const noSheet = () => expect(screen.queryByRole('dialog', { name: 'Pallet parcial' })).not.toBeInTheDocument()

  it('folha aberta + "Voltar aos itens" + reabrir o MESMO item: a folha não reaparece (e o que foi digitado se perdeu de vez)', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    const dialog = await openSheetOf(user, 'Lote L-2231')
    await user.type(within(dialog).getByLabelText('Unidades deste lote no pallet'), '12')
    await backToItems(user)
    noSheet()
    await openItem(user, 'Poliol Flex 3000')
    noSheet()
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toBeNull()
    // Abrir a folha de novo começa vazia.
    const again = await openSheetOf(user, 'Lote L-2231')
    expect(within(again).getByLabelText('Unidades deste lote no pallet')).toHaveValue('')
  })

  it('folha aberta + "Próximo item": o item seguinte abre sem folha e voltar ao primeiro também', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    await openSheetOf(user, 'Lote L-2231')
    await user.click(screen.getByRole('button', { name: /Próximo item/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Catalisador ZN-12' })).toBeInTheDocument()
    noSheet()
    await backToItems(user)
    await openItem(user, 'Poliol Flex 3000')
    noSheet()
  })

  it('folha aberta + voltar à lista + abrir OUTRO item: sem folha', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    await openSheetOf(user, 'Lote L-2232')
    await backToItems(user)
    await openItem(user, 'Catalisador ZN-12')
    noSheet()
    await backToItems(user)
    await openItem(user, 'Poliol Flex 3000')
    noSheet()
  })

  it('limite de 50 pallets parciais: o 51º não entra, aparece o toast do limite e a folha continua aberta', async () => {
    const partials = Array.from({ length: 50 }, (_, index) => ({ id: `pp${index}`, parts: [{ rowId: 'r-3', units: 1 }] }))
    const { user } = await renderScreen({ conference: conferenceDoc({ partialPallets: partials }) })
    await openItem(user, 'Poliol Flex 3000')
    const dialog = await openSheetOf(user, 'Lote L-2231')
    await user.type(within(dialog).getByLabelText('Unidades deste lote no pallet'), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(await screen.findByText('Limite de 50 pallets parciais por conferência.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Pallet parcial' })).toBeInTheDocument()
    expect(screen.queryByText('Pallet parcial adicionado. Conta 1 pallet na carga.')).not.toBeInTheDocument()
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toBeNull()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await user.click(within(screen.getByRole('dialog', { name: 'Pallet parcial' })).getByRole('button', { name: 'Cancelar' }))
  })

  it('com 49 parciais o 50º ainda entra e a folha fecha', async () => {
    const partials = Array.from({ length: 49 }, (_, index) => ({ id: `pp${index}`, parts: [{ rowId: 'r-3', units: 1 }] }))
    const { user } = await renderScreen({ conference: conferenceDoc({ partialPallets: partials }) })
    await openItem(user, 'Poliol Flex 3000')
    const dialog = await openSheetOf(user, 'Lote L-2231')
    await user.type(within(dialog).getByLabelText('Unidades deste lote no pallet'), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(await screen.findByText('Pallet parcial adicionado. Conta 1 pallet na carga.')).toBeInTheDocument()
    noSheet()
    expect(lot('Lote L-2231').querySelectorAll('.ccf-parc')).toHaveLength(1)
    expect(screen.queryByText(/Limite de 50/)).not.toBeInTheDocument()
  })

  it('o Salvar grava os parciais e as unidades (as duas chaves novas)', async () => {
    const { user } = await renderScreen()
    await openItem(user, 'Poliol Flex 3000')
    await addPartial(user, { mine: '30', otherLabel: 'Catalisador ZN-12 · Z-9910', other: '20' })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload.partialPallets).toHaveLength(1)
    expect(payload.partialPallets[0].parts).toEqual([
      { rowId: 'r-1', units: 30 },
      { rowId: 'r-3', units: 20 },
    ])
    expect(payload.partialPallets[0].id).toMatch(/^[A-Za-z0-9_-]{1,40}$/)
    expect(payload.unitsByRowId).toEqual({})
  })
})

describe('conferência já gravada, somente leitura e doc antigo', () => {
  const saved = () =>
    conferenceDoc({
      okByRowId: { 'r-1': true },
      palletsByRowId: { 'r-1': 2 },
      unitsByRowId: { 'r-1': 90 },
      partialPallets: [{ id: 'pp1', parts: [{ rowId: 'r-1', units: 30 }, { rowId: 'r-3', units: 20 }] }],
    })

  it('abre com o que o celular ou o computador gravaram (unidades e parciais)', async () => {
    const { user } = await renderScreen({ conference: saved() })
    expect(strip()).toHaveTextContent('3 pallets contados de 6 informados pelo COMEX (inclui 1 parcial)')
    await openItem(user, 'Poliol Flex 3000')
    expect(within(lot('Lote L-2231')).getByLabelText('Unidades contadas do Lote L-2231')).toHaveValue('90')
    expect(itemStrip()).toHaveTextContent('3 pallets (2 inteiros + 1 parcial)')
    expect(itemStrip()).toHaveTextContent('90 de 300 unidades')
  })

  it('conferência fechada: sem campo, botões nem folha; o parcial e as unidades aparecem só para leitura', async () => {
    const { user } = await renderScreen({ conference: { ...saved(), status: 'fechada', closedDate: '2026-11-26', closedByName: 'Op' } })
    await openItem(user, 'Poliol Flex 3000')
    const first = lot('Lote L-2231')
    expect(within(first).queryByLabelText('Unidades contadas do Lote L-2231')).not.toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: 'Pallet parcial' })).not.toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: 'Remover este pallet parcial' })).not.toBeInTheDocument()
    expect(first.querySelector('.ccf-cnum')).toHaveTextContent('90unidades')
    expect(first.querySelector('.ccf-parc')).toHaveTextContent('Pallet parcial · 30 un. deste lote + 20 un. de Catalisador ZN-12 · Z-9910')
    expect(within(first).getByText('Unidades divergentes')).toBeInTheDocument()
  })

  it('o parcial de um lote que o COMEX removeu fica como "pallet incompleto" e continua contando 1', async () => {
    const { user } = await renderScreen({
      current: currentDoc({ rows: ROWS.filter((item) => item.id !== 'r-3') }),
      conference: saved(),
    })
    expect(strip()).toHaveTextContent('3 pallets contados de 6 informados pelo COMEX (inclui 1 parcial)')
    await openItem(user, 'Poliol Flex 3000')
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toHaveTextContent('Pallet parcial · 30 un. deste lote · pallet incompleto')
  })

  it('doc antigo (sem as chaves novas) abre igual à Fatia A e o primeiro Salvar grava as chaves vazias', async () => {
    const { user } = await renderScreen({ conference: conferenceDoc({ okByRowId: { 'r-1': true }, palletsByRowId: { 'r-1': 1 } }) })
    expect(strip()).toHaveTextContent('1 pallet contado de 6 informados pelo COMEX')
    expect(strip()).not.toHaveTextContent('inclui')
    await openItem(user, 'Poliol Flex 3000')
    expect(within(lot('Lote L-2231')).getByLabelText('Unidades contadas do Lote L-2231')).toHaveValue('')
    expect(lot('Lote L-2231').querySelector('.ccf-parc')).toBeNull()
    await user.click(within(lot('Lote L-2231')).getByRole('button', { name: 'Tirar um pallet da contagem do item 1' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1]).toMatchObject({ unitsByRowId: {}, partialPallets: [] })
  })
})
