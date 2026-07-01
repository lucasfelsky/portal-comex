// Tests do componente EmptyState (Sprint 12).
// Cobre:
//   - Renderiza titulo + mensagem
//   - 4 illustrations: inbox, news, search, filter (cada uma SVG inline)
//   - Icon opcional (Icon name)
//   - Action slot (children ou botoes)
//   - Illustration desconhecida cai no inbox (fallback)
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import EmptyState from '../../src/components/EmptyState.jsx'

describe('EmptyState', () => {
  it('renderiza titulo e mensagem', () => {
    const { container } = render(
      <EmptyState title="Vazio" message="Nada por aqui" />
    )
    const title = container.querySelector('.empty-state__title')
    const message = container.querySelector('.empty-state__message')
    expect(title).toHaveTextContent('Vazio')
    expect(message).toHaveTextContent('Nada por aqui')
  })

  it('renderiza uma <svg> de ilustracao', () => {
    const { container } = render(
      <EmptyState illustration="inbox" title="X" />
    )
    const svg = container.querySelector('.empty-state__illustration svg')
    expect(svg).toBeInTheDocument()
  })

  it('4 illustrations conhecidas renderizam SVG', () => {
    for (const illustration of ['inbox', 'news', 'search', 'filter']) {
      const { container } = render(
        <EmptyState illustration={illustration} title="X" />
      )
      const svg = container.querySelector('.empty-state__illustration svg')
      expect(svg, `illustration ${illustration}`).toBeInTheDocument()
    }
  })

  it('illustration desconhecida cai no inbox (fallback)', () => {
    const { container } = render(
      <EmptyState illustration="nao-existe" title="X" />
    )
    const svg = container.querySelector('.empty-state__illustration svg')
    // Deve renderizar alguma coisa (fallback inbox)
    expect(svg).toBeInTheDocument()
  })

  it('renderiza icon (do componente Icon) quando passado', () => {
    const { container } = render(
      <EmptyState icon="inbox" title="X" />
    )
    // O icone renderiza um <svg class> dentro de .empty-state__icon
    const iconWrap = container.querySelector('.empty-state__icon')
    expect(iconWrap).toBeInTheDocument()
    expect(iconWrap.querySelector('svg')).toBeInTheDocument()
  })

  it('renderiza action slot quando passado', () => {
    const { container } = render(
      <EmptyState
        title="Vazio"
        message="Crie um"
        action={<button type="button">Criar</button>}
      />
    )
    const action = container.querySelector('.empty-state__action')
    expect(action).toBeInTheDocument()
    expect(action.querySelector('button')).toHaveTextContent('Criar')
  })

  it('className customizada aplicada', () => {
    const { container } = render(
      <EmptyState title="X" className="meu-empty" />
    )
    const root = container.querySelector('.empty-state')
    expect(root.classList.contains('meu-empty')).toBe(true)
  })

  it('role=status para acessibilidade', () => {
    const { container } = render(<EmptyState title="X" />)
    const root = container.querySelector('.empty-state')
    expect(root.getAttribute('role')).toBe('status')
  })

  it('nao renderiza title/message quando nao fornecidos', () => {
    const { container } = render(<EmptyState />)
    expect(container.querySelector('.empty-state__title')).toBeNull()
    expect(container.querySelector('.empty-state__message')).toBeNull()
  })
})
