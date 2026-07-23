// F16.2 (redesign iOS): tela Menu do mobile — substitui o drawer lateral
// na tab bar (perfil, tema, suporte, admin, IntelliQuote, sair). No
// desktop a rota existe mas não é linkada (a sidebar cobre tudo).
// F16.7: enriquecida com central de notificações, preferências e DND.

import { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useDoNotDisturb, formatRemaining } from '../hooks/useDoNotDisturb'
import { NotificationsContext } from '../contexts/NotificationsContext'
import NotificationPreferencesModal from '../components/NotificationPreferencesModal'
import Icon from '../components/Icon'
import { OPEN_SUPPORT_MODAL_EVENT } from '../components/SupportButton'

const INTELLIQUOTE_WEB_URL =
  import.meta.env.VITE_INTELLIQUOTE_WEB_URL ?? 'https://intelliquote.portal-comex.com'

function getInitials(value) {
  const cleaned = String(value ?? '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const THEME_LABEL = { auto: 'Automático', dark: 'Escuro', light: 'Claro' }

export default function MenuPage() {
  const { profile, logout } = useAuth()
  const theme = useTheme()
  const dnd = useDoNotDisturb()
  const notificationsCtx = useContext(NotificationsContext)
  const navigate = useNavigate()
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false)
  const isAdmin = profile?.role === 'admin'

  const unreadCount = notificationsCtx?.unreadNotifications?.length ?? 0

  return (
    <section className="menu-page" aria-label="Menu">
      <div className="ios-group">
        <div className="menu-profile">
          <span className="menu-profile__avatar" aria-hidden="true">
            {getInitials(profile?.name || profile?.email)}
          </span>
          <span className="menu-profile__body">
            <strong>{profile?.name || 'Usuário'}</strong>
            <span>
              {profile?.email}
              {profile?.role ? ` · ${profile.role}` : ''}
            </span>
          </span>
        </div>
      </div>

      <div className="ios-section-label">Central de notificações</div>
      <div className="ios-group">
        <button type="button" className="ios-row" onClick={() => navigate('/notifications')}>
          <span className="ios-row__icon" style={{ background: 'var(--warn)' }}>
            <Icon name="bell" size={15} aria-hidden="true" />
          </span>
          <span className="ios-row__body">
            <span className="ios-row__title">Notificações</span>
            <span className="ios-row__sub">
              {unreadCount > 0 ? `${unreadCount} pendentes` : 'Nenhuma pendente'}
            </span>
          </span>
          {unreadCount > 0 ? (
            <span className="ios-row__badge">{unreadCount}</span>
          ) : (
            <Icon name="chevron" size={14} className="ios-row__chevron" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="ios-row"
          onClick={() => {
            if (dnd.isActive) {
              dnd.disable()
            } else {
              dnd.enableFor(60 * 60 * 1000)
            }
          }}
        >
          <span className="ios-row__icon" style={{ background: dnd.isActive ? 'var(--danger)' : 'var(--ink-soft)' }}>
            <Icon name="bell" size={15} aria-hidden="true" />
          </span>
          <span className="ios-row__body">
            <span className="ios-row__title">Não perturbe</span>
            <span className="ios-row__sub">
              {dnd.isActive ? `Silenciado por mais ${formatRemaining(dnd.remainingMs)}` : 'Desativado'}
            </span>
          </span>
          <span className={`ios-row__toggle${dnd.isActive ? ' ios-row__toggle--on' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <div className="ios-section-label">Preferências</div>
      <div className="ios-group">
        <button type="button" className="ios-row" onClick={theme.cyclePreference}>
          <span className="ios-row__icon" style={{ background: '#5e5ce6' }}>
            <Icon name={{ auto: 'theme-auto', dark: 'moon', light: 'sun' }[theme.preference] ?? 'moon'} size={15} aria-hidden="true" />
          </span>
          <span className="ios-row__body">
            <span className="ios-row__title">Tema</span>
          </span>
          <span className="ios-row__end">{THEME_LABEL[theme.preference] ?? 'Automático'}</span>
        </button>
        <button
          type="button"
          className="ios-row"
          onClick={() => setIsPrefsModalOpen(true)}
        >
          <span className="ios-row__icon" style={{ background: 'var(--primary)' }}>
            <Icon name="settings" size={15} aria-hidden="true" />
          </span>
          <span className="ios-row__body">
            <span className="ios-row__title">Canais de notificação</span>
            <span className="ios-row__sub">E-mail, push e notificações no portal</span>
          </span>
          <Icon name="chevron" size={14} className="ios-row__chevron" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ios-row"
          onClick={() => window.dispatchEvent(new Event(OPEN_SUPPORT_MODAL_EVENT))}
        >
          <span className="ios-row__icon" style={{ background: 'var(--info)' }}>
            <Icon name="help" size={15} aria-hidden="true" />
          </span>
          <span className="ios-row__body">
            <span className="ios-row__title">Suporte</span>
            <span className="ios-row__sub">Abrir um chamado ou dúvida</span>
          </span>
          <Icon name="chevron" size={14} className="ios-row__chevron" aria-hidden="true" />
        </button>
      </div>

      {isAdmin ? (
        <>
          <div className="ios-section-label">Administração</div>
          <div className="ios-group">
            <button type="button" className="ios-row" onClick={() => navigate('/admin')}>
              <span className="ios-row__icon" style={{ background: 'var(--primary)' }}>
                <Icon name="admin" size={15} aria-hidden="true" />
              </span>
              <span className="ios-row__body">
                <span className="ios-row__title">Painel administrativo</span>
                <span className="ios-row__sub">Usuários, comunicados, barra, suporte</span>
              </span>
              <Icon name="chevron" size={14} className="ios-row__chevron" aria-hidden="true" />
            </button>
          </div>

          <div className="ios-section-label">Suite SQ</div>
          <div className="ios-group">
            <a
              className="ios-row"
              href={INTELLIQUOTE_WEB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ios-row__icon" style={{ background: 'linear-gradient(140deg, #0a5f50, #063f38)' }}>
                <Icon name="external" size={15} aria-hidden="true" />
              </span>
              <span className="ios-row__body">
                <span className="ios-row__title">IntelliQuote</span>
                <span className="ios-row__sub">Cotações de fornecedores</span>
              </span>
              <Icon name="chevron" size={14} className="ios-row__chevron" aria-hidden="true" />
            </a>
          </div>
        </>
      ) : null}

      <div className="ios-group ios-group--spaced">
        <button type="button" className="ios-row ios-row--center" onClick={logout}>
          <span className="ios-row__title ios-row__title--danger">Sair</span>
        </button>
      </div>
    </section>
  )
}
