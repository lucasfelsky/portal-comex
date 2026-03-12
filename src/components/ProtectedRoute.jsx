import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function ProtectedRoute({ children, requireRole }) {
  const { user, role, loading } = useAuth() || {}

  if (loading) {
    return (
      <div className="auth-loading-root">
        <div className="auth-loading-backdrop" />

        <div className="auth-loading-panel">
          <div className="relative flex flex-col items-center gap-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin-smooth" />
            </div>

            <span className="text-gray-100 text-sm tracking-wide">Carregando...</span>
          </div>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!user.emailVerified) return <Navigate to="/verify-email" replace />

  if (requireRole && role !== requireRole) return <Navigate to="/" replace />

  return children
}
