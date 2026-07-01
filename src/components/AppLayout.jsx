import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Icon from './Icon'
import Breadcrumb from './Breadcrumb'
import {
  NOTIFICATIONS_CHANGED_EVENT,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/notificationsRepository'
import { getDailyPtaxRates } from '../services/exchangeRatesRepository'

const NOTIFICATION_PANEL_ANIMATION_MS = 220

const INTELLIQUOTE_WEB_URL =
  import.meta.env.VITE_INTELLIQUOTE_WEB_URL ?? 'https://intelliquote.portal-comex.com'

// Iniciais para o avatar da topbar (Sprint 11 / polish).
// Pega ate 2 letras do primeiro + ultimo nome. Fallback '?'.
function getInitials(value) {
  const cleaned = String(value ?? '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const navigation = [
  { to: '/', label: 'Dashboard', description: 'Visão geral do fluxo', icon: 'dashboard' },
  { to: '/news', label: 'Notícias', description: 'Postagens e atualizações', icon: 'news' },
  { to: '/processos', label: 'Chegadas', description: 'Fila de chegadas', icon: 'arrivals' },
  { to: '/admin', label: 'Admin', description: 'Governança e ajustes', icon: 'admin', roles: ['admin'] },
]

const pageMeta = {
  '/': { title: 'Dashboard operacional', breadcrumb: [] },
  '/news': { title: 'Notícias', breadcrumb: [] },
  '/processos': { title: 'Central de chegadas', breadcrumb: [] },
  '/admin': { title: 'Painel administrativo', breadcrumb: [{ label: 'Admin' }] },
  '/admin/usuarios': {
    title: 'Usuários',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Usuários' }],
  },
  '/admin/comunicados': {
    title: 'Comunicados',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Comunicados' }],
  },
  '/admin/barra': {
    title: 'Barra do porto',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Barra do porto' }],
  },
  '/admin/previsoes': {
    title: 'Regras de previsão',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Regras de previsão' }],
  },
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, logout, isEmailVerified } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false)
  const [isNotificationPanelMounted, setIsNotificationPanelMounted] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState('all')
  const [ptaxRates, setPtaxRates] = useState(null)
  const notificationPanelRef = useRef(null)
  const notificationPanelCloseTimeoutRef = useRef(null)

  const meta = pageMeta[location.pathname] ?? pageMeta[location.pathname.startsWith('/admin') ? '/admin' : '/']
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
    handleCloseNotificationPanel(true)
  }, [location.pathname])

  useEffect(() => {
    return () => {
      if (notificationPanelCloseTimeoutRef.current) {
        window.clearTimeout(notificationPanelCloseTimeoutRef.current)
      }
    }
  }, [])

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

      handleCloseNotificationPanel()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [isNotificationPanelOpen])

  function handleOpenNotificationPanel() {
    if (notificationPanelCloseTimeoutRef.current) {
      window.clearTimeout(notificationPanelCloseTimeoutRef.current)
      notificationPanelCloseTimeoutRef.current = null
    }

    setIsNotificationPanelMounted(true)
    window.requestAnimationFrame(() => {
      setIsNotificationPanelOpen(true)
    })
  }

  function handleCloseNotificationPanel(skipAnimation = false) {
    if (notificationPanelCloseTimeoutRef.current) {
      window.clearTimeout(notificationPanelCloseTimeoutRef.current)
      notificationPanelCloseTimeoutRef.current = null
    }

    setIsNotificationPanelOpen(false)

    if (skipAnimation) {
      setIsNotificationPanelMounted(false)
      return
    }

    notificationPanelCloseTimeoutRef.current = window.setTimeout(() => {
      setIsNotificationPanelMounted(false)
      notificationPanelCloseTimeoutRef.current = null
    }, NOTIFICATION_PANEL_ANIMATION_MS)
  }

  function handleToggleNotificationPanel() {
    if (isNotificationPanelOpen || isNotificationPanelMounted) {
      handleCloseNotificationPanel()
      return
    }

    handleOpenNotificationPanel()
  }

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
      handleCloseNotificationPanel()
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

  function renderNotificationsPanel() {
    if (!isNotificationPanelMounted) return null

    return (
      <>
        <button
          type="button"
          className={`notifications-backdrop${isNotificationPanelOpen ? '' : ' notifications-backdrop--closing'}`}
          aria-label="Fechar notificações"
          onClick={() => handleCloseNotificationPanel()}
        />
        <div
          className={`notifications__panel${isNotificationPanelOpen ? '' : ' notifications__panel--closing'}`}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
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
            <button
              type="button"
              className={`tab-button${notificationFilter === 'post_receipt_notes_updated' ? ' tab-button--active' : ''}`}
              onClick={() => setNotificationFilter('post_receipt_notes_updated')}
            >
              Pós-recebimento
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
      </>
    )
  }

  function renderNotificationsControl(triggerClassName = 'ghost-button notifications__trigger') {
    return (
      <div className="notifications" ref={notificationPanelRef}>
        <button
          type="button"
          className={`${triggerClassName}${isNotificationPanelOpen ? ' notifications__trigger--active' : ''}`}
          aria-label="Notificações"
          onClick={handleToggleNotificationPanel}
        >
          <span className="notifications__label">Notificações</span>
          {unreadNotifications.length > 0 ? (
            <span className="notifications__count">{unreadNotifications.length}</span>
          ) : null}
        </button>
        {renderNotificationsPanel()}
      </div>
    )
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
            <span className="brand__eyebrow">SQ Química</span>
            <h1>Portal COMEX</h1>
          </div>

          <nav id="primary-navigation" className="nav" aria-label="Principal">
            {visibleNavigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
              >
                {item.icon ? (
                  <span className="nav__link-icon" aria-hidden="true">
                    <Icon name={item.icon} size={18} />
                  </span>
                ) : null}
                <span className="nav__link-text">
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="brand__ptax">
            <strong>PTAX DO DIA</strong>
            <div className="brand__ptax-rates">
              <p>USD {formatCurrencyRate(ptaxRates?.usd?.sell)}</p>
              <p>EUR {formatCurrencyRate(ptaxRates?.eur?.sell)}</p>
            </div>
            {ptaxRates?.updatedAt ? (
              <span>{formatPtaxTimestamp(ptaxRates.updatedAt)}</span>
            ) : (
              <span>Atualizando cotação</span>
            )}
          </div>

          <a
            className="sidebar-intelliquote-link"
            href={INTELLIQUOTE_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir IntelliQuote em nova aba"
          >
            <span className="sidebar-intelliquote-link__eyebrow">Suite SQ</span>
            <strong className="sidebar-intelliquote-link__title">IntelliQuote</strong>
            <span className="sidebar-intelliquote-link__arrow" aria-hidden="true">
              <Icon name="external" size={16} />
            </span>
          </a>
        </aside>

        <div className="main-content">
          <div className="mobile-brand-header" aria-label="Portal COMEX">
            <span className="mobile-brand-header__eyebrow">SQ Química</span>
            <div className="mobile-brand-header__row">
              <strong className="mobile-brand-header__title">Portal COMEX</strong>
            </div>
          </div>

          <header className="topbar">
            <div className="topbar__heading">
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
              <div className="topbar__title-wrap">
                {meta.breadcrumb && meta.breadcrumb.length > 0 ? (
                  <Breadcrumb items={meta.breadcrumb} />
                ) : null}
                {meta.breadcrumb && meta.breadcrumb.length > 0 ? null : (
                  <h2 className="topbar__title">{meta.title}</h2>
                )}
              </div>
            </div>
            <div className="topbar__actions">
              {renderNotificationsControl()}
              <div className="topbar__user">
                <div className="topbar__avatar" aria-hidden="true">
                  {getInitials(profile?.name ?? profile?.email ?? '?')}
                </div>
                <div className="topbar__user-info">
                  <strong>{profile?.name ?? 'Usuário'}</strong>
                  <span>{profile?.email ?? 'Sem email'}</span>
                </div>
                {profile?.role ? (
                  <span className={`topbar__role-badge topbar__role-badge--${profile.role}`}>
                    {profile.role}
                  </span>
                ) : null}
                <button type="button" className="ghost-button topbar__logout" onClick={logout}>
                  <Icon name="logout" size={16} />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          </header>

          {!isEmailVerified ? (
            <div style={{ padding: '0 24px 16px' }}>
              <div className="detail-card detail-card--warning">
                <span className="detail-label">Confirmacao pendente</span>
                <p>
                  Seu email corporativo ainda nao foi confirmado. O acesso foi mantido para nao
                  interromper a operacao, mas a conta precisa ser regularizada.
                </p>
                <div className="action-row">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => navigate('/verificar-email')}
                  >
                    Abrir confirmacao
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <Outlet />

          <div className="mobile-page-logout">
            <button type="button" className="ghost-button mobile-page-logout__button" onClick={logout}>
              Sair
            </button>
          </div>

          <div className="mobile-notifications-fab">
            {renderNotificationsControl('ghost-button notifications__trigger mobile-notifications-fab__trigger')}
          </div>

          <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
            <button
              type="button"
              className="mobile-bottom-nav__item mobile-bottom-nav__item--icon"
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
              <span className="mobile-bottom-nav__label">Menu</span>
            </button>
          </nav>
        </div>
      </div>
    </div>
  )
}
