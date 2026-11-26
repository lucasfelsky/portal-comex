// F17.4b (B-4): CollectionStatusEditView - render direto, SEM mock de
// `processStatus` (modulo puro real). Cobre o gate do editor de divergencia
// (so' aparece com status pos-recebimento) e o ciclo checkbox -> select +
// textarea + dica de foto.
// S11 (K): o uploader de fotos do recebimento saiu da tela (so leitura no detalhe);
// select com 4 tipos (inclui "Lote").
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

  it('S11 (K): sem uploader "Fotos do recebimento" com status pos-recebimento, mesmo com fotos no rascunho', () => {
    renderView({
      collectionStatus: 'Carga recebida, em conferência',
      draftPostReceiptImages: [{ id: 'IMG-1', url: 'https://x', name: 'foto.jpg' }],
    })
    expect(screen.getByText('Houve divergência no recebimento?')).toBeInTheDocument()
    expect(screen.queryByText('Fotos do recebimento')).not.toBeInTheDocument()
    expect(screen.queryByText('Adicionar imagens')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover imagem' })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })

  it('S11 (K): sem status pos-recebimento a tela nao tem uploader nem editor de divergencia', () => {
    renderView({ collectionStatus: '' })
    expect(screen.queryByText('Fotos do recebimento')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })

  it('S11 (K): dica da divergencia nao pede mais foto (com ou sem fotos no rascunho)', () => {
    const fields = { receiptDivergence: true, receiptDivergenceType: '', receiptDivergenceNotes: '' }
    const { rerender } = render(
      <CollectionStatusEditView
        process={baseProcess()}
        collectionStatus="Carga recebida, em conferência"
        canSeeName
        isSaving={false}
        receiptDivergenceFields={fields}
        draftPostReceiptImages={[]}
        isUploadingPostReceiptImages={false}
        onStatusChange={() => {}}
        onDivergenceChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
      />
    )
    const hint = 'Fotos e observações da avaria ficam no item, na Conferência do Relatório de Carga.'
    expect(screen.getByText(hint)).toBeInTheDocument()
    expect(screen.queryByText(/Anexe ao menos 1 foto/)).not.toBeInTheDocument()

    rerender(
      <CollectionStatusEditView
        process={baseProcess()}
        collectionStatus="Carga recebida, em conferência"
        canSeeName
        isSaving={false}
        receiptDivergenceFields={fields}
        draftPostReceiptImages={[{ id: 'IMG-1', url: 'https://x', name: 'foto.jpg' }]}
        isUploadingPostReceiptImages={false}
        onStatusChange={() => {}}
        onDivergenceChange={() => {}}
        onSave={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.queryByText(/Anexe ao menos 1 foto/)).not.toBeInTheDocument()
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

  // Layout telas 2026-09-29 (S11/K: sem o bloco de fotos): Processo -> Status ->
  // Janelas (leitura) -> Divergencia -> Salvar.
  it('ordem: Processo -> Status -> Janelas -> Divergência -> Salvar', () => {
    renderView({
      collectionStatus: 'Carga recebida, em conferência',
      receiptDivergenceFields: { receiptDivergence: true, receiptDivergenceType: '', receiptDivergenceNotes: '' },
    })
    const processo = screen.getByText('Processo', { selector: '.detail-label' })
    const status = screen.getByText('Status', { selector: 'label.field > span' })
    const janelas = screen.getByText('Janela de coleta')
    const divergencia = screen.getByText('Houve divergência no recebimento?')
    const salvar = screen.getByRole('button', { name: 'Salvar status' })
    const ordered = [processo, status, janelas, divergencia, salvar]
    for (let i = 0; i < ordered.length - 1; i += 1) {
      expect(ordered[i].compareDocumentPosition(ordered[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  // UX-6b-2 (D8): o editor herda o novo visual (sem "Janela atual") e
  // continua so' leitura (todos os inputs de horario desabilitados).
  it('sem "Janela atual"; os inputs "Horário previsto" ficam desabilitados', () => {
    renderView({
      collectionStatus: 'Coleta Agendada',
      process: {
        id: 'PROC-1',
        name: 'Importação Atlas',
        category: 'FCL',
        collectionWindows: [{ id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' }],
        containers: [{ id: 'CNT-1', number: 'CSQU3054383' }],
        postReceiptImages: [],
        processStatus: 'Coleta Agendada',
      },
    })
    expect(screen.queryByText('Janela atual')).not.toBeInTheDocument()
    screen.getAllByLabelText('Horário previsto').forEach((input) => expect(input).toBeDisabled())
  })
})
