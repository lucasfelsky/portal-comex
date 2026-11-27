// Conferência por item (Fatia A), R-STICKY: trava as regras de CSS da barra "Buscar item" (sticky opaca, sem folga, abaixo da
// barra compacta, linha e sombra só quando rolada) e do bloco novo da tela por item. Teste de TEXTO do CSS; a medição real
// (folga 0, elementsFromPoint, 320 e 390 px) é do harness `tests/e2e/conferencia-item.shots.spec.mjs`.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
const mobile = readFileSync(resolve(process.cwd(), 'src/mobile-redesign.css'), 'utf8')
const MARKER = 'CONFERENCIA POR ITEM (FATIA A)'
const marker = styles.indexOf(MARKER)
// O bloco começa no comentário de abertura (o marcador está dentro dele).
const start = marker > 0 ? styles.lastIndexOf('/*', marker) : -1
const rawBlock = start > 0 ? styles.slice(start) : ''
// Sem comentários: o texto deles não conta nas proibições.
const block = rawBlock.replace(/\/\*[\s\S]*?\*\//g, '')

function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

describe('bloco novo da conferência por item (append-only, no fim do arquivo)', () => {
  it('existe, é o último bloco do arquivo e vem depois do bloco S9-F', () => {
    expect(start).toBeGreaterThan(0)
    expect(styles.indexOf('S9-F DO RELATORIO DE CARGA - ABA CONFERENCIA NO CELULAR')).toBeGreaterThan(0)
    expect(styles.indexOf('S9-F DO RELATORIO DE CARGA - ABA CONFERENCIA NO CELULAR')).toBeLessThan(start)
    // Nenhum bloco de outra feature depois dele.
    expect(styles.slice(start).match(/={10,}\s*\n\s*[A-Z0-9]/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('sem @media, sem position: fixed (nada de fixed dentro do .page-fade) e sem cor literal (só tokens)', () => {
    expect(block).not.toMatch(/@media/)
    expect(block).not.toMatch(/position:\s*fixed/)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/\brgba?\(/)
    expect(block).not.toMatch(/\bhsla?\(/)
    expect(block).not.toMatch(/ghost-button/)
  })
})

describe('R-STICKY: .ccf-searchwrap', () => {
  const wrap = rule(block, '.ccf-searchwrap')

  it('sticky no topo da variável, com fundo opaco do tema (--bg) e sem transparência', () => {
    expect(wrap).toContain('position: sticky')
    expect(wrap).toContain('top: var(--ccf-sticky-top)')
    expect(wrap).toContain('background: var(--bg)')
    expect(wrap).not.toMatch(/rgba|transparent|backdrop-filter|opacity/)
    expect(wrap).not.toMatch(/overflow/)
  })

  it('o espaçamento até o primeiro cartão é padding DENTRO do contêiner opaco; a largura cobre de borda a borda', () => {
    expect(wrap).toContain('padding: 2px var(--ccf-gutter) 8px')
    expect(wrap).toContain('margin: 0 calc(-1 * var(--ccf-gutter))')
    expect(rule(block, '.ccf-screen')).toContain('--ccf-gutter: 16px')
  })

  it('z-index acima dos cartões e abaixo da barra compacta (26), da barra de ações (27) e da navegação (28)', () => {
    const zIndex = Number(/z-index:\s*(\d+)/.exec(wrap)?.[1])
    expect(zIndex).toBeGreaterThan(0)
    expect(zIndex).toBeLessThan(26)
    expect(styles).toMatch(/\.mobile-bottom-nav \{\s*position: fixed;[^}]*z-index: 28;/)
    expect(styles).toMatch(/\.mobile-nav-compact \{[^}]*z-index: 26;/)
    expect(rule(block, '.ccf-irow')).not.toMatch(/z-index|position/)
    expect(rule(block, '.ccf-lot')).not.toMatch(/z-index|position/)
  })

  it('o topo é a borda de baixo da barra compacta do shell (50px + safe-area, mobile-redesign.css)', () => {
    expect(rule(block, '.ccf-screen')).toContain('--ccf-sticky-top: calc(50px + env(safe-area-inset-top, 0px))')
    expect(mobile).toMatch(/\.mobile-nav-compact \{[^}]*height: calc\(50px \+ env\(safe-area-inset-top, 0px\)\);/)
    expect(rawBlock).toContain('mobile-redesign.css:2494')
  })

  it('linha e sombra finas só rolada (classe stuck), só com tokens', () => {
    const stuck = rule(block, '.ccf-searchwrap--stuck')
    expect(stuck).toContain('0 1px 0 var(--border)')
    expect(stuck).toContain('var(--shadow-md)')
    expect(stuck).not.toMatch(/rgba|#[0-9a-f]{3}/i)
    expect(rule(block, '.ccf-searchwrap')).not.toContain('box-shadow')
  })
})

describe('busca, teclado e tela por item', () => {
  it('o campo tem 48 px, o limpar tem 44x44 e some com [hidden]', () => {
    expect(rule(block, '.ccf-sbar input')).toContain('min-height: 48px')
    const clear = rule(block, '.ccf-sbar__x')
    expect(clear).toContain('width: 44px')
    expect(clear).toContain('height: 44px')
    expect(rule(block, '.ccf-sbar__x[hidden]')).toContain('display: none')
  })

  it('teclado aberto (classe no body): a barra de ações e a navegação de baixo saem de cena', () => {
    const hide = rule(block, 'body.ccf-kbd .ccf-actionbar,\nbody.ccf-kbd .mobile-bottom-nav') || /body\.ccf-kbd \.ccf-actionbar,\s*body\.ccf-kbd \.mobile-bottom-nav\s*\{([^}]*)\}/.exec(block)?.[1]
    expect(hide).toMatch(/display:\s*none/)
  })

  it('linha do item com alvo de 72 px, nome e motivo da busca; cartão do lote e "Etiquetas, fotos e avaria" com alvo de 48 px', () => {
    expect(rule(block, '.ccf-irow')).toContain('min-height: 72px')
    expect(rule(block, '.ccf-irow__hint')).toContain('color: var(--info-700)')
    expect(rule(block, '.ccf-more summary')).toContain('min-height: 48px')
    expect(rule(block, '.ccf-meta__miss')).toContain('color: var(--warning-700)')
    expect(rule(block, '.ccf-meta small')).toContain('display: block')
  })

  it('o nome do item na faixa quebra linha (sem reticências)', () => {
    const title = rule(block, '.ccf-strip__title.ccf-strip__title--wrap')
    expect(title).toContain('white-space: normal')
    expect(title).toContain('overflow: visible')
  })

  it('o contador de pallets mantém o número em 20 px (--fs-title) e os botões de 56 px', () => {
    expect(styles).toMatch(/--fs-title:\s*1\.25rem/)
    expect(styles).toMatch(/\.ccf-pal__num b \{[^}]*font-size: var\(--fs-title\);/)
    expect(styles).toMatch(/\.ccf-pal__btn \{[^}]*min-height: 56px;/)
  })
})
