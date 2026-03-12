import React, { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const roleOptions = [
  { value: 'normal', label: 'normal' },
  { value: 'comex', label: 'comex' }
]

export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      (err) => console.error(err)
    )
    return () => unsub()
  }, [])

  const updateRole = async (userId, nextRole) => {
    try {
      setSavingId(userId)
      await updateDoc(doc(db, 'users', userId), {
        role: nextRole,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Erro ao atualizar role:', err)
      alert('Erro ao atualizar tipo de usuário: ' + (err.message || err))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Painel COMEX</h1>
      <p className="text-sm text-gray-600 mb-6">
        Usuários COMEX administram o sistema e podem adicionar, editar e remover embarques.
      </p>

      <div className="card">
        <h3 className="text-lg font-semibold">Usuários cadastrados</h3>
        <div className="mt-3 space-y-2">
          {users.map((u) => (
            <div key={u.uid || u.id} className="p-3 border rounded-lg flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{u.name || u.email}</div>
                <div className="text-sm text-muted">{u.email}</div>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor={`role-${u.id}`} className="text-sm text-gray-600">Tipo:</label>
                <select
                  id={`role-${u.id}`}
                  className="border rounded px-2 py-1"
                  value={u.role || 'normal'}
                  onChange={(e) => updateRole(u.id, e.target.value)}
                  disabled={savingId === u.id}
                >
                  {roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          {users.length === 0 && <div className="text-sm text-muted">Nenhum usuário cadastrado.</div>}
        </div>
      </div>
    </div>
  )
}
