import {
  MAX_POST_RECEIPT_IMAGES,
  MAX_POST_RECEIPT_IMAGE_SIZE_BYTES,
  formatPostReceiptImageSize,
  toPostReceiptImagePreviewUrl,
} from '../../utils/postReceiptImages'
import { getProcessTitle } from './processLabels'
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
  isAdmin,
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
          <p>{getProcessTitle(selectedProcess, isAdmin)}</p>
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
        <label className="field">
          <span>Imagens do recebimento no CD</span>
          <input
            className="text-input"
            type="file"
            accept="image/*"
            multiple
            onChange={onImagesUpload}
            disabled={
              isUploadingPostReceiptImages ||
              draftPostReceiptImages.length >= MAX_POST_RECEIPT_IMAGES
            }
          />
          <small className="field-hint">
            Anexo opcional. Até {MAX_POST_RECEIPT_IMAGES} imagens de{' '}
            {formatPostReceiptImageSize(MAX_POST_RECEIPT_IMAGE_SIZE_BYTES)} cada.
          </small>
        </label>
        {draftPostReceiptImages.length > 0 ? (
          <div className="post-receipt-image-grid">
            {draftPostReceiptImages.map((image) => (
              <div key={image.id} className="post-receipt-image-card">
                <img
                  src={toPostReceiptImagePreviewUrl(image)}
                  alt={image.name || 'Imagem do recebimento no CD'}
                />
                <div className="post-receipt-image-card__meta">
                  <strong>{image.name || 'Imagem do recebimento no CD'}</strong>
                  <span>{formatPostReceiptImageSize(image.size)}</span>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onRemoveImage(image.id)}
                >
                  Remover imagem
                </button>
              </div>
            ))}
          </div>
        ) : null}
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