// Campo TRANSPORTADORA (PLAN.md — campo transportadora no fluxo de coleta):
// card de LEITURA (sem <input>/<textarea>) na aba "Processo" do detalhe,
// visível a partir de "Coleta Agendada" (inclusive) em diante — usa
// `isCollectionScheduledOrBeyondStatus` (módulo REAL, sem mock).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ProcessDetailView from '../../src/features/processes/ProcessDetailView'

const mockListProcessEvents = vi.fn().mockResolvedValue([])
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: (...args) => mockListProcessEvents(...args),
}))

function makeProcess(overrides = {}) {
  return {
    id: 'p-1',
    name: 'Processo teste',
    category: 'FCL',
    processNumber: 'PO-1',
    destination: 'Itajaí',
    etd: '',
    eta: '',
    etaOriginal: '',
    processStatus: 'Aguardando Embarque',
    containerQuantity: 1,
    palletQuantity: 0,
    processNotes: '',
    carrierName: '',
    warehouseDeliveryDateOverride: '',
    postReceiptNotes: '',
    postReceiptImages: [],
    cargoReceivedAt: '',
    items: [],
    berthed: false,
    arrived: false,
    cargoPresenceInformed: false,
    duimpStatus: '',
    parameterizationChannel: '',
    collectionStatus: '',
    collectionWindows: [],
    collectionScheduledAt: '',
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    ...overrides,
  }
}

function renderDetail(props = {}) {
  const defaultProps = {
    selectedProcess: makeProcess(),
    detailTab: 'process',
    isAdmin: false,
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
    remainingMessages: 0,
    hasUnlimitedMessages: false,
    visibleProcessItems: [],
    relatedActiveProcesses: [],
    selectedProcessPostReceiptImages: [],
    profile: { name: 'Teste' },
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
  }
  return render(<ProcessDetailView {...defaultProps} {...props} />)
}

describe('ProcessDetailView — card "Transportadora" (aba Processo)', () => {
  it('coleta agendada + carrierName preenchido: mostra rótulo e valor', () => {
    renderDetail({
      selectedProcess: makeProcess({ collectionStatus: 'Coleta Agendada', carrierName: 'Rapido Sul' }),
    })
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    expect(screen.getByText('Rapido Sul')).toBeInTheDocument()
  })

  it('status posterior à coleta agendada (Carga recebida) continua mostrando o card', () => {
    renderDetail({
      selectedProcess: makeProcess({ collectionStatus: 'Carga recebida', carrierName: 'Rapido Sul' }),
    })
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    expect(screen.getByText('Rapido Sul')).toBeInTheDocument()
  })

  it('status pré-coleta (Aguardando agendamento): card ausente', () => {
    renderDetail({
      selectedProcess: makeProcess({ collectionStatus: 'Aguardando agendamento', carrierName: 'Rapido Sul' }),
    })
    expect(screen.queryByText('Transportadora')).not.toBeInTheDocument()
  })

  it('mesmo com isAdmin true, o card é somente leitura (sem input/textarea)', () => {
    const { container } = renderDetail({
      isAdmin: true,
      selectedProcess: makeProcess({ collectionStatus: 'Coleta Agendada', carrierName: 'Rapido Sul' }),
    })
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    expect(container.querySelector('input')).not.toBeInTheDocument()
    expect(container.querySelector('textarea')).not.toBeInTheDocument()
  })
})

// F17.1a (D-E): card "Dados pendentes" na aba "Detalhes gerais", admin-only.
describe('ProcessDetailView — card "Dados pendentes" (F17.1a)', () => {
  it('admin ve o card quando ha campos faltando (etd/eta vazios no fixture)', () => {
    renderDetail({
      isAdmin: true,
      detailTab: 'general',
      selectedProcess: makeProcess(),
    })
    expect(screen.getByText('Dados pendentes')).toBeInTheDocument()
  })

  it('user/logistica (isAdmin false) NAO ve o card mesmo com campos faltando', () => {
    renderDetail({
      isAdmin: false,
      detailTab: 'general',
      selectedProcess: makeProcess(),
    })
    expect(screen.queryByText('Dados pendentes')).not.toBeInTheDocument()
  })
})

// F17.1b: aba "Histórico" — painel autocarregado via listProcessEvents.
describe('ProcessDetailView — aba "Histórico" (F17.1b)', () => {
  it('detailTab="history" renderiza o painel e chama listProcessEvents(selectedProcess.id)', async () => {
    renderDetail({
      detailTab: 'history',
      selectedProcess: makeProcess({ id: 'p-history' }),
    })
    await waitFor(() => expect(mockListProcessEvents).toHaveBeenCalledWith('p-history'))
    expect(screen.getByText('Histórico de marcos')).toBeInTheDocument()
  })

  it('a opção/botão "Histórico" aparece para isAdmin true', () => {
    renderDetail({ isAdmin: true })
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument()
  })

  it('a opção/botão "Histórico" aparece para isAdmin false', () => {
    renderDetail({ isAdmin: false })
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument()
  })

  it('clicar no botão "Histórico" chama onDetailTabChange("history")', () => {
    const onDetailTabChange = vi.fn()
    renderDetail({ onDetailTabChange })
    screen.getByRole('button', { name: 'Histórico' }).click()
    expect(onDetailTabChange).toHaveBeenCalledWith('history')
  })
})

describe('ProcessDetailView — fornecedor mascarado (F17.2a D-8)', () => {
  it('FCL: supplierName NÃO aparece com canSeeName=false', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: false,
      selectedProcess: makeProcess({ category: 'FCL', supplierName: 'Fornecedor Atlas' }),
    })
    expect(screen.queryByText('Fornecedor Atlas')).not.toBeInTheDocument()
  })

  it('FCL: supplierName aparece com canSeeName=true', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: true,
      selectedProcess: makeProcess({ category: 'FCL', supplierName: 'Fornecedor Atlas' }),
    })
    expect(screen.getByText('Fornecedor: Fornecedor Atlas')).toBeInTheDocument()
  })

  it('CONSOLIDADO: supplierName aparece para ambos (não é categoria restrita)', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: false,
      selectedProcess: makeProcess({ category: 'CONSOLIDADO', supplierName: 'Fornecedor Delta' }),
    })
    expect(screen.getByText('Fornecedor: Fornecedor Delta')).toBeInTheDocument()
  })
})
