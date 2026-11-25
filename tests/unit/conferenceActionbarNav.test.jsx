// Conferência no celular: a barra de ações (.ccf-actionbar, por portal) fica IMEDIATAMENTE ACIMA da navegação inferior
// (.mobile-bottom-nav), sem sobreposição; a navegação fica sempre na base. Trava as regras de CSS (a medição real em
// 320/360/390/430 px e em paisagem foi feita no navegador): variáveis compartilhadas, `bottom`, z-index, padding do
// conteúdo e a posição do toast; e o JS que liga a classe só quando a navegação existe (<= 720 px).
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../src/hooks/useAuth', () => ({ default: () => ({ profile: { role: 'logistica', name: 'Op' } }) }))

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
const mobile = readFileSync(resolve(process.cwd(), 'src/mobile-redesign.css'), 'utf8')
const start = styles.indexOf('CONFERENCIA NO CELULAR - BARRA DE ACOES ACIMA DA NAVEGACAO INFERIOR')
const block = start > 0 ? styles.slice(start) : ''

function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

describe('CSS: barra de ações acima da navegação inferior', () => {
  it('o bloco existe, sem @media e sem cor literal', () => {
    expect(start).toBeGreaterThan(0)
    expect(block).not.toMatch(/@media/)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/ghost-button/)
  })

  it('a altura e a folga da navegação são variáveis em :root, usadas pela pilula e pela barra (sem número duplicado)', () => {
    const root = rule(block, ':root')
    expect(root).toContain('--m-tabbar-height: 68px')
    expect(root).toContain('--m-tabbar-gap: 14px')
    expect(root).toContain('--ccf-actionbar-height: 72px')
    // A pilula (mobile-redesign.css) usa as mesmas variáveis.
    const pill = rule(mobile, ':root .mobile-bottom-nav')
    expect(pill).toContain('height: var(--m-tabbar-height, 68px)')
    expect(pill).toContain('bottom: calc(var(--m-tabbar-gap, 14px) + env(safe-area-inset-bottom, 0px))')
  })

  it('`.ccf-actionbar--above-nav`: bottom = folga + altura da navegação + folga + safe-area; z-index abaixo da navegação', () => {
    const bar = rule(block, '.ccf-actionbar--above-nav')
    expect(bar).toMatch(
      /bottom: calc\( ?var\(--m-tabbar-gap\) \+ var\(--m-tabbar-height\) \+ var\(--ccf-actionbar-gap\) \+ env\(safe-area-inset-bottom, 0px\) ?\)/
    )
    expect(bar).toContain('z-index: 27')
    expect(bar).toContain('min-height: var(--ccf-actionbar-height)')
    // A navegação (z-index 28 em styles.css) fica por cima se algo se tocar.
    expect(styles).toMatch(/\.mobile-bottom-nav \{\s*position: fixed;[^}]*z-index: 28;/)
    // Sem a classe (paisagem, tablet), a barra base cola na base (bottom: 0).
    expect(rule(styles, '.ccf-actionbar')).toContain('bottom: 0')
  })

  it('o conteúdo reserva só a barra de ações (a navegação já é reservada pelo .main-content: 104px + safe-area)', () => {
    expect(rule(block, '.ccf-page--detail.ccf-page--nav')).toContain(
      'padding-bottom: calc(var(--ccf-actionbar-height) + var(--ccf-actionbar-gap))'
    )
    expect(mobile).toMatch(/\.main-content \{\s*padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\);/)
  })

  it('o toast sobe para acima da barra de ações e da navegação', () => {
    const toast = rule(block, 'body:has(.ccf-actionbar--above-nav) .toast-container')
    expect(toast).toContain('var(--m-tabbar-height)')
    expect(toast).toContain('var(--ccf-actionbar-height)')
    expect(toast).toContain('env(safe-area-inset-bottom, 0px)')
  })
})

describe('JS: a classe --above-nav só existe quando a navegação existe (<= 720 px)', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.resetModules()
  })

  function stubViewport(widthPx) {
    window.matchMedia = (query) => {
      const max = /max-width:\s*(\d+)px/.exec(query)
      return {
        matches: Boolean(max) && Number(max[1]) >= widthPx,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }
    }
  }

  async function renderBar(widthPx) {
    stubViewport(widthPx)
    vi.doMock('../../src/services/cargoReportRepository', () => ({
      getCargoReport: async () => ({ current: null, conference: null }),
      saveCargoReportConference: vi.fn(),
      reopenCargoReportConference: vi.fn(),
    }))
    const { ToastProvider } = await import('../../src/components/Toast')
    const { default: CargoConferenceScreen } = await import('../../src/features/processes/CargoConferenceScreen')
    render(
      <ToastProvider>
        <CargoConferenceScreen
          process={{ id: 'p1', name: 'P', category: 'FCL' }}
          profile={{ role: 'logistica', name: 'Op' }}
          canSeeName
          onBack={() => {}}
        />
      </ToastProvider>
    )
    return screen.findByRole('group', { name: 'Ações da conferência' })
  }

  it('celular (390 px): a barra leva ccf-actionbar--above-nav', async () => {
    const bar = await renderBar(390)
    expect(bar).toHaveClass('ccf-actionbar', 'ccf-actionbar--above-nav')
  })

  it('paisagem/tablet (844 px): sem a classe (não há navegação de baixo)', async () => {
    const bar = await renderBar(844)
    expect(bar).toHaveClass('ccf-actionbar')
    expect(bar).not.toHaveClass('ccf-actionbar--above-nav')
  })
})
