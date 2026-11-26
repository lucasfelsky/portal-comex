// S10-J2b do Relatório de Carga: cartão "Avarias da conferência" (espelho `cargoReport/damage`) na aba Documentos.
// Repositórios mockados (espelho e download das fotos); nada de rede. Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { state } = vi.hoisted(() => ({ state: { configured: true } }))
const mockGetDamage = vi.fn()
const mockGetCargoReport = vi.fn()
const mockDownload = vi.fn()
const mockListProcessDocuments = vi.fn()

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return state.configured
  },
  firestore: null,
  auth: null,
}))
vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoConferenceDamage: (...args) => mockGetDamage(...args),
  getCargoReport: (...args) => mockGetCargoReport(...args),
}))
vi.mock('../../src/services/cargoConferencePhotosRepository', () => ({
  downloadCargoConferencePhotoBlob: (...args) => mockDownload(...args),
}))
vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: (...args) => mockListProcessDocuments(...args),
  uploadProcessDocument: vi.fn(),
  deleteProcessDocument: vi.fn(),
  downloadProcessDocumentBlob: vi.fn(),
  saveBlobAsFile: vi.fn(),
  setInvoicePackingListLink: vi.fn(),
  renameAdditionalDocument: vi.fn(),
}))
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/features/processes/CargoReportForm', () => ({
  default: () => <div data-testid="cargo-report-form" />,
}))

import CargoConferenceDamageCard from '../../src/features/processes/CargoConferenceDamageCard'
import ProcessDocumentsPanel from '../../src/features/processes/ProcessDocumentsPanel'
import { clearCargoPhotoCache } from '../../src/features/processes/useCargoPhotoUrls'

const PROCESS = { id: 'p1', name: 'Resina', category: 'FCL', processNumber: '4500128734', items: [], containers: [] }
const TITLE = 'Avarias da conferência'

const damage = (overrides = {}) => ({
  schemaVersion: 1,
  conferenceRevision: 4,
  closedDate: '2026-11-24',
  closedByName: 'Operador',
  receiptStatus: 'com_ressalva',
  pallets: { counted: 23, expected: 25 },
  items: [
    { rowId: 'r-1', index: 1, label: 'POLIOL X - TB 200KG', code: 'AD5240', note: 'Tambor amassado', flagged: true, photos: [] },
    {
      rowId: 'r-2',
      index: 2,
      label: 'RESINA Y - CX 25KG',
      code: '',
      note: 'Caixas molhadas',
      flagged: false,
      photos: [
        { id: 'f1', width: 400, height: 300 },
        { id: 'f2', width: null, height: null },
      ],
    },
  ],
  itemCount: 2,
  photoCount: 2,
  updatedAt: new Date(2026, 10, 24, 16, 5),
  ...overrides,
})

const withItems = (items, overrides = {}) => damage({ items, itemCount: items.length, ...overrides })

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
let consoleSpy

function renderCard(props = {}) {
  return render(<CargoConferenceDamageCard processId="p1" role="tecnico" reloadToken={0} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.configured = true
  clearCargoPhotoCache()
  mockGetDamage.mockResolvedValue(damage())
  mockGetCargoReport.mockResolvedValue({ current: null, conference: null })
  mockDownload.mockImplementation(async () => new Blob(['img']))
  mockListProcessDocuments.mockResolvedValue([])
  URL.createObjectURL = vi.fn(() => 'blob:foto')
  URL.revokeObjectURL = vi.fn()
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  consoleSpy.mockRestore()
})

describe('CargoConferenceDamageCard: conteúdo', () => {
  it('Técnico vê título, fechamento, resumo, pallets divergentes, recebimento, itens, observações e miniaturas', async () => {
    renderCard()

    const heading = await screen.findByRole('heading', { level: 3, name: TITLE })
    const card = heading.closest('section')
    expect(card).toHaveAttribute('aria-labelledby', heading.id)
    expect(card).toHaveClass('documents-section', 'cdc')
    expect(mockGetDamage).toHaveBeenCalledWith('p1')
    expect(within(card).getByText('Conferência fechada em 24/11/2026 por Operador')).toBeInTheDocument()
    expect(within(card).getByText('2 itens com avaria · 2 fotos')).toBeInTheDocument()
    expect(within(card).getByText('Pallets: 23 contados de 25 informados pelo COMEX (divergente).')).toBeInTheDocument()
    expect(within(card).getByText('Recebimento: Com ressalva.')).toBeInTheDocument()

    const items = within(card).getAllByRole('listitem').filter((li) => li.classList.contains('cdc__item'))
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Item 1 · POLIOL X - TB 200KG · Código AD5240')
    expect(within(items[0]).getByText('Tambor amassado')).toHaveClass('cdc__note')
    expect(items[1]).toHaveTextContent('Item 2 · RESINA Y - CX 25KG')
    expect(items[1]).not.toHaveTextContent('Código')
    expect(within(items[1]).getByText('Caixas molhadas')).toBeInTheDocument()
    expect(await within(items[1]).findByRole('img', { name: 'Foto 1 do item 2' })).toBeInTheDocument()
    expect(within(items[1]).getByRole('img', { name: 'Foto 2 do item 2' })).toBeInTheDocument()
    expect(within(items[0]).queryByRole('img')).not.toBeInTheDocument()
    // somente leitura: nada de anexar nem remover
    expect(within(card).queryByRole('button', { name: /Anexar|Remover|Tirar foto/ })).not.toBeInTheDocument()
  })

  it('1 item e 1 foto usam o singular; pallets que conferem dizem "confere"', async () => {
    mockGetDamage.mockResolvedValue(
      withItems([{ rowId: 'r-1', index: 1, label: 'Item 1', code: '', note: 'Amassado', photos: [{ id: 'f1', width: 1, height: 1 }] }], {
        pallets: { counted: 1, expected: 1 },
      })
    )
    renderCard()
    expect(await screen.findByText('1 item com avaria · 1 foto')).toBeInTheDocument()
    expect(screen.getByText('Pallets: 1 contado de 1 informado pelo COMEX (confere).')).toBeInTheDocument()
  })

  it('sem foto nenhuma o resumo não fala de fotos; o rótulo "Item N" não é repetido', async () => {
    mockGetDamage.mockResolvedValue(
      withItems([{ rowId: 'r-3', index: 3, label: 'Item 3', code: 'ZZ9', note: 'Faltou lacre', photos: [] }])
    )
    renderCard()
    expect(await screen.findByText('1 item com avaria')).toBeInTheDocument()
    const item = document.querySelector('.cdc__item')
    expect(item).toHaveTextContent(/^Item 3 · Código ZZ9Faltou lacre$/)
  })

  it('espelho sem total de pallets do COMEX não mostra a linha de pallets', async () => {
    mockGetDamage.mockResolvedValue(damage({ pallets: { counted: 3, expected: null } }))
    renderCard()
    await screen.findByRole('heading', { name: TITLE })
    expect(screen.queryByText(/Pallets:/)).not.toBeInTheDocument()
  })

  it('status do recebimento vazio ou desconhecido não aparece', async () => {
    mockGetDamage.mockResolvedValue(damage({ receiptStatus: '' }))
    const { unmount } = renderCard()
    await screen.findByRole('heading', { name: TITLE })
    expect(screen.queryByText(/Recebimento:/)).not.toBeInTheDocument()
    unmount()
    mockGetDamage.mockResolvedValue(damage({ receiptStatus: 'xpto' }))
    renderCard()
    await screen.findByRole('heading', { name: TITLE })
    expect(screen.queryByText(/Recebimento:/)).not.toBeInTheDocument()
  })

  it('data de fechamento inválida: "Conferência fechada" sem data (e sem "por" se não há nome)', async () => {
    mockGetDamage.mockResolvedValue(damage({ closedDate: '24/11/2026', closedByName: '' }))
    renderCard()
    await screen.findByRole('heading', { name: TITLE })
    expect(screen.getByText('Conferência fechada')).toBeInTheDocument()
    expect(screen.queryByText(/ em /)).not.toBeInTheDocument()
  })

  it('item sem foto e sem observação (legado) e foto sem observação têm texto próprio', async () => {
    mockGetDamage.mockResolvedValue(
      withItems([
        { rowId: 'r-1', index: 1, label: 'A', code: '', note: '', flagged: true, photos: [] },
        { rowId: 'r-2', index: 2, label: 'B', code: '', note: '   ', flagged: false, photos: [{ id: 'f1', width: 1, height: 1 }] },
      ])
    )
    renderCard()
    expect(await screen.findByText('Avaria registrada, sem observação')).toBeInTheDocument()
    expect(screen.getByText('(sem observação)')).toBeInTheDocument()
  })

  it('observação multilinha preserva as quebras (classe com pre-wrap, texto intacto)', async () => {
    mockGetDamage.mockResolvedValue(
      withItems([{ rowId: 'r-1', index: 1, label: 'A', code: '', note: 'linha 1\nlinha 2', photos: [] }])
    )
    renderCard()
    const note = await screen.findByText(/linha 1/)
    expect(note).toHaveClass('cdc__note')
    expect(note.textContent).toBe('linha 1\nlinha 2')
  })

  it('itens e fotos malformados não quebram: foto sem id de texto some, item sem rowId segue', async () => {
    mockGetDamage.mockResolvedValue(
      withItems([
        null,
        { index: 4, label: 'Item 4', note: 'Sem rowId', photos: [{ id: 7 }, { id: '' }, null, { id: 'ok1' }] },
      ])
    )
    renderCard()
    expect(await screen.findByText('1 item com avaria · 1 foto')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Foto 1 do item 4' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Foto 2 do item 4' })).not.toBeInTheDocument()
    expect(mockDownload).toHaveBeenCalledTimes(1)
  })

  it('sem position fixed inline e só botões secondary/primary', async () => {
    renderCard()
    const heading = await screen.findByRole('heading', { name: TITLE })
    const card = heading.closest('section')
    await within(card).findByRole('img', { name: 'Foto 1 do item 2' })
    for (const element of card.querySelectorAll('*')) expect(element.style.position).not.toBe('fixed')
    for (const button of within(card).getAllByRole('button')) {
      expect(button.className).not.toMatch(/ghost-button/)
    }
  })
})

describe('CargoConferenceDamageCard: quando existe', () => {
  it.each(['admin', 'logistica', 'tecnico', 'faturamento'])('papel %s lê o espelho e vê o cartão', async (role) => {
    renderCard({ role })
    expect(await screen.findByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(mockGetDamage).toHaveBeenCalledTimes(1)
  })

  it.each(['user', 'compras', 'viewer', undefined, ''])('papel %s não lê o espelho nem mostra nada', async (role) => {
    const { container } = renderCard({ role })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(mockGetDamage).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it('sem Firebase configurado ou sem processo não lê nada', async () => {
    state.configured = false
    const first = renderCard()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(first.container).toBeEmptyDOMElement()
    first.unmount()
    state.configured = true
    const second = renderCard({ processId: '' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(second.container).toBeEmptyDOMElement()
    expect(mockGetDamage).not.toHaveBeenCalled()
  })

  it.each([
    ['espelho inexistente (null)', () => mockGetDamage.mockResolvedValue(null)],
    ['itemCount 0 e itens vazios', () => mockGetDamage.mockResolvedValue(damage({ items: [], itemCount: 0, photoCount: 0 }))],
    ['espelho sem a lista de itens', () => mockGetDamage.mockResolvedValue({ itemCount: 2, closedDate: '2026-11-24' })],
    ['permission-denied', () => mockGetDamage.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))],
    ['not-found', () => mockGetDamage.mockRejectedValue(Object.assign(new Error('x'), { code: 'not-found' }))],
    ['erro sem código (falha do módulo, não do Firestore)', () => mockGetDamage.mockRejectedValue(new Error('chunk'))],
  ])('%s: nenhum cartão, nem esqueleto, nem alerta', async (_name, arrange) => {
    arrange()
    const { container } = renderCard()
    await waitFor(() => expect(mockGetDamage).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(container).toBeEmptyDOMElement()
  })

  it('enquanto carrega não mostra nada (sem esqueleto)', () => {
    mockGetDamage.mockReturnValue(new Promise(() => {}))
    const { container } = renderCard()
    expect(container).toBeEmptyDOMElement()
  })

  it('outro erro: alerta com "Tentar de novo" (secondary-button) que lê de novo', async () => {
    mockGetDamage.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'unavailable' }))
    const user = userEvent.setup()
    renderCard()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as avarias da conferência.')
    const retry = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(retry).toHaveClass('secondary-button')
    await user.click(retry)
    expect(await screen.findByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(mockGetDamage).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reloadToken novo lê de novo e mostra o fechamento mais recente', async () => {
    const view = renderCard({ reloadToken: 0 })
    expect(await screen.findByText('Conferência fechada em 24/11/2026 por Operador')).toBeInTheDocument()
    mockGetDamage.mockResolvedValue(damage({ closedDate: '2026-11-25', closedByName: 'Ana' }))
    view.rerender(<CargoConferenceDamageCard processId="p1" role="tecnico" reloadToken={1} />)
    expect(await screen.findByText('Conferência fechada em 25/11/2026 por Ana')).toBeInTheDocument()
    expect(mockGetDamage).toHaveBeenCalledTimes(2)
  })

  it('o espelho que some no reload (sem avaria agora) tira o cartão', async () => {
    const view = renderCard({ reloadToken: 0 })
    await screen.findByRole('heading', { name: TITLE })
    mockGetDamage.mockResolvedValue(null)
    view.rerender(<CargoConferenceDamageCard processId="p1" role="tecnico" reloadToken={1} />)
    await waitFor(() => expect(screen.queryByRole('heading', { name: TITLE })).not.toBeInTheDocument())
  })

  it('trocar de processo não mostra o espelho do anterior', async () => {
    const view = renderCard({ processId: 'p1' })
    await screen.findByRole('heading', { name: TITLE })
    mockGetDamage.mockReturnValue(new Promise(() => {}))
    view.rerender(<CargoConferenceDamageCard processId="p2" role="tecnico" reloadToken={0} />)
    expect(screen.queryByRole('heading', { name: TITLE })).not.toBeInTheDocument()
  })
})

describe('CargoConferenceDamageCard: fotos', () => {
  it('abre o visualizador pela miniatura ("Foto 1 de 2 · Item 2 · …") e Fechar devolve', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(await screen.findByRole('button', { name: 'Foto 1 do item 2' }))

    const dialog = await screen.findByRole('dialog', { name: 'Foto da avaria' })
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Foto 1 de 2 · Item 2 · RESINA Y - CX 25KG')
    expect(mockDownload).toHaveBeenCalledWith('p1', 'f1', 'full')
    const close = within(dialog).getByRole('button', { name: 'Fechar' })
    await waitFor(() => expect(close).toHaveFocus())
    await user.click(close)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Foto da avaria' })).not.toBeInTheDocument())
  })

  it('foto com width/height null vira miniatura normal e abre o visualizador', async () => {
    const user = userEvent.setup()
    renderCard()
    const thumb = await screen.findByRole('img', { name: 'Foto 2 do item 2' })
    expect(thumb).not.toHaveAttribute('width')
    expect(thumb).not.toHaveAttribute('height')
    await user.click(screen.getByRole('button', { name: 'Foto 2 do item 2' }))
    const dialog = await screen.findByRole('dialog', { name: 'Foto da avaria' })
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Foto 2 de 2 · Item 2')
  })

  it('foto que sumiu (download falha): "Foto indisponível" + "Tentar de novo"; as outras seguem e o retry funciona', async () => {
    let attempts = 0
    mockDownload.mockImplementation(async (_processId, photoId) => {
      if (photoId === 'f1') {
        attempts += 1
        if (attempts === 1) throw Object.assign(new Error('nope'), { code: 'not-found' })
      }
      return new Blob(['img'])
    })
    const user = userEvent.setup()
    renderCard()

    expect(await screen.findByText('Foto indisponível')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Foto 2 do item 2' })).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(retry).toHaveClass('secondary-button')
    await user.click(retry)
    expect(await screen.findByRole('img', { name: 'Foto 1 do item 2' })).toBeInTheDocument()
    expect(screen.queryByText('Foto indisponível')).not.toBeInTheDocument()
    expect(attempts).toBe(2)
  })
})

describe('ProcessDocumentsPanel: cartão na aba Documentos', () => {
  const cargoReportDoc = {
    id: 'cr-1',
    type: 'cargoReport',
    slotKey: 'cargoReport',
    name: 'FR.CMX.001 - RELATORIO DE CARGA - X.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
    storagePath: 'processes/p1/documents/cargoReport/1.xlsx',
    uploadedAt: '2026-11-24T10:00:00.000Z',
    uploadedById: 'log-1',
    uploadedByName: 'Operador',
    uploadedByRole: 'logistica',
  }

  async function loaded() {
    await waitFor(() => {
      expect(mockListProcessDocuments).toHaveBeenCalled()
      expect(screen.queryByLabelText('Carregando documentos')).not.toBeInTheDocument()
    })
  }

  beforeEach(() => {
    mockListProcessDocuments.mockResolvedValue([cargoReportDoc])
  })

  it('Técnico com espelho: o cartão vem ANTES de "Documentos do processo"', async () => {
    const { container } = render(<ProcessDocumentsPanel process={PROCESS} profile={{ uid: 't1', role: 'tecnico' }} variant="desktop" />)
    await loaded()
    const heading = await screen.findByRole('heading', { name: TITLE })
    const processSection = container.querySelector('.documents-section--process')
    expect(processSection).not.toBeNull()
    expect(heading.compareDocumentPosition(processSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('.documents-sections').firstElementChild).toBe(heading.closest('section'))
  })

  it.each(['admin', 'logistica', 'faturamento'])('papel %s também vê o cartão no painel', async (role) => {
    render(<ProcessDocumentsPanel process={PROCESS} profile={{ uid: 'u1', role }} variant="desktop" />)
    await loaded()
    expect(await screen.findByRole('heading', { name: TITLE })).toBeInTheDocument()
  })

  it('sem espelho (processo antigo ou sem avaria): nada novo e a aba segue igual', async () => {
    mockGetDamage.mockResolvedValue(null)
    const { container } = render(<ProcessDocumentsPanel process={PROCESS} profile={{ uid: 't1', role: 'tecnico' }} variant="desktop" />)
    await loaded()
    await waitFor(() => expect(mockGetDamage).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByRole('heading', { name: TITLE })).not.toBeInTheDocument()
    expect(container.querySelector('.cdc')).toBeNull()
    expect(container.querySelector('.documents-sections').firstElementChild).toBe(container.querySelector('.documents-section--process'))
  })

  it('o botão Atualizar do painel relê o cartão (reloadToken)', async () => {
    const user = userEvent.setup()
    render(<ProcessDocumentsPanel process={PROCESS} profile={{ uid: 't1', role: 'tecnico' }} variant="desktop" />)
    await loaded()
    await screen.findByRole('heading', { name: TITLE })
    expect(mockGetDamage).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: /Atualizar/ }))
    await waitFor(() => expect(mockGetDamage).toHaveBeenCalledTimes(2))
  })
})
