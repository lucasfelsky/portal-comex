// F17.4b (B-4): CollectionStatusEditView - render direto, SEM mock de
// `processStatus` (modulo puro real). Cobre o gate do editor de divergencia
// (so' aparece com status pos-recebimento) e o ciclo checkbox -> select +
// textarea + dica de foto.
// F17.4b-fix: + uploader de fotos do recebimento (`PostReceiptImagesField`)
// na mesma tela, contagem/hint vem do `draftPostReceiptImages` (nao mais de
// `process.postReceiptImages`), select com 4 tipos (inclui "Lote").
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
  const onImagesUpload = vi.fn()
  const onRemoveImage = vi.fn()

  render(
    <CollectionStatusEditView
      process={baseProcess()}
      collectionStatus=""
      canSeeName
      isSaving={false}
      receiptDivergenceFields={{ receiptDivergence: false, receiptDivergenceType: '', receiptDivergenceNotes: '' }}
      draftPostReceiptImages={[]}
      isUploadingPostReceiptImages={false}
      onStatusChange={onStatusChange}
      onDivergenceChange={onDivergenceChange}
      onSave={onSave}
      onClose={onClose}
      onImagesUpload={onImagesUpload}
      onRemoveImage={onRemoveImage}
      {...props}
    />
  )

  return { onStatusChange, onDivergenceChange, onSave, onClose, onImagesUpload, onRemoveImage }
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

  it('com a flag true aparecem o select (4 tipos, inclui Lote) e a textarea', () => {
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
    expect(screen.getByText('Lote')).toBeInTheDocument()
    expect(screen.getByText('Descrição da divergência')).toBeInTheDocument()
  })

  it('uploader "Fotos do recebimento" so\' aparece com status pos-recebimento', () => {
    renderView({ collectionStatus: '' })
    expect(screen.queryByText('Fotos do recebimento')).not.toBeInTheDocument()

    renderView({ collectionStatus: 'Carga recebida, em conferência' })
    expect(screen.getByText('Fotos do recebimento')).toBeInTheDocument()
  })

  it('dica de foto aparece quando draftPostReceiptImages vazio e some com 1 imagem', () => {
    const { rerender } = render(
      <CollectionStatusEditView
        process={baseProcess()}
        collectionStatus="Carga recebida, em conferência"
        canSeeName
        isSaving={false}
        receiptDivergenceFields={{ receiptDivergence: true, receiptDivergenceType: '', receiptDivergenceNotes: '' }}
        draftPostReceiptImages={[]}
        isUploadingPostReceiptImages={false}
        onStatusChange={() => {}}
        onDivergenceChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
        onImagesUpload={() => {}}
        onRemoveImage={() => {}}
      />
    )

    expect(
      screen.getByText('Anexe ao menos 1 foto em Fotos do recebimento, abaixo.')
    ).toBeInTheDocument()

    rerender(
      <CollectionStatusEditView
        process={baseProcess()}
        collectionStatus="Carga recebida, em conferência"
        canSeeName
        isSaving={false}
        receiptDivergenceFields={{ receiptDivergence: true, receiptDivergenceType: '', receiptDivergenceNotes: '' }}
        draftPostReceiptImages={[{ id: 'IMG-1', url: 'https://x', name: 'foto.jpg' }]}
        isUploadingPostReceiptImages={false}
        onStatusChange={() => {}}
        onDivergenceChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
        onImagesUpload={() => {}}
        onRemoveImage={() => {}}
      />
    )

    expect(
      screen.queryByText('Anexe ao menos 1 foto em Fotos do recebimento, abaixo.')
    ).not.toBeInTheDocument()
  })

  it('"Remover imagem" chama onRemoveImage com o id da foto', async () => {
    const user = userEvent.setup()
    const { onRemoveImage } = renderView({
      collectionStatus: 'Carga recebida, em conferência',
      draftPostReceiptImages: [{ id: 'IMG-1', url: 'https://x', name: 'foto.jpg' }],
    })

    await user.click(screen.getByRole('button', { name: 'Remover imagem' }))

    expect(onRemoveImage).toHaveBeenCalledWith('IMG-1')
  })

  it('botao Salvar desabilitado durante isUploadingPostReceiptImages', () => {
    renderView({ collectionStatus: 'Carga recebida, em conferência', isUploadingPostReceiptImages: true })
    expect(screen.getByRole('button', { name: /Salvar status/i })).toBeDisabled()
  })

  it('onSave e\' chamado ao clicar "Salvar status"', async () => {
    const user = userEvent.setup()
    const { onSave } = renderView({ collectionStatus: 'Carga recebida, em conferência' })

    await user.click(screen.getByRole('button', { name: /Salvar status/i }))

    expect(onSave).toHaveBeenCalled()
  })
})
