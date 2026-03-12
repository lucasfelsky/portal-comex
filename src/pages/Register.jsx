// src/pages/Register.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleRegister = async (e) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const u = cred.user
      // create firestore user doc with default role 'normal'
      await setDoc(doc(db, 'users', u.uid), {
        uid: u.uid,
        email: u.email,
        name: name || u.displayName || null,
        role: 'normal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      // send verification email immediately
      await sendEmailVerification(u)
      alert('Conta criada. Um email de verificação foi enviado. Verifique sua caixa de entrada.')
      navigate('/verify-email', { replace: true })
    } catch (err) {
      console.error('[register] error', err)
      alert('Erro ao criar conta: ' + (err.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white/95 rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold text-center mb-4">Criar conta</h2>

        <form onSubmit={handleRegister}>
          <label className="text-xs font-semibold">Nome completo</label>
          <input className="w-full p-2 border rounded mt-1 mb-3" value={name} onChange={e => setName(e.target.value)} placeholder="Fulano da Silva" />

          <label className="text-xs font-semibold">E-mail corporativo (@sqquimica.com)</label>
          <input className="w-full p-2 border rounded mt-1 mb-3" value={email} onChange={e => setEmail(e.target.value)} placeholder="seunome@sqquimica.com" />

          <label className="text-xs font-semibold">Senha</label>
          <input type="password" className="w-full p-2 border rounded mt-1 mb-4" value={password} onChange={e => setPassword(e.target.value)} placeholder="senha" />

          <button type="submit" disabled={submitting} className="w-full bg-slate-900 text-white py-2 rounded">
            {submitting ? 'Enviando...' : 'Criar Conta'}
          </button>
        </form>

        <div className="text-center mt-4">
          <a href="/login" className="text-sm underline">Voltar ao login</a>
        </div>
      </div>
    </div>
  )
}
