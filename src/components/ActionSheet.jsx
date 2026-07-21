import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// C12 (auditoria mobile F14): bottom sheet com lista de opções, estilo iOS.
// Genérico — recebe `options` [{ value, label, disabled? }], a `value`
// selecionada e callbacks. Não é acoplado a <select>; o SelectField é quem
// liga isso ao form. Fecha por: tocar numa opção, tocar no backdrop, botão
// "Cancelar" ou tecla Esc. Foco vai pra opção ativa ao abrir (a11y).
//
// Renderiza via Portal em document.body para evitar o mesmo problema de
// stacking context que o Modal teve dentro de PageFade (transform/will-change).
export default function ActionSheet({
  title,
  options = [],
  value,
  onSelect,
  onClose,
}) {
  const activeRef = useRef(null)

  useEffect(() => {
    // foco inicial na opção ativa (ou na primeira) pra navegação por teclado.
    activeRef.current?.focus()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const sheet = (
    <div
      className="action-sheet-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Selecione uma opção'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="action-sheet__handle" aria-hidden="true" />
        {title ? <p className="action-sheet__title">{title}</p> : null}
        <ul className="action-sheet__list">
          {options.map((option) => {
            const isActive = String(option.value) === String(value)
            return (
              <li key={String(option.value)}>
                <button
                  ref={isActive ? activeRef : null}
                  type="button"
                  className={`action-sheet__option${isActive ? ' action-sheet__option--active' : ''}`}
                  disabled={option.disabled}
                  onClick={() => onSelect(option.value)}
                >
                  <span>{option.label}</span>
                  {isActive ? (
                    <span className="action-sheet__check" aria-hidden="true">✓</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          className="action-sheet__cancel"
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(sheet, document.body)
}
