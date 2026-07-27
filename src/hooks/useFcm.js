// useFcm: hook que gerencia permissao + token de FCM (Sprint 22).
//
// API:
//   const { status, token, supported, enable, disable } = useFcm(uid)
//
// status: 'unsupported' | 'idle' | 'requesting' | 'granted' | 'denied' | 'error'
// supported: boolean (VAPID_KEY configurado + browser suporta)
// enable(): pede permissao, obtem token, registra listener de foreground.
//   Retorna { token, status } — 'status' distingue POR QUE deu null:
//   'denied'/'default' (usuario/navegador recusou a permissao) vs 'error'
//   (permissao concedida, mas getToken() falhou por motivo tecnico — VAPID
//   key invalida, service worker, API do FCM, etc). Antes retornava so' o
//   token, e qualquer falha virava a mesma mensagem "permissao nao
//   concedida" pro usuario — inclusive quando a permissao TINHA sido
//   concedida e o problema era outro. Ver NotificationPreferencesModal.
// disable(): revoga token
//
// F6 (backlog 2026-07-12): o token agora E' persistido em
// users/{uid}.fcmTokens[] no enable() (arrayUnion) e removido no
// disable() (arrayRemove) — e' dai que as Cloud Functions leem os
// destinos do push (sendPushToUsers).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isFcmSupported,
  requestNotificationPermission,
  getFcmToken,
  onFcmMessage,
  revokeFcmToken,
} from '../services/fcmService'
import { addFcmToken, removeFcmToken } from '../services/usersRepository'

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
      return { token: null, status: 'unsupported' }
    }
    setStatus('requesting')
    try {
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        setStatus(permission)
        writeStoredStatus(permission)
        return { token: null, status: permission }
      }
      const newToken = await getFcmToken()
      const resultStatus = newToken ? 'granted' : 'error'
      setToken(newToken)
      setStatus(resultStatus)
      writeStoredStatus(resultStatus)

      // Persiste o token no perfil — sem isso o backend nao tem pra onde
      // enviar o push. Falha aqui nao derruba o enable (in-app continua).
      if (newToken && uid) {
        try {
          await addFcmToken(uid, newToken)
        } catch (persistError) {
          console.error('Falha ao salvar token FCM no perfil.', persistError)
        }
      }

      // Listener de foreground
      if (unsubscribeRef.current) unsubscribeRef.current()
      unsubscribeRef.current = await onFcmMessage((payload) => {
        // Dispara evento customizado pro AppLayout recarregar notifications
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fcm:message', { detail: payload }))
        }
      })

      return { token: newToken, status: resultStatus }
    } catch (error) {
      console.error('Falha ao habilitar FCM.', error)
      setStatus('error')
      writeStoredStatus('error')
      return { token: null, status: 'error' }
    }
  }, [supported, uid])

  // Revoga token (e tira do perfil ANTES de revogar — depois de revogado
  // nao da mais pra descobrir qual era o token).
  const disable = useCallback(async () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    try {
      const currentToken = token ?? (await getFcmToken())
      if (currentToken && uid) {
        await removeFcmToken(uid, currentToken)
      }
    } catch (persistError) {
      console.error('Falha ao remover token FCM do perfil.', persistError)
    }
    const ok = await revokeFcmToken()
    setToken(null)
    setStatus('idle')
    writeStoredStatus('idle')
    return ok
  }, [token, uid])

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
