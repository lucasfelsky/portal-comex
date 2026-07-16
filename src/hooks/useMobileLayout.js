import { useEffect, useState } from 'react'

// Layout mobile do Portal COMEX = <=720px (mesmo breakpoint onde o topbar
// some e a bottom-nav aparece; ver styles.css). Hook compartilhado pra
// componentes que precisam decidir comportamento por viewport em JS
// (ex.: SelectField abre um ActionSheet só no mobile).
export function useMobileLayout() {
  const [isMobileLayout, setIsMobileLayout] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(max-width: 720px)')
    setIsMobileLayout(mq.matches)
    const handler = (event) => setIsMobileLayout(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobileLayout
}
