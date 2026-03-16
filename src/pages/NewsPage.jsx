import { useEffect, useMemo, useState } from 'react'
import useAuth from '../hooks/useAuth'
import { listNews, removeNewsItem, saveNewsItem } from '../services/newsRepository'
import { listExternalNews } from '../services/externalNewsRepository'
import defaultNewsCoverImage from '../../assets/sqquimica.png'

function createEmptyDraft() {
  return {
    id: '',
    title: '',
    content: '',
    coverImage: '',
    mediaItems: [],
    referencesText: '',
  }
}

function createDraftFromNewsItem(newsItem) {
  return {
    id: newsItem.id,
    title: newsItem.title,
    content: newsItem.content,
    coverImage: newsItem.coverImage,
    mediaItems: newsItem.mediaItems ?? [],
    referencesText: (newsItem.references ?? []).join('\n'),
  }
}

function normalizeReferencesText(value) {
  return String(value ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatTimestamp(value) {
  if (!value) return 'Agora'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

function buildAutomaticNewsFallbackText(newsItem) {
  const sourceName = newsItem?.sourceName ?? 'fonte oficial'
  const publishedAt = newsItem?.publishedAt || newsItem?.updatedAt || newsItem?.createdAt
  const date = publishedAt ? new Date(publishedAt) : null
  const formattedDate =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(date)
      : 'data recente'

  return `Atualização automática publicada por ${sourceName} em ${formattedDate}. Abra a fonte oficial para consultar a matéria completa.`
}

function getNewsCoverImage(newsItem) {
  return newsItem?.coverImage || defaultNewsCoverImage
}

function getNewsSummary(newsItem) {
  const summary = String(newsItem?.summary ?? newsItem?.content ?? '').trim()
  return summary || buildAutomaticNewsFallbackText(newsItem)
}

function getNewsBodyText(newsItem) {
  const content = String(newsItem?.content ?? '').trim()
  return content || getNewsSummary(newsItem)
}

function sortNews(newsItems) {
  return [...newsItems].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime()

    return rightTime - leftTime
  })
}

function isWithinLastHours(value, hours) {
  if (!value) return false

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000
}

function filterNewsWindow(newsItems) {
  const last24Hours = newsItems.filter((item) => isWithinLastHours(item.updatedAt ?? item.createdAt, 24))

  if (last24Hours.length > 0) {
    return last24Hours
  }

  return newsItems.filter((item) => isWithinLastHours(item.updatedAt ?? item.createdAt, 24 * 30))
}

function readFilesAsDataUrls(fileList) {
  const files = Array.from(fileList ?? [])

  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader()

          reader.onload = () =>
            resolve({
              id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
              url: String(reader.result ?? ''),
              caption: file.name,
            })
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
    )
  )
}

export default function NewsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [newsItems, setNewsItems] = useState([])
  const [selectedNewsId, setSelectedNewsId] = useState(null)
  const [draft, setDraft] = useState(createEmptyDraft())
  const [viewMode, setViewMode] = useState('list')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isProcessingMedia, setIsProcessingMedia] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadNews() {
      setIsLoading(true)
      setError('')

      try {
        const [manualNews, automaticNews] = await Promise.all([
          listNews(),
          listExternalNews(),
        ])

        if (!isMounted) return

        setNewsItems(
          filterNewsWindow(
            sortNews([
              ...manualNews.map((item) => ({ ...item, sourceType: 'manual', sourceName: 'Portal COMEX' })),
              ...automaticNews,
            ])
          )
        )
      } catch (loadError) {
        if (isMounted) {
          setError(buildActionErrorMessage('Não foi possível carregar as notícias.', loadError))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadNews()

    return () => {
      isMounted = false
    }
  }, [])

  const selectedNews = newsItems.find((item) => item.id === selectedNewsId) ?? null

  const draftReferences = useMemo(
    () => normalizeReferencesText(draft.referencesText),
    [draft.referencesText]
  )

  function handleCreateMode() {
    setDraft(createEmptyDraft())
    setViewMode('create')
  }

  function handleEditNews(newsItem) {
    setDraft(createDraftFromNewsItem(newsItem))
    setViewMode('edit')
  }

  function handleOpenNews(newsId) {
    setSelectedNewsId(newsId)
  }

  function handleCloseModal() {
    setSelectedNewsId(null)
  }

  async function handleCoverUpload(event) {
    const [coverImage] = await readFilesAsDataUrls(event.target.files)

    if (!coverImage) return

    setDraft((current) => ({
      ...current,
      coverImage: coverImage.url,
    }))

    event.target.value = ''
  }

  async function handleMediaUpload(event) {
    setIsProcessingMedia(true)

    try {
      const uploadedMedia = await readFilesAsDataUrls(event.target.files)

      setDraft((current) => ({
        ...current,
        mediaItems: [...current.mediaItems, ...uploadedMedia],
      }))
    } catch (uploadError) {
      setError(buildActionErrorMessage('Não foi possível carregar as imagens.', uploadError))
    } finally {
      setIsProcessingMedia(false)
      event.target.value = ''
    }
  }

  function handleRemoveMediaItem(mediaId) {
    setDraft((current) => ({
      ...current,
      mediaItems: current.mediaItems.filter((item) => item.id !== mediaId),
    }))
  }

  async function refreshNews(preferredId = null) {
    const [manualNews, automaticNews] = await Promise.all([
      listNews(),
      listExternalNews(),
    ])
    setNewsItems(
      filterNewsWindow(
        sortNews([
          ...manualNews.map((item) => ({ ...item, sourceType: 'manual', sourceName: 'Portal COMEX' })),
          ...automaticNews,
        ])
      )
    )
    setSelectedNewsId(preferredId)
    return manualNews
  }

  async function handleSaveNews() {
    setIsSaving(true)
    setError('')

    try {
      const payload = {
        id: draft.id,
        title: draft.title,
        content: draft.content,
        coverImage: draft.coverImage,
        mediaItems: draft.mediaItems,
        references: draftReferences,
      }
      const saved = await saveNewsItem(payload, profile)
      await refreshNews(saved.id)
      setDraft(createDraftFromNewsItem(saved))
      setViewMode('list')
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível salvar a notícia.', saveError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteNews() {
    if (!draft.id) return

    setIsSaving(true)
    setError('')

    try {
      await removeNewsItem(draft.id, profile)
      await refreshNews(null)
      setDraft(createEmptyDraft())
      setSelectedNewsId(null)
      setViewMode('list')
    } catch (saveError) {
      setError(buildActionErrorMessage('Não foi possível remover a notícia.', saveError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="surface surface--news">
      {(viewMode === 'create' || viewMode === 'edit') && isAdmin ? (
        <article className="list-card news-editor-card">
          <div className="card-heading">
            <div>
              <h3>{viewMode === 'edit' ? 'Editar notícia' : 'Publicar notícia'}</h3>
            </div>
            <div className="admin-toolbar">
              <button type="button" className="ghost-button" onClick={() => setViewMode('list')}>
                Voltar para lista
              </button>
              {draft.id ? (
                <button type="button" className="ghost-button" onClick={handleDeleteNews} disabled={isSaving}>
                  Excluir notícia
                </button>
              ) : null}
            </div>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="detail-stack">
            <label className="field">
              <span>Título</span>
              <input
                className="text-input"
                type="text"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Chamada principal da notícia"
              />
            </label>

            <label className="field">
              <span>Texto</span>
              <textarea
                className="text-input text-input--textarea"
                value={draft.content}
                onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                placeholder="Escreva a notícia completa"
                rows={8}
              />
            </label>

            <div className="detail-card detail-card--split">
              <label className="field">
                <span>Imagem de capa</span>
                <input className="text-input" type="file" accept="image/*" onChange={handleCoverUpload} />
              </label>
              <label className="field">
                <span>Outras imagens</span>
                <input className="text-input" type="file" accept="image/*" multiple onChange={handleMediaUpload} />
              </label>
            </div>

            {draft.coverImage ? (
              <div className="news-image-preview">
                <img src={draft.coverImage} alt="Capa da notícia" />
                <button type="button" className="ghost-button" onClick={() => setDraft((current) => ({ ...current, coverImage: '' }))}>
                  Remover capa
                </button>
              </div>
            ) : null}

            {draft.mediaItems.length > 0 ? (
              <div className="news-media-grid">
                {draft.mediaItems.map((item) => (
                  <div key={item.id} className="news-media-thumb">
                    <img src={item.url} alt={item.caption || 'Mídia da notícia'} />
                    <button type="button" className="ghost-button" onClick={() => handleRemoveMediaItem(item.id)}>
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <label className="field">
              <span>Referências</span>
              <textarea
                className="text-input text-input--textarea"
                value={draft.referencesText}
                onChange={(event) => setDraft((current) => ({ ...current, referencesText: event.target.value }))}
                placeholder="Um link por linha"
                rows={4}
              />
            </label>
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={handleSaveNews} disabled={isSaving || isProcessingMedia}>
              {isSaving ? 'Salvando...' : draft.id ? 'Salvar alterações' : 'Publicar notícia'}
            </button>
          </div>
        </article>
      ) : null}

      {viewMode === 'list' ? (
        <article className="list-card news-list-card">
          <div className="card-heading">
            <div className="admin-toolbar">
              {isAdmin ? (
                <button type="button" className="primary-button" onClick={handleCreateMode}>
                  Nova notícia
                </button>
              ) : null}
            </div>
          </div>

          {error && !isAdmin ? <div className="error-banner">{error}</div> : null}

          <div className="news-grid">
            {isLoading ? (
              <div className="empty-state">
                <strong>Carregando notícias</strong>
                <p>Buscando as publicações mais recentes.</p>
              </div>
            ) : newsItems.length > 0 ? (
              newsItems.map((item) => (
                <article key={item.id} className="news-card">
                  <button type="button" className="news-card__button" onClick={() => handleOpenNews(item.id)}>
                    <div className="news-card__image-wrap">
                      <img
                        src={getNewsCoverImage(item)}
                        alt={item.title}
                        className="news-card__image"
                        onError={(event) => {
                          event.currentTarget.onerror = null
                          event.currentTarget.src = defaultNewsCoverImage
                        }}
                      />
                    </div>
                    <div className="news-card__body">
                      <span className="news-card__timestamp">{formatTimestamp(item.updatedAt)}</span>
                      <span className="inline-badge">{item.sourceName ?? 'Portal COMEX'}</span>
                      <strong>{item.title}</strong>
                      <p className="news-card__summary">{getNewsSummary(item)}</p>
                    </div>
                  </button>

                  {isAdmin && item.sourceType !== 'automatic' ? (
                    <div className="news-card__actions">
                      <button type="button" className="ghost-button" onClick={() => handleEditNews(item)}>
                        Editar
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="empty-state">
                <strong>Nenhuma notícia publicada</strong>
                <p>As postagens dos admins aparecerão aqui para leitura.</p>
              </div>
            )}
          </div>
        </article>
      ) : null}

      {selectedNews ? (
        <div className="news-modal-backdrop" onClick={handleCloseModal}>
          <div className="news-modal" onClick={(event) => event.stopPropagation()}>
            <div className="card-heading">
              <div>
                <h3>{selectedNews.title}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={handleCloseModal}>
                Fechar
              </button>
            </div>

            <div className="news-modal__content">
              <img
                src={getNewsCoverImage(selectedNews)}
                alt={selectedNews.title}
                className="news-modal__cover"
                onError={(event) => {
                  event.currentTarget.onerror = null
                  event.currentTarget.src = defaultNewsCoverImage
                }}
              />

              <div className="news-modal__meta">{formatTimestamp(selectedNews.updatedAt)}</div>

              <div className="news-modal__text">{getNewsBodyText(selectedNews)}</div>

              {selectedNews.mediaItems?.length > 0 ? (
                <div className="news-modal__gallery">
                  {selectedNews.mediaItems.map((item) => (
                    <img key={item.id} src={item.url} alt={item.caption || selectedNews.title} className="news-modal__gallery-image" />
                  ))}
                </div>
              ) : null}

              {selectedNews.references?.length > 0 ? (
                <div className="detail-card">
                  <span className="detail-label">Referências</span>
                  <div className="news-references">
                    {selectedNews.references.map((reference) => (
                      <a key={reference} href={reference} target="_blank" rel="noreferrer">
                        {reference}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedNews.sourceType === 'automatic' && selectedNews.externalUrl ? (
                <div className="action-row">
                  <a href={selectedNews.externalUrl} target="_blank" rel="noreferrer" className="primary-button">
                    Abrir fonte oficial
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
