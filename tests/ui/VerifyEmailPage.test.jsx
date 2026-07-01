// Tests do VerifyEmailPage.
// Cobre:
//   - loading=true: mostra "Validando confirmacao"
//   - isAuthenticated && hasAccess && isEmailVerified: redireciona para /
//   - Sem oobCode e isAuthenticated: mostra botoes Reenviar / Ja confirmei / Sair
//   - Com oobCode: chama confirmEmailVerification no mount
//   - Com oobCode e sucesso: success-banner "Email confirmado com sucesso..."
//   - Com oobCode e erro: error-banner com code
//   - handleResendEmail: chama resendVerificationEmail; feedback sucesso
//   - handleResendEmail com erro: error-banner
//   - handleRefreshStatus com emailVerified=true + hasAccess=true: feedback "ja esta regularizada"
//   - handleRefreshStatus com emailVerified=true + hasAccess=false: feedback "aguarde a aprovacao"
//   - handleRefreshStatus com emailVerified=false: feedback "ainda nao localizamos"
//   - handleRefreshStatus com erro: error-banner
//   - Submit desabilitado quando submitting=true
//   - Botao Sair chama logout
//   - Sem isAuthenticated: mostra link "Voltar ao login" (sem botoes de acao)
//   - isAuthenticated + hasAccess: texto "acesso ja esta liberado, mas falta confirmar email"

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

import VerifyEmailPage from '../../src/pages/VerifyEmailPage'

function defaultAuth() {
  return {
    isAuthenticated: true,
    hasAccess: false,
    isEmailVerified: false,
    loading: false,
    user: { email: 'joao@sqquimica.com' },
    logout: vi.fn(),
    resendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    refreshAuthenticatedUser: vi.fn().mockResolvedValue({ emailVerified: true }),
    confirmEmailVerification: vi.fn().mockResolvedValue(undefined),
  }
}

function renderPage({ initialEntries = ['/verificar-email'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/verificar-email" element={<VerifyEmailPage />} />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockUseAuth.mockReturnValue(defaultAuth())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('VerifyEmailPage', () => {
  it('loading=true: mostra "Validando confirmacao"', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), loading: true })
    renderPage()
    expect(screen.getByText(/Validando confirmacao/i)).toBeInTheDocument()
  })

  it('isAuthenticated && hasAccess && isEmailVerified: redireciona para /', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      hasAccess: true,
      isEmailVerified: true,
    })
    renderPage()
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('isAuthenticated + hasAccess (sem verificado): texto "acesso liberado, falta confirmar email"', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      hasAccess: true,
      isEmailVerified: false,
    })
    renderPage()
    expect(screen.getByText(/acesso ja esta liberado/i)).toBeInTheDocument()
    expect(screen.getByText(/conclua a confirmacao do email corporativo/i)).toBeInTheDocument()
  })

  it('isAuthenticated + sem hasAccess: texto "Confirme o endereco"', () => {
    renderPage()
    expect(screen.getByText(/Confirme o endereco joao@sqquimica.com/i)).toBeInTheDocument()
  })

  it('sem isAuthenticated: mostra link "Voltar ao login" (sem botoes de acao)', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), isAuthenticated: false })
    renderPage()
    expect(screen.getByText(/Voltar ao login/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ja confirmei/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reenviar/i })).not.toBeInTheDocument()
  })

  it('com oobCode: chama confirmEmailVerification no mount + success-banner', async () => {
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    renderPage({ initialEntries: ['/verificar-email?oobCode=abc123'] })
    await waitFor(() => {
      expect(auth.confirmEmailVerification).toHaveBeenCalledWith('abc123')
    })
    expect(await screen.findByText(/Email confirmado com sucesso/i)).toBeInTheDocument()
  })

  it('com oobCode e erro: error-banner com code', async () => {
    const auth = defaultAuth()
    auth.confirmEmailVerification = vi.fn().mockRejectedValue({ code: 'auth/invalid-action-code' })
    mockUseAuth.mockReturnValue(auth)
    renderPage({ initialEntries: ['/verificar-email?oobCode=bad'] })
    await waitFor(() => {
      expect(screen.getByText(/auth\/invalid-action-code/)).toBeInTheDocument()
    })
  })

  it('handleResendEmail: chama resendVerificationEmail + feedback sucesso', async () => {
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Reenviar email/i }))
    await waitFor(() => {
      expect(auth.resendVerificationEmail).toHaveBeenCalled()
    })
    expect(screen.getByText(/Enviamos um novo email/i)).toBeInTheDocument()
  })

  it('handleResendEmail com erro: error-banner', async () => {
    const auth = defaultAuth()
    auth.resendVerificationEmail = vi.fn().mockRejectedValue({ code: 'auth/too-many-requests' })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Reenviar email/i }))
    await waitFor(() => {
      expect(screen.getByText(/too-many-requests/)).toBeInTheDocument()
    })
  })

  it('handleRefreshStatus com emailVerified=true + hasAccess=true: feedback "ja regularizada"', async () => {
    const auth = defaultAuth()
    auth.hasAccess = true
    auth.refreshAuthenticatedUser = vi.fn().mockResolvedValue({ emailVerified: true })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Ja confirmei/i }))
    await waitFor(() => {
      expect(auth.refreshAuthenticatedUser).toHaveBeenCalled()
    })
    expect(screen.getByText(/Sua conta ja esta regularizada/i)).toBeInTheDocument()
  })

  it('handleRefreshStatus com emailVerified=true + hasAccess=false: feedback "aguarde aprovacao"', async () => {
    const auth = defaultAuth()
    auth.refreshAuthenticatedUser = vi.fn().mockResolvedValue({ emailVerified: true })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Ja confirmei/i }))
    await waitFor(() => {
      expect(screen.getByText(/aguarde a aprovacao de um administrador/i)).toBeInTheDocument()
    })
  })

  it('handleRefreshStatus com emailVerified=false: feedback "ainda nao localizamos"', async () => {
    const auth = defaultAuth()
    auth.refreshAuthenticatedUser = vi.fn().mockResolvedValue({ emailVerified: false })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Ja confirmei/i }))
    await waitFor(() => {
      expect(screen.getByText(/Ainda nao localizamos a confirmacao/i)).toBeInTheDocument()
    })
  })

  it('handleRefreshStatus com erro: error-banner', async () => {
    const auth = defaultAuth()
    auth.refreshAuthenticatedUser = vi.fn().mockRejectedValue({ code: 'auth/network-error' })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Ja confirmei/i }))
    await waitFor(() => {
      expect(screen.getByText(/auth\/network-error/)).toBeInTheDocument()
    })
  })

  it('submit desabilitado enquanto submitting (mostra "Atualizando...")', async () => {
    const auth = defaultAuth()
    let resolveRefresh
    auth.refreshAuthenticatedUser = vi.fn(() => new Promise((r) => { resolveRefresh = r }))
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Ja confirmei/i }))
    expect(screen.getByRole('button', { name: 'Atualizando...' })).toBeDisabled()
    resolveRefresh({ emailVerified: true })
  })

  it('botao Sair chama logout', async () => {
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() => {
      expect(auth.logout).toHaveBeenCalled()
    })
  })
})
