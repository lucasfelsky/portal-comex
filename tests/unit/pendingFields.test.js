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

  it('dangerousGoods true sem unNumber/imoClass -> pendencias', () => {
    const process = completeMaritimeProcess({ dangerousGoods: true, unNumber: '', imoClass: '' })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).toContain('unNumber')
    expect(ids).toContain('imoClass')
  })

  it('dangerousGoods false NAO cobra unNumber/imoClass', () => {
    const process = completeMaritimeProcess({ dangerousGoods: false, unNumber: '', imoClass: '' })
    const ids = getPendingFields(process).map((f) => f.id)
    expect(ids).not.toContain('unNumber')
    expect(ids).not.toContain('imoClass')
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

  it('clearanceCompletedAt NAO aparece no canal Verde', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      clearanceCompletedAt: '',
    })
    expect(getPendingFields(process).map((f) => f.field)).not.toContain('clearanceCompletedAt')
  })
})
