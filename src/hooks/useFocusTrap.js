import { useEffect, useRef } from 'react'

export function useFocusTrap(isOpen, onClose, containerRef) {
  const lastFocusedRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    lastFocusedRef.current = document.activeElement

    function getFocusableElements() {
      if (!containerRef.current) return []
      return Array.from(
        containerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('aria-hidden'))
    }

    const initialFocus = window.setTimeout(() => {
      const focusables = getFocusableElements()
      if (focusables.length > 0) {
        focusables[0].focus()
      } else if (containerRef.current) {
        containerRef.current.focus()
      }
    }, 30)

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusables = getFocusableElements()
      if (focusables.length === 0) {
        event.preventDefault()
        containerRef.current?.focus()
        return
      }
      
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !containerRef.current?.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !containerRef.current?.contains(active)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(initialFocus)
      document.removeEventListener('keydown', handleKeyDown)

      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === 'function') {
        lastFocusedRef.current.focus()
      }
    }
  }, [isOpen, onClose, containerRef])
}
