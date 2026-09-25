// Tests do ProcessListView focados na linguagem mobile do F16.4:
// segmented Todos/Marítimo/Aéreo (filtro de exibição) e seções
// Em andamento / Concluídos. matchMedia é stubado pra forçar mobile.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import ProcessListView from '../../src/features/processes/ProcessListView.jsx'

function stubMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

const PROCESSES = [
  {
    id: 'p-sea-active',
    name: 'Soda Cáustica',
    processNumber: 'PO 1',
    category: 'FCL',
    processStatus: 'Em Andamento',
    destination: 'Itajaí',
    eta: '2026-07-20',
    containerQuantity: 2,
    palletQuantity: 0,
  },
  {
    id: 'p-air-active',
    name: 'Catalisador',
    processNumber: 'AWB 2',
    category: 'AEREO',
    processStatus: 'Em Andamento',
    destination: 'GRU',
    eta: '2026-07-21',
    containerQuantity: 0,
    palletQuantity: 3,
  },
  {
    id: 'p-sea-done',
    name: 'Peróxido',
    processNumber: 'PO 3',
    category: 'FCL',
    processStatus: 'Carga recebida',
    destination: 'Navegantes',
    eta: '2026-07-02',
    containerQuantity: 1,
    palletQuantity: 0,
  },
]

function renderView(props = {}) {
  return render(
    <ProcessListView
      filteredProcesses={PROCESSES}
      isLoading={false}
      selectedProcessId={null}
      isAdmin={false}
      searchTerm=""
      categoryFilter="Todos"
      etaStartDate=""
      etaEndDate=""
      operationFilter="Todos"
      hasActiveFilters={false}
      processCategoryOptions={['FCL', 'LCL', 'AEREO', 'CONSOLIDADO']}
      onSearchTermChange={vi.fn()}
      onCategoryFilterChange={vi.fn()}
      onEtaStartDateChange={vi.fn()}
      onEtaEndDateChange={vi.fn()}
      onOperationFilterChange={vi.fn()}
      onClearAllFilters={vi.fn()}
      onSelectProcess={vi.fn()}
      onExport={vi.fn()}
      {...props}
    />
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProcessListView — linguagem mobile (F16.4)', () => {
  describe('mobile (≤720px)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('separa em seções Em andamento e Concluídos', () => {
      const { container } = renderView()
      const labels = [...container.querySelectorAll('.process-list__section-label')].map(
        (el) => el.textContent
      )
      expect(labels).toEqual(['Em andamento', 'Concluídos'])
    })

    it('segmented Aéreo filtra só processos aéreos', async () => {
      const user = userEvent.setup()
      const { container } = renderView()
      await user.click(screen.getByRole('button', { name: 'Aéreo' }))

      const rows = container.querySelectorAll('.process-item--button')
      expect(rows).toHaveLength(1)
      // admin=false esconde o nome; o AWB (processNumber) identifica o aéreo.
      expect(within(rows[0]).getByText(/AWB 2/)).toBeInTheDocument()
    })

    it('segmented Marítimo esconde o aéreo e mantém as duas seções', async () => {
      const user = userEvent.setup()
      const { container } = renderView()
      await user.click(screen.getByRole('button', { name: 'Marítimo' }))

      expect(container.querySelectorAll('.process-item--button')).toHaveLength(2)
      const labels = [...container.querySelectorAll('.process-list__section-label')].map(
        (el) => el.textContent
      )
      expect(labels).toEqual(['Em andamento', 'Concluídos'])
    })
  })

  describe('desktop (>720px)', () => {
    beforeEach(() => stubMatchMedia(false))

    it('não renderiza seções — lista plana na ordem recebida', () => {
      const { container } = renderView()
      expect(container.querySelectorAll('.process-list__section-label')).toHaveLength(0)
      expect(container.querySelectorAll('.process-item--button')).toHaveLength(3)
    })
  })

  describe('swipe-to-favoritar (F16.8)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('sem onToggleFavorite, nenhuma ação de favoritar é renderizada', () => {
      const { container } = renderView({ onToggleFavorite: undefined })
      expect(container.querySelectorAll('.process-swipe-row__action--favorite')).toHaveLength(0)
    })

    it('rótulo da ação reflete favoriteProcessIds (Favoritar/Desfavoritar)', () => {
      const { container } = renderView({
        onToggleFavorite: vi.fn(),
        favoriteProcessIds: ['p-sea-active'],
      })
      const rows = container.querySelectorAll('.process-swipe-row')
      const labelFor = (row) => row.querySelector('.process-swipe-row__action--favorite span').textContent
      expect(labelFor(rows[0])).toBe('Desfavoritar') // p-sea-active já é favorito
      expect(labelFor(rows[1])).toBe('Favoritar') // p-air-active não é
    })

    it('clicar na ação chama onToggleFavorite com o id do processo', async () => {
      const user = userEvent.setup()
      const onToggleFavorite = vi.fn()
      const { container } = renderView({ onToggleFavorite, favoriteProcessIds: [] })
      const action = container.querySelector('.process-swipe-row__action--favorite')
      await user.click(action)
      expect(onToggleFavorite).toHaveBeenCalledWith('p-sea-active')
    })
  })

  describe('swipe-to-arquivar (F16.8, admin-only)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('sem isAdmin, nenhuma ação de arquivar é renderizada (mesmo com onArchiveProcess)', () => {
      const { container } = renderView({ isAdmin: false, onArchiveProcess: vi.fn() })
      expect(container.querySelectorAll('.process-swipe-row__action--archive')).toHaveLength(0)
    })

    it('admin: ação de arquivar aparece e clicar chama onArchiveProcess(id, true)', async () => {
      const user = userEvent.setup()
      const onArchiveProcess = vi.fn()
      const { container } = renderView({ isAdmin: true, onArchiveProcess })
      const action = container.querySelector('.process-swipe-row__action--archive')
      expect(action).not.toBeNull()
      await user.click(action)
      expect(onArchiveProcess).toHaveBeenCalledWith('p-sea-active', true)
    })

    it('sem isAdmin, seção "Arquivados" não aparece mesmo com archivedProcesses preenchido', () => {
      const { container } = renderView({
        isAdmin: false,
        archivedProcesses: [PROCESSES[0]],
      })
      const labels = [...container.querySelectorAll('.process-list__section-label')].map(
        (el) => el.textContent
      )
      expect(labels).not.toContain('Arquivados')
    })

    it('admin: seção "Arquivados" lista os processos arquivados com ação "Restaurar"', async () => {
      const user = userEvent.setup()
      const onArchiveProcess = vi.fn()
      // Em uso real, filteredProcesses (vindo de ProcessesPage) já exclui
      // os processos arquivados — aqui simulamos isso passando só os 2
      // ativos, com o 3º (p-sea-done) vindo exclusivamente via archivedProcesses.
      const { container } = renderView({
        isAdmin: true,
        onArchiveProcess,
        filteredProcesses: PROCESSES.slice(0, 2),
        archivedProcesses: [PROCESSES[2]],
      })
      const labels = [...container.querySelectorAll('.process-list__section-label')].map(
        (el) => el.textContent
      )
      expect(labels).toEqual(['Em andamento', 'Arquivados'])

      const restoreAction = container.querySelector('.process-swipe-row__action--restore')
      expect(restoreAction).not.toBeNull()
      expect(restoreAction.querySelector('span').textContent).toBe('Restaurar')
      await user.click(restoreAction)
      expect(onArchiveProcess).toHaveBeenCalledWith('p-sea-done', false)
    })
  })

  describe('acessibilidade e teclado (P1-2)', () => {
    beforeEach(() => stubMatchMedia(false))

    it('ativa onSelectProcess apertando Enter ou Espaço na linha do processo', async () => {
      const user = userEvent.setup()
      const onSelectProcess = vi.fn()
      const { container } = renderView({ onSelectProcess })
      
      const rows = container.querySelectorAll('.process-item--button')
      expect(rows.length).toBeGreaterThan(0)
      
      rows[0].focus()
      await user.keyboard('{Enter}')
      expect(onSelectProcess).toHaveBeenCalledWith('p-sea-active')
      
      rows[1].focus()
      await user.keyboard(' ')
      expect(onSelectProcess).toHaveBeenCalledWith('p-air-active')
    })

    it('clicar na ação inline Favoritar chama onToggleFavorite sem acionar a linha pai', async () => {
      const user = userEvent.setup()
      const onSelectProcess = vi.fn()
      const onToggleFavorite = vi.fn()
      const { container } = renderView({ onSelectProcess, onToggleFavorite, favoriteProcessIds: [] })
      
      const starButton = container.querySelector('.action-icon-button')
      expect(starButton).not.toBeNull()
      
      await user.click(starButton)
      expect(onToggleFavorite).toHaveBeenCalledWith('p-sea-active')
      expect(onSelectProcess).not.toHaveBeenCalled()
    })
  })
})

// UX-4 (A7): painel de filtros inline no mobile com botão "Filtros (n)".
describe('ProcessListView — painel de filtros inline no mobile (UX-4)', () => {
  describe('mobile (≤720px)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('sem filtros, o botão tem nome "Filtros" e aria-expanded="false", painel fechado', () => {
      const { container } = renderView()
      const toggle = screen.getByRole('button', { name: 'Filtros' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const panel = container.querySelector('#chegadas-filters-panel')
      expect(panel).not.toHaveClass('process-filters--panel--open')
    })

    it('com filtros ativos (busca não conta), o botão mostra "Filtros (3)"', () => {
      renderView({
        categoryFilter: 'FCL',
        etaStartDate: '2026-07-01',
        operationFilter: 'Coleta pendente',
        searchTerm: 'x',
      })
      expect(screen.getByRole('button', { name: 'Filtros (3)' })).toBeInTheDocument()
    })

    it('clicar em Filtros abre o painel e o SelectField de etapa fica acessível', async () => {
      const user = userEvent.setup()
      const { container } = renderView()
      const toggle = screen.getByRole('button', { name: 'Filtros' })
      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const panel = container.querySelector('#chegadas-filters-panel')
      expect(panel).toHaveClass('process-filters--panel--open')
      expect(screen.getByRole('button', { name: 'Etapa operacional: Todas' })).toBeInTheDocument()
    })

    it('com filtros ativos, clicar em "Limpar todos" chama onClearAllFilters', async () => {
      const user = userEvent.setup()
      const onClearAllFilters = vi.fn()
      renderView({
        hasActiveFilters: true,
        categoryFilter: 'FCL',
        onClearAllFilters,
      })
      await user.click(screen.getByRole('button', { name: 'Limpar todos' }))
      expect(onClearAllFilters).toHaveBeenCalled()
    })
  })
})

// UX-4 (A7): "Arquivados (n)" no desktop (admin), alternância no toolbar.
describe('ProcessListView — Arquivados no desktop (UX-4)', () => {
  describe('desktop (>720px)', () => {
    beforeEach(() => stubMatchMedia(false))

    it('admin com arquivados: mostra "Arquivados (1)", alterna a lista e Restaurar chama onArchiveProcess', async () => {
      const user = userEvent.setup()
      const onArchiveProcess = vi.fn()
      const { container } = renderView({
        isAdmin: true,
        onArchiveProcess,
        filteredProcesses: PROCESSES.slice(0, 2),
        archivedProcesses: [PROCESSES[2]],
      })
      const toggle = screen.getByRole('button', { name: 'Arquivados (1)' })
      expect(toggle).toHaveAttribute('aria-pressed', 'false')

      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      // lista de ativos some, só o arquivado aparece
      expect(container.querySelectorAll('.process-item--button')).toHaveLength(1)

      const restoreAction = container.querySelector('.action-icon-button[aria-label="Restaurar processo"]')
      expect(restoreAction).not.toBeNull()
      await user.click(restoreAction)
      expect(onArchiveProcess).toHaveBeenCalledWith('p-sea-done', false)
    })

    it('isAdmin={false} com arquivados não mostra o botão "Arquivados"', () => {
      renderView({
        isAdmin: false,
        onArchiveProcess: vi.fn(),
        archivedProcesses: [PROCESSES[2]],
      })
      expect(screen.queryByText(/Arquivados/)).not.toBeInTheDocument()
    })

    it('admin com archivedProcesses=[] não mostra o botão', () => {
      renderView({
        isAdmin: true,
        onArchiveProcess: vi.fn(),
        archivedProcesses: [],
      })
      expect(screen.queryByText(/Arquivados/)).not.toBeInTheDocument()
    })
  })
})

// F17.1a (D-E): badge "Dados pendentes" so' pro admin.
describe('ProcessListView — pendências admin-only (F17.1a)', () => {
  beforeEach(() => stubMatchMedia(true))

  it('admin ve o badge de dados pendentes quando ha campos faltando', () => {
    renderView({ isAdmin: true })
    expect(screen.getAllByText(/Dados pendentes/).length).toBeGreaterThan(0)
  })

  it('user/logistica (isAdmin false) NAO ve o badge de dados pendentes', () => {
    renderView({ isAdmin: false })
    expect(screen.queryByText(/Dados pendentes/)).not.toBeInTheDocument()
  })
})

describe('ProcessListView — badge de contêiner especial (F17.2a D-7)', () => {
  beforeEach(() => stubMatchMedia(true))

  it('contêiner 40RF gera badge "Reefer"', () => {
    renderView({
      filteredProcesses: [
        {
          ...PROCESSES[0],
          containers: [{ id: 'CNT-1', number: '', seal: '', type: '40RF' }],
        },
      ],
    })
    expect(screen.getByText('Reefer')).toBeInTheDocument()
  })

  it('sem containers especiais NAO mostra badge', () => {
    renderView({ filteredProcesses: [PROCESSES[0]] })
    expect(screen.queryByText('Reefer')).not.toBeInTheDocument()
    expect(screen.queryByText('ISO tank')).not.toBeInTheDocument()
  })
})

// F17.2b (D-6): badge vermelho no card quando alguma anuência foi indeferida.
describe('ProcessListView — badge "Anuência indeferida" (F17.2b)', () => {
  beforeEach(() => stubMatchMedia(true))

  it('licença Indeferida gera o badge "Anuência indeferida"', () => {
    renderView({
      filteredProcesses: [
        {
          ...PROCESSES[0],
          licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }],
        },
      ],
    })
    expect(screen.getByText('Anuência indeferida')).toBeInTheDocument()
  })

  it('sem licença indeferida NAO mostra o badge', () => {
    renderView({ filteredProcesses: [PROCESSES[0]] })
    expect(screen.queryByText('Anuência indeferida')).not.toBeInTheDocument()
  })
})

// F17.2d-1 (D-4, Q4): badge "Carga perigosa" - flag do processo OU algum
// item classificado.
describe('ProcessListView — badge "Carga perigosa" (F17.2d-1)', () => {
  beforeEach(() => stubMatchMedia(true))

  it('processo com item dangerousGoods gera o badge "Carga perigosa"', () => {
    renderView({
      filteredProcesses: [
        {
          ...PROCESSES[0],
          items: [{ id: 'i1', commercialName: 'Resina', quantity: 1, dangerousGoods: true }],
        },
      ],
    })
    expect(screen.getByText('Carga perigosa')).toBeInTheDocument()
  })

  it('sem item/flag de carga perigosa NAO mostra o badge', () => {
    renderView({ filteredProcesses: [PROCESSES[0]] })
    expect(screen.queryByText('Carga perigosa')).not.toBeInTheDocument()
  })
})

// F17.2d-2 (Q6/Q1): card CONSOLIDADO com POs objeto so mostra os numeros
// (getProcessSubtitle -> formatPurchaseOrdersSummary) - referencia/fornecedor
// nunca aparecem no card, admin ou nao.
describe('ProcessListView — card CONSOLIDADO nao vaza referencia/fornecedor da PO (F17.2d-2)', () => {
  beforeEach(() => stubMatchMedia(true))

  const CONSOLIDATED = {
    ...PROCESSES[0],
    id: 'p-cons',
    category: 'CONSOLIDADO',
    processNumber: '',
    purchaseOrders: [{ po: 'PO-A', reference: 'REF-SECRETA', supplierName: 'ACME' }],
  }

  it('user (isAdmin false): mostra "POs: PO-A", nao mostra REF-SECRETA/ACME', () => {
    renderView({ filteredProcesses: [CONSOLIDATED], isAdmin: false })
    expect(screen.getByText('PO: PO-A')).toBeInTheDocument()
    expect(screen.queryByText(/REF-SECRETA/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ACME/)).not.toBeInTheDocument()
  })

  it('admin: mostra "POs: PO-A", nao mostra REF-SECRETA/ACME', () => {
    renderView({ filteredProcesses: [CONSOLIDATED], isAdmin: true })
    expect(screen.getByText('PO: PO-A')).toBeInTheDocument()
    expect(screen.queryByText(/REF-SECRETA/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ACME/)).not.toBeInTheDocument()
  })
})
