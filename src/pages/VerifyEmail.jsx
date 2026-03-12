import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { sendEmailVerification } from 'firebase/auth'
import useAuth from '../hooks/useAuth'
import { auth } from '../firebase'

export default function VerifyEmail() {
  const { user, loading, refreshUser } = useAuth() || {}
  const navigate = useNavigate()

  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!user || user.emailVerified) return

    const interval = setInterval(async () => {
      await refreshUser?.()
      if (auth.currentUser?.emailVerified) {
        navigate('/', { replace: true })
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [user, refreshUser, navigate])

  if (!loading && !user) return <Navigate to="/login" replace />
  if (!loading && user?.emailVerified) return <Navigate to="/" replace />

  const resend = async () => {
    if (!auth.currentUser) return

    try {
      setSending(true)
      await sendEmailVerification(auth.currentUser)
      alert('E-mail de verificação reenviado.')
    } catch (err) {
      alert('Erro ao reenviar: ' + (err.message || err))
    } finally {
      setSending(false)
    }
  }

  const checkNow = async () => {
    setChecking(true)
    try {
      await refreshUser?.()
      if (auth.currentUser?.emailVerified) {
        navigate('/', { replace: true })
      } else {
        alert('Seu e-mail ainda não foi verificado.')
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold mb-2">Verifique seu e-mail</h2>
        <p className="text-sm text-slate-600 mb-4">
          Para acessar o sistema, confirme o e-mail enviado para <strong>{user?.email}</strong>.
        </p>

        <div className="flex gap-2">
          <button onClick={resend} disabled={sending} className="btn-primary">Reenviar e-mail</button>
          <button onClick={checkNow} disabled={checking} className="px-3 py-2 border rounded-lg">Já verifiquei</button>
        </div>
      </div>
    </div>
  )
}
