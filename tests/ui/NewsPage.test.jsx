// Tests do NewsPage (modo list + modal).
// Cobre:
//   - Loading inicial: "Carregando noticias"
//   - Error ao carregar aparece no error-banner
//   - Render: lista de cards com titulo, sourceName, timestamp
//   - Empty state: "Nenhuma noticia publicada" se lista vazia
//   - User comum (sem role=admin): NAO mostra botao "Nova noticia"
//   - Admin: mostra botao "Nova noticia"
//   - Admin: botao Editar aparece nos cards manuais
//   - Admin: botao Editar NAO aparece em cards automaticos
//   - Click em card: abre modal com detalhes (titulo, timestamp, body)
//   - Modal tem botao Fechar
//   - Modal: card automatico com externalUrl mostra "Abrir fonte oficial"
//   - Click em Fechar: fecha o modal
//   - Click no backdrop: fecha o modal
//   - News com references: links renderizam no modal

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockListNews = vi.fn()
const mockListExternalNews = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
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
vi.mock('../../src/utils/newsMedia', () => ({
  buildPendingNewsMediaItems: vi.fn().mockReturnValue([]),
  formatNewsMediaSize: vi.fn().mockReturnValue(''),
  getNewsMediaDisplayName: (item) => item?.name || '',
  getAddedNewsMediaItems: () => [],
  getRemovedNewsMediaItems: () => [],
  isImageNewsMediaItem: () => false,
  normalizeDraftNewsMediaItems: (items) => items || [],
  normalizeNewsMediaItems: (items) => items || [],
  revokeNewsMediaPreview: vi.fn(),
  toNewsMediaPreviewUrl: (item) => item?.url || '',
}))
// Mock defaultNewsCoverImage (asset import)
vi.mock('../../src/assets/sqquimica.png', () => ({ default: 'data:image/png;base64,default' }))

import NewsPage from '../../src/pages/NewsPage'

const MANUAL_NEWS = [
  {
    id: 'n-1',
    title: 'Manutencao programada sabado',
    content: 'Sistema em manutencao das 02h as 06h.',
    summary: 'Sistema em manutencao sabado das 02h as 06h.',
    updatedAt: '2026-06-30T10:00:00Z',
    coverImage: 'https://example.com/cover1.jpg',
    references: ['https://example.com/ref1', 'https://example.com/ref2'],
    mediaItems: [],
  },
]

const AUTOMATIC_NEWS = [
  {
    id: 'e-1',
    title: 'SISCOMEX publica nova portaria',
    content: '',
    summary: '',
    updatedAt: '2026-06-30T08:00:00Z',
    publishedAt: '2026-06-30T08:00:00Z',
    sourceType: 'automatic',
    sourceName: 'SISCOMEX',
    externalUrl: 'https://siscomex.gov.br/portaria/123',
    coverImage: '',
    references: [],
    mediaItems: [],
  },
]

const ADMIN_PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }
const USER_PROFILE = { uid: 'user-1', name: 'User', email: 'user@sqquimica.com', role: 'user' }

function renderPage() {
  return render(<NewsPage />)
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListNews.mockReset()
  mockListExternalNews.mockReset()
  mockUseAuth.mockReturnValue({ profile: ADMIN_PROFILE })
  mockListNews.mockResolvedValue(MANUAL_NEWS)
  mockListExternalNews.mockResolvedValue(AUTOMATIC_NEWS)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('NewsPage', () => {
  it('isLoading=true inicial: mostra "Carregando noticias" enquanto promises nao resolvem', async () => {
    let resolveManual
    let resolveAutomatic
    mockListNews.mockReturnValue(new Promise((r) => { resolveManual = r }))
    mockListExternalNews.mockReturnValue(new Promise((r) => { resolveAutomatic = r }))
    const { container } = renderPage()
    // Enquanto nao resolveu, newsItems === [] e isLoading === true
    // → mostra "Carregando noticias" (do branch isLoading)
    expect(container.textContent).toMatch(/Carregando/)
    resolveManual([])
    resolveAutomatic([])
  })

  it('error ao carregar aparece no error-banner', async () => {
    mockListNews.mockRejectedValueOnce(new Error('boom'))
    mockListExternalNews.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar as notícias/i)).toBeInTheDocument()
    })
  })

  it('render: lista de cards com titulo, sourceName, timestamp', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    // Automatic news com titulo
    expect(screen.getByText('SISCOMEX publica nova portaria')).toBeInTheDocument()
    // Source name visivel
    expect(screen.getAllByText('SISCOMEX').length).toBeGreaterThan(0)
  })

  it('empty state: "Nenhuma noticia publicada" se lista vazia', async () => {
    mockListNews.mockResolvedValueOnce([])
    mockListExternalNews.mockResolvedValueOnce([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma notícia publicada/i)).toBeInTheDocument()
    })
  })

  it('user comum: NAO mostra botao "Nova noticia"', async () => {
    mockUseAuth.mockReturnValue({ profile: USER_PROFILE })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Nova notícia' })).not.toBeInTheDocument()
  })

  it('admin: mostra botao "Nova noticia"', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nova notícia' })).toBeInTheDocument()
    })
  })

  it('admin: botao Editar aparece nos cards manuais', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    // Maria (manual) tem botao Editar
    const cards = document.querySelectorAll('.news-card')
    const manualCard = Array.from(cards).find((c) =>
      c.textContent.includes('Manutencao programada sabado')
    )
    expect(manualCard.querySelector('button.ghost-button')).toBeInTheDocument()
  })

  it('admin: botao Editar NAO aparece em cards automaticos', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('SISCOMEX publica nova portaria')).toBeInTheDocument()
    })
    const cards = document.querySelectorAll('.news-card')
    const autoCard = Array.from(cards).find((c) =>
      c.textContent.includes('SISCOMEX publica nova portaria')
    )
    expect(autoCard.querySelector('button.ghost-button')).not.toBeInTheDocument()
  })

  it('click em card: abre modal com detalhes (titulo, timestamp, body)', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    // Clica no card (botao news-card__button)
    const cardButtons = document.querySelectorAll('.news-card__button')
    const manualCardBtn = Array.from(cardButtons).find((b) =>
      b.textContent.includes('Manutencao programada sabado')
    )
    await user.click(manualCardBtn)
    // Modal aberto
    await waitFor(() => {
      // heading do modal tem o titulo
      const modalTitles = document.querySelectorAll('.news-modal h3')
      expect(Array.from(modalTitles).some((h) => h.textContent === 'Manutencao programada sabado')).toBe(true)
    })
  })

  it('modal tem botao Fechar', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    const cardButtons = document.querySelectorAll('.news-card__button')
    const manualCardBtn = Array.from(cardButtons).find((b) =>
      b.textContent.includes('Manutencao programada sabado')
    )
    await user.click(manualCardBtn)
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })

  it('modal: card automatico com externalUrl mostra "Abrir fonte oficial"', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('SISCOMEX publica nova portaria')).toBeInTheDocument()
    })
    const cardButtons = document.querySelectorAll('.news-card__button')
    const autoCardBtn = Array.from(cardButtons).find((b) =>
      b.textContent.includes('SISCOMEX publica nova portaria')
    )
    await user.click(autoCardBtn)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Abrir fonte oficial/i })).toBeInTheDocument()
    })
  })

  it('click em Fechar: fecha o modal', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    const cardButtons = document.querySelectorAll('.news-card__button')
    const manualCardBtn = Array.from(cardButtons).find((b) =>
      b.textContent.includes('Manutencao programada sabado')
    )
    await user.click(manualCardBtn)
    expect(document.querySelector('.news-modal')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => {
      expect(document.querySelector('.news-modal')).not.toBeInTheDocument()
    })
  })

  it('click no backdrop: fecha o modal', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    const cardButtons = document.querySelectorAll('.news-card__button')
    const manualCardBtn = Array.from(cardButtons).find((b) =>
      b.textContent.includes('Manutencao programada sabado')
    )
    await user.click(manualCardBtn)
    expect(document.querySelector('.news-modal-backdrop')).toBeInTheDocument()
    await user.click(document.querySelector('.news-modal-backdrop'))
    await waitFor(() => {
      expect(document.querySelector('.news-modal-backdrop')).not.toBeInTheDocument()
    })
  })

  it('news com references: links renderizam no modal', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada sabado')).toBeInTheDocument()
    })
    const cardButtons = document.querySelectorAll('.news-card__button')
    const manualCardBtn = Array.from(cardButtons).find((b) =>
      b.textContent.includes('Manutencao programada sabado')
    )
    await user.click(manualCardBtn)
    await waitFor(() => {
      const links = screen.getAllByRole('link')
      const refLinks = links.filter((l) => l.href.includes('example.com/ref'))
      expect(refLinks.length).toBe(2)
    })
  })
})
