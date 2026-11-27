// S11-H (L157): a leitura automática do COA enfileira CADA arquivo assim que ele sobe com sucesso (não no fim do lote) e
// não perde o que já subiu se a tela for fechada no meio do envio. Upload e callable `readProcessCoa` mockados (nunca
// chama a Tess). Dados inventados (ACME / SYN-…). A fila é um store de módulo: `resetCoaAutoRead()` isola cada teste.
//
// ATENÇÃO à ordem: o 1º teste precisa ser o "logout antes de o 1º arquivo subir": ele só prova que o envio assina a
// sessão (e não só o 1º enfileiramento) se a fila ainda não assinou nada neste módulo (`watchingSession` não é zerado
// por `resetCoaAutoRead`).
import { StrictMode, useState } from 'react'
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
import { resetCoaUploads } from '../../src/features/processes/coaUploadStore'
import useCoaReadBadges from '../../src/features/processes/useCoaReadBadges'

const ADMIN = { uid: 'admin-1', name: 'Admin ACME', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Ana', role: 'logistica' }

const HINT = 'Cada arquivo pode levar até 2 minutos.'
const statusText = (done, total) => `Lendo os COAs: ${done} de ${total}. ${HINT}`
const READING = /Lendo os COAs: (\d+) de (\d+)\./

const pdf = (name) => new File(['x'], name, { type: 'application/pdf' })
const coaDocument = (id, overrides = {}) => ({
  id,
  type: 'coaOriginal',
  slotKey: `coaOriginal:${id}`,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  size: 2048,
  uploadedAt: '2026-11-26T10:00:00.000Z',
  uploadedByName: 'Admin ACME',
  ...overrides,
})
const read = (documentId) => ({ documentId, status: 'done', documentType: 'coa', certificates: [{ batchNumber: 'SYN-L1' }], error: null })
const readResult = (value) => ({ status: value.status, cached: false, read: value })

// Cada upload fica pendente até o teste concluir (prova que a fila não espera o lote).
let uploads
function pendingUploads() {
  uploads = []
  mockUploadProcessDocument.mockImplementation(
    (processId, { file, po }) => new Promise((resolve, reject) => uploads.push({ processId, file, po, resolve, reject }))
  )
}
const finishUpload = (index, id, overrides = {}) =>
  act(async () => {
    uploads[index].resolve(coaDocument(id, { name: uploads[index].file.name, ...overrides }))
  })

// Leituras também pendentes: cada chamada da callable espera o teste (prova a ordem e o "um por vez").
let reads
let maxParallel
let inFlight
function pendingReads() {
  reads = []
  inFlight = 0
  maxParallel = 0
  mockReadProcessCoa.mockImplementation((processId, documentId, options) => {
    inFlight += 1
    maxParallel = Math.max(maxParallel, inFlight)
    return new Promise((resolve, reject) =>
      reads.push({
        processId,
        documentId,
        options,
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

function Panel({ profile = ADMIN, category = 'FCL', processId = 'p1' }) {
  const [documents, setDocuments] = useState([])
  const badges = useCoaReadBadges({ processId, documents, enabled: profile.role === 'admin' })
  const onChanged = () => setDocuments((current) => current)
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
// S11-J: o aviso da fila é um botão-ícone com pop-up; o mesmo texto vai para uma região `status` oculta (leitor de tela).
const BUSY_NOTICE = 'Leitura automática interrompida: Outra leitura de COA está em andamento. Tente de novo em 1 minuto. Use Ler COAs no formulário.'
async function expectNotice(message, name = 'Leitura automática interrompida') {
  const [button] = await screen.findAllByRole('button', { name })
  const tip = screen.getAllByRole('tooltip').find((node) => node.textContent === message)
  expect(tip).toBeTruthy()
  expect(button).toHaveAccessibleDescription(message)
  const region = screen.getAllByRole('status').find((node) => node.textContent === message)
  expect(region).toHaveClass('documents-visually-hidden')
  return button
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = async () => {
  for (let index = 0; index < 4; index += 1) await act(async () => flush())
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

describe('logout durante o envio', () => {
  it('logout ANTES de o 1º arquivo subir: nada do envio antigo entra na fila (nem para quem entra depois)', async () => {
    setCoaAutoReadActor({ uid: ADMIN.uid, role: 'admin' })
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))

    act(() => setCoaAutoReadActor(null))
    act(() => setCoaAutoReadActor({ uid: 'admin-2', role: 'admin' }))
    await finishUpload(0, 'new1')
    await settle()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(screen.queryByText(/Lendo os COAs|Na fila/)).not.toBeInTheDocument()
    // S11-I: o envio antigo não começa mais nenhum arquivo depois da troca de sessão.
    expect(uploads).toHaveLength(1)
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1)
  })

  it('logout no meio do lote: o arquivo que sobe depois da troca de sessão não entra; o que já estava na fila foi limpo', async () => {
    setCoaAutoReadActor({ uid: ADMIN.uid, role: 'admin' })
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'new1')
    await waitFor(() => expect(reads).toHaveLength(1))
    await waitFor(() => expect(uploads).toHaveLength(2))

    act(() => setCoaAutoReadActor({ uid: 'admin-2', role: 'admin' }))
    await finishUpload(1, 'new2')
    await settle()
    // O 1º já estava na callable (termina sozinho); o 2º, que subiu na sessão nova, nunca entra.
    reads[0].resolve(readResult(read('new1')))
    await settle()
    expect(readIds()).toEqual(['new1'])
    expect(screen.queryByText(/Lendo os COAs|Na fila/)).not.toBeInTheDocument()
  })

  it('logout no meio de um lote de 3: o 2º já estava subindo e termina; o 3º não sobe', async () => {
    setCoaAutoReadActor({ uid: ADMIN.uid, role: 'admin' })
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf'), pdf('SYN-3.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'new1')
    await waitFor(() => expect(uploads).toHaveLength(2))

    act(() => setCoaAutoReadActor({ uid: 'admin-2', role: 'admin' }))
    await finishUpload(1, 'new2')
    await settle()
    expect(uploads).toHaveLength(2)
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Enviando \d+ de \d+/)).not.toBeInTheDocument()
  })

  it('perder o perfil de admin no meio do envio também invalida o resto', async () => {
    setCoaAutoReadActor({ uid: ADMIN.uid, role: 'admin' })
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    act(() => setCoaAutoReadActor({ uid: ADMIN.uid, role: 'logistica' }))
    await finishUpload(0, 'new1')
    await settle()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    // S11-I: o 2º arquivo também não sobe.
    expect(uploads).toHaveLength(1)
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1)
  })
})

describe('card do COA: cada arquivo entra na fila ao subir', () => {
  it('lote de 3 PDFs: a 1ª leitura começa ANTES de a 3ª subir e o contador acompanha o lote', async () => {
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf'), pdf('SYN-3.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    expect(mockReadProcessCoa).not.toHaveBeenCalled()

    await finishUpload(0, 'new1')
    // A 1ª já está na callable enquanto a 2ª sobe (e a 3ª nem começou).
    await waitFor(() => expect(reads).toHaveLength(1))
    expect(reads[0]).toMatchObject({ processId: 'p1', documentId: 'new1', options: { force: false } })
    expect(await screen.findByText(statusText(1, 1))).toBeInTheDocument()
    await waitFor(() => expect(uploads).toHaveLength(2))

    await finishUpload(1, 'new2')
    expect(await screen.findByText(statusText(1, 2))).toBeInTheDocument()
    await waitFor(() => expect(uploads).toHaveLength(3))
    expect(reads).toHaveLength(1)

    await finishUpload(2, 'new3')
    expect(await screen.findByText(statusText(1, 3))).toBeInTheDocument()

    reads[0].resolve(readResult(read('new1')))
    expect(await screen.findByText(statusText(2, 3))).toBeInTheDocument()
    await waitFor(() => expect(reads).toHaveLength(2))
    reads[1].resolve(readResult(read('new2')))
    expect(await screen.findByText(statusText(3, 3))).toBeInTheDocument()
    await waitFor(() => expect(reads).toHaveLength(3))
    reads[2].resolve(readResult(read('new3')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(readIds()).toEqual(['new1', 'new2', 'new3'])
    expect(maxParallel).toBe(1)
  })

  it('contador X de Y: X nunca passa de Y e Y nunca diminui enquanto o lote sobe e é lido', async () => {
    const seen = []
    const observer = new MutationObserver(() => {
      const text = document.body.textContent ?? ''
      const match = READING.exec(text)
      if (match) seen.push([Number(match[1]), Number(match[2])])
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    try {
      const user = userEvent.setup()
      const { container } = render(<Panel />)
      await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf'), pdf('SYN-3.pdf')])
      for (let index = 0; index < 3; index += 1) {
        await waitFor(() => expect(uploads).toHaveLength(index + 1))
        await finishUpload(index, `new${index + 1}`)
        await act(async () => flush())
      }
      for (let index = 0; index < 3; index += 1) {
        await waitFor(() => expect(reads).toHaveLength(index + 1))
        reads[index].resolve(readResult(read(`new${index + 1}`)))
        await act(async () => flush())
      }
      await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    } finally {
      observer.disconnect()
    }
    expect(seen.length).toBeGreaterThan(0)
    let lastTotal = 0
    for (const [done, total] of seen) {
      expect(done).toBeLessThanOrEqual(total)
      expect(total).toBeGreaterThanOrEqual(lastTotal)
      lastTotal = total
    }
    expect(lastTotal).toBe(3)
  })

  it('sair da tela depois do 1º upload e antes do 2º (S11-I): o envio continua, os 3 sobem e os 3 são lidos, em ordem', async () => {
    let unmount
    let sentCount = 0
    mockUploadProcessDocument.mockReset().mockImplementation(async (_processId, { file }) => {
      // O upload devolve já com o componente fora da tela (o admin saiu da aba durante o envio).
      unmount?.()
      unmount = undefined
      sentCount += 1
      return coaDocument(`new${sentCount}`, { name: file.name })
    })
    const user = userEvent.setup()
    const view = render(<Panel />)
    unmount = view.unmount
    await user.upload(inputs(view.container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf'), pdf('SYN-3.pdf')])
    for (let index = 0; index < 3; index += 1) {
      await waitFor(() => expect(reads).toHaveLength(index + 1))
      expect(reads[index].documentId).toBe(`new${index + 1}`)
      reads[index].resolve(readResult(read(`new${index + 1}`)))
      await settle()
    }
    expect(readIds()).toEqual(['new1', 'new2', 'new3'])
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(3)
    expect(maxParallel).toBe(1)
    const reactWarnings = console.error.mock.calls.filter((call) => /unmounted|not wrapped in act/i.test(String(call[0])))
    expect(reactWarnings).toEqual([])
  })

  it('desmontar com um upload em andamento: o arquivo que termina de subir entra na fila e é lido', async () => {
    const user = userEvent.setup()
    const view = render(<Panel />)
    await user.upload(inputs(view.container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf'), pdf('SYN-3.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'new1')
    await waitFor(() => expect(uploads).toHaveLength(2))

    view.unmount()
    await finishUpload(1, 'new2')
    await waitFor(() => expect(reads).toHaveLength(1))
    reads[0].resolve(readResult(read('new1')))
    await waitFor(() => expect(reads).toHaveLength(2))
    expect(reads[1].documentId).toBe('new2')
    reads[1].resolve(readResult(read('new2')))
    // S11-I: o laço segue depois do desmonte; o 3º arquivo também sobe e é lido.
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2, 'new3')
    await waitFor(() => expect(reads).toHaveLength(3))
    reads[2].resolve(readResult(read('new3')))
    await settle()
    expect(readIds()).toEqual(['new1', 'new2', 'new3'])
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(3)
  })

  it('envio iniciado sem a leitura habilitada (não-admin): nada entra, mesmo subindo normalmente', async () => {
    const { container } = render(<Panel profile={LOGISTICA} />)
    expect(inputs(container)).toHaveLength(0)
    await settle()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('upload que falha não entra; no lote só os que subiram são lidos, na ordem em que subiram', async () => {
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf'), pdf('SYN-3.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await act(async () => {
      // S11-I (D-3): erro de permissão interrompe o lote; aqui o erro é só do arquivo (rede), o lote segue.
      uploads[0].reject(Object.assign(new Error('x'), { code: 'storage/retry-limit-exceeded' }))
    })
    await waitFor(() => expect(uploads).toHaveLength(2))
    await finishUpload(1, 'new2')
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2, 'new3')
    await waitFor(() => expect(reads).toHaveLength(1))
    expect(reads[0].documentId).toBe('new2')
    reads[0].resolve(readResult(read('new2')))
    await waitFor(() => expect(reads).toHaveLength(2))
    expect(reads[1].documentId).toBe('new3')
    reads[1].resolve(readResult(read('new3')))
    await settle()
    expect(readIds()).toEqual(['new2', 'new3'])
  })

  it('arquivo que não é PDF sobe e é pulado em silêncio; o PDF do mesmo lote é lido', async () => {
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [
      new File(['x'], 'SYN-1.docx', { type: 'application/msword' }),
      pdf('SYN-2.pdf'),
    ])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'w1', { mimeType: 'application/msword', name: 'SYN-1.docx' })
    await waitFor(() => expect(uploads).toHaveLength(2))
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    await finishUpload(1, 'new2')
    await waitFor(() => expect(reads).toHaveLength(1))
    expect(reads[0].documentId).toBe('new2')
    reads[0].resolve(readResult(read('new2')))
    await settle()
    expect(readIds()).toEqual(['new2'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('o mesmo documentId devolvido duas vezes (lote reenviado) gera UMA leitura', async () => {
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-1-copia.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'dup1')
    await waitFor(() => expect(uploads).toHaveLength(2))
    await finishUpload(1, 'dup1')
    await waitFor(() => expect(reads).toHaveLength(1))
    reads[0].resolve(readResult(read('dup1')))
    await settle()
    expect(readIds()).toEqual(['dup1'])

    // Reenviar o mesmo documento depois da fila esvaziar também não lê de novo.
    await user.upload(inputs(container)[0], pdf('SYN-1.pdf'))
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2, 'dup1')
    await settle()
    expect(readIds()).toEqual(['dup1'])
  })

  it('erro de serviço na 1ª leitura com o lote ainda subindo: o arquivo que sobe depois não é lido e o aviso fica', async () => {
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'new1')
    await waitFor(() => expect(reads).toHaveLength(1))
    await waitFor(() => expect(uploads).toHaveLength(2))
    await act(async () => {
      reads[0].reject(Object.assign(new Error('busy'), { code: 'busy' }))
    })
    await expectNotice(BUSY_NOTICE)
    await finishUpload(1, 'new2')
    await settle()
    expect(readIds()).toEqual(['new1'])
    expect(screen.getByRole('button', { name: 'Leitura automática interrompida' })).toBeInTheDocument()
  })

  it('report-closed na 1ª leitura com o lote ainda subindo: o arquivo que sobe depois não é lido (silêncio)', async () => {
    const user = userEvent.setup()
    const { container } = render(<Panel />)
    await user.upload(inputs(container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'new1')
    await waitFor(() => expect(reads).toHaveLength(1))
    await waitFor(() => expect(uploads).toHaveLength(2))
    await act(async () => {
      reads[0].reject(Object.assign(new Error('closed'), { code: 'report-closed' }))
    })
    await finishUpload(1, 'new2')
    await settle()
    expect(readIds()).toEqual(['new1'])
    expect(screen.queryByText(/Leitura automática interrompida|Lendo os COAs|Na fila/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('StrictMode (efeitos duplos) e remontagem não duplicam nem perdem a leitura', async () => {
    const user = userEvent.setup()
    const first = render(
      <StrictMode>
        <Panel />
      </StrictMode>
    )
    await user.upload(inputs(first.container)[0], [pdf('SYN-1.pdf'), pdf('SYN-2.pdf')])
    await waitFor(() => expect(uploads).toHaveLength(1))
    await finishUpload(0, 'new1')
    await waitFor(() => expect(reads).toHaveLength(1))
    first.unmount()

    const second = render(
      <StrictMode>
        <Panel />
      </StrictMode>
    )
    // S11-I: o envio da 1ª montagem segue no store; a 2ª montagem vê o andamento e não abre um 2º envio na mesma chave.
    expect(await screen.findByText('Enviando 2 de 2…')).toBeInTheDocument()
    expect(second.container.querySelector('button[disabled]')).not.toBeNull()
    await user.upload(inputs(second.container)[0], pdf('SYN-1.pdf'))
    await settle()
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(2)
    await finishUpload(1, 'new2')
    await waitFor(() => expect(screen.queryByText(/Enviando \d+ de \d+/)).not.toBeInTheDocument())
    reads[0].resolve(readResult(read('new1')))
    await waitFor(() => expect(reads).toHaveLength(2))
    reads[1].resolve(readResult(read('new2')))
    await settle()
    expect(readIds()).toEqual(['new1', 'new2'])
  })
})

describe('CONSOLIDADO: células por PO na mesma fila', () => {
  it('duas células enviando ao mesmo tempo: uma leitura por vez, na ordem em que os arquivos sobem', async () => {
    const user = userEvent.setup()
    const { container } = render(<Panel category="CONSOLIDADO" />)
    const [one, two] = inputs(container)
    await user.upload(one, [pdf('SYN-A1.pdf'), pdf('SYN-A2.pdf')])
    await user.upload(two, pdf('SYN-B1.pdf'))
    await waitFor(() => expect(uploads).toHaveLength(2))
    expect(uploads.map((entry) => entry.po)).toEqual(['PO-1', 'PO-2'])

    // O arquivo da PO-2 sobe primeiro: entra primeiro na fila.
    await finishUpload(1, 'b1')
    await waitFor(() => expect(reads).toHaveLength(1))
    expect(reads[0].documentId).toBe('b1')
    const cells = container.querySelectorAll('td')
    expect(within(cells[1]).getByText(statusText(1, 1))).toBeInTheDocument()

    await finishUpload(0, 'a1')
    await waitFor(() => expect(uploads).toHaveLength(3))
    await finishUpload(2, 'a2')
    await act(async () => flush())
    expect(reads).toHaveLength(1)
    expect(within(cells[0]).getByText('Na fila para leitura.')).toBeInTheDocument()

    reads[0].resolve(readResult(read('b1')))
    await waitFor(() => expect(reads).toHaveLength(2))
    expect(reads[1].documentId).toBe('a1')
    expect(within(cells[0]).getByText(statusText(1, 2))).toBeInTheDocument()
    reads[1].resolve(readResult(read('a1')))
    await waitFor(() => expect(reads).toHaveLength(3))
    expect(reads[2].documentId).toBe('a2')
    reads[2].resolve(readResult(read('a2')))
    await waitFor(() => expect(screen.queryByText(/Lendo os COAs/)).not.toBeInTheDocument())
    expect(readIds()).toEqual(['b1', 'a1', 'a2'])
    expect(maxParallel).toBe(1)
  })
})
