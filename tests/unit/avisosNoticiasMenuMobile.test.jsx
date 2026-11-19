// Remake mobile F6 (PLAN.md): Avisos, Noticias e Menu na identidade do remake (<= 720px).
// A arvore nova so existe com matchMedia('(max-width: 720px)'); tablet e desktop seguem
// nas arvores de antes (cobertas por tests/ui/*, notificationsDesktop e newsDesktop).
// jsdom nao avalia CSS: o que depende de cascata/@media e conferido no TEXTO do CSS
// (mesma estrategia de tests/unit/mobileRedesignScope.test.js). Fica em tests/unit para
// nao entrar na contagem do audit-vault-counts.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React, { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'

const mockUseAuth = vi.fn()
const mockListProcesses = vi.fn()
const mockListNews = vi.fn()
const mockListExternalNews = vi.fn()
const mockUseTheme = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/hooks/useTheme', () => ({ useTheme: () => mockUseTheme() }))
vi.mock('../../src/services/processesRepository', () => ({
  listProcesses: (...args) => mockListProcesses(...args),
}))
vi.mock('../../src/services/usersRepository', () => ({ saveNotificationPreferences: vi.fn() }))
vi.mock('../../src/services/newsRepository', () => ({
  listNews: (...args) => mockListNews(...args),
  saveNewsItem: vi.fn(),
  removeNewsItem: vi.fn(),
  createNewsItemId: () => 'new-id',
}))
vi.mock('../../src/services/externalNewsRepository', () => ({
  listExternalNews: (...args) => mockListExternalNews(...args),
}))
vi.mock('../../src/services/newsMediaStorage', () => ({
  deleteNewsMediaItems: vi.fn().mockResolvedValue(undefined),
  resolveNewsCoverImageForSave: vi.fn(),
  resolveNewsMediaItemsForSave: vi.fn(),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, useNavigate: () => mockNavigate }
})

import { NotificationsContext } from '../../src/contexts/NotificationsContext'
import NotificationsPage from '../../src/pages/NotificationsPage'
import NewsPage from '../../src/pages/NewsPage'
import MenuPage from '../../src/pages/MenuPage'

const mobileCss = readFileSync(resolve(process.cwd(), 'src/mobile-redesign.css'), 'utf8')
const ORIGINAL_MATCH_MEDIA = window.matchMedia

// matches = true para "(max-width: N)" com N >= largura simulada; "(min-width: N)" com N <= largura.
function stubViewport(widthPx) {
  window.matchMedia = (query) => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    const min = /min-width:\s*(\d+)px/.exec(query)
    let matches = false
    if (max) matches = Number(max[1]) >= widthPx
    else if (min) matches = Number(min[1]) <= widthPx
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }
  }
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListProcesses.mockReset()
  mockListProcesses.mockResolvedValue([])
  mockListNews.mockReset()
  mockListExternalNews.mockReset()
  mockUseTheme.mockReset()
  mockNavigate.mockClear()
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
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
  notification('a1', { type: 'process_question_answered', title: 'Nova resposta', body: 'Fulano respondeu.', createdAt: minutesAgo(8) }),
  notification('b1', { type: 'process_daily_alerts', title: 'Alerta diário', body: 'ETA vencida.', createdAt: minutesAgo(40) }),
  notification('c1', { type: 'receipt_divergence_reported', title: 'Divergência', body: 'Quantidade menor.', createdAt: minutesAgo(120) }),
  notification('d1', { type: 'process_document_uploaded', title: 'Documento anexado', body: 'Packing List.', isRead: true, createdAt: minutesAgo(60 * 5) }),
]

function makeDnd(overrides = {}) {
  return { isActive: false, remainingMs: 0, enableFor: vi.fn(), disable: vi.fn(), ...overrides }
}

function Harness({ initial = SEED, dnd = makeDnd(), spies = {} }) {
  const [notifications, setNotifications] = useState(initial)
  const [filter, setFilter] = useState('all')
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
    isPrefsModalOpen: false,
    setIsPrefsModalOpen: (open) => spies.setPrefs?.(open),
    isLoadingNotifications: false,
    notificationsLoadError: null,
    reloadNotifications: () => {},
  }
  return (
    <>
      {/* destino do MobileHeroSlot (no app mora no hero do AppLayout) */}
      <div id="mobile-hero-extra" data-testid="hero-extra" />
      <NotificationsContext.Provider value={value}>
        <NotificationsPage />
      </NotificationsContext.Provider>
    </>
  )
}

function renderAvisos(props) {
  mockUseAuth.mockReturnValue({ profile: { uid: 'u-1', role: 'admin' } })
  return render(<Harness {...props} />)
}

describe('F6 Avisos (mobile)', () => {
  it('hero: "N não lidas" no slot do hero (role status) e lista em grupo com role list', async () => {
    stubViewport(390)
    const { container } = renderAvisos()

    const hero = screen.getByTestId('hero-extra')
    await waitFor(() => expect(within(hero).getByRole('status')).toHaveTextContent('3 não lidas'))
    expect(within(hero).getByRole('status')).toHaveClass('m-hero-sub')

    const list = screen.getByRole('list', { name: 'Avisos' })
    expect(list).toHaveClass('m-group')
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    // O arvore nova: nada do legado (agrupado) no mobile.
    expect(container.querySelector('.notifications__group')).toBeNull()
    expect(container.querySelector('.section-heading')).toBeNull()
  })

  it('singular no hero: "1 não lida"', async () => {
    stubViewport(390)
    renderAvisos({ initial: [SEED[0], SEED[3]] })
    await waitFor(() => expect(within(screen.getByTestId('hero-extra')).getByRole('status')).toHaveTextContent('1 não lida'))
  })

  it('estado lido/não lido também em texto (nome acessível), ponto sempre montado, mais recentes primeiro', () => {
    stubViewport(390)
    const { container } = renderAvisos()
    const rows = container.querySelectorAll('.m-nrow')
    expect(rows).toHaveLength(4)

    const first = within(rows[0]).getByRole('button', { name: /Nova resposta/ })
    expect(first.getAttribute('aria-label')).toMatch(/^Não lida: Nova resposta\. Fulano respondeu.+ há 8 min$/)
    const read = within(rows[3]).getByRole('button', { name: /Documento anexado/ })
    expect(read.getAttribute('aria-label')).toMatch(/^Lida: Documento anexado/)

    // O ponto existe nas lidas e nas não lidas; so a classe --read o apaga (CSS).
    rows.forEach((row) => expect(row.querySelector('.m-nrow__dot')).not.toBeNull())
    expect(rows[0]).not.toHaveClass('m-nrow--read')
    expect(rows[3]).toHaveClass('m-nrow--read')
  })

  it('o tipo vai pelo ícone (e pelo tom), não só pela cor', () => {
    stubViewport(390)
    const { container } = renderAvisos()
    const lead = (index) => container.querySelectorAll('.m-nrow')[index].querySelector('.m-nrow__lead')
    // resposta = conversa (tom base), alerta diário = aviso, divergência = perigo
    expect(lead(0)).toHaveClass('m-nrow__lead--base')
    expect(lead(1)).toHaveClass('m-nrow__lead--warn')
    expect(lead(2)).toHaveClass('m-nrow__lead--danger')
    for (let i = 0; i < 4; i += 1) {
      expect(lead(i).querySelector('svg')).not.toBeNull()
      expect(lead(i)).toHaveAttribute('aria-hidden', 'true')
    }
    // alerta e divergência usam o mesmo ícone de atenção; a resposta usa o de mensagem
    expect(lead(1).innerHTML).toBe(lead(2).innerHTML)
    expect(lead(0).innerHTML).not.toBe(lead(1).innerHTML)
  })

  it('processo em mono vem de listProcesses com a mesma máscara; sem título, sem linha', async () => {
    stubViewport(390)
    mockListProcesses.mockResolvedValue([{ id: 'p-a1', name: 'Resina X', po: 'PO-77', category: 'Maritimo', status: 'Em transito' }])
    const { container } = renderAvisos()
    await waitFor(() => expect(container.querySelectorAll('.m-nrow__proc').length).toBeGreaterThan(0))
    const procs = [...container.querySelectorAll('.m-nrow__proc')]
    expect(procs).toHaveLength(1)
    expect(container.querySelectorAll('.m-nrow')[0].querySelector('.m-nrow__proc')).toBe(procs[0])
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
  })

  it('chips de filtro com as categorias reais, aria-pressed e filtro aplicado', () => {
    stubViewport(390)
    const { container } = renderAvisos()
    const group_ = screen.getByRole('group', { name: 'Filtrar notificações' })
    const chips = within(group_).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Todas',
      'Dúvidas',
      'Respostas',
      'Favoritos',
      'Pós-recebimento',
      'Coleta',
      'Divergências',
      'Anuências',
      'Alertas',
      'Documentos',
    ])
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    expect(chips[8]).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(within(group_).getByRole('button', { name: 'Alertas' }))
    expect(within(group_).getByRole('button', { name: 'Alertas' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group_).getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelectorAll('.m-nrow')).toHaveLength(1)
    expect(screen.getByText('Alerta diário')).toBeInTheDocument()
  })

  it('estado vazio: "Nenhuma notificação" (m-empty) e o filtro sem resultado mostra o mesmo', () => {
    stubViewport(390)
    const { container } = renderAvisos({ initial: [] })
    expect(container.querySelector('.m-nrow')).toBeNull()
    expect(container.querySelector('.m-empty strong')).toHaveTextContent('Nenhuma notificação')
    expect(container.querySelector('.m-empty p')).toHaveTextContent('As novas dúvidas e respostas dos processos aparecerão aqui.')
  })

  it('clicar numa linha abre a notificação (mecânica existente)', () => {
    stubViewport(390)
    const open = vi.fn()
    renderAvisos({ spies: { open } })
    fireEvent.click(screen.getByRole('button', { name: /Nova resposta/ }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0].id).toBe('a1')
  })

  it('"Marcar lida" do swipe chama markOneAsRead e o ponto da linha apaga', () => {
    stubViewport(390)
    const markOne = vi.fn()
    const { container } = renderAvisos({ spies: { markOne } })
    const row = container.querySelectorAll('.m-nrow')[0]
    fireEvent.click(within(row).getByRole('button', { name: 'Marcar lida', hidden: true }))
    expect(markOne).toHaveBeenCalledTimes(1)
    expect(markOne.mock.calls[0][0].id).toBe('a1')
    expect(container.querySelectorAll('.m-nrow')[0]).toHaveClass('m-nrow--read')
    // Linha lida nao oferece mais o swipe.
    expect(within(container.querySelectorAll('.m-nrow')[0]).queryByText('Marcar lida')).toBeNull()
  })

  it('"Marcar todas como lidas": chama markAllAsRead, os pontos recebem --m-i em sequência, o hero vira "Tudo em dia" e o atraso é limpo depois', async () => {
    stubViewport(390)
    vi.useFakeTimers()
    const markAll = vi.fn()
    const { container } = renderAvisos({ spies: { markAll } })

    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }))
    expect(markAll).toHaveBeenCalledTimes(1)

    const rows = [...container.querySelectorAll('.m-nrow')]
    // Todas viraram lidas; as 3 que eram não lidas levam a ordem 0, 1, 2 (mais recente primeiro).
    rows.forEach((row) => expect(row).toHaveClass('m-nrow--read'))
    expect(rows.map((row) => row.style.getPropertyValue('--m-i'))).toEqual(['0', '1', '2', ''])
    expect(within(screen.getByTestId('hero-extra')).getByRole('status')).toHaveTextContent('Tudo em dia')
    expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toHaveAttribute('aria-disabled', 'true')

    // Depois da sequência (3 linhas x 160ms + folga) o atraso some do DOM.
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    container.querySelectorAll('.m-nrow').forEach((row) => expect(row.style.getPropertyValue('--m-i')).toBe(''))
  })

  it('sem não lidas "Marcar todas" não faz nada e o botão continua focável (aria-disabled, não disabled)', () => {
    stubViewport(390)
    const markAll = vi.fn()
    renderAvisos({ initial: [SEED[3]], spies: { markAll } })
    const button = screen.getByRole('button', { name: 'Marcar todas como lidas' })
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(button)
    expect(markAll).not.toHaveBeenCalled()
    expect(within(screen.getByTestId('hero-extra')).getByRole('status')).toHaveTextContent('Tudo em dia')
  })

  it('preferências e modo não perturbe continuam acessíveis (44px, rótulos e aria-pressed)', () => {
    stubViewport(390)
    const setPrefs = vi.fn()
    const dnd = makeDnd()
    renderAvisos({ spies: { setPrefs }, dnd })
    fireEvent.click(screen.getByRole('button', { name: 'Preferências de notificação' }))
    expect(setPrefs).toHaveBeenCalledWith(true)

    const dndButton = screen.getByRole('button', { name: 'Ativar modo não perturbe por 1 hora' })
    expect(dndButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(dndButton)
    expect(dnd.enableFor).toHaveBeenCalledWith(60 * 60 * 1000)
  })

  it('modo não perturbe ativo aparece no hero e o botão vira "Desativar"', async () => {
    stubViewport(390)
    const dnd = makeDnd({ isActive: true, remainingMs: 45 * 60_000 })
    renderAvisos({ dnd })
    await waitFor(() =>
      expect(within(screen.getByTestId('hero-extra')).getByRole('status')).toHaveTextContent('3 não lidas · Silenciado (45min)')
    )
    const button = screen.getByRole('button', { name: /Desativar modo não perturbe/ })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(dnd.disable).toHaveBeenCalledTimes(1)
  })

  it('"Ver mais N anteriores" pagina a lista longa de 20 em 20', () => {
    stubViewport(390)
    const many = Array.from({ length: 25 }, (_, index) =>
      notification(`n${index}`, { createdAt: minutesAgo(index + 1), isRead: true, title: `Aviso ${index}` })
    )
    const { container } = renderAvisos({ initial: many })
    expect(container.querySelectorAll('.m-nrow')).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', { name: 'Ver mais 5 anteriores' }))
    expect(container.querySelectorAll('.m-nrow')).toHaveLength(25)
    expect(screen.queryByRole('button', { name: /Ver mais/ })).toBeNull()
  })

  it('tablet (721-1040): a árvore legada continua, sem nada do remake', () => {
    stubViewport(800)
    const { container } = renderAvisos()
    expect(container.querySelector('.m-nrow')).toBeNull()
    expect(container.querySelector('.m-chips')).toBeNull()
    expect(container.querySelector('.notifications-page--mobile')).toBeNull()
    expect(container.querySelector('.section-heading')).not.toBeNull()
    expect(mockListProcesses).not.toHaveBeenCalled()
  })

  it('CSS: ponto com atraso --m-i x 160ms só no estado --read, par `none` no reduced-motion e escopo só na camada S', () => {
    expect(mobileCss).toMatch(
      /\.m-nrow--read \.m-nrow__dot \{[^}]*transform: scale\(0\);[^}]*opacity: 0;[^}]*transition-delay: calc\(var\(--m-i, 0\) \* 160ms\);/
    )
    const reduceStart = mobileCss.indexOf('@media (max-width: 720px) and (prefers-reduced-motion: reduce)')
    const reduce = mobileCss.slice(reduceStart)
    for (const selector of ['.m-nrow__dot', '.m-nrow__open', '.m-nrow__actions', '.m-seg__btn']) {
      expect(reduce, selector).toMatch(new RegExp(`${selector.replace('.', '\\.')} \\{\\s*transition: none;`))
    }
    // O ponto existe so na camada S (a ocorrencia fica antes do bloco T de tablet).
    const tabletStart = mobileCss.indexOf('@media (min-width: 721px) and (max-width: 1040px)')
    expect(mobileCss.indexOf('.m-nrow__dot {')).toBeGreaterThan(0)
    expect(mobileCss.indexOf('.m-nrow__dot {')).toBeLessThan(tabletStart)
  })
})

// ---------------------------------------------------------------------------
// Noticias
// ---------------------------------------------------------------------------
const RECENT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

const MANUAL_NEWS = [
  {
    id: 'n-1',
    title: 'Greve &amp; atraso no porto',
    content: 'Texto completo da noticia.',
    summary: 'Resumo &quot;curto&quot; da noticia.',
    updatedAt: RECENT,
    coverImage: 'https://example.com/cover1.jpg',
    references: ['https://example.com/ref1'],
    mediaItems: [],
  },
]

const AUTOMATIC_NEWS = [
  {
    id: 'e-1',
    title: 'SISCOMEX publica nova portaria',
    content: '',
    summary: '',
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    publishedAt: RECENT,
    sourceType: 'automatic',
    sourceName: 'SISCOMEX',
    externalUrl: 'https://siscomex.gov.br/portaria/123',
    coverImage: '',
    references: [],
    mediaItems: [],
  },
]

function renderNews(role = 'user') {
  mockUseAuth.mockReturnValue({ profile: { uid: 'x-1', name: 'Fulano', email: 'f@sq.com', role } })
  mockListNews.mockResolvedValue(MANUAL_NEWS)
  mockListExternalNews.mockResolvedValue(AUTOMATIC_NEWS)
  return render(<NewsPage />)
}

describe('F6 Notícias (mobile)', () => {
  it('cartões do mock: chip da fonte, data, título (h2 com botão), resumo, com o texto real decodificado', async () => {
    stubViewport(390)
    const { container } = renderNews()
    await waitFor(() => expect(container.querySelectorAll('.m-news')).toHaveLength(2))

    const first = container.querySelectorAll('.m-news')[0]
    expect(first).toHaveClass('m-card')
    expect(first.querySelector('.m-tag')).toHaveTextContent('Portal COMEX')
    expect(first.querySelector('.m-news__meta small').textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    // decodeHtmlEntities no titulo e no resumo
    const title = within(first).getByRole('heading', { level: 2 })
    expect(title).toHaveTextContent('Greve & atraso no porto')
    expect(within(title).getByRole('button')).toHaveTextContent('Greve & atraso no porto')
    expect(first.querySelector('.m-news__summary')).toHaveTextContent('Resumo "curto" da noticia.')

    const second = container.querySelectorAll('.m-news')[1]
    expect(second.querySelector('.m-tag')).toHaveTextContent('SISCOMEX')
    // sem resumo/conteudo cai no texto automatico de sempre
    expect(second.querySelector('.m-news__summary')).toHaveTextContent('Atualização automática publicada por SISCOMEX')
  })

  it('capa só quando a notícia tem uma (decorativa, alt vazio); sem capa não mostra o logo de fallback', async () => {
    stubViewport(390)
    const { container } = renderNews()
    await waitFor(() => expect(container.querySelectorAll('.m-news')).toHaveLength(2))
    const covers = container.querySelectorAll('.m-news__cover')
    expect(covers).toHaveLength(1)
    expect(covers[0]).toHaveAttribute('src', 'https://example.com/cover1.jpg')
    expect(covers[0]).toHaveAttribute('alt', '')
    expect(container.querySelectorAll('.m-news')[1].querySelector('img')).toBeNull()
  })

  it('tocar no título abre o detalhe com conteúdo e links reais (mesmo modal de antes)', async () => {
    stubViewport(390)
    const { container } = renderNews()
    await waitFor(() => expect(container.querySelectorAll('.m-news')).toHaveLength(2))
    fireEvent.click(within(container.querySelectorAll('.m-news')[0]).getByRole('button', { name: 'Greve & atraso no porto' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Texto completo da noticia.')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'https://example.com/ref1' })).toBeInTheDocument()
  })

  it('"Editar" só para admin e só em notícia manual, 44px (m-ghost) e com o título no nome', async () => {
    stubViewport(390)
    const admin = renderNews('admin')
    await waitFor(() => expect(admin.container.querySelectorAll('.m-news')).toHaveLength(2))
    const edits = admin.container.querySelectorAll('.m-news__edit')
    expect(edits).toHaveLength(1)
    expect(edits[0]).toHaveClass('m-ghost')
    expect(edits[0]).toHaveAttribute('aria-label', 'Editar notícia: Greve & atraso no porto')
    expect(screen.getByRole('button', { name: 'Nova notícia' })).toBeInTheDocument()
    admin.unmount()

    const user = renderNews('user')
    await waitFor(() => expect(user.container.querySelectorAll('.m-news')).toHaveLength(2))
    expect(user.container.querySelector('.m-news__edit')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nova notícia' })).toBeNull()
  })

  it('lista vazia: estado "Nenhuma notícia publicada" no padrão m-empty', async () => {
    stubViewport(390)
    mockUseAuth.mockReturnValue({ profile: { uid: 'x-1', role: 'user' } })
    mockListNews.mockResolvedValue([])
    mockListExternalNews.mockResolvedValue([])
    const { container } = render(<NewsPage />)
    await waitFor(() => expect(container.querySelector('.m-empty')).not.toBeNull())
    expect(container.querySelector('.m-empty strong')).toHaveTextContent('Nenhuma notícia publicada')
    expect(container.querySelector('.m-news')).toBeNull()
  })

  it('tablet: segue a grade de antes (news-card), sem cartões do remake', async () => {
    stubViewport(800)
    const { container } = renderNews()
    await waitFor(() => expect(container.querySelectorAll('.news-card').length).toBeGreaterThan(0))
    expect(container.querySelector('.m-news')).toBeNull()
    expect(container.querySelector('.m-news-list')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
const mockLogout = vi.fn()

function renderMenu(role, { themePreference = 'auto', area, name = 'Lucas Felsky' } = {}) {
  mockUseAuth.mockReturnValue({
    profile: { uid: `${role}-1`, name, email: `${role}@sq.com`, role, area },
    logout: mockLogout,
  })
  const setPreference = vi.fn()
  const cyclePreference = vi.fn()
  mockUseTheme.mockReturnValue({ preference: themePreference, setPreference, cyclePreference })
  const view = render(
    <MemoryRouter>
      <MenuPage />
    </MemoryRouter>
  )
  return { ...view, setPreference, cyclePreference }
}

describe('F6 Menu (mobile)', () => {
  beforeEach(() => {
    mockLogout.mockClear()
    stubViewport(390)
  })

  it('cartão do usuário: avatar com iniciais, nome, e-mail e a tag do papel', () => {
    const { container } = renderMenu('admin')
    const card = container.querySelector('.m-ucard')
    expect(card.querySelector('.m-ucard__avatar')).toHaveTextContent('LF')
    expect(card.querySelector('.m-ucard__avatar')).toHaveAttribute('aria-hidden', 'true')
    expect(within(card).getByText('Lucas Felsky')).toBeInTheDocument()
    expect(within(card).getByText('admin@sq.com')).toBeInTheDocument()
    expect(card.querySelector('.m-tag')).toHaveTextContent('Admin')
    // nada da arvore legada
    expect(container.querySelector('.ios-row')).toBeNull()
    expect(container.querySelector('.menu-profile')).toBeNull()
  })

  it('admin vê "Administração" com as 6 seções reais e cada uma navega para a sua rota', () => {
    const { container } = renderMenu('admin')
    expect(screen.getByRole('heading', { level: 2, name: 'Administração' })).toBeInTheDocument()
    const routes = {
      Usuários: '/admin/usuarios',
      Comunicados: '/admin/comunicados',
      'Barra do porto': '/admin/barra',
      Previsões: '/admin/previsoes',
      'Lead time': '/admin/lead-time',
      'Chamados de suporte Chamados abertos pelos usuários': '/admin/suporte',
    }
    const groupEl = container.querySelector('.m-group')
    expect(within(groupEl).getAllByRole('button')).toHaveLength(6)
    for (const [label, route] of Object.entries(routes)) {
      mockNavigate.mockClear()
      fireEvent.click(within(groupEl).getByRole('button', { name: label }))
      expect(mockNavigate).toHaveBeenCalledWith(route)
    }
    // Admin: so UMA linha "Suporte" (abrir chamado); a da Administracao se chama "Chamados de suporte".
    expect(screen.getAllByRole('button', { name: /^Suporte/ })).toHaveLength(1)
  })

  it('usuário comum NÃO vê Administração nem IntelliQuote; vê Suporte, Tema e Sair', () => {
    renderMenu('user')
    expect(screen.queryByText('Administração')).toBeNull()
    expect(screen.queryByText(/intelliquote/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^Suporte/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('Comercial vê "Solicitar uma cotação" (link seguro, nova aba) como antes; admin vê só "IntelliQuote"', () => {
    const comercial = renderMenu('user', { area: 'Comercial' })
    const link = screen.getByRole('link', { name: /Solicitar uma cotação/ })
    expect(link).toHaveAttribute('href', 'https://intelliquote.portal-comex.com/solicitacoes')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('link', { name: /^IntelliQuote/ })).toBeNull()
    comercial.unmount()

    renderMenu('admin', { area: 'Comercial' })
    expect(screen.getByRole('link', { name: /^IntelliQuote/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Solicitar uma cotação/ })).toBeNull()
  })

  it('logística + Comercial não vê a Suite SQ', () => {
    renderMenu('logistica', { area: 'Comercial' })
    expect(screen.queryByRole('link', { name: /cotação/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^IntelliQuote/ })).toBeNull()
  })

  it('Suporte dispara o evento global do modal', () => {
    renderMenu('user')
    const listener = vi.fn()
    window.addEventListener('sq-comex:open-support-modal', listener)
    fireEvent.click(screen.getByRole('button', { name: /^Suporte/ }))
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('sq-comex:open-support-modal', listener)
  })

  it('tema: segmented Automático/Claro/Escuro com aria-pressed, alterna pelo setPreference e não cicla', () => {
    const { setPreference, cyclePreference } = renderMenu('user', { themePreference: 'dark' })
    const group_ = screen.getByRole('group', { name: 'Tema' })
    const buttons = within(group_).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Automático', 'Claro', 'Escuro'])
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])

    fireEvent.click(within(group_).getByRole('button', { name: 'Claro' }))
    expect(setPreference).toHaveBeenCalledWith('light')
    fireEvent.click(within(group_).getByRole('button', { name: 'Automático' }))
    expect(setPreference).toHaveBeenCalledWith('auto')
    expect(cyclePreference).not.toHaveBeenCalled()
  })

  it('Sair chama o logout existente e fica no grupo separado em vermelho', () => {
    const { container } = renderMenu('user')
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(mockLogout).toHaveBeenCalledTimes(1)
    const danger = container.querySelector('.m-group--danger')
    expect(within(danger).getAllByRole('button')).toHaveLength(1)
    expect(danger.querySelector('.m-rowi__label')).toHaveTextContent('Sair')
  })

  it('assinatura SQ Química no fim, com o componente oficial (nunca glifo improvisado)', () => {
    const { container } = renderMenu('user')
    const signature = container.querySelector('.m-menu__signature')
    expect(signature).toHaveClass('sq-logo')
    expect(signature).toHaveAttribute('role', 'img')
    expect(signature).toHaveAttribute('aria-label', 'SQ Química')
    expect(signature.querySelector('svg.sq-logo__symbol')).not.toBeNull()
    expect(container.querySelector('.menu-page').lastElementChild).toBe(signature)
  })

  it('tablet/desktop: a árvore de antes (linha de Tema que cicla, Painel administrativo), sem nada do remake', () => {
    stubViewport(800)
    const { container, cyclePreference } = renderMenu('admin', { themePreference: 'dark' })
    expect(container.querySelector('.m-menu')).toBeNull()
    expect(container.querySelector('.m-seg')).toBeNull()
    expect(screen.getByText('Escuro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /tema/i }))
    expect(cyclePreference).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /painel administrativo/i })).toBeInTheDocument()
  })
})
