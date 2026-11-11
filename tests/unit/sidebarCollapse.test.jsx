// Sidebar recolhivel do desktop no AppLayout: botao, persistencia, tablet e dicas.
// Fica em tests/unit (e nao em tests/ui) de proposito: tests/ui/*.test.jsx e
// contado pelo pretest (audit-vault-counts).
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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

vi.mock('../../src/services/supportTicketsRepository', async (importOriginal) => ({
  ...(await importOriginal()),
  listMySupportTickets: vi.fn(async () => []),
}))

import AppLayout from '../../src/components/AppLayout.jsx'
import { ToastProvider } from '../../src/components/Toast.jsx'
import { NotificationsProvider } from '../../src/contexts/NotificationsContext.jsx'
import { listNotifications } from '../../src/services/notificationsRepository.js'

const KEY = 'comex-sidebar-colapsada'
const originalMatchMedia = window.matchMedia

// `/max-width:\s*1040px/` = tablet (drawer); o resto (desktop) nao casa.
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

function renderLayout(role = 'admin', { area } = {}) {
  mockUseAuth.mockReturnValue({
    profile: { uid: `${role}-1`, name: `${role} User`, email: `${role}@sq.com`, role, area },
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
    </ToastProvider>,
  )
}

const shellOf = (container) => container.querySelector('.shell')
const toggleOf = () =>
  screen.getByRole('button', { name: /^(Recolher|Expandir) menu lateral$/ })
const dashboardLink = () => screen.getByRole('link', { name: /Dashboard/ })

beforeEach(() => {
  mockUseAuth.mockReset()
  listNotifications.mockReset()
  listNotifications.mockResolvedValue([])
  window.localStorage.clear()
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('sidebar recolhivel: botao e estado (desktop)', () => {
  it('botao "Recolher menu lateral" dentro da .brand, expandido e ligado a navegacao', () => {
    const { container } = renderLayout()
    const button = screen.getByRole('button', { name: 'Recolher menu lateral' })
    expect(container.querySelector('.brand').contains(button)).toBe(true)
    expect(button).toHaveClass('sidebar__toggle')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-controls', 'primary-navigation')
    expect(button).toHaveAttribute('title', 'Recolher menu lateral')
    expect(shellOf(container)).not.toHaveClass('shell--sidebar-colapsada')
  })

  it('clique recolhe, persiste "1" e o segundo clique expande e remove a chave', () => {
    const { container } = renderLayout()

    fireEvent.click(toggleOf())
    expect(shellOf(container)).toHaveClass('shell--sidebar-colapsada')
    const collapsed = screen.getByRole('button', { name: 'Expandir menu lateral' })
    expect(collapsed).toHaveAttribute('aria-expanded', 'false')
    expect(collapsed).toHaveAttribute('title', 'Expandir menu lateral')
    expect(window.localStorage.getItem(KEY)).toBe('1')

    fireEvent.click(collapsed)
    expect(shellOf(container)).not.toHaveClass('shell--sidebar-colapsada')
    expect(screen.getByRole('button', { name: 'Recolher menu lateral' })).toHaveAttribute('aria-expanded', 'true')
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('com "1" no storage antes do render ja nasce recolhida', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    expect(shellOf(container)).toHaveClass('shell--sidebar-colapsada')
    expect(toggleOf()).toHaveAttribute('aria-label', 'Expandir menu lateral')
  })

  it('storage bloqueado: renderiza expandida e o clique alterna a classe sem erro', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })

    const { container } = renderLayout()
    expect(shellOf(container)).not.toHaveClass('shell--sidebar-colapsada')

    expect(() => fireEvent.click(toggleOf())).not.toThrow()
    expect(shellOf(container)).toHaveClass('shell--sidebar-colapsada')

    expect(() => fireEvent.click(toggleOf())).not.toThrow()
    expect(shellOf(container)).not.toHaveClass('shell--sidebar-colapsada')
  })
})

describe('sidebar recolhivel: tablet (<= 1040px) fica identico', () => {
  it('sem botao Recolher/Expandir menu lateral', () => {
    stubTablet()
    renderLayout()
    expect(screen.queryByRole('button', { name: /^(Recolher|Expandir) menu lateral$/ })).toBeNull()
  })

  it('com "1" no storage o .shell NAO recebe a classe', () => {
    stubTablet()
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    expect(shellOf(container)).not.toHaveClass('shell--sidebar-colapsada')
  })
})

describe('sidebar recolhivel: dicas', () => {
  it('expandida: mouseEnter no link nao mostra dica', () => {
    const { container } = renderLayout()
    fireEvent.mouseEnter(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).toBeNull()
  })

  it('recolhida: mouseEnter mostra a dica na raiz do .shell (fora do <aside>) e mouseLeave some', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    fireEvent.mouseEnter(dashboardLink())

    const tip = container.querySelector('.sidebar-tip')
    expect(tip).not.toBeNull()
    expect(tip).toHaveTextContent('Dashboard')
    expect(tip).toHaveAttribute('aria-hidden', 'true')
    expect(tip).toHaveAttribute('role', 'presentation')
    expect(container.querySelector('aside').contains(tip)).toBe(false)
    expect(tip.parentElement).toBe(shellOf(container))

    fireEvent.mouseLeave(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).toBeNull()
  })

  it('foco mostra, Escape e blur escondem', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()

    fireEvent.focus(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).not.toBeNull()

    fireEvent.keyDown(dashboardLink(), { key: 'Escape' })
    expect(container.querySelector('.sidebar-tip')).toBeNull()

    fireEvent.focus(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).not.toBeNull()
    fireEvent.blur(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).toBeNull()
  })

  it('outra tecla nao esconde a dica', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    fireEvent.focus(dashboardLink())
    fireEvent.keyDown(dashboardLink(), { key: 'Tab' })
    expect(container.querySelector('.sidebar-tip')).not.toBeNull()
  })

  it('resize da janela, rolagem da sidebar e expandir de novo escondem a dica', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()

    fireEvent.mouseEnter(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).not.toBeNull()
    fireEvent(window, new Event('resize'))
    expect(container.querySelector('.sidebar-tip')).toBeNull()

    fireEvent.mouseEnter(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).not.toBeNull()
    fireEvent.scroll(container.querySelector('aside'))
    expect(container.querySelector('.sidebar-tip')).toBeNull()

    fireEvent.mouseEnter(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).not.toBeNull()
    fireEvent.click(toggleOf())
    expect(container.querySelector('.sidebar-tip')).toBeNull()
  })

  it('o listener de resize e removido no unmount (o mesmo handler registrado com a dica aberta)', () => {
    window.localStorage.setItem(KEY, '1')
    const { unmount } = renderLayout()

    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    fireEvent.mouseEnter(dashboardLink())
    const added = addSpy.mock.calls.filter(([type]) => type === 'resize').map(([, handler]) => handler)
    expect(added.length).toBeGreaterThan(0)

    unmount()
    const removed = removeSpy.mock.calls.filter(([type]) => type === 'resize').map(([, handler]) => handler)
    added.forEach((handler) => expect(removed).toContain(handler))
  })

  it('dica aberta e recolhida: o viewport virar tablet (<= 1040px) fecha a dica', () => {
    let isTablet = false
    const changeListeners = []
    window.matchMedia = (query) => {
      const isTabletQuery = /max-width:\s*1040px/.test(query)
      return {
        get matches() {
          return isTabletQuery && isTablet
        },
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: (type, listener) => {
          if (type === 'change' && isTabletQuery) changeListeners.push(listener)
        },
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }
    }

    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    expect(shellOf(container)).toHaveClass('shell--sidebar-colapsada')

    fireEvent.mouseEnter(dashboardLink())
    expect(container.querySelector('.sidebar-tip')).not.toBeNull()

    isTablet = true
    act(() => {
      changeListeners.forEach((listener) => listener({ matches: true }))
    })

    expect(shellOf(container)).not.toHaveClass('shell--sidebar-colapsada')
    expect(container.querySelector('.sidebar-tip')).toBeNull()
  })

  it('trocar de item troca o texto da dica', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    fireEvent.mouseEnter(dashboardLink())
    fireEvent.mouseEnter(within(container.querySelector('aside')).getByRole('link', { name: /Chegadas/ }))
    const tips = container.querySelectorAll('.sidebar-tip')
    expect(tips).toHaveLength(1)
    expect(tips[0]).toHaveTextContent('Chegadas')
  })

  it('Tema e Suporte: title nativo so quando expandida (recolhida a dica customizada o substitui)', () => {
    const { container, unmount } = renderLayout('admin')
    let sidebar = within(container.querySelector('aside'))
    expect(sidebar.getByRole('button', { name: /Tema: automático/ })).toHaveAttribute(
      'title',
      'Alternar tema (automático / escuro / claro)',
    )
    expect(sidebar.getByRole('button', { name: 'Abrir suporte' })).toHaveAttribute('title', 'Relatar um problema')

    fireEvent.click(toggleOf())
    sidebar = within(container.querySelector('aside'))
    const theme = sidebar.getByRole('button', { name: /Tema: automático/ })
    const support = sidebar.getByRole('button', { name: 'Abrir suporte' })
    expect(theme).not.toHaveAttribute('title')
    expect(support).not.toHaveAttribute('title')
    expect(theme).toHaveAttribute('aria-label')
    expect(support).toHaveAttribute('aria-label', 'Abrir suporte')

    fireEvent.click(toggleOf())
    expect(within(container.querySelector('aside')).getByRole('button', { name: 'Abrir suporte' })).toHaveAttribute(
      'title',
      'Relatar um problema',
    )
    unmount()
  })

  it('admin: textos das dicas do card IntelliQuote, do tema e do suporte', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout('admin')
    const sidebar = container.querySelector('aside')

    fireEvent.mouseEnter(screen.getByLabelText(/Abrir IntelliQuote em nova aba/i))
    expect(container.querySelector('.sidebar-tip')).toHaveTextContent('IntelliQuote · Abrir cotações')
    fireEvent.mouseLeave(screen.getByLabelText(/Abrir IntelliQuote em nova aba/i))

    fireEvent.mouseEnter(within(sidebar).getByRole('button', { name: /Tema: automático/ }))
    expect(container.querySelector('.sidebar-tip')).toHaveTextContent('Tema: automático')
    fireEvent.mouseLeave(within(sidebar).getByRole('button', { name: /Tema: automático/ }))

    fireEvent.mouseEnter(within(sidebar).getByRole('button', { name: 'Abrir suporte' }))
    expect(container.querySelector('.sidebar-tip')).toHaveTextContent('Suporte')
  })

  it('user + Comercial: dica "Solicitar uma cotação · IntelliQuote" e ladrilho com icone, sem marca IQ', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout('user', { area: 'Comercial' })
    const card = screen.getByLabelText(/Solicitar uma cotação no IntelliQuote/i)

    expect(card.querySelector('.sidebar-intelliquote-link__tile svg')).not.toBeNull()
    expect(card.querySelector('.brand-mark')).toBeNull()
    expect(within(card).getByText('Solicitar uma cotação')).toBeInTheDocument()

    fireEvent.mouseEnter(card)
    expect(container.querySelector('.sidebar-tip')).toHaveTextContent('Solicitar uma cotação · IntelliQuote')
  })
})

describe('sidebar recolhivel: DOM preservado', () => {
  it('o texto continua no DOM com a sidebar recolhida (o CSS so corta)', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    const sidebar = within(container.querySelector('aside'))
    expect(sidebar.getByText('Chegadas')).toBeInTheDocument()
    expect(sidebar.getByText('Suporte')).toBeInTheDocument()
  })

  it('--k dos links vai de 0 a n-1 e o rodape recebe n', () => {
    const { container } = renderLayout('admin')
    const links = [...container.querySelectorAll('.sidebar .nav__link')]
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link, index) => {
      expect(link.style.getPropertyValue('--k')).toBe(String(index))
    })
    expect(container.querySelector('.sidebar__foot').style.getPropertyValue('--k')).toBe(String(links.length))
  })

  it('a assinatura continua sendo o ultimo filho de .sidebar__foot (recolhida)', () => {
    window.localStorage.setItem(KEY, '1')
    const { container } = renderLayout()
    const foot = container.querySelector('.sidebar__foot')
    expect(foot.lastElementChild).toHaveClass('sidebar-signature')
  })
})
