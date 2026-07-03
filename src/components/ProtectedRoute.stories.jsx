import { AuthContext } from '../contexts/AuthContext'
import ProtectedRoute from './ProtectedRoute'

// ProtectedRoute depende de useAuth() (contexto de autenticação real do
// app). Aqui simulamos os estados possíveis via AuthContext.Provider,
// já que não há Firebase configurado no Storybook.

export default {
  title: 'Components/ProtectedRoute',
  component: ProtectedRoute,
}

function withAuth(value, children) {
  return (
    <AuthContext.Provider value={value}>
      <ProtectedRoute>{children}</ProtectedRoute>
    </AuthContext.Provider>
  )
}

export const Loading = {
  render: () =>
    withAuth(
      { loading: true, isAuthenticated: false, hasAccess: false, isEmailVerified: false, profile: null },
      <div className="card">Conteúdo protegido</div>
    ),
}

export const Authenticated = {
  render: () =>
    withAuth(
      {
        loading: false,
        isAuthenticated: true,
        hasAccess: true,
        isEmailVerified: true,
        profile: { role: 'admin', name: 'Usuário Exemplo' },
      },
      <div className="card">Conteúdo protegido — visível para usuários com acesso liberado.</div>
    ),
}
