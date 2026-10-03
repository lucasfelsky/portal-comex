import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

// Aviso "ERP" (PR 3): chip pequeno ao lado do campo cujo valor difere do da
// referencia do ERP (ou esta' vazio no Portal). Padrao TOOLTIP, nao disclosure:
// o balao esta sempre no DOM (`hidden` quando fechado), o botao o descreve por
// `aria-describedby` e nao ha `aria-expanded`. So' le `hint.ariaLabel` e
// `hint.text` (o resto do hint e' do detalhe). Importa so' `react`.
//
// Abertura = fixado OU mouse em cima OU foco de teclado:
//   - mouse: o hover no wrapper (chip + balao) abre; ir do chip ao balao nao
//     fecha (WCAG 1.4.13 "hoverable"); o clique fixa e o 2o fecha;
//   - toque: o 1o toque abre fixado, o 2o fecha. O `pointerType` separa o
//     toque do mouse: o hover e o foco de compatibilidade que o navegador
//     dispara depois do toque nao abrem "solto";
//   - teclado: Tab abre, Enter fixa, Enter de novo fecha;
//   - Esc (em qualquer foco) e o toque/clique fora fecham; Esc nao move o foco.
// Em <= 1040px o balao vai para o fluxo (CSS); no desktop o lado e' medido ao
// abrir e vira `data-align="end"` quando passaria da borda direita.
export default function ErpHint({ hint, className = '' }) {
  if (!hint) return null
  return <ErpHintView hint={hint} className={className} />
}

function ErpHintView({ hint, className }) {
  const bubbleId = useId()
  const wrapperRef = useRef(null)
  const chipRef = useRef(null)
  const bubbleRef = useRef(null)
  const pointerInitiatedRef = useRef(false)
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [keyboardFocused, setKeyboardFocused] = useState(false)
  const [align, setAlign] = useState('start')
  const open = pinned || hovered || keyboardFocused

  // Esc fecha com o foco em qualquer lugar; toque/clique fora tambem.
  useEffect(() => {
    if (!open) return undefined

    function closeAll() {
      setPinned(false)
      setHovered(false)
      setKeyboardFocused(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeAll()
    }

    function handleOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) closeAll()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open])

  // Lado do balao (desktop): mede com o alinhamento padrao e, se passaria da
  // borda direita do conteudo, alinha pela direita do chip.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    const chip = chipRef.current
    if (!open || !bubble || !chip) return
    const boundary = chip.closest('.main-content') ?? document.documentElement
    bubble.setAttribute('data-align', 'start')
    const next = bubble.getBoundingClientRect().right > boundary.getBoundingClientRect().right ? 'end' : 'start'
    bubble.setAttribute('data-align', next)
    setAlign(next)
  }, [open])

  function handleClick() {
    if (open && pinned) {
      setPinned(false)
      setHovered(false)
      setKeyboardFocused(false)
    } else {
      setPinned(true)
    }
    pointerInitiatedRef.current = false
  }

  return (
    <span
      className={`erp-hint${className ? ` ${className}` : ''}`}
      ref={wrapperRef}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setHovered(false)
      }}
    >
      <button
        type="button"
        className="erp-hint__chip"
        ref={chipRef}
        aria-label={hint.ariaLabel}
        aria-describedby={bubbleId}
        onPointerDown={() => {
          pointerInitiatedRef.current = true
        }}
        onFocus={() => {
          if (!pointerInitiatedRef.current) setKeyboardFocused(true)
        }}
        onBlur={() => {
          pointerInitiatedRef.current = false
          setKeyboardFocused(false)
        }}
        onClick={handleClick}
      >
        ERP
      </button>
      <span role="tooltip" id={bubbleId} className="erp-hint__bubble" hidden={!open} data-align={align} ref={bubbleRef}>
        {hint.text}
      </span>
    </span>
  )
}
