import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities } from '../../src/utils/textEncoding'

describe('decodeHtmlEntities', () => {
  it('decodifica entidades numericas decimais e hexadecimais', () => {
    expect(decodeHtmlEntities('A &#8211; B')).toBe('A – B')
    expect(decodeHtmlEntities('&#x2013;')).toBe('–')
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
