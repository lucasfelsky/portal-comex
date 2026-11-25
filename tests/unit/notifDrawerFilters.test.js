// Gaveta de notificações: a linha de abas (Todas, Dúvidas, Respostas...) não pode encolher com janela baixa nem
// ganhar barra vertical. Leitura do CSS (jsdom não calcula layout); a medição real foi feita no navegador.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(path.resolve(__dirname, '../../src/styles.css'), 'utf8').replace(/\r\n/g, '\n')

describe('gaveta de notificações: linha de abas', () => {
  const marker = '/* Gaveta de notificações (ajuste)'
  const start = css.indexOf(marker)
  const block = start >= 0 ? css.slice(start) : ''

  it('o ajuste fica no fim do arquivo, sem @media, sem hex e sem position: fixed', () => {
    expect(start).toBeGreaterThan(0)
    expect(block).not.toMatch(/@media/)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/position:\s*fixed/)
  })

  it('a linha de abas não encolhe (flex: 0 0 auto) e só rola na horizontal', () => {
    const rule = block.match(/\.notifications__panel--drawer \.notif-drawer__filters \{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/flex:\s*0 0 auto;/)
    expect(rule[1]).toMatch(/overflow-x:\s*auto;/)
    expect(rule[1]).toMatch(/overflow-y:\s*hidden;/)
  })

  it('o bloco original das abas continua existindo (nowrap, rolagem horizontal)', () => {
    expect(css).toMatch(/\n {2}\.notif-drawer__filters \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/)
  })
})
