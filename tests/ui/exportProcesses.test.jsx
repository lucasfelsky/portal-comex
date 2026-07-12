// F3 (backlog 2026-07-12): export de processos para Excel. Testa a parte
// pura (linhas + nome de arquivo) — o I/O do xlsx fica fora (import
// dinâmico só acontece no exportProcessesToXlsx).
import { describe, expect, it } from 'vitest'
import {
  buildExportFileName,
  buildProcessesExportRows,
} from '../../src/utils/exportProcesses'

const NOW = new Date('2026-07-08T12:00:00')

const PROCESS = {
  id: 'p-1',
  name: 'CON CN PO 12345',
  processNumber: 'PO 12345',
  category: 'FCL',
  destination: 'Navegantes',
  etd: '2026-06-20',
  eta: '2026-07-10',
  processStatus: 'Embarcado',
  collectionStatus: 'Coleta Agendada',
  collectionWindows: [
    { id: 'w1', containerNumber: 1, scheduledAt: '2026-07-11T08:00:00', notes: '' },
    { id: 'w2', containerNumber: 2, scheduledAt: '2026-07-10T14:30:00', notes: '' },
  ],
  containerQuantity: 2,
  palletQuantity: 24,
}

describe('buildProcessesExportRows', () => {
  it('monta a linha com datas pt-BR e status derivado', () => {
    const rows = buildProcessesExportRows([PROCESS], NOW)

    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.Processo).toBe('PO 12345')
    expect(row.Nome).toBe('CON CN PO 12345')
    expect(row.Categoria).toBe('FCL')
    expect(row.Destino).toBe('Navegantes')
    expect(row.ETD).toBe('20/06/2026')
    expect(row.ETA).toBe('10/07/2026')
    expect(row['Status do processo']).toBe('Embarcado')
    // Derivado vem do getProcessDerivedStatus — só garantimos que veio label.
    expect(typeof row['Status derivado']).toBe('string')
    expect(row['Status derivado'].length).toBeGreaterThan(0)
    expect(row['Status de coleta']).toBe('Coleta Agendada')
    expect(row.Containers).toBe(2)
    expect(row.Pallets).toBe(24)
  })

  it('usa a janela de coleta MAIS PRÓXIMA (ordenada), formatada com hora', () => {
    const rows = buildProcessesExportRows([PROCESS], NOW)
    expect(rows[0]['Próxima coleta']).toContain('10/07/2026')
    expect(rows[0]['Próxima coleta']).toContain('14:30')
  })

  it('campos ausentes viram string vazia (sem undefined/NaN no Excel)', () => {
    const rows = buildProcessesExportRows([{ id: 'vazio' }], NOW)
    const row = rows[0]
    expect(row.Processo).toBe('')
    expect(row.ETD).toBe('')
    expect(row.ETA).toBe('')
    expect(row['Próxima coleta']).toBe('')
    expect(row.Containers).toBe('')
    expect(row.Pallets).toBe('')
  })

  it('lista vazia/invalida -> sem linhas', () => {
    expect(buildProcessesExportRows([], NOW)).toEqual([])
    expect(buildProcessesExportRows(null, NOW)).toEqual([])
  })

  it('data invalida e ecoada como texto (nao vira Invalid Date)', () => {
    const rows = buildProcessesExportRows([{ id: 'x', eta: 'quando-chegar' }], NOW)
    expect(rows[0].ETA).toBe('quando-chegar')
  })
})

describe('buildExportFileName', () => {
  it('nomeia com a data local YYYY-MM-DD', () => {
    expect(buildExportFileName(NOW)).toBe('processos-2026-07-08.xlsx')
  })
})
