// S2 do Relatório de Carga: tabela mestra "Item x Emb." (módulo puro cargoReportCatalog.js).
// Fixtures 100% sintéticas, montadas em memória (nunca o catálogo real).
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  ITEM_PACKAGING_INVALID_FILE_MESSAGE,
  ITEM_PACKAGING_MAX_FILE_BYTES,
  buildItemPackagingIndex,
  diffItemPackagingCatalogs,
  estimateItemPackagingDocBytes,
  findItemPackagingSheet,
  getItemPackaging,
  normalizeCatalogText,
  normalizeItemCode,
  normalizePackagingType,
  parseCatalogWeight,
  parseItemPackagingMatrix,
  readItemPackagingWorkbook,
  sha256Hex,
  summarizeItemPackaging,
} from '../../src/features/processes/cargoReportCatalog.js'

const HEADER = ['ITEM', 'DESCRIÇÃO', 'TIPO EMB.', 'PESO LIQ\nPOR EMB.']

function parse(rows) {
  return parseItemPackagingMatrix([HEADER, ...rows])
}

function buildWorkbookFile(sheets, name = 'catalogo.xlsx') {
  const workbook = XLSX.utils.book_new()
  for (const [sheetName, matrix] of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), sheetName)
  }
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new File([bytes], name)
}

describe('normalizeItemCode', () => {
  it('apara, põe em maiúsculas e aceita número e NBSP', () => {
    expect(normalizeItemCode(' mo5079 ')).toBe('MO5079')
    expect(normalizeItemCode(12345)).toBe('12345')
    expect(normalizeItemCode(' ab1234 ')).toBe('AB1234')
    expect(normalizeItemCode(null)).toBe('')
    expect(normalizeItemCode('   ')).toBe('')
  })

  it('não remove espaço interno', () => {
    expect(normalizeItemCode('ab 1234')).toBe('AB 1234')
  })
})

describe('parseCatalogWeight', () => {
  it('lê números e textos pt-BR', () => {
    expect(parseCatalogWeight(5)).toBe(5)
    expect(parseCatalogWeight('12,5')).toBe(12.5)
    expect(parseCatalogWeight('1.000')).toBe(1000)
    expect(parseCatalogWeight('1.350,5')).toBe(1350.5)
    expect(parseCatalogWeight('12.5')).toBe(12.5)
    expect(parseCatalogWeight('5 kg')).toBe(5)
    expect(parseCatalogWeight('5KG')).toBe(5)
  })

  it('vazio vira null e lixo vira NaN', () => {
    expect(parseCatalogWeight('')).toBeNull()
    expect(parseCatalogWeight('   ')).toBeNull()
    expect(parseCatalogWeight(undefined)).toBeNull()
    expect(parseCatalogWeight('abc')).toBeNaN()
    expect(parseCatalogWeight('1,2,3')).toBeNaN()
    expect(parseCatalogWeight(Number.POSITIVE_INFINITY)).toBeNaN()
  })

  it('arredonda a 3 casas', () => {
    expect(parseCatalogWeight(1.23456)).toBe(1.235)
    expect(parseCatalogWeight('0,12345')).toBe(0.123)
  })
})

describe('cabeçalho e aba', () => {
  it('reconhece o cabeçalho com quebra de linha e acento', () => {
    const result = parse([['MO5079', 'SEA THEICTA - BLD 5KG', 'BALDE', 5]])
    expect(result.fatal).toBe('')
    expect(result.items).toHaveLength(1)
  })

  it('reconhece variações do rótulo de tipo e ignora linhas vazias antes do cabeçalho', () => {
    const result = parseItemPackagingMatrix([
      ['', '', '', ''],
      ['item', 'descricao', 'Tipo de Embalagem', 'Peso líq. por emb.'],
      ['MO5079', 'X', 'BALDE', 5],
    ])
    expect(result.fatal).toBe('')
    expect(result.items[0].packagingType).toBe('BALDE')
  })

  it('cabeçalho errado ou matriz vazia é fatal', () => {
    expect(parseItemPackagingMatrix([['CODIGO', 'NOME', 'X', 'Y']]).fatal).toBe(ITEM_PACKAGING_INVALID_FILE_MESSAGE)
    expect(parseItemPackagingMatrix([]).fatal).toBe(ITEM_PACKAGING_INVALID_FILE_MESSAGE)
    expect(parseItemPackagingMatrix(null).fatal).toBe(ITEM_PACKAGING_INVALID_FILE_MESSAGE)
  })

  it('findItemPackagingSheet prefere o nome e cai para o cabeçalho', () => {
    expect(findItemPackagingSheet(['SQ QUIMICA', 'Item x Emb.'])).toBe('Item x Emb.')
    expect(findItemPackagingSheet(['A', 'item  X  emb.'])).toBe('item  X  emb.')
    expect(findItemPackagingSheet(['A', 'B'], { A: ['x', 'y'], B: HEADER })).toBe('B')
    expect(findItemPackagingSheet(['A', 'B'], { A: [[''], HEADER] })).toBe('A')
    expect(findItemPackagingSheet(['A'])).toBeNull()
  })
})

describe('validação das linhas', () => {
  it('código vazio com outra coluna preenchida é erro; linha totalmente vazia é ignorada', () => {
    const result = parse([
      ['', 'SEM CODIGO', 'BALDE', 5],
      ['', '', '', ''],
      ['AA0001', 'OK', '', ''],
    ])
    expect(result.errors).toEqual([{ row: 2, code: '', message: 'código vazio' }])
    expect(result.items.map((item) => item.code)).toEqual(['AA0001'])
    expect(result.stats.rows).toBe(2)
  })

  it('código com espaço interno ou caracteres fora do padrão é erro', () => {
    const result = parse([
      ['AA 0001', 'X', 'BALDE', 5],
      ['-AA0001', 'X', 'BALDE', 5],
      ['A'.repeat(33), 'X', 'BALDE', 5],
    ])
    expect(result.errors.map((error) => error.row)).toEqual([2, 3, 4])
    expect(result.errors[0].message).toContain('código inválido')
    expect(result.items).toHaveLength(0)
  })

  it('aceita códigos fora do AA9999 dentro do padrão permitido', () => {
    const result = parse([
      ['mo5079', 'X', '', ''],
      ['AB.12/3-4_5', 'X', '', ''],
    ])
    expect(result.errors).toEqual([])
    expect(result.items.map((item) => item.code)).toEqual(['MO5079', 'AB.12/3-4_5'])
  })

  it('código repetido cita a primeira linha (após trim e maiúsculas)', () => {
    const result = parse([
      ['AD5240', 'A', 'BALDE', 5],
      [' ad5240 ', 'B', 'BALDE', 5],
    ])
    expect(result.errors).toEqual([
      { row: 3, code: 'AD5240', message: 'código repetido: AD5240 (já na linha 2)' },
    ])
    expect(result.items).toHaveLength(1)
  })

  it('peso zero, negativo, texto inválido ou acima do limite é erro', () => {
    const result = parse([
      ['AA0001', 'X', 'BALDE', 0],
      ['AA0002', 'X', 'BALDE', -3],
      ['AA0003', 'X', 'BALDE', 'abc'],
      ['AA0004', 'X', 'BALDE', 100001],
      ['AA0005', 'X', 'BALDE', 100000],
    ])
    expect(result.errors.map((error) => error.row)).toEqual([2, 3, 4, 5])
    expect(result.errors[2].message).toBe('peso inválido: "abc" (use número, ex. 12,5)')
    expect(result.items.map((item) => item.code)).toEqual(['AA0005'])
  })

  it('descrição e tipo acima do limite são erro', () => {
    const result = parse([
      ['AA0001', 'D'.repeat(201), 'BALDE', 5],
      ['AA0002', 'X', 'T'.repeat(41), 5],
    ])
    expect(result.errors.map((error) => error.row)).toEqual([2, 3])
  })

  it('linha sem tipo e sem peso é item válido "sem embalagem" e não gera aviso', () => {
    const result = parse([
      ['AM9774', '2606 - AMOSTRA', '', ''],
      ['MO5079', 'SEA', 'BALDE', 5],
    ])
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.items[0]).toEqual({ code: 'AM9774', description: '2606 - AMOSTRA', packagingType: '', netWeightKg: null })
    expect(result.stats).toMatchObject({ rows: 2, withPackaging: 1, withoutPackaging: 1 })
    expect(result.stats.packagingTypes).toEqual({ BALDE: 1 })
  })

  it('tipo sem peso, peso sem tipo e descrição vazia são avisos que não bloqueiam', () => {
    const result = parse([
      ['AA0001', 'X', 'BALDE', ''],
      ['AA0002', 'X', '', 7],
      ['AA0003', '', 'PET', 1],
    ])
    expect(result.errors).toEqual([])
    expect(result.items).toHaveLength(3)
    expect(result.warnings.map((warning) => [warning.row, warning.code])).toEqual([
      [2, 'AA0001'],
      [3, 'AA0002'],
      [4, 'AA0003'],
    ])
    expect(result.stats).toMatchObject({ withPackaging: 1, withoutPackaging: 2 })
  })

  it('acima de 5000 itens é fatal', () => {
    const rows = Array.from({ length: 5001 }, (_, index) => [`C${index}`, '', '', ''])
    expect(parse(rows).fatal).toContain('5.000')
  })

  it('o limite de 5000 conta linhas lidas, não mensagens de erro (linha com 2 erros não infla)', () => {
    // 2600 linhas com 2 erros cada (peso inválido + descrição longa): 5200 erros, mas só 2600 linhas.
    const longText = 'X'.repeat(201)
    const rows = Array.from({ length: 2600 }, (_, index) => [`C${index}`, longText, '', 'abc'])
    const result = parse(rows)
    expect(result.errors.length).toBe(5200)
    expect(result.stats.rows).toBe(2600)
    expect(result.fatal).toBe('')
    // Exatamente 5000 linhas ainda passa; 5001 é fatal mesmo com todas inválidas.
    expect(parse(Array.from({ length: 5000 }, (_, index) => [`C${index}`, '', '', ''])).fatal).toBe('')
    expect(parse(Array.from({ length: 5001 }, (_, index) => [`C${index}`, longText, '', ''])).fatal).toContain('5.000')
  })
})

describe('textos', () => {
  it('preserva acentos legítimos (sem reparo de mojibake), colapsa NBSP/espaços e mantém GALÃO', () => {
    const result = parse([
      ['AA0001', 'EMULSÃO  ORGÂNICO TITÂNIO ®  ', ' galão ', 20],
      ['AA0002', 'EMULSÃO 5KG', 'tambor metal.', 200],
    ])
    expect(result.items[0].description).toBe('EMULSÃO ORGÂNICO TITÂNIO ®')
    expect(result.items[0].packagingType).toBe('GALÃO')
    expect(result.items[1].description).toBe('EMULSÃO 5KG')
    expect(result.items[1].packagingType).toBe('TAMBOR METAL.')
  })

  it('normaliza para NFC', () => {
    expect(normalizeCatalogText('Ação'.normalize('NFD'))).toBe('Ação'.normalize('NFC'))
    expect(normalizePackagingType('galão')).toBe('GALÃO')
  })
})

describe('diffItemPackagingCatalogs', () => {
  const base = [
    { code: 'AA0001', description: 'A', packagingType: 'BALDE', netWeightKg: 5 },
    { code: 'AA0002', description: 'B', packagingType: 'CAIXA', netWeightKg: 5 },
    { code: 'AA0003', description: 'C', packagingType: '', netWeightKg: null },
    { code: 'AA0004', description: 'D', packagingType: 'PET', netWeightKg: 1 },
  ]

  it('classifica novos, alterados (por campo), removidos e inalterados', () => {
    const next = [
      { code: 'aa0001', description: 'A', packagingType: 'BALDE', netWeightKg: 25 },
      { code: 'AA0002', description: 'B', packagingType: 'CX', netWeightKg: 5 },
      { code: 'AA0003', description: 'C', packagingType: '', netWeightKg: null },
      { code: 'AA0009', description: 'NOVO', packagingType: '', netWeightKg: null },
    ]
    const diff = diffItemPackagingCatalogs(base, next)

    expect(diff.added).toEqual(['AA0009'])
    expect(diff.removed).toEqual(['AA0004'])
    expect(diff.unchanged).toBe(1)
    expect(diff.changed.map((change) => [change.code, change.fields])).toEqual([
      ['AA0001', ['netWeightKg']],
      ['AA0002', ['packagingType']],
    ])
    expect(diff.changed[0].before.netWeightKg).toBe(5)
    expect(diff.changed[0].after.netWeightKg).toBe(25)
  })

  it('catálogo atual vazio: tudo é novo', () => {
    const diff = diffItemPackagingCatalogs([], base)
    expect(diff.added).toHaveLength(4)
    expect(diff.removed).toEqual([])
    expect(diff.changed).toEqual([])
  })

  it('sem diferenças', () => {
    const diff = diffItemPackagingCatalogs(base, base)
    expect(diff).toEqual({ added: [], changed: [], removed: [], unchanged: 4 })
  })

  it('null versus número no peso é alteração', () => {
    const diff = diffItemPackagingCatalogs(base, [{ ...base[2], netWeightKg: 3 }])
    expect(diff.changed[0].fields).toEqual(['netWeightKg'])
  })
})

describe('getItemPackaging', () => {
  const items = [
    { code: 'MO5079', description: 'SEA', packagingType: 'BALDE', netWeightKg: 5 },
    { code: 'AM9774', description: 'AMOSTRA', packagingType: '', netWeightKg: null },
  ]

  it('aceita { items }, array e Map', () => {
    expect(getItemPackaging({ items }, 'MO5079')).toEqual(items[0])
    expect(getItemPackaging(items, 'MO5079')).toEqual(items[0])
    expect(getItemPackaging(buildItemPackagingIndex(items), 'MO5079')).toEqual(items[0])
  })

  it('normaliza o código, devolve null para inexistente e preserva peso null', () => {
    expect(getItemPackaging(items, ' mo5079 ')?.netWeightKg).toBe(5)
    expect(getItemPackaging(items, 'XX0000')).toBeNull()
    expect(getItemPackaging(items, '')).toBeNull()
    expect(getItemPackaging(null, 'MO5079')).toBeNull()
    expect(getItemPackaging(items, 'am9774')?.netWeightKg).toBeNull()
  })
})

describe('estimateItemPackagingDocBytes e summarizeItemPackaging', () => {
  const item = (index) => ({
    code: `AA${String(index).padStart(4, '0')}`,
    description: 'PRODUTO QUIMICO EXEMPLO - TAMBOR 200KG',
    packagingType: 'TAMBOR',
    netWeightKg: 200,
  })

  it('cresce com o tamanho e 5000 itens médios ficam abaixo de 900000', () => {
    const small = estimateItemPackagingDocBytes([item(1)])
    const bigger = estimateItemPackagingDocBytes([item(1), item(2)])
    expect(bigger).toBeGreaterThan(small)
    expect(estimateItemPackagingDocBytes(Array.from({ length: 5000 }, (_, index) => item(index)))).toBeLessThan(900000)
    expect(estimateItemPackagingDocBytes([{ ...item(1), description: 'ÇÃO'.repeat(50) }])).toBeGreaterThan(small)
  })

  it('conta itens com e sem embalagem', () => {
    expect(
      summarizeItemPackaging([item(1), { code: 'X', description: '', packagingType: '', netWeightKg: null }])
    ).toEqual({ withPackaging: 1, withoutPackaging: 1 })
  })
})

describe('sha256Hex', () => {
  it('calcula o SHA-256 em hex minúsculo', async () => {
    const hash = await sha256Hex(new TextEncoder().encode('abc'))
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('readItemPackagingWorkbook', () => {
  const dataRows = [
    HEADER,
    ['MO5079', 'SEA THEICTA - BLD 5KG', 'BALDE', 5],
    ['AM9774', '2606 - AMOSTRA', '', ''],
  ]

  it('ida e volta: acha a aba "Item x Emb." mesmo não sendo a 1ª', async () => {
    const file = buildWorkbookFile([
      ['SQ QUIMICA', [['FORMULARIO'], ['x']]],
      ['Item x Emb.', dataRows],
    ])
    const result = await readItemPackagingWorkbook(file)

    expect(result.fatal).toBe('')
    expect(result.sourceSheetName).toBe('Item x Emb.')
    expect(result.sourceFileName).toBe('catalogo.xlsx')
    expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.items).toEqual([
      { code: 'MO5079', description: 'SEA THEICTA - BLD 5KG', packagingType: 'BALDE', netWeightKg: 5 },
      { code: 'AM9774', description: '2606 - AMOSTRA', packagingType: '', netWeightKg: null },
    ])
    expect(result.stats).toMatchObject({ rows: 2, withPackaging: 1, withoutPackaging: 1 })
    expect(result.estimatedBytes).toBeGreaterThan(0)
  })

  it('numera as linhas pela linha do Excel mesmo com linhas vazias no topo', async () => {
    const file = buildWorkbookFile([['Item x Emb.', [[], [], HEADER, ['', 'SEM CODIGO', 'PET', 3]]]])
    const result = await readItemPackagingWorkbook(file)
    expect(result.errors).toEqual([{ row: 4, code: '', message: 'código vazio' }])
  })

  it('sem a aba pelo nome, usa a primeira aba com cabeçalho reconhecido', async () => {
    const file = buildWorkbookFile([
      ['Outra', [['a', 'b']]],
      ['Embalagens', dataRows],
    ])
    const result = await readItemPackagingWorkbook(file)
    expect(result.sourceSheetName).toBe('Embalagens')
    expect(result.items).toHaveLength(2)
  })

  it('sem aba nem cabeçalho reconhecido devolve fatal', async () => {
    const result = await readItemPackagingWorkbook(buildWorkbookFile([['Outra', [['a', 'b']]]]))
    expect(result.fatal).toBe(ITEM_PACKAGING_INVALID_FILE_MESSAGE)
    expect(result.items).toEqual([])
  })

  it('rejeita arquivo que não é zip', async () => {
    const file = new File([new TextEncoder().encode('isto nao e um xlsx, e texto puro')], 'x.xlsx')
    await expect(readItemPackagingWorkbook(file)).rejects.toThrow(ITEM_PACKAGING_INVALID_FILE_MESSAGE)
  })

  it('rejeita arquivo maior que 5 MB', async () => {
    const file = { name: 'grande.xlsx', size: ITEM_PACKAGING_MAX_FILE_BYTES + 1 }
    await expect(readItemPackagingWorkbook(file)).rejects.toThrow('5 MB')
  })

  it('tabela estimada acima de 900 KB devolve fatal', async () => {
    const rows = Array.from({ length: 4000 }, (_, index) => [
      `A${index}`,
      'D'.repeat(200),
      'TAMBOR',
      200,
    ])
    const result = await readItemPackagingWorkbook(buildWorkbookFile([['Item x Emb.', [HEADER, ...rows]]]))
    expect(result.estimatedBytes).toBeGreaterThan(900000)
    expect(result.fatal).toContain('900 KB')
  })
})
