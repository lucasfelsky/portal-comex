import { useEffect, useState } from 'react'
import {
  listAnnouncements,
  removeAnnouncement,
  saveAnnouncement,
} from '../../services/announcementsRepository'
import useAuth from '../../hooks/useAuth'
import { isFirebaseConfigured } from '../../lib/firebase'

function createEmptyAnnouncementDraft() {
  return {
    id: '',
    title: '',
    content: '',
    channel: 'Banner interno',
  }
}

function formatTimestamp(value) {
  if (!value) return 'Agora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
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

export default function AdminAnnouncementsPanel() {
  const { profile } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [announcementDraft, setAnnouncementDraft] = useState(createEmptyAnnouncementDraft())
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState(null)
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true)
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadAnnouncements() {
      setIsLoadingAnnouncements(true)

      try {
        const loadedAnnouncements = await listAnnouncements()

        if (!isMounted) return

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

  const selectedAnnouncement =
    announcements.find((announcement) => announcement.id === selectedAnnouncementId) ?? null

  useEffect(() => {
    if (!selectedAnnouncement) return
    setAnnouncementDraft({
      id: selectedAnnouncement.id,
      title: selectedAnnouncement.title,
      content: selectedAnnouncement.content,
      channel: selectedAnnouncement.channel,
    })
  }, [selectedAnnouncement])

  function handleAnnouncementDraftChange(field, value) {
    setAnnouncementDraft((currentDraft) => ({ ...currentDraft, [field]: value }))
  }

  function handleSelectAnnouncement(announcementId) {
    setSelectedAnnouncementId(announcementId)
  }

  function handleCreateAnnouncementMode() {
    setSelectedAnnouncementId(null)
    setAnnouncementDraft(createEmptyAnnouncementDraft())
  }

  async function refreshAnnouncements(nextSelectedId = selectedAnnouncementId) {
    const refreshedAnnouncements = await listAnnouncements()
    setAnnouncements(refreshedAnnouncements)
    setSelectedAnnouncementId(nextSelectedId ?? refreshedAnnouncements[0]?.id ?? null)
    return refreshedAnnouncements
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

  return (
    <div className="admin-panel-stack">
      {error ? <div className="error-banner">{error}</div> : null}

      <article className="list-card">
        <div className="card-heading">
          <div>
            <h3>Comunicados internos</h3>
            <p>Avisos exibidos no painel inicial da plataforma.</p>
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
    </div>
  )
}
