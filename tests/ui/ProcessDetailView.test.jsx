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
    licenses: [],
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    // F17.3a (D-1): chegada com data, CE/terminal, free time, presenca.
    berthedAt: '',
    arrivedAt: '',
    cargoPresenceInformedAt: '',
    ceMercante: '',
    ceHouse: '',
    terminalName: '',
    freeTimeDays: null,
    demurrageDailyRateUsd: null,
    migratedApproxFields: [],
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

// F17.2b (D-6): card "Anuências" - substitui o card MAPA legado.
describe('ProcessDetailView — card "Anuências" (F17.2b)', () => {
  it('licença MAPA Deferida renderiza o card com "MAPA" e "Deferida"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        licenses: [{ id: 'LIC-1', agency: 'MAPA', lpcoNumber: '', status: 'Deferida', inspectionScheduledAt: '', deferredAt: '', notes: '' }],
      }),
    })
    expect(screen.getByText('Anuências')).toBeInTheDocument()
    expect(screen.getByText(/MAPA/)).toBeInTheDocument()
    expect(screen.getByText(/Deferida/)).toBeInTheDocument()
  })

  it('sem licenças o card não existe', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ licenses: [] }),
    })
    expect(screen.queryByText('Anuências')).not.toBeInTheDocument()
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

// F17.3a (D-12): card "Chegada" + card "Free time".
describe('ProcessDetailView — card "Chegada" (F17.3a)', () => {
  it('atracação com data aproximada mostra "(aprox.)"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        category: 'FCL',
        berthed: true,
        berthedAt: '2026-09-20T10:00',
        migratedApproxFields: ['berthedAt'],
      }),
    })
    expect(screen.getByText(/Atracação:/)).toBeInTheDocument()
    expect(screen.getByText(/\(aprox\.\)/)).toBeInTheDocument()
  })

  it('legado berthed sem data mostra "Confirmada (sem data)"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'FCL', berthed: true, berthedAt: '' }),
    })
    expect(screen.getByText(/Confirmada \(sem data\)/)).toBeInTheDocument()
  })

  it('sem sinal de chegada nao renderiza o card "Chegada"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'FCL' }),
    })
    // "Chegada" tambem aparece como rotulo da timeline (F16.5) - filtra so
    // o card (`span.detail-label`).
    expect(screen.queryByText('Chegada', { selector: 'span.detail-label' })).not.toBeInTheDocument()
  })
})

describe('ProcessDetailView — card "Free time" (F17.3a)', () => {
  it('waiting-presence mostra "inicia na presença de carga"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        category: 'FCL',
        berthed: true,
        berthedAt: '2026-09-20T10:00',
        freeTimeDays: 7,
      }),
    })
    expect(screen.getByText(/inicia na presença de carga/)).toBeInTheDocument()
  })

  it('prazo vencido mostra badge de aviso (datas relativas a hoje)', () => {
    const today = new Date()
    const presenceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10)
    const presenceIso = `${presenceDate.getFullYear()}-${String(presenceDate.getMonth() + 1).padStart(2, '0')}-${String(presenceDate.getDate()).padStart(2, '0')}T10:00`
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        category: 'FCL',
        berthed: true,
        berthedAt: '2026-09-20T10:00',
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: presenceIso,
        freeTimeDays: 5,
      }),
    })
    expect(screen.getByText(/vencido há/)).toBeInTheDocument()
  })

  it('freeTimeDays nao informado (null) nao renderiza o card', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'FCL', freeTimeDays: null }),
    })
    expect(screen.queryByText('Free time')).not.toBeInTheDocument()
  })

  it('LCL nunca renderiza o card Free time', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'LCL', freeTimeDays: 5 }),
    })
    expect(screen.queryByText('Free time')).not.toBeInTheDocument()
  })
})

// F17.2c (D-10): card "POs consolidadas" + PO por item na aba Itens.
describe('ProcessDetailView — POs do consolidado (F17.2c)', () => {
  it('CONSOLIDADO com purchaseOrders renderiza o card "POs consolidadas"', () => {
    renderDetail({
      detailTab: 'general',
      selectedProcess: makeProcess({ category: 'CONSOLIDADO', purchaseOrders: ['PO-A', 'PO-B'] }),
    })
    expect(screen.getByText('POs consolidadas')).toBeInTheDocument()
    expect(screen.getByText('PO-A, PO-B')).toBeInTheDocument()
  })

  it('FCL nao renderiza o card "POs consolidadas"', () => {
    renderDetail({
      detailTab: 'general',
      selectedProcess: makeProcess({ category: 'FCL' }),
    })
    expect(screen.queryByText('POs consolidadas')).not.toBeInTheDocument()
  })

  it('aba Itens do CONSOLIDADO mostra a PO do item', () => {
    renderDetail({
      detailTab: 'items',
      selectedProcess: makeProcess({ category: 'CONSOLIDADO' }),
      visibleProcessItems: [{ id: 'i1', commercialName: 'Item A', quantity: 1, poNumber: 'PO-A' }],
    })
    expect(screen.getByText('PO:')).toBeInTheDocument()
    expect(screen.getByText('PO-A')).toBeInTheDocument()
  })
})
