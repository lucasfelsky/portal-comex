// F16.2 (redesign iOS): tela Menu do mobile — substitui o drawer lateral
// na tab bar (perfil, tema, suporte, admin, IntelliQuote, "Solicitar uma cotação"
// pro Comercial, sair). No
// desktop a rota existe mas não é linkada (a sidebar cobre tudo).

import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import useMediaQuery from '../hooks/useMediaQuery'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { SqQuimicaLogo } from '../components/BrandMark'
import { OPEN_SUPPORT_MODAL_EVENT } from '../components/SupportButton'
import { INTELLIQUOTE_WEB_URL, INTELLIQUOTE_REQUESTS_URL, canRequestQuote } from '../lib/intelliquote'
import { useCargoConferenceCount } from '../features/processes/useCargoConferenceList'

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

// Remake mobile F6: segmented de tema com as 3 preferencias que o app ja tem.
const THEME_OPTIONS = ['auto', 'light', 'dark']

// Papel legivel na tag do cartao do usuario (mesmos rotulos da topbar).
const ROLE_LABELS = {
  admin: 'Admin',
  logistica: 'Logística',
  compras: 'Compras',
  viewer: 'Viewer',
  user: 'User',
}

// Secoes do painel administrativo (rotas e rotulos de AdminLayout.jsx). So o admin as ve.
const ADMIN_SHORTCUTS = [
  { to: '/admin/usuarios', label: 'Usuários', icon: 'person' },
  { to: '/admin/comunicados', label: 'Comunicados', icon: 'news' },
  { to: '/admin/barra', label: 'Barra do porto', icon: 'anchor' },
  { to: '/admin/previsoes', label: 'Previsões', icon: 'trend' },
  { to: '/admin/lead-time', label: 'Lead time', icon: 'clock' },
  { to: '/admin/suporte', label: 'Chamados de suporte', icon: 'help', sub: 'Chamados abertos pelos usuários' },
  { to: '/admin/relatorio-carga', label: 'Relatório de Carga', icon: 'mail', sub: 'Aviso por e-mail e tabela Item x Emb.' },
]

export default function MenuPage() {
  const { profile, logout } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const isMobile = useMediaQuery('(max-width: 720px)')
  const themeLabelId = useId()
  const isAdmin = profile?.role === 'admin'
  const canQuote = canRequestQuote(profile)
  // S9-F/S11-H: Conferência (Relatório de Carga) só no celular. Admin: linha aqui, com o contador do cache da lista.
  // Logística: a Conferência fica na barra de baixo (que já carrega o contador) e Notícias vem para cá.
  const canConfer = isMobile && isAdmin
  const showNewsRow = isMobile && profile?.role === 'logistica'
  const conferenceCount = useCargoConferenceCount({ enabled: canConfer })
  const [installGuideOpen, setInstallGuideOpen] = useState(false)
  const platform = detectPlatform()
  const alreadyInstalled = isStandalone()

  return (
    <section className={`menu-page${isMobile ? ' m-menu' : ''}`} aria-label="Menu">
      {isMobile ? (
        <>
          <div className="m-card m-ucard m-rise">
            <span className="m-ucard__avatar" aria-hidden="true">
              {getInitials(profile?.name || profile?.email)}
            </span>
            <div className="m-ucard__body">
              <strong>{profile?.name || 'Usuário'}</strong>
              <small>{profile?.email}</small>
            </div>
            {profile?.role ? <span className="m-tag">{ROLE_LABELS[profile.role] ?? profile.role}</span> : null}
          </div>

          {canConfer ? (
            <div className="m-group m-rise" style={{ '--d': '60ms' }}>
              <button
                type="button"
                className="m-rowi"
                aria-label={conferenceCount > 0 ? `Conferência, ${conferenceCount} para conferir` : undefined}
                onClick={() => navigate('/conferencia')}
              >
                <span className="m-rowi__lead" aria-hidden="true">
                  <Icon name="clipboard-check" size={18} />
                </span>
                <span className="m-rowi__body">
                  <span className="m-rowi__label">Conferência</span>
                  <small className="m-rowi__sub">Relatório de Carga no celular</small>
                </span>
                {conferenceCount > 0 ? (
                  <span className="m-rowi__count" aria-hidden="true">
                    {conferenceCount}
                  </span>
                ) : null}
                <Icon name="chevron" size={16} className="m-rowi__chev" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {showNewsRow ? (
            <div className="m-group m-rise" style={{ '--d': '60ms' }}>
              <button type="button" className="m-rowi" onClick={() => navigate('/news')}>
                <span className="m-rowi__lead" aria-hidden="true">
                  <Icon name="news" size={18} />
                </span>
                <span className="m-rowi__body">
                  <span className="m-rowi__label">Notícias</span>
                  <small className="m-rowi__sub">Comunicados da operação</small>
                </span>
                <Icon name="chevron" size={16} className="m-rowi__chev" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {isAdmin ? (
            <>
              <h2 className="m-gh">Administração</h2>
              <div className="m-group m-rise" style={{ '--d': '80ms' }}>
                {ADMIN_SHORTCUTS.map((item) => (
                  <button key={item.to} type="button" className="m-rowi" onClick={() => navigate(item.to)}>
                    <span className="m-rowi__lead" aria-hidden="true">
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className="m-rowi__body">
                      <span className="m-rowi__label">{item.label}</span>
                      {item.sub ? <small className="m-rowi__sub">{item.sub}</small> : null}
                    </span>
                    <Icon name="chevron" size={16} className="m-rowi__chev" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="m-group m-rise" style={{ '--d': '140ms' }}>
            <button
              type="button"
              className="m-rowi"
              onClick={() => window.dispatchEvent(new Event(OPEN_SUPPORT_MODAL_EVENT))}
            >
              <span className="m-rowi__lead" aria-hidden="true">
                <Icon name="help" size={18} />
              </span>
              <span className="m-rowi__body">
                <span className="m-rowi__label">Suporte</span>
                <small className="m-rowi__sub">Abrir um chamado ou dúvida</small>
              </span>
              <Icon name="chevron" size={16} className="m-rowi__chev" aria-hidden="true" />
            </button>
            {canQuote ? (
              <a
                className="m-rowi"
                href={INTELLIQUOTE_REQUESTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Solicitar uma cotação no IntelliQuote (abre em nova aba)"
              >
                <span className="m-rowi__lead" aria-hidden="true">
                  <Icon name="file" size={18} />
                </span>
                <span className="m-rowi__body">
                  <span className="m-rowi__label">Solicitar uma cotação</span>
                  <small className="m-rowi__sub">IntelliQuote</small>
                </span>
                <Icon name="chevron" size={16} className="m-rowi__chev" aria-hidden="true" />
              </a>
            ) : null}
            {isAdmin ? (
              <a className="m-rowi" href={INTELLIQUOTE_WEB_URL} target="_blank" rel="noopener noreferrer">
                <span className="m-rowi__lead" aria-hidden="true">
                  <Icon name="external" size={18} />
                </span>
                <span className="m-rowi__body">
                  <span className="m-rowi__label">IntelliQuote</span>
                  <small className="m-rowi__sub">Cotações de fornecedores</small>
                </span>
                <Icon name="chevron" size={16} className="m-rowi__chev" aria-hidden="true" />
              </a>
            ) : null}
          </div>

          {!alreadyInstalled ? (
            <div className="m-group m-rise" style={{ '--d': '170ms' }}>
              <button type="button" className="m-rowi" onClick={() => setInstallGuideOpen(true)}>
                <span className="m-rowi__lead" aria-hidden="true">
                  <Icon name="download" size={18} />
                </span>
                <span className="m-rowi__body">
                  <span className="m-rowi__label">Instalar como app</span>
                  <small className="m-rowi__sub">Adicionar à tela inicial (e receber notificações)</small>
                </span>
                <Icon name="chevron" size={16} className="m-rowi__chev" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <div className="m-group m-rise" style={{ '--d': '200ms' }}>
            <div className="m-menu__label" id={themeLabelId}>
              Tema
            </div>
            <div className="m-seg" role="group" aria-labelledby={themeLabelId}>
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="m-seg__btn"
                  aria-pressed={theme.preference === option}
                  onClick={() => theme.setPreference(option)}
                >
                  {THEME_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="m-group m-group--danger m-rise" style={{ '--d': '240ms' }}>
            <button type="button" className="m-rowi" onClick={logout}>
              <span className="m-rowi__lead" aria-hidden="true">
                <Icon name="logout" size={18} />
              </span>
              <span className="m-rowi__body">
                <span className="m-rowi__label">Sair</span>
              </span>
            </button>
          </div>

          <SqQuimicaLogo
            variant="minusc"
            tone="light"
            size={30}
            label="SQ Química"
            className="m-menu__signature"
          />
        </>
      ) : (
      <>
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
        </>
      ) : null}

      {isAdmin || canQuote ? (
        <>
          <div className="ios-section-label">Suite SQ</div>
          <div className="ios-group">
            {canQuote ? (
              <a
                className="ios-row"
                href={INTELLIQUOTE_REQUESTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Solicitar uma cotação no IntelliQuote (abre em nova aba)"
              >
                <span className="ios-row__icon" style={{ background: 'linear-gradient(140deg, #0a5f50, #063f38)' }}>
                  <Icon name="file" size={15} aria-hidden="true" />
                </span>
                <span className="ios-row__body">
                  <span className="ios-row__title">Solicitar uma cotação</span>
                  <span className="ios-row__sub">Pedidos de cotação fora do forecast</span>
                </span>
                <Icon name="chevron" size={14} className="ios-row__chevron" aria-hidden="true" />
              </a>
            ) : null}
            {isAdmin ? (
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
            ) : null}
          </div>
        </>
      ) : null}

      <div className="ios-group ios-group--spaced">
        <button type="button" className="ios-row ios-row--center" onClick={logout}>
          <span className="ios-row__title ios-row__title--danger">Sair</span>
        </button>
      </div>
      </>
      )}

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
