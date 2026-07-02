import { useEffect, useRef } from 'react'

// Componente Modal (Sprint 9, a11y Sprint 28).
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
//   - aria-modal="true" + aria-label/title
//   - Foco inicial no primeiro elemento focavel do modal
//   - Focus trap: Tab e Shift+Tab ficam dentro do modal
//   - Restaura foco no elemento que estava focado antes de abrir
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

    function getFocusableElements() {
      if (!modalRef.current) return []
      return Array.from(
        modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('aria-hidden'))
    }

    // Foco inicial no primeiro focusable (ou no proprio modal se nao houver)
    const initialFocus = window.setTimeout(() => {
      const focusables = getFocusableElements()
      if (focusables.length > 0) {
        focusables[0].focus()
      } else if (modalRef.current) {
        modalRef.current.focus()
      }
    }, 30)

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if (event.key !== 'Tab') return

      // Focus trap: Tab e Shift+Tab ficam dentro do modal
      const focusables = getFocusableElements()
      if (focusables.length === 0) {
        event.preventDefault()
        modalRef.current?.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !modalRef.current?.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !modalRef.current?.contains(active)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(initialFocus)
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
