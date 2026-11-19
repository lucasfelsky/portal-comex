// Contraste AA (4.5:1 para texto; 3:1 para glifos) dos pares de cor do remake
// mobile de Chegadas (PLAN.md F4): cartoes, chips, segmented, botao de filtros,
// marcas de carga, estado vazio e folha. Le os tokens como TEXTO de
// src/styles.css e src/mobile-redesign.css e resolve claro/escuro com a mesma
// cascata de colorContrast.test.js (root < mobile < dark < mobile dark). A
// matematica WCAG fica embutida de proposito (nao cria util em src/). Fundos
// translucidos (--m-fill) sao COMPOSTOS sobre o fundo da tela antes de medir.
// Se um par reprovar, ajuste o TOKEN usado no CSS, nunca o limiar.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const redesignCss = read('src/mobile-redesign.css')

function extractBlock(source, header, fromIndex = 0) {
  const headerIndex = source.indexOf(header, fromIndex)
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

// A re-valoracao mobile de styles.css (D6 de colorContrast.test.js) vem depois
// do marcador F16.1; os blocos de tema do topo vem antes dele.
const MOBILE_MARKER = 'F16.1 — Fundações do redesign iOS'
const rawStyles = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8')
const markerIndex = rawStyles.indexOf(MOBILE_MARKER)
if (markerIndex === -1) throw new Error('marcador F16.1 nao encontrado em src/styles.css')
const lightVars = extractVars(extractBlock(rawStyles, ':root {'))
const darkVars = extractVars(extractBlock(rawStyles, ":root[data-theme='dark'] {"))
const mobileRootVars = extractVars(extractBlock(rawStyles, ':root {', markerIndex))
const mobileDarkVars = extractVars(extractBlock(rawStyles, ":root[data-theme='dark'] {", markerIndex))
const redesignLight = extractVars(extractBlock(redesignCss, ':root {'))
const redesignDark = extractVars(extractBlock(redesignCss, ":root[data-theme='dark'] {"))

const THEMES = {
  claro: { ...lightVars, ...mobileRootVars, ...redesignLight },
  escuro: { ...lightVars, ...mobileRootVars, ...darkVars, ...mobileDarkVars, ...redesignLight, ...redesignDark },
}

function resolve(value, theme, depth = 0) {
  if (depth > 20) throw new Error(`loop resolvendo ${value}`)
  const match = /var\((--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\)/.exec(value)
  if (!match) return value.trim()
  const replacement = theme[match[1]] ?? match[2]
  if (replacement === undefined) throw new Error(`var nao resolvida: ${match[1]}`)
  return resolve(value.replace(match[0], resolve(replacement, theme, depth + 1)), theme, depth + 1)
}

function parseColor(raw) {
  const value = raw.trim()
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 }
  }
  const match = /rgba?\(\s*([^)]+)\)/.exec(value)
  if (!match) throw new Error(`cor nao suportada: ${value}`)
  const [r, g, b, a] = match[1].split(',').map((part) => part.trim())
  return { r: Number(r), g: Number(g), b: Number(b), a: a === undefined ? 1 : Number(a) }
}

const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
})

function luminance({ r, g, b }) {
  const [R, G, B] = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function ratio(theme, foregroundToken, backgroundSpec) {
  // backgroundSpec: '--token' (opaco) ou ['--translucido', '--fundo-da-tela'].
  const color = (token) => parseColor(resolve(`var(${token})`, theme))
  const bg = Array.isArray(backgroundSpec) ? over(color(backgroundSpec[0]), over(color(backgroundSpec[1]), { r: 255, g: 255, b: 255, a: 1 })) : color(backgroundSpec)
  const fg = over(color(foregroundToken), bg)
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

// [descricao, token da cor, fundo, minimo]
// A estrela favoritada (cartao de Chegadas e favorito do Inicio) usa
// `--warning-700`, nao `--warning` (#c98a12 = 2,95:1 sobre o cartao branco,
// reprova 1.4.11); o par entra com minimo 3:1 (componente de UI) e o token
// flipa no tema escuro.
const PAIRS = [
  ['linha "PO · modal", meta, chip inativo e contagem sobre o cartao', '--ink-soft', '--surface', 4.5],
  ['eyebrows (Em andamento/Concluidos), rotulos da folha, aviso visivel do Exportar (F7) e estado vazio sobre a tela', '--ink-soft', '--bg', 4.5],
  ['placeholder da busca e segmented inativo sobre o fundo translucido', '--ink-soft', ['--m-fill', '--bg'], 4.5],
  ['busca focada (fundo surface) e ETA', '--ink-soft', '--surface', 4.5],
  ['segmented ativo e ETA do cartao', '--ink', '--surface', 4.5],
  ['etapa do cartao (menta escuro)', '--primary-700', '--surface', 4.5],
  ['botao de filtros, "Limpar", icone do switch', '--primary-700', '--primary-50', 4.5],
  ['chip ativo, botao "Novo"/"Ver N" e contador do filtro', '--on-primary', '--primary', 4.5],
  ['ETA atualizada do cartao', '--warning-700', '--surface', 4.5],
  ['marca de carga inflamavel', '--danger', '--danger-50', 3],
  ['marca de carga perigosa', '--warning-700', '--warning-50', 4.5],
  ['marca de volume (caixa + numero)', '--neutral-700', '--neutral-50', 4.5],
  ['tag de status ok', '--success-700', '--success-50', 4.5],
  ['tag de status info', '--info-700', '--info-50', 4.5],
  ['tag de status danger/alerta vermelho', '--danger-700', '--danger-50', 4.5],
  ['estrela favoritada (cartao de Chegadas e favorito do Inicio)', '--warning-700', '--surface', 3],
  // F6 (Avisos, Noticias, Menu). Os pares ja medidos acima cobrem: titulo/valor (--ink/--surface),
  // texto e hora (--ink-soft/--surface), processo mono e tag (--primary-700/--surface e /--primary-50),
  // chip ativo (--on-primary/--primary), "Marcar todas" (--primary-700/--primary-50), eyebrow do Menu
  // (--ink-soft/--bg), alerta (--warning-700/--warning-50) e icone de perigo (--danger/--danger-50, 3).
  ['"Sair" e icone do ladrilho de perigo sobre o grupo', '--danger', '--surface', 4.5],
  ['ponto de nao lida (elemento grafico)', '--primary-700', '--surface', 3],
  ['segmented de tema inativo dentro do grupo (fundo translucido sobre o cartao)', '--ink-soft', ['--m-fill', '--surface'], 4.5],
  ['segmented de tema ativo e botao de acao do swipe', '--ink', '--surface', 4.5],
  ['acao "Marcar lida" do swipe', '--on-button-primary', '--button-primary-bg', 4.5],
  ['modo nao perturbe ativo (botao do Avisos)', '--on-primary', '--primary', 4.5],
  ['chevron e texto de apoio das linhas do Menu', '--ink-soft', '--surface', 4.5],
  ['tag do cartao do usuario e da noticia', '--primary-700', '--primary-50', 4.5],
]

describe('Chegadas, Avisos, Noticias e Menu mobile (F4, F6) - contraste dos pares de cor (claro e escuro)', () => {
  it('os tokens de cada tema resolvem (sem drift entre CSS e teste)', () => {
    for (const theme of Object.values(THEMES)) {
      for (const token of ['--surface', '--bg', '--ink', '--ink-soft', '--primary', '--primary-50', '--primary-700', '--on-primary', '--m-fill']) {
        expect(theme[token], token).toBeDefined()
      }
    }
    expect(THEMES.escuro['--m-fill']).not.toBe(THEMES.claro['--m-fill'])
    expect(THEMES.escuro['--surface']).not.toBe(THEMES.claro['--surface'])
  })

  it('o CSS pinta a estrela favoritada com --warning-700 (nao com --warning)', () => {
    for (const selector of ['.m-pc__star--on', '.m-fav__star']) {
      const start = redesignCss.indexOf(`${selector} {`)
      expect(start, selector).toBeGreaterThan(-1)
      const body = redesignCss.slice(redesignCss.indexOf('{', start) + 1, redesignCss.indexOf('}', start))
      expect(body, selector).toMatch(/(^|[\s;])color:\s*var\(--warning-700\)/)
    }
  })

  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const [description, foreground, background, minimum] of PAIRS) {
      it(`${themeName}: ${description} (${foreground} sobre ${Array.isArray(background) ? background.join(' + ') : background}) >= ${minimum}:1`, () => {
        expect(ratio(theme, foreground, background)).toBeGreaterThanOrEqual(minimum)
      })
    }
  }
})
