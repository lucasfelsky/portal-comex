// F16.2 (redesign iOS): tela Menu do mobile — substitui o drawer lateral
// na tab bar (perfil, tema, suporte, admin, IntelliQuote, sair). No
// desktop a rota existe mas não é linkada (a sidebar cobre tudo).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { OPEN_SUPPORT_MODAL_EVENT } from '../components/SupportButton'

const INTELLIQUOTE_WEB_URL =
  import.meta.env.VITE_INTELLIQUOTE_WEB_URL ?? 'https://intelliquote.portal-comex.com'

// Detecção de plataforma pro guia "Instalar como app". Inline (sem util novo —
// audit:vault trava a contagem de src/utils). iPadOS 13+ se disfarça de Mac,
// daí o check de maxTouchPoints.
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  const isIOS =
    /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  )
}

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
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const [installGuideOpen, setInstallGuideOpen] = useState(false)
  const platform = detectPlatform()
  const alreadyInstalled = isStandalone()

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

      {!alreadyInstalled ? (
        <>
          <div className="ios-section-label">Aplicativo</div>
          <div className="ios-group">
            <button type="button" className="ios-row" onClick={() => setInstallGuideOpen(true)}>
              <span className="ios-row__icon" style={{ background: '#0aa06e' }}>
                <Icon name="download" size={15} aria-hidden="true" />
              </span>
              <span className="ios-row__body">
                <span className="ios-row__title">Instalar como app</span>
                <span className="ios-row__sub">Adicionar à tela inicial (e receber notificações)</span>
              </span>
              <Icon name="chevron" size={14} className="ios-row__chevron" aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}

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

      <Modal
        open={installGuideOpen}
        onClose={() => setInstallGuideOpen(false)}
        title="Instalar o Portal como app"
      >
        <div className="install-guide">
          <p className="install-guide__lead">
            Instalar o Portal na tela inicial deixa ele em tela cheia (sem a barra do
            navegador) e é o que permite receber <strong>notificações push</strong> no celular.
          </p>

          <section
            className={`install-guide__block${platform === 'ios' ? ' install-guide__block--active' : ''}`}
          >
            <h3 className="install-guide__title">
              iPhone / iPad — Safari
              {platform === 'ios' ? <span className="install-guide__badge">seu aparelho</span> : null}
            </h3>
            <ol className="install-guide__steps">
              <li>Abra o Portal no <strong>Safari</strong> (o atalho só aparece nele).</li>
              <li>
                Toque no botão <strong>Compartilhar</strong> — o quadrado com uma seta para
                cima, na barra de baixo.
              </li>
              <li>Deslize e toque em <strong>“Adicionar à Tela de Início”</strong>.</li>
              <li>Toque em <strong>“Adicionar”</strong>, no canto superior direito.</li>
              <li>
                Abra o Portal pelo <strong>ícone</strong> na tela inicial. Pronto — agora dá
                para ativar as notificações nas preferências.
              </li>
            </ol>
          </section>

          <section
            className={`install-guide__block${platform === 'android' ? ' install-guide__block--active' : ''}`}
          >
            <h3 className="install-guide__title">
              Android — Chrome
              {platform === 'android' ? <span className="install-guide__badge">seu aparelho</span> : null}
            </h3>
            <ol className="install-guide__steps">
              <li>Abra o Portal no <strong>Chrome</strong>.</li>
              <li>Toque no menu <strong>⋮</strong> (três pontinhos, canto superior direito).</li>
              <li>
                Toque em <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong>.
              </li>
              <li>Confirme em <strong>“Instalar”</strong> / <strong>“Adicionar”</strong>.</li>
              <li>Abra pelo ícone na tela inicial.</li>
            </ol>
          </section>
        </div>
      </Modal>
    </section>
  )
}
