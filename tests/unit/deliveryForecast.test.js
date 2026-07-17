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
  getEstimatedDeliveryDate,
  getAutomaticEstimatedDeliveryDate,
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

describe('getEstimatedDeliveryDate — override manual x "coleta agendada em diante" (2026-07)', () => {
  const NAVEGANTES_SCHEDULED = {
    destination: 'Navegantes',
    category: 'FCL',
    eta: '2026-07-10',
    collectionScheduledAt: '2026-07-15T08:00:00-03:00', // dia util, antes do cutoff 14h
    warehouseDeliveryDateOverride: '2026-08-20', // bem depois — pra distinguir
  }

  it('aplica o override manual ANTES de "coleta agendada" (ex.: Coleta Pendente)', () => {
    const process = { ...NAVEGANTES_SCHEDULED, collectionStatus: 'Coleta Pendente' }
    expect(getEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)).toBe(
      '2026-08-20'
    )
  })

  it('aplica o override quando nao ha status de coleta', () => {
    const process = { ...NAVEGANTES_SCHEDULED, collectionStatus: '' }
    expect(getEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)).toBe(
      '2026-08-20'
    )
  })

  it('IGNORA o override em "Coleta Agendada" — usa a data automatica da janela', () => {
    const process = { ...NAVEGANTES_SCHEDULED, collectionStatus: 'Coleta Agendada' }
    const auto = getAutomaticEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)
    const estimated = getEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)
    expect(estimated).toBe(auto)
    expect(estimated).not.toBe('2026-08-20')
    expect(estimated).toBe('2026-07-15') // coleta 15/07 dia util antes do cutoff
  })

  it('IGNORA o override em status posterior (Carga a caminho do CD)', () => {
    const process = { ...NAVEGANTES_SCHEDULED, collectionStatus: 'Carga a caminho do CD' }
    const auto = getAutomaticEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)
    expect(getEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)).toBe(auto)
    expect(getEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)).not.toBe(
      '2026-08-20'
    )
  })

  it('IGNORA o override em "Carga recebida"', () => {
    const process = { ...NAVEGANTES_SCHEDULED, collectionStatus: 'Carga recebida' }
    expect(getEstimatedDeliveryDate(process, process.category, DEFAULT_FORECAST_SETTINGS)).not.toBe(
      '2026-08-20'
    )
  })
})
