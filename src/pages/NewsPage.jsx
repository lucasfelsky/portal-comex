import { useEffect, useMemo, useState } from 'react'
import useAuth from '../hooks/useAuth'
import { createNewsItemId, listNews, removeNewsItem, saveNewsItem } from '../services/newsRepository'
import { listExternalNews } from '../services/externalNewsRepository'
import {
  deleteNewsMediaItems,
  resolveNewsCoverImageForSave,
  resolveNewsMediaItemsForSave,
} from '../services/newsMediaStorage'
import defaultNewsCoverImage from '../../assets/sqquimica.png'
import {
  buildPendingNewsMediaItems,
  formatNewsMediaSize,
  getNewsMediaDisplayName,
  getAddedNewsMediaItems,
  getRemovedNewsMediaItems,
  isImageNewsMediaItem,
  normalizeDraftNewsMediaItems,
  normalizeNewsMediaItems,
  revokeNewsMediaPreview,
  toNewsMediaPreviewUrl,
} from '../utils/newsMedia'

function createEmptyDraft() {
  return {
    id: '',
    title: '',
    content: '',
    coverImage: '',
    coverImageItem: null,
    initialCoverImageItem: null,
    mediaItems: [],
    initialMediaItems: [],
    referencesText: '',
  }
}

function createDraftFromNewsItem(newsItem) {
  return {
    id: newsItem.id,
    title: newsItem.title,
    content: newsItem.content,
    coverImage: newsItem.coverImage,
    coverImageItem: newsItem.coverImageItem ?? null,
    initialCoverImageItem: newsItem.coverImageItem ?? null,
    mediaItems: newsItem.mediaItems ?? [],
    initialMediaItems: newsItem.mediaItems ?? [],
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
  const details = [error?.code, error?.message].filter(Boolean).join(' | ')
  return details ? `${prefix} (${details})` : prefix
}

function getNewsMediaMetaText(mediaItem) {
  const details = [isImageNewsMediaItem(mediaItem) ? 'Imagem' : mediaItem?.mimeType || 'Arquivo']
  const formattedSize = formatNewsMediaSize(mediaItem?.size)

  if (formattedSize) {
    details.push(formattedSize)
  }

  return details.join(' | ')
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
  // Regra da vitrine de noticias:
  // 1. Prioriza o que saiu nas ultimas 48 horas.
  // 2. Se nao houver nada nessa janela, mostra o fallback dos ultimos 30 dias.
  const last48Hours = newsItems.filter((item) => isWithinLastHours(item.updatedAt ?? item.createdAt, 48))

  if (last48Hours.length > 0) {
    return last48Hours
  }

  return newsItems.filter((item) => isWithinLastHours(item.updatedAt ?? item.createdAt, 24 * 30))
}

function mergeNews(manualNews, automaticNews) {
  return filterNewsWindow(
    sortNews([
      ...manualNews.map((item) => ({ ...item, sourceType: 'manual', sourceName: 'Portal COMEX' })),
      ...automaticNews,
    ])
  )
}

function upsertManualNews(newsItems, newsItem) {
  const nextManualNewsItem = {
    ...newsItem,
    sourceType: 'manual',
    sourceName: 'Portal COMEX',
  }

  return filterNewsWindow(
    sortNews([nextManualNewsItem, ...newsItems.filter((item) => item.id !== nextManualNewsItem.id)])
  )
}

function logNewsStorageCleanupError(error) {
  console.error('Falha ao limpar arquivos da noticia no Storage.', error)
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
        const [manualNews, automaticNews] = await Promise.all([listNews(), listExternalNews()])

        if (!isMounted) return
        setNewsItems(mergeNews(manualNews, automaticNews))
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
  const draftMediaItems = useMemo(
    () => normalizeDraftNewsMediaItems(draft.mediaItems),
    [draft.mediaItems]
  )
  const selectedNewsMediaItems = useMemo(
    () => normalizeNewsMediaItems(selectedNews?.mediaItems),
    [selectedNews]
  )
  const selectedNewsImageItems = useMemo(
    () => selectedNewsMediaItems.filter((item) => isImageNewsMediaItem(item)),
    [selectedNewsMediaItems]
  )
  const selectedNewsFileItems = useMemo(
    () => selectedNewsMediaItems.filter((item) => !isImageNewsMediaItem(item)),
    [selectedNewsMediaItems]
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
    try {
      const [coverImage] = buildPendingNewsMediaItems(event.target.files, { imagesOnly: true })

      if (!coverImage) return

      setDraft((current) => ({
        ...current,
        coverImage: toNewsMediaPreviewUrl(coverImage),
        coverImageItem: coverImage,
      }))
    } catch (uploadError) {
      setError(buildActionErrorMessage('Nao foi possivel carregar a capa.', uploadError))
    } finally {
      event.target.value = ''
    }
  }

  async function handleMediaUpload(event) {
    setIsProcessingMedia(true)

    try {
      const uploadedMedia = buildPendingNewsMediaItems(event.target.files)

      setDraft((current) => ({
        ...current,
        mediaItems: [...current.mediaItems, ...uploadedMedia],
      }))
    } catch (uploadError) {
      setError(buildActionErrorMessage('Nao foi possivel carregar os anexos.', uploadError))
    } finally {
      setIsProcessingMedia(false)
      event.target.value = ''
    }
  }

  function handleRemoveMediaItem(mediaId) {
    setDraft((current) => {
      const removedMediaItem = current.mediaItems.find((item) => item.id === mediaId)

      if (removedMediaItem) {
        revokeNewsMediaPreview(removedMediaItem)
      }

      return {
        ...current,
        mediaItems: current.mediaItems.filter((item) => item.id !== mediaId),
      }
    })
  }

  async function refreshNews(preferredId = null) {
    const [manualNews, automaticNews] = await Promise.all([listNews(), listExternalNews()])
    setNewsItems(mergeNews(manualNews, automaticNews))
    setSelectedNewsId(preferredId)
    return manualNews
  }

  async function handleSaveNews() {
    setIsSaving(true)
    setError('')
    const newsId = draft.id || createNewsItemId()
    const actorId = profile?.uid ?? profile?.id ?? ''
    let resolvedCoverImageItem = null
    let resolvedMediaItems = []

    try {
      resolvedCoverImageItem = await resolveNewsCoverImageForSave(
        newsId,
        draft.coverImage ? draft.coverImageItem : null,
        actorId
      )
      resolvedMediaItems = await resolveNewsMediaItemsForSave(newsId, draftMediaItems, actorId)

      const payload = {
        id: newsId,
        title: draft.title,
        content: draft.content,
        coverImage: resolvedCoverImageItem?.url ?? '',
        coverImageStoragePath: resolvedCoverImageItem?.storagePath ?? '',
        coverImageName: resolvedCoverImageItem?.name ?? '',
        coverImageMimeType: resolvedCoverImageItem?.mimeType ?? '',
        coverImageSize: resolvedCoverImageItem?.size ?? null,
        coverImageUploadedAt: resolvedCoverImageItem?.uploadedAt ?? '',
        mediaItems: resolvedMediaItems,
        references: draftReferences,
      }
      const saved = await saveNewsItem(payload, profile)
      const savedNewsItem = {
        ...saved,
        coverImageItem: resolvedCoverImageItem,
        mediaItems: resolvedMediaItems,
      }
      const removedCoverItems = getRemovedNewsMediaItems(
        draft.initialCoverImageItem ? [draft.initialCoverImageItem] : [],
        resolvedCoverImageItem ? [resolvedCoverImageItem] : []
      )
      const removedMediaItems = getRemovedNewsMediaItems(draft.initialMediaItems, resolvedMediaItems)

      if (removedCoverItems.length > 0 || removedMediaItems.length > 0) {
        deleteNewsMediaItems([...removedCoverItems, ...removedMediaItems]).catch(logNewsStorageCleanupError)
      }

      try {
        await refreshNews(saved.id)
      } catch (refreshError) {
        setNewsItems((current) => upsertManualNews(current, savedNewsItem))
        setSelectedNewsId(saved.id)
        setError(buildActionErrorMessage('Noticia salva, mas nao foi possivel atualizar a lista.', refreshError))
      }

      setDraft(createDraftFromNewsItem(savedNewsItem))
      setViewMode('list')
    } catch (saveError) {
      const rollbackCoverItems = getAddedNewsMediaItems(
        draft.initialCoverImageItem ? [draft.initialCoverImageItem] : [],
        resolvedCoverImageItem ? [resolvedCoverImageItem] : []
      )
      const rollbackMediaItems = getAddedNewsMediaItems(draft.initialMediaItems, resolvedMediaItems)

      if (rollbackCoverItems.length > 0 || rollbackMediaItems.length > 0) {
        await deleteNewsMediaItems([...rollbackCoverItems, ...rollbackMediaItems]).catch(logNewsStorageCleanupError)
      }
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
      await removeNewsItem(
        {
          id: draft.id,
          coverImage: draft.initialCoverImageItem?.url ?? draft.coverImage,
          coverImageStoragePath: draft.initialCoverImageItem?.storagePath ?? '',
          coverImageName: draft.initialCoverImageItem?.name ?? '',
          coverImageMimeType: draft.initialCoverImageItem?.mimeType ?? '',
          coverImageSize: draft.initialCoverImageItem?.size ?? null,
          coverImageUploadedAt: draft.initialCoverImageItem?.uploadedAt ?? '',
          mediaItems: draft.initialMediaItems,
        },
        profile
      )
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
                <span>Anexos</span>
                <input className="text-input" type="file" multiple onChange={handleMediaUpload} />
                <small className="field-hint">Imagens, PDFs, planilhas e outros arquivos.</small>
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

            {draftMediaItems.length > 0 ? (
              <div className="news-media-grid">
                {draftMediaItems.map((item) => (
                  <div key={item.id} className="news-media-thumb">
                    {isImageNewsMediaItem(item) ? (
                      <img src={item.url} alt={item.caption || 'Midia da noticia'} />
                    ) : (
                      <div className="news-media-file">
                        <span className="news-media-file__badge">ANEXO</span>
                        <strong>{item.mimeType || 'Arquivo anexado'}</strong>
                      </div>
                    )}
                    <div className="news-media-thumb__meta">
                      <strong>{getNewsMediaDisplayName(item)}</strong>
                      <span>{getNewsMediaMetaText(item)}</span>
                    </div>
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

          {error ? <div className="error-banner">{error}</div> : null}

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

              {selectedNewsImageItems.length > 0 ? (
                <div className="news-modal__gallery">
                  {selectedNewsImageItems.map((item) => (
                    <img key={item.id} src={item.url} alt={item.caption || selectedNews.title} className="news-modal__gallery-image" />
                  ))}
                </div>
              ) : null}

              {selectedNewsFileItems.length > 0 ? (
                <div className="detail-card">
                  <span className="detail-label">Arquivos anexos</span>
                  <div className="news-attachments">
                    {selectedNewsFileItems.map((item) => (
                      <a key={item.id} href={item.url} download={getNewsMediaDisplayName(item)} className="news-attachment">
                        <strong>{getNewsMediaDisplayName(item)}</strong>
                        <span>{getNewsMediaMetaText(item)}</span>
                      </a>
                    ))}
                  </div>
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
