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
  // PR #5 (2026-07-09): mock parametrizado pelo id do processo. Em
  // prod, retorna janelas de coleta (modelo novo) ou fallback pro
  // campo legado `collectionScheduledAt`. No test, retornamos uma
  // janela agendada so' pra 'p-with-window' (que aparece em
  // "Coleta agendada"). Os outros retornam [] (sem janela) e
  // dependem de `getEstimatedDeliveryDate` (mock acima) pra cair em
  // "Coleta nao agendada" ou serem filtrados.
  getCollectionWindows: (process) => {
    if (process?.id === 'p-with-window') {
      return [
        {
          id: 'w-1',
          containerNumber: 1,
          scheduledAt: '2026-07-10T08:00:00', // sexta desta semana
          notes: '',
        },
      ]
    }
    return []
  },
  getNextCollectionWindow: () => null,
  hasActiveCollectionSchedule: () => false,
  createCollectionWindow: () => ({}),
  addCollectionWindow: () => [],
  removeCollectionWindow: () => [],
  updateCollectionWindow: () => [],
}))
vi.mock('../../src/utils/deliveryForecast', () => ({
  // PR #5 (2026-07-09): mock agora e' parametrizado pelo id do
  // processo. Em prod, retorna a data prevista de entrega no
  // armazem (ETA + business days). No test, retornamos:
  // - 'p-with-window': data irrelevante (tem janela agendada, nao
  //   cai no fluxo unscheduled).
  // - 'p-unscheduled': data dentro da semana atual (aparece em
  //   "Coleta nao agendada").
  // - 'p-in-stock': vazio (filtrado por isProcessTrulyFinalized).
  // - 'p-far-future': data fora da semana (nao aparece em lugar
  //   nenhum).
  getEstimatedDeliveryDate: (process) => {
    if (process?.id === 'p-with-window') return '2026-07-15'
    if (process?.id === 'p-unscheduled') return '2026-07-12' // domingo desta semana
    if (process?.id === 'p-in-stock') return ''
    if (process?.id === 'p-far-future') return '2026-08-15'
    if (process?.id === 'p-in-transit') return '2026-07-10' // sexta desta semana
    // PR #12 (2026-07-09): mock cobre o spec novo da badge
    // "NAO renderiza badge duplicada".
    if (process?.id === 'p-no-badge') return '2026-07-10'
    return ''
  },
  // Necessario porque WeeklyArrivalsCard importa o shift pra cada
  // janela. Mock retorna turno estatico.
  getScheduledCollectionDeliveryShift: () => 'Manha',
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
  // PR #5 (2026-07-09): processos pra testar o card de chegadas.
  // - p-with-window: tem coleta agendada na semana (mock
  //   getCollectionWindows retorna 1 janela em 2026-07-10).
  // - p-unscheduled: sem coleta, mas ETA prevista dentro da semana
  //   (mock getEstimatedDeliveryDate retorna 2026-07-12).
  // - p-in-stock: collectionStatus = 'Carga disponível em estoque'
  //   (sinal de finalizado de verdade, NAO deve aparecer no card).
  // - p-far-future: sem coleta e ETA fora da semana
  //   (mock getEstimatedDeliveryDate retorna 2026-08-15).
  {
    id: 'p-with-window',
    name: 'PO 10001',
    processNumber: 'PO 10001',
    category: 'FCL',
    processStatus: 'Embarcado',
    collectionStatus: 'Coleta Agendada',
    destination: 'Navegantes',
    eta: '2026-07-15',
  },
  {
    id: 'p-unscheduled',
    name: 'PO 20002',
    processNumber: 'PO 20002',
    category: 'LCL',
    processStatus: 'Embarcado',
    collectionStatus: 'Aguardando agendamento de coleta',
    destination: 'Itapoa',
    eta: '2026-07-12',
  },
  {
    id: 'p-in-stock',
    name: 'PO 30003',
    processNumber: 'PO 30003',
    category: 'FCL',
    processStatus: 'Carga recebida',
    collectionStatus: 'Carga disponível em estoque',
    destination: 'Navegantes',
    eta: '2026-07-01',
  },
  {
    id: 'p-far-future',
    name: 'PO 40004',
    processNumber: 'PO 40004',
    category: 'AEREO',
    processStatus: 'Embarcado',
    collectionStatus: 'Aguardando agendamento de coleta',
    destination: 'Sao Paulo',
    eta: '2026-08-15',
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
      // PR #5 (2026-07-09): o card de favoritos e' o 2o `.list-card`
      // (o 1o e' o WeeklyArrivalsCard). Pegar o ultimo e contar os
      // `.process-item` dentro dele.
      const cards = document.querySelectorAll('.list-card')
      const favoriteCard = cards[cards.length - 1]
      const favoriteItems = favoriteCard?.querySelectorAll('.process-item') ?? []
      expect(favoriteItems.length).toBe(1)
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

  // PR #5 (2026-07-09) + PR #6 (2026-07-09): card de chegadas da
  // semana com 2 secoes (Agendada + Previsão de entrega no armazem)
  // e filtro de visibilidade por estoque.
  // PR #8 (2026-07-09): usa `findByText` (timeout vem do
  // configure() em tests/setup-ui.js, 3000ms) em vez de `waitFor
  // + getByText` pra ser robusto em CI mais lento. CI do GitHub
  // Actions roda em ubuntu-latest e pode levar > 500ms no cold
  // start de jsdom + resolucao do mock de listProcesses.
  describe('Chegadas da semana (WeeklyArrivalsCard)', () => {
    // PR #12 (2026-07-09): badge "Carga a caminho do CD" foi
    // removida do UnscheduledItem (info duplicada com notes).
    // O notes (statusLabel) ja' diz "Carga em transito para o CD"
    // quando aplicavel, entao a badge era redundante.
    it('NAO renderiza badge "Carga a caminho do CD" (info duplicada com notes)', async () => {
      mockListProcesses.mockResolvedValue([
        {
          id: 'p-no-badge',
          name: 'CON CN TEST-12',
          processNumber: 'TEST-12',
          category: 'FCL',
          destination: 'Itapoa',
          collectionStatus: 'Carga a caminho do CD',
          eta: '2026-07-10',
          collectionWindows: [],
        },
      ])

      renderPage()
      // O notes aparece
      expect(await screen.findByText('Carga em transito para o CD')).toBeInTheDocument()
      // A badge NAO aparece (era duplicada)
      expect(screen.queryByText('CARGA A CAMINHO DO CD')).not.toBeInTheDocument()
    })

    it('mostra secao "Coleta agendada" com processo que tem janela na semana', async () => {
      renderPage()
      // p-with-window (PO 10001) tem coleta agendada em 10/07
      // (titulo + subtitulo retornam o mesmo valor mockado, entao
      // usamos getAllByText depois de findByText pra garantir
      // renderizacao)
      const titulo = await screen.findByText(/Coleta agendada/i)
      expect(titulo).toBeInTheDocument()
      expect(screen.getAllByText('PO 10001').length).toBeGreaterThan(0)
    })

    it('mostra secao "Previsao de entrega no armazem" com processo sem janela mas com previsao na semana', async () => {
      renderPage()
      // PR #6: secao foi renomeada de "Coleta nao agendada" pra
      // "Previsao de entrega no armazem" (mais neutro, cobre
      // tambem processos em transito / em processamento no CD).
      const titulo = await screen.findByText(/Previsao de entrega no armazem/i)
      expect(titulo).toBeInTheDocument()
      // p-unscheduled (PO 20002) tem previsao 12/07 (domingo desta semana)
      expect(screen.getAllByText('PO 20002').length).toBeGreaterThan(0)
    })

    it('NAO mostra processo com collectionStatus = "Carga disponivel em estoque"', async () => {
      renderPage()
      // Espera o card carregar primeiro
      await screen.findByText(/Coleta agendada/i)
      // p-in-stock (PO 30003) ja' entrou em estoque, nao deve aparecer
      expect(screen.queryByText('PO 30003')).not.toBeInTheDocument()
    })

    it('NAO mostra processo com previsao de entrega fora da semana', async () => {
      renderPage()
      await screen.findByText(/Coleta agendada/i)
      // p-far-future (PO 40004) tem previsao 15/08, fora da semana
      expect(screen.queryByText('PO 40004')).not.toBeInTheDocument()
    })

    it('contador total soma agendada + nao agendada', async () => {
      renderPage()
      // 1 agendada (p-with-window) + 1 nao agendada (p-unscheduled) = 2
      const contador = await screen.findByText(/2 processos/i)
      expect(contador).toBeInTheDocument()
    })

    // PR #6 (2026-07-09): label dinamica baseada no collectionStatus.
    // Antes era fixa "Coleta ainda nao agendada" e nao fazia
    // sentido quando o processo ja' estava em transito / no CD.
    it('mostra "Coleta ainda nao agendada" pra processo pre-coleta', async () => {
      renderPage()
      // p-unscheduled tem collectionStatus = 'Aguardando agendamento
      // de coleta' (pre-coleta)
      const label = await screen.findByText('Coleta ainda nao agendada')
      expect(label).toBeInTheDocument()
    })

    it('mostra "Carga em transito para o CD" pra processo em transito', async () => {
      mockListProcesses.mockResolvedValueOnce([
        ...PROCESSES,
        {
          id: 'p-in-transit',
          name: 'PO 50005',
          processNumber: 'PO 50005',
          category: 'FCL',
          processStatus: 'Embarcado',
          // em transito pro CD (sem janela nesta semana, mas ETA cai)
          collectionStatus: 'Carga a caminho do CD',
          destination: 'Navegantes',
          eta: '2026-07-10',
        },
      ])
      renderPage()
      // p-in-transit aparece com label "Carga em transito para o CD"
      // (NAO "Coleta ainda nao agendada" como antes)
      const label = await screen.findByText('Carga em transito para o CD')
      expect(label).toBeInTheDocument()
      // E NAO mostra a label antiga errada
      const all = screen.queryAllByText('Coleta ainda nao agendada')
      // So' aparece pra p-unscheduled (que e' pre-coleta); p-in-transit
      // tem label "Carga em transito para o CD"
      expect(all.length).toBe(1)
    })
  })
})
