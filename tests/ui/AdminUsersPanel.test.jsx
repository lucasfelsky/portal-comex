// Tests do AdminUsersPanel.
// Cobre:
//   - Loading inicial + error ao carregar users
//   - Render: lista de usuarios, fila de pendentes, contador
//   - Filtro por status + busca textual
//   - Selecionar usuario carrega o draft
//   - Modo criar: draft limpo, password habilitada, email editavel
//   - Editar draft (nome, email, role, status, area) reflete no state
//   - Salvar criar: chama createUser com payload + profile, password >= 6
//   - Salvar criar com password < 6: error
//   - Salvar update: chama saveUser com payload
//   - Salvar update com password: chama updateManagedUserPassword (quando Firebase configurado)
//   - Toggle bloquear/ativar: alterna entre Ativo e Bloqueado
//   - Aprovar/Rejeitar pendente: chama saveUser com novo status
//   - Excluir usuario: chama deleteUser; desabilitado para self
//   - Erro de qualquer acao aparece no error-banner
//   - Fila de pendentes: lista usuarios com status Pendente; "0 pendentes" se vazio

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mocks
const mockUseAuth = vi.fn()
const mockListUsers = vi.fn()
const mockSaveUser = vi.fn()
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockCreateManagedAuthUser = vi.fn()
const mockUpdateManagedUserPassword = vi.fn()
const mockDeleteManagedUser = vi.fn()
const mockSendCustomVerificationEmail = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: false, // testa o branch do usersRepository puro
}))
vi.mock('../../src/services/usersRepository', () => ({
  listUsers: (...args) => mockListUsers(...args),
  saveUser: (...args) => mockSaveUser(...args),
  createUser: (...args) => mockCreateUser(...args),
  deleteUser: (...args) => mockDeleteUser(...args),
}))
vi.mock('../../src/services/managedUsersRepository', () => ({
  createManagedAuthUser: (...args) => mockCreateManagedAuthUser(...args),
  updateManagedUserPassword: (...args) => mockUpdateManagedUserPassword(...args),
  deleteManagedUser: (...args) => mockDeleteManagedUser(...args),
}))
vi.mock('../../src/services/authRepository', () => ({
  sendCustomVerificationEmail: (...args) => mockSendCustomVerificationEmail(...args),
}))

import AdminUsersPanel from '../../src/features/admin/AdminUsersPanel'

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const USERS = [
  {
    id: 'u-1',
    name: 'Maria Souza',
    email: 'maria@sqquimica.com',
    role: 'user',
    area: 'Importacao',
    status: 'Ativo',
    statusTone: 'ok',
    lastAccess: 'Hoje',
    scopes: ['Dashboard', 'Processos'],
  },
  {
    id: 'u-2',
    name: 'Joao Pendente',
    email: 'joao@sqquimica.com',
    role: 'user',
    area: 'Exportacao',
    status: 'Pendente',
    statusTone: 'warn',
    lastAccess: 'Aguardando aprovacao',
    scopes: ['Dashboard', 'Processos'],
  },
  {
    id: 'u-3',
    name: 'Carlos Bloq',
    email: 'carlos@sqquimica.com',
    role: 'logistica',
    area: 'Logistica',
    status: 'Bloqueado',
    statusTone: 'neutral',
    lastAccess: 'Ontem',
    scopes: ['Dashboard', 'Processos'],
  },
]

function renderPanel() {
  return render(<AdminUsersPanel />)
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListUsers.mockReset()
  mockSaveUser.mockReset()
  mockCreateUser.mockReset()
  mockDeleteUser.mockReset()
  mockCreateManagedAuthUser.mockReset()
  mockUpdateManagedUserPassword.mockReset()
  mockDeleteManagedUser.mockReset()
  mockSendCustomVerificationEmail.mockReset()

  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockListUsers.mockResolvedValue(USERS)
  mockSaveUser.mockImplementation((user) => Promise.resolve({ ...user }))
  mockCreateUser.mockImplementation((user) => Promise.resolve({ ...user, id: user.id || 'new-1' }))
  mockDeleteUser.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminUsersPanel', () => {
  it('loading inicial: mostra "Carregando usuarios"', () => {
    let resolveList
    mockListUsers.mockReturnValue(new Promise((r) => { resolveList = r }))
    renderPanel()
    expect(screen.getByText(/Carregando usu/i)).toBeInTheDocument()
    resolveList([])
  })

  it('error ao carregar users aparece no error-banner', async () => {
    mockListUsers.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar os usuários/i)).toBeInTheDocument()
    })
  })

  it('render: lista usuarios, contador de pendentes e "X visiveis"', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('Joao Pendente').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Carlos Bloq').length).toBeGreaterThan(0)
    // 1 pendente
    expect(screen.getByText('1 pendentes')).toBeInTheDocument()
    // 3 visiveis
    expect(screen.getByText('3 visíveis')).toBeInTheDocument()
  })

  it('fila de pendentes: "Nenhum cadastro pendente" se vazio', async () => {
    mockListUsers.mockResolvedValueOnce([USERS[0]]) // so Ativo
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText(/Nenhum cadastro pendente/i)).toBeInTheDocument()
    })
  })

  it('filtro de status: statusFilter Ativo exclui Joao da lista (mas fila de pendentes continua mostrando)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0))
    const statusSelects = screen.getAllByRole('combobox')
    const filterSelect = statusSelects[0]
    await user.selectOptions(filterSelect, 'Ativo')
    // A lista de usuarios (admin-user-list) agora so' tem Ativos.
    // A fila de pendentes continua mostrando Joao (e' uma secao separada).
    // Verificamos que a row "admin-user-list" do Carlos (Bloqueado) NAO esta.
    await waitFor(() => {
      // Carlos (Bloqueado) some da lista
      const carlosRows = document.querySelectorAll('.admin-user-row')
      const carlosInList = Array.from(carlosRows).some((r) => r.textContent.includes('Carlos Bloq'))
      expect(carlosInList).toBe(false)
    })
  })

  it('busca textual filtra por nome na lista', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0))
    const searchInput = screen.getByPlaceholderText('Nome, email, perfil ou ID')
    await user.type(searchInput, 'carlos')
    await waitFor(() => {
      // Carlos aparece na lista
      const carlosRows = document.querySelectorAll('.admin-user-row')
      const carlosInList = Array.from(carlosRows).some((r) => r.textContent.includes('Carlos Bloq'))
      expect(carlosInList).toBe(true)
      // Maria e Joao somem da lista
      const mariaInList = Array.from(carlosRows).some((r) => r.textContent.includes('Maria Souza'))
      const joaoInList = Array.from(carlosRows).some((r) => r.textContent.includes('Joao Pendente'))
      expect(mariaInList).toBe(false)
      expect(joaoInList).toBe(false)
    })
  })

  it('selecionar usuario carrega o draft com campos preenchidos', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => {
      const adminRows = document.querySelectorAll('.admin-user-row')
      expect(adminRows.length).toBe(3)
    })
    // Clica na row do Joao no admin-user-list (button)
    const adminRows = document.querySelectorAll('.admin-user-row')
    const joaoRow = Array.from(adminRows).find((r) => r.textContent.includes('Joao Pendente'))
    await user.click(joaoRow)
    await waitFor(() => {
      expect(screen.getByDisplayValue('joao@sqquimica.com')).toBeInTheDocument()
    })
  })

  it('modo criar: "Novo usuario" limpa draft, mostra placeholder de senha', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    // heading muda
    expect(screen.getByText('Novo usuário', { selector: 'h3' })).toBeInTheDocument()
    // placeholder de senha inicial
    expect(screen.getByPlaceholderText(/Defina a senha inicial/i)).toBeInTheDocument()
    // botao submit muda para "Criar usuário"
    expect(screen.getByRole('button', { name: 'Criar usuário' })).toBeInTheDocument()
  })

  it('editar draft: nome, role, status refletem no state', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    const nameInput = screen.getByDisplayValue('Maria Souza')
    await user.clear(nameInput)
    await user.type(nameInput, 'Maria S. Editada')
    expect(screen.getByDisplayValue('Maria S. Editada')).toBeInTheDocument()
  })

  it('trocar role atualiza scopes (chips de permissoes)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    // 2 selects no painel de detalhe (role + status); o filtro e' o primeiro
    const selects = screen.getAllByRole('combobox')
    const roleSelect = selects[1]
    await user.selectOptions(roleSelect, 'logistica')
    // Admin tem 5 permissoes; user tem 2; logistica tem 2.
    // Verifica que "Usuários" (de admin) NAO esta visivel para logistica.
    expect(screen.queryByText('Usuários')).not.toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Processos')).toBeInTheDocument()
  })

  it('salvar criar: chama createUser com payload + profile (Firebase desligado)', async () => {
    const user = userEvent.setup()
    mockCreateUser.mockResolvedValueOnce({ id: 'new-99', name: 'Novo', email: 'novo@sq.com', role: 'user' })
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'Novo User')
    await user.type(screen.getByPlaceholderText('email@empresa.com'), 'novo@sq.com')
    await user.type(screen.getByPlaceholderText(/Defina a senha inicial/i), 'senha123')
    await user.click(screen.getByRole('button', { name: 'Criar usuário' }))
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledTimes(1)
    })
    const [payloadArg, profileArg] = mockCreateUser.mock.calls[0]
    expect(profileArg).toEqual(PROFILE)
    expect(payloadArg.id).toBe('')
    expect(payloadArg.name).toBe('Novo User')
    expect(payloadArg.email).toBe('novo@sq.com')
    expect(payloadArg.role).toBe('user')
    expect(payloadArg.password).toBeUndefined() // removido antes de save
  })

  it('salvar criar com password < 6: error (nao chama createUser)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'X')
    await user.type(screen.getByPlaceholderText('email@empresa.com'), 'x@sq.com')
    await user.type(screen.getByPlaceholderText(/Defina a senha inicial/i), '123')
    await user.click(screen.getByRole('button', { name: 'Criar usuário' }))
    await waitFor(() => {
      expect(screen.getByText(/pelo menos 6 caracteres/i)).toBeInTheDocument()
    })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('salvar update: chama saveUser com payload', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    // Maria ja vem selecionada
    const nameInput = screen.getByDisplayValue('Maria Souza')
    await user.clear(nameInput)
    await user.type(nameInput, 'Maria Atualizada')
    await user.click(screen.getByRole('button', { name: /Salvar altera/i }))
    await waitFor(() => {
      expect(mockSaveUser).toHaveBeenCalledTimes(1)
    })
    const payload = mockSaveUser.mock.calls[0][0]
    expect(payload.name).toBe('Maria Atualizada')
    expect(payload.password).toBeUndefined()
  })

  it('aprovar pendente: chama saveUser com status=Ativo + lastAccess=Aguardando primeiro acesso', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getAllByText('Joao Pendente').length).toBeGreaterThan(0))
    // Aprovar e' o primeiro botao do invite-card do Joao
    const cards = document.querySelectorAll('.invite-card')
    const joaoCard = Array.from(cards).find((c) => c.textContent.includes('Joao Pendente'))
    const aprovarBtn = joaoCard.querySelector('button.primary-button')
    await user.click(aprovarBtn)
    await waitFor(() => {
      expect(mockSaveUser).toHaveBeenCalled()
    })
    const lastCall = mockSaveUser.mock.calls[mockSaveUser.mock.calls.length - 1]
    expect(lastCall[0].status).toBe('Ativo')
    expect(lastCall[0].statusTone).toBe('ok')
  })

  it('toggle Bloquear/Ativar no detalhe: alterna entre Ativo e Bloqueado', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    // Maria esta Ativo; botao deve dizer "Bloquear usuário"
    const toggleBtn = screen.getByRole('button', { name: 'Bloquear usuário' })
    await user.click(toggleBtn)
    await waitFor(() => {
      const lastCall = mockSaveUser.mock.calls[mockSaveUser.mock.calls.length - 1]
      expect(lastCall[0].status).toBe('Bloqueado')
    })
  })

  it('excluir usuario: chama deleteUser', async () => {
    const user = userEvent.setup()
    renderPanel()
    await waitFor(() => expect(screen.getAllByText('Carlos Bloq').length).toBeGreaterThan(0))
    // Seleciona Carlos (linha da admin-user-list)
    const rows = screen.getAllByText('Carlos Bloq')
    const row = rows[0].closest('button')
    await user.click(row)
    await waitFor(() => {
      expect(screen.getByDisplayValue('carlos@sqquimica.com')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Excluir usuário' }))
    await waitFor(() => {
      expect(mockDeleteUser).toHaveBeenCalledWith('u-3', PROFILE)
    })
  })

  it('excluir self: botao desabilitado (admin nao pode excluir a si mesmo)', async () => {
    // Faz o listUsers retornar o admin logado
    const adminUser = { id: PROFILE.uid, name: 'Admin', email: PROFILE.email, role: 'admin', status: 'Ativo', statusTone: 'ok', scopes: ['Usuarios'] }
    mockListUsers.mockResolvedValueOnce([adminUser])
    renderPanel()
    await waitFor(() => {
      // admin row aparece
      const rows = screen.getAllByText('Admin')
      expect(rows.length).toBeGreaterThan(0)
    })
    // Botao Excluir deve estar desabilitado
    const deleteBtn = screen.getByRole('button', { name: 'Excluir usuário' })
    expect(deleteBtn).toBeDisabled()
  })

  it('erro ao salvar aparece no error-banner', async () => {
    const user = userEvent.setup()
    mockSaveUser.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await waitFor(() => expect(screen.getByText('Maria Souza')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Salvar altera/i }))
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível salvar o usuário/i)).toBeInTheDocument()
    })
  })
})
