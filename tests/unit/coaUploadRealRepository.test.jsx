// S11-J: o envio de COA com o `uploadProcessDocument` REAL (Firebase/Storage mockados no nível do SDK, com um
// Firestore em memória) e o painel, a fila e o store reais. Só a callable `readProcessCoa` (Tess) é simulada.
// Cobre sair da aba/trocar de processo durante e depois do envio, PDF com `file.type` vazio ou fora do padrão,
// card e célula por PO, com e sem StrictMode. Dados inventados (ACME, SYN-n.pdf). Fica em tests/unit.
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const db = new Map()
let serial = 0
let latency = 3
const delay = () => new Promise((resolve) => setTimeout(resolve, latency))

vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: true,
  firestore: { fake: 'firestore' },
  storage: { fake: 'storage' },
  auth: null,
  firebaseConfig: { projectId: 'demo' },
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: (_fs, ...segments) => ({ path: segments.join('/') }),
  doc: (parent, ...segments) =>
    segments.length > 0
      ? { path: [parent?.path ?? '', ...segments].join('/'), id: segments[segments.length - 1] }
      : { path: `${parent.path}/auto${(serial += 1)}`, id: `auto${serial}` },
  setDoc: async (ref, payload) => {
    await delay()
    db.set(ref.path, payload)
  },
  getDocs: async (source) => {
    await delay()
    const prefix = `${source.path}/`
    const docs = [...db.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({
        id: path.slice(prefix.length),
        data: () => ({ ...data, uploadedAt: { toDate: () => new Date('2026-11-27T10:00:00.000Z') } }),
      }))
    return { docs }
  },
  query: (source) => source,
  where: () => ({}),
  serverTimestamp: () => ({ sentinel: true }),
  deleteDoc: async () => {},
  updateDoc: async () => {},
  writeBatch: () => ({ update: () => {}, delete: () => {}, commit: async () => {} }),
}))

const storageObjects = []
vi.mock('firebase/storage', () => ({
  ref: (_storage, path) => ({ path }),
  uploadBytes: async (reference, file, metadata) => {
    await delay()
    storageObjects.push({ path: reference.path, contentType: metadata?.contentType, name: file.name })
  },
  deleteObject: async () => {},
}))

const mockReadProcessCoa = vi.fn()
const mockListCoaReads = vi.fn()
vi.mock('../../src/services/coaReadsRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readProcessCoa: (...args) => mockReadProcessCoa(...args),
    listCoaReads: (...args) => mockListCoaReads(...args),
  }
})
vi.mock('../../src/services/processEventsRepository', () => ({ listProcessEvents: vi.fn().mockResolvedValue([]) }))
vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: vi.fn().mockRejectedValue(new Error('sem relatório')),
  getCargoConferenceDamage: vi.fn().mockRejectedValue(new Error('sem avaria')),
}))

import { ToastProvider } from '../../src/components/Toast'
import ProcessDocumentsPanel from '../../src/features/processes/ProcessDocumentsPanel'
import { resetCoaAutoRead } from '../../src/features/processes/coaAutoReadQueue'
import { setCoaAutoReadActor } from '../../src/features/processes/coaAutoReadSession'
import { resetCoaUploads } from '../../src/features/processes/coaUploadStore'

const ADMIN = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const FCL = { id: 'p1', name: 'Resina ACME', category: 'FCL', processNumber: 'SYN-1', items: [], containers: [] }
const OTHER = { ...FCL, id: 'p2' }
const CONSOLIDATED = {
  ...FCL,
  category: 'CONSOLIDADO',
  purchaseOrders: [
    { po: '9010', reference: 'ACME SEA 1' },
    { po: '9011', reference: 'ACME SEA 2' },
  ],
}

const file = (name, type = 'application/pdf') => new File(['%PDF-1.4 x'], name, { type })
const syn = (count, type) => Array.from({ length: count }, (_, index) => file(`SYN-${index + 1}.pdf`, type))
const fileInput = (container, label) =>
  container.querySelector(`input[aria-label="${label ?? 'Selecionar arquivos de COA Original'}"]`)
const readIds = () => mockReadProcessCoa.mock.calls.map((call) => call[1])
const storedDocs = (processId) => [...db.entries()].filter(([path]) => path.startsWith(`processes/${processId}/documents/`))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = async (rounds = 12) => {
  for (let index = 0; index < rounds; index += 1) await act(async () => flush())
}

function Screen({ show = true, process = FCL, strict = false }) {
  const body = (
    <ToastProvider>{show ? <ProcessDocumentsPanel process={process} profile={ADMIN} variant="desktop" /> : null}</ToastProvider>
  )
  return strict ? <StrictMode>{body}</StrictMode> : body
}

async function loaded() {
  await waitFor(() => expect(screen.queryByLabelText('Carregando documentos')).not.toBeInTheDocument())
}

beforeEach(() => {
  db.clear()
  storageObjects.length = 0
  serial = 0
  latency = 3
  vi.clearAllMocks()
  resetCoaAutoRead()
  resetCoaUploads()
  setCoaAutoReadActor({ uid: 'admin-1', role: 'admin' })
  mockListCoaReads.mockResolvedValue({})
  mockReadProcessCoa.mockImplementation(async (_processId, documentId) => ({
    status: 'done',
    cached: false,
    read: { documentId, status: 'done', documentType: 'coa', certificates: [], error: null },
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetCoaAutoRead()
  resetCoaUploads()
  vi.restoreAllMocks()
})

describe.each([
  ['sem StrictMode', false],
  ['com StrictMode', true],
])('card do COA (%s)', (_label, strict) => {
  it('ficando na tela: a lista recarrega com os arquivos e os 3 são lidos', async () => {
    const user = userEvent.setup()
    const view = render(<Screen strict={strict} />)
    await loaded()
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(readIds()).toHaveLength(3), { timeout: 3000 })
    expect(await screen.findByText('3 arquivos')).toBeInTheDocument()
    expect(storedDocs('p1')).toHaveLength(3)
    expect(new Set(readIds()).size).toBe(3)
  })

  it('saindo da aba logo após o 1º arquivo: os demais sobem e os 3 são lidos', async () => {
    const user = userEvent.setup()
    latency = 15
    const view = render(<Screen strict={strict} />)
    await loaded()
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(storedDocs('p1').length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    view.rerender(<Screen strict={strict} show={false} />)
    await waitFor(() => expect(readIds()).toHaveLength(3), { timeout: 4000 })
    expect(storedDocs('p1')).toHaveLength(3)
    expect(new Set(readIds()).size).toBe(3)
  })

  it('saindo antes de o 1º arquivo terminar de subir: os 3 sobem e são lidos', async () => {
    const user = userEvent.setup()
    latency = 15
    const view = render(<Screen strict={strict} />)
    await loaded()
    await user.upload(fileInput(view.container), syn(3))
    view.rerender(<Screen strict={strict} show={false} />)
    await waitFor(() => expect(readIds()).toHaveLength(3), { timeout: 4000 })
    expect(storedDocs('p1')).toHaveLength(3)
  })

  it('saindo depois do envio terminar (leitura ainda na fila): as leituras seguem', async () => {
    const user = userEvent.setup()
    let release
    mockReadProcessCoa.mockImplementation(
      (_processId, documentId) =>
        new Promise((resolve) => {
          release = () =>
            resolve({ status: 'done', cached: false, read: { documentId, status: 'done', certificates: [], error: null } })
        })
    )
    const view = render(<Screen strict={strict} />)
    await loaded()
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(storedDocs('p1')).toHaveLength(3), { timeout: 3000 })
    await waitFor(() => expect(readIds()).toHaveLength(1))
    view.rerender(<Screen strict={strict} show={false} />)
    for (let index = 0; index < 3; index += 1) {
      await waitFor(() => expect(readIds()).toHaveLength(index + 1))
      await act(async () => release())
    }
    expect(new Set(readIds()).size).toBe(3)
  })

  it('trocar de processo no meio e voltar: p1 termina e é lido; p2 não recebe nada', async () => {
    const user = userEvent.setup()
    latency = 15
    const view = render(<Screen strict={strict} process={FCL} />)
    await loaded()
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(storedDocs('p1').length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    view.rerender(<Screen strict={strict} process={OTHER} />)
    await waitFor(() => expect(readIds()).toHaveLength(3), { timeout: 4000 })
    expect(storedDocs('p1')).toHaveLength(3)
    expect(storedDocs('p2')).toHaveLength(0)
    expect(mockReadProcessCoa.mock.calls.every((call) => call[0] === 'p1')).toBe(true)
    view.rerender(<Screen strict={strict} process={FCL} />)
    await loaded()
    expect(await screen.findByText('3 arquivos')).toBeInTheDocument()
  })
})

describe('célula de PO do consolidado', () => {
  it.each([
    ['ficando', false],
    ['saindo da aba no meio', true],
  ])('%s: os arquivos sobem e são lidos', async (_label, leave) => {
    const user = userEvent.setup()
    latency = 15
    const view = render(<Screen process={CONSOLIDATED} />)
    await loaded()
    await user.upload(fileInput(view.container, 'Selecionar arquivos de COA da PO 9010'), syn(2))
    if (leave) {
      await waitFor(() => expect(storedDocs('p1').length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
      view.rerender(<Screen process={CONSOLIDATED} show={false} />)
    }
    await waitFor(() => expect(readIds()).toHaveLength(2), { timeout: 4000 })
    expect(storedDocs('p1').every(([, data]) => data.poNumber === '9010')).toBe(true)
  })
})

describe('tipo do arquivo informado pelo navegador', () => {
  it.each([
    ['vazio (PDF do OneDrive/Explorer)', ''],
    ['maiúsculas', 'APPLICATION/PDF'],
  ])('PDF com file.type %s é gravado como application/pdf e lido', async (_label, type) => {
    const user = userEvent.setup()
    const view = render(<Screen />)
    await loaded()
    await user.upload(fileInput(view.container), [file('SYN-1.pdf', type)], { applyAccept: false })
    await waitFor(() => expect(readIds()).toHaveLength(1), { timeout: 3000 })
    expect(storedDocs('p1')[0][1].mimeType).toBe('application/pdf')
    expect(storageObjects[0].contentType).toBe('application/pdf')
  })

  it('application/x-pdf é recusado no envio (nada sobe, nada é lido) e o erro aparece na tela', async () => {
    const user = userEvent.setup()
    const view = render(<Screen />)
    await loaded()
    await user.upload(fileInput(view.container), [file('SYN-1.pdf', 'application/x-pdf')], { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Tipo de arquivo não permitido')
    expect(storedDocs('p1')).toHaveLength(0)
    expect(readIds()).toHaveLength(0)
  })
})

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const NOT_PDF_LINE = 'Leitura automática não iniciada: só PDF é lido automaticamente.'
const CLOSED_NOTE = 'O relatório já foi fechado; a leitura de COA é só no rascunho.'
const statusLine = (text) => screen.queryAllByRole('status').find((node) => node.textContent === text)
// O aviso é um botão-ícone com pop-up (texto exato no tooltip) e a região oculta repete o texto para leitor de tela.
const noticeShown = (text, name = 'Leitura automática não iniciada') =>
  screen.queryAllByRole('button', { name }).length > 0 &&
  screen.queryAllByRole('tooltip').some((node) => node.textContent === text) &&
  statusLine(text)?.classList.contains('documents-visually-hidden') === true

describe('falha visível: leitura automática não iniciada (S11-J)', () => {
  it('arquivo que não é PDF sobe e a tela diz por que não foi lido (ficando e ao voltar)', async () => {
    const user = userEvent.setup()
    const view = render(<Screen />)
    await loaded()
    await user.upload(fileInput(view.container), [file('SYN-1.docx', DOCX)], { applyAccept: false })
    await waitFor(() => expect(storedDocs('p1')).toHaveLength(1), { timeout: 3000 })
    await waitFor(() => expect(noticeShown(NOT_PDF_LINE)).toBe(true))
    expect(readIds()).toHaveLength(0)

    view.rerender(<Screen show={false} />)
    view.rerender(<Screen />)
    await loaded()
    await waitFor(() => expect(noticeShown(NOT_PDF_LINE)).toBe(true))
    expect(readIds()).toHaveLength(0)
  })

  it('lote misto: o aviso do não-PDF permanece e o PDF é lido (uma vez)', async () => {
    const user = userEvent.setup()
    const view = render(<Screen />)
    await loaded()
    await user.upload(fileInput(view.container), [file('SYN-1.docx', DOCX), file('SYN-2.pdf')], { applyAccept: false })
    await waitFor(() => expect(readIds()).toHaveLength(1), { timeout: 3000 })
    await settle()
    expect(noticeShown(NOT_PDF_LINE)).toBe(true)
    expect(readIds()).toHaveLength(1)
  })

  it('um novo envio só com PDF limpa a linha do lote anterior', async () => {
    const user = userEvent.setup()
    const view = render(<Screen />)
    await loaded()
    await user.upload(fileInput(view.container), [file('SYN-1.docx', DOCX)], { applyAccept: false })
    await waitFor(() => expect(noticeShown(NOT_PDF_LINE)).toBe(true), { timeout: 3000 })
    await user.upload(fileInput(view.container), [file('SYN-2.pdf')])
    await waitFor(() => expect(readIds()).toHaveLength(1), { timeout: 3000 })
    await settle()
    expect(noticeShown(NOT_PDF_LINE)).toBe(false)
    expect(screen.queryByRole('button', { name: 'Leitura automática não iniciada' })).not.toBeInTheDocument()
  })

  it('célula de PO: o mesmo aviso aparece na célula da PO', async () => {
    const user = userEvent.setup()
    const view = render(<Screen process={CONSOLIDATED} />)
    await loaded()
    await user.upload(fileInput(view.container, 'Selecionar arquivos de COA da PO 9010'), [file('SYN-1.docx', DOCX)], {
      applyAccept: false,
    })
    await waitFor(() => expect(noticeShown(NOT_PDF_LINE)).toBe(true), { timeout: 3000 })
    expect(readIds()).toHaveLength(0)
  })

  it('report-closed na 1ª leitura: uma única chamada, os demais sobem sem ler e a nota fica visível ao voltar', async () => {
    const user = userEvent.setup()
    latency = 15
    mockReadProcessCoa.mockRejectedValue(Object.assign(new Error('fechado'), { code: 'report-closed' }))
    const view = render(<Screen />)
    await loaded()
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(readIds()).toHaveLength(1), { timeout: 3000 })
    view.rerender(<Screen show={false} />)
    await waitFor(() => expect(storedDocs('p1')).toHaveLength(3), { timeout: 4000 })
    await settle()
    expect(readIds()).toHaveLength(1)

    view.rerender(<Screen />)
    await loaded()
    await waitFor(() => expect(noticeShown(CLOSED_NOTE)).toBe(true))
    expect(readIds()).toHaveLength(1)
  })

  it('erro de serviço na 1ª leitura: o resto não é lido e o aviso de interrupção (não o de "não iniciada") fica', async () => {
    const user = userEvent.setup()
    latency = 15
    mockReadProcessCoa.mockRejectedValue(Object.assign(new Error('auth'), { code: 'tess-auth' }))
    const view = render(<Screen />)
    await loaded()
    await user.upload(fileInput(view.container), syn(3))
    await waitFor(() => expect(storedDocs('p1')).toHaveLength(3), { timeout: 4000 })
    await settle()
    expect(readIds()).toHaveLength(1)
    const lines = screen.queryAllByRole('status').filter((node) => /Leitura automática/.test(node.textContent))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveTextContent(/^Leitura automática interrompida: .* Use Ler COAs no formulário\.$/)
    expect(screen.getByRole('button', { name: 'Leitura automática interrompida' })).toBeInTheDocument()
  })
})
