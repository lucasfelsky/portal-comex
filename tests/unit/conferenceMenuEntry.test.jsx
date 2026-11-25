// S9-F/S11-H do Relatório de Carga: no Menu (celular) o admin tem a linha "Conferência" com o contador; a logística tem a
// Conferência na barra de baixo e, no Menu, a linha "Notícias".
// O contador (cache da lista) é espiado; a carga dele tem testes próprios.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockUseAuth = vi.fn()
const mockCount = vi.fn(() => null)
const mockNavigate = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => ({ preference: 'auto', setPreference: vi.fn(), cyclePreference: vi.fn() }),
}))
vi.mock('../../src/features/processes/useCargoConferenceList', () => ({
  useCargoConferenceCount: (options) => mockCount(options),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, useNavigate: () => mockNavigate }
})

import MenuPage from '../../src/pages/MenuPage'

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

function renderMenu(role) {
  mockUseAuth.mockReturnValue({
    profile: { uid: `${role}-1`, name: 'Lucas Felsky', email: `${role}@sq.com`, role },
    logout: vi.fn(),
  })
  return render(
    <MemoryRouter>
      <MenuPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCount.mockImplementation(() => null)
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('Menu: entrada Conferência (admin) e Notícias (logística)', () => {
  it('admin no celular: linha com subtítulo, contador e nome acessível com o número', () => {
    stubViewport(390)
    mockCount.mockImplementation(() => 4)
    const { container } = renderMenu('admin')
    expect(mockCount).toHaveBeenCalledWith({ enabled: true })
    const row = screen.getByRole('button', { name: 'Conferência, 4 para conferir' })
    expect(row).toHaveClass('m-rowi')
    expect(within(row).getByText('Relatório de Carga no celular')).toBeInTheDocument()
    const count = row.querySelector('.m-rowi__count')
    expect(count).toHaveTextContent('4')
    expect(count).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.m-rowi__chev')).not.toBeNull()
    fireEvent.click(row)
    expect(mockNavigate).toHaveBeenCalledWith('/conferencia')
  })

  it('admin sem número (carregando, erro ou zero): sem contador e sem aria-label', () => {
    stubViewport(390)
    for (const value of [null, 0]) {
      mockCount.mockImplementation(() => value)
      const { container, unmount } = renderMenu('admin')
      const row = screen.getByRole('button', { name: /^Conferência/ })
      expect(row).not.toHaveAttribute('aria-label')
      expect(row.querySelector('.m-rowi__count')).toBeNull()
      expect(container.textContent).not.toMatch(/para conferir/)
      unmount()
    }
  })

  it('admin: a linha vem antes do grupo "Administração" e Notícias não está no Menu (fica na barra)', () => {
    stubViewport(390)
    mockCount.mockImplementation(() => 2)
    const { container } = renderMenu('admin')
    expect(mockCount).toHaveBeenCalledWith({ enabled: true })
    const row = screen.getByRole('button', { name: 'Conferência, 2 para conferir' })
    const heading = screen.getByRole('heading', { level: 2, name: 'Administração' })
    expect(row.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // As 7 seções do admin continuam no grupo que segue o título.
    expect(within(container.querySelector('.m-gh + .m-group')).getAllByRole('button')).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /^Notícias/ })).not.toBeInTheDocument()
  })

  it('logística no celular: linha "Notícias" (comunicados da operação) que navega para /news', () => {
    stubViewport(390)
    const { container } = renderMenu('logistica')
    const row = screen.getByRole('button', { name: /^Notícias/ })
    expect(row).toHaveClass('m-rowi')
    expect(within(row).getByText('Comunicados da operação')).toBeInTheDocument()
    expect(row.querySelector('.m-rowi__count')).toBeNull()
    expect(container.querySelector('.m-rowi__chev')).not.toBeNull()
    fireEvent.click(row)
    expect(mockNavigate).toHaveBeenCalledWith('/news')
  })

  it('logística: sem linha "Conferência" (já está na barra de baixo) e o Menu não carrega o contador', () => {
    stubViewport(390)
    mockCount.mockImplementation(() => 4)
    const { container } = renderMenu('logistica')
    expect(screen.queryByRole('button', { name: /Conferência/ })).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/para conferir/)
    expect(container.querySelector('.m-rowi__count')).toBeNull()
    expect(mockCount).toHaveBeenCalledWith({ enabled: false })
    expect(mockCount).not.toHaveBeenCalledWith({ enabled: true })
  })

  it.each(['user', 'tecnico', 'faturamento', 'compras', 'viewer'])('%s: sem linha, sem Notícias e sem contador', (role) => {
    stubViewport(390)
    renderMenu(role)
    expect(screen.queryByRole('button', { name: /Conferência/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Notícias/ })).not.toBeInTheDocument()
    expect(mockCount).toHaveBeenCalledWith({ enabled: false })
    expect(mockCount).not.toHaveBeenCalledWith({ enabled: true })
  })

  it.each(['logistica', 'admin'])('computador (largura > 720): %s sem linha de Conferência nem de Notícias', (role) => {
    stubViewport(1440)
    renderMenu(role)
    expect(screen.queryByRole('button', { name: /Conferência/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Notícias/ })).not.toBeInTheDocument()
    expect(mockCount).not.toHaveBeenCalledWith({ enabled: true })
  })
})
