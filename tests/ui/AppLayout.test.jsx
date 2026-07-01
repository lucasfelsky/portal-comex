// Tests do AppLayout focados no IntelliQuote admin-only (Sprint 15.8).
// Cobre:
//   - Admin: renderiza link IntelliQuote na sidebar + item no command palette (sobe Ctrl+K)
//   - User: NAO renderiza link IntelliQuote na sidebar + NAO renderiza item no command palette
//   - Logistica: NAO renderiza link IntelliQuote na sidebar
//   - Link do sidebar aponta para INTELLIQUOTE_WEB_URL (default), target=_blank, rel=noopener noreferrer
//   - Link do sidebar tem aria-label
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))

vi.mock('../../src/services/notificationsRepository', () => ({
  NOTIFICATIONS_CHANGED_EVENT: 'notifications:changed',
  listNotifications: vi.fn(async () => []),
  markAllNotificationsAsRead: vi.fn(async () => {}),
  markNotificationAsRead: vi.fn(async () => {}),
}))

vi.mock('../../src/services/exchangeRatesRepository', () => ({
  getDailyPtaxRates: vi.fn(async () => null),
}))

import AppLayout from '../../src/components/AppLayout.jsx'

function renderWithRole(role) {
  mockUseAuth.mockReturnValue({
    profile: role
      ? { uid: `${role}-1`, name: `${role} User`, email: `${role}@sq.com`, role }
      : null,
    logout: vi.fn(),
    isEmailVerified: true,
  })

  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Route>
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

describe('AppLayout (IntelliQuote admin-only)', () => {
  it('admin: renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('admin')
    const link = screen.getByLabelText(/Abrir IntelliQuote em nova aba/i)
    expect(link).toBeInTheDocument()
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('admin: link IntelliQuote usa o VITE_INTELLIQUOTE_WEB_URL padrao', () => {
    renderWithRole('admin')
    const link = screen.getByLabelText(/Abrir IntelliQuote em nova aba/i)
    expect(link.getAttribute('href')).toBe('https://intelliquote.portal-comex.com')
  })

  it('user: NAO renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('user')
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('logistica: NAO renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('logistica')
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('compras: NAO renderiza link IntelliQuote na sidebar', () => {
    renderWithRole('compras')
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('unauthenticated: NAO renderiza link IntelliQuote', () => {
    renderWithRole(null)
    expect(screen.queryByLabelText(/Abrir IntelliQuote em nova aba/i)).toBeNull()
  })

  it('admin: command palette inclui IntelliQuote', async () => {
    renderWithRole('admin')

    act(() => {
      fireKeyDown('k', { ctrlKey: true })
    })

    const items = await screen.findAllByText(/IntelliQuote/i)
    // Sidebar link (sempre visivel) + command palette item (sobe Ctrl+K) = 2
    expect(items.length).toBeGreaterThanOrEqual(2)
  })

  it('user: command palette NAO inclui IntelliQuote', async () => {
    renderWithRole('user')

    act(() => {
      fireKeyDown('k', { ctrlKey: true })
    })

    // Achar pelo menos um item "Dashboard" confirma que a palette abriu
    await screen.findAllByText(/Dashboard/i)
    // IntelliQuote nao deve aparecer (sidebar nem command palette)
    expect(screen.queryAllByText(/IntelliQuote/i)).toHaveLength(0)
  })
})

function fireKeyDown(key, init = {}) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, ...init, bubbles: true, cancelable: true })
  )
}
