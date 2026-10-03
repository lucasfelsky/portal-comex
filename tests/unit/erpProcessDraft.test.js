// Conciliacao ERP (DBCorp) x Portal - F3: rascunho de processo a partir do
// embarque "so' no ERP". Funcoes puras, `today` sempre explicito. Fixtures
// 100% sinteticas (prefixo grego, PEDIDO 9nnn, REF `CON DG 9nn-26`).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  ERP_CREATABLE_CATEGORIES,
  ERP_CREATABLE_KINDS,
  ERP_DRAFT_PROCESS_KEYS,
  ERP_STALE_ETD_DAYS,
  buildErpCreationCandidates,
  buildErpCreationRecheck,
  buildProcessDraftFromErpShipment,
  findExistingProcessForErpDraft,
  formatErpCreationAuditTarget,
  formatKgBr,
  formatProcessCount,
  pickErpDraftProcess,
} from '../../src/features/erp/erpProcessDraft.js'
import {
  erpConRefFromName,
  runErpReconciliation,
  toErpReferenceShipment,
} from '../../src/features/erp/reconcileErp.js'
import { normalizeErpItemRows } from '../../src/features/erp/erpItemRow.js'
import { groupErpShipments } from '../../src/features/erp/groupErpShipments.js'
import { parseDbcorpRows } from '../../src/features/erp/parseDbcorpRows.js'
import { deriveProcessStatus } from '../../src/features/processes/deriveProcessStatus.js'
import { getPendingFields } from '../../src/features/processes/pendingFields.js'
import {
  CREATION_SCENARIO_KEYS as K,
  FINANCIAL_SENTINEL_STRINGS,
  FINANCIAL_SENTINELS,
  SCENARIO_TODAY,
  buildCreationScenarioLooseRows,
  looseRowsToMatrix,
  makeLooseRow,
  makePortalProcess,
} from '../fixtures/erp/dbcorpSynthetic.js'
import expectedCounts from '../fixtures/expected-counts.json'

const TODAY = SCENARIO_TODAY
const SOURCE = { id: 'teste', label: 'Fonte de teste' }
// O NUCLEO bloqueia a conciliacao com a lista do Portal vazia: um processo qualquer entra sempre.
const FILLER = makePortalProcess({ id: 'p-filler', name: 'OMEGA SEA 999-26', processNumber: '9999', category: 'FCL' })

function reconcile(looseRows, processes = [FILLER], today = TODAY) {
  const rows = looseRows.map((row, index) => ({ rowNumber: index + 2, ...row }))
  return runErpReconciliation({
    loaded: { rows, warnings: [], meta: { fileName: 'teste.xlsx', rowCount: rows.length } },
    processes,
    today,
    source: SOURCE,
  })
}

function reconcileScenario(processes = [FILLER]) {
  const parsed = parseDbcorpRows(looseRowsToMatrix(buildCreationScenarioLooseRows()))
  return runErpReconciliation({
    loaded: { rows: parsed.rows, warnings: parsed.warnings, meta: { fileName: 'x.xlsx', rowCount: parsed.rows.length } },
    processes,
    today: TODAY,
    source: SOURCE,
  })
}

const candidatesOf = (looseRows, processes) => buildErpCreationCandidates(reconcile(looseRows, processes), { today: TODAY, processes: processes ?? [FILLER] })
const scenarioCandidates = (processes = [FILLER]) =>
  buildErpCreationCandidates(reconcileScenario(processes), { today: TODAY, processes })
const byName = (candidates, name) => {
  const found = candidates.find((candidate) => candidate.process.name === name)
  expect(found, name).toBeDefined()
  return found
}
const codesOf = (draft) => draft.warnings.map((warning) => warning.code)

// Linha de embarque ainda nao embarcado (AG. EMBARQUE), FCL FOB, para os casos montados no teste.
const booked = (overrides = {}) =>
  makeLooseRow({
    status: 'AG. EMBARQUE',
    exporter: 'ALFA CHEM',
    pedido: 9620,
    poRef: K.fclAgEmbarque,
    refEmbarque: 'FCL - FOB KOBE',
    commercialName: 'RESINA OMEGA',
    quantityKg: 1000,
    ...overrides,
  })

// Recorte do embarque escrito a mao (a forma que `toErpReferenceShipment` devolve).
function shipmentOf(overrides = {}) {
  const { transport = {}, ...rest } = overrides
  return {
    kind: 'FCL',
    portalCategory: 'FCL',
    key: 'ALFA SEA 962-26',
    incoterm: '',
    originHint: '',
    stage: 0,
    statuses: ['AG. EMBARQUE'],
    statusNf: [],
    orders: [{ pedido: '9620', poRef: 'ALFA SEA 962-26', poBase: '', exporter: 'ALFA CHEM' }],
    items: [{ commercialName: 'RESINA OMEGA', pedido: '9620', quantityKg: 1000 }],
    transport: {
      etd: '', eta: '', vessel: { name: '', raw: '', voyage: '' }, blAwb: '', origin: '', destination: '',
      diNumber: '', diDate: '', ...transport,
    },
    conflicts: [],
    ...rest,
  }
}

describe('constantes', () => {
  it('o rascunho tem 18 chaves, so as 2 categorias e os 3 tipos criaveis e o limiar de 30 dias', () => {
    expect(ERP_DRAFT_PROCESS_KEYS).toHaveLength(18)
    expect(new Set(ERP_DRAFT_PROCESS_KEYS).size).toBe(18)
    expect(ERP_CREATABLE_CATEGORIES).toEqual(['aguardando_embarque', 'embarcado_sem_processo'])
    expect(ERP_CREATABLE_KINDS).toEqual(['FCL', 'LCL', 'CONSOLIDADO'])
    expect(ERP_STALE_ETD_DAYS).toBe(30)
  })
})

describe('buildProcessDraftFromErpShipment', () => {
  it('caso-real: CR-47 FCL: nome = PO, PEDIDO, fornecedor, destino em maiusculas, incoterm, ETD/ETA ISO, BL em houseBl e itens em kg', () => {
    const draft = byName(scenarioCandidates(), K.fclAgEmbarque)
    expect(draft).toMatchObject({
      key: `FCL|${K.fclAgEmbarque}`, shipmentKey: K.fclAgEmbarque, kind: 'FCL', category: 'FCL',
      erpCategory: 'aguardando_embarque', creatable: true, blockReason: '', existingName: '', needsReview: false,
    })
    expect(draft.process).toEqual({
      name: K.fclAgEmbarque,
      category: 'FCL',
      processNumber: '9620',
      purchaseOrders: [],
      supplierName: 'ALFA CHEM',
      originLocation: 'KOBE',
      destination: 'ITAJAÍ',
      incoterm: 'FOB',
      vesselName: '',
      voyage: '',
      etd: '2026-10-20',
      eta: '2026-11-25',
      shippedAt: '',
      masterBl: '',
      houseBl: 'HBL-962',
      duimpNumber: '',
      duimpRegisteredAt: '',
      items: [
        { commercialName: 'RESINA OMEGA', quantity: 1000 },
        { commercialName: 'SOLVENTE PI', quantity: 500.5 },
      ],
    })
    expect(draft.preview).toMatchObject({
      badge: 'FCL', name: K.fclAgEmbarque, supplierLabel: 'ALFA CHEM', itemCount: 2, totalKg: 1500.5,
      shipped: false, duimp: false, orderLabels: ['PEDIDO 9620'],
    })
    expect(formatKgBr(draft.preview.totalKg)).toBe('1.500,5')
    // O navio so' aparece quando o ERP trouxe: este nao trouxe.
    const vessel = byName(scenarioCandidates(), K.fclEmbarcouComDi)
    expect(vessel.process).toMatchObject({ vesselName: 'ALFA MAERSK', voyage: '639W', originLocation: 'HAMBURG' })
    expect(vessel.preview.vesselLabel).toBe('ALFA MAERSK / 639W')
  })

  it('caso-real: CR-48 LCL: BL em houseBl (masterBl vazio) e, com o getPendingFields real, pallets, peso bruto e cubagem pendentes', () => {
    const draft = byName(scenarioCandidates(), K.lclAgEmbarque)
    expect(draft.category).toBe('LCL')
    expect(draft.preview.badge).toBe('LCL')
    expect(draft.process).toMatchObject({ houseBl: 'HBL-963', masterBl: '', destination: 'NAVEGANTES', incoterm: 'FOB', originLocation: 'NINGBO' })
    const labels = getPendingFields(draft.process).map((field) => field.label)
    expect(labels).toEqual(expect.arrayContaining(['Quantidade de pallets', 'Peso bruto', 'Cubagem']))
    expect(labels).not.toContain('Incoterm')
  })

  it('caso-real: CR-49 CON: purchaseOrders {po, reference, supplierName}, itens com poNumber de uma das POs, sem fornecedor nem incoterm', () => {
    const draft = byName(scenarioCandidates(), K.con)
    expect(draft).toMatchObject({ kind: 'CONSOLIDADO', category: 'CONSOLIDADO', creatable: true })
    expect(draft.preview.badge).toBe('CON')
    expect(draft.process).toMatchObject({
      name: 'CON DG 964-26', category: 'CONSOLIDADO', processNumber: '', supplierName: '', incoterm: '',
      houseBl: 'HBL-964', masterBl: '', originLocation: 'SHANGHAI', destination: 'NAVEGANTES',
    })
    expect(draft.process.purchaseOrders).toEqual([
      { po: '9640', reference: 'GAMA SEA 964-26', supplierName: 'GAMA TRADING' },
      { po: '9641', reference: 'DELTA SEA 965-26', supplierName: 'DELTA CHEM' },
      { po: '9642', reference: 'EPSILON SEA 966-26', supplierName: 'EPSILON TRADING' },
    ])
    const poSet = draft.process.purchaseOrders.map((order) => order.po)
    expect(draft.process.items.every((item) => poSet.includes(item.poNumber))).toBe(true)
    // Itens de mesmo nome em 2 PEDIDOs continuam separados.
    expect(draft.process.items).toEqual([
      { commercialName: 'SOLVENTE PI', quantity: 2000, poNumber: '9640' },
      { commercialName: 'SOLVENTE PI', quantity: 1500, poNumber: '9641' },
      { commercialName: 'ACIDO PSI', quantity: 800, poNumber: '9642' },
    ])
    expect(draft.preview.orderLabels).toEqual(['9640 (GAMA SEA 964-26)', '9641 (DELTA SEA 965-26)', '9642 (EPSILON SEA 966-26)'])
    const labels = getPendingFields(draft.process).map((field) => field.label)
    expect(labels).toEqual(expect.arrayContaining(['Contêineres (mín. 1)', 'Incoterm']))
  })

  it('caso-real: CR-50 EMBARCOU: shippedAt = ETD, status "Embarcou" (ETA futura) ou "Aguardando atracação" (ETA <= hoje); ETD futuro avisa; com BL, sem pendencia houseBl', () => {
    const draft = byName(scenarioCandidates(), K.fclEmbarcouComDi)
    expect(draft.erpCategory).toBe('embarcado_sem_processo')
    expect(draft.process.shippedAt).toBe('2026-09-28')
    expect(draft.process.shippedAt).toBe(draft.process.etd)
    expect(draft.preview.shipped).toBe(true)
    expect(deriveProcessStatus(draft.process, new Date(2026, 9, 2, 12, 0, 0))).toBe('Aguardando parametrização da DUIMP')
    // Sem DUIMP no rascunho, o status mostra a viagem: ETA futura = Embarcou, ETA <= hoje = Aguardando atracacao.
    const semDi = { ...draft.process, duimpNumber: '', duimpRegisteredAt: '' }
    expect(deriveProcessStatus(semDi, new Date(2026, 9, 2, 12, 0, 0))).toBe('Embarcou')
    expect(deriveProcessStatus(semDi, new Date(2026, 9, 25, 12, 0, 0))).toBe('Aguardando atracação')
    expect(getPendingFields({ ...draft.process, processStatus: 'Embarcou' }).map((field) => field.id)).not.toContain('houseBl')
    expect(codesOf(draft)).not.toContain('etd_futuro_embarcado')

    const future = buildProcessDraftFromErpShipment(
      shipmentOf({ stage: 1, transport: { etd: '2026-10-09', eta: '2026-11-01' } }),
      { today: TODAY, erpCategory: 'embarcado_sem_processo' }
    )
    expect(future.process.shippedAt).toBe('2026-10-09')
    expect(codesOf(future)).toContain('etd_futuro_embarcado')
    // Sem ERP embarcado, o BL ausente vira pendencia.
    const semBl = { ...draft.process, houseBl: '', processStatus: 'Embarcou' }
    expect(getPendingFields(semBl).map((field) => field.id)).toContain('houseBl')
  })

  it('caso-real: CR-51 DUIMP: DI completa preenche numero e data (T00:00); AG. EMBARQUE + DI vira aviso; so o numero ou so a data vira aviso', () => {
    const draft = byName(scenarioCandidates(), K.fclEmbarcouComDi)
    expect(draft.process.duimpNumber).toBe('25/1234567-8')
    expect(draft.process.duimpRegisteredAt).toMatch(/^\d{4}-\d{2}-\d{2}T00:00$/)
    expect(draft.process.duimpRegisteredAt).toBe('2026-10-01T00:00')
    expect(draft.preview.duimp).toBe(true)

    const booking = buildProcessDraftFromErpShipment(
      shipmentOf({ stage: 0, transport: { diNumber: 'DI-1', diDate: '2026-10-01' } }),
      { today: TODAY, erpCategory: 'aguardando_embarque' }
    )
    expect(booking.process).toMatchObject({ duimpNumber: '', duimpRegisteredAt: '' })
    expect(codesOf(booking)).toEqual(['di_sem_embarque'])

    const onlyNumber = buildProcessDraftFromErpShipment(
      shipmentOf({ stage: 1, transport: { etd: '2026-09-28', eta: '2026-10-20', diNumber: 'DI-1' } }),
      { today: TODAY }
    )
    expect(onlyNumber.process).toMatchObject({ duimpNumber: '', duimpRegisteredAt: '', shippedAt: '2026-09-28' })
    expect(codesOf(onlyNumber)).toEqual(['di_incompleta'])
    const onlyDate = buildProcessDraftFromErpShipment(
      shipmentOf({ stage: 1, transport: { etd: '2026-09-28', eta: '2026-10-20', diDate: '2026-10-01' } }),
      { today: TODAY }
    )
    expect(codesOf(onlyDate)).toEqual(['di_incompleta'])
  })

  it('caso-real: CR-52 conflito: ETD e navio ficam vazios com campo_em_conflito; EMBARCOU com ETD em conflito nao confirma o embarque; BL em conflito vira houseBl vazio', () => {
    const draft = byName(scenarioCandidates(), K.fclConflito)
    expect(draft.process).toMatchObject({ etd: '', vesselName: '', voyage: '', shippedAt: '', houseBl: 'HBL-969' })
    const conflicts = draft.warnings.filter((warning) => warning.code === 'campo_em_conflito')
    expect(conflicts).toHaveLength(2)
    expect(conflicts.map((warning) => warning.message).join('\n')).toMatch(/ETD com valores diferentes no ERP \(2026-09-25 \| 2026-09-26\): não preenchido\./)
    expect(conflicts.map((warning) => warning.message).join('\n')).toMatch(/Navio \/ viagem com valores diferentes/)
    expect(codesOf(draft)).toContain('embarcou_sem_etd')
    expect(draft.preview.shipped).toBe(false)

    const blConflict = buildProcessDraftFromErpShipment(
      shipmentOf({ conflicts: [{ field: 'blAwb', values: ['HBL-A', 'HBL-B'] }] }),
      { today: TODAY }
    )
    expect(blConflict.process).toMatchObject({ houseBl: '', masterBl: '' })
    expect(codesOf(blConflict)).toEqual(['campo_em_conflito'])
  })

  it('caso-real: CR-53 nada financeiro: nenhuma sentinela do xlsx no resultado; so as 18 chaves, todas na allowlist de criacao do admin', () => {
    const matrix = looseRowsToMatrix(buildCreationScenarioLooseRows())
    // Controle positivo: a matriz do xlsx TEM as sentinelas financeiras.
    expect(JSON.stringify(matrix)).toContain(FINANCIAL_SENTINELS.text)
    const candidates = buildErpCreationCandidates(reconcileScenario(), { today: TODAY, processes: [FILLER] })
    expect(candidates.length).toBeGreaterThan(0)
    const text = JSON.stringify(candidates)
    for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(text).not.toContain(sentinel)
    const allowlist = expectedCounts.firestoreAllowlists.isAdminProcessFields
    expect(allowlist).toHaveLength(81)
    for (const candidate of candidates) {
      expect(Object.keys(candidate.process).sort(), candidate.key).toEqual([...ERP_DRAFT_PROCESS_KEYS].sort())
      for (const key of Object.keys(candidate.process)) expect(allowlist, key).toContain(key)
    }
  })

  it('caso-real: CR-57 FCL com 2 PEDIDOs usa o menor e avisa; 2 exportadores deixam o fornecedor vazio e avisam', () => {
    const draft = byName(scenarioCandidates(), K.fclDoisPedidos)
    expect(draft.process).toMatchObject({ processNumber: '9840', supplierName: '' })
    expect(draft.warnings.find((warning) => warning.code === 'pedidos_multiplos').message).toContain('9840, 9841')
    expect(draft.warnings.find((warning) => warning.code === 'fornecedores_diferentes').message).toContain('KAPPA CHEM')
    expect(draft.preview.orderLabels).toEqual(['PEDIDO 9840', 'PEDIDO 9841'])
    expect(draft.preview.supplierLabel).toBe('KAPPA TRADING, KAPPA CHEM')
    // Cada linha do ERP e' um item (sem somar).
    expect(draft.process.items).toHaveLength(2)
  })

  it('caso-real: CR-58 estagio 2 (atracado no ERP): so shippedAt e o aviso, nunca berthed/berthedAt', () => {
    const draft = byName(scenarioCandidates(), K.fclAtracado)
    expect(draft.process.shippedAt).toBe('2026-09-10')
    expect(codesOf(draft)).toContain('atracado_no_erp')
    expect(draft.process).not.toHaveProperty('berthed')
    expect(draft.process).not.toHaveProperty('berthedAt')
    expect(Object.keys(draft.process)).toHaveLength(18)
  })

  it('caso-real: CR-62 origem e destino: Itajai vira ITAJAI com acento; ORIGEM preenchida vence a dica; FOB sem ORIGEM usa o local; CFR sem ORIGEM fica vazio', () => {
    expect(byName(scenarioCandidates(), K.fclAgEmbarque).process.destination).toBe('ITAJAÍ')
    const [withOrigin] = candidatesOf([booked({ itemId: 'O-1', origin: 'BUSAN', refEmbarque: 'FCL - FOB KOBE' })])
    expect(withOrigin.process.originLocation).toBe('BUSAN')
    const [fob] = candidatesOf([booked({ itemId: 'O-2', refEmbarque: 'FCL - FOB NINGBO' })])
    expect(fob.process.originLocation).toBe('NINGBO')
    const [cfr] = candidatesOf([booked({ itemId: 'O-3', refEmbarque: 'FCL - CFR HAMBURG' })])
    expect(cfr.process.originLocation).toBe('')
    expect(cfr.process.incoterm).toBe('CFR')
  })

  it('caso-real: CR-63 sem PO: FCL sem PO nao e criavel (sem_po)', () => {
    const [draft] = candidatesOf([booked({ itemId: 'P-1', poRef: '' })])
    expect(draft).toMatchObject({ creatable: false, blockReason: 'sem_po' })
    expect(draft.process.name).toBe('')
  })

  it('caso-real: CR-63 CON com 51 PEDIDOs nao e criavel (pos_demais); com 50 e criavel', () => {
    const conRows = (count) =>
      Array.from({ length: count }, (_, index) =>
        booked({
          itemId: `L-${index}`, pedido: 9100 + index, poRef: `ALFA SEA ${900 + index}-26`, refEmbarque: 'CON DG 996-26',
        })
      )
    const [many] = candidatesOf(conRows(51))
    expect(many).toMatchObject({ category: 'CONSOLIDADO', creatable: false, blockReason: 'pos_demais' })
    const [limit] = candidatesOf(conRows(50))
    expect(limit).toMatchObject({ creatable: true, blockReason: '' })
    expect(limit.process.purchaseOrders).toHaveLength(50)
  })

  it('caso-real: CR-63 CON com 1 PO: avisa consolidado_com_1_po e continua criavel', () => {
    const [draft] = candidatesOf([booked({ itemId: 'C-1', refEmbarque: 'CON DG 996-26' })])
    expect(draft).toMatchObject({ category: 'CONSOLIDADO', creatable: true })
    expect(codesOf(draft)).toContain('consolidado_com_1_po')
    expect(getPendingFields(draft.process).map((field) => field.label)).toContain('POs consolidadas (mín. 2)')
  })

  it('caso-real: CR-63 PEDIDO repetido no CON (por digitos): 1 PO e o item remapeado para ela', () => {
    const rows = [
      booked({ itemId: 'R-1', pedido: 9620, poRef: 'ALFA SEA 962-26', refEmbarque: 'CON DG 996-26', commercialName: 'RESINA OMEGA', quantityKg: 10 }),
      booked({ itemId: 'R-2', pedido: 'PED 9620', poRef: 'BETA SEA 963-26', refEmbarque: 'CON DG 996-26', commercialName: 'SOLVENTE PI', quantityKg: 20 }),
      booked({ itemId: 'R-3', pedido: 9630, poRef: 'GAMA SEA 964-26', refEmbarque: 'CON DG 996-26', commercialName: 'ACIDO PSI', quantityKg: 30 }),
    ]
    const [draft] = candidatesOf(rows)
    expect(codesOf(draft)).toContain('po_repetida_no_consolidado')
    expect(draft.process.purchaseOrders.map((order) => order.po)).toEqual(['9620', '9630'])
    const solvent = draft.process.items.find((item) => item.commercialName === 'SOLVENTE PI')
    expect(solvent.poNumber).toBe('9620')
    expect(draft.process.items.every((item) => draft.process.purchaseOrders.some((order) => order.po === item.poNumber))).toBe(true)
  })

  it('caso-real: CR-63 item sem quantidade grava 0 e avisa; item sem nome avisa', () => {
    const [noQuantity] = candidatesOf([booked({ itemId: 'Q-1', quantityKg: '' })])
    expect(codesOf(noQuantity)).toContain('item_sem_quantidade')
    expect(noQuantity.process.items).toEqual([{ commercialName: 'RESINA OMEGA', quantity: 0 }])
    const [noName] = candidatesOf([booked({ itemId: 'Q-2', commercialName: '' })])
    expect(codesOf(noName)).toContain('item_sem_nome')
    expect(codesOf(noName)).not.toContain('item_sem_quantidade')
  })

  it('caso-real: CR-63 incoterm: vazio fica vazio sem aviso; fora da lista vira vazio com incoterm_invalido; em conflito so avisa o conflito', () => {
    const [empty] = candidatesOf([booked({ itemId: 'I-1', refEmbarque: 'FCL - HAMBURG' })])
    expect(empty.process.incoterm).toBe('')
    expect(empty.warnings).toEqual([])
    expect(getPendingFields(empty.process).map((field) => field.label)).toContain('Incoterm')

    const invalid = buildProcessDraftFromErpShipment(shipmentOf({ incoterm: 'XYZ' }), { today: TODAY })
    expect(invalid.process.incoterm).toBe('')
    expect(codesOf(invalid)).toEqual(['incoterm_invalido'])
    const valid = buildProcessDraftFromErpShipment(shipmentOf({ incoterm: 'DAP' }), { today: TODAY })
    expect(valid.process.incoterm).toBe('DAP')
    expect(valid.warnings).toEqual([])

    const [conflict] = candidatesOf([
      booked({ itemId: 'I-2', refEmbarque: 'FCL - FOB KOBE' }),
      booked({ itemId: 'I-3', refEmbarque: 'FCL - CFR HAMBURG' }),
    ])
    expect(conflict.process.incoterm).toBe('')
    expect(codesOf(conflict)).not.toContain('incoterm_invalido')
    expect(conflict.warnings.filter((warning) => warning.code === 'campo_em_conflito').map((warning) => warning.message).join('\n')).toContain('Incoterm com valores diferentes')
  })

  it('caso-real: CR-64 conferir antes: ERP embarcado sem ETA, estagio 0 com ETA ontem ou com ETD ha 31 dias exigem conferencia (continuam criaveis)', () => {
    const lambda = byName(scenarioCandidates(), K.fclSemEta)
    expect(lambda).toMatchObject({ needsReview: true, creatable: true })
    expect(codesOf(lambda)).toContain('confira_se_ja_recebido')

    const [etaYesterday] = candidatesOf([booked({ itemId: 'V-1', etd: '2026-09-30', eta: '2026-10-01' })])
    expect(etaYesterday).toMatchObject({ needsReview: true, creatable: true })
    expect(codesOf(etaYesterday)).toContain('confira_se_ja_recebido')

    const [etd31] = candidatesOf([booked({ itemId: 'V-2', etd: '2026-09-01' })])
    expect(etd31).toMatchObject({ needsReview: true, creatable: true })
    expect(codesOf(etd31)).toContain('confira_se_ja_recebido')

    const [etd30] = candidatesOf([booked({ itemId: 'V-3', etd: '2026-09-02' })])
    expect(etd30).toMatchObject({ needsReview: false, creatable: true })
    expect(codesOf(etd30)).not.toContain('confira_se_ja_recebido')
    // Controle: o cenario normal (ETD e ETA futuros) nao pede conferencia.
    expect(byName(scenarioCandidates(), K.fclAgEmbarque).needsReview).toBe(false)
  })
})

describe('buildErpCreationCandidates', () => {
  it('caso-real: CR-54 so as 2 categorias entram; as 7 excluidas nao aparecem; o AEREO aparece nao criavel (tipo_nao_criavel)', () => {
    const candidates = scenarioCandidates()
    expect(candidates.map((candidate) => candidate.shipmentKey)).toEqual([
      K.aereo, K.con, K.fclAgEmbarque, K.fclDoisPedidos, K.lclAgEmbarque,
      K.fclConflito, K.fclSemEta, K.fclAtracado, K.fclEmbarcouComDi,
    ])
    expect(new Set(candidates.map((candidate) => candidate.erpCategory))).toEqual(new Set(ERP_CREATABLE_CATEGORIES))
    const excluded = [
      K.aConsolidar, K.aguardandoProntidao, K.amostra, K.nacional, K.erpDesatualizado, K.possivelmenteRecebido, K.indefinido,
    ]
    for (const key of excluded) expect(candidates.map((candidate) => candidate.shipmentKey)).not.toContain(key)
    const aereo = candidates.find((candidate) => candidate.shipmentKey === K.aereo)
    expect(aereo).toMatchObject({ creatable: false, blockReason: 'tipo_nao_criavel', category: '' })
    expect(candidates.filter((candidate) => candidate.creatable)).toHaveLength(8)
    expect(candidates.find((candidate) => candidate.creatable === false && candidate !== aereo)).toBeUndefined()
    expect(candidates.every((candidate) => ['aguardando_embarque', 'embarcado_sem_processo'].includes(candidate.erpCategory))).toBe(true)
    expect(candidates.find((candidate) => candidate.shipmentKey === K.fclAgEmbarque).erpCategoryLabel).toBe('Aguardando embarque')
    // Resultado bloqueado -> nenhum candidato.
    const blocked = reconcile([booked({ itemId: 'B-1' })], [])
    expect(blocked.blocked).toBe('lista_portal_vazia')
    expect(buildErpCreationCandidates(blocked, { today: TODAY, processes: [] })).toEqual([])
    expect(buildErpCreationCandidates(null, { today: TODAY })).toEqual([])
  })

  it('caso-real: CR-55 ida e volta: criar os rascunhos e conciliar de novo os deixa casados (pedido / consolidado:ref), sem divergencia, e fora dos candidatos', () => {
    const candidates = scenarioCandidates()
    const creatable = candidates.filter((candidate) => candidate.creatable)
    const asOf = new Date(2026, 9, 2, 12, 0, 0)
    const created = creatable.map((candidate, index) => {
      const process = {
        ...makePortalProcess({ id: `PROC-${index + 1}` }),
        ...candidate.process,
        items: candidate.process.items.map((item, itemIndex) => ({ id: `it-${index}-${itemIndex}`, ...item })),
      }
      return { ...process, processStatus: deriveProcessStatus(process, asOf) }
    })
    const processes = [FILLER, ...created]
    const next = reconcileScenario(processes)
    expect(next.matched).toHaveLength(8)
    const rules = Object.fromEntries(next.matched.map((entry) => [entry.processName, entry.matchRule]))
    for (const candidate of creatable) {
      expect(rules[candidate.process.name], candidate.process.name).toBe(candidate.category === 'CONSOLIDADO' ? 'consolidado:ref' : 'pedido')
    }
    for (const entry of next.matched) {
      expect(entry.diffs.filter((diff) => diff.kind === 'divergente'), entry.processName).toEqual([])
    }
    const bl = next.matched.find((entry) => entry.processName === K.fclAgEmbarque).diffs.find((diff) => diff.field === 'bl')
    expect(bl).toMatchObject({ kind: 'informativo', matchedField: 'houseBl' })

    const after = buildErpCreationCandidates(next, { today: TODAY, processes })
    expect(after.map((candidate) => candidate.shipmentKey)).toEqual([K.aereo])
    const recheck = buildErpCreationRecheck(next, { today: TODAY, processes })
    for (const candidate of creatable) {
      expect(recheck.get(candidate.key), candidate.key).toMatchObject({ creatable: false, reason: 'casado' })
    }
    expect(recheck.get(`FCL|${K.fclAgEmbarque}`).existingName).toBe(K.fclAgEmbarque)
  })

  it('caso-real: CR-65 PEDIDO em outro embarque: PO dividida (.1/.2) no mesmo tipo bloqueia as 2 partes; o padrao CON + LCL do mesmo PEDIDO nao bloqueia', () => {
    const split = candidatesOf([
      booked({ itemId: 'D-1', poRef: 'ALFA SEA 962-26.1', refEmbarque: 'LCL - FOB NINGBO' }),
      booked({ itemId: 'D-2', poRef: 'ALFA SEA 962-26.2', refEmbarque: 'LCL - FOB NINGBO' }),
    ])
    expect(split).toHaveLength(2)
    for (const draft of split) {
      expect(draft).toMatchObject({ creatable: false, blockReason: 'pedido_em_outro_embarque' })
      expect(codesOf(draft)).toContain('po_dividida')
    }
    expect(split.map((draft) => draft.existingName)).toEqual(['ALFA SEA 962-26.2', 'ALFA SEA 962-26.1'])

    // Padrao do CR-06: a parte .1 no CON e a .2 no LCL (tipos diferentes): os 2 sao criaveis.
    const mixed = candidatesOf([
      booked({ itemId: 'M-1', poRef: 'ALFA SEA 962-26.1', refEmbarque: 'CON DG 996-26' }),
      booked({ itemId: 'M-2', poRef: 'ALFA SEA 962-26.2', refEmbarque: 'LCL - FOB NINGBO' }),
    ])
    expect(mixed.map((draft) => [draft.kind, draft.creatable])).toEqual([['CONSOLIDADO', true], ['LCL', true]])

    // Um FCL que divide o PEDIDO com um FCL ja casado fica bloqueado e cita o processo casado.
    const rows = [
      booked({ itemId: 'F-1', poRef: 'ALFA SEA 962-26.1' }),
      booked({ itemId: 'F-2', poRef: 'ALFA SEA 962-26.2' }),
    ]
    const processes = [
      FILLER,
      makePortalProcess({ id: 'p-parte1', name: 'ALFA SEA 962-26.1', processNumber: '9620', category: 'FCL' }),
    ]
    const result = reconcile(rows, processes)
    expect(result.matched.map((entry) => entry.shipmentKey)).toEqual(['ALFA SEA 962-26.1'])
    const [blocked] = buildErpCreationCandidates(result, { today: TODAY, processes })
    expect(blocked).toMatchObject({
      shipmentKey: 'ALFA SEA 962-26.2', creatable: false, blockReason: 'pedido_em_outro_embarque',
      existingName: 'ALFA SEA 962-26.1',
    })
  })

  it('caso-real: CR-66 lista atual: um processo com o nome da PO (PEDIDO diferente) bloqueia como ja_existe_no_portal e cita o nome', () => {
    // A conciliacao e' a ANTIGA (sem o processo); a lista atual, relida do servidor, ja traz um processo com o nome da PO.
    const fresh = [FILLER, makePortalProcess({ id: 'p-nome', name: 'alfa sea 962-26', processNumber: '1111', category: 'FCL' })]
    const candidates = buildErpCreationCandidates(reconcileScenario(), { today: TODAY, processes: fresh })
    const draft = byName(candidates, K.fclAgEmbarque)
    expect(draft).toMatchObject({ creatable: false, blockReason: 'ja_existe_no_portal', existingName: 'alfa sea 962-26' })
    expect(byName(candidates, K.lclAgEmbarque).creatable).toBe(true)
  })

  it('caso-real: CR-66 reconferencia: o embarque ja casado sai criavel false (casado) e os demais continuam; resultado bloqueado devolve Map vazio', () => {
    const fresh = [FILLER, makePortalProcess({ id: 'p-novo', name: K.lclAgEmbarque, processNumber: '9630', category: 'LCL' })]
    const recheck = buildErpCreationRecheck(reconcileScenario(fresh), { today: TODAY, processes: fresh })
    expect(recheck.get(`LCL|${K.lclAgEmbarque}`)).toEqual({ creatable: false, reason: 'casado', existingName: K.lclAgEmbarque })
    expect(recheck.get(`FCL|${K.fclAgEmbarque}`)).toEqual({ creatable: true, reason: '', existingName: '' })
    expect(recheck.get(`CONSOLIDADO|${K.con}`)).toMatchObject({ creatable: true })
    expect(recheck.get(`AEREO|${K.aereo}`)).toMatchObject({ creatable: false, reason: 'tipo_nao_criavel' })
    const blocked = reconcile([booked({ itemId: 'B-1' })], [])
    expect(buildErpCreationRecheck(blocked, { today: TODAY, processes: [] }).size).toBe(0)
  })

  it('caso-real: CR-66 processo do Portal sem embarque casado (portalOnly) com o mesmo PEDIDO ou nome bloqueia a criacao: nao duplica um FCL gravado como consolidado', () => {
    // FCL do ERP (PEDIDO 9620, PO ALFA SEA 962-26) ja gravado no Portal como CONSOLIDADO, sem REF no nome.
    const legacyByPo = makePortalProcess({
      id: 'p-legado', name: 'PROCESSO LEGADO', category: 'CONSOLIDADO', processNumber: '',
      purchaseOrders: [{ po: '9620', reference: '', supplierName: '' }],
    })
    const processes = [FILLER, legacyByPo]
    const result = reconcile([booked({ itemId: 'P-1' })], processes)
    // Pre-condicao: a conciliacao nao casou (portalOnly) e a identidade antiga nao o acha.
    expect(result.matched).toEqual([])
    expect(result.portalOnly.map((entry) => entry.processName)).toContain('PROCESSO LEGADO')
    const [baseDraft] = candidatesOf([booked({ itemId: 'P-1' })])
    expect(findExistingProcessForErpDraft(baseDraft, processes)).toBeNull()

    const [draft] = buildErpCreationCandidates(result, { today: TODAY, processes })
    expect(draft).toMatchObject({ shipmentKey: K.fclAgEmbarque, creatable: false, blockReason: 'ja_existe_no_portal', existingName: 'PROCESSO LEGADO' })
    expect(buildErpCreationRecheck(result, { today: TODAY, processes }).get(`FCL|${K.fclAgEmbarque}`)).toEqual({
      creatable: false, reason: 'ja_existe_no_portal', existingName: 'PROCESSO LEGADO',
    })

    // Pelo nome (PO), em qualquer caixa e em qualquer tipo, sem PEDIDO nem POs.
    const legacyByName = makePortalProcess({ id: 'p-nome', name: 'alfa sea 962-26', category: 'CONSOLIDADO', processNumber: '' })
    const byName = [FILLER, legacyByName]
    const [named] = buildErpCreationCandidates(reconcile([booked({ itemId: 'P-2' })], byName), { today: TODAY, processes: byName })
    expect(named).toMatchObject({ creatable: false, blockReason: 'ja_existe_no_portal', existingName: 'alfa sea 962-26' })

    // Pelo PEDIDO gravado em `processNumber` de um processo arquivado sem embarque casado.
    const archived = makePortalProcess({ id: 'p-arq', name: 'PROCESSO ARQUIVADO', category: 'CONSOLIDADO', processNumber: 'PED 9620', archived: true })
    const byNumber = [FILLER, archived]
    const result3 = reconcile([booked({ itemId: 'P-3' })], byNumber)
    expect(result3.portalOnly.map((entry) => entry.processName)).toContain('PROCESSO ARQUIVADO')
    const [numbered] = buildErpCreationCandidates(result3, { today: TODAY, processes: byNumber })
    expect(numbered).toMatchObject({ creatable: false, blockReason: 'ja_existe_no_portal', existingName: 'PROCESSO ARQUIVADO' })

    // Qualquer PEDIDO do embarque vale, nao so' o menor que vira `processNumber`.
    const multi = [
      booked({ itemId: 'P-4', pedido: 9620 }),
      booked({ itemId: 'P-5', pedido: 9621, poRef: K.fclAgEmbarque }),
    ]
    const legacyByOther = makePortalProcess({
      id: 'p-outro', name: 'PROCESSO OUTRO', category: 'CONSOLIDADO', purchaseOrders: [{ po: '9621', reference: '', supplierName: '' }],
    })
    const byOther = [FILLER, legacyByOther]
    const [other] = buildErpCreationCandidates(reconcile(multi, byOther), { today: TODAY, processes: byOther })
    expect(other.process.processNumber).toBe('9620')
    expect(other).toMatchObject({ creatable: false, blockReason: 'ja_existe_no_portal', existingName: 'PROCESSO OUTRO' })
  })

  it('caso-real: CR-66 portalOnly sem relacao com o embarque (outro PEDIDO e outro nome) nao bloqueia; o consolidado so e bloqueado pelo PEDIDO de uma das suas POs', () => {
    // O FILLER (PEDIDO 9999) fica em portalOnly em quase todo teste e nunca bloqueia nada.
    const result = reconcileScenario()
    expect(result.portalOnly.map((entry) => entry.processName)).toEqual([FILLER.name])
    expect(scenarioCandidates().filter((candidate) => candidate.creatable)).toHaveLength(8)

    // Consolidado: processo sem embarque casado com o PEDIDO de uma das POs do ERP bloqueia.
    const legacyCon = makePortalProcess({
      id: 'p-con', name: 'PROCESSO CON LEGADO', category: 'FCL', processNumber: '',
      purchaseOrders: [{ po: '9641', reference: '', supplierName: '' }],
    })
    const processes = [FILLER, legacyCon]
    const rows = [
      booked({ itemId: 'C-1', pedido: 9640, poRef: 'GAMA SEA 964-26', refEmbarque: K.con }),
      booked({ itemId: 'C-2', pedido: 9641, poRef: 'DELTA SEA 965-26', refEmbarque: K.con }),
    ]
    const conResult = reconcile(rows, processes)
    expect(conResult.matched).toEqual([])
    expect(conResult.portalOnly.map((entry) => entry.processName)).toContain('PROCESSO CON LEGADO')
    const [con] = buildErpCreationCandidates(conResult, { today: TODAY, processes })
    expect(con).toMatchObject({ kind: 'CONSOLIDADO', creatable: false, blockReason: 'ja_existe_no_portal', existingName: 'PROCESSO CON LEGADO' })

    // Limite conhecido: consolidado gravado com REF de outra serie e sem POs nao tem PEDIDO nem nome para casar; o painel avisa.
    const wrongSeries = makePortalProcess({ id: 'p-cn', name: 'CON CN 964-26', category: 'CONSOLIDADO', purchaseOrders: [] })
    const wrong = [FILLER, wrongSeries]
    const wrongResult = reconcile(rows, wrong)
    expect(wrongResult.portalOnly.map((entry) => entry.processName)).toContain('CON CN 964-26')
    expect(buildErpCreationCandidates(wrongResult, { today: TODAY, processes: wrong })[0]).toMatchObject({ kind: 'CONSOLIDADO', creatable: true })
  })

  it('o erpOnly traz o recorte do embarque (igual a toErpReferenceShipment) e a REF canonica sai de erpConRefFromName', () => {
    const rows = buildCreationScenarioLooseRows().map((row, index) => ({ rowNumber: index + 2, ...row }))
    const result = reconcile(buildCreationScenarioLooseRows())
    const grouped = groupErpShipments(normalizeErpItemRows(rows, { source: SOURCE.id }).rows)
    const expected = new Map(grouped.shipments.map((shipment) => [`${shipment.kind}|${shipment.key}`, toErpReferenceShipment(shipment)]))
    expect(result.erpOnly.length).toBeGreaterThan(0)
    for (const item of result.erpOnly) {
      expect(item.referenceShipment, item.shipmentKey).toEqual(expected.get(`${item.kind}|${item.shipmentKey}`))
    }
    expect(erpConRefFromName('Con Dg 962-26 x')).toBe('CON DG 962-26')
    expect(erpConRefFromName('ALFA SEA 962-26')).toBe('')
  })
})

describe('findExistingProcessForErpDraft', () => {
  const fclDraft = { process: { category: 'FCL', name: 'ALFA SEA 962-26', processNumber: '9620' } }
  const conDraft = { process: { category: 'CONSOLIDADO', name: 'CON DG 964-26', processNumber: '' } }

  it('caso-real: CR-56 FCL/LCL casam pelos digitos do PEDIDO ou pelo nome da PO (sem caixa); arquivado conta', () => {
    const byPedido = { id: 'a', name: 'OUTRO NOME', processNumber: 'PO-9620', category: 'FCL' }
    expect(findExistingProcessForErpDraft(fclDraft, [byPedido])).toBe(byPedido)
    const byName = { id: 'b', name: 'alfa sea 962-26', processNumber: '', category: 'FCL' }
    expect(findExistingProcessForErpDraft(fclDraft, [byName])).toBe(byName)
    const archived = { id: 'c', name: 'ALFA SEA 962-26', processNumber: '', category: 'LCL', archived: true }
    expect(findExistingProcessForErpDraft(fclDraft, [archived])).toBe(archived)
    expect(findExistingProcessForErpDraft(fclDraft, [{ id: 'd', name: 'BETA SEA 963-26', processNumber: '9630' }])).toBeNull()
  })

  it('caso-real: CR-56 CON casa pela REF do nome; um processo LCL com o mesmo PEDIDO de uma PO do CON nao e tomado como o CON', () => {
    const con = { id: 'e', name: 'Con Dg 964-26 extra', category: 'CONSOLIDADO' }
    expect(findExistingProcessForErpDraft(conDraft, [con])).toBe(con)
    const lcl = { id: 'f', name: 'GAMA SEA 964-26', processNumber: '9640', category: 'LCL' }
    expect(findExistingProcessForErpDraft(conDraft, [lcl])).toBeNull()
    // E o processo CON nao e' tomado como FCL/LCL de mesmo PEDIDO.
    expect(findExistingProcessForErpDraft({ process: { category: 'LCL', name: 'GAMA SEA 964-26', processNumber: '9640' } }, [con])).toBeNull()
  })

  it('caso-real: CR-56 vazio nunca casa e entrada que nao e objeto e ignorada', () => {
    const blankDraft = { process: { category: 'FCL', name: '', processNumber: '' } }
    expect(findExistingProcessForErpDraft(blankDraft, [{ id: 'g', name: '', processNumber: '' }])).toBeNull()
    expect(findExistingProcessForErpDraft(conDraft, [{ id: 'h', name: '' }])).toBeNull()
    const real = { id: 'i', name: 'ALFA SEA 962-26' }
    expect(findExistingProcessForErpDraft(fclDraft, [null, undefined, 'x', 7, real])).toBe(real)
    expect(findExistingProcessForErpDraft(fclDraft, null)).toBeNull()
    expect(findExistingProcessForErpDraft(null, [real])).toBeNull()
  })
})

describe('pickErpDraftProcess e textos', () => {
  const valid = () => buildProcessDraftFromErpShipment(shipmentOf(), { today: TODAY }).process

  it('caso-real: CR-67 fronteira de forma: categoria AEREO/vazia, nome em branco, items nulo e nulo sao rejeitados', () => {
    for (const bad of [
      { ...valid(), category: 'AEREO' },
      { ...valid(), category: '' },
      { ...valid(), name: '  ' },
      { ...valid(), items: null },
      null,
      undefined,
      'texto',
      [],
    ]) {
      expect(pickErpDraftProcess(bad)).toEqual({ ok: false, reason: 'forma_invalida' })
    }
  })

  it('caso-real: CR-67 chave extra (berthed) passa a fronteira mas sai da saida: so as 18 chaves', () => {
    const picked = pickErpDraftProcess({ ...valid(), berthed: true, berthedAt: '2026-10-01', id: 'PROC-1', processStatus: 'Embarcou' })
    expect(picked.ok).toBe(true)
    expect(Object.keys(picked.process).sort()).toEqual([...ERP_DRAFT_PROCESS_KEYS].sort())
    expect(picked.process).not.toHaveProperty('berthed')
    expect(picked.process).not.toHaveProperty('id')
    // Chave ausente vira vazio (ou lista vazia), nunca undefined.
    const minimal = pickErpDraftProcess({ category: 'LCL', name: 'ALFA SEA 962-26', items: [] })
    expect(minimal.ok).toBe(true)
    expect(Object.values(minimal.process).every((value) => value !== undefined && value !== null)).toBe(true)
    expect(minimal.process.purchaseOrders).toEqual([])
  })

  it('caso-real: CR-67 formatProcessCount e o alvo do audit do lote', () => {
    expect(formatProcessCount(1)).toBe('1 processo')
    expect(formatProcessCount(2)).toBe('2 processos')
    expect(formatProcessCount(0)).toBe('0 processos')

    const one = formatErpCreationAuditTarget([{ key: 'k', id: 'PROC-1', name: 'ALFA SEA 962-26' }])
    expect(one.startsWith('1 processo: ')).toBe(true)
    expect(one).toBe('1 processo: ALFA SEA 962-26 (PROC-1)')
    expect(formatErpCreationAuditTarget([
      { id: 'PROC-1', name: 'ALFA SEA 962-26' },
      { id: 'PROC-2', name: 'BETA SEA 963-26' },
    ])).toBe('2 processos: ALFA SEA 962-26 (PROC-1); BETA SEA 963-26 (PROC-2)')

    const many = Array.from({ length: 60 }, (_, index) => ({
      key: `k${index}`, id: `PROC-${1700000000000 + index}`, name: `GAMA SEA ${900 + index}-26 ${'X'.repeat(30)}`,
    }))
    const target = formatErpCreationAuditTarget(many)
    expect(target.length).toBeLessThanOrEqual(1500)
    expect(target).toMatch(/ \(\+\d+\)$/)
    expect(target.startsWith('60 processos: ')).toBe(true)
    const omitted = Number(/ \(\+(\d+)\)$/.exec(target)[1])
    expect(omitted).toBeGreaterThan(0)
    expect(target.split('; ').length + omitted).toBe(60)
    // Cabe inteiro: sem sufixo.
    expect(formatErpCreationAuditTarget(many.slice(0, 5))).not.toMatch(/\(\+\d+\)$/)
  })

  it('caso-real: CR-67 o alvo do audit do lote leva a observacao do criado com falha so no registro de auditoria e continua dentro de 1500', () => {
    const note = 'falha só no registro de auditoria'
    expect(
      formatErpCreationAuditTarget([
        { key: 'a', id: 'PROC-1', name: 'ALFA SEA 962-26' },
        { key: 'b', id: 'PROC-2', name: 'BETA SEA 963-26', note },
      ])
    ).toBe(`2 processos: ALFA SEA 962-26 (PROC-1); BETA SEA 963-26 (PROC-2; ${note})`)
    // Sem id, a observacao continua visivel; nota vazia nao muda nada.
    expect(formatErpCreationAuditTarget([{ name: 'ALFA SEA 962-26', note }])).toBe(`1 processo: ALFA SEA 962-26 (${note})`)
    expect(formatErpCreationAuditTarget([{ id: 'PROC-1', name: 'ALFA SEA 962-26', note: '  ' }])).toBe(
      '1 processo: ALFA SEA 962-26 (PROC-1)'
    )

    const many = Array.from({ length: 60 }, (_, index) => ({
      key: `k${index}`, id: `PROC-${1700000000000 + index}`, name: `GAMA SEA ${900 + index}-26 ${'X'.repeat(30)}`, note,
    }))
    const target = formatErpCreationAuditTarget(many)
    expect(target.length).toBeLessThanOrEqual(1500)
    expect(target).toMatch(/ \(\+\d+\)$/)
    expect(target).toContain(`; ${note})`)
  })

  it('formatKgBr: pt-BR com ate 3 casas e sem zeros a direita', () => {
    expect(formatKgBr(0)).toBe('0')
    expect(formatKgBr(1000)).toBe('1.000')
    expect(formatKgBr(1500.5)).toBe('1.500,5')
    expect(formatKgBr(1234567.891)).toBe('1.234.567,891')
    expect(formatKgBr(12.3456)).toBe('12,346')
    expect(formatKgBr(null)).toBe('0')
  })
})
