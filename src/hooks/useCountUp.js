import { useEffect, useRef, useState } from 'react'

// Contador de KPI (Movimento.dc.html, "Contador de KPI"): 600 ms, ease-out
// cubico (1 - (1 - t)^3), de 0 ate o valor. Regras do mock:
//   - 1x por sessao: a primeira carga anima; o flag fica em
//     sessionStorage['pc-kpi-countup'] e as cargas seguintes mostram o valor
//     direto. O flag so e gravado quando a animacao termina (ou quando o
//     componente sai de cena no meio dela), entao os 4 KPIs que montam juntos
//     animam juntos.
//   - atualizacao ao vivo troca o numero sem animar: so o PRIMEIRO valor
//     numerico que a instancia recebe pode animar.
//   - movimento reduzido: sem contador (mostra o valor).
// So valores numericos (inteiros >= 1) animam; qualquer outro valor (texto,
// "—", skeleton) passa direto.

export const KPI_COUNT_UP_SESSION_KEY = 'pc-kpi-countup'
export const KPI_COUNT_UP_DURATION_MS = 600

function readSessionFlag() {
  try {
    return window.sessionStorage.getItem(KPI_COUNT_UP_SESSION_KEY) === '1'
  } catch {
    return true
  }
}

function writeSessionFlag() {
  try {
    window.sessionStorage.setItem(KPI_COUNT_UP_SESSION_KEY, '1')
  } catch {
    /* sessionStorage indisponivel: sem flag, anima de novo na proxima carga */
  }
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
}

function canAnimate(target) {
  if (typeof window === 'undefined') return false
  if (!Number.isFinite(target) || target < 1) return false
  if (prefersReducedMotion()) return false
  return !readSessionFlag()
}

// 1 - (1 - t)^3
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

export default function useCountUp(value, { durationMs = KPI_COUNT_UP_DURATION_MS } = {}) {
  const isNumeric = typeof value === 'number' && Number.isFinite(value)
  // Decisao unica por instancia, tomada no primeiro valor numerico recebido.
  const decidedRef = useRef(false)
  const animateRef = useRef(false)
  if (isNumeric && !decidedRef.current) {
    decidedRef.current = true
    animateRef.current = canAnimate(value)
  }

  const [frameValue, setFrameValue] = useState(0)
  const [finished, setFinished] = useState(false)
  const shouldRun = isNumeric && animateRef.current && !finished

  useEffect(() => {
    if (!shouldRun) return undefined
    const target = value
    const startedAt = performance.now()
    let frameId = 0
    let completed = false

    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / durationMs)
      setFrameValue(Math.round(target * easeOutCubic(t)))
      if (t >= 1) {
        completed = true
        writeSessionFlag()
        setFinished(true)
        return
      }
      frameId = window.requestAnimationFrame(tick)
    }
    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
      // Saiu no meio da animacao: conta como "ja animou nesta sessao".
      if (!completed) writeSessionFlag()
    }
  }, [shouldRun, durationMs, value])

  if (!isNumeric) return value
  return shouldRun ? frameValue : value
}
