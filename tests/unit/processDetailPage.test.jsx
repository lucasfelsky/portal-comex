// Refino F4c: o detalhe desktop DENTRO da ProcessesPage (pagina real, repositorios
// mockados). Cobre o que so a pagina decide: a raiz `surface--process-detail`, o
// titulo "Fila de chegadas" que some no detalhe desktop, a troca ao vivo desktop <->
// tablet sem perder o processo aberto e o "Completar agora" (Dados pendentes) que abre
// a edicao ja com o foco no 1o campo pendente. Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
  resolvePostReceiptImagesForSave: vi.fn().mockResolvedValue([]),
}))

import ProcessesPage from '../../src/pages/ProcessesPage'

function installMatchMedia({ desktop = true, mobile = false } = {}) {
  const state = { desktop, mobile }
  const listeners = { desktop: new Set(), mobile: new Set() }
  const keyOf = (query) => (query.includes('1041') ? 'desktop' : query.includes('720') ? 'mobile' : null)
  window.matchMedia = vi.fn((query) => {
    const key = keyOf(query)
    return {
      get matches() {
        return key ? state[key] : false
      },
      media: query,
      onchange: null,
      addEventListener: (type, fn) => {
        if (type === 'change' && key) listeners[key].add(fn)
      },
      removeEventListener: (type, fn) => {
        if (type === 'change' && key) listeners[key].delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
  return {
    setDesktop(value) {
      state.desktop = value
      act(() => {
        listeners.desktop.forEach((fn) => fn({ matches: value }))
      })
    },
  }
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia

const PROCESSES = [
  {
    id: 'p-1',
    name: 'Resina epóxi líquida',
    processNumber: '4500128734',
    category: 'FCL',
    destination: 'Itajaí',
    processStatus: 'Aguardando Embarque',
    containerQuantity: 2,
    // sem ETD/ETA nem transportadora: o 1o campo pendente e' o ETD
    etd: '',
    eta: '',
    carrierName: '',
    items: [{ id: 'i-1', commercialName: 'Resina EP-128', quantity: 36000 }],
  },
]

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

async function openDetail(container, user) {
  await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
  await user.click(container.querySelector('.chg-row__main'))
  await waitFor(() => expect(container.querySelector('.pdv-head')).not.toBeNull())
}

beforeEach(() => {
  installMatchMedia({ desktop: true, mobile: false })
  mockUseAuth.mockReset()
  mockListProcesses.mockReset()
  mockUseAuth.mockReturnValue({
    profile: { uid: 'u-1', name: 'Lucas', role: 'admin', favoriteProcessIds: [] },
    toggleFavoriteProcess: vi.fn(),
  })
  mockListProcesses.mockResolvedValue(PROCESSES)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('F4c - detalhe desktop dentro da ProcessesPage', () => {
  it('raiz surface--process-detail, sem o titulo "Fila de chegadas" e com o cabecalho do processo', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    expect(container.querySelector('section.surface')).toHaveClass('surface--process-detail')
    expect(container.querySelector('section.surface')).not.toHaveClass('surface--arrivals')
    expect(container.querySelector('.section-heading')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Fila de chegadas' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Resina epóxi líquida' })).toBeInTheDocument()
  })

  it('Voltar devolve a lista (a lista desktop volta com o titulo)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
    expect(screen.getByRole('heading', { level: 2, name: 'Fila de chegadas' })).toBeInTheDocument()
    expect(container.querySelector('section.surface')).toHaveClass('surface--arrivals')
  })

  it('troca ao vivo desktop <-> tablet no detalhe: o processo aberto e a aba continuam, sem recarregar dados', async () => {
    const user = userEvent.setup()
    const media = installMatchMedia({ desktop: true, mobile: false })
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('tab', { name: 'Itens' }))
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveAttribute('aria-selected', 'true')

    media.setDesktop(false)
    expect(container.querySelector('.pdv-head')).toBeNull()
    expect(container.querySelector('.process-timeline')).not.toBeNull()
    expect(container.querySelector('.section-heading')).toBeTruthy()
    expect(container.querySelector('section.surface')).not.toHaveClass('surface--process-detail')
    expect(screen.getByRole('heading', { level: 2, name: 'Resina epóxi líquida' })).toBeInTheDocument()
    expect(container.querySelector('.detail-tab-select__native')).toHaveValue('items')

    media.setDesktop(true)
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    expect(container.querySelector('.section-heading')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveAttribute('aria-selected', 'true')
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
  })

  it('"Completar agora" abre a edicao do processo com o foco no 1o campo pendente (ETD)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    const note = screen.getByRole('note')
    expect(within(note).getByText(/Dados pendentes/)).toBeInTheDocument()
    await user.click(within(note).getByRole('button', { name: 'Completar agora' }))
    await waitFor(() => expect(document.getElementById('process-field-etd')).not.toBeNull())
    await waitFor(() => expect(document.getElementById('process-field-etd')).toHaveFocus())
  })

  it('"Editar processo" abre a edicao sem foco forcado (o botao nao repassa o evento como campo)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    await waitFor(() => expect(container.querySelector('.process-form')).not.toBeNull())
    expect(document.getElementById('process-field-etd')?.matches(':focus') ?? false).toBe(false)
  })
})
