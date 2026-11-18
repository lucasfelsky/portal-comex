// Contraste do hero navy do remake mobile (PLAN.md F1). Le os dois blocos :root
// de src/mobile-redesign.css como TEXTO e mede a razao WCAG 2.x das cores de
// texto do hero sobre cada parada do gradiente (claro e escuro). A matematica
// WCAG e' a mesma de colorContrast.test.js, embutida aqui de proposito (nao
// cria util em src/). Se algum token reprovar, ajuste o TOKEN, nunca o limiar.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = fs
  .readFileSync(path.resolve(process.cwd(), 'src/mobile-redesign.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function extractBlock(source, header) {
  const headerIndex = source.indexOf(header)
  if (headerIndex === -1) throw new Error(`header nao encontrado: ${header}`)
  const braceStart = source.indexOf('{', headerIndex)
  let depth = 1
  let i = braceStart + 1
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') depth -= 1
    i += 1
  }
  return source.slice(braceStart + 1, i - 1)
}

function extractVars(body) {
  const vars = {}
  for (const match of body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim().replace(/\s+/g, ' ')
  }
  return vars
}

const rootVars = extractVars(extractBlock(css, ':root {'))
const darkVars = { ...rootVars, ...extractVars(extractBlock(css, ":root[data-theme='dark'] {")) }

const TEXT_TOKENS = ['--m-hero-ink', '--m-hero-sub', '--m-route-ink', '--m-hero-fire', '--m-hero-haz', '--m-hero-ok']
// Tokens de texto que moram DENTRO do chip da Barra do Rio (F3) e das marcas de
// carga do hero: ali o fundo e' o --m-hero-chip (branco translucido) sobre o gradiente.
const CHIP_TEXT_TOKENS = ['--m-hero-ink', '--m-hero-ok', '--m-hero-haz', '--m-hero-fire']
const THEMES = {
  claro: { vars: rootVars, backgrounds: ['#003241', '#004153', '#0a5468'] },
  escuro: { vars: darkVars, backgrounds: ['#031820', '#062833', '#0a3a48'] },
}

function parseHex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) throw new Error(`cor hex #rrggbb esperada, veio: ${value}`)
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

// Compoe o --m-hero-chip (rgba branco com alfa) sobre uma parada do gradiente.
function chipOver(chip, background) {
  const match = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(chip)
  if (!match) throw new Error(`rgba() esperado em --m-hero-chip, veio: ${chip}`)
  const [r, g, b, alpha] = [match[1], match[2], match[3], match[4]].map(Number)
  const base = parseHex(background)
  const mixed = [r, g, b].map((channel, index) => Math.round(base[index] * (1 - alpha) + channel * alpha))
  return '#' + mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')
}

function contrast(foreground, background) {
  const a = luminance(parseHex(foreground))
  const b = luminance(parseHex(background))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('hero navy do mobile - contraste dos tokens de texto (WCAG AA 4.5:1)', () => {
  it('o gradiente do hero usa exatamente as paradas medidas (sem drift entre token e teste)', () => {
    for (const [name, { vars, backgrounds }] of Object.entries(THEMES)) {
      const gradient = vars['--m-hero-bg'].toLowerCase()
      for (const background of backgrounds) {
        expect(gradient, `${name}: parada ${background} fora do --m-hero-bg`).toContain(background)
      }
    }
  })

  for (const [themeName, { vars, backgrounds }] of Object.entries(THEMES)) {
    for (const token of TEXT_TOKENS) {
      for (const background of backgrounds) {
        it(`${themeName}: ${token} sobre ${background} >= 4.5:1`, () => {
          expect(vars[token], `${token} ausente`).toBeDefined()
          expect(contrast(vars[token], background)).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
  // F3: o texto do chip da Barra do Rio (12,5px, nao e texto grande) e as marcas
  // de carga do hero ficam sobre o chip; a pior parada e' a mais clara do gradiente.
  for (const [themeName, { vars, backgrounds }] of Object.entries(THEMES)) {
    for (const token of CHIP_TEXT_TOKENS) {
      it(`${themeName}: ${token} sobre o --m-hero-chip na PIOR parada do gradiente >= 4.5:1`, () => {
        expect(vars[token], `${token} ausente`).toBeDefined()
        const worst = Math.min(
          ...backgrounds.map((background) => contrast(vars[token], chipOver(vars['--m-hero-chip'], background)))
        )
        expect(worst).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
