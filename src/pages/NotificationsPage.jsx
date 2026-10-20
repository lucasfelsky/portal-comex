import { useContext } from 'react'
import { NotificationsContext } from '../contexts/NotificationsContext'
import NotificationsList from '../components/NotificationsList'
import TabButton from '../components/TabButton'
import Icon from '../components/Icon'
import { FilterPill } from '../components/FilterChip'
import useMediaQuery from '../hooks/useMediaQuery'

// Refino F5a (Notificacoes.dc.html): >= 1041px a pagina usa a arvore `nt-*` (cabecalho
// com acoes em icone, pilulas com contagem, cartoes por grupo); tablet/mobile seguem
// na arvore anterior. Tema escuro: as classes `nt-*` sao novas — nao herdam os
// overrides `[data-theme='dark'] .notifications__group/__item` do legado.
const DESKTOP_QUERY = '(min-width: 1041px)'

// As mesmas 10 categorias do legado (D18), com o tipo de notificacao de cada uma.
const NOTIFICATION_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'process_question_created', label: 'Dúvidas' },
  { value: 'process_question_answered', label: 'Respostas' },
  { value: 'favorite_process_message', label: 'Favoritos' },
  { value: 'post_receipt_notes_updated', label: 'Pós-recebimento' },
  { value: 'collection_status_updated', label: 'Coleta' },
  { value: 'receipt_divergence_reported', label: 'Divergências' },
  { value: 'license_rejected', label: 'Anuências' },
  { value: 'process_daily_alerts', label: 'Alertas' },
  { value: 'process_document_uploaded', label: 'Documentos' },
]

export default function NotificationsPage() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
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
    isLoadingNotifications,
    notificationsLoadError,
    reloadNotifications,
  } = useContext(NotificationsContext)

  function formatRemaining(ms) {
    if (ms <= 0) return '0min'
    const totalMin = Math.ceil(ms / 60000)
    if (totalMin < 60) return `${totalMin}min`
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }

  if (isDesktop) {
    // Contagem de cada pilula = nao lidas daquela categoria ("Todas" = todas as pendentes).
    const unreadByFilter = (value) =>
      value === 'all'
        ? unreadNotifications.length
        : unreadNotifications.filter((item) => item.type === value).length
    const dndLabel = dnd.isActive
      ? `Desativar modo não perturbe (restam ${formatRemaining(dnd.remainingMs)})`
      : 'Ativar modo não perturbe por 1 hora'

    return (
      <section className="surface notifications-page notifications-page--desktop">
        <div className="nt-head">
          <div className="nt-head__text">
            <span className="nt-head__eyebrow">
              {unreadNotifications.length} pendentes
              {dnd.isActive ? ` · Silenciado (${formatRemaining(dnd.remainingMs)})` : ''}
            </span>
            <h2 className="nt-head__title">Central de notificações</h2>
          </div>
          <div className="nt-head__actions">
            <button
              type="button"
              className="secondary-button nt-head__mark-all"
              onClick={markAllAsRead}
              disabled={unreadNotifications.length === 0}
            >
              Marcar todas como lidas
            </button>
            <button
              type="button"
              className={`nt-icon-button nt-head__dnd${dnd.isActive ? ' nt-icon-button--active' : ''}`}
              onClick={() => {
                if (dnd.isActive) {
                  dnd.disable()
                } else {
                  dnd.enableFor(60 * 60 * 1000)
                }
              }}
              aria-pressed={dnd.isActive}
              aria-label={dndLabel}
              title={dnd.isActive ? `Silenciado por mais ${formatRemaining(dnd.remainingMs)}` : 'Silenciar por 1 hora'}
            >
              <Icon name="bell-slash" size={18} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="nt-icon-button nt-head__prefs"
              onClick={() => setIsPrefsModalOpen(true)}
              aria-label="Preferências de notificação"
              title="Preferências de notificação"
            >
              <Icon name="sliders" size={18} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        <div className="nt-filters" role="group" aria-label="Filtrar notificações">
          {NOTIFICATION_FILTERS.map((filter) => {
            const count = unreadByFilter(filter.value)
            const isActive = notificationFilter === filter.value
            return (
              <FilterPill
                key={filter.value}
                className="nt-filter"
                label={filter.label}
                count={count > 0 ? count : undefined}
                active={isActive}
                aria-label={
                  count > 0
                    ? `${filter.label} (${count} ${count === 1 ? 'não lida' : 'não lidas'})`
                    : filter.label
                }
                onClick={() => setNotificationFilter(filter.value)}
              />
            )
          })}
        </div>

        <div className="nt-list">
          <NotificationsList
            variant="page"
            grouped={groupedNotifications}
            onOpenNotification={handleOpenNotification}
            onMarkAsRead={markOneAsRead}
            formatRelative={formatRelativeNotificationTime}
            formatDate={formatNotificationDate}
            isLoading={isLoadingNotifications}
            loadError={notificationsLoadError}
            onRetry={reloadNotifications}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="surface notifications-page">
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
            className="ghost-button ghost-button--secondary notifications__mark-all"
            onClick={markAllAsRead}
            disabled={unreadNotifications.length === 0}
          >
            Marcar todas como lidas
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--outline notifications__prefs"
            onClick={() => setIsPrefsModalOpen(true)}
            aria-label="Preferências de notificação"
            title="Preferências de notificação"
          >
            <Icon name="settings" size={16} />
          </button>
          <button
            type="button"
            className={`ghost-button ghost-button--outline notifications__dnd${dnd.isActive ? ' notifications__dnd--active' : ''}`}
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
        <TabButton
          active={notificationFilter === 'collection_status_updated'}
          onClick={() => setNotificationFilter('collection_status_updated')}
        >
          Coleta
        </TabButton>
        <TabButton
          active={notificationFilter === 'receipt_divergence_reported'}
          onClick={() => setNotificationFilter('receipt_divergence_reported')}
        >
          Divergências
        </TabButton>
        <TabButton
          active={notificationFilter === 'license_rejected'}
          onClick={() => setNotificationFilter('license_rejected')}
        >
          Anuências
        </TabButton>
        <TabButton
          active={notificationFilter === 'process_daily_alerts'}
          onClick={() => setNotificationFilter('process_daily_alerts')}
        >
          Alertas
        </TabButton>
        <TabButton
          active={notificationFilter === 'process_document_uploaded'}
          onClick={() => setNotificationFilter('process_document_uploaded')}
        >
          Documentos
        </TabButton>
      </div>

      <div className="notifications__list">
        <NotificationsList
          grouped={groupedNotifications}
          onOpenNotification={handleOpenNotification}
          onMarkAsRead={markOneAsRead}
          formatRelative={formatRelativeNotificationTime}
          formatDate={formatNotificationDate}
          isLoading={isLoadingNotifications}
          loadError={notificationsLoadError}
          onRetry={reloadNotifications}
        />
      </div>
    </section>
  )
}
