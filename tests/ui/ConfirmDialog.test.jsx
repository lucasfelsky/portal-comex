// Tests do componente ConfirmDialog (Sprint 32).
// Cobre:
//   - Nao renderiza quando open=false
//   - Renderiza title e message quando open=true
//   - Botão Confirmar chama onConfirm
//   - Botão Cancelar chama onCancel
//   - tone=danger: botao de confirmacao usa classe danger-button
//   - tone=primary: botao de confirmacao usa classe primary-button
//   - busy=true: desabilita ambos botoes
//   - confirmLabel/cancelLabel custom
//
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    expect(screen.queryByRole('dialog')).toBeNull()
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
    expect(screen.getByRole('dialog')).toBeInTheDocument()
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
})
