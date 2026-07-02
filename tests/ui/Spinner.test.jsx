// Tests do componente Spinner (Sprint 30).
// Cobre:
//   - Render: role=status + aria-label
//   - Sizes: 12/14/16/20/24 (default 16)
//   - Label custom sobrescreve aria-label
//   - SVG presente com stroke currentColor
//   - className extra
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Spinner from '../../src/components/Spinner.jsx'

describe('Spinner', () => {
  it('render: role=status + aria-label default', () => {
    render(<Spinner />)
    const spinner = screen.getByRole('status')
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveAttribute('aria-label', 'Carregando')
  })

  it('label custom sobrescreve aria-label', () => {
    render(<Spinner label="Salvando processo" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Salvando processo')
  })

  it('default size = 16px', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
  })

  it('sizes: 12, 14, 20, 24', () => {
    const { rerender, container } = render(<Spinner size={12} />)
    expect(container.querySelector('svg').getAttribute('width')).toBe('12')

    rerender(<Spinner size={14} />)
    expect(container.querySelector('svg').getAttribute('width')).toBe('14')

    rerender(<Spinner size={20} />)
    expect(container.querySelector('svg').getAttribute('width')).toBe('20')

    rerender(<Spinner size={24} />)
    expect(container.querySelector('svg').getAttribute('width')).toBe('24')
  })

  it('size custom (nao mapeado) usa o valor direto', () => {
    const { container } = render(<Spinner size={32} />)
    expect(container.querySelector('svg').getAttribute('width')).toBe('32')
  })

  it('SVG tem stroke currentColor e classe spinner__svg', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.classList.contains('spinner__svg')).toBe(true)
  })

  it('SVG tem circle (track) + path (arc)', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')
    expect(svg.querySelector('circle')).toBeTruthy()
    expect(svg.querySelector('path')).toBeTruthy()
  })

  it('className extra', () => {
    const { container } = render(<Spinner className="meu" />)
    const spinner = container.querySelector('.spinner')
    expect(spinner.classList.contains('meu')).toBe(true)
  })
})
