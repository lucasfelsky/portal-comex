// F17.1a: `planProcessStatusMigration` (funcao pura, sem I/O) do script de
// migracao. Cobre D-B (recalculo) + AD-2 (nunca rebaixa etapa).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { planProcessStatusMigration } from '../../scripts/migrateOperationalV2.mjs'

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
