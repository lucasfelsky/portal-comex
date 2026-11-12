// Guarda de CSS da sidebar recolhivel (desktop >= 1041px). Le src/styles.css,
// src/notebook.css e os fontes do AppLayout/Icon como TEXTO (mesmo padrao de
// desktopReducedMotion.test.js e notebookLayout.test.js).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (file) => fs.readFileSync(path.resolve(ROOT, file), 'utf8')
const css = read('src/styles.css')
const notebook = read('src/notebook.css')

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s) => s.replace(/\s+/g, ' ').trim()

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
        prelude = source.slice(preludeStart, i)
        bodyStart = i + 1
      }
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        blocks.push({ prelude: norm(prelude), body: source.slice(bodyStart, i) })
        preludeStart = i + 1
      }
    }
  }
  return blocks
}

// Regras (seletores + declaracoes normalizadas) do corpo de um bloco.
function rulesOf(body) {
  return readBlocks(body).map((r) => ({
    selectors: r.prelude.split(',').map(norm),
    decls: norm(r.body),
  }))
}

// Todas as regras que listam o seletor exato; junta as declaracoes.
function declsFor(rules, selector) {
  return rules
    .filter((r) => r.selectors.includes(selector))
    .map((r) => r.decls)
    .join(' ')
}

function expectDecls(rules, selector, expected) {
  const decls = declsFor(rules, selector)
  expect(decls, `regra "${selector}" nao encontrada`).not.toBe('')
  for (const decl of expected) {
    expect(decls, `${selector} -> ${decl}`).toContain(decl)
  }
}

// ---- secao nova ------------------------------------------------------------
const HEADING = 'SIDEBAR RECOLHIVEL — DESKTOP'
const headingIndex = css.indexOf(HEADING)
const sectionStart = css.lastIndexOf('/*', headingIndex)
const f3Index = css.indexOf('REFINO VISUAL F3 — MOVIMENTO')
const f3Start = css.lastIndexOf('/*', f3Index)
const section = css.slice(sectionStart, f3Start)
const sectionStripped = stripComments(section)
const sectionBlocks = readBlocks(sectionStripped)
const sectionMedia = sectionBlocks.filter((b) => b.prelude.startsWith('@media'))
const sectionRules = sectionMedia.length ? rulesOf(sectionMedia[0].body) : []

// ---- bloco F2 (geometria expandida) ------------------------------------------
const f2Start = css.lastIndexOf('/*', css.indexOf('REFINO VISUAL F2 — SHELL DO DESKTOP'))
const f2End = css.lastIndexOf('/*', css.indexOf('F16.1 — Fundações do redesign iOS'))
const f2Media = readBlocks(stripComments(css.slice(f2Start, f2End))).filter(
  (b) => b.prelude === '@media (min-width: 1041px)',
)
const f2Rules = rulesOf(f2Media[0].body)

// ---- bloco final de movimento reduzido -----------------------------------------
const REDUCE = '@media (min-width: 1041px) and (prefers-reduced-motion: reduce)'
const reduceBlocks = readBlocks(stripComments(css)).filter((b) => b.prelude === REDUCE)
const reduceRules = reduceBlocks.length ? rulesOf(reduceBlocks[0].body) : []

// ---- notebook Q-SB -------------------------------------------------------------
const QSB =
  '@media (min-width: 1041px) and (max-width: 1365px), (min-width: 1041px) and (max-height: 800px)'
const qsbBlocks = readBlocks(stripComments(notebook)).filter((b) => b.prelude === QSB)
const qsbRules = qsbBlocks.length ? rulesOf(qsbBlocks[0].body) : []

const TEXT_SELECTORS = [
  '.sidebar .brand__text',
  '.sidebar .nav__link-text',
  '.sidebar .sidebar-intelliquote-link__body',
  '.sidebar .sidebar-intelliquote-link__arrow',
  '.sidebar .sidebar__foot .sidebar-theme-button > span',
  '.sidebar .sidebar__foot .sidebar-support-button > span',
]

describe('secao SIDEBAR RECOLHIVEL — DESKTOP: posicao e escopo', () => {
  it('existe, depois da F16.1, antes do cabecalho F3 MOVIMENTO e antes do bloco final de reduce', () => {
    expect(headingIndex).toBeGreaterThan(0)
    expect(css.indexOf(HEADING, headingIndex + 1)).toBe(-1)
    expect(headingIndex).toBeGreaterThan(css.indexOf('F16.1 — Fundações do redesign iOS'))
    expect(headingIndex).toBeLessThan(f3Index)
    expect(headingIndex).toBeLessThan(css.lastIndexOf(REDUCE))
  })

  it('fica depois da regra base .sidebar-signature (assinatura continua unica)', () => {
    expect(css.indexOf('\n.sidebar-signature {')).toBeGreaterThan(0)
    expect(css.indexOf('\n.sidebar-signature {')).toBeLessThan(headingIndex)
    expect(css.split('\n.sidebar-signature {').length - 1).toBe(1)
  })

  it('tem exatamente 1 @media, que e (min-width: 1041px)', () => {
    expect(sectionMedia).toHaveLength(1)
    expect(sectionMedia[0].prelude).toBe('@media (min-width: 1041px)')
  })

  it('sem max-width, sem hex e sem !important', () => {
    // Declaracao max-width (texto do rodape) e permitida; so a media query nao.
    expect(sectionStripped).not.toMatch(/\(\s*max-width/)
    expect(sectionStripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(sectionStripped).not.toContain('!important')
  })

  it('fora do @media: so o @keyframes da dica e o display: none dos 3 seletores', () => {
    const outside = sectionBlocks.filter((b) => !b.prelude.startsWith('@media'))
    expect(outside.map((b) => b.prelude)).toEqual([
      '@keyframes sidebar-tip-in',
      '.sidebar .sidebar-intelliquote-link__tile, .sidebar .sidebar__toggle, .sidebar-tip',
    ])
    expect(norm(outside[0].body)).toContain('translate(-6px, -50%)')
    expect(norm(outside[1].body)).toBe('display: none;')
  })
})

describe('secao SIDEBAR RECOLHIVEL — DESKTOP: declaracoes', () => {
  it('.shell: variaveis de movimento', () => {
    expectDecls(sectionRules, '.shell', [
      '--sb-dur: 300ms',
      '--sb-ease: cubic-bezier(0.2, 0.8, 0.2, 1)',
      '--sb-fade: 140ms',
      '--sb-in: calc(var(--sb-dur) * 0.3)',
      '--sb-step: 16ms',
    ])
  })

  it('largura 72px recolhida, sem barra de rolagem, e conteudo ocupa a largura liberada', () => {
    expectDecls(sectionRules, '.sidebar', ['transition: width var(--sb-dur) var(--sb-ease)'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar', ['width: 72px', 'scrollbar-width: none'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar::-webkit-scrollbar', ['display: none'])
    expectDecls(sectionRules, '.main-content', ['margin-left var(--sb-dur) var(--sb-ease)', 'width var(--sb-dur) var(--sb-ease)'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .main-content', [
      'margin-left: 72px',
      'width: calc(100% - 72px)',
    ])
  })

  it('marca: 40px expandida e 84px recolhida', () => {
    expectDecls(sectionRules, '.sidebar .brand', ['position: relative', 'height: 40px'])
    expectDecls(sectionRules, '.sidebar .brand h1', ['white-space: nowrap'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .brand', ['height: 84px', 'align-items: flex-start'])
  })

  it('botao: posicao expandida/recolhida, chevron gira 180 graus e foco usa --focus-ring', () => {
    expectDecls(sectionRules, '.sidebar .sidebar__toggle', [
      'position: absolute',
      'left: calc(100% - 32px)',
      'top: 4px',
      'width: 32px',
      'height: 32px',
      'border-radius: 12px',
    ])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .sidebar__toggle', ['left: 8px', 'top: 46px'])
    expectDecls(sectionRules, '.sidebar .sidebar__toggle svg', ['transform: rotate(180deg)'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .sidebar__toggle svg', ['transform: none'])
    expectDecls(sectionRules, '.sidebar .sidebar__toggle:focus-visible', ['var(--focus-ring)'])
  })

  it('ladrilho do card "Solicitar uma cotacao": 36px com o token do ladrilho da marca', () => {
    expectDecls(sectionRules, '.sidebar .sidebar-intelliquote-link__tile', [
      'width: 36px',
      'height: 36px',
      'border-radius: 10px',
      'background: var(--brand-mark-tile-on-dark)',
      'color: var(--primary)',
    ])
  })

  it('texto expandido: opacity 1 + cascata por --k; recolhido: opacity 0 + translateX(-8px) em 140ms', () => {
    for (const selector of TEXT_SELECTORS) {
      expectDecls(sectionRules, selector, [
        'opacity: 1',
        'var(--sb-fade) ease calc(var(--sb-in) + var(--k, 0) * var(--sb-step))',
        'transform var(--sb-dur) var(--sb-ease) calc(var(--k, 0) * var(--sb-step))',
      ])
      expectDecls(sectionRules, `.shell--sidebar-colapsada ${selector}`, [
        'opacity: 0',
        'transform: translateX(-8px)',
        'transition-delay: 0ms',
        'transition-duration: var(--sb-fade)',
      ])
    }
  })

  it('textos do rodape colapsam para max-width: 0; assinatura centralizada no F2 e oculta no trilho', () => {
    expectDecls(sectionRules, '.sidebar .sidebar__foot .sidebar-theme-button > span', ['max-width: 160px'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .sidebar__foot .sidebar-theme-button > span', ['max-width: 0'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .sidebar__foot .sidebar-support-button > span', ['max-width: 0'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .sidebar__foot .sidebar-signature', ['display: none'])
    // a regra recolhida da assinatura tem SO display: none
    expect(declsFor(sectionRules, '.shell--sidebar-colapsada .sidebar .sidebar__foot .sidebar-signature')).toBe('display: none;')
    // o centro expandido vem so do bloco F2: nenhuma regra desta secao que cite a assinatura mexe em align-self/margin
    for (const rule of sectionRules.filter((r) => r.selectors.some((s) => s.includes('sidebar-signature')))) {
      expect(rule.decls, rule.selectors.join(', ')).not.toMatch(/align-self|margin/)
    }
  })

  it('corte do texto: overflow hidden + nowrap nos itens', () => {
    for (const selector of [
      '.sidebar .nav__link',
      '.sidebar .sidebar-intelliquote-link',
      '.sidebar .sidebar__foot .sidebar-theme-button',
      '.sidebar .sidebar__foot .sidebar-support-button',
    ]) {
      expectDecls(sectionRules, selector, ['overflow: hidden', 'white-space: nowrap'])
    }
  })

  it('dica: fixa, z-index 60 (abaixo do backdrop 68), navy, sem clique, com animacao de 180ms', () => {
    expectDecls(sectionRules, '.sidebar-tip', [
      'position: fixed',
      'z-index: 60',
      'background: var(--navy)',
      'pointer-events: none',
      'animation: sidebar-tip-in 180ms',
    ])
  })
})

describe('geometria: centro do icone a 36px da borda nos dois estados', () => {
  const px = (value) => Number(/(-?\d+(?:\.\d+)?)px/.exec(value)[1])

  it('sidebar com padding lateral 12 + nav padding-left 15 + 9 = 36', () => {
    const sidebar = declsFor(f2Rules, '.sidebar')
    expect(sidebar).toContain('padding: 24px 12px 18px')
    const nav = declsFor(f2Rules, '.sidebar .nav__link')
    expect(nav).toContain('padding: 0 12px 0 15px')
    expect(12 + px('15px') + 18 / 2).toBe(36)
  })

  it('rodape: 12 + 16 + 8 = 36', () => {
    const decls = declsFor(f2Rules, '.sidebar .sidebar__foot .sidebar-theme-button')
    expect(decls).toContain('padding: 0 0 0 16px')
    expect(declsFor(f2Rules, '.sidebar .sidebar__foot .sidebar-support-button')).toContain('padding: 0 0 0 16px')
    expect(12 + 16 + 16 / 2).toBe(36)
  })

  it('card IntelliQuote: 12 + 1 (borda) + 5 + 18 = 36', () => {
    const decls = declsFor(f2Rules, '.sidebar .sidebar-intelliquote-link')
    expect(decls).toContain('height: 48px')
    expect(decls).toContain('padding: 0 12px 0 5px')
    expect(decls).toContain('border: 1px solid')
    expect(12 + 1 + 5 + 36 / 2).toBe(36)
  })

  it('marca COMEX: 12 + 4 + 20 = 36', () => {
    expect(declsFor(f2Rules, '.sidebar .brand')).toContain('padding: 0 4px')
    expect(12 + 4 + 40 / 2).toBe(36)
  })
})

describe('movimento reduzido no bloco final do desktop', () => {
  it('o bloco final existente continua unico e e o ultimo do arquivo', () => {
    expect(reduceBlocks).toHaveLength(1)
    expect(css.lastIndexOf(REDUCE)).toBeGreaterThan(css.lastIndexOf('/* Roadmap 11 / PR #223'))
    expect(css.lastIndexOf('@media', css.length)).toBe(css.lastIndexOf(REDUCE))
  })

  it('.shell derruba as variaveis --sb-* e a dica entra sem animacao', () => {
    expectDecls(reduceRules, '.shell', ['--sb-dur: 1ms', '--sb-fade: 1ms', '--sb-in: 0ms', '--sb-step: 0ms'])
    expectDecls(reduceRules, '.sidebar-tip', ['animation: none'])
  })

  it('itens e botao da sidebar com transition-duration: 1ms', () => {
    for (const selector of [
      '.sidebar .sidebar-intelliquote-link',
      '.sidebar .nav__link',
      '.sidebar .sidebar__foot .sidebar-theme-button',
      '.sidebar .sidebar__foot .sidebar-support-button',
      '.sidebar .sidebar__toggle',
    ]) {
      expectDecls(reduceRules, selector, ['transition-duration: 1ms'])
    }
  })

  it('nao cria bloco de reduce novo: a contagem de @media (prefers-reduced-motion: reduce) segue 11', () => {
    expect(css.split('@media (prefers-reduced-motion: reduce)').length - 1).toBe(11)
  })
})

describe('notebook Q-SB: nao compacta a sidebar (paridade com o IQ)', () => {
  it('bloco Q-SB existe', () => {
    expect(qsbBlocks).toHaveLength(1)
  })

  it('nenhuma regra do Q-SB mexe na sidebar nem no estado recolhido', () => {
    const SIDEBAR_PARTS = [
      '.sidebar',
      '.brand',
      '.nav__link',
      'sidebar-intelliquote-link',
      'sidebar__foot',
      'sidebar__toggle',
      'sidebar-signature',
      'shell--sidebar-colapsada',
    ]
    for (const rule of qsbRules) {
      for (const selector of rule.selectors) {
        for (const part of SIDEBAR_PARTS) {
          expect(selector, `Q-SB nao compacta a sidebar: "${selector}" cita "${part}"`).not.toContain(part)
        }
      }
    }
  })

  it('nenhuma regra do Q-SB mexe na margem/largura do .main-content', () => {
    for (const rule of qsbRules) {
      expect(rule.selectors, 'Q-SB nao tem regra de .main-content').not.toContain('.main-content')
    }
  })

  it('a geometria do recolhido continua vindo da secao SIDEBAR RECOLHIVEL (84px e top 46px)', () => {
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .brand', ['height: 84px'])
    expectDecls(sectionRules, '.shell--sidebar-colapsada .sidebar .sidebar__toggle', ['top: 46px'])
  })
})

describe('fontes: icone e AppLayout', () => {
  it('Icon.jsx tem o path do file-plus do mockup', () => {
    expect(read('src/components/Icon.jsx')).toContain(
      "'file-plus': <path d=\"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 12v6M9 15h6\" />",
    )
  })

  it('AppLayout usa o hook, aplica a classe no .shell e nao depende de transitionend/animationend', () => {
    const layout = read('src/components/AppLayout.jsx')
    expect(layout).toContain("import useSidebarCollapsed from '../hooks/useSidebarCollapsed'")
    expect(layout).toContain('shell--sidebar-colapsada')
    expect(layout).not.toContain('transitionend')
    expect(layout).not.toContain('animationend')
  })

  it('a chave do storage vive no hook', () => {
    expect(read('src/hooks/useSidebarCollapsed.js')).toContain("'comex-sidebar-colapsada'")
  })
})
