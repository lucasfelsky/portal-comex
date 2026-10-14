// Clique no chip "ERP" do formulario (`ErpFormFieldHint`): a allowlist
// ERP_FORM_APPLY_FIELDS e' reaplicada em runtime sobre o `hint.apply`, mesmo
// que o hint venha forjado. Fixtures 100% sinteticas.
//
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErpFormFieldHint from '../../src/features/processes/ErpFormFieldHint'

function renderHint(apply) {
  const onDraftChange = vi.fn()
  const hint = { ariaLabel: 'ERP: valor sintetico', text: 'ERP: 20/10/2026', apply }
  render(
    <ErpFormFieldHint active hint={hint} onDraftChange={onDraftChange}>
      <input id="f-eta" aria-label="ETA" />
    </ErpFormFieldHint>
  )
  return onDraftChange
}

describe('ErpFormFieldHint - allowlist no clique', () => {
  it('hint forjado: grava so o campo da allowlist', async () => {
    const onDraftChange = renderHint([
      { field: 'processStatus', value: 'Entregue' },
      { field: 'category', value: 'FCL' },
      { field: 'processNumber', value: '9999' },
      { field: 'demurrageDailyRateUsd', value: 100 },
      { field: 'eta', value: '2026-10-20' },
    ])
    await userEvent.click(screen.getByRole('button', { name: 'ERP: valor sintetico (usar este valor)' }))
    expect(onDraftChange).toHaveBeenCalledTimes(1)
    expect(onDraftChange).toHaveBeenCalledWith('eta', '2026-10-20')
  })

  it('so campos proibidos: chip vira so aviso e o clique nao grava nada', async () => {
    const onDraftChange = renderHint([
      { field: 'processStatus', value: 'Entregue' },
      { field: 'category', value: 'FCL' },
      { field: 'processNumber', value: '9999' },
      { field: 'eta' },
    ])
    const chip = screen.getByRole('button', { name: 'ERP: valor sintetico' })
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).not.toContain('para usar este valor')
    await userEvent.click(chip)
    expect(onDraftChange).not.toHaveBeenCalled()
  })

  it('controle: tudo valido aplica as 2 operacoes na ordem', async () => {
    const onDraftChange = renderHint([
      { field: 'vesselName', value: 'NAVIO TESTE' },
      { field: 'voyage', value: '001E' },
    ])
    await userEvent.click(screen.getByRole('button', { name: 'ERP: valor sintetico (usar este valor)' }))
    expect(onDraftChange).toHaveBeenCalledTimes(2)
    expect(onDraftChange).toHaveBeenNthCalledWith(1, 'vesselName', 'NAVIO TESTE')
    expect(onDraftChange).toHaveBeenNthCalledWith(2, 'voyage', '001E')
  })
})
