// Specs unitarios de getUnscheduledItemLabel (PR #6 + PR #11).
// Função pura que decide a label do card "Previsao de entrega
// no armazem" no WeeklyArrivalsCard, baseada no `process`.
//
// PR #11 (2026-07-09): adicionados specs pra casos onde
// `collectionStatus` esta' desatualizado (ex: ainda "Coleta
// Agendada") mas `collectionWindows` ja' passou. Esses casos
// sao inconsistentes (badge diz "Carga a caminho do CD" mas
// notes dizia "Coleta ainda nao agendada"). A funcao agora
// olha tambem `collectionWindows` pra alinhar badge <-> notes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getUnscheduledItemLabel } from '../../src/features/processes/processStatus'

const fixedNow = new Date('2026-07-09T10:00:00-03:00').getTime()
const beforeFixedNow = '2026-07-08T10:00:00-03:00' // quarta passada
const afterFixedNow = '2026-07-10T10:00:00-03:00'  // sexta (amanha)
const realDateNow = Date.now

beforeAll(() => {
  Date.now = () => fixedNow
})

afterAll(() => {
  Date.now = realDateNow
})

describe('getUnscheduledItemLabel', () => {
  it('em rota direto: retorna "Carga em trânsito para o CD"', () => {
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Carga a caminho do CD' })
    ).toBe('Carga em trânsito para o CD')
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Veiculo no CD para descarga' })
    ).toBe('Carga em trânsito para o CD')
  })

  it('em processamento no CD: retorna "Carga em processamento no CD"', () => {
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Carga em Conferencia/Etiquetagem' })
    ).toBe('Carga em processamento no CD')
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Carga em processo de Entrada' })
    ).toBe('Carga em processamento no CD')
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Carga sendo descarregada no CD' })
    ).toBe('Carga em processamento no CD')
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Carga recebida' })
    ).toBe('Carga em processamento no CD')
  })

  it('pre-coleta sem janela: retorna "Coleta ainda não agendada"', () => {
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Aguardando agendamento de coleta' })
    ).toBe('Coleta ainda não agendada')
  })

  it('coleta agendada com janela no futuro: retorna "Coleta ainda não agendada"', () => {
    expect(
      getUnscheduledItemLabel({
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ scheduledAt: afterFixedNow }],
      })
    ).toBe('Coleta ainda não agendada')
  })

  // PR #11: caso reportado pelo Lucas em 2026-07-09.
  // collectionStatus desatualizado = "Coleta Agendada"
  // collectionWindows passada = "2026-07-08T10:00:00-03:00"
  // Antes do PR #11 retornava "Coleta ainda nao agendada"
  // (inconsistente com badge "Carga a caminho do CD").
  // Apos PR #11 retorna "Carga em transito para o CD"
  // (alinhado com badge).
  it('PR #11: collectionStatus desatualizado + janela passada -> alinhado com badge', () => {
    expect(
      getUnscheduledItemLabel({
        collectionStatus: 'Coleta Agendada',
        processStatus: 'Coleta Agendada',
        collectionWindows: [{ scheduledAt: beforeFixedNow }],
      })
    ).toBe('Carga em trânsito para o CD')
  })

  it('PR #11: process sem collectionWindows -> usa apenas collectionStatus', () => {
    expect(
      getUnscheduledItemLabel({ collectionStatus: 'Coleta Agendada' })
    ).toBe('Coleta ainda não agendada')
  })

  it('PR #11: collectionWindows com scheduledAt invalido -> ignora', () => {
    expect(
      getUnscheduledItemLabel({
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [
          { scheduledAt: 'invalido' },
          { scheduledAt: undefined },
        ],
      })
    ).toBe('Coleta ainda não agendada')
  })

  it('PR #11: collectionWindows vazio -> usa apenas collectionStatus', () => {
    expect(
      getUnscheduledItemLabel({
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [],
      })
    ).toBe('Coleta ainda não agendada')
  })

  it('PR #11: collectionWindows nao-array -> ignora', () => {
    expect(
      getUnscheduledItemLabel({
        collectionStatus: 'Coleta Agendada',
        collectionWindows: 'foo',
      })
    ).toBe('Coleta ainda não agendada')
  })

  it('PR #11: collectionWindows com multipla janela, uma passada -> "Carga em transito"', () => {
    expect(
      getUnscheduledItemLabel({
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [
          { scheduledAt: beforeFixedNow }, // passada
          { scheduledAt: afterFixedNow },  // futura
        ],
      })
    ).toBe('Carga em trânsito para o CD')
  })

  it('collectionStatus vazio: retorna "" (fallback defensivo)', () => {
    expect(getUnscheduledItemLabel({ collectionStatus: '' })).toBe('')
  })

  it('collectionStatus null: retorna "" (fallback defensivo)', () => {
    expect(getUnscheduledItemLabel({ collectionStatus: null })).toBe('')
  })

  it('process null: retorna "" (fallback defensivo)', () => {
    expect(getUnscheduledItemLabel(null)).toBe('')
  })

  it('process undefined: retorna "" (fallback defensivo)', () => {
    expect(getUnscheduledItemLabel(undefined)).toBe('')
  })
})
