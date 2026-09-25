import { useId } from 'react'
import {
  MAX_POST_RECEIPT_IMAGES,
  MAX_POST_RECEIPT_IMAGE_SIZE_BYTES,
  formatPostReceiptImageSize,
  toPostReceiptImagePreviewUrl,
} from '../../utils/postReceiptImages'

// F17.4b-fix (D5): bloco input+grid extraído de `PostReceiptEditView.jsx`
// (markup e classes CSS IDÊNTICOS), reusado por `CollectionStatusEditView.jsx`
// (tela "Status de coleta" - fotos do recebimento pós-agendamento). Mantém
// mobile/tema escuro (mesmas classes `post-receipt-image-grid`/
// `post-receipt-image-card`). Presentacional — todo o estado (draft, upload
// em andamento) e os handlers continuam nas telas que a usam.
export default function PostReceiptImagesField({
  images,
  isUploading,
  disabled = false,
  label = 'Imagens do recebimento no CD',
  onUpload,
  onRemove,
}) {
  const labelId = useId()
  const statusId = useId()
  const isDisabled = disabled || isUploading || images.length >= MAX_POST_RECEIPT_IMAGES

  return (
    <>
      <div className="field">
        <span id={labelId}>{label}</span>
        <div className="file-picker">
          <label className={`ghost-button file-picker__button${isDisabled ? ' file-picker__button--disabled' : ''}`}>
            <input
              className="file-picker__input"
              type="file"
              accept="image/*"
              multiple
              onChange={onUpload}
              disabled={isDisabled}
              aria-labelledby={labelId}
              aria-describedby={statusId}
            />
            Adicionar imagens
          </label>
          <span className="file-picker__status" id={statusId}>
            {images.length} de {MAX_POST_RECEIPT_IMAGES} imagens
          </span>
        </div>
        <small className="field-hint">
          Anexo opcional. Até {MAX_POST_RECEIPT_IMAGES} imagens de{' '}
          {formatPostReceiptImageSize(MAX_POST_RECEIPT_IMAGE_SIZE_BYTES)} cada.
        </small>
      </div>
      {images.length > 0 ? (
        <div className="post-receipt-image-grid">
          {images.map((image) => (
            <div key={image.id} className="post-receipt-image-card">
              <img
                src={toPostReceiptImagePreviewUrl(image)}
                alt={image.name || 'Imagem do recebimento no CD'}
              />
              <div className="post-receipt-image-card__meta">
                <strong>{image.name || 'Imagem do recebimento no CD'}</strong>
                <span>{formatPostReceiptImageSize(image.size)}</span>
              </div>
              <button type="button" className="ghost-button" onClick={() => onRemove(image.id)}>
                Remover imagem
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
