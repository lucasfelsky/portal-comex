// Estrela de favorito (Movimento.dc.html): so a transicao desativado -> ativado
// ganha a classe da mola (scale 0 -> 1, 300 ms).
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import useActivationPop from '../../src/hooks/useActivationPop.js'

function Star({ active }) {
  const pop = useActivationPop(active)
  return <span data-testid="star" className={pop ? 'favorite-star--pop' : ''} />
}

describe('useActivationPop', () => {
  it('primeiro render ja ativo (lista que monta com favoritos) nao anima', () => {
    render(<Star active />)
    expect(screen.getByTestId('star')).not.toHaveClass('favorite-star--pop')
  })

  it('desativado -> ativado liga a classe; ao desativar ela some', () => {
    const { rerender } = render(<Star active={false} />)
    expect(screen.getByTestId('star')).not.toHaveClass('favorite-star--pop')

    rerender(<Star active />)
    expect(screen.getByTestId('star')).toHaveClass('favorite-star--pop')

    rerender(<Star active={false} />)
    expect(screen.getByTestId('star')).not.toHaveClass('favorite-star--pop')
  })

  it('ativar de novo depois de desativar repete a classe', () => {
    const { rerender } = render(<Star active={false} />)
    rerender(<Star active />)
    rerender(<Star active={false} />)
    rerender(<Star active />)
    expect(screen.getByTestId('star')).toHaveClass('favorite-star--pop')
  })
})
