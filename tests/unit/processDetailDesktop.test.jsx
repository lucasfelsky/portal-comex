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

// --- fixtures ERP (mesmas da arvore legada; ver tests/ui/ProcessDetailView.test.jsx) ---
const ERP_SNAPSHOT = { snapshotId: 'AAAAAAAAAAAAAAAAAAAA', updatedAtMs: new Date(2026, 9, 2, 14, 30).getTime() }
const ERP_STAMP = 'planilha de 02/10/2026'
const ERP_EMPTY_TRANSPORT = {
  etd: '', eta: '', vessel: { name: '', raw: '', voyage: '' }, blAwb: '', origin: '', destination: '', diNumber: '', diDate: '',
}
function erpShipment({ transport = {}, ...overrides } = {}) {
  return {
    kind: 'FCL', portalCategory: 'FCL', key: 'BETA SEA 904-26', incoterm: '', originHint: '', stage: 1,
    statuses: ['EMBARCOU'], statusNf: [], orders: [], items: [], conflicts: [],
    transport: { ...ERP_EMPTY_TRANSPORT, ...transport },
    ...overrides,
  }
}
const erpReferenceOf = (shipment, matchRule = 'pedido') => ({
  snapshot: ERP_SNAPSHOT,
  hint: { snapshotId: ERP_SNAPSHOT.snapshotId, matchRule, shipment },
})

describe('F4c - aba Detalhes gerais', () => {
  const pendingProcess = () =>
    makeProcess({ etd: '', eta: '', carrierName: '', supplierName: '', processStatus: 'Aguardando Embarque' })

  it('faixa "Dados pendentes (N)" (so admin): role=note, lista curta e "Completar agora" abre a edicao no 1o campo pendente', async () => {
    const user = userEvent.setup()
    const { props } = renderDetail({ selectedProcess: pendingProcess() })
    const note = screen.getByRole('note')
    expect(within(note).getByText(/^Dados pendentes \(\d+\)$/)).toBeInTheDocument()
    const labels = within(note).getAllByRole('listitem').map((li) => li.textContent)
    expect(labels.length).toBeGreaterThan(1)
    expect(labels).toContain('ETD')
    expect(labels).toContain('ETA')
    await user.click(within(note).getByRole('button', { name: 'Completar agora' }))
    expect(props.onEditMode).toHaveBeenCalledTimes(1)
    // o 1o argumento e' a chave do 1o campo pendente (string), nao um evento
    expect(typeof props.onEditMode.mock.calls[0][0]).toBe('string')
  })

  it('nao-admin: nenhuma faixa de pendencias', () => {
    renderDetail({ isAdmin: false, profile: { name: 'Ana', role: 'logistica' }, selectedProcess: pendingProcess() })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('4 cartoes de resumo: destino, ETD/ETA (mono, curtas, com a data completa no title), previsao e canal', () => {
    const { container } = renderDetail({
      selectedProcess: makeProcess({ terminalName: 'Portonave' }),
    })
    const cards = [...container.querySelectorAll('.pdv-stat')]
    expect(cards.map((card) => card.querySelector('.pdv-stat__label').textContent)).toEqual([
      'Porto de Atracação',
      'ETD / ETA atualizada',
      'Previsão de entrega no armazém',
      'Canal',
    ])
    expect(cards[0].querySelector('.pdv-stat__value')).toHaveTextContent('Itajaí')
    expect(cards[0].querySelector('.pdv-stat__hint')).toHaveTextContent('Terminal: Portonave')
    const eta = cards[1]
    expect(eta).toHaveClass('pdv-stat--info')
    expect(eta.querySelector('.pdv-stat__value')).toHaveTextContent('12/09 · 20/10')
    expect(eta.querySelector('.pdv-stat__value--mono')).not.toBeNull()
    expect([...eta.querySelectorAll('.pdv-stat__value span')].map((el) => el.getAttribute('title'))).toEqual(['12/09/2026', '20/10/2026'])
    expect(eta.querySelector('.pdv-stat__hint')).toHaveTextContent('ETA original: 18/10')
    expect(cards[2].querySelector('.pdv-stat__value')).toHaveTextContent('23/10')
    expect(cards[2].querySelector('.pdv-stat__hint')).toHaveTextContent('Data definida manualmente por um admin.')
    expect(cards[3].querySelector('.pdv-stat__value')).toHaveTextContent('—')
    expect(cards[3].querySelector('.pdv-stat__hint')).toHaveTextContent('Aguardando parametrização da DUIMP.')
  })

  it('ETA sem atualizacao: rotulo "ETD / ETA", sem tom info e sem "ETA original"; previsao automatica', () => {
    const { container } = renderDetail({
      selectedProcess: makeProcess({ etaOriginal: '', warehouseDeliveryDateOverride: '' }),
    })
    const cards = [...container.querySelectorAll('.pdv-stat')]
    expect(cards[1].querySelector('.pdv-stat__label')).toHaveTextContent(/^ETD \/ ETA$/)
    expect(cards[1]).not.toHaveClass('pdv-stat--info')
    expect(cards[1].querySelector('.pdv-stat__hint')).toBeNull()
    expect(cards[2].querySelector('.pdv-stat__hint')).toHaveTextContent('Data calculada automaticamente pelo sistema.')
  })

  it('aereo usa "Aeroporto de Destino"; canal com valor e tom por canal', () => {
    const { container } = renderDetail({
      selectedProcess: makeProcess({ category: 'AEREO', destination: 'GRU', parameterizationChannel: 'Vermelho', containerQuantity: 0 }),
    })
    const cards = [...container.querySelectorAll('.pdv-stat')]
    expect(cards[0].querySelector('.pdv-stat__label')).toHaveTextContent('Aeroporto de Destino')
    expect(cards[3].querySelector('.pdv-stat__value')).toHaveTextContent('Vermelho')
    expect(cards[3].querySelector('.pdv-stat__value')).toHaveClass('pdv-stat__value--danger')
    expect(cards[3].querySelector('.pdv-stat__hint')).toHaveTextContent('Canal de parametrização da DUIMP.')
  })

  it('canal vazio para quem nao ve a DUIMP antes da atracacao: dica neutra (sem "Aguardando parametrizacao")', () => {
    const { container } = renderDetail({
      isAdmin: false,
      canSeeName: false,
      profile: { name: 'Zé', role: 'user' },
    })
    const hint = [...container.querySelectorAll('.pdv-stat')][3].querySelector('.pdv-stat__hint')
    expect(hint).toHaveTextContent('Canal ainda não definido.')
  })

  it('Identificacao em dl de 2 colunas: fornecedor, origem, incoterm, navio · viagem, House BL e agente (so o que existe)', () => {
    const { container } = renderDetail({
      selectedProcess: makeProcess({
        supplierName: 'ALFA CHEM',
        originLocation: 'Shanghai, CN',
        incoterm: 'CFR',
        vesselName: 'MSC Aurora',
        voyage: '123W',
        houseBl: 'MEDU0000000',
        forwarderName: 'Agente X',
      }),
    })
    const rows = [...container.querySelectorAll('.pdv-section .pdv-kv')].map((row) => [
      row.querySelector('dt').textContent,
      row.querySelector('dd').textContent,
    ])
    expect(rows).toEqual([
      ['Fornecedor', 'ALFA CHEM'],
      ['Origem', 'Shanghai, CN'],
      ['Incoterm', 'CFR'],
      ['Navio · Viagem', 'MSC Aurora · 123W'],
      ['House BL', 'MEDU0000000'],
      ['Agente de carga', 'Agente X'],
    ])
    expect(screen.getByRole('heading', { level: 3, name: 'Identificação' })).toBeInTheDocument()
  })

  it('aereo: Voo e MAWB no lugar de Navio · Viagem e House BL; fornecedor mascarado fica de fora', () => {
    const { container } = renderDetail({
      isAdmin: false,
      canSeeName: false,
      profile: { name: 'Zé', role: 'user' },
      selectedProcess: makeProcess({
        category: 'AEREO',
        supplierName: 'SEGREDO LTDA',
        originLocation: 'Frankfurt',
        flightNumber: 'LH8140',
        mawb: '020-1234',
        containerQuantity: 0,
      }),
    })
    const labels = [...container.querySelectorAll('.pdv-section .pdv-kv dt')].map((dt) => dt.textContent)
    expect(labels).toEqual(['Origem', 'Voo', 'MAWB'])
    expect(container.textContent).not.toContain('SEGREDO LTDA')
  })

  it('Identificacao vazia: placeholder tracejado no lugar do dl', () => {
    const { container } = renderDetail({ selectedProcess: makeProcess() })
    expect(container.querySelector('.pdv-kv-grid')).toBeNull()
    expect(container.querySelector('.pdv-empty')).toHaveTextContent('Dados de identificação ainda não informados.')
  })

  it('Itens vinculados: contagem singular/plural, 2 linhas de previa e "Ver itens do processo" leva a aba Itens', async () => {
    const user = userEvent.setup()
    const items = [
      { id: 'i1', commercialName: 'Resina epóxi líquida EP-128', quantity: 36000 },
      { id: 'i2', commercialName: 'Endurecedor amínico', quantity: 4000 },
      { id: 'i3', commercialName: 'Terceiro item', quantity: 5 },
    ]
    const { container, props } = renderDetail({ selectedProcess: makeProcess({ items }) })
    const section = container.querySelector('.pdv-section--items')
    expect(within(section).getByRole('heading', { level: 3, name: 'Itens vinculados' })).toBeInTheDocument()
    expect(section.querySelector('.pdv-section__sub')).toHaveTextContent('3 itens cadastrados para este processo.')
    const preview = [...section.querySelectorAll('.pdv-preview li')].map((li) => li.textContent)
    expect(preview).toEqual(['Resina epóxi líquida EP-128' + (36000).toLocaleString('pt-BR'), 'Endurecedor amínico' + (4000).toLocaleString('pt-BR')])
    await user.click(within(section).getByRole('button', { name: 'Ver itens do processo' }))
    expect(props.onDetailTabChange).toHaveBeenCalledWith('items')
  })

  it('Itens vinculados: 1 item e sem itens (sem previa)', () => {
    const { container, unmount } = renderDetail({
      selectedProcess: makeProcess({ items: [{ id: 'i1', commercialName: 'Único', quantity: 1 }] }),
    })
    expect(container.querySelector('.pdv-section__sub')).toHaveTextContent('1 item cadastrado para este processo.')
    unmount()
    const empty = renderDetail({ selectedProcess: makeProcess({ items: [] }) })
    expect(empty.container.querySelector('.pdv-section__sub')).toHaveTextContent('0 itens cadastrados para este processo.')
    expect(empty.container.querySelector('.pdv-preview')).toBeNull()
  })

  it('CONSOLIDADO: card "POs consolidadas" com cada PO (referencia e fornecedor so para quem ve o nome)', () => {
    const process = makeProcess({
      category: 'CONSOLIDADO',
      processNumber: '',
      purchaseOrders: [
        { po: '9010', reference: 'ALFA SEA 905-26', supplierName: 'ALFA CHEM' },
        { po: '9011', reference: 'GAMA SEA 906-26', supplierName: 'OUTRO' },
      ],
    })
    const { container, unmount } = renderDetail({ selectedProcess: process })
    expect(screen.getByRole('heading', { level: 3, name: 'POs consolidadas' })).toBeInTheDocument()
    const lines = [...container.querySelectorAll('.pdv-pos li')].map((li) => li.textContent)
    expect(lines).toEqual(['9010 · Ref.: ALFA SEA 905-26 · Fornecedor: ALFA CHEM', '9011 · Ref.: GAMA SEA 906-26 · Fornecedor: OUTRO'])
    unmount()
    const masked = renderDetail({ selectedProcess: process, canSeeName: false, isAdmin: false, profile: { name: 'Zé', role: 'user' } })
    expect([...masked.container.querySelectorAll('.pdv-pos li')].map((li) => li.textContent)).toEqual(['9010', '9011'])
  })

  it('avisos ERP (admin): destino, ETD, ETA e fornecedor da Identificacao; nao-admin nao ve nenhum', () => {
    const process = makeProcess({
      category: 'FCL', processNumber: '9036', destination: 'NAVEGANTES', etd: '2026-09-30', eta: '2026-10-20',
      vesselName: 'ALFA MAERSK', voyage: '639W', masterBl: 'MBL-A', supplierName: 'ALFA CHEM', incoterm: 'FOB',
      etaOriginal: '', warehouseDeliveryDateOverride: '',
    })
    const shipment = erpShipment({
      incoterm: 'CFR',
      orders: [{ pedido: '9036', poRef: 'BETA SEA 904-26', poBase: '', exporter: 'BETA TRADING' }],
      transport: {
        destination: 'ITAJAI', etd: '2026-10-06', eta: '2026-10-14', blAwb: 'MBL-B', diNumber: 'DU-B', diDate: '2026-10-20',
        vessel: { name: 'BETA FAME', raw: 'BETA FAME 12W', voyage: '12W' },
      },
    })
    const view = renderDetail({ selectedProcess: process, erpReference: erpReferenceOf(shipment) })
    const chip = (name) => screen.getByRole('button', { name })
    expect(chip('Destino no ERP: ITAJAI').closest('.pdv-stat')).not.toBeNull()
    expect(chip('ETD no ERP: 06/10/2026')).toHaveAccessibleDescription(`No ERP: 06/10/2026 · ${ERP_STAMP}`)
    expect(chip('ETA no ERP: 14/10/2026').closest('.pdv-stat')).not.toBeNull()
    expect(chip('Incoterm no ERP: CFR').closest('.pdv-kv')).toHaveTextContent(/^IncotermFOB/)
    expect(chip('Fornecedor no ERP: BETA TRADING').closest('.pdv-kv')).toHaveTextContent(/^FornecedorALFA CHEM/)
    view.unmount()
    renderDetail({
      selectedProcess: process,
      erpReference: erpReferenceOf(shipment),
      isAdmin: false,
      profile: { name: 'Ana', role: 'logistica' },
    })
    expect(screen.queryAllByRole('button', { name: /no ERP/ })).toHaveLength(0)
  })

  it('CONSOLIDADO + ERP: aviso no titulo "POs consolidadas" e na PO divergente', () => {
    const process = makeProcess({
      id: 'p-con', name: 'CON CN 929-26', category: 'CONSOLIDADO', processNumber: '', destination: 'NAVEGANTES',
      purchaseOrders: [
        { po: '9010', reference: 'ALFA SEA 905-26', supplierName: 'ALFA CHEM' },
        { po: '9011', reference: 'GAMA SEA 906-26', supplierName: 'OUTRO' },
      ],
    })
    const shipment = erpShipment({
      kind: 'CONSOLIDADO', portalCategory: 'CONSOLIDADO', key: 'CON CN 929-26',
      transport: { destination: 'NAVEGANTES' },
      orders: [
        { pedido: '9010', poRef: 'ALFA SEA 905-26', poBase: '', exporter: 'ALFA CHEM' },
        { pedido: '9011', poRef: 'GAMA SEA 906-26', poBase: '', exporter: 'GAMA TRADING' },
        { pedido: '9012', poRef: 'DELTA SEA 907-26', poBase: '', exporter: 'DELTA TRADING' },
      ],
    })
    renderDetail({ selectedProcess: process, erpReference: erpReferenceOf(shipment, 'consolidado:ref') })
    const title = screen.getByRole('heading', { level: 3, name: /POs consolidadas/ })
    expect(title.querySelector('.erp-hint')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'POs consolidadas no ERP: 9010, 9011, 9012' })).toBeInTheDocument()
    const poChip = screen.getByRole('button', { name: 'PO 9011 no ERP: Fornecedor GAMA TRADING' })
    expect(poChip.closest('li')).toHaveTextContent('9011')
  })
})
