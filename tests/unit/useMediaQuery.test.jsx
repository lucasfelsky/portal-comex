// useMediaQuery: estado inicial lazy, troca por evento `change` e limpeza no unmount.
import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useMediaQuery from '../../src/hooks/useMediaQuery'

const original = window.matchMedia

function installMatchMedia(initial) {
  const listeners = new Set()
  const calls = []
  const mql = {
    matches: initial,
    addEventListener: (type, fn) => type === 'change' && listeners.add(fn),
    removeEventListener: (type, fn) => type === 'change' && listeners.delete(fn),
  }
  window.matchMedia = (query) => {
    calls.push(query)
    return { ...mql, media: query, matches: mql.matches }
  }
  return {
    listeners,
    calls,
    fire(matches) {
      mql.matches = matches
      listeners.forEach((fn) => fn({ matches }))
    },
  }
}

afterEach(() => {
  window.matchMedia = original
})

describe('useMediaQuery', () => {
  it('estado inicial vem do matchMedia na 1a renderizacao (sem flash)', () => {
    installMatchMedia(true)
    const seen = []
    renderHook(() => {
      const value = useMediaQuery('(min-width: 1041px)')
      seen.push(value)
      return value
    })
    expect(seen[0]).toBe(true)
  })

  it('acompanha o evento change nos dois sentidos', () => {
    const media = installMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1041px)'))
    expect(result.current).toBe(false)
    act(() => media.fire(true))
    expect(result.current).toBe(true)
    act(() => media.fire(false))
    expect(result.current).toBe(false)
    expect(media.calls.every((query) => query === '(min-width: 1041px)')).toBe(true)
  })

  it('um listener por montagem e removido no unmount', () => {
    const media = installMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1041px)'))
    expect(media.listeners.size).toBe(1)
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('sem window.matchMedia devolve false e nao lanca', () => {
    window.matchMedia = undefined
    const { result } = renderHook(() => useMediaQuery('(min-width: 1041px)'))
    expect(result.current).toBe(false)
  })
})
