// src/App.jsx
import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

import Header from './components/Header'

// pages
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import Home from './pages/Home'
import Processes from './pages/Processes'
import ProcessDetail from './pages/ProcessDetail'
import AdminPanel from './pages/AdminPanel'

function AppLayout({ children }) {
  const location = useLocation()
  // hide header on public auth pages
  const hideHeader = ['/login', '/register', '/verify-email'].includes(location.pathname)
  return (
    <div className="min-h-screen bg-gray-50">
      {!hideHeader && <Header />}
      <main className="max-w-7xl mx-auto p-6">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppLayout>
        <Routes>
          {/* public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          {/* protected */}
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/processes" element={<ProtectedRoute><Processes /></ProtectedRoute>} />
          <Route path="/processes/:id" element={<ProtectedRoute><ProcessDetail /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requireRole="comex"><AdminPanel /></ProtectedRoute>} />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </AuthProvider>
  )
}
