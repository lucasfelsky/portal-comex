// Tests do ProcessDerivedStatusBadge.
// Cobre: label correto, tone class, className custom, valor default
// (sem props) nao quebra.

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

import ProcessDerivedStatusBadge from '../../src/features/processes/ProcessDerivedStatusBadge'

describe('ProcessDerivedStatusBadge', () => {
  it('renderiza label "Em transito" para processo sem status finalizado', () => {
    // Sem processStatus, collectionStatus etc — cai no default Em transito.
    render(
      <ProcessDerivedStatusBadge
        process={{ status: 'Em Andamento', etapas: [] }}
      />
    )
    expect(screen.getByText('Em tr\u00e2nsito')).toBeInTheDocument()
  })

  it('aplica tone class status-tag--ok quando processo esta finalizado (Carga recebida)', () => {
    const { container } = render(
      <ProcessDerivedStatusBadge
        process={{
          processStatus: 'Carga recebida',
        }}
      />
    )
    const badge = container.querySelector('.process-derived-status-badge')
    expect(badge?.className).toMatch(/status-tag--ok/)
    expect(badge?.textContent).toBe('Conclu\u00eddo')
  })

  it('renderiza label "Em transito" para processo minimo (apenas status)', () => {
    const { container } = render(
      <ProcessDerivedStatusBadge
        process={{ status: 'Pendente', etapas: [] }}
      />
    )
    const badge = container.querySelector('.process-derived-status-badge')
    expect(badge?.textContent).toBe('Em tr\u00e2nsito')
  })

  it('aceita className custom e mergea com classes padrao', () => {
    const { container } = render(
      <ProcessDerivedStatusBadge
        process={{ status: 'Pendente' }}
        className="minha-classe-custom"
      />
    )
    const badge = container.querySelector('.process-derived-status-badge')
    expect(badge).toBeInTheDocument()
    expect(badge?.className).toMatch(/minha-classe-custom/)
    expect(badge?.className).toMatch(/process-derived-status-badge/)
  })

  it('tem title explicativo para acessibilidade', () => {
    const { container } = render(
      <ProcessDerivedStatusBadge
        process={{ status: 'Pendente' }}
      />
    )
    const badge = container.querySelector('.process-derived-status-badge')
    expect(badge?.getAttribute('title')).toBeTruthy()
  })

  it('nao quebra quando process e undefined ou vazio', () => {
    const { container: c1 } = render(<ProcessDerivedStatusBadge />)
    expect(c1.querySelector('.process-derived-status-badge')).toBeInTheDocument()

    const { container: c2 } = render(<ProcessDerivedStatusBadge process={{}} />)
    expect(c2.querySelector('.process-derived-status-badge')).toBeInTheDocument()
  })

  it('aplica tone class status-tag--warn para fase No porto', () => {
    const { container } = render(
      <ProcessDerivedStatusBadge
        process={{
          processStatus: 'Atracação confirmada',
        }}
      />
    )
    const badge = container.querySelector('.process-derived-status-badge')
    expect(badge?.className).toMatch(/status-tag--warn/)
  })
})
