// F18b-2: aba "Documentos" redesenhada (design aprovado). Cobre os
// criterios (a)-(n) do PLAN.md.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const mockDownloadProcessDocumentBlob = vi.fn()
const mockSaveBlobAsFile = vi.fn()
const mockSetInvoicePackingListLink = vi.fn()
const mockRenameAdditionalDocument = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: (...args) => mockListProcessDocuments(...args),
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
  deleteProcessDocument: (...args) => mockDeleteProcessDocument(...args),
  downloadProcessDocumentBlob: (...args) => mockDownloadProcessDocumentBlob(...args),
  saveBlobAsFile: (...args) => mockSaveBlobAsFile(...args),
  setInvoicePackingListLink: (...args) => mockSetInvoicePackingListLink(...args),
  renameAdditionalDocument: (...args) => mockRenameAdditionalDocument(...args),
}))

const ADMIN_PROFILE = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICS_PROFILE = { uid: 'log-1', name: 'Logística', role: 'logistica' }
const READER_ROLES = ['tecnico', 'faturamento']

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

// Espera a 1a carga TERMINAR (nao so' a chamada do mock): sem isso, em CI
// mais lento o painel ainda esta' em "Carregando documentos" quando o
// teste consulta as linhas (falha intermitente do "(b) FISPQ pendente").
async function waitForDocumentsLoaded() {
  await waitFor(() => {
    expect(mockListProcessDocuments).toHaveBeenCalled()
    expect(screen.queryByLabelText('Carregando documentos')).not.toBeInTheDocument()
  })
}

// S7: as ações secundárias do cartão (Visualizar, Baixar do Relatório, Substituir, Renomear, versão anterior e
// Excluir) ficam no menu "Ações". Neste arquivo o painel é renderizado sem `variant`, então o menu é o ActionSheet
// do celular (role="dialog" com a lista de ações); o menu do desktop é coberto em processDocumentsDesktop.test.jsx.
function docRowOf(title) {
  return screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
}

async function openActions(user, rowElement) {
  await user.click(within(rowElement).getByRole('button', { name: /^Ações de / }))
  return within(await screen.findByRole('dialog'))
}

async function pickAction(user, rowElement, name) {
  const sheet = await openActions(user, rowElement)
  await user.click(sheet.getByRole('button', { name }))
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
    await waitForDocumentsLoaded()

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
    await waitForDocumentsLoaded()

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

describe('ProcessDocumentsPanel — lavação com devolução prevista', () => {
  it('returnedAt futuro -> subtitulo "devolução prevista para" e nao fica pendente', async () => {
    const plannedProcess = {
      ...FCL_PROCESS,
      containers: [{ id: 'CNT-1', number: 'MSCU1234567', returnedAt: '2999-01-15' }],
    }
    render(<ProcessDocumentsPanel process={plannedProcess} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    expect(screen.getByText(/devolução prevista para 15\/01\/2999/)).toBeInTheDocument()
    expect(screen.queryByText(/nenhum relatório enviado/)).not.toBeInTheDocument()
    expect(screen.getByText('Ainda não exigido')).toBeInTheDocument()
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

    // Excluir mora no menu "Ações": só a linha do próprio documento (lavação) o oferece.
    const user = userEvent.setup()
    const washSheet = await openActions(user, screen.getByText(/lavacao\.pdf/, { selector: '.documents-row__meta' }).closest('.documents-row'))
    expect(washSheet.getByRole('button', { name: 'Excluir lavacao.pdf' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    // BL do admin: a logística só baixa (botão direto) e não tem menu "Ações".
    const blRow = screen.getByText('bl.pdf').closest('.documents-row')
    expect(within(blRow).getByRole('button', { name: 'Baixar bl.pdf' })).toBeInTheDocument()
    expect(within(blRow).queryByRole('button', { name: /^Ações de / })).not.toBeInTheDocument()
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
    await waitForDocumentsLoaded()
    expect(screen.queryByText('Relatório de lavação por contêiner')).not.toBeInTheDocument()
  })

  it('processo sem item IMO nao renderiza FISPQ', async () => {
    render(
      <ProcessDocumentsPanel
        process={{ id: 'p4', category: 'FCL', items: [{ id: 'ITEM-1', dangerousGoods: false }] }}
        profile={ADMIN_PROFILE}
      />
    )
    await waitForDocumentsLoaded()
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

  it('mostra o nome do processo (Referencia da PO) no lugar do numero, com a PO embaixo', async () => {
    render(
      <ProcessDocumentsPanel
        process={{ ...CONSOLIDATED_PROCESS, purchaseOrders: [{ po: '5093', reference: 'BLUESKY SEA 003-26' }, { po: 'PO-2' }, { po: 'PO-12345', reference: 'GOOYER SEA 158-26' }] }}
        profile={ADMIN_PROFILE}
      />
    )
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledWith('p2'))
    const table = screen.getByRole('table')
    const header = within(table).getByText('BLUESKY SEA 003-26').closest('th')
    expect(header).toHaveAttribute('scope', 'row')
    expect(within(header).getByText('PO 5093')).toBeInTheDocument()
    expect(within(table).getByText('PO-2', { selector: 'th' })).toBeInTheDocument()
    // sem prefixo duplicado quando a PO ja' vem como 'PO-...'
    const prefixed = within(table).getByText('GOOYER SEA 158-26').closest('th')
    expect(within(prefixed).getByText('PO-12345')).toBeInTheDocument()
    expect(within(prefixed).queryByText('PO PO-12345')).not.toBeInTheDocument()
  })

  // `tecnico`/`faturamento` veem o nome do processo, mas a Referencia da PO segue restrita a admin/logistica.
  // Hoje o painel deles e' somente-leitura (sem tabela por PO); o teste trava o vazamento caso isso mude.
  it.each(['tecnico', 'faturamento'])('Referencia da PO NAO aparece para %s', async (role) => {
    render(
      <ProcessDocumentsPanel
        process={{ ...CONSOLIDATED_PROCESS, purchaseOrders: [{ po: '5093', reference: 'BLUESKY SEA 003-26' }, { po: 'PO-2' }] }}
        profile={{ uid: `${role}-1`, name: 'Teste', role }}
      />
    )
    await waitForDocumentsLoaded()
    expect(screen.queryByText('BLUESKY SEA 003-26')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('BLUESKY SEA 003-26')
  })

  it('Referencia da PO aparece para logistica (tabela por PO)', async () => {
    render(
      <ProcessDocumentsPanel
        process={{ ...CONSOLIDATED_PROCESS, purchaseOrders: [{ po: '5093', reference: 'BLUESKY SEA 003-26' }, { po: 'PO-2' }] }}
        profile={LOGISTICS_PROFILE}
      />
    )
    await waitForDocumentsLoaded()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('BLUESKY SEA 003-26')).toBeInTheDocument()
  })

  it('renderiza table com cabecalhos PO/Invoice/Packing List sem combobox; upload da PO-2 repassa po', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={CONSOLIDATED_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledWith('p2'))

    const table = screen.getByRole('table')
    expect(within(table).getByText('Processo', { selector: 'th' })).toBeInTheDocument()
    expect(within(table).getByText('Invoice')).toBeInTheDocument()
    expect(within(table).getByText('Packing List')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    const po2Row = within(table).getByText('PO-2', { selector: 'th' }).closest('tr')
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

    const section = screen.getByText('Documentos sem vínculo atual').closest('.documents-section')
    expect(within(section).queryByRole('button', { name: /^Enviar/ })).not.toBeInTheDocument()
  })
})

// (h) permission-denied no upload -> texto exato dentro da linha, role=alert.
describe('ProcessDocumentsPanel — (h) erro com titulo e detalhe', () => {
  it('permission-denied -> "Não foi possível enviar o documento. Você não tem permissão para esta ação."', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockRejectedValue({ code: 'permission-denied' })
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

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
  it('Baixar (direto), Ações, Substituir/Excluir (no menu) e Atualizar tem aria-label especifico', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    const row = docRowOf('BL/AWB')
    expect(within(row).getByRole('button', { name: 'Baixar bl.pdf' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Ações de BL/AWB' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('button', { name: 'Substituir BL/AWB' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir bl.pdf' })).not.toBeInTheDocument()

    const sheet = await openActions(user, row)
    expect(sheet.getByRole('button', { name: 'Substituir BL/AWB' })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Excluir bl.pdf' })).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'Baixar bl.pdf' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Atualizar lista de documentos' })).toBeInTheDocument()
  })
})

// (l) "Versão anterior" com botao Baixar.
describe('ProcessDocumentsPanel — (l) versão anterior', () => {
  it('S7: a versão anterior sai do corpo do cartão e vira o item "Baixar versão anterior" do menu, com tamanho e data', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      docBl({ id: 'd1', name: 'bl-v1.pdf', size: 2048, uploadedAt: '2026-09-01T10:00:00.000Z' }),
      docBl({ id: 'd2', name: 'bl-v2.pdf', uploadedAt: '2026-09-02T10:00:00.000Z' }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl-v2.pdf')).toBeInTheDocument())

    expect(screen.queryByText(/Versão anterior: bl-v1\.pdf/)).not.toBeInTheDocument()
    expect(document.querySelector('.documents-row__previous')).toBeNull()
    const sheet = await openActions(user, docRowOf('BL/AWB'))
    const previous = sheet.getByRole('button', { name: 'Baixar versão anterior: bl-v1.pdf' })
    expect(previous).toHaveTextContent('Baixar versão anterior')
    expect(previous).toHaveTextContent('2 KB')
    expect(previous).toHaveTextContent('01/09/2026')
  })
})

// L38: download autenticado (blob via Cloud Function).
describe('ProcessDocumentsPanel — download autenticado (L38)', () => {
  it('Baixar chama downloadProcessDocumentBlob + saveBlobAsFile; durante a espera desabilita e anuncia', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['PDF'])
    let resolveDownload
    mockDownloadProcessDocumentBlob.mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve
      })
    )
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    const button = screen.getByRole('button', { name: 'Baixar bl.pdf' })
    await user.click(button)

    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'd1')
    expect(screen.getByRole('button', { name: 'Baixar bl.pdf' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Baixar bl.pdf' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Baixando bl.pdf…')).toBeInTheDocument()

    resolveDownload(blob)
    await waitFor(() => expect(mockSaveBlobAsFile).toHaveBeenCalledWith(blob, 'bl.pdf'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Baixar bl.pdf' })).toBeEnabled())
    expect(screen.getByText('Download concluído.')).toBeInTheDocument()
  })

  it('permission-denied -> alert com titulo e detalhe', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockRejectedValue({ code: 'permission-denied' })
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl.pdf')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Baixar bl.pdf' }))

    const row = screen.getByRole('button', { name: 'Baixar bl.pdf' }).closest('.documents-row')
    const alert = await within(row).findByRole('alert')
    expect(alert.textContent).toBe(
      'Não foi possível baixar o documento. Você não tem permissão para esta ação.'
    )
    expect(mockSaveBlobAsFile).not.toHaveBeenCalled()
  })

  it('Baixar da versão anterior baixa o documento anterior', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['PDF'])
    mockDownloadProcessDocumentBlob.mockResolvedValue(blob)
    mockListProcessDocuments.mockResolvedValue([
      docBl({ id: 'd1', name: 'bl-v1.pdf', uploadedAt: '2026-09-01T10:00:00.000Z' }),
      docBl({ id: 'd2', name: 'bl-v2.pdf', uploadedAt: '2026-09-02T10:00:00.000Z' }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('bl-v2.pdf')).toBeInTheDocument())

    await pickAction(user, docRowOf('BL/AWB'), 'Baixar versão anterior: bl-v1.pdf')

    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'd1')
    await waitFor(() => expect(mockSaveBlobAsFile).toHaveBeenCalledWith(blob, 'bl-v1.pdf'))
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

    const row = docRowOf('BL/AWB')
    const fileInput = within(row).getByDisplayValue('')
    const file = new File(['conteudo'], 'bl-v2.pdf', { type: 'application/pdf' })
    await user.upload(fileInput, file)

    expect(within(row).getByRole('progressbar')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Baixar bl.pdf' })).toBeDisabled()
    // O menu "Ações" segue disponível, mas Substituir e Excluir ficam desabilitados durante o envio.
    const sheet = await openActions(user, row)
    expect(sheet.getByRole('button', { name: 'Substituir BL/AWB' })).toBeDisabled()
    expect(sheet.getByRole('button', { name: 'Excluir bl.pdf' })).toBeDisabled()
    await user.keyboard('{Escape}')

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

    await pickAction(user, docRowOf('BL/AWB'), 'Excluir bl.pdf')
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(mockDeleteProcessDocument).not.toHaveBeenCalled()
  })
})

// Embarque confirmado: BL/Relatorio de carga/Invoice/Packing List sem arquivo
// viram pendencia (linha "Pendente" + resumo "N pendentes").
describe('ProcessDocumentsPanel — embarque confirmado gera pendências', () => {
  const SHIPPED_FCL = { ...FCL_PROCESS, shippedAt: '2026-09-01' }

  function rowOf(title) {
    return screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
  }

  it('FCL embarcado com só o BL: Relatório de carga/Invoice/Packing List "Pendente"; resumo 6 pendentes', async () => {
    const onPendingCountChange = vi.fn()
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(
      <ProcessDocumentsPanel process={SHIPPED_FCL} profile={ADMIN_PROFILE} onPendingCountChange={onPendingCountChange} />
    )
    await waitFor(() => expect(screen.getByText('1 enviado')).toBeInTheDocument())

    // 2 FISPQ + 1 lavacao + 3 documentos de embarque (BL enviado).
    expect(screen.getByText('6 pendentes')).toBeInTheDocument()
    await waitFor(() => expect(onPendingCountChange).toHaveBeenCalledWith(6))
    for (const title of ['Relatório de carga', 'Invoice', 'Packing List']) {
      expect(within(rowOf(title)).getByText('Pendente')).toBeInTheDocument()
    }
    expect(within(rowOf('BL/AWB')).queryByText('Pendente')).not.toBeInTheDocument()
  })

  it('não publica a contagem enquanto a lista carrega nem se a 1ª carga falha', async () => {
    const onPendingCountChange = vi.fn()
    mockListProcessDocuments.mockReturnValueOnce(new Promise(() => {}))
    const { unmount } = render(
      <ProcessDocumentsPanel process={SHIPPED_FCL} profile={ADMIN_PROFILE} onPendingCountChange={onPendingCountChange} />
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onPendingCountChange).not.toHaveBeenCalled()
    unmount()

    mockListProcessDocuments.mockRejectedValueOnce({ code: 'unavailable' })
    render(
      <ProcessDocumentsPanel process={SHIPPED_FCL} profile={ADMIN_PROFILE} onPendingCountChange={onPendingCountChange} />
    )
    await waitFor(() => expect(screen.getByText('Tentar novamente')).toBeInTheDocument())
    expect(onPendingCountChange).not.toHaveBeenCalled()
  })

  it('mesmo processo sem shippedAt: resumo 3 pendentes e linhas "Não enviado"', async () => {
    mockListProcessDocuments.mockResolvedValue([docBl()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('1 enviado')).toBeInTheDocument())

    expect(screen.getByText('3 pendentes')).toBeInTheDocument()
    expect(within(rowOf('Invoice')).getByText('Não enviado')).toBeInTheDocument()
  })

  it('embarcado com ZERO documentos: mostra o selo "N pendentes" e as linhas "Pendente"', async () => {
    render(
      <ProcessDocumentsPanel process={{ id: 'p5', category: 'LCL', shippedAt: '2026-09-01' }} profile={ADMIN_PROFILE} />
    )
    await waitFor(() => expect(screen.getByText('4 pendentes')).toBeInTheDocument())

    expect(screen.getByText('4 pendentes')).toHaveClass('inline-badge--warn')
    for (const title of ['BL/AWB', 'Relatório de carga', 'Invoice', 'Packing List']) {
      expect(within(rowOf(title)).getByText('Pendente')).toBeInTheDocument()
    }
  })

  it('sem documentos e sem pendência: mantém "Nenhum documento ainda" sem selo de pendentes', async () => {
    render(<ProcessDocumentsPanel process={{ id: 'p6', category: 'LCL' }} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(screen.getByText('Nenhum documento ainda')).toBeInTheDocument())

    expect(screen.queryByText(/pendente/)).not.toBeInTheDocument()
  })

  it('CONSOLIDADO embarcado sem documentos: 4 células "Pendente" na tabela por PO', async () => {
    render(
      <ProcessDocumentsPanel
        process={{ id: 'p7', category: 'CONSOLIDADO', shippedAt: '2026-09-01', purchaseOrders: [{ po: 'PO-1' }, { po: 'PO-2' }] }}
        profile={ADMIN_PROFILE}
      />
    )
    const table = await screen.findByRole('table')
    expect(within(table).getAllByText('Pendente')).toHaveLength(4)
    // 2 (BL/Relatorio de carga) + 4 (Invoice/Packing por PO)
    expect(screen.getByText('6 pendentes')).toBeInTheDocument()
  })
})

// Nome do documento adicional ("Outro").
describe('ProcessDocumentsPanel — nome do documento adicional', () => {
  const OTHER_PROCESS = { id: 'p1', category: 'LCL' }

  function otherFileInput(container) {
    return container.querySelector('.documents-add-other-row input[type="file"]')
  }

  it('envia o nome digitado como description e limpa o campo após sucesso', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const nameInput = screen.getByLabelText('Nome do documento (opcional)')
    await user.type(nameInput, '  Certificado de análise  ')
    await user.upload(otherFileInput(container), new File(['x'], 'cert.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'other', description: 'Certificado de análise' })
      )
    )
    await waitFor(() => expect(screen.getByLabelText('Nome do documento (opcional)')).toHaveValue(''))
  })

  it('campo vazio (só espaços) -> "Documento adicional"', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await user.type(screen.getByLabelText('Nome do documento (opcional)'), '   ')
    await user.upload(otherFileInput(container), new File(['x'], 'a.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'other', description: 'Documento adicional' })
      )
    )
  })

  it('erro no envio mantém o texto digitado', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockRejectedValue({ code: 'permission-denied' })
    const { container } = render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await user.type(screen.getByLabelText('Nome do documento (opcional)'), 'Laudo')
    await user.upload(otherFileInput(container), new File(['x'], 'a.pdf', { type: 'application/pdf' }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Nome do documento (opcional)')).toHaveValue('Laudo')
  })

  it('o campo limita a 80 caracteres', async () => {
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    expect(screen.getByLabelText('Nome do documento (opcional)')).toHaveAttribute('maxlength', '80')
  })

  it('logística não vê o campo', async () => {
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitForDocumentsLoaded()
    expect(screen.queryByLabelText('Nome do documento (opcional)')).not.toBeInTheDocument()
  })

  it('documento "other" exibe o nome como título e "Outro" no início da meta', async () => {
    mockListProcessDocuments.mockResolvedValue([
      {
        id: 'o1', type: 'other', slotKey: 'other:o1', description: 'Certificado', name: 'cert.pdf',
        mimeType: 'application/pdf', size: 1024, storagePath: 'x', uploadedAt: '2026-09-01T10:00:00.000Z',
        uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      },
    ])
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const title = await screen.findByText('Certificado', { selector: '.documents-row__label' })
    const meta = title.closest('.documents-row').querySelector('.documents-row__meta')
    expect(meta.textContent.startsWith('Outro · PDF')).toBe(true)
  })
})

// Renomear o documento adicional ("Outro") depois de anexado: so' admin, so'
// o nome exibido (description).
describe('ProcessDocumentsPanel — renomear documento adicional', () => {
  const OTHER_PROCESS = { id: 'p1', category: 'LCL' }
  const CONSOLIDATED = { id: 'p2', category: 'CONSOLIDADO', purchaseOrders: [{ po: 'PO-1' }] }

  function docOther(overrides = {}) {
    return {
      id: 'o1', type: 'other', slotKey: 'other:o1', description: 'Certificado', name: 'cert.pdf',
      mimeType: 'application/pdf', size: 1024, storagePath: 'x', uploadedAt: '2026-09-01T10:00:00.000Z',
      uploadedById: 'admin-1', uploadedByName: 'Admin', uploadedByRole: 'admin',
      ...overrides,
    }
  }

  async function openRenameDialog(user, label = 'Certificado') {
    const title = await screen.findByText(label, { selector: '.documents-row__label' })
    await pickAction(user, title.closest('.documents-row'), `Renomear ${label}`)
    const dialog = await screen.findByRole('dialog', { name: 'Renomear documento' })
    return { dialog, input: within(dialog).getByLabelText('Nome do documento') }
  }

  beforeEach(() => {
    mockListProcessDocuments.mockResolvedValue([docBl(), docOther()])
  })

  it('(r1) admin ve "Renomear" so na linha do documento adicional', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const certificate = (await screen.findByText('Certificado', { selector: '.documents-row__label' })).closest('.documents-row')
    const sheet = await openActions(user, certificate)
    expect(sheet.getAllByRole('button', { name: /^Renomear/ })).toHaveLength(1)
    expect(sheet.getByRole('button', { name: 'Renomear Certificado' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    // A linha do BL tem o menu "Ações", mas sem "Renomear".
    const blSheet = await openActions(user, docRowOf('BL/AWB'))
    expect(blSheet.queryByRole('button', { name: /^Renomear/ })).not.toBeInTheDocument()
    expect(blSheet.getByRole('button', { name: 'Excluir bl.pdf' })).toBeInTheDocument()
  })

  it('(r2) clicar abre o dialogo com o nome atual, maxlength 80 e foco no campo', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { input } = await openRenameDialog(user)
    expect(input).toHaveValue('Certificado')
    expect(input).toHaveAttribute('maxlength', '80')
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('(r3) Enter salva o nome aparado, fecha o dialogo e recarrega a lista', async () => {
    const user = userEvent.setup()
    mockRenameAdditionalDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { input } = await openRenameDialog(user)

    await user.clear(input)
    await user.type(input, '  Laudo técnico  {Enter}')

    await waitFor(() =>
      expect(mockRenameAdditionalDocument).toHaveBeenCalledWith('p1', 'o1', 'Laudo técnico', { uid: 'admin-1' })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledTimes(2))
  })

  it('(r4) so espacos + Salvar: mostra o erro de validacao e nao chama o repositorio', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { dialog, input } = await openRenameDialog(user)

    await user.clear(input)
    await user.type(input, '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe o nome do documento.')
    expect(mockRenameAdditionalDocument).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Renomear documento' })).toBeInTheDocument()
  })

  it('(r5) Esc cancela sem salvar e devolve o foco ao botao "Ações" da linha (de onde o Renomear saiu)', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    await openRenameDialog(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRenameAdditionalDocument).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ações de Certificado' })).toHaveFocus())
  })

  it('(r6) Cancelar fecha sem salvar', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { dialog } = await openRenameDialog(user)

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRenameAdditionalDocument).not.toHaveBeenCalled()
  })

  it('(r7) erro do servidor: mostra a mensagem amigavel, mantem o dialogo aberto e o texto', async () => {
    const user = userEvent.setup()
    mockRenameAdditionalDocument.mockRejectedValue({ code: 'permission-denied' })
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { dialog, input } = await openRenameDialog(user)

    await user.clear(input)
    await user.type(input, 'Laudo{Enter}')

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível renomear o documento.')
    expect(alert).toHaveTextContent('Você não tem permissão para esta ação.')
    expect(screen.getByRole('dialog', { name: 'Renomear documento' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nome do documento')).toHaveValue('Laudo')
  })

  it('(r8) nome igual ao atual: fecha sem escrever', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { input } = await openRenameDialog(user)

    await user.type(input, '{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRenameAdditionalDocument).not.toHaveBeenCalled()
    expect(mockListProcessDocuments).toHaveBeenCalledTimes(1)
  })

  it('(r9) logistica ve o documento adicional mas nao ve "Renomear" (nem o menu "Ações", sem nenhuma ação a oferecer)', async () => {
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={LOGISTICS_PROFILE} />)
    const certificate = (await screen.findByText('Certificado', { selector: '.documents-row__label' })).closest('.documents-row')
    expect(within(certificate).queryByRole('button', { name: /^Ações de / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Renomear/ })).not.toBeInTheDocument()
  })

  it('(r10) CONSOLIDADO: admin tambem ve "Renomear" no documento adicional', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={CONSOLIDATED} profile={ADMIN_PROFILE} />)
    const certificate = (await screen.findByText('Certificado', { selector: '.documents-row__label' })).closest('.documents-row')
    const sheet = await openActions(user, certificate)
    expect(sheet.getAllByRole('button', { name: /^Renomear/ })).toHaveLength(1)
    expect(sheet.getByRole('button', { name: 'Renomear Certificado' })).toBeInTheDocument()
  })

  it('(r11) salvando: botoes desabilitados e Esc nao fecha ate concluir', async () => {
    const user = userEvent.setup()
    let finish
    mockRenameAdditionalDocument.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { dialog, input } = await openRenameDialog(user)

    await user.clear(input)
    await user.type(input, 'Laudo{Enter}')

    const saving = await within(dialog).findByRole('button', { name: 'Salvando…' })
    expect(saving).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Renomear documento' })).toBeInTheDocument()

    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('(r12) erro ao salvar recarrega a lista; documento ainda existe -> dialogo segue aberto com o erro', async () => {
    const user = userEvent.setup()
    mockRenameAdditionalDocument.mockRejectedValue({ code: 'permission-denied' })
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { dialog, input } = await openRenameDialog(user)

    await user.clear(input)
    await user.type(input, 'Laudo{Enter}')

    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByLabelText('Carregando documentos')).not.toBeInTheDocument())
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível renomear o documento.')
    expect(within(dialog).getByLabelText('Nome do documento')).toHaveValue('Laudo')
    expect(screen.getByRole('dialog', { name: 'Renomear documento' })).toBeInTheDocument()
  })

  it('(r13) documento excluido por outro admin com o dialogo aberto: recarrega, fecha o dialogo e some a linha', async () => {
    const user = userEvent.setup()
    // Firestore devolve permission-denied (nao not-found) em updateDoc de doc inexistente.
    mockRenameAdditionalDocument.mockRejectedValue({ code: 'permission-denied' })
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { input } = await openRenameDialog(user)
    expect(screen.getByText('Certificado', { selector: '.documents-row__label' })).toBeInTheDocument()

    // Outro admin excluiu o documento: a recarga ja nao o traz.
    mockListProcessDocuments.mockResolvedValue([docBl()])
    await user.clear(input)
    await user.type(input, 'Laudo{Enter}')

    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('Certificado', { selector: '.documents-row__label' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Renomear/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ações de Certificado' })).not.toBeInTheDocument()
    expect(document.querySelector('.documents-live')).toHaveTextContent('O documento foi removido.')
  })

  // Nome atual com 81-120 caracteres e' valido pela rule (paridade com o create), mas
  // passa do limite da UI (80): o dialogo nunca pode corta-lo em silencio.
  const LONG_NAME = 'Certificado de análise ' + 'x'.repeat(77)

  it('(r14) nome atual mais longo que o limite da UI + Enter sem editar: fecha sem escrever nem cortar', async () => {
    const user = userEvent.setup()
    expect(LONG_NAME.length).toBe(100)
    mockListProcessDocuments.mockResolvedValue([docBl(), docOther({ description: LONG_NAME })])
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { dialog, input } = await openRenameDialog(user, LONG_NAME)
    expect(input).toHaveValue(LONG_NAME)

    await user.type(input, '{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRenameAdditionalDocument).not.toHaveBeenCalled()
  })

  it('(r15) nome atual mais longo editado e ainda acima do limite: erro de validacao, sem cortar nem escrever', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docBl(), docOther({ description: LONG_NAME })])
    render(<ProcessDocumentsPanel process={OTHER_PROCESS} profile={ADMIN_PROFILE} />)
    const { dialog, input } = await openRenameDialog(user, LONG_NAME)

    await user.type(input, '{Backspace}')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Use no máximo 80 caracteres.')
    expect(input).toHaveValue(LONG_NAME.slice(0, -1))
    expect(mockRenameAdditionalDocument).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Renomear documento' })).toBeInTheDocument()
  })
})

describe('ProcessDocumentsPanel — arrastar e soltar', () => {
  const CONSOLIDATED = { id: 'p2', category: 'CONSOLIDADO', purchaseOrders: [{ po: 'PO-1' }, { po: 'PO-2' }] }
  const pdf = (name = 'a.pdf') => new File(['x'], name, { type: 'application/pdf' })
  const dt = (files) => ({ dataTransfer: { files, types: ['Files'] } })
  const blGroup = () => screen.getByText('BL/AWB', { selector: '.documents-row__label' }).closest('.documents-row-group')

  it('(a) admin solta arquivo no BL e envia type bl', async () => {
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    const file = pdf('bl.pdf')
    fireEvent.drop(blGroup(), dt([file]))
    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'bl', file }))
    )
  })

  it('(b) 2 arquivos: avisa e nao envia', async () => {
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    fireEvent.drop(blGroup(), dt([pdf('1.pdf'), pdf('2.pdf')]))
    expect(await screen.findByText('Solte apenas um arquivo por vez.')).toBeInTheDocument()
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('(c) logística: sem drop no BL; drop na lavação envia containerWash', async () => {
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitForDocumentsLoaded()
    const bl = blGroup()
    fireEvent.dragOver(bl, dt([]))
    expect(bl).not.toHaveClass('documents-drop-active')
    fireEvent.drop(bl, dt([pdf()]))
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()

    const washGroup = screen.getAllByRole('button', { name: 'Enviar' })[0].closest('.documents-row-group')
    fireEvent.drop(washGroup, dt([pdf('lav.pdf')]))
    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'containerWash' }))
    )
  })

  it('(d) drop em "Adicionar outro" usa o nome digitado', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = render(<ProcessDocumentsPanel process={{ id: 'p1', category: 'LCL' }} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    await user.type(screen.getByLabelText('Nome do documento (opcional)'), 'Laudo')
    fireEvent.drop(container.querySelector('.documents-add-other-row'), dt([pdf()]))
    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'other', description: 'Laudo' })
      )
    )
  })

  it('(e) CONSOLIDADO: drop na célula Invoice da PO-2 envia po', async () => {
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={CONSOLIDATED} profile={ADMIN_PROFILE} />)
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledWith('p2'))
    const table = screen.getByRole('table')
    const po2Row = within(table).getByText('PO-2', { selector: 'th' }).closest('tr')
    fireEvent.drop(po2Row.querySelectorAll('td')[0], dt([pdf('inv.pdf')]))
    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p2',
        expect.objectContaining({ type: 'invoice', po: 'PO-2' })
      )
    )
  })

  it('(f) dragOver destaca e dragLeave remove', async () => {
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    const bl = blGroup()
    fireEvent.dragOver(bl, dt([]))
    expect(bl).toHaveClass('documents-drop-active')
    fireEvent.dragLeave(bl, { relatedTarget: document.body })
    expect(bl).not.toHaveClass('documents-drop-active')
  })

  it('(g) drop no container do painel é cancelado (defaultPrevented)', async () => {
    const { container } = render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    expect(fireEvent.drop(container.querySelector('.documents-panel'), dt([pdf()]))).toBe(false)
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })
})

describe('ProcessDocumentsPanel — Invoice contém Packing List', () => {
  const CHECKBOX = 'Este arquivo também contém o Packing List'
  const docInvoice = (overrides = {}) =>
    docBl({
      id: 'inv1',
      type: 'invoice',
      slotKey: 'invoice',
      name: 'inv.pdf',
      storagePath: 'processes/p1/documents/invoice/1-admin-1-inv.pdf',
      ...overrides,
    })
  const docPacking = (overrides = {}) =>
    docBl({
      id: 'pl1',
      type: 'packingList',
      slotKey: 'packingList',
      name: 'pl.pdf',
      storagePath: 'processes/p1/documents/packingList/1-admin-1-pl.pdf',
      ...overrides,
    })
  const rowOf = (title) =>
    screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')

  it('(a2) trocar de processo no mesmo painel descarta a marcacao nao salva', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    await user.click(screen.getByLabelText(CHECKBOX))
    expect(screen.getByLabelText(CHECKBOX)).toBeChecked()

    rerender(<ProcessDocumentsPanel process={{ ...FCL_PROCESS, id: 'p9' }} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    expect(screen.getByLabelText(CHECKBOX)).not.toBeChecked()
  })

  it('(a) FCL sem docs: marcar o checkbox e enviar a Invoice grava alsoPackingList: true', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await user.click(screen.getByLabelText(CHECKBOX))
    expect(mockSetInvoicePackingListLink).not.toHaveBeenCalled()
    const file = new File(['x'], 'inv.pdf', { type: 'application/pdf' })
    await user.upload(rowOf('Invoice').querySelector('input[type="file"]'), file)

    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'invoice', alsoPackingList: true })
      )
    )
  })

  it('(a2) sem marcar: envia alsoPackingList: false; o BL nunca leva o campo', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const file = new File(['x'], 'inv.pdf', { type: 'application/pdf' })
    await user.upload(rowOf('Invoice').querySelector('input[type="file"]'), file)
    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'invoice', alsoPackingList: false })
      )
    )
    await user.upload(rowOf('BL/AWB').querySelector('input[type="file"]'), file)
    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2))
    expect(mockUploadProcessDocument.mock.calls[1][1]).not.toHaveProperty('alsoPackingList')
  })

  it('(b) Invoice marcada: PL "Incluído na Invoice"; Baixar usa o id da Invoice; Separar desfaz o vínculo', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['PDF']))
    mockSetInvoicePackingListLink.mockResolvedValue(undefined)
    mockListProcessDocuments.mockResolvedValue([docInvoice({ alsoPackingList: true })])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const packingRow = rowOf('Packing List')
    expect(within(packingRow).getByText('Incluído na Invoice')).toBeInTheDocument()
    expect(within(packingRow).getByText('No mesmo arquivo da Invoice: inv.pdf')).toBeInTheDocument()
    expect(within(packingRow).queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(within(packingRow).queryByText('Somente o COMEX envia este documento')).not.toBeInTheDocument()

    await user.click(within(packingRow).getByRole('button', { name: 'Baixar inv.pdf' }))
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'inv1')

    await user.click(within(packingRow).getByRole('button', { name: 'Separar Packing List da Invoice' }))
    expect(mockSetInvoicePackingListLink).toHaveBeenCalledWith('p1', 'inv1', false, { uid: 'admin-1' })
  })

  it('(b2) desmarcar o checkbox da Invoice enviada grava o vínculo; erro aparece na linha', async () => {
    const user = userEvent.setup()
    mockSetInvoicePackingListLink.mockRejectedValueOnce({ code: 'permission-denied' })
    mockListProcessDocuments.mockResolvedValue([docInvoice({ alsoPackingList: true })])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const checkbox = screen.getByLabelText(CHECKBOX)
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    expect(mockSetInvoicePackingListLink).toHaveBeenCalledWith('p1', 'inv1', false, { uid: 'admin-1' })
    expect(
      await within(rowOf('Invoice')).findByText('Não foi possível atualizar o vínculo com o Packing List.')
    ).toBeInTheDocument()
  })

  it('(c) PL com arquivo próprio: checkbox desabilitado + aviso; Invoice marcada não esconde o arquivo próprio', async () => {
    mockListProcessDocuments.mockResolvedValue([docInvoice(), docPacking()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    expect(screen.getByLabelText(CHECKBOX)).toBeDisabled()
    expect(screen.getByText('O Packing List já tem arquivo próprio.')).toBeInTheDocument()
    expect(within(rowOf('Packing List')).queryByText('Incluído na Invoice')).not.toBeInTheDocument()
  })

  it('(d) embarcado com BL + Relatório + Invoice marcada: 4 enviados, 0 pendentes', async () => {
    const onPendingCountChange = vi.fn()
    mockListProcessDocuments.mockResolvedValue([
      docBl(),
      docBl({ id: 'c1', type: 'cargoReport', slotKey: 'cargoReport', name: 'rel.pdf' }),
      docInvoice({ alsoPackingList: true }),
    ])
    render(
      <ProcessDocumentsPanel
        process={{ id: 'p1', category: 'LCL', shippedAt: '2026-09-01' }}
        profile={ADMIN_PROFILE}
        onPendingCountChange={onPendingCountChange}
      />
    )
    await waitFor(() => expect(screen.getByText('4 enviados')).toBeInTheDocument())
    expect(screen.queryByText(/pendente/)).not.toBeInTheDocument()
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(0))
  })

  it('(e) CONSOLIDADO: célula PL da PO-1 "Incluído na Invoice" e o badge desconta', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['PDF']))
    mockSetInvoicePackingListLink.mockResolvedValue(undefined)
    mockListProcessDocuments.mockResolvedValue([
      docInvoice({ id: 'invPO1', slotKey: 'invoice:PO-1', poNumber: 'PO-1', alsoPackingList: true }),
    ])
    render(
      <ProcessDocumentsPanel
        process={{ id: 'p2', category: 'CONSOLIDADO', purchaseOrders: [{ po: 'PO-1' }, { po: 'PO-2' }] }}
        profile={ADMIN_PROFILE}
      />
    )
    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getByText('Incluído na Invoice')).toBeInTheDocument())
    expect(within(table).getAllByText('Incluído na Invoice')).toHaveLength(1)
    // PO-1: Invoice enviada + PL coberto; PO-2: 2 faltando.
    expect(screen.getByText('2 de 4 faltando')).toBeInTheDocument()

    const po1Row = within(table).getByText('PO-1', { selector: 'th' }).closest('tr')
    const packingCell = po1Row.querySelectorAll('td')[1]
    await user.click(within(packingCell).getByRole('button', { name: 'Baixar inv.pdf' }))
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p2', 'invPO1')
    await user.click(within(packingCell).getByRole('button', { name: 'Separar Packing List da Invoice da PO PO-1' }))
    expect(mockSetInvoicePackingListLink).toHaveBeenCalledWith('p2', 'invPO1', false, { uid: 'admin-1' })

    // checkbox por PO: so a PO-1 esta marcada.
    expect(screen.getByLabelText('Este arquivo também contém o Packing List da PO PO-1')).toBeChecked()
    expect(screen.getByLabelText('Este arquivo também contém o Packing List da PO PO-2')).not.toBeChecked()
  })

  it('(f) excluir a Invoice atual com anterior marcada desfaz o vínculo no MESMO batch da exclusão', async () => {
    const user = userEvent.setup()
    mockSetInvoicePackingListLink.mockResolvedValue(undefined)
    mockDeleteProcessDocument.mockResolvedValue(undefined)
    mockListProcessDocuments.mockResolvedValue([
      docInvoice({ id: 'old', name: 'old.pdf', alsoPackingList: true, uploadedAt: '2026-09-01T10:00:00.000Z' }),
      docInvoice({ id: 'new', name: 'new.pdf', uploadedAt: '2026-09-02T10:00:00.000Z' }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await pickAction(user, docRowOf('Invoice'), 'Excluir new.pdf')
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() =>
      expect(mockDeleteProcessDocument).toHaveBeenCalledWith('p1', 'new', {
        unlinkPreviousId: 'old',
        actor: { uid: 'admin-1' },
      })
    )
    expect(mockSetInvoicePackingListLink).not.toHaveBeenCalled()
  })

  it('(f2) excluir a Invoice marcada avisa na confirmação', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docInvoice({ alsoPackingList: true })])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await pickAction(user, docRowOf('Invoice'), 'Excluir inv.pdf')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/volta a ficar sem arquivo/)).toBeInTheDocument()
  })

  it('(g) logística: sem checkbox, com Baixar no PL incluído e sem Separar', async () => {
    mockListProcessDocuments.mockResolvedValue([docInvoice({ alsoPackingList: true })])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitForDocumentsLoaded()

    expect(screen.queryByLabelText(CHECKBOX)).not.toBeInTheDocument()
    const packingRow = rowOf('Packing List')
    expect(within(packingRow).getByText('Incluído na Invoice')).toBeInTheDocument()
    expect(within(packingRow).getByRole('button', { name: 'Baixar inv.pdf' })).toBeInTheDocument()
    expect(within(packingRow).queryByRole('button', { name: /Separar/ })).not.toBeInTheDocument()
  })

  it('soltar a Invoice herda o checkbox marcado (mesmo onUpload do clique)', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await user.click(screen.getByLabelText(CHECKBOX))
    const file = new File(['x'], 'inv.pdf', { type: 'application/pdf' })
    fireEvent.drop(rowOf('Invoice').closest('.documents-row-group'), {
      dataTransfer: { files: [file], types: ['Files'] },
    })
    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'invoice', alsoPackingList: true })
      )
    )
  })
})

// S1: "Visualizar" no Relatório de carga (xlsx/xls/csv/pdf/imagem) abre o dialogo de
// pre-visualizacao sem baixar para o computador.
describe('ProcessDocumentsPanel — Visualizar o Relatório de carga (S1)', () => {
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  function docCargo(overrides = {}) {
    return docBl({
      id: 'c1',
      type: 'cargoReport',
      slotKey: 'cargoReport',
      name: 'FR.CMX.001.xlsx',
      mimeType: XLSX_MIME,
      ...overrides,
    })
  }

  function rowOf(title) {
    return screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
  }

  it('S7: aparece no menu "Ações" do Relatório de carga com xlsx anexado, antes do Baixar (que também está no menu)', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docCargo()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const row = rowOf('Relatório de carga')
    expect(within(row).queryByRole('button', { name: 'Visualizar FR.CMX.001.xlsx' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Baixar FR.CMX.001.xlsx' })).not.toBeInTheDocument()
    const sheet = await openActions(user, row)
    const view = sheet.getByRole('button', { name: 'Visualizar FR.CMX.001.xlsx' })
    const download = sheet.getByRole('button', { name: 'Baixar FR.CMX.001.xlsx' })
    expect(view.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('logística também vê o item', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docCargo()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitForDocumentsLoaded()

    const sheet = await openActions(user, rowOf('Relatório de carga'))
    expect(sheet.getByRole('button', { name: 'Visualizar FR.CMX.001.xlsx' })).toBeInTheDocument()
    // A logística não substitui nem exclui o relatório (versão oficial): só Visualizar e Baixar.
    expect(sheet.queryByRole('button', { name: /Substituir|Excluir/ })).not.toBeInTheDocument()
  })

  it('NÃO aparece no BL nem na Invoice, mesmo com arquivo', async () => {
    mockListProcessDocuments.mockResolvedValue([
      docBl(),
      docBl({ id: 'i1', type: 'invoice', slotKey: 'invoice', name: 'inv.pdf' }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    expect(screen.queryByRole('button', { name: /Visualizar/ })).not.toBeInTheDocument()
    // BL e Invoice: Baixar direto e menu só com Substituir e Excluir (sem Visualizar).
    expect(screen.getByRole('button', { name: 'Baixar bl.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar inv.pdf' })).toBeInTheDocument()
  })

  it('NÃO aparece no Relatório de carga sem arquivo', async () => {
    mockListProcessDocuments.mockResolvedValue([])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    expect(screen.queryByRole('button', { name: /Visualizar/ })).not.toBeInTheDocument()
  })

  it('NÃO aparece para .docx (o menu tem Baixar, mas não Visualizar)', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([
      docCargo({
        name: 'rel.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const sheet = await openActions(user, rowOf('Relatório de carga'))
    expect(sheet.queryByRole('button', { name: /Visualizar/ })).not.toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Baixar rel.docx' })).toBeInTheDocument()
  })

  it('clicar abre o diálogo e baixa o blob com (processId, docId), sem salvar arquivo', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockReturnValue(new Promise(() => {}))
    mockListProcessDocuments.mockResolvedValue([docCargo()])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await pickAction(user, rowOf('Relatório de carga'), 'Visualizar FR.CMX.001.xlsx')

    const dialog = await screen.findByRole('dialog', { name: 'Relatório de carga' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/FR\.CMX\.001\.xlsx · Excel · enviado em/)).toBeInTheDocument()
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'c1')
    expect(mockSaveBlobAsFile).not.toHaveBeenCalled()
  })
})

describe('ProcessDocumentsPanel — Visualizar: PDF e imagem (S1)', () => {
  function docCargoOf(name, mimeType) {
    return docBl({ id: 'c1', type: 'cargoReport', slotKey: 'cargoReport', name, mimeType })
  }

  function rowOf(title) {
    return screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
  }

  it.each([
    ['rel.pdf', 'application/pdf'],
    ['foto.png', 'image/png'],
    ['foto.jpg', 'image/jpeg'],
    ['rel.csv', 'text/csv'],
    ['rel.xls', 'application/vnd.ms-excel'],
  ])('aparece no menu "Ações" do Relatório de carga para %s', async (name, mimeType) => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docCargoOf(name, mimeType)])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const sheet = await openActions(user, rowOf('Relatório de carga'))
    expect(sheet.getByRole('button', { name: `Visualizar ${name}` })).toBeInTheDocument()
  })

  it('NÃO aparece em BL e Invoice, mesmo com PDF/imagem/xlsx, nem para .docx no Relatório de carga', async () => {
    mockListProcessDocuments.mockResolvedValue([
      docBl({ id: 'b1', name: 'bl.pdf', mimeType: 'application/pdf' }),
      docBl({ id: 'i1', type: 'invoice', slotKey: 'invoice', name: 'inv.png', mimeType: 'image/png' }),
      docCargoOf('rel.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    expect(screen.queryByRole('button', { name: /Visualizar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar bl.pdf' })).toBeInTheDocument()
  })
})

// COA Original (admin): lista de varios arquivos (S11-A), 1 slot por arquivo, sem versao anterior.
describe('ProcessDocumentsPanel — COA Original (admin)', () => {
  const SHIPPED_FCL = { ...FCL_PROCESS, shippedAt: '2026-09-01' }

  function rowOf(title) {
    return screen.getByText(title, { selector: '.documents-row__label' }).closest('.documents-row')
  }

  function docCoa(id, overrides = {}) {
    return docBl({
      id,
      type: 'coaOriginal',
      slotKey: `coaOriginal:${id}`,
      name: `${id}.pdf`,
      ...overrides,
    })
  }

  async function coaItem(name) {
    const label = await screen.findByText(name, { selector: '.coa-docs__name' })
    return label.closest('.coa-docs__item')
  }

  it('linha "COA Original" com Enviar COAs e sem badge Pendente mesmo com embarque confirmado', async () => {
    render(<ProcessDocumentsPanel process={SHIPPED_FCL} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const row = rowOf('COA Original')
    expect(within(row).getByRole('button', { name: 'Enviar COAs' })).toBeInTheDocument()
    expect(within(row).queryByText('Pendente')).not.toBeInTheDocument()
    expect(within(row).getByText('Não enviado')).toBeInTheDocument()
    expect(screen.getByText('Nenhum COA enviado.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Arquivos de COA' })).not.toBeInTheDocument()
    // admin continua listando a subcolecao inteira (sem filtro por tipo)
    expect(mockListProcessDocuments).toHaveBeenCalledWith('p1')
  })

  it('upload do COA usa type coaOriginal (1 slot por arquivo); COA enviado nao entra nas pendencias', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const onPendingCountChange = vi.fn()
    render(<ProcessDocumentsPanel process={SHIPPED_FCL} profile={ADMIN_PROFILE} onPendingCountChange={onPendingCountChange} />)
    await waitForDocumentsLoaded()
    // 2 FISPQ + 1 lavacao + BL/Relatorio/Invoice/Packing List (COA fora)
    await waitFor(() => expect(onPendingCountChange).toHaveBeenCalledWith(7))

    const fileInput = rowOf('COA Original').querySelector('input[type="file"]')
    expect(fileInput).toHaveAttribute('multiple')
    await user.upload(fileInput, new File(['x'], 'coa.pdf', { type: 'application/pdf' }))
    await waitFor(() =>
      expect(mockUploadProcessDocument).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ type: 'coaOriginal', actor: { uid: 'admin-1', name: 'Admin', role: 'admin' } })
      )
    )
    // Recarrega a lista depois do envio.
    await waitFor(() => expect(mockListProcessDocuments).toHaveBeenCalledTimes(2))
  })

  it('varios arquivos de uma vez: um envio por arquivo, todos como coaOriginal', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    const fileInput = rowOf('COA Original').querySelector('input[type="file"]')
    await user.upload(fileInput, [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ])
    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2))
    expect(mockUploadProcessDocument.mock.calls.map(([, input]) => [input.type, input.file.name])).toEqual([
      ['coaOriginal', 'a.pdf'],
      ['coaOriginal', 'b.pdf'],
    ])
    expect(await screen.findByText('2 COAs enviados.')).toBeInTheDocument()
  })

  it('lista COAs novos e o legado (slot fixo), do mais antigo ao mais novo, com contador de arquivos', async () => {
    mockListProcessDocuments.mockResolvedValue([
      docCoa('c2', { uploadedAt: '2026-09-03T10:00:00.000Z', description: 'Lote ABC' }),
      docCoa('legado', { slotKey: 'coaOriginal', uploadedAt: '2026-09-01T10:00:00.000Z' }),
      docCoa('c1', { uploadedAt: '2026-09-02T10:00:00.000Z' }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()
    await screen.findByRole('list', { name: 'Arquivos de COA' })

    const names = Array.from(document.querySelectorAll('.coa-docs__name')).map((node) => node.textContent)
    expect(names).toEqual(['legado.pdf', 'c1.pdf', 'Lote ABC'])
    expect(within(rowOf('COA Original')).getByText('3 arquivos')).toBeInTheDocument()
    expect(within(rowOf('COA Original')).queryByText('Não enviado')).not.toBeInTheDocument()
    // Com nome proprio, o nome do arquivo aparece embaixo; sem nome proprio, nao repete.
    expect(within(await coaItem('Lote ABC')).getByText('c2.pdf')).toBeInTheDocument()
    expect(within(await coaItem('c1.pdf')).getAllByText('c1.pdf')).toHaveLength(1)
  })

  it('selo "N enviado" conta o COA uma vez (um por tipo): vários COAs novos, só o legado, e nenhum', async () => {
    const OPEN_PROCESS = { id: 'p1', category: 'LCL' }
    const cases = [
      ['nenhum COA', [], null],
      [
        'dois COAs novos (coaOriginal:<id>)',
        [
          docCoa('c1', { uploadedAt: '2026-09-02T10:00:00.000Z' }),
          docCoa('c2', { uploadedAt: '2026-09-03T10:00:00.000Z' }),
        ],
        '1 enviado',
      ],
      ['só o COA legado (slot fixo)', [docCoa('legado', { slotKey: 'coaOriginal' })], '1 enviado'],
      [
        'novo + legado',
        [
          docCoa('c1', { uploadedAt: '2026-09-02T10:00:00.000Z' }),
          docCoa('legado', { slotKey: 'coaOriginal', uploadedAt: '2026-09-01T10:00:00.000Z' }),
        ],
        '1 enviado',
      ],
    ]
    for (const [label, documents, expected] of cases) {
      mockListProcessDocuments.mockResolvedValue(documents)
      const { unmount } = render(<ProcessDocumentsPanel process={OPEN_PROCESS} profile={ADMIN_PROFILE} />)
      await waitForDocumentsLoaded()
      if (expected) {
        expect(await screen.findByText(expected), label).toBeInTheDocument()
      } else {
        expect(screen.queryByText(/^d+ enviados?$/), label).not.toBeInTheDocument()
      }
      expect(screen.queryByText('2 enviados'), label).not.toBeInTheDocument()
      unmount()
    }
  })

  it('baixar um COA chama o download com (processId, docId)', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockListProcessDocuments.mockResolvedValue([docCoa('c1'), docCoa('c2', { uploadedAt: '2026-09-02T10:00:00.000Z' })])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await user.click(await screen.findByRole('button', { name: 'Baixar c2.pdf' }))
    await waitFor(() => expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'c2'))
    expect(mockSaveBlobAsFile).toHaveBeenCalled()
  })

  it('erro ao baixar aparece na linha do COA', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockRejectedValue({ code: 'permission-denied' })
    mockListProcessDocuments.mockResolvedValue([docCoa('c1')])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await user.click(await screen.findByRole('button', { name: 'Baixar c1.pdf' }))
    expect(await screen.findByText('Não foi possível baixar o documento.')).toBeInTheDocument()
  })

  it('admin renomeia o COA: abre o dialogo com o nome atual e grava só a description', async () => {
    const user = userEvent.setup()
    mockRenameAdditionalDocument.mockResolvedValue(undefined)
    mockListProcessDocuments.mockResolvedValue([docCoa('c1')])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await pickAction(user, await coaItem('c1.pdf'), 'Renomear c1.pdf')
    const dialog = await screen.findByRole('dialog', { name: 'Renomear documento' })
    const input = within(dialog).getByLabelText('Nome do documento')
    await waitFor(() => expect(input).toHaveFocus())
    expect(input).toHaveValue('c1.pdf')

    await user.clear(input)
    await user.type(input, 'Lote 123{Enter}')
    await waitFor(() =>
      expect(mockRenameAdditionalDocument).toHaveBeenCalledWith('p1', 'c1', 'Lote 123', { uid: 'admin-1' })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('admin exclui o COA depois de confirmar; só aquele arquivo', async () => {
    const user = userEvent.setup()
    mockDeleteProcessDocument.mockResolvedValue(undefined)
    mockListProcessDocuments.mockResolvedValue([docCoa('c1'), docCoa('c2', { uploadedAt: '2026-09-02T10:00:00.000Z' })])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await pickAction(user, await coaItem('c2.pdf'), 'Excluir c2.pdf')
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(mockDeleteProcessDocument).toHaveBeenCalledWith('p1', 'c2'))
    expect(mockDeleteProcessDocument).toHaveBeenCalledTimes(1)
  })

  it('Visualizar abre o diálogo com título "COA Original" e baixa o blob do arquivo escolhido', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockReturnValue(new Promise(() => {}))
    mockListProcessDocuments.mockResolvedValue([docCoa('c1')])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={ADMIN_PROFILE} />)
    await waitForDocumentsLoaded()

    await pickAction(user, await coaItem('c1.pdf'), 'Visualizar c1.pdf')
    const dialog = await screen.findByRole('dialog', { name: 'COA Original' })
    expect(dialog).toBeInTheDocument()
    expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'c1')
    expect(mockSaveBlobAsFile).not.toHaveBeenCalled()
  })

  it('logística vê a lista com Baixar e Visualizar, sem envio, Renomear nem Excluir', async () => {
    const user = userEvent.setup()
    mockListProcessDocuments.mockResolvedValue([docCoa('c1')])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitForDocumentsLoaded()

    const item = await coaItem('c1.pdf')
    expect(within(rowOf('COA Original')).queryByRole('button', { name: /^Enviar|^Adicionar COAs/ })).not.toBeInTheDocument()
    expect(rowOf('COA Original').querySelector('input[type="file"]')).toBeNull()
    expect(within(item).getByRole('button', { name: 'Baixar c1.pdf' })).toBeInTheDocument()
    const sheet = await openActions(user, item)
    expect(sheet.getByRole('button', { name: 'Visualizar c1.pdf' })).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: /Renomear/ })).not.toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: /Excluir/ })).not.toBeInTheDocument()
  })

  it('logística sem COA: sem botão de envio', async () => {
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={LOGISTICS_PROFILE} />)
    await waitForDocumentsLoaded()
    expect(within(rowOf('COA Original')).queryByRole('button', { name: /^Enviar/ })).not.toBeInTheDocument()
  })
})

describe.each(READER_ROLES)('ProcessDocumentsPanel — modo leitura (%s)', (role) => {
  const READER_PROFILE = { uid: `${role}-1`, name: 'Leitor', role }
  const SHIPPED_CONSOLIDATED = {
    ...FCL_PROCESS,
    category: 'CONSOLIDADO',
    shippedAt: '2026-09-01',
    purchaseOrders: [{ po: 'PO-1' }],
  }

  function readerDoc(type, overrides = {}) {
    return docBl({
      id: `r-${type}`,
      type,
      slotKey: type,
      name: type === 'cargoReport' ? 'carga.pdf' : 'coa.pdf',
      ...overrides,
    })
  }

  it('consulta com { types: [cargoReport, coaOriginal] }, mostra só 2 linhas e Baixar', async () => {
    mockListProcessDocuments.mockResolvedValue([readerDoc('cargoReport'), readerDoc('coaOriginal')])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={READER_PROFILE} />)
    await waitForDocumentsLoaded()

    expect(mockListProcessDocuments).toHaveBeenCalledWith('p1', { types: ['cargoReport', 'coaOriginal'] })
    const labels = Array.from(document.querySelectorAll('.documents-row__label')).map((node) => node.textContent)
    expect(labels).toEqual(['Relatório de carga', 'COA Original'])
    // COA Original: Baixar direto. Relatório de carga: Baixar e Visualizar (S1) no menu "Ações".
    expect(screen.getByRole('button', { name: 'Baixar coa.pdf' })).toBeInTheDocument()
    const user = userEvent.setup()
    const sheet = await openActions(user, docRowOf('Relatório de carga'))
    expect(sheet.getByRole('button', { name: 'Baixar carga.pdf' })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Visualizar carga.pdf' })).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: /Substituir|Excluir|Renomear/ })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    // COA Original (S11-A): cada arquivo da lista tem Baixar direto e o menu só com Visualizar (PDF).
    const coaItem = screen.getByText('coa.pdf', { selector: '.coa-docs__name' }).closest('.coa-docs__item')
    const coaSheet = await openActions(user, coaItem)
    expect(coaSheet.getByRole('button', { name: 'Visualizar coa.pdf' })).toBeInTheDocument()
    expect(coaSheet.queryByRole('button', { name: /Renomear|Excluir|Substituir/ })).not.toBeInTheDocument()
  })

  it('vários COAs (novos e legado) aparecem todos, com Baixar em cada um', async () => {
    mockListProcessDocuments.mockResolvedValue([
      readerDoc('coaOriginal', { id: 'r-1', slotKey: 'coaOriginal', name: 'antigo.pdf', uploadedAt: '2026-09-01T10:00:00.000Z' }),
      readerDoc('coaOriginal', { id: 'r-2', slotKey: 'coaOriginal:r-2', name: 'novo.pdf', uploadedAt: '2026-09-02T10:00:00.000Z' }),
    ])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={READER_PROFILE} />)
    await waitForDocumentsLoaded()

    const names = Array.from(document.querySelectorAll('.coa-docs__name')).map((node) => node.textContent)
    expect(names).toEqual(['antigo.pdf', 'novo.pdf'])
    expect(screen.getByRole('button', { name: 'Baixar antigo.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar novo.pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Enviar|^Adicionar COAs/ })).not.toBeInTheDocument()
    expect(document.querySelector('.coa-docs input[type="file"]')).toBeNull()
  })

  it('sem Enviar/Substituir/Excluir/Renomear, sem adicionar outro e sem resumo/badge de pendente', async () => {
    mockListProcessDocuments.mockResolvedValue([readerDoc('cargoReport'), readerDoc('coaOriginal')])
    const onPendingCountChange = vi.fn()
    render(
      <ProcessDocumentsPanel process={SHIPPED_CONSOLIDATED} profile={READER_PROFILE} onPendingCountChange={onPendingCountChange} />
    )
    await waitFor(() => expect(screen.getByText('2 enviados')).toBeInTheDocument())

    for (const name of [/^Enviar/, /Substituir/, /Excluir/, /Renomear/, /Adicionar outro documento/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument()
    expect(onPendingCountChange).not.toHaveBeenCalled()
  })

  it.each([
    ['FCL com embarque confirmado', { ...FCL_PROCESS, shippedAt: '2026-09-01' }],
    ['CONSOLIDADO com embarque confirmado', SHIPPED_CONSOLIDATED],
  ])('%s e sem documentos: linha vazia "Não enviado", sem badge Pendente', async (_label, process) => {
    mockListProcessDocuments.mockResolvedValue([])
    render(<ProcessDocumentsPanel process={process} profile={READER_PROFILE} />)
    await waitForDocumentsLoaded()

    const cargoRow = screen
      .getByText('Relatório de carga', { selector: '.documents-row__label' })
      .closest('.documents-row')
    expect(within(cargoRow).getByText('Não enviado')).toBeInTheDocument()
    expect(screen.queryByText('Pendente')).not.toBeInTheDocument()
    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument()
  })

  it('nenhum rótulo de BL/Invoice/Packing List/FISPQ/lavação/Outro nem seção de PO', async () => {
    mockListProcessDocuments.mockResolvedValue([readerDoc('cargoReport')])
    render(<ProcessDocumentsPanel process={SHIPPED_CONSOLIDATED} profile={READER_PROFILE} />)
    await waitForDocumentsLoaded()

    for (const text of [
      /BL\/AWB/,
      /Invoice/,
      /Packing List/,
      /FISPQ/,
      /lavação/i,
      /Documentos sem vínculo/,
      /Documento adicional/,
      /^Outro$/,
      'Resina Atlas',
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })

  it('estado vazio e nota de visibilidade conforme D-6', async () => {
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={READER_PROFILE} variant="desktop" />)
    await waitForDocumentsLoaded()

    expect(
      screen.getByText('O Relatório de carga e o COA Original enviados pelo COMEX aparecem aqui.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/Envie BL/)).not.toBeInTheDocument()
  })

  it('baixar chama o download autenticado com (processId, docId)', async () => {
    const user = userEvent.setup()
    mockDownloadProcessDocumentBlob.mockResolvedValue(new Blob(['x']))
    mockListProcessDocuments.mockResolvedValue([readerDoc('coaOriginal')])
    render(<ProcessDocumentsPanel process={FCL_PROCESS} profile={READER_PROFILE} />)
    await waitForDocumentsLoaded()

    await user.click(screen.getByRole('button', { name: 'Baixar coa.pdf' }))
    await waitFor(() => expect(mockDownloadProcessDocumentBlob).toHaveBeenCalledWith('p1', 'r-coaOriginal'))
  })
})
