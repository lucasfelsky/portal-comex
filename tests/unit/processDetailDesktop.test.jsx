// Refino F4c: arvore DESKTOP do detalhe do processo (Processo.dc.html). O desktop e
// escolhido por matchMedia('(min-width: 1041px)'); aqui o matchMedia diz "desktop"
// (e "nao mobile") e os modulos de dominio sao os REAIS — so os repositorios sao
// mocks. A arvore legada (tablet/mobile) continua coberta por
// tests/ui/ProcessDetailView.test.jsx (matchMedia falso = legado). Fica em tests/unit
// para nao entrar na contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

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

import ProcessDetailView from '../../src/features/processes/ProcessDetailView'
import { getTimelineStageDates } from '../../src/features/processes/ProcessDetailDesktop'

// --- matchMedia controlavel (desktop >= 1041px | mobile <= 720px) -----------
function installMatchMedia({ desktop = true, mobile = false } = {}) {
  const state = { desktop, mobile }
  const listeners = { desktop: new Set(), mobile: new Set() }
  const keyOf = (query) => (query.includes('1041') ? 'desktop' : query.includes('720') ? 'mobile' : null)
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
    listeners,
    setDesktop(value) {
      state.desktop = value
      act(() => {
        listeners.desktop.forEach((fn) => fn({ matches: value }))
      })
    },
  }
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia

function makeProcess(overrides = {}) {
  return {
    id: 'p-1',
    name: 'Resina epóxi líquida',
    category: 'FCL',
    processNumber: '4500128734',
    destination: 'Itajaí',
    processStatus: 'Aguardando registro da DUIMP',
    etd: '2026-09-12',
    eta: '2026-10-20',
    etaOriginal: '2026-10-18',
    warehouseDeliveryDateOverride: '2026-10-23',
    shippedAt: '2026-09-12',
    berthed: false,
    containerQuantity: 2,
    palletQuantity: 40,
    containers: [],
    items: [],
    licenses: [],
    collectionWindows: [],
    postReceiptImages: [],
    ...overrides,
  }
}

function buildProps(overrides = {}) {
  return {
    selectedProcess: makeProcess(),
    detailTab: 'general',
    isAdmin: true,
    canSeeName: true,
    isSaving: false,
    favoriteProcessIds: [],
    canEditPostReceiptNotes: false,
    canEditSelectedCollectionStatus: true,
    itemSearchTerm: '',
    selectedItemName: '',
    processMessages: [],
    isLoadingMessages: false,
    messageDraft: '',
    deletingMessageId: '',
    isSendingMessage: false,
    messageLimitReached: false,
    remainingMessages: 8,
    hasUnlimitedMessages: false,
    visibleProcessItems: [],
    relatedActiveProcesses: [],
    selectedProcessPostReceiptImages: [],
    profile: { name: 'Lucas', role: 'admin' },
    itemsSectionRef: { current: null },
    onDetailTabChange: vi.fn(),
    onSetItemSearchTerm: vi.fn(),
    onMessageDraftChange: vi.fn(),
    onOpenRelatedItemTab: vi.fn(),
    onOpenProcessDetail: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSetViewModeList: vi.fn(),
    onEditMode: vi.fn(),
    onPostReceiptEditMode: vi.fn(),
    onCollectionStatusEditMode: vi.fn(),
    onOpenPostReceiptGallery: vi.fn(),
    onDeleteProcess: vi.fn(),
    onSendMessage: vi.fn(),
    onDeleteMessage: vi.fn(),
    ...overrides,
  }
}

function renderDetail(overrides = {}) {
  const props = buildProps(overrides)
  const utils = render(<ProcessDetailView {...props} />)
  return { ...utils, props }
}

let media
beforeEach(() => {
  media = installMatchMedia({ desktop: true, mobile: false })
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('F4c - troca de arvore por matchMedia', () => {
  it('desktop renderiza a arvore nova (pdv-*) e nao a legada', () => {
    const { container } = renderDetail()
    expect(container.querySelector('.process-detail-view--desktop')).not.toBeNull()
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    expect(container.querySelector('.process-timeline')).toBeNull()
    expect(container.querySelector('.process-detail-mobilebar')).toBeNull()
    expect(container.querySelector('.detail-tab-select')).toBeNull()
    expect(container.querySelector('.list-card')).toBeNull()
  })

  it('tablet/mobile (sem desktop) seguem na arvore legada', () => {
    media.setDesktop(false)
    const { container } = renderDetail()
    expect(container.querySelector('.process-detail-view--desktop')).toBeNull()
    expect(container.querySelector('.process-timeline')).not.toBeNull()
    expect(container.querySelector('.detail-tab-select')).not.toBeNull()
  })

  it('troca ao vivo nos dois sentidos, sem remontar o painel de dados e sem listener preso', () => {
    const { container, unmount, props } = renderDetail()
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    media.setDesktop(false)
    expect(container.querySelector('.pdv-head')).toBeNull()
    expect(container.querySelector('.process-timeline')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Resina epóxi líquida' })).toBeInTheDocument()
    media.setDesktop(true)
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    expect(container.querySelector('.process-timeline')).toBeNull()
    expect(props.onDetailTabChange).not.toHaveBeenCalled()
    unmount()
    expect(media.listeners.desktop.size).toBe(0)
  })

  it('"mobile" ligado junto com "desktop" (teste que forca tudo) cai na arvore legada', () => {
    media = installMatchMedia({ desktop: true, mobile: true })
    const { container } = renderDetail()
    expect(container.querySelector('.process-detail-view--desktop')).toBeNull()
  })
})

describe('F4c - cabecalho (Processo.dc.html)', () => {
  it('Voltar, h2 (nivel mantido), tag de status, meta mono "CAT · PO … · destino"', async () => {
    const user = userEvent.setup()
    const { container, props } = renderDetail()
    expect(screen.getByRole('heading', { level: 2, name: 'Resina epóxi líquida' })).toBeInTheDocument()
    expect(container.querySelector('.pdv-head__title-line .status-tag')).toHaveTextContent('Aguardando registro da DUIMP')
    expect(container.querySelector('.pdv-head__meta')).toHaveTextContent('FCL · PO 4500128734 · Itajaí')
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(props.onSetViewModeList).toHaveBeenCalledTimes(1)
  })

  it('admin: favorito (so icone, rotulo visually-hidden), Status de coleta secundario, Editar processo primario, Mais acoes', async () => {
    const user = userEvent.setup()
    const { container, props } = renderDetail()
    const favorite = screen.getByRole('button', { name: 'Favoritar' })
    expect(favorite).toHaveAttribute('aria-pressed', 'false')
    expect(favorite.querySelector('.pdv-sr')).toHaveTextContent('Favoritar')
    expect(favorite.querySelector('svg')).not.toBeNull()
    await user.click(favorite)
    expect(props.onToggleFavorite).toHaveBeenCalledWith('p-1')

    const collection = screen.getByRole('button', { name: 'Status de coleta' })
    expect(collection).toHaveClass('secondary-button')
    await user.click(collection)
    expect(props.onCollectionStatusEditMode).toHaveBeenCalledTimes(1)

    const edit = screen.getByRole('button', { name: 'Editar processo' })
    expect(edit).toHaveClass('primary-button')
    await user.click(edit)
    expect(props.onEditMode).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeInTheDocument()
    // ordem do mock: favorito, Status de coleta, Editar processo, Mais acoes
    const labels = [...container.querySelectorAll('.pdv-head__actions button')].map(
      (button) => button.getAttribute('aria-label') || button.textContent.trim()
    )
    expect(labels).toEqual(['Favoritar', 'Status de coleta', 'Editar processo', 'Mais ações'])
  })

  it('favoritado: "Desfavoritar" com aria-pressed e fundo de destaque', () => {
    renderDetail({ favoriteProcessIds: ['p-1'] })
    const button = screen.getByRole('button', { name: 'Desfavoritar' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('pdv-icon-btn--on')
  })

  it('nao-admin (logistica): sem Editar processo nem Mais acoes; Status de coleta e Editar observacoes por permissao', () => {
    renderDetail({
      isAdmin: false,
      profile: { name: 'Ana', role: 'logistica' },
      canEditPostReceiptNotes: true,
      selectedProcess: makeProcess({ processStatus: 'Carga recebida' }),
    })
    expect(screen.queryByRole('button', { name: 'Editar processo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Status de coleta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar observações' })).toHaveClass('secondary-button')
  })

  it('sem permissao de coleta nem de observacoes, so o favorito aparece', () => {
    renderDetail({ isAdmin: false, canEditSelectedCollectionStatus: false, profile: { name: 'Zé', role: 'user' } })
    const labels = [...document.querySelectorAll('.pdv-head__actions button')].map((button) => button.getAttribute('aria-label'))
    expect(labels).toEqual(['Favoritar'])
  })

  it('nome mascarado: titulo "PO: …" e sem o nome na meta (usuario sem permissao em categoria restrita)', () => {
    const { container } = renderDetail({ isAdmin: false, canSeeName: false, profile: { name: 'Zé', role: 'user' } })
    expect(screen.getByRole('heading', { level: 2, name: 'PO: 4500128734' })).toBeInTheDocument()
    expect(container.textContent).not.toContain('Resina epóxi líquida')
    expect(container.querySelector('.pdv-head__meta')).toHaveTextContent('FCL · Itajaí')
  })

  it('aereo: meta com a categoria AEREO e rotulo "Aeroporto de Destino" no resumo', () => {
    const { container } = renderDetail({
      selectedProcess: makeProcess({ category: 'AEREO', destination: 'GRU', processNumber: 'AWB 77', containerQuantity: 0 }),
    })
    expect(container.querySelector('.pdv-head__meta')).toHaveTextContent('AEREO · PO AWB 77 · GRU')
    expect(screen.getAllByText('Aeroporto de Destino').length).toBeGreaterThan(0)
  })

  it('Mais acoes abre o menu, Esc devolve o foco e Excluir processo pede confirmacao antes de excluir', async () => {
    const user = userEvent.setup()
    const { props } = renderDetail()
    const trigger = screen.getByRole('button', { name: 'Mais ações' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Excluir processo' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Excluir processo' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Excluir processo?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(props.onDeleteProcess).not.toHaveBeenCalled()

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Excluir processo' }))
    const second = await screen.findByRole('alertdialog')
    await user.click(within(second).getByRole('button', { name: 'Excluir' }))
    expect(props.onDeleteProcess).toHaveBeenCalledTimes(1)
  })
})

describe('F4c - timeline de 5 etapas', () => {
  const stageNodes = (container) => [...container.querySelectorAll('.pdv-timeline__list > li')]

  it('lista "Etapas" com 5 itens; a etapa atual leva aria-current="step"; concluidas/atual/futuras por classe', () => {
    const { container } = renderDetail()
    expect(screen.getByRole('list', { name: 'Etapas' })).toBeInTheDocument()
    const items = stageNodes(container)
    expect(items.map((li) => li.querySelector('.pdv-stage__label').textContent)).toEqual([
      'Embarque',
      'Trânsito',
      'Chegada',
      'Liberação',
      'Entrega',
    ])
    // "Aguardando registro da DUIMP" = etapa 3 (Liberacao); sem atracacao o DUIMP sob aguas cap em Transito
    const states = items.map((li) => [...li.classList].find((name) => name.startsWith('pdv-stage--')))
    expect(states.filter((state) => state === 'pdv-stage--now')).toHaveLength(1)
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(1)
    expect(container.querySelectorAll('.pdv-stage--done').length + container.querySelectorAll('.pdv-stage--todo').length).toBe(4)
  })

  it('processo atracado em "Aguardando registro da DUIMP": 3 concluidas, Liberacao atual, Entrega futura', () => {
    const { container } = renderDetail({
      selectedProcess: makeProcess({ berthed: true, berthedAt: '2026-10-20T08:00' }),
    })
    const states = stageNodes(container).map((li) => [...li.classList].find((name) => name.startsWith('pdv-stage--')))
    expect(states).toEqual(['pdv-stage--done', 'pdv-stage--done', 'pdv-stage--done', 'pdv-stage--now', 'pdv-stage--todo'])
    expect(stageNodes(container)[3]).toHaveAttribute('aria-current', 'step')
    // trilho unico: o preenchimento cobre as 3 colunas concluidas
    const fill = container.querySelector('.pdv-timeline__fill')
    expect(fill.style.getPropertyValue('--pdv-filled')).toBe('3')
    expect(fill.querySelectorAll('.pdv-timeline__seg')).toHaveLength(3)
    expect(container.querySelector('.pdv-timeline__track').querySelectorAll(':scope > .pdv-timeline__seg')).toHaveLength(5)
  })

  it('carga recebida: as 5 etapas concluidas e o trilho inteiro preenchido', () => {
    const { container } = renderDetail({
      selectedProcess: makeProcess({ processStatus: 'Carga recebida', berthed: true, berthedAt: '2026-10-20T08:00' }),
    })
    expect(container.querySelectorAll('.pdv-stage--done')).toHaveLength(5)
    expect(container.querySelectorAll('.pdv-stage--now')).toHaveLength(0)
    expect(container.querySelector('.pdv-timeline__fill').style.getPropertyValue('--pdv-filled')).toBe('5')
    expect(container.querySelector('[aria-current="step"]')).toBeNull()
  })

  it('primeira etapa atual: sem preenchimento (o trilho inteiro cinza)', () => {
    const { container } = renderDetail({ selectedProcess: makeProcess({ processStatus: 'Aguardando Embarque' }) })
    expect(container.querySelector('.pdv-timeline__fill')).toBeNull()
    expect(stageNodes(container)[0]).toHaveAttribute('aria-current', 'step')
  })

  it('cada etapa leva a data mono do mapa (Embarque=ETD; Transito=ETD – ETA; Chegada=ETA; Liberacao; Entrega=Prev.)', () => {
    const { container } = renderDetail()
    const dates = stageNodes(container).map((li) => li.querySelector('.pdv-stage__date').textContent)
    expect(dates).toEqual(['12/09', '12/09 – 20/10', 'ETA 20/10', '—', 'Prev. 23/10'])
  })

  it('getTimelineStageDates: atracacao confirmada vira a data da Chegada; desembaraco e recebimento preenchem Liberacao/Entrega', () => {
    const process = makeProcess({
      berthed: true,
      berthedAt: '2026-10-19T08:00',
      clearanceCompletedAt: '2026-10-21T10:00',
      cargoReceivedAt: '2026-10-22T16:00',
    })
    expect(getTimelineStageDates(process, '2026-10-23')).toEqual(['12/09', '12/09 – 20/10', '19/10', '21/10', '22/10'])
  })

  it('getTimelineStageDates: sem datas cai em "—" e usa ano so quando difere do atual', () => {
    expect(getTimelineStageDates(makeProcess({ etd: '', eta: '', shippedAt: '' }), '')).toEqual(['—', '—', '—', '—', '—'])
    const nextYear = `${new Date().getFullYear() + 1}-01-05`
    const dates = getTimelineStageDates(makeProcess({ etd: '', shippedAt: '', eta: nextYear }), '')
    expect(dates[1]).toBe(`até 05/01/${new Date().getFullYear() + 1}`)
  })

  it('movimento: o JSX nao usa timers; a animacao e so CSS (preenchimento 600 ms + pontos com mola)', () => {
    const { container } = renderDetail({ selectedProcess: makeProcess({ berthed: true, berthedAt: '2026-10-20T08:00' }) })
    // atraso dos pontos = 100 + 150 * indice, via --i (o CSS faz a conta)
    expect(stageNodes(container).map((li) => li.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4'])
  })
})

describe('F4c - abas (controle segmentado)', () => {
  it('tablist "Seções do processo" com 6 abas para admin/logistica e aria-selected na ativa', () => {
    renderDetail({ detailTab: 'process' })
    const tablist = screen.getByRole('tablist', { name: 'Seções do processo' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Detalhes gerais',
      'Processo',
      'Itens',
      'Mensagens',
      'Histórico',
      expect.stringContaining('Documentos'),
    ])
    expect(screen.getByRole('tab', { name: 'Processo' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveAttribute('aria-selected', 'false')
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Processo' }).id)
  })

  it('usuario sem acesso a registros nao ve Historico nem Documentos (e o deep link cai em Detalhes gerais)', () => {
    renderDetail({ isAdmin: false, profile: { name: 'Zé', role: 'user' }, detailTab: 'documents' })
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent)
    expect(tabs).toEqual(['Detalhes gerais', 'Processo', 'Itens', 'Mensagens'])
    expect(screen.getByRole('tab', { name: 'Detalhes gerais' })).toHaveAttribute('aria-selected', 'true')
  })

  it('clicar numa aba e usar setas/Home/End chama onDetailTabChange', async () => {
    const user = userEvent.setup()
    const { props } = renderDetail({ detailTab: 'items' })
    await user.click(screen.getByRole('tab', { name: 'Mensagens' }))
    expect(props.onDetailTabChange).toHaveBeenLastCalledWith('messages')
    screen.getByRole('tab', { name: 'Itens' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(props.onDetailTabChange).toHaveBeenLastCalledWith('messages')
    await user.keyboard('{ArrowLeft}')
    expect(props.onDetailTabChange).toHaveBeenLastCalledWith('process')
    await user.keyboard('{End}')
    expect(props.onDetailTabChange).toHaveBeenLastCalledWith('documents')
    await user.keyboard('{Home}')
    expect(props.onDetailTabChange).toHaveBeenLastCalledWith('general')
  })

  it('Documentos mostra "N pendentes" em pilula; a aba ativa so tem tabIndex 0 (roving)', () => {
    renderDetail({
      selectedProcess: makeProcess({ category: 'FCL', shippedAt: '2026-09-12', berthed: true, berthedAt: '2026-10-20T08:00' }),
    })
    const documents = screen.getByRole('tab', { name: /Documentos/ })
    expect(documents.querySelector('.documents-tab-count')).toHaveTextContent(/^\d+ pendentes?$/)
    expect(screen.getByRole('tab', { name: 'Detalhes gerais' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveAttribute('tabindex', '-1')
  })

  it('"Item relacionado" aparece como aba extra quando ativa', () => {
    renderDetail({
      detailTab: 'related-item',
      selectedItemName: 'Resina',
      relatedActiveProcesses: [],
    })
    expect(screen.getByRole('tab', { name: 'Item relacionado' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Chegadas ativas com este item')).toBeInTheDocument()
  })

  it('trocar de aba remonta o painel (a entrada de 300 ms roda de novo)', () => {
    const { rerender, props } = renderDetail({ detailTab: 'general' })
    const first = screen.getByRole('tabpanel')
    rerender(<ProcessDetailView {...props} detailTab="process" />)
    expect(screen.getByRole('tabpanel')).not.toBe(first)
  })
})
