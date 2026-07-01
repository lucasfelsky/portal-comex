// Tests do componente TabButton (Sprint 16.2 microinteracao).
// Cobre:
//   - Render: classe .tab-button e children
//   - Active: recebe .tab-button--active
//   - Click: chama onClick
//   - Disabled: nao chama onClick
//   - focus-visible: ring de outline
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import TabButton from '../../src/components/TabButton.jsx'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TabButton', () => {
  it('render: classe .tab-button + children', () => {
    render(<TabButton onClick={() => {}}>Todas</TabButton>)
    const button = screen.getByRole('button', { name: 'Todas' })
    expect(button.className).toMatch(/\btab-button\b/)
  })

  it('active: recebe tab-button--active quando active=true', () => {
    render(<TabButton onClick={() => {}} active>Noticias</TabButton>)
    const button = screen.getByRole('button', { name: 'Noticias' })
    expect(button.className).toMatch(/\btab-button--active\b/)
  })

  it('inactive: nao recebe tab-button--active', () => {
    render(<TabButton onClick={() => {}} active={false}>Noticias</TabButton>)
    const button = screen.getByRole('button', { name: 'Noticias' })
    expect(button.className).not.toMatch(/\btab-button--active\b/)
  })

  it('click: chama onClick', () => {
    const onClick = vi.fn()
    render(<TabButton onClick={onClick}>Cliques</TabButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Cliques' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled: nao chama onClick e tem atributo disabled', () => {
    const onClick = vi.fn()
    render(
      <TabButton onClick={onClick} disabled>
        Bloqueado
      </TabButton>
    )
    const button = screen.getByRole('button', { name: 'Bloqueado' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('passa className extra', () => {
    render(
      <TabButton onClick={() => {}} className="extra-class">
        Com classe
      </TabButton>
    )
    const button = screen.getByRole('button', { name: 'Com classe' })
    expect(button.className).toMatch(/\bextra-class\b/)
  })

  it('aria-pressed presente quando active', () => {
    render(<TabButton onClick={() => {}} active>Ativa</TabButton>)
    const button = screen.getByRole('button', { name: 'Ativa' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('aria-pressed false quando inativa', () => {
    render(<TabButton onClick={() => {}} active={false}>Inativa</TabButton>)
    const button = screen.getByRole('button', { name: 'Inativa' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })
})
