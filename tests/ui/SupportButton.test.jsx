// UX-3b (D10): validacao inline do modal de suporte - mensagem vazia/so-
// espacos bloqueia com erro no textarea (nao chama o repositorio); mais de
// 5 prints vira erro inline no input de arquivo (nao mais toast).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { ToastProvider } from '../../src/components/Toast'

const mockUseAuth = vi.fn()
const mockCreateSupportTicket = vi.fn()
const mockListMySupportTickets = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/services/supportTicketsRepository', () => ({
  SUPPORT_TICKET_MAX_IMAGES: 5,
  SUPPORT_TICKET_MAX_MESSAGE_LENGTH: 4000,
  SUPPORT_TICKET_STATUS_LABELS: { aberto: 'Aberto', resolvido: 'Resolvido' },
  SUPPORT_TICKET_STATUS_TONES: { aberto: 'warn', resolvido: 'ok' },
  createSupportTicket: (...args) => mockCreateSupportTicket(...args),
  listMySupportTickets: (...args) => mockListMySupportTickets(...args),
}))
vi.mock('../../src/utils/activeProcessContext', () => ({
  getActiveProcess: () => null,
  setActiveProcess: () => {},
  clearActiveProcess: () => {},
}))

import SupportButton from '../../src/components/SupportButton'

function renderSupportButton() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <SupportButton />
      </ToastProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockCreateSupportTicket.mockReset()
  mockListMySupportTickets.mockReset()
  mockUseAuth.mockReturnValue({
    profile: { uid: 'u-1', name: 'Usuario Teste', email: 'user@sqquimica.com', role: 'user' },
  })
  mockListMySupportTickets.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

async function openModal(user) {
  await user.click(screen.getByRole('button', { name: 'Abrir suporte' }))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
}

describe('SupportButton — validacao inline (UX-3b)', () => {
  it('mensagem so com espacos: erro inline no textarea, foco nele, createSupportTicket NAO chamado', async () => {
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)

    const textarea = screen.getByLabelText('O que aconteceu?')
    await user.type(textarea, '   ')
    await user.click(screen.getByRole('button', { name: 'Enviar chamado' }))

    await waitFor(() => {
      expect(screen.getByText('Descreva o que aconteceu antes de enviar o chamado.')).toBeInTheDocument()
    })
    expect(mockCreateSupportTicket).not.toHaveBeenCalled()
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(textarea)
  })

  it('mais de 5 arquivos: erro inline no input de arquivo, nenhum toast', async () => {
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)

    // Modal renderiza via portal em document.body - fora do `container` do render.
    const fileInput = document.querySelector('input[type="file"]')
    const files = Array.from({ length: 6 }, (_, index) => new File(['x'], `print-${index}.png`, { type: 'image/png' }))
    await user.upload(fileInput, files)

    await waitFor(() => {
      expect(screen.getByText(/Anexe no máximo 5 imagens/)).toBeInTheDocument()
    })
    expect(document.querySelector('.toast')).not.toBeInTheDocument()
  })

  it('mensagem valida: createSupportTicket chamado 1x', async () => {
    const user = userEvent.setup()
    mockCreateSupportTicket.mockResolvedValue({
      id: 'ticket-1',
      status: 'aberto',
      message: 'Deu erro ao salvar',
      replies: [],
      createdAt: '2026-09-01T10:00:00.000Z',
    })
    renderSupportButton()
    await openModal(user)

    await user.type(screen.getByLabelText('O que aconteceu?'), 'Deu erro ao salvar')
    await user.click(screen.getByRole('button', { name: 'Enviar chamado' }))

    await waitFor(() => expect(mockCreateSupportTicket).toHaveBeenCalledTimes(1))
  })
})
