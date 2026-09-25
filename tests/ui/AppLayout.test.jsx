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
import { MemoryRouter, Routes, Route } from 'react-router-dom'
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

import AppLayout from '../../src/components/AppLayout.jsx'
// SupportButton (aba de suporte) usa useToast; no app real o ToastProvider
// mora no main.jsx, entao o wrapper do teste precisa dele tambem.
import { ToastProvider } from '../../src/components/Toast.jsx'
import { NotificationsProvider } from '../../src/contexts/NotificationsContext.jsx'
import NotificationsPage from '../../src/pages/NotificationsPage.jsx'
import { NOTIFICATIONS_CHANGED_EVENT, listNotifications } from '../../src/services/notificationsRepository.js'

function renderWithRole(role) {
  mockUseAuth.mockReturnValue({
    profile: role
      ? { uid: `${role}-1`, name: `${role} User`, email: `${role}@sq.com`, role }
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

      const filterSelect = await screen.findByLabelText('Filtrar notificações por categoria')
      // Espera o auto-foco inicial do useFocusTrap (30ms) assentar antes de
      // mover o foco manualmente — senão o timeout pendente rouba o foco
      // de volta e o teste não isola a regressão do polling.
      await waitFor(() => {
        const dialog = screen.getByRole('dialog', { name: 'Central de notificações' })
        expect(dialog.contains(document.activeElement)).toBe(true)
      })
      filterSelect.focus()
      expect(document.activeElement).toBe(filterSelect)

      act(() => {
        window.dispatchEvent(
          new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { recipientUserIds: [] } })
        )
      })

      await new Promise((resolve) => setTimeout(resolve, 40))

      expect(document.activeElement).toBe(filterSelect)
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

function fireKeyDown(key, init = {}) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, ...init, bubbles: true, cancelable: true })
  )
}
