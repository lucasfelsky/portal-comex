// S11 (K): o bloco "Pós-recebimento" do processo (postReceiptNotes + postReceiptImages)
// é SÓ LEITURA para qualquer papel. Página real (repositórios mockados), logística e
// admin, desktop e celular. Cobre: sem "Editar observações"; o legado gravado
// continua visível (texto + galeria); Status de coleta sem "Fotos do recebimento";
// divergência sem a pendência da foto. Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../../src/components/Toast'
import { UnsavedChangesProvider } from '../../src/contexts/UnsavedChangesContext'

const mockUseAuth = vi.fn()
const mockListProcesses = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/services/processesRepository', () => ({
  archiveProcess: vi.fn(),
  channelOptions: ['Verde', 'Amarelo', 'Vermelho', 'Cinza'],
  collectionStatusOptions: [],
  deleteProcess: vi.fn(),
  dtaStatusOptions: [],
  listProcesses: (...args) => mockListProcesses(...args),
  processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
  saveProcess: vi.fn(),
  saveProcessCollectionStatus: vi.fn(),
  saveProcessPostReceiptNotes: vi.fn(),
  searchProcesses: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processMessagesRepository', () => ({
  listProcessMessages: vi.fn().mockResolvedValue([]),
  createProcessMessage: vi.fn(),
  deleteProcessMessage: vi.fn(),
}))
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpReference: vi.fn().mockResolvedValue(null),
  saveErpReferenceSnapshot: vi.fn(),
}))
vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: vi.fn().mockResolvedValue({}),
  listAuditEvents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: vi.fn().mockResolvedValue([]),
  uploadProcessDocument: vi.fn(),
  deleteProcessDocument: vi.fn(),
  downloadProcessDocumentBlob: vi.fn(),
  saveBlobAsFile: vi.fn(),
  setInvoicePackingListLink: vi.fn(),
  renameAdditionalDocument: vi.fn(),
}))
vi.mock('../../src/services/postReceiptImagesStorage', () => ({
  deletePostReceiptImages: vi.fn().mockResolvedValue(undefined),
  getAddedPostReceiptImages: () => [],
  getRemovedPostReceiptImages: () => [],
  // repassa as fotos do rascunho (as legadas) sem enviar nada ao Storage
  resolvePostReceiptImagesForSave: vi.fn(async (_processId, images) => images),
}))

import ProcessesPage from '../../src/pages/ProcessesPage'
import { getPendingFields } from '../../src/features/processes/pendingFields'
import { saveProcessCollectionStatus } from '../../src/services/processesRepository'

const ORIGINAL_MATCH_MEDIA = window.matchMedia

function installMatchMedia({ desktop }) {
  window.matchMedia = vi.fn((query) => ({
    matches: query.includes('1041') ? desktop : query.includes('720') ? !desktop : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

const LEGACY_NOTES = 'Caixas amassadas no pallet 3, conferidas pela equipe do CD.'

function receivedProcess(overrides = {}) {
  return {
    id: 'p-1',
    name: 'Resina epóxi líquida',
    processNumber: '4500128734',
    category: 'FCL',
    destination: 'Itajaí',
    processStatus: 'Carga recebida',
    collectionStatus: 'Carga recebida, em conferência',
    containerQuantity: 1,
    containers: [{ id: 'CNT-1', number: 'CSQU3054383' }],
    // sem janela de coleta o "Status de coleta" nao e oferecido (canUsePostCollectionStatuses)
    collectionWindows: [
      { id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-01-12T10:00:00.000Z', notes: '' },
    ],
    etd: '2026-01-01',
    eta: '2026-01-10',
    items: [{ id: 'i-1', commercialName: 'Resina EP-128', quantity: 36000 }],
    ...overrides,
  }
}

const WITH_LEGACY = receivedProcess({
  postReceiptNotes: LEGACY_NOTES,
  postReceiptImages: [
    { id: 'img-1', url: 'https://example.com/a.jpg', name: 'avaria-a.jpg', size: 120000, mimeType: 'image/jpeg' },
    { id: 'img-2', url: 'https://example.com/b.jpg', name: 'avaria-b.jpg', size: 90000, mimeType: 'image/jpeg' },
  ],
})
const WITHOUT_LEGACY = receivedProcess({ id: 'p-2', postReceiptNotes: '', postReceiptImages: [] })

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/processos']}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <Routes>
            <Route path="/processos" element={<ProcessesPage />} />
          </Routes>
        </ToastProvider>
      </UnsavedChangesProvider>
    </MemoryRouter>
  )
}

async function openDetail(container, user, { desktop }) {
  if (desktop) {
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
    await user.click(container.querySelector('.chg-row__main'))
    await waitFor(() => expect(container.querySelector('.pdv-head')).not.toBeNull())
  } else {
    await waitFor(() => expect(container.querySelector('.m-pc')).not.toBeNull())
    await user.click(container.querySelector('.m-pc'))
    await waitFor(() => expect(container.querySelector('article.process-detail-view')).not.toBeNull())
  }
}

// O bloco legado vive na aba "Processo" (desktop: tablist; celular: select de secoes).
async function openProcessTab(user, { desktop }) {
  if (desktop) {
    await user.click(screen.getByRole('tab', { name: 'Processo' }))
  } else {
    await user.selectOptions(screen.getByLabelText('Seção do processo'), 'process')
  }
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListProcesses.mockReset()
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

const CASES = [
  ['logistica', true],
  ['logistica', false],
  ['admin', true],
  ['admin', false],
]

describe.each(CASES)('S11 (K) pós-recebimento só leitura - %s, desktop=%s', (role, desktop) => {
  beforeEach(() => {
    installMatchMedia({ desktop })
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', name: 'Pessoa', role, favoriteProcessIds: [] },
      toggleFavoriteProcess: vi.fn(),
    })
  })

  it('processo COM pós-recebimento legado: texto e fotos visíveis, galeria abre, sem "Editar observações"', async () => {
    mockListProcesses.mockResolvedValue([WITH_LEGACY])
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user, { desktop })

    expect(screen.queryByRole('button', { name: 'Editar observações' })).not.toBeInTheDocument()
    // o "Status de coleta" segue disponível (só o pós-recebimento deixou de ser editável)
    expect(screen.getByRole('button', { name: 'Status de coleta' })).toBeInTheDocument()

    await openProcessTab(user, { desktop })
    expect(screen.queryByRole('button', { name: 'Editar observações' })).not.toBeInTheDocument()
    expect(screen.getByText('Observações pós-recebimento da carga')).toBeInTheDocument()
    expect(screen.getByText(LEGACY_NOTES)).toBeInTheDocument()
    const photos = container.querySelectorAll('.post-receipt-image-card--detail')
    expect(photos).toHaveLength(2)

    await user.click(photos[1])
    const dialog = await screen.findByRole('dialog', { name: /avaria-b\.jpg/ })
    expect(within(dialog).getByText('2 de 2')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /avaria-b\.jpg/ })).not.toBeInTheDocument())
  })

  it('processo SEM pós-recebimento: sem bloco legado e sem "Editar observações"', async () => {
    mockListProcesses.mockResolvedValue([WITHOUT_LEGACY])
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user, { desktop })

    expect(screen.queryByRole('button', { name: 'Editar observações' })).not.toBeInTheDocument()
    await openProcessTab(user, { desktop })
    expect(screen.queryByText('Observações pós-recebimento da carga')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar observações' })).not.toBeInTheDocument()
  })

  it('Status de coleta: sem "Fotos do recebimento" e sem as fotos legadas para remover', async () => {
    mockListProcesses.mockResolvedValue([WITH_LEGACY])
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user, { desktop })

    await user.click(screen.getByRole('button', { name: 'Status de coleta' }))
    await screen.findByRole('heading', { name: 'Status de coleta' })
    expect(screen.getByText('Houve divergência no recebimento?')).toBeInTheDocument()
    expect(screen.queryByText('Fotos do recebimento')).not.toBeInTheDocument()
    expect(screen.queryByText('Adicionar imagens')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover imagem' })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('Status de coleta com divergência: dica aponta para a Conferência, sem upload; salvar mantém as fotos legadas', async () => {
    const withDivergence = receivedProcess({
      ...WITH_LEGACY,
      receiptDivergence: true,
      receiptDivergenceType: 'Avaria',
      receiptDivergenceNotes: 'Caixas amassadas.',
    })
    mockListProcesses.mockResolvedValue([withDivergence])
    saveProcessCollectionStatus.mockResolvedValue({})
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user, { desktop })

    await user.click(screen.getByRole('button', { name: 'Status de coleta' }))
    await screen.findByRole('heading', { name: 'Status de coleta' })
    expect(
      screen.getByText('Fotos e observações da avaria ficam no item, na Conferência do Relatório de Carga.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/Anexe ao menos 1 foto/)).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Salvar status/i }))
    await waitFor(() => expect(saveProcessCollectionStatus).toHaveBeenCalledTimes(1))
    const savedImages = saveProcessCollectionStatus.mock.calls[0][5]
    expect(savedImages.map((image) => image.id)).toEqual(['img-1', 'img-2'])
  })
})

describe('S11 (K) pendências: divergência não cobra foto', () => {
  it('receiptDivergence true, sem fotos: pende só a descrição', () => {
    const process = {
      name: 'Importação Atlas',
      category: 'FCL',
      destination: 'Hamburg',
      processNumber: 'FCL-2026-001',
      etd: '2026-01-01',
      eta: '2026-01-10',
      items: [{ commercialName: 'Resina', quantity: 10 }],
      containerQuantity: 1,
      containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: 'LACRE-1', type: '40DC' }],
      palletQuantity: 0,
      berthed: false,
      supplierName: 'Fornecedor Atlas',
      originLocation: 'Hamburgo',
      incoterm: 'FOB',
      collectionStatus: 'Carga disponível em estoque',
      receiptDivergence: true,
      receiptDivergenceNotes: '',
      postReceiptImages: [],
    }
    const fields = getPendingFields(process)
    expect(fields.map((field) => field.id)).toContain('receiptDivergenceNotes')
    expect(fields.map((field) => field.id)).not.toContain('receiptDivergencePhoto')
    expect(fields.map((field) => field.label)).not.toContain('Foto da divergência (mín. 1)')
  })
})
