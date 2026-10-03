// Aviso "ERP" (PR 3): chip + balao no padrao TOOLTIP. Controlado por estado
// React (o jsdom nao testa `:hover`): mouse (hover/clique), toque (pointerType),
// teclado (Tab/Enter/Esc), clique fora e lado do balao medido no desktop.
// Usa `userEvent.setup()`: o user-event grava o `pointerType` sozinho (o jsdom 25
// nao tem PointerEvent, entao `fireEvent.pointer*` perderia a informacao).
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErpHint from '../../src/features/erp/ErpHint.jsx'

const FILLED_HINT = {
  kind: 'divergente',
  ariaLabel: 'ETA no ERP: 06/10/2026',
  text: 'No ERP: 06/10/2026 · planilha de 02/10/2026',
  portalFields: ['eta'],
}
const EMPTY_HINT = {
  kind: 'portal_sem_dado',
  ariaLabel: 'ETA no ERP: 06/10/2026',
  text: 'No ERP: 06/10/2026 · vazio no Portal · planilha de 02/10/2026',
  portalFields: ['eta'],
}

const getChip = () => screen.getByRole('button', { name: 'ETA no ERP: 06/10/2026' })
const getBubble = () => document.querySelector('.erp-hint__bubble')
const isOpen = () => !getBubble().hasAttribute('hidden')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErpHint - estrutura e acessibilidade', () => {
  it('sem hint nao renderiza nada', () => {
    const { container, rerender } = render(<ErpHint hint={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ErpHint hint={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('botao com o rotulo do campo, texto visivel "ERP", descricao pelo balao e sem aria-expanded', () => {
    render(<ErpHint hint={FILLED_HINT} />)
    const chip = getChip()
    expect(chip).toHaveTextContent(/^ERP$/)
    expect(chip).not.toHaveAttribute('aria-expanded')
    expect(chip).toHaveAccessibleDescription('No ERP: 06/10/2026 · planilha de 02/10/2026')
    // O nome acessivel contem o texto visivel (SC 2.5.3).
    expect(chip.getAttribute('aria-label')).toContain('ERP')
  })

  it('com o hint de campo vazio, a descricao diz "vazio no Portal"', () => {
    render(<ErpHint hint={EMPTY_HINT} />)
    expect(getChip()).toHaveAccessibleDescription('No ERP: 06/10/2026 · vazio no Portal · planilha de 02/10/2026')
  })

  it('fechado: o balao esta no DOM com hidden e nao aparece como tooltip', () => {
    render(<ErpHint hint={FILLED_HINT} className="extra" />)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(getBubble()).toHaveAttribute('hidden')
    expect(getBubble()).toHaveAttribute('role', 'tooltip')
    expect(document.querySelector('.erp-hint')).toHaveClass('extra')
    expect(getChip().getAttribute('aria-describedby')).toBe(getBubble().id)
    // O balao e' <span>: o aviso pode viver dentro de <p>/<dd>.
    expect(getBubble().tagName).toBe('SPAN')
    expect(document.querySelector('.erp-hint').tagName).toBe('SPAN')
  })
})

describe('ErpHint - mouse', () => {
  it('hover abre, mover para o balao mantem aberto e sair do wrapper fecha', async () => {
    const user = userEvent.setup()
    render(<ErpHint hint={FILLED_HINT} />)
    await user.hover(getChip())
    expect(isOpen()).toBe(true)
    expect(screen.getByRole('tooltip')).toHaveTextContent('No ERP: 06/10/2026 · planilha de 02/10/2026')

    await user.hover(getBubble())
    expect(isOpen()).toBe(true)

    await user.unhover(getBubble())
    expect(isOpen()).toBe(false)
  })

  it('clique fixa (continua aberto depois do unhover) e o 2o clique fecha', async () => {
    const user = userEvent.setup()
    render(<ErpHint hint={FILLED_HINT} />)
    await user.hover(getChip())
    await user.click(getChip())
    expect(isOpen()).toBe(true)
    await user.unhover(getChip())
    expect(isOpen()).toBe(true)

    await user.click(getChip())
    expect(isOpen()).toBe(false)
  })

  it('clique fora fecha um balao fixado; clique DENTRO do balao nao fecha', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <ErpHint hint={FILLED_HINT} />
        <button type="button">outro</button>
      </div>
    )
    await user.click(getChip())
    await user.unhover(getChip())
    expect(isOpen()).toBe(true)

    await user.click(getBubble())
    expect(isOpen()).toBe(true)

    await user.click(document.body)
    expect(isOpen()).toBe(false)
  })
})

describe('ErpHint - toque', () => {
  it('o 1o toque abre fixado e o 2o fecha', async () => {
    const user = userEvent.setup()
    render(<ErpHint hint={FILLED_HINT} />)
    await user.pointer({ keys: '[TouchA]', target: getChip() })
    expect(isOpen()).toBe(true)
    await user.pointer({ keys: '[TouchA]', target: getChip() })
    expect(isOpen()).toBe(false)
  })

  it('o pointerenter/pointerdown de toque sozinhos nao abrem (so o clique ao soltar); o de mouse abre', async () => {
    const user = userEvent.setup()
    render(<ErpHint hint={FILLED_HINT} />)
    // Toque pressionado: pointerenter + pointerdown de `touch`, sem soltar (sem clique).
    await user.pointer({ keys: '[TouchA>]', target: getChip() })
    expect(isOpen()).toBe(false)
    // Ao soltar vem o clique, que fixa.
    await user.pointer({ keys: '[/TouchA]' })
    expect(isOpen()).toBe(true)
    await user.pointer({ keys: '[TouchA]', target: getChip() })
    expect(isOpen()).toBe(false)
    // Mouse: o hover abre sozinho.
    await user.hover(getChip())
    expect(isOpen()).toBe(true)
  })

  it('o toque fora fecha o balao fixado', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <ErpHint hint={FILLED_HINT} />
        <p>fora</p>
      </div>
    )
    await user.pointer({ keys: '[TouchA]', target: getChip() })
    expect(isOpen()).toBe(true)
    await user.pointer({ keys: '[TouchA]', target: screen.getByText('fora') })
    expect(isOpen()).toBe(false)
  })
})

describe('ErpHint - teclado', () => {
  it('Tab abre, Esc fecha e o foco continua no chip', async () => {
    const user = userEvent.setup()
    render(<ErpHint hint={FILLED_HINT} />)
    await user.tab()
    expect(getChip()).toHaveFocus()
    expect(isOpen()).toBe(true)
    await user.keyboard('{Escape}')
    expect(isOpen()).toBe(false)
    expect(getChip()).toHaveFocus()
  })

  it('Enter fixa e o 2o Enter fecha', async () => {
    const user = userEvent.setup()
    render(<ErpHint hint={FILLED_HINT} />)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(isOpen()).toBe(true)
    await user.keyboard('{Enter}')
    expect(isOpen()).toBe(false)
  })

  it('fixado, com o foco em outro botao: Esc fecha e o foco NAO volta ao chip', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <ErpHint hint={FILLED_HINT} />
        <button type="button">outro</button>
      </div>
    )
    await user.click(getChip())
    expect(isOpen()).toBe(true)
    screen.getByRole('button', { name: 'outro' }).focus()
    expect(isOpen()).toBe(true)
    await user.keyboard('{Escape}')
    expect(isOpen()).toBe(false)
    expect(screen.getByRole('button', { name: 'outro' })).toHaveFocus()
    expect(getChip()).not.toHaveFocus()
  })

  it('o foco que vem do clique (ponteiro) nao abre "solto" depois que o aviso fecha', async () => {
    const user = userEvent.setup()
    render(<ErpHint hint={FILLED_HINT} />)
    await user.click(getChip())
    await user.click(getChip())
    expect(isOpen()).toBe(false)
  })
})

describe('ErpHint - lado do balao (desktop)', () => {
  function mockRects({ bubbleRight, boundaryRight }) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      const make = (left, right) => ({ left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0 })
      if (this.classList.contains('erp-hint__bubble')) return make(bubbleRight - 240, bubbleRight)
      if (this.classList.contains('main-content')) return make(0, boundaryRight)
      return make(0, 0)
    })
  }

  it('chip perto da borda direita do .main-content: data-align="end"', async () => {
    mockRects({ bubbleRight: 1100, boundaryRight: 1000 })
    const user = userEvent.setup()
    render(
      <div className="main-content">
        <ErpHint hint={FILLED_HINT} />
      </div>
    )
    expect(getBubble()).toHaveAttribute('data-align', 'start')
    await user.hover(getChip())
    expect(getBubble()).toHaveAttribute('data-align', 'end')
  })

  it('com folga: data-align="start"', async () => {
    mockRects({ bubbleRight: 600, boundaryRight: 1000 })
    const user = userEvent.setup()
    render(
      <div className="main-content">
        <ErpHint hint={FILLED_HINT} />
      </div>
    )
    await user.hover(getChip())
    expect(getBubble()).toHaveAttribute('data-align', 'start')
  })
})
