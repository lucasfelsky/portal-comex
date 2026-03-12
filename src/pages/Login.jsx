import React, { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword
} from 'firebase/auth'
import useAuth from '../hooks/useAuth'
import { auth } from '../firebase'

const emailRegex = /^[^\s@]+@sqquimica\.com$/i

export default function Login() {
  const { user, loading } = useAuth() || {}
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])

  if (!loading && user?.emailVerified) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password)

      if (credential.user.emailVerified) {
        navigate('/', { replace: true })
      } else {
        navigate('/verify-email', { replace: true })
      }
    } catch (err) {
      console.error('[login] error', err)
      alert('Erro ao entrar: ' + (err.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!emailRegex.test(normalizedEmail)) {
      alert('Informe um e-mail corporativo válido (@sqquimica.com).')
      return
    }

    try {
      await sendPasswordResetEmail(auth, normalizedEmail)
      alert('E-mail de recuperação enviado. Verifique sua caixa de entrada.')
    } catch (err) {
      console.error('forgot password error', err)
      alert('Erro ao enviar recuperação de senha: ' + (err.message || err))
    }
  }

  return (
    <div className="login-root">
      <div className="login-bg" />
      <div className="login-center">
        <div className="login-card">
          <h2 className="text-2xl font-bold text-center mb-5">SQ COMEX UPDATES</h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">E-mail corporativo</label>
              <input
                className="input-login mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seunome@sqquimica.com"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Senha</label>
              <input
                type="password"
                className="input-login mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Lembre de mim
              </label>
              <button type="button" onClick={handleForgotPassword} className="underline text-slate-700 hover:text-slate-900">
                Esqueci minha senha
              </button>
            </div>

            <button type="submit" disabled={submitting} className="btn-login w-full">
              {submitting ? 'Entrando...' : 'ACESSAR SISTEMA'}
            </button>
          </form>

          <div className="text-center mt-5 text-sm">
            <Link to="/register" className="underline text-slate-700 hover:text-slate-900">Criar conta</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
