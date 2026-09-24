// F17.2d-1 (D-1/D-2, Q5): "Embarque confirmado" - sem campo novo, derivado
// de `hasText(shippedAt)`. Cobertura pura do modulo.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  applyEtdEdit,
  applyShipmentConfirmation,
  getLocalDateKey,
  hasShipmentDateDivergence,
  isFutureShipment,
  isShipmentConfirmed,
} from '../../src/features/processes/shipmentConfirmation.js'

describe('getLocalDateKey', () => {
  it('formata YYYY-MM-DD local (sem toISOString)', () => {
    expect(getLocalDateKey(new Date(2026, 8, 5))).toBe('2026-09-05')
  })
})

describe('isShipmentConfirmed', () => {
  it('shippedAt preenchido -> true', () => {
    expect(isShipmentConfirmed({ shippedAt: '2026-09-20' })).toBe(true)
  })

  it('shippedAt vazio/ausente -> false', () => {
    expect(isShipmentConfirmed({ shippedAt: '' })).toBe(false)
    expect(isShipmentConfirmed({})).toBe(false)
  })
})

describe('hasShipmentDateDivergence', () => {
  it('confirmado com shippedAt != etd -> true', () => {
    expect(hasShipmentDateDivergence({ shippedAt: '2026-09-20', etd: '2026-09-18' })).toBe(true)
  })

  it('confirmado com etd vazio -> true (inclui ETD vazio)', () => {
    expect(hasShipmentDateDivergence({ shippedAt: '2026-09-20', etd: '' })).toBe(true)
  })

  it('confirmado e sincronizado -> false', () => {
    expect(hasShipmentDateDivergence({ shippedAt: '2026-09-20', etd: '2026-09-20' })).toBe(false)
  })

  it('nao confirmado -> false', () => {
    expect(hasShipmentDateDivergence({ shippedAt: '', etd: '2026-09-20' })).toBe(false)
  })
})

describe('applyShipmentConfirmation', () => {
  it('marcar com ETD preenchido -> copia pra shippedAt', () => {
    const draft = { etd: '2026-09-20', shippedAt: '' }
    expect(applyShipmentConfirmation(draft, true)).toEqual({ ...draft, shippedAt: '2026-09-20' })
  })

  it('marcar com ETD vazio -> no-op (devolve o draft intacto)', () => {
    const draft = { etd: '', shippedAt: '' }
    expect(applyShipmentConfirmation(draft, true)).toBe(draft)
  })

  it('desmarcar -> zera shippedAt', () => {
    const draft = { etd: '2026-09-20', shippedAt: '2026-09-20' }
    expect(applyShipmentConfirmation(draft, false)).toEqual({ ...draft, shippedAt: '' })
  })
})

describe('applyEtdEdit', () => {
  it('ETD sincronizado com shippedAt -> editar sincroniza os dois', () => {
    const draft = { etd: '2026-09-18', shippedAt: '2026-09-18' }
    expect(applyEtdEdit(draft, '2026-09-20')).toEqual({ etd: '2026-09-20', shippedAt: '2026-09-20' })
  })

  it('divergente (shippedAt != etd) -> editar o ETD NAO sincroniza', () => {
    const draft = { etd: '2026-09-18', shippedAt: '2026-09-10' }
    expect(applyEtdEdit(draft, '2026-09-20')).toEqual({ etd: '2026-09-20', shippedAt: '2026-09-10' })
  })

  it('limpar o ETD (sincronizado) NAO apaga shippedAt', () => {
    const draft = { etd: '2026-09-18', shippedAt: '2026-09-18' }
    expect(applyEtdEdit(draft, '')).toEqual({ etd: '', shippedAt: '2026-09-18' })
  })

  it('nao confirmado -> editar o ETD nao mexe em shippedAt', () => {
    const draft = { etd: '', shippedAt: '' }
    expect(applyEtdEdit(draft, '2026-09-20')).toEqual({ etd: '2026-09-20', shippedAt: '' })
  })
})

describe('isFutureShipment', () => {
  it('confirmado com data futura (today injetado) -> true', () => {
    expect(isFutureShipment({ shippedAt: '2026-09-25' }, '2026-09-20')).toBe(true)
  })

  it('confirmado com data passada/hoje -> false', () => {
    expect(isFutureShipment({ shippedAt: '2026-09-20' }, '2026-09-20')).toBe(false)
    expect(isFutureShipment({ shippedAt: '2026-09-10' }, '2026-09-20')).toBe(false)
  })

  it('nao confirmado -> false', () => {
    expect(isFutureShipment({ shippedAt: '' }, '2026-09-20')).toBe(false)
  })
})
