// Tests do componente Stagger (Sprint 21).
// Cobre:
//   - Render: children com classe stagger__item
//   - Cada filho recebe --stagger-delay incremental
//   - stepMs custom
//   - baseMs custom
//   - className extra no container
//   - children sem ser React element (string) nao quebra
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Stagger from '../../src/components/Stagger.jsx'

describe('Stagger', () => {
  it('render: children com classe stagger__item', () => {
    render(
      <Stagger>
        <div>1</div>
        <div>2</div>
        <div>3</div>
      </Stagger>
    )
    const items = screen.getAllByText(/^[123]$/)
    items.forEach((item) => {
      expect(item.className).toMatch(/\bstagger__item\b/)
    })
  })

  it('cada filho recebe --stagger-delay incremental (default 60ms)', () => {
    const { container } = render(
      <Stagger>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </Stagger>
    )
    const items = container.querySelectorAll('.stagger__item')
    expect(items[0].style.getPropertyValue('--stagger-delay')).toBe('0ms')
    expect(items[1].style.getPropertyValue('--stagger-delay')).toBe('60ms')
    expect(items[2].style.getPropertyValue('--stagger-delay')).toBe('120ms')
  })

  it('stepMs custom', () => {
    const { container } = render(
      <Stagger stepMs={100}>
        <div>x</div>
        <div>y</div>
      </Stagger>
    )
    const items = container.querySelectorAll('.stagger__item')
    expect(items[1].style.getPropertyValue('--stagger-delay')).toBe('100ms')
  })

  it('baseMs custom', () => {
    const { container } = render(
      <Stagger baseMs={200}>
        <div>x</div>
        <div>y</div>
      </Stagger>
    )
    const items = container.querySelectorAll('.stagger__item')
    expect(items[0].style.getPropertyValue('--stagger-delay')).toBe('200ms')
    expect(items[1].style.getPropertyValue('--stagger-delay')).toBe('260ms')
  })

  it('className extra no container', () => {
    const { container } = render(
      <Stagger className="extra">
        <div>x</div>
      </Stagger>
    )
    expect(container.firstChild.className).toMatch(/\bextra\b/)
  })

  it('preserva className do filho e adiciona stagger__item', () => {
    render(
      <Stagger>
        <div className="meu-card">x</div>
      </Stagger>
    )
    const el = screen.getByText('x')
    expect(el.className).toMatch(/\bmeu-card\b/)
    expect(el.className).toMatch(/\bstagger__item\b/)
  })

  it('preserva style do filho e merge com --stagger-delay', () => {
    const { container } = render(
      <Stagger>
        <div style={{ color: 'red' }}>x</div>
      </Stagger>
    )
    const item = container.querySelector('.stagger__item')
    expect(item.style.color).toBe('red')
    expect(item.style.getPropertyValue('--stagger-delay')).toBe('0ms')
  })
})
