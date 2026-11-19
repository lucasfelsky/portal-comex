// Tests do ProcessListView focados na linguagem mobile do F16.4 e do remake F4:
// filtro de modal (Todos/Marítimo/Aéreo) na folha de filtros e eyebrows
// Em andamento / Concluídos. matchMedia é stubado pra forçar mobile.
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

// Remake mobile (F4): abre a folha de filtros pelo botao (nome "Filtros" ou "Filtros (n)").
async function openFilterSheet(user) {
  await user.click(screen.getByRole('button', { name: /^Filtros/ }))
  return screen.getByRole('dialog', { name: 'Filtros' })
}

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

    it('Modal Aéreo (na folha de filtros) filtra só processos aéreos', async () => {
      const user = userEvent.setup()
      const { container } = renderView()
      const dialog = await openFilterSheet(user)
      await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
      await user.click(within(dialog).getByRole('button', { name: 'Ver 1 processo' }))

      const rows = container.querySelectorAll('.process-item--button')
      expect(rows).toHaveLength(1)
      // admin=false esconde o nome; o AWB (processNumber) identifica o aéreo.
      expect(within(rows[0]).getByText(/AWB 2/)).toBeInTheDocument()
    })

    it('Modal Marítimo esconde o aéreo e mantém as duas seções', async () => {
      const user = userEvent.setup()
      const { container } = renderView()
      const dialog = await openFilterSheet(user)
      await user.click(within(dialog).getByRole('button', { name: 'Marítimo' }))
      await user.click(within(dialog).getByRole('button', { name: 'Ver 2 processos' }))

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
      // Remake F4: Ativas/Arquivadas e um segmented (so admin/logistica).
      expect(container.querySelector('.process-list__section-label').textContent).toBe('Em andamento')
      await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
      const labels = [...container.querySelectorAll('.process-list__section-label')].map(
        (el) => el.textContent
      )
      expect(labels).toEqual(['Arquivados'])

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

// Refino F3: estrela de favorito com mola (scale 0 -> 1, 300 ms) so ao ATIVAR, e
// skeleton no formato real do card no desktop (o antigo segue para tablet/mobile).
describe('ProcessListView — movimento (refino F3)', () => {
  beforeEach(() => stubMatchMedia(false))

  const starOf = (container, index = 0) => container.querySelectorAll('.process-item--button .action-icon-button')[index]

  it('a estrela ganha a classe da mola so na transicao desativado -> ativado', () => {
    const { container, rerender } = renderView({ onToggleFavorite: vi.fn(), favoriteProcessIds: [] })
    expect(starOf(container).querySelector('svg')).not.toHaveClass('favorite-star--pop')

    const props = {
      filteredProcesses: PROCESSES,
      isLoading: false,
      selectedProcessId: null,
      isAdmin: false,
      searchTerm: '',
      categoryFilter: 'Todos',
      etaStartDate: '',
      etaEndDate: '',
      operationFilter: 'Todos',
      hasActiveFilters: false,
      processCategoryOptions: ['FCL'],
      onSearchTermChange: vi.fn(),
      onCategoryFilterChange: vi.fn(),
      onEtaStartDateChange: vi.fn(),
      onEtaEndDateChange: vi.fn(),
      onOperationFilterChange: vi.fn(),
      onClearAllFilters: vi.fn(),
      onSelectProcess: vi.fn(),
      onExport: vi.fn(),
      onToggleFavorite: vi.fn(),
    }
    rerender(<ProcessListView {...props} favoriteProcessIds={['p-sea-active']} />)
    const first = starOf(container)
    expect(first).toHaveAttribute('aria-label', 'Desfavoritar processo')
    expect(first.querySelector('svg')).toHaveClass('favorite-star--pop')

    // desfavoritar remove a classe
    rerender(<ProcessListView {...props} favoriteProcessIds={[]} />)
    expect(starOf(container).querySelector('svg')).not.toHaveClass('favorite-star--pop')
  })

  it('lista que monta com favoritos ja ativos nao anima a estrela', () => {
    const { container } = renderView({ onToggleFavorite: vi.fn(), favoriteProcessIds: ['p-sea-active'] })
    expect(starOf(container).querySelector('svg')).not.toHaveClass('favorite-star--pop')
  })

  it('carregando: skeleton no formato do card (5 pecas) + o antigo (4 pecas) para tablet/mobile', () => {
    const { container } = renderView({ isLoading: true })
    const cards = container.querySelectorAll('.process-card-skeleton')
    expect(cards).toHaveLength(4)
    expect(cards[0].querySelectorAll('.skeleton')).toHaveLength(5)
    const legacy = container.querySelectorAll('.skeleton-legacy .process-item--skeleton')
    expect(legacy).toHaveLength(4)
    expect(legacy[0].querySelectorAll('.skeleton')).toHaveLength(4)
    // sem o fade de revelacao enquanto carrega; com ele depois
    expect(container.querySelector('.process-list--scroll')).not.toHaveClass('skeleton-reveal')
  })

  it('terminou de carregar: o conteudo entra com a classe de fade (skeleton -> conteudo)', () => {
    const { container } = renderView({ isLoading: false })
    expect(container.querySelector('.process-list--scroll')).toHaveClass('skeleton-reveal')
  })
})

// UX-4 (A7): painel de filtros inline no mobile com botão "Filtros (n)".
describe('ProcessListView — painel de filtros inline no mobile (UX-4)', () => {
  describe('mobile (≤720px)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('sem filtros, o botão tem nome "Filtros", aria-expanded="false" e não há folha aberta', () => {
      renderView()
      const toggle = screen.getByRole('button', { name: 'Filtros' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(toggle).toHaveAttribute('aria-haspopup', 'dialog')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(document.querySelector('#chegadas-filters-panel')).toBeNull()
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

    it('clicar em Filtros abre a folha e a etapa operacional vira chips dentro dela', async () => {
      const user = userEvent.setup()
      renderView()
      const toggle = screen.getByRole('button', { name: 'Filtros' })
      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const dialog = screen.getByRole('dialog', { name: 'Filtros' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      const operation = within(dialog).getByRole('group', { name: 'Etapa operacional' })
      expect(within(operation).getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(operation).getByRole('button', { name: 'Coleta pendente' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('tablet (721-1040px)', () => {
    beforeEach(() => stubMatchMedia(false))

    it('com filtros ativos, "Limpar todos" (linha de filtros ativos) chama onClearAllFilters', async () => {
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

    it('o painel de filtros inline e o SelectField de etapa seguem no tablet', () => {
      const { container } = renderView()
      expect(container.querySelector('#chegadas-filters-panel')).not.toBeNull()
      expect(screen.getByRole('combobox', { name: /Etapa operacional/ })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
  // Remake F4: no mobile (<=720px) a carga vira icone; as pilulas de texto seguem no tablet.
  beforeEach(() => stubMatchMedia(false))

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

// Tag "Carga inflamavel" (classes IMDG 2.1/3/4.1), derivada na leitura.
// Quando o processo e' inflamavel, "Carga inflamável" tem prioridade sobre
// "Carga perigosa" (que fica redundante e vai depois de "Dados pendentes").
describe('ProcessListView — badge "Carga inflamável"', () => {
  beforeEach(() => stubMatchMedia(false))

  const alertLabels = (container) =>
    [...container.querySelectorAll('.process-item__chips .inline-badge')]
      .map((el) => el.textContent)
      .filter((text) => /^(Anuência|Carga |Dados pendentes|\+\d)/.test(text))

  const withItem = (dangerous) => ({
    ...PROCESSES[0],
    items: [{ id: 'i1', commercialName: 'Solvente', quantity: 1, dangerousGoods: true, ...dangerous }],
  })

  it('item perigoso classe 3: mostra "Carga inflamável" (danger) e "Carga perigosa"', () => {
    renderView({ filteredProcesses: [withItem({ imoClass: '3' })] })
    expect(screen.getByText('Carga perigosa')).toBeInTheDocument()
    expect(screen.getByText('Carga inflamável')).toHaveClass('inline-badge--danger')
  })

  it('inflamável sem pendentes: "Carga inflamável" antes de "Carga perigosa"', () => {
    const { container } = renderView({ filteredProcesses: [withItem({ imoClass: '3' })] })
    expect(alertLabels(container)).toEqual(['Carga inflamável', 'Carga perigosa'])
  })

  it('inflamável + pendentes (admin): inflamável, pendentes, depois "Carga perigosa" (overflow)', () => {
    const { container } = renderView({ isAdmin: true, filteredProcesses: [withItem({ imoClass: '3' })] })
    const labels = alertLabels(container)
    expect(labels).toHaveLength(4)
    expect(labels[0]).toBe('Carga inflamável')
    expect(labels[1]).toMatch(/^Dados pendentes \(\d+\)$/)
    expect(labels[2]).toBe('Carga perigosa')
    expect(labels[3]).toBe('+1')

    // Mobile: so' os 2 primeiros visiveis; "Carga perigosa" cai no "+1".
    const chips = container.querySelector('.process-item__chips')
    expect(within(chips).getByText('Carga inflamável')).not.toHaveClass('inline-badge--overflow')
    expect(within(chips).getByText(/^Dados pendentes/)).not.toHaveClass('inline-badge--overflow')
    expect(within(chips).getByText('Carga perigosa')).toHaveClass('inline-badge--overflow')
  })

  it('perigosa NÃO inflamável + pendentes (admin): "Carga perigosa" antes de pendentes, como antes', () => {
    const { container } = renderView({ isAdmin: true, filteredProcesses: [withItem({ imoClass: '8' })] })
    const labels = alertLabels(container)
    expect(labels).toHaveLength(2)
    expect(labels[0]).toBe('Carga perigosa')
    expect(labels[1]).toMatch(/^Dados pendentes/)
    expect(screen.queryByText('Carga inflamável')).not.toBeInTheDocument()
  })

  it('Anuência indeferida continua em primeiro, antes de "Carga inflamável"', () => {
    const { container } = renderView({
      isAdmin: true,
      filteredProcesses: [
        { ...withItem({ imoClass: '3' }), licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }] },
      ],
    })
    const labels = alertLabels(container)
    expect(labels.slice(0, 2)).toEqual(['Anuência indeferida', 'Carga inflamável'])
    expect(labels[2]).toMatch(/^Dados pendentes/)
    expect(labels[3]).toBe('Carga perigosa')
  })

  it('item perigoso classe 8: mostra só "Carga perigosa"', () => {
    renderView({
      filteredProcesses: [
        {
          ...PROCESSES[0],
          items: [{ id: 'i1', commercialName: 'Acido', quantity: 1, dangerousGoods: true, imoClass: '8' }],
        },
      ],
    })
    expect(screen.getByText('Carga perigosa')).toBeInTheDocument()
    expect(screen.queryByText('Carga inflamável')).not.toBeInTheDocument()
  })

  it('processo sem itens perigosos: nenhum dos dois chips', () => {
    renderView({ filteredProcesses: [PROCESSES[0]] })
    expect(screen.queryByText('Carga perigosa')).not.toBeInTheDocument()
    expect(screen.queryByText('Carga inflamável')).not.toBeInTheDocument()
  })

  it('legado (flag + classe 3 no processo, sem itens): mostra os dois chips', () => {
    renderView({
      filteredProcesses: [{ ...PROCESSES[0], dangerousGoods: true, imoClass: '3', items: [] }],
    })
    expect(screen.getByText('Carga perigosa')).toBeInTheDocument()
    expect(screen.getByText('Carga inflamável')).toBeInTheDocument()
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

// UX-6a (item 1, D7): ordem de severidade dos alertas + corte "max 2 + +N"
// no CSS mobile (o jsdom testa a classificacao, o desktop continua com
// todos via CSS).
describe('UX-6a: alertas no card', () => {
  beforeEach(() => stubMatchMedia(false))

  const PROCESS_4_ALERTS = {
    ...PROCESSES[0],
    licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }],
    items: [{ id: 'i1', commercialName: 'Resina', quantity: 1, dangerousGoods: true }],
    containers: [{ id: 'CNT-1', number: '', seal: '', type: '40RF' }],
  }

  it('admin: os 4 alertas existem e so os 2 ultimos tem inline-badge--overflow', () => {
    const { container } = renderView({ isAdmin: true, filteredProcesses: [PROCESS_4_ALERTS] })
    const chips = container.querySelector('.process-item__chips')

    const rejected = within(chips).getByText('Anuência indeferida')
    const dangerous = within(chips).getByText('Carga perigosa')
    const pending = within(chips).getByText(/Dados pendentes/)
    const reefer = within(chips).getByText('Reefer')

    expect(rejected).not.toHaveClass('inline-badge--overflow')
    expect(dangerous).not.toHaveClass('inline-badge--overflow')
    expect(pending).toHaveClass('inline-badge--overflow')
    expect(reefer).toHaveClass('inline-badge--overflow')

    const more = container.querySelector('.inline-badge--more')
    expect(more).not.toBeNull()
    expect(more.textContent).toBe('+2')
  })

  it('processo com <= 2 alertas nao tem .inline-badge--more', () => {
    // isAdmin false: pendingFields fica vazio (admin-only), sobrando so'
    // o alerta de licenca indeferida.
    const { container } = renderView({
      isAdmin: false,
      filteredProcesses: [
        {
          ...PROCESSES[0],
          licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }],
        },
      ],
    })
    expect(screen.getByText('Anuência indeferida')).toBeInTheDocument()
    expect(container.querySelector('.inline-badge--more')).toBeNull()
  })

  it('palletQuantity: 0 nao renderiza "0 pallet"', () => {
    renderView({ filteredProcesses: [{ ...PROCESSES[0], palletQuantity: 0 }] })
    expect(screen.queryByText(/0 pallet/)).not.toBeInTheDocument()
  })

  it('palletQuantity: 3 renderiza "3 pallets"', () => {
    const { container } = renderView({
      filteredProcesses: [{ ...PROCESSES[0], containerQuantity: 0, palletQuantity: 3 }],
    })
    const badge = [...container.querySelectorAll('.process-item__chips .inline-badge')].find(
      (el) => el.textContent === '3 pallets'
    )
    expect(badge).toBeTruthy()
  })
})

// Redesign mobile (PLAN.md B3): grupos "inset grouped", acoes do swipe so
// aparecem revelando e icone aereo com modificador proprio.
describe('ProcessListView — redesign mobile (grupos e swipe em repouso)', () => {
  describe('mobile (≤720px)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('cada secao (Em andamento, Concluidos) e um .process-list__group logo apos o rotulo', () => {
      const { container } = renderView()
      const groups = container.querySelectorAll('.process-list__group')
      expect(groups).toHaveLength(2)
      expect(container.querySelectorAll('.process-list__group .process-swipe-row')).toHaveLength(3)
      container.querySelectorAll('.process-list__section-label').forEach((label) => {
        expect(label.nextElementSibling.classList.contains('process-list__group')).toBe(true)
      })
    })

    it('em repouso nenhuma linha tem .process-swipe-row--revealing', () => {
      const { container } = renderView({ onToggleFavorite: vi.fn(), isAdmin: true, onArchiveProcess: vi.fn() })
      expect(container.querySelectorAll('.process-swipe-row').length).toBeGreaterThan(0)
      expect(container.querySelectorAll('.process-swipe-row--revealing')).toHaveLength(0)
    })

    it('cartao: a linha "PO · modal" diz Aéreo no aéreo e Marítimo nos demais (sem nome, o PO fica no título) (sem o ícone de categoria da linha)', () => {
      const { container } = renderView()
      const cards = [...container.querySelectorAll('.process-item--button')]
      expect(cards).toHaveLength(3)
      expect(cards.map((card) => card.querySelector('.m-pc__po').textContent)).toEqual([
        'Marítimo',
        'Aéreo',
        'Marítimo',
      ])
      expect(container.querySelectorAll('.process-item__leading')).toHaveLength(0)
    })
  })

  describe('desktop (>720px)', () => {
    beforeEach(() => stubMatchMedia(false))

    it('nao renderiza .process-list__group (lista plana intacta)', () => {
      const { container } = renderView()
      expect(container.querySelectorAll('.process-list__group')).toHaveLength(0)
      expect(container.querySelectorAll('.process-swipe-row--revealing')).toHaveLength(0)
    })
  })
})

// Ajustes finais: "container(s)" -> "contêiner(es)" em todo texto visivel.
describe('ProcessListView — grafia "contêiner(es)"', () => {
  beforeEach(() => stubMatchMedia(false))

  it('2 -> "2 contêineres" e 1 -> "1 contêiner" nos chips; nunca "container"', () => {
    const { container } = renderView()
    const badges = [...container.querySelectorAll('.process-item__chips .inline-badge')].map((el) => el.textContent)
    expect(badges).toContain('2 contêineres')
    expect(badges).toContain('1 contêiner')
    expect(container.textContent).not.toMatch(/\bcontainers?\b/i)
  })
})

// "Importar do DBCorp" (antes "Conciliar com ERP"; F1 + PR 3): botao so' para o
// admin, so' no desktop (o CSS o esconde em <= 1040px) e desabilitado enquanto
// a lista carrega.
describe('ProcessListView — botão "Importar do DBCorp" (F1 + PR 3, somente admin)', () => {
  beforeEach(() => stubMatchMedia(false))

  it('aparece só com isAdmin && onReconcileErp e tem a classe erp-reconcile-trigger', () => {
    const { unmount } = renderView({ isAdmin: true, onReconcileErp: vi.fn() })
    const button = screen.getByRole('button', { name: 'Importar do DBCorp' })
    expect(button).toHaveClass('ghost-button', 'erp-reconcile-trigger')
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute(
      'title',
      'Anexar a planilha do DBCorp: concilia com os processos e salva como referência do ERP'
    )
    unmount()

    const { unmount: unmountUser } = renderView({ isAdmin: false, onReconcileErp: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Importar do DBCorp' })).not.toBeInTheDocument()
    unmountUser()

    renderView({ isAdmin: true })
    expect(screen.queryByRole('button', { name: 'Importar do DBCorp' })).not.toBeInTheDocument()
  })

  it('é o único botão de importar: o "Importar" antigo (processos em lote) saiu da toolbar, mesmo com onImport', () => {
    const { container } = renderView({ isAdmin: true, onReconcileErp: vi.fn(), onImport: vi.fn() })
    const importButtons = screen.getAllByRole('button', { name: /^Importar/ })
    expect(importButtons.map((button) => button.textContent)).toEqual(['Importar do DBCorp'])
    expect(screen.queryByRole('button', { name: 'Importar' })).not.toBeInTheDocument()
    expect(container.querySelector('[title="Criar processos em lote a partir de uma planilha"]')).toBeNull()
  })

  it('o clique chama o callback', async () => {
    const user = userEvent.setup()
    const onReconcileErp = vi.fn()
    renderView({ isAdmin: true, onReconcileErp })
    await user.click(screen.getByRole('button', { name: 'Importar do DBCorp' }))
    expect(onReconcileErp).toHaveBeenCalledTimes(1)
  })

  it('fica disabled com isLoading', async () => {
    const user = userEvent.setup()
    const onReconcileErp = vi.fn()
    renderView({ isAdmin: true, onReconcileErp, isLoading: true })
    const button = screen.getByRole('button', { name: 'Importar do DBCorp' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onReconcileErp).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Remake mobile F4 (Chegadas): cartoes, icones de carga, chips de etapa,
// segmented Ativas/Arquivadas, estado vazio e folha de filtros.
// ---------------------------------------------------------------------------
const STAGED = [
  {
    id: 's-transit',
    name: 'Resina A',
    processNumber: 'PO 10',
    category: 'FCL',
    processStatus: 'Embarcou',
    destination: 'Santos',
    eta: '2026-08-10',
    containerQuantity: 2,
    palletQuantity: 0,
    supplierName: 'ACME Química',
  },
  {
    id: 's-berth',
    name: 'Solvente B',
    processNumber: 'PO 11',
    category: 'FCL',
    processStatus: 'Atracação Confirmada',
    destination: 'Itajaí',
    eta: '2026-08-12',
    containerQuantity: 1,
    palletQuantity: 0,
  },
  {
    id: 's-release',
    name: 'Pigmento C',
    processNumber: 'AWB 12',
    category: 'AEREO',
    processStatus: 'Aguardando desembaraço',
    destination: 'GRU',
    eta: '2026-08-14',
    containerQuantity: 0,
    palletQuantity: 3,
  },
  {
    id: 's-done',
    name: 'Aditivo D',
    processNumber: 'PO 13',
    category: 'FCL',
    processStatus: 'Carga recebida',
    destination: 'Navegantes',
    eta: '2026-08-01',
    containerQuantity: 1,
    palletQuantity: 0,
  },
]

const FLAMMABLE_ITEM = {
  ...STAGED[0],
  items: [{ id: 'i1', commercialName: 'Solvente', quantity: 1, dangerousGoods: true, imoClass: '3' }],
}

const cardsOf = (container) => [...container.querySelectorAll('.process-item--button')]

describe('ProcessListView — cartões do remake mobile (F4)', () => {
  describe('mobile (≤720px)', () => {
    beforeEach(() => stubMatchMedia(true))

    it('carga inflamável, perigosa e volume viram ícones ao lado do nome, sem as pílulas de texto', () => {
      const { container } = renderView({ filteredProcesses: [FLAMMABLE_ITEM] })
      const marks = container.querySelector('.m-pc__head .m-marks')
      expect(marks).not.toBeNull()
      expect(within(marks).getByRole('img', { name: 'Carga inflamável' })).toHaveAttribute('title', 'Carga inflamável')
      expect(within(marks).getByRole('img', { name: 'Carga perigosa' })).toBeInTheDocument()
      expect(within(marks).getByRole('img', { name: '2 contêineres' })).toBeInTheDocument()
      // Nenhuma pilula de texto equivalente (o aria-label nao e' texto visivel).
      expect(screen.queryByText('Carga inflamável')).not.toBeInTheDocument()
      expect(screen.queryByText('Carga perigosa')).not.toBeInTheDocument()
      expect(screen.queryByText('2 contêineres')).not.toBeInTheDocument()
      expect(container.querySelectorAll('.process-item__chips .inline-badge')).toHaveLength(0)
      // As marcas ficam fora do <strong> do nome (o nome continua so' o nome).
      expect(container.querySelector('.m-pc__title').textContent).toBe('PO: PO 10')
    })

    it('as tags de STATUS continuam em texto (status do processo e alertas que não são de carga)', () => {
      const { container } = renderView({
        isAdmin: true,
        filteredProcesses: [{ ...FLAMMABLE_ITEM, licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }] }],
      })
      const tags = container.querySelector('.m-pc__tags')
      expect(within(tags).getByText('Embarcou')).toBeInTheDocument()
      expect(within(tags).getByText('Anuência indeferida')).toBeInTheDocument()
      expect(within(tags).getByText(/^Dados pendentes/)).toBeInTheDocument()
    })

    it('o "+N" é calculado sobre a lista já sem as marcas de carga', () => {
      const { container } = renderView({
        isAdmin: true,
        filteredProcesses: [
          {
            ...FLAMMABLE_ITEM,
            licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }],
            containers: [{ id: 'CNT-1', number: '', seal: '', type: '40RF' }],
          },
        ],
      })
      const tags = container.querySelector('.m-pc__tags')
      // Anuencia + Dados pendentes + Reefer = 3 alertas: 2 visiveis, Reefer no overflow e "+1".
      expect(within(tags).getByText('Reefer')).toHaveClass('inline-badge--overflow')
      expect(tags.querySelector('.inline-badge--more').textContent).toBe('+1')
    })

    it('volume de carga solta: aéreo com pallets usa o mesmo ícone de caixa com "N pallets"', () => {
      renderView({ filteredProcesses: [STAGED[2]] })
      expect(screen.getByRole('img', { name: '3 pallets' })).toBeInTheDocument()
      expect(screen.queryByText('3 pallets')).not.toBeInTheDocument()
    })

    it('mostra os 5 segmentos de etapa (anteriores concluídos, atual pulsando) e o rótulo da etapa', () => {
      const { container } = renderView({ filteredProcesses: [STAGED[1]] })
      const seg = container.querySelector('.m-seg5')
      expect(seg).toHaveAttribute('role', 'img')
      expect(seg).toHaveAttribute('aria-label', 'Etapa 3 de 5: Chegada')
      expect(seg.querySelectorAll('.m-seg5__i')).toHaveLength(5)
      expect(seg.querySelectorAll('.m-seg5__i--done')).toHaveLength(2)
      expect(seg.querySelectorAll('.m-seg5__i--now')).toHaveLength(1)
      expect(container.querySelector('.m-pc__stage').textContent).toBe('Chegada')
      expect(container.querySelector('.m-pc__eta').textContent).toBe('ETA 12/08')
    })

    it('carga recebida: todos os segmentos concluídos e nenhum pulsando', () => {
      const { container } = renderView({ filteredProcesses: [STAGED[3]] })
      expect(container.querySelectorAll('.m-seg5__i--done')).toHaveLength(5)
      expect(container.querySelectorAll('.m-seg5__i--now')).toHaveLength(0)
    })

    it('porto com ícone e fornecedor só onde o detalhe também mostra (nome visível e nunca no CONSOLIDADO)', () => {
      const { container, unmount } = renderView({ canSeeName: true, filteredProcesses: [STAGED[0]] })
      expect(container.querySelector('.m-pc__port').textContent).toBe('Santos')
      expect(container.querySelector('.m-pc__supplier').textContent).toBe('ACME Química')
      unmount()

      const restricted = renderView({ canSeeName: false, filteredProcesses: [STAGED[0]] })
      expect(restricted.container.querySelector('.m-pc__port').textContent).toBe('Santos')
      expect(restricted.container.querySelector('.m-pc__supplier')).toBeNull()
      restricted.unmount()

      const consolidated = renderView({
        canSeeName: true,
        filteredProcesses: [{ ...STAGED[0], category: 'CONSOLIDADO', processNumber: '', purchaseOrders: [{ po: 'PO-A' }] }],
      })
      expect(consolidated.container.querySelector('.m-pc__supplier')).toBeNull()
    })

    it('a estrela favorita sem abrir o processo (clique e Enter) e o nome acessível leva o título do cartão', async () => {
      const user = userEvent.setup()
      const onSelectProcess = vi.fn()
      const onToggleFavorite = vi.fn()
      renderView({
        filteredProcesses: [STAGED[0]],
        favoriteProcessIds: [],
        onSelectProcess,
        onToggleFavorite,
      })
      // Nome acessivel com o titulo do cartao (cada estrela e' distinguivel).
      const star = screen.getByRole('button', { name: 'Favoritar PO: PO 10' })
      await user.click(star)
      expect(onToggleFavorite).toHaveBeenCalledWith('s-transit')
      star.focus()
      await user.keyboard('{Enter}')
      expect(onToggleFavorite).toHaveBeenCalledTimes(2)
      expect(onSelectProcess).not.toHaveBeenCalled()
    })

    it('entrada escalonada: 55ms por cartão, limitada a 10', () => {
      const many = Array.from({ length: 12 }, (_, index) => ({ ...STAGED[0], id: `many-${index}` }))
      const { container } = renderView({ filteredProcesses: many })
      const delays = [...container.querySelectorAll('.process-swipe-row')].map((row) => row.style.getPropertyValue('--d'))
      expect(delays[0]).toBe('0ms')
      expect(delays[1]).toBe('55ms')
      expect(delays[10]).toBe('550ms')
      expect(delays[11]).toBe('550ms')
    })
  })

  describe('tablet (721-1040px)', () => {
    beforeEach(() => stubMatchMedia(false))

    it('continuam as pílulas de texto de carga e a linha cinza; não há ícones de carga nem cartão', () => {
      const { container } = renderView({ filteredProcesses: [FLAMMABLE_ITEM] })
      expect(screen.getByText('Carga inflamável')).toBeInTheDocument()
      expect(screen.getByText('Carga perigosa')).toBeInTheDocument()
      expect(screen.getByText('2 contêineres', { selector: '.process-item__chips .inline-badge' })).toBeInTheDocument()
      expect(container.querySelector('.m-marks')).toBeNull()
      expect(container.querySelector('.m-pc')).toBeNull()
      expect(container.querySelector('.m-fbtn')).toBeNull()
      expect(container.querySelector('.m-chips')).toBeNull()
    })
  })
})

describe('ProcessListView — topo e filtros do remake mobile (F4)', () => {
  beforeEach(() => stubMatchMedia(true))

  it('chips de etapa com contagem, aria-pressed e filtro (Entrega só aparece em Todas)', async () => {
    const user = userEvent.setup()
    const { container } = renderView({ filteredProcesses: STAGED })
    const chips = within(screen.getByRole('group', { name: 'Etapa do processo' }))
    expect(chips.getAllByRole('button').map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Todas (4)',
      'Em trânsito (1)',
      'Atracação (1)',
      'Liberação (1)',
    ])
    expect(chips.getByRole('button', { name: 'Todas (4)' })).toHaveAttribute('aria-pressed', 'true')
    expect(chips.getByRole('button', { name: 'Em trânsito (1)' })).toHaveAttribute('aria-pressed', 'false')
    expect(cardsOf(container)).toHaveLength(4)

    await user.click(chips.getByRole('button', { name: 'Liberação (1)' }))
    expect(chips.getByRole('button', { name: 'Liberação (1)' })).toHaveAttribute('aria-pressed', 'true')
    expect(chips.getByRole('button', { name: 'Todas (4)' })).toHaveAttribute('aria-pressed', 'false')
    expect(cardsOf(container)).toHaveLength(1)
    expect(cardsOf(container)[0]).toHaveTextContent('AWB 12')

    await user.click(chips.getByRole('button', { name: 'Em trânsito (1)' }))
    expect(cardsOf(container)).toHaveLength(1)
    expect(cardsOf(container)[0]).toHaveTextContent('PO: PO 10')

    await user.click(chips.getByRole('button', { name: 'Todas (4)' }))
    expect(cardsOf(container)).toHaveLength(4)
  })

  it('"Em trânsito" agrupa Embarque e Trânsito (etapa <= 1)', () => {
    const awaiting = { ...STAGED[0], id: 's-awaiting', processStatus: 'Aguardando Embarque' }
    renderView({ filteredProcesses: [awaiting, STAGED[0]] })
    expect(screen.getByRole('button', { name: 'Em trânsito (2)' })).toBeInTheDocument()
  })

  it('o segmented Ativas/Arquivadas só existe para admin e logística (canViewArchivedProp)', () => {
    const { unmount } = renderView()
    expect(screen.queryByRole('button', { name: 'Arquivadas' })).not.toBeInTheDocument()
    unmount()

    const { unmount: unmountLogistics } = renderView({ canViewArchivedProp: true })
    expect(screen.getByRole('button', { name: 'Ativas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Arquivadas' })).toHaveAttribute('aria-pressed', 'false')
    unmountLogistics()

    renderView({ isAdmin: true, onArchiveProcess: vi.fn() })
    expect(screen.getByRole('button', { name: 'Arquivadas' })).toBeInTheDocument()
  })

  it('logística (somente leitura) vê as arquivadas sem ação de restaurar', async () => {
    const user = userEvent.setup()
    const { container } = renderView({
      canViewArchivedProp: true,
      filteredProcesses: STAGED.slice(0, 2),
      archivedProcesses: [STAGED[3]],
    })
    expect(cardsOf(container)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    expect(screen.getByRole('button', { name: 'Arquivadas' })).toHaveAttribute('aria-pressed', 'true')
    expect(cardsOf(container)).toHaveLength(1)
    expect(container.querySelector('.process-swipe-row__action--restore')).toBeNull()
    expect(container.querySelector('.process-list__section-label').textContent).toBe('Arquivados')
  })

  it('busca em type=search chama onSearchTermChange', async () => {
    const user = userEvent.setup()
    const onSearchTermChange = vi.fn()
    renderView({ onSearchTermChange })
    const search = screen.getByRole('searchbox', { name: 'Buscar processo' })
    await user.type(search, 'a')
    expect(onSearchTermChange).toHaveBeenCalledWith('a')
  })

  describe('estado vazio', () => {
    it('"Nada por aqui" com "Limpar filtros" que zera tudo (chip de etapa, filtros e busca da página)', async () => {
      const user = userEvent.setup()
      const onClearAllFilters = vi.fn()
      renderView({ filteredProcesses: STAGED.slice(0, 1), onClearAllFilters })
      await user.click(screen.getByRole('button', { name: 'Liberação (0)' }))
      const status = screen.getByRole('status')
      expect(status).toHaveTextContent('Nada por aqui')
      expect(status).toHaveTextContent('Nenhum processo corresponde à busca e aos filtros atuais.')
      await user.click(within(status).getByRole('button', { name: 'Limpar filtros' }))
      expect(onClearAllFilters).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Todas (1)' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('sem nenhum filtro não oferece "Limpar filtros"', () => {
      renderView({ filteredProcesses: [] })
      expect(screen.getByRole('status')).toHaveTextContent('Nada por aqui')
      expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
    })
  })

  describe('hero', () => {
    let hero
    beforeEach(() => {
      hero = document.createElement('div')
      hero.id = 'mobile-hero-extra'
      document.body.appendChild(hero)
    })
    afterEach(() => hero.remove())

    it('mostra "N processos ativos" (em andamento, sem concluídos) e o botão Novo para admin', async () => {
      const user = userEvent.setup()
      const onNewProcess = vi.fn()
      renderView({ isAdmin: true, onNewProcess, filteredProcesses: STAGED })
      expect(await within(hero).findByText('3 processos ativos')).toBeInTheDocument()
      await user.click(within(hero).getByRole('button', { name: 'Novo processo' }))
      expect(onNewProcess).toHaveBeenCalledTimes(1)
      // O "Novo processo" da toolbar do tablet nao existe mais no mobile.
      expect(screen.getAllByRole('button', { name: 'Novo processo' })).toHaveLength(1)
    })

    it('usa o singular e não mostra Novo para quem não é admin', async () => {
      renderView({ filteredProcesses: [STAGED[0]], onNewProcess: vi.fn() })
      expect(await within(hero).findByText('1 processo ativo')).toBeInTheDocument()
      expect(within(hero).queryByRole('button')).not.toBeInTheDocument()
    })

    it('o total do hero ignora os filtros (usa applyListFilters sem filtro nenhum)', async () => {
      const applyListFilters = vi.fn(() => STAGED)
      renderView({ filteredProcesses: STAGED.slice(0, 1), applyListFilters })
      expect(await within(hero).findByText('3 processos ativos')).toBeInTheDocument()
    })
  })

  describe('folha de filtros', () => {
    it('Esc fecha sem aplicar e devolve o foco ao botão que abriu', async () => {
      const user = userEvent.setup()
      const { container } = renderView()
      const toggle = screen.getByRole('button', { name: 'Filtros' })
      const dialog = await openFilterSheet(user)
      expect(dialog).toHaveAttribute('aria-labelledby')
      expect(document.getElementById(dialog.getAttribute('aria-labelledby'))).toHaveTextContent('Filtros')
      await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(toggle).toHaveFocus()
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      // O rascunho (Aéreo) foi descartado.
      expect(cardsOf(container)).toHaveLength(3)
      expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument()
    })

    it('tocar no scrim fecha sem aplicar', async () => {
      const user = userEvent.setup()
      const { container } = renderView()
      await openFilterSheet(user)
      await user.click(document.querySelector('.m-scrim'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(cardsOf(container)).toHaveLength(3)
    })

    it('o grab é o botão "Fechar filtros"', async () => {
      const user = userEvent.setup()
      renderView()
      const dialog = await openFilterSheet(user)
      await user.click(within(dialog).getByRole('button', { name: 'Fechar filtros' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('arrastar o grab para baixo (> 90px) fecha; um arrasto curto volta e não fecha', async () => {
      // jsdom nao traz PointerEvent (sem clientY): um MouseEvent com pointerId basta.
      class TestPointerEvent extends MouseEvent {
        constructor(type, init = {}) {
          super(type, init)
          this.pointerId = init.pointerId ?? 0
        }
      }
      const originalPointerEvent = window.PointerEvent
      window.PointerEvent = TestPointerEvent
      const user = userEvent.setup()
      renderView()
      const dialog = await openFilterSheet(user)
      const grab = within(dialog).getByRole('button', { name: 'Fechar filtros' })
      fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 })
      fireEvent.pointerMove(grab, { pointerId: 1, clientY: 130 })
      expect(dialog.style.transform).toBe('translateY(30px)')
      expect(dialog.style.transition).toBe('none')
      fireEvent.pointerUp(grab, { pointerId: 1, clientY: 130 })
      expect(dialog.style.transform).toBe('')
      // O clique sintetico logo apos o arrasto nao fecha a folha.
      fireEvent.click(grab)
      expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeInTheDocument()

      fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 })
      fireEvent.pointerMove(grab, { pointerId: 1, clientY: 220 })
      fireEvent.pointerUp(grab, { pointerId: 1, clientY: 220 })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      window.PointerEvent = originalPointerEvent
    })

    it('segura o foco: Tab no último elemento volta para o primeiro', async () => {
      const user = userEvent.setup()
      renderView()
      const dialog = await openFilterSheet(user)
      const grab = within(dialog).getByRole('button', { name: 'Fechar filtros' })
      // O foco inicial vai para o primeiro elemento da folha (depois de ~30ms).
      await waitFor(() => expect(grab).toHaveFocus())
      // O ultimo elemento da folha e' o "Exportar N processos" do rodape.
      const last = within(dialog).getByRole('button', { name: /^Exportar \d+ processos?/ })
      last.focus()
      await user.tab()
      expect(grab).toHaveFocus()
      await user.tab({ shift: true })
      expect(last).toHaveFocus()
    })

    it('Limpar volta o rascunho ao padrão e o botão "Ver N" acompanha', async () => {
      const user = userEvent.setup()
      renderView()
      const dialog = await openFilterSheet(user)
      const sheet = within(dialog)
      await user.click(sheet.getByRole('button', { name: 'Aéreo' }))
      expect(sheet.getByRole('button', { name: 'Aéreo' })).toHaveAttribute('aria-pressed', 'true')
      expect(sheet.getByRole('button', { name: 'Ver 1 processo' })).toBeInTheDocument()
      await user.click(sheet.getByRole('button', { name: 'Limpar' }))
      expect(sheet.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
      expect(sheet.getByRole('button', { name: 'Ver 3 processos' })).toBeInTheDocument()
    })

    it('"Ver N processos" bate com o filtro aplicado e o botão ganha o contador', async () => {
      const user = userEvent.setup()
      const { container } = renderView({ filteredProcesses: STAGED })
      const dialog = await openFilterSheet(user)
      await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
      const apply = within(dialog).getByRole('button', { name: 'Ver 1 processo' })
      await user.click(apply)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(cardsOf(container)).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Filtros (1)' })).toBeInTheDocument()
      expect(document.querySelector('.m-fbtn__n').textContent).toBe('1')
    })

    it('"Só favoritos" é um switch: filtra client-side e conta no botão', async () => {
      const user = userEvent.setup()
      const { container } = renderView({ filteredProcesses: STAGED, favoriteProcessIds: ['s-release'] })
      const dialog = await openFilterSheet(user)
      const toggle = within(dialog).getByRole('switch', { name: 'Só favoritos' })
      expect(toggle).toHaveAttribute('aria-checked', 'false')
      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-checked', 'true')
      await user.click(within(dialog).getByRole('button', { name: 'Ver 1 processo' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(cardsOf(container)).toHaveLength(1)
      expect(cardsOf(container)[0]).toHaveTextContent('AWB 12')
      expect(screen.getByRole('button', { name: 'Filtros (1)' })).toBeInTheDocument()
      // Reabrir mostra o switch ligado (o estado e' o aplicado).
      const reopened = await openFilterSheet(user)
      expect(within(reopened).getByRole('switch', { name: 'Só favoritos' })).toHaveAttribute('aria-checked', 'true')
    })

    it('aplicar repassa categoria, ETA e etapa operacional pelos handlers da página (só o que mudou)', async () => {
      const user = userEvent.setup()
      const handlers = {
        onCategoryFilterChange: vi.fn(),
        onEtaStartDateChange: vi.fn(),
        onEtaEndDateChange: vi.fn(),
        onOperationFilterChange: vi.fn(),
      }
      const applyListFilters = vi.fn(({ categoryFilter }) =>
        categoryFilter === 'FCL' ? STAGED.filter((item) => item.category === 'FCL' && item.id !== 's-done') : STAGED
      )
      renderView({ filteredProcesses: STAGED, applyListFilters, isAdmin: true, ...handlers })
      const dialog = await openFilterSheet(user)
      const sheet = within(dialog)
      await user.click(within(sheet.getByRole('group', { name: 'Categoria' })).getByRole('button', { name: 'FCL' }))
      // A contagem usa o rascunho (categoria FCL) via applyListFilters da pagina.
      expect(applyListFilters).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoryFilter: 'FCL', operationFilter: 'Todos', etaStartDate: '', etaEndDate: '' })
      )
      expect(sheet.getByRole('button', { name: 'Ver 2 processos' })).toBeInTheDocument()
      await user.click(
        within(sheet.getByRole('group', { name: 'Etapa operacional' })).getByRole('button', { name: 'Dados pendentes' })
      )
      fireEvent.change(sheet.getByLabelText('ETA de'), { target: { value: '2026-08-01' } })
      await user.click(sheet.getByRole('button', { name: /^Ver \d+ processos?$/ }))
      expect(handlers.onCategoryFilterChange).toHaveBeenCalledWith('FCL')
      expect(handlers.onOperationFilterChange).toHaveBeenCalledWith('Dados pendentes')
      expect(handlers.onEtaStartDateChange).toHaveBeenCalledWith('2026-08-01')
      expect(handlers.onEtaEndDateChange).not.toHaveBeenCalled()
    })

    it('"Dados pendentes" só aparece na etapa operacional para admin', async () => {
      const user = userEvent.setup()
      renderView({ isAdmin: false })
      const dialog = await openFilterSheet(user)
      expect(within(dialog).queryByRole('button', { name: 'Dados pendentes' })).not.toBeInTheDocument()
    })
  })

  it('com movimento reduzido a folha entra sem esperar o timer de saída (desmonta na hora)', async () => {
    const user = userEvent.setup()
    renderView()
    await openFilterSheet(user)
    await user.keyboard('{Escape}')
    // stubMatchMedia(true) tambem liga prefers-reduced-motion: sem os 500ms de saida.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// F4 ajustes aprovados: Exportar na folha, Arquivadas sem filtros inaplicaveis,
// nome acessivel da estrela e custo do total do hero.
// ---------------------------------------------------------------------------
const titlesOf = (container) => cardsOf(container).map((card) => card.querySelector('.m-pc__title').textContent)
const closeSheetWithEsc = async (user) => {
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('ProcessListView — "Exportar" no rodapé da folha de filtros (mobile, F4)', () => {
  beforeEach(() => stubMatchMedia(true))

  it('sai da página (nada de "Exportar" depois da lista) e vive só dentro da folha', async () => {
    const user = userEvent.setup()
    renderView({ filteredProcesses: STAGED })
    expect(screen.queryByRole('button', { name: /Exportar/ })).not.toBeInTheDocument()
    const dialog = await openFilterSheet(user)
    expect(within(dialog).getByRole('button', { name: /^Exportar 4 processos/ })).toHaveTextContent('Exportar 4 processos')
  })

  it('o N muda com chip de etapa, Modal e Só favoritos e sempre bate com a lista renderizada', async () => {
    const user = userEvent.setup()
    const { container } = renderView({ filteredProcesses: STAGED, favoriteProcessIds: ['s-transit', 's-release'] })
    const exportN = async () => {
      const dialog = await openFilterSheet(user)
      const button = within(dialog).getByRole('button', { name: /^Exportar \d+ processos?/ })
      return { dialog, n: Number(/Exportar (\d+)/.exec(button.textContent)[1]) }
    }

    let state = await exportN()
    expect(state.n).toBe(4)
    expect(state.n).toBe(cardsOf(container).length)
    await closeSheetWithEsc(user)

    // chip de etapa (fora da folha)
    await user.click(screen.getByRole('button', { name: 'Em trânsito (1)' }))
    state = await exportN()
    expect(state.n).toBe(1)
    expect(state.n).toBe(cardsOf(container).length)
    await closeSheetWithEsc(user)

    // Modal aplicado pela folha
    await user.click(screen.getByRole('button', { name: 'Todas (4)' }))
    let dialog = await openFilterSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
    await user.click(within(dialog).getByRole('button', { name: /^Ver \d+ processos?$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    state = await exportN()
    expect(state.n).toBe(1)
    expect(state.n).toBe(cardsOf(container).length)

    // Só favoritos (2 favoritos: um marítimo e um aéreo) sem Modal
    await user.click(within(state.dialog).getByRole('button', { name: 'Todos' }))
    await user.click(within(state.dialog).getByRole('switch', { name: 'Só favoritos' }))
    await user.click(within(state.dialog).getByRole('button', { name: /^Ver \d+ processos?$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    state = await exportN()
    expect(state.n).toBe(2)
    expect(state.n).toBe(cardsOf(container).length)
    dialog = state.dialog
    expect(within(dialog).getByRole('button', { name: /^Exportar 2 processos/ })).toBeInTheDocument()
  })

  it('título e nome acessível dizem que é a lista visível (busca e filtros aplicados) e avisam do rascunho', async () => {
    const user = userEvent.setup()
    renderView({ filteredProcesses: STAGED })
    const dialog = await openFilterSheet(user)
    const button = within(dialog).getByRole('button', { name: /^Exportar 4 processos/ })
    const expected = 'Exportar 4 processos: baixar em Excel a lista visível (busca e filtros aplicados)'
    expect(button).toHaveAttribute('aria-label', expected)
    expect(button).toHaveAttribute('title', expected)
    // Rascunho diferente do aplicado: o export segue na lista visivel e diz isso.
    await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
    expect(within(dialog).getByRole('button', { name: /^Exportar 4 processos/ })).toHaveAttribute(
      'title',
      `${expected}. Filtros ainda não aplicados não entram`
    )
  })

  it('F7: o aviso de rascunho não aplicado é texto visível (toque não tem hover), só com rascunho diferente do aplicado', async () => {
    const user = userEvent.setup()
    renderView({ filteredProcesses: STAGED })
    const dialog = await openFilterSheet(user)
    const note = /Exporta a lista atual; filtros ainda não aplicados não entram./
    expect(within(dialog).queryByText(note)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
    expect(within(dialog).getByText(note)).toBeVisible()
    // Voltar ao que está aplicado apaga o aviso.
    await user.click(within(dialog).getByRole('button', { name: 'Todos' }))
    expect(within(dialog).queryByText(note)).not.toBeInTheDocument()
  })

  it('o clique exporta exatamente as linhas visíveis (e não o evento nem a lista crua da página)', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    const { container } = renderView({ filteredProcesses: STAGED, onExport })
    await user.click(screen.getByRole('button', { name: 'Atracação (1)' }))
    const dialog = await openFilterSheet(user)
    await user.click(within(dialog).getByRole('button', { name: /^Exportar 1 processo/ }))
    // F7: a folha fecha primeiro e so' entao a exportacao dispara.
    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1))
    const [rows] = onExport.mock.calls[0]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.map((row) => row.id)).toEqual(['s-berth'])
    expect(titlesOf(container)).toEqual(['PO: PO 11'])
  })

  // F7: a folha fecha ANTES de a exportacao disparar (o toast de resultado nao cobre Limpar/Ver N).
  // Com movimento normal a folha sai em 500ms (aria-hidden na saida); com movimento reduzido
  // sai na hora. Nos dois casos a exportacao so' roda com a folha ja' desmontada.
  describe.each([
    ['movimento normal', false],
    ['movimento reduzido', true],
  ])('F7: Exportar com a folha aberta (%s)', (_label, reduced) => {
    beforeEach(() => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: /prefers-reduced-motion/.test(query) ? reduced : true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    })

    it('fecha a folha e so entao dispara a exportacao, uma unica vez', async () => {
      const user = userEvent.setup()
      let dialogOpenAtExport = null
      const onExport = vi.fn(() => {
        dialogOpenAtExport = screen.queryByRole('dialog') !== null
      })
      renderView({ filteredProcesses: STAGED, onExport })
      const dialog = await openFilterSheet(user)
      const exportButton = within(dialog).getByRole('button', { name: /^Exportar 4 processos/ })
      await user.click(exportButton)
      if (!reduced) {
        // A folha ja' esta saindo, mas a exportacao ainda nao rodou.
        expect(dialog).toHaveAttribute('aria-hidden', 'true')
        expect(onExport).not.toHaveBeenCalled()
        // Segundo clique durante a saida nao exporta de novo.
        await user.click(exportButton)
      }
      await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1))
      expect(dialogOpenAtExport).toBe(false)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onExport).toHaveBeenCalledTimes(1)
    })
  })

  it('F7: rodapé fixo: Limpar, Ver N e Exportar (com o aviso) ficam no rodapé; os filtros ficam no corpo que rola', async () => {
    const user = userEvent.setup()
    renderView({ filteredProcesses: STAGED })
    const dialog = await openFilterSheet(user)
    const body = dialog.querySelector('.m-bsheet__body')
    const foot = dialog.querySelector('.m-bsheet__foot')
    expect(body).not.toBeNull()
    expect(foot).not.toBeNull()
    expect(dialog.lastElementChild).toBe(foot)
    expect(body.nextElementSibling).toBe(foot)

    const inFoot = within(foot)
    expect(inFoot.getByRole('button', { name: 'Limpar' })).toBeInTheDocument()
    expect(inFoot.getByRole('button', { name: /^Ver \d+ processos?$/ })).toBeInTheDocument()
    expect(inFoot.getByRole('button', { name: /^Exportar 4 processos/ })).toBeInTheDocument()
    // Ordem dos botoes do rodape: Limpar, Ver N, Exportar.
    const labels = [...foot.querySelectorAll('button')].map((button) => button.textContent.trim())
    expect(labels).toEqual(['Limpar', 'Ver 4 processos', 'Exportar 4 processos'])

    // Corpo: os controles de filtro (mesma ordem e rotulos de antes), sem as acoes.
    const inBody = within(body)
    const groupNames = inBody.getAllByRole('group').map((group) => group.getAttribute('aria-labelledby'))
    expect(groupNames.map((id) => document.getElementById(id).textContent)).toEqual([
      'Categoria',
      'Modal',
      'Faixa de ETA',
      'Etapa operacional',
    ])
    expect(inBody.getByRole('switch', { name: 'Só favoritos' })).toBeInTheDocument()
    expect(inBody.queryByRole('button', { name: 'Limpar' })).not.toBeInTheDocument()
    expect(inBody.queryByRole('button', { name: /^Exportar/ })).not.toBeInTheDocument()
    expect(inBody.queryByRole('button', { name: /^Ver \d+/ })).not.toBeInTheDocument()

    // O aviso do rascunho mora no rodape (junto do Exportar).
    await user.click(inBody.getByRole('button', { name: 'Aéreo' }))
    expect(inFoot.getByText(/Exporta a lista atual; filtros ainda não aplicados não entram./)).toBeVisible()
    expect(inBody.queryByText(/Exporta a lista atual/)).not.toBeInTheDocument()
  })

  it('desabilitado sem linhas e durante a exportação; sem onExport o botão não existe', async () => {
    const user = userEvent.setup()
    const { unmount } = renderView({ filteredProcesses: [] })
    let dialog = await openFilterSheet(user)
    expect(within(dialog).getByRole('button', { name: /^Exportar 0 processos/ })).toBeDisabled()
    unmount()

    const { unmount: unmountBusy } = renderView({ filteredProcesses: STAGED, isExporting: true })
    dialog = await openFilterSheet(user)
    expect(within(dialog).getByRole('button', { name: /^Exportar 4 processos/ })).toBeDisabled()
    unmountBusy()

    renderView({ filteredProcesses: STAGED, onExport: undefined })
    dialog = await openFilterSheet(user)
    expect(within(dialog).queryByRole('button', { name: /Exportar/ })).not.toBeInTheDocument()
  })

  it('"Importar do DBCorp" (admin) continua na página no mobile', () => {
    renderView({ filteredProcesses: STAGED, isAdmin: true, onReconcileErp: vi.fn() })
    expect(screen.getByRole('button', { name: 'Importar do DBCorp' })).toBeInTheDocument()
  })

  it('tablet: "Exportar (N)" segue na barra da página com o texto e o title de sempre', () => {
    stubMatchMedia(false)
    renderView({ filteredProcesses: STAGED })
    const button = screen.getByRole('button', { name: /Exportar \(4\)/ })
    expect(button).toHaveAttribute('title', 'Baixar as linhas visíveis (filtros aplicados) em Excel')
  })
})

describe('ProcessListView — aba Arquivadas sem filtros inaplicáveis (mobile, F4)', () => {
  beforeEach(() => stubMatchMedia(true))

  const adminProps = (extra = {}) => ({
    isAdmin: true,
    onArchiveProcess: vi.fn(),
    filteredProcesses: STAGED.slice(0, 3),
    archivedProcesses: [STAGED[3], { ...STAGED[0], id: 'arch-air', category: 'AEREO', processNumber: 'AWB 99' }],
    ...extra,
  })

  it('a folha mostra só Modal e "Só favoritos"; em Ativas continua com todos os grupos', async () => {
    const user = userEvent.setup()
    renderView(adminProps())
    let dialog = await openFilterSheet(user)
    for (const name of ['Categoria', 'Modal', 'Faixa de ETA', 'Etapa operacional']) {
      expect(within(dialog).getByRole('group', { name })).toBeInTheDocument()
    }
    await closeSheetWithEsc(user)

    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    dialog = await openFilterSheet(user)
    expect(within(dialog).getByRole('group', { name: 'Modal' })).toBeInTheDocument()
    expect(within(dialog).getByRole('switch', { name: 'Só favoritos' })).toBeInTheDocument()
    for (const name of ['Categoria', 'Faixa de ETA', 'Etapa operacional']) {
      expect(within(dialog).queryByRole('group', { name })).not.toBeInTheDocument()
    }
    expect(within(dialog).queryByLabelText('ETA de')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('ETA até')).not.toBeInTheDocument()
  })

  it('o contador do botão ignora categoria/ETA/etapa em Arquivadas e volta a contar em Ativas', async () => {
    const user = userEvent.setup()
    renderView(
      adminProps({ categoryFilter: 'FCL', operationFilter: 'DUIMP pendente', etaStartDate: '2026-08-01', hasActiveFilters: true })
    )
    expect(screen.getByRole('button', { name: 'Filtros (3)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument()
    expect(document.querySelector('.m-fbtn__n')).toBeNull()

    const dialog = await openFilterSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
    await user.click(within(dialog).getByRole('button', { name: /^Ver \d+ processos?$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filtros (1)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ativas' }))
    expect(screen.getByRole('button', { name: 'Filtros (4)' })).toBeInTheDocument()
  })

  it('a busca fica desabilitada com "Buscar nas ativas" e não mostra o termo das ativas; volta em Ativas', async () => {
    const user = userEvent.setup()
    renderView(adminProps({ searchTerm: 'soda', hasActiveFilters: true }))
    const active = screen.getByRole('searchbox', { name: 'Buscar processo' })
    expect(active).toBeEnabled()
    expect(active).toHaveValue('soda')
    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    const archived = screen.getByRole('searchbox', { name: 'Buscar processo' })
    expect(archived).toBeDisabled()
    expect(archived).toHaveAttribute('placeholder', 'Buscar nas ativas')
    expect(archived).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Ativas' }))
    const back = screen.getByRole('searchbox', { name: 'Buscar processo' })
    expect(back).toBeEnabled()
    expect(back).toHaveValue('soda')
    expect(back).toHaveAttribute('placeholder', 'Processo, PO, produto ou contêiner')
  })

  it('o segmented continua visível com 0 arquivadas e o estado vazio diz "Nenhum processo arquivado."', async () => {
    const user = userEvent.setup()
    renderView(adminProps({ archivedProcesses: [], categoryFilter: 'FCL', hasActiveFilters: true }))
    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    expect(screen.getByRole('button', { name: 'Arquivadas' })).toHaveAttribute('aria-pressed', 'true')
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Nenhum processo arquivado.')
    // Filtros das ativas (categoria) nao contam aqui: nada de "Limpar filtros".
    expect(within(status).queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  })

  it('o N de "Ver" e o do "Exportar" seguem a lista arquivada (Modal) e exportam essas linhas', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    const { container } = renderView(adminProps({ onExport }))
    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    const dialog = await openFilterSheet(user)
    expect(within(dialog).getByRole('button', { name: 'Ver 2 processos' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Ver 1 processo' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cardsOf(container)).toHaveLength(1)
    const reopened = await openFilterSheet(user)
    await user.click(within(reopened).getByRole('button', { name: /^Exportar 1 processo/ }))
    expect(onExport.mock.calls[0][0].map((row) => row.id)).toEqual(['arch-air'])
  })

  it('"Limpar" na folha de Arquivadas não zera (ao aplicar) os filtros das ativas', async () => {
    const user = userEvent.setup()
    const handlers = {
      onCategoryFilterChange: vi.fn(),
      onEtaStartDateChange: vi.fn(),
      onEtaEndDateChange: vi.fn(),
      onOperationFilterChange: vi.fn(),
    }
    renderView(
      adminProps({ categoryFilter: 'FCL', operationFilter: 'Coleta pendente', etaStartDate: '2026-08-01', ...handlers })
    )
    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    const dialog = await openFilterSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Aéreo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Limpar' }))
    expect(within(dialog).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: /^Ver \d+ processos?$/ }))
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
  })

  it('"Limpar filtros" do estado vazio em Arquivadas limpa só chip/Modal/favoritos e fica na aba', async () => {
    const user = userEvent.setup()
    const onClearAllFilters = vi.fn()
    renderView(adminProps({ onClearAllFilters, archivedProcesses: [STAGED[3]] }))
    await user.click(screen.getByRole('button', { name: 'Arquivadas' }))
    await user.click(screen.getByRole('button', { name: 'Liberação (0)' }))
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Nenhum processo arquivado corresponde aos filtros atuais.')
    await user.click(within(status).getByRole('button', { name: 'Limpar filtros' }))
    expect(onClearAllFilters).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Arquivadas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Todas (1)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('ProcessListView — estrela do cartão e total do hero (mobile, F4)', () => {
  beforeEach(() => stubMatchMedia(true))

  it('o nome acessível da estrela leva o título do cartão e alterna Favoritar/Desfavoritar', () => {
    const { container } = renderView({
      filteredProcesses: [STAGED[0], STAGED[1]],
      canSeeName: true,
      onToggleFavorite: vi.fn(),
      favoriteProcessIds: ['s-berth'],
    })
    expect(titlesOf(container)).toEqual(['Resina A', 'Solvente B'])
    expect(screen.getByRole('button', { name: 'Favoritar Resina A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desfavoritar Solvente B' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Des)?favoritar processo$/i })).not.toBeInTheDocument()
  })

  it('digitar na busca (novo filteredProcesses) não refaz o filtro+sort do total do hero', () => {
    const applyListFilters = vi.fn(() => STAGED)
    const base = {
      isLoading: false,
      selectedProcessId: null,
      isAdmin: false,
      searchTerm: '',
      categoryFilter: 'Todos',
      etaStartDate: '',
      etaEndDate: '',
      operationFilter: 'Todos',
      hasActiveFilters: false,
      processCategoryOptions: ['FCL'],
      onSearchTermChange: vi.fn(),
      onCategoryFilterChange: vi.fn(),
      onEtaStartDateChange: vi.fn(),
      onEtaEndDateChange: vi.fn(),
      onOperationFilterChange: vi.fn(),
      onClearAllFilters: vi.fn(),
      onSelectProcess: vi.fn(),
      onExport: vi.fn(),
      applyListFilters,
    }
    const { rerender } = render(<ProcessListView {...base} filteredProcesses={STAGED} />)
    const callsAfterMount = applyListFilters.mock.calls.length
    expect(callsAfterMount).toBeGreaterThan(0)
    rerender(<ProcessListView {...base} searchTerm="a" filteredProcesses={[...STAGED.slice(0, 2)]} />)
    rerender(<ProcessListView {...base} searchTerm="ab" filteredProcesses={[...STAGED.slice(0, 1)]} />)
    expect(applyListFilters.mock.calls.length).toBe(callsAfterMount)
  })
})
