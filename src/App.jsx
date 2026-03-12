import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import useAuth from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Header from './components/Header'

import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import Home from './pages/Home'
import Processes from './pages/Processes'
import ProcessDetail from './pages/ProcessDetail'
import AdminPanel from './pages/AdminPanel'

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth() || {}

  if (loading) return null
  if (user?.emailVerified) return <Navigate to="/" replace />
  return children
}

function AppLayout({ children }) {
  const location = useLocation()
  const hideHeader = ['/login', '/register', '/verify-email'].includes(location.pathname)

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideHeader && <Header />}
      <main className="max-w-7xl mx-auto p-6">{children}</main>
    </div>
  )
}

function AppRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/processes" element={<ProtectedRoute><Processes /></ProtectedRoute>} />
        <Route path="/processes/:id" element={<ProtectedRoute><ProcessDetail /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute requireRole={['comex', 'admin']}><AdminPanel /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
