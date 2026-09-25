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
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <input
          className="text-input"
          type="file"
          accept="image/*"
          multiple
          onChange={onUpload}
          disabled={disabled || isUploading || images.length >= MAX_POST_RECEIPT_IMAGES}
        />
        <small className="field-hint">
          Anexo opcional. Até {MAX_POST_RECEIPT_IMAGES} imagens de{' '}
          {formatPostReceiptImageSize(MAX_POST_RECEIPT_IMAGE_SIZE_BYTES)} cada.
        </small>
      </label>
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
