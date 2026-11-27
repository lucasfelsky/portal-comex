// S11-J: aviso da leitura automática do COA ("não iniciada", "interrompida", relatório fechado) como botão-ícone com
// pop-up, no padrão do alternador do Packing List (`PackingListToggle`): `role="tooltip"` ligado por `aria-describedby`,
// abre ao passar o mouse e ao focar pelo teclado, Esc fecha, o toque abre e fecha (e o toque fora fecha). A mensagem é
// persistente: nenhum timer a esconde. A informação não fica só no pop-up: uma região `role="status"` oculta
// visualmente anuncia o mesmo texto para leitor de tela.

import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../../components/Icon'

const INTERRUPTED_PREFIX = 'Leitura automática interrompida'
export const COA_AUTO_READ_NOTICE_LABEL_INTERRUPTED = 'Leitura automática interrompida'
export const COA_AUTO_READ_NOTICE_LABEL_NOT_STARTED = 'Leitura automática não iniciada'

// Foco que veio do teclado (e não de um clique/toque): o clique tem controle próprio (`pinned`).
function isKeyboardFocus(element) {
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}

export default function CoaAutoReadNotice({ text }) {
  const tipId = useId()
  const rootRef = useRef(null)
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = !dismissed && (pinned || hovered || focused)
  const label = text.startsWith(INTERRUPTED_PREFIX)
    ? COA_AUTO_READ_NOTICE_LABEL_INTERRUPTED
    : COA_AUTO_READ_NOTICE_LABEL_NOT_STARTED

  // Esc (com o foco no botão ou só com o mouse em cima) fecha; tocar fora fecha o que foi aberto por toque/clique.
  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setPinned(false)
      setDismissed(true)
    }
    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) return
      setPinned(false)
      setFocused(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  return (
    <span className="coa-auto-read-notice coa-auto-read--notice" ref={rootRef}>
      <button
        type="button"
        className="coa-auto-read-notice__button"
        aria-label={label}
        aria-describedby={tipId}
        onClick={() => {
          setDismissed(false)
          setPinned((current) => !current)
        }}
        onPointerEnter={(event) => {
          if (event.pointerType && event.pointerType !== 'mouse') return
          setDismissed(false)
          setHovered(true)
        }}
        onPointerLeave={() => setHovered(false)}
        onFocus={(event) => {
          if (!isKeyboardFocus(event.currentTarget)) return
          setDismissed(false)
          setFocused(true)
        }}
        onBlur={() => setFocused(false)}
      >
        <Icon name="alert" size={18} />
      </button>
      <span id={tipId} role="tooltip" className={`coa-auto-read-notice__tip${open ? ' coa-auto-read-notice__tip--open' : ''}`}>
        {text}
      </span>
      <span className="documents-visually-hidden" role="status" aria-live="polite">
        {text}
      </span>
    </span>
  )
}
