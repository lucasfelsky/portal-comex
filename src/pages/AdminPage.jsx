import { useEffect, useState } from 'react'
import { getRoleLabel, getRolePermissions, roleOptions } from '../features/admin/rolePermissions'
import useAuth from '../hooks/useAuth'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  listAnnouncements,
  removeAnnouncement,
  saveAnnouncement,
} from '../services/announcementsRepository'
import {
  BAR_STATUS_OPTIONS,
  getBarStatus,
  saveBarStatus,
} from '../services/barStatusRepository'
import { createUser, deleteUser, listUsers, saveUser } from '../services/usersRepository'

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
    scopes: user.scopes?.length ? user.scopes : getRolePermissions(user.role),
  }
}

function createEmptyAnnouncementDraft() {
  return {
    id: '',
    title: '',
    content: '',
    channel: 'Banner interno',
  }
}

function formatTimestamp(value) {
  if (!value) {
    return 'Agora'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message

  return details ? `${prefix} (${details})` : prefix
}

export default function AdminPage() {
  const { profile } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [draft, setDraft] = useState(createEmptyDraft())
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [isSavingUser, setIsSavingUser] = useState(false)
  const [error, setError] = useState('')
  const [announcements, setAnnouncements] = useState([])
  const [announcementDraft, setAnnouncementDraft] = useState(createEmptyAnnouncementDraft())
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState(null)
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true)
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false)
  const [barStatusDraft, setBarStatusDraft] = useState({
    status: BAR_STATUS_OPTIONS[0].value,
    notes: '',
  })
  const [barStatusMeta, setBarStatusMeta] = useState(null)
  const [isLoadingBarStatus, setIsLoadingBarStatus] = useState(true)
  const [isSavingBarStatus, setIsSavingBarStatus] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadUsers() {
      setIsLoadingUsers(true)
      setError('')

      try {
        const loadedUsers = await listUsers()

        if (!isMounted) {
          return
        }

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

  useEffect(() => {
    let isMounted = true

    async function loadAnnouncements() {
      setIsLoadingAnnouncements(true)

      try {
        const loadedAnnouncements = await listAnnouncements()

        if (!isMounted) {
          return
        }

        setAnnouncements(loadedAnnouncements)
        setSelectedAnnouncementId((currentId) => currentId ?? loadedAnnouncements[0]?.id ?? null)
        setAnnouncementDraft((currentDraft) =>
          currentDraft.id ? currentDraft : loadedAnnouncements[0] ?? createEmptyAnnouncementDraft()
        )
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar os comunicados.', loadError))
        }
      } finally {
        if (isMounted) {
          setIsLoadingAnnouncements(false)
        }
      }
    }

    loadAnnouncements()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadBarStatus() {
      setIsLoadingBarStatus(true)

      try {
        const loadedBarStatus = await getBarStatus()

        if (!isMounted) {
          return
        }

        setBarStatusMeta(loadedBarStatus)
        setBarStatusDraft({
          status: loadedBarStatus.status,
          notes: loadedBarStatus.notes,
        })
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar o status da barra.', loadError))
        }
      } finally {
        if (isMounted) {
          setIsLoadingBarStatus(false)
        }
      }
    }

    loadBarStatus()

    return () => {
      isMounted = false
    }
  }, [])

  const filteredUsers = users.filter((user) => {
    const matchesStatus = statusFilter === 'Todos' || user.status === statusFilter
    const query = searchTerm.trim().toLowerCase()

    if (!query) {
      return matchesStatus
    }

    const searchableText = [user.name, user.email, user.role, user.area, user.id]
      .join(' ')
      .toLowerCase()

    return matchesStatus && searchableText.includes(query)
  })

  const pendingUsers = users.filter((user) => user.status === 'Pendente')
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? filteredUsers[0] ?? null
  const selectedAnnouncement =
    announcements.find((announcement) => announcement.id === selectedAnnouncementId) ?? null
  const selectedStatusTone = draft.statusTone ?? statusMeta(draft.status).statusTone

  useEffect(() => {
    if (!selectedUser || isCreating) {
      return
    }

    setDraft(createDraftFromUser(selectedUser))
  }, [selectedUser, isCreating])

  useEffect(() => {
    if (!selectedAnnouncement) {
      return
    }

    setAnnouncementDraft({
      id: selectedAnnouncement.id,
      title: selectedAnnouncement.title,
      content: selectedAnnouncement.content,
      channel: selectedAnnouncement.channel,
    })
  }, [selectedAnnouncement])

  function handleSelectUser(userId) {
    setSelectedUserId(userId)
    setIsCreating(false)
  }

  function handleCreateMode() {
    setIsCreating(true)
    setSelectedUserId(null)
    setDraft(createEmptyDraft())
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
        return {
          ...currentDraft,
          ...statusMeta(value),
        }
      }

      return {
        ...currentDraft,
        [field]: value,
      }
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
      const payload = {
        ...draft,
        scopes: getRolePermissions(draft.role),
      }

      const savedUser = isCreating ? await createUser(payload, profile) : await saveUser(payload, profile)
      await refreshUsers(savedUser.id)
      setIsCreating(false)
      setDraft(createDraftFromUser(savedUser))
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
      const refreshedUsers = await (async () => {
        await deleteUser(user.id, profile)
        return refreshUsers(null)
      })()

      const nextSelectedUser = refreshedUsers[0] ?? null
      setIsCreating(false)
      setDraft(nextSelectedUser ? createDraftFromUser(nextSelectedUser) : createEmptyDraft())
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível excluir o usuário.', saveError))
    } finally {
      setIsSavingUser(false)
    }
  }

  async function refreshAnnouncements(nextSelectedId = selectedAnnouncementId) {
    const refreshedAnnouncements = await listAnnouncements()
    setAnnouncements(refreshedAnnouncements)
    setSelectedAnnouncementId(nextSelectedId ?? refreshedAnnouncements[0]?.id ?? null)
    return refreshedAnnouncements
  }

  function handleAnnouncementDraftChange(field, value) {
    setAnnouncementDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  function handleSelectAnnouncement(announcementId) {
    setSelectedAnnouncementId(announcementId)
  }

  function handleCreateAnnouncementMode() {
    setSelectedAnnouncementId(null)
    setAnnouncementDraft(createEmptyAnnouncementDraft())
  }

  async function handleSaveAnnouncement() {
    setIsSavingAnnouncement(true)
    setError('')

    try {
      const savedAnnouncement = await saveAnnouncement(announcementDraft, profile)
      await refreshAnnouncements(savedAnnouncement.id)
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível salvar o comunicado.', saveError))
    } finally {
      setIsSavingAnnouncement(false)
    }
  }

  async function handleRemoveAnnouncement(announcementId) {
    setIsSavingAnnouncement(true)
    setError('')

    try {
      await removeAnnouncement(announcementId, profile)
      const refreshedAnnouncements = await refreshAnnouncements(
        selectedAnnouncementId === announcementId ? null : selectedAnnouncementId
      )

      if (selectedAnnouncementId === announcementId) {
        const nextAnnouncement = refreshedAnnouncements[0] ?? null
        setAnnouncementDraft(
          nextAnnouncement
            ? {
                id: nextAnnouncement.id,
                title: nextAnnouncement.title,
                content: nextAnnouncement.content,
                channel: nextAnnouncement.channel,
              }
            : createEmptyAnnouncementDraft()
        )
      }
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível remover o comunicado.', saveError))
    } finally {
      setIsSavingAnnouncement(false)
    }
  }

  async function handleSaveBarStatus() {
    setIsSavingBarStatus(true)
    setError('')

    try {
      const savedBarStatus = await saveBarStatus(barStatusDraft, profile)
      setBarStatusMeta(savedBarStatus)
      setBarStatusDraft({
        status: savedBarStatus.status,
        notes: savedBarStatus.notes,
      })
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível salvar o status da barra.', saveError))
    } finally {
      setIsSavingBarStatus(false)
    }
  }

  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>Centro administrativo</h2>
        </div>
        <div className="admin-toolbar">
          <span className="inline-badge">
            {isFirebaseConfigured ? 'Firestore ativo' : 'Fallback local'}
          </span>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="admin-feature-stack">
        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Comunicados internos</h3>
            </div>
            <button type="button" className="primary-button" onClick={handleCreateAnnouncementMode}>
              Novo comunicado
            </button>
          </div>

          <div className="announcement-grid">
            <div className="announcement-list">
              {isLoadingAnnouncements ? (
                <div className="empty-state">
                  <strong>Carregando comunicados</strong>
                  <p>Buscando os avisos cadastrados no repositório ativo.</p>
                </div>
              ) : announcements.length > 0 ? (
                announcements.map((announcement) => (
                  <button
                    key={announcement.id}
                    type="button"
                    className={`announcement-card announcement-card--button${
                      selectedAnnouncementId === announcement.id ? ' announcement-card--selected' : ''
                    }`}
                    onClick={() => handleSelectAnnouncement(announcement.id)}
                  >
                    <div className="announcement-card__meta">
                      <span>{formatTimestamp(announcement.updatedAt)}</span>
                      <span>{announcement.channel}</span>
                    </div>
                    <strong>{announcement.title}</strong>
                    <p>{announcement.content}</p>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <strong>Nenhum comunicado publicado</strong>
                  <p>Crie o primeiro aviso interno para começar a abastecer o painel.</p>
                </div>
              )}
            </div>

            <div className="detail-stack">
              <label className="field">
                <span>Título</span>
                <input
                  className="text-input"
                  type="text"
                  value={announcementDraft.title}
                  onChange={(event) => handleAnnouncementDraftChange('title', event.target.value)}
                  placeholder="Ex.: Atualização operacional do portal"
                />
              </label>

              <label className="field">
                <span>Canal</span>
                <input
                  className="text-input"
                  type="text"
                  value={announcementDraft.channel}
                  onChange={(event) => handleAnnouncementDraftChange('channel', event.target.value)}
                  placeholder="Ex.: Banner interno"
                />
              </label>

              <label className="field">
                <span>Mensagem</span>
                <textarea
                  className="text-input text-area"
                  value={announcementDraft.content}
                  onChange={(event) => handleAnnouncementDraftChange('content', event.target.value)}
                  placeholder="Escreva o comunicado que será exibido aos usuários"
                />
              </label>

              <div className="detail-card">
                <span className="detail-label">Resumo</span>
                <p>
                  {announcementDraft.title
                    ? `${announcementDraft.title}${announcementDraft.channel ? ` · ${announcementDraft.channel}` : ''}`
                    : 'Preencha o título e a mensagem para publicar o comunicado.'}
                </p>
              </div>

              <div className="action-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSaveAnnouncement}
                  disabled={isSavingAnnouncement}
                >
                  {isSavingAnnouncement
                    ? 'Salvando...'
                    : announcementDraft.id
                      ? 'Salvar comunicado'
                      : 'Publicar comunicado'}
                </button>
                {announcementDraft.id ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => handleRemoveAnnouncement(announcementDraft.id)}
                    disabled={isSavingAnnouncement}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </article>

        <article className="list-card">
          <div className="card-heading">
            <div>
              <h3>Barra Itajaí/Navegantes</h3>
            </div>
            {barStatusMeta ? (
              <span className={`status-tag status-tag--${barStatusMeta.tone}`}>{barStatusMeta.label}</span>
            ) : null}
          </div>

          {isLoadingBarStatus ? (
            <div className="empty-state">
              <strong>Carregando status da barra</strong>
              <p>Buscando a última condição operacional registrada.</p>
            </div>
          ) : (
            <div className="detail-stack">
              <label className="field">
                <span>Status atual</span>
                <select
                  className="text-input"
                  value={barStatusDraft.status}
                  onChange={(event) =>
                    setBarStatusDraft((currentDraft) => ({
                      ...currentDraft,
                      status: event.target.value,
                    }))
                  }
                >
                  {BAR_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="action-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSaveBarStatus}
                  disabled={isSavingBarStatus}
                >
                  {isSavingBarStatus ? 'Salvando...' : 'Salvar status da barra'}
                </button>
              </div>
            </div>
          )}
        </article>
      </div>

      <div className="dual-grid" style={{ marginTop: '16px' }}>
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

      <article className="list-card" style={{ marginTop: '16px' }}>
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
            />
          </label>

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
    </section>
  )
}
