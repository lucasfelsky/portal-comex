// Tests do componente FilterChip (Sprint 14).
// Cobre:
//   - Renderiza label
//   - Botao X presente quando onRemove fornecido
//   - onRemove e' chamado no click do X
//   - 6 variantes: default, primary, info, success, warning, danger
//   - 2 tamanhos: sm, md
//   - Sem onRemove: sem botao X
//   - aria-label descritivo no botao remover

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import FilterChip from '../../src/components/FilterChip.jsx'

describe('FilterChip', () => {
  it('renderiza o label', () => {
    render(<FilterChip label="Categoria: FCL" onRemove={() => {}} />)
    expect(screen.getByText('Categoria: FCL')).toBeInTheDocument()
  })

  it('renderiza botao remover quando onRemove fornecido', () => {
    render(<FilterChip label="X" onRemove={() => {}} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('onRemove e chamado no click do X', () => {
    const onRemove = vi.fn()
    render(<FilterChip label="Remover" onRemove={onRemove} />)
    const btn = screen.getByRole('button')
    btn.click()
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('sem onRemove: sem botao X', () => {
    render(<FilterChip label="Sem X" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('aria-label do botao X descreve o filtro', () => {
    render(<FilterChip label="Categoria: FCL" onRemove={() => {}} />)
    expect(screen.getByLabelText('Remover filtro Categoria: FCL')).toBeInTheDocument()
  })

  it('aplica variante primary', () => {
    const { container } = render(
      <FilterChip label="X" variant="primary" onRemove={() => {}} />
    )
    expect(container.querySelector('.filter-chip--primary')).toBeInTheDocument()
  })

  it('aplica variante info', () => {
    const { container } = render(
      <FilterChip label="X" variant="info" onRemove={() => {}} />
    )
    expect(container.querySelector('.filter-chip--info')).toBeInTheDocument()
  })

  it('aplica variante warning', () => {
    const { container } = render(
      <FilterChip label="X" variant="warning" onRemove={() => {}} />
    )
    expect(container.querySelector('.filter-chip--warning')).toBeInTheDocument()
  })

  it('aplica variante danger', () => {
    const { container } = render(
      <FilterChip label="X" variant="danger" onRemove={() => {}} />
    )
    expect(container.querySelector('.filter-chip--danger')).toBeInTheDocument()
  })

  it('aplica variante success', () => {
    const { container } = render(
      <FilterChip label="X" variant="success" onRemove={() => {}} />
    )
    expect(container.querySelector('.filter-chip--success')).toBeInTheDocument()
  })

  it('variant default quando nao fornecido', () => {
    const { container } = render(<FilterChip label="X" onRemove={() => {}} />)
    expect(container.querySelector('.filter-chip--default')).toBeInTheDocument()
  })

  it('aplica size sm', () => {
    const { container } = render(
      <FilterChip label="X" size="sm" onRemove={() => {}} />
    )
    expect(container.querySelector('.filter-chip--sm')).toBeInTheDocument()
  })

  it('size md por default', () => {
    const { container } = render(<FilterChip label="X" onRemove={() => {}} />)
    expect(container.querySelector('.filter-chip--md')).toBeInTheDocument()
  })

  it('className customizada aplicada', () => {
    const { container } = render(
      <FilterChip label="X" className="meu-chip" onRemove={() => {}} />
    )
    expect(container.querySelector('.filter-chip.meu-chip')).toBeInTheDocument()
  })
})
