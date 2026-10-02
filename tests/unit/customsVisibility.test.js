// DUIMP sob aguas (D-1/D-3/D-5/D-6): projecao "visao por perfil" do frontend
// + espelho das functions + paridade entre os dois.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  canSeeCustomsBeforeArrival,
  getVisibleProcessStatus,
  getVoyageStatus,
  isCustomsVisibleTo,
  projectProcessForViewer,
  projectProcessesForViewer,
} from '../../src/features/processes/customsVisibility.js'
import {
  EMPTY_CUSTOMS_CLEARANCE_FIELDS,
  isDuimpUnderWater,
} from '../../src/features/processes/arrivalCustoms.js'
import { PRE_ARRIVAL_STATUSES } from '../../src/features/processes/deriveProcessStatus.js'
import { processStatusOptions } from '../../src/features/processes/processStatus.js'
import { getProcessStage } from '../../src/features/processes/processStage.js'
import {
  DERIVED_STATUS_PHASES,
  getProcessDerivedStatus,
} from '../../src/features/processes/processDerivedStatus.js'
import { hasCustomsDetails } from '../../src/features/processes/ProcessOperationalDetails.jsx'
import { buildProcessesExportRows } from '../../src/utils/exportProcesses.js'
import { getDashboardKpis } from '../../src/features/processes/dashboardKpis.js'
import {
  canSeeCustomsBeforeArrivalMirror,
  EMPTY_CUSTOMS_CLEARANCE_FIELDS_MIRROR,
  getVoyageStatusMirror,
  PRE_ARRIVAL_STATUSES_MIRROR,
  PROCESS_STATUS_OPTIONS_MIRROR,
  projectProcessForRestrictedRecipientMirror,
} from '../../functions/src/process/customsVisibility.js'

const TODAY = new Date(2026, 8, 20, 12)
const TODAY_KEY = '2026-09-20'
const CUSTOMS_KEYS = Object.keys(EMPTY_CUSTOMS_CLEARANCE_FIELDS)

function underWaterFcl(overrides = {}) {
  return {
    id: 'p1',
    category: 'FCL',
    name: 'Importacao Atlas',
    processNumber: 'PO-1',
    shippedAt: '2026-09-01',
    eta: '2026-10-15',
    processStatus: 'Aguardando parametrização da DUIMP',
    duimpRegisteredAt: '2026-09-18T09:00',
    duimpNumber: 'DU-123',
    duimpStatus: 'Aguardando parametrização da DUIMP',
    ...overrides,
  }
}

function pickCustoms(process) {
  return Object.fromEntries(CUSTOMS_KEYS.map((key) => [key, process[key]]))
}

describe('canSeeCustomsBeforeArrival (D-1)', () => {
  it('admin e logistica veem; os demais roles (e ausente) sao restritos', () => {
    expect(canSeeCustomsBeforeArrival('admin')).toBe(true)
    expect(canSeeCustomsBeforeArrival('logistica')).toBe(true)
    for (const role of ['user', 'compras', 'viewer', '', undefined, null, 'ADMIN']) {
      expect(canSeeCustomsBeforeArrival(role)).toBe(false)
    }
  })

  it('isCustomsVisibleTo: restrito so apos atracacao/chegada', () => {
    expect(isCustomsVisibleTo(underWaterFcl(), 'user')).toBe(false)
    expect(isCustomsVisibleTo(underWaterFcl({ berthedAt: '2026-09-19T08:00' }), 'user')).toBe(true)
    expect(isCustomsVisibleTo(underWaterFcl(), 'admin')).toBe(true)
  })
})

describe('projectProcessForViewer - FCL sob aguas (D-3)', () => {
  it('user: status da viagem, 9 campos vazios e nada de DUIMP na UI derivada', () => {
    const process = underWaterFcl()
    const projected = projectProcessForViewer(process, 'user', TODAY)

    expect(projected).not.toBe(process)
    expect(projected.processStatus).toBe('Embarcou')
    expect(pickCustoms(projected)).toEqual(EMPTY_CUSTOMS_CLEARANCE_FIELDS)
    expect(hasCustomsDetails(projected)).toBe(false)
    expect(getProcessStage(projected).currentStage).toBe(1)
    expect(getProcessDerivedStatus(projected, TODAY).phase).not.toBe(DERIVED_STATUS_PHASES.NO_PORTO)
    // o original nao e mutado
    expect(process.duimpNumber).toBe('DU-123')
  })

  it('compras e viewer tambem sao restritos', () => {
    for (const role of ['compras', 'viewer', undefined]) {
      expect(projectProcessForViewer(underWaterFcl(), role, TODAY).processStatus).toBe('Embarcou')
    }
  })

  it('admin e logistica recebem o MESMO objeto (badge mostra a DUIMP)', () => {
    const process = underWaterFcl()
    expect(projectProcessForViewer(process, 'admin', TODAY)).toBe(process)
    expect(projectProcessForViewer(process, 'logistica', TODAY)).toBe(process)
    expect(getVisibleProcessStatus(process, 'admin', TODAY)).toBe('Aguardando parametrização da DUIMP')
    expect(getVisibleProcessStatus(process, 'user', TODAY)).toBe('Embarcou')
  })

  it('admin: timeline em Transito e fase derivada Embarcado (D-5)', () => {
    const process = underWaterFcl()
    expect(isDuimpUnderWater(process)).toBe(true)
    expect(getProcessStage(process).currentStage).toBe(1)
    expect(getProcessDerivedStatus(process, TODAY).phase).toBe(DERIVED_STATUS_PHASES.EMBARCADO)
  })

  it('parametrizada Verde com ETA vencida -> user ve "Aguardando atracação"', () => {
    const process = underWaterFcl({
      eta: '2026-09-10',
      parameterizedAt: '2026-09-19T10:00',
      parameterizationChannel: 'Verde',
      duimpStatus: 'Parametrizada',
      processStatus: 'Aguardando desembaraço',
    })
    expect(projectProcessForViewer(process, 'user', TODAY).processStatus).toBe('Aguardando atracação')
    expect(getVoyageStatus(process, TODAY)).toBe('Aguardando atracação')
  })
})

// DUIMP so' com embarque confirmado: defesa em profundidade para dado antigo
// (DUIMP registrada com `shippedAt` vazio nunca pode virar "Embarcou").
describe('DUIMP antes do embarque (shippedAt vazio)', () => {
  const unshipped = (category, extra = {}) =>
    underWaterFcl({
      category,
      shippedAt: '',
      processStatus: 'Aguardando parametrização da DUIMP',
      ...extra,
    })

  it.each(['FCL', 'AEREO'])('%s: user ve "Aguardando Embarque" (nunca "Embarcou") e mirror concorda', (category) => {
    for (const status of [
      'Aguardando registro da DUIMP',
      'Aguardando parametrização da DUIMP',
      'Aguardando desembaraço',
    ]) {
      const process = unshipped(category, { processStatus: status })
      expect(getVoyageStatus(process, TODAY)).toBe('Aguardando Embarque')
      expect(projectProcessForViewer(process, 'user', TODAY).processStatus).toBe('Aguardando Embarque')
      expect(getVoyageStatusMirror(process, TODAY_KEY)).toBe('Aguardando Embarque')
      expect(projectProcessForRestrictedRecipientMirror(process, TODAY_KEY).processStatus).toBe(
        'Aguardando Embarque'
      )
    }
  })

  it('admin: o KPI emTransito nao conta o processo sem embarque', () => {
    expect(getDashboardKpis([unshipped('FCL')], TODAY).emTransito).toBe(0)
  })

  it('legado pos-embarque nao-DUIMP sem shippedAt segue contando como embarcado', () => {
    const legacy = unshipped('FCL', {
      duimpRegisteredAt: '',
      duimpNumber: '',
      duimpStatus: '',
      processStatus: 'Atracação Confirmada',
    })
    expect(getVoyageStatus(legacy, TODAY)).toBe('Embarcou')
    expect(getVoyageStatusMirror(legacy, TODAY_KEY)).toBe('Embarcou')
  })

  // Legado "Embarcou" sem shippedAt: a DUIMP e' zerada no save, o status
  // gravado fica "Embarcou" e o restrito continua vendo "Embarcou".
  it('legado "Embarcou" sem shippedAt (DUIMP ja zerada): user continua vendo "Embarcou"', () => {
    const legacy = {
      id: 'p-leg',
      category: 'FCL',
      shippedAt: '',
      eta: '2099-01-15',
      processStatus: 'Embarcou',
    }
    expect(projectProcessForViewer(legacy, 'user', TODAY)).toBe(legacy)
    expect(getVoyageStatus(legacy, TODAY)).toBe('Embarcou')
    expect(getVoyageStatusMirror(legacy, TODAY_KEY)).toBe('Embarcou')
  })

  it('com shippedAt o status de DUIMP segue gerando a viagem normal', () => {
    expect(getVoyageStatus(underWaterFcl(), TODAY)).toBe('Embarcou')
  })
})

describe('projectProcessForViewer - atracado / chegado / sem DUIMP', () => {
  it('com berthedAt devolve o mesmo objeto para o user', () => {
    const process = underWaterFcl({ berthedAt: '2026-09-19T08:00' })
    expect(projectProcessForViewer(process, 'user', TODAY)).toBe(process)
  })

  it('AEREO com arrivedAt -> mesmo objeto; sem arrivedAt -> restrito', () => {
    const arrived = underWaterFcl({ category: 'AEREO', arrivedAt: '2026-09-19T08:00' })
    expect(projectProcessForViewer(arrived, 'user', TODAY)).toBe(arrived)

    const notArrived = underWaterFcl({ category: 'AEREO' })
    const projected = projectProcessForViewer(notArrived, 'user', TODAY)
    expect(projected.processStatus).toBe('Embarcou')
    expect(pickCustoms(projected)).toEqual(EMPTY_CUSTOMS_CLEARANCE_FIELDS)
  })

  it('processo sem DUIMP antes da atracacao -> mesmo objeto (nao-regressao)', () => {
    for (const status of PRE_ARRIVAL_STATUSES) {
      const process = { id: 'p2', category: 'FCL', shippedAt: '2026-09-01', processStatus: status }
      expect(projectProcessForViewer(process, 'user', TODAY)).toBe(process)
      expect(getVoyageStatus(process, TODAY)).toBe(status)
    }
  })

  it('projectProcessesForViewer: array seguro, identidade para admin', () => {
    const list = [underWaterFcl()]
    expect(projectProcessesForViewer(null, 'user')).toEqual([])
    expect(projectProcessesForViewer(undefined, 'admin')).toEqual([])
    expect(projectProcessesForViewer(list, 'admin')).toBe(list)
    expect(projectProcessesForViewer(list, 'user', TODAY)[0].processStatus).toBe('Embarcou')
  })
})

describe('superficies que leem a projecao do user', () => {
  it('export: nenhuma das 2 colunas de status cita a DUIMP', () => {
    const projected = projectProcessesForViewer([underWaterFcl()], 'user', TODAY)
    const [row] = buildProcessesExportRows(projected, TODAY)
    expect(row['Status do processo']).toBe('Embarcou')
    expect(`${row['Status do processo']} ${row['Status derivado']}`).not.toMatch(/duimp|desembara/i)
  })

  it('KPIs: canalVermelho 0 para o user e 1 para o admin com canal Vermelho sob aguas', () => {
    const process = underWaterFcl({
      parameterizedAt: '2026-09-19T10:00',
      parameterizationChannel: 'Vermelho',
      duimpStatus: 'Parametrizada',
    })
    expect(getDashboardKpis(projectProcessesForViewer([process], 'user', TODAY), TODAY).canalVermelho).toBe(0)
    expect(getDashboardKpis(projectProcessesForViewer([process], 'admin', TODAY), TODAY).canalVermelho).toBe(1)
  })
})

describe('paridade functions/ x src/ (D-6)', () => {
  it('listas espelhadas sao identicas', () => {
    expect({ ...EMPTY_CUSTOMS_CLEARANCE_FIELDS_MIRROR }).toEqual({ ...EMPTY_CUSTOMS_CLEARANCE_FIELDS })
    expect([...PRE_ARRIVAL_STATUSES_MIRROR]).toEqual([...PRE_ARRIVAL_STATUSES])
    expect([...PROCESS_STATUS_OPTIONS_MIRROR]).toEqual([...processStatusOptions])
  })

  it('canSeeCustomsBeforeArrivalMirror === canSeeCustomsBeforeArrival', () => {
    for (const role of ['admin', 'logistica', 'user', 'compras', 'viewer', '', undefined, null]) {
      expect(canSeeCustomsBeforeArrivalMirror(role)).toBe(canSeeCustomsBeforeArrival(role))
    }
  })

  it('projecao do user x projecao do destinatario restrito (status + 9 campos)', () => {
    const categories = ['FCL', 'AEREO']
    const arrivals = [false, true]
    const statuses = [...processStatusOptions, '', 'lixo-invalido']
    const shippedValues = ['', '2026-09-01']
    const etaValues = ['', '2026-09-10', '2026-09-20', '2026-10-15']
    const customsVariants = [
      { ...EMPTY_CUSTOMS_CLEARANCE_FIELDS },
      {
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Verde',
        clearanceCompletedAt: '',
        duimpNumber: 'DU-1',
        duimpRegisteredAt: '2026-09-18T09:00',
        parameterizedAt: '2026-09-19T10:00',
        customsInspectionScheduledAt: '',
        customsRequirement: false,
        customsRequirementNotes: '',
      },
    ]

    let compared = 0
    for (const category of categories) {
      for (const arrival of arrivals) {
        for (const processStatus of statuses) {
          for (const shippedAt of shippedValues) {
            for (const eta of etaValues) {
              for (const customs of customsVariants) {
                const process = {
                  id: 'px',
                  category,
                  processStatus,
                  shippedAt,
                  eta,
                  ...(arrival ? (category === 'AEREO' ? { arrivedAt: '2026-09-19T08:00' } : { berthedAt: '2026-09-19T08:00' }) : {}),
                  ...customs,
                }
                const label = JSON.stringify({ category, arrival, processStatus, shippedAt, eta, customs: customs.duimpNumber })
                const front = projectProcessForViewer(process, 'user', TODAY)
                const mirror = projectProcessForRestrictedRecipientMirror(process, TODAY_KEY)

                expect(mirror.processStatus, label).toBe(front.processStatus)
                expect(pickCustoms(mirror), label).toEqual(pickCustoms(front))
                expect(getVoyageStatusMirror(process, TODAY_KEY), label).toBe(getVoyageStatus(process, TODAY))
                compared += 1
              }
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(500)
  })

  it('mirror com chegada devolve o mesmo objeto', () => {
    const process = underWaterFcl({ berthedAt: '2026-09-19T08:00' })
    expect(projectProcessForRestrictedRecipientMirror(process, TODAY_KEY)).toBe(process)
  })
})
