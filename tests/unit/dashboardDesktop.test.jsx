// Refino F4a: arvore DESKTOP do Dashboard (Dashboard.dc.html). O desktop e
// escolhido por matchMedia('(min-width: 1041px)'); aqui o matchMedia diz "desktop"
// e os modulos de dominio sao os REAIS (so os repositorios e o router sao
// mocks). A arvore legada (tablet/mobile) continua coberta por
// tests/ui/DashboardPage.test.jsx (matchMedia falso = legado).
// (fica em tests/unit para nao entrar na contagem do audit-vault-counts.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockNavigate = vi.fn()
const mockListAnnouncements = vi.fn()
const mockGetBarStatus = vi.fn()
const mockListProcesses = vi.fn()
const mockToggleFavorite = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }))
vi.mock('../../src/services/announcementsRepository', () => ({
  listAnnouncements: (...args) => mockListAnnouncements(...args),
}))
vi.mock('../../src/services/barStatusRepository', () => ({
  getBarStatus: (...args) => mockGetBarStatus(...args),
}))
vi.mock('../../src/services/processesRepository', () => ({
  listProcesses: (...args) => mockListProcesses(...args),
}))

import DashboardPage from '../../src/pages/DashboardPage'

const BAR_WARN = {
  id: 'current',
  status: 'PRATICAVEL_RESTRICOES',
  label: 'PRATICAVEL C/ RESTRICOES',
  tone: 'warn',
  notes: 'Restrição de calado.',
  updatedAt: '2026-10-20T11:30:00',
}

const LONG_CONTENT = `${'Texto do comunicado '.repeat(10)}fim`

const ANNOUNCEMENTS = [
  { id: 'a-1', title: 'Janela de manutenção', content: LONG_CONTENT, channel: 'Banner interno', updatedAt: '2026-10-20T09:00:00' },
  { id: 'a-2', title: 'Novo prazo de free time', content: 'Sete dias.', channel: 'E-mail', updatedAt: '2026-10-19T10:00:00' },
  { id: 'a-3', title: 'Reunião mensal', content: 'Quinta, 10h.', channel: 'Banner interno', updatedAt: '2026-10-15T10:00:00' },
]

// Terça 2026-10-20: a semana vai ate domingo 25/10.
const PROCESS_A = {
  id: 'p-a',
  name: 'Pigmento orgânico — Hamburgo',
  processNumber: '4500128915',
  category: 'FCL',
  destination: 'ITAJAI',
  containerQuantity: 2,
  processStatus: 'Embarcou',
  shippedAt: '2026-10-01',
  etd: '2026-10-01',
  eta: '2026-10-23',
  etaOriginal: '2026-10-21',
  collectionStatus: 'Aguardando agendamento de coleta',
  collectionWindows: [],
  warehouseDeliveryDateOverride: '2026-10-23',
}

const PROCESS_B = {
  id: 'p-b',
  name: 'Emulsificante — Rotterdam',
  processNumber: '4500129355',
  category: 'FCL',
  destination: 'ITAJAI',
  containerQuantity: 1,
  processStatus: 'Coleta Agendada',
  etd: '2026-09-10',
  eta: '2026-10-12',
  berthed: true,
  berthedAt: '2026-10-15T08:00',
  duimpStatus: 'Parametrizada',
  parameterizationChannel: 'Verde',
  collectionStatus: 'Coleta Agendada',
  collectionWindows: [{ id: 'w1', containerNumber: 1, scheduledAt: '2026-10-22T09:00', notes: 'Doca 3' }],
  items: [{ id: 'i1', commercialName: 'X', dangerousGoods: true, imoClass: '3' }],
}

function setMatchMedia(isDesktop) {
  window.matchMedia = (query) => ({
    matches: isDesktop && query.includes('min-width: 1041px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

function renderPage() {
  return render(<DashboardPage />)
}

async function renderLoaded(options = {}) {
  const view = renderPage()
  await screen.findByText('Janela de manutenção', {}, { timeout: 3000 }).catch(() => {})
  await waitFor(() => expect(view.container.querySelector('.skeleton')).toBeNull())
  return { ...view, ...options }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
  window.sessionStorage.setItem('pc-kpi-countup', '1') // sem contador: valores finais direto
  setMatchMedia(true)
  mockUseAuth.mockReset()
  mockNavigate.mockReset()
  mockListAnnouncements.mockReset()
  mockGetBarStatus.mockReset()
  mockListProcesses.mockReset()
  mockToggleFavorite.mockReset()
  mockUseAuth.mockReturnValue({
    profile: { uid: 'u-1', role: 'admin', favoriteProcessIds: ['p-a', 'p-b'] },
    toggleFavoriteProcess: mockToggleFavorite,
  })
  mockListAnnouncements.mockResolvedValue(ANNOUNCEMENTS)
  mockGetBarStatus.mockResolvedValue(BAR_WARN)
  mockListProcesses.mockResolvedValue([PROCESS_A, PROCESS_B])
})

afterEach(() => {
  vi.useRealTimers()
  window.sessionStorage.clear()
  setMatchMedia(false)
})

describe('Dashboard desktop - estrutura e cabecalho', () => {
  it('renderiza a arvore dash-* sob .surface--dashboard e nao a legada', async () => {
    const { container } = await renderLoaded()
    expect(container.querySelector('section.surface.surface--dashboard')).toBeInTheDocument()
    expect(container.querySelector('.dash-head')).toBeInTheDocument()
    expect(container.querySelector('.dashboard-heading')).toBeNull()
    expect(container.querySelector('.dashboard-stat-row')).toBeNull()
    expect(container.querySelector('.stagger')).toBeNull()
  })

  it('"Visao geral" continua h2; eyebrow = dia da semana sem "-feira" + data', async () => {
    await renderLoaded()
    expect(screen.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByText('terça · 20 de outubro')).toHaveClass('dash-head__eyebrow')
  })

  it('pilula da barra: rotulo acentuado, tom e dica com a observacao', async () => {
    await renderLoaded()
    const pill = screen.getByText(/Barra do Rio · Praticável c\/ restrições/)
    expect(pill).toHaveClass('dash-bar', 'dash-bar--warn')
    expect(pill.getAttribute('title')).toContain('Restrição de calado.')
  })

  it('pilula da barra: carregando e indisponivel', async () => {
    mockGetBarStatus.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderPage()
    expect(screen.getByText(/Barra do Rio · Carregando/)).toHaveClass('dash-bar--neutral')
    unmount()
    mockGetBarStatus.mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText(/Barra do Rio · Indisponível/)).toBeInTheDocument()
  })

  it('tablet/mobile (matchMedia falso) seguem na arvore legada', async () => {
    setMatchMedia(false)
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.dashboard-heading')).toBeInTheDocument())
    expect(container.querySelector('.dash-head')).toBeNull()
  })
})

describe('Dashboard desktop - KPIs com nota (D12)', () => {
  it('4 cards sem icone, com valor e nota; canal vermelho so em alerta quando ha', async () => {
    mockListProcesses.mockResolvedValue([
      PROCESS_A,
      PROCESS_B,
      { ...PROCESS_A, id: 'p-red', processStatus: 'Aguardando parametrização da DUIMP', parameterizationChannel: 'Vermelho' },
    ])
    const { container } = await renderLoaded()
    const cards = container.querySelectorAll('.dash-kpis .stat-card')
    expect(cards).toHaveLength(4)
    expect(container.querySelector('.dash-kpis .stat-card__icon')).toBeNull()
    expect([...cards].map((card) => card.querySelector('.stat-card__label').textContent)).toEqual([
      'Chegadas na semana',
      'Em trânsito',
      'Aguardando atracação',
      'Canal vermelho',
    ])
    expect(cards[2].querySelector('.stat-card__note').textContent).toBe('barra com restrições')
    expect(cards[2].querySelector('.stat-card__note')).toHaveClass('stat-card__note--warning')
    expect(cards[3].querySelector('.stat-card__value').textContent).toBe('1')
    expect(cards[3]).toHaveClass('dash-kpi--alert')
    expect(cards[3].querySelector('.stat-card__note').textContent).toBe('exige ação')
  })

  it('"+N vs. semana passada" = chegadas desta semana menos as da anterior', async () => {
    // semana anterior (13..18/10): 1 previsao manual; semana atual: A + B.
    mockListProcesses.mockResolvedValue([
      PROCESS_A,
      PROCESS_B,
      { ...PROCESS_A, id: 'p-prev', warehouseDeliveryDateOverride: '2026-10-14' },
    ])
    const { container } = await renderLoaded()
    const first = container.querySelector('.dash-kpis .stat-card')
    expect(first.querySelector('.stat-card__value').textContent).toBe('2')
    expect(first.querySelector('.stat-card__note').textContent).toBe('+1 vs. semana passada')
    expect(first.querySelector('.stat-card__note')).toHaveClass('stat-card__note--success')
  })

  it('carregando: skeleton no valor e na nota; erro: "—" e nota vazia (mesma altura)', async () => {
    mockListProcesses.mockReturnValue(new Promise(() => {}))
    const loading = renderPage()
    expect(loading.container.querySelectorAll('.dash-kpis .stat-card__value .skeleton')).toHaveLength(4)
    expect(loading.container.querySelectorAll('.dash-kpis .stat-card__note .skeleton')).toHaveLength(4)
    loading.unmount()

    mockListProcesses.mockRejectedValue(new Error('x'))
    const { container } = renderPage()
    await waitFor(() =>
      container.querySelectorAll('.dash-kpis .stat-card__value').forEach((el) => expect(el.textContent).toBe('—'))
    )
    container.querySelectorAll('.dash-kpis .stat-card__note').forEach((el) => expect(el.textContent).toBe(''))
  })
})

describe('Dashboard desktop - ordem e Chegadas da semana', () => {
  it('ordem do mock: Chegadas da semana, Comunicados recentes, Processos favoritos', async () => {
    await renderLoaded()
    const chegadas = screen.getByRole('heading', { name: 'Chegadas da semana' })
    const comunicados = screen.getByRole('heading', { name: 'Comunicados recentes' })
    const favoritos = screen.getByRole('heading', { name: 'Processos favoritos' })
    expect(chegadas.compareDocumentPosition(comunicados) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(comunicados.compareDocumentPosition(favoritos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('linha: ladrilho de data, nome, "PO ... · categoria", previsao e tag de status derivado', async () => {
    const { container } = await renderLoaded()
    const rows = container.querySelectorAll('.dash-arrivals .dash-arrival')
    expect(rows).toHaveLength(2)
    const a = [...rows].find((row) => row.textContent.includes('Pigmento'))
    expect(a.querySelector('.dash-arrival__month').textContent).toBe('OUT')
    expect(a.querySelector('.dash-arrival__day').textContent).toBe('23')
    expect(a.querySelector('time').getAttribute('datetime')).toBe('2026-10-23')
    expect(a.querySelector('.dash-arrival__name').textContent).toBe('Pigmento orgânico — Hamburgo')
    expect(a.querySelector('.dash-arrival__meta').textContent).toBe('PO 4500128915 · FCL')
    expect(a.querySelector('.dash-arrival__delivery').textContent).toContain('Previsão de entrega no armazém: 23/10')
    expect(a.querySelector('.dash-arrival__delivery strong').textContent).toBe('23/10')
    expect(a.querySelector('.process-derived-status-badge')).toBeInTheDocument()
    expect(a.querySelector('.dash-arrival__note').textContent).toBe('Coleta ainda não agendada')
  })

  it('processo com coleta agendada: contêiner, janela da semana, observacao e selo de carga', async () => {
    const { container } = await renderLoaded()
    const b = [...container.querySelectorAll('.dash-arrival')].find((row) => row.textContent.includes('Emulsificante'))
    // atracacao real (15/10) no ladrilho, nao a ETA
    expect(b.querySelector('.dash-arrival__day').textContent).toBe('15')
    expect(b.querySelector('.dash-arrival__delivery').textContent).toContain('Contêiner 1 · Previsão de entrega no armazém:')
    expect(b.querySelector('.dash-arrival__delivery strong').textContent).toMatch(/^\d{2}\/\d{2}$/)
    expect(b.querySelector('.dash-arrival__note').textContent).toBe('Doca 3')
    expect(b.querySelector('.process-derived-status-badge').textContent).toBe('Coleta agendada')
    expect([...b.querySelectorAll('.inline-badge')].map((n) => n.textContent)).toEqual([
      'Carga inflamável',
      'Carga perigosa',
    ])
  })

  it('carga a caminho do CD: selo diz a fase e a nota "Carga em transito para o CD" nao se repete', async () => {
    mockListProcesses.mockResolvedValue([
      // Sem o override manual (ignorado de "coleta agendada" em diante) a
      // previsao automatica precisa cair na semana: ETA ja' passada.
      {
        ...PROCESS_A,
        id: 'p-rota',
        eta: '2026-10-14',
        etaOriginal: '2026-10-14',
        berthedAt: '2026-10-15T08:00',
        warehouseDeliveryDateOverride: '',
        collectionStatus: 'Carga a caminho do CD',
      },
    ])
    const { container } = await renderLoaded()
    const rows = container.querySelectorAll('.dash-arrivals .dash-arrival')
    expect(rows).toHaveLength(1)
    expect(rows[0].querySelector('.process-derived-status-badge').textContent).toBe('Carga a caminho do CD')
    expect(rows[0].querySelector('.dash-arrival__note')).toBeNull()
  })

  it('clique e Enter/espaco abrem o processo; "Ver todas" vai para /processos', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = await renderLoaded()
    const row = container.querySelector('.dash-arrival')
    await user.click(row)
    expect(mockNavigate).toHaveBeenCalledWith('/processos', { state: { selectedProcessId: expect.any(String), detailTab: 'general' } })
    mockNavigate.mockClear()
    row.focus()
    await user.keyboard('{Enter}')
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    await user.keyboard(' ')
    expect(mockNavigate).toHaveBeenCalledTimes(2)
    mockNavigate.mockClear()
    await user.click(screen.getByRole('link', { name: 'Ver todas' }))
    expect(mockNavigate).toHaveBeenCalledWith('/processos')
  })

  it('vazio, carregando e erro (com retry) dentro do cartao', async () => {
    mockListProcesses.mockResolvedValue([])
    const empty = await renderLoaded()
    expect(within(empty.container.querySelector('.dash-arrivals')).getByText('Nenhuma chegada prevista')).toBeInTheDocument()
    empty.unmount()

    mockListProcesses.mockReturnValue(new Promise(() => {}))
    const loading = renderPage()
    expect(loading.container.querySelectorAll('.dash-arrival--skeleton')).toHaveLength(3)
    loading.unmount()

    mockListProcesses.mockRejectedValueOnce(new Error('x'))
    const failed = renderPage()
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
    mockListProcesses.mockResolvedValue([PROCESS_A, PROCESS_B])
    const retry = within(failed.container.querySelector('.dash-arrivals')).getByRole('button', { name: /Tentar novamente/ })
    await act(async () => {
      retry.click()
    })
    await waitFor(() => expect(failed.container.querySelectorAll('.dash-arrival')).toHaveLength(2))
  })
})

describe('Dashboard desktop - Comunicados recentes (D10)', () => {
  it('o mais recente em destaque: "CANAL · HOJE", titulo e resumo de 140 caracteres', async () => {
    const { container } = await renderLoaded()
    const lead = container.querySelector('.dash-announce--lead')
    expect(lead.querySelector('.dash-announce__eyebrow').textContent).toBe('Banner interno · Hoje')
    expect(lead.querySelector('.dash-announce__title').textContent).toBe('Janela de manutenção')
    const summary = lead.querySelector('.dash-announce__summary').textContent
    expect(summary.length).toBeGreaterThanOrEqual(139)
    expect(summary.length).toBeLessThanOrEqual(141)
    expect(summary.endsWith('…')).toBe(true)
    expect(LONG_CONTENT.replace(/\s+/g, ' ').startsWith(summary.slice(0, -1))).toBe(true)
  })

  it('anteriores em linhas compactas "Ontem · Canal" / dd/mm e titulo', async () => {
    const { container } = await renderLoaded()
    const rows = container.querySelectorAll('.dash-announce--row')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('.dash-announce__when').textContent).toBe('Ontem · E-mail')
    expect(rows[0].querySelector('.dash-announce__title').textContent).toBe('Novo prazo de free time')
    expect(rows[1].querySelector('.dash-announce__when').textContent).toBe('15/10 · Banner interno')
  })

  it('vazio, carregando e erro', async () => {
    mockListAnnouncements.mockResolvedValue([])
    const empty = await renderLoaded()
    expect(within(empty.container.querySelector('.dash-announcements')).getByText('Nenhum comunicado publicado')).toBeInTheDocument()
    empty.unmount()

    mockListAnnouncements.mockRejectedValueOnce(new Error('x'))
    renderPage()
    expect(await screen.findByText(/Não foi possível carregar os comunicados/)).toBeInTheDocument()
  })
})

describe('Dashboard desktop - Processos favoritos', () => {
  it('cabecalho com contagem e um cartao por favorito', async () => {
    const { container } = await renderLoaded()
    expect(container.querySelector('.dash-favorites .dash-card__count').textContent).toBe('2 processos')
    expect(container.querySelectorAll('.dash-favorites .dash-fav')).toHaveLength(2)
  })

  it('cartao pre-chegada: eyebrow com status e ETA atualizada, PO, barra de 5 etapas e fatos', async () => {
    const { container } = await renderLoaded()
    const card = [...container.querySelectorAll('.dash-fav')].find((c) => c.textContent.includes('Pigmento'))
    const eyebrow = card.querySelector('.dash-fav__eyebrow')
    expect(eyebrow.textContent).toBe('Aguardando agendamento de coleta · ETA atualizada 23/10')
    expect(eyebrow.querySelector('.dash-fav__eta')).toHaveClass('dash-fav__eta--updated')
    expect(card.querySelector('.dash-fav__name').textContent).toBe('Pigmento orgânico — Hamburgo')
    expect(card.querySelector('.dash-fav__meta').textContent).toBe('PO 4500128915 · FCL · 2 contêineres')

    const stages = [...card.querySelectorAll('.dash-stages__item')]
    expect(stages.map((s) => s.querySelector('.dash-stages__label').textContent)).toEqual([
      'Embarque',
      'Trânsito',
      'Chegada',
      'Liberação',
      'Entrega',
    ])
    expect(stages.map((s) => s.className.match(/--(done|now|todo)/)[1])).toEqual(['done', 'now', 'todo', 'todo', 'todo'])
    expect(stages[1]).toHaveAttribute('aria-current', 'step')

    const facts = [...card.querySelectorAll('.dash-facts__item')].map((item) => [
      item.querySelector('dt').textContent,
      item.querySelector('dd').textContent,
    ])
    expect(facts).toEqual([
      ['Porto de atracação', 'ITAJAI'],
      ['Previsão de entrega', '23/10'],
      ['ETA original', '21/10'],
    ])
  })

  it('cartao pos-atracacao: fatos de presenca, DUIMP (tom do canal) e janela de coleta; data da coleta no eyebrow', async () => {
    const { container } = await renderLoaded()
    const card = [...container.querySelectorAll('.dash-fav')].find((c) => c.textContent.includes('Emulsificante'))
    expect(card.querySelector('.dash-fav__eyebrow').textContent).toBe('22/10')
    const byLabel = Object.fromEntries(
      [...card.querySelectorAll('.dash-facts__item')].map((item) => [
        item.querySelector('dt').textContent,
        item.querySelector('dd'),
      ])
    )
    expect(byLabel['Presença de carga'].textContent).toBe('Pendente')
    expect(byLabel.DUIMP.textContent).toBe('Parametrizada · Canal Verde')
    expect(byLabel.DUIMP).toHaveClass('dash-facts__value--success')
    expect(byLabel['Coleta · contêiner 1'].textContent).toBe('22/10 · 09:00')
    expect(card.querySelector('.dash-stages__item--now .dash-stages__label').textContent).toBe('Entrega')
    expect([...card.querySelectorAll('.dash-fav__tags .inline-badge')].map((n) => n.textContent)).toEqual([
      'Carga inflamável',
      'Carga perigosa',
    ])
  })

  it('estrela "Desfavoritar" chama toggleFavoriteProcess; o nome abre o processo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Desfavoritar Pigmento orgânico — Hamburgo' }))
    expect(mockToggleFavorite).toHaveBeenCalledWith('p-a')
    await user.click(screen.getByRole('button', { name: 'Emulsificante — Rotterdam' }))
    expect(mockNavigate).toHaveBeenCalledWith('/processos', { state: { selectedProcessId: 'p-b', detailTab: 'general' } })
  })

  it('carga recebida preenche as 5 etapas (nenhuma "atual")', async () => {
    mockListProcesses.mockResolvedValue([
      { ...PROCESS_B, id: 'p-b', processStatus: 'Carga recebida', collectionStatus: 'Carga disponível em estoque', items: [] },
    ])
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'admin', favoriteProcessIds: ['p-b'] },
      toggleFavoriteProcess: mockToggleFavorite,
    })
    const { container } = await renderLoaded()
    expect(container.querySelectorAll('.dash-stages__item--done')).toHaveLength(5)
    expect(container.querySelector('.dash-stages__item--now')).toBeNull()
  })

  it('nome mascarado para usuario comum (categoria restrita) e sem favoritos mostra o estado vazio', async () => {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-2', role: 'user', favoriteProcessIds: ['p-a'] },
      toggleFavoriteProcess: mockToggleFavorite,
    })
    const { container } = await renderLoaded()
    expect(container.querySelector('.dash-fav__name').textContent).toBe('PO: 4500128915')
    expect(container.textContent).not.toContain('Pigmento orgânico')
  })

  it('vazio, carregando e erro', async () => {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'admin', favoriteProcessIds: [] },
      toggleFavoriteProcess: mockToggleFavorite,
    })
    const empty = await renderLoaded()
    expect(within(empty.container.querySelector('.dash-favorites')).getByText('Nenhum processo favoritado')).toBeInTheDocument()
    expect(empty.container.querySelector('.dash-favorites .dash-card__count')).toBeNull()
    empty.unmount()

    mockListProcesses.mockReturnValue(new Promise(() => {}))
    const loading = renderPage()
    expect(loading.container.querySelectorAll('.dash-fav--skeleton')).toHaveLength(2)
  })
})

describe('Dashboard desktop - troca ao vivo da arvore (resize / rotacao)', () => {
  function controllableMatchMedia(initial) {
    const listeners = new Set()
    let current = initial
    window.matchMedia = (query) => ({
      get matches() {
        return current && query.includes('min-width: 1041px')
      },
      media: query,
      addEventListener: (type, fn) => type === 'change' && listeners.add(fn),
      removeEventListener: (type, fn) => type === 'change' && listeners.delete(fn),
    })
    return {
      listeners,
      fire(matches) {
        current = matches
        act(() => listeners.forEach((fn) => fn({ matches })))
      },
    }
  }

  const trees = (container) => ({
    desktop: container.querySelector('.dash-head') !== null || container.querySelector('.dash-kpis') !== null,
    legacy: container.querySelector('.dashboard-heading') !== null || container.querySelector('.dashboard-stat-row') !== null,
  })

  it('change true -> false -> true troca dash-* <-> dashboard-*, nunca as duas, sem recarregar dados e com listener limpo no unmount', async () => {
    const media = controllableMatchMedia(true)
    const { container, unmount } = await renderLoaded()
    expect(trees(container)).toEqual({ desktop: true, legacy: false })
    expect(media.listeners.size).toBe(1)

    media.fire(false)
    expect(trees(container)).toEqual({ desktop: false, legacy: true })
    // os dados ficam no pai: a troca nao dispara nova consulta
    expect(container.textContent).toContain('Janela de manutenção')

    media.fire(true)
    expect(trees(container)).toEqual({ desktop: true, legacy: false })
    expect(container.textContent).toContain('Pigmento orgânico')

    expect(mockListProcesses).toHaveBeenCalledTimes(1)
    expect(mockListAnnouncements).toHaveBeenCalledTimes(1)
    expect(mockGetBarStatus).toHaveBeenCalledTimes(1)

    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('comecando no tablet (false) tambem vai ao desktop quando a janela cresce', async () => {
    const media = controllableMatchMedia(false)
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.dashboard-heading')).toBeInTheDocument())
    expect(trees(container)).toEqual({ desktop: false, legacy: true })
    media.fire(true)
    expect(trees(container)).toEqual({ desktop: true, legacy: false })
  })
})

describe('Dashboard desktop - favoritos: status derivado visivel e fatos longos', () => {
  it('status derivado e uma tag visivel (nao so title), junto dos selos de carga, fora do eyebrow', async () => {
    const { container } = await renderLoaded()
    const card = [...container.querySelectorAll('.dash-fav')].find((c) => c.textContent.includes('Emulsificante'))
    const tags = card.querySelector('.dash-fav__tags')
    const derived = tags.querySelector('.process-derived-status-badge')
    expect(derived).toBeInTheDocument()
    expect(derived.textContent.length).toBeGreaterThan(0)
    expect(card.querySelector('.dash-fav__eyebrow').textContent).not.toContain(derived.textContent)
    expect(card.querySelector('.dash-fav__eyebrow').hasAttribute('title')).toBe(false)
    expect(tags.firstElementChild).toBe(derived)
  })

  it('fatos de valor longo (DUIMP, anuencias, coleta, janela) ocupam a linha inteira; os curtos nao', async () => {
    const { container } = await renderLoaded()
    const card = [...container.querySelectorAll('.dash-fav')].find((c) => c.textContent.includes('Emulsificante'))
    const wideOf = (label) =>
      [...card.querySelectorAll('.dash-facts__item')]
        .find((item) => item.querySelector('dt').textContent === label)
        ?.classList.contains('dash-facts__item--wide')
    expect(wideOf('DUIMP')).toBe(true)
    expect(wideOf('Coleta · contêiner 1')).toBe(true)
    expect(wideOf('Presença de carga')).toBe(false)
    expect(wideOf('Porto de atracação')).toBe(false)
    expect(wideOf('Previsão de entrega')).toBe(false)
  })
})
