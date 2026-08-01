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
