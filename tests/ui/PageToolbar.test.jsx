// Tests do componente PageToolbar (Sprint 17.1).
// Cobre:
//   - Render basico: title + eyebrow + description + actions
//   - Children como slot livre
//   - className extra
//   - Renderiza sem campos opcionais
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import PageToolbar from '../../src/components/PageToolbar.jsx'

describe('PageToolbar', () => {
  it('render basico: title + eyebrow + description', () => {
    render(
      <PageToolbar
        eyebrow="Admin"
        title="Centro administrativo"
        description="Gerencie cadastros"
      />
    )
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Centro administrativo')).toBeInTheDocument()
    expect(screen.getByText('Gerencie cadastros')).toBeInTheDocument()
  })

  it('render actions como ReactNode', () => {
    render(
      <PageToolbar
        title="Pagina"
        actions={
          <>
            <button type="button">Cancelar</button>
            <button type="button">Salvar</button>
          </>
        }
      />
    )
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument()
  })

  it('children como slot livre', () => {
    render(
      <PageToolbar>
        <div data-testid="custom">Custom content</div>
      </PageToolbar>
    )
    expect(screen.getByTestId('custom')).toBeInTheDocument()
  })

  it('className extra', () => {
    const { container } = render(<PageToolbar title="A" className="extra" />)
    expect(container.firstChild.className).toMatch(/\bextra\b/)
  })

  it('renderiza sem campos opcionais', () => {
    render(<PageToolbar title="So titulo" />)
    expect(screen.getByText('So titulo')).toBeInTheDocument()
    expect(screen.queryByText(/.+/)).not.toBeNull()
  })
})
