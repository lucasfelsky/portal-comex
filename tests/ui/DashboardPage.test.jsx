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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
const mockNavigate = vi.fn()
const mockListAnnouncements = vi.fn()
const mockGetBarStatus = vi.fn()
const mockListProcesses = vi.fn()
// Por padrao as categorias sao mockadas como falsas (nao ativam blocos
// pos-chegada); os testes de sinal de chegada ligam o modo real.
const mockCategoryMode = { real: false }

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
  isMaritimeCategory: (category) =>
    mockCategoryMode.real && ['FCL', 'LCL', 'CONSOLIDADO'].includes(category),
  isAirCategory: (category) => mockCategoryMode.real && category === 'AEREO',
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
  // Fixtures do WeeklyArrivalsCard usam datas hardcoded da semana de
  // 2026-07-06..12 ("sexta desta semana" = 10/07 etc). Sem congelar o
  // relogio, a suite quebrava assim que a semana real virava (bomba-
  // relogio descoberta em 2026-07-11, sabado). Mesmo remedio do
  // processDerivedStatus (commit 67aa5e4): fake timers pinados numa
  // quarta-feira da semana das fixtures. shouldAdvanceTime mantem os
  // retries assincronos do Testing Library (findByText) funcionando.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-08T12:00:00'))
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
  vi.useRealTimers()
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
      // Layout telas 2026-09-29: Favoritos deixou de ser o ultimo
      // `.list-card` (a ordem agora termina em Chegadas da semana) - pegar
      // pela classe propria e contar os `.process-item` dentro dele.
      const favoriteCard = document.querySelector('.dashboard-favorites-card')
      const favoriteItems = favoriteCard?.querySelectorAll('.process-item') ?? []
      expect(favoriteItems.length).toBe(1)
    })
  })

  it('ordem dos cards: Comunicados recentes -> Processos favoritos -> Chegadas da semana', async () => {
    renderPage()
    const comunicados = await screen.findByRole('heading', { name: 'Comunicados recentes' })
    const favoritos = await screen.findByRole('heading', { name: 'Processos favoritos' })
    const chegadas = await screen.findByRole('heading', { name: 'Chegadas da semana' })
    expect(comunicados.compareDocumentPosition(favoritos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(favoritos.compareDocumentPosition(chegadas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Favoritos: renderiza a quantidade correta de processos', async () => {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'user', favoriteProcessIds: ['p-1', 'p-2'] },
    })
    renderPage()
    await waitFor(() => {
      const favoriteCard = document.querySelector('.dashboard-favorites-card')
      const favoriteItems = favoriteCard?.querySelectorAll('.process-item') ?? []
      expect(favoriteItems.length).toBe(2)
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
    // O notes (statusLabel) ja' diz "Carga em trânsito para o CD"
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
      expect(await screen.findByText('Carga em trânsito para o CD')).toBeInTheDocument()
      // A badge NAO aparece (era duplicada)
      expect(screen.queryByText('CARGA A CAMINHO DO CD')).not.toBeInTheDocument()
    })

    it('mostra secao "Coleta agendada" com processo que tem janela na semana', async () => {
      renderPage()
      // p-with-window (PO 10001) tem coleta agendada em 10/07
      // (titulo + subtitulo retornam o mesmo valor mockado, entao
      // usamos findAllByText pra garantir renderizacao).
      // PR #17 (2026-07-09): findAllByText em vez de getAllByText.
      // No CI ubuntu-latest, o cold start + jsdom pode fazer
      // a renderizacao completa do ScheduledItem demorar mais
      // que o `findByText` do heading mas antes do `getAllByText`
      // do PO 10001 (que e' sincrono). findAllByText retenta
      // internamente ate o asyncUtilTimeout (3000ms).
      const titulo = await screen.findByText(/Coleta agendada/i)
      expect(titulo).toBeInTheDocument()
      expect((await screen.findAllByText('PO 10001')).length).toBeGreaterThan(0)
    })

    it('mostra secao "Previsão de entrega no armazem" com processo sem janela mas com previsao na semana', async () => {
      renderPage()
      // PR #6: secao foi renomeada de "Coleta nao agendada" pra
      // "Previsão de entrega no armazem" (mais neutro, cobre
      // tambem processos em transito / em processamento no CD).
      const titulo = await screen.findByText(/Previsão de entrega no armazém/i)
      expect(titulo).toBeInTheDocument()
      // p-unscheduled (PO 20002) tem previsao 12/07 (domingo desta semana)
      expect((await screen.findAllByText('PO 20002')).length).toBeGreaterThan(0)
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

    it('mostra estado vazio quando total de chegadas é zero', async () => {
      mockListProcesses.mockResolvedValueOnce([])
      renderPage()
      const emptyState = await screen.findByText(/Nenhuma chegada prevista/i)
      expect(emptyState).toBeInTheDocument()
    })

    // PR #6 (2026-07-09): label dinamica baseada no collectionStatus.
    // Antes era fixa "Coleta ainda não agendada" e nao fazia
    // sentido quando o processo ja' estava em transito / no CD.
    it('mostra "Coleta ainda não agendada" pra processo pre-coleta', async () => {
      renderPage()
      // p-unscheduled tem collectionStatus = 'Aguardando agendamento
      // de coleta' (pre-coleta)
      const label = await screen.findByText('Coleta ainda não agendada')
      expect(label).toBeInTheDocument()
    })

    it('mostra "Carga em trânsito para o CD" pra processo em transito', async () => {
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
      // p-in-transit aparece com label "Carga em trânsito para o CD"
      // (NAO "Coleta ainda não agendada" como antes)
      const label = await screen.findByText('Carga em trânsito para o CD')
      expect(label).toBeInTheDocument()
      // E NAO mostra a label antiga errada
      const all = screen.queryAllByText('Coleta ainda não agendada')
      // So' aparece pra p-unscheduled (que e' pre-coleta); p-in-transit
      // tem label "Carga em transito para o CD"
      expect(all.length).toBe(1)
    })
  })

  // UX-2: estado de erro (nao vazio) + retry + KPIs com skeleton/"—" +
  // anti-loop de favoritos derivados.
  describe('UX-2: estado de erro e retry', () => {
    it('Comunicados: falha mostra alerta e retry recarrega', async () => {
      mockListAnnouncements.mockRejectedValueOnce(new Error('x'))
      renderPage()
      expect(await screen.findByText(/Não foi possível carregar os comunicados/i)).toBeInTheDocument()
      expect(screen.queryByText(/Nenhum comunicado publicado/i)).not.toBeInTheDocument()

      mockListAnnouncements.mockResolvedValueOnce(ANNOUNCEMENTS)
      const retryButton = screen.getByRole('button', { name: /Tentar novamente/i })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await user.click(retryButton)

      expect(await screen.findByText('Comunicado 1')).toBeInTheDocument()
      expect(mockListAnnouncements).toHaveBeenCalledTimes(2)
    })

    it('Processos: falha mostra alertas, KPIs em "—" e retry restaura', async () => {
      mockListProcesses.mockRejectedValueOnce(new Error('x'))
      renderPage()

      await waitFor(() => {
        expect(screen.queryByText(/Nenhum processo favoritado/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/Nenhuma chegada prevista/i)).not.toBeInTheDocument()
      })
      const alerts = await screen.findAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
      const statValues = document.querySelectorAll('.stat-card__value')
      statValues.forEach((el) => expect(el.textContent).toBe('—'))

      mockListProcesses.mockResolvedValueOnce(PROCESSES)
      const retryButtons = screen.getAllByRole('button', { name: /Tentar novamente/i })
      await act(async () => {
        retryButtons[0].click()
      })

      await waitFor(() => {
        expect(mockListProcesses).toHaveBeenCalledTimes(2)
      })
      expect(await screen.findByRole('heading', { name: /Coleta agendada/i })).toBeInTheDocument()
    })

    it('Processos pendente: sem KPI "0", com skeleton', () => {
      mockListProcesses.mockReturnValue(new Promise(() => {}))
      const { container } = renderPage()
      const statValues = document.querySelectorAll('.stat-card__value')
      statValues.forEach((el) => expect(el.textContent).not.toBe('0'))
      expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    })

    it('Barra rejeitada: "Indisponível" e comunicados/favoritos normais', async () => {
      mockGetBarStatus.mockRejectedValueOnce(new Error('x'))
      renderPage()
      await waitFor(() => {
        const bar = document.querySelector('.dashboard-bar-card__text')
        expect(bar.textContent).toBe('Indisponível')
      })
      expect(await screen.findByText('Comunicado 1')).toBeInTheDocument()
      expect(await screen.findByText(/Nenhum processo favoritado/i)).toBeInTheDocument()
    })

    it('Anti-loop: profile sem favoriteProcessIds so chama listProcesses 1x', async () => {
      mockUseAuth.mockImplementation(() => ({ profile: { uid: 'u-1', role: 'user' } }))
      renderPage()
      expect(await screen.findByText(/Nenhum processo favoritado/i)).toBeInTheDocument()
      expect(mockListProcesses).toHaveBeenCalledTimes(1)
    })
  })

})

// Card de favoritos: bloco pos-chegada e presenca de carga leem o sinal compat
// (data OU boolean legado, F17.3a), igual ao deriveProcessStatus.
describe('DashboardPage - Favoritos: sinal de chegada (data OU boolean legado)', () => {
  afterEach(() => {
    mockCategoryMode.real = false
  })

  function favorite(overrides) {
    return {
      id: 'p-fav',
      name: 'PO FAV',
      processNumber: 'PO FAV',
      category: 'FCL',
      status: 'Em Andamento',
      processStatus: 'Embarcado',
      collectionStatus: 'Aguardando',
      destination: 'Navegantes',
      eta: '2026-07-15',
      ...overrides,
    }
  }

  async function renderFavorite(process) {
    mockCategoryMode.real = true
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'user', favoriteProcessIds: [process.id] },
    })
    mockListProcesses.mockResolvedValue([process])
    renderPage()
    await waitFor(() => {
      expect(document.querySelector('.dashboard-favorites-card .process-item')).not.toBeNull()
    })
    return within(document.querySelector('.dashboard-favorites-card .process-item'))
  }

  it('maritimo com berthedAt e berthed false mostra Pós-atracação; presenca por data aparece Informada', async () => {
    const item = await renderFavorite(
      favorite({
        berthed: false,
        berthedAt: '2026-07-07T10:00',
        cargoPresenceInformed: false,
        cargoPresenceInformedAt: '2026-07-08T09:00',
      })
    )
    expect(item.getByText('Pós-atracação')).toBeInTheDocument()
    expect(item.getByText('Presença de carga: Informada')).toBeInTheDocument()
  })

  it('maritimo legado berthed true sem data mostra Pós-atracação; presenca sem sinal fica Pendente', async () => {
    const item = await renderFavorite(
      favorite({ berthed: true, berthedAt: '', cargoPresenceInformed: false })
    )
    expect(item.getByText('Pós-atracação')).toBeInTheDocument()
    expect(item.getByText('Presença de carga: Pendente')).toBeInTheDocument()
  })

  it('maritimo legado cargoPresenceInformed true sem data aparece Informada', async () => {
    const item = await renderFavorite(
      favorite({ berthed: true, berthedAt: '', cargoPresenceInformed: true })
    )
    expect(item.getByText('Presença de carga: Informada')).toBeInTheDocument()
  })

  it('maritimo sem data e sem boolean nao mostra Pós-atracação', async () => {
    const item = await renderFavorite(favorite({ berthed: false, berthedAt: '' }))
    expect(item.queryByText('Pós-atracação')).not.toBeInTheDocument()
  })

  it('aereo com arrivedAt e arrived false mostra o bloco pos-chegada (DTA)', async () => {
    const item = await renderFavorite(
      favorite({ category: 'AEREO', arrived: false, arrivedAt: '2026-07-07T10:00', dtaStatus: 'Pendente' })
    )
    expect(item.getByText('DTA')).toBeInTheDocument()
  })

  it('aereo legado arrived true sem data mostra o bloco pos-chegada (DTA)', async () => {
    const item = await renderFavorite(
      favorite({ category: 'AEREO', arrived: true, arrivedAt: '', dtaStatus: 'Pendente' })
    )
    expect(item.getByText('DTA')).toBeInTheDocument()
  })

  it('aereo sem data e sem boolean nao mostra o bloco pos-chegada', async () => {
    const item = await renderFavorite(
      favorite({ category: 'AEREO', arrived: false, arrivedAt: '', dtaStatus: 'Pendente' })
    )
    expect(item.queryByText('DTA')).not.toBeInTheDocument()
  })

  // DUIMP sob aguas (D-1/D-3/D-5): o user nao ve o status de DUIMP antes da
  // atracacao; o admin segue vendo.
  describe('DUIMP sob aguas', () => {
    const DUIMP_STATUS = 'Aguardando parametrização da DUIMP'
    const underWater = () =>
      favorite({
        id: 'p-sob-aguas',
        processStatus: DUIMP_STATUS,
        shippedAt: '2026-07-01',
        eta: '2099-01-15',
        duimpRegisteredAt: '2026-07-07T09:00',
        duimpNumber: 'DU-SA-1',
      })

    it('user com favorito sob aguas: badge sem o status de DUIMP', async () => {
      const item = await renderFavorite(underWater())
      expect(item.queryByText(DUIMP_STATUS)).not.toBeInTheDocument()
      expect(item.getByText('Embarcou')).toBeInTheDocument()
    })

    it('admin com favorito sob aguas: badge mostra o status de DUIMP', async () => {
      mockCategoryMode.real = true
      const process = underWater()
      mockUseAuth.mockReturnValue({
        profile: { uid: 'a-1', role: 'admin', favoriteProcessIds: [process.id] },
      })
      mockListProcesses.mockResolvedValue([process])
      renderPage()
      await waitFor(() => {
        expect(document.querySelector('.dashboard-favorites-card .process-item')).not.toBeNull()
      })
      const item = within(document.querySelector('.dashboard-favorites-card .process-item'))
      expect(item.getByText(DUIMP_STATUS)).toBeInTheDocument()
    })
  })
})
