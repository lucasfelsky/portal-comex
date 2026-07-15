import { useEffect, useRef } from 'react'

// C15 (auditoria mobile): detecta swipe horizontal numa zona da tela.
// Retorna nada — chama onSwipeRight/onSwipeLeft quando o gesto termina.
//
// Uso no AppLayout:
//   useSwipe({ onSwipeRight: () => setIsMobileMenuOpen(true) })
//
// O hook registra touchstart/touchend no document (so' ativa quando
// enabled=true). Threshold de 60px evita falsos positivos em scroll
// vertical. So' ativa em touch (touchstart.type === 'touchstart').
//
// `edgeZone` (default 30px) limita de onde o swipe-right pode comecar
// (borda esquerda da tela) — imita o gesto "back" do iOS que so' funciona
// arrastando da beirada.

const DEFAULT_THRESHOLD = 60
const DEFAULT_EDGE_ZONE = 30

export function useSwipe({
  onSwipeRight,
  onSwipeLeft,
  enabled = true,
  threshold = DEFAULT_THRESHOLD,
  edgeZone = DEFAULT_EDGE_ZONE,
} = {}) {
  const startRef = useRef({ x: 0, y: 0, time: 0 })

  useEffect(() => {
    if (!enabled) return undefined

    function onTouchStart(event) {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      startRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
    }

    function onTouchEnd(event) {
      if (event.changedTouches.length !== 1) return
      const touch = event.changedTouches[0]
      const start = startRef.current
      const dx = touch.clientX - start.x
      const dy = Math.abs(touch.clientY - start.y)
      const dt = Date.now() - start.time

      if (dt > 800) return
      if (dy > Math.abs(dx)) return
      if (Math.abs(dx) < threshold) return

      if (dx > 0 && start.x < edgeZone) {
        onSwipeRight?.()
      } else if (dx < 0) {
        onSwipeLeft?.()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [enabled, onSwipeRight, onSwipeLeft, threshold, edgeZone])
}