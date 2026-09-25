// F17.4b (B-4): CollectionStatusEditView - render direto, SEM mock de
// `processStatus` (modulo puro real). Cobre o gate do editor de divergencia
// (so' aparece com status pos-recebimento) e o ciclo checkbox -> select +
// textarea + dica de foto.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionStatusEditView from '../../src/features/processes/CollectionStatusEditView'

function baseProcess(overrides = {}) {
  return {
    id: 'PROC-1',
    name: 'Importação Atlas',
    category: 'FCL',
    collectionWindows: [],
    containers: [],
    postReceiptImages: [],
    processStatus: 'Coleta Agendada',
    ...overrides,
  }
}

function renderView(props = {}) {
  const onStatusChange = vi.fn()
  const onDivergenceChange = vi.fn()
  const onSave = vi.fn()
  const onClose = vi.fn()

  render(
    <CollectionStatusEditView
      process={baseProcess()}
      collectionStatus=""
      canSeeName
      isSaving={false}
      receiptDivergenceFields={{ receiptDivergence: false, receiptDivergenceType: '', receiptDivergenceNotes: '' }}
      onStatusChange={onStatusChange}
      onDivergenceChange={onDivergenceChange}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />
  )

  return { onStatusChange, onDivergenceChange, onSave, onClose }
}

describe('CollectionStatusEditView - editor de divergencia (F17.4b)', () => {
  it('status "" -> sem checkbox de divergencia', () => {
    renderView({ collectionStatus: '' })
    expect(screen.queryByText('Houve divergência no recebimento?')).not.toBeInTheDocument()
  })

  it('status "Carga a caminho do CD" -> sem checkbox de divergencia', () => {
    renderView({ collectionStatus: 'Carga a caminho do CD' })
    expect(screen.queryByText('Houve divergência no recebimento?')).not.toBeInTheDocument()
  })

  it('status "Carga recebida, em conferência" -> mostra checkbox de divergencia', () => {
    renderView({ collectionStatus: 'Carga recebida, em conferência' })
    expect(screen.getByText('Houve divergência no recebimento?')).toBeInTheDocument()
  })

  it('marcar o checkbox chama onDivergenceChange("receiptDivergence", true)', async () => {
    const user = userEvent.setup()
    const { onDivergenceChange } = renderView({ collectionStatus: 'Carga recebida, em conferência' })

    await user.click(screen.getByRole('checkbox', { name: 'Houve divergência no recebimento?' }))

    expect(onDivergenceChange).toHaveBeenCalledWith('receiptDivergence', true)
  })

  it('com a flag true aparecem o select (3 tipos) e a textarea', () => {
    renderView({
      collectionStatus: 'Carga recebida, em conferência',
      receiptDivergenceFields: {
        receiptDivergence: true,
        receiptDivergenceType: '',
        receiptDivergenceNotes: '',
      },
    })

    expect(screen.getByText('Tipo de divergência')).toBeInTheDocument()
    expect(screen.getByText('Avaria')).toBeInTheDocument()
    expect(screen.getByText('Falta')).toBeInTheDocument()
    expect(screen.getByText('Sobra')).toBeInTheDocument()
    expect(screen.getByText('Descrição da divergência')).toBeInTheDocument()
  })

  it('dica de foto aparece quando postReceiptImages vazio e some com 1 imagem', () => {
    const { rerender } = render(
      <CollectionStatusEditView
        process={baseProcess({ postReceiptImages: [] })}
        collectionStatus="Carga recebida, em conferência"
        canSeeName
        isSaving={false}
        receiptDivergenceFields={{ receiptDivergence: true, receiptDivergenceType: '', receiptDivergenceNotes: '' }}
        onStatusChange={() => {}}
        onDivergenceChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
      />
    )

    expect(
      screen.getByText('Anexe ao menos 1 foto em Observações pós-recebimento.')
    ).toBeInTheDocument()

    rerender(
      <CollectionStatusEditView
        process={baseProcess({ postReceiptImages: [{ id: 'IMG-1', url: 'https://x' }] })}
        collectionStatus="Carga recebida, em conferência"
        canSeeName
        isSaving={false}
        receiptDivergenceFields={{ receiptDivergence: true, receiptDivergenceType: '', receiptDivergenceNotes: '' }}
        onStatusChange={() => {}}
        onDivergenceChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
      />
    )

    expect(
      screen.queryByText('Anexe ao menos 1 foto em Observações pós-recebimento.')
    ).not.toBeInTheDocument()
  })

  it('onSave e\' chamado ao clicar "Salvar status"', async () => {
    const user = userEvent.setup()
    const { onSave } = renderView({ collectionStatus: 'Carga recebida, em conferência' })

    await user.click(screen.getByRole('button', { name: /Salvar status/i }))

    expect(onSave).toHaveBeenCalled()
  })
})
