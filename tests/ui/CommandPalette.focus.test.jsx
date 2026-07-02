// Tests do foco do input no CommandPalette (Sprint 23.2).
// Cobre:
//   - Input retem foco apos onMouseEnter em item
//   - Input retem foco apos activeIndex mudar
//   - Input retem foco apos filtered mudar
//   - Foco inicial no input quando abre
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import CommandPalette from '../../src/components/CommandPalette.jsx'

const COMMANDS = [
  { id: 'go-dashboard', label: 'Dashboard', group: 'Paginas', to: '/' },
  { id: 'go-news', label: 'Noticias', group: 'Paginas', to: '/news' },
  { id: 'go-processes', label: 'Chegadas', group: 'Paginas', to: '/processos' },
]

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

afterEach(() => {
  // Cleanup
})

describe('CommandPalette foco do input', () => {
  it('input recebe foco quando abre', async () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByLabelText('Buscar comandos')
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
  })

  it('input retem foco apos digitar (setQuery)', async () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByLabelText('Buscar comandos')
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    fireEvent.change(input, { target: { value: 'd' } })
    fireEvent.change(input, { target: { value: 'da' } })
    expect(document.activeElement).toBe(input)
  })

  it('input retem foco apos onMouseEnter em item', async () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByLabelText('Buscar comandos')
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    // Pega o primeiro item (Dashboard)
    const firstItem = screen.getByText('Dashboard').closest('li')
    fireEvent.mouseEnter(firstItem)
    // O input deve permanecer focado (mouseEnter re-foca via setActiveIndex)
    expect(document.activeElement).toBe(input)
  })

  it('onMouseDown no item nao rouba foco do input (preventDefault)', async () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByLabelText('Buscar comandos')
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    const firstItem = screen.getByText('Dashboard').closest('li')
    fireEvent.mouseDown(firstItem)
    // Foco continua no input
    expect(document.activeElement).toBe(input)
  })

  it('input retem foco apos digitar e ter varios resultados', async () => {
    renderWithRouter(<CommandPalette open={true} commands={COMMANDS} />)
    const input = screen.getByLabelText('Buscar comandos')
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
    // Digita algo que gera resultados
    fireEvent.change(input, { target: { value: 'p' } })
    expect(document.activeElement).toBe(input)
    // Passa mouse em varios items
    const items = screen.getAllByRole('option')
    items.forEach((item) => {
      fireEvent.mouseEnter(item)
      expect(document.activeElement).toBe(input)
    })
  })
})
