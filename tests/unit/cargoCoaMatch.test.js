// S11-C do Relatório de Carga: casamento COA x linhas, PO parecida, divisão por lote, soma, marcas da logística e
// aplicação tudo-ou-nada. Módulo puro; fixtures SINTÉTICAS (processo FCL "GOOYER SEA 185-26" e consolidado com 3 POs).
import { describe, expect, it } from 'vitest'
import {
  applyCoaProposals,
  buildCoaProposals,
  buildCoaReportItems,
  collectCoaCertificates,
  compactCoaText,
  matchCoaCertificates,
  resolveCoaPurchaseOrder,
} from '../../src/features/processes/cargoCoaMatch'
import { cellOrigin } from '../../src/features/processes/cargoReportAutofill'
import { CARGO_REPORT_MAX_ROWS, createEmptyCargoReportRow } from '../../src/features/processes/cargoReportFormModel'
import { EMPTY_CARGO_CONFERENCE } from '../../src/features/processes/cargoConferenceModel'

const FCL = {
  id: 'p-fcl',
  name: 'GOOYER SEA 185-26',
  processNumber: '4500185',
  category: 'FCL',
  items: [
    { id: 'i1', commercialName: 'POLIOL PE-3000', quantity: 4000 },
    { id: 'i2', commercialName: 'CATALISADOR ZN-12', quantity: 500 },
  ],
}

const CONSOLIDATED = {
  id: 'p-cons',
  name: 'CON DG 009-26',
  processNumber: '4500185',
  category: 'CONSOLIDADO',
  purchaseOrders: [
    { po: '4500185', reference: 'GOOYER SEA 185-26', supplierName: 'GOOYER' },
    { po: '4500186', reference: 'GOOYER SEA 186-26', supplierName: 'GOOYER' },
    { po: '4500187', reference: 'ALFA AIR 187-26', supplierName: 'ALFA' },
  ],
}

const describeError = (code) => `erro:${code}`

let seq = 0
const row = (id, overrides = {}) => ({
  ...createEmptyCargoReportRow(id),
  po: 'GOOYER SEA 185-26',
  dbcorpCode: 'BA5012',
  supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
  sqDescription: 'POLIOL PE-3000',
  quantityKg: 4000,
  ...overrides,
})
const entry = (key, base = {}, extra = {}) => ({ key, base, ...extra })
const makeForm = (rows, entries = {}) => ({
  revision: 1,
  rows,
  autofill: { schemaVersion: 1, snapshotId: '', rows: entries },
})

const cert = (overrides = {}) => ({
  page: 1,
  productName: 'POLYETHER POLYOL PE-3000',
  productNameLocal: null,
  productAliases: [],
  batchNumber: 'L1',
  poReference: null,
  quantity: { raw: '', value: 1000, unit: 'kg', kg: 1000 },
  packaging: null,
  manufactureDate: null,
  expiryDate: null,
  expiryKind: null,
  supplierName: null,
  confidence: 'high',
  warnings: [],
  ...overrides,
})
const kgCert = (batchNumber, kg, overrides = {}) =>
  cert({ batchNumber, quantity: kg === null ? null : { raw: '', value: kg, unit: 'kg', kg }, ...overrides })

const doc = (id, name, overrides = {}) => {
  seq += 1
  return { id, type: 'coaOriginal', name, description: '', mimeType: 'application/pdf', uploadedAt: seq, ...overrides }
}
const doneRead = (id, certificates, overrides = {}) => ({
  documentId: id,
  status: 'done',
  documentType: 'coa',
  certificates,
  warnings: [],
  validationWarnings: [],
  error: null,
  ...overrides,
})

// Fluxo completo: COAs -> certificados -> itens -> casamento -> propostas.
function propose(form, process, documents, reads, { conference = EMPTY_CARGO_CONFERENCE, manualLinks = {} } = {}) {
  const { certificates, documentNotes } = collectCoaCertificates(documents, reads, { describeError })
  const items = buildCoaReportItems(form, process)
  const match = matchCoaCertificates(certificates, items, process, manualLinks)
  const proposals = buildCoaProposals(form, { items, certificates, match, conference, process })
  return { certificates, documentNotes, items, match, proposals }
}

const byId = (proposals, id) => proposals.find((proposal) => proposal.id === id)

// Base do autofill de uma linha preenchida pelo Portal (processo + FUP): nada editado à mão.
const FULL_BASE = {
  po: 'GOOYER SEA 185-26',
  dbcorpCode: 'BA5012',
  supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG',
  sqDescription: 'POLIOL PE-3000',
  quantityKg: 4000,
}
const cleanForm = (overrides = {}) => makeForm([row('a', overrides)], { a: entry('fup:1', FULL_BASE) })

describe('compactCoaText', () => {
  it('só A-Z e 0-9, sem acento, maiúsculas', () => {
    expect(compactCoaText('GOOYER SEA 185-26')).toBe('GOOYERSEA18526')
    expect(compactCoaText('HL-200')).toBe('HL200')
    expect(compactCoaText('  Poliol açúcar / PE.3000 ')).toBe('POLIOLACUCARPE3000')
    expect(compactCoaText(null)).toBe('')
    expect(compactCoaText('测试')).toBe('')
  })
})

describe('collectCoaCertificates', () => {
  it('lista os certificados na ordem dos documentos, com nomes compactos (produto + aliases)', () => {
    const docs = [doc('d1', 'a.pdf'), doc('d2', 'b.pdf')]
    const reads = {
      d1: doneRead('d1', [cert({ productAliases: ['ATBC', 'HL-200'], batchNumber: 'A1' }), kgCert('A2', 2000)]),
      d2: doneRead('d2', [kgCert('B1', 500, { productName: 'Catalisador ZN-12' })]),
    }
    const { certificates, documentNotes } = collectCoaCertificates(docs, reads, { describeError })
    expect(certificates.map((item) => item.id)).toEqual(['d1#0', 'd1#1', 'd2#0'])
    expect(certificates[0].names).toEqual(['POLYETHERPOLYOLPE3000', 'ATBC', 'HL200'])
    expect(certificates[0]).toMatchObject({ documentName: 'a.pdf', batchNumber: 'A1', kg: 1000, duplicates: [], conflict: false })
    expect(certificates[2].names).toEqual(['CATALISADORZN12'])
    expect(documentNotes).toEqual([])
  })

  it('usa o nome próprio (description) do COA como nome do arquivo', () => {
    const { certificates } = collectCoaCertificates([doc('d1', 'x.pdf', { description: 'COA Gooyer lote 1' })], {
      d1: doneRead('d1', [cert()]),
    })
    expect(certificates[0].documentName).toBe('COA Gooyer lote 1')
  })

  it('mesmo lote e mesmo produto em 2 PDFs vira 1: fica o que tem kg; duplicates traz o outro arquivo', () => {
    const docs = [doc('d1', 'a.pdf'), doc('d2', 'b.pdf')]
    const reads = {
      d1: doneRead('d1', [kgCert('L1', null, { confidence: 'high' })]),
      d2: doneRead('d2', [kgCert('l-1', 1000, { confidence: 'medium' })]),
    }
    const { certificates } = collectCoaCertificates(docs, reads)
    expect(certificates).toHaveLength(1)
    expect(certificates[0]).toMatchObject({ documentId: 'd2', kg: 1000, duplicates: ['a.pdf'], conflict: false })
  })

  it('mesmo lote com quantidades diferentes marca conflict e guarda as quantidades', () => {
    const docs = [doc('d1', 'a.pdf'), doc('d2', 'b.pdf')]
    const reads = {
      d1: doneRead('d1', [kgCert('L1', 1000)]),
      d2: doneRead('d2', [kgCert('L1', 1200, { confidence: 'low' })]),
    }
    const { certificates } = collectCoaCertificates(docs, reads)
    expect(certificates).toHaveLength(1)
    expect(certificates[0]).toMatchObject({ documentId: 'd1', conflict: true, duplicates: ['b.pdf'], duplicateKgs: [1200] })
  })

  it('mesmo lote com a mesma quantidade em 2 PDFs não é conflito', () => {
    const docs = [doc('d1', 'a.pdf'), doc('d2', 'b.pdf')]
    const reads = { d1: doneRead('d1', [kgCert('L1', 1000)]), d2: doneRead('d2', [kgCert('L1', 1000.0004)]) }
    expect(collectCoaCertificates(docs, reads).certificates[0].conflict).toBe(false)
  })

  it('lotes iguais de produtos diferentes não se fundem', () => {
    const docs = [doc('d1', 'a.pdf')]
    const reads = { d1: doneRead('d1', [kgCert('L1', 1000), kgCert('L1', 500, { productName: 'OUTRO PRODUTO' })]) }
    expect(collectCoaCertificates(docs, reads).certificates).toHaveLength(2)
  })

  it('"li e descartei" (coa sem certificados, com aviso) é diferente de "não é COA"', () => {
    const docs = [doc('d1', 'a.pdf'), doc('d2', 'b.pdf'), doc('d3', 'c.pdf')]
    const reads = {
      d1: doneRead('d1', [], { validationWarnings: ['certificado sem lote ignorado (página 2)'] }),
      d2: doneRead('d2', [], { documentType: 'not_coa' }),
      d3: doneRead('d3', []),
    }
    const { certificates, documentNotes } = collectCoaCertificates(docs, reads)
    expect(certificates).toEqual([])
    expect(documentNotes).toEqual([
      expect.objectContaining({
        documentId: 'd1',
        kind: 'discarded',
        message: 'a.pdf: Li o arquivo, mas descartei certificados incompletos: certificado sem lote ignorado (página 2)',
      }),
      expect.objectContaining({ documentId: 'd2', kind: 'notCoa', message: 'b.pdf: Não parece um COA.' }),
      expect.objectContaining({ documentId: 'd3', kind: 'empty' }),
    ])
    expect(documentNotes[0].message).not.toContain('Não parece um COA')
    expect(documentNotes[1].message).not.toContain('descartei')
  })

  it('notas por arquivo: não PDF, falhou (texto do erro), lendo em outra sessão, não lido e avisos', () => {
    const docs = [
      doc('d1', 'a.jpg', { mimeType: 'image/jpeg' }),
      doc('d2', 'b.pdf'),
      doc('d3', 'c.pdf'),
      doc('d4', 'd.pdf'),
      doc('d5', 'e.pdf'),
    ]
    const reads = {
      d2: { documentId: 'd2', status: 'failed', error: { code: 'tess-timeout' }, certificates: [] },
      d3: { documentId: 'd3', status: 'reading', certificates: [] },
      d5: doneRead('d5', [cert()], { warnings: ['scanned image'], validationWarnings: ['data de validade inválida ignorada (página 1)'] }),
      zz: doneRead('zz', [cert()]),
    }
    const { certificates, documentNotes } = collectCoaCertificates(docs, reads, { describeError })
    expect(documentNotes.map((note) => [note.documentId, note.kind])).toEqual([
      ['d1', 'notPdf'],
      ['d2', 'failed'],
      ['d3', 'reading'],
      ['d4', 'unread'],
      ['d5', 'warning'],
      ['d5', 'warning'],
    ])
    expect(documentNotes[1].message).toBe('b.pdf: erro:tess-timeout')
    expect(documentNotes[4].message).toBe('e.pdf: Aviso da leitura: data de validade inválida ignorada (página 1)')
    expect(documentNotes[5].message).toBe('e.pdf: Aviso da leitura: scanned image')
    // leitura de documento que não está mais na lista é ignorada
    expect(certificates.map((item) => item.documentId)).toEqual(['d5'])
  })
})

describe('resolveCoaPurchaseOrder', () => {
  it('FCL: igual (ignora caixa, espaço e hífen), ausente e de outro processo', () => {
    expect(resolveCoaPurchaseOrder('Gooyer Sea 185-26', FCL)).toEqual({ index: -1, match: 'exact', expected: 'GOOYER SEA 185-26' })
    expect(resolveCoaPurchaseOrder('GOOYERSEA18526', FCL).match).toBe('exact')
    expect(resolveCoaPurchaseOrder('4500185', FCL).match).toBe('exact')
    expect(resolveCoaPurchaseOrder(null, FCL).match).toBe('absent')
    expect(resolveCoaPurchaseOrder('  ', FCL).match).toBe('absent')
    expect(resolveCoaPurchaseOrder('OUTRA COISA 999-26', FCL).match).toBe('other')
  })

  it('FCL: PO parecida (erro de digitação) vale; 185 x 186 NÃO confunde', () => {
    expect(resolveCoaPurchaseOrder('GOOYE SEA 185-26', FCL)).toMatchObject({ match: 'similar', expected: 'GOOYER SEA 185-26' })
    expect(resolveCoaPurchaseOrder('GOOYER SEA 185-26 ', FCL).match).toBe('exact')
    expect(resolveCoaPurchaseOrder('GOOYER SEA 186-26', FCL).match).toBe('other')
    expect(resolveCoaPurchaseOrder('GOOYER SEA 185-27', FCL).match).toBe('other')
    // distância de edição: 2 vale, 3 não (mesmos dígitos)
    expect(resolveCoaPurchaseOrder('GOOY SEA 185-26', FCL).match).toBe('similar')
    expect(resolveCoaPurchaseOrder('GOO SEA 185-26', FCL).match).toBe('other')
    expect(resolveCoaPurchaseOrder('XXXXXXXX 185-26', FCL).match).toBe('other')
  })

  it('consolidado: acha a PO pelo índice; 185 não cai na 186; PO de fora é other', () => {
    expect(resolveCoaPurchaseOrder('GOOYER SEA 186-26', CONSOLIDATED)).toEqual({ index: 1, match: 'exact', expected: 'GOOYER SEA 186-26' })
    expect(resolveCoaPurchaseOrder('GOOYE SEA 185-26', CONSOLIDATED)).toMatchObject({ index: 0, match: 'similar' })
    expect(resolveCoaPurchaseOrder('GOOYER SEA 188-26', CONSOLIDATED)).toMatchObject({ index: -1, match: 'other', expected: '' })
    expect(resolveCoaPurchaseOrder('4500187', CONSOLIDATED)).toMatchObject({ index: 2, match: 'exact' })
    expect(resolveCoaPurchaseOrder(null, CONSOLIDATED)).toMatchObject({ index: -1, match: 'absent' })
  })

  it('consolidado: empate entre POs parecidas não escolhe nenhuma', () => {
    const tied = {
      category: 'CONSOLIDADO',
      purchaseOrders: [
        { po: '1', reference: 'ABCD 185-26' },
        { po: '2', reference: 'ABCE 185-26' },
      ],
    }
    expect(resolveCoaPurchaseOrder('ABCF 185-26', tied).match).toBe('other')
  })
})

describe('buildCoaReportItems', () => {
  it('agrupa linhas pela chave do autofill; sem chave, por PO + nome; ignora linha vazia', () => {
    const form = makeForm(
      [
        row('a', { quantityKg: 1000 }),
        row('b', { quantityKg: 3000 }),
        row('c', { sqDescription: 'CATALISADOR ZN-12', supplierDescription: '', dbcorpCode: '', quantityKg: 500 }),
        row('d', { sqDescription: 'CATALISADOR ZN-12', supplierDescription: '', dbcorpCode: '', quantityKg: null }),
        createEmptyCargoReportRow('vazia'),
      ],
      { a: entry('fup:1'), b: entry('fup:1') }
    )
    const items = buildCoaReportItems(form, FCL)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ key: 'k:fup:1', rowIds: ['a', 'b'], quantityKg: 4000, label: 'POLIOL PE-3000', po: 'GOOYER SEA 185-26' })
    expect(items[0].names).toEqual(['POLYETHERPOLYOLPE3000DRUM200KG', 'POLIOLPE3000', 'BA5012'])
    expect(items[1]).toMatchObject({ rowIds: ['c', 'd'], quantityKg: 500 })
  })

  it('consolidado: o mesmo nome em POs diferentes são itens diferentes; quantidade vazia = null', () => {
    const form = makeForm([
      row('a', { po: 'GOOYER SEA 185-26', quantityKg: null }),
      row('b', { po: 'GOOYER SEA 186-26', quantityKg: 100 }),
    ])
    const items = buildCoaReportItems(form, CONSOLIDATED)
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.purchaseOrderIndex)).toEqual([0, 1])
    expect(items.map((item) => item.quantityKg)).toEqual([null, 100])
  })
})

describe('matchCoaCertificates', () => {
  const items = (rows, process = FCL) => buildCoaReportItems(makeForm(rows), process)
  const certs = (list) => collectCoaCertificates([doc('d', 'a.pdf')], { d: doneRead('d', list) }).certificates

  it('casa por nome do produto contido no nome do fornecedor e pelo alias', () => {
    const list = items([row('a'), row('b', { sqDescription: 'CATALISADOR ZN-12', supplierDescription: 'ZINC CATALYST ZN-12 PAIL', dbcorpCode: 'BA5033' })])
    const result = matchCoaCertificates(
      certs([
        kgCert('L1', 1000),
        kgCert('Z1', 100, { productName: 'ZINC CATALYST', productAliases: ['ZN-12'] }),
      ]),
      list,
      FCL
    )
    expect(result.byItemKey).toEqual({ [list[0].key]: ['d#0'], [list[1].key]: ['d#1'] })
    expect(result.unmatched).toEqual([])
  })

  it('nome igual (nota 3) vence nome contido (nota 2)', () => {
    const list = items([
      row('a', { sqDescription: 'POLIOL PE-3000', supplierDescription: '', dbcorpCode: '' }),
      row('b', { sqDescription: 'POLIOL PE-3000 PLUS', supplierDescription: '', dbcorpCode: '' }),
    ])
    const result = matchCoaCertificates(certs([kgCert('L1', 10, { productName: 'POLIOL PE-3000' })]), list, FCL)
    expect(result.byItemKey).toEqual({ [list[0].key]: ['d#0'] })
  })

  it('nome contido só vale com 4+ caracteres; sem parecido vai para "só no COA" (none)', () => {
    const list = items([row('a', { sqDescription: 'ABC', supplierDescription: '', dbcorpCode: '' })])
    const result = matchCoaCertificates(certs([kgCert('L1', 10, { productName: 'ABCDEF' })]), list, FCL)
    expect(result.byItemKey).toEqual({})
    expect(result.unmatched).toEqual([{ certId: 'd#0', reason: 'none', candidateKeys: [] }])

    const long = items([row('a', { sqDescription: 'ABCD', supplierDescription: '', dbcorpCode: '' })])
    expect(matchCoaCertificates(certs([kgCert('L1', 10, { productName: 'ABCDEF' })]), long, FCL).byItemKey).toEqual({
      [long[0].key]: ['d#0'],
    })
  })

  it('empate na melhor nota = ambiguous, com os candidatos', () => {
    const list = items([
      row('a', { sqDescription: 'POLIOL PE-3000 A', supplierDescription: '', dbcorpCode: '' }),
      row('b', { sqDescription: 'POLIOL PE-3000 B', supplierDescription: '', dbcorpCode: '' }),
    ])
    const result = matchCoaCertificates(certs([kgCert('L1', 10, { productName: 'POLIOL PE-3000' })]), list, FCL)
    expect(result.byItemKey).toEqual({})
    expect(result.unmatched).toEqual([{ certId: 'd#0', reason: 'ambiguous', candidateKeys: [list[0].key, list[1].key] }])
  })

  it('ligação manual vence o casamento; chave inexistente é ignorada', () => {
    const list = items([row('a'), row('b', { sqDescription: 'CATALISADOR ZN-12', supplierDescription: '', dbcorpCode: '' })])
    const list2 = certs([kgCert('L1', 10)])
    expect(matchCoaCertificates(list2, list, FCL, { 'd#0': list[1].key }).byItemKey).toEqual({ [list[1].key]: ['d#0'] })
    expect(matchCoaCertificates(list2, list, FCL, { 'd#0': 'nao-existe' }).byItemKey).toEqual({ [list[0].key]: ['d#0'] })
  })

  describe('consolidado: só dentro do grupo da PO', () => {
    const rows = [
      row('a', { po: 'GOOYER SEA 185-26' }),
      row('b', { po: 'GOOYER SEA 186-26' }),
      row('c', { po: 'ALFA AIR 187-26', sqDescription: 'RESINA RA-55', supplierDescription: '', dbcorpCode: '' }),
    ]
    const list = items(rows, CONSOLIDATED)

    it('a PO do COA limita o casamento ao grupo dela (185 não cai no item da 186)', () => {
      const result = matchCoaCertificates(certs([kgCert('L1', 10, { poReference: 'GOOYER SEA 186-26' })]), list, CONSOLIDATED)
      expect(result.byItemKey).toEqual({ [list[1].key]: ['d#0'] })
      const similar = matchCoaCertificates(certs([kgCert('L1', 10, { poReference: 'GOOYE SEA 185-26' })]), list, CONSOLIDATED)
      expect(similar.byItemKey).toEqual({ [list[0].key]: ['d#0'] })
    })

    it('PO ausente procura em todos os grupos: achou em mais de um = ambiguous', () => {
      const result = matchCoaCertificates(certs([kgCert('L1', 10)]), list, CONSOLIDATED)
      expect(result.byItemKey).toEqual({})
      expect(result.unmatched).toEqual([{ certId: 'd#0', reason: 'ambiguous', candidateKeys: [list[0].key, list[1].key] }])
    })

    it('PO ausente e nome só num grupo casa nesse grupo', () => {
      const result = matchCoaCertificates(
        certs([kgCert('R1', 10, { productName: 'RESINA RA-55' })]),
        list,
        CONSOLIDATED
      )
      expect(result.byItemKey).toEqual({ [list[2].key]: ['d#0'] })
    })

    it('PO que não é do processo vai para "só no COA" (otherPo), sem casar por nome', () => {
      const result = matchCoaCertificates(certs([kgCert('L1', 10, { poReference: 'GOOYER SEA 199-26' })]), list, CONSOLIDATED)
      expect(result.byItemKey).toEqual({})
      expect(result.unmatched).toEqual([{ certId: 'd#0', reason: 'otherPo', candidateKeys: [] }])
    })

    it('PO certa, mas o nome não existe nesse grupo: none (não procura em outro grupo)', () => {
      const result = matchCoaCertificates(
        certs([kgCert('R1', 10, { productName: 'RESINA RA-55', poReference: 'GOOYER SEA 185-26' })]),
        list,
        CONSOLIDATED
      )
      expect(result.byItemKey).toEqual({})
      expect(result.unmatched[0].reason).toBe('none')
    })
  })
})

describe('buildCoaProposals: 1 linha e 1 certificado (só o lote)', () => {
  const docs = [doc('d1', 'a.pdf')]

  it('grava só o lote; a quantidade não muda; vem marcado', () => {
    const form = makeForm([row('a')], { a: entry('fup:1', { quantityKg: 4000 }) })
    const { proposals } = propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 4000)]) })
    expect(proposals).toHaveLength(1)
    const [proposal] = proposals
    expect(proposal).toMatchObject({
      id: 'coa|k:fup:1',
      kind: 'lote',
      sumState: 'single',
      defaultOn: true,
      applicable: true,
      edited: false,
      rowIds: ['a'],
      apply: { type: 'setLot', rowIds: ['a'], lots: [{ supplierLot: 'L1', quantityKg: 4000 }] },
    })
    expect(proposal.title).toBe('POLIOL PE-3000 · GOOYER SEA 185-26: 1 lote')
    expect(proposal.notes).toEqual([])
  })

  it('avisa quando o COA diz outro peso (a quantidade não muda) e sem kg não avisa', () => {
    const form = makeForm([row('a', { quantityKg: 4200 })])
    const first = propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 4000)]) }).proposals[0]
    expect(first.notes).toContain('COA: 4.000 kg; relatório: 4.200 kg (a quantidade não muda).')
    expect(first.apply.rowIds).toEqual(['a'])
    const second = propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', null)]) }).proposals[0]
    expect(second.notes).toEqual([])
  })

  it('lote que já está na linha: item em dia, sem proposta', () => {
    const form = makeForm([row('a', { supplierLot: 'L1' })])
    expect(propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 4000)]) }).proposals).toEqual([])
  })

  it('lote digitado à mão vem desmarcado, com "você editou esta célula"', () => {
    const form = makeForm([row('a', { supplierLot: 'MEU-LOTE' })], { a: entry('fup:1', {}) })
    const [proposal] = propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 4000)]) }).proposals
    expect(proposal).toMatchObject({ edited: true, defaultOn: false, applicable: true })
    expect(proposal.notes).toContain('Lote atual: “MEU-LOTE” (você editou esta célula)')
  })

  it('lote que veio de uma leitura anterior (base igual) não conta como editado', () => {
    const form = makeForm([row('a', { supplierLot: 'ANTIGO' })], { a: entry('fup:1', { supplierLot: 'ANTIGO' }) })
    const [proposal] = propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 4000)]) }).proposals
    expect(proposal).toMatchObject({ edited: false, defaultOn: true })
  })

  it('confiança baixa, PO de outro processo e lote repetido com quantidades diferentes: desmarcado', () => {
    const form = makeForm([row('a')])
    const low = propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 4000, { confidence: 'low' })]) }).proposals[0]
    expect(low.defaultOn).toBe(false)
    const other = propose(form, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 4000, { poReference: 'OUTRA 1-26' })]) }).proposals[0]
    expect(other.defaultOn).toBe(false)
    expect(other.notes).toContain('PO impressa no COA (OUTRA 1-26) não é deste processo.')
    const twoDocs = [doc('d1', 'a.pdf'), doc('d2', 'b.pdf')]
    const conflict = propose(form, FCL, twoDocs, {
      d1: doneRead('d1', [kgCert('L1', 4000)]),
      d2: doneRead('d2', [kgCert('L1', 4100)]),
    }).proposals[0]
    expect(conflict.defaultOn).toBe(false)
    expect(conflict.notes).toContain('O lote L1 aparece em 2 COAs com quantidades diferentes (4.000 kg e 4.100 kg).')
  })

  it('PO parecida vale (vem marcado) e mostra o aviso; avisos do agente aparecem como estão', () => {
    const form = makeForm([row('a')])
    const [proposal] = propose(form, FCL, docs, {
      d1: doneRead('d1', [kgCert('L1', 4000, { poReference: 'GOOYE SEA 185-26', warnings: ['scanned image, low quality'] })]),
    }).proposals
    expect(proposal.defaultOn).toBe(true)
    expect(proposal.notes).toEqual([
      'PO impressa no COA: GOOYE SEA 185-26 (parecida com GOOYER SEA 185-26).',
      'Aviso da leitura: scanned image, low quality',
    ])
  })

  it('mesmo lote em 2 PDFs com a mesma quantidade: considerado uma vez, vem marcado', () => {
    const form = makeForm([row('a')])
    const [proposal] = propose(form, FCL, [doc('d1', 'a.pdf'), doc('d2', 'b.pdf')], {
      d1: doneRead('d1', [kgCert('L1', 4000)]),
      d2: doneRead('d2', [kgCert('L1', 4000)]),
    }).proposals
    expect(proposal.defaultOn).toBe(true)
    expect(proposal.lots).toHaveLength(1)
    expect(proposal.notes).toContain('O lote L1 aparece em 2 COAs (a.pdf, b.pdf); considerado uma vez.')
  })
})

describe('buildCoaProposals: divisão por lote (linhas trocadas)', () => {
  const docs = [doc('d1', 'a.pdf')]
  const threeLots = (kgs) => doneRead('d1', kgs.map((kg, index) => kgCert(`L${index + 1}`, kg)))

  it('soma que fecha: vem marcado, uma linha por lote', () => {
    const form = cleanForm()
    const { proposals } = propose(form, FCL, docs, { d1: threeLots([1500, 1500, 1000]) })
    const proposal = byId(proposals, 'coa|k:fup:1')
    expect(proposal).toMatchObject({ kind: 'lotes', sumState: 'ok', sumKg: 4000, itemKg: 4000, defaultOn: true, edited: false })
    expect(proposal.apply).toEqual({
      type: 'replaceLots',
      rowIds: ['a'],
      lots: [
        { supplierLot: 'L1', quantityKg: 1500 },
        { supplierLot: 'L2', quantityKg: 1500 },
        { supplierLot: 'L3', quantityKg: 1000 },
      ],
    })
    expect(proposal.title).toBe('POLIOL PE-3000 · GOOYER SEA 185-26: 3 lotes')
  })

  it('soma menor ou maior que o item aparece DESMARCADA (short / over)', () => {
    const form = makeForm([row('a')])
    const short = propose(form, FCL, docs, { d1: threeLots([1500, 1500, 800]) }).proposals[0]
    expect(short).toMatchObject({ sumState: 'short', sumKg: 3800, defaultOn: false, applicable: true })
    const over = propose(form, FCL, docs, { d1: threeLots([1500, 1500, 1200]) }).proposals[0]
    expect(over).toMatchObject({ sumState: 'over', sumKg: 4200, defaultOn: false })
  })

  it('tolerância de 0,0005 kg: 0,0004 fecha, 0,001 não', () => {
    const form = cleanForm()
    expect(propose(form, FCL, docs, { d1: threeLots([1500, 1500, 1000.0004]) }).proposals[0]).toMatchObject({
      sumState: 'ok',
      defaultOn: true,
    })
    expect(propose(form, FCL, docs, { d1: threeLots([1500, 1500, 1000.001]) }).proposals[0]).toMatchObject({
      sumState: 'over',
      defaultOn: false,
    })
    expect(propose(form, FCL, docs, { d1: threeLots([1500, 1500, 999.999]) }).proposals[0]).toMatchObject({
      sumState: 'short',
      defaultOn: false,
    })
  })

  it('lote sem quantidade no COA: incomplete, desmarcado; a linha nasce sem Qtd', () => {
    const form = makeForm([row('a')])
    const [proposal] = propose(form, FCL, docs, { d1: threeLots([2000, null, 1000]) }).proposals
    expect(proposal).toMatchObject({ sumState: 'incomplete', defaultOn: false })
    expect(proposal.apply.lots[1]).toEqual({ supplierLot: 'L2', quantityKg: null })
  })

  it('confiança baixa em qualquer lote desmarca', () => {
    const form = makeForm([row('a')])
    const read = doneRead('d1', [kgCert('L1', 2000), kgCert('L2', 2000, { confidence: 'low' })])
    expect(propose(form, FCL, docs, { d1: read }).proposals[0]).toMatchObject({ sumState: 'ok', defaultOn: false })
  })

  it('item sem quantidade no relatório: sumState unknown, desmarcado', () => {
    const form = makeForm([row('a', { quantityKg: null })])
    expect(propose(form, FCL, docs, { d1: threeLots([2000, 2000]) }).proposals[0]).toMatchObject({
      sumState: 'unknown',
      itemKg: null,
      defaultOn: false,
    })
  })

  it('item já dividido: troca as linhas dele; já em dia (mesmos lotes e quantidades) não propõe', () => {
    const split = makeForm([row('a', { supplierLot: 'L1', quantityKg: 2000 }), row('b', { supplierLot: 'L2', quantityKg: 2000 })], {
      a: entry('fup:1', { ...FULL_BASE, supplierLot: 'L1', quantityKg: 2000 }, { coa: true }),
      b: entry('fup:1', { ...FULL_BASE, supplierLot: 'L2', quantityKg: 2000 }, { coa: true }),
    })
    expect(propose(split, FCL, docs, { d1: threeLots([2000, 2000]) }).proposals).toEqual([])
    // ordem diferente das linhas não muda o resultado
    const swapped = makeForm([split.rows[1], split.rows[0]], split.autofill.rows)
    expect(propose(swapped, FCL, docs, { d1: threeLots([2000, 2000]) }).proposals).toEqual([])
    // mesmos lotes, mas uma quantidade diferente do COA: reabre a proposta
    const [changed] = propose(split, FCL, docs, { d1: threeLots([2000, 1500]) }).proposals
    expect(changed).toMatchObject({ sumState: 'short', defaultOn: false })
    // 1 certificado para um item dividido em 2 linhas: troca as 2 linhas por 1
    const [proposal] = propose(split, FCL, docs, { d1: threeLots([4000]) }).proposals
    expect(proposal.apply).toMatchObject({ type: 'replaceLots', rowIds: ['a', 'b'], lots: [{ supplierLot: 'L1', quantityKg: 4000 }] })
    expect(proposal).toMatchObject({ kind: 'lote', sumState: 'ok', edited: false, defaultOn: true })
  })

  it('lote com kg nulo no COA não reabre um item cuja linha já tem o lote e uma quantidade digitada', () => {
    const form = makeForm([row('a', { supplierLot: 'L1', quantityKg: 2000 }), row('b', { supplierLot: 'L2', quantityKg: 2000 })], {
      a: entry('fup:1', { supplierLot: 'L1' }),
      b: entry('fup:1', { supplierLot: 'L2' }),
    })
    expect(propose(form, FCL, docs, { d1: threeLots([2000, null]) }).proposals).toEqual([])
  })

  it('edição à mão nas linhas do item (lote, quantidade, descrição) desmarca e avisa', () => {
    expect(propose(cleanForm(), FCL, docs, { d1: threeLots([2000, 2000]) }).proposals[0].defaultOn).toBe(true)

    for (const edit of [{ quantityKg: 3900 }, { sqDescription: 'POLIOL PE-3000 X' }, { supplierLot: 'XX' }, { packageWeightKg: 200 }]) {
      const form = cleanForm(edit)
      const [proposal] = propose(form, FCL, docs, { d1: threeLots([2000, 2000]) }).proposals
      expect(proposal.edited).toBe(true)
      expect(proposal.defaultOn).toBe(false)
      expect(proposal.notes).toContain('Linhas deste item com edição à mão serão trocadas (você editou esta célula)')
    }
  })

  it('linha sem registro de origem (relatório antigo) com dados preenchidos conta como editada', () => {
    const [proposal] = propose(makeForm([row('a')]), FCL, docs, { d1: threeLots([2000, 2000]) }).proposals
    expect(proposal.edited).toBe(true)
    expect(proposal.defaultOn).toBe(false)
  })

  it('marcas da logística nas linhas trocadas desmarcam e avisam (OK?, pallets, etiquetas)', () => {
    const form = cleanForm()
    const marks = [
      { okByRowId: { a: true } },
      { palletsByRowId: { a: 3 } },
      { countOkByRowId: { a: true } },
      { labelsByRowId: { a: { wms: 'W1', sq: '' } } },
      { labelsByRowId: { a: { wms: '', sq: 'S1' } } },
      // avaria: só observação ou só foto (sem OK?, contagem nem etiqueta)
      { damageByRowId: { a: { note: 'tambor amassado', photos: [] } } },
      { damageByRowId: { a: { note: '', photos: [{ id: 'f1' }] } } },
    ]
    for (const mark of marks) {
      const [proposal] = propose(form, FCL, docs, { d1: threeLots([2000, 2000]) }, { conference: { ...EMPTY_CARGO_CONFERENCE, ...mark } }).proposals
      expect(proposal.defaultOn).toBe(false)
      expect(proposal.notes).toContain(
        'A logística já marcou OK?, contagem, etiquetas, avaria ou fotos em 1 linha deste item; trocar as linhas apaga essas marcas.'
      )
    }
    // sem marca (pallets 0, etiqueta vazia, avaria vazia): vem marcado e sem aviso
    const none = propose(form, FCL, docs, { d1: threeLots([2000, 2000]) }, { conference: { ...EMPTY_CARGO_CONFERENCE, palletsByRowId: { a: 0 }, labelsByRowId: { a: { wms: ' ', sq: '' } }, damageByRowId: { a: { note: '  ', photos: [] } } } })
    expect(none.proposals[0].defaultOn).toBe(true)
    expect(none.proposals[0].notes).toEqual([])
  })

  it('marca da logística em UMA linha só do lote único (setLot) não bloqueia: a linha não é trocada', () => {
    const form = makeForm([row('a')], { a: entry('fup:1', { quantityKg: 4000 }) })
    const [proposal] = propose(form, FCL, docs, { d1: threeLots([4000]) }, { conference: { ...EMPTY_CARGO_CONFERENCE, okByRowId: { a: true } } }).proposals
    expect(proposal.apply.type).toBe('setLot')
    expect(proposal.defaultOn).toBe(true)
  })

  it('lote repetido com quantidades diferentes no mesmo item: uma linha só, desmarcada e avisada', () => {
    const form = makeForm([row('a')])
    const read = doneRead('d1', [kgCert('L1', 2000), kgCert('L1', 2500, { productName: 'POLIOL PE-3000' }), kgCert('L2', 2000)])
    const [proposal] = propose(form, FCL, docs, { d1: read }).proposals
    expect(proposal.apply.lots.map((lot) => lot.supplierLot)).toEqual(['L1', 'L2'])
    expect(proposal.defaultOn).toBe(false)
    expect(proposal.notes.some((note) => note.includes('com quantidades diferentes (2.000 kg e 2.500 kg)'))).toBe(true)
  })

  it('avisos do agente com mais de um lote citam o lote', () => {
    const form = makeForm([row('a')])
    const read = doneRead('d1', [kgCert('L1', 2000, { warnings: ['lot number partially illegible'] }), kgCert('L2', 2000)])
    expect(propose(form, FCL, docs, { d1: read }).proposals[0].notes).toContain(
      'Aviso da leitura: lot number partially illegible (lote L1)'
    )
  })
})

describe('buildCoaProposals: só no COA e só no relatório', () => {
  const docs = [doc('d1', 'a.pdf')]
  const form = makeForm([
    row('a', { po: 'GOOYER SEA 185-26' }),
    row('b', { po: 'GOOYER SEA 186-26', sqDescription: 'CATALISADOR ZN-12', supplierDescription: '', dbcorpCode: '' }),
    row('c', { po: 'ALFA AIR 187-26', sqDescription: 'RESINA RA-55', supplierDescription: '', dbcorpCode: '' }),
  ])

  it('COA sem item vira "só no COA" (informativo) com opções de ligação; o resto "só no relatório"', () => {
    const read = doneRead('d1', [kgCert('X1', 100, { productName: 'PRODUTO DESCONHECIDO', poReference: 'GOOYER SEA 186-26' })])
    const { proposals } = propose(form, CONSOLIDATED, docs, { d1: read })
    expect(proposals.map((proposal) => proposal.kind)).toEqual(['só no COA', 'só no relatório', 'só no relatório', 'só no relatório'])
    const only = proposals[0]
    expect(only).toMatchObject({ id: 'coaonly|d1#0', certId: 'd1#0', applicable: false, defaultOn: false, apply: null })
    expect(only.notes).toContain('Nenhum item do relatório tem nome parecido com este COA.')
    // itens do mesmo grupo da PO impressa no COA primeiro
    expect(only.linkOptions.map((option) => option.label)).toEqual([
      'CATALISADOR ZN-12 · GOOYER SEA 186-26',
      'POLIOL PE-3000 · GOOYER SEA 185-26',
      'RESINA RA-55 · ALFA AIR 187-26',
    ])
    expect(proposals[1].title).toBe('Sem COA para: POLIOL PE-3000 · GOOYER SEA 185-26')
    expect(proposals[1]).toMatchObject({ applicable: false, apply: null, lots: [] })
  })

  it('ligar o COA a um item gera a proposta do lote nesse item', () => {
    const read = doneRead('d1', [kgCert('X1', 100, { productName: 'PRODUTO DESCONHECIDO' })])
    const { items, proposals } = propose(form, CONSOLIDATED, docs, { d1: read }, { manualLinks: { 'd1#0': buildCoaReportItems(form, CONSOLIDATED)[1].key } })
    expect(items).toHaveLength(3)
    expect(byId(proposals, 'coaonly|d1#0')).toBeUndefined()
    expect(proposals.find((proposal) => proposal.kind === 'lote')).toMatchObject({
      apply: { type: 'setLot', lots: [{ supplierLot: 'X1', quantityKg: 100 }] },
    })
  })

  it('ambígua e PO de fora têm a nota certa; sem certificados lidos não há "só no relatório"', () => {
    const ambiguous = propose(form, CONSOLIDATED, docs, { d1: doneRead('d1', [kgCert('L1', 1, { productName: 'POLIOL PE-3000' }), kgCert('L2', 1, { productName: 'POLIOL PE-3000', poReference: 'XYZ 9-26' })]) })
    expect(byId(ambiguous.proposals, 'coaonly|d1#1').notes).toContain('PO impressa no COA (XYZ 9-26) não é deste processo.')
    const empty = propose(form, CONSOLIDATED, docs, { d1: doneRead('d1', [], { documentType: 'not_coa' }) })
    expect(empty.proposals).toEqual([])
  })
})

describe('applyCoaProposals', () => {
  const docs = [doc('d1', 'a.pdf')]
  const read = (kgs) => doneRead('d1', kgs.map((kg, index) => kgCert(`L${index + 1}`, kg)))
  const baseEntry = { po: 'GOOYER SEA 185-26', dbcorpCode: 'BA5012', supplierDescription: 'POLYETHER POLYOL PE-3000 DRUM 200 KG', sqDescription: 'POLIOL PE-3000', quantityKg: 4000 }
  const form = () =>
    makeForm([row('x', { sqDescription: 'RESINA RA-55', supplierDescription: '', dbcorpCode: '' }), row('a', { quantityKg: 4000, packageWeightKg: 200 }), row('z', { sqDescription: 'CATALISADOR ZN-12', supplierDescription: '', dbcorpCode: '', quantityKg: 500 })], {
      a: entry('fup:1', { ...baseEntry, packageWeightKg: 200 }),
    })

  it('sem seleção ou só com itens informativos devolve o mesmo formulário', () => {
    const f = form()
    const { proposals } = propose(f, FCL, docs, { d1: read([1500, 1500, 1000]) })
    expect(applyCoaProposals(f, proposals, [])).toEqual({ form: f })
    expect(applyCoaProposals(f, proposals, ['rowonly|n:-1|RESINARA55'], {}).form).toBe(f)
  })

  it('setLot: grava o lote e a base; a célula ganha a marca L e a quantidade não muda', () => {
    const f = makeForm([row('a')], { a: entry('fup:1', { quantityKg: 4000 }) })
    const { proposals } = propose(f, FCL, docs, { d1: read([4000]) })
    const result = applyCoaProposals(f, proposals, ['coa|k:fup:1'])
    expect(result.error).toBeUndefined()
    expect(result.form.rows[0]).toMatchObject({ id: 'a', supplierLot: 'L1', quantityKg: 4000 })
    expect(result.form.autofill.rows.a).toEqual({ key: 'fup:1', base: { quantityKg: 4000, supplierLot: 'L1' } })
    expect(cellOrigin(result.form.rows[0], result.form.autofill.rows.a, 'supplierLot')).toBe('L')
    expect(cellOrigin(result.form.rows[0], result.form.autofill.rows.a, 'quantityKg')).toBe('F')
    expect(f.rows[0].supplierLot).toBe('') // não muta a entrada
  })

  it('replaceLots: troca a linha do item no lugar dela, com ids novos, e monta o autofill (chave, lote, qtd, coa)', () => {
    const f = form()
    const { proposals } = propose(f, FCL, docs, { d1: read([1500, null, 2500]) })
    const id = 'coa|k:fup:1'
    expect(byId(proposals, id).sumState).toBe('incomplete')
    const result = applyCoaProposals(f, proposals, [id])
    expect(result.error).toBeUndefined()
    const { rows, autofill } = result.form
    expect(rows).toHaveLength(5)
    expect(rows[0].id).toBe('x')
    expect(rows[4].id).toBe('z')
    expect(rows.slice(1, 4).map((item) => [item.supplierLot, item.quantityKg])).toEqual([
      ['L1', 1500],
      ['L2', null],
      ['L3', 2500],
    ])
    expect(rows.slice(1, 4).every((item) => item.po === 'GOOYER SEA 185-26' && item.packageWeightKg === 200 && item.frozenPackages === null)).toBe(true)
    expect(rows.some((item) => item.id === 'a')).toBe(false)
    expect(autofill.rows.a).toBeUndefined()
    const [e1, e2, e3] = rows.slice(1, 4).map((item) => autofill.rows[item.id])
    expect(e1).toEqual({ key: 'fup:1', base: { ...baseEntry, packageWeightKg: 200, supplierLot: 'L1', quantityKg: 1500 }, coa: true })
    expect(e3.base.quantityKg).toBe(2500)
    // lote sem quantidade no COA: sem base de quantidade e sem marca de COA na quantidade
    expect(e2.base).not.toHaveProperty('quantityKg')
    expect(e2.coa).toBeUndefined()
    expect(e2.base.supplierLot).toBe('L2')
    expect(cellOrigin(rows[1], e1, 'quantityKg')).toBe('L')
    expect(cellOrigin(rows[1], e1, 'supplierLot')).toBe('L')
  })

  it('soma que não fecha só entra se o usuário marcar, com as quantidades do COA', () => {
    const f = form()
    const { proposals } = propose(f, FCL, docs, { d1: read([1500, 1500, 800]) })
    const proposal = byId(proposals, 'coa|k:fup:1')
    expect(proposal.defaultOn).toBe(false)
    const result = applyCoaProposals(f, proposals, [proposal.id])
    expect(result.form.rows.slice(1, 4).map((item) => item.quantityKg)).toEqual([1500, 1500, 800])
  })

  it('consolidado: as linhas novas ficam no grupo da PO', () => {
    const rows = [
      row('a', { po: 'GOOYER SEA 185-26' }),
      row('b', { po: 'GOOYER SEA 186-26', sqDescription: 'CATALISADOR ZN-12', supplierDescription: '', dbcorpCode: '', quantityKg: 500 }),
    ]
    const f = makeForm(rows, { a: entry('fup:1', baseEntry) })
    const { proposals } = propose(f, CONSOLIDATED, docs, { d1: doneRead('d1', [kgCert('L1', 2000, { poReference: 'GOOYER SEA 185-26' }), kgCert('L2', 2000, { poReference: 'GOOYER SEA 185-26' })]) })
    const result = applyCoaProposals(f, proposals, [proposals[0].id], { purchaseOrders: CONSOLIDATED.purchaseOrders })
    expect(result.form.rows.map((item) => item.po)).toEqual(['GOOYER SEA 185-26', 'GOOYER SEA 185-26', 'GOOYER SEA 186-26'])
    expect(result.form.rows[2].id).toBe('b')
  })

  it('consolidado: o array sai na ordem das POs (como o "Atualizar")', () => {
    const rows = [
      row('b', { po: 'GOOYER SEA 186-26', sqDescription: 'CATALISADOR ZN-12', supplierDescription: '', dbcorpCode: '', quantityKg: 500 }),
      row('a', { po: 'GOOYER SEA 185-26' }),
    ]
    const f = makeForm(rows, { a: entry('fup:1', baseEntry) })
    const { proposals } = propose(f, CONSOLIDATED, docs, { d1: doneRead('d1', [kgCert('L1', 2000, { poReference: 'GOOYER SEA 185-26' }), kgCert('L2', 2000, { poReference: 'GOOYER SEA 185-26' })]) })
    const result = applyCoaProposals(f, proposals, [proposals[0].id], { purchaseOrders: CONSOLIDATED.purchaseOrders })
    expect(result.form.rows.map((item) => item.po)).toEqual(['GOOYER SEA 185-26', 'GOOYER SEA 185-26', 'GOOYER SEA 186-26'])
  })

  describe('tudo ou nada', () => {
    const setup = () => {
      const f = makeForm(
        [row('a'), row('c', { sqDescription: 'CATALISADOR ZN-12', supplierDescription: 'ZINC CATALYST ZN-12', dbcorpCode: 'BA5033', quantityKg: 500 })],
        { a: entry('fup:1', baseEntry), c: entry('fup:2', { quantityKg: 500 }) }
      )
      const reads = {
        d1: doneRead('d1', [kgCert('L1', 2000), kgCert('L2', 2000), kgCert('Z1', 500, { productName: 'ZINC CATALYST ZN-12' })]),
      }
      const { proposals } = propose(f, FCL, docs, reads)
      return { f, proposals, ids: proposals.filter((proposal) => proposal.applicable).map((proposal) => proposal.id) }
    }

    it('aplica várias propostas de uma vez', () => {
      const { f, proposals, ids } = setup()
      expect(ids).toEqual(['coa|k:fup:1', 'coa|k:fup:2'])
      const result = applyCoaProposals(f, proposals, ids)
      expect(result.error).toBeUndefined()
      expect(result.form.rows.map((item) => item.supplierLot)).toEqual(['L1', 'L2', 'Z1'])
    })

    it('stale: linha do item sumiu desde a leitura -> nada é aplicado (nem a outra proposta)', () => {
      const { f, proposals, ids } = setup()
      const changed = { ...f, rows: f.rows.filter((item) => item.id !== 'a') }
      const result = applyCoaProposals(changed, proposals, ids)
      expect(result.error).toBe('stale')
      expect(result.form).toBe(changed)
      expect(result.form.rows.find((item) => item.id === 'c').supplierLot).toBe('')
    })

    it('stale: edição à mão depois da leitura nunca é sobrescrita sem aparecer na prévia', () => {
      const { f, proposals, ids } = setup()
      const edited = { ...f, rows: f.rows.map((item) => (item.id === 'a' ? { ...item, supplierLot: 'DIGITEI' } : item)) }
      const result = applyCoaProposals(edited, proposals, ids)
      expect(result.error).toBe('stale')
      expect(result.form).toBe(edited)
      // a proposta marcada só da linha intacta continua aplicável
      expect(applyCoaProposals(edited, proposals, ['coa|k:fup:2']).error).toBeUndefined()
    })

    it('limit: passaria de 200 linhas -> nada é aplicado', () => {
      const { f, proposals, ids } = setup()
      const filler = Array.from({ length: CARGO_REPORT_MAX_ROWS - 2 }, (_, index) => row(`f${index}`, { po: '', sqDescription: '', supplierDescription: '', dbcorpCode: '', quantityKg: null, supplierLot: 'X' }))
      const full = { ...f, rows: [...f.rows, ...filler] }
      expect(full.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
      const stale = applyCoaProposals(full, proposals, ids)
      // as linhas dos itens mudaram de índice, mas não de conteúdo: a assinatura segue valendo
      expect(stale.error).toBe('limit')
      expect(stale.form).toBe(full)
      // 199 linhas + 1 troca que cria 1 linha a mais = 200: cabe
      const room = { ...f, rows: [...f.rows, ...filler.slice(1)] }
      expect(room.rows).toHaveLength(CARGO_REPORT_MAX_ROWS - 1)
      expect(applyCoaProposals(room, proposals, ids).error).toBeUndefined()
      expect(applyCoaProposals(room, proposals, ids).form.rows).toHaveLength(CARGO_REPORT_MAX_ROWS)
    })

    it('proposta informativa marcada à força é ignorada', () => {
      const f = makeForm([row('a')])
      const { proposals } = propose(f, FCL, docs, { d1: doneRead('d1', [kgCert('L1', 1, { productName: 'DESCONHECIDO' })]) })
      const only = proposals.find((proposal) => proposal.kind === 'só no COA')
      expect(applyCoaProposals(f, proposals, [only.id]).form).toBe(f)
    })
  })
})
