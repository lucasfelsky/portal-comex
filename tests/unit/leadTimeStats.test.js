// F17.6: testes do util puro do painel de lead time
// (src/features/admin/leadTimeStats.js).
import { describe, expect, it } from 'vitest'
import {
  computeStats,
  toSaoPauloDateKey,
  buildProcessSamples,
  buildLeadTimeReport,
  buildBusinessDaysSuggestions,
} from '../../src/features/admin/leadTimeStats'

describe('computeStats', () => {
  it('n=0 -> median/p80 null', () => {
    expect(computeStats([])).toEqual({ n: 0, median: null, p80: null })
  })

  it('n=1', () => {
    expect(computeStats([7])).toEqual({ n: 1, median: 7, p80: 7 })
  })

  it('n par [2,4,6,8] -> mediana 5, P80 8', () => {
    const stats = computeStats([2, 4, 6, 8])
    expect(stats.n).toBe(4)
    expect(stats.median).toBe(5)
    expect(stats.p80).toBe(8)
  })

  it('n=5 [1..5] -> P80 4', () => {
    const stats = computeStats([1, 2, 3, 4, 5])
    expect(stats.n).toBe(5)
    expect(stats.median).toBe(3)
    expect(stats.p80).toBe(4)
  })
})

describe('toSaoPauloDateKey', () => {
  it('ISO com Z antes da meia-noite BRT -> dia anterior', () => {
    expect(toSaoPauloDateKey('2026-09-10T02:30:00.000Z')).toBe('2026-09-09')
  })

  it('ISO com Z depois da meia-noite BRT -> mesmo dia', () => {
    expect(toSaoPauloDateKey('2026-09-10T03:00:00.000Z')).toBe('2026-09-10')
  })

  it('sem fuso (datetime-local, ja BRT) -> primeiros 10 chars', () => {
    expect(toSaoPauloDateKey('2026-09-10T14:00')).toBe('2026-09-10')
  })

  it('lixo -> string vazia', () => {
    expect(toSaoPauloDateKey('lixo')).toBe('')
    expect(toSaoPauloDateKey('')).toBe('')
    expect(toSaoPauloDateKey(undefined)).toBe('')
  })
})

function makeEvent(type, occurredAt, { value, recordedAt } = {}) {
  return {
    type,
    occurredAt,
    value: value ?? '',
    recordedAt: recordedAt ?? occurredAt,
  }
}

describe('buildProcessSamples', () => {
  it('FCL usa berthed e ignora arrived', () => {
    const process = { category: 'FCL', destination: 'NAVEGANTES - SC' }
    const events = [
      makeEvent('shipped', '2026-08-01T10:00:00.000Z'),
      makeEvent('berthed', '2026-08-15T10:00:00.000Z'),
      makeEvent('arrived', '2026-08-20T10:00:00.000Z'),
      makeEvent('received', '2026-08-25T10:00:00.000Z'),
    ]
    const { samples } = buildProcessSamples(process, events)
    const transit = samples.find((sample) => sample.segmentId === 'transit')
    expect(transit).toBeTruthy()
    // shipped 08-01 -> berthed 08-15 (usa berthed, nao arrived)
    expect(transit.days).toBe(14)
  })

  it('AEREO usa arrived', () => {
    const process = { category: 'AEREO', destination: 'NAVEGANTES - SC' }
    const events = [
      makeEvent('shipped', '2026-08-01T10:00:00.000Z'),
      makeEvent('berthed', '2026-08-15T10:00:00.000Z'),
      makeEvent('arrived', '2026-08-03T10:00:00.000Z'),
    ]
    const { samples } = buildProcessSamples(process, events)
    const transit = samples.find((sample) => sample.segmentId === 'transit')
    expect(transit.days).toBe(2)
  })

  it('coleta vem do value do collectionScheduled', () => {
    const process = { category: 'FCL', destination: 'ITAPOA' }
    const events = [
      makeEvent('cleared', '2026-08-10T10:00:00.000Z'),
      makeEvent('collectionScheduled', '2026-08-11T09:00:00.000Z', { value: '2026-08-12T14:00' }),
      makeEvent('received', '2026-08-14T10:00:00.000Z'),
    ]
    const { samples } = buildProcessSamples(process, events)
    const toCollection = samples.find((sample) => sample.segmentId === 'toCollection')
    // cleared 08-10 -> coleta 08-12 (value, nao o occurredAt do save 08-11)
    expect(toCollection.days).toBe(2)
  })

  it('coleta cai no occurredAt quando value é inválido', () => {
    const process = { category: 'FCL', destination: 'ITAPOA' }
    const events = [
      makeEvent('cleared', '2026-08-10T10:00:00.000Z'),
      makeEvent('collectionScheduled', '2026-08-12T09:00:00.000Z', { value: 'invalido' }),
      makeEvent('received', '2026-08-14T10:00:00.000Z'),
    ]
    const { samples } = buildProcessSamples(process, events)
    const toCollection = samples.find((sample) => sample.segmentId === 'toCollection')
    expect(toCollection.days).toBe(2)
  })

  it('dois received -> usa o de maior recordedAt', () => {
    const process = { category: 'FCL', destination: 'ITAPOA' }
    const events = [
      makeEvent('shipped', '2026-08-01T10:00:00.000Z'),
      makeEvent('berthed', '2026-08-10T10:00:00.000Z'),
      makeEvent('received', '2026-08-14T10:00:00.000Z', { recordedAt: '2026-08-14T10:00:00.000Z' }),
      makeEvent('received', '2026-08-20T10:00:00.000Z', { recordedAt: '2026-08-20T10:00:00.000Z' }),
    ]
    const { samples } = buildProcessSamples(process, events)
    const total = samples.find((sample) => sample.segmentId === 'total')
    expect(total.days).toBe(19)
  })

  it('conta negative/outlier/invalid', () => {
    const process = { category: 'FCL', destination: 'ITAPOA' }
    const events = [
      makeEvent('shipped', '2026-08-20T10:00:00.000Z'),
      makeEvent('berthed', '2026-08-01T10:00:00.000Z'), // fim antes do início
    ]
    const { excluded } = buildProcessSamples(process, events)
    expect(excluded.negative).toBe(1)

    const outlierEvents = [
      makeEvent('shipped', '2026-01-01T10:00:00.000Z'),
      makeEvent('berthed', '2026-12-01T10:00:00.000Z'), // > 180 dias
    ]
    const outlierResult = buildProcessSamples(process, outlierEvents)
    expect(outlierResult.excluded.outlier).toBe(1)

    const invalidEvents = [
      makeEvent('shipped', 'lixo'),
      makeEvent('berthed', '2026-08-15T10:00:00.000Z'),
    ]
    const invalidResult = buildProcessSamples(process, invalidEvents)
    expect(invalidResult.excluded.invalid).toBe(1)
  })

  it('processo arquivado -> sem amostras', () => {
    const process = { category: 'FCL', destination: 'ITAPOA', archived: true }
    const events = [
      makeEvent('shipped', '2026-08-01T10:00:00.000Z'),
      makeEvent('berthed', '2026-08-15T10:00:00.000Z'),
    ]
    const { samples } = buildProcessSamples(process, events)
    expect(samples).toEqual([])
  })

  it('marco ausente NAO conta como excluido (processo ainda em transito)', () => {
    const process = { category: 'FCL', destination: 'ITAPOA' }
    const events = [makeEvent('shipped', '2026-08-01T10:00:00.000Z')]
    const { samples, excluded } = buildProcessSamples(process, events)
    expect(samples).toEqual([])
    expect(excluded).toEqual({ negative: 0, outlier: 0, invalid: 0 })
  })

  it('arrivalToReceiptBusiness em dias uteis', () => {
    const process = { category: 'FCL', destination: 'ITAPOA' }
    const events = [
      makeEvent('berthed', '2026-09-25T10:00:00.000Z'), // sex
      makeEvent('received', '2026-09-28T10:00:00.000Z'), // seg
    ]
    const { samples } = buildProcessSamples(process, events)
    const businessSample = samples.find((sample) => sample.segmentId === 'arrivalToReceiptBusiness')
    expect(businessSample.days).toBe(1)
  })
})

const DESTINATIONS = [
  { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
  { match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 0 },
]

describe('buildLeadTimeReport', () => {
  it('agrupa por porto com label de destinations e linha Todos os portos por último', () => {
    const processes = [
      { id: 'p1', category: 'FCL', destination: 'NAVEGANTES - SC' },
      { id: 'p2', category: 'FCL', destination: 'NAVEGANTES - SC' },
      { id: 'p3', category: 'FCL', destination: 'NAVEGANTES - SC' },
    ]
    const eventsByProcessId = {
      p1: [makeEvent('shipped', '2026-08-01T10:00:00.000Z'), makeEvent('berthed', '2026-08-11T10:00:00.000Z')],
      p2: [makeEvent('shipped', '2026-08-01T10:00:00.000Z'), makeEvent('berthed', '2026-08-13T10:00:00.000Z')],
      p3: [makeEvent('shipped', '2026-08-01T10:00:00.000Z'), makeEvent('berthed', '2026-08-15T10:00:00.000Z')],
    }
    const report = buildLeadTimeReport({
      processes,
      eventsByProcessId,
      destinations: DESTINATIONS,
      periodDays: null,
      todayKey: '2026-09-25',
    })
    const fclGroup = report.groups.find((group) => group.category === 'FCL')
    expect(fclGroup.rows[fclGroup.rows.length - 1].isAll).toBe(true)
    expect(fclGroup.rows[fclGroup.rows.length - 1].portLabel).toBe('Todos os portos')
    expect(fclGroup.rows[0].portLabel).toBe('Navegantes')
  })

  it('sufficient false com n=2 e true com n=3', () => {
    const processes = [
      { id: 'p1', category: 'LCL', destination: 'ITAPOA' },
      { id: 'p2', category: 'LCL', destination: 'ITAPOA' },
    ]
    const eventsByProcessId = {
      p1: [makeEvent('shipped', '2026-08-01T10:00:00.000Z'), makeEvent('berthed', '2026-08-11T10:00:00.000Z')],
      p2: [makeEvent('shipped', '2026-08-01T10:00:00.000Z'), makeEvent('berthed', '2026-08-13T10:00:00.000Z')],
    }
    const twoSampleReport = buildLeadTimeReport({
      processes,
      eventsByProcessId,
      destinations: DESTINATIONS,
      periodDays: null,
      todayKey: '2026-09-25',
    })
    const lclGroup = twoSampleReport.groups.find((group) => group.category === 'LCL')
    const allRow = lclGroup.rows.find((row) => row.isAll)
    expect(allRow.segments.transit.sufficient).toBe(false)

    const threeProcesses = [
      ...processes,
      { id: 'p3', category: 'LCL', destination: 'ITAPOA' },
    ]
    const threeEvents = {
      ...eventsByProcessId,
      p3: [makeEvent('shipped', '2026-08-01T10:00:00.000Z'), makeEvent('berthed', '2026-08-15T10:00:00.000Z')],
    }
    const threeSampleReport = buildLeadTimeReport({
      processes: threeProcesses,
      eventsByProcessId: threeEvents,
      destinations: DESTINATIONS,
      periodDays: null,
      todayKey: '2026-09-25',
    })
    const lclGroup3 = threeSampleReport.groups.find((group) => group.category === 'LCL')
    const allRow3 = lclGroup3.rows.find((row) => row.isAll)
    expect(allRow3.segments.transit.sufficient).toBe(true)
    expect(allRow3.segments.transit.n).toBe(3)
  })

  it('filtro de período pela data de fim com todayKey injetado', () => {
    const processes = [
      { id: 'old', category: 'FCL', destination: 'ITAPOA' },
      { id: 'recent', category: 'FCL', destination: 'ITAPOA' },
    ]
    const eventsByProcessId = {
      old: [makeEvent('shipped', '2025-01-01T10:00:00.000Z'), makeEvent('berthed', '2025-01-10T10:00:00.000Z')],
      recent: [makeEvent('shipped', '2026-09-01T10:00:00.000Z'), makeEvent('berthed', '2026-09-10T10:00:00.000Z')],
    }
    const report = buildLeadTimeReport({
      processes,
      eventsByProcessId,
      destinations: DESTINATIONS,
      periodDays: 90,
      todayKey: '2026-09-25',
    })
    expect(report.sampleCount).toBe(1)
  })
})

describe('buildBusinessDaysSuggestions', () => {
  function buildReportWithArrivalStat(category, n, median, p80) {
    return {
      groups: [
        {
          category,
          rows: [
            {
              isAll: true,
              segments: {
                arrivalToReceiptBusiness: { n, median, p80, sufficient: n >= 3 },
              },
            },
          ],
        },
      ],
    }
  }

  it('n=4 -> null (abaixo do minimo de sugestao)', () => {
    const report = buildReportWithArrivalStat('FCL', 4, 6, 7)
    const suggestions = buildBusinessDaysSuggestions(report, { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 })
    const fcl = suggestions.find((entry) => entry.category === 'FCL')
    expect(fcl.suggested).toBeNull()
  })

  it('n=5 mediana 5.5 atual 5 -> sugere 6', () => {
    const report = buildReportWithArrivalStat('FCL', 5, 5.5, 6)
    const suggestions = buildBusinessDaysSuggestions(report, { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 })
    const fcl = suggestions.find((entry) => entry.category === 'FCL')
    expect(fcl.suggested).toBe(6)
  })

  it('mediana igual ao atual -> null', () => {
    const report = buildReportWithArrivalStat('FCL', 5, 5, 5)
    const suggestions = buildBusinessDaysSuggestions(report, { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 })
    const fcl = suggestions.find((entry) => entry.category === 'FCL')
    expect(fcl.suggested).toBeNull()
  })

  it('clamp em 30', () => {
    const report = buildReportWithArrivalStat('FCL', 5, 40, 45)
    const suggestions = buildBusinessDaysSuggestions(report, { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 })
    const fcl = suggestions.find((entry) => entry.category === 'FCL')
    expect(fcl.suggested).toBe(30)
  })
})
