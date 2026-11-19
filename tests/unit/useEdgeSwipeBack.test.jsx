// Remake mobile F5: voltar arrastando da BORDA ESQUERDA, acompanhando o dedo.
// Cobre: so' comeca nos 28px da borda e dentro da camada; limiar de fechar
// (110px); rolagem vertical cancela; areas rolaveis na horizontal e campos de
// texto sao do componente; movimento reduzido nao anima o retorno; e nada de
// transform/filter inline sobra depois do gesto.
import { useRef } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_DISTANCE, EDGE_ZONE, useEdgeSwipeBack } from '../../src/hooks/useEdgeSwipeBack'

function Harness({ enabled = true, onBack }) {
  const layerRef = useRef(null)
  const underRef = useRef(null)
  useEdgeSwipeBack({
    enabled,
    getTarget: () => layerRef.current,
    getUnder: () => underRef.current,
    onBack,
  })
  return (
    <div>
      <div ref={underRef} data-testid="under" />
      <div ref={layerRef} data-testid="layer">
        <div data-testid="inner">conteudo</div>
        <div data-testid="chips" style={{ overflowX: 'auto' }}>
          <button type="button">chip</button>
        </div>
        <input data-testid="field" />
      </div>
      <div data-testid="outside" />
    </div>
  )
}

const finger = (x, y, id = 1) => ({ identifier: id, clientX: x, clientY: y })

function touch(type, target, touches) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : touches })
  Object.defineProperty(event, 'changedTouches', { value: touches })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function drag(target, from, to) {
  touch('touchstart', target, [finger(from.x, from.y)])
  const move = touch('touchmove', target, [finger(to.x, to.y)])
  return move
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia

function stubReducedMotion(reduced) {
  window.matchMedia = vi.fn((query) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
}

beforeEach(() => {
  stubReducedMotion(false)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.useRealTimers()
})

describe('useEdgeSwipeBack', () => {
  it('so comeca se o toque nasce nos primeiros 28px da borda esquerda', () => {
    expect(EDGE_ZONE).toBe(28)
    const onBack = vi.fn()
    render(<Harness onBack={onBack} />)
    const layer = screen.getByTestId('layer')
    const inner = screen.getByTestId('inner')

    drag(inner, { x: 60, y: 200 }, { x: 220, y: 204 })
    expect(layer.style.transform).toBe('')

    drag(inner, { x: 10, y: 200 }, { x: 80, y: 204 })
    expect(layer.style.transform).toBe('translateX(70px)')
    // a lista que fica atras acompanha: recuo -26% -> 0 e brilho .78 -> 1
    const under = screen.getByTestId('under')
    expect(under.style.transform).toMatch(/^translateX\(-2[0-5]\./)
    expect(parseFloat(under.style.filter.replace('brightness(', ''))).toBeGreaterThan(0.78)
    expect(layer.style.transition).toBe('none')
  })

  it('ignora toques fora da camada do detalhe (galeria, modais, tab bar)', () => {
    render(<Harness onBack={vi.fn()} />)
    drag(screen.getByTestId('outside'), { x: 8, y: 200 }, { x: 120, y: 204 })
    expect(screen.getByTestId('layer').style.transform).toBe('')
  })

  it('segura o arrasto com preventDefault so depois de travar na horizontal', () => {
    render(<Harness onBack={vi.fn()} />)
    const inner = screen.getByTestId('inner')
    touch('touchstart', inner, [finger(10, 200)])
    const small = touch('touchmove', inner, [finger(14, 201)])
    expect(small.defaultPrevented).toBe(false)
    const locked = touch('touchmove', inner, [finger(60, 204)])
    expect(locked.defaultPrevented).toBe(true)
  })

  it('solta alem de 110px: chama onBack e deixa a lista em repouso (sem transition)', () => {
    expect(CLOSE_DISTANCE).toBe(110)
    const onBack = vi.fn()
    render(<Harness onBack={onBack} />)
    const inner = screen.getByTestId('inner')
    drag(inner, { x: 10, y: 200 }, { x: 160, y: 206 })
    touch('touchend', inner, [finger(160, 206)])
    expect(onBack).toHaveBeenCalledTimes(1)
    const under = screen.getByTestId('under')
    expect(under.style.transform).toBe('translateX(0%)')
    expect(under.style.filter).toBe('brightness(1)')
  })

  it('solta antes do limiar: nao fecha, a camada volta e nada fica inline', () => {
    vi.useFakeTimers()
    const onBack = vi.fn()
    render(<Harness onBack={onBack} />)
    const inner = screen.getByTestId('inner')
    const layer = screen.getByTestId('layer')
    const under = screen.getByTestId('under')
    drag(inner, { x: 10, y: 200 }, { x: 80, y: 206 })
    touch('touchend', inner, [finger(80, 206)])
    expect(onBack).not.toHaveBeenCalled()
    // retorno animado da camada; a lista perde o inline e usa a transition da CSS
    expect(layer.style.transition).toContain('transform')
    expect(layer.style.transform).toBe('translateX(0px)')
    expect(under.style.transform).toBe('')
    expect(under.style.filter).toBe('')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(layer.style.transform).toBe('')
    expect(layer.style.transition).toBe('')
  })

  it('rolagem vertical cancela o gesto e o resto do movimento e ignorado', () => {
    const onBack = vi.fn()
    render(<Harness onBack={onBack} />)
    const inner = screen.getByTestId('inner')
    const layer = screen.getByTestId('layer')
    touch('touchstart', inner, [finger(10, 100)])
    touch('touchmove', inner, [finger(13, 150)]) // |dy| > 8 e > |dx|
    touch('touchmove', inner, [finger(220, 152)])
    touch('touchend', inner, [finger(220, 152)])
    expect(layer.style.transform).toBe('')
    expect(onBack).not.toHaveBeenCalled()
  })

  it('arrastar para a esquerda nao e o gesto de voltar', () => {
    render(<Harness onBack={vi.fn()} />)
    drag(screen.getByTestId('inner'), { x: 20, y: 200 }, { x: 0, y: 202 })
    touch('touchmove', screen.getByTestId('inner'), [finger(160, 204)])
    expect(screen.getByTestId('layer').style.transform).toBe('')
  })

  it('area rolavel na horizontal que ainda pode voltar e campo de texto sao do componente', () => {
    const onBack = vi.fn()
    render(<Harness onBack={onBack} />)
    const chips = screen.getByTestId('chips')
    chips.scrollLeft = 24
    drag(screen.getByRole('button', { name: 'chip' }), { x: 10, y: 200 }, { x: 120, y: 204 })
    expect(screen.getByTestId('layer').style.transform).toBe('')

    // sem ter para onde rolar (scrollLeft 0), o gesto e' da camada
    chips.scrollLeft = 0
    drag(screen.getByRole('button', { name: 'chip' }), { x: 10, y: 200 }, { x: 120, y: 204 })
    expect(screen.getByTestId('layer').style.transform).toBe('translateX(110px)')
    touch('touchcancel', screen.getByTestId('inner'), [finger(120, 204)])

    drag(screen.getByTestId('field'), { x: 10, y: 200 }, { x: 120, y: 204 })
    expect(screen.getByTestId('layer').style.transform).toBe('')
  })

  it('dois dedos nao iniciam o gesto', () => {
    render(<Harness onBack={vi.fn()} />)
    const inner = screen.getByTestId('inner')
    touch('touchstart', inner, [finger(10, 200, 1), finger(200, 200, 2)])
    touch('touchmove', inner, [finger(90, 204, 1), finger(200, 200, 2)])
    expect(screen.getByTestId('layer').style.transform).toBe('')
  })

  it('movimento reduzido: o dedo continua sendo acompanhado, mas soltar nao anima o retorno', () => {
    stubReducedMotion(true)
    const onBack = vi.fn()
    render(<Harness onBack={onBack} />)
    const inner = screen.getByTestId('inner')
    const layer = screen.getByTestId('layer')
    drag(inner, { x: 10, y: 200 }, { x: 80, y: 206 })
    expect(layer.style.transform).toBe('translateX(70px)')
    touch('touchend', inner, [finger(80, 206)])
    expect(onBack).not.toHaveBeenCalled()
    expect(layer.style.transform).toBe('')
    expect(layer.style.transition).toBe('')

    drag(inner, { x: 10, y: 200 }, { x: 170, y: 206 })
    touch('touchend', inner, [finger(170, 206)])
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('under').style.transition).toBe('none')
  })

  it('desabilitar ou desmontar limpa o transform/filter inline (nada persiste)', () => {
    const { rerender, unmount } = render(<Harness onBack={vi.fn()} />)
    const inner = screen.getByTestId('inner')
    const layer = screen.getByTestId('layer')
    const under = screen.getByTestId('under')
    drag(inner, { x: 10, y: 200 }, { x: 90, y: 204 })
    expect(layer.style.transform).not.toBe('')
    rerender(<Harness enabled={false} onBack={vi.fn()} />)
    expect(layer.style.transform).toBe('')
    expect(layer.style.transition).toBe('')
    expect(under.style.transform).toBe('')
    expect(under.style.filter).toBe('')
    unmount()
  })

  it('desabilitado (tablet/desktop): nenhum listener age', () => {
    const onBack = vi.fn()
    render(<Harness enabled={false} onBack={onBack} />)
    drag(screen.getByTestId('inner'), { x: 10, y: 200 }, { x: 200, y: 204 })
    touch('touchend', screen.getByTestId('inner'), [finger(200, 204)])
    expect(onBack).not.toHaveBeenCalled()
    expect(screen.getByTestId('layer').style.transform).toBe('')
  })
})
