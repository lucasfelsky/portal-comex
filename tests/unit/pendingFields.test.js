// F17.1a (D-E): "dados pendentes" - calculado na leitura, so' pro admin
// (gating de UI, testado nos componentes). Aqui testamos so' a funcao pura.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getPendingFields } from '../../src/features/processes/pendingFields.js'

function completeMaritimeProcess(overrides = {}) {
  return {
    name: 'Importação Atlas',
    category: 'FCL',
    destination: 'Hamburg',
    processNumber: 'FCL-2026-001',
    etd: '2026-01-01',
    eta: '2026-01-10',
    items: [{ commercialName: 'Resina', quantity: 10 }],
    containerQuantity: 1,
    containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: 'LACRE-1', type: '40DC' }],
    palletQuantity: 0,
    berthed: false,
    supplierName: 'Fornecedor Atlas',
    originLocation: 'Hamburgo',
    incoterm: 'FOB',
    ...overrides,
  }
}

describe('getPendingFields - estágio 0', () => {
  it('processo completo (estágio 0) -> []', () => {
    expect(getPendingFields(completeMaritimeProcess())).toEqual([])
  })

  it('cada regra isolada dispara sozinha', () => {
    expect(getPendingFields(completeMaritimeProcess({ name: '' })).map((f) => f.field)).toContain(
      'name'
    )
    expect(
      getPendingFields(completeMaritimeProcess({ destination: '' })).map((f) => f.field)
    ).toContain('destination')
    expect(getPendingFields(completeMaritimeProcess({ etd: '' })).map((f) => f.field)).toContain(
      'etd'
    )
    expect(getPendingFields(completeMaritimeProcess({ eta: '' })).map((f) => f.field)).toContain(
      'eta'
    )
    expect(
      getPendingFields(completeMaritimeProcess({ items: [] })).map((f) => f.field)
    ).toContain('items')
    expect(
      getPendingFields(completeMaritimeProcess({ containers: [] })).map((f) => f.id)
    ).toContain('containers')
  })

  it('CONSOLIDADO nao cobra processNumber', () => {
    const process = completeMaritimeProcess({ category: 'CONSOLIDADO', processNumber: '' })
    expect(getPendingFields(process).map((f) => f.field)).not.toContain('processNumber')
  })

  it('AEREO nao cobra containers', () => {
    const process = completeMaritimeProcess({
      category: 'AEREO',
      containers: [],
      containerQuantity: 0,
      arrived: false,
      grossWeightKg: 10,
      chargeableWeightKg: 10,
      packagesQuantity: 1,
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('containers')
  })

  it('LCL cobra palletQuantity', () => {
    const process = completeMaritimeProcess({
      category: 'LCL',
      palletQuantity: 0,
      grossWeightKg: 10,
      volumeM3: 1,
    })
    expect(getPendingFields(process).map((f) => f.field)).toContain('palletQuantity')
  })

  it('containers sem tipo -> pendencia containerTypes', () => {
    const process = completeMaritimeProcess({
      containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: 'LACRE-1', type: '' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('containerTypes')
  })

  it('LCL sem grossWeightKg/volumeM3 -> pendencias', () => {
    const process = completeMaritimeProcess({
      category: 'LCL',
      palletQuantity: 1,
      grossWeightKg: 0,
      volumeM3: 0,
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('grossWeightKg')
    expect(ids).toContain('volumeM3')
  })

  it('AEREO sem grossWeightKg/chargeableWeightKg/packagesQuantity -> pendencias', () => {
    const process = completeMaritimeProcess({
      category: 'AEREO',
      containers: [],
      containerQuantity: 0,
      arrived: false,
      grossWeightKg: 0,
      chargeableWeightKg: 0,
      packagesQuantity: 0,
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('grossWeightKg')
    expect(ids).toContain('chargeableWeightKg')
    expect(ids).toContain('packagesQuantity')
  })

  // F17.2d-1 (D-4/D-5, Q4): carga perigosa POR ITEM - a flag legado de
  // nivel-processo sem item classificado vira `dangerousGoodsPerItem`;
  // item classificado sem ONU/classe cobra por item (`itemUnNumber`/
  // `itemImoClass`).
  it('dangerousGoods true (legado, sem item classificado) -> dangerousGoodsPerItem', () => {
    const process = completeMaritimeProcess({ dangerousGoods: true, unNumber: '', imoClass: '' })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('dangerousGoodsPerItem')
  })

  it('dangerousGoods false NAO cobra dangerousGoodsPerItem', () => {
    const process = completeMaritimeProcess({ dangerousGoods: false })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('dangerousGoodsPerItem')
  })

  it('item classificado completo (ONU/classe preenchidos) -> nenhuma pendencia de IMO', () => {
    const process = completeMaritimeProcess({
      items: [
        { commercialName: 'Resina', quantity: 10, dangerousGoods: true, unNumber: '1203', imoClass: '3' },
      ],
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('itemUnNumber')
    expect(ids).not.toContain('itemImoClass')
    expect(ids).not.toContain('dangerousGoodsPerItem')
  })

  it('item perigoso sem ONU -> itemUnNumber', () => {
    const process = completeMaritimeProcess({
      items: [
        { commercialName: 'Resina', quantity: 10, dangerousGoods: true, unNumber: '', imoClass: '3' },
      ],
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('itemUnNumber')
  })

  it('item perigoso sem classe IMO -> itemImoClass', () => {
    const process = completeMaritimeProcess({
      items: [
        { commercialName: 'Resina', quantity: 10, dangerousGoods: true, unNumber: '1203', imoClass: '' },
      ],
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('itemImoClass')
  })

  it('supplierName/originLocation/incoterm vazios -> pendencias', () => {
    const process = completeMaritimeProcess({ supplierName: '', originLocation: '', incoterm: '' })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('supplierName')
    expect(ids).toContain('originLocation')
    expect(ids).toContain('incoterm')
  })
})

describe('getPendingFields - estágio 1 (so aparece com currentStage >= 1)', () => {
  function shippedMaritimeProcess(overrides = {}) {
    return completeMaritimeProcess({
      shippedAt: '2026-01-05',
      masterBl: 'MBL-1',
      vesselName: 'Navio Atlas',
      voyage: 'V001',
      ...overrides,
    })
  }

  it('processo em Aguardando Embarque (estágio 0) NAO cobra shippedAt/masterBl', () => {
    const process = completeMaritimeProcess({ shippedAt: '', masterBl: '' })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('shippedAt')
    expect(ids).not.toContain('masterBl')
  })

  it('processo embarcado (estágio 1) completo -> sem pendencias novas de estagio 1', () => {
    const process = shippedMaritimeProcess()
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('shippedAt')
    expect(ids).not.toContain('masterBl')
    expect(ids).not.toContain('vesselName')
    expect(ids).not.toContain('voyage')
  })

  it('processo embarcado sem masterBl (FCL) -> pendencia MBL', () => {
    const process = shippedMaritimeProcess({ masterBl: '' })
    expect(getPendingFields(process).map((f) => f.id)).toContain('masterBl')
  })

  it('LCL/CONSOLIDADO embarcado sem houseBl -> pendencia HBL', () => {
    const process = shippedMaritimeProcess({ category: 'LCL', masterBl: '', houseBl: '' })
    expect(getPendingFields(process).map((f) => f.id)).toContain('houseBl')
  })

  it('AEREO chegado sem mawb/flightNumber -> pendencias', () => {
    const process = completeMaritimeProcess({
      category: 'AEREO',
      containers: [],
      containerQuantity: 0,
      shippedAt: '2026-01-05',
      mawb: '',
      flightNumber: '',
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('mawb')
    expect(ids).toContain('flightNumber')
  })

  it('FCL embarcado com container sem numero/lacre -> pendencias containerNumbers/containerSeals', () => {
    const process = shippedMaritimeProcess({
      containers: [{ id: 'CNT-1', number: '', seal: '', type: '40DC' }],
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('containerNumbers')
    expect(ids).toContain('containerSeals')
  })
})

describe('getPendingFields - regra de estagio futuro nao aparece', () => {
  it('carrierName (estágio 4) nao aparece num processo em Aguardando Embarque (estágio 0)', () => {
    const process = completeMaritimeProcess({ berthed: false, carrierName: '' })
    expect(getPendingFields(process).map((f) => f.field)).not.toContain('carrierName')
  })

  it('carrierName aparece quando ha janela agendada (estágio 4) e falta transportadora', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ scheduledAt: '2026-02-01T10:00:00.000Z' }],
      carrierName: '',
    })
    expect(getPendingFields(process).map((f) => f.field)).toContain('carrierName')
  })

  // F17.2b (D-7): substitui a pendencia antiga de MAPA - le `licenses[]`
  // (stage 0, TODAS as categorias, inclusive doc legado via compat MAPA).
  it('licenseInspectionDate aparece com licenca "Vistoria agendada" sem data (stage 0)', () => {
    const process = completeMaritimeProcess({
      berthed: false,
      licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Vistoria agendada', inspectionScheduledAt: '' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('licenseInspectionDate')
  })

  it('licenseInspectionDate NAO aparece com data preenchida', () => {
    const process = completeMaritimeProcess({
      licenses: [
        { id: 'LIC-1', agency: 'MAPA', status: 'Vistoria agendada', inspectionScheduledAt: '2026-09-20T10:00' },
      ],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('licenseInspectionDate')
  })

  it('licenseDeferredDate aparece com licenca "Deferida" sem deferredAt (AEREO incluido)', () => {
    const process = completeMaritimeProcess({
      category: 'AEREO',
      containers: [],
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Deferida', deferredAt: '' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('licenseDeferredDate')
  })

  it('doc legado MAPA "Vistoria agendada, aguardando realização" sem data dispara licenseInspectionDate', () => {
    const process = completeMaritimeProcess({
      berthed: false,
      mapaStatus: 'Vistoria agendada, aguardando realização',
      mapaInspectionScheduledAt: '',
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('licenseInspectionDate')
  })

  it('clearanceCompletedAt (AD-1) aparece quando duimp parametrizada e canal nao-Verde', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Amarelo',
      clearanceCompletedAt: '',
    })
    expect(getPendingFields(process).map((f) => f.field)).toContain('clearanceCompletedAt')
  })

  // F17.3b (D-6): mudanca intencional (spec, secao Migracao: "Parametrizada
  // + Verde -> clearanceCompletedAt = null + pendencia") - legado Verde sem
  // data de desembaraco, ainda nao recebido, passa a pedir a data real.
  it('clearanceCompletedAt aparece no Verde legado sem data enquanto nao recebido (spec Migracao)', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      clearanceCompletedAt: '',
    })
    expect(getPendingFields(process).map((f) => f.field)).toContain('clearanceCompletedAt')
  })

  it('clearanceCompletedAt NAO aparece no Verde apos Carga recebida', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      clearanceCompletedAt: '',
      collectionStatus: 'Carga recebida',
    })
    expect(getPendingFields(process).map((f) => f.field)).not.toContain('clearanceCompletedAt')
  })
})

// F17.3b (D-6): DUIMP completa - numero, datas de registro/parametrizacao
// (legado sem data), canal, conferencia (Amarelo/Vermelho) e procedimento
// especial (Cinza).
describe('getPendingFields - DUIMP completa (F17.3b)', () => {
  it('duimpNumber aparece com sinal de registro e falta o texto', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpRegisteredAt: '2026-09-20T10:00',
      duimpNumber: '',
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('duimpNumber')
  })

  it('legado Parametrizada sem datas e nao recebido -> duimpRegisteredAt + parameterizedAt', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      clearanceCompletedAt: '2026-09-22T10:00',
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('duimpRegisteredAt')
    expect(ids).toContain('parameterizedAt')
  })

  it('legado Parametrizada sem datas, mas recebido -> nenhuma das duas', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      collectionStatus: 'Carga recebida',
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('duimpRegisteredAt')
    expect(ids).not.toContain('parameterizedAt')
  })

  it('parameterizationChannel aparece com sinal de parametrizacao sem canal', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: '',
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('parameterizationChannel')
  })

  it('Vermelho sem conferencia -> customsInspectionScheduledAt', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Vermelho',
      customsInspectionScheduledAt: '',
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('customsInspectionScheduledAt')
  })

  it('Cinza sem notas -> customsRequirementNotes', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Cinza',
      customsRequirementNotes: '',
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('customsRequirementNotes')
  })

  it('canal Amarelo NAO pede customsRequirementNotes (so' + " Cinza)", () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      parameterizedAt: '2026-09-20T10:00',
      parameterizationChannel: 'Amarelo',
      customsInspectionScheduledAt: '2026-09-21T10:00',
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('customsRequirementNotes')
  })
})

// F17.3a (D-6): CE/terminal/free time (stage 2) + presenca de carga (stage 3).
describe('getPendingFields - chegada/CE/free time/presenca (F17.3a)', () => {
  function shippedMaritimeProcess(overrides = {}) {
    return completeMaritimeProcess({
      shippedAt: '2026-01-05',
      masterBl: 'MBL-1',
      vesselName: 'Navio Atlas',
      voyage: 'V001',
      ...overrides,
    })
  }

  function arrivedMaritimeProcess(overrides = {}) {
    return shippedMaritimeProcess({
      berthed: true,
      berthedAt: '2026-01-10T10:00',
      ...overrides,
    })
  }

  it('maritimo sem ceMercante -> pendencia (a partir da atracação confirmada)', () => {
    const process = arrivedMaritimeProcess({ ceMercante: '' })
    expect(getPendingFields(process).map((f) => f.id)).toContain('ceMercante')
  })

  it('ceMercante preenchido -> sem pendencia', () => {
    const process = arrivedMaritimeProcess({ ceMercante: 'CE-1' })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('ceMercante')
  })

  it('LCL/CONSOLIDADO sem ceHouse -> pendencia; FCL nunca cobra ceHouse', () => {
    const lcl = arrivedMaritimeProcess({ category: 'LCL', ceHouse: '', masterBl: '', houseBl: 'HBL-1' })
    expect(getPendingFields(lcl).map((f) => f.id)).toContain('ceHouse')
    const fcl = arrivedMaritimeProcess({ ceHouse: '' })
    expect(getPendingFields(fcl).map((f) => f.id)).not.toContain('ceHouse')
  })

  it('maritimo sem terminalName -> pendencia', () => {
    const process = arrivedMaritimeProcess({ terminalName: '' })
    expect(getPendingFields(process).map((f) => f.id)).toContain('terminalName')
  })

  it('FCL/CONSOLIDADO sem freeTimeDays (null) -> pendencia; freeTimeDays 0 NAO e pendencia', () => {
    const semFreeTime = arrivedMaritimeProcess({ freeTimeDays: null })
    expect(getPendingFields(semFreeTime).map((f) => f.id)).toContain('freeTimeDays')
    const zeroFreeTime = arrivedMaritimeProcess({ freeTimeDays: 0 })
    expect(getPendingFields(zeroFreeTime).map((f) => f.id)).not.toContain('freeTimeDays')
  })

  it('LCL nunca cobra freeTimeDays', () => {
    const process = arrivedMaritimeProcess({ category: 'LCL', freeTimeDays: null, masterBl: '', houseBl: 'HBL-1' })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('freeTimeDays')
  })

  it('maritimo berthed=true sem berthedAt -> pendencia; com data preenchida some', () => {
    const semData = shippedMaritimeProcess({ berthed: true, berthedAt: '' })
    expect(getPendingFields(semData).map((f) => f.id)).toContain('berthedAt')
    const comData = shippedMaritimeProcess({ berthed: true, berthedAt: '2026-01-10T10:00' })
    expect(getPendingFields(comData).map((f) => f.id)).not.toContain('berthedAt')
  })

  it('data aproximada (migratedApproxFields) NAO gera pendencia', () => {
    const process = shippedMaritimeProcess({
      berthed: true,
      berthedAt: '',
      migratedApproxFields: ['berthedAt'],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('berthedAt')
  })

  it('AEREO arrived=true sem arrivedAt -> pendencia', () => {
    const process = completeMaritimeProcess({
      category: 'AEREO',
      containers: [],
      containerQuantity: 0,
      shippedAt: '2026-01-05',
      mawb: 'MAWB-1',
      flightNumber: 'FL-1',
      arrived: true,
      arrivedAt: '',
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('arrivedAt')
  })

  it('cargoPresenceInformedAt: FCL/CONSOLIDADO com sinal e sem data -> pendencia; LCL NAO cobra', () => {
    const fcl = shippedMaritimeProcess({
      berthed: true,
      berthedAt: '2026-01-10T10:00',
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '',
    })
    expect(getPendingFields(fcl).map((f) => f.id)).toContain('cargoPresenceInformedAt')

    const lcl = shippedMaritimeProcess({
      category: 'LCL',
      masterBl: '',
      houseBl: 'HBL-1',
      berthed: true,
      berthedAt: '2026-01-10T10:00',
      cargoPresenceInformed: true,
      cargoPresenceInformedAt: '',
    })
    expect(getPendingFields(lcl).map((f) => f.id)).not.toContain('cargoPresenceInformedAt')
  })
})

// F17.2c (D-11): POs do consolidado + PO por item.
describe('getPendingFields - purchaseOrders/itemPoNumber (F17.2c)', () => {
  it('CONSOLIDADO com 1 PO -> pendencia purchaseOrders', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      purchaseOrders: ['PO-A'],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('purchaseOrders')
  })

  it('CONSOLIDADO com 2 POs -> sem pendencia purchaseOrders', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      purchaseOrders: ['PO-A', 'PO-B'],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('purchaseOrders')
  })

  it('FCL nunca cobra purchaseOrders', () => {
    const process = completeMaritimeProcess({ category: 'FCL' })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('purchaseOrders')
  })

  it('CONSOLIDADO com item sem poNumber -> pendencia itemPoNumber', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      purchaseOrders: ['PO-A', 'PO-B'],
      items: [{ commercialName: 'Item', quantity: 1, poNumber: '' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('itemPoNumber')
  })

  it('CONSOLIDADO com todos os itens com poNumber -> sem pendencia itemPoNumber', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      purchaseOrders: ['PO-A', 'PO-B'],
      items: [{ commercialName: 'Item', quantity: 1, poNumber: 'PO-A' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('itemPoNumber')
  })

  it('FCL nunca cobra itemPoNumber mesmo sem poNumber no item', () => {
    const process = completeMaritimeProcess({
      category: 'FCL',
      items: [{ commercialName: 'Item', quantity: 1 }],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('itemPoNumber')
  })
})

// F17.2d-2 (D-4/D-9, Q1): fornecedor sai do nivel-processo no CONSOLIDADO -
// passa a ser cobrado POR PO (`purchaseOrderSupplier`).
describe('getPendingFields - fornecedor por PO no CONSOLIDADO (F17.2d-2)', () => {
  it('CONSOLIDADO sem supplierName de processo NAO gera pendencia supplierName', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      supplierName: '',
      purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: 'ACME' }, { po: 'PO-B', reference: '', supplierName: 'ACME' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('supplierName')
  })

  it('FCL continua cobrando supplierName', () => {
    const process = completeMaritimeProcess({ category: 'FCL', supplierName: '' })
    expect(getPendingFields(process).map((f) => f.id)).toContain('supplierName')
  })

  it('CONSOLIDADO com PO sem fornecedor -> pendencia purchaseOrderSupplier', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: '' }, { po: 'PO-B', reference: '', supplierName: 'ACME' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('purchaseOrderSupplier')
  })

  it('CONSOLIDADO com todas as POs com fornecedor -> sem pendencia purchaseOrderSupplier', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: 'ACME' }, { po: 'PO-B', reference: '', supplierName: 'BETA' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('purchaseOrderSupplier')
  })

  it('lista de strings legadas sem fornecedor de processo -> gera purchaseOrderSupplier', () => {
    const process = completeMaritimeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      supplierName: '',
      purchaseOrders: ['PO-A', 'PO-B'],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('purchaseOrderSupplier')
  })
})

// F17.4b (B-5): divergencia no recebimento + devolucao de vazio - aviso,
// nunca bloqueio (stage 4).
describe('getPendingFields - divergencia no recebimento / devolucao de vazio (F17.4b)', () => {
  function receivedFclProcess(overrides = {}) {
    return completeMaritimeProcess({
      collectionStatus: 'Carga disponível em estoque',
      ...overrides,
    })
  }

  it('divergencia true sem notas -> pendencia receiptDivergenceNotes', () => {
    const process = receivedFclProcess({ receiptDivergence: true, receiptDivergenceNotes: '' })
    expect(getPendingFields(process).map((f) => f.id)).toContain('receiptDivergenceNotes')
  })

  it('divergencia true sem postReceiptImages -> pendencia receiptDivergencePhoto', () => {
    const process = receivedFclProcess({ receiptDivergence: true, postReceiptImages: [] })
    expect(getPendingFields(process).map((f) => f.id)).toContain('receiptDivergencePhoto')
  })

  it('divergencia true com notas e foto -> nenhuma das duas pendencias', () => {
    const process = receivedFclProcess({
      receiptDivergence: true,
      receiptDivergenceNotes: 'caixa amassada',
      postReceiptImages: [{ id: 'IMG-1', url: 'https://x' }],
    })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('receiptDivergenceNotes')
    expect(ids).not.toContain('receiptDivergencePhoto')
  })

  it('flag false -> nenhuma das duas pendencias de divergencia', () => {
    const process = receivedFclProcess({ receiptDivergence: false })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('receiptDivergenceNotes')
    expect(ids).not.toContain('receiptDivergencePhoto')
  })

  it('FCL recebido com 1 conteiner sem returnedAt -> pendencia containersReturnedAt', () => {
    const process = receivedFclProcess({
      containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: 'LACRE-1', type: '40DC', returnedAt: '' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).toContain('containersReturnedAt')
  })

  it('FCL recebido com todos os conteineres com returnedAt -> sem pendencia', () => {
    const process = receivedFclProcess({
      containers: [
        { id: 'CNT-1', number: 'CSQU3054383', seal: 'LACRE-1', type: '40DC', returnedAt: '2026-09-10' },
      ],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('containersReturnedAt')
  })

  it('LCL nunca cobra containersReturnedAt', () => {
    const process = completeMaritimeProcess({
      category: 'LCL',
      containers: [],
      containerQuantity: 0,
      palletQuantity: 1,
      collectionStatus: 'Carga disponível em estoque',
      houseBl: 'HBL-1',
      masterBl: '',
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('containersReturnedAt')
  })

  it('FCL em "Coleta Agendada" (nao recebido) -> sem pendencia containersReturnedAt', () => {
    const process = completeMaritimeProcess({
      collectionStatus: 'Coleta Agendada',
      containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: 'LACRE-1', type: '40DC', returnedAt: '' }],
    })
    expect(getPendingFields(process).map((f) => f.id)).not.toContain('containersReturnedAt')
  })
})
