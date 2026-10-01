import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities, repairTextEncoding } from '../../src/utils/textEncoding'

describe('decodeHtmlEntities', () => {
  it('decodifica entidades numericas decimais e hexadecimais', () => {
    expect(decodeHtmlEntities('A &#8211; B')).toBe('A – B')
    expect(decodeHtmlEntities('&#x2013;')).toBe('–')
    expect(decodeHtmlEntities('&#X2013;')).toBe('–')
  })

  it('decodifica entidades nomeadas comuns', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeHtmlEntities('&quot;x&quot; &lt;b&gt;')).toBe('"x" <b>')
    expect(decodeHtmlEntities('&nbsp;')).toBe(' ')
    expect(decodeHtmlEntities('S&atilde;o Paulo &ndash; a&ccedil;&atilde;o')).toBe('São Paulo – ação')
  })

  it('nao decodifica em cascata (uma passada so)', () => {
    expect(decodeHtmlEntities('&amp;#8211;')).toBe('&#8211;')
  })

  it('mantem intactas entidades desconhecidas ou invalidas', () => {
    expect(decodeHtmlEntities('&foo;')).toBe('&foo;')
    expect(decodeHtmlEntities('&#0;')).toBe('&#0;')
    expect(decodeHtmlEntities('&#x110000;')).toBe('&#x110000;')
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;')
    expect(decodeHtmlEntities('&constructor;')).toBe('&constructor;')
  })

  it('devolve valores nao-string como vieram', () => {
    expect(decodeHtmlEntities(null)).toBeNull()
    expect(decodeHtmlEntities(undefined)).toBeUndefined()
    expect(decodeHtmlEntities(42)).toBe(42)
  })

  it('string sem "&" retorna a mesma referencia', () => {
    const text = 'Sem entidades aqui'
    expect(decodeHtmlEntities(text)).toBe(text)
  })
})

describe('repairTextEncoding', () => {
  it('conserta mojibake de verdade (UTF-8 lido como Latin-1)', () => {
    expect(repairTextEncoding('AÃ§Ã£o')).toBe('Ação')
    expect(repairTextEncoding('RelatÃ³rio de anÃ¡lise')).toBe('Relatório de análise')
    expect(repairTextEncoding('JoÃ£o')).toBe('João')
  })

  it('NAO corrompe texto correto com â/Â/Ã logo depois de letra (câmbio, Câmara, NÃO)', () => {
    for (const text of [
      'Contrato de câmbio',
      'CONTRATO DE CÂMBIO',
      'NÃO CONFORMIDADE',
      'Laudo da Câmara técnica',
      'Trâmite aduaneiro',
    ]) {
      const result = repairTextEncoding(text)
      expect(result).toBe(text)
      expect(result).not.toContain('\uFFFD')
    }
  })

  it('texto sem marcador de mojibake e nao-string voltam como vieram', () => {
    expect(repairTextEncoding('Certificado')).toBe('Certificado')
    expect(repairTextEncoding(null)).toBeNull()
    expect(repairTextEncoding(undefined)).toBeUndefined()
    expect(repairTextEncoding(42)).toBe(42)
  })
})
