import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

function lazyWithRetry(importPage, pageKey) {
  return lazy(async () => {
    try {
      const page = await importPage()

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(`sq-comex-lazy-retry:${pageKey}`)
      }

      return page
    } catch (error) {
      if (typeof window === 'undefined') {
        throw error
      }

      const retryStorageKey = `sq-comex-lazy-retry:${pageKey}`
      const hasRetried = window.sessionStorage.getItem(retryStorageKey) === 'true'

      if (hasRetried) {
        window.sessionStorage.removeItem(retryStorageKey)
        throw error
      }

      window.sessionStorage.setItem(retryStorageKey, 'true')
      window.location.reload()

      return new Promise(() => {})
    }
  })
}

const AdminPage = lazyWithRetry(() => import('./pages/AdminLayout'), 'admin-page')
const AdminForecastPage = lazyWithRetry(() => import('./pages/AdminForecastPage'), 'admin-forecast-page')
const AdminUsersPanel = lazyWithRetry(() => import('./features/admin/AdminUsersPanel'), 'admin-users-panel')
const AdminAnnouncementsPanel = lazyWithRetry(() => import('./features/admin/AdminAnnouncementsPanel'), 'admin-announcements-panel')
const AdminBarStatusPanel = lazyWithRetry(() => import('./features/admin/AdminBarStatusPanel'), 'admin-bar-panel')
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'), 'dashboard-page')
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'), 'login-page')
const NewsPage = lazyWithRetry(() => import('./pages/NewsPage'), 'news-page')
const PendingApprovalPage = lazyWithRetry(
  () => import('./pages/PendingApprovalPage'),
  'pending-approval-page'
)
const ProcessesPage = lazyWithRetry(() => import('./pages/ProcessesPage'), 'processes-page')
const VerifyEmailPage = lazyWithRetry(() => import('./pages/VerifyEmailPage'), 'verify-email-page')

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
        <Route path="/verificar-email" element={<VerifyEmailPage />} />
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
          >
            <Route index element={<Navigate to="/admin/usuarios" replace />} />
            <Route path="usuarios" element={<AdminUsersPanel />} />
            <Route path="comunicados" element={<AdminAnnouncementsPanel />} />
            <Route path="barra" element={<AdminBarStatusPanel />} />
          </Route>
          <Route
            path="/admin/previsoes"
            element={
              <ProtectedRoute requireRole="admin">
                <AdminForecastPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
