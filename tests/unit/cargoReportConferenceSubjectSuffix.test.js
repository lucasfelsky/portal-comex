// Fatia D: sufixo " (com divergências)" no assunto/título da conferência (só com unidades divergentes) e a remoção dele em
// `extractCargoReportProcessLabel` (o rótulo de "Processo:" e o preheader não levam o sufixo). Módulo PURO, sem mocks.

import { describe, expect, it } from 'vitest'

import {
  CARGO_REPORT_CONFERENCE_DIVERGENCE_SUFFIX,
  buildCargoReportConferenceSubject,
  buildCargoReportSubject,
  extractCargoReportProcessLabel,
} from '../../functions/src/process/cargoReportNotification.js'

const PROCESS = { category: 'FCL', processNumber: '9036', name: 'DEMO SEA 001-26' }
const BASE = 'Conferência do Relatório de Carga - PO 9036 - DEMO SEA 001-26'

describe('buildCargoReportConferenceSubject: sufixo de divergência', () => {
  it('sem divergência (padrão ou false): assunto de hoje, sem sufixo', () => {
    expect(buildCargoReportConferenceSubject(PROCESS)).toBe(BASE)
    expect(buildCargoReportConferenceSubject(PROCESS, {})).toBe(BASE)
    expect(buildCargoReportConferenceSubject(PROCESS, { divergent: false })).toBe(BASE)
  })

  it('com divergência: acrescenta " (com divergências)"', () => {
    expect(CARGO_REPORT_CONFERENCE_DIVERGENCE_SUFFIX).toBe(' (com divergências)')
    expect(buildCargoReportConferenceSubject(PROCESS, { divergent: true })).toBe(`${BASE} (com divergências)`)
  })

  it('CONSOLIDADO e processo sem dados também levam o sufixo', () => {
    expect(buildCargoReportConferenceSubject({ category: 'CONSOLIDADO', name: 'DEMO CONSOL 02' }, { divergent: true })).toBe(
      'Conferência do Relatório de Carga - DEMO CONSOL 02 (com divergências)'
    )
    expect(buildCargoReportConferenceSubject({}, { divergent: true })).toBe(
      'Conferência do Relatório de Carga (com divergências)'
    )
  })

  it('o assunto do COMEX (buildCargoReportSubject) não muda', () => {
    expect(buildCargoReportSubject(PROCESS)).toBe('Relatório de Carga - PO 9036 - DEMO SEA 001-26')
  })
})

describe('extractCargoReportProcessLabel: o sufixo não vaza para o rótulo', () => {
  it('conferência com sufixo: rótulo sem o sufixo', () => {
    expect(extractCargoReportProcessLabel(`${BASE} (com divergências)`)).toBe('PO 9036 - DEMO SEA 001-26')
    expect(extractCargoReportProcessLabel('Conferência do Relatório de Carga - DEMO CONSOL 02 (com divergências)')).toBe('DEMO CONSOL 02')
  })

  it('conferência sem sufixo: rótulo de hoje', () => {
    expect(extractCargoReportProcessLabel(BASE)).toBe('PO 9036 - DEMO SEA 001-26')
  })

  it('só prefixo + sufixo (e só prefixo): vazio', () => {
    expect(extractCargoReportProcessLabel('Conferência do Relatório de Carga (com divergências)')).toBe('')
    expect(extractCargoReportProcessLabel('Conferência do Relatório de Carga')).toBe('')
  })

  it('assunto do COMEX nunca é alterado, mesmo que termine com o texto do sufixo', () => {
    expect(extractCargoReportProcessLabel('Relatório de Carga - PO 9036 - DEMO SEA 001-26')).toBe('PO 9036 - DEMO SEA 001-26')
    expect(extractCargoReportProcessLabel('Relatório de Carga - DEMO (com divergências)')).toBe('DEMO (com divergências)')
  })

  it('texto fora do padrão: o próprio texto, sanitizado, sem mexer no sufixo', () => {
    expect(extractCargoReportProcessLabel('Outro assunto (com divergências)')).toBe('Outro assunto (com divergências)')
    expect(extractCargoReportProcessLabel('')).toBe('')
    expect(extractCargoReportProcessLabel(undefined)).toBe('')
  })

  it('ida e volta com o assunto montado (com e sem sufixo)', () => {
    for (const divergent of [false, true]) {
      expect(extractCargoReportProcessLabel(buildCargoReportConferenceSubject(PROCESS, { divergent }))).toBe('PO 9036 - DEMO SEA 001-26')
    }
  })
})
