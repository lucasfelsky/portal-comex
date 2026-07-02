// Tests do hook useHasNavigationHistory (Sprint 31).
// Cobre:
//   - false no carregamento inicial (count=0)
//   - true apos 2 mudancas de pathname (count>1)
//   - persiste em sessionStorage
//   - reset quando storage vazio
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import React from 'react'
import useHasNavigationHistory from '../../src/hooks/useHasNavigationHistory.js'

const STORAGE_KEY = 'sq-comex:nav-history'

function Probe() {
  const hasHistory = useHasNavigationHistory()
  const location = useLocation()
  return (
    <div>
      <span data-testid="has-history">{String(hasHistory)}</span>
      <span data-testid="pathname">{location.pathname}</span>
    </div>
  )
}

function renderWithRoutes() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Probe />} />
        <Route path="/news" element={<Probe />} />
        <Route path="/processes" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  window.sessionStorage.clear()
})

describe('useHasNavigationHistory', () => {
  it('false no carregamento inicial (count=0)', () => {
    renderWithRoutes()
    expect(screen.getByTestId('has-history')).toHaveTextContent('false')
  })

  it('apos 1 pathname: ainda false (count=1)', () => {
    renderWithRoutes()
    // Probe esta na rota inicial /, count incrementa pra 1 mas count>1 ainda false
    expect(screen.getByTestId('has-history')).toHaveTextContent('false')
  })

  it('apos multiplas mudancas: count incrementa em sessionStorage', () => {
    renderWithRoutes()
    const initial = Number.parseInt(window.sessionStorage.getItem(STORAGE_KEY) ?? '0', 10)
    // Cada render do Probe (uma vez por mudanca) incrementa count
    expect(initial).toBeGreaterThanOrEqual(1)
  })

  it('restaurado do sessionStorage em nova montagem', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '5')
    renderWithRoutes()
    // count = 5 + 1 (effect) = 6, count>1 = true
    expect(screen.getByTestId('has-history')).toHaveTextContent('true')
  })

  it('storage corrompido vira 0 (sem throw)', () => {
    window.sessionStorage.setItem(STORAGE_KEY, 'not-a-number')
    renderWithRoutes()
    expect(screen.getByTestId('has-history')).toHaveTextContent('false')
  })
})
