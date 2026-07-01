// Tests do AdminLayout (shell do centro administrativo).
// Cobre:
//   - Render: heading "Centro administrativo" + descricao
//   - Nav: 4 links (Usuarios, Comunicados, Barra do porto, Previsoes)
//   - Cada NavLink aponta para a rota correta
//   - Outlet renderiza children quando rota filha ativa
//   - NavLink com isActive=true tem classe tab-button--active

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

import AdminLayout from '../../src/pages/AdminLayout'

function renderPage({ initialEntries = ['/admin/usuarios'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="usuarios" element={<div data-testid="usuarios-content">Usuarios page</div>} />
          <Route path="comunicados" element={<div data-testid="comunicados-content">Comunicados page</div>} />
          <Route path="barra" element={<div data-testid="barra-content">Barra page</div>} />
          <Route path="previsoes" element={<div data-testid="previsoes-content">Previsoes page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockUseAuth.mockReturnValue({ profile: { uid: 'admin-1', role: 'admin' } })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminLayout', () => {
  it('render: heading "Centro administrativo" + descricao', () => {
    renderPage()
    expect(screen.getByText(/Centro administrativo/i)).toBeInTheDocument()
    expect(screen.getByText(/Gerencie cadastros, avisos, status da barra/i)).toBeInTheDocument()
  })

  it('Nav: 4 links (Usuarios, Comunicados, Barra do porto, Previsoes)', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[0]).toHaveTextContent('Usuários')
    expect(links[1]).toHaveTextContent('Comunicados')
    expect(links[2]).toHaveTextContent('Barra do porto')
    expect(links[3]).toHaveTextContent('Previsões')
  })

  it('cada NavLink aponta para a rota correta', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/admin/usuarios')
    expect(links[1]).toHaveAttribute('href', '/admin/comunicados')
    expect(links[2]).toHaveAttribute('href', '/admin/barra')
    expect(links[3]).toHaveAttribute('href', '/admin/previsoes')
  })

  it('Outlet renderiza children quando rota filha ativa', () => {
    renderPage({ initialEntries: ['/admin/usuarios'] })
    expect(screen.getByTestId('usuarios-content')).toBeInTheDocument()
  })

  it('Outlet renderiza outra rota filha quando navegada', () => {
    renderPage({ initialEntries: ['/admin/comunicados'] })
    expect(screen.getByTestId('comunicados-content')).toBeInTheDocument()
  })

  it('NavLink ativo tem classe tab-button--active', () => {
    renderPage({ initialEntries: ['/admin/barra'] })
    const links = screen.getAllByRole('link')
    // Terceiro link (Barra do porto) deve estar ativo
    expect(links[2].className).toMatch(/tab-button--active/)
    // Os outros nao
    expect(links[0].className).not.toMatch(/tab-button--active/)
  })
})
