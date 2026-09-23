// F17.0 (bugfixes de processos): testes puros dos helpers dos bugs 3, 5, 6.
import { describe, expect, it } from 'vitest'
import {
  canonicalizeCollectionStatus,
  mapaAllowsCollectionStatus,
  shouldPreserveStockCollectionStatus,
} from '../../src/features/processes/processStatus'

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
