// S11-C do Relatório de Carga: botão "Ler COAs", prévia dentro do card Itens, leitura EM SEQUÊNCIA, "Ler de novo"
// só depois da confirmação, notas por arquivo, casamento/divisão aplicados no formulário e marca L. Repositórios e a
// callable mockados (nunca chama a Tess); o formulário nasce de um processo FCL + FUP sintéticos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockGetCargoReport = vi.fn()
const mockSaveDraft = vi.fn()
const mockGetCatalog = vi.fn()
const mockLoadReference = vi.fn()
const mockGetSuppliers = vi.fn()
const mockListDocuments = vi.fn()
const mockListCoaReads = vi.fn()
const mockReadProcessCoa = vi.fn()

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
vi.mock('../../src/services/processDocumentsRepository', () => ({
  saveBlobAsFile: vi.fn(),
  listProcessDocuments: (...args) => mockListDocuments(...args),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: (...args) => mockGetCatalog(...args),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  getSupplierPackagingCatalog: (...args) => mockGetSuppliers(...args),
  upsertSupplierPackagingEntry: vi.fn(),
}))
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpProcessReference: (...args) => mockLoadReference(...args),
}))
vi.mock('../../src/services/auditRepository', () => ({ createAuditEvent: vi.fn().mockResolvedValue(undefined) }))
// A callable e a leitura dos resultados são mockadas; as mensagens de erro (describeCoaReadError) são as reais.
vi.mock('../../src/services/coaReadsRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listCoaReads: (...args) => mockListCoaReads(...args),
    readProcessCoa: (...args) => mockReadProcessCoa(...args),
  }
})

import { ToastProvider } from '../../src/components/Toast'
import CargoReportForm from '../../src/features/processes/CargoReportForm'
import { resetSupplierCatalogCache } from '../../src/features/processes/useCargoReportPackaging'

const render = (ui, options) => rtlRender(ui, { wrapper: ToastProvider, ...options })

const ADMIN = { uid: 'admin-1', name: 'Lucas Admin', email: 'lucas@sqquimica.com', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }

const PROCESS = {
  id: 'p1',
  name: 'GOOYER SEA 185-26',
  processNumber: '4500185',
  category: 'FCL',
  supplierName: 'GOOYER CHEMICALS LTD',
  items: [
    { id: 'i1', commercialName: 'POLIOL PE-3000', quantity: 4000 },
    { id: 'i2', commercialName: 'CATALISADOR ZN-12', quantity: 500 },
  ],
}

const CATALOG = { exists: true, version: 3, itemCount: 0, items: [] }
const NO_SUPPLIERS = { exists: false, version: 0, entries: [], entryCount: 0, aliases: [] }

const FUP = [
  { commercialName: 'POLIOL PE-3000', pedido: '4500185', quantityKg: 4000, sqCode: 'BA5012', supplierRef: 'POLYETHER POLYOL PE-3000 DRUM 200 KG', itemId: '2001' },
  { commercialName: 'CATALISADOR ZN-12', pedido: '4500185', quantityKg: 500, sqCode: 'BA5033', supplierRef: 'ZINC CATALYST ZN-12 PAIL 25 KG', itemId: '2002' },
]
const reference = (items = FUP, snapshotId = 'snap-1') => ({
  snapshot: { snapshotId, updatedAtMs: 1 },
  hint: {
    snapshotId,
    matchRule: 'name',
    shipment: { orders: [{ pedido: '4500185', poRef: '', poBase: '', exporter: 'GOOYER CHEMICALS LTD' }], items },
  },
  stale: false,
})

const currentDoc = (overrides = {}) => ({
  schemaVersion: 1,
  formCode: 'FR.CMX.001',
  formRevision: '005',
  revision: 2,
  status: 'rascunho',
  cargoType: 'FCL',
  titleSuffix: 'GOOYER SEA 185-26',
  rows: [],
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

// ---- COAs e leituras (formato do serviço `readCoaReadDoc`) ----
const coaDoc = (id, name, overrides = {}) => ({
  id,
  type: 'coaOriginal',
  name,
  description: '',
  mimeType: 'application/pdf',
  uploadedAt: `2026-11-2${id.replace(/\D/g, '') || 0}T10:00:00.000Z`,
  ...overrides,
})
const cert = (batchNumber, kg, overrides = {}) => ({
  page: 1,
  productName: 'POLYETHER POLYOL PE-3000',
  productNameLocal: null,
  productAliases: [],
  batchNumber,
  poReference: null,
  quantity: kg === null ? null : { raw: `${kg} KG`, value: kg, unit: 'kg', kg },
  packaging: null,
  manufactureDate: null,
  expiryDate: null,
  expiryKind: null,
  supplierName: null,
  confidence: 'high',
  warnings: [],
  ...overrides,
})
const coaRead = (documentId, certificates, overrides = {}) => ({
  documentId,
  status: 'done',
  documentType: 'coa',
  certificates,
  warnings: [],
  validationWarnings: [],
  error: null,
  ...overrides,
})
const readResult = (read, overrides = {}) => ({ status: read.status, cached: false, read, ...overrides })
const callError = (code) => Object.assign(new Error(`callable ${code}`), { code })

function deferredReads() {
  const pending = []
  mockReadProcessCoa.mockImplementation(
    (processId, documentId, options) => new Promise((resolve, reject) => pending.push({ processId, documentId, options, resolve, reject }))
  )
  return pending
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCatalog.mockResolvedValue(CATALOG)
  resetSupplierCatalogCache()
  mockGetSuppliers.mockResolvedValue(NO_SUPPLIERS)
  mockGetCargoReport.mockResolvedValue({ current: null, conference: null })
  mockLoadReference.mockResolvedValue(reference())
  mockSaveDraft.mockResolvedValue({ revision: 1 })
  mockListDocuments.mockResolvedValue([])
  mockListCoaReads.mockResolvedValue({})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function renderForm({ profile = ADMIN, variant = 'desktop', process = PROCESS } = {}) {
  const user = userEvent.setup()
  const view = render(<CargoReportForm process={process} profile={profile} variant={variant} onClose={vi.fn()} />)
  await screen.findByRole('heading', { name: /RELATÓRIO DE CARGA - / })
  return { user, ...view }
}

const coaButton = () => screen.getByRole('button', { name: 'Ler COAs' })
const coaPanel = () => screen.findByRole('region', { name: 'Leitura dos COAs' })

describe('botão Ler COAs', () => {
  it('admin no estágio 1: botão com ícone, alvo de 44 px e sem chamar nada antes do clique', async () => {
    await renderForm()
    expect(coaButton()).toHaveClass('secondary-button')
    expect(coaButton()).toHaveClass('crf-refresh-btn')
    expect(coaButton()).not.toHaveClass('ghost-button')
    expect(mockListDocuments).not.toHaveBeenCalled()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Leitura dos COAs' })).not.toBeInTheDocument()
  })

  it('logística e admin com o COMEX fechado não têm o botão', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ rows: [], status: 'rascunho' }), conference: null })
    await renderForm({ profile: LOGISTICA })
    expect(screen.queryByRole('button', { name: 'Ler COAs' })).not.toBeInTheDocument()
  })

  it('admin com o COMEX fechado (estágio 2) não vê o botão', async () => {
    mockGetCargoReport.mockResolvedValue({ current: currentDoc({ status: 'concluido' }), conference: null })
    await renderForm()
    expect(screen.queryByRole('button', { name: 'Ler COAs' })).not.toBeInTheDocument()
  })

  it('celular: o botão e a prévia também aparecem', async () => {
    mockListDocuments.mockResolvedValue([])
    const { user } = await renderForm({ variant: 'mobile' })
    await user.click(coaButton())
    expect(await coaPanel()).toHaveTextContent('Nenhum COA anexado a este processo.')
  })
})

describe('sem COA e sem leitura nova', () => {
  it('sem COA: mensagem, Fechar e o foco volta ao botão', async () => {
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(panel).toHaveTextContent('Nenhum COA anexado a este processo. Envie os COAs na aba Documentos (COA Original).')
    expect(mockListDocuments).toHaveBeenCalledWith('p1', { types: ['coaOriginal'] })
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    await user.click(within(panel).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('region', { name: 'Leitura dos COAs' })).not.toBeInTheDocument()
    expect(coaButton()).toHaveFocus()
  })

  it('a prévia fica DENTRO do card Itens (sem position: fixed)', async () => {
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(screen.getByRole('region', { name: 'Itens do relatório' })).toContainElement(panel)
    expect(panel.style.position).not.toBe('fixed')
  })

  it('COA já lido (cache do servidor): não chama a callable, propõe o lote e aplica só ao clicar', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'poliol.pdf')])
    mockListCoaReads.mockResolvedValue({ d1: coaRead('d1', [cert('L-9001', 4000)]) })
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()

    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(panel).toHaveTextContent('Leitura dos COAs: 1 certificado em 1 arquivo.')
    expect(panel).toHaveTextContent('Escolha o que aplicar; o que você editou à mão nunca é sobrescrito sem aparecer aqui.')
    const box = within(panel).getByRole('checkbox', { name: 'POLIOL PE-3000 · GOOYER SEA 185-26: 1 lote' })
    expect(box).toBeChecked()
    expect(within(panel).getByRole('columnheader', { name: 'Confiança' })).toBeInTheDocument()
    expect(within(panel).getByRole('cell', { name: 'L-9001' })).toBeInTheDocument()
    expect(within(panel).getByText('poliol.pdf · pág. 1')).toBeInTheDocument()
    expect(within(panel).getByText('alta')).toBeInTheDocument()
    // Nada foi para o formulário nem foi salvo.
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('')
    expect(mockSaveDraft).not.toHaveBeenCalled()

    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('L-9001')
    expect(screen.getByLabelText('Qtd (kg) da linha 1')).toHaveValue('4.000')
    expect(screen.getByLabelText('Lote fornecedor da linha 1').parentElement.querySelector('[title="Veio do COA"]')).toHaveTextContent('L')
    expect(await screen.findByText('Lotes do COA aplicados')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Leitura dos COAs' })).not.toBeInTheDocument()
    expect(coaButton()).toHaveFocus()
    expect(screen.getByLabelText('Legenda das marcas de origem')).toHaveTextContent('COA')
    // Ainda não gravado até "Salvar rascunho".
    expect(mockSaveDraft).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const payload = mockSaveDraft.mock.calls[0][1]
    expect(payload.rows[0].supplierLot).toBe('L-9001')
    const firstId = payload.rows[0].id
    expect(payload.autofill.rows[firstId].base.supplierLot).toBe('L-9001')
  })

  it('"Agora não" fecha sem aplicar e devolve o foco', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'poliol.pdf')])
    mockListCoaReads.mockResolvedValue({ d1: coaRead('d1', [cert('L-9001', 4000)]) })
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    await user.click(within(panel).getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByRole('region', { name: 'Leitura dos COAs' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('')
    expect(coaButton()).toHaveFocus()
  })

  it('tudo em dia: o lote do relatório já bate com o COA', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'poliol.pdf'), coaDoc('d2', 'cat.pdf')])
    mockListCoaReads.mockResolvedValue({
      d1: coaRead('d1', [cert('L-9001', 4000)]),
      d2: coaRead('d2', [cert('Z-1', 500, { productName: 'ZINC CATALYST ZN-12' })]),
    })
    const { user } = await renderForm()
    await user.type(screen.getByLabelText('Lote fornecedor da linha 1'), 'L-9001')
    await user.type(screen.getByLabelText('Lote fornecedor da linha 2'), 'Z-1')
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(panel).toHaveTextContent('Tudo em dia. Os lotes do relatório já batem com os COAs.')
    expect(within(panel).queryByRole('button', { name: 'Aplicar selecionadas' })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('region', { name: 'Leitura dos COAs' })).not.toBeInTheDocument()
  })
})

describe('leitura em sequência (um arquivo por vez)', () => {
  const threeDocs = [coaDoc('d1', 'a.pdf'), coaDoc('d2', 'b.pdf'), coaDoc('d3', 'c.pdf')]

  it('a 2ª chamada só sai depois da 1ª resolver; o progresso aparece e o resultado entra na prévia', async () => {
    mockListDocuments.mockResolvedValue(threeDocs)
    const pending = deferredReads()
    const { user } = await renderForm()
    await user.click(coaButton())

    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0]).toMatchObject({ processId: 'p1', documentId: 'd1', options: { force: false } })
    const status = screen.getByText('Lendo os COAs: 1 de 3 arquivos. Cada arquivo pode levar até 2 minutos.').closest('[role="status"]')
    expect(status).not.toBeNull()
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(coaButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' })).toBeDisabled()
    // O 1º ainda não resolveu: nenhuma outra chamada.
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)

    pending[0].resolve(readResult(coaRead('d1', [cert('L1', 4000)])))
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].documentId).toBe('d2')
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/Lendo os COAs: 2 de 3 arquivos/)).toBeInTheDocument()

    pending[1].resolve(readResult(coaRead('d2', [cert('Z1', 500, { productName: 'ZINC CATALYST ZN-12' })])))
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].documentId).toBe('d3')
    pending[2].resolve(readResult(coaRead('d3', [], { documentType: 'not_coa' })))

    const panel = await coaPanel()
    expect(panel).toHaveTextContent('Leitura dos COAs: 2 certificados em 2 arquivos.')
    expect(within(panel).getByText('c.pdf: Não parece um COA.')).toBeInTheDocument()
    expect(coaButton()).toBeEnabled()
    expect(within(panel).getAllByRole('checkbox')).toHaveLength(2)
  })

  it('só lê os arquivos sem leitura pronta (os já lidos vêm do cache)', async () => {
    mockListDocuments.mockResolvedValue(threeDocs)
    mockListCoaReads.mockResolvedValue({ d1: coaRead('d1', [cert('L1', 4000)]), d3: coaRead('d3', [], { documentType: 'not_coa' }) })
    const pending = deferredReads()
    const { user } = await renderForm()
    await user.click(coaButton())
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0].documentId).toBe('d2')
    expect(screen.getByText('Lendo os COAs: 1 de 1 arquivo. Cada arquivo pode levar até 2 minutos.')).toBeInTheDocument()
    pending[0].resolve(readResult(coaRead('d2', [])))
    await coaPanel()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })

  it('arquivo que não é PDF não é enviado: vira nota "só PDF"', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'foto.jpg', { mimeType: 'image/jpeg' })])
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(within(panel).getByText('foto.jpg: Só PDF é lido automaticamente.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Ler de novo…' })).not.toBeInTheDocument()
  })

  it('erro desconhecido (ex.: 429 do Cloud Run vira "internal") interrompe a fila e mostra a mensagem; o resto fica não lido', async () => {
    mockListDocuments.mockResolvedValue(threeDocs)
    const pending = deferredReads()
    const { user } = await renderForm()
    await user.click(coaButton())
    await waitFor(() => expect(pending).toHaveLength(1))
    pending[0].resolve(readResult(coaRead('d1', [cert('L1', 4000)])))
    await waitFor(() => expect(pending).toHaveLength(2))
    pending[1].reject(callError('unknown'))

    const panel = await coaPanel()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(2)
    expect(within(panel).getByRole('alert')).toHaveTextContent('Leitura interrompida: Não foi possível ler o COA agora. Tente de novo.')
    expect(within(panel).getByText('c.pdf: Não lido. Clique em Ler COAs para tentar de novo.')).toBeInTheDocument()
    expect(within(panel).getByText('b.pdf: Não foi possível ler o COA agora. Tente de novo.')).toBeInTheDocument()
    // O que já foi lido continua na prévia e dá para aplicar.
    expect(within(panel).getByRole('checkbox', { name: /POLIOL PE-3000/ })).toBeChecked()
    expect(coaButton()).toBeEnabled()
  })

  it('busy (outra leitura em andamento) também interrompe a fila', async () => {
    mockListDocuments.mockResolvedValue(threeDocs)
    mockReadProcessCoa.mockRejectedValueOnce(callError('busy'))
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
    expect(within(panel).getByRole('alert')).toHaveTextContent('Outra leitura de COA está em andamento. Tente de novo em 1 minuto.')
    expect(within(panel).getAllByText(/Não lido\./)).toHaveLength(2)
  })

  it('leitura que volta "failed" com erro de serviço (tess-auth) interrompe; erro só do arquivo (attempts) segue a fila', async () => {
    mockListDocuments.mockResolvedValue(threeDocs)
    mockReadProcessCoa
      .mockRejectedValueOnce(callError('attempts'))
      .mockResolvedValueOnce(readResult({ documentId: 'd2', status: 'failed', documentType: null, certificates: [], error: { code: 'tess-auth' } }))
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(2)
    expect(within(panel).getByText('a.pdf: Limite de leituras deste arquivo atingido.')).toBeInTheDocument()
    expect(within(panel).getByRole('alert')).toHaveTextContent('A Tess recusou as credenciais do Portal.')
    expect(within(panel).getByText(/c\.pdf: Não lido\./)).toBeInTheDocument()
  })

  it('outra sessão lendo o mesmo arquivo (status reading) vira nota e a fila segue', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'a.pdf'), coaDoc('d2', 'b.pdf')])
    mockReadProcessCoa
      .mockResolvedValueOnce({ status: 'reading', cached: false, read: null })
      .mockResolvedValueOnce(readResult(coaRead('d2', [cert('Z1', 500, { productName: 'ZINC CATALYST ZN-12' })])))
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(2)
    expect(within(panel).getByText('a.pdf: Este arquivo está sendo lido em outra sessão. Tente de novo em 1 minuto.')).toBeInTheDocument()
  })

  it('sair da tela no meio da leitura para a fila (nenhuma chamada nova depois)', async () => {
    mockListDocuments.mockResolvedValue(threeDocs)
    const pending = deferredReads()
    const { user, unmount } = await renderForm()
    await user.click(coaButton())
    await waitFor(() => expect(pending).toHaveLength(1))
    unmount()
    pending[0].resolve(readResult(coaRead('d1', [cert('L1', 4000)])))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })

  it('falha ao listar os COAs: mostra o erro e um Fechar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockListDocuments.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    const { user } = await renderForm()
    await user.click(coaButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível listar os COAs do processo.')
    await user.click(within(alert).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByText(/Não foi possível listar os COAs/)).not.toBeInTheDocument()
  })
})

describe('Ler de novo… (só depois da confirmação)', () => {
  const cached = () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'a.pdf'), coaDoc('d2', 'b.pdf')])
    mockListCoaReads.mockResolvedValue({
      d1: coaRead('d1', [cert('L1', 4000)]),
      d2: coaRead('d2', [cert('Z1', 500, { productName: 'ZINC CATALYST ZN-12' })]),
    })
  }

  it('sem confirmar, NENHUMA chamada com force: Cancelar fecha o diálogo e nada é lido', async () => {
    cached()
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    await user.click(within(panel).getByRole('button', { name: 'Ler de novo…' }))

    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    expect(within(dialog).getByText('Ler os COAs de novo?')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Os 2 arquivos serão enviados de novo para a leitura automática, um por vez. Cada arquivo tem até 3 leituras.')
    expect(dialog).toHaveTextContent('Se a nova leitura falhar, o resultado anterior de cada arquivo se perde até ler de novo.')
    expect(mockReadProcessCoa).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    // A prévia segue como estava.
    expect(screen.getByRole('region', { name: 'Leitura dos COAs' })).toHaveTextContent('2 certificados')
  })

  it('confirmando: lê todos com force: true, um por vez, e a prévia usa o resultado novo', async () => {
    cached()
    const pending = deferredReads()
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    await user.click(within(panel).getByRole('button', { name: 'Ler de novo…' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Ler de novo' }))

    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0]).toMatchObject({ documentId: 'd1', options: { force: true } })
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
    pending[0].resolve(readResult(coaRead('d1', [cert('L-NOVO', 4000)])))
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1]).toMatchObject({ documentId: 'd2', options: { force: true } })
    pending[1].resolve(readResult(coaRead('d2', [cert('Z1', 500, { productName: 'ZINC CATALYST ZN-12' })])))

    const again = await coaPanel()
    expect(within(again).getByRole('cell', { name: 'L-NOVO' })).toBeInTheDocument()
    expect(within(again).queryByRole('cell', { name: 'L1' })).not.toBeInTheDocument()
  })

  it('"Ler de novo" interrompida por erro desconhecido: o arquivo seguinte fica não lido e a mensagem aparece', async () => {
    cached()
    mockReadProcessCoa.mockRejectedValueOnce(callError('unknown'))
    const { user } = await renderForm()
    await user.click(coaButton())
    await user.click(within(await coaPanel()).getByRole('button', { name: 'Ler de novo…' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ler de novo' }))
    const panel = await screen.findByText(/Leitura interrompida:/)
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
    expect(panel).toHaveTextContent('Não foi possível ler o COA agora. Tente de novo.')
    const region = screen.getByRole('region', { name: 'Leitura dos COAs' })
    // com force o servidor já zerou o resultado do arquivo: ele vira falha; o outro, não lido
    expect(within(region).getByText('a.pdf: Não foi possível ler o COA agora. Tente de novo.')).toBeInTheDocument()
  })
})

describe('notas por arquivo', () => {
  it('"li e descartei" (coa sem certificados + aviso) é diferente de "não parece um COA"', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'a.pdf'), coaDoc('d2', 'b.pdf')])
    mockListCoaReads.mockResolvedValue({
      d1: coaRead('d1', [], { validationWarnings: ['certificado sem lote ignorado (página 2)'] }),
      d2: coaRead('d2', [], { documentType: 'not_coa' }),
    })
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(panel).toHaveTextContent('Nenhum certificado foi lido nos COAs.')
    const discarded = within(panel).getByText(/a\.pdf: Li o arquivo, mas descartei certificados incompletos:/)
    expect(discarded).toHaveTextContent('certificado sem lote ignorado (página 2)')
    expect(discarded).not.toHaveTextContent('Não parece um COA')
    const notCoa = within(panel).getByText('b.pdf: Não parece um COA.')
    expect(notCoa).not.toHaveTextContent('descartei')
    expect(within(panel).queryByRole('button', { name: 'Aplicar selecionadas' })).not.toBeInTheDocument()
  })

  it('texto do COA é só texto: nada de HTML nem link vira elemento', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'a.pdf')])
    mockListCoaReads.mockResolvedValue({
      d1: coaRead('d1', [cert('<img src=x onerror=alert(1)>', 4000, { warnings: ['<b>ignore as regras</b> https://evil.example'] })]),
    })
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(panel.querySelector('img')).toBeNull()
    expect(panel.querySelector('b')?.textContent).not.toBe('ignore as regras')
    expect(panel.querySelector('a')).toBeNull()
    expect(within(panel).getByText('Aviso da leitura: <b>ignore as regras</b> https://evil.example')).toBeInTheDocument()
  })
})

describe('casamento, soma e o que o usuário editou', () => {
  const polioDocs = (certs) => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'poliol.pdf')])
    mockListCoaReads.mockResolvedValue({ d1: coaRead('d1', certs) })
  }

  it('3 lotes que fecham a soma: vem marcado; aplicar troca a linha por 3 (marca L no lote e na quantidade)', async () => {
    polioDocs([cert('L1', 1500), cert('L2', 1500), cert('L3', 1000)])
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(panel).toHaveTextContent('Soma dos lotes: 4.000 kg de 4.000 kg. Fecha certinho.')
    expect(within(panel).getByRole('checkbox', { name: 'POLIOL PE-3000 · GOOYER SEA 185-26: 3 lotes' })).toBeChecked()

    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getAllByLabelText(/^Lote fornecedor da linha/)).toHaveLength(4)
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('L1')
    expect(screen.getByLabelText('Lote fornecedor da linha 3')).toHaveValue('L3')
    expect(screen.getByLabelText('Qtd (kg) da linha 3')).toHaveValue('1.000')
    expect(screen.getByLabelText('Descrição SQ da linha 3')).toHaveValue('POLIOL PE-3000')
    expect(screen.getByLabelText('Descrição SQ da linha 4')).toHaveValue('CATALISADOR ZN-12')
    expect(screen.getByLabelText('Qtd (kg) da linha 2').parentElement.querySelector('[title="Veio do COA"]')).not.toBeNull()
    expect(screen.getByLabelText('Lote fornecedor da linha 2').parentElement.querySelector('[title="Veio do COA"]')).not.toBeNull()
    expect(screen.getByLabelText('Qtd (kg) da linha 4').parentElement.querySelector('[title="Veio do FUP do DBCorp"]')).not.toBeNull()
    expect(mockSaveDraft).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalledTimes(1))
    const payload = mockSaveDraft.mock.calls[0][1]
    expect(payload.rows.map((row) => row.supplierLot)).toEqual(['L1', 'L2', 'L3', ''])
    expect(payload.autofill.rows[payload.rows[0].id]).toMatchObject({ key: 'fup:2001', base: { supplierLot: 'L1', quantityKg: 1500 }, coa: true })
  })

  it('soma menor: vem DESMARCADA com "Falta 200 kg"; marcando, entram as quantidades do COA', async () => {
    polioDocs([cert('L1', 1500), cert('L2', 1500), cert('L3', 800)])
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(panel).toHaveTextContent('Soma dos lotes: 3.800 kg de 4.000 kg. Falta 200 kg.')
    const box = within(panel).getByRole('checkbox', { name: /3 lotes/ })
    expect(box).not.toBeChecked()
    expect(within(panel).getByRole('button', { name: 'Aplicar selecionadas' })).toBeDisabled()

    await user.click(box)
    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getByLabelText('Qtd (kg) da linha 3')).toHaveValue('800')
  })

  it('soma maior: "Sobra"; lote sem quantidade: a linha nasce vazia, desmarcada', async () => {
    polioDocs([cert('L1', 3000), cert('L2', 1200)])
    const { user, unmount } = await renderForm()
    await user.click(coaButton())
    expect(await coaPanel()).toHaveTextContent('Soma dos lotes: 4.200 kg de 4.000 kg. Sobra 200 kg.')
    unmount()

    polioDocs([cert('L1', 3000), cert('L2', null)])
    const second = await renderForm()
    await second.user.click(coaButton())
    const panel = await coaPanel()
    expect(panel).toHaveTextContent('1 lote sem quantidade no COA: a linha fica para você preencher.')
    expect(within(panel).getByText('sem quantidade')).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: /2 lotes/ })).not.toBeChecked()
    await second.user.click(within(panel).getByRole('checkbox', { name: /2 lotes/ }))
    await second.user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getByLabelText('Qtd (kg) da linha 1')).toHaveValue('3.000')
    expect(screen.getByLabelText('Qtd (kg) da linha 2')).toHaveValue('')
    expect(screen.getByLabelText('Lote fornecedor da linha 2')).toHaveValue('L2')
  })

  it('lote digitado à mão não é sobrescrito sem aparecer: vem desmarcado, avisa e só troca se marcar', async () => {
    polioDocs([cert('L-COA', 4000)])
    const { user } = await renderForm()
    const lot = screen.getByLabelText('Lote fornecedor da linha 1')
    await user.type(lot, 'MEU-LOTE')
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(panel).toHaveTextContent('Lote atual: “MEU-LOTE” (você editou esta célula)')
    const box = within(panel).getByRole('checkbox', { name: /1 lote/ })
    expect(box).not.toBeChecked()
    expect(within(panel).getByRole('button', { name: 'Aplicar selecionadas' })).toBeDisabled()
    expect(lot).toHaveValue('MEU-LOTE')

    await user.click(box)
    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('L-COA')
  })

  it('o relatório mudou depois da leitura: aplicar não sobrescreve, avisa e a prévia é refeita com a edição', async () => {
    polioDocs([cert('L-COA', 4000)])
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(within(panel).getByRole('checkbox', { name: /1 lote/ })).toBeChecked()

    await user.type(screen.getByLabelText('Lote fornecedor da linha 1'), 'DIGITEI')
    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))

    expect(await screen.findByText('O relatório mudou depois da leitura dos COAs. A prévia foi atualizada: confira e aplique de novo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('DIGITEI')
    const refreshed = screen.getByRole('region', { name: 'Leitura dos COAs' })
    expect(within(refreshed).getByRole('checkbox', { name: /1 lote/ })).not.toBeChecked()
    expect(refreshed).toHaveTextContent('Lote atual: “DIGITEI” (você editou esta célula)')
  })

  describe('marcas da logística nas linhas que seriam trocadas', () => {
    const savedRow = {
      id: 's-1',
      po: 'GOOYER SEA 185-26',
      dbcorpCode: 'BA5012',
      supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
      sqDescription: 'POLIOL PE-3000',
      supplierLot: '',
      wmsLabel: '',
      sqLabel: '',
      quantityKg: 4000,
      count: null,
      packageWeightKg: null,
      frozenNetWeightKg: null,
      frozenPackages: null,
    }
    const saved = (conference) => {
      mockGetCargoReport.mockResolvedValue({
        current: currentDoc({
          rows: [savedRow],
          autofill: {
            schemaVersion: 1,
            snapshotId: 'snap-1',
            rows: { 's-1': { key: 'fup:2001', base: { po: savedRow.po, dbcorpCode: savedRow.dbcorpCode, supplierDescription: savedRow.supplierDescription, sqDescription: savedRow.sqDescription, quantityKg: 4000 } } },
          },
        }),
        conference,
      })
    }

    it('sem marcas: a divisão que fecha vem marcada e sem aviso', async () => {
      polioDocs([cert('L1', 2000), cert('L2', 2000)])
      saved(null)
      const { user } = await renderForm()
      await user.click(coaButton())
      const panel = await coaPanel()
      expect(within(panel).getByRole('checkbox', { name: /2 lotes/ })).toBeChecked()
      expect(panel).not.toHaveTextContent('A logística já marcou')
    })

    it('OK? marcado pela logística: vem desmarcada e avisa que trocar as linhas apaga a marca', async () => {
      polioDocs([cert('L1', 2000), cert('L2', 2000)])
      saved({ status: 'aberta', okByRowId: { 's-1': true } })
      const { user } = await renderForm()
      await user.click(coaButton())
      const panel = await coaPanel()
      expect(panel).toHaveTextContent(
        'A logística já marcou OK?, contagem, etiquetas, avaria ou fotos em 1 linha deste item; trocar as linhas apaga essas marcas.'
      )
      expect(within(panel).getByRole('checkbox', { name: /2 lotes/ })).not.toBeChecked()
    })
  })

  it('"só no COA": ligar ao item pelo seletor gera a proposta do lote nesse item', async () => {
    polioDocs([cert('X-1', 100, { productName: 'PRODUTO DESCONHECIDO' })])
    const { user } = await renderForm()
    await user.click(coaButton())
    const panel = await coaPanel()
    expect(within(panel).getByText('só no COA')).toBeInTheDocument()
    expect(within(panel).getAllByText('só no relatório')).toHaveLength(2)
    expect(within(panel).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(panel).getByText('Sem COA para: CATALISADOR ZN-12 · GOOYER SEA 185-26')).toBeInTheDocument()

    const select = within(panel).getByLabelText('Ligar ao item')
    expect(within(select).getByRole('option', { name: 'Não ligar' })).toBeInTheDocument()
    await user.selectOptions(select, 'CATALISADOR ZN-12 · GOOYER SEA 185-26')
    const box = await within(panel).findByRole('checkbox', { name: /CATALISADOR ZN-12/ })
    expect(box).toBeChecked()
    expect(within(panel).queryByText('só no COA')).not.toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Aplicar selecionadas' }))
    expect(screen.getByLabelText('Lote fornecedor da linha 2')).toHaveValue('X-1')
    expect(screen.getByLabelText('Lote fornecedor da linha 1')).toHaveValue('')
  })

  it('PO impressa parecida mostra o aviso; PO de outro processo vem desmarcada', async () => {
    polioDocs([cert('L1', 4000, { poReference: 'GOOYE SEA 185-26', warnings: ['scanned image, low quality'] })])
    const { user, unmount } = await renderForm()
    await user.click(coaButton())
    let panel = await coaPanel()
    expect(panel).toHaveTextContent('PO impressa no COA: GOOYE SEA 185-26 (parecida com GOOYER SEA 185-26).')
    expect(panel).toHaveTextContent('Aviso da leitura: scanned image, low quality')
    expect(within(panel).getByRole('checkbox', { name: /1 lote/ })).toBeChecked()
    unmount()

    polioDocs([cert('L1', 4000, { poReference: 'GOOYER SEA 186-26' })])
    const second = await renderForm()
    await second.user.click(coaButton())
    panel = await coaPanel()
    expect(panel).toHaveTextContent('PO impressa no COA (GOOYER SEA 186-26) não é deste processo.')
    expect(within(panel).getByRole('checkbox', { name: /1 lote/ })).not.toBeChecked()
  })
})

describe('exclusividade com a prévia do Atualizar', () => {
  it('abrir uma prévia fecha a outra', async () => {
    mockListDocuments.mockResolvedValue([coaDoc('d1', 'a.pdf')])
    mockListCoaReads.mockResolvedValue({ d1: coaRead('d1', [cert('L1', 4000)]) })
    const { user } = await renderForm()
    await user.click(coaButton())
    await coaPanel()

    mockLoadReference.mockResolvedValue(reference([FUP[0], { ...FUP[1], quantityKg: 900 }], 'snap-2'))
    await user.click(screen.getByRole('button', { name: 'Atualizar do processo e do FUP' }))
    expect(await screen.findByRole('region', { name: 'Diferenças do processo e do FUP' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Leitura dos COAs' })).not.toBeInTheDocument()

    await user.click(coaButton())
    await coaPanel()
    expect(screen.queryByRole('region', { name: 'Diferenças do processo e do FUP' })).not.toBeInTheDocument()
  })
})
