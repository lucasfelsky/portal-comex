// Tests do componente Toast (Sprint 9).
// Cobre:
//   - useToast retorna a API esperada
//   - toast.success/error/warning/info renderiza no container
//   - auto-dismiss apos 4s (vi.useFakeTimers)
//   - ate 5 toasts visiveis (FIFO descarta o mais antigo)
//   - botao X fecha imediatamente
//   - tecla Esc fecha o toast focado
//   - role="alert" para error, role="status" para os demais
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import React, { useEffect } from 'react'
import { ToastProvider, useToast } from '../../src/components/Toast.jsx'

// Harness que dispara uma funcao de toast via useEffect (evita
// setState-in-render do React).
function ToastHarness({ onReady, action }) {
  const toast = useToast()
  useEffect(() => {
    if (onReady) onReady(toast)
    if (action) action(toast)
  }, [toast, onReady, action])
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('useToast retorna a API com success/error/warning/info/dismiss', () => {
    let api
    render(
      <ToastProvider>
        <ToastHarness onReady={(t) => (api = t)} />
      </ToastProvider>
    )
    expect(typeof api.success).toBe('function')
    expect(typeof api.error).toBe('function')
    expect(typeof api.warning).toBe('function')
    expect(typeof api.info).toBe('function')
    expect(typeof api.dismiss).toBe('function')
  })

  it('renderiza toast de sucesso no container', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.success('Salvo!')} />
      </ToastProvider>
    )
    expect(screen.getByText('Salvo!')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('toast toast--success')
  })

  it('renderiza toast de erro com role=alert', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.error('Falhou!')} />
      </ToastProvider>
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('toast toast--error')
    expect(alert).toHaveTextContent('Falhou!')
  })

  it('renderiza warning e info com role=status', () => {
    render(
      <ToastProvider>
        <ToastHarness
          action={(t) => {
            t.warning('Atencao')
            t.info('Aviso')
          }}
        />
      </ToastProvider>
    )
    const statuses = screen.getAllByRole('status')
    const tones = statuses.map((el) => el.className)
    expect(tones.some((c) => c.includes('toast--warning'))).toBe(true)
    expect(tones.some((c) => c.includes('toast--info'))).toBe(true)
  })

  it('auto-dismiss apos 4s (vi.useFakeTimers)', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.success('Vai sumir')} />
      </ToastProvider>
    )
    expect(screen.getByText('Vai sumir')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(screen.queryByText('Vai sumir')).not.toBeInTheDocument()
  })

  it('botao X fecha o toast imediatamente', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.info('Dispensavel')} />
      </ToastProvider>
    )
    const closeBtn = screen.getByLabelText('Fechar')
    act(() => {
      closeBtn.click()
    })
    expect(screen.queryByText('Dispensavel')).not.toBeInTheDocument()
  })

  it('Esc fecha o toast (aria-friendly)', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.warning('Pressione Esc')} />
      </ToastProvider>
    )
    expect(screen.getByText('Pressione Esc')).toBeInTheDocument()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(screen.queryByText('Pressione Esc')).not.toBeInTheDocument()
  })

  it('FIFO: empilha ate 5 toasts; o 6o descarta o mais antigo', () => {
    render(
      <ToastProvider>
        <ToastHarness
          action={(t) => {
            t.info('t1')
            t.info('t2')
            t.info('t3')
            t.info('t4')
            t.info('t5')
            t.info('t6') // descarta t1
          }}
        />
      </ToastProvider>
    )

    expect(screen.queryByText('t1')).not.toBeInTheDocument()
    expect(screen.getByText('t2')).toBeInTheDocument()
    expect(screen.getByText('t6')).toBeInTheDocument()
  })

  it('useToast fora de <ToastProvider> lanca erro', () => {
    // Suprime o erro que o React loga no console ao usar hook fora do provider
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ToastHarness onReady={() => {}} />)).toThrow(
      /useToast precisa de <ToastProvider>/
    )
    consoleError.mockRestore()
  })
})
