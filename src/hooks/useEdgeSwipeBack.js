import { useEffect, useRef } from 'react'

// Voltar arrastando da BORDA ESQUERDA, acompanhando o dedo (detalhe empilhado do
// remake mobile, F5). Diferente do `useSwipe` (que so' age no touchend), aqui a
// camada do detalhe (`getTarget`) segue o dedo e a lista que fica atras
// (`getUnder`) interpola o recuo (-26% -> 0) e o brilho (.78 -> 1).
//
// Regras:
// - so' comeca se o toque nasce nos primeiros `edgeZone` px (28) E dentro da
//   camada do detalhe (galeria, modais e a tab bar ficam de fora);
// - so' "trava" como arrasto horizontal se |dx| > |dy| (rolagem vertical cancela
//   sem interferir) e so' para a direita;
// - ignora toques em campos de texto e em areas rolaveis na horizontal que ainda
//   podem rolar para a esquerda (chips das abas, carrosseis): ali o gesto e' do
//   componente;
// - solta com dx > `closeDistance` (110px) chama `onBack`; senao volta (anima de
//   volta pela CSS da lista e por uma transition inline na camada);
// - movimento reduzido: o gesto continua acompanhando o dedo, mas ao soltar nao
//   ha animacao de retorno (limpa na hora) e o fechamento e' imediato.
//
// Nada fica de transform/filter inline depois do gesto: `clear()` roda ao
// soltar (cancelamento), ao desabilitar e no unmount. No fechamento o inline da
// lista fica em "repouso" ate o pai desmontar a camada (evita 1 frame de salto).

export const EDGE_ZONE = 28
export const CLOSE_DISTANCE = 110
const LOCK_SLOP = 8
const SETTLE_MS = 320
const UNDER_REST_SHIFT = -26 // % do translateX da lista no repouso empilhado
const UNDER_REST_BRIGHTNESS = 0.78

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
}

function isTextField(node) {
  return Boolean(node?.closest?.('input, textarea, select, [contenteditable="true"]'))
}

// Algum ancestral (ate a camada) rola na horizontal e ainda tem para onde voltar?
function canScrollBack(node, boundary) {
  for (let current = node; current; current = current.parentElement) {
    if (current.scrollLeft > 0) {
      const overflowX = window.getComputedStyle(current).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    if (current === boundary) break
  }
  return false
}

export function useEdgeSwipeBack({
  enabled = true,
  getTarget,
  getUnder,
  onBack,
  edgeZone = EDGE_ZONE,
  closeDistance = CLOSE_DISTANCE,
} = {}) {
  // Callbacks por ref: o efeito nao reanexa listeners a cada render da pagina.
  const getTargetRef = useRef(getTarget)
  const getUnderRef = useRef(getUnder)
  const onBackRef = useRef(onBack)
  getTargetRef.current = getTarget
  getUnderRef.current = getUnder
  onBackRef.current = onBack

  useEffect(() => {
    if (!enabled) return undefined

    let gesture = null
    let settleTimer = 0

    const target = () => getTargetRef.current?.() ?? null
    const under = () => getUnderRef.current?.() ?? null

    function clear() {
      window.clearTimeout(settleTimer)
      settleTimer = 0
      const layer = target()
      if (layer) {
        layer.style.removeProperty('transform')
        layer.style.removeProperty('transition')
      }
      const behind = under()
      if (behind) {
        behind.style.removeProperty('transform')
        behind.style.removeProperty('filter')
        behind.style.removeProperty('transition')
      }
    }

    function applyProgress(dx, width) {
      const layer = target()
      const behind = under()
      const progress = Math.min(1, Math.max(0, dx / width))
      if (layer) layer.style.transform = `translateX(${dx}px)`
      if (behind) {
        behind.style.transform = `translateX(${UNDER_REST_SHIFT * (1 - progress)}%)`
        behind.style.filter = `brightness(${UNDER_REST_BRIGHTNESS + (1 - UNDER_REST_BRIGHTNESS) * progress})`
      }
    }

    function onTouchStart(event) {
      if (event.touches.length !== 1) {
        gesture = null
        return
      }
      const touch = event.touches[0]
      if (touch.clientX > edgeZone) return
      const layer = target()
      if (!layer || !layer.contains(event.target)) return
      if (isTextField(event.target) || canScrollBack(event.target, layer)) return
      if (settleTimer) clear()
      gesture = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        dx: 0,
        locked: false,
        width: layer.offsetWidth || window.innerWidth || 1,
      }
    }

    function findTouch(event) {
      if (!gesture) return null
      for (const touch of Array.from(event.touches)) {
        if (touch.identifier === gesture.id) return touch
      }
      return null
    }

    function onTouchMove(event) {
      if (!gesture) return
      const touch = findTouch(event)
      if (!touch) {
        gesture = null
        return
      }
      const dx = touch.clientX - gesture.startX
      const dy = touch.clientY - gesture.startY

      if (!gesture.locked) {
        // Rolagem vertical (ou arrasto para a esquerda): nao e' o gesto de voltar.
        if ((Math.abs(dy) > LOCK_SLOP && Math.abs(dy) > Math.abs(dx)) || dx < -LOCK_SLOP) {
          gesture = null
          return
        }
        if (!(dx > LOCK_SLOP && dx > Math.abs(dy))) return
        gesture.locked = true
        const layer = target()
        const behind = under()
        if (layer) layer.style.transition = 'none'
        if (behind) behind.style.transition = 'none'
      }

      if (event.cancelable) event.preventDefault()
      gesture.dx = Math.max(0, dx)
      applyProgress(gesture.dx, gesture.width)
    }

    function onTouchEnd(event) {
      if (!gesture) return
      // So' encerra quando o dedo do gesto saiu (nao quando um 2o dedo sai).
      const stillDown = Array.from(event.touches).some((touch) => touch.identifier === gesture.id)
      if (stillDown) return
      const finished = gesture
      gesture = null
      if (!finished.locked) return

      const reduced = prefersReducedMotion()
      if (finished.dx > closeDistance) {
        // A lista termina de voltar ao repouso (inline em repouso ate o pai
        // desmontar a camada); com movimento reduzido, sem transition.
        const behind = under()
        if (behind) {
          if (reduced) behind.style.transition = 'none'
          else behind.style.removeProperty('transition')
          behind.style.transform = 'translateX(0%)'
          behind.style.filter = 'brightness(1)'
        }
        const layer = target()
        if (layer && !reduced) layer.style.removeProperty('transition')
        onBackRef.current?.()
        return
      }

      // Cancelou: volta ao empilhado. Sem movimento reduzido, a camada anima o
      // retorno e a lista usa a transition da CSS ao perder o inline.
      if (reduced) {
        clear()
        return
      }
      const layer = target()
      const behind = under()
      if (layer) {
        layer.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
        layer.style.transform = 'translateX(0px)'
      }
      if (behind) {
        behind.style.removeProperty('transition')
        behind.style.removeProperty('transform')
        behind.style.removeProperty('filter')
      }
      settleTimer = window.setTimeout(clear, SETTLE_MS + 40)
    }

    function onTouchCancel() {
      if (!gesture) return
      const wasLocked = gesture.locked
      gesture = null
      if (wasLocked) clear()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchCancel, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
      gesture = null
      clear()
    }
  }, [enabled, edgeZone, closeDistance])
}
