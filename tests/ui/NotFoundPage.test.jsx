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
    expect(screen.getByText(/Página não encontrada/i)).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('/rota-inexistente')).toBeInTheDocument()
  })

  it('subtitle dinamico: "Pagina nao encontrada" para path normal', () => {
    renderPage({ initialEntries: ['/alguma-rota'] })
    expect(screen.getByText(/O endereço "\/alguma-rota" não corresponde/i)).toBeInTheDocument()
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
    expect(screen.getByText(/Se você chegou aqui por um link/i)).toBeInTheDocument()
  })

  it('renderiza dentro do design system (auth-screen + auth-card)', () => {
    const { container } = renderPage()
    expect(container.querySelector('.auth-screen')).toBeInTheDocument()
    expect(container.querySelector('.auth-card')).toBeInTheDocument()
  })
})

// Refino F5b (AcessoEstados.dc.html): card navy com "404" grande e caminho em mono.
describe('NotFoundPage - estado de acesso (F5b)', () => {
  it('raiz .auth-screen--not-found; "Código: 404" continua no DOM (rotulo so para leitor de tela)', () => {
    const { container } = renderPage()
    expect(container.querySelector('section')).toHaveClass('auth-screen', 'auth-screen--not-found')
    const code = container.querySelector('.auth-error-code')
    expect(code).toHaveTextContent('Código: 404')
    expect(code.querySelector('.auth-error-code__label')).toHaveTextContent('Código:')
    expect(code.querySelector('code')).toHaveTextContent('404')
  })

  it('caminho em mono: "Caminho: <path>" com o path em <code>', () => {
    const { container } = renderPage({ initialEntries: ['/processos/abc123'] })
    const path = container.querySelector('.auth-error-path')
    expect(path).toHaveTextContent('Caminho: /processos/abc123')
    expect(path.querySelector('code')).toHaveTextContent('/processos/abc123')
    expect(screen.getByRole('group', { name: 'Detalhes do erro' })).toBeInTheDocument()
  })

  it('"Página inicial indisponível" em "/" (variante) mantem codigo, caminho "/" e acoes', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NotFoundPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Página inicial indisponível' })).toBeInTheDocument()
    expect(screen.getByText('A raiz da aplicação não está acessível. Verifique se você está logado.')).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('/')).toBeInTheDocument()
    expect(screen.getByTestId('not-found-home')).toHaveTextContent('Voltar para o painel')
    expect(screen.getByTestId('not-found-news')).toHaveTextContent('Ver últimas notícias')
  })

  it('as 2 acoes ficam agrupadas: primario "Voltar para o painel" e secundario "Ver últimas notícias"', () => {
    const { container } = renderPage()
    const actions = container.querySelector('.auth-state__actions')
    const links = [...actions.querySelectorAll('a')]
    expect(links.map((link) => link.textContent)).toEqual(['Voltar para o painel', 'Ver últimas notícias'])
    expect(links[0]).toHaveClass('primary-button')
    expect(links[1]).toHaveClass('ghost-button', 'ghost-button--secondary')
  })

  it('ordem do DOM: titulo, detalhes, acoes e dica (o "404" sobe por CSS)', () => {
    const { container } = renderPage()
    const card = container.querySelector('[data-testid="not-found-card"]')
    const classes = [...card.children].map((node) => node.className)
    expect(classes[0]).toContain('brand__eyebrow')
    expect(classes[1]).toContain('auth-state__title')
    expect(classes[2]).toContain('auth-error-details')
    expect(classes[3]).toContain('auth-state__actions')
    expect(classes[4]).toContain('field-hint')
  })
})
