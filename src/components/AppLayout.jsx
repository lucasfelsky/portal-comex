import { useEffect, useMemo, useRef, useState, useContext } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Icon from './Icon'
import Breadcrumb from './Breadcrumb'
import { ProductMark } from './BrandMark'
import CommandPalette, { useCommandPalette } from './CommandPalette'
import PageFade from './PageFade'
import NotificationsList from './NotificationsList'
import { NotificationsContext } from '../contexts/NotificationsContext'
import SupportButton, { OPEN_SUPPORT_MODAL_EVENT } from './SupportButton'
import NotificationPreferencesModal from './NotificationPreferencesModal'
import { formatRemaining } from '../hooks/useDoNotDisturb'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { canSeeProcessName, getProcessTitle } from '../features/processes/processLabels'
import { getActiveProcess, subscribeActiveProcess } from '../utils/activeProcessContext'
import { useTheme } from '../hooks/useTheme'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext'
import { getDailyPtaxRates } from '../services/exchangeRatesRepository'
import sqQuimicaLogo from '../../assets/sqquimica.png'
import { INTELLIQUOTE_WEB_URL, INTELLIQUOTE_REQUESTS_URL, canRequestQuote } from '../lib/intelliquote'

const NOTIFICATION_PANEL_ANIMATION_MS = 220

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

// Refino F2: ordem do mock (Dashboard, Chegadas, Notícias, Admin) — vale no
// tablet também (D3). Icones com os glifos exatos do Sidebar.dc.html SO no
// desktop (>=1041px); o drawer do tablet mantem os glifos anteriores
// (`legacyIcon`). A descricao fica no DOM mas some no desktop.
const navigation = [
  { to: '/', label: 'Dashboard', description: 'Visão geral do fluxo', icon: 'nav-dashboard', legacyIcon: 'dashboard' },
  { to: '/processos', label: 'Chegadas', description: 'Fila de chegadas', icon: 'nav-arrivals', legacyIcon: 'arrivals' },
  { to: '/news', label: 'Notícias', description: 'Postagens e atualizações', icon: 'nav-news', legacyIcon: 'news' },
  { to: '/admin', label: 'Admin', description: 'Governança e ajustes', icon: 'nav-admin', legacyIcon: 'admin', roles: ['admin'] },
]

// Icone com 2 glifos: o do tablet (`legacy`) e o do mock (`desk`); o CSS mostra
// um por breakpoint (.icon--tablet / .icon--desk em styles.css).
function ResponsiveIcon({ legacy, desk, size = 18, legacySize = size, strokeWidth = 1.9 }) {
  return (
    <>
      <Icon name={legacy} size={legacySize} className="icon--tablet" />
      <Icon name={desk} size={size} strokeWidth={strokeWidth} className="icon--desk" />
    </>
  )
}

// Papel legivel no botao de usuario da topbar (Topbar.dc.html).
const ROLE_LABELS = {
  admin: 'Admin',
  logistica: 'Logística',
  compras: 'Compras',
  viewer: 'Viewer',
  user: 'User',
}

// Categorias da gaveta de notificacoes (desktop). D18: o mock mostra 5
// pilulas, o app tem 10 categorias — todas, em rolagem horizontal.
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

function isMacPlatform() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
}

const pageMeta = {
  '/': { title: 'Dashboard operacional', breadcrumb: [] },
  '/news': { title: 'Notícias', breadcrumb: [] },
  '/processos': { title: 'Central de chegadas', breadcrumb: [] },
  '/notifications': { title: 'Central de Notificações', breadcrumb: [] },
  '/menu': { title: 'Menu', breadcrumb: [] },
  '/admin': { title: 'Centro Administrativo', breadcrumb: [{ label: 'Admin' }] },
  '/admin/usuarios': {
    title: 'Centro Administrativo',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Usuários' }],
  },
  '/admin/comunicados': {
    title: 'Centro Administrativo',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Comunicados' }],
  },
  '/admin/barra': {
    title: 'Centro Administrativo',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Barra do porto' }],
  },
  '/admin/previsoes': {
    title: 'Centro Administrativo',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Previsões' }],
  },
  '/admin/lead-time': {
    title: 'Centro Administrativo',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Lead time' }],
  },
  '/admin/suporte': {
    title: 'Centro Administrativo',
    breadcrumb: [{ label: 'Admin', to: '/admin' }, { label: 'Suporte' }],
  },
}

// Mobile: nas sub-abas do Admin o large title e' o nome da secao e o eyebrow
// vira "Admin" (mesmos rotulos do AdminLayout.jsx). So' alimenta os elementos
// mobile-only (.mobile-page-header / .mobile-nav-compact).
const adminSectionTitles = {
  '/admin/usuarios': 'Usuários',
  '/admin/comunicados': 'Comunicados',
  '/admin/barra': 'Barra do porto',
  '/admin/previsoes': 'Previsões',
  '/admin/lead-time': 'Lead time',
  '/admin/suporte': 'Suporte',
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, logout, isEmailVerified } = useAuth()
  const { requestLeave } = useUnsavedChanges()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [shouldRenderMobileMenu, setShouldRenderMobileMenu] = useState(false)
  const [isMobileMenuClosing, setIsMobileMenuClosing] = useState(false)

  useEffect(() => {
    if (isMobileMenuOpen) {
      setShouldRenderMobileMenu(true)
      setIsMobileMenuClosing(false)
    } else if (shouldRenderMobileMenu) {
      setIsMobileMenuClosing(true)
      const timer = setTimeout(() => {
        setShouldRenderMobileMenu(false)
      }, 240)
      return () => clearTimeout(timer)
    }
  }, [isMobileMenuOpen, shouldRenderMobileMenu])
  
  const {
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
    fcm,
    isPrefsModalOpen,
    setIsPrefsModalOpen,
    isLoadingNotifications,
    notificationsLoadError,
    reloadNotifications,
  } = useContext(NotificationsContext)

  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false)
  const [isNotificationPanelMounted, setIsNotificationPanelMounted] = useState(false)
  const [ptaxRates, setPtaxRates] = useState(null)
  // Refino F2: processo aberto em Chegadas (breadcrumb da topbar) e menu do
  // botao de usuario (D5).
  const [activeProcess, setActiveProcessState] = useState(() => getActiveProcess())
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)
  const userMenuTriggerRef = useRef(null)
  const notificationPanelRef = useRef(null)
  const sidebarRef = useRef(null)
  const notificationPanelCloseTimeoutRef = useRef(null)

  useFocusTrap(isNotificationPanelOpen, () => handleCloseNotificationPanel(), notificationPanelRef)
  useFocusTrap(isMobileMenuOpen, () => setIsMobileMenuOpen(false), sidebarRef)

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

  // Drawer da sidebar (<=1040px): se a janela cresce alem disso com o menu
  // aberto, fecha. Senao o `.main-content` ficaria `inert` sem sidebar
  // off-canvas nem backdrop. Roda so' quando o breakpoint muda.
  useEffect(() => {
    if (!isMobileViewport) setIsMobileMenuOpen(false)
  }, [isMobileViewport])

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
  const globalSearch = useGlobalSearch(canSeeProcessName(profile?.role))
  const processSearcherForPalette = globalSearch.searcher
  // C17 (toggle): tema claro/escuro/automatico, persistido em localStorage.
  const theme = useTheme()
  const themeLabel = { auto: 'Tema: automático', dark: 'Tema: escuro', light: 'Tema: claro' }[theme.preference]
  const themeIcon = { auto: 'theme-auto', dark: 'moon', light: 'sun' }[theme.preference]
  // O botao da sidebar (so desktop) usa o glifo do mock (meio circulo a esquerda).
  const sidebarThemeIcon = { auto: 'theme-half', dark: 'moon', light: 'sun' }[theme.preference]
  const commandItems = useMemo(
    () => [
      // Refino F2 (D7): "Novo processo" so para admin; navega com
      // state.openCreate e o ProcessesPage abre o modo de criacao.
      ...(profile?.role === 'admin'
        ? [
            {
              id: 'action-new-process',
              label: 'Novo processo',
              group: 'Ações',
              icon: 'plus',
              keywords: ['criar', 'adicionar', 'nova chegada'],
              action: () => navigate('/processos', { state: { openCreate: true } }),
            },
          ]
        : []),
      { id: 'go-dashboard', label: 'Ir para Dashboard', group: 'Páginas', to: '/', icon: 'nav-dashboard', keywords: ['home', 'inicio'] },
      { id: 'go-processes', label: 'Ir para Chegadas', group: 'Páginas', to: '/processos', icon: 'nav-arrivals' },
      { id: 'go-news', label: 'Ir para Notícias', group: 'Páginas', to: '/news', icon: 'nav-news' },
      ...(profile?.role === 'admin'
        ? [
            { id: 'go-admin', label: 'Painel administrativo', group: 'Admin', to: '/admin', icon: 'nav-admin' },
            { id: 'go-admin-users', label: 'Usuários', group: 'Admin', to: '/admin/usuarios', icon: 'nav-admin' },
            { id: 'go-admin-announcements', label: 'Comunicados', group: 'Admin', to: '/admin/comunicados', icon: 'nav-news' },
            { id: 'go-admin-bar', label: 'Barra do porto', group: 'Admin', to: '/admin/barra', icon: 'inbox' },
            { id: 'go-admin-forecast', label: 'Regras de previsão', group: 'Admin', to: '/admin/previsoes', icon: 'sparkle' },
            { id: 'go-admin-lead-time', label: 'Lead time', group: 'Admin', to: '/admin/lead-time', icon: 'sparkle' },
            { id: 'go-admin-support', label: 'Suporte', group: 'Admin', to: '/admin/suporte', icon: 'help', keywords: ['chamado', 'bug', 'ticket'] },
            { id: 'go-intelliquote', label: 'IntelliQuote (suite SQ)', group: 'Externo', action: () => window.open(INTELLIQUOTE_WEB_URL, '_blank', 'noopener,noreferrer'), icon: 'external', keywords: ['quote', 'cotacao'] },
          ]
        : []),
      ...(canRequestQuote(profile)
        ? [
            {
              id: 'go-quote-request',
              label: 'Fazer uma cotação',
              group: 'Externo',
              icon: 'external',
              keywords: ['cotação', 'cotacao', 'solicitação', 'solicitacao', 'pedido', 'intelliquote', 'quote'],
              action: () => window.open(INTELLIQUOTE_REQUESTS_URL, '_blank', 'noopener,noreferrer'),
            },
          ]
        : []),
      { id: 'action-logout', label: 'Sair', group: 'Conta', icon: 'logout', action: () => requestLeave(logout) },
    ],
    [profile?.role, profile?.area, requestLeave, logout, navigate]
  )

  const meta = pageMeta[location.pathname] ?? pageMeta[location.pathname.startsWith('/admin') ? '/admin' : '/']

  // Refino F2: o breadcrumb fica ACIMA do titulo (os dois visiveis). No detalhe
  // de um processo o crumb e "Chegadas › <processo>", com a mascara de nome
  // (getProcessTitle + canSeeProcessName) — categorias restritas mostram o PO.
  const canSeeName = canSeeProcessName(profile?.role)
  const isProcessDetailOpen =
    location.pathname === '/processos' &&
    Boolean(activeProcess) &&
    (activeProcess.viewMode === 'detail' || activeProcess.viewMode === 'edit')
  const routeCrumb = meta.breadcrumb && meta.breadcrumb.length > 0 ? meta.breadcrumb : null
  const processCrumb = isProcessDetailOpen
    ? [{ label: 'Chegadas' }, { label: getProcessTitle(activeProcess, canSeeName) || 'Processo' }]
    : null
  const topbarCrumb = processCrumb ?? routeCrumb
  const topbarTitleWrapClass = [
    'topbar__title-wrap',
    processCrumb ? 'topbar__title-wrap--process-crumb' : routeCrumb ? 'topbar__title-wrap--crumb' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const userRoleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? ''
  const searchShortcut = isMacPlatform() ? '⌘ K' : 'Ctrl K'

  // F16.2: large title por página no mobile (substitui o brand header fixo
  // "Portal COMEX") + nav compacta com blur que aparece ao rolar, como o
  // UINavigationBar do iOS. Título curto próprio; admin usa o meta.title.
  const mobileTitle =
    {
      '/': 'Visão geral',
      '/news': 'Notícias',
      '/processos': 'Chegadas',
      '/notifications': 'Notificações',
      '/menu': 'Menu',
    }[location.pathname] ??
    adminSectionTitles[location.pathname] ??
    (location.pathname.startsWith('/admin') ? 'Admin' : meta.title)
  const mobileEyebrow = useMemo(() => {
    if (location.pathname === '/menu') return null
    if (adminSectionTitles[location.pathname]) return 'Admin'
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

  useEffect(() => {
    setIsMobileMenuOpen(false)
    setIsUserMenuOpen(false)
    handleCloseNotificationPanel(true)
  }, [location.key])

  // Refino F2: breadcrumb "Chegadas › <processo>" — o ProcessesPage publica o
  // processo aberto em activeProcessContext e a topbar assina.
  useEffect(() => {
    setActiveProcessState(getActiveProcess())
    return subscribeActiveProcess(setActiveProcessState)
  }, [])

  // Menu do botao de usuario (D5): fecha com clique fora ou Esc (devolvendo o
  // foco ao botao).
  useEffect(() => {
    if (!isUserMenuOpen) return undefined

    function handlePointerDown(event) {
      if (userMenuRef.current?.contains(event.target)) return
      setIsUserMenuOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsUserMenuOpen(false)
      userMenuTriggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isUserMenuOpen])

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

  function formatCurrencyRate(value) {
    if (!Number.isFinite(value) || value <= 0) return '--'

    // D6: o mock mostra so o numero ("[0,0000]"), sem "R$".
    return new Intl.NumberFormat('pt-BR', {
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

  // Refino F2: a gaveta nova (mock Flutuantes.dc.html) so existe no desktop
  // (>=1041px). Tablet (721-1040px) e mobile (bottom sheet) mantem o markup
  // anterior intacto.
  function renderNotificationsPanel() {
    if (!isNotificationPanelMounted) return null
    return isMobileLayout || isMobileViewport
      ? renderLegacyNotificationsPanel()
      : renderDesktopNotificationsPanel()
  }

  function renderDesktopNotificationsPanel() {
    const unreadCount = unreadNotifications.length

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
          className={`notifications__panel notifications__panel--drawer${isNotificationPanelOpen ? '' : ' notifications__panel--closing'}`}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Central de notificações"
        >
          <div className="notif-drawer__head">
            <div className="notif-drawer__titles">
              <strong className="notif-drawer__title">Notificações</strong>
              <span className="notif-drawer__sub">
                {unreadCount} {unreadCount === 1 ? 'pendente' : 'pendentes'}
                {dnd.isActive ? ` · Silenciado (${formatRemaining(dnd.remainingMs)})` : ''}
              </span>
            </div>
            <div className="notif-drawer__head-actions">
              <button
                type="button"
                className={`notif-drawer__dnd${dnd.isActive ? ' notif-drawer__dnd--active' : ''}`}
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
                <Icon name="bell-off" size={16} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                className="notif-drawer__close"
                aria-label="Fechar"
                onClick={() => handleCloseNotificationPanel()}
              >
                <Icon name="close" size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div
            className="notif-drawer__filters"
            role="tablist"
            aria-label="Filtrar notificações por categoria"
          >
            {NOTIFICATION_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={notificationFilter === filter.value}
                className={`notif-drawer__pill${notificationFilter === filter.value ? ' notif-drawer__pill--active' : ''}`}
                onClick={() => setNotificationFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="notifications__list notif-drawer__list">
            <NotificationsList
              variant="drawer"
              grouped={groupedNotifications}
              onOpenNotification={(notification) => handleOpenNotification(notification, () => handleCloseNotificationPanel())}
              onMarkAsRead={markOneAsRead}
              formatRelative={formatRelativeNotificationTime}
              formatDate={formatNotificationDate}
              isLoading={isLoadingNotifications}
              loadError={notificationsLoadError}
              onRetry={reloadNotifications}
            />
          </div>

          <div className="notif-drawer__foot">
            <button
              type="button"
              className="notif-drawer__mark-all"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
            >
              Marcar todas como lidas
            </button>
            <Link
              to="/notifications"
              className="primary-button notif-drawer__view-all"
              onClick={() => handleCloseNotificationPanel(true)}
            >
              Ver todas
            </Link>
          </div>
        </div>
      </>
    )
  }

  function renderLegacyNotificationsPanel() {
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
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notifications-panel-title"
        >
          <div className="card-heading">
            <div>
              <strong id="notifications-panel-title">Central de notificações</strong>
              <p>
                {unreadNotifications.length} pendentes
                {dnd.isActive ? ` · Silenciado (${formatRemaining(dnd.remainingMs)})` : ''}
              </p>
            </div>
            {/* Ícones na linha do título: sino (não perturbe) à esquerda,
                engrenagem (preferências) à direita. F9: o toggle de FCM saiu
                daqui (sino duplicado) — push agora é canal dentro das prefs. */}
            <div className="notifications__icon-actions">
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
              <button
                type="button"
                className="ghost-button notifications__prefs"
                onClick={() => setIsPrefsModalOpen(true)}
                aria-label="Preferências de notificação"
                title="Preferências de notificação"
              >
                <Icon name="settings" size={16} />
              </button>
            </div>
          </div>

          {/* Filtro de categoria (select nativo estilizado — antes eram 5 abas
              que quebravam em 2 linhas em 420px) à esquerda e "Marcar todas
              como lidas" à direita, na mesma linha. Só desktop — no mobile a
              NotificationsPage mantém a tab-row com scroll horizontal. */}
          <div className="notifications__filter-row">
            <select
              className="notifications__filter-select"
              value={notificationFilter}
              onChange={(event) => setNotificationFilter(event.target.value)}
              aria-label="Filtrar notificações por categoria"
            >
              <option value="all">Todas</option>
              <option value="process_question_created">Dúvidas</option>
              <option value="process_question_answered">Respostas</option>
              <option value="favorite_process_message">Favoritos</option>
              <option value="post_receipt_notes_updated">Pós-recebimento</option>
              <option value="collection_status_updated">Coleta</option>
              <option value="receipt_divergence_reported">Divergências</option>
              <option value="license_rejected">Anuências</option>
              <option value="process_daily_alerts">Alertas</option>
              <option value="process_document_uploaded">Documentos</option>
            </select>
            <button
              type="button"
              className="ghost-button notifications__mark-all"
              onClick={markAllAsRead}
              disabled={unreadNotifications.length === 0}
            >
              Marcar todas como lidas
            </button>
          </div>

          <div className="notifications__list">
            <NotificationsList
              grouped={groupedNotifications}
              onOpenNotification={(notification) => handleOpenNotification(notification, () => handleCloseNotificationPanel())}
              onMarkAsRead={markOneAsRead}
              formatRelative={formatRelativeNotificationTime}
              formatDate={formatNotificationDate}
              isLoading={isLoadingNotifications}
              loadError={notificationsLoadError}
              onRetry={reloadNotifications}
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
          aria-label={
            unreadNotifications.length > 0
              ? `Notificações, ${unreadNotifications.length} ${unreadNotifications.length === 1 ? 'não lida' : 'não lidas'}`
              : 'Notificações'
          }
          aria-expanded={isNotificationPanelOpen}
          aria-haspopup="dialog"
          onClick={handleToggleNotificationPanel}
        >
          <ResponsiveIcon legacy="bell" desk="bell-ring" size={18} legacySize={19} />
          <span className="notifications__label">Notificações</span>
          {unreadNotifications.length > 0 ? (
            <span className="notifications__count">{unreadNotifications.length}</span>
          ) : null}
        </button>
        {/* O painel/backdrop do desktop NÃO ficam aqui: são renderizados na
            raiz do .shell (ver abaixo). Dentro da topbar (stacking context
            z-index:25) o backdrop não conseguia cobrir a sidebar (z-index:30);
            na raiz do shell o z-index dele (68) passa a valer globalmente. */}
      </div>
    )
  }

  return (
    <div className="shell">
      {shouldRenderMobileMenu ? (
        <button
          type="button"
          className={`sidebar-backdrop${isMobileMenuClosing ? ' sidebar-backdrop--closing' : ''}`}
          aria-label="Fechar menu"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      {/* Central de notificações do desktop na raiz do .shell (fora da topbar):
          assim o backdrop (z-index:68) cobre a sidebar (30) e a topbar (25), e o
          painel (72) fica por cima de tudo. Clicar no backdrop — inclusive sobre
          a sidebar — fecha a central (comportamento de overlay). */}
      {!isMobileLayout && isNotificationPanelMounted ? renderNotificationsPanel() : null}

      <div className="shell__frame">
        <aside ref={sidebarRef} className={`sidebar${isMobileMenuOpen ? ' sidebar--mobile-open' : ''}`} tabIndex={-1}>
          {/* Refino F2: no desktop a marca de produto "Rota e chegada" + "Portal
              COMEX" substitui o PNG da SQ + eyebrow. O chip do PNG e o eyebrow
              ficam no DOM so para o drawer do tablet (<=1040px, D3). */}
          <div className="brand">
            <ProductMark product="comex" tone="dark" size={40} className="sidebar__mark" />
            <span className="sidebar__logo" aria-hidden="true">
              <img src={sqQuimicaLogo} alt="" />
            </span>
            <div className="brand__text">
              <span className="brand__eyebrow">SQ Química</span>
              <h1>Portal COMEX</h1>
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
                {item.icon ? (
                  <span className="nav__link-icon" aria-hidden="true">
                    <ResponsiveIcon legacy={item.legacyIcon} desk={item.icon} />
                  </span>
                ) : null}
                <span className="nav__link-text">
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar__foot">
            {canRequestQuote(profile) ? (
              <a
                className="sidebar-intelliquote-link sidebar-intelliquote-link--quote"
                href={INTELLIQUOTE_REQUESTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Fazer uma cotação no IntelliQuote (abre em nova aba)"
              >
                <span className="sidebar-intelliquote-link__body">
                  <span className="sidebar-intelliquote-link__eyebrow">IntelliQuote</span>
                  <strong className="sidebar-intelliquote-link__title">Fazer uma cotação</strong>
                </span>
                <span className="sidebar-intelliquote-link__arrow" aria-hidden="true">
                  <ResponsiveIcon legacy="external" desk="arrow-up-right" size={16} />
                </span>
              </a>
            ) : null}

            {profile?.role === 'admin' ? (
              <a
                className="sidebar-intelliquote-link sidebar-intelliquote-link--admin"
                href={INTELLIQUOTE_WEB_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir IntelliQuote em nova aba"
              >
                <ProductMark product="iq" tone="dark" size={36} className="sidebar-intelliquote-link__mark" />
                <span className="sidebar-intelliquote-link__body">
                  <span className="sidebar-intelliquote-link__eyebrow sidebar-intelliquote-link__eyebrow--tablet">Suite SQ</span>
                  <strong className="sidebar-intelliquote-link__title">IntelliQuote</strong>
                  <span className="sidebar-intelliquote-link__eyebrow sidebar-intelliquote-link__eyebrow--desk">Abrir cotações</span>
                </span>
                <span className="sidebar-intelliquote-link__arrow" aria-hidden="true">
                  <ResponsiveIcon legacy="external" desk="arrow-up-right" size={16} />
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
              <Icon name={sidebarThemeIcon} size={16} strokeWidth={1.9} aria-hidden="true" />
              <span>{themeLabel}</span>
            </button>

            <button
              type="button"
              className="ghost-button sidebar-logout-button"
              onClick={() => requestLeave(logout)}
            >
              <Icon name="logout-door" size={16} strokeWidth={1.9} aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </aside>

        <div className="main-content" inert={isMobileMenuOpen || isNotificationPanelOpen ? '' : undefined}>
          <div
            className={`mobile-nav-compact${isPageScrolled ? ' mobile-nav-compact--visible' : ''}`}
            aria-hidden="true"
            title={mobileTitle}
          >
            {mobileTitle}
          </div>
          <div className="mobile-page-header">
            {mobileEyebrow ? (
              <span className="mobile-page-header__eyebrow">{mobileEyebrow}</span>
            ) : null}
            <h1 className="mobile-page-header__title" title={mobileTitle}>{mobileTitle}</h1>
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
              <div className={topbarTitleWrapClass}>
                {topbarCrumb ? <Breadcrumb items={topbarCrumb} /> : null}
                <h2 className="topbar__title" title={meta.title}>{meta.title}</h2>
              </div>
            </div>
            <div className="topbar__actions">
              <button
                type="button"
                className="topbar__search"
                aria-label={`Buscar (${searchShortcut})`}
                aria-haspopup="dialog"
                onClick={() => commandPalette.setOpen(true)}
              >
                <Icon name="search-field" size={16} strokeWidth={1.9} aria-hidden="true" />
                <span className="topbar__search-text">Buscar páginas, ações ou processos</span>
                <kbd className="topbar__search-kbd">{searchShortcut}</kbd>
              </button>
              {/* Refino F2 (D6): o chip PTAX e sempre presente; sem dado cai em "--". */}
              {(
                <div className="topbar__ptax" aria-label="Cotação PTAX do dia">
                  <span className="topbar__ptax-pair">
                    <span className="topbar__ptax-label">USD</span>
                    <span className="topbar__ptax-value">{formatCurrencyRate(ptaxRates?.usd?.sell)}</span>
                  </span>
                  <span className="topbar__ptax-sep" aria-hidden="true" />
                  <span className="topbar__ptax-pair">
                    <span className="topbar__ptax-label">EUR</span>
                    <span className="topbar__ptax-value">{formatCurrencyRate(ptaxRates?.eur?.sell)}</span>
                  </span>
                </div>
              )}
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
              {isMobileViewport ? (
                // Tablet (<=1040px): so o avatar, sem menu (comportamento anterior).
                <div className="topbar__user">
                  <div className="topbar__avatar" aria-hidden="true">
                    {getInitials(profile?.name ?? profile?.email ?? '?')}
                  </div>
                </div>
              ) : (
                <div className="topbar__user-wrap" ref={userMenuRef}>
                  <button
                    ref={userMenuTriggerRef}
                    type="button"
                    className="topbar__user"
                    aria-haspopup="menu"
                    aria-expanded={isUserMenuOpen}
                    onClick={() => setIsUserMenuOpen((current) => !current)}
                  >
                    <span className="topbar__avatar" aria-hidden="true">
                      {getInitials(profile?.name ?? profile?.email ?? '?')}
                    </span>
                    <span className="topbar__user-info">
                      <strong title={profile?.name}>{profile?.name ?? 'Usuário'}</strong>
                      {userRoleLabel ? (
                        <span className={`topbar__role-badge topbar__role-badge--${profile.role}`}>
                          {userRoleLabel}
                        </span>
                      ) : null}
                    </span>
                    <Icon name="chevron-down" size={14} strokeWidth={2} className="topbar__user-chevron" aria-hidden="true" />
                  </button>
                  {isUserMenuOpen ? (
                    <div className="topbar__user-menu" role="menu" aria-label="Menu do usuário">
                      <button
                        type="button"
                        role="menuitem"
                        className="topbar__user-menu-item"
                        onClick={() => {
                          setIsUserMenuOpen(false)
                          setIsPrefsModalOpen(true)
                        }}
                      >
                        <Icon name="settings" size={16} strokeWidth={1.9} aria-hidden="true" />
                        Preferências de notificação
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="topbar__user-menu-item"
                        onClick={() => {
                          setIsUserMenuOpen(false)
                          requestLeave(logout)
                        }}
                      >
                        <Icon name="logout-door" size={16} strokeWidth={1.9} aria-hidden="true" />
                        Sair
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
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
                    onClick={() => requestLeave(() => navigate('/verificar-email'))}
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

            <NavLink
              to="/notifications"
              className={({ isActive }) =>
                `mobile-bottom-nav__item${isActive ? ' mobile-bottom-nav__item--active' : ''}`
              }
              aria-label="Notificações"
            >
              <Icon name="bell" size={22} aria-hidden="true" />
              <span className="mobile-bottom-nav__label">Avisos</span>
              {unreadNotifications.length > 0 ? (
                <span className="mobile-bottom-nav__badge">{unreadNotifications.length}</span>
              ) : null}
            </NavLink>

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
