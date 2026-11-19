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

describe('AdminLayout - ResizeObserver', () => {
  const instances = []
  let rafQueue
  let rafSeq
  let cancelRaf
  const orig = {}

  class FakeResizeObserver {
    constructor(cb) {
      this.cb = cb
      this.observe = vi.fn()
      this.disconnect = vi.fn()
      instances.push(this)
    }
  }

  function flushRaf() {
    const pending = rafQueue
    rafQueue = []
    pending.forEach(({ cb }) => cb(0))
  }

  const sizeOf = (width, height = 40) => ({ width, height })
  const fire = (observer, entries) =>
    observer.cb(entries.map(({ target, ...size }) => ({ target, contentRect: size })), observer)

  function setup() {
    const view = renderAt()
    const observer = instances[instances.length - 1]
    const nav = view.container.querySelector('.admin-tabs--desktop')
    return { ...view, observer, nav }
  }

  beforeEach(() => {
    instances.length = 0
    rafQueue = []
    rafSeq = 0
    cancelRaf = vi.fn((id) => {
      rafQueue = rafQueue.filter((item) => item.id !== id)
    })
    orig.ro = globalThis.ResizeObserver
    orig.raf = window.requestAnimationFrame
    orig.caf = window.cancelAnimationFrame
    globalThis.ResizeObserver = FakeResizeObserver
    window.ResizeObserver = FakeResizeObserver
    window.requestAnimationFrame = vi.fn((cb) => {
      rafSeq += 1
      rafQueue.push({ id: rafSeq, cb })
      return rafSeq
    })
    window.cancelAnimationFrame = cancelRaf
  })

  afterEach(() => {
    globalThis.ResizeObserver = orig.ro
    window.ResizeObserver = orig.ro
    window.requestAnimationFrame = orig.raf
    window.cancelAnimationFrame = orig.caf
  })

  it('observa o nav e as 6 abas', () => {
    const { observer, nav } = setup()
    expect(instances).toHaveLength(1)
    const targets = observer.observe.mock.calls.map(([el]) => el)
    expect(targets).toHaveLength(7)
    expect(targets[0]).toBe(nav)
    expect(targets.slice(1).every((el) => el.classList.contains('admin-tab'))).toBe(true)
    expect(nav.querySelectorAll('.admin-tab')).toHaveLength(6)
  })

  it('a primeira notificacao so registra o tamanho base: sem rAF e sem escrita', () => {
    tabRect = rect(550, 700)
    scrollLeftValue = 50
    const { observer, nav } = setup()
    scrollLeftWrites.length = 0
    fire(observer, [{ target: nav, ...sizeOf(500) }])
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    expect(rafQueue).toHaveLength(0)
    expect(scrollLeftWrites).toEqual([])
  })

  it('mudanca de tamanho do nav revela a aba ativa no proximo frame, sem animar', () => {
    const { observer, nav } = setup()
    fire(observer, [{ target: nav, ...sizeOf(500) }])
    tabRect = rect(550, 700)
    scrollLeftValue = 50
    scrollLeftWrites.length = 0
    fire(observer, [{ target: nav, ...sizeOf(400) }])
    expect(scrollLeftWrites).toEqual([])
    expect(rafQueue).toHaveLength(1)
    flushRaf()
    // 50 + (700 - 600) + folga de 8
    expect(scrollLeftValue).toBe(158)
    expect(scrollToMock).not.toHaveBeenCalled()
  })

  it('debounce: varias notificacoes antes do frame geram 1 rAF e 1 escrita', () => {
    const { observer, nav } = setup()
    const tab = nav.querySelector('.admin-tab')
    fire(observer, [{ target: nav, ...sizeOf(500) }, { target: tab, ...sizeOf(150) }])
    tabRect = rect(550, 700)
    scrollLeftValue = 50
    scrollLeftWrites.length = 0
    fire(observer, [{ target: nav, ...sizeOf(480) }])
    fire(observer, [{ target: tab, ...sizeOf(160) }])
    fire(observer, [{ target: nav, ...sizeOf(450) }])
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    flushRaf()
    expect(scrollLeftWrites).toEqual([158])
  })

  it('tamanho igual ao ultimo registrado nao agenda rAF (protege a rolagem manual)', () => {
    const { observer, nav } = setup()
    fire(observer, [{ target: nav, ...sizeOf(500) }])
    tabRect = rect(550, 700)
    fire(observer, [{ target: nav, ...sizeOf(500) }])
    fire(observer, [{ target: nav, ...sizeOf(500) }])
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    expect(scrollLeftWrites).toEqual([])
  })

  it('unmount desconecta, cancela o rAF pendente e nada escreve depois', () => {
    const { observer, nav, unmount } = setup()
    fire(observer, [{ target: nav, ...sizeOf(500) }])
    tabRect = rect(550, 700)
    scrollLeftWrites.length = 0
    fire(observer, [{ target: nav, ...sizeOf(400) }])
    expect(rafQueue).toHaveLength(1)
    const pendingId = rafQueue[0].id
    unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    expect(cancelRaf).toHaveBeenCalledWith(pendingId)
    flushRaf()
    expect(scrollLeftWrites).toEqual([])
  })

  it('sem ResizeObserver renderiza normalmente, revela no mount e nao agenda rAF', () => {
    globalThis.ResizeObserver = undefined
    window.ResizeObserver = undefined
    tabRect = rect(550, 700)
    expect(() => renderAt()).not.toThrow()
    expect(instances).toHaveLength(0)
    expect(scrollLeftWrites).toEqual([108])
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('notificacao sem mudanca de tamanho em varias abas nao dispara revelacao', () => {
    const { observer, nav } = setup()
    const tabs = nav.querySelectorAll('.admin-tab')
    fire(observer, [
      { target: nav, ...sizeOf(500) },
      { target: tabs[0], ...sizeOf(100) },
      { target: tabs[1], ...sizeOf(100) },
    ])
    fire(observer, [
      { target: tabs[0], ...sizeOf(100) },
      { target: tabs[1], ...sizeOf(100) },
    ])
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })
})
