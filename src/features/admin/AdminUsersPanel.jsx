import { useEffect, useState } from 'react'
import { getRoleLabel, getRolePermissions, roleOptions } from './rolePermissions'
import {
  createManagedAuthUser,
  deleteManagedUser,
  updateManagedUserPassword,
} from '../../services/managedUsersRepository'
import { sendCustomVerificationEmail } from '../../services/authRepository'
import { createUser, deleteUser, listUsers, saveUser } from '../../services/usersRepository'
import useAuth from '../../hooks/useAuth'
import { isFirebaseConfigured } from '../../lib/firebase'

const statusOptions = ['Todos', 'Ativo', 'Pendente', 'Bloqueado', 'Reprovado']

function statusClassName(tone) {
  return `status-tag status-tag--${tone}`
}

function statusMeta(status) {
  if (status === 'Ativo') {
    return { status: 'Ativo', statusTone: 'ok' }
  }
  if (status === 'Bloqueado' || status === 'Reprovado') {
    return { status, statusTone: 'neutral' }
  }
  return { status: 'Pendente', statusTone: 'warn' }
}

function createEmptyDraft() {
  return {
    id: '',
    name: '',
    email: '',
    password: '',
    role: 'user',
    area: '',
    status: 'Pendente',
    statusTone: 'warn',
    lastAccess: 'Aguardando aprovação',
    scopes: getRolePermissions('user'),
  }
}

function createDraftFromUser(user) {
  return {
    ...user,
    password: '',
    scopes: user.scopes?.length ? user.scopes : getRolePermissions(user.role),
  }
}

function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

export default function AdminUsersPanel() {
  const { profile } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [draft, setDraft] = useState(createEmptyDraft())
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [isSavingUser, setIsSavingUser] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadUsers() {
      setIsLoadingUsers(true)
      setError('')

      try {
        const loadedUsers = await listUsers()

        if (!isMounted) return

        setUsers(loadedUsers)
        setSelectedUserId((currentId) => currentId ?? loadedUsers[0]?.id ?? null)
        setDraft((currentDraft) =>
          currentDraft.id ? currentDraft : createDraftFromUser(loadedUsers[0] ?? createEmptyDraft())
        )
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar os usuários.', loadError))
        }
      } finally {
        if (isMounted) {
          setIsLoadingUsers(false)
        }
      }
    }

    loadUsers()

    return () => {
      isMounted = false
    }
  }, [])

  const filteredUsers = users.filter((user) => {
    const matchesStatus = statusFilter === 'Todos' || user.status === statusFilter
    const query = searchTerm.trim().toLowerCase()

    if (!query) return matchesStatus

    const searchableText = [user.name, user.email, user.role, user.area, user.id]
      .join(' ')
      .toLowerCase()

    return matchesStatus && searchableText.includes(query)
  })

  const pendingUsers = users.filter((user) => user.status === 'Pendente')
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? filteredUsers[0] ?? null
  const selectedStatusTone = draft.statusTone ?? statusMeta(draft.status).statusTone
  const passwordInputPlaceholder = isCreating
    ? 'Defina a senha inicial do usuario'
    : 'Digite uma nova senha para redefinir'

  useEffect(() => {
    if (!selectedUser || isCreating) return
    setDraft(createDraftFromUser(selectedUser))
  }, [selectedUser, isCreating])

  useEffect(() => {
    setIsPasswordVisible(false)
    setDraft((currentDraft) => ({
      ...currentDraft,
      password: isCreating ? currentDraft.password : '',
    }))
  }, [isCreating, selectedUser])

  function handleSelectUser(userId) {
    setSelectedUserId(userId)
    setIsCreating(false)
    setIsPasswordVisible(false)
  }

  function handleCreateMode() {
    setIsCreating(true)
    setSelectedUserId(null)
    setDraft(createEmptyDraft())
    setIsPasswordVisible(false)
  }

  function handleDraftChange(field, value) {
    setDraft((currentDraft) => {
      if (field === 'role') {
        return {
          ...currentDraft,
          role: value,
          scopes: getRolePermissions(value),
        }
      }
      if (field === 'status') {
        return { ...currentDraft, ...statusMeta(value) }
      }
      return { ...currentDraft, [field]: value }
    })
  }

  async function refreshUsers(nextSelectedId = selectedUserId) {
    const refreshedUsers = await listUsers()
    setUsers(refreshedUsers)
    setSelectedUserId(nextSelectedId)
    return refreshedUsers
  }

  async function handleSaveUser() {
    setIsSavingUser(true)
    setError('')

    try {
      const normalizedPassword = String(draft.password ?? '').trim()

      if (isCreating && normalizedPassword.length < 6) {
        throw new Error('Informe uma senha com pelo menos 6 caracteres para criar o usuario.')
      }

      if (!isCreating && normalizedPassword && normalizedPassword.length < 6) {
        throw new Error('A nova senha deve ter pelo menos 6 caracteres.')
      }

      const payload = {
        ...draft,
        scopes: getRolePermissions(draft.role),
      }
      delete payload.password

      let savedUser = null

      if (isCreating) {
        if (isFirebaseConfigured) {
          const managedAuthUser = await createManagedAuthUser({
            email: payload.email,
            password: normalizedPassword,
            name: payload.name,
            role: payload.role,
            area: payload.area,
            status: payload.status,
          })
          savedUser = { ...payload, id: managedAuthUser.uid, email: managedAuthUser.email }
        } else {
          savedUser = await createUser(payload, profile)
        }

        if (isFirebaseConfigured) {
          await sendCustomVerificationEmail({ uid: savedUser.id }).catch((verificationError) => {
            console.error('Falha ao enviar email de verificacao do novo usuario.', verificationError)
          })
        }
      } else {
        savedUser = await saveUser(payload, profile)
        if (isFirebaseConfigured && normalizedPassword) {
          await updateManagedUserPassword({ uid: savedUser.id, password: normalizedPassword })
        }
      }

      await refreshUsers(savedUser.id)
      setIsCreating(false)
      setDraft({ ...createDraftFromUser(savedUser), password: '' })
      setIsPasswordVisible(false)
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível salvar o usuário.', saveError))
    } finally {
      setIsSavingUser(false)
    }
  }

  async function handleSetUserStatus(user, nextStatus) {
    setIsSavingUser(true)
    setError('')

    try {
      const nextState = statusMeta(nextStatus)
      const updatedUser = {
        ...user,
        ...nextState,
        lastAccess:
          nextStatus === 'Ativo'
            ? user.lastAccess ?? 'Aguardando primeiro acesso'
            : nextStatus === 'Reprovado'
              ? 'Cadastro reprovado'
              : 'Aguardando aprovação',
      }

      await saveUser(updatedUser, profile)
      await refreshUsers(updatedUser.id)

      if (selectedUserId === user.id) {
        setDraft(createDraftFromUser(updatedUser))
      }
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível atualizar o status do usuário.', saveError))
    } finally {
      setIsSavingUser(false)
    }
  }

  async function handleDeleteUser(user) {
    if (!user?.id || user.id === profile?.uid) {
      setError('Não é permitido excluir o próprio usuário logado.')
      return
    }

    setIsSavingUser(true)
    setError('')

    try {
      if (isFirebaseConfigured) {
        await deleteManagedUser(user.id)
      } else {
        await deleteUser(user.id, profile)
      }

      const refreshedUsers = await refreshUsers(null)
      const nextSelectedUser = refreshedUsers[0] ?? null
      setIsCreating(false)
      setDraft(nextSelectedUser ? createDraftFromUser(nextSelectedUser) : createEmptyDraft())
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível excluir o usuário.', saveError))
    } finally {
      setIsSavingUser(false)
    }
  }

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="dual-grid">
        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Fila de aprovação</h3>
            </div>
            <span className="inline-badge">{pendingUsers.length} pendentes</span>
          </div>

          <div className="invite-list">
            {pendingUsers.length > 0 ? (
              pendingUsers.map((user) => (
                <div key={user.id} className="invite-card">
                  <div className="invite-card__header">
                    <div>
                      <strong>{user.name}</strong>
                      <p>{user.email}</p>
                    </div>
                    <span className={statusClassName(user.statusTone)}>{user.status}</span>
                  </div>
                  <div className="invite-card__meta">
                    <span>Perfil: {getRoleLabel(user.role)}</span>
                    <span>Área: {user.area || 'Geral'}</span>
                    <span>ID: {user.id}</span>
                  </div>
                  <div className="invite-card__actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleSetUserStatus(user, 'Ativo')}
                      disabled={isSavingUser}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleSetUserStatus(user, 'Reprovado')}
                      disabled={isSavingUser}
                    >
                      Reprovar
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleSelectUser(user.id)}
                    >
                      Abrir detalhe
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <strong>Nenhum cadastro pendente</strong>
                <p>Novos registros aparecerão aqui para aprovação administrativa.</p>
              </div>
            )}
          </div>
        </article>

        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Gestão de usuários</h3>
            </div>
            <span className="inline-badge">{filteredUsers.length} visíveis</span>
          </div>

          <div className="admin-filters">
            <label className="field">
              <span>Buscar usuário</span>
              <input
                className="text-input"
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Nome, email, perfil ou ID"
              />
            </label>

            <label className="field field--compact">
              <span>Status</span>
              <select
                className="text-input"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-user-list admin-user-list--scroll">
            {isLoadingUsers ? (
              <div className="empty-state">
                <strong>Carregando usuários</strong>
                <p>Buscando os dados disponíveis no repositório configurado.</p>
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={`admin-user-row admin-user-row--button${
                    selectedUserId === user.id && !isCreating ? ' admin-user-row--selected' : ''
                  }`}
                  onClick={() => handleSelectUser(user.id)}
                >
                  <div>
                    <strong>{user.name}</strong>
                    <p>
                      {getRoleLabel(user.role)} · {user.area || 'Geral'}
                    </p>
                    <span>{user.id}</span>
                  </div>
                  <span className={statusClassName(user.statusTone)}>{user.status}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <strong>Nenhum usuário encontrado</strong>
                <p>Ajuste a busca ou o filtro para voltar a exibir resultados.</p>
              </div>
            )}
          </div>
        </article>
      </div>

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>{isCreating ? 'Novo usuário' : 'Detalhe do usuário'}</h3>
          </div>
          <div className="admin-toolbar">
            <span className={statusClassName(selectedStatusTone)}>{draft.status}</span>
            <button type="button" className="primary-button" onClick={handleCreateMode}>
              Novo usuário
            </button>
          </div>
        </div>

        <div className="detail-stack">
          <label className="field">
            <span>Nome</span>
            <input
              className="text-input"
              type="text"
              value={draft.name}
              onChange={(event) => handleDraftChange('name', event.target.value)}
              placeholder="Nome completo"
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              className="text-input"
              type="email"
              value={draft.email}
              onChange={(event) => handleDraftChange('email', event.target.value)}
              placeholder="email@empresa.com"
              disabled={!isCreating && isFirebaseConfigured}
            />
          </label>

          {!isCreating && isFirebaseConfigured ? (
            <div className="detail-card detail-card--warning">
              <span className="detail-label">Email protegido</span>
              <p>
                Para usuarios existentes, o email fica bloqueado aqui para evitar divergencia com o Firebase Auth.
              </p>
            </div>
          ) : null}

          <label className="field">
            <span>Senha</span>
            <input
              className="text-input"
              type={isPasswordVisible ? 'text' : 'password'}
              value={draft.password}
              onChange={(event) => handleDraftChange('password', event.target.value)}
              onFocus={() => setIsPasswordVisible(true)}
              onClick={() => setIsPasswordVisible(true)}
              placeholder={passwordInputPlaceholder}
              autoComplete="new-password"
            />
          </label>

          {!isCreating && isFirebaseConfigured ? (
            <div className="detail-card detail-card--warning">
              <span className="detail-label">Senha não disponível</span>
              <p>
                Usuários antigos não têm a senha atual recuperável pelo Firebase. Para este usuário, digite uma
                nova senha e salve.
              </p>
            </div>
          ) : null}

          <div className="action-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setIsPasswordVisible((current) => !current)}
              disabled={!draft.password}
            >
              {isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            </button>
          </div>

          <div className="detail-card detail-card--split">
            <label className="field">
              <span>Perfil</span>
              <select
                className="text-input"
                value={draft.role}
                onChange={(event) => handleDraftChange('role', event.target.value)}
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select
                className="text-input"
                value={draft.status}
                onChange={(event) => handleDraftChange('status', event.target.value)}
              >
                {statusOptions
                  .filter((status) => status !== 'Todos')
                  .map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Área</span>
            <input
              className="text-input"
              type="text"
              value={draft.area}
              onChange={(event) => handleDraftChange('area', event.target.value)}
              placeholder="Ex.: Importação"
            />
          </label>

          <div className="detail-card">
            <span className="detail-label">Permissões do perfil</span>
            <div className="chip-list">
              {draft.scopes.map((scope) => (
                <span key={scope} className="scope-chip">
                  {scope}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={handleSaveUser}
            disabled={isSavingUser}
          >
            {isSavingUser ? 'Salvando...' : isCreating ? 'Criar usuário' : 'Salvar alterações'}
          </button>
          {!isCreating && selectedUser ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                handleSetUserStatus(
                  selectedUser,
                  selectedUser.status === 'Ativo' ? 'Bloqueado' : 'Ativo'
                )
              }
              disabled={isSavingUser}
            >
              {selectedUser.status === 'Ativo' ? 'Bloquear usuário' : 'Ativar usuário'}
            </button>
          ) : null}
          {!isCreating && selectedUser ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => handleDeleteUser(selectedUser)}
              disabled={isSavingUser || selectedUser.id === profile?.uid}
            >
              Excluir usuário
            </button>
          ) : null}
        </div>
      </article>
    </>
  )
}
