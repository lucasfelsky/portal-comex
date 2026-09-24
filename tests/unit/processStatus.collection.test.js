// F17.0 (bugfixes de processos): testes puros dos helpers dos bugs 3, 5, 6.
import { describe, expect, it } from 'vitest'
import {
  canonicalizeCollectionStatus,
  mapaAllowsCollectionStatus,
  shouldPreserveStockCollectionStatus,
  isPostCollectionStatus,
  isCdUnloadingOrReceivedStatus,
  isCollectionScheduleRetainingStatus,
  isLogisticaEditableCollectionStatus,
  getDisplayedCollectionStatus,
} from '../../src/features/processes/processStatus'
import {
  canonicalizeCollectionStatusMirror,
  getDisplayedCollectionStatusMirror,
  hasCollectionStatusChangedMirror,
} from '../../functions/src/core/collectionStatus.js'

describe('mapaAllowsCollectionStatus', () => {
  it('vazio/whitespace/undefined liberam a coleta (maritimo sem anuencia MAPA)', () => {
    expect(mapaAllowsCollectionStatus('')).toBe(true)
    expect(mapaAllowsCollectionStatus('  ')).toBe(true)
    expect(mapaAllowsCollectionStatus(undefined)).toBe(true)
  })

  it('Liberado e LPCO deferida continuam liberando', () => {
    expect(mapaAllowsCollectionStatus('Liberado')).toBe(true)
    expect(mapaAllowsCollectionStatus('LPCO deferida, MAPA liberado')).toBe(true)
  })

  it('qualquer outro valor preenchido continua travando', () => {
    expect(mapaAllowsCollectionStatus('Aguardando MAPA')).toBe(false)
    expect(mapaAllowsCollectionStatus('Selecionado para Vistoria')).toBe(false)
  })
})

describe('canonicalizeCollectionStatus', () => {
  it('legado "Aguardando agendamento" (com/sem caixa) vira o canonico', () => {
    expect(canonicalizeCollectionStatus('Aguardando agendamento')).toBe(
      'Aguardando agendamento de coleta'
    )
    expect(canonicalizeCollectionStatus('aguardando AGENDAMENTO')).toBe(
      'Aguardando agendamento de coleta'
    )
  })

  it('outros valores permanecem inalterados', () => {
    expect(canonicalizeCollectionStatus('Coleta Agendada')).toBe('Coleta Agendada')
    expect(canonicalizeCollectionStatus('')).toBe('')
  })

  // F17.4a (A5/D-1): alias dos 2 valores legados fundidos em 'Carga
  // recebida, em conferência'.
  it('legado "Carga recebida" e "Carga em Conferência/Etiquetagem" (com/sem acento) viram o valor fundido', () => {
    expect(canonicalizeCollectionStatus('Carga recebida')).toBe('Carga recebida, em conferência')
    expect(canonicalizeCollectionStatus('carga recebida')).toBe('Carga recebida, em conferência')
    expect(canonicalizeCollectionStatus('Carga em Conferência/Etiquetagem')).toBe(
      'Carga recebida, em conferência'
    )
    expect(canonicalizeCollectionStatus('Carga em Conferencia/Etiquetagem')).toBe(
      'Carga recebida, em conferência'
    )
    expect(canonicalizeCollectionStatus('Carga recebida, em conferência')).toBe(
      'Carga recebida, em conferência'
    )
  })
})

// F17.4a (D-1): cada predicado precisa reconhecer o valor novo E os 2
// legados - alias parcial = regressao silenciosa (ver Riscos do PLAN).
describe('F17.4a - predicados de collectionStatus com o valor novo + legados', () => {
  const VALUES = ['Carga recebida, em conferência', 'Carga recebida', 'Carga em Conferência/Etiquetagem']

  it('isPostCollectionStatus reconhece o novo e os 2 legados', () => {
    VALUES.forEach((value) => expect(isPostCollectionStatus(value)).toBe(true))
  })

  it('isCdUnloadingOrReceivedStatus reconhece o novo e os 2 legados', () => {
    VALUES.forEach((value) => expect(isCdUnloadingOrReceivedStatus(value)).toBe(true))
  })

  it('isCdUnloadingOrReceivedStatus continua true pra "Carga recebida" vindo de processStatus', () => {
    // shouldHideProcessCardSchedule passa process.processStatus (nao
    // collectionStatus) - 'Carga recebida' TEM que continuar true.
    expect(isCdUnloadingOrReceivedStatus('Carga recebida')).toBe(true)
  })

  it('isCollectionScheduleRetainingStatus reconhece o novo e os 2 legados', () => {
    VALUES.forEach((value) => expect(isCollectionScheduleRetainingStatus(value)).toBe(true))
  })

  it('isLogisticaEditableCollectionStatus reconhece o novo e os 2 legados', () => {
    VALUES.forEach((value) => expect(isLogisticaEditableCollectionStatus(value)).toBe(true))
  })

  it('getDisplayedCollectionStatus exibe o rotulo fundido pro novo e pros 2 legados', () => {
    VALUES.forEach((value) =>
      expect(getDisplayedCollectionStatus(value)).toBe('Carga recebida, em conferência')
    )
  })
})

// F17.4a (D-7): paridade entre `src/features/processes/processStatus.js` e o
// espelho puro `functions/src/core/collectionStatus.js`.
describe('F17.4a - paridade do espelho functions/src/core/collectionStatus.js', () => {
  const PARITY_VALUES = [
    'Aguardando agendamento de coleta',
    'Coleta Agendada',
    'Carga a caminho do CD',
    'Veículo no CD para descarga',
    'Carga recebida, em conferência',
    'Carga em processo de Entrada',
    'Carga disponível em estoque',
    'Carga recebida',
    'Carga em Conferência/Etiquetagem',
    'Carga em Conferencia/Etiquetagem',
    'Aguardando agendamento',
    'Aguardando liberação no Terminal',
    '',
    '  ',
  ]

  it('canonicalizeCollectionStatusMirror === canonicalizeCollectionStatus pra cada valor', () => {
    PARITY_VALUES.forEach((value) => {
      expect(canonicalizeCollectionStatusMirror(value)).toBe(canonicalizeCollectionStatus(value))
    })
  })

  it('getDisplayedCollectionStatusMirror === getDisplayedCollectionStatus pra cada valor', () => {
    PARITY_VALUES.forEach((value) => {
      expect(getDisplayedCollectionStatusMirror(value)).toBe(getDisplayedCollectionStatus(value))
    })
  })

  it('hasCollectionStatusChangedMirror: legado x novo (mesmo canonico) nao muda', () => {
    expect(hasCollectionStatusChangedMirror('Carga recebida', 'Carga recebida, em conferência')).toBe(false)
    expect(
      hasCollectionStatusChangedMirror('Carga em Conferência/Etiquetagem', 'Carga recebida, em conferência')
    ).toBe(false)
  })

  it('hasCollectionStatusChangedMirror: valor realmente diferente muda', () => {
    expect(hasCollectionStatusChangedMirror('Coleta Agendada', 'Carga a caminho do CD')).toBe(true)
  })

  it('hasCollectionStatusChangedMirror: after vazio nunca conta como mudanca', () => {
    expect(hasCollectionStatusChangedMirror('Coleta Agendada', '')).toBe(false)
  })
})

describe('shouldPreserveStockCollectionStatus', () => {
  it('so retorna true com os dois sinais (processo finalizado + em estoque)', () => {
    expect(
      shouldPreserveStockCollectionStatus({
        processStatus: 'Carga recebida',
        collectionStatus: 'Carga disponível em estoque',
      })
    ).toBe(true)
  })

  it('processo finalizado mas nao em estoque -> false', () => {
    expect(
      shouldPreserveStockCollectionStatus({
        processStatus: 'Carga recebida',
        collectionStatus: 'Carga em processo de Entrada',
      })
    ).toBe(false)
  })

  it('em estoque mas processo nao finalizado -> false', () => {
    expect(
      shouldPreserveStockCollectionStatus({
        processStatus: 'Coleta Agendada',
        collectionStatus: 'Carga disponível em estoque',
      })
    ).toBe(false)
  })
})
