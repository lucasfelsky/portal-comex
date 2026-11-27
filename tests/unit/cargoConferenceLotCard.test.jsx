// Conferência por item (Fatia A): cartão de um lote. Pesos (a dica "tara (embalagem vazia)", D-1), nome do fornecedor,
// selos, OK?, contador de pallets inteiros, "Etiquetas, fotos e avaria" (abre sozinho com avaria), somente leitura e `onPin`
// (o filtro "Só pendentes" não esconde o item sob o dedo; vem do antigo cartão da linha). Dados inventados.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import CargoConferenceLotCard from '../../src/features/processes/CargoConferenceLotCard'

const ROW = {
  id: 'r-9',
  dbcorpCode: 'BA5012',
  sqDescription: 'Poliol Flex 3000',
  supplierDescription: 'POLYETHER POLYOL PE-3000',
  supplierLot: 'L-2231',
  quantityKg: 20000,
  packageWeightKg: 9.8,
}
const DERIVED = {
  netWeightKg: 200,
  packages: 100,
  packaging: { packagingType: 'TAMBOR 200 L', via: 'item' },
  alerts: { missingLot: false, missingPackageWeight: false, noPackaging: false },
}

function renderCard(props = {}) {
  const handlers = {
    onToggleOk: vi.fn(),
    onStepPallets: vi.fn(),
    onIssueChange: vi.fn(),
    onLabelChange: vi.fn(),
    onToggleDetails: vi.fn(),
  }
  render(
    <CargoConferenceLotCard
      row={ROW}
      number={1}
      title="Lote L-2231"
      derived={DERIVED}
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

const meta = (label) => screen.getByText(label, { selector: 'dt' }).closest('div')

describe('cartão do lote: dados e pesos', () => {
  it('mostra Qtd, Nº de emb. com o tipo da embalagem, Peso líq. por emb. e Peso da emb. com a dica de tara', () => {
    renderCard()
    expect(screen.getByRole('article', { name: 'Lote L-2231' })).toBeInTheDocument()
    expect(within(meta('Qtd')).getByText('20.000 kg')).toBeInTheDocument()
    expect(within(meta('Nº de emb.')).getByText('100')).toBeInTheDocument()
    expect(within(meta('Nº de emb.')).getByText('TAMBOR 200 L').tagName).toBe('SMALL')
    expect(within(meta('Peso líq. por emb.')).getByText('200 kg')).toBeInTheDocument()
    const tare = meta('Peso da emb.')
    expect(within(tare).getByText('9,8 kg', { exact: false })).toBeInTheDocument()
    // D-1: "Peso da emb." é a tara; a dica é um <small> como o do Nº de emb.
    const hint = within(tare).getByText('tara (embalagem vazia)')
    expect(hint.tagName).toBe('SMALL')
    expect(within(tare).queryByText('Falta informar')).not.toBeInTheDocument()
  })

  it('sem o peso da embalagem: "Falta informar" em âmbar e SEM a dica de tara', () => {
    renderCard({
      row: { ...ROW, packageWeightKg: null },
      derived: { ...DERIVED, alerts: { ...DERIVED.alerts, missingPackageWeight: true } },
    })
    const tare = meta('Peso da emb.')
    expect(within(tare).getByText('Falta informar')).toHaveClass('ccf-meta__miss')
    expect(within(tare).queryByText('tara (embalagem vazia)')).not.toBeInTheDocument()
    expect(screen.queryByText('tara (embalagem vazia)')).not.toBeInTheDocument()
  })

  it('sem código (sem alerta de peso faltando), traço; sem peso líquido e sem tipo, traço e nada de <small>', () => {
    renderCard({
      row: { ...ROW, dbcorpCode: '', packageWeightKg: null },
      derived: { netWeightKg: null, packages: null, packaging: null, alerts: { missingPackageWeight: false } },
    })
    expect(within(meta('Peso da emb.')).getByText('—')).toBeInTheDocument()
    expect(within(meta('Peso líq. por emb.')).getByText('—')).toBeInTheDocument()
    expect(within(meta('Nº de emb.')).getByText('—')).toBeInTheDocument()
    expect(document.querySelector('.ccf-meta small')).toBeNull()
  })

  it('peso zero também é um peso informado (valor e dica)', () => {
    renderCard({ row: { ...ROW, packageWeightKg: 0 } })
    expect(within(meta('Peso da emb.')).getByText('tara (embalagem vazia)')).toBeInTheDocument()
  })
})

describe('cartão do lote: nome do fornecedor e selos', () => {
  it('nome diferente do fornecedor: selo info e "Nome no fornecedor: <b>…</b>"; sem diferença, nada', () => {
    renderCard({ differentName: true, row: { ...ROW, supplierDescription: 'POLYETHER POLYOL PE-3000 TYPE B' } })
    expect(screen.getByText('Nome diferente do fornecedor')).toHaveClass('ccf-badge--info')
    expect(screen.getByText('POLYETHER POLYOL PE-3000 TYPE B').tagName).toBe('B')
    expect(screen.getByText(/^Nome no fornecedor:/)).toBeInTheDocument()
  })

  it('sem nome diferente: nem selo nem linha', () => {
    renderCard()
    expect(screen.queryByText('Nome diferente do fornecedor')).not.toBeInTheDocument()
    expect(screen.queryByText(/Nome no fornecedor/)).not.toBeInTheDocument()
  })

  it('"Conferido" só com conferred; "Avaria registrada" com avaria', () => {
    renderCard({ conferred: true, hasIssue: true, pallets: { count: 2, legacyOk: false } })
    expect(screen.getByText('Conferido')).toHaveClass('ccf-badge--ok')
    expect(screen.getByRole('article')).toHaveClass('ccf-lot--done')
    expect(screen.getAllByText('Avaria registrada')[0]).toHaveClass('ccf-badge--danger')
  })

  it('selo "A contar": só com awaitingCount e lote nunca contado', () => {
    renderCard({ awaitingCount: true })
    expect(screen.getByText('A contar').className).toBe('ccf-badge')
    expect(screen.queryByText('Sem contagem')).not.toBeInTheDocument()
  })

  it('awaitingCount falso (sem total do COMEX): "Sem contagem"', () => {
    renderCard({ awaitingCount: false })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(screen.getByText('Sem contagem')).toBeInTheDocument()
  })

  it('zerado de propósito (0): "Sem contagem", não "A contar"; com pallets, nenhum selo de contagem pendente', () => {
    renderCard({ awaitingCount: true, pallets: { count: 0, legacyOk: false } })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(screen.getByText('Sem contagem')).toBeInTheDocument()
  })

  it('registro antigo (Contagem OK, sem número) não é "A contar" nem "Sem contagem"', () => {
    renderCard({ awaitingCount: true, pallets: { count: null, legacyOk: true } })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem contagem')).not.toBeInTheDocument()
  })

  it('com pallets contados nenhum selo de contagem pendente', () => {
    renderCard({ awaitingCount: true, pallets: { count: 2, legacyOk: false } })
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem contagem')).not.toBeInTheDocument()
  })
})

describe('cartão do lote: editável', () => {
  it('OK? tem o nome do lote e avisa onToggleOk; o contador de pallets inteiros avisa onStepPallets', () => {
    const { onToggleOk, onStepPallets } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'OK? do Lote L-2231' }))
    expect(onToggleOk).toHaveBeenCalledWith('r-9')
    expect(screen.getByText('Pallets contados (inteiros)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar um pallet à contagem do item 1' }))
    expect(onStepPallets).toHaveBeenCalledWith('r-9', 1)
  })

  it('lote sem número de lote usa o título "Sem lote informado" no OK?', () => {
    renderCard({ title: 'Sem lote informado', row: { ...ROW, supplierLot: '' } })
    expect(screen.getByRole('button', { name: 'OK? do Sem lote informado' })).toBeInTheDocument()
  })

  it('etiqueta digitada em minúsculas sobe em MAIÚSCULAS', () => {
    const { onLabelChange } = renderCard()
    const input = screen.getByLabelText('Etiqueta WMS da linha 1')
    expect(input).toHaveAttribute('autocapitalize', 'characters')
    fireEvent.change(input, { target: { value: 'wms-ç1' } })
    expect(onLabelChange).toHaveBeenCalledWith('r-9', 'wms', 'WMS-Ç1')
  })
})

describe('cartão do lote: Etiquetas, fotos e avaria', () => {
  it('começa recolhido quando não há avaria', () => {
    renderCard()
    expect(document.querySelector('details.ccf-more')).not.toHaveAttribute('open')
  })

  it('abre sozinho quando há avaria, com o selo "Avaria" no resumo', () => {
    renderCard({ hasIssue: true, issue: { flagged: true, note: 'Tambor amassado', photos: [] } })
    const details = document.querySelector('details.ccf-more')
    expect(details).toHaveAttribute('open')
    expect(within(details.querySelector('summary')).getByText('Avaria')).toHaveClass('ccf-badge--danger')
  })

  it('o estado guardado pela tela vence: aberto sem avaria e fechado com avaria; mexer avisa onToggleDetails', () => {
    renderCard({ open: true })
    expect(document.querySelector('details.ccf-more')).toHaveAttribute('open')
    document.body.innerHTML = ''
    const { onToggleDetails } = renderCard({ open: false, hasIssue: true })
    const details = document.querySelector('details.ccf-more')
    expect(details).not.toHaveAttribute('open')
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(onToggleDetails).toHaveBeenCalledWith('r-9', true)
  })
})

describe('cartão do lote: somente leitura', () => {
  it('OK? desabilitado, contador só com o número e a legenda, etiquetas em texto', () => {
    renderCard({
      editable: false,
      ok: true,
      conferred: true,
      pallets: { count: 4, legacyOk: false },
      labels: { wms: 'w1', sq: '' },
    })
    expect(screen.getByRole('button', { name: 'OK? do Lote L-2231' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /pallet/i })).not.toBeInTheDocument()
    expect(screen.getByText('Pallets contados (inteiros)')).toBeInTheDocument()
    expect(document.querySelector('.ccf-pal--ro')).toHaveTextContent('4pallets')
    expect(screen.queryByLabelText('Etiqueta WMS da linha 1')).not.toBeInTheDocument()
    expect(screen.getByText('W1')).toBeInTheDocument()
  })

  it('lote nunca contado mostra traço; registro antigo (Contagem OK) mostra "OK"', () => {
    renderCard({ editable: false })
    expect(document.querySelector('.ccf-pal--ro')).toHaveTextContent('—pallets')
    document.body.innerHTML = ''
    renderCard({ editable: false, pallets: { count: null, legacyOk: true } })
    expect(document.querySelector('.ccf-pal--ro')).toHaveTextContent('OKregistro antigo')
  })
})

describe('cartão do lote: onPin', () => {
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

  it('sem onPin o cartão continua funcionando (somente leitura, testes antigos)', () => {
    renderCard()
    expect(() => fireEvent.click(screen.getByRole('heading', { level: 4 }))).not.toThrow()
  })
})
