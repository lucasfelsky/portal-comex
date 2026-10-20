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

// Diagnostico (F5b): o Firebase e as claims sao controlados por estado hoisted. Por padrao o
// Firebase nao esta configurado (sem diagnostico), como nos testes acima.
const fb = vi.hoisted(() => ({ configured: false, currentUser: null, claims: null }))
vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return fb.configured
  },
  get auth() {
    return { currentUser: fb.currentUser }
  },
}))
vi.mock('../../src/lib/claims', () => ({
  getUserClaims: (...args) => fb.claims(...args),
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
    expect(screen.getByText(/Seu email já foi verificado/i)).toBeInTheDocument()
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

// Refino F5b (AcessoEstados.dc.html): raiz propria, ladrilho por estado, "Proximo passo" no tom do
// estado, etiqueta de status e diagnostico recolhivel (so desktop; o CSS esconde o painel colapsado).
describe('PendingApprovalPage - estado de acesso (F5b)', () => {
  function authFor(status, extra = {}) {
    return {
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: true,
      profile: { email: 'joao@sqquimica.com', status },
      logout: vi.fn(),
      refreshAuthenticatedUser: vi.fn().mockResolvedValue(undefined),
      ...extra,
    }
  }

  function enableDiagnostic(result) {
    fb.configured = true
    fb.currentUser = { email: 'joao@sqquimica.com', uid: 'uid-123' }
    fb.claims = vi.fn().mockImplementation(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)))
  }

  afterEach(() => {
    fb.configured = false
    fb.currentUser = null
    fb.claims = null
  })

  it('pendente: raiz .auth-screen--pending, ladrilho de relogio (aviso), proximo passo e etiqueta em aviso', () => {
    mockUseAuth.mockReturnValue(authFor('Pendente'))
    const { container } = renderPage()
    expect(container.firstElementChild).toHaveClass('auth-screen', 'auth-screen--pending')
    const tile = container.querySelector('.auth-state__icon')
    expect(tile).toHaveClass('auth-state__icon--warn')
    expect(tile.querySelector('circle')).not.toBeNull()
    expect(container.querySelector('.auth-next-step')).toHaveClass('auth-next-step--warn')
    expect(container.querySelector('.auth-next-step strong')).toHaveTextContent('Próximo passo')
    const line = container.querySelector('.auth-status-line')
    expect(line).toHaveClass('auth-status-line--warn', 'success-banner')
    expect(line).toHaveTextContent('Status atual: Pendente')
  })

  it.each(['Reprovado', 'Bloqueado'])('%s: ladrilho de alerta, proximo passo e etiqueta em perigo', (status) => {
    mockUseAuth.mockReturnValue(authFor(status))
    const { container } = renderPage()
    expect(container.querySelector('.auth-state__icon')).toHaveClass('auth-state__icon--danger')
    expect(container.querySelector('.auth-next-step')).toHaveClass('auth-next-step--danger')
    expect(container.querySelector('.auth-status-line')).toHaveClass('auth-status-line--danger')
    expect(container.querySelector('.auth-status-line')).toHaveTextContent('Status atual: ' + status)
  })

  it('sem diagnostico (Firebase nao configurado): sem botao nem painel, o resto continua', () => {
    mockUseAuth.mockReturnValue(authFor('Pendente'))
    const { container } = renderPage()
    expect(screen.queryByRole('button', { name: /Diagnóstico \(para o suporte\)/ })).not.toBeInTheDocument()
    expect(container.querySelector('.auth-diagnostic')).toBeNull()
    expect(screen.getByRole('button', { name: 'Forçar reload das claims' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('diagnostico: recolhido por padrao (aria-expanded=false) e abre/recolhe pelo botao', async () => {
    enableDiagnostic({ role: 'user', status: 'Pendente' })
    mockUseAuth.mockReturnValue(authFor('Pendente'))
    const user = userEvent.setup()
    const { container } = renderPage()
    const toggle = await screen.findByRole('button', { name: /Diagnóstico \(para o suporte\)/ })
    const panel = container.querySelector('#auth-diagnostic-panel')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'auth-diagnostic-panel')
    expect(panel).toHaveClass('auth-diagnostic--collapsed')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(panel).not.toHaveClass('auth-diagnostic--collapsed')
    expect(panel).toHaveTextContent('Diagnóstico (claims lidas agora)')
    expect(panel).toHaveTextContent('uid-123')
    expect(panel).toHaveTextContent('role: user')
    expect(panel).toHaveTextContent('status: Pendente')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(panel).toHaveClass('auth-diagnostic--collapsed')
  })

  it('diagnostico com falha ao ler as claims mostra a mensagem de erro no painel', async () => {
    enableDiagnostic(new Error('permission-denied'))
    mockUseAuth.mockReturnValue(authFor('Pendente'))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Diagnóstico \(para o suporte\)/ }))
    expect(screen.getByText(/Falha ao ler claims:/)).toBeInTheDocument()
    expect(screen.getByText('permission-denied')).toBeInTheDocument()
  })

  it('"Forçar reload das claims" continua chamando refreshAuthenticatedUser({ forceClaimsRefresh: true })', async () => {
    const auth = authFor('Pendente')
    mockUseAuth.mockReturnValue(auth)
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Forçar reload das claims' }))
    await waitFor(() => {
      expect(auth.refreshAuthenticatedUser).toHaveBeenCalledWith({ forceClaimsRefresh: true })
    })
  })

  it('as acoes ficam agrupadas no rodape: "Forçar reload" (secundario) e "Sair" (fantasma)', () => {
    mockUseAuth.mockReturnValue(authFor('Pendente'))
    const { container } = renderPage()
    const buttons = [...container.querySelectorAll('.auth-state__actions button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['Forçar reload das claims', 'Sair'])
    expect(buttons[0]).toHaveClass('ghost-button--secondary')
    expect(buttons[1]).not.toHaveClass('ghost-button--secondary')
  })
})
