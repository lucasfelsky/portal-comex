import { useEffect, useRef, useState } from 'react'

// Componente Modal (Sprint 9, a11y Sprint 28, bottom sheet C5).
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
//   - C5: em mobile (<=720px) o CSS transforma o modal em bottom sheet.
//     O grab handle (.modal__sheet-handle) aparece no topo. Swipe-down
//     no handle fecha o modal (gesture natural do iOS). O drag segue o
//     dedo em tempo real (transform: translateY) e solta: se arrastou
//     mais de 120px fecha, senao volta.
//
// Nao renderiza nada quando `open` e' false.

const SWIPE_CLOSE_THRESHOLD = 120

export default function Modal({ open, onClose, title, wide = false, children, ariaLabel, className = '' }) {
  const modalRef = useRef(null)
  const lastFocusedRef = useRef(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isClosing, setIsClosing] = useState(false)
  const dragStartRef = useRef({ y: 0, started: false })

  useEffect(() => {
    if (!open) return undefined

    setDragOffset(0)
    setIsClosing(false)

    lastFocusedRef.current = document.activeElement

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

      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === 'function') {
        lastFocusedRef.current.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose?.()
    }
  }

  function handleHandlePointerDown(event) {
    dragStartRef.current = { y: event.clientY, started: true }
    setDragOffset(0)
  }

  function handleHandlePointerMove(event) {
    if (!dragStartRef.current.started) return
    const delta = event.clientY - dragStartRef.current.y
    if (delta > 0) {
      setDragOffset(delta)
    }
  }

  function handleHandlePointerUp() {
    if (!dragStartRef.current.started) return
    dragStartRef.current.started = false

    if (dragOffset > SWIPE_CLOSE_THRESHOLD) {
      setIsClosing(true)
      window.setTimeout(() => {
        onClose?.()
      }, 240)
    } else {
      setDragOffset(0)
    }
  }

  const sheetStyle = dragOffset > 0
    ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
    : undefined

  const sheetClass = isClosing
    ? `modal${wide ? ' modal--wide' : ''}${className ? ` ${className}` : ''} modal--sheet-closing`
    : `modal${wide ? ' modal--wide' : ''}${className ? ` ${className}` : ''}`

  return (
    <div className={`modal-backdrop${className ? ` ${className}-backdrop` : ''}`} onClick={handleBackdropClick} role="presentation">
      <div
        ref={modalRef}
        className={sheetClass}
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title ?? 'Modal'}
        tabIndex={-1}
      >
        <div
          className="modal__sheet-handle"
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
        />
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