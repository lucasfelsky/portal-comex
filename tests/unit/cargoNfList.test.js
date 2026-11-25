// S9-E do Relatório de Carga: lista de NFs da conferência (funções puras).
import { describe, expect, it } from 'vitest'
import {
  CARGO_NF_LIST_MAX_CHARS,
  CARGO_NF_MAX_CHARS,
  CARGO_NF_MAX_COUNT,
  CARGO_NF_SEPARATOR,
  addCargoNfs,
  canonicalCargoNfText,
  cargoNfKey,
  formatCargoNfList,
  normalizeCargoNf,
  readCargoNfList,
  removeCargoNfAt,
  splitCargoNfInput,
} from '../../src/features/processes/cargoNfList'

describe('constantes', () => {
  it('separador "; " e tetos de 1.000 caracteres, 40 por NF e 100 NFs', () => {
    expect(CARGO_NF_SEPARATOR).toBe('; ')
    expect(CARGO_NF_LIST_MAX_CHARS).toBe(1000)
    expect(CARGO_NF_MAX_CHARS).toBe(40)
    expect(CARGO_NF_MAX_COUNT).toBe(100)
  })
})

describe('normalizeCargoNf e cargoNfKey', () => {
  it('apara as pontas e colapsa espaços internos, sem forçar maiúsculas', () => {
    expect(normalizeCargoNf('  NF   12 / 1  ')).toBe('NF 12 / 1')
    expect(normalizeCargoNf(null)).toBe('')
    expect(normalizeCargoNf(123)).toBe('123')
  })

  it('a chave ignora caixa e espaços, mas não mexe em zeros à esquerda', () => {
    expect(cargoNfKey(' NF 12 ')).toBe(cargoNfKey('nf12'))
    expect(cargoNfKey('000123')).not.toBe(cargoNfKey('123'))
  })
})

describe('caracteres invisíveis', () => {
  it('U+200B, U+200C, U+200D, U+2060 e U+00AD são removidos; NBSP e BOM contam como espaço', () => {
    expect(normalizeCargoNf('123\u200b')).toBe('123')
    expect(normalizeCargoNf('\u200b1\u200c2\u200d3\u20604\u00ad5')).toBe('12345')
    expect(normalizeCargoNf('\u00a012\u00a03\ufeff')).toBe('12 3')
  })

  it('"123" e "123\u200b" são a mesma NF (duplicada), na chave e ao adicionar', () => {
    expect(cargoNfKey('123\u200b')).toBe(cargoNfKey('123'))
    const result = addCargoNfs(['123'], '123\u200b; 456\ufeff')
    expect(result.duplicates).toEqual(['123'])
    expect(result.list).toEqual(['123', '456'])
  })

  it('na leitura do valor gravado e no texto canônico também', () => {
    expect(readCargoNfList('123; 123\u200b; 4\u200b5')).toEqual(['123', '45'])
    expect(canonicalCargoNfText('\u200b12\u200d; 12')).toBe('12')
  })

  it('NF feita só de invisíveis é vazia e não entra', () => {
    expect(addCargoNfs([], '\u200b; \u200d\u200c;').added).toEqual([])
  })
})

describe('readCargoNfList (valor gravado: só ";" separa)', () => {
  it('valor antigo de até 40 caracteres sem ";" é UMA NF (inclusive com vírgula)', () => {
    expect(readCargoNfList('000.123.456')).toEqual(['000.123.456'])
    expect(readCargoNfList('123, 124')).toEqual(['123, 124'])
    expect(readCargoNfList('NF 12/1')).toEqual(['NF 12/1'])
    expect(readCargoNfList('x'.repeat(40))).toEqual(['x'.repeat(40)])
  })

  it('separa por ";", remove vazias, espaços e duplicadas (fica a primeira)', () => {
    expect(readCargoNfList(' 48213 ;48214;; 48213 ; ;NF  1; nf1')).toEqual(['48213', '48214', 'NF 1'])
  })

  it('tipo errado vira lista vazia', () => {
    expect(readCargoNfList(undefined)).toEqual([])
    expect(readCargoNfList(null)).toEqual([])
    expect(readCargoNfList(123)).toEqual([])
    expect(readCargoNfList(['1'])).toEqual([])
    expect(readCargoNfList('')).toEqual([])
  })
})

describe('splitCargoNfInput (texto digitado ou colado)', () => {
  it('";", ",", quebra de linha e tab separam', () => {
    expect(splitCargoNfInput('48213; 48214,48215\n48216\r\n48217\t48218')).toEqual([
      '48213',
      ' 48214',
      '48215',
      '48216',
      '48217',
      '48218',
    ])
  })

  it('ponto, barra e hífen não separam', () => {
    expect(splitCargoNfInput('000.123.456')).toEqual(['000.123.456'])
    expect(splitCargoNfInput('12/1-3')).toEqual(['12/1-3'])
  })
})

describe('formatCargoNfList', () => {
  it('une com "; "', () => {
    expect(formatCargoNfList(['1', '2', '3'])).toBe('1; 2; 3')
    expect(formatCargoNfList([])).toBe('')
    expect(formatCargoNfList(null)).toBe('')
  })
})

describe('addCargoNfs', () => {
  it('colar "48213; 48214,48215\\n48216" cria 4 NFs, na ordem', () => {
    const result = addCargoNfs([], '48213; 48214,48215\n48216')
    expect(result.list).toEqual(['48213', '48214', '48215', '48216'])
    expect(result.added).toEqual(['48213', '48214', '48215', '48216'])
    expect(result.rejected).toEqual([])
  })

  it('ignora vazias e espaços; mantém a ordem de inserção', () => {
    const result = addCargoNfs(['9'], '  ; , 1 ;;  2  ')
    expect(result.list).toEqual(['9', '1', '2'])
  })

  it('duplicada exata e com caixa/espaço diferente vai para duplicates', () => {
    const result = addCargoNfs(['NF 12', '000123'], '12, nf12, NF 12, 123, 000123, 000 123')
    expect(result.added).toEqual(['12', '123'])
    expect(result.duplicates).toEqual(['nf12', 'NF 12', '000123', '000 123'])
    expect(result.list).toEqual(['NF 12', '000123', '12', '123'])
  })

  it('duplicada dentro do mesmo colar entra uma vez só', () => {
    const result = addCargoNfs([], '1; 2; 1; 2; 3')
    expect(result.list).toEqual(['1', '2', '3'])
    expect(result.duplicates).toEqual(['1', '2'])
  })

  it('NF de 41 caracteres vai para tooLong; 40 entra', () => {
    const result = addCargoNfs([], `${'a'.repeat(41)}; ${'b'.repeat(40)}`)
    expect(result.tooLong).toEqual(['a'.repeat(41)])
    expect(result.added).toEqual(['b'.repeat(40)])
    expect(result.rejected).toEqual(['a'.repeat(41)])
  })

  it('lista no limite exato de 1.000 caracteres é aceita; a próxima vai para overflow sem cortar', () => {
    // 23 NFs de 40 caracteres + 22 separadores = 964; sobra espaço para uma NF de até 34 caracteres.
    const base = Array.from({ length: 23 }, (_, index) => String(index).padStart(2, '0').padEnd(40, 'x'))
    expect(formatCargoNfList(base)).toHaveLength(23 * 40 + 22 * 2)
    const room = CARGO_NF_LIST_MAX_CHARS - formatCargoNfList(base).length - CARGO_NF_SEPARATOR.length
    expect(room).toBeGreaterThan(0)
    const exact = addCargoNfs(base, 'y'.repeat(room))
    expect(exact.added).toHaveLength(1)
    expect(formatCargoNfList(exact.list)).toHaveLength(CARGO_NF_LIST_MAX_CHARS)

    const over = addCargoNfs(exact.list, 'z')
    expect(over.added).toEqual([])
    expect(over.overflow).toEqual(['z'])
    expect(over.list).toEqual(exact.list)

    const one = addCargoNfs(base, 'y'.repeat(room + 1))
    expect(one.overflow).toEqual(['y'.repeat(room + 1)])
  })

  it('depois da primeira que estoura, as seguintes também vão para overflow (mesmo as curtas)', () => {
    const base = Array.from({ length: 23 }, (_, index) => String(index).padStart(2, '0').padEnd(40, 'x'))
    const room = CARGO_NF_LIST_MAX_CHARS - formatCargoNfList(base).length - CARGO_NF_SEPARATOR.length
    const result = addCargoNfs(base, `${'y'.repeat(room + 1)}; 1; 2`)
    expect(result.added).toEqual([])
    expect(result.overflow).toEqual(['y'.repeat(room + 1), '1', '2'])
  })

  it('100 NFs: a 101ª vai para overflow', () => {
    const hundred = Array.from({ length: 100 }, (_, index) => String(index + 1))
    const result = addCargoNfs(hundred.slice(0, 99), '100; 101')
    expect(result.added).toEqual(['100'])
    expect(result.overflow).toEqual(['101'])
    expect(result.list).toHaveLength(100)
  })

  it('não muta a lista nem o texto de entrada', () => {
    const list = Object.freeze(['1'])
    const result = addCargoNfs(list, '2')
    expect(list).toEqual(['1'])
    expect(result.list).not.toBe(list)
    expect(addCargoNfs(null, '5').list).toEqual(['5'])
  })
})

describe('removeCargoNfAt', () => {
  it('remove pelo índice sem mutar', () => {
    const list = ['1', '2', '3']
    expect(removeCargoNfAt(list, 1)).toEqual(['1', '3'])
    expect(list).toEqual(['1', '2', '3'])
    expect(removeCargoNfAt(list, 9)).toEqual(['1', '2', '3'])
  })
})

describe('canonicalCargoNfText', () => {
  it('normaliza espaços, vazias e duplicadas: "a ;b;; a" -> "a; b"', () => {
    expect(canonicalCargoNfText('a ;b;; a')).toBe('a; b')
  })

  it('legado de 40 caracteres e "000.123.456" passam intactos', () => {
    expect(canonicalCargoNfText('000.123.456')).toBe('000.123.456')
    expect(canonicalCargoNfText('x'.repeat(40))).toBe('x'.repeat(40))
    expect(canonicalCargoNfText('123, 124')).toBe('123, 124')
  })

  it('texto de 1.010 caracteres descarta do fim a NF que não cabe, inteira', () => {
    const nfs = Array.from({ length: 23 }, (_, index) => String(index).padStart(2, '0').padEnd(40, 'x'))
    nfs.push('y'.repeat(40))
    const text = formatCargoNfList(nfs)
    expect(text.length).toBeGreaterThan(1000)
    const result = canonicalCargoNfText(text)
    expect(result.length).toBeLessThanOrEqual(CARGO_NF_LIST_MAX_CHARS)
    expect(result).toBe(formatCargoNfList(nfs.slice(0, 23)))
    expect(result.endsWith(';')).toBe(false)
  })

  it('tipo errado vira texto vazio', () => {
    expect(canonicalCargoNfText(undefined)).toBe('')
    expect(canonicalCargoNfText(5)).toBe('')
  })
})
