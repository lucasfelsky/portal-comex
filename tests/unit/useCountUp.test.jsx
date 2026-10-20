// Contador de KPI (Movimento.dc.html): 600 ms, ease-out cubico, 1x por sessao,
// sem animar atualizacao ao vivo, desligado com movimento reduzido.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import React from 'react'
import useCountUp, {
  easeOutCubic,
  KPI_COUNT_UP_DURATION_MS,
  KPI_COUNT_UP_SESSION_KEY,
} from '../../src/hooks/useCountUp.js'
import StatCard from '../../src/components/StatCard.jsx'

function Probe({ value }) {
  const shown = useCountUp(value)
  return <span data-testid="probe">{String(shown)}</span>
}

const readProbe = () => screen.getByTestId('probe').textContent

function mockReducedMotion(reduce) {
  window.matchMedia = (query) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
  mockReducedMotion(false)
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCountUp', () => {
  it('duracao de 600 ms e curva ease-out cubica 1 - (1 - t)^3', () => {
    expect(KPI_COUNT_UP_DURATION_MS).toBe(600)
    expect(KPI_COUNT_UP_SESSION_KEY).toBe('pc-kpi-countup')
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10)
  })

  it('primeira carga da sessao: conta de 0 ate o valor em 600 ms e grava o flag so no fim', () => {
    render(<Probe value={17} />)
    expect(readProbe()).toBe('0')
    expect(window.sessionStorage.getItem(KPI_COUNT_UP_SESSION_KEY)).toBeNull()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    // t = 0,5 -> 17 * 0,875 = 14,875 -> 15
    const mid = Number(readProbe())
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(17)

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(readProbe()).toBe('17')
    expect(window.sessionStorage.getItem(KPI_COUNT_UP_SESSION_KEY)).toBe('1')
  })

  it('1x por sessao: com o flag gravado mostra o valor direto, sem contar', () => {
    window.sessionStorage.setItem(KPI_COUNT_UP_SESSION_KEY, '1')
    render(<Probe value={17} />)
    expect(readProbe()).toBe('17')
  })

  it('atualizacao ao vivo troca o numero sem animar', () => {
    const { rerender } = render(<Probe value={5} />)
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(readProbe()).toBe('5')

    rerender(<Probe value={9} />)
    expect(readProbe()).toBe('9')
  })

  it('valor nao numerico passa direto; o primeiro numero depois do skeleton anima', () => {
    const { rerender } = render(<Probe value="—" />)
    expect(readProbe()).toBe('—')

    rerender(<Probe value={8} />)
    expect(readProbe()).toBe('0')
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(readProbe()).toBe('8')
  })

  it('valor 0 nao anima (nada para contar)', () => {
    render(<Probe value={0} />)
    expect(readProbe()).toBe('0')
    expect(window.sessionStorage.getItem(KPI_COUNT_UP_SESSION_KEY)).toBeNull()
  })

  it('movimento reduzido: mostra o valor na hora e nao grava o flag', () => {
    mockReducedMotion(true)
    render(<Probe value={17} />)
    expect(readProbe()).toBe('17')
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(readProbe()).toBe('17')
    expect(window.sessionStorage.getItem(KPI_COUNT_UP_SESSION_KEY)).toBeNull()
  })

  it('os 4 KPIs que montam juntos animam juntos (o flag so entra no fim)', () => {
    render(
      <>
        <StatCard label="A" value={4} />
        <StatCard label="B" value={7} />
      </>
    )
    const values = Array.from(document.querySelectorAll('.stat-card__value')).map((el) => el.textContent)
    expect(values).toEqual(['0', '0'])
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(Array.from(document.querySelectorAll('.stat-card__value')).map((el) => el.textContent)).toEqual([
      '4',
      '7',
    ])
  })

  it('StatCard com texto (ex.: "2h 14min") nao passa pelo contador', () => {
    render(<StatCard label="Tempo medio" value="2h 14min" />)
    expect(screen.getByText('2h 14min')).toBeInTheDocument()
  })
})
