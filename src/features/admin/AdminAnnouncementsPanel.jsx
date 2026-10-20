import { useEffect, useState } from 'react'
import Skeleton from '../../components/Skeleton'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import {
  listAnnouncements,
  removeAnnouncement,
  saveAnnouncement,
} from '../../services/announcementsRepository'
import useAuth from '../../hooks/useAuth'
import useMediaQuery from '../../hooks/useMediaQuery'
import {
  ANNOUNCEMENT_SUMMARY_MAX,
  getAnnouncementDayLabel,
  summarizeAnnouncement,
} from '../processes/dashboardKpis'
import { isFirebaseConfigured } from '../../lib/firebase'
import { buildActionErrorMessage } from '../../utils/errorMessages'

// Refino F6a (AdminComunicados.dc.html): >= 1041px a lista usa a arvore `ac-*` (tablet/mobile ficam na
// arvore anterior).
const DESKTOP_QUERY = '(min-width: 1041px)'

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

// "Hoje, 08:30" / "Ontem" / dd/mm (+ano de outro ano), pela data LOCAL do comunicado (a mesma regra do
// card do dashboard). Hora montada a mao, nunca toISOString (BRT).
function formatListedAt(announcement, now = new Date()) {
  const value = announcement?.updatedAt ?? announcement?.createdAt
  const dayLabel = getAnnouncementDayLabel(announcement, now)
  if (!dayLabel) return formatTimestamp(value)
  if (dayLabel !== 'Hoje') return dayLabel
  const date = new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return `Hoje, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function AdminAnnouncementsPanel() {
  const { profile } = useAuth()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [announcements, setAnnouncements] = useState([])
  const [announcementDraft, setAnnouncementDraft] = useState(createEmptyAnnouncementDraft())
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState(null)
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true)
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false)
  const [error, setError] = useState('')
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteConfirmError, setDeleteConfirmError] = useState('')

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

  async function handleRemoveAnnouncement(announcementId, onError = setError) {
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
      return true
    } catch (saveError) {
      onError(buildActionErrorMessage('Não foi possível remover o comunicado.', saveError))
      return false
    } finally {
      setIsSavingAnnouncement(false)
    }
  }

  const deleteDialog = (
    <ConfirmDialog
      tone="danger"
      open={isDeleteConfirmOpen}
      busy={isSavingAnnouncement}
      error={deleteConfirmError}
      title={`Excluir comunicado "${
        announcements.find((item) => item.id === announcementDraft.id)?.title ||
        announcementDraft.title ||
        'sem título'
      }"?`}
      message="O comunicado deixa de aparecer no painel inicial para todos os usuários. Esta ação não pode ser desfeita."
      confirmLabel="Excluir comunicado"
      busyLabel="Excluindo..."
      onConfirm={async () => {
        if (await handleRemoveAnnouncement(announcementDraft.id, setDeleteConfirmError)) {
          setIsDeleteConfirmOpen(false)
        }
      }}
      onCancel={() => {
        setIsDeleteConfirmOpen(false)
        setDeleteConfirmError('')
      }}
    />
  )

  // Refino F6a (AdminComunicados.dc.html): >= 1041px o painel usa a arvore `ac-*` (cartoes-botao com
  // canal em etiqueta, editor com previa do card do dashboard). Tablet/mobile seguem na arvore abaixo,
  // intacta. Estado e handlers sao os mesmos (vivem aqui em cima): a troca ao vivo de breakpoint nao
  // perde o rascunho. O resumo e' derivado dos 140 primeiros caracteres da mensagem (D10) — nenhum
  // campo novo no Firestore.
  if (isDesktop) {
    const isEditing = Boolean(announcementDraft.id)
    const draftChannel = String(announcementDraft.channel ?? '').trim()
    const draftSummary = summarizeAnnouncement(announcementDraft.content)
    const contentLength = String(announcementDraft.content ?? '').length

    return (
      <div className="admin-panel admin-panel--announcements ac-root">
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="ac-head">
          <div className="ac-head__text">
            <h3 className="ac-title">Comunicados internos</h3>
            <p className="ac-subtitle">Avisos exibidos no painel inicial da plataforma.</p>
          </div>
          <button type="button" className="primary-button ac-new" onClick={handleCreateAnnouncementMode}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            Novo comunicado
          </button>
        </div>

        <div className="ac-grid">
          <section className="ad-card ac-list" aria-label="Publicados">
            {isLoadingAnnouncements ? (
              <Skeleton.Group count={3}>
                <div className="ac-row ac-row--skeleton">
                  <Skeleton variant="title" width="70%" />
                  <Skeleton variant="text" />
                  <Skeleton variant="text" width="40%" />
                </div>
              </Skeleton.Group>
            ) : announcements.length > 0 ? (
              announcements.map((announcement) => {
                const isSelected = selectedAnnouncementId === announcement.id
                const channel = String(announcement.channel ?? '').trim()
                return (
                  <button
                    key={announcement.id}
                    type="button"
                    className={`ac-row${isSelected ? ' ac-row--selected' : ''}`}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => handleSelectAnnouncement(announcement.id)}
                  >
                    <span className="ac-row__meta">
                      {channel ? <span className="ad-pill ad-pill--info ac-row__channel">{channel}</span> : <span />}
                      <span className="ac-row__when">{formatListedAt(announcement)}</span>
                    </span>
                    <strong className="ac-row__title">{announcement.title}</strong>
                    <span className="ac-row__summary">{summarizeAnnouncement(announcement.content)}</span>
                  </button>
                )
              })
            ) : (
              <EmptyState
                illustration="news"
                title="Nenhum comunicado publicado"
                message="Crie o primeiro aviso interno para começar a abastecer o painel."
              />
            )}
          </section>

          <section className="ad-card ac-editor">
            <h3 className="ac-editor__title">{isEditing ? 'Editar comunicado' : 'Novo comunicado'}</h3>

            <div className="ac-fields-row">
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
            </div>

            <div className="ac-field">
              <label className="field">
                <span>Mensagem</span>
                <textarea
                  className="text-input text-area"
                  rows={6}
                  value={announcementDraft.content}
                  onChange={(event) => handleAnnouncementDraftChange('content', event.target.value)}
                  placeholder="Escreva o comunicado que será exibido aos usuários"
                />
              </label>
              <div className="ac-hint">
                <span>
                  Os primeiros {ANNOUNCEMENT_SUMMARY_MAX} caracteres viram o resumo da lista e do card do
                  dashboard.
                </span>
                <span
                  className={`ac-hint__count${contentLength > ANNOUNCEMENT_SUMMARY_MAX ? ' ac-hint__count--over' : ''}`}
                >
                  {contentLength}/{ANNOUNCEMENT_SUMMARY_MAX}
                </span>
              </div>
            </div>

            <div className="ac-preview" role="group" aria-label="Prévia no dashboard">
              <span className="ac-preview__label">Prévia no dashboard</span>
              <div className="ac-preview__card">
                <span className="ac-preview__eyebrow">
                  {[draftChannel, 'Hoje'].filter(Boolean).join(' · ')}
                </span>
                <strong className="ac-preview__title">{announcementDraft.title || 'Título do comunicado'}</strong>
                <span className="ac-preview__summary">
                  {draftSummary || 'O resumo aparece aqui, a partir da mensagem.'}
                </span>
              </div>
            </div>

            <div className="ad-footer">
              <div className="ad-footer__group">
                {isEditing ? (
                  <button
                    type="button"
                    className="ghost-button ad-delete"
                    onClick={() => {
                      setDeleteConfirmError('')
                      setIsDeleteConfirmOpen(true)
                    }}
                    disabled={isSavingAnnouncement}
                  >
                    Excluir comunicado
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveAnnouncement}
                disabled={isSavingAnnouncement}
              >
                {isSavingAnnouncement ? 'Salvando...' : isEditing ? 'Salvar comunicado' : 'Publicar comunicado'}
              </button>
            </div>
          </section>
        </div>

        {deleteDialog}
      </div>
    )
  }

  return (
    <>
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
              <Skeleton.Group count={3}>
                <div className="announcement-card" style={{ gap: 8, padding: 14 }}>
                  <Skeleton variant="title" width="70%" />
                  <Skeleton variant="text" />
                  <Skeleton variant="text" width="40%" />
                </div>
              </Skeleton.Group>
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
                  className="ghost-button ghost-button--secondary"
                  onClick={() => {
                    setDeleteConfirmError('')
                    setIsDeleteConfirmOpen(true)
                  }}
                  disabled={isSavingAnnouncement}
                >
                  Remover
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </article>

      {deleteDialog}
    </>
  )
}
