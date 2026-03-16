import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function LoginPage() {
  const { isAuthenticated, isApproved, login, register, authError, loading } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const redirectTo = location.state?.from?.pathname ?? '/'

  if (isAuthenticated && isApproved) {
    return <Navigate to={redirectTo} replace />
  }

  if (isAuthenticated && !isApproved) {
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
        setFeedback('Cadastro criado. Aguarde a aprovação de um administrador.')
      } else {
        await login(form.email, form.password)
      }
    } catch (submitError) {
      setError(submitError?.message || 'Falha na autenticação.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card auth-card--form" onSubmit={handleSubmit}>
        <span className="brand__eyebrow">SQ Comex Updates</span>
        <div className="auth-toggle">
          <button
            type="button"
            className={`auth-toggle__item${mode === 'login' ? ' auth-toggle__item--active' : ''}`}
            onClick={() => setMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`auth-toggle__item${mode === 'register' ? ' auth-toggle__item--active' : ''}`}
            onClick={() => setMode('register')}
          >
            Cadastrar
          </button>
        </div>
        <h1>{mode === 'register' ? 'Criar acesso corporativo' : 'Acesso ao painel'}</h1>
        <p>
          {mode === 'register'
            ? 'Cadastro permitido apenas para e-mails @sqquimica.com. O acesso será liberado após aprovação do admin.'
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
          <span>Email corporativo</span>
          <input
            className="text-input"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="nome@sqquimica.com"
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>Senha</span>
          <input
            className="text-input"
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            placeholder="Sua senha"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </label>

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
      </form>
    </div>
  )
}
