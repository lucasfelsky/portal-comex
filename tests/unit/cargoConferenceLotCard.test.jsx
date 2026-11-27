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
    onSetUnits: vi.fn(),
    onStepUnits: vi.fn(),
    onOpenPartial: vi.fn(),
    onRemovePartial: vi.fn(),
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

// ---------- Fatia B: unidades por lote e pallet parcial ----------

const OTHER = { units: 20, name: 'Resina Acrílica RA-55', lot: 'A-1180' }
const unitsInput = () => screen.getByLabelText('Unidades contadas do Lote L-2231')

describe('cartão do lote: unidades contadas (Fatia B)', () => {
  it('editável: rótulo do mock, "−", campo numérico, "+ Unidade" e "Esperadas: N (Nº de emb. do relatório)"', () => {
    renderCard({ expectedUnits: 100 })
    expect(screen.getByText('Unidades contadas (todas as embalagens do lote)')).toBeInTheDocument()
    expect(unitsInput()).toHaveAttribute('inputmode', 'numeric')
    expect(unitsInput()).toHaveAttribute('placeholder', '0')
    expect(unitsInput()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Tirar uma unidade da contagem do item 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adicionar uma unidade à contagem do item 1' })).toHaveTextContent('+ Unidade')
    const sum = screen.getByText(/^Esperadas:/)
    expect(sum).toHaveTextContent('Esperadas: 100 (Nº de emb. do relatório)')
    expect(within(sum).getByText('100').tagName).toBe('B')
    expect(screen.queryByText(/diferença de/)).not.toBeInTheDocument()
  })

  it('"+ Unidade" e "−" avisam onStepUnits; digitar avisa onSetUnits (só dígitos; vazio = nunca contado)', () => {
    const { onStepUnits, onSetUnits } = renderCard({ expectedUnits: 100, units: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar uma unidade à contagem do item 1' }))
    expect(onStepUnits).toHaveBeenCalledWith('r-9', 1)
    fireEvent.click(screen.getByRole('button', { name: 'Tirar uma unidade da contagem do item 1' }))
    expect(onStepUnits).toHaveBeenCalledWith('r-9', -1)
    fireEvent.change(unitsInput(), { target: { value: '1a2b' } })
    expect(onSetUnits).toHaveBeenLastCalledWith('r-9', 12)
    fireEvent.change(unitsInput(), { target: { value: '' } })
    expect(onSetUnits).toHaveBeenLastCalledWith('r-9', null)
    fireEvent.change(unitsInput(), { target: { value: '9999999' } })
    expect(onSetUnits).toHaveBeenLastCalledWith('r-9', 99999)
  })

  it('divergente: selo "Unidades divergentes", caixa âmbar e " · diferença de N"; igual ao esperado não diverge', () => {
    renderCard({ units: 90, expectedUnits: 100, unitsDivergent: true })
    expect(screen.getByText('Unidades divergentes')).toHaveClass('ccf-badge--warn')
    expect(unitsInput().closest('.ccf-cnum')).toHaveClass('ccf-cnum--div')
    expect(screen.getByText(/^Esperadas:/)).toHaveTextContent('Esperadas: 100 (Nº de emb. do relatório) · diferença de 10')
    document.body.innerHTML = ''
    renderCard({ units: 100, expectedUnits: 100, unitsDivergent: false })
    expect(screen.queryByText('Unidades divergentes')).not.toBeInTheDocument()
    expect(unitsInput().closest('.ccf-cnum')).toHaveClass('ccf-cnum--on')
    expect(screen.queryByText(/diferença de/)).not.toBeInTheDocument()
  })

  it('sem Nº de emb. inteiro: "Esperadas: —" e nenhum selo (D-11)', () => {
    renderCard({ units: 40, expectedUnits: null, unitsDivergent: false })
    expect(screen.getByText(/^Esperadas:/)).toHaveTextContent('Esperadas: — (Nº de emb. do relatório)')
    expect(screen.queryByText('Unidades divergentes')).not.toBeInTheDocument()
  })

  it('número longo (milhar) ganha a classe que reduz a fonte na largura estreita', () => {
    renderCard({ units: 1000, expectedUnits: 1000 })
    expect(unitsInput()).toHaveValue('1.000')
    expect(unitsInput().closest('.ccf-cnum')).toHaveClass('ccf-cnum--long')
    document.body.innerHTML = ''
    renderCard({ units: 100, expectedUnits: 100 })
    expect(unitsInput().closest('.ccf-cnum')).not.toHaveClass('ccf-cnum--long')
  })

  it('somente leitura: o número na caixa ("—" sem contagem), a legenda "unidades" e o esperado; sem botões nem campo', () => {
    renderCard({ editable: false, units: 90, expectedUnits: 100, unitsDivergent: true })
    expect(screen.getByText('Unidades contadas (todas as embalagens do lote)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Unidades contadas do Lote L-2231')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /unidade/i })).not.toBeInTheDocument()
    expect(document.querySelector('.ccf-cnum')).toHaveTextContent('90unidades')
    expect(screen.getByText(/^Esperadas:/)).toHaveTextContent('· diferença de 10')
    document.body.innerHTML = ''
    renderCard({ editable: false, units: null, expectedUnits: 100 })
    expect(document.querySelector('.ccf-cnum')).toHaveTextContent('—unidades')
  })
})

describe('cartão do lote: pallet parcial (Fatia B)', () => {
  it('mostra o parcial com o outro lote, "N das unidades contadas estão em pallet parcial." e a lixeira de remover', () => {
    const { onRemovePartial } = renderCard({ partials: [{ id: 'pp1', mineUnits: 30, other: OTHER }] })
    const card = document.querySelector('.ccf-parc')
    expect(card).toHaveTextContent('Pallet parcial · 30 un. deste lote + 20 un. de Resina Acrílica RA-55 · A-1180')
    expect(within(card).getByText('Pallet parcial').tagName).toBe('B')
    expect(screen.getByText('30 das unidades contadas estão em pallet parcial.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remover este pallet parcial' }))
    expect(onRemovePartial).toHaveBeenCalledWith('pp1')
  })

  it('"Nenhum (pallet incompleto)" mostra " · pallet incompleto"; outro lote sem número de lote mostra só o nome', () => {
    renderCard({ partials: [{ id: 'pp1', mineUnits: 12, other: null }] })
    expect(document.querySelector('.ccf-parc')).toHaveTextContent('Pallet parcial · 12 un. deste lote · pallet incompleto')
    document.body.innerHTML = ''
    renderCard({ partials: [{ id: 'pp2', mineUnits: 3, other: { units: 4, name: 'Aditivo AX-7', lot: '' } }] })
    expect(document.querySelector('.ccf-parc')).toHaveTextContent('Pallet parcial · 3 un. deste lote + 4 un. de Aditivo AX-7')
  })

  it('vários parciais somam as unidades deste lote na frase de baixo', () => {
    renderCard({
      partials: [
        { id: 'pp1', mineUnits: 30, other: OTHER },
        { id: 'pp2', mineUnits: 5, other: null },
      ],
    })
    expect(document.querySelectorAll('.ccf-parc')).toHaveLength(2)
    expect(screen.getByText('35 das unidades contadas estão em pallet parcial.')).toBeInTheDocument()
  })

  it('o botão secundário "Pallet parcial" abre a folha do lote e só existe editável', () => {
    const { onOpenPartial } = renderCard()
    const button = screen.getByRole('button', { name: 'Pallet parcial' })
    expect(button).toHaveClass('secondary-button')
    fireEvent.click(button)
    expect(onOpenPartial).toHaveBeenCalledWith('r-9')
    document.body.innerHTML = ''
    renderCard({ editable: false, partials: [{ id: 'pp1', mineUnits: 30, other: OTHER }] })
    expect(screen.queryByRole('button', { name: 'Pallet parcial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover este pallet parcial' })).not.toBeInTheDocument()
    // O cartão do parcial continua visível na leitura (sem a lixeira).
    expect(document.querySelector('.ccf-parc')).toHaveTextContent('Pallet parcial · 30 un. deste lote')
  })

  it('o pallet parcial vale como pallet contado: sem "Sem contagem" nem "A contar"', () => {
    renderCard({ awaitingCount: true, partials: [{ id: 'pp1', mineUnits: 30, other: OTHER }] })
    expect(screen.queryByText('Sem contagem')).not.toBeInTheDocument()
    expect(screen.queryByText('A contar')).not.toBeInTheDocument()
    document.body.innerHTML = ''
    renderCard({ awaitingCount: true, pallets: { count: 0, legacyOk: false }, partials: [{ id: 'pp1', mineUnits: 30, other: null }] })
    expect(screen.queryByText('Sem contagem')).not.toBeInTheDocument()
  })

  it('sem as props da Fatia B o cartão é o da Fatia A (conferência antiga abre igual)', () => {
    renderCard()
    expect(document.querySelector('.ccf-parc')).toBeNull()
    expect(screen.queryByText(/estão em pallet parcial/)).not.toBeInTheDocument()
    expect(screen.queryByText('Unidades divergentes')).not.toBeInTheDocument()
    expect(screen.getByText('Sem contagem')).toBeInTheDocument()
  })
})
