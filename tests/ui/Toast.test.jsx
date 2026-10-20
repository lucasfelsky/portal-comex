// Tests do componente Toast (Sprint 9).
// Cobre:
//   - useToast retorna a API esperada
//   - toast.success/error/warning/info renderiza no container
//   - auto-dismiss apos 5s (vi.useFakeTimers), pausado com o mouse/foco em cima
//   - circulo de icone por tom (desktop; o CSS esconde no mobile)
//   - ate 5 toasts visiveis (FIFO descarta o mais antigo)
//   - botao X fecha imediatamente
//   - tecla Esc fecha o toast focado
//   - role="alert" para error, role="status" para os demais
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('auto-dismiss apos 5s (vi.useFakeTimers)', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.success('Vai sumir')} />
      </ToastProvider>
    )
    expect(screen.getByText('Vai sumir')).toBeInTheDocument()

    // Aos 4,2 s ainda esta na tela (antes era 4 s).
    act(() => {
      vi.advanceTimersByTime(4200)
    })
    expect(screen.getByText('Vai sumir')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.queryByText('Vai sumir')).not.toBeInTheDocument()
  })

  it('mouse em cima pausa o auto-dismiss e o restante e retomado ao sair', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.success('Pausado')} />
      </ToastProvider>
    )
    const toastEl = screen.getByRole('status')

    // 3 s correm, o mouse entra: o relogio congela com 2 s restantes.
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    fireEvent.mouseEnter(toastEl)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Pausado')).toBeInTheDocument()

    // Ao sair, so o restante (2 s) conta.
    fireEvent.mouseLeave(toastEl)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByText('Pausado')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(700) // 2,2 s depois de sair + saida de 200 ms
    })
    expect(screen.queryByText('Pausado')).not.toBeInTheDocument()
  })

  it('foco no toast tambem pausa (teclado) e o blur retoma', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.info('Foco pausa')} />
      </ToastProvider>
    )
    const toastEl = screen.getByRole('status')
    fireEvent.focus(toastEl)
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByText('Foco pausa')).toBeInTheDocument()
    fireEvent.blur(toastEl)
    act(() => {
      vi.advanceTimersByTime(5200)
    })
    expect(screen.queryByText('Foco pausa')).not.toBeInTheDocument()
  })

  it('erro nao tem auto-dismiss (continua ate fechar)', () => {
    render(
      <ToastProvider>
        <ToastHarness action={(t) => t.error('Erro fica')} />
      </ToastProvider>
    )
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Erro fica')).toBeInTheDocument()
  })

  it('cada tom tem o circulo de icone decorativo (aria-hidden) com o glifo do mock', () => {
    render(
      <ToastProvider>
        <ToastHarness
          action={(t) => {
            t.success('ok')
            t.error('erro')
            t.warning('aviso')
            t.info('info')
          }}
        />
      </ToastProvider>
    )
    for (const tone of ['success', 'error', 'warning', 'info']) {
      const toastEl = document.querySelector(`.toast--${tone}`)
      const icon = toastEl.querySelector('.toast__icon')
      expect(icon, tone).toBeInTheDocument()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon.querySelector('svg path'), tone).toBeInTheDocument()
    }
    // sucesso = check do Componentes.dc.html
    expect(
      document.querySelector('.toast--success .toast__icon path').getAttribute('d')
    ).toBe('m5 12 5 5 9-10')
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
      vi.advanceTimersByTime(200)
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
      vi.advanceTimersByTime(200)
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

    act(() => {
      vi.advanceTimersByTime(200)
    })

    // O mais antigo 't1' some, 't6' aparece
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

  it('unmount do provider cancela os timers pendentes (auto-dismiss e saida)', () => {
    let api
    const { unmount } = render(
      <ToastProvider>
        <ToastHarness onReady={(t) => (api = t)} />
      </ToastProvider>
    )
    act(() => {
      api.success('pendente') // agenda o auto-dismiss de 4s
      api.dismiss('toast-qualquer') // agenda o timer de 200ms da saida
    })
    expect(vi.getTimerCount()).toBe(2)

    unmount()
    // Sem timer vivo, nada chama setToasts depois do teardown do jsdom
    // (flake "window is not defined" em tests/ui/ProcessesPage.test.jsx).
    expect(vi.getTimerCount()).toBe(0)
  })
})
