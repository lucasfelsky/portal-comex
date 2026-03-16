import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const NewsPage = lazy(() => import('./pages/NewsPage'))
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'))
const ProcessesPage = lazy(() => import('./pages/ProcessesPage'))

function PageLoader() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <strong>Carregando tela</strong>
        <p>Montando os módulos necessários para a rota atual.</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/aguardando-aprovacao" element={<PendingApprovalPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/processos" element={<ProcessesPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireRole="admin">
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
