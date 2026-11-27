// S11-J: aviso da leitura automática do COA como botão-ícone com pop-up (`CoaAutoReadNotice`). jsdom não aplica o CSS:
// o pop-up aberto é a classe `coa-auto-read-notice__tip--open`. Sem timers: a mensagem é persistente.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoaAutoReadNotice from '../../src/features/processes/CoaAutoReadNotice'
import CoaAutoReadStatus from '../../src/features/processes/CoaAutoReadStatus'

const INTERRUPTED = 'Leitura automática interrompida: A Tess recusou as credenciais do Portal. Use Ler COAs no formulário.'
const NOT_STARTED = 'Leitura automática não iniciada: só PDF é lido automaticamente.'
const CLOSED = 'O relatório já foi fechado; a leitura de COA é só no rascunho.'
const OPEN = 'coa-auto-read-notice__tip--open'

afterEach(() => {
  vi.useRealTimers()
})

describe('CoaAutoReadNotice', () => {
  it.each([
    [INTERRUPTED, 'Leitura automática interrompida'],
    [NOT_STARTED, 'Leitura automática não iniciada'],
    [CLOSED, 'Leitura automática não iniciada'],
  ])('botão com nome curto, pop-up com o texto exato e região oculta: %s', (text, name) => {
    render(<CoaAutoReadNotice text={text} />)
    const button = screen.getByRole('button', { name })
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe(text)
    expect(button).toHaveAccessibleDescription(text)
    expect(tip).not.toHaveClass(OPEN)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent(text)
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveClass('documents-visually-hidden')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button).toHaveAttribute('type', 'button')
  })

  it('abre ao passar o mouse e fecha ao sair', async () => {
    const user = userEvent.setup()
    render(<CoaAutoReadNotice text={NOT_STARTED} />)
    const button = screen.getByRole('button')
    await user.hover(button)
    expect(screen.getByRole('tooltip')).toHaveClass(OPEN)
    await user.unhover(button)
    expect(screen.getByRole('tooltip')).not.toHaveClass(OPEN)
  })

  it('abre ao focar pelo teclado e fecha ao sair do foco', async () => {
    const user = userEvent.setup()
    render(<CoaAutoReadNotice text={NOT_STARTED} />)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveClass(OPEN)
    await user.tab()
    expect(screen.getByRole('tooltip')).not.toHaveClass(OPEN)
  })

  it('Esc fecha o pop-up (com foco e só com o mouse em cima); passar o mouse de novo o devolve', async () => {
    const user = userEvent.setup()
    render(<CoaAutoReadNotice text={NOT_STARTED} />)
    const button = screen.getByRole('button')
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveClass(OPEN)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('tooltip')).not.toHaveClass(OPEN)

    await user.hover(button)
    expect(screen.getByRole('tooltip')).toHaveClass(OPEN)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('tooltip')).not.toHaveClass(OPEN)
  })

  it('toque (sem hover): abre, fecha no segundo toque e fecha ao tocar fora, sem timer', () => {
    vi.useFakeTimers()
    render(
      <div>
        <CoaAutoReadNotice text={NOT_STARTED} />
        <button type="button">fora</button>
      </div>
    )
    const button = screen.getByRole('button', { name: 'Leitura automática não iniciada' })
    const tip = screen.getByRole('tooltip')
    fireEvent.click(button)
    expect(tip).toHaveClass(OPEN)
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(tip).toHaveClass(OPEN)
    fireEvent.click(button)
    expect(tip).not.toHaveClass(OPEN)

    fireEvent.click(button)
    expect(tip).toHaveClass(OPEN)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'fora' }))
    expect(tip).not.toHaveClass(OPEN)
  })

  it('toque dentro do próprio aviso não o fecha; Esc fecha o que o toque abriu', () => {
    render(<CoaAutoReadNotice text={NOT_STARTED} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.pointerDown(screen.getByRole('tooltip'))
    expect(screen.getByRole('tooltip')).toHaveClass(OPEN)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('tooltip')).not.toHaveClass(OPEN)
  })
})

describe('CoaAutoReadStatus', () => {
  it('andamento e fila continuam texto; só o aviso vira ícone', () => {
    const status = 'Lendo os COAs: 1 de 3. Cada arquivo pode levar até 2 minutos.'
    render(<CoaAutoReadStatus autoRead={{ status, notice: NOT_STARTED }} />)
    expect(screen.getByText(status)).toHaveClass('coa-auto-read')
    expect(screen.getByRole('button', { name: 'Leitura automática não iniciada' })).toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(2)
  })

  it('sem status e sem aviso não renderiza nada', () => {
    const { container } = render(<CoaAutoReadStatus autoRead={{ status: '', notice: '' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('só o status (sem aviso): nenhum botão', () => {
    render(<CoaAutoReadStatus autoRead={{ status: 'Na fila para leitura.', notice: '' }} />)
    expect(screen.getByText('Na fila para leitura.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('CSS do aviso (styles.css)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8').replace(/\r\n/g, '\n')
  const block = (selector) => {
    const start = css.indexOf(`\n${selector} {`)
    expect(start).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('}', start))
  }

  it('botão de 36 px com área de toque de 44 px (::after), tom de aviso por tokens', () => {
    const button = block('.coa-auto-read-notice__button')
    expect(button).toMatch(/width: 36px;/)
    expect(button).toMatch(/height: 36px;/)
    expect(button).toMatch(/var\(--warning-700\)/)
    expect(block('.coa-auto-read-notice__button::after')).toMatch(/inset: -4px;/)
  })

  it('pop-up dentro do card: absoluto, limitado à largura da tela, escondido até abrir', () => {
    const tip = block('.coa-auto-read-notice__tip')
    expect(tip).toMatch(/position: absolute;/)
    expect(tip).toMatch(/max-width: min\(240px, calc\(100vw - 72px\)\);/)
    expect(tip).toMatch(/visibility: hidden;/)
    expect(block('.coa-auto-read-notice__tip--open')).toMatch(/visibility: visible;/)
  })

  it('trecho novo sem hex, sem @media e sem position fixed', () => {
    const start = css.indexOf('/* S11-J: aviso da leitura automática')
    expect(start).toBeGreaterThan(-1)
    const added = css.slice(start)
    expect(added).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(added).not.toMatch(/@media/)
    expect(added).not.toMatch(/position:\s*fixed/)
  })
})
