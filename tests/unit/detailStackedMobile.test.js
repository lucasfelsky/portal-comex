// Remake mobile F5 (detalhe empilhado): garantias ESTATICAS sobre o CSS (jsdom nao
// carrega folhas de estilo). A principal: em REPOUSO a camada do detalhe e os
// ancestrais dela nao tem `transform`, `will-change`, `filter` nem `contain`
// (viram o bloco de contencao dos `position: fixed`: barra de acao, galeria,
// modais e folhas de acao). Tambem cobre a descida da pilula SO' no detalhe, o
// respiro do fim da rolagem (altura da barra de acao + safe-area), o par `none`
// do movimento reduzido e o escopo mobile-only das pecas novas.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '')

// Achata `@media`/`@supports` em regras { conds, selector, declarations }. At-rules
// de corpo "de declaracao" (@keyframes, @font-face, @property) ficam de fora.
function parseRules(source, conds = []) {
  const rules = []
  let depth = 0
  let start = 0
  let prelude = ''
  let bodyStart = 0
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') {
      if (depth === 0) {
        prelude = source.slice(start, i).trim()
        bodyStart = i + 1
      }
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const body = source.slice(bodyStart, i)
        if (/^@(media|supports)/.test(prelude)) {
          rules.push(...parseRules(body, [...conds, prelude.replace(/\s+/g, ' ')]))
        } else if (!prelude.startsWith('@')) {
          const declarations = splitTop(body, ';')
            .map((entry) => {
              const index = entry.indexOf(':')
              return index < 0
                ? null
                : { prop: entry.slice(0, index).trim(), value: entry.slice(index + 1).trim().replace(/\s+/g, ' ') }
            })
            .filter(Boolean)
          rules.push({ conds, selector: prelude.replace(/\s+/g, ' '), declarations })
        }
        start = i + 1
      }
    }
  }
  return rules
}

function splitTop(text, separator) {
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

const stylesSource = strip(read('src/styles.css'))
const redesignSource = strip(read('src/mobile-redesign.css'))
const notebookSource = strip(read('src/notebook.css'))
const redesignRules = parseRules(redesignSource)
const allRules = [
  ...parseRules(stylesSource).map((rule) => ({ ...rule, file: 'styles.css' })),
  ...redesignRules.map((rule) => ({ ...rule, file: 'mobile-redesign.css' })),
  ...parseRules(notebookSource).map((rule) => ({ ...rule, file: 'notebook.css' })),
]

const S = '@media (max-width: 720px)'
const REDUCE_720 = '@media (max-width: 720px) and (prefers-reduced-motion: reduce)'
const inS = (rule) => rule.file === 'mobile-redesign.css' && rule.conds.length === 1 && rule.conds[0] === S
const inReduce720 = (rule) => rule.file === 'mobile-redesign.css' && rule.conds.length === 1 && rule.conds[0] === REDUCE_720
const selectors = (rule) => splitTop(rule.selector, ',')
const hasSelector = (rule, selector) => selectors(rule).includes(selector)
const sRules = redesignRules.filter((rule) => rule.conds.length === 1 && rule.conds[0] === S)
const reduceRules = redesignRules.filter((rule) => rule.conds.length === 1 && rule.conds[0] === REDUCE_720)
const find = (rules, selector) => rules.filter((rule) => hasSelector(rule, selector))
const decl = (rules, prop) => rules.flatMap((rule) => rule.declarations).filter((d) => d.prop === prop)
const valueOf = (rules, prop) => decl(rules, prop).at(-1)?.value

// Propriedades que fazem do elemento o bloco de contencao de `position: fixed`.
const CONTAINING = ['transform', 'will-change', 'filter', 'backdrop-filter', 'contain', 'perspective', 'translate', 'scale', 'rotate']

describe('detalhe empilhado (F5) - estado de repouso sem bloco de contencao', () => {
  it('a camada do detalhe e um overlay fixo e rolavel, sem transform/will-change/filter/contain', () => {
    const overlay = find(sRules, '.process-detail-view.list-card')
    expect(overlay.length).toBeGreaterThan(0)
    expect(valueOf(overlay, 'position')).toBe('fixed')
    expect(valueOf(overlay, 'inset')).toBe('0')
    expect(valueOf(overlay, 'overflow-y')).toBe('auto')
    expect(valueOf(overlay, 'overscroll-behavior')).toBe('contain')
    const z = Number(valueOf(overlay, 'z-index'))
    // acima da pilula (28) e da barra compacta (26), abaixo da galeria (50) e dos modais (200)
    expect(z).toBeGreaterThan(28)
    expect(z).toBeLessThan(50)
    for (const prop of CONTAINING) {
      expect(decl(overlay, prop), `.process-detail-view.list-card declara ${prop}`).toHaveLength(0)
    }
  })

  it('a entrada nao deixa fill (backwards) e as keyframes ficam no fim de styles.css com prefixo m-', () => {
    const overlay = find(sRules, '.process-detail-view.list-card')
    const enter = valueOf(overlay, 'animation')
    expect(enter).toMatch(/^m-push-in 0\.5s var\(--m-ios\) backwards$/)
    expect(enter).not.toMatch(/both|forwards/)

    const leaving = find(sRules, ".process-detail-view.list-card[data-m-leaving='true']")
    expect(valueOf(leaving, 'animation')).toMatch(/^m-push-out 0\.42s var\(--m-ios\) forwards$/)
    for (const prop of CONTAINING) expect(decl(leaving, prop)).toHaveLength(0)

    // `from`-only na entrada, `to`-only na saida: o repouso e' o estilo base (sem transform)
    const keyframes = (name) => {
      const match = new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(stylesSource)
      return match?.[1] ?? ''
    }
    expect(keyframes('m-push-in')).toMatch(/\bfrom\b/)
    expect(keyframes('m-push-in')).not.toMatch(/\bto\b|100%/)
    expect(keyframes('m-push-out')).toMatch(/\bto\b/)
    expect(keyframes('m-push-out')).not.toMatch(/\bfrom\b|0%/)
    expect(stylesSource.lastIndexOf('@keyframes m-push-in')).toBeGreaterThan(stylesSource.lastIndexOf('@keyframes m-glow'))
    // a duracao da saida da CSS e a do timer da pagina andam juntas
    const page = read('src/pages/ProcessesPage.jsx')
    expect(/const DETAIL_LEAVE_MS = (\d+)/.exec(page)?.[1]).toBe('420')
  })

  it('a lista que fica atras: `.m-stack` em repouso so tem transition; recuo/escurecimento so em `.m-stack-under`', () => {
    const base = find(sRules, '.m-stack')
    expect(base.length).toBeGreaterThan(0)
    for (const prop of CONTAINING) expect(decl(base, prop), `.m-stack declara ${prop}`).toHaveLength(0)
    expect(valueOf(base, 'transition')).toContain('transform 0.5s var(--m-ios)')
    const under = find(sRules, '.m-stack-under')
    expect(valueOf(under, 'transform')).toBe('translateX(-26%)')
    expect(valueOf(under, 'filter')).toBe('brightness(0.78)')
    expect(valueOf(under, 'pointer-events')).toBe('none')
    // nenhuma outra regra de `.m-stack*` mexe em transform/filter
    for (const rule of redesignRules.filter((r) => /\.m-stack/.test(r.selector) && !hasSelector(r, '.m-stack-under'))) {
      for (const prop of CONTAINING) expect(decl([rule], prop), `${rule.selector} declara ${prop}`).toHaveLength(0)
    }
  })

  it('os ancestrais da camada (.surface, .main-content, .shell, body...) nao criam bloco de contencao no mobile', () => {
    const ANCESTORS = [/^\.surface(?![\w-])/, /^\.main-content(?![\w-])/, /^\.shell(?![\w-])/, /^\.shell__frame(?![\w-])/, /^body(?![\w-])/, /^html(?![\w-])/, /^#root(?![\w-])/]
    const lastCompound = (selector) => selector.split(/\s*[>+~]\s*|\s+/).pop()
    let checked = 0
    for (const rule of allRules) {
      // so' o que vale em <= 720px: sem corte de min-width acima disso
      if (rule.conds.some((cond) => /min-width:\s*(7[2-9]\d|[89]\d\d|\d{4,})px/.test(cond))) continue
      for (const selector of selectors(rule)) {
        if (!ANCESTORS.some((pattern) => pattern.test(lastCompound(selector)))) continue
        checked += 1
        for (const prop of CONTAINING) {
          const found = rule.declarations.filter((d) => d.prop === prop && d.value !== 'none' && d.value !== 'auto')
          expect(found, `${rule.file} :: ${selector} declara ${prop}`).toHaveLength(0)
        }
      }
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('o `.page-fade` (ancestral, com will-change/transform) e neutralizado enquanto o detalhe esta aberto', () => {
    const base = allRules.find((rule) => rule.file === 'styles.css' && rule.conds.length === 0 && rule.selector === '.page-fade')
    expect(valueOf([base], 'will-change')).toBe('opacity, transform')
    const resting = find(sRules, '.main-content > .page-fade:has(.process-detail-view)')
    expect(valueOf(resting, 'will-change')).toBe('auto')
    const fade = find(sRules, '.main-content > .page-fade--visible:has(.process-detail-view)')
    // sem animacao nenhuma: o `page-fade-in` anima translateY por 180ms e, nesse
    // intervalo, o `.page-fade` seria bloco de contencao do `position: fixed`
    expect(valueOf(fade, 'animation')).toBe('none')
    expect(decl(fade, 'animation-fill-mode')).toHaveLength(0)
    expect(valueOf(fade, 'opacity')).toBe('1')
  })

  it('fallback sem `:has()` (iOS < 15.4): @supports not selector(:has(*)) zera will-change e a animacao do `.page-fade` so em <= 720px', () => {
    const fallback = allRules.filter(
      (rule) =>
        rule.file === 'styles.css' &&
        rule.conds.length === 2 &&
        rule.conds[0] === '@media (max-width: 720px)' &&
        rule.conds[1] === '@supports not selector(:has(*))'
    )
    expect(fallback.length).toBe(2)
    expect(valueOf(find(fallback, '.main-content > .page-fade'), 'will-change')).toBe('auto')
    const visible = find(fallback, '.main-content > .page-fade--visible')
    expect(valueOf(visible, 'animation')).toBe('none')
    expect(valueOf(visible, 'opacity')).toBe('1')
    // nunca vale acima de 720px: nenhuma regra desse fallback fora do @media de 720px
    expect(
      allRules.filter((rule) => rule.conds.some((cond) => cond.includes('selector(:has')) && rule.conds[0] !== '@media (max-width: 720px)')
    ).toHaveLength(0)
  })

  it('nao ha will-change/contain/filter na lista de ancestrais da barra de acao fixa (toolbar)', () => {
    const toolbar = sRules.filter((rule) => /process-detail-toolbar:has\(/.test(rule.selector) && valueOf([rule], 'position') === 'fixed')
    expect(toolbar).toHaveLength(1)
    expect(valueOf(toolbar, 'bottom')).toBe('0')
    expect(valueOf(toolbar, 'left')).toBe('0')
    expect(valueOf(toolbar, 'right')).toBe('0')
    expect(valueOf(toolbar, 'background')).toBe('linear-gradient(180deg, transparent, var(--bg) 38%)')
    expect(valueOf(toolbar, 'padding')).toContain('env(safe-area-inset-bottom')
    // o cabecalho antigo que hospeda a barra nao pode virar bloco de contencao
    const host = find(sRules, '.process-detail-view > .process-detail-card-heading')
    expect(valueOf(host, 'display')).toBe('contents')
    for (const prop of CONTAINING) expect(decl(host, prop)).toHaveLength(0)
  })
})

describe('detalhe empilhado (F5) - pilula, respiro do fim da rolagem e movimento reduzido', () => {
  const PILL = ".main-content:has(.process-detail-view:not([data-m-leaving='true'])) > .mobile-bottom-nav"

  it('a pilula desce e sai do foco/leitor SO com o detalhe (nao nos modos de edicao) e sobe junto na saida', () => {
    const pill = find(sRules, PILL)
    expect(pill).toHaveLength(1)
    expect(valueOf(pill, 'transform')).toBe('translateY(calc(150% + 14px + env(safe-area-inset-bottom, 0px)))')
    expect(valueOf(pill, 'visibility')).toBe('hidden')
    expect(valueOf(pill, 'pointer-events')).toBe('none')
    // `visibility` so' some ao FIM da descida (o atraso = a duracao do transform)
    expect(valueOf(pill, 'transition')).toBe('transform 0.5s var(--m-ios), visibility 0s linear 0.5s')
    // nenhuma regra desce a pilula por causa do formulario/edicao
    for (const rule of redesignRules.filter((r) => /mobile-bottom-nav/.test(r.selector) && /process-form/.test(r.selector))) {
      expect(decl([rule], 'transform')).toHaveLength(0)
      expect(decl([rule], 'visibility')).toHaveLength(0)
    }
    // na saida (`data-m-leaving`) a regra deixa de casar: a base devolve a pilula na hora
    expect(PILL).toContain(":not([data-m-leaving='true'])")
    const base = sRules.find((rule) => hasSelector(rule, ':root .mobile-bottom-nav'))
    expect(decl([base], 'visibility')).toHaveLength(0)
    // movimento reduzido: sem transicao (a pilula some/volta na hora)
    expect(valueOf(find(reduceRules, PILL), 'transition')).toBe('none')
  })

  it('o respiro do fim da rolagem e da PROPRIA camada (altura da barra de acao + safe-area); o shell nao encolhe', () => {
    const overlay = find(sRules, '.process-detail-view.list-card')
    expect(valueOf(overlay, 'padding')).toBe('0 16px calc(24px + var(--m-cta-h) + env(safe-area-inset-bottom, 0px))')
    expect(valueOf(overlay, '--m-cta-h')).toBe('0px')
    const one = sRules.find((rule) => /^\.process-detail-view\.list-card:has\(\.process-detail-toolbar > :is\(/.test(rule.selector))
    const two = sRules.find((rule) => /^\.process-detail-view\.list-card:has\(.*\.primary-button ~ \.ghost-button/.test(rule.selector))
    // 12 + 50 + 14 = 76 (1 linha); 12 + 50 + 8 + 50 + 14 = 134 (primario + secundarios)
    expect(valueOf([one], '--m-cta-h')).toBe('76px')
    expect(valueOf([two], '--m-cta-h')).toBe('134px')
    // a barra tem 50px de botao + 12 de respiro acima + 14 abaixo
    const buttons = find(sRules, '.process-detail-view .process-detail-toolbar > .primary-button')
    expect(valueOf(buttons, 'min-height')).toBe('50px')
    // o `.main-content` (que carrega a lista atras) NAO muda de padding no detalhe:
    // encolher a pagina por tras limparia a rolagem da lista ao voltar.
    for (const rule of redesignRules.filter((r) => /^\.main-content:has\(\.process-detail-view/.test(r.selector) && !/>/.test(r.selector))) {
      expect(decl([rule], 'padding-bottom')).toHaveLength(0)
      expect(decl([rule], 'padding')).toHaveLength(0)
    }
  })

  it('toda animation/transition nova tem o par `none` no reduce de 720px (entrada, saida, recuo, escurecimento, barra, chips)', () => {
    const covers = (selector, prop) => decl(find(reduceRules, selector), prop).some((d) => d.value === 'none')
    expect(covers('.process-detail-view.list-card', 'animation')).toBe(true)
    expect(covers(".process-detail-view.list-card[data-m-leaving='true']", 'animation')).toBe(true)
    expect(covers('.m-stack', 'transition')).toBe(true)
    expect(covers(PILL, 'transition')).toBe(true)
    expect(covers('.process-detail-view > .process-detail-mobilebar', 'transition')).toBe(true)
    expect(covers('.process-detail-view .process-detail-mobilebar__title', 'transition')).toBe(true)
    expect(covers('.process-detail-view .detail-tab-row .tab-button', 'transition')).toBe(true)
    const hero = find(reduceRules, '.m-hero__in')
    expect(valueOf(hero, 'transform')).toBe('none')
    expect(valueOf(hero, 'opacity')).toBe('1')
  })

  it('o hero e a lista empilhada so existem na camada S (nada vaza para L/T/desktop)', () => {
    const NEW_PIECES = /m-hero--detail|m-hero__|m-detail-tags|\.m-stack|m-route--hero/
    for (const rule of redesignRules) {
      if (rule.conds.length === 1 && (rule.conds[0] === S || rule.conds[0] === REDUCE_720)) continue
      // unica excecao: o `:has(> .m-stack)` que esconde o "Fila de chegadas" (L, inerte no tablet)
      if (/^\.surface:has\(> \.process-list-card, > \.m-stack/.test(rule.selector)) continue
      expect(`${rule.conds.join(' ')} :: ${rule.selector}`).not.toMatch(NEW_PIECES)
    }
    // a camada fixa (position: fixed) nunca e declarada fora da camada S
    for (const rule of redesignRules.filter((r) => /process-detail-view\.list-card/.test(r.selector))) {
      if (rule.conds.length === 1 && (rule.conds[0] === S || rule.conds[0] === REDUCE_720)) continue
      expect(decl([rule], 'position'), rule.selector).toHaveLength(0)
    }
    // base `display: none` fora da camada S (rede de seguranca ao cruzar 720px)
    const base = allRules.filter((rule) => rule.file === 'styles.css' && rule.conds.length === 0 && hasSelector(rule, '.m-hero--detail'))
    expect(valueOf(base, 'display')).toBe('none')
  })
})

describe('detalhe empilhado (F5) - apresentacao', () => {
  it('abas: o select some e os chips rolam com mascara so de keywords; alvos de toque de 44px', () => {
    expect(valueOf(find(sRules, '.process-detail-view .detail-tab-select'), 'display')).toBe('none')
    const row = find(sRules, '.process-detail-view .tab-row.detail-tab-row')
    expect(valueOf(row, 'display')).toBe('flex')
    expect(valueOf(row, 'overflow-x')).toBe('auto')
    const mask = valueOf(row, 'mask-image')
    expect(mask).toContain('transparent')
    expect(mask).toContain('black')
    expect(mask).not.toMatch(/#|rgb|hsl/)
    const chip = find(sRules, '.process-detail-view .detail-tab-row .tab-button')
    expect(valueOf(chip, 'min-height')).toBe('0')
    const hit = find(sRules, '.process-detail-view .detail-tab-row .tab-button::before')
    expect(valueOf(hit, 'content')).toBe("''")
    expect(valueOf(hit, 'position')).toBe('absolute')
    expect(valueOf(hit, 'inset')).toBe('-5px 0')
    // contador de Documentos: --warning / --on-warn
    const badge = find(sRules, '.process-detail-view .detail-tab-row .documents-tab-count')
    expect(valueOf(badge, 'background')).toBe('var(--warning)')
    expect(valueOf(badge, 'color')).toBe('var(--on-warn)')
  })

  it('botoes redondos do hero: 38px visuais com area de toque de 44px (::before), foco visivel', () => {
    const back = find(sRules, '.process-detail-view .process-detail-mobilebar__back')
    expect(valueOf(back, 'width')).toBe('38px')
    expect(valueOf(back, 'height')).toBe('38px')
    const backHit = find(sRules, '.process-detail-view .process-detail-mobilebar__back::before')
    expect(valueOf(backHit, 'inset')).toBe('-3px')
    for (const button of ['.process-detail-fav', '.process-detail-more__trigger']) {
      const actions = find(sRules, `.process-detail-view .process-detail-mobilebar__actions ${button}`)
      expect(valueOf(actions, 'width'), button).toBe('38px')
      expect(valueOf(actions, 'height'), button).toBe('38px')
    }
    const actionsHit = sRules.find((rule) => /process-detail-fav::before/.test(rule.selector))
    // F7: -4px (e nao -3px): o ::before parte da borda de padding e estes dois botoes tem 1px de borda
    // transparente, entao -3px dava so' 42px de area (medido no navegador). O "voltar" nao tem borda (-3px).
    expect(valueOf([actionsHit], 'inset')).toBe('-4px')
    const focus = sRules.find((rule) => /process-detail-mobilebar__back:focus-visible/.test(rule.selector))
    expect(valueOf([focus], 'outline')).toBe('2px solid var(--m-hero-ink)')
  })

  it('texto sobre o navy/chip usa so tokens ja medidos em mobileHeroContrast (--m-hero-ink/sub/fire/haz/ok, --m-route-ink)', () => {
    const MEASURED = new Set(['--m-hero-ink', '--m-hero-sub', '--m-hero-fire', '--m-hero-haz', '--m-hero-ok', '--m-route-ink'])
    const onNavy = sRules.filter((rule) => /m-hero--detail|m-hero__|m-route--hero|process-detail-mobilebar/.test(rule.selector))
    expect(onNavy.length).toBeGreaterThan(10)
    let colors = 0
    for (const rule of onNavy) {
      for (const d of rule.declarations) {
        if (d.prop !== 'color' && !d.prop.startsWith('--m-route-')) continue
        const token = /var\((--[\w-]+)\)/.exec(d.value)?.[1]
        // o navio e' glifo (nao texto): fica no --primary, como no mock
        if (!token || token.startsWith('--m-route-off') || /__ship/.test(rule.selector)) continue
        colors += 1
        expect(MEASURED.has(token) || token.startsWith('--m-route-text') || token.startsWith('--m-route-now'), `${rule.selector} :: ${d.prop}: ${d.value}`).toBe(true)
      }
    }
    expect(colors).toBeGreaterThan(5)
    // as variaveis do trajeto no hero apontam para tokens medidos
    const route = find(sRules, '.m-route--hero')
    expect(valueOf(route, '--m-route-text')).toBe('var(--m-route-ink)')
    expect(valueOf(route, '--m-route-now')).toBe('var(--m-hero-ink)')
    expect(valueOf(route, '--m-route-off')).toBe('var(--m-route-off-hero)')
  })

  it('o hero esconde o cabecalho/timeline antigos e a barra de acao nao encolhe a ponto de cortar o ultimo bloco', () => {
    for (const hidden of [
      '.process-detail-view .process-detail-heading',
      '.process-detail-view .process-detail-card-heading__back',
      '.process-detail-view .process-timeline',
    ]) {
      expect(valueOf(find(sRules, hidden), 'display'), hidden).toBe('none')
    }
    const hero = find(sRules, '.m-hero--detail')
    expect(valueOf(hero, 'overflow')).toBe('hidden')
    expect(valueOf(hero, 'padding')).toContain('env(safe-area-inset-top')
    const cap = find(sRules, '.m-hero--detail::after')
    expect(valueOf(cap, 'background')).toBe('var(--bg)')
  })

  it('a marca oficial do hero do Inicio nao encolhe em 320px (sugestao do reviewer da F4)', () => {
    const brand = find(sRules, '.mobile-page-header__brand > svg')
    expect(valueOf(brand, 'flex')).toBe('none')
  })
})

// `inS`/`inReduce720` ficam exportados na leitura para evitar lint de "nao usado".
void inS
void inReduce720
