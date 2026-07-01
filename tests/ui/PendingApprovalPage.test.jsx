// Tests do PendingApprovalPage.
// Cobre:
//   - !isAuthenticated: redireciona para /login
//   - hasAccess=true: redireciona para /
//   - status=Pendente: "Acesso pendente" + "Confirme primeiro o email..."
//   - status=Pendente + isEmailVerified=true: "Seu email ja foi verificado..."
//   - status=Reprovado: "Acesso reprovado" + "Seu cadastro foi reprovado..."
//   - status=Bloqueado: "Acesso bloqueado" + "Seu acesso foi bloqueado..."
//   - Status atual exibido no success-banner
//   - Email do profile exibido no texto
//   - Botao Sair chama logout

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

import PendingApprovalPage from '../../src/pages/PendingApprovalPage'

function renderPage({ initialEntries = ['/aguardando-aprovacao'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/aguardando-aprovacao" element={<PendingApprovalPage />} />
        <Route path="/login" element={<div data-testid="login">login</div>} />
        <Route path="/" element={<div data-testid="home">home</div>} />
        <Route path="/verificar-email" element={<div data-testid="verify">verify</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PendingApprovalPage', () => {
  it('nao autenticado: redireciona para /login', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      hasAccess: false,
      isEmailVerified: false,
      profile: null,
      logout: vi.fn(),
    })
    renderPage()
    expect(screen.getByTestId('login')).toBeInTheDocument()
  })

  it('hasAccess=true: redireciona para /', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: true,
      isEmailVerified: true,
      profile: { email: 'admin@sqquimica.com', status: 'Ativo' },
      logout: vi.fn(),
    })
    renderPage()
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('status=Pendente + sem verificacao: heading "Acesso pendente" + texto de confirmar email', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: false,
      profile: { email: 'joao@sqquimica.com', status: 'Pendente' },
      logout: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Acesso pendente')).toBeInTheDocument()
    expect(screen.getByText(/Confirme primeiro o email/i)).toBeInTheDocument()
    expect(screen.getByText('joao@sqquimica.com')).toBeInTheDocument()
    expect(screen.getByText(/Status atual: Pendente/i)).toBeInTheDocument()
  })

  it('status=Pendente + email verificado: texto "email ja foi verificado"', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: true,
      profile: { email: 'joao@sqquimica.com', status: 'Pendente' },
      logout: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Acesso pendente')).toBeInTheDocument()
    expect(screen.getByText(/Seu email ja foi verificado/i)).toBeInTheDocument()
  })

  it('status=Reprovado: heading "Acesso reprovado" + texto de reprovacao', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: true,
      profile: { email: 'joao@sqquimica.com', status: 'Reprovado' },
      logout: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Acesso reprovado')).toBeInTheDocument()
    expect(screen.getByText(/Seu cadastro foi reprovado/i)).toBeInTheDocument()
    expect(screen.getByText(/Status atual: Reprovado/i)).toBeInTheDocument()
  })

  it('status=Bloqueado: heading "Acesso bloqueado" + texto de bloqueio', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: true,
      profile: { email: 'joao@sqquimica.com', status: 'Bloqueado' },
      logout: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Acesso bloqueado')).toBeInTheDocument()
    expect(screen.getByText(/Seu acesso foi bloqueado/i)).toBeInTheDocument()
    expect(screen.getByText(/Status atual: Bloqueado/i)).toBeInTheDocument()
  })

  it('profile sem status: usa "Pendente" como fallback', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: false,
      profile: { email: 'novo@sqquimica.com' }, // sem status
      logout: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Acesso pendente')).toBeInTheDocument()
    expect(screen.getByText(/Status atual: Pendente/i)).toBeInTheDocument()
  })

  it('botao Sair chama logout', async () => {
    const logout = vi.fn()
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: false,
      profile: { email: 'joao@sqquimica.com', status: 'Pendente' },
      logout,
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1)
    })
  })
})
