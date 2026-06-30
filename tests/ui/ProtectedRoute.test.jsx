// Tests do ProtectedRoute.
// Cobre: loading, nao autenticado, sem acesso (email nao verificado
// ou status Pendente/Bloqueado/Reprovado), sem role necessario, com role
// necessario, sem o role necessario.
//
// Estrategia: mockamos APENAS o useAuth (que e' a dependencia externa).
// ProtectedRoute importa Navigate e useLocation do react-router-dom.
// Como o jsdom nao tem history, usamos MemoryRouter para fornecer o
// contexto de routing. O Navigate renderiza normalmente (apesar de nao
// conseguir navegar de fato); testamos via screen.getByText/NotFound.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import React from 'react'

// Mock do hook useAuth.
const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

import ProtectedRoute from '../../src/components/ProtectedRoute'

// Captura a location atual para que os testes possam inspecionar o state
// passado para Navigate (que nao navega de fato no jsdom).
let lastLocation = null
function LocationCapture() {
  const loc = useLocation()
  lastLocation = loc
  return <div data-testid="current-location">{loc.pathname}</div>
}

function renderAt(initialEntries = ['/protected']) {
  lastLocation = null
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationCapture />
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">Conteudo protegido</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/protected-admin"
          element={
            <ProtectedRoute requireRole="admin">
              <div data-testid="admin-content">Admin only</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/verificar-email" element={<div data-testid="verify-page">Verificar</div>} />
        <Route path="/aguardando-aprovacao" element={<div data-testid="pending-page">Pendente</div>} />
        <Route path="/" element={<div data-testid="home-page">Home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  // defaults saudaveis: usuario admin Ativo autenticado.
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    hasAccess: true,
    isEmailVerified: true,
    loading: false,
    profile: { role: 'admin', status: 'Ativo' },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProtectedRoute', () => {
  it('renderiza children quando autenticado e com acesso', async () => {
    renderAt()
    await waitFor(() =>
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    )
  })

  it('mostra tela de loading enquanto loading=true', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      hasAccess: false,
      isEmailVerified: false,
      loading: true,
      profile: null,
    })
    renderAt()
    await waitFor(() =>
      expect(screen.getByText(/Carregando sessão/i)).toBeInTheDocument()
    )
  })

  it('redireciona para /login quando nao autenticado', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      hasAccess: false,
      isEmailVerified: false,
      loading: false,
      profile: null,
    })
    renderAt(['/protected'])
    await waitFor(() =>
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    )
    // location.state.from tem o path original.
    expect(lastLocation.state.from.pathname).toBe('/protected')
  })

  it('redireciona para /verificar-email quando email nao verificado', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: false,
      loading: false,
      profile: { role: 'user', status: 'Ativo' },
    })
    renderAt()
    await waitFor(() =>
      expect(screen.getByTestId('verify-page')).toBeInTheDocument()
    )
  })

  it('redireciona para /aguardando-aprovacao quando status nao Ativo', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: false,
      isEmailVerified: true,
      loading: false,
      profile: { role: 'user', status: 'Pendente' },
    })
    renderAt()
    await waitFor(() =>
      expect(screen.getByTestId('pending-page')).toBeInTheDocument()
    )
  })

  it('renderiza children quando role bate com requireRole', async () => {
    renderAt(['/protected-admin'])
    await waitFor(() =>
      expect(screen.getByTestId('admin-content')).toBeInTheDocument()
    )
  })

  it('redireciona para / quando role NAO bate com requireRole', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      hasAccess: true,
      isEmailVerified: true,
      loading: false,
      profile: { role: 'user', status: 'Ativo' },
    })
    renderAt(['/protected-admin'])
    await waitFor(() =>
      expect(screen.getByTestId('home-page')).toBeInTheDocument()
    )
  })
})
