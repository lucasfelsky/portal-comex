// Tests do componente Tooltip (Sprint 19.0).
// Cobre:
//   - Sem label: retorna children direto
//   - Com label: wrappa em span com data-tooltip + classe tooltip
//   - side default = top
//   - side custom (bottom/left/right)
//   - className extra
//   - tabIndex 0 pra ser focavel
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Tooltip from '../../src/components/Tooltip.jsx'

describe('Tooltip', () => {
  it('sem label: retorna children direto sem wrapper', () => {
    const { container } = render(
      <Tooltip>
        <button>Click me</button>
      </Tooltip>
    )
    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button).toBeInTheDocument()
    expect(container.querySelector('.tooltip')).toBeNull()
  })

  it('com label: wrappa em span .tooltip com data-tooltip', () => {
    render(
      <Tooltip label="Abrir menu">
        <button>X</button>
      </Tooltip>
    )
    const wrapper = screen.getByRole('button', { name: 'X' }).parentElement
    expect(wrapper.className).toMatch(/\btooltip\b/)
    expect(wrapper.getAttribute('data-tooltip')).toBe('Abrir menu')
  })

  it('side default: tooltip--top', () => {
    render(
      <Tooltip label="top">
        <button>X</button>
      </Tooltip>
    )
    const wrapper = screen.getByRole('button', { name: 'X' }).parentElement
    expect(wrapper.className).toMatch(/\btooltip--top\b/)
  })

  it('side custom: bottom/left/right', () => {
    const { rerender } = render(
      <Tooltip label="x" side="bottom">
        <button>Y</button>
      </Tooltip>
    )
    let wrapper = screen.getByRole('button', { name: 'Y' }).parentElement
    expect(wrapper.className).toMatch(/\btooltip--bottom\b/)

    rerender(
      <Tooltip label="x" side="left">
        <button>Y</button>
      </Tooltip>
    )
    wrapper = screen.getByRole('button', { name: 'Y' }).parentElement
    expect(wrapper.className).toMatch(/\btooltip--left\b/)

    rerender(
      <Tooltip label="x" side="right">
        <button>Y</button>
      </Tooltip>
    )
    wrapper = screen.getByRole('button', { name: 'Y' }).parentElement
    expect(wrapper.className).toMatch(/\btooltip--right\b/)
  })

  it('className extra', () => {
    render(
      <Tooltip label="x" className="extra">
        <button>Z</button>
      </Tooltip>
    )
    const wrapper = screen.getByRole('button', { name: 'Z' }).parentElement
    expect(wrapper.className).toMatch(/\bextra\b/)
  })

  it('wrapper tem tabIndex 0 pra receber foco', () => {
    render(
      <Tooltip label="x">
        <button>B</button>
      </Tooltip>
    )
    const wrapper = screen.getByRole('button', { name: 'B' }).parentElement
    expect(wrapper.getAttribute('tabindex')).toBe('0')
  })
})
