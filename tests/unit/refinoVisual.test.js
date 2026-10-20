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
  '--dialog-footer-bg': '#fbfcfc',
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
  '--dialog-footer-bg': '#12303c',
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
  // F6a: a arvore desktop acrescenta o fantasma "Excluir comunicado" (fantasma de perigo no mock).
  'features/admin/AdminAnnouncementsPanel.jsx': [2, 1, 0],
  'features/admin/AdminBarStatusPanel.jsx': [1, 1, 0],
  'features/admin/AdminLeadTimePanel.jsx': [1, 1, 0],
  'features/admin/AdminSupportPanel.jsx': [3, 3, 0],
  // F6a: a arvore desktop (au-*) acrescenta 3 fantasmas sem moldura no mock: Excluir usuario, Reprovar (contorno de perigo proprio) e Abrir detalhe.
  'features/admin/AdminUsersPanel.jsx': [8, 3, 0],
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
  // F5a: o editor desktop usa .secondary-button (via secondaryButtonClass); sobram "Editar" legado (secondary), "Voltar" (fantasma) e a constante do legado (secondary).
  'pages/NewsPage.jsx': [3, 2, 0],
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
      'background: var(--dialog-footer-bg)',
    ])
    expectF4d('.process-form--dialog .pfd-footer .ghost-button', ['padding: 0 16px'])
    expectF4d('.process-form--dialog .pfd-footer .secondary-button', ['padding: 0 16px'])
    expectF4d('.process-form--dialog .pfd-footer .primary-button', ['padding: 0 18px'])
    expectF4d('.process-form--dialog .pfd-footer__actions', ['display: flex', 'gap: 8px'])
  })

  it('Itens: coluna do switch IMO com largura fixa de 96px (cabecalho e linhas alinhados), com e sem PO', () => {
    expectF4d('.process-form--dialog .editor-grid__head--items', ['grid-template-columns: minmax(200px, 2fr) minmax(100px, 0.8fr) 96px 40px'])
    expectF4d('.process-form--dialog .editor-grid--items > .editor-row', ['grid-template-columns: minmax(200px, 2fr) minmax(100px, 0.8fr) 96px 40px'])
    expectF4d('.process-form--dialog .editor-grid__head--items.editor-grid__head--po', [
      'grid-template-columns: minmax(200px, 2fr) minmax(120px, 1fr) minmax(100px, 0.8fr) 96px 40px',
    ])
    expectF4d('.process-form--dialog .editor-grid--items-po > .editor-row', [
      'grid-template-columns: minmax(200px, 2fr) minmax(120px, 1fr) minmax(100px, 0.8fr) 96px 40px',
    ])
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

// ---------------------------------------------------------------------------
// F5a - Noticias, Central de notificacoes e Preferencias (Noticias.dc.html,
// Notificacoes.dc.html, Preferencias.dc.html). Cada tela desktop e uma arvore propria
// escolhida por matchMedia (nw-*, nt-*, prefs-*); tablet/mobile ficam na arvore legada.
// CSS = 3 secoes "REFINO VISUAL F5a" (NOTICIAS, CENTRAL DE NOTIFICACOES, PREFERENCIAS),
// cada uma com UM @media desktop (+ o compacto de notebook nas Noticias), toda regra sob a
// raiz da tela (.surface--news, .notifications-page, o modal .prefs-modal ou a raiz
// .notification-prefs--desktop). Os blocos desktop legados (Ciclo 3a / 6d) foram removidos.
// ---------------------------------------------------------------------------
const F5A_NEWS = 'REFINO VISUAL F5a — NOTICIAS'
const F5A_NEWS_COMPACT = 'Notebook / telas baixas (altura <= 800): capas mais baixas'
const F5A_NOTIF = 'REFINO VISUAL F5a — CENTRAL DE NOTIFICACOES'
const F5A_PREFS = 'REFINO VISUAL F5a — PREFERENCIAS DE NOTIFICACAO'
const f5aNewsAt = css.indexOf(F5A_NEWS)
const f5aNewsCompactAt = css.indexOf(F5A_NEWS_COMPACT)
const f5aNotifAt = css.indexOf(F5A_NOTIF)
const f5aPrefsAt = css.indexOf(F5A_PREFS)
// O fim das secoes F5a e o comeco da secao F5b (que vem logo depois, antes do bloco reduce).
const f5aEnd = css.lastIndexOf('/*', css.indexOf('REFINO VISUAL F5b — LOGIN E ESTADOS DE ACESSO'))
const f5aStartOf = (at) => css.lastIndexOf('/*', at)
const f5aNewsRules = parseRules(bodyAfter(stripComments(css.slice(f5aStartOf(f5aNewsAt), f5aNewsCompactAt)), DESKTOP_MEDIA))
const f5aNewsCompactRules = parseRules(
  bodyAfter(stripComments(css.slice(f5aNewsCompactAt, f5aStartOf(f5aNotifAt))), '@media (min-width: 1041px) and (max-height: 800px) {'),
)
const f5aNotifRules = parseRules(bodyAfter(stripComments(css.slice(f5aStartOf(f5aNotifAt), f5aStartOf(f5aPrefsAt))), DESKTOP_MEDIA))
const f5aPrefsRules = parseRules(bodyAfter(stripComments(css.slice(f5aStartOf(f5aPrefsAt), f5aEnd)), DESKTOP_MEDIA))

function expectF5a(rules, selector, declarations) {
  const bodies = rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F5a: ${selector}`).toBeGreaterThan(0)
  const body = bodies.join(' ')
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F5a - tokens novos (com contraparte dark)', () => {
  const light = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const darkStart = css.indexOf(":root[data-theme='dark']")
  const dark = css.slice(darkStart, css.indexOf('\n  }\n', darkStart) + 1)
  it('--dialog-footer-bg (#fbfcfc), --on-primary-700, --row-unread-bg e --row-divider-soft existem no claro e no escuro', () => {
    expect(light).toContain('--dialog-footer-bg: #fbfcfc;')
    expect(light).toContain('--on-primary-700: #ffffff;')
    expect(light).toContain('--row-unread-bg: #f7fbfa;')
    expect(light).toContain('--row-divider-soft: #f0f4f3;')
    for (const token of ['--dialog-footer-bg', '--on-primary-700', '--row-unread-bg', '--row-divider-soft']) {
      expect(dark, `dark sem ${token}`).toContain(`${token}:`)
    }
  })
  it('o rodape do formulario em modal usa --dialog-footer-bg (nao mais --surface-alt)', () => {
    expect(stripComments(css)).toMatch(/\.process-form--dialog \.pfd-footer \{[^}]*background: var\(--dialog-footer-bg\);/)
  })
})

describe('F5a - secoes, escopo e ordem', () => {
  it('as 3 secoes existem, antes do bloco reduce desktop (que segue ultimo)', () => {
    expect(f5aNewsAt).toBeGreaterThan(0)
    expect(f5aNotifAt).toBeGreaterThan(f5aNewsAt)
    expect(f5aPrefsAt).toBeGreaterThan(f5aNotifAt)
    expect(f5aEnd).toBeGreaterThan(f5aPrefsAt)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f5aEnd)
    expect(css.slice(css.lastIndexOf(REDUCE_DESKTOP)).match(/@media/g)).toHaveLength(1)
  })

  it('nenhum @media (max-width) nas secoes e toda regra comeca pela raiz da tela', () => {
    const whole = stripComments(css.slice(f5aStartOf(f5aNewsAt), f5aEnd))
    expect(whole).not.toMatch(/@media\s*\(max-width/)
    const NEWS_ROOT = /^(\[data-theme='dark'\] )?(\.surface--news|\.surface\.surface--news|\.modal-backdrop\.nw-modal-backdrop|\.modal\.nw-modal|\.nw-modal)/
    for (const rule of [...f5aNewsRules, ...f5aNewsCompactRules]) {
      for (const selector of rule.selectors) expect(selector, `seletor sem a raiz: ${selector}`).toMatch(NEWS_ROOT)
    }
    const NOTIF_ROOT = /^(\[data-theme='dark'\] )?(\.surface\.notifications-page|\.notifications-page)/
    for (const rule of f5aNotifRules) {
      for (const selector of rule.selectors) expect(selector, `seletor sem a raiz: ${selector}`).toMatch(NOTIF_ROOT)
    }
    const PREFS_ROOT = /^(\.modal-backdrop\.prefs-modal-backdrop|\.modal\.prefs-modal|\.prefs-modal |\.notification-prefs--desktop)/
    for (const rule of f5aPrefsRules) {
      for (const selector of rule.selectors) expect(selector, `seletor sem a raiz: ${selector}`).toMatch(PREFS_ROOT)
    }
  })

  it('so tokens: nenhuma cor literal nas tres secoes', () => {
    const all = [...f5aNewsRules, ...f5aNewsCompactRules, ...f5aNotifRules, ...f5aPrefsRules].map((r) => r.body).join(' ')
    expect(all.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
    expect(all.match(/rgba?\([^)]*\)/g)).toBeNull()
  })

  it('os blocos desktop legados (Ciclo 3a Noticias e 6d Notificacoes) foram substituidos', () => {
    const clean = stripComments(css)
    expect(clean).not.toContain('.surface--news .news-grid')
    expect(clean).not.toContain('.notifications-page .notifications__group')
    expect(clean).not.toContain('.notifications-page .notifications__filters')
  })
})

describe('F5a - Noticias (valores do Noticias.dc.html)', () => {
  it('cabecalho: eyebrow mono 11/600 1.5px; titulo Sora 30/700 -0.02em; raiz sem cartao', () => {
    expectF5a(f5aNewsRules, '.surface.surface--news.surface--news-desktop', ['padding: 0', 'gap: 20px', 'border: 0', 'background: none'])
    expectF5a(f5aNewsRules, '.surface--news .nw-head__eyebrow', ['font-family: var(--font-mono)', 'font-size: 11px', 'letter-spacing: 1.5px', 'color: var(--primary-700)', 'text-transform: uppercase'])
    expectF5a(f5aNewsRules, '.surface--news .nw-head__title', ['font-family: var(--font-heading)', 'font-size: 30px', 'font-weight: 700', 'letter-spacing: -0.02em'])
    expectF5a(f5aNewsRules, '.surface--news .nw-head__new', ['gap: 8px', 'padding: 0 18px'])
  })

  it('grade auto-fit minmax(380px, 1fr) gap 20; cartao com hover so de sombra + borda (200 ms)', () => {
    expectF5a(f5aNewsRules, '.surface--news .nw-grid', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr))', 'gap: 20px', 'align-items: start'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card:not(.nw-card--skeleton):hover', ['border-color: var(--border-strong)', 'box-shadow: var(--shadow-md)'])
    expect(f5aNewsRules.find((r) => r.selectors.includes('.surface--news .nw-card')).body).toContain('box-shadow var(--dur-base) var(--ease-out)')
  })

  it('destaque: raio 22, capa 300, corpo 22/24/24, titulo Sora 24 lh 1.25, resumo 15/1.6, "Ler notícia" 14/700', () => {
    expectF5a(f5aNewsRules, '.surface--news .nw-card--featured', ['border-radius: 22px', 'overflow: hidden'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--featured .nw-cover', ['height: 300px'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--featured .nw-card__body', ['gap: 10px', 'padding: 22px 24px 24px'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--featured .nw-card__title', ['font-family: var(--font-heading)', 'font-size: 24px', 'letter-spacing: -0.01em', 'line-height: 1.25'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--featured .nw-card__summary', ['font-size: 15px', 'line-height: 1.6', 'color: var(--ink-soft)'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card__cta', ['gap: 6px', 'font-size: 14px', 'font-weight: 700', 'color: var(--link-color)'])
    expectF5a(f5aNewsRules, '.surface--news .nw-cover', ['background: var(--media-placeholder)'])
  })

  it('fonte em pilula: propria --navy-50/--navy, externa --info-50/--info-700; pilula do destaque 3x10 12px, da linha 2x8 11px', () => {
    expectF5a(f5aNewsRules, '.surface--news .nw-source--own', ['background: var(--navy-50)', 'color: var(--navy)'])
    expectF5a(f5aNewsRules, '.surface--news .nw-source--ext', ['background: var(--info-50)', 'color: var(--info-700)'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--featured .nw-source', ['padding: 3px 10px', 'font-size: 12px'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--row .nw-source', ['padding: 2px 8px', 'font-size: 11px'])
    expectF5a(f5aNewsRules, "[data-theme='dark'] .surface--news .nw-source--own", ['color: var(--primary-700)'])
  })

  it('"Anteriores": titulo Sora 18, linhas 96/1fr/16 gap 14 padding 10/14/10/10 raio 16, capa 72 raio 10, "Carregar mais" 44', () => {
    expectF5a(f5aNewsRules, '.surface--news .nw-aside__title', ['font-family: var(--font-heading)', 'font-size: 18px', 'margin: 0 0 4px'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--row', ['border-radius: 16px'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--row .nw-card__link', ['grid-template-columns: 96px minmax(0, 1fr) 16px', 'gap: 14px', 'padding: 10px 14px 10px 10px'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--row .nw-cover', ['height: 72px', 'border-radius: 10px'])
    expectF5a(f5aNewsRules, '.surface--news .nw-card--row .nw-card__title', ['font-size: 14px', 'font-weight: 700', 'line-height: 1.35'])
    expectF5a(f5aNewsRules, '.surface--news .nw-aside__more', ['height: 44px', 'border: 1px solid var(--border)', 'border-radius: 12px', 'color: var(--navy)', 'font-size: 13px'])
  })

  it('detalhe: dialogo 22px sobre --scrim, capa 280, "x" de 44 sticky, titulo Sora 26, secoes em cartao; notebook compacta', () => {
    expectF5a(f5aNewsRules, '.modal-backdrop.nw-modal-backdrop', ['padding: 40px', 'background: var(--scrim)'])
    expectF5a(f5aNewsRules, '.modal.nw-modal', ['width: min(860px, 100%)', 'padding: 0', 'border-radius: 22px', 'box-shadow: var(--shadow-xl)'])
    expectF5a(f5aNewsRules, '.nw-modal .nw-detail__cover', ['height: 280px'])
    expectF5a(f5aNewsRules, '.nw-modal .nw-detail__close', ['position: sticky', 'width: 44px', 'height: 44px', 'border-radius: 12px'])
    expectF5a(f5aNewsRules, '.nw-modal .nw-detail__title', ['font-family: var(--font-heading)', 'font-size: 26px'])
    expectF5a(f5aNewsRules, '.nw-modal .nw-detail__section', ['border-radius: 16px', 'background: var(--surface-alt)'])
    expectF5a(f5aNewsCompactRules, '.surface--news .nw-card--featured .nw-cover', ['height: 220px'])
    expectF5a(f5aNewsCompactRules, '.modal.nw-modal', ['max-height: calc(100vh - 32px)'])
  })

  it('JSX: arvore por matchMedia, "Editar" so em manual, bare + nw-modal no detalhe, paginacao de "Anteriores"', () => {
    const page = read('src/pages/NewsPage.jsx').replace(/\r\n/g, '\n')
    expect(page).toContain("const isDesktop = useMediaQuery('(min-width: 1041px)')")
    expect(page).toContain("const canEdit = isAdmin && item.sourceType !== 'automatic'")
    expect(page).toContain('bare={isDesktop}')
    expect(page).toContain("className={isDesktop ? 'nw-modal' : 'news-modal'}")
    expect(page).toContain('const OLDER_PAGE_SIZE = 4')
    expect(page).toContain('Carregar mais')
    expect(page).toContain('COMEX · MERCADO · OPERAÇÃO')
    expect(stripComments(page)).not.toMatch(/toISOString\(\)|console\.log/)
  })
})

describe('F5a - Central de notificacoes (valores do Notificacoes.dc.html)', () => {
  it('raiz: max-width 1040, gap 18, sem cartao; cabecalho como o das Noticias; acoes 44', () => {
    expectF5a(f5aNotifRules, '.surface.notifications-page.notifications-page--desktop', ['max-width: 1040px', 'gap: 18px', 'padding: 0', 'border: 0', 'background: none'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-head__eyebrow', ['font-family: var(--font-mono)', 'font-size: 11px', 'letter-spacing: 1.5px', 'text-transform: uppercase'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-head__title', ['font-size: 30px', 'letter-spacing: -0.02em'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-icon-button', ['width: 44px', 'height: 44px', 'border: 1px solid var(--border)', 'border-radius: 12px'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-icon-button--active', ['border-color: var(--warning)', 'background: var(--warning-50)', 'color: var(--warning-700)'])
  })

  it('pilulas (FilterPill) com gap 6 e contagem mono 700 opacity .8', () => {
    expectF5a(f5aNotifRules, '.notifications-page .nt-filters', ['display: flex', 'flex-wrap: wrap', 'gap: 6px'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-filters .nt-filter .filter-pill__count', ['font-weight: 700', 'opacity: 0.8'])
  })

  it('cartao de grupo raio 18; cabecalho 14/18; linha 40/1fr/auto gap 14 padding 14/18; ladrilho 40 raio 12; ponto 8', () => {
    expectF5a(f5aNotifRules, '.notifications-page .nt-group', ['border: 1px solid var(--border)', 'border-radius: 18px', 'overflow: hidden'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-group__head', ['padding: 14px 18px', 'border-bottom: 1px solid var(--row-divider)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row', ['gap: 14px', 'padding: 14px 18px', 'border-top: 1px solid var(--row-divider-soft)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row--unread', ['background: var(--row-unread-bg)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row:hover', ['background: var(--bg-tint-1)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__open', ['grid-template-columns: 40px minmax(0, 1fr)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__icon', ['width: 40px', 'height: 40px', 'border-radius: 12px'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__dot', ['width: 8px', 'height: 8px'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row--unread .nt-row__dot', ['background: var(--primary)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__mark', ['height: 36px', 'padding: 0 12px', 'border-radius: 10px', 'font-size: 12px', 'font-weight: 700'])
  })

  it('tons do ladrilho: info/ok/warn/danger com os tokens do mock', () => {
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__icon--info', ['background: var(--info-50)', 'color: var(--info-700)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__icon--ok', ['background: var(--channel-green-soft)', 'color: var(--channel-green-ink)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__icon--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-row__icon--danger', ['background: var(--danger-50)', 'color: var(--danger-700)'])
  })

  it('"Anteriores": botao de 56 raio 16, chevron gira 180 ao abrir, "Ver mais" 44 verde', () => {
    expectF5a(f5aNotifRules, '.notifications-page .nt-older', ['border-radius: 16px', 'border: 1px solid var(--border)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-older__toggle', ['height: 56px', 'padding: 0 18px', 'font-size: 14px', 'font-weight: 700'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-older--open .nt-older__chevron', ['transform: rotate(180deg)'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-section__more', ['height: 44px', 'color: var(--link-color)', 'font-size: 13px', 'font-weight: 700'])
    expectF5a(f5aNotifRules, '.notifications-page .nt-group__more', ['height: 44px', 'border-top: 1px solid var(--row-divider-soft)', 'color: var(--link-color)', 'font-size: 13px', 'font-weight: 700'])
  })

  it('JSX: arvore por matchMedia, 10 filtros, FilterPill, DND com os mesmos aria-labels, variant="page"', () => {
    const page = read('src/pages/NotificationsPage.jsx').replace(/\r\n/g, '\n')
    expect(page).toContain('const isDesktop = useMediaQuery(DESKTOP_QUERY)')
    expect((page.match(/\{ value: '/g) ?? []).length).toBe(10)
    expect(page).toContain('<FilterPill')
    expect(page).toContain("'Ativar modo não perturbe por 1 hora'")
    expect(page).toContain('variant="page"')
    expect(page).toContain('processTitles={processTitles}')
    expect(page).toContain('getProcessTitle(process, canSeeName)')
    expect(page).toContain('await listProcesses()')
    expect(page).toContain('name="bell-slash"')
    expect(page).toContain('name="sliders"')
    const list = read('src/components/NotificationsList.jsx')
    expect(list).toContain("variant === 'page'")
    expect(list).toContain('Ver mais {Math.min(OLDER_STEP, allOlder.length - olderLimit)} anteriores')
    expect(stripComments(list)).not.toMatch(/toISOString\(\)|console\.log/)
  })
})

describe('F5a - Preferencias (valores do Preferencias.dc.html)', () => {
  it('dialogo 22px: 664 de largura, padding 26/28, --shadow-xl sobre --scrim; titulo Sora 22; lead 14/1.55', () => {
    expectF5a(f5aPrefsRules, '.modal-backdrop.prefs-modal-backdrop', ['padding: 28px', 'background: var(--scrim)'])
    expectF5a(f5aPrefsRules, '.modal.prefs-modal', ['width: min(664px, 100%)', 'padding: 26px 28px', 'border-radius: 22px', 'box-shadow: var(--shadow-xl)'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop', ['gap: 18px'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .prefs-head__title', ['font-family: var(--font-heading)', 'font-size: 22px', 'font-weight: 700', 'letter-spacing: -0.01em'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .notification-prefs__lead', ['font-size: 14px', 'line-height: 1.55', 'color: var(--ink-soft)'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .prefs-head__close', ['width: 44px', 'height: 44px', 'border-radius: 12px', 'background: var(--surface-alt)'])
  })

  it('tabela: colunas de 96, linhas 14/0 com --row-divider, tipo 15/700, dica 12; alvo 44x44; caixa 22 raio 7 1.5px', () => {
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .notification-prefs__grid thead th', ['width: 96px', 'padding: 0 0 10px', 'font-size: 12px', 'font-weight: 700'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .notification-prefs__grid td', ['padding: 14px 0', 'border-top: 1px solid var(--row-divider)'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .notification-prefs__type', ['font-size: 15px', 'font-weight: 700'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .prefs-check', ['width: 44px', 'height: 44px'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .prefs-check__box', ['width: 22px', 'height: 22px', 'border: 1.5px solid var(--border-control)', 'border-radius: 7px'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .prefs-check input:checked + .prefs-check__box', ['border-color: var(--primary-700)', 'background: var(--primary-700)', 'color: var(--on-primary-700)'])
  })

  it('rodape: Cancelar (fantasma) 0/16 e "Salvar preferências" (primario) 0/18 a direita, gap 8', () => {
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .action-row', ['justify-content: flex-end', 'gap: 8px'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .action-row .ghost-button', ['padding: 0 16px'])
    expectF5a(f5aPrefsRules, '.notification-prefs--desktop .action-row .primary-button', ['padding: 0 18px'])
  })

  it('JSX: bare + prefs-modal no desktop; input nativo dentro do label; fluxo de permissao do navegador mantido', () => {
    const modal = read('src/components/NotificationPreferencesModal.jsx').replace(/\r\n/g, '\n')
    expect(modal).toContain('bare={isDesktop}')
    expect(modal).toContain("className={isDesktop ? 'prefs-modal' : ''}")
    expect(modal).toContain('<label className="prefs-check">')
    expect(modal).toContain('await fcm.enable()')
    expect(modal).toContain('isIosNotInstalled()')
  })
})

describe('F5a - icones novos', () => {
  it('Icon.jsx traz bell-slash, sliders, mail, clock, eye, eye-off, more e robot com os paths dos mock-ups', () => {
    const icons = read('src/components/Icon.jsx')
    expect(icons).toContain("'bell-slash': <path d=\"M6 8a6 6 0 0 1 9.3-5M18 8c0 7 3 9 3 9H7M10 21h4M3 3l18 18\" />")
    expect(icons).toContain('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0')
    expect(icons).toContain('M12 7v5l3 2')
    expect(icons).toContain('M12 3v4M9 12h.01M15 12h.01M9 16h6')
    for (const name of ['sliders', 'mail', 'clock', 'eye', "'eye-off'", 'more', 'robot']) expect(icons).toContain(`${name}:`)
  })
})

// ---------------------------------------------------------------------------
// F5b - Login e estados de acesso (Login.dc.html, AcessoEstados.dc.html).
// CSS = 1 secao "REFINO VISUAL F5b" com um bloco base (elementos novos escondidos, sem media),
// UM @media desktop e o compacto de notebook dos estados (altura <= 800); o login compacta em
// src/notebook.css. Toda regra comeca por uma raiz propria (.auth-screen--login|verify|pending|
// not-found) porque `.auth-screen` e compartilhado por 7 telas. Sem @media (max-width): tablet e
// mobile nao mudam (D2).
// ---------------------------------------------------------------------------
const F5B_MARK = 'REFINO VISUAL F5b — LOGIN E ESTADOS DE ACESSO'
const f5bMarkAt = css.indexOf(F5B_MARK)
const f5bStart = css.lastIndexOf('/*', f5bMarkAt)
// F6a: a secao F5b termina onde comeca a secao F6a (que vem logo depois, antes do bloco reduce).
const f5bEnd = css.lastIndexOf('/*', css.indexOf('REFINO VISUAL F6a — ADMIN'))
const F5B_COMPACT_MEDIA = '@media (min-width: 1041px) and (max-height: 800px) {'
const f5bSection = stripComments(css.slice(f5bStart, f5bEnd))
const f5bMediaAt = f5bSection.indexOf(DESKTOP_MEDIA)
const f5bBaseRules = parseRules(f5bSection.slice(0, f5bMediaAt))
const f5bRules = parseRules(bodyAfter(f5bSection, DESKTOP_MEDIA))
const f5bCompactRules = parseRules(bodyAfter(f5bSection, F5B_COMPACT_MEDIA))

function expectF5b(rules, selector, declarations) {
  const bodies = rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F5b: ${selector}`).toBeGreaterThan(0)
  const body = bodies.join(' ')
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F5b - tokens novos (com contraparte dark)', () => {
  const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const darkStart = css.indexOf(":root[data-theme='dark']")
  const darkBlock = css.slice(darkStart, css.indexOf('\n  }\n', darkStart) + 1)
  it('--auth-brand-ink, --auth-card-shadow, --auth-state-shadow, --auth-seg-shadow, --on-navy-line e --on-navy-fill (claro e escuro)', () => {
    expect(lightBlock).toContain('--auth-brand-ink: #e8f4f6;')
    expect(lightBlock).toContain('--auth-card-shadow: 0 20px 48px rgba(0, 65, 83, 0.14);')
    expect(lightBlock).toContain('--auth-state-shadow: 0 6px 18px rgba(0, 65, 83, 0.08);')
    expect(lightBlock).toContain('--auth-seg-shadow: 0 1px 3px rgba(0, 65, 83, 0.14);')
    expect(lightBlock).toContain('--on-navy-line: rgba(255, 255, 255, 0.3);')
    expect(lightBlock).toContain('--on-navy-fill: rgba(255, 255, 255, 0.06);')
    for (const token of ['--auth-brand-ink', '--auth-card-shadow', '--auth-state-shadow', '--auth-seg-shadow', '--on-navy-line', '--on-navy-fill']) {
      expect(darkBlock, `dark sem ${token}`).toContain(`${token}:`)
    }
  })
})

describe('F5b - secao, escopo e ordem', () => {
  it('a secao existe antes do bloco reduce desktop (que segue ultimo) e depois das tres secoes F5a', () => {
    expect(f5bMarkAt).toBeGreaterThan(css.indexOf('REFINO VISUAL F5a — PREFERENCIAS DE NOTIFICACAO'))
    expect(f5bEnd).toBeGreaterThan(f5bMarkAt)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f5bEnd)
    expect(css.slice(css.lastIndexOf(REDUCE_DESKTOP)).match(/@media/g)).toHaveLength(1)
  })

  it('nenhum @media (max-width): tablet e mobile ficam como estao (D2)', () => {
    expect(f5bSection).not.toMatch(/@media\s*\(max-width/)
    expect(f5bSection.match(/@media/g)).toHaveLength(2)
  })

  it('toda regra comeca por uma raiz propria (.auth-screen--login|verify|pending|not-found)', () => {
    const ROOT = /^\.auth-screen--(login|verify|pending|not-found)\b/
    for (const rule of [...f5bBaseRules, ...f5bRules, ...f5bCompactRules]) {
      for (const selector of rule.selectors) expect(selector, `seletor sem raiz: ${selector}`).toMatch(ROOT)
    }
    expect(f5bRules.length).toBeGreaterThan(90)
  })

  it('o bloco base so esconde os elementos novos (ficam fora de tablet/mobile)', () => {
    const hidden = f5bBaseRules.find((r) => r.selectors.includes('.auth-screen--login .auth-sq-signature'))
    expect(hidden.body).toBe('display: none;')
    for (const selector of [
      '.auth-screen--login .auth-brand__mark',
      '.auth-screen--login .auth-card__legal',
      '.auth-screen--verify .auth-state__icon',
      '.auth-screen--verify .auth-status__headline',
      '.auth-screen--pending .auth-state__icon',
      '.auth-screen--pending .auth-diagnostic-toggle',
    ]) {
      expect(hidden.selectors, selector).toContain(selector)
    }
    expectF5b(f5bBaseRules, '.auth-screen--login .auth-brand__head', ['display: contents'])
    expectF5b(f5bBaseRules, '.auth-screen--verify .auth-state__actions', ['display: contents'])
  })

  it('so tokens: nenhuma cor literal na secao', () => {
    const all = [...f5bBaseRules, ...f5bRules, ...f5bCompactRules].map((r) => r.body).join(' ')
    expect(all.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
    expect(all.match(/rgba?\([^)]*\)/g)).toBeNull()
  })

  it('o bloco legado do painel de marca (560px, raio 22) foi removido do Ciclo 3c/6e', () => {
    const clean = stripComments(css)
    expect(clean).not.toContain('flex: 0 0 560px')
    expect(clean).not.toMatch(/\n  \.auth-brand \{/)
    expect(clean).not.toContain('.auth-brand__feat small {\n    color: var(--sidebar-ink-soft);\n    font-size: var(--fs-caption);')
  })

  it('movimento: as transicoes novas entram no bloco reduce existente (sem bloco reduce novo)', () => {
    const reduce = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    for (const selector of [
      '.auth-screen--login .auth-toggle__item',
      '.auth-screen--login .auth-password',
      '.auth-screen--login .auth-password__toggle',
      '.auth-screen--pending .auth-diagnostic-toggle svg',
    ]) {
      expect(reduce, selector).toContain(selector)
    }
  })
})

describe('F5b - Login (valores do Login.dc.html)', () => {
  it('painel da marca: 600px em altura total, padding 56 56 0, gap 28, sem raio nem sombra', () => {
    expectF5b(f5bRules, '.auth-screen--login', ['align-items: stretch', 'gap: 0', 'padding: 0'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand', [
      'flex: 0 0 600px',
      'max-width: 600px',
      'gap: 28px',
      'padding: 56px 56px 0',
      'border-radius: 0',
      'background: var(--sidebar-bg)',
      'box-shadow: none',
      'color: var(--auth-brand-ink)',
    ])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__logo', ['display: none'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__eyebrow', ['display: none'])
  })

  it('cabecalho: marca de 56 + h1 Sora 52/700 -0.02em lh 1.05 + paragrafo 17/1.6 max 440', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__head', ['display: flex', 'flex-direction: column', 'gap: 16px', 'margin-top: 24px'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand h1', ['font-family: var(--font-heading)', 'font-size: 52px', 'font-weight: 700', 'letter-spacing: -0.02em', 'line-height: 1.05'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand p', ['max-width: 440px', 'font-size: 17px', 'line-height: 1.6', 'color: var(--sidebar-ink-soft)'])
  })

  it('2 features: ladrilho 40 raio 12 (menta 16%) + titulo 15 branco + texto 14', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__feats', ['gap: 16px'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__feat', ['gap: 14px', 'align-items: flex-start'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__feat-icon', ['width: 40px', 'height: 40px', 'border-radius: 12px', 'background: var(--sidebar-pill-active)', 'color: var(--primary)'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__feat strong', ['font-size: 15px', 'color: var(--sidebar-ink)'])
    expectF5b(f5bRules, '.auth-screen--login .auth-brand__feat small', ['font-size: 14px', 'color: var(--sidebar-ink-soft)'])
  })

  it('assinatura SQ Quimica: canto inferior direito (right 40, bottom 32), acima da arte', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-sq-signature', ['display: block', 'position: absolute', 'right: 40px', 'bottom: 32px', 'z-index: 2', 'pointer-events: none'])
  })

  it('card: 440px, padding 36, raio 22, sombra do mock, gap 18; eyebrow mono 11/600 1.5px', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-card', ['width: min(100%, 440px)', 'padding: 36px', 'border-radius: 22px', 'background: var(--surface)', 'box-shadow: var(--auth-card-shadow)'])
    expectF5b(f5bRules, '.auth-screen--login .auth-card--form', ['gap: 18px'])
    expectF5b(f5bRules, '.auth-screen--login .auth-panel .brand__eyebrow', ['font-family: var(--font-mono)', 'font-size: 11px', 'font-weight: 600', 'letter-spacing: 1.5px', 'text-transform: uppercase', 'color: var(--primary-700)'])
  })

  it('segmentado: trilho --bg raio 12 padding 4; item 40px raio 9 14/700; ativo --surface + sombra', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-toggle', ['gap: 0', 'padding: 4px', 'border-radius: 12px', 'background: var(--bg)'])
    expectF5b(f5bRules, '.auth-screen--login .auth-toggle__item', ['height: 40px', 'border-radius: 9px', 'font-size: 14px', 'font-weight: 700', 'color: var(--ink-soft)'])
    expectF5b(f5bRules, '.auth-screen--login .auth-toggle__item--active', ['background: var(--surface)', 'box-shadow: var(--auth-seg-shadow)', 'color: var(--ink)'])
  })

  it('titulo Sora 26/700; paragrafo do modo login escondido (D20) e visivel no cadastro', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-card h1', ['font-family: var(--font-heading)', 'font-size: 26px', 'font-weight: 700', 'letter-spacing: -0.02em'])
    expectF5b(f5bRules, '.auth-screen--login .auth-card__lead--login', ['display: none'])
    expectF5b(f5bRules, '.auth-screen--login .auth-card__lead', ['font-size: 13px', 'color: var(--ink-soft)'])
  })

  it('campos 48px raio 12 15/500; rotulo da senha 13/600 sem caixa-alta; "Esqueci minha senha" 13/700 verde', () => {
    expectF5b(f5bRules, '.auth-screen--login input.text-input', ['height: 48px', 'min-height: 48px', 'padding: 0 14px', 'border-radius: 12px', 'font-size: 15px', 'font-weight: 500'])
    expectF5b(f5bRules, '.auth-screen--login .auth-field__row', ['display: flex', 'justify-content: space-between'])
    expectF5b(f5bRules, '.auth-screen--login .auth-field__label', ['margin: 0', 'font-size: 13px', 'font-weight: 600', 'text-transform: none', 'color: var(--ink)'])
    expectF5b(f5bRules, '.auth-screen--login label.field', ['margin-bottom: 0'])
    expectF5b(f5bRules, '.auth-screen--login .auth-link-button', ['font-size: 13px', 'font-weight: 700', 'color: var(--link-color)'])
    expectF5b(f5bRules, '.auth-screen--login .auth-link-button:hover', ['color: var(--link-color-hover)'])
  })

  it('senha: contorno 1.5px --border-control (D1) no wrapper, foco navy + halo, botao olho 40x40 raio 10', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-password', ['height: 48px', 'padding: 0 4px 0 14px', 'border: 1.5px solid var(--border-control)', 'border-radius: 12px'])
    expectF5b(f5bRules, '.auth-screen--login .auth-password:focus-within', ['border-color: var(--focus-ring)', 'box-shadow: 0 0 0 4px var(--primary-a28)'])
    expectF5b(f5bRules, '.auth-screen--login .auth-password input.text-input', ['border: 0', 'box-shadow: none', 'padding: 0'])
    expectF5b(f5bRules, '.auth-screen--login .auth-password__toggle', ['width: 40px', 'height: 40px', 'border-radius: 10px', 'color: var(--ink-soft)'])
  })

  it('Entrar 48px 15/700; rodape "Acesso restrito" 12 centralizado; banners sem sombra e raio 14', () => {
    expectF5b(f5bRules, '.auth-screen--login .auth-button', ['width: 100%', 'min-height: 48px', 'font-size: 15px'])
    expectF5b(f5bRules, '.auth-screen--login .auth-card__legal', ['display: block', 'font-size: 12px', 'text-align: center', 'color: var(--ink-soft)'])
    expectF5b(f5bRules, '.auth-screen--login .error-banner', ['border-radius: 14px', 'box-shadow: none'])
    expectF5b(f5bRules, '.auth-screen--login .auth-reset-panel', ['border-radius: 14px', 'background: var(--surface-alt)', 'box-shadow: none'])
  })

  it('carta nautica: painel de 600 (cena do porto sangra 56 de cada lado), navios a 25vw + 340 e o de volta como no mock (-712 a 1440)', () => {
    const art = stripComments(css.slice(css.indexOf('/* LOGIN-ART:START */'), css.indexOf('/* LOGIN-ART:END */')))
    expect(art).toMatch(/\.login-port-scene \{[^}]*width: calc\(100% \+ 112px\);[^}]*margin: auto -56px 0;/)
    expect(art).toContain('transform: translateX(calc(25vw + 340px));')
    expect(art).toContain('transform: translateX(calc((25vw + 340px) / 0.75));')
    expect(art).toContain('transform: translateX(calc(-25vw - 352px));')
    // longitudes saem da coluna de latitude; latitudes nao descem para a assinatura
    expect(art).toMatch(/\.login-chart__lon \{[^}]*mask-image: linear-gradient\(to left, transparent 100px, black 170px\);/)
    expect(art).toMatch(/\.login-chart__lat \{[^}]*mask-image: linear-gradient\(to bottom, black calc\(100% - 84px\), transparent calc\(100% - 84px\)\);/)
  })
})

describe('F5b - carta nautica: rosa dos ventos e marcas de onda (review r1)', () => {
  const art = stripComments(css.slice(css.indexOf('/* LOGIN-ART:START */'), css.indexOf('/* LOGIN-ART:END */')))
  const specificity = (selector) => {
    const ids = (selector.match(/#[\w-]+/g) ?? []).length
    const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length
    const types = (selector.replace(/\.[\w-]+|\[[^\]]*\]|::?[\w-]+|#[\w-]+|[>+~]/g, ' ').match(/\b[a-z][a-z0-9]*\b/gi) ?? []).length
    return [ids, classes, types]
  }
  const gte = (a, b) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])))

  it('1041-1247px esconde a rosa dos ventos com especificidade >= `.login-chart > svg`', () => {
    const body = bodyAfter(art, '@media (min-width: 1041px) and (max-width: 1247px) {')
    expect(body).not.toBeNull()
    const rule = parseRules(body).find((r) => r.body.includes('display: none;'))
    expect(rule).toBeTruthy()
    const selector = rule.selectors[0]
    expect(selector).toContain('.login-chart__compass')
    expect(gte(specificity(selector), specificity('.login-chart > svg'))).toBe(true)
    // o display:block do filho direto existe (e e o que o seletor acima precisa vencer)
    expect(art).toMatch(/\.login-chart > svg \{[^}]*display: block;/)
  })

  it('a marca de onda de baixo que ficava sob a assinatura SQ Quimica subiu (y = 120)', () => {
    const src = read('src/components/LoginArt.jsx').replace(/\r\n/g, '\n')
    const marks = src.match(/const MARKS_BOTTOM = \[([\s\S]*?)\]\n/)[1]
    expect(marks).toContain('[1370, 120]')
    expect(marks).not.toContain('[1370, 200]')
    // a lane de baixo tem 240px e a assinatura ocupa 32..68px do rodape: marcas a x >= 841 (onde a
    // assinatura pode cair a partir de 1041px) precisam ficar acima de 68px do rodape
    const parsed = [...marks.matchAll(/\[(\d+), (\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(parsed.length).toBe(3)
    for (const [x, y] of parsed.filter(([px]) => px >= 841)) {
      expect(240 - y, 'marca [' + x + ', ' + y + '] na faixa da assinatura').toBeGreaterThan(68)
    }
    expect(240 - 120).toBeGreaterThan(68)
  })
})

describe('F5b - Verificar e-mail, Acesso pendente e 404 (valores do AcessoEstados.dc.html)', () => {
  const ROOTS = ['.auth-screen--verify', '.auth-screen--pending', '.auth-screen--not-found']

  it('card: 424px, padding 32, raio 22, sombra do mock, gap 16; titulo Sora 24/700 -0.01em; eyebrow escondido', () => {
    for (const root of ROOTS) {
      expectF5b(f5bRules, `${root} .auth-card`, ['width: min(100%, 424px)', 'padding: 32px', 'border-radius: 22px', 'box-shadow: var(--auth-state-shadow)'])
      expectF5b(f5bRules, `${root} .auth-card--form`, ['gap: 16px'])
      expectF5b(f5bRules, `${root} .brand__eyebrow`, ['display: none'])
      expectF5b(f5bRules, `${root} .auth-card h1`, ['font-family: var(--font-heading)', 'font-size: 24px', 'font-weight: 700', 'letter-spacing: -0.01em'])
    }
    expectF5b(f5bRules, '.auth-screen--verify .auth-card > p', ['font-size: 15px', 'line-height: 1.6', 'color: var(--ink-soft)'])
  })

  it('ladrilho de icone 56 raio 16: e-mail = info, relogio = aviso, alerta = perigo', () => {
    expectF5b(f5bRules, '.auth-screen--verify .auth-state__icon', ['width: 56px', 'height: 56px', 'border-radius: 16px'])
    expectF5b(f5bRules, '.auth-screen--verify .auth-state__icon--info', ['background: var(--info-50)', 'color: var(--info-700)'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-state__icon--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-state__icon--danger', ['background: var(--danger-50)', 'color: var(--danger-700)'])
  })

  it('caixa de status: padding 14 16 raio 14, rotulo mono 10/600 1.5px; proximo passo em aviso/perigo', () => {
    expectF5b(f5bRules, '.auth-screen--verify .auth-status', ['padding: 14px 16px', 'border-radius: 14px', 'background: var(--surface-alt)', 'gap: 4px'])
    expectF5b(f5bRules, '.auth-screen--verify .auth-status strong', ['font-family: var(--font-mono)', 'font-size: 10px', 'font-weight: 600', 'letter-spacing: 1.5px', 'text-transform: uppercase', 'color: var(--ink-soft)'])
    expectF5b(f5bRules, '.auth-screen--verify .auth-status__headline', ['display: block', 'font-size: 14px', 'font-weight: 700'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-next-step--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-next-step--danger', ['background: var(--danger-50)', 'color: var(--danger-700)'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-next-step p', ['font-size: 14px', 'font-weight: 600', 'line-height: 1.5'])
  })

  it('"Status atual" vira etiqueta de 26px no tom do estado', () => {
    expectF5b(f5bRules, '.auth-screen--pending .auth-status-line', ['height: 26px', 'padding: 0 10px', 'border-radius: 999px', 'font-size: 12px', 'font-weight: 700'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-status-line::before', ['content: none'])
  })

  it('diagnostico: botao de 44px com borda tracejada (--border-strong), recolhido por padrao', () => {
    expectF5b(f5bRules, '.auth-screen--pending .auth-diagnostic-toggle', ['height: 44px', 'padding: 0 14px', 'border: 1px dashed var(--border-strong)', 'border-radius: 12px', 'font-size: 13px', 'font-weight: 600', 'color: var(--ink-soft)'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-diagnostic-toggle[aria-expanded=\'true\'] svg', ['transform: rotate(180deg)'])
    expectF5b(f5bRules, '.auth-screen--pending .auth-diagnostic--collapsed', ['display: none'])
  })

  it('acoes empilhadas (gap 8): primario 48 15/700, secundario e fantasma 44; "Sair" em --ink-soft', () => {
    for (const root of ROOTS) expectF5b(f5bRules, `${root} .auth-state__actions`, ['display: flex', 'flex-direction: column', 'gap: 8px'])
    expectF5b(f5bRules, '.auth-screen--verify .auth-state__actions .primary-button', ['min-height: 48px', 'font-size: 15px', 'width: 100%'])
    expectF5b(f5bRules, '.auth-screen--verify .auth-state__actions .ghost-button', ['min-height: 44px', 'width: 100%'])
    expectF5b(f5bRules, '.auth-screen--verify .auth-state__actions .ghost-button:not(.ghost-button--secondary)', ['color: var(--ink-soft)'])
  })

  it('404: card navy; "404" mono 64/600 menta; caminho mono 12 em --on-navy-fill; secundario com contorno translucido (6a)', () => {
    expectF5b(f5bRules, '.auth-screen--not-found .auth-card', ['background: var(--navy)', 'box-shadow: none', 'color: var(--auth-brand-ink)'])
    expectF5b(f5bRules, '.auth-screen--not-found .auth-card h1', ['color: var(--sidebar-ink)'])
    expectF5b(f5bRules, '.auth-screen--not-found .auth-state__title p', ['color: var(--sidebar-ink-soft)'])
    expectF5b(f5bRules, '.auth-screen--not-found .auth-error-code', ['order: -1'])
    expectF5b(f5bRules, '.auth-screen--not-found .auth-error-code code', ['font-family: var(--font-mono)', 'font-size: 64px', 'font-weight: 600', 'letter-spacing: -0.02em', 'line-height: 1', 'color: var(--primary)'])
    expectF5b(f5bRules, '.auth-screen--not-found .auth-error-path', ['padding: 10px 12px', 'border-radius: 10px', 'background: var(--on-navy-fill)', 'font-family: var(--font-mono)', 'font-size: 12px'])
    expectF5b(f5bRules, '.auth-screen--not-found .auth-state__actions .ghost-button.ghost-button--secondary', ['border: 1.5px solid var(--on-navy-line)', 'background: transparent', 'color: var(--sidebar-ink)'])
  })

  it('notebook (altura <= 800): estados compactam (padding 24, gap 12, icone 44)', () => {
    for (const root of ROOTS) expectF5b(f5bCompactRules, `${root} .auth-card`, ['padding: 24px'])
    expectF5b(f5bCompactRules, '.auth-screen--verify .auth-state__icon', ['width: 44px', 'height: 44px'])
    expectF5b(f5bCompactRules, '.auth-screen--not-found .auth-error-code code', ['font-size: 48px'])
  })
})

describe('F5b - notebook.css (login compacto do #244 sobre o painel novo)', () => {
  const notebook = stripComments(read('src/notebook.css'))
  it('o painel parte de x = 0: deslocamento da carta = --nb-login-w - 600px e formulas dos navios recalculadas', () => {
    expect(notebook).toContain('--nb-login-shift: calc(var(--nb-login-w) - 600px);')
    expect(notebook).toContain('transform: translateX(calc(25vw + 490px - var(--nb-login-w) / 4));')
    expect(notebook).toContain('transform: translateX(calc((25vw + 490px - var(--nb-login-w) / 4) / 0.75));')
    expect(notebook).toContain('transform: translateX(calc(var(--nb-login-w) / 4 - 25vw - 502px));')
    expect(notebook).toContain('right: calc(25vw - var(--nb-login-w) / 4 - 146px);')
  })
  it('sem lista de recursos, marca de 44 e campos/botao baixos (clamp) no login', () => {
    expect(notebook).toMatch(/\.auth-screen--login \.auth-brand__mark \{\s*width: 44px;\s*height: 44px;/)
    expect(notebook).toMatch(/\.auth-screen--login \.auth-brand__feats \{\s*display: none;/)
    expect(notebook).toMatch(/\.auth-screen--login input\.text-input,\s*\.auth-screen--login \.auth-password \{\s*height: clamp\(40px, 7vh, 48px\);/)
    expect(notebook).toMatch(/\.auth-screen--login \.auth-button \{\s*min-height: clamp\(40px, 7vh, 48px\);/)
  })
})

// Fontes lidas uma vez: cada tela tem o proprio describe (e o proprio commit da fase).
const f5bReadLf = (rel) => read(rel).replace(/\r\n/g, '\n')
const f5bNoComments = (src) => stripComments(src).replace(/^\s*\/\/.*$/gm, '')
const f5bLogin = f5bReadLf('src/pages/LoginPage.jsx')
const f5bVerify = f5bReadLf('src/pages/VerifyEmailPage.jsx')
const f5bPending = f5bReadLf('src/pages/PendingApprovalPage.jsx')
const f5bNotFound = f5bReadLf('src/pages/NotFoundPage.jsx')
const f5bArt = f5bReadLf('src/components/LoginArt.jsx')

describe('F5b - JSX Login', () => {
  it('marca do produto no painel, assinatura SQ Quimica e campo de senha por matchMedia', () => {
    expect(f5bLogin).toContain("import { ProductMark, SqQuimicaLogo } from '../components/BrandMark'")
    expect(f5bLogin).toContain('<ProductMark product="comex" tone="dark" size={56} className="auth-brand__mark" />')
    expect(f5bLogin).toContain('<SqQuimicaLogo variant="minusc" tone="light" size={36} label="SQ Química" />')
    expect(f5bLogin).toContain('className="auth-sq-signature"')
    expect(f5bLogin).toContain("import useMediaQuery from '../hooks/useMediaQuery'")
    expect(f5bLogin).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(f5bLogin).toContain('const isDesktop = useMediaQuery(DESKTOP_QUERY)')
    // o hook vem antes de qualquer retorno antecipado (regra dos hooks)
    expect(f5bLogin.indexOf('useMediaQuery(DESKTOP_QUERY)')).toBeLessThan(f5bLogin.indexOf('<Navigate'))
    expect(f5bLogin).toContain("aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}")
    expect(f5bLogin).toContain('aria-pressed={showPassword}')
    expect(f5bLogin).toContain('placeholder="Sua senha"')
    expect(f5bLogin).toContain('Acesso restrito a colaboradores e parceiros da SQ Química.')
  })

  it('eyebrow e logo PNG continuam no DOM (cabecalho mobile) e o h1 do painel e unico', () => {
    expect(f5bLogin).toContain('<img src={sqQuimicaLogo} alt="SQ Química" />')
    expect(f5bLogin).toContain('SQ Química · Suite COMEX')
    expect((f5bLogin.match(/<h1>Portal COMEX<\/h1>/g) ?? []).length).toBe(1)
  })

  it('icones das features do mock (nav-arrivals e bell-ring, 18 / traco 1.9)', () => {
    expect(f5bLogin).toContain('<Icon name="nav-arrivals" size={18} strokeWidth={1.9} />')
    expect(f5bLogin).toContain('<Icon name="bell-ring" size={18} strokeWidth={1.9} />')
  })

  it('LoginArt: latitudes a partir de 24°10′S deixam de ser desenhadas (D16), sem remover do array', () => {
    expect(f5bArt).toContain('const LAT_VISIBLE_COUNT = 4')
    // F6a: alem do corte por indice, so desenha o rotulo que cabe inteiro (medido no SVG).
    expect(f5bArt).toMatch(/LAT_LABELS\.map\(\(label, k\) =>\s*k < LAT_VISIBLE_COUNT && k < latCount \?/)
    expect(f5bArt).toContain("'24°25′S',")
    expect(f5bArt).toContain('y={LAT_Y0 + LAT_STEP * k}')
    expect(f5bArt).toContain('const LAT_Y0 = 144')
    expect(f5bArt).toContain('const LAT_STEP = 180')
  })

  it('sem toISOString, console.log nem hex nos JSX do login', () => {
    for (const source of [f5bLogin, f5bArt]) {
      expect(f5bNoComments(source)).not.toMatch(/toISOString\(\)|console\.log/)
      expect(f5bNoComments(source)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })
})
// @@F5B-VERIFY
describe('F5b - JSX Verificar e-mail', () => {
  it('raiz propria, ladrilho de e-mail, caixa de status e acoes agrupadas', () => {
    expect((f5bVerify.match(/auth-screen auth-screen--verify/g) ?? []).length).toBe(2)
    expect(f5bVerify).toContain('<Icon name="mail" size={26} strokeWidth={1.8} />')
    expect(f5bVerify).toContain('className="auth-reset-panel auth-status" role="status"')
    expect(f5bVerify).toContain('Aguardando confirmação')
    expect(f5bVerify).toContain('className="auth-state__actions"')
    expect(f5bVerify).toContain('Já confirmei meu email')
    expect(f5bVerify).toContain('Reenviar email de confirmação')
    expect(f5bVerify).toContain('Voltar ao login')
  })

  it('sem toISOString, console.log nem hex', () => {
    expect(f5bNoComments(f5bVerify)).not.toMatch(/toISOString\(\)|console\.log/)
    expect(f5bNoComments(f5bVerify)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
// @@F5B-PENDING
describe('F5b - JSX Acesso pendente', () => {
  it('raiz propria, tom por estado, "Proximo passo", etiqueta de status e diagnostico recolhivel', () => {
    expect(f5bPending).toContain('auth-screen auth-screen--pending')
    expect(f5bPending).toContain("const tone = isRejected || isBlocked ? 'danger' : 'warn'")
    expect(f5bPending).toContain("name={tone === 'danger' ? 'alert-triangle' : 'clock'}")
    expect(f5bPending).toContain('auth-next-step auth-next-step--${tone}')
    expect(f5bPending).toContain('success-banner auth-status-line auth-status-line--${tone}')
    expect(f5bPending).toContain('aria-expanded={diagnosticOpen}')
    expect(f5bPending).toContain('aria-controls="auth-diagnostic-panel"')
    expect(f5bPending).toContain('Diagnóstico (para o suporte)')
    expect(f5bPending).toContain('Forçar reload das claims')
    expect(f5bPending).toContain('Diagnóstico (claims lidas agora)')
  })

  it('sem toISOString, console.log nem hex', () => {
    expect(f5bNoComments(f5bPending)).not.toMatch(/toISOString\(\)|console\.log/)
    expect(f5bNoComments(f5bPending)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
// @@F5B-NOTFOUND
describe('F5b - JSX 404', () => {
  it('raiz propria, "Codigo: 404" com rotulo so para leitor de tela, caminho e links', () => {
    expect(f5bNotFound).toContain('auth-screen auth-screen--not-found')
    expect(f5bNotFound).toContain('<span className="auth-error-code__label">Código: </span>')
    expect(f5bNotFound).toContain('<code>404</code>')
    expect(f5bNotFound).toContain('className="auth-error-path"')
    expect(f5bNotFound).toContain('data-testid="not-found-home"')
    expect(f5bNotFound).toContain('data-testid="not-found-news"')
    expect(f5bNotFound).toContain('Se você chegou aqui por um link')
  })

  it('sem toISOString, console.log nem hex', () => {
    expect(f5bNoComments(f5bNotFound)).not.toMatch(/toISOString\(\)|console\.log/)
    expect(f5bNoComments(f5bNotFound)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

// ---------------------------------------------------------------------------
// F6a - Admin: Usuarios, Comunicados e Barra do porto (AdminUsuarios.dc.html, AdminComunicados.dc.html,
// AdminBarra.dc.html). CSS = 1 secao "REFINO VISUAL F6a" com UM @media desktop; toda regra comeca pela
// moldura da pagina (.admin-section) ou por uma raiz de painel (.admin-panel, .admin-panel--users|
// --announcements|--bar). Os tres paineis escolhem a arvore por matchMedia (au-*, ac-*, ab-* + atomos ad-*);
// tablet e mobile seguem na arvore anterior. Sem @media (max-width) e sem cor literal.
// ---------------------------------------------------------------------------
const F6A_MARK = 'REFINO VISUAL F6a — ADMIN'
const f6aMarkAt = css.indexOf(F6A_MARK)
const f6aStart = css.lastIndexOf('/*', f6aMarkAt)
// a secao da F6a termina onde comeca a da F6b (que vem logo depois, antes do bloco reduce)
const f6aEnd = css.lastIndexOf('/*', css.indexOf('REFINO VISUAL F6b — ADMIN'))
const f6aSection = stripComments(css.slice(f6aStart, f6aEnd))
const f6aRules = parseRules(bodyAfter(f6aSection, DESKTOP_MEDIA))

function expectF6a(selector, declarations) {
  const bodies = f6aRules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F6a: ${selector}`).toBeGreaterThan(0)
  const body = bodies.join(' ')
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F6a - secao, escopo e ordem', () => {
  it('a secao existe depois da F5b, antes do bloco reduce desktop (que segue ultimo) e tem UM @media desktop', () => {
    expect(f6aMarkAt).toBeGreaterThan(css.indexOf('REFINO VISUAL F5b — LOGIN E ESTADOS DE ACESSO'))
    expect(f6aEnd).toBeGreaterThan(f6aStart)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f6aEnd)
    expect(css.slice(css.lastIndexOf(REDUCE_DESKTOP)).match(/@media/g)).toHaveLength(1)
    expect(f6aSection.match(/@media/g)).toHaveLength(1)
    expect(f6aSection.trim().startsWith(DESKTOP_MEDIA)).toBe(true)
  })

  it('nenhum @media (max-width): tablet e mobile ficam como estao', () => {
    expect(f6aSection).not.toMatch(/@media\s*\(max-width/)
  })

  it('toda regra comeca pela moldura (.admin-section) ou por uma raiz de painel', () => {
    const ROOT = /^(\[data-theme='dark'\] )?(\.surface\.admin-section|\.admin-section \.admin-panel-stack|\.admin-panel(--users|--announcements|--bar)?\b)/
    for (const rule of f6aRules) {
      for (const selector of rule.selectors) expect(selector, `seletor sem raiz: ${selector}`).toMatch(ROOT)
    }
    expect(f6aRules.length).toBeGreaterThan(60)
  })

  it('so tokens: nenhuma cor literal na secao', () => {
    const all = f6aRules.map((r) => r.body).join(' ')
    expect(all.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
    expect(all.match(/rgba?\([^)]*\)/g)).toBeNull()
  })

  it('moldura: o cartao ao redor das abas e paineis some (mocks: abas e paineis direto sobre o fundo)', () => {
    expectF6a('.surface.admin-section', ['gap: 20px', 'padding: 0', 'border: 0', 'border-radius: 0', 'background: none', 'box-shadow: none'])
    expectF6a('.admin-section .admin-panel-stack', ['gap: 20px'])
  })

  it('o <label> global (margin-bottom 6px, caixa alta) nao vaza para os campos e cartoes dos paineis', () => {
    expectF6a('.admin-panel label.field', ['margin-bottom: 0'])
    expectF6a('.admin-panel--bar .ab-option', ['margin: 0', 'letter-spacing: normal', 'text-transform: none'])
  })

  it('atomos: cartao 22/22 com borda --border, etiqueta 3x10 12/700 por tom, rodape com divisor', () => {
    expectF6a('.admin-panel .ad-card', ['gap: 14px', 'padding: 22px', 'border: 1px solid var(--border)', 'border-radius: 22px', 'background: var(--surface)'])
    expectF6a('.admin-panel .ad-title', ['font-family: var(--font-heading)', 'font-size: 20px', 'font-weight: 700'])
    expectF6a('.admin-panel .ad-pill', ['padding: 3px 10px', 'border-radius: 99px', 'font-size: 12px', 'font-weight: 700'])
    expectF6a('.admin-panel .ad-pill--ok', ['background: var(--success-50)', 'color: var(--success-700)'])
    expectF6a('.admin-panel .ad-pill--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF6a('.admin-panel .ad-pill--danger', ['background: var(--danger-50)', 'color: var(--danger-700)'])
    expectF6a('.admin-panel .ad-pill--neutral', ['background: var(--neutral-50)', 'color: var(--neutral-700)'])
    expectF6a('.admin-panel .ad-pill--info', ['background: var(--info-50)', 'color: var(--info-700)'])
    expectF6a('.admin-panel .ad-footer', ['justify-content: space-between', 'padding-top: 14px', 'border-top: 1px solid var(--row-divider)'])
    expectF6a('.admin-panel .ad-delete', ['padding: 0 14px', 'color: var(--danger-700)'])
    expectF6a('.admin-panel .ad-mono', ['font-family: var(--font-mono)'])
  })

  it('dark: o destaque navy do painel vira --primary', () => {
    expectF6a('.admin-panel', ['--ad-accent: var(--navy)'])
    expectF6a("[data-theme='dark'] .admin-panel", ['--ad-accent: var(--primary)'])
  })
})

describe('F6a - Usuarios (valores do AdminUsuarios.dc.html)', () => {
  it('2 colunas auto-fit minmax(420px, 1fr) gap 20; filtros 1fr + 160px gap 10 com rotulo 12/700', () => {
    expectF6a('.admin-panel--users .au-grid', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr))', 'align-items: start', 'gap: 20px'])
    expectF6a('.admin-panel--users .au-filters', ['grid-template-columns: minmax(0, 1fr) 160px', 'gap: 10px'])
    expectF6a('.admin-panel--users .au-filters .field > span', ['font-size: 12px', 'font-weight: 700'])
  })

  it('linha: grid 40px 1fr auto gap 12, padding 10, raio 12; hover --surface-alt (200 ms); selecionada --navy-50 + anel 1.5px', () => {
    expectF6a('.admin-panel--users .au-row', ['grid-template-columns: 40px minmax(0, 1fr) auto', 'gap: 12px', 'padding: 10px', 'border-radius: 12px', 'background: transparent'])
    expect(f6aRules.find((r) => r.selectors.includes('.admin-panel--users .au-row')).body).toContain('background-color var(--dur-base) var(--ease-out)')
    expectF6a('.admin-panel--users .au-row:hover:not(.au-row--skeleton)', ['background: var(--surface-alt)'])
    expectF6a('.admin-panel--users .au-row--selected', ['background: var(--navy-50)', 'box-shadow: inset 0 0 0 1.5px var(--ad-accent)'])
  })

  it('avatar da linha 40 raio 12 (navy quando selecionada); nome 14/700; meta 12 --ink-soft; UID mono', () => {
    expectF6a('.admin-panel--users .au-row__avatar', ['width: 40px', 'height: 40px', 'border-radius: 12px', 'background: var(--row-divider)', 'color: var(--navy)', 'font-size: 14px', 'font-weight: 700'])
    expectF6a('.admin-panel--users .au-row--selected .au-row__avatar', ['background: var(--navy)', 'color: var(--brand-mark-glyph)'])
    expectF6a("[data-theme='dark'] .admin-panel--users .au-row__avatar", ['color: var(--ink)'])
    expectF6a('.admin-panel--users .au-row__name', ['font-size: 14px', 'font-weight: 700'])
    expectF6a('.admin-panel--users .au-row__meta', ['font-size: 12px', 'color: var(--ink-soft)'])
  })

  it('detalhe: avatar 52 raio 14 navy 18/700; UID mono 12; campos em 2 colunas gap 14', () => {
    expectF6a('.admin-panel--users .au-avatar', ['width: 52px', 'height: 52px', 'border-radius: 14px', 'background: var(--navy)', 'color: var(--brand-mark-glyph)', 'font-size: 18px', 'font-weight: 700'])
    expectF6a('.admin-panel--users .au-uid', ['font-family: var(--font-mono)', 'font-size: 12px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--users .au-detail-head', ['gap: 14px', 'align-items: center'])
    expectF6a('.admin-panel--users .au-detail-head__title', ['align-items: center', 'gap: 4px 10px'])
    expectF6a('.admin-panel--users .au-new-user', ['gap: 8px', 'margin-left: auto', 'padding: 0 14px'])
    expectF6a('.admin-panel--users .au-fields', ['grid-template-columns: repeat(2, minmax(0, 1fr))', 'gap: 14px'])
  })

  it('chips de permissao: --primary-50 / --success-700, 5x12, 12/700, gap 6', () => {
    expectF6a('.admin-panel--users .au-chips', ['flex-wrap: wrap', 'gap: 6px'])
    expectF6a('.admin-panel--users .au-chip', ['padding: 5px 12px', 'border-radius: 99px', 'background: var(--primary-50)', 'color: var(--success-700)', 'font-size: 12px', 'font-weight: 700'])
    expectF6a('.admin-panel--users .au-perms__label', ['font-size: 13px', 'font-weight: 600'])
  })

  it('fila: cartoes --surface-alt raio 16 padding 16 gap 12, grade minmax(340px, 1fr); nome 15/700, e-mail 13', () => {
    expectF6a('.admin-panel--users .au-queue', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr))', 'gap: 12px'])
    expectF6a('.admin-panel--users .au-pending', ['gap: 12px', 'padding: 16px', 'border: 1px solid var(--row-divider)', 'border-radius: 16px', 'background: var(--surface-alt)'])
    expectF6a('.admin-panel--users .au-pending__name', ['font-size: 15px', 'font-weight: 700'])
    expectF6a('.admin-panel--users .au-pending__email', ['font-size: 13px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--users .au-pending__meta strong', ['color: var(--ink)'])
  })

  it('fila: botoes de 40 raio 10 13/700; Aprovar e Reprovar dividem a linha; Reprovar = contorno de perigo (review 1a)', () => {
    expectF6a('.admin-panel--users .au-pending__actions', ['gap: 8px'])
    expectF6a('.admin-panel--users .au-pending__actions .primary-button', ['min-height: 40px', 'height: 40px', 'border-radius: 10px', 'font-size: 13px'])
    expectF6a('.admin-panel--users .au-pending__approve', ['flex: 1'])
    expectF6a('.admin-panel--users .au-pending__reject', ['border: 1.5px solid var(--danger)', 'background: var(--surface)', 'color: var(--danger-700)', '--focus-ring: var(--danger)'])
    expectF6a('.admin-panel--users .au-pending__reject:hover:not(:disabled)', ['border-color: var(--danger)', 'background: var(--danger-50)'])
    expectF6a('.admin-panel--users .au-pending__reject:disabled', ['color: var(--disabled-ink)'])
  })

  it('avisos de email/senha em --warning-50/--warning-700 raio 14', () => {
    expectF6a('.admin-panel--users .au-note', ['padding: 10px 14px', 'border-radius: 14px', 'background: var(--warning-50)', 'color: var(--warning-700)', 'font-size: 12px'])
  })

  it('JSX: arvore por matchMedia, raiz .admin-panel--users, headings nivel 3, Reprovar sem o modificador secundario na arvore nova', () => {
    const panel = read('src/features/admin/AdminUsersPanel.jsx').replace(/\r\n/g, '\n')
    expect(panel).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(panel).toContain('const isDesktop = useMediaQuery(DESKTOP_QUERY)')
    expect(panel).toContain('className="admin-panel admin-panel--users au-root"')
    expect(panel).toContain('<h3 className="ad-title">Gestão de usuários</h3>')
    expect(panel).toContain('<h3 className="ad-title">Fila de aprovação</h3>')
    expect(panel).toContain('className="ghost-button au-pending__reject"')
    expect(panel).toContain('className="secondary-button"')
    // as etiquetas do mock distinguem Bloqueado (danger) de Reprovado (neutro); o dado gravado nao muda
    expect(panel).toContain("if (status === 'Bloqueado') return 'danger'")
    expect(panel).toMatch(/function statusMeta\(status\) \{[\s\S]*status === 'Bloqueado' \|\| status === 'Reprovado'[\s\S]*statusTone: 'neutral'/)
    expect(stripComments(panel)).not.toMatch(/toISOString\(\)|console\.log/)
  })

  it('movimento: a transicao da linha entra no bloco reduce existente (sem bloco reduce novo)', () => {
    const reduce = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(reduce).toContain('.admin-panel--users .au-row')
    expect(reduce).toContain('.admin-panel .ad-link-button')
  })
})

describe('F6a - Comunicados (valores do AdminComunicados.dc.html)', () => {
  it('cabecalho: titulo Sora 26/700 -0.02em, subtitulo 14, "Novo comunicado" com icone (gap 8, padding 0 18)', () => {
    expectF6a('.admin-panel--announcements .ac-head', ['align-items: flex-end', 'justify-content: space-between', 'gap: 12px'])
    expectF6a('.admin-panel--announcements .ac-title', ['font-family: var(--font-heading)', 'font-size: 26px', 'font-weight: 700', 'letter-spacing: -0.02em'])
    expectF6a('.admin-panel--announcements .ac-subtitle', ['font-size: 14px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--announcements .ac-new', ['gap: 8px', 'padding: 0 18px'])
  })

  it('2 colunas auto-fit minmax(400px, 1fr) gap 20; lista em painel de 12px com cartoes de 14/16', () => {
    expectF6a('.admin-panel--announcements .ac-grid', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr))', 'align-items: start', 'gap: 20px'])
    expectF6a('.admin-panel--announcements .ac-list', ['gap: 4px', 'padding: 12px'])
    expectF6a('.admin-panel--announcements .ac-row', ['gap: 6px', 'padding: 14px 16px', 'border-radius: 14px', 'background: transparent'])
    expect(f6aRules.find((r) => r.selectors.includes('.admin-panel--announcements .ac-row')).body).toContain('background-color var(--dur-base) var(--ease-out)')
  })

  it('cartao: hover --surface-alt; selecionado --navy-50 + anel 1.5px; canal em etiqueta 2x9; titulo 15/700; resumo 13/1.5', () => {
    expectF6a('.admin-panel--announcements .ac-row:hover:not(.ac-row--skeleton)', ['background: var(--surface-alt)'])
    expectF6a('.admin-panel--announcements .ac-row--selected', ['background: var(--navy-50)', 'box-shadow: inset 0 0 0 1.5px var(--ad-accent)'])
    expectF6a('.admin-panel--announcements .ac-row__meta', ['justify-content: space-between', 'font-size: 12px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--announcements .ac-row__channel', ['padding: 2px 9px'])
    expectF6a('.admin-panel--announcements .ac-row__title', ['font-size: 15px', 'font-weight: 700'])
    expectF6a('.admin-panel--announcements .ac-row__summary', ['font-size: 13px', 'line-height: 1.5', 'color: var(--ink-soft)'])
  })

  it('editor: titulo Sora 18/700; Titulo + Canal (200px) gap 12; dica 11 --ink-soft com contador mono', () => {
    expectF6a('.admin-panel--announcements .ac-editor__title', ['font-family: var(--font-heading)', 'font-size: 18px', 'font-weight: 700'])
    expectF6a('.admin-panel--announcements .ac-fields-row', ['grid-template-columns: minmax(0, 1fr) 200px', 'gap: 12px'])
    expectF6a('.admin-panel--announcements .ac-hint', ['font-size: 11px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--announcements .ac-hint__count', ['font-family: var(--font-mono)'])
    expectF6a('.admin-panel--announcements .ac-hint__count--over', ['color: var(--warning-700)'])
    expectF6a('.admin-panel--announcements .ac-field textarea.text-input', ['resize: vertical'])
  })

  it('previa: painel --surface-alt raio 14 padding 14; rotulo mono 10/600 1.5px; cartao --info-50 raio 12 padding 12/14 gap 4', () => {
    expectF6a('.admin-panel--announcements .ac-preview', ['gap: 8px', 'padding: 14px', 'border-radius: 14px', 'background: var(--surface-alt)'])
    expectF6a('.admin-panel--announcements .ac-preview__label', ['font-family: var(--font-mono)', 'font-size: 10px', 'font-weight: 600', 'letter-spacing: 1.5px', 'text-transform: uppercase'])
    expectF6a('.admin-panel--announcements .ac-preview__card', ['gap: 4px', 'padding: 12px 14px', 'border-radius: 12px', 'background: var(--info-50)'])
    expectF6a('.admin-panel--announcements .ac-preview__eyebrow', ['font-family: var(--font-mono)', 'font-size: 10px', 'letter-spacing: 1.5px', 'color: var(--info-700)'])
    expectF6a('.admin-panel--announcements .ac-preview__title', ['font-size: 14px', 'font-weight: 700'])
    expectF6a('.admin-panel--announcements .ac-preview__summary', ['font-size: 12px', 'color: var(--ink)'])
  })

  it('rodape do editor com padding-top 12 (mock) e sem campo/colecao novos no Firestore', () => {
    expectF6a('.admin-panel--announcements .ad-footer', ['padding-top: 12px'])
    const panel = read('src/features/admin/AdminAnnouncementsPanel.jsx').replace(/\r\n/g, '\n')
    // o resumo e' derivado (D10): nenhum campo "summary" entra no rascunho nem no payload
    expect(panel).not.toMatch(/summary:\s/)
    expect(panel).not.toContain("handleAnnouncementDraftChange('summary'")
    expect(read('firestore.rules')).not.toContain('summary')
  })

  it('JSX: arvore por matchMedia, raiz .admin-panel--announcements, h3 preservado, resumo pelos 140 caracteres', () => {
    const panel = read('src/features/admin/AdminAnnouncementsPanel.jsx').replace(/\r\n/g, '\n')
    expect(panel).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(panel).toContain('const isDesktop = useMediaQuery(DESKTOP_QUERY)')
    expect(panel).toContain('className="admin-panel admin-panel--announcements ac-root"')
    expect(panel).toContain('<h3 className="ac-title">Comunicados internos</h3>')
    expect(panel).toContain('summarizeAnnouncement(announcement.content)')
    expect(panel).toContain('ANNOUNCEMENT_SUMMARY_MAX')
    expect(panel).toContain('className="ghost-button ad-delete"')
    expect(stripComments(panel)).not.toMatch(/toISOString\(\)|console\.log/)
  })

  it('movimento: a transicao do cartao entra no bloco reduce existente', () => {
    expect(css.slice(css.lastIndexOf(REDUCE_DESKTOP))).toContain('.admin-panel--announcements .ac-row')
  })
})

describe('F6a - Barra do porto (valores do AdminBarra.dc.html)', () => {
  it('2 colunas auto-fit minmax(440px, 1fr) gap 20; cartao do status 24/24 gap 18; sem robo = uma coluna', () => {
    expectF6a('.admin-panel--bar .ab-grid', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr))', 'align-items: start', 'gap: 20px'])
    expectF6a('.admin-panel--bar .ab-grid--single', ['grid-template-columns: minmax(min(100%, 440px), calc(50% - 10px))'])
    expectF6a('.admin-panel--bar .ab-status-card', ['gap: 18px', 'padding: 24px'])
  })

  it('cabecalho: titulo Sora 24/700 -0.02em, subtitulo 14; etiqueta de 32px com ponto de 8px no tom do status', () => {
    expectF6a('.admin-panel--bar .ab-title', ['font-family: var(--font-heading)', 'font-size: 24px', 'font-weight: 700', 'letter-spacing: -0.02em'])
    expectF6a('.admin-panel--bar .ab-subtitle', ['font-size: 14px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--bar .ab-state', ['gap: 8px', 'height: 32px', 'padding: 0 12px', 'border-radius: 99px', 'font-size: 13px', 'font-weight: 700'])
    expectF6a('.admin-panel--bar .ab-state--ok', ['background: var(--success-50)', 'color: var(--success-700)'])
    expectF6a('.admin-panel--bar .ab-state--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF6a('.admin-panel--bar .ab-state--danger', ['background: var(--danger-50)', 'color: var(--danger-700)'])
    expectF6a('.admin-panel--bar .ab-state__dot', ['width: 8px', 'height: 8px', 'border-radius: 99px', 'background: var(--primary)'])
    expectF6a('.admin-panel--bar .ab-state--warn .ab-state__dot', ['background: var(--warning)'])
    expectF6a('.admin-panel--bar .ab-state--danger .ab-state__dot', ['background: var(--danger)'])
  })

  it('cartao de radio: grid 22/1fr/auto gap 14, padding 16, borda 1.5px, raio 14; marcado = borda navy + --surface-alt', () => {
    expectF6a('.admin-panel--bar .ab-options legend', ['padding: 0 0 10px', 'font-size: 13px', 'font-weight: 700'])
    expectF6a('.admin-panel--bar .ab-options', ['gap: 10px', 'border: 0', 'padding: 0'])
    expectF6a('.admin-panel--bar .ab-option', ['grid-template-columns: 22px minmax(0, 1fr) auto', 'gap: 14px', 'padding: 16px', 'border: 1.5px solid var(--border)', 'border-radius: 14px', 'background: var(--surface)'])
    expectF6a('.admin-panel--bar .ab-option--checked', ['border-color: var(--ad-accent)', 'background: var(--surface-alt)'])
    expectF6a('.admin-panel--bar .ab-option:has(input:focus-visible)', ['outline: 2px solid var(--focus-ring)'])
  })

  it('radio visual 22 (borda 2px) com ponto de 10; rotulo 15/700; dica 12; bolinha de tom 12 (D1: borda --border-control)', () => {
    expectF6a('.admin-panel--bar .ab-option input', ['position: absolute', 'width: 1px', 'height: 1px', 'opacity: 0'])
    expectF6a('.admin-panel--bar .ab-option__radio', ['width: 22px', 'height: 22px', 'border: 2px solid var(--border-control)', 'border-radius: 99px'])
    expectF6a('.admin-panel--bar .ab-option--checked .ab-option__radio', ['border-color: var(--ad-accent)'])
    expectF6a('.admin-panel--bar .ab-option__radio-dot', ['width: 10px', 'height: 10px', 'border-radius: 99px'])
    expectF6a('.admin-panel--bar .ab-option--checked .ab-option__radio-dot', ['background: var(--ad-accent)'])
    expectF6a('.admin-panel--bar .ab-option__label', ['font-size: 15px', 'font-weight: 700'])
    expectF6a('.admin-panel--bar .ab-option__hint', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--bar .ab-option__tone', ['width: 12px', 'height: 12px', 'border-radius: 99px', 'background: var(--primary)'])
    expectF6a('.admin-panel--bar .ab-option--warn .ab-option__tone', ['background: var(--warning)'])
    expectF6a('.admin-panel--bar .ab-option--danger .ab-option__tone', ['background: var(--danger)'])
    expectF6a('.admin-panel--bar .ab-save', ['align-self: flex-end', 'padding: 0 18px'])
  })

  it('cartao do robo: 20/20 gap 12; ladrilho 40 raio 12 --navy-50; nome 15/700; origem 12; texto lido 13/1.55 raio 12', () => {
    expectF6a('.admin-panel--bar .ab-side', ['gap: 14px'])
    expectF6a('.admin-panel--bar .ab-robot', ['gap: 12px', 'padding: 20px'])
    expectF6a('.admin-panel--bar .ab-robot__icon', ['width: 40px', 'height: 40px', 'border-radius: 12px', 'background: var(--navy-50)'])
    expectF6a('.admin-panel--bar .ab-robot__name', ['font-size: 15px', 'font-weight: 700'])
    expectF6a('.admin-panel--bar .ab-robot__source', ['font-size: 12px', 'color: var(--ink-soft)'])
    expectF6a('.admin-panel--bar .ab-robot__read', ['padding: 12px 14px', 'border-radius: 12px', 'background: var(--surface-alt)', 'font-size: 13px', 'line-height: 1.55'])
    expectF6a('.admin-panel--bar .ab-robot__read-label', ['color: var(--ink-soft)'])
  })

  it('avisos 12/14 raio 12 13/600: coincide ok, difere aviso, falha/atrasado perigo; Aplicar 36 raio 10 13/700', () => {
    expectF6a('.admin-panel--bar .ab-notice', ['gap: 10px', 'padding: 12px 14px', 'border-radius: 12px', 'font-size: 13px', 'font-weight: 600'])
    expectF6a('.admin-panel--bar .ab-notice--ok', ['background: var(--success-50)', 'color: var(--success-700)'])
    expectF6a('.admin-panel--bar .ab-notice--warn', ['background: var(--warning-50)', 'color: var(--warning-700)'])
    expectF6a('.admin-panel--bar .ab-notice--danger', ['background: var(--danger-50)', 'color: var(--danger-700)'])
    expectF6a('.admin-panel--bar .ab-notice__apply', ['height: 36px', 'padding: 0 14px', 'border-radius: 10px', 'background: var(--warning-700)', 'color: var(--on-primary-700)', 'font-size: 13px', 'font-weight: 700'])
  })

  it('JSX: arvore por matchMedia, raiz .admin-panel--bar, radios (fieldset/legend) com as mesmas opcoes do repositorio, sem select', () => {
    const panel = read('src/features/admin/AdminBarStatusPanel.jsx').replace(/\r\n/g, '\n')
    expect(panel).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(panel).toContain('const isDesktop = useMediaQuery(DESKTOP_QUERY)')
    expect(panel).toContain('className="admin-panel admin-panel--bar ab-root"')
    expect(panel).toContain('<h3 className="ab-title">Barra Itajaí/Navegantes</h3>')
    expect(panel).toContain('<legend>Status atual</legend>')
    expect(panel).toContain('type="radio"')
    expect(panel).toContain('BAR_STATUS_OPTIONS.map((option) => {')
    expect(panel).toContain("PRATICAVEL_RESTRICOES: { label: 'Praticável c/ restrições'")
    // a arvore anterior continua com o select
    expect(panel).toContain('<SelectField')
    expect(stripComments(panel)).not.toMatch(/toISOString\(\)|console\.log/)
  })

  it('movimento: a transicao do cartao de radio entra no bloco reduce existente', () => {
    expect(css.slice(css.lastIndexOf(REDUCE_DESKTOP))).toContain('.admin-panel--bar .ab-option')
  })
})

// ---------------------------------------------------------------------------
// F6b - Admin: Previsoes, Lead time e Suporte (AdminPrevisoes.dc.html, AdminLeadTime.dc.html,
// AdminSuporte.dc.html). CSS = 1 secao "REFINO VISUAL F6b" com UM @media desktop; toda regra comeca por uma
// raiz de painel (.admin-panel--forecast|--lead-time|--support). Os tres paineis escolhem a arvore por
// matchMedia (af-*, al-*, as-* + os atomos ad-* da F6a); tablet e mobile seguem na arvore anterior. Sem
// @media (max-width) e sem cor literal.
// ---------------------------------------------------------------------------
const F6B_MARK = 'REFINO VISUAL F6b — ADMIN'
const f6bMarkAt = css.indexOf(F6B_MARK)
const f6bStart = css.lastIndexOf('/*', f6bMarkAt)
const f6bEnd = css.indexOf('/* Roadmap 11 / PR #223')
const f6bSection = stripComments(css.slice(f6bStart, f6bEnd))
const f6bRules = parseRules(bodyAfter(f6bSection, DESKTOP_MEDIA))

function expectF6b(selector, declarations) {
  const bodies = f6bRules.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
  expect(bodies.length, `seletor sem regra no bloco F6b: ${selector}`).toBeGreaterThan(0)
  const body = bodies.join(' ')
  for (const declaration of declarations) expect(body, `${selector} -> ${declaration}`).toContain(`${declaration};`)
}

describe('F6b - secao, escopo e ordem', () => {
  it('a secao existe depois da F6a, antes do bloco reduce desktop (que segue ultimo) e tem UM @media desktop', () => {
    expect(f6bMarkAt).toBeGreaterThan(css.indexOf('REFINO VISUAL F6a — ADMIN'))
    expect(f6bEnd).toBeGreaterThan(f6bStart)
    expect(css.lastIndexOf(REDUCE_DESKTOP)).toBeGreaterThan(f6bEnd)
    expect(css.slice(css.lastIndexOf(REDUCE_DESKTOP)).match(/@media/g)).toHaveLength(1)
    expect(f6bSection.match(/@media/g)).toHaveLength(1)
    expect(f6bSection.trim().startsWith(DESKTOP_MEDIA)).toBe(true)
  })

  it('nenhum @media (max-width): tablet e mobile ficam como estao', () => {
    expect(f6bSection).not.toMatch(/@media\s*\(max-width/)
  })

  it('toda regra comeca por uma raiz de painel (forecast, lead-time ou support)', () => {
    const ROOT = /^(\[data-theme='dark'\] )?(\.admin-panel--(forecast|lead-time|support)\b|\.admin-section \.admin-panel-stack)/
    for (const rule of f6bRules) {
      for (const selector of rule.selectors) expect(selector, `seletor sem raiz: ${selector}`).toMatch(ROOT)
    }
    expect(f6bRules.length).toBeGreaterThan(40)
  })

  it('so tokens: nenhuma cor literal na secao', () => {
    const all = f6bRules.map((r) => r.body).join(' ')
    expect(all.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
    expect(all.match(/rgba?\([^)]*\)/g)).toBeNull()
  })

  it('a secao F6a nao contem mais nenhuma regra da F6b (cada secao tem as suas raizes)', () => {
    expect(f6aSection).not.toContain('admin-panel--forecast')
    expect(f6aSection).not.toContain('admin-panel--lead-time')
    expect(f6aSection).not.toContain('admin-panel--support')
  })
})

describe('F6b - Previsoes (valores do AdminPrevisoes.dc.html)', () => {
  it('barra de status: --surface 14/18 raio 16 com borda --border; ponto 8 --primary (--warning no fallback)', () => {
    expectF6b('.admin-panel--forecast .af-bar', ['justify-content: space-between', 'padding: 14px 18px', 'border: 1px solid var(--border)', 'border-radius: 16px', 'background: var(--surface)'])
    expectF6b('.admin-panel--forecast .af-status', ['gap: 10px', 'font-size: 13px', 'color: var(--ink-soft)'])
    expectF6b('.admin-panel--forecast .af-status strong', ['color: var(--ink)'])
    expectF6b('.admin-panel--forecast .af-status__dot', ['width: 8px', 'height: 8px', 'border-radius: 99px', 'background: var(--primary)'])
    expectF6b('.admin-panel--forecast .af-status__dot--fallback', ['background: var(--warning)'])
    expectF6b('.admin-panel--forecast .af-actions', ['gap: 8px'])
    expectF6b('.admin-panel--forecast .af-actions .secondary-button', ['padding: 0 16px'])
    expectF6b('.admin-panel--forecast .af-actions .primary-button', ['padding: 0 18px'])
  })

  it('grade: 2 colunas auto-fit minmax(440px, 1fr) gap 20; cartao 22/22 (atomo ad-card); titulo Sora 18/700', () => {
    expectF6b('.admin-panel--forecast .af-grid', ['grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr))', 'align-items: start', 'gap: 20px'])
    expectF6b('.admin-panel--forecast .af-col', ['flex-direction: column', 'gap: 20px'])
    expectF6b('.admin-panel--forecast .af-card__title', ['font-family: var(--font-heading)', 'font-size: 18px', 'font-weight: 700'])
    expectF6b('.admin-panel--forecast .af-card__note', ['font-size: 12px', 'color: var(--ink-soft)'])
  })

  it('tabela de destinos: cabecalho --surface-alt, divisor --row-divider, inputs de 36 raio 8 mono; Cutoff 90, Min 70', () => {
    expectF6b('.admin-panel--forecast .af-table-wrap', ['border: 1px solid var(--row-divider)', 'border-radius: 12px'])
    expectF6b('.admin-panel--forecast .af-table th', ['background: var(--surface-alt)', 'font-size: 13px', 'font-weight: 700', 'text-transform: none'])
    expectF6b('.admin-panel--forecast .af-table td', ['border-top: 1px solid var(--row-divider)'])
    expectF6b('.admin-panel--forecast .af-table .af-table__num', ['width: 90px'])
    expectF6b('.admin-panel--forecast .af-table th.af-table__num + th.af-table__num', ['width: 70px'])
    expectF6b('.admin-panel--forecast .af-table input.text-input', ['height: 36px', 'border-radius: 8px', 'font-size: 13px', 'font-weight: 600'])
    expectF6b('.admin-panel--forecast .af-table input.af-input--hour', ['width: 64px'])
    expectF6b('.admin-panel--forecast .af-table input.af-input--minute', ['width: 52px'])
  })

  it('"+ Adicionar destino": 40px, tracejado, raio 10, 13/700; Remover e botao de icone de 36 em perigo', () => {
    expectF6b('.admin-panel--forecast .af-add', ['height: 40px', 'padding: 0 12px', 'border: 1px dashed var(--border-control)', 'border-radius: 10px', 'font-size: 13px', 'font-weight: 700', 'color: var(--ad-accent)'])
    expectF6b('.admin-panel--forecast .af-remove', ['width: 36px', 'height: 36px', 'color: var(--danger-700)'])
    expectF6b('.admin-panel--forecast .af-remove:disabled', ['color: var(--disabled-ink)'])
  })

  it('dias uteis: 4 colunas gap 10, rotulo mono 11/600 1px, campo mono 16/600', () => {
    expectF6b('.admin-panel--forecast .af-cats', ['grid-template-columns: repeat(4, minmax(0, 1fr))', 'gap: 10px'])
    expectF6b('.admin-panel--forecast .af-cats .field > span', ['font-family: var(--font-mono)', 'font-size: 11px', 'font-weight: 600', 'letter-spacing: 1px', 'color: var(--ink-soft)'])
    expectF6b('.admin-panel--forecast .af-cats input.af-input--days', ['font-size: 16px', 'font-weight: 600'])
  })

  it('rolling: 140px + 1fr; campo composto sem .field (o global vazaria caixa alta); fichas 12 mono; interruptor 44x26', () => {
    expectF6b('.admin-panel--forecast .af-rolling', ['grid-template-columns: 140px minmax(0, 1fr)', 'gap: 12px'])
    expectF6b('.admin-panel--forecast .af-rolling input.af-input--rolling', ['font-size: 15px', 'font-weight: 600'])
    expectF6b('.admin-panel--forecast .af-field__label', ['font-size: 13px', 'font-weight: 600', 'text-transform: none', 'color: var(--ink)'])
    expectF6b('.admin-panel--forecast .af-tokens', ['min-height: 44px', 'border: 1.5px solid var(--border-control)', 'border-radius: var(--radius-field)'])
    expectF6b('.admin-panel--forecast .af-token', ['border-radius: 99px', 'background: var(--navy-50)', 'font-family: var(--font-mono)', 'font-size: 12px'])
    expectF6b('.admin-panel--forecast .af-switch__control', ['width: 44px', 'height: 26px'])
    expectF6b('.admin-panel--forecast .af-switch__track', ['background: var(--switch-off)'])
    expectF6b('.admin-panel--forecast .af-switch__input:checked + .af-switch__track', ['background: var(--primary-700)'])
  })

  it('alertas: rotulo 14/600 a esquerda e campo de 80 a direita', () => {
    expectF6b('.admin-panel--forecast .af-alert-row', ['justify-content: space-between', 'gap: 14px'])
    expectF6b('.admin-panel--forecast .af-alert-row__label', ['font-size: 14px', 'font-weight: 600'])
    expectF6b('.admin-panel--forecast .af-alert-row input.af-input--alert', ['width: 80px', 'font-size: 15px', 'font-weight: 600'])
  })

  it('JSX: arvore por matchMedia, raiz .admin-panel--forecast, h3 dos 4 cartoes, sem toISOString', () => {
    const page = read('src/pages/AdminForecastPage.jsx').replace(/\r\n/g, '\n')
    expect(page).toContain("const DESKTOP_QUERY = '(min-width: 1041px)'")
    expect(page).toContain('const isDesktop = useMediaQuery(DESKTOP_QUERY)')
    expect(page).toContain('className="admin-panel admin-panel--forecast af-root"')
    for (const title of ['Destinos e cutoff', 'Dias úteis por categoria', 'Rolling customs forecast', 'Alertas operacionais']) {
      expect(page).toContain(`<h3 className="af-card__title">${title}</h3>`)
    }
    expect(page).toContain('+ Adicionar destino')
    // a arvore anterior continua com o rodape e o selo
    expect(page).toContain('admin-feature-footer')
    expect(stripComments(page)).not.toMatch(/toISOString\(\)|console\.log/)
  })

  it('movimento: as transicoes de pilulas e botoes do painel entram no bloco reduce existente', () => {
    const reduce = css.slice(css.lastIndexOf(REDUCE_DESKTOP))
    expect(reduce).toContain('.admin-panel--forecast .af-add')
    expect(reduce).toContain('.admin-panel--forecast .af-switch__track')
  })
})
