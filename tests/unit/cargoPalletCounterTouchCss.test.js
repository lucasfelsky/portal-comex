// Polimento do contador de pallets (S10-I): `touch-action: manipulation` nos botões do contador (− e +) e no número,
// nas duas variantes (celular `ccf-pal`, computador `crf-pal`), sem zoom por toque duplo nem atraso de toque. Lê o CSS
// real: o bloco é só append no fim do styles.css, sem @media novo e sem cor literal; os alvos seguem >= 44 px.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8').replace(/\r\n/g, '\n')
const MARKER = '/* S10-I (polimento): contador de pallets sem zoom por toque duplo'
const start = css.indexOf(MARKER)
const block = start >= 0 ? css.slice(start) : ''

// Todas as regras do CSS cujo seletor (lista separada por vírgula) contém `selector` exatamente.
function declarationsFor(source, selector) {
  const found = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(source)
  while (match) {
    const selectors = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((item) => item.trim())
    if (selectors.includes(selector)) found.push(match[2].replace(/\s+/g, ' ').trim())
    match = re.exec(source)
  }
  return found
}

describe('CSS: touch-action nos botões do contador de pallets', () => {
  it('o bloco existe no fim do arquivo, sem @media novo e sem hex', () => {
    expect(start).toBeGreaterThan(0)
    expect(block).not.toMatch(/@media/)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/position:\s*fixed/)
  })

  it.each(['.ccf-pal__btn', '.ccf-pal__num', '.crf-pal__btn', '.crf-pal__num'])(
    '%s tem touch-action: manipulation',
    (selector) => {
      expect(declarationsFor(block, selector).join(' ')).toContain('touch-action: manipulation')
    }
  )

  it('o + e o − do celular usam a mesma classe de botão (os dois ficam cobertos)', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/features/processes/CargoPalletCounter.jsx'), 'utf8')
    expect(component).toMatch(/className=\{`\$\{prefix\}__btn`\}/)
    expect(component).toMatch(/className=\{`\$\{prefix\}__btn \$\{prefix\}__btn--plus`\}/)
  })

  it('os alvos de toque seguem com pelo menos 44 px (celular 56 px; computador 44 px por pseudo-elemento)', () => {
    expect(declarationsFor(css, '.ccf-pal__btn').join(' ')).toMatch(/min-height: 56px/)
    expect(declarationsFor(css, '.ccf-pal__num').join(' ')).toMatch(/min-height: 56px/)
    expect(declarationsFor(css, '.crf-pal__btn::after').join(' ')).toMatch(/width: 44px; height: 44px/)
  })

  it('o último @media do arquivo continua antes do bloco (bloco só append)', () => {
    const lastMedia = css.lastIndexOf('@media')
    expect(lastMedia).toBeGreaterThan(0)
    expect(lastMedia).toBeLessThan(start)
  })
})
