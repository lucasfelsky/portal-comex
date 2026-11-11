// Hook da sidebar recolhivel (desktop): leitura/escrita segura do localStorage.
// Chave 'comex-sidebar-colapsada': '1' = recolhida; expandida = chave ausente.
// O storage bloqueado nunca lanca: o estado vale ate recarregar.
//
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useSidebarCollapsed, {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from '../../src/hooks/useSidebarCollapsed.js'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('SIDEBAR_COLLAPSED_STORAGE_KEY', () => {
  it('usa a chave comex-sidebar-colapsada', () => {
    expect(SIDEBAR_COLLAPSED_STORAGE_KEY).toBe('comex-sidebar-colapsada')
  })
})

describe('readSidebarCollapsed', () => {
  it('sem item: expandida (false)', () => {
    expect(readSidebarCollapsed()).toBe(false)
  })

  it("'1': recolhida (true)", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, '1')
    expect(readSidebarCollapsed()).toBe(true)
  })

  it.each(['true', '0', '', 'sim'])('valor %j: expandida (so "1" recolhe)', (value) => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value)
    expect(readSidebarCollapsed()).toBe(false)
  })

  it('getItem lancando: expandida, sem lancar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    expect(readSidebarCollapsed()).toBe(false)
  })
})

describe('writeSidebarCollapsed', () => {
  it('write(true) grava "1"', () => {
    writeSidebarCollapsed(true)
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('1')
  })

  it('write(false) remove a chave', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, '1')
    writeSidebarCollapsed(false)
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBeNull()
  })

  it('setItem lancando: nao lanca', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota excedida')
    })
    expect(() => writeSidebarCollapsed(true)).not.toThrow()
  })

  it('removeItem lancando: nao lanca', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    expect(() => writeSidebarCollapsed(false)).not.toThrow()
  })
})

describe('useSidebarCollapsed', () => {
  it('comeca expandido sem storage', () => {
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(false)
  })

  it('comeca recolhido com "1" no storage', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, '1')
    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(true)
  })

  it('toggle alterna e persiste', () => {
    const { result } = renderHook(() => useSidebarCollapsed())

    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('1')

    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBeNull()
  })

  it('toggle com storage bloqueado alterna o estado sem lancar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })

    const { result } = renderHook(() => useSidebarCollapsed())
    expect(result.current.collapsed).toBe(false)

    expect(() => act(() => result.current.toggle())).not.toThrow()
    expect(result.current.collapsed).toBe(true)

    expect(() => act(() => result.current.toggle())).not.toThrow()
    expect(result.current.collapsed).toBe(false)
  })
})
