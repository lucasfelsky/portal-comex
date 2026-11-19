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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { getProcessStage, PROCESS_STAGES } from '../../src/features/processes/processStage'

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

describe('DashboardPage - sem banner "Solicitar uma cotação"', () => {
  it.each([
    ['user + Comercial', { uid: 'u-1', role: 'user', area: 'Comercial', favoriteProcessIds: [] }],
    ['admin', { uid: 'u-1', role: 'admin', favoriteProcessIds: [] }],
  ])('%s: NAO ve link para /solicitacoes nem o texto "Solicitar uma cotação"', (_label, profile) => {
    mockUseAuth.mockReturnValue({ profile })
    const { container } = renderPage()
    expect(container.querySelector('a[href*="/solicitacoes"]')).toBeNull()
    expect(screen.queryByText(/Solicitar uma cotação/i)).toBeNull()
  })
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
      expect(item.getByText('Embarcado')).toBeInTheDocument()
      expect(item.queryByText('Embarcou')).not.toBeInTheDocument()
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
      expect(item.getByText(DUIMP_STATUS)).toHaveClass('inline-badge')
      // A tag crua sumiu; `tag-ok` e o retorno do mock de getStatusTagClass.
      expect(document.querySelector('.dashboard-favorites-card .tag-ok')).toBeNull()
    })
  })
})

// Selos de carga ("Carga inflamável" / "Carga perigosa") nos cards compactos do
// Dashboard: Favoritos e Chegadas da semana. Usa o operationalOptions real.
describe('DashboardPage - selos de carga (Favoritos e Chegadas)', () => {
  const hazardTexts = (root) =>
    Array.from(root.querySelectorAll('.process-item__chips .inline-badge--danger, .process-item__chips .inline-badge--warn'))
      .map((node) => node.textContent)
      .filter((text) => text.startsWith('Carga '))

  function cargoProcess(overrides) {
    return {
      category: 'LCL',
      processStatus: 'Embarcado',
      collectionStatus: 'Aguardando',
      destination: 'Itapoa',
      eta: '2026-07-15',
      ...overrides,
    }
  }

  const itemClass = (imoClass) => [
    { id: 'i1', commercialName: 'X', dangerousGoods: true, imoClass },
  ]

  function findItemByTitle(container, title) {
    const found = Array.from(container.querySelectorAll('.process-item')).find(
      (node) => node.querySelector('strong')?.textContent === title
    )
    expect(found).toBeTruthy()
    return found
  }

  it('Favoritos: classe 3 mostra inflamavel + perigosa; classe 8 so perigosa; sem carga perigosa nenhum', async () => {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'user', favoriteProcessIds: ['h-flam', 'h-dang', 'h-none'] },
    })
    mockListProcesses.mockResolvedValue([
      cargoProcess({ id: 'h-flam', name: 'PO FLAM', processNumber: 'PO FLAM', items: itemClass('3') }),
      cargoProcess({ id: 'h-dang', name: 'PO DANG', processNumber: 'PO DANG', items: itemClass('8') }),
      cargoProcess({
        id: 'h-none',
        name: 'PO NONE',
        processNumber: 'PO NONE',
        items: [{ id: 'i1', commercialName: 'X', dangerousGoods: false }],
      }),
    ])
    renderPage()
    await waitFor(() => {
      expect(document.querySelectorAll('.dashboard-favorites-card .process-item')).toHaveLength(3)
    })
    const card = document.querySelector('.dashboard-favorites-card')

    const flam = findItemByTitle(card, 'PO FLAM')
    expect(hazardTexts(flam)).toEqual(['Carga inflamável', 'Carga perigosa'])
    expect(flam.querySelector('.process-item__chips .inline-badge--danger').textContent).toBe('Carga inflamável')

    expect(hazardTexts(findItemByTitle(card, 'PO DANG'))).toEqual(['Carga perigosa'])
    expect(hazardTexts(findItemByTitle(card, 'PO NONE'))).toEqual([])
  })

  it('Chegadas: selos em Coleta agendada e em Previsao de entrega; item sem carga perigosa nao tem chips', async () => {
    mockListProcesses.mockResolvedValue([
      cargoProcess({
        id: 'p-with-window',
        name: 'PO SCHED',
        processNumber: 'PO SCHED',
        category: 'FCL',
        collectionStatus: 'Coleta Agendada',
        items: itemClass('3'),
      }),
      cargoProcess({
        id: 'p-unscheduled',
        name: 'PO UNSCH',
        processNumber: 'PO UNSCH',
        collectionStatus: 'Aguardando agendamento de coleta',
        items: itemClass('8'),
      }),
      cargoProcess({
        id: 'p-in-transit',
        name: 'PO TRANSIT',
        processNumber: 'PO TRANSIT',
        collectionStatus: 'Aguardando agendamento de coleta',
        items: [{ id: 'i1', commercialName: 'X', dangerousGoods: false }],
      }),
    ])
    renderPage()
    await waitFor(() => {
      expect(document.querySelectorAll('.weekly-arrivals-card .process-item')).toHaveLength(3)
    })
    const card = document.querySelector('.weekly-arrivals-card')
    const scheduled = card.querySelector('[aria-labelledby="weekly-arrivals-scheduled-heading"]')
    const unscheduled = card.querySelector('[aria-labelledby="weekly-arrivals-unscheduled-heading"]')

    expect(hazardTexts(findItemByTitle(scheduled, 'PO SCHED'))).toEqual(['Carga inflamável', 'Carga perigosa'])
    expect(hazardTexts(findItemByTitle(unscheduled, 'PO UNSCH'))).toEqual(['Carga perigosa'])

    const plain = findItemByTitle(unscheduled, 'PO TRANSIT')
    expect(hazardTexts(plain)).toEqual([])
    expect(plain.querySelector('.process-item__chips')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Remake mobile (F3): Inicio <= 720px. O chip da Barra do Rio vai para o hero
// (#mobile-hero-extra, via MobileHeroSlot); KPIs 2x2 com contagem e sparkline
// real so em "Chegadas na semana"; favorito com trajeto de 5 etapas. Acima de
// 720px nada de `m-*` renderiza.
// ---------------------------------------------------------------------------
describe('DashboardPage - Inicio mobile (remake F3)', () => {
  const originalMatchMedia = window.matchMedia
  const toggleFavoriteProcess = vi.fn()
  let heroSlot

  function mockViewport({ mobile = false, desktop = false, reduce = false } = {}) {
    window.matchMedia = (query) => ({
      matches:
        (mobile && query.includes('max-width: 720px')) ||
        (desktop && query.includes('min-width: 1041px')) ||
        (reduce && query.includes('prefers-reduced-motion')),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }

  // Tokens de classe `m-*` presentes na arvore.
  const mClasses = (root) => {
    const found = new Set()
    root.querySelectorAll('[class]').forEach((el) => {
      el.classList.forEach((token) => {
        if (/^m-/.test(token)) found.add(token)
      })
    })
    return [...found]
  }

  const FAV = {
    id: 'p-fav',
    name: 'PO FAV 1',
    processNumber: 'PO: 4500',
    category: 'FCL',
    processStatus: 'Atracação Confirmada',
    collectionStatus: 'Aguardando',
    destination: 'Itajaí',
    etd: '2026-06-20',
    eta: '2026-07-10',
    etaOriginal: '2026-07-08',
    palletQuantity: 3,
    items: [{ id: 'i1', commercialName: 'X', dangerousGoods: true, imoClass: '3' }],
  }
  const FAV2 = {
    id: 'p-fav2',
    name: 'PO FAV 2',
    processNumber: 'PO: 4600',
    category: 'LCL',
    processStatus: 'Embarcou',
    collectionStatus: 'Aguardando',
    destination: 'Navegantes',
    eta: '2026-07-20',
  }
  const RED = {
    id: 'p-red',
    name: 'PO RED',
    processNumber: 'PO: 1',
    category: 'FCL',
    processStatus: 'Embarcou',
    parameterizationChannel: 'Vermelho',
    destination: 'Itajaí',
    eta: '2026-07-09',
  }

  const kpiCards = (container) => [...container.querySelectorAll('.m-kpis .m-kpi')]
  const kpiByLabel = (container, label) =>
    kpiCards(container).find((card) => card.querySelector('.stat-card__label')?.textContent === label)

  async function renderMobile({ favorites = [], processes = PROCESSES, reduce = false } = {}) {
    mockViewport({ mobile: true, reduce })
    mockUseAuth.mockReturnValue({
      // admin = projecao identidade (DUIMP sob aguas): os status das fixtures valem como estao.
      profile: { uid: 'u-1', role: 'admin', favoriteProcessIds: favorites },
      toggleFavoriteProcess,
    })
    mockListProcesses.mockResolvedValue(processes)
    const view = renderPage()
    await waitFor(() => expect(view.container.querySelector('.m-kpis .stat-card__value .skeleton')).toBeNull())
    return view
  }

  beforeEach(() => {
    window.sessionStorage.clear()
    toggleFavoriteProcess.mockReset()
    heroSlot = document.createElement('div')
    heroSlot.id = 'mobile-hero-extra'
    document.body.appendChild(heroSlot)
    // rAF/performance falsos: a contagem e o trajeto andam so quando o teste manda.
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
    vi.setSystemTime(new Date('2026-07-08T12:00:00'))
  })

  afterEach(() => {
    heroSlot.remove()
    if (originalMatchMedia) window.matchMedia = originalMatchMedia
    else delete window.matchMedia
  })

  describe('Barra do Rio no hero', () => {
    it('mobile (matchMedia max-width:720px true): o chip entra em #mobile-hero-extra via MobileHeroSlot, nao na pagina', async () => {
      const { container } = await renderMobile()
      await waitFor(() => expect(within(heroSlot).getByText('Praticável')).toBeInTheDocument())

      const chip = heroSlot.querySelector('.m-barra')
      expect(chip).toHaveClass('m-barra--ok')
      expect(chip.textContent).toMatch(/Barra do Rio\s*Praticável/)
      expect(chip.title).toMatch(/Praticagem ZP-21 · atualizado/)
      // ponto decorativo, que pulsa so com a barra aberta (CSS m-ping)
      expect(chip.querySelector('.m-dot')).toHaveAttribute('aria-hidden', 'true')

      expect(container.querySelector('.m-barra')).toBeNull()
      expect(container.querySelector('.dashboard-bar-inline')).toBeNull()
    })

    it('tom danger para impraticavel, com o rotulo de formatBarStatusLabel', async () => {
      mockGetBarStatus.mockResolvedValue({ ...BAR_STATUS, status: 'IMPRATICAVEL', tone: 'danger' })
      await renderMobile()
      await waitFor(() => expect(within(heroSlot).getByText('Impraticável')).toBeInTheDocument())
      expect(heroSlot.querySelector('.m-barra')).toHaveClass('m-barra--danger')
    })

    it('estados Carregando e Indisponivel (neutros, sem pulso)', async () => {
      let resolveBar
      mockGetBarStatus.mockReturnValue(new Promise((resolve) => { resolveBar = resolve }))
      await renderMobile()
      await waitFor(() => expect(within(heroSlot).getByText('Carregando')).toBeInTheDocument())
      expect(heroSlot.querySelector('.m-barra')).toHaveClass('m-barra--neutral')

      await act(async () => {
        resolveBar(null)
      })
      await waitFor(() => expect(within(heroSlot).getByText('Indisponível')).toBeInTheDocument())
      expect(heroSlot.querySelector('.m-barra')).toHaveClass('m-barra--neutral')
    })

    it('tablet (max-width:720px false): nada entra no slot e a barra segue inline na pagina', async () => {
      mockViewport({})
      const { container } = renderPage()
      await waitFor(() => expect(document.querySelector('.dashboard-bar-card__text--ok')).toBeInTheDocument())
      expect(heroSlot.childElementCount).toBe(0)
      expect(heroSlot.textContent).toBe('')
      expect(container.querySelector('.dashboard-bar-inline')).toBeInTheDocument()
      expect(mClasses(container)).toEqual([])
    })

    it('desktop (min-width:1041px true): nada entra no slot e nenhuma classe m-* renderiza', async () => {
      mockViewport({ desktop: true })
      const { container } = renderPage()
      await waitFor(() => expect(container.querySelector('.dash-bar')).toBeInTheDocument())
      expect(heroSlot.childElementCount).toBe(0)
      expect(mClasses(container)).toEqual([])
    })
  })

  describe('KPIs 2x2', () => {
    it('4 cartoes; o heading legado fica vazio (so irmao dos seletores) e o canal vermelho > 0 vira alerta', async () => {
      const { container } = await renderMobile({ processes: [...PROCESSES, RED] })

      expect(container.querySelector('.surface > .dashboard-heading:empty')).toBeInTheDocument()
      expect(container.querySelector('section.m-kpis')).toHaveAttribute('aria-label', 'Indicadores')
      const cards = kpiCards(container)
      expect(cards.map((card) => card.querySelector('.stat-card__label').textContent)).toEqual([
        'Chegadas na semana',
        'Em trânsito',
        'Aguardando atracação',
        'Canal vermelho',
      ])
      expect(cards.map((card) => card.classList.contains('m-kpi--alert'))).toEqual([false, false, false, true])
      // os cartoes mobile nao levam icone (o mock so tem rotulo + valor)
      expect(container.querySelectorAll('.m-kpis .stat-card__icon')).toHaveLength(0)
    })

    it('sem canal vermelho nao ha alerta', async () => {
      const { container } = await renderMobile()
      expect(container.querySelector('.m-kpi--alert')).toBeNull()
    })

    it('sparkline so no KPI com serie real ("Chegadas na semana"), com a linha pronta para desenhar', async () => {
      const { container } = await renderMobile({ processes: [...PROCESSES, RED] })
      const sparks = container.querySelectorAll('.m-kpis .stat-card__sparkline')
      expect(sparks).toHaveLength(1)
      expect(kpiByLabel(container, 'Chegadas na semana')).toContainElement(sparks[0])
      expect(sparks[0]).toHaveAttribute('aria-hidden', 'true')
      const line = sparks[0].querySelector('.stat-card__sparkline-line')
      expect(line).toHaveAttribute('pathLength', '1')
      // 8 semanas de calendario, nada sintetico: a serie vem de buildWeeklyEtaSeries
      expect(line.getAttribute('d').match(/[ML]/g)).toHaveLength(8)
    })

    it('sem nenhuma chegada nas ultimas 8 semanas nao desenha sparkline (nem linha plana inventada)', async () => {
      const { container } = await renderMobile({ processes: [] })
      expect(container.querySelectorAll('.m-kpis .stat-card__sparkline')).toHaveLength(0)
    })

    it('contagem animada: valor final estavel para leitor de tela desde o inicio e termina no valor certo', async () => {
      const { container } = await renderMobile()
      const card = kpiByLabel(container, 'Em trânsito')
      await waitFor(() => expect(card.querySelector('.stat-card__value .m-sr')).not.toBeNull())

      // durante a contagem: numero parcial fora da arvore de acessibilidade, final em texto
      const during = card.querySelector('.stat-card__value')
      expect(during.querySelector('.m-sr').textContent).toBe('3')
      expect(during.querySelector('[aria-hidden="true"]').textContent).toBe('0')

      act(() => {
        vi.advanceTimersByTime(700)
      })
      const after = kpiByLabel(container, 'Em trânsito').querySelector('.stat-card__value')
      expect(after.textContent).toBe('3')
      expect(after.querySelector('.m-sr')).toBeNull()
      expect(after.querySelector('[aria-hidden="true"]')).toBeNull()
    })

    it('movimento reduzido: mostra o valor final direto, sem contar', async () => {
      const { container } = await renderMobile({ reduce: true })
      const value = kpiByLabel(container, 'Em trânsito').querySelector('.stat-card__value')
      expect(value.textContent).toBe('3')
      expect(value.querySelector('.m-sr')).toBeNull()
    })

    it('carregando ou com erro: sem sparkline, sem alerta e sem zero falso', async () => {
      mockViewport({ mobile: true })
      mockListProcesses.mockRejectedValue(new Error('x'))
      const { container } = renderPage()
      await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
      kpiCards(container).forEach((card) => expect(card.querySelector('.stat-card__value').textContent).toBe('—'))
      expect(container.querySelector('.m-kpi--alert')).toBeNull()
      expect(container.querySelector('.stat-card__sparkline')).toBeNull()
    })
  })

  describe('Favoritos com trajeto', () => {
    it('o primeiro favorito tem o trajeto de 5 etapas e a atual e getProcessStage(fav).currentStage', async () => {
      const { container } = await renderMobile({ favorites: ['p-fav', 'p-fav2'], processes: [FAV, FAV2] })
      await screen.findByRole('heading', { name: 'Favoritos' })

      // so o primeiro (destaque) tem trajeto; o segundo e o cartao compacto
      const routes = container.querySelectorAll('.m-route')
      expect(routes).toHaveLength(1)
      expect(container.querySelectorAll('.m-fav--compact')).toHaveLength(1)
      expect(container.querySelector('.m-fav--compact .m-route')).toBeNull()

      const route = routes[0]
      const list = within(route).getByRole('list', { name: 'Etapas do processo' })
      const steps = within(list).getAllByRole('listitem')
      expect(steps).toHaveLength(5)
      expect(steps.map((li) => li.textContent)).toEqual(PROCESS_STAGES)

      const { currentStage } = getProcessStage(FAV)
      expect(currentStage).toBe(2)
      expect(route.querySelectorAll('[aria-current]')).toHaveLength(1)
      expect(steps[currentStage]).toHaveAttribute('aria-current', 'step')
      steps.forEach((li, index) => {
        const state = index < currentStage ? 'done' : index === currentStage ? 'now' : 'todo'
        expect(li).toHaveClass(`m-route__step--${state}`)
      })
      // o navio vai ate a etapa atual: 2 de 4 intervalos
      expect(route.getAttribute('style')).toMatch(/--m-route-to:\s*0\.5/)
      // navio e trilho sao decorativos
      expect(route.querySelector('.m-route__ship')).toHaveAttribute('aria-hidden', 'true')
      expect(route.querySelector('.m-route__track')).toHaveAttribute('aria-hidden', 'true')
    })

    it('o navio so parte depois do mount (rAF duplo)', async () => {
      const { container } = await renderMobile({ favorites: ['p-fav'], processes: [FAV] })
      const route = container.querySelector('.m-route')
      expect(route).not.toHaveClass('m-route--go')
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(container.querySelector('.m-route')).toHaveClass('m-route--go')
    })

    it('movimento reduzido: o navio ja esta na etapa atual no primeiro frame', async () => {
      const { container } = await renderMobile({ favorites: ['p-fav'], processes: [FAV], reduce: true })
      expect(container.querySelector('.m-route')).toHaveClass('m-route--go')
    })

    it('fatos ETD / ETA / Porto em dl; ETA atualizada fica sinalizada tambem para leitor de tela', async () => {
      const { container } = await renderMobile({ favorites: ['p-fav'], processes: [FAV] })
      const facts = [...container.querySelectorAll('.m-fav__facts > div')].map((row) => [
        row.querySelector('dt').textContent,
        row.querySelector('dd'),
      ])
      expect(facts.map(([label]) => label)).toEqual(['ETD', 'ETA', 'Porto'])
      expect(facts[0][1].textContent).toMatch(/^20\/06/)
      expect(facts[1][1].textContent).toMatch(/^10\/07/)
      expect(facts[1][1]).toHaveClass('m-fav__fact--warn')
      expect(facts[1][1].querySelector('.m-sr').textContent).toMatch(/atualizada/)
      expect(facts[2][1].textContent).toBe('Itajaí')
    })

    it('marcas de carga no lugar dos selos de texto: inflamavel, perigosa e volume com nome acessivel', async () => {
      const { container } = await renderMobile({ favorites: ['p-fav'], processes: [FAV] })
      const marks = container.querySelector('.m-fav .m-marks')
      expect(within(marks).getByRole('img', { name: 'Carga inflamável' })).toBeInTheDocument()
      expect(within(marks).getByRole('img', { name: 'Carga perigosa' })).toBeInTheDocument()
      const volume = within(marks).getByRole('img', { name: '3 pallets' })
      expect(volume.querySelector('b').textContent).toBe('3')
      // as marcas sao irmas do heading: o nome acessivel do h4 e so o titulo
      const heading = screen.getByRole('heading', { name: 'PO FAV 1' })
      expect(heading).not.toContainElement(marks)
      expect(heading.parentElement).toContainElement(marks)
      // a pilula de texto saiu (continua so no tablet/desktop)
      expect(screen.queryByText('Carga inflamável')).toBeNull()
      expect(screen.queryByText('Carga perigosa')).toBeNull()
      // os icones sao decorativos; o nome vem do aria-label da marca
      marks.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'))
    })

    it('abrir pelo titulo navega ao processo e a estrela desfavorita (com nome acessivel)', async () => {
      await renderMobile({ favorites: ['p-fav'], processes: [FAV] })
      fireEvent.click(await screen.findByRole('button', { name: 'PO FAV 1' }))
      expect(mockNavigate).toHaveBeenCalledWith('/processos', expect.objectContaining({ state: expect.anything() }))

      fireEvent.click(screen.getByRole('button', { name: 'Desfavoritar PO FAV 1' }))
      expect(toggleFavoriteProcess).toHaveBeenCalledWith('p-fav')
    })

    it('contador mono no cabecalho e estado vazio sem favoritos', async () => {
      const full = await renderMobile({ favorites: ['p-fav', 'p-fav2'], processes: [FAV, FAV2] })
      await screen.findByRole('heading', { name: 'Favoritos' })
      expect(full.container.querySelector('.m-card__count').textContent).toMatch(/^2\s*processos$/)
      full.unmount()

      const empty = await renderMobile({ favorites: [] })
      expect(await screen.findByText('Nenhum processo favoritado')).toBeInTheDocument()
      expect(empty.container.querySelector('.m-card__count')).toBeNull()
      expect(empty.container.querySelector('.m-route')).toBeNull()
    })
  })

  describe('Comunicados e entrada escalonada', () => {
    it('comunicados: quando em mono (canal · dia) e titulo; cards com --d por bloco', async () => {
      const { container } = await renderMobile()
      await screen.findByText('Comunicado 1')
      const items = container.querySelectorAll('.m-ann')
      expect(items).toHaveLength(2)
      expect(items[0].querySelector('.m-ann__title').textContent).toBe('Comunicado 1')
      expect(items[0].querySelector('.m-ann__when').textContent).toMatch(/^Banner interno · /)

      const cards = container.querySelectorAll('section.m-card.m-rise')
      expect(cards).toHaveLength(2)
      expect([...cards].map((card) => card.style.getPropertyValue('--d'))).toEqual(['380ms', '460ms'])
      // o card de chegadas da semana continua no fim, com o mesmo componente
      expect(container.querySelector('.weekly-arrivals-card')).toBeInTheDocument()
    })
  })
})
