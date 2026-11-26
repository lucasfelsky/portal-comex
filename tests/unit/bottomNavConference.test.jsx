// S11-H do Relatório de Carga: barra de baixo do celular por papel. Logística: Início, Chegadas, Conferência (com o
// contador de processos a conferir, no lugar de Notícias), Avisos e Menu (sem badge). Admin: como antes (Notícias na barra
// e o contador no Menu). Demais papéis: sem mudança. O contador (cache da lista) é espiado; a carga dele tem testes próprios.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))

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

const mockCount = vi.fn(() => null)
vi.mock('../../src/features/processes/useCargoConferenceList', () => ({
  useCargoConferenceCount: (options) => mockCount(options),
}))

import AppLayout from '../../src/components/AppLayout.jsx'
import { ToastProvider } from '../../src/components/Toast.jsx'
import { NotificationsProvider } from '../../src/contexts/NotificationsContext.jsx'

const originalMatchMedia = window.matchMedia

function stubViewport(widthPx) {
  window.matchMedia = (query) => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    return {
      matches: Boolean(max) && Number(max[1]) >= widthPx,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }
  }
}

function renderAt(path, role) {
  mockUseAuth.mockReturnValue({
    profile: { uid: `${role}-1`, name: `${role} User`, email: `${role}@sq.com`, role },
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

const bar = (container) => container.querySelector('nav.mobile-bottom-nav')

beforeEach(() => {
  vi.clearAllMocks()
  mockCount.mockImplementation(() => null)
  stubViewport(390)
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('barra de baixo: logística (Conferência no lugar de Notícias)', () => {
  it('3º item = Conferência com o badge do contador (aria-hidden) e o número no nome acessível', () => {
    mockCount.mockImplementation(() => 3)
    const { container } = renderAt('/', 'logistica')
    const items = [...bar(container).children]
    expect(items).toHaveLength(5)
    const tab = items[2]
    expect(tab).toHaveAttribute('href', '/conferencia')
    expect(tab).toHaveAttribute('aria-label', 'Conferência, 3 para conferir')
    expect(tab.querySelector('.mobile-bottom-nav__label')).toHaveTextContent('Conferência')
    const badge = tab.querySelector('.mobile-bottom-nav__badge')
    expect(badge).toHaveTextContent('3')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    // O ícone é decorativo: o nome acessível vem só do aria-label.
    expect(tab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(mockCount).toHaveBeenCalledWith({ enabled: true })
  })

  it('Menu sem badge e sem contagem no nome; Notícias fora da barra', () => {
    mockCount.mockImplementation(() => 3)
    const { container } = renderAt('/', 'logistica')
    const nav = within(bar(container))
    const menu = nav.getByRole('link', { name: 'Menu' })
    expect(menu).toHaveAttribute('href', '/menu')
    expect(menu.querySelector('.mobile-bottom-nav__badge')).toBeNull()
    expect(nav.queryByRole('link', { name: 'Notícias' })).not.toBeInTheDocument()
    // O único badge da barra é o da Conferência (sem avisos não lidos).
    expect(bar(container).querySelectorAll('.mobile-bottom-nav__badge')).toHaveLength(1)
  })

  it('singular: "Conferência, 1 para conferir"', () => {
    mockCount.mockImplementation(() => 1)
    const { container } = renderAt('/', 'logistica')
    expect(within(bar(container)).getByRole('link', { name: 'Conferência, 1 para conferir' })).toHaveAttribute(
      'href',
      '/conferencia'
    )
  })

  it.each([null, 0])('contador %s (carregando, erro ou zero): sem badge e nome "Conferência"', (value) => {
    mockCount.mockImplementation(() => value)
    const { container } = renderAt('/', 'logistica')
    const tab = within(bar(container)).getByRole('link', { name: 'Conferência' })
    expect(tab).toHaveAttribute('href', '/conferencia')
    expect(tab.querySelector('.mobile-bottom-nav__badge')).toBeNull()
    expect(tab.textContent).not.toMatch(/\d/)
  })

  it.each(['/conferencia', '/conferencia?processo=p1'])('%s: a aba Conferência é a ativa (aria-current="page")', (path) => {
    mockCount.mockImplementation(() => 2)
    const { container } = renderAt(path, 'logistica')
    const items = [...bar(container).children]
    const active = items.filter((item) => item.classList.contains('mobile-bottom-nav__item--active'))
    expect(active).toEqual([items[2]])
    expect(items[2]).toHaveAttribute('aria-current', 'page')
    items.filter((item) => item !== items[2]).forEach((item) => expect(item).not.toHaveAttribute('aria-current'))
  })

  it('em "/" a Conferência não é a ativa', () => {
    const { container } = renderAt('/', 'logistica')
    const items = [...bar(container).children]
    expect(items[2]).not.toHaveAttribute('aria-current')
    expect(items[0]).toHaveAttribute('aria-current', 'page')
  })

  it('tocar na aba navega para /conferencia e a marca como ativa', async () => {
    const user = userEvent.setup()
    mockCount.mockImplementation(() => 2)
    const { container } = renderAt('/', 'logistica')
    await user.click(within(bar(container)).getByRole('link', { name: 'Conferência, 2 para conferir' }))
    expect([...bar(container).children][2]).toHaveAttribute('aria-current', 'page')
  })

  it('o contador acompanha o valor do hook (re-render com número novo)', () => {
    mockCount.mockImplementation(() => 3)
    const view = renderAt('/', 'logistica')
    expect(within(bar(view.container)).getByRole('link', { name: 'Conferência, 3 para conferir' })).toBeInTheDocument()
    mockCount.mockImplementation(() => 2)
    view.rerender(
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
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
    expect(within(bar(view.container)).getByRole('link', { name: 'Conferência, 2 para conferir' })).toBeInTheDocument()
  })
})

describe('barra de baixo: ícone e selo da aba Conferência', () => {
  it('o ícone é a prancheta com check, na mesma grade e no mesmo traço dos outros itens', () => {
    mockCount.mockImplementation(() => 3)
    const { container } = renderAt('/', 'logistica')
    const svgs = [...bar(container).querySelectorAll('.mobile-bottom-nav__item > svg')]
    expect(svgs).toHaveLength(5)
    const conference = svgs[2]
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
      expect(svg).toHaveAttribute('stroke-width', conference.getAttribute('stroke-width'))
      expect(svg).toHaveAttribute('stroke-linecap', 'round')
    }
    // Prancheta: presilha (rect), corpo e visto (2 paths); o glifo antigo (visto solto + 4 traços) era 1 path só.
    expect(conference.querySelectorAll('rect')).toHaveLength(1)
    expect(conference.querySelectorAll('path')).toHaveLength(2)
  })

  it('o selo fica no canto superior direito do ícone, fora do desenho (mesma regra para Conferência, Avisos e Menu)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/mobile-redesign.css'), 'utf8').replace(/\r\n/g, '\n')
    const rule = /\.mobile-bottom-nav \.mobile-bottom-nav__badge \{([^}]*)\}/.exec(css)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/top:\s*4px;/)
    expect(rule[1]).toMatch(/left:\s*calc\(50% \+ 10px\);/)
  })
})

describe('barra de baixo: admin e demais papéis (sem mudança)', () => {
  it('admin: Notícias na barra, Menu com o badge e o número no nome, sem aba Conferência', () => {
    mockCount.mockImplementation(() => 3)
    const { container } = renderAt('/', 'admin')
    const nav = within(bar(container))
    expect(nav.getByRole('link', { name: 'Notícias' })).toHaveAttribute('href', '/news')
    expect(nav.queryByRole('link', { name: /^Conferência/ })).not.toBeInTheDocument()
    const menu = nav.getByRole('link', { name: 'Menu, 3 conferências para conferir' })
    const badge = menu.querySelector('.mobile-bottom-nav__badge')
    expect(badge).toHaveTextContent('3')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(mockCount).toHaveBeenCalledWith({ enabled: true })
  })

  it('admin em /conferencia: nenhuma aba ativa (a Conferência mora no Menu)', () => {
    mockCount.mockImplementation(() => 3)
    const { container } = renderAt('/conferencia', 'admin')
    expect(bar(container).querySelector('[aria-current]')).toBeNull()
  })

  it.each(['user', 'tecnico', 'faturamento', 'compras', 'viewer'])(
    '%s: Notícias na barra, sem aba Conferência, sem badge e contador desligado',
    (role) => {
      mockCount.mockImplementation(() => 5)
      const { container } = renderAt('/', role)
      const nav = within(bar(container))
      expect(nav.getByRole('link', { name: 'Notícias' })).toHaveAttribute('href', '/news')
      expect(nav.queryByRole('link', { name: /Conferência/ })).not.toBeInTheDocument()
      expect(nav.getByRole('link', { name: 'Menu' }).querySelector('.mobile-bottom-nav__badge')).toBeNull()
      expect(mockCount).toHaveBeenCalledWith({ enabled: false })
      expect(mockCount).not.toHaveBeenCalledWith({ enabled: true })
    }
  )
})

describe('barra de baixo: fora do celular', () => {
  it('tablet (900 px): o contador não liga e a barra segue escondida pelo CSS base (só existe até 720 px)', () => {
    stubViewport(900)
    renderAt('/', 'logistica')
    expect(mockCount).toHaveBeenCalledWith({ enabled: false })
    expect(mockCount).not.toHaveBeenCalledWith({ enabled: true })
    const baseCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    expect(baseCss).toMatch(/\.mobile-bottom-nav\s*\{\s*display:\s*none;?\s*\}/)
  })

  it('computador (1440 px): o contador não liga', () => {
    stubViewport(1440)
    renderAt('/', 'admin')
    expect(mockCount).not.toHaveBeenCalledWith({ enabled: true })
  })
})
