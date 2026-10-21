// Refino F4b: arvore DESKTOP da lista de Chegadas (Chegadas.dc.html). O desktop e
// escolhido por matchMedia('(min-width: 1041px)'); aqui o matchMedia diz "desktop"
// (e "nao mobile") e os modulos de dominio sao os REAIS — so os repositorios, a
// autenticacao e o router sao mocks. A arvore legada (tablet/mobile) continua
// coberta por tests/ui/ProcessListView.test.jsx e tests/ui/ProcessesPage.test.jsx
// (matchMedia falso = legado). Fica em tests/unit para nao entrar na contagem do
// audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'
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

import ProcessListView from '../../src/features/processes/ProcessListView'
import ProcessesPage from '../../src/pages/ProcessesPage'

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

const FLAMMABLE_ITEMS = [{ id: 'i-1', commercialName: 'Solvente', dangerousGoods: true, imoClass: '3' }]

const PROCESSES = [
  {
    id: 'p-1',
    name: 'Resina epóxi líquida',
    processNumber: '4500128734',
    category: 'FCL',
    destination: 'Itajaí',
    processStatus: 'Aguardando registro da DUIMP',
    containerQuantity: 2,
    etd: '2026-09-12',
    eta: '2026-10-20',
    warehouseDeliveryDateOverride: '2026-10-23',
    items: FLAMMABLE_ITEMS,
  },
  {
    id: 'p-2',
    name: 'Dióxido de titânio',
    processNumber: '4500127710',
    category: 'FCL',
    destination: 'Navegantes',
    processStatus: 'Aguardando parametrização da DUIMP',
    containerQuantity: 1,
    etd: '2026-09-05',
    eta: '2026-10-21',
    etaOriginal: '2026-10-18',
    warehouseDeliveryDateOverride: '2026-10-24',
  },
  {
    id: 'p-3',
    name: 'Glicerina bidestilada',
    processNumber: '4500129102',
    category: 'FCL',
    destination: 'Itajaí',
    processStatus: 'Embarcou',
    containerQuantity: 1,
    containers: [{ id: 'c-1', type: 'ISOTANK' }, { id: 'c-2', type: '20RF' }],
    etd: '2026-09-18',
    eta: '2026-10-24',
    items: FLAMMABLE_ITEMS,
  },
  {
    id: 'p-4',
    name: 'Peça aérea',
    processNumber: 'AWB 77',
    category: 'AEREO',
    destination: 'GRU',
    processStatus: 'Embarcou',
    palletQuantity: 3,
    etd: '2026-10-10',
    eta: '2026-10-27',
  },
]

const ARCHIVED = [
  { id: 'p-9', name: 'Processo arquivado', processNumber: '4500000001', category: 'FCL', destination: 'Itajaí', processStatus: 'Carga recebida', archived: true },
]

function baseProps(overrides = {}) {
  return {
    filteredProcesses: PROCESSES,
    totalCount: 48,
    isLoading: false,
    isExporting: false,
    selectedProcessId: null,
    isAdmin: true,
    canSeeName: true,
    searchTerm: '',
    categoryFilter: 'Todos',
    etaStartDate: '',
    etaEndDate: '',
    operationFilter: 'Todos',
    hasActiveFilters: false,
    processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
    onSearchTermChange: vi.fn(),
    onCategoryFilterChange: vi.fn(),
    onEtaStartDateChange: vi.fn(),
    onEtaEndDateChange: vi.fn(),
    onOperationFilterChange: vi.fn(),
    onClearAllFilters: vi.fn(),
    onSelectProcess: vi.fn(),
    onExport: vi.fn(),
    onReconcileErp: vi.fn(),
    favoriteProcessIds: ['p-2'],
    onToggleFavorite: vi.fn(),
    archivedProcesses: ARCHIVED,
    onArchiveProcess: vi.fn(),
    onNewProcess: vi.fn(),
    ...overrides,
  }
}

function renderView(overrides = {}) {
  const props = baseProps(overrides)
  const utils = render(<ProcessListView {...props} />)
  return { ...utils, props }
}

const rowOf = (container, name) => {
  const row = [...container.querySelectorAll('.chg-row')].find((element) => element.textContent.includes(name))
  expect(row, `linha de "${name}"`).toBeTruthy()
  return row
}

beforeEach(() => {
  installMatchMedia({ desktop: true, mobile: false })
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('F4b - cabecalho e acoes', () => {
  it('eyebrow "N processos ativos · ordem por ETA" + h2 "Fila de chegadas" (nivel mantido)', () => {
    const { container } = renderView()
    expect(screen.getByRole('heading', { level: 2, name: 'Fila de chegadas' })).toBeInTheDocument()
    expect(container.querySelector('.chg-head__eyebrow')).toHaveTextContent('48 processos ativos · ordem por ETA')
    // sem o h3 "Chegadas" do cartao legado
    expect(screen.queryByRole('heading', { level: 3, name: 'Chegadas' })).not.toBeInTheDocument()
  })

  it('singular quando ha 1 processo ativo; sem totalCount cai no tamanho da lista filtrada', () => {
    const { container, rerender, props } = renderView({ totalCount: 1 })
    expect(container.querySelector('.chg-head__eyebrow')).toHaveTextContent('1 processo ativo · ordem por ETA')
    rerender(<ProcessListView {...props} totalCount={undefined} />)
    expect(container.querySelector('.chg-head__eyebrow')).toHaveTextContent('4 processos ativos')
  })

  it('admin: Arquivados (N), Exportar (N), Importar do DBCorp e Novo processo, nessa ordem', () => {
    const { container } = renderView()
    const buttons = [...container.querySelectorAll('.chg-head__actions button')]
    expect(buttons.map((button) => button.textContent.trim())).toEqual([
      'Arquivados (1)',
      'Exportar (4)',
      'Importar do DBCorp',
      'Novo processo',
    ])
    expect(buttons[0]).toHaveClass('ghost-button')
    expect(buttons[1]).toHaveClass('secondary-button')
    expect(buttons[2]).toHaveClass('secondary-button')
    expect(buttons[3]).toHaveClass('primary-button')
    // icones do mock nos tres botoes que os tem
    expect(buttons[0].querySelector('svg')).toBeTruthy()
    expect(buttons[1].querySelector('svg')).toBeTruthy()
    expect(buttons[3].querySelector('svg')).toBeTruthy()
  })

  it('nao-admin: so Exportar (sem Arquivados, Importar e Novo processo)', () => {
    const { container } = renderView({
      isAdmin: false,
      onNewProcess: undefined,
      onReconcileErp: undefined,
      onArchiveProcess: undefined,
    })
    const labels = [...container.querySelectorAll('.chg-head__actions button')].map((button) => button.textContent.trim())
    expect(labels).toEqual(['Exportar (4)'])
  })

  it('os botoes chamam seus handlers', async () => {
    const user = userEvent.setup()
    const { props } = renderView()
    await user.click(screen.getByRole('button', { name: 'Exportar (4)' }))
    await user.click(screen.getByRole('button', { name: 'Importar do DBCorp' }))
    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    expect(props.onExport).toHaveBeenCalledTimes(1)
    expect(props.onReconcileErp).toHaveBeenCalledTimes(1)
    expect(props.onNewProcess).toHaveBeenCalledTimes(1)
  })

  it('logistica (canViewArchivedProp): ve Arquivados, abre o processo, sem Restaurar/Arquivar', async () => {
    const user = userEvent.setup()
    const { container, props } = renderView({
      isAdmin: false,
      canViewArchivedProp: true,
      onArchiveProcess: undefined,
      onNewProcess: undefined,
      onReconcileErp: undefined,
    })
    await user.click(screen.getByRole('button', { name: 'Arquivados (1)' }))
    const archivedRow = rowOf(container, 'Processo arquivado')
    expect(within(archivedRow).queryByRole('button', { name: /Restaurar|Arquivar/ })).not.toBeInTheDocument()
    await user.click(archivedRow)
    expect(props.onSelectProcess).toHaveBeenCalledWith('p-9')
  })

  it('Exportar (N) conta o que sai na planilha: filtradas fora de Arquivados, arquivadas dentro', async () => {
    const user = userEvent.setup()
    const { props } = renderView()
    await user.click(screen.getByRole('button', { name: 'Exportar (4)' }))
    expect(props.onExport).toHaveBeenLastCalledWith(PROCESSES)
    await user.click(screen.getByRole('button', { name: 'Arquivados (1)' }))
    await user.click(screen.getByRole('button', { name: 'Exportar (1)' }))
    expect(props.onExport).toHaveBeenLastCalledWith(ARCHIVED)
  })

  it('Exportar fica desabilitado sem linhas ou exportando', () => {
    const { unmount } = renderView({ filteredProcesses: [] })
    expect(screen.getByRole('button', { name: 'Exportar (0)' })).toBeDisabled()
    unmount()
    renderView({ isExporting: true })
    expect(screen.getByRole('button', { name: /Exportar \(4\)/ })).toBeDisabled()
  })

  it('Arquivados alterna a visao (aria-pressed): linhas arquivadas com "Restaurar processo", sem favorito', async () => {
    const user = userEvent.setup()
    const { container, props } = renderView()
    const toggle = screen.getByRole('button', { name: /Arquivados \(1\)/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.chg-head__eyebrow')).toHaveTextContent('1 processo arquivado')
    expect(container.querySelector('.chg-section-label')).toHaveTextContent('Arquivados')
    const archivedRow = rowOf(container, 'Processo arquivado')
    expect(within(archivedRow).queryByRole('button', { name: /Favoritar/ })).not.toBeInTheDocument()
    expect(container.querySelectorAll('.chg-row')).toHaveLength(1)
    await user.click(within(archivedRow).getByRole('button', { name: 'Restaurar processo' }))
    expect(props.onArchiveProcess).toHaveBeenCalledWith('p-9', false)
    await user.click(toggle)
    expect(container.querySelectorAll('.chg-row')).toHaveLength(4)
  })

  it('arquivado automatico (recebido ha 7+ dias) aparece em Arquivados sem "Restaurar processo"', async () => {
    const user = userEvent.setup()
    const auto = { ...ARCHIVED[0], id: 'p-10', name: 'Processo auto-arquivado', autoArchived: true }
    const { container } = renderView({ archivedProcesses: [ARCHIVED[0], auto] })
    await user.click(screen.getByRole('button', { name: /Arquivados \(2\)/ }))
    expect(container.querySelectorAll('.chg-row')).toHaveLength(2)
    expect(
      within(rowOf(container, 'Processo arquivado')).getByRole('button', { name: 'Restaurar processo' })
    ).toBeInTheDocument()
    expect(
      within(rowOf(container, 'Processo auto-arquivado')).queryByRole('button', { name: 'Restaurar processo' })
    ).not.toBeInTheDocument()
  })
})

describe('F4b - filtros', () => {
  it('painel "Filtros" com os 4 campos (rotulos associados) e as 2 datas do periodo de ETA', () => {
    renderView()
    const panel = screen.getByRole('region', { name: 'Filtros' })
    expect(within(panel).getByLabelText('Buscar processo')).toHaveAttribute(
      'placeholder',
      'Nome, item, contêiner, PO, ETA ou status',
    )
    expect(within(panel).getByLabelText('Categoria').tagName).toBe('SELECT')
    expect(within(panel).getByLabelText('Etapa operacional').tagName).toBe('SELECT')
    const eta = within(panel).getByRole('group', { name: 'Período de ETA' })
    expect(within(eta).getByLabelText('ETA de')).toHaveAttribute('type', 'date')
    expect(within(eta).getByLabelText('ETA até')).toHaveAttribute('type', 'date')
  })

  it('etapa operacional: "Dados pendentes" so para admin', () => {
    const { unmount } = renderView()
    expect(within(screen.getByLabelText('Etapa operacional')).getByRole('option', { name: 'Dados pendentes' })).toBeInTheDocument()
    unmount()
    renderView({ isAdmin: false })
    expect(within(screen.getByLabelText('Etapa operacional')).queryByRole('option', { name: 'Dados pendentes' })).not.toBeInTheDocument()
  })

  it('os campos chamam os handlers (busca, categoria, etapa, datas)', async () => {
    const user = userEvent.setup()
    const { props } = renderView()
    await user.type(screen.getByLabelText('Buscar processo'), 'a')
    expect(props.onSearchTermChange).toHaveBeenCalledWith('a')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'AEREO')
    expect(props.onCategoryFilterChange).toHaveBeenCalledWith('AEREO')
    await user.selectOptions(screen.getByLabelText('Etapa operacional'), 'DUIMP pendente')
    expect(props.onOperationFilterChange).toHaveBeenCalledWith('DUIMP pendente')
    const eta = screen.getByRole('group', { name: 'Período de ETA' })
    await user.type(within(eta).getByLabelText('ETA de'), '2026-10-19')
    expect(props.onEtaStartDateChange).toHaveBeenCalled()
    await user.type(within(eta).getByLabelText('ETA até'), '2026-10-31')
    expect(props.onEtaEndDateChange).toHaveBeenCalled()
  })

  it('sem filtro ativo nao ha linha de chips', () => {
    const { container } = renderView()
    expect(container.querySelector('.chg-chips')).toBeNull()
  })

  it('chips ativos + "Limpar todos" + contador "X de Y" (datas curtas dd/mm)', async () => {
    const user = userEvent.setup()
    const { container, props } = renderView({
      hasActiveFilters: true,
      searchTerm: 'resina',
      categoryFilter: 'FCL',
      etaStartDate: '2026-10-19',
      etaEndDate: '2026-10-31',
      operationFilter: 'DUIMP pendente',
      filteredProcesses: PROCESSES.slice(0, 2),
    })
    const row = container.querySelector('.chg-chips')
    expect(row).toHaveAttribute('aria-label', 'Filtros ativos')
    expect(within(row).getByText('Filtros:')).toBeInTheDocument()
    expect(within(row).getByText('Busca: "resina"')).toBeInTheDocument()
    expect(within(row).getByText('Categoria: FCL')).toBeInTheDocument()
    expect(within(row).getByText('ETA: 19/10 até 31/10')).toBeInTheDocument()
    expect(within(row).getByText('Etapa: DUIMP pendente')).toBeInTheDocument()
    expect(row.querySelector('.chg-chips__count')).toHaveTextContent('2 de 48')

    await user.click(within(row).getByRole('button', { name: 'Remover filtro Categoria: FCL' }))
    expect(props.onCategoryFilterChange).toHaveBeenCalledWith('Todos')
    await user.click(within(row).getByRole('button', { name: /Remover filtro ETA/ }))
    expect(props.onEtaStartDateChange).toHaveBeenCalledWith('')
    expect(props.onEtaEndDateChange).toHaveBeenCalledWith('')
    await user.click(within(row).getByRole('button', { name: 'Limpar todos' }))
    expect(props.onClearAllFilters).toHaveBeenCalledTimes(1)
  })

  it('periodo de ETA aberto (so inicio ou so fim) usa "início"/"fim"', () => {
    const { unmount } = renderView({ hasActiveFilters: true, etaStartDate: '2026-10-19' })
    expect(screen.getByText('ETA: 19/10 até fim')).toBeInTheDocument()
    unmount()
    renderView({ hasActiveFilters: true, etaEndDate: '2026-10-31' })
    expect(screen.getByText('ETA: início até 31/10')).toBeInTheDocument()
  })
})

describe('F4b - linha do processo', () => {
  it('nome 16/700, linha mono "PO: … · CAT", destino, tag de status, unidades e datas dd/mm', () => {
    const { container } = renderView()
    const row = rowOf(container, 'Resina epóxi líquida')
    expect(row.querySelector('.chg-row__name')).toHaveTextContent('Resina epóxi líquida')
    expect(row.querySelector('.chg-row__po')).toHaveTextContent('PO: 4500128734 · FCL')
    expect(row.querySelector('.chg-row__dest')).toHaveTextContent('Porto de Atracação: Itajaí')
    expect(row.querySelector('.chg-row__dest strong')).toHaveTextContent('Itajaí')
    const status = row.querySelector('.chg-row__chips .status-tag')
    expect(status).toHaveTextContent('Aguardando registro da DUIMP')
    expect(status.className).toMatch(/status-tag--(ok|warn|danger|info|neutral)/)
    expect(row.querySelector('.chg-row__chips')).toHaveTextContent('2 contêineres')

    const dates = [...row.querySelectorAll('.chg-date')].map((cell) => [
      cell.querySelector('.chg-date__label').textContent,
      cell.querySelector('.chg-date__value').textContent,
    ])
    expect(dates).toEqual([
      ['ETD', '12/09'],
      ['ETA', '20/10'],
      ['Entrega prev.', '23/10'],
    ])
    // a data completa fica no title (o ano nao some da informacao)
    expect(row.querySelector('.chg-date__value')).toHaveAttribute('title', '12/09/2026')
  })

  it('aereo usa "Aeroporto de Destino" e pallets', () => {
    const { container } = renderView()
    const row = rowOf(container, 'Peça aérea')
    expect(row.querySelector('.chg-row__dest')).toHaveTextContent('Aeroporto de Destino: GRU')
    expect(row.querySelector('.chg-row__chips')).toHaveTextContent('3 pallets')
  })

  it('ETA atualizada (D14): rotulo "ETA atualizada" em destaque informativo, com a ETA anterior no title', () => {
    const { container } = renderView()
    const updated = rowOf(container, 'Dióxido de titânio').querySelector('.chg-date--eta')
    expect(updated).toHaveClass('chg-date--updated')
    expect(updated.querySelector('.chg-date__label')).toHaveTextContent('ETA atualizada')
    expect(updated).toHaveAttribute('title', 'ETA anterior: 18/10/2026')
    const regular = rowOf(container, 'Resina epóxi líquida').querySelector('.chg-date--eta')
    expect(regular).not.toHaveClass('chg-date--updated')
    expect(regular.querySelector('.chg-date__label')).toHaveTextContent('ETA')
    expect(regular.querySelector('.chg-date__label')).not.toHaveTextContent('atualizada')
  })

  it('alertas: no maximo 2 chips + "+N" (title lista os demais), tons por severidade', () => {
    const { container } = renderView({ isAdmin: false, onArchiveProcess: undefined })
    const row = rowOf(container, 'Glicerina')
    const badges = [...row.querySelectorAll('.chg-row__chips .inline-badge')]
    // 1 chip de unidade (contêiner) + 2 alertas + "+2"
    expect(badges.map((badge) => badge.textContent)).toEqual(['1 contêiner', 'Carga inflamável', 'Carga perigosa', '+2'])
    expect(badges[1]).toHaveClass('inline-badge--danger')
    expect(badges[2]).toHaveClass('inline-badge--warn')
    expect(badges[3]).toHaveClass('inline-badge--more')
    expect(badges[3]).toHaveAttribute('title', '2 alerta(s) a mais: Reefer, ISO tank')
    // carry-over F4b: o "+N" e focavel e leitores de tela leem os alertas ocultos
    expect(badges[3]).toHaveAttribute('tabindex', '0')
    expect(badges[3]).toHaveAttribute('aria-label', '2 alerta(s) a mais: Reefer, ISO tank')
  })

  it('ETA e Entrega prev. tem title com a data completa (como o ETD)', () => {
    const { container } = renderView()
    const values = [...rowOf(container, 'Resina epóxi líquida').querySelectorAll('.chg-date__value')]
    expect(values.map((value) => value.getAttribute('title'))).toEqual(['12/09/2026', '20/10/2026', '23/10/2026'])
  })

  it('sem alertas nao ha chip "+N"', () => {
    const { container } = renderView()
    expect(rowOf(container, 'Peça aérea').querySelector('.inline-badge--more')).toBeNull()
  })

  it('nome mascarado (user sem permissao em categoria restrita): titulo "PO: …", sem o nome e sem subtitulo repetido', () => {
    const { container } = renderView({ isAdmin: false, canSeeName: false, onArchiveProcess: undefined })
    expect(container.textContent).not.toContain('Resina epóxi líquida')
    const row = [...container.querySelectorAll('.chg-row')].find((element) => element.textContent.includes('PO: 4500128734'))
    expect(row.querySelector('.chg-row__name')).toHaveTextContent('PO: 4500128734')
    // so a categoria na linha mono (o "PO: …" ja e' o titulo)
    expect(row.querySelector('.chg-row__po')).toHaveTextContent(/^FCL$/)
  })

  it('"Dados pendentes (N)" so aparece para admin', () => {
    const pending = { ...PROCESSES[3], id: 'p-pend', name: 'Sem dados', processNumber: '', etd: '', eta: '', destination: '' }
    const { container, unmount } = renderView({ filteredProcesses: [pending] })
    expect(container.querySelector('.chg-row__chips').textContent).toMatch(/Dados pendentes \(\d+\)/)
    unmount()
    const view = renderView({ filteredProcesses: [pending], isAdmin: false, onArchiveProcess: undefined })
    expect(view.container.querySelector('.chg-row__chips').textContent).not.toMatch(/Dados pendentes/)
  })

  it('clicar na linha seleciona; Enter no bloco principal tambem (botao nativo)', async () => {
    const user = userEvent.setup()
    const { container, props } = renderView()
    const row = rowOf(container, 'Glicerina')
    await user.click(row)
    expect(props.onSelectProcess).toHaveBeenLastCalledWith('p-3')
    const main = row.querySelector('button.chg-row__main')
    main.focus()
    await user.keyboard('{Enter}')
    expect(props.onSelectProcess).toHaveBeenCalledTimes(2)
    await user.keyboard(' ')
    expect(props.onSelectProcess).toHaveBeenCalledTimes(3)
  })

  it('linha selecionada: aria-current + classe', () => {
    const { container } = renderView({ selectedProcessId: 'p-2' })
    const selected = rowOf(container, 'Dióxido de titânio')
    expect(selected).toHaveAttribute('aria-current', 'true')
    expect(selected).toHaveClass('chg-row--selected')
    expect(rowOf(container, 'Resina epóxi líquida')).not.toHaveAttribute('aria-current')
  })

  it('favoritar e arquivar nao selecionam o processo; rotulos acessiveis preservados', async () => {
    const user = userEvent.setup()
    const { container, props } = renderView()
    const favorited = rowOf(container, 'Dióxido de titânio')
    const unfavorited = rowOf(container, 'Resina epóxi líquida')
    expect(within(favorited).getByRole('button', { name: 'Desfavoritar processo' })).toHaveClass('chg-icon-button--on')
    const star = within(unfavorited).getByRole('button', { name: 'Favoritar processo' })
    expect(star).not.toHaveClass('chg-icon-button--on')
    await user.click(star)
    expect(props.onToggleFavorite).toHaveBeenCalledWith('p-1')
    await user.click(within(unfavorited).getByRole('button', { name: 'Arquivar processo' }))
    expect(props.onArchiveProcess).toHaveBeenCalledWith('p-1', true)
    expect(props.onSelectProcess).not.toHaveBeenCalled()
  })

  it('nao-admin nao ve "Arquivar"; processo sem agenda (CD) esconde as datas', () => {
    const atCd = { ...PROCESSES[0], id: 'p-cd', name: 'No CD', processStatus: 'Carga recebida', collectionStatus: 'Carga disponível em estoque' }
    const { container } = renderView({ filteredProcesses: [atCd], isAdmin: false, onArchiveProcess: undefined })
    const row = rowOf(container, 'No CD')
    expect(within(row).queryByRole('button', { name: /Arquivar/ })).not.toBeInTheDocument()
    expect(row.querySelector('.chg-row__dates')).toBeNull()
    // o status tambem some quando ha status de coleta (regra legada)
    expect(row.querySelector('.status-tag')).toBeNull()
  })
})

describe('F4b - estados', () => {
  it('vazio: empty-state com a mesma mensagem (admin x nao-admin)', () => {
    const { unmount } = renderView({ filteredProcesses: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum processo encontrado')
    expect(screen.getByRole('status')).toHaveTextContent('Ajuste a busca ou cadastre um novo processo.')
    unmount()
    renderView({ filteredProcesses: [], isAdmin: false })
    expect(screen.getByRole('status')).toHaveTextContent('Ajuste a busca ou os filtros aplicados.')
  })

  it('carregando: cartoes-esqueleto no formato da linha, aria-busy e sem fade de revelacao', () => {
    const { container } = renderView({ isLoading: true })
    expect(container.querySelector('.process-list-card')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.process-card-skeleton')).toHaveLength(4)
    expect(container.querySelectorAll('.chg-row')).toHaveLength(0)
    expect(container.querySelector('.chg-results')).not.toHaveClass('skeleton-reveal')
    expect(container.querySelector('.chg-head__eyebrow')).toHaveTextContent('Carregando fila')
  })

  it('carregado: o conteudo entra com skeleton-reveal e as linhas pelo Stagger (+40 ms, 8 primeiras)', () => {
    const { container } = renderView()
    expect(container.querySelector('.chg-results')).toHaveClass('skeleton-reveal')
    const rows = [...container.querySelectorAll('.chg-row')]
    expect(rows.every((row) => row.classList.contains('stagger__item'))).toBe(true)
    expect(rows[2].style.getPropertyValue('--stagger-index')).toBe('2')
  })

  it('raiz: .process-list-card desktop, sem as classes/arvore legadas', () => {
    const { container } = renderView({ rootClassName: 'view-pop' })
    const root = container.querySelector('.process-list-card')
    expect(root).toHaveClass('process-list-card--desktop')
    expect(root).toHaveClass('view-pop')
    expect(root).not.toHaveClass('list-card')
    expect(container.querySelector('.process-item')).toBeNull()
    expect(container.querySelector('.chegadas-mobilebar')).toBeNull()
    expect(container.querySelector('.process-filters')).toBeNull()
    expect(container.querySelector('.process-swipe-row')).toBeNull()
  })
})

describe('F4b - troca de arvore por breakpoint', () => {
  it('abaixo de 1041px renderiza a arvore legada (cartao com h3 "Chegadas" e process-item)', () => {
    installMatchMedia({ desktop: false, mobile: false })
    const { container } = renderView()
    expect(container.querySelector('.process-list-card--desktop')).toBeNull()
    expect(container.querySelector('.chg-row')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Chegadas' })).toBeInTheDocument()
    expect(container.querySelectorAll('.process-item--button')).toHaveLength(4)
  })

  it('mobile (<= 720px) segue na arvore legada mesmo se a consulta desktop for verdadeira', () => {
    installMatchMedia({ desktop: true, mobile: true })
    const { container } = renderView()
    expect(container.querySelector('.chg-row')).toBeNull()
    expect(container.querySelector('.chegadas-mobilebar')).toBeTruthy()
  })

  it('troca ao vivo (change nos dois sentidos): nunca as duas arvores e o estado da pagina nao se perde', () => {
    const media = installMatchMedia({ desktop: true, mobile: false })
    const { container, props, rerender } = renderView({ searchTerm: 'resina', hasActiveFilters: true })
    const trees = () => ({
      desktop: container.querySelectorAll('.process-list-card--desktop').length,
      legacy: container.querySelectorAll('.list-card.process-list-card').length,
    })
    expect(trees()).toEqual({ desktop: 1, legacy: 0 })

    media.setDesktop(false)
    expect(trees()).toEqual({ desktop: 0, legacy: 1 })
    // os filtros (props da pagina) continuam refletidos na arvore legada
    expect(container.querySelector('.process-filters__search')).toHaveValue('resina')

    media.setDesktop(true)
    expect(trees()).toEqual({ desktop: 1, legacy: 0 })
    expect(screen.getByLabelText('Buscar processo')).toHaveValue('resina')
    expect(within(container.querySelector('.chg-chips')).getByText('Busca: "resina"')).toBeInTheDocument()

    // a lista (dados) nao e' recarregada pelo ListView: as mesmas props seguem valendo
    rerender(<ProcessListView {...props} />)
    expect(container.querySelectorAll('.chg-row')).toHaveLength(4)
  })

  it('o estado "Arquivados" sobrevive a troca de arvore', async () => {
    const user = userEvent.setup()
    const media = installMatchMedia({ desktop: true, mobile: false })
    const { container } = renderView()
    await user.click(screen.getByRole('button', { name: /Arquivados \(1\)/ }))
    expect(container.querySelectorAll('.chg-row')).toHaveLength(1)
    media.setDesktop(false)
    expect(container.querySelector('.process-list-card--desktop')).toBeNull()
    media.setDesktop(true)
    expect(container.querySelectorAll('.chg-row')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Arquivados \(1\)/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('listener de matchMedia removido ao desmontar', () => {
    const media = installMatchMedia({ desktop: true, mobile: false })
    const { unmount } = renderView()
    expect(media.listeners.desktop.size).toBeGreaterThan(0)
    unmount()
    expect(media.listeners.desktop.size).toBe(0)
    expect(media.listeners.mobile.size).toBe(0)
  })
})

describe('F4b - ProcessesPage (cabecalho e troca ao vivo)', () => {
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
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    mockUseAuth.mockReset()
    mockListProcesses.mockReset()
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', role: 'admin', favoriteProcessIds: [] },
      toggleFavoriteProcess: vi.fn(),
    })
    mockListProcesses.mockResolvedValue([...PROCESSES, ...ARCHIVED])
  })

  it('desktop: um unico h2 "Fila de chegadas" (o do cabecalho novo), raiz surface--arrivals, contagens reais', async () => {
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(4))
    expect(screen.getAllByRole('heading', { level: 2, name: 'Fila de chegadas' })).toHaveLength(1)
    expect(container.querySelector('.section-heading')).toBeNull()
    expect(container.querySelector('section.surface')).toHaveClass('surface--arrivals')
    // 4 ativos (o arquivado nao conta) e 1 arquivado
    expect(container.querySelector('.chg-head__eyebrow')).toHaveTextContent('4 processos ativos · ordem por ETA')
    expect(screen.getByRole('button', { name: 'Arquivados (1)' })).toBeInTheDocument()
  })

  it('filtrar mostra "X de Y" com Y = processos ativos', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(4))
    await user.type(screen.getByLabelText('Buscar processo'), 'glicerina')
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
    expect(container.querySelector('.chg-chips__count')).toHaveTextContent('1 de 4')
  })

  it('troca ao vivo: o cabecalho legado volta no tablet, os dados nao sao recarregados e o filtro persiste', async () => {
    const user = userEvent.setup()
    const media = installMatchMedia({ desktop: true, mobile: false })
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(4))
    await user.type(screen.getByLabelText('Buscar processo'), 'glicerina')
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))

    media.setDesktop(false)
    expect(container.querySelector('.chg-row')).toBeNull()
    expect(container.querySelector('.section-heading')).toBeTruthy()
    expect(container.querySelector('section.surface')).not.toHaveClass('surface--arrivals')
    expect(screen.getAllByRole('heading', { level: 2, name: 'Fila de chegadas' })).toHaveLength(1)
    expect(container.querySelector('.process-filters__search')).toHaveValue('glicerina')
    expect(container.querySelectorAll('.process-item--button')).toHaveLength(1)

    media.setDesktop(true)
    expect(container.querySelector('.section-heading')).toBeNull()
    expect(screen.getByLabelText('Buscar processo')).toHaveValue('glicerina')
    expect(container.querySelectorAll('.chg-row')).toHaveLength(1)
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
  })

  it('o usuario comum (nome mascarado) ve "PO: …" no titulo e nao ve os botoes de admin', async () => {
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-2', role: 'user', favoriteProcessIds: [] },
      toggleFavoriteProcess: vi.fn(),
    })
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelectorAll('.chg-row').length).toBeGreaterThan(0))
    expect(container.textContent).not.toContain('Glicerina bidestilada')
    expect(screen.queryByRole('button', { name: 'Novo processo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar do DBCorp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Arquivados/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeInTheDocument()
  })
})
