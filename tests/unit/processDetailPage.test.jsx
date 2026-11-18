// Refino F4c: o detalhe desktop DENTRO da ProcessesPage (pagina real, repositorios
// mockados). Cobre o que so a pagina decide: a raiz `surface--process-detail`, o
// titulo "Fila de chegadas" que some no detalhe desktop, a troca ao vivo desktop <->
// tablet sem perder o processo aberto e o "Completar agora" (Dados pendentes) que abre
// a edicao ja com o foco no 1o campo pendente. Fica em tests/unit (fora do audit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../../src/components/Toast'
import { UnsavedChangesProvider } from '../../src/contexts/UnsavedChangesContext'

const mockUseAuth = vi.fn()
const mockListProcesses = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/services/processesRepository', () => ({
  archiveProcess: vi.fn(),
  channelOptions: ['Verde', 'Amarelo', 'Vermelho', 'Cinza'],
  collectionStatusOptions: [],
  deleteProcess: vi.fn(),
  dtaStatusOptions: [],
  listProcesses: (...args) => mockListProcesses(...args),
  processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
  saveProcess: vi.fn(),
  saveProcessCollectionStatus: vi.fn(),
  saveProcessPostReceiptNotes: vi.fn(),
  searchProcesses: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processMessagesRepository', () => ({
  listProcessMessages: vi.fn().mockResolvedValue([]),
  createProcessMessage: vi.fn(),
  deleteProcessMessage: vi.fn(),
}))
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpReference: vi.fn().mockResolvedValue(null),
  saveErpReferenceSnapshot: vi.fn(),
}))
vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: vi.fn().mockResolvedValue({}),
  listAuditEvents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: vi.fn().mockResolvedValue([]),
  uploadProcessDocument: vi.fn(),
  deleteProcessDocument: vi.fn(),
  downloadProcessDocumentBlob: vi.fn(),
  saveBlobAsFile: vi.fn(),
  setInvoicePackingListLink: vi.fn(),
  renameAdditionalDocument: vi.fn(),
}))
vi.mock('../../src/services/postReceiptImagesStorage', () => ({
  deletePostReceiptImages: vi.fn().mockResolvedValue(undefined),
  getAddedPostReceiptImages: () => [],
  getRemovedPostReceiptImages: () => [],
  resolvePostReceiptImagesForSave: vi.fn().mockResolvedValue([]),
}))

import ProcessesPage from '../../src/pages/ProcessesPage'

function installMatchMedia({ desktop = true, mobile = false, reduced = false } = {}) {
  const state = { desktop, mobile, reduced }
  const listeners = { desktop: new Set(), mobile: new Set(), reduced: new Set() }
  const keyOf = (query) =>
    query.includes('1041')
      ? 'desktop'
      : query.includes('720')
        ? 'mobile'
        : query.includes('prefers-reduced-motion')
          ? 'reduced'
          : null
  window.matchMedia = vi.fn((query) => {
    const key = keyOf(query)
    return {
      get matches() {
        return key ? state[key] : false
      },
      media: query,
      onchange: null,
      addEventListener: (type, fn) => {
        if (type === 'change' && key) listeners[key].add(fn)
      },
      removeEventListener: (type, fn) => {
        if (type === 'change' && key) listeners[key].delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
  return {
    setDesktop(value) {
      state.desktop = value
      act(() => {
        listeners.desktop.forEach((fn) => fn({ matches: value }))
      })
    },
  }
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia

const PROCESSES = [
  {
    id: 'p-1',
    name: 'Resina epóxi líquida',
    processNumber: '4500128734',
    category: 'FCL',
    destination: 'Itajaí',
    processStatus: 'Aguardando Embarque',
    containerQuantity: 2,
    // sem ETD/ETA nem transportadora: o 1o campo pendente e' o ETD
    etd: '',
    eta: '',
    carrierName: '',
    items: [{ id: 'i-1', commercialName: 'Resina EP-128', quantity: 36000 }],
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/processos']}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <Routes>
            <Route path="/processos" element={<ProcessesPage />} />
          </Routes>
        </ToastProvider>
      </UnsavedChangesProvider>
    </MemoryRouter>
  )
}

async function openDetail(container, user) {
  await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
  await user.click(container.querySelector('.chg-row__main'))
  await waitFor(() => expect(container.querySelector('.pdv-head')).not.toBeNull())
}

beforeEach(() => {
  installMatchMedia({ desktop: true, mobile: false })
  mockUseAuth.mockReset()
  mockListProcesses.mockReset()
  mockUseAuth.mockReturnValue({
    profile: { uid: 'u-1', name: 'Lucas', role: 'admin', favoriteProcessIds: [] },
    toggleFavoriteProcess: vi.fn(),
  })
  mockListProcesses.mockResolvedValue(PROCESSES)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('F4c - detalhe desktop dentro da ProcessesPage', () => {
  it('raiz surface--process-detail, sem o titulo "Fila de chegadas" e com o cabecalho do processo', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    expect(container.querySelector('section.surface')).toHaveClass('surface--process-detail')
    expect(container.querySelector('section.surface')).not.toHaveClass('surface--arrivals')
    expect(container.querySelector('.section-heading')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Fila de chegadas' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Resina epóxi líquida' })).toBeInTheDocument()
  })

  it('Voltar devolve a lista (a lista desktop volta com o titulo)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
    expect(screen.getByRole('heading', { level: 2, name: 'Fila de chegadas' })).toBeInTheDocument()
    expect(container.querySelector('section.surface')).toHaveClass('surface--arrivals')
  })

  it('troca ao vivo desktop <-> tablet no detalhe: o processo aberto e a aba continuam, sem recarregar dados', async () => {
    const user = userEvent.setup()
    const media = installMatchMedia({ desktop: true, mobile: false })
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('tab', { name: 'Itens' }))
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveAttribute('aria-selected', 'true')

    media.setDesktop(false)
    expect(container.querySelector('.pdv-head')).toBeNull()
    expect(container.querySelector('.process-timeline')).not.toBeNull()
    expect(container.querySelector('.section-heading')).toBeTruthy()
    expect(container.querySelector('section.surface')).not.toHaveClass('surface--process-detail')
    expect(screen.getByRole('heading', { level: 2, name: 'Resina epóxi líquida' })).toBeInTheDocument()
    expect(container.querySelector('.detail-tab-select__native')).toHaveValue('items')

    media.setDesktop(true)
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    expect(container.querySelector('.section-heading')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveAttribute('aria-selected', 'true')
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
  })

  it('"Completar agora" abre a edicao do processo com o foco no 1o campo pendente (ETD)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    const note = screen.getByRole('note')
    expect(within(note).getByText(/Dados pendentes/)).toBeInTheDocument()
    await user.click(within(note).getByRole('button', { name: 'Completar agora' }))
    await waitFor(() => expect(document.getElementById('process-field-etd')).not.toBeNull())
    await waitFor(() => expect(document.getElementById('process-field-etd')).toHaveFocus())
  })

  it('"Editar processo" abre a edicao sem foco forcado (o botao nao repassa o evento como campo)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    // F4d: no desktop o formulario e um modal (portal no body), nao um filho da pagina
    await waitFor(() => expect(document.querySelector('.process-form--dialog')).not.toBeNull())
    expect(document.getElementById('process-field-etd')?.matches(':focus') ?? false).toBe(false)
  })
})

// Remake mobile F5: o detalhe empilhado dentro da ProcessesPage (<= 720px). A lista
// continua montada atras (`.m-stack`, `inert`), o foco/rolagem voltam ao fechar, o
// gesto da borda acompanha o dedo e tablet/desktop nao ganham nada disso.
describe('F5 - detalhe empilhado (mobile) dentro da ProcessesPage', () => {
  const finger = (x, y) => ({ identifier: 1, clientX: x, clientY: y })

  function touch(type, target, touches) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : touches })
    Object.defineProperty(event, 'changedTouches', { value: touches })
    act(() => {
      target.dispatchEvent(event)
    })
    return event
  }

  async function openMobileDetail(container, user) {
    await waitFor(() => expect(container.querySelector('.m-pc')).not.toBeNull())
    const card = container.querySelector('.m-pc')
    await user.click(card)
    await waitFor(() => expect(container.querySelector('article.process-detail-view')).not.toBeNull())
    return card
  }

  beforeEach(() => {
    installMatchMedia({ desktop: false, mobile: true })
  })

  it('com o detalhe aberto a lista fica montada num `.m-stack-under` inert + aria-hidden; o detalhe e uma camada irma', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.process-list-card')).not.toBeNull())
    const listNode = container.querySelector('.process-list-card')
    // lista em repouso: o wrapper existe mas nao recua nem fica inerte
    const stack = container.querySelector('.m-stack')
    expect(stack).not.toBeNull()
    expect(stack).not.toHaveClass('m-stack-under')
    expect(stack).not.toHaveAttribute('inert')

    await openMobileDetail(container, user)
    const under = container.querySelector('.m-stack-under')
    expect(under).toBe(stack)
    expect(under).toHaveAttribute('inert')
    expect(under).toHaveAttribute('aria-hidden', 'true')
    expect(under.contains(listNode)).toBe(true)
    expect(container.querySelector('.process-list-card')).toBe(listNode)
    const layer = container.querySelector('article.process-detail-view')
    expect(under.contains(layer)).toBe(false)
    expect(layer.parentElement).toBe(under.parentElement)
    // a lista por tras nao e alcancavel (leitor de tela/foco)
    expect(screen.queryByRole('button', { name: /Exportar/ })).toBeNull()
  })

  it('estado de repouso da camada: sem transform/filter/will-change/contain na camada nem nos ancestrais', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openMobileDetail(container, user)
    const layer = container.querySelector('article.process-detail-view')
    for (let node = layer; node && node !== document.documentElement; node = node.parentElement) {
      for (const prop of ['transform', 'filter', 'willChange', 'contain', 'perspective', 'backdropFilter']) {
        expect(node.style[prop] ?? '', `${node.tagName}.${node.className} ${prop}`).toBe('')
      }
    }
  })

  it('so a camada de baixo recua: o detalhe nao herda o transform da lista', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openMobileDetail(container, user)
    const layer = container.querySelector('article.process-detail-view')
    expect(layer.closest('.m-stack')).toBeNull()
  })

  it('o foco vai para o titulo do detalhe ao abrir e volta ao cartao que abriu ao fechar; a lista nao remonta', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.process-list-card')).not.toBeNull())
    const listNode = container.querySelector('.process-list-card')
    const card = await openMobileDetail(container, user)
    expect(screen.getByRole('heading', { level: 1, name: 'Resina epóxi líquida' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Voltar para Chegadas' }))
    // saida animada: a camada marca `data-m-leaving` e a lista ja deixa de recuar (continua inert)
    const layer = container.querySelector('article.process-detail-view')
    expect(layer).toHaveAttribute('data-m-leaving', 'true')
    expect(container.querySelector('.m-stack')).not.toHaveClass('m-stack-under')
    expect(container.querySelector('.m-stack')).toHaveAttribute('inert')

    await waitFor(() => expect(container.querySelector('article.process-detail-view')).toBeNull(), { timeout: 2000 })
    const stack = container.querySelector('.m-stack')
    expect(stack).not.toHaveAttribute('inert')
    expect(stack).not.toHaveAttribute('aria-hidden')
    expect(container.querySelector('.process-list-card')).toBe(listNode)
    await waitFor(() => expect(card).toHaveFocus())
  })

  it('restaura a rolagem da lista ao voltar (a lista continua montada atras)', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.m-pc')).not.toBeNull())
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 320 })
    await user.click(container.querySelector('.m-pc'))
    await waitFor(() => expect(container.querySelector('article.process-detail-view')).not.toBeNull())
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    await user.click(screen.getByRole('button', { name: 'Voltar para Chegadas' }))
    await waitFor(() => expect(container.querySelector('article.process-detail-view')).toBeNull(), { timeout: 2000 })
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 320))
    delete window.scrollY
  })

  it('movimento reduzido: voltar e imediato, sem estado de saida', async () => {
    installMatchMedia({ desktop: false, mobile: true, reduced: true })
    const user = userEvent.setup()
    const { container } = renderPage()
    await openMobileDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Voltar para Chegadas' }))
    expect(container.querySelector('article.process-detail-view')).toBeNull()
    expect(container.querySelector('.m-stack')).not.toHaveAttribute('inert')
  })

  it('o gesto da borda acompanha o dedo (lista recua junto) e, passando de 110px, volta; o useSwipe nao age junto', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openMobileDetail(container, user)
    const layer = container.querySelector('article.process-detail-view')
    const stack = container.querySelector('.m-stack')

    touch('touchstart', layer, [finger(12, 300)])
    touch('touchmove', layer, [finger(90, 304)])
    expect(layer.style.transform).toBe('translateX(78px)')
    expect(stack.style.transform).toMatch(/^translateX\(-/)
    touch('touchend', layer, [finger(90, 304)])
    // soltou antes do limiar: volta, o detalhe segue aberto
    expect(container.querySelector('article.process-detail-view')).not.toBeNull()
    expect(layer).not.toHaveAttribute('data-m-leaving')

    touch('touchstart', layer, [finger(12, 300)])
    touch('touchmove', layer, [finger(200, 304)])
    touch('touchend', layer, [finger(200, 304)])
    // com o useSwipe ativo o detalhe sumiria no mesmo instante: aqui ha a saida animada
    expect(container.querySelector('article.process-detail-view')).toHaveAttribute('data-m-leaving', 'true')
    await waitFor(() => expect(container.querySelector('article.process-detail-view')).toBeNull(), { timeout: 2000 })
    // nenhum inline sobra na lista depois de voltar
    await waitFor(() => expect(container.querySelector('.m-stack').style.transform).toBe(''))
    expect(container.querySelector('.m-stack').style.filter).toBe('')
  })

  it('rolagem vertical comecando na borda nao fecha o detalhe', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openMobileDetail(container, user)
    const layer = container.querySelector('article.process-detail-view')
    touch('touchstart', layer, [finger(10, 300)])
    touch('touchmove', layer, [finger(14, 360)])
    touch('touchmove', layer, [finger(240, 362)])
    touch('touchend', layer, [finger(240, 362)])
    expect(container.querySelector('article.process-detail-view')).not.toBeNull()
    expect(layer.style.transform).toBe('')
  })

  it('o h1 do processo e unico e o botao Voltar da camada e unico (o "Fila de chegadas" fica oculto por CSS `:has(> .m-stack)`)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openMobileDetail(container, user)
    expect(container.querySelector('section.surface > .m-stack')).not.toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Voltar/ })).toHaveLength(1)
  })

  it('tablet (721-1040px): sem camada empilhada, sem hero; o useSwipe antigo volta na hora', async () => {
    installMatchMedia({ desktop: false, mobile: false })
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.process-list-card')).not.toBeNull())
    expect(container.querySelector('.m-stack')).toBeNull()
    const row = container.querySelector('.process-item--button')
    await user.click(row)
    await waitFor(() => expect(container.querySelector('article.process-detail-view')).not.toBeNull())
    expect(container.querySelector('.m-stack')).toBeNull()
    expect(container.querySelector('.m-hero')).toBeNull()
    expect(container.querySelector('.process-list-card')).toBeNull()
    expect(container.querySelector('article.process-detail-view')).not.toHaveAttribute('data-m-leaving')
    touch('touchstart', document.body, [finger(10, 300)])
    touch('touchend', document.body, [finger(200, 304)])
    expect(container.querySelector('article.process-detail-view')).toBeNull()
    await waitFor(() => expect(container.querySelector('.process-list-card')).not.toBeNull())
  })

  it('desktop: nem `.m-stack` nem camada empilhada', async () => {
    installMatchMedia({ desktop: true, mobile: false })
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    expect(container.querySelector('.m-stack')).toBeNull()
    expect(container.querySelector('.m-hero')).toBeNull()
  })
})
