import { useContext } from 'react'
import { NotificationsContext } from '../contexts/NotificationsContext'
import NotificationsList from '../components/NotificationsList'
import TabButton from '../components/TabButton'
import Icon from '../components/Icon'

export default function NotificationsPage() {
  const {
    notifications,
    unreadNotifications,
    groupedNotifications,
    notificationFilter,
    setNotificationFilter,
    markAllAsRead,
    markOneAsRead,
    handleOpenNotification,
    formatRelativeNotificationTime,
    formatNotificationDate,
    dnd,
    isPrefsModalOpen,
    setIsPrefsModalOpen,
  } = useContext(NotificationsContext)

  function formatRemaining(ms) {
    if (ms <= 0) return '0min'
    const totalMin = Math.ceil(ms / 60000)
    if (totalMin < 60) return `${totalMin}min`
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }

  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>Central de notificações</h2>
          <p>
            {unreadNotifications.length} pendentes
            {dnd.isActive ? ` · Silenciado (${formatRemaining(dnd.remainingMs)})` : ''}
          </p>
        </div>
        <div className="notifications__heading-actions">
          <button
            type="button"
            className="ghost-button notifications__mark-all"
            onClick={markAllAsRead}
            disabled={unreadNotifications.length === 0}
          >
            Marcar todas como Lidas
          </button>
          <button
            type="button"
            className="ghost-button notifications__prefs"
            onClick={() => setIsPrefsModalOpen(true)}
            aria-label="Preferências de notificação"
            title="Preferências de notificação"
          >
            <Icon name="settings" size={16} />
          </button>
          <button
            type="button"
            className={`ghost-button notifications__dnd${dnd.isActive ? ' notifications__dnd--active' : ''}`}
            onClick={() => {
              if (dnd.isActive) {
                dnd.disable()
              } else {
                dnd.enableFor(60 * 60 * 1000)
              }
            }}
            aria-pressed={dnd.isActive}
            aria-label={
              dnd.isActive
                ? `Desativar modo não perturbe (restam ${formatRemaining(dnd.remainingMs)})`
                : 'Ativar modo não perturbe por 1 hora'
            }
            title={dnd.isActive ? `Silenciado por mais ${formatRemaining(dnd.remainingMs)}` : 'Silenciar por 1 hora'}
          >
            <Icon name="bell" size={16} />
          </button>
        </div>
      </div>

      <div className="tab-row notifications__filters">
        <TabButton
          active={notificationFilter === 'all'}
          onClick={() => setNotificationFilter('all')}
        >
          Todas
        </TabButton>
        <TabButton
          active={notificationFilter === 'process_question_created'}
          onClick={() => setNotificationFilter('process_question_created')}
        >
          Dúvidas
        </TabButton>
        <TabButton
          active={notificationFilter === 'process_question_answered'}
          onClick={() => setNotificationFilter('process_question_answered')}
        >
          Respostas
        </TabButton>
        <TabButton
          active={notificationFilter === 'favorite_process_message'}
          onClick={() => setNotificationFilter('favorite_process_message')}
        >
          Favoritos
        </TabButton>
        <TabButton
          active={notificationFilter === 'post_receipt_notes_updated'}
          onClick={() => setNotificationFilter('post_receipt_notes_updated')}
        >
          Pós-recebimento
        </TabButton>
      </div>

      <div className="notifications__list">
        <NotificationsList
          grouped={groupedNotifications}
          onOpenNotification={handleOpenNotification}
          onMarkAsRead={markOneAsRead}
          formatRelative={formatRelativeNotificationTime}
          formatDate={formatNotificationDate}
        />
      </div>
    </section>
  )
}
