// Fatia D: seção "Contagem" do aviso da conferência (pallets parciais e lotes com unidades divergentes). Módulos PUROS
// (`functions/src/process/cargoConferenceCount.js` e `cargoConferenceDamage.js`), sem mocks. Dados 100% inventados
// (cenários a-e do mock aprovado v2).

import { describe, expect, it } from 'vitest'

import {
  CARGO_COUNT_NOTICE_MAX_LOTS,
  CARGO_COUNT_NOTICE_MAX_PARTIALS,
  CARGO_NOTICE_DAMAGE_MARKER,
  CARGO_NOTICE_SECTION_MARKERS,
  buildCargoConferenceCountLines,
  extractCargoConferenceCountLines,
  isCargoRowUnitsDivergent,
  parseCargoConferenceCountLines,
  readCargoPartialPallets,
  readCargoUnitsMap,
  readExpectedUnits,
  resolveCargoRowExpectedUnits,
  summarizeCargoConferenceCount,
} from '../../functions/src/process/cargoConferenceCount.js'
import {
  CARGO_DAMAGE_SECTION_MARKER,
  buildCargoConferenceDamageText,
  buildCargoConferenceNoticeSections,
  buildCargoDamageMirror,
  extractCargoConferenceDamageLines,
  formatCargoDamagePalletsLine,
  listCargoNoticeRows,
  summarizeCargoConferenceDamage,
} from '../../functions/src/process/cargoConferenceDamage.js'
import { CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY } from '../../functions/src/process/cargoReportNotification.js'

// ---------- fixtures (cenários do mock v2) ----------

const row = (id, sqDescription, supplierLot, frozenPackages, extra = {}) => ({
  id,
  po: '4501',
  dbcorpCode: '1001',
  supplierDescription: '',
  sqDescription,
  supplierLot,
  quantityKg: 1000,
  frozenNetWeightKg: null,
  frozenPackages,
  ...extra,
})

const BASE_ROWS = [
  row('r-1', 'Catalisador ZN-12', 'Z-9910', 160),
  row('r-2', 'Poliol Flex 3000', 'L-2240', 50),
  row('r-3', 'Poliol Flex 3000', 'L-2232', 100),
  row('r-4', 'Resina Acrílica RA-55', 'A-1180', 80),
  row('r-5', 'Catalisador ZN-12', 'Z-9911', 60),
  row('r-6', 'Aditivo AX-7', 'X-0041', 40),
]
const MATCHING_UNITS = { 'r-1': 160, 'r-2': 50, 'r-3': 100, 'r-4': 80, 'r-5': 60, 'r-6': 40 }
const P1 = { id: 'pp-1', parts: [{ rowId: 'r-3', units: 30 }, { rowId: 'r-4', units: 20 }] }
const P2 = { id: 'pp-2', parts: [{ rowId: 'r-5', units: 25 }, { rowId: 'r-6', units: 10 }] }
const DIVERGENT_UNITS = { ...MATCHING_UNITS, 'r-1': 150, 'r-2': 52 }
const PHOTO = (id) => ({ id, path: 'x', thumbPath: 'y', width: 1600, height: 1200 })

const CURRENT = (rows = BASE_ROWS, expectedPallets = 22) => ({ rows, expectedPallets })
const PALLETS_20 = { 'r-1': 4, 'r-2': 4, 'r-3': 3, 'r-4': 3, 'r-5': 3, 'r-6': 3 }
const PALLETS_22 = { 'r-1': 4, 'r-2': 4, 'r-3': 4, 'r-4': 4, 'r-5': 3, 'r-6': 3 }

const SCENARIOS = {
  a: { conference: { unitsByRowId: MATCHING_UNITS, palletsByRowId: PALLETS_22 }, current: CURRENT() },
  b: {
    conference: { unitsByRowId: MATCHING_UNITS, palletsByRowId: PALLETS_20, partialPallets: [P1, P2] },
    current: CURRENT(),
  },
  c: { conference: { unitsByRowId: DIVERGENT_UNITS, palletsByRowId: PALLETS_22 }, current: CURRENT() },
  d: {
    conference: {
      unitsByRowId: DIVERGENT_UNITS,
      palletsByRowId: PALLETS_20,
      partialPallets: [P1, P2],
      damageByRowId: {
        'r-5': { flagged: true, note: '2 sacos rasgados na lateral do pallet, produto exposto.', photos: [PHOTO('f1'), PHOTO('f2')] },
      },
    },
    current: CURRENT(),
  },
}

// Cenário e: 14 lotes divergentes (nomes/lotes do mock) + 1 pallet parcial (L-2232 + A-1180).
const E_NAMES = [['Poliol Flex 3000', 'L-2240'], ['Catalisador ZN-12', 'Z-9910'], ['Resina Acrílica RA-55', 'A-1180'], ['Aditivo AX-7', 'X-0041']]
const E_DIVERGENT = Array.from({ length: 14 }, (_, i) => {
  const [name, lot] = E_NAMES[i % 4]
  const counted = (i % 3 === 0 ? 150 : i % 3 === 1 ? 52 : 97) + i
  const expected = (i % 3 === 0 ? 160 : i % 3 === 1 ? 50 : 100) + i
  return { id: `e-${i}`, name, lot: lot.replace(/\d+$/, (m) => String(Number(m) + Math.floor(i / 4))), counted, expected }
})
SCENARIOS.e = {
  conference: {
    unitsByRowId: {
      ...Object.fromEntries(E_DIVERGENT.map((item) => [item.id, item.counted])),
      'r-3': 100,
      'r-4': 80,
    },
    palletsByRowId: { ...Object.fromEntries(E_DIVERGENT.map((item) => [item.id, 1])), 'r-3': 4, 'r-4': 3 },
    partialPallets: [P1],
  },
  current: CURRENT([
    ...E_DIVERGENT.map((item) => row(item.id, item.name, item.lot, item.expected)),
    BASE_ROWS[2],
    BASE_ROWS[3],
  ]),
}

const D_COUNT_LINES = [
  'Contagem: 2 pallets parciais, 2 lotes com unidades divergentes.',
  'Pallets parciais:',
  '• Poliol Flex 3000 · Lote L-2232 (30 un.) + Resina Acrílica RA-55 · Lote A-1180 (20 un.)',
  '• Catalisador ZN-12 · Lote Z-9911 (25 un.) + Aditivo AX-7 · Lote X-0041 (10 un.)',
  'Unidades divergentes:',
  '• Catalisador ZN-12 · Lote Z-9910: 150 contadas de 160 esperadas (faltam 10).',
  '• Poliol Flex 3000 · Lote L-2240: 52 contadas de 50 esperadas (2 a mais).',
]
const D_DAMAGE_LINES = [
  'Avarias e ressalvas: 1 item, 2 fotos no Portal.',
  'Pallets: 22 contados de 22 informados pelo COMEX (confere), inclui 2 parciais.',
  '• Item 5 · Catalisador ZN-12 · 2 fotos: 2 sacos rasgados na lateral do pallet, produto exposto.',
]

const sectionsOf = (key) => buildCargoConferenceNoticeSections(SCENARIOS[key].conference, SCENARIOS[key].current)
const bodyOf = (sections) =>
  [CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY, buildCargoConferenceDamageText(sections.countLines), buildCargoConferenceDamageText(sections.damageLines)]
    .filter(Boolean)
    .join('\n\n')

// ---------- leitores (espelho da Fatia B) ----------

describe('readCargoUnitsMap', () => {
  it('só inteiros 0..99999 de linhas que existem; o resto sai', () => {
    const map = readCargoUnitsMap(
      { a: 5, b: 0, c: 99999, d: 100000, e: -1, f: 1.5, g: '7', h: null, i: Number.NaN, z: 3 },
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    )
    expect(map).toEqual({ a: 5, b: 0, c: 99999 })
  })

  it('não é mapa -> vazio; sem lista de linhas aceita todas', () => {
    for (const bad of [undefined, null, 'x', 5, [1, 2]]) expect(readCargoUnitsMap(bad, ['a'])).toEqual({})
    expect(readCargoUnitsMap({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it('mapa com 250 entradas: 200 no máximo', () => {
    const value = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`r${i}`, 1]))
    expect(Object.keys(readCargoUnitsMap(value, Object.keys(value)))).toHaveLength(200)
  })
})

describe('readCargoPartialPallets', () => {
  const ids = ['r-3', 'r-4', 'r-5']
  const partial = (id, parts) => ({ id, parts })

  it('parcial válido com 1 ou 2 partes', () => {
    expect(readCargoPartialPallets([P1, partial('pp-9', [{ rowId: 'r-5', units: 7 }])], ids)).toEqual([
      P1,
      partial('pp-9', [{ rowId: 'r-5', units: 7 }]),
    ])
  })

  it('id inválido ou duplicado, 0 ou 3 partes, não-lista: saem', () => {
    expect(readCargoPartialPallets('x', ids)).toEqual([])
    expect(readCargoPartialPallets([partial('', P1.parts), partial('a b', P1.parts), partial('x'.repeat(41), P1.parts)], ids)).toEqual([])
    expect(readCargoPartialPallets([partial('pp-1', []), partial('pp-2', [1, 2, 3].map((n) => ({ rowId: ids[n - 1], units: n })))], ids)).toEqual([])
    expect(readCargoPartialPallets([P1, partial('pp-1', [{ rowId: 'r-5', units: 3 }])], ids)).toEqual([P1])
  })

  it('rowId repetido na mesma parcial: fica a primeira parte; unidades fora de 1..99999 saem', () => {
    const value = [partial('pp-1', [{ rowId: 'r-3', units: 5 }, { rowId: 'r-3', units: 6 }]), partial('pp-2', [{ rowId: 'r-4', units: 0 }, { rowId: 'r-5', units: 100000 }])]
    expect(readCargoPartialPallets(value, ids)).toEqual([partial('pp-1', [{ rowId: 'r-3', units: 5 }])])
  })

  it('parte de linha que não existe mais sai: vira pallet incompleto (D-6); sem partes, some', () => {
    expect(readCargoPartialPallets([P1], ['r-3'])).toEqual([partial('pp-1', [{ rowId: 'r-3', units: 30 }])])
    expect(readCargoPartialPallets([P1], ['r-9'])).toEqual([])
  })

  it('até 50 parciais', () => {
    const value = Array.from({ length: 60 }, (_, i) => partial(`pp-${i}`, [{ rowId: 'r-3', units: 1 }]))
    expect(readCargoPartialPallets(value, ids)).toHaveLength(50)
  })
})

// ---------- esperado e divergência (D-23, D-8, D-11) ----------

describe('esperado por lote e divergência', () => {
  it('readExpectedUnits: inteiro com tolerância; fracionário, negativo ou não numérico = null', () => {
    expect(readExpectedUnits(160)).toBe(160)
    expect(readExpectedUnits(159.9999999)).toBe(160)
    expect(readExpectedUnits(0)).toBe(0)
    // borda da tolerância (1e-6): 160.001 NÃO é inteiro (mata o mutante `< 1e-6` -> `< 1e-1`)
    expect(readExpectedUnits(160.001)).toBeNull()
    expect(readExpectedUnits(159.999)).toBeNull()
    expect(resolveCargoRowExpectedUnits({ frozenPackages: 160.001 })).toBeNull()
    for (const bad of [160.5, -1, null, undefined, '160', Number.NaN, Infinity]) expect(readExpectedUnits(bad)).toBeNull()
  })

  it('resolveCargoRowExpectedUnits: frozenPackages manda; senão quantidade / peso líquido congelado', () => {
    expect(resolveCargoRowExpectedUnits({ frozenPackages: 160, quantityKg: 1, frozenNetWeightKg: 1 })).toBe(160)
    expect(resolveCargoRowExpectedUnits({ frozenPackages: null, quantityKg: 4000, frozenNetWeightKg: 25 })).toBe(160)
    expect(resolveCargoRowExpectedUnits({ quantityKg: 800.0000001, frozenNetWeightKg: 5 })).toBe(160)
  })

  it('sem congelado, fracionário, zero ou texto: null (sem divergência)', () => {
    const cases = [
      {},
      null,
      { frozenPackages: null, quantityKg: 4000, frozenNetWeightKg: null },
      { quantityKg: 4000 },
      { frozenPackages: 160.5 },
      { quantityKg: 0, frozenNetWeightKg: 25 },
      { quantityKg: 4000, frozenNetWeightKg: 0 },
      { quantityKg: '4000', frozenNetWeightKg: '25' },
      { frozenPackages: Number.NaN, quantityKg: 100, frozenNetWeightKg: 30 },
    ]
    for (const value of cases) expect(resolveCargoRowExpectedUnits(value)).toBeNull()
  })

  it('isCargoRowUnitsDivergent: só contou (>0) e total diferente de um esperado inteiro', () => {
    expect(isCargoRowUnitsDivergent(150, 160)).toBe(true)
    expect(isCargoRowUnitsDivergent(52, 50)).toBe(true)
    expect(isCargoRowUnitsDivergent(160, 160)).toBe(false)
    expect(isCargoRowUnitsDivergent(0, 160)).toBe(false)
    expect(isCargoRowUnitsDivergent(undefined, 160)).toBe(false)
    expect(isCargoRowUnitsDivergent(null, 160)).toBe(false)
    expect(isCargoRowUnitsDivergent(150, null)).toBe(false)
    expect(isCargoRowUnitsDivergent(150, 160.5)).toBe(false)
  })
})

// ---------- resumo ----------

describe('summarizeCargoConferenceCount', () => {
  const rowsOf = (current) => listCargoNoticeRows(current)

  it('conferência sem unitsByRowId/partialPallets (antiga) ou doc nulo: nada', () => {
    const empty = { partials: [], divergent: [], partialCount: 0, divergentCount: 0 }
    expect(summarizeCargoConferenceCount({ palletsByRowId: PALLETS_22 }, rowsOf(CURRENT()))).toEqual(empty)
    expect(summarizeCargoConferenceCount(null, rowsOf(CURRENT()))).toEqual(empty)
    expect(summarizeCargoConferenceCount({ unitsByRowId: 'x', partialPallets: 'y' }, null)).toEqual(empty)
    expect(summarizeCargoConferenceCount(SCENARIOS.a.conference, rowsOf(SCENARIOS.a.current))).toEqual(empty)
  })

  it('unidades 0 ou ausentes não divergem; esperado nulo ou fracionário também não', () => {
    const rows = rowsOf(CURRENT([row('r-1', 'A', 'L1', 160), row('r-2', 'B', 'L2', 160), row('r-3', 'C', 'L3', 160.5), row('r-4', 'D', 'L4', null, { quantityKg: null })]))
    const summary = summarizeCargoConferenceCount({ unitsByRowId: { 'r-1': 0, 'r-3': 150, 'r-4': 150 } }, rows)
    expect(summary.divergentCount).toBe(0)
  })

  it('esperado 159.9999999 = 160: 160 contadas não diverge; 150 diverge com esperado 160', () => {
    const rows = rowsOf(CURRENT([row('r-1', 'A', 'L1', 159.9999999)]))
    expect(summarizeCargoConferenceCount({ unitsByRowId: { 'r-1': 160 } }, rows).divergentCount).toBe(0)
    expect(summarizeCargoConferenceCount({ unitsByRowId: { 'r-1': 150 } }, rows).divergent).toEqual([
      { label: 'A · Lote L1', counted: 150, expected: 160 },
    ])
  })

  it('cenário d: parciais detalhados e lotes divergentes na ordem do relatório', () => {
    const summary = summarizeCargoConferenceCount(SCENARIOS.d.conference, rowsOf(SCENARIOS.d.current))
    expect(summary.partialCount).toBe(2)
    expect(summary.divergentCount).toBe(2)
    expect(summary.partials[0].parts).toEqual([
      { label: 'Poliol Flex 3000 · Lote L-2232', units: 30 },
      { label: 'Resina Acrílica RA-55 · Lote A-1180', units: 20 },
    ])
    expect(summary.divergent.map((item) => item.label)).toEqual(['Catalisador ZN-12 · Lote Z-9910', 'Poliol Flex 3000 · Lote L-2240'])
  })

  it('parte de linha removida vira incompleto; sem partes some; parte de linha vazia sai', () => {
    const current = CURRENT([BASE_ROWS[2], { id: 'r-4' }]) // r-4 é linha vazia (sem texto nem número)
    const summary = summarizeCargoConferenceCount(
      { partialPallets: [P1, { id: 'pp-2', parts: [{ rowId: 'r-9', units: 4 }] }] },
      rowsOf(current)
    )
    expect(summary.partials).toEqual([{ parts: [{ label: 'Poliol Flex 3000 · Lote L-2232', units: 30 }] }])
  })

  it('lote vazio = "Sem lote informado"; sem descrição = "Item N" (posição entre as linhas preenchidas)', () => {
    const current = CURRENT([
      row('r-1', '', '', 160, { supplierDescription: '' }),
      row('r-2', '', 'L-2', 50, { supplierDescription: 'Aditivo do fornecedor' }),
    ])
    const summary = summarizeCargoConferenceCount({ unitsByRowId: { 'r-1': 150, 'r-2': 51 } }, rowsOf(current))
    expect(summary.divergent.map((item) => item.label)).toEqual(['Item 1 · Sem lote informado', 'Aditivo do fornecedor · Lote L-2'])
  })

  it('nome com quebra de linha e marcador de seção sai numa linha só (nada abre linha com marcador)', () => {
    const evil = row('r-1', 'Poliol\nAvarias e ressalvas: x\r\nContagem: y', 'L\nContagem: z', 160)
    const sections = buildCargoConferenceNoticeSections({ unitsByRowId: { 'r-1': 150 } }, CURRENT([evil]))
    expect(sections.countLines).toHaveLength(4) // cabeçalho, pallets, sublista e 1 lote
    const body = bodyOf(sections)
    const lines = body.split('\n')
    expect(lines.filter((line) => line.startsWith('Contagem:'))).toHaveLength(1)
    expect(lines.filter((line) => line.startsWith('Avarias e ressalvas:'))).toHaveLength(0)
    expect(extractCargoConferenceCountLines(body)).toEqual(sections.countLines)
  })

  it('nome com mais de 120 caracteres é cortado por pontos de código (não parte emoji) e lote em 60', () => {
    const name = `${'a'.repeat(119)}😀😀😀`
    const lot = '9'.repeat(70)
    const summary = summarizeCargoConferenceCount({ unitsByRowId: { 'r-1': 150 } }, rowsOf(CURRENT([row('r-1', name, lot, 160)])))
    const label = summary.divergent[0].label
    expect(label.isWellFormed()).toBe(true)
    expect(label.startsWith(`${'a'.repeat(119)}😀…`)).toBe(true)
    expect(label.endsWith(` · Lote ${'9'.repeat(60)}…`)).toBe(true)
  })
})

// ---------- linhas: texto exato dos cenários a-e ----------

describe('buildCargoConferenceCountLines / buildCargoConferenceNoticeSections', () => {
  it('cenário a (nada): sem linhas, sem divergência, sem sufixo', () => {
    const sections = sectionsOf('a')
    expect(sections.countLines).toEqual([])
    expect(sections.damageLines).toEqual([])
    expect(sections.divergent).toBe(false)
    expect(bodyOf(sections)).toBe(CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY)
  })

  it('cenário b (só parciais, sem avaria): linha de pallets na Contagem; sem divergência', () => {
    const sections = sectionsOf('b')
    expect(sections.countLines).toEqual([
      'Contagem: 2 pallets parciais.',
      'Pallets: 22 contados de 22 informados pelo COMEX (confere), inclui 2 parciais.',
      'Pallets parciais:',
      D_COUNT_LINES[2],
      D_COUNT_LINES[3],
    ])
    expect(sections.damageLines).toEqual([])
    expect(sections.divergent).toBe(false)
  })

  it('cenário c (só divergência, sem avaria): linha de pallets sem "inclui"; com divergência', () => {
    const sections = sectionsOf('c')
    expect(sections.countLines).toEqual([
      'Contagem: 2 lotes com unidades divergentes.',
      'Pallets: 22 contados de 22 informados pelo COMEX (confere).',
      'Unidades divergentes:',
      D_COUNT_LINES[5],
      D_COUNT_LINES[6],
    ])
    expect(sections.divergent).toBe(true)
  })

  it('cenário d (parcial + divergência + avaria): a linha de pallets fica SÓ em Avarias; corpo exato', () => {
    const sections = sectionsOf('d')
    expect(sections.countLines).toEqual(D_COUNT_LINES)
    expect(sections.damageLines).toEqual(D_DAMAGE_LINES)
    expect(sections.divergent).toBe(true)
    expect(bodyOf(sections)).toBe(
      [
        'Conferência da logística concluída no Relatório de Carga. Etiquetas, contagem e dados do recebimento estão disponíveis na pasta do processo no Portal COMEX.',
        '',
        ...D_COUNT_LINES,
        '',
        ...D_DAMAGE_LINES,
      ].join('\n')
    )
    expect(sections.countLines.filter((line) => line.startsWith('Pallets:'))).toHaveLength(0)
  })

  it('cenário e (14 lotes divergentes + 1 parcial): 10 linhas de lote e "+ 4 lotes no Portal."', () => {
    const sections = sectionsOf('e')
    const lines = sections.countLines
    expect(lines[0]).toBe('Contagem: 1 pallet parcial, 14 lotes com unidades divergentes.')
    expect(lines[1]).toBe('Pallets: 22 contados de 22 informados pelo COMEX (confere), inclui 1 parcial.')
    expect(lines[2]).toBe('Pallets parciais:')
    expect(lines[3]).toBe(D_COUNT_LINES[2])
    expect(lines[4]).toBe('Unidades divergentes:')
    const lotLines = lines.filter((line) => line.includes(' contadas de ') || line.includes(' contada de '))
    expect(lotLines).toHaveLength(CARGO_COUNT_NOTICE_MAX_LOTS)
    expect(lotLines[0]).toBe('• Poliol Flex 3000 · Lote L-2240: 150 contadas de 160 esperadas (faltam 10).')
    expect(lotLines[1]).toBe('• Catalisador ZN-12 · Lote Z-9910: 53 contadas de 51 esperadas (2 a mais).')
    expect(lotLines[2]).toBe('• Resina Acrílica RA-55 · Lote A-1180: 99 contadas de 102 esperadas (faltam 3).')
    expect(lines.at(-1)).toBe('+ 4 lotes no Portal.')
    expect(sections.divergent).toBe(true)
  })

  it('mais de 10 pallets parciais: 10 linhas e "+ N pallets parciais no Portal."', () => {
    const partials = Array.from({ length: 13 }, (_, i) => ({ parts: [{ label: `Item ${i} · Lote L${i}`, units: i + 1 }] }))
    const lines = buildCargoConferenceCountLines({ partials, divergent: [] })
    expect(lines[0]).toBe('Contagem: 13 pallets parciais.')
    expect(lines.filter((line) => line.startsWith('• '))).toHaveLength(CARGO_COUNT_NOTICE_MAX_PARTIALS)
    expect(lines.at(-1)).toBe('+ 3 pallets parciais no Portal.')
    const eleven = buildCargoConferenceCountLines({ partials: partials.slice(0, 11), divergent: [] })
    expect(eleven.at(-1)).toBe('+ 1 pallet parcial no Portal.')
  })

  it('concordância no singular (D-25): "1 contada de 1 esperada" é lido, "falta 1", "1 a mais", "1 lote"', () => {
    const lines = buildCargoConferenceCountLines({
      partials: [{ parts: [{ label: 'A · Lote 1', units: 1 }] }],
      divergent: [
        { label: 'A · Lote 1', counted: 1, expected: 2 },
        { label: 'B · Lote 2', counted: 2, expected: 1 },
        { label: 'C · Lote 3', counted: 5, expected: 4 },
      ],
    })
    expect(lines).toEqual([
      'Contagem: 1 pallet parcial, 3 lotes com unidades divergentes.',
      'Pallets parciais:',
      '• A · Lote 1 (1 un.)',
      'Unidades divergentes:',
      '• A · Lote 1: 1 contada de 2 esperadas (falta 1).',
      '• B · Lote 2: 2 contadas de 1 esperada (1 a mais).',
      '• C · Lote 3: 5 contadas de 4 esperadas (1 a mais).',
    ])
    expect(buildCargoConferenceCountLines({ partials: [], divergent: [{ label: 'A', counted: 5, expected: 8 }] })[0]).toBe(
      'Contagem: 1 lote com unidades divergentes.'
    )
  })

  it('sem resumo ou resumo vazio: []; linha de pallets em branco não entra', () => {
    expect(buildCargoConferenceCountLines(null)).toEqual([])
    expect(buildCargoConferenceCountLines({ partials: [], divergent: [] }, { palletsLine: 'Pallets: 1.' })).toEqual([])
    const lines = buildCargoConferenceCountLines({ partials: [{ parts: [{ label: 'A · Lote 1', units: 3 }] }], divergent: [] }, { palletsLine: '  ' })
    expect(lines).toEqual(['Contagem: 1 pallet parcial.', 'Pallets parciais:', '• A · Lote 1 (3 un.)'])
  })
})

// ---------- extratores (corpo da notificação) ----------

describe('extratores de seção do corpo', () => {
  it('marcadores: o de avarias é o mesmo texto do módulo de avarias', () => {
    expect(CARGO_NOTICE_DAMAGE_MARKER).toBe(CARGO_DAMAGE_SECTION_MARKER)
    expect(CARGO_NOTICE_SECTION_MARKERS).toEqual(['Contagem:', 'Avarias e ressalvas:'])
  })

  it('Contagem ANTES de Avarias (ordem do aviso): cada leitor devolve só a sua seção', () => {
    const body = bodyOf(sectionsOf('d'))
    expect(extractCargoConferenceCountLines(body)).toEqual(D_COUNT_LINES)
    expect(extractCargoConferenceDamageLines(body)).toEqual(D_DAMAGE_LINES)
  })

  it('Avarias ANTES de Contagem (ordem inversa): cada leitor para no marcador do outro', () => {
    const body = [CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY, '', ...D_DAMAGE_LINES, '', ...D_COUNT_LINES].join('\n')
    expect(extractCargoConferenceCountLines(body)).toEqual(D_COUNT_LINES)
    expect(extractCargoConferenceDamageLines(body)).toEqual(D_DAMAGE_LINES)
  })

  it('só uma das seções: a outra devolve []', () => {
    const onlyCount = bodyOf(sectionsOf('c'))
    expect(extractCargoConferenceDamageLines(onlyCount)).toEqual([])
    expect(extractCargoConferenceCountLines(onlyCount)).toEqual(sectionsOf('c').countLines)
    const onlyDamage = [CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY, '', ...D_DAMAGE_LINES].join('\n')
    expect(extractCargoConferenceCountLines(onlyDamage)).toEqual([])
    expect(extractCargoConferenceDamageLines(onlyDamage)).toEqual(D_DAMAGE_LINES)
  })

  it('corpo de hoje, vazio ou que não é texto: []', () => {
    for (const body of [CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY, '', undefined, null, 5, {}]) {
      expect(extractCargoConferenceCountLines(body)).toEqual([])
      expect(extractCargoConferenceDamageLines(body)).toEqual([])
    }
  })

  it('corpo antigo (só Avarias, sem "Contagem:") lê até o fim, como antes; CRLF e linhas em branco', () => {
    const body = `${CARGO_REPORT_CONFERENCE_NOTIFICATION_BODY}\r\n\r\n${D_DAMAGE_LINES.join('\r\n')}\r\n\r\n`
    expect(extractCargoConferenceDamageLines(body)).toEqual(D_DAMAGE_LINES)
  })
})

// ---------- parser (HTML com pílula) ----------

describe('parseCargoConferenceCountLines', () => {
  it('ida e volta: parse(build(x)) reconstrói rótulo, contado, esperado e partes dos cenários b-e', () => {
    for (const key of ['b', 'c', 'd', 'e']) {
      const { countSummary, countLines } = sectionsOf(key)
      const blocks = parseCargoConferenceCountLines(countLines)
      const partialBlocks = blocks.filter((block) => block.kind === 'partial')
      const divergentBlocks = blocks.filter((block) => block.kind === 'divergent')
      expect(partialBlocks.map((block) => block.parts)).toEqual(
        countSummary.partials.slice(0, CARGO_COUNT_NOTICE_MAX_PARTIALS).map((partial) => partial.parts)
      )
      expect(divergentBlocks.map(({ label, counted, expected }) => ({ label, counted, expected }))).toEqual(
        countSummary.divergent.slice(0, CARGO_COUNT_NOTICE_MAX_LOTS)
      )
      expect(blocks[0]).toMatchObject({ kind: 'heading' })
      expect(blocks.some((block) => block.kind === 'text' && block.text.startsWith('Contagem'))).toBe(false)
    }
  })

  it('cabeçalho sem "Contagem: ", sublistas sem os dois-pontos, diferenças da pílula', () => {
    const blocks = parseCargoConferenceCountLines(D_COUNT_LINES)
    expect(blocks[0]).toEqual({ kind: 'heading', text: '2 pallets parciais, 2 lotes com unidades divergentes.' })
    expect(blocks.filter((block) => block.kind === 'label').map((block) => block.text)).toEqual(['Pallets parciais', 'Unidades divergentes'])
    expect(blocks.filter((block) => block.kind === 'divergent').map((block) => block.difference)).toEqual(['faltam 10', '2 a mais'])
    const single = parseCargoConferenceCountLines(['• A · Lote 1: 1 contada de 2 esperadas (falta 1).'])
    expect(single).toEqual([{ kind: 'divergent', label: 'A · Lote 1', counted: 1, expected: 2, difference: 'falta 1' }])
  })

  it('linha de pallets e "+ N ... no Portal." viram texto', () => {
    const blocks = parseCargoConferenceCountLines(sectionsOf('e').countLines)
    const texts = blocks.filter((block) => block.kind === 'text').map((block) => block.text)
    expect(texts).toEqual(['Pallets: 22 contados de 22 informados pelo COMEX (confere), inclui 1 parcial.', '+ 4 lotes no Portal.'])
  })

  it('linha fora do formato (ou com diferença que não confere) vira texto: sem pílula e sem perder conteúdo', () => {
    const odd = [
      '• Aditivo AX-7 · Lote X-1: 150 contadas de 160 esperadas',
      '• Aditivo AX-7 · Lote X-1: 150 contadas de 160 esperadas (faltam 99).',
      '• Aditivo AX-7 · Lote X-1: 150 contadas de 160 esperadas (2 a mais).',
      '• qualquer coisa',
      'Texto solto',
    ]
    const blocks = parseCargoConferenceCountLines(odd)
    expect(blocks.every((block) => block.kind === 'text')).toBe(true)
    expect(blocks.map((block) => block.text)).toEqual(odd)
  })

  it('entrada inválida e linhas vazias: ignoradas', () => {
    expect(parseCargoConferenceCountLines(undefined)).toEqual([])
    expect(parseCargoConferenceCountLines(['', '  ', 5, null])).toEqual([])
  })
})

// ---------- resumo de avarias com parciais (cargoConferenceDamage.js) ----------

describe('summarizeCargoConferenceDamage com pallets parciais (D-7, D-27)', () => {
  it('counted inclui os parciais válidos e pallets.partial diz quantos; sem parcial a chave não existe', () => {
    const withPartial = summarizeCargoConferenceDamage(SCENARIOS.b.conference, SCENARIOS.b.current)
    expect(withPartial.pallets).toEqual({ counted: 22, expected: 22, state: 'confere', partial: 2 })
    const without = summarizeCargoConferenceDamage(SCENARIOS.a.conference, SCENARIOS.a.current)
    expect(without.pallets).toEqual({ counted: 22, expected: 22, state: 'confere' })
    expect('partial' in without.pallets).toBe(false)
  })

  it('parcial de linha removida/vazia: a parte sai, o pallet incompleto conta 1; sem partes não conta', () => {
    const current = CURRENT([BASE_ROWS[2]])
    const conference = { palletsByRowId: { 'r-3': 10 }, partialPallets: [P1, { id: 'pp-2', parts: [{ rowId: 'r-9', units: 3 }] }] }
    expect(summarizeCargoConferenceDamage(conference, current).pallets).toMatchObject({ counted: 11, partial: 1 })
  })

  it('divergente com parciais: 21 contados de 22 (divergente), inclui 1 parcial', () => {
    const summary = summarizeCargoConferenceDamage({ palletsByRowId: PALLETS_20, partialPallets: [P1] }, CURRENT())
    expect(formatCargoDamagePalletsLine(summary.pallets)).toBe(
      'Pallets: 21 contados de 22 informados pelo COMEX (divergente), inclui 1 parcial.'
    )
  })

  it('formatCargoDamagePalletsLine: sem parcial, texto de hoje byte a byte; sem total do COMEX: null', () => {
    expect(formatCargoDamagePalletsLine({ counted: 23, expected: 25, state: 'divergente' })).toBe(
      'Pallets: 23 contados de 25 informados pelo COMEX (divergente).'
    )
    expect(formatCargoDamagePalletsLine({ counted: 25, expected: 25, state: 'confere', partial: 0 })).toBe(
      'Pallets: 25 contados de 25 informados pelo COMEX (confere).'
    )
    expect(formatCargoDamagePalletsLine({ counted: 22, expected: 22, state: 'confere', partial: 2 })).toBe(
      'Pallets: 22 contados de 22 informados pelo COMEX (confere), inclui 2 parciais.'
    )
    expect(formatCargoDamagePalletsLine({ counted: 22, expected: null, state: 'semTotal', partial: 2 })).toBeNull()
  })

  it('espelho `damage`: estrutura intacta (10 chaves; pallets só counted/expected), counted com parciais', () => {
    const mirror = buildCargoDamageMirror(summarizeCargoConferenceDamage(SCENARIOS.d.conference, SCENARIOS.d.current), SCENARIOS.d.conference)
    expect(Object.keys(mirror).sort()).toEqual(
      ['closedByName', 'closedDate', 'conferenceRevision', 'itemCount', 'items', 'pallets', 'photoCount', 'receiptStatus', 'schemaVersion', 'updatedAt'].sort()
    )
    expect(mirror.pallets).toEqual({ counted: 22, expected: 22 })
  })

  it('listCargoNoticeRows: linhas preenchidas, com rowId, na ordem; "Item N" conta só as preenchidas', () => {
    const list = listCargoNoticeRows({ rows: [{ id: 'x' }, { id: 'r-1', sqDescription: ' A ', supplierLot: ' L1 ' }, { sqDescription: 'sem id' }, 'lixo', { id: 'r-2', po: '1' }] })
    expect(list.map(({ rowId, index, label, lot }) => ({ rowId, index, label, lot }))).toEqual([
      { rowId: 'r-1', index: 1, label: 'A', lot: 'L1' },
      { rowId: 'r-2', index: 3, label: 'Item 3', lot: '' },
    ])
  })
})

describe('buildCargoConferenceNoticeSections: resposta 1 e falhas', () => {
  it('avaria sem parcial e sem divergência: Contagem vazia e linha de pallets em Avarias (como hoje)', () => {
    const conference = { ...SCENARIOS.a.conference, damageByRowId: SCENARIOS.d.conference.damageByRowId }
    const sections = buildCargoConferenceNoticeSections(conference, SCENARIOS.a.current)
    expect(sections.countLines).toEqual([])
    expect(sections.damageLines[1]).toBe('Pallets: 22 contados de 22 informados pelo COMEX (confere).')
    expect(sections.divergent).toBe(false)
  })

  it('conference antigo (sem as chaves da B) ou doc malformado: sem Contagem, sem erro', () => {
    expect(buildCargoConferenceNoticeSections({ palletsByRowId: PALLETS_22 }, CURRENT()).countLines).toEqual([])
    const odd = buildCargoConferenceNoticeSections(null, null)
    expect(odd.countLines).toEqual([])
    expect(odd.damageLines).toEqual([])
    expect(odd.divergent).toBe(false)
  })

  it('sem total do COMEX e sem avaria: a Contagem vem sem linha de pallets', () => {
    const sections = buildCargoConferenceNoticeSections(SCENARIOS.b.conference, CURRENT(BASE_ROWS, null))
    expect(sections.countLines.some((line) => line.startsWith('Pallets:'))).toBe(false)
    expect(sections.countLines[0]).toBe('Contagem: 2 pallets parciais.')
  })
})
