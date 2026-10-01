// Guarda de escopo do redesign mobile (PLAN.md, B16). Le src/mobile-redesign.css
// e src/main.jsx como TEXTO e garante que o CSS novo nao vaza pro desktop:
//  (a) ordem dos imports; (b) so @media com preludio conhecido, nada solto;
//  (c) fora do mobile so as duas regras permitidas; (d) literais de cor so nos
//  blocos :root; (e) :focus sem outline exige --focus-ring; (f) !important so
//  em `margin-top: 0 !important`; (g) tokens de fonte declarados.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const css = fs.readFileSync(path.resolve(ROOT, 'src/mobile-redesign.css'), 'utf8')
const mainSource = fs.readFileSync(path.resolve(ROOT, 'src/main.jsx'), 'utf8')

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Quebra `source` em blocos `prelude { body }` de nivel zero. O que sobrar fora
// de blocos (declaracao ou @import soltos) volta em `leftover`.
function readBlocks(source) {
  const blocks = []
  let depth = 0
  let preludeStart = 0
  let bodyStart = 0
  let prelude = ''
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') {
      if (depth === 0) {
        prelude = source.slice(preludeStart, i).trim()
        bodyStart = i + 1
      }
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth < 0) throw new Error('chave "}" sem abertura')
      if (depth === 0) {
        blocks.push({ prelude, body: source.slice(bodyStart, i) })
        preludeStart = i + 1
      }
    }
  }
  if (depth !== 0) throw new Error('chave "{" sem fechamento')
  return { blocks, leftover: source.slice(preludeStart).trim() }
}

function splitTopLevel(text, separator) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === separator && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function parseDeclarations(body) {
  return splitTopLevel(body, ';').map((entry) => {
    const index = entry.indexOf(':')
    return {
      prop: entry.slice(0, index).trim(),
      value: entry.slice(index + 1).trim().replace(/\s+/g, ' '),
    }
  })
}

const normalizePrelude = (value) => value.replace(/\s+/g, ' ').trim()

const cleaned = stripComments(css)
const top = readBlocks(cleaned)

// 3 camadas: L (<= 1040, compartilhado mobile+tablet), S (<= 720, so mobile) e
// T (721-1040, so tablet). Mais o movimento reduzido e o desktop-hide do icone.
const ALLOWED_MEDIA = [
  '@media (max-width: 1040px)',
  '@media (max-width: 720px)',
  '@media (max-width: 720px) and (prefers-reduced-motion: reduce)',
  '@media (min-width: 721px) and (max-width: 1040px)',
  '@media (min-width: 721px)',
]

const mediaBlocks = top.blocks.map((block) => {
  const inner = readBlocks(block.body)
  return {
    prelude: normalizePrelude(block.prelude),
    leftover: inner.leftover,
    rules: inner.blocks.map((rule) => ({
      selector: normalizePrelude(rule.prelude),
      rawBody: rule.body,
      declarations: parseDeclarations(rule.body),
    })),
  }
})

const allRules = mediaBlocks.flatMap((block) => block.rules.map((rule) => ({ ...rule, media: block.prelude })))
const ROOT_SELECTORS = [':root', ":root[data-theme='dark']"]

describe('mobile-redesign.css - guarda de escopo', () => {
  it('(a) main.jsx importa styles.css ANTES de mobile-redesign.css', () => {
    const stylesIndex = mainSource.indexOf("import './styles.css'")
    const redesignIndex = mainSource.indexOf("import './mobile-redesign.css'")
    expect(stylesIndex).toBeGreaterThanOrEqual(0)
    expect(redesignIndex).toBeGreaterThan(stylesIndex)
  })

  it('(b) so existem blocos @media com preludio conhecido, sem regra solta nem @import', () => {
    expect(cleaned).not.toMatch(/@import/)
    expect(top.leftover).toBe('')
    expect(mediaBlocks.length).toBeGreaterThan(0)
    // Evita falso verde: o parser precisa realmente enxergar as regras.
    expect(allRules.length).toBeGreaterThan(100)
    for (const block of mediaBlocks) {
      expect(ALLOWED_MEDIA).toContain(block.prelude)
      // Sem declaracao solta dentro do @media e sem at-rule aninhada.
      expect(block.leftover).toBe('')
      for (const rule of block.rules) {
        expect(rule.selector.startsWith('@')).toBe(false)
        expect(rule.rawBody).not.toContain('{')
      }
    }
  })

  it('(c) nenhuma regra vale acima de 1040px, exceto o desktop-hide do icone', () => {
    for (const block of mediaBlocks) {
      const widths = [...block.prelude.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].map((match) => ({
        kind: match[1],
        value: Number(match[2]),
      }))
      // Todo @media tem um corte de largura conhecido.
      expect(widths.length).toBeGreaterThan(0)
      for (const { kind, value } of widths) {
        if (kind === 'max') expect(value).toBeLessThanOrEqual(1040)
        // O unico min-width permitido e' o corte tablet/mobile (721px).
        if (kind === 'min') expect(value).toBe(721)
      }
      // Sem teto (so min-width): unico caso permitido = desktop-hide (abaixo).
      const hasMax = widths.some((width) => width.kind === 'max')
      if (!hasMax) expect(block.prelude).toBe('@media (min-width: 721px)')
    }

    const desktopHide = mediaBlocks.filter((block) => block.prelude === '@media (min-width: 721px)')
    expect(desktopHide).toHaveLength(1)
    expect(desktopHide[0].rules).toHaveLength(1)
    expect(desktopHide[0].rules[0].selector).toBe('.process-detail-fav__icon')
    expect(desktopHide[0].rules[0].declarations).toEqual([{ prop: 'display', value: 'none' }])
  })

  it('(c2) tablet: bloco T so de tablet e L/S nao vazam o chrome mobile', () => {
    const tablet = mediaBlocks.filter((block) => block.prelude === '@media (min-width: 721px) and (max-width: 1040px)')
    expect(tablet).toHaveLength(1)
    expect(tablet[0].rules.length).toBeGreaterThan(0)

    // Chrome que so existe no mobile (>720px estao display:none no styles.css)
    // nao pode ser estilizado fora do bloco S.
    const MOBILE_ONLY = /mobile-bottom-nav|mobile-page-header|mobile-nav-compact|process-detail-mobilebar|process-list__group|chegadas-(mobilebar|search|segmented)/
    const sharedOrTablet = mediaBlocks.filter((block) => !block.prelude.startsWith('@media (max-width: 720px)'))
    for (const block of sharedOrTablet) {
      for (const rule of block.rules) {
        expect(`${block.prelude} :: ${rule.selector}`).not.toMatch(MOBILE_ONLY)
      }
    }
  })

  it('(d) literais de cor so aparecem nos blocos :root', () => {
    const colorLiteral = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/
    let rootRules = 0
    for (const rule of allRules) {
      if (ROOT_SELECTORS.includes(rule.selector)) {
        rootRules += 1
        continue
      }
      for (const declaration of rule.declarations) {
        expect(`${rule.selector} { ${declaration.prop}: ${declaration.value} }`).not.toMatch(colorLiteral)
      }
    }
    expect(rootRules).toBe(2)
  })

  it('(e) toda regra :focus com outline: none usa var(--focus-ring)', () => {
    for (const rule of allRules) {
      if (!/:focus/.test(rule.selector)) continue
      const removesOutline = rule.declarations.some(
        (declaration) => declaration.prop === 'outline' && /^(none|0)$/.test(declaration.value)
      )
      if (removesOutline) {
        expect(rule.rawBody).toContain('var(--focus-ring)')
      }
    }
  })

  it('(f) !important so em `margin-top: 0 !important`', () => {
    let count = 0
    for (const rule of allRules) {
      for (const declaration of rule.declarations) {
        if (!declaration.value.includes('!important')) continue
        count += 1
        expect(`${declaration.prop}: ${declaration.value}`).toBe('margin-top: 0 !important')
      }
    }
    expect(count).toBeGreaterThan(0)
  })

  it('(g) declara os dois tokens de fonte (D-FONTE)', () => {
    const rootRule = allRules.find((rule) => rule.selector === ':root')
    const props = rootRule.declarations.map((declaration) => declaration.prop)
    expect(props).toContain('--m-font-text')
    expect(props).toContain('--m-font-display')
  })

  it('T10: nunca declara display em .inline-badge / .status-tag', () => {
    for (const rule of allRules) {
      for (const selector of splitTopLevel(rule.selector, ',')) {
        const lastCompound = selector.split(/\s*[>+~]\s*|\s+/).pop()
        if (!/\.(inline-badge|status-tag)(?![\w-])/.test(lastCompound)) continue
        expect(rule.declarations.map((declaration) => declaration.prop)).not.toContain('display')
      }
    }
  })

  it('T13: nao usa tokens inexistentes (--glass-strong, --primary-100..400)', () => {
    expect(cleaned).not.toMatch(/--glass-strong/)
    expect(cleaned).not.toMatch(/--primary-(100|200|300|400)\b/)
  })
})
