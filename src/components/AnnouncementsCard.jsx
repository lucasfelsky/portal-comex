// src/components/AnnouncementsCard.jsx
import React, { useEffect, useState, useContext } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { AuthContext } from '../contexts/AuthContext'

export default function AnnouncementsCard() {
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const { role } = useContext(AuthContext)

  useEffect(() => {
    const ref = doc(db, 'announcements', 'global')
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setData(snap.data())
        setText(snap.data().text || '')
      } else {
        setData(null)
      }
    }, err => console.error('err announcements', err))
    return () => unsub()
  }, [])

  const canEdit = role === 'comex'

  const save = async () => {
    if (!canEdit) {
      alert('Você não tem permissão para editar avisos.')
      return
    }
    setSaving(true)
    try {
      const ref = doc(db, 'announcements', 'global')
      await setDoc(ref, {
        text: text || null,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null
      }, { merge: true })
      setEditing(false)
    } catch (err) {
      console.error('Erro ao salvar announcement:', err)
      // FirebaseError tem .code (ex: 'permission-denied')
      if (err?.code === 'permission-denied') {
        alert('Erro: sem permissão. Apenas usuários COMEX podem editar avisos.')
      } else {
        alert('Erro ao salvar aviso: ' + (err.message || err))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted font-medium">AVISOS</div>
          <div className="mt-2 text-sm text-gray-800">
            {!data?.text && !editing ? <span className="text-muted">Sem avisos</span> : data?.text}
          </div>
          {data?.updatedAt && <div className="text-xs text-muted mt-2">Atualizado em {data.updatedAt?.toDate ? data.updatedAt.toDate().toLocaleString() : String(data.updatedAt)}</div>}
        </div>

        {canEdit && (
          <div className="ml-4 w-1/3">
            {!editing ? (
              <>
                <button onClick={() => setEditing(true)} className="btn-primary">Editar aviso</button>
              </>
            ) : (
              <div className="space-y-2">
                <textarea value={text} onChange={e => setText(e.target.value)} className="input" rows="4" />
                <div className="flex gap-2">
                  <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button>
                  <button onClick={() => { setEditing(false); setText(data?.text || '') }} className="px-3 py-2 rounded-lg border">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
