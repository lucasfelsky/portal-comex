// F18a (D9): aba "Documentos" do detalhe do processo.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProcessDocumentsPanel from '../../src/features/processes/ProcessDocumentsPanel'

let firebaseConfigured = true
vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseConfigured
  },
}))

const mockListProcessDocuments = vi.fn()
const mockUploadProcessDocument = vi.fn()
const mockDeleteProcessDocument = vi.fn()
const mockGetProcessDocumentDownloadUrl = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: (...args) => mockListProcessDocuments(...args),
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
  deleteProcessDocument: (...args) => mockDeleteProcessDocument(...args),
  getProcessDocumentDownloadUrl: (...args) => mockGetProcessDocumentDownloadUrl(...args),
}))

const PROCESS = { id: 'p1', category: 'FCL' }
const ADMIN_PROFILE = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICS_PROFILE = { uid: 'log-1', name: 'Logística', role: 'logistica' }

beforeEach(() => {
  vi.clearAllMocks()
  firebaseConfigured = true
  mockListProcessDocuments.mockResolvedValue([])
  window.open = vi.fn(() => ({ location: {}, close: vi.fn() }))
})

describe('ProcessDocumentsPanel — Firebase nao configurado (D9)', () => {
  it('mostra o estado vazio e esconde upload', async () => {
    firebaseConfigured = false
    render(<ProcessDocumentsPanel process={PROCESS} profile={ADMIN_PROFILE} />)
    expect(
      screen.getByText('Documentos disponíveis apenas com o Firebase configurado')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
  })
})

describe('ProcessDocumentsPanel — admin', () => {
  it('ve "Enviar" para BL/AWB e Relatório de carga', async () => {
    render(<ProcessDocumentsPanel process={PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledWith('p1'))
    expect(screen.getAllByRole('button', { name: 'Enviar' }).length).toBeGreaterThan(0)
  })

  it('exibe principal + "Versão anterior" quando ha 2 documentos no slot', async () => {
    mockListProcessDocuments.mockResolvedValue([
      {
        id: 'd1', type: 'bl', slotKey: 'bl', name: 'bl-v1.pdf', mimeType: 'application/pdf',
        size: 1024, storagePath: 'processes/p1/documents/bl/1-admin-1-bl-v1.pdf',
        uploadedAt: '2026-09-01T10:00:00.000Z', uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
      {
        id: 'd2', type: 'bl', slotKey: 'bl', name: 'bl-v2.pdf', mimeType: 'application/pdf',
        size: 2048, storagePath: 'processes/p1/documents/bl/2-admin-1-bl-v2.pdf',
        uploadedAt: '2026-09-02T10:00:00.000Z', uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
    ])
    render(<ProcessDocumentsPanel process={PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl-v2.pdf')).toBeInTheDocument())
    expect(screen.getByText('Versão anterior')).toBeInTheDocument()
    expect(screen.getByText('bl-v1.pdf')).toBeInTheDocument()
  })

  it('erro de upload vira mensagem via buildActionErrorMessage', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockRejectedValue({ code: 'permission-denied' })
    render(<ProcessDocumentsPanel process={PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalled())

    const fileInputs = document.querySelectorAll('input[type="file"]')
    const file = new File(['conteudo'], 'bl.pdf', { type: 'application/pdf' })
    await user.upload(fileInputs[0], file)

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível enviar o documento/)).toBeInTheDocument()
    )
  })

  it('excluir abre ConfirmDialog', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      {
        id: 'd1', type: 'bl', slotKey: 'bl', name: 'bl.pdf', mimeType: 'application/pdf',
        size: 1024, storagePath: 'processes/p1/documents/bl/1-admin-1-bl.pdf',
        uploadedAt: '2026-09-01T10:00:00.000Z', uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
    ])
    render(<ProcessDocumentsPanel process={PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    await user.click(screen.getAllByRole('button', { name: 'Excluir' })[0])
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(mockDeleteProcessDocument).not.toHaveBeenCalled()
  })
})

describe('ProcessDocumentsPanel — logistica', () => {
  it('ve lista/"Baixar" mas NAO "Enviar" nos tipos de nivel-processo', async () => {
    mockListProcessDocuments.mockResolvedValue([
      {
        id: 'd1', type: 'bl', slotKey: 'bl', name: 'bl.pdf', mimeType: 'application/pdf',
        size: 1024, storagePath: 'processes/p1/documents/bl/1-admin-1-bl.pdf',
        uploadedAt: '2026-09-01T10:00:00.000Z', uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
    ])
    render(<ProcessDocumentsPanel process={PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Baixar' }).length).toBeGreaterThan(0)
  })
})

describe('ProcessDocumentsPanel — CONSOLIDADO (AD-1)', () => {
  const CONSOLIDATED_PROCESS = {
    id: 'p2',
    category: 'CONSOLIDADO',
    purchaseOrders: [{ po: 'PO-1' }, { po: 'PO-2' }],
  }

  it('agrupa invoice/packingList por PO com select de PO no envio', async () => {
    render(<ProcessDocumentsPanel process={CONSOLIDATED_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledWith('p2'))

    expect(screen.getAllByText('PO PO-1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PO PO-2').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })
})
