// Specs unitarios de getScheduledCollectionDeliveryDate e
// getScheduledCollectionDeliveryShift (PR #12).
// PR #12 (2026-07-09): as funcoes olhavam apenas
// `process.collectionScheduledAt` (campo legado). Quando
// o campo estava vazio mas `process.collectionWindows[0]`
// existia (schema novo usado em processos migrados), as
// funcoes retornavam string vazia e a UI caia no fallback
// de `warehouseDeliveryDateOverride` (que pode estar
// desatualizado). Agora olham os dois schemas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getScheduledCollectionDeliveryDate,
  getScheduledCollectionDeliveryShift,
} from '../../src/utils/deliveryForecast'
import { DEFAULT_FORECAST_SETTINGS } from '../../src/utils/deliveryForecast'

describe('getScheduledCollectionDeliveryDate (PR #12)', () => {
  it('usa collectionScheduledAt legado quando presente', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          collectionScheduledAt: '2026-07-15T08:00:00-03:00',
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('2026-07-15')
  })

  it('PR #12: usa collectionWindows[0].scheduledAt quando legado ausente', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-07-15T08:00:00-03:00' }],
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('2026-07-15')
  })

  it('PR #12: janela passada matutino retorna a data da janela', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-07-08T08:00:00-03:00' }],
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('2026-07-08')
  })

  it('PR #12: janela passada vespertino (>cutoff) rola pro proximo business day', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-07-08T23:59:00-03:00' }],
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('2026-07-09')
  })

  it('PR #12: legado tem prioridade sobre collectionWindows', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          collectionScheduledAt: '2026-07-15T08:00:00-03:00',
          collectionWindows: [{ scheduledAt: '2026-07-20T08:00:00-03:00' }],
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('2026-07-15')
  })

  it('retorna vazio se nem legado nem collectionWindows tem data', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('')
  })

  it('retorna vazio se collectionStatus nao e "Coleta Agendada"', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Carga a caminho do CD',
          collectionScheduledAt: '2026-07-15T08:00:00-03:00',
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('')
  })

  it('retorna vazio se collectionWindows tem scheduledAt invalido', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [
            { scheduledAt: 'invalido' },
            { scheduledAt: null },
          ],
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('')
  })

  it('retorna vazio se destino nao tem regra', () => {
    expect(
      getScheduledCollectionDeliveryDate(
        {
          collectionStatus: 'Coleta Agendada',
          collectionScheduledAt: '2026-07-15T08:00:00-03:00',
          destination: 'DestinoInexistente',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('')
  })
})

describe('getScheduledCollectionDeliveryShift (PR #12)', () => {
  it('usa collectionScheduledAt legado quando presente', () => {
    expect(
      getScheduledCollectionDeliveryShift(
        {
          collectionStatus: 'Coleta Agendada',
          collectionScheduledAt: '2026-07-15T08:00:00-03:00',
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('Vespertino')
  })

  it('PR #12: usa collectionWindows[0].scheduledAt quando legado ausente', () => {
    expect(
      getScheduledCollectionDeliveryShift(
        {
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-07-15T08:00:00-03:00' }],
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('Vespertino')
  })

  it('PR #12: apos cutoff do Itapoa (12h) retorna Matutino', () => {
    expect(
      getScheduledCollectionDeliveryShift(
        {
          collectionStatus: 'Coleta Agendada',
          collectionWindows: [{ scheduledAt: '2026-07-15T14:00:00-03:00' }],
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('Matutino')
  })

  it('retorna vazio se nem legado nem collectionWindows tem data', () => {
    expect(
      getScheduledCollectionDeliveryShift(
        {
          collectionStatus: 'Coleta Agendada',
          destination: 'Itapoa',
          category: 'FCL',
        },
        DEFAULT_FORECAST_SETTINGS
      )
    ).toBe('')
  })
})
