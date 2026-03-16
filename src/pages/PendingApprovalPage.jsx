import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function PendingApprovalPage() {
  const { isAuthenticated, isApproved, profile, logout } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (isApproved) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--form">
        <span className="brand__eyebrow">SQ Comex Updates</span>
        <h1>Cadastro em análise</h1>
        <p>
          O usuário <strong>{profile?.email}</strong> foi criado com sucesso, mas ainda precisa de
          aprovação de um administrador.
        </p>
        <div className="success-banner">Status atual: {profile?.status || 'Pendente'}</div>
        <button type="button" className="ghost-button auth-button" onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  )
}
