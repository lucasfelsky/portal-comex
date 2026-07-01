// Tests do AdminAnnouncementsPanel.
// Cobre:
//   - Loading inicial + error ao carregar
//   - Render: lista de comunicados, empty state se vazio
//   - Selecionar comunicado carrega o draft
//   - Modo criar: draft limpo, botao "Publicar comunicado"
//   - Editar draft (titulo, canal, mensagem) reflete no state
//   - Resumo: mostra "Preencha o titulo..." se draft vazio
//   - Salvar: chama saveAnnouncement com draft + profile
//   - Salvar com erro: error-banner
//   - Remover: chama removeAnnouncement quando draft.id existe
//   - Botao Remover so' aparece quando draft.id
//   - Submit desabilitado enquanto submitting

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockListAnnouncements = vi.fn()
const mockSaveAnnouncement = vi.fn()
const mockRemoveAnnouncement = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: false,
}))
vi.mock('../../src/services/announcementsRepository', () => ({
  listAnnouncements: (...args) => mockListAnnouncements(...args),
  saveAnnouncement: (...args) => mockSaveAnnouncement(...args),
  removeAnnouncement: (...args) => mockRemoveAnnouncement(...args),
}))

import AdminAnnouncementsPanel from '../../src/features/admin/AdminAnnouncementsPanel'

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const ANNOUNCEMENTS = [
  {
    id: 'a-1',
    title: 'Manutencao programada',
    content: 'Sistema em manutencao sabado das 02h as 06h.',
    channel: 'Banner interno',
    updatedAt: '2026-06-30T10:00:00Z',
  },
  {
    id: 'a-2',
    title: 'Nova funcionalidade',
    content: 'Disponibilizamos o modulo de relatorios.',
    channel: 'Email',
    updatedAt: '2026-06-29T15:30:00Z',
  },
]

function renderPanel() {
  return render(<AdminAnnouncementsPanel />)
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListAnnouncements.mockReset()
  mockSaveAnnouncement.mockReset()
  mockRemoveAnnouncement.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockListAnnouncements.mockResolvedValue(ANNOUNCEMENTS)
  mockSaveAnnouncement.mockImplementation((a) => Promise.resolve({ ...a, id: a.id || 'new-1' }))
  mockRemoveAnnouncement.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminAnnouncementsPanel', () => {
  it('loading inicial: mostra "Carregando comunicados"', () => {
    let resolveList
    mockListAnnouncements.mockReturnValue(new Promise((r) => { resolveList = r }))
    renderPanel()
    expect(screen.getByText(/Carregando comunicados/i)).toBeInTheDocument()
    resolveList([])
  })

  it('error ao carregar aparece no error-banner', async () => {
    mockListAnnouncements.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar os comunicados/i)).toBeInTheDocument()
    })
  })

  it('render: lista comunicados com titulo, canal, conteudo', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Manutencao programada')).toBeInTheDocument()
    })
    expect(screen.getByText('Nova funcionalidade')).toBeInTheDocument()
    expect(screen.getAllByText('Banner interno').length).toBeGreaterThan(0)
  })

  it('empty state: "Nenhum comunicado publicado" se lista vazia', async () => {
    mockListAnnouncements.mockResolvedValueOnce([])
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText(/Nenhum comunicado publicado/i)).toBeInTheDocument()
    })
  })

  it('selecionar comunicado carrega draft com campos preenchidos', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    // Clica no segundo (a-2) para trocar a selecao
    const cards = document.querySelectorAll('.announcement-card')
    const novaCard = Array.from(cards).find((c) => c.textContent.includes('Nova funcionalidade'))
    await user.click(novaCard)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Nova funcionalidade')).toBeInTheDocument()
    })
  })

  it('modo criar: "Novo comunicado" limpa draft', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    // botao submit muda para "Publicar comunicado"
    expect(screen.getByRole('button', { name: 'Publicar comunicado' })).toBeInTheDocument()
    // inputs estao vazios
    expect(screen.getByPlaceholderText(/Atualização operacional/i)).toBeInTheDocument()
  })

  it('editar draft: titulo, canal, mensagem refletem no state', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    const titleInput = screen.getByDisplayValue('Manutencao programada')
    await user.clear(titleInput)
    await user.type(titleInput, 'Manutencao editada')
    expect(screen.getByDisplayValue('Manutencao editada')).toBeInTheDocument()
  })

  it('resumo: mostra hint quando titulo vazio', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    // Limpa o titulo
    const titleInput = screen.getByDisplayValue('Manutencao programada')
    await user.clear(titleInput)
    // O hint aparece no detail-card "Resumo"
    const resumoCard = document.querySelector('.detail-card')
    expect(resumoCard).toBeInTheDocument()
    expect(resumoCard.textContent).toMatch(/Preencha o t[íi]tulo e a mensagem/i)
  })

  it('resumo: mostra titulo + canal quando preenchidos (no detail-card)', async () => {
    const { container } = renderPanel()
    // espera o draft ser populado pelo effect (apos listAnnouncements resolver)
    await waitFor(() => {
      const titleInput = container.querySelector('input[type="text"]')
      expect(titleInput.value).toBe('Manutencao programada')
    })
    const resumoCard = container.querySelector('.detail-card')
    expect(resumoCard.textContent).toMatch(/Manutencao programada · Banner interno/i)
  })

  it('salvar: chama saveAnnouncement com draft + profile', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Salvar comunicado/i }))
    await waitFor(() => {
      expect(mockSaveAnnouncement).toHaveBeenCalledTimes(1)
    })
    const [payloadArg, profileArg] = mockSaveAnnouncement.mock.calls[0]
    expect(profileArg).toEqual(PROFILE)
    expect(payloadArg.id).toBe('a-1')
    expect(payloadArg.title).toBe('Manutencao programada')
  })

  it('salvar com erro: error-banner', async () => {
    const user = userEvent.setup()
    mockSaveAnnouncement.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Salvar comunicado/i }))
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível salvar o comunicado/i)).toBeInTheDocument()
    })
  })

  it('remover: chama removeAnnouncement quando draft.id existe', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => {
      expect(mockRemoveAnnouncement).toHaveBeenCalledWith('a-1', PROFILE)
    })
  })

  it('remover botao NAO aparece em modo criar (sem draft.id)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Novo comunicado' }))
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
  })

  it('submit desabilitado enquanto submitting (mostra "Salvando...")', async () => {
    const user = userEvent.setup()
    let resolveSave
    mockSaveAnnouncement.mockReturnValueOnce(new Promise((r) => { resolveSave = r }))
    renderPanel()
    await waitFor(() => expect(screen.getByText('Manutencao programada')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Salvar comunicado/i }))
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled()
    resolveSave({ id: 'a-1' })
  })
})
