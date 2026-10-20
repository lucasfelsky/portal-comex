// Refino F5a: arvore DESKTOP da Central de notificacoes (Notificacoes.dc.html) e do
// modal de Preferencias (Preferencias.dc.html). O desktop e escolhido por
// matchMedia('(min-width: 1041px)'); a arvore legada (tablet/mobile) segue coberta por
// tests/ui/NotificationsList.test.jsx, tests/ui/NotificationPreferencesModal.test.jsx e
// tests/ui/AppLayout.test.jsx (matchMedia falso = legado). Fica em tests/unit para nao
// entrar na contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'

const mockSavePreferences = vi.fn()
vi.mock('../../src/services/usersRepository', () => ({
  saveNotificationPreferences: (...args) => mockSavePreferences(...args),
}))

import { NotificationsContext } from '../../src/contexts/NotificationsContext'
import NotificationsPage from '../../src/pages/NotificationsPage'
import NotificationPreferencesModal from '../../src/components/NotificationPreferencesModal'
import { ToastProvider } from '../../src/components/Toast'

// --- matchMedia controlavel -------------------------------------------------
function installMatchMedia(initialDesktop = true) {
  let desktop = initialDesktop
  const listeners = new Set()
  window.matchMedia = vi.fn((query) => {
    const isDesktopQuery = query.includes('min-width: 1041px')
    return {
      get matches() {
        return isDesktopQuery ? desktop : false
      },
      media: query,
      onchange: null,
      addEventListener: (type, fn) => {
        if (type === 'change' && isDesktopQuery) listeners.add(fn)
      },
      removeEventListener: (type, fn) => {
        if (type === 'change' && isDesktopQuery) listeners.delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
  return {
    listeners,
    setDesktop(value) {
      desktop = value
      act(() => {
        listeners.forEach((fn) => fn({ matches: value }))
      })
    },
  }
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia
let media

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

function notification(id, overrides = {}) {
  return {
    id,
    type: 'process_question_answered',
    processId: `p-${id}`,
    title: `Titulo ${id}`,
    body: `Corpo ${id}`,
    isRead: false,
    createdAt: minutesAgo(8),
    ...overrides,
  }
}

// mesmo agrupamento do NotificationsContext (processo + tipo, mais recente primeiro)
function group(notifications) {
  const groups = new Map()
  notifications.forEach((item) => {
    const key = `${item.processId}:${item.type}`
    const current = groups.get(key) ?? {
      processId: item.processId,
      type: item.type,
      title: item.title,
      items: [],
      unreadCount: 0,
      latestCreatedAt: item.createdAt,
    }
    current.items.push(item)
    current.unreadCount += item.isRead ? 0 : 1
    groups.set(key, current)
  })
  return [...groups.values()].sort(
    (left, right) => new Date(right.latestCreatedAt).getTime() - new Date(left.latestCreatedAt).getTime()
  )
}

const formatRelative = (value) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 60) return `há ${minutes} min`
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`
  return `há ${Math.round(minutes / 60 / 24)} d`
}

const SEED = [
  notification('a1', { type: 'process_question_answered', title: 'Nova resposta', body: 'Fulano respondeu.' }),
  notification('a2', { type: 'process_question_answered', processId: 'p-a1', title: 'Nova resposta', body: 'Beltrano respondeu.', createdAt: minutesAgo(40) }),
  notification('b1', { type: 'collection_status_updated', title: 'Coleta agendada', body: 'Janela 24/10.', createdAt: minutesAgo(120) }),
  notification('c1', { type: 'receipt_divergence_reported', title: 'Divergência', body: 'Quantidade menor.', createdAt: minutesAgo(60 * 26) }),
  notification('d1', { type: 'process_document_uploaded', title: 'Documento anexado', body: 'Packing List.', isRead: true, createdAt: minutesAgo(60 * 5) }),
  notification('d2', { type: 'process_document_uploaded', processId: 'p-d1', title: 'Documento anexado', body: 'Invoice.', isRead: true, createdAt: minutesAgo(60 * 6) }),
]

function makeDnd(overrides = {}) {
  return { isActive: false, remainingMs: 0, enableFor: vi.fn(), disable: vi.fn(), ...overrides }
}

function Harness({ initial = SEED, dnd = makeDnd(), isLoading = false, loadError = null, spies = {} }) {
  const [notifications, setNotifications] = useState(initial)
  const [filter, setFilter] = useState('all')
  const [prefsOpen, setPrefsOpen] = useState(false)
  const unread = notifications.filter((item) => !item.isRead)
  const filtered = filter === 'all' ? notifications : notifications.filter((item) => item.type === filter)
  const value = {
    notifications,
    unreadNotifications: unread,
    groupedNotifications: group(filtered),
    notificationFilter: filter,
    setNotificationFilter: setFilter,
    markAllAsRead: () => {
      spies.markAll?.()
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
    },
    markOneAsRead: (item) => {
      spies.markOne?.(item)
      setNotifications((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)))
    },
    handleOpenNotification: (item) => spies.open?.(item),
    formatRelativeNotificationTime: formatRelative,
    formatNotificationDate: () => '20/10 09:00',
    dnd,
    isPrefsModalOpen: prefsOpen,
    setIsPrefsModalOpen: (open) => {
      spies.setPrefs?.(open)
      setPrefsOpen(open)
    },
    isLoadingNotifications: isLoading,
    notificationsLoadError: loadError,
    reloadNotifications: spies.reload ?? (() => {}),
  }
  return (
    <NotificationsContext.Provider value={value}>
      <NotificationsPage />
    </NotificationsContext.Provider>
  )
}

beforeEach(() => {
  media = installMatchMedia(true)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('F5a Notificacoes - troca de arvore por matchMedia', () => {
  it('desktop renderiza a arvore nt-* sob .notifications-page e nao a legada', () => {
    const { container } = render(<Harness />)
    expect(container.querySelector('section.surface.notifications-page.notifications-page--desktop')).not.toBeNull()
    expect(container.querySelector('.nt-head')).not.toBeNull()
    expect(container.querySelector('.section-heading')).toBeNull()
    expect(container.querySelector('.notifications__group')).toBeNull()
    expect(container.querySelector('.tab-row')).toBeNull()
  })

  it('tablet/mobile (sem desktop) seguem na arvore legada', () => {
    media.setDesktop(false)
    const { container } = render(<Harness />)
    expect(container.querySelector('.nt-head')).toBeNull()
    expect(container.querySelector('.notifications-page--desktop')).toBeNull()
    expect(container.querySelector('.section-heading')).not.toBeNull()
    expect(container.querySelector('.notifications__group')).not.toBeNull()
  })

  it('troca ao vivo nos dois sentidos, mantendo o filtro escolhido, e sem listener preso', async () => {
    const user = userEvent.setup()
    const { container, unmount } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: /^Coleta/ }))
    media.setDesktop(false)
    expect(container.querySelector('.nt-head')).toBeNull()
    expect(screen.getAllByText('Coleta agendada').length).toBeGreaterThan(0)
    expect(screen.queryByText('Nova resposta')).toBeNull()
    media.setDesktop(true)
    expect(container.querySelector('.nt-head')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^Coleta/ })).toHaveAttribute('aria-pressed', 'true')
    unmount()
    expect(media.listeners.size).toBe(0)
  })
})

describe('F5a Notificacoes - cabecalho', () => {
  it('eyebrow "N pendentes" (mono, maiusculo por CSS) e h2 "Central de notificações"', () => {
    render(<Harness />)
    expect(screen.getByText('4 pendentes')).toHaveClass('nt-head__eyebrow')
    expect(screen.getByRole('heading', { level: 2, name: 'Central de notificações' })).toHaveClass('nt-head__title')
  })

  it('silenciado: o eyebrow mostra o tempo restante e o botao de sino cortado fica ativo (aria-pressed)', () => {
    render(<Harness dnd={makeDnd({ isActive: true, remainingMs: 40 * 60 * 1000 })} />)
    expect(screen.getByText('4 pendentes · Silenciado (40min)')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Desativar modo não perturbe (restam 40min)' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('nt-icon-button--active')
    expect(button).toHaveAttribute('title', 'Silenciado por mais 40min')
  })

  it('"Silenciar por 1 hora": ativa por 1 h; com DND ligado desativa', async () => {
    const user = userEvent.setup()
    const dnd = makeDnd()
    const { unmount } = render(<Harness dnd={dnd} />)
    const button = screen.getByRole('button', { name: 'Ativar modo não perturbe por 1 hora' })
    expect(button).toHaveAttribute('title', 'Silenciar por 1 hora')
    expect(button).toHaveClass('nt-icon-button')
    await user.click(button)
    expect(dnd.enableFor).toHaveBeenCalledWith(60 * 60 * 1000)
    unmount()
    const active = makeDnd({ isActive: true, remainingMs: 60_000 })
    render(<Harness dnd={active} />)
    await user.click(screen.getByRole('button', { name: /Desativar modo não perturbe/ }))
    expect(active.disable).toHaveBeenCalledTimes(1)
  })

  it('"Marcar todas como lidas" (secundario) marca tudo e desabilita quando nao ha pendentes', async () => {
    const user = userEvent.setup()
    const markAll = vi.fn()
    render(<Harness spies={{ markAll }} />)
    const button = screen.getByRole('button', { name: 'Marcar todas como lidas' })
    expect(button).toHaveClass('secondary-button')
    await user.click(button)
    expect(markAll).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    expect(screen.getByText('0 pendentes')).toBeInTheDocument()
  })

  it('engrenagem de preferencias (icone sliders, 44) abre o modal', async () => {
    const user = userEvent.setup()
    const setPrefs = vi.fn()
    render(<Harness spies={{ setPrefs }} />)
    const gear = screen.getByRole('button', { name: 'Preferências de notificação' })
    expect(gear).toHaveClass('nt-icon-button')
    expect(gear.querySelector('svg')).not.toBeNull()
    await user.click(gear)
    expect(setPrefs).toHaveBeenCalledWith(true)
  })
})

describe('F5a Notificacoes - filtros (10 pilulas com contagem de nao lidas)', () => {
  it('as 10 categorias, na ordem do mock, "Todas" ativa e contagens por tipo (so quando > 0)', () => {
    const { container } = render(<Harness />)
    const pills = [...container.querySelectorAll('.nt-filters .filter-pill')]
    expect(pills.map((pill) => pill.querySelector('.filter-pill__label').textContent)).toEqual([
      'Todas', 'Dúvidas', 'Respostas', 'Favoritos', 'Pós-recebimento', 'Coleta', 'Divergências', 'Anuências', 'Alertas', 'Documentos',
    ])
    expect(pills[0]).toHaveClass('filter-pill--active')
    expect(pills[0]).toHaveAttribute('aria-pressed', 'true')
    const counts = Object.fromEntries(
      pills.map((pill) => [pill.querySelector('.filter-pill__label').textContent, pill.querySelector('.filter-pill__count')?.textContent ?? null])
    )
    expect(counts).toMatchObject({
      Todas: '4',
      Dúvidas: null,
      Respostas: '2',
      Coleta: '1',
      Divergências: '1',
      Documentos: null, // as 2 de documento estao lidas
    })
  })

  it('o nome acessivel diz quantas nao lidas ("Respostas (2 não lidas)")', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Respostas (2 não lidas)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coleta (1 não lida)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Favoritos' })).toBeInTheDocument()
  })

  it('clicar numa pilula filtra a lista pelo tipo e marca a pilula ativa; "Todas" volta', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /^Respostas/ }))
    expect(screen.getByRole('button', { name: /^Respostas/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Todas/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('Coleta agendada')).toBeNull()
    expect(screen.getAllByText('Nova resposta').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /^Todas/ }))
    expect(screen.getAllByText('Coleta agendada').length).toBeGreaterThan(0)
  })

  it('filtro sem itens: estado vazio', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Favoritos' }))
    expect(screen.getByText('Nenhuma notificação')).toBeInTheDocument()
    expect(container.querySelector('.notifications-page--desktop .empty-state')).not.toBeNull()
  })
})

describe('F5a Notificacoes - Recentes (cartao por grupo)', () => {
  it('"Recentes" com um cartao por grupo: titulo + "N notificações • N não lidas"', () => {
    const { container } = render(<Harness />)
    expect(screen.getByRole('heading', { level: 2, name: 'Recentes' })).toHaveClass('nt-section__title')
    const groups = [...container.querySelectorAll('.nt-group')]
    expect(groups).toHaveLength(3)
    const respostas = groups.find((card) => card.querySelector('.nt-group__title').textContent === 'Nova resposta')
    expect(respostas.querySelector('.nt-group__meta')).toHaveTextContent('2 notificações • 2 não lidas')
    const coleta = groups.find((card) => card.querySelector('.nt-group__title').textContent === 'Coleta agendada')
    expect(coleta.querySelector('.nt-group__meta')).toHaveTextContent('1 notificação • 1 não lida')
  })

  it('linha: ladrilho por tom (info/ok/warn/danger), ponto de nao lida, corpo e "há N min • dd/mm/aaaa"', () => {
    const { container } = render(<Harness />)
    const rows = [...container.querySelectorAll('.nt-group .nt-row')]
    const answer = rows.find((row) => row.textContent.includes('Fulano respondeu.'))
    expect(answer).toHaveClass('nt-row--unread')
    expect(answer.querySelector('.nt-row__icon')).toHaveClass('nt-row__icon--info')
    expect(answer.querySelector('.nt-row__dot')).not.toBeNull()
    expect(answer.querySelector('.nt-row__time').textContent).toMatch(/^há \d+ min • \d{2}\/\d{2}\/\d{4}$/)
    const collection = rows.find((row) => row.textContent.includes('Janela 24/10.'))
    expect(collection.querySelector('.nt-row__icon')).toHaveClass('nt-row__icon--ok')
    const divergence = rows.find((row) => row.textContent.includes('Quantidade menor.'))
    expect(divergence.querySelector('.nt-row__icon')).toHaveClass('nt-row__icon--danger')
    expect(divergence.querySelector('.nt-row__time').textContent).toMatch(/^ontem • \d{2}\/\d{2}\/\d{4}$/)
  })

  it('clicar na linha abre a notificacao; "Marcar como lida" marca so aquela e some da linha', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    const markOne = vi.fn()
    const { container } = render(<Harness spies={{ open, markOne }} />)
    await user.click(screen.getByRole('button', { name: /Não lida: Coleta agendada/ }))
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }))
    const markButton = screen.getByRole('button', { name: 'Marcar como lida: Coleta agendada' })
    expect(markButton).toHaveTextContent('Marcar como lida')
    expect(markButton.closest('.nt-row__open')).toBeNull()
    await user.click(markButton)
    expect(markOne).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }))
    expect(screen.queryByRole('button', { name: 'Marcar como lida: Coleta agendada' })).toBeNull()
    expect(container.querySelector('.nt-row--unread')).not.toBeNull()
  })

  it('carregando: skeleton; erro: banner com "Tentar novamente"', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    const loading = render(<Harness initial={[]} isLoading />)
    expect(loading.container.querySelector('[aria-busy="true"]')).not.toBeNull()
    loading.unmount()
    render(<Harness initial={[]} loadError="Falhou ao carregar" spies={{ reload }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou ao carregar')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sem notificacoes: EmptyState "Nenhuma notificação"', () => {
    const { container } = render(<Harness initial={[]} />)
    expect(screen.getByText('Nenhuma notificação')).toBeInTheDocument()
    expect(container.querySelector('.notifications-page--desktop .empty-state')).not.toBeNull()
  })
})

describe('F5a Notificacoes - Anteriores (recolhidos)', () => {
  function olderSeed(count) {
    const items = [notification('n0')]
    for (let index = 0; index < count; index += 1) {
      items.push(
        notification(`o${index}`, {
          type: 'process_document_uploaded',
          title: `Antigo ${index}`,
          isRead: true,
          createdAt: minutesAgo(60 * (3 + index)),
        })
      )
    }
    return items
  }

  it('cada grupo lido e um botao de 56px recolhido com "N notificação(ões)" e chevron', () => {
    const { container } = render(<Harness initial={olderSeed(2)} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Anteriores' })).toBeInTheDocument()
    const toggles = [...container.querySelectorAll('.nt-older__toggle')]
    expect(toggles).toHaveLength(2)
    toggles.forEach((toggle) => {
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(toggle.querySelector('.nt-older__meta')).toHaveTextContent('1 notificação')
      expect(toggle.querySelector('.nt-older__chevron')).not.toBeNull()
    })
    expect(container.querySelectorAll('.nt-older .nt-row')).toHaveLength(0)
  })

  it('abrir revela as linhas (aria-expanded/aria-controls); fechar de novo recolhe', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness initial={olderSeed(1)} />)
    const toggle = container.querySelector('.nt-older__toggle')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('.nt-older')).toHaveClass('nt-older--open')
    const panel = document.getElementById(toggle.getAttribute('aria-controls'))
    expect(within(panel).getByText('Corpo o0')).toBeInTheDocument()
    expect(panel.querySelector('.nt-row__mark')).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('.nt-older .nt-row')).toBeNull()
  })

  it('"Ver mais N anteriores": 4 de inicio, +8 por clique, some quando acaba', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness initial={olderSeed(7)} />)
    expect(container.querySelectorAll('.nt-older')).toHaveLength(4)
    const more = screen.getByRole('button', { name: 'Ver mais 3 anteriores' })
    expect(more).toHaveClass('nt-section__more')
    await user.click(more)
    expect(container.querySelectorAll('.nt-older')).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /Ver mais/ })).toBeNull()
  })
})

describe('F5a Preferencias - modal desktop (Preferencias.dc.html)', () => {
  function renderModal({ fcm } = {}) {
    const onClose = vi.fn()
    const view = render(
      <ToastProvider>
        <NotificationPreferencesModal
          open
          onClose={onClose}
          profile={{ uid: 'u-1', notificationPreferences: { noticias: { email: false }, suporte: { push: false } } }}
          fcm={
            fcm ?? {
              supported: true,
              status: 'granted',
              enable: vi.fn().mockResolvedValue({ token: 't', status: 'granted' }),
              disable: vi.fn(),
            }
          }
        />
      </ToastProvider>
    )
    return { onClose, ...view }
  }

  beforeEach(() => {
    mockSavePreferences.mockReset()
    mockSavePreferences.mockResolvedValue(true)
  })

  it('modal bare com cabecalho proprio: h2 Sora, lead, fechar de 44 (sem o cabecalho padrao do Modal)', async () => {
    const { onClose } = renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Preferências de notificação' })
    expect(dialog).toHaveClass('modal', 'prefs-modal')
    expect(dialog.querySelector('.modal__header')).toBeNull()
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Preferências de notificação' })).toHaveClass('prefs-head__title')
    expect(within(dialog).getByText('Escolha o que você recebe e por onde. Tudo vem ligado por padrão.')).toHaveClass('notification-prefs__lead')
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tabela Tipo x No portal / E-mail / Navegador com dicas, 9 caixas de 22px e estado salvo refletido', () => {
    renderModal()
    expect(screen.getByRole('columnheader', { name: 'Tipo' })).toBeInTheDocument()
    ;['No portal', 'E-mail', 'Navegador'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: label })).toBeInTheDocument()
    })
    ;['Processos', 'Notícias', 'Suporte'].forEach((label) => {
      expect(screen.getByRole('rowheader', { name: new RegExp(`^${label}`) })).toBeInTheDocument()
    })
    expect(document.querySelectorAll('.prefs-check')).toHaveLength(9)
    expect(document.querySelectorAll('.prefs-check .prefs-check__box')).toHaveLength(9)
    expect(document.querySelectorAll('.notification-prefs__grid .notification-prefs__hint')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: 'Notícias: E-mail' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Suporte: Navegador' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Processos: No portal' })).toBeChecked()
  })

  it('marcar/desmarcar pela caixa e "Salvar preferências" persiste o rascunho', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByRole('checkbox', { name: 'Notícias: E-mail' }))
    expect(screen.getByRole('checkbox', { name: 'Notícias: E-mail' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Processos: E-mail' }))
    const save = screen.getByRole('button', { name: 'Salvar preferências' })
    expect(save).toHaveClass('primary-button')
    await user.click(save)
    await waitFor(() => expect(mockSavePreferences).toHaveBeenCalledTimes(1))
    const [uid, draft] = mockSavePreferences.mock.calls[0]
    expect(uid).toBe('u-1')
    expect(draft.noticias.email).toBe(true)
    expect(draft.processos.email).toBe(false)
    expect(draft.suporte.push).toBe(false)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('"Cancelar" (fantasma) fecha sem salvar', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    expect(cancel).toHaveClass('ghost-button')
    await user.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockSavePreferences).not.toHaveBeenCalled()
  })

  it('navegador nao suportado: coluna desabilitada e aviso mantido; fluxo de permissao do navegador continua', async () => {
    const user = userEvent.setup()
    const unsupported = renderModal({ fcm: { supported: false, status: 'idle', enable: vi.fn(), disable: vi.fn() } })
    expect(screen.getByRole('checkbox', { name: 'Processos: Navegador' })).toBeDisabled()
    expect(screen.getByText(/Notificações do navegador não estão disponíveis/)).toBeInTheDocument()
    unsupported.unmount()

    const enable = vi.fn().mockResolvedValue({ token: 'tok', status: 'granted' })
    renderModal({ fcm: { supported: true, status: 'idle', enable, disable: vi.fn() } })
    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }))
    await waitFor(() => expect(enable).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockSavePreferences).toHaveBeenCalled())
  })

  it('troca ao vivo: tablet/mobile voltam ao cabecalho padrao do Modal e ao input nativo', () => {
    renderModal()
    expect(document.querySelector('.prefs-head')).not.toBeNull()
    media.setDesktop(false)
    expect(document.querySelector('.prefs-head')).toBeNull()
    expect(document.querySelector('.modal__header')).not.toBeNull()
    expect(document.querySelector('.prefs-check')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(9)
    media.setDesktop(true)
    expect(document.querySelector('.prefs-head')).not.toBeNull()
    expect(document.querySelector('.modal__header')).toBeNull()
  })
})
