// NotificationsList: lista de notificacoes do drawer com paginacao
// "ver mais" (Sprint 27).
//
// API:
//   <NotificationsList
//     grouped={[{ processId, type, title, items, unreadCount, latestCreatedAt }]}
//     onOpenNotification={(notification) => void}
//     formatRelative={(value) => string}
//     formatDate={(value) => string}
//   />
//
// Comportamento:
//   - Recentes: ate 8 grupos com itens (mostra ate 3 items por grupo)
//   - Anteriores: ate 4 grupos; se houver mais, botao "Ver mais" expande
//   - Empty state quando grouped vazio

import { useState } from 'react'

const RECENT_LIMIT = 8
const ITEMS_PER_GROUP = 3
const OLDER_INITIAL = 4
const OLDER_STEP = 8

export default function NotificationsList({
  grouped,
  onOpenNotification,
  formatRelative,
  formatDate,
}) {
  const [olderLimit, setOlderLimit] = useState(OLDER_INITIAL)

  if (!grouped || grouped.length === 0) {
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

  return (
    <>
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
                  <button
                    key={notification.id}
                    type="button"
                    className="notifications__item notifications__item--unread"
                    onClick={() => onOpenNotification(notification)}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <strong>{notification.title}</strong>
                    <p>{notification.body}</p>
                    <span>
                      {formatRelative(notification.createdAt)} •{' '}
                      {formatDate(notification.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {older.length > 0 ? (
        <div className="notifications__section">
          <div className="notifications__section-label">Anteriores</div>
          {older.map((group) => (
            <div
              key={`older-${group.processId || group.latestCreatedAt}-${group.type}`}
              className="notifications__group"
            >
              <div className="notifications__group-header">
                <div>
                  <strong>{group.title}</strong>
                  <p>{group.items.length} notificações</p>
                </div>
                <span>{formatRelative(group.latestCreatedAt)}</span>
              </div>
            </div>
          ))}
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
