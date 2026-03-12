import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function Header() {
  const { user, name, role, loading, logout } = useAuth() || {}
  const navigate = useNavigate()

  if (loading || !user || !user.emailVerified) return null

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      console.error('Logout error', err)
      alert('Erro ao deslogar: ' + (err.message || err))
    }
  }

  const navClass = ({ isActive }) =>
    isActive ? 'px-3 py-2 rounded-md text-blue-700 font-semibold bg-blue-50' : 'px-3 py-2 rounded-md text-gray-700 hover:text-blue-600'

  return (
    <header className="bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <NavLink to="/" className="text-lg font-bold tracking-tight text-slate-900">SQ COMEX UPDATES</NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" className={navClass}>Página Inicial</NavLink>
            <NavLink to="/processes" className={navClass}>Processos</NavLink>
            {(role === 'admin' || role === 'comex') && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-700">{name || user.email}</div>
          <button onClick={handleLogout} className="px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50">Logout</button>
        </div>
      </div>
    </header>
  )
}
