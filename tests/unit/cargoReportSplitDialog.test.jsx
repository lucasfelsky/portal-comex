// S9-B do Relatorio de Carga: dialogo "Dividir em lotes" (sugestao, soma ao vivo, Dividir so com a soma certa).
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CargoReportSplitDialog from '../../src/features/processes/CargoReportSplitDialog'
import { createEmptyCargoReportRow } from '../../src/features/processes/cargoReportFormModel'

const ROW = {
  ...createEmptyCargoReportRow('r-1'),
  po: 'GOOYER SEA 001-26',
  sqDescription: 'POLIOL PE-3000',
  quantityKg: 1000,
}

function renderDialog(props = {}) {
  const onApply = vi.fn()
  const onCancel = vi.fn()
  const view = render(<CargoReportSplitDialog row={ROW} rowCount={3} onApply={onApply} onCancel={onCancel} {...props} />)
  return { onApply, onCancel, ...view }
}

const qty = (index) => screen.getByLabelText(`Quantidade do lote ${index}`)
const lot = (index) => screen.getByLabelText(`Lote ${index}`)
const note = () => screen.getByRole('status')
const countOptions = () => [...screen.getByLabelText('Quantos lotes?').options].map((option) => option.textContent)

describe('CargoReportSplitDialog', () => {
  it('mostra o texto do mock: descricao, PO e total; 3 lotes sugeridos (330 / 330 / 340) e soma fechando', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Dividir em lotes' })
    expect(dialog).toHaveTextContent(
      'POLIOL PE-3000 · GOOYER SEA 001-26 · total 1.000 kg. As linhas novas ficam no lugar desta, com a mesma descrição e o mesmo PO.'
    )
    expect(screen.getByLabelText('Quantos lotes?')).toHaveValue('3')
    expect(countOptions()).toEqual(['2', '3', '4', '5', '6', '8', '10'])
    expect(qty(1)).toHaveValue('330')
    expect(qty(2)).toHaveValue('330')
    expect(qty(3)).toHaveValue('340')
    expect(lot(1)).toHaveAttribute('placeholder', 'Opcional agora')
    expect(note()).toHaveTextContent('Soma dos lotes: 1.000 kg de 1.000 kg. Fecha certinho.')
    expect(note()).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: 'Dividir' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('soma errada: texto exato do aviso e "Dividir" desabilitado; corrigir reabilita', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.clear(qty(3))
    await user.type(qty(3), '300')

    expect(note()).toHaveTextContent('Soma dos lotes: 960 kg de 1.000 kg. Falta ou sobra 40 kg.')
    expect(screen.getByRole('button', { name: 'Dividir' })).toBeDisabled()

    await user.clear(qty(3))
    await user.type(qty(3), '340,5')
    expect(note()).toHaveTextContent('Soma dos lotes: 1.000,5 kg de 1.000 kg. Falta ou sobra 0,5 kg.')
    expect(screen.getByRole('button', { name: 'Dividir' })).toBeDisabled()

    await user.clear(qty(3))
    await user.type(qty(3), '340')
    expect(screen.getByRole('button', { name: 'Dividir' })).toBeEnabled()
  })

  it('quantidade zero bloqueia o Dividir mesmo com soma igual', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText('Quantos lotes?'), '2')
    await user.clear(qty(1))
    await user.type(qty(1), '0')
    await user.clear(qty(2))
    await user.type(qty(2), '1000')
    expect(screen.getByRole('button', { name: 'Dividir' })).toBeDisabled()
    expect(note()).toHaveTextContent('Informe a quantidade de cada lote.')
  })

  it('trocar o numero de lotes refaz a sugestao e as linhas de lote', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(lot(1), 'ABC')
    await user.selectOptions(screen.getByLabelText('Quantos lotes?'), '4')

    expect(screen.getAllByLabelText(/^Quantidade do lote/)).toHaveLength(4)
    expect([1, 2, 3, 4].map((n) => qty(n).value)).toEqual(['250', '250', '250', '250'])
    expect(lot(1)).toHaveValue('')
    expect(note()).toHaveTextContent('Fecha certinho.')

    await user.selectOptions(screen.getByLabelText('Quantos lotes?'), '2')
    expect(screen.getAllByLabelText(/^Quantidade do lote/)).toHaveLength(2)
    expect(qty(1)).toHaveValue('500')
  })

  it('Dividir chama onApply com lote e quantidade (numero) de cada linha', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog()
    await user.type(lot(1), 'L-01')
    await user.type(lot(3), 'L-03')
    await user.click(screen.getByRole('button', { name: 'Dividir' }))
    expect(onApply).toHaveBeenCalledWith([
      { supplierLot: 'L-01', quantityKg: 330 },
      { supplierLot: '', quantityKg: 330 },
      { supplierLot: 'L-03', quantityKg: 340 },
    ])
  })

  it('Cancelar e Esc chamam onCancel', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('so oferece quantidades de lotes que cabem no teto de 200 linhas', () => {
    renderDialog({ rowCount: 197 })
    // 197 - 1 + n <= 200  =>  n <= 4
    expect(countOptions()).toEqual(['2', '3', '4'])
  })

  it('total fracionado (texto pt-BR) fecha pela sugestao', () => {
    renderDialog({ row: { ...ROW, quantityKg: '1.000,5' } })
    expect(note()).toHaveTextContent('Soma dos lotes: 1.000,5 kg de 1.000,5 kg. Fecha certinho.')
  })
})
