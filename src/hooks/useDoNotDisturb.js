// useDoNotDisturb: hook que gerencia estado de "Nao perturbe" persistido
// em localStorage (Sprint 20).
//
// API:
//   const { isActive, remainingMs, enableFor, disable } = useDoNotDisturb()
//   - isActive: boolean
//   - remainingMs: ms ate expirar (0 se nao ativo)
//   - enableFor(ms): ativa o DND por N ms (ex: 3600000 = 1h)
//   - disable(): desativa imediatamente
//
// Storage: localStorage key 'sq-comex:dnd' = JSON { expiresAt: ISOString }

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'sq-comex:dnd'

function readStoredExpiry() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const expiresAt = parsed?.expiresAt
    if (!expiresAt) return null
    const time = new Date(expiresAt).getTime()
    if (Number.isNaN(time) || time <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return time
  } catch {
    return null
  }
}

function writeStoredExpiry(time) {
  if (typeof window === 'undefined') return
  try {
    if (time) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ expiresAt: new Date(time).toISOString() })
      )
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // storage indisponivel (modo privado etc): ignora
  }
}

export function useDoNotDisturb() {
  const [expiresAt, setExpiresAt] = useState(() => readStoredExpiry())
  const [now, setNow] = useState(() => Date.now())

  // Tick 1x por minuto pra manter remainingMs atualizado
  useEffect(() => {
    if (!expiresAt) return undefined
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 30000)
    return () => window.clearInterval(intervalId)
  }, [expiresAt])

  // Limpa quando expira
  useEffect(() => {
    if (!expiresAt) return
    if (now >= expiresAt) {
      writeStoredExpiry(null)
      setExpiresAt(null)
    }
  }, [expiresAt, now])

  const enableFor = useCallback((durationMs) => {
    const newExpiry = Date.now() + durationMs
    writeStoredExpiry(newExpiry)
    setExpiresAt(newExpiry)
    setNow(Date.now())
  }, [])

  const disable = useCallback(() => {
    writeStoredExpiry(null)
    setExpiresAt(null)
  }, [])

  const isActive = Boolean(expiresAt) && expiresAt > now
  const remainingMs = isActive ? expiresAt - now : 0

  return { isActive, remainingMs, enableFor, disable }
}

export function formatRemaining(ms) {
  if (!ms || ms <= 0) return ''
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export default useDoNotDisturb
