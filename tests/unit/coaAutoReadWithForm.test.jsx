// S11-E (requisito 5): o "Ler COAs" do formulário funciona IGUAL depois da leitura automática. Card do COA + formulário
// na mesma árvore: o arquivo já lido automaticamente vem do cache (a callable não é chamada de novo para ele) e o que
// ainda está em leitura volta como `reading` (nota "lido em outra sessão"), sem nova leitura na Tess. Tudo mockado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUploadProcessDocument = vi.fn()
const mockListDocuments = vi.fn()
const mockListCoaReads = vi.fn()
const mockReadProcessCoa = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: vi.fn().mockResolvedValue({ current: null, conference: null }),
  saveCargoReportDraft: vi.fn(),
  saveCargoReportConference: vi.fn(),
  concludeCargoReport: vi.fn(),
  retryConcludeWrite: vi.fn(),
  reopenCargoReport: vi.fn(),
  closeCargoReportConference: vi.fn(),
  retryCloseConferenceWrite: vi.fn(),
  reopenCargoReportConference: vi.fn(),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({ generateCargoReportFile: vi.fn() }))
vi.mock('../../src/services/processDocumentsRepository', () => ({
  saveBlobAsFile: vi.fn(),
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
  listProcessDocuments: (...args) => mockListDocuments(...args),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: vi.fn().mockResolvedValue({ exists: true, version: 3, itemCount: 0, items: [] }),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  getSupplierPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, entries: [], entryCount: 0, aliases: [] }),
  upsertSupplierPackagingEntry: vi.fn(),
}))
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpProcessReference: vi.fn().mockResolvedValue({ snapshot: null, hint: null, stale: false }),
}))
vi.mock('../../src/services/auditRepository', () => ({ createAuditEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../src/services/coaReadsRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listCoaReads: (...args) => mockListCoaReads(...args),
    readProcessCoa: (...args) => mockReadProcessCoa(...args),
  }
})

import { ToastProvider } from '../../src/components/Toast'
import CargoReportForm from '../../src/features/processes/CargoReportForm'
import ProcessCoaDocuments from '../../src/features/processes/ProcessCoaDocuments'
import { resetCoaAutoRead } from '../../src/features/processes/coaAutoReadQueue'
import { resetSupplierCatalogCache } from '../../src/features/processes/useCargoReportPackaging'

const ADMIN = { uid: 'admin-1', name: 'Admin Teste', email: 'admin@example.com', role: 'admin' }
const PROCESS = {
  id: 'p1',
  name: 'PROCESSO TESTE 001',
  processNumber: '4500001',
  category: 'FCL',
  supplierName: 'FORNECEDOR FICTICIO LTDA',
  items: [{ id: 'i1', commercialName: 'PRODUTO FICTICIO A', quantity: 1000 }],
}

const coaDoc = (id, name) => ({
  id,
  type: 'coaOriginal',
  slotKey: `coaOriginal:${id}`,
  name,
  mimeType: 'application/pdf',
  size: 2048,
  uploadedAt: '2026-11-26T10:00:00.000Z',
  uploadedByName: 'Admin Teste',
})
const coaRead = (documentId) => ({
  documentId,
  status: 'done',
  documentType: 'coa',
  certificates: [
    {
      page: 1,
      productName: 'PRODUTO FICTICIO A',
      productNameLocal: null,
      productAliases: [],
      batchNumber: 'LOTE-FICTICIO-1',
      poReference: null,
      quantity: { raw: '1000 KG', value: 1000, unit: 'kg', kg: 1000 },
      packaging: null,
      manufactureDate: null,
      expiryDate: null,
      expiryKind: null,
      supplierName: null,
      confidence: 'high',
      warnings: [],
    },
  ],
  warnings: [],
  validationWarnings: [],
  error: null,
})
const pdf = (name) => new File(['x'], name, { type: 'application/pdf' })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function deferred() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCoaAutoRead()
  resetSupplierCatalogCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetCoaAutoRead()
  vi.restoreAllMocks()
})

describe('Ler COAs depois da leitura automática', () => {
  it('arquivo lido automaticamente vem do cache (sem nova chamada); o que ainda lê volta como reading, sem Tess de novo', async () => {
    const docs = [coaDoc('d1', 'a.pdf'), coaDoc('d2', 'b.pdf')]
    const reads = {}
    mockListDocuments.mockResolvedValue(docs)
    mockListCoaReads.mockImplementation(async () => ({ ...reads }))
    let created = 0
    mockUploadProcessDocument.mockImplementation(async () => {
      created += 1
      return docs[created - 1]
    })
    const secondAutoRead = deferred()
    mockReadProcessCoa.mockImplementation((processId, documentId) => {
      const calls = mockReadProcessCoa.mock.calls.filter((call) => call[1] === documentId).length
      if (documentId === 'd1') {
        reads.d1 = coaRead('d1')
        return Promise.resolve({ status: 'done', cached: false, read: reads.d1 })
      }
      // d2: a leitura automática fica pendente; a chamada do "Ler COAs" recebe `reading` (a callable já garante isso).
      return calls === 1 ? secondAutoRead.promise : Promise.resolve({ status: 'reading', cached: false, read: null })
    })

    const user = userEvent.setup()
    rtlRender(
      <>
        <CargoReportForm process={PROCESS} profile={ADMIN} variant="desktop" onClose={vi.fn()} />
        <ProcessCoaDocuments documents={[]} processId="p1" profile={ADMIN} category="FCL" isDesktopVariant onChanged={vi.fn()} />
      </>,
      { wrapper: ToastProvider }
    )
    await screen.findByRole('heading', { name: /RELATÓRIO DE CARGA - / })

    await user.upload(screen.getByLabelText('Selecionar arquivos de COA Original'), [pdf('a.pdf'), pdf('b.pdf')])
    await waitFor(() => expect(mockReadProcessCoa).toHaveBeenCalledTimes(2))
    expect(mockReadProcessCoa.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ['d1', { force: false }],
      ['d2', { force: false }],
    ])

    // "Ler COAs" no formulário: d1 já está `done` (cache) e NÃO é lido de novo; d2 ainda lê -> uma consulta, volta `reading`.
    await user.click(screen.getByRole('button', { name: 'Ler COAs' }))
    const panel = await screen.findByRole('region', { name: 'Leitura dos COAs' })
    expect(mockReadProcessCoa.mock.calls.filter((call) => call[1] === 'd1')).toHaveLength(1)
    expect(mockReadProcessCoa.mock.calls.filter((call) => call[1] === 'd2')).toHaveLength(2)
    expect(within(panel).getByText('b.pdf: Este arquivo está sendo lido em outra sessão. Tente de novo em 1 minuto.')).toBeInTheDocument()
    expect(within(panel).getByRole('cell', { name: 'LOTE-FICTICIO-1' })).toBeInTheDocument()

    secondAutoRead.resolve({ status: 'done', cached: false, read: coaRead('d2') })
    await flush()
  })
})
