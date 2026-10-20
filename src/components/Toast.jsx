import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// Toast container (Sprint 8).
// API:
//   const toast = useToast()
//   toast.success('Salvo com sucesso')
//   toast.error('Falha ao salvar')
//   toast.info('Verifique o email')
//   toast.warning('Sessao expirando')
//
// Auto-dismiss padrao em 5s (Movimento.dc.html), pausado enquanto o mouse (ou o
// foco) esta sobre o toast; erro nao fecha sozinho. Empilha ate 5 toasts
// visiveis (FIFO).

const TOAST_TIMEOUT_MS = 5000
const TOAST_MAX_VISIBLE = 5
// Saida de 200 ms (ease-in); o timer cobre a animacao de saida do CSS.
const TOAST_EXIT_MS = 200

const ToastContext = createContext(null)

let toastIdCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Timers pendentes (auto-dismiss e animacao de saida). Cancelados no unmount
  // do provider: sem isso o setToasts dispara depois do teardown (no Vitest,
  // "window is not defined" apos o cleanup do jsdom).
  const timersRef = useRef(new Set())

  // Auto-dismiss por toast: { timerId, remaining, startedAt }. Pausar guarda o
  // tempo que falta; retomar reagenda so o restante.
  const autoDismissRef = useRef(new Map())

  const schedule = useCallback((fn, ms) => {
    const timerId = setTimeout(() => {
      timersRef.current.delete(timerId)
      fn()
    }, ms)
    timersRef.current.add(timerId)
    return timerId
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    const autoDismiss = autoDismissRef.current
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId))
      timers.clear()
      autoDismiss.clear()
    }
  }, [])

  const dismiss = useCallback((id) => {
    const entry = autoDismissRef.current.get(id)
    if (entry) {
      if (entry.timerId !== null) {
        clearTimeout(entry.timerId)
        timersRef.current.delete(entry.timerId)
      }
      autoDismissRef.current.delete(id)
    }
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, closing: true } : toast)))
    schedule(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, TOAST_EXIT_MS)
  }, [schedule])

  const startAutoDismiss = useCallback(
    (id, ms) => {
      const entry = { timerId: null, remaining: ms, startedAt: Date.now() }
      entry.timerId = schedule(() => dismiss(id), ms)
      autoDismissRef.current.set(id, entry)
    },
    [dismiss, schedule]
  )

  // Mouse/foco em cima: congela o relogio do auto-dismiss.
  const pauseAutoDismiss = useCallback((id) => {
    const entry = autoDismissRef.current.get(id)
    if (!entry || entry.timerId === null) return
    clearTimeout(entry.timerId)
    timersRef.current.delete(entry.timerId)
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt))
    entry.timerId = null
  }, [])

  const resumeAutoDismiss = useCallback(
    (id) => {
      const entry = autoDismissRef.current.get(id)
      if (!entry || entry.timerId !== null) return
      entry.startedAt = Date.now()
      entry.timerId = schedule(() => dismiss(id), entry.remaining)
    },
    [dismiss, schedule]
  )

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

      if (TOAST_TIMEOUT_MS > 0 && tone !== 'error') {
        startAutoDismiss(id, TOAST_TIMEOUT_MS)
      }
    },
    [startAutoDismiss]
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
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        onPause={pauseAutoDismiss}
        onResume={resumeAutoDismiss}
      />
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

function ToastViewport({ toasts, onDismiss, onPause, onResume }) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="region" aria-label="Notificações">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onPause={onPause}
          onResume={onResume}
        />
      ))}
    </div>
  )
}

// Circulo de icone do tom (so aparece no desktop; o CSS esconde no mobile).
// Glifos do Componentes.dc.html: check (sucesso) e "!" / "i" no mesmo traco.
const TOAST_GLYPHS = {
  success: <path d="m5 12 5 5 9-10" />,
  error: <path d="M12 6.5v6.5M12 17.5h.01" />,
  warning: <path d="M12 6.5v6.5M12 17.5h.01" />,
  info: <path d="M12 10.5v7M12 6.5h.01" />,
}

function ToastItem({ toast, onDismiss, onPause, onResume }) {
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
      className={`toast toast--${toast.tone}${toast.closing ? ' toast--closing' : ''}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => onPause(toast.id)}
      onMouseLeave={() => onResume(toast.id)}
      onFocus={() => onPause(toast.id)}
      onBlur={() => onResume(toast.id)}
    >
      <span className="toast__icon" aria-hidden="true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          {TOAST_GLYPHS[toast.tone] ?? TOAST_GLYPHS.info}
        </svg>
      </span>
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
