// S9-C do Relatório de Carga: relatório novo preenchido do processo e do FUP, marcas de origem, "Atualizar" com
// prévia, aviso de Qtd divergente e o que é gravado. Repositórios mockados; o FUP vem de `loadErpProcessReference`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockGetCargoReport = vi.fn()
const mockSaveDraft = vi.fn()
const mockGetCatalog = vi.fn()
const mockLoadReference = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportDraft: (...args) => mockSaveDraft(...args),
  saveCargoReportConference: vi.fn(),
  concludeCargoReport: vi.fn(),
  retryConcludeWrite: vi.fn(),
  reopenCargoReport: vi.fn(),
  closeCargoReportConference: vi.fn(),
  retryCloseConferenceWrite: vi.fn(),
  reopenCargoReportConference: vi.fn(),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({ generateCargoReportFile: vi.fn() }))
vi.mock('../../src/services/processDocumentsRepository', () => ({ saveBlobAsFile: vi.fn() }))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: (...args) => mockGetCatalog(...args),
}))
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpProcessReference: (...args) => mockLoadReference(...args),
}))
vi.mock('../../src/services/auditRepository', () => ({ createAuditEvent: vi.fn().mockResolvedValue(undefined) }))

import { ToastProvider } from '../../src/components/Toast'
import CargoReportForm from '../../src/features/processes/CargoReportForm'

const render = (ui, options) => rtlRender(ui, { wrapper: ToastProvider, ...options })

const ADMIN = { uid: 'admin-1', name: 'Lucas Admin', email: 'lucas@sqquimica.com', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }

const PROCESS = {
  id: 'p1',
  name: 'GOOYER SEA 001-26',
  processNumber: '4500871',
  category: 'FCL',
  supplierName: 'GOOYER CHEMICALS LTD',
  duimpNumber: '25BR00001234567',
  items: [
    { id: 'i1', commercialName: 'POLIOL PE-3000', quantity: 40000 },
    { id: 'i2', commercialName: 'CATALISADOR ZN-12', quantity: 4000 },
  ],
}

const CATALOG = {
  exists: true,
  version: 3,
  itemCount: 2,
  items: [
    { code: 'BA5012', description: 'POLIOL', packagingType: 'TAMBOR', netWeightKg: 200 },
    { code: 'BA5033', description: 'CATALISADOR', packagingType: 'BOMBONA', netWeightKg: 25 },
  ],
}

const fupItem = (overrides = {}) => ({
  commercialName: 'POLIOL PE-3000',
  pedido: '4500871',
  quantityKg: 40000,
  sqCode: 'BA5012',
  supplierRef: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
  itemId: '1001',
  ...overrides,
})

const FUP = [
  fupItem(),
  fupItem({ commercialName: 'CATALISADOR ZN-12', quantityKg: 4000, sqCode: 'BA5033', supplierRef: 'ZINC CATALYST ZN-12 PAIL 25 KG', itemId: '1002' }),
]

const reference = (items = FUP, snapshotId = 'snap-1') => ({
  snapshot: { snapshotId, updatedAtMs: new Date(2026, 10, 24, 14, 2).getTime() },
  hint: {
    snapshotId,
    matchRule: 'name',
    shipment: { orders: [{ pedido: '4500871', poRef: '', poBase: '', exporter: 'GOOYER CHEMICALS LTD' }], items },
  },
  stale: false,
})

const savedRow = (id, overrides = {}) => ({
  id,
  po: 'GOOYER SEA 001-26',
  dbcorpCode: 'BA5012',
  supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
  sqDescription: 'POLIOL PE-3000',
  supplierLot: 'L1',
  wmsLabel: '',
  sqLabel: '',
  quantityKg: 40000,
  count: null,
  packageWeightKg: null,
  frozenNetWeightKg: null,
  frozenPackages: null,
  ...overrides,
})

const currentDoc = (overrides = {}) => ({
  schemaVersion: 1,
  formCode: 'FR.CMX.001',
  formRevision: '005',
  revision: 2,
  status: 'rascunho',
  cargoType: 'FCL',
  titleSuffix: 'GOOYER SEA 001-26',
  rows: [savedRow('s-1')],
  notes: '',
  nfNumber: '',
  receiptStatus: '',
  receivedDate: '',
  completedDate: '',
  catalogVersion: 3,
  lastGenerated: null,
  updatedAt: new Date(2026, 10, 23, 19, 52),
  updatedByName: 'Lucas Admin',
  ...overrides,
})

let clock = 0

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  clock += 10 * 60 * 1000
  vi.setSystemTime(new Date(2026, 10, 24, 14, 5).getTime() + clock)
  mockGetCatalog.mockResolvedValue(CATALOG)
  mockGetCargoReport.mockResolvedValue({ current: null, conference: null })
  mockLoadReference.mockResolvedValue(reference())
  mockSaveDraft.mockResolvedValue({ revision: 1 })
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderForm({ profile = ADMIN, variant = 'desktop', process = PROCESS } = {}) {
  const user = userEvent.setup()
  const view = render(<CargoReportForm process={process} profile={profile} variant={variant} onClose={vi.fn()} />)
  await screen.findByRole('heading', { name: /RELATÓRIO DE CARGA - / })
  return { user, ...view }
}

describe('relatório novo (admin, estágio 1)', () => {
  it('abre preenchido do processo e do FUP, com a nota "Relatório novo."', async () => {
    await renderForm()

    expect(mockLoadReference).toHaveBeenCalledWith('p1')
    expect(screen.getByLabelText('PO / processo da linha 1')).toHaveValue('GOOYER SEA 001-26')
    expect(screen.getByLabelText('Cód. DBCorp da linha 1')).toHaveValue('BA5012')
    expect(screen.getByLabelText('Descrição fornecedor da linha 1')).toHaveValue('POLYETHER POLYOL PE-3000 DRUM 200 KG')
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('POLIOL PE-3000')
    expect(screen.getByLabelText('Qtd (kg) da linha 1')).toHaveValue('40.000')
    expect(screen.getByLabelText('PO / processo da linha 2')).toHaveValue('GOOYER SEA 001-26')
    expect(screen.getByText('Relatório novo.')).toBeInTheDocument()
    expect(screen.getByText(/Cód. DBCorp, Descrição Fornecedor e Qtd vêm do FUP importado/)).toBeInTheDocument()
  })

  it('marcas P e F ao lado dos campos, sem entrar no nome acessível, e a legenda', async () => {
    await renderForm()

    const po = screen.getByLabelText('PO / processo da linha 1')
    const code = screen.getByLabelText('Cód. DBCorp da linha 1')
    expect(po.parentElement.querySelector('[title="Veio do processo"]')).toHaveTextContent('P')
    expect(code.parentElement.querySelector('[title="Veio do FUP do DBCorp"]')).toHaveTextContent('F')
    expect(screen.getByLabelText('Descrição SQ da linha 1').parentElement.querySelector('[title="Veio do processo"]')).not.toBeNull()
    expect(screen.getByLabelText('Qtd (kg) da linha 1').parentElement.querySelector('[title="Veio do FUP do DBCorp"]')).not.toBeNull()
    expect(screen.getByLabelText('Legenda das marcas de origem')).toHaveTextContent('processo')
    expect(screen.getByLabelText('Legenda das marcas de origem')).toHaveTextContent('editado por você')
  })

  it('editar uma célula troca a marca por ✎ ("Editado por você") sem perder o foco', async () => {
    const { user } = await renderForm()
    const code = screen.getByLabelText('Cód. DBCorp da linha 1')
    await user.click(code)
    await user.type(code, '9')

    const same = screen.getByLabelText('Cód. DBCorp da linha 1')
    expect(same).toBe(code)
    expect(same).toHaveFocus()
    expect(same.parentElement.querySelector('[title="Editado por você"]')).toHaveTextContent('✎')
    expect(same.closest('td')).toHaveClass('is-edited')
  })

  it('campo "Fonte dos itens" e Fornecedor (somente leitura) no cabeçalho', async () => {
    await renderForm()
    const header = screen.getByRole('region', { name: 'Cabeçalho do relatório' })
    expect(within(header).getByText('Fonte dos itens')).toBeInTheDocument()
    expect(within(header).getByText(/FUP importado em 24\/11\/2026 14:02 \(2 linhas deste pedido\)/)).toBeInTheDocument()
    const supplier = within(header).getByLabelText('Fornecedor (para as embalagens)')
    expect(supplier).toHaveValue('GOOYER CHEMICALS LTD')
    expect(supplier).toBeDisabled()
  })

  it('Salvar rascunho grava as linhas com a referência e o autofill', async () => {
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const payload = mockSaveDraft.mock.calls[0][1]
    expect(payload.rows).toHaveLength(2)
    expect(payload.rows[0]).toMatchObject({ po: 'GOOYER SEA 001-26', dbcorpCode: 'BA5012', quantityKg: 40000 })
    expect(Object.keys(payload.rows[0])).toHaveLength(13)
    expect(payload.autofill.schemaVersion).toBe(1)
    expect(payload.autofill.snapshotId).toBe('snap-1')
    expect(Object.keys(payload.autofill.rows)).toEqual(payload.rows.map((item) => item.id))
    expect(payload.autofill.rows[payload.rows[0].id]).toMatchObject({ key: 'fup:1001' })
  })

  it('sem FUP para o processo: preenche só do processo e a nota diz como importar', async () => {
    mockLoadReference.mockResolvedValue(null)
    await renderForm()
    expect(screen.getByLabelText('PO / processo da linha 1')).toHaveValue('GOOYER SEA 001-26')
    expect(screen.getByLabelText('Cód. DBCorp da linha 1')).toHaveValue('')
    expect(screen.getByLabelText('Qtd (kg) da linha 1')).toHaveValue('40.000')
    expect(screen.getByText(/Sem FUP para este processo: Cód. DBCorp, Descrição Fornecedor e Qtd do FUP ficam vazios/)).toBeInTheDocument()
    expect(screen.getByText(/Importe o FUP em Processos › Importar do DBCorp/)).toBeInTheDocument()
  })

  it('falha ao ler o FUP: o relatório abre só com o processo e a nota avisa', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLoadReference.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }))
    await renderForm()
    expect(screen.getByLabelText('PO / processo da linha 1')).toHaveValue('GOOYER SEA 001-26')
    expect(screen.getByText(/Não foi possível ler o FUP; o relatório foi preenchido só com o processo/)).toBeInTheDocument()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('item do processo sem linha no FUP abre na prévia, desmarcado, e não entra sozinho', async () => {
    mockLoadReference.mockResolvedValue(reference([FUP[0]]))
    const { user } = await renderForm()

    expect(screen.queryByLabelText('PO / processo da linha 2')).not.toBeInTheDocument()
    const panel = screen.getByRole('region', { name: 'Diferenças do processo e do FUP' })
    expect(within(panel).getByText(/Itens que estão só no FUP ou só no processo \(1\)/)).toBeInTheDocument()
    const box = within(panel).getByRole('checkbox')
    expect(box).not.toBeChecked()
    expect(within(panel).getByText('só no processo')).toBeInTheDocument()

    await user.click(box)
    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getByLabelText('Descrição SQ da linha 2')).toHaveValue('CATALISADOR ZN-12')
    expect(screen.queryByRole('region', { name: 'Diferenças do processo e do FUP' })).not.toBeInTheDocument()
    expect(await screen.findByText('Alterações aplicadas')).toBeInTheDocument()
  })

  it('aviso de Qtd divergente: "Processo: 4.000 kg" sob a Qtd da linha', async () => {
    mockLoadReference.mockResolvedValue(reference([FUP[0], { ...FUP[1], quantityKg: 4500 }]))
    await renderForm()
    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveValue('4.500')
    expect(screen.getByText('Processo: 4.000 kg')).toBeInTheDocument()
    expect(screen.getAllByText(/^Processo: /)).toHaveLength(1)
  })
})

describe('Atualizar do processo e do FUP', () => {
  it('sem mudanças: "Tudo em dia" e Fechar', async () => {
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' }))

    const note = await screen.findByText(/Tudo em dia/)
    expect(note.closest('.crf-note')).toHaveTextContent('Processo e FUP não mudaram desde que você preencheu.')
    expect(mockLoadReference).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByText(/Tudo em dia/)).not.toBeInTheDocument()
  })

  it('FUP novo: mostra a prévia, "Agora não" não muda nada e "Aplicar selecionadas" só aplica o marcado', async () => {
    const { user } = await renderForm()
    await user.type(screen.getByLabelText('Descrição fornecedor da linha 1'), ' EDITADA')

    mockLoadReference.mockResolvedValue(
      reference(
        [
          fupItem({ supplierRef: 'POLYETHER POLYOL PE-3000 STEEL DRUM 200 KG' }),
          { ...FUP[1], quantityKg: 4500 },
        ],
        'snap-2'
      )
    )
    await user.click(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' }))

    const panel = await screen.findByRole('region', { name: 'Diferenças do processo e do FUP' })
    expect(within(panel).getByText(/O FUP mudou desde que você preencheu \(2 alterações\)/)).toBeInTheDocument()
    expect(within(panel).getByText(/o que você editou à mão nunca é sobrescrito sem aparecer aqui/)).toBeInTheDocument()
    const boxes = within(panel).getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    // A descrição editada à mão vem desmarcada e avisa; a quantidade vem marcada.
    expect(within(panel).getByText(/\(você editou esta célula\)/)).toBeInTheDocument()
    const [textBox, quantityBox] = boxes
    expect(textBox).not.toBeChecked()
    expect(quantityBox).toBeChecked()

    await user.click(within(panel).getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByRole('region', { name: 'Diferenças do processo e do FUP' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveValue('4.000')

    await user.click(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' }))
    const again = await screen.findByRole('region', { name: 'Diferenças do processo e do FUP' })
    await user.click(within(again).getByRole('button', { name: 'Aplicar selecionadas' }))

    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveValue('4.500')
    expect(screen.getByLabelText('Descrição fornecedor da linha 1')).toHaveValue('POLYETHER POLYOL PE-3000 DRUM 200 KG EDITADA')
    expect(await screen.findByText('Alterações aplicadas')).toBeInTheDocument()
    // A quantidade aplicada volta a ter a marca F e o aviso de divergência aparece (processo: 4.000 kg).
    expect(screen.getByLabelText('Qtd (kg) da linha 2').parentElement.querySelector('[title="Veio do FUP do DBCorp"]')).not.toBeNull()
    expect(screen.getByText('Processo: 4.000 kg')).toBeInTheDocument()
  })

  it('"Agora não" e "Aplicar selecionadas" devolvem o foco ao botão Atualizar; o botão tem a classe do alvo de 44 px', async () => {
    const { user } = await renderForm()
    const button = screen.getByRole('button', { name: 'Atualizar do processo e do FUP' })
    expect(button).toHaveClass('crf-refresh-btn')
    mockLoadReference.mockResolvedValue(reference([FUP[0], { ...FUP[1], quantityKg: 4500 }], 'snap-2'))
    await user.click(button)
    const panel = await screen.findByRole('region', { name: 'Diferenças do processo e do FUP' })
    await user.click(within(panel).getByRole('button', { name: 'Agora não' }))
    expect(button).toHaveFocus()

    await user.click(button)
    const again = await screen.findByRole('region', { name: 'Diferenças do processo e do FUP' })
    await user.click(within(again).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(button).toHaveFocus()
  })

  it('reaberto com FUP stale: "Atualizar" não propõe "só no processo" (aplicar duplicaria as linhas)', async () => {
    mockLoadReference.mockResolvedValueOnce(reference())
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const saved = mockSaveDraft.mock.calls[0][1]

    mockGetCargoReport.mockResolvedValue({ current: { ...currentDoc(), ...saved, updatedAt: new Date() }, conference: null })
    mockLoadReference.mockResolvedValue({ snapshot: { snapshotId: 'snap-2', updatedAtMs: 1 }, hint: null, stale: true })
    const second = await renderForm()
    await second.user.click(screen.getAllByRole('button', { name: 'Atualizar do processo e do FUP' }).at(-1))
    expect(await screen.findByText(/Tudo em dia/)).toBeInTheDocument()
    expect(screen.queryByText('só no processo')).not.toBeInTheDocument()
  })

  it('falha ao reler o FUP: avisa e não abre a prévia', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { user } = await renderForm()
    mockLoadReference.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }))
    await user.click(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler o FUP agora')
    expect(screen.queryByRole('region', { name: 'Diferenças do processo e do FUP' })).not.toBeInTheDocument()
    warn.mockRestore()
  })
})

describe('relatório já salvo', () => {
  it('não é refeito ao abrir: sem nota de relatório novo, sem prévia, linhas do doc intactas', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: null })
    await renderForm()

    expect(screen.queryByText('Relatório novo.')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Diferenças do processo e do FUP' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/^PO \/ processo da linha/)).toHaveLength(1)
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('L1')
    // Sem autofill gravado: nenhuma marca de origem e nenhuma legenda.
    expect(screen.queryByLabelText('Legenda das marcas de origem')).not.toBeInTheDocument()
    expect(screen.getByLabelText('PO / processo da linha 1').parentElement.querySelector('[title]')).toBeNull()
  })

  it('relatório antigo (PO = número do pedido): "Atualizar" propõe trocar o PO, desmarcado, "origem não registrada"', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: [savedRow('s-1', { po: '4500871' })] }),
      conference: null,
    })
    const { user } = await renderForm()
    await user.click(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' }))

    const panel = await screen.findByRole('region', { name: 'Diferenças do processo e do FUP' })
    expect(within(panel).getByText(/Linha 1: “4500871” → “GOOYER SEA 001-26” \(origem não registrada\)/)).toBeInTheDocument()
    const poBox = within(panel).getAllByRole('checkbox')[0]
    expect(poBox).not.toBeChecked()
    await user.click(poBox)
    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getByLabelText('PO / processo da linha 1')).toHaveValue('GOOYER SEA 001-26')
    expect(screen.getByLabelText('PO / processo da linha 1').parentElement.querySelector('[title="Veio do processo"]')).not.toBeNull()
  })

  it('relatório salvo com autofill mostra as marcas e ✎ na célula que o usuário editou', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({
        rows: [savedRow('s-1', { dbcorpCode: 'BA9999' })],
        autofill: {
          schemaVersion: 1,
          snapshotId: 'snap-1',
          rows: {
            's-1': {
              key: 'fup:1001',
              base: { po: 'GOOYER SEA 001-26', dbcorpCode: 'BA5012', sqDescription: 'POLIOL PE-3000', quantityKg: 40000 },
            },
          },
        },
      }),
      conference: null,
    })
    await renderForm()
    expect(screen.getByLabelText('PO / processo da linha 1').parentElement.querySelector('[title="Veio do processo"]')).not.toBeNull()
    expect(screen.getByLabelText('Cód. DBCorp da linha 1').parentElement.querySelector('[title="Editado por você"]')).not.toBeNull()
  })
})

describe('quem não preenche não lê o FUP', () => {
  it('logística: sem botão, sem marcas, sem legenda e sem ler o FUP', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({
        autofill: { schemaVersion: 1, snapshotId: 'snap-1', rows: { 's-1': { key: 'fup:1001', base: { po: 'GOOYER SEA 001-26' } } } },
      }),
      conference: null,
    })
    await renderForm({ profile: LOGISTICA })

    expect(mockLoadReference).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Atualizar do processo e do FUP' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Veio do processo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Legenda das marcas de origem')).not.toBeInTheDocument()
    expect(screen.queryByText('Fonte dos itens')).not.toBeInTheDocument()
  })

  it('admin com o COMEX fechado (estágio 2): não lê o FUP nem mostra o botão', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ status: 'concluido' }), conference: null })
    await renderForm()
    expect(mockLoadReference).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Atualizar do processo e do FUP' })).not.toBeInTheDocument()
  })
})

describe('celular', () => {
  it('relatório novo: marcas ao lado dos rótulos, botão Atualizar e aviso de Qtd', async () => {
    mockLoadReference.mockResolvedValue(reference([FUP[0], { ...FUP[1], quantityKg: 4500 }]))
    await renderForm({ variant: 'mobile' })

    expect(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' })).toBeInTheDocument()
    const card = screen.getByLabelText('Qtd (kg) da linha 2').closest('.crf-rc')
    expect(card.querySelectorAll('[title="Veio do FUP do DBCorp"]').length).toBeGreaterThan(0)
    expect(within(card).getByText('Processo: 4.000 kg')).toBeInTheDocument()
    expect(screen.getByLabelText('PO / processo da linha 1')).toHaveValue('GOOYER SEA 001-26')
  })
})

describe('menu ⋯ leva a origem das células (autofill)', () => {
  const openRowMenu = async (user, number) => {
    await user.click(screen.getByRole('button', { name: `Ações da linha ${number}` }))
    return screen.getByRole('menu', { name: `Ações da linha ${number}` })
  }
  const pick = async (user, name) => user.click(screen.getByRole('menuitem', { name }))
  const markOf = (label, title) => screen.getByLabelText(label).parentElement.querySelector(`[title="${title}"]`)

  it('duplicar copia as marcas (P e F) para a linha nova e o rascunho grava a entrada dela', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, 'Duplicar (outro lote)')

    expect(markOf('Cód. DBCorp da linha 2', 'Veio do FUP do DBCorp')).not.toBeNull()
    expect(markOf('PO / processo da linha 2', 'Veio do processo')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const { rows, autofill } = mockSaveDraft.mock.calls[0][1]
    expect(rows).toHaveLength(3)
    expect(Object.keys(autofill.rows).sort()).toEqual(rows.map((item) => item.id).sort())
    expect(autofill.rows[rows[1].id]).toEqual(autofill.rows[rows[0].id])
  })

  it('inserir linha vazia herda só a marca do PO', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, 'Linha abaixo')

    expect(screen.getByLabelText('PO / processo da linha 2')).toHaveValue('GOOYER SEA 001-26')
    expect(markOf('PO / processo da linha 2', 'Veio do processo')).not.toBeNull()
    expect(screen.getByLabelText('Cód. DBCorp da linha 2').parentElement.querySelector('[title]')).toBeNull()
  })

  it('remover leva a marca junto e Desfazer devolve a linha com as marcas', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, 'Remover linha')
    expect(screen.getByText('Linha 1 removida')).toBeInTheDocument()
    expect(markOf('Cód. DBCorp da linha 1', 'Veio do FUP do DBCorp')).not.toBeNull() // a antiga linha 2 subiu

    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('POLIOL PE-3000')
    expect(markOf('Cód. DBCorp da linha 1', 'Veio do FUP do DBCorp')).not.toBeNull()
    expect(markOf('Qtd (kg) da linha 1', 'Veio do FUP do DBCorp')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const { rows, autofill } = mockSaveDraft.mock.calls[0][1]
    expect(Object.keys(autofill.rows).sort()).toEqual(rows.map((item) => item.id).sort())
    expect(autofill.rows[rows[0].id].key).toBe('fup:1001')
  })

  it('dividir em lotes: as linhas novas herdam as marcas; a Qtd, já diferente da base, vira ✎', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, /Dividir em lotes/)
    const dialog = screen.getByRole('dialog', { name: 'Dividir em lotes' })
    await waitFor(() => expect(within(dialog).getByLabelText('Lote 1')).toHaveFocus())
    await user.click(within(dialog).getByRole('button', { name: 'Dividir' }))

    expect(markOf('Cód. DBCorp da linha 1', 'Veio do FUP do DBCorp')).not.toBeNull()
    expect(markOf('Cód. DBCorp da linha 3', 'Veio do FUP do DBCorp')).not.toBeNull()
    expect(markOf('Qtd (kg) da linha 1', 'Editado por você')).not.toBeNull()
  })
})

describe('menu ⋯ no consolidado (autofill)', () => {
  const PURCHASE_ORDERS = [
    { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
    { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
  ]
  const CONSOLIDATED = {
    id: 'p2',
    name: 'CON DG 009-26',
    processNumber: '9009',
    category: 'CONSOLIDADO',
    purchaseOrders: PURCHASE_ORDERS,
    items: [
      { id: 'c1', commercialName: 'RESINA EPOXI ER-100', quantity: 18000, poNumber: '4500901' },
      { id: 'c2', commercialName: 'PLASTIFICANTE DOP', quantity: 22000, poNumber: '4500902' },
    ],
  }
  const consFup = [
    fupItem({ commercialName: 'RESINA EPOXI ER-100', pedido: '4500901', quantityKg: 18000, sqCode: 'BA5101', supplierRef: 'EPOXY', itemId: '2001' }),
    fupItem({ commercialName: 'PLASTIFICANTE DOP', pedido: '4500902', quantityKg: 22000, sqCode: 'BA5201', supplierRef: 'DOP', itemId: '2002' }),
  ]

  it('abre agrupado por PO, com a referência de cada PO e as marcas; mover de PO regrava a marca P', async () => {
    mockLoadReference.mockResolvedValue(reference(consFup))
    const { user } = await renderForm({ process: CONSOLIDATED })

    expect(screen.getByLabelText('PO / processo da linha 1')).toHaveValue('ACME SEA 011-26')
    expect(screen.getByLabelText('PO / processo da linha 2')).toHaveValue('NOVA SEA 034-26')
    expect(document.querySelectorAll('tr.crf-group')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Ações da linha 1' }))
    await user.click(screen.getByRole('menuitem', { name: /Mover para outra PO/ }))
    const sub = screen.getByRole('menu', { name: 'POs desta consolidada' })
    await user.click(within(sub).getByRole('menuitem', { name: /NOVA SEA 034-26/ }))

    expect(screen.getByLabelText('PO / processo da linha 2')).toHaveValue('NOVA SEA 034-26')
    expect(markOf('PO / processo da linha 2', 'Veio do processo')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const { rows, autofill } = mockSaveDraft.mock.calls[0][1]
    const moved = rows.find((item) => item.dbcorpCode === 'BA5101')
    expect(moved.po).toBe('NOVA SEA 034-26')
    expect(autofill.rows[moved.id].base.po).toBe('NOVA SEA 034-26')
  })

  function markOf(label, title) {
    return screen.getByLabelText(label).parentElement.querySelector(`[title="${title}"]`)
  }
})
