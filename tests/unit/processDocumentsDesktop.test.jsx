// Refino F4c: aba Documentos no desktop (Processo.dc.html). O ProcessDocumentsPanel
// recebe `variant="desktop"` do detalhe; o visual (cartoes em grade, estados enviado /
// pendente) e' CSS (testado em refinoVisual.test.js). Aqui: o markup que muda por
// variante (nota de visibilidade no cabecalho, wrapper de grade, "Documento adicional"),
// as acoes por slot (Baixar, Substituir, Renomear, Excluir, Separar, "contem Packing
// List"), FISPQ por item, lavacao por contêiner, "Documentos sem vinculo atual" e a
// versao legada (tablet/mobile) intacta. Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../src/lib/firebase', () => ({ isFirebaseConfigured: true }))

const mockListProcessDocuments = vi.fn()
const mockUploadProcessDocument = vi.fn()
const mockDeleteProcessDocument = vi.fn()
const mockDownloadProcessDocumentBlob = vi.fn()
const mockSaveBlobAsFile = vi.fn()
const mockSetInvoicePackingListLink = vi.fn()
const mockRenameAdditionalDocument = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: (...args) => mockListProcessDocuments(...args),
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
  deleteProcessDocument: (...args) => mockDeleteProcessDocument(...args),
  downloadProcessDocumentBlob: (...args) => mockDownloadProcessDocumentBlob(...args),
  saveBlobAsFile: (...args) => mockSaveBlobAsFile(...args),
  setInvoicePackingListLink: (...args) => mockSetInvoicePackingListLink(...args),
  renameAdditionalDocument: (...args) => mockRenameAdditionalDocument(...args),
}))
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: vi.fn().mockResolvedValue([]),
}))

import ProcessDocumentsPanel from '../../src/features/processes/ProcessDocumentsPanel'
import ProcessDetailView from '../../src/features/processes/ProcessDetailView'

const ADMIN = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Ana', role: 'logistica' }

const FCL = {
  id: 'p1',
  name: 'Resina',
  category: 'FCL',
  processNumber: '4500128734',
  destination: 'Itajaí',
  processStatus: 'Embarcou',
  shippedAt: '2026-09-12',
  items: [
    { id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, unNumber: '1993', imoClass: '3' },
    { id: 'ITEM-2', commercialName: 'Endurecedor', dangerousGoods: true },
  ],
  containers: [
    { id: 'CNT-1', number: 'MSCU1234567', returnedAt: '2026-09-01' },
    { id: 'CNT-2', number: 'MSCU7654321', returnedAt: '' },
  ],
}

const doc = (overrides) => ({
  id: 'd',
  type: 'bl',
  slotKey: 'bl',
  name: 'bl.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  storagePath: 'processes/p1/documents/bl/1.pdf',
  uploadedAt: '2026-09-01T10:00:00.000Z',
  uploadedById: 'admin-1',
  uploadedByName: 'Admin',
  uploadedByRole: 'admin',
  ...overrides,
})

const DOCS = [
  doc({ id: 'bl-new', name: 'BL_MEDU.pdf', uploadedAt: '2026-09-18T10:00:00.000Z' }),
  doc({ id: 'bl-old', name: 'BL_antigo.pdf', uploadedAt: '2026-09-10T10:00:00.000Z' }),
  doc({ id: 'inv', type: 'invoice', slotKey: 'invoice', name: 'INV-2026.pdf', alsoPackingList: true }),
  doc({ id: 'oth', type: 'other', slotKey: 'other:cert', name: 'cert.pdf', description: 'Certificado de análise' }),
  doc({ id: 'fq1', type: 'fispq', slotKey: 'fispq:ITEM-1', name: 'FISPQ_EP128.pdf' }),
  // sem vinculo atual: o item foi removido do processo
  doc({ id: 'orf', type: 'fispq', slotKey: 'fispq:ITEM-REMOVIDO', name: 'FISPQ_orfa.pdf' }),
]

async function loaded() {
  await waitFor(() => {
    expect(mockListProcessDocuments).toHaveBeenCalled()
    expect(screen.queryByLabelText('Carregando documentos')).not.toBeInTheDocument()
  })
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia

beforeEach(() => {
  vi.clearAllMocks()
  mockListProcessDocuments.mockResolvedValue(DOCS)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
})

describe('F4c - Documentos: markup da variante desktop', () => {
  it('a nota de visibilidade vai para o cabecalho da secao (1 vez) e sai do resumo', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const note = container.querySelector('.documents-section--process .documents-section__header .documents-section__note')
    expect(note).toHaveTextContent(/^Visível só para COMEX e logística · PDF, Excel, Word ou imagem até \d+ MB$/)
    expect(container.querySelectorAll('.documents-section__note')).toHaveLength(1)
    expect(container.querySelector('.documents-summary__hint')).toBeNull()
  })

  it('legado (sem variante): a nota segue no resumo e nao ha wrapper de grade nem titulo "Documento adicional"', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} />)
    await loaded()
    expect(container.querySelector('.documents-summary__hint')).toHaveTextContent('Visível só para COMEX e logística')
    expect(container.querySelector('.documents-section__note')).toBeNull()
    // o mobile-redesign mira `.documents-section__rows >` so no 1o grupo (secao do processo)
    expect(container.querySelectorAll('.documents-section__rows')).toHaveLength(1)
    expect(container.querySelector('.documents-add-other__head')).toBeNull()
  })

  it('desktop: FISPQ, lavacao e "sem vinculo" ganham o wrapper de grade igual ao da secao do processo', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const sections = [...container.querySelectorAll('.documents-section')]
    const withRows = sections.map((section) => [
      section.querySelector('.documents-section__title').textContent,
      Boolean(section.querySelector(':scope > .documents-section__rows')),
    ])
    expect(withRows).toEqual([
      ['Documentos do processo', true],
      ['FISPQ por item', true],
      ['Relatório de lavação por contêiner', true],
      ['Documentos sem vínculo atual', true],
    ])
  })

  it('"Documento adicional": titulo, tag "Opcional", campo de nome e botao de adicionar (so quem pode enviar)', async () => {
    const { container, unmount } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const head = container.querySelector('.documents-add-other__head')
    expect(head).toHaveTextContent('Documento adicional')
    expect(head).toHaveTextContent('Opcional')
    expect(screen.getByLabelText('Nome do documento (opcional)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Adicionar outro documento/ })).toBeInTheDocument()
    unmount()
    const logistica = render(<ProcessDocumentsPanel process={FCL} profile={LOGISTICA} variant="desktop" />)
    await waitFor(() => expect(logistica.container.querySelector('.documents-section')).not.toBeNull())
    expect(logistica.container.querySelector('.documents-add-other__head')).toBeNull()
  })
})

describe('F4c - Documentos: nenhuma acao se perde no desktop', () => {
  it('slot BL: arquivo atual, Baixar, Substituir, Excluir, tag "Atual" e versao anterior com Baixar', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const group = [...container.querySelectorAll('.documents-row-group')].find((el) => el.textContent.includes('BL_MEDU.pdf'))
    expect(group).toBeTruthy()
    expect(within(group).getByText('BL_MEDU.pdf')).toHaveClass('documents-row__file')
    expect(within(group).getByRole('button', { name: 'Baixar BL_MEDU.pdf' })).toHaveTextContent('Baixar')
    expect(within(group).getByRole('button', { name: 'Substituir BL/AWB' })).toHaveTextContent('Substituir')
    expect(within(group).getByRole('button', { name: 'Excluir BL_MEDU.pdf' })).toHaveTextContent('Excluir')
    expect(within(group).getByText('Atual')).toBeInTheDocument()
    expect(group.querySelector('.documents-row__previous')).toHaveTextContent('Versão anterior: BL_antigo.pdf')
    await user.click(within(group).getByRole('button', { name: 'Baixar BL_MEDU.pdf' }))
    await waitFor(() => expect(mockDownloadProcessDocumentBlob).toHaveBeenCalled())
  })

  it('Invoice com "contem Packing List": Packing List mostra "Incluído na Invoice" com Baixar e Separar', async () => {
    const user = userEvent.setup()
    mockSetInvoicePackingListLink.mockResolvedValue(undefined)
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const group = [...container.querySelectorAll('.documents-row-group')].find((el) => el.textContent.includes('Packing List') && el.textContent.includes('Incluído na Invoice'))
    expect(group).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Baixar INV-2026.pdf' })).toBeInTheDocument()
    await user.click(within(group).getByRole('button', { name: 'Separar Packing List da Invoice' }))
    await waitFor(() => expect(mockSetInvoicePackingListLink).toHaveBeenCalled())
  })

  it('documento adicional ja enviado: Renomear e Excluir (sem tag de estado)', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const group = [...container.querySelectorAll('.documents-row-group')].find((el) => el.textContent.includes('Certificado de análise'))
    expect(within(group).getByRole('button', { name: 'Renomear Certificado de análise' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Excluir cert.pdf' })).toBeInTheDocument()
    expect(group.querySelector('.documents-row__badge .inline-badge')).toBeNull()
  })

  it('FISPQ por item IMO: enviada (Baixar/Substituir) e pendente ("Enviar FISPQ" + tag Pendente)', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const fispq = [...container.querySelectorAll('.documents-section')].find((s) => s.textContent.includes('FISPQ por item'))
    const sent = within(fispq).getByText('Resina Atlas').closest('.documents-row-group')
    expect(within(sent).getByText('Enviada')).toBeInTheDocument()
    expect(within(sent).getByText('ONU 1993')).toBeInTheDocument()
    expect(within(sent).getByRole('button', { name: 'Baixar FISPQ_EP128.pdf' })).toBeInTheDocument()
    const pending = within(fispq).getByText('Endurecedor').closest('.documents-row-group')
    expect(within(pending).getByText('Pendente')).toBeInTheDocument()
    expect(within(pending).getByRole('button', { name: 'Enviar FISPQ' })).toBeInTheDocument()
  })

  it('lavacao por contêiner: devolvido sem relatorio = pendente; nao devolvido = ainda nao exigido', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const wash = [...container.querySelectorAll('.documents-section')].find((s) => s.textContent.includes('Relatório de lavação por contêiner'))
    const returned = within(wash).getByText('MSCU1234567').closest('.documents-row-group')
    expect(within(returned).getByText('Pendente')).toBeInTheDocument()
    expect(within(returned).getByRole('button', { name: 'Enviar relatório' })).toBeInTheDocument()
    const notYet = within(wash).getByText('MSCU7654321').closest('.documents-row-group')
    expect(within(notYet).getByText('Ainda não exigido')).toBeInTheDocument()
  })

  it('"Documentos sem vínculo atual" lista o documento orfao com o motivo e a exclusao', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const unlinked = [...container.querySelectorAll('.documents-section')].find((s) => s.textContent.includes('Documentos sem vínculo atual'))
    expect(within(unlinked).getByText('FISPQ_orfa.pdf', { selector: '.documents-row__label' })).toBeInTheDocument()
    expect(within(unlinked).getByText('Item removido')).toBeInTheDocument()
    expect(within(unlinked).getByRole('button', { name: 'Excluir FISPQ_orfa.pdf' })).toBeInTheDocument()
  })

  it('CONSOLIDADO: tabela "Invoice e Packing List por PO" com o nome do processo (so quem ve) e envio por PO', async () => {
    mockListProcessDocuments.mockResolvedValue([])
    const consolidated = {
      ...FCL,
      category: 'CONSOLIDADO',
      processNumber: '',
      containers: [],
      items: [],
      purchaseOrders: [
        { po: '9010', reference: 'ALFA SEA 905-26' },
        { po: '9011', reference: 'GAMA SEA 906-26' },
      ],
    }
    const { container } = render(<ProcessDocumentsPanel process={consolidated} profile={ADMIN} variant="desktop" />)
    await loaded()
    const table = screen.getByRole('table', { name: 'Invoice e Packing List por PO' })
    expect(within(table).getByText('ALFA SEA 905-26')).toBeInTheDocument()
    expect(within(table).getAllByRole('button', { name: 'Enviar' }).length).toBe(4)
    expect(container.querySelector('.documents-po-table-wrap')).not.toBeNull()
  })

  it('estado vazio e erro de carregamento continuam (sem nota no cabecalho quando nao ha documentos)', async () => {
    mockListProcessDocuments.mockResolvedValue([])
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    expect(container.querySelector('.documents-empty-state')).toHaveTextContent('Nenhum documento ainda')
    expect(container.querySelector('.documents-section__note')).toBeNull()
  })
})

describe('F4c - Documentos dentro do detalhe desktop', () => {
  function installDesktop() {
    window.matchMedia = vi.fn((query) => ({
      matches: query.includes('1041'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
  }

  const props = (overrides = {}) => ({
    selectedProcess: { ...FCL, documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] } },
    detailTab: 'documents',
    isAdmin: true,
    canSeeName: true,
    isSaving: false,
    favoriteProcessIds: [],
    canEditPostReceiptNotes: false,
    canEditSelectedCollectionStatus: false,
    itemSearchTerm: '',
    selectedItemName: '',
    processMessages: [],
    isLoadingMessages: false,
    messageDraft: '',
    deletingMessageId: '',
    isSendingMessage: false,
    messageLimitReached: false,
    remainingMessages: 8,
    hasUnlimitedMessages: false,
    visibleProcessItems: [],
    relatedActiveProcesses: [],
    selectedProcessPostReceiptImages: [],
    profile: ADMIN,
    itemsSectionRef: { current: null },
    onDetailTabChange: vi.fn(),
    onSetItemSearchTerm: vi.fn(),
    onMessageDraftChange: vi.fn(),
    onOpenRelatedItemTab: vi.fn(),
    onOpenProcessDetail: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSetViewModeList: vi.fn(),
    onEditMode: vi.fn(),
    onPostReceiptEditMode: vi.fn(),
    onCollectionStatusEditMode: vi.fn(),
    onOpenPostReceiptGallery: vi.fn(),
    onDeleteProcess: vi.fn(),
    onSendMessage: vi.fn(),
    onDeleteMessage: vi.fn(),
    ...overrides,
  })

  it('o detalhe desktop passa variant="desktop" ao painel; o contador "N pendentes" da aba segue o painel', async () => {
    installDesktop()
    const { container } = render(<ProcessDetailView {...props()} />)
    await loaded()
    expect(container.querySelector('.pdv-panel--documents .documents-section__note')).not.toBeNull()
    expect(screen.getByRole('tab', { name: /Documentos/ }).querySelector('.documents-tab-count')).toHaveTextContent(/pendentes?$/)
  })

  it('tablet (arvore legada): painel sem variante (nota no resumo)', async () => {
    window.matchMedia = ORIGINAL_MATCH_MEDIA
    const { container } = render(<ProcessDetailView {...props()} />)
    await loaded()
    expect(container.querySelector('.documents-summary__hint')).not.toBeNull()
    expect(container.querySelector('.documents-section__note')).toBeNull()
  })
})
