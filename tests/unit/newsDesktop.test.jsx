// Refino F5a: arvore DESKTOP das Noticias (Noticias.dc.html). O desktop e escolhido
// por matchMedia('(min-width: 1041px)'); aqui o matchMedia diz "desktop" e os modulos
// de dominio (newsMedia, textEncoding) sao os REAIS — so os repositorios e o Storage sao
// mocks. A arvore legada (tablet/mobile) continua coberta por tests/ui/NewsPage.test.jsx
// (matchMedia falso = legado). Fica em tests/unit para nao entrar na contagem do
// audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockListNews = vi.fn()
const mockListExternalNews = vi.fn()
const mockSaveNewsItem = vi.fn()
const mockRemoveNewsItem = vi.fn()
const mockResolveCover = vi.fn()
const mockResolveMedia = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/services/newsRepository', () => ({
  listNews: (...args) => mockListNews(...args),
  saveNewsItem: (...args) => mockSaveNewsItem(...args),
  removeNewsItem: (...args) => mockRemoveNewsItem(...args),
  createNewsItemId: () => 'new-id',
}))
vi.mock('../../src/services/externalNewsRepository', () => ({
  listExternalNews: (...args) => mockListExternalNews(...args),
}))
vi.mock('../../src/services/newsMediaStorage', () => ({
  deleteNewsMediaItems: vi.fn().mockResolvedValue(undefined),
  resolveNewsCoverImageForSave: (...args) => mockResolveCover(...args),
  resolveNewsMediaItemsForSave: (...args) => mockResolveMedia(...args),
}))

import NewsPage from '../../src/pages/NewsPage'

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
const ADMIN = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }
const USER = { uid: 'user-1', name: 'User', email: 'user@sqquimica.com', role: 'user' }

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

function manual(id, title, minutes, overrides = {}) {
  return {
    id,
    title,
    content: `Texto completo de ${title}.`,
    summary: `Resumo de ${title}.`,
    updatedAt: minutesAgo(minutes),
    coverImage: `https://example.com/${id}.jpg`,
    references: [],
    mediaItems: [],
    ...overrides,
  }
}

function automatic(id, title, minutes, overrides = {}) {
  return {
    id,
    title,
    content: '',
    summary: `Resumo de ${title}.`,
    updatedAt: minutesAgo(minutes),
    publishedAt: minutesAgo(minutes),
    sourceType: 'automatic',
    sourceName: 'SISCOMEX',
    externalUrl: 'https://siscomex.gov.br/portaria/123',
    coverImage: '',
    references: [],
    mediaItems: [],
    ...overrides,
  }
}

const FEATURED = manual('n-1', 'Novo visual do Portal COMEX', 30, {
  references: ['https://example.com/ref1', 'https://example.com/ref2'],
  mediaItems: [
    { id: 'img-1', url: 'https://example.com/g1.jpg', name: 'galeria-1.jpg', caption: 'Fila nova', mimeType: 'image/jpeg', kind: 'image' },
    { id: 'file-1', url: 'https://example.com/guia.pdf', name: 'guia.pdf', caption: 'Guia', mimeType: 'application/pdf', kind: 'file', size: 482133 },
  ],
})

function setup({ profile = ADMIN, manualNews = [FEATURED, manual('n-2', 'Free time ampliado', 60 * 5, { coverImage: '' })], automaticNews = [automatic('e-1', 'Portaria nova', 60 * 8)] } = {}) {
  mockUseAuth.mockReturnValue({ profile })
  mockListNews.mockResolvedValue(manualNews)
  mockListExternalNews.mockResolvedValue(automaticNews)
}

let media

beforeEach(() => {
  media = installMatchMedia(true)
  mockUseAuth.mockReset()
  mockListNews.mockReset()
  mockListExternalNews.mockReset()
  mockSaveNewsItem.mockReset()
  mockRemoveNewsItem.mockReset()
  mockResolveCover.mockReset()
  mockResolveMedia.mockReset()
  setup()
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

async function renderLoaded() {
  const view = render(<NewsPage />)
  await waitFor(() => expect(view.container.querySelector('.nw-card:not(.nw-card--skeleton)')).not.toBeNull())
  return view
}

describe('F5a Noticias - troca de arvore por matchMedia', () => {
  it('desktop renderiza a arvore nw-* sob .surface--news e nao a legada', async () => {
    const { container } = await renderLoaded()
    expect(container.querySelector('section.surface.surface--news.surface--news-desktop')).not.toBeNull()
    expect(container.querySelector('.nw-head')).not.toBeNull()
    expect(container.querySelector('.nw-grid')).not.toBeNull()
    expect(container.querySelector('.news-grid')).toBeNull()
    expect(container.querySelector('.news-list-card')).toBeNull()
  })

  it('tablet/mobile (sem desktop) seguem na arvore legada', async () => {
    media.setDesktop(false)
    const { container } = render(<NewsPage />)
    await waitFor(() => expect(container.querySelector('.news-card--featured')).not.toBeNull())
    expect(container.querySelector('.surface--news-desktop')).toBeNull()
    expect(container.querySelector('.nw-head')).toBeNull()
  })

  it('troca ao vivo nos dois sentidos, sem recarregar as noticias e sem listener preso', async () => {
    const { container, unmount } = await renderLoaded()
    expect(mockListNews).toHaveBeenCalledTimes(1)
    media.setDesktop(false)
    expect(container.querySelector('.nw-grid')).toBeNull()
    expect(container.querySelector('.news-grid')).not.toBeNull()
    expect(screen.getByText('Novo visual do Portal COMEX')).toBeInTheDocument()
    media.setDesktop(true)
    expect(container.querySelector('.nw-grid')).not.toBeNull()
    expect(container.querySelector('.news-grid')).toBeNull()
    expect(mockListNews).toHaveBeenCalledTimes(1)
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('o detalhe aberto troca de modal junto com a arvore (bare + nw-modal <-> news-modal)', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(document.querySelector('.nw-card--featured .nw-card__link'))
    expect(document.querySelector('.modal.nw-modal')).not.toBeNull()
    media.setDesktop(false)
    expect(document.querySelector('.modal.news-modal')).not.toBeNull()
    expect(document.querySelector('.modal.nw-modal')).toBeNull()
    media.setDesktop(true)
    expect(document.querySelector('.modal.nw-modal')).not.toBeNull()
  })
})

describe('F5a Noticias - cabecalho e lista', () => {
  it('eyebrow "COMEX · MERCADO · OPERAÇÃO", h2 "Notícias" e "Nova notícia" primario com icone (admin)', async () => {
    await renderLoaded()
    expect(screen.getByText('COMEX · MERCADO · OPERAÇÃO')).toHaveClass('nw-head__eyebrow')
    expect(screen.getByRole('heading', { level: 2, name: 'Notícias' })).toHaveClass('nw-head__title')
    const create = screen.getByRole('button', { name: 'Nova notícia' })
    expect(create).toHaveClass('primary-button')
    expect(create.querySelector('svg')).not.toBeNull()
  })

  it('usuario comum: sem "Nova notícia" e sem "Editar"', async () => {
    setup({ profile: USER })
    await renderLoaded()
    expect(screen.queryByRole('button', { name: 'Nova notícia' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('destaque = a mais nova (capa, fonte, data de hoje, titulo, resumo, "Ler notícia"); o resto vai para "Anteriores"', async () => {
    const { container } = await renderLoaded()
    const featured = container.querySelector('.nw-card--featured')
    expect(featured.querySelector('.nw-card__title')).toHaveTextContent('Novo visual do Portal COMEX')
    expect(featured.querySelector('.nw-card__summary')).toHaveTextContent('Resumo de Novo visual do Portal COMEX.')
    expect(featured.querySelector('.nw-card__cta')).toHaveTextContent('Ler notícia')
    expect(featured.querySelector('.nw-source')).toHaveTextContent('Portal COMEX')
    expect(featured.querySelector('.nw-card__time').textContent).toMatch(/^(Hoje|Ontem), \d{2}:\d{2}$/)
    expect(featured.querySelector('.nw-cover__image')).toHaveAttribute('src', 'https://example.com/n-1.jpg')

    const aside = screen.getByRole('complementary', { name: 'Anteriores' })
    expect(within(aside).getByRole('heading', { level: 2, name: 'Anteriores' })).toBeInTheDocument()
    const rows = aside.querySelectorAll('.nw-card--row')
    expect(rows).toHaveLength(2)
    // linha: fonte + data curta + titulo; sem resumo nem "Ler notícia"
    expect(rows[0].querySelector('.nw-card__summary')).toBeNull()
    expect(rows[0].querySelector('.nw-card__cta')).toBeNull()
    expect(rows[0].querySelector('.nw-card__chevron')).not.toBeNull()
  })

  it('fonte propria em --navy-50 e fonte externa em --info-50 (classes), data curta "Hoje"/"Ontem"/dd/mm nas linhas', async () => {
    const dayMs = 24 * 60
    setup({
      manualNews: [FEATURED, manual('n-2', 'Ontem aqui', dayMs + 30, { coverImage: '' })],
      automaticNews: [automatic('e-1', 'Externa de hoje', 90)],
    })
    const { container } = await renderLoaded()
    const rows = [...container.querySelectorAll('.nw-card--row')]
    const ext = rows.find((row) => row.textContent.includes('Externa de hoje'))
    expect(ext.querySelector('.nw-source')).toHaveClass('nw-source--ext')
    expect(ext.querySelector('.nw-source')).toHaveTextContent('SISCOMEX')
    expect(ext.querySelector('.nw-card__time')).toHaveTextContent(/^Hoje$/)
    const yesterday = rows.find((row) => row.textContent.includes('Ontem aqui'))
    expect(yesterday.querySelector('.nw-source')).toHaveClass('nw-source--own')
    expect(yesterday.querySelector('.nw-card__time')).toHaveTextContent(/^Ontem$/)
    // tooltip com a data completa
    expect(yesterday.querySelector('.nw-card__time').getAttribute('title')).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('sem capa: imagem padrao no placeholder (nw-cover--empty), com capa: a capa', async () => {
    const { container } = await renderLoaded()
    const covers = [...container.querySelectorAll('.nw-card .nw-cover')]
    expect(covers[0]).not.toHaveClass('nw-cover--empty')
    const rowWithoutCover = [...container.querySelectorAll('.nw-card--row')].find((row) => row.textContent.includes('Free time ampliado'))
    expect(rowWithoutCover.querySelector('.nw-cover')).toHaveClass('nw-cover--empty')
  })

  it('"Editar" so em noticia MANUAL e so para admin; e um botao irmao (nao dentro do botao do card)', async () => {
    const { container } = await renderLoaded()
    const editButtons = screen.getAllByRole('button', { name: 'Editar' })
    // 2 manuais (destaque + 1 linha); a externa nao tem
    expect(editButtons).toHaveLength(2)
    editButtons.forEach((button) => {
      expect(button).toHaveClass('secondary-button', 'nw-card__edit')
      expect(button.closest('.nw-card__link')).toBeNull()
    })
    const externalRow = [...container.querySelectorAll('.nw-card--row')].find((row) => row.textContent.includes('Portaria nova'))
    expect(externalRow.querySelector('.nw-card__edit')).toBeNull()
  })

  it('"Carregar mais": 4 linhas de inicio, +4 por clique, some quando acabou', async () => {
    const manualNews = [FEATURED]
    for (let index = 0; index < 7; index += 1) manualNews.push(manual(`m-${index}`, `Anterior ${index}`, 60 + index * 10))
    setup({ manualNews, automaticNews: [] })
    const user = userEvent.setup()
    const { container } = await renderLoaded()
    expect(container.querySelectorAll('.nw-card--row')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(container.querySelectorAll('.nw-card--row')).toHaveLength(7)
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('sem "Carregar mais" quando cabem as linhas; com so 1 noticia nao ha coluna "Anteriores"', async () => {
    setup({ manualNews: [FEATURED], automaticNews: [] })
    const { container } = await renderLoaded()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
    expect(container.querySelector('.nw-aside')).toBeNull()
  })

  it('vazio: EmptyState "Nenhuma notícia publicada"', async () => {
    setup({ manualNews: [], automaticNews: [] })
    const { container } = render(<NewsPage />)
    await waitFor(() => expect(screen.getByText('Nenhuma notícia publicada')).toBeInTheDocument())
    expect(container.querySelector('.surface--news-desktop .empty-state')).not.toBeNull()
  })

  it('carregando: skeleton no formato do destaque + linhas', () => {
    mockListNews.mockReturnValue(new Promise(() => {}))
    mockListExternalNews.mockReturnValue(new Promise(() => {}))
    const { container } = render(<NewsPage />)
    expect(container.querySelector('.nw-grid[aria-busy="true"]')).not.toBeNull()
    expect(container.querySelector('.nw-card--featured.nw-card--skeleton')).not.toBeNull()
    expect(container.querySelectorAll('.nw-card--row.nw-card--skeleton')).toHaveLength(3)
    expect(container.querySelector('.skeleton')).not.toBeNull()
  })

  it('erro ao carregar: error-banner continua aparecendo', async () => {
    mockListNews.mockRejectedValueOnce(new Error('boom'))
    mockListExternalNews.mockResolvedValue([])
    render(<NewsPage />)
    expect(await screen.findByText(/Não foi possível carregar as notícias/i)).toBeInTheDocument()
  })
})

describe('F5a Noticias - detalhe (modal bare de 22px)', () => {
  async function openFeatured() {
    const user = userEvent.setup()
    const view = await renderLoaded()
    await user.click(view.container.querySelector('.nw-card--featured .nw-card__link'))
    const dialog = await screen.findByRole('dialog', { name: 'Detalhes da noticia' })
    return { user, dialog, ...view }
  }

  it('capa, fonte + data, titulo (h2), texto, galeria, "Arquivos anexos" e "Referências"', async () => {
    const { dialog } = await openFeatured()
    expect(dialog.querySelector('.modal__header')).toBeNull()
    expect(dialog.querySelector('.nw-detail__cover-image')).toHaveAttribute('src', 'https://example.com/n-1.jpg')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Novo visual do Portal COMEX' })).toHaveClass('nw-detail__title')
    expect(dialog.querySelector('.nw-source')).toHaveTextContent('Portal COMEX')
    expect(dialog.querySelector('.nw-card__time').textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(dialog.querySelector('.nw-detail__text')).toHaveTextContent('Texto completo de Novo visual do Portal COMEX.')
    expect(dialog.querySelectorAll('.nw-detail__gallery-image')).toHaveLength(1)
    expect(within(dialog).getByText('Arquivos anexos')).toHaveClass('nw-detail__label')
    const file = within(dialog).getByRole('link', { name: /guia\.pdf/ })
    expect(file).toHaveAttribute('download', 'guia.pdf')
    expect(file).toHaveAttribute('href', 'https://example.com/guia.pdf')
    expect(within(dialog).getByText('Referências')).toHaveClass('nw-detail__label')
    expect(within(dialog).getByRole('link', { name: 'https://example.com/ref1' })).toHaveAttribute('target', '_blank')
    expect(within(dialog).getByRole('link', { name: 'https://example.com/ref2' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: 'Abrir fonte oficial' })).toBeNull()
  })

  it('"Fechar" (x de 44 sobre a capa) e Esc fecham o modal', async () => {
    const { user } = await openFeatured()
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(document.querySelector('.nw-card--featured .nw-card__link'))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('clicar no scrim fecha', async () => {
    const { user } = await openFeatured()
    await user.click(document.querySelector('.modal-backdrop'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('noticia automatica com externalUrl: "Abrir fonte oficial" e fonte externa; sem capa usa a padrao', async () => {
    setup({ manualNews: [], automaticNews: [automatic('e-1', 'Portaria nova', 10)] })
    const user = userEvent.setup()
    const { container } = await renderLoaded()
    await user.click(container.querySelector('.nw-card--featured .nw-card__link'))
    const dialog = await screen.findByRole('dialog', { name: 'Detalhes da noticia' })
    expect(within(dialog).getByRole('link', { name: 'Abrir fonte oficial' })).toHaveAttribute('href', 'https://siscomex.gov.br/portaria/123')
    expect(dialog.querySelector('.nw-source')).toHaveClass('nw-source--ext')
    expect(dialog.querySelector('.nw-detail__cover')).toHaveClass('nw-detail__cover--empty')
    // sem conteudo: o texto cai no resumo
    expect(dialog.querySelector('.nw-detail__text')).toHaveTextContent('Resumo de Portaria nova.')
  })
})

describe('F5a Noticias - editor (admin)', () => {
  async function openEditor(index = 0) {
    const user = userEvent.setup()
    const view = await renderLoaded()
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[index])
    await screen.findByRole('heading', { name: 'Editar notícia' })
    return { user, ...view }
  }

  it('editar: cabecalho com eyebrow + h3, "Voltar para lista" fantasma, "Excluir notícia" secundario e todos os campos', async () => {
    const { container } = await openEditor()
    expect(container.querySelector('.nw-editor')).not.toBeNull()
    expect(container.querySelector('.nw-head--editor .nw-head__eyebrow')).toHaveTextContent('COMEX · MERCADO · OPERAÇÃO')
    expect(screen.getByRole('button', { name: 'Voltar para lista' })).toHaveClass('ghost-button')
    expect(screen.getByRole('button', { name: 'Excluir notícia' })).toHaveClass('secondary-button')
    expect(screen.getByLabelText('Título')).toHaveValue('Novo visual do Portal COMEX')
    expect(screen.getByLabelText('Texto')).toHaveValue('Texto completo de Novo visual do Portal COMEX.')
    expect(screen.getByLabelText('Imagem de capa')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Anexos/)).toBeInTheDocument()
    expect(screen.getByLabelText('Referências')).toHaveValue('https://example.com/ref1\nhttps://example.com/ref2')
    expect(screen.getByRole('button', { name: 'Remover capa' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toHaveClass('primary-button')
  })

  it('nova noticia: "Publicar notícia", sem "Excluir notícia" e sem "Remover capa"', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Nova notícia' }))
    expect(await screen.findByRole('heading', { name: 'Publicar notícia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar notícia' })).toHaveClass('primary-button')
    expect(screen.queryByRole('button', { name: 'Excluir notícia' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover capa' })).toBeNull()
  })

  it('"Remover capa" limpa a previa; anexo ja salvo aparece com "Remover"', async () => {
    const user = userEvent.setup()
    await openEditor()
    expect(document.querySelector('.news-image-preview img')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Remover capa' }))
    expect(document.querySelector('.news-image-preview')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Remover' }).length).toBeGreaterThan(0)
  })

  it('salvar chama saveNewsItem com o rascunho e volta para a lista', async () => {
    mockResolveCover.mockResolvedValue({ url: 'https://example.com/n-1.jpg', storagePath: '', name: '', mimeType: '', size: null, uploadedAt: '' })
    mockResolveMedia.mockResolvedValue([])
    mockSaveNewsItem.mockResolvedValue({ id: 'n-1', title: 'Titulo novo' })
    const user = userEvent.setup()
    await openEditor()
    const title = screen.getByLabelText('Título')
    await user.clear(title)
    await user.type(title, 'Titulo novo')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mockSaveNewsItem).toHaveBeenCalledTimes(1))
    expect(mockSaveNewsItem.mock.calls[0][0]).toMatchObject({ id: 'n-1', title: 'Titulo novo' })
    await waitFor(() => expect(document.querySelector('.nw-grid')).not.toBeNull())
  })

  it('"Voltar para lista" volta para o destaque + Anteriores', async () => {
    const user = userEvent.setup()
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Voltar para lista' }))
    expect(document.querySelector('.nw-grid')).not.toBeNull()
    expect(document.querySelector('.nw-editor')).toBeNull()
  })

  it('excluir: confirmacao (alertdialog) e removeNewsItem com o id', async () => {
    mockRemoveNewsItem.mockResolvedValue(undefined)
    const user = userEvent.setup()
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Excluir notícia' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir notícia' }))
    await waitFor(() => expect(mockRemoveNewsItem).toHaveBeenCalledTimes(1))
    expect(mockRemoveNewsItem.mock.calls[0][0].id).toBe('n-1')
  })
})
