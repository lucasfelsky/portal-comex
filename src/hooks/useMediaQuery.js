import { useEffect, useState } from 'react'

// useMediaQuery(query): `true` enquanto `window.matchMedia(query)` casa.
// - estado inicial LAZY (le o matchMedia na primeira renderizacao): quem escolhe
//   uma arvore de JSX por breakpoint nao pisca a arvore errada no primeiro paint;
// - um listener `change` por montagem, removido no unmount;
// - sem `window.matchMedia` (SSR/testes sem polyfill) devolve `false`.
// Usado pelo Dashboard desktop (`(min-width: 1041px)`); as fases F4b+ reaproveitam.
function readMatches(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return Boolean(window.matchMedia(query)?.matches)
}

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => readMatches(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(query)
    const handler = (event) => setMatches(event.matches)
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [query])

  return matches
}
