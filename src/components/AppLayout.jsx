import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import sqLogo from '../../assets/logo.png'
import useAuth from '../hooks/useAuth'
import {
  NOTIFICATIONS_CHANGED_EVENT,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/notificationsRepository'
import { getDailyPtaxRates } from '../services/exchangeRatesRepository'

const navigation = [
  { to: '/', label: 'Dashboard', description: 'Visão geral do fluxo' },
  { to: '/news', label: 'Notícias', description: 'Postagens e atualizações' },
  { to: '/processos', label: 'Processos', description: 'Fila e acompanhamento' },
  { to: '/admin', label: 'Admin', description: 'Governança e ajustes', roles: ['admin'] },
]

const pageMeta = {
  '/': {
    title: 'Dashboard operacional',
  },
  '/news': {
    title: 'Notícias',
  },
  '/processos': {
    title: 'Central de processos',
  },
  '/admin': {
    title: 'Painel administrativo',
  },
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, logout } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState('all')
  const [ptaxRates, setPtaxRates] = useState(null)
  const notificationPanelRef = useRef(null)
  const meta = pageMeta[location.pathname] ?? pageMeta['/']
  const visibleNavigation = navigation.filter(
    (item) => !item.roles || item.roles.includes(profile?.role)
  )
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.isRead),
    [notifications]
  )
  const filteredNotifications = useMemo(() => {
    if (notificationFilter === 'all') return notifications
    return notifications.filter((item) => item.type === notificationFilter)
  }, [notificationFilter, notifications])
  const groupedNotifications = useMemo(() => {
    const groups = new Map()

    filteredNotifications.forEach((notification) => {
      const groupKey = `${notification.processId || notification.id}:${notification.type}`
      const currentGroup = groups.get(groupKey) ?? {
        processId: notification.processId,
        type: notification.type,
        title: notification.title,
        items: [],
        unreadCount: 0,
        latestCreatedAt: notification.createdAt,
      }

      currentGroup.items.push(notification)
      currentGroup.unreadCount += notification.isRead ? 0 : 1

      const currentGroupTime = new Date(currentGroup.latestCreatedAt ?? 0).getTime()
      const notificationTime = new Date(notification.createdAt ?? 0).getTime()

      if (notificationTime > currentGroupTime) {
        currentGroup.latestCreatedAt = notification.createdAt
        currentGroup.title = notification.title
      }

      groups.set(groupKey, currentGroup)
    })

    return [...groups.values()].sort((left, right) => {
      const leftTime = new Date(left.latestCreatedAt ?? 0).getTime()
      const rightTime = new Date(right.latestCreatedAt ?? 0).getTime()
      return rightTime - leftTime
    })
  }, [filteredNotifications])

  useEffect(() => {
    if (!profile?.uid) {
      setNotifications([])
      return undefined
    }

    let isMounted = true

    async function loadNotifications() {
      try {
        const loadedNotifications = await listNotifications(profile.uid)
        if (isMounted) {
          setNotifications(loadedNotifications)
        }
      } catch (error) {
        console.error('Falha ao carregar notificações.', error)
      }
    }

    function handleNotificationsChanged(event) {
      const affectedRecipients = event?.detail?.recipientUserIds ?? []
      if (affectedRecipients.length === 0 || affectedRecipients.includes(profile.uid)) {
        loadNotifications()
      }
    }

    function handleWindowFocus() {
      loadNotifications()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadNotifications()
      }
    }

    loadNotifications()
    const intervalId = window.setInterval(loadNotifications, 10000)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [profile?.uid])

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    setIsNotificationPanelOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let isMounted = true

    async function loadPtaxRates() {
      try {
        const rates = await getDailyPtaxRates()
        if (isMounted) {
          setPtaxRates(rates)
        }
      } catch (error) {
        console.error('Falha ao carregar a PTAX.', error)
      }
    }

    loadPtaxRates()
    const intervalId = window.setInterval(loadPtaxRates, 30 * 60 * 1000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!isNotificationPanelOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      if (notificationPanelRef.current?.contains(event.target)) {
        return
      }

      setIsNotificationPanelOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [isNotificationPanelOpen])

  async function handleOpenNotification(notification) {
    try {
      if (!notification.isRead) {
        await markNotificationAsRead(notification.id)
      }
    } catch (error) {
      console.error('Falha ao marcar notificação como lida.', error)
    } finally {
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) =>
          item.id === notification.id
            ? { ...item, isRead: true, readAt: new Date().toISOString() }
            : item
        )
      )
      setIsNotificationPanelOpen(false)
      navigate('/processos', {
        state: {
          selectedProcessId: notification.processId,
          detailTab: notification.targetTab ?? 'messages',
        },
      })
    }
  }

  async function handleMarkAllNotificationsAsRead() {
    if (!profile?.uid || unreadNotifications.length === 0) return

    try {
      await markAllNotificationsAsRead(profile.uid)
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt ?? new Date().toISOString(),
        }))
      )
    } catch (error) {
      console.error('Falha ao marcar notificações como lidas.', error)
    }
  }

  function formatNotificationDate(value) {
    if (!value) return ''

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  function formatRelativeNotificationTime(value) {
    if (!value) return ''

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    const diffInMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))

    if (diffInMinutes < 1) return 'agora'
    if (diffInMinutes < 60) return `há ${diffInMinutes} min`

    const diffInHours = Math.round(diffInMinutes / 60)
    if (diffInHours < 24) return `há ${diffInHours} h`

    const diffInDays = Math.round(diffInHours / 24)
    return `há ${diffInDays} d`
  }

  function formatCurrencyRate(value) {
    if (!Number.isFinite(value) || value <= 0) return '--'

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(value)
  }

  function formatPtaxTimestamp(value) {
    if (!value) return ''

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  return (
    <div className="shell">
      {isMobileMenuOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      <div className="shell__frame">
        <aside className={`sidebar${isMobileMenuOpen ? ' sidebar--mobile-open' : ''}`}>
          <div className="brand">
            <span className="brand__eyebrow">SQ Quimica</span>
            <h1>Portal COMEX</h1>
            <div className="brand__ptax">
              <strong>PTAX do dia</strong>
              <div className="brand__ptax-rates">
                <p>USD venda: {formatCurrencyRate(ptaxRates?.usd?.sell)}</p>
                <p>EUR venda: {formatCurrencyRate(ptaxRates?.eur?.sell)}</p>
              </div>
              {ptaxRates?.updatedAt ? (
                <span>Atualizado em {formatPtaxTimestamp(ptaxRates.updatedAt)}</span>
              ) : (
                <span>Buscando última cotação disponível</span>
              )}
            </div>
          </div>

          <nav id="primary-navigation" className="nav" aria-label="Principal">
            {visibleNavigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
              >
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar__brandmark" aria-label="SQ Química">
            <img src={sqLogo} alt="Logo da SQ Química" className="sidebar__brandmark-image" />
          </div>
        </aside>

        <div className="main-content">
          <header className="topbar">
            <div>
              <button
                type="button"
                className="topbar__menu-button"
                aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
                aria-expanded={isMobileMenuOpen}
                aria-controls="primary-navigation"
                onClick={() => setIsMobileMenuOpen((current) => !current)}
              >
                <span className="topbar__menu-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              <h2 className="topbar__title">
                {meta.title}
              </h2>
            </div>
            <div className="topbar__actions">
              <div className="notifications" ref={notificationPanelRef}>
                <button
                  type="button"
                  className={`ghost-button notifications__trigger${isNotificationPanelOpen ? ' notifications__trigger--active' : ''}`}
                  onClick={() => setIsNotificationPanelOpen((current) => !current)}
                >
                  Notificações
                  {unreadNotifications.length > 0 ? (
                    <span className="notifications__count">{unreadNotifications.length}</span>
                  ) : null}
                </button>

                {isNotificationPanelOpen ? (
                  <div className="notifications__panel">
                    <div className="card-heading">
                      <div>
                        <strong>Central de notificações</strong>
                        <p>{unreadNotifications.length} pendentes</p>
                      </div>
                      <button
                        type="button"
                        className="ghost-button notifications__mark-all"
                        onClick={handleMarkAllNotificationsAsRead}
                        disabled={unreadNotifications.length === 0}
                      >
                        Marcar todas como Lidas
                      </button>
                    </div>

                    <div className="tab-row notifications__filters">
                      <button
                        type="button"
                        className={`tab-button${notificationFilter === 'all' ? ' tab-button--active' : ''}`}
                        onClick={() => setNotificationFilter('all')}
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        className={`tab-button${notificationFilter === 'process_question_created' ? ' tab-button--active' : ''}`}
                        onClick={() => setNotificationFilter('process_question_created')}
                      >
                        Dúvidas
                      </button>
                      <button
                        type="button"
                        className={`tab-button${notificationFilter === 'process_question_answered' ? ' tab-button--active' : ''}`}
                        onClick={() => setNotificationFilter('process_question_answered')}
                      >
                        Respostas
                      </button>
                      <button
                        type="button"
                        className={`tab-button${notificationFilter === 'favorite_process_message' ? ' tab-button--active' : ''}`}
                        onClick={() => setNotificationFilter('favorite_process_message')}
                      >
                        Favoritos
                      </button>
                    </div>

                    <div className="notifications__list">
                      {groupedNotifications.length > 0 ? (
                        groupedNotifications.slice(0, 8).map((group) => (
                          <div
                            key={`${group.processId || group.latestCreatedAt}-${group.type}`}
                            className={`notifications__group${group.unreadCount > 0 ? ' notifications__group--unread' : ''}`}
                          >
                            <div className="notifications__group-header">
                              <div>
                                <strong>{group.title}</strong>
                                <p>
                                  {group.items.length} notificações
                                  {group.unreadCount > 0 ? ` • ${group.unreadCount} não lidas` : ''}
                                </p>
                              </div>
                              <span>{formatRelativeNotificationTime(group.latestCreatedAt)}</span>
                            </div>

                            <div className="notifications__group-items">
                              {group.items.slice(0, 3).map((notification) => (
                                <button
                                  key={notification.id}
                                  type="button"
                                  className={`notifications__item${notification.isRead ? '' : ' notifications__item--unread'}`}
                                  onClick={() => handleOpenNotification(notification)}
                                >
                                  <strong>{notification.title}</strong>
                                  <p>{notification.body}</p>
                                  <span>
                                    {formatRelativeNotificationTime(notification.createdAt)} • {formatNotificationDate(notification.createdAt)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">
                          <strong>Nenhuma notificação</strong>
                          <p>As novas dúvidas e respostas dos processos aparecerão aqui.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="topbar__profile">
                <strong>{profile?.name ?? 'Usuário'}</strong>
                <span>{profile?.email ?? 'Sem email'}</span>
              </div>
              <button type="button" className="ghost-button" onClick={logout}>
                Sair
              </button>
            </div>
          </header>

          <Outlet />
        </div>
      </div>
    </div>
  )
}
