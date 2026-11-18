import { useContext, useEffect, useMemo, useState } from 'react'
import useAuth from '../hooks/useAuth'
import { listProcesses } from '../services/processesRepository'
import { canSeeProcessName, getProcessTitle } from '../features/processes/processLabels'
import { NotificationsContext } from '../contexts/NotificationsContext'
import NotificationsList from '../components/NotificationsList'
import TabButton from '../components/TabButton'
import Icon from '../components/Icon'
import { FilterPill } from '../components/FilterChip'
import MobileHeroSlot from '../components/MobileHeroSlot'
import useMediaQuery from '../hooks/useMediaQuery'

// Refino F5a (Notificacoes.dc.html): >= 1041px a pagina usa a arvore `nt-*` (cabecalho
// com acoes em icone, pilulas com contagem, cartoes por grupo); tablet/mobile seguem
// na arvore anterior. Tema escuro: as classes `nt-*` sao novas — nao herdam os
// overrides `[data-theme='dark'] .notifications__group/__item` do legado.
const DESKTOP_QUERY = '(min-width: 1041px)'
// Remake mobile F6: <= 720px a pagina usa a arvore `m-*` (hero navy, chips, lista em grupo).
const MOBILE_QUERY = '(max-width: 720px)'

// "Marcar todas como lidas" apaga os pontos em sequencia (160ms entre linhas). O
// atraso e' limitado a 12 linhas para uma lista longa nao arrastar a animacao.
const CLEAR_STEP_MS = 160
const CLEAR_MAX_ROWS = 12

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
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const { profile } = useAuth()
  const canSeeName = canSeeProcessName(profile?.role)
  // Refino F5a: o titulo do cartao de cada grupo e' o nome do processo (Notificacoes.dc.html).
  // Os processos sao carregados UMA vez (so no desktop, que e' quem mostra o nome), com a mesma
  // mascara do resto do app (getProcessTitle: so admin/logistica veem o nome nas categorias
  // restritas). Falha de carga nao quebra a lista: o titulo cai no da ultima notificacao.
  // Mobile (F6): a linha do aviso mostra o processo em mono, com a mesma mascara.
  const showsProcessTitles = isDesktop || isMobile
  const [processes, setProcesses] = useState([])
  useEffect(() => {
    if (!showsProcessTitles) return undefined
    let isMounted = true

    async function loadProcesses() {
      try {
        const loaded = await listProcesses()
        if (isMounted) setProcesses(Array.isArray(loaded) ? loaded : [])
      } catch (error) {
        console.error('Falha ao carregar os processos das notificações.', error)
      }
    }

    loadProcesses()

    return () => {
      isMounted = false
    }
  }, [showsProcessTitles])
  const processTitles = useMemo(() => {
    const titles = {}
    processes.forEach((process) => {
      const title = process?.id ? getProcessTitle(process, canSeeName) : ''
      if (title) titles[process.id] = title
    })
    return titles
  }, [processes, canSeeName])
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

  // Mobile: ordem (indice entre as nao lidas, mais recentes primeiro) congelada no
  // clique de "Marcar todas". Vira o `--m-i` de cada linha: o atraso do ponto e'
  // `--m-i` x 160ms. A leitura em si continua sendo o `markAllAsRead` do contexto.
  const [clearingOrder, setClearingOrder] = useState(null)
  useEffect(() => {
    if (!clearingOrder) return undefined
    const rows = Math.min(Object.keys(clearingOrder).length, CLEAR_MAX_ROWS + 1)
    const timer = setTimeout(() => setClearingOrder(null), rows * CLEAR_STEP_MS + 1200)
    return () => clearTimeout(timer)
  }, [clearingOrder])

  function handleMobileMarkAll() {
    if (unreadNotifications.length === 0) return
    const order = {}
    groupedNotifications
      .flatMap((group) => group.items)
      .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
      .filter((item) => !item.isRead)
      .forEach((item, index) => {
        order[item.id] = Math.min(index, CLEAR_MAX_ROWS)
      })
    setClearingOrder(order)
    markAllAsRead()
  }

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
            processTitles={processTitles}
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

  if (isMobile) {
    const unreadCount = unreadNotifications.length
    const noUnread = unreadCount === 0
    const heroSub = `${noUnread ? 'Tudo em dia' : `${unreadCount} ${unreadCount === 1 ? 'não lida' : 'não lidas'}`}${
      dnd.isActive ? ` · Silenciado (${formatRemaining(dnd.remainingMs)})` : ''
    }`

    return (
      <section className="surface notifications-page notifications-page--mobile">
        <MobileHeroSlot>
          <p className="m-hero-sub" role="status">
            {heroSub}
          </p>
        </MobileHeroSlot>

        <div className="m-chips" role="group" aria-label="Filtrar notificações">
          {NOTIFICATION_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className="m-chip"
              aria-pressed={notificationFilter === filter.value}
              onClick={() => setNotificationFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="m-nbar">
          <button
            type="button"
            className="m-ghost m-nbar__all"
            aria-disabled={noUnread ? 'true' : undefined}
            onClick={handleMobileMarkAll}
          >
            <Icon name="check" size={18} strokeWidth={2.2} />
            Marcar todas como lidas
          </button>
          <button
            type="button"
            className="m-ghost m-nbar__icon"
            onClick={() => setIsPrefsModalOpen(true)}
            aria-label="Preferências de notificação"
            title="Preferências de notificação"
          >
            <Icon name="sliders" size={18} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="m-ghost m-nbar__icon"
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
            <Icon name="bell-slash" size={18} strokeWidth={1.9} />
          </button>
        </div>

        <NotificationsList
          variant="mobile"
          processTitles={processTitles}
          clearingOrder={clearingOrder}
          grouped={groupedNotifications}
          onOpenNotification={handleOpenNotification}
          onMarkAsRead={markOneAsRead}
          formatRelative={formatRelativeNotificationTime}
          formatDate={formatNotificationDate}
          isLoading={isLoadingNotifications}
          loadError={notificationsLoadError}
          onRetry={reloadNotifications}
        />
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
