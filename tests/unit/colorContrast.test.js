// UX-5 (D7): matematica WCAG de contraste embutida no proprio teste — nao
// cria src/utils/contrast.js (mudaria srcUtils.count no audit-vault-counts).
// Le src/styles.css como texto, extrai os tokens dos 4 blocos de tema
// (:root claro/dark, e a re-valoracao mobile no fim do arquivo, D6) e
// calcula a razao de contraste WCAG 2.x sobre cada fundo do contexto.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS_PATH = path.resolve(process.cwd(), 'src/styles.css')
const css = fs.readFileSync(CSS_PATH, 'utf8')

// ---------------------------------------------------------------------------
// Extracao de blocos { ... } por header literal, com contagem de chaves.
// ---------------------------------------------------------------------------
function extractBlock(source, header, fromIndex = 0) {
  const headerIndex = source.indexOf(header, fromIndex)
  if (headerIndex === -1) {
    throw new Error(`header nao encontrado: ${header} (a partir de ${fromIndex})`)
  }
  const braceStart = source.indexOf('{', headerIndex)
  let depth = 1
  let i = braceStart + 1
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') depth -= 1
    i += 1
  }
  return {
    body: source.slice(braceStart + 1, i - 1),
    headerIndex,
    endIndex: i,
  }
}

function extractVars(blockBody) {
  const vars = {}
  const re = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g
  let match
  while ((match = re.exec(blockBody))) {
    vars[`--${match[1]}`] = match[2].trim()
  }
  return vars
}

// ---------------------------------------------------------------------------
// Localizacao dos 4 blocos (D6): light/dark no topo, mobileRoot/mobileDark
// depois do marcador F16.1 (re-valoracao por cascata, fim do arquivo).
// ---------------------------------------------------------------------------
const MOBILE_MARKER = 'F16.1 — Fundações do redesign iOS'
const mobileMarkerIndex = css.indexOf(MOBILE_MARKER)
if (mobileMarkerIndex === -1) {
  throw new Error('marcador F16.1 nao encontrado em src/styles.css')
}

const lightBlock = extractBlock(css, ':root {')
const darkBlock = extractBlock(css, ":root[data-theme='dark'] {")
const mobileRootBlock = extractBlock(css, ':root {', mobileMarkerIndex)
const mobileDarkBlock = extractBlock(css, ":root[data-theme='dark'] {", mobileMarkerIndex)

const lightVars = extractVars(lightBlock.body)
const darkVarsRaw = extractVars(darkBlock.body)
const mobileRootVarsRaw = extractVars(mobileRootBlock.body)
const mobileDarkVarsRaw = extractVars(mobileDarkBlock.body)

// D6: root < mobileRoot < dark < mobileDark (cascata mobile dark).
const themes = {
  claro: { ...lightVars },
  dark: { ...lightVars, ...darkVarsRaw },
  'mobile claro': { ...lightVars, ...mobileRootVarsRaw },
  'mobile dark': { ...lightVars, ...mobileRootVarsRaw, ...darkVarsRaw, ...mobileDarkVarsRaw },
}

// ---------------------------------------------------------------------------
// Resolucao de var(--x, fallback) recursiva.
// ---------------------------------------------------------------------------
function resolveValue(value, theme, seen = new Set()) {
  const varRe = /var\((--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\)/
  let result = value
  let match = varRe.exec(result)
  let guard = 0
  while (match) {
    guard += 1
    if (guard > 50) throw new Error(`possivel loop resolvendo: ${value}`)
    const [full, name, fallback] = match
    if (seen.has(name)) {
      throw new Error(`referencia circular em var(): ${name}`)
    }
    let replacement = theme[name]
    if (replacement === undefined) replacement = fallback
    if (replacement === undefined) {
      throw new Error(`var nao resolvida: ${name}`)
    }
    const nextSeen = new Set(seen)
    nextSeen.add(name)
    replacement = resolveValue(replacement, theme, nextSeen)
    result = result.slice(0, match.index) + replacement + result.slice(match.index + full.length)
    match = varRe.exec(result)
  }
  return result.trim()
}

// ---------------------------------------------------------------------------
// Parser de cor: #rrggbb, #rgb, rgb()/rgba().
// ---------------------------------------------------------------------------
function parseColor(rawValue) {
  const value = rawValue.trim()
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('')
    }
    if (hex.length !== 6) {
      throw new Error(`hex invalido: ${value}`)
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    }
  }
  const rgbaMatch = value.match(/rgba?\(\s*([^)]+)\s*\)/)
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((s) => s.trim())
    const [r, g, b] = parts
    const a = parts[3] !== undefined ? Number(parts[3]) : 1
    return { r: Number(r), g: Number(g), b: Number(b), a }
  }
  throw new Error(`cor nao suportada: ${value}`)
}

// Composicao alfa do rgba sobre um fundo opaco (WCAG assume fundo opaco).
function compositeOverBackground(fg, bg) {
  const a = fg.a
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  }
}

function relativeLuminance({ r, g, b }) {
  const channel = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

function contrastRatio(colorA, colorB) {
  const lA = relativeLuminance(colorA)
  const lB = relativeLuminance(colorB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// Resolve um token do tema, compoe sobre um fundo hex e retorna a razao.
function ratioTokenOverBg(tokenName, theme, bgHexOrToken) {
  const tokenValue = theme[tokenName]
  if (tokenValue === undefined) {
    throw new Error(`token ausente no tema: ${tokenName}`)
  }
  const resolvedFg = resolveValue(tokenValue, theme)
  const fg = parseColor(resolvedFg)

  const bgValue = bgHexOrToken.startsWith('--') ? theme[bgHexOrToken] : bgHexOrToken
  const resolvedBg = resolveValue(bgValue, theme)
  const bg = parseColor(resolvedBg)
  if (bg.a !== 1) {
    throw new Error(`fundo precisa ser opaco: ${bgHexOrToken} -> ${resolvedBg}`)
  }

  const composited = fg.a < 1 ? compositeOverBackground(fg, bg) : fg
  return contrastRatio(composited, bg)
}

function fmt(ratio) {
  return `${ratio.toFixed(2)}:1`
}

const BACKGROUND_TOKENS = ['--surface', '--surface-alt', '--bg']

// ---------------------------------------------------------------------------
// (a) Sanidade da formula matematica em si (valores fixos, sem CSS).
// ---------------------------------------------------------------------------
describe('sanidade da formula WCAG', () => {
  it('#fff / #000 = 21.00', () => {
    expect(contrastRatio(parseColor('#ffffff'), parseColor('#000000'))).toBeCloseTo(21, 1)
  })

  it('#fff / #00ae91 = 2.81 (valor da auditoria, --primary antigo)', () => {
    expect(contrastRatio(parseColor('#ffffff'), parseColor('#00ae91'))).toBeCloseTo(2.81, 1)
  })

  it("#e3f5f0 / #fff = 1.13 (--primary-50 antigo do anel de foco)", () => {
    expect(contrastRatio(parseColor('#e3f5f0'), parseColor('#ffffff'))).toBeCloseTo(1.13, 1)
  })

  it('#071820 / #00ae91 = 6.43 (UX-6a, --on-primary sobre --primary)', () => {
    expect(contrastRatio(parseColor('#071820'), parseColor('#00ae91'))).toBeCloseTo(6.43, 1)
  })

  it('#1f0a0a / #f87171 = 6.86 (UX-6a, --on-danger dark sobre --danger dark)', () => {
    expect(contrastRatio(parseColor('#1f0a0a'), parseColor('#f87171'))).toBeCloseTo(6.86, 1)
  })
})

// ---------------------------------------------------------------------------
// (b) Botao verde: texto branco sobre --button-primary-bg/-hover/-active.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('botao primario (%s)', (themeName, theme) => {
  it.each(['--button-primary-bg', '--button-primary-bg-hover', '--button-primary-bg-active'])(
    'texto #ffffff sobre %s >= 4.5:1',
    (token) => {
      const resolvedTokenColor = resolveValue(theme[token], theme)
      const ratio = contrastRatio(parseColor('#ffffff'), parseColor(resolvedTokenColor))
      expect(ratio, `${token} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
    }
  )
})

// ---------------------------------------------------------------------------
// (c) Anel de foco sobre os 3 fundos.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--focus-ring (%s)', (themeName, theme) => {
  it.each(BACKGROUND_TOKENS)('sobre %s >= 3.0:1', (bgToken) => {
    const ratio = ratioTokenOverBg('--focus-ring', theme, bgToken)
    expect(ratio, `--focus-ring/${bgToken} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(3.0)
  })
})

// ---------------------------------------------------------------------------
// (d) Links sobre os 3 fundos.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('links (%s)', (themeName, theme) => {
  it.each(['--link-color', '--link-color-hover'])('%s sobre os 3 fundos >= 4.5:1', (token) => {
    for (const bgToken of BACKGROUND_TOKENS) {
      const ratio = ratioTokenOverBg(token, theme, bgToken)
      expect(ratio, `${token}/${bgToken} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

// ---------------------------------------------------------------------------
// (e) Texto esmaecido / suave sobre os 3 fundos.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('texto esmaecido (%s)', (themeName, theme) => {
  it.each(['--text-faint', '--text-subtle', '--text-muted', '--ink-soft'])(
    '%s sobre os 3 fundos >= 4.5:1',
    (token) => {
      for (const bgToken of BACKGROUND_TOKENS) {
        const ratio = ratioTokenOverBg(token, theme, bgToken)
        expect(ratio, `${token}/${bgToken} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
})

// ---------------------------------------------------------------------------
// (f) Borda de campo sobre os 3 fundos.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--border-control (%s)', (themeName, theme) => {
  it.each(['--border-control', '--border-control-hover'])('%s sobre os 3 fundos >= 3.0:1', (token) => {
    for (const bgToken of BACKGROUND_TOKENS) {
      const ratio = ratioTokenOverBg(token, theme, bgToken)
      expect(ratio, `${token}/${bgToken} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(3.0)
    }
  })
})

// ---------------------------------------------------------------------------
// (j) UX-6a: --on-primary sobre --primary.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--on-primary (%s)', (themeName, theme) => {
  it('sobre --primary >= 4.5:1', () => {
    const ratio = ratioTokenOverBg('--on-primary', theme, '--primary')
    expect(ratio, `--on-primary/--primary (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// (k) UX-6a (D2): --primary-700 sobre --surface, --surface-alt, --bg e
// --primary-50 (usos como texto: links de acao, secondary-button hover).
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--primary-700 texto (%s)', (themeName, theme) => {
  it.each(['--surface', '--surface-alt', '--bg', '--primary-50'])('sobre %s >= 4.5:1', (bgToken) => {
    const ratio = ratioTokenOverBg('--primary-700', theme, bgToken)
    expect(ratio, `--primary-700/${bgToken} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// (l) UX-6a (D3): --on-danger sobre --danger e --danger-700.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--on-danger (%s)', (themeName, theme) => {
  it.each(['--danger', '--danger-700'])('sobre %s >= 4.5:1', (bgToken) => {
    const ratio = ratioTokenOverBg('--on-danger', theme, bgToken)
    expect(ratio, `--on-danger/${bgToken} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// (m) UX-6a (item 12): --warning-700 sobre --warning-50 (ETA atualizada).
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--warning-700 (%s)', (themeName, theme) => {
  it('sobre --warning-50 >= 4.5:1', () => {
    const ratio = ratioTokenOverBg('--warning-700', theme, '--warning-50')
    expect(ratio, `--warning-700/--warning-50 (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// (n) UX-6a (D5): --on-button-primary sobre --button-primary-bg/-hover.
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--on-button-primary (%s)', (themeName, theme) => {
  it.each(['--button-primary-bg', '--button-primary-bg-hover'])('sobre %s >= 4.5:1', (bgToken) => {
    const ratio = ratioTokenOverBg('--on-button-primary', theme, bgToken)
    expect(ratio, `--on-button-primary/${bgToken} (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// (o2) AD-1 (adendo do orquestrador): --on-warn sobre --warning (botao
// Favoritar do swipe, fundo amarelo/dourado nos 2 temas).
// ---------------------------------------------------------------------------
describe.each(Object.entries(themes))('--on-warn (%s)', (themeName, theme) => {
  it('sobre --warning >= 4.5:1', () => {
    const ratio = ratioTokenOverBg('--on-warn', theme, '--warning')
    expect(ratio, `--on-warn/--warning (${themeName}) = ${fmt(ratio)}`).toBeGreaterThanOrEqual(4.5)
  })
})

// ---------------------------------------------------------------------------
// Guardas estruturais (g, h, i).
// ---------------------------------------------------------------------------
describe('guardas estruturais', () => {
  it('(g) .primary-button { usa var(--button-primary-bg)', () => {
    const { body } = extractBlock(css, '.primary-button {')
    expect(body).toContain('var(--button-primary-bg)')
  })

  it("(h) todo bloco :focus*/outline:none tem substituto var(--focus-ring), salvo allowlist", () => {
    // Allowlist (D2/D7): .command-palette__input e .text-input (base) nem
    // sequer tem ':focus' no seletor — ficam de fora do filtro. O unico
    // caso real e' a busca mobile, que troca o outline:none do input pelo
    // outline no container via :focus-within (verificado abaixo).
    const allowlist = ['.chegadas-search input:focus']

    const ruleRe = /([^{}]+)\{([^{}]*)\}/g
    let match
    let checked = 0
    while ((match = ruleRe.exec(css))) {
      const selector = match[1].trim()
      const body = match[2]
      if (!selector.includes(':focus')) continue
      if (!/outline\s*:\s*none/i.test(body)) continue
      checked += 1
      const isAllowed = allowlist.some((entry) => selector.includes(entry))
      if (isAllowed) continue
      expect(body, `seletor "${selector}" tem outline:none sem var(--focus-ring)`).toContain(
        'var(--focus-ring)'
      )
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('(h2) a busca mobile tem substituto via :focus-within com --focus-ring', () => {
    const { body } = extractBlock(css, '.chegadas-search:focus-within {')
    expect(body).toContain('var(--focus-ring)')
  })

  it('(i) nenhum bloco :focus/:focus-visible usa var(--primary-50) como anel (outline/box-shadow)', () => {
    // "Anel" = outline ou box-shadow usados como indicador de foco. Nao
    // cobre propriedades decorativas nao relacionadas (ex.: o background do
    // ::-webkit-calendar-picker-indicator em .text-input[type='date']:focus).
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g
    let match
    while ((match = ruleRe.exec(css))) {
      const selector = match[1].trim()
      const body = match[2]
      if (!/:focus(-visible)?/.test(selector)) continue
      const ringDeclarations = body.match(/(?:outline|box-shadow)\s*:[^;]+;/gi) || []
      for (const declaration of ringDeclarations) {
        expect(
          declaration,
          `seletor "${selector}" ainda usa var(--primary-50) como anel`
        ).not.toContain('var(--primary-50)')
      }
    }
  })

  // -------------------------------------------------------------------------
  // Guardas UX-6a (j-n): tokens novos aplicados nos seletores certos.
  // -------------------------------------------------------------------------
  it.each([
    '.nav__link--active {',
    '.topbar__avatar {',
    '.notifications__count {',
    '.mobile-bottom-nav__badge {',
    '.command-palette__item:hover .command-palette__item-icon {',
  ])('(j) "%s" contem var(--on-primary)', (header) => {
    const { body } = extractBlock(css, header)
    expect(body).toContain('var(--on-primary)')
  })

  it('(j2) ".nav__link--active:hover {" nao troca o fundo pra var(--primary-700)', () => {
    const { body } = extractBlock(css, '.nav__link--active:hover {')
    expect(body).not.toContain('background: var(--primary-700)')
  })

  it('(l) ".danger-button {" contem var(--on-danger)', () => {
    const { body } = extractBlock(css, '.danger-button {')
    expect(body).toContain('var(--on-danger)')
  })

  it('(o) ".text-input::placeholder {" usa var(--text-muted) sem opacity', () => {
    const { body } = extractBlock(css, '.text-input::placeholder {')
    expect(body).toContain('var(--text-muted)')
    expect(body).not.toContain('opacity')
  })

  it.each([
    '.weekly-arrivals-windows__notes {',
    '.weekly-arrivals-windows__shift {',
    '.weekly-arrivals-windows__label {',
    '.weekly-arrivals-windows__item {',
  ])('(p) "%s" nao contem mais rgba(15, 23, 42 fixo', (header) => {
    const { body } = extractBlock(css, header)
    expect(body).not.toContain('rgba(15, 23, 42')
  })

  it('(o3) AD-1: ".process-swipe-row__action--favorite {" contem var(--on-warn)', () => {
    const { body } = extractBlock(css, '.process-swipe-row__action--favorite {')
    expect(body).toContain('var(--on-warn)')
  })

  it('(n2) existe ".admin-section .scope-chip--active {" com var(--on-button-primary)', () => {
    const { body } = extractBlock(css, '.admin-section .scope-chip--active {')
    expect(body).toContain('var(--on-button-primary)')
  })

  it('(q) ".field-hint {" contem text-transform: none', () => {
    const { body } = extractBlock(css, '.field-hint {')
    expect(body).toContain('text-transform: none')
  })
})
