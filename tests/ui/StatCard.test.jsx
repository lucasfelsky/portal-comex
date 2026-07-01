// Tests do componente StatCard (Sprint 14).
// Cobre:
//   - Renderiza label + value
//   - Icon opcional (Icon name)
//   - Trend up: +X% em pill success
//   - Trend down: -X% em pill danger
//   - Trend neutral: 0% em pill neutral
//   - Sparkline SVG com path d= (line + area)
//   - Period opcional
//   - Sem trend, sem sparkline, sem period: renderiza minimo

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import StatCard from '../../src/components/StatCard.jsx'

describe('StatCard', () => {
  it('renderiza label e value', () => {
    render(<StatCard label="Ativos" value="42" />)
    expect(screen.getByText('Ativos')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renderiza um icone quando icon e fornecido', () => {
    const { container } = render(
      <StatCard label="X" value="0" icon="dashboard" />
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('trend positivo: pill +X% em success', () => {
    render(
      <StatCard
        label="Ativos"
        value="42"
        trend={{ delta: 12, period: 'vs. semana passada' }}
      />
    )
    const pill = screen.getByText('+12%')
    expect(pill).toBeInTheDocument()
    expect(pill.closest('.stat-card__trend')).toHaveClass('stat-card__trend--up')
  })

  it('trend negativo: pill -X% em danger', () => {
    render(
      <StatCard
        label="Ativos"
        value="42"
        trend={{ delta: -8 }}
      />
    )
    const pill = screen.getByText('-8%')
    expect(pill.closest('.stat-card__trend')).toHaveClass('stat-card__trend--down')
  })

  it('trend zero: pill 0% em neutral', () => {
    render(
      <StatCard label="X" value="0" trend={{ delta: 0 }} />
    )
    const pill = screen.getByText('0%')
    expect(pill.closest('.stat-card__trend')).toHaveClass('stat-card__trend--neutral')
  })

  it('sparkline: renderiza SVG com path d=', () => {
    const { container } = render(
      <StatCard
        label="X"
        value="0"
        sparkline={[1, 2, 3, 4, 5]}
      />
    )
    const sparkline = container.querySelector('.stat-card__sparkline')
    expect(sparkline).toBeInTheDocument()
    // Pelo menos 2 paths (line + area)
    const paths = sparkline.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
    paths.forEach((p) => {
      expect(p.getAttribute('d')).toBeTruthy()
    })
  })

  it('sem sparkline: nao renderiza SVG de sparkline', () => {
    const { container } = render(<StatCard label="X" value="0" />)
    expect(container.querySelector('.stat-card__sparkline')).toBeNull()
  })

  it('renderiza period quando fornecido', () => {
    render(
      <StatCard
        label="X"
        value="0"
        trend={{ delta: 5, period: 'ultimos 7 dias' }}
      />
    )
    expect(screen.getByText('ultimos 7 dias')).toBeInTheDocument()
  })

  it('aria-label no trend pill descreve variacao', () => {
    render(
      <StatCard
        label="Ativos"
        value="42"
        trend={{ delta: 12, period: 'semana' }}
      />
    )
    const pill = screen.getByText('+12%').closest('.stat-card__trend')
    expect(pill.getAttribute('aria-label')).toContain('+12%')
    expect(pill.getAttribute('aria-label')).toContain('semana')
  })

  it('className customizada aplicada', () => {
    const { container } = render(
      <StatCard label="X" value="0" className="meu-stat" />
    )
    expect(container.querySelector('.stat-card.meu-stat')).toBeInTheDocument()
  })
})
