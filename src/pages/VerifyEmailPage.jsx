import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

function buildErrorMessage(error) {
  const details = error?.code ?? error?.message
  return details
    ? `Nao foi possivel confirmar o email. (${details})`
    : 'Nao foi possivel confirmar o email.'
}

export default function VerifyEmailPage() {
  const {
    isAuthenticated,
    hasAccess,
    isEmailVerified,
    loading,
    user,
    logout,
    resendVerificationEmail,
    refreshAuthenticatedUser,
    confirmEmailVerification,
  } = useAuth()
  const [searchParams] = useSearchParams()
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const oobCode = useMemo(() => String(searchParams.get('oobCode') ?? '').trim(), [searchParams])

  useEffect(() => {
    if (!oobCode) {
      return undefined
    }

    let isMounted = true

    async function applyVerificationCode() {
      setSubmitting(true)
      setError('')

      try {
        await confirmEmailVerification(oobCode)

        if (!isMounted) {
          return
        }

        setFeedback('Email confirmado com sucesso. Agora aguarde a aprovacao de um administrador.')
      } catch (confirmationError) {
        if (isMounted) {
          setError(buildErrorMessage(confirmationError))
        }
      } finally {
        if (isMounted) {
          setSubmitting(false)
        }
      }
    }

    applyVerificationCode()

    return () => {
      isMounted = false
    }
  }, [confirmEmailVerification, oobCode])

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <strong>Validando confirmacao</strong>
          <p>Carregando o status atual do seu acesso.</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated && hasAccess && isEmailVerified) {
    return <Navigate to="/" replace />
  }

  async function handleResendEmail() {
    setSubmitting(true)
    setError('')
    setFeedback('')

    try {
      await resendVerificationEmail()
      setFeedback('Enviamos um novo email de confirmacao para a sua caixa corporativa.')
    } catch (resendError) {
      setError(
        resendError?.code ?? resendError?.message
          ? `Nao foi possivel reenviar o email. (${resendError?.code ?? resendError?.message})`
          : 'Nao foi possivel reenviar o email.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRefreshStatus() {
    setSubmitting(true)
    setError('')
    setFeedback('')

    try {
      const refreshedUser = await refreshAuthenticatedUser()

      if (refreshedUser?.emailVerified) {
        setFeedback(
          hasAccess
            ? 'Verificacao confirmada. Sua conta ja esta regularizada.'
            : 'Verificacao confirmada. Agora aguarde a aprovacao de um administrador.'
        )
      } else {
        setFeedback(
          'Ainda nao localizamos a confirmacao. Se voce ja clicou no link, aguarde alguns segundos e tente novamente.'
        )
      }
    } catch (refreshError) {
      setError(
        refreshError?.code ?? refreshError?.message
          ? `Nao foi possivel atualizar o status. (${refreshError?.code ?? refreshError?.message})`
          : 'Nao foi possivel atualizar o status.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--form">
        <span className="brand__eyebrow">SQ Comex Updates</span>
        <h1>Confirmacao de email</h1>
        <p>
          {isAuthenticated && hasAccess
            ? `Seu acesso ja esta liberado, mas ainda falta confirmar o endereco ${user?.email ?? 'corporativo'}.`
            : isAuthenticated
            ? `Confirme o endereco ${user?.email ?? 'corporativo'} para validar seu cadastro.`
            : 'Abra este link com o mesmo navegador da sua conta ou volte para a tela de login apos a confirmacao.'}
        </p>

        {feedback ? <div className="success-banner">{feedback}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="auth-reset-panel">
          <strong>Status</strong>
          <p>
            {isAuthenticated && hasAccess
              ? 'O acesso ao sistema foi mantido para nao interromper a operacao. Mesmo assim, conclua a confirmacao do email corporativo.'
              : isAuthenticated
              ? 'A confirmacao do email e obrigatoria. Depois disso, o acesso ao sistema ainda depende da aprovacao manual do admin.'
              : 'Se o link ja foi aplicado, entre novamente para continuar.'}
          </p>
        </div>

        {isAuthenticated ? (
          <>
            <button
              type="button"
              className="primary-button auth-button"
              onClick={handleRefreshStatus}
              disabled={submitting}
            >
              {submitting ? 'Atualizando...' : 'Ja confirmei meu email'}
            </button>
            <button
              type="button"
              className="ghost-button auth-button"
              onClick={handleResendEmail}
              disabled={submitting}
            >
              Reenviar email de confirmacao
            </button>
            <button
              type="button"
              className="ghost-button auth-button"
              onClick={logout}
              disabled={submitting}
            >
              Sair
            </button>
          </>
        ) : (
          <a className="primary-button auth-button auth-button--link" href="/login">
            Voltar ao login
          </a>
        )}
      </div>
    </div>
  )
}
