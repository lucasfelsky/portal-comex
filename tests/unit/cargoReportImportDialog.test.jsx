// S5 do Relatório de Carga: diálogo de prévia da importação. A leitura do .xlsx é mockada
// (o parser tem testes próprios); aqui valem os textos, estados e botões do diálogo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockRead = vi.fn()

vi.mock('../../src/features/processes/cargoReportImport', async (importOriginal) => ({
  ...(await importOriginal()),
  readCargoReportWorkbook: (...args) => mockRead(...args),
}))

import CargoReportImportDialog from '../../src/features/processes/CargoReportImportDialog'
import { CARGO_REPORT_IMPORT_ERRORS } from '../../src/features/processes/cargoReportImport'

const CATALOG = {
  exists: true,
  version: 3,
  items: [
    { code: 'AD5240', description: 'DEA FOAM', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'RE5116', description: 'DEGALAN', packagingType: 'CAIXA', netWeightKg: 25 },
    { code: 'MO5190', description: 'MONOMERO', packagingType: 'BALDE', netWeightKg: 5 },
    { code: 'AD5241', description: 'DEA FOAM 2', packagingType: 'BOMBONA', netWeightKg: 25 },
  ],
}

const importedRow = (id, overrides = {}) => ({
  id,
  po: '4500123',
  dbcorpCode: 'AD5240',
  supplierDescription: '',
  sqDescription: 'DEA FOAM14339 - BB 25KG',
  supplierLot: 'DF2406A',
  wmsLabel: '',
  sqLabel: '',
  quantityKg: 12500,
  count: 500,
  packageWeightKg: 1.2,
  frozenNetWeightKg: null,
  frozenPackages: null,
  ...overrides,
})

const SUCCESS = {
  fatal: null,
  fileName: 'RELATORIO DE CARGA - ACME SEA 021-26.xlsx',
  fileSize: 96 * 1024,
  sheetName: 'SQ QUIMICA',
  headerRow: 8,
  headerRange: 'B8:O8',
  sourceRevision: 5,
  cargoType: 'FCL',
  cargoTypeRead: true,
  warnings: [],
  missingOptional: [],
  rows: [
    importedRow('a'),
    importedRow('b', { dbcorpCode: 'RE5116', sqDescription: 'DEGALAN 64/12 N - CX 25KG', supplierLot: '', quantityKg: 5000, packageWeightKg: null }),
    importedRow('c', { dbcorpCode: 'ZZ9999', sqDescription: 'ADITIVO NOVO XR', supplierLot: 'XR0911', quantityKg: 800 }),
    importedRow('d', { dbcorpCode: 'MO5190', sqDescription: 'MONOMERO EXEMPLO - BLD 5KG', supplierLot: 'ME2407', quantityKg: 1000 }),
    importedRow('e', { dbcorpCode: 'AD5241', sqDescription: 'DEA FOAM14340 - BB 25KG', supplierLot: 'DF2406B', quantityKg: 2500 }),
  ],
}

const FAILURE = {
  fatal: { code: 'model-not-recognized', ...CARGO_REPORT_IMPORT_ERRORS['model-not-recognized'] },
  fileName: 'MODELO ANTIGO.xlsx',
  fileSize: 41 * 1024,
  sheetName: '',
  headerRow: 0,
  headerRange: '',
  sourceRevision: null,
  cargoType: '',
  cargoTypeRead: false,
  rows: [],
  warnings: [],
  missingOptional: [],
}

const FILE = new File(['x'], 'RELATORIO DE CARGA - ACME SEA 021-26.xlsx')

function renderDialog(props = {}) {
  const handlers = { onChooseAnother: vi.fn(), onApply: vi.fn(), onClose: vi.fn() }
  render(<CargoReportImportDialog open file={FILE} catalog={CATALOG} currentRowCount={5} {...handlers} {...props} />)
  return handlers
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRead.mockResolvedValue(SUCCESS)
})

describe('CargoReportImportDialog', () => {
  it('mostra "Lendo a planilha…" enquanto lê e deixa o botão principal desabilitado', async () => {
    mockRead.mockReturnValue(new Promise(() => {}))
    renderDialog()

    expect(await screen.findByRole('status')).toHaveTextContent('Lendo a planilha…')
    expect(screen.getByRole('button', { name: 'Substituir as linhas atuais' })).toBeDisabled()
    expect(mockRead).toHaveBeenCalledWith(FILE)
  })

  it('prévia: arquivo, selos, tabela, "sem lote" e o aviso do que não é importado', async () => {
    const { onApply } = renderDialog()

    expect(await screen.findByText('RELATORIO DE CARGA - ACME SEA 021-26.xlsx')).toBeInTheDocument()
    expect(screen.getByText(/96 KB · aba "SQ QUIMICA" reconhecida · cabeçalhos conferidos em B8:O8/)).toBeInTheDocument()
    expect(screen.getByText('5 linhas reconhecidas')).toBeInTheDocument()
    expect(screen.getByText('3 alertas')).toBeInTheDocument()
    expect(screen.getByText('Tipo de carga lido · DUIMP vem do processo')).toBeInTheDocument()
    expect(screen.getByText('sem lote')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Lote SQ, peso líquido e nº de embalagens não são importados: o Portal recalcula com a tabela Item x Emb. atual. OK?, etiquetas e contagem também não: são da conferência da logística.'
      )
    ).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '#',
      'PO',
      'Código',
      'Descrição SQ',
      'Lote forn.',
      'Qtd (kg)',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    expect(within(table).getByText('12.500')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Substituir as 5 linhas atuais' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(SUCCESS)
  })

  it('sem linhas no formulário o botão vira "Preencher com N linhas"', async () => {
    renderDialog({ currentRowCount: 0 })
    expect(await screen.findByRole('button', { name: 'Preencher com 5 linhas' })).toBeEnabled()
  })

  it('singular: uma linha atual e uma linha importada', async () => {
    mockRead.mockResolvedValue({ ...SUCCESS, rows: [SUCCESS.rows[0]] })
    const first = render(<CargoReportImportDialog open file={FILE} catalog={CATALOG} currentRowCount={1} onApply={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Substituir a linha atual' })).toBeInTheDocument()
    expect(screen.getByText('1 linha reconhecida')).toBeInTheDocument()
    first.unmount()

    render(<CargoReportImportDialog open file={FILE} catalog={CATALOG} currentRowCount={0} onApply={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Preencher com 1 linha' })).toBeInTheDocument()
  })

  it('tipo de carga não marcado e avisos de valor inválido e coluna ausente', async () => {
    mockRead.mockResolvedValue({
      ...SUCCESS,
      cargoTypeRead: false,
      warnings: [{ row: 9, message: 'Linha 9: QTD (KG) inválido ("abc"); ficou vazio.' }],
      missingOptional: ['ETIQUETA WMS'],
    })
    renderDialog()

    expect(await screen.findByText('Tipo de carga não marcado no arquivo · DUIMP vem do processo')).toBeInTheDocument()
    expect(screen.getByText('Linha 9: QTD (KG) inválido ("abc"); ficou vazio.')).toBeInTheDocument()
    expect(screen.getByText('Coluna ausente no arquivo (ficou vazia): ETIQUETA WMS')).toBeInTheDocument()
  })

  it('modelo não reconhecido: alerta, nada de prévia e botão principal desabilitado', async () => {
    mockRead.mockResolvedValue(FAILURE)
    renderDialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Modelo não reconhecido.')
    expect(alert).toHaveTextContent('Nada foi alterado no formulário.')
    expect(screen.getByText('MODELO ANTIGO.xlsx')).toBeInTheDocument()
    expect(screen.getByText(/41 KB/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/linhas reconhecidas/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Substituir as linhas atuais' })).toBeDisabled()
  })

  it('"Escolher outro arquivo" chama onChooseAnother', async () => {
    const { onChooseAnother } = renderDialog()
    await screen.findByText('5 linhas reconhecidas')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Escolher outro arquivo' }))
    expect(onChooseAnother).toHaveBeenCalledTimes(1)
  })

  it('rejeição inesperada da leitura mostra o erro e não habilita o botão principal', async () => {
    mockRead.mockRejectedValue(new Error('falha inesperada'))
    renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler a planilha.')
    expect(screen.getByRole('button', { name: 'Substituir as linhas atuais' })).toBeDisabled()
  })

  it('não usa ghost-button e tem o título do diálogo', async () => {
    renderDialog()
    await screen.findByText('5 linhas reconhecidas')

    expect(screen.getByRole('dialog', { name: 'Importar de planilha' })).toBeInTheDocument()
    expect(document.body.querySelector('.ghost-button')).toBeNull()
  })

  it('troca de arquivo durante a leitura: a resposta atrasada do primeiro não sobrescreve a prévia', async () => {
    let resolveFirst
    mockRead.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
    mockRead.mockResolvedValueOnce({ ...SUCCESS, fileName: 'SEGUNDO.xlsx' })
    const handlers = { onChooseAnother: vi.fn(), onApply: vi.fn(), onClose: vi.fn() }
    const secondFile = new File(['y'], 'SEGUNDO.xlsx')
    const view = render(<CargoReportImportDialog open file={FILE} catalog={CATALOG} currentRowCount={5} {...handlers} />)
    expect(await screen.findByRole('status')).toHaveTextContent('Lendo a planilha…')

    view.rerender(<CargoReportImportDialog open file={secondFile} catalog={CATALOG} currentRowCount={5} {...handlers} />)
    expect(await screen.findByText('SEGUNDO.xlsx')).toBeInTheDocument()

    await act(async () => {
      resolveFirst({ ...SUCCESS, fileName: 'PRIMEIRO.xlsx' })
    })
    expect(screen.getByText('SEGUNDO.xlsx')).toBeInTheDocument()
    expect(screen.queryByText('PRIMEIRO.xlsx')).not.toBeInTheDocument()
    expect(mockRead).toHaveBeenCalledTimes(2)
  })

  it('fechado, não lê o arquivo nem renderiza', () => {
    renderDialog({ open: false })
    expect(mockRead).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
