// UX-3b (D10): validacao inline do modal de suporte - mensagem vazia/so-
// espacos bloqueia com erro no textarea (nao chama o repositorio); mais de
// 5 prints vira erro inline no input de arquivo (nao mais toast).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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

import SupportButton, { OPEN_SUPPORT_MODAL_EVENT } from '../../src/components/SupportButton'

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
  const dialog = await screen.findByRole('dialog')

  // O Modal (src/components/Modal.jsx) agenda o foco inicial num
  // `window.setTimeout(..., 30)` apos montar. UX-6a (item 7): o foco vai
  // pro textarea via `initialFocusRef` (era o botao "Fechar" padrao). Se a
  // interacao do teste comecar ANTES desse timeout disparar, ele pode
  // roubar o foco NO MEIO da digitacao em runners mais lentos (CI),
  // derrubando caracteres do textarea e deixando a mensagem vazia — daí
  // `createSupportTicket` nao ser chamado. Espera o foco inicial assentar
  // dentro do dialog antes de seguir, em vez de so aumentar timeout.
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
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

describe('SupportButton — UX-6a', () => {
  it('abre com foco no textarea "O que aconteceu?"', async () => {
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('O que aconteceu?'))
    )
  })

  it('uploader de prints em PT-BR: "Adicionar imagens" e "Nenhuma imagem selecionada"', async () => {
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Adicionar imagens')).toBeInTheDocument()
    expect(within(dialog).getByText('Nenhuma imagem selecionada')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Refino visual F2 (Flutuantes.dc.html): no desktop o modal e' o cartao do
// mock — "Meus chamados" ALTERNA com o formulario, campos Nome/Email somente
// leitura (D9), chip "Contexto anexado" e "Cancelar". Tablet/mobile (<=1040px)
// mantem o modal anterior (formulario + historico empilhados).
// ---------------------------------------------------------------------------
describe('SupportButton — refino F2 (desktop)', () => {
  const TICKET = {
    id: 't-1',
    status: 'aberto',
    message: 'Chamado antigo do usuario',
    replies: [],
    createdAt: '2026-09-01T10:00:00.000Z',
  }

  it('FAB: pilula com o icone de chat e o texto "Suporte"', () => {
    renderSupportButton()
    const fab = screen.getByRole('button', { name: 'Abrir suporte' })
    expect(fab).toHaveClass('support-fab__trigger')
    expect(fab).toHaveTextContent('Suporte')
    expect(fab.querySelector('svg')).not.toBeNull()
  })

  it('placeholder do desktop = texto do mock-up', async () => {
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)
    expect(screen.getByLabelText('O que aconteceu?')).toHaveAttribute(
      'placeholder',
      'Conte o que você tentou fazer e o que apareceu na tela.'
    )
  })

  it('cabecalho "Suporte" + link "Meus chamados"; Nome e Email somente leitura', async () => {
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('support-modal-shell')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Suporte' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Meus chamados' })).toBeInTheDocument()

    const name = within(dialog).getByLabelText('Nome')
    const email = within(dialog).getByLabelText('Email')
    expect(name).toHaveValue('Usuario Teste')
    expect(email).toHaveValue('user@sqquimica.com')
    expect(name).toHaveAttribute('readonly')
    expect(email).toHaveAttribute('readonly')
    // sem o paragrafo de apoio nem o historico empilhado do modal antigo
    expect(within(dialog).queryByText(/Encontrou um erro ou comportamento estranho/)).toBeNull()
    expect(within(dialog).queryByRole('heading', { name: 'Meus chamados' })).toBeNull()
  })

  it('chip "Contexto anexado: <página>" usa a rota atual', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/processos']}>
        <ToastProvider>
          <SupportButton />
        </ToastProvider>
      </MemoryRouter>
    )
    await openModal(user)
    expect(screen.getByRole('dialog')).toHaveTextContent('Contexto anexado: Central de chegadas')
  })

  it('"Meus chamados" alterna para o historico e "Novo chamado" volta ao formulario (texto digitado fica)', async () => {
    mockListMySupportTickets.mockResolvedValue([TICKET])
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)
    const dialog = screen.getByRole('dialog')

    await user.type(within(dialog).getByLabelText('O que aconteceu?'), 'rascunho')
    await user.click(within(dialog).getByRole('button', { name: 'Meus chamados' }))

    expect(await within(dialog).findByText('Chamado antigo do usuario')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('O que aconteceu?')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Enviar chamado' })).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'Novo chamado' }))
    expect(within(dialog).getByLabelText('O que aconteceu?')).toHaveValue('rascunho')
  })

  it('"Cancelar" fecha o modal', async () => {
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('enviar com sucesso mostra o chamado recem-criado em "Meus chamados"', async () => {
    mockCreateSupportTicket.mockResolvedValue({
      ...TICKET,
      id: 't-new',
      message: 'Deu erro ao salvar',
    })
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)

    await user.type(screen.getByLabelText('O que aconteceu?'), 'Deu erro ao salvar')
    await user.click(screen.getByRole('button', { name: 'Enviar chamado' }))

    expect(await screen.findByText('Deu erro ao salvar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo chamado' })).toBeInTheDocument()
  })

  it('evento de chamado resolvido abre direto em "Meus chamados"', async () => {
    mockListMySupportTickets.mockResolvedValue([TICKET])
    renderSupportButton()
    act(() => {
      window.dispatchEvent(new Event(OPEN_SUPPORT_MODAL_EVENT))
    })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Chamado antigo do usuario')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Novo chamado' })).toBeInTheDocument()
  })
})

describe('SupportButton — tablet/mobile (<=1040px) mantem o modal anterior', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: /max-width:\s*1040px/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('formulario + historico empilhados, identidade em texto e sem "Cancelar"', async () => {
    mockListMySupportTickets.mockResolvedValue([
      { id: 't-1', status: 'aberto', message: 'Chamado antigo', replies: [], createdAt: '2026-09-01T10:00:00.000Z' },
    ])
    const user = userEvent.setup()
    renderSupportButton()
    await openModal(user)
    const dialog = screen.getByRole('dialog')

    expect(dialog).not.toHaveClass('support-modal-shell')
    expect(within(dialog).getByText(/Encontrou um erro ou comportamento estranho/)).toBeInTheDocument()
    expect(within(dialog).getByText('Usuario Teste')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Nome')).toBeNull()
    expect(within(dialog).getByRole('heading', { name: 'Meus chamados' })).toBeInTheDocument()
    expect(await within(dialog).findByText('Chamado antigo')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cancelar' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Novo chamado' })).toBeNull()
    // tablet/mobile mantem o placeholder anterior
    expect(within(dialog).getByLabelText('O que aconteceu?')).toHaveAttribute(
      'placeholder',
      'Descreva o problema: o que você estava fazendo, o que esperava e o que aconteceu.'
    )
  })
})
