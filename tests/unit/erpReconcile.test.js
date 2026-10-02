// Conciliacao ERP (DBCorp) x Portal - F1: casamento, diferencas por campo e
// classificacao do "so' no ERP". Fixtures 100% sinteticas.
import { describe, expect, it } from 'vitest'
import {
  CONSOLIDATION_HUB_ORIGINS,
  ERP_ONLY_CATEGORIES,
  F2_CANDIDATE_FIELDS,
  FIELD_AUTHORITY,
  PORTAL_STATUS_STAGES,
  reconcileErp,
  runErpReconciliation,
} from '../../src/features/erp/reconcileErp.js'
import { processStatusOptions } from '../../src/features/processes/processStatus.js'
import {
  FINANCIAL_SENTINEL_STRINGS,
  SCENARIO_TODAY,
  buildScenarioLooseRows,
  buildScenarioPortalProcesses,
  looseRowsToMatrix,
  makeLooseRow,
  makePortalProcess,
} from '../fixtures/erp/dbcorpSynthetic.js'
import { parseDbcorpRows } from '../../src/features/erp/parseDbcorpRows.js'

const TODAY = '2026-10-02'
const SOURCE = { id: 'teste', label: 'Fonte de teste' }

function run({ rows, processes, today = TODAY, fieldAuthority } = {}) {
  const loose = rows.map((row, index) => ({ rowNumber: index + 2, ...row }))
  return runErpReconciliation({
    loaded: { rows: loose, warnings: [], meta: { fileName: 'teste.xlsx', rowCount: loose.length } },
    processes,
    today,
    fieldAuthority,
    source: SOURCE,
  })
}

// Linha de FCL padrao (pedido 9036, PO BETA SEA 904-26).
const fcl = (overrides = {}) =>
  makeLooseRow({
    pedido: 9036,
    poRef: 'BETA SEA 904-26',
    refEmbarque: 'FCL - CFR HAMBURG',
    exporter: 'BETA TRADING',
    ...overrides,
  })

const portalFcl = (overrides = {}) =>
  makePortalProcess({ id: 'p-1', name: 'BETA SEA 904-26', processNumber: '9036', category: 'FCL', ...overrides })

const entryOf = (result, processId) => result.matched.find((entry) => entry.processId === processId)
const diffsOf = (result, processId, field) =>
  (entryOf(result, processId)?.diffs ?? []).filter((diff) => diff.field === field)
const oneDiff = (result, processId, field) => {
  const found = diffsOf(result, processId, field)
  expect(found, `diff ${field}`).toHaveLength(1)
  return found[0]
}
const codes = (result) => result.warnings.map((warning) => warning.code)

describe('constantes do nucleo', () => {
  it('PORTAL_STATUS_STAGES tem paridade com processStatusOptions e os 4 estagios', () => {
    expect(Object.keys(PORTAL_STATUS_STAGES)).toEqual(processStatusOptions)
    expect(PORTAL_STATUS_STAGES['Aguardando Embarque']).toBe(0)
    expect(PORTAL_STATUS_STAGES.Embarcou).toBe(1)
    expect(PORTAL_STATUS_STAGES['Aguardando atracação']).toBe(1)
    for (const status of ['Atracação Confirmada', 'Coleta Agendada', 'Aguardando desembaraço']) {
      expect(PORTAL_STATUS_STAGES[status]).toBe(2)
    }
    expect(PORTAL_STATUS_STAGES['Carga recebida']).toBe(3)
  })

  it('FIELD_AUTHORITY: 15 campos, todos a_definir (D-3 em aberto)', () => {
    expect(Object.keys(FIELD_AUTHORITY).sort()).toEqual(
      ['bl', 'category', 'destination', 'di', 'eta', 'etd', 'incoterm', 'items', 'origin', 'pedido', 'poReference', 'poSet', 'quantity', 'supplier', 'vessel'].sort()
    )
    expect(new Set(Object.values(FIELD_AUTHORITY))).toEqual(new Set(['a_definir']))
  })

  it('F2_CANDIDATE_FIELDS nao contem nenhum insumo do deriveProcessStatus (deriveProcessStatus.js:105-148)', () => {
    const statusInputs = [
      'shippedAt', 'eta', 'berthedAt', 'berthed', 'arrivedAt', 'arrived', 'cargoPresenceInformedAt',
      'cargoPresenceInformed', 'duimpRegisteredAt', 'duimpStatus', 'duimpNumber', 'parameterizedAt',
      'parameterizationChannel', 'clearanceCompletedAt', 'collectionStatus', 'collectionWindows',
      'collectionScheduledAt', 'category', 'processStatus',
    ]
    expect(F2_CANDIDATE_FIELDS.filter((field) => statusInputs.includes(field))).toEqual([])
    expect(F2_CANDIDATE_FIELDS).toContain('etd')
    expect(F2_CANDIDATE_FIELDS).toContain('items')
  })

  it('ERP_ONLY_CATEGORIES: 9 categorias na ordem de precedencia, com rotulo; hub de consolidacao = SHANGHAI', () => {
    expect(ERP_ONLY_CATEGORIES.map((category) => category.key)).toEqual([
      'nacional', 'amostra_courier', 'erp_desatualizado', 'possivelmente_recebido_oculto', 'a_consolidar',
      'aguardando_prontidao_pagamento', 'aguardando_embarque', 'embarcado_sem_processo', 'indefinido',
    ])
    expect(ERP_ONLY_CATEGORIES.find((category) => category.key === 'a_consolidar').label).toBe(
      'Aguardando consolidação (provável)'
    )
    expect(CONSOLIDATION_HUB_ORIGINS).toEqual(['SHANGHAI'])
  })
})

describe('casamento', () => {
  it('caso-real: CR-01 FCL/LCL/AEREO casa pelo PEDIDO (processNumber)', () => {
    const result = run({ rows: [fcl({ itemId: '1' })], processes: [portalFcl({ name: 'NOME QUALQUER' })] })
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0]).toMatchObject({ processId: 'p-1', matchRule: 'pedido', shipmentKey: 'BETA SEA 904-26' })
    expect(result.portalOnly).toEqual([])
    expect(result.erpOnly).toEqual([])
    expect(result.summary).toMatchObject({ matched: 1, portalOnly: 0, erpOnly: 0 })
  })

  it('sem PEDIDO igual, casa pela PO (name == poRef) e, depois, pela base da PO', () => {
    const rows = [fcl({ itemId: '1', pedido: 9036, poRef: 'BETA SEA 904-26' })]
    const byPo = run({ rows, processes: [portalFcl({ processNumber: '9999', name: 'beta sea 904-26' })] })
    expect(byPo.matched[0].matchRule).toBe('po')

    const split = [fcl({ itemId: '1', pedido: 9050, poRef: 'LAMBDA SEA 901-26.2', refEmbarque: 'LCL - FOB KOBE' })]
    const byBase = run({
      rows: split,
      processes: [portalFcl({ id: 'p-2', name: 'LAMBDA SEA 901-26', processNumber: '', category: 'LCL' })],
    })
    expect(byBase.matched[0].matchRule).toBe('po-base')
    expect(codes(byBase)).toContain('match_por_po_base')
  })

  it('caso-real: CR-02 consolidado casa pela REF no name (consolidado:ref)', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 929-26' }),
      fcl({ itemId: '2', pedido: 9011, poRef: 'GAMA SEA 906-26', refEmbarque: 'CON CN 929-26' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 929-26', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: '9010', reference: 'ALFA SEA 905-26' }, { po: '9011', reference: 'GAMA SEA 906-26' }],
      }),
    ]
    const result = run({ rows, processes })
    expect(result.matched[0]).toMatchObject({ processId: 'p-con', matchRule: 'consolidado:ref', shipmentKey: 'CON CN 929-26' })
    expect(diffsOf(result, 'p-con', 'poSet')).toEqual([])
  })

  it('caso-real: CR-04 a AMOSTRA nao casa com o CON (a PO tem 2 PEDIDOs em embarques diferentes)', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9016, poRef: 'KAPPA SAMPLE 910-26', refEmbarque: 'CON CN 919-26' }),
      fcl({ itemId: '2', pedido: 9017, poRef: 'OMEGA SEA 911-26', refEmbarque: 'CON CN 919-26' }),
      fcl({ itemId: '3', pedido: 9145, poRef: 'KAPPA SAMPLE 910-26', refEmbarque: 'AMOSTRA' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 919-26', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: '9016' }, { po: '9017' }],
      }),
      makePortalProcess({ id: 'p-air', name: 'KAPPA SAMPLE 910-26', processNumber: '9145', category: 'AEREO' }),
    ]
    const result = run({ rows, processes })
    expect(entryOf(result, 'p-con').shipmentKey).toBe('CON CN 919-26')
    expect(entryOf(result, 'p-air')).toMatchObject({ shipmentKey: 'KAPPA SAMPLE 910-26', matchRule: 'pedido' })
    expect(result.summary.shipments).toBe(2)
    expect(result.erpOnly).toEqual([])
  })

  it('caso-real: CR-05 PO com 2 PEDIDOs no mesmo embarque: o processo 9164 casa; o 9160 nao vira erpOnly nem varios_processos', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9164, poRef: 'ZETA SEA 902-26' }),
      fcl({ itemId: '2', pedido: 9160, poRef: 'ZETA SEA 902-26' }),
    ]
    const result = run({ rows, processes: [portalFcl({ name: 'ZETA SEA 902-26', processNumber: '9164' })] })
    expect(result.matched).toHaveLength(1)
    expect(result.erpOnly).toEqual([])
    expect(codes(result)).not.toContain('embarque_em_varios_processos')
    expect(diffsOf(result, 'p-1', 'pedido')).toEqual([])
  })

  it('caso-real: CR-06 PO dividida: o processo LCL casa com o grupo .2, nao com o CON', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9050, poRef: 'LAMBDA SEA 901-26.1', refEmbarque: 'CON DG 909-26' }),
      fcl({ itemId: '2', pedido: 9050, poRef: 'LAMBDA SEA 901-26.2', refEmbarque: 'LCL - FOB KOBE' }),
    ]
    const result = run({
      rows,
      processes: [portalFcl({ id: 'p-lcl', name: 'LAMBDA SEA 901-26', processNumber: '9050', category: 'LCL' })],
    })
    expect(entryOf(result, 'p-lcl').shipmentKey).toBe('LAMBDA SEA 901-26.2')
    expect(codes(result)).toContain('po_dividida')
    // o CON, sem processo no Portal, aparece em "so' no ERP"
    expect(result.erpOnly.map((item) => item.shipmentKey)).toEqual(['CON DG 909-26'])
  })

  it('caso-real: CR-07 amostra dentro de CON: o PEDIDO entra no conjunto do CON, sem diferenca de navio', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9031, poRef: 'MU SAMPLE 903-26', refEmbarque: 'CON CN 931-26', vesselRaw: 'AMOSTRA' }),
      fcl({ itemId: '2', pedido: 9032, poRef: 'PSI SEA 903-26', refEmbarque: 'CON CN 931-26', vesselRaw: 'ALFA MAERSK 639W' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 931-26', category: 'CONSOLIDADO', vesselName: 'ALFA MAERSK', voyage: '639W',
        purchaseOrders: [{ po: '9031', reference: 'MU SAMPLE 903-26' }, { po: '9032', reference: 'PSI SEA 903-26' }],
      }),
    ]
    const result = run({ rows, processes })
    expect(diffsOf(result, 'p-con', 'poSet')).toEqual([])
    expect(diffsOf(result, 'p-con', 'vessel')).toEqual([])
    expect(codes(result)).not.toContain('conflito_no_grupo')
  })

  it('processNumber "PO 9036" e "PO-9036" casam por digitos (pedido) e o diff e formato, sem contar', () => {
    for (const processNumber of ['PO 9036', 'PO-9036', '09036']) {
      const result = run({
        rows: [fcl({ itemId: '1' })],
        processes: [portalFcl({ name: 'NOME QUALQUER', processNumber })],
      })
      expect(result.matched[0].matchRule, processNumber).toBe('pedido')
      const diff = oneDiff(result, 'p-1', 'pedido')
      expect(diff).toMatchObject({ kind: 'formato', counts: false, applicable: false })
    }
  })

  it('processNumber vazio nunca casa com nada (nem com PEDIDO vazio)', () => {
    const result = run({
      rows: [fcl({ itemId: '1', pedido: '', poRef: 'ALFA SEA 940-26' })],
      processes: [portalFcl({ name: 'OUTRO NOME', processNumber: '' })],
    })
    expect(result.matched).toEqual([])
    expect(result.portalOnly.map((item) => item.processId)).toEqual(['p-1'])
    expect(result.erpOnly).toHaveLength(1)
  })

  it('CON com .po "PO-9112" casa pelo conjunto de pedidos e o diff de POs sai formato', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9112, poRef: 'ALFA SEA 912-26', refEmbarque: 'CON CN 933-26' }),
      fcl({ itemId: '2', pedido: 9113, poRef: 'BETA SEA 913-26', refEmbarque: 'CON CN 933-26' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CONSOLIDADO DA SEMANA', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: 'PO-9112', reference: 'ALFA SEA 912-26' }, { po: '9113', reference: 'BETA SEA 913-26' }],
      }),
    ]
    const result = run({ rows, processes })
    expect(result.matched[0].matchRule).toBe('consolidado:pedidos')
    expect(codes(result)).toContain('consolidado_sem_ref')
    expect(oneDiff(result, 'p-con', 'poSet')).toMatchObject({ kind: 'formato', counts: false })
  })

  it('CON gravado como FCL: casa pela REF, diff de categoria e nenhum campo por PO', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9112, poRef: 'ALFA SEA 912-26', refEmbarque: 'CON CN 932-26', commercialName: 'SOLVENTE PI' }),
      fcl({ itemId: '2', pedido: 9113, poRef: 'BETA SEA 913-26', refEmbarque: 'CON CN 932-26', commercialName: 'SOLVENTE PI' }),
    ]
    const processes = [
      portalFcl({
        id: 'p-legacy', name: 'CON CN 932-26', processNumber: '9112', category: 'FCL',
        supplierName: 'X', items: [{ commercialName: 'OUTRO ITEM', quantity: 1 }],
      }),
    ]
    const result = run({ rows, processes })
    expect(result.matched[0]).toMatchObject({ processId: 'p-legacy', matchRule: 'consolidado:ref' })
    expect(oneDiff(result, 'p-legacy', 'category')).toMatchObject({
      kind: 'divergente', counts: true, applicable: false,
    })
    expect(oneDiff(result, 'p-legacy', 'category').note).toMatch(/consolidado gravado como FCL/i)
    const fields = entryOf(result, 'p-legacy').diffs.map((diff) => diff.field)
    for (const forbidden of ['poSet', 'poReference', 'supplier', 'items', 'quantity', 'pedido']) {
      expect(fields).not.toContain(forbidden)
    }
    expect(result.portalOnly).toEqual([])
    expect(result.erpOnly).toEqual([])
  })

  it('lista do Portal vazia com embarque ativo: bloqueia, sem "so no ERP" em massa', () => {
    const result = run({ rows: [fcl({ itemId: '1' }), fcl({ itemId: '2', pedido: 9037, poRef: 'ALFA SEA 905-26' })], processes: [] })
    expect(result.blocked).toBe('lista_portal_vazia')
    expect(result.blockedMessage).toBe('Os processos do Portal não foram carregados. Recarregue a página antes de conciliar.')
    expect(result.matched).toEqual([])
    expect(result.erpOnly).toEqual([])
    expect(result.portalOnly).toEqual([])
    expect(result.summary.activeShipments).toBe(2)
  })

  it('lista do Portal vazia sem embarque ativo nao bloqueia', () => {
    const result = run({ rows: [fcl({ itemId: '1', status: 'CONCLUÍDO' })], processes: [] })
    expect(result.blocked).toBeNull()
  })

  it('desempate: prefere categoria compativel e, depois, o embarque ativo', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9060, poRef: 'ALFA SEA 960-26', refEmbarque: 'LCL - FOB KOBE', status: 'CONCLUÍDO' }),
      fcl({ itemId: '2', pedido: 9060, poRef: 'ZETA SEA 960-26', refEmbarque: 'LCL - FOB KOBE', status: 'EMBARCOU' }),
      fcl({ itemId: '3', pedido: 9060, poRef: 'BETA SEA 960-26', refEmbarque: 'FCL - FOB KOBE', status: 'EMBARCOU' }),
    ]
    const result = run({ rows, processes: [portalFcl({ name: 'NOME', processNumber: '9060', category: 'LCL' })] })
    // LCL compativel: ALFA (inativo) e ZETA (ativo) -> o ativo, mesmo com chave maior
    expect(result.matched[0].shipmentKey).toBe('ZETA SEA 960-26')
    expect(codes(result)).not.toContain('match_ambiguo')
  })

  it('empate total: menor chave + aviso match_ambiguo', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9061, poRef: 'ZETA SEA 961-26' }),
      fcl({ itemId: '2', pedido: 9061, poRef: 'BETA SEA 961-26' }),
    ]
    const result = run({ rows, processes: [portalFcl({ name: 'NOME', processNumber: '9061' })] })
    expect(result.matched[0].shipmentKey).toBe('BETA SEA 961-26')
    expect(codes(result)).toContain('match_ambiguo')
  })

  it('desempate por nao arquivado: o processo vivo fica com o embarque, o arquivado vira so no Portal', () => {
    const processes = [
      portalFcl({ id: 'p-arch', name: 'VELHO', processNumber: '9036', archived: true }),
      portalFcl({ id: 'p-live', name: 'NOVO', processNumber: '9036', archived: false }),
    ]
    const result = run({ rows: [fcl({ itemId: '1' })], processes })
    expect(result.matched.map((entry) => entry.processId)).toEqual(['p-live'])
    expect(result.portalOnly).toEqual([
      { processId: 'p-arch', processName: 'VELHO', category: 'FCL', archived: true },
    ])
    expect(result.summary).toMatchObject({ portalOnly: 1, portalOnlyArchived: 1 })
    expect(codes(result)).not.toContain('embarque_em_varios_processos')
  })

  it('arquivado sozinho ainda casa; 2 processos vivos no mesmo embarque geram embarque_em_varios_processos', () => {
    const alone = run({
      rows: [fcl({ itemId: '1' })],
      processes: [portalFcl({ id: 'p-arch', name: 'VELHO', processNumber: '9036', archived: true })],
    })
    expect(alone.matched.map((entry) => [entry.processId, entry.archived])).toEqual([['p-arch', true]])

    const both = run({
      rows: [fcl({ itemId: '1' })],
      processes: [
        portalFcl({ id: 'p-a', name: 'A', processNumber: '9036' }),
        portalFcl({ id: 'p-b', name: 'B', processNumber: '9036' }),
      ],
    })
    expect(both.matched.map((entry) => entry.processId)).toEqual(['p-a', 'p-b'])
    expect(codes(both)).toContain('embarque_em_varios_processos')
  })

  it('so no Portal: processo sem embarque, inclusive arquivado', () => {
    const result = run({
      rows: [fcl({ itemId: '1' })],
      processes: [
        portalFcl(),
        portalFcl({ id: 'p-x', name: 'SEM ERP', processNumber: '9999', category: 'LCL' }),
        portalFcl({ id: 'p-y', name: 'ARQUIVADO SEM ERP', processNumber: '9998', archived: true }),
      ],
    })
    expect(result.portalOnly.map((item) => [item.processId, item.archived])).toEqual([['p-x', false], ['p-y', true]])
  })
})

describe('diferencas por campo', () => {
  it('caso-real: CR-03 fornecedor por PO com sufixo e formato, sem divergente', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 934-26', exporter: 'ALFA CHEM 2' }),
      fcl({ itemId: '2', pedido: 9011, poRef: 'BETA SEA 906-26', refEmbarque: 'CON CN 934-26', exporter: 'BETA (GAMA)' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 934-26', category: 'CONSOLIDADO',
        purchaseOrders: [
          { po: '9010', reference: 'ALFA SEA 905-26', supplierName: 'ALFA CHEM' },
          { po: '9011', reference: 'BETA SEA 906-26', supplierName: 'BETA' },
        ],
        items: [
          { id: 'it-1', commercialName: 'RESINA OMEGA', quantity: 1000, poNumber: '9010' },
          { id: 'it-2', commercialName: 'RESINA OMEGA', quantity: 1000, poNumber: '9011' },
        ],
      }),
    ]
    const result = run({ rows, processes })
    const supplier = diffsOf(result, 'p-con', 'supplier')
    expect(supplier.map((diff) => diff.kind)).toEqual(['formato', 'formato'])
    expect(supplier.every((diff) => diff.counts === false)).toBe(true)
    expect(entryOf(result, 'p-con').diffs.some((diff) => diff.kind === 'divergente')).toBe(false)
    expect(result.summary.matchedWithDiffs).toBe(0)
  })

  it('Ref. da PO do CON: igual ok (aceita poBase), vazio portal_sem_dado, diferente divergente', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9010, poRef: 'ALFA SEA 905-26.1', refEmbarque: 'CON CN 935-26' }),
      fcl({ itemId: '2', pedido: 9011, poRef: 'BETA SEA 906-26', refEmbarque: 'CON CN 935-26' }),
      fcl({ itemId: '3', pedido: 9012, poRef: 'GAMA SEA 907-26', refEmbarque: 'CON CN 935-26' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 935-26', category: 'CONSOLIDADO',
        purchaseOrders: [
          { po: '9010', reference: 'ALFA SEA 905-26' },
          { po: '9011', reference: '' },
          { po: '9012', reference: 'OUTRA PO' },
        ],
      }),
    ]
    const diffs = diffsOf(run({ rows, processes }), 'p-con', 'poReference')
    expect(diffs.map((diff) => diff.kind).sort()).toEqual(['divergente', 'portal_sem_dado'])
  })

  it('POs do CON: falta e sobra viram divergente, com a REF onde o PEDIDO esta no ERP', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 936-26' }),
      fcl({ itemId: '2', pedido: 9011, poRef: 'BETA SEA 906-26', refEmbarque: 'CON CN 936-26' }),
      fcl({ itemId: '3', pedido: 9020, poRef: 'GAMA SEA 908-26', refEmbarque: 'CON CN 937-26' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 936-26', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: '9010', reference: 'ALFA SEA 905-26' }, { po: '9020', reference: 'GAMA SEA 908-26' }],
      }),
    ]
    const diff = oneDiff(run({ rows, processes }), 'p-con', 'poSet')
    expect(diff).toMatchObject({ kind: 'divergente', counts: true, applicable: false })
    expect(diff.note).toContain('Faltam no Portal: 9011')
    expect(diff.note).toContain('Sobram no Portal: 9020 (no ERP está em REF CON CN 937-26)')
  })

  it('caso-real: CR-16 ETA FINAL fica no ErpItemRow e nao gera diff proprio', () => {
    const rows = [fcl({ itemId: '1', etaFinal: 46309, eta: 46309 })]
    const result = run({ rows, processes: [portalFcl({ eta: '2026-10-14' })] })
    expect(entryOf(result, 'p-1').diffs.map((diff) => diff.field)).not.toContain('etaFinal')
    expect(diffsOf(result, 'p-1', 'eta')).toEqual([])
  })

  it('caso-real: CR-18 navio, ETD e ETA trocados no CON', () => {
    const rows = [
      fcl({
        itemId: '1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 901-26',
        vesselRaw: 'BETA MAERSK 639W', etd: 46301, eta: '',
      }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 901-26', category: 'CONSOLIDADO', vesselName: 'ALFA MAERSK', voyage: '637W',
        etd: '2026-09-30', eta: '2026-10-14', purchaseOrders: [{ po: '9010', reference: 'ALFA SEA 905-26' }],
      }),
    ]
    const result = run({ rows, processes })
    expect(oneDiff(result, 'p-con', 'vessel')).toMatchObject({ kind: 'divergente', counts: true })
    const etd = oneDiff(result, 'p-con', 'etd')
    expect(etd).toMatchObject({ kind: 'divergente', counts: true, applicable: true })
    expect(etd.note).toContain('6 dias')
    expect(oneDiff(result, 'p-con', 'eta')).toMatchObject({ kind: 'erp_sem_dado', counts: false, applicable: false })
    expect(result.summary.erpMissingFields).toBe(1)
  })

  it('caso-real: CR-19 navio por transbordo: nota de transbordo; sem transbordo, divergente simples', () => {
    const rows = [fcl({ itemId: '1', vesselRaw: 'DELTA BRIDGE/105W' })]
    const withTransshipment = run({
      rows,
      processes: [portalFcl({ vesselName: 'ALFA MAERSK', voyage: '639W', transshipment: true, transshipmentPort: 'SINGAPORE' })],
    })
    const noted = oneDiff(withTransshipment, 'p-1', 'vessel')
    expect(noted.kind).toBe('divergente')
    expect(noted.note).toMatch(/possível outra perna \(transbordo em SINGAPORE\)/)

    const without = run({
      rows,
      processes: [portalFcl({ vesselName: 'ALFA MAERSK', voyage: '639W', transshipment: false })],
    })
    const plain = oneDiff(without, 'p-1', 'vessel')
    expect(plain.kind).toBe('divergente')
    expect(plain.note).toBe('')
  })

  it('caso-real: CR-20 destino divergente (3 processos)', () => {
    const destinations = [
      ['A', 9301, 'NAVEGANTES', 'ITAJAÍ'],
      ['B', 9302, 'SANTOS', 'ITAJAI'],
      ['C', 9303, 'ITAPOÁ', 'NAVEGANTES'],
    ]
    const rows = destinations.map(([id, pedido, , erpDestination], index) =>
      fcl({ itemId: id, pedido, poRef: `ALFA SEA 93${index}-26`, destination: erpDestination })
    )
    const processes = destinations.map(([id, pedido, portalDestination], index) =>
      portalFcl({ id: `p-${id}`, name: `ALFA SEA 93${index}-26`, processNumber: String(pedido), destination: portalDestination })
    )
    const result = run({ rows, processes })
    for (const [id] of destinations) {
      expect(oneDiff(result, `p-${id}`, 'destination')).toMatchObject({ kind: 'divergente', counts: true })
    }
    expect(result.summary.matchedWithDiffs).toBe(3)
  })

  it('caso-real: CR-09 ITAPOA no ERP x ITAPOÁ no Portal = formato; igual nao gera diff', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9040, poRef: 'ALFA SEA 940-26', refEmbarque: 'CON CN 938-26', destination: 'ITAPOA' }),
      fcl({ itemId: '2', pedido: 9041, poRef: 'BETA SEA 941-26', refEmbarque: 'CON CN 938-26', destination: 'ITAPOÁ' }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 938-26', category: 'CONSOLIDADO', destination: 'ITAPOÁ',
        purchaseOrders: [{ po: '9040', reference: 'ALFA SEA 940-26' }, { po: '9041', reference: 'BETA SEA 941-26' }],
      }),
    ]
    const diff = oneDiff(run({ rows, processes }), 'p-con', 'destination')
    expect(diff).toMatchObject({ kind: 'formato', counts: false, portal: 'ITAPOÁ', erp: 'ITAPOA' })
    const same = run({ rows, processes: [{ ...processes[0], destination: 'ITAPOA' }] })
    expect(diffsOf(same, 'p-con', 'destination')).toEqual([])
  })

  it('caso-real: CR-21 fornecedor preenchido com o numero da PO: divergente + nota', () => {
    for (const supplierName of ['9112', 'PO 9112', 'PO-9112']) {
      const rows = [
        fcl({ itemId: '1', pedido: 9112, poRef: 'ALFA SEA 912-26', refEmbarque: 'CON CN 930-26', exporter: 'ALFA CHEM' }),
        fcl({ itemId: '2', pedido: 9113, poRef: 'BETA SEA 913-26', refEmbarque: 'CON CN 930-26', exporter: 'BETA TRADING' }),
      ]
      const processes = [
        makePortalProcess({
          id: 'p-con', name: 'CON CN 930-26', category: 'CONSOLIDADO',
          purchaseOrders: [
            { po: '9112', reference: 'ALFA SEA 912-26', supplierName },
            { po: '9113', reference: 'BETA SEA 913-26', supplierName: 'BETA TRADING' },
          ],
        }),
      ]
      const supplier = diffsOf(run({ rows, processes }), 'p-con', 'supplier')
      expect(supplier, supplierName).toHaveLength(1)
      expect(supplier[0]).toMatchObject({ kind: 'divergente', counts: true })
      expect(supplier[0].note).toContain('fornecedor preenchido com o número da PO')
    }
  })

  it('fornecedor de FCL: igual ok, vazio portal_sem_dado, diferente divergente', () => {
    const rows = [fcl({ itemId: '1', exporter: 'BETA TRADING' })]
    expect(diffsOf(run({ rows, processes: [portalFcl({ supplierName: 'beta trading' })] }), 'p-1', 'supplier')).toEqual([])
    expect(oneDiff(run({ rows, processes: [portalFcl({ supplierName: '' })] }), 'p-1', 'supplier').kind).toBe('portal_sem_dado')
    expect(oneDiff(run({ rows, processes: [portalFcl({ supplierName: 'DELTA CHEM' })] }), 'p-1', 'supplier').kind).toBe('divergente')
  })

  it('caso-real: CR-22 status atrasado no ERP (3 casos), sem sugerir rebaixar o Portal', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9401, poRef: 'ALFA SEA 940-26', status: 'ATRAC. AG. LIBERAÇÃO', statusNf: 'Recebido Total' }),
      fcl({ itemId: '2', pedido: 9402, poRef: 'BETA SEA 941-26', status: 'EMBARCOU' }),
      fcl({ itemId: '3', pedido: 9403, poRef: 'GAMA SEA 942-26', status: 'EMBARCOU', refEmbarque: 'CON CN 939-26' }),
    ]
    const processes = [
      portalFcl({ id: 'p-1', name: 'ALFA SEA 940-26', processNumber: '9401', processStatus: 'Carga recebida' }),
      portalFcl({ id: 'p-2', name: 'BETA SEA 941-26', processNumber: '9402', processStatus: 'Aguardando desembaraço' }),
      makePortalProcess({
        id: 'p-3', name: 'CON CN 939-26', category: 'CONSOLIDADO', processStatus: 'Atracação Confirmada',
        purchaseOrders: [{ po: '9403', reference: 'GAMA SEA 942-26' }],
      }),
    ]
    const result = run({ rows, processes })
    for (const id of ['p-1', 'p-2', 'p-3']) {
      const status = oneDiff(result, id, 'status')
      expect(status, id).toMatchObject({ kind: 'erp_atrasado', counts: true, applicable: false })
      expect(status.note).not.toMatch(/rebaix|alterar o status|mudar o status/i)
      expect(status.erpValue).toBeNull()
    }
  })

  it('Portal "Carga recebida" x ERP todo CONCLUIDO: casa, sem erp_atrasado e sem portalOnly', () => {
    const result = run({
      rows: [fcl({ itemId: '1', status: 'CONCLUÍDO' })],
      processes: [portalFcl({ processStatus: 'Carga recebida' })],
    })
    expect(result.matched).toHaveLength(1)
    expect(diffsOf(result, 'p-1', 'status')).toEqual([])
    expect(result.portalOnly).toEqual([])
    expect(result.erpOnly).toEqual([])
  })

  it('Portal "Embarcou" x ERP CONCLUIDO: informativo (ERP a frente)', () => {
    const result = run({
      rows: [fcl({ itemId: '1', status: 'CONCLUÍDO' })],
      processes: [portalFcl({ processStatus: 'Embarcou' })],
    })
    expect(oneDiff(result, 'p-1', 'status')).toMatchObject({ kind: 'informativo', counts: false })
  })

  it('status do Portal fora dos 10: informativo + aviso status_portal_desconhecido', () => {
    const result = run({
      rows: [fcl({ itemId: '1' })],
      processes: [portalFcl({ processStatus: 'Em Andamento' })],
    })
    expect(oneDiff(result, 'p-1', 'status')).toMatchObject({ kind: 'informativo', counts: false })
    expect(codes(result)).toContain('status_portal_desconhecido')
    expect(result.warnings.find((warning) => warning.code === 'status_portal_desconhecido').ref.processId).toBe('p-1')
  })

  it('caso-real: CR-23 navio em formatos diferentes do mesmo navio e viagem: formato, sem contar', () => {
    const variants = [
      'OMEGA BLOOM 1628-089S',
      'OMEGA BLOOM/1628-089S',
      'OMEGA BLOOM / 1628-089S',
      'OMEGA BLOOM (1628-089S)',
    ]
    for (const vesselRaw of variants) {
      const result = run({
        rows: [fcl({ itemId: '1', vesselRaw })],
        processes: [portalFcl({ vesselName: 'OMEGA BLOOM', voyage: 'V-1628-089S' })],
      })
      expect(oneDiff(result, 'p-1', 'vessel'), vesselRaw).toMatchObject({ kind: 'formato', counts: false })
    }
    const exact = run({
      rows: [fcl({ itemId: '1', vesselRaw: 'OMEGA BLOOM 1628-089S' })],
      processes: [portalFcl({ vesselName: 'OMEGA BLOOM', voyage: '1628-089S' })],
    })
    expect(diffsOf(exact, 'p-1', 'vessel')).toEqual([])
  })

  it('caso-real: CR-28 mesmo navio com ERP sem viagem ou com viagem incompleta nao e divergente', () => {
    const vesselDiff = (vesselRaw, portal) =>
      oneDiff(run({ rows: [fcl({ itemId: '1', vesselRaw })], processes: [portalFcl(portal)] }), 'p-1', 'vessel')

    // NOME sem viagem no ERP; o Portal traz a viagem no nome ou no campo proprio.
    for (const portal of [
      { vesselName: 'ALFA OSMIUM 0BDOXE1MA', voyage: '' },
      { vesselName: 'ALFA OSMIUM', voyage: '0BDOXE1MA' },
    ]) {
      const diff = vesselDiff('ALFA OSMIUM', portal)
      expect(diff, JSON.stringify(portal)).toMatchObject({ kind: 'erp_sem_dado', counts: false, applicable: false, erpValue: null })
      expect(diff.note).toContain('ERP sem viagem')
    }
    expect(vesselDiff('BETA FAME', { vesselName: 'BETA FAME 1AAERW1MA', voyage: '' })).toMatchObject({
      kind: 'erp_sem_dado', counts: false, applicable: false,
    })

    // Viagem parcial do ERP: comeco da viagem do Portal ('GAMA FAR / 1' x '1AAELW1MA').
    for (const portal of [
      { vesselName: 'GAMA FAR 1AAELW1MA', voyage: '' },
      { vesselName: 'GAMA FAR', voyage: '1AAELW1MA' },
    ]) {
      const diff = vesselDiff('GAMA FAR / 1', portal)
      expect(diff, JSON.stringify(portal)).toMatchObject({ kind: 'informativo', counts: false, applicable: false, erpValue: null })
      expect(diff.note).toContain('incompleta')
    }

    // Viagem composta no Portal ('0BDOYW1MA/008W'); o ERP traz um dos trechos.
    const segment = vesselDiff('DELTA SHIPPING CHILE/0BDOYW1MA', { vesselName: 'DELTA SHIPPING CHILE', voyage: '0BDOYW1MA/008W' })
    expect(segment).toMatchObject({ kind: 'formato', counts: false, applicable: false, erpValue: null })

    // Controles: nao vira "ok" por engano.
    const otherVoyage = vesselDiff('ALFA MAERSK 639W', { vesselName: 'ALFA MAERSK', voyage: '640W' })
    expect(otherVoyage).toMatchObject({
      kind: 'divergente', counts: true, applicable: true, erpValue: { vesselName: 'ALFA MAERSK', voyage: '639W' },
    })
    const otherName = vesselDiff('ALFA OSMIUM', { vesselName: 'BETA OSMIUM', voyage: '0BDOXE1MA' })
    expect(otherName.kind).toBe('divergente')
    const longerName = vesselDiff('ALFA FAR', { vesselName: 'ALFA FARMER 1AAELW1MA', voyage: '' })
    expect(longerName.kind).toBe('divergente')
  })

  it('erpValue do navio nunca leva voyage vazio (so o que o ERP informa)', () => {
    const noVoyageOnPortalEmpty = oneDiff(
      run({ rows: [fcl({ itemId: '1', vesselRaw: 'ZETA LONE' })], processes: [portalFcl()] }),
      'p-1',
      'vessel'
    )
    expect(noVoyageOnPortalEmpty).toMatchObject({ kind: 'portal_sem_dado', erpValue: { vesselName: 'ZETA LONE' } })
    expect(Object.keys(noVoyageOnPortalEmpty.erpValue)).toEqual(['vesselName'])

    const otherShip = oneDiff(
      run({ rows: [fcl({ itemId: '1', vesselRaw: 'ZETA LONE' })], processes: [portalFcl({ vesselName: 'ALFA MAERSK', voyage: '639W' })] }),
      'p-1',
      'vessel'
    )
    expect(otherShip).toMatchObject({ kind: 'divergente', erpValue: { vesselName: 'ZETA LONE' } })
    expect(Object.keys(otherShip.erpValue)).toEqual(['vesselName'])
  })

  it('CR-28 no resumo: o navio com ERP sem viagem conta so em erpMissingFields, nunca em matchedWithDiffs', () => {
    // O processo do Portal e' completo nos demais campos: so o navio gera diff.
    const result = run({
      rows: [fcl({ itemId: '1', vesselRaw: 'ALFA OSMIUM', exporter: 'BETA TRADING', quantityKg: 1000 })],
      processes: [
        portalFcl({
          vesselName: 'ALFA OSMIUM 0BDOXE1MA',
          supplierName: 'BETA TRADING',
          items: [{ id: 'it-1', commercialName: 'RESINA OMEGA', quantity: 1000 }],
        }),
      ],
    })
    const diffs = entryOf(result, 'p-1').diffs
    expect(diffs.filter((diff) => diff.counts).map((diff) => diff.field)).not.toContain('vessel')
    expect(diffs.filter((diff) => diff.field === 'vessel').map((diff) => diff.kind)).toEqual(['erp_sem_dado'])
    expect(result.summary.erpMissingFields).toBe(1)
  })

  it('navio de AEREO e ignorado; ERP sem navio e Portal com navio = erp_sem_dado; Portal vazio = portal_sem_dado', () => {
    const air = run({
      rows: [fcl({ itemId: '1', refEmbarque: 'DAP - ITAJAI', vesselRaw: 'ALFA MAERSK 639W' })],
      processes: [portalFcl({ category: 'AEREO', vesselName: '', mawb: '' })],
    })
    expect(diffsOf(air, 'p-1', 'vessel')).toEqual([])
    expect(oneDiff(run({ rows: [fcl({ itemId: '1' })], processes: [portalFcl({ vesselName: 'ALFA MAERSK' })] }), 'p-1', 'vessel').kind).toBe('erp_sem_dado')
    expect(oneDiff(run({ rows: [fcl({ itemId: '1', vesselRaw: 'ALFA MAERSK 639W' })], processes: [portalFcl()] }), 'p-1', 'vessel').kind).toBe('portal_sem_dado')
  })

  it('datas sem tolerancia (D-8): 1 dia de diferenca em ETD e ETA e divergente, com nota de 1 dia', () => {
    const result = run({
      rows: [fcl({ itemId: '1', etd: '2026-10-06', eta: '2026-10-14' })],
      processes: [portalFcl({ etd: '2026-10-05', eta: '2026-10-15' })],
    })
    for (const field of ['etd', 'eta']) {
      const diff = oneDiff(result, 'p-1', field)
      expect(diff).toMatchObject({ kind: 'divergente', counts: true })
      expect(diff.note).toContain('1 dia')
      expect(diff.note).not.toContain('1 dias')
    }
    expect(oneDiff(result, 'p-1', 'etd').applicable).toBe(true)
    expect(oneDiff(result, 'p-1', 'eta').applicable).toBe(false)
  })

  it('ETD: igual a etd OU a shippedAt do Portal = ok', () => {
    const rows = [fcl({ itemId: '1', etd: '2026-10-06' })]
    expect(diffsOf(run({ rows, processes: [portalFcl({ etd: '2026-10-01', shippedAt: '2026-10-06' })] }), 'p-1', 'etd')).toEqual([])
    expect(diffsOf(run({ rows, processes: [portalFcl({ etd: '2026-10-06' })] }), 'p-1', 'etd')).toEqual([])
    expect(oneDiff(run({ rows, processes: [portalFcl({})] }), 'p-1', 'etd').kind).toBe('portal_sem_dado')
  })

  it('erp_conflito: Portal igual a um dos valores = counts false; sem valor igual = counts true; nunca erp_sem_dado', () => {
    const rows = [
      fcl({ itemId: '1', etd: 46301 }),
      fcl({ itemId: '2', etd: 46281 }),
    ]
    const equal = oneDiff(run({ rows, processes: [portalFcl({ etd: '2026-10-06' })] }), 'p-1', 'etd')
    expect(equal).toMatchObject({ kind: 'erp_conflito', counts: false, erpValue: null })
    const different = oneDiff(run({ rows, processes: [portalFcl({ etd: '2026-01-01' })] }), 'p-1', 'etd')
    expect(different).toMatchObject({ kind: 'erp_conflito', counts: true })
    const empty = oneDiff(run({ rows, processes: [portalFcl({ etd: '' })] }), 'p-1', 'etd')
    expect(empty.kind).toBe('erp_conflito')
    expect(empty.kind).not.toBe('erp_sem_dado')
  })

  it('origem: contem/igual ok ou formato; diferente e so informativo', () => {
    const rows = [fcl({ itemId: '1', origin: 'HAMBURG' })]
    expect(diffsOf(run({ rows, processes: [portalFcl({ originLocation: 'HAMBURG' })] }), 'p-1', 'origin')).toEqual([])
    expect(oneDiff(run({ rows, processes: [portalFcl({ originLocation: 'Hamburg, Alemanha' })] }), 'p-1', 'origin').kind).toBe('formato')
    const informative = oneDiff(run({ rows, processes: [portalFcl({ originLocation: 'SANTOS' })] }), 'p-1', 'origin')
    expect(informative).toMatchObject({ kind: 'informativo', counts: false })
    // sem origem na coluna, usa a dica da REF
    const hinted = run({ rows: [fcl({ itemId: '1', origin: '', refEmbarque: 'FCL - CFR HAMBURG' })], processes: [portalFcl({ originLocation: 'HAMBURG' })] })
    expect(diffsOf(hinted, 'p-1', 'origin')).toEqual([])
  })

  it('incoterm: diferente divergente, Portal vazio portal_sem_dado, igual ok; nao se aplica ao CON', () => {
    const rows = [fcl({ itemId: '1', refEmbarque: 'FCL - CFR HAMBURG' })]
    expect(diffsOf(run({ rows, processes: [portalFcl({ incoterm: 'CFR' })] }), 'p-1', 'incoterm')).toEqual([])
    expect(oneDiff(run({ rows, processes: [portalFcl({ incoterm: 'FOB' })] }), 'p-1', 'incoterm').kind).toBe('divergente')
    expect(oneDiff(run({ rows, processes: [portalFcl({ incoterm: '' })] }), 'p-1', 'incoterm').kind).toBe('portal_sem_dado')
    const con = run({
      rows: [fcl({ itemId: '1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 901-26' })],
      processes: [makePortalProcess({ id: 'p-con', name: 'CON CN 901-26', category: 'CONSOLIDADO', incoterm: 'FOB', purchaseOrders: [{ po: '9010' }] })],
    })
    expect(diffsOf(con, 'p-con', 'incoterm')).toEqual([])
  })

  it('BL: casa com houseBl (matchedField), com mawb no AEREO; divergente e portal_sem_dado', () => {
    const rows = [fcl({ itemId: '1', blAwb: 'ab-123 / 45' })]
    const house = oneDiff(run({ rows, processes: [portalFcl({ masterBl: 'OUTRO99', houseBl: 'AB12345' })] }), 'p-1', 'bl')
    expect(house).toMatchObject({ kind: 'informativo', counts: false, matchedField: 'houseBl' })
    const master = oneDiff(run({ rows, processes: [portalFcl({ masterBl: 'AB12345' })] }), 'p-1', 'bl')
    expect(master.matchedField).toBe('masterBl')
    const air = oneDiff(
      run({ rows: [fcl({ itemId: '1', refEmbarque: 'DAP - ITAJAI', blAwb: '123-4567' })], processes: [portalFcl({ category: 'AEREO', mawb: '1234567' })] }),
      'p-1',
      'bl'
    )
    expect(air.matchedField).toBe('mawb')
    expect(oneDiff(run({ rows, processes: [portalFcl({ masterBl: 'XYZ' })] }), 'p-1', 'bl')).toMatchObject({ kind: 'divergente', counts: true })
    expect(oneDiff(run({ rows, processes: [portalFcl({})] }), 'p-1', 'bl').kind).toBe('portal_sem_dado')
  })

  it('DI/DUIMP: diferencas saem com applicable false (nunca candidatas da F2)', () => {
    const rows = [fcl({ itemId: '1', diNumber: '25/1234567-8', diDate: '2026-10-06' })]
    const result = run({
      rows,
      processes: [portalFcl({ duimpNumber: '99/0000000-0', duimpRegisteredAt: '2026-10-07T08:30' })],
    })
    const di = diffsOf(result, 'p-1', 'di')
    expect(di).toHaveLength(2)
    expect(di.every((diff) => diff.kind === 'divergente' && diff.applicable === false)).toBe(true)
    const equal = run({ rows, processes: [portalFcl({ duimpNumber: '2512345678', duimpRegisteredAt: '2026-10-06T08:30' })] })
    const formats = diffsOf(equal, 'p-1', 'di')
    expect(formats).toHaveLength(1)
    expect(formats[0]).toMatchObject({ kind: 'formato', counts: false, applicable: false })
  })

  it('applicable segue F2_CANDIDATE_FIELDS: ETD/navio/destino sim; ETA, DI, status, categoria e pedido nao', () => {
    const rows = [fcl({ itemId: '1', etd: '2026-10-06', eta: '2026-10-14', destination: 'SANTOS', vesselRaw: 'DELTA BRIDGE/105W', status: 'EMBARCOU', diNumber: 'X1' })]
    const result = run({
      rows,
      processes: [portalFcl({ etd: '2026-10-01', eta: '2026-10-01', destination: 'ITAJAÍ', vesselName: 'ALFA MAERSK', voyage: '1', processStatus: 'Carga recebida', duimpNumber: 'Y2', processNumber: 'PO 9036' })],
    })
    const applicable = Object.fromEntries(
      entryOf(result, 'p-1').diffs.map((diff) => [diff.field, diff.applicable])
    )
    expect(applicable).toMatchObject({
      etd: true, vessel: true, destination: true, eta: false, di: false, status: false, pedido: false,
    })
  })

  it('FIELD_AUTHORITY padrao (rotulo neutro) e override por campo', () => {
    const rows = [fcl({ itemId: '1', etd: '2026-10-06' })]
    const processes = [portalFcl({ etd: '2026-10-01' })]
    const neutral = oneDiff(run({ rows, processes }), 'p-1', 'etd')
    expect(neutral).toMatchObject({ authority: 'a_definir', authorityLabel: 'Portal × ERP' })
    const erp = oneDiff(run({ rows, processes, fieldAuthority: { etd: 'erp' } }), 'p-1', 'etd')
    expect(erp).toMatchObject({ authority: 'erp', authorityLabel: 'provável erro no Portal' })
    const portal = oneDiff(run({ rows, processes, fieldAuthority: { etd: 'portal' } }), 'p-1', 'etd')
    expect(portal).toMatchObject({ authority: 'portal', authorityLabel: 'ERP desatualizado' })
    // o override de um campo nao muda os outros
    expect(FIELD_AUTHORITY.etd).toBe('a_definir')
  })
})

describe('itens e quantidade (D-5, kg)', () => {
  const items = (...list) => list.map(([commercialName, quantity, poNumber], index) => ({
    id: `it-${index}`, commercialName, quantity, ...(poNumber === undefined ? {} : { poNumber }),
  }))

  it('itens: faltando no Portal = portal_sem_dado; sobrando = divergente; nomes comparados por fold', () => {
    const rows = [
      fcl({ itemId: '1', commercialName: 'ACIDO PSI', quantityKg: 100 }),
      fcl({ itemId: '2', commercialName: 'RESINA ÔMEGA', quantityKg: 200 }),
    ]
    const result = run({ rows, processes: [portalFcl({ items: items(['resina omega', 200], ['SAL TAU', 50]) })] })
    const found = diffsOf(result, 'p-1', 'items')
    expect(found.map((diff) => [diff.kind, diff.counts])).toEqual([
      ['portal_sem_dado', true],
      ['divergente', true],
    ])
    expect(found[0].erp).toBe('ACIDO PSI')
    expect(found[1].portal).toBe('SAL TAU')
  })

  it('quantidade igual: FCL com 2 linhas do mesmo item (1000 + 500.5) x Portal 1500.5 = sem diff', () => {
    const rows = [
      fcl({ itemId: '1', commercialName: 'RESINA OMEGA', quantityKg: 1000 }),
      fcl({ itemId: '2', commercialName: 'Resina Ômega', quantityKg: 500.5 }),
    ]
    const result = run({ rows, processes: [portalFcl({ items: items(['RESINA OMEGA', 1500.5]) })] })
    expect(diffsOf(result, 'p-1', 'quantity')).toEqual([])
    expect(diffsOf(result, 'p-1', 'items')).toEqual([])
  })

  it('quantidade diferente: divergente, conta, e a nota traz os 2 totais em 3 casas', () => {
    const rows = [
      fcl({ itemId: '1', commercialName: 'RESINA OMEGA', quantityKg: 1000 }),
      fcl({ itemId: '2', commercialName: 'RESINA OMEGA', quantityKg: 500.5 }),
    ]
    const diff = oneDiff(run({ rows, processes: [portalFcl({ items: items(['RESINA OMEGA', 1500]) })] }), 'p-1', 'quantity')
    expect(diff).toMatchObject({ kind: 'divergente', counts: true, applicable: true })
    expect(diff.note).toContain('1500,000')
    expect(diff.note).toContain('1500,500')
    expect(diff.note).toContain('0,500')
  })

  it('quantidade com float: ERP 0.1 + 0.2 x Portal 0.3 = sem diff (comparacao a 3 casas)', () => {
    const rows = [
      fcl({ itemId: '1', commercialName: 'RESINA OMEGA', quantityKg: 0.1 }),
      fcl({ itemId: '2', commercialName: 'RESINA OMEGA', quantityKg: 0.2 }),
    ]
    const result = run({ rows, processes: [portalFcl({ items: items(['RESINA OMEGA', 0.3]) })] })
    expect(diffsOf(result, 'p-1', 'quantity')).toEqual([])
  })

  it('quantidade com null: soma parcial diferente = informativo (nota "1 linha sem quantidade"); igual = sem diff; tudo null = erp_sem_dado', () => {
    const partial = [
      fcl({ itemId: '1', commercialName: 'RESINA OMEGA', quantityKg: 1000 }),
      fcl({ itemId: '2', commercialName: 'RESINA OMEGA', quantityKg: '' }),
    ]
    const different = oneDiff(run({ rows: partial, processes: [portalFcl({ items: items(['RESINA OMEGA', 1200]) })] }), 'p-1', 'quantity')
    expect(different).toMatchObject({ kind: 'informativo', counts: false })
    expect(different.note).toContain('1 linha sem quantidade')
    expect(diffsOf(run({ rows: partial, processes: [portalFcl({ items: items(['RESINA OMEGA', 1000]) })] }), 'p-1', 'quantity')).toEqual([])

    const allNull = [
      fcl({ itemId: '1', commercialName: 'RESINA OMEGA', quantityKg: '' }),
      fcl({ itemId: '2', commercialName: 'RESINA OMEGA', quantityKg: null }),
    ]
    expect(oneDiff(run({ rows: allNull, processes: [portalFcl({ items: items(['RESINA OMEGA', 1200]) })] }), 'p-1', 'quantity')).toMatchObject({
      kind: 'erp_sem_dado', counts: false,
    })
  })

  it('quantidade zerada no Portal e ERP > 0 = portal_sem_dado', () => {
    const rows = [fcl({ itemId: '1', commercialName: 'RESINA OMEGA', quantityKg: 800 })]
    const diff = oneDiff(run({ rows, processes: [portalFcl({ items: items(['RESINA OMEGA', 0]) })] }), 'p-1', 'quantity')
    expect(diff).toMatchObject({ kind: 'portal_sem_dado', counts: true })
  })

  it('CON: o mesmo nome em 2 PEDIDOs e comparado por PO; mudar uma PO gera 1 diff com o PEDIDO na nota', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9020, poRef: 'ALFA SEA 920-26', refEmbarque: 'CON CN 940-26', commercialName: 'SOLVENTE PI', quantityKg: 2000 }),
      fcl({ itemId: '2', pedido: 9021, poRef: 'BETA SEA 921-26', refEmbarque: 'CON CN 940-26', commercialName: 'SOLVENTE PI', quantityKg: 3000 }),
    ]
    const make = (second) =>
      makePortalProcess({
        id: 'p-con', name: 'CON CN 940-26', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: '9020', reference: 'ALFA SEA 920-26' }, { po: '9021', reference: 'BETA SEA 921-26' }],
        items: items(['SOLVENTE PI', 2000, '9020'], ['SOLVENTE PI', second, '9021']),
      })
    expect(diffsOf(run({ rows, processes: [make(3000)] }), 'p-con', 'quantity')).toEqual([])
    const changed = diffsOf(run({ rows, processes: [make(2500)] }), 'p-con', 'quantity')
    expect(changed).toHaveLength(1)
    expect(changed[0].note).toContain('PO 9021')
    expect(changed[0].kind).toBe('divergente')
  })

  it('CON: item do Portal com poNumber vazio fica fora da quantidade e a linha Itens o acusa', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9020, poRef: 'ALFA SEA 920-26', refEmbarque: 'CON CN 941-26', commercialName: 'SOLVENTE PI', quantityKg: 2000 }),
      fcl({ itemId: '2', pedido: 9021, poRef: 'BETA SEA 921-26', refEmbarque: 'CON CN 941-26', commercialName: 'ACIDO PSI', quantityKg: 100 }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 941-26', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: '9020', reference: 'ALFA SEA 920-26' }, { po: '9021', reference: 'BETA SEA 921-26' }],
        items: items(['SOLVENTE PI', 999, ''], ['ACIDO PSI', 100, '9021']),
      }),
    ]
    const result = run({ rows, processes })
    expect(diffsOf(result, 'p-con', 'quantity')).toEqual([])
    const itemDiffs = diffsOf(result, 'p-con', 'items')
    expect(itemDiffs).toHaveLength(1)
    expect(itemDiffs[0]).toMatchObject({ kind: 'divergente' })
    expect(itemDiffs[0].note).toContain('sem PO')
  })

  it('CON: o mesmo item na PO errada e divergente (PO diferente)', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9020, poRef: 'ALFA SEA 920-26', refEmbarque: 'CON CN 942-26', commercialName: 'SOLVENTE PI', quantityKg: 2000 }),
      fcl({ itemId: '2', pedido: 9021, poRef: 'BETA SEA 921-26', refEmbarque: 'CON CN 942-26', commercialName: 'ACIDO PSI', quantityKg: 100 }),
    ]
    const processes = [
      makePortalProcess({
        id: 'p-con', name: 'CON CN 942-26', category: 'CONSOLIDADO',
        purchaseOrders: [{ po: '9020', reference: 'ALFA SEA 920-26' }, { po: '9021', reference: 'BETA SEA 921-26' }],
        items: items(['SOLVENTE PI', 2000, '9021'], ['ACIDO PSI', 100, '9021']),
      }),
    ]
    const itemDiffs = diffsOf(run({ rows, processes }), 'p-con', 'items')
    expect(itemDiffs).toHaveLength(1)
    expect(itemDiffs[0].note).toContain('PO diferente')
  })
})

describe('so no ERP', () => {
  it('caso-real: CR-24 uma categoria de cada, ETD vencido e CON aguardando embarque fora do Portal', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9801, poRef: 'PI SEA 908-26', refEmbarque: 'NACIONAL', status: 'AG. EMBARQUE' }),
      fcl({ itemId: '2', pedido: 9802, poRef: 'MU SAMPLE 903-26', refEmbarque: 'AMOSTRA', status: 'EMBARCOU' }),
      fcl({ itemId: '3', pedido: 9803, poRef: 'XI SEA 912-26', status: 'ATRAC. AG. LIBERAÇÃO', statusNf: 'Recebido Total' }),
      fcl({ itemId: '4', pedido: 9804, poRef: 'RHO SEA 913-26', status: 'EMBARCOU', etaFinal: 46309 }),
      fcl({ itemId: '5', pedido: 9805, poRef: 'OMICRON SEA 907-26', refEmbarque: 'LCL - FOB SHANGHAI', status: 'AG. PRONT. DA CARGA', etd: 46281 }),
      fcl({ itemId: '6', pedido: 9806, poRef: 'TAU SEA 914-26', refEmbarque: 'FCL - FOB BUSAN', status: 'AG. PAGAMENTO (ANT)' }),
      fcl({ itemId: '7', pedido: 9807, poRef: 'UPSILON SEA 915-26', refEmbarque: 'FCL - FOB KOBE', status: 'AG. EMBARQUE' }),
      fcl({ itemId: '8', pedido: 9808, poRef: 'FI SEA 916-26', refEmbarque: 'FCL - FOB KOBE', status: 'EMBARCOU', eta: 46330 }),
      fcl({ itemId: '9', pedido: 9809, poRef: 'QUI SEA 917-26', status: 'EM TRANSITO' }),
      fcl({ itemId: '10', pedido: 9810, poRef: 'PSI SEA 918-26', refEmbarque: 'CON CN 903-26', status: 'AG. EMBARQUE' }),
      fcl({ itemId: '11', pedido: 9811, poRef: 'OMEGA SEA 919-26', refEmbarque: 'CON CN 903-26', status: 'AG. EMBARQUE' }),
    ]
    const result = run({ rows, processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })] })
    expect(Object.keys(result.summary.erpOnlyByCategory)).toEqual(ERP_ONLY_CATEGORIES.map((category) => category.key))
    expect(result.summary.erpOnlyByCategory).toEqual({
      nacional: 1,
      amostra_courier: 1,
      erp_desatualizado: 1,
      possivelmente_recebido_oculto: 1,
      a_consolidar: 1,
      aguardando_prontidao_pagamento: 1,
      aguardando_embarque: 2,
      embarcado_sem_processo: 1,
      indefinido: 1,
    })
    expect(result.summary.erpOnly).toBe(10)
    const byKey = Object.fromEntries(result.erpOnly.map((item) => [item.shipmentKey, item]))
    expect(byKey['OMICRON SEA 907-26'].flags).toContain('etd_vencido')
    expect(byKey['CON CN 903-26']).toMatchObject({ category: 'aguardando_embarque', kind: 'CONSOLIDADO' })
    expect(byKey['CON CN 903-26'].flags).toContain('consolidado_fora_do_portal')
    expect(byKey['CON CN 903-26'].pedidos).toEqual(['9810', '9811'])
    expect(byKey['FI SEA 916-26'].flags).toEqual([])
    // a saida segue a ordem de precedencia das categorias
    const order = ERP_ONLY_CATEGORIES.map((category) => category.key)
    const positions = result.erpOnly.map((item) => order.indexOf(item.category))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('caso-real: CR-17 EMBARCOU com NF Recebido Total, sem processo: erp_desatualizado', () => {
    const rows = [fcl({ itemId: '1', pedido: 9701, poRef: 'ALFA SEA 970-26', status: 'EMBARCOU', statusNf: 'Recebido Total' })]
    const result = run({ rows, processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })] })
    expect(result.erpOnly.map((item) => item.category)).toEqual(['erp_desatualizado'])
  })

  it('possivelmente_recebido_oculto: etaFinal, nfDate ou ETA com mais de 7 dias; o aviso lista_portal_parcial acompanha', () => {
    const base = { status: 'EMBARCOU' }
    const cases = [
      ['etaFinal', fcl({ itemId: '1', pedido: 9711, poRef: 'ALFA SEA 971-26', ...base, etaFinal: '2026-10-01' })],
      ['nfDate', fcl({ itemId: '2', pedido: 9712, poRef: 'BETA SEA 972-26', ...base, nfDate: '2026-10-01' })],
      ['eta 8 dias', fcl({ itemId: '3', pedido: 9713, poRef: 'GAMA SEA 973-26', ...base, eta: '2026-09-24' })],
    ]
    for (const [label, row] of cases) {
      const result = run({ rows: [row], processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })] })
      expect(result.erpOnly.map((item) => item.category), label).toEqual(['possivelmente_recebido_oculto'])
      expect(codes(result), label).toContain('lista_portal_parcial')
    }
    // exatamente 7 dias NAO e "mais de 7"
    const edge = run({
      rows: [fcl({ itemId: '4', pedido: 9714, poRef: 'DELTA SEA 974-26', ...base, eta: '2026-09-25' })],
      processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })],
    })
    expect(edge.erpOnly.map((item) => item.category)).toEqual(['embarcado_sem_processo'])
    expect(codes(edge)).not.toContain('lista_portal_parcial')
    // estagio 0 nunca e "recebido"
    const early = run({
      rows: [fcl({ itemId: '5', pedido: 9715, poRef: 'EPSILON SEA 975-26', status: 'AG. EMBARQUE', eta: '2026-01-01' })],
      processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })],
    })
    expect(early.erpOnly[0].category).toBe('aguardando_embarque')
  })

  it('caso-real: CR-26 PO com SAMPLE e REF LCL Shanghai em pre-embarque cai em a_consolidar, nunca em amostra_courier', () => {
    const rows = [
      fcl({
        itemId: '1', pedido: 9171, poRef: 'XI SAMPLE 905-26', refEmbarque: 'LCL -  FOB SHANGHAI',
        status: 'AG. PRONT. DA CARGA', exporter: 'XI TRADING',
      }),
    ]
    const result = run({ rows, processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })] })
    expect(result.erpOnly).toHaveLength(1)
    expect(result.erpOnly[0]).toMatchObject({ category: 'a_consolidar', kind: 'LCL', pedidos: ['9171'] })
    expect(result.summary.erpOnlyByCategory.amostra_courier).toBe(0)
    expect(codes(result)).not.toContain('aereo_inferido')
  })

  it('caso-real: CR-27 LCL Shanghai x Taiwan x Shanghai ja embarcada', () => {
    const rows = [
      fcl({ itemId: '1', pedido: 9172, poRef: 'OMICRON SEA 907-26', refEmbarque: 'LCL - FOB SHANGHAI', status: 'AG. PRONT. DA CARGA' }),
      fcl({ itemId: '2', pedido: 9173, poRef: 'PI SEA 908-26', refEmbarque: 'LCL - FOB TAIWAN', status: 'AG. PRONT. DA CARGA' }),
      fcl({ itemId: '3', pedido: 9174, poRef: 'RHO SEA 911-26', refEmbarque: 'LCL - FOB SHANGHAI', status: 'EMBARCOU', eta: '2026-11-04' }),
    ]
    const result = run({ rows, processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })] })
    const category = (key) => result.erpOnly.find((item) => item.shipmentKey === key).category
    expect(category('OMICRON SEA 907-26')).toBe('a_consolidar')
    expect(category('PI SEA 908-26')).toBe('aguardando_prontidao_pagamento')
    expect(category('RHO SEA 911-26')).toBe('embarcado_sem_processo')
    expect(ERP_ONLY_CATEGORIES.find((item) => item.key === 'a_consolidar').label).toBe('Aguardando consolidação (provável)')
  })

  it('embarque inativo nunca vira so no ERP, mas participa do casamento', () => {
    const rows = [fcl({ itemId: '1', status: 'CONCLUÍDO' }), fcl({ itemId: '2', pedido: 9500, poRef: 'ALFA SEA 950-26', status: 'CONCLUÍDO' })]
    const result = run({ rows, processes: [portalFcl()] })
    expect(result.matched).toHaveLength(1)
    expect(result.erpOnly).toEqual([])
    expect(result.summary.activeShipments).toBe(0)
  })
})

describe('contrato do resultado', () => {
  const scenario = () => {
    const rows = buildScenarioLooseRows().map((row, index) => ({ ...row, rowNumber: index + 2 }))
    return { rows, processes: buildScenarioPortalProcesses() }
  }

  it('summary, sourceInfo e ordem das chaves', () => {
    const { rows, processes } = scenario()
    const result = run({ rows, processes, today: SCENARIO_TODAY })
    expect(Object.keys(result)).toEqual([
      'blocked', 'blockedMessage', 'sourceInfo', 'summary', 'matched', 'erpOnly', 'portalOnly', 'warnings',
    ])
    expect(result.sourceInfo).toEqual({
      source: 'teste', label: 'Fonte de teste', fileName: 'teste.xlsx', fetchedAt: '', rowCount: rows.length, generatedOn: SCENARIO_TODAY,
    })
    expect(Object.keys(result.summary)).toEqual([
      'erpRows', 'shipments', 'activeShipments', 'matched', 'matchedWithDiffs', 'erpMissingFields', 'erpOnly',
      'erpOnlyByCategory', 'portalOnly', 'portalOnlyArchived', 'warnings', 'warningsByCode',
    ])
    expect(result.summary).toMatchObject({
      erpRows: 10, shipments: 8, activeShipments: 7, matched: 3, matchedWithDiffs: 1, erpOnly: 5,
      portalOnly: 2, portalOnlyArchived: 1,
    })
    for (const diff of result.matched.flatMap((entry) => entry.diffs)) {
      expect(Object.keys(diff)).toEqual(expect.arrayContaining([
        'field', 'label', 'portalFields', 'portal', 'erp', 'erpValue', 'kind', 'counts', 'applicable', 'note',
      ]))
    }
    for (const warning of result.warnings) {
      expect(Object.keys(warning.ref)).toEqual(['rowNumber', 'itemId', 'pedido', 'shipmentKey', 'processId'])
    }
  })

  it('avisos ordenados por code, rowNumber (null por ultimo), itemId e pedido', () => {
    const rows = [
      { ...fcl({ itemId: 'B', refEmbarque: 'DAP - ITAJAI' }), rowNumber: 9 },
      { ...fcl({ itemId: 'A', pedido: 9037, poRef: 'ALFA SEA 905-26', refEmbarque: 'DAP - ITAJAI' }), rowNumber: 3 },
      { ...fcl({ itemId: 'C', pedido: 9038, poRef: 'GAMA SEA 906-26', refEmbarque: 'XYZ' }), rowNumber: 5 },
    ]
    const result = run({ rows, processes: [portalFcl({ name: 'SEM ERP', processNumber: '9999' })] })
    const aereo = result.warnings.filter((warning) => warning.code === 'aereo_inferido').map((warning) => warning.ref.rowNumber)
    expect(aereo).toEqual([3, 9])
    const sortedCodes = codes(result)
    expect(sortedCodes).toEqual([...sortedCodes].sort())
    expect(result.summary.warningsByCode.aereo_inferido).toBe(2)
  })

  it('bloqueio por coluna de data irreconhecivel: arrays vazios e mensagem com a coluna', () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      fcl({ itemId: `B-${index}`, pedido: 9600 + index, poRef: `ALFA SEA 96${index}-26`, etd: '10/6/26' })
    )
    const result = run({ rows, processes: [portalFcl()] })
    expect(result.blocked).toBe('coluna_data_irreconhecivel')
    expect(result.blockedMessage).toContain('ETD (EMBARQUE)')
    expect(result.matched).toEqual([])
    expect(result.erpOnly).toEqual([])
    expect(result.portalOnly).toEqual([])
  })

  it('saida ordenada e deterministica: embaralhar linhas e processos nao muda o resultado', () => {
    const { rows, processes } = scenario()
    const forward = run({ rows, processes, today: SCENARIO_TODAY })
    const shuffled = run({ rows: [...rows].reverse(), processes: [...processes].reverse(), today: SCENARIO_TODAY })
    // run() renumera as linhas pela posicao; compara sem rowNumber nem sourceInfo
    const strip = (result) => JSON.parse(JSON.stringify({ ...result, sourceInfo: null }, (key, value) => (key === 'rowNumber' ? null : value)))
    expect(strip(shuffled)).toEqual(strip(forward))
  })

  it('nao altera os processos de entrada (structuredClone antes e depois)', () => {
    const { rows, processes } = scenario()
    const before = structuredClone(processes)
    run({ rows, processes, today: SCENARIO_TODAY })
    expect(processes).toEqual(before)
  })

  it('reconcileErp e puro: mesma entrada, mesma saida, sem mutar os embarques', () => {
    const { rows, processes } = scenario()
    const full = run({ rows, processes, today: SCENARIO_TODAY })
    expect(full.summary.matched).toBe(3)
    const empty = reconcileErp(processes, [], { today: SCENARIO_TODAY })
    expect(empty).toMatchObject({ blocked: null, matched: [], erpOnly: [] })
    expect(empty.portalOnly).toHaveLength(processes.length)
  })

  it('nenhuma sentinela financeira em JSON.stringify(result), mesmo vindo da matriz do xlsx', () => {
    const matrix = looseRowsToMatrix(buildScenarioLooseRows())
    expect(JSON.stringify(matrix)).toContain('FIN-SENTINEL-7731')
    const parsed = parseDbcorpRows(matrix)
    const result = runErpReconciliation({
      loaded: { rows: parsed.rows, warnings: parsed.warnings, meta: { fileName: 'x.xlsx', rowCount: parsed.rows.length } },
      processes: buildScenarioPortalProcesses(),
      today: SCENARIO_TODAY,
      source: SOURCE,
    })
    const text = JSON.stringify(result)
    for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(text).not.toContain(sentinel)
    expect(result.summary.matched).toBe(3)
  })
})
