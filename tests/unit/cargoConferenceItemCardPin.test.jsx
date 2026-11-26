// Polimento do contador (S10-I): o cartão do item avisa `onPin` ao ser tocado ou focado (o filtro "Só pendentes" não
// o esconde sob o dedo, mesmo quando o toque não muda dado, como abrir a câmera) e mostra "A contar" só quando pedido.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import CargoConferenceItemCard from '../../src/features/processes/CargoConferenceItemCard'

const ROW = { id: 'r-9', dbcorpCode: 'AD5240', sqDescription: 'DEA FOAM', supplierLot: 'L1', quantityKg: 100 }

function renderCard(props = {}) {
  const handlers = {
    onToggleOk: vi.fn(),
    onStepPallets: vi.fn(),
    onIssueChange: vi.fn(),
    onLabelChange: vi.fn(),
  }
  render(
    <CargoConferenceItemCard
      row={ROW}
      number={1}
      derived={null}
      ok={false}
      conferred={false}
      pallets={{ count: null, legacyOk: false }}
      issue={{ flagged: false, note: '', photos: [] }}
      hasIssue={false}
      labels={{}}
      editable
      idPrefix="t"
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('cartão do item: onPin', () => {
  it('tocar no cartão (clique em qualquer ponto) avisa o rowId', () => {
    const onPin = vi.fn()
    renderCard({ onPin })
    fireEvent.click(screen.getByRole('heading', { level: 4 }))
    expect(onPin).toHaveBeenCalledWith('r-9')
  })

  it('focar um campo do cartão avisa o rowId', () => {
    const onPin = vi.fn()
    renderCard({ onPin })
    fireEvent.focus(screen.getByLabelText('Etiqueta WMS da linha 1'))
    expect(onPin).toHaveBeenCalledWith('r-9')
  })

  it('sem onPin o cartão continua funcionando (somente leitura, lista, testes antigos)', () => {
    renderCard()
    expect(() => fireEvent.click(screen.getByRole('heading', { level: 4 }))).not.toThrow()
  })
})

describe('cartão do item: selo "A contar"', () => {
  it('só aparece com awaitingCount e item nunca contado', () => {
    renderCard({ awaitingCount: true })
    expect(screen.getByText('A contar').className).toBe('ccf-badge')
    expect(screen.queryByText('Sem contagem')).not.toBeInTheDocument()
  })

  it('awaitingCount falso (sem total do COMEX): "Sem contagem"', () => {
    renderCard({ awaitingCount: false })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(screen.getByText('Sem contagem')).toBeInTheDocument()
  })

  it('zerado de propósito (0): "Sem contagem", não "A contar"', () => {
    renderCard({ awaitingCount: true, pallets: { count: 0, legacyOk: false } })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(screen.getByText('Sem contagem')).toBeInTheDocument()
  })

  it('com pallets contados nenhum selo de contagem pendente', () => {
    renderCard({ awaitingCount: true, pallets: { count: 2, legacyOk: false } })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem contagem')).not.toBeInTheDocument()
  })
})
