// Tests do hook useGlobalSearch (Sprint 23).
// Cobre:
//   - searcher retorna array vazio pra query curta
//   - searcher mapeia processos para items
//   - Processos sao agrupados como 'Resultados'
//   - recentSearches persistem em localStorage
//   - clearRecent limpa o historico
//   - max 5 items no historico
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockSearchProcesses = vi.fn()

vi.mock('../../src/services/processesRepository', () => ({
  searchProcesses: (q) => mockSearchProcesses(q),
}))

import { useGlobalSearch } from '../../src/hooks/useGlobalSearch.js'

let lastResult
function Probe({ isAdmin } = {}) {
  const { searcher, recentSearches, clearRecent } = useGlobalSearch(isAdmin)
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          searcher('atlas').then((items) => {
            lastResult = items
          })
        }}
      >
        SearchAtlas
      </button>
      <button
        type="button"
        onClick={() => {
          searcher('a').then((items) => {
            lastResult = items
          })
        }}
      >
        SearchShort
      </button>
      <span data-testid="recent">{recentSearches.join('|')}</span>
      <button type="button" onClick={() => clearRecent()}>
        Clear
      </button>
    </div>
  )
}

const STORAGE_KEY = 'sq-comex:cmd-history'

beforeEach(() => {
  mockSearchProcesses.mockReset()
  window.localStorage.clear()
  lastResult = undefined
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useGlobalSearch', () => {
  it('query curta (< 2 chars): retorna array vazio', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'SearchShort' }))
    await waitFor(() => {
      expect(lastResult).toBeDefined()
    })
    expect(lastResult).toEqual([])
  })

  it('mapeia processos para items com grupo Resultados', async () => {
    mockSearchProcesses.mockResolvedValue([
      { id: 'p1', name: 'Importacao Atlas', processNumber: 'PO-1', destination: 'Itajai' },
      { id: 'p2', name: 'Exportacao Mar', processNumber: 'PO-2', destination: 'Santos' },
    ])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'SearchAtlas' }))

    await waitFor(() => {
      expect(lastResult).toHaveLength(2)
    })
    expect(lastResult[0].group).toBe('Resultados')
    expect(lastResult[0].label).toBe('Importacao Atlas')
    expect(lastResult[1].group).toBe('Resultados')
  })

  it('oculta o nome do processo em categoria restrita (FCL) para nao-admin', async () => {
    mockSearchProcesses.mockResolvedValue([
      { id: 'p1', name: 'Importacao Atlas', processNumber: 'PO-1', category: 'FCL', destination: 'Itajai' },
    ])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe isAdmin={false} />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'SearchAtlas' }))

    await waitFor(() => {
      expect(lastResult).toHaveLength(1)
    })
    expect(lastResult[0].label).toBe('PO: PO-1')
  })

  it('mostra o nome do processo em categoria restrita (FCL) para admin', async () => {
    mockSearchProcesses.mockResolvedValue([
      { id: 'p1', name: 'Importacao Atlas', processNumber: 'PO-1', category: 'FCL', destination: 'Itajai' },
    ])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe isAdmin />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'SearchAtlas' }))

    await waitFor(() => {
      expect(lastResult).toHaveLength(1)
    })
    expect(lastResult[0].label).toBe('Importacao Atlas')
  })

  it('adiciona query ao recentSearches', async () => {
    mockSearchProcesses.mockResolvedValue([])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'SearchAtlas' }))

    await waitFor(() => {
      expect(screen.getByTestId('recent')).toHaveTextContent('atlas')
    })
  })

  it('clearRecent limpa o historico', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['foo', 'bar']))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    )
    expect(screen.getByTestId('recent')).toHaveTextContent('foo|bar')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByTestId('recent')).toHaveTextContent('')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('[]')
  })

  it('max 5 items no historico (FIFO)', async () => {
    mockSearchProcesses.mockResolvedValue([])

    const Multi = () => {
      const { searcher, recentSearches } = useGlobalSearch()
      return (
        <div>
          {['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((q) => (
            <button key={q} type="button" onClick={() => searcher(q)}>
              {q}
            </button>
          ))}
          <span data-testid="recent">{recentSearches.join('|')}</span>
        </div>
      )
    }

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Multi />
      </MemoryRouter>
    )
    for (const q of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) {
      await user.click(screen.getByRole('button', { name: q }))
      await waitFor(() => {
        expect(screen.getByTestId('recent').textContent.split('|')[0]).toBe(q)
      })
    }

    const recent = screen.getByTestId('recent').textContent.split('|')
    expect(recent).toHaveLength(5)
    expect(recent[0]).toBe('q6')
    expect(recent[4]).toBe('q2') // q1 foi removido
  })

  it('resultados de processo tem action que navega com state', async () => {
    mockSearchProcesses.mockResolvedValue([
      { id: 'p1', name: 'X', processNumber: 'PO', destination: 'Y' },
    ])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'SearchAtlas' }))

    await waitFor(() => {
      expect(lastResult).toHaveLength(1)
    })
    const item = lastResult[0]
    expect(item.to).toBe('/processos')
    expect(item.id).toBe('process-p1')
    expect(typeof item.action).toBe('function')
    // Nao deve lancar ao executar
    expect(() => item.action()).not.toThrow()
  })

  it('searcher com erro: retorna array vazio (graceful)', async () => {
    mockSearchProcesses.mockRejectedValue(new Error('boom'))

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'SearchAtlas' }))

    await waitFor(() => {
      expect(lastResult).toEqual([])
    })
  })
})
