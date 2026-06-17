import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function PendingApprovalPage() {
  const { isAuthenticated, hasAccess, isEmailVerified, profile, logout } = useAuth()
  const currentStatus = profile?.status || 'Pendente'
  const isRejected = currentStatus === 'Reprovado'
  const isBlocked = currentStatus === 'Bloqueado'

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (hasAccess) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--form">
        <span className="brand__eyebrow">Portal COMEX</span>
        <h1>{isRejected ? 'Acesso reprovado' : isBlocked ? 'Acesso bloqueado' : 'Acesso pendente'}</h1>
        <p>
          O usuário <strong>{profile?.email}</strong> foi criado com sucesso, mas o acesso ainda não
          foi liberado.
        </p>
        <div className="auth-reset-panel">
          <strong>Próximo passo</strong>
          <p>
            {isRejected
              ? 'Seu cadastro foi reprovado. Procure um administrador caso precise revisar o acesso.'
              : isBlocked
                ? 'Seu acesso foi bloqueado por um administrador. Procure a administracao para regularizar o acesso.'
                : isEmailVerified
                  ? 'Seu email ja foi verificado. Agora aguarde a liberacao manual de um administrador.'
                  : 'Confirme primeiro o email corporativo e, depois disso, aguarde a liberacao manual de um administrador.'}
          </p>
        </div>
        <div className="success-banner">Status atual: {currentStatus}</div>
        <button type="button" className="ghost-button auth-button" onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  )
}
