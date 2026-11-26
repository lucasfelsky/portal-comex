// S11-A: linha "COA Original" do painel de documentos = LISTA de arquivos (ProcessCoaDocuments).
// Envio de varios arquivos em sequencia (progresso, erro por arquivo, teto de 50), lista com
// os COAs legados (slot fixo) e os novos, e acoes por papel. Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUploadProcessDocument = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
}))

import ProcessCoaDocuments from '../../src/features/processes/ProcessCoaDocuments'

const ADMIN = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Ana', role: 'logistica' }
const TECNICO = { uid: 'tec-1', name: 'Téc', role: 'tecnico' }
const FATURAMENTO = { uid: 'fat-1', name: 'Fat', role: 'faturamento' }

const coa = (id, overrides = {}) => ({
  id,
  type: 'coaOriginal',
  slotKey: `coaOriginal:${id}`,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  size: 2048,
  uploadedAt: '2026-09-01T10:00:00.000Z',
  uploadedByName: 'Admin',
  ...overrides,
})

const pdf = (name) => new File(['x'], name, { type: 'application/pdf' })

function renderList(props = {}) {
  const handlers = {
    onChanged: vi.fn(),
    onDownload: vi.fn(),
    onPreview: vi.fn(),
    onRequestDelete: vi.fn(),
    onRequestRename: vi.fn(),
  }
  const utils = render(
    <ProcessCoaDocuments
      documents={[]}
      processId="p1"
      profile={ADMIN}
      isDesktopVariant
      {...handlers}
      {...props}
    />
  )
  return { ...utils, handlers }
}

function fileInputOf(container) {
  return container.querySelector('input[type="file"]')
}

async function openMenuOf(user, name) {
  await user.click(screen.getByRole('button', { name: `Ações de ${name}` }))
  return within(await screen.findByRole('menu'))
}

let consoleErrorSpy

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('ProcessCoaDocuments - envio (admin)', () => {
  it('sem COA: "Nenhum COA enviado.", selo "Não enviado", botão "Enviar COAs" e nada de "Pendente"', () => {
    const { container } = renderList()

    expect(screen.getByText('COA Original')).toBeInTheDocument()
    expect(screen.getByText('Nenhum COA enviado.')).toBeInTheDocument()
    expect(screen.getByText('Não enviado')).toBeInTheDocument()
    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar COAs' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Arquivos de COA' })).not.toBeInTheDocument()
    expect(fileInputOf(container)).toHaveAttribute('multiple')
  })

  it('com COAs o botão vira "Adicionar COAs" e o selo conta os arquivos', () => {
    renderList({ documents: [coa('c1')] })
    expect(screen.getByRole('button', { name: 'Adicionar COAs' })).toBeInTheDocument()
    expect(screen.getByText('1 arquivo')).toBeInTheDocument()
    expect(screen.queryByText('Não enviado')).not.toBeInTheDocument()
  })

  it('3 arquivos: um envio por vez, na ordem, com progresso e erro só do 2º', async () => {
    const user = userEvent.setup()
    const pending = []
    mockUploadProcessDocument.mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
    )
    const { container, handlers } = renderList()

    await user.upload(fileInputOf(container), [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])

    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('Enviando 1 de 3…')
    expect(screen.getByRole('button', { name: 'Enviar COAs' })).toBeDisabled()
    // O 2º só começa depois que o 1º termina.
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1)

    pending[0].resolve()
    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent('Enviando 2 de 3…')

    pending[1].reject(new Error('Arquivo corrompido.'))
    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('status')).toHaveTextContent('Enviando 3 de 3…')

    pending[2].resolve()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível enviar o documento.')
    expect(alert).toHaveTextContent('b.pdf: Arquivo corrompido.')
    expect(alert).not.toHaveTextContent('a.pdf')
    expect(alert).not.toHaveTextContent('c.pdf')
    expect(screen.getByRole('status')).toHaveTextContent('2 de 3 COAs enviados.')
    expect(handlers.onChanged).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Enviar COAs' })).toBeEnabled()

    expect(mockUploadProcessDocument.mock.calls.map(([processId, input]) => [processId, input.type, input.file.name])).toEqual([
      ['p1', 'coaOriginal', 'a.pdf'],
      ['p1', 'coaOriginal', 'b.pdf'],
      ['p1', 'coaOriginal', 'c.pdf'],
    ])
    expect(mockUploadProcessDocument.mock.calls[0][1].actor).toEqual({ uid: 'admin-1', name: 'Admin', role: 'admin' })
  })

  it('todos com sucesso: mensagem no plural, 1 recarga e sem alerta', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container, handlers } = renderList()

    await user.upload(fileInputOf(container), [pdf('a.pdf'), pdf('b.pdf')])

    expect(await screen.findByText('2 COAs enviados.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(handlers.onChanged).toHaveBeenCalledTimes(1)
  })

  it('depois do envio o foco volta ao botão de envio (teclado)', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = renderList()

    await user.upload(fileInputOf(container), [pdf('a.pdf'), pdf('b.pdf')])

    await screen.findByText('2 COAs enviados.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar COAs' })).toHaveFocus())
  })

  it('sem envio em andamento o foco não é movido para o botão', () => {
    renderList({ documents: [coa('c1')] })
    expect(screen.getByRole('button', { name: 'Adicionar COAs' })).not.toHaveFocus()
  })

  it('1 arquivo com sucesso: "1 COA enviado."', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = renderList()

    await user.upload(fileInputOf(container), pdf('a.pdf'))

    expect(await screen.findByText('1 COA enviado.')).toBeInTheDocument()
  })

  it('todos falham: alerta por arquivo, sem recarregar a lista', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockRejectedValue({ code: 'permission-denied' })
    const { container, handlers } = renderList()

    await user.upload(fileInputOf(container), [pdf('a.pdf'), pdf('b.pdf')])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('a.pdf: Você não tem permissão para esta ação.')
    expect(alert).toHaveTextContent('b.pdf: Você não tem permissão para esta ação.')
    expect(handlers.onChanged).not.toHaveBeenCalled()
    expect(screen.queryByText(/^\d+( de \d+)? COAs? enviados?\.$/)).not.toBeInTheDocument()
  })

  it('arrastar vários arquivos envia todos, na ordem', async () => {
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = renderList()

    fireEvent.drop(container.querySelector('.coa-docs'), {
      dataTransfer: { types: ['Files'], files: [pdf('a.pdf'), pdf('b.pdf')] },
    })

    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2))
    expect(mockUploadProcessDocument.mock.calls.map(([, input]) => input.file.name)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('arrastar texto/link (sem arquivos) não envia nada', () => {
    const { container } = renderList()
    fireEvent.drop(container.querySelector('.coa-docs'), { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('destaca a área enquanto arrasta arquivos e tira o destaque ao soltar', () => {
    const { container } = renderList()
    const area = container.querySelector('.coa-docs')

    fireEvent.dragOver(area, { dataTransfer: { types: ['Files'], files: [] } })
    expect(area).toHaveClass('documents-drop-active')
    fireEvent.drop(area, { dataTransfer: { types: ['Files'], files: [] } })
    expect(area).not.toHaveClass('documents-drop-active')
  })
})

describe('ProcessCoaDocuments - teto de 50 COAs por processo (só no cliente)', () => {
  const many = (count) => Array.from({ length: count }, (_, index) => coa(`c${index}`))

  it('49 na lista + 2 escolhidos: recusa tudo e diz quanto cabe', async () => {
    const user = userEvent.setup()
    const { container, handlers } = renderList({ documents: many(49) })

    await user.upload(fileInputOf(container), [pdf('a.pdf'), pdf('b.pdf')])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Limite de 50 COAs por processo.')
    expect(alert).toHaveTextContent('Este processo já tem 49 e cabem mais 1; você escolheu 2.')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(handlers.onChanged).not.toHaveBeenCalled()
  })

  it('49 na lista + 1 escolhido: cabe, envia', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = renderList({ documents: many(49) })

    await user.upload(fileInputOf(container), pdf('a.pdf'))

    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Limite de 50/)).not.toBeInTheDocument()
  })

  it('50 na lista: pede para excluir algum COA antes', async () => {
    const user = userEvent.setup()
    const { container } = renderList({ documents: many(50) })

    await user.upload(fileInputOf(container), pdf('a.pdf'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Limite de 50 COAs por processo. Exclua algum COA antes de enviar outro.')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('soltar 51 arquivos numa lista vazia: recusa tudo', () => {
    const { container } = renderList()
    const files = Array.from({ length: 51 }, (_, index) => pdf(`f${index}.pdf`))

    fireEvent.drop(container.querySelector('.coa-docs'), { dataTransfer: { types: ['Files'], files } })

    expect(screen.getByRole('alert')).toHaveTextContent('você escolheu 51.')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })
})

describe('ProcessCoaDocuments - lista', () => {
  it('mostra legado (slot fixo) e novos do mais antigo ao mais novo, com nome próprio e metadados', () => {
    renderList({
      documents: [
        coa('novo', { uploadedAt: '2026-09-03T10:00:00.000Z', description: 'Lote ABC-1' }),
        coa('legado-atual', { slotKey: 'coaOriginal', uploadedAt: '2026-09-02T10:00:00.000Z' }),
        coa('legado-anterior', { slotKey: 'coaOriginal', uploadedAt: '2026-09-01T10:00:00.000Z' }),
        { id: 'bl', type: 'bl', slotKey: 'bl', name: 'bl.pdf', uploadedAt: '2026-08-01T10:00:00.000Z' },
      ],
    })

    const list = screen.getByRole('list', { name: 'Arquivos de COA' })
    expect(list).toHaveAttribute('role', 'list')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('.coa-docs__name').textContent)).toEqual([
      'legado-anterior.pdf',
      'legado-atual.pdf',
      'Lote ABC-1',
    ])
    expect(screen.getByText('3 arquivos')).toBeInTheDocument()
    // Com nome próprio o arquivo aparece embaixo; sem, o nome não se repete.
    expect(within(items[2]).getByText('novo.pdf')).toBeInTheDocument()
    expect(within(items[0]).getAllByText('legado-anterior.pdf')).toHaveLength(1)
    expect(within(items[0]).getByText(/PDF · .*Admin/)).toBeInTheDocument()
    expect(screen.queryByText('bl.pdf')).not.toBeInTheDocument()
  })

  it('Baixar chama onDownload com o documento; fica desabilitado só no que está baixando', async () => {
    const user = userEvent.setup()
    const documents = [coa('c1'), coa('c2', { uploadedAt: '2026-09-02T10:00:00.000Z' })]
    const { handlers } = renderList({ documents, downloadingId: 'c2' })

    expect(screen.getByRole('button', { name: 'Baixar c2.pdf' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Baixar c1.pdf' }))
    expect(handlers.onDownload).toHaveBeenCalledWith(documents[0])
  })

  it('erros de baixar/excluir/renomear do painel (chave coaOriginal:<id> ou coaOriginal) aparecem na linha', () => {
    renderList({
      documents: [coa('c1')],
      rowErrors: {
        'coaOriginal:c1': { title: 'Não foi possível baixar o documento.', detail: 'Sem conexão.' },
        coaOriginal: { title: 'Não foi possível excluir o documento.', detail: 'Tente de novo.' },
        bl: { title: 'Erro do BL', detail: 'não é do COA' },
      },
    })

    expect(screen.getByText('Não foi possível baixar o documento.')).toBeInTheDocument()
    expect(screen.getByText('Não foi possível excluir o documento.')).toBeInTheDocument()
    expect(screen.queryByText('Erro do BL')).not.toBeInTheDocument()
  })
})

describe('ProcessCoaDocuments - ações por papel', () => {
  it('admin: menu com Visualizar, Renomear e Excluir (Excluir separado e em vermelho)', async () => {
    const user = userEvent.setup()
    renderList({ documents: [coa('c1')] })

    const menu = await openMenuOf(user, 'c1.pdf')
    const entries = menu.getAllByRole('menuitem')
    expect(entries.map((entry) => entry.textContent)).toEqual(['Visualizar', 'Renomear', 'Excluir'])
    expect(entries[2]).toHaveClass('process-detail-more__item--danger')
  })

  it('Visualizar chama onPreview com o documento', async () => {
    const user = userEvent.setup()
    const documents = [coa('c1')]
    const { handlers } = renderList({ documents })

    const menu = await openMenuOf(user, 'c1.pdf')
    await user.click(menu.getByRole('menuitem', { name: 'Visualizar c1.pdf' }))
    expect(handlers.onPreview).toHaveBeenCalledWith(documents[0])
  })

  it('Renomear chama onRequestRename com o nome exibido como valor inicial', async () => {
    const user = userEvent.setup()
    const documents = [coa('c1'), coa('c2', { description: 'Lote 7', uploadedAt: '2026-09-02T10:00:00.000Z' })]
    const { handlers } = renderList({ documents })

    let menu = await openMenuOf(user, 'c1.pdf')
    await user.click(menu.getByRole('menuitem', { name: 'Renomear c1.pdf' }))
    expect(handlers.onRequestRename).toHaveBeenLastCalledWith({ ...documents[0], description: 'c1.pdf' })

    menu = await openMenuOf(user, 'Lote 7')
    await user.click(menu.getByRole('menuitem', { name: 'Renomear Lote 7' }))
    expect(handlers.onRequestRename).toHaveBeenLastCalledWith(documents[1])
  })

  it('Excluir chama onRequestDelete com o documento (a confirmação é do painel)', async () => {
    const user = userEvent.setup()
    const documents = [coa('c1')]
    const { handlers } = renderList({ documents })

    const menu = await openMenuOf(user, 'c1.pdf')
    await user.click(menu.getByRole('menuitem', { name: 'Excluir c1.pdf' }))
    expect(handlers.onRequestDelete).toHaveBeenCalledWith(documents[0])
  })

  it('arquivo que não é PDF/imagem/planilha: sem Visualizar; admin ainda renomeia e exclui', async () => {
    const user = userEvent.setup()
    renderList({
      documents: [
        coa('c1', {
          name: 'coa.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ],
    })

    const menu = await openMenuOf(user, 'coa.docx')
    expect(menu.getAllByRole('menuitem').map((entry) => entry.textContent)).toEqual(['Renomear', 'Excluir'])
  })

  it.each([
    ['logística', LOGISTICA],
    ['técnico', TECNICO],
    ['faturamento', FATURAMENTO],
  ])('%s: lista, Baixar e Visualizar; sem envio, Renomear nem Excluir', async (_label, profile) => {
    const user = userEvent.setup()
    const documents = [coa('c1')]
    const { container, handlers } = renderList({ documents, profile })

    expect(screen.queryByRole('button', { name: /^Enviar|^Adicionar COAs/ })).not.toBeInTheDocument()
    expect(fileInputOf(container)).toBeNull()
    expect(screen.getByRole('button', { name: 'Baixar c1.pdf' })).toBeInTheDocument()

    const menu = await openMenuOf(user, 'c1.pdf')
    expect(menu.getAllByRole('menuitem').map((entry) => entry.textContent)).toEqual(['Visualizar'])

    // Arrastar arquivos para a lista não envia nada para quem não é admin.
    fireEvent.drop(container.querySelector('.coa-docs'), { dataTransfer: { types: ['Files'], files: [pdf('x.pdf')] } })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(handlers.onRequestRename).not.toHaveBeenCalled()
    expect(handlers.onRequestDelete).not.toHaveBeenCalled()
  })

  it('leitor sem COA: mostra o aviso de que só o COMEX envia, sem "Pendente"', () => {
    renderList({ profile: TECNICO })
    expect(screen.getByText('Nenhum COA enviado.')).toBeInTheDocument()
    expect(screen.getByText('Somente o COMEX envia este documento')).toBeInTheDocument()
    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument()
  })

  it('leitor com arquivo não-visualizável: sem menu "Ações" (só Baixar)', () => {
    renderList({
      profile: LOGISTICA,
      documents: [coa('c1', { name: 'coa.docx', mimeType: 'application/msword' })],
    })
    expect(screen.getByRole('button', { name: 'Baixar coa.docx' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Ações de / })).not.toBeInTheDocument()
  })
})
