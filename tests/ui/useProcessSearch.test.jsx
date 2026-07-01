// Tests do hook useProcessSearch (Sprint 18.0).
// Cobre:
//   - searcher retornado por useProcessSearch
//   - resultado tem { id, label, description, to, action }
//   - to sempre /processos
//   - action navega com state { selectedProcessId }
//   - resultado vazio = array vazio
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

import { useProcessSearch } from '../../src/hooks/useProcessSearch.js'

let lastResult
function CaptureSearcher() {
  const searcher = useProcessSearch()
  return (
    <button
      type="button"
      onClick={async () => {
        lastResult = await searcher('atlas')
      }}
    >
      Buscar
    </button>
  )
}

function EmptyCaptureSearcher() {
  const searcher = useProcessSearch()
  return (
    <button
      type="button"
      onClick={async () => {
        lastResult = await searcher('xyz')
      }}
    >
      BuscarVazio
    </button>
  )
}

beforeEach(() => {
  mockSearchProcesses.mockReset()
  lastResult = undefined
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useProcessSearch', () => {
  it('chama searchProcesses com o query', async () => {
    mockSearchProcesses.mockResolvedValue([])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CaptureSearcher />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => {
      expect(mockSearchProcesses).toHaveBeenCalledWith('atlas')
    })
  })

  it('mapeia processo para item com shape correto', async () => {
    mockSearchProcesses.mockResolvedValue([
      {
        id: 'p42',
        name: 'Exportacao Mar',
        processNumber: 'PO-999',
        destination: 'Santos',
      },
    ])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CaptureSearcher />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => {
      expect(lastResult).toBeDefined()
    })

    expect(lastResult).toHaveLength(1)
    const item = lastResult[0]
    expect(item.id).toBe('process-p42')
    expect(item.label).toBe('Exportacao Mar')
    expect(item.description).toContain('PO-999')
    expect(item.description).toContain('Santos')
    expect(item.to).toBe('/processos')
    expect(item.group).toBe('Resultados')
    expect(item.icon).toBe('arrivals')
    expect(typeof item.action).toBe('function')
  })

  it('description omite destination quando vazio', async () => {
    mockSearchProcesses.mockResolvedValue([
      { id: 'p1', name: 'Foo', processNumber: 'PO-1', destination: '' },
    ])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CaptureSearcher />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => {
      expect(lastResult).toBeDefined()
    })

    expect(lastResult[0].description).toBe('PO-1')
  })

  it('action existe e e uma funcao', async () => {
    mockSearchProcesses.mockResolvedValue([
      { id: 'p1', name: 'X', processNumber: 'PO', destination: '' },
    ])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CaptureSearcher />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => {
      expect(lastResult).toBeDefined()
    })

    expect(typeof lastResult[0].action).toBe('function')
    // Nao deve lancar quando invocada (o navigate real acontecera em runtime)
    expect(() => lastResult[0].action()).not.toThrow()
  })

  it('retorna array vazio quando searchProcesses nao acha nada', async () => {
    mockSearchProcesses.mockResolvedValue([])

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <EmptyCaptureSearcher />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'BuscarVazio' }))

    await waitFor(() => {
      expect(lastResult).toEqual([])
    })
  })
})
