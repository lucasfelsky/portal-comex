import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'

// UX-3a (D1-D8): guarda de alteracoes nao salvas no criar/editar processo.
// Sem data router (o app usa <BrowserRouter>, useBlocker nao funciona fora
// de createBrowserRouter) - a guarda e um contexto proprio.
//
// API:
//   <UnsavedChangesProvider> ... </UnsavedChangesProvider>  (monta no App.jsx)
//   const { requestLeave } = useUnsavedChanges()
//   useUnsavedChangesGuard(isDirty)  // registra o dirty do form ativo
//
// D2: 1 listener de click em `document`, fase de CAPTURA, ativo so' quando
// ha' rascunho sujo. Intercepta <a href> interno (mesma origem, botao 0,
// sem ctrl/meta/shift/alt, sem target != _self, sem download) cujo
// pathname difere do location.pathname atual (useLocation, NAO
// window.location). Ao descartar, navega para o destino interceptado.
// D4: sem provider, requestLeave executa a acao na hora e o guard e' no-op.
// D8: beforeunload so' enquanto sujo.

const UnsavedChangesContext = createContext({
  requestLeave: (action) => action?.(),
  setDirty: () => {},
})

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext)
}

export function useUnsavedChangesGuard(isDirty) {
  const { setDirty } = useContext(UnsavedChangesContext)
  useEffect(() => {
    setDirty(isDirty)
    return () => setDirty(false)
  }, [isDirty, setDirty])
}

function isInternalLinkClick(event) {
  if (event.defaultPrevented) return null
  if (event.button !== 0) return null
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null

  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!anchor) return null
  if (anchor.hasAttribute('download')) return null

  const target = anchor.getAttribute('target')
  if (target && target !== '_self') return null

  let url
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin) return null

  return url
}

export function UnsavedChangesProvider({ children }) {
  const [isDirty, setIsDirty] = useState(false)
  const dirtyRef = useRef(false)
  const [pendingAction, setPendingAction] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const locationRef = useRef(location)

  useEffect(() => {
    locationRef.current = location
  }, [location])

  const setDirty = useCallback((value) => {
    dirtyRef.current = Boolean(value)
    setIsDirty(Boolean(value))
  }, [])

  const requestLeave = useCallback((action) => {
    if (!dirtyRef.current) {
      action?.()
      return
    }
    setPendingAction(() => action)
  }, [])

  useEffect(() => {
    if (!isDirty) return undefined

    function handleClick(event) {
      const url = isInternalLinkClick(event)
      if (!url) return
      if (url.pathname === locationRef.current.pathname) return

      event.preventDefault()
      setPendingAction(() => () => {
        navigate(`${url.pathname}${url.search}${url.hash}`)
      })
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [isDirty, navigate])

  useEffect(() => {
    if (!isDirty) return undefined

    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  function handleConfirmDiscard() {
    dirtyRef.current = false
    setIsDirty(false)
    const action = pendingAction
    setPendingAction(null)
    action?.()
  }

  function handleCancel() {
    setPendingAction(null)
  }

  const value = useMemo(() => ({ requestLeave, setDirty }), [requestLeave, setDirty])

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={pendingAction !== null}
        title="Descartar alterações?"
        message="As alterações feitas neste processo ainda não foram salvas e serão perdidas."
        confirmLabel="Descartar alterações"
        cancelLabel="Continuar editando"
        tone="danger"
        onConfirm={handleConfirmDiscard}
        onCancel={handleCancel}
      />
    </UnsavedChangesContext.Provider>
  )
}
