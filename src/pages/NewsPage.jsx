import { useEffect, useMemo, useState } from 'react'
import useAuth from '../hooks/useAuth'
import Icon from '../components/Icon'
import { createNewsItemId, listNews, removeNewsItem, saveNewsItem } from '../services/newsRepository'
import { listExternalNews } from '../services/externalNewsRepository'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import useMediaQuery from '../hooks/useMediaQuery'
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
import { buildActionErrorMessage } from '../utils/errorMessages'
import { getFieldA11yProps, getFieldErrorId } from '../utils/fieldErrors'
import { decodeHtmlEntities } from '../utils/textEncoding'

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

// Refino F5a (Noticias.dc.html): "Hoje, 09:40" no destaque e "Ontem" / "16/10" nas linhas.
// Fora de hoje/ontem o destaque mostra a data completa de sempre. Sem toISOString.
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function formatNewsStamp(value, { withTime }) {
  if (!value) return 'Agora'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  const dayDiff = Math.round((startOfLocalDay(new Date()) - startOfLocalDay(date)) / 86400000)
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)

  if (dayDiff === 0) return withTime ? `Hoje, ${time}` : 'Hoje'
  if (dayDiff === 1) return withTime ? `Ontem, ${time}` : 'Ontem'
  if (withTime) return formatTimestamp(value)

  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
}

// Quantas noticias de "Anteriores" aparecem de inicio e a cada "Carregar mais".
const OLDER_PAGE_SIZE = 4

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

function getNewsTitle(newsItem) {
  return decodeHtmlEntities(String(newsItem?.title ?? ''))
}

function getNewsSummary(newsItem) {
  const summary = decodeHtmlEntities(String(newsItem?.summary ?? newsItem?.content ?? '')).trim()
  return summary || buildAutomaticNewsFallbackText(newsItem)
}

function getNewsBodyText(newsItem) {
  const content = decodeHtmlEntities(String(newsItem?.content ?? '')).trim()
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
  const isDesktop = useMediaQuery('(min-width: 1041px)')
  const isAdmin = profile?.role === 'admin'
  const [olderVisibleCount, setOlderVisibleCount] = useState(OLDER_PAGE_SIZE)
  const [newsItems, setNewsItems] = useState([])
  const [selectedNewsId, setSelectedNewsId] = useState(null)
  const [draft, setDraft] = useState(createEmptyDraft())
  const [viewMode, setViewMode] = useState('list')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isProcessingMedia, setIsProcessingMedia] = useState(false)
  const [error, setError] = useState('')
  // UX-3b (D10): erro de upload de midia (formato/tamanho) vira INLINE no
  // input correspondente - antes ia pro `.error-banner` compartilhado.
  const [coverError, setCoverError] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteConfirmError, setDeleteConfirmError] = useState('')

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

  // Fix estrutural (2026-08-26): extrai o markup interno do card pra ser
  // reaproveitado pelo featured (índice 0, filho direto do `.news-grid`) e
  // pelas rows (índice >= 1, dentro do `.news-aside`) sem duplicar
  // botão/imagem/meta/ação admin.
  function renderNewsCard(item, index) {
    return (
      <article
        key={item.id}
        className={`news-card${index === 0 ? ' news-card--featured' : ' news-card--row'}`}
      >
        <button type="button" className="news-card__button" onClick={() => handleOpenNews(item.id)}>
          <div className="news-card__image-wrap">
            <img
              src={getNewsCoverImage(item)}
              alt={getNewsTitle(item)}
              className="news-card__image"
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = defaultNewsCoverImage
              }}
            />
          </div>
          <div className="news-card__body">
            <div className="news-card__meta">
              <span className="inline-badge">{item.sourceName ?? 'Portal COMEX'}</span>
              <span className="news-card__timestamp">{formatTimestamp(item.updatedAt)}</span>
            </div>
            <strong>{getNewsTitle(item)}</strong>
            <p className="news-card__summary">{getNewsSummary(item)}</p>
          </div>
          <span className="news-card__chevron" aria-hidden="true">
            <Icon name="chevron" size={16} />
          </span>
        </button>

        {isAdmin && item.sourceType !== 'automatic' ? (
          <div className="news-card__actions">
            <button type="button" className="ghost-button ghost-button--secondary" onClick={() => handleEditNews(item)}>
              Editar
            </button>
          </div>
        ) : null}
      </article>
    )
  }

  // Refino F5a: cartao da arvore desktop. O destaque (indice 0) tem capa de 300px e
  // corpo com fonte, data, titulo Sora, resumo e "Ler notícia"; as linhas de
  // "Anteriores" tem capa de 72px, fonte + data e titulo. "Editar" (so admin, so
  // noticia manual) e' um botao IRMAO do que abre a noticia (sem botao dentro de botao).
  function renderDesktopCover(item) {
    const hasCover = Boolean(item?.coverImage)
    return (
      <span className={`nw-cover${hasCover ? '' : ' nw-cover--empty'}`}>
        <img
          src={getNewsCoverImage(item)}
          alt={getNewsTitle(item)}
          className="nw-cover__image"
          onError={(event) => {
            event.currentTarget.onerror = null
            event.currentTarget.src = defaultNewsCoverImage
            event.currentTarget.closest('.nw-cover')?.classList.add('nw-cover--empty')
          }}
        />
      </span>
    )
  }

  function renderDesktopSource(item) {
    const isAutomatic = item.sourceType === 'automatic'
    return (
      <span className={`nw-source ${isAutomatic ? 'nw-source--ext' : 'nw-source--own'}`}>
        {item.sourceName ?? 'Portal COMEX'}
      </span>
    )
  }

  function renderDesktopCard(item, index) {
    const isFeatured = index === 0
    const canEdit = isAdmin && item.sourceType !== 'automatic'
    const fullStamp = formatTimestamp(item.updatedAt)

    return (
      <article
        key={item.id}
        className={`nw-card ${isFeatured ? 'nw-card--featured' : 'nw-card--row'}${canEdit ? ' nw-card--editable' : ''}`}
      >
        <button type="button" className="nw-card__link" onClick={() => handleOpenNews(item.id)}>
          {renderDesktopCover(item)}
          <span className="nw-card__body">
            <span className="nw-card__meta">
              {renderDesktopSource(item)}
              <span className="nw-card__time" title={fullStamp}>
                {formatNewsStamp(item.updatedAt, { withTime: isFeatured })}
              </span>
            </span>
            <span className="nw-card__title">{getNewsTitle(item)}</span>
            {isFeatured ? (
              <>
                <span className="nw-card__summary">{getNewsSummary(item)}</span>
                <span className="nw-card__cta">
                  Ler notícia
                  <Icon name="chevron" size={14} strokeWidth={2.2} />
                </span>
              </>
            ) : null}
          </span>
          {isFeatured ? null : <Icon name="chevron" size={16} strokeWidth={2} className="nw-card__chevron" />}
        </button>

        {canEdit ? (
          <button type="button" className="secondary-button nw-card__edit" onClick={() => handleEditNews(item)}>
            Editar
          </button>
        ) : null}
      </article>
    )
  }

  function renderDesktopList() {
    const olderItems = newsItems.slice(1)
    const visibleOlder = olderItems.slice(0, olderVisibleCount)
    const hasMoreOlder = olderItems.length > olderVisibleCount

    return (
      <>
        <div className="nw-head">
          <div className="nw-head__text">
            <span className="nw-head__eyebrow">COMEX · MERCADO · OPERAÇÃO</span>
            <h2 className="nw-head__title">Notícias</h2>
          </div>
          {isAdmin ? (
            <button type="button" className="primary-button nw-head__new" onClick={handleCreateMode}>
              <Icon name="plus" size={16} strokeWidth={2.2} />
              Nova notícia
            </button>
          ) : null}
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        {isLoading ? (
          <div className="nw-grid" aria-busy="true" aria-label="Carregando notícias">
            <div className="nw-card nw-card--featured nw-card--skeleton">
              <Skeleton variant="card" style={{ height: 300, borderRadius: 0 }} />
              <div className="nw-card__body">
                <Skeleton variant="text" width={140} />
                <Skeleton variant="title" width="80%" />
                <Skeleton variant="text" />
                <Skeleton variant="text" width="70%" />
              </div>
            </div>
            <div className="nw-aside">
              <Skeleton variant="heading" width={120} />
              {[0, 1, 2].map((key) => (
                <div key={key} className="nw-card nw-card--row nw-card--skeleton">
                  <Skeleton variant="card" style={{ height: 72, borderRadius: 10 }} />
                  <div className="nw-card__body">
                    <Skeleton variant="text" width="50%" />
                    <Skeleton variant="text" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : newsItems.length > 0 ? (
          <div className="nw-grid">
            {renderDesktopCard(newsItems[0], 0)}
            {olderItems.length > 0 ? (
              <aside className="nw-aside" aria-label="Anteriores">
                <h2 className="nw-aside__title">Anteriores</h2>
                {visibleOlder.map((item, index) => renderDesktopCard(item, index + 1))}
                {hasMoreOlder ? (
                  <button
                    type="button"
                    className="nw-aside__more"
                    onClick={() => setOlderVisibleCount((count) => count + OLDER_PAGE_SIZE)}
                  >
                    Carregar mais
                  </button>
                ) : null}
              </aside>
            ) : null}
          </div>
        ) : (
          <EmptyState
            illustration="news"
            title="Nenhuma notícia publicada"
            message="As postagens dos admins aparecerão aqui para leitura."
          />
        )}
      </>
    )
  }

  // Refino F5a: detalhe da noticia no desktop (sem mock proprio — segue o dialogo de
  // 22px do F4d): capa no topo com "x" de 44, fonte + data, titulo Sora, texto, galeria,
  // "Arquivos anexos", "Referências" e "Abrir fonte oficial".
  function renderDesktopDetail(item) {
    return (
      <article className="nw-detail">
        <button type="button" className="nw-detail__close" aria-label="Fechar" onClick={handleCloseModal}>
          <Icon name="close" size={16} strokeWidth={2} />
        </button>
        <div className={`nw-detail__cover${item.coverImage ? '' : ' nw-detail__cover--empty'}`}>
          <img
            src={getNewsCoverImage(item)}
            alt={getNewsTitle(item)}
            className="nw-detail__cover-image"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = defaultNewsCoverImage
              event.currentTarget.parentElement?.classList.add('nw-detail__cover--empty')
            }}
          />
        </div>

        <div className="nw-detail__body">
          <div className="nw-card__meta">
            {renderDesktopSource(item)}
            <span className="nw-card__time">{formatTimestamp(item.updatedAt)}</span>
          </div>

          <h2 className="nw-detail__title">{getNewsTitle(item)}</h2>

          <div className="nw-detail__text">{getNewsBodyText(item)}</div>

          {selectedNewsImageItems.length > 0 ? (
            <div className="nw-detail__gallery">
              {selectedNewsImageItems.map((media) => (
                <img
                  key={media.id}
                  src={media.url}
                  alt={media.caption || getNewsTitle(item)}
                  className="nw-detail__gallery-image"
                />
              ))}
            </div>
          ) : null}

          {selectedNewsFileItems.length > 0 ? (
            <div className="nw-detail__section">
              <span className="nw-detail__label">Arquivos anexos</span>
              <div className="nw-detail__files">
                {selectedNewsFileItems.map((media) => (
                  <a key={media.id} href={media.url} download={getNewsMediaDisplayName(media)} className="nw-detail__file">
                    <strong>{getNewsMediaDisplayName(media)}</strong>
                    <span>{getNewsMediaMetaText(media)}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {item.references?.length > 0 ? (
            <div className="nw-detail__section">
              <span className="nw-detail__label">Referências</span>
              <div className="nw-detail__refs">
                {item.references.map((reference) => (
                  <a key={reference} href={reference} target="_blank" rel="noreferrer">
                    {reference}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {item.sourceType === 'automatic' && item.externalUrl ? (
            <div className="nw-detail__actions">
              <a href={item.externalUrl} target="_blank" rel="noreferrer" className="primary-button">
                Abrir fonte oficial
              </a>
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  async function handleCoverUpload(event) {
    setCoverError('')
    try {
      const [coverImage] = buildPendingNewsMediaItems(event.target.files, { imagesOnly: true })

      if (!coverImage) return

      setDraft((current) => ({
        ...current,
        coverImage: toNewsMediaPreviewUrl(coverImage),
        coverImageItem: coverImage,
      }))
    } catch (uploadError) {
      setCoverError(buildActionErrorMessage('Não foi possível carregar a capa.', uploadError))
    } finally {
      event.target.value = ''
    }
  }

  async function handleMediaUpload(event) {
    setIsProcessingMedia(true)
    setMediaError('')

    try {
      const uploadedMedia = buildPendingNewsMediaItems(event.target.files)

      setDraft((current) => ({
        ...current,
        mediaItems: [...current.mediaItems, ...uploadedMedia],
      }))
    } catch (uploadError) {
      setMediaError(buildActionErrorMessage('Não foi possível carregar os anexos.', uploadError))
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
    setCoverError('')
    setMediaError('')
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
        setError(buildActionErrorMessage('Notícia salva, mas não foi possível atualizar a lista.', refreshError))
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

  async function handleDeleteNews(onError = setError) {
    if (!draft.id) return false

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
      return true
    } catch (saveError) {
      onError(buildActionErrorMessage('Não foi possível remover a notícia.', saveError))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  // Botao de contorno navy: o desktop usa o .secondary-button do mock; tablet/mobile
  // seguem no .ghost-button--secondary de antes.
  const secondaryButtonClass = isDesktop ? 'secondary-button' : 'ghost-button ghost-button--secondary'

  return (
    <section className={`surface surface--news${isDesktop ? ' surface--news-desktop' : ''}`}>
      {(viewMode === 'create' || viewMode === 'edit') && isAdmin ? (
        <article className={`list-card news-editor-card${isDesktop ? ' nw-editor' : ''}`}>
          <div className={isDesktop ? 'nw-head nw-head--editor' : 'card-heading'}>
            {isDesktop ? (
              <div className="nw-head__text">
                <span className="nw-head__eyebrow">COMEX · MERCADO · OPERAÇÃO</span>
                <h3 className="nw-head__title">{viewMode === 'edit' ? 'Editar notícia' : 'Publicar notícia'}</h3>
              </div>
            ) : (
              <div>
                <h3>{viewMode === 'edit' ? 'Editar notícia' : 'Publicar notícia'}</h3>
              </div>
            )}
            <div className={isDesktop ? 'nw-head__actions' : 'admin-toolbar'}>
              <button type="button" className="ghost-button" onClick={() => setViewMode('list')}>
                {isDesktop ? <Icon name="chevron-left" size={16} strokeWidth={2.2} /> : null}
                Voltar para lista
              </button>
              {draft.id ? (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => {
                    setDeleteConfirmError('')
                    setIsDeleteConfirmOpen(true)
                  }}
                  disabled={isSaving}
                >
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
                <input
                  className="text-input"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  {...getFieldA11yProps('news-cover-image', coverError)}
                />
                {coverError ? (
                  <small className="field-error" id={getFieldErrorId('news-cover-image')} aria-hidden="true">
                    {coverError}
                  </small>
                ) : null}
              </label>
              <label className="field">
                <span>Anexos</span>
                <input
                  className="text-input"
                  type="file"
                  multiple
                  onChange={handleMediaUpload}
                  {...getFieldA11yProps('news-media-items', mediaError, ['news-media-items-hint'])}
                />
                {mediaError ? (
                  <small className="field-error" id={getFieldErrorId('news-media-items')} aria-hidden="true">
                    {mediaError}
                  </small>
                ) : null}
                <small className="field-hint" id="news-media-items-hint">
                  Imagens, PDFs, planilhas e outros arquivos.
                </small>
              </label>
            </div>

            {draft.coverImage ? (
              <div className="news-image-preview">
                <img src={draft.coverImage} alt="Capa da notícia" />
                <button type="button" className={secondaryButtonClass} onClick={() => setDraft((current) => ({ ...current, coverImage: '' }))}>
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
                    <button type="button" className={secondaryButtonClass} onClick={() => handleRemoveMediaItem(item.id)}>
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

          <ConfirmDialog
            tone="danger"
            open={isDeleteConfirmOpen}
            busy={isSaving}
            error={deleteConfirmError}
            title={`Excluir notícia "${
              newsItems.find((item) => item.id === draft.id)?.title || draft.title || 'sem título'
            }"?`}
            message="A notícia, a capa e os anexos serão excluídos para todos os usuários. Esta ação não pode ser desfeita."
            confirmLabel="Excluir notícia"
            busyLabel="Excluindo..."
            onConfirm={async () => {
              if (await handleDeleteNews(setDeleteConfirmError)) {
                setIsDeleteConfirmOpen(false)
              }
            }}
            onCancel={() => {
              setIsDeleteConfirmOpen(false)
              setDeleteConfirmError('')
            }}
          />
        </article>
      ) : null}

      {viewMode === 'list' && isDesktop ? renderDesktopList() : null}

      {viewMode === 'list' && !isDesktop ? (
        <article className={`list-card news-list-card${isAdmin ? '' : ' news-list-card--no-admin'}`}>
          {isAdmin ? (
            <div className="card-heading">
              <div className="admin-toolbar">
                <button type="button" className="primary-button" onClick={handleCreateMode}>
                  Nova notícia
                </button>
              </div>
            </div>
          ) : null}

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="news-grid">
            {isLoading ? (
              <Skeleton.Group count={3}>
                <div className="news-card">
                  <div className="news-card__image-wrap"><Skeleton variant="card" style={{ height: 132 }} /></div>
                  <div className="news-card__body" style={{ gap: 8, padding: 18 }}>
                    <Skeleton variant="text" width={120} />
                    <Skeleton variant="title" width="80%" />
                    <Skeleton variant="text" />
                    <Skeleton variant="text" />
                  </div>
                </div>
              </Skeleton.Group>
            ) : newsItems.length > 0 ? (
              // F16.6 (redesign iOS) + fix estrutural 2026-08-26: 1ª notícia
              // é o featured (filho direto do `.news-grid`, ocupa a coluna 1
              // no desktop); as demais ("Anteriores" + rows) vivem dentro de
              // `.news-aside` — 2 células REAIS do grid, sem depender de
              // `grid-row: 1 / -1` (que colapsava por falta de
              // `grid-template-rows` explícito). No mobile `.news-aside` é
              // `display: contents` e o fluxo fica igual ao anterior.
              <>
                {renderNewsCard(newsItems[0], 0)}
                {newsItems.length > 1 ? (
                  <div className="news-aside">
                    <div className="news-section-label" aria-hidden="true">
                      Anteriores
                    </div>
                    {newsItems.slice(1).map((item, index) => renderNewsCard(item, index + 1))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state">
                <strong>Nenhuma notícia publicada</strong>
                <p>As postagens dos admins aparecerão aqui para leitura.</p>
              </div>
            )}
          </div>
        </article>
      ) : null}

      <Modal
        open={Boolean(selectedNews)}
        onClose={handleCloseModal}
        title={selectedNews ? getNewsTitle(selectedNews) : undefined}
        wide
        bare={isDesktop}
        className={isDesktop ? 'nw-modal' : 'news-modal'}
        ariaLabel="Detalhes da noticia"
      >
        {selectedNews && isDesktop ? renderDesktopDetail(selectedNews) : null}
        {selectedNews && !isDesktop ? (
          <div className="news-modal__content">
            <img
              src={getNewsCoverImage(selectedNews)}
              alt={getNewsTitle(selectedNews)}
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
                  <img key={item.id} src={item.url} alt={item.caption || getNewsTitle(selectedNews)} className="news-modal__gallery-image" />
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
        ) : null}
      </Modal>
    </section>
  )
}
