import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

function buildErrorMessage(error) {
  const details = error?.code ?? error?.message
  return details
    ? `Não foi possível confirmar o email. (${details})`
    : 'Não foi possível confirmar o email.'
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

  // confirmEmailVerification muda de referência a cada render do AuthProvider
  // (o useMemo do contexto recalcula quando setUser/setProfile disparam, o
  // que a propria confirmacao causa via refreshAuthenticatedUser). Guardamos
  // a versao mais recente numa ref para nao precisar dela nas deps do efeito
  // abaixo — do contrario o efeito reexecuta e reaplica o MESMO oobCode ja
  // consumido, e o Firebase Auth responde auth/invalid-action-code na 2a vez.
  const confirmEmailVerificationRef = useRef(confirmEmailVerification)
  confirmEmailVerificationRef.current = confirmEmailVerification

  useEffect(() => {
    if (!oobCode) {
      return undefined
    }

    let isMounted = true

    async function applyVerificationCode() {
      setSubmitting(true)
      setError('')

      try {
        await confirmEmailVerificationRef.current(oobCode)

        if (!isMounted) {
          return
        }

        setFeedback('Email confirmado com sucesso. Agora aguarde a aprovação de um administrador.')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- oobCode so' deve ser aplicado 1x; ver comentario acima
  }, [oobCode])

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <strong>Validando confirmação</strong>
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
      setFeedback('Enviamos um novo email de confirmação para a sua caixa corporativa.')
    } catch (resendError) {
      setError(
        resendError?.code ?? resendError?.message
          ? `Não foi possível reenviar o email. (${resendError?.code ?? resendError?.message})`
          : 'Não foi possível reenviar o email.'
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
      const refreshedUser = await refreshAuthenticatedUser({ forceClaimsRefresh: true })

      if (refreshedUser?.emailVerified) {
        setFeedback(
          hasAccess
            ? 'Verificação confirmada. Sua conta já está regularizada.'
            : 'Verificação confirmada. Agora aguarde a aprovação de um administrador.'
        )
      } else {
        setFeedback(
          'Ainda não localizamos a confirmação. Se você já clicou no link, aguarde alguns segundos e tente novamente.'
        )
      }
    } catch (refreshError) {
      setError(
        refreshError?.code ?? refreshError?.message
          ? `Não foi possível atualizar o status. (${refreshError?.code ?? refreshError?.message})`
          : 'Não foi possível atualizar o status.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--form">
        <span className="brand__eyebrow">SQ Comex Updates</span>
        <h1>Confirmação de email</h1>
        <p>
          {isAuthenticated && hasAccess
            ? `Seu acesso já está liberado, mas ainda falta confirmar o endereço ${user?.email ?? 'corporativo'}.`
            : isAuthenticated
            ? `Confirme o endereço ${user?.email ?? 'corporativo'} para validar seu cadastro.`
            : 'Abra este link com o mesmo navegador da sua conta ou volte para a tela de login após a confirmação.'}
        </p>

        {feedback ? <div className="success-banner">{feedback}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="auth-reset-panel">
          <strong>Status</strong>
          <p>
            {isAuthenticated && hasAccess
              ? 'O acesso ao sistema foi mantido para não interromper a operação. Mesmo assim, conclua a confirmação do email corporativo.'
              : isAuthenticated
              ? 'A confirmação do email é obrigatória. Depois disso, o acesso ao sistema ainda depende da aprovação manual do admin.'
              : 'Se o link já foi aplicado, entre novamente para continuar.'}
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
              {submitting ? 'Atualizando...' : 'Já confirmei meu email'}
            </button>
            <button
              type="button"
              className="ghost-button auth-button"
              onClick={handleResendEmail}
              disabled={submitting}
            >
              Reenviar email de confirmação
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
