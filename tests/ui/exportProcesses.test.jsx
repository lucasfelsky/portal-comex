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
    const rows = buildProcessesExportRows([PROCESS], NOW, { canSeeName: true })

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
    const rows = buildProcessesExportRows([PROCESS], NOW, { canSeeName: true })
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

// F17.0 bug 4: o export não pode expor o nome de categoria restrita
// (FCL/LCL/AEREO) para quem não é admin/logística.
describe('buildProcessesExportRows — mascaramento de nome (bug 4)', () => {
  it('FCL sem canSeeName mascara Nome; Processo cai pro PO (não pro nome)', () => {
    const rows = buildProcessesExportRows([PROCESS], NOW)
    expect(rows[0].Nome).toBe('')
    expect(rows[0].Processo).toBe('PO 12345')
  })

  it('LCL/AEREO sem canSeeName e processNumber vazio -> Processo também vazio (não vaza o nome)', () => {
    const rows = buildProcessesExportRows(
      [
        { ...PROCESS, category: 'LCL', processNumber: '' },
        { ...PROCESS, category: 'AEREO', processNumber: '' },
      ],
      NOW
    )
    expect(rows[0].Nome).toBe('')
    expect(rows[0].Processo).toBe('')
    expect(rows[1].Nome).toBe('')
    expect(rows[1].Processo).toBe('')
  })

  it('CONSOLIDADO sem canSeeName mantém o nome visível (categoria não restrita)', () => {
    const rows = buildProcessesExportRows([{ ...PROCESS, category: 'CONSOLIDADO' }], NOW)
    expect(rows[0].Nome).toBe('CON CN PO 12345')
  })

  it('a chave Nome está presente em todas as linhas (mascarada ou não)', () => {
    const rows = buildProcessesExportRows([PROCESS, { ...PROCESS, category: 'CONSOLIDADO' }], NOW)
    rows.forEach((row) => expect(row).toHaveProperty('Nome'))
  })
})

// F17.2c (D-10): coluna POs (purchaseOrders[] do CONSOLIDADO).
describe('buildProcessesExportRows — coluna POs (F17.2c)', () => {
  it('CONSOLIDADO com purchaseOrders -> "A, B"', () => {
    const rows = buildProcessesExportRows(
      [{ ...PROCESS, category: 'CONSOLIDADO', purchaseOrders: ['A', 'B'] }],
      NOW
    )
    expect(rows[0].POs).toBe('A, B')
  })

  it('FCL -> ""', () => {
    const rows = buildProcessesExportRows([PROCESS], NOW)
    expect(rows[0].POs).toBe('')
  })

  it('processo minimo ({ id: "vazio" }) -> ""', () => {
    const rows = buildProcessesExportRows([{ id: 'vazio' }], NOW)
    expect(rows[0].POs).toBe('')
  })
})
