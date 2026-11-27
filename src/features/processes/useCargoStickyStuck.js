import { useEffect, useState } from 'react'

// Conferência por item: devolve `stuck` (a barra sticky está encostada no topo e a lista rolou), para ligar a linha e a
// sombra finas embaixo dela (`ccf-searchwrap--stuck`). A área que rola depende da largura: no celular (<= 1040 px) é a
// PÁGINA (o `.main-content` fica com overflow visível); acima disso é o `.main-content`. O hook acha o ancestral que
// rola, ouve `scroll` (passivo, com requestAnimationFrame) e desliga tudo ao desmontar. Padrão `isMounted`/cleanup.

const SCROLLING_OVERFLOW = new Set(['auto', 'scroll', 'overlay'])

// Ancestral que rola (overflow-y auto/scroll/overlay); sem ele, a página (`document.scrollingElement`).
export function findCargoScroller(element) {
  for (let node = element?.parentElement; node && node !== document.body; node = node.parentElement) {
    if (SCROLLING_OVERFLOW.has(window.getComputedStyle(node).overflowY)) return node
  }
  return document.scrollingElement ?? document.documentElement
}

function isPageScroller(scroller) {
  return scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body
}

export function readCargoScrollTop(element) {
  return findCargoScroller(element).scrollTop
}

export function writeCargoScrollTop(element, value) {
  findCargoScroller(element).scrollTop = value
}

// `ref`: a barra sticky. `stuck` = rolou (scrollTop > 0) e o topo da barra está na posição fixa (tolerância de 0,5 px).
export default function useCargoStickyStuck(ref) {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    let isMounted = true
    let frame = 0
    const scroller = findCargoScroller(element)
    const target = isPageScroller(scroller) ? window : scroller

    function measure() {
      frame = 0
      if (!isMounted) return
      const fixedTop = Number.parseFloat(window.getComputedStyle(element).top) || 0
      const base = isPageScroller(scroller) ? 0 : scroller.getBoundingClientRect().top
      const next = scroller.scrollTop > 0 && element.getBoundingClientRect().top <= base + fixedTop + 0.5
      setStuck((current) => (current === next ? current : next))
    }

    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }

    target.addEventListener('scroll', onScroll, { passive: true })
    measure()
    return () => {
      isMounted = false
      target.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ref])

  return stuck
}
