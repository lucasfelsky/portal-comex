import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Icon from './Icon'
import Breadcrumb from './Breadcrumb'
import CommandPalette, { useCommandPalette } from './CommandPalette'
import PageFade from './PageFade'
import TabButton from './TabButton'
import Tooltip from './Tooltip'
import NotificationsList from './NotificationsList'
import SupportButton, { OPEN_SUPPORT_MODAL_EVENT } from './SupportButton'
import NotificationPreferencesModal from './NotificationPreferencesModal'
import { useDoNotDisturb, formatRemaining } from '../hooks/useDoNotDisturb'
import { useFcm } from '../hooks/useFcm'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { useTheme } from '../hooks/useTheme'
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
  '/menu': { title: 'Menu', breadcrumb: [] },
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
  '/admin/suporte': {
    title: 'Suporte',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Suporte' }],
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
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false)
  const [ptaxRates, setPtaxRates] = useState(null)
  const notificationPanelRef = useRef(null)
  const notificationPanelCloseTimeoutRef = useRef(null)

  // C15: swipe gesture no drawer (so mobile). matchMedia evita ativar
  // em desktop (onde nao tem touch e poderia interferir com trackpad).
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1040px)')
    setIsMobileViewport(mq.matches)
    const handler = (event) => setIsMobileViewport(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // F16.2: o drawer aposentou no mobile (a tela /menu assumiu na tab bar) —
  // o swipe lateral que o abria (C15) saiu junto. O swipe-back de conteúdo
  // (detalhe→lista) vive nas páginas, não aqui.

  // Layout mobile (<=720px): topbar some e a bottom-nav aparece (ver
  // styles.css). O painel de notificacao precisa renderizar SO uma vez por
  // viewport: ancorado ao sino do topbar no desktop, ou como bottom-sheet
  // standalone no mobile (onde o topbar — e o painel dentro dele — some).
  // Renderizar nos dois lugares duplicava painel + backdrop no desktop.
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    setIsMobileLayout(mq.matches)
    const handler = (event) => setIsMobileLayout(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Command palette (Ctrl+K / Cmd+K)
  const commandPalette = useCommandPalette()
  const globalSearch = useGlobalSearch(profile?.role === 'admin')
  const processSearcherForPalette = globalSearch.searcher
  const dnd = useDoNotDisturb()
  const fcm = useFcm(profile?.uid)
  // C17 (toggle): tema claro/escuro/automatico, persistido em localStorage.
  const theme = useTheme()
  const themeLabel = { auto: 'Tema: automático', dark: 'Tema: escuro', light: 'Tema: claro' }[theme.preference]
  const themeIcon = { auto: 'theme-auto', dark: 'moon', light: 'sun' }[theme.preference]
  const commandItems = useMemo(
    () => [
      { id: 'go-dashboard', label: 'Dashboard', group: 'Páginas', to: '/', icon: 'dashboard', keywords: ['home', 'inicio'] },
      { id: 'go-news', label: 'Notícias', group: 'Páginas', to: '/news', icon: 'news' },
      { id: 'go-processes', label: 'Chegadas', group: 'Páginas', to: '/processos', icon: 'arrivals' },
      ...(profile?.role === 'admin'
        ? [
            { id: 'go-admin', label: 'Painel administrativo', group: 'Admin', to: '/admin', icon: 'admin' },
            { id: 'go-admin-users', label: 'Usuários', group: 'Admin', to: '/admin/usuarios', icon: 'admin' },
            { id: 'go-admin-announcements', label: 'Comunicados', group: 'Admin', to: '/admin/comunicados', icon: 'news' },
            { id: 'go-admin-bar', label: 'Barra do porto', group: 'Admin', to: '/admin/barra', icon: 'inbox' },
            { id: 'go-admin-forecast', label: 'Regras de previsão', group: 'Admin', to: '/admin/previsoes', icon: 'sparkle' },
            { id: 'go-admin-support', label: 'Suporte', group: 'Admin', to: '/admin/suporte', icon: 'help', keywords: ['chamado', 'bug', 'ticket'] },
            { id: 'go-intelliquote', label: 'IntelliQuote (suite SQ)', group: 'Externo', to: INTELLIQUOTE_WEB_URL, icon: 'external', keywords: ['quote', 'cotacao'] },
          ]
        : []),
      { id: 'action-logout', label: 'Sair', group: 'Conta', icon: 'logout', action: logout },
    ],
    [profile?.role]
  )

  const meta = pageMeta[location.pathname] ?? pageMeta[location.pathname.startsWith('/admin') ? '/admin' : '/']

  // F16.2: large title por página no mobile (substitui o brand header fixo
  // "Portal COMEX") + nav compacta com blur que aparece ao rolar, como o
  // UINavigationBar do iOS. Título curto próprio; admin usa o meta.title.
  const mobileTitle =
    { '/': 'Início', '/news': 'Notícias', '/processos': 'Chegadas', '/menu': 'Menu' }[
      location.pathname
    ] ?? meta.title
  const mobileEyebrow = useMemo(() => {
    if (location.pathname !== '/') return null
    const text = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    return text.charAt(0).toUpperCase() + text.slice(1)
  }, [location.pathname])
  const [isPageScrolled, setIsPageScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setIsPageScrolled(window.scrollY > 48)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
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

  // Marca-como-lida (backend + estado local otimista) isolado do
  // fechar-painel/navegar — reusado pelo tap normal (handleOpenNotification)
  // e pelo swipe-to-mark-as-read (F16.8), que só quer o "marcar como lida"
  // sem sair do painel.
  async function markOneNotificationAsRead(notification) {
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
    }
  }

  async function handleOpenNotification(notification) {
    await markOneNotificationAsRead(notification)
    handleCloseNotificationPanel()
    // Chamados de suporte moram na aba administrativa, não na central de
    // chegadas (backlog 2026-07-10).
    if (notification.type === 'support_ticket') {
      navigate('/admin/suporte')
      return
    }
    // Suporte v2: o AUTOR é avisado quando o chamado dele é resolvido. O
    // clique abre o modal de suporte ("Meus chamados") — o autor comum não
    // tem acesso à rota /admin/suporte.
    if (notification.type === 'support_ticket_resolved') {
      window.dispatchEvent(new Event(OPEN_SUPPORT_MODAL_EVENT))
      return
    }
    navigate('/processos', {
      state: {
        selectedProcessId: notification.processId,
        detailTab: notification.targetTab ?? 'messages',
      },
    })
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
          ref={notificationPanelRef}
          className={`notifications__panel${isNotificationPanelOpen ? '' : ' notifications__panel--closing'}`}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <div className="card-heading">
            <div>
              <strong>Central de notificações</strong>
              <p>
                {unreadNotifications.length} pendentes
                {dnd.isActive ? ` · Silenciado (${formatRemaining(dnd.remainingMs)})` : ''}
              </p>
            </div>
            <div className="notifications__heading-actions">
              <button
                type="button"
                className="ghost-button notifications__mark-all"
                onClick={handleMarkAllNotificationsAsRead}
                disabled={unreadNotifications.length === 0}
              >
                Marcar todas como Lidas
              </button>
              {/* F9: o toggle de FCM saiu daqui (sino duplicado) — push agora
                  e' um canal dentro das preferencias. */}
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
                    dnd.enableFor(60 * 60 * 1000) // 1h
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
              onMarkAsRead={markOneNotificationAsRead}
              formatRelative={formatRelativeNotificationTime}
              formatDate={formatNotificationDate}
            />
          </div>
        </div>
      </>
    )
  }

  function renderNotificationsControl(triggerClassName = 'ghost-button notifications__trigger') {
    return (
      <div className="notifications">
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
        {/* Painel ancorado ao sino — só no desktop. No mobile o topbar some
            e o painel renderiza como bottom-sheet standalone (ver abaixo). */}
        {!isMobileLayout ? renderNotificationsPanel() : null}
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

          {profile?.role === 'admin' ? (
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
          ) : null}

          <button
            type="button"
            className="ghost-button sidebar-theme-button"
            onClick={theme.cyclePreference}
            aria-label={`${themeLabel} — alternar tema`}
            title="Alternar tema (automático / escuro / claro)"
          >
            <Icon name={themeIcon} size={16} aria-hidden="true" />
            <span>{themeLabel}</span>
          </button>

          <button
            type="button"
            className="ghost-button sidebar-logout-button"
            onClick={logout}
          >
            <Icon name="logout" size={16} aria-hidden="true" />
            <span>Sair</span>
          </button>
        </aside>

        <div className="main-content">
          <div
            className={`mobile-nav-compact${isPageScrolled ? ' mobile-nav-compact--visible' : ''}`}
            aria-hidden="true"
          >
            {mobileTitle}
          </div>
          <div className="mobile-page-header">
            {mobileEyebrow ? (
              <span className="mobile-page-header__eyebrow">{mobileEyebrow}</span>
            ) : null}
            <h1 className="mobile-page-header__title">{mobileTitle}</h1>
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
              {ptaxRates ? (
                <div className="topbar__ptax" aria-label="Cotação PTAX do dia">
                  <span className="topbar__ptax-pair">
                    <span className="topbar__ptax-label">USD</span>
                    <span className="topbar__ptax-value">{formatCurrencyRate(ptaxRates?.usd?.sell)}</span>
                  </span>
                  <span className="topbar__ptax-pair">
                    <span className="topbar__ptax-label">EUR</span>
                    <span className="topbar__ptax-value">{formatCurrencyRate(ptaxRates?.eur?.sell)}</span>
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                className="ghost-button topbar-theme-button"
                onClick={theme.cyclePreference}
                aria-label={`${themeLabel} — alternar tema`}
                title={themeLabel}
              >
                <Icon name={themeIcon} size={17} aria-hidden="true" />
              </button>
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
                <Tooltip label="Encerrar sessão" side="bottom">
                  <button type="button" className="ghost-button topbar__logout" onClick={logout}>
                    <Icon name="logout" size={16} />
                    <span>Sair</span>
                  </button>
                </Tooltip>
              </div>
            </div>
          </header>

          {!isEmailVerified ? (
            <div style={{ padding: '0 24px 16px' }}>
              <div className="detail-card detail-card--warning">
                <span className="detail-label">Confirmação pendente</span>
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

          <PageFade>
            <Outlet />
          </PageFade>

          <SupportButton />

          <NotificationPreferencesModal
            open={isPrefsModalOpen}
            onClose={() => setIsPrefsModalOpen(false)}
            profile={profile}
            fcm={fcm}
          />

          {isMobileLayout && isNotificationPanelMounted ? renderNotificationsPanel() : null}

          {/* F16.2 (redesign iOS): tab bar nova — Início/Chegadas/Notícias/
              Avisos/Menu. Suporte migrou pra tela Menu; o drawer não é mais
              alcançável no mobile. */}
          <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `mobile-bottom-nav__item${isActive ? ' mobile-bottom-nav__item--active' : ''}`
              }
              aria-label="Início"
            >
              <Icon name="house" size={22} aria-hidden="true" />
              <span className="mobile-bottom-nav__label">Início</span>
            </NavLink>

            <NavLink
              to="/processos"
              className={({ isActive }) =>
                `mobile-bottom-nav__item${isActive ? ' mobile-bottom-nav__item--active' : ''}`
              }
              aria-label="Chegadas"
            >
              <Icon name="ship" size={22} aria-hidden="true" />
              <span className="mobile-bottom-nav__label">Chegadas</span>
            </NavLink>

            <NavLink
              to="/news"
              className={({ isActive }) =>
                `mobile-bottom-nav__item${isActive ? ' mobile-bottom-nav__item--active' : ''}`
              }
              aria-label="Notícias"
            >
              <Icon name="news" size={22} aria-hidden="true" />
              <span className="mobile-bottom-nav__label">Notícias</span>
            </NavLink>

            <button
              type="button"
              className="mobile-bottom-nav__item"
              aria-label="Notificações"
              onClick={handleToggleNotificationPanel}
            >
              <Icon name="bell" size={22} aria-hidden="true" />
              <span className="mobile-bottom-nav__label">Avisos</span>
              {unreadNotifications.length > 0 ? (
                <span className="mobile-bottom-nav__badge">{unreadNotifications.length}</span>
              ) : null}
            </button>

            <NavLink
              to="/menu"
              className={({ isActive }) =>
                `mobile-bottom-nav__item${isActive ? ' mobile-bottom-nav__item--active' : ''}`
              }
              aria-label="Menu"
            >
              <Icon name="person" size={22} aria-hidden="true" />
              <span className="mobile-bottom-nav__label">Menu</span>
            </NavLink>
          </nav>
        </div>
      </div>

      <CommandPalette
        open={commandPalette.open}
        onClose={() => commandPalette.setOpen(false)}
        commands={commandItems}
        searcher={processSearcherForPalette}
        placeholder="Buscar páginas, ações ou processos..."
      />
    </div>
  )
}
