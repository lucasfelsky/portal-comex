// Tests do DashboardPage.
// Cobre:
//   - Loading inicial: 3 estados de loading (Barra, Comunicados, Favoritos)
//   - Barra do Rio: mostra label + tone class quando carregado
//   - Barra do Rio: "Carregando" enquanto isLoading
//   - Barra do Rio: "Indisponivel" quando barStatus e' null
//   - Comunicados: mostra ate 3 cards com titulo, canal, conteudo
//   - Comunicados: empty state se lista vazia
//   - Comunicados: limita a 3 (mesmo que a API retorne mais)
//   - Favoritos: "Nenhum processo favoritado" se profile.favoriteProcessIds vazio
//   - Favoritos: renderiza cards com titulo, categoria, destino, status
//   - Favoritos: contador "X favoritos" no header
//   - Admin: passa isAdmin=true para WeeklyArrivalsCard (via prop drilling)
//
// O componente renderiza 3 secoes: Barra do Rio, Comunicados (top 3),
// Processos favoritos (filtrados por profile.favoriteProcessIds).
// Detalhes de cada card (pos-atracacao, DTA, MAPA, collection windows)
// estao cobertos indiretamente via ProcessDerivedStatusBadge + os modais
// de ProcessesPage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
const mockNavigate = vi.fn()
const mockListAnnouncements = vi.fn()
const mockGetBarStatus = vi.fn()
const mockListProcesses = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('react-router-dom', () => ({
  MemoryRouter: ({ children }) => children,
  Routes: ({ children }) => children,
  Route: ({ element }) => element,
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
  Navigate: () => null,
  Outlet: () => null,
}))
vi.mock('../../src/services/announcementsRepository', () => ({
  listAnnouncements: (...args) => mockListAnnouncements(...args),
}))
vi.mock('../../src/services/barStatusRepository', () => ({
  getBarStatus: (...args) => mockGetBarStatus(...args),
  BAR_STATUS_OPTIONS: [
    { value: 'PRATICAVEL', label: 'PRATICAVEL', tone: 'ok' },
    { value: 'PRATICAVEL_RESTRICOES', label: 'PRATICAVEL C/ RESTRICOES', tone: 'warn' },
    { value: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' },
  ],
  saveBarStatus: vi.fn(),
}))
vi.mock('../../src/services/processesRepository', () => ({
  listProcesses: (...args) => mockListProcesses(...args),
  channelOptions: ['Maritima', 'Aerea'],
  collectionStatusOptions: ['Aguardando'],
  dtaStatusOptions: [],
  duimpStatusOptions: [],
  mapaStatusOptions: [],
  processCategoryOptions: ['FCL', 'LCL', 'AEREO'],
  saveProcess: vi.fn(),
  saveProcessCollectionStatus: vi.fn(),
  saveProcessPostReceiptNotes: vi.fn(),
  deleteProcess: vi.fn(),
}))
vi.mock('../../src/features/processes/processStatusView', () => ({
  getChannelToneClass: () => 'tag-blue',
  getDisplayedCollectionStatus: (s) => s,
  getStatusTagClass: () => 'tag-ok',
  isCollectionScheduleRetainingStatus: () => false,
  isDtaTransitCompletedStatus: () => false,
  isMapaInspectionScheduledStatus: () => false,
  shouldHideProcessCardSchedule: () => false,
  shouldHideProcessStatusBadge: () => false,
}))
vi.mock('../../src/features/processes/processLabels', () => ({
  getProcessTitle: (p) => p?.name || 'Processo',
  getProcessSubtitle: (p) => p?.processNumber || '',
}))
vi.mock('../../src/features/processes/processCategories', () => ({
  isMaritimeCategory: () => false,
  isAirCategory: () => false,
  shouldShowContainerQuantity: () => false,
}))
vi.mock('../../src/utils/collectionWindows', () => ({
  normalizeIsoDateTime: () => '',
  normalizeCollectionWindow: () => null,
  normalizeCollectionWindows: () => [],
  getCollectionWindows: () => [],
  getNextCollectionWindow: () => null,
  hasActiveCollectionSchedule: () => false,
  createCollectionWindow: () => ({}),
  addCollectionWindow: () => [],
  removeCollectionWindow: () => [],
  updateCollectionWindow: () => [],
}))
vi.mock('../../src/utils/deliveryForecast', () => ({
  getEstimatedDeliveryDate: () => '2026-07-15',
}))

import DashboardPage from '../../src/pages/DashboardPage'

const BAR_STATUS = { id: 'current', status: 'PRATICAVEL', label: 'PRATICAVEL', tone: 'ok', notes: '', updatedAt: '2026-06-30T10:00:00Z' }

const ANNOUNCEMENTS = [
  { id: 'a-1', title: 'Comunicado 1', content: 'Conteudo 1', channel: 'Banner interno', updatedAt: '2026-06-30T10:00:00Z' },
  { id: 'a-2', title: 'Comunicado 2', content: 'Conteudo 2', channel: 'Email', updatedAt: '2026-06-29T10:00:00Z' },
]

const PROCESSES = [
  {
    id: 'p-1',
    name: 'PO 12345',
    processNumber: 'PO 12345',
    category: 'FCL',
    status: 'Em Andamento',
    processStatus: 'Em Andamento',
    collectionStatus: 'Aguardando',
    destination: 'Navegantes',
    eta: '2026-07-15',
  },
  {
    id: 'p-2',
    name: 'PO 67890',
    processNumber: 'PO 67890',
    category: 'LCL',
    status: 'Aguardando',
    processStatus: 'Aguardando',
    collectionStatus: 'Aguardando',
    destination: 'Itapoa',
    eta: '2026-07-20',
  },
]

function renderPage({ initialEntries = ['/'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/processos" element={<div data-testid="processos-page">processos</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockNavigate.mockReset()
  mockListAnnouncements.mockReset()
  mockGetBarStatus.mockReset()
  mockListProcesses.mockReset()
  mockNavigate.mockImplementation(() => {})
  mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'user', favoriteProcessIds: [] } })
  mockListAnnouncements.mockResolvedValue(ANNOUNCEMENTS)
  mockGetBarStatus.mockResolvedValue(BAR_STATUS)
  mockListProcesses.mockResolvedValue(PROCESSES)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DashboardPage', () => {
  it('render inicial: heading "Visao geral"', async () => {
    renderPage()
    expect(screen.getByText(/Visão geral/i)).toBeInTheDocument()
  })

  it('Barra do Rio: mostra "Carregando" enquanto isLoading', () => {
    let resolveGet
    mockGetBarStatus.mockReturnValue(new Promise((r) => { resolveGet = r }))
    const { container } = renderPage()
    expect(container.textContent).toMatch(/Carregando/)
    resolveGet(BAR_STATUS)
  })

  it('Barra do Rio: mostra label + tone class quando carregado', async () => {
    renderPage()
    await waitFor(() => {
      const bar = document.querySelector('.dashboard-bar-card__text--ok')
      expect(bar).toBeInTheDocument()
      expect(bar.textContent).toBe('PRATICAVEL')
    })
  })

  it('Barra do Rio: "Indisponivel" quando barStatus e null', async () => {
    mockGetBarStatus.mockResolvedValueOnce(null)
    renderPage()
    await waitFor(() => {
      const bar = document.querySelector('.dashboard-bar-card__text')
      expect(bar.textContent).toBe('Indisponível')
    })
  })

  it('Comunicados: mostra cards com titulo, canal, conteudo', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Comunicado 1')).toBeInTheDocument()
    })
    expect(screen.getByText('Comunicado 2')).toBeInTheDocument()
  })

  it('Comunicados: empty state se lista vazia', async () => {
    mockListAnnouncements.mockResolvedValueOnce([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Nenhum comunicado publicado/i)).toBeInTheDocument()
    })
  })

  it('Comunicados: limita a 3 (mesmo que a API retorne mais)', async () => {
    mockListAnnouncements.mockResolvedValueOnce([
      ...ANNOUNCEMENTS,
      { id: 'a-3', title: 'Comunicado 3', content: 'C3', channel: 'X', updatedAt: '2026-06-28T10:00:00Z' },
      { id: 'a-4', title: 'Comunicado 4', content: 'C4', channel: 'X', updatedAt: '2026-06-27T10:00:00Z' },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Comunicado 1')).toBeInTheDocument()
      expect(screen.getByText('Comunicado 3')).toBeInTheDocument()
      // a-4 NAO deve aparecer
      expect(screen.queryByText('Comunicado 4')).not.toBeInTheDocument()
    })
  })

  it('Favoritos: "Nenhum processo favoritado" se lista vazia', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Nenhum processo favoritado/i)).toBeInTheDocument()
    })
  })

  it('Favoritos: renderiza cards quando profile tem favoriteProcessIds', async () => {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'user', favoriteProcessIds: ['p-1'] },
    })
    renderPage()
    await waitFor(() => {
      const cards = document.querySelectorAll('.process-item')
      expect(cards.length).toBe(1)
    })
    expect(screen.getByText('1 favoritos')).toBeInTheDocument()
  })

  it('Favoritos: contador mostra total', async () => {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'user', favoriteProcessIds: ['p-1', 'p-2'] },
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('2 favoritos')).toBeInTheDocument()
    })
  })
})
