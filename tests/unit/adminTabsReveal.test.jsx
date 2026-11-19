// Robustez das abas admin: com o nav rolavel (1041-1279px) a aba ativa nao pode ficar
// cortada. O AdminLayout rola o PROPRIO nav (scrollLeft) ate ela. jsdom nao tem layout
// real, entao getBoundingClientRect/scrollLeft/scrollTo/matchMedia sao mockados.
// Fica em tests/unit para nao entrar na contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

import AdminLayout from '../../src/pages/AdminLayout'

const ZERO = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }
const rect = (left, right) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40 })

let navRect
let tabRect
let scrollLeftValue
let scrollLeftWrites
let scrollToMock
let reducedMotion
const originals = {}

function installLayoutMocks() {
  originals.rect = Element.prototype.getBoundingClientRect
  originals.scrollLeft = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')
  originals.scrollTo = Element.prototype.scrollTo
  originals.matchMedia = window.matchMedia

  Element.prototype.getBoundingClientRect = function mockedRect() {
    if (this.classList?.contains('admin-tabs--desktop')) return navRect
    if (this.classList?.contains('tab-button--active')) return tabRect
    return ZERO
  }
  Object.defineProperty(Element.prototype, 'scrollLeft', {
    configurable: true,
    get() {
      return this.classList?.contains('admin-tabs--desktop') ? scrollLeftValue : 0
    },
    set(value) {
      if (this.classList?.contains('admin-tabs--desktop')) {
        scrollLeftValue = value
        scrollLeftWrites.push(value)
      }
    },
  })
  Element.prototype.scrollTo = scrollToMock
  window.matchMedia = vi.fn((query) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

function restoreLayoutMocks() {
  Element.prototype.getBoundingClientRect = originals.rect
  if (originals.scrollLeft) Object.defineProperty(Element.prototype, 'scrollLeft', originals.scrollLeft)
  else delete Element.prototype.scrollLeft
  if (originals.scrollTo) Element.prototype.scrollTo = originals.scrollTo
  else delete Element.prototype.scrollTo
  window.matchMedia = originals.matchMedia
}

function renderAt(path = '/admin/suporte') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          {['usuarios', 'comunicados', 'barra', 'previsoes', 'lead-time', 'suporte'].map((slug) => (
            <Route key={slug} path={slug} element={<div>{slug}</div>} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  navRect = rect(100, 600)
  tabRect = rect(150, 300)
  scrollLeftValue = 0
  scrollLeftWrites = []
  scrollToMock = vi.fn()
  reducedMotion = false
  installLayoutMocks()
})

afterEach(() => {
  restoreLayoutMocks()
})

describe('AdminLayout - aba ativa sempre visivel no nav rolavel', () => {
  it('rola para a direita quando a aba ativa esta cortada na borda direita', () => {
    tabRect = rect(550, 700)
    scrollLeftValue = 50
    renderAt()
    // 50 + (700 - 600) + folga de 8
    expect(scrollLeftValue).toBe(158)
    expect(scrollToMock).not.toHaveBeenCalled()
  })

  it('rola para a esquerda quando a aba ativa esta cortada na borda esquerda', () => {
    tabRect = rect(20, 120)
    scrollLeftValue = 300
    renderAt('/admin/usuarios')
    // 300 + (20 - 100) - folga de 8
    expect(scrollLeftValue).toBe(212)
  })

  it('nao rola abaixo de zero', () => {
    tabRect = rect(95, 200)
    scrollLeftValue = 3
    renderAt('/admin/usuarios')
    expect(scrollLeftValue).toBe(0)
  })

  it('nao mexe no scroll quando a aba ativa ja esta inteira visivel', () => {
    scrollLeftValue = 42
    renderAt()
    expect(scrollLeftWrites).toEqual([])
    expect(scrollLeftValue).toBe(42)
    expect(scrollToMock).not.toHaveBeenCalled()
  })

  it('tolera subpixel: aba a 0,5px da borda conta como visivel', () => {
    tabRect = rect(450, 600.5)
    renderAt()
    expect(scrollLeftWrites).toEqual([])
  })

  it('e no-op sem geometria real (jsdom: retangulos zerados)', () => {
    navRect = ZERO
    tabRect = ZERO
    renderAt()
    expect(scrollLeftWrites).toEqual([])
    expect(scrollToMock).not.toHaveBeenCalled()
  })

  it('e no-op quando a geometria vem com NaN', () => {
    navRect = rect(Number.NaN, 600)
    tabRect = rect(550, 700)
    renderAt()
    expect(scrollLeftWrites).toEqual([])
    expect(scrollToMock).not.toHaveBeenCalled()
  })

  it('na troca de aba rola suave; com prefers-reduced-motion rola instantaneo', async () => {
    const user = userEvent.setup()
    const { getByRole, unmount } = renderAt('/admin/usuarios')
    tabRect = rect(550, 700)
    await user.click(getByRole('link', { name: /Suporte/ }))
    expect(scrollToMock).toHaveBeenCalledTimes(1)
    expect(scrollToMock).toHaveBeenCalledWith({ left: 108, behavior: 'smooth' })
    unmount()

    scrollToMock.mockClear()
    scrollLeftValue = 0
    scrollLeftWrites = []
    reducedMotion = true
    tabRect = rect(150, 300)
    const second = renderAt('/admin/usuarios')
    tabRect = rect(550, 700)
    await user.click(second.getByRole('link', { name: /Suporte/ }))
    expect(scrollToMock).not.toHaveBeenCalled()
    expect(scrollLeftValue).toBe(108)
  })

  it('no mount e instantaneo mesmo sem reduced-motion (sem animacao ao abrir a tela)', () => {
    tabRect = rect(550, 700)
    renderAt()
    expect(scrollToMock).not.toHaveBeenCalled()
    expect(scrollLeftWrites).toEqual([108])
  })
})
