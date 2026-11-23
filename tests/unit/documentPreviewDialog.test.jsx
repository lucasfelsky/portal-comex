// S1 - DocumentPreviewDialog: estados (carregando, sucesso, erro, arquivo grande,
// planilha inválida, sem linhas), PDF, "Baixar" reaproveitando o blob e abas.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocumentPreviewDialog from '../../src/features/processes/DocumentPreviewDialog'
import { PREVIEW_MAX_SPREADSHEET_BYTES } from '../../src/features/processes/spreadsheetPreview'

const mockDownloadProcessDocumentBlob = vi.fn()
const mockSaveBlobAsFile = vi.fn()
const mockReadSpreadsheetPreview = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  downloadProcessDocumentBlob: (...args) => mockDownloadProcessDocumentBlob(...args),
  saveBlobAsFile: (...args) => mockSaveBlobAsFile(...args),
}))

vi.mock('../../src/features/processes/spreadsheetPreview', async () => {
  const actual = await vi.importActual('../../src/features/processes/spreadsheetPreview')
  return {
    ...actual,
    readSpreadsheetPreview: (...args) => mockReadSpreadsheetPreview(...args),
  }
})

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const XLSX_DOCUMENT = {
  id: 'c1',
  name: 'FR.CMX.001 - RELATORIO DE CARGA.R5.xlsx',
  mimeType: XLSX_MIME,
  uploadedAt: '2026-11-23T15:00:00.000Z',
}

function sheetPreview(overrides = {}) {
  return {
    sheets: [{ name: 'SQ QUIMICA', index: 0 }],
    sheetIndex: 0,
    meta: [
      { key: 'di', label: 'Nº DA DI', value: '26/0123456-7' },
      { key: 'cargoType', label: 'TIPO DE CARGA', value: 'FCL' },
      { key: 'receiptStatus', label: 'STATUS DO RECEBIMENTO', value: 'Sem ressalva' },
      { key: 'receivedDate', label: 'DATA RECEBIMENTO', value: '20/11/2026' },
    ],
    columns: [{ label: 'PO / PROCESSO' }, { label: 'CÓD. DBCORP' }, { label: 'OK?' }],
    rows: [
      [
        { text: 'PO 9036', kind: 'text' },
        { text: 'MO5079', kind: 'text' },
        { text: 'Sim', kind: 'bool', checked: true },
      ],
      [
        { text: 'PO 9037', kind: 'text' },
        { text: 'AD5240', kind: 'text' },
        { text: 'Não', kind: 'bool', checked: false },
      ],
    ],
    totalRows: 2,
    truncatedRows: false,
    truncatedCols: false,
    recognizedModel: true,
    ...overrides,
  }
}

function renderDialog(props = {}) {
  const onClose = vi.fn()
  const utils = render(
    <DocumentPreviewDialog open document={XLSX_DOCUMENT} processId="p1" onClose={onClose} {...props} />
  )
  return { onClose, ...utils }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDownloadProcessDocumentBlob.mockReset()
  mockReadSpreadsheetPreview.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:preview-1')
  URL.revokeObjectURL = vi.fn()
})

describe('DocumentPreviewDialog — planilha', () => {
  it('mostra "carregando" enquanto baixa e com Baixar desabilitado', async () => {
    mockDownloadProcessDocumentBlob.mockReturnValue(new Promise(() => {}))
    renderDialog()

    expect(await screen.findByRole('dialog', { name: 'Relatório de carga' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Carregando pré-visualização' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeDisabled()
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'c1')
  })

  it('renderiza subtítulo, cartões, aba, aviso, tabela e rodapé', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview())
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Relatório de carga' })
    await within(dialog).findByRole('table')

    expect(within(dialog).getByText(/FR\.CMX\.001 - RELATORIO DE CARGA\.R5\.xlsx · Excel · enviado em \d{2}\/\d{2}\/2026/)).toBeInTheDocument()
    expect(within(dialog).getByText('Nº DA DI')).toBeInTheDocument()
    expect(within(dialog).getByText('26/0123456-7')).toBeInTheDocument()
    expect(within(dialog).getByText('TIPO DE CARGA')).toBeInTheDocument()
    expect(within(dialog).getByText('Sem ressalva')).toBeInTheDocument()
    expect(within(dialog).getByText('20/11/2026')).toBeInTheDocument()
    expect(within(dialog).getByText('SQ QUIMICA')).toBeInTheDocument()
    expect(
      within(dialog).getByText(/Pré-visualização simplificada: cores, logo e fontes do modelo não aparecem aqui/)
    ).toBeInTheDocument()

    expect(within(dialog).getByRole('columnheader', { name: 'PO / PROCESSO' })).toBeInTheDocument()
    expect(within(dialog).getByRole('rowheader', { name: 'PO 9036' })).toBeInTheDocument()
    expect(within(dialog).getByRole('cell', { name: 'MO5079' })).toBeInTheDocument()
    expect(within(dialog).getByText('Sim')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Mostrando 2 de 2 linhas preenchidas · role para o lado para ver todas as colunas')
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Baixar' })).toBeEnabled()
    // "×" do cabeçalho do Modal + "Fechar" do rodapé.
    expect(within(dialog).getAllByRole('button', { name: 'Fechar' })).toHaveLength(2)
  })

  it('arquivo CSV é lido com csv: true', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['a,b']))
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview({ meta: [] }))
    renderDialog({ document: { ...XLSX_DOCUMENT, name: 'dados.csv', mimeType: 'text/csv' } })

    await screen.findByRole('table')
    expect(mockReadSpreadsheetPreview).toHaveBeenCalledWith(expect.anything(), { sheetIndex: undefined, csv: true })
  })

  it('Baixar reaproveita o blob já baixado (sem nova requisição)', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['xlsx'])
    mockDownloadProcessDocumentBlob.mockResolvedValue(blob)
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview())
    renderDialog()

    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Baixar' }))

    expect(mockSaveBlobAsFile).toHaveBeenCalledWith(blob, XLSX_DOCUMENT.name)
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledTimes(1)
  })

  it('avisa quando só as primeiras linhas/colunas são mostradas', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview({ totalRows: 2360, truncatedCols: true }))
    renderDialog()

    expect(
      await screen.findByText(
        'Mostrando 2 de 2.360 linhas preenchidas · role para o lado para ver todas as colunas · só as primeiras 30 colunas'
      )
    ).toBeInTheDocument()
  })

  it('com várias abas, trocar de aba lê a aba escolhida', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockReadSpreadsheetPreview.mockImplementation(async (_buffer, { sheetIndex } = {}) =>
      sheetPreview({
        sheets: [
          { name: 'SQ QUIMICA', index: 0 },
          { name: 'Item x Emb.', index: 1 },
        ],
        sheetIndex: sheetIndex ?? 0,
      })
    )
    renderDialog()

    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: 'SQ QUIMICA' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Item x Emb.' }))

    await waitFor(() =>
      expect(mockReadSpreadsheetPreview).toHaveBeenLastCalledWith(expect.anything(), { sheetIndex: 1, csv: false })
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Item x Emb.' })).toHaveAttribute('aria-pressed', 'true')
    )
  })

  it('planilha sem linhas preenchidas mostra mensagem e sem tabela', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview({ rows: [], totalRows: 0 }))
    renderDialog()

    expect(await screen.findByText('Esta planilha não tem linhas preenchidas.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('erro de download mostra alerta amigável e permite tentar de novo', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockRejectedValueOnce({ code: 'permission-denied' })
    mockDownloadProcessDocumentBlob.mockResolvedValueOnce(new Blob(['x']))
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview())
    renderDialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível abrir o documento. (permission-denied)')
    expect(screen.queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledTimes(2)
  })

  it('arquivo grande demais não é lido e orienta a usar Baixar', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue({ size: PREVIEW_MAX_SPREADSHEET_BYTES + 1 })
    renderDialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Arquivo grande demais para visualizar aqui. Use Baixar.')
    expect(mockReadSpreadsheetPreview).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeEnabled()
  })

  it('planilha inválida mostra alerta e mantém o Baixar habilitado', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['lixo']))
    mockReadSpreadsheetPreview.mockRejectedValue(new Error('corrompido'))
    renderDialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível ler esta planilha.')
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeEnabled()
    consoleError.mockRestore()
  })

  it('Esc e Fechar chamam onClose', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview())
    const { onClose } = renderDialog()

    await screen.findByRole('table')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getAllByRole('button', { name: 'Fechar' }).at(-1))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('DocumentPreviewDialog — PDF e imagem', () => {
  it('PDF abre em iframe e o object URL é revogado ao fechar', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['%PDF']))
    const { rerender, onClose } = renderDialog({
      document: { ...XLSX_DOCUMENT, name: 'rel.pdf', mimeType: 'application/pdf' },
    })

    const frame = await screen.findByTitle('Pré-visualização do PDF')
    expect(frame).toHaveAttribute('src', 'blob:preview-1')
    expect(mockReadSpreadsheetPreview).not.toHaveBeenCalled()

    rerender(
      <DocumentPreviewDialog
        open={false}
        document={{ ...XLSX_DOCUMENT, name: 'rel.pdf', mimeType: 'application/pdf' }}
        processId="p1"
        onClose={onClose}
      />
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  })

  it('imagem abre em <img> com alt do nome do arquivo', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['png']))
    renderDialog({ document: { ...XLSX_DOCUMENT, name: 'foto.png', mimeType: 'image/png' } })

    expect(await screen.findByRole('img', { name: 'foto.png' })).toHaveAttribute('src', 'blob:preview-1')
  })
})

describe('DocumentPreviewDialog — conteúdo não confiável e reabertura', () => {
  const MALICIOUS = '<img src=x onerror=alert(1)>'

  it('texto malicioso em célula, cabeçalho, cartão, aba e nome do arquivo vira TEXTO escapado', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockReadSpreadsheetPreview.mockResolvedValue(
      sheetPreview({
        sheets: [{ name: MALICIOUS, index: 0 }],
        meta: [{ key: 'di', label: 'Nº DA DI', value: MALICIOUS }],
        columns: [{ label: MALICIOUS }, { label: 'B' }],
        rows: [
          [
            { text: MALICIOUS, kind: 'text' },
            { text: '<script>alert(2)</script>', kind: 'text' },
          ],
        ],
      })
    )
    renderDialog({ document: { ...XLSX_DOCUMENT, name: `${MALICIOUS}.xlsx` } })

    const dialog = await screen.findByRole('dialog', { name: 'Relatório de carga' })
    await within(dialog).findByRole('table')

    // Aparece como texto literal (cabeçalho, linha, cartão, aba e subtítulo)...
    expect(within(dialog).getAllByText(MALICIOUS).length).toBeGreaterThanOrEqual(4)
    expect(within(dialog).getByText('<script>alert(2)</script>')).toBeInTheDocument()
    expect(within(dialog).getByText(`${MALICIOUS}.xlsx · Excel · enviado em 23/11/2026`)).toBeInTheDocument()
    // ... e nenhum elemento injetado entra no DOM.
    expect(document.body.querySelector('img')).toBeNull()
    expect(document.body.querySelector('script')).toBeNull()
    expect(document.body.querySelector('[onerror]')).toBeNull()
  })

  it('reabrir o diálogo não mostra a tabela do uso anterior (volta ao carregando)', async () => {
    mockDownloadProcessDocumentBlob.mockResolvedValueOnce(new Blob(['x']))
    mockReadSpreadsheetPreview.mockResolvedValue(sheetPreview())
    const { rerender, onClose } = renderDialog()
    await screen.findByRole('table')

    rerender(<DocumentPreviewDialog open={false} document={XLSX_DOCUMENT} processId="p1" onClose={onClose} />)
    mockDownloadProcessDocumentBlob.mockReturnValueOnce(new Promise(() => {}))
    rerender(<DocumentPreviewDialog open document={XLSX_DOCUMENT} processId="p1" onClose={onClose} />)

    expect(await screen.findByRole('status', { name: 'Carregando pré-visualização' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledTimes(2)
  })
})
