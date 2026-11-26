// S11-D2 (L-8): alternador "Este arquivo também contém o Packing List", ao lado do Enviar/Baixar da Invoice. Botão-
// ícone (documento duplo, com marca de check quando ligado), `aria-pressed`, alvo de toque de 44 px e dica ao passar o
// mouse ou focar. Bloqueado (o Packing List já tem arquivo próprio): `aria-disabled` (continua focável), a dica mostra o
// motivo e o clique não chama nada. `disabled` só enquanto grava (`busy`). No celular o toque alterna e mostra a dica
// por alguns segundos.
//
// Sem lógica de dados: quem usa decide o que `onToggle(next)` faz (mesmo `handleSetPackingListLink` de sempre).

import { useEffect, useId, useRef, useState } from 'react'

export const PACKING_LIST_TOGGLE_LABEL = 'Este arquivo também contém o Packing List'
export const PACKING_LIST_TOGGLE_BLOCKED_REASON = 'O Packing List já tem arquivo próprio.'
const TOUCH_TIP_MS = 2500

export default function PackingListToggle({ checked, blocked = false, busy = false, po = '', onToggle }) {
  const tipId = useId()
  const [touchOpen, setTouchOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const timerRef = useRef(null)

  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
    },
    []
  )

  function showTipOnTouch() {
    const touchOnly = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)')?.matches
    if (!touchOnly) return
    setTouchOpen(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTouchOpen(false), TOUCH_TIP_MS)
  }

  function handleClick() {
    setDismissed(false)
    showTipOnTouch()
    if (blocked || busy) return
    onToggle?.(!checked)
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape') return
    clearTimeout(timerRef.current)
    setTouchOpen(false)
    setDismissed(true)
  }

  const label = po ? `${PACKING_LIST_TOGGLE_LABEL} da PO ${po}` : PACKING_LIST_TOGGLE_LABEL

  return (
    <span className="pl-toggle">
      <button
        type="button"
        className={`pl-toggle__button${blocked ? ' pl-toggle__button--blocked' : ''}`}
        aria-pressed={checked}
        aria-disabled={blocked || undefined}
        aria-label={label}
        aria-describedby={blocked ? tipId : undefined}
        disabled={busy}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setDismissed(false)}
        onFocus={() => setDismissed(false)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M8 7V5a2 2 0 0 1 2-2h6l4 4v8a2 2 0 0 1-2 2h-2" />
          <path d="M4 10a2 2 0 0 1 2-2h5l4 4v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </svg>
        <span className="pl-toggle__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={`pl-toggle__tip${touchOpen ? ' pl-toggle__tip--open' : ''}`}
        data-dismissed={dismissed || undefined}
      >
        {blocked ? PACKING_LIST_TOGGLE_BLOCKED_REASON : PACKING_LIST_TOGGLE_LABEL}
      </span>
    </span>
  )
}
