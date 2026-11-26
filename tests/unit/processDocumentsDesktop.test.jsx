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

// S7: `firestore`/`auth` nulos fazem o painel ler os selos de área do Relatório de carga do fallback local (localStorage).
vi.mock('../../src/lib/firebase', () => ({ isFirebaseConfigured: true, firestore: null, auth: null }))

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
// S3 do Relatório de Carga: o formulário é lazy e tem testes próprios
// (tests/unit/cargoReportFormView.test.jsx); aqui só importa a entrada no painel e a volta à lista.
vi.mock('../../src/features/processes/CargoReportForm', () => ({
  default: ({ onClose }) => (
    <div data-testid="cargo-report-form">
      <button type="button" onClick={onClose}>
        ‹ Documentos
      </button>
    </div>
  ),
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

// S7: as ações secundárias do cartão ficam no menu "Ações" (desktop: role="menu"; celular: ActionSheet).
async function openMenu(user, scope) {
  const trigger = within(scope).getByRole('button', { name: /^Ações de / })
  await user.click(trigger)
  return { trigger, menu: within(await screen.findByRole('menu')) }
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
    expect(note).toHaveTextContent(
      /^Visível para COMEX e logística \(Relatório de carga e COA Original também para Técnico e Faturamento\/fiscal\) · PDF, Excel, Word ou imagem até \d+ MB$/
    )
    expect(container.querySelectorAll('.documents-section__note')).toHaveLength(1)
    expect(container.querySelector('.documents-summary__hint')).toBeNull()
  })

  it('legado (sem variante): a nota segue no resumo e nao ha wrapper de grade nem titulo "Documento adicional"', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} />)
    await loaded()
    expect(container.querySelector('.documents-summary__hint')).toHaveTextContent(
      'Visível para COMEX e logística (Relatório de carga e COA Original também para Técnico e Faturamento/fiscal)'
    )
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
  it('slot BL: arquivo atual, Baixar direto, Substituir/Excluir/versao anterior no menu "Ações" e tag "Atual"', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const group = [...container.querySelectorAll('.documents-row-group')].find((el) => el.textContent.includes('BL_MEDU.pdf'))
    expect(group).toBeTruthy()
    expect(within(group).getByText('BL_MEDU.pdf')).toHaveClass('documents-row__file')
    expect(within(group).getByRole('button', { name: 'Baixar BL_MEDU.pdf' })).toHaveTextContent('Baixar')
    expect(within(group).getByText('Atual')).toBeInTheDocument()
    // S7: a versão anterior saiu do corpo do cartão (vira item do menu).
    expect(group.querySelector('.documents-row__previous')).toBeNull()
    expect(within(group).queryByRole('button', { name: 'Substituir BL/AWB' })).not.toBeInTheDocument()

    const { menu } = await openMenu(user, group)
    expect(menu.getByRole('menuitem', { name: 'Substituir BL/AWB' })).toHaveTextContent('Substituir')
    expect(menu.getByRole('menuitem', { name: 'Excluir BL_MEDU.pdf' })).toHaveTextContent('Excluir')
    expect(menu.getByRole('menuitem', { name: 'Baixar versão anterior: BL_antigo.pdf' })).toHaveTextContent('Baixar versão anterior')
    await user.keyboard('{Escape}')

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

  it('documento adicional ja enviado: Renomear e Excluir no menu "Ações" (sem tag de estado)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const group = [...container.querySelectorAll('.documents-row-group')].find((el) => el.textContent.includes('Certificado de análise'))
    const { menu } = await openMenu(user, group)
    expect(menu.getByRole('menuitem', { name: 'Renomear Certificado de análise' })).toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Excluir cert.pdf' })).toBeInTheDocument()
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

  it('"Documentos sem vínculo atual" lista o documento orfao com o motivo e a exclusao (menu "Ações")', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const unlinked = [...container.querySelectorAll('.documents-section')].find((s) => s.textContent.includes('Documentos sem vínculo atual'))
    expect(within(unlinked).getByText('FISPQ_orfa.pdf', { selector: '.documents-row__label' })).toBeInTheDocument()
    expect(within(unlinked).getByText('Item removido')).toBeInTheDocument()
    const { menu } = await openMenu(user, unlinked)
    expect(menu.getByRole('menuitem', { name: 'Excluir FISPQ_orfa.pdf' })).toBeInTheDocument()
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

// S3 do Relatório de Carga: botão de entrada do formulário na linha "Relatório de carga".
describe('S3 - Documentos: entrada do formulário do Relatório de carga', () => {
  const rowOf = (title) =>
    screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
  const cargoDoc = () =>
    doc({
      id: 'c1',
      type: 'cargoReport',
      slotKey: 'cargoReport',
      name: 'rel.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

  it('admin vê "Preencher no Portal" na linha, com e sem arquivo', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    expect(within(rowOf('Relatório de carga')).getByRole('button', { name: 'Preencher no Portal' })).toBeInTheDocument()
    unmount()

    mockListProcessDocuments.mockResolvedValue([...DOCS, cargoDoc()])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const row = rowOf('Relatório de carga')
    expect(within(row).getByRole('button', { name: 'Preencher no Portal' })).toBeInTheDocument()
    const { menu } = await openMenu(user, row)
    expect(menu.getByRole('menuitem', { name: 'Substituir Relatório de carga' })).toBeInTheDocument()
  })

  it('sem arquivo, o envio do admin vira "Enviar arquivo" e o botão novo vem primeiro', async () => {
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getAllByRole('button')[0]).toHaveTextContent('Preencher no Portal')
    expect(within(row).getByRole('button', { name: 'Enviar arquivo' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
  })

  it('logística vê "Conferir relatório" e, no menu "Ações", só Visualizar e Baixar (sem Substituir, Excluir nem "Preencher no Portal")', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([...DOCS, cargoDoc()])
    render(<ProcessDocumentsPanel process={FCL} profile={LOGISTICA} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getByRole('button', { name: 'Conferir relatório' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Preencher no Portal' })).not.toBeInTheDocument()
    const { menu } = await openMenu(user, row)
    expect(menu.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Visualizar', 'Baixar'])
    expect(menu.queryByRole('menuitem', { name: /Substituir|Excluir/ })).not.toBeInTheDocument()
  })

  it.each(['tecnico', 'faturamento'])('%s não vê nenhum dos dois botões', async (role) => {
    mockListProcessDocuments.mockResolvedValue([cargoDoc()])
    render(<ProcessDocumentsPanel process={FCL} profile={{ uid: 'l-1', name: 'Leitor', role }} variant="desktop" />)
    await loaded()

    expect(screen.queryByRole('button', { name: 'Preencher no Portal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Conferir relatório' })).not.toBeInTheDocument()
  })

  it('BL, Invoice e COA Original não ganham o botão', async () => {
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    expect(screen.getAllByRole('button', { name: 'Preencher no Portal' })).toHaveLength(1)
    for (const title of ['BL/AWB', 'Invoice', 'COA Original']) {
      expect(within(rowOf(title)).queryByRole('button', { name: 'Preencher no Portal' })).not.toBeInTheDocument()
    }
  })

  it('clicar abre o formulário no lugar da lista e "‹ Documentos" volta recarregando', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    const loadsBefore = mockListProcessDocuments.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Preencher no Portal' }))
    expect(await screen.findByTestId('cargo-report-form')).toBeInTheDocument()
    expect(screen.queryByText('Documentos do processo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '‹ Documentos' }))
    expect(await screen.findByText('Documentos do processo')).toBeInTheDocument()
    expect(screen.queryByTestId('cargo-report-form')).not.toBeInTheDocument()
    await waitFor(() => expect(mockListProcessDocuments.mock.calls.length).toBeGreaterThan(loadsBefore))
  })
})

// S4 do Relatório de Carga: xlsx anexado pelo "Concluir e anexar" aparece como "Gerado no Portal".
describe('S4 - Documentos: relatório de carga gerado no Portal', () => {
  const rowOf = (title) =>
    screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const portalDoc = (overrides = {}) =>
    doc({
      id: 'c2',
      type: 'cargoReport',
      slotKey: 'cargoReport',
      name: 'FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx',
      mimeType: XLSX_MIME,
      uploadedByRole: 'admin',
      ...overrides,
    })

  it('admin: nome do Portal enviado por admin mostra "Gerado no Portal" e o botão "Abrir formulário"', async () => {
    mockListProcessDocuments.mockResolvedValue([...DOCS, portalDoc()])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getByText('Gerado no Portal')).toHaveClass('documents-row__generated')
    expect(within(row).getByRole('button', { name: 'Abrir formulário' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Preencher no Portal' })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /^Ações de Relatório de carga$/ })).toBeInTheDocument()
  })

  it('xlsx manual continua com "Preencher no Portal" e sem "Gerado no Portal"', async () => {
    mockListProcessDocuments.mockResolvedValue([
      ...DOCS,
      portalDoc({ id: 'c3', name: 'RELATORIO DE CARGA - ACME SEA 021-26.xlsx' }),
    ])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getByRole('button', { name: 'Preencher no Portal' })).toBeInTheDocument()
    expect(within(row).queryByText('Gerado no Portal')).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Abrir formulário' })).not.toBeInTheDocument()
  })

  it('S7: nome do Portal enviado pela logística (fechamento da conferência) conta como gerado no Portal', async () => {
    mockListProcessDocuments.mockResolvedValue([...DOCS, portalDoc({ uploadedByRole: 'logistica' })])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getByText('Gerado no Portal')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Abrir formulário' })).toBeInTheDocument()
  })

  it('nome do Portal enviado por outro perfil não conta como gerado no Portal', async () => {
    mockListProcessDocuments.mockResolvedValue([...DOCS, portalDoc({ uploadedByRole: 'user' })])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).queryByText('Gerado no Portal')).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Preencher no Portal' })).toBeInTheDocument()
  })

  it('logística com o arquivo do Portal continua vendo "Conferir relatório"', async () => {
    mockListProcessDocuments.mockResolvedValue([...DOCS, portalDoc()])
    render(<ProcessDocumentsPanel process={FCL} profile={LOGISTICA} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getByText('Gerado no Portal')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Conferir relatório' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Abrir formulário' })).not.toBeInTheDocument()
  })

  it.each(['tecnico', 'faturamento'])('%s vê "Gerado no Portal" como texto, sem botão novo', async (role) => {
    mockListProcessDocuments.mockResolvedValue([portalDoc()])
    render(<ProcessDocumentsPanel process={FCL} profile={{ uid: 'l-1', name: 'Leitor', role }} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getByText('Gerado no Portal')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Abrir formulário' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Conferir relatório' })).not.toBeInTheDocument()
  })
})

// S7: cartão de documento compacto (botão principal + "Ações"), selos de área e menu acessível.
describe('S7 - Documentos: cartão compacto e menu "Ações"', () => {
  const rowOf = (title) =>
    screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const portalDoc = (overrides = {}) =>
    doc({
      id: 'c2',
      type: 'cargoReport',
      slotKey: 'cargoReport',
      name: 'FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx',
      mimeType: XLSX_MIME,
      uploadedByRole: 'admin',
      ...overrides,
    })
  const withStage = (current, conference) =>
    window.localStorage.setItem('sq-comex-cargo-report:p1', JSON.stringify({ current, conference }))

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('BL e Invoice: "Baixar" direto + "Ações"; COA Original sem arquivo: "Enviar COAs" direto e sem "Ações"', async () => {
    mockListProcessDocuments.mockResolvedValue([
      doc({ id: 'b1', name: 'BL ACME.pdf' }),
      doc({ id: 'i1', type: 'invoice', slotKey: 'invoice', name: 'INV-1.pdf' }),
    ])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    for (const [title, file] of [['BL/AWB', 'BL ACME.pdf'], ['Invoice', 'INV-1.pdf']]) {
      const row = rowOf(title)
      expect(within(row).getByRole('button', { name: `Baixar ${file}` })).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: `Ações de ${title}` })).toHaveAttribute('aria-haspopup', 'menu')
    }
    const coa = rowOf('COA Original')
    expect(within(coa).getByRole('button', { name: 'Enviar COAs' })).toBeInTheDocument()
    expect(within(coa).queryByRole('button', { name: /^Ações de / })).not.toBeInTheDocument()
  })

  it('COA Original (lista): cartão na linha toda, cada arquivo com "Baixar" direto e menu Visualizar / Renomear / Excluir', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      doc({ id: 'k1', type: 'coaOriginal', slotKey: 'coaOriginal:k1', name: 'COA lote 1.pdf', uploadedAt: '2026-09-02T10:00:00.000Z' }),
      doc({ id: 'k0', type: 'coaOriginal', slotKey: 'coaOriginal', name: 'COA antigo.pdf', description: 'Lote antigo', uploadedAt: '2026-09-01T10:00:00.000Z' }),
    ])
    const { container } = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    expect(container.querySelectorAll('.documents-section__rows > .coa-docs')).toHaveLength(1)
    const items = Array.from(container.querySelectorAll('.coa-docs__item'))
    expect(items.map((item) => item.querySelector('.coa-docs__name').textContent)).toEqual(['Lote antigo', 'COA lote 1.pdf'])

    const first = within(items[1])
    expect(first.getByRole('button', { name: 'Baixar COA lote 1.pdf' })).toBeInTheDocument()
    const trigger = first.getByRole('button', { name: 'Ações de COA lote 1.pdf' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await user.click(trigger)
    const menuElement = await screen.findByRole('menu', { name: 'Ações de COA lote 1.pdf' })
    const entries = within(menuElement).getAllByRole('menuitem')
    expect(entries.map((item) => item.textContent)).toEqual(['Visualizar', 'Renomear', 'Excluir'])
    expect(entries[2]).toHaveClass('process-detail-more__item--danger')
    expect(menuElement.querySelector('[role="separator"] + [role="menuitem"]')).toHaveTextContent('Excluir')
  })

  it('COA Original: leitores (técnico/faturamento) recebem só Visualizar no menu e nenhum botão de envio', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      doc({ id: 'k1', type: 'coaOriginal', slotKey: 'coaOriginal:k1', name: 'COA lote 1.pdf' }),
    ])
    const { container } = render(
      <ProcessDocumentsPanel process={FCL} profile={{ uid: 't-1', name: 'Téc', role: 'tecnico' }} variant="desktop" />
    )
    await loaded()

    const item = within(container.querySelector('.coa-docs__item'))
    expect(item.getByRole('button', { name: 'Baixar COA lote 1.pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Enviar|^Adicionar COAs/ })).not.toBeInTheDocument()
    await user.click(item.getByRole('button', { name: 'Ações de COA lote 1.pdf' }))
    const menuElement = within(await screen.findByRole('menu'))
    expect(menuElement.getAllByRole('menuitem').map((entry) => entry.textContent)).toEqual(['Visualizar'])
  })

  it('o menu usa role="menu", itens menuitem, Excluir separado e em vermelho, e some ao escolher o item', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([doc({ id: 'b1', name: 'BL ACME.pdf' })])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const row = rowOf('BL/AWB')
    const trigger = within(row).getByRole('button', { name: 'Ações de BL/AWB' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)

    const menuElement = await screen.findByRole('menu', { name: 'Ações de BL/AWB' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', menuElement.id)
    expect(menuElement).toHaveClass('process-detail-more__menu')
    const items = within(menuElement).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Substituir', 'Excluir'])
    expect(items[1]).toHaveClass('process-detail-more__item--danger')
    expect(within(menuElement).getByRole('separator')).toBeInTheDocument()
    // A separação vem ANTES do Excluir, não depois do Substituir.
    expect(menuElement.querySelector('[role="separator"] + [role="menuitem"]')).toHaveTextContent('Excluir')

    await user.click(items[1])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })

  it('teclado: ao abrir o foco vai ao 1º item; setas, Home e End navegam em ciclo; Esc fecha e devolve o foco ao botão', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      doc({ id: 'b1', name: 'BL_novo.pdf', uploadedAt: '2026-09-18T10:00:00.000Z' }),
      doc({ id: 'b0', name: 'BL_velho.pdf', uploadedAt: '2026-09-10T10:00:00.000Z' }),
    ])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const trigger = within(rowOf('BL/AWB')).getByRole('button', { name: 'Ações de BL/AWB' })
    trigger.focus()
    await user.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items).toHaveLength(3)
    await waitFor(() => expect(items[0]).toHaveFocus())

    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(items[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items[2]).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('ArrowDown no botão abre o menu; clicar fora e Tab fecham', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([doc({ id: 'b1', name: 'BL ACME.pdf' })])
    render(
      <div>
        <button type="button">fora</button>
        <ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />
      </div>
    )
    await loaded()

    const trigger = within(rowOf('BL/AWB')).getByRole('button', { name: 'Ações de BL/AWB' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'fora' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    await user.click(trigger)
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Tab}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('Esc depois de abrir o renomear devolve o foco ao botão "Ações" (de onde o item saiu)', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      doc({ id: 'o1', type: 'other', slotKey: 'other:cert', name: 'cert.pdf', description: 'Certificado' }),
    ])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const { trigger, menu } = await openMenu(user, rowOf('Certificado'))
    await user.click(menu.getByRole('menuitem', { name: 'Renomear Certificado' }))
    expect(await screen.findByRole('dialog', { name: 'Renomear documento' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Relatório de carga: versão anterior (COMEX) vira item do menu com tamanho e data, e baixa o documento anterior', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockListProcessDocuments.mockResolvedValue([
      portalDoc({ id: 'cr-comex', size: 41 * 1024, uploadedAt: '2026-11-24T14:32:00.000Z', uploadedByRole: 'admin' }),
      portalDoc({ id: 'cr-log', size: 44 * 1024, uploadedAt: '2026-11-24T16:05:00.000Z', uploadedByRole: 'logistica', uploadedByName: 'Operador Logística' }),
    ])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).getByText('Gerado no Portal')).toBeInTheDocument()
    expect(row.closest('.documents-row-group').querySelector('.documents-row__previous')).toBeNull()
    const { menu } = await openMenu(user, row)
    expect(menu.getAllByRole('menuitem').map((item) => item.querySelector('span > span')?.textContent)).toEqual([
      'Visualizar',
      'Baixar',
      'Substituir',
      'Baixar versão anterior (COMEX)',
      'Excluir',
    ])
    const previous = menu.getByRole('menuitem', { name: /^Baixar versão anterior \(COMEX\)/ })
    expect(previous).toHaveTextContent('41 KB')
    expect(previous).toHaveTextContent('24/11/2026')
    await user.click(previous)
    await waitFor(() => expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'cr-comex'))
  })

  it('selos de área do Relatório de carga numa linha só (classe docs-chips), um por estado', async () => {
    mockListProcessDocuments.mockResolvedValue([portalDoc()])
    const labels = (container) =>
      [...container.querySelectorAll('.docs-chips .inline-badge')].map((badge) => badge.textContent)

    withStage(null, null)
    const draft = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    await waitFor(() => expect(labels(draft.container)).toEqual(['COMEX: Rascunho', 'Logística: Aguardando']))
    expect(draft.container.querySelectorAll('.docs-chips')).toHaveLength(1)
    draft.unmount()

    withStage({ status: 'concluido', revision: 3 }, { status: 'aberta', revision: 1 })
    const comexClosed = render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} variant="desktop" />)
    await loaded()
    await waitFor(() => expect(labels(comexClosed.container)).toEqual(['COMEX: Fechado', 'Logística: Em conferência']))
    comexClosed.unmount()

    withStage({ status: 'concluido', revision: 3 }, { status: 'fechada', revision: 2 })
    const done = render(<ProcessDocumentsPanel process={FCL} profile={LOGISTICA} variant="desktop" />)
    await loaded()
    await waitFor(() => expect(labels(done.container)).toEqual(['COMEX: Fechado', 'Logística: Fechada']))
  })

  it('tecnico e faturamento não leem current/conference: sem selos de área', async () => {
    mockListProcessDocuments.mockResolvedValue([portalDoc()])
    withStage({ status: 'concluido', revision: 3 }, { status: 'fechada', revision: 2 })
    render(<ProcessDocumentsPanel process={FCL} profile={{ uid: 'l-1', name: 'Leitor', role: 'tecnico' }} variant="desktop" />)
    await loaded()
    expect(document.querySelector('.docs-chips')).toBeNull()
  })

  it('no celular (sem variant "desktop") o "Ações" abre o ActionSheet com ícones, dica da versão anterior e Excluir destrutivo', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      portalDoc({ id: 'cr-comex', size: 41 * 1024, uploadedAt: '2026-11-24T14:32:00.000Z' }),
      portalDoc({ id: 'cr-log', size: 44 * 1024, uploadedAt: '2026-11-24T16:05:00.000Z', uploadedByRole: 'logistica' }),
    ])
    render(<ProcessDocumentsPanel process={FCL} profile={ADMIN} />)
    await loaded()

    const trigger = within(rowOf('Relatório de carga')).getByRole('button', { name: 'Ações de Relatório de carga' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    await user.click(trigger)

    const sheet = await screen.findByRole('dialog', { name: 'Relatório de carga' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const options = within(sheet).getAllByRole('button').filter((button) => button.classList.contains('action-sheet__option'))
    expect(options).toHaveLength(5)
    expect(options.every((option) => option.querySelector('svg'))).toBe(true)
    const destructive = within(sheet).getByRole('button', { name: /^Excluir / })
    expect(destructive).toHaveClass('action-sheet__option--danger')
    expect(within(sheet).getByRole('button', { name: /^Baixar versão anterior \(COMEX\)/ })).toHaveTextContent('41 KB')
    expect(within(sheet).getByRole('separator')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Relatório de carga' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
