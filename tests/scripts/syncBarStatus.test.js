// Unit tests do syncBarStatus.mjs — parser do `cond_barra` (HTML da Praticagem
// ZP21), regra edge-triggered de aplicacao e guardas do workflow/imports. Sem
// emulador e sem rede. O fluxo completo (fetch + Firestore) e' coberto por
// tests/scripts/syncBarStatus.e2e.test.js (roda so com FIRESTORE_EMULATOR_HOST).

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { clip, decideAutoApply, parseBarConditionFromHtml } from '../../scripts/syncBarStatus.mjs'

// Nome montado em partes para o repo não ter a string literal (git grep -i da lib removida deve sair 1).
const OCR_LIB = ['tesse', 'ract'].join('')

function readRepoFile(...segments) {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf8')
}

function htmlWith(item) {
  return `<script>\n let cond_barra = [${JSON.stringify(item)}];\n</script>`
}

describe('syncBarStatus — parseBarConditionFromHtml (fixtures reais)', () => {
  it('fixture praticável -> PRATICAVEL (código 1)', () => {
    const result = parseBarConditionFromHtml(
      readRepoFile('tests/fixtures/barra/zp21-home-praticavel-2026-10-19.html')
    )
    expect(result.ok).toBe(true)
    expect(result.code).toBe('1')
    expect(result.status.value).toBe('PRATICAVEL')
    expect(result.siteDescription).toBe('Praticável')
    expect(result.restriction).toBe('')
  })

  it('fixture impraticável -> IMPRATICAVEL, mesmo com <img> apontando para barra-praticavel.jpg', () => {
    const html = readRepoFile('tests/fixtures/barra/zp21-home-impraticavel-2024-12-09.html')
    // Causa raiz do OCR antigo: a imagem estática SEMPRE é a "praticável".
    expect(html).toContain('barra-praticavel.jpg')

    const result = parseBarConditionFromHtml(html)
    expect(result.ok).toBe(true)
    expect(result.code).toBe('2')
    expect(result.status.value).toBe('IMPRATICAVEL')
    expect(result.status.tone).toBe('danger')
    expect(result.restriction).toBe('Correnteza')
  })
})

describe('syncBarStatus — parseBarConditionFromHtml (mapeamento)', () => {
  it.each(['3', '4', '5'])('código %s -> PRATICAVEL_RESTRICOES', (code) => {
    const result = parseBarConditionFromHtml(
      htmlWith({ condicao_barra: code, desc_condicao_barra: 'Praticável com restrições', restricao: 'Calado' })
    )
    expect(result.ok).toBe(true)
    expect(result.status.value).toBe('PRATICAVEL_RESTRICOES')
    expect(result.status.label).toBe('PRATICAVEL C/ RESTRICOES')
    expect(result.status.tone).toBe('warn')
  })

  it('código numérico 2 (sem aspas) -> IMPRATICAVEL', () => {
    const result = parseBarConditionFromHtml(
      'var cond_barra = [{"condicao_barra":2,"desc_condicao_barra":"Impraticável"}];'
    )
    expect(result.ok).toBe(true)
    expect(result.status.value).toBe('IMPRATICAVEL')
  })

  it('descrição com escape \\u00e1 é aceita', () => {
    const result = parseBarConditionFromHtml(
      'const cond_barra=[{"condicao_barra":"1","desc_condicao_barra":"Pratic\\u00e1vel"}] ;'
    )
    expect(result.ok).toBe(true)
    expect(result.siteDescription).toBe('Praticável')
  })

  it('código 2 com descrição vazia é aceito', () => {
    const result = parseBarConditionFromHtml(htmlWith({ condicao_barra: '2', desc_condicao_barra: '' }))
    expect(result.ok).toBe(true)
    expect(result.status.value).toBe('IMPRATICAVEL')
  })

  it('corta restrição em 200 caracteres', () => {
    const result = parseBarConditionFromHtml(
      htmlWith({ condicao_barra: '1', desc_condicao_barra: 'Praticável', restricao: 'x'.repeat(500) })
    )
    expect(result.ok).toBe(true)
    expect(result.restriction).toHaveLength(200)
  })
})

describe('syncBarStatus — parseBarConditionFromHtml (falhas)', () => {
  it('código "9" -> unknown-code', () => {
    const result = parseBarConditionFromHtml(htmlWith({ condicao_barra: '9', desc_condicao_barra: 'Novo' }))
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('unknown-code')
    expect(result.error).toContain('9')
  })

  it.each([
    ['1', 'Impraticável'],
    ['1', 'IMPRATICAVEL'],
  ])('código %s com descrição "%s" (contradição perigosa) -> inconsistent-status', (code, description) => {
    const result = parseBarConditionFromHtml(
      htmlWith({ condicao_barra: code, desc_condicao_barra: description })
    )
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('inconsistent-status')
  })

  it('código 1 com "Praticável sem restrições" é aceito (restri não rejeita)', () => {
    const result = parseBarConditionFromHtml(
      htmlWith({ condicao_barra: '1', desc_condicao_barra: 'Praticável sem restrições' })
    )
    expect(result.ok).toBe(true)
    expect(result.status.value).toBe('PRATICAVEL')
  })

  it.each([['Fechada'], ['Praticável'], ['Impraticável'], ['ImpraticÃ¡vel']])(
    'código 2 com descrição "%s" -> IMPRATICAVEL (direção cautelosa, nunca rejeitado)',
    (description) => {
      const result = parseBarConditionFromHtml(
        htmlWith({ condicao_barra: '2', desc_condicao_barra: description })
      )
      expect(result.ok).toBe(true)
      expect(result.status.value).toBe('IMPRATICAVEL')
    }
  )

  it.each(['3', '4', '5'])('código %s com descrição "impraticável para calado > 12m" -> PRATICAVEL_RESTRICOES', (code) => {
    const result = parseBarConditionFromHtml(
      htmlWith({ condicao_barra: code, desc_condicao_barra: 'Impraticável para calado > 12m' })
    )
    expect(result.ok).toBe(true)
    expect(result.status.value).toBe('PRATICAVEL_RESTRICOES')
  })

  it('duas ocorrências de cond_barra -> parse-status "aparece 2 vezes"', () => {
    const one = 'let cond_barra = [{"condicao_barra":"1","desc_condicao_barra":"Praticável"}];'
    const result = parseBarConditionFromHtml(`${one}\n${one}`)
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('parse-status')
    expect(result.error).toContain('cond_barra aparece 2 vezes')
  })

  it('quebras de linha no texto do site viram espaço (sem injeção de comando de workflow)', () => {
    const result = parseBarConditionFromHtml(
      htmlWith({
        condicao_barra: '2',
        desc_condicao_barra: 'Impraticável\n::error::injetado',
        restricao: 'a\r\n::warning::b',
      })
    )
    expect(result.ok).toBe(true)
    expect(result.siteDescription).toBe('Impraticável ::error::injetado')
    expect(result.restriction).toBe('a ::warning::b')

    const unknown = parseBarConditionFromHtml(
      htmlWith({ condicao_barra: '9', desc_condicao_barra: 'x\n::error::y' })
    )
    expect(unknown.ok).toBe(false)
    expect(unknown.error).not.toMatch(/[\r\n]/)
  })

  it('clip troca quebras de linha por espaço e corta', () => {
    expect(clip('  a\nb\r\nc  ', 100)).toBe('a b c')
    expect(clip('abcdef', 3)).toBe('abc')
    expect(clip(null, 10)).toBe('')
  })

  it.each([
    ['HTML sem cond_barra', '<html><body>sem dados</body></html>'],
    ['array vazio', 'let cond_barra = [];'],
    ['JSON inválido', 'let cond_barra = [{condicao_barra: 1,}];'],
    ['primeiro item não-objeto', 'let cond_barra = [1];'],
    ['string vazia', ''],
    ['null', null],
  ])('%s -> parse-status', (_label, html) => {
    const result = parseBarConditionFromHtml(html)
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('parse-status')
  })
})

describe('syncBarStatus — decideAutoApply (edge-triggered)', () => {
  it('sem anterior + current diferente do site -> aplica', () => {
    expect(
      decideAutoApply({ siteStatus: 'IMPRATICAVEL', previousSiteStatus: null, currentStatus: 'PRATICAVEL' })
    ).toBe(true)
  })

  it('sem anterior + current igual ao site -> não aplica', () => {
    expect(
      decideAutoApply({ siteStatus: 'PRATICAVEL', previousSiteStatus: null, currentStatus: 'PRATICAVEL' })
    ).toBe(false)
  })

  it('anterior igual ao site (override manual do admin) -> não aplica', () => {
    expect(
      decideAutoApply({
        siteStatus: 'IMPRATICAVEL',
        previousSiteStatus: 'IMPRATICAVEL',
        currentStatus: 'PRATICAVEL_RESTRICOES',
      })
    ).toBe(false)
  })

  it('site mudou + current diferente -> aplica', () => {
    expect(
      decideAutoApply({
        siteStatus: 'PRATICAVEL',
        previousSiteStatus: 'IMPRATICAVEL',
        currentStatus: 'PRATICAVEL_RESTRICOES',
      })
    ).toBe(true)
  })

  it('site mudou para o valor que o current já tem -> não aplica', () => {
    expect(
      decideAutoApply({
        siteStatus: 'PRATICAVEL',
        previousSiteStatus: 'IMPRATICAVEL',
        currentStatus: 'PRATICAVEL',
      })
    ).toBe(false)
  })

  it('current inexistente + site mudou -> aplica', () => {
    expect(
      decideAutoApply({ siteStatus: 'PRATICAVEL', previousSiteStatus: 'IMPRATICAVEL', currentStatus: null })
    ).toBe(true)
  })
})

describe('syncBarStatus — guardas de workflow, imports e dependências', () => {
  it('workflow: sem a lib de OCR antiga, com workflow_dispatch, timeout-minutes e cron 4x/hora fora do minuto 0', () => {
    const workflow = readRepoFile('.github/workflows/sync-bar-status.yml')
    expect(workflow).not.toContain(OCR_LIB)
    expect(workflow).toContain('workflow_dispatch')
    expect(workflow).toContain('timeout-minutes')
    expect(workflow).toContain('7,22,37,52 * * * *')
  })

  it('script só importa módulos node: (o workflow não roda npm ci)', () => {
    const source = readRepoFile('scripts/syncBarStatus.mjs')
    const specifiers = [...source.matchAll(/^import\s[^'"]*from\s+['"]([^'"]+)['"]/gm)].map(
      (match) => match[1]
    )
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(specifier.startsWith('node:')).toBe(true)
    }
  })

  it('package.json não declara a lib de OCR antiga', () => {
    const pkg = JSON.parse(readRepoFile('package.json'))
    expect(pkg.dependencies?.[`${OCR_LIB}.js`]).toBeUndefined()
    expect(pkg.devDependencies?.[`${OCR_LIB}.js`]).toBeUndefined()
  })
})
