// F17.1b: cobertura da tabela D-4 (PLAN.md) + paridade com src/ (D-4/D-6).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  MILESTONE_RULES,
  buildMilestoneEvents,
  buildEventDocId,
  toIsoOccurredAt,
  isCustomsClearedMirror,
  isMapaReleasedMirror,
} from '../../functions/src/process/milestones.js'
import { isCustomsCleared } from '../../src/features/processes/deriveProcessStatus.js'
import { mapaAllowsCollectionStatus } from '../../src/features/processes/processStatus.js'

function baseMaritime(overrides = {}) {
  return { category: 'FCL', updatedById: 'u-1', updatedByName: 'Ana', ...overrides }
}

function baseAir(overrides = {}) {
  return { category: 'AEREO', updatedById: 'u-1', updatedByName: 'Ana', ...overrides }
}

function eventsOfType(events, type) {
  return events.filter((event) => event.data.type === type)
}

describe('buildMilestoneEvents - shipped (F17.2a D-9)', () => {
  it("'' -> '2026-09-20' gera shipped com occurredAt 03:00:00.000Z e occurredAtSource 'field'", () => {
    const before = baseMaritime({ shippedAt: '' })
    const after = baseMaritime({ shippedAt: '2026-09-20' })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'shipped')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe('2026-09-20')
    expect(events[0].data.previousValue).toBe('')
    expect(events[0].data.occurredAt).toBe('2026-09-20T03:00:00.000Z')
    expect(events[0].data.occurredAtSource).toBe('field')
  })

  it('data ja preenchida alterada NAO gera evento novo', () => {
    const before = baseMaritime({ shippedAt: '2026-09-01' })
    const after = baseMaritime({ shippedAt: '2026-09-20' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'shipped')).toHaveLength(0)
  })

  it('sem shippedAt (legado) NAO gera evento', () => {
    const before = baseMaritime({})
    const after = baseMaritime({})
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'shipped')).toHaveLength(0)
  })

  it('save com shippedAt + mudanca de status gera shipped E statusChanged', () => {
    const before = baseMaritime({ shippedAt: '', processStatus: 'Aguardando Embarque' })
    const after = baseMaritime({ shippedAt: '2026-09-20', processStatus: 'Embarcou' })
    const events = buildMilestoneEvents(before, after, { processId: 'p1' })
    expect(eventsOfType(events, 'shipped')).toHaveLength(1)
    expect(eventsOfType(events, 'statusChanged')).toHaveLength(1)
  })
})

describe('buildMilestoneEvents - tabela D-4', () => {
  it('berthed: transicao false->true em categoria maritima gera evento', () => {
    const before = baseMaritime({ berthed: false })
    const after = baseMaritime({ berthed: true })
    const events = buildMilestoneEvents(before, after, { processId: 'p1' })
    const berthedEvents = eventsOfType(events, 'berthed')
    expect(berthedEvents).toHaveLength(1)
    expect(berthedEvents[0].data.value).toBe(true)
    expect(berthedEvents[0].data.previousValue).toBe(false)
  })

  it('berthed: ja true no before NAO gera evento', () => {
    const before = baseMaritime({ berthed: true })
    const after = baseMaritime({ berthed: true })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'berthed')).toHaveLength(0)
  })

  it('berthed: true em processo AEREO NAO gera berthed', () => {
    const before = baseAir({ berthed: false })
    const after = baseAir({ berthed: true })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'berthed')).toHaveLength(0)
  })

  it('arrived: transicao false->true em categoria aerea gera evento', () => {
    const before = baseAir({ arrived: false })
    const after = baseAir({ arrived: true })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'arrived')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe(true)
  })

  it('arrived: ja true no before NAO gera evento', () => {
    const before = baseAir({ arrived: true })
    const after = baseAir({ arrived: true })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'arrived')).toHaveLength(0)
  })

  it('arrived: true em FCL NAO gera arrived', () => {
    const before = baseMaritime({ arrived: false })
    const after = baseMaritime({ arrived: true })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'arrived')).toHaveLength(0)
  })

  it('cargoPresence: transicao false->true gera evento', () => {
    const before = baseMaritime({ cargoPresenceInformed: false })
    const after = baseMaritime({ cargoPresenceInformed: true })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'cargoPresence')).toHaveLength(1)
  })

  it('cargoPresence: ja true no before NAO gera evento', () => {
    const before = baseMaritime({ cargoPresenceInformed: true })
    const after = baseMaritime({ cargoPresenceInformed: true })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'cargoPresence')).toHaveLength(0)
  })

  it('duimpRegistered: transicao para status registrado/parametrizado gera evento', () => {
    const before = baseMaritime({ duimpStatus: '' })
    const after = baseMaritime({ duimpStatus: 'Aguardando parametrização da DUIMP' })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'duimpRegistered')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe('Aguardando parametrização da DUIMP')
    expect(events[0].data.previousValue).toBe('')
  })

  it('duimpRegistered: ja registrado no before NAO gera evento', () => {
    const before = baseMaritime({ duimpStatus: 'Aguardando parametrização da DUIMP' })
    const after = baseMaritime({ duimpStatus: 'Parametrizada' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'duimpRegistered')).toHaveLength(0)
  })

  it('duimpStatus "" -> Parametrizada com canal Amarelo gera duimpRegistered E parameterized', () => {
    const before = baseMaritime({ duimpStatus: '', parameterizationChannel: '' })
    const after = baseMaritime({ duimpStatus: 'Parametrizada', parameterizationChannel: 'Amarelo' })
    const events = buildMilestoneEvents(before, after, { processId: 'p1' })
    expect(eventsOfType(events, 'duimpRegistered')).toHaveLength(1)
    const parameterizedEvents = eventsOfType(events, 'parameterized')
    expect(parameterizedEvents).toHaveLength(1)
    expect(parameterizedEvents[0].data.value).toBe('Amarelo')
  })

  it('Parametrizada sem canal NAO gera parameterized', () => {
    const before = baseMaritime({ duimpStatus: '', parameterizationChannel: '' })
    const after = baseMaritime({ duimpStatus: 'Parametrizada', parameterizationChannel: '' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'parameterized')).toHaveLength(0)
  })

  it('canal preenchido depois (duimp ja parametrizada) gera parameterized', () => {
    const before = baseMaritime({ duimpStatus: 'Parametrizada', parameterizationChannel: '' })
    const after = baseMaritime({ duimpStatus: 'Parametrizada', parameterizationChannel: 'Verde' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'parameterized')).toHaveLength(1)
  })

  it('cleared: Amarelo + clearanceCompletedAt preenchido usa o campo como occurredAt (field)', () => {
    const before = baseMaritime({ duimpStatus: 'Parametrizada', parameterizationChannel: 'Amarelo', clearanceCompletedAt: '' })
    const after = baseMaritime({
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Amarelo',
      clearanceCompletedAt: '2026-09-20T14:30',
    })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'cleared')
    expect(events).toHaveLength(1)
    expect(events[0].data.occurredAt).toBe('2026-09-20T17:30:00.000Z')
    expect(events[0].data.occurredAtSource).toBe('field')
  })

  it('cleared: Verde recem-parametrizado sem clearanceCompletedAt usa updatedAt e value Canal Verde', () => {
    const before = baseMaritime({ duimpStatus: '', parameterizationChannel: '' })
    const after = baseMaritime({
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      updatedAt: '2026-09-20T12:00:00.000Z',
    })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'cleared')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe('Canal Verde')
    expect(events[0].data.occurredAtSource).toBe('updatedAt')
  })

  it('cleared: editar a data de um processo ja desembaracado NAO gera novo cleared', () => {
    const before = baseMaritime({ clearanceCompletedAt: '2026-09-01T10:00' })
    const after = baseMaritime({ clearanceCompletedAt: '2026-09-02T10:00' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'cleared')).toHaveLength(0)
  })

  it('licenseDeferred: "" -> Liberado gera evento', () => {
    const before = baseMaritime({ mapaStatus: '' })
    const after = baseMaritime({ mapaStatus: 'Liberado' })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'licenseDeferred')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe('MAPA')
  })

  it('licenseDeferred: Aguardando MAPA -> LPCO deferida, MAPA liberado gera evento', () => {
    const before = baseMaritime({ mapaStatus: 'Aguardando MAPA' })
    const after = baseMaritime({ mapaStatus: 'LPCO deferida, MAPA liberado' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'licenseDeferred')).toHaveLength(1)
  })

  it('licenseDeferred: Liberado -> "" NAO gera', () => {
    const before = baseMaritime({ mapaStatus: 'Liberado' })
    const after = baseMaritime({ mapaStatus: '' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'licenseDeferred')).toHaveLength(0)
  })

  it('licenseDeferred: "" -> "" NAO gera', () => {
    const before = baseMaritime({ mapaStatus: '' })
    const after = baseMaritime({ mapaStatus: '' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'licenseDeferred')).toHaveLength(0)
  })

  it('collectionScheduled: value vem de collectionWindows[0].scheduledAt', () => {
    const before = baseMaritime({ collectionStatus: 'Aguardando agendamento de coleta' })
    const after = baseMaritime({
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ scheduledAt: '2026-09-25T09:00:00.000Z' }],
    })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'collectionScheduled')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe('2026-09-25T09:00:00.000Z')
  })

  it('collectionScheduled: processo so com collectionScheduledAt legado usa o legado (dual schema)', () => {
    const before = baseMaritime({ collectionStatus: 'Aguardando agendamento de coleta' })
    const after = baseMaritime({
      collectionStatus: 'Coleta Agendada',
      collectionScheduledAt: '2026-09-25T09:00',
    })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'collectionScheduled')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe('2026-09-25T09:00')
  })

  it('collectionScheduled: Coleta Agendada -> Carga a caminho do CD NAO gera', () => {
    const before = baseMaritime({ collectionStatus: 'Coleta Agendada' })
    const after = baseMaritime({ collectionStatus: 'Carga a caminho do CD' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'collectionScheduled')).toHaveLength(0)
  })

  it('received: occurredAt = cargoReceivedAt', () => {
    const before = baseMaritime({ processStatus: 'Coleta Agendada' })
    const after = baseMaritime({ processStatus: 'Carga recebida', cargoReceivedAt: '2026-09-21T08:00:00.000Z' })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'received')
    expect(events).toHaveLength(1)
    expect(events[0].data.occurredAt).toBe('2026-09-21T08:00:00.000Z')
    expect(events[0].data.occurredAtSource).toBe('field')
  })

  it('statusChanged: gera com previousValue', () => {
    const before = baseMaritime({ processStatus: 'Embarcou' })
    const after = baseMaritime({ processStatus: 'Aguardando atracação' })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'statusChanged')
    expect(events).toHaveLength(1)
    expect(events[0].data.value).toBe('Aguardando atracação')
    expect(events[0].data.previousValue).toBe('Embarcou')
  })

  it('statusChanged: processStatus igual (so espacos) NAO gera', () => {
    const before = baseMaritime({ processStatus: 'Embarcou' })
    const after = baseMaritime({ processStatus: ' Embarcou ' })
    expect(eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'statusChanged')).toHaveLength(0)
  })

  it('mudanca cosmetica (processNotes, eta) nao gera nenhum evento', () => {
    const before = baseMaritime({ processNotes: 'a', eta: '2026-09-01' })
    const after = baseMaritime({ processNotes: 'b', eta: '2026-09-02' })
    expect(buildMilestoneEvents(before, after, { processId: 'p1' })).toEqual([])
  })

  it('occurredAt com updatedAt Timestamp fake', () => {
    const before = baseMaritime({ processStatus: 'Embarcou' })
    const after = baseMaritime({
      processStatus: 'Aguardando atracação',
      updatedAt: { toDate: () => new Date('2026-09-20T10:00:00.000Z') },
    })
    const events = eventsOfType(buildMilestoneEvents(before, after, { processId: 'p1' }), 'statusChanged')
    expect(events[0].data.occurredAt).toBe('2026-09-20T10:00:00.000Z')
    expect(events[0].data.occurredAtSource).toBe('updatedAt')
  })

  it('sem updatedAt cai no eventTime', () => {
    const before = baseMaritime({ processStatus: 'Embarcou' })
    const after = baseMaritime({ processStatus: 'Aguardando atracação' })
    delete after.updatedAt
    const events = eventsOfType(
      buildMilestoneEvents(before, after, { processId: 'p1', eventTime: '2026-09-20T11:00:00.000Z' }),
      'statusChanged'
    )
    expect(events[0].data.occurredAt).toBe('2026-09-20T11:00:00.000Z')
    expect(events[0].data.occurredAtSource).toBe('eventTime')
  })

  it('tudo ausente cai em ISO valido (Date.now)', () => {
    const result = toIsoOccurredAt({})
    expect(Number.isNaN(new Date(result.occurredAt).getTime())).toBe(false)
    expect(result.occurredAtSource).toBe('eventTime')
  })

  it('nenhum campo undefined em nenhum data gerado', () => {
    const before = baseMaritime({ berthed: false, processStatus: 'Embarcou' })
    const after = baseMaritime({ berthed: true, processStatus: 'Atracação Confirmada' })
    const events = buildMilestoneEvents(before, after, { processId: 'p1' })
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      for (const value of Object.values(event.data)) {
        expect(value).not.toBeUndefined()
      }
    }
  })

  describe('buildEventDocId', () => {
    it('mesmo input -> mesmo id (idempotencia)', () => {
      const id1 = buildEventDocId('evt-123', 'berthed', 'p1', null)
      const id2 = buildEventDocId('evt-123', 'berthed', 'p1', null)
      expect(id1).toBe(id2)
    })

    it('event.id com caracteres especiais sai sanitizado', () => {
      const id = buildEventDocId('evt/123 abc', 'berthed', 'p1', null)
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('sem eventId usa o fallback deterministico', () => {
      const id1 = buildEventDocId('', 'berthed', 'p1', '2026-09-20T10:00:00.000Z')
      const id2 = buildEventDocId('', 'berthed', 'p1', '2026-09-20T10:00:00.000Z')
      expect(id1).toBe(id2)
      expect(id1).toMatch(/^p1_/)
    })
  })

  describe('MILESTONE_RULES - estrutura extensivel (D-5)', () => {
    it('e um array de { type, field, detect }', () => {
      expect(Array.isArray(MILESTONE_RULES)).toBe(true)
      for (const rule of MILESTONE_RULES) {
        expect(typeof rule.type).toBe('string')
        expect(typeof rule.field).toBe('string')
        expect(typeof rule.detect).toBe('function')
      }
    })
  })
})

describe('paridade functions/ x src/ (D-4 nota)', () => {
  const duimpValues = ['', 'Aguardando registro da DUIMP', 'Aguardando parametrização da DUIMP', 'Parametrizada']
  const channelValues = ['', 'Verde', 'Amarelo', 'Vermelho', 'Cinza']
  const clearanceValues = ['', '2026-09-20T10:00']

  it('isCustomsClearedMirror === isCustomsCleared para toda a matriz', () => {
    for (const duimpStatus of duimpValues) {
      for (const parameterizationChannel of channelValues) {
        for (const clearanceCompletedAt of clearanceValues) {
          const process = { duimpStatus, parameterizationChannel, clearanceCompletedAt }
          expect(isCustomsClearedMirror(process)).toBe(isCustomsCleared(process))
        }
      }
    }
  })

  // Lista literal de src/services/processesRepository.js:56-63 (copiada aqui
  // para nao importar o repositorio, que puxa firebase - D-4 nota final).
  const mapaStatusOptions = [
    'Aguardando MAPA',
    'Liberado',
    'Selecionado para Vistoria',
    'Vistoria agendada, aguardando realização',
    'Vistoria realizada, aguardando deferimento da LPCO',
    'LPCO deferida, MAPA liberado',
  ]

  it('isMapaReleasedMirror === mapaAllowsCollectionStatus para cada valor de mapaStatusOptions (+ vazio)', () => {
    for (const status of [...mapaStatusOptions, '']) {
      // NOTA: isMapaReleasedMirror(D-4) e' SEM o "vazio libera" de
      // mapaAllowsCollectionStatus (usado so' para o gate de coleta, nao
      // para o marco de historico). Comparamos so' os valores NAO vazios -
      // vazio e' coberto pelo teste dedicado de licenseDeferred acima.
      if (status === '') {
        expect(mapaAllowsCollectionStatus(status)).toBe(true)
        expect(isMapaReleasedMirror(status)).toBe(false)
        continue
      }
      expect(isMapaReleasedMirror(status)).toBe(mapaAllowsCollectionStatus(status))
    }
  })
})
