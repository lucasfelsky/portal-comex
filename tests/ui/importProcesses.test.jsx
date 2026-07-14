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
})