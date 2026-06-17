import { Navigate, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function ProtectedRoute({ children, requireRole = null }) {
  const { isAuthenticated, hasAccess, isEmailVerified, loading, profile } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <strong>Carregando sessão</strong>
          <p>Validando autenticação e perfil de acesso.</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!hasAccess) {
    if (!isEmailVerified) {
      return <Navigate to="/verificar-email" replace />
    }

    return <Navigate to="/aguardando-aprovacao" replace />
  }

  if (requireRole && profile?.role !== requireRole) {
    return <Navigate to="/" replace />
  }

  return children
}
