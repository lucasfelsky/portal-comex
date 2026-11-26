// S10-J1b r3: trava de geometria do botão "Remover" das fotos de avaria (jsdom não tem layout). Bug da r2: o "×" de 28/20 px
// tinha um ::after de 44 px que cobria a miniatura, e tocar na foto removia em vez de abrir. Agora o "Remover" é um botão
// PRÓPRIO numa faixa abaixo da miniatura: sem posição absoluta e sem ::after. A prova com elementFromPoint (centro e 4
// cantos da miniatura devolvem o botão "abrir") foi feita no Chromium com o styles.css real.
//
// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Declarações de TODAS as regras cujo seletor (lista separada por vírgula) contém o seletor pedido, na ordem do arquivo.
function declarationsOf(selector) {
  const result = []
  const pattern = /(^|\n)([^{}@\n][^{}]*)\{([^{}]*)\}/g
  let match
  while ((match = pattern.exec(css)) !== null) {
    const selectors = match[2].split(',').map((item) => item.trim())
    if (selectors.includes(selector)) result.push(match[3])
  }
  return result
}

function px(selector, property) {
  const values = declarationsOf(selector)
    .map((block) => new RegExp(`(?:^|[;\\s])${property}:\\s*(\\d+)px`).exec(block)?.[1])
    .filter(Boolean)
  return values.length > 0 ? Number(values[values.length - 1]) : null
}

describe('botão Remover da foto de avaria: nunca cobre a miniatura', () => {
  it('não existe ::after nem ::before no botão (a área de toque não passa da caixa dele)', () => {
    expect(css).not.toMatch(/photos__del\s*::?(after|before)/)
  })

  it.each(['.ccf-photos__del', '.crf-photos__del'])('%s não usa posição absoluta, fixa nem transform', (selector) => {
    const blocks = declarationsOf(selector)
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block).not.toMatch(/position:\s*(absolute|fixed)/)
      expect(block).not.toMatch(/transform:/)
      expect(block).not.toMatch(/\b(top|right|bottom|left):/)
    }
  })

  it.each(['.ccf-photos__del', '.crf-photos__del'])('%s tem alvo de toque de pelo menos 44 px de altura', (selector) => {
    expect(px(selector, 'min-height')).toBeGreaterThanOrEqual(44)
  })

  it('a faixa do botão tem a largura da miniatura (nunca maior)', () => {
    for (const selector of ['.ccf-photos__del', '.crf-photos__del']) {
      expect(declarationsOf(selector).join('\n')).toMatch(/width:\s*100%/)
    }
    expect(px('.ccf-photos__thumb', 'width')).toBe(px('.ccf-photos__open', 'width'))
    expect(px('.crf-photos__thumb', 'width')).toBe(px('.crf-photos__open', 'width'))
  })

  it('a miniatura do computador/tablet também é um alvo de toque de pelo menos 44 px', () => {
    expect(px('.crf-photos__open', 'width')).toBeGreaterThanOrEqual(44)
    expect(px('.crf-photos__open', 'height')).toBeGreaterThanOrEqual(44)
    expect(px('.ccf-photos__open', 'width')).toBeGreaterThanOrEqual(44)
    expect(px('.ccf-photos__open', 'height')).toBeGreaterThanOrEqual(44)
  })

  it('o item da lista empilha miniatura e botão (coluna), sem sobreposição', () => {
    const block = declarationsOf('.ccf-photos__thumb').join('\n')
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/flex-direction:\s*column/)
    expect(block).not.toMatch(/position:\s*relative/)
  })
})
