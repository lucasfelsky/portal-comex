// S9-B do Relatorio de Carga: menu ⋯ da linha (desktop = portal no body com role=menu; celular = ActionSheet).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CargoReportRowMenu from '../../src/features/processes/CargoReportRowMenu'

const PURCHASE_ORDERS = [
  { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
  { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
  { po: '4500903', reference: '', supplierName: 'ORION CHEM CO' },
]

function renderMenu(props = {}) {
  const onAction = vi.fn()
  const view = render(
    <div data-testid="host">
      <CargoReportRowMenu
        rowId="r-1"
        rowNumber={2}
        canMoveUp
        canMoveDown
        onAction={onAction}
        {...props}
      />
    </div>
  )
  return { onAction, ...view }
}

afterEach(() => {
  vi.useRealTimers()
})

const trigger = () => screen.getByRole('button', { name: 'Ações da linha 2' })
const labelsOf = (menu) => within(menu).getAllByRole('menuitem').map((item) => item.textContent)

describe('menu da linha (desktop)', () => {
  it('o gatilho anuncia menu e aria-expanded; abre com os itens do mock, na ordem, num portal em document.body', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(trigger())

    const menu = screen.getByRole('menu', { name: 'Ações da linha 2' })
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(menu.parentElement).toBe(document.body)
    expect(container.contains(menu)).toBe(false)
    expect(labelsOf(menu)).toEqual([
      'Linha acima',
      'Linha abaixo',
      'Duplicar (outro lote)',
      'Dividir em lotes…',
      'Mover para cima',
      'Mover para baixo',
      'Remover linha',
    ])
    expect(screen.getByText('Inserir')).toBeInTheDocument()
    expect(screen.getByText('Lotes')).toBeInTheDocument()
    expect(screen.getByText('Posição')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Remover linha' })).toBeInTheDocument()
    expect(menu).toHaveStyle({ visibility: 'visible' })
  })

  it('foco inicial no 1o item; selecionar fecha, devolve o foco ao ⋯ e chama onAction(acao, rowId)', async () => {
    const user = userEvent.setup()
    const { onAction } = renderMenu()
    await user.click(trigger())
    expect(screen.getByRole('menuitem', { name: 'Linha acima' })).toHaveFocus()

    await user.click(screen.getByRole('menuitem', { name: 'Duplicar (outro lote)' }))
    expect(onAction).toHaveBeenCalledWith('dup', 'r-1', undefined)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('Mover para cima/baixo so aparecem quando ha vizinho; sem POs nao ha "Mover para outra PO"', async () => {
    const user = userEvent.setup()
    renderMenu({ canMoveUp: false, canMoveDown: true })
    await user.click(trigger())
    const labels = labelsOf(screen.getByRole('menu'))
    expect(labels).not.toContain('Mover para cima')
    expect(labels).toContain('Mover para baixo')
    expect(labels.some((label) => label.startsWith('Mover para outra PO'))).toBe(false)
  })

  it('setas, Home e End percorrem os itens em ciclo', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())
    const item = (name) => screen.getByRole('menuitem', { name })

    await user.keyboard('{ArrowDown}')
    expect(item('Linha abaixo')).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(item('Remover linha')).toHaveFocus()
    await user.keyboard('{Home}')
    expect(item('Linha acima')).toHaveFocus()
    await user.keyboard('{End}')
    expect(item('Remover linha')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(item('Linha acima')).toHaveFocus()
  })

  it('itens desabilitados (limite de 200 linhas) sao pulados pelas setas e mostram a dica', async () => {
    const user = userEvent.setup()
    renderMenu({ limitReached: true })
    await user.click(trigger())

    const above = screen.getByRole('menuitem', { name: /Linha acima/ })
    expect(above).toBeDisabled()
    expect(above).toHaveAttribute('aria-disabled', 'true')
    expect(within(above).getByText('Limite de 200 linhas')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mover para cima' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Remover linha' })).toHaveFocus()
  })

  it('Dividir em lotes fica desabilitado sem quantidade na linha', async () => {
    const user = userEvent.setup()
    renderMenu({ hasQuantity: false })
    await user.click(trigger())
    const split = screen.getByRole('menuitem', { name: /Dividir em lotes/ })
    expect(split).toBeDisabled()
    expect(within(split).getByText('Informe a Qtd da linha')).toBeInTheDocument()
  })

  it('Esc fecha o menu e devolve o foco ao ⋯; Tab tambem fecha', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()

    await user.click(trigger())
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('ArrowDown no ⋯ fechado abre o menu', async () => {
    const user = userEvent.setup()
    renderMenu()
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('clique fora e rolagem da pagina fecham', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())
    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    vi.useFakeTimers({ toFake: ['Date'] })
    await user.click(trigger())
    // rolagem que ainda esta chegando logo apos o clique nao fecha
    fireEvent.scroll(window)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    vi.setSystemTime(Date.now() + 1000)
    fireEvent.scroll(window)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('clicar de novo no ⋯ fecha', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())
    await user.click(trigger())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('submenu "Mover para outra PO" (consolidado)', () => {
  const openMain = async (user, props = {}) => {
    const view = renderMenu({ purchaseOrders: PURCHASE_ORDERS, currentPurchaseOrderIndex: 1, ...props })
    await user.click(trigger())
    return view
  }
  const subTrigger = () => screen.getByRole('menuitem', { name: /Mover para outra PO/ })

  it('o gatilho anuncia menu e aria-expanded; o submenu lista as POs com fornecedor e pedido, a atual desabilitada', async () => {
    const user = userEvent.setup()
    await openMain(user)
    expect(subTrigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(subTrigger()).toHaveAttribute('aria-expanded', 'false')

    await user.click(subTrigger())

    expect(subTrigger()).toHaveAttribute('aria-expanded', 'true')
    const sub = screen.getByRole('menu', { name: 'POs desta consolidada' })
    expect(within(sub).getByText('POs desta consolidada')).toBeInTheDocument()
    const items = within(sub).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'ACME SEA 011-26ACME RESINS CO · pedido 4500901',
      'NOVA SEA 034-26NOVA POLYMERS · pedido 4500902 · PO atual',
      '4500903ORION CHEM CO · pedido 4500903',
    ])
    expect(items[1]).toBeDisabled()
    expect(items[1]).toHaveAttribute('aria-disabled', 'true')
    expect(items[0]).toBeEnabled()
    // clicar no gatilho abre e foca o 1o item habilitado
    expect(items[0]).toHaveFocus()
  })

  it('→ abre o submenu e foca o 1o item habilitado; ← fecha e volta ao gatilho do submenu', async () => {
    const user = userEvent.setup()
    await openMain(user, { currentPurchaseOrderIndex: 0 })
    subTrigger().focus()
    await user.keyboard('{ArrowRight}')
    expect(subTrigger()).toHaveAttribute('aria-expanded', 'true')
    const sub = screen.getByRole('menu', { name: 'POs desta consolidada' })
    // a PO atual (1a) e pulada: o foco vai para a 2a
    expect(within(sub).getByRole('menuitem', { name: /NOVA SEA 034-26/ })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(within(sub).getByRole('menuitem', { name: /4500903/ })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(within(sub).getByRole('menuitem', { name: /NOVA SEA 034-26/ })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.queryByRole('menu', { name: 'POs desta consolidada' })).not.toBeInTheDocument()
    expect(subTrigger()).toHaveFocus()
    expect(screen.getByRole('menu', { name: 'Ações da linha 2' })).toBeInTheDocument()
  })

  it('Esc fecha o submenu primeiro e so depois o menu, com o foco de volta no ⋯', async () => {
    const user = userEvent.setup()
    await openMain(user)
    subTrigger().focus()
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'POs desta consolidada' })).not.toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'Ações da linha 2' })).toBeInTheDocument()
    expect(subTrigger()).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('o hover abre o submenu e sair do item o fecha', async () => {
    const user = userEvent.setup()
    await openMain(user)
    await user.hover(subTrigger())
    expect(screen.getByRole('menu', { name: 'POs desta consolidada' })).toBeInTheDocument()
    await user.unhover(subTrigger())
    expect(screen.queryByRole('menu', { name: 'POs desta consolidada' })).not.toBeInTheDocument()
  })

  it('escolher uma PO chama onAction("toPo") com a PO e fecha tudo', async () => {
    const user = userEvent.setup()
    const { onAction } = await openMain(user)
    await user.click(subTrigger())
    await user.click(screen.getByRole('menuitem', { name: /4500903/ }))
    expect(onAction).toHaveBeenCalledWith('toPo', 'r-1', { purchaseOrder: PURCHASE_ORDERS[2] })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('a PO atual nao dispara a acao', async () => {
    const user = userEvent.setup()
    const { onAction } = await openMain(user)
    await user.click(subTrigger())
    await user.click(screen.getByRole('menuitem', { name: /NOVA SEA 034-26/ }))
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('menu da linha (celular)', () => {
  it('abre o ActionSheet com o mesmo conteudo (icones, dicas, remover em vermelho) e sem menu em portal', async () => {
    const user = userEvent.setup()
    const { onAction } = renderMenu({ mobile: true, purchaseOrders: PURCHASE_ORDERS, currentPurchaseOrderIndex: 1 })
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog')

    await user.click(trigger())

    const sheet = screen.getByRole('dialog', { name: 'Linha 2' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const buttons = within(sheet).getAllByRole('button').map((button) => button.textContent)
    expect(buttons).toEqual([
      'Linha acima',
      'Linha abaixo',
      'Duplicar (outro lote)',
      'Dividir em lotes…',
      'Mover para cima',
      'Mover para baixo',
      'Mover para ACME SEA 011-26ACME RESINS CO · pedido 4500901',
      'Mover para NOVA SEA 034-26PO atual',
      'Mover para 4500903ORION CHEM CO · pedido 4500903',
      'Remover linha',
      'Cancelar',
    ])
    expect(within(sheet).getByRole('button', { name: /Mover para NOVA SEA 034-26/ })).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: 'Remover linha' })).toHaveClass('action-sheet__option--danger')

    await user.click(within(sheet).getByRole('button', { name: /Mover para ACME SEA 011-26/ }))
    expect(onAction).toHaveBeenCalledWith('toPo', 'r-1', { purchaseOrder: PURCHASE_ORDERS[0] })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('Cancelar e Esc fecham o sheet sem acao', async () => {
    const user = userEvent.setup()
    const { onAction } = renderMenu({ mobile: true })
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(trigger())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalled()
  })
})
