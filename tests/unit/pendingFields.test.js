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
    palletQuantity: 0,
    berthed: false,
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
      getPendingFields(completeMaritimeProcess({ containerQuantity: 0 })).map((f) => f.field)
    ).toContain('containerQuantity')
  })

  it('CONSOLIDADO nao cobra processNumber', () => {
    const process = completeMaritimeProcess({ category: 'CONSOLIDADO', processNumber: '' })
    expect(getPendingFields(process).map((f) => f.field)).not.toContain('processNumber')
  })

  it('AEREO nao cobra containerQuantity', () => {
    const process = completeMaritimeProcess({
      category: 'AEREO',
      containerQuantity: 0,
      arrived: false,
    })
    expect(getPendingFields(process).map((f) => f.field)).not.toContain('containerQuantity')
  })

  it('LCL cobra palletQuantity', () => {
    const process = completeMaritimeProcess({ category: 'LCL', palletQuantity: 0 })
    expect(getPendingFields(process).map((f) => f.field)).toContain('palletQuantity')
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

  it('mapaInspectionScheduledAt aparece so quando maritimo e vistoria agendada', () => {
    const process = completeMaritimeProcess({
      berthed: true,
      cargoPresenceInformed: true,
      mapaStatus: 'Vistoria agendada, aguardando realização',
      mapaInspectionScheduledAt: '',
    })
    expect(getPendingFields(process).map((f) => f.field)).toContain('mapaInspectionScheduledAt')
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
