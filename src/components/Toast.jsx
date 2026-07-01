import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Toast container (Sprint 8).
// API:
//   const toast = useToast()
//   toast.success('Salvo com sucesso')
//   toast.error('Falha ao salvar')
//   toast.info('Verifique o email')
//   toast.warning('Sessao expirando')
//
// Auto-dismiss padrao em 4s. Empilha ate 5 toasts visiveis (FIFO).

const TOAST_TIMEOUT_MS = 4000
const TOAST_MAX_VISIBLE = 5

const ToastContext = createContext(null)

let toastIdCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (tone, message) => {
      const id = `toast-${++toastIdCounter}`
      setToasts((current) => {
        const next = [...current, { id, tone, message }]
        // FIFO: descarta os mais antigos se passar do limite
        return next.length > TOAST_MAX_VISIBLE
          ? next.slice(next.length - TOAST_MAX_VISIBLE)
          : next
      })

      if (TOAST_TIMEOUT_MS > 0) {
        setTimeout(() => dismiss(id), TOAST_TIMEOUT_MS)
      }
    },
    [dismiss]
  )

  const api = useMemo(
    () => ({
      success: (msg) => push('success', msg),
      error: (msg) => push('error', msg),
      info: (msg) => push('info', msg),
      warning: (msg) => push('warning', msg),
      dismiss,
    }),
    [push, dismiss]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast precisa de <ToastProvider> na arvore.')
  }
  return ctx
}

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="region" aria-label="Notificacoes">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }) {
  // Listener de Esc para fechar (acessibilidade)
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onDismiss(toast.id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss, toast.id])

  return (
    <div
      className={`toast toast--${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="toast__message">{toast.message}</span>
      <button
        type="button"
        className="toast__close"
        aria-label="Fechar"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}
