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
import zlib from 'node:zlib'
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
      ['  .process-swipe-row__action--restore {', '--on-button-primary'],
      [".ios-row__icon[style*='--primary'] {", '--on-primary'],
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

  // Varredura: regra com fundo menta (--primary / --button-primary-bg*) que
  // declara `color` explicito nunca usa branco (1,76:1 sobre #14dda7).
  it('nenhuma regra com fundo menta declara color branco', () => {
    const offenders = []
    for (const m of cssNoComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2]
      const mint = /background(-color)?:[^;]*(var\(--primary\)|var\(--button-primary-bg(-hover|-active)?\))/.test(body)
      const white = /(^|[;\s])color:\s*(#fff|#ffffff|white)\s*;/i.test(body)
      if (mint && white) offenders.push(m[1].trim().split('\n').pop())
    }
    expect(offenders).toEqual([])
  })

  it('eyebrow fora da sidebar nao usa --primary (menta) como texto', () => {
    for (const m of cssNoComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1].split(',').map((s) => s.trim().split('\n').pop().trim())
      for (const selector of selectors) {
        if (!/\.brand__eyebrow\b/.test(selector) || /\.sidebar\b/.test(selector)) continue
        expect(m[2], selector).not.toMatch(/(^|[;\s])color:\s*var\(--primary\)\s*;/)
      }
    }
    expect(bodyAfter(css, '\n.brand__eyebrow {')).toContain('var(--primary-700)')
  })

  it('aviso da barra no dashboard usa --warning-700 como texto (nao --warning)', () => {
    expect(bodyAfter(css, '\n.dashboard-bar-card__text--warn {')).toContain('var(--warning-700)')
  })

  it('logo SQ tom dark usa tokens (sem hex)', () => {
    const body = bodyAfter(css, '\n.sq-logo--dark {')
    expect(body).toContain('var(--sidebar-ink)')
    expect(body).toContain('var(--sidebar-ink-soft)')
    expect(/#[0-9a-fA-F]{3,8}\b/.test(body)).toBe(false)
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

  // apple-touch-icon / maskable: PNG full-bleed opaco (cantos transparentes
  // viram preto no iOS). favicon.svg segue com cantos arredondados.
  it('icones PNG sao opacos: cantos e centro com alpha 255', () => {
    for (const name of ['icon-225.png', 'icon-512.png']) {
      const png = fs.readFileSync(path.resolve(ROOT, 'public/icons', name))
      const width = png.readUInt32BE(16)
      const height = png.readUInt32BE(20)
      const colorType = png[25]
      expect(png[24], 'bit depth').toBe(8)
      const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
      expect(channels, `color type ${colorType}`).toBeGreaterThan(0)
      let offset = 8
      const idat = []
      while (offset < png.length) {
        const length = png.readUInt32BE(offset)
        const type = png.toString('ascii', offset + 4, offset + 8)
        if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length))
        offset += 12 + length
      }
      const raw = zlib.inflateSync(Buffer.concat(idat))
      const stride = width * channels
      const rows = []
      for (let y = 0; y < height; y += 1) {
        const filter = raw[y * (stride + 1)]
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
        const prev = y > 0 ? rows[y - 1] : Buffer.alloc(stride)
        for (let x = 0; x < stride; x += 1) {
          const a = x >= channels ? line[x - channels] : 0
          const b = prev[x]
          const c = x >= channels ? prev[x - channels] : 0
          let add = 0
          if (filter === 1) add = a
          else if (filter === 2) add = b
          else if (filter === 3) add = Math.floor((a + b) / 2)
          else if (filter === 4) {
            const p = a + b - c
            const pa = Math.abs(p - a)
            const pb = Math.abs(p - b)
            const pc = Math.abs(p - c)
            add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          }
          line[x] = (line[x] + add) & 255
        }
        rows.push(line)
      }
      const pixel = (x, y) => Array.from(rows[y].subarray(x * channels, x * channels + channels))
      for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
        const p = pixel(x, y)
        expect(p.slice(0, 3), `${name} canto ${x},${y}`).toEqual([0, 65, 83]) // --navy #004153
        if (channels === 4) expect(p[3]).toBe(255)
      }
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

  // Rodada F1: o seletor `.ios-row__icon[style*='--primary']` (cor do icone
  // sobre fundo menta) so casa enquanto o MenuPage declarar o fundo inline
  // com var(--primary). Se alguem migrar o inline para classe/outro token, a
  // regra deixaria de casar em silencio (icone navy -> branco sobre menta).
  it("MenuPage mantem o fundo inline var(--primary) no icone admin (casa .ios-row__icon[style*='--primary'])", () => {
    expect(cssNoComments).toContain(".ios-row__icon[style*='--primary']")
    const menu = read('src/pages/MenuPage.jsx')
    expect(menu).toMatch(
      /className="ios-row__icon"\s+style=\{\{\s*background:\s*'var\(--primary\)'\s*\}\}[\s\S]{0,80}name="admin"/,
    )
  })
})

// ---------------------------------------------------------------------------
// F2 - shell (sidebar, topbar, abas do admin, gaveta, paleta, suporte).
// Valores copiados de Sidebar/Topbar/AdminTabs/Flutuantes.dc.html. O CSS novo
// fica numa secao delimitada de src/styles.css; aqui se confere cada valor do
// mock e o escopo por classe raiz (vazamento por classe compartilhada ja
// quebrou 3x).
// ---------------------------------------------------------------------------
const F2_START = 'REFINO VISUAL F2 — SHELL DO DESKTOP'
const F2_END = 'F16.1 — Fundações do redesign iOS'
const f2Start = css.indexOf(F2_START)
const f2End = css.indexOf(F2_END)
// A secao comeca/termina DENTRO de comentarios de cabecalho: recua ate o "/*"
// que os abre para o stripComments remove-los por inteiro.
const f2Css = stripComments(css.slice(css.lastIndexOf('/*', f2Start), css.lastIndexOf('/*', f2End)))
const f2MediaStart = f2Css.indexOf('@media (min-width: 1041px) {')
const f2Desktop = f2Css.slice(f2MediaStart)

const norm = (s) => s.replace(/\s+/g, ' ').trim()

function parseRules(source) {
  const out = []
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({
      selectors: m[1].split(',').map((x) => norm(x)),
      body: norm(m[2]),
    })
  }
  return out
}

const f2Rules = parseRules(f2Desktop)

// Todos os trechos de declaracao dos blocos cujo seletor-lista inclui `selector`.
function declsOf(selector) {
  const bodies = f2Rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F2: ${selector}`).toBeGreaterThan(0)
  return bodies.join(' ')
}

function expectDecls(selector, declarations) {
  const body = declsOf(selector)
  for (const declaration of declarations) {
    expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
  }
}

describe('F2 shell - CSS do mock', () => {
  it('a secao F2 existe, vem antes do bloco reduce desktop e so tem 1 media desktop de shell', () => {
    expect(f2Start).toBeGreaterThan(0)
    expect(f2End).toBeGreaterThan(f2Start)
    expect(f2MediaStart).toBeGreaterThan(0)
    expect(f2Start).toBeLessThan(css.lastIndexOf('@media (min-width: 1041px) and (prefers-reduced-motion: reduce)'))
  })

  it('sidebar: 256px, padding 24/16/20, gap 28, gradiente navy, anel de foco verde', () => {
    expectDecls('.sidebar', [
      '--focus-ring: var(--primary)',
      'width: 256px',
      'gap: 28px',
      'padding: 24px 16px 20px',
    ])
    expectDecls('.sidebar', ['background: var(--sidebar-bg)'])
    expectDecls('.main-content', ['margin-left: 256px', 'width: calc(100% - 256px)'])
  })

  it('marca da sidebar: ladrilho 40 + "Portal COMEX" Sora 19/700 -0.01em, gap 12, padding 0 6px', () => {
    expectDecls('.sidebar .brand', ['gap: 12px', 'padding: 0 6px'])
    expectDecls('.sidebar .brand h1', [
      'font-family: var(--font-heading)',
      'font-size: 19px',
      'font-weight: 700',
      'letter-spacing: -0.01em',
    ])
    // PNG da SQ e eyebrow so no drawer do tablet.
    expectDecls('.sidebar .sidebar__logo', ['display: none'])
    expectDecls('.sidebar .brand__eyebrow', ['display: none'])
  })

  it('navegacao: 44px, raio 12, gap 12, 14px/600 repouso, hover 200ms, ativo = pilula + anel', () => {
    expectDecls('.sidebar .nav__link', [
      'height: 44px',
      'padding: 0 14px',
      'gap: 12px',
      'border-radius: 12px',
      'color: var(--sidebar-ink-soft)',
      'font-size: 14px',
      'font-weight: 600',
    ])
    const nav = declsOf('.sidebar .nav__link')
    expect(nav).toContain('background-color var(--dur-base) var(--ease-out)')
    expectDecls('.sidebar .nav__link:hover', ['background: var(--sidebar-pill-hover)', 'color: var(--sidebar-ink)'])
    expectDecls('.sidebar .nav__link--active', [
      'background: var(--sidebar-pill-active)',
      'box-shadow: inset 0 0 0 1px var(--sidebar-pill-active-ring)',
      'color: var(--sidebar-ink)',
      'font-weight: 700',
    ])
    expectDecls('.sidebar .nav__link--active .nav__link-icon', ['color: var(--primary)'])
    expectDecls('.sidebar .nav__link-text p', ['display: none'])
    expect(declsOf('.sidebar .nav__link:focus-visible')).toContain(
      'box-shadow: 0 0 0 2px var(--navy), 0 0 0 4px var(--focus-ring)',
    )
  })

  it('rodape: card IntelliQuote (raio 16, padding 12, .06/.10) e botoes Tema/Sair de 40px 13/600', () => {
    expectDecls('.sidebar .sidebar-intelliquote-link', [
      'padding: 12px',
      'gap: 12px',
      'border-radius: 16px',
      'background: rgba(255, 255, 255, 0.06)',
      'border: 1px solid rgba(255, 255, 255, 0.1)',
      'margin-bottom: 8px',
    ])
    expectDecls('.sidebar .sidebar-intelliquote-link__title', ['font-size: 14px', 'font-weight: 700'])
    expectDecls('.sidebar .sidebar-intelliquote-link__eyebrow', [
      'font-size: 12px',
      'color: var(--sidebar-ink-soft)',
      'text-transform: none',
    ])
    expectDecls('.sidebar .sidebar__foot', ['gap: 6px'])
    expectDecls('.sidebar .sidebar__foot .sidebar-theme-button', [
      'height: 40px',
      'padding: 0 14px',
      'border-radius: 12px',
      'font-size: 13px',
      'font-weight: 600',
      'color: var(--sidebar-ink-soft)',
    ])
  })

  it('topbar: sticky, min-height 76, gap 10/14, padding 14 + clamp, fundo --bg, borda inferior', () => {
    expectDecls('.topbar', [
      'position: sticky',
      'min-height: 76px',
      'flex-wrap: wrap',
      'gap: 10px 14px',
      'padding: 14px var(--shell-pad-x)',
      'background: var(--bg)',
      'border-bottom: 1px solid var(--border)',
    ])
    expectDecls('.main-content', ['--shell-pad-x: clamp(16px, 3vw, 40px)', 'grid-auto-rows: max-content'])
    expectDecls('.topbar__actions', ['display: contents'])
    expectDecls('.topbar .topbar__title', [
      'font-family: var(--font-heading)',
      'font-size: 20px',
      'font-weight: 700',
      'letter-spacing: -0.01em',
    ])
    expectDecls('.topbar .breadcrumb__current', ['font-size: 12px', 'font-weight: 600', 'color: var(--ink-soft)'])
    expectDecls('.topbar-theme-button', ['display: none'])
  })

  it('busca Ctrl K, PTAX, sino e usuario: 44px, raio 12, medidas do mock', () => {
    expectDecls('.topbar .topbar__search', [
      'height: 44px',
      'min-width: 180px',
      'padding: 0 8px 0 14px',
      'flex: 0 1 300px',
      'border-radius: 12px',
    ])
    expectDecls('.topbar .topbar__search-kbd', [
      'font-family: var(--font-mono)',
      'font-size: 11px',
      'padding: 3px 7px',
      'border-radius: 6px',
    ])
    expectDecls('.topbar .topbar__ptax', [
      'height: 44px',
      'padding: 0 14px',
      'gap: 12px',
      'font-family: var(--font-mono)',
      'font-size: 12px',
      'font-variant-numeric: tabular-nums',
    ])
    expectDecls('.topbar .topbar__ptax-sep', ['width: 1px', 'height: 18px'])
    expectDecls('.topbar .notifications__trigger', ['width: 44px', 'height: 44px', 'border-radius: 12px'])
    expectDecls('.topbar .notifications__count', [
      'top: -5px',
      'right: -5px',
      'min-width: 20px',
      'height: 20px',
      'padding: 0 5px',
      'background: var(--primary)',
      'color: var(--on-primary)',
      'font-family: var(--font-mono)',
      'font-size: 11px',
      'font-weight: 700',
      'box-shadow: 0 0 0 2px var(--bg)',
    ])
    expectDecls('.topbar .topbar__user', ['height: 44px', 'padding: 0 12px 0 6px', 'border-radius: 12px', 'gap: 10px'])
    expectDecls('.topbar .topbar__avatar', ['width: 32px', 'height: 32px', 'border-radius: 10px', 'background: var(--navy)'])
    expectDecls('.topbar .topbar__user-info .topbar__role-badge', [
      'font-size: 11px',
      'font-weight: 600',
      'color: var(--primary-700)',
    ])
  })

  it('abas do admin: grid auto-fit 150px, gap 8, aba 12/14 raio 14, ativa navy + sombra', () => {
    expectDecls('.admin-section .admin-tabs.admin-tabs--desktop', [
      'grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))',
      'gap: 8px',
    ])
    expectDecls('.admin-section .admin-tabs .tab-button.admin-tab', [
      'padding: 12px 14px',
      'border-radius: 14px',
      'gap: 4px',
      'font-family: inherit',
    ])
    expectDecls('.admin-section .admin-tabs .tab-button.admin-tab.tab-button--active', [
      'border-color: var(--navy)',
      'background: var(--surface)',
      'box-shadow: var(--shadow-sm)',
    ])
    expectDecls('.admin-tab__label', ['font-size: 14px', 'font-weight: 700', 'gap: 8px'])
    expectDecls('.admin-tab__dot', ['width: 6px', 'height: 6px'])
    expectDecls('.admin-tab.tab-button--active .admin-tab__dot', ['background: var(--primary)'])
    expectDecls('.admin-tab__desc', ['font-size: 12px', 'line-height: 1.35', 'color: var(--ink-soft)'])
  })

  it('gaveta: 420px, raio 22, --shadow-lg, entra 300ms ease-out e sai 210ms ease-in (transform so)', () => {
    expectDecls('.notifications__panel.notifications__panel--drawer', [
      'width: min(420px, calc(100vw - 32px))',
      'border-radius: 22px',
      'box-shadow: var(--shadow-lg)',
      'animation: notif-drawer-in var(--dur-slow) var(--ease-out) forwards',
    ])
    expectDecls('.notifications__panel.notifications__panel--drawer.notifications__panel--closing', [
      'animation: notif-drawer-out 210ms var(--ease-in) forwards',
    ])
    expectDecls('.notifications-backdrop', ['background: var(--scrim-soft)'])
    for (const name of ['notif-drawer-in', 'notif-drawer-out']) {
      const frames = bodyAfter(f2Css, `@keyframes ${name}`)
      expect(frames, name).toContain('transform: translateX')
      expect(frames, name).not.toMatch(/(width|height|left|top|margin)/)
    }
    // 210ms (saida) <= timer do JS (220ms): o painel nunca desmonta antes de sair.
    const layout = read('src/components/AppLayout.jsx')
    expect(layout).toContain('const NOTIFICATION_PANEL_ANIMATION_MS = 220')
  })

  it('gaveta: cabecalho, pilulas 32px raio 99, item grid 36/1fr/10 com ladrilho 36 raio 10', () => {
    expectDecls('.notif-drawer__title', ['font-family: var(--font-heading)', 'font-size: 18px', 'font-weight: 700'])
    expectDecls('.notif-drawer__sub', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectDecls('.notif-drawer__close', ['width: 44px', 'height: 44px', 'background: var(--surface-alt)'])
    expectDecls('.notif-drawer__filters', ['flex-wrap: nowrap', 'overflow-x: auto'])
    expectDecls('.notif-drawer__pill', ['height: 32px', 'padding: 0 12px', 'border-radius: 99px', 'font-size: 12px', 'font-weight: 600'])
    expectDecls('.notif-drawer__pill--active', ['background: var(--navy)'])
    expectDecls('.notif-row', ['grid-template-columns: 36px minmax(0, 1fr) 10px', 'gap: 12px', 'padding: 12px 8px', 'border-radius: 12px'])
    expectDecls('.notif-row--unread', ['background: var(--surface-alt)'])
    expectDecls('.notif-row__icon', ['width: 36px', 'height: 36px', 'border-radius: 10px'])
    expectDecls('.notif-row__title', ['font-size: 13px', 'font-weight: 700'])
    expectDecls('.notif-row__text', ['font-size: 12px', 'line-height: 1.45'])
    expectDecls('.notif-row__time', ['font-size: 11px'])
    expectDecls('.notif-row__dot', ['width: 8px', 'height: 8px'])
    expectDecls('.notif-row--unread .notif-row__dot', ['background: var(--primary)'])
    // tons por tipo = soft + ink dos tokens
    for (const [tone, soft, ink] of [
      ['info', '--info-50', '--info-700'],
      ['ok', '--success-50', '--success-700'],
      ['warn', '--warning-50', '--warning-700'],
      ['danger', '--danger-50', '--danger-700'],
    ]) {
      expectDecls(`.notif-row__icon--${tone}`, [`background: var(${soft})`, `color: var(${ink})`])
    }
    expectDecls('.notif-drawer__foot', ['padding: 14px 20px', 'gap: 8px'])
  })

  it('paleta: 444px, raio 22, busca 60px, grupos mono 10/600 1.5px, itens 44/52, mark e Enter por token', () => {
    expectDecls('.modal.command-palette-modal', ['width: 444px', 'border-radius: 22px', 'box-shadow: var(--shadow-lg)'])
    expectDecls('.command-palette-modal .command-palette__search', ['height: 60px', 'padding: 0 20px'])
    expectDecls('.command-palette-modal .command-palette__group-label', [
      'font-family: var(--font-mono)',
      'font-size: 10px',
      'font-weight: 600',
      'letter-spacing: 1.5px',
    ])
    expectDecls('.command-palette-modal .command-palette__item', ['height: 44px', 'border-radius: 12px', 'font-size: 14px'])
    expectDecls('.command-palette-modal .command-palette__item--process', ['height: 52px'])
    expectDecls('.command-palette-modal .command-palette__item--active', [
      'background: var(--primary-50)',
      'box-shadow: inset 0 0 0 1px rgba(0, 120, 100, 0.25)',
    ])
    expectDecls('.command-palette__item-sub', ['font-family: var(--font-mono)', 'font-size: 11px'])
    expectDecls('.command-palette__mark', ['background: var(--mark-bg)', 'border-radius: 3px'])
    expectDecls('.command-palette__item-hint', ['color: var(--success-700)', 'font-family: var(--font-mono)'])
    expectDecls('.command-palette-modal .command-palette__footer', ['font-size: 11px', 'padding: 12px 20px'])
  })

  it('suporte: FAB pilula 48px navy com sombra do mock; modal 400px raio 22; campos 44px raio 10, foco navy + halo', () => {
    expectDecls('.support-fab .support-fab__trigger', [
      'height: 48px',
      'padding: 0 18px 0 14px',
      'gap: 10px',
      'border-radius: 99px',
      'background: var(--navy)',
      'box-shadow: 0 6px 18px rgba(0, 65, 83, 0.25)',
      'font-size: 14px',
      'font-weight: 700',
    ])
    expectDecls('.support-fab .support-fab__trigger svg', ['color: var(--primary)'])
    expectDecls('.modal.support-modal-shell', ['max-width: 400px', 'padding: 22px', 'border-radius: 22px'])
    expectDecls('.support-modal--desktop .support-modal__title', ['font-family: var(--font-heading)', 'font-size: 18px'])
    expectDecls('.support-modal--desktop .support-modal__input', [
      'height: 44px',
      'padding: 0 14px',
      'border: 1.5px solid var(--border-control)',
      'border-radius: 10px',
      'font-size: 14px',
      'font-weight: 500',
    ])
    expectDecls('.support-modal--desktop .support-modal__input:focus', [
      'border-color: var(--navy)',
      'box-shadow: 0 0 0 4px rgba(20, 221, 167, 0.28)',
    ])
    expectDecls('.support-modal--desktop .support-modal__context', ['padding: 10px 12px', 'border-radius: 12px', 'background: var(--surface-alt)', 'font-size: 12px'])
    expectDecls('.support-modal--desktop .support-modal__cancel', ['height: 44px', 'border-radius: 12px', 'font-weight: 700'])
  })

  it('escopo: toda regra do bloco desktop F2 comeca por uma classe raiz do shell', () => {
    const ROOTS =
      /^(\[data-theme='dark'\] )?(\.sidebar(?![-\w])|\.main-content|\.topbar(?![-\w])|\.topbar__|\.topbar-theme-button|\.admin-section |\.admin-tab(__|\.)|\.notifications-backdrop|\.notifications__panel(\.|--| )|\.notif-|\.modal(-backdrop)?\.(command-palette-modal|support-modal-shell)|\.command-palette|\.support-fab|\.support-modal)/
    expect(f2Rules.length).toBeGreaterThan(150)
    for (const rule of f2Rules) {
      for (const selector of rule.selectors) {
        expect(ROOTS.test(selector), `seletor fora das raizes do shell: ${selector}`).toBe(true)
      }
    }
  })

  it('tablet/mobile: elementos novos escondidos por padrao e crumb do processo so no desktop', () => {
    const base = parseRules(f2Css.slice(0, f2MediaStart))
    const hidden = base.find((r) => r.selectors.includes('.topbar__search'))
    expect(hidden?.body).toContain('display: none')
    for (const selector of [
      '.sidebar .sidebar__mark',
      '.sidebar .sidebar-intelliquote-link__mark',
      '.topbar__ptax-sep',
      '.admin-tab__dot',
      '.admin-tab__desc',
    ]) {
      expect(hidden.selectors, selector).toContain(selector)
    }
    expect(f2Css).toContain('.topbar__title-wrap--process-crumb .breadcrumb')
    expect(f2Css).toContain('@media (max-width: 1040px)')
  })

  it('reduce desktop: a gaveta nova entra no bloco existente (sem bloco reduce novo)', () => {
    const reduce = bodyAfter(css, '@media (min-width: 1041px) and (prefers-reduced-motion: reduce)')
    expect(reduce).toContain('.notifications__panel.notifications__panel--drawer')
    expect(reduce).toContain('.notifications__panel.notifications__panel--drawer.notifications__panel--closing')
  })

  it('notebook: sidebar compacta mantem 232px e o novo markup (marca, nav, rodape)', () => {
    const nb = stripComments(read('src/notebook.css'))
    expect(nb).toContain('width: 232px')
    for (const selector of [
      '.sidebar .sidebar__mark',
      '.sidebar .nav__link',
      '.sidebar .sidebar-intelliquote-link__mark',
      '.sidebar .sidebar__foot',
      '.support-fab .support-fab__trigger',
    ]) {
      expect(nb, selector).toContain(selector)
    }
    // o topbar sticky nao precisa mais de padding-left nem de altura fixa
    expect(nb).not.toMatch(/\.topbar\s*\{[^}]*padding-left/)
    expect(nb).not.toMatch(/\.topbar\s*\{[^}]*(?<![-\w])height:/)
  })
})

describe('F2 shell - JSX/markup', () => {
  const layout = read('src/components/AppLayout.jsx')
  const palette = read('src/components/CommandPalette.jsx')
  const adminLayout = read('src/pages/AdminLayout.jsx')
  const support = read('src/components/SupportButton.jsx')

  it('menu: Dashboard, Chegadas, Noticias, Admin (nessa ordem) e sem item de Notificacoes', () => {
    const nav = layout.slice(layout.indexOf('const navigation = ['), layout.indexOf('const ROLE_LABELS'))
    const labels = [...nav.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
    expect(labels).toEqual(['Dashboard', 'Chegadas', 'Notícias', 'Admin'])
    expect(nav).not.toMatch(/Notifica/)
    for (const icon of ['nav-dashboard', 'nav-arrivals', 'nav-news', 'nav-admin']) expect(nav).toContain(icon)
  })

  it('icones do shell com os paths exatos do mock', () => {
    const icons = read('src/components/Icon.jsx')
    for (const path of [
      'M3 4h7v8H3zM14 4h7v5h-7zM14 13h7v7h-7zM3 16h7v4H3z',
      'M3 17h18l-2 3H5zM5 17V9h14v8M9 9V5h6v4',
      'M4 5h12v14H6a2 2 0 0 1-2-2zM16 9h4v8a2 2 0 0 1-2 2M8 9h4M8 13h4',
      'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
      'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
      'M7 17 17 7M8 7h9v9',
    ]) {
      expect(icons, path).toContain(path)
    }
  })

  it('marca de produto no cabecalho (COMEX dark 40) e no card IntelliQuote (IQ dark 36)', () => {
    expect(layout).toContain('<ProductMark product="comex" tone="dark" size={40}')
    expect(layout).toContain('<ProductMark product="iq" tone="dark" size={36}')
    expect(layout).toContain('Abrir cotações')
    expect(layout).toContain('aria-label="Abrir IntelliQuote em nova aba"')
    // D4: o card "Fazer uma cotacao" (Comercial) nao tem marca.
    const quote = layout.slice(layout.indexOf('sidebar-intelliquote-link--quote'), layout.indexOf('profile?.role === \'admin\' ? ('))
    expect(quote).not.toContain('ProductMark')
  })

  it('topbar: busca Ctrl K, PTAX sem "R$", sino com badge e botao de usuario com menu (D5)', () => {
    expect(layout).toContain('className="topbar__search"')
    expect(layout).toContain('Buscar páginas, ações ou processos')
    expect(layout).toContain('topbar__ptax-sep')
    expect(layout).not.toMatch(/currency: 'BRL'/)
    expect(layout).toContain('aria-haspopup="menu"')
    expect(layout).toContain('Preferências de notificação')
    expect(layout).toContain("admin: 'Admin'")
    expect(layout).toContain("logistica: 'Logística'")
    expect(layout).not.toContain('topbar__logout')
  })

  it('abas do admin: rotulo + ponto + descricao e classe tab-button--active preservada', () => {
    expect(adminLayout).toContain('admin-tab__label')
    expect(adminLayout).toContain('admin-tab__dot')
    expect(adminLayout).toContain('admin-tab__desc')
    expect(adminLayout).toContain('tab-button--active')
  })

  it('paleta: grupos "Processos" (primeiro) e "Páginas e ações"', () => {
    expect(palette).toContain("const ASYNC_GROUP_LABEL = 'Processos'")
    expect(palette).toContain("const STATIC_GROUP_LABEL = 'Páginas e ações'")
    expect(palette.indexOf('...taggedAsync, ...filteredCommands')).toBeGreaterThan(0)
  })

  it('suporte: "Meus chamados" como visao alternada, chip de contexto e modal antigo no tablet', () => {
    expect(support).toContain('Meus chamados')
    expect(support).toContain('Contexto anexado:')
    expect(support).toContain('Cancelar')
    expect(support).toContain('isCompactLayout')
    expect(support).toContain("window.matchMedia('(max-width: 1040px)')")
  })
})

// ---------------------------------------------------------------------------
// F3 - componentes, estados e movimento.
// Valores copiados de Componentes.dc.html (botoes, campos, filtros, feedback) e
// Movimento.dc.html (duracoes, curvas, 8 animacoes). A F3 NAO tem uma secao
// unica: cada bloco fica logo depois da base do componente (assim as variantes
// de 1 classe que vem depois continuam vencendo por ordem) — todos abrem com o
// cabecalho "REFINO VISUAL F3 — <NOME>" e tem UM @media (min-width: 1041px).
// ---------------------------------------------------------------------------
const F3_HEADERS = [
  'CHIPS E FILTROS',
  'ALERTA INLINE',
  'TAG DE STATUS',
  'BOTOES',
  'BADGE INLINE',
  'CAMPOS',
  'ESTADO VAZIO',
  'TOOLTIP',
  'MOVIMENTO, TOAST, SKELETON E ESTADOS',
]
const F3_MOTION = 'MOVIMENTO, TOAST, SKELETON E ESTADOS'
const DESKTOP_MEDIA = '@media (min-width: 1041px) {'
const REDUCE_DESKTOP = '@media (min-width: 1041px) and (prefers-reduced-motion: reduce)'

// Texto do bloco F3 `name`: do comentario de cabecalho ate o fim do 1o @media desktop.
function f3Section(name) {
  const marker = `REFINO VISUAL F3 — ${name}`
  const at = css.indexOf(marker)
  expect(at, `secao F3 ausente: ${name}`).toBeGreaterThan(0)
  const from = css.lastIndexOf('/*', at)
  const mediaAt = css.indexOf(DESKTOP_MEDIA, at)
  expect(mediaAt, `secao ${name} sem @media desktop`).toBeGreaterThan(at)
  const body = bodyAfter(css.slice(mediaAt), DESKTOP_MEDIA)
  return {
    before: stripComments(css.slice(from, mediaAt)), // base (fora do @media)
    media: stripComments(body),
    start: from,
  }
}

const f3 = Object.fromEntries(F3_HEADERS.map((name) => [name, f3Section(name)]))
const f3Rules = Object.fromEntries(Object.entries(f3).map(([name, s]) => [name, parseRules(s.media)]))
const allF3Rules = Object.values(f3Rules).flat()

function f3Decls(selector, section) {
  const pool = section ? f3Rules[section] : allF3Rules
  const bodies = pool.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F3: ${selector}`).toBeGreaterThan(0)
  return bodies.join(' ')
}

function expectF3(selector, declarations, section) {
  const body = f3Decls(selector, section)
  for (const declaration of declarations) {
    expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
  }
}

describe('F3 - secoes e escopo', () => {
  it('as 9 secoes existem, vem antes do bloco reduce desktop e cada uma tem UM @media (min-width: 1041px)', () => {
    const reduceAt = css.lastIndexOf(REDUCE_DESKTOP)
    for (const [name, section] of Object.entries(f3)) {
      expect(section.start, name).toBeLessThan(reduceAt)
      // Entre o cabecalho e o @media da secao so pode haver base (keyframes/elementos
      // escondidos), nunca outro @media: o bloco e UM so, escopado ao desktop.
      expect(section.before, `${name}: @media antes do bloco desktop`).not.toMatch(/@media/)
      expect(section.media, `${name}: @media aninhado`).not.toMatch(/@media/)
    }
  })

  it('nenhuma secao F3 usa @media (max-width) e o bloco reduce desktop continua sendo o ultimo do arquivo', () => {
    for (const [name, section] of Object.entries(f3)) {
      expect(section.before + section.media, name).not.toMatch(/@media\s*\(max-width/)
    }
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(tail.match(/@media/g)).toHaveLength(1)
  })

  it('fora do @media desktop so ha elementos novos escondidos, keyframes e a base do skeleton do card', () => {
    const outside = Object.values(f3).map((s) => s.before).join('\n')
    // remove os @keyframes (corpo aninhado) antes de listar seletores
    let stripped = outside
    for (const m of [...outside.matchAll(/@keyframes\s+[a-z-]+\s*\{/g)]) {
      const body = bodyAfter(outside.slice(m.index), m[0].slice(0, -1))
      stripped = stripped.replace(`${m[0]}${body}}`, '')
    }
    const selectors = [...stripped.matchAll(/([^{}]+)\{/g)].map((m) => norm(m[1])).filter(Boolean)
    for (const selector of selectors) {
      expect(
        [
          '.empty-state__glyph',
          '.toast__icon',
          '.process-list-skeletons--card',
          '.skeleton-process-card',
          '.filter-chip__x--desk',
        ],
        `regra F3 fora do desktop: ${selector}`,
      ).toContain(selector)
    }
  })
})

describe('F3 - botoes (Componentes.dc.html)', () => {
  const four = ['.primary-button', '.ghost-button', '.danger-button', '.secondary-button']

  it('altura unica de 44px, raio 12, 14/700 e transicoes de 120 ms (transform) e 200 ms (cor/sombra)', () => {
    expectF3('.primary-button', ['min-height: 44px', 'border-radius: 12px', 'font-size: 14px', 'font-weight: 700'], 'BOTOES')
    const base = f3Decls('.secondary-button', 'BOTOES')
    expect(base).toContain('transform var(--dur-fast) var(--ease-out)')
    expect(base).toContain('background-color var(--dur-base) var(--ease-out)')
    expect(base).toContain('box-shadow var(--dur-base) var(--ease-out)')
    expect(light['--dur-fast']).toBe('120ms')
    expect(light['--dur-base']).toBe('200ms')
  })

  it('primario: menta + navy; hover com halo 0 6px 18px a 35%; pressionado --button-primary-bg-active', () => {
    expectF3('.primary-button', ['background: var(--button-primary-bg)', 'color: var(--on-button-primary)'], 'BOTOES')
    expectF3(
      '.primary-button:hover:not(:disabled)',
      ['background: var(--button-primary-bg-hover)', 'box-shadow: 0 6px 18px rgba(20, 221, 167, 0.35)'],
      'BOTOES',
    )
    expectF3('.primary-button:active:not(:disabled)', ['background: var(--button-primary-bg-active)'], 'BOTOES')
  })

  it('pressionado: scale(.97) nos 4 tipos', () => {
    const rule = f3Rules.BOTOES.find(
      (r) => r.selectors.includes('.secondary-button:active:not(:disabled)') && r.body.includes('scale'),
    )
    expect(rule.body).toContain('transform: scale(0.97);')
    for (const type of four) expect(rule.selectors).toContain(`${type}:active:not(:disabled)`)
  })

  it('foco: anel duplo (3px --surface + 5px --focus-ring); no destrutivo o anel externo e --danger', () => {
    for (const type of four) {
      expectF3(
        `${type}:focus-visible:not(:disabled)`,
        ['box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--focus-ring)'],
        'BOTOES',
      )
    }
    expectF3('.danger-button:focus-visible:not(:disabled)', ['--focus-ring: var(--danger)'], 'BOTOES')
    // guarda (h) do colorContrast: outline:none sempre com --focus-ring no mesmo bloco
    for (const rule of f3Rules.BOTOES.filter((r) => r.body.includes('outline: none'))) {
      expect(rule.body).toContain('var(--focus-ring)')
    }
  })

  it('secundario: contorno 1.5px navy; hover --navy-50; pressionado --navy-100 + borda --navy-900', () => {
    expectF3('.secondary-button', ['border: 1.5px solid var(--btn-ink)', 'background: var(--surface)', 'color: var(--btn-ink)'], 'BOTOES')
    expectF3('.secondary-button', ['--btn-ink: var(--navy)', '--btn-line-active: var(--navy-900)'], 'BOTOES')
    expectF3('.secondary-button:hover:not(:disabled)', ['background: var(--navy-50)'], 'BOTOES')
    expectF3(
      '.secondary-button:active:not(:disabled)',
      ['background: var(--navy-100)', 'border-color: var(--btn-line-active)'],
      'BOTOES',
    )
    // dark: o navy vira --primary
    expectF3("[data-theme='dark'] .secondary-button", ['--btn-ink: var(--primary)'], 'BOTOES')
  })

  it('fantasma: transparente + navy; hover --bg; pressionado --disabled-bg', () => {
    expectF3('.ghost-button', ['background: transparent', 'color: var(--btn-ink)', 'border-color: transparent'], 'BOTOES')
    expectF3('.ghost-button:hover:not(:disabled)', ['background: var(--bg)'], 'BOTOES')
    expectF3('.ghost-button:active:not(:disabled)', ['background: var(--disabled-bg)'], 'BOTOES')
  })

  it('destrutivo: --danger / --danger-bg-hover / --danger-bg-active com --on-danger (guarda (l))', () => {
    expectF3('.danger-button', ['background: var(--danger)', 'color: var(--on-danger)'], 'BOTOES')
    expectF3('.danger-button:hover:not(:disabled)', ['background: var(--danger-bg-hover)'], 'BOTOES')
    expectF3('.danger-button:active:not(:disabled)', ['background: var(--danger-bg-active)'], 'BOTOES')
  })

  it('desabilitado: --disabled-bg / --disabled-ink sem opacidade (secundario com borda --border)', () => {
    expectF3('.primary-button:disabled', ['background: var(--disabled-bg)', 'color: var(--disabled-ink)', 'opacity: 1'], 'BOTOES')
    expectF3(
      '.secondary-button:disabled',
      ['background: var(--surface)', 'border-color: var(--border)', 'color: var(--disabled-ink)'],
      'BOTOES',
    )
    expectF3('.ghost-button:disabled', ['background: transparent', 'color: var(--disabled-ink)'], 'BOTOES')
  })

  it('carregando: spinner de 14px com borda 2px a 40%, topo cheio, 0,8 s', () => {
    expectF3(
      '.primary-button .spinner',
      [
        'border: 2px solid color-mix(in srgb, currentColor 40%, transparent)',
        'border-top-color: currentColor',
        'animation: spinner-rotate 0.8s linear infinite',
      ],
      'BOTOES',
    )
    expectF3('.danger-button .spinner__svg', ['display: none'], 'BOTOES')
  })

  it('os tokens do mock existem nos dois temas (botao primario, destrutivo, desabilitado)', () => {
    const expected = {
      '--button-primary-bg': '#14dda7',
      '--button-primary-bg-hover': '#2ee8b5',
      '--button-primary-bg-active': '#0fb98c',
      '--danger': '#c2362b',
      '--danger-bg-hover': '#a82d23',
      '--danger-bg-active': '#8f251d',
      '--disabled-bg': '#e3ecea',
      '--disabled-ink': '#6b7f88',
      '--navy-50': '#e8f0f2',
      '--navy-100': '#d6e3e7',
      '--navy-900': '#003241',
    }
    for (const [token, value] of Object.entries(expected)) expect(light[token], token).toBe(value)
    for (const token of Object.keys(expected)) expect(dark[token], `dark ${token}`).toBeTruthy()
  })
})

describe('F3 - campos, chips, tags (Componentes.dc.html)', () => {
  it('campo: 44px, raio 10, borda 1.5px --border-control (D1), 14/500, padding 0 14px', () => {
    expectF3(
      '.text-input',
      [
        'border: 1.5px solid var(--border-control)',
        'border-radius: var(--radius-field)',
        'font-size: 14px',
        'font-weight: 500',
      ],
      'CAMPOS',
    )
    expect(light['--radius-field']).toBe('10px')
    expectF3('input.text-input', ['min-height: 44px', 'padding: 0 14px'], 'CAMPOS')
    expectF3('select.text-input', ['min-height: 44px'], 'CAMPOS')
    // dentro do grid do label, o campo nao estica quando o vizinho tem mensagem de erro
    expectF3('.field > input.text-input', ['align-self: start'], 'CAMPOS')
    // textarea nao herda min-height de 44 (o .text-area continua com 110px)
    expect(f3Decls('textarea.text-input', 'CAMPOS')).not.toContain('min-height')
    expect(light['--border-control']).toBe('#6b7f88')
  })

  it('foco: borda --focus-ring (navy; menta no dark) + halo 4px a 28%; erro: borda --danger, mensagem 11/600', () => {
    expectF3('.text-input:focus', ['border-color: var(--focus-ring)', 'box-shadow: 0 0 0 4px var(--primary-a28)'], 'CAMPOS')
    expect(light['--primary-a28']).toBe('rgba(20, 221, 167, 0.28)')
    expect(light['--focus-ring']).toBe('#004153')
    expect(dark['--focus-ring']).toBe('#14dda7')
    expectF3(".text-input[aria-invalid='true']", ['border-color: var(--danger)'], 'CAMPOS')
    expectF3('.field-error', ['font-size: 11px'], 'CAMPOS')
    expectF3('.field > span', ['font-size: 13px', 'font-weight: 600', 'text-transform: none', 'color: var(--ink)'], 'CAMPOS')
    expectF3('.field', ['gap: 6px'], 'CAMPOS')
  })

  it('datas e horas (e .text-input--mono) em JetBrains Mono', () => {
    expectF3(".text-input[type='date']", ['font-family: var(--font-mono)', 'min-height: 44px'], 'CAMPOS')
    expectF3('.text-input--mono', ['font-family: var(--font-mono)'], 'CAMPOS')
  })

  it('pilula de filtro: 36px, 13/600, ativa --navy, contador mono 11, "+ Filtro" tracejado', () => {
    const S = 'CHIPS E FILTROS'
    expectF3('.filter-pill', ['height: 36px', 'padding: 0 14px', 'border-radius: 999px', 'font-size: 13px', 'font-weight: 600'], S)
    expectF3('.filter-pill--active', ['background: var(--navy)', 'color: #ffffff'], S)
    expectF3('.filter-pill--active .filter-pill__count', ['background: rgba(255, 255, 255, 0.18)', 'padding: 2px 7px', 'border-radius: 999px'], S)
    expectF3('.filter-pill__count', ['font-family: var(--font-mono)', 'font-size: 11px'], S)
    expect(f3Decls('.filter-pill__count', S)).not.toContain('padding')
    expectF3('.filter-pill__count--alert', ['color: var(--danger-700)'], S)
    expectF3('.filter-pill--add', ['border-style: dashed'], S)
  })

  it('chip de filtro aplicado: 32px, 0 6px 0 12px, --navy-50/--navy 13/700, remover 24px', () => {
    const S = 'CHIPS E FILTROS'
    expectF3('.filter-chip', ['min-height: 32px', 'padding: 0 6px 0 12px', 'font-size: 13px', 'font-weight: 700'], S)
    expectF3('.filter-chip--default', ['background: var(--navy-50)', 'color: var(--navy)'], S)
    expectF3('.filter-chips-row .filter-chip', ['background: var(--navy-50)', 'color: var(--navy)'], S)
    expectF3('.filter-chip__remove', ['width: 24px', 'height: 24px'], S)
    // o X do mock so no desktop; o antigo (plus girado) continua no tablet/mobile
    expectF3('.filter-chip__x--legacy', ['display: none'], S)
    expectF3('.filter-chip__x--desk', ['display: block'], S)
    expect(f3[S].before).toContain('.filter-chip__x--desk')
    expectF3('.filter-chips-row__clear', ['color: var(--danger-700)', 'min-height: 32px'], S)
  })

  it('tag de status e badge: 26px, padding 0 10px, 12/700', () => {
    expectF3('.status-tag', ['min-height: 26px', 'padding: 0 10px', 'font-size: 12px', 'min-width: 0'], 'TAG DE STATUS')
    expectF3('.inline-badge', ['min-height: 26px', 'padding: 0 10px', 'font-size: 12px'], 'BADGE INLINE')
  })
})

describe('F3 - feedback (Componentes.dc.html)', () => {
  it('alerta inline: raio 14, padding 14/16, icone de 20px por ::before (mesmos tracos do mock), acao sublinhada 13/700', () => {
    const S = 'ALERTA INLINE'
    expectF3('.error-banner', ['background: var(--danger-50)', 'color: var(--danger-700)'], S)
    expectF3('.success-banner', ['background: var(--success-50)', 'color: var(--success-700)'], S)
    expectF3('.error-banner', ['border-radius: 14px', 'font-size: 14px', 'font-weight: 600'], S)
    expectF3('.error-banner::before', ['width: 20px', 'height: 20px'], S)
    const media = f3[S].media
    expect(media).toContain("circle cx='12' cy='12' r='9'")
    expect(media).toContain('M12 8v5M12 16h.01')
    expect(media).toContain("stroke-width='1.9'")
    expectF3('.error-banner--retry .ghost-button', ['text-decoration: underline', 'font-size: 13px', 'font-weight: 700'], S)
    // card de aviso: mesmo tom soft + ink, raio 14
    expectF3('.detail-card--warning', ['background: var(--warning-50)', 'color: var(--warning-700)', 'border-radius: 14px'], S)
  })

  it('estado vazio: borda 1px tracejada --border-strong, raio 16, icone 40px (traco 1.5, --primary-700), 14/700 + 12/1.5', () => {
    const S = 'ESTADO VAZIO'
    expectF3('.empty-state', ['border: 1px dashed var(--border-strong)', 'border-radius: 16px', 'padding: 22px 16px'], S)
    expectF3('.empty-state__glyph', ['width: 40px', 'height: 40px', 'color: var(--primary-700)'], S)
    expectF3('.empty-state__icon svg', ['width: 40px', 'height: 40px', 'stroke-width: 1.5'], S)
    expectF3('.empty-state strong', ['font-size: 14px', 'font-weight: 700'], S)
    expectF3('.empty-state p', ['font-size: 12px', 'line-height: 1.5', 'color: var(--ink-soft)'], S)
    expectF3('.empty-state__illustration', ['display: none'], S)
    expect(f3[S].before).toContain('.empty-state__glyph')
  })

  it('tooltip: --toast-bg/--toast-ink, 12/600, raio 10, padding 8x12', () => {
    expectF3(
      '.tooltip::after',
      [
        'background: var(--toast-bg)',
        'color: var(--toast-ink)',
        'font-size: 12px',
        'font-weight: 600',
        'border-radius: 10px',
        'padding: 8px 12px',
      ],
      'TOOLTIP',
    )
  })

  it('toast: navy, raio 14, padding 14/16, --shadow-lg, 14/600, circulo de 28px por tom; mola 300 ms, saida 200 ms ease-in', () => {
    const S = F3_MOTION
    expectF3(
      '.toast',
      [
        'gap: 12px',
        'padding: 14px 16px',
        'border-radius: 14px',
        'background: var(--toast-bg)',
        'color: var(--toast-ink)',
        'box-shadow: var(--shadow-lg)',
        'font-size: 14px',
        'font-weight: 600',
      ],
      S,
    )
    // o dark tambem zera a faixa lateral do F1 (border-left) nas 4 variantes
    for (const tone of ['success', 'error', 'warning', 'info']) {
      expectF3(`[data-theme='dark'] .toast.toast--${tone}`, ['border: 0'], S)
    }
    expectF3('.toast__icon', ['width: 28px', 'height: 28px', 'border-radius: 999px'], S)
    expectF3('.toast--success .toast__icon', ['background: var(--primary)', 'color: var(--on-primary)'], S)
    expectF3('.toast--error .toast__icon', ['background: var(--danger)', 'color: var(--on-danger)'], S)
    expectF3('.toast--warning .toast__icon', ['background: var(--warning)', 'color: var(--on-warn)'], S)
    expectF3('.toast--info .toast__icon', ['background: var(--info)'], S)
    // animation em seletor de 1 classe: o bloco reduce (.toast/.toast--closing) continua vencendo.
    expectF3('.toast', ['animation: motion-toast-in var(--dur-slow) var(--ease-spring) both'], S)
    expectF3('.toast--closing', ['animation: motion-toast-out var(--dur-base) var(--ease-in) both'], S)
  })

  it('skeleton: gradiente base -> shine -> base, 200% 100%, shimmer de 1,4 s linear; legado so no tablet/mobile', () => {
    const S = F3_MOTION
    const body = f3Decls('.skeleton', S)
    expect(body).toContain('var(--skeleton-base) 0%')
    expect(body).toContain('var(--skeleton-shine) 50%')
    expect(body).toContain('background-size: 200% 100%')
    expect(body).toContain('animation: motion-shimmer 1.4s linear infinite')
    expectF3("[data-theme='dark'] .skeleton", ['animation: motion-shimmer 1.4s linear infinite'], S)
    expectF3('.skeleton-legacy', ['display: none'], S)
    expectF3('.process-card-skeleton', ['padding: 18px', 'border-radius: 16px', 'background: var(--surface-alt)'], S)
    expectF3('.skeleton-reveal', ['animation: motion-fade-in var(--dur-base) linear both'], S)
  })
})

describe('F3 - movimento (Movimento.dc.html)', () => {
  const MOTION = F3_MOTION

  it('keyframes: valores do mock e so transform/opacity (unica excecao: shimmer em background-position)', () => {
    const text = f3[MOTION].before
    const keyframes = [...text.matchAll(/@keyframes\s+(motion-[a-z-]+)\s*\{/g)].map((m) => m[1])
    expect([...keyframes].sort()).toEqual(
      [
        'motion-fade-in',
        'motion-fade-out',
        'motion-fill',
        'motion-modal-out',
        'motion-pop',
        'motion-rise',
        'motion-shimmer',
        'motion-toast-in',
        'motion-toast-out',
      ].sort(),
    )
    for (const name of keyframes) {
      const body = bodyAfter(text, `@keyframes ${name}`)
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      const allowed = name === 'motion-shimmer' ? ['background-position'] : ['opacity', 'transform']
      for (const prop of props) expect(allowed, `${name}: ${prop}`).toContain(prop)
    }
    const kf = (n) => norm(bodyAfter(text, `@keyframes ${n}`))
    expect(kf('motion-rise')).toBe('from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; }')
    expect(kf('motion-fill')).toBe('from { transform: scaleX(0); } to { transform: scaleX(1); }')
    expect(kf('motion-pop')).toBe('from { transform: scale(0); } to { transform: scale(1); }')
    expect(kf('motion-toast-in')).toBe(
      'from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; }',
    )
    expect(kf('motion-shimmer')).toBe('from { background-position: 100% 0; } to { background-position: -100% 0; }')
  })

  it('pagina 500 ms ease-out; lista 300 ms com +40 ms por item (so os 8 primeiros)', () => {
    expectF3('.page-fade--visible', ['animation: motion-rise var(--dur-page) var(--ease-out) both'], MOTION)
    expectF3(
      '.stagger__item',
      [
        'animation: motion-rise var(--dur-slow) var(--ease-out) both',
        'animation-delay: calc(min(var(--stagger-index, 0), 7) * 40ms)',
      ],
      MOTION,
    )
    expect(light['--dur-page']).toBe('500ms')
    expect(light['--dur-slow']).toBe('300ms')
    const bezier = (token) => light[token].replace(/\s+/g, '').replace(/\(0\./g, '(.').replace(/,0\./g, ',.')
    expect(bezier('--ease-out')).toBe('cubic-bezier(.4,0,.2,1)')
    expect(bezier('--ease-in')).toBe('cubic-bezier(.4,0,1,1)')
    expect(bezier('--ease-spring')).toBe('cubic-bezier(.34,1.56,.64,1)')
  })

  it('timeline: o token do preenchimento e 600 ms (o trilho do detalhe desktop esta nos testes da F4c)', () => {
    expect(light['--dur-fill']).toBe('600ms')
  })

  it('estrela de favorito: scale(0 -> 1) em 300 ms com mola', () => {
    expectF3('.favorite-star--pop', ['animation: motion-pop var(--dur-slow) var(--ease-spring) both'], MOTION)
  })

  it('cards nao levantam: hover com transform: none e troca de sombra/borda em 200 ms', () => {
    for (const selector of [
      '.stat-card:hover',
      '.process-item--button:hover',
      '.admin-user-row--button:hover',
      '.announcement-card--button:hover',
      '.process-related-item-button:hover',
      '.news-attachment:hover',
      '.weekly-arrivals-item--clickable:hover',
      '.notifications__show-more:hover',
    ]) {
      expectF3(selector, ['transform: none'], MOTION)
    }
    expectF3('.stat-card:hover', ['border-color: var(--border-strong)', 'box-shadow: var(--shadow-md)'], MOTION)
    expectF3(
      '.process-item--button:not(.process-item--selected):hover',
      ['border-color: var(--border-strong)', 'box-shadow: var(--shadow-md)', 'background: var(--surface)'],
      MOTION,
    )
    expectF3('.process-item--button:not(.process-item--selected)', ['box-shadow: var(--shadow-sm)'], MOTION)
    const transition = f3Decls('.process-item--button', MOTION)
    expect(transition).toContain('box-shadow var(--dur-base) var(--ease-out)')
    expect(transition).not.toContain('transform')
    // nenhuma regra desta secao de movimento levanta (translateY negativo) em :hover
    for (const rule of f3Rules[MOTION].filter((r) => r.selectors.some((s) => s.includes(':hover')))) {
      expect(rule.body, rule.selectors.join(',')).not.toMatch(/translateY\(-/)
    }
  })

  it('scrim 200 ms linear (saida 140 ms ease-in) e modal 300 ms (saida 210 ms ease-in)', () => {
    expectF3('.modal-backdrop', ['background: var(--scrim)', 'animation: motion-fade-in var(--dur-base) linear both'], MOTION)
    expectF3('.modal-backdrop--closing', ['animation: motion-fade-out 140ms var(--ease-in) both'], MOTION)
    expectF3('.modal', ['animation: motion-rise var(--dur-slow) var(--ease-out) both'], MOTION)
    expectF3('.modal--sheet-closing', ['animation: motion-modal-out 210ms var(--ease-in) both'], MOTION)
    expectF3('.notifications-backdrop', ['animation: motion-fade-in var(--dur-base) linear both'], MOTION)
    expectF3('.notifications-backdrop--closing', ['animation: motion-fade-out 140ms var(--ease-in) both'], MOTION)
  })

  it('a gaveta (F2) segue com 300 ms ease-out / 210 ms ease-in (nao foi alterada)', () => {
    expect(css).toMatch(/animation: notif-drawer-in var\(--dur-slow\) var\(--ease-out\) forwards/)
    expect(css).toMatch(/animation: notif-drawer-out 210ms var\(--ease-in\) forwards/)
  })

  it('movimento reduzido: as regras F3 entram no bloco desktop existente (fade de 150 ms, sem escalonar/shimmer)', () => {
    const reduceStart = css.lastIndexOf(REDUCE_DESKTOP)
    const reduceBody = norm(stripComments(bodyAfter(css.slice(reduceStart), REDUCE_DESKTOP)))
    expect(reduceBody).toContain('.page-fade--visible')
    expect(reduceBody).toContain('.favorite-star--pop')
    expect(reduceBody).toContain('.process-detail-view .pdv-timeline__fill')
    expect(reduceBody).toContain('animation: motion-fade-in 150ms linear both')
    expect(reduceBody).toContain('.stagger__item { animation: motion-fade-in 150ms linear both; animation-delay: 0ms; }')
    expect(reduceBody).toMatch(/\.skeleton, \[data-theme='dark'\] \.skeleton \{ animation: none; \}/)
    expect(reduceBody).toContain('.primary-button:active:not(:disabled)')
    expect(reduceBody).toContain('transform: none')
    // a regra original do toast continua la (animation: none)
    expect(reduceBody).toContain('.toast { animation: none; }')
  })
})

describe('F3 - JSX dos componentes', () => {
  const toast = read('src/components/Toast.jsx')
  const statCard = read('src/components/StatCard.jsx')
  const stagger = read('src/components/Stagger.jsx')
  const listView = read('src/features/processes/ProcessListView.jsx')
  const detailView = read('src/features/processes/ProcessDetailView.jsx')
  const dashboard = read('src/pages/DashboardPage.jsx')

  it('toast: 5 s, pausa em mouse/foco, icone decorativo por tom, erro sem auto-dismiss', () => {
    expect(toast).toContain('const TOAST_TIMEOUT_MS = 5000')
    expect(toast).toContain('onMouseEnter')
    expect(toast).toContain('onFocus')
    expect(toast).toContain('className="toast__icon"')
    expect(toast).toContain("tone !== 'error'")
  })

  it('stagger expoe --stagger-index; StatCard usa o contador; nenhuma dependencia de animacao nova', () => {
    expect(stagger).toContain("'--stagger-index': index")
    expect(statCard).toContain('useCountUp(value)')
    const pkg = JSON.parse(read('package.json'))
    expect(Object.keys(pkg.dependencies)).not.toContain('framer-motion')
  })

  it('estrela com mola so ao ativar (lista e detalhe) e timeline com --seg-index/--seg-count', () => {
    expect(listView).toContain('useActivationPop(Boolean(isFavorite))')
    expect(listView).toContain("'favorite-star--pop'")
    expect(detailView).toContain('useActivationPop(isFavorite)')
    expect(detailView).toContain("'--seg-index': index - 1")
    expect(detailView).toContain("'--seg-count': filledSegments")
  })

  it('skeleton no formato real do card (desktop) com o legado preservado + fade ao revelar', () => {
    for (const source of [listView, dashboard]) {
      expect(source).toContain('skeleton-legacy')
      expect(source).toContain('process-list-skeletons--card')
      expect(source).toContain('<Skeleton.ProcessCard />')
      expect(source).toContain('skeleton-reveal')
    }
    // o skeleton antigo (4 pecas por card) segue no DOM para tablet/mobile
    expect(listView).toContain('process-item process-item--skeleton')
  })
})

// ---------------------------------------------------------------------------
// F3 - inventario dos consumidores de .ghost-button (guarda anti-regressao).
// O .ghost-button do mock e SEM moldura (fantasma); varios consumidores eram
// contornados e NAO sao fantasma no mock (ou o mock da pagina nao os mostra).
// Esses ganharam um modificador so de desktop (ghost-button--secondary = navy
// 1.5px; ghost-button--outline = 1px --border). A lista completa, com a
// classificacao linha a linha, esta em .agent-tmp/ghost-consumers.md. Aqui:
// por arquivo, [total de .ghost-button, com --secondary, com --outline]. Novo
// consumidor, ou um SECONDARY que volte a ser fantasma, reprova este teste.
// ---------------------------------------------------------------------------
describe('F3 - consumidores de .ghost-button (secundario nao pode virar fantasma)', () => {
  const GHOST_CONSUMERS = {
  'components/AppLayout.jsx': [8, 1, 0],
  'components/ConfirmDialog.jsx': [1, 0, 0],
  'components/NotificationPreferencesModal.jsx': [1, 0, 0],
  'components/NotificationsList.jsx': [3, 0, 1],
  'components/SupportButton.jsx': [2, 1, 1],
  'features/admin/AdminAnnouncementsPanel.jsx': [1, 1, 0],
  'features/admin/AdminBarStatusPanel.jsx': [1, 1, 0],
  'features/admin/AdminLeadTimePanel.jsx': [1, 1, 0],
  'features/admin/AdminSupportPanel.jsx': [3, 3, 0],
  'features/admin/AdminUsersPanel.jsx': [5, 3, 0],
  'features/erp/ErpCreateProcessesPanel.jsx': [1, 0, 0],
  'features/erp/ErpReconcileModal.jsx': [2, 1, 0],
  'features/processes/CollectionStatusEditView.jsx': [1, 0, 0],
  'features/processes/CollectionWindowsEditor.jsx': [2, 2, 0],
  'features/processes/ContainersEditor.jsx': [1, 1, 0],
  'features/processes/ImportProcessesModal.jsx': [1, 0, 0],
  'features/processes/LicensesEditor.jsx': [1, 1, 0],
  'features/processes/PostReceiptEditView.jsx': [1, 0, 0],
  'features/processes/PostReceiptGallery.jsx': [1, 0, 0],
  'features/processes/PostReceiptImagesField.jsx': [2, 1, 1],
  'features/processes/ProcessCargoFields.jsx': [1, 1, 0],
  'features/processes/ProcessDetailView.jsx': [6, 3, 2],
  'features/processes/ProcessDocumentsPanel.jsx': [15, 1, 12],
  'features/processes/ProcessForm.jsx': [7, 5, 0],
  // F4d: o rodape do modal (ProcessFormDialog) tem 1 fantasma (Voltar); Salvar = .secondary-button, Avancar = .primary-button.
  'features/processes/ProcessFormDialog.jsx': [1, 0, 0],
  'features/processes/ProcessHistoryPanel.jsx': [1, 1, 0],
  // F4b: o desktop vive em ProcessListDesktop: Arquivados = fantasma; Exportar/Importar = .secondary-button.
  'features/processes/ProcessListDesktop.jsx': [1, 0, 0],
  'features/processes/ProcessListView.jsx': [4, 2, 0],
  'features/processes/ProcessMessagesPanel.jsx': [1, 0, 1],
  'features/processes/PurchaseOrdersEditor.jsx': [2, 2, 0],
  'features/processes/RenameDocumentDialog.jsx': [1, 0, 0],
  'features/processes/VesselTrackingButton.jsx': [4, 4, 0],
  // F4a: +1 "Tentar novamente" (fantasma) no banner de erro da lista desktop.
  'features/processes/WeeklyArrivalsCard.jsx': [4, 2, 0],
  'pages/AdminForecastPage.jsx': [5, 4, 0],
  'pages/DashboardPage.jsx': [1, 0, 0],
  'pages/DebugClaimsPage.jsx': [1, 0, 0],
  'pages/LoginPage.jsx': [1, 1, 0],
  'pages/NewsPage.jsx': [5, 4, 0],
  'pages/NotFoundPage.jsx': [1, 1, 0],
  'pages/NotificationsPage.jsx': [3, 1, 2],
  'pages/PendingApprovalPage.jsx': [2, 1, 0],
  'pages/VerifyEmailPage.jsx': [2, 1, 0],
  }

  function walkJsx(dir, out = []) {
    for (const entry of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walkJsx(rel, out)
      else if (entry.name.endsWith('.jsx') && !entry.name.includes('.stories.')) out.push(rel)
    }
    return out
  }

  it('a contagem por arquivo (total / secondary / outline) bate com o inventario', () => {
    const found = {}
    for (const file of walkJsx('src')) {
      const lines = read(file).split(/\r?\n/).filter((l) => /ghost-button(?!-)/.test(l))
      if (!lines.length) continue
      found[file.replace(/^src\//, '')] = [
        lines.length,
        lines.filter((l) => l.includes('ghost-button--secondary')).length,
        lines.filter((l) => l.includes('ghost-button--outline')).length,
      ]
    }
    expect(found).toEqual(GHOST_CONSUMERS)
  })

  // rotulo -> arquivo + modificador esperado (os casos nomeados no review da F3)
  const NAMED = [
    ['src/features/processes/ProcessListView.jsx', 'Importar do DBCorp', 'ghost-button--secondary'],
    ['src/features/processes/ProcessListView.jsx', 'Exportar', 'ghost-button--secondary'],
    ['src/features/processes/ProcessDetailView.jsx', 'Status de coleta', 'ghost-button--secondary'],
    ['src/features/processes/ProcessDetailView.jsx', 'Editar observações', 'ghost-button--secondary'],
    ['src/pages/AdminForecastPage.jsx', 'Restaurar padrões', 'ghost-button--secondary'],
    ['src/features/admin/AdminUsersPanel.jsx', 'Bloquear usuário', 'ghost-button--secondary'],
    ['src/features/admin/AdminSupportPanel.jsx', 'Enviar resposta', 'ghost-button--secondary'],
    ['src/pages/NotificationsPage.jsx', 'Marcar todas como lidas', 'ghost-button--secondary'],
    ['src/pages/NotificationsPage.jsx', 'Preferências de notificação', 'ghost-button--outline'],
    ['src/pages/NotificationsPage.jsx', 'Ativar modo não perturbe', 'ghost-button--outline'],
  ]

  it.each(NAMED)('%s: "%s" tem %s', (file, label, modifier) => {
    const source = read(file)
    let at = source.indexOf(label)
    expect(at, `rotulo ausente: ${label}`).toBeGreaterThan(0)
    // algum botao com esse rotulo tem a classe base + o modificador
    let ok = false
    while (at >= 0 && !ok) {
      const start = Math.max(
        source.lastIndexOf('<button', at),
        source.lastIndexOf('<Link', at),
        source.lastIndexOf('<a ', at),
        source.lastIndexOf('<span', at),
      )
      const opening = source.slice(start, at)
      ok = /ghost-button(?!-)/.test(opening) && opening.includes(modifier)
      at = source.indexOf(label, at + 1)
    }
    expect(ok, `${label} deve ter ${modifier}`).toBe(true)
  })

  it('os modificadores existem so dentro do @media desktop (tablet/mobile intactos)', () => {
    const outside = css.replace(/@media \(min-width: 1041px\) \{[\s\S]*?\n\}\n/g, '')
    expect(stripComments(outside)).not.toContain('ghost-button--')
    expect(stripComments(css)).toContain('.ghost-button.ghost-button--secondary')
    expect(stripComments(css)).toContain('.ghost-button.ghost-button--outline')
    // mobile-redesign.css continua mirando .ghost-button (a classe base foi mantida)
    expect(read('src/mobile-redesign.css')).not.toContain('ghost-button--')
  })

  it('secundario = .secondary-button do mock; outline = 1px --border; compostos vencem o .ghost-button base', () => {
    const rules = parseRules(stripComments(f3['BOTOES'].media))
    const body = (selector) => rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body).join(' ')
    expect(body('.ghost-button.ghost-button--secondary')).toContain('border: 1.5px solid var(--btn-ink);')
    expect(body('.ghost-button.ghost-button--secondary:hover:not(:disabled)')).toContain('background: var(--navy-50);')
    expect(body('.ghost-button.ghost-button--secondary:active:not(:disabled)')).toContain('background: var(--navy-100);')
    expect(body('.ghost-button.ghost-button--outline')).toContain('border: 1px solid var(--border);')
    expect(body('.ghost-button.ghost-button--outline:disabled')).toContain('color: var(--disabled-ink);')
  })
})

// ---------------------------------------------------------------------------
// F4a - Dashboard (Dashboard.dc.html). Arvore propria no desktop (dash-*),
// escolhida por matchMedia; tablet/mobile ficam na arvore legada. CSS = uma
// secao "REFINO VISUAL F4a — DASHBOARD" com UM @media desktop, toda regra sob
// `.surface--dashboard`, mais o modo compacto de notebook.
// ---------------------------------------------------------------------------
const F4A_MARKER = 'REFINO VISUAL F4a — DASHBOARD (Dashboard.dc.html'
const F4A_COMPACT_MARKER = 'REFINO VISUAL F4a — DASHBOARD COMPACTO'
const f4aAt = css.indexOf(F4A_MARKER)
const f4aCompactAt = css.indexOf(F4A_COMPACT_MARKER)
const f4aMainEnd = f4aCompactAt > 0 ? css.lastIndexOf('/*', f4aCompactAt) : -1
const f4aStart = css.lastIndexOf('/*', f4aAt)
const f4aMedia = stripComments(css.slice(f4aStart, f4aMainEnd))
const f4aMediaBody = bodyAfter(f4aMedia, DESKTOP_MEDIA)
const f4aRules = parseRules(f4aMediaBody)
const f4aCompactRules = parseRules(
  bodyAfter(
    stripComments(css.slice(f4aCompactAt, css.indexOf('/* Roadmap 11 / PR #223'))),
    '@media (min-width: 1041px) and (max-height: 800px) {',
  ),
)

function f4aDecls(selector, rules = f4aRules) {
  const bodies = rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F4a: ${selector}`).toBeGreaterThan(0)
  return bodies.join(' ')
}

function expectF4a(selector, declarations, rules) {
  const body = f4aDecls(selector, rules)
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F4a - secao, escopo e ordem', () => {
  it('a secao existe, vem antes do bloco reduce desktop e tem UM @media desktop (+ o compacto)', () => {
    expect(f4aAt).toBeGreaterThan(0)
    expect(f4aCompactAt).toBeGreaterThan(f4aAt)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f4aCompactAt)
    const before = stripComments(css.slice(f4aStart, css.indexOf(DESKTOP_MEDIA, f4aAt)))
    expect(before.trim(), 'nada fora do @media na secao principal').toBe('')
    expect(f4aMediaBody).not.toMatch(/@media/)
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(tail.match(/@media/g)).toHaveLength(1)
  })

  it('nenhuma regra usa @media (max-width) e toda regra comeca pela raiz .surface--dashboard', () => {
    const whole = stripComments(css.slice(f4aStart, css.indexOf('/* Roadmap 11 / PR #223')))
    expect(whole).not.toMatch(/@media\s*\(max-width/)
    for (const rule of [...f4aRules, ...f4aCompactRules]) {
      for (const selector of rule.selectors) {
        expect(selector, `seletor sem a raiz: ${selector}`).toMatch(
          /^(\[data-theme='dark'\] )?\.surface(\.surface--dashboard| \.surface--dashboard|--dashboard)/,
        )
      }
    }
  })

  it('sem hex/rgb literal: so tokens (var(--...))', () => {
    const colors = (f4aMediaBody + f4aCompactRules.map((r) => r.body).join(' ')).match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)
    expect(colors).toBeNull()
  })

  it('o bloco desktop antigo do Dashboard (.dashboard-heading ~ ...) saiu do desktop; o legado de tablet/mobile fica', () => {
    const desktopBlocks = [...css.matchAll(/@media \(min-width: 1041px\) \{/g)].map((m) => bodyAfter(css.slice(m.index), DESKTOP_MEDIA))
    for (const block of desktopBlocks) expect(block).not.toContain('.dashboard-heading ~')
    expect(css).toContain('.dashboard-heading .dashboard-bar-inline')
  })

  it('reduce desktop: a entrada das secoes entra no bloco existente (fade de 150 ms)', () => {
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(tail).toContain('.surface--dashboard .dash-rise')
  })
})

describe('F4a - valores do mock (Dashboard.dc.html)', () => {
  it('raiz sem cartao externo, gap 22; cabecalho: eyebrow mono 11/600 1.5px, titulo Sora 30/700 -0.02em', () => {
    expectF4a('.surface.surface--dashboard', ['padding: 0', 'gap: 22px', 'border: 0', 'background: none', 'box-shadow: none'])
    expectF4a('.surface--dashboard .dash-head__eyebrow', [
      'font-family: var(--font-mono)',
      'font-size: 11px',
      'font-weight: 600',
      'letter-spacing: 1.5px',
      'text-transform: uppercase',
      'color: var(--primary-700)',
    ])
    expectF4a('.surface--dashboard .dash-head h2', [
      'font-family: var(--font-heading)',
      'font-size: 30px',
      'font-weight: 700',
      'letter-spacing: -0.02em',
    ])
  })

  it('pilula da barra: 36px, raio 99, 13/700, ponto 8px; tons por token', () => {
    expectF4a('.surface--dashboard .dash-bar', ['height: 36px', 'padding: 0 14px', 'border-radius: 99px', 'font-size: 13px', 'font-weight: 700'])
    expectF4a('.surface--dashboard .dash-bar__dot', ['width: 8px', 'height: 8px'])
    expectF4a('.surface--dashboard .dash-bar--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF4a('.surface--dashboard .dash-bar--warn .dash-bar__dot', ['background: var(--warning)'])
  })

  it('KPIs: grid auto-fit 180/gap 14; card 18/20, raio 18; rotulo 13/600; valor Sora 40/700 lh 1.05; nota 12/600', () => {
    expectF4a('.surface--dashboard .dash-kpis', ['grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))', 'gap: 14px'])
    expectF4a('.surface--dashboard .dash-kpis .stat-card.dash-kpi', ['padding: 18px 20px', 'border-radius: 18px', 'gap: 6px', 'box-shadow: var(--shadow-sm)', 'transform: none'])
    expectF4a('.surface--dashboard .dash-kpi .stat-card__label', ['font-size: 13px', 'font-weight: 600', 'color: var(--ink-soft)'])
    expectF4a('.surface--dashboard .dash-kpi .stat-card__value', [
      'font-family: var(--font-heading)',
      'font-size: 40px',
      'font-weight: 700',
      'letter-spacing: -0.02em',
      'line-height: 1.05',
      'font-variant-numeric: tabular-nums',
    ])
    expectF4a('.surface--dashboard .dash-kpi--alert .stat-card__value', ['color: var(--danger-700)'])
    expectF4a('.surface--dashboard .dash-kpi .stat-card__note', ['font-size: 12px', 'font-weight: 600'])
    expectF4a('.surface--dashboard .dash-kpi .stat-card__note--success', ['color: var(--success-700)'])
    expectF4a('.surface--dashboard .dash-kpi .stat-card__note--warning', ['color: var(--warning-700)'])
    expectF4a('.surface--dashboard .dash-kpi .stat-card__note--danger', ['color: var(--danger-700)'])
  })

  it('cartoes: raio 22, padding 22, titulo Sora 20/700 -0.01em; grade 2 colunas minmax(min(100%, 400px), 1fr) gap 20', () => {
    expectF4a('.surface--dashboard .dash-card', ['padding: 22px', 'border-radius: 22px', 'gap: 14px', 'box-shadow: var(--shadow-sm)'])
    expectF4a('.surface--dashboard .dash-card h3', ['font-family: var(--font-heading)', 'font-size: 20px', 'font-weight: 700', 'letter-spacing: -0.01em'])
    expectF4a('.surface--dashboard .dash-card__link', ['font-size: 13px', 'font-weight: 700', 'color: var(--link-color)'])
    expectF4a('.surface--dashboard .dash-grid', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr))', 'gap: 20px', 'align-items: start'])
  })

  it('chegada: grid 52px/1fr/auto gap 14, padding 12/14, raio 14, fundo --surface-alt; hover so troca sombra e borda em 200 ms', () => {
    expectF4a('.surface--dashboard .dash-arrival', [
      'grid-template-columns: 52px minmax(0, 1fr) auto',
      'gap: 14px',
      'padding: 12px 14px',
      'border-radius: 14px',
      'background: var(--surface-alt)',
    ])
    expect(f4aDecls('.surface--dashboard .dash-arrival')).toContain('box-shadow var(--dur-base) var(--ease-out)')
    expect(f4aDecls('.surface--dashboard .dash-arrival')).toContain('border-color var(--dur-base) var(--ease-out)')
    expectF4a('.surface--dashboard .dash-arrival:hover', ['border-color: var(--border-strong)', 'box-shadow: var(--shadow-md)'])
    expect(f4aDecls('.surface--dashboard .dash-arrival:hover')).not.toContain('transform')
    expect(f4aDecls('.surface--dashboard .dash-arrival:focus-visible')).toContain('var(--focus-ring)')
  })

  it('ladrilho de data (mes mono 10/600, dia Sora 18/700 lh 1.1), nome 14/700, PO mono 11, previsao 12, tag 26px', () => {
    expectF4a('.surface--dashboard .dash-arrival__tile', ['padding: 6px 0', 'border-radius: 10px', 'background: var(--surface)'])
    expectF4a('.surface--dashboard .dash-arrival__month', ['font-family: var(--font-mono)', 'font-size: 10px', 'font-weight: 600'])
    expectF4a('.surface--dashboard .dash-arrival__day', ['font-family: var(--font-heading)', 'font-size: 18px', 'font-weight: 700', 'line-height: 1.1'])
    expectF4a('.surface--dashboard .dash-arrival__name', ['font-size: 14px', 'font-weight: 700', 'text-overflow: ellipsis', 'white-space: nowrap'])
    expectF4a('.surface--dashboard .dash-arrival__meta', ['font-family: var(--font-mono)', 'font-size: 11px'])
    expectF4a('.surface--dashboard .dash-arrival__delivery', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF4a('.surface--dashboard .dash-arrival__aside .process-derived-status-badge', ['height: 26px', 'padding: 0 10px', 'font-size: 12px', 'font-weight: 700', 'text-transform: none'])
    expectF4a('.surface--dashboard .dash-arrivals__list', ['max-height: 440px', 'overflow-y: auto'])
  })

  it('comunicados: destaque --info-50 (raio 14, padding 16), eyebrow mono 10 --info-700, titulo 15/700, resumo 13/1.55; linhas 11 + 14/600 com divisor', () => {
    expectF4a('.surface--dashboard .dash-announce--lead', ['padding: 16px', 'border-radius: 14px', 'background: var(--info-50)', 'gap: 6px'])
    expectF4a('.surface--dashboard .dash-announce__eyebrow', ['font-family: var(--font-mono)', 'font-size: 10px', 'font-weight: 600', 'letter-spacing: 1.5px', 'color: var(--info-700)'])
    expectF4a('.surface--dashboard .dash-announce--lead .dash-announce__title', ['font-size: 15px', 'font-weight: 700', 'line-height: 1.4'])
    expectF4a('.surface--dashboard .dash-announce__summary', ['font-size: 13px', 'line-height: 1.55'])
    expectF4a('.surface--dashboard .dash-announce--row', ['padding: 12px 4px 4px', 'border-top: 1px solid var(--row-divider)'])
    expectF4a('.surface--dashboard .dash-announce__when', ['font-size: 11px', 'color: var(--ink-soft)'])
    expectF4a('.surface--dashboard .dash-announce--row .dash-announce__title', ['font-size: 14px', 'font-weight: 600', 'line-height: 1.4'])
  })

  it('favoritos: grade minmax(min(100%, 340px), 1fr) gap 14; cartao 18/raio 16/--surface-alt; estrela 44 --warning-50; barra de 6px; 3 fatos', () => {
    expectF4a('.surface--dashboard .dash-favorites__grid', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr))', 'gap: 14px'])
    expectF4a('.surface--dashboard .dash-fav', ['padding: 18px', 'border-radius: 16px', 'background: var(--surface-alt)', 'gap: 12px'])
    expectF4a('.surface--dashboard .dash-fav:hover', ['border-color: var(--border-strong)', 'box-shadow: var(--shadow-md)'])
    expectF4a('.surface--dashboard .dash-fav__eyebrow', ['font-family: var(--font-mono)', 'font-size: 11px', 'letter-spacing: 1.5px', 'color: var(--primary-700)'])
    expectF4a('.surface--dashboard .dash-fav__eta--updated', ['color: var(--info-700)'])
    expectF4a('.surface--dashboard .dash-fav__name', ['font-size: 16px', 'font-weight: 700'])
    expectF4a('.surface--dashboard .dash-fav__star', ['width: 44px', 'height: 44px', 'border-radius: 12px', 'background: var(--warning-50)'])
    expectF4a('.surface--dashboard .dash-fav__star svg', ['fill: var(--channel-yellow-edge)', 'stroke: var(--warning-700)'])
    expectF4a('.surface--dashboard .dash-stages', ['grid-template-columns: repeat(5, minmax(0, 1fr))', 'gap: 6px'])
    expectF4a('.surface--dashboard .dash-stages__bar', ['height: 6px', 'border-radius: 99px', 'background: var(--row-divider)'])
    expectF4a('.surface--dashboard .dash-stages__item--done .dash-stages__bar', ['background: var(--primary-700)'])
    expectF4a('.surface--dashboard .dash-stages__item--now .dash-stages__bar', ['background: var(--primary)'])
    // escuro: concluida != atual (nos dois temas --primary-700 / --primary sao o mesmo menta no dark)
    expect(f4aDecls("[data-theme='dark'] .surface--dashboard .dash-stages__item--done .dash-stages__bar")).toContain(
      'color-mix(in srgb, var(--primary) 55%, var(--surface-alt))',
    )
    expectF4a('.surface--dashboard .dash-stages__label', ['font-size: 11px', 'font-weight: 500'])
    expectF4a('.surface--dashboard .dash-stages__item--now .dash-stages__label', ['font-weight: 700'])
    expectF4a('.surface--dashboard .dash-facts', ['grid-template-columns: repeat(3, minmax(0, 1fr))', 'gap: 8px', 'padding-top: 10px', 'border-top: 1px solid var(--row-divider)'])
    expectF4a('.surface--dashboard .dash-facts__item dt', ['font-size: 11px', 'color: var(--ink-soft)'])
    expectF4a('.surface--dashboard .dash-facts__item dd', ['font-size: 13px', 'font-weight: 700', 'overflow-wrap: break-word'])
    // valor longo ocupa a linha inteira (3 colunas continuam para os curtos)
    expectF4a('.surface--dashboard .dash-facts__item--wide', ['grid-column: 1 / -1'])
    expectF4a('.surface--dashboard .dash-fav__tags .process-derived-status-badge', ['height: 26px', 'font-size: 12px', 'text-transform: none'])
    expect(f4aDecls('.surface--dashboard .dash-facts__item dd')).not.toContain('anywhere')
  })

  it('entrada: dash-rise = motion-rise 500 ms com atraso por variavel (0/80/160 ms no JSX)', () => {
    expect(f4aDecls('.surface--dashboard .dash-rise')).toContain('animation: motion-rise var(--dur-page) var(--ease-out) both')
    expect(f4aDecls('.surface--dashboard .dash-rise')).toContain('animation-delay: var(--dash-rise-delay, 0ms)')
    expect(read('src/pages/DashboardPage.jsx')).toContain("'--dash-rise-delay': '80ms'")
    expect(read('src/pages/DashboardPage.jsx')).toContain("'--dash-rise-delay': '160ms'")
  })

  it('notebook (altura <= 800): compacta KPIs e cartoes e mantem o gap por vh', () => {
    expectF4a('.surface.surface--dashboard', ['gap: clamp(12px, 2.2vh, 18px)'], f4aCompactRules)
    expectF4a('.surface--dashboard .dash-kpi .stat-card__value', ['font-size: 32px'], f4aCompactRules)
    expectF4a('.surface--dashboard .dash-kpis .stat-card.dash-kpi', ['padding: 12px 16px'], f4aCompactRules)
  })
})

describe('F4a - JSX/markup', () => {
  // arquivos CRLF no Windows; comentarios de linha/bloco ficam fora das asserts de "nao contem".
  const readLf = (rel) => read(rel).replace(/\r\n/g, '\n')
  const noComments = (s) => stripComments(s).replace(/^\s*\/\/.*$/gm, '')
  const dashboard = readLf('src/pages/DashboardPage.jsx')
  const weekly = readLf('src/features/processes/WeeklyArrivalsCard.jsx')
  const statCard = readLf('src/components/StatCard.jsx')

  it('raiz .surface--dashboard e escolha desktop/legado por matchMedia (sem DOM duplicado)', () => {
    expect(dashboard).toContain('className="surface surface--dashboard"')
    expect(dashboard).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(dashboard).toContain('useMediaQuery(DESKTOP_QUERY)')
    expect(readLf('src/hooks/useMediaQuery.js')).toContain('export default function useMediaQuery(query)')
    expect(dashboard).toContain('if (isDesktop) {')
    // a arvore legada continua la, intacta
    expect(dashboard).toContain('className="section-heading dashboard-heading"')
    expect(dashboard).toContain('className="dashboard-stat-row"')
  })

  it('mobile-redesign.css segue sem o desktop novo e sem alteracao', () => {
    expect(read('src/mobile-redesign.css')).not.toContain('dash-')
    expect(read('src/mobile-redesign.css')).not.toContain('surface--dashboard')
  })

  it('ordem desktop do mock (Chegadas, Comunicados, Favoritos) no JSX', () => {
    const at = (needle) => dashboard.indexOf(needle)
    expect(at('<WeeklyArrivalsCard\n            variant="desktop"')).toBeGreaterThan(0)
    expect(at('<AnnouncementsPanel')).toBeGreaterThan(at('<WeeklyArrivalsCard\n            variant="desktop"'))
    expect(at('id="dash-favorites-title"')).toBeGreaterThan(at('<AnnouncementsPanel'))
  })

  it('StatCard ganhou note/noteTone e a nota do desktop (D12) vem de dashboardKpis', () => {
    expect(statCard).toContain('noteTone')
    expect(statCard).toContain('stat-card__note')
    expect(dashboard).toContain('getDashboardKpiNotes')
    expect(dashboard).toContain('getPreviousWeekArrivalsCount')
  })

  it('datas curtas sem toISOString (BRT) e dois calendarios de coleta (legado + janelas)', () => {
    expect(noComments(weekly)).not.toMatch(/toISOString\(\)/)
    expect(noComments(dashboard)).not.toMatch(/toISOString\(\)/)
    expect(dashboard).toContain('getCollectionWindows(item)')
    expect(weekly).toContain('entry.windows')
  })

  it('comunicado: resumo de 140 caracteres (D10) e favorito mantem selos de carga e DUIMP', () => {
    expect(dashboard).toContain('summarizeAnnouncement(lead.content)')
    expect(dashboard).toContain('getCargoHazardBadges(item)')
    expect(dashboard).toContain("label: 'DUIMP'")
  })
})

// ---------------------------------------------------------------------------
// F4b - Chegadas (Chegadas.dc.html). Arvore propria no desktop (chg-*,
// ProcessListDesktop.jsx), escolhida por matchMedia; tablet/mobile ficam na
// arvore legada. CSS = uma secao "REFINO VISUAL F4b — CHEGADAS" com UM @media
// desktop (+ o desktop estreito e o compacto de notebook), toda regra sob a raiz
// `.process-list-card` (ou `.surface.surface--arrivals`).
// ---------------------------------------------------------------------------
const F4B_MARKER = 'REFINO VISUAL F4b — CHEGADAS (Chegadas.dc.html'
const F4B_COMPACT_MARKER = 'REFINO VISUAL F4b — CHEGADAS COMPACTO'
const f4bAt = css.indexOf(F4B_MARKER)
const f4bStart = css.lastIndexOf('/*', f4bAt)
const f4bCompactAt = css.indexOf(F4B_COMPACT_MARKER)
const f4bNarrowAt = css.indexOf('/* Desktop estreito (1041-1279px)')
const f4bRegionEnd = css.lastIndexOf('/*', css.indexOf(F4A_MARKER))
const f4bMainBody = bodyAfter(stripComments(css.slice(f4bStart, f4bNarrowAt)), DESKTOP_MEDIA)
const f4bRules = parseRules(f4bMainBody)
const f4bNarrowRules = parseRules(
  bodyAfter(stripComments(css.slice(f4bNarrowAt, f4bCompactAt)), '@media (min-width: 1041px) and (max-width: 1279px) {'),
)
const f4bCompactRules = parseRules(
  bodyAfter(
    stripComments(css.slice(f4bCompactAt, f4bRegionEnd)),
    '@media (min-width: 1041px) and (max-height: 800px) {',
  ),
)

function f4bDecls(selector, rules = f4bRules) {
  const bodies = rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F4b: ${selector}`).toBeGreaterThan(0)
  return bodies.join(' ')
}

function expectF4b(selector, declarations, rules) {
  const body = f4bDecls(selector, rules)
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F4b - secao, escopo e ordem', () => {
  it('a secao existe, vem antes da F4a e do bloco reduce desktop; o antigo ciclo 2b saiu', () => {
    expect(f4bAt).toBeGreaterThan(0)
    expect(f4bCompactAt).toBeGreaterThan(f4bAt)
    expect(f4bRegionEnd).toBeGreaterThan(f4bCompactAt)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f4bRegionEnd)
    expect(css).not.toContain('Ciclo 2b (redesign Fase 2)')
    const before = stripComments(css.slice(f4bStart, css.indexOf(DESKTOP_MEDIA, f4bAt)))
    expect(before.trim(), 'nada fora do @media na secao principal').toBe('')
    expect(f4bMainBody).not.toMatch(/@media/)
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(tail.match(/@media/g)).toHaveLength(1)
  })

  it('so a secao tem max-width (1279, desktop estreito); toda regra comeca pela raiz da tela', () => {
    const whole = stripComments(css.slice(f4bStart, f4bRegionEnd))
    const maxWidths = [...whole.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]))
    expect(maxWidths).toEqual([1279])
    const ROOT = /^(\[data-theme='dark'\] )?(\.surface\.surface--arrivals|\.process-list-card)/
    for (const rule of [...f4bRules, ...f4bNarrowRules, ...f4bCompactRules]) {
      for (const selector of rule.selectors) expect(selector, `seletor sem a raiz: ${selector}`).toMatch(ROOT)
    }
  })

  it('sem hex/rgb literal: so tokens (var(--...))', () => {
    const all = [...f4bRules, ...f4bNarrowRules, ...f4bCompactRules].map((r) => r.body).join(' ')
    expect(all.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)).toBeNull()
  })

  it('o bloco legado (.process-item, tablet/mobile) segue la; o desktop nao o reestiliza', () => {
    expect(css).toContain('.process-list-card .process-item__summary')
    expect(css).toContain('.chegadas-mobilebar')
    for (const rule of f4bRules) for (const selector of rule.selectors) expect(selector).not.toContain('.process-item')
  })

  it('notebook.css e mobile-redesign.css nao ganharam o desktop novo', () => {
    expect(read('src/notebook.css')).not.toContain('chg-')
    expect(read('src/mobile-redesign.css')).not.toContain('chg-')
    expect(read('src/mobile-redesign.css')).not.toContain('surface--arrivals')
  })
})

describe('F4b - valores do mock (Chegadas.dc.html)', () => {
  it('raiz sem cartao externo, gap 18; cabecalho: eyebrow mono 11/600 1.5px, h2 Sora 30/700 -0.02em', () => {
    expectF4b('.surface.surface--arrivals', ['padding: 0', 'gap: 18px', 'border: 0', 'background: none', 'box-shadow: none'])
    expectF4b('.process-list-card.process-list-card--desktop', ['display: flex', 'flex-direction: column', 'gap: 18px', 'padding: 0', 'background: none'])
    expectF4b('.process-list-card .chg-head', ['display: flex', 'flex-wrap: wrap', 'align-items: flex-end', 'justify-content: space-between', 'gap: 12px'])
    expectF4b('.process-list-card .chg-head__eyebrow', [
      'font-family: var(--font-mono)',
      'font-size: 11px',
      'font-weight: 600',
      'letter-spacing: 1.5px',
      'text-transform: uppercase',
      'color: var(--primary-700)',
    ])
    expectF4b('.process-list-card .chg-head h2', [
      'font-family: var(--font-heading)',
      'font-size: 30px',
      'font-weight: 700',
      'letter-spacing: -0.02em',
    ])
  })

  it('botoes de acao: 44px, 14/700, gap 8, paddings 14/16/18 do mock', () => {
    expectF4b('.process-list-card .chg-head__actions', ['display: flex', 'flex-wrap: wrap', 'gap: 8px'])
    expectF4b('.process-list-card .chg-btn', ['height: 44px', 'padding: 0 16px', 'font-size: 14px', 'font-weight: 700', 'gap: 8px', 'align-items: center'])
    expectF4b('.process-list-card .chg-btn--archived', ['padding: 0 14px'])
    expectF4b('.process-list-card .chg-btn--new', ['padding: 0 18px'])
  })

  it('painel de filtros: grid 2fr + 3 colunas, gap 12, padding 16, raio 18, borda --border', () => {
    expectF4b('.process-list-card .chg-filters', [
      'display: grid',
      'grid-template-columns: minmax(260px, 2fr) minmax(160px, 1fr) minmax(250px, 1.3fr) minmax(160px, 1fr)',
      'gap: 12px',
      'padding: 16px',
      'border: 1px solid var(--border)',
      'border-radius: 18px',
      'background: var(--surface)',
    ])
    expectF4b('.process-list-card .chg-field', ['display: flex', 'flex-direction: column', 'gap: 6px'])
    expectF4b('.process-list-card .chg-field > label', ['font-size: 12px', 'font-weight: 700'])
  })

  it('campos 44px raio 10 borda 1.5px; busca/periodo em --border-control, selects navy (mock); foco com halo', () => {
    expectF4b('.process-list-card .chg-search', ['display: flex', 'align-items: center', 'height: 44px', 'border: 1.5px solid var(--border-control)', 'border-radius: 10px', 'gap: 8px', 'padding: 0 12px'])
    expectF4b('.process-list-card .chg-search:focus-within', ['border-color: var(--focus-ring)', 'box-shadow: 0 0 0 4px var(--primary-a28)'])
    expectF4b('.process-list-card .chg-search input', ['font-size: 14px', 'font-weight: 500', 'background: transparent', 'outline: none'])
    expectF4b('.process-list-card .chg-select', ['height: 44px', 'padding: 0 12px', 'border: 1.5px solid var(--chg-line)', 'border-radius: 10px', 'font-size: 14px', 'font-weight: 600'])
    expectF4b('.process-list-card .chg-select:hover:not(:disabled):not(:focus)', ['border: 1.5px solid var(--chg-line)'])
    expectF4b('.process-list-card.process-list-card--desktop', ['--chg-line: var(--navy)'])
    expectF4b("[data-theme='dark'] .process-list-card.process-list-card--desktop", ['--chg-line: var(--primary)'])
    // D19: periodo de ETA = 2 datas num unico contorno mono 14/500
    expectF4b('.process-list-card .chg-range', ['height: 44px', 'border: 1.5px solid var(--border-control)', 'border-radius: 10px', 'font-family: var(--font-mono)', 'font-size: 14px', 'font-weight: 500'])
    expectF4b('.process-list-card .chg-range__input', ['border: 0', 'background: transparent', 'min-width: 0'])
  })

  it('chips ativos: gap 8, contador "X de Y" a direita 13px --ink-soft', () => {
    expectF4b('.process-list-card .chg-chips', ['gap: 8px', 'margin: 0'])
    expectF4b('.process-list-card .chg-chips__count', ['margin-left: auto', 'font-size: 13px', 'color: var(--ink-soft)'])
    expectF4b('.process-list-card .chg-list', ['display: flex', 'flex-direction: column', 'gap: 10px'])
  })

  it('cartao da linha: grid 1fr auto auto, gap 20, padding 16/16/16/20, raio 16, --shadow-sm -> hover --shadow-md + --border-strong', () => {
    expectF4b('.process-list-card .chg-row', [
      'display: grid',
      'grid-template-columns: minmax(0, 1fr) auto auto',
      'gap: 20px',
      'align-items: center',
      'padding: 16px 16px 16px 20px',
      'border: 1px solid var(--border)',
      'border-radius: 16px',
      'background: var(--surface)',
      'box-shadow: var(--shadow-sm)',
    ])
    const body = f4bDecls('.process-list-card .chg-row')
    expect(body).toContain('box-shadow var(--dur-base) var(--ease-out)')
    expect(body).toContain('border-color var(--dur-base) var(--ease-out)')
    expectF4b('.process-list-card .chg-row:hover', ['border-color: var(--border-strong)', 'box-shadow: var(--shadow-md)'])
    // o card NAO levanta (sem transform no hover)
    expect(f4bDecls('.process-list-card .chg-row:hover')).not.toContain('transform')
    expectF4b('.process-list-card .chg-row--selected', ['border-color: var(--chg-line)'])
  })

  it('nome 16/700, PO mono 12, destino 13, chips 6px de gap; neutro/warn/danger por token', () => {
    expectF4b('.process-list-card .chg-row__main', ['display: flex', 'flex-direction: column', 'gap: 8px', 'min-width: 0', 'text-align: left'])
    expectF4b('.process-list-card .chg-row__title', ['display: flex', 'flex-wrap: wrap', 'align-items: baseline', 'gap: 10px'])
    expectF4b('.process-list-card .chg-row__name', ['font-size: 16px', 'font-weight: 700'])
    expectF4b('.process-list-card .chg-row__po', ['font-family: var(--font-mono)', 'font-size: 12px', 'color: var(--ink-soft)'])
    expectF4b('.process-list-card .chg-row__dest', ['font-size: 13px', 'color: var(--ink-soft)'])
    expectF4b('.process-list-card .chg-row__dest strong', ['font-weight: 600', 'color: var(--ink)'])
    expectF4b('.process-list-card .chg-row__chips', ['display: flex', 'flex-wrap: wrap', 'gap: 6px'])
    expectF4b('.process-list-card .chg-row__chips .inline-badge', ['background: var(--neutral-50)', 'color: var(--neutral-700)'])
    expectF4b('.process-list-card .chg-row__chips .inline-badge--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF4b('.process-list-card .chg-row__chips .inline-badge--danger', ['background: var(--danger-50)', 'color: var(--danger-700)'])
  })

  it('datas: 3 colunas de 104px gap 12; rotulo 11/600, valor mono 14/600; ETA atualizada em --info-50/--info-700 (D14)', () => {
    expectF4b('.process-list-card .chg-row__dates', ['display: grid', 'grid-template-columns: repeat(3, 104px)', 'gap: 12px'])
    expectF4b('.process-list-card .chg-date', ['display: flex', 'flex-direction: column', 'gap: 2px'])
    expectF4b('.process-list-card .chg-date--eta', ['padding: 4px 8px', 'margin: -4px -8px', 'border-radius: 8px'])
    expectF4b('.process-list-card .chg-date--updated', ['background: var(--info-50)'])
    expectF4b('.process-list-card .chg-date--updated .chg-date__label', ['color: var(--info-700)'])
    expectF4b('.process-list-card .chg-date__label', ['font-size: 11px', 'font-weight: 600', 'color: var(--ink-soft)'])
    expectF4b('.process-list-card .chg-date__value', ['font-family: var(--font-mono)', 'font-size: 14px', 'font-weight: 600', 'font-variant-numeric: tabular-nums'])
  })

  it('acoes 44x44 raio 12: favorito com --warning-50, estrela --channel-yellow-edge / --warning-700, hover --disabled-bg', () => {
    expectF4b('.process-list-card .chg-row__actions', ['grid-column: 3', 'display: flex', 'gap: 4px'])
    expectF4b('.process-list-card .chg-icon-button', ['width: 44px', 'height: 44px', 'border-radius: 12px', 'background: transparent', 'color: var(--ink-soft)'])
    expectF4b('.process-list-card .chg-icon-button:hover', ['background-color: var(--disabled-bg)'])
    expectF4b('.process-list-card .chg-icon-button--on', ['background-color: var(--warning-50)'])
    expectF4b('.process-list-card .chg-icon-button--on .chg-star', ['fill: var(--channel-yellow-edge)', 'stroke: var(--warning-700)'])
    expect(f4bDecls('.process-list-card .chg-icon-button')).toContain('background-color var(--dur-base) var(--ease-out)')
  })

  it('foco visivel (anel duplo) nos botoes de acao e no bloco principal', () => {
    for (const selector of ['.process-list-card .chg-row__main:focus-visible', '.process-list-card .chg-icon-button:focus-visible']) {
      expectF4b(selector, ['box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--focus-ring)'])
    }
  })

  it('desktop estreito: busca em linha inteira; compacto de notebook: menos respiro', () => {
    expectF4b('.process-list-card .chg-field--search', ['grid-column: 1 / -1'], f4bNarrowRules)
    expectF4b('.process-list-card .chg-filters', ['grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr)'], f4bNarrowRules)
    expectF4b('.process-list-card .chg-row', ['padding: 12px 14px 12px 18px'], f4bCompactRules)
    expectF4b('.process-list-card .chg-filters', ['padding: 12px'], f4bCompactRules)
  })

  it('carregando: o skeleton da lista ganha a moldura da linha (surface + borda + --shadow-sm)', () => {
    expectF4b('.process-list-card .chg-skeletons .process-card-skeleton', ['border: 1px solid var(--border)', 'background: var(--surface)', 'box-shadow: var(--shadow-sm)'])
  })
})

describe('F4b - JSX/markup', () => {
  const readLf = (rel) => read(rel).replace(/\r\n/g, '\n')
  const noComments = (s) => stripComments(s).replace(/^\s*\/\/.*$/gm, '')
  const desktop = readLf('src/features/processes/ProcessListDesktop.jsx')
  const view = readLf('src/features/processes/ProcessListView.jsx')
  const page = readLf('src/pages/ProcessesPage.jsx')

  it('o ListView escolhe a arvore por matchMedia (useMediaQuery) e a legada continua intacta', () => {
    expect(view).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(view).toContain('useMediaQuery(DESKTOP_QUERY)')
    expect(view).toContain('if (isDesktop && !isMobile) {')
    expect(view).toContain('className="chegadas-mobilebar"')
    expect(view).toContain('className={`list-card process-list-card')
    expect(view).toContain('<ProcessListDesktop')
  })

  it('a pagina troca o cabecalho so no desktop da lista (surface--arrivals) e passa totalCount', () => {
    expect(page).toContain("useMediaQuery('(min-width: 1041px)')")
    // F4d: `showList` = lista OU lista atras do modal de criacao
    expect(page).toContain('const isDesktopList = isDesktopLayout && showList')
    expect(page).toContain("' surface--arrivals'")
    expect(page).toContain('totalCount={processes.length - archivedProcesses.length}')
  })

  it('h2 "Fila de chegadas", 4 acoes na ordem do mock e filtros com rotulos associados', () => {
    expect(desktop).toContain('<h2>Fila de chegadas</h2>')
    const at = (needle) => desktop.indexOf(needle)
    expect(at('Arquivados (')).toBeLessThan(at('Exportar ('))
    expect(at('Exportar (')).toBeLessThan(at('Importar do DBCorp'))
    expect(at('Importar do DBCorp')).toBeLessThan(at('Novo processo'))
    expect(desktop).toContain('htmlFor={ids.search}')
    expect(desktop).toContain('aria-label="Filtros"')
    expect(desktop).toContain('aria-label="ETA de"')
    expect(desktop).toContain('aria-label="ETA até"')
    expect(desktop).toContain('isAdmin ? <option value="Dados pendentes">')
  })

  it('botoes migrados: secundario navy (.secondary-button), primario menta, Arquivados fantasma', () => {
    expect(desktop).toMatch(/secondary-button chg-btn chg-btn--export/)
    expect(desktop).toMatch(/secondary-button chg-btn chg-btn--import/)
    expect(desktop).toMatch(/primary-button chg-btn chg-btn--new/)
    expect(desktop).toMatch(/ghost-button chg-btn chg-btn--archived/)
    expect(desktop).not.toContain('ghost-button--secondary')
  })

  it('alertas: no maximo 2 + "+N"; datas curtas sem toISOString; ETA atualizada; previsao pela mesma regra', () => {
    expect(desktop).toContain('alerts.slice(0, 2)')
    expect(desktop).toContain('alerts.slice(2)')
    expect(desktop).toContain("etaUpdated ? 'ETA atualizada' : 'ETA'")
    expect(desktop).toContain('Entrega prev.')
    expect(noComments(desktop)).not.toMatch(/toISOString\(\)/)
    expect(desktop).toContain('getEstimatedDeliveryKey(item)')
  })

  it('mascara de nome e estrela com mola reaproveitadas dos modulos existentes', () => {
    expect(desktop).toContain('getProcessTitle(item, canSeeName)')
    expect(desktop).toContain('getProcessSubtitle(item, canSeeName)')
    expect(desktop).toContain('useActivationPop(Boolean(isFavorite))')
    expect(desktop).toContain('favorite-star--pop')
    expect(desktop).toContain('<Stagger className="chg-list">')
  })

  it('ordem de severidade dos alertas e a mesma nas duas arvores (processListShared)', () => {
    expect(desktop).toContain('buildProcessAlerts(item, isAdmin)')
    expect(view).toContain('buildProcessAlerts(item, isAdmin)')
    const shared = readLf('src/features/processes/processListShared.js')
    expect(shared.indexOf("label: 'Anuência indeferida'")).toBeLessThan(shared.indexOf("label: 'Carga inflamável'"))
    expect(shared.indexOf("label: 'Carga inflamável'")).toBeLessThan(shared.indexOf('label: `Dados pendentes'))
  })
})

// ---------------------------------------------------------------------------
// F4c - Detalhe do processo (Processo.dc.html). Arvore propria no desktop (pdv-*,
// ProcessDetailDesktop.jsx + miolo das abas), escolhida por matchMedia; tablet e
// mobile ficam na arvore legada. CSS = uma secao "REFINO VISUAL F4c — DETALHE DO
// PROCESSO" com UM @media desktop (+ o compacto de notebook), toda regra sob a raiz
// `.process-detail-view` (ou `.surface.surface--process-detail`).
// ---------------------------------------------------------------------------
const F4C_MARKER = 'REFINO VISUAL F4c — DETALHE DO PROCESSO (Processo.dc.html'
const F4C_COMPACT_MARKER = 'REFINO VISUAL F4c — DETALHE COMPACTO'
const f4cAt = css.indexOf(F4C_MARKER)
const f4cStart = css.lastIndexOf('/*', f4cAt)
const f4cCompactAt = css.indexOf(F4C_COMPACT_MARKER)
const f4cCompactStart = css.lastIndexOf('/*', f4cCompactAt)
const f4cEnd = css.lastIndexOf('/*', css.indexOf('REFINO VISUAL F4d — FORMULARIO DE PROCESSO EM MODAL'))
const f4cMainBody = bodyAfter(stripComments(css.slice(f4cStart, f4cCompactAt)), DESKTOP_MEDIA)
const f4cRules = parseRules(f4cMainBody)
const f4cCompactRules = parseRules(
  bodyAfter(stripComments(css.slice(f4cCompactAt, f4cEnd)), '@media (min-width: 1041px) and (max-height: 800px) {'),
)

function f4cDecls(selector, rules = f4cRules) {
  const bodies = rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F4c: ${selector}`).toBeGreaterThan(0)
  return bodies.join(' ')
}

function expectF4c(selector, declarations, rules) {
  const body = f4cDecls(selector, rules)
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F4c - secao, escopo e ordem', () => {
  it('a secao existe, vem antes do bloco reduce desktop, tem UM @media desktop (+ o compacto) e so keyframes fora dele', () => {
    expect(f4cAt).toBeGreaterThan(0)
    expect(f4cCompactAt).toBeGreaterThan(f4cAt)
    expect(f4cEnd).toBeGreaterThan(f4cCompactAt)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f4cEnd)
    const before = stripComments(css.slice(f4cStart, css.indexOf(DESKTOP_MEDIA, f4cAt)))
    expect(before.trim(), 'nada fora do @media antes do bloco principal').toBe('')
    expect(f4cMainBody).not.toMatch(/@media/)
    const outside = stripComments(css.slice(f4cStart, f4cCompactStart)).replace(f4cMainBody, '')
    expect(
      outside
        .replace(/@media \(min-width: 1041px\) \{\s*\}/, '')
        .replace(/@keyframes pdv-panel-in \{[\s\S]*?\n\}\n/, '')
        .trim()
    ).toBe('')
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(tail.match(/@media/g)).toHaveLength(1)
  })

  it('nenhum @media (max-width) e toda regra comeca pela raiz .process-detail-view (ou a pagina .surface--process-detail)', () => {
    const whole = stripComments(css.slice(f4cStart, f4cEnd))
    expect(whole).not.toMatch(/@media\s*\(max-width/)
    const ROOT = /^(\[data-theme='dark'\] )?(\.process-detail-view|\.surface\.surface--process-detail)/
    for (const rule of [...f4cRules, ...f4cCompactRules]) {
      for (const selector of rule.selectors) expect(selector, `seletor sem a raiz: ${selector}`).toMatch(ROOT)
    }
  })

  it('sem hex: so tokens (a unica cor literal e a sombra da aba ativa do mock)', () => {
    const all = [...f4cRules, ...f4cCompactRules].map((r) => r.body).join(' ')
    expect(all.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
    expect(all.match(/rgba?\([^)]*\)/g)).toEqual(['rgba(0, 65, 83, 0.14)'])
  })

  it('o miolo desktop legado (timeline por segmento, abas pilula, grid de 2 colunas do cabecalho) saiu', () => {
    const desktopBlocks = [...css.matchAll(/@media \(min-width: 1041px\) \{/g)].map((m) => bodyAfter(css.slice(m.index), DESKTOP_MEDIA))
    for (const block of desktopBlocks) {
      expect(block).not.toContain('.process-detail-view .process-timeline')
      expect(block).not.toContain('.process-detail-view .detail-tab-row')
      expect(block).not.toContain('.process-detail-view > .process-detail-card-heading')
    }
    // o legado de tablet/mobile fica
    expect(css).toContain('.process-timeline__node--now')
  })

  it('notebook.css e mobile-redesign.css nao ganharam o desktop novo', () => {
    expect(read('src/notebook.css')).not.toContain('pdv-')
    expect(read('src/mobile-redesign.css')).not.toContain('pdv-')
    expect(read('src/mobile-redesign.css')).not.toContain('surface--process-detail')
  })

  it('reduce desktop: preenchimento, pontos e entrada do painel viram fade de 150 ms no bloco existente', () => {
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    for (const selector of [
      '.process-detail-view .pdv-timeline__fill',
      '.process-detail-view .pdv-stage--done .pdv-stage__node',
      '.process-detail-view .pdv-stage--now .pdv-stage__node',
      '.process-detail-view .pdv-panel',
    ]) {
      expect(tail, selector).toContain(selector)
    }
  })
})

describe('F4c - cabecalho, timeline e abas (valores do Processo.dc.html)', () => {
  it('pagina sem cartao, gap 18; raiz do detalhe em coluna sem fundo (vence o padding do notebook.css)', () => {
    expectF4c('.surface.surface--process-detail', ['padding: 0', 'gap: 18px', 'border: 0', 'background: none', 'box-shadow: none'])
    expectF4c('.process-detail-view.process-detail-view--desktop', [
      'display: flex',
      'flex-direction: column',
      'gap: 18px',
      'padding: 0',
      'background: none',
    ])
  })

  it('cartao do cabecalho: gap 20, padding 24, raio 22, borda --border, --shadow-sm', () => {
    expectF4c('.process-detail-view .pdv-card', [
      'display: flex',
      'flex-direction: column',
      'gap: 20px',
      'padding: 24px',
      'border: 1px solid var(--border)',
      'border-radius: 22px',
      'background: var(--surface)',
      'box-shadow: var(--shadow-sm)',
    ])
    expectF4c('.process-detail-view .pdv-head__row', ['display: flex', 'flex-wrap: wrap', 'justify-content: space-between', 'gap: 16px'])
    expectF4c('.process-detail-view .pdv-head__titles', ['display: flex', 'flex-direction: column', 'gap: 8px', 'min-width: 0'])
  })

  it('Voltar 13/700 em --link-color com chevron; titulo Sora 28/700 -0.02em; tag 28px 13/700; meta mono 13', () => {
    expectF4c('.process-detail-view .pdv-back', ['gap: 6px', 'color: var(--link-color)', 'font-size: 13px', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-back:hover', ['color: var(--link-color-hover)'])
    expectF4c('.process-detail-view .pdv-head__title-line', ['display: flex', 'flex-wrap: wrap', 'align-items: center', 'gap: 12px'])
    expectF4c('.process-detail-view .pdv-head__name', [
      'font-family: var(--font-heading)',
      'font-size: 28px',
      'font-weight: 700',
      'letter-spacing: -0.02em',
    ])
    expectF4c('.process-detail-view .pdv-head__title-line .status-tag', [
      'height: 28px',
      'padding: 0 12px',
      'border-radius: 99px',
      'font-size: 13px',
      'font-weight: 700',
    ])
    expectF4c('.process-detail-view .pdv-head__meta', ['font-family: var(--font-mono)', 'font-size: 13px', 'color: var(--ink-soft)'])
  })

  it('acoes: gap 8; botoes 44px 14/700 (primario 0 18px); icones 44x44 raio 12; favorito --warning-50 com estrela --channel-yellow-edge/--warning-700', () => {
    expectF4c('.process-detail-view .pdv-head__actions', ['display: flex', 'flex-wrap: wrap', 'align-items: flex-start', 'gap: 8px'])
    expectF4c('.process-detail-view .pdv-btn', ['height: 44px', 'padding: 0 16px', 'font-size: 14px', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-btn--primary', ['padding: 0 18px'])
    expectF4c('.process-detail-view .pdv-icon-btn', ['width: 44px', 'height: 44px', 'border-radius: 12px'])
    expectF4c('.process-detail-view .pdv-icon-btn--on', ['background-color: var(--warning-50)'])
    expectF4c('.process-detail-view .pdv-icon-btn--on .pdv-star', ['fill: var(--channel-yellow-edge)', 'stroke: var(--warning-700)'])
    expectF4c('.process-detail-view .pdv-more', ['border: 1px solid var(--border)', 'background: var(--surface)'])
    for (const selector of [
      '.process-detail-view .pdv-icon-btn:focus-visible',
      '.process-detail-view .pdv-tab:focus-visible',
      '.process-detail-view .pdv-back:focus-visible',
    ]) {
      expectF4c(selector, ['box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--focus-ring)'])
    }
  })

  it('timeline: 5 colunas de gap 8, trilho de 4px no centro do ponto (top 9), segmentos a partir de 30px', () => {
    expectF4c('.process-detail-view .pdv-timeline__list', ['display: grid', 'grid-template-columns: repeat(5, minmax(0, 1fr))', 'gap: 8px'])
    expectF4c('.process-detail-view .pdv-timeline__track', [
      'position: absolute',
      'top: 9px',
      'grid-template-columns: repeat(5, minmax(0, 1fr))',
      'column-gap: 8px',
      'height: 4px',
    ])
    expectF4c('.process-detail-view .pdv-timeline__seg', ['height: 4px', 'margin-left: 30px', 'border-radius: 4px', 'background: var(--row-divider)'])
    expectF4c('.process-detail-view .pdv-timeline__fill .pdv-timeline__seg', ['background: var(--primary-700)'])
    expectF4c('.process-detail-view .pdv-stage', ['display: flex', 'flex-direction: column', 'gap: 8px'])
  })

  it('timeline: ponto 22px borda 3px (concluida --primary-700, atual --primary + anel --navy, futura --surface + --border)', () => {
    expectF4c('.process-detail-view .pdv-stage__node', [
      'width: 22px',
      'height: 22px',
      'border: 3px solid var(--border)',
      'border-radius: 99px',
      'background: var(--surface)',
    ])
    expectF4c('.process-detail-view .pdv-stage--done .pdv-stage__node', ['border-color: var(--primary-700)', 'background: var(--primary-700)'])
    expectF4c('.process-detail-view .pdv-stage--now .pdv-stage__node', ['border-color: var(--pdv-now-ring, var(--navy))', 'background: var(--primary)'])
    expectF4c("[data-theme='dark'] .process-detail-view .pdv-stage--now .pdv-stage__node", ['--pdv-now-ring: var(--ink-soft)'])
  })

  it('timeline: rotulo 13 (atual 700), data mono 11 em --ink-soft', () => {
    expectF4c('.process-detail-view .pdv-stage__label', ['font-size: 13px', 'font-weight: 600', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-stage--now .pdv-stage__label', ['font-weight: 700'])
    expectF4c('.process-detail-view .pdv-stage__date', ['font-family: var(--font-mono)', 'font-size: 11px', 'color: var(--ink-soft)'])
  })

  it('timeline (movimento): UM trilho com preenchimento por transform: scaleX em 600 ms ease-out e pontos com mola em 100 + 150·i ms', () => {
    const fill = f4cDecls('.process-detail-view .pdv-timeline__fill')
    expect(fill).toContain('transform-origin: left center;')
    expect(fill).toContain('animation: motion-fill var(--dur-fill) var(--ease-out) both;')
    // o keyframe e' scaleX(0) -> scaleX(1) (so transform)
    expect(css).toMatch(/@keyframes motion-fill \{\s*from \{ transform: scaleX\(0\); \}\s*to \{ transform: scaleX\(1\); \}\s*\}/)
    // largura do preenchimento = colunas concluidas (o 8px de gap entra na conta)
    expect(fill).toContain('width: calc(var(--pdv-filled, 0) * (100% + 8px) / 5 - 8px);')
    const dots = f4cDecls('.process-detail-view .pdv-stage--done .pdv-stage__node')
    expect(dots).toContain('animation: motion-pop var(--dur-slow) var(--ease-spring) both;')
    expect(dots).toContain('animation-delay: calc(100ms + 150ms * var(--i, 0));')
    expect(f4cDecls('.process-detail-view .pdv-stage--now .pdv-stage__node')).toContain(
      'animation-delay: calc(100ms + 150ms * var(--i, 0));'
    )
    // os tokens por tras: 600 ms, 300 ms, ease-out e mola do mock
    expect(light['--dur-fill']).toBe('600ms')
    expect(light['--dur-slow']).toBe('300ms')
    const bezier = (token) => light[token].replace(/\s+/g, '').replace(/\(0\./g, '(.').replace(/,0\./g, ',.')
    expect(bezier('--ease-out')).toBe('cubic-bezier(.4,0,.2,1)')
    expect(bezier('--ease-spring')).toBe('cubic-bezier(.34,1.56,.64,1)')
    // so transform/opacity nos keyframes do detalhe
    const panelIn = css.match(/@keyframes pdv-panel-in \{([\s\S]*?)\n\}\n/)[1]
    expect([...new Set(panelIn.match(/[a-z-]+(?=:)/g))].sort()).toEqual(['opacity', 'transform'])
  })

  it('abas: trilho --disabled-bg raio 14 padding 4; aba 40px raio 10 13/700; ativa --surface + sombra do mock; pilula "N pendentes" --warning-50/--warning-700', () => {
    expectF4c('.process-detail-view .pdv-tabs', [
      'display: flex',
      'flex-wrap: wrap',
      'align-self: flex-start',
      'gap: 4px',
      'padding: 4px',
      'border-radius: 14px',
      'background: var(--disabled-bg)',
    ])
    expectF4c('.process-detail-view .pdv-tab', [
      'height: 40px',
      'padding: 0 14px',
      'border-radius: 10px',
      'font-size: 13px',
      'font-weight: 700',
      'gap: 8px',
      'background: transparent',
      'color: var(--ink-soft)',
    ])
    const tab = f4cDecls('.process-detail-view .pdv-tab')
    expect(tab).toContain('background-color var(--dur-base) var(--ease-out)')
    expect(tab).toContain('color var(--dur-base) var(--ease-out)')
    expectF4c('.process-detail-view .pdv-tab:hover', ['background-color: var(--disabled-bg)'])
    expectF4c('.process-detail-view .pdv-tab--active', ['background: var(--surface)', 'color: var(--ink)', 'box-shadow: 0 1px 3px rgba(0, 65, 83, 0.14)'])
    expectF4c('.process-detail-view .pdv-tab .documents-tab-count', [
      'padding: 2px 7px',
      'border-radius: 99px',
      'background: var(--warning-50)',
      'color: var(--warning-700)',
      'font-size: 11px',
    ])
  })

  it('painel da aba entra em 300 ms subindo 8px (so opacity/transform)', () => {
    const panel = f4cDecls('.process-detail-view .pdv-panel')
    expect(panel).toContain('animation: pdv-panel-in var(--dur-slow) var(--ease-out) both;')
    expect(css).toMatch(/@keyframes pdv-panel-in \{\s*from \{\s*opacity: 0;\s*transform: translateY\(8px\);/)
  })

  it('compacto de notebook: menos respiro, sem perder nada', () => {
    expectF4c('.process-detail-view .pdv-card', ['gap: 14px', 'padding: 18px 22px'], f4cCompactRules)
    expectF4c('.process-detail-view .pdv-head__name', ['font-size: 24px'], f4cCompactRules)
  })
})

describe('F4c - JSX/markup', () => {
  const readLf = (rel) => read(rel).replace(/\r\n/g, '\n')
  const view = readLf('src/features/processes/ProcessDetailView.jsx')
  const desktop = readLf('src/features/processes/ProcessDetailDesktop.jsx')
  const page = readLf('src/pages/ProcessesPage.jsx')

  it('a view escolhe a arvore por matchMedia (useMediaQuery) e a legada continua intacta', () => {
    expect(view).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(view).toContain('useMediaQuery(DESKTOP_QUERY)')
    expect(view).toContain('const isDesktop = isDesktopQuery && !isMobileLayout')
    expect(view).toContain('if (isDesktop) {')
    expect(view).toContain('className="process-detail-mobilebar"')
    expect(view).toContain('className="process-timeline"')
    expect(view).toContain('className="detail-tab-select"')
    expect(view).toContain('<article className="list-card view-push process-detail-view"')
  })

  it('a pagina esconde o titulo da fila no detalhe desktop (surface--process-detail)', () => {
    // F4d: `showDetail` = detalhe OU detalhe atras do modal de edicao
    expect(page).toContain('const isDesktopDetail = isDesktopLayout && showDetail')
    expect(page).toContain("' surface--process-detail'")
  })

  it('a arvore desktop nao usa .ghost-button (secundario = .secondary-button, primario = .primary-button)', () => {
    expect(desktop).not.toMatch(/ghost-button(?!-)/)
    expect(desktop).toContain('secondary-button pdv-btn')
    expect(desktop).toContain('primary-button pdv-btn pdv-btn--primary')
  })

  it('sem toISOString e sem hex nos JSX novos', () => {
    expect(desktop).not.toContain('toISOString')
    expect(desktop.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
  })
})

describe('F4c - Detalhes gerais (valores do Processo.dc.html)', () => {
  it('faixa "Dados pendentes": warn-50/warn-700, padding 14/18, raio 16, gap 10/16, acao a direita sublinhada', () => {
    expectF4c('.process-detail-view .pdv-panel--general', ['--pdv-gap: 16px'])
    expectF4c('.process-detail-view .pdv-pending', [
      'display: flex',
      'flex-wrap: wrap',
      'align-items: center',
      'gap: 10px 16px',
      'padding: 14px 18px',
      'border-radius: 16px',
      'background: var(--warning-50)',
      'color: var(--warning-700)',
    ])
    expectF4c('.process-detail-view .pdv-pending__title', ['font-size: 14px'])
    expectF4c('.process-detail-view .pdv-pending__list', ['font-size: 13px'])
    expectF4c('.process-detail-view .pdv-pending__action', [
      'margin-left: auto',
      'color: var(--warning-700)',
      'font-size: 13px',
      'font-weight: 700',
      'text-decoration: underline',
    ])
  })

  it('cartoes de resumo: grid auto-fit minmax(220px,1fr) gap 14; cartao padding 18, raio 16, borda --border; valor 22/700 (Sora ou mono)', () => {
    expectF4c('.process-detail-view .pdv-summary', ['display: grid', 'grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))', 'gap: 14px'])
    expectF4c('.process-detail-view .pdv-stat', [
      'display: flex',
      'flex-direction: column',
      'gap: 6px',
      'padding: 18px',
      'border: 1px solid var(--border)',
      'border-radius: 16px',
      'background: var(--surface)',
    ])
    expectF4c('.process-detail-view .pdv-stat__label', ['font-size: 12px', 'font-weight: 700', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-stat--info .pdv-stat__label', ['color: var(--info-700)'])
    expectF4c('.process-detail-view .pdv-stat__value', ['font-family: var(--font-heading)', 'font-size: 22px', 'font-weight: 700', 'letter-spacing: -0.01em'])
    expectF4c('.process-detail-view .pdv-stat__value--mono', ['font-family: var(--font-mono)'])
    expectF4c('.process-detail-view .pdv-stat__hint', ['font-size: 12px', 'line-height: 1.45', 'color: var(--ink-soft)'])
  })

  it('cartoes de secao: grid auto-fit minmax(min(100%,380px),1fr) gap 14; padding 20, raio 16, gap 12; titulo Sora 16/700; dl 2 colunas', () => {
    expectF4c('.process-detail-view .pdv-pair', ['display: grid', 'grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr))', 'gap: 14px'])
    expectF4c('.process-detail-view .pdv-section', [
      'display: flex',
      'flex-direction: column',
      'gap: 12px',
      'padding: 20px',
      'border: 1px solid var(--border)',
      'border-radius: 16px',
      'background: var(--surface)',
    ])
    expectF4c('.process-detail-view .pdv-section__title', ['font-family: var(--font-heading)', 'font-size: 16px', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-kv-grid--two', ['grid-template-columns: repeat(2, minmax(0, 1fr))'])
    expectF4c('.process-detail-view .pdv-kv dt', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-kv dd', ['font-size: 14px', 'font-weight: 600'])
  })

  it('previa dos itens: linhas --surface-alt raio 10 padding 10/12 13/600, quantidade mono; vazio = tracejado --border-strong', () => {
    expectF4c('.process-detail-view .pdv-preview li', [
      'display: flex',
      'justify-content: space-between',
      'padding: 10px 12px',
      'border-radius: 10px',
      'background: var(--surface-alt)',
      'font-size: 13px',
      'font-weight: 600',
    ])
    expectF4c('.process-detail-view .pdv-preview__qty', ['font-family: var(--font-mono)', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-empty', ['padding: 14px', 'border: 1px dashed var(--border-strong)', 'border-radius: 12px', 'font-size: 13px'])
    expectF4c('.process-detail-view .pdv-btn--start', ['align-self: flex-start'])
  })
})

describe('F4c - aba Processo (valores do Processo.dc.html)', () => {
  it('bloco: coluna, gap 14, padding 20, raio 16, borda --border, sem sombra; placeholders visiveis no desktop', () => {
    expectF4c('.process-detail-view .pdv-panel--process', ['--pdv-gap: 14px'])
    expectF4c('.process-detail-view .pdv-panel .detail-block', [
      'display: flex',
      'flex-direction: column',
      'gap: 14px',
      'padding: 20px',
      'border: 1px solid var(--border)',
      'border-radius: 16px',
      'background: var(--surface)',
      'box-shadow: none',
    ])
    expectF4c('.process-detail-view .pdv-panel > .detail-block--placeholder', ['display: flex'])
    expectF4c('.process-detail-view .pdv-panel .detail-block--danger', ['border-color: var(--danger-700)', 'background: var(--danger-50)'])
  })

  it('titulo: ladrilho navy 26x26 raio 8 mono 12/700 + h3 Sora 16/700, gap 10', () => {
    expectF4c('.process-detail-view .pdv-panel .detail-block__head', ['display: flex', 'align-items: center', 'gap: 10px'])
    expectF4c('.process-detail-view .pdv-panel .detail-block__step', [
      'width: 26px',
      'height: 26px',
      'border-radius: 8px',
      'background: var(--navy)',
      'color: var(--sidebar-ink)',
      'font-family: var(--font-mono)',
      'font-size: 12px',
      'font-weight: 700',
    ])
    expectF4c('.process-detail-view .pdv-panel .detail-block__title', ['font-family: var(--font-heading)', 'font-size: 16px', 'font-weight: 700'])
  })

  it('dl: auto-fill minmax(170px,1fr) gap 14/12, dt 12 --ink-soft, dd 14/600; Carga em 5 colunas mono', () => {
    expectF4c('.process-detail-view .pdv-panel .detail-dl', ['grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))', 'gap: 14px 12px'])
    expectF4c('.process-detail-view .pdv-panel .detail-dl__row dt', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-panel .detail-dl__row dd', ['font-size: 14px', 'font-weight: 600'])
    expectF4c('.process-detail-view .pdv-panel .process-block--cargo .detail-dl', ['grid-template-columns: repeat(5, minmax(0, 1fr))', 'gap: 12px'])
    expectF4c('.process-detail-view .pdv-panel .process-block--cargo .detail-dl__row dd', ['font-family: var(--font-mono)'])
  })

  it('tabela: moldura --row-divider raio 12, cabecalho --surface-alt, celulas 10/14 13px, linhas com --row-divider, mono no contêiner e lacre', () => {
    expectF4c('.process-detail-view .pdv-panel .pdv-table-wrap', ['overflow-x: auto', 'border: 1px solid var(--row-divider)', 'border-radius: 12px'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table', ['width: 100%', 'border-collapse: collapse', 'font-size: 13px'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table thead tr', ['background: var(--surface-alt)'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table th', ['padding: 10px 14px', 'font-weight: 700', 'text-align: left'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table td', ['padding: 10px 14px', 'font-size: 13px'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table tbody tr', ['border-top: 1px solid var(--row-divider)'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table__mono', ['font-family: var(--font-mono)'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table__pending', ['font-weight: 600', 'color: var(--warning-700)'])
    expectF4c('.process-detail-view .pdv-panel .pdv-table .inline-badge', ['padding: 3px 10px', 'font-size: 12px'])
  })

  it('bloco vazio: borda tracejada --border-strong, raio 12, padding 14, 13px --ink-soft', () => {
    expectF4c('.process-detail-view .pdv-panel .detail-block--placeholder .field-hint', [
      'padding: 14px',
      'border: 1px dashed var(--border-strong)',
      'border-radius: 12px',
      'font-size: 13px',
      'color: var(--ink-soft)',
    ])
  })

  it('o CSS desktop legado do detalhe (grade .tab-panel-spacing, ordem dos blocos, passos escondidos) saiu', () => {
    const desktopBlocks = [...css.matchAll(/@media \(min-width: 1041px\) \{/g)].map((m) => bodyAfter(css.slice(m.index), DESKTOP_MEDIA))
    for (const block of desktopBlocks) {
      expect(block).not.toContain('.process-detail-view .tab-panel-spacing')
      expect(block).not.toContain('.process-general-card')
      expect(block).not.toMatch(/\.process-block--[a-z-]+\s*\{\s*order:/)
      expect(block).not.toContain('.process-detail-view .detail-block__step { display: none')
    }
    expect(stripComments(css)).not.toContain('Detalhe desktop (SPEC 2026-09-28)')
    expect(stripComments(css)).not.toMatch(/\.process-block--transit:has/)
  })
})

describe('F4c - Itens (valores do Processo.dc.html)', () => {
  it('cabecalho: flex wrap entre titulo Sora 18 e busca de 340px (label 12/700, campo 44px raio 10)', () => {
    expectF4c('.process-detail-view .pdv-items', ['gap: 14px'])
    expectF4c('.process-detail-view .pdv-items__head', ['display: flex', 'flex-wrap: wrap', 'align-items: flex-end', 'justify-content: space-between', 'gap: 12px'])
    expectF4c('.process-detail-view .pdv-items__title', ['font-size: 18px'])
    expectF4c('.process-detail-view .pdv-items__search', ['display: flex', 'flex-direction: column', 'gap: 6px', 'width: min(100%, 340px)'])
    expectF4c('.process-detail-view .pdv-items__search > span', ['font-size: 12px', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-items__search .text-input', ['height: 44px', 'padding: 0 12px', 'border-radius: 10px', 'font-size: 14px', 'font-weight: 500'])
  })

  it('linha: grid minmax(0,1fr) 140px 160px auto, gap 16, padding 14/16, raio 12, fundo --surface-alt; hover so troca o anel (nao levanta)', () => {
    expectF4c('.process-detail-view .pdv-item', [
      'display: grid',
      'grid-template-columns: minmax(0, 1fr) 140px 160px auto',
      'gap: 16px',
      'align-items: center',
      'padding: 14px 16px',
      'border-radius: 12px',
      'background: var(--surface-alt)',
    ])
    expectF4c('.process-detail-view .pdv-item:hover', ['box-shadow: inset 0 0 0 1px var(--border-strong)'])
    expect(f4cDecls('.process-detail-view .pdv-item:hover')).not.toContain('transform')
    expectF4c('.process-detail-view .pdv-item:focus-visible', ['box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--focus-ring)'])
    expectF4c('.process-detail-view .pdv-item__name', ['font-size: 14px', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-item__field', ['font-size: 13px', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-item__field strong', ['font-family: var(--font-mono)', 'color: var(--ink)'])
    expectF4c('.process-detail-view .pdv-item__tags .inline-badge', ['padding: 4px 10px'])
    expectF4c('.process-detail-view .pdv-item--related', ['grid-template-columns: minmax(0, 1fr) 180px'])
  })
})

describe('F4c - Mensagens e Historico (valores do Processo.dc.html)', () => {
  it('mensagens: grid minmax(0,1.4fr) minmax(280px,1fr) gap 14; balao raio 4/14/14/14 (proprio espelhado) fundo --surface-alt / --primary-50', () => {
    expectF4c('.process-detail-view .pdv-msgs', ['display: grid', 'grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr)', 'gap: 14px', 'align-items: start'])
    expectF4c('.process-detail-view .pdv-msgs__list', ['display: flex', 'flex-direction: column', 'gap: 12px'])
    expectF4c('.process-detail-view .pdv-msg', ['display: flex', 'gap: 12px'])
    expectF4c('.process-detail-view .pdv-msg--own', ['flex-direction: row-reverse'])
    expectF4c('.process-detail-view .pdv-msg__bubble', [
      'gap: 4px',
      'padding: 12px 14px',
      'border-radius: 4px 14px 14px 14px',
      'background: var(--surface-alt)',
    ])
    expectF4c('.process-detail-view .pdv-msg--own .pdv-msg__bubble', ['border-radius: 14px 4px 14px 14px', 'background: var(--primary-50)'])
    expectF4c('.process-detail-view .pdv-msg__text', ['font-size: 14px', 'line-height: 1.55'])
  })

  it('avatar 36x36 raio 10: outros --info-50/--info-700, proprio --navy com texto branco', () => {
    expectF4c('.process-detail-view .pdv-msg__avatar', ['width: 36px', 'height: 36px', 'border-radius: 10px', 'background: var(--info-50)', 'color: var(--info-700)', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-msg--own .pdv-msg__avatar', ['background: var(--navy)', 'color: var(--sidebar-ink)'])
    expectF4c('.process-detail-view .pdv-msg__meta', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-msg__who strong', ['color: var(--ink)'])
  })

  it('formulario: rotulo 14/700, textarea raio 10 sem resize, cota 12 --ink-soft, botao primario 44px de largura total', () => {
    expectF4c('.process-detail-view .pdv-msgs__label', ['font-size: 14px', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-msgs__textarea', ['padding: 12px 14px', 'border-radius: 10px', 'font-size: 14px', 'font-weight: 500', 'resize: none'])
    expectF4c('.process-detail-view .pdv-msgs__quota', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-msgs__limit', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF4c('.process-detail-view .pdv-msgs__submit', ['width: 100%', 'height: 44px'])
  })

  it('historico: card padding 20/24 gap 16; linha grid 110px 20px 1fr gap 14; data mono 12 a direita; ponto 12px com halo 3px; trilho 2px --row-divider', () => {
    expectF4c('.process-detail-view .pdv-history', ['gap: 16px', 'padding: 20px 24px'])
    expectF4c('.process-detail-view .pdv-hist__item', ['display: grid', 'grid-template-columns: 110px 20px minmax(0, 1fr)', 'gap: 14px'])
    expectF4c('.process-detail-view .pdv-hist__when', ['font-family: var(--font-mono)', 'font-size: 12px', 'text-align: right', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-hist__dot', ['width: 12px', 'height: 12px', 'margin-top: 3px', 'border-radius: 99px', 'background: var(--primary-700)', 'box-shadow: 0 0 0 3px var(--primary-50)'])
    expectF4c('.process-detail-view .pdv-hist__dot--latest', ['background: var(--primary)'])
    expectF4c('.process-detail-view .pdv-hist__line', ['flex-grow: 1', 'width: 2px', 'margin: 4px 0', 'background: var(--row-divider)'])
    expectF4c('.process-detail-view .pdv-hist__body', ['gap: 2px', 'padding-bottom: 18px'])
    expectF4c('.process-detail-view .pdv-hist__title', ['font-size: 14px', 'font-weight: 700'])
    expectF4c('.process-detail-view .pdv-hist__by', ['font-size: 12px', 'color: var(--ink-soft)'])
  })
})

describe('F4c - Documentos (valores do Processo.dc.html)', () => {
  it('secao = cartao (padding 20, raio 16, gap 14); titulo Sora 18; nota 12 --ink-soft', () => {
    expectF4c('.process-detail-view .pdv-panel .documents-section', [
      'display: flex',
      'flex-direction: column',
      'gap: 14px',
      'padding: 20px',
      'border-radius: 16px',
      'box-shadow: none',
    ])
    expectF4c('.process-detail-view .pdv-panel .documents-section__title', ['font-size: 18px'])
    expectF4c('.process-detail-view .pdv-panel .documents-section__note', ['font-size: 12px', 'color: var(--ink-soft)'])
  })

  it('grade de slots: auto-fill minmax(260px, 1fr) gap 12', () => {
    expectF4c('.process-detail-view .pdv-panel .documents-section__rows', [
      'display: grid',
      'grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))',
      'gap: 12px',
    ])
  })

  it('slot: padding 16, raio 14; pendente --surface + tracejada --border-strong; enviado --surface-alt + solida --row-divider', () => {
    expectF4c('.process-detail-view .pdv-panel .documents-row-group', [
      'display: flex',
      'flex-direction: column',
      'gap: 10px',
      'padding: 16px',
      'border: 1px dashed var(--border-strong)',
      'border-radius: 14px',
      'background: var(--surface)',
    ])
    expectF4c('.process-detail-view .pdv-panel .documents-row-group:has(.documents-row__icon--on)', [
      'border: 1px solid var(--row-divider)',
      'background: var(--surface-alt)',
    ])
  })

  it('linha do slot: rotulo 14/700 + tag 11/700 lado a lado, arquivo mono 12, acoes de 36px raio 10 12/700', () => {
    expectF4c('.process-detail-view .pdv-panel .documents-row', ['display: flex', 'flex-wrap: wrap', 'align-items: center', 'padding: 0', 'border-top: 0'])
    expectF4c('.process-detail-view .pdv-panel .documents-row__content', ['display: contents'])
    expectF4c('.process-detail-view .pdv-panel .documents-row > .documents-row__icon', ['display: none'])
    expectF4c('.process-detail-view .pdv-panel .documents-row__label', ['order: 1', 'flex: 1 1 0', 'font-size: 14px'])
    expectF4c('.process-detail-view .pdv-panel .documents-row__badge', ['order: 2', 'flex: none'])
    expectF4c('.process-detail-view .pdv-panel .documents-row__badge .inline-badge', ['padding: 3px 9px', 'font-size: 11px', 'white-space: nowrap'])
    expectF4c('.process-detail-view .pdv-panel .documents-row__file', ['order: 3', 'flex: 1 1 100%', 'font-family: var(--font-mono)', 'font-size: 12px', 'color: var(--ink-soft)'])
    expectF4c('.process-detail-view .pdv-panel .documents-row > .documents-row__actions', ['order: 6', 'flex: 1 1 100%', 'gap: 6px'])
    expectF4c('.process-detail-view .pdv-panel .documents-row__actions .documents-icon-button', [
      'height: 36px',
      'padding: 0 12px',
      'border: 1px solid var(--border)',
      'border-radius: 10px',
      'background: var(--surface)',
      'color: var(--navy)',
      'font-size: 12px',
      'font-weight: 700',
    ])
    expectF4c('.process-detail-view .pdv-panel .documents-row__action-label', ['display: inline'])
  })

  it('tags de estado do mock: enviado ok, pendente warn, neutro e info (Opcional) por token', () => {
    expectF4c('.process-detail-view .pdv-panel .documents-badge--info', ['background: var(--info-50)', 'color: var(--info-700)'])
    // ok/warn/neutral vem dos modificadores globais (.inline-badge--ok/--warn, .documents-badge--neutral)
    expect(css).toContain('.inline-badge--ok')
    expect(css).toContain('.documents-badge--neutral')
  })

  it('"Documento adicional": cartao tracejado com cabecalho (titulo + tag) e botao de 36px', () => {
    expectF4c('.process-detail-view .pdv-panel .documents-add-other-row', [
      'flex-direction: column',
      'padding: 16px',
      'border: 1px dashed var(--border-strong)',
      'border-radius: 14px',
      'background: var(--surface)',
    ])
    expectF4c('.process-detail-view .pdv-panel .documents-add-other__head', ['display: flex', 'align-items: center', 'justify-content: space-between'])
    expectF4c('.process-detail-view .pdv-panel .documents-add-other', ['height: 36px', 'border-radius: 10px', 'font-size: 12px', 'font-weight: 700'])
  })

  it('o painel nao reabre o desktop legado: a regra de 2 colunas/linha em grade de 4 colunas nao vale no detalhe novo', () => {
    expect(f4cDecls('.process-detail-view .pdv-panel .documents-row')).not.toContain('grid-template-columns')
    expect(f4cDecls('.process-detail-view .pdv-panel .documents-row')).toContain('display: flex;')
  })
})

describe('F4c - ajustes finos da conferencia visual', () => {
  it('Itens: as colunas alinham entre as linhas por subgrid (com a grade propria como fallback)', () => {
    const body = f4cMainBody.replace(/\s+/g, ' ')
    expect(body).toContain('@supports (grid-template-columns: subgrid)')
    expect(body).toMatch(/\.pdv-items__list > \.pdv-item \{ grid-template-columns: subgrid;/)
    expectF4c('.process-detail-view .pdv-item', ['grid-template-columns: minmax(0, 1fr) 140px 160px auto'])
  })

  it('IMO da Carga em texto normal (nao mono); "contem Packing List" sem caixa alta; versao anterior sem icone', () => {
    expectF4c('.process-detail-view .pdv-panel .process-block--cargo .detail-dl__row--wide dd', ['font-family: inherit', 'font-size: 13px'])
    expectF4c('.process-detail-view .pdv-panel .documents-combine__label', ['text-transform: none', 'font-size: 12px'])
    expectF4c('.process-detail-view .pdv-panel .documents-row__previous svg', ['display: none'])
  })
})

// ---------------------------------------------------------------------------
// F4d - Formulario de processo em MODAL no desktop (ProcessoForm.dc.html). O dialogo
// (ProcessFormDialog.jsx, `pfd-*`) e escolhido por matchMedia; tablet e mobile ficam
// na vista legada dentro da pagina. CSS = uma secao "REFINO VISUAL F4d" com UM @media
// desktop (+ o compacto de notebook), toda regra sob o modal `.process-form-modal` ou
// a raiz `.process-form--dialog`.
// ---------------------------------------------------------------------------
const F4D_MARKER = 'REFINO VISUAL F4d — FORMULARIO DE PROCESSO EM MODAL'
const F4D_COMPACT_MARKER = 'Notebook / telas baixas (altura <= 800): o dialogo ocupa a janela'
const f4dAt = css.indexOf(F4D_MARKER)
const f4dStart = css.lastIndexOf('/*', f4dAt)
const f4dCompactAt = css.indexOf(F4D_COMPACT_MARKER)
const f4dCompactStart = css.lastIndexOf('/*', f4dCompactAt)
const f4dEnd = css.indexOf('/* Roadmap 11 / PR #223')
const f4dMainBody = bodyAfter(stripComments(css.slice(f4dStart, f4dCompactAt)), DESKTOP_MEDIA)
const f4dRules = parseRules(f4dMainBody)
const f4dCompactRules = parseRules(
  bodyAfter(stripComments(css.slice(f4dCompactAt, f4dEnd)), '@media (min-width: 1041px) and (max-height: 800px) {'),
)

function f4dDecls(selector, rules = f4dRules) {
  const bodies = rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F4d: ${selector}`).toBeGreaterThan(0)
  return bodies.join(' ')
}

function expectF4d(selector, declarations, rules) {
  const body = f4dDecls(selector, rules)
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F4d - secao, escopo e ordem', () => {
  it('a secao existe, vem antes do bloco reduce desktop e tem UM @media desktop (+ o compacto), nada fora', () => {
    expect(f4dAt).toBeGreaterThan(0)
    expect(f4dCompactAt).toBeGreaterThan(f4dAt)
    expect(f4dEnd).toBeGreaterThan(f4dCompactAt)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f4dEnd)
    const before = stripComments(css.slice(f4dStart, css.indexOf(DESKTOP_MEDIA, f4dAt)))
    expect(before.trim(), 'nada fora do @media antes do bloco principal').toBe('')
    expect(f4dMainBody).not.toMatch(/@media/)
    const outside = stripComments(css.slice(f4dStart, f4dCompactStart)).replace(f4dMainBody, '')
    expect(outside.replace(/@media \(min-width: 1041px\) \{\s*\}/, '').trim()).toBe('')
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(tail.match(/@media/g)).toHaveLength(1)
  })

  it('nenhum @media (max-width) e toda regra comeca pelo modal (.process-form-modal) ou pela raiz .process-form--dialog', () => {
    const whole = stripComments(css.slice(f4dStart, f4dEnd))
    expect(whole).not.toMatch(/@media\s*\(max-width/)
    const ROOT =
      /^(\[data-theme='dark'\] )?(\.modal-backdrop\.process-form-modal-backdrop|\.modal\.process-form-modal|\.process-form-modal |\.process-form--dialog)/
    for (const rule of [...f4dRules, ...f4dCompactRules]) {
      for (const selector of rule.selectors) expect(selector, `seletor sem a raiz: ${selector}`).toMatch(ROOT)
    }
  })

  it('so tokens: as unicas cores literais sao o branco do botao do switch e as sombras do mock', () => {
    const all = [...f4dRules, ...f4dCompactRules].map((r) => r.body).join(' ')
    expect(all.match(/#[0-9a-fA-F]{3,8}\b/g)).toEqual(['#ffffff'])
    expect(all.match(/rgba?\([^)]*\)/g)).toEqual(['rgba(0, 0, 0, 0.2)'])
  })

  it('o legado de tablet/mobile (.process-form.list-card, wizard-nav) nao foi tocado: nenhuma regra F4d o menciona', () => {
    const whole = stripComments(css.slice(f4dStart, f4dEnd))
    expect(whole).not.toContain('.list-card')
    expect(whole).not.toContain('.wizard-nav')
    expect(whole).not.toContain('.wizard-header')
  })

  it('notebook.css e mobile-redesign.css nao ganharam o desktop novo', () => {
    expect(read('src/notebook.css')).not.toContain('pfd-')
    expect(read('src/mobile-redesign.css')).not.toContain('pfd-')
    expect(read('src/mobile-redesign.css')).not.toContain('process-form-modal')
  })

  it('reduce desktop: switch e barras do stepper sem transicao, no bloco existente', () => {
    const tail = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    for (const selector of [
      '.process-form--dialog .process-form-switch__knob',
      '.process-form--dialog .process-form-switch__track',
      '.process-form--dialog .pfd-step__bar',
    ]) {
      expect(tail, selector).toContain(selector)
    }
  })
})

describe('F4d - valores do mock (ProcessoForm.dc.html)', () => {
  it('dialogo: 960 x 800 (frame 1040x880 com 40px de scrim), raio 22, --shadow-xl, --scrim; coluna sem padding', () => {
    expectF4d('.modal-backdrop.process-form-modal-backdrop', ['padding: 40px', 'background: var(--scrim)'])
    expectF4d('.modal.process-form-modal', [
      'display: flex',
      'flex-direction: column',
      'width: min(960px, 100%)',
      'height: min(800px, calc(100vh - 80px))',
      'padding: 0',
      'border-radius: 22px',
      'background: var(--surface)',
      'box-shadow: var(--shadow-xl)',
      'overflow: hidden',
    ])
    expectF4d('.process-form-modal .modal__body', ['display: flex', 'flex: 1 1 auto', 'flex-direction: column', 'min-height: 0'])
  })

  it('cabecalho: padding 24/28/18, gap 16, borda --row-divider; titulo Sora 22/700 -0.01em; chip mono 12 em --navy-50', () => {
    expectF4d('.process-form--dialog .pfd-header', ['gap: 16px', 'padding: 24px 28px 18px', 'border-bottom: 1px solid var(--row-divider)', 'flex: 0 0 auto'])
    expectF4d('.process-form--dialog .pfd-title', [
      'font-family: var(--font-heading)',
      'font-size: 22px',
      'font-weight: 700',
      'letter-spacing: -0.01em',
    ])
    expectF4d('.process-form--dialog .pfd-chip', [
      'padding: 3px 10px',
      'border-radius: var(--radius-full)',
      'background: var(--navy-50)',
      'color: var(--navy)',
      'font-family: var(--font-mono)',
      'font-size: 12px',
    ])
    expectF4d("[data-theme='dark'] .process-form--dialog .pfd-chip", ['color: var(--ink)'])
    expectF4d('.process-form--dialog .pfd-subtitle', ['font-size: 13px', 'color: var(--ink-soft)'])
    expectF4d('.process-form--dialog .pfd-header__titles', ['gap: 6px'])
    expectF4d('.process-form--dialog .pfd-header__title-row', ['gap: 10px', 'align-items: center'])
  })

  it('fechar: 44x44, raio 12, fundo --surface-alt, sem borda', () => {
    expectF4d('.process-form--dialog .pfd-close', [
      'width: 44px',
      'height: 44px',
      'border: 0',
      'border-radius: 12px',
      'background: var(--surface-alt)',
      'color: var(--ink)',
    ])
  })

  it('stepper: 6 colunas gap 8; barra 4px (concluida --primary-700, atual --primary, futura --disabled-bg); rotulo 12/600, atual 700; numero mono', () => {
    expectF4d('.process-form--dialog .pfd-steps', ['display: grid', 'grid-template-columns: repeat(6, minmax(0, 1fr))', 'gap: 8px', 'list-style: none'])
    expectF4d('.process-form--dialog .pfd-step__button', ['display: flex', 'flex-direction: column', 'gap: 8px'])
    expectF4d('.process-form--dialog .pfd-step__bar', ['height: 4px', 'border-radius: 4px', 'background: var(--disabled-bg)'])
    expectF4d('.process-form--dialog .pfd-step--done .pfd-step__bar', ['background: var(--primary-700)'])
    expectF4d('.process-form--dialog .pfd-step--current .pfd-step__bar', ['background: var(--primary)'])
    expectF4d('.process-form--dialog .pfd-step__label', ['font-size: 12px', 'font-weight: 600', 'gap: 6px', 'color: var(--ink-soft)'])
    expectF4d('.process-form--dialog .pfd-step--current .pfd-step__label', ['font-weight: 700'])
    expectF4d('.process-form--dialog .pfd-step--done .pfd-step__label', ['color: var(--ink)'])
    expectF4d('.process-form--dialog .pfd-step__num', ['font-family: var(--font-mono)'])
  })

  it('corpo: rolavel (flex 1, min-height 0, overflow-y auto), padding 24/28, gap 18; eyebrow mono 11/600 1.5px; titulo Sora 18/700', () => {
    expectF4d('.process-form--dialog .pfd-body', [
      'flex: 1 1 auto',
      'min-height: 0',
      'padding: 24px 28px',
      'gap: 18px',
      'overflow-y: auto',
    ])
    expectF4d('.process-form--dialog .pfd-body__head', ['gap: 2px'])
    expectF4d('.process-form--dialog .pfd-eyebrow', [
      'font-family: var(--font-mono)',
      'font-size: 11px',
      'font-weight: 600',
      'letter-spacing: 1.5px',
      'color: var(--primary-700)',
    ])
    expectF4d('.process-form--dialog .pfd-step-title', ['font-family: var(--font-heading)', 'font-size: 18px', 'font-weight: 700'])
  })

  it('grade de campos: 3 colunas, gap 16px 14px; os .form-grid do app entram nela (display: contents)', () => {
    expectF4d('.process-form--dialog .pfd-panel', ['display: grid', 'grid-template-columns: repeat(3, minmax(0, 1fr))', 'gap: 16px 14px'])
    expectF4d('.process-form--dialog .pfd-panel > .form-grid', ['display: contents'])
    expectF4d('.process-form--dialog .pfd-panel > .form-group > .form-grid', ['display: contents'])
    expectF4d('.process-form--dialog .pfd-panel > *', ['grid-column: 1 / -1'])
    expectF4d('.process-form--dialog .pfd-panel > .field', ['grid-column: auto'])
    expectF4d('.process-form--dialog .pfd-panel > .field:has(> textarea)', ['grid-column: 1 / -1'])
  })

  it('campo pendente: borda --warning e "Dado pendente" em --warning-700; dica 11/600 --ink-soft', () => {
    expectF4d(".process-form--dialog [data-pending='true'] .text-input:not(:focus)", ['border-color: var(--warning)'])
    expectF4d('.process-form--dialog .field-hint.field-hint--pending', ['color: var(--warning-700)'])
    expectF4d('.process-form--dialog .field > .field-hint', ['font-size: 11px', 'font-weight: 600', 'color: var(--ink-soft)'])
  })

  it('Transbordo: linha em --surface-alt (raio 14, padding 14/16) com switch 52x32 (off --switch-off, botao 26 branco)', () => {
    expectF4d('.process-form--dialog .process-form-switch-row', [
      'display: flex',
      'justify-content: space-between',
      'gap: 16px',
      'padding: 14px 16px',
      'border-radius: 14px',
      'background: var(--surface-alt)',
    ])
    expectF4d('.process-form--dialog .process-form-switch-row__title', ['font-size: 14px', 'font-weight: 700'])
    expectF4d('.process-form--dialog .process-form-switch-row__hint', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF4d('.process-form--dialog .process-form-switch', ['width: 52px', 'height: 32px'])
    expectF4d('.process-form--dialog .process-form-switch__track', [
      'width: 52px',
      'height: 32px',
      'padding: 3px',
      'border-radius: var(--radius-full)',
      'background: var(--switch-off)',
    ])
    expectF4d('.process-form--dialog .process-form-switch__knob', [
      'width: 26px',
      'height: 26px',
      'border-radius: var(--radius-full)',
      'background: #ffffff',
      'box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2)',
    ])
    expectF4d('.process-form--dialog .process-form-switch__input:checked + .process-form-switch__track', ['background: var(--primary-700)'])
    expectF4d('.process-form--dialog .process-form-switch__input:checked + .process-form-switch__track .process-form-switch__knob', [
      'transform: translateX(20px)',
    ])
  })

  it('rodape fixo: 16/28 em --surface-alt com borda superior; botoes 44 com gap 6 (Voltar 0/16, Salvar 0/16, Avancar 0/18)', () => {
    expectF4d('.process-form--dialog .pfd-footer', [
      'flex: 0 0 auto',
      'justify-content: space-between',
      'gap: 12px',
      'padding: 16px 28px',
      'border-top: 1px solid var(--row-divider)',
      'background: var(--surface-alt)',
    ])
    expectF4d('.process-form--dialog .pfd-footer .ghost-button', ['padding: 0 16px'])
    expectF4d('.process-form--dialog .pfd-footer .secondary-button', ['padding: 0 16px'])
    expectF4d('.process-form--dialog .pfd-footer .primary-button', ['padding: 0 18px'])
    expectF4d('.process-form--dialog .pfd-footer__actions', ['display: flex', 'gap: 8px'])
  })

  it('notebook (altura <= 800): dialogo na altura da janela (16px de scrim), cabecalho/corpo/rodape compactos', () => {
    expectF4d('.modal-backdrop.process-form-modal-backdrop', ['padding: 16px'], f4dCompactRules)
    expectF4d('.modal.process-form-modal', ['height: calc(100vh - 32px)'], f4dCompactRules)
    expectF4d('.process-form--dialog .pfd-header', ['padding: 16px 24px 12px'], f4dCompactRules)
    expectF4d('.process-form--dialog .pfd-body', ['padding: 16px 24px'], f4dCompactRules)
    expectF4d('.process-form--dialog .pfd-footer', ['padding: 10px 24px'], f4dCompactRules)
  })
})

describe('F4d - JSX/markup', () => {
  const readLf = (rel) => read(rel).replace(/\r\n/g, '\n')
  const noComments = (s) => stripComments(s).replace(/^\s*\/\/.*$/gm, '')
  const dialog = readLf('src/features/processes/ProcessFormDialog.jsx')
  const form = readLf('src/features/processes/ProcessForm.jsx')
  const page = readLf('src/pages/ProcessesPage.jsx')
  const transit = readLf('src/features/processes/ProcessTransitFields.jsx')

  it('o dialogo usa o <Modal> em modo bare, sem fechar no scrim, com o foco inicial controlado', () => {
    expect(dialog).toContain("import Modal from '../../components/Modal'")
    expect(dialog).toMatch(/<Modal[\s\S]*?\bbare\b[\s\S]*?closeOnBackdrop=\{false\}[\s\S]*?initialFocusRef=\{initialFocusRef\}/)
    expect(dialog).toContain('className="process-form-modal"')
    expect(dialog).toContain('className="process-form process-form--dialog"')
  })

  it('cabecalho, stepper e rodape do mock: fechar, Voltar fantasma, Salvar secundario, Avancar primario com chevron', () => {
    expect(dialog).toContain('aria-label="Fechar"')
    expect(dialog).toContain('aria-label="Etapas do cadastro"')
    expect(dialog).toContain("aria-current={index === currentStep ? 'step' : undefined}")
    expect(dialog).toContain('`${stepDef.label}, contém erro`')
    expect(dialog).toMatch(/className="ghost-button pfd-footer__back"/)
    expect(dialog).toMatch(/className="secondary-button"/)
    expect(dialog).toMatch(/className="primary-button" onClick=\{onNext\}/)
    expect(dialog).toContain('name="chevron-right"')
    expect(dialog).toContain('PASSO {currentStep + 1} DE {steps.length}')
    expect(dialog).toContain('id="process-form-error-summary"')
  })

  it('ultimo passo: o salvar vira o primario e "Avançar" some', () => {
    expect(dialog).toMatch(/isLastStep \? \(\s*<button type="button" className="primary-button" onClick=\{onSave\}/)
  })

  it('ProcessForm escolhe a arvore por matchMedia e mantem UMA instancia (o passo sobrevive a troca ao vivo)', () => {
    expect(form).toContain("import useMediaQuery from '../../hooks/useMediaQuery'")
    expect(form).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(form).toContain('const isDesktop = useMediaQuery(DESKTOP_QUERY)')
    expect(form).toMatch(/if \(isDesktop\) \{\s*return \(\s*<ProcessFormDialog/)
    // a vista legada continua (Avançar secundario, Voltar para lista)
    expect(form).toContain('aria-label="Voltar para lista"')
    expect(form).toMatch(/className="ghost-button ghost-button--secondary"\s*\n\s*onClick=\{\(\) => setStep\(Math\.min\(currentStep \+ 1/)
  })

  it('pendencias so no desktop e so em edicao, calculadas sobre o rascunho (getPendingFields)', () => {
    expect(form).toContain("if (!isDesktop || viewMode !== 'edit' || !draft) return EMPTY_PENDING")
    expect(form).toContain('getPendingFields(draft)')
    expect(form).toContain('{...pending(')
    expect(readLf('src/features/processes/PendingFieldHint.jsx')).toContain('Dado pendente')
  })

  it('Transbordo: switch (role=switch, aria-label "Transbordo") no desktop; checkbox legado no resto', () => {
    expect(transit).toContain('const { desktop } = useProcessFormContext()')
    expect(transit).toContain('role="switch"')
    expect(transit).toContain('aria-label="Transbordo"')
    expect(transit).toContain('Ative se a carga troca de navio no caminho.')
    expect(transit).toContain('Esta carga tem transbordo?')
  })

  it('campos de codigo em .text-input--mono (PO, Incoterm, viagem, IMO, House BL, CE, DUIMP, contêiner, lacre, quantidade...)', () => {
    const count = (rel) => (readLf(rel).match(/text-input--mono/g) ?? []).length
    expect(count('src/features/processes/ProcessForm.jsx')).toBeGreaterThanOrEqual(4)
    expect(count('src/features/processes/ProcessTransitFields.jsx')).toBeGreaterThanOrEqual(6)
    expect(count('src/features/processes/ProcessCargoFields.jsx')).toBeGreaterThanOrEqual(7)
    expect(count('src/features/processes/ProcessArrivalFields.jsx')).toBeGreaterThanOrEqual(4)
    expect(count('src/features/processes/ProcessCustomsFields.jsx')).toBeGreaterThanOrEqual(1)
    expect(count('src/features/processes/ContainersEditor.jsx')).toBe(2)
  })

  it('a pagina mantem o fundo (lista/detalhe) atras do scrim e fecha o modal de edicao no detalhe', () => {
    expect(page).toContain("const isFormDialog = isDesktopLayout && isAdmin && (viewMode === 'create' || viewMode === 'edit')")
    expect(page).toContain("const showList = viewMode === 'list' || pageBehindForm === 'list'")
    expect(page).toContain("setViewMode(pageBehindForm === 'detail' ? 'detail' : 'list')")
  })

  it('sem toISOString nem console.log, sem hex nos JSX novos', () => {
    for (const source of [dialog, readLf('src/features/processes/PendingFieldHint.jsx'), readLf('src/features/processes/processFormContext.js')]) {
      expect(noComments(source)).not.toMatch(/toISOString\(\)|console\.log/)
      expect(noComments(source)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })
})
