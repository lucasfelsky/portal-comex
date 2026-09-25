// Tests do componente NotificationsList (Sprint 27).
// Cobre:
//   - Empty state quando grouped vazio
//   - Recentes: ate 8 grupos
//   - Anteriores: ate 4 inicialmente; botao "Ver mais" expande em 8
//   - onOpenNotification chamado ao clicar em item
//
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import NotificationsList from '../../src/components/NotificationsList.jsx'

const formatRelative = (v) => `rel(${v})`
const formatDate = (v) => `date(${v})`

function makeGroup({ processId, type, title, count, unreadCount, createdAt }) {
  return {
    processId,
    type,
    title,
    unreadCount,
    latestCreatedAt: createdAt,
    items: Array.from({ length: count }, (_, i) => ({
      id: `${processId}-${type}-${i}`,
      title: `${title} item ${i}`,
      body: `body ${i}`,
      createdAt,
      isRead: unreadCount === 0,
    })),
  }
}

describe('NotificationsList', () => {
  it('empty state quando grouped vazio', () => {
    render(
      <NotificationsList
        grouped={[]}
        onOpenNotification={() => {}}
        formatRelative={formatRelative}
        formatDate={formatDate}
      />
    )
    expect(screen.getByText(/Nenhuma notificação/i)).toBeInTheDocument()
  })

  it('render: recentes + anteriores', () => {
    const grouped = [
      makeGroup({ processId: 'p1', type: 't1', title: 'Recente 1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
      makeGroup({ processId: 'p2', type: 't1', title: 'Antigo 1', count: 1, unreadCount: 0, createdAt: '2025-01-01T00:00:00Z' }),
    ]
    render(
      <NotificationsList
        grouped={grouped}
        onOpenNotification={() => {}}
        formatRelative={formatRelative}
        formatDate={formatDate}
      />
    )
    expect(screen.getByText('Recentes')).toBeInTheDocument()
    expect(screen.getByText('Anteriores')).toBeInTheDocument()
    expect(screen.getByText('Recente 1')).toBeInTheDocument()
    expect(screen.getByText('Antigo 1')).toBeInTheDocument()
  })

  it('recentes: limita a 8 grupos', () => {
    const grouped = Array.from({ length: 12 }, (_, i) =>
      makeGroup({ processId: `p${i}`, type: 't1', title: `R${i}`, count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' })
    )
    render(
      <NotificationsList
        grouped={grouped}
        onOpenNotification={() => {}}
        formatRelative={formatRelative}
        formatDate={formatDate}
      />
    )
    // Apenas R0..R7 visiveis
    expect(screen.getByText('R0')).toBeInTheDocument()
    expect(screen.getByText('R7')).toBeInTheDocument()
    expect(screen.queryByText('R8')).toBeNull()
  })

  it('anteriores: botao "Ver mais" expande em 8', async () => {
    const user = userEvent.setup()
    const grouped = Array.from({ length: 12 }, (_, i) =>
      makeGroup({ processId: `p${i}`, type: 't1', title: `A${i}`, count: 1, unreadCount: 0, createdAt: '2025-01-01T00:00:00Z' })
    )
    render(
      <NotificationsList
        grouped={grouped}
        onOpenNotification={() => {}}
        formatRelative={formatRelative}
        formatDate={formatDate}
      />
    )
    // Inicialmente 4 visiveis
    expect(screen.getByText('A0')).toBeInTheDocument()
    expect(screen.getByText('A3')).toBeInTheDocument()
    expect(screen.queryByText('A4')).toBeNull()
    // Botao visivel
    const showMore = screen.getByRole('button', { name: /Ver mais/i })
    expect(showMore).toBeInTheDocument()
    // Clica
    await user.click(showMore)
    // Agora 12 (4+8) visiveis
    expect(screen.getByText('A4')).toBeInTheDocument()
    expect(screen.getByText('A11')).toBeInTheDocument()
    // Sem mais botao
    expect(screen.queryByRole('button', { name: /Ver mais/i })).toBeNull()
  })

  it('sem botao "Ver mais" se older <= 4', () => {
    const grouped = Array.from({ length: 3 }, (_, i) =>
      makeGroup({ processId: `p${i}`, type: 't1', title: `A${i}`, count: 1, unreadCount: 0, createdAt: '2025-01-01T00:00:00Z' })
    )
    render(
      <NotificationsList
        grouped={grouped}
        onOpenNotification={() => {}}
        formatRelative={formatRelative}
        formatDate={formatDate}
      />
    )
    expect(screen.queryByRole('button', { name: /Ver mais/i })).toBeNull()
  })

  it('onOpenNotification chamado ao clicar em item recente', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    const grouped = [
      makeGroup({ processId: 'p1', type: 't1', title: 'R1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
    ]
    render(
      <NotificationsList
        grouped={grouped}
        onOpenNotification={onOpen}
        formatRelative={formatRelative}
        formatDate={formatDate}
      />
    )
    const item = screen.getByRole('button', { name: /R1 item 0/i })
    await user.click(item)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1-t1-0' }))
  })

  describe('swipe-to-marcar-como-lida (F16.8)', () => {
    it('sem onMarkAsRead, nenhuma ação de swipe é renderizada', () => {
      const grouped = [
        makeGroup({ processId: 'p1', type: 't1', title: 'R1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
      ]
      const { container } = render(
        <NotificationsList
          grouped={grouped}
          onOpenNotification={() => {}}
          formatRelative={formatRelative}
          formatDate={formatDate}
        />
      )
      expect(container.querySelectorAll('.notifications-swipe-row__action')).toHaveLength(0)
    })

    it('clicar na ação chama onMarkAsRead com a notificação', async () => {
      const onMarkAsRead = vi.fn()
      const user = userEvent.setup()
      const grouped = [
        makeGroup({ processId: 'p1', type: 't1', title: 'R1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
      ]
      const { container } = render(
        <NotificationsList
          grouped={grouped}
          onOpenNotification={() => {}}
          onMarkAsRead={onMarkAsRead}
          formatRelative={formatRelative}
          formatDate={formatDate}
        />
      )
      const action = container.querySelector('.notifications-swipe-row__action')
      expect(action).not.toBeNull()
      await user.click(action)
      expect(onMarkAsRead).toHaveBeenCalledTimes(1)
      expect(onMarkAsRead).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1-t1-0' }))
    })

    it('marcar como lida via swipe NÃO chama onOpenNotification (não navega/fecha o painel)', async () => {
      const onOpen = vi.fn()
      const onMarkAsRead = vi.fn()
      const user = userEvent.setup()
      const grouped = [
        makeGroup({ processId: 'p1', type: 't1', title: 'R1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
      ]
      const { container } = render(
        <NotificationsList
          grouped={grouped}
          onOpenNotification={onOpen}
          onMarkAsRead={onMarkAsRead}
          formatRelative={formatRelative}
          formatDate={formatDate}
        />
      )
      await user.click(container.querySelector('.notifications-swipe-row__action'))
      expect(onMarkAsRead).toHaveBeenCalledTimes(1)
      expect(onOpen).not.toHaveBeenCalled()
    })
  })

  // UX-2: estado de erro/loading + notificacoes navegaveis por teclado.
  describe('UX-2: estados e acessibilidade por teclado', () => {
    it('loadError + grouped vazio: alerta, sem "Nenhuma notificação", retry chama onRetry', async () => {
      const onRetry = vi.fn()
      const user = userEvent.setup()
      render(
        <NotificationsList
          grouped={[]}
          onOpenNotification={() => {}}
          formatRelative={formatRelative}
          formatDate={formatDate}
          loadError="Não foi possível carregar as notificações."
          onRetry={onRetry}
        />
      )
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/Não foi possível carregar as notificações/i)
      expect(screen.queryByText(/Nenhuma notificação/i)).toBeNull()
      await user.click(screen.getByRole('button', { name: /Tentar novamente/i }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('loadError + grupos: banner E itens presentes', () => {
      const grouped = [
        makeGroup({ processId: 'p1', type: 't1', title: 'Recente 1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
      ]
      render(
        <NotificationsList
          grouped={grouped}
          onOpenNotification={() => {}}
          formatRelative={formatRelative}
          formatDate={formatDate}
          loadError="Não foi possível carregar as notificações."
        />
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Recente 1')).toBeInTheDocument()
    })

    it('isLoading + grouped vazio: sem "Nenhuma notificação", com skeleton', () => {
      const { container } = render(
        <NotificationsList
          grouped={[]}
          onOpenNotification={() => {}}
          formatRelative={formatRelative}
          formatDate={formatDate}
          isLoading
        />
      )
      expect(screen.queryByText(/Nenhuma notificação/i)).toBeNull()
      expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    })

    it('vazio real (sem loading/erro): "Nenhuma notificação"', () => {
      render(
        <NotificationsList
          grouped={[]}
          onOpenNotification={() => {}}
          formatRelative={formatRelative}
          formatDate={formatDate}
        />
      )
      expect(screen.getByText(/Nenhuma notificação/i)).toBeInTheDocument()
    })

    it('item recente e focavel por teclado e Enter/Espaço chamam onOpenNotification', async () => {
      const onOpen = vi.fn()
      const user = userEvent.setup()
      const grouped = [
        makeGroup({ processId: 'p1', type: 't1', title: 'R1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
      ]
      render(
        <NotificationsList
          grouped={grouped}
          onOpenNotification={onOpen}
          formatRelative={formatRelative}
          formatDate={formatDate}
        />
      )
      await user.tab()
      const item = screen.getByRole('button', { name: /Não lida.*R1 item 0/is })
      expect(item).toHaveFocus()
      expect(item.getAttribute('aria-label')).toContain('Não lida')
      expect(item.getAttribute('aria-label')).toContain('R1 item 0')

      await user.keyboard('{Enter}')
      expect(onOpen).toHaveBeenCalledTimes(1)

      await user.keyboard(' ')
      expect(onOpen).toHaveBeenCalledTimes(2)
    })

    it('Anteriores: acordeao abre com toggle por teclado e Enter no item chama onOpenNotification', async () => {
      const onOpen = vi.fn()
      const user = userEvent.setup()
      const grouped = [
        makeGroup({ processId: 'p1', type: 't1', title: 'Antigo 1', count: 1, unreadCount: 0, createdAt: '2025-01-01T00:00:00Z' }),
      ]
      render(
        <NotificationsList
          grouped={grouped}
          onOpenNotification={onOpen}
          formatRelative={formatRelative}
          formatDate={formatDate}
        />
      )
      const toggle = screen.getByRole('button', { name: /Antigo 1/i })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')

      await user.tab()
      expect(toggle).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(toggle).toHaveAttribute('aria-expanded', 'true')

      const item = screen.getByRole('button', { name: /Antigo 1 item 0/i })
      expect(item).toBeInTheDocument()
      await user.tab()
      expect(item).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(onOpen).toHaveBeenCalledTimes(1)
      expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1-t1-0' }))
    })

    it('Desktop: botão "Marcar como lida" existe pra não lida e não pra lida; Enter chama onMarkAsRead sem abrir', async () => {
      const onMarkAsRead = vi.fn()
      const onOpen = vi.fn()
      const user = userEvent.setup()
      const grouped = [
        makeGroup({ processId: 'p1', type: 't1', title: 'R1', count: 1, unreadCount: 1, createdAt: '2026-01-01T00:00:00Z' }),
      ]
      render(
        <NotificationsList
          grouped={grouped}
          onOpenNotification={onOpen}
          onMarkAsRead={onMarkAsRead}
          formatRelative={formatRelative}
          formatDate={formatDate}
        />
      )
      const markButton = screen.getByRole('button', { name: /Marcar como lida: R1 item 0/i })
      expect(markButton).toBeInTheDocument()

      await user.tab()
      await user.tab()
      expect(markButton).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(onMarkAsRead).toHaveBeenCalledTimes(1)
      expect(onOpen).not.toHaveBeenCalled()
    })
  })
})
