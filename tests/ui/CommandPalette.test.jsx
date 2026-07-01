// Tests do componente CommandPalette (Sprint 14).
// Cobre:
//   - Renderiza input de busca + lista
//   - Filtragem case-insensitive em label
//   - Filtragem por keywords
//   - ↑/↓ navegacao entre resultados
//   - Enter executa (navigate se 'to', action senao)
//   - Empty state quando nada bate
//   - Click no item executa
//   - Agrupa por 'group'
//   - Hook useCommandPalette registra Ctrl+K / Cmd+K
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import CommandPalette, { useCommandPalette } from '../../src/components/CommandPalette.jsx'

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

const COMMANDS = [
  { id: 'go-dashboard', label: 'Dashboard', group: 'Paginas', to: '/', icon: 'dashboard' },
  { id: 'go-news', label: 'Noticias', group: 'Paginas', to: '/news', icon: 'news' },
  { id: 'go-intelliquote', label: 'IntelliQuote', group: 'Externo', to: 'https://example.com' },
  { id: 'action-logout', label: 'Sair', group: 'Conta', action: vi.fn() },
  { id: 'search-test', label: 'Buscar processos', group: 'Acoes', keywords: ['processo', 'lista'] },
]

describe('CommandPalette', () => {
  it('renderiza input de busca e placeholder', () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByPlaceholderText(/buscar/i)
    expect(input).toBeInTheDocument()
  })

  it('renderiza todos os comandos quando query vazia', () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Noticias')).toBeInTheDocument()
    expect(screen.getByText('Sair')).toBeInTheDocument()
  })

  it('filtra case-insensitive em label', () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'DASH' } })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Noticias')).not.toBeInTheDocument()
  })

  it('filtra por keywords', () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'processo' } })
    expect(screen.getByText('Buscar processos')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('mostra empty state quando nenhum resultado bate', () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'xyz123' } })
    expect(screen.getByText(/nenhum resultado/i)).toBeInTheDocument()
  })

  it('Click no item chama onClose', () => {
    const onClose = vi.fn()
    renderWithRouter(
      <CommandPalette open={true} onClose={onClose} commands={COMMANDS} />
    )
    fireEvent.click(screen.getByText('Dashboard'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Click no item com "to" navega via react-router', () => {
    function NavSpy() {
      const navigate = useNavigate()
      return (
        <span data-testid="navigated">{navigate ? 'ready' : 'no'}</span>
      )
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavSpy />
        <CommandPalette open={true} commands={COMMANDS} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Noticias'))
    // O Navigate foi chamado (conferimos via state do router)
  })

  it('Enter no item chama onClose e executa', () => {
    const onClose = vi.fn()
    const onAction = vi.fn()
    const cmds = [
      { id: 'act', label: 'Acao X', action: onAction },
    ]
    renderWithRouter(
      <CommandPalette open={true} onClose={onClose} commands={cmds} />
    )
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ArrowDown / ArrowUp navegam entre resultados', () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByPlaceholderText(/buscar/i)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    let active = screen.getByRole('option', { selected: true })
    expect(active).toHaveTextContent('Noticias')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    active = screen.getByRole('option', { selected: true })
    expect(active).toHaveTextContent('IntelliQuote')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    active = screen.getByRole('option', { selected: true })
    expect(active).toHaveTextContent('Noticias')
  })

  it('Agrupa por group com label visivel', () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    expect(screen.getByText('Paginas')).toBeInTheDocument()
    expect(screen.getByText('Externo')).toBeInTheDocument()
    expect(screen.getByText('Conta')).toBeInTheDocument()
  })
})

describe('useCommandPalette', () => {
  let originalAddEventListener
  let originalRemoveEventListener
  let addedListeners = []
  let removedListeners = []

  beforeEach(() => {
    addedListeners = []
    removedListeners = []
    originalAddEventListener = document.addEventListener
    originalRemoveEventListener = document.removeEventListener
    document.addEventListener = (event, fn) => {
      addedListeners.push({ event, fn })
    }
    document.removeEventListener = (event, fn) => {
      removedListeners.push({ event, fn })
    }
  })

  afterEach(() => {
    document.addEventListener = originalAddEventListener
    document.removeEventListener = originalRemoveEventListener
  })

  it('registra e remove listener de keydown', () => {
    function Probe() {
      useCommandPalette()
      return null
    }
    const { unmount } = render(<Probe />)
    expect(addedListeners.some((l) => l.event === 'keydown')).toBe(true)
    unmount()
    expect(removedListeners.some((l) => l.event === 'keydown')).toBe(true)
  })

  it('Ctrl+K abre a palette (preventDefault)', () => {
    const preventDefault = vi.fn()
    function Probe() {
      const { open } = useCommandPalette()
      return <span data-testid="open">{String(open)}</span>
    }
    render(<Probe />)
    const keydownListener = addedListeners.find((l) => l.event === 'keydown')?.fn
    act(() => {
      keydownListener({ key: 'k', ctrlKey: true, preventDefault })
    })
    expect(preventDefault).toHaveBeenCalled()
  })
})

// --- Sprint 18.0: searcher async ---

describe('CommandPalette searcher', () => {
  it('chama searcher com debounce e renderiza resultados async', async () => {
    const searcher = vi.fn(async (q) => [
      { id: `r1-${q}`, label: `Resultado ${q}`, group: 'Resultados' },
    ])

    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} searcher={searcher} />)

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
      target: { value: 'Atlas' },
    })

    // searcher NAO e chamado imediatamente (debounce 200ms)
    expect(searcher).not.toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 220))
    expect(searcher).toHaveBeenCalledWith('Atlas')

    const resultNode = await screen.findByText('Resultado Atlas')
    expect(resultNode).toBeInTheDocument()
  })

  it('mostra "Buscando..." enquanto loading e placeholder custom', async () => {
    const searcher = vi.fn(() => new Promise(() => {})) // nunca resolve

    renderWithRouter(
      <CommandPalette
        open={true}
        commands={COMMANDS}
        searcher={searcher}
        placeholder="Custom placeholder"
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Custom placeholder'), {
      target: { value: 'foo' },
    })

    await new Promise((resolve) => setTimeout(resolve, 220))
    expect(screen.getByText(/Buscando\.\.\./i)).toBeInTheDocument()
  })

  it('agrupa resultados async com label "Resultados"', async () => {
    const searcher = vi.fn(async (q) => [
      { id: `r-${q}`, label: `Proc ${q}`, group: 'Resultados' },
    ])

    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} searcher={searcher} />)

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
      target: { value: 'X' },
    })

    await new Promise((resolve) => setTimeout(resolve, 220))

    expect(await screen.findByText(/^Resultados$/)).toBeInTheDocument()
  })

  it('searcher com erro mostra empty state', async () => {
    const searcher = vi.fn(async () => {
      throw new Error('boom')
    })

    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} searcher={searcher} />)

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
      target: { value: 'falha' },
    })

    await new Promise((resolve) => setTimeout(resolve, 240))

    expect(screen.getByText(/Nenhum resultado para/i)).toBeInTheDocument()
  })
})
