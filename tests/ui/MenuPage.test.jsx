// Tests da tela Menu (F16.2, redesign iOS) — substitui o drawer na tab bar
// mobile. Cobre: perfil, ciclo de tema, suporte via evento, seção admin
// gateada por role, link IntelliQuote e logout.
//
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

const mockCyclePreference = vi.fn()
const mockUseTheme = vi.fn()
vi.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => mockUseTheme(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, useNavigate: () => mockNavigate }
})

import MenuPage from '../../src/pages/MenuPage.jsx'

function renderWithRole(role, { themePreference = 'auto' } = {}) {
  mockUseAuth.mockReturnValue({
    profile: { uid: `${role}-1`, name: 'Lucas Felsky', email: `${role}@sq.com`, role },
    logout: mockLogout,
  })
  mockUseTheme.mockReturnValue({
    preference: themePreference,
    setPreference: vi.fn(),
    cyclePreference: mockCyclePreference,
  })
  return render(
    <MemoryRouter>
      <MenuPage />
    </MemoryRouter>
  )
}

const mockLogout = vi.fn()

beforeEach(() => {
  mockUseAuth.mockReset()
  mockUseTheme.mockReset()
  mockCyclePreference.mockClear()
  mockNavigate.mockClear()
  mockLogout.mockClear()
})

describe('MenuPage (F16.2)', () => {
  it('mostra o perfil com iniciais, nome, email e role', () => {
    renderWithRole('admin')
    expect(screen.getByText('LF')).toBeInTheDocument()
    expect(screen.getByText('Lucas Felsky')).toBeInTheDocument()
    expect(screen.getByText(/admin@sq\.com/)).toBeInTheDocument()
  })

  it('linha de Tema mostra a preferência atual e cicla ao clicar', () => {
    renderWithRole('user', { themePreference: 'dark' })
    expect(screen.getByText('Escuro')).toBeInTheDocument()
    act(() => {
      screen.getByRole('button', { name: /tema/i }).click()
    })
    expect(mockCyclePreference).toHaveBeenCalledTimes(1)
  })

  it('linha de Suporte dispara o evento global do modal', () => {
    renderWithRole('user')
    const listener = vi.fn()
    window.addEventListener('sq-comex:open-support-modal', listener)
    act(() => {
      screen.getByRole('button', { name: /suporte/i }).click()
    })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('sq-comex:open-support-modal', listener)
  })

  it('admin vê a seção Administração e navega pro painel', () => {
    renderWithRole('admin')
    act(() => {
      screen.getByRole('button', { name: /painel administrativo/i }).click()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/admin')
  })

  it('user comum NÃO vê a seção Administração', () => {
    renderWithRole('user')
    expect(screen.queryByText(/painel administrativo/i)).not.toBeInTheDocument()
  })

  it('admin vê IntelliQuote e abre em nova aba com rel seguro', () => {
    renderWithRole('admin')
    const link = screen.getByRole('link', { name: /intelliquote/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('user comum NÃO vê IntelliQuote', () => {
    renderWithRole('user')
    expect(screen.queryByText(/intelliquote/i)).not.toBeInTheDocument()
  })

  it('Sair chama o logout', () => {
    renderWithRole('user')
    act(() => {
      screen.getByRole('button', { name: /sair/i }).click()
    })
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })
})
