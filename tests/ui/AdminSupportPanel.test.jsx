// Testes do AdminSupportPanel — thread de respostas (suporte v3, 2026-08-11).
// Cobre:
//   - Thread existente (ticket.replies) é renderizada
//   - Digitar + "Enviar resposta" chama addSupportTicketReply(ticketId, texto, profile)
//     e NAO chama updateSupportTicket
//   - Erro do repositorio ao enviar resposta mostra error-banner

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockListAllSupportTickets = vi.fn()
const mockUpdateSupportTicket = vi.fn()
const mockAddSupportTicketReply = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: false,
}))
vi.mock('../../src/services/supportTicketsRepository', () => ({
  SUPPORT_TICKET_STATUS_LABELS: {
    aberto: 'Aberto',
    em_andamento: 'Em andamento',
    resolvido: 'Resolvido',
  },
  SUPPORT_TICKET_STATUS_TONES: {
    aberto: 'warn',
    em_andamento: 'info',
    resolvido: 'ok',
  },
  SUPPORT_TICKET_MAX_REPLY_LENGTH: 1000,
  listAllSupportTickets: (...args) => mockListAllSupportTickets(...args),
  updateSupportTicket: (...args) => mockUpdateSupportTicket(...args),
  addSupportTicketReply: (...args) => mockAddSupportTicketReply(...args),
}))

import AdminSupportPanel from '../../src/features/admin/AdminSupportPanel'

const PROFILE = { uid: 'admin-1', name: 'Admin Root', email: 'admin@sqquimica.com', role: 'admin' }

const TICKET = {
  id: 'ticket-1',
  authorId: 'user-1',
  authorName: 'Joana Compradora',
  authorEmail: 'joana@sqquimica.com',
  message: 'O dashboard não carrega os processos desde hoje cedo.',
  imageUrls: [],
  status: 'aberto',
  priority: 3,
  createdAt: '2026-08-10T09:00:00.000Z',
  updatedAt: '2026-08-10T09:00:00.000Z',
  resolvedAt: null,
  resolvedByName: null,
  resolutionMessage: null,
  contextPage: null,
  contextProcessId: null,
  contextProcessName: null,
  replies: [
    {
      id: 'reply-1',
      authorId: 'admin-1',
      authorName: 'Admin Root',
      message: 'Estamos verificando, já retornamos.',
      createdAt: '2026-08-10T10:00:00.000Z',
    },
  ],
}

function renderPanel() {
  return render(<AdminSupportPanel />)
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListAllSupportTickets.mockReset()
  mockUpdateSupportTicket.mockReset()
  mockAddSupportTicketReply.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockListAllSupportTickets.mockResolvedValue([TICKET])
  mockUpdateSupportTicket.mockResolvedValue(null)
  mockAddSupportTicketReply.mockImplementation((ticketId, message, actor) =>
    Promise.resolve({
      id: 'reply-2',
      authorId: actor?.uid,
      authorName: actor?.name,
      message,
      createdAt: new Date().toISOString(),
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminSupportPanel — thread de respostas', () => {
  it('thread existente e renderizada', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Estamos verificando, já retornamos.')).toBeInTheDocument()
    })
  })

  it('digitar + "Enviar resposta" chama addSupportTicketReply e NAO updateSupportTicket', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Estamos verificando, já retornamos.')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Escreva uma resposta para o usuário')
    await user.type(textarea, 'Já identificamos a causa.')
    await user.click(screen.getByRole('button', { name: /Enviar resposta/i }))

    await waitFor(() => {
      expect(mockAddSupportTicketReply).toHaveBeenCalledTimes(1)
    })
    expect(mockAddSupportTicketReply).toHaveBeenCalledWith(
      'ticket-1',
      'Já identificamos a causa.',
      PROFILE
    )
    expect(mockUpdateSupportTicket).not.toHaveBeenCalled()
  })

  it('erro do repositorio ao enviar resposta mostra error-banner', async () => {
    const user = userEvent.setup()
    mockAddSupportTicketReply.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText('Estamos verificando, já retornamos.')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Escreva uma resposta para o usuário')
    await user.type(textarea, 'Já identificamos a causa.')
    await user.click(screen.getByRole('button', { name: /Enviar resposta/i }))

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível enviar a resposta/i)).toBeInTheDocument()
    })
  })
})
