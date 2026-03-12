import React, { useEffect, useState, useContext } from 'react'
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { Link } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'

export default function Processes() {
  const [processes, setProcesses] = useState([])
  const { role } = useContext(AuthContext)

  useEffect(() => {
    const q = query(collection(db, 'processes'), orderBy('eta_original', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      setProcesses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => console.error('Erro onSnapshot processes:', err))
    return () => unsub()
  }, [])

  const createProcess = async () => {
    if (role !== 'comex') {
      alert('Somente usuários COMEX podem criar embarques.')
      return
    }

    try {
      const data = {
        processo: `P-${Date.now()}`,
        status: 'novo',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser ? auth.currentUser.uid : null
      }
      await addDoc(collection(db, 'processes'), data)
    } catch (err) {
      console.error('Erro ao criar processo:', err)
      alert('Erro ao criar processo: ' + (err.message || err))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Embarques</h2>
        {role === 'comex' && (
          <button onClick={createProcess} className="btn-primary">
            Novo embarque
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {processes.length === 0 && (
          <div className="card text-muted">Nenhum embarque encontrado.</div>
        )}

        {processes.map(p => (
          <Link key={p.id} to={`/processes/${p.id}`} className="block card hover:shadow-soft transition">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-lg">{p.processo || p.po}</div>
                <div className="text-sm text-muted mt-1">Status: <span className="font-medium text-gray-800">{p.status}</span></div>
              </div>

              <div className="text-xs text-muted">#{p.id.slice(0, 6)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
