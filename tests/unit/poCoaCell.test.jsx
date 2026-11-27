// S11-D2: celula "COA" de uma PO na tabela do CONSOLIDADO (PoCoaCell): Enviar COA por linha (varios arquivos), teto de 50
// por PO e envio sem PO barrado ANTES do upload (getCoaUploadRoom), lista so' dos COAs da PO e erros filtrados.
// Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUploadProcessDocument = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
}))

import PoCoaCell, { COA_UPLOAD_BUTTON_CLASS } from '../../src/features/processes/PoCoaCell'
import { resetCoaUploads } from '../../src/features/processes/coaUploadStore'

const ADMIN = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Ana', role: 'logistica' }

const coa = (id, po, overrides = {}) => ({
  id,
  type: 'coaOriginal',
  slotKey: `coaOriginal:${id}`,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  size: 2048,
  uploadedAt: '2026-09-01T10:00:00.000Z',
  uploadedByName: 'Admin',
  poNumber: po,
  ...overrides,
})
const many = (count, po) =>
  Array.from({ length: count }, (_, index) => coa(`${po}-m${index}`, po, { uploadedAt: `2026-09-01T10:${String(index).padStart(2, '0')}:00.000Z` }))
const pdf = (name) => new File(['x'], name, { type: 'application/pdf' })

function renderCell(props = {}) {
  const handlers = {
    onChanged: vi.fn(),
    onDownload: vi.fn(),
    onPreview: vi.fn(),
    onRequestDelete: vi.fn(),
    onRequestRename: vi.fn(),
  }
  const utils = render(
    <table>
      <tbody>
        <tr>
          <PoCoaCell
            order={{ po: 'PO-1', reference: 'Proc A' }}
            documents={[]}
            processId="p2"
            profile={ADMIN}
            category="CONSOLIDADO"
            isDesktopVariant
            {...handlers}
            {...props}
          />
        </tr>
      </tbody>
    </table>
  )
  return { ...utils, handlers, cell: utils.container.querySelector('td') }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCoaUploads()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetCoaUploads()
})

describe('PoCoaCell - envio por PO (admin)', () => {
  it('sem COA: selo "Opcional" e "Enviar COA" com seletor múltiplo; nunca "Pendente"', () => {
    const { cell } = renderCell()
    expect(within(cell).getByText('Opcional')).toBeInTheDocument()
    expect(within(cell).queryByText(/pendente/i)).not.toBeInTheDocument()
    expect(within(cell).getByRole('button', { name: 'Enviar COA da PO PO-1' })).toHaveTextContent('Enviar COA')
    expect(cell.querySelector('input[type="file"]')).toHaveAttribute('multiple')
    expect(cell).toHaveAttribute('data-label', 'COA')
  })

  it('o botão usa a classe compartilhada com o Enviar da Invoice/Packing List (L-9)', () => {
    const { cell } = renderCell()
    const button = within(cell).getByRole('button', { name: /^Enviar COA/ })
    expect(button.className).toBe(COA_UPLOAD_BUTTON_CLASS)
    expect(COA_UPLOAD_BUTTON_CLASS).toContain('secondary-button')
    expect(COA_UPLOAD_BUTTON_CLASS).not.toContain('primary-button')
    expect(COA_UPLOAD_BUTTON_CLASS).not.toContain('ghost-button')
  })

  it('vários arquivos: um upload por arquivo, em sequência, com category CONSOLIDADO e a PO da linha', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { cell, handlers } = renderCell({ order: { po: '  PO-1  ' } })

    await user.upload(cell.querySelector('input[type="file"]'), [pdf('a.pdf'), pdf('b.pdf')])

    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2))
    expect(mockUploadProcessDocument.mock.calls.map(([id, input]) => [id, input.type, input.category, input.po, input.file.name])).toEqual([
      ['p2', 'coaOriginal', 'CONSOLIDADO', 'PO-1', 'a.pdf'],
      ['p2', 'coaOriginal', 'CONSOLIDADO', 'PO-1', 'b.pdf'],
    ])
    expect(mockUploadProcessDocument.mock.calls[0][1].actor).toEqual({ uid: 'admin-1', name: 'Admin', role: 'admin' })
    expect(await within(cell).findByText('2 COAs enviados.')).toBeInTheDocument()
    expect(handlers.onChanged).toHaveBeenCalledTimes(1)
  })

  it('mostra "Enviando X de Y…" e desabilita o botão durante o envio', async () => {
    const user = userEvent.setup()
    const pending = []
    mockUploadProcessDocument.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const { cell } = renderCell()

    await user.upload(cell.querySelector('input[type="file"]'), [pdf('a.pdf'), pdf('b.pdf')])

    await waitFor(() => expect(within(cell).getByRole('status')).toHaveTextContent('Enviando 1 de 2…'))
    expect(within(cell).getByRole('progressbar', { name: 'Enviando COA da PO PO-1' })).toBeInTheDocument()
    expect(within(cell).getByRole('button', { name: /^Enviar COA/ })).toBeDisabled()
    pending[0]()
    await waitFor(() => expect(within(cell).getByRole('status')).toHaveTextContent('Enviando 2 de 2…'))
    pending[1]()
  })

  it('erro de um arquivo aparece por arquivo na célula', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Arquivo corrompido.'))
    const { cell } = renderCell()

    await user.upload(cell.querySelector('input[type="file"]'), [pdf('a.pdf'), pdf('b.pdf')])

    const alert = await within(cell).findByRole('alert')
    expect(alert).toHaveTextContent('b.pdf: Arquivo corrompido.')
    expect(alert).not.toHaveTextContent('a.pdf')
  })

  it('arrastar e soltar na célula envia com a PO da linha; destaque enquanto arrasta', async () => {
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { cell } = renderCell()

    fireEvent.dragOver(cell, { dataTransfer: { types: ['Files'], files: [] } })
    expect(cell).toHaveClass('documents-drop-active')
    expect(within(cell).getByText('Solte os arquivos para enviar o COA')).toBeInTheDocument()
    fireEvent.drop(cell, { dataTransfer: { types: ['Files'], files: [pdf('a.pdf'), pdf('b.pdf')] } })
    expect(cell).not.toHaveClass('documents-drop-active')

    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2))
    expect(mockUploadProcessDocument.mock.calls.every(([, input]) => input.po === 'PO-1')).toBe(true)
  })

  it('arrastar texto/link não envia nada', () => {
    const { cell } = renderCell()
    fireEvent.drop(cell, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })
})

describe('PoCoaCell - teto de 50 por PO e envio sem PO', () => {
  it('50 COAs na PO: barra antes do upload com "Limite de 50 COAs por PO."', async () => {
    const user = userEvent.setup()
    const { cell, handlers } = renderCell({ documents: many(50, 'PO-1') })

    await user.upload(cell.querySelector('input[type="file"]'), pdf('x.pdf'))

    const alert = await within(cell).findByRole('alert')
    expect(alert).toHaveTextContent('Limite de 50 COAs por PO.')
    expect(alert).not.toHaveTextContent('Cabem mais')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(handlers.onChanged).not.toHaveBeenCalled()
  })

  it('49 na PO + 2 escolhidos: recusa tudo e diz quanto cabe; 49 + 1: envia', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { cell } = renderCell({ documents: many(49, 'PO-1') })

    await user.upload(cell.querySelector('input[type="file"]'), [pdf('a.pdf'), pdf('b.pdf')])
    const alert = await within(cell).findByRole('alert')
    expect(alert).toHaveTextContent('Limite de 50 COAs por PO. Cabem mais 1; você escolheu 2.')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()

    await user.upload(cell.querySelector('input[type="file"]'), pdf('c.pdf'))
    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1))
  })

  it('o teto é por PO: 50 COAs em OUTRA PO (ou sem PO) não bloqueiam esta', async () => {
    const user = userEvent.setup()
    mockUploadProcessDocument.mockResolvedValue(undefined)
    const { cell } = renderCell({ documents: [...many(50, 'PO-2'), coa('legado', '', { slotKey: 'coaOriginal' })] })

    await user.upload(cell.querySelector('input[type="file"]'), pdf('x.pdf'))

    await waitFor(() => expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Limite de 50/)).not.toBeInTheDocument()
  })

  it('soltar 51 arquivos numa PO vazia: recusa tudo', () => {
    const { cell } = renderCell()
    const files = Array.from({ length: 51 }, (_, index) => pdf(`f${index}.pdf`))
    fireEvent.drop(cell, { dataTransfer: { types: ['Files'], files } })
    expect(within(cell).getByRole('alert')).toHaveTextContent('você escolheu 51.')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('consolidado sem PO na linha: o envio é barrado ANTES do upload (seletor e arrastar)', async () => {
    const user = userEvent.setup()
    const { cell } = renderCell({ order: { po: '   ' } })

    await user.upload(cell.querySelector('input[type="file"]'), pdf('x.pdf'))
    expect(await within(cell).findByRole('alert')).toHaveTextContent('Escolha a PO do COA antes de enviar.')
    fireEvent.drop(cell, { dataTransfer: { types: ['Files'], files: [pdf('y.pdf')] } })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })
})

describe('PoCoaCell - lista, erros e papéis', () => {
  it('lista só os COAs da própria PO (não os de outra PO, sem PO nem o legado)', () => {
    const { cell } = renderCell({
      documents: [coa('a1', 'PO-1'), coa('b1', 'PO-2'), coa('legado', '', { slotKey: 'coaOriginal' }), coa('x1', 'PO-9')],
    })
    expect(within(cell).getByRole('list', { name: 'Arquivos de COA da PO PO-1' })).toBeInTheDocument()
    expect(within(cell).getByText('a1.pdf')).toBeInTheDocument()
    for (const name of ['b1.pdf', 'legado.pdf', 'x1.pdf']) expect(within(cell).queryByText(name)).not.toBeInTheDocument()
    expect(within(cell).queryByText('Opcional')).not.toBeInTheDocument()
  })

  it('mais de 2 arquivos: "+N arquivos" expande na própria célula', async () => {
    const user = userEvent.setup()
    const { cell } = renderCell({ documents: [coa('a1', 'PO-1'), coa('a2', 'PO-1', { uploadedAt: '2026-09-02T10:00:00.000Z' }), coa('a3', 'PO-1', { uploadedAt: '2026-09-03T10:00:00.000Z' })] })
    expect(within(cell).queryByText('a3.pdf')).not.toBeInTheDocument()
    await user.click(within(cell).getByRole('button', { name: '+1 arquivo' }))
    expect(within(cell).getByText('a3.pdf')).toBeInTheDocument()
  })

  it('erros do painel só dos COAs desta PO (não de outra PO nem de BL)', () => {
    renderCell({
      documents: [coa('a1', 'PO-1'), coa('b1', 'PO-2')],
      rowErrors: {
        'coaOriginal:a1': { title: 'Não foi possível baixar o documento.', detail: 'Sem conexão.' },
        'coaOriginal:b1': { title: 'Erro da outra PO', detail: 'x' },
        bl: { title: 'Erro do BL', detail: 'y' },
      },
    })
    expect(screen.getByText('Não foi possível baixar o documento.')).toBeInTheDocument()
    expect(screen.queryByText('Erro da outra PO')).not.toBeInTheDocument()
    expect(screen.queryByText('Erro do BL')).not.toBeInTheDocument()
  })

  it('Baixar e Ações chamam os handlers do painel com o documento', async () => {
    const user = userEvent.setup()
    const documents = [coa('a1', 'PO-1')]
    const { cell, handlers } = renderCell({ documents })
    await user.click(within(cell).getByRole('button', { name: 'Baixar a1.pdf' }))
    expect(handlers.onDownload).toHaveBeenCalledWith(documents[0])
    await user.click(within(cell).getByRole('button', { name: 'Ações de a1.pdf' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir a1.pdf' }))
    expect(handlers.onRequestDelete).toHaveBeenCalledWith(documents[0])
  })

  it('logística: vê e baixa os COAs da PO, sem Enviar COA, sem seletor e sem soltar arquivos', async () => {
    const { cell } = renderCell({ profile: LOGISTICA, documents: [coa('a1', 'PO-1')] })
    expect(within(cell).getByRole('button', { name: 'Baixar a1.pdf' })).toBeInTheDocument()
    expect(within(cell).queryByRole('button', { name: /^Enviar/ })).not.toBeInTheDocument()
    expect(cell.querySelector('input[type="file"]')).toBeNull()
    fireEvent.drop(cell, { dataTransfer: { types: ['Files'], files: [pdf('x.pdf')] } })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('logística sem COA na PO: célula vazia (L-5), sem "Opcional" nem aviso', () => {
    const { cell } = renderCell({ profile: LOGISTICA })
    expect(cell).toBeEmptyDOMElement()
    expect(cell).toHaveClass('documents-po-coa--empty')
  })

  it('celular: a célula ganha a marca da variante e a folha inferior nas Ações', async () => {
    const user = userEvent.setup()
    const { cell } = renderCell({ isDesktopVariant: false, documents: [coa('a1', 'PO-1')] })
    expect(cell).toHaveClass('documents-po-coa--mobile')
    await user.click(within(cell).getByRole('button', { name: 'Ações de a1.pdf' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('selo da leitura recebido por prop aparece no arquivo certo', () => {
    const { cell } = renderCell({
      documents: [coa('a1', 'PO-1')],
      badges: { a1: { text: 'Lido · 2 certificados', tone: ' inline-badge--ok' } },
    })
    expect(within(cell).getByText('Lido · 2 certificados')).toBeInTheDocument()
  })
})
