// Tests do componente ConfirmDialog (Sprint 32; UX-1 2026-09-25).
// Cobre:
//   - Nao renderiza quando open=false
//   - Renderiza title e message quando open=true (role="alertdialog")
//   - Botão Confirmar chama onConfirm
//   - Botão Cancelar chama onCancel
//   - tone=danger: botao de confirmacao usa classe danger-button
//   - tone=primary: botao de confirmacao usa classe primary-button
//   - busy=true: desabilita ambos botoes
//   - confirmLabel/cancelLabel custom
//   - foco inicial no botao Cancelar
//   - aria-describedby aponta para a mensagem
//   - Esc chama onCancel quando busy=false e nao chama quando busy=true
//   - prop error renderiza role="alert" com o texto
//   - busyLabel custom aparece durante busy
//
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import ConfirmDialog from '../../src/components/ConfirmDialog.jsx'

describe('ConfirmDialog', () => {
  it('open=false: nao renderiza nada', () => {
    render(
      <ConfirmDialog
        open={false}
        title="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('open=true: renderiza title e message', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Restaurar regras?"
        message="Esta acao sera registrada na auditoria."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Restaurar regras?')).toBeInTheDocument()
    expect(screen.getByText(/Esta acao sera registrada/i)).toBeInTheDocument()
  })

  it('click em Confirmar: chama onConfirm', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        open={true}
        title="X"
        confirmLabel="Restaurar"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Restaurar' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('click em Cancelar: chama onCancel', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        open={true}
        title="X"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('tone=danger: botao de confirmacao usa classe danger-button', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Apagar?"
        tone="danger"
        confirmLabel="Apagar"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    const confirmBtn = screen.getByRole('button', { name: 'Apagar' })
    expect(confirmBtn.className).toMatch(/danger-button/)
  })

  it('tone=primary (default): botao de confirmacao usa classe primary-button', () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        confirmLabel="OK"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    const confirmBtn = screen.getByRole('button', { name: 'OK' })
    expect(confirmBtn.className).toMatch(/primary-button/)
  })

  it('busy=true: desabilita botoes de acao', () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        busy={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    // Filtra o close button (×) do Modal que tem aria-label="Fechar"
    const actionButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.getAttribute('aria-label') !== 'Fechar')
    expect(actionButtons).toHaveLength(2)
    actionButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })

  it('busy=true: label do botao confirmar vira "Aguarde..."', () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        confirmLabel="Salvar"
        busy={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /Aguarde/i })).toBeInTheDocument()
  })

  it('labels custom: confirmLabel e cancelLabel', () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        confirmLabel="Sim, restaurar"
        cancelLabel="Agora nao"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Sim, restaurar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agora nao' })).toBeInTheDocument()
  })

  it('foco inicial vai para o botao Cancelar', async () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        message="Mensagem"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' })
    await waitFor(() => expect(cancelBtn).toHaveFocus())
  })

  it('aria-describedby aponta para o id da mensagem', () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        message="Esta acao nao pode ser desfeita."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    const dialog = screen.getByRole('alertdialog')
    const describedById = dialog.getAttribute('aria-describedby')
    expect(describedById).toBeTruthy()
    expect(document.getElementById(describedById)).toHaveTextContent('Esta acao nao pode ser desfeita.')
  })

  it('Esc chama onCancel quando busy=false', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        open={true}
        title="X"
        busy={false}
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    )
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Esc nao chama onCancel quando busy=true', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        open={true}
        title="X"
        busy={true}
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    )
    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('prop error: renderiza role="alert" com o texto', () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        error="Não foi possível excluir o usuário."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível excluir o usuário.')
  })

  it('busyLabel custom aparece com busy=true', () => {
    render(
      <ConfirmDialog
        open={true}
        title="X"
        confirmLabel="Excluir usuário"
        busy={true}
        busyLabel="Excluindo..."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Excluindo...' })).toBeInTheDocument()
  })
})
