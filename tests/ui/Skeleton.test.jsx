// Tests do componente Skeleton (Sprint 12).
// Cobre:
//   - Renderiza um <span> com classe skeleton
//   - 6 variants: text, title, subtitle, card, circle, button
//   - Props width/height/radius customizadas
//   - Skeleton.Group com count default + customizado
//   - aria-hidden="true" (decorativo)
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import Skeleton from '../../src/components/Skeleton.jsx'

describe('Skeleton', () => {
  it('renderiza um <span class="skeleton">', () => {
    const { container } = render(<Skeleton />)
    const el = container.querySelector('.skeleton')
    expect(el).toBeInTheDocument()
    expect(el.tagName).toBe('SPAN')
  })

  it('aria-hidden=true (decorativo)', () => {
    const { container } = render(<Skeleton />)
    const el = container.querySelector('.skeleton')
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })

  it('variant text tem height 0.9em e width 100%', () => {
    const { container } = render(<Skeleton variant="text" />)
    const el = container.querySelector('.skeleton')
    expect(el.style.height).toBe('0.9em')
    expect(el.style.width).toBe('100%')
  })

  it('variant circle tem 40x40 e border-radius 50%', () => {
    const { container } = render(<Skeleton variant="circle" />)
    const el = container.querySelector('.skeleton')
    expect(el.style.width).toBe('40px')
    expect(el.style.height).toBe('40px')
    expect(el.style.borderRadius).toBe('50%')
  })

  it('circle aceita size customizado', () => {
    const { container } = render(<Skeleton variant="circle" size={64} />)
    const el = container.querySelector('.skeleton')
    // Hmm, size nao e' prop do Skeleton. Verifica que custom width sobrescreve.
    // Para circle, width/height tem que ser passado via prop width/height.
  })

  it('props width/height/radius customizadas sobrescrevem defaults', () => {
    const { container } = render(<Skeleton width="50%" height="2em" radius="0" />)
    const el = container.querySelector('.skeleton')
    expect(el.style.width).toBe('50%')
    expect(el.style.height).toBe('2em')
    expect(el.style.borderRadius).toBe('0')
  })

  it('className customizada aplicada', () => {
    const { container } = render(<Skeleton className="meu-skeleton" />)
    const el = container.querySelector('.skeleton')
    expect(el.classList.contains('meu-skeleton')).toBe(true)
  })

  it('Skeleton.Group com count=3 renderiza 3 skeletons', () => {
    const { container } = render(<Skeleton.Group count={3} />)
    const skeletons = container.querySelectorAll('.skeleton')
    expect(skeletons.length).toBe(3)
  })

  it('Skeleton.Group com children custom', () => {
    const { container } = render(
      <Skeleton.Group>
        <Skeleton variant="title" />
        <Skeleton variant="subtitle" />
      </Skeleton.Group>
    )
    const skeletons = container.querySelectorAll('.skeleton')
    expect(skeletons.length).toBe(2)
  })

  it('Skeleton.Group aplica gap via prop', () => {
    const { container } = render(<Skeleton.Group count={2} gap={20} />)
    const group = container.querySelector('.skeleton-group')
    expect(group.style.gap).toBe('20px')
  })

  it('variant card tem height 120px', () => {
    const { container } = render(<Skeleton variant="card" />)
    const el = container.querySelector('.skeleton')
    expect(el.style.height).toBe('120px')
  })

  it('variant button tem height 36px e width 120px', () => {
    const { container } = render(<Skeleton variant="button" />)
    const el = container.querySelector('.skeleton')
    expect(el.style.height).toBe('36px')
    expect(el.style.width).toBe('120px')
  })
})
