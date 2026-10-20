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
import { act, render, screen, waitFor } from '@testing-library/react'
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
      expect(screen.getByText(/Instruções de redefinição enviadas/i)).toBeInTheDocument()
    })
  })
})

describe('arte do login', () => {
  it('a raiz tem auth-screen e auth-screen--login', () => {
    const { container } = renderPage()
    const root = container.firstElementChild
    expect(root).toHaveClass('auth-screen')
    expect(root).toHaveClass('auth-screen--login')
  })

  it('carta, ondas e cena do porto existem, decorativas, e a cena fica dentro de aside.auth-brand', () => {
    const { container } = renderPage()
    const chart = container.querySelector('.login-chart')
    const waves = container.querySelector('.login-waves')
    const port = container.querySelector('.login-port-scene')
    expect(chart).not.toBeNull()
    expect(waves).not.toBeNull()
    expect(port).not.toBeNull()
    expect(chart).toHaveAttribute('aria-hidden', 'true')
    expect(waves).toHaveAttribute('aria-hidden', 'true')
    expect(port).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('aside.auth-brand .login-port-scene')).not.toBeNull()
  })

  it('todo svg da arte tem focusable="false"', () => {
    const { container } = renderPage()
    const svgs = [
      ...container.querySelectorAll('.login-chart svg'),
      ...container.querySelectorAll('.login-waves svg'),
      container.querySelector('svg.login-port-scene'),
    ]
    expect(svgs.length).toBeGreaterThan(3)
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute('focusable', 'false')
    })
  })

  it('nao duplica h1 nem logo na arvore (cabecalho mobile = o proprio aside)', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1, name: 'Portal COMEX' })).toHaveLength(1)
    expect(screen.getAllByAltText('SQ Química')).toHaveLength(1)
  })

  it('o eyebrow do card continua no DOM', () => {
    const { container } = renderPage()
    const eyebrow = container.querySelector('.auth-panel .brand__eyebrow')
    expect(eyebrow).not.toBeNull()
    expect(eyebrow).toHaveTextContent('Portal COMEX')
  })

  it('coordenadas da carta ficam dentro de .login-chart e sao decorativas', () => {
    const { container } = renderPage()
    ;['46°40′W', '24°05′S'].forEach((label) => {
      const el = screen.getByText(label)
      expect(container.querySelector('.login-chart')).toContainElement(el)
      expect(el.closest('[aria-hidden="true"]')).not.toBeNull()
    })
  })

  it('renderiza os 3 navios da carta', () => {
    const { container } = renderPage()
    expect(container.querySelector('.login-chart__ship--out')).not.toBeNull()
    expect(container.querySelector('.login-chart__ship--back')).not.toBeNull()
    expect(container.querySelector('.login-chart__ship--far')).not.toBeNull()
  })
})

// Refino F5b (Login.dc.html): >= 1041px o campo de senha ganha a linha do rotulo (com
// "Esqueci minha senha") e o botao mostrar/ocultar; tablet/mobile ficam com o campo legado.
// Os testes acima rodam sem matchMedia casando (= legado); aqui o desktop e forcado.
const originalMatchMedia = window.matchMedia

function stubDesktop(matches = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('LoginPage - desktop (>= 1041px)', () => {
  beforeEach(() => stubDesktop(true))
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('"Esqueci minha senha" fica na linha do rotulo "Senha" e o rotulo e associado ao campo', () => {
    const { container } = renderPage()
    const row = container.querySelector('.auth-field__row')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('Senha')
    expect(row).toContainElement(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(screen.getByLabelText('Senha')).toBe(screen.getByPlaceholderText('Sua senha'))
    expect(container.querySelector('.auth-actions')).toBeNull()
  })

  it('botao mostrar/ocultar senha: aria-label, aria-pressed e tipo do campo alternam', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByPlaceholderText('Sua senha')
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(input).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('type', 'button')
    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    const hide = screen.getByRole('button', { name: 'Ocultar senha' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    await user.click(hide)
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('o botao do olho nao e o botao primario nem dispara o envio', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(auth.login).not.toHaveBeenCalled()
    expect(document.querySelector('button.primary-button')).toHaveTextContent('Entrar')
  })

  it('submit continua chamando login(email, senha) com a senha visivel', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123')
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    await user.click(document.querySelector('button.primary-button'))
    await waitFor(() => {
      expect(auth.login).toHaveBeenCalledWith('maria@sqquimica.com', 'senha123')
    })
  })

  it('redefinir senha continua: painel, e-mail e requestPasswordReset', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    expect(screen.queryByText('Redefinir senha')).not.toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(screen.getByText('Redefinir senha')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Enviar link de redefini/i }))
    await waitFor(() => {
      expect(auth.requestPasswordReset).toHaveBeenCalledWith('maria@sqquimica.com')
    })
  })

  it('cadastro: sem "Esqueci minha senha", com o olho, o campo Nome e register({name,email,password})', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Nome completo'), 'Maria Souza')
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => {
      expect(auth.register).toHaveBeenCalledWith({ name: 'Maria Souza', email: 'maria@sqquimica.com', password: 'senha123' })
    })
  })

  it('erro de autenticacao aparece no banner (campo de senha do desktop)', async () => {
    const user = userEvent.setup()
    const auth = defaultAuth()
    auth.login = vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' })
    mockUseAuth.mockReturnValue(auth)
    renderPage()
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'a@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'p')
    await user.click(document.querySelector('button.primary-button'))
    await waitFor(() => {
      expect(screen.getByText(/auth\/invalid-credential/)).toBeInTheDocument()
    })
  })
})

describe('LoginPage - troca ao vivo em 1041px (review r1)', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('o e-mail e a senha digitados sobrevivem a troca legado <-> desktop (estado no pai)', async () => {
    const user = userEvent.setup()
    let listener = null
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event, handler) => {
        listener = handler
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { container } = renderPage()
    expect(container.querySelector('.auth-password')).toBeNull()
    await user.type(screen.getByPlaceholderText('nome@sqquimica.com'), 'maria@sqquimica.com')
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123')
    expect(listener).toBeTypeOf('function')

    act(() => listener({ matches: true }))
    expect(container.querySelector('.auth-password')).not.toBeNull()
    expect(screen.getByPlaceholderText('nome@sqquimica.com')).toHaveValue('maria@sqquimica.com')
    expect(screen.getByPlaceholderText('Sua senha')).toHaveValue('senha123')

    act(() => listener({ matches: false }))
    expect(container.querySelector('.auth-password')).toBeNull()
    expect(screen.getByPlaceholderText('nome@sqquimica.com')).toHaveValue('maria@sqquimica.com')
    expect(screen.getByPlaceholderText('Sua senha')).toHaveValue('senha123')
  })

  it('o segmentado Entrar/Cadastrar e um grupo com nome acessivel', () => {
    renderPage()
    const group = screen.getByRole('group', { name: 'Modo de acesso' })
    expect(group).toHaveClass('auth-toggle')
    expect(group.querySelectorAll('button')).toHaveLength(2)
  })
})

describe('LoginPage - tablet/mobile (< 1041px) mantem o campo legado', () => {
  it('sem linha do rotulo nem botao do olho; "Esqueci minha senha" na linha propria', () => {
    const { container } = renderPage()
    expect(container.querySelector('.auth-field__row')).toBeNull()
    expect(container.querySelector('.auth-password')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mostrar senha' })).not.toBeInTheDocument()
    expect(container.querySelector('.auth-actions .auth-link-button')).toHaveTextContent('Esqueci minha senha')
    expect(container.querySelector('label.field input[type="password"]')).not.toBeNull()
  })
})

describe('LoginPage - painel da marca e assinatura (F5b)', () => {
  it('o painel comeca pela marca do produto (COMEX, tom escuro, 56) e o h1 continua unico', () => {
    const { container } = renderPage()
    const head = container.querySelector('aside.auth-brand .auth-brand__head')
    expect(head).not.toBeNull()
    const mark = head.querySelector('svg.brand-mark')
    expect(mark).toHaveClass('brand-mark--comex', 'brand-mark--dark', 'auth-brand__mark')
    expect(mark).toHaveAttribute('width', '56')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
    expect(head.firstElementChild).toBe(mark)
    expect(head.querySelector('h1')).toHaveTextContent('Portal COMEX')
    expect(head.querySelector('p')).toHaveTextContent('Acompanhe chegadas, comunicados')
  })

  it('o PNG e o eyebrow do painel continuam no DOM (cabecalho mobile) e a assinatura nao usa alt', () => {
    const { container } = renderPage()
    expect(container.querySelector('.auth-brand__logo img')).toHaveAttribute('alt', 'SQ Química')
    expect(container.querySelector('.auth-brand__eyebrow')).toHaveTextContent('SQ Química · Suite COMEX')
    const signature = container.querySelector('.auth-sq-signature')
    expect(signature).not.toBeNull()
    const logo = signature.querySelector('.sq-logo')
    expect(logo).toHaveClass('sq-logo--minusc', 'sq-logo--light')
    expect(logo).toHaveAttribute('role', 'img')
    expect(logo).toHaveAttribute('aria-label', 'SQ Química')
    expect(signature.querySelector('img')).toBeNull()
    expect(logo.querySelector('svg')).toHaveAttribute('width', '36')
    expect(container.querySelector('.auth-screen--login').lastElementChild).toBe(signature)
  })

  it('as 2 features do mock com os icones do mock', () => {
    const { container } = renderPage()
    const feats = container.querySelectorAll('.auth-brand__feat')
    expect(feats).toHaveLength(2)
    expect(feats[0]).toHaveTextContent('Fila de chegadas')
    expect(feats[1]).toHaveTextContent('Notificações e comunicados')
    expect(feats[0].querySelector('path')).toHaveAttribute('d', 'M3 17h18l-2 3H5zM5 17V9h14v8M9 9V5h6v4')
    expect(feats[1].querySelector('path')).toHaveAttribute('d', 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4')
  })

  it('D16: so 4 latitudes (23°50′S ... 24°05′S) nas posicoes y = 144 + 180·k', () => {
    const { container } = renderPage()
    const labels = [...container.querySelectorAll('.login-chart__lat text')]
    expect(labels.map((node) => node.textContent)).toEqual(['23°50′S', '23°55′S', '24°00′S', '24°05′S'])
    expect(labels.map((node) => node.getAttribute('y'))).toEqual(['144', '324', '504', '684'])
    expect(screen.queryByText('24°10′S')).not.toBeInTheDocument()
    expect(screen.queryByText('24°25′S')).not.toBeInTheDocument()
  })

  it('D20: o paragrafo "Use sua conta corporativa" so e escondido (por CSS) no modo login; o cadastro o mostra', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    const lead = container.querySelector('.auth-card__lead')
    expect(lead).toHaveClass('auth-card__lead--login')
    expect(lead).toHaveTextContent('Use sua conta corporativa @sqquimica.com')
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    expect(container.querySelector('.auth-card__lead')).not.toHaveClass('auth-card__lead--login')
    expect(container.querySelector('.auth-card__lead')).toHaveTextContent('Cadastro permitido apenas para e-mails @sqquimica.com')
  })

  it('rodape "Acesso restrito" e o segmentado expoem o estado (aria-pressed)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    expect(container.querySelector('.auth-card__legal')).toHaveTextContent('Acesso restrito a colaboradores e parceiros da SQ Química.')
    const [entrar, cadastrar] = container.querySelectorAll('.auth-toggle__item')
    expect(entrar).toHaveAttribute('aria-pressed', 'true')
    expect(cadastrar).toHaveAttribute('aria-pressed', 'false')
    await user.click(cadastrar)
    expect(entrar).toHaveAttribute('aria-pressed', 'false')
    expect(cadastrar).toHaveAttribute('aria-pressed', 'true')
  })
})
