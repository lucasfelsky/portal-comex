// S3 do Relatorio de Carga: formulario FR.CMX.001 (CargoReportForm + CargoReportItems).
// Repositorios mockados; catalogo SINTETICO. O catalogo e' cacheado por 5 min no modulo do
// formulario: cada teste avanca o relogio (so' `Date`) para nao herdar o cache do anterior.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockGetCargoReport = vi.fn()
const mockSaveDraft = vi.fn()
const mockSaveConference = vi.fn()
const mockGetCatalog = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportDraft: (...args) => mockSaveDraft(...args),
  saveCargoReportConference: (...args) => mockSaveConference(...args),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: (...args) => mockGetCatalog(...args),
}))
vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

import CargoReportForm from '../../src/features/processes/CargoReportForm'

const ADMIN = { uid: 'admin-1', name: 'Lucas Admin', email: 'lucas@sqquimica.com', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }

const PROCESS = {
  id: 'p1',
  name: 'ACME SEA 021-26',
  processNumber: '4500123',
  category: 'FCL',
  duimpNumber: '25BR00001234567',
  items: [{ id: 'i1', commercialName: 'DEA FOAM14339 - BB 25KG', quantity: 12500 }],
}

const CATALOG = {
  exists: true,
  version: 3,
  itemCount: 4,
  items: [
    { code: 'AD5240', description: 'DEA FOAM', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'RE5116', description: 'DEGALAN', packagingType: 'CAIXA', netWeightKg: 25 },
    { code: 'MO5190', description: 'MONOMERO', packagingType: 'BALDE', netWeightKg: 5 },
    { code: 'AD5241', description: 'DEA FOAM 2', packagingType: 'BOMBONA', netWeightKg: 25 },
  ],
}

const row = (overrides = {}) => ({
  id: 'r-1',
  po: '4500123',
  dbcorpCode: 'AD5240',
  supplierDescription: 'DEA FOAM14339 - BOMBONA 25KG',
  sqDescription: 'DEA FOAM14339 - BB 25KG',
  supplierLot: 'DF2406A',
  wmsLabel: 'WMS-77120',
  sqLabel: 'SQ-001245',
  quantityKg: 12500,
  count: 500,
  packageWeightKg: 1.2,
  frozenNetWeightKg: null,
  frozenPackages: null,
  ...overrides,
})

// Cenario do mock: RE5116 sem lote e sem peso da embalagem + ZZ9999 fora da tabela = 3 alertas.
const MOCK_ROWS = [
  row({ id: 'r-1' }),
  row({ id: 'r-2', dbcorpCode: 'RE5116', sqDescription: 'DEGALAN 64/12 N - CX 25KG', supplierLot: '', packageWeightKg: null, quantityKg: 5000, count: 200 }),
  row({ id: 'r-3', dbcorpCode: 'ZZ9999', sqDescription: 'ADITIVO NOVO XR', supplierLot: 'XR0911', quantityKg: 800, count: 40, packageWeightKg: 0.9 }),
  row({ id: 'r-4', dbcorpCode: 'MO5190', sqDescription: 'MONOMERO EXEMPLO - BLD 5KG', supplierLot: 'ME2407', quantityKg: 1000, count: 200, packageWeightKg: 0.4 }),
  row({ id: 'r-5', dbcorpCode: 'AD5241', sqDescription: 'DEA FOAM14340 - BB 25KG', supplierLot: 'DF2406B', quantityKg: 2500, count: null }),
]

const currentDoc = (overrides = {}) => ({
  schemaVersion: 1,
  formCode: 'FR.CMX.001',
  formRevision: '005',
  revision: 4,
  status: 'rascunho',
  cargoType: 'FCL',
  titleSuffix: 'ACME SEA 021-26',
  rows: MOCK_ROWS,
  notes: '',
  labeledBy: '',
  labelMadeBy: '',
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

const conferenceDoc = (overrides = {}) => ({
  schemaVersion: 1,
  revision: 2,
  okByRowId: { 'r-1': true, 'r-2': true, 'r-4': true, orfa: true },
  checkedByName: '',
  updatedAt: new Date(2026, 10, 23, 20, 0),
  updatedByName: 'Operador Logística',
  ...overrides,
})

let clock = 0

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  clock += 10 * 60 * 1000
  vi.setSystemTime(new Date(2026, 10, 24, 14, 5).getTime() + clock)
  mockGetCatalog.mockResolvedValue(CATALOG)
  mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc() })
  mockSaveDraft.mockResolvedValue({ revision: 5 })
  mockSaveConference.mockResolvedValue({ revision: 3 })
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderForm({ profile = ADMIN, variant = 'desktop', process = PROCESS, onClose = vi.fn() } = {}) {
  const user = userEvent.setup()
  const view = render(<CargoReportForm process={process} profile={profile} variant={variant} onClose={onClose} />)
  await screen.findByRole('heading', { name: /RELATÓRIO DE CARGA - / })
  return { user, onClose, ...view }
}

describe('estados de carga', () => {
  it('mostra o esqueleto enquanto carrega', () => {
    mockGetCargoReport.mockReturnValue(new Promise(() => {}))
    render(<CargoReportForm process={PROCESS} profile={ADMIN} variant="desktop" onClose={vi.fn()} />)
    expect(screen.getByRole('status', { name: 'Carregando relatório de carga' })).toBeInTheDocument()
  })

  it('erro de carga mostra alerta e "Tentar novamente" recarrega', async () => {
    mockGetCargoReport.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'unavailable' }))
    const user = userEvent.setup()
    render(<CargoReportForm process={PROCESS} profile={ADMIN} variant="desktop" onClose={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o relatório de carga.')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: /RELATÓRIO DE CARGA - ACME SEA 021-26/ })).toBeInTheDocument()
    expect(mockGetCargoReport).toHaveBeenCalledTimes(2)
  })

  it('perfil sem acesso (tecnico) nao renderiza nada e nao le o doc', () => {
    const { container } = render(
      <CargoReportForm process={PROCESS} profile={{ role: 'tecnico' }} variant="desktop" onClose={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
    expect(mockGetCargoReport).not.toHaveBeenCalled()
  })
})

describe('admin: formulario novo (sem doc salvo)', () => {
  beforeEach(() => {
    mockGetCargoReport.mockResolvedValue({ current: null, conference: null })
  })

  it('mostra titulo, DUIMP fixa e somente leitura, 4 tipos e o tipo da categoria', async () => {
    await renderForm()

    expect(screen.getByRole('heading', { name: 'RELATÓRIO DE CARGA - ACME SEA 021-26' })).toBeInTheDocument()
    expect(screen.getByText(/Ainda não salvo/)).toBeInTheDocument()

    const duimp = screen.getByLabelText('Nº da DUIMP')
    expect(duimp).toBeDisabled()
    expect(duimp).toHaveValue('25BR00001234567')
    expect(screen.getByText(/Fixo: vem do processo/)).toBeInTheDocument()
    expect(screen.queryByText('Nº da DI')).not.toBeInTheDocument()

    const group = screen.getByRole('radiogroup', { name: 'Tipo de carga' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['FCL', 'LCL', 'CONSOLIDADO', 'AÉREO'])
    expect(screen.getByRole('radio', { name: 'FCL' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'AÉREO' })).not.toBeChecked()
  })

  it('DUIMP vazia mostra o placeholder', async () => {
    await renderForm({ process: { ...PROCESS, duimpNumber: '' } })
    expect(screen.getByLabelText('Nº da DUIMP')).toHaveAttribute('placeholder', 'Sem DUIMP no processo')
  })

  it('pre-preenche a linha com os itens do processo e permite salvar sem editar (revisao 1)', async () => {
    const { user } = await renderForm()

    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('DEA FOAM14339 - BB 25KG')
    expect(screen.getByLabelText('Qtd (kg) da linha 1')).toHaveValue('12.500')

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const [processId, payload] = mockSaveDraft.mock.calls[0]
    expect(processId).toBe('p1')
    expect(payload.revision).toBe(1)
    expect(payload.rows).toHaveLength(1)
  })

  it('tipo vazio mostra a dica "Escolha um tipo"', async () => {
    await renderForm({ process: { ...PROCESS, category: 'OUTRA' } })
    expect(screen.getByText('Escolha um tipo')).toBeInTheDocument()
  })
})

describe('colunas calculadas e alertas', () => {
  it('digitar um codigo do catalogo mostra peso liquido e no de embalagens', async () => {
    mockGetCargoReport.mockResolvedValue({ current: null, conference: null })
    const { user } = await renderForm()

    const table = screen.getByRole('table')
    expect(within(table).queryByText('25,0')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Cód. DBCorp da linha 1'), 'ad5240')
    expect(within(table).getByText('25,0')).toBeInTheDocument()
    expect(within(table).getByText('500')).toBeInTheDocument()
  })

  it('lote SQ concatena o lote com as 3 primeiras letras do PO', async () => {
    await renderForm()
    expect(screen.getByText('DF2406A450')).toBeInTheDocument()
    expect(screen.getByText('ME2407450')).toBeInTheDocument()
  })

  it('mostra os alertas do cenario do mock e o selo "3 alertas"', async () => {
    await renderForm()

    expect(screen.getByText('Falta o lote')).toBeInTheDocument()
    expect(screen.getByText('Falta o peso da emb.')).toBeInTheDocument()
    expect(screen.getByText('Sem embalagem cadastrada')).toBeInTheDocument()
    expect(screen.getByText('3 alertas')).toBeInTheDocument()
    expect(screen.getByText('Tabela Item x Emb. v3')).toBeInTheDocument()
    expect(screen.getByText(/Itens sem tipo e peso na tabela aparecem como/)).toBeInTheDocument()
  })

  it('catalogo inexistente mostra o aviso de tabela nao importada', async () => {
    mockGetCatalog.mockResolvedValue({ exists: false, version: 0, items: [], itemCount: 0 })
    await renderForm()

    expect(screen.getByText(/A tabela Item x Emb\. ainda não foi importada/)).toBeInTheDocument()
    expect(screen.getByText('Tabela Item x Emb. não importada')).toBeInTheDocument()
  })

  it('versao da tabela diferente da gravada mostra o aviso de recalculo', async () => {
    mockGetCatalog.mockResolvedValue({ ...CATALOG, version: 4 })
    await renderForm()

    expect(
      screen.getByText(
        'Tabela Item x Emb. versão 4 em uso. Este relatório foi calculado com a versão 3; salvar recalcula o peso líquido e o nº de embalagens.'
      )
    ).toBeInTheDocument()
  })

  it('erro ao ler o catalogo mostra alerta e o formulario segue utilizavel', async () => {
    mockGetCatalog.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    await renderForm()

    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((alert) => alert.textContent.startsWith('Não foi possível carregar a tabela Item x Emb.'))).toBe(true)
    expect(screen.getByLabelText('PO / processo da linha 1')).toBeEnabled()
  })
})

describe('admin: salvar rascunho', () => {
  it('chama saveCargoReportDraft com a revisao seguinte, sem colunas calculadas, e confirma', async () => {
    const { user } = await renderForm()
    const save = screen.getByRole('button', { name: 'Salvar rascunho' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Etiquetado por'), 'Operador do armazém')
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const [processId, payload, actor] = mockSaveDraft.mock.calls[0]
    expect(processId).toBe('p1')
    expect(actor).toBe(ADMIN)
    expect(payload.revision).toBe(5)
    expect(payload.catalogVersion).toBe(3)
    expect(payload.labeledBy).toBe('Operador do armazém')
    expect(JSON.stringify(payload)).not.toMatch(/lotSq|netWeightKg|"packages"/)
    expect(mockSaveConference).not.toHaveBeenCalled()

    expect(await screen.findByText(/Rascunho salvo às \d{2}:\d{2}\. Nada foi enviado por e-mail\./)).toBeInTheDocument()
  })

  it('alterar "Conferido por" grava tambem a conferencia e a falha nao desfaz o rascunho', async () => {
    mockSaveConference.mockRejectedValue(new Error('negado'))
    const { user } = await renderForm()

    await user.type(screen.getByLabelText('Conferido por'), 'Giulia')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
    const [, conferencePayload] = mockSaveConference.mock.calls[0]
    expect(conferencePayload.checkedByName).toBe('Giulia')
    expect(conferencePayload.okByRowId).toEqual({ 'r-1': true, 'r-2': true, 'r-4': true })
    expect(await screen.findByText('Rascunho salvo, mas não foi possível salvar o "Conferido por".')).toBeInTheDocument()
  })

  it('conflito de revisao mostra o texto do mock e "Recarregar"', async () => {
    mockSaveDraft.mockRejectedValue(Object.assign(new Error('revision-conflict'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderForm()

    await user.type(screen.getByLabelText('Etiquetado por'), 'X')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(
      await screen.findByText(
        'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.'
      )
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recarregar' }))
    await waitFor(() => expect(mockGetCargoReport).toHaveBeenCalledTimes(2))
  })

  it('permission-denied (nao conflito) mostra o texto de sem permissao', async () => {
    mockSaveDraft.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    const { user } = await renderForm()

    await user.type(screen.getByLabelText('Etiquetado por'), 'X')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(
      await screen.findByText(
        'Sem permissão para editar. O COMEX preenche o relatório e a logística só marca o OK? e o "Conferido por".'
      )
    ).toBeInTheDocument()
  })

  it('numero invalido marca a celula e nao grava', async () => {
    const { user } = await renderForm()

    const quantity = screen.getByLabelText('Qtd (kg) da linha 2')
    await user.clear(quantity)
    await user.type(quantity, 'abc')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(screen.getByText('Corrija os números destacados antes de salvar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('limite de 28 linhas e linhas livres', () => {
  const manyRows = (count) => Array.from({ length: count }, (_, index) => row({ id: `r-${index + 1}`, dbcorpCode: '' }))

  it('com 5 linhas mostra 3 linhas livres e clicar adiciona e foca a nova linha', async () => {
    const { user } = await renderForm()

    expect(screen.getByText('Linha 6 livre · clique para preencher')).toBeInTheDocument()
    expect(screen.getByText('Linha 8 livre · clique para preencher')).toBeInTheDocument()
    expect(screen.getByText('Limite do modelo: 28 linhas (5 usadas)')).toBeInTheDocument()

    await user.click(screen.getByText('Linha 6 livre · clique para preencher'))
    const first = await screen.findByLabelText('PO / processo da linha 6')
    expect(first).toHaveFocus()
    expect(screen.getByText('Limite do modelo: 28 linhas (6 usadas)')).toBeInTheDocument()
  })

  it('com 28 linhas mostra o aviso e some com as linhas livres e o "Adicionar item"', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ rows: manyRows(28) }), conference: null })
    await renderForm()

    expect(
      screen.getByText(
        'O relatório já tem 28 linhas, o limite do modelo FR.CMX.001. Para mais itens, gere um segundo relatório.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/livre · clique para preencher/)).not.toBeInTheDocument()
  })

  it('mobile com 28 linhas nao oferece "Adicionar item"', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ rows: manyRows(28) }), conference: null })
    await renderForm({ variant: 'mobile' })
    expect(screen.queryByRole('button', { name: 'Adicionar item' })).not.toBeInTheDocument()
    expect(screen.getByText('Itens (28 de 28)')).toBeInTheDocument()
  })
})

describe('mobile', () => {
  it('renderiza cartoes por linha, sem tabela, com CONS. abreviado e "Adicionar item"', async () => {
    const { user } = await renderForm({ variant: 'mobile' })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Itens (5 de 28)')).toBeInTheDocument()
    expect(screen.getByText('CONS.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'CONSOLIDADO' })).toBeInTheDocument()
    expect(screen.getAllByText('Identificação do item')).toHaveLength(5)
    expect(screen.getByText('PO 4500123 · AD5240', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Falta lote e peso da embalagem')).toBeInTheDocument()
    expect(screen.getAllByText('Sem embalagem cadastrada').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    expect(screen.getByText('Itens (6 de 28)')).toBeInTheDocument()
    expect(await screen.findByLabelText('PO / processo da linha 6')).toHaveFocus()
  })
})

describe('logistica: conferencia', () => {
  it('nao edita o preenchimento do COMEX (sem textbox de PO) e ve o banner de conferencia', async () => {
    await renderForm({ profile: LOGISTICA })

    expect(screen.queryByRole('textbox', { name: /PO \/ processo/ })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Marque o OK? de cada linha conferida e informe quem conferiu. A conferência é salva separada do preenchimento do COMEX, então não conflita com quem está editando.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Conferência da logística')).toBeInTheDocument()
    expect(screen.getByLabelText('Título no relatório')).toBeDisabled()
    expect(screen.getByLabelText('Etiquetado por')).toBeDisabled()
    expect(screen.getByLabelText('Nº da DUIMP')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'FCL' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
  })

  it('pre-preenche "Conferido por" com o nome so na tela e permite salvar a conferencia', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })

    expect(screen.getByLabelText('Conferido por')).toHaveValue('Operador Logística')
    expect(mockSaveConference).not.toHaveBeenCalled()

    const okRow3 = screen.getByRole('checkbox', { name: 'OK? da linha 3' })
    expect(okRow3).toHaveAttribute('aria-checked', 'false')
    await user.click(okRow3)
    expect(okRow3).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('checkbox', { name: 'OK? da linha 1' }))

    await user.click(screen.getByRole('button', { name: 'Salvar conferência' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const [processId, payload, actor] = mockSaveConference.mock.calls[0]
    expect(processId).toBe('p1')
    expect(actor).toBe(LOGISTICA)
    expect(payload.revision).toBe(3)
    expect(payload.checkedByName).toBe('Operador Logística')
    expect(payload.okByRowId).toEqual({ 'r-1': false, 'r-2': true, 'r-3': true, 'r-4': true })
    expect(payload.okByRowId).not.toHaveProperty('orfa')
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(await screen.findByText(/Conferência salva às \d{2}:\d{2}\./)).toBeInTheDocument()
  })

  it('depois de "Salvar conferência" com sucesso, os OK? marcados continuam marcados na tela', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    const checked = (row) => screen.getByRole('checkbox', { name: `OK? da linha ${row}` }).getAttribute('aria-checked')

    await user.click(screen.getByRole('checkbox', { name: 'OK? da linha 3' }))
    expect([1, 2, 3, 4, 5].map(checked)).toEqual(['true', 'true', 'true', 'true', 'false'])

    await user.click(screen.getByRole('button', { name: 'Salvar conferência' }))
    expect(await screen.findByText(/Conferência salva às \d{2}:\d{2}\./)).toBeInTheDocument()

    expect([1, 2, 3, 4, 5].map(checked)).toEqual(['true', 'true', 'true', 'true', 'false'])
    // O estado salvo passa a ser a base: nada a salvar e "Descartar" não desmarca.
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'OK? da linha 5' }))
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect([1, 2, 3, 4, 5].map(checked)).toEqual(['true', 'true', 'true', 'true', 'false'])
  })

  it('"Descartar" volta ao ultimo salvo', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })

    const okRow3 = screen.getByRole('checkbox', { name: 'OK? da linha 3' })
    await user.click(okRow3)
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.getByRole('checkbox', { name: 'OK? da linha 3' })).toHaveAttribute('aria-checked', 'false')
  })

  it('conflito na conferencia mostra o texto proprio', async () => {
    mockSaveConference.mockRejectedValue(Object.assign(new Error('x'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderForm({ profile: LOGISTICA })

    await user.click(screen.getByRole('button', { name: 'Salvar conferência' }))
    expect(
      await screen.findByText(
        'Outra pessoa salvou a conferência. Recarregue para ver a versão atual antes de salvar de novo.'
      )
    ).toBeInTheDocument()
  })

  it('sem o doc do COMEX mostra o estado vazio e nenhum botao de salvar', async () => {
    mockGetCargoReport.mockResolvedValue({ current: null, conference: null })
    render(<CargoReportForm process={PROCESS} profile={LOGISTICA} variant="desktop" onClose={vi.fn()} />)

    expect(await screen.findByText('O COMEX ainda não preencheu este relatório no Portal.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar/ })).not.toBeInTheDocument()
  })

  it('no mobile o selo OK/Sem OK alterna a conferencia', async () => {
    const { user } = await renderForm({ profile: LOGISTICA, variant: 'mobile' })

    const toggle = screen.getByRole('checkbox', { name: 'OK? da linha 3' })
    expect(toggle).toHaveTextContent('Sem OK')
    await user.click(toggle)
    expect(screen.getByRole('checkbox', { name: 'OK? da linha 3' })).toHaveTextContent('OK')
  })
})

describe('sair do formulario', () => {
  it('sem alteracoes fecha direto', async () => {
    const { user, onClose } = await renderForm()
    await user.click(screen.getByRole('button', { name: '‹ Documentos' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('com alteracoes pede confirmacao e so fecha ao descartar', async () => {
    const { user, onClose } = await renderForm()

    await user.type(screen.getByLabelText('Etiquetado por'), 'X')
    await user.click(screen.getByRole('button', { name: '‹ Documentos' }))

    expect(await screen.findByText('Descartar alterações?')).toBeInTheDocument()
    expect(screen.getByText('As alterações deste relatório ainda não foram salvas.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '‹ Documentos' }))
    await user.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('escopo da S3', () => {
  it('admin em modo edição NÃO alterna o OK? (só a logística marca) e clicar não grava nada', async () => {
    const { user } = await renderForm()
    const checkbox = (row) => screen.getByRole('checkbox', { name: `OK? da linha ${row}` })

    expect(checkbox(1)).toHaveAttribute('aria-checked', 'true')
    expect(checkbox(3)).toHaveAttribute('aria-checked', 'false')
    expect(checkbox(1)).toHaveAttribute('aria-disabled', 'true')

    await user.click(checkbox(1))
    await user.click(checkbox(3))
    await user.type(checkbox(3), '{Enter}{ }')

    expect(checkbox(1)).toHaveAttribute('aria-checked', 'true')
    expect(checkbox(3)).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('nao renderiza botoes da S4/S5', async () => {
    await renderForm()

    for (const label of [
      'Concluir e anexar',
      'Exportar Excel',
      'Importar de planilha',
      'Imprimir / Salvar PDF',
      'Reabrir para corrigir',
      'Mais ações',
    ]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('cabecalho em 3 colunas: DUIMP, tipo de carga e titulo', async () => {
    const { container } = await renderForm()
    const top = container.querySelector('.crf-grid.top')
    expect(top).not.toBeNull()
    expect(top.children).toHaveLength(3)
    expect(screen.getByText('Salvar rascunho')).toBeInTheDocument()
    expect(screen.getByText(/FR\.CMX\.001 · revisão 005 · salvo em .* por Lucas Admin · revisão 4/)).toBeInTheDocument()
  })
})
