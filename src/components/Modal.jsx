import { useEffect, useRef } from 'react'

// Componente Modal (Sprint 9).
// API:
//   <Modal
//     open={boolean}
//     onClose={() => void}
//     title="Titulo do modal"
//     wide?     // max-width 760px ao inves de 520
//   >
//     <p>conteudo</p>
//   </Modal>
//
// Comportamento:
//   - Renderiza um .modal-backdrop com .modal dentro
//   - close on Esc
//   - close on click no backdrop (fora do .modal)
//   - bloqueia scroll do body enquanto aberto
//   - restaura foco no elemento que estava focado antes de abrir
//   - opcional: focus trap (delegado ao browser via tabindex=-1)
//
// Nao renderiza nada quando `open` e' false.

export default function Modal({ open, onClose, title, wide = false, children, ariaLabel }) {
  const modalRef = useRef(null)
  const lastFocusedRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    // Guarda o elemento focado antes de abrir (restaura no cleanup)
    lastFocusedRef.current = document.activeElement

    // Bloqueia scroll do body
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Foco inicial no modal (acessibilidade)
    if (modalRef.current) {
      modalRef.current.focus()
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow

      // Restaura foco no elemento original
      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === 'function') {
        lastFocusedRef.current.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  function handleBackdropClick(event) {
    // Fecha so' se o clique foi no backdrop, nao no .modal filho
    if (event.target === event.currentTarget) {
      onClose?.()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} role="presentation">
      <div
        ref={modalRef}
        className={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title ?? 'Modal'}
        tabIndex={-1}
      >
        <div className="modal__header">
          {title ? <h2 className="modal__title">{title}</h2> : <span />}
          <button
            type="button"
            className="modal__close"
            aria-label="Fechar"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}
