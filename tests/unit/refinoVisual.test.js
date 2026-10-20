// Guardas estaticas do refino visual do desktop (PLAN.md "Refino visual").
// Le CSS/HTML/JSX/JSON como TEXTO (ambiente node), mesmo estilo de
// loginArt.test.js. Cada fase do refino ACRESCENTA um `describe` proprio;
// este arquivo nasce na F1 (tokens, fontes, marca e favicon).
//
// Fonte de verdade dos valores: mock-ups aprovados (Main.dc.html,
// Componentes.dc.html, Movimento.dc.html, Marca.dc.html, SQLogo.dc.html) —
// PLAN.md secao 2. Valores copiados exatamente, sem simplificar.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (rel) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

const css = read('src/styles.css')
const cssNoComments = stripComments(css)

// Corpo `{ ... }` que abre depois de `opener` (balanceando chaves).
function bodyAfter(source, opener) {
  const at = source.indexOf(opener)
  if (at < 0) return null
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return null
}

function tokens(body) {
  const out = {}
  for (const m of stripComments(body).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].replace(/\s+/g, ' ').trim()
  }
  return out
}

const light = tokens(bodyAfter(css, ':root {'))
const dark = tokens(bodyAfter(css, ":root[data-theme='dark'] {"))

// PLAN 2.1 - tokens claros (valor novo exato).
const LIGHT_EXPECTED = {
  '--bg': '#eef2f1',
  '--surface': '#ffffff',
  '--surface-alt': '#f5f8f7',
  '--ink': '#0b2430',
  '--ink-soft': '#4a6472',
  '--primary': '#14dda7',
  '--primary-700': '#007864',
  '--primary-50': '#e2f6f0',
  '--tint': '#e2f6f0',
  '--success-50': '#e2f6f0',
  '--on-primary': '#0b2430',
  '--on-button-primary': '#0b2430',
  '--on-warn': '#0b2430',
  '--button-primary-bg': '#14dda7',
  '--button-primary-bg-hover': '#2ee8b5',
  '--button-primary-bg-active': '#0fb98c',
  '--focus-ring': '#004153',
  '--link-color': '#007864',
  '--link-color-hover': '#00604f',
  '--danger': '#c2362b',
  '--danger-700': '#9a2a21',
  '--danger-50': '#fdecea',
  '--danger-bg-hover': '#a82d23',
  '--danger-bg-active': '#8f251d',
  '--warning': '#c98a12',
  '--warning-700': '#8a5a0a',
  '--warning-50': '#fdf3dc',
  '--info': '#1e6fb6',
  '--info-700': '#155793',
  '--info-50': '#e6f0fa',
  '--success-700': '#00604f',
  '--neutral-700': '#475861',
  '--neutral-50': '#eceff0',
  '--border': '#d5e2de',
  '--border-strong': '#b9cbc6',
  // D1 (decidido pelo Lucas): NAO usar o #9fb1b8 do mock (2,22:1, reprova 1.4.11).
  '--border-control': '#6b7f88',
  '--border-control-hover': '#4a6472',
  '--bg-tint-1': '#eef4f2',
  '--bg-tint-2': '#e8f0f2',
  '--sidebar-bg': 'linear-gradient(180deg, #003241, #004153)',
  '--sidebar-ink': '#ffffff',
  '--sidebar-ink-soft': '#b8ccd3',
  '--sidebar-pill-hover': 'rgba(255, 255, 255, 0.08)',
  '--sidebar-pill-active': 'rgba(20, 221, 167, 0.16)',
  '--sidebar-pill-active-ring': 'rgba(20, 221, 167, 0.35)',
  '--text-muted': 'rgba(11, 36, 48, 0.68)',
  '--text-subtle': 'rgba(11, 36, 48, 0.68)',
  '--text-faint': 'rgba(11, 36, 48, 0.68)',
  '--text-mute-strong': 'rgba(11, 36, 48, 0.72)',
  '--shadow': '0 2px 8px rgba(0, 65, 83, 0.06)',
  '--shadow-sm': '0 1px 2px rgba(0, 65, 83, 0.08)',
  '--shadow-md': '0 6px 18px rgba(0, 65, 83, 0.10)',
  '--shadow-lg': '0 20px 48px rgba(0, 65, 83, 0.18)',
  '--shadow-xl': '0 30px 70px rgba(0, 30, 40, 0.30)',
  '--font-heading': "'Sora', 'Manrope', system-ui, sans-serif",
  '--font-mono': "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
  '--navy-900': '#003241',
  '--navy': '#004153',
  '--navy-700': '#0a5468',
  '--navy-50': '#e8f0f2',
  '--navy-100': '#d6e3e7',
  '--channel-green-solid': '#14dda7',
  '--channel-green-edge': '#0fb98c',
  '--channel-green-soft': '#e2f6f0',
  '--channel-green-ink': '#00604f',
  '--channel-yellow-solid': '#f2c14e',
  '--channel-yellow-edge': '#c98a12',
  '--channel-yellow-soft': '#fdf3dc',
  '--channel-yellow-ink': '#8a5a0a',
  '--channel-red-solid': '#e5483c',
  '--channel-red-edge': '#c2362b',
  '--channel-red-soft': '#fdecea',
  '--channel-red-ink': '#9a2a21',
  '--channel-gray-solid': '#9aa9b0',
  '--channel-gray-edge': '#6b7f88',
  '--channel-gray-soft': '#eceff0',
  '--channel-gray-ink': '#475861',
  '--toast-bg': '#0b2430',
  '--toast-ink': '#e8f4f6',
  '--skeleton-base': '#e3ecea',
  '--skeleton-shine': '#f7faf9',
  '--disabled-bg': '#e3ecea',
  '--disabled-ink': '#6b7f88',
  '--mark-bg': '#b8f3e0',
  '--switch-off': '#c7d4d0',
  '--media-placeholder': '#dbe7ea',
  '--scrim': 'rgba(11, 36, 48, 0.42)',
  '--scrim-soft': 'rgba(11, 36, 48, 0.32)',
  '--row-divider': '#e3ecea',
  '--brand-mark-tile': '#004153',
  '--brand-mark-glyph': '#ffffff',
  '--brand-mark-dot': '#14dda7',
  '--brand-mark-tile-on-dark': 'rgba(255, 255, 255, 0.1)',
  '--sq-logo-ring': '#004153',
  '--sq-logo-ink': '#004153',
  '--sq-logo-ink-2': '#4a6472',
  '--sq-logo-green': '#14dda7',
  '--dur-fast': '120ms',
  '--dur-base': '200ms',
  '--dur-slow': '300ms',
  '--dur-page': '500ms',
  '--dur-fill': '600ms',
  '--ease-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
  '--ease-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--radius-xs': '8px',
  '--radius-sm': '12px',
  '--radius-md': '16px',
  '--radius-lg': '22px',
  '--radius-full': '999px',
  '--radius-field': '10px',
}

// PLAN 2.2 - tokens dark. Os do mock (Main.dc.html) e os propostos com
// contraste calculado (D17).
const DARK_EXPECTED = {
  '--bg': '#061a22',
  '--surface': '#0f2b35',
  '--surface-alt': '#163845',
  '--ink': '#e8f4f6',
  '--ink-soft': '#9fb6bf',
  '--primary': '#14dda7',
  '--border': 'rgba(74, 222, 200, 0.14)',
  '--primary-700': '#14dda7',
  '--primary-50': '#0f3b38',
  '--tint': '#0f3b38',
  '--success-50': '#0f3b38',
  '--link-color': '#14dda7',
  '--link-color-hover': '#7fe3cf',
  '--focus-ring': '#14dda7',
  '--eta-label-color': '#7fe3cf',
  '--border-strong': 'rgba(74, 222, 200, 0.24)',
  '--border-control': '#7a9aa6',
  '--border-control-hover': '#9fb6bf',
  '--danger': '#f07a70',
  '--danger-700': '#f59a92',
  '--danger-50': '#3a1f22',
  '--on-danger': '#1f0a0a',
  '--danger-bg-hover': '#f59a92',
  '--danger-bg-active': '#f8b0a9',
  '--warning': '#e0ad4d',
  '--warning-700': '#f2c46b',
  '--warning-50': '#33290f',
  '--info': '#5aa6e6',
  '--info-700': '#7cb8ec',
  '--info-50': '#132a3f',
  '--success-700': '#4fe0b8',
  '--neutral-700': '#9fb6bf',
  '--neutral-50': '#1b3a45',
  '--text-muted': 'rgba(232, 244, 246, 0.72)',
  '--text-subtle': 'rgba(232, 244, 246, 0.66)',
  '--text-faint': 'rgba(232, 244, 246, 0.62)',
  '--text-mute-strong': 'rgba(232, 244, 246, 0.82)',
  '--sidebar-bg': 'linear-gradient(180deg, #031820, #062833)',
  '--toast-bg': '#163845',
  '--toast-ink': '#e8f4f6',
  '--skeleton-base': '#163845',
  '--skeleton-shine': '#1d4250',
  '--disabled-bg': '#163845',
  '--disabled-ink': '#7a9aa6',
  '--mark-bg': '#0f5a49',
  '--switch-off': '#2b4f5c',
  '--media-placeholder': '#163845',
  '--scrim': 'rgba(0, 0, 0, 0.55)',
  '--navy-50': '#163845',
  '--navy-100': '#1d4250',
  '--brand-mark-tile': '#004153',
  '--sq-logo-ring': '#ffffff',
  '--sq-logo-ink': '#ffffff',
  '--sq-logo-ink-2': '#b8ccd3',
  '--channel-green-soft': '#0f3b38',
  '--channel-yellow-soft': '#33290f',
  '--channel-red-soft': '#3a1f22',
  '--channel-gray-soft': '#1b3a45',
  '--channel-green-ink': '#4fe0b8',
  '--channel-yellow-ink': '#f2c46b',
  '--channel-red-ink': '#f59a92',
  '--channel-gray-ink': '#9fb6bf',
}

// Tokens que o dark herda do claro por valor igual, mas o padrao do arquivo
// manda redeclarar ("Todos redeclarados, mesmo os de valor igual").
const REDECLARED_SAME = [
  '--button-primary-bg',
  '--button-primary-bg-hover',
  '--button-primary-bg-active',
  '--on-primary',
  '--on-button-primary',
  '--on-warn',
  '--font-heading',
  '--font-mono',
  '--dur-fast',
  '--dur-base',
  '--dur-slow',
  '--dur-page',
  '--dur-fill',
  '--ease-out',
  '--ease-in',
  '--ease-spring',
  '--radius-field',
  '--navy-900',
  '--navy',
  '--navy-700',
  '--channel-green-solid',
  '--channel-green-edge',
  '--channel-yellow-solid',
  '--channel-yellow-edge',
  '--channel-red-solid',
  '--channel-red-edge',
  '--channel-gray-solid',
  '--channel-gray-edge',
  '--brand-mark-glyph',
  '--brand-mark-dot',
  '--brand-mark-tile-on-dark',
  '--sq-logo-green',
  '--sidebar-ink',
  '--sidebar-ink-soft',
  '--sidebar-pill-hover',
  '--sidebar-pill-active',
  '--sidebar-pill-active-ring',
]

describe('F1 tokens', () => {
  it.each(Object.entries(LIGHT_EXPECTED))('claro %s = %s', (name, value) => {
    expect(light[name], name).toBe(value)
  })

  it.each(Object.entries(DARK_EXPECTED))('dark %s = %s', (name, value) => {
    expect(dark[name], name).toBe(value)
  })

  it('todo token novo ou alterado no claro tem contraparte no bloco dark', () => {
    const changedOrNew = Object.keys(LIGHT_EXPECTED).filter(
      (name) => !['--surface', '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-full'].includes(name)
    )
    const missing = changedOrNew.filter((name) => dark[name] === undefined)
    expect(missing).toEqual([])
  })

  it.each(REDECLARED_SAME)('dark redeclara %s com o mesmo valor do claro', (name) => {
    expect(dark[name], name).toBe(light[name])
  })

  it('dark redeclara --on-danger escuro (claro fica branco)', () => {
    expect(light['--on-danger']).toBe('#ffffff')
    expect(dark['--on-danger']).toBe('#1f0a0a')
  })

  it('tokens de movimento so usam transform/opacity como regra: duracoes e curvas do Movimento.dc.html', () => {
    expect(light['--dur-fast']).toBe('120ms')
    expect(light['--dur-page']).toBe('500ms')
    expect(light['--dur-fill']).toBe('600ms')
    expect(light['--ease-spring']).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)')
  })

  it('fonte de heading e Sora e nao existe mais Bricolage no CSS', () => {
    expect(light['--font-heading']).toMatch(/^'Sora'/)
    expect(/Bricolage/i.test(cssNoComments)).toBe(false)
  })

  it('nenhum hex/rgba da paleta antiga fora dos comentarios de src/styles.css', () => {
    const OLD = /#00ae91|#1f1c18|#dc2626|#0b2530|#123845|#e9eeec/i
    expect(OLD.test(cssNoComments)).toBe(false)
    expect(/rgba\(\s*(0,\s*174,\s*145|31,\s*28,\s*24|0,\s*40,\s*40)\b/.test(cssNoComments)).toBe(false)
  })

  it('texto branco sobre fundo menta virou --on-button-primary / --on-primary', () => {
    const cases = [
      ['.auth-toggle__item--active {', '--on-button-primary'],
      ['.tab-button--active {', '--on-button-primary'],
      ['.primary-button {', '--on-button-primary'],
      ['.primary-button:hover:not(:disabled) {', '--on-button-primary'],
      ['.admin-tabs .tab-button--active {', '--on-button-primary'],
      ['.scope-chip--active {', '--on-button-primary'],
      ['.notifications__show-more:hover {', '--on-button-primary'],
      ['.support-fab__trigger {', '--on-button-primary'],
      ['.menu-profile__avatar {', '--on-primary'],
      ['  .notifications-swipe-row__action {', '--on-button-primary'],
    ]
    for (const [opener, token] of cases) {
      // ancorado no inicio da linha: evita casar `.x .tab-button--active {` etc.
      const body = bodyAfter(css, `\n${opener}`)
      expect(body, opener).not.toBeNull()
      expect(body, opener).toContain(`var(${token})`)
      expect(body, opener).not.toMatch(/color:\s*(#fff|#ffffff|white)\s*;/i)
    }
  })

  it('toast e skeleton do dark usam os tokens novos', () => {
    const toast = bodyAfter(css, "[data-theme='dark'] .toast {")
    expect(toast).toContain('var(--toast-bg)')
    expect(toast).toContain('var(--toast-ink)')
    const skeleton = bodyAfter(css, "[data-theme='dark'] .skeleton {")
    expect(skeleton).toContain('var(--skeleton-base)')
    expect(skeleton).toContain('var(--skeleton-shine)')
  })
})

describe('F1 fontes, favicon e manifest', () => {
  const html = read('index.html')

  it('Google Fonts: Manrope, Sora, JetBrains Mono e Roboto (fallback mobile), sem Bricolage', () => {
    expect(html).toContain('family=Manrope:wght@400;500;600;700;800')
    expect(html).toContain('family=Sora:wght@300;400;600;700')
    expect(html).toContain('family=JetBrains+Mono:wght@500;600')
    expect(html).toContain('family=Roboto:wght@400;500;700')
    expect(html).toContain('display=swap')
    expect(/Bricolage/.test(html)).toBe(false)
  })

  it('favicon SVG + PNG de fallback e theme-color navy', () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    expect(html).toMatch(/<link rel="icon" type="image\/png"[^>]*href="\/icons\/icon-225\.png"/)
    expect(html).toContain('<meta name="theme-color" content="#004153" />')
  })

  it('public/favicon.svg e a marca COMEX tom claro (geometria da direcao A)', () => {
    const svg = read('public/favicon.svg')
    expect(svg).toContain('viewBox="0 0 48 48"')
    expect(svg).toContain('<rect width="48" height="48" rx="13" fill="#004153"/>')
    expect(svg).toContain('d="M31.78 16.22 A11 11 0 1 0 31.78 31.78"')
    expect(svg).toContain('stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"')
    expect(svg).toContain('<circle cx="35.2" cy="24" r="3.1" fill="#14dda7"/>')
  })

  it('icones PNG existem com as dimensoes declaradas no manifest', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'))
    for (const icon of manifest.icons) {
      const png = fs.readFileSync(path.resolve(ROOT, 'public', icon.src.replace(/^\//, '')))
      const [w, h] = icon.sizes.split('x').map(Number)
      // cabecalho PNG: assinatura (8) + IHDR (len 4 + tipo 4) -> largura/altura nos bytes 16..24
      expect(png.readUInt32BE(16)).toBe(w)
      expect(png.readUInt32BE(20)).toBe(h)
    }
  })

  it('manifest e useTheme alinhados (D15): claro #004153, dark #061a22, fundo #eef2f1', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'))
    expect(manifest.theme_color).toBe('#004153')
    expect(manifest.background_color).toBe('#eef2f1')
    const hook = read('src/hooks/useTheme.js')
    expect(hook).toContain("const THEME_COLOR = { light: '#004153', dark: '#061a22' }")
  })
})

describe('F1 marca (BrandMark.jsx)', () => {
  const src = read('src/components/BrandMark.jsx')
  const code = src.replace(/^\s*\/\/.*$/gm, '')

  it('exporta ProductMark e SqQuimicaLogo', () => {
    expect(src).toMatch(/export function ProductMark\(/)
    expect(src).toMatch(/export function SqQuimicaLogo\(/)
  })

  it('geometria COMEX e IQ exata do Marca.dc.html (direcao A)', () => {
    expect(src).toContain('viewBox="0 0 48 48"')
    expect(src).toContain('width="48" height="48" rx="13"')
    expect(src).toContain('d="M31.78 16.22 A11 11 0 1 0 31.78 31.78"')
    expect(src).toContain('cx="35.2" cy="24" r="3.1"')
    expect(src).toContain('cx="22.5"')
    expect(src).toContain('r="10"')
    expect(src).toContain('d="M29.8 29.8 L31.2 31.2"')
    expect(src).toContain('cx="35.4" cy="35.4" r="3.1"')
    expect(src).toContain('strokeWidth="4.5"')
  })

  it('SQ Quimica minusc: viewBox 100, anel, gargalo e balao do SQLogo.dc.html', () => {
    expect(src).toContain('viewBox="0 0 100 100"')
    expect(src).toContain('d="M64 19.5 A38 38 0 1 1 36 19.5"')
    expect(src).toContain('strokeWidth="8"')
    expect(src).toContain('d="M44 30.5 L56 23.5 L56 44 L44 44 Z"')
    expect(src).toContain('cx="50" cy="58.5" r="19.5"')
    expect(src).toContain('px(0.4)')
    expect(src).toContain('px(0.18)')
    expect(src).toContain('px(0.12)')
  })

  it('sem hex no JSX (cores so por tokens) e decorativo por padrao (sem <title>)', () => {
    expect(/#[0-9a-fA-F]{3,8}\b/.test(code)).toBe(false)
    expect(/<title/.test(code)).toBe(false)
    expect(code).toContain("'aria-hidden': 'true'")
    expect(code).toContain("role: 'img'")
  })

  it('classes de tom no CSS usam so tokens --brand-mark-* / --sq-logo-*', () => {
    for (const selector of [
      '.brand-mark__tile {',
      '.brand-mark__glyph {',
      '.brand-mark__dot {',
      '.brand-mark--dark .brand-mark__tile {',
      '.brand-mark--mono .brand-mark__tile {',
      '.brand-mark--mono .brand-mark__dot {',
      '.sq-logo__ring {',
      '.sq-logo__green {',
      '.sq-logo__sq {',
      '.sq-logo__chem {',
    ]) {
      const body = bodyAfter(css, selector)
      expect(body, selector).not.toBeNull()
      expect(body, selector).toMatch(/var\(--(brand-mark|sq-logo)-/)
      expect(/#[0-9a-fA-F]{3,8}\b/.test(body), selector).toBe(false)
    }
  })

  it('audit de componentes conhece BrandMark.jsx (25 componentes)', () => {
    const fixture = JSON.parse(read('tests/fixtures/expected-counts.json'))
    expect(fixture.srcComponents.topLevel).toBe(25)
    expect(fixture.srcComponents._topLevel_list).toContain('BrandMark.jsx')
  })
})
