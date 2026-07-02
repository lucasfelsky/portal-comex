// useHasNavigationHistory: retorna true se ha historico de navegacao
// interno (Sprint 31). Usado pelo botao Voltar do topbar.
//
// Comportamento:
//   - false no carregamento inicial
//   - vira true apos o usuario navegar para outra rota dentro do app
//   - vira true apos Ctrl+K (navigate programatico)
//   - false se o usuario voltar ao root e tentar voltar de novo
//   - usa sessionStorage pra resetar a cada sessao

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEY = 'sq-comex:nav-history'

function readStored() {
  if (typeof window === 'undefined') return 0
  try {
    return Number.parseInt(window.sessionStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0
  } catch {
    return 0
  }
}

function writeStored(value) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // ignore
  }
}

export function useHasNavigationHistory() {
  const location = useLocation()
  const [count, setCount] = useState(readStored)

  useEffect(() => {
    // Cada mudanca de location incrementa o contador (uma vez por render).
    // O botao Voltar fica visivel quando count > 1 (alem do root).
    setCount((current) => {
      const next = current + 1
      writeStored(next)
      return next
    })
  }, [location.pathname])

  return count > 1
}

export default useHasNavigationHistory
