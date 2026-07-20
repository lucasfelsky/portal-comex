// Hook de swipe-to-reveal (gesto de ações em linha, iOS table view).
// Testa a lógica pura de arrasto/threshold/guarda-de-clique chamando os
// handlers diretamente com objetos de touch sintéticos — não precisa de
// DOM real disparando touch events.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSwipeReveal, SWIPE_ACTION_WIDTH } from '../../src/hooks/useSwipeReveal'

function touch(clientX, clientY = 0) {
  return { touches: [{ clientX, clientY }] }
}

describe('useSwipeReveal', () => {
  it('sem ações (actionCount 0), maxReveal é 0 e nada abre', () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 0, isOpen: false, onOpenChange })
    )
    act(() => result.current.handlers.onTouchStart(touch(200)))
    act(() => result.current.handlers.onTouchMove(touch(100)))
    act(() => result.current.handlers.onTouchEnd())
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(result.current.translateX).toBe(0)
  })

  it('arrasto além de 40% do reveal total abre (onOpenChange(true))', () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 1, isOpen: false, onOpenChange })
    )
    const maxReveal = SWIPE_ACTION_WIDTH
    act(() => result.current.handlers.onTouchStart(touch(300)))
    // arrasta mais que 40% de maxReveal pra esquerda
    act(() => result.current.handlers.onTouchMove(touch(300 - maxReveal * 0.6)))
    act(() => result.current.handlers.onTouchEnd())
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('arrasto curto (abaixo de 40%) fecha (onOpenChange(false))', () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 1, isOpen: false, onOpenChange })
    )
    const maxReveal = SWIPE_ACTION_WIDTH
    act(() => result.current.handlers.onTouchStart(touch(300)))
    act(() => result.current.handlers.onTouchMove(touch(300 - maxReveal * 0.2)))
    act(() => result.current.handlers.onTouchEnd())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('translateX fica clampado entre -maxReveal e 0 durante o arrasto', () => {
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 2, isOpen: false, onOpenChange: vi.fn() })
    )
    const maxReveal = SWIPE_ACTION_WIDTH * 2
    act(() => result.current.handlers.onTouchStart(touch(300)))
    // arrasta muito além do reveal máximo
    act(() => result.current.handlers.onTouchMove(touch(300 - maxReveal - 200)))
    expect(result.current.translateX).toBe(-maxReveal)
    // arrasta pra direita além de 0 (linha fechada não "abre pra fora")
    act(() => result.current.handlers.onTouchMove(touch(300 + 200)))
    expect(result.current.translateX).toBe(0)
  })

  it('movimento predominantemente vertical não inicia o arrasto', () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 1, isOpen: false, onOpenChange })
    )
    act(() => result.current.handlers.onTouchStart(touch(300, 100)))
    // dy (80) > dx (20): é scroll vertical, não swipe
    act(() => result.current.handlers.onTouchMove(touch(280, 180)))
    act(() => result.current.handlers.onTouchEnd())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('disabled:true ignora todos os handlers', () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 1, isOpen: false, onOpenChange, disabled: true })
    )
    act(() => result.current.handlers.onTouchStart(touch(300)))
    act(() => result.current.handlers.onTouchMove(touch(200)))
    act(() => result.current.handlers.onTouchEnd())
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(result.current.translateX).toBe(0)
  })

  it('guardClick: com a linha aberta, o toque fecha em vez de acionar o handler', () => {
    const onOpenChange = vi.fn()
    const handler = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 1, isOpen: true, onOpenChange })
    )
    const guarded = result.current.guardClick(handler)
    const event = { preventDefault: vi.fn() }
    guarded(event)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(handler).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('guardClick: linha fechada e sem arrasto recente aciona o handler normalmente', () => {
    const handler = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 1, isOpen: false, onOpenChange: vi.fn() })
    )
    const guarded = result.current.guardClick(handler)
    guarded({ preventDefault: vi.fn() })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('guardClick: clique logo após um arrasto é engolido (não navega por engano)', async () => {
    const onOpenChange = vi.fn()
    const handler = vi.fn()
    const { result } = renderHook(() =>
      useSwipeReveal({ actionCount: 1, isOpen: false, onOpenChange })
    )
    const maxReveal = SWIPE_ACTION_WIDTH
    act(() => result.current.handlers.onTouchStart(touch(300)))
    act(() => result.current.handlers.onTouchMove(touch(300 - maxReveal * 0.2)))
    act(() => result.current.handlers.onTouchEnd())

    const guarded = result.current.guardClick(handler)
    guarded({ preventDefault: vi.fn() })
    expect(handler).not.toHaveBeenCalled()

    // no próximo tick a guarda solta — clique seguinte funciona normal
    await act(async () => {
      await Promise.resolve()
    })
    guarded({ preventDefault: vi.fn() })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
