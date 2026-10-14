import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

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
//
// `onApply` (opcional, formulario de edicao): o chip passa a APLICAR o valor do
// ERP. Sem a prop, tudo acima vale como descrito. Com ela:
//   - mouse: o hover abre e o clique chama `onApply()` e fecha;
//   - teclado: Tab abre, Enter/Espaco chama `onApply()`, Esc fecha;
//   - toque/caneta: o 1o toque abre fixado (mostra o valor), o 2o aplica; o
//     toque fora fecha sem aplicar (nao ha' hover no toque).
// O balao continua sem conteudo interativo; a 2a linha explica a acao.
export default function ErpHint({ hint, className = '', onApply }) {
  if (!hint) return null
  return <ErpHintView hint={hint} className={className} onApply={onApply} />
}

function ErpHintView({ hint, className, onApply }) {
  const bubbleId = useId()
  const wrapperRef = useRef(null)
  const chipRef = useRef(null)
  const bubbleRef = useRef(null)
  const pointerInitiatedRef = useRef(false)
  // pointerType do ultimo pointerdown no chip ('' = o clique veio do teclado).
  const pointerTypeRef = useRef('')
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [keyboardFocused, setKeyboardFocused] = useState(false)
  const [touchOpened, setTouchOpened] = useState(false)
  const [align, setAlign] = useState('start')
  const open = pinned || hovered || keyboardFocused
  const canApply = typeof onApply === 'function'

  const closeAll = useCallback(() => {
    setPinned(false)
    setHovered(false)
    setKeyboardFocused(false)
    setTouchOpened(false)
  }, [])

  // Esc fecha com o foco em qualquer lugar; toque/clique fora tambem.
  useEffect(() => {
    if (!open) return undefined

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
  }, [open, closeAll])

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
    const pointerType = pointerTypeRef.current
    pointerTypeRef.current = ''
    pointerInitiatedRef.current = false

    if (canApply) {
      const isTouch = pointerType !== '' && pointerType !== 'mouse'
      // Toque/caneta: o 1o toque so' mostra o valor; o 2o (aberto) aplica.
      if (isTouch && !(open && pinned)) {
        setPinned(true)
        setTouchOpened(true)
        return
      }
      closeAll()
      onApply()
      return
    }

    if (open && pinned) {
      setPinned(false)
      setHovered(false)
      setKeyboardFocused(false)
    } else {
      setPinned(true)
    }
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
        aria-label={canApply ? `${hint.ariaLabel} (usar este valor)` : hint.ariaLabel}
        aria-describedby={bubbleId}
        onPointerDown={(event) => {
          pointerInitiatedRef.current = true
          pointerTypeRef.current = event.pointerType ?? ''
        }}
        onFocus={() => {
          if (!pointerInitiatedRef.current) setKeyboardFocused(true)
        }}
        onBlur={() => {
          pointerInitiatedRef.current = false
          pointerTypeRef.current = ''
          setKeyboardFocused(false)
        }}
        onClick={handleClick}
      >
        ERP
      </button>
      <span role="tooltip" id={bubbleId} className="erp-hint__bubble" hidden={!open} data-align={align} ref={bubbleRef}>
        {hint.text}
        {canApply ? (
          <>
            {' '}
            <span className="erp-hint__action">
              {touchOpened ? 'Toque em ERP de novo para usar este valor.' : 'Clique em ERP para usar este valor.'}
            </span>
          </>
        ) : null}
      </span>
    </span>
  )
}
