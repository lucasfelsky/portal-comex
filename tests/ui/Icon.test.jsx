// Tests do componente Icon (Sprint 11).
// Cobre:
//   - Renderiza SVG com viewBox 24x24 + stroke currentColor
//   - Icones conhecidos: dashboard, news, arrivals, admin, bell, check, external
//   - Icon desconhecido retorna null
//   - Props size + className sao aplicadas
//   - aria-hidden + focusable (decorativo)
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import Icon from '../../src/components/Icon.jsx'

describe('Icon', () => {
  it('renderiza um <svg> com viewBox 24x24 e stroke=currentColor', () => {
    const { container } = render(<Icon name="dashboard" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
  })

  it('renderiza paths/shapes para cada icone conhecido', () => {
    const KNOWN = [
      'dashboard', 'news', 'arrivals', 'admin', 'bell', 'check', 'external',
      'logout', 'edit', 'trash', 'plus', 'search', 'download', 'chevron',
      'dollar', 'trend', 'sparkle', 'inbox',
    ]
    for (const name of KNOWN) {
      const { container } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      // Cada icone tem pelo menos 1 path/rect/circle
      const children = svg.children
      expect(children.length, `icon ${name}`).toBeGreaterThan(0)
    }
  })

  it('icone desconhecido retorna null (sem crash)', () => {
    const { container } = render(<Icon name="nao-existe" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('aceita prop size e aplica width/height', () => {
    const { container } = render(<Icon name="check" size={24} />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })

  it('aceita prop className e aplica ao svg', () => {
    const { container } = render(<Icon name="check" className="meu-icon" />)
    const svg = container.querySelector('svg')
    expect(svg.classList.contains('meu-icon')).toBe(true)
  })

  it('aceita prop strokeWidth customizado', () => {
    const { container } = render(<Icon name="check" strokeWidth={2.5} />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('stroke-width')).toBe('2.5')
  })

  it('default size e 18px, default strokeWidth 1.75', () => {
    const { container } = render(<Icon name="check" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('18')
    expect(svg.getAttribute('height')).toBe('18')
    expect(svg.getAttribute('stroke-width')).toBe('1.75')
  })
})
