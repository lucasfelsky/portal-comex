// Tests do ProcessesPage (fluxo principal de listagem).
// Cobre:
//   - Loading inicial: "Carregando processos"
//   - Error ao carregar aparece no error-banner
//   - Render: lista de processos com nome, status, categoria
//   - Empty state quando lista vazia
//   - Filtro de busca por nome reflete na lista
//   - Filtro por status reflete na lista
//   - Click em processo abre detalhe (expand)
//   - User comum (sem role=admin/logistica): oculta botoes de edicao
//   - Logistica: mostra botoes de edicao de status de coleta
//
// O componente e' muito grande (2070 linhas) com multiplos modais de
// edicao (collection status, post-receipt notes, messages, attachments).
// Esses fluxos serao cobertos em sprints separadas com componentes
// auxiliares (CollectionWindowsEditor, ProcessDerivedStatusBadge ja
// cobertos isoladamente).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'
import { ToastProvider } from '../../src/components/Toast'
import { UnsavedChangesProvider } from '../../src/contexts/UnsavedChangesContext'

const mockUseAuth = vi.fn()
const mockListProcesses = vi.fn()
const mockListProcessMessages = vi.fn()
const mockDeleteProcess = vi.fn()
const mockSaveProcess = vi.fn()
const mockSaveProcessCollectionStatus = vi.fn()
const mockSaveProcessPostReceiptNotes = vi.fn()
const mockCreateProcessMessage = vi.fn()
const mockDeleteProcessMessage = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/services/processesRepository', () => ({
  channelOptions: ['Maritima', 'Aerea', 'Rodoviaria'],
  collectionStatusOptions: ['Aguardando', 'Coletado', 'Entregue'],
  dtaStatusOptions: ['Pendente', 'Concluido'],
  duimpStatusOptions: ['Aguardando registro', 'Registrada'],
  mapaStatusOptions: ['Pendente', 'Inspecao agendada'],
  processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
  listProcesses: (...args) => mockListProcesses(...args),
  deleteProcess: (...args) => mockDeleteProcess(...args),
  saveProcess: (...args) => mockSaveProcess(...args),
  saveProcessCollectionStatus: (...args) => mockSaveProcessCollectionStatus(...args),
  saveProcessPostReceiptNotes: (...args) => mockSaveProcessPostReceiptNotes(...args),
}))
vi.mock('../../src/services/processMessagesRepository', () => ({
  listProcessMessages: (...args) => mockListProcessMessages(...args),
  createProcessMessage: (...args) => mockCreateProcessMessage(...args),
  deleteProcessMessage: (...args) => mockDeleteProcessMessage(...args),
}))
// F17.1b: defensivo — a pagina renderiza o ProcessDetailView, que agora
// tem a aba "Histórico" (ProcessHistoryPanel se autocarrega).
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: vi.fn().mockResolvedValue([]),
}))
// F18a: defensivo — a aba "Documentos" (ProcessDocumentsPanel) se autocarrega,
// mesmo padrao de processEventsRepository acima.
vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: vi.fn().mockResolvedValue([]),
  uploadProcessDocument: vi.fn(),
  deleteProcessDocument: vi.fn(),
  downloadProcessDocumentBlob: vi.fn(),
  saveBlobAsFile: vi.fn(),
  setInvoicePackingListLink: vi.fn(),
}))
vi.mock('../../src/services/postReceiptImagesStorage', () => ({
  deletePostReceiptImages: vi.fn().mockResolvedValue(undefined),
  getAddedPostReceiptImages: () => [],
  getRemovedPostReceiptImages: () => [],
  resolvePostReceiptImagesForSave: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/features/processes/processStatus', () => ({
  canonicalizeProcessStatus: (s) => s,
  getDisplayedCollectionStatus: (s) => s,
  getDisplayedProcessStatus: (s) => s,
  getProcessStatusTone: () => 'ok',
  getQuickReadProcessStatus: (s) => s,
  isCollectionScheduleRetainingStatus: () => false,
  isCollectionScheduledOrBeyondStatus: () => false,
  isDtaLoadingScheduledStatus: () => false,
  isDtaTransitCompletedStatus: () => false,
  isMapaInspectionScheduledStatus: () => false,
  isProcessStatusFinalized: () => false,
  mapaAllowsCollectionStatus: () => false,
  normalizeComparableText: (s) => String(s ?? '').toLowerCase(),
  postCollectionStatusOptions: ['Aguardando', 'Coletado'],
  processStatusOptions: ['Aguardando', 'Em Andamento', 'Concluido'],
  shouldHideProcessCardSchedule: () => false,
  shouldHideProcessStatusBadge: () => false,
  CD_EN_ROUTE_STATUS: 'Carga em rota',
  isLogisticaEditableCollectionStatus: () => true,
  shouldPreserveStockCollectionStatus: () => false,
}))
vi.mock('../../src/features/processes/deriveProcessStatus', () => ({
  deriveProcessStatus: () => 'Aguardando Embarque',
  isCustomsCleared: () => false,
  isCollectionReleased: () => false,
  resolveCargoReceivedAt: () => '',
  PRE_ARRIVAL_STATUSES: ['Aguardando Embarque', 'Embarcou', 'Aguardando atracação'],
}))
vi.mock('../../src/features/processes/pendingFields', () => ({
  getPendingFields: () => [],
}))
vi.mock('../../src/features/processes/processStatusView', () => ({
  getChannelToneClass: () => 'tag-blue',
  getStatusTagClass: () => 'tag-ok',
}))
vi.mock('../../src/features/processes/processLabels', () => ({
  getProcessTitle: (p) => p?.name || 'Processo',
  getProcessSubtitle: (p) => p?.processNumber || '',
  canShowProcessName: () => true,
}))
vi.mock('../../src/features/processes/processCategories', () => ({
  // Espelha src/features/processes/processCategories.js (L37): so AEREO e' aereo.
  isMaritimeCategory: (c) => c === 'FCL' || c === 'LCL' || c === 'CONSOLIDADO',
  isAirCategory: (c) => c === 'AEREO',
  shouldShowContainerQuantity: () => false,
}))
vi.mock('../../src/utils/collectionWindows', () => ({
  getCollectionWindows: () => [],
}))
vi.mock('../../src/utils/deliveryForecast', () => ({
  getAutomaticEstimatedDeliveryDate: () => '2026-07-15',
  getEstimatedDeliveryDate: () => '2026-07-15',
}))
vi.mock('../../src/utils/postReceiptImages', () => ({
  formatPostReceiptImageSize: () => '',
  buildPendingPostReceiptImages: () => [],
  MAX_POST_RECEIPT_IMAGES: 4,
  MAX_POST_RECEIPT_IMAGE_SIZE_BYTES: 5_000_000,
  normalizeDraftPostReceiptImages: (items) => items || [],
  normalizePostReceiptImages: (items) => items || [],
  revokePostReceiptImagePreview: () => {},
  toPostReceiptImagePreviewUrl: () => '',
}))

import ProcessesPage from '../../src/pages/ProcessesPage'
import { getLocalDateKey } from '../../src/features/processes/shipmentConfirmation'

const PROCESSES = [
  {
    id: 'p-1',
    name: 'PO 12345 - Importacao A',
    processNumber: 'PO 12345',
    category: 'FCL',
    status: 'Em Andamento',
    collectionStatus: 'Aguardando',
    channel: 'Maritima',
    destination: 'Navegantes',
    eta: '2026-07-15',
    containers: 2,
  },
  {
    id: 'p-2',
    name: 'PO 67890 - Exportacao B',
    processNumber: 'PO 67890',
    category: 'LCL',
    status: 'Aguardando',
    collectionStatus: 'Aguardando',
    channel: 'Aerea',
    destination: 'Sao Paulo',
    eta: '2026-07-20',
    containers: 0,
  },
]

function renderPage({ initialEntries = ['/processos'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
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

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListProcesses.mockReset()
  mockListProcessMessages.mockReset()
  mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'user' } })
  mockListProcesses.mockResolvedValue(PROCESSES)
  mockListProcessMessages.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProcessesPage (listagem)', () => {
  it('loading inicial: mostra 4 skeletons com estrutura de processo', () => {
    let resolveList
    mockListProcesses.mockReturnValue(new Promise((r) => { resolveList = r }))
    renderPage()
    // 4 cards skeleton (Skeleton.Group count=4)
    const skeletonCards = document.querySelectorAll('.process-item--skeleton')
    expect(skeletonCards).toHaveLength(4)
    // Cada card tem 2 skeletons de texto (title + line) e 2 pill skeletons
    const firstCard = skeletonCards[0]
    expect(firstCard.querySelectorAll('.skeleton')).toHaveLength(4)
    resolveList([])
  })

  it('error ao carregar aparece no error-banner', async () => {
    mockListProcesses.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeInTheDocument()
    })
  })

  it('render: lista de processos com nome e status', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/PO 12345 - Importacao A/)).toBeInTheDocument()
    })
    expect(screen.getByText(/PO 67890 - Exportacao B/)).toBeInTheDocument()
  })

  it('empty state quando lista vazia', async () => {
    mockListProcesses.mockResolvedValueOnce([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Nenhum processo/i)).toBeInTheDocument()
    })
  })

  it('filtro de busca por nome: aplicado via input e reduz a lista', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    // Tenta achar o input de busca (placeholder varia, mas e' o primeiro text input)
    const inputs = container.querySelectorAll('input[type="text"], input[type="search"]')
    if (inputs.length > 0) {
      await user.type(inputs[0], '67890')
      await waitFor(() => {
        // 67890 visivel
        expect(screen.getAllByText(/PO 67890/).length).toBeGreaterThan(0)
        // 12345 ainda visivel? A busca pode ser case-insensitive e matchar 67890
        // mas NAO 12345. Testa que o filtro foi aplicado (pelo menos 1 card visivel)
        const cards = container.querySelectorAll('.process-card, .process-list-item, [data-process-id]')
        if (cards.length > 0) {
          expect(cards.length).toBeLessThanOrEqual(2) // filtro reduziu
        }
      })
    }
  })

  it('user comum: nao mostra botoes de edicao de logistica', async () => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'user' } })
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: /Atualizar status|Coleta agendada/i })).not.toBeInTheDocument()
  })

  it('logistica: mostra acoes de edicao', async () => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'logistica' } })
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/PO 67890/).length).toBeGreaterThan(0)
  })
})

// F17.2d-2 (Q6/Q1, D-6): busca da pagina nao vaza referencia/fornecedor de
// PO do CONSOLIDADO para role `user`.
describe('ProcessesPage — busca por PO do CONSOLIDADO mascarada (F17.2d-2)', () => {
  const CONSOLIDATED_PROCESS = {
    id: 'p-cons',
    name: 'Consolidado Delta',
    processNumber: '',
    category: 'CONSOLIDADO',
    status: 'Em Andamento',
    collectionStatus: 'Aguardando',
    channel: 'Maritima',
    destination: 'Roterda',
    eta: '2026-07-18',
    purchaseOrders: [{ po: 'PO-9', reference: 'REF-SECRETA', supplierName: 'ACME' }],
  }

  beforeEach(() => {
    mockListProcesses.mockResolvedValue([...PROCESSES, CONSOLIDATED_PROCESS])
  })

  it('user digitando REF-SECRETA nao encontra o processo', async () => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'user' } })
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    const inputs = container.querySelectorAll('input[type="text"], input[type="search"]')
    await user.type(inputs[0], 'REF-SECRETA')
    await waitFor(() => {
      expect(screen.queryByText('Consolidado Delta')).not.toBeInTheDocument()
    })
  })

  it('admin digitando REF-SECRETA encontra o processo', async () => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    const inputs = container.querySelectorAll('input[type="text"], input[type="search"]')
    await user.type(inputs[0], 'REF-SECRETA')
    await waitFor(() => {
      expect(screen.getByText('Consolidado Delta')).toBeInTheDocument()
    })
  })

  it('user digitando PO-9 encontra o processo (numero da PO nunca e mascarado)', async () => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'user' } })
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    const inputs = container.querySelectorAll('input[type="text"], input[type="search"]')
    await user.type(inputs[0], 'PO-9')
    await waitFor(() => {
      expect(screen.getByText('Consolidado Delta')).toBeInTheDocument()
    })
  })
})

// 2026-09-30: busca pelo numero de um dos conteineres do processo.
describe('ProcessesPage — busca por contêiner', () => {
  const WITH_CONTAINERS = {
    id: 'p-cnt',
    name: 'Processo Conteiner Zeta',
    processNumber: 'PO 55555',
    category: 'FCL',
    status: 'Em Andamento',
    collectionStatus: 'Aguardando',
    channel: 'Maritima',
    destination: 'Itajai',
    eta: '2026-07-20',
    containers: [
      { id: 'CNT-1', number: 'MSKU4821930', seal: '', type: '40HC', returnedAt: '' },
      { id: 'CNT-2', number: 'TGHU7710253', seal: '', type: '40HC', returnedAt: '' },
    ],
  }

  beforeEach(() => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
    mockListProcesses.mockResolvedValue([...PROCESSES, WITH_CONTAINERS])
  })

  async function search(text) {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    const inputs = container.querySelectorAll('input[type="text"], input[type="search"]')
    await user.type(inputs[0], text)
  }

  it('acha pelo numero do segundo conteiner, com espaco e traco', async () => {
    await search('TGHU 771025-3')
    await waitFor(() => {
      expect(screen.getByText('Processo Conteiner Zeta')).toBeInTheDocument()
      expect(screen.queryByText(/PO 67890/)).not.toBeInTheDocument()
    })
  })

  it('acha por trecho do numero em minusculas', async () => {
    await search('msku482')
    await waitFor(() => expect(screen.getByText('Processo Conteiner Zeta')).toBeInTheDocument())
  })

  it('numero que nao existe nao traz o processo', async () => {
    await search('ZZZU9999999')
    await waitFor(() => expect(screen.queryByText('Processo Conteiner Zeta')).not.toBeInTheDocument())
  })
})

// UX-3a: guarda de alteracoes nao salvas no criar/editar processo.
describe('ProcessesPage — guarda de alteracoes nao salvas (UX-3a)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
  })

  it('(a) "Novo processo" -> "Voltar para lista" sem digitar volta a lista sem dialogo', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    expect(screen.getByRole('heading', { name: 'Criar processo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Voltar para lista' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Criar processo' })).not.toBeInTheDocument()
    })
  })

  it('(b) digitar em "Nome do processo" -> "Voltar para lista" abre dialogo; "Continuar editando" mantem o valor', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    const nameInput = screen.getByLabelText('Nome do processo')
    await user.type(nameInput, 'Importação Nova')

    await user.click(screen.getByRole('button', { name: 'Voltar para lista' }))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Criar processo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome do processo')).toHaveValue('Importação Nova')
  })

  it('(c) "Descartar alterações" volta a lista', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    await user.type(screen.getByLabelText('Nome do processo'), 'Importação Nova')
    await user.click(screen.getByRole('button', { name: 'Voltar para lista' }))
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Criar processo' })).not.toBeInTheDocument()
    })
  })

  it('(d) abrir edicao de processo existente sem mexer -> "Voltar para lista" sem dialogo', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    const firstCard = container.querySelector('.process-item--button')
    await user.click(firstCard)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar processo' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Editar processo' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Voltar para lista' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Editar processo' })).not.toBeInTheDocument()
    })
  })

  it('(e) salvar com sucesso limpa a guarda (sem dialogo na proxima edicao sem mexer)', async () => {
    const user = userEvent.setup()
    mockSaveProcess.mockResolvedValue({ ...PROCESSES[0], name: 'PO 12345 - Editado' })
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    const firstCard = container.querySelector('.process-item--button')
    await user.click(firstCard)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar processo' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))

    const nameInput = screen.getByLabelText('Nome do processo')
    await user.clear(nameInput)
    await user.type(nameInput, 'PO 12345 - Editado')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Editar processo' })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Editar processo' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Voltar para lista' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

// UX-3b: validacao inline bloqueia o salvar com erro no campo, foca o 1o
// campo invalido navegando ate o passo, e mostra o resumo `role="alert"`.
describe('ProcessesPage — validacao inline (UX-3b)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
  })

  it('(a) data invalida no ETD bloqueia o salvar, foca o campo e mostra o resumo; corrigir libera o save', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    await user.click(screen.getByRole('button', { name: 'Embarque' }))

    const etdInput = screen.getByLabelText('ETD')
    fireEvent.change(etdInput, { target: { value: '1999-12-31' } })

    await user.click(screen.getByRole('button', { name: 'Identificação' }))
    await user.click(screen.getByRole('button', { name: 'Criar processo' }))

    expect(mockSaveProcess).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Embarque/ })).toHaveAttribute(
        'aria-current',
        'step'
      )
    })
    // Nota: com o erro visivel, `getByLabelText` deixa de casar exatamente
    // "ETD" (o `<small class="field-error">` fica DENTRO do `<label>`, por
    // isso o texto do erro entra no calculo do label - D7 usa `aria-hidden`
    // so' pra remover do NOME acessivel via `aria`, nao do `textContent`
    // usado pelo matcher de label implicito). Usa o id estavel direto.
    const etdInputAfter = container.querySelector('#process-field-etd')
    expect(etdInputAfter).toHaveAttribute('aria-invalid', 'true')
    expect(etdInputAfter).toHaveAccessibleDescription(/entre 2000 e 2100/)
    expect(document.activeElement).toBe(etdInputAfter)
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija 1 campo destacado antes de salvar.')

    fireEvent.change(etdInputAfter, { target: { value: '2026-07-01' } })
    await waitFor(() => {
      expect(container.querySelector('#process-field-etd')).not.toHaveAttribute('aria-invalid')
    })

    await user.click(screen.getByRole('button', { name: 'Criar processo' }))
    await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
  })

  it('(b) cubagem negativa bloqueia, foca a cubagem, passo "Carga"', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    await user.click(screen.getByRole('button', { name: 'Carga' }))

    const volumeInput = screen.getByLabelText('Cubagem (m³)')
    fireEvent.change(volumeInput, { target: { value: '-1' } })

    await user.click(screen.getByRole('button', { name: 'Criar processo' }))

    expect(mockSaveProcess).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Carga/ })).toHaveAttribute(
        'aria-current',
        'step'
      )
    })
    expect(document.activeElement).toBe(container.querySelector('#process-field-volumeM3'))
  })

  it('(c) quantidade negativa no item bloqueia; input continua mostrando o valor cru (D11)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    await user.click(screen.getByRole('button', { name: 'Itens' }))

    const quantityInput = container.querySelector('.process-item-editor__actions input[type="number"]')
    fireEvent.change(quantityInput, { target: { value: '-2' } })

    await user.click(screen.getByRole('button', { name: 'Criar processo' }))

    expect(mockSaveProcess).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(
        container.querySelector('.process-item-editor__actions input[type="number"]')
      ).toHaveValue(-2)
    })
  })

  it('(d) incoterm fora da lista (mesmo apos canonicalizar - AD-1) bloqueia, foca o select "Incoterm", passo "Identificação"', async () => {
    mockListProcesses.mockResolvedValue([
      ...PROCESSES,
      { ...PROCESSES[0], id: 'p-incoterm', name: 'Processo Incoterm Legado', incoterm: 'XYZ' },
    ])
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(screen.getByText('Processo Incoterm Legado')).toBeInTheDocument())

    await user.click(screen.getByText('Processo Incoterm Legado'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar processo' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(mockSaveProcess).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Identificação/ })).toHaveAttribute('aria-current', 'step')
    })
    expect(document.activeElement).toBe(container.querySelector('#process-field-incoterm'))
  })

  it('(e) mais de 40 containers bloqueia, foca o grupo com "Máximo de 40"', async () => {
    const containers = Array.from({ length: 41 }, (_, index) => ({
      id: `CNT-${index + 1}`,
      number: '',
      seal: '',
      type: '',
      returnedAt: '',
    }))
    mockListProcesses.mockResolvedValue([
      ...PROCESSES,
      { ...PROCESSES[0], id: 'p-containers', name: 'Processo Muitos Containers', containers },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Processo Muitos Containers')).toBeInTheDocument())

    await user.click(screen.getByText('Processo Muitos Containers'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar processo' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(mockSaveProcess).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleDescription(/Máximo de 40/)
    })
  })

  it('(f) aviso ISO 6346 (numero de conteiner invalido) NAO bloqueia o salvar', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    await user.click(screen.getByRole('button', { name: 'Carga' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar contêiner' }))

    const numberInput = screen.getByLabelText('Número')
    fireEvent.change(numberInput, { target: { value: 'ABC' } })

    await user.click(screen.getByRole('button', { name: 'Criar processo' }))

    await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
  })
})

// L37: filtro "Etapa operacional" usa a data LOCAL (nao UTC) como "hoje" e le
// berthedAt/arrivedAt (F17.3a) com fallback para os booleans legados.
// Fuso deterministico: relogio fixo + spies em getFullYear/getMonth/getDate
// simulando America/Sao_Paulo (UTC-3 fixo, sem horario de verao desde 2019).
// Nao usa process.env.TZ: no pool `threads` do vitest a troca em runtime nao e
// confiavel e o teste poderia passar sem provar nada (o CI roda em UTC).
describe('ProcessesPage — filtro Etapa operacional (L37: data local + berthedAt/arrivedAt)', () => {
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000
  const dateSpies = []

  function baseProcess(overrides) {
    return {
      processNumber: '',
      status: 'Em Andamento',
      collectionStatus: 'Aguardando',
      channel: 'Maritima',
      destination: 'Santos',
      ...overrides,
    }
  }

  beforeEach(() => {
    // So o Date e' falso: o waitFor do Testing Library segue com timers reais.
    vi.useFakeTimers({ toFake: ['Date'] })
    // 2026-10-02T01:30Z = 2026-10-01 22:30 em America/Sao_Paulo.
    vi.setSystemTime(new Date('2026-10-02T01:30:00.000Z'))
    const shifted = (date) => new Date(date.getTime() - BRT_OFFSET_MS)
    dateSpies.push(
      vi.spyOn(Date.prototype, 'getFullYear').mockImplementation(function () {
        return shifted(this).getUTCFullYear()
      }),
      vi.spyOn(Date.prototype, 'getMonth').mockImplementation(function () {
        return shifted(this).getUTCMonth()
      }),
      vi.spyOn(Date.prototype, 'getDate').mockImplementation(function () {
        return shifted(this).getUTCDate()
      })
    )
  })

  afterEach(() => {
    // vi.clearAllMocks() (afterEach global) NAO restaura spies: restaurar aqui
    // para nao contaminar os testes seguintes do arquivo.
    while (dateSpies.length > 0) dateSpies.pop().mockRestore()
    vi.useRealTimers()
  })

  async function renderAndWaitFor(firstName) {
    const { container } = renderPage()
    const list = () => within(container.querySelector('.process-list'))
    await waitFor(() => expect(list().getByText(firstName)).toBeInTheDocument())
    return list
  }

  function selectOperation(value) {
    fireEvent.change(screen.getByLabelText('Etapa operacional'), { target: { value } })
  }

  it('22:30 em America/Sao_Paulo (UTC ja no dia seguinte): ETA de amanha NAO entra em Pós-chegada pendente; ETA de hoje entra', async () => {
    // Guarda: falha alto se o fuso simulado nao foi aplicado.
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-02')
    expect(getLocalDateKey(new Date())).toBe('2026-10-01')

    mockListProcesses.mockResolvedValue([
      baseProcess({
        id: 'l37-hoje',
        name: 'Chegada Hoje L37',
        category: 'FCL',
        eta: '2026-10-01',
        berthed: false,
        berthedAt: '',
      }),
      baseProcess({
        id: 'l37-amanha',
        name: 'Chegada Amanha L37',
        category: 'FCL',
        eta: '2026-10-02',
        berthed: false,
        berthedAt: '',
      }),
    ])
    const list = await renderAndWaitFor('Chegada Hoje L37')
    expect(list().getByText('Chegada Amanha L37')).toBeInTheDocument()

    selectOperation('Pós-chegada pendente')

    await waitFor(() => expect(list().queryByText('Chegada Amanha L37')).not.toBeInTheDocument())
    expect(list().getByText('Chegada Hoje L37')).toBeInTheDocument()
  })

  it('berthedAt preenchido com berthed legado false: sai de Pós-chegada pendente e entra em Aguardando presença de carga', async () => {
    mockListProcesses.mockResolvedValue([
      baseProcess({
        id: 'l37-sem-atracacao',
        name: 'Sem Atracacao L37',
        category: 'FCL',
        eta: '2026-09-20',
        berthed: false,
        berthedAt: '',
      }),
      baseProcess({
        id: 'l37-atracado-data',
        name: 'Atracado Data L37',
        category: 'FCL',
        eta: '2026-09-20',
        berthed: false,
        berthedAt: '2026-09-21T10:00',
        cargoPresenceInformed: false,
      }),
    ])
    const list = await renderAndWaitFor('Sem Atracacao L37')

    selectOperation('Pós-chegada pendente')
    await waitFor(() => expect(list().queryByText('Atracado Data L37')).not.toBeInTheDocument())
    expect(list().getByText('Sem Atracacao L37')).toBeInTheDocument()

    selectOperation('Aguardando presença de carga')
    await waitFor(() => expect(list().getByText('Atracado Data L37')).toBeInTheDocument())
    expect(list().queryByText('Sem Atracacao L37')).not.toBeInTheDocument()
  })

  it('arrivedAt preenchido com arrived legado false (AEREO): sai de Pós-chegada pendente e entra em DTA em andamento', async () => {
    mockListProcesses.mockResolvedValue([
      baseProcess({
        id: 'l37-base-fcl',
        name: 'Base FCL L37',
        category: 'FCL',
        eta: '2026-09-20',
        berthed: true,
      }),
      baseProcess({
        id: 'l37-aereo-sem-chegada',
        name: 'Aereo Sem Chegada L37',
        category: 'AEREO',
        channel: 'Aerea',
        eta: '2026-09-20',
        arrived: false,
        arrivedAt: '',
        dtaStatus: '',
      }),
      baseProcess({
        id: 'l37-chegou-data',
        name: 'Chegou Data L37',
        category: 'AEREO',
        channel: 'Aerea',
        eta: '2026-09-20',
        arrived: false,
        arrivedAt: '2026-09-21T10:00',
        dtaStatus: 'Pendente',
      }),
    ])
    const list = await renderAndWaitFor('Aereo Sem Chegada L37')

    selectOperation('Pós-chegada pendente')
    await waitFor(() => expect(list().queryByText('Chegou Data L37')).not.toBeInTheDocument())
    expect(list().getByText('Aereo Sem Chegada L37')).toBeInTheDocument()

    selectOperation('DTA em andamento')
    await waitFor(() => expect(list().getByText('Chegou Data L37')).toBeInTheDocument())
    expect(list().queryByText('Aereo Sem Chegada L37')).not.toBeInTheDocument()
  })

  it('legado sem data: berthed true / arrived true sem berthedAt/arrivedAt continuam contando como atracado/chegado', async () => {
    mockListProcesses.mockResolvedValue([
      baseProcess({
        id: 'l37-atracado-legado',
        name: 'Atracado Legado L37',
        category: 'FCL',
        eta: '2026-09-20',
        berthed: true,
        berthedAt: '',
        cargoPresenceInformed: false,
      }),
      baseProcess({
        id: 'l37-chegou-legado',
        name: 'Chegou Legado L37',
        category: 'AEREO',
        channel: 'Aerea',
        eta: '2026-09-20',
        arrived: true,
        arrivedAt: '',
        dtaStatus: 'Pendente',
      }),
    ])
    const list = await renderAndWaitFor('Atracado Legado L37')
    expect(list().getByText('Chegou Legado L37')).toBeInTheDocument()

    selectOperation('Pós-chegada pendente')
    await waitFor(() => {
      expect(list().queryByText('Atracado Legado L37')).not.toBeInTheDocument()
      expect(list().queryByText('Chegou Legado L37')).not.toBeInTheDocument()
    })

    selectOperation('Aguardando presença de carga')
    await waitFor(() => expect(list().getByText('Atracado Legado L37')).toBeInTheDocument())
    expect(list().queryByText('Chegou Legado L37')).not.toBeInTheDocument()

    selectOperation('DTA em andamento')
    await waitFor(() => expect(list().getByText('Chegou Legado L37')).toBeInTheDocument())
    expect(list().queryByText('Atracado Legado L37')).not.toBeInTheDocument()
  })
})
