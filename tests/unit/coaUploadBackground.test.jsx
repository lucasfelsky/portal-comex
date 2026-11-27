// S11-I: o envio de vários COAs continua em segundo plano ao sair da aba Documentos ou trocar de processo. Renderiza o card
// (ProcessCoaDocuments) e a célula por PO (PoCoaCell), monta e desmonta no meio do envio e confere uploads, leituras,
// progresso na volta, toast e teto. Upload e callable `readProcessCoa` mockados (nunca chama Storage, Firestore nem a Tess).
// Dados inventados (p1/p2, PO-1, SYN-n.pdf, admin-1). Estado de módulo isolado por `resetCoaUploads()`/`resetCoaAutoRead()`.
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
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

import { ToastProvider } from '../../src/components/Toast'
import PoCoaCell from '../../src/features/processes/PoCoaCell'
import ProcessCoaDocuments from '../../src/features/processes/ProcessCoaDocuments'
import { resetCoaAutoRead } from '../../src/features/processes/coaAutoReadQueue'
import { setCoaAutoReadActor } from '../../src/features/processes/coaAutoReadSession'
import { resetCoaUploads } from '../../src/features/processes/coaUploadStore'

const ADMIN = { uid: 'admin-1', name: 'Admin', role: 'admin' }

const pdf = (name) => new File(['x'], name, { type: 'application/pdf' })
const syn = (count) => Array.from({ length: count }, (_, index) => pdf(`SYN-${index + 1}.pdf`))
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
const existing = (count) => Array.from({ length: count }, (_, index) => coaDocument(`old${index}`))
const read = (documentId) => ({ documentId, status: 'done', documentType: 'coa', certificates: [], error: null })
const readResult = (value) => ({ status: value.status, cached: false, read: value })

let uploads
function pendingUploads() {
  uploads = []
  mockUploadProcessDocument.mockImplementation(
    (processId, args) => new Promise((resolve, reject) => uploads.push({ processId, args, resolve, reject }))
  )
}
const finishUpload = (index, id = `new${index + 1}`) =>
  act(async () => {
    uploads[index].resolve(coaDocument(id, { name: uploads[index].args.file.name }))
  })
const failUpload = (index, error = new Error('falha de teste')) =>
  act(async () => {
    uploads[index].reject(error)
  })

let reads
let maxParallel
let inFlight
function pendingReads() {
  reads = []
  inFlight = 0
  maxParallel = 0
  mockReadProcessCoa.mockImplementation((processId, documentId) => {
    inFlight += 1
    maxParallel = Math.max(maxParallel, inFlight)
    return new Promise((resolve, reject) =>
      reads.push({
        processId,
        documentId,
        resolve: (value) => {
          inFlight -= 1
          resolve(value)
        },
        reject: (error) => {
          inFlight -= 1
          reject(error)
        },
      })
    )
  })
}
const readIds = () => mockReadProcessCoa.mock.calls.map((call) => call[1])

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = async () => {
  for (let index = 0; index < 4; index += 1) await act(async () => flush())
}
const fileInput = (container) => container.querySelector('input[type="file"]')
const reactWarnings = () => console.error.mock.calls.filter((call) => /unmounted|not wrapped in act/i.test(String(call[0])))

function Card({ processId = 'p1', documents = [], onChanged = () => {}, profile = ADMIN, category = 'FCL' }) {
  return (
    <ProcessCoaDocuments
      documents={documents}
      processId={processId}
      profile={profile}
      category={category}
      isDesktopVariant
      onChanged={onChanged}
    />
  )
}

function Cell({ po = 'PO-1', processId = 'p1', documents = [], onChanged = () => {} }) {
  return (
    <table>
      <tbody>
        <tr>
          <PoCoaCell
            order={{ po }}
            documents={documents}
            processId={processId}
            profile={ADMIN}
            category="CONSOLIDADO"
            isDesktopVariant
            onChanged={onChanged}
          />
        </tr>
      </tbody>
    </table>
  )
}

// Troca de aba: o app desmonta a tela e o provider do toast (raiz) continua.
function Shell({ show, children }) {
  return <ToastProvider>{show ? children : null}</ToastProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCoaAutoRead()
  resetCoaUploads()
  mockListCoaReads.mockResolvedValue({})
  pendingUploads()
  pendingReads()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetCoaAutoRead()
  resetCoaUploads()
  vi.restoreAllMocks()
})

describe('desmontar no meio do envio', () => {
  it('os 3 PDFs sobem e são lidos um por vez, sem aviso do React', async () => {
    const user = userEvent.setup()
    const view = render(<Card />)
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))

    view.unmount()
    await finishUpload(1)
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2)

    for (let index = 0; index < 3; index += 1) {
      await waitFor(() => expect(reads).toHaveLength(index + 1))
      reads[index].resolve(readResult(read(`new${index + 1}`)))
      await settle()
    }
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(3)
    expect(readIds()).toEqual(['new1', 'new2', 'new3'])
    expect(maxParallel).toBe(1)
    expect(reactWarnings()).toEqual([])
  })
})

describe('voltar à aba', () => {
  it('mostra o andamento, termina com o resultado, recarrega a lista 1 vez e o resultado some ao sair de novo', async () => {
    const user = userEvent.setup()
    const firstChanged = vi.fn()
    const first = render(<Card onChanged={firstChanged} />)
    await user.upload(fileInput(first.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))
    first.unmount()

    const secondChanged = vi.fn()
    const second = render(<Card onChanged={secondChanged} />)
    expect(await screen.findByText('Enviando 2 de 3…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeDisabled()
    expect(secondChanged).not.toHaveBeenCalled()

    await finishUpload(1)
    await waitFor(() => expect(uploads).toHaveLength(3))
    expect(await screen.findByText('Enviando 3 de 3…')).toBeInTheDocument()
    await finishUpload(2)
    expect(await screen.findByText('3 COAs enviados.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeEnabled()
    await waitFor(() => expect(secondChanged).toHaveBeenCalledTimes(1))
    expect(firstChanged).not.toHaveBeenCalled()

    // O resultado já foi visto: ao sair e voltar de novo, ele não reaparece.
    second.unmount()
    await act(async () => flush())
    render(<Card />)
    expect(screen.queryByText('3 COAs enviados.')).not.toBeInTheDocument()
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(3)
  })

  it('envio que termina com a tela fechada não chama a recarga (a montagem já carrega) e o resultado aparece ao voltar', async () => {
    const user = userEvent.setup()
    const first = render(<Card />)
    await user.upload(fileInput(first.container), syn(2))
    await waitFor(() => expect(uploads).toHaveLength(1))
    first.unmount()
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))
    await finishUpload(1)

    const onChanged = vi.fn()
    render(<Card onChanged={onChanged} />)
    expect(await screen.findByText('2 COAs enviados.')).toBeInTheDocument()
    await settle()
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('trocar de processo', () => {
  it('os uploads seguem no processo de origem; o card do outro processo não mostra o progresso nem recarrega', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const view = render(<Card processId="p1" onChanged={onChanged} />)
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))

    view.rerender(<Card processId="p2" onChanged={onChanged} />)
    expect(screen.queryByText(/Enviando \d+ de \d+/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar COA' })).toBeEnabled()

    await finishUpload(1)
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2)
    await settle()

    expect(uploads.map((item) => item.processId)).toEqual(['p1', 'p1', 'p1'])
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.queryByText(/COAs enviados/)).not.toBeInTheDocument()

    // Ao voltar para o processo de origem o resultado dele aparece.
    view.rerender(<Card processId="p1" onChanged={onChanged} />)
    expect(await screen.findByText('3 COAs enviados.')).toBeInTheDocument()
  })

  it('o processo de destino pode enviar o seu próprio lote enquanto o de origem ainda sobe', async () => {
    const user = userEvent.setup()
    const view = render(<Card processId="p1" />)
    await user.upload(fileInput(view.container), syn(2))
    await waitFor(() => expect(uploads).toHaveLength(1))

    view.rerender(<Card processId="p2" />)
    await user.upload(fileInput(view.container), pdf('SYN-9.pdf'))
    await waitFor(() => expect(uploads).toHaveLength(2))
    expect(uploads.map((item) => item.processId)).toEqual(['p1', 'p2'])
  })
})

describe('sessão trocada no meio do envio', () => {
  it.each([
    ['logout', null],
    ['troca de usuário', { uid: 'admin-2', role: 'admin' }],
    ['perda do perfil de admin', { uid: 'admin-1', role: 'logistica' }],
  ])('%s: os restantes não sobem, nada novo entra na fila e não há toast', async (_label, next) => {
    setCoaAutoReadActor({ uid: 'admin-1', role: 'admin' })
    const user = userEvent.setup()
    const view = render(
      <Shell show>
        <Card />
      </Shell>
    )
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))
    await waitFor(() => expect(reads).toHaveLength(1))

    view.rerender(<Shell show={false} />)
    act(() => setCoaAutoReadActor(next))
    await finishUpload(1)
    await settle()
    reads[0].resolve(readResult(read('new1')))
    await settle()

    expect(uploads).toHaveLength(2)
    expect(readIds()).toEqual(['new1'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('relatório fechado', () => {
  it('a leitura do 1º devolve report-closed com a tela fechada: os uploads continuam, o resto não é lido e não há aviso', async () => {
    const user = userEvent.setup()
    const view = render(
      <Shell show>
        <Card />
      </Shell>
    )
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(reads).toHaveLength(1))
    await waitFor(() => expect(uploads).toHaveLength(2))

    view.rerender(<Shell show={false} />)
    await act(async () => {
      reads[0].reject(Object.assign(new Error('fechado'), { code: 'report-closed' }))
    })
    await finishUpload(1)
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2)
    await settle()

    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(3)
    expect(readIds()).toEqual(['new1'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('teto de 50 COAs', () => {
  it('49 na lista + 1 escolhido sobe; 49 + 2 é barrado antes do upload', async () => {
    const user = userEvent.setup()
    const view = render(<Card documents={existing(49)} />)
    await user.upload(fileInput(view.container), syn(2))
    expect(await screen.findByText('Limite de 50 COAs por processo. Cabem mais 1; você escolheu 2.')).toBeInTheDocument()
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()

    await user.upload(fileInput(view.container), syn(1))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    expect(await screen.findByText('1 COA enviado.')).toBeInTheDocument()
  })

  it('durante o envio, remontar com a lista recarregada pela metade e escolher mais 1 é recusado (chave ocupada)', async () => {
    const user = userEvent.setup()
    const first = render(<Card documents={existing(48)} />)
    await user.upload(fileInput(first.container), syn(2))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))
    first.unmount()

    // A lista já mostra 49 (1 vaga), mas o envio da chave ainda não terminou.
    const second = render(<Card documents={existing(49)} />)
    expect(await screen.findByText('Enviando 2 de 2…')).toBeInTheDocument()
    await user.upload(fileInput(second.container), pdf('SYN-9.pdf'))
    await settle()
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2)

    await finishUpload(1)
    expect(await screen.findByText('2 COAs enviados.')).toBeInTheDocument()
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2)
  })

  it('PO diferentes têm tetos e envios independentes', async () => {
    const user = userEvent.setup()
    const one = render(<Cell po="PO-1" documents={[]} />)
    await user.upload(fileInput(one.container), syn(1))
    const two = render(<Cell po="PO-2" documents={[]} />)
    await user.upload(fileInput(two.container), syn(1))
    await waitFor(() => expect(uploads).toHaveLength(2))
    expect(uploads.map((item) => item.args.po)).toEqual(['PO-1', 'PO-2'])
  })
})

describe('consolidado sem PO', () => {
  it('a célula sem PO não envia e mostra o motivo', async () => {
    const user = userEvent.setup()
    const view = render(<Cell po="" />)
    await user.upload(fileInput(view.container), syn(2))
    expect(await screen.findByText('Escolha a PO do COA antes de enviar.')).toBeInTheDocument()
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })
})

describe('duplo envio e StrictMode', () => {
  it('dois envios seguidos e render em StrictMode produzem um único envio (N chamadas para N arquivos)', async () => {
    const user = userEvent.setup()
    const view = render(
      <StrictMode>
        <Card />
      </StrictMode>
    )
    const input = fileInput(view.container)
    await user.upload(input, syn(3))
    await user.upload(input, syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await settle()
    expect(uploads).toHaveLength(1)

    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))
    await finishUpload(1)
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2)
    expect(await screen.findByText('3 COAs enviados.')).toBeInTheDocument()
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(3)
  })
})

describe('falha parcial', () => {
  it('com a tela fechada: 1 toast de erro com o texto combinado; ao voltar, o erro do arquivo está no card', async () => {
    const user = userEvent.setup()
    const view = render(
      <Shell show>
        <Card />
      </Shell>
    )
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))

    view.rerender(<Shell show={false} />)
    await failUpload(1)
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2)

    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent(
      'Envio de COA: 1 de 3 arquivos não foram enviados. Abra a aba Documentos do processo para ver quais.'
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    view.rerender(
      <Shell show>
        <Card />
      </Shell>
    )
    expect(await screen.findByText('2 de 3 COAs enviados.')).toBeInTheDocument()
    expect(screen.getByText(/SYN-2\.pdf:/)).toBeInTheDocument()
  })

  it('com a tela aberta: erro inline em coa-errors e nenhum toast', async () => {
    const user = userEvent.setup()
    const view = render(
      <Shell show>
        <Card />
      </Shell>
    )
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))
    await failUpload(1)
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2)

    expect(await screen.findByText(/SYN-2\.pdf:/)).toBeInTheDocument()
    expect(view.container.querySelectorAll('.coa-errors')).toHaveLength(1)
    expect(view.container.querySelector('.toast-container')).toBeNull()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('erro de permissão com a tela fechada interrompe o lote: os restantes não sobem e o toast conta todos', async () => {
    const user = userEvent.setup()
    const view = render(
      <Shell show>
        <Card />
      </Shell>
    )
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(uploads).toHaveLength(1))
    view.rerender(<Shell show={false} />)
    await failUpload(0, Object.assign(new Error('negado'), { code: 'storage/unauthorized' }))
    await settle()

    expect(uploads).toHaveLength(1)
    expect(await screen.findByRole('alert')).toHaveTextContent('3 de 3 arquivos não foram enviados')
  })

  it('sem ToastProvider: falha com a tela fechada não lança e o erro aparece ao voltar', async () => {
    const user = userEvent.setup()
    const first = render(<Card />)
    await user.upload(fileInput(first.container), syn(2))
    await waitFor(() => expect(uploads).toHaveLength(1))
    first.unmount()
    await failUpload(0)
    await waitFor(() => expect(uploads).toHaveLength(2))
    await finishUpload(1)
    await settle()

    render(<Card />)
    expect(await screen.findByText(/SYN-1\.pdf:/)).toBeInTheDocument()
    expect(screen.getByText('1 de 2 COAs enviados.')).toBeInTheDocument()
  })
})
