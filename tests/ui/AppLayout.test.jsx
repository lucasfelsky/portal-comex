// Tests do AppLayout focados no IntelliQuote admin-only (Sprint 15.8).
// Cobre:
//   - Admin: renderiza link IntelliQuote na sidebar + item no command palette (sobe Ctrl+K)
//   - User: NAO renderiza link IntelliQuote na sidebar + NAO renderiza item no command palette
//   - Logistica: NAO renderiza link IntelliQuote na sidebar
//   - Link do sidebar aponta para INTELLIQUOTE_WEB_URL (default), target=_blank, rel=noopener noreferrer
//   - Link do sidebar tem aria-label
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

vi.mock('../../src/services/notificationsRepository', () => ({
  NOTIFICATIONS_CHANGED_EVENT: 'notifications:changed',
  listNotifications: vi.fn(async () => []),
  markAllNotificationsAsRead: vi.fn(async () => {}),
  markNotificationAsRead: vi.fn(async () => {}),
}))

vi.mock('../../src/services/exchangeRatesRepository', () => ({
  getDailyPtaxRates: vi.fn(async () => null),
}))

// O gatilho "Suporte" do rodape abre o modal, que lista os chamados do usuario;
// sem o mock a lista bateria no Firestore real.
vi.mock('../../src/services/supportTicketsRepository', async (importOriginal) => ({
  ...(await importOriginal()),
  listMySupportTickets: vi.fn(async () => []),
}))

import AppLayout from '../../src/components/AppLayout.jsx'
// SupportButton (aba de suporte) usa useToast; no app real o ToastProvider
// mora no main.jsx, entao o wrapper do teste precisa dele tambem.
import { ToastProvider } from '../../src/components/Toast.jsx'
import { NotificationsProvider } from '../../src/contexts/NotificationsContext.jsx'
import NotificationsPage from '../../src/pages/NotificationsPage.jsx'
import { NOTIFICATIONS_CHANGED_EVENT, listNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../../src/services/notificationsRepository.js'
import { getDailyPtaxRates } from '../../src/services/exchangeRatesRepository.js'
import { setActiveProcess } from '../../src/utils/activeProcessContext.js'

function renderWithRole(role, { area } = {}) {
  mockUseAuth.mockReturnValue({
    profile: role
      ? { uid: `${role}-1`, name: `${role} User`, email: `${role}@sq.com`, role, area }
      : null,
    logout: vi.fn(),
    isEmailVerified: true,
  })

  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/']}>
        <NotificationsProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div data-testid="home">Home</div>} />
            </Route>
          </Routes>
        </NotificationsProvider>
      </MemoryRouter>
    </ToastProvider>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  listNotifications.mockReset()
  listNotifications.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AppLayout (IntelliQuote admin-only)', () => {
  it('admin: renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('admin')
    const link = screen.getByLabelText(/Abrir IntelliQuote em nova aba/i)
    expect(link).toBeInTheDocument()
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('admin: link IntelliQuote usa o VITE_INTELLIQUOTE_WEB_URL padrao', () => {
    renderWithRole('admin')
    const link = screen.getByLabelText(/Abrir IntelliQuote em nova aba/i)
    expect(link.getAttribute('href')).toBe('https://intelliquote.portal-comex.com')
  })

  it('user: NAO renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('user')
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('logistica: NAO renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('logistica')
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('compras: NAO renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('compras')
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('unauthenticated: NAO renderiza link IntelliQuote', () => {
    renderWithRole(null)
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('admin: command palette inclui IntelliQuote', async () => {
    renderWithRole('admin')

    act(() => {
      fireKeyDown('k', { ctrlKey: true })
    })

    const items = await screen.findAllByText(/IntelliQuote/i)
    // Sidebar link (sempre visivel) + command palette item (sobe Ctrl+K) = 2
    expect(items.length).toBeGreaterThanOrEqual(2)
  })

  it('user: command palette NAO inclui IntelliQuote', async () => {
    renderWithRole('user')

    act(() => {
      fireKeyDown('k', { ctrlKey: true })
    })

    // Achar pelo menos um item "Dashboard" confirma que a palette abriu
    await screen.findAllByText(/Dashboard/i)
    // IntelliQuote nao deve aparecer (sidebar nem command palette)
    expect(screen.queryAllByText(/IntelliQuote/i)).toHaveLength(0)
  })

  describe('botao "Fazer uma cotacao" (so user da area Comercial)', () => {
    it('user + Comercial: ve o card com href de solicitacoes e nao ve o card admin', () => {
      renderWithRole('user', { area: 'Comercial' })
      const link = screen.getByLabelText(/Fazer uma cotação no IntelliQuote/i)
      expect(link.tagName).toBe('A')
      expect(link).toHaveAttribute('href', 'https://intelliquote.portal-comex.com/solicitacoes')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
    })

    it('card sem logo: nome IntelliQuote em cima + titulo, sem <img>', () => {
      renderWithRole('user', { area: 'Comercial' })
      const link = screen.getByLabelText(/Fazer uma cotação no IntelliQuote/i)
      expect(link.querySelector('img')).toBeNull()
      expect(within(link).getByText('IntelliQuote')).toBeInTheDocument()
      expect(within(link).getByText('Fazer uma cotação')).toBeInTheDocument()
    })

    it('user + Importacao: NAO ve o card', () => {
      renderWithRole('user', { area: 'Importação' })
      expect(screen.queryByLabelText(/Fazer uma cotação no IntelliQuote/i)).toBeNull()
    })

    it('logistica + Comercial: NAO ve o card', () => {
      renderWithRole('logistica', { area: 'Comercial' })
      expect(screen.queryByLabelText(/Fazer uma cotação no IntelliQuote/i)).toBeNull()
    })

    it('admin: vê só o card IntelliQuote, sem "Fazer uma cotação"', () => {
      renderWithRole('admin')
      expect(screen.getByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/Fazer uma cotação no IntelliQuote/i)).toBeNull()
    })

    it('admin + Comercial: continua só com o card IntelliQuote', () => {
      renderWithRole('admin', { area: 'Comercial' })
      expect(screen.getByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/Fazer uma cotação no IntelliQuote/i)).toBeNull()
    })

    it('paleta: admin tem "IntelliQuote" e não tem "Fazer uma cotação"', async () => {
      renderWithRole('admin')
      act(() => {
        fireKeyDown('k', { ctrlKey: true })
      })
      expect(await screen.findByRole('option', { name: /IntelliQuote/i })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Fazer uma cotação/i })).toBeNull()
    })

    it('paleta: user + Comercial tem "Fazer uma cotação" e não tem "IntelliQuote (suite SQ)"', async () => {
      renderWithRole('user', { area: 'Comercial' })
      act(() => {
        fireKeyDown('k', { ctrlKey: true })
      })
      expect(await screen.findByRole('option', { name: /Fazer uma cotação/i })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /IntelliQuote \(suite SQ\)/i })).toBeNull()
    })

    it('paleta: user + Comercial abre a URL de solicitacoes em nova aba', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
      try {
        renderWithRole('user', { area: 'Comercial' })
        act(() => {
          fireKeyDown('k', { ctrlKey: true })
        })
        const option = await screen.findByRole('option', { name: /Fazer uma cotação/i })
        const user = userEvent.setup()
        await user.click(option)
        expect(openSpy).toHaveBeenCalledWith('https://intelliquote.portal-comex.com/solicitacoes', '_blank', 'noopener,noreferrer')
      } finally {
        openSpy.mockRestore()
      }
    })
  })

  describe('tab bar do redesign iOS (F16.2)', () => {
    function bottomNav(container) {
      return within(container.querySelector('.mobile-bottom-nav'))
    }

    it('tem os 5 itens novos: Início, Chegadas, Notícias, Avisos e Menu', () => {
      const { container } = renderWithRole('user')
      const nav = bottomNav(container)

      expect(nav.getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/')
      expect(nav.getByRole('link', { name: 'Chegadas' })).toHaveAttribute('href', '/processos')
      expect(nav.getByRole('link', { name: 'Notícias' })).toHaveAttribute('href', '/news')
      expect(nav.getByRole('link', { name: 'Notificações' })).toHaveAttribute('href', '/notifications')
      expect(nav.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/menu')
    })

    it('não tem mais Suporte nem toggle de drawer (migraram pra tela Menu)', () => {
      const { container } = renderWithRole('user')
      const nav = bottomNav(container)

      expect(nav.queryByRole('button', { name: 'Abrir suporte' })).not.toBeInTheDocument()
      expect(nav.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument()
    })
  })

  // Regressao (auditoria F14, 2026-07-16): ao abrir as notificacoes, o painel
  // (e o backdrop) deve renderizar UMA unica vez. O C-series mobile passou a
  // renderizar um painel standalone (bottom-sheet) alem do painel ancorado no
  // topbar, duplicando painel + backdrop no desktop. Fix: gate por
  // isMobileLayout (<=720px) — topbar no desktop, standalone no mobile.
  describe('painel de notificacoes: renderiza uma vez por viewport', () => {
    it('desktop (>720px): 1 painel + 1 backdrop', () => {
      const { container } = renderWithRole('admin')
      act(() => {
        screen.getAllByLabelText('Notificações')[0].click()
      })
      expect(container.querySelectorAll('.notifications__panel')).toHaveLength(1)
      expect(container.querySelectorAll('.notifications-backdrop')).toHaveLength(1)
    })

    it('mobile (<=720px): 1 painel + 1 backdrop', () => {
      const originalMatchMedia = window.matchMedia
      window.matchMedia = (query) => ({
        matches: /max-width:\s*720px/.test(query),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })
      try {
        const { container } = renderWithRole('admin')
        act(() => {
          screen.getAllByLabelText('Notificações')[0].click()
        })
        expect(container.querySelectorAll('.notifications__panel')).toHaveLength(1)
        expect(container.querySelectorAll('.notifications-backdrop')).toHaveLength(1)
      } finally {
        window.matchMedia = originalMatchMedia
      }
    })
  })

  // UX-2: drawer acessivel (role=dialog, foco, Esc) + estado de erro +
  // regressao do polling que resetava o foco a cada 10s.
  describe('UX-2: drawer e NotificationsPage', () => {
    it('painel tem role="dialog" com nome "Central de notificações"', () => {
      renderWithRole('admin')
      act(() => {
        screen.getAllByLabelText('Notificações')[0].click()
      })
      const dialog = screen.getByRole('dialog', { name: 'Central de notificações' })
      expect(dialog).toBeInTheDocument()
    })

    it('foco entra no painel ao abrir e Esc devolve o foco ao sino', async () => {
      renderWithRole('admin')
      const bell = screen.getAllByLabelText('Notificações')[0]
      const user = userEvent.setup()
      await user.click(bell)

      await waitFor(() => {
        const dialog = screen.getByRole('dialog', { name: 'Central de notificações' })
        expect(dialog.contains(document.activeElement)).toBe(true)
      })

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(document.activeElement).toBe(bell)
      })
    })

    it('regressao do polling: evento de mudanca de notificacoes nao rouba o foco do filtro', async () => {
      renderWithRole('admin')
      const bell = screen.getAllByLabelText('Notificações')[0]
      const user = userEvent.setup()
      await user.click(bell)

      // Refino F2: o select virou a faixa de pilulas (role=tablist).
      const filterPill = await screen.findByRole('tab', { name: 'Coleta' })
      // Espera o auto-foco inicial do useFocusTrap (30ms) assentar antes de
      // mover o foco manualmente — senão o timeout pendente rouba o foco
      // de volta e o teste não isola a regressão do polling.
      await waitFor(() => {
        const dialog = screen.getByRole('dialog', { name: 'Central de notificações' })
        expect(dialog.contains(document.activeElement)).toBe(true)
      })
      filterPill.focus()
      expect(document.activeElement).toBe(filterPill)

      act(() => {
        window.dispatchEvent(
          new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { recipientUserIds: [] } })
        )
      })

      await new Promise((resolve) => setTimeout(resolve, 40))

      expect(document.activeElement).toBe(filterPill)
    })

    // F18b-1 (B4): filtro "Documentos" no drawer, depois de "Alertas". Refino
    // F2 (D18): pilulas em rolagem horizontal com as 10 categorias.
    it('drawer: pilulas de filtro com as 10 categorias, incluindo "Documentos" depois de "Alertas"', async () => {
      renderWithRole('admin')
      const bell = screen.getAllByLabelText('Notificações')[0]
      const user = userEvent.setup()
      await user.click(bell)

      const tablist = await screen.findByRole('tablist', { name: 'Filtrar notificações por categoria' })
      const labels = within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
      expect(labels).toHaveLength(10)
      expect(labels[0]).toBe('Todas')
      expect(labels.indexOf('Documentos')).toBe(labels.indexOf('Alertas') + 1)
      expect(within(tablist).getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true')
      expect(within(tablist).getByRole('tab', { name: 'Documentos' })).toHaveAttribute('aria-selected', 'false')
    })

    it('erro no drawer: alerta "Não foi possível carregar as notificações" e retry limpa', async () => {
      listNotifications.mockRejectedValueOnce(new Error('x'))
      renderWithRole('admin')
      const bell = screen.getAllByLabelText('Notificações')[0]
      const user = userEvent.setup()
      await user.click(bell)

      expect(await screen.findByText(/Não foi possível carregar as notificações/i)).toBeInTheDocument()
      expect(screen.queryByText(/Nenhuma notificação/i)).not.toBeInTheDocument()

      listNotifications.mockResolvedValueOnce([])
      const retryButton = screen.getByRole('button', { name: /Tentar novamente/i })
      await user.click(retryButton)

      expect(await screen.findByText(/Nenhuma notificação/i)).toBeInTheDocument()
    })

    it('NotificationsPage: erro mostra alerta + retry recupera', async () => {
      listNotifications.mockRejectedValueOnce(new Error('x'))
      mockUseAuth.mockReturnValue({
        profile: { uid: 'admin-1', name: 'admin User', email: 'admin@sq.com', role: 'admin' },
        logout: vi.fn(),
        isEmailVerified: true,
      })

      render(
        <MemoryRouter>
          <NotificationsProvider>
            <NotificationsPage />
          </NotificationsProvider>
        </MemoryRouter>
      )

      expect(await screen.findByText(/Não foi possível carregar as notificações/i)).toBeInTheDocument()

      listNotifications.mockResolvedValueOnce([])
      const retryButton = screen.getByRole('button', { name: /Tentar novamente/i })
      const user = userEvent.setup()
      await user.click(retryButton)

      expect(await screen.findByText(/Nenhuma notificação/i)).toBeInTheDocument()
    })
  })
})

// Mobile: o large title das sub-abas do Admin e' o nome da secao e o eyebrow
// vira "Admin" (elementos mobile-only, escondidos no desktop via CSS).
describe('AppLayout (large title mobile no Admin)', () => {
  function renderAt(path) {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'admin-1', name: 'admin User', email: 'admin@sq.com', role: 'admin' },
      logout: vi.fn(),
      isEmailVerified: true,
    })
    return render(
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <NotificationsProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="*" element={<div data-testid="page">Pagina</div>} />
              </Route>
            </Routes>
          </NotificationsProvider>
        </MemoryRouter>
      </ToastProvider>
    )
  }

  it('/admin/previsoes: h1 "Previsões" com eyebrow "Admin"', () => {
    const { container } = renderAt('/admin/previsoes')
    expect(container.querySelector('.mobile-page-header__title').textContent).toBe('Previsões')
    expect(container.querySelector('.mobile-page-header__eyebrow').textContent).toBe('Admin')
  })

  it('/admin (raiz): continua "Admin" no large title', () => {
    const { container } = renderAt('/admin')
    expect(container.querySelector('.mobile-page-header__title').textContent).toBe('Admin')
  })

  it('/notifications: large title "Notificações"', () => {
    const { container } = renderAt('/notifications')
    expect(container.querySelector('.mobile-page-header__title').textContent).toBe('Notificações')
  })
})

// Tablet (721-1040px): a sidebar e' um drawer (off-canvas via CSS em
// mobile-redesign.css). O JS do AppLayout ja' serve toda a faixa: botao do
// topbar, backdrop, Esc (focus trap) e fechar ao crescer acima de 1040px.
describe('AppLayout (drawer da sidebar no tablet)', () => {
  const originalMatchMedia = window.matchMedia
  let listeners

  // `reducedMotion` liga so' a media `prefers-reduced-motion: reduce`.
  function stubTablet({ reducedMotion = false } = {}) {
    listeners = []
    window.matchMedia = (query) => ({
      matches:
        /max-width:\s*1040px/.test(query) ||
        (reducedMotion && /prefers-reduced-motion:\s*reduce/.test(query)),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (type, handler) => {
        if (type === 'change') listeners.push({ query, handler })
      },
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  function openMenu(container) {
    act(() => {
      container.querySelector('.topbar__menu-button').click()
    })
  }

  it('fechado: sem backdrop, sidebar sem a classe aberta e botao "Abrir menu" no topbar', () => {
    stubTablet()
    const { container } = renderWithRole('admin')
    const button = container.querySelector('.topbar__menu-button')
    expect(button).toHaveAttribute('aria-label', 'Abrir menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open')
    expect(container.querySelector('.sidebar-backdrop')).toBeNull()
    expect(container.querySelector('.main-content')).not.toHaveAttribute('inert')
  })

  it('botao abre (sidebar aberta + backdrop + conteudo inert) e fecha de novo', () => {
    stubTablet()
    const { container } = renderWithRole('admin')
    openMenu(container)
    expect(container.querySelector('.sidebar')).toHaveClass('sidebar--mobile-open')
    expect(container.querySelector('.sidebar-backdrop')).not.toBeNull()
    expect(container.querySelector('.main-content')).toHaveAttribute('inert')
    expect(container.querySelector('.topbar__menu-button')).toHaveAttribute('aria-label', 'Fechar menu')

    openMenu(container)
    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open')
  })

  it('toque no backdrop fecha o menu', () => {
    stubTablet()
    const { container } = renderWithRole('admin')
    openMenu(container)
    act(() => {
      container.querySelector('.sidebar-backdrop').click()
    })
    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open')
    expect(container.querySelector('.sidebar-backdrop')).toHaveClass('sidebar-backdrop--closing')
  })

  it('Esc fecha o menu', () => {
    stubTablet()
    const { container } = renderWithRole('admin')
    openMenu(container)
    expect(container.querySelector('.sidebar')).toHaveClass('sidebar--mobile-open')
    act(() => {
      fireKeyDown('Escape')
    })
    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open')
  })

  it('crescer acima de 1040px com o menu aberto fecha o menu (nada fica inert)', () => {
    stubTablet()
    const { container } = renderWithRole('admin')
    openMenu(container)
    expect(container.querySelector('.main-content')).toHaveAttribute('inert')
    act(() => {
      listeners
        .filter((entry) => /max-width:\s*1040px/.test(entry.query))
        .forEach((entry) => entry.handler({ matches: false }))
    })
    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open')
    expect(container.querySelector('.main-content')).not.toHaveAttribute('inert')
  })

  // Movimento reduzido: o CSS tira as animacoes, mas o fechamento sempre foi
  // por TIMER no JS (nada escuta animationend/transitionend). O jsdom nunca
  // dispara esses eventos, entao estes testes quebram se alguem amarrar o
  // fechamento a eles (backdrop preso / conteudo inert para sempre).
  it('reduced motion: fechar pelo backdrop conclui por timer, sem animationend (backdrop desmonta e nada fica inert)', async () => {
    stubTablet({ reducedMotion: true })
    const { container } = renderWithRole('admin')
    openMenu(container)
    expect(container.querySelector('.main-content')).toHaveAttribute('inert')

    act(() => {
      container.querySelector('.sidebar-backdrop').click()
    })
    expect(container.querySelector('.sidebar')).not.toHaveClass('sidebar--mobile-open')
    expect(container.querySelector('.main-content')).not.toHaveAttribute('inert')
    expect(container.querySelector('.sidebar-backdrop')).toHaveClass('sidebar-backdrop--closing')

    await waitFor(() => {
      expect(container.querySelector('.sidebar-backdrop')).toBeNull()
    })
    expect(container.querySelector('.main-content')).not.toHaveAttribute('inert')
  })

  it('reduced motion: central de notificacoes fecha por timer (painel e backdrop desmontam, nada fica inert)', async () => {
    stubTablet({ reducedMotion: true })
    const { container } = renderWithRole('admin')
    act(() => {
      screen.getAllByLabelText('Notificações')[0].click()
    })
    // O painel abre no requestAnimationFrame: so' entao o conteudo fica inert.
    await waitFor(() => {
      expect(container.querySelector('.main-content')).toHaveAttribute('inert')
    })
    expect(container.querySelector('.notifications__panel')).not.toBeNull()

    act(() => {
      fireKeyDown('Escape')
    })
    await waitFor(() => {
      expect(container.querySelector('.main-content')).not.toHaveAttribute('inert')
    })
    await waitFor(() => {
      expect(container.querySelector('.notifications__panel')).toBeNull()
      expect(container.querySelector('.notifications-backdrop')).toBeNull()
    })
  })
})

function fireKeyDown(key, init = {}) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, ...init, bubbles: true, cancelable: true })
  )
}

// ---------------------------------------------------------------------------
// Refino visual F2 (shell): sidebar, topbar, gaveta, paleta. Valores de CSS
// ficam em tests/unit/refinoVisual.test.js; aqui o markup e o comportamento.
// ---------------------------------------------------------------------------
describe('AppLayout shell F2 (refino visual)', () => {
  const originalMatchMedia = window.matchMedia

  // Estado limpo por teste: mocks do repositorio e localStorage (DND, PTAX, tema).
  beforeEach(() => {
    window.localStorage.clear()
    markAllNotificationsAsRead.mockClear()
    markNotificationAsRead.mockReset()
    markNotificationAsRead.mockResolvedValue(undefined)
    getDailyPtaxRates.mockReset()
    getDailyPtaxRates.mockResolvedValue(null)
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    setActiveProcess(null)
  })

  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="probe">{`${location.pathname}|${JSON.stringify(location.state)}`}</div>
  }

  function renderAt(path, { role = 'admin', name = `${role} User`, area } = {}) {
    const logout = vi.fn()
    mockUseAuth.mockReturnValue({
      profile: { uid: `${role}-1`, name, email: `${role}@sq.com`, role, area },
      logout,
      isEmailVerified: true,
    })
    const utils = render(
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <NotificationsProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="*" element={<LocationProbe />} />
              </Route>
            </Routes>
          </NotificationsProvider>
        </MemoryRouter>
      </ToastProvider>
    )
    return { ...utils, logout }
  }

  function stubTablet() {
    window.matchMedia = (query) => ({
      matches: /max-width:\s*1040px/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }

  const notification = (overrides) => ({
    id: 'n-1',
    type: 'process_question_created',
    title: 'Nova dúvida',
    body: 'Alguém perguntou sobre o ETA.',
    processId: 'p-1',
    isRead: false,
    createdAt: new Date(Date.now() - 8 * 60000).toISOString(),
    ...overrides,
  })

  describe('sidebar', () => {
    it('ordem Dashboard, Chegadas, Notícias, Admin (admin) e sem item de Notificações', () => {
      const { container } = renderAt('/')
      const links = within(container.querySelector('#primary-navigation')).getAllByRole('link')
      expect(links.map((link) => link.querySelector('strong').textContent)).toEqual([
        'Dashboard',
        'Chegadas',
        'Notícias',
        'Admin',
      ])
      expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/processos', '/news', '/admin'])
      expect(within(container.querySelector('#primary-navigation')).queryByText(/Notificações/)).toBeNull()
    })

    it('user: sem o item Admin', () => {
      const { container } = renderAt('/', { role: 'user' })
      const labels = within(container.querySelector('#primary-navigation'))
        .getAllByRole('link')
        .map((link) => link.querySelector('strong').textContent)
      expect(labels).toEqual(['Dashboard', 'Chegadas', 'Notícias'])
    })

    it('cabeçalho: marca de produto COMEX (tom dark, 40px) + h1 "Portal COMEX"', () => {
      const { container } = renderAt('/')
      const mark = container.querySelector('.sidebar .brand .brand-mark')
      expect(mark).toHaveClass('brand-mark--comex', 'brand-mark--dark')
      expect(mark).toHaveAttribute('width', '40')
      expect(mark).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByRole('heading', { level: 1, name: 'Portal COMEX' })).toBeInTheDocument()
    })

    it('nav ativa: dois glifos por item (tablet + mock) e descrição no DOM', () => {
      const { container } = renderAt('/processos')
      const active = container.querySelector('.nav__link--active')
      expect(active).toHaveAttribute('href', '/processos')
      expect(active.querySelector('.icon--tablet')).not.toBeNull()
      expect(active.querySelector('.icon--desk')).not.toBeNull()
      expect(active.querySelector('p')).toHaveTextContent('Fila de chegadas')
    })

    it('admin: card IntelliQuote com marca IQ (dark, 36px), "Abrir cotações" e aria-label preservado', () => {
      renderAt('/')
      const link = screen.getByLabelText(/Abrir IntelliQuote em nova aba/i)
      const mark = link.querySelector('.brand-mark')
      expect(mark).toHaveClass('brand-mark--iq', 'brand-mark--dark')
      expect(mark).toHaveAttribute('width', '36')
      expect(within(link).getByText('IntelliQuote')).toBeInTheDocument()
      expect(within(link).getByText('Abrir cotações')).toBeInTheDocument()
    })

    it('user Comercial: card "Fazer uma cotação" continua sem marca (D4)', () => {
      renderAt('/', { role: 'user', area: 'Comercial' })
      const link = screen.getByLabelText(/Fazer uma cotação no IntelliQuote/i)
      expect(link.querySelector('.brand-mark')).toBeNull()
      expect(link.querySelector('img')).toBeNull()
    })

    it('rodapé desktop: Tema + Suporte, SEM Sair (Sair fica no menu do usuário e no Ctrl K)', () => {
      const { container } = renderAt('/')
      const foot = within(container.querySelector('.sidebar__foot'))
      expect(foot.getByRole('button', { name: /Tema: automático/ })).toBeInTheDocument()
      expect(foot.getByRole('button', { name: 'Abrir suporte' })).toHaveClass('sidebar-support-button')
      expect(foot.getByRole('button', { name: 'Abrir suporte' })).toHaveTextContent('Suporte')
      expect(foot.queryByRole('button', { name: 'Sair' })).toBeNull()
      expect(container.querySelector('.sidebar-logout-button')).toBeNull()
    })

    it('rodapé desktop: "Abrir suporte" abre o formulário e o FAB flutuante não existe', async () => {
      const { container } = renderAt('/')
      const user = userEvent.setup()
      expect(container.querySelector('.support-fab')).toBeNull()
      await user.click(within(container.querySelector('.sidebar__foot')).getByRole('button', { name: 'Abrir suporte' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText('O que aconteceu?')).toBeInTheDocument()
    })

    it('tablet: o rodapé mantém "Sair" (encerra a sessão) e não tem "Abrir suporte"', async () => {
      stubTablet()
      const { container, logout } = renderAt('/')
      const user = userEvent.setup()
      const foot = within(container.querySelector('.sidebar__foot'))
      expect(foot.queryByRole('button', { name: 'Abrir suporte' })).toBeNull()
      await user.click(foot.getByRole('button', { name: 'Sair' }))
      expect(logout).toHaveBeenCalledTimes(1)
    })
  })

  describe('topbar', () => {
    it('título + breadcrumb ACIMA do título no Admin (os dois visíveis)', () => {
      const { container } = renderAt('/admin/usuarios')
      const wrap = container.querySelector('.topbar__title-wrap')
      expect(wrap).toHaveClass('topbar__title-wrap--crumb')
      const crumb = within(wrap).getByRole('navigation', { name: 'Breadcrumb' })
      expect(crumb).toHaveTextContent('Admin')
      expect(crumb).toHaveTextContent('Usuários')
      expect(within(wrap).getByRole('heading', { level: 2, name: 'Centro Administrativo' })).toBeInTheDocument()
      // crumb vem antes do titulo no DOM
      expect(crumb.compareDocumentPosition(wrap.querySelector('.topbar__title'))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    })

    it('breadcrumb de Previsões usa o rótulo do mock ("Previsões")', () => {
      const { container } = renderAt('/admin/previsoes')
      expect(container.querySelector('.topbar .breadcrumb__current')).toHaveTextContent('Previsões')
    })

    it('A2: /news e /notifications não repetem o título na topbar do desktop', () => {
      for (const path of ['/news', '/notifications']) {
        const { container, unmount } = renderAt(path)
        expect(container.querySelector('.topbar__title')).toBeNull()
        expect(container.querySelector('.topbar__title-wrap')).toBeNull()
        unmount()
      }
    })

    it('A2: no tablet /news e /notifications mantêm o título; "/" e Admin seguem com título no desktop', () => {
      stubTablet()
      const tablet = renderAt('/news')
      expect(tablet.container.querySelector('.topbar__title')).toHaveTextContent('Notícias')
      tablet.unmount()
      const tabletNotif = renderAt('/notifications')
      expect(tabletNotif.container.querySelector('.topbar__title')).toHaveTextContent('Central de Notificações')
      tabletNotif.unmount()
      window.matchMedia = originalMatchMedia
      const home = renderAt('/')
      expect(home.container.querySelector('.topbar__title')).toHaveTextContent('Dashboard operacional')
      home.unmount()
      const admin = renderAt('/admin/usuarios')
      expect(admin.container.querySelector('.topbar__title')).toHaveTextContent('Centro Administrativo')
      expect(admin.container.querySelector('.topbar .breadcrumb')).not.toBeNull()
    })

    it('sem crumb nas páginas simples (só o título)', () => {
      const { container } = renderAt('/')
      expect(container.querySelector('.topbar .breadcrumb')).toBeNull()
      expect(container.querySelector('.topbar__title')).toHaveTextContent('Dashboard operacional')
    })

    it('detalhe do processo: crumb "Chegadas › <nome>" (admin vê o nome)', () => {
      const { container } = renderAt('/processos')
      expect(container.querySelector('.topbar .breadcrumb')).toBeNull()
      act(() => {
        setActiveProcess({
          id: 'p-1',
          name: 'Resina epóxi líquida',
          processNumber: '4500127710',
          category: 'FCL',
          viewMode: 'detail',
        })
      })
      const crumb = container.querySelector('.topbar .breadcrumb')
      expect(crumb).toHaveTextContent('Chegadas')
      expect(crumb).toHaveTextContent('Resina epóxi líquida')
      expect(container.querySelector('.topbar__title-wrap')).toHaveClass('topbar__title-wrap--process-crumb')
      // volta para a lista: o crumb some
      act(() => {
        setActiveProcess({ id: 'p-1', name: 'Resina epóxi líquida', category: 'FCL', viewMode: 'list' })
      })
      expect(container.querySelector('.topbar .breadcrumb')).toBeNull()
    })

    it('detalhe do processo: máscara de nome preservada (user vê "PO: …" em categoria restrita)', () => {
      const { container } = renderAt('/processos', { role: 'user' })
      act(() => {
        setActiveProcess({
          id: 'p-2',
          name: 'Nome que o user não pode ver',
          processNumber: '4500127710',
          category: 'FCL',
          viewMode: 'detail',
        })
      })
      const crumb = container.querySelector('.topbar .breadcrumb')
      expect(crumb).toHaveTextContent('PO: 4500127710')
      expect(crumb).not.toHaveTextContent('Nome que o user não pode ver')
    })

    it('busca: botão "Buscar (Ctrl K)" com atalho e abre a paleta', async () => {
      const { container } = renderAt('/')
      const button = screen.getByRole('button', { name: 'Buscar (Ctrl K)' })
      expect(button).toHaveClass('topbar__search')
      expect(within(button).getByText('Buscar páginas, ações ou processos')).toBeInTheDocument()
      expect(container.querySelector('.topbar__search-kbd')).toHaveTextContent('Ctrl K')
      const user = userEvent.setup()
      await user.click(button)
      expect(await screen.findByRole('dialog', { name: 'Paleta de comandos' })).toBeInTheDocument()
    })

    it('PTAX: USD | EUR com 4 casas e SEM "R$" (D6)', async () => {
      getDailyPtaxRates.mockResolvedValue({ usd: { sell: 5.4127 }, eur: { sell: 6.1234 } })
      const { container } = renderAt('/')
      const ptax = await waitFor(() => {
        const node = container.querySelector('.topbar__ptax')
        expect(node).not.toBeNull()
        return node
      })
      expect(ptax).toHaveTextContent('USD')
      expect(ptax).toHaveTextContent('5,4127')
      expect(ptax).toHaveTextContent('EUR')
      expect(ptax).toHaveTextContent('6,1234')
      expect(ptax.textContent).not.toContain('R$')
      expect(ptax.querySelector('.topbar__ptax-sep')).not.toBeNull()
      getDailyPtaxRates.mockResolvedValue(null)
    })

    it('PTAX: o chip é SEMPRE renderizado; sem dado mostra "--" em USD e EUR (D6)', async () => {
      getDailyPtaxRates.mockResolvedValue(null)
      const { container } = renderAt('/')
      const ptax = container.querySelector('.topbar__ptax')
      expect(ptax).not.toBeNull()
      expect(ptax).toHaveTextContent('USD')
      expect(ptax).toHaveTextContent('EUR')
      expect(ptax.querySelectorAll('.topbar__ptax-value')).toHaveLength(2)
      ptax.querySelectorAll('.topbar__ptax-value').forEach((node) => expect(node).toHaveTextContent('--'))
      expect(ptax.querySelector('.topbar__ptax-sep')).not.toBeNull()
    })

    it('sino: badge numérico com as não lidas e aria-label preservado', async () => {
      listNotifications.mockResolvedValue([notification({ id: 'a' }), notification({ id: 'b' }), notification({ id: 'c', isRead: true })])
      const { container } = renderAt('/')
      await waitFor(() => {
        expect(container.querySelector('.notifications__count')).toHaveTextContent('2')
      })
      expect(screen.getByLabelText('Notificações, 2 não lidas')).toHaveClass('notifications__trigger')
    })

    it('usuário: nome + papel legível (Logística) e SEM e-mail nem "Sair" na topbar', () => {
      const { container } = renderAt('/', { role: 'logistica', name: 'Maria Souza' })
      const trigger = container.querySelector('.topbar__user')
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger).toHaveTextContent('Maria Souza')
      expect(trigger.querySelector('.topbar__role-badge')).toHaveTextContent('Logística')
      expect(trigger.querySelector('.topbar__avatar')).toHaveTextContent('MS')
      expect(container.querySelector('.topbar')).not.toHaveTextContent('logistica@sq.com')
      expect(within(container.querySelector('.topbar')).queryByRole('button', { name: 'Sair' })).toBeNull()
    })

    it.each([
      ['admin', 'Admin'],
      ['compras', 'Compras'],
      ['viewer', 'Viewer'],
      ['user', 'User'],
    ])('papel %s aparece como "%s"', (role, label) => {
      const { container } = renderAt('/', { role })
      expect(container.querySelector('.topbar__role-badge')).toHaveTextContent(label)
    })

    it('menu do usuário (D5): Preferências de notificação e Sair; Esc fecha e devolve o foco', async () => {
      const { container, logout } = renderAt('/')
      const user = userEvent.setup()
      const trigger = container.querySelector('.topbar__user')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await user.click(trigger)
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      const menu = screen.getByRole('menu', { name: 'Menu do usuário' })
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Preferências de notificação',
        'Sair',
      ])

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(trigger)

      await user.click(trigger)
      await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Sair' }))
      expect(logout).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('menu do usuário: "Preferências de notificação" abre o modal de preferências', async () => {
      const { container } = renderAt('/')
      const user = userEvent.setup()
      await user.click(container.querySelector('.topbar__user'))
      await user.click(screen.getByRole('menuitem', { name: 'Preferências de notificação' }))
      expect(screen.queryByRole('menu')).toBeNull()
      expect(await screen.findByRole('dialog', { name: /Preferências de notificação/i })).toBeInTheDocument()
    })

    it('tablet (<=1040px): só o avatar, sem botão nem menu (comportamento anterior)', () => {
      stubTablet()
      const { container } = renderAt('/')
      const user = container.querySelector('.topbar__user')
      expect(user.tagName).toBe('DIV')
      expect(user.querySelector('.topbar__avatar')).not.toBeNull()
      expect(container.querySelector('.topbar__user-info')).toBeNull()
      expect(container.querySelector('.topbar__user-wrap')).toBeNull()
    })
  })

  describe('gaveta de notificações (desktop)', () => {
    async function openDrawer(user) {
      await user.click(screen.getAllByLabelText(/^Notificações/)[0])
      return screen.findByRole('dialog', { name: 'Central de notificações' })
    }

    it('cabeçalho "Notificações" + "N pendentes", fechar 44px e rodapé com "Ver todas"', async () => {
      listNotifications.mockResolvedValue([notification({ id: 'a' }), notification({ id: 'b', isRead: true })])
      renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      expect(dialog).toHaveClass('notifications__panel--drawer')
      expect(within(dialog).getByText('Notificações')).toBeInTheDocument()
      await waitFor(() => expect(within(dialog).getByText('1 pendente')).toBeInTheDocument())
      expect(within(dialog).getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
      expect(within(dialog).getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/notifications')
      expect(within(dialog).getByRole('button', { name: 'Marcar todas como lidas' })).toBeEnabled()
    })

    it('lista plana (sem grupos): ladrilho por tom, não lida com ponto, tempo "há N min • dd/mm"', async () => {
      listNotifications.mockResolvedValue([
        notification({ id: 'a', type: 'process_question_created', title: 'Nova resposta' }),
        notification({ id: 'b', type: 'process_daily_alerts', title: 'Alerta DUIMP', isRead: true }),
        notification({ id: 'c', type: 'receipt_divergence_reported', title: 'Divergência' }),
      ])
      renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      await within(dialog).findByText('Nova resposta')
      const rows = [...dialog.querySelectorAll('.notif-row')]
      expect(rows).toHaveLength(3)
      expect(dialog.querySelector('.notifications__group')).toBeNull()
      const byTitle = (title) => rows.find((row) => row.textContent.includes(title))
      expect(byTitle('Nova resposta').querySelector('.notif-row__icon--info')).not.toBeNull()
      expect(byTitle('Alerta DUIMP').querySelector('.notif-row__icon--warn')).not.toBeNull()
      expect(byTitle('Divergência').querySelector('.notif-row__icon--danger')).not.toBeNull()
      expect(byTitle('Nova resposta')).toHaveClass('notif-row--unread')
      expect(byTitle('Alerta DUIMP')).not.toHaveClass('notif-row--unread')
      expect(byTitle('Nova resposta').querySelector('.notif-row__time').textContent).toMatch(/^há \d+ min • \d{2}\/\d{2}$/)
    })

    it('pilulas filtram por categoria e a ativa tem aria-selected', async () => {
      listNotifications.mockResolvedValue([
        notification({ id: 'a', type: 'process_question_created', title: 'Dúvida X' }),
        notification({ id: 'b', type: 'collection_status_updated', title: 'Coleta Y' }),
      ])
      renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      await within(dialog).findByText('Dúvida X')
      expect(within(dialog).getByText('Coleta Y')).toBeInTheDocument()

      await user.click(within(dialog).getByRole('tab', { name: 'Coleta' }))
      expect(within(dialog).getByRole('tab', { name: 'Coleta' })).toHaveAttribute('aria-selected', 'true')
      expect(within(dialog).getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'false')
      expect(within(dialog).queryByText('Dúvida X')).toBeNull()
      expect(within(dialog).getByText('Coleta Y')).toBeInTheDocument()
    })

    it('"Marcar todas como lidas" chama o repositório; sem pendentes fica desabilitado', async () => {
      listNotifications.mockResolvedValue([notification({ id: 'a' })])
      renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      await within(dialog).findByText('Nova dúvida')
      await user.click(within(dialog).getByRole('button', { name: 'Marcar todas como lidas' }))
      expect(markAllNotificationsAsRead).toHaveBeenCalledWith('admin-1')
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Marcar todas como lidas' })).toBeDisabled()
      )
    })

    it('"Não perturbe": botão-ícone no cabeçalho, ao lado do fechar, com aria-pressed e rótulos do painel legado', async () => {
      renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      const dnd = within(dialog).getByRole('button', { name: 'Ativar modo não perturbe por 1 hora' })
      expect(dnd).toHaveAttribute('aria-pressed', 'false')
      expect(dnd).toHaveAttribute('title', 'Silenciar por 1 hora')
      expect(dnd.parentElement).toBe(within(dialog).getByRole('button', { name: 'Fechar' }).parentElement)

      await user.click(dnd)
      const active = await within(dialog).findByRole('button', { name: /Desativar modo não perturbe \(restam/ })
      expect(active).toHaveAttribute('aria-pressed', 'true')
      expect(active).toHaveClass('notif-drawer__dnd--active')
      expect(within(dialog).getByText(/Silenciado/)).toBeInTheDocument()

      await user.click(active)
      expect(
        await within(dialog).findByRole('button', { name: 'Ativar modo não perturbe por 1 hora' })
      ).toHaveAttribute('aria-pressed', 'false')
    })

    it('preferências saem da gaveta (ficam no menu do usuário e na página)', async () => {
      renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      expect(within(dialog).queryByRole('button', { name: /Preferências de notificação/i })).toBeNull()
    })

    it('"Marcar como lida" por item: só nas não lidas, alcançável por teclado, não abre a notificação', async () => {
      listNotifications.mockResolvedValue([
        notification({ id: 'a', title: 'Dúvida nova' }),
        notification({ id: 'b', title: 'Já lida', isRead: true }),
      ])
      renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      await within(dialog).findByText('Dúvida nova')

      expect(within(dialog).queryByRole('button', { name: 'Marcar como lida: Já lida' })).toBeNull()
      const mark = within(dialog).getByRole('button', { name: 'Marcar como lida: Dúvida nova' })
      expect(mark).toHaveClass('notif-row__mark')
      expect(mark.closest('.notif-row')).toBeNull() // irmão do botão da linha, nunca aninhado

      // CAUSA-RAIZ do flake: o useFocusTrap move o foco para o 1o focavel da gaveta
      // num setTimeout de 30ms apos abrir. Se mark.focus() vier antes, o timer
      // rouba o foco e o Enter cai em outro botao. Espera o auto-foco assentar.
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
      mark.focus()
      expect(document.activeElement).toBe(mark)
      await user.keyboard('{Enter}')
      expect(markNotificationAsRead).toHaveBeenCalledWith('a')
      await waitFor(() =>
        expect(within(dialog).queryByRole('button', { name: 'Marcar como lida: Dúvida nova' })).toBeNull()
      )
      // marcou como lida sem navegar nem fechar a gaveta
      expect(screen.getByTestId('probe')).toHaveTextContent('/|')
      expect(screen.getByRole('dialog', { name: 'Central de notificações' })).toBeInTheDocument()
    })

    it('botão fechar e Esc fecham a gaveta', async () => {
      const { container } = renderAt('/')
      const user = userEvent.setup()
      const dialog = await openDrawer(user)
      await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
      await waitFor(() => expect(container.querySelector('.notifications__panel')).toBeNull())
    })

    it('tablet (<=1040px): mantém o markup anterior (select de categorias)', async () => {
      stubTablet()
      const { container } = renderAt('/')
      const user = userEvent.setup()
      await user.click(screen.getAllByLabelText(/^Notificações/)[0])
      expect(await screen.findByLabelText('Filtrar notificações por categoria')).toBeInstanceOf(HTMLSelectElement)
      expect(container.querySelector('.notifications__panel--drawer')).toBeNull()
    })
  })

  describe('paleta de comandos', () => {
    it('admin: "Novo processo" na paleta navega para /processos com openCreate (D7)', async () => {
      renderAt('/')
      act(() => {
        fireKeyDown('k', { ctrlKey: true })
      })
      const option = await screen.findByRole('option', { name: /Novo processo/ })
      const user = userEvent.setup()
      await user.click(option)
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('/processos|{"openCreate":true}'))
    })

    it('user: sem "Novo processo"', async () => {
      renderAt('/', { role: 'user' })
      act(() => {
        fireKeyDown('k', { ctrlKey: true })
      })
      await screen.findByRole('option', { name: /Ir para Dashboard/ })
      expect(screen.queryByRole('option', { name: /Novo processo/ })).toBeNull()
    })

    it('páginas e ações num grupo só, com "Ir para Notícias"', async () => {
      renderAt('/')
      act(() => {
        fireKeyDown('k', { ctrlKey: true })
      })
      expect(await screen.findByText('Páginas e ações')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Ir para Notícias/ })).toBeInTheDocument()
    })
  })
})
