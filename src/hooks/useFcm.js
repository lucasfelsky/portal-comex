// useFcm: hook que gerencia permissao + token de FCM (Sprint 22).
//
// API:
//   const { status, token, supported, enable, disable } = useFcm(uid)
//
// status: 'unsupported' | 'idle' | 'requesting' | 'granted' | 'denied' | 'error'
// supported: boolean (VAPID_KEY configurado + browser suporta)
// enable(): pede permissao, obtem token, registra listener de foreground
// disable(): revoga token
//
// O token NAO e persistido em user profile neste hook (futuro backend
// Cloud Function podera salvar em users/{uid}.fcmTokens[]). Aqui
// retornamos o token pra que o chamador decida o que fazer.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isFcmSupported,
  requestNotificationPermission,
  getFcmToken,
  onFcmMessage,
  revokeFcmToken,
} from '../services/fcmService'

const STORAGE_KEY = 'sq-comex:fcm-status'

function readStoredStatus() {
  if (typeof window === 'undefined') return 'idle'
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? 'idle'
  } catch {
    return 'idle'
  }
}

function writeStoredStatus(value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

export function useFcm(uid) {
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState(readStoredStatus)
  const [token, setToken] = useState(null)
  const unsubscribeRef = useRef(null)

  // Detecta suporte
  useEffect(() => {
    let cancelled = false
    isFcmSupported().then((result) => {
      if (!cancelled) setSupported(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Pede permissao e registra token
  const enable = useCallback(async () => {
    if (!supported) {
      setStatus('unsupported')
      return null
    }
    setStatus('requesting')
    try {
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        setStatus(permission)
        writeStoredStatus(permission)
        return null
      }
      const newToken = await getFcmToken()
      setToken(newToken)
      setStatus(newToken ? 'granted' : 'error')
      writeStoredStatus(newToken ? 'granted' : 'error')

      // Listener de foreground
      if (unsubscribeRef.current) unsubscribeRef.current()
      unsubscribeRef.current = onFcmMessage((payload) => {
        // Dispara evento customizado pro AppLayout recarregar notifications
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fcm:message', { detail: payload }))
        }
      })

      return newToken
    } catch (error) {
      console.error('Falha ao habilitar FCM.', error)
      setStatus('error')
      writeStoredStatus('error')
      return null
    }
  }, [supported])

  // Revoga token
  const disable = useCallback(async () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    const ok = await revokeFcmToken()
    setToken(null)
    setStatus('idle')
    writeStoredStatus('idle')
    return ok
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current()
    }
  }, [])

  // Sincroniza status com permissao do browser
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'denied' && status !== 'denied') {
      setStatus('denied')
      writeStoredStatus('denied')
    }
  }, [status])

  return { supported, status, token, uid, enable, disable }
}

export default useFcm
