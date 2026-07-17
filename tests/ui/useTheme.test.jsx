// C17 (toggle de tema): hook useTheme — preferencia 'auto'/'light'/'dark',
// persistencia em localStorage ('pc-theme') e estampa do tema EFETIVO em
// <html data-theme="...">. Em 'auto' segue o sistema (matchMedia) e reage
// a mudancas ao vivo; 'light'/'dark' forcam (e ignoram o sistema).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme, getStoredThemePreference } from '../../src/hooks/useTheme'

function mockMatchMedia({ dark = false } = {}) {
  const listeners = new Set()
  const mql = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql)
  return {
    mql,
    setSystemDark(value) {
      mql.matches = value
      listeners.forEach((fn) => fn({ matches: value }))
    },
    listeners,
  }
}

describe('useTheme (C17 — toggle claro/escuro/auto)', () => {
  let media

  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    media = mockMatchMedia({ dark: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('default: auto + sistema claro -> data-theme=light', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('auto')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('auto + sistema escuro -> data-theme=dark', () => {
    media = mockMatchMedia({ dark: true })
    renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('setPreference(dark) forca escuro e persiste em pc-theme', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('pc-theme')).toBe('dark')
  })

  it('setPreference(light) vence sistema escuro', () => {
    media = mockMatchMedia({ dark: true })
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('light'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('pc-theme')).toBe('light')
  })

  it('voltar pra auto remove a chave persistida', () => {
    window.localStorage.setItem('pc-theme', 'dark')
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('auto'))
    expect(window.localStorage.getItem('pc-theme')).toBeNull()
    expect(document.documentElement.dataset.theme).toBe('light') // sistema claro
  })

  it('inicializa da preferencia salva (dark)', () => {
    window.localStorage.setItem('pc-theme', 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('ciclo do botao: auto -> dark -> light -> auto', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('auto')
    act(() => result.current.cyclePreference())
    expect(result.current.preference).toBe('dark')
    act(() => result.current.cyclePreference())
    expect(result.current.preference).toBe('light')
    act(() => result.current.cyclePreference())
    expect(result.current.preference).toBe('auto')
  })

  it('em auto, mudanca do sistema atualiza o tema ao vivo', () => {
    renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => media.setSystemDark(true))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('em dark forcado, NAO escuta o sistema (sem listener)', () => {
    window.localStorage.setItem('pc-theme', 'dark')
    renderHook(() => useTheme())
    expect(media.listeners.size).toBe(0)
  })

  it('getStoredThemePreference: valores invalidos viram auto', () => {
    window.localStorage.setItem('pc-theme', 'banana')
    expect(getStoredThemePreference()).toBe('auto')
  })

  it('atualiza <meta name="theme-color"> junto com o tema', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#00ae91')
    document.head.appendChild(meta)

    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('dark'))
    expect(meta.getAttribute('content')).toBe('#0e1413')
    act(() => result.current.setPreference('light'))
    expect(meta.getAttribute('content')).toBe('#00ae91')

    meta.remove()
  })
})
