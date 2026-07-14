import { formatPostReceiptImageSize } from '../../utils/postReceiptImages'

// F10.2 (backlog 2026-07-12): lightbox das imagens de pós-recebimento no CD,
// extraído do ProcessesPage. Presentacional puro — o estado (índice, imagem
// selecionada, refs de touch) e os handlers continuam na página, passados por
// props. Renderizado apenas quando há imagem selecionada (a página mantém o
// guard `isPostReceiptGalleryOpen`). Zero mudança visual/comportamental.
export default function PostReceiptGallery({
  image,
  index,
  images,
  onClose,
  onNavigate,
  onTouchStart,
  onTouchEnd,
}) {
  return (
    <div className="post-receipt-gallery-backdrop" onClick={onClose}>
      <div className="post-receipt-gallery" onClick={(event) => event.stopPropagation()}>
        <div className="post-receipt-gallery__header">
          <div>
            <span className="detail-label">Imagens do recebimento no CD</span>
            <h3>{image?.name || 'Imagem do recebimento no CD'}</h3>
            <p>
              {index + 1} de {images.length}
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div
          className="post-receipt-gallery__stage"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {images.length > 1 ? (
            <button
              type="button"
              className="post-receipt-gallery__nav post-receipt-gallery__nav--prev"
              onClick={() => onNavigate(-1)}
              aria-label="Ver imagem anterior"
            >
              <svg
                className="post-receipt-gallery__nav-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M14.5 5.5L8 12l6.5 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}

          <img
            src={image.url}
            alt={image.name || 'Imagem do recebimento no CD'}
            className="post-receipt-gallery__image"
            draggable="false"
          />

          {images.length > 1 ? (
            <button
              type="button"
              className="post-receipt-gallery__nav post-receipt-gallery__nav--next"
              onClick={() => onNavigate(1)}
              aria-label="Ver próxima imagem"
            >
              <svg
                className="post-receipt-gallery__nav-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M9.5 5.5L16 12l-6.5 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="post-receipt-gallery__footer">
          <div className="post-receipt-gallery__meta">
            <strong>{image?.name || 'Imagem do recebimento no CD'}</strong>
            {image?.size ? <span>{formatPostReceiptImageSize(image.size)}</span> : null}
          </div>

          {images.length > 1 ? (
            <p className="post-receipt-gallery__hint">
              Use as setas ou deslize para o lado no celular.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
