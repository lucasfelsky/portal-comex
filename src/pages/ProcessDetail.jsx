import React, { useEffect, useState, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { AuthContext } from '../contexts/AuthContext'
import { logAudit } from '../components/AuditLogger'

export default function ProcessDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [process, setProcess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const { role } = useContext(AuthContext)
  const canManageShipment = role === 'comex'

  useEffect(() => {
    const ref = doc(db, 'processes', id)
    let mounted = true
    getDoc(ref)
      .then((snap) => {
        if (!mounted) return
        if (snap.exists()) {
          setProcess({ id: snap.id, ...snap.data() })
          setTitle(snap.data().processo || '')
        } else {
          setProcess(null)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
    return () => { mounted = false }
  }, [id])

  const save = async () => {
    if (!process) return
    if (!canManageShipment) {
      alert('Somente usuários COMEX podem editar embarques.')
      return
    }

    try {
      const ref = doc(db, 'processes', id)
      const diff = { processo: title }
      await setDoc(ref, { processo: title, updatedAt: serverTimestamp() }, { merge: true })
      if (typeof logAudit === 'function') {
        await logAudit({ entity: `processes/${id}`, action: 'update', userId: auth.currentUser?.uid || null, diff })
      }
      setEditing(false)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar')
    }
  }

  const remove = async () => {
    if (!canManageShipment) {
      alert('Somente usuários COMEX podem remover embarques.')
      return
    }

    if (!confirm('Confirmar exclusão do embarque?')) return

    try {
      await deleteDoc(doc(db, 'processes', id))
      if (typeof logAudit === 'function') {
        await logAudit({ entity: `processes/${id}`, action: 'delete', userId: auth.currentUser?.uid || null, diff: null })
      }
      nav('/processes')
    } catch (err) {
      console.error(err)
      alert('Erro ao excluir')
    }
  }

  if (loading) return <div className="card">Carregando...</div>
  if (!process) return <div className="card">Embarque não encontrado.</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">{process.processo}</h2>
        <div className="flex gap-2">
          {canManageShipment && (
            <>
              {!editing && <button onClick={() => setEditing(true)} className="btn-primary">Editar</button>}
              <button onClick={remove} className="px-3 py-2 rounded-lg border text-danger">Excluir</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="card">
          <label className="block text-sm text-gray-600">Título</label>
          <input className="input mb-3" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary">Salvar</button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg border">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="text-sm text-muted">Status: <span className="font-medium">{process.status}</span></div>
          <div className="mt-4 text-sm text-muted">Criado em: {process.createdAt?.toDate ? process.createdAt.toDate().toLocaleString() : String(process.createdAt)}</div>
        </div>
      )}
    </div>
  )
}
