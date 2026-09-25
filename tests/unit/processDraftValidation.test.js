// UX-3b (D1/D3): validacao pura do rascunho de processo. Nao entra na
// contagem `tests.totalFiles` do audit-vault-counts.cjs.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  canonicalizeIncoterm,
  getProcessFieldDomId,
  getProcessFieldStep,
  validateProcessDraft,
} from '../../src/features/processes/processDraftValidation'

function baseDraft(overrides = {}) {
  return {
    category: 'FCL',
    incoterm: '',
    etd: '',
    eta: '',
    warehouseDeliveryDateOverride: '',
    containers: [],
    licenses: [],
    purchaseOrders: [],
    volumeM3: '',
    grossWeightKg: '',
    chargeableWeightKg: '',
    packagesQuantity: '',
    transshipment: false,
    transshipmentEtd: '',
    berthedAt: '',
    arrivedAt: '',
    freeTimeDays: '',
    demurrageDailyRateUsd: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    cargoPresenceInformedAt: '',
    duimpRegisteredAt: '',
    parameterizedAt: '',
    customsInspectionScheduledAt: '',
    clearanceCompletedAt: '',
    collectionWindows: [],
    items: [],
    ...overrides,
  }
}

describe('validateProcessDraft — datas (2000-2100, prefixo AAAA-MM-DD)', () => {
  it('vazio e valido (campo opcional)', () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '' }))
    expect(errors.etd).toBeUndefined()
  })

  it('ano 1999 invalido', () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '1999-12-31' }))
    expect(errors.etd).toMatch(/entre 2000 e 2100/)
  })

  it('ano 2000 valido (limite inferior)', () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '2000-01-01' }))
    expect(errors.etd).toBeUndefined()
  })

  it('ano 2100 valido (limite superior)', () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '2100-12-31' }))
    expect(errors.etd).toBeUndefined()
  })

  it('ano 2101 invalido', () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '2101-01-01' }))
    expect(errors.etd).toBeDefined()
  })

  it("'20245-01-01' (5 digitos no ano) invalido - nao comeca com AAAA-MM-DD", () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '20245-01-01' }))
    expect(errors.etd).toBeDefined()
  })

  it('datetime-local (AAAA-MM-DDTHH:MM) valido', () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '2026-07-01T10:30' }))
    expect(errors.etd).toBeUndefined()
  })

  it('ISO com Z valido', () => {
    const { errors } = validateProcessDraft(baseDraft({ etd: '2026-07-01T10:30:00.000Z' }))
    expect(errors.etd).toBeUndefined()
  })

  it('licenca com data mas status que esconde o campo -> sem erro', () => {
    const draft = baseDraft({
      licenses: [
        { id: 'LIC-1', status: 'Aguardando registro', inspectionScheduledAt: '1999-01-01', deferredAt: '' },
      ],
    })
    const { errors } = validateProcessDraft(draft)
    expect(errors['licenses.LIC-1.inspectionScheduledAt']).toBeUndefined()
  })

  it('licenca "Vistoria agendada" com data invalida -> erro', () => {
    const draft = baseDraft({
      licenses: [
        { id: 'LIC-1', status: 'Vistoria agendada', inspectionScheduledAt: '1999-01-01', deferredAt: '' },
      ],
    })
    const { errors } = validateProcessDraft(draft)
    expect(errors['licenses.LIC-1.inspectionScheduledAt']).toBeDefined()
  })

  it('licenca "Deferida" com data invalida -> erro', () => {
    const draft = baseDraft({
      licenses: [{ id: 'LIC-1', status: 'Deferida', inspectionScheduledAt: '', deferredAt: '1999-01-01' }],
    })
    const { errors } = validateProcessDraft(draft)
    expect(errors['licenses.LIC-1.deferredAt']).toBeDefined()
  })

  it('transshipmentEtd invalido com transshipment: false -> sem erro', () => {
    const draft = baseDraft({ transshipment: false, transshipmentEtd: '1999-01-01' })
    const { errors } = validateProcessDraft(draft)
    expect(errors.transshipmentEtd).toBeUndefined()
  })

  it('transshipmentEtd invalido com transshipment: true -> erro', () => {
    const draft = baseDraft({ transshipment: true, transshipmentEtd: '1999-01-01' })
    const { errors } = validateProcessDraft(draft)
    expect(errors.transshipmentEtd).toBeDefined()
  })
})

describe('validateProcessDraft — numeros (negativo/nao-numerico)', () => {
  it("'-1' invalido em campo decimal", () => {
    const { errors } = validateProcessDraft(baseDraft({ category: 'LCL', grossWeightKg: '-1' }))
    expect(errors.grossWeightKg).toMatch(/maior ou igual a zero/)
  })

  it("'abc' invalido em campo decimal", () => {
    const { errors } = validateProcessDraft(baseDraft({ category: 'LCL', grossWeightKg: 'abc' }))
    expect(errors.grossWeightKg).toBeDefined()
  })

  it("'1,5' (virgula decimal) valido", () => {
    const { errors } = validateProcessDraft(baseDraft({ category: 'LCL', grossWeightKg: '1,5' }))
    expect(errors.grossWeightKg).toBeUndefined()
  })

  it("'' (vazio) valido - campo opcional", () => {
    const { errors } = validateProcessDraft(baseDraft({ category: 'LCL', grossWeightKg: '' }))
    expect(errors.grossWeightKg).toBeUndefined()
  })

  it("'2.5' em campo inteiro (packagesQuantity) invalido", () => {
    const { errors } = validateProcessDraft(baseDraft({ category: 'AEREO', packagesQuantity: '2.5' }))
    expect(errors.packagesQuantity).toMatch(/número inteiro/)
  })

  it('peso fora da categoria (FCL sem LCL/AEREO) e ignorado mesmo invalido', () => {
    const { errors } = validateProcessDraft(baseDraft({ category: 'FCL', grossWeightKg: '-1' }))
    expect(errors.grossWeightKg).toBeUndefined()
  })

  it('volumeM3 negativo em FCL/LCL/CONSOLIDADO bloqueia', () => {
    expect(validateProcessDraft(baseDraft({ category: 'FCL', volumeM3: '-1' })).errors.volumeM3).toBeDefined()
    expect(validateProcessDraft(baseDraft({ category: 'LCL', volumeM3: '-1' })).errors.volumeM3).toBeDefined()
    expect(
      validateProcessDraft(baseDraft({ category: 'CONSOLIDADO', volumeM3: '-1' })).errors.volumeM3
    ).toBeDefined()
  })

  it('freeTimeDays/demurrageDailyRateUsd so validam em FREE_TIME_CATEGORIES (FCL/CONSOLIDADO)', () => {
    const air = validateProcessDraft(baseDraft({ category: 'AEREO', freeTimeDays: '-1' }))
    expect(air.errors.freeTimeDays).toBeUndefined()
    const fcl = validateProcessDraft(baseDraft({ category: 'FCL', freeTimeDays: '-1' }))
    expect(fcl.errors.freeTimeDays).toBeDefined()
  })

  it('item com quantity -2 bloqueia', () => {
    const draft = baseDraft({ items: [{ id: 'ITEM-1', commercialName: 'X', quantity: -2 }] })
    const { errors } = validateProcessDraft(draft)
    expect(errors['items.ITEM-1.quantity']).toBeDefined()
  })
})

describe('validateProcessDraft — incoterm (AD-1: canonicaliza antes de validar)', () => {
  it("'' vazio e' valido", () => {
    expect(validateProcessDraft(baseDraft({ incoterm: '' })).errors.incoterm).toBeUndefined()
  })

  it("'FOB' (ja canonico) valido", () => {
    expect(validateProcessDraft(baseDraft({ incoterm: 'FOB' })).errors.incoterm).toBeUndefined()
  })

  it("'fob' (minusculo, legado) valido apos canonicalizar", () => {
    expect(validateProcessDraft(baseDraft({ incoterm: 'fob' })).errors.incoterm).toBeUndefined()
  })

  it("' Fob ' (espacos + caixa mista) valido apos canonicalizar", () => {
    expect(validateProcessDraft(baseDraft({ incoterm: ' Fob ' })).errors.incoterm).toBeUndefined()
  })

  it("'XYZ' fora da lista bloqueia mesmo canonico", () => {
    const { errors } = validateProcessDraft(baseDraft({ incoterm: 'XYZ' }))
    expect(errors.incoterm).toMatch(/não está na lista/)
  })

  it('canonicalizeIncoterm: trim + maiusculas', () => {
    expect(canonicalizeIncoterm('fob')).toBe('FOB')
    expect(canonicalizeIncoterm(' Fob ')).toBe('FOB')
    expect(canonicalizeIncoterm('')).toBe('')
    expect(canonicalizeIncoterm(null)).toBe('')
  })
})

describe('validateProcessDraft — tetos de lista (D3)', () => {
  function buildList(count, factory) {
    return Array.from({ length: count }, (_, index) => factory(index))
  }

  it('40 containers (limite) nao bloqueia; 41 bloqueia', () => {
    const containerAt = (index) => ({ id: `CNT-${index + 1}`, number: '', seal: '', type: '', returnedAt: '' })
    const ok = validateProcessDraft(baseDraft({ category: 'FCL', containers: buildList(40, containerAt) }))
    expect(ok.errors.containers).toBeUndefined()
    const bad = validateProcessDraft(baseDraft({ category: 'FCL', containers: buildList(41, containerAt) }))
    expect(bad.errors.containers).toMatch(/Máximo de 40/)
  })

  it('containers so conta em FCL/CONSOLIDADO', () => {
    const containerAt = (index) => ({ id: `CNT-${index + 1}`, number: '', seal: '', type: '', returnedAt: '' })
    const draft = baseDraft({ category: 'LCL', containers: buildList(41, containerAt) })
    expect(validateProcessDraft(draft).errors.containers).toBeUndefined()
  })

  it('10 anuencias (limite) nao bloqueia; 11 bloqueia', () => {
    const licenseAt = (index) => ({ id: `LIC-${index + 1}`, status: 'Aguardando registro' })
    const ok = validateProcessDraft(baseDraft({ licenses: buildList(10, licenseAt) }))
    expect(ok.errors.licenses).toBeUndefined()
    const bad = validateProcessDraft(baseDraft({ licenses: buildList(11, licenseAt) }))
    expect(bad.errors.licenses).toMatch(/Máximo de 10/)
  })

  it('50 POs (limite) nao bloqueia; 51 bloqueia (CONSOLIDADO)', () => {
    const poAt = (index) => ({ po: `PO-${index + 1}`, reference: '', supplierName: '' })
    const ok = validateProcessDraft(baseDraft({ category: 'CONSOLIDADO', purchaseOrders: buildList(50, poAt) }))
    expect(ok.errors.purchaseOrders).toBeUndefined()
    const bad = validateProcessDraft(baseDraft({ category: 'CONSOLIDADO', purchaseOrders: buildList(51, poAt) }))
    expect(bad.errors.purchaseOrders).toMatch(/Máximo de 50/)
  })

  it('purchaseOrders nao-array e ignorado', () => {
    const draft = baseDraft({ category: 'CONSOLIDADO', purchaseOrders: 'nao-e-array' })
    expect(validateProcessDraft(draft).errors.purchaseOrders).toBeUndefined()
  })
})

describe('firstKey — segue a ordem dos passos', () => {
  it('erro em "dates" (etd) vem antes de erro em "status" (volumeM3)', () => {
    const draft = baseDraft({ category: 'FCL', etd: '1999-01-01', volumeM3: '-1' })
    const { firstKey } = validateProcessDraft(draft)
    expect(firstKey).toBe('etd')
  })

  it('sem erro nenhum -> firstKey null', () => {
    const { firstKey, errors } = validateProcessDraft(baseDraft())
    expect(firstKey).toBeNull()
    expect(errors).toEqual({})
  })
})

describe('getProcessFieldStep', () => {
  it.each([
    ['incoterm', 'ident'],
    ['purchaseOrders', 'ident'],
    ['etd', 'dates'],
    ['eta', 'dates'],
    ['warehouseDeliveryDateOverride', 'dates'],
    ['containers', 'status'],
    ['licenses', 'status'],
    ['volumeM3', 'status'],
    ['licenses.LIC-1.deferredAt', 'status'],
    ['transshipmentEtd', 'transit'],
    ['berthedAt', 'flow'],
    ['containers.CNT-1.returnedAt', 'flow'],
    ['collectionWindows.WIN-1.scheduledAt', 'flow'],
    ['items.ITEM-1.quantity', 'items'],
  ])('%s -> %s', (key, step) => {
    expect(getProcessFieldStep(key)).toBe(step)
  })
})

describe('getProcessFieldDomId', () => {
  it('prefixa "process-field-"', () => {
    expect(getProcessFieldDomId('etd')).toBe('process-field-etd')
  })

  it('sanitiza caracteres fora de [A-Za-z0-9_-] para "-"', () => {
    expect(getProcessFieldDomId('licenses.LIC-1.deferredAt')).toBe('process-field-licenses-LIC-1-deferredAt')
    expect(getProcessFieldDomId('items.ITEM-1.quantity')).toBe('process-field-items-ITEM-1-quantity')
  })
})
