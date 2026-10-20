import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import useMediaQuery from '../hooks/useMediaQuery'
import { useToast } from '../components/Toast'
import Icon from '../components/Icon'
import { ProductMark, SqQuimicaLogo } from '../components/BrandMark'
import { LoginPortScene, LoginSeaChart, LoginWaves } from '../components/LoginArt'
import sqQuimicaLogo from '../../assets/sqquimica.png'

// Refino F5b (Login.dc.html): >= 1041px o campo de senha ganha a linha do rotulo com
// "Esqueci minha senha" e o botao mostrar/ocultar; tablet/mobile ficam com o campo legado.
const DESKTOP_QUERY = '(min-width: 1041px)'

export default function LoginPage() {
  const {
    isAuthenticated,
    hasAccess,
    isEmailVerified,
    login,
    register,
    requestPasswordReset,
    authError,
    loading,
  } = useAuth()
  const location = useLocation()
  const toast = useToast()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [showResetForm, setShowResetForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const redirectTo = location.state?.from?.pathname ?? '/'

  if (isAuthenticated && hasAccess) {
    return <Navigate to={redirectTo} replace />
  }

  if (isAuthenticated && !isEmailVerified) {
    return <Navigate to="/verificar-email" replace />
  }

  if (isAuthenticated && !hasAccess) {
    return <Navigate to="/aguardando-aprovacao" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setFeedback('')

    try {
      if (mode === 'register') {
        await register(form)
        setFeedback('Cadastro criado. Confirme seu email corporativo e depois aguarde a aprovação do admin.')
        toast.success('Cadastro criado. Confirme seu email.')
      } else {
        await login(form.email, form.password)
      }
    } catch (submitError) {
      console.error('Falha no fluxo de autenticação.', submitError)
      const details = submitError?.code ?? submitError?.message
      setError(details ? `Falha na autenticação. (${details})` : 'Falha na autenticação.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePasswordReset(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setFeedback('')

    try {
      await requestPasswordReset(form.email)
      setFeedback('Enviamos as instruções de redefinição para o seu e-mail corporativo.')
      setShowResetForm(false)
      toast.success('Instruções de redefinição enviadas para o seu email.')
    } catch (submitError) {
      console.error('Falha ao enviar redefinição de senha.', submitError)
      const details = submitError?.code ?? submitError?.message
      setError(
        details
          ? `Não foi possível enviar o e-mail de redefinição. (${details})`
          : 'Não foi possível enviar o e-mail de redefinição.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  function toggleResetForm() {
    setShowResetForm((current) => !current)
    setError('')
    setFeedback('')
  }

  function handlePasswordChange(event) {
    setForm((current) => ({ ...current, password: event.target.value }))
  }

  const passwordAutoComplete = mode === 'register' ? 'new-password' : 'current-password'

  return (
    <div className="auth-screen auth-screen--login">
      <LoginSeaChart />
      <LoginWaves />
      <aside className="auth-brand">
        <span className="auth-brand__logo">
          <img src={sqQuimicaLogo} alt="SQ Química" />
        </span>
        <span className="auth-brand__eyebrow">SQ Química · Suite COMEX</span>
        <div className="auth-brand__head">
          <ProductMark product="comex" tone="dark" size={56} className="auth-brand__mark" />
          <h1>Portal COMEX</h1>
          <p>Acompanhe chegadas, comunicados e o fluxo de importação da operação em um só lugar.</p>
        </div>
        <div className="auth-brand__feats">
          <div className="auth-brand__feat">
            <span className="auth-brand__feat-icon">
              <Icon name="nav-arrivals" size={18} strokeWidth={1.9} />
            </span>
            <span className="auth-brand__feat-text">
              <strong>Fila de chegadas</strong>
              <small>ETA, DUIMP, anuências e coleta por processo</small>
            </span>
          </div>
          <div className="auth-brand__feat">
            <span className="auth-brand__feat-icon">
              <Icon name="bell-ring" size={18} strokeWidth={1.9} />
            </span>
            <span className="auth-brand__feat-text">
              <strong>Notificações e comunicados</strong>
              <small>Avisos da operação e das suas cargas</small>
            </span>
          </div>
        </div>
        <LoginPortScene />
      </aside>
      <div className="auth-panel">
      <form className="auth-card auth-card--form" onSubmit={handleSubmit}>
        <span className="brand__eyebrow">Portal COMEX</span>
        <div className="auth-toggle">
          <button
            type="button"
            className={`auth-toggle__item${mode === 'login' ? ' auth-toggle__item--active' : ''}`}
            aria-pressed={mode === 'login'}
            onClick={() => setMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`auth-toggle__item${mode === 'register' ? ' auth-toggle__item--active' : ''}`}
            aria-pressed={mode === 'register'}
            onClick={() => setMode('register')}
          >
            Cadastrar
          </button>
        </div>
        <h1>{mode === 'register' ? 'Criar acesso corporativo' : 'Acesso ao painel'}</h1>
        <p className={`auth-card__lead${mode === 'login' ? ' auth-card__lead--login' : ''}`}>
          {mode === 'register'
            ? 'Cadastro permitido apenas para e-mails @sqquimica.com. O acesso exige email verificado e aprovação do admin.'
            : 'Use sua conta corporativa @sqquimica.com para acessar o sistema.'}
        </p>

        {feedback ? <div className="success-banner">{feedback}</div> : null}
        {authError || error ? <div className="error-banner">{authError || error}</div> : null}

        {mode === 'register' ? (
          <label className="field">
            <span>Nome</span>
            <input
              className="text-input"
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nome completo"
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className="field">
          <span>E-mail corporativo</span>
          <input
            className="text-input"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="nome@sqquimica.com"
            autoComplete="email"
          />
        </label>

        {isDesktop ? (
          <div className="field auth-field--password">
            <div className="auth-field__row">
              <label className="auth-field__label" htmlFor="login-password">
                Senha
              </label>
              {mode === 'login' ? (
                <button type="button" className="auth-link-button" onClick={toggleResetForm}>
                  Esqueci minha senha
                </button>
              ) : null}
            </div>
            <div className="auth-password">
              <input
                id="login-password"
                className="text-input"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handlePasswordChange}
                placeholder="Sua senha"
                autoComplete={passwordAutoComplete}
              />
              <button
                type="button"
                className="auth-password__toggle"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} strokeWidth={1.9} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="field">
              <span>Senha</span>
              <input
                className="text-input"
                type="password"
                value={form.password}
                onChange={handlePasswordChange}
                placeholder="Sua senha"
                autoComplete={passwordAutoComplete}
              />
            </label>

            {mode === 'login' ? (
              <div className="auth-actions">
                <button type="button" className="auth-link-button" onClick={toggleResetForm}>
                  Esqueci minha senha
                </button>
              </div>
            ) : null}
          </>
        )}

        {mode === 'login' && showResetForm ? (
          <div className="auth-reset-panel">
            <strong>Redefinir senha</strong>
            <p>Use o e-mail corporativo da sua conta para receber o link de redefinição.</p>
            <button
              type="button"
              className="ghost-button ghost-button--secondary auth-reset-panel__button"
              disabled={submitting || loading || !form.email.trim()}
              onClick={handlePasswordReset}
            >
              {submitting || loading ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
          </div>
        ) : null}

        <button
          type="submit"
          className="primary-button auth-button"
          disabled={submitting || loading}
        >
          {submitting || loading
            ? mode === 'register'
              ? 'Criando...'
              : 'Entrando...'
            : mode === 'register'
              ? 'Criar conta'
              : 'Entrar'}
        </button>
        <p className="auth-card__legal">Acesso restrito a colaboradores e parceiros da SQ Química.</p>
      </form>
      </div>
      <div className="auth-sq-signature">
        <SqQuimicaLogo variant="minusc" tone="light" size={36} label="SQ Química" />
      </div>
    </div>
  )
}
