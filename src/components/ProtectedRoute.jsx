import { Navigate, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function ProtectedRoute({ children, requireRole = null }) {
  const { isAuthenticated, isApproved, loading, profile } = useAuth()
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

  if (!isApproved && profile?.role !== 'admin') {
    return <Navigate to="/aguardando-aprovacao" replace />
  }

  if (requireRole && profile?.role !== requireRole) {
    return <Navigate to="/" replace />
  }

  return children
}
