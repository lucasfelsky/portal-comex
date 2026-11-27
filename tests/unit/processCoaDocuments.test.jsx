// S11-A/D2: card "COA Original" do painel de documentos = LISTA de arquivos (ProcessCoaDocuments).
// Envio de varios arquivos em sequencia (progresso, erro por arquivo, teto de 50), lista com
// os COAs legados (slot fixo) e os novos, acoes por papel e selo da leitura (hook useCoaReadBadges).
// Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUploadProcessDocument = vi.fn()
const mockListCoaReads = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
}))

vi.mock('../../src/services/coaReadsRepository', () => ({
  listCoaReads: (...args) => mockListCoaReads(...args),
}))

import ProcessCoaDocuments from '../../src/features/processes/ProcessCoaDocuments'
import useCoaReadBadges from '../../src/features/processes/useCoaReadBadges'
import { resetCoaUploads } from '../../src/features/processes/coaUploadStore'

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
      category="FCL"
      isDesktopVariant
      {...handlers}
      {...props}
    />
  )
  return { ...utils, handlers }
}

// Selo da leitura: o hook e' do painel (uma leitura so'); aqui um painel minimo repassa os selos ao card.
function CardWithBadges({ documents, profile = ADMIN }) {
  const badges = useCoaReadBadges({ processId: 'p1', documents, enabled: profile.role === 'admin' })
  return <ProcessCoaDocuments documents={documents} processId="p1" profile={profile} category="FCL" isDesktopVariant badges={badges} />
}

async function expandList(user) {
  await user.click(screen.getByRole('button', { name: /^\+\d+ arquivos?$/ }))
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
  resetCoaUploads()
  mockListCoaReads.mockResolvedValue({})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetCoaUploads()
  consoleErrorSpy.mockRestore()
})

describe('ProcessCoaDocuments - envio (admin)', () => {
  it('sem COA: "Nenhum COA enviado", selo "Opcional", botão "Enviar COA" e nada de "Pendente"', () => {
    const { container } = renderList()

    expect(screen.getByText('COA Original')).toBeInTheDocument()
    expect(screen.getByText('Nenhum COA enviado')).toBeInTheDocument()
    expect(screen.getByText('Opcional')).toBeInTheDocument()
    expect(screen.queryByText('Não enviado')).not.toBeInTheDocument()
    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Arquivos de COA' })).not.toBeInTheDocument()
    expect(fileInputOf(container)).toHaveAttribute('multiple')
  })

  it('com COAs o botão continua "Enviar COA" e o selo único conta os arquivos', () => {
    renderList({ documents: [coa('c1')] })
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adicionar COAs/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 arquivo')).toBeInTheDocument()
    expect(screen.queryByText('Opcional')).not.toBeInTheDocument()
  })

  it('o envio do FCL/LCL/AÉREO manda category e nenhuma PO (o COA é do processo)', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = renderList({ category: 'LCL' })
    await user.upload(fileInputOf(container), pdf('a.pdf'))
    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1))
    const input = mockUploadProcessDocument.mock.calls[0][1]
    expect(input.category).toBe('LCL')
    expect(input.po).toBeUndefined()
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
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeDisabled()
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
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeEnabled()

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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar COA' })).toHaveFocus())
  })

  it('sem envio em andamento o foco não é movido para o botão', () => {
    renderList({ documents: [coa('c1')] })
    expect(screen.getByRole('button', { name: 'Enviar COA' })).not.toHaveFocus()
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
    // S11-I (D-3): erro de permissão interrompe o lote; aqui o erro é só do arquivo (rede), então cada um é tentado.
    mockUploadProcessDocument.mockRejectedValue({ code: 'storage/retry-limit-exceeded' })
    const { container, handlers } = renderList()

    await user.upload(fileInputOf(container), [pdf('a.pdf'), pdf('b.pdf')])

    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(alert).toHaveTextContent('b.pdf: O envio do arquivo demorou demais. Tente novamente.'))
    expect(alert).toHaveTextContent('a.pdf: O envio do arquivo demorou demais. Tente novamente.')
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2)
    expect(handlers.onChanged).not.toHaveBeenCalled()
    expect(screen.queryByText(/^\d+( de \d+)? COAs? enviados?\.$/)).not.toBeInTheDocument()
  })

  it('arrastar vários arquivos envia todos, na ordem', async () => {
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { container } = renderList()

    fireEvent.drop(container.querySelector('.coa-card'), {
      dataTransfer: { types: ['Files'], files: [pdf('a.pdf'), pdf('b.pdf')] },
    })

    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2))
    expect(mockUploadProcessDocument.mock.calls.map(([, input]) => input.file.name)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('arrastar texto/link (sem arquivos) não envia nada', () => {
    const { container } = renderList()
    fireEvent.drop(container.querySelector('.coa-card'), { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('destaca a área enquanto arrasta arquivos e tira o destaque ao soltar', () => {
    const { container } = renderList()
    const area = container.querySelector('.coa-card')

    fireEvent.dragOver(area, { dataTransfer: { types: ['Files'], files: [] } })
    expect(area).toHaveClass('documents-drop-active')
    expect(screen.getByText('Solte os arquivos para enviar o COA')).toBeInTheDocument()
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
    expect(alert).toHaveTextContent('Cabem mais 1; você escolheu 2.')
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

  it('50 na lista: só a frase do limite, sem enviar', async () => {
    const user = userEvent.setup()
    const { container } = renderList({ documents: many(50) })

    await user.upload(fileInputOf(container), pdf('a.pdf'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Limite de 50 COAs por processo.')
    expect(alert).not.toHaveTextContent('Cabem mais')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('soltar 51 arquivos numa lista vazia: recusa tudo', () => {
    const { container } = renderList()
    const files = Array.from({ length: 51 }, (_, index) => pdf(`f${index}.pdf`))

    fireEvent.drop(container.querySelector('.coa-card'), { dataTransfer: { types: ['Files'], files } })

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
    // Acima de 2 arquivos a lista expande no proprio card (L-1): 2 visiveis + "+1 arquivo".
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '+1 arquivo' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: '+1 arquivo' }))
    expect(screen.getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('.coa-file__name').textContent)).toEqual([
      'legado-anterior.pdf',
      'legado-atual.pdf',
      'Lote ABC-1',
    ])
    expect(screen.getByText('3 arquivos')).toBeInTheDocument()
    // Com nome próprio o arquivo aparece embaixo; sem, o nome não se repete.
    expect(within(items[2]).getByText('novo.pdf')).toBeInTheDocument()
    expect(within(items[0]).getAllByText('legado-anterior.pdf')).toHaveLength(1)
    expect(within(items[0]).getByText(/^PDF · 2 KB · \d{2}\/\d{2}\/2026$/)).toBeInTheDocument()
    expect(screen.queryByText('bl.pdf')).not.toBeInTheDocument()
  })

  it('mais de 2 arquivos: "Mostrar menos" recolhe a lista e o card nao some', async () => {
    const user = userEvent.setup()
    renderList({ documents: [coa('c1'), coa('c2'), coa('c3'), coa('c4')] })
    expect(screen.getByRole('button', { name: '+2 arquivos' })).toBeInTheDocument()
    await expandList(user)
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Mostrar menos' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('celular: a meta mostra data, hora e quem enviou; Ações abre a folha inferior', async () => {
    const user = userEvent.setup()
    renderList({ documents: [coa('c1')], isDesktopVariant: false })
    expect(screen.getByText(/PDF · 2 KB · .*Admin$/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ações de c1.pdf' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
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

    expect(screen.queryByRole('button', { name: /^Enviar/ })).not.toBeInTheDocument()
    expect(fileInputOf(container)).toBeNull()
    expect(screen.getByText('Somente o COMEX envia este documento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar c1.pdf' })).toBeInTheDocument()

    const menu = await openMenuOf(user, 'c1.pdf')
    expect(menu.getAllByRole('menuitem').map((entry) => entry.textContent)).toEqual(['Visualizar'])

    // Arrastar arquivos para a lista não envia nada para quem não é admin.
    fireEvent.drop(container.querySelector('.coa-card'), { dataTransfer: { types: ['Files'], files: [pdf('x.pdf')] } })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(handlers.onRequestRename).not.toHaveBeenCalled()
    expect(handlers.onRequestDelete).not.toHaveBeenCalled()
  })

  it.each([
    ['logística', LOGISTICA],
    ['técnico', TECNICO],
    ['faturamento', FATURAMENTO],
  ])('%s sem COA: o card some (L-5), sem "Pendente" nem aviso', (_label, profile) => {
    const { container } = renderList({ profile })
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument()
  })

  it('consolidado (leitor): cada arquivo mostra a PO, "Sem PO" nos antigos; sem a Referência', async () => {
    const user = userEvent.setup()
    renderList({
      profile: TECNICO,
      category: 'CONSOLIDADO',
      showPurchaseOrder: true,
      documents: [
        coa('c1', { poNumber: 'PO-77', uploadedAt: '2026-09-01T10:00:00.000Z' }),
        coa('c2', { poNumber: '', slotKey: 'coaOriginal', uploadedAt: '2026-09-02T10:00:00.000Z' }),
        coa('c3', { poNumber: 'PO 5093', uploadedAt: '2026-09-03T10:00:00.000Z' }),
      ],
    })
    await expandList(user)
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText(/^PO-77 · PDF/)).toBeInTheDocument()
    expect(within(items[1]).getByText(/^Sem PO · PDF/)).toBeInTheDocument()
    expect(within(items[2]).getByText(/^PO 5093 · PDF/)).toBeInTheDocument()
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

describe('useCoaReadBadges + card - selo da leitura automática (S11-C/D-9, só admin)', () => {
  const read = (overrides = {}) => ({
    status: 'done',
    documentType: 'coa',
    certificates: [],
    error: null,
    ...overrides,
  })

  it('mostra "Lido · N certificados", "Não é COA" e "Falhou: tente de novo"; sem leitura ou lendo, sem selo', async () => {
    mockListCoaReads.mockResolvedValue({
      c1: read({ certificates: [{}, {}, {}] }),
      c2: read({ certificates: [{}] }),
      c3: read({ documentType: 'not_coa' }),
      c4: { status: 'failed', documentType: null, certificates: [], error: { code: 'tess-timeout' } },
      c5: { status: 'reading', documentType: null, certificates: [], error: null },
      c7: read(),
    })
    const user = userEvent.setup()
    render(
      <CardWithBadges
        documents={[coa('c1'), coa('c2'), coa('c3'), coa('c4'), coa('c5'), coa('c6'), coa('c7')].map((item, index) => ({
          ...item,
          uploadedAt: `2026-09-01T10:0${index}:00.000Z`,
        }))}
      />
    )
    await expandList(user)

    expect(await screen.findByText('Lido · 3 certificados')).toBeInTheDocument()
    expect(mockListCoaReads).toHaveBeenCalledWith('p1')
    expect(screen.getByText('Lido · 1 certificado')).toBeInTheDocument()
    expect(screen.getByText('Não é COA')).toBeInTheDocument()
    expect(screen.getByText('Falhou: tente de novo')).toBeInTheDocument()
    expect(screen.getByText('Lido · nenhum certificado')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(within(items[4]).queryByText(/Lido|Falhou|Não é COA/)).not.toBeInTheDocument()
    expect(within(items[5]).queryByText(/Lido|Falhou|Não é COA/)).not.toBeInTheDocument()
  })

  it('falha ao ler os resultados = sem selo, sem erro na tela', async () => {
    mockListCoaReads.mockRejectedValue(new Error('permission-denied'))
    render(<CardWithBadges documents={[coa('c1')]} />)
    await waitFor(() => expect(mockListCoaReads).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Lido|Falhou|Não é COA/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // So' o hook: quem decide "so' admin" e' o painel (coberto em tests/ui/ProcessDocumentsPanel.test.jsx).
  it('o hook com enabled=false (perfil que não é admin) não consulta nem mostra selo', async () => {
    mockListCoaReads.mockResolvedValue({ c1: read({ certificates: [{}] }) })
    for (const profile of [LOGISTICA, TECNICO, FATURAMENTO]) {
      const { unmount } = render(<CardWithBadges profile={profile} documents={[coa('c1')]} />)
      expect(screen.getByRole('button', { name: 'Baixar c1.pdf' })).toBeInTheDocument()
      unmount()
    }
    expect(mockListCoaReads).not.toHaveBeenCalled()
  })

  it('sem COA na lista não lê os resultados', () => {
    render(<CardWithBadges documents={[]} />)
    expect(mockListCoaReads).not.toHaveBeenCalled()
  })

  it('o card sozinho (sem o hook do painel) nunca consulta os resultados: so mostra os selos que recebe', () => {
    renderList({ documents: [coa('c1')] })
    expect(mockListCoaReads).not.toHaveBeenCalled()
    expect(screen.queryByText(/Lido|Falhou/)).not.toBeInTheDocument()
  })

  it('o card mostra o selo que recebe por prop, no arquivo certo, sem consultar nada', () => {
    renderList({
      documents: [coa('c1'), coa('c2', { uploadedAt: '2026-09-02T10:00:00.000Z' })],
      badges: { c2: { text: 'Lido · 1 certificado', tone: ' inline-badge--ok' } },
    })
    const items = screen.getAllByRole('listitem')
    expect(within(items[1]).getByText('Lido · 1 certificado')).toBeInTheDocument()
    expect(within(items[0]).queryByText(/Lido/)).not.toBeInTheDocument()
    expect(mockListCoaReads).not.toHaveBeenCalled()
  })
})
