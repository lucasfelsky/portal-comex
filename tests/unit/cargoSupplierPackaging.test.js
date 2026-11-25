// S9-D do Relatório de Carga: embalagens por item + fornecedor (módulo puro cargoSupplierPackaging.js).
// Fixtures 100% sintéticas (as do mock aprovado: GOOYER CHEMICALS LTD / ORION CHEM CO).
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  SUPPLIER_PACKAGING_DOC_TOO_BIG_MESSAGE,
  SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE,
  SUPPLIER_PACKAGING_MAX_ALIASES,
  SUPPLIER_PACKAGING_MAX_DOC_BYTES,
  SUPPLIER_PACKAGING_MAX_ENTRIES,
  buildSupplierNameList,
  buildSupplierPackagingEntry,
  buildSupplierPackagingRows,
  canonicalSupplierKey,
  cargoPackagingContext,
  checkSupplierPackagingLimits,
  collectPackagingTypes,
  diffSupplierPackaging,
  estimateSupplierPackagingDocBytes,
  filterSupplierPackagingRows,
  joinSupplierNames,
  normalizeSupplierKey,
  parseSupplierPackagingMatrix,
  readSupplierPackagingWorkbook,
  resolveCargoPackaging,
  suggestSimilarSuppliers,
  supplierPackagingEntryId,
  withSupplierPackagingEntry,
} from '../../src/features/processes/cargoSupplierPackaging.js'

const GOOYER = 'GOOYER CHEMICALS LTD'
const ORION = 'ORION CHEM CO'

const itemCatalog = {
  items: [
    { code: 'BA5012', description: 'POLIOL PE-3000', packagingType: 'TAMBOR', netWeightKg: 200 },
    { code: 'BA5033', description: 'CATALISADOR ZN-12', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'BA5301', description: 'SOLVENTE XIL-9', packagingType: '', netWeightKg: null },
  ],
}

const entry = (code, supplierName, tare, overrides = {}) => ({
  code,
  supplierKey: normalizeSupplierKey(supplierName),
  supplierName,
  packagingType: supplierName ? 'TAMBOR' : '',
  netWeightKg: supplierName ? 200 : null,
  packageWeightKg: tare,
  ...overrides,
})

const supplierCatalog = (entries, aliases = []) => ({ exists: true, version: 1, entries, entryCount: entries.length, aliases })

const MIXED = supplierCatalog([
  entry('BA5012', GOOYER, 9.2),
  entry('BA5012', ORION, 11.5),
  entry('BA5033', '', 1.1),
])

describe('normalizeSupplierKey', () => {
  it('tira acento e pontuação, põe em maiúsculas e colapsa espaços', () => {
    expect(normalizeSupplierKey('Gooyer Chemicals, Ltd.')).toBe('GOOYER CHEMICALS LTD')
    expect(normalizeSupplierKey('  gooyer   chemicals  ltd ')).toBe('GOOYER CHEMICALS LTD')
    expect(normalizeSupplierKey('Indústria Química Açaí & Cia.')).toBe('INDUSTRIA QUIMICA ACAI CIA')
    expect(normalizeSupplierKey('ORION-CHEM / CO')).toBe('ORION CHEM CO')
  })

  it('não remove sufixos societários e devolve vazio sem letras ou números', () => {
    expect(normalizeSupplierKey('Orion Chem Co.')).toBe('ORION CHEM CO')
    expect(normalizeSupplierKey('...')).toBe('')
    expect(normalizeSupplierKey(null)).toBe('')
    expect(normalizeSupplierKey(undefined)).toBe('')
    expect(normalizeSupplierKey(42)).toBe('42')
  })
})

describe('aliases: nome que vale e juntar nomes', () => {
  it('canonicalSupplierKey normaliza e segue o alias', () => {
    const aliases = [{ fromKey: 'GOOYER CHEMICAL CO', toKey: GOOYER }]
    expect(canonicalSupplierKey('Gooyer Chemical, Co.', aliases)).toBe(GOOYER)
    expect(canonicalSupplierKey(GOOYER, aliases)).toBe(GOOYER)
    expect(canonicalSupplierKey('', aliases)).toBe('')
  })

  it('para num ciclo de dado corrompido em vez de repetir para sempre', () => {
    const aliases = [
      { fromKey: 'A', toKey: 'B' },
      { fromKey: 'B', toKey: 'A' },
    ]
    expect(['A', 'B']).toContain(canonicalSupplierKey('A', aliases))
  })

  it('joinSupplierNames junta e repõe quem apontava para o nome juntado (um nível, sem ciclo)', () => {
    const first = joinSupplierNames([], ['A CO'], 'A LTD')
    expect(first).toEqual([{ fromKey: 'A CO', toKey: 'A LTD' }])

    // juntar "A LTD" em "A SA": quem apontava para "A LTD" passa a apontar para "A SA"
    const second = joinSupplierNames(first, ['A LTD'], 'A SA')
    expect(second).toEqual(
      expect.arrayContaining([
        { fromKey: 'A CO', toKey: 'A SA' },
        { fromKey: 'A LTD', toKey: 'A SA' },
      ])
    )
    expect(second).toHaveLength(2)
    // nenhum destino é origem de outro alias
    const sources = new Set(second.map((alias) => alias.fromKey))
    expect(second.every((alias) => !sources.has(alias.toKey))).toBe(true)
  })

  it('juntar o destino em quem já aponta para ele não cria ciclo', () => {
    const aliases = [{ fromKey: 'A CO', toKey: 'A LTD' }]
    // o admin escolhe "A CO" como o nome que fica: vale o nome que já valia (A LTD)
    const next = joinSupplierNames(aliases, ['B INC'], 'A CO')
    expect(next).toEqual(
      expect.arrayContaining([
        { fromKey: 'A CO', toKey: 'A LTD' },
        { fromKey: 'B INC', toKey: 'A LTD' },
      ])
    )
    expect(canonicalSupplierKey('A CO', next)).toBe('A LTD')
  })

  it('ignora juntar um nome nele mesmo e não muta a lista recebida', () => {
    const aliases = [{ fromKey: 'X', toKey: 'Y' }]
    const copy = JSON.parse(JSON.stringify(aliases))
    expect(joinSupplierNames(aliases, ['Y', 'X'], 'Y')).toEqual([{ fromKey: 'X', toKey: 'Y' }])
    expect(aliases).toEqual(copy)
  })
})

describe('resolveCargoPackaging (1º item + fornecedor, 2º padrão do item, 3º nada)', () => {
  it('BA5012: a tara muda com o fornecedor (GOOYER 9,2 / ORION 11,5)', () => {
    const base = { itemCatalog, supplierCatalog: MIXED }
    expect(resolveCargoPackaging('BA5012', GOOYER, base)).toEqual({
      packagingType: 'TAMBOR',
      netWeightKg: 200,
      packageWeightKg: 9.2,
      via: 'supplier',
    })
    expect(resolveCargoPackaging('ba5012', 'Orion Chem, Co.', base)).toMatchObject({ packageWeightKg: 11.5, via: 'supplier' })
  })

  it('BA5033 sem linha do fornecedor: padrão do item = tabela Item x Emb. + tara do padrão', () => {
    expect(resolveCargoPackaging('BA5033', GOOYER, { itemCatalog, supplierCatalog: MIXED })).toEqual({
      packagingType: 'BOMBONA',
      netWeightKg: 25,
      packageWeightKg: 1.1,
      via: 'default',
    })
  })

  it('BA5012 com fornecedor sem linha cai no padrão (sem tara)', () => {
    expect(resolveCargoPackaging('BA5012', 'OUTRA EMPRESA', { itemCatalog, supplierCatalog: MIXED })).toEqual({
      packagingType: 'TAMBOR',
      netWeightKg: 200,
      packageWeightKg: null,
      via: 'default',
    })
  })

  it('BA5190: item fora da tabela e sem linha do fornecedor = nenhum cadastro (null)', () => {
    expect(resolveCargoPackaging('BA5190', GOOYER, { itemCatalog, supplierCatalog: MIXED })).toBeNull()
    expect(resolveCargoPackaging('', GOOYER, { itemCatalog, supplierCatalog: MIXED })).toBeNull()
  })

  it('BA5190 passa a existir depois de cadastrado para o fornecedor', () => {
    const catalog = supplierCatalog(withSupplierPackagingEntry(MIXED.entries, entry('BA5190', GOOYER, 9.5)))
    expect(resolveCargoPackaging('BA5190', GOOYER, { itemCatalog, supplierCatalog: catalog })).toMatchObject({
      packageWeightKg: 9.5,
      via: 'supplier',
    })
    expect(resolveCargoPackaging('BA5190', ORION, { itemCatalog, supplierCatalog: catalog })).toBeNull()
  })

  it('fornecedor com nome diferente: o alias GOOYER CHEMICAL CO resolve a entrada de GOOYER CHEMICALS LTD', () => {
    const aliased = supplierCatalog(MIXED.entries, [{ fromKey: 'GOOYER CHEMICAL CO', toKey: GOOYER }])
    expect(resolveCargoPackaging('BA5012', 'Gooyer Chemical Co.', { itemCatalog, supplierCatalog: aliased })).toMatchObject({
      packageWeightKg: 9.2,
      via: 'supplier',
    })
    // sem o alias o nome diferente não acha a entrada
    expect(resolveCargoPackaging('BA5012', 'Gooyer Chemical Co.', { itemCatalog, supplierCatalog: MIXED }).via).toBe('default')
  })

  it('entrada guardada com o nome antigo continua valendo depois de juntar (e a de chave exata vence)', () => {
    const entries = [entry('BA5012', 'GOOYER CHEMICAL CO', 8), entry('BA5012', GOOYER, 9.2)]
    const joined = supplierCatalog(entries, [{ fromKey: 'GOOYER CHEMICAL CO', toKey: GOOYER }])
    expect(resolveCargoPackaging('BA5012', 'Gooyer Chemical Co', { itemCatalog, supplierCatalog: joined }).packageWeightKg).toBe(9.2)
    const onlyOld = supplierCatalog([entries[0]], [{ fromKey: 'GOOYER CHEMICAL CO', toKey: GOOYER }])
    expect(resolveCargoPackaging('BA5012', GOOYER, { itemCatalog, supplierCatalog: onlyOld }).packageWeightKg).toBe(8)
  })

  it('sem cadastro por fornecedor (doc ausente ou leitura que falhou) vale só a tabela Item x Emb.', () => {
    expect(resolveCargoPackaging('BA5012', GOOYER, { itemCatalog, supplierCatalog: null })).toEqual({
      packagingType: 'TAMBOR',
      netWeightKg: 200,
      packageWeightKg: null,
      via: 'default',
    })
    expect(resolveCargoPackaging('BA5012', GOOYER, { itemCatalog: null, supplierCatalog: null })).toBeNull()
  })

  it('cargoPackagingContext monta o contexto de uma linha', () => {
    expect(cargoPackagingContext(undefined, 'r1')).toBeUndefined()
    expect(cargoPackagingContext({ supplierCatalog: MIXED, supplierNameByRowId: { r1: GOOYER } }, 'r1')).toEqual({
      supplierCatalog: MIXED,
      supplierName: GOOYER,
    })
    expect(cargoPackagingContext({ supplierNameByRowId: {} }, 'r2')).toEqual({ supplierCatalog: null, supplierName: '' })
  })
})

describe('buildSupplierPackagingEntry (diálogos)', () => {
  it('monta a entrada com chave normalizada, tipo em maiúsculas e pesos em número', () => {
    const { entry: built, errors } = buildSupplierPackagingEntry({
      code: ' ba5190 ',
      supplierName: 'Gooyer Chemicals, Ltd.',
      packagingType: 'tambor',
      netWeightKg: '200',
      packageWeightKg: '9,5',
    })
    expect(errors).toEqual({})
    expect(built).toEqual({
      code: 'BA5190',
      supplierKey: 'GOOYER CHEMICALS LTD',
      supplierName: 'Gooyer Chemicals, Ltd.',
      packagingType: 'TAMBOR',
      netWeightKg: 200,
      packageWeightKg: 9.5,
    })
  })

  it('tara é opcional; tipo e peso líquido são obrigatórios', () => {
    expect(
      buildSupplierPackagingEntry({ code: 'BA1', supplierName: GOOYER, packagingType: 'BALDE', netWeightKg: '20', packageWeightKg: '' })
        .entry.packageWeightKg
    ).toBeNull()
    const { errors } = buildSupplierPackagingEntry({ code: 'BA1', supplierName: GOOYER, packagingType: '', netWeightKg: '' })
    expect(Object.keys(errors).sort()).toEqual(['netWeightKg', 'packagingType'])
  })

  it('recusa código inválido, fornecedor vazio, peso ≤ 0, texto e acima do teto', () => {
    const base = { code: 'BA1', supplierName: GOOYER, packagingType: 'BALDE', netWeightKg: '20' }
    expect(buildSupplierPackagingEntry({ ...base, code: 'BA 1' }).errors.code).toMatch(/Código inválido/)
    expect(buildSupplierPackagingEntry({ ...base, code: '' }).errors.code).toMatch(/Informe/)
    expect(buildSupplierPackagingEntry({ ...base, supplierName: '...' }).errors.supplierName).toMatch(/Informe/)
    expect(buildSupplierPackagingEntry({ ...base, netWeightKg: '0' }).errors.netWeightKg).toMatch(/fora do limite/)
    expect(buildSupplierPackagingEntry({ ...base, netWeightKg: 'abc' }).errors.netWeightKg).toMatch(/inválido/)
    expect(buildSupplierPackagingEntry({ ...base, packageWeightKg: '-1' }).errors.packageWeightKg).toMatch(/inválido/)
    expect(buildSupplierPackagingEntry({ ...base, netWeightKg: '100001' }).errors.netWeightKg).toMatch(/fora do limite/)
  })
})

describe('withSupplierPackagingEntry', () => {
  it('troca a entrada de mesmo código + fornecedor ou acrescenta no fim, sem mutar', () => {
    const before = [...MIXED.entries]
    const replaced = withSupplierPackagingEntry(MIXED.entries, entry('BA5012', 'Gooyer Chemicals Ltd.', 10))
    expect(replaced).toHaveLength(3)
    expect(replaced[0].packageWeightKg).toBe(10)
    const added = withSupplierPackagingEntry(MIXED.entries, entry('BA5190', GOOYER, 9.5))
    expect(added).toHaveLength(4)
    expect(added[3].code).toBe('BA5190')
    expect(MIXED.entries).toEqual(before)
    expect(supplierPackagingEntryId(added[3])).toBe(`BA5190|${GOOYER}`)
  })
})

describe('parseSupplierPackagingMatrix (importação)', () => {
  const HEADER = ['ITEM', 'FORNECEDOR', 'TIPO EMB.', 'PESO LÍQ. (KG)', 'PESO DA EMB. (KG)']
  const parse = (rows) => parseSupplierPackagingMatrix([HEADER, ...rows])

  it('lê linhas de fornecedor e a linha padrão (fornecedor vazio = só a tara)', () => {
    const result = parse([
      ['ba5012', 'Gooyer Chemicals, Ltd.', 'tambor', '200', '9,2'],
      ['BA5033', '', '', '', '1,1'],
    ])
    expect(result.fatal).toBe('')
    expect(result.errors).toEqual([])
    expect(result.entries).toEqual([
      { code: 'BA5012', supplierKey: 'GOOYER CHEMICALS LTD', supplierName: 'Gooyer Chemicals, Ltd.', packagingType: 'TAMBOR', netWeightKg: 200, packageWeightKg: 9.2 },
      { code: 'BA5033', supplierKey: '', supplierName: '', packagingType: '', netWeightKg: null, packageWeightKg: 1.1 },
    ])
    expect(result.stats).toEqual({ rows: 2, suppliers: 1, defaults: 1 })
  })

  it('acha o cabeçalho depois de linhas vazias e numera pela linha do Excel; ignora colunas extras', () => {
    const result = parseSupplierPackagingMatrix([
      [],
      ['ITEM', 'DESCRIÇÃO', 'FORNECEDOR', 'TIPO EMB.', 'PESO LIQ.', 'PESO DA EMB.', 'ORIGEM'],
      ['', 'sem código', GOOYER, 'BALDE', 20, 1, ''],
    ])
    expect(result.errors).toEqual([{ row: 3, code: '', message: 'código vazio' }])
  })

  it('erros: código inválido, peso ≤ 0, peso inválido, tipo ou peso líquido faltando, padrão sem tara', () => {
    const result = parse([
      ['BA 1', GOOYER, 'BALDE', '20', '1'],
      ['BA2', GOOYER, 'BALDE', '0', '1'],
      ['BA3', GOOYER, 'BALDE', '20', 'abc'],
      ['BA4', GOOYER, '', '20', '1'],
      ['BA5', GOOYER, 'BALDE', '', '1'],
      ['BA6', '', '', '', ''],
    ])
    const messages = result.errors.map((error) => `${error.row}:${error.message}`)
    expect(messages.some((message) => /^2:código inválido/.test(message))).toBe(true)
    expect(messages.some((message) => /^3:peso líquido fora do limite/.test(message))).toBe(true)
    expect(messages.some((message) => /^4:peso da embalagem inválido/.test(message))).toBe(true)
    expect(messages).toContain('5:linha de fornecedor precisa do tipo da embalagem')
    expect(messages).toContain('6:linha de fornecedor precisa do peso líquido')
    expect(messages).toContain('7:padrão do item (fornecedor vazio) precisa do peso da embalagem')
    expect(result.entries).toEqual([])
  })

  it('erro: código + fornecedor duplicado (mesmo com o nome escrito diferente)', () => {
    const result = parse([
      ['BA5012', GOOYER, 'TAMBOR', '200', '9,2'],
      ['BA5012', 'gooyer chemicals, ltd', 'TAMBOR', '200', '9,3'],
      ['BA5033', '', '', '', '1,1'],
      ['BA5033', '', '', '', '1,2'],
    ])
    expect(result.errors.map((error) => error.message)).toEqual([
      expect.stringMatching(/^item e fornecedor repetido: BA5012 · gooyer chemicals, ltd \(já na linha 2\)$/),
      expect.stringMatching(/^padrão do item repetido: BA5033 \(já na linha 4\)$/),
    ])
    expect(result.entries).toHaveLength(2)
  })

  it('avisos: fornecedor sem tara; tipo e peso líquido preenchidos no padrão são ignorados', () => {
    const result = parse([
      ['BA5012', GOOYER, 'TAMBOR', '200', ''],
      ['BA5033', '', 'BOMBONA', '25', '1,1'],
    ])
    expect(result.errors).toEqual([])
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      'sem peso da embalagem',
      'tipo e peso líquido do padrão foram ignorados (valem os da tabela Item x Emb.)',
    ])
    expect(result.entries[1]).toMatchObject({ supplierKey: '', packagingType: '', netWeightKg: null, packageWeightKg: 1.1 })
  })

  it('cabeçalho que falta coluna é fatal', () => {
    expect(parseSupplierPackagingMatrix([['ITEM', 'FORNECEDOR']]).fatal).toBe(SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE)
    expect(parseSupplierPackagingMatrix([]).fatal).toBe(SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE)
  })

  it('mais linhas que o teto de entradas é fatal', () => {
    const rows = Array.from({ length: SUPPLIER_PACKAGING_MAX_ENTRIES + 1 }, (_, index) => [`A${index}`, GOOYER, 'BALDE', '1', ''])
    expect(parse(rows).fatal).toMatch(/passaria de 5\.000/)
  })
})

describe('readSupplierPackagingWorkbook', () => {
  function workbookFile(sheets, name = 'embalagens.xlsx') {
    const workbook = XLSX.utils.book_new()
    for (const [sheetName, matrix] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), sheetName)
    return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], name)
  }
  const rows = [
    ['ITEM', 'FORNECEDOR', 'TIPO EMB.', 'PESO LÍQ. (KG)', 'PESO DA EMB. (KG)'],
    ['BA5012', GOOYER, 'TAMBOR', 200, 9.2],
  ]

  it('ida e volta: prefere a aba "Embalagens por fornecedor", mesmo não sendo a 1ª', async () => {
    const result = await readSupplierPackagingWorkbook(
      workbookFile([
        ['Outra', rows],
        ['Embalagens por fornecedor', rows.map((row, index) => (index === 1 ? ['BA5033', ORION, 'BALDE', 20, 1] : row))],
      ])
    )
    expect(result.fatal).toBe('')
    expect(result.sourceSheetName).toBe('Embalagens por fornecedor')
    expect(result.sourceFileName).toBe('embalagens.xlsx')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].code).toBe('BA5033')
    expect(result.estimatedBytes).toBeGreaterThan(0)
  })

  it('sem aba reconhecida devolve fatal; arquivo que não é .xlsx rejeita', async () => {
    expect((await readSupplierPackagingWorkbook(workbookFile([['Outra', [['a', 'b']]]]))).fatal).toBe(
      SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE
    )
    await expect(readSupplierPackagingWorkbook(new File([new TextEncoder().encode('texto puro')], 'x.xlsx'))).rejects.toThrow(
      SUPPLIER_PACKAGING_INVALID_FILE_MESSAGE
    )
    await expect(readSupplierPackagingWorkbook({ name: 'grande.xlsx', size: 6 * 1024 * 1024 })).rejects.toThrow('5 MB')
  })
})

describe('diffSupplierPackaging', () => {
  it('novas, alteradas, removidas e sem mudança, por código + fornecedor', () => {
    const next = [
      entry('BA5012', GOOYER, 9.2), // igual
      entry('BA5012', ORION, 12), // alterada
      entry('BA5190', GOOYER, 9.5), // nova
    ]
    const diff = diffSupplierPackaging(MIXED.entries, next)
    expect(diff.unchanged).toBe(1)
    expect(diff.added.map((item) => item.code)).toEqual(['BA5190'])
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0]).toMatchObject({ code: 'BA5012', supplierKey: ORION, fields: ['packageWeightKg'] })
    expect(diff.removed.map((item) => `${item.code}|${item.supplierKey}`)).toEqual(['BA5033|'])
  })
})

describe('tetos e tamanho', () => {
  it('estima o doc e aceita o que cabe', () => {
    const bytes = estimateSupplierPackagingDocBytes(MIXED.entries, [{ fromKey: 'A', toKey: 'B' }])
    expect(bytes).toBeGreaterThan(1024)
    expect(checkSupplierPackagingLimits(MIXED.entries, [{ fromKey: 'A', toKey: 'B' }])).toBe('')
  })

  it('recusa mais de 5.000 entradas, mais de 1.000 aliases e doc acima de ~900 KB', () => {
    const many = Array.from({ length: SUPPLIER_PACKAGING_MAX_ENTRIES + 1 }, (_, index) => entry(`A${index}`, GOOYER, 1))
    expect(checkSupplierPackagingLimits(many)).toMatch(/5\.000/)
    const aliases = Array.from({ length: SUPPLIER_PACKAGING_MAX_ALIASES + 1 }, (_, index) => ({ fromKey: `A${index}`, toKey: 'B' }))
    expect(checkSupplierPackagingLimits([], aliases)).toMatch(/1\.000/)

    const huge = Array.from({ length: 4000 }, (_, index) => entry(`B${index}`, GOOYER, 1, { supplierName: 'X'.repeat(160), supplierKey: 'X'.repeat(160) }))
    expect(estimateSupplierPackagingDocBytes(huge)).toBeGreaterThan(SUPPLIER_PACKAGING_MAX_DOC_BYTES)
    expect(checkSupplierPackagingLimits(huge)).toBe(SUPPLIER_PACKAGING_DOC_TOO_BIG_MESSAGE)
  })
})

describe('sugestões e tabela do admin', () => {
  it('suggestSimilarSuppliers: mesma 1ª palavra com 4 letras ou mais (só sugestão)', () => {
    const groups = suggestSimilarSuppliers([GOOYER, 'GOOYER CHEMICAL CO', ORION, 'AB CHEM', 'AB TRADING'])
    expect(groups).toEqual([{ word: 'GOOYER', keys: ['GOOYER CHEMICAL CO', GOOYER] }])
  })

  it('buildSupplierPackagingRows une a tabela Item x Emb. e o cadastro, por código', () => {
    const rows = buildSupplierPackagingRows({
      itemCatalog,
      supplierCatalog: supplierCatalog([...MIXED.entries, entry('ZZ9999', GOOYER, 3)]),
    })
    expect(rows.map((row) => row.code)).toEqual(['BA5012', 'BA5033', 'BA5301', 'ZZ9999'])
    const [first, second, third, fourth] = rows
    expect(first.suppliers.map((item) => item.supplierName)).toEqual([GOOYER, ORION])
    expect(first.defaultPackaging).toMatchObject({ registered: true, packagingType: 'TAMBOR', packageWeightKg: null })
    expect(second.defaultPackaging).toMatchObject({ registered: true, packageWeightKg: 1.1 })
    expect(second.suppliers).toEqual([])
    expect(third.defaultPackaging.registered).toBe(false)
    expect(fourth).toMatchObject({ description: '', suppliers: [expect.objectContaining({ code: 'ZZ9999' })] })
    expect(fourth.defaultPackaging.registered).toBe(false)
  })

  it('filtros Todos / Com fornecedor / Sem embalagem e busca', () => {
    const rows = buildSupplierPackagingRows({ itemCatalog, supplierCatalog: MIXED })
    expect(filterSupplierPackagingRows(rows, 'all')).toHaveLength(3)
    expect(filterSupplierPackagingRows(rows, 'supplier').map((row) => row.code)).toEqual(['BA5012'])
    expect(filterSupplierPackagingRows(rows, 'none').map((row) => row.code)).toEqual(['BA5301'])
    expect(filterSupplierPackagingRows(rows, 'all', 'orion').map((row) => row.code)).toEqual(['BA5012'])
    expect(filterSupplierPackagingRows(rows, 'all', 'catalisador').map((row) => row.code)).toEqual(['BA5033'])
    expect(filterSupplierPackagingRows(rows, 'supplier', 'xil')).toEqual([])
  })

  it('buildSupplierNameList agrupa pelo nome que vale e conta as embalagens', () => {
    const catalog = supplierCatalog(
      [entry('A1', 'Gooyer Chemicals Ltd', 1), entry('A2', 'Gooyer Chemical Co', 1), entry('A3', ORION, 1)],
      [{ fromKey: 'GOOYER CHEMICAL CO', toKey: GOOYER }]
    )
    expect(buildSupplierNameList(catalog)).toEqual([
      { key: GOOYER, name: 'Gooyer Chemicals Ltd', entryCount: 2, joined: [{ fromKey: 'GOOYER CHEMICAL CO', name: 'Gooyer Chemical Co' }] },
      { key: ORION, name: ORION, entryCount: 1, joined: [] },
    ])
    expect(buildSupplierNameList(null)).toEqual([])
  })

  it('collectPackagingTypes: os já usados (mais usados primeiro) e depois os de sempre', () => {
    const types = collectPackagingTypes({ itemCatalog, supplierCatalog: MIXED })
    expect(types[0]).toBe('TAMBOR')
    expect(types).toEqual(expect.arrayContaining(['BOMBONA', 'IBC', 'BALDE', 'SACO']))
    expect(new Set(types).size).toBe(types.length)
  })
})
