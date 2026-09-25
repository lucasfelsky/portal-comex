// F17.2b (D-1..D-4): cobertura de `src/features/processes/licenses.js` -
// vocabulario fechado, normalizacao, compat de leitura MAPA e gate de
// coleta. Este arquivo esta em `tests/unit/` (nao entra na contagem fixa do
// `audit-vault-counts`).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  LICENSE_AGENCY_OPTIONS,
  LICENSE_STATUS_OPTIONS,
  MAX_LICENSES,
  normalizeLicenses,
  mapLegacyMapaStatus,
  getEffectiveLicenses,
  areLicensesCleared,
  isLicenseDeferred,
  isLicenseRejected,
  hasRejectedLicense,
  createEmptyLicense,
  buildLegacyMapaLicense,
} from '../../src/features/processes/licenses.js'

describe('vocabulario fechado (D-1)', () => {
  it('7 orgaos e 8 status', () => {
    expect(LICENSE_AGENCY_OPTIONS).toHaveLength(7)
    expect(LICENSE_STATUS_OPTIONS).toHaveLength(8)
    expect(MAX_LICENSES).toBe(10)
  })
})

describe('normalizeLicenses (D-2)', () => {
  it('nao-array -> []', () => {
    expect(normalizeLicenses(null)).toEqual([])
    expect(normalizeLicenses(undefined)).toEqual([])
    expect(normalizeLicenses('x')).toEqual([])
  })

  it('teto de 10 itens', () => {
    const raw = Array.from({ length: 15 }, (_, index) => ({ id: `L-${index}` }))
    expect(normalizeLicenses(raw)).toHaveLength(10)
  })

  it('id ausente vira LIC-n deterministico', () => {
    const result = normalizeLicenses([{}, {}])
    expect(result[0].id).toBe('LIC-1')
    expect(result[1].id).toBe('LIC-2')
  })

  it('id preenchido e preservado (trim)', () => {
    const result = normalizeLicenses([{ id: '  LIC-X  ' }])
    expect(result[0].id).toBe('LIC-X')
  })

  it('orgao desconhecido -> Outro', () => {
    expect(normalizeLicenses([{ agency: 'Receita Federal' }])[0].agency).toBe('Outro')
  })

  it('status desconhecido/vazio -> Aguardando registro', () => {
    expect(normalizeLicenses([{ status: '' }])[0].status).toBe('Aguardando registro')
    expect(normalizeLicenses([{ status: 'blah' }])[0].status).toBe('Aguardando registro')
  })

  it('acento/caixa: "deferida" -> "Deferida"', () => {
    expect(normalizeLicenses([{ status: 'deferida' }])[0].status).toBe('Deferida')
    expect(normalizeLicenses([{ status: ' DEFERIDA ' }])[0].status).toBe('Deferida')
  })

  it('deferredAt limpo fora de status Deferida', () => {
    expect(
      normalizeLicenses([{ status: 'Em análise', deferredAt: '2026-09-20' }])[0].deferredAt
    ).toBe('')
  })

  it('deferredAt preservado (slice 10) com status Deferida', () => {
    expect(
      normalizeLicenses([{ status: 'Deferida', deferredAt: '2026-09-20T10:00' }])[0].deferredAt
    ).toBe('2026-09-20')
  })

  it('deferredAt fora do formato YYYY-MM-DD e limpo mesmo com status Deferida', () => {
    expect(normalizeLicenses([{ status: 'Deferida', deferredAt: 'lixo' }])[0].deferredAt).toBe('')
  })

  it('inspectionScheduledAt limpo em "Em análise"', () => {
    expect(
      normalizeLicenses([{ status: 'Em análise', inspectionScheduledAt: '2026-09-20T10:00' }])[0]
        .inspectionScheduledAt
    ).toBe('')
  })

  it('inspectionScheduledAt preservado em "Vistoria agendada"/"Vistoria realizada"/"Deferida"/"Indeferida"', () => {
    for (const status of ['Vistoria agendada', 'Vistoria realizada', 'Deferida', 'Indeferida']) {
      expect(
        normalizeLicenses([{ status, inspectionScheduledAt: '2026-09-20T10:00' }])[0]
          .inspectionScheduledAt
      ).toBe('2026-09-20T10:00')
    }
  })

  it('ordem de chaves fixa (paridade com functions/ via JSON.stringify)', () => {
    const result = normalizeLicenses([
      { id: 'L-1', agency: 'MAPA', lpcoNumber: '123', status: 'Deferida', deferredAt: '2026-09-20', notes: 'x' },
    ])
    expect(Object.keys(result[0])).toEqual([
      'id',
      'agency',
      'lpcoNumber',
      'status',
      'inspectionScheduledAt',
      'deferredAt',
      'notes',
    ])
  })

  it('notes truncado em 500 caracteres', () => {
    const long = 'a'.repeat(600)
    expect(normalizeLicenses([{ notes: long }])[0].notes).toHaveLength(500)
  })
})

describe('mapLegacyMapaStatus (D-3)', () => {
  const cases = [
    ['Aguardando MAPA', 'Em análise', true],
    ['Selecionado para Vistoria', 'Selecionada para vistoria', true],
    ['Vistoria agendada, aguardando realização', 'Vistoria agendada', true],
    ['Vistoria realizada, aguardando deferimento da LPCO', 'Vistoria realizada', true],
    ['Liberado', 'Deferida', true],
    ['LPCO deferida, MAPA liberado', 'Deferida', true],
    ['valor-desconhecido', 'Em análise', false],
    ['', 'Em análise', false],
  ]

  it.each(cases)('%s -> %s (known=%s)', (input, expectedStatus, expectedKnown) => {
    expect(mapLegacyMapaStatus(input)).toEqual({ status: expectedStatus, known: expectedKnown })
  })
})

describe('getEffectiveLicenses (D-3)', () => {
  it('licenses: [] e autoritativo mesmo com mapaStatus preenchido (maritimo)', () => {
    expect(
      getEffectiveLicenses({ category: 'FCL', licenses: [], mapaStatus: 'Liberado' })
    ).toEqual([])
  })

  it('AEREO com mapaStatus preenchido -> [] (compat MAPA e so maritimo)', () => {
    expect(getEffectiveLicenses({ category: 'AEREO', mapaStatus: 'Liberado' })).toEqual([])
  })

  it('maritimo legado sem licenses[] -> [LIC-MAPA]', () => {
    const result = getEffectiveLicenses({ category: 'FCL', mapaStatus: 'Liberado' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('LIC-MAPA')
    expect(result[0].status).toBe('Deferida')
  })

  it('maritimo sem licenses[] e sem mapaStatus -> []', () => {
    expect(getEffectiveLicenses({ category: 'FCL', mapaStatus: '' })).toEqual([])
  })
})

describe('buildLegacyMapaLicense', () => {
  it('valor desconhecido preserva o original em notes', () => {
    const license = buildLegacyMapaLicense({ category: 'FCL', mapaStatus: 'Status Estranho' })
    expect(license.notes).toBe('Status MAPA legado: Status Estranho')
  })

  it('"Vistoria agendada, aguardando realização" preserva mapaInspectionScheduledAt', () => {
    const license = buildLegacyMapaLicense({
      mapaStatus: 'Vistoria agendada, aguardando realização',
      mapaInspectionScheduledAt: '2026-09-20T10:00',
    })
    expect(license.inspectionScheduledAt).toBe('2026-09-20T10:00')
  })
})

describe('areLicensesCleared (D-4)', () => {
  it('lista vazia libera', () => {
    expect(areLicensesCleared({ category: 'AEREO', licenses: [] })).toBe(true)
  })

  it('1 licenca "Em análise" bloqueia', () => {
    expect(areLicensesCleared({ licenses: [{ status: 'Em análise' }] })).toBe(false)
  })

  it('todas "Deferida" libera', () => {
    expect(
      areLicensesCleared({ licenses: [{ status: 'Deferida' }, { status: 'Deferida' }] })
    ).toBe(true)
  })

  it('"Indeferida" bloqueia', () => {
    expect(areLicensesCleared({ licenses: [{ status: 'Indeferida' }] })).toBe(false)
  })
})

describe('hasRejectedLicense', () => {
  it('true com alguma Indeferida', () => {
    expect(hasRejectedLicense({ licenses: [{ status: 'Deferida' }, { status: 'Indeferida' }] })).toBe(
      true
    )
  })

  it('false sem Indeferida', () => {
    expect(hasRejectedLicense({ licenses: [{ status: 'Deferida' }] })).toBe(false)
  })
})

describe('isLicenseDeferred / isLicenseRejected', () => {
  it('normaliza acento/caixa', () => {
    expect(isLicenseDeferred('deferida')).toBe(true)
    expect(isLicenseDeferred(' DEFERIDA ')).toBe(true)
    expect(isLicenseRejected('indeferida')).toBe(true)
  })
})

describe('createEmptyLicense', () => {
  it('default agency MAPA e status Aguardando registro', () => {
    const license = createEmptyLicense('L-1')
    expect(license).toEqual({
      id: 'L-1',
      agency: 'MAPA',
      lpcoNumber: '',
      status: 'Aguardando registro',
      inspectionScheduledAt: '',
      deferredAt: '',
      notes: '',
    })
  })
})

// F17.5a (A-7): `getNewlyRejectedLicensesMirror` (espelho puro em
// `functions/src/core/licenses.js`) - notificacao `license_rejected` (L33).
describe('getNewlyRejectedLicensesMirror (functions mirror, A-7)', () => {
  it('"Em análise" -> "Indeferida" = 1', async () => {
    const { getNewlyRejectedLicensesMirror } = await import('../../functions/src/core/licenses.js')
    const before = { licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Em análise' }] }
    const after = { licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }] }
    expect(getNewlyRejectedLicensesMirror(before, after)).toHaveLength(1)
  })

  it('"Indeferida" -> "Indeferida" = 0 (re-salvar nao conta de novo)', async () => {
    const { getNewlyRejectedLicensesMirror } = await import('../../functions/src/core/licenses.js')
    const before = { licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }] }
    const after = { licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }] }
    expect(getNewlyRejectedLicensesMirror(before, after)).toHaveLength(0)
  })

  it('licenca nova ja "Indeferida" = 1', async () => {
    const { getNewlyRejectedLicensesMirror } = await import('../../functions/src/core/licenses.js')
    const before = { licenses: [] }
    const after = { licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }] }
    expect(getNewlyRejectedLicensesMirror(before, after)).toHaveLength(1)
  })

  it('2 licencas indeferidas no mesmo save = 2', async () => {
    const { getNewlyRejectedLicensesMirror } = await import('../../functions/src/core/licenses.js')
    const before = {
      licenses: [
        { id: 'LIC-1', agency: 'ANVISA', status: 'Em análise' },
        { id: 'LIC-2', agency: 'MAPA', status: 'Em análise' },
      ],
    }
    const after = {
      licenses: [
        { id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' },
        { id: 'LIC-2', agency: 'MAPA', status: 'Indeferida' },
      ],
    }
    expect(getNewlyRejectedLicensesMirror(before, after)).toHaveLength(2)
  })

  it('MAPA legado (mapaStatus sem licenses) -> licenses com "Deferida" = 0', async () => {
    const { getNewlyRejectedLicensesMirror } = await import('../../functions/src/core/licenses.js')
    const before = { category: 'FCL', mapaStatus: 'Aguardando MAPA' }
    const after = { category: 'FCL', mapaStatus: 'Liberado' }
    expect(getNewlyRejectedLicensesMirror(before, after)).toHaveLength(0)
  })

  it('before sem licencas e after [] = 0', async () => {
    const { getNewlyRejectedLicensesMirror } = await import('../../functions/src/core/licenses.js')
    const before = {}
    const after = { licenses: [] }
    expect(getNewlyRejectedLicensesMirror(before, after)).toHaveLength(0)
  })
})
