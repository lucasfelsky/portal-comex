// Conciliacao ERP (DBCorp) x Portal - F1: agrupamento das linhas em embarques.
import { describe, expect, it } from 'vitest'
import { normalizeErpItemRows } from '../../src/features/erp/erpItemRow.js'
import { ERP_STATUS_STAGES, groupErpShipments } from '../../src/features/erp/groupErpShipments.js'
import {
  FINANCIAL_SENTINEL_STRINGS,
  looseRowsToMatrix,
  makeLooseRow,
} from '../fixtures/erp/dbcorpSynthetic.js'
import { parseDbcorpRows } from '../../src/features/erp/parseDbcorpRows.js'

function group(looseRows) {
  const normalized = normalizeErpItemRows(looseRows, { source: 'teste' })
  return groupErpShipments(normalized.rows)
}

const find = (shipments, key, kind) =>
  shipments.find((shipment) => shipment.key === key && (!kind || shipment.kind === kind))

const codes = (warnings) => warnings.map((warning) => warning.code)

describe('groupErpShipments - chave e classificacao', () => {
  it('ERP_STATUS_STAGES: os 6 valores do vocabulario do DBCorp (D-9)', () => {
    expect(ERP_STATUS_STAGES).toEqual({
      'AG. PAGAMENTO (ANT)': 0,
      'AG. PRONT. DA CARGA': 0,
      'AG. EMBARQUE': 0,
      EMBARCOU: 1,
      'ATRAC. AG. LIBERAÇÃO': 2,
      CONCLUÍDO: 3,
    })
  })

  it('consolidado agrupa pela REF (varias POs); os demais pela PO dobrada', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 901-26' }),
      makeLooseRow({ itemId: '2', pedido: 9011, poRef: 'GAMA SEA 906-26', refEmbarque: 'CON CN 901-26' }),
      makeLooseRow({ itemId: '3', pedido: 9036, poRef: 'Beta  Sea 904-26', refEmbarque: 'FCL - CFR HAMBURG' }),
      makeLooseRow({ itemId: '4', pedido: 9036, poRef: 'BETA SEA 904-26', refEmbarque: 'FCL - CFR HAMBURG' }),
    ])
    expect(shipments.map((shipment) => `${shipment.kind}|${shipment.key}`)).toEqual([
      'CONSOLIDADO|CON CN 901-26',
      'FCL|BETA SEA 904-26',
    ])
    const con = shipments[0]
    expect(con.portalCategory).toBe('CONSOLIDADO')
    expect(con.orders.map((order) => order.pedido)).toEqual(['9010', '9011'])
    expect(con.items).toHaveLength(2)
    expect(shipments[1].items).toHaveLength(2)
    expect(shipments[1].orders).toHaveLength(1)
  })

  it('portalCategory: CON/FCL/LCL/AEREO mapeiam; AMOSTRA, NACIONAL e INDEFINIDO ficam null', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', poRef: 'ALFA SEA 901-26', refEmbarque: 'CON CN 901-26' }),
      makeLooseRow({ itemId: '2', poRef: 'ALFA SEA 902-26', refEmbarque: 'FCL - FOB BUSAN' }),
      makeLooseRow({ itemId: '3', poRef: 'ALFA SEA 903-26', refEmbarque: 'LCL - FOB KOBE' }),
      makeLooseRow({ itemId: '4', poRef: 'ALFA AIR 904-26', refEmbarque: 'DAP - ITAJAI' }),
      makeLooseRow({ itemId: '5', poRef: 'ALFA SEA 905-26', refEmbarque: 'AMOSTRA' }),
      makeLooseRow({ itemId: '6', poRef: 'ALFA SEA 906-26', refEmbarque: 'NACIONAL' }),
      makeLooseRow({ itemId: '7', poRef: 'ALFA SEA 907-26', refEmbarque: 'XYZ' }),
    ])
    const categories = Object.fromEntries(shipments.map((shipment) => [shipment.kind, shipment.portalCategory]))
    expect(categories).toEqual({
      CONSOLIDADO: 'CONSOLIDADO',
      FCL: 'FCL',
      LCL: 'LCL',
      AEREO: 'AEREO',
      AMOSTRA: null,
      NACIONAL: null,
      INDEFINIDO: null,
    })
  })
})

describe('groupErpShipments - casos reais sinteticos', () => {
  it('caso-real: CR-04 PO com 2 PEDIDOs, um em CON e outro em AMOSTRA, vira 2 embarques', () => {
    const { shipments, warnings } = group([
      makeLooseRow({ itemId: '1', pedido: 9016, poRef: 'KAPPA SAMPLE 910-26', refEmbarque: 'CON CN 919-26' }),
      makeLooseRow({ itemId: '2', pedido: 9145, poRef: 'KAPPA SAMPLE 910-26', refEmbarque: 'AMOSTRA' }),
    ])
    expect(shipments).toHaveLength(2)
    const con = find(shipments, 'CON CN 919-26', 'CONSOLIDADO')
    const sample = find(shipments, 'KAPPA SAMPLE 910-26', 'AMOSTRA')
    expect(con.orders.map((order) => order.pedido)).toEqual(['9016'])
    expect(sample.orders.map((order) => order.pedido)).toEqual(['9145'])
    expect(codes(warnings)).toContain('po_com_varios_pedidos')
  })

  it('caso-real: CR-05 PO com 2 PEDIDOs no mesmo embarque: 1 embarque com 2 orders', () => {
    const { shipments, warnings } = group([
      makeLooseRow({ itemId: '1', pedido: 9164, poRef: 'ZETA SEA 902-26', refEmbarque: 'FCL - FOB BUSAN' }),
      makeLooseRow({ itemId: '2', pedido: 9160, poRef: 'ZETA SEA 902-26', refEmbarque: 'FCL - FOB BUSAN' }),
    ])
    expect(shipments).toHaveLength(1)
    expect(shipments[0].orders.map((order) => order.pedido)).toEqual(['9160', '9164'])
    expect(codes(warnings)).toEqual(['po_com_varios_pedidos'])
  })

  it('caso-real: CR-06 PO dividida .1 em CON DG e .2 em LCL: po_dividida e poBase', () => {
    const { shipments, warnings } = group([
      makeLooseRow({ itemId: '1', pedido: 9050, poRef: 'LAMBDA SEA 901-26.1', refEmbarque: 'CON DG 909-26' }),
      makeLooseRow({ itemId: '2', pedido: 9050, poRef: 'LAMBDA SEA 901-26.2', refEmbarque: 'LCL - FOB KOBE' }),
    ])
    expect(shipments).toHaveLength(2)
    const con = find(shipments, 'CON DG 909-26')
    const lcl = find(shipments, 'LAMBDA SEA 901-26.2')
    expect(con.orders[0]).toMatchObject({ poBase: 'LAMBDA SEA 901-26', poPart: '1' })
    expect(lcl.orders[0]).toMatchObject({ poBase: 'LAMBDA SEA 901-26', poPart: '2' })
    expect(codes(warnings).filter((code) => code === 'po_dividida')).toHaveLength(2)
    // mesmo PEDIDO nas duas partes da PO dividida nao e "varias POs"
    expect(codes(warnings)).not.toContain('pedido_com_varias_pos')
  })

  it('caso-real: CR-07 amostra dentro de CON fica no CON, sem conflito de navio', () => {
    const { shipments, warnings } = group([
      makeLooseRow({ itemId: '1', pedido: 9031, poRef: 'MU SAMPLE 903-26', refEmbarque: 'CON CN 931-26', vesselRaw: 'AMOSTRA' }),
      makeLooseRow({ itemId: '2', pedido: 9032, poRef: 'PSI SEA 903-26', refEmbarque: 'CON CN 931-26', vesselRaw: 'ALFA MAERSK 639W' }),
    ])
    expect(shipments).toHaveLength(1)
    const con = shipments[0]
    expect(con.orders.map((order) => order.pedido)).toEqual(['9031', '9032'])
    expect(con.conflicts).toEqual([])
    expect(con.transport.vessel).toEqual({ raw: 'ALFA MAERSK 639W', name: 'ALFA MAERSK', voyage: '639W' })
    expect(codes(warnings)).not.toContain('conflito_no_grupo')
  })

  it('caso-real: CR-09 ITAPOA e ITAPOÁ na mesma REF nao geram conflito', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', pedido: 9040, poRef: 'ALFA SEA 940-26', refEmbarque: 'CON CN 932-26', destination: 'ITAPOA' }),
      makeLooseRow({ itemId: '2', pedido: 9041, poRef: 'BETA SEA 941-26', refEmbarque: 'CON CN 932-26', destination: 'ITAPOÁ' }),
    ])
    expect(shipments).toHaveLength(1)
    expect(shipments[0].conflicts).toEqual([])
    // a forma "crua" escolhida nao depende da ordem das linhas
    expect(shipments[0].transport.destination).toBe('ITAPOA')
  })

  it('caso-real: CR-17 EMBARCOU com NF Recebido Total fica ativo e marcado concludedByNf', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', status: 'EMBARCOU', statusNf: 'Recebido Total', poRef: 'ALFA SEA 917-26' }),
    ])
    expect(shipments[0]).toMatchObject({ active: true, concludedByNf: true, stage: 1 })
  })

  it('Recebido Parcial e Pendente continuam abertas (nao concluem pela NF)', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', status: 'EMBARCOU', statusNf: 'Recebido Total', poRef: 'ALFA SEA 918-26' }),
      makeLooseRow({ itemId: '2', status: 'EMBARCOU', statusNf: 'Recebido Parcial', poRef: 'ALFA SEA 918-26' }),
      makeLooseRow({ itemId: '3', status: 'EMBARCOU', statusNf: 'Pendente', poRef: 'BETA SEA 918-26' }),
    ])
    expect(find(shipments, 'ALFA SEA 918-26')).toMatchObject({ active: true, concludedByNf: false })
    expect(find(shipments, 'BETA SEA 918-26')).toMatchObject({ active: true, concludedByNf: false })
  })
})

describe('groupErpShipments - estado, estagio e conflitos', () => {
  it('grupo so com linhas CONCLUIDO: inativo e estagio 3', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', status: 'CONCLUÍDO', poRef: 'ALFA SEA 920-26' }),
      makeLooseRow({ itemId: '2', status: 'concluido', poRef: 'ALFA SEA 920-26' }),
    ])
    expect(shipments[0]).toMatchObject({ active: false, stage: 3, concludedByNf: false })
  })

  it('estagio = menor entre as linhas abertas (concluidas nao contam)', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', status: 'CONCLUÍDO', poRef: 'ALFA SEA 921-26' }),
      makeLooseRow({ itemId: '2', status: 'ATRAC. AG. LIBERAÇÃO', poRef: 'ALFA SEA 921-26' }),
      makeLooseRow({ itemId: '3', status: 'EMBARCOU', poRef: 'ALFA SEA 921-26' }),
    ])
    expect(shipments[0]).toMatchObject({ active: true, stage: 1 })
    expect(shipments[0].statuses).toEqual(['ATRAC. AG. LIBERAÇÃO', 'CONCLUÍDO', 'EMBARCOU'])
  })

  it('status desconhecido: estagio null e aviso status_desconhecido', () => {
    const { shipments, warnings } = group([
      { ...makeLooseRow({ itemId: '1', status: 'EM TRANSITO', poRef: 'ALFA SEA 922-26' }), rowNumber: 8 },
    ])
    expect(shipments[0]).toMatchObject({ active: true, stage: null })
    const warning = warnings.find((item) => item.code === 'status_desconhecido')
    expect(warning.ref).toMatchObject({ shipmentKey: 'ALFA SEA 922-26', rowNumber: 8 })
    expect(warning.message).toContain('EM TRANSITO')
  })

  it('conflito interno com 2 ETDs reais: transport.etd vazio + conflicts + aviso', () => {
    const { shipments, warnings } = group([
      makeLooseRow({ itemId: '1', poRef: 'ALFA SEA 923-26', etd: 46301 }),
      makeLooseRow({ itemId: '2', poRef: 'ALFA SEA 923-26', etd: 46281 }),
    ])
    expect(shipments[0].transport.etd).toBe('')
    expect(shipments[0].conflicts).toEqual([{ field: 'etd', values: ['2026-09-16', '2026-10-06'] }])
    expect(codes(warnings)).toContain('conflito_no_grupo')
  })

  it('1 unico valor nao vazio vira o valor do embarque (os vazios nao conflitam)', () => {
    const { shipments } = group([
      makeLooseRow({ itemId: '1', poRef: 'ALFA SEA 924-26', etd: 46301, blAwb: 'ab-123', diNumber: '' }),
      makeLooseRow({ itemId: '2', poRef: 'ALFA SEA 924-26', etd: '', blAwb: 'AB 123', diNumber: '25/1' }),
    ])
    expect(shipments[0].conflicts).toEqual([])
    expect(shipments[0].transport).toMatchObject({ etd: '2026-10-06', diNumber: '25/1' })
    // BL: formas diferentes do mesmo documento nao conflitam
    expect(shipments[0].transport.blAwb).toBe('AB 123')
  })

  it('navio: mesma viagem escrita de 2 jeitos nao conflita; navios diferentes conflitam', () => {
    const same = group([
      makeLooseRow({ itemId: '1', poRef: 'ALFA SEA 925-26', vesselRaw: 'OMEGA BLOOM 1628-089S' }),
      makeLooseRow({ itemId: '2', poRef: 'ALFA SEA 925-26', vesselRaw: 'OMEGA BLOOM/1628-089S' }),
    ])
    expect(same.shipments[0].conflicts).toEqual([])
    const different = group([
      makeLooseRow({ itemId: '1', poRef: 'ALFA SEA 926-26', vesselRaw: 'OMEGA BLOOM 1628-089S' }),
      makeLooseRow({ itemId: '2', poRef: 'ALFA SEA 926-26', vesselRaw: 'DELTA BRIDGE/105W' }),
    ])
    expect(different.shipments[0].conflicts).toHaveLength(1)
    expect(different.shipments[0].conflicts[0].field).toBe('vessel')
    expect(different.shipments[0].transport.vessel).toEqual({ raw: '', name: '', voyage: '' })
  })
})

describe('groupErpShipments - avisos', () => {
  it('consolidado_com_1_po e so informativo e some com 2 POs', () => {
    const one = group([makeLooseRow({ itemId: '1', pedido: 9070, poRef: 'ALFA SEA 970-26', refEmbarque: 'CON CN 970-26' })])
    expect(codes(one.warnings)).toContain('consolidado_com_1_po')
    const two = group([
      makeLooseRow({ itemId: '1', pedido: 9070, poRef: 'ALFA SEA 970-26', refEmbarque: 'CON CN 970-26' }),
      makeLooseRow({ itemId: '2', pedido: 9071, poRef: 'BETA SEA 971-26', refEmbarque: 'CON CN 970-26' }),
    ])
    expect(codes(two.warnings)).not.toContain('consolidado_com_1_po')
  })

  it('pedido_com_varias_pos: o mesmo PEDIDO em POs diferentes', () => {
    const { warnings } = group([
      makeLooseRow({ itemId: '1', pedido: 9100, poRef: 'ALFA SEA 910-26' }),
      makeLooseRow({ itemId: '2', pedido: 9100, poRef: 'BETA SEA 911-26' }),
    ])
    expect(codes(warnings)).toContain('pedido_com_varias_pos')
  })
})

describe('groupErpShipments - determinismo e contrato', () => {
  const rows = () => [
    { ...makeLooseRow({ itemId: 'Z-1', pedido: 9010, poRef: 'ALFA SEA 905-26', refEmbarque: 'CON CN 901-26', destination: 'ITAPOA', etd: 46301 }), rowNumber: 2 },
    { ...makeLooseRow({ itemId: 'Z-2', pedido: 9011, poRef: 'GAMA SEA 906-26', refEmbarque: 'CON CN 901-26', destination: 'ITAPOÁ', nfDate: 46309 }), rowNumber: 3 },
    { ...makeLooseRow({ itemId: 'Z-3', pedido: 9036, poRef: 'BETA SEA 904-26', refEmbarque: 'FCL - CFR HAMBURG', commercialName: 'RESINA OMEGA' }), rowNumber: 4 },
    { ...makeLooseRow({ itemId: 'Z-4', pedido: 9036, poRef: 'BETA SEA 904-26', refEmbarque: 'FCL - CFR HAMBURG', commercialName: 'ACIDO PSI' }), rowNumber: 5 },
  ]

  it('a saida nao depende da ordem das linhas', () => {
    const forward = group(rows())
    const reversed = group([...rows()].reverse())
    expect(reversed.shipments).toEqual(forward.shipments)
    expect(reversed.warnings.map((warning) => warning.message).sort()).toEqual(
      forward.warnings.map((warning) => warning.message).sort()
    )
  })

  it('itens e rowNumbers saem ordenados; nfDate guarda a mais recente', () => {
    const { shipments } = group(rows())
    const fcl = find(shipments, 'BETA SEA 904-26')
    expect(fcl.items.map((item) => item.commercialName)).toEqual(['ACIDO PSI', 'RESINA OMEGA'])
    expect(fcl.rowNumbers).toEqual([4, 5])
    expect(find(shipments, 'CON CN 901-26').nfDate).toBe('2026-10-14')
  })

  it('le so os slots: o texto cru da REF nao decide o tipo', () => {
    const normalized = normalizeErpItemRows([makeLooseRow({ itemId: '1', refEmbarque: 'FCL - CFR HAMBURG' })])
    const tampered = normalized.rows.map((row) => ({ ...row, refEmbarque: 'CON CN 999-26', shipmentKind: 'LCL' }))
    expect(groupErpShipments(tampered).shipments[0].kind).toBe('LCL')
  })

  it('nao altera a entrada e nao vaza sentinela financeira', () => {
    const matrix = looseRowsToMatrix(
      rows().map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'rowNumber')))
    )
    const parsed = parseDbcorpRows(matrix)
    const normalized = normalizeErpItemRows(parsed.rows, { source: 'teste' })
    const before = structuredClone(normalized.rows)
    const grouped = groupErpShipments(normalized.rows)
    expect(normalized.rows).toEqual(before)
    const text = JSON.stringify(grouped)
    for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(text).not.toContain(sentinel)
  })
})
