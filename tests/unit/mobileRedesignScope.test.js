// Guarda de escopo do redesign mobile (PLAN.md, B16). Le src/mobile-redesign.css
// e src/main.jsx como TEXTO e garante que o CSS novo nao vaza pro desktop:
//  (a) ordem dos imports; (b) so @media com preludio conhecido, nada solto;
//  (c) fora do mobile so as duas regras permitidas; (d) literais de cor so nos
//  blocos :root; (e) :focus sem outline exige --focus-ring; (f) !important so
//  em `margin-top: 0 !important`; (g) tokens de fonte declarados; (h) toda
//  animation/transition tem par `none` no bloco de movimento reduzido da faixa;
//  (i) reduce <= 1040px: overlays sem animacao, backdrop da sidebar visivel e
//  `--closing` some na hora (bloco depois da camada T).
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
  '@media (max-width: 1040px) and (prefers-reduced-motion: reduce)',
  '@media (max-width: 720px) and (prefers-reduced-motion: reduce)',
  '@media (min-width: 721px) and (max-width: 1040px)',
  '@media (min-width: 721px)',
]
const REDUCE_1040 = '@media (max-width: 1040px) and (prefers-reduced-motion: reduce)'
const REDUCE_720 = '@media (max-width: 720px) and (prefers-reduced-motion: reduce)'
const TABLET = '@media (min-width: 721px) and (max-width: 1040px)'

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

  it('(h) toda animation/transition de L/S/T tem par `none` no bloco de movimento reduzido da faixa', () => {
    // Regra de ate 720px aceita qualquer um dos dois blocos reduce; regra de L ou
    // de T so e' coberta pelo bloco reduce de ate 1040px.
    const REDUCE_FOR = {
      '@media (max-width: 720px)': [REDUCE_720, REDUCE_1040],
      '@media (max-width: 1040px)': [REDUCE_1040],
      [TABLET]: [REDUCE_1040],
    }
    const withMotion = []
    for (const block of mediaBlocks) {
      if (block.prelude.includes('prefers-reduced-motion')) continue
      for (const rule of block.rules) {
        for (const declaration of rule.declarations) {
          // Shorthand exato: `transition-delay` nao move nada sozinho.
          if (declaration.prop !== 'animation' && declaration.prop !== 'transition') continue
          if (declaration.value === 'none') continue
          for (const selector of splitTopLevel(rule.selector, ',')) {
            withMotion.push({ media: block.prelude, selector, prop: declaration.prop })
          }
        }
      }
    }
    // Evita falso verde: o parser precisa enxergar as regras com movimento.
    expect(withMotion.length).toBeGreaterThanOrEqual(4)

    for (const { media, selector, prop } of withMotion) {
      const accepted = REDUCE_FOR[media] ?? []
      const covered = mediaBlocks
        .filter((block) => accepted.includes(block.prelude))
        .some((block) =>
          block.rules.some(
            (rule) =>
              splitTopLevel(rule.selector, ',').includes(selector) &&
              rule.declarations.some((declaration) => declaration.prop === prop && declaration.value === 'none')
          )
        )
      expect(covered, `${media} :: ${selector} :: ${prop}`).toBe(true)
    }
  })

  it('(i) reduce <= 1040px: overlays sem animacao, backdrop da sidebar visivel e --closing some na hora, depois da camada T', () => {
    const reduceBlocks = mediaBlocks.filter((block) => block.prelude === REDUCE_1040)
    expect(reduceBlocks).toHaveLength(1)
    // Cascata: `:root .sidebar` do T tem a mesma especificidade; o bloco reduce
    // precisa vir depois para vencer.
    const reduceIndex = mediaBlocks.findIndex((block) => block.prelude === REDUCE_1040)
    const tabletIndex = mediaBlocks.findIndex((block) => block.prelude === TABLET)
    expect(tabletIndex).toBeGreaterThanOrEqual(0)
    expect(reduceIndex).toBeGreaterThan(tabletIndex)

    const { rules } = reduceBlocks[0]
    const selectorsOf = (rule) => splitTopLevel(rule.selector, ',')
    const declares = (rule, prop, value) =>
      rule.declarations.some((declaration) => declaration.prop === prop && declaration.value === value)

    expect(rules.some((rule) => selectorsOf(rule).includes(':root .sidebar') && declares(rule, 'transition', 'none'))).toBe(true)

    const OVERLAYS = [
      '.sidebar-backdrop',
      '.notifications__panel',
      '.notifications-backdrop',
      '.modal-backdrop',
      '.news-modal-backdrop',
      '.modal',
      '.action-sheet-backdrop',
      '.action-sheet',
      '.toast',
    ]
    for (const selector of OVERLAYS) {
      const hasNoAnimation = rules.some((rule) => selectorsOf(rule).includes(selector) && declares(rule, 'animation', 'none'))
      expect(hasNoAnimation, `${selector} sem animation: none`).toBe(true)
    }

    // O backdrop da sidebar nasce com opacity 0 e so aparecia pelo `forwards` da
    // animacao: sem ela precisa de opacity 1, senao fica invisivel.
    const visibleIndex = rules.findIndex((rule) => rule.selector === '.sidebar-backdrop' && declares(rule, 'opacity', '1'))
    expect(visibleIndex).toBeGreaterThanOrEqual(0)

    const CLOSING = [
      '.sidebar-backdrop--closing',
      '.notifications__panel--closing',
      '.notifications-backdrop--closing',
      '.modal--sheet-closing',
      '.modal-backdrop--closing',
      '.toast--closing',
    ]
    for (const selector of CLOSING) {
      const closingIndex = rules.findIndex(
        (rule) =>
          selectorsOf(rule).includes(selector) &&
          declares(rule, 'animation', 'none') &&
          declares(rule, 'opacity', '0') &&
          declares(rule, 'pointer-events', 'none')
      )
      expect(closingIndex, `${selector} sem opacity: 0 + pointer-events: none`).toBeGreaterThan(visibleIndex)
    }
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

  it('T-TOQUE: alvos de toque >= 44px so na camada S (<= 720px)', () => {
    const S = '@media (max-width: 720px)'
    const sRules = mediaBlocks.filter((block) => block.prelude === S).flatMap((block) => block.rules)
    const hasIn = (rules, selector, prop, value) =>
      rules.some(
        (rule) =>
          splitTopLevel(rule.selector, ',').includes(selector) &&
          rule.declarations.some((declaration) => declaration.prop === prop && declaration.value === value)
      )
    const has = (selector, prop, value) => hasIn(sRules, selector, prop, value)

    expect(has('.auth-screen .auth-link-button', 'min-height', '44px')).toBe(true)
    expect(has('.auth-screen .auth-link-button', 'margin-block', '-12px')).toBe(true)
    expect(has('.process-detail-view .documents-combine__label', 'min-height', '44px')).toBe(true)
    expect(has('.admin-section .toggle', 'min-height', '44px')).toBe(true)
    expect(has('.admin-section .chip-remove', 'position', 'relative')).toBe(true)
    expect(has('.admin-section .chip-remove::before', 'content', "''")).toBe(true)
    expect(has('.admin-section .chip-remove::before', 'position', 'absolute')).toBe(true)
    expect(has('.admin-section .chip-remove::before', 'inset', '-13px -11px')).toBe(true)
    // PR 3: aviso "ERP" (chip 20x28 -> alvo de 44x44) e linha de PO com aviso.
    expect(has('.process-detail-view .erp-hint__chip', 'position', 'relative')).toBe(true)
    expect(has('.process-detail-view .erp-hint__chip::before', 'content', "''")).toBe(true)
    expect(has('.process-detail-view .erp-hint__chip::before', 'position', 'absolute')).toBe(true)
    expect(has('.process-detail-view .erp-hint__chip::before', 'inset', '-12px -8px')).toBe(true)
    expect(
      has('.process-detail-view .process-general-card--consolidated-pos li:has(.erp-hint)', 'min-height', '44px')
    ).toBe(true)
    // Formulario de edicao: o mesmo chip (alvo de 44px) e respiro entre chip e campo de baixo.
    expect(has('.process-form .erp-hint__chip', 'position', 'relative')).toBe(true)
    expect(has('.process-form .erp-hint__chip::before', 'content', "''")).toBe(true)
    expect(has('.process-form .erp-hint__chip::before', 'position', 'absolute')).toBe(true)
    expect(has('.process-form .erp-hint__chip::before', 'inset', '-12px -8px')).toBe(true)
    expect(has('.process-form .erp-form-field', 'gap', '12px')).toBe(true)
    // "x" do toast: circulo de 24px (styles.css) + alvo de 44x44 via ::before.
    expect(has('.toast__close', 'position', 'relative')).toBe(true)
    expect(has('.toast__close::before', 'content', "''")).toBe(true)
    expect(has('.toast__close::before', 'position', 'absolute')).toBe(true)
    expect(has('.toast__close::before', 'inset', '-10px')).toBe(true)

    // O hit-area nao vaza para L/T/desktop.
    const TARGETS = [
      '.auth-screen .auth-link-button',
      '.process-detail-view .documents-combine__label',
      '.admin-section .toggle',
      '.admin-section .chip-remove',
      '.admin-section .chip-remove::before',
      '.process-detail-view .erp-hint__chip',
      '.process-detail-view .erp-hint__chip::before',
      '.process-detail-view .process-general-card--consolidated-pos li:has(.erp-hint)',
      '.process-form .erp-hint__chip',
      '.process-form .erp-hint__chip::before',
      '.toast__close',
      '.toast__close::before',
    ]
    const outside = allRules.filter((rule) => rule.media !== S)
    for (const selector of TARGETS) {
      for (const prop of ['min-height', 'margin-block', 'inset']) {
        const leaked = outside.some(
          (rule) =>
            splitTopLevel(rule.selector, ',').includes(selector) &&
            rule.declarations.some((declaration) => declaration.prop === prop)
        )
        expect(leaked, `${selector} declara ${prop} fora da camada S`).toBe(false)
      }
    }

    // Nenhuma regra fora da camada S cita o "x" do toast (nem L, nem T, nem reduce).
    expect(
      outside.some((rule) => rule.selector.includes('.toast__close')),
      '.toast__close citado fora da camada S'
    ).toBe(false)

    // styles.css: o circulo visivel continua 24px e nao ha ::before no desktop/tablet.
    const baseCss = stripComments(fs.readFileSync(path.resolve(ROOT, 'src/styles.css'), 'utf8'))
    const closeBase = readBlocks(baseCss).blocks.find((block) => normalizePrelude(block.prelude) === '.toast__close')
    expect(closeBase, 'bloco .toast__close em styles.css').toBeTruthy()
    expect(closeBase.body).toMatch(/width\s*:\s*24px/)
    expect(closeBase.body).toMatch(/height\s*:\s*24px/)
    expect(closeBase.body).toMatch(/border-radius\s*:\s*var\(--radius-full\)/)
    expect(baseCss).not.toMatch(/\.toast__close::(before|after)/)
  })

  it('hero do remake (F1): regras de m-hero / mobile-page-header__(art|ship|brand) / m-sheet so na camada S (ou no reduce de 720px)', () => {
    const HERO_ONLY = /m-hero|mobile-page-header__(art|ship|brand)|m-sheet/
    const S_BLOCKS = ['@media (max-width: 720px)', REDUCE_720]
    for (const block of mediaBlocks) {
      if (S_BLOCKS.includes(block.prelude)) continue
      for (const rule of block.rules) {
        expect(`${block.prelude} :: ${rule.selector}`).not.toMatch(HERO_ONLY)
      }
    }
    // Evita falso verde: as pecas do hero existem mesmo na camada S.
    const sSelectors = allRules.filter((rule) => rule.media === '@media (max-width: 720px)').map((rule) => rule.selector)
    for (const piece of ['.mobile-page-header__art', '.mobile-page-header__ship', '.mobile-page-header__brand']) {
      expect(sSelectors, piece).toContain(piece)
    }
  })

  it('Chegadas do remake (F4): pecas m-pc / m-chip / m-fbtn / m-bsheet... so na camada S (ou no reduce de 720px), com hit-area de 44px', () => {
    const CHEGADAS_ONLY =
      /\.m-(pc|chip|chips|fbtn|fbar|bsheet|scrim|seg5|empty|ghost|btn-mint|switch|group|rowi|lbl|hero-row|hero-sub)/
    const S = '@media (max-width: 720px)'
    const S_BLOCKS = [S, REDUCE_720]
    for (const block of mediaBlocks) {
      if (S_BLOCKS.includes(block.prelude)) continue
      for (const rule of block.rules) {
        expect(`${block.prelude} :: ${rule.selector}`).not.toMatch(CHEGADAS_ONLY)
      }
    }
    const sRules = mediaBlocks.filter((block) => block.prelude === S).flatMap((block) => block.rules)
    const has = (selector, prop, value) =>
      sRules.some(
        (rule) =>
          splitTopLevel(rule.selector, ',').includes(selector) &&
          rule.declarations.some((declaration) => declaration.prop === prop && declaration.value === value)
      )

    // Evita falso verde: as pecas existem na camada S.
    for (const piece of ['.m-fbtn', '.m-chip', '.m-bsheet', '.m-scrim', '.m-seg5', '.m-empty', '.m-pc__star']) {
      expect(
        sRules.some((rule) => splitTopLevel(rule.selector, ',').includes(piece)),
        piece
      ).toBe(true)
    }

    // Alvos de toque >= 44px sem mudar o visual do mock-up (mesmo padrao de .chip-remove::before):
    // estrela 34px + 5px de cada lado; chip ~34px + 5px acima e abaixo; botao "Novo" ~38px + 4px;
    // segmented 38px + 3px; grab 5px + 20px.
    const HIT_AREAS = [
      ['.m-pc__star::before', '-5px'],
      ['.m-chip::before', '-5px 0'],
      ['.m-btn-mint::before', '-4px'],
      ['.process-list-card .chegadas-segmented__item::before', '-3px 0'],
      ['.m-bsheet__grab::before', '-9px -60px -30px'], // F7: a folha recorta o que sai; 9 + 5 + 30 = 44px
    ]
    for (const [selector, inset] of HIT_AREAS) {
      expect(has(selector, 'content', "''"), selector).toBe(true)
      expect(has(selector, 'position', 'absolute'), selector).toBe(true)
      expect(has(selector, 'inset', inset), selector).toBe(true)
    }
    expect(has('.m-fbtn', 'height', '44px')).toBe(true)
    expect(has('.m-ghost', 'height', '44px')).toBe(true)
    expect(has('.process-list-card .chegadas-search', 'min-height', '44px')).toBe(true)
  })

  it('Chegadas do remake (F4): o par `none` do movimento reduzido cobre cartao, segmentos, estrela, folha e switch', () => {
    const reduce = mediaBlocks.find((block) => block.prelude === REDUCE_720)
    const covers = (selector, prop) =>
      reduce.rules.some(
        (rule) =>
          splitTopLevel(rule.selector, ',').includes(selector) &&
          rule.declarations.some((declaration) => declaration.prop === prop && declaration.value === 'none')
      )
    for (const selector of [
      '.process-list__group > .process-swipe-row',
      '.m-seg5__i--done',
      '.m-seg5__i--now',
      '.m-pc__star--pop',
      '.m-pc__star--pop::after',
      '.m-fbtn__n',
      '.m-empty',
    ]) {
      expect(covers(selector, 'animation'), `${selector} animation`).toBe(true)
    }
    for (const selector of [
      '.process-list__group > .process-swipe-row',
      '.m-pc__star',
      '.m-chip',
      '.m-fbtn',
      '.m-btn-mint',
      '.m-ghost',
      '.m-scrim',
      '.m-bsheet',
      '.m-switch',
      '.m-switch::after',
      '.process-list-card .chegadas-search',
      '.process-list-card .chegadas-segmented__item',
    ]) {
      expect(covers(selector, 'transition'), `${selector} transition`).toBe(true)
    }
    // O anel do burst some (em vez de ficar parado) sem movimento.
    expect(
      reduce.rules.some(
        (rule) =>
          splitTopLevel(rule.selector, ',').includes('.m-pc__star--pop::after') &&
          rule.declarations.some((declaration) => declaration.prop === 'display' && declaration.value === 'none')
      )
    ).toBe(true)
  })

  it('Avisos / Noticias / Menu do remake (F6): pecas m-nrow / m-nbar / m-nlist / m-news / m-tag / m-gh / m-ucard / m-seg / m-menu so na camada S (ou no reduce de 720px), com alvos de 44px e par `none`', () => {
    const F6_ONLY = /\.m-(nrow|nbar|nlist|news|tag|gh|ucard|seg|menu|rowi__(body|sub|chev))|notifications-page--mobile|menu-page\.m-menu/
    const S = '@media (max-width: 720px)'
    for (const block of mediaBlocks) {
      if ([S, REDUCE_720].includes(block.prelude)) continue
      for (const rule of block.rules) {
        expect(`${block.prelude} :: ${rule.selector}`).not.toMatch(F6_ONLY)
      }
    }
    const sRules = mediaBlocks.filter((block) => block.prelude === S).flatMap((block) => block.rules)
    const has = (selector, prop, value) =>
      sRules.some(
        (rule) =>
          splitTopLevel(rule.selector, ',').includes(selector) &&
          rule.declarations.some((declaration) => declaration.prop === prop && (value === undefined || declaration.value === value))
      )

    // Evita falso verde: as pecas existem na camada S.
    for (const piece of ['.m-nrow__open', '.m-nrow__dot', '.m-nrow__lead', '.m-news', '.m-news__open', '.m-tag', '.m-gh', '.m-ucard', '.m-seg', '.m-seg__btn']) {
      expect(
        sRules.some((rule) => splitTopLevel(rule.selector, ',').includes(piece)),
        piece
      ).toBe(true)
    }

    // Alvos de toque >= 44px: icones da barra (44x44), "Marcar todas" (min 44), segmented de tema (min 44),
    // "Editar" da noticia e "Ver mais" (m-ghost, height 44px na F4), linha do aviso (padding 14 + 36px de ladrilho).
    expect(has('.m-nbar__icon', 'width', '44px')).toBe(true)
    expect(has('.m-nbar__all', 'min-height', '44px')).toBe(true)
    expect(has('.m-seg__btn', 'min-height', '44px')).toBe(true)
    expect(has('.m-nrow__open', 'padding', '14px 16px')).toBe(true)
    // O botao do titulo da noticia estica por cima do cartao inteiro (area de toque unica).
    expect(has('.m-news__open::after', 'position', 'absolute')).toBe(true)
    expect(has('.m-news__open::after', 'inset', '0')).toBe(true)
    // O ponto de nao lida e' apagado so por `--read` (escala 0), com atraso por linha.
    expect(has('.m-nrow--read .m-nrow__dot', 'transform', 'scale(0)')).toBe(true)
    expect(has('.m-nrow--read .m-nrow__dot', 'transition-delay', 'calc(var(--m-i, 0) * 160ms)')).toBe(true)

    // Par `none` do movimento reduzido para toda transicao nova (o teste (h) ja exige; aqui nomeia as pecas).
    const reduce = mediaBlocks.find((block) => block.prelude === REDUCE_720)
    for (const selector of ['.m-nrow__dot', '.m-nrow__open', '.m-nrow__actions', '.m-menu .m-group > .m-rowi', '.m-seg__btn']) {
      expect(
        reduce.rules.some(
          (rule) =>
            splitTopLevel(rule.selector, ',').includes(selector) &&
            rule.declarations.some((declaration) => declaration.prop === 'transition' && declaration.value === 'none')
        ),
        `${selector} transition: none`
      ).toBe(true)
    }
  })

  it('QA mobile (F7): ajustes medidos no navegador so na camada S (ou no reduce de 720px), com os valores que a QA exigiu', () => {
    const F7_ONLY =
      /\.toast-container|\.confirm-dialog__actions|\.m-bsheet__export-note|__item--bump|data-wide-value|\.sidebar:not\(\.sidebar--mobile-open\)|\.process-detail-view\.list-card > \*/
    const S = '@media (max-width: 720px)'
    for (const block of mediaBlocks) {
      if ([S, REDUCE_720].includes(block.prelude)) continue
      for (const rule of block.rules) {
        expect(`${block.prelude} :: ${rule.selector}`, 'ajuste F7 fora da camada S').not.toMatch(F7_ONLY)
      }
    }
    const sRules = mediaBlocks.filter((block) => block.prelude === S).flatMap((block) => block.rules)
    const find = (selector) =>
      sRules.filter((rule) => splitTopLevel(rule.selector, ',').map((item) => item.replace(/\s+/g, ' ')).includes(selector))
    const decl = (selector, prop) => {
      const rule = find(selector).find((candidate) => candidate.declarations.some((declaration) => declaration.prop === prop))
      return rule?.declarations.find((declaration) => declaration.prop === prop)?.value
    }

    // Camada do detalhe: nenhum filho encolhe (hero com overflow hidden e trilho de abas ficavam com 108px/12px).
    expect(decl('.process-detail-view.list-card > *', 'flex-shrink')).toBe('0')
    // Gaveta da sidebar fechada sai da arvore de acessibilidade/Tab (h1 "Portal COMEX" duplicava o da tela).
    expect(decl(':root .sidebar:not(.sidebar--mobile-open)', 'visibility')).toBe('hidden')
    // Rotulos das etapas: 10px (10,5px transbordava a coluna de ~51px a 320px).
    expect(decl('.m-route__step span', 'font-size')).toBe('0.625rem')
    // Toast acima da pilula (14 + 68 + 12) e acima da barra de acao do detalhe, com safe-area.
    expect(decl('.toast-container', 'bottom')).toBe('calc(94px + env(safe-area-inset-bottom, 0px))')
    const toastRules = sRules.filter((rule) => rule.selector.includes('.toast-container'))
    expect(toastRules.length).toBeGreaterThanOrEqual(3)
    for (const rule of toastRules) {
      expect(rule.declarations.some((declaration) => declaration.prop === 'bottom' && /env\(safe-area-inset-bottom/.test(declaration.value))).toBe(true)
    }
    // Sparkline do KPI com valor de 3 digitos (wide): caixa menor, mesma proporcao do viewBox (100x28),
    // traco mais grosso (4,5 no viewBox = ~1,8px); com 4+ digitos (xwide) a linha some.
    expect(decl(".m-kpi[data-wide-value='wide'] .stat-card__sparkline", 'width')).toBe('40px')
    expect(decl(".m-kpi[data-wide-value='wide'] .stat-card__sparkline", 'height')).toBe('11px')
    expect(decl(".m-kpi[data-wide-value='wide'] .stat-card__sparkline-line", 'stroke-width')).toBe('4.5')
    expect(decl(".m-kpi[data-wide-value='xwide'] .stat-card__sparkline", 'display')).toBe('none')
    // Dialogo de confirmacao: botoes de 44px.
    expect(
      sRules.some(
        (rule) =>
          rule.selector.includes('.confirm-dialog__actions >') &&
          rule.declarations.some((declaration) => declaration.prop === 'min-height' && declaration.value === '44px')
      )
    ).toBe(true)
    // Aviso visivel do Exportar (toque nao tem hover).
    expect(find('.m-bsheet__export-note').length).toBeGreaterThan(0)
    // Area de toque: grab com extensao so' nos 10px de padding (a folha recorta o que sai), acoes do topo com -4px (borda de 1px).
    expect(decl('.m-bsheet__grab::before', 'inset')).toBe('-9px -60px -30px')
    expect(decl('.process-detail-view .process-detail-mobilebar__actions .process-detail-fav::before', 'inset')).toBe('-4px')

    // m-bump so no item com --bump; no reduce o par `none` cobre o mesmo seletor.
    const bumpSelector = '.mobile-bottom-nav .mobile-bottom-nav__item--active.mobile-bottom-nav__item--bump > svg'
    expect(decl(bumpSelector, 'animation')).toMatch(/^m-bump /)
    expect(decl('.mobile-bottom-nav .mobile-bottom-nav__item--active > svg', 'animation')).toBeUndefined()
    const reduce = mediaBlocks.find((block) => block.prelude === REDUCE_720)
    expect(
      reduce.rules.some(
        (rule) =>
          splitTopLevel(rule.selector, ',').map((item) => item.replace(/\s+/g, ' ')).includes(bumpSelector) &&
          rule.declarations.some((declaration) => declaration.prop === 'animation' && declaration.value === 'none')
      )
    ).toBe(true)
  })

  it('Folha de filtros (F7, rodape fixo): corpo rola, rodape fica dentro da folha, so na camada S, com safe-area e alvos de 50px', () => {
    const F7_SHEET_ONLY = /\.m-bsheet__(body|foot)/
    const S = '@media (max-width: 720px)'
    for (const block of mediaBlocks) {
      if (block.prelude === S) continue
      for (const rule of block.rules) {
        expect(`${block.prelude} :: ${rule.selector}`, 'rodape/corpo da folha fora da camada S').not.toMatch(F7_SHEET_ONLY)
      }
    }
    const sRules = mediaBlocks.filter((block) => block.prelude === S).flatMap((block) => block.rules)
    const decl = (selector, prop) => {
      const rule = sRules
        .filter((candidate) => splitTopLevel(candidate.selector, ',').includes(selector))
        .find((candidate) => candidate.declarations.some((declaration) => declaration.prop === prop))
      return rule?.declarations.find((declaration) => declaration.prop === prop)?.value
    }

    // A folha vira coluna que nao rola; so o corpo rola.
    expect(decl('.m-bsheet', 'display')).toBe('flex')
    expect(decl('.m-bsheet', 'flex-direction')).toBe('column')
    expect(decl('.m-bsheet', 'overflow')).toBe('hidden')
    expect(decl('.m-bsheet', 'overflow-y')).toBeUndefined()
    expect(decl('.m-bsheet__body', 'overflow-y')).toBe('auto')
    expect(decl('.m-bsheet__body', 'min-height')).toBe('0')
    expect(decl('.m-bsheet__body', 'overscroll-behavior')).toBe('contain')
    // Rodape: nao encolhe, fundo da folha, borda e sombra sutis (tokens), safe-area embaixo.
    expect(decl('.m-bsheet__foot', 'flex')).toBe('none')
    expect(decl('.m-bsheet__foot', 'background')).toBe('var(--bg)')
    expect(decl('.m-bsheet__foot', 'border-top')).toBe('1px solid var(--border)')
    expect(decl('.m-bsheet__foot', 'box-shadow')).toBe('var(--m-shadow-foot)')
    expect(decl('.m-bsheet__foot', 'padding')).toBe('12px 16px calc(12px + env(safe-area-inset-bottom, 0px))')
    // Alvos de toque: botoes "block" de 50px (>= 44px).
    expect(decl('.m-btn-mint--block', 'height')).toBe('50px')
    expect(decl('.m-ghost--block', 'height')).toBe('50px')
    // A classe antiga do rodape nao existe mais.
    expect(css).not.toMatch(/\.m-bsheet__btns/)
  })

  it('PR 3 (aviso ERP): na camada L o balao entra no fluxo, o wrapper dos itens some do layout e nenhuma regra declara display no balao', () => {
    const L = '@media (max-width: 1040px)'
    const lRules = mediaBlocks.filter((block) => block.prelude === L).flatMap((block) => block.rules)
    const hasIn = (rules, selector, prop, value) =>
      rules.some(
        (rule) =>
          splitTopLevel(rule.selector, ',').includes(selector) &&
          rule.declarations.some((declaration) => declaration.prop === prop && declaration.value === value)
      )

    expect(hasIn(lRules, '.process-detail-view .erp-hint__bubble', 'position', 'static')).toBe(true)
    expect(hasIn(lRules, '.process-detail-view .erp-hint__bubble', 'max-width', '100%')).toBe(true)
    // Formulario de edicao: as MESMAS regras (balao no fluxo, wrapper inline), sem `display` no balao.
    expect(hasIn(lRules, '.process-form .erp-hint', 'display', 'inline')).toBe(true)
    expect(hasIn(lRules, '.process-form .erp-hint__bubble', 'position', 'static')).toBe(true)
    expect(hasIn(lRules, '.process-form .erp-hint__bubble', 'max-width', '100%')).toBe(true)
    expect(hasIn(lRules, '.process-detail-view .process-items-list__entry > .erp-hint', 'display', 'contents')).toBe(true)

    // O `[hidden]` do styles.css so' esconde o balao fechado se nenhuma regra mobile
    // declarar `display` nele (o repo nao tem regra global [hidden]).
    let bubbleRules = 0
    for (const rule of allRules) {
      for (const selector of splitTopLevel(rule.selector, ',')) {
        if (!/\.erp-hint__bubble(?![\w-])/.test(selector)) continue
        bubbleRules += 1
        expect(rule.declarations.map((declaration) => declaration.prop), selector).not.toContain('display')
      }
    }
    expect(bubbleRules).toBeGreaterThanOrEqual(2)

    // Separadores da aba Itens para os 3 vizinhos novos do wrapper.
    for (const selector of [
      '.process-detail-view .process-items-list__entry + .process-related-item-button::before',
      '.process-detail-view .process-related-item-button + .process-items-list__entry::before',
      '.process-detail-view .process-items-list__entry + .process-items-list__entry::before',
    ]) {
      expect(hasIn(lRules, selector, 'content', "''"), selector).toBe(true)
      expect(hasIn(lRules, selector, 'position', 'absolute'), selector).toBe(true)
    }
  })

  it('PR 3: o CSS do aviso "ERP" no mobile nao tem literal de cor, animation nem transition', () => {
    const erpRules = allRules.filter((rule) => /erp-hint|process-items-list__entry/.test(rule.selector))
    expect(erpRules.length).toBeGreaterThanOrEqual(10)
    for (const rule of erpRules) {
      for (const declaration of rule.declarations) {
        expect(`${rule.selector} :: ${declaration.prop}`).not.toMatch(/:: (animation|transition)$/)
      }
    }
  })
})

// Chip "+N" de alertas (ProcessListView): escondido no desktop/tablet, so
// aparece em <= 720px. `.process-item__main span { display: block }` (0,1,1)
// vencia o seletor solto `.inline-badge--more` (0,1,0) e o "+N" vazava no
// desktop. A regra base precisa de especificidade >= (0,2,0), abaixo da regra
// mobile (0,3,0).
describe('styles.css - chip "+N" dos alertas (inline-badge--more)', () => {
  const stylesCss = stripComments(fs.readFileSync(path.resolve(ROOT, 'src/styles.css'), 'utf8'))
  const stylesTop = readBlocks(stylesCss).blocks.map((block) => ({
    prelude: normalizePrelude(block.prelude),
    body: block.body,
  }))
  const displayOf = (body) => /(?:^|[;\s])display\s*:\s*([^;]+?)\s*(?:;|$)/.exec(body)?.[1]

  it('regra base esconde o "+N" com seletor de especificidade (0,2,0)', () => {
    const base = stylesTop.filter((block) => block.prelude === '.process-item__chips .inline-badge--more')
    expect(base).toHaveLength(1)
    expect(displayOf(base[0].body)).toBe('none')
    // Nenhuma regra solta `.inline-badge--more` (0,1,0) no nivel zero.
    expect(stylesTop.some((block) => block.prelude === '.inline-badge--more')).toBe(false)
  })

  it('em <= 720px a regra mobile (0,3,0) reativa o "+N" e vence a base', () => {
    const media = stylesTop.find((block) => block.prelude === '@media (max-width: 720px)' && block.body.includes('.inline-badge--more'))
    expect(media).toBeDefined()
    const rule = readBlocks(media.body).blocks.find(
      (block) => normalizePrelude(block.prelude) === '.process-list-card .process-item__chips .inline-badge--more'
    )
    expect(rule).toBeDefined()
    expect(displayOf(rule.body)).toBe('inline-flex')
  })

  it('mobile-redesign.css nao reabre o "+N" no tablet/desktop', () => {
    const outsideMobile = allRules.filter(
      (rule) => rule.media !== '@media (max-width: 720px)' && rule.selector.includes('inline-badge--more')
    )
    expect(outsideMobile).toEqual([])
  })
})

// Balao do chip "ERP" dentro de `.field` (ETD/ETA do ProcessForm): `.field span`
// (0,1,1) vence `.erp-hint__bubble` (0,1,0) e herdava caixa alta, peso 700,
// tracking e cor apagada. Os seletores `.erp-form-field .erp-hint__*` (0,2,0)
// repoem a tipografia e nao podem declarar `display` (guarda do `[hidden]`).
describe('styles.css - balao do chip ERP dentro de .field (ETD/ETA)', () => {
  const stylesCss = stripComments(fs.readFileSync(path.resolve(ROOT, 'src/styles.css'), 'utf8'))
  const stylesTop = readBlocks(stylesCss).blocks.map((block) => ({
    prelude: normalizePrelude(block.prelude),
    body: block.body,
  }))
  const prop = (body, name) => new RegExp(`(?:^|[;\\s])${name}\\s*:\\s*([^;]+?)\\s*(?:;|$)`).exec(body)?.[1]

  it.each([
    ['.erp-form-field .erp-hint__bubble', '400'],
    ['.erp-form-field .erp-hint__action', '600'],
  ])('%s repoe text-transform, letter-spacing, font-weight e cor, sem display', (selector, weight) => {
    const rules = stylesTop.filter((block) => block.prelude === selector)
    expect(rules).toHaveLength(1)
    const { body } = rules[0]
    expect(prop(body, 'text-transform')).toBe('none')
    expect(prop(body, 'letter-spacing')).toBe('normal')
    expect(prop(body, 'font-weight')).toBe(weight)
    expect(prop(body, 'color')).toMatch(/^var\(--[\w-]+\)$/)
    expect(prop(body, 'display')).toBeUndefined()
  })

  it('a regra global `.field span` continua existindo (o motivo da reposicao)', () => {
    expect(stylesTop.some((block) => block.prelude.split(',').map((s) => s.trim()).includes('.field span'))).toBe(true)
  })
})
