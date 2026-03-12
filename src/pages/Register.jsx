import React, { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import useAuth from '../hooks/useAuth'
import { auth, db } from '../firebase'

const emailRegex = /^[^\s@]+@sqquimica\.com$/i

export default function Register() {
  const { user, loading, refreshUser } = useAuth() || {}
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [checking, setChecking] = useState(false)

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])

  useEffect(() => {
    if (!showVerifyModal) return

    const interval = setInterval(async () => {
      try {
        await refreshUser?.()
        if (auth.currentUser?.emailVerified) {
          navigate('/', { replace: true })
        }
      } catch (err) {
        console.error('check verify interval error', err)
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [showVerifyModal, refreshUser, navigate])

  if (!loading && user?.emailVerified) return <Navigate to="/" replace />

  const handleRegister = async (e) => {
    e.preventDefault()

    if (!name.trim()) {
      alert('Informe o nome completo.')
      return
    }

    if (!emailRegex.test(normalizedEmail)) {
      alert('Somente e-mails @sqquimica.com podem se cadastrar.')
      return
    }

    setSubmitting(true)
    try {
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
      const createdUser = credential.user

      await setDoc(doc(db, 'users', createdUser.uid), {
        uid: createdUser.uid,
        email: createdUser.email,
        name: name.trim(),
        role: 'user',
        emailVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      await sendEmailVerification(createdUser)
      setShowVerifyModal(true)
    } catch (err) {
      console.error('[register] error', err)
      alert('Erro ao criar conta: ' + (err.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  const resendEmail = async () => {
    if (!auth.currentUser) return

    try {
      setChecking(true)
      await sendEmailVerification(auth.currentUser)
      alert('E-mail de verificação reenviado.')
    } catch (err) {
      alert('Erro ao reenviar e-mail: ' + (err.message || err))
    } finally {
      setChecking(false)
    }
  }

  const checkNow = async () => {
    setChecking(true)
    try {
      await refreshUser?.()
      if (auth.currentUser?.emailVerified) {
        navigate('/', { replace: true })
      } else {
        alert('Ainda não verificado. Confira sua caixa de entrada.')
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="login-root">
      <div className="login-bg" />
      <div className="login-center">
        <div className="login-card">
          <h2 className="text-2xl font-bold text-center mb-5">Criar conta</h2>

          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Nome completo</label>
              <input className="input-login mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">E-mail corporativo</label>
              <input className="input-login mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seunome@sqquimica.com" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Senha</label>
              <input type="password" className="input-login mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" />
            </div>

            <button type="submit" disabled={submitting} className="btn-login w-full">
              {submitting ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <div className="text-center mt-5 text-sm">
            <Link to="/login" className="underline text-slate-700 hover:text-slate-900">Voltar ao login</Link>
          </div>
        </div>

        {showVerifyModal && (
          <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative z-40 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold mb-2">Verifique seu e-mail</h3>
              <p className="text-sm text-slate-600 mb-4">
                Enviamos o e-mail de verificação para <strong>{normalizedEmail}</strong>. Assim que confirmar, você será redirecionado automaticamente.
              </p>

              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={resendEmail} disabled={checking}>Reenviar e-mail</button>
                <button className="px-4 py-2 border rounded-lg" onClick={checkNow} disabled={checking}>Já verifiquei</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
