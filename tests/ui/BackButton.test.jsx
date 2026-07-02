// Tests do componente BackButton (Sprint 31).
// Cobre:
//   - show=true: renderiza botao com label + icone
//   - show=false: nao renderiza nada
//   - onClick: chama callback
//   - label custom: aria-label e texto
//   - className extra
//
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import BackButton from '../../src/components/BackButton.jsx'

describe('BackButton', () => {
  it('show=true (default): renderiza botao com label e aria-label', () => {
    render(<BackButton onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Voltar' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('Voltar')
  })

  it('show=false: nao renderiza nada', () => {
    const { container } = render(<BackButton onClick={() => {}} show={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  it('click: chama onClick', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<BackButton onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('label custom: aria-label e texto', () => {
    render(<BackButton onClick={() => {}} label="Pagina anterior" />)
    const btn = screen.getByRole('button', { name: 'Pagina anterior' })
    expect(btn).toHaveTextContent('Pagina anterior')
    expect(btn).toHaveAttribute('aria-label', 'Pagina anterior')
    expect(btn).toHaveAttribute('title', 'Pagina anterior')
  })

  it('className extra', () => {
    render(<BackButton onClick={() => {}} className="meu" />)
    const btn = screen.getByRole('button', { name: 'Voltar' })
    expect(btn.classList.contains('meu')).toBe(true)
  })
})
