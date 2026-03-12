// src/components/Header.jsx
import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function Header() {
  const { user, name, role, loading, logout } = useAuth() || {}
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout error', err)
      alert('Erro ao deslogar: ' + (err.message || err))
    }
  }

  const navClass = ({ isActive }) =>
    isActive ? 'px-3 text-blue-600 font-semibold' : 'px-3 text-gray-700 hover:text-blue-600'

  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <NavLink to="/" className="text-xl font-bold">SQ COMEX UPDATES</NavLink>

          {/* navegação principal (visível apenas se carregado e o usuário está autenticado) */}
          {(!loading && user) && (
            <nav className="flex items-center gap-3">
              <NavLink to="/" className={navClass}>Página Inicial</NavLink>
              <NavLink to="/processes" className={navClass}>Processos</NavLink>
              {role === 'comex' && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!loading && user ? (
            <>
              <div className="text-sm text-gray-700">{name || user.email}</div>
              <button onClick={handleLogout} className="px-3 py-1 border rounded">Logout</button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navClass}>Login</NavLink>
              <NavLink to="/register" className={navClass}>Cadastrar</NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
