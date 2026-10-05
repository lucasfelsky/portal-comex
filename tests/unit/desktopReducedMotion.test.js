// Guarda do movimento reduzido no desktop (Roadmap 11, PLAN.md). Le src/styles.css
// como TEXTO e confirma o bloco `(min-width: 1041px) and (prefers-reduced-motion)`.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const css = fs.readFileSync(path.resolve(ROOT, 'src/styles.css'), 'utf8')
const PRELUDE = '@media (min-width: 1041px) and (prefers-reduced-motion: reduce)'

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
        blocks.push({ prelude: norm(prelude), body: source.slice(bodyStart, i), start: preludeStart })
        preludeStart = i + 1
      }
    }
  }
  return blocks
}

const blocks = readBlocks(stripComments(css))
const target = blocks.filter((b) => b.prelude === PRELUDE)

function rulesOf(block) {
  return readBlocks(block.body).map((r) => ({
    selectors: r.prelude.split(',').map(norm),
    decls: norm(r.body),
  }))
}

function ruleFor(selector) {
  return rulesOf(target[0]).find((r) => r.selectors.includes(selector))
}

describe('reduced-motion desktop', () => {
  it('tem exatamente 1 bloco top-level com o preludio esperado', () => {
    expect(target).toHaveLength(1)
  })

  it.each(['.notifications__panel', '.notifications-backdrop', '.modal-backdrop', '.news-modal-backdrop', '.modal', '.toast'])(
    '%s tem animation: none',
    (selector) => {
      expect(ruleFor(selector)?.decls).toContain('animation: none')
    },
  )

  it.each(['.notifications__panel--closing', '.notifications-backdrop--closing', '.modal--sheet-closing', '.modal-backdrop--closing', '.toast--closing'])(
    '%s some na hora e nao intercepta clique',
    (selector) => {
      const decls = ruleFor(selector)?.decls ?? ''
      expect(decls).toContain('animation: none')
      expect(decls).toContain('opacity: 0')
      expect(decls).toContain('pointer-events: none')
    },
  )

  it('vem depois da ultima regra top-level de .toast e .toast--closing', () => {
    const last = (re) => Math.max(...blocks.filter((b) => re.test(b.prelude)).map((b) => b.start))
    const start = target[0].start
    expect(start).toBeGreaterThan(last(/(^|,)\s*\.toast(--closing)?\s*$/))
  })

  it('mantem os 11 blocos @media (prefers-reduced-motion: reduce)', () => {
    const count = blocks.filter((b) => b.prelude === '@media (prefers-reduced-motion: reduce)').length
    expect(count).toBe(11)
  })

  it('JS de fechamento nao depende de animationend/transitionend', () => {
    for (const file of ['Modal.jsx', 'Toast.jsx', 'AppLayout.jsx']) {
      const src = fs.readFileSync(path.resolve(ROOT, 'src/components', file), 'utf8')
      expect(src, file).not.toMatch(/animationend|transitionend|onAnimationEnd|onTransitionEnd/i)
    }
  })
})
