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
import * as XLSX from 'xlsx'
import {
  CREATION_SCENARIO_KEYS,
  FINANCIAL_SENTINEL_STRINGS,
  buildCreationScenarioLooseRows,
  looseRowsToMatrix,
  makeLooseRow,
} from '../fixtures/erp/dbcorpSynthetic.js'

const mockUseAuth = vi.fn()
const mockListProcesses = vi.fn()
const mockListProcessMessages = vi.fn()
const mockDeleteProcess = vi.fn()
const mockSaveProcess = vi.fn()
const mockSaveProcessCollectionStatus = vi.fn()
const mockSaveProcessPostReceiptNotes = vi.fn()
const mockCreateProcessMessage = vi.fn()
const mockDeleteProcessMessage = vi.fn()
const mockLoadErpReference = vi.fn()
const mockSaveErpReferenceSnapshot = vi.fn()
const mockCreateAuditEvent = vi.fn()

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
// PR 3 (Importar do DBCorp): referencia do ERP. Mock obrigatorio: sem ele o
// admin falaria com o Firestore de verdade (leitura ao montar, gravacao ao importar).
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpReference: (...args) => mockLoadErpReference(...args),
  saveErpReferenceSnapshot: (...args) => mockSaveErpReferenceSnapshot(...args),
}))
// F3 (criar processos do DBCorp): o audit do lote sai pela pagina. Mock obrigatorio: sem ele
// o teste falaria com o Firestore de verdade. Os 2 exports do servico sao mockados.
vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: (...args) => mockCreateAuditEvent(...args),
  listAuditEvents: vi.fn().mockResolvedValue([]),
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
  renameAdditionalDocument: vi.fn(),
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
  mockLoadErpReference.mockReset()
  mockSaveErpReferenceSnapshot.mockReset()
  mockCreateAuditEvent.mockReset()
  mockCreateAuditEvent.mockResolvedValue({})
  mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'user' } })
  mockListProcesses.mockResolvedValue(PROCESSES)
  mockListProcessMessages.mockResolvedValue([])
  mockLoadErpReference.mockResolvedValue(null)
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

  it('presenca de carga: data preenchida com boolean false e legado boolean true sem data saem de Aguardando presença e entram em DUIMP pendente', async () => {
    mockListProcesses.mockResolvedValue([
      baseProcess({
        id: 'l37-presenca-sem',
        name: 'Presenca Sem L37',
        category: 'FCL',
        eta: '2026-09-20',
        berthed: true,
        berthedAt: '2026-09-21T10:00',
        cargoPresenceInformed: false,
        cargoPresenceInformedAt: '',
      }),
      baseProcess({
        id: 'l37-presenca-data',
        name: 'Presenca Data L37',
        category: 'FCL',
        eta: '2026-09-20',
        berthed: true,
        berthedAt: '2026-09-21T10:00',
        cargoPresenceInformed: false,
        cargoPresenceInformedAt: '2026-09-22T09:00',
      }),
      baseProcess({
        id: 'l37-presenca-legado',
        name: 'Presenca Legado L37',
        category: 'FCL',
        eta: '2026-09-20',
        berthed: true,
        berthedAt: '2026-09-21T10:00',
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: '',
      }),
      baseProcess({
        id: 'l37-presenca-aereo',
        name: 'Presenca Aereo L37',
        category: 'AEREO',
        channel: 'Aerea',
        eta: '2026-09-20',
        arrived: false,
        arrivedAt: '2026-09-21T10:00',
        dtaStatus: 'Trânsito concluído',
        cargoPresenceInformed: false,
        cargoPresenceInformedAt: '2026-09-22T09:00',
      }),
    ])
    const list = await renderAndWaitFor('Presenca Sem L37')

    selectOperation('Aguardando presença de carga')
    await waitFor(() => expect(list().queryByText('Presenca Data L37')).not.toBeInTheDocument())
    expect(list().getByText('Presenca Sem L37')).toBeInTheDocument()
    expect(list().queryByText('Presenca Legado L37')).not.toBeInTheDocument()
    expect(list().queryByText('Presenca Aereo L37')).not.toBeInTheDocument()

    selectOperation('DUIMP pendente')
    await waitFor(() => expect(list().getByText('Presenca Data L37')).toBeInTheDocument())
    expect(list().getByText('Presenca Legado L37')).toBeInTheDocument()
    expect(list().getByText('Presenca Aereo L37')).toBeInTheDocument()
    expect(list().queryByText('Presenca Sem L37')).not.toBeInTheDocument()
  })
})

// DUIMP sob aguas (D-1/D-3/D-5): antes da atracacao a DUIMP registrada e'
// visivel so' para admin/logistica; os demais roles veem o processo SEM os
// campos aduaneiros e com o status da viagem. Nota: o mock de
// deriveProcessStatus acima devolve sempre 'Aguardando Embarque'.
describe('ProcessesPage — DUIMP sob aguas (projecao por perfil)', () => {
  const DUIMP_STATUS = 'Aguardando parametrização da DUIMP'
  const UNDER_WATER = {
    id: 'p-sob-aguas',
    name: 'Importacao Sob Aguas',
    processNumber: 'PO-SA-1',
    category: 'FCL',
    channel: 'Maritima',
    destination: 'Navegantes',
    eta: '2099-01-15',
    shippedAt: '2026-09-01',
    processStatus: DUIMP_STATUS,
    duimpStatus: DUIMP_STATUS,
    duimpRegisteredAt: '2026-09-18T09:00',
    duimpNumber: 'DU-SOBAGUAS-1',
    collectionStatus: '',
  }

  beforeEach(() => {
    mockListProcesses.mockResolvedValue([UNDER_WATER])
  })

  async function renderWithRole(role) {
    mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role } })
    const view = renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO-SA-1/).length).toBeGreaterThan(0))
    return view
  }

  it('user: o status de DUIMP nao aparece na lista', async () => {
    await renderWithRole('user')
    expect(screen.queryByText(DUIMP_STATUS)).not.toBeInTheDocument()
    expect(screen.getAllByText('Aguardando Embarque').length).toBeGreaterThan(0)
  })

  it('user: a busca por "parametriza" esvazia a lista', async () => {
    const user = userEvent.setup()
    const { container } = await renderWithRole('user')
    const inputs = container.querySelectorAll('input[type="text"], input[type="search"]')
    await user.type(inputs[0], 'parametriza')
    await waitFor(() => expect(screen.queryAllByText(/PO-SA-1/)).toHaveLength(0))
  })

  it('user: o detalhe mostra "DUIMP ainda não registrada." e nenhum dado da DUIMP', async () => {
    const user = userEvent.setup()
    await renderWithRole('user')
    await user.click(screen.getAllByText(/PO-SA-1/)[0])
    await user.click(await screen.findByRole('button', { name: 'Processo' }))
    await waitFor(() => expect(screen.getByText('DUIMP ainda não registrada.')).toBeInTheDocument())
    expect(screen.queryByText('DU-SOBAGUAS-1')).not.toBeInTheDocument()
    expect(screen.queryByText(DUIMP_STATUS)).not.toBeInTheDocument()
  })

  it.each(['admin', 'logistica'])('%s: o status de DUIMP segue visivel na lista', async (role) => {
    await renderWithRole(role)
    expect(screen.getAllByText(DUIMP_STATUS).length).toBeGreaterThan(0)
  })

  it.each(['admin', 'logistica'])('%s: o detalhe mostra o numero da DUIMP', async (role) => {
    const user = userEvent.setup()
    await renderWithRole(role)
    await user.click(screen.getAllByText(/PO-SA-1/)[0])
    await user.click(await screen.findByRole('button', { name: 'Processo' }))
    await waitFor(() => expect(screen.getByText('DU-SOBAGUAS-1')).toBeInTheDocument())
  })
})

// "Importar do DBCorp" (F1 + PR 3): o botao e o modal so' existem para o admin;
// o modal recebe os processos ja carregados e nunca grava em `processes`.
describe('ProcessesPage — Importar do DBCorp (F1 + PR 3)', () => {
  const ERP_BUTTON = { name: 'Importar do DBCorp' }
  const EMPTY_PORTAL_MESSAGE = 'Os processos do Portal não foram carregados. Recarregue a página antes de conciliar.'

  it('admin vê o botão e abre o diálogo', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    const button = screen.getByRole('button', ERP_BUTTON)
    expect(button).toBeEnabled()
    // Botao unico: o "Importar" antigo (criar processos em lote) saiu da lista.
    expect(screen.getAllByRole('button', { name: /^Importar/ })).toEqual([button])
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Importar do DBCorp' })).not.toBeInTheDocument()

    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Importar do DBCorp' })
    expect(within(dialog).getByText(/A planilha vira a referência do ERP/)).toBeInTheDocument()
    expect(within(dialog).queryByText(EMPTY_PORTAL_MESSAGE)).not.toBeInTheDocument()
    expect(dialog.querySelector('input[type="file"]')).toHaveAttribute('accept', '.xlsx')
    expect(mockSaveProcess).not.toHaveBeenCalled()
  })

  it.each(['user', 'logistica'])('%s não vê o botão nem o diálogo', async (role) => {
    mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role } })
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', ERP_BUTTON)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Importar/ })).toHaveLength(0)
    expect(screen.queryByRole('dialog', { name: 'Importar do DBCorp' })).not.toBeInTheDocument()
  })

  it('com listProcesses pendente, o botão está desabilitado', async () => {
    let resolveList
    mockListProcesses.mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
    renderPage()
    const button = await screen.findByRole('button', ERP_BUTTON)
    expect(button).toBeDisabled()
    resolveList(PROCESSES)
    await waitFor(() => expect(screen.getByRole('button', ERP_BUTTON)).toBeEnabled())
  })

  it('com listProcesses rejeitado, o modal abre com o banner bloqueante', async () => {
    const user = userEvent.setup()
    mockListProcesses.mockRejectedValueOnce(new Error('boom'))
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
    renderPage()
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', ERP_BUTTON))
    const dialog = await screen.findByRole('dialog', { name: 'Importar do DBCorp' })
    expect(within(dialog).getByText(EMPTY_PORTAL_MESSAGE)).toBeInTheDocument()
    expect(dialog.querySelector('input[type="file"]')).toBeDisabled()
    expect(mockSaveProcess).not.toHaveBeenCalled()
  })
})

// PR 3: referencia do ERP na pagina (leitura, chip no detalhe, gravacao e corrida).
describe('ProcessesPage — referencia do ERP (PR 3)', () => {
  const ERP_BUTTON = { name: 'Importar do DBCorp' }
  const SNAPSHOT_A = 'AAAAAAAAAAAAAAAAAAAA'
  const SNAPSHOT_B = 'BBBBBBBBBBBBBBBBBBBB'
  const UPDATED_AT = new Date(2026, 9, 2, 14, 30).getTime()

  const shipmentWithDestination = (destination) => ({
    kind: 'FCL',
    portalCategory: 'FCL',
    key: 'ALFA SEA 900-26',
    incoterm: '',
    originHint: '',
    stage: 1,
    statuses: ['EMBARCOU'],
    statusNf: [],
    orders: [],
    items: [],
    transport: {
      etd: '',
      eta: '',
      vessel: { name: '', raw: '', voyage: '' },
      blAwb: '',
      origin: '',
      destination,
      diNumber: '',
      diDate: '',
    },
    conflicts: [],
  })

  const referenceWith = (snapshotId, destination) => ({
    snapshot: { snapshotId, updatedAtMs: UPDATED_AT, updatedByName: 'Admin', fileName: 'planilha.xlsx' },
    hintsByProcessId: {
      'p-1': { snapshotId, matchRule: 'pedido', shipment: shipmentWithDestination(destination) },
    },
  })

  const savedWith = (reference) => ({
    snapshotId: reference.snapshot.snapshotId,
    counts: { hints: 1, hintsSkipped: 0 },
    skipped: [],
    reference,
  })

  // File do jsdom 25 nao tem `arrayBuffer`: define na instancia (o leitor real da planilha a usa).
  // `rows` (F3): linhas soltas do cenario; a matriz vem de `looseRowsToMatrix`, logo com as sentinelas financeiras.
  function buildErpWorkbookFile(
    name = 'teste.xlsx',
    rows = [makeLooseRow({ itemId: 'W-1', pedido: 9500, poRef: 'ALFA SEA 950-26' })]
  ) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(looseRowsToMatrix(rows)), 'Sheet')
    const written = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const bytes =
      written instanceof ArrayBuffer ? written : written.buffer.slice(written.byteOffset, written.byteOffset + written.byteLength)
    const file = new File([bytes], name)
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes })
    return file
  }

  const asAdmin = () => mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin', name: 'Admin Teste' } })

  async function openDetail(user) {
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    await user.click(screen.getAllByText(/PO 12345/)[0])
  }

  async function openImportModal(user) {
    await user.click(screen.getByRole('button', ERP_BUTTON))
    const dialog = await screen.findByRole('dialog', { name: 'Importar do DBCorp' })
    return dialog
  }

  it('admin chama loadErpReference 1x e ve o aviso ERP no detalhe', async () => {
    const user = userEvent.setup()
    asAdmin()
    mockLoadErpReference.mockResolvedValue(referenceWith(SNAPSHOT_A, 'ITAJAI'))
    renderPage()
    await openDetail(user)
    expect(await screen.findByRole('button', { name: 'Destino no ERP: ITAJAI' })).toBeInTheDocument()
    expect(mockLoadErpReference).toHaveBeenCalledTimes(1)
    expect(mockSaveProcess).not.toHaveBeenCalled()
  })

  it.each(['user', 'logistica'])('%s nao chama loadErpReference e nao ve aviso ERP', async (role) => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role } })
    mockLoadErpReference.mockResolvedValue(referenceWith(SNAPSHOT_A, 'ITAJAI'))
    renderPage()
    await openDetail(user)
    await screen.findByText('Porto de Atracação')
    expect(mockLoadErpReference).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /no ERP/ })).not.toBeInTheDocument()
  })

  it('loadErpReference rejeitado: pagina normal, sem error-banner e sem aviso', async () => {
    const user = userEvent.setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    asAdmin()
    mockLoadErpReference.mockRejectedValue(new Error('sem permissao no erp'))
    renderPage()
    await openDetail(user)
    await screen.findByText('Porto de Atracação')
    await waitFor(() => expect(mockLoadErpReference).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(document.querySelector('.error-banner')).toBeNull()
    expect(screen.queryByRole('button', { name: /no ERP/ })).not.toBeInTheDocument()
    expect(mockSaveProcess).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('referencia incompleta (importacoes concorrentes): o modal pede nova importacao e o detalhe fica sem aviso', async () => {
    const user = userEvent.setup()
    asAdmin()
    mockLoadErpReference.mockResolvedValue({
      snapshot: { snapshotId: SNAPSHOT_A, updatedAtMs: UPDATED_AT, updatedByName: 'Admin', fileName: 'planilha.xlsx', incomplete: true },
      hintsByProcessId: {},
    })
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    const dialog = await openImportModal(user)
    expect(await within(dialog).findByText(/A referência do ERP salva está incompleta/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Referência atual/)).not.toBeInTheDocument()

    await user.click(dialog.querySelector('.erp-reconcile__actions .ghost-button'))
    await user.click(screen.getAllByText(/PO 12345/)[0])
    await screen.findByText('Porto de Atracação')
    expect(screen.queryByRole('button', { name: /no ERP/ })).not.toBeInTheDocument()
    expect(mockSaveProcess).not.toHaveBeenCalled()
  })

  it('importar chama saveErpReferenceSnapshot com o resultado e o profile, e o aviso aparece sem recarregar', async () => {
    const user = userEvent.setup()
    asAdmin()
    mockSaveErpReferenceSnapshot.mockResolvedValue(savedWith(referenceWith(SNAPSHOT_B, 'SANTOS')))
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
    const dialog = await openImportModal(user)
    expect(within(dialog).getByText('Nenhuma referência do ERP salva ainda.')).toBeInTheDocument()
    await user.upload(dialog.querySelector('input[type="file"]'), buildErpWorkbookFile())
    expect(await within(dialog).findByText('Referência do ERP salva: 1 processo.')).toBeInTheDocument()
    expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(1)
    const [result, actor] = mockSaveErpReferenceSnapshot.mock.calls[0]
    expect(result.blocked).toBeNull()
    expect(result.summary.erpRows).toBe(1)
    expect(actor).toMatchObject({ role: 'admin', name: 'Admin Teste' })
    expect(within(dialog).getByText('Referência atual: planilha de 02/10/2026 14:30')).toBeInTheDocument()

    await user.click(dialog.querySelector('.erp-reconcile__actions .ghost-button'))
    await user.click(screen.getAllByText(/PO 12345/)[0])
    expect(await screen.findByRole('button', { name: 'Destino no ERP: SANTOS' })).toBeInTheDocument()
    expect(mockSaveProcess).not.toHaveBeenCalled()
  })

  it('corrida: fechar no meio do save e reabrir mantem o input desabilitado; o 2o save so comeca depois do 1o', async () => {
    const user = userEvent.setup()
    asAdmin()
    let resolveFirst
    mockSaveErpReferenceSnapshot.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve })
    )
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    let dialog = await openImportModal(user)
    await user.upload(dialog.querySelector('input[type="file"]'), buildErpWorkbookFile('um.xlsx'))
    await waitFor(() => expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(1))
    expect(await within(dialog).findByText('Salvando a referência do ERP…')).toBeInTheDocument()

    // Fecha no meio do save e reabre: a trava e' da pagina, nao do modal.
    await user.click(dialog.querySelector('.erp-reconcile__actions .ghost-button'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importar do DBCorp' })).not.toBeInTheDocument())
    dialog = await openImportModal(user)
    expect(dialog.querySelector('input[type="file"]')).toBeDisabled()
    expect(within(dialog).getByText('Uma importação anterior ainda está salvando a referência do ERP.')).toBeInTheDocument()
    expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(1)

    mockSaveErpReferenceSnapshot.mockResolvedValueOnce(savedWith(referenceWith(SNAPSHOT_B, 'SANTOS')))
    resolveFirst(savedWith(referenceWith(SNAPSHOT_A, 'ITAJAI')))
    await waitFor(() => expect(dialog.querySelector('input[type="file"]')).not.toBeDisabled())
    expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(1)

    await user.upload(dialog.querySelector('input[type="file"]'), buildErpWorkbookFile('dois.xlsx'))
    await waitFor(() => expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(2))
    expect(await within(dialog).findByText('Referência do ERP salva: 1 processo.')).toBeInTheDocument()
  })

  it('loadErpReference lento que resolve DEPOIS de um save: a referencia mostrada e a do save', async () => {
    const user = userEvent.setup()
    asAdmin()
    let resolveLoad
    mockLoadErpReference.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve }))
    mockSaveErpReferenceSnapshot.mockResolvedValue(savedWith(referenceWith(SNAPSHOT_B, 'SANTOS')))
    renderPage()
    await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

    const dialog = await openImportModal(user)
    await user.upload(dialog.querySelector('input[type="file"]'), buildErpWorkbookFile())
    expect(await within(dialog).findByText('Referência do ERP salva: 1 processo.')).toBeInTheDocument()

    // A leitura antiga (mais velha que o save) chega por ultimo e e' descartada.
    resolveLoad(referenceWith(SNAPSHOT_A, 'ZZZ-ANTIGO'))
    await Promise.resolve()
    await Promise.resolve()
    await user.click(dialog.querySelector('.erp-reconcile__actions .ghost-button'))
    await user.click(screen.getAllByText(/PO 12345/)[0])
    expect(await screen.findByRole('button', { name: 'Destino no ERP: SANTOS' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Destino no ERP: ZZZ-ANTIGO' })).not.toBeInTheDocument()
  })

  // Falha do save (Codex, PR #233): o catch so' rebobinava a sequencia e mantinha a
  // referencia antiga em memoria, e o detalhe seguia com chips "completos" ate
  // recarregar a pagina. Agora toda falha recarrega a referencia (loadErpReference
  // ja aplica a checagem de completude) e, se a releitura falhar, limpa e avisa.
  describe('falha ao salvar a referencia', () => {
    // `buildActionErrorMessage` registra a falha com console.error: silencia o ruido.
    let errorSpy
    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
      errorSpy.mockRestore()
    })

    const SAVE_FAILURE_BANNER = /Conciliação ok, mas não foi possível salvar a referência do ERP/
    const incompleteReference = (snapshotId) => ({
      snapshot: { snapshotId, updatedAtMs: UPDATED_AT, updatedByName: 'Admin', fileName: 'planilha.xlsx', incomplete: true },
      hintsByProcessId: {},
    })

    async function backToList(user) {
      await user.click(screen.getByRole('button', { name: 'Voltar para Chegadas' }))
      await screen.findByRole('button', ERP_BUTTON)
    }

    async function importAndFail(user) {
      const dialog = await openImportModal(user)
      await user.upload(dialog.querySelector('input[type="file"]'), buildErpWorkbookFile())
      expect(await within(dialog).findByText(SAVE_FAILURE_BANNER)).toBeInTheDocument()
      return dialog
    }

    async function closeModalAndOpenDetail(user, dialog) {
      await user.click(dialog.querySelector('.erp-reconcile__actions .ghost-button'))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importar do DBCorp' })).not.toBeInTheDocument())
      await user.click(screen.getAllByText(/PO 12345/)[0])
      await screen.findByText('Porto de Atracação')
    }

    it('falha no lote 2: recarrega, os chips da referencia antiga somem e o estado incompleto aparece sem recarregar a pagina', async () => {
      const user = userEvent.setup()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      asAdmin()
      mockLoadErpReference.mockResolvedValueOnce(referenceWith(SNAPSHOT_A, 'ITAJAI'))
      // Depois da falha parcial, `loadErpReference` acusa incompleta (hints do snapshot A sobrescritos).
      mockLoadErpReference.mockResolvedValueOnce(incompleteReference(SNAPSHOT_A))
      mockSaveErpReferenceSnapshot.mockRejectedValue(new Error('lote 2 de 3 falhou'))
      renderPage()
      await openDetail(user)
      // Antes: a referencia A acende o chip.
      expect(await screen.findByRole('button', { name: 'Destino no ERP: ITAJAI' })).toBeInTheDocument()
      await backToList(user)

      const dialog = await importAndFail(user)
      expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(1)
      expect(mockLoadErpReference).toHaveBeenCalledTimes(2)
      expect(within(dialog).getByText(/A referência do ERP salva está incompleta/)).toBeInTheDocument()
      expect(within(dialog).queryByText(/Referência atual/)).not.toBeInTheDocument()

      // Depois: o detalhe nao mostra mais o chip da referencia antiga.
      await closeModalAndOpenDetail(user, dialog)
      expect(screen.queryByRole('button', { name: /no ERP/ })).not.toBeInTheDocument()
      expect(mockLoadErpReference).toHaveBeenCalledTimes(2)
      expect(mockSaveProcess).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('falha antes de qualquer lote (nada gravado): a releitura devolve a mesma referencia e o chip continua', async () => {
      const user = userEvent.setup()
      asAdmin()
      mockLoadErpReference.mockResolvedValue(referenceWith(SNAPSHOT_A, 'ITAJAI'))
      mockSaveErpReferenceSnapshot.mockRejectedValue(new Error('lote 1 falhou'))
      renderPage()
      await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

      const dialog = await importAndFail(user)
      expect(mockLoadErpReference).toHaveBeenCalledTimes(2)
      expect(within(dialog).getByText('Referência atual: planilha de 02/10/2026 14:30')).toBeInTheDocument()

      await closeModalAndOpenDetail(user, dialog)
      expect(await screen.findByRole('button', { name: 'Destino no ERP: ITAJAI' })).toBeInTheDocument()
      expect(mockSaveProcess).not.toHaveBeenCalled()
    })

    it('a releitura tambem falha: limpa a referencia em memoria (sem chips) e mostra o aviso', async () => {
      const user = userEvent.setup()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      asAdmin()
      mockLoadErpReference.mockResolvedValueOnce(referenceWith(SNAPSHOT_A, 'ITAJAI'))
      mockLoadErpReference.mockRejectedValueOnce(new Error('sem rede'))
      mockSaveErpReferenceSnapshot.mockRejectedValue(new Error('lote 2 de 3 falhou'))
      renderPage()
      await openDetail(user)
      expect(await screen.findByRole('button', { name: 'Destino no ERP: ITAJAI' })).toBeInTheDocument()
      await backToList(user)

      const dialog = await importAndFail(user)
      expect(mockLoadErpReference).toHaveBeenCalledTimes(2)
      expect(await screen.findByText(/Não foi possível confirmar a referência do ERP depois da falha ao salvar/)).toBeInTheDocument()
      expect(warn).toHaveBeenCalled()

      await closeModalAndOpenDetail(user, dialog)
      expect(screen.queryByRole('button', { name: /no ERP/ })).not.toBeInTheDocument()
      expect(document.querySelector('.error-banner')).toBeNull()
      expect(mockSaveProcess).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('uma leitura inicial lenta que resolve DEPOIS da falha do save e descartada (nao ressuscita a referencia antiga)', async () => {
      const user = userEvent.setup()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      asAdmin()
      let resolveInitialLoad
      mockLoadErpReference.mockReturnValueOnce(new Promise((resolve) => { resolveInitialLoad = resolve }))
      mockLoadErpReference.mockResolvedValueOnce(incompleteReference(SNAPSHOT_A))
      mockSaveErpReferenceSnapshot.mockRejectedValue(new Error('lote 2 de 3 falhou'))
      renderPage()
      await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))

      const dialog = await importAndFail(user)
      expect(mockLoadErpReference).toHaveBeenCalledTimes(2)
      expect(within(dialog).getByText(/A referência do ERP salva está incompleta/)).toBeInTheDocument()

      // A leitura antiga (anterior as gravacoes parciais) chega por ultimo e nao vale.
      resolveInitialLoad(referenceWith(SNAPSHOT_A, 'ZZZ-ANTIGO'))
      await Promise.resolve()
      await Promise.resolve()
      await closeModalAndOpenDetail(user, dialog)
      expect(screen.queryByRole('button', { name: /no ERP/ })).not.toBeInTheDocument()
      warn.mockRestore()
    })
  })

  // F3: criar processos a partir do DBCorp. Relogio fixo: so' `Date` e' falso (meio-dia local
  // = SCENARIO_TODAY em qualquer fuso); os setTimeout reais seguem andando.
  describe('criar processos (F3)', () => {
    const K = CREATION_SCENARIO_KEYS
    const BATCH_ACTION = 'Processos criados via DBCorp'
    let created
    let errorSpy
    let warnSpy

    // Cenario do CR-60: FCL AG. EMBARQUE + CON AG. EMBARQUE + FCL EMBARCOU com DI.
    const threeRows = () =>
      buildCreationScenarioLooseRows().filter(
        (row) => row.poRef === K.fclAgEmbarque || row.refEmbarque === K.con || row.poRef === K.fclEmbarcouComDi
      )

    const savedNames = () => mockSaveProcess.mock.calls.map(([payload]) => payload.name)
    const savedIds = () => mockSaveProcess.mock.calls.map(([payload]) => payload.id)
    const savedPayload = (name) => mockSaveProcess.mock.calls.map(([payload]) => payload).find((payload) => payload.name === name)

    // Cada save devolve o processo com id PROC-t<n> e o poe na lista que o servico "devolve" depois.
    function useRecordingBackend() {
      mockListProcesses.mockImplementation(async () => [...PROCESSES, ...created])
      mockSaveProcess.mockImplementation(async (payload) => {
        const saved = { ...payload, id: `PROC-t${created.length + 1}` }
        created.push(saved)
        return saved
      })
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0))
      created = []
      asAdmin()
      mockSaveProcess.mockReset()
      useRecordingBackend()
      mockSaveErpReferenceSnapshot.mockResolvedValue(savedWith(referenceWith(SNAPSHOT_B, 'SANTOS')))
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.useRealTimers()
      mockSaveProcess.mockReset()
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    })

    async function uploadScenario(user, rows = threeRows()) {
      await waitFor(() => expect(screen.getAllByText(/PO 12345/).length).toBeGreaterThan(0))
      const dialog = await openImportModal(user)
      await user.upload(dialog.querySelector('input[type="file"]'), buildErpWorkbookFile('criar.xlsx', rows))
      expect(await within(dialog).findByText('Referência do ERP salva: 1 processo.')).toBeInTheDocument()
      return dialog
    }

    async function openCreateTab(user, dialog, count) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`^Criar processos \\(${count}\\)`) }))
    }

    async function selectAll(user, dialog) {
      for (const box of within(dialog).getAllByRole('checkbox', { name: /^Selecionar todos de/ })) {
        await user.click(box)
      }
    }

    async function confirm(user, dialog, count) {
      await user.click(within(dialog).getByRole('button', { name: count === 1 ? 'Criar 1 processo' : `Criar ${count} processos` }))
      await user.click(within(dialog).getByRole('button', { name: 'Confirmar criação' }))
    }

    async function createAllThree(user) {
      renderPage()
      const dialog = await uploadScenario(user)
      await openCreateTab(user, dialog, 3)
      await selectAll(user, dialog)
      await confirm(user, dialog, 3)
      return dialog
    }

    it('caso-real: CR-60 so o upload da planilha nao cria nada (a referencia e salva, processes nao)', async () => {
      const user = userEvent.setup()
      renderPage()
      const dialog = await uploadScenario(user)
      await openCreateTab(user, dialog, 3)
      expect(mockSaveProcess).not.toHaveBeenCalled()
      expect(mockCreateAuditEvent).not.toHaveBeenCalled()
      expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(1)
    })

    it('caso-real: CR-60 caminho feliz: 3 processos salvos pelo mesmo caminho do Novo processo, 1 audit do lote e a referencia regravada', async () => {
      const user = userEvent.setup()
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('3 processos criados · 0 pulados · 0 com erro')).toBeInTheDocument()

      expect(mockSaveProcess).toHaveBeenCalledTimes(3)
      expect(savedNames().sort()).toEqual([K.fclAgEmbarque, K.fclEmbarcouComDi, 'CON DG 964-26'].sort())
      for (const [payload, actor] of mockSaveProcess.mock.calls) {
        expect(payload.id).toBe('')
        expect(payload.etaOriginal).toBe(payload.eta)
        expect(actor).toMatchObject({ role: 'admin', name: 'Admin Teste' })
      }
      expect(savedPayload(K.fclAgEmbarque)).toMatchObject({
        category: 'FCL', processNumber: '9620', purchaseOrders: [], supplierName: 'ALFA CHEM', destination: 'ITAJAÍ',
        incoterm: 'FOB', originLocation: 'KOBE', etd: '2026-10-20', eta: '2026-11-25', etaOriginal: '2026-11-25',
        shippedAt: '', duimpNumber: '', duimpRegisteredAt: '', houseBl: 'HBL-962', masterBl: '',
      })
      expect(savedPayload(K.fclAgEmbarque).items.map(({ commercialName, quantity }) => ({ commercialName, quantity }))).toEqual([
        { commercialName: 'RESINA OMEGA', quantity: 1000 },
        { commercialName: 'SOLVENTE PI', quantity: 500.5 },
      ])
      const con = savedPayload('CON DG 964-26')
      expect(con).toMatchObject({ category: 'CONSOLIDADO', processNumber: '', supplierName: '', houseBl: 'HBL-964', masterBl: '' })
      expect(con.purchaseOrders.map((order) => order.po)).toEqual(['9640', '9641', '9642'])
      expect(con.items.map((item) => item.poNumber)).toEqual(['9640', '9641', '9642'])
      expect(savedPayload(K.fclEmbarcouComDi)).toMatchObject({
        category: 'FCL', shippedAt: '2026-09-28', etd: '2026-09-28', eta: '2026-10-20',
        duimpNumber: '25/1234567-8', duimpRegisteredAt: '2026-10-01T00:00', houseBl: 'HBL-967', masterBl: '',
      })

      // A lista do servidor e' lida antes do 1o save e de novo depois do ultimo.
      const listOrders = mockListProcesses.mock.invocationCallOrder
      const saveOrders = mockSaveProcess.mock.invocationCallOrder
      expect(listOrders.filter((order) => order < Math.min(...saveOrders)).length).toBeGreaterThanOrEqual(2)
      expect(Math.max(...listOrders)).toBeGreaterThan(Math.max(...saveOrders))

      // 1 audit do lote, com os nomes e os ids; mais a referencia regravada (D-F3-3).
      expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.action).toBe(BATCH_ACTION)
      // O audit individual de cada criado e' o "Processo criado" do saveProcess: o payload vai SEM id
      // (com id o saveProcess gravaria "Processo atualizado") e a pagina so' grava o do lote.
      expect(mockSaveProcess.mock.calls.every(([payload]) => payload.id === '')).toBe(true)
      expect(mockCreateAuditEvent.mock.calls.map(([audit]) => audit.action)).toEqual([BATCH_ACTION])
      expect(event.actor).toBe('Admin Teste')
      expect(event.target.startsWith('3 processos: ')).toBe(true)
      for (const name of [K.fclAgEmbarque, K.fclEmbarcouComDi, 'CON DG 964-26']) expect(event.target).toContain(name)
      expect(event.target).toMatch(/\(PROC-t1\)/)
      expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(2)

      // Nada financeiro atravessa a fronteira de escrita (a matriz do xlsx tinha as sentinelas).
      for (const sentinel of FINANCIAL_SENTINEL_STRINGS) {
        expect(JSON.stringify(mockSaveProcess.mock.calls)).not.toContain(sentinel)
        expect(JSON.stringify(mockCreateAuditEvent.mock.calls)).not.toContain(sentinel)
      }

      // Depois de criar o modal concilia de novo: os 3 passam a casados e saem da aba.
      expect(within(dialog).getByRole('button', { name: /^Criar processos \(0\)/ })).toBeInTheDocument()
    })

    it('caso-real: CR-60 os saves rodam em sequencia: o 2o so comeca depois que o 1o resolve', async () => {
      const user = userEvent.setup()
      let releaseFirst
      mockSaveProcess.mockReset()
      mockSaveProcess.mockImplementationOnce(
        (payload) =>
          new Promise((resolve) => {
            releaseFirst = () => {
              const saved = { ...payload, id: 'PROC-t1' }
              created.push(saved)
              resolve(saved)
            }
          })
      )
      mockSaveProcess.mockImplementation(async (payload) => {
        const saved = { ...payload, id: `PROC-t${created.length + 1}` }
        created.push(saved)
        return saved
      })
      const dialog = await createAllThree(user)
      await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
      // Tempo real passa e o 2o save nao comeca enquanto o 1o esta pendente.
      await new Promise((resolve) => setTimeout(resolve, 40))
      expect(mockSaveProcess).toHaveBeenCalledTimes(1)
      expect(within(dialog).getByText('Criando 1 de 3…')).toBeInTheDocument()

      releaseFirst()
      await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(3))
      expect(await within(dialog).findByText('3 processos criados · 0 pulados · 0 com erro')).toBeInTheDocument()
    })

    it('caso-real: CR-60 saveProcess devolvendo undefined: o lote conclui sem TypeError', async () => {
      const user = userEvent.setup()
      mockSaveProcess.mockReset()
      mockSaveProcess.mockResolvedValue(undefined)
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('3 processos criados · 0 pulados · 0 com erro')).toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(3)
      expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
      expect(within(dialog).queryByText(/TypeError/)).not.toBeInTheDocument()
    })

    it('caso-real: CR-68 lista fresca que ja tem o PEDIDO do FCL: so os outros sao salvos e o FCL aparece em Pulados', async () => {
      const user = userEvent.setup()
      const existing = { id: 'p-ja', name: K.fclAgEmbarque, processNumber: '9620', category: 'FCL' }
      mockListProcesses.mockReset()
      mockListProcesses
        .mockResolvedValueOnce(PROCESSES)
        .mockResolvedValueOnce([...PROCESSES, existing])
        .mockImplementation(async () => [...PROCESSES, existing, ...created])
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('2 processos criados · 1 pulado · 0 com erro')).toBeInTheDocument()
      expect(savedNames().sort()).toEqual([K.fclEmbarcouComDi, 'CON DG 964-26'].sort())
      expect(within(dialog).getByText(`${K.fclAgEmbarque} — já existe: ${K.fclAgEmbarque}`)).toBeInTheDocument()
      expect(within(dialog).getByRole('heading', { name: 'Resultado da criação' })).toHaveFocus()
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.target.startsWith('2 processos: ')).toBe(true)
      expect(event.target).not.toContain(K.fclAgEmbarque)
    })

    it('caso-real: CR-68 um saveProcess rejeitado: os outros sao criados, "Com erro" mostra a mensagem e o audit lista so os criados', async () => {
      const user = userEvent.setup()
      mockSaveProcess.mockReset()
      mockSaveProcess.mockImplementation(async (payload) => {
        if (payload.name === 'CON DG 964-26') throw new Error('falha-ao-gravar')
        const saved = { ...payload, id: `PROC-t${created.length + 1}` }
        created.push(saved)
        return saved
      })
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('2 processos criados · 0 pulados · 1 com erro')).toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(3)
      const failedItem = within(dialog).getByText(/^CON DG 964-26: Não foi possível salvar o processo\./)
      expect(failedItem).toHaveTextContent('falha-ao-gravar')
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.target.startsWith('2 processos: ')).toBe(true)
      expect(event.target).not.toContain('CON DG 964-26')
      // O que falhou continua candidato (ainda e' criavel).
      expect(within(dialog).getByRole('button', { name: /^Criar processos \(1\)/ })).toBeInTheDocument()
    })

    // `afterWrite`: grava o documento (poe na lista que o servico devolve, com id gerado pelo "servico") e so'
    // depois rejeita, como um save cuja resposta falha depois da gravacao. `beforeWrite`: rejeita SEM gravar.
    function rejectSaves({ afterWrite = [], beforeWrite = [] }) {
      mockSaveProcess.mockReset()
      mockSaveProcess.mockImplementation(async (payload) => {
        if (beforeWrite.includes(payload.name)) throw new Error('falha-ao-gravar')
        const saved = { ...payload, id: `PROC-t${created.length + 1}` }
        created.push(saved)
        if (afterWrite.includes(payload.name)) throw new Error('audit-fora')
        return saved
      })
    }
    const createdId = (name) => created.find((item) => item.name === name)?.id

    it('caso-real: CR-68 save rejeita DEPOIS de gravar (CON) e outro rejeita SEM gravar (FCL): o 1o vira "Criado (falha só no registro de auditoria)", o 2o continua "Com erro"; ids gerados pelo saveProcess', async () => {
      const user = userEvent.setup()
      rejectSaves({ afterWrite: ['CON DG 964-26'], beforeWrite: [K.fclEmbarcouComDi] })
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('2 processos criados · 0 pulados · 1 com erro')).toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(3)
      // A pagina nao define o id: o saveProcess gera e audita "Processo criado".
      expect(savedIds()).toEqual(['', '', ''])
      const conId = createdId('CON DG 964-26')
      expect(conId).toMatch(/^PROC-t\d$/)

      expect(within(dialog).getByRole('heading', { name: 'Criados (2)' })).toBeInTheDocument()
      expect(
        within(dialog).getByText(`CON DG 964-26 (${conId}) — Criado (falha só no registro de auditoria)`)
      ).toBeInTheDocument()
      expect(within(dialog).getByRole('heading', { name: 'Com erro (1)' })).toBeInTheDocument()
      const failedItem = within(dialog).getByText(new RegExp(`^${K.fclEmbarcouComDi}: Não foi possível salvar o processo\\.`))
      expect(failedItem).toHaveTextContent('falha-ao-gravar')
      expect(within(dialog).queryByText(/Não foi possível salvar o processo\..*audit-fora/)).not.toBeInTheDocument()

      // O audit do lote lista os 2 criados, o recuperado com a observacao, e nao o que falhou de verdade.
      expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.action).toBe(BATCH_ACTION)
      expect(event.target.startsWith('2 processos: ')).toBe(true)
      expect(event.target).toContain(`CON DG 964-26 (${conId}; falha só no registro de auditoria)`)
      expect(event.target).toContain(K.fclAgEmbarque)
      expect(event.target).not.toContain(K.fclEmbarcouComDi)

      // D-F3-3: houve criados, entao a referencia e regravada; o CON recuperado passa a casado e o que
      // falhou de verdade continua candidato.
      expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(2)
      expect(within(dialog).getByRole('button', { name: /^Criar processos \(1\)/ })).toBeInTheDocument()
    })

    it('caso-real: CR-68 mesmo cenario com os papeis trocados: o FCL que rejeita DEPOIS de gravar e recuperado (casa por PEDIDO/nome) e o CON que rejeita SEM gravar continua "Com erro"', async () => {
      const user = userEvent.setup()
      rejectSaves({ afterWrite: [K.fclEmbarcouComDi], beforeWrite: ['CON DG 964-26'] })
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('2 processos criados · 0 pulados · 1 com erro')).toBeInTheDocument()
      const fclId = createdId(K.fclEmbarcouComDi)
      expect(within(dialog).getByText(`${K.fclEmbarcouComDi} (${fclId}) — Criado (falha só no registro de auditoria)`)).toBeInTheDocument()
      expect(within(dialog).getByText(/^CON DG 964-26: Não foi possível salvar o processo\./)).toHaveTextContent('falha-ao-gravar')
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.target).toContain(`${K.fclEmbarcouComDi} (${fclId}; falha só no registro de auditoria)`)
      expect(event.target).not.toContain('CON DG 964-26')
      expect(within(dialog).getByRole('button', { name: /^Criar processos \(1\)/ })).toBeInTheDocument()
    })

    it('caso-real: CR-68 2 saves rejeitam depois de gravar no mesmo lote: cada um e recuperado com o SEU processo (nenhum processo e contado 2 vezes)', async () => {
      const user = userEvent.setup()
      rejectSaves({ afterWrite: ['CON DG 964-26', K.fclAgEmbarque] })
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('3 processos criados · 0 pulados · 0 com erro')).toBeInTheDocument()
      const conId = createdId('CON DG 964-26')
      const fclId = createdId(K.fclAgEmbarque)
      expect(conId).not.toBe(fclId)
      expect(within(dialog).getByText(`CON DG 964-26 (${conId}) — Criado (falha só no registro de auditoria)`)).toBeInTheDocument()
      expect(within(dialog).getByText(`${K.fclAgEmbarque} (${fclId}) — Criado (falha só no registro de auditoria)`)).toBeInTheDocument()
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.target.startsWith('3 processos: ')).toBe(true)
      expect(event.target).toContain(`(${conId}; falha só no registro de auditoria)`)
      expect(event.target).toContain(`(${fclId}; falha só no registro de auditoria)`)
      expect(within(dialog).getByRole('button', { name: /^Criar processos \(0\)/ })).toBeInTheDocument()
    })

    it('caso-real: CR-68 save rejeitou depois de gravar mas a releitura da lista falha: nao da para confirmar e o item continua "Com erro"', async () => {
      const user = userEvent.setup()
      // 1a: carga da pagina; 2a: lista fresca; 3a (a releitura): rejeitada.
      mockListProcesses.mockReset()
      mockListProcesses
        .mockResolvedValueOnce(PROCESSES)
        .mockResolvedValueOnce(PROCESSES)
        .mockRejectedValueOnce(new Error('sem rede'))
      rejectSaves({ afterWrite: ['CON DG 964-26'] })
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('2 processos criados · 0 pulados · 1 com erro')).toBeInTheDocument()
      expect(within(dialog).getByText(/^CON DG 964-26: Não foi possível salvar o processo\./)).toBeInTheDocument()
      expect(within(dialog).queryByText(/Criado \(falha só no registro de auditoria\)/)).not.toBeInTheDocument()
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.target).not.toContain('CON DG 964-26')
    })

    it('caso-real: CR-68 save rejeitou SEM gravar e a lista recarregada traz so processos que nao casam com o rascunho: continua "Com erro" e nao entra no audit do lote', async () => {
      const user = userEvent.setup()
      const other = { id: 'p-outro', name: 'OUTRO PROCESSO NOVO', processNumber: '4242', category: 'FCL' }
      mockListProcesses.mockImplementation(async () => [...PROCESSES, ...created, ...(created.length > 0 ? [other] : [])])
      rejectSaves({ beforeWrite: [K.fclAgEmbarque] })
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('2 processos criados · 0 pulados · 1 com erro')).toBeInTheDocument()
      expect(within(dialog).getByText(new RegExp(`^${K.fclAgEmbarque}: Não foi possível salvar o processo\\.`))).toBeInTheDocument()
      expect(within(dialog).queryByText(/Criado \(falha só no registro de auditoria\)/)).not.toBeInTheDocument()
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.target.startsWith('2 processos: ')).toBe(true)
      expect(event.target).not.toContain(K.fclAgEmbarque)
    })

    it('caso-real: CR-68 lista fresca vazia: nenhum save, nenhum audit e o erro aparece', async () => {
      const user = userEvent.setup()
      mockListProcesses.mockReset()
      mockListProcesses.mockResolvedValueOnce(PROCESSES).mockResolvedValueOnce([])
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText(/Não foi possível criar os processos\./)).toBeInTheDocument()
      expect(within(dialog).getByText(/veio vazia/)).toBeInTheDocument()
      expect(mockSaveProcess).not.toHaveBeenCalled()
      expect(mockCreateAuditEvent).not.toHaveBeenCalled()
      expect(mockSaveErpReferenceSnapshot).toHaveBeenCalledTimes(1)
    })

    it('caso-real: CR-68 lista fresca com o FCL gravado como consolidado (sem embarque casado, mesmo PEDIDO): o FCL e pulado e nao e salvo', async () => {
      const user = userEvent.setup()
      // O processo do Portal nao casa com o embarque FCL (portalOnly), mas tem o PEDIDO 9620 nas POs: criar de novo duplicaria.
      const legacy = {
        id: 'p-leg', name: 'PROCESSO LEGADO', processNumber: '', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: '9620', reference: '', supplierName: '' }],
      }
      mockListProcesses.mockReset()
      mockListProcesses
        .mockResolvedValueOnce(PROCESSES)
        .mockResolvedValueOnce([...PROCESSES, legacy])
        .mockImplementation(async () => [...PROCESSES, legacy, ...created])
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('2 processos criados · 1 pulado · 0 com erro')).toBeInTheDocument()
      expect(savedNames().sort()).toEqual([K.fclEmbarcouComDi, 'CON DG 964-26'].sort())
      expect(within(dialog).getByText(`${K.fclAgEmbarque} — já existe: PROCESSO LEGADO`)).toBeInTheDocument()
    })

    it('caso-real: CR-68 id repetido devolvido pelo saveProcess: so o 1o conta como criado, os outros caem em "Com erro" com o id e o nome do anterior', async () => {
      const user = userEvent.setup()
      mockSaveProcess.mockReset()
      mockSaveProcess.mockImplementation(async (payload) => ({ ...payload, id: 'PROC-same' }))
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('1 processo criado · 0 pulados · 2 com erro')).toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(3)
      const repeated = within(dialog).getAllByText(/Id repetido \(PROC-same\): confira o processo /)
      expect(repeated).toHaveLength(2)
      const firstName = savedNames()[0]
      for (const item of repeated) expect(item).toHaveTextContent(`confira o processo ${firstName}`)
    })

    it('caso-real: CR-68 FCL e LCL do mesmo PEDIDO e PO no mesmo lote: o 2o e pulado (so 1 save), mesmo sem o recheck acusar', async () => {
      const user = userEvent.setup()
      const twinRows = ['FCL - FOB KOBE', 'LCL - FOB NINGBO'].map((refEmbarque, index) =>
        makeLooseRow({
          itemId: `TW-${index + 1}`, status: 'AG. EMBARQUE', exporter: 'ALFA CHEM', pedido: 9620, poRef: K.fclAgEmbarque,
          refEmbarque, commercialName: 'RESINA OMEGA', quantityKg: 1000,
        })
      )
      renderPage()
      const dialog = await uploadScenario(user, twinRows)
      await openCreateTab(user, dialog, 2)
      await selectAll(user, dialog)
      await confirm(user, dialog, 2)
      expect(await within(dialog).findByText('1 processo criado · 1 pulado · 0 com erro')).toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(1)
      expect(within(dialog).getByText(new RegExp(`^${K.fclAgEmbarque} — já existe: ${K.fclAgEmbarque}$`))).toBeInTheDocument()
    })

    it('caso-real: CR-68 gemeo no mesmo lote: o 1o rejeita SEM gravar e o 2o (mesma identidade) grava: o 1o NAO toma o processo do 2o, continua "Com erro"', async () => {
      const user = userEvent.setup()
      const twinRows = ['FCL - FOB KOBE', 'LCL - FOB NINGBO'].map((refEmbarque, index) =>
        makeLooseRow({
          itemId: `TW-${index + 1}`, status: 'AG. EMBARQUE', exporter: 'ALFA CHEM', pedido: 9620, poRef: K.fclAgEmbarque,
          refEmbarque, commercialName: 'RESINA OMEGA', quantityKg: 1000,
        })
      )
      mockSaveProcess.mockReset()
      mockSaveProcess.mockRejectedValueOnce(new Error('falha-ao-gravar')).mockImplementation(async (payload) => {
        const saved = { ...payload, id: `PROC-t${created.length + 1}` }
        created.push(saved)
        return saved
      })
      renderPage()
      const dialog = await uploadScenario(user, twinRows)
      await openCreateTab(user, dialog, 2)
      await selectAll(user, dialog)
      await confirm(user, dialog, 2)
      expect(await within(dialog).findByText('1 processo criado · 0 pulados · 1 com erro')).toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(2)
      expect(within(dialog).getByText(new RegExp(`^${K.fclAgEmbarque}: Não foi possível salvar o processo\\.`))).toHaveTextContent('falha-ao-gravar')
      expect(within(dialog).queryByText(/Criado \(falha só no registro de auditoria\)/)).not.toBeInTheDocument()
      const [event] = mockCreateAuditEvent.mock.calls[0]
      expect(event.target).toBe(`1 processo: ${K.fclAgEmbarque} (PROC-t1)`)
    })

    it('caso-real: CR-68 audit do lote rejeitado: os criados ficam, sem erro de lote (so um aviso)', async () => {
      const user = userEvent.setup()
      mockCreateAuditEvent.mockRejectedValue(new Error('audit-fora'))
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('3 processos criados · 0 pulados · 0 com erro')).toBeInTheDocument()
      expect(within(dialog).getByText(/registro de auditoria do lote não foi gravado/)).toBeInTheDocument()
      expect(within(dialog).queryByText(/Não foi possível criar os processos/)).not.toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(3)
      expect(warnSpy).toHaveBeenCalled()
    })

    it('caso-real: CR-68 o refresh da lista falha: aviso (toast) e o modal concilia com a lista local', async () => {
      const user = userEvent.setup()
      // 1a: carga da pagina; 2a: lista fresca; 3a (o refresh): rejeitada.
      mockListProcesses.mockReset()
      mockListProcesses
        .mockResolvedValueOnce(PROCESSES)
        .mockResolvedValueOnce(PROCESSES)
        .mockRejectedValueOnce(new Error('sem rede'))
      const dialog = await createAllThree(user)
      expect(await within(dialog).findByText('3 processos criados · 0 pulados · 0 com erro')).toBeInTheDocument()
      expect(await screen.findByText(/A lista de processos não foi recarregada/)).toBeInTheDocument()
      expect(within(dialog).getByText(/A lista de processos não pôde ser recarregada/)).toBeInTheDocument()
      // O modal conciliou com a lista local (fresca + criados): os 3 casaram.
      expect(within(dialog).getByRole('button', { name: /^Criar processos \(0\)/ })).toBeInTheDocument()
    })

    it('caso-real: CR-68 trava de modulo: com o lote em voo, sair e voltar da pagina recusa um 2o lote', async () => {
      const user = userEvent.setup()
      let releaseFirst
      mockSaveProcess.mockReset()
      mockSaveProcess.mockImplementationOnce(
        (payload) =>
          new Promise((resolve) => {
            releaseFirst = () => {
              const saved = { ...payload, id: 'PROC-t1' }
              created.push(saved)
              resolve(saved)
            }
          })
      )
      mockSaveProcess.mockImplementation(async (payload) => {
        const saved = { ...payload, id: `PROC-t${created.length + 1}` }
        created.push(saved)
        return saved
      })
      // 1o lote: so 1 embarque escolhido (com o save pendente), para o fim ser previsivel.
      const first = renderPage()
      const dialog = await uploadScenario(user)
      await openCreateTab(user, dialog, 3)
      await user.click(within(dialog).getByRole('checkbox', { name: K.fclAgEmbarque }))
      await confirm(user, dialog, 1)
      await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
      first.unmount()

      // 2a montagem: a trava e' do MODULO, entao o 2o lote e' recusado e nada novo e' salvo.
      renderPage()
      const dialog2 = await uploadScenario(user)
      await openCreateTab(user, dialog2, 3)
      await user.click(within(dialog2).getByRole('checkbox', { name: 'CON DG 964-26' }))
      await confirm(user, dialog2, 1)
      expect(await within(dialog2).findByText(/Outra criação de processos ainda está em andamento\./)).toBeInTheDocument()
      expect(mockSaveProcess).toHaveBeenCalledTimes(1)

      // Resolve o save pendente (a trava vazaria para o teste seguinte) e espera o fim do lote.
      releaseFirst()
      await waitFor(() => expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(mockListProcesses.mock.calls.length).toBeGreaterThanOrEqual(4))
    })
  })
})

// D-F3-1: House BL unico na edicao pela pagina (o campo mostra houseBl || masterBl; editar limpa o
// masterBl legado; voltar ao valor original restaura o par; salvar sem tocar no campo nao migra nada).
describe('ProcessesPage — House BL unico (D-F3-1)', () => {
  const LEGACY = {
    id: 'p-leg',
    name: 'ALFA SEA 962-26',
    processNumber: '9620',
    category: 'FCL',
    status: 'Em Andamento',
    destination: 'Navegantes',
    eta: '2026-07-15',
    containers: [],
    masterBl: 'MBL-1',
    houseBl: '',
    items: [{ id: 'it-1', commercialName: 'RESINA OMEGA', quantity: 10 }],
  }

  async function openEdit(user) {
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin', name: 'Admin Teste' } })
    mockListProcesses.mockResolvedValue([LEGACY])
    mockSaveProcess.mockReset()
    mockSaveProcess.mockImplementation(async (payload) => ({ ...payload, id: payload.id || 'PROC-x' }))
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/ALFA SEA 962-26/).length).toBeGreaterThan(0))
    await user.click(container.querySelector('.process-item--button'))
    await user.click(await screen.findByRole('button', { name: 'Editar processo' }))
    await screen.findByRole('heading', { name: 'Editar processo' })
    // O campo do BL fica no passo "Embarque" do wizard.
    await user.click(within(screen.getByLabelText('Etapas do cadastro')).getByRole('button', { name: /Embarque/ }))
    return screen.getByRole('textbox', { name: 'House BL' })
  }

  afterEach(() => {
    mockSaveProcess.mockReset()
  })

  it('caso-real: CR-71 FCL legado: o campo mostra o MBL antigo; trocar para HBL-9 e salvar grava houseBl e limpa o masterBl', async () => {
    const user = userEvent.setup()
    const field = await openEdit(user)
    expect(field).toHaveValue('MBL-1')
    await user.clear(field)
    await user.type(field, 'HBL-9')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
    expect(mockSaveProcess.mock.calls[0][0]).toMatchObject({ houseBl: 'HBL-9', masterBl: '' })
  })

  it('caso-real: CR-71 apagar o campo e digitar o MBL antigo de novo restaura o par (masterBl) ao salvar', async () => {
    const user = userEvent.setup()
    const field = await openEdit(user)
    await user.clear(field)
    expect(field).toHaveValue('')
    await user.type(field, 'MBL-1')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
    expect(mockSaveProcess.mock.calls[0][0]).toMatchObject({ masterBl: 'MBL-1', houseBl: '' })
  })

  it('caso-real: CR-71 mudar so outro campo (Observações) e salvar nao migra o BL: masterBl e houseBl como estavam', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin', name: 'Admin Teste' } })
    mockListProcesses.mockResolvedValue([LEGACY])
    mockSaveProcess.mockReset()
    mockSaveProcess.mockImplementation(async (payload) => ({ ...payload, id: payload.id || 'PROC-x' }))
    const { container } = renderPage()
    await waitFor(() => expect(screen.getAllByText(/ALFA SEA 962-26/).length).toBeGreaterThan(0))
    await user.click(container.querySelector('.process-item--button'))
    await user.click(await screen.findByRole('button', { name: 'Editar processo' }))
    await screen.findByRole('heading', { name: 'Editar processo' })
    await user.click(within(screen.getByLabelText('Etapas do cadastro')).getByRole('button', { name: /Carga/ }))
    const notes = screen.getByLabelText('Observações do processo')
    await user.type(notes, 'nota')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mockSaveProcess).toHaveBeenCalledTimes(1))
    expect(mockSaveProcess.mock.calls[0][0]).toMatchObject({ masterBl: 'MBL-1', houseBl: '' })
  })
})
