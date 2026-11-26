// S11-E/S11-F: leitura automática do COA ao anexar na aba Documentos (card em FCL e células por PO do CONSOLIDADO). Upload e
// callable `readProcessCoa` mockados (nunca chama a Tess); mensagens de erro reais (describeCoaReadError). Dados
// inventados. A fila é um store de módulo: `resetCoaAutoRead()` isola cada teste.
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUploadProcessDocument = vi.fn()
const mockListCoaReads = vi.fn()
const mockReadProcessCoa = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
}))

vi.mock('../../src/services/coaReadsRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listCoaReads: (...args) => mockListCoaReads(...args),
    readProcessCoa: (...args) => mockReadProcessCoa(...args),
  }
})

import PoCoaCell from '../../src/features/processes/PoCoaCell'
import ProcessCoaDocuments from '../../src/features/processes/ProcessCoaDocuments'
import { resetCoaAutoRead } from '../../src/features/processes/coaAutoReadQueue'
import { setCoaAutoReadActor } from '../../src/features/processes/coaAutoReadSession'
import useCoaAutoRead from '../../src/features/processes/useCoaAutoRead'
import useCoaReadBadges from '../../src/features/processes/useCoaReadBadges'

const ADMIN = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Ana', role: 'logistica' }

const HINT = 'Cada arquivo pode levar até 2 minutos.'
const statusText = (done, total) => `Lendo os COAs: ${done} de ${total}. ${HINT}`

const pdf = (name) => new File(['x'], name, { type: 'application/pdf' })
const coaDocument = (id, overrides = {}) => ({
  id,
  type: 'coaOriginal',
  slotKey: `coaOriginal:${id}`,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  size: 2048,
  uploadedAt: '2026-11-26T10:00:00.000Z',
  uploadedByName: 'Admin',
  ...overrides,
})
const read = (documentId, overrides = {}) => ({
  documentId,
  status: 'done',
  documentType: 'coa',
  certificates: [{ batchNumber: 'L-1' }, { batchNumber: 'L-2' }],
  error: null,
  ...overrides,
})
const readResult = (value) => ({ status: value.status, cached: false, read: value })
const callError = (code) => Object.assign(new Error(`callable ${code}`), { code })

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Cada chamada da callable fica pendente até o teste resolver (prova a ordem).
function pendingReads() {
  const pending = []
  mockReadProcessCoa.mockImplementation(
    (processId, documentId, options) =>
      new Promise((resolve, reject) => pending.push({ processId, documentId, options, resolve, reject }))
  )
  return pending
}

// "Servidor" do upload: devolve o documento criado e guarda para o painel recarregar a lista.
let serverDocuments
function mockUploadsOk() {
  let counter = 0
  mockUploadProcessDocument.mockImplementation(async (processId, { file, po }) => {
    counter += 1
    const created = coaDocument(`new${counter}`, { name: file.name, ...(po ? { poNumber: po } : {}) })
    serverDocuments.push(created)
    return created
  })
}

// Painel mínimo: lista os COAs, passa os selos (um `useCoaReadBadges` por painel) e recarrega ao enviar.
function Panel({ profile = ADMIN, category = 'FCL', initial = [], processId = 'p1' }) {
  const [documents, setDocuments] = useState(initial)
  const badges = useCoaReadBadges({ processId, documents, enabled: profile.role === 'admin' })
  const onChanged = () => setDocuments([...initial, ...serverDocuments])
  if (category === 'CONSOLIDADO') {
    return (
      <table>
        <tbody>
          <tr>
            {['PO-1', 'PO-2'].map((po) => (
              <PoCoaCell
                key={po}
                order={{ po }}
                documents={documents}
                processId={processId}
                profile={profile}
                category="CONSOLIDADO"
                isDesktopVariant
                badges={badges}
                onChanged={onChanged}
              />
            ))}
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <ProcessCoaDocuments
      documents={documents}
      processId={processId}
      profile={profile}
      category={category}
      isDesktopVariant
      badges={badges}
      onChanged={onChanged}
    />
  )
}

const inputs = (container) => Array.from(container.querySelectorAll('input[type="file"]'))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  resetCoaAutoRead()
  serverDocuments = []
  mockListCoaReads.mockResolvedValue({})
  mockUploadsOk()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetCoaAutoRead()
  vi.restoreAllMocks()
})

describe('card do COA (FCL): admin anexa vários arquivos', () => {
  it('lê em sequência (a 2ª só sai depois da 1ª), com a linha "Lendo os COAs: X de Y" e sem travar o envio', async () => {
    const pending = pendingReads()
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])

    const line = await screen.findByText(statusText(1, 3))
    expect(line).toHaveAttribute('role', 'status')
    expect(line).toHaveAttribute('aria-live', 'polite')
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0]).toMatchObject({ processId: 'p1', documentId: 'new1', options: { force: false } })
    // O botão de envio segue livre durante a leitura.
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeEnabled()

    pending[0].resolve(readResult(read('new1')))
    expect(await screen.findByText(statusText(2, 3))).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].documentId).toBe('new2')

    pending[1].resolve(readResult(read('new2')))
    expect(await screen.findByText(statusText(3, 3))).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(3))
    pending[2].resolve(readResult(read('new3')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(3)
  })

  it('o selo do arquivo é recarregado ao terminar cada leitura (Lido · N certificados, Não é COA, Falhou)', async () => {
    const reads = {}
    mockListCoaReads.mockImplementation(async () => ({ ...reads }))
    const pending = pendingReads()
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(screen.queryByText(/Lido ·/)).not.toBeInTheDocument()

    reads.new1 = read('new1')
    pending[0].resolve(readResult(reads.new1))
    expect(await screen.findByText('Lido · 2 certificados')).toBeInTheDocument()

    await waitFor(() => expect(pending).toHaveLength(2))
    reads.new2 = read('new2', { documentType: 'not_coa', certificates: [] })
    pending[1].resolve(readResult(reads.new2))
    expect(await screen.findByText('Não é COA')).toBeInTheDocument()

    await waitFor(() => expect(pending).toHaveLength(3))
    reads.new3 = read('new3', { status: 'failed', documentType: null, certificates: [], error: { code: 'tess-timeout' } })
    pending[2].resolve(readResult(reads.new3))
    // A lista mostra 2 arquivos e esconde o resto atrás de "+1 arquivo".
    await user.click(await screen.findByRole('button', { name: /^\+\d+ arquivos?$/ }))
    expect(await screen.findByText('Falhou: tente de novo')).toBeInTheDocument()
    // Erro só do arquivo: nenhum aviso de fila interrompida.
    expect(screen.queryByText(/Leitura automática interrompida/)).not.toBeInTheDocument()
  })

  it('não-admin (logística) não tem envio no card e a callable nunca é chamada', async () => {
    pendingReads()
    const { container } = render(<Panel profile={LOGISTICA} initial={[coaDocument('old1')]} />)
    expect(inputs(container)).toHaveLength(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument()
    expect(mockListCoaReads).not.toHaveBeenCalled()
  })

  it('hook desabilitado (não-admin) nunca enfileira, mesmo recebendo PDFs recém-enviados', async () => {
    pendingReads()
    let enqueued = -1
    function Probe() {
      const autoRead = useCoaAutoRead({ processId: 'p1', enabled: false })
      return (
        <button type="button" onClick={() => { enqueued = autoRead.enqueue([coaDocument('x1')]) }}>
          Enfileirar
        </button>
      )
    }
    const user = userEvent.setup()
    render(<Probe />)
    await user.click(screen.getByRole('button', { name: 'Enfileirar' }))
    await flush()
    expect(enqueued).toBe(0)
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
  })

  it('upload que falha não dispara leitura; no lote misto só o arquivo enviado é lido', async () => {
    const pending = pendingReads()
    mockUploadProcessDocument
      .mockReset()
      .mockResolvedValueOnce(coaDocument('ok1', { name: 'a.pdf' }))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'permission-denied' }))
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf')])
    expect(await screen.findByText(statusText(1, 1))).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0].documentId).toBe('ok1')
    pending[0].resolve(readResult(read('ok1')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })

  it('só falhas no envio: nenhuma leitura', async () => {
    mockUploadProcessDocument.mockReset().mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], pdf('a.pdf'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
  })

  it('arquivo que não é PDF é enviado e pulado sem erro nem chamada', async () => {
    mockUploadProcessDocument.mockReset().mockResolvedValue(coaDocument('w1', { name: 'a.docx', mimeType: 'application/msword' }))
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], new File(['x'], 'a.docx', { type: 'application/msword' }))
    expect(await screen.findByText('1 COA enviado.')).toBeInTheDocument()
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('COAs antigos nunca disparam leitura (montar, recarregar e enviar outro só lê o novo)', async () => {
    const pending = pendingReads()
    const old = [coaDocument('old1'), coaDocument('old2'), coaDocument('old3')]
    const user = userEvent.setup()
    const { container } = render(<Panel initial={old} />)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    await user.upload(inputs(container)[0], pdf('novo.pdf'))
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0].documentId).toBe('new1')
    pending[0].resolve(readResult(read('new1')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })

  it('report-closed e not-pdf: silêncio (sem aviso, sem alerta, sem linha de leitura)', async () => {
    mockReadProcessCoa.mockRejectedValueOnce(callError('report-closed'))
    const user = userEvent.setup()
    const { container, unmount } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf')])
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Leitura automática interrompida/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    unmount()

    resetCoaAutoRead()
    mockReadProcessCoa.mockReset().mockRejectedValueOnce(callError('not-pdf')).mockRejectedValueOnce(callError('too-large'))
    serverDocuments = []
    const second = render(<Panel />)
    await user.upload(inputs(second.container)[0], [pdf('c.pdf'), pdf('d.pdf')])
    await waitFor(() => expect(mockReadProcessCoa).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(screen.queryByText(/Leitura automática interrompida/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['busy', 'Leitura automática interrompida: Outra leitura de COA está em andamento. Tente de novo em 1 minuto. Use Ler COAs no formulário.'],
    ['tess-auth', 'Leitura automática interrompida: A Tess recusou as credenciais do Portal. Confira a chave e o workspace no servidor. Use Ler COAs no formulário.'],
  ])('erro %s interrompe a fila: aviso curto e o resto não é lido', async (code, message) => {
    mockReadProcessCoa.mockRejectedValueOnce(callError(code))
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    const notice = await screen.findByText(message)
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument()
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
    // Não é alerta intrusivo e o envio continua liberado.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeEnabled()
  })

  it('desmontar a tela NÃO descarta a fila: a 2ª e a 3ª leitura continuam depois do unmount, sem setState nem aviso do React', async () => {
    const pending = pendingReads()
    const user = userEvent.setup()
    const { container, unmount } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    await waitFor(() => expect(pending).toHaveLength(1))
    unmount()
    pending[0].resolve(readResult(read('new1')))
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].documentId).toBe('new2')
    pending[1].resolve(readResult(read('new2')))
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].documentId).toBe('new3')
    pending[2].resolve(readResult(read('new3')))
    await flush()
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(3)
    const reactWarnings = console.error.mock.calls.filter((call) => /unmounted|not wrapped in act/i.test(String(call[0])))
    expect(reactWarnings).toEqual([])
  })

  it('trocar de processo (mesmo componente) não para a fila do anterior; ao voltar, o contador reaparece', async () => {
    const pending = pendingReads()
    const user = userEvent.setup()
    const { container, rerender } = render(<Panel processId="p1" />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf')])
    await waitFor(() => expect(pending).toHaveLength(1))
    rerender(<Panel processId="p2" />)
    // O outro processo não mostra a leitura do primeiro.
    expect(screen.queryByText(/Lendo os COAs|Na fila/)).not.toBeInTheDocument()
    pending[0].resolve(readResult(read('new1')))
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1]).toMatchObject({ processId: 'p1', documentId: 'new2' })
    expect(screen.queryByText(/Lendo os COAs|Na fila/)).not.toBeInTheDocument()

    rerender(<Panel processId="p1" />)
    expect(await screen.findByText(statusText(2, 2))).toBeInTheDocument()
    pending[1].resolve(readResult(read('new2')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(2)
  })

  it('sair da aba e voltar: o componente reassume o contador da fila, e o selo atualiza quando cada arquivo termina', async () => {
    const reads = {}
    mockListCoaReads.mockImplementation(async () => ({ ...reads }))
    const pending = pendingReads()
    const user = userEvent.setup()
    const first = render(<Panel />)
    await user.upload(inputs(first.container)[0], [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    expect(await screen.findByText(statusText(1, 3))).toBeInTheDocument()
    first.unmount()

    // Volta para a aba com os 3 COAs já na lista (o painel recarrega os documentos).
    const back = [coaDocument('new1'), coaDocument('new2'), coaDocument('new3')]
    render(<Panel initial={back} />)
    expect(await screen.findByText(statusText(1, 3))).toBeInTheDocument()
    expect(screen.queryByText(/Lido ·/)).not.toBeInTheDocument()

    reads.new1 = read('new1')
    pending[0].resolve(readResult(reads.new1))
    expect(await screen.findByText(statusText(2, 3))).toBeInTheDocument()
    expect(await screen.findByText('Lido · 2 certificados')).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(2))
    reads.new2 = read('new2', { documentType: 'not_coa', certificates: [] })
    pending[1].resolve(readResult(reads.new2))
    expect(await screen.findByText('Não é COA')).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(3))
    pending[2].resolve(readResult(read('new3')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(3)
  })

  it('sair, voltar e anexar mais com o arquivo antigo ainda lendo: o contador soma no mesmo lote (sem incremento trocado)', async () => {
    const pending = pendingReads()
    const user = userEvent.setup()
    const first = render(<Panel />)
    await user.upload(inputs(first.container)[0], [pdf('a.pdf'), pdf('b.pdf')])
    expect(await screen.findByText(statusText(1, 2))).toBeInTheDocument()
    first.unmount()

    const second = render(<Panel initial={[coaDocument('new1'), coaDocument('new2')]} />)
    expect(await screen.findByText(statusText(1, 2))).toBeInTheDocument()
    await user.upload(inputs(second.container)[0], pdf('c.pdf'))
    expect(await screen.findByText(statusText(1, 3))).toBeInTheDocument()

    pending[0].resolve(readResult(read('new1')))
    expect(await screen.findByText(statusText(2, 3))).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(2))
    pending[1].resolve(readResult(read('new2')))
    expect(await screen.findByText(statusText(3, 3))).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(3))
    pending[2].resolve(readResult(read('new3')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(3)
  })

  it('erro de serviço enquanto a tela estava fechada: ao voltar, o aviso aparece e nada mais é lido', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise)
    const user = userEvent.setup()
    const one = render(<Panel />)
    await user.upload(inputs(one.container)[0], [pdf('a.pdf'), pdf('b.pdf')])
    await waitFor(() => expect(mockReadProcessCoa).toHaveBeenCalledTimes(1))
    one.unmount()
    first.reject(callError('busy'))
    await flush()
    await flush()

    render(<Panel initial={[coaDocument('new1'), coaDocument('new2')]} />)
    const notice = await screen.findByText(/Leitura automática interrompida: Outra leitura de COA está em andamento/)
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.queryByText(/Lendo os COAs|Na fila/)).not.toBeInTheDocument()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })

  it('logout: some a linha de leitura, o resto não é lido e o arquivo em andamento termina sem setState', async () => {
    setCoaAutoReadActor({ uid: ADMIN.uid, role: 'admin' })
    const pending = pendingReads()
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    expect(await screen.findByText(statusText(1, 3))).toBeInTheDocument()

    act(() => setCoaAutoReadActor(null))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs|Na fila/)).not.toBeInTheDocument())
    pending[0].resolve(readResult(read('new1')))
    await flush()
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
    const reactWarnings = console.error.mock.calls.filter((call) => /unmounted|not wrapped in act/i.test(String(call[0])))
    expect(reactWarnings).toEqual([])
  })

  it('uma tentativa por documento: falha só do arquivo não repete e um novo envio não relê o anterior', async () => {
    mockReadProcessCoa.mockRejectedValue(callError('tess-timeout'))
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], pdf('a.pdf'))
    await waitFor(() => expect(mockReadProcessCoa).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
    await user.upload(inputs(container)[0], pdf('b.pdf'))
    await waitFor(() => expect(mockReadProcessCoa).toHaveBeenCalledTimes(2))
    expect(mockReadProcessCoa.mock.calls.map((call) => call[1])).toEqual(['new1', 'new2'])
  })
})

describe('CONSOLIDADO: células por PO na mesma fila', () => {
  it('duas células anexando ao mesmo tempo leem uma de cada vez e cada célula mostra a própria linha', async () => {
    const pending = pendingReads()
    const user = userEvent.setup()
    const { container } = render(<Panel category="CONSOLIDADO" />)
    const [first, second] = inputs(container)
    await user.upload(first, [pdf('a.pdf'), pdf('b.pdf')])
    await user.upload(second, pdf('c.pdf'))
    const cells = container.querySelectorAll('td')

    await waitFor(() => expect(within(cells[0]).getByText(statusText(1, 2))).toBeInTheDocument())
    // A célula que só espera a vez mostra "Na fila" (e não o progresso de quem lê).
    const waiting = within(cells[1]).getByText('Na fila para leitura.')
    expect(waiting).toHaveAttribute('role', 'status')
    expect(waiting).toHaveAttribute('aria-live', 'polite')
    expect(within(cells[1]).queryByText(/Lendo os COAs/)).not.toBeInTheDocument()
    expect(within(cells[0]).queryByText('Na fila para leitura.')).not.toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0].documentId).toBe('new1')
    await flush()
    expect(pending).toHaveLength(1)

    pending[0].resolve(readResult(read('new1')))
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].documentId).toBe('new2')
    await flush()
    expect(pending).toHaveLength(2)

    pending[1].resolve(readResult(read('new2')))
    await waitFor(() => expect(pending).toHaveLength(3))
    expect(pending[2].documentId).toBe('new3')
    // A vez passou para a 2ª célula: agora ela lê e a 1ª já não mostra nada.
    await waitFor(() => expect(within(cells[1]).getByText(statusText(1, 1))).toBeInTheDocument())
    expect(within(cells[1]).queryByText('Na fila para leitura.')).not.toBeInTheDocument()
    expect(within(cells[0]).queryByText(/Lendo os COAs|Na fila/)).not.toBeInTheDocument()
    pending[2].resolve(readResult(read('new3')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(3)
  })

  it('não-admin nas células não envia nem lê', async () => {
    pendingReads()
    const { container } = render(<Panel category="CONSOLIDADO" profile={LOGISTICA} initial={[coaDocument('old1', { poNumber: 'PO-1' })]} />)
    expect(inputs(container)).toHaveLength(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
  })

  it('o aviso de fila interrompida aparece nas células que ficaram sem leitura', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise)
    const user = userEvent.setup()
    const { container } = render(<Panel category="CONSOLIDADO" />)
    const [one, two] = inputs(container)
    await user.upload(one, pdf('a.pdf'))
    await user.upload(two, pdf('b.pdf'))
    await waitFor(() => expect(mockReadProcessCoa).toHaveBeenCalledTimes(1))
    first.reject(callError('tess-rate-limit'))
    const notices = await screen.findAllByText(/Leitura automática interrompida: O serviço de leitura pediu uma pausa/)
    expect(notices).toHaveLength(2)
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })
})
