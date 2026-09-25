import { getProcessTitle } from './processLabels'
import PostReceiptImagesField from './PostReceiptImagesField'
import { getQuickReadProcessStatus } from './processStatus'
import { getStatusTagClass } from './processStatusView'

// F10.5 (backlog 2026-07-12): tela de edição das observações pós-recebimento
// da carga no CD (viewMode 'post-receipt-edit'), extraída do ProcessesPage.
// Presentacional — lê o `draft` (via prop) para notas e imagens, e o
// `selectedProcess` para o cabeçalho/status. Todo o estado (draft, upload
// em andamento) e os handlers continuam na página, passados por props.
// Compartilha o `draft` com o ProcessForm (create/edit) — ambos recebem o
// mesmo objeto via prop. Zero mudança visual/comportamental.
export default function PostReceiptEditView({
  selectedProcess,
  draft,
  draftPostReceiptImages,
  isSaving,
  isUploadingPostReceiptImages,
  canSeeName,
  onDraftChange,
  onClose,
  onSave,
  onImagesUpload,
  onRemoveImage,
}) {
  return (
    <article className="list-card" style={{ marginTop: '16px' }}>
      <div className="card-heading">
        <div>
          <h3>Observações pós-recebimento da carga</h3>
        </div>
        <div className="admin-toolbar">
          <span className={getStatusTagClass(selectedProcess.processStatus)}>
            {getQuickReadProcessStatus(selectedProcess)}
          </span>
          <button type="button" className="ghost-button" onClick={onClose}>
            Voltar ao detalhe
          </button>
        </div>
      </div>

      <div className="detail-stack">
        <div className="detail-card">
          <span className="detail-label">Processo</span>
          <p>{getProcessTitle(selectedProcess, canSeeName)}</p>
        </div>
        <label className="field">
          <span>Observações pós-recebimento da carga no CD</span>
          <textarea
            className="text-input text-area"
            value={draft.postReceiptNotes}
            onChange={(event) => onDraftChange('postReceiptNotes', event.target.value)}
            placeholder="Registre observações da carga após o recebimento no CD."
          />
        </label>
        <PostReceiptImagesField
          images={draftPostReceiptImages}
          isUploading={isUploadingPostReceiptImages}
          label="Imagens do recebimento no CD"
          onUpload={onImagesUpload}
          onRemove={onRemoveImage}
        />
      </div>

      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          onClick={onSave}
          disabled={isSaving || isUploadingPostReceiptImages}
        >
          {isSaving ? 'Salvando...' : 'Salvar observações'}
        </button>
      </div>
    </article>
  )
}