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

// --- UX-1 (2026-09-25): role/initialFocusRef/ariaDescribedBy ---

describe('Modal role/initialFocusRef/ariaDescribedBy (UX-1)', () => {
  let originalOverflow

  beforeEach(() => {
    originalOverflow = document.body.style.overflow
  })

  afterEach(() => {
    document.body.style.overflow = originalOverflow
  })

  it('role default continua "dialog"', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Default role">
        <p>conteudo</p>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('role="alertdialog" e aplicado quando informado', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Alert role" role="alertdialog">
        <p>conteudo</p>
      </Modal>
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('initialFocusRef recebe o foco em vez do botao ×', async () => {
    function Wrapper() {
      const cancelRef = React.useRef(null)
      return (
        <Modal open={true} onClose={() => {}} title="Focus ref" initialFocusRef={cancelRef}>
          <button type="button" ref={cancelRef}>Cancelar</button>
          <button type="button">Confirmar</button>
        </Modal>
      )
    }
    render(<Wrapper />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
  })

  it('aria-describedby e aplicado quando informado', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Described" ariaDescribedBy="msg-id">
        <p id="msg-id">Descricao do dialogo</p>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby', 'msg-id')
  })
})

// Refino F4d: Modal "bare" (sem cabecalho padrao), pilha de modais e scrim que nao fecha.
describe('Modal - bare, pilha e closeOnBackdrop (F4d)', () => {
  it('bare: sem titulo/botao "x"/alca; o conteudo traz o proprio cabecalho', () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="Editar processo" bare>
        <button type="button">Fechar daqui</button>
      </Modal>
    )
    const dialog = screen.getByRole('dialog', { name: 'Editar processo' })
    expect(dialog.querySelector('.modal__header')).toBeNull()
    expect(dialog.querySelector('.modal__sheet-handle')).toBeNull()
    expect(dialog.querySelector('.modal__close')).toBeNull()
    expect(screen.getByRole('button', { name: 'Fechar daqui' })).toBeInTheDocument()
  })

  it('closeOnBackdrop={false}: clicar no scrim nao fecha; Esc continua fechando', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Form" closeOnBackdrop={false}>
        <p>conteudo</p>
      </Modal>
    )
    fireEvent.click(document.querySelector('.modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('modais empilhados: Esc fecha so o do topo e o Tab fica preso no topo', async () => {
    const onCloseBottom = vi.fn()
    const onCloseTop = vi.fn()
    render(
      <>
        <Modal open onClose={onCloseBottom} title="Embaixo">
          <button type="button">A</button>
        </Modal>
        <Modal open onClose={onCloseTop} title="Em cima" role="alertdialog">
          <button type="button">B</button>
        </Modal>
      </>
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCloseTop).toHaveBeenCalledTimes(1)
    expect(onCloseBottom).not.toHaveBeenCalled()

    const top = screen.getByRole('alertdialog')
    const bottomButton = screen.getByRole('button', { name: 'A' })
    bottomButton.focus()
    // O listener do modal de baixo ignora o Tab (nao arrasta o foco de volta para ele).
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(top.contains(document.activeElement)).toBe(true)
  })

  it('ao fechar o do topo, o de baixo volta a tratar o Esc', async () => {
    const onCloseBottom = vi.fn()
    function Stack({ topOpen }) {
      return (
        <>
          <Modal open onClose={onCloseBottom} title="Embaixo"><p>a</p></Modal>
          {topOpen ? <Modal open onClose={() => {}} title="Em cima"><p>b</p></Modal> : null}
        </>
      )
    }
    const { rerender } = render(<Stack topOpen />)
    rerender(<Stack topOpen={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCloseBottom).toHaveBeenCalledTimes(1)
  })
})
