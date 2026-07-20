import { useCallback, useRef, useState } from 'react'

// Gesto de swipe-to-reveal (iOS table view): arrasta uma linha pra revelar
// botões de ação atrás dela (favoritar, arquivar, marcar como lida...).
// Touch-only — no desktop os handlers nunca disparam (sem touch input), e
// quem usa o hook decide se quer desabilitar de vez fora do mobile.
//
// Uso:
//   const swipe = useSwipeReveal({
//     actionCount: 2,
//     isOpen: openId === item.id,
//     onOpenChange: (open) => setOpenId(open ? item.id : null),
//   })
//   <div style={{ transform: `translateX(${swipe.translateX}px)` }} {...swipe.handlers}>
//     <button onClick={swipe.guardClick(() => onSelectProcess(item.id))}>...</button>
//   </div>
//   <div className="row-actions">{actions revealed atrás, largura = actionCount * actionWidth}</div>
//
// "Só uma linha aberta por vez" é responsabilidade de quem chama: o estado
// `isOpen` vem de fora (ex.: um único `openId` na lista), então abrir uma
// linha nova fecha a anterior no próximo render — o hook não precisa saber
// da lista inteira.
export const SWIPE_ACTION_WIDTH = 76

export function useSwipeReveal({
  actionCount,
  actionWidth = SWIPE_ACTION_WIDTH,
  isOpen = false,
  onOpenChange,
  disabled = false,
} = {}) {
  const maxReveal = Math.max(0, actionCount) * actionWidth
  const restingX = isOpen ? -maxReveal : 0

  const gestureRef = useRef({ startX: 0, startY: 0, baseX: 0, dragging: false })
  const justDraggedRef = useRef(false)
  const [dragX, setDragX] = useState(null)

  const translateX = dragX !== null ? dragX : restingX

  const onTouchStart = useCallback(
    (event) => {
      if (disabled || maxReveal <= 0 || event.touches.length !== 1) return
      const touch = event.touches[0]
      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        baseX: restingX,
        dragging: false,
      }
    },
    [disabled, maxReveal, restingX]
  )

  const onTouchMove = useCallback(
    (event) => {
      if (disabled || maxReveal <= 0 || event.touches.length !== 1) return
      const gesture = gestureRef.current
      const touch = event.touches[0]
      const dx = touch.clientX - gesture.startX
      const dy = touch.clientY - gesture.startY

      if (!gesture.dragging) {
        // Só assume o gesto como swipe horizontal depois de um deslocamento
        // mínimo — evita hijack de scroll vertical (dy maior) e de toques.
        if (Math.abs(dx) < 10 || Math.abs(dy) > Math.abs(dx)) return
        gesture.dragging = true
        justDraggedRef.current = true
      }

      const next = Math.min(0, Math.max(-maxReveal, gesture.baseX + dx))
      setDragX(next)
    },
    [disabled, maxReveal]
  )

  const onTouchEnd = useCallback(() => {
    if (!gestureRef.current.dragging) {
      setDragX(null)
      return
    }
    const finalX = dragX ?? restingX
    const shouldOpen = maxReveal > 0 && finalX <= -maxReveal * 0.4
    setDragX(null)
    gestureRef.current.dragging = false
    onOpenChange?.(shouldOpen)
    // O click sintético do touchend chega logo em seguida — mantém a guarda
    // ligada até o próximo tick pra guardClick conseguir engolir esse clique.
    Promise.resolve().then(() => {
      justDraggedRef.current = false
    })
  }, [dragX, maxReveal, onOpenChange, restingX])

  // Envolve o onClick "normal" da linha: engole o clique se acabou de
  // arrastar, e se as ações já estão reveladas, o toque fecha em vez de
  // acionar o comportamento padrão (tocar fora fecha o tray, como no iOS).
  const guardClick = useCallback(
    (handler) => (event) => {
      if (justDraggedRef.current) {
        event.preventDefault()
        return
      }
      if (isOpen) {
        event.preventDefault()
        onOpenChange?.(false)
        return
      }
      handler?.(event)
    },
    [isOpen, onOpenChange]
  )

  return {
    translateX,
    isDragging: dragX !== null,
    maxReveal,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    guardClick,
  }
}
