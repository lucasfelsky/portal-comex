// Tests do NotFoundPage (pagina 404 personalizada).
// Cobre:
//   - Render em /rota-inexistente: heading + codigo 404 + caminho
//   - Subtitle dinamico: "Pagina nao encontrada" para path normal
//   - Subtitle especial para path "/" (Pagina inicial indisponivel)
//   - Botao "Voltar para o painel" (primary, link para /)
//   - Botao "Ver ultimas noticias" (ghost, link para /news)
//   - Muted hint de reporting
//   - Renderiza dentro do design system (auth-gate + auth-card)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

import NotFoundPage from '../../src/pages/NotFoundPage'

function renderPage({ initialEntries = ['/rota-inexistente'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<div data-testid="home-landing">home</div>} />
        <Route path="/news" element={<div data-testid="news-landing">news</div>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockUseAuth.mockReturnValue({ profile: { uid: 'u-1' } })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('NotFoundPage', () => {
  it('render: heading + codigo 404 + caminho', () => {
    renderPage({ initialEntries: ['/rota-inexistente'] })
    expect(screen.getByText(/Pagina nao encontrada/i)).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('/rota-inexistente')).toBeInTheDocument()
  })

  it('subtitle dinamico: "Pagina nao encontrada" para path normal', () => {
    renderPage({ initialEntries: ['/alguma-rota'] })
    expect(screen.getByText(/O endereco "\/alguma-rota" nao corresponde/i)).toBeInTheDocument()
  })

  it('botao "Voltar para o painel" (primary, link para /)', () => {
    renderPage()
    const link = screen.getByTestId('not-found-home')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
    expect(link.className).toMatch(/primary-button/)
  })

  it('botao "Ver ultimas noticias" (ghost, link para /news)', () => {
    renderPage()
    const link = screen.getByTestId('not-found-news')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/news')
    expect(link.className).toMatch(/ghost-button/)
  })

  it('muted hint de reporting presente', () => {
    renderPage()
    expect(screen.getByText(/Se voce chegou aqui por um link/i)).toBeInTheDocument()
  })

  it('renderiza dentro do design system (auth-gate + auth-card)', () => {
    const { container } = renderPage()
    expect(container.querySelector('.auth-gate')).toBeInTheDocument()
    expect(container.querySelector('.auth-card')).toBeInTheDocument()
  })
})
