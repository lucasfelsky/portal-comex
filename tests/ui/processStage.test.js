// Tests do util da timeline de estágios (F16.5).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getProcessStage, PROCESS_STAGES } from '../../src/features/processes/processStage.js'

describe('getProcessStage', () => {
  it('tem 5 estágios na ordem do protótipo', () => {
    expect(PROCESS_STAGES).toEqual([
      'Embarque',
      'Trânsito',
      'Chegada',
      'Liberação',
      'Entrega',
    ])
  })

  it.each([
    ['Aguardando Embarque', 0],
    ['Embarcou', 1],
    ['Aguardando atracação', 1],
    ['Atracação Confirmada', 2],
    ['Aguardando registro da DUIMP', 3],
    ['Aguardando parametrização da DUIMP', 3],
    ['Aguardando agendamento de coleta', 4],
    ['Coleta Agendada', 4],
    ['Carga recebida', 4],
  ])('%s → estágio %i', (processStatus, expected) => {
    expect(getProcessStage({ processStatus }).currentStage).toBe(expected)
  })

  it('isComplete só quando carga recebida', () => {
    expect(getProcessStage({ processStatus: 'Carga recebida' }).isComplete).toBe(true)
    expect(getProcessStage({ processStatus: 'Coleta Agendada' }).isComplete).toBe(false)
    expect(getProcessStage({ processStatus: 'Aguardando Embarque' }).isComplete).toBe(false)
  })

  it('status desconhecido ou vazio cai no estágio 0 sem quebrar', () => {
    expect(getProcessStage({ processStatus: 'xyz' }).currentStage).toBe(0)
    expect(getProcessStage({}).currentStage).toBe(0)
    expect(getProcessStage(null).currentStage).toBe(0)
  })

  it('normaliza variações (minúsculas/sem acento) via canonicalize', () => {
    expect(getProcessStage({ processStatus: 'aguardando embarque' }).currentStage).toBe(0)
    expect(getProcessStage({ processStatus: 'carga recebida' }).isComplete).toBe(true)
  })
})
