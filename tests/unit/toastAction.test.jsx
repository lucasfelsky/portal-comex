// S9-B: toast com botao de acao ("Desfazer") e tempo proprio (`durationMs`). Retrocompativel com o Toast sem acao.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { ToastProvider, useToast } from '../../src/components/Toast'

function Harness({ run }) {
  const toast = useToast()
  useEffect(() => {
    run(toast)
  }, [toast, run])
  return null
}

function renderToast(run) {
  return render(
    <ToastProvider>
      <Harness run={run} />
    </ToastProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast com acao', () => {
  it('mostra o botao, roda onSelect uma vez e fecha o toast', () => {
    const onSelect = vi.fn()
    renderToast((toast) => toast.info('Linha 1 removida', { action: { label: 'Desfazer', onSelect } }))

    expect(screen.getByRole('status')).toHaveTextContent('Linha 1 removida')
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(onSelect).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByText('Linha 1 removida')).not.toBeInTheDocument()
  })

  it('durationMs troca o tempo: 7 s sobrevive aos 5 s padrao e fecha aos 7 s', () => {
    renderToast((toast) =>
      toast.info('Linha 2 removida', { durationMs: 7000, action: { label: 'Desfazer', onSelect: vi.fn() } })
    )
    act(() => {
      vi.advanceTimersByTime(5200)
    })
    expect(screen.getByText('Linha 2 removida')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByText('Linha 2 removida')).not.toBeInTheDocument()
  })

  it('o mouse em cima pausa o relogio do toast com acao', () => {
    renderToast((toast) =>
      toast.info('Linha 3 removida', { durationMs: 7000, action: { label: 'Desfazer', onSelect: vi.fn() } })
    )
    const item = screen.getByRole('status')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    fireEvent.mouseEnter(item)
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    expect(screen.getByText('Linha 3 removida')).toBeInTheDocument()
    fireEvent.mouseLeave(item)
    act(() => {
      vi.advanceTimersByTime(4400)
    })
    expect(screen.queryByText('Linha 3 removida')).not.toBeInTheDocument()
  })

  it('sem action o toast continua igual: sem botao de acao e fecha aos 5 s', () => {
    renderToast((toast) => toast.success('Salvo'))
    expect(document.querySelector('.toast__action')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5300)
    })
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument()
  })

  it('action sem onSelect e ignorada', () => {
    renderToast((toast) => toast.info('A', { action: { label: 'Desfazer' } }))
    expect(document.querySelector('.toast__action')).toBeNull()
  })

  it('o X continua fechando o toast com acao sem rodar a acao', () => {
    const onSelect = vi.fn()
    renderToast((toast) => toast.info('Linha 4 removida', { action: { label: 'Desfazer', onSelect } }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByText('Linha 4 removida')).not.toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
