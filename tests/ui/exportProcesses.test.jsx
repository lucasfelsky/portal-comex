// F3 (backlog 2026-07-12): export de processos para Excel. Testa a parte
// pura (linhas + nome de arquivo) — o I/O do xlsx fica fora (import
// dinâmico só acontece no exportProcessesToXlsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  PROGRESS_TOAST_DELAY_MS,
  buildExportFileName,
  buildProcessesExportRows,
  runProcessesExport,
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
    expect(row['Contêineres']).toBe(2)
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
    expect(row['Contêineres']).toBe('')
    expect(row.Pallets).toBe('')
    expect(row.Navio).toBe('')
    expect(row.Viagem).toBe('')
    expect(row['IMO do navio']).toBe('')
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

describe('buildProcessesExportRows — Navio, Viagem e IMO do navio', () => {
  const WITH_VESSEL = { ...PROCESS, vesselName: 'MSC Rio', voyage: 'V-001', vesselImo: '9787027' }

  it('exporta Navio, Viagem e IMO do navio (IMO sempre string)', () => {
    const row = buildProcessesExportRows([WITH_VESSEL], NOW, { canSeeName: true })[0]
    expect(row.Navio).toBe('MSC Rio')
    expect(row.Viagem).toBe('V-001')
    expect(row['IMO do navio']).toBe('9787027')
    expect(typeof row['IMO do navio']).toBe('string')
  })

  it('as 3 colunas ficam imediatamente após ETA', () => {
    const keys = Object.keys(buildProcessesExportRows([WITH_VESSEL], NOW)[0])
    const etaIndex = keys.indexOf('ETA')
    expect(keys.indexOf('Navio')).toBe(etaIndex + 1)
    expect(keys.indexOf('Viagem')).toBe(etaIndex + 2)
    expect(keys.indexOf('IMO do navio')).toBe(etaIndex + 3)
  })

  it('o IMO sai como texto na célula do xlsx', () => {
    const rows = buildProcessesExportRows([WITH_VESSEL], NOW)
    const sheet = XLSX.utils.json_to_sheet(rows)
    const range = XLSX.utils.decode_range(sheet['!ref'])
    let imoColumn = -1
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      if (sheet[XLSX.utils.encode_cell({ r: 0, c: col })]?.v === 'IMO do navio') imoColumn = col
    }
    expect(imoColumn).toBeGreaterThanOrEqual(0)
    const cell = sheet[XLSX.utils.encode_cell({ r: 1, c: imoColumn })]
    expect(cell.t).toBe('s')
    expect(cell.v).toBe('9787027')
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

// F17.2c/F17.2d-2 (D-10/D-6): coluna POs (purchaseOrders[] do CONSOLIDADO)
// + colunas "Referências das POs"/"Fornecedores das POs" mascaradas.
describe('buildProcessesExportRows — coluna POs (F17.2c)', () => {
  it('CONSOLIDADO com purchaseOrders (strings legadas) -> "A, B"', () => {
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

describe('buildProcessesExportRows — colunas Referências/Fornecedores das POs (F17.2d-2)', () => {
  const CONSOLIDATED = {
    ...PROCESS,
    category: 'CONSOLIDADO',
    purchaseOrders: [
      { po: 'A', reference: 'REF-A', supplierName: 'ACME' },
      { po: 'B', reference: '', supplierName: 'BETA' },
    ],
  }

  it('canSeeName: true -> colunas preenchidas', () => {
    const rows = buildProcessesExportRows([CONSOLIDATED], NOW, { canSeeName: true })
    expect(rows[0]['Referências das POs']).toBe('REF-A')
    expect(rows[0]['Fornecedores das POs']).toBe('ACME, BETA')
  })

  it('canSeeName: false -> colunas vazias', () => {
    const rows = buildProcessesExportRows([CONSOLIDATED], NOW)
    expect(rows[0]['Referências das POs']).toBe('')
    expect(rows[0]['Fornecedores das POs']).toBe('')
  })

  it('canSeeName: true + canSeePoDetails: false (tecnico/faturamento) -> Nome preenchido em FCL e colunas das POs vazias', () => {
    const options = { canSeeName: true, canSeePoDetails: false }
    const rows = buildProcessesExportRows([PROCESS, CONSOLIDATED], NOW, options)
    expect(rows[0].Nome).toBe(PROCESS.name)
    expect(rows[1]['Referências das POs']).toBe('')
    expect(rows[1]['Fornecedores das POs']).toBe('')
  })

  it('canSeeName: true + canSeePoDetails: true -> colunas das POs preenchidas', () => {
    const rows = buildProcessesExportRows([CONSOLIDATED], NOW, { canSeeName: true, canSeePoDetails: true })
    expect(rows[0]['Referências das POs']).toBe('REF-A')
    expect(rows[0]['Fornecedores das POs']).toBe('ACME, BETA')
  })

  it('a chave esta presente mesmo sem canSeeName/sem POs', () => {
    const rows = buildProcessesExportRows([PROCESS], NOW)
    expect(rows[0]).toHaveProperty('Referências das POs', '')
    expect(rows[0]).toHaveProperty('Fornecedores das POs', '')
  })
})

describe('buildProcessesExportRows — status derivado (mapa 2026-10-21)', () => {
  it('FCL atracado com DUIMP registrada -> "Aguardando desembaraço"', () => {
    const rows = buildProcessesExportRows(
      [
        {
          id: 'p-desembaraco',
          category: 'FCL',
          shippedAt: '2026-06-10',
          eta: '2026-07-05',
          berthedAt: '2026-07-06T08:00',
          cargoPresenceInformedAt: '2026-07-07T10:00',
          duimpRegisteredAt: '2026-07-08T09:00',
          duimpStatus: 'Aguardando parametrização da DUIMP',
          processStatus: 'Aguardando parametrização da DUIMP',
          collectionStatus: '',
          collectionWindows: [],
        },
      ],
      NOW
    )
    expect(rows[0]['Status derivado']).toBe('Aguardando desembaraço')
  })
})

describe('runProcessesExport - atraso do toast de progresso', () => {
  let toast
  let errorSpy

  const makeToast = () => ({
    info: vi.fn(() => 'prog-1'),
    success: vi.fn(),
    error: vi.fn(),
  })
  const resolveAfter = (ms, value = 3) => () =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms))
  const rejectAfter = (ms) => () =>
    new Promise((_, reject) => setTimeout(() => reject(new Error('falhou')), ms))

  beforeEach(() => {
    vi.useFakeTimers()
    toast = makeToast()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    vi.useRealTimers()
  })

  it('expoe o atraso padrao de 400 ms', () => {
    expect(PROGRESS_TOAST_DELAY_MS).toBe(400)
  })

  it('exportacao rapida: nao mostra "Gerando" e o sucesso vem sem replaces', async () => {
    const run = runProcessesExport({
      rows: [],
      toast,
      showProgress: true,
      exportFn: resolveAfter(100),
    })
    await vi.advanceTimersByTimeAsync(100)
    await run
    await vi.advanceTimersByTimeAsync(1000)

    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Exportados 3 processos para Excel.', undefined)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('exportacao lenta: "Gerando" aparece aos 400 ms e o sucesso o troca', async () => {
    const run = runProcessesExport({
      rows: [],
      toast,
      showProgress: true,
      exportFn: resolveAfter(900),
    })
    await vi.advanceTimersByTimeAsync(399)
    expect(toast.info).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(toast.info).toHaveBeenCalledTimes(1)
    expect(toast.info).toHaveBeenCalledWith('Gerando planilha…', { persist: true })
    expect(toast.success).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    await run
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Exportados 3 processos para Excel.', {
      replaces: 'prog-1',
    })
  })

  it('erro rapido: nao mostra "Gerando" e o erro vem sem replaces', async () => {
    const run = runProcessesExport({
      rows: [],
      toast,
      showProgress: true,
      exportFn: rejectAfter(50),
    })
    await vi.advanceTimersByTimeAsync(50)
    await run
    await vi.advanceTimersByTimeAsync(1000)

    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Não foi possível exportar os processos.', undefined)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('erro lento: "Gerando" aparece e o erro o troca', async () => {
    const run = runProcessesExport({
      rows: [],
      toast,
      showProgress: true,
      exportFn: rejectAfter(800),
    })
    await vi.advanceTimersByTimeAsync(800)
    await run

    expect(toast.info).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Não foi possível exportar os processos.', {
      replaces: 'prog-1',
    })
  })

  it('sem showProgress: nunca mostra "Gerando" e o resultado vem sem replaces', async () => {
    const run = runProcessesExport({
      rows: [],
      toast,
      showProgress: false,
      exportFn: resolveAfter(900),
    })
    await vi.advanceTimersByTimeAsync(900)
    await run
    await vi.advanceTimersByTimeAsync(1000)

    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Exportados 3 processos para Excel.', undefined)
  })

  it('ordem: o resultado nunca vem antes de um "Gerando" emitido depois dele e nao sobra timer', async () => {
    // Lenta: "Gerando" antes do resultado.
    const slow = runProcessesExport({
      rows: [],
      toast,
      showProgress: true,
      exportFn: resolveAfter(900),
    })
    await vi.advanceTimersByTimeAsync(900)
    await slow
    expect(toast.info.mock.invocationCallOrder[0]).toBeLessThan(
      toast.success.mock.invocationCallOrder[0]
    )
    expect(vi.getTimerCount()).toBe(0)

    // Rapida: o timer e cancelado, entao nao ha "Gerando" depois do resultado.
    const fastToast = makeToast()
    const fast = runProcessesExport({
      rows: [],
      toast: fastToast,
      showProgress: true,
      exportFn: resolveAfter(100),
    })
    await vi.advanceTimersByTimeAsync(100)
    await fast
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fastToast.info).not.toHaveBeenCalled()
    expect(fastToast.success).toHaveBeenCalledTimes(1)
  })

  it('aceita progressDelayMs customizado', async () => {
    const run = runProcessesExport({
      rows: [],
      toast,
      showProgress: true,
      progressDelayMs: 50,
      exportFn: resolveAfter(200),
    })
    await vi.advanceTimersByTimeAsync(50)
    expect(toast.info).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(150)
    await run
    expect(toast.success).toHaveBeenCalledWith('Exportados 3 processos para Excel.', {
      replaces: 'prog-1',
    })
  })
})
