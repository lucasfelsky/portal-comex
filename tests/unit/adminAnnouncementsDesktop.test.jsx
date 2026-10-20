// Refino F6a: arvore DESKTOP do painel Comunicados (AdminComunicados.dc.html). O desktop e escolhido por
// matchMedia('(min-width: 1041px)'); a arvore legada (tablet/mobile) segue coberta por
// tests/ui/AdminAnnouncementsPanel.test.jsx (matchMedia falso = legado). Fica em tests/unit para nao
// entrar na contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockListAnnouncements = vi.fn()
const mockSaveAnnouncement = vi.fn()
const mockRemoveAnnouncement = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/lib/firebase', () => ({ isFirebaseConfigured: false }))
vi.mock('../../src/services/announcementsRepository', () => ({
  listAnnouncements: (...args) => mockListAnnouncements(...args),
  saveAnnouncement: (...args) => mockSaveAnnouncement(...args),
  removeAnnouncement: (...args) => mockRemoveAnnouncement(...args),
}))

import AdminAnnouncementsPanel from '../../src/features/admin/AdminAnnouncementsPanel'

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

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

// datas LOCAIS montadas a mao (nunca toISOString)
function localIso(daysAgo, hour, minute) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  return date
}

const LONG_CONTENT =
  'A partir da próxima semana o horário de corte para solicitar coletas no mesmo dia passa das 15h para as 14h. Pedidos enviados depois desse horário serão agendados para o dia útil seguinte.'

function announcements() {
  return [
    { id: 'a-1', title: 'Manutencao programada', content: 'Sistema em manutencao sabado das 02h as 06h.', channel: 'Operação', updatedAt: localIso(0, 8, 30) },
    { id: 'a-2', title: 'Nova funcionalidade', content: 'Disponibilizamos o modulo de relatorios.', channel: 'Banner interno', updatedAt: localIso(1, 15, 5) },
    { id: 'a-3', title: 'Mudança no horário de corte', content: LONG_CONTENT, channel: 'Sistema', updatedAt: localIso(9, 11, 0) },
  ]
}

function renderPanel() {
  return render(<AdminAnnouncementsPanel />)
}

const rows = (container) => [...container.querySelectorAll('.ac-row')]
const rowOf = (container, text) => rows(container).find((row) => row.textContent.includes(text))

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListAnnouncements.mockReset()
  mockSaveAnnouncement.mockReset()
  mockRemoveAnnouncement.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockListAnnouncements.mockResolvedValue(announcements())
  mockSaveAnnouncement.mockImplementation((item) => Promise.resolve({ ...item, id: item.id || 'new-1' }))
  mockRemoveAnnouncement.mockResolvedValue(undefined)
  media = installMatchMedia(true)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('AdminComunicados - desktop (>= 1041px): estrutura e lista', () => {
  it('raiz .admin-panel--announcements: titulo (h3), subtitulo, "Novo comunicado" e as duas colunas', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    expect(container.querySelector('.admin-panel.admin-panel--announcements')).not.toBeNull()
    expect(container.querySelector('.list-card')).toBeNull()
    expect(container.querySelector('.announcement-grid')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Comunicados internos' })).toBeInTheDocument()
    expect(screen.getByText('Avisos exibidos no painel inicial da plataforma.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo comunicado' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Publicados' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Editar comunicado' })).toBeInTheDocument()
  })

  it('cartao: canal em etiqueta de informacao, data (Hoje, HH:MM / Ontem / dd/mm), titulo e resumo', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    const pad = (n) => String(n).padStart(2, '0')
    const first = rowOf(container, 'Manutencao programada')
    expect(first.querySelector('.ac-row__channel')).toHaveClass('ad-pill', 'ad-pill--info')
    expect(first.querySelector('.ac-row__channel')).toHaveTextContent('Operação')
    expect(first.querySelector('.ac-row__when')).toHaveTextContent('Hoje, 08:30')
    expect(first.querySelector('.ac-row__title')).toHaveTextContent('Manutencao programada')
    expect(first.querySelector('.ac-row__summary')).toHaveTextContent('Sistema em manutencao sabado das 02h as 06h.')
    expect(rowOf(container, 'Nova funcionalidade').querySelector('.ac-row__when')).toHaveTextContent('Ontem')
    const old = localIso(9, 11, 0)
    expect(rowOf(container, 'Mudança no horário de corte').querySelector('.ac-row__when')).toHaveTextContent(
      `${pad(old.getDate())}/${pad(old.getMonth() + 1)}`
    )
  })

  it('o resumo do cartao e derivado dos 140 primeiros caracteres da mensagem (D10), com reticencias', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    const summary = rowOf(container, 'Mudança no horário de corte').querySelector('.ac-row__summary').textContent
    expect(summary.endsWith('…')).toBe(true)
    expect(summary.length).toBeLessThanOrEqual(141)
    expect(LONG_CONTENT.startsWith(summary.slice(0, -1))).toBe(true)
    // mensagem curta: sem reticencias
    expect(rowOf(container, 'Nova funcionalidade').querySelector('.ac-row__summary').textContent).toBe('Disponibilizamos o modulo de relatorios.')
  })

  it('o primeiro comunicado vem selecionado (classe + aria-current) e o clique troca a selecao e o editor', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    expect(rowOf(container, 'Manutencao programada')).toHaveClass('ac-row--selected')
    expect(rowOf(container, 'Manutencao programada')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByLabelText('Título')).toHaveValue('Manutencao programada')
    await user.click(rowOf(container, 'Nova funcionalidade'))
    expect(rowOf(container, 'Nova funcionalidade')).toHaveClass('ac-row--selected')
    expect(rowOf(container, 'Manutencao programada')).not.toHaveClass('ac-row--selected')
    expect(screen.getByLabelText('Título')).toHaveValue('Nova funcionalidade')
    expect(screen.getByLabelText('Canal')).toHaveValue('Banner interno')
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Disponibilizamos o modulo de relatorios.')
  })

  it('loading inicial: skeleton no formato do cartao', () => {
    let resolveList
    mockListAnnouncements.mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
    const { container } = renderPanel()
    expect(container.querySelector('.ac-row--skeleton .skeleton')).toBeTruthy()
    resolveList([])
  })

  it('erro ao carregar vira error-banner', async () => {
    mockListAnnouncements.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    expect(await screen.findByText(/Não foi possível carregar os comunicados/i)).toBeInTheDocument()
    expect(document.querySelector('.error-banner')).not.toBeNull()
  })

  it('sem comunicados: estado vazio na lista e editor em "Novo comunicado" com "Publicar comunicado"', async () => {
    mockListAnnouncements.mockResolvedValueOnce([])
    const { container } = renderPanel()
    expect(await screen.findByText('Nenhum comunicado publicado')).toBeInTheDocument()
    expect(screen.getByText('Crie o primeiro aviso interno para começar a abastecer o painel.')).toBeInTheDocument()
    expect(container.querySelector('.ac-list .empty-state')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Novo comunicado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar comunicado' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir comunicado' })).not.toBeInTheDocument()
  })
})

describe('AdminComunicados - desktop: editor, resumo e previa', () => {
  it('campos Titulo, Canal (placeholder do mock) e Mensagem; NAO existe campo "Resumo" (D10)', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    expect(screen.getByLabelText('Título')).toHaveAttribute('placeholder', 'Ex.: Atualização operacional do portal')
    expect(screen.getByLabelText('Canal')).toHaveAttribute('placeholder', 'Ex.: Banner interno')
    expect(screen.getByLabelText('Mensagem')).toHaveAttribute('rows', '6')
    expect(screen.queryByLabelText('Resumo')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.ac-editor input, .ac-editor textarea')).toHaveLength(3)
  })

  it('"Novo comunicado" limpa o editor (canal padrao Banner interno) e tira a selecao da lista', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    expect(screen.getByRole('heading', { level: 3, name: 'Novo comunicado' })).toBeInTheDocument()
    expect(screen.getByLabelText('Título')).toHaveValue('')
    expect(screen.getByLabelText('Canal')).toHaveValue('Banner interno')
    expect(screen.getByLabelText('Mensagem')).toHaveValue('')
    expect(container.querySelector('.ac-row--selected')).toBeNull()
  })

  it('contador N/140 da mensagem e dica do resumo; passa de 140 vira aviso', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    const hint = container.querySelector('.ac-hint')
    expect(hint).toHaveTextContent('Os primeiros 140 caracteres viram o resumo da lista e do card do dashboard.')
    expect(hint.querySelector('.ac-hint__count')).toHaveTextContent('0/140')
    await user.type(screen.getByLabelText('Mensagem'), 'abc')
    expect(hint.querySelector('.ac-hint__count')).toHaveTextContent('3/140')
    expect(hint.querySelector('.ac-hint__count')).not.toHaveClass('ac-hint__count--over')
    await user.clear(screen.getByLabelText('Mensagem'))
    await user.click(screen.getByLabelText('Mensagem'))
    await user.paste('x'.repeat(150))
    expect(hint.querySelector('.ac-hint__count')).toHaveTextContent('150/140')
    expect(hint.querySelector('.ac-hint__count')).toHaveClass('ac-hint__count--over')
  })

  it('previa do card do dashboard: "CANAL · Hoje", titulo e resumo derivado; reflete a digitacao', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    const preview = screen.getByRole('group', { name: 'Prévia no dashboard' })
    expect(within(preview).getByText('Prévia no dashboard')).toBeInTheDocument()
    expect(preview.querySelector('.ac-preview__eyebrow')).toHaveTextContent('Operação · Hoje')
    expect(preview.querySelector('.ac-preview__title')).toHaveTextContent('Manutencao programada')
    expect(preview.querySelector('.ac-preview__summary')).toHaveTextContent('Sistema em manutencao sabado das 02h as 06h.')
    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Novo prazo')
    await user.clear(screen.getByLabelText('Canal'))
    await user.type(screen.getByLabelText('Canal'), 'Sistema')
    await user.clear(screen.getByLabelText('Mensagem'))
    await user.click(screen.getByLabelText('Mensagem'))
    await user.paste(LONG_CONTENT)
    expect(preview.querySelector('.ac-preview__eyebrow')).toHaveTextContent('Sistema · Hoje')
    expect(preview.querySelector('.ac-preview__title')).toHaveTextContent('Novo prazo')
    const summary = preview.querySelector('.ac-preview__summary').textContent
    expect(summary.endsWith('…')).toBe(true)
    expect(summary.length).toBeLessThanOrEqual(141)
  })

  it('previa vazia: titulo e resumo de exemplo; sem canal so aparece "Hoje"', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    await user.clear(screen.getByLabelText('Canal'))
    const preview = screen.getByRole('group', { name: 'Prévia no dashboard' })
    expect(preview.querySelector('.ac-preview__eyebrow')).toHaveTextContent(/^Hoje$/)
    expect(preview.querySelector('.ac-preview__title')).toHaveTextContent('Título do comunicado')
    expect(preview.querySelector('.ac-preview__summary')).toHaveTextContent('O resumo aparece aqui, a partir da mensagem.')
  })
})

describe('AdminComunicados - desktop: publicar, salvar e excluir', () => {
  it('Publicar (novo): saveAnnouncement(draft sem id, profile)', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    await user.type(screen.getByLabelText('Título'), 'Aviso novo')
    await user.type(screen.getByLabelText('Mensagem'), 'Corpo do aviso.')
    await user.click(screen.getByRole('button', { name: 'Publicar comunicado' }))
    await waitFor(() => expect(mockSaveAnnouncement).toHaveBeenCalledTimes(1))
    const [draft, profile] = mockSaveAnnouncement.mock.calls[0]
    expect(profile).toEqual(PROFILE)
    expect(draft).toMatchObject({ id: '', title: 'Aviso novo', content: 'Corpo do aviso.', channel: 'Banner interno' })
  })

  it('Salvar (existente): saveAnnouncement com o id e os campos editados', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    const title = screen.getByLabelText('Título')
    await user.clear(title)
    await user.type(title, 'Titulo editado')
    await user.click(screen.getByRole('button', { name: 'Salvar comunicado' }))
    await waitFor(() => expect(mockSaveAnnouncement).toHaveBeenCalledTimes(1))
    expect(mockSaveAnnouncement.mock.calls[0][0]).toMatchObject({ id: 'a-1', title: 'Titulo editado' })
  })

  it('o botao fica "Salvando..." e desabilitado enquanto grava', async () => {
    const user = userEvent.setup()
    let resolveSave
    mockSaveAnnouncement.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Salvar comunicado' }))
    const saving = await screen.findByRole('button', { name: 'Salvando...' })
    expect(saving).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Excluir comunicado' })).toBeDisabled()
    await act(async () => resolveSave({ id: 'a-1', title: 'x', content: '', channel: '' }))
  })

  it('erro ao salvar aparece no error-banner', async () => {
    const user = userEvent.setup()
    mockSaveAnnouncement.mockRejectedValueOnce(new Error('boom'))
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Salvar comunicado' }))
    expect(await screen.findByText(/Não foi possível salvar o comunicado/i)).toBeInTheDocument()
  })

  it('rodape: "Excluir comunicado" (fantasma de perigo) a esquerda e o primario a direita; so existe com comunicado salvo', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    const footer = container.querySelector('.ac-editor .ad-footer')
    const buttons = [...footer.querySelectorAll('button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['Excluir comunicado', 'Salvar comunicado'])
    expect(buttons[0]).toHaveClass('ghost-button', 'ad-delete')
    expect(buttons[1]).toHaveClass('primary-button')
  })

  it('Excluir: confirmacao (foco no Cancelar), Cancelar nao remove, confirmar chama removeAnnouncement', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Excluir comunicado' }))
    let dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    expect(within(dialog).getByText(/Manutencao programada/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockRemoveAnnouncement).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Excluir comunicado' }))
    dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    await user.click(within(dialog).getByRole('button', { name: 'Excluir comunicado' }))
    await waitFor(() => expect(mockRemoveAnnouncement).toHaveBeenCalledWith('a-1', PROFILE))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('falha ao excluir: o dialogo continua aberto com o erro dentro', async () => {
    const user = userEvent.setup()
    mockRemoveAnnouncement.mockRejectedValueOnce(new Error('boom'))
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Excluir comunicado' }))
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    await user.click(within(dialog).getByRole('button', { name: 'Excluir comunicado' }))
    await waitFor(() => {
      expect(within(screen.getByRole('alertdialog')).getByText(/Não foi possível remover o comunicado/i)).toBeInTheDocument()
    })
  })
})

describe('AdminComunicados - troca ao vivo entre arvores (1041px)', () => {
  it('o rascunho digitado sobrevive a troca desktop <-> tablet', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    await user.type(screen.getByLabelText('Título'), 'Rascunho vivo')
    await user.type(screen.getByLabelText('Mensagem'), 'Texto em andamento')

    media.setDesktop(false)
    expect(container.querySelector('.admin-panel--announcements')).toBeNull()
    expect(container.querySelector('.announcement-grid')).not.toBeNull()
    expect(screen.getByDisplayValue('Rascunho vivo')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Texto em andamento')).toBeInTheDocument()

    media.setDesktop(true)
    expect(container.querySelector('.admin-panel--announcements')).not.toBeNull()
    expect(container.querySelector('.announcement-grid')).toBeNull()
    expect(screen.getByLabelText('Título')).toHaveValue('Rascunho vivo')
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Texto em andamento')
    expect(screen.getByRole('heading', { level: 3, name: 'Novo comunicado' })).toBeInTheDocument()
  })

  it('o dialogo de exclusao aberto sobrevive a troca e nao deixa listener preso ao desmontar', async () => {
    const user = userEvent.setup()
    const { container, unmount } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Excluir comunicado' }))
    await screen.findByRole('alertdialog')
    media.setDesktop(false)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    media.setDesktop(true)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('tablet/mobile: a arvore anterior segue intacta (list-card, announcement-card, botao Remover)', async () => {
    media = installMatchMedia(false)
    const { container } = renderPanel()
    await screen.findByText('Manutencao programada')
    expect(container.querySelector('.announcement-grid')).not.toBeNull()
    expect(container.querySelectorAll('.announcement-card--button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
    expect(container.querySelector('.ac-root')).toBeNull()
    expect(container.querySelector('.ac-row')).toBeNull()
  })
})
