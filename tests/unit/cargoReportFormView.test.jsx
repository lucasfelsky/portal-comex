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
const mockReadImport = vi.fn()
const mockConclude = vi.fn()
const mockRetry = vi.fn()
const mockReopen = vi.fn()
const mockGenerate = vi.fn()
const mockSaveBlob = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportDraft: (...args) => mockSaveDraft(...args),
  saveCargoReportConference: (...args) => mockSaveConference(...args),
  concludeCargoReport: (...args) => mockConclude(...args),
  retryConcludeWrite: (...args) => mockRetry(...args),
  reopenCargoReport: (...args) => mockReopen(...args),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({
  generateCargoReportFile: (...args) => mockGenerate(...args),
}))
vi.mock('../../src/services/processDocumentsRepository', () => ({
  saveBlobAsFile: (...args) => mockSaveBlob(...args),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: (...args) => mockGetCatalog(...args),
}))
vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: vi.fn().mockResolvedValue(undefined),
}))
// S5: só a leitura do .xlsx é mockada (o parser tem testes próprios); o resto do módulo é real.
vi.mock('../../src/features/processes/cargoReportImport', async (importOriginal) => ({
  ...(await importOriginal()),
  readCargoReportWorkbook: (...args) => mockReadImport(...args),
}))

import CargoReportForm from '../../src/features/processes/CargoReportForm'
import { buildCargoReportFileName } from '../../src/features/processes/cargoReportSheet'

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
  mockGenerate.mockImplementation(async (sheet) => new File(['xlsx'], buildCargoReportFileName(sheet.titleSuffix)))
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

describe('limite de 200 linhas e linhas livres', () => {
  const manyRows = (count) => Array.from({ length: count }, (_, index) => row({ id: `r-${index + 1}`, dbcorpCode: '' }))

  it('com 5 linhas mostra 3 linhas livres e clicar adiciona e foca a nova linha', async () => {
    const { user } = await renderForm()

    expect(screen.getByText('Linha 6 livre · clique para preencher')).toBeInTheDocument()
    expect(screen.getByText('Linha 8 livre · clique para preencher')).toBeInTheDocument()
    expect(screen.getByText('Limite do Portal: 200 linhas (5 usadas)')).toBeInTheDocument()

    await user.click(screen.getByText('Linha 6 livre · clique para preencher'))
    const first = await screen.findByLabelText('PO / processo da linha 6')
    expect(first).toHaveFocus()
    expect(screen.getByText('Limite do Portal: 200 linhas (6 usadas)')).toBeInTheDocument()
  })

  it('com 200 linhas mostra o aviso e some com as linhas livres e o "Adicionar item"', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ rows: manyRows(200) }), conference: null })
    await renderForm()

    expect(
      screen.getByText(
        'O relatório já tem 200 linhas, o limite do Portal. Para mais itens, gere um segundo relatório.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/livre · clique para preencher/)).not.toBeInTheDocument()
  })

  it('mobile com 200 linhas nao oferece "Adicionar item"', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ rows: manyRows(200) }), conference: null })
    await renderForm({ variant: 'mobile' })
    expect(screen.queryByRole('button', { name: 'Adicionar item' })).not.toBeInTheDocument()
    expect(screen.getByText('Itens (200 de 200)')).toBeInTheDocument()
  })
})

describe('mobile', () => {
  it('renderiza cartoes por linha, sem tabela, com CONS. abreviado e "Adicionar item"', async () => {
    const { user } = await renderForm({ variant: 'mobile' })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Itens (5 de 200)')).toBeInTheDocument()
    expect(screen.getByText('CONS.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'CONSOLIDADO' })).toBeInTheDocument()
    expect(screen.getAllByText('Identificação do item')).toHaveLength(5)
    expect(screen.getByText('PO 4500123 · AD5240', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Falta lote e peso da embalagem')).toBeInTheDocument()
    expect(screen.getAllByText('Sem embalagem cadastrada').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    expect(screen.getByText('Itens (6 de 200)')).toBeInTheDocument()
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

  it('cabecalho em 3 colunas: DUIMP, tipo de carga e titulo', async () => {
    const { container } = await renderForm()
    const top = container.querySelector('.crf-grid.top')
    expect(top).not.toBeNull()
    expect(top.children).toHaveLength(3)
    expect(screen.getByText('Salvar rascunho')).toBeInTheDocument()
    expect(screen.getByText(/FR\.CMX\.001 · revisão 005 · salvo em .* por Lucas Admin · revisão 4/)).toBeInTheDocument()
  })
})

describe('importar de planilha (S5)', () => {
  const IMPORTED_ROWS = [
    {
      id: 'imp-a',
      po: '4500777',
      dbcorpCode: 'AD5240',
      supplierDescription: '',
      sqDescription: 'PRODUTO IMPORTADO A',
      supplierLot: 'LT-A',
      wmsLabel: '',
      sqLabel: '',
      quantityKg: 250,
      count: null,
      packageWeightKg: 1,
      frozenNetWeightKg: null,
      frozenPackages: null,
    },
    {
      id: 'imp-b',
      po: '4500777',
      dbcorpCode: 'MO5190',
      supplierDescription: '',
      sqDescription: 'PRODUTO IMPORTADO B',
      supplierLot: 'LT-B',
      wmsLabel: '',
      sqLabel: '',
      quantityKg: 50,
      count: null,
      packageWeightKg: 0.4,
      frozenNetWeightKg: null,
      frozenPackages: null,
    },
  ]

  const IMPORT_RESULT = {
    fatal: null,
    fileName: 'antigo.xlsx',
    fileSize: 90 * 1024,
    sheetName: 'SQ QUIMICA',
    headerRow: 8,
    headerRange: 'B8:O8',
    sourceRevision: 5,
    cargoType: 'LCL',
    cargoTypeRead: true,
    warnings: [],
    missingOptional: [],
    rows: IMPORTED_ROWS,
  }

  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const pickFile = (user) =>
    user.upload(
      screen.getByLabelText('Planilha .xlsx do Relatório de Carga'),
      new File(['x'], 'antigo.xlsx', { type: XLSX_TYPE })
    )

  beforeEach(() => {
    mockReadImport.mockResolvedValue(IMPORT_RESULT)
  })

  it('admin vê o botão', async () => {
    await renderForm()
    expect(screen.getByRole('button', { name: 'Importar de planilha' })).toBeEnabled()
  })

  it('logística não vê o botão nem o campo de arquivo', async () => {
    await renderForm({ profile: LOGISTICA })
    expect(screen.queryByRole('button', { name: 'Importar de planilha' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Planilha .xlsx do Relatório de Carga')).not.toBeInTheDocument()
  })

  it('relatório concluído não mostra o botão', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ status: 'concluido' }), conference: conferenceDoc() })
    await renderForm()
    expect(screen.queryByRole('button', { name: 'Importar de planilha' })).not.toBeInTheDocument()
  })

  it('escolher o arquivo abre o diálogo com a prévia e não altera o formulário', async () => {
    const { user } = await renderForm()
    await pickFile(user)

    expect(await screen.findByRole('dialog', { name: 'Importar de planilha' })).toBeInTheDocument()
    expect(mockReadImport).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('2 linhas reconhecidas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Substituir as 5 linhas atuais' })).toBeEnabled()
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('DEA FOAM14339 - BB 25KG')
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('confirmar troca as linhas e o tipo de carga, sem gravar nada', async () => {
    const { user } = await renderForm()
    expect(screen.getByRole('radio', { name: 'FCL' })).toBeChecked()

    await pickFile(user)
    await user.click(await screen.findByRole('button', { name: 'Substituir as 5 linhas atuais' }))

    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('PRODUTO IMPORTADO A')
    expect(screen.getByLabelText('Descrição SQ da linha 2')).toHaveValue('PRODUTO IMPORTADO B')
    expect(screen.queryByLabelText('Descrição SQ da linha 3')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'LCL' })).toBeChecked()
    expect(
      screen.getByText('Planilha importada: 2 linhas. Confira e clique em "Salvar rascunho" para gravar.')
    ).toBeInTheDocument()
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('depois de importar, "Salvar rascunho" grava a revisão + 1 com as linhas importadas', async () => {
    const { user } = await renderForm()
    await pickFile(user)
    await user.click(await screen.findByRole('button', { name: 'Substituir as 5 linhas atuais' }))

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const [processId, payload] = mockSaveDraft.mock.calls[0]
    expect(processId).toBe('p1')
    expect(payload.revision).toBe(5)
    expect(payload.cargoType).toBe('LCL')
    expect(payload.rows.map((item) => item.sqDescription)).toEqual(['PRODUTO IMPORTADO A', 'PRODUTO IMPORTADO B'])
    expect(payload.rows[0]).toMatchObject({ po: '4500777', dbcorpCode: 'AD5240', supplierLot: 'LT-A', quantityKg: 250 })
    for (const key of ['lotSq', 'netWeightKg', 'packages']) expect(payload.rows[0]).not.toHaveProperty(key)
  })

  it('depois de importar, voltar para Documentos pergunta se descarta as alterações', async () => {
    const onClose = vi.fn()
    const { user } = await renderForm({ onClose })
    await pickFile(user)
    await user.click(await screen.findByRole('button', { name: 'Substituir as 5 linhas atuais' }))

    await user.click(screen.getByRole('button', { name: '‹ Documentos' }))
    expect(await screen.findByText('Descartar alterações?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('enquanto salva o rascunho, o botão Importar fica desabilitado', async () => {
    mockSaveDraft.mockReturnValue(new Promise(() => {}))
    const { user } = await renderForm()
    expect(screen.getByRole('button', { name: 'Importar de planilha' })).toBeEnabled()

    await user.type(screen.getByLabelText('Descrição SQ da linha 1'), ' X')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar de planilha' })).toBeDisabled())
  })

  it('arquivo com modelo não reconhecido não altera o formulário', async () => {
    mockReadImport.mockResolvedValue({
      ...IMPORT_RESULT,
      fatal: {
        code: 'model-not-recognized',
        title: 'Modelo não reconhecido.',
        message: 'Nada foi alterado no formulário.',
      },
      rows: [],
    })
    const { user } = await renderForm()
    await pickFile(user)

    expect(await screen.findByText('Modelo não reconhecido.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Substituir as linhas atuais' })).toBeDisabled()
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('DEA FOAM14339 - BB 25KG')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// S4: Exportar Excel, Imprimir / Salvar PDF, Concluir e anexar, Reabrir para corrigir
// ---------------------------------------------------------------------------
const CONCLUDED_ROWS = MOCK_ROWS.map((item) => ({ ...item, frozenNetWeightKg: 25, frozenPackages: 500 }))
const concludedDoc = (overrides = {}) =>
  currentDoc({
    revision: 6,
    status: 'concluido',
    completedDate: '2026-11-23',
    rows: CONCLUDED_ROWS,
    lastGenerated: { documentId: 'doc-1', revision: 6, at: new Date(2026, 10, 23, 19, 55), byId: 'admin-1' },
    ...overrides,
  })

const PORTAL_FILE_NAME = 'FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx'

// O Modal fecha com animação de 240 ms: espera sair do DOM antes de procurar botões da página.
async function waitDialogClosed() {
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Concluir e anexar' })).not.toBeInTheDocument())
}

async function openConcludeDialog(user) {
  await user.click(screen.getByRole('button', { name: 'Concluir e anexar' }))
  return screen.findByRole('dialog', { name: 'Concluir e anexar' })
}

describe('S4: barra do admin em rascunho', () => {
  it('mostra Exportar Excel, Imprimir / Salvar PDF, Salvar rascunho (secundário) e Concluir e anexar', async () => {
    await renderForm()

    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Concluir e anexar' })).toHaveClass('primary-button')
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
  })

  it('mostra Importar de planilha (S5) e não mostra Reabrir nem Mais ações no desktop', async () => {
    await renderForm()

    expect(screen.getByRole('button', { name: 'Importar de planilha' })).toHaveClass('secondary-button')
    for (const label of ['Reabrir para corrigir', 'Mais ações']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })
})

describe('S4: Concluir e anexar', () => {
  beforeEach(() => {
    mockConclude.mockResolvedValue({ revision: 5, documentId: 'doc-9' })
  })

  it('o diálogo mostra os 3 itens do mock, o nome do processo e o aviso dos 3 alertas', async () => {
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)

    expect(dialog).toHaveTextContent('O Portal vai gerar o Excel do FR.CMX.001 e anexar ao processo ACME SEA 021-26 como Relatório de carga.')
    expect(within(dialog).getByText('nova versão').tagName).toBe('B')
    expect(dialog).toHaveTextContent('A atual vira "versão anterior" e a mais antiga é removida.')
    expect(dialog).toHaveTextContent('Envia o aviso por e-mail para Comex, Técnico, Logística e Faturamento/fiscal, com o assunto padrão.')
    expect(dialog).toHaveTextContent('O formulário passa a Concluído. Para corrigir, use "Reabrir para corrigir".')
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      '3 alertas continuam abertos: falta lote em RE5116, falta peso da embalagem em RE5116 e ZZ9999 sem embalagem cadastrada. Dá para concluir assim.'
    )
  })

  it('com 1 alerta usa o singular', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: [row({ id: 'r-1' }), row({ id: 'r-2', dbcorpCode: 'RE5116', supplierLot: '' })] }),
      conference: conferenceDoc(),
    })
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)
    expect(within(dialog).getByRole('note')).toHaveTextContent('1 alerta continua aberto: falta lote em RE5116. Dá para concluir assim.')
  })

  it('sem alertas não mostra o aviso', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: [row({ id: 'r-1' })] }),
      conference: conferenceDoc(),
    })
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument()
  })

  it('Cancelar fecha o diálogo e não chama nada', async () => {
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitDialogClosed()
    expect(mockConclude).not.toHaveBeenCalled()
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('confirmar gera o Excel, anexa com payload concluído e congelado e mostra o banner', async () => {
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Concluir e anexar' }))

    await waitFor(() => expect(mockConclude).toHaveBeenCalledTimes(1))
    const [processId, args] = mockConclude.mock.calls[0]
    expect(processId).toBe('p1')
    expect(args.actor).toBe(ADMIN)
    expect(args.category).toBe('FCL')
    expect(args.file.name).toBe(PORTAL_FILE_NAME)
    expect(args.payload).toMatchObject({ status: 'concluido', completedDate: '2026-11-24', revision: 5 })
    expect(typeof args.payload.rows[0].frozenNetWeightKg).toBe('number')
    expect(typeof args.payload.rows[0].frozenPackages).toBe('number')
    expect(args.payload.rows[2]).toMatchObject({ frozenNetWeightKg: null, frozenPackages: null })
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({ title: 'RELATÓRIO DE CARGA - ACME SEA 021-26', duimpNumber: '25BR00001234567' })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(mockSaveConference).not.toHaveBeenCalled()

    expect(
      await screen.findByText(
        'Relatório concluído e anexado. O aviso por e-mail foi enviado aos destinatários do Relatório de carga.'
      )
    ).toBeInTheDocument()
  })

  it('depois de concluído: selo, campos travados e barra Imprimir + Exportar + Reabrir', async () => {
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Concluir e anexar' }))
    await screen.findByText(/Relatório concluído e anexado/)
    await waitDialogClosed()

    expect(within(screen.getByLabelText('Cabeçalho do relatório')).getByText('Concluído')).toBeInTheDocument()
    expect(screen.getByLabelText('Etiquetado por')).toBeDisabled()
    expect(screen.getByLabelText('Título no relatório')).toBeDisabled()
    expect(screen.queryByRole('textbox', { name: /PO \/ processo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reabrir para corrigir' })).toHaveClass('secondary-button')
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Concluir e anexar' })).not.toBeInTheDocument()
  })

  it('"Conferido por" alterado é salvo antes de anexar', async () => {
    const { user } = await renderForm()
    await user.type(screen.getByLabelText('Conferido por'), 'Giulia')
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Concluir e anexar' }))

    await waitFor(() => expect(mockConclude).toHaveBeenCalledTimes(1))
    expect(mockSaveConference).toHaveBeenCalledTimes(1)
    expect(mockSaveConference.mock.calls[0][1].checkedByName).toBe('Giulia')
    expect(mockGenerate.mock.calls[0][0].checkedByName).toBe('Giulia')
    expect(mockSaveConference.mock.invocationCallOrder[0]).toBeLessThan(mockConclude.mock.invocationCallOrder[0])
  })

  it('falha ao salvar o "Conferido por" aborta sem anexar', async () => {
    mockSaveConference.mockRejectedValue(new Error('negado'))
    const { user } = await renderForm()
    await user.type(screen.getByLabelText('Conferido por'), 'Giulia')
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Concluir e anexar' }))

    expect(await screen.findByText(/Não foi possível salvar o relatório de carga\./)).toBeInTheDocument()
    expect(mockConclude).not.toHaveBeenCalled()
    await waitDialogClosed()
    expect(screen.getByRole('button', { name: 'Concluir e anexar' })).toBeEnabled()
  })

  it('conflito antes do anexo mostra o texto do S3 com "Recarregar" e nada é anexado', async () => {
    mockConclude.mockRejectedValue(Object.assign(new Error('revision-conflict'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Concluir e anexar' }))

    expect(
      await screen.findByText(
        'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.'
      )
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recarregar' }))
    await waitFor(() => expect(mockGetCargoReport).toHaveBeenCalledTimes(2))
    expect(mockRetry).not.toHaveBeenCalled()
  })

  it('anexado mas não gravado mostra "Gravar de novo", que grava sem anexar de novo', async () => {
    mockConclude.mockRejectedValue(
      Object.assign(new Error('attached-not-saved'), {
        code: 'cargoReport/attached-not-saved',
        documentId: 'doc-9',
        cause: Object.assign(new Error('offline'), { code: 'unavailable' }),
      })
    )
    mockRetry.mockResolvedValue({ revision: 5, documentId: 'doc-9' })
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Concluir e anexar' }))

    expect(
      await screen.findByText('O Excel foi anexado e o aviso enviado, mas o relatório não foi marcado como concluído.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gravar de novo' }))

    await waitFor(() => expect(mockRetry).toHaveBeenCalledTimes(1))
    const [processId, args] = mockRetry.mock.calls[0]
    expect(processId).toBe('p1')
    expect(args).toMatchObject({ documentId: 'doc-9', actor: ADMIN })
    expect(args.payload).toMatchObject({ status: 'concluido', revision: 5 })
    expect(mockConclude).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Relatório concluído e anexado/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir para corrigir' })).toBeInTheDocument()
  })

  it('anexado mas outra pessoa salvou antes: texto próprio e sem "Gravar de novo"', async () => {
    mockConclude.mockRejectedValue(
      Object.assign(new Error('attached-not-saved'), {
        code: 'cargoReport/attached-not-saved',
        documentId: 'doc-9',
        cause: Object.assign(new Error('revision-conflict'), { code: 'cargoReport/revision-conflict' }),
      })
    )
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Concluir e anexar' }))

    expect(
      await screen.findByText(
        'O Excel foi anexado e o aviso enviado, mas outra pessoa salvou o relatório antes. Recarregue e confira.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gravar de novo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })

  it('falha na geração ou no upload mostra o erro e não grava nada', async () => {
    mockGenerate.mockRejectedValue(new Error('Failed to fetch'))
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Concluir e anexar' }))

    expect(await screen.findByText(/Não foi possível concluir e anexar o relatório\./)).toBeInTheDocument()
    expect(mockConclude).not.toHaveBeenCalled()
    await waitDialogClosed()
  })

  it('número inválido bloqueia o diálogo, como no salvar', async () => {
    const { user } = await renderForm()
    const quantity = screen.getByLabelText('Qtd (kg) da linha 2')
    await user.clear(quantity)
    await user.type(quantity, 'abc')

    await user.click(screen.getByRole('button', { name: 'Concluir e anexar' }))

    expect(screen.queryByRole('dialog', { name: 'Concluir e anexar' })).not.toBeInTheDocument()
    expect(screen.getByText('Corrija os números destacados antes de salvar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveAttribute('aria-invalid', 'true')
    expect(mockConclude).not.toHaveBeenCalled()
  })
})

describe('S4: Reabrir para corrigir', () => {
  beforeEach(() => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: conferenceDoc() })
    mockReopen.mockResolvedValue({ revision: 7 })
  })

  it('abre o relatório concluído travado, com a barra do concluído', async () => {
    await renderForm()

    expect(screen.getByText('Concluído')).toBeInTheDocument()
    expect(screen.getByLabelText('Etiquetado por')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reabrir para corrigir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar de planilha' })).not.toBeInTheDocument()
  })

  it('reabre sem diálogo, grava rascunho com congelados zerados e volta a editar', async () => {
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir para corrigir' }))

    await waitFor(() => expect(mockReopen).toHaveBeenCalledTimes(1))
    const [processId, payload, actor] = mockReopen.mock.calls[0]
    expect(processId).toBe('p1')
    expect(actor).toBe(ADMIN)
    expect(payload).toMatchObject({ status: 'rascunho', completedDate: '', revision: 7 })
    expect(payload.rows.every((item) => item.frozenNetWeightKg === null && item.frozenPackages === null)).toBe(true)
    expect(payload.lastGenerated).toMatchObject({ documentId: 'doc-1' })

    expect(await screen.findByText('Relatório reaberto. Para gerar uma nova versão, conclua de novo.')).toBeInTheDocument()
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    expect(screen.getByLabelText('Etiquetado por')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Concluir e anexar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir para corrigir' })).not.toBeInTheDocument()
  })

  it('conflito ao reabrir mostra o texto do S3 com "Recarregar"', async () => {
    mockReopen.mockRejectedValue(Object.assign(new Error('x'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir para corrigir' }))

    expect(
      await screen.findByText(
        'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })
})

describe('S4: Exportar Excel e Imprimir / Salvar PDF', () => {
  it('Exportar Excel gera o arquivo do estado da tela e baixa, sem gravar nem anexar', async () => {
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }))

    await waitFor(() => expect(mockSaveBlob).toHaveBeenCalledTimes(1))
    expect(mockGenerate).toHaveBeenCalledTimes(1)
    const [blob, name] = mockSaveBlob.mock.calls[0]
    expect(name).toBe(PORTAL_FILE_NAME)
    expect(blob.name).toBe(PORTAL_FILE_NAME)
    for (const mock of [mockConclude, mockSaveDraft, mockSaveConference, mockReopen, mockRetry]) {
      expect(mock).not.toHaveBeenCalled()
    }
  })

  it('erro ao gerar o Excel mostra alerta', async () => {
    mockGenerate.mockRejectedValue(new Error('Failed to fetch'))
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gerar o Excel.')
    expect(mockSaveBlob).not.toHaveBeenCalled()
  })

  it('Imprimir / Salvar PDF abre a visão de impressão e chama window.print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { user } = await renderForm()
    expect(screen.queryByRole('region', { name: 'Visão de impressão do relatório de carga' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Imprimir / Salvar PDF' }))

    const region = await screen.findByRole('region', { name: 'Visão de impressão do relatório de carga' })
    expect(print).toHaveBeenCalledTimes(1)
    expect(region).toHaveTextContent('RELATÓRIO DE CARGA - ACME SEA 021-26')
    expect(region).toHaveTextContent('FR.CMX.001 · REVISÃO: 005')
    expect(region).toHaveTextContent('Nº da DUIMP: 25BR00001234567')
    expect(region).toHaveTextContent('CONFERÊNCIA:')
    expect(region).toHaveTextContent('COM RESSALVA')
    expect(region).toHaveTextContent('☑ FCL')
    expect(region).toHaveTextContent('DF2406A450')
    expect(document.body).toHaveClass('crf-printing')
    expect(mockSaveDraft).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('afterprint'))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Visão de impressão do relatório de carga' })).not.toBeInTheDocument())
    expect(document.body).not.toHaveClass('crf-printing')
    print.mockRestore()
  })

  it('no concluído a impressão e o Excel usam os valores congelados da tela', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: concludedDoc({ rows: [row({ id: 'r-1', frozenNetWeightKg: 40, frozenPackages: 312.5 })] }),
      conference: conferenceDoc(),
    })
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }))

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1))
    expect(mockGenerate.mock.calls[0][0].rows[0]).toMatchObject({ netWeightKg: 40, packages: 312.5 })
  })
})

describe('S4: mobile', () => {
  it('Mais ações abre o ActionSheet com Exportar Excel e Imprimir / Salvar PDF', async () => {
    const { user } = await renderForm({ variant: 'mobile' })

    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Concluir e anexar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exportar Excel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mais ações' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mais ações' })
    expect(within(sheet).getByRole('button', { name: 'Exportar Excel' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Importar de planilha' })).not.toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Exportar Excel' }))
    await waitFor(() => expect(mockSaveBlob).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: 'Mais ações' })).not.toBeInTheDocument()
  })
})

describe('S4: logística com o relatório concluído', () => {
  it('só leitura: aviso, sem Concluir/Reabrir e sem botões de salvar', async () => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: conferenceDoc() })
    await renderForm({ profile: LOGISTICA })

    expect(
      screen.getByText('Relatório concluído pelo COMEX. Para alterar a conferência, peça ao COMEX para reabrir.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/Marque o OK\? de cada linha conferida/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Conferido por')).toBeDisabled()
    for (const label of ['Concluir e anexar', 'Reabrir para corrigir', 'Salvar conferência', 'Descartar', 'Exportar Excel']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('checkbox', { name: 'OK? da linha 3' })?.getAttribute('aria-disabled') ?? 'true').toBe('true')
  })

  it('em rascunho a logística não vê os botões do COMEX', async () => {
    await renderForm({ profile: LOGISTICA })
    for (const label of ['Concluir e anexar', 'Reabrir para corrigir', 'Exportar Excel', 'Imprimir / Salvar PDF']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeInTheDocument()
  })
})

describe('S4: diálogo ocupado, saídas bloqueadas e tabela ausente', () => {
  it('enquanto conclui, Esc, clique no fundo e "Fechar" não fecham o diálogo; ao terminar ele fecha', async () => {
    let finish
    mockConclude.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ revision: 5, documentId: 'doc-9' })
      })
    )
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Concluir e anexar' }))

    expect(await within(dialog).findByRole('button', { name: 'Concluindo…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()

    await user.keyboard('{Escape}')
    await user.click(dialog.parentElement)
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    // o Modal fecha com animação de 240 ms: espera passar para pegar um fechamento indevido
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(screen.getByRole('dialog', { name: 'Concluir e anexar' })).toBeInTheDocument()
    expect(mockConclude).toHaveBeenCalledTimes(1)

    finish()
    expect(await screen.findByText(/Relatório concluído e anexado/)).toBeInTheDocument()
    await waitDialogClosed()
  })

  it('fora do estado ocupado, Esc e clique no fundo fecham o diálogo sem concluir', async () => {
    const { user } = await renderForm()
    await openConcludeDialog(user)
    await user.keyboard('{Escape}')
    await waitDialogClosed()

    const dialog = await openConcludeDialog(user)
    await user.click(dialog.parentElement)
    await waitDialogClosed()
    expect(mockConclude).not.toHaveBeenCalled()
  })

  it('Exportar Excel com número inválido bloqueia, marca a célula e não gera o arquivo', async () => {
    const { user } = await renderForm()
    const quantity = screen.getByLabelText('Qtd (kg) da linha 2')
    await user.clear(quantity)
    await user.type(quantity, 'abc')

    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }))

    expect(mockGenerate).not.toHaveBeenCalled()
    expect(mockSaveBlob).not.toHaveBeenCalled()
    expect(screen.getByText('Corrija os números destacados antes de salvar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveAttribute('aria-invalid', 'true')
  })

  it('Imprimir / Salvar PDF com número inválido bloqueia e não abre a visão de impressão', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { user } = await renderForm()
    const quantity = screen.getByLabelText('Qtd (kg) da linha 2')
    await user.clear(quantity)
    await user.type(quantity, 'abc')

    await user.click(screen.getByRole('button', { name: 'Imprimir / Salvar PDF' }))

    expect(print).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Visão de impressão do relatório de carga' })).not.toBeInTheDocument()
    expect(screen.getByText('Corrija os números destacados antes de salvar.')).toBeInTheDocument()
    print.mockRestore()
  })

  it('sem a tabela Item x Emb. o diálogo avisa que peso líquido e nº de embalagens vão vazios', async () => {
    mockGetCatalog.mockResolvedValue({ exists: false, version: 0, items: [], itemCount: 0 })
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: [row({ id: 'r-1' })] }),
      conference: conferenceDoc(),
    })
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)

    const notes = within(dialog).getAllByRole('note').map((note) => note.textContent)
    expect(notes.some((text) => text.startsWith('A tabela Item x Emb. não está disponível: peso líquido e nº de embalagens vão vazios no relatório concluído'))).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Concluir e anexar' }))
    await waitFor(() => expect(mockConclude).toHaveBeenCalledTimes(1))
    expect(mockConclude.mock.calls[0][1].payload.rows[0]).toMatchObject({ frozenNetWeightKg: null, frozenPackages: null })
  })

  it('com a tabela carregada o diálogo não mostra o aviso da tabela', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: [row({ id: 'r-1' })] }),
      conference: conferenceDoc(),
    })
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('A tabela Item x Emb. não está disponível')
  })
})
