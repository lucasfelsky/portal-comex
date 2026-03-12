import React, { useContext, useEffect, useState } from 'react'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useNavigate, useParams } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import { auth, db } from '../firebase'
import { logAudit } from '../components/AuditLogger'

export default function ProcessDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useContext(AuthContext)

  const [process, setProcess] = useState(null)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const canManageByRole = role === 'admin' || role === 'comex'
  const isOwner = process?.createdBy && auth.currentUser?.uid === process.createdBy
  const canEdit = canManageByRole || isOwner

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const snap = await getDoc(doc(db, 'processes', id))
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setProcess(data)
        setTitle(data.processo || '')
        setStatus(data.status || '')
      }
      setLoading(false)
    }

    load().catch((err) => {
      console.error(err)
      setLoading(false)
    })
  }, [id])

  const save = async () => {
    if (!process || !canEdit) {
      alert('Você não tem permissão para editar este processo.')
      return
    }

    const diff = { processo: title, status }

    await setDoc(
      doc(db, 'processes', id),
      { processo: title, status, updatedAt: serverTimestamp() },
      { merge: true }
    )

    await logAudit({
      entity: `processes/${id}`,
      action: 'update',
      userId: auth.currentUser?.uid,
      diff
    })

    setProcess((prev) => ({ ...prev, ...diff }))
    setEditing(false)
  }

  const remove = async () => {
    if (!canEdit) {
      alert('Você não tem permissão para excluir este processo.')
      return
    }

    if (!window.confirm('Confirmar exclusão do processo?')) return

    await deleteDoc(doc(db, 'processes', id))
    await logAudit({
      entity: `processes/${id}`,
      action: 'delete',
      userId: auth.currentUser?.uid,
      diff: { deleted: true }
    })

    navigate('/processes')
  }

  if (loading) return <div className="card">Carregando...</div>
  if (!process) return <div className="card">Processo não encontrado.</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">{process.processo || 'Processo'}</h2>
        {canEdit && (
          <div className="flex gap-2">
            {!editing && <button onClick={() => setEditing(true)} className="btn-primary">Editar</button>}
            <button onClick={remove} className="px-3 py-2 rounded-lg border text-red-600">Excluir</button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="card space-y-3">
          <div>
            <label className="block text-sm text-gray-600">Identificação do processo</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Status</label>
            <input className="input" value={status} onChange={(e) => setStatus(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <button onClick={save} className="btn-primary">Salvar</button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg border">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="text-sm text-muted">Status: <span className="font-medium">{process.status || '—'}</span></div>
        </div>
      )}
    </div>
  )
}
