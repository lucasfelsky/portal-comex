// Refino F6a: arvore DESKTOP do painel Usuarios (AdminUsuarios.dc.html). O desktop e escolhido por
// matchMedia('(min-width: 1041px)'); a arvore legada (tablet/mobile) segue coberta por
// tests/ui/AdminUsersPanel.test.jsx (matchMedia falso = legado). Fica em tests/unit para nao
// entrar na contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const flags = vi.hoisted(() => ({ firebase: false }))
const mockUseAuth = vi.fn()
const mockListUsers = vi.fn()
const mockSaveUser = vi.fn()
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockCreateManagedAuthUser = vi.fn()
const mockUpdateManagedUserPassword = vi.fn()
const mockDeleteManagedUser = vi.fn()
const mockSendCustomVerificationEmail = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return flags.firebase
  },
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
  {
    id: 'u-4',
    name: 'Rita Reprovada',
    email: 'rita@sqquimica.com',
    role: 'user',
    area: '',
    status: 'Reprovado',
    statusTone: 'neutral',
    lastAccess: 'Cadastro reprovado',
    scopes: ['Dashboard', 'Processos'],
  },
]

function renderPanel() {
  return render(<AdminUsersPanel />)
}

const rows = (container) => [...container.querySelectorAll('.au-row')]
const rowOf = (container, text) => rows(container).find((row) => row.textContent.includes(text))

async function openConfirm(user, openerName) {
  await user.click(screen.getByRole('button', { name: openerName }))
  const dialog = await screen.findByRole('alertdialog')
  // o focus trap leva o foco ao "Cancelar" depois da montagem: so interage depois disso
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
  return dialog
}

beforeEach(() => {
  flags.firebase = false
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
  media = installMatchMedia(true)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('AdminUsersPanel - desktop (>= 1041px): estrutura', () => {
  it('raiz .admin-panel--users com as 3 secoes (headings nivel 3) na ordem Gestao, Detalhe, Fila', async () => {
    const { container } = renderPanel()
    const root = container.querySelector('.admin-panel.admin-panel--users')
    expect(root).not.toBeNull()
    expect(container.querySelector('.dual-grid')).toBeNull()
    expect(container.querySelector('.list-card')).toBeNull()
    const gestao = await screen.findByRole('heading', { level: 3, name: 'Gestão de usuários' })
    const detalhe = screen.getByRole('heading', { level: 3, name: 'Detalhe do usuário' })
    const fila = screen.getByRole('heading', { level: 3, name: 'Fila de aprovação' })
    const grid = root.querySelector('.au-grid')
    expect(grid).toContainElement(gestao)
    expect(grid).toContainElement(detalhe)
    expect(grid).not.toContainElement(fila)
    expect(gestao.compareDocumentPosition(detalhe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(detalhe.compareDocumentPosition(fila) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('loading inicial: skeleton no formato da linha (avatar + 2 linhas)', () => {
    let resolveList
    mockListUsers.mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
    const { container } = renderPanel()
    expect(container.querySelector('.au-row--skeleton .skeleton')).toBeTruthy()
    resolveList([])
  })

  it('erro ao carregar vira error-banner', async () => {
    mockListUsers.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    expect(await screen.findByText(/Não foi possível carregar os usuários/i)).toBeInTheDocument()
    expect(document.querySelector('.error-banner')).not.toBeNull()
  })
})

describe('AdminUsersPanel - desktop: lista, busca e filtro', () => {
  it('"N visiveis" em etiqueta neutra e linhas com avatar de iniciais, Perfil · Area · UID e etiqueta de status', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    expect(screen.getByText('4 visíveis')).toHaveClass('ad-pill', 'ad-pill--neutral')
    const maria = rowOf(container, 'Maria Souza')
    expect(maria.querySelector('.au-row__avatar')).toHaveTextContent('MS')
    expect(maria.querySelector('.au-row__avatar')).toHaveAttribute('aria-hidden', 'true')
    expect(maria.querySelector('.au-row__meta')).toHaveTextContent('User · Importacao · u-1')
    expect(maria.querySelector('.au-row__meta .ad-mono')).toHaveTextContent('u-1')
    const carlos = rowOf(container, 'Carlos Bloq')
    expect(carlos.querySelector('.au-row__meta')).toHaveTextContent('Logística · Logistica · u-3')
    // sem area: "Geral"
    expect(rowOf(container, 'Rita Reprovada').querySelector('.au-row__meta')).toHaveTextContent('User · Geral · u-4')
  })

  it('etiquetas: Ativo ok, Pendente warn, Bloqueado danger, Reprovado neutra (mock)', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    const pill = (name) => rowOf(container, name).querySelector('.ad-pill')
    expect(pill('Maria Souza')).toHaveClass('ad-pill--ok')
    expect(pill('Joao Pendente')).toHaveClass('ad-pill--warn')
    expect(pill('Carlos Bloq')).toHaveClass('ad-pill--danger')
    expect(pill('Rita Reprovada')).toHaveClass('ad-pill--neutral')
    expect(pill('Carlos Bloq')).toHaveTextContent('Bloqueado')
  })

  it('o usuario selecionado fica marcado (classe + aria-current) e muda ao clicar', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    expect(rowOf(container, 'Maria Souza')).toHaveClass('au-row--selected')
    expect(rowOf(container, 'Maria Souza')).toHaveAttribute('aria-current', 'true')
    expect(rowOf(container, 'Joao Pendente')).not.toHaveAttribute('aria-current')
    await user.click(rowOf(container, 'Joao Pendente'))
    expect(rowOf(container, 'Joao Pendente')).toHaveClass('au-row--selected')
    expect(rowOf(container, 'Maria Souza')).not.toHaveClass('au-row--selected')
    expect(screen.getByDisplayValue('joao@sqquimica.com')).toBeInTheDocument()
  })

  it('busca por nome, email, perfil e ID; "N visiveis" acompanha', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    const search = screen.getByPlaceholderText('Nome, email, perfil ou ID')
    expect(screen.getByLabelText('Buscar usuário')).toBe(search)
    await user.type(search, 'carlos')
    expect(rows(container)).toHaveLength(1)
    expect(screen.getByText('1 visíveis')).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'logística')
    expect(rows(container)).toHaveLength(0)
    await user.clear(search)
    await user.type(search, 'logistica')
    expect(rows(container)).toHaveLength(1)
    await user.clear(search)
    await user.type(search, 'u-2')
    expect(rows(container)).toHaveLength(1)
    expect(rows(container)[0]).toHaveTextContent('Joao Pendente')
    await user.clear(search)
    await user.type(search, 'rita@')
    expect(rows(container)).toHaveLength(1)
  })

  it('filtro de status (Todos / Ativo / Pendente / Bloqueado / Reprovado) e estado vazio da busca', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    const filter = screen.getByLabelText('Status', { selector: '.au-filters select' })
    expect([...filter.options].map((option) => option.value)).toEqual(['Todos', 'Ativo', 'Pendente', 'Bloqueado', 'Reprovado'])
    await user.selectOptions(filter, 'Bloqueado')
    expect(rows(container)).toHaveLength(1)
    expect(rows(container)[0]).toHaveTextContent('Carlos Bloq')
    await user.selectOptions(filter, 'Reprovado')
    expect(rows(container)[0]).toHaveTextContent('Rita Reprovada')
    await user.type(screen.getByPlaceholderText('Nome, email, perfil ou ID'), 'zzz')
    expect(rows(container)).toHaveLength(0)
    expect(screen.getByText('Nenhum usuário encontrado')).toBeInTheDocument()
    expect(screen.getByText('Ajuste a busca ou o filtro para voltar a exibir resultados.')).toBeInTheDocument()
    expect(container.querySelector('.au-list .empty-state')).not.toBeNull()
  })
})

describe('AdminUsersPanel - desktop: detalhe', () => {
  it('cabecalho com avatar de iniciais, UID mono e etiqueta do status; campos na ordem do mock', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    const head = container.querySelector('.au-detail-head')
    expect(head.querySelector('.au-avatar')).toHaveTextContent('MS')
    expect(head.querySelector('.au-uid')).toHaveTextContent('UID u-1')
    expect(head.querySelector('.ad-pill')).toHaveTextContent('Ativo')
    const labels = [...container.querySelectorAll('.au-fields > .field > span:first-child, .au-fields .au-password__row label')].map(
      (node) => node.textContent
    )
    expect(labels).toEqual(['Nome', 'Email', 'Perfil', 'Status', 'Área', 'Senha'])
    expect(screen.getByDisplayValue('Maria Souza')).toBeInTheDocument()
    expect(screen.getByDisplayValue('maria@sqquimica.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Importacao')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBe(screen.getByPlaceholderText('Digite uma nova senha para redefinir'))
  })

  it('"Permissoes do perfil" em chips (lista) e troca de perfil atualiza as permissoes', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    const list = screen.getByRole('list', { name: 'Permissões do perfil' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Dashboard', 'Processos'])
    const [, roleSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(roleSelect, 'admin')
    expect(within(screen.getByRole('list', { name: 'Permissões do perfil' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Usuários',
      'Permissões',
      'Comunicados',
      'Auditoria',
      'Processos',
    ])
  })

  it('Mostrar/Ocultar senha: desabilitado sem senha, alterna o tipo e o rotulo; focar o campo revela (como antes)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' })
    const input = screen.getByLabelText('Senha')
    expect(toggle).toBeDisabled()
    expect(input).toHaveAttribute('type', 'password')
    await user.type(input, 'abc123')
    // focar/clicar no campo revela a senha (comportamento anterior preservado)
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeInTheDocument()
  })

  it('com Firebase: email bloqueado e os dois avisos (Email protegido / Senha nao disponivel)', async () => {
    flags.firebase = true
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    expect(screen.getByDisplayValue('maria@sqquimica.com')).toBeDisabled()
    expect(screen.getByText('Email protegido')).toBeInTheDocument()
    expect(screen.getByText(/o email fica bloqueado aqui para evitar divergencia com o Firebase Auth/)).toBeInTheDocument()
    expect(screen.getByText('Senha não disponível')).toBeInTheDocument()
    expect(screen.getByText(/digite uma nova senha e salve/)).toBeInTheDocument()
    expect(document.querySelectorAll('.au-note')).toHaveLength(2)
  })

  it('sem Firebase: email editavel e nenhum aviso', async () => {
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    expect(screen.getByDisplayValue('maria@sqquimica.com')).toBeEnabled()
    expect(document.querySelector('.au-notes')).toBeNull()
  })

  it('"Novo usuario": cabecalho Novo usuario, avatar com "+", campos vazios, Criar usuario e sem Excluir/Bloquear', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    expect(screen.getByRole('heading', { level: 3, name: 'Novo usuário' })).toBeInTheDocument()
    expect(container.querySelector('.au-detail-head .au-avatar svg')).not.toBeNull()
    expect(container.querySelector('.au-uid')).toHaveTextContent('UID gerado ao criar')
    expect(screen.getByPlaceholderText('Nome completo')).toHaveValue('')
    expect(screen.getByPlaceholderText(/Defina a senha inicial/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar usuário' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir usuário' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bloquear usuário|Ativar usuário/ })).not.toBeInTheDocument()
    // a linha selecionada some (nada selecionado no modo criar)
    expect(container.querySelector('.au-row--selected')).toBeNull()
  })

  it('criar: senha curta vira erro inline no campo (foco, sem banner e sem chamar o servico)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'X')
    await user.type(screen.getByPlaceholderText('email@empresa.com'), 'x@sq.com')
    const password = screen.getByPlaceholderText(/Defina a senha inicial/i)
    await user.type(password, '123')
    await user.click(screen.getByRole('button', { name: 'Criar usuário' }))
    expect(await screen.findByText(/pelo menos 6 caracteres/i)).toBeInTheDocument()
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-describedby', 'admin-user-password-error')
    expect(document.activeElement).toBe(password)
    expect(document.querySelector('.error-banner')).toBeNull()
  })

  it('criar (Firebase desligado): chama createUser(payload sem senha, profile)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'Novo User')
    await user.type(screen.getByPlaceholderText('email@empresa.com'), 'novo@sq.com')
    await user.type(screen.getByPlaceholderText(/Defina a senha inicial/i), 'senha123')
    await user.click(screen.getByRole('button', { name: 'Criar usuário' }))
    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledTimes(1))
    const [payload, profile] = mockCreateUser.mock.calls[0]
    expect(profile).toEqual(PROFILE)
    expect(payload).toMatchObject({ name: 'Novo User', email: 'novo@sq.com', role: 'user', status: 'Pendente' })
    expect(payload.password).toBeUndefined()
  })

  it('criar (Firebase ligado): cria o login gerenciado e envia o e-mail de verificacao', async () => {
    flags.firebase = true
    const user = userEvent.setup()
    mockCreateManagedAuthUser.mockResolvedValue({ uid: 'auth-9', email: 'novo@sq.com' })
    mockSendCustomVerificationEmail.mockResolvedValue(undefined)
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByPlaceholderText('Nome completo'), 'Novo User')
    await user.type(screen.getByPlaceholderText('email@empresa.com'), 'novo@sq.com')
    await user.type(screen.getByPlaceholderText(/Defina a senha inicial/i), 'senha123')
    await user.click(screen.getByRole('button', { name: 'Criar usuário' }))
    await waitFor(() => expect(mockCreateManagedAuthUser).toHaveBeenCalledTimes(1))
    expect(mockCreateManagedAuthUser.mock.calls[0][0]).toMatchObject({ email: 'novo@sq.com', password: 'senha123', name: 'Novo User', role: 'user' })
    await waitFor(() => expect(mockSendCustomVerificationEmail).toHaveBeenCalledWith({ uid: 'auth-9' }))
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('salvar alteracoes: saveUser(payload sem senha, profile); com senha nova (Firebase) chama updateManagedUserPassword', async () => {
    flags.firebase = true
    const user = userEvent.setup()
    renderPanel()
    const name = await screen.findByDisplayValue('Maria Souza')
    await user.clear(name)
    await user.type(name, 'Maria Atualizada')
    await user.type(screen.getByLabelText('Senha'), 'novasenha1')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mockSaveUser).toHaveBeenCalledTimes(1))
    const [payload, profile] = mockSaveUser.mock.calls[0]
    expect(profile).toEqual(PROFILE)
    expect(payload).toMatchObject({ id: 'u-1', name: 'Maria Atualizada' })
    expect(payload.password).toBeUndefined()
    await waitFor(() => expect(mockUpdateManagedUserPassword).toHaveBeenCalledWith({ uid: 'u-1', password: 'novasenha1' }))
  })

  it('senha curta na edicao: erro inline, sem chamar saveUser', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    const password = screen.getByLabelText('Senha')
    await user.type(password, '123')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText(/A nova senha deve ter pelo menos 6 caracteres/i)).toBeInTheDocument()
    expect(mockSaveUser).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(password)
  })

  it('erro ao salvar aparece no error-banner', async () => {
    const user = userEvent.setup()
    mockSaveUser.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText(/Não foi possível salvar o usuário/i)).toBeInTheDocument()
  })
})

describe('AdminUsersPanel - desktop: rodape do detalhe (Excluir, Bloquear/Ativar, Salvar)', () => {
  it('ordem do mock: Excluir (fantasma), Bloquear (secundario) e Salvar (primario) por ultimo', async () => {
    const { container } = renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    const footer = container.querySelector('.ad-footer')
    const buttons = [...footer.querySelectorAll('button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['Excluir usuário', 'Bloquear usuário', 'Salvar alterações'])
    expect(buttons[0]).toHaveClass('ghost-button', 'ad-delete')
    expect(buttons[1]).toHaveClass('secondary-button')
    expect(buttons[2]).toHaveClass('primary-button')
  })

  it('Bloquear: abre a confirmacao e so grava ao confirmar (status Bloqueado)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    const dialog = await openConfirm(user, 'Bloquear usuário')
    expect(mockSaveUser).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Bloquear usuário' }))
    await waitFor(() => {
      const last = mockSaveUser.mock.calls[mockSaveUser.mock.calls.length - 1]
      expect(last[0].status).toBe('Bloqueado')
    })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('Ativar usuario (Bloqueado): grava direto, sem dialogo', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    await user.click(rowOf(container, 'Carlos Bloq'))
    await user.click(screen.getByRole('button', { name: 'Ativar usuário' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      const last = mockSaveUser.mock.calls[mockSaveUser.mock.calls.length - 1]
      expect(last[0].status).toBe('Ativo')
    })
  })

  it('Excluir: confirmacao com o nome, Cancelar nao executa, confirmar chama deleteUser(id, profile)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    let dialog = await openConfirm(user, 'Excluir usuário')
    expect(within(dialog).getByText(/Maria Souza/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockDeleteUser).not.toHaveBeenCalled()
    dialog = await openConfirm(user, 'Excluir usuário')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir usuário' }))
    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith('u-1', PROFILE))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('falha ao excluir: o dialogo continua aberto com o erro dentro', async () => {
    const user = userEvent.setup()
    mockDeleteUser.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    const dialog = await openConfirm(user, 'Excluir usuário')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir usuário' }))
    await waitFor(() => {
      expect(within(screen.getByRole('alertdialog')).getByText(/Não foi possível excluir o usuário/i)).toBeInTheDocument()
    })
  })

  it('o proprio usuario logado nao pode ser excluido (botao desabilitado)', async () => {
    mockListUsers.mockResolvedValueOnce([
      { id: PROFILE.uid, name: 'Admin', email: PROFILE.email, role: 'admin', status: 'Ativo', statusTone: 'ok', scopes: ['Usuários'] },
    ])
    renderPanel()
    await screen.findByDisplayValue(PROFILE.email)
    expect(screen.getByRole('button', { name: 'Excluir usuário' })).toBeDisabled()
  })
})

describe('AdminUsersPanel - desktop: fila de aprovacao', () => {
  it('cartao com nome, e-mail e "Perfil · Area · ID"; contador "N pendentes" em etiqueta de aviso', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelectorAll('.au-pending')).toHaveLength(1))
    expect(screen.getByText('1 pendentes')).toHaveClass('ad-pill--warn')
    const card = container.querySelector('.au-pending')
    expect(card.querySelector('.au-pending__name')).toHaveTextContent('Joao Pendente')
    expect(card.querySelector('.au-pending__email')).toHaveTextContent('joao@sqquimica.com')
    expect(card.querySelector('.au-pending__meta')).toHaveTextContent('Perfil: User · Área: Exportacao · ID: u-2')
    expect(card.querySelector('.au-pending__meta strong')).toHaveTextContent('User')
    expect([...card.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Aprovar', 'Reprovar', 'Abrir detalhe'])
  })

  it('Aprovar grava Ativo direto; o contador e a lista acompanham', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelectorAll('.au-pending')).toHaveLength(1))
    await user.click(within(container.querySelector('.au-pending')).getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(mockSaveUser).toHaveBeenCalled())
    const last = mockSaveUser.mock.calls[mockSaveUser.mock.calls.length - 1]
    expect(last[0]).toMatchObject({ id: 'u-2', status: 'Ativo', statusTone: 'ok' })
    expect(last[1]).toEqual(PROFILE)
  })

  it('Reprovar: confirmacao e, ao confirmar, grava Reprovado; o botao e o contorno de perigo do mock', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelectorAll('.au-pending')).toHaveLength(1))
    const reject = within(container.querySelector('.au-pending')).getByRole('button', { name: 'Reprovar' })
    expect(reject).toHaveClass('ghost-button', 'au-pending__reject')
    await user.click(reject)
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    expect(mockSaveUser).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Reprovar cadastro' }))
    await waitFor(() => {
      const last = mockSaveUser.mock.calls[mockSaveUser.mock.calls.length - 1]
      expect(last[0]).toMatchObject({ id: 'u-2', status: 'Reprovado' })
    })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('Abrir detalhe seleciona o usuario no detalhe', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelectorAll('.au-pending')).toHaveLength(1))
    expect(screen.getByDisplayValue('Maria Souza')).toBeInTheDocument()
    await user.click(within(container.querySelector('.au-pending')).getByRole('button', { name: 'Abrir detalhe' }))
    expect(screen.getByDisplayValue('joao@sqquimica.com')).toBeInTheDocument()
    expect(container.querySelector('.au-uid')).toHaveTextContent('UID u-2')
  })

  it('sem pendentes: estado vazio e contador "0 pendentes" neutro', async () => {
    mockListUsers.mockResolvedValueOnce([USERS[0]])
    const { container } = renderPanel()
    expect(await screen.findByText('Nenhum cadastro pendente')).toBeInTheDocument()
    expect(screen.getByText('Novos registros aparecerão aqui para aprovação administrativa.')).toBeInTheDocument()
    expect(screen.getByText('0 pendentes')).toHaveClass('ad-pill--neutral')
    expect(container.querySelector('.au-pending')).toBeNull()
  })
})

describe('AdminUsersPanel - troca ao vivo entre arvores (1041px)', () => {
  it('busca, filtro, rascunho e senha digitados sobrevivem a troca desktop <-> tablet', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    expect(container.querySelector('.admin-panel--users')).not.toBeNull()

    await user.type(screen.getByPlaceholderText('Nome, email, perfil ou ID'), 'o')
    const name = screen.getByDisplayValue('Maria Souza')
    await user.clear(name)
    await user.type(name, 'Maria Editada')
    await user.type(screen.getByLabelText('Senha'), 'segredo9')

    media.setDesktop(false)
    expect(container.querySelector('.admin-panel--users')).toBeNull()
    expect(container.querySelector('.dual-grid')).not.toBeNull()
    expect(screen.getByPlaceholderText('Nome, email, perfil ou ID')).toHaveValue('o')
    expect(screen.getByDisplayValue('Maria Editada')).toBeInTheDocument()
    expect(screen.getByDisplayValue('segredo9')).toBeInTheDocument()

    media.setDesktop(true)
    expect(container.querySelector('.admin-panel--users')).not.toBeNull()
    expect(container.querySelector('.dual-grid')).toBeNull()
    expect(screen.getByPlaceholderText('Nome, email, perfil ou ID')).toHaveValue('o')
    expect(screen.getByDisplayValue('Maria Editada')).toBeInTheDocument()
    expect(screen.getByDisplayValue('segredo9')).toBeInTheDocument()
  })

  it('o modo criar e a selecao sobrevivem a troca; sem listener preso depois de desmontar', async () => {
    const user = userEvent.setup()
    const { container, unmount } = renderPanel()
    await waitFor(() => expect(rows(container)).toHaveLength(4))
    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    media.setDesktop(false)
    expect(screen.getByRole('heading', { level: 3, name: 'Novo usuário' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar usuário' })).toBeInTheDocument()
    media.setDesktop(true)
    expect(screen.getByRole('heading', { level: 3, name: 'Novo usuário' })).toBeInTheDocument()
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('tablet/mobile: a arvore anterior segue intacta (dual-grid, list-card, invite-card)', async () => {
    media = installMatchMedia(false)
    const { container } = renderPanel()
    await screen.findByDisplayValue('Maria Souza')
    expect(container.querySelector('.dual-grid')).not.toBeNull()
    expect(container.querySelectorAll('.list-card')).toHaveLength(3)
    expect(container.querySelector('.invite-card')).not.toBeNull()
    expect(container.querySelector('.au-root')).toBeNull()
    expect(container.querySelector('.au-row')).toBeNull()
  })
})
