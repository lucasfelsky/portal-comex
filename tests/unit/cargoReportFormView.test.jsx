// S3 do Relatorio de Carga: formulario FR.CMX.001 (CargoReportForm + CargoReportItems).
// Repositorios mockados; catalogo SINTETICO. O catalogo e' cacheado por 5 min no modulo do
// formulario: cada teste avanca o relogio (so' `Date`) para nao herdar o cache do anterior.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockGetCargoReport = vi.fn()
const mockSaveDraft = vi.fn()
const mockSaveConference = vi.fn()
const mockGetCatalog = vi.fn()
const mockReadImport = vi.fn()
const mockConclude = vi.fn()
const mockRetry = vi.fn()
const mockReopen = vi.fn()
const mockClose = vi.fn()
const mockRetryClose = vi.fn()
const mockReopenConference = vi.fn()
const mockGenerate = vi.fn()
const mockSaveBlob = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportDraft: (...args) => mockSaveDraft(...args),
  saveCargoReportConference: (...args) => mockSaveConference(...args),
  concludeCargoReport: (...args) => mockConclude(...args),
  retryConcludeWrite: (...args) => mockRetry(...args),
  reopenCargoReport: (...args) => mockReopen(...args),
  closeCargoReportConference: (...args) => mockClose(...args),
  retryCloseConferenceWrite: (...args) => mockRetryClose(...args),
  reopenCargoReportConference: (...args) => mockReopenConference(...args),
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
// S9-C: o formulário lê o FUP do processo (admin, estágio 1); aqui sem FUP, como um processo não casado com o ERP.
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpProcessReference: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: vi.fn().mockResolvedValue(undefined),
}))
// S5: só a leitura do .xlsx é mockada (o parser tem testes próprios); o resto do módulo é real.
vi.mock('../../src/features/processes/cargoReportImport', async (importOriginal) => ({
  ...(await importOriginal()),
  readCargoReportWorkbook: (...args) => mockReadImport(...args),
}))

import { ToastProvider } from '../../src/components/Toast'
import CargoReportForm from '../../src/features/processes/CargoReportForm'
import { buildConferencePayload, toCargoDateKey } from '../../src/features/processes/cargoReportFormModel'
import {
  duplicateCargoRow,
  removeCargoRow,
  restoreCargoRow,
  splitCargoRow,
} from '../../src/features/processes/cargoReportRowOps'
import { buildCargoReportFileName, formatCargoDateBr } from '../../src/features/processes/cargoReportSheet'

// S9-B: o formulario usa toast (Desfazer, Dividido em N lotes); no app o provider vive em main.jsx.
const render = (ui, options) => rtlRender(ui, { wrapper: ToastProvider, ...options })

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

// S8: conferência no formato novo (21 chaves nas rules). Aberta = estados 1 e 2; `closedConferenceDoc` = estado 3.
const conferenceDoc = (overrides = {}) => ({
  schemaVersion: 1,
  revision: 2,
  status: 'aberta',
  okByRowId: { 'r-1': true, 'r-2': true, 'r-4': true, orfa: true },
  countOkByRowId: { 'r-1': true, 'r-4': false, orfa: true },
  labelsByRowId: {
    'r-1': { wms: 'WMS-77120', sq: 'SQ-001245' },
    'r-2': { wms: 'WMS-77121', sq: '' },
    orfa: { wms: 'X', sq: 'Y' },
  },
  checkedByName: 'Operador Logística',
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
  updatedAt: new Date(2026, 10, 23, 20, 0),
  updatedByName: 'Operador Logística',
  ...overrides,
})

const closedConferenceDoc = (overrides = {}) =>
  conferenceDoc({
    revision: 3,
    status: 'fechada',
    receiptStatus: 'com_ressalva',
    receivedDate: '2026-11-22',
    nfNumber: '000.123.456',
    notes: 'Palete 3 com avaria na embalagem externa.',
    closedDate: '2026-11-24',
    closedById: 'log-1',
    closedByName: 'Operador Logística',
    closedDocumentId: 'doc-log-1',
    updatedAt: new Date(2026, 10, 24, 16, 5),
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
    expect(duimp).toHaveAccessibleDescription(/Fixo: vem do processo/)
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

    await user.type(screen.getByLabelText('Título no relatório'), ' 2')
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const [processId, payload, actor] = mockSaveDraft.mock.calls[0]
    expect(processId).toBe('p1')
    expect(actor).toBe(ADMIN)
    expect(payload.revision).toBe(5)
    expect(payload.catalogVersion).toBe(3)
    expect(payload.titleSuffix).toBe('ACME SEA 021-26 2')
    // S7: sem "Etiquetado por"/"Etiqueta feita por" no payload (15 chaves + 3 carimbos do repositório = 18 nas rules).
    expect(payload).not.toHaveProperty('labeledBy')
    expect(payload).not.toHaveProperty('labelMadeBy')
    expect(Object.keys(payload)).toHaveLength(15)
    expect(JSON.stringify(payload)).not.toMatch(/lotSq|netWeightKg|"packages"/)
    expect(mockSaveConference).not.toHaveBeenCalled()

    expect(await screen.findByText(/Rascunho salvo às \d{2}:\d{2}\. Nada foi enviado por e-mail\./)).toBeInTheDocument()
  })

  it('S7: o admin nunca grava a conferência: "Conferido por" é só leitura e salvar o rascunho não a toca', async () => {
    const { user } = await renderForm()

    const checkedBy = screen.getByLabelText('Conferido por')
    expect(checkedBy).toBeDisabled()
    expect(checkedBy).toHaveValue('Operador Logística')

    await user.type(screen.getByLabelText('Título no relatório'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Rascunho salvo às/)).toBeInTheDocument()
    expect(mockSaveConference).not.toHaveBeenCalled()
    expect(mockReopenConference).not.toHaveBeenCalled()
  })

  it('S7: card "Responsáveis e recebimento" sem Etiquetado por/Etiqueta feita por e com o recebimento só leitura', async () => {
    await renderForm()

    expect(screen.queryByLabelText('Etiquetado por')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Etiqueta feita por')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Preenchido pela logística. "Conferido por", "Data de recebimento" e o tempo total da descarga são automáticos. A data de conclusão é preenchida ao fechar.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/Fixo: quem faz a conferência/)).toBeInTheDocument()
    expect(screen.getByText(/Fixo: dia da descarga/)).toBeInTheDocument()
    for (const label of [
      'Status do recebimento',
      'Data de recebimento',
      'Nº da NF',
      'Observações',
      'Início da descarga',
      'Fim da descarga',
      'Tempo total da descarga',
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled()
    }
  })

  it('conflito de revisao mostra o texto do mock e "Recarregar"', async () => {
    mockSaveDraft.mockRejectedValue(Object.assign(new Error('revision-conflict'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderForm()

    await user.type(screen.getByLabelText('Título no relatório'), 'X')
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

    await user.type(screen.getByLabelText('Título no relatório'), 'X')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(
      await screen.findByText(
        'Sem permissão para editar. O COMEX preenche o relatório; a logística marca o OK? e a contagem, preenche as etiquetas e o recebimento e fecha a conferência.'
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

describe('logistica: conferencia (estado 1: COMEX em rascunho)', () => {
  it('nao edita o preenchimento do COMEX; banner, selos, recebimento editavel e Conferido por travado', async () => {
    await renderForm({ profile: LOGISTICA })

    expect(screen.queryByRole('textbox', { name: /PO \/ processo/ })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Marque o OK? e a contagem de cada linha conferida, preencha as etiquetas WMS e SQ e os dados do recebimento. A conferência é salva separada do preenchimento do COMEX, então não conflita com quem está editando. O fechamento da conferência fica disponível quando o COMEX fechar a parte dele.'
      )
    ).toBeInTheDocument()
    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText('COMEX: Rascunho')).toHaveClass('inline-badge--warn')
    expect(header.getByText('Logística: Aguardando COMEX')).toHaveClass('documents-badge--neutral')
    expect(screen.getByLabelText('Título no relatório')).toBeDisabled()
    expect(screen.queryByLabelText('Etiquetado por')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nº da DUIMP')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'FCL' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()

    const checkedBy = screen.getByLabelText('Conferido por')
    expect(checkedBy).toBeDisabled()
    expect(checkedBy).toHaveValue('Operador Logística')
    for (const label of ['Status do recebimento', 'Nº da NF', 'Observações', 'Início da descarga', 'Fim da descarga']) {
      expect(screen.getByLabelText(label)).toBeEnabled()
    }
    // S8: "Data de recebimento" e "Tempo total da descarga" são calculados (somente leitura).
    for (const label of ['Data de recebimento', 'Tempo total da descarga']) {
      expect(screen.getByLabelText(label)).toBeDisabled()
    }
  })

  it('S7: salva a conferencia no estado 1, mas "Salvar e fechar conferencia" fica desabilitado ate o COMEX fechar', async () => {
    await renderForm({ profile: LOGISTICA })

    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toHaveClass('primary-button')
    const close = screen.getByRole('button', { name: 'Salvar e fechar conferência' })
    expect(close).toBeDisabled()
    expect(close).toHaveClass('secondary-button')
    expect(screen.getByText('Disponível depois que o COMEX fechar: "Salvar e fechar conferência".')).toBeInTheDocument()
  })

  it('"Conferido por" mostra SEMPRE o nome de quem salva (mesmo com nome livre legado) e o payload leva esse nome', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ checkedByName: 'Giulia' }) })
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
    expect(payload.status).toBe('aberta')
    expect(payload.checkedByName).toBe('Operador Logística')
    expect(payload.okByRowId).toEqual({ 'r-1': false, 'r-2': true, 'r-3': true, 'r-4': true })
    expect(payload.okByRowId).not.toHaveProperty('orfa')
    expect(Object.keys(payload)).toHaveLength(18)
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(await screen.findByText(/Conferência salva às \d{2}:\d{2}\./)).toBeInTheDocument()
    expect(screen.getByLabelText('Conferido por')).toHaveValue('Operador Logística')
  })

  it('admin ve o nome gravado em "Conferido por" (so leitura), e vazio com o texto "Definido pela logistica"', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ checkedByName: 'Giulia' }) })
    const first = await renderForm()
    expect(screen.getByLabelText('Conferido por')).toHaveValue('Giulia')
    first.unmount()

    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: null })
    await renderForm()
    const field = screen.getByLabelText('Conferido por')
    expect(field).toHaveValue('')
    expect(field).toHaveAttribute('placeholder', 'Definido pela logística')
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

    await user.click(screen.getByRole('checkbox', { name: 'OK? da linha 3' }))
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

  it('S7: rodape do recebimento e salvo no payload da conferencia (status, data, NF e Observacoes)', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    const save = screen.getByRole('button', { name: 'Salvar conferência' })
    expect(save).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Status do recebimento'), 'com_ressalva')
    // S8: a data de recebimento não é digitada; ela é o dia do início da descarga.
    fireEvent.change(screen.getByLabelText('Início da descarga'), { target: { value: '2026-11-22T08:15' } })
    await user.type(screen.getByLabelText('Nº da NF'), '000.123')
    await user.type(screen.getByLabelText('Observações'), 'Palete 3 avariado')
    expect(save).toBeEnabled()

    await user.click(save)
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1]).toMatchObject({
      receiptStatus: 'com_ressalva',
      receivedDate: '2026-11-22',
      nfNumber: '000.123',
      notes: 'Palete 3 avariado',
    })
    expect(save).toBeDisabled()
  })

  it('S7: conferencia anterior a S7 (sem receiptStatus) pre-preenche o recebimento pelo current sem sujar a tela', async () => {
    const { receiptStatus: _s, receivedDate: _d, nfNumber: _n, notes: _o, ...legacyConference } = conferenceDoc()
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ notes: 'Obs do COMEX', receiptStatus: 'sem_ressalva', receivedDate: '2026-11-20', nfNumber: 'NF-9' }),
      conference: legacyConference,
    })
    await renderForm({ profile: LOGISTICA })

    expect(screen.getByLabelText('Observações')).toHaveValue('Obs do COMEX')
    expect(screen.getByLabelText('Status do recebimento')).toHaveValue('sem_ressalva')
    expect(screen.getByLabelText('Data de recebimento')).toHaveValue('20/11/2026')
    expect(screen.getByLabelText('Nº da NF')).toHaveValue('NF-9')
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeDisabled()
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

    await user.type(screen.getByLabelText('Título no relatório'), 'X')
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
// S4/S7: Exportar Excel, Imprimir / Salvar PDF, "Salvar e fechar" do COMEX, reabrir
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
const COMEX_DIALOG = 'Salvar e fechar a parte do COMEX'
const CLOSE_DIALOG = 'Salvar e fechar conferência'

// O Modal fecha com animação de 240 ms: espera sair do DOM antes de procurar botões da página.
async function waitDialogClosed(name = COMEX_DIALOG) {
  await waitFor(() => expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument())
}

async function openConcludeDialog(user) {
  await user.click(screen.getByRole('button', { name: 'Salvar e fechar' }))
  return screen.findByRole('dialog', { name: COMEX_DIALOG })
}

describe('S4/S7: barra do admin em rascunho', () => {
  it('mostra Exportar Excel, Imprimir / Salvar PDF, Salvar rascunho (secundário) e Salvar e fechar (primário)', async () => {
    await renderForm()

    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Salvar e fechar' })).toHaveClass('primary-button')
    expect(screen.queryByRole('button', { name: 'Concluir e anexar' })).not.toBeInTheDocument()
    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText('COMEX: Rascunho')).toBeInTheDocument()
    expect(header.getByText('Logística: Aguardando COMEX')).toBeInTheDocument()
  })

  it('mostra Importar de planilha (S5) e não mostra Reabrir nem Mais ações no desktop', async () => {
    await renderForm()

    expect(screen.getByRole('button', { name: 'Importar de planilha' })).toHaveClass('secondary-button')
    for (const label of ['Reabrir parte do COMEX', 'Reabrir conferência', 'Reabrir para corrigir', 'Mais ações']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })
})

describe('S4/S7: Salvar e fechar (COMEX)', () => {
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
    expect(dialog).toHaveTextContent(
      'A parte do COMEX fica fechada: os campos travam e a logística passa a poder conferir e fechar a parte dela. Para corrigir, use "Reabrir parte do COMEX".'
    )
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      '3 alertas continuam abertos: falta lote em RE5116, falta peso da embalagem em RE5116 e ZZ9999 sem embalagem cadastrada. Dá para fechar assim.'
    )
    expect(within(dialog).getByRole('button', { name: 'Salvar e fechar' })).toHaveClass('primary-button')
  })

  it('com 1 alerta usa o singular', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: [row({ id: 'r-1' }), row({ id: 'r-2', dbcorpCode: 'RE5116', supplierLot: '' })] }),
      conference: conferenceDoc(),
    })
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)
    expect(within(dialog).getByRole('note')).toHaveTextContent('1 alerta continua aberto: falta lote em RE5116. Dá para fechar assim.')
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

  it('confirmar gera o Excel, anexa com payload fechado e congelado e mostra o banner', async () => {
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Salvar e fechar' }))

    await waitFor(() => expect(mockConclude).toHaveBeenCalledTimes(1))
    const [processId, args] = mockConclude.mock.calls[0]
    expect(processId).toBe('p1')
    expect(args.actor).toBe(ADMIN)
    expect(args.category).toBe('FCL')
    expect(args.file.name).toBe(PORTAL_FILE_NAME)
    expect(args.payload).toMatchObject({ status: 'concluido', completedDate: toCargoDateKey(new Date()), revision: 5 })
    expect(typeof args.payload.rows[0].frozenNetWeightKg).toBe('number')
    expect(typeof args.payload.rows[0].frozenPackages).toBe('number')
    expect(args.payload.rows[2]).toMatchObject({ frozenNetWeightKg: null, frozenPackages: null })
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({ title: 'RELATÓRIO DE CARGA - ACME SEA 021-26', duimpNumber: '25BR00001234567' })
    expect(mockSaveDraft).not.toHaveBeenCalled()
    // S7: o admin não grava a conferência ao fechar.
    expect(mockSaveConference).not.toHaveBeenCalled()

    expect(
      await screen.findByText(
        'Parte do COMEX fechada e Excel anexado. O aviso por e-mail foi enviado aos destinatários do Relatório de carga. A logística já pode fechar a conferência.'
      )
    ).toBeInTheDocument()
  })

  it('depois de fechado: selos por área, campos travados e barra Imprimir + Exportar + Reabrir parte do COMEX', async () => {
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))
    await screen.findByText(/Parte do COMEX fechada e Excel anexado/)
    await waitDialogClosed()

    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText(/^COMEX: Fechado em \d{2}\/\d{2} \d{2}:\d{2} por Lucas$/)).toHaveClass('inline-badge--ok')
    expect(header.getByText('Logística: Em conferência')).toHaveClass('inline-badge--warn')
    expect(screen.getByText('Aguardando conferência da logística. Parte do COMEX fechada: a logística preenche a conferência e fecha a parte dela.')).toBeInTheDocument()
    expect(screen.getByLabelText('Título no relatório')).toBeDisabled()
    expect(screen.getByLabelText('Observações')).toBeDisabled()
    expect(screen.queryByRole('textbox', { name: /PO \/ processo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reabrir parte do COMEX' })).toHaveClass('secondary-button')
    expect(screen.queryByRole('button', { name: 'Reabrir conferência' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar e fechar' })).not.toBeInTheDocument()
  })

  it('o Excel do COMEX leva o "Conferido por" gravado pela logística (o admin não o digita nem o grava)', async () => {
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))

    await waitFor(() => expect(mockConclude).toHaveBeenCalledTimes(1))
    expect(mockGenerate.mock.calls[0][0].checkedByName).toBe('Operador Logística')
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('conflito antes do anexo mostra o texto do S3 com "Recarregar" e nada é anexado', async () => {
    mockConclude.mockRejectedValue(Object.assign(new Error('revision-conflict'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))

    expect(
      await screen.findByText(
        'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.'
      )
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recarregar' }))
    // carga inicial + releitura da conferência ao fechar (S6) + recarga
    await waitFor(() => expect(mockGetCargoReport).toHaveBeenCalledTimes(3))
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
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))

    expect(
      await screen.findByText('O Excel foi anexado e o aviso enviado, mas a parte do COMEX não foi marcada como fechada.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gravar de novo' }))

    await waitFor(() => expect(mockRetry).toHaveBeenCalledTimes(1))
    const [processId, args] = mockRetry.mock.calls[0]
    expect(processId).toBe('p1')
    expect(args).toMatchObject({ documentId: 'doc-9', actor: ADMIN })
    expect(args.payload).toMatchObject({ status: 'concluido', revision: 5 })
    expect(mockConclude).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Parte do COMEX fechada e Excel anexado/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir parte do COMEX' })).toBeInTheDocument()
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
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))

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
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))

    expect(await screen.findByText(/Não foi possível salvar e fechar o relatório\./)).toBeInTheDocument()
    expect(mockConclude).not.toHaveBeenCalled()
    await waitDialogClosed()
  })

  it('número inválido bloqueia o diálogo, como no salvar', async () => {
    const { user } = await renderForm()
    const quantity = screen.getByLabelText('Qtd (kg) da linha 2')
    await user.clear(quantity)
    await user.type(quantity, 'abc')

    await user.click(screen.getByRole('button', { name: 'Salvar e fechar' }))

    expect(screen.queryByRole('dialog', { name: COMEX_DIALOG })).not.toBeInTheDocument()
    expect(screen.getByText('Corrija os números destacados antes de salvar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveAttribute('aria-invalid', 'true')
    expect(mockConclude).not.toHaveBeenCalled()
  })
})

describe('S7: reabrir a parte do COMEX no estado 2 (COMEX fechado, conferência aberta)', () => {
  beforeEach(() => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: conferenceDoc() })
    mockReopen.mockResolvedValue({ revision: 7 })
  })

  it('abre o relatório fechado travado, só com "Reabrir parte do COMEX"', async () => {
    await renderForm()

    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText('Logística: Em conferência')).toBeInTheDocument()
    expect(screen.getByLabelText('Título no relatório')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reabrir parte do COMEX' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir conferência' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar de planilha' })).not.toBeInTheDocument()
  })

  it('reabre sem diálogo, grava rascunho com congelados zerados e volta a editar', async () => {
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir parte do COMEX' }))

    await waitFor(() => expect(mockReopen).toHaveBeenCalledTimes(1))
    const [processId, payload, actor] = mockReopen.mock.calls[0]
    expect(processId).toBe('p1')
    expect(actor).toBe(ADMIN)
    expect(payload).toMatchObject({ status: 'rascunho', completedDate: '', revision: 7 })
    expect(payload.rows.every((item) => item.frozenNetWeightKg === null && item.frozenPackages === null)).toBe(true)
    expect(payload.lastGenerated).toMatchObject({ documentId: 'doc-1' })
    // No estado 2 a conferência já está aberta: só o `current` é gravado.
    expect(mockSaveConference).not.toHaveBeenCalled()
    expect(mockReopenConference).not.toHaveBeenCalled()

    expect(
      await screen.findByText('Parte do COMEX reaberta. Para gerar uma nova versão, salve e feche de novo.')
    ).toBeInTheDocument()
    expect(within(screen.getByLabelText('Cabeçalho do relatório')).getByText('COMEX: Rascunho')).toBeInTheDocument()
    expect(screen.getByLabelText('Título no relatório')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Salvar e fechar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir parte do COMEX' })).not.toBeInTheDocument()
  })

  it('conflito ao reabrir mostra o texto do S3 com "Recarregar"', async () => {
    mockReopen.mockRejectedValue(Object.assign(new Error('x'), { code: 'cargoReport/revision-conflict' }))
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir parte do COMEX' }))

    expect(
      await screen.findByText(
        'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })
})

describe('S7: estado 3 (concluído: COMEX e logística fecharam) para o admin', () => {
  beforeEach(() => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: closedConferenceDoc() })
    mockReopen.mockResolvedValue({ revision: 7 })
    mockReopenConference.mockResolvedValue({ revision: 4 })
  })

  it('selos fechado/fechada, banner de concluído, nada editável e os 2 botões de reabrir', async () => {
    await renderForm()

    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText(/^COMEX: Fechado em 23\/11 19:52 por Lucas$/)).toHaveClass('inline-badge--ok')
    expect(header.getByText('Logística: Fechada em 24/11 16:05 por Operador Logística')).toHaveClass('inline-badge--ok')
    expect(screen.getByText('Relatório concluído: COMEX e logística fecharam as partes.')).toBeInTheDocument()
    expect(screen.getByLabelText('Conferido por')).toHaveValue('Operador Logística')
    expect(screen.getByLabelText('Observações')).toHaveValue('Palete 3 com avaria na embalagem externa.')
    expect(screen.getByLabelText('Observações')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reabrir conferência' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir parte do COMEX' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled()
  })

  it('"Reabrir conferência" chama reopenCargoReportConference e volta ao estado 2, sem tocar no current', async () => {
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir conferência' }))

    await waitFor(() => expect(mockReopenConference).toHaveBeenCalledTimes(1))
    expect(mockReopenConference).toHaveBeenCalledWith('p1', ADMIN)
    expect(mockReopen).not.toHaveBeenCalled()
    expect(await screen.findByText('Conferência reaberta. A logística pode corrigir e fechar de novo.')).toBeInTheDocument()
    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText('Logística: Em conferência')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir conferência' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir parte do COMEX' })).toBeInTheDocument()
    // O conteúdo da conferência é mantido.
    expect(screen.getByLabelText('Observações')).toHaveValue('Palete 3 com avaria na embalagem externa.')
  })

  it('"Reabrir parte do COMEX" pede confirmação; Cancelar não chama nada', async () => {
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir parte do COMEX' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Reabrir parte do COMEX?' })
    expect(dialog).toHaveTextContent(
      'Reabrir a parte do COMEX também reabre a conferência da logística. O conteúdo da conferência é mantido; ao fechar de novo, a logística gera uma nova versão do Excel.'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockReopenConference).not.toHaveBeenCalled()
    expect(mockReopen).not.toHaveBeenCalled()
  })

  it('confirmar reabre a conferência PRIMEIRO e depois o current, e volta ao estado 1', async () => {
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir parte do COMEX' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Reabrir parte do COMEX?' })
    await user.click(within(dialog).getByRole('button', { name: 'Reabrir parte do COMEX' }))

    await waitFor(() => expect(mockReopen).toHaveBeenCalledTimes(1))
    expect(mockReopenConference).toHaveBeenCalledTimes(1)
    expect(mockReopenConference.mock.invocationCallOrder[0]).toBeLessThan(mockReopen.mock.invocationCallOrder[0])
    expect(mockReopen.mock.calls[0][1]).toMatchObject({ status: 'rascunho', completedDate: '', revision: 7 })
    expect(await screen.findByText('Parte do COMEX reaberta. Para gerar uma nova versão, salve e feche de novo.')).toBeInTheDocument()
    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText('COMEX: Rascunho')).toBeInTheDocument()
    expect(header.getByText('Logística: Aguardando COMEX')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar e fechar' })).toBeInTheDocument()
  })

  it('se o current falhar depois de reabrir a conferência, a tela fica no estado 2 e avisa', async () => {
    mockReopen.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir parte do COMEX' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Reabrir parte do COMEX?' })
    await user.click(within(dialog).getByRole('button', { name: 'Reabrir parte do COMEX' }))

    expect(
      await screen.findByText(/A conferência foi reaberta, mas a parte do COMEX não\. O relatório continua com a parte do COMEX fechada\./)
    ).toBeInTheDocument()
    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText('Logística: Em conferência')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir conferência' })).not.toBeInTheDocument()
  })

  it('falha ao reabrir a conferência (conflito) mostra o texto da conferência e não reabre o current', async () => {
    mockReopenConference.mockRejectedValue(Object.assign(new Error('x'), { code: 'cargoReport/revision-conflict', scope: 'conference' }))
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Reabrir conferência' }))

    expect(
      await screen.findByText('Outra pessoa salvou a conferência. Recarregue para ver a versão atual antes de salvar de novo.')
    ).toBeInTheDocument()
    expect(mockReopen).not.toHaveBeenCalled()
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
    expect(screen.getByRole('button', { name: 'Salvar e fechar' })).toBeInTheDocument()
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

describe('S7: logística nos estados 2 e 3', () => {
  it('estado 3 (conferência fechada): banner com nome e data, nada editável e sem botões de salvar', async () => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: closedConferenceDoc() })
    await renderForm({ profile: LOGISTICA })

    expect(
      screen.getByText('Conferência fechada por Operador Logística em 24/11/2026. Para corrigir, peça ao COMEX para reabrir.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/Marque o OK\? e a contagem de cada linha conferida/)).not.toBeInTheDocument()
    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText('COMEX: Fechado em 23/11 19:52 por Lucas')).toBeInTheDocument()
    expect(header.getByText('Logística: Fechada em 24/11 16:05 por Operador Logística')).toBeInTheDocument()
    expect(screen.getByLabelText('Conferido por')).toBeDisabled()
    for (const label of [
      'Status do recebimento',
      'Data de recebimento',
      'Nº da NF',
      'Observações',
      'Início da descarga',
      'Fim da descarga',
      'Tempo total da descarga',
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled()
    }
    for (const label of [
      'Salvar e fechar',
      'Salvar e fechar conferência',
      'Reabrir conferência',
      'Reabrir parte do COMEX',
      'Salvar conferência',
      'Descartar',
      'Exportar Excel',
    ]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('textbox', { name: /Etiqueta (WMS|SQ) da linha/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'OK? da linha 3' })?.getAttribute('aria-disabled') ?? 'true').toBe('true')
  })

  it('em rascunho a logística não vê os botões do COMEX', async () => {
    await renderForm({ profile: LOGISTICA })
    for (const label of ['Salvar e fechar', 'Reabrir parte do COMEX', 'Reabrir conferência', 'Exportar Excel', 'Imprimir / Salvar PDF']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeInTheDocument()
  })
})

describe('S4/S7: diálogo ocupado, saídas bloqueadas e tabela ausente', () => {
  it('enquanto fecha, Esc, clique no fundo e "Fechar" não fecham o diálogo; ao terminar ele fecha', async () => {
    let finish
    mockConclude.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ revision: 5, documentId: 'doc-9' })
      })
    )
    const { user } = await renderForm()
    const dialog = await openConcludeDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Salvar e fechar' }))

    expect(await within(dialog).findByRole('button', { name: 'Fechando…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()

    await user.keyboard('{Escape}')
    await user.click(dialog.parentElement)
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    // o Modal fecha com animação de 240 ms: espera passar para pegar um fechamento indevido
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(screen.getByRole('dialog', { name: COMEX_DIALOG })).toBeInTheDocument()
    expect(mockConclude).toHaveBeenCalledTimes(1)

    finish()
    expect(await screen.findByText(/Parte do COMEX fechada e Excel anexado/)).toBeInTheDocument()
    await waitDialogClosed()
  })

  it('fora do estado ocupado, Esc e clique no fundo fecham o diálogo sem fechar', async () => {
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
    expect(notes.some((text) => text.startsWith('A tabela Item x Emb. não está disponível: peso líquido e nº de embalagens vão vazios no relatório fechado'))).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Salvar e fechar' }))
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

// ---------------------------------------------------------------------------
// S6: etiquetas e contagem da logística (doc `conference`) + coluna LOTE SQ sem corte
// ---------------------------------------------------------------------------
describe('S6: logística edita etiquetas e contagem (desktop)', () => {
  const label = (field, row) => screen.getByRole('textbox', { name: `Etiqueta ${field} da linha ${row}` })
  const countOk = (row) => screen.getByRole('checkbox', { name: `Contagem da linha ${row}` })

  it('etiquetas viram campos de texto com o valor da conferência e a contagem alterna como o OK?', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })

    expect(label('WMS', 1)).toHaveValue('WMS-77120')
    expect(label('SQ', 1)).toHaveValue('SQ-001245')
    expect(label('WMS', 3)).toHaveValue('')
    expect(label('WMS', 1)).toHaveAttribute('maxlength', '120')
    expect(countOk(1)).toHaveAttribute('aria-checked', 'true')
    expect(countOk(3)).toHaveAttribute('aria-checked', 'false')
    expect(countOk(3)).not.toHaveAttribute('aria-disabled')
    expect(countOk(3).className).toBe(screen.getByRole('checkbox', { name: 'OK? da linha 3' }).className)

    await user.click(countOk(3))
    expect(countOk(3)).toHaveAttribute('aria-checked', 'true')
    countOk(1).focus()
    await user.keyboard('{Enter}')
    expect(countOk(1)).toHaveAttribute('aria-checked', 'false')
  })

  it('"Salvar conferência" grava OK?, contagem, etiquetas, recebimento e o nome de quem salva no MESMO payload; "Descartar" volta tudo', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ checkedByName: 'Giulia' }) })
    const { user } = await renderForm({ profile: LOGISTICA })
    const save = screen.getByRole('button', { name: 'Salvar conferência' })
    expect(save).toBeDisabled()

    await user.type(label('SQ', 3), '  SQ-003  ')
    await user.click(countOk(3))
    await user.click(screen.getByRole('checkbox', { name: 'OK? da linha 5' }))
    await user.type(screen.getByLabelText('Observações'), 'rascunho de observação')
    expect(save).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(label('SQ', 3)).toHaveValue('')
    expect(countOk(3)).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'OK? da linha 5' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('Observações')).toHaveValue('')
    expect(save).toBeDisabled()

    await user.type(label('WMS', 2), 'W-2B')
    await user.click(save)
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const [, payload] = mockSaveConference.mock.calls[0]
    expect(payload).toMatchObject({
      revision: 3,
      checkedByName: 'Operador Logística',
      okByRowId: { 'r-1': true, 'r-2': true, 'r-4': true },
      countOkByRowId: { 'r-1': true, 'r-4': false },
      labelsByRowId: { 'r-1': { wms: 'WMS-77120', sq: 'SQ-001245' }, 'r-2': { wms: 'WMS-77121W-2B', sq: '' } },
    })
    expect(payload.countOkByRowId).not.toHaveProperty('orfa')
    expect(payload.labelsByRowId).not.toHaveProperty('orfa')
    expect(mockSaveDraft).not.toHaveBeenCalled()
    expect(await screen.findByText(/Conferência salva às \d{2}:\d{2}\./)).toBeInTheDocument()
    // depois de salvar, a tela continua com o que foi gravado e nada fica pendente
    expect(label('WMS', 2)).toHaveValue('WMS-77121W-2B')
    expect(save).toBeDisabled()
  })

  it('só a etiqueta alterada já habilita o salvar (sem tocar em OK?, contagem ou nome)', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ checkedByName: 'Giulia' }) })
    const { user } = await renderForm({ profile: LOGISTICA })
    await user.type(label('WMS', 4), 'W4')
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeEnabled()
    await user.clear(label('WMS', 4))
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeDisabled()
  })

  it('só a Etiqueta SQ alterada (sem tocar em WMS, OK?, contagem ou nome) habilita o salvar e volta a desabilitar ao limpar', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ checkedByName: 'Giulia' }) })
    const { user } = await renderForm({ profile: LOGISTICA })
    const save = screen.getByRole('button', { name: 'Salvar conferência' })
    expect(save).toBeDisabled()

    await user.type(label('SQ', 4), 'SQ-4')
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].labelsByRowId['r-4']).toEqual({ wms: '', sq: 'SQ-4' })

    await user.clear(label('SQ', 4))
    expect(save).toBeEnabled()
  })

  it('só a Etiqueta SQ de uma linha que já tinha etiqueta: editar habilita e restaurar o valor salvo desabilita', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ checkedByName: 'Giulia' }) })
    const { user } = await renderForm({ profile: LOGISTICA })
    const save = screen.getByRole('button', { name: 'Salvar conferência' })

    await user.type(label('SQ', 1), 'X')
    expect(save).toBeEnabled()
    await user.type(label('SQ', 1), '{Backspace}')
    expect(label('SQ', 1)).toHaveValue('SQ-001245')
    expect(save).toBeDisabled()
  })

  it('só a Contagem alterada (sem tocar em etiquetas, OK? ou nome) habilita o salvar e alternar de volta desabilita', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ checkedByName: 'Giulia' }) })
    const { user } = await renderForm({ profile: LOGISTICA })
    const save = screen.getByRole('button', { name: 'Salvar conferência' })
    expect(save).toBeDisabled()

    await user.click(countOk(3))
    expect(save).toBeEnabled()
    await user.click(countOk(3))
    expect(save).toBeDisabled()
  })

  it('conferência de antes da S6 (sem labelsByRowId): as etiquetas das linhas pré-preenchem sem sujar a tela e a contagem antiga não vira OK', async () => {
    const { labelsByRowId: _labels, countOkByRowId: _count, ...legacyConference } = conferenceDoc({ checkedByName: 'Giulia' })
    const legacyRows = [row({ id: 'r-1' }), row({ id: 'r-5', wmsLabel: '', sqLabel: '', count: 40 })]
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ rows: legacyRows }), conference: legacyConference })
    const { user } = await renderForm({ profile: LOGISTICA })

    expect(label('WMS', 1)).toHaveValue('WMS-77120')
    expect(label('SQ', 1)).toHaveValue('SQ-001245')
    expect(label('WMS', 2)).toHaveValue('')
    for (const line of [1, 2]) expect(countOk(line)).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeDisabled()

    // a 1ª gravação persiste o legado
    await user.type(label('WMS', 2), 'W5')
    await user.click(screen.getByRole('button', { name: 'Salvar conferência' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].labelsByRowId).toMatchObject({
      'r-1': { wms: 'WMS-77120', sq: 'SQ-001245' },
      'r-5': { wms: 'W5', sq: '' },
    })
    expect(mockSaveConference.mock.calls[0][1].countOkByRowId).toEqual({})
  })

  it('conferência fechada (estado 3): nada editável para a logística (etiquetas em texto, contagem sem clique)', async () => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: closedConferenceDoc() })
    const { user } = await renderForm({ profile: LOGISTICA })

    expect(screen.queryByRole('textbox', { name: /Etiqueta (WMS|SQ) da linha/ })).not.toBeInTheDocument()
    expect(screen.getByText('WMS-77120')).toBeInTheDocument()
    expect(countOk(1)).toHaveAttribute('aria-disabled', 'true')
    await user.click(countOk(3))
    expect(countOk(3)).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('button', { name: 'Salvar conferência' })).not.toBeInTheDocument()
  })
})

describe('S6: admin vê etiquetas e contagem sem editar', () => {
  it('em rascunho: etiquetas em texto, contagem com aria-disabled e clique não muda nada', async () => {
    const { user } = await renderForm()
    const countOk = (row) => screen.getByRole('checkbox', { name: `Contagem da linha ${row}` })

    expect(screen.queryByRole('textbox', { name: /Etiqueta (WMS|SQ) da linha/ })).not.toBeInTheDocument()
    expect(screen.getByText('WMS-77120')).toBeInTheDocument()
    expect(screen.getByText('SQ-001245')).toBeInTheDocument()
    expect(countOk(1)).toHaveAttribute('aria-checked', 'true')
    expect(countOk(1)).toHaveAttribute('aria-disabled', 'true')

    await user.click(countOk(1))
    await user.click(countOk(3))
    await user.type(countOk(3), '{Enter}{ }')
    expect(countOk(1)).toHaveAttribute('aria-checked', 'true')
    expect(countOk(3)).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('S7: "Conferido por" é só leitura para o admin; salvar o rascunho nunca grava (nem zera) a conferência', async () => {
    const { user } = await renderForm()

    expect(screen.getByLabelText('Conferido por')).toBeDisabled()
    await user.type(screen.getByLabelText('Título no relatório'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('Exportar Excel monta a folha com as etiquetas e a contagem da conferência, não as das linhas', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: [row({ id: 'r-1', wmsLabel: 'LEGADO-W', sqLabel: 'LEGADO-S', count: 99 })] }),
      conference: conferenceDoc(),
    })
    const { user } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }))

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1))
    const sheetRow = mockGenerate.mock.calls[0][0].rows[0]
    expect(sheetRow).toMatchObject({ wmsLabel: 'WMS-77120', sqLabel: 'SQ-001245', countOk: true })
    expect(sheetRow).not.toHaveProperty('count')
  })
})

describe('S6: logística no mobile', () => {
  it('o selo da contagem alterna como o do OK? e as etiquetas são campos de texto', async () => {
    const { user } = await renderForm({ profile: LOGISTICA, variant: 'mobile' })

    const toggle = screen.getByRole('checkbox', { name: 'Contagem da linha 3' })
    expect(toggle).toHaveTextContent('Sem OK')
    expect(toggle.className).toBe(screen.getByRole('checkbox', { name: 'OK? da linha 3' }).className)
    expect(toggle).toHaveClass('inline-badge', 'crf-rc__ok')
    expect(screen.getByRole('checkbox', { name: 'Contagem da linha 1' })).toHaveTextContent('OK')

    await user.click(toggle)
    expect(screen.getByRole('checkbox', { name: 'Contagem da linha 3' })).toHaveTextContent('OK')

    const sq = screen.getByRole('textbox', { name: 'Etiqueta SQ da linha 3' })
    await user.type(sq, 'SQ-3')
    expect(sq).toHaveValue('SQ-3')
    expect(screen.getByRole('textbox', { name: 'Etiqueta WMS da linha 1' })).toHaveValue('WMS-77120')
  })

  it('admin no mobile vê o selo da contagem sem botão e as etiquetas em texto', async () => {
    await renderForm({ variant: 'mobile' })
    expect(screen.queryByRole('checkbox', { name: 'Contagem da linha 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Etiqueta (WMS|SQ) da linha/ })).not.toBeInTheDocument()
    expect(screen.getByText('WMS-77120')).toBeInTheDocument()
  })
})

describe('S6/S7: Salvar e fechar (COMEX) relê a conferência no servidor', () => {
  beforeEach(() => {
    mockConclude.mockResolvedValue({ revision: 5, documentId: 'doc-9' })
  })

  it('conferência com revisão maior no servidor: mostra o aviso com "Recarregar" e não anexa nem envia nada', async () => {
    const { user } = await renderForm()
    // depois da carga inicial a logística salvou de novo (revisão 3 > 2)
    mockGetCargoReport.mockResolvedValue({ current: currentDoc(), conference: conferenceDoc({ revision: 3 }) })

    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))

    expect(
      await screen.findByText(
        'A logística salvou a conferência depois que você abriu o relatório. Recarregue para ver o OK?, as etiquetas e a contagem antes de fechar.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(mockConclude).not.toHaveBeenCalled()
    expect(mockSaveConference).not.toHaveBeenCalled()
    await waitDialogClosed()
  })

  it('revisão igual no servidor: fecha normalmente', async () => {
    const { user } = await renderForm()
    await user.click(within(await openConcludeDialog(user)).getByRole('button', { name: 'Salvar e fechar' }))
    await waitFor(() => expect(mockConclude).toHaveBeenCalledTimes(1))
    expect(mockGetCargoReport).toHaveBeenCalledTimes(2)
    expect(mockGenerate.mock.calls[0][0].rows[0]).toMatchObject({ wmsLabel: 'WMS-77120', countOk: true })
  })
})

describe('S6: coluna LOTE SQ sem corte (largura do <col> pelo maior lote)', () => {
  // S9-B: em edicao (admin) a tabela ganha a coluna # antes das 14 de sempre e a coluna do menu depois.
  const lotSqCol = (container) => container.querySelectorAll('colgroup col')[7]
  const lotSqCells = (container) => [...container.querySelectorAll('tbody tr[data-row-index] td:nth-child(8)')]
  const withLots = (lots, po = 'GOO 021-26') =>
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc({ rows: lots.map((supplierLot, index) => row({ id: `r-${index + 1}`, po, supplierLot })) }),
      conference: conferenceDoc(),
    })

  it('lote de 20 + 3 caracteres: largura calc(29.9ch + 20px), célula lotsq em uma linha', async () => {
    withLots(['2609G00020GOWMWM8888'])
    const { container } = await renderForm()

    expect(lotSqCol(container).style.width).toBe('calc(29.9ch + 20px)')
    const [cell] = lotSqCells(container)
    expect(cell).toHaveTextContent('2609G00020GOWMWM8888GOO')
    expect(cell).toHaveClass('calc', 'lotsq')
    expect(cell).not.toHaveClass('is-long')
  })

  it('lote curto ou vazio usa o mínimo de 13 caracteres: calc(16.9ch + 20px)', async () => {
    const first = await renderForm()
    expect(lotSqCol(first.container).style.width).toBe('calc(16.9ch + 20px)')
    first.unmount()

    withLots([''])
    const second = await renderForm()
    expect(lotSqCol(second.container).style.width).toBe('calc(16.9ch + 20px)')
    expect(lotSqCells(second.container)[0]).toHaveClass('empty')
  })

  it('o exemplo do Lucas (2609G00020GOO, 13 caracteres) cabe no mínimo', async () => {
    withLots(['2609G00020'], 'GOO 021-26')
    const { container } = await renderForm()
    expect(lotSqCells(container)[0]).toHaveTextContent('2609G00020GOO')
    expect(lotSqCol(container).style.width).toBe('calc(16.9ch + 20px)')
  })

  it('lote de 60 caracteres: largura máxima (40 × 1,3 = calc(52.0ch + 20px)) e célula is-long, que quebra sem cortar', async () => {
    withLots(['L'.repeat(60)])
    const { container } = await renderForm()

    expect(lotSqCol(container).style.width).toBe('calc(52.0ch + 20px)')
    expect(lotSqCells(container)[0]).toHaveClass('calc', 'lotsq', 'is-long')
    expect(lotSqCells(container)[0]).toHaveTextContent(`${'L'.repeat(60)}GOO`)
  })

  it('as demais colunas continuam em px', async () => {
    const { container } = await renderForm()
    const widths = [...container.querySelectorAll('colgroup col')].map((col) => col.style.width)
    expect(widths[6]).toBe('112px')
    expect(widths[1]).toBe('172px') // S9-C: PO / PROCESSO traz a referência do processo (mais larga que o número)
    expect(widths[0]).toBe('36px')
    expect(widths[15]).toBe('52px')
    expect(widths).toHaveLength(16)
  })
})

// ---------------------------------------------------------------------------
// S7: logística fecha a conferência (estado 2) e etiquetas em MAIÚSCULAS
// ---------------------------------------------------------------------------
describe('S7: logística fecha a conferência (estado 2)', () => {
  const todayKey = () => toCargoDateKey(new Date())
  const todayBr = () => formatCargoDateBr(todayKey())

  beforeEach(() => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: conferenceDoc() })
    mockClose.mockResolvedValue({ revision: 3, documentId: 'doc-log-9' })
  })

  async function openCloseDialog(user) {
    await user.click(screen.getByRole('button', { name: 'Salvar e fechar conferência' }))
    return screen.findByRole('dialog', { name: CLOSE_DIALOG })
  }

  async function fillReceipt(user) {
    await user.selectOptions(screen.getByLabelText('Status do recebimento'), 'com_ressalva')
    fireEvent.change(screen.getByLabelText('Início da descarga'), { target: { value: '2026-11-22T08:15' } })
    await user.type(screen.getByLabelText('Nº da NF'), '000.123.456')
    await user.type(screen.getByLabelText('Observações'), 'Palete 3 avariado')
  }

  it('selos, banner, 3 botões; edita OK?, contagem, etiquetas e recebimento; Conferido por é só leitura com o próprio nome', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })

    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText(/^COMEX: Fechado em 23\/11 19:52 por Lucas$/)).toHaveClass('inline-badge--ok')
    expect(header.getByText('Logística: Em conferência')).toHaveClass('inline-badge--warn')
    expect(
      screen.getByText('O COMEX fechou a parte dele. Confira os itens, preencha o recebimento e use "Salvar e fechar conferência".')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Salvar e fechar conferência' })).toHaveClass('primary-button', 'crf-bar__wide')
    expect(screen.getByRole('button', { name: 'Salvar e fechar conferência' })).toBeEnabled()
    expect(screen.getByText('Você marca o OK? e a contagem, preenche as etiquetas e os dados do recebimento. As demais colunas são só do COMEX.')).toBeInTheDocument()

    expect(screen.getByLabelText('Conferido por')).toBeDisabled()
    expect(screen.getByLabelText('Conferido por')).toHaveValue('Operador Logística')
    expect(screen.getByLabelText('Título no relatório')).toBeDisabled()
    await fillReceipt(user)
    await user.click(screen.getByRole('checkbox', { name: 'OK? da linha 3' }))
    await user.type(screen.getByRole('textbox', { name: 'Etiqueta WMS da linha 3' }), 'w3')
    expect(screen.getByLabelText('Observações')).toHaveValue('Palete 3 avariado')
    expect(screen.getByRole('textbox', { name: 'Etiqueta WMS da linha 3' })).toHaveValue('W3')
  })

  it('o diálogo mostra a lista, o nome do processo e as pendências (não bloqueiam)', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    const dialog = await openCloseDialog(user)

    expect(dialog).toHaveTextContent('O Portal vai gerar o Excel do FR.CMX.001 com a sua conferência e anexar ao processo ACME SEA 021-26 como Relatório de carga.')
    expect(dialog).toHaveTextContent('Gera o Excel do FR.CMX.001 com OK?, contagem, etiquetas e recebimento e anexa como nova versão do Relatório de carga.')
    expect(dialog).toHaveTextContent('O Portal guarda as 2 últimas versões: a versão do COMEX vira "versão anterior".')
    expect(dialog).toHaveTextContent('Envia o aviso da conferência por e-mail para Comex, Técnico, Logística e Faturamento/fiscal (e-mail próprio da conferência) e um aviso no Portal para os destinatários do relatório.')
    expect(dialog).toHaveTextContent('A conferência fica fechada. Para corrigir, peça ao COMEX para reabrir.')
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Pendências: 2 linhas sem OK?, 4 linhas sem contagem, Status do recebimento não informado, Início da descarga não informado, Etiquetagem sem OK. Dá para fechar assim.'
    )
    expect(within(dialog).getByRole('button', { name: 'Salvar e fechar conferência' })).toHaveClass('primary-button')
  })

  it('sem pendências o diálogo não mostra o aviso', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: concludedDoc({ rows: [CONCLUDED_ROWS[0]] }),
      conference: conferenceDoc({
        receiptStatus: 'sem_ressalva',
        countOkByRowId: { 'r-1': true },
        unloadStartAt: '2026-11-24T08:15',
        unloadEndAt: '2026-11-24T10:40',
        receivedDate: '2026-11-24',
        labelingOk: true,
      }),
    })
    const { user } = await renderForm({ profile: LOGISTICA })
    const dialog = await openCloseDialog(user)
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument()
  })

  it('Cancelar fecha o diálogo e não chama nada', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    const dialog = await openCloseDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitDialogClosed(CLOSE_DIALOG)
    expect(mockClose).not.toHaveBeenCalled()
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('confirmar gera o Excel com a conferência e o rodapé, anexa pela logística e fecha (estado 3)', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    await fillReceipt(user)
    await user.click(await within(await openCloseDialog(user)).findByRole('button', { name: 'Salvar e fechar conferência' }))

    await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1))
    const [processId, args] = mockClose.mock.calls[0]
    expect(processId).toBe('p1')
    expect(args.actor).toBe(LOGISTICA)
    expect(args.category).toBe('FCL')
    expect(args.currentRevision).toBe(6)
    expect(args.file.name).toBe(PORTAL_FILE_NAME)
    expect(args.payload).toMatchObject({
      status: 'fechada',
      revision: 3,
      checkedByName: 'Operador Logística',
      closedDate: todayKey(),
      closedById: 'log-1',
      closedByName: 'Operador Logística',
      closedDocumentId: '',
      receiptStatus: 'com_ressalva',
      receivedDate: '2026-11-22',
      unloadStartAt: '2026-11-22T08:15',
      unloadEndAt: '',
      labelingOk: false,
      nfNumber: '000.123.456',
      notes: 'Palete 3 avariado',
    })
    expect(Object.keys(args.payload)).toHaveLength(18)
    expect(args.payload.okByRowId).not.toHaveProperty('orfa')

    // O arquivo anexado leva a conferência fechada: nome, rodapé e DATA CONCLUSÃO = dia do fechamento.
    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      checkedByName: 'Operador Logística',
      notes: 'Palete 3 avariado',
      receiptStatus: 'com_ressalva',
      receivedDateBr: '22/11/2026',
      nfNumber: '000.123.456',
      completedDateBr: todayBr(),
    })
    expect(mockGenerate.mock.calls[0][0].rows[0]).toMatchObject({ wmsLabel: 'WMS-77120', countOk: true, netWeightKg: 25 })
    expect(mockGenerate.mock.invocationCallOrder[0]).toBeLessThan(mockClose.mock.invocationCallOrder[0])
    expect(mockSaveConference).not.toHaveBeenCalled()
    expect(mockSaveDraft).not.toHaveBeenCalled()

    expect(
      await screen.findByText(
        'Conferência fechada e Excel anexado como nova versão. O aviso da conferência foi enviado aos destinatários do Relatório de carga.'
      )
    ).toBeInTheDocument()
    await waitDialogClosed(CLOSE_DIALOG)
    const header = within(screen.getByLabelText('Cabeçalho do relatório'))
    expect(header.getByText(/^Logística: Fechada em \d{2}\/\d{2} \d{2}:\d{2} por Operador Logística$/)).toHaveClass('inline-badge--ok')
    expect(
      screen.getByText(`Conferência fechada por Operador Logística em ${todayBr()}. Para corrigir, peça ao COMEX para reabrir.`)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar e fechar conferência' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar conferência' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Observações')).toBeDisabled()
  })

  it('o COMEX alterou ou reabriu o relatório (conflito de current): texto próprio, "Recarregar" e nada gravado', async () => {
    mockClose.mockRejectedValue(
      Object.assign(new Error('revision-conflict'), { code: 'cargoReport/revision-conflict', scope: 'current' })
    )
    const { user } = await renderForm({ profile: LOGISTICA })
    await user.click(within(await openCloseDialog(user)).getByRole('button', { name: 'Salvar e fechar conferência' }))

    expect(
      await screen.findByText('O COMEX alterou ou reabriu o relatório depois que você abriu. Recarregue antes de fechar a conferência.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recarregar' }))
    await waitFor(() => expect(mockGetCargoReport).toHaveBeenCalledTimes(2))
    expect(mockRetryClose).not.toHaveBeenCalled()
  })

  it('revisão da conferência diferente no servidor: texto do conflito da conferência com "Recarregar"', async () => {
    mockClose.mockRejectedValue(
      Object.assign(new Error('revision-conflict'), { code: 'cargoReport/revision-conflict', scope: 'conference' })
    )
    const { user } = await renderForm({ profile: LOGISTICA })
    await user.click(within(await openCloseDialog(user)).getByRole('button', { name: 'Salvar e fechar conferência' }))

    expect(
      await screen.findByText('Outra pessoa salvou a conferência. Recarregue para ver a versão atual antes de salvar de novo.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })

  it('anexado mas a conferência não foi marcada como fechada: "Gravar de novo" grava sem anexar de novo', async () => {
    mockClose.mockRejectedValue(
      Object.assign(new Error('attached-not-saved'), {
        code: 'cargoReport/attached-not-saved',
        documentId: 'doc-log-9',
        cause: Object.assign(new Error('offline'), { code: 'unavailable' }),
      })
    )
    mockRetryClose.mockResolvedValue({ revision: 3, documentId: 'doc-log-9' })
    const { user } = await renderForm({ profile: LOGISTICA })
    await user.click(within(await openCloseDialog(user)).getByRole('button', { name: 'Salvar e fechar conferência' }))

    expect(
      await screen.findByText('O Excel foi anexado e o aviso enviado, mas a conferência não foi marcada como fechada.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gravar de novo' }))

    await waitFor(() => expect(mockRetryClose).toHaveBeenCalledTimes(1))
    const [processId, args] = mockRetryClose.mock.calls[0]
    expect(processId).toBe('p1')
    expect(args).toMatchObject({ documentId: 'doc-log-9', actor: LOGISTICA })
    expect(args.payload).toMatchObject({ status: 'fechada', revision: 3 })
    expect(mockClose).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Conferência fechada e Excel anexado como nova versão/)).toBeInTheDocument()
  })

  it('falha ao gerar o Excel mostra o erro e não anexa nem grava', async () => {
    mockGenerate.mockRejectedValue(new Error('Failed to fetch'))
    const { user } = await renderForm({ profile: LOGISTICA })
    await user.click(within(await openCloseDialog(user)).getByRole('button', { name: 'Salvar e fechar conferência' }))

    expect(await screen.findByText(/Não foi possível salvar e fechar a conferência\./)).toBeInTheDocument()
    expect(mockClose).not.toHaveBeenCalled()
    await waitDialogClosed(CLOSE_DIALOG)
  })

  it('enquanto fecha, o diálogo mostra "Fechando…" e não fecha por Esc', async () => {
    let finish
    mockClose.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ revision: 3, documentId: 'doc-log-9' })
      })
    )
    const { user } = await renderForm({ profile: LOGISTICA })
    const dialog = await openCloseDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Salvar e fechar conferência' }))

    expect(await within(dialog).findByRole('button', { name: 'Fechando…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    await user.keyboard('{Escape}')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.getByRole('dialog', { name: CLOSE_DIALOG })).toBeInTheDocument()

    finish()
    expect(await screen.findByText(/Conferência fechada e Excel anexado como nova versão/)).toBeInTheDocument()
    await waitDialogClosed(CLOSE_DIALOG)
  })

  it('no mobile o botão principal ocupa a largura toda (crf-bar__wide) e Descartar/Salvar ficam na linha de cima', async () => {
    await renderForm({ profile: LOGISTICA, variant: 'mobile' })

    expect(screen.getByRole('button', { name: 'Salvar e fechar conferência' })).toHaveClass('primary-button', 'crf-bar__wide')
    expect(screen.getByRole('button', { name: 'Descartar' })).not.toHaveClass('crf-bar__wide')
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).not.toHaveClass('crf-bar__wide')
    expect(screen.getByLabelText('Conferido por')).toBeDisabled()
  })
})

describe('S7: etiquetas WMS e SQ em MAIÚSCULAS na digitação', () => {
  const wmsOf = (row) => screen.getByRole('textbox', { name: `Etiqueta WMS da linha ${row}` })
  const sqOf = (row) => screen.getByRole('textbox', { name: `Etiqueta SQ da linha ${row}` })

  it('desktop: digitar abc vira ABC e ç/ã viram Ç/Ã', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })

    await user.type(wmsOf(3), 'abc')
    expect(wmsOf(3)).toHaveValue('ABC')
    await user.type(sqOf(3), 'ação-ç')
    expect(sqOf(3)).toHaveValue('AÇÃO-Ç')
  })

  it('desktop: digitar no meio do texto mantém o cursor depois da letra digitada', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })

    await user.type(wmsOf(3), 'abc')
    await user.type(wmsOf(3), 'x', { initialSelectionStart: 1, initialSelectionEnd: 1 })
    expect(wmsOf(3)).toHaveValue('AXBC')
    expect(wmsOf(3).selectionStart).toBe(2)
    expect(wmsOf(3).selectionEnd).toBe(2)
  })

  it('mobile: digitar na Etiqueta SQ da linha 3 também vira maiúsculas, com o cursor no lugar', async () => {
    const { user } = await renderForm({ profile: LOGISTICA, variant: 'mobile' })

    await user.type(sqOf(3), 'abc')
    expect(sqOf(3)).toHaveValue('ABC')
    await user.type(sqOf(3), 'x', { initialSelectionStart: 1, initialSelectionEnd: 1 })
    expect(sqOf(3)).toHaveValue('AXBC')
    expect(sqOf(3).selectionStart).toBe(2)
  })

  it('durante a composição (IME) o valor cru passa e a conversão vem ao terminar', async () => {
    await renderForm({ profile: LOGISTICA })
    const input = wmsOf(3)

    fireEvent.input(input, { target: { value: 'a' }, isComposing: true })
    expect(input).toHaveValue('a')
    fireEvent.compositionEnd(input)
    expect(input).toHaveValue('A')
  })

  it('o payload gravado já leva as etiquetas em maiúsculas', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })

    await user.type(wmsOf(3), 'wms-ç1')
    await user.click(screen.getByRole('button', { name: 'Salvar conferência' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1].labelsByRowId['r-3']).toEqual({ wms: 'WMS-Ç1', sq: '' })
  })

  it('etiqueta minúscula já gravada (legado) aparece em maiúsculas para o admin e para a logística', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: currentDoc(),
      conference: conferenceDoc({ labelsByRowId: { 'r-1': { wms: 'wms-ç1', sq: 'sq-ã1' } } }),
    })
    const first = await renderForm()
    expect(screen.getByText('WMS-Ç1')).toBeInTheDocument()
    expect(screen.getByText('SQ-Ã1')).toBeInTheDocument()
    first.unmount()

    await renderForm({ profile: LOGISTICA })
    expect(wmsOf(1)).toHaveValue('WMS-Ç1')
    expect(sqOf(1)).toHaveValue('SQ-Ã1')
  })
})

describe('S8: descarga, data de recebimento fixa e etiquetagem', () => {
  const group = () => screen.getByRole('group', { name: 'Descarga e etiquetagem' })
  const etiquetagem = () => screen.getByRole('checkbox', { name: 'Etiquetagem' })
  const setStart = (value) => fireEvent.change(screen.getByLabelText('Início da descarga'), { target: { value } })
  const setEnd = (value) => fireEvent.change(screen.getByLabelText('Fim da descarga'), { target: { value } })

  beforeEach(() => {
    mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: conferenceDoc() })
  })

  it('logística no estado 2: início e fim editáveis, tempo total só leitura e Etiquetagem "Sem OK"', async () => {
    await renderForm({ profile: LOGISTICA })

    expect(group()).toBeInTheDocument()
    expect(screen.getByLabelText('Início da descarga')).toBeEnabled()
    expect(screen.getByLabelText('Início da descarga')).toHaveAttribute('type', 'datetime-local')
    expect(screen.getByLabelText('Fim da descarga')).toBeEnabled()
    const total = screen.getByLabelText('Tempo total da descarga')
    expect(total).toBeDisabled()
    expect(total).toHaveAttribute('readonly')
    expect(total).toHaveAttribute('placeholder', '—')
    expect(screen.getByText(/Calculado: fim menos início\./)).toBeInTheDocument()
    expect(etiquetagem()).toHaveAttribute('aria-checked', 'false')
    expect(etiquetagem()).toHaveTextContent('Sem OK')
    expect(screen.getByText('Marque quando as etiquetas estiverem coladas.')).toBeInTheDocument()
  })

  it('ordem dos campos: linha 1 (Conferido por, Status, Nº da NF, Data de recebimento) e linha 2 (Início, Fim, Tempo total, Etiquetagem)', async () => {
    await renderForm({ profile: LOGISTICA })

    const card = screen.getByLabelText('Responsáveis e recebimento')
    const rows = [...card.querySelectorAll(':scope > .crf-foot')]
    expect(rows).toHaveLength(2)
    expect(rows[1]).toBe(group())
    const labelsOf = (row) =>
      [...row.querySelectorAll(':scope > .crf-field')].map((field) => field.querySelector('label, span').textContent)
    expect(labelsOf(rows[0])).toEqual(['Conferido por', 'Status do recebimento', 'Nº da NF', 'Data de recebimento'])
    expect(labelsOf(rows[1])).toEqual(['Início da descarga', 'Fim da descarga', 'Tempo total da descarga', 'Etiquetagem'])
    // As Observações vêm depois dos dois grupos.
    const notes = screen.getByLabelText('Observações')
    expect(rows[1].compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('"Data de recebimento" é fixa: travada, sem type=date, traço sem início e o dia do início depois', async () => {
    await renderForm({ profile: LOGISTICA })

    const date = screen.getByLabelText('Data de recebimento')
    expect(date).toBeDisabled()
    expect(date).toHaveAttribute('readonly')
    expect(date).not.toHaveAttribute('type', 'date')
    expect(date).toHaveAttribute('placeholder', '—')
    expect(date).toHaveValue('')
    expect(screen.getByText(/Fixo: dia da descarga/)).toBeInTheDocument()

    setStart('2026-11-24T08:15')
    expect(screen.getByLabelText('Data de recebimento')).toHaveValue('24/11/2026')
    setStart('')
    expect(screen.getByLabelText('Data de recebimento')).toHaveValue('')
  })

  it('fim preenchido mostra o tempo total em minutos; Etiquetagem liga o OK e habilita salvar; o payload leva tudo', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    const save = screen.getByRole('button', { name: 'Salvar conferência' })
    expect(save).toBeDisabled()

    // O seletor nativo do Fim só aceita a partir do início (atributo `min`); sem início, sem `min`.
    expect(screen.getByLabelText('Fim da descarga')).not.toHaveAttribute('min')
    setStart('2026-11-24T08:15')
    expect(screen.getByLabelText('Fim da descarga')).toHaveAttribute('min', '2026-11-24T08:15')
    setEnd('2026-11-24T10:40')
    expect(screen.getByLabelText('Tempo total da descarga')).toHaveValue('145 min')

    await user.click(etiquetagem())
    expect(etiquetagem()).toHaveAttribute('aria-checked', 'true')
    expect(etiquetagem()).toHaveTextContent('OK')
    expect(save).toBeEnabled()

    await user.click(save)
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1]).toMatchObject({
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      receivedDate: '2026-11-24',
      labelingOk: true,
    })
    expect(Object.keys(mockSaveConference.mock.calls[0][1])).not.toContain('unloadMinutes')
    expect(await screen.findByText(/Conferência salva às \d{2}:\d{2}\./)).toBeInTheDocument()
    expect(save).toBeDisabled()
  })

  it('só marcar a Etiquetagem já suja a conferência; "Descartar" desfaz', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    await user.click(etiquetagem())
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(etiquetagem()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Salvar conferência' })).toBeDisabled()
  })

  it('doc anterior com receivedDate e sem início: mostra o valor gravado; salvar sem início mantém; informar o início troca', async () => {
    mockGetCargoReport.mockResolvedValue({
      current: concludedDoc(),
      conference: conferenceDoc({ receivedDate: '2026-11-20' }),
    })
    const { user } = await renderForm({ profile: LOGISTICA })

    expect(screen.getByLabelText('Data de recebimento')).toHaveValue('20/11/2026')
    expect(screen.getByLabelText('Data de recebimento')).toBeDisabled()
    await user.type(screen.getByLabelText('Nº da NF'), '1')
    await user.click(screen.getByRole('button', { name: 'Salvar conferência' }))
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1]).toMatchObject({ receivedDate: '2026-11-20', unloadStartAt: '' })

    setStart('2026-11-24T08:15')
    expect(screen.getByLabelText('Data de recebimento')).toHaveValue('24/11/2026')
  })

  it('fim antes do início: mensagem no campo Fim, aria-invalid, aria-describedby e salvar bloqueado', async () => {
    const { user } = await renderForm({ profile: LOGISTICA })
    setStart('2026-11-24T10:40')
    setEnd('2026-11-24T08:15')

    const message = screen.getByText('O fim da descarga deve ser igual ou posterior ao início.')
    const end = screen.getByLabelText('Fim da descarga')
    expect(end).toHaveAttribute('aria-invalid', 'true')
    expect(end.getAttribute('aria-describedby')).toContain(message.id)
    expect(message).toHaveClass('field-error')
    expect(screen.getByLabelText('Início da descarga')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Tempo total da descarga')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Salvar conferência' }))
    expect(screen.getByText('Corrija o horário da descarga antes de salvar.')).toBeInTheDocument()
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('fim sem início: erro no campo Início; mais de 24 h: erro no campo Fim', async () => {
    await renderForm({ profile: LOGISTICA })
    setEnd('2026-11-24T10:40')
    expect(screen.getByText('Informe o início da descarga.')).toBeInTheDocument()
    expect(screen.getByLabelText('Início da descarga')).toHaveAttribute('aria-invalid', 'true')

    setStart('2026-11-23T08:00')
    expect(screen.queryByText('Informe o início da descarga.')).not.toBeInTheDocument()
    setEnd('2026-11-25T08:01')
    expect(screen.getByText('A descarga passa de 24 horas. Confira as datas.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fim da descarga')).toHaveAttribute('aria-invalid', 'true')
    // Com erro (também o de mais de 24 h) o tempo total fica vazio.
    expect(screen.getByLabelText('Tempo total da descarga')).toHaveValue('')
  })

  describe('diálogo "Salvar e fechar conferência"', () => {
    const openDialog = async (user) => {
      await user.click(screen.getByRole('button', { name: 'Salvar e fechar conferência' }))
      return screen.findByRole('dialog', { name: CLOSE_DIALOG })
    }

    it('lista as pendências da descarga e da etiquetagem; nunca "Data de recebimento"', async () => {
      const { user } = await renderForm({ profile: LOGISTICA })
      const dialog = await openDialog(user)
      const note = within(dialog).getByRole('note')
      expect(note).toHaveTextContent('Início da descarga não informado')
      expect(note).toHaveTextContent('Etiquetagem sem OK')
      expect(note).not.toHaveTextContent('Fim da descarga não informado')
      expect(note).not.toHaveTextContent(/Data de recebimento/)
    })

    it('com início e sem fim, a pendência do fim aparece e a do início não', async () => {
      const { user } = await renderForm({ profile: LOGISTICA })
      setStart('2026-11-24T08:15')
      const note = within(await openDialog(user)).getByRole('note')
      expect(note).toHaveTextContent('Fim da descarga não informado')
      expect(note).not.toHaveTextContent('Início da descarga não informado')
    })

    it('descarga e etiquetagem preenchidas não geram pendência dessas áreas', async () => {
      const { user } = await renderForm({ profile: LOGISTICA })
      setStart('2026-11-24T08:15')
      setEnd('2026-11-24T10:40')
      await user.click(etiquetagem())
      const note = within(await openDialog(user)).getByRole('note')
      expect(note).not.toHaveTextContent(/descarga não informado|Etiquetagem sem OK/)
      expect(note).toHaveTextContent('Status do recebimento não informado')
    })

    it('descarga inválida bloqueia: o diálogo nem abre e o feedback explica', async () => {
      const { user } = await renderForm({ profile: LOGISTICA })
      setStart('2026-11-24T10:40')
      setEnd('2026-11-24T08:15')
      await user.click(screen.getByRole('button', { name: 'Salvar e fechar conferência' }))
      expect(screen.queryByRole('dialog', { name: CLOSE_DIALOG })).not.toBeInTheDocument()
      expect(screen.getByText('Corrija o horário da descarga antes de salvar.')).toBeInTheDocument()
      expect(mockClose).not.toHaveBeenCalled()
    })

    it('confirmar leva a descarga e a data derivada ao payload e à folha do Excel', async () => {
      mockClose.mockResolvedValue({ revision: 3, documentId: 'doc-log-9' })
      const { user } = await renderForm({ profile: LOGISTICA })
      setStart('2026-11-24T08:15')
      setEnd('2026-11-24T10:40')
      await user.click(etiquetagem())
      await user.click(within(await openDialog(user)).getByRole('button', { name: 'Salvar e fechar conferência' }))

      await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1))
      expect(mockClose.mock.calls[0][1].payload).toMatchObject({
        unloadStartAt: '2026-11-24T08:15',
        unloadEndAt: '2026-11-24T10:40',
        receivedDate: '2026-11-24',
        labelingOk: true,
      })
      expect(mockGenerate.mock.calls[0][0]).toMatchObject({
        receivedDateBr: '24/11/2026',
        unloadSummary: 'DESCARGA: 24/11/2026, 08:15 ÀS 10:40 · TEMPO TOTAL: 145 MIN',
        labelingOk: true,
      })
    })
  })

  describe('somente leitura', () => {
    const FILLED = {
      unloadStartAt: '2026-11-24T08:15',
      unloadEndAt: '2026-11-24T10:40',
      receivedDate: '2026-11-24',
      labelingOk: true,
    }

    it('estado 3 (logística): campos travados, tempo total e data visíveis, Etiquetagem sem botão', async () => {
      mockGetCargoReport.mockResolvedValue({ current: concludedDoc(), conference: closedConferenceDoc(FILLED) })
      await renderForm({ profile: LOGISTICA })

      for (const label of ['Início da descarga', 'Fim da descarga']) expect(screen.getByLabelText(label)).toBeDisabled()
      expect(screen.getByLabelText('Início da descarga')).toHaveValue('2026-11-24T08:15')
      expect(screen.getByLabelText('Tempo total da descarga')).toHaveValue('145 min')
      expect(screen.getByLabelText('Data de recebimento')).toHaveValue('24/11/2026')
      expect(screen.queryByRole('checkbox', { name: 'Etiquetagem' })).not.toBeInTheDocument()
      expect(within(group()).getByText('OK')).toBeInTheDocument()
    })

    it('admin (qualquer estado): campos travados e "Sem OK" sem botão', async () => {
      await renderForm()
      for (const label of ['Início da descarga', 'Fim da descarga', 'Tempo total da descarga', 'Data de recebimento']) {
        expect(screen.getByLabelText(label)).toBeDisabled()
      }
      expect(screen.queryByRole('checkbox', { name: 'Etiquetagem' })).not.toBeInTheDocument()
      expect(within(group()).getByText('Sem OK')).toBeInTheDocument()
    })

    it('erro de descarga não aparece para quem não edita', async () => {
      mockGetCargoReport.mockResolvedValue({
        current: concludedDoc(),
        conference: closedConferenceDoc({ unloadStartAt: '2026-11-24T10:40', unloadEndAt: '2026-11-24T08:15', receivedDate: '2026-11-24' }),
      })
      await renderForm({ profile: LOGISTICA })
      expect(screen.queryByText('O fim da descarga deve ser igual ou posterior ao início.')).not.toBeInTheDocument()
    })
  })

  it('mobile: os mesmos campos; data de recebimento só leitura e Etiquetagem interativa', async () => {
    const { user } = await renderForm({ profile: LOGISTICA, variant: 'mobile' })

    for (const label of ['Início da descarga', 'Fim da descarga']) expect(screen.getByLabelText(label)).toBeEnabled()
    expect(screen.getByLabelText('Data de recebimento')).toBeDisabled()
    expect(screen.getByLabelText('Tempo total da descarga')).toBeDisabled()
    expect(etiquetagem()).toHaveClass('inline-badge', 'crf-rc__ok')
    await user.click(etiquetagem())
    expect(etiquetagem()).toHaveAttribute('aria-checked', 'true')
    // O selo dos cartões continua o mesmo componente: mesmas classes do OK? da linha.
    expect(etiquetagem().className).toBe(screen.getByRole('checkbox', { name: 'OK? da linha 3' }).className.replace('documents-badge--neutral', 'inline-badge--ok'))
  })
})

// ---------------------------------------------------------------------------
// S9-B: linhas e lotes em qualquer ponto (menu ⋯), dividir, desfazer, mover entre POs, consolidado agrupado
// ---------------------------------------------------------------------------
describe('S9-B: menu ⋯ por linha (admin, rascunho aberto)', () => {
  const openRowMenu = async (user, number) => {
    await user.click(screen.getByRole('button', { name: `Ações da linha ${number}` }))
    return screen.getByRole('menu', { name: `Ações da linha ${number}` })
  }
  const pick = async (user, name) => user.click(screen.getByRole('menuitem', { name }))
  const sqValues = () => screen.getAllByLabelText(/^Descrição SQ da linha/).map((input) => input.value)

  it('admin no estágio 1 (desktop) vê a coluna # e o botão ⋯ de cada linha', async () => {
    await renderForm()
    expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument()
    for (const number of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole('button', { name: `Ações da linha ${number}` })).toHaveAttribute('aria-haspopup', 'menu')
    }
    expect(screen.queryByRole('button', { name: 'Ações da linha 6' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar linha no fim' })).toBeInTheDocument()
    expect(screen.getByText(/Qtd total:/)).toHaveTextContent('Qtd total: 21.800 kg')
  })

  it('a logística e os estágios 2 e 3 NÃO veem # nem ⋯', async () => {
    const logistics = await renderForm({ profile: LOGISTICA })
    expect(screen.queryByRole('columnheader', { name: '#' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Ações da linha/ })).not.toBeInTheDocument()
    logistics.unmount()

    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ status: 'concluido' }), conference: conferenceDoc() })
    await renderForm()
    expect(screen.queryByRole('columnheader', { name: '#' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Ações da linha/ })).not.toBeInTheDocument()
  })

  it('Linha abaixo insere uma linha vazia com o PO da linha, na posição certa e com o foco nela', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, 'Linha abaixo')

    expect(screen.getAllByLabelText(/^PO \/ processo da linha/)).toHaveLength(6)
    expect(screen.getByLabelText('PO / processo da linha 2')).toHaveValue('4500123')
    expect(screen.getByLabelText('Descrição SQ da linha 2')).toHaveValue('')
    expect(screen.getByLabelText('Descrição SQ da linha 3')).toHaveValue('DEGALAN 64/12 N - CX 25KG')
    expect(screen.getByLabelText('PO / processo da linha 2')).toHaveFocus()
  })

  it('Linha acima insere antes; Duplicar copia a linha sem o lote', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, 'Linha acima')
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('')
    expect(screen.getByLabelText('Descrição SQ da linha 2')).toHaveValue('DEA FOAM14339 - BB 25KG')

    await openRowMenu(user, 2)
    await pick(user, 'Duplicar (outro lote)')
    expect(screen.getAllByLabelText(/^Descrição SQ da linha/)).toHaveLength(7)
    expect(screen.getByLabelText('Descrição SQ da linha 3')).toHaveValue('DEA FOAM14339 - BB 25KG')
    expect(screen.getByLabelText('Lote fornecedor da linha 2')).toHaveValue('DF2406A')
    expect(screen.getByLabelText('Lote fornecedor da linha 3')).toHaveValue('')
    expect(screen.getByLabelText('Qtd (kg) da linha 3')).toHaveValue('12.500')
  })

  it('Mover para cima/baixo troca com o vizinho, devolve o foco ao ⋯ da linha e some nas pontas', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    expect(screen.queryByRole('menuitem', { name: 'Mover para cima' })).not.toBeInTheDocument()
    await pick(user, 'Mover para baixo')
    expect(sqValues().slice(0, 2)).toEqual(['DEGALAN 64/12 N - CX 25KG', 'DEA FOAM14339 - BB 25KG'])
    expect(screen.getByRole('button', { name: 'Ações da linha 2' })).toHaveFocus()

    await openRowMenu(user, 2)
    await pick(user, 'Mover para cima')
    expect(sqValues().slice(0, 2)).toEqual(['DEA FOAM14339 - BB 25KG', 'DEGALAN 64/12 N - CX 25KG'])

    await openRowMenu(user, 5)
    expect(screen.queryByRole('menuitem', { name: 'Mover para baixo' })).not.toBeInTheDocument()
  })

  it('remover mostra "Linha 1 removida" com Desfazer; Desfazer devolve a linha no mesmo lugar', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, 'Remover linha')

    expect(screen.getByText('Linha 1 removida')).toBeInTheDocument()
    expect(sqValues()).toHaveLength(4)
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('DEGALAN 64/12 N - CX 25KG')

    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(sqValues()).toHaveLength(5)
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('DEA FOAM14339 - BB 25KG')
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('DF2406A')
    expect(screen.getByLabelText('PO / processo da linha 1')).toHaveFocus()
    // voltou ao que estava gravado: nada a salvar
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
  })

  it('remover sem desfazer suja o formulário e o rascunho grava sem a linha', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 3)
    await pick(user, 'Remover linha')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const rows = mockSaveDraft.mock.calls[0][1].rows
    expect(rows.map((item) => item.id)).toEqual(['r-1', 'r-2', 'r-4', 'r-5'])
  })

  it('Dividir em lotes: diálogo com a soma, aplica no lugar da linha e o rascunho grava N linhas com ids distintos', async () => {
    const { user } = await renderForm()
    await openRowMenu(user, 1)
    await pick(user, /Dividir em lotes/)

    const dialog = screen.getByRole('dialog', { name: 'Dividir em lotes' })
    expect(dialog).toHaveTextContent(/total 12\.500 kg\./)
    expect(within(dialog).getByRole('status')).toHaveTextContent('Soma dos lotes: 12.500 kg de 12.500 kg. Fecha certinho.')

    // o Modal foca o "Lote 1" com um pequeno atraso (setTimeout); digitar antes disso deixava o foco pular no meio da digitação (instável no CI)
    await waitFor(() => expect(within(dialog).getByLabelText('Lote 1')).toHaveFocus())
    // soma errada bloqueia
    const lastQty = within(dialog).getByLabelText('Quantidade do lote 3')
    await user.clear(lastQty)
    await user.type(lastQty, '100')
    expect(within(dialog).getByRole('button', { name: 'Dividir' })).toBeDisabled()
    expect(within(dialog).getByRole('status')).toHaveTextContent('Falta ou sobra')
    await user.clear(lastQty)
    await user.type(lastQty, '4.180')
    await user.type(within(dialog).getByLabelText('Lote 1'), 'L-A')
    await user.click(within(dialog).getByRole('button', { name: 'Dividir' }))

    expect(screen.getByText('Dividido em 3 lotes')).toBeInTheDocument()
    expect(sqValues()).toHaveLength(7)
    expect(screen.getByLabelText('Qtd (kg) da linha 1')).toHaveValue('4.160')
    expect(screen.getByLabelText('Qtd (kg) da linha 3')).toHaveValue('4.180')
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('L-A')
    expect(screen.getByLabelText('Descrição SQ da linha 2')).toHaveValue('DEA FOAM14339 - BB 25KG')
    expect(screen.getByLabelText('Descrição SQ da linha 4')).toHaveValue('DEGALAN 64/12 N - CX 25KG')

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const rows = mockSaveDraft.mock.calls[0][1].rows
    expect(rows).toHaveLength(7)
    expect(new Set(rows.map((item) => item.id)).size).toBe(7)
    expect(rows.slice(0, 3).map((item) => item.quantityKg)).toEqual([4160, 4160, 4180])
    expect(rows.slice(0, 3).every((item) => item.sqDescription === 'DEA FOAM14339 - BB 25KG' && item.po === '4500123')).toBe(true)
  })

  it('Dividir em lotes fica desabilitado em linha sem quantidade', async () => {
    const { user } = await renderForm()
    await user.clear(screen.getByLabelText('Qtd (kg) da linha 1'))
    await openRowMenu(user, 1)
    expect(screen.getByRole('menuitem', { name: /Dividir em lotes/ })).toBeDisabled()
  })

  it('com 200 linhas os itens de inserir, duplicar e dividir ficam desabilitados com a dica do limite', async () => {
    const full = Array.from({ length: 200 }, (_, index) => row({ id: `f-${index + 1}`, supplierLot: `L${index}` }))
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ rows: full }), conference: conferenceDoc() })
    const { user } = await renderForm()

    const menu = await openRowMenu(user, 1)
    for (const name of [/Linha acima/, /Linha abaixo/, /Duplicar/, /Dividir em lotes/]) {
      expect(within(menu).getByRole('menuitem', { name })).toBeDisabled()
    }
    expect(within(menu).getAllByText('Limite de 200 linhas')).toHaveLength(4)
    expect(within(menu).getByRole('menuitem', { name: 'Remover linha' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Adicionar linha no fim' })).not.toBeInTheDocument()
  })

  it('celular: o ⋯ do cartão abre o ActionSheet e Remover linha mostra o toast com Desfazer', async () => {
    const { user } = await renderForm({ variant: 'mobile' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ações da linha 2' }))
    const sheet = screen.getByRole('dialog', { name: 'Linha 2' })
    expect(within(sheet).getByRole('button', { name: 'Dividir em lotes…' })).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Remover linha' }))
    expect(screen.getByText('Linha 2 removida')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ações da linha 5' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByRole('button', { name: 'Ações da linha 5' })).toBeInTheDocument()
  })
})

describe('S9-B: consolidado agrupado por PO', () => {
  const PURCHASE_ORDERS = [
    { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
    { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
    { po: '4500903', reference: 'ORION SEA 007-26', supplierName: 'ORION CHEM CO' },
  ]
  const CONSOLIDATED = {
    id: 'p2',
    name: 'CON DG 009-26',
    processNumber: '9009',
    category: 'CONSOLIDADO',
    purchaseOrders: PURCHASE_ORDERS,
    items: [{ id: 'i1', commercialName: 'RESINA EPOXI ER-100', quantity: 6000, poNumber: '4500901' }],
  }
  const consRow = (id, po, sq, quantityKg) => row({ id, po, sqDescription: sq, quantityKg, dbcorpCode: '' })
  const consDoc = (rows) => currentDoc({ cargoType: 'CONSOLIDADO', titleSuffix: 'CON DG 009-26', rows })
  const consRows = () => [
    consRow('c1', 'ACME SEA 011-26', 'ENDURECEDOR EH-20', 6000),
    consRow('c2', 'NOVA SEA 034-26', 'PLASTIFICANTE DOP', 22000),
    consRow('c3', 'NOVA SEA 034-26', 'RESINA EPOXI ER-100', 18000),
  ]
  const loadConsolidated = (rows = consRows()) =>
    mockGetCargoReport.mockResolvedValue({ current: consDoc(rows), conference: conferenceDoc({ okByRowId: {}, countOkByRowId: {}, labelsByRowId: {} }) })
  const groupRows = () => [...document.querySelectorAll('tr.crf-group')]

  it('mostra cabeçalho por PO (referência, pedido, fornecedor, linhas), subtotal, PO sem itens e total', async () => {
    loadConsolidated()
    await renderForm({ process: CONSOLIDATED })

    expect(groupRows()).toHaveLength(3)
    expect(groupRows()[0]).toHaveTextContent('ACME SEA 011-26')
    expect(groupRows()[0]).toHaveTextContent('Pedido DBCorp 4500901 · ACME RESINS CO · 1 linha')
    expect(groupRows()[1]).toHaveTextContent('Pedido DBCorp 4500902 · NOVA POLYMERS · 2 linhas')
    expect(groupRows()[2]).toHaveTextContent('Pedido DBCorp 4500903 · ORION CHEM CO · 0 linhas')
    const summaries = [...document.querySelectorAll('tr.crf-gsum')].map((node) => node.textContent)
    expect(summaries).toEqual([
      'Subtotal da PO: 6.000 kg',
      'Subtotal da PO: 40.000 kg',
      'PO sem itens neste relatório. Use “Linha nesta PO”.',
    ])
    expect(screen.getByText(/Qtd total do consolidado:/)).toHaveTextContent('Qtd total do consolidado: 46.000 kg em 3 linhas')
    expect(screen.getAllByRole('button', { name: /^Linha nesta PO/ })).toHaveLength(3)
    // numeração corrida entre os grupos
    expect(screen.getByLabelText('Descrição SQ da linha 3')).toHaveValue('RESINA EPOXI ER-100')
  })

  it('"Linha nesta PO" insere no fim do grupo, com a referência da PO e o foco na linha nova', async () => {
    loadConsolidated()
    const { user } = await renderForm({ process: CONSOLIDATED })

    await user.click(screen.getByRole('button', { name: 'Linha nesta PO ORION SEA 007-26' }))

    expect(screen.getByLabelText('PO / processo da linha 4')).toHaveValue('ORION SEA 007-26')
    expect(screen.getByLabelText('PO / processo da linha 4')).toHaveFocus()
    expect(groupRows()[2]).toHaveTextContent('1 linha')
    expect(document.querySelectorAll('tr.crf-gsum')[2]).toHaveTextContent('Subtotal da PO: 0 kg')
  })

  it('Mover para outra PO (submenu) troca o PO pela referência e reagrupa; a PO atual vem desabilitada', async () => {
    loadConsolidated()
    const { user } = await renderForm({ process: CONSOLIDATED })

    await user.click(screen.getByRole('button', { name: 'Ações da linha 1' }))
    await user.click(screen.getByRole('menuitem', { name: /Mover para outra PO/ }))
    const sub = screen.getByRole('menu', { name: 'POs desta consolidada' })
    expect(within(sub).getByRole('menuitem', { name: /ACME SEA 011-26/ })).toBeDisabled()
    await user.click(within(sub).getByRole('menuitem', { name: /ORION SEA 007-26/ }))

    expect(groupRows()[0]).toHaveTextContent('0 linhas')
    expect(groupRows()[2]).toHaveTextContent('1 linha')
    expect(screen.getByLabelText('PO / processo da linha 3')).toHaveValue('ORION SEA 007-26')
    expect(screen.getByLabelText('Descrição SQ da linha 3')).toHaveValue('ENDURECEDOR EH-20')

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    expect(mockSaveDraft.mock.calls[0][1].rows.map((item) => [item.id, item.po])).toEqual([
      ['c2', 'NOVA SEA 034-26'],
      ['c3', 'NOVA SEA 034-26'],
      ['c1', 'ORION SEA 007-26'],
    ])
  })

  it('Mover para cima/baixo no consolidado não cruza a PO', async () => {
    loadConsolidated()
    const { user } = await renderForm({ process: CONSOLIDATED })

    await user.click(screen.getByRole('button', { name: 'Ações da linha 1' }))
    expect(screen.queryByRole('menuitem', { name: 'Mover para baixo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mover para cima' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Ações da linha 2' }))
    expect(screen.queryByRole('menuitem', { name: 'Mover para cima' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Mover para baixo' }))
    expect(screen.getByLabelText('Descrição SQ da linha 2')).toHaveValue('RESINA EPOXI ER-100')
  })

  it('relatório antigo fora de ordem abre ordenado por PO sem sujar o formulário; linha sem PO reconhecida vai ao grupo final', async () => {
    loadConsolidated([
      consRow('c3', 'NOVA SEA 034-26', 'RESINA EPOXI ER-100', 18000),
      consRow('c9', '4500903', 'SOLVENTE XIL-9', 4000),
      consRow('c1', '4500901', 'ENDURECEDOR EH-20', 6000),
      consRow('c0', 'TEXTO LIVRE', 'AVULSO', 100),
    ])
    await renderForm({ process: CONSOLIDATED })

    expect(screen.getAllByLabelText(/^Descrição SQ da linha/).map((input) => input.value)).toEqual([
      'ENDURECEDOR EH-20',
      'RESINA EPOXI ER-100',
      'SOLVENTE XIL-9',
      'AVULSO',
    ])
    expect(groupRows()).toHaveLength(4)
    expect(groupRows()[3]).toHaveTextContent('Linhas sem PO desta consolidada')
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled()
  })

  it('editar o PO da linha só vale ao sair do campo e a linha muda de grupo', async () => {
    loadConsolidated()
    const { user } = await renderForm({ process: CONSOLIDATED })

    const field = screen.getByLabelText('PO / processo da linha 1')
    await user.clear(field)
    await user.type(field, 'ORION SEA 007-26')
    // ainda no grupo da ACME enquanto digita
    expect(groupRows()[0]).toHaveTextContent('1 linha')
    await user.tab()
    expect(groupRows()[0]).toHaveTextContent('0 linhas')
    expect(groupRows()[2]).toHaveTextContent('1 linha')
  })

  it('a logística vê o consolidado sem grupos, sem # e sem ⋯ (como antes)', async () => {
    loadConsolidated()
    await renderForm({ process: CONSOLIDATED, profile: LOGISTICA })
    expect(groupRows()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^Ações da linha/ })).not.toBeInTheDocument()
  })

  it('celular: cartões agrupados por PO com cabeçalho, subtotal e "Linha nesta PO"', async () => {
    loadConsolidated()
    const { user } = await renderForm({ process: CONSOLIDATED, variant: 'mobile' })

    expect(document.querySelectorAll('.crf-group--card')).toHaveLength(3)
    expect(document.querySelectorAll('.crf-gsum--card')[0]).toHaveTextContent('Subtotal da PO: 6.000 kg')
    expect(screen.queryByRole('button', { name: 'Adicionar item' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ações da linha 1' }))
    const sheet = screen.getByRole('dialog', { name: 'Linha 1' })
    expect(within(sheet).getByRole('button', { name: /Mover para ORION SEA 007-26/ })).toBeEnabled()
    expect(within(sheet).getByRole('button', { name: /Mover para ACME SEA 011-26/ })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// S9-B: a conferência da logística continua intacta (mapas por rowId)
// ---------------------------------------------------------------------------
describe('S9-B: conferência intacta ao remover, duplicar, dividir e desfazer', () => {
  const okOf = (number) => screen.getByRole('checkbox', { name: `OK? da linha ${number}` })
  const openAndPick = async (user, number, name) => {
    await user.click(screen.getByRole('button', { name: `Ações da linha ${number}` }))
    await user.click(screen.getByRole('menuitem', { name }))
  }
  // r-1 tem OK?, contagem e etiquetas na conferência de teste (conferenceDoc).
  const CONFERENCE = conferenceDoc()
  const rowsAfter = () => mockSaveDraft.mock.calls[0][1].rows

  it('Desfazer devolve o mesmo id e a linha volta com o OK? que tinha', async () => {
    const { user } = await renderForm()
    expect(okOf(1)).toHaveAttribute('aria-checked', 'true')
    await openAndPick(user, 1, 'Remover linha')
    // a linha 1 agora é a antiga linha 2 (também com OK?); a r-3 nunca teve
    expect(okOf(2)).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(okOf(1)).toHaveAttribute('aria-checked', 'true')
    expect(okOf(3)).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('Descrição SQ da linha 1')).toHaveValue('DEA FOAM14339 - BB 25KG')
  })

  it('duplicar e dividir criam linhas sem OK?; a original duplicada mantém a marca', async () => {
    const { user } = await renderForm()
    await openAndPick(user, 1, 'Duplicar (outro lote)')
    expect(okOf(1)).toHaveAttribute('aria-checked', 'true')
    expect(okOf(2)).toHaveAttribute('aria-checked', 'false')

    await openAndPick(user, 1, /Dividir em lotes/)
    await user.click(screen.getByRole('button', { name: 'Dividir' }))
    // linhas 1-3 são as divididas (ids novos): nenhuma herda o OK? da original
    for (const number of [1, 2, 3]) expect(okOf(number)).toHaveAttribute('aria-checked', 'false')
  })

  it('o rascunho gravado mantém o id da linha com conferência quando nada nela muda', async () => {
    const { user } = await renderForm()
    await openAndPick(user, 2, 'Linha abaixo')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    expect(rowsAfter().map((item) => item.id)).toContain('r-1')
    expect(rowsAfter().map((item) => item.id)).toContain('r-2')
  })

  it('o payload da conferência poda por rowId: removida sai, nova não tem OK?, restaurada volta com a marca', () => {
    const base = currentDoc().rows
    const payloadFor = (rows) => buildConferencePayload({ ...CONFERENCE, revision: 2 }, rows, { actorName: 'Op' })

    const initial = payloadFor(base)
    expect(initial.okByRowId).toMatchObject({ 'r-1': true, 'r-2': true, 'r-4': true })
    expect(initial.okByRowId).not.toHaveProperty('orfa')

    const removed = removeCargoRow(base, 'r-1')
    const afterRemove = payloadFor(removed.rows)
    expect(afterRemove.okByRowId).not.toHaveProperty('r-1')
    expect(afterRemove.countOkByRowId).not.toHaveProperty('r-1')
    expect(afterRemove.labelsByRowId).not.toHaveProperty('r-1')
    expect(afterRemove.okByRowId['r-2']).toBe(true)

    const restored = restoreCargoRow(removed.rows, removed.removed)
    expect(restored.map((item) => item.id)).toEqual(base.map((item) => item.id))
    expect(payloadFor(restored)).toEqual(initial)

    const duplicated = duplicateCargoRow(base, 'r-1')
    const afterDup = payloadFor(duplicated.rows)
    expect(afterDup.okByRowId['r-1']).toBe(true)
    expect(afterDup.okByRowId).not.toHaveProperty(duplicated.insertedId)
    expect(afterDup.labelsByRowId).not.toHaveProperty(duplicated.insertedId)

    const split = splitCargoRow(base, 'r-1', [
      { supplierLot: 'A', quantityKg: 6250 },
      { supplierLot: 'B', quantityKg: 6250 },
    ])
    const afterSplit = payloadFor(split.rows)
    expect(afterSplit.okByRowId).not.toHaveProperty('r-1')
    expect(afterSplit.labelsByRowId).not.toHaveProperty('r-1')
    for (const id of split.insertedIds) {
      expect(afterSplit.okByRowId).not.toHaveProperty(id)
      expect(afterSplit.countOkByRowId).not.toHaveProperty(id)
    }
    expect(afterSplit.okByRowId['r-2']).toBe(true)
  })
})
