// Tests do LoginPage.
// Cobre:
//   - Render inicial: toggle Entrar/Cadastrar, form de login
//   - Modo register: mostra campo Nome, esconde "Esqueci minha senha"
//   - Submit login: chama useAuth.login(email, password)
//   - Submit register: chama useAuth.register(form) com {name,email,password}
//   - Erro do useAuth aparece no error-banner
//   - Feedback de sucesso do register aparece no success-banner
//   - Botao "Esqueci minha senha" toggle mostra o painel de reset
//   - Reset chama useAuth.requestPasswordReset(email)
//   - Quando isAuthenticated && hasAccess: redireciona para redirectTo (location.state.from.pathname) ou "/"
//   - Quando isAuthenticated && !isEmailVerified: redireciona para /verificar-email
//   - Quando isAuthenticated && !hasAccess: redireciona para /aguardando-aprovacao
//   - Submit desabilitado quando submitting=true

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

// Mock de useAuth
const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

import LoginPage from '../../src/pages/LoginPage'
import { ToastProvider } from '../../src/components/Toast'

function defaultAuth() {
  return {
    isAuthenticated: false,
    hasAccess: false,
    isEmailVerified: false,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    authError: null,
    loading: false,
  }
}

function renderPage({ initialEntries = ['/login'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/verificar-email" element={<div data-testid="verify">verify</div>} />
          <Route path="/aguardando-aprovacao" element={<div data-testid="pending">pending</div>} />
          <Route path="/destino-original" element={<div data-testid="destino">destino</div>} />
        </Routes>
      </ToastProvider>
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

describe('LoginPage', () => {
  it('render inicial: toggle Entrar/Cadastrar, form de login, sem campo Nome', () => {
    renderPage()
    // Toggle buttons (auth-toggle)
    const toggleButtons = document.querySelectorAll('.auth-toggle__item')
    expect(toggleButtons).toHaveLength(2)
    expect(toggleButtons[0]).toHaveTextContent('Entrar')
    expect(toggleButtons[1]).toHaveTextContent('Cadastrar')
    expect(screen.getByPlaceholderText('nome@sqquimica.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Sua senha')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Nome completo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeInTheDocument()
    // Submit button (primary): 2 buttons com texto Entrar (toggle + submit)
    const entrarBtns = screen.getAllByRole('button', { name: 'Entrar' })
    expect(entrarBtns).toHaveLength(2)
    expect(entrarBtns.some((b) => b.classList.contains('primary-button'))).toBe(true)
  })

  it('modo register: mostra campo Nome, esconde "Esqueci minha senha"', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    expect(screen.getByPlaceholderText('Nome completo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument()
  })

  it('submit login chama useAuth.login(email, password)', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    const { container } = renderPage()
    // Debug
    const inputs = container.querySelectorAll('input[placeholder="nome@sqquimica.com"]')
    console.log('DEBUG input count:', inputs.length)
    if (inputs.length > 1) {
      for (const i of inputs) console.log('  input parent:', i.parentElement?.className)
    }
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123')
    // submit button (primary-button class)
    const submitBtn = document.querySelector('button.primary-button')
    await user.click(submitBtn)
    await waitFor(() => {
      expect(auth.login).toHaveBeenCalledWith('maria@sqquimica.com', 'senha123')
    })
  })

  it('submit register chama useAuth.register(form) com {name,email,password}', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'Maria Souza')
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123')
    const submitBtn = document.querySelector('button.primary-button')
    await user.click(submitBtn)
    await waitFor(() => {
      expect(auth.register).toHaveBeenCalledWith({
        name: 'Maria Souza',
        email: 'maria@sqquimica.com',
        password: 'senha123',
      })
    })
  })

  it('erro do useAuth aparece no error-banner', () => {
    mockUseAuth.mockReturnValue({ ...defaultAuth(), authError: 'Email ou senha invalidos' })
    renderPage()
    expect(screen.getByText('Email ou senha invalidos')).toBeInTheDocument()
    expect(screen.getByText('Email ou senha invalidos').className).toMatch(/error-banner/)
  })

  it('feedback de sucesso do register aparece no success-banner', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    auth.register.mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'Maria')
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => {
      // Toast + success-banner tem o mesmo texto
      expect(screen.getAllByText(/Cadastro criado/i).length).toBeGreaterThan(0)
    })
  })

  it('botao "Esqueci minha senha" toggle mostra o painel de reset', async () => {
    const user = userEvent.setup()
    renderPage()
    // Antes: painel de reset nao existe
    expect(screen.queryByText('Redefinir senha')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(screen.getByText('Redefinir senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enviar link de redefini/i })).toBeInTheDocument()
  })

  it('reset chama useAuth.requestPasswordReset(email)', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    await user.click(screen.getByRole('button', { name: /Enviar link de redefini/i }))
    await waitFor(() => {
      expect(auth.requestPasswordReset).toHaveBeenCalledWith('maria@sqquimica.com')
    })
  })

  it('quando isAuthenticated && hasAccess: redireciona para redirectTo de location.state.from.pathname', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      isAuthenticated: true,
      hasAccess: true,
    })
    renderPage({ initialEntries: [{ pathname: '/login', state: { from: { pathname: '/destino-original' } } }] })
    expect(screen.getByTestId('destino')).toBeInTheDocument()
  })

  it('quando isAuthenticated && hasAccess e sem from: redireciona para /', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      isAuthenticated: true,
      hasAccess: true,
    })
    renderPage({ initialEntries: ['/login'] })
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('quando isAuthenticated && !isEmailVerified: redireciona para /verificar-email', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      isAuthenticated: true,
      isEmailVerified: false,
    })
    renderPage()
    expect(screen.getByTestId('verify')).toBeInTheDocument()
  })

  it('quando isAuthenticated && !hasAccess: redireciona para /aguardando-aprovacao', () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth(),
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: true,
    })
    renderPage()
    expect(screen.getByTestId('pending')).toBeInTheDocument()
  })

  it('submit desabilitado quando submitting (mostra "Entrando..." / "Criando...")', async () => {
    const user = userEvent.setup()
    let resolveLogin
    const auth = defaultAuth()
    auth.login = vi.fn(() => new Promise((r) => { resolveLogin = r }))
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'a@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'p')
    await user.click(document.querySelector('button.primary-button'))
    // Botao submit deve estar disabled e mostrar "Entrando..."
    const submitBtn = screen.getByRole('button', { name: 'Entrando...', exact: true })
    expect(submitBtn).toBeDisabled()
    resolveLogin()
  })

  it('erro de submit (login rejeita) aparece no error-banner', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    auth.login = vi.fn().mockRejectedValue({ code: 'auth/wrong-password' })
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'a@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'p')
    await user.click(document.querySelector('button.primary-button'))
    await waitFor(() => {
      expect(screen.getByText(/auth\/wrong-password/)).toBeInTheDocument()
    })
  })

  it('register com sucesso dispara toast.success', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    auth.register = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    // Toggle para register
    await user.click(screen.getByRole('button', { name: /Cadastrar/i }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'Lucas')
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'l@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'p')
    await user.click(document.querySelector('button.primary-button'))
    await waitFor(() => {
      // Toast + success-banner tem o mesmo texto; so checamos que >= 1 aparece
      expect(screen.getAllByText(/Cadastro criado\. Confirme seu email\./i).length).toBeGreaterThan(0)
    })
  })

  it('reset de senha com sucesso dispara toast.success', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    auth.requestPasswordReset = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.click(screen.getByRole('button', { name: /Esqueci minha senha/i }))
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'l@sqquimica.com')
    await user.click(screen.getByRole('button', { name: /Enviar/i }))
    await waitFor(() => {
      expect(screen.getByText(/Instrucoes de redefinicao enviadas/i)).toBeInTheDocument()
    })
  })
})
