import React, { useContext, useEffect, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import { auth, db } from '../firebase'
import { logAudit } from '../components/AuditLogger'

export default function Processes() {
  const [processes, setProcesses] = useState([])
  const { role } = useContext(AuthContext)
  const canManage = role === 'admin' || role === 'comex'

  useEffect(() => {
    const q = query(collection(db, 'processes'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => setProcesses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Erro onSnapshot processes:', err)
    )

    return () => unsub()
  }, [])

  const createProcess = async () => {
    if (!canManage) {
      alert('Somente usuários COMEX/Admin podem criar processos.')
      return
    }

    try {
      const payload = {
        processo: `P-${Date.now()}`,
        status: 'novo',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid ?? null
      }
      const docRef = await addDoc(collection(db, 'processes'), payload)
      await logAudit({
        entity: `processes/${docRef.id}`,
        action: 'create',
        userId: auth.currentUser?.uid,
        diff: payload
      })
    } catch (err) {
      console.error('Erro ao criar processo:', err)
      alert('Erro ao criar processo: ' + (err.message || err))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Processos</h2>
        {canManage && (
          <button onClick={createProcess} className="btn-primary">
            Novo processo
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {processes.length === 0 && <div className="card text-muted">Nenhum processo encontrado.</div>}

        {processes.map((p) => (
          <Link key={p.id} to={`/processes/${p.id}`} className="block card hover:shadow-soft transition">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-lg">{p.processo || p.po || p.id}</div>
                <div className="text-sm text-muted mt-1">
                  Status: <span className="font-medium text-gray-800">{p.status || '—'}</span>
                </div>
              </div>

              <div className="text-xs text-muted">#{p.id.slice(0, 6)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
