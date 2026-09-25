// Unit tests do parser de import em lote (importProcesses.js).
// Cobre: parse de planilha válida, colunas obrigatórias faltando,
// categoria inválida, datas inválidas, PO duplicado, linhas vazias,
// normalização de datas (BR/ISO), normalização de categorias com/sem
// acento, fuzzy match de cabeçalho, variação de aliases de coluna.
//
// Molde: tests/ui/exportProcesses.test.jsx (usa xlsx real, não mocka).

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseProcessesFromWorkbook } from '../../src/utils/importProcesses'

function makeFile(rows) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function makeEmptyFile() {
  // xlsx.write lança "Workbook is empty" se não houver sheets —
  // contornamos com uma sheet vazia pra testar o caminho de "sem abas".
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('importProcesses — parseProcessesFromWorkbook', () => {
  it('parse planilha válida com todas as colunas', async () => {
    const file = makeFile([
      ['Nome', 'PO', 'Categoria', 'Destino', 'ETD', 'ETA', 'Containers', 'Pallets', 'Status', 'Observações'],
      ['Importação Atlas', 'FCL-001', 'FCL', 'Hamburg', '2026-03-08', '2026-03-18', '1', '12', 'Aguardando Embarque', 'Sem observações'],
      ['Embarque Boreal', 'LCL-002', 'LCL', 'Miami', '2026-03-05', '2026-03-15', '0', '8', 'Embarcou', ''],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(errors).toHaveLength(0)
    expect(validRows).toHaveLength(2)
    expect(validRows[0].name).toBe('Importação Atlas')
    expect(validRows[0].category).toBe('FCL')
    expect(validRows[0].processNumber).toBe('FCL-001')
    expect(validRows[0].etd).toBe('2026-03-08')
    expect(validRows[0].eta).toBe('2026-03-18')
    expect(validRows[0].etaOriginal).toBe('2026-03-18')
    expect(validRows[0].containerQuantity).toBe(1)
    expect(validRows[0].palletQuantity).toBe(12)
    expect(validRows[0].processStatus).toBe('Aguardando Embarque')
    expect(validRows[0].destination).toBe('HAMBURG')
  })

  it('normaliza datas em formato DD/MM/YYYY -> YYYY-MM-DD', async () => {
    const file = makeFile([
      ['Nome', 'Categoria', 'ETD', 'ETA'],
      ['Teste Data BR', 'FCL', '08/03/2026', '18/03/2026'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(errors).toHaveLength(0)
    expect(validRows[0].etd).toBe('2026-03-08')
    expect(validRows[0].eta).toBe('2026-03-18')
  })

  it('aceita categoria sem acento/case-insensitive', async () => {
    const file = makeFile([
      ['Nome', 'Categoria'],
      ['Teste AEREO', 'aereo'],
      ['Teste Consolidado', 'consolidado'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(errors).toHaveLength(0)
    expect(validRows[0].category).toBe('AEREO')
    expect(validRows[1].category).toBe('CONSOLIDADO')
  })

  it('erro: coluna obrigatória "name" faltando', async () => {
    const file = makeFile([
      ['PO', 'Categoria'],
      ['FCL-001', 'FCL'],
    ])

    await expect(parseProcessesFromWorkbook(file)).rejects.toThrow(
      /Colunas obrigatórias não encontradas/i
    )
  })

  it('erro: coluna obrigatória "category" faltando', async () => {
    const file = makeFile([
      ['Nome', 'PO'],
      ['Teste', 'FCL-001'],
    ])

    await expect(parseProcessesFromWorkbook(file)).rejects.toThrow(
      /Colunas obrigatórias não encontradas: categoria/i
    )
  })

  it('erro: categoria inválida', async () => {
    const file = makeFile([
      ['Nome', 'Categoria'],
      ['Teste', 'INVALIDO'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(validRows).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].linha).toBe(2)
    expect(errors[0].motivo).toMatch(/Categoria inválida/i)
  })

  it('erro: nome vazio', async () => {
    const file = makeFile([
      ['Nome', 'Categoria'],
      ['', 'FCL'],
      ['Válido', 'LCL'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(validRows).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0].linha).toBe(2)
    expect(errors[0].motivo).toMatch(/Nome do processo é obrigatório/i)
  })

  it('erro: PO duplicado na planilha', async () => {
    const file = makeFile([
      ['Nome', 'PO', 'Categoria'],
      ['Processo A', 'FCL-001', 'FCL'],
      ['Processo B', 'FCL-001', 'FCL'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(validRows).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0].linha).toBe(3)
    expect(errors[0].motivo).toMatch(/PO duplicado/i)
  })

  it('pula linhas totalmente vazias', async () => {
    const file = makeFile([
      ['Nome', 'Categoria'],
      ['Válido 1', 'FCL'],
      ['', ''],
      ['Válido 2', 'LCL'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(validRows).toHaveLength(2)
    expect(errors).toHaveLength(0)
  })

  it('CONSOLIDADO limpa processNumber', async () => {
    const file = makeFile([
      ['Nome', 'PO', 'Categoria'],
      ['Teste', 'FCL-001', 'CONSOLIDADO'],
    ])

    const { validRows } = await parseProcessesFromWorkbook(file)

    expect(validRows[0].processNumber).toBe('')
  })

  it('aceita aliases alternativos de coluna (fuzzy)', async () => {
    const file = makeFile([
      ['Processo', 'Tipo', 'Porto de Atracação', 'Embarque', 'Chegada'],
      ['Import Atlas', 'FCL', 'Hamburg', '2026-03-08', '2026-03-18'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(errors).toHaveLength(0)
    expect(validRows[0].name).toBe('Import Atlas')
    expect(validRows[0].category).toBe('FCL')
    expect(validRows[0].destination).toBe('HAMBURG')
    expect(validRows[0].etd).toBe('2026-03-08')
    expect(validRows[0].eta).toBe('2026-03-18')
  })

  it('erro: data inválida (texto não-data)', async () => {
    const file = makeFile([
      ['Nome', 'Categoria', 'ETA'],
      ['Teste', 'FCL', 'nao e data'],
    ])

    const { validRows, errors } = await parseProcessesFromWorkbook(file)

    expect(validRows).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].motivo).toMatch(/ETA inválida/i)
  })

  it('planilha sem linhas de dados lança erro', async () => {
    const file = makeFile([['Nome', 'Categoria']])

    await expect(parseProcessesFromWorkbook(file)).rejects.toThrow(
      /Nenhum processo válido encontrado/i
    )
  })

  // F17.5b: colunas novas (identificação/rastreio + contêineres/POs do
  // consolidado), mapeamento em 2 fases e fix de fuso em normalizeDate.
  describe('F17.5b - colunas novas', () => {
    it('planilha antiga (so colunas legadas) mapeia identico ao atual + warnings []', async () => {
      const file = makeFile([
        ['Nome', 'PO', 'Categoria', 'Destino', 'ETD', 'ETA', 'Containers', 'Pallets', 'Status', 'Observações'],
        ['Importação Atlas', 'FCL-001', 'FCL', 'Hamburg', '2026-03-08', '2026-03-18', '1', '12', 'Aguardando Embarque', 'Sem observações'],
      ])

      const { validRows, errors, warnings } = await parseProcessesFromWorkbook(file)

      expect(errors).toHaveLength(0)
      expect(warnings).toEqual([])
      expect(validRows[0].name).toBe('Importação Atlas')
      expect(validRows[0].category).toBe('FCL')
    })

    it('todas as colunas novas FCL: identificação/rastreio + containers/tipos com containerQuantity derivado', async () => {
      const file = makeFile([
        [
          'Nome', 'Categoria', 'Fornecedor', 'Origem', 'Incoterm', 'Agente de carga',
          'MBL', 'HBL', 'Navio', 'Viagem',
          'Números dos contêineres', 'Tipos dos contêineres',
        ],
        [
          'Importação Atlas', 'FCL', 'Fornecedor X', 'Shanghai', 'fob', 'Agente Y',
          'MBL-1', 'HBL-1', 'MSC Rio', 'V-001',
          'MSCU1234566; CSQU3054383', '40HC',
        ],
      ])

      const { validRows, errors, warnings } = await parseProcessesFromWorkbook(file)

      expect(errors).toHaveLength(0)
      expect(warnings).toHaveLength(0)
      const row = validRows[0]
      expect(row.supplierName).toBe('Fornecedor X')
      expect(row.originLocation).toBe('Shanghai')
      expect(row.incoterm).toBe('FOB')
      expect(row.forwarderName).toBe('Agente Y')
      expect(row.masterBl).toBe('MBL-1')
      expect(row.houseBl).toBe('HBL-1')
      expect(row.vesselName).toBe('MSC Rio')
      expect(row.voyage).toBe('V-001')
      expect(row.containers).toEqual([
        { id: 'CNT-1', number: 'MSCU1234566', seal: '', type: '40HC', returnedAt: '' },
        { id: 'CNT-2', number: 'CSQU3054383', seal: '', type: '40HC', returnedAt: '' },
      ])
      expect(row.containerQuantity).toBe(2)
    })

    it('"Porto de origem" + "Destino" -> origem e destino corretos (sem roubo de coluna)', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'Porto de origem', 'Destino'],
        ['Teste', 'FCL', 'Shanghai', 'Hamburg'],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)

      expect(errors).toHaveLength(0)
      expect(validRows[0].originLocation).toBe('Shanghai')
      expect(validRows[0].destination).toBe('HAMBURG')
    })

    it('"Tipo de contêiner" sem coluna de categoria -> erro "Colunas obrigatórias" (categoria nao e roubada)', async () => {
      const file = makeFile([
        ['Nome', 'Tipo de contêiner'],
        ['Teste', '40HC'],
      ])

      await expect(parseProcessesFromWorkbook(file)).rejects.toThrow(
        /Colunas obrigatórias não encontradas/i
      )
    })

    it('"Tipo" + "Tipo de contêiner" -> categoria e tipo de contêiner corretos', async () => {
      const file = makeFile([
        ['Nome', 'Tipo', 'Números dos contêineres', 'Tipo de contêiner'],
        ['Teste', 'FCL', 'MSCU1234566', '40HC'],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)

      expect(errors).toHaveLength(0)
      expect(validRows[0].category).toBe('FCL')
      expect(validRows[0].containers[0].type).toBe('40HC')
    })

    it('"Nome do navio" + "Nome" -> nome do processo e nome do navio corretos', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'Nome do navio'],
        ['Importação Atlas', 'FCL', 'MSC Rio'],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)

      expect(errors).toHaveLength(0)
      expect(validRows[0].name).toBe('Importação Atlas')
      expect(validRows[0].vesselName).toBe('MSC Rio')
    })

    it('incoterm "fob" -> "FOB"; incoterm "XYZ" -> erro', async () => {
      const validFile = makeFile([
        ['Nome', 'Categoria', 'Incoterm'],
        ['Teste', 'FCL', 'fob'],
      ])
      const { validRows, errors } = await parseProcessesFromWorkbook(validFile)
      expect(errors).toHaveLength(0)
      expect(validRows[0].incoterm).toBe('FOB')

      const invalidFile = makeFile([
        ['Nome', 'Categoria', 'Incoterm'],
        ['Teste', 'FCL', 'XYZ'],
      ])
      const invalidResult = await parseProcessesFromWorkbook(invalidFile)
      expect(invalidResult.validRows).toHaveLength(0)
      expect(invalidResult.errors[0].motivo).toMatch(/Incoterm inválido/i)
    })

    it('41 contêineres -> erro (teto de 40)', async () => {
      const numbers = Array.from({ length: 41 }, (_, i) => `MSCU100000${String(i).padStart(2, '0')}`).join(';')
      const file = makeFile([
        ['Nome', 'Categoria', 'Números dos contêineres'],
        ['Teste', 'FCL', numbers],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)
      expect(validRows).toHaveLength(0)
      expect(errors[0].motivo).toMatch(/excede o limite de 40/i)
    })

    it('tipo de contêiner desconhecido -> erro', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'Números dos contêineres', 'Tipos dos contêineres'],
        ['Teste', 'FCL', 'MSCU1234567', 'TIPO INEXISTENTE'],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)
      expect(validRows).toHaveLength(0)
      expect(errors[0].motivo).toMatch(/Tipo de contêiner desconhecido/i)
    })

    it('2 números + 3 tipos de contêiner -> erro (contagem nao confere)', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'Números dos contêineres', 'Tipos dos contêineres'],
        ['Teste', 'FCL', 'MSCU1234567;CSQU3054383', '40HC;40DC;20DC'],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)
      expect(validRows).toHaveLength(0)
      expect(errors[0].motivo).toMatch(/não confere/i)
    })

    it('1 tipo para 3 números -> todos os contêineres com o mesmo tipo', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'Números dos contêineres', 'Tipos dos contêineres'],
        ['Teste', 'FCL', 'MSCU1234566;CSQU3054383;TCLU1234565', '40HC'],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)
      expect(errors).toHaveLength(0)
      expect(validRows[0].containers).toHaveLength(3)
      expect(validRows[0].containers.every((c) => c.type === '40HC')).toBe(true)
    })

    it('dígito verificador ISO inválido -> linha válida + aviso (nunca erro)', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'Números dos contêineres'],
        ['Teste', 'FCL', 'MSCU1234560'],
      ])

      const { validRows, errors, warnings } = await parseProcessesFromWorkbook(file)
      expect(errors).toHaveLength(0)
      expect(validRows).toHaveLength(1)
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].motivo).toMatch(/Dígito verificador não confere/i)
    })

    it('CONSOLIDADO com 51 POs -> erro; com 1 PO -> válido, POs viram objetos e fornecedor vira aviso', async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `PO-${i}`).join(';')
      const overFile = makeFile([
        ['Nome', 'Categoria', 'POs do consolidado'],
        ['Teste', 'CONSOLIDADO', tooMany],
      ])
      const overResult = await parseProcessesFromWorkbook(overFile)
      expect(overResult.validRows).toHaveLength(0)
      expect(overResult.errors[0].motivo).toMatch(/excede o limite de 50/i)

      const okFile = makeFile([
        ['Nome', 'Categoria', 'Fornecedor', 'POs do consolidado'],
        ['Teste', 'CONSOLIDADO', 'Fornecedor Z', '123/2026'],
      ])
      const { validRows, errors, warnings } = await parseProcessesFromWorkbook(okFile)
      expect(errors).toHaveLength(0)
      expect(validRows[0].purchaseOrders).toEqual([{ po: '123/2026', reference: '', supplierName: '' }])
      expect(validRows[0].supplierName).toBe('')
      expect(warnings.some((w) => /Fornecedor ignorado no CONSOLIDADO/i.test(w.motivo))).toBe(true)
    })

    it('PO com barra "123/2026" nao e quebrada em 2 POs', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'POs do consolidado'],
        ['Teste', 'CONSOLIDADO', '123/2026;456/2026'],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)
      expect(errors).toHaveLength(0)
      expect(validRows[0].purchaseOrders.map((p) => p.po)).toEqual(['123/2026', '456/2026'])
    })

    it('LCL com números de contêiner preenchidos -> ignora + aviso', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'Números dos contêineres'],
        ['Teste', 'LCL', 'MSCU1234567'],
      ])

      const { validRows, errors, warnings } = await parseProcessesFromWorkbook(file)
      expect(errors).toHaveLength(0)
      expect(validRows[0].containers).toBeUndefined()
      expect(warnings.some((w) => /categoria não é FCL\/CONSOLIDADO/i.test(w.motivo))).toBe(true)
    })

    it('data como célula-serial (numero + formato dd/mm/yyyy) normaliza pro dia correto', async () => {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([
        ['Nome', 'Categoria', 'ETA'],
        ['Teste Serial', 'FCL', ''],
      ])
      ws['C2'] = { t: 'n', v: 46089, z: 'dd/mm/yyyy' }
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      const file = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

      const { validRows, errors } = await parseProcessesFromWorkbook(file)
      expect(errors).toHaveLength(0)
      expect(validRows[0].eta).toBe('2026-03-08')
    })

    it('data como objeto Date (cellDates) normaliza pro dia correto', async () => {
      const file = makeFile([
        ['Nome', 'Categoria', 'ETA'],
        ['Teste Date', 'FCL', new Date(2026, 2, 8)],
      ])

      const { validRows, errors } = await parseProcessesFromWorkbook(file)
      expect(errors).toHaveLength(0)
      expect(validRows[0].eta).toBe('2026-03-08')
    })
  })
})