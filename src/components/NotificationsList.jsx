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
//     variant="drawer"              // refino F2: lista plana da gaveta desktop
//     variant="page"                // refino F5a: pagina /notifications no desktop
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
import EmptyState from './EmptyState'
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

// Refino F2 (Flutuantes.dc.html): na gaveta desktop a lista e' PLANA (sem
// grupos por processo), mais recentes primeiro; o tom do ladrilho vem do tipo.
// DRAWER_LIMIT: o legado tinha "Ver mais"; na gaveta o rodape "Ver todas"
// (pagina /notifications) cobre o restante — decisao registrada aqui.
const DRAWER_LIMIT = 20

function getDrawerVisual(type) {
  const normalized = String(type ?? '')
  if (normalized.startsWith('news')) return { icon: 'nav-news', tone: 'info' }
  switch (normalized) {
    case 'favorite_process_updated':
      // mudanca de status/ETA do processo favorito: nao e conversa
      return { icon: 'nav-arrivals', tone: 'info' }
    case 'collection_status_updated':
      return { icon: 'truck', tone: 'ok' }
    case 'post_receipt_notes_updated':
      return { icon: 'doc', tone: 'ok' }
    case 'process_document_uploaded':
      return { icon: 'doc', tone: 'warn' }
    case 'receipt_divergence_reported':
    case 'license_rejected':
      return { icon: 'alert-triangle', tone: 'danger' }
    case 'process_daily_alerts':
      return { icon: 'alert-triangle', tone: 'warn' }
    case 'support_ticket_resolved':
      return { icon: 'message', tone: 'ok' }
    default:
      // dúvidas, respostas, favoritos, chamados: conversa
      return { icon: 'message', tone: 'info' }
  }
}

// "há 8 min • 19/10": o mock mostra só a data (dd/mm) e "ontem" no lugar de
// "há 1 d". Sem toISOString: formata no fuso local.
function formatDrawerDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
}

function formatDrawerRelative(value, formatRelative) {
  const relative = formatRelative(value)
  return relative === 'há 1 d' ? 'ontem' : relative
}

function DrawerRow({ notification, onOpenNotification, onMarkAsRead, formatRelative }) {
  const { icon, tone } = getDrawerVisual(notification.type)
  return (
    <div className="notif-row-wrap">
    <button
      type="button"
      className={`notif-row${notification.isRead ? '' : ' notif-row--unread'}`}
      onClick={() => onOpenNotification(notification)}
      aria-label={buildNotificationAriaLabel(notification, formatRelative)}
    >
      <span className={`notif-row__icon notif-row__icon--${tone}`} aria-hidden="true">
        <Icon name={icon} size={16} strokeWidth={1.9} />
      </span>
      <span className="notif-row__body">
        <span className="notif-row__title">{notification.title}</span>
        <span className="notif-row__text">{notification.body}</span>
        <span className="notif-row__time">
          {formatDrawerRelative(notification.createdAt, formatRelative)} • {formatDrawerDate(notification.createdAt)}
        </span>
      </span>
      <span className="notif-row__dot" aria-hidden="true" />
    </button>
    {onMarkAsRead && !notification.isRead ? (
      <button
        type="button"
        className="notif-row__mark"
        onClick={(event) => {
          event.stopPropagation()
          onMarkAsRead(notification)
        }}
        aria-label={`Marcar como lida: ${notification.title}`}
        title="Marcar como lida"
      >
        <Icon name="check" size={16} strokeWidth={1.9} />
      </button>
    ) : null}
    </div>
  )
}

// Refino F5a (Notificacoes.dc.html): "há 8 min • 19/10/2026 14:20" — data completa com ano
// + a hora (o legado mostrava dd/mm HH:MM; o relativo sozinho nao diz a hora depois de 1 h)
// e "ontem" no lugar de "há 1 d". Sem toISOString: formata no fuso local.
function formatPageDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
  return `${day} ${time}`
}

// Pagina desktop: um cartao POR PROCESSO (o PLAN F5a.2). O contexto agrupa por processo+tipo;
// aqui os grupos do mesmo `processId` se fundem (itens por data, mais recente primeiro) e o
// titulo vira o nome do processo (`processTitles`, ja mascarado pela pagina), com fallback para
// o titulo da ultima notificacao. Notificacoes sem processo (noticias, chamados) ficam como estao.
function regroupByProcess(grouped, processTitles) {
  const merged = new Map()
  grouped.forEach((group) => {
    const key = group.processId ? `p:${group.processId}` : `g:${group.items[0]?.id ?? group.latestCreatedAt}:${group.type}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, { ...group, key, items: [...group.items] })
      return
    }
    current.items.push(...group.items)
    current.unreadCount += group.unreadCount
    if (new Date(group.latestCreatedAt ?? 0).getTime() > new Date(current.latestCreatedAt ?? 0).getTime()) {
      current.latestCreatedAt = group.latestCreatedAt
      current.title = group.title
    }
  })
  return [...merged.values()]
    .map((group) => ({
      ...group,
      title: (group.processId && processTitles?.[group.processId]) || group.title,
      items: [...group.items].sort(
        (left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime()
      ),
    }))
    .sort((left, right) => new Date(right.latestCreatedAt ?? 0).getTime() - new Date(left.latestCreatedAt ?? 0).getTime())
}

// Linha da pagina desktop: grid [ladrilho 40 | corpo | "Marcar como lida"]. O botao
// que abre a notificacao cobre ladrilho + corpo; o "Marcar como lida" e' irmao dele
// (nao aninha botao em botao).
function PageRow({ notification, onOpenNotification, onMarkAsRead, formatRelative }) {
  const { icon, tone } = getDrawerVisual(notification.type)
  const relative = formatRelative(notification.createdAt)
  const stamp = [relative === 'há 1 d' ? 'ontem' : relative, formatPageDate(notification.createdAt)]
    .filter(Boolean)
    .join(' • ')
  return (
    <div className={`nt-row${notification.isRead ? '' : ' nt-row--unread'}`}>
      <button
        type="button"
        className="nt-row__open"
        onClick={() => onOpenNotification(notification)}
        aria-label={buildNotificationAriaLabel(notification, formatRelative)}
      >
        <span className={`nt-row__icon nt-row__icon--${tone}`} aria-hidden="true">
          <Icon name={icon} size={18} strokeWidth={1.9} />
        </span>
        <span className="nt-row__body">
          <span className="nt-row__title">
            <span className="nt-row__dot" aria-hidden="true" />
            {notification.title}
          </span>
          <span className="nt-row__text">{notification.body}</span>
          <span className="nt-row__time">{stamp}</span>
        </span>
      </button>
      {onMarkAsRead && !notification.isRead ? (
        <button
          type="button"
          className="nt-row__mark"
          onClick={() => onMarkAsRead(notification)}
          aria-label={`Marcar como lida: ${notification.title}`}
        >
          Marcar como lida
        </button>
      ) : null}
    </div>
  )
}

// Linhas de um cartao: as 3 mais recentes; "Ver mais N" revela o resto (nada fica inalcancavel).
function PageItems({ items, onOpenNotification, onMarkAsRead, formatRelative }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, ITEMS_PER_GROUP)
  const hidden = items.length - visible.length
  return (
    <>
      {visible.map((notification) => (
        <PageRow
          key={notification.id}
          notification={notification}
          onOpenNotification={onOpenNotification}
          onMarkAsRead={onMarkAsRead}
          formatRelative={formatRelative}
        />
      ))}
      {hidden > 0 ? (
        <button type="button" className="nt-group__more" onClick={() => setShowAll(true)}>
          Ver mais {hidden}
        </button>
      ) : null}
    </>
  )
}

// "Anteriores" no desktop: botao de 56px recolhido (nome + "N notificações" + chevron);
// aberto, o mesmo cartao revela as linhas (acordeao com aria-expanded/aria-controls).
function PageOlderGroup({ group, isExpanded, onToggle, onOpenNotification, onMarkAsRead, formatRelative }) {
  const itemsId = useId()
  return (
    <div className={`nt-older${isExpanded ? ' nt-older--open' : ''}`}>
      <button
        type="button"
        className="nt-older__toggle"
        aria-expanded={isExpanded}
        aria-controls={itemsId}
        onClick={onToggle}
      >
        <span className="nt-older__title">{group.title}</span>
        <span className="nt-older__meta">
          {formatCount(group.items.length, 'notificação', 'notificações')}
          <Icon name="chevron-down" size={16} strokeWidth={2} className="nt-older__chevron" />
        </span>
      </button>
      {isExpanded ? (
        <div id={itemsId} className="nt-older__items">
          <PageItems
            items={group.items}
            onOpenNotification={onOpenNotification}
            onMarkAsRead={onMarkAsRead}
            formatRelative={formatRelative}
          />
        </div>
      ) : null}
    </div>
  )
}

const RECENT_LIMIT = 8
const ITEMS_PER_GROUP = 3
const OLDER_INITIAL = 4
const OLDER_STEP = 8

// UX-6a (item 10): pluralizacao PT-BR ("1 notificação" em vez de
// "1 notificações"). Helper local — nao existe util compartilhado pra isso.
const formatCount = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`

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

  // Acoes so' visiveis com a linha aberta/arrastando (sem faixa vazando em repouso).
  const isRevealing = isSwipeOpen || swipe.isDragging || swipe.translateX !== 0

  return (
    <div className={`notifications-swipe-row${isRevealing ? ' notifications-swipe-row--revealing' : ''}`}>
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
          className="ghost-button ghost-button--outline notifications__mark-one"
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
          <p>{formatCount(group.items.length, 'notificação', 'notificações')}</p>
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
  variant = 'default',
  processTitles,
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
    if (variant === 'page') {
      return (
        <EmptyState
          illustration="inbox"
          title="Nenhuma notificação"
          message="As novas dúvidas e respostas dos processos aparecerão aqui."
        />
      )
    }
    return (
      <div className="empty-state">
        <strong>Nenhuma notificação</strong>
        <p>As novas dúvidas e respostas dos processos aparecerão aqui.</p>
      </div>
    )
  }

  if (variant === 'drawer') {
    const flat = grouped
      .flatMap((group) => group.items)
      .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
      .slice(0, DRAWER_LIMIT)

    return (
      <>
        {errorBanner}
        <ul className="notif-drawer__items">
          {flat.map((notification) => (
            <li key={notification.id}>
              <DrawerRow
                notification={notification}
                onOpenNotification={onOpenNotification}
                onMarkAsRead={onMarkAsRead}
                formatRelative={formatRelative}
              />
            </li>
          ))}
        </ul>
      </>
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

  if (variant === 'page') {
    const pageGroups = regroupByProcess(grouped, processTitles)
    const pageRecent = pageGroups.filter((g) => g.unreadCount > 0).slice(0, RECENT_LIMIT)
    const pageAllOlder = pageGroups.filter((g) => g.unreadCount === 0)
    const pageOlder = pageAllOlder.slice(0, olderLimit)
    const pageHasMoreOlder = pageAllOlder.length > olderLimit
    return (
      <>
        {errorBanner}
        {pageRecent.length > 0 ? (
          <section className="nt-section" aria-label="Recentes">
            <h2 className="nt-section__title">Recentes</h2>
            {pageRecent.map((group) => (
              <div key={`recent-${group.key}`} className="nt-group">
                <div className="nt-group__head">
                  <span className="nt-group__title">{group.title}</span>
                  <span className="nt-group__meta">
                    {formatCount(group.items.length, 'notificação', 'notificações')}
                    {group.unreadCount > 0
                      ? ` • ${formatCount(group.unreadCount, 'não lida', 'não lidas')}`
                      : ''}
                  </span>
                </div>
                <PageItems
                  items={group.items}
                  onOpenNotification={onOpenNotification}
                  onMarkAsRead={onMarkAsRead}
                  formatRelative={formatRelative}
                />
              </div>
            ))}
          </section>
        ) : null}
        {pageOlder.length > 0 ? (
          <section className="nt-section" aria-label="Anteriores">
            <h2 className="nt-section__title">Anteriores</h2>
            {pageOlder.map((group) => {
              const key = `older-${group.key}`
              return (
                <PageOlderGroup
                  key={key}
                  group={group}
                  isExpanded={expandedOlderKeys.has(key)}
                  onToggle={() => toggleOlderGroup(key)}
                  onOpenNotification={onOpenNotification}
                  onMarkAsRead={onMarkAsRead}
                  formatRelative={formatRelative}
                />
              )
            })}
            {pageHasMoreOlder ? (
              <button
                type="button"
                className="nt-section__more"
                onClick={() => setOlderLimit((value) => value + OLDER_STEP)}
              >
                Ver mais {Math.min(OLDER_STEP, pageAllOlder.length - olderLimit)} anteriores
              </button>
            ) : null}
          </section>
        ) : null}
      </>
    )
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
                    {formatCount(group.items.length, 'notificação', 'notificações')}
                    {group.unreadCount > 0
                      ? ` • ${formatCount(group.unreadCount, 'não lida', 'não lidas')}`
                      : ''}
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
