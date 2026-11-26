// S11-D2 (L-8): alternador "Este arquivo também contém o Packing List" (botão-ícone). Sem lógica de dados: só
// aria-pressed, onToggle(next), bloqueio (aria-disabled focável, dica com o motivo) e dica no celular.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackingListToggle from '../../src/features/processes/PackingListToggle'

const LABEL = 'Este arquivo também contém o Packing List'

afterEach(() => {
  vi.useRealTimers()
  delete window.matchMedia
})

describe('PackingListToggle', () => {
  it('desligado: aria-pressed=false, rótulo e dica com o texto exato; sem aria-disabled', () => {
    render(<PackingListToggle checked={false} onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: LABEL })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(button).not.toBeDisabled()
    expect(screen.getByRole('tooltip')).toHaveTextContent(LABEL)
  })

  it('ligado: aria-pressed=true e a marca de check visível (classe do botão pressionado)', () => {
    render(<PackingListToggle checked onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: LABEL })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button.querySelector('.pl-toggle__mark')).not.toBeNull()
  })

  it('o rótulo acessível leva a PO quando informada', () => {
    render(<PackingListToggle checked={false} po="PO-7" onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: `${LABEL} da PO PO-7` })).toBeInTheDocument()
  })

  it('clique chama onToggle com o valor oposto (liga e desliga)', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const { rerender } = render(<PackingListToggle checked={false} onToggle={onToggle} />)
    await user.click(screen.getByRole('button', { name: LABEL }))
    expect(onToggle).toHaveBeenLastCalledWith(true)
    rerender(<PackingListToggle checked onToggle={onToggle} />)
    await user.click(screen.getByRole('button', { name: LABEL }))
    expect(onToggle).toHaveBeenLastCalledWith(false)
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('bloqueado: aria-disabled (não disabled), focável, dica com o motivo e clique não chama o handler', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<PackingListToggle checked={false} blocked onToggle={onToggle} />)
    const button = screen.getByRole('button', { name: LABEL })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('tooltip')).toHaveTextContent('O Packing List já tem arquivo próprio.')
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(LABEL)
    expect(button).toHaveAccessibleDescription('O Packing List já tem arquivo próprio.')
    await user.tab()
    expect(button).toHaveFocus()
    await user.click(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('gravando (busy): botão desabilitado de verdade e sem chamada', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<PackingListToggle checked={false} busy onToggle={onToggle} />)
    const button = screen.getByRole('button', { name: LABEL })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('Esc esconde a dica; passar o mouse de novo a devolve', () => {
    render(<PackingListToggle checked={false} onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: LABEL })
    const tip = screen.getByRole('tooltip')
    expect(tip).not.toHaveAttribute('data-dismissed')
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(tip).toHaveAttribute('data-dismissed', 'true')
    fireEvent.mouseEnter(button)
    expect(tip).not.toHaveAttribute('data-dismissed')
  })

  it('celular (sem hover): o toque alterna e mostra a dica por alguns segundos', () => {
    vi.useFakeTimers()
    window.matchMedia = vi.fn((query) => ({ matches: query === '(hover: none)', media: query }))
    const onToggle = vi.fn()
    render(<PackingListToggle checked={false} onToggle={onToggle} />)
    const tip = screen.getByRole('tooltip')
    expect(tip).not.toHaveClass('pl-toggle__tip--open')
    fireEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(onToggle).toHaveBeenCalledWith(true)
    expect(tip).toHaveClass('pl-toggle__tip--open')
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(tip).not.toHaveClass('pl-toggle__tip--open')
  })

  it('celular com o alternador bloqueado: o toque só mostra a dica', () => {
    vi.useFakeTimers()
    window.matchMedia = vi.fn((query) => ({ matches: query === '(hover: none)', media: query }))
    const onToggle = vi.fn()
    render(<PackingListToggle checked={false} blocked onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByRole('tooltip')).toHaveClass('pl-toggle__tip--open')
  })

  it('com mouse (hover disponível) o clique não abre a dica por toque', () => {
    window.matchMedia = vi.fn((query) => ({ matches: false, media: query }))
    render(<PackingListToggle checked={false} onToggle={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(screen.getByRole('tooltip')).not.toHaveClass('pl-toggle__tip--open')
  })
})
