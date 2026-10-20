// Guarda do modo notebook (PLAN.md). Le src/notebook.css e src/main.jsx como
// TEXTO e garante que o CSS novo fica restrito a desktop (>= 1041px):
//  (a) ordem dos imports; (b) so @media e @keyframes nb-login-chart-*, nada solto;
//  (c) toda query exige min-width >= 1041 e nao tem max-width < 1041;
//  (d) sem bloco de movimento reduzido; (e) animation* so em no-preference e
//  so animation-name com os 3 keyframes nb-*, sem transition; (f) sem cor
//  literal nem important; (g) todo var(--x) existe; (h) seletores do login
//  comecam por .auth-screen--login e nenhum cita erp-; (i) decisoes travadas:
//  login sem lista de recursos e sidebar compacta na query Q-SB.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const rawCss = fs.readFileSync(path.resolve(ROOT, 'src/notebook.css'), 'utf8')
const stylesCss = fs.readFileSync(path.resolve(ROOT, 'src/styles.css'), 'utf8')
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

const normalize = (value) => value.replace(/\s+/g, ' ').trim()

const cleaned = stripComments(rawCss)
const top = readBlocks(cleaned)

const mediaBlocks = top.blocks
  .filter((block) => block.prelude.startsWith('@media'))
  .map((block) => {
    const inner = readBlocks(block.body)
    return {
      prelude: normalize(block.prelude),
      leftover: inner.leftover,
      rules: inner.blocks.map((rule) => ({
        selector: normalize(rule.prelude),
        rawBody: rule.body,
        declarations: parseDeclarations(rule.body),
      })),
    }
  })

const keyframeBlocks = top.blocks.filter((block) => block.prelude.startsWith('@keyframes'))
const allRules = mediaBlocks.flatMap((block) => block.rules.map((rule) => ({ ...rule, media: block.prelude })))
const allDeclarations = allRules.flatMap((rule) => rule.declarations.map((decl) => ({ ...decl, rule })))

// Propriedades onde um nome de cor pode aparecer (color, background*, border*,
// outline*, fill, stroke, *shadow).
const COLOR_PROP = /color|^background|^border|^outline|^fill$|^stroke$|shadow/
const COLOR_KEYWORDS_OK = new Set(['transparent', 'currentcolor', 'inherit'])
const CSS_COLOR_NAMES = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen ' +
    'transparent currentcolor'
  ).split(' '),
)

// Q-D (todo desktop, sem outra condicao): so as abas do detalhe e a folga do
// Suporte no fim do .main-content. Qualquer outra regra aqui vazaria para
// 1366+ com altura > 800 (1440x900, 1920x1080). Refino F2: as abas do Admin
// viraram o grid auto-fit do mock (AdminTabs.dc.html) e saem do notebook.css.
const Q_D = '@media (min-width: 1041px)'
const Q_D_SELECTORS = [
  '.process-detail-view .detail-tab-row',
  '.process-detail-view .detail-tab-row .tab-button',
  '.main-content',
]

const Q_SB =
  '@media (min-width: 1041px) and (max-width: 1365px), (min-width: 1041px) and (max-height: 800px)'
const Q_H = '@media (min-width: 1041px) and (max-height: 800px)'

describe('notebook.css - guarda de escopo', () => {
  it('(a) main.jsx importa styles.css, depois mobile-redesign.css, depois notebook.css', () => {
    const stylesIndex = mainSource.indexOf("import './styles.css'")
    const redesignIndex = mainSource.indexOf("import './mobile-redesign.css'")
    const notebookIndex = mainSource.indexOf("import './notebook.css'")
    expect(stylesIndex).toBeGreaterThanOrEqual(0)
    expect(redesignIndex).toBeGreaterThan(stylesIndex)
    expect(notebookIndex).toBeGreaterThan(redesignIndex)
  })

  it('(b) nivel zero so tem @media e @keyframes nb-login-chart-*, sem @import nem at-rule aninhada', () => {
    expect(cleaned).not.toMatch(/@import/)
    expect(top.leftover).toBe('')
    expect(mediaBlocks.length).toBeGreaterThan(0)
    expect(keyframeBlocks.length).toBe(3)
    for (const block of top.blocks) {
      expect(block.prelude).toMatch(/^(@media\b|@keyframes nb-login-chart-(out|back|out-far)$)/)
    }
    for (const block of mediaBlocks) {
      expect(block.leftover).toBe('')
      for (const rule of block.rules) {
        expect(rule.selector.startsWith('@')).toBe(false)
        expect(rule.rawBody).not.toMatch(/[{}]/)
      }
    }
    // Evita falso verde: o parser precisa realmente enxergar as regras.
    expect(allRules.length).toBeGreaterThan(40)
  })

  it('(c) toda query exige min-width >= 1041px e nenhuma tem max-width < 1041px', () => {
    for (const block of mediaBlocks) {
      const queries = splitTopLevel(block.prelude.replace(/^@media\s*/, ''), ',')
      expect(queries.length).toBeGreaterThan(0)
      for (const query of queries) {
        const mins = [...query.matchAll(/\(min-width:\s*(\d+)px\)/g)].map((match) => Number(match[1]))
        expect(mins.length, `sem min-width em "${query}"`).toBeGreaterThan(0)
        expect(Math.max(...mins), `min-width < 1041 em "${query}"`).toBeGreaterThanOrEqual(1041)
        for (const match of query.matchAll(/\(max-width:\s*(\d+)px\)/g)) {
          expect(Number(match[1]), `max-width < 1041 em "${query}"`).toBeGreaterThanOrEqual(1041)
        }
      }
    }
  })

  it('(d) nenhum preludio usa prefers-reduced-motion: reduce', () => {
    for (const block of mediaBlocks) {
      expect(block.prelude).not.toMatch(/prefers-reduced-motion:\s*reduce/)
    }
  })

  it('(e) animation* so em no-preference (apenas animation-name com nb-*) e nenhuma transition', () => {
    const ANIMATION_NAMES = ['nb-login-chart-out', 'nb-login-chart-back', 'nb-login-chart-out-far']
    let animationCount = 0
    for (const decl of allDeclarations) {
      expect(decl.prop.startsWith('transition'), `transition em "${decl.rule.selector}"`).toBe(false)
      if (decl.prop.startsWith('animation')) {
        animationCount += 1
        expect(decl.rule.media).toMatch(/prefers-reduced-motion:\s*no-preference/)
        expect(decl.prop).toBe('animation-name')
        expect(ANIMATION_NAMES).toContain(decl.value)
      }
    }
    expect(animationCount).toBe(3)
    expect(cleaned).not.toMatch(/\btransition\b/)
  })

  it('(f) sem cor literal (hex, rgb, rgba, hsl, nome de cor CSS) e sem important', () => {
    expect(cleaned).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(cleaned).not.toMatch(/\brgba?\(/i)
    expect(cleaned).not.toMatch(/\bhsla?\(/i)
    expect(cleaned).not.toMatch(/!\s*important/i)
    // Nomes de cor so passam se forem transparent, currentColor ou inherit.
    // Os nomes dentro de var(--x) nao contam (o nome do token e' removido).
    let checked = 0
    for (const decl of allDeclarations) {
      if (!COLOR_PROP.test(decl.prop)) continue
      checked += 1
      const value = decl.value.toLowerCase().replace(/var\(\s*--[\w-]+/g, '')
      for (const word of value.match(/[a-z][a-z-]*/g) ?? []) {
        expect(
          CSS_COLOR_NAMES.has(word) && !COLOR_KEYWORDS_OK.has(word),
          `cor nomeada "${word}" em ${decl.prop} de "${decl.rule.selector}"`,
        ).toBe(false)
      }
    }
    // Refino F2: o scroll-shadow das abas do Admin saiu; resta o do detalhe.
    expect(checked).toBeGreaterThanOrEqual(1)
  })

  it('(g) todo var(--x) existe no styles.css ou e --nb-* declarado no proprio arquivo', () => {
    const used = new Set([...cleaned.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]))
    expect(used.size).toBeGreaterThan(0)
    const declaredHere = new Set([...cleaned.matchAll(/(--nb-[\w-]+)\s*:/g)].map((match) => match[1]))
    for (const name of used) {
      if (name.startsWith('--nb-')) {
        expect(declaredHere.has(name), `${name} usado e nao declarado`).toBe(true)
      } else {
        expect(new RegExp(`${name}\\s*:`).test(stylesCss), `${name} nao existe no styles.css`).toBe(true)
      }
    }
  })

  it('(h) seletores com auth-/login- comecam por .auth-screen--login e nenhum cita erp-', () => {
    let loginSelectors = 0
    for (const rule of allRules) {
      for (const selector of splitTopLevel(rule.selector, ',')) {
        expect(selector, `erp- em "${selector}"`).not.toMatch(/erp-/)
        if (/auth-|login-/.test(selector)) {
          loginSelectors += 1
          expect(selector.startsWith('.auth-screen--login'), `seletor fora do escopo: "${selector}"`).toBe(true)
        }
      }
    }
    expect(loginSelectors).toBeGreaterThan(15)
  })

  it('(i) decisoes travadas: login sem lista de recursos (Q-H) e sidebar compacta (Q-SB)', () => {
    const qh = mediaBlocks.filter((block) => block.prelude === Q_H)
    const feats = qh
      .flatMap((block) => block.rules)
      .find((rule) => rule.selector === '.auth-screen--login .auth-brand__feats')
    expect(feats).toBeTruthy()
    expect(feats.declarations).toContainEqual({ prop: 'display', value: 'none' })

    const qsb = mediaBlocks.filter((block) => block.prelude === Q_SB)
    expect(qsb.length).toBe(1)
    const sidebar = qsb[0].rules.find((rule) => rule.selector === '.sidebar')
    expect(sidebar).toBeTruthy()
    expect(sidebar.declarations).toContainEqual({ prop: 'width', value: '232px' })
  })

  it('(j) Q-D (so min-width: 1041px) tem apenas as abas do detalhe e o padding-bottom do .main-content', () => {
    const qd = mediaBlocks.filter((block) => block.prelude === Q_D)
    expect(qd.length).toBe(1)
    const selectors = qd[0].rules.map((rule) => rule.selector)
    expect(selectors.length).toBeGreaterThan(0)
    for (const rule of qd[0].rules) {
      expect(Q_D_SELECTORS, `seletor fora da whitelist de Q-D: "${rule.selector}"`).toContain(rule.selector)
    }
    const main = qd[0].rules.find((rule) => rule.selector === '.main-content')
    expect(main).toBeTruthy()
    expect(main.declarations.map((decl) => decl.prop)).toEqual(['padding-bottom'])
    // As abas do detalhe nao podem mudar de posicao a 1440/1920: gap igual ao .tab-row base.
    const detailRow = qd[0].rules.find((rule) => rule.selector === '.process-detail-view .detail-tab-row')
    expect(detailRow.declarations).toContainEqual({ prop: 'gap', value: '10px' })
  })

  it('(k) dica de rolagem das abas e scroll-shadow local, sem pseudo-elemento que ocupe espaco', () => {
    for (const rule of allRules) {
      for (const selector of splitTopLevel(rule.selector, ',')) {
        expect(selector, `pseudo-elemento em "${selector}"`).not.toMatch(/::?(before|after)/)
      }
    }
    const qd = mediaBlocks.find((block) => block.prelude === Q_D)
    for (const selector of ['.process-detail-view .detail-tab-row']) {
      const backgrounds = qd.rules
        .filter((entry) => entry.selector === selector)
        .flatMap((entry) => entry.declarations)
        .filter((decl) => decl.prop === 'background')
      expect(backgrounds.length, `background em "${selector}"`).toBe(1)
      expect(backgrounds[0].value, `scroll-shadow local em "${selector}"`).toMatch(/\blocal\b/)
    }
  })

  it('(l) login: .auth-panel estica (align-self: stretch) para o max-height do .auth-card valer', () => {
    const qh = mediaBlocks.filter((block) => block.prelude === Q_H).flatMap((block) => block.rules)
    const panel = qh.find((rule) => rule.selector === '.auth-screen--login .auth-panel')
    expect(panel).toBeTruthy()
    expect(panel.declarations).toContainEqual({ prop: 'align-self', value: 'stretch' })
    const card = qh.find((rule) => rule.selector === '.auth-screen--login .auth-card')
    expect(card).toBeTruthy()
    expect(card.declarations).toContainEqual({ prop: 'max-height', value: '100%' })
    expect(card.declarations).toContainEqual({ prop: 'overflow-y', value: 'auto' })
  })

  it('(m) Q-W (1041-1365 de largura): topbar numa linha, busca so com icone e abas do Admin numa linha sem descricao', () => {
    const qw = mediaBlocks.filter((block) => block.prelude === '@media (min-width: 1041px) and (max-width: 1365px)')
    expect(qw.length).toBe(1)
    const rules = qw[0].rules
    const declsOf = (selector) => {
      const rule = rules.find((entry) => entry.selector === selector)
      expect(rule, `regra "${selector}" no Q-W`).toBeTruthy()
      return rule.declarations
    }
    expect(declsOf('.topbar')).toContainEqual({ prop: 'flex-wrap', value: 'nowrap' })
    expect(declsOf('.topbar__heading')).toContainEqual({ prop: 'min-width', value: '0' })
    expect(declsOf('.topbar .topbar__search')).toContainEqual({ prop: 'width', value: '44px' })
    expect(declsOf('.topbar .topbar__search-text, .topbar .topbar__search-kbd')).toContainEqual({
      prop: 'display',
      value: 'none',
    })
    // Abas do Admin: 1 linha (flex nowrap + rolagem), sem quebra de rotulo e sem descricao.
    const tabsRow = declsOf('.admin-section .admin-tabs.admin-tabs--desktop')
    expect(tabsRow).toContainEqual({ prop: 'display', value: 'flex' })
    expect(tabsRow).toContainEqual({ prop: 'flex-wrap', value: 'nowrap' })
    expect(tabsRow).toContainEqual({ prop: 'overflow-x', value: 'auto' })
    expect(declsOf('.admin-section .admin-tabs .tab-button.admin-tab')).toContainEqual({
      prop: 'white-space',
      value: 'nowrap',
    })
    expect(declsOf('.admin-tab__desc')).toContainEqual({ prop: 'display', value: 'none' })
    // Altura/padding-left da topbar nao sao do Q-W (guarda refinoVisual: min-height de 76 e Q-H).
    for (const rule of rules) {
      for (const decl of rule.declarations) {
        expect(decl.prop, `Q-W nao declara height em "${rule.selector}"`).not.toBe('height')
      }
    }
  })
})
