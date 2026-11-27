// Conferência por item (Fatia B): folha "Pallet parcial" (mock v5). Campos, validação, "Nenhum (pallet incompleto)" x outro
// lote, até 2 partes, e o comportamento do Modal do Portal (portal no body, role=dialog, foco no primeiro campo, Esc e
// toque no fundo fecham). Dados inventados.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import CargoPartialPalletSheet from '../../src/features/processes/CargoPartialPalletSheet'

const OPTIONS = [
  { rowId: 'r1', label: 'Poliol Flex 3000 · L-2231' },
  { rowId: 'r6', label: 'Resina Acrílica RA-55 · A-1180' },
  { rowId: 'r7', label: 'Aditivo AX-7 · sem lote' },
]

function renderSheet(props = {}) {
  const handlers = { onAdd: vi.fn(), onClose: vi.fn() }
  render(<CargoPartialPalletSheet rowId="r2" lotLabel="Poliol Flex 3000 · L-2232" options={OPTIONS} {...handlers} {...props} />)
  return { user: userEvent.setup(), ...handlers }
}

const unitsMine = () => screen.getByLabelText('Unidades deste lote no pallet')
const sheetDialog = () => screen.getByRole('dialog', { name: 'Pallet parcial' })

describe('folha "Pallet parcial": conteúdo (texto do mock)', () => {
  it('abre em um diálogo modal no body, com o título, a explicação, "Este lote" fixo e os botões', async () => {
    renderSheet()
    const dialog = sheetDialog()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Portal no body: fora do container do render (nunca dentro do .page-fade).
    expect(dialog.closest('.page-fade')).toBeNull()
    expect(document.body.contains(dialog)).toBe(true)
    expect(within(dialog).getByRole('heading', { name: 'Pallet parcial' })).toBeInTheDocument()
    expect(
      within(dialog).getByText(/Use quando um pallet tem unidades de mais de um lote ou item\. Ele conta como/)
    ).toHaveTextContent(
      'Use quando um pallet tem unidades de mais de um lote ou item. Ele conta como 1 pallet na carga e aparece nos dois lotes. Pallets inteiros continuam no contador.'
    )
    expect(within(dialog).getByText('Este lote')).toBeInTheDocument()
    expect(within(dialog).getByText('Poliol Flex 3000 · L-2232')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('secondary-button')
    expect(within(dialog).getByRole('button', { name: 'Adicionar pallet parcial' })).toHaveClass('primary-button')
    expect(unitsMine()).toHaveAttribute('placeholder', 'Ex.: 30')
    expect(unitsMine()).toHaveAttribute('inputmode', 'numeric')
  })

  it('"Dividido com": a primeira opção é "Nenhum (pallet incompleto)" e as demais são os outros lotes', () => {
    renderSheet()
    const select = screen.getByLabelText('Dividido com')
    const labels = within(select).getAllByRole('option').map((option) => option.textContent)
    expect(labels).toEqual(['Nenhum (pallet incompleto)', ...OPTIONS.map((option) => option.label)])
    expect(select).toHaveValue('')
    // Sem outro lote, o campo das unidades dele não existe.
    expect(screen.queryByLabelText('Unidades do outro lote no pallet')).not.toBeInTheDocument()
  })

  it('o foco vai para o primeiro campo ao abrir', async () => {
    renderSheet()
    await waitFor(() => expect(unitsMine()).toHaveFocus())
  })
})

describe('folha "Pallet parcial": validação e envio', () => {
  it('sem as unidades deste lote: "Informe as unidades deste lote no pallet." e nada é adicionado', async () => {
    const { user, onAdd } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe as unidades deste lote no pallet.')
    await user.type(unitsMine(), '0')
    await user.click(screen.getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe as unidades deste lote no pallet.')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('"Nenhum (pallet incompleto)": adiciona 1 parte só', async () => {
    const { user, onAdd } = renderSheet()
    await user.type(unitsMine(), '30')
    await user.click(screen.getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(onAdd).toHaveBeenCalledWith([{ rowId: 'r2', units: 30 }])
  })

  it('com outro lote: exige as unidades dele ("Informe as unidades do outro lote no pallet.") e adiciona as 2 partes', async () => {
    const { user, onAdd } = renderSheet()
    await user.type(unitsMine(), '30')
    await user.selectOptions(screen.getByLabelText('Dividido com'), 'r6')
    const other = screen.getByLabelText('Unidades do outro lote no pallet')
    expect(other).toHaveAttribute('placeholder', 'Ex.: 20')
    await user.click(screen.getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe as unidades do outro lote no pallet.')
    expect(onAdd).not.toHaveBeenCalled()
    await user.type(other, '20')
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    await user.click(screen.getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(onAdd).toHaveBeenCalledWith([
      { rowId: 'r2', units: 30 },
      { rowId: 'r6', units: 20 },
    ])
  })

  it('voltar para "Nenhum" some com o campo do outro lote e não leva a parte dele', async () => {
    const { user, onAdd } = renderSheet()
    await user.type(unitsMine(), '8')
    await user.selectOptions(screen.getByLabelText('Dividido com'), 'r1')
    await user.type(screen.getByLabelText('Unidades do outro lote no pallet'), '5')
    await user.selectOptions(screen.getByLabelText('Dividido com'), '')
    expect(screen.queryByLabelText('Unidades do outro lote no pallet')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Adicionar pallet parcial' }))
    expect(onAdd).toHaveBeenCalledWith([{ rowId: 'r2', units: 8 }])
  })

  it('os campos de unidades só aceitam dígitos (até 5)', async () => {
    const { user } = renderSheet()
    await user.type(unitsMine(), '1a2.3-4 5678')
    expect(unitsMine()).toHaveValue('12345')
  })
})

describe('folha "Pallet parcial": como fecha', () => {
  it('Cancelar, Esc e o toque no fundo fecham; um toque dentro da folha não', async () => {
    const { user, onClose } = renderSheet()
    await user.click(sheetDialog())
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    await user.click(sheetDialog().parentElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('o foco fica preso na folha (Tab do último campo volta ao primeiro)', async () => {
    const { user } = renderSheet()
    await waitFor(() => expect(unitsMine()).toHaveFocus())
    const confirm = screen.getByRole('button', { name: 'Adicionar pallet parcial' })
    confirm.focus()
    await user.tab()
    expect(unitsMine()).toHaveFocus()
  })
})
