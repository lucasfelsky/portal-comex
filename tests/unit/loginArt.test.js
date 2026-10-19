// Guardas estaticas da arte do login (Ciclo login-arte, PLAN.md). Le CSS/JSX como
// TEXTO (ambiente node), mesmo estilo de desktopReducedMotion.test.js.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (rel) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')
const css = read('src/styles.css')
const art = read('src/components/LoginArt.jsx')

const START = '/* LOGIN-ART:START */'
const END = '/* LOGIN-ART:END */'
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const HEX = /#[0-9a-fA-F]{3,8}\b/

const cssNoComments = stripComments(css)

function artBlock() {
  const start = css.indexOf(START)
  const end = css.indexOf(END)
  return css.slice(start + START.length, end)
}

// Corpo do bloco `{ ... }` que abre depois de `opener` (balanceando chaves).
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

function loginTokens(source, opener) {
  const body = bodyAfter(source, opener)
  expect(body, opener).not.toBeNull()
  return new Set([...body.matchAll(/^\s*(--login-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
}

describe('arte do login: guardas estaticas', () => {
  it('marcadores LOGIN-ART existem e estao em ordem', () => {
    const start = css.indexOf(START)
    const end = css.indexOf(END)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
  })

  it('tokens --login-* de :root == tokens de :root[data-theme=dark] (20 nomes)', () => {
    const light = loginTokens(cssNoComments, ':root {')
    const dark = loginTokens(cssNoComments, ":root[data-theme='dark'] {")
    expect(light.size).toBe(20)
    expect([...dark].sort()).toEqual([...light].sort())
  })

  it('sem hex no bloco LOGIN-ART nem em LoginArt.jsx', () => {
    expect(stripComments(artBlock())).not.toMatch(HEX)
    expect(art).not.toMatch(HEX)
  })

  it('toda animation: do bloco esta no @media no-preference e ele tem as 7 regras', () => {
    const block = stripComments(artBlock())
    const prelude = '@media (min-width: 1041px) and (prefers-reduced-motion: no-preference)'
    const motion = bodyAfter(block, prelude)
    expect(motion).not.toBeNull()
    expect(motion.match(/animation\s*:/g)).toHaveLength(7)
    const outside = block.replace(prelude, '').replace(motion, '')
    // `animation:` fora do bloco de movimento so' em `animation-*` inexistente: nenhum.
    expect(outside).not.toMatch(/(^|[\s;{])animation\s*:/)
    ;[
      '.login-port-scene__ship',
      '.login-port-scene__waves',
      '.login-chart__ship--out',
      '.login-chart__ship--back',
      '.login-chart__ship--far',
      '.login-chart__bob',
      '.login-chart__buoy-light',
    ].forEach((selector) => {
      expect(motion, selector).toContain(selector)
    })
  })

  it('navios da carta tem transform estatico no @media (min-width: 1041px)', () => {
    const block = stripComments(artBlock())
    const desktop = norm(bodyAfter(block, '@media (min-width: 1041px) {'))
    ;['.login-chart__ship--out', '.login-chart__ship--back', '.login-chart__ship--far'].forEach((selector) => {
      const re = new RegExp(`${selector.replace(/[.-]/g, '\\$&')} \\{[^}]*transform:`)
      expect(desktop, selector).toMatch(re)
    })
  })

  it('Verify/Pending nao usam a arte nem o modificador', () => {
    ;['src/pages/VerifyEmailPage.jsx', 'src/pages/PendingApprovalPage.jsx'].forEach((file) => {
      const src = read(file)
      expect(src, file).not.toContain('LoginArt')
      expect(src, file).not.toContain('auth-screen--login')
    })
  })

  it('LoginPage importa de ../components/LoginArt', () => {
    expect(read('src/pages/LoginPage.jsx')).toMatch(/from '\.\.\/components\/LoginArt'/)
  })
})
