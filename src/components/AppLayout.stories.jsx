import { Route, Routes } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import { ToastProvider } from './Toast'
import AppLayout from './AppLayout'

// AppLayout e' o shell inteiro do app (sidebar + topbar + outlet +
// command palette + notificacoes). Depende de AuthContext e assume
// Firebase nao configurado graciosamente (mesmo padrao usado nos
// testes de UI do projeto). Aqui simulamos um usuario admin logado.

export default {
  title: 'Components/AppLayout',
  component: AppLayout,
  parameters: { layout: 'fullscreen' },
}

const mockAuthValue = {
  loading: false,
  isAuthenticated: true,
  hasAccess: true,
  isEmailVerified: true,
  profile: { role: 'admin', name: 'Usuário Exemplo', email: 'comex3@sqquimica.com' },
  logout: () => {},
}

export const AdminShell = {
  render: () => (
    <ToastProvider>
      <AuthContext.Provider value={mockAuthValue}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={(
                <div className="card">
                  <p>Conteúdo da página (renderizado via &lt;Outlet /&gt;).</p>
                </div>
              )}
            />
          </Route>
        </Routes>
      </AuthContext.Provider>
    </ToastProvider>
  ),
}
