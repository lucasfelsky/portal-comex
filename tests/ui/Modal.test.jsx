// Tests do componente Modal (Sprint 9).
// Cobre:
//   - Nao renderiza nada quando open=false
//   - Renderiza backdrop + modal + titulo + close button quando open=true
//   - Variante `wide` aplica .modal--wide
//   - Close on Esc chama onClose
//   - Close on click no backdrop chama onClose
//   - Click DENTRO do modal NAO fecha
//   - Bloqueia scroll do body quando aberto; restaura ao fechar
//   - aria-modal e aria-label sao aplicados
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import Modal from '../../src/components/Modal.jsx'

describe('Modal', () => {
  let originalOverflow

  beforeEach(() => {
    originalOverflow = document.body.style.overflow
  })

  afterEach(() => {
    document.body.style.overflow = originalOverflow
  })

  it('nao renderiza nada quando open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Fechado">
        <p>conteudo</p>
      </Modal>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renderiza backdrop + modal + titulo quando open=true', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Confirmar acao">
        <p>Voce tem certeza?</p>
      </Modal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Confirmar acao')
    expect(dialog).toHaveTextContent('Voce tem certeza?')
    expect(screen.getByLabelText('Fechar')).toBeInTheDocument()
  })

  it('aplica .modal--wide quando prop wide=true', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Largo" wide>
        <p>conteudo largo</p>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toHaveClass('modal modal--wide')
  })

  it('NAO aplica .modal--wide por padrao', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Normal">
        <p>conteudo</p>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toHaveClass('modal')
    expect(screen.getByRole('dialog').className).not.toContain('modal--wide')
  })

  it('aria-modal=true e aria-label sao aplicados', () => {
    render(
      <Modal open={true} onClose={() => {}} ariaLabel="Confirmacao personalizada">
        <p>conteudo</p>
      </Modal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Confirmacao personalizada')
  })

  it('aria-label cai pro title quando nao fornecido', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Meu titulo">
        <p>conteudo</p>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Meu titulo')
  })

  it('fecha ao pressionar Esc', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose} title="Esc test">
        <p>conteudo</p>
      </Modal>
    )
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('botao X chama onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose} title="Close button">
        <p>conteudo</p>
      </Modal>
    )
    act(() => {
      screen.getByLabelText('Fechar').click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('click no backdrop fecha, mas click DENTRO do modal nao fecha', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose} title="Backdrop test">
        <p>conteudo interno</p>
      </Modal>
    )

    // Click DENTRO do modal (no dialog) NAO fecha
    act(() => {
      screen.getByRole('dialog').click()
    })
    expect(onClose).not.toHaveBeenCalled()

    // Click no backdrop (no .modal-backdrop) fecha
    const backdrop = document.querySelector('.modal-backdrop')
    act(() => {
      fireEvent.click(backdrop)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bloqueia scroll do body quando aberto; restaura ao fechar', async () => {
    const { rerender } = render(
      <Modal open={true} onClose={() => {}} title="Scroll lock">
        <p>conteudo</p>
      </Modal>
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Modal open={false} onClose={() => {}} title="Scroll lock">
        <p>conteudo</p>
      </Modal>
    )
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  it('foco inicial vai para o PRIMEIRO focusable do modal (close button do header)', async () => {
    render(
      <Modal open={true} onClose={() => {}} title="Focus test">
        <button type="button">Confirmar</button>
      </Modal>
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    // Modal tem um botao close (x) no header, eh o primeiro focusable
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }))
  })
})

// --- Sprint 28: Focus trap + initial focus em focusable ---

describe('Modal focus trap (Sprint 28)', () => {
  let originalOverflow

  beforeEach(() => {
    originalOverflow = document.body.style.overflow
  })

  afterEach(() => {
    document.body.style.overflow = originalOverflow
  })

  it('foco inicial vai para o PRIMEIRO focusable quando ha botoes', async () => {
    function Wrapper() {
      const [open, setOpen] = React.useState(false)
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>Open modal</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Trap">
            <button type="button" data-testid="first">First</button>
            <button type="button" data-testid="last">Last</button>
          </Modal>
        </div>
      )
    }
    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: 'Open modal' }))
    // setTimeout(30) no Modal
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    // O Modal tem um botao close (x) no header como primeiro focusable
    const closeButton = screen.getByRole('button', { name: 'Fechar' })
    expect(document.activeElement).toBe(closeButton)
  })

  it('Tab no ultimo focusable volta para o primeiro', async () => {
    function Wrapper() {
      return (
        <Modal open={true} onClose={() => {}} title="Trap">
          <button type="button" data-testid="first">First</button>
          <button type="button" data-testid="last">Last</button>
        </Modal>
      )
    }
    render(<Wrapper />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    // Foco inicial no close (header); vamos para o last via foco direto
    const last = screen.getByTestId('last')
    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Tab' })
    // Volta pro primeiro focusable do modal: o close button do header
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }))
  })

  it('Shift+Tab no primeiro focusable vai para o ultimo', async () => {
    function Wrapper() {
      return (
        <Modal open={true} onClose={() => {}} title="Trap">
          <button type="button" data-testid="first">First</button>
          <button type="button" data-testid="last">Last</button>
        </Modal>
      )
    }
    render(<Wrapper />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    // Foco inicial no close; Shift+Tab leva ao ultimo
    const closeButton = screen.getByRole('button', { name: 'Fechar' })
    closeButton.focus()
    expect(document.activeElement).toBe(closeButton)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByTestId('last'))
  })
})
