// Tests do VerifyEmailPage.
// Cobre:
//   - loading=true: mostra "Validando confirmação"
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
  it('loading=true: mostra "Validando confirmação"', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), loading: true })
    renderPage()
    expect(screen.getByText(/Validando confirmação/i)).toBeInTheDocument()
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
    expect(screen.getByText(/acesso já está liberado/i)).toBeInTheDocument()
    expect(screen.getByText(/conclua a confirmação do email corporativo/i)).toBeInTheDocument()
  })

  it('isAuthenticated + sem hasAccess: texto "Confirme o endereco"', () => {
    renderPage()
    expect(screen.getByText(/Confirme o endereço joao@sqquimica.com/i)).toBeInTheDocument()
  })

  it('sem isAuthenticated: mostra link "Voltar ao login" (sem botoes de acao)', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), isAuthenticated: false })
    renderPage()
    expect(screen.getByText(/Voltar ao login/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Já confirmei/i })).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /Já confirmei/i }))
    await waitFor(() => {
      expect(auth.refreshAuthenticatedUser).toHaveBeenCalled()
    })
    expect(screen.getByText(/Sua conta já está regularizada/i)).toBeInTheDocument()
  })

  it('handleRefreshStatus com emailVerified=true + hasAccess=false: feedback "aguarde aprovacao"', async () => {
    const auth = defaultAuth()
    auth.refreshAuthenticatedUser = vi.fn().mockResolvedValue({ emailVerified: true })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Já confirmei/i }))
    await waitFor(() => {
      expect(screen.getByText(/aguarde a aprovação de um administrador/i)).toBeInTheDocument()
    })
  })

  it('handleRefreshStatus com emailVerified=false: feedback "ainda nao localizamos"', async () => {
    const auth = defaultAuth()
    auth.refreshAuthenticatedUser = vi.fn().mockResolvedValue({ emailVerified: false })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Já confirmei/i }))
    await waitFor(() => {
      expect(screen.getByText(/Ainda não localizamos a confirmação/i)).toBeInTheDocument()
    })
  })

  it('handleRefreshStatus com erro: error-banner', async () => {
    const auth = defaultAuth()
    auth.refreshAuthenticatedUser = vi.fn().mockRejectedValue({ code: 'auth/network-error' })
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Já confirmei/i }))
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
    await user.click(screen.getByRole('button', { name: /Já confirmei/i }))
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

// Refino F5b (AcessoEstados.dc.html): raiz propria, ladrilho de icone, caixa de status e acoes.
describe('VerifyEmailPage - estado de acesso (F5b)', () => {
  it('raiz .auth-screen--verify com ladrilho de e-mail (info) e titulo "Confirmação de email"', () => {
    const { container } = renderPage()
    expect(container.firstElementChild).toHaveClass('auth-screen', 'auth-screen--verify')
    const tile = container.querySelector('.auth-state__icon.auth-state__icon--info')
    expect(tile).not.toBeNull()
    expect(tile.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { level: 1, name: 'Confirmação de email' })).toBeInTheDocument()
  })

  it('o card de carregamento tambem usa a raiz .auth-screen--verify', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), loading: true })
    const { container } = renderPage()
    expect(container.firstElementChild).toHaveClass('auth-screen--verify')
    expect(screen.getByText('Validando confirmação')).toBeInTheDocument()
  })

  it('caixa de status: rotulo, "Aguardando confirmação" (logado) e o texto de orientacao de sempre', () => {
    const { container } = renderPage()
    const box = container.querySelector('.auth-status')
    expect(box).toHaveAttribute('role', 'status')
    expect(box.querySelector('strong')).toHaveTextContent('Status')
    expect(box.querySelector('.auth-status__headline')).toHaveTextContent('Aguardando confirmação')
    expect(box.querySelector('p')).toHaveTextContent('A confirmação do email é obrigatória.')
  })

  it('sem sessao: a caixa de status nao mostra o "Aguardando confirmação" e so ha "Voltar ao login"', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), isAuthenticated: false })
    const { container } = renderPage()
    expect(container.querySelector('.auth-status__headline')).toBeNull()
    expect(container.querySelector('.auth-status p')).toHaveTextContent('Se o link já foi aplicado, entre novamente para continuar.')
    const actions = container.querySelector('.auth-state__actions')
    expect(actions.querySelectorAll('a, button')).toHaveLength(1)
    expect(actions.querySelector('a')).toHaveAttribute('href', '/login')
  })

  it('as 3 acoes ficam agrupadas na ordem do mock: primario, secundario, fantasma', () => {
    const { container } = renderPage()
    const buttons = [...container.querySelectorAll('.auth-state__actions button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['Já confirmei meu email', 'Reenviar email de confirmação', 'Sair'])
    expect(buttons[0]).toHaveClass('primary-button')
    expect(buttons[1]).toHaveClass('ghost-button', 'ghost-button--secondary')
    expect(buttons[2]).toHaveClass('ghost-button')
    expect(buttons[2]).not.toHaveClass('ghost-button--secondary')
  })
})
