// PageFade: fade-in wrapper para transicoes de pagina (Sprint 16.1).
// Usa useLocation.pathname como key, forca remount do wrapper a cada
// troca de rota. A classe .page-fade comeca invisivel e recebe
// .page-fade--visible no proximo frame, disparando o fade de 180ms.
//
// @vitest-environment jsdom

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

export default function PageFade({ children, className = '' }) {
  const location = useLocation()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(false)
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true)
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname])

  const combined = `page-fade${isVisible ? ' page-fade--visible' : ''}${
    className ? ` ${className}` : ''
  }`

  return (
    <div className={combined} data-page-fade={location.pathname}>
      {children}
    </div>
  )
}
