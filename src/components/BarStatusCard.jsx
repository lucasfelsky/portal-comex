// src/components/BarStatusCard.jsx
import React, { useEffect, useState, useContext } from 'react'
import { db, auth } from '../firebase'
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'firebase/firestore'
import { AuthContext } from '../contexts/AuthContext'

const STATUS_OPTIONS = [
  { value: 'PRATICAVEL', label: 'PRATICÁVEL', color: 'bg-green-600' },
  { value: 'IMPRATICAVEL', label: 'IMPRATICÁVEL', color: 'bg-red-600' },
  { value: 'PRATICAVEL_RESTRICOES', label: 'PRATICÁVEL c/ RESTRIÇÕES', color: 'bg-yellow-400 text-black' }
]

function getStylesForStatus(status) {
  const opt = STATUS_OPTIONS.find(o => o.value === status)
  if (!opt) return { badgeClass: 'bg-gray-400', label: 'Indefinido' }
  return {
    badgeClass: opt.color,
    label: opt.label
  }
}

export default function BarStatusCard() {
  const [current, setCurrent] = useState(null)
  const [editingStatus, setEditingStatus] = useState('PRATICAVEL')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const { role } = useContext(AuthContext)

  const canEdit = role === 'comex'

  useEffect(() => {
    const ref = doc(db, 'barStatus', 'current')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setCurrent(data)
          setEditingStatus(data.status || 'PRATICAVEL')
          setNote(data.note || '')
        } else {
          setCurrent(null)
        }
      },
      (err) => {
        console.error('Erro ao ler barStatus:', err)
      }
    )
    return () => unsub()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (!auth.currentUser) {
      alert('É necessário estar logado para editar.')
      return
    }
    try {
      setSaving(true)
      const ref = doc(db, 'barStatus', 'current')
      await setDoc(ref, {
        status: editingStatus,
        note: note || null,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid,
        source: 'manual'
      }, { merge: true })
      alert('Condição da barra atualizada.')
    } catch (err) {
      console.error('Erro ao salvar barStatus:', err)
      alert('Erro ao salvar condição da barra: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  const { badgeClass, label } = getStylesForStatus(current?.status)

  const updatedAtStr = current?.updatedAt?.toDate
    ? current.updatedAt.toDate().toLocaleString()
    : current?.updatedAt
      ? String(current.updatedAt)
      : null

  return (
    <div className="mb-6 p-4 bg-white rounded shadow flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <div className="text-sm text-gray-500 uppercase tracking-wide">Condições da Barra Itajaí / Navegantes</div>
        <div className="mt-2 flex items-center gap-3">
          <span className={`inline-flex px-3 py-1 rounded-full text-white text-sm font-semibold ${badgeClass}`}>
            {label}
          </span>
          {current?.note && (
            <span className="text-sm text-gray-700">• {current.note}</span>
          )}
        </div>
        {updatedAtStr && (
          <div className="mt-1 text-xs text-gray-500">
            Atualizado em {updatedAtStr} {current?.source === 'manual' ? '(manual)' : '(automático)'}
          </div>
        )}
      </div>

      {canEdit && (
        <form onSubmit={handleSave} className="w-full md:w-auto flex flex-col md:flex-row items-start md:items-center gap-3">
          <select
            value={editingStatus}
            onChange={e => setEditingStatus(e.target.value)}
            className="p-2 border rounded text-sm"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Observação (opcional)"
            className="flex-1 p-2 border rounded text-sm"
            value={note}
            onChange={e => setNote(e.target.value)}
          />

          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 bg-blue-600 text-white rounded text-sm"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      )}
    </div>
  )
}
