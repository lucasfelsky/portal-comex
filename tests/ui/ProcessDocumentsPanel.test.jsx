// F18b-2: aba "Documentos" redesenhada (design aprovado). Cobre os
// criterios (a)-(n) do PLAN.md.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

const ADMIN_PROFILE = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICS_PROFILE = { uid: 'log-1', name: 'Logística', role: 'logistica' }

const FCL_PROCESS = {
  id: 'p1',
  category: 'FCL',
  items: [
    { id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, unNumber: '1993', imoClass: '3' },
    { id: 'ITEM-2', commercialName: 'Solvente XPTO', dangerousGoods: true },
  ],
  containers: [
    { id: 'CNT-1', number: 'MSCU1234567', returnedAt: '2026-09-01' },
    { id: 'CNT-2', number: '', returnedAt: '' },
  ],
}

function docBl(overrides = {}) {
  return {
    id: 'd1',
    type: 'bl',
    slotKey: 'bl',
    name: 'bl.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    storagePath: 'processes/p1/documents/bl/1-admin-1-bl.pdf',
    uploadedAt: '2026-09-01T10:00:00.000Z',
    uploadedById: 'admin-1',
    uploadedByName: 'Admin',
    uploadedByRole: 'admin',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  firebaseConfigured = true
  mockListProcessDocuments.mockResolvedValue([])
  window.open = vi.fn(() => ({ location: {}, close: vi.fn() }))
})

describe('ProcessDocumentsPanel — Firebase nao configurado (D9)', () => {
  it('mostra o estado vazio e esconde upload', async () => {
    firebaseConfigured = false
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    expect(
      screen.getByText('Documentos disponíveis apenas com o Firebase configurado')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
  })
})

// (a) FCL admin: titulos + "Adicionar outro documento".
describe('ProcessDocumentsPanel — (a) FCL admin', () => {
  it('renderiza os titulos das secoes e o botao de adicionar outro documento', async () => {
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledWith('p1'))

    expect(screen.getByText('Documentos do processo')).toBeInTheDocument()
    expect(screen.getByText('FISPQ por item')).toBeInTheDocument()
    expect(screen.getByText('Relatório de lavação por contêiner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Adicionar outro documento/ })).toBeInTheDocument()
  })
})

// (b) item IMO sem FISPQ -> badge Pendente + Enviar FISPQ; upload usa itemId.
describe('ProcessDocumentsPanel — (b) FISPQ pendente', () => {
  it('badge Pendente + Enviar FISPQ; upload chama uploadProcessDocument com type fispq e itemId', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalled())

    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0)
    const row = screen.getByText('Resina Atlas').closest('.documents-row')
    const uploadButton = within(row).getByRole('button', { name: 'Enviar FISPQ' })
    const fileInput = row.querySelector('input[type="file"]')
    void uploadButton
    const file = new File(['conteudo'], 'fispq.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file)

    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'fispq', itemId: 'ITEM-1' })
      )
    )
  })
})

// (c) 2 conteineres (1 com returnedAt) -> Pendente + Ainda nao exigido; upload repassa containerId.
describe('ProcessDocumentsPanel — (c) lavação', () => {
  it('conteiner devolvido sem relatorio -> Pendente; conteiner nao devolvido -> Ainda não exigido', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalled())

    expect(screen.getByText('Ainda não exigido')).toBeInTheDocument()
    const uploadButton = screen.getByRole('button', { name: 'Enviar relatório' })
    const row = uploadButton.closest('.documents-row')
    const fileInput = within(row).getByDisplayValue('')
    const file = new File(['conteudo'], 'lavacao.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file)

    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'containerWash', containerId: 'CNT-1' })
      )
    )
  })
})

// (d) logistica: upload so nas linhas de lavacao; cadeado nas demais; Excluir so no proprio.
describe('ProcessDocumentsPanel — (d) logística', () => {
  it('botao de envio so nas linhas de lavacao; cadeado nas demais; Excluir so do proprio uid', async () => {
    mockListProcessDocuments.mockResolvedValue([
      docBl({ uploadedById: 'admin-1' }),
      {
        id: 'd2',
        type: 'containerWash',
        slotKey: 'containerWash:CNT-1',
        containerId: 'CNT-1',
        name: 'lavacao.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: 'processes/p1/documents/containerWash/2-log-1-lavacao.pdf',
        uploadedAt: '2026-09-02T10:00:00.000Z',
        uploadedById: 'log-1',
        uploadedByName: 'Logística',
        uploadedByRole: 'logistica',
      },
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Enviar FISPQ' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Somente o COMEX envia este documento').length).toBeGreaterThan(0)

    // Conteiner CNT-2 (sem doc, "Ainda não exigido") continua enviavel pela logistica -
    // e' o UNICO "Enviar" na tela (nenhum nas linhas de nivel-processo/FISPQ).
    expect(screen.getAllByRole('button', { name: 'Enviar' })).toHaveLength(1)

    expect(screen.getByRole('button', { name: 'Excluir lavacao.pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir bl.pdf' })).not.toBeInTheDocument()
  })
})

// (e) LCL/AEREO nao mostram lavacao; processo sem IMO nao mostra FISPQ.
describe('ProcessDocumentsPanel — (e) secoes condicionais', () => {
  it('LCL nao renderiza lavacao', async () => {
    render(
      <ProcessDocumentsPanel
        process={{ id: 'p3', category: 'LCL', containers: [] }}
        profile={ADMIN_PROFILE}
      />
    )
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalled())
    expect(screen.queryByText('Relatório de lavação por contêiner')).not.toBeInTheDocument()
  })

  it('processo sem item IMO nao renderiza FISPQ', async () => {
    render(
      <ProcessDocumentsPanel
        process={{ id: 'p4', category: 'FCL', items: [{ id: 'ITEM-1', dangerousGoods: false }] }}
        profile={ADMIN_PROFILE}
      />
    )
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalled())
    expect(screen.queryByText('FISPQ por item')).not.toBeInTheDocument()
  })
})

// (f) CONSOLIDADO: tabela PO/Invoice/Packing List, sem combobox, upload repassa po.
describe('ProcessDocumentsPanel — (f) CONSOLIDADO', () => {
  const CONSOLIDATED_PROCESS = {
    id: 'p2',
    category: 'CONSOLIDADO',
    purchaseOrders: [{ po: 'PO-1' }, { po: 'PO-2' }],
  }

  it('renderiza table com cabecalhos PO/Invoice/Packing List sem combobox; upload da PO-2 repassa po', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={CONSOLIDATED_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledWith('p2'))

    const table = screen.getByRole('table')
    expect(within(table).getByText('PO')).toBeInTheDocument()
    expect(within(table).getByText('Invoice')).toBeInTheDocument()
    expect(within(table).getByText('Packing List')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    const po2Row = within(table).getByText('PO PO-2').closest('tr')
    const invoiceCell = po2Row.querySelectorAll('td')[0]
    const uploadButton = within(invoiceCell).getByRole('button', { name: 'Enviar' })
    await user.click(uploadButton)
    const fileInput = invoiceCell.querySelector('input[type="file"]')
    const file = new File(['conteudo'], 'invoice.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file)

    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p2',
        expect.objectContaining({ type: 'invoice', po: 'PO-2' })
      )
    )
  })
})

// (g) Documentos sem vinculo: motivos "Item removido"/"Contêiner removido"/"PO removida", sem upload.
describe('ProcessDocumentsPanel — (g) documentos sem vínculo', () => {
  it('mostra motivos e nao mostra botao de envio na secao', async () => {
    mockListProcessDocuments.mockResolvedValue([
      {
        id: 'd1', type: 'fispq', slotKey: 'fispq:ITEM-999', itemId: 'ITEM-999', name: 'fispq-orfa.pdf',
        mimeType: 'application/pdf', size: 1024, storagePath: 'x', uploadedAt: '2026-09-01T10:00:00.000Z',
        uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
      {
        id: 'd2', type: 'containerWash', slotKey: 'containerWash:CNT-999', containerId: 'CNT-999', name: 'lav-orfa.pdf',
        mimeType: 'application/pdf', size: 1024, storagePath: 'y', uploadedAt: '2026-09-01T10:00:00.000Z',
        uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
      {
        id: 'd3', type: 'invoice', slotKey: 'invoice:PO-9', po: 'PO-9', name: 'invoice-orfa.pdf',
        mimeType: 'application/pdf', size: 1024, storagePath: 'z', uploadedAt: '2026-09-01T10:00:00.000Z',
        uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
    ])
    render(
      <ProcessDocumentsPanel
        process={{ id: 'p2', category: 'CONSOLIDADO', purchaseOrders: [{ po: 'PO-1' }] }}
        profile={ADMIN_PROFILE}
      />
    )
    await waitFor(() => expect(screen.getByText('Documentos sem vínculo atual')).toBeInTheDocument())

    expect(screen.getByText('Item removido')).toBeInTheDocument()
    expect(screen.getByText('Contêiner removido')).toBeInTheDocument()
    expect(screen.getByText('PO removida')).toBeInTheDocument()

    const section = screen.getByText('Documentos sem vínculo atual').closest('.detail-card')
    expect(within(section).queryByRole('button', { name: /^Enviar/ })).not.toBeInTheDocument()
  })
})

// (h) permission-denied no upload -> texto exato dentro da linha, role=alert.
describe('ProcessDocumentsPanel — (h) erro com titulo e detalhe', () => {
  it('permission-denied -> "Não foi possível enviar o documento. Você não tem permissão para esta ação."', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockRejectedValue({ code: 'permission-denied' })
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalled())

    const uploadButton = screen.getAllByRole('button', { name: 'Enviar' })[0]
    const row = uploadButton.closest('.documents-row')
    const fileInput = within(row).getByDisplayValue('')
    const file = new File(['conteudo'], 'bl.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file)

    const alert = await within(row).findByRole('alert')
    expect(alert.textContent).toBe(
      'Não foi possível enviar o documento. Você não tem permissão para esta ação.'
    )
  })
})

// (i) falha na 1a carga -> "Tentar novamente" chama listProcessDocuments de novo.
describe('ProcessDocumentsPanel — (i) erro na 1a carga', () => {
  it('mostra "Tentar novamente" e chama listProcessDocuments de novo ao clicar', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockRejectedValueOnce({ code: 'unavailable' })
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)

    const retryButton = await screen.findByRole('button', { name: 'Tentar novamente' })
    mockListProcessDocuments.mockResolvedValueOnce([])
    await user.click(retryButton)

    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledTimes(2))
  })
})

// (j) resumo "N enviados"/"N pendentes" + onPendingCountChange.
describe('ProcessDocumentsPanel — (j) resumo e contador', () => {
  it('mostra N enviados/N pendentes e chama onPendingCountChange', async () => {
    const onPendingCountChange = vi.fn()
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(
      <ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} onPendingCountChange={onPendingCountChange} />
    )
    await waitFor(() => expect(screen.getByText('1 enviado')).toBeInTheDocument())

    // 1 BL enviado; pendentes = 2 FISPQ + 1 lavacao (CNT-1 devolvido sem relatorio) = 3.
    expect(screen.getByText('3 pendentes')).toBeInTheDocument()
    await waitFor(() => expect(onPendingCountChange).toHaveBeenCalledWith(3))
  })
})

// (k) aria-label especifico dos botoes-icone.
describe('ProcessDocumentsPanel — (k) aria-label dos botoes-icone', () => {
  it('Baixar/Substituir/Excluir/Atualizar tem aria-label especifico', async () => {
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Baixar bl.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Substituir BL/AWB' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir bl.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar lista de documentos' })).toBeInTheDocument()
  })
})

// (l) "Versão anterior" com botao Baixar.
describe('ProcessDocumentsPanel — (l) versão anterior', () => {
  it('exibe principal + "Versão anterior" quando ha 2 documentos no slot', async () => {
    mockListProcessDocuments.mockResolvedValue([
      docBl({ id: 'd1', name: 'bl-v1.pdf', uploadedAt: '2026-09-01T10:00:00.000Z' }),
      docBl({ id: 'd2', name: 'bl-v2.pdf', uploadedAt: '2026-09-02T10:00:00.000Z' }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl-v2.pdf')).toBeInTheDocument())
    expect(screen.getByText('Versão anterior: bl-v1.pdf')).toBeInTheDocument()
  })
})

// (m) durante o upload, role=progressbar presente e acoes da linha desabilitadas.
describe('ProcessDocumentsPanel — (m) estado de envio', () => {
  it('mostra progressbar e desabilita as acoes da linha durante o upload', async () => {
    const user = userEvent.setup()
    let resolveUpload
    mockUploadProcessDocument.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      })
    )
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    const substituteButton = screen.getByRole('button', { name: 'Substituir BL/AWB' })
    const row = substituteButton.closest('.documents-row')
    const fileInput = within(row).getByDisplayValue('')
    const file = new File(['conteudo'], 'bl-v2.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file)

    expect(within(row).getByRole('progressbar')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Baixar bl.pdf' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: 'Substituir BL/AWB' })).toBeDisabled()

    resolveUpload(undefined)
    await waitFor(() => expect(within(row).queryByRole('progressbar')).not.toBeInTheDocument())
  })
})

// (n) sem Firebase: estado atual (ja coberto no describe dedicado acima).

describe('ProcessDocumentsPanel — excluir', () => {
  it('excluir abre ConfirmDialog', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Excluir bl.pdf' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(mockDeleteProcessDocument).not.toHaveBeenCalled()
  })
})
