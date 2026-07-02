// Tests do hook useDoNotDisturb + formatRemaining (Sprint 20).
// Cobre:
//   - Estado inicial sem nada no localStorage: isActive=false
//   - enableFor(ms): ativa e persiste
//   - formatRemaining: ms -> 'X min' / 'Xh' / 'Xh Ym'
//   - Quando expira, isActive vira false
//   - disable limpa
//   - localStorage corrompido nao quebra
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import React from 'react'
import { useDoNotDisturb, formatRemaining } from '../../src/hooks/useDoNotDisturb.js'

const STORAGE_KEY = 'sq-comex:dnd'

function Probe({ durationMs, onMount }) {
  const dnd = useDoNotDisturb()
  React.useEffect(() => {
    onMount?.(dnd)
  }, [dnd])
  return (
    <div>
      <span data-testid="active">{String(dnd.isActive)}</span>
      <span data-testid="remaining">{dnd.remainingMs}</span>
      <button type="button" onClick={() => dnd.enableFor(durationMs ?? 3600000)}>
        Enable
      </button>
      <button type="button" onClick={() => dnd.disable()}>
        Disable
      </button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-01T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useDoNotDisturb', () => {
  it('estado inicial sem storage: isActive=false', () => {
    let captured
    render(<Probe onMount={(d) => (captured = d)} />)
    expect(captured.isActive).toBe(false)
    expect(captured.remainingMs).toBe(0)
  })

  it('enableFor(ms): ativa e persiste no localStorage', () => {
    let captured
    const { getByText } = render(
      <Probe durationMs={3600000} onMount={(d) => (captured = d)} />
    )
    act(() => {
      getByText('Enable').click()
    })
    expect(captured.isActive).toBe(true)
    const stored = window.localStorage.getItem(STORAGE_KEY)
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored)
    expect(parsed.expiresAt).toBeTruthy()
  })

  it('disable: limpa localStorage e isActive=false', () => {
    let captured
    const { getByText } = render(<Probe onMount={(d) => (captured = d)} />)
    act(() => {
      getByText('Enable').click()
    })
    expect(captured.isActive).toBe(true)
    act(() => {
      getByText('Disable').click()
    })
    expect(captured.isActive).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('quando expira, isActive vira false', () => {
    let captured
    const { getByText } = render(
      <Probe durationMs={60000} onMount={(d) => (captured = d)} />
    )
    act(() => {
      getByText('Enable').click()
    })
    expect(captured.isActive).toBe(true)
    // Avanca 61 segundos
    act(() => {
      vi.advanceTimersByTime(61000)
    })
    // Tick do interval 30s + state update
    expect(captured.isActive).toBe(false)
  })

  it('localStorage corrompido nao quebra o hook', () => {
    window.localStorage.setItem(STORAGE_KEY, 'nao-json')
    let captured
    render(<Probe onMount={(d) => (captured = d)} />)
    expect(captured.isActive).toBe(false)
  })

  it('localStorage com expiresAt no passado: limpa e fica inativo', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ expiresAt: '2020-01-01T00:00:00Z' })
    )
    let captured
    render(<Probe onMount={(d) => (captured = d)} />)
    expect(captured.isActive).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('formatRemaining', () => {
  it('zero ou negativo retorna string vazia', () => {
    expect(formatRemaining(0)).toBe('')
    expect(formatRemaining(-1)).toBe('')
  })

  it('minutos inteiros', () => {
    expect(formatRemaining(5 * 60000)).toBe('5 min')
    expect(formatRemaining(45 * 60000)).toBe('45 min')
  })

  it('horas inteiras', () => {
    expect(formatRemaining(60 * 60000)).toBe('1h')
    expect(formatRemaining(120 * 60000)).toBe('2h')
  })

  it('horas + minutos', () => {
    expect(formatRemaining(90 * 60000)).toBe('1h 30m')
    expect(formatRemaining(150 * 60000)).toBe('2h 30m')
  })
})
