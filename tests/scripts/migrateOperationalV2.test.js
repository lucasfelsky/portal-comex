// F17.1a: `planProcessStatusMigration` (funcao pura, sem I/O) do script de
// migracao. Cobre D-B (recalculo) + AD-2 (nunca rebaixa etapa).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  planProcessStatusMigration,
  planMapaToLicensesMigration,
  planOperationalMigration,
  MIGRATION_STEPS,
  toFirestoreFieldValue,
  fromFirestoreValue,
} from '../../scripts/migrateOperationalV2.mjs'

function findStep(plan, id) {
  return plan.find((step) => step.id === id)
}

describe('planProcessStatusMigration', () => {
  it('processo pre-chegada (sem sinais) nunca muda', () => {
    const plan = planProcessStatusMigration([
      { id: 'P1', category: 'FCL', processStatus: 'Aguardando Embarque' },
    ])
    expect(findStep(plan, 'P1').type).toBe('unchanged')
  })

  it('berthed true gravado "Aguardando atracação" -> recalc pra "Atracação Confirmada"', () => {
    const plan = planProcessStatusMigration([
      {
        id: 'P2',
        category: 'FCL',
        processStatus: 'Aguardando atracação',
        berthed: true,
      },
    ])
    const step = findStep(plan, 'P2')
    expect(step.type).toBe('recalc')
    expect(step.after).toBe('Atracação Confirmada')
    expect(step.changes.processStatus).toBe('Atracação Confirmada')
    expect(step.changes.updatedById).toBe('')
  })

  it('Verde + Parametrizada -> recalc pra "Aguardando agendamento de coleta"', () => {
    const plan = planProcessStatusMigration([
      {
        id: 'P3',
        category: 'FCL',
        processStatus: 'Aguardando parametrização da DUIMP',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Verde',
      },
    ])
    const step = findStep(plan, 'P3')
    expect(step.type).toBe('recalc')
    expect(step.after).toBe('Aguardando agendamento de coleta')
  })

  it('Amarelo (sem clearance) -> recalc pra "Aguardando desembaraço"', () => {
    const plan = planProcessStatusMigration([
      {
        id: 'P4',
        category: 'FCL',
        processStatus: 'Aguardando registro da DUIMP',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Amarelo',
      },
    ])
    const step = findStep(plan, 'P4')
    expect(step.type).toBe('recalc')
    expect(step.after).toBe('Aguardando desembaraço')
  })

  it('"Carga recebida" + collectionStatus vazio -> legacy-received (nao rebaixa)', () => {
    const plan = planProcessStatusMigration([
      {
        id: 'P5',
        category: 'FCL',
        processStatus: 'Carga recebida',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Amarelo',
        collectionStatus: '',
      },
    ])
    const step = findStep(plan, 'P5')
    expect(step.type).toBe('legacy-received')
    expect(step.after).toBe('Carga recebida')
    expect(step.changes.collectionStatus).toBe('Carga disponível em estoque')
    expect(step.changes.updatedById).toBe('')
  })

  it('entrada em "Carga recebida" sem data -> cargoReceivedAt = nowIso', () => {
    const plan = planProcessStatusMigration(
      [
        {
          id: 'P6',
          category: 'FCL',
          processStatus: 'Coleta Agendada',
          collectionStatus: 'Carga disponível em estoque',
          cargoReceivedAt: '',
        },
      ],
      { nowIso: '2026-01-01T00:00:00.000Z' }
    )
    const step = findStep(plan, 'P6')
    expect(step.type).toBe('recalc')
    expect(step.after).toBe('Carga recebida')
    expect(step.changes.cargoReceivedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('processo ja alinhado (gravado === derivado) -> unchanged', () => {
    const plan = planProcessStatusMigration([
      {
        id: 'P7',
        category: 'FCL',
        processStatus: 'Coleta Agendada',
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ scheduledAt: '2026-02-01T10:00:00.000Z' }],
      },
    ])
    const step = findStep(plan, 'P7')
    expect(step.type).toBe('unchanged')
  })

  it('AD-2: Amarelo gravado "Coleta Agendada" SEM clearance -> needs-review, sem proposta', () => {
    const plan = planProcessStatusMigration([
      {
        id: 'P8',
        category: 'FCL',
        processStatus: 'Coleta Agendada',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Amarelo',
      },
    ])
    const step = findStep(plan, 'P8')
    expect(step.type).toBe('needs-review')
    expect(step.changes).toBeNull()
  })

  it('AD-2: o mesmo processo COM clearanceCompletedAt -> recalc ou unchanged (nunca needs-review)', () => {
    const plan = planProcessStatusMigration([
      {
        id: 'P9',
        category: 'FCL',
        processStatus: 'Coleta Agendada',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Amarelo',
        clearanceCompletedAt: '2026-01-01T10:00',
        mapaStatus: 'Liberado',
      },
    ])
    const step = findStep(plan, 'P9')
    expect(['recalc', 'unchanged']).toContain(step.type)
  })

  it('toda proposta de escrita (recalc/legacy-received) tem updatedById vazio', () => {
    const plan = planProcessStatusMigration([
      { id: 'P10', category: 'FCL', processStatus: 'Aguardando atracação', berthed: true },
      {
        id: 'P11',
        category: 'FCL',
        processStatus: 'Carga recebida',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Amarelo',
        collectionStatus: '',
      },
    ])
    for (const step of plan) {
      if (step.changes) {
        expect(step.changes.updatedById).toBe('')
      }
    }
  })
})

// F17.2b (D-11): `planMapaToLicensesMigration` - mapaStatus legado -> licenses[].
describe('planMapaToLicensesMigration', () => {
  const mapaStatusCases = [
    ['Aguardando MAPA', 'Em análise'],
    ['Selecionado para Vistoria', 'Selecionada para vistoria'],
    ['Vistoria agendada, aguardando realização', 'Vistoria agendada'],
    ['Vistoria realizada, aguardando deferimento da LPCO', 'Vistoria realizada'],
    ['Liberado', 'Deferida'],
    ['LPCO deferida, MAPA liberado', 'Deferida'],
  ]

  it.each(mapaStatusCases)('%s -> mapa-to-licenses com status %s', (mapaStatus, expectedStatus) => {
    const plan = planMapaToLicensesMigration([{ id: 'P1', category: 'FCL', mapaStatus }])
    expect(plan[0].type).toBe('mapa-to-licenses')
    expect(plan[0].changes.licenses[0].status).toBe(expectedStatus)
    expect(plan[0].changes.licenses[0].id).toBe('LIC-MAPA')
    expect(plan[0].changes.updatedById).toBe('')
  })

  it('valor desconhecido -> needs-review, sem changes', () => {
    const plan = planMapaToLicensesMigration([
      { id: 'P2', category: 'FCL', mapaStatus: 'valor-nunca-visto' },
    ])
    expect(plan[0].type).toBe('needs-review')
    expect(plan[0].changes).toBeNull()
  })

  it('AEREO com mapaStatus preenchido -> skipped', () => {
    const plan = planMapaToLicensesMigration([
      { id: 'P3', category: 'AEREO', mapaStatus: 'Liberado' },
    ])
    expect(plan[0].type).toBe('skipped')
    expect(plan[0].changes).toBeNull()
  })

  it('doc com licenses[] -> unchanged', () => {
    const plan = planMapaToLicensesMigration([
      { id: 'P4', category: 'FCL', mapaStatus: 'Liberado', licenses: [] },
    ])
    expect(plan[0].type).toBe('unchanged')
  })

  it('mapaStatus vazio -> unchanged', () => {
    const plan = planMapaToLicensesMigration([{ id: 'P5', category: 'FCL', mapaStatus: '' }])
    expect(plan[0].type).toBe('unchanged')
  })
})

describe('MIGRATION_STEPS', () => {
  it("ids na ordem ['mapaToLicenses', 'recalcProcessStatus']", () => {
    expect(MIGRATION_STEPS.map((s) => s.id)).toEqual(['mapaToLicenses', 'recalcProcessStatus'])
  })
})

describe('planOperationalMigration (D-11)', () => {
  it('doc maritimo Verde + mapaStatus Liberado -> 1 PATCH com licenses E processStatus recalculado', () => {
    const plan = planOperationalMigration([
      {
        id: 'P1',
        category: 'FCL',
        processStatus: 'Aguardando parametrização da DUIMP',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Verde',
        mapaStatus: 'Liberado',
      },
    ])
    const doc = plan.find((item) => item.id === 'P1')
    expect(doc.changes.licenses[0].status).toBe('Deferida')
    expect(doc.changes.processStatus).toBe('Aguardando agendamento de coleta')
  })

  it('doc cuja derivacao rebaixaria etapa -> passo 2 needs-review, PATCH so com as changes do passo 1', () => {
    const plan = planOperationalMigration([
      {
        id: 'P2',
        category: 'FCL',
        processStatus: 'Coleta Agendada',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Amarelo',
        mapaStatus: 'Liberado',
      },
    ])
    const doc = plan.find((item) => item.id === 'P2')
    const recalcStep = doc.steps.find((step) => step.stepId === 'recalcProcessStatus')
    expect(recalcStep.type).toBe('needs-review')
    expect(doc.changes).toEqual({
      licenses: [expect.objectContaining({ id: 'LIC-MAPA', status: 'Deferida' })],
      updatedById: '',
      updatedByName: 'Migração F17.1',
    })
  })

  it('toda escrita tem updatedById vazio', () => {
    const plan = planOperationalMigration([
      { id: 'P3', category: 'FCL', processStatus: 'Aguardando atracação', berthed: true, mapaStatus: 'Liberado' },
    ])
    for (const doc of plan) {
      if (doc.changes) expect(doc.changes.updatedById).toBe('')
    }
  })

  it('segunda passada sobre o resultado aplicado -> nenhum changes', () => {
    const initial = [
      {
        id: 'P4',
        category: 'FCL',
        processStatus: 'Aguardando parametrização da DUIMP',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Verde',
        mapaStatus: 'Liberado',
      },
    ]
    const firstPlan = planOperationalMigration(initial)
    const applied = initial.map((doc, index) => ({ ...doc, ...(firstPlan[index].changes ?? {}) }))
    const secondPlan = planOperationalMigration(applied)
    for (const doc of secondPlan) {
      expect(doc.changes).toBeNull()
    }
  })
})

describe('toFirestoreFieldValue / fromFirestoreValue (D-11)', () => {
  it('array de objetos -> arrayValue.values[].mapValue.fields', () => {
    const value = toFirestoreFieldValue([{ id: 'LIC-1', status: 'Deferida' }])
    expect(value.arrayValue.values[0].mapValue.fields.id).toEqual({ stringValue: 'LIC-1' })
    expect(value.arrayValue.values[0].mapValue.fields.status).toEqual({ stringValue: 'Deferida' })
  })

  it('array vazio -> { arrayValue: {} }', () => {
    expect(toFirestoreFieldValue([])).toEqual({ arrayValue: {} })
  })

  it('ida-e-volta preserva o valor original', () => {
    const original = [{ id: 'LIC-1', agency: 'MAPA', status: 'Deferida', ok: true, count: 2 }]
    const roundTripped = fromFirestoreValue(toFirestoreFieldValue(original))
    expect(roundTripped).toEqual(original)
  })

  it('null/undefined -> nullValue', () => {
    expect(toFirestoreFieldValue(null)).toEqual({ nullValue: null })
    expect(toFirestoreFieldValue(undefined)).toEqual({ nullValue: null })
  })
})
