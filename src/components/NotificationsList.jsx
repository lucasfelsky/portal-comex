// NotificationsList: lista de notificacoes do drawer com paginacao
// "ver mais" (Sprint 27).
//
// API:
//   <NotificationsList
//     grouped={[{ processId, type, title, items, unreadCount, latestCreatedAt }]}
//     onOpenNotification={(notification) => void}
//     formatRelative={(value) => string}
//     formatDate={(value) => string}
//     isLoading={boolean}           // UX-2: skeleton antes da 1ª carga
//     loadError={string|null}       // UX-2: banner com "Tentar novamente"
//     onRetry={() => void}          // UX-2: recarrega (some se ausente)
//   />
//
// Comportamento:
//   - Recentes: ate 8 grupos com itens (mostra ate 3 items por grupo)
//   - Anteriores: ate 4 grupos; se houver mais, botao "Ver mais" expande;
//     cada grupo "Anteriores" é um acordeao (cabecalho com aria-expanded
//     que revela ate 3 itens ao abrir)
//   - Empty state quando grouped vazio (some quando ha loadError ou
//     isLoading, que ganham prioridade de exibicao)
//   - loadError com dados antigos: banner aparece ACIMA da lista existente
//     (nao substitui os grupos ja carregados)

import { useId, useState } from 'react'
import Icon from './Icon'
import Skeleton from './Skeleton'
import { useSwipeReveal } from '../hooks/useSwipeReveal'
import { useMobileLayout } from '../hooks/useMobileLayout'

// F15.2: ícone por categoria da notificação no mobile (espelha o
// prefCategoryForType do backend — support_ticket* → suporte,
// news* → notícias, resto → processos).
function iconForNotificationType(type) {
  const normalized = String(type ?? '')
  if (normalized.startsWith('support_ticket')) return 'help'
  if (normalized.startsWith('news')) return 'news'
  return 'arrivals'
}

const RECENT_LIMIT = 8
const ITEMS_PER_GROUP = 3
const OLDER_INITIAL = 4
const OLDER_STEP = 8

function buildNotificationAriaLabel(notification, formatRelative) {
  const parts = [notification.title, notification.body, formatRelative(notification.createdAt)].filter(
    (part) => part !== undefined && part !== null && String(part).trim() !== ''
  )
  const prefix = notification.isRead ? '' : 'Não lida: '
  return `${prefix}${parts.join('. ')}`
}

// F16.8: linha de notificação com swipe-to-marcar-como-lida (mobile).
// Componente próprio pelo mesmo motivo do ProcessRow (Chegadas) — hook por
// linha (useSwipeReveal) não pode viver dentro de um .map() solto.
function NotificationRow({
  notification,
  isMobile,
  isSwipeOpen,
  onSwipeOpenChange,
  onOpenNotification,
  onMarkAsRead,
  formatRelative,
  formatDate,
}) {
  const swipe = useSwipeReveal({
    actionCount: onMarkAsRead ? 1 : 0,
    isOpen: isSwipeOpen,
    onOpenChange: onSwipeOpenChange,
    disabled: !isMobile || !onMarkAsRead,
  })

  const showDesktopMarkAsRead = !isMobile && onMarkAsRead && !notification.isRead

  return (
    <div className="notifications-swipe-row">
      {onMarkAsRead ? (
        <div className="notifications-swipe-row__actions" aria-hidden={!isSwipeOpen}>
          <button
            type="button"
            className="notifications-swipe-row__action"
            tabIndex={isSwipeOpen ? 0 : -1}
            onClick={() => {
              onMarkAsRead(notification)
              onSwipeOpenChange(false)
            }}
          >
            <Icon name="check" size={18} aria-hidden="true" />
            <span>Marcar lida</span>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={`notifications__item notifications-swipe-row__content${
          !notification.isRead ? ' notifications__item--unread' : ''
        }`}
        style={
          isMobile
            ? { transform: `translateX(${swipe.translateX}px)`, transition: swipe.isDragging ? 'none' : undefined }
            : undefined
        }
        onClick={swipe.guardClick(() => onOpenNotification(notification))}
        aria-label={buildNotificationAriaLabel(notification, formatRelative)}
        {...swipe.handlers}
      >
        <span className="notifications__item-icon" aria-hidden="true">
          <Icon name={iconForNotificationType(notification.type)} size={18} />
        </span>
        <div className="notifications__item-body">
          <strong>{notification.title}</strong>
          <p>{notification.body}</p>
          <span>
            {formatRelative(notification.createdAt)} • {formatDate(notification.createdAt)}
          </span>
        </div>
      </button>
      {showDesktopMarkAsRead ? (
        <button
          type="button"
          className="ghost-button notifications__mark-one"
          onClick={() => onMarkAsRead(notification)}
          aria-label={`Marcar como lida: ${notification.title}`}
        >
          Marcar como lida
        </button>
      ) : null}
    </div>
  )
}

// UX-2: grupo "Anteriores" vira acordeao real (cabecalho aciona
// aria-expanded/aria-controls e revela os itens ao abrir).
function OlderGroup({
  group,
  isExpanded,
  onToggle,
  isMobile,
  openSwipeId,
  setOpenSwipeId,
  onOpenNotification,
  onMarkAsRead,
  formatRelative,
  formatDate,
}) {
  const itemsId = useId()

  return (
    <div className="notifications__group">
      <button
        type="button"
        className="notifications__group-header notifications__group-toggle"
        aria-expanded={isExpanded}
        aria-controls={itemsId}
        onClick={onToggle}
      >
        <div>
          <strong>{group.title}</strong>
          <p>{group.items.length} notificações</p>
        </div>
        <span>{formatRelative(group.latestCreatedAt)}</span>
        <Icon name="chevron" size={16} className="notifications__group-toggle-icon" aria-hidden="true" />
      </button>
      {isExpanded ? (
        <div id={itemsId} className="notifications__group-items">
          {group.items.slice(0, ITEMS_PER_GROUP).map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              isMobile={isMobile}
              isSwipeOpen={openSwipeId === notification.id}
              onSwipeOpenChange={(open) => setOpenSwipeId(open ? notification.id : null)}
              onOpenNotification={onOpenNotification}
              onMarkAsRead={onMarkAsRead}
              formatRelative={formatRelative}
              formatDate={formatDate}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function NotificationsList({
  grouped,
  onOpenNotification,
  onMarkAsRead,
  formatRelative,
  formatDate,
  isLoading = false,
  loadError = null,
  onRetry,
}) {
  const [olderLimit, setOlderLimit] = useState(OLDER_INITIAL)
  const isMobile = useMobileLayout()
  const [openSwipeId, setOpenSwipeId] = useState(null)
  const [expandedOlderKeys, setExpandedOlderKeys] = useState(() => new Set())

  const errorBanner = loadError ? (
    <div className="error-banner error-banner--retry" role="alert">
      <span>{loadError}</span>
      {onRetry ? (
        <button type="button" className="ghost-button" onClick={onRetry}>
          Tentar novamente
        </button>
      ) : null}
    </div>
  ) : null

  const isEmpty = !grouped || grouped.length === 0

  if (isEmpty) {
    if (loadError) {
      return errorBanner
    }
    if (isLoading) {
      return (
        <div aria-busy="true" aria-label="Carregando notificações">
          <Skeleton.Group count={3} gap={12} />
        </div>
      )
    }
    return (
      <div className="empty-state">
        <strong>Nenhuma notificação</strong>
        <p>As novas dúvidas e respostas dos processos aparecerão aqui.</p>
      </div>
    )
  }

  const recent = grouped.filter((g) => g.unreadCount > 0).slice(0, RECENT_LIMIT)
  const allOlder = grouped.filter((g) => g.unreadCount === 0)
  const older = allOlder.slice(0, olderLimit)
  const hasMoreOlder = allOlder.length > olderLimit

  function toggleOlderGroup(key) {
    setExpandedOlderKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <>
      {errorBanner}
      {recent.length > 0 ? (
        <div className="notifications__section">
          <div className="notifications__section-label">Recentes</div>
          {recent.map((group) => (
            <div
              key={`recent-${group.processId || group.latestCreatedAt}-${group.type}`}
              className="notifications__group notifications__group--unread"
            >
              <div className="notifications__group-header">
                <div>
                  <strong>{group.title}</strong>
                  <p>
                    {group.items.length} notificações
                    {group.unreadCount > 0 ? ` • ${group.unreadCount} não lidas` : ''}
                  </p>
                </div>
                <span>{formatRelative(group.latestCreatedAt)}</span>
              </div>
              <div className="notifications__group-items">
                {group.items.slice(0, ITEMS_PER_GROUP).map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    isMobile={isMobile}
                    isSwipeOpen={openSwipeId === notification.id}
                    onSwipeOpenChange={(open) => setOpenSwipeId(open ? notification.id : null)}
                    onOpenNotification={onOpenNotification}
                    onMarkAsRead={onMarkAsRead}
                    formatRelative={formatRelative}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {older.length > 0 ? (
        <div className="notifications__section">
          <div className="notifications__section-label">Anteriores</div>
          {older.map((group) => {
            const key = `older-${group.processId || group.latestCreatedAt}-${group.type}`
            return (
              <OlderGroup
                key={key}
                group={group}
                isExpanded={expandedOlderKeys.has(key)}
                onToggle={() => toggleOlderGroup(key)}
                isMobile={isMobile}
                openSwipeId={openSwipeId}
                setOpenSwipeId={setOpenSwipeId}
                onOpenNotification={onOpenNotification}
                onMarkAsRead={onMarkAsRead}
                formatRelative={formatRelative}
                formatDate={formatDate}
              />
            )
          })}
          {hasMoreOlder ? (
            <button
              type="button"
              className="ghost-button notifications__show-more"
              onClick={() => setOlderLimit((value) => value + OLDER_STEP)}
            >
              Ver mais {Math.min(OLDER_STEP, allOlder.length - olderLimit)} anteriores
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
