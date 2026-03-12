// src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import useAuth from '../hooks/useAuth'
import { db } from '../firebase'
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp
} from 'firebase/firestore'

export default function Home() {
  const auth = useAuth() || {}
  const role = auth.role || auth.userProfile?.role || null
  const isVerifiedUser = auth.user?.emailVerified || auth.user?.emailVerified === true || auth.emailVerified // best-effort

  // announcements
  const [annText, setAnnText] = useState('')
  const [annError, setAnnError] = useState(null)
  const [editingAnn, setEditingAnn] = useState(false)

  // barra
  const [barra, setBarra] = useState(null)
  const [barraError, setBarraError] = useState(null)
  const [editingBarra, setEditingBarra] = useState(false)
  const [editStatus, setEditStatus] = useState('PRATICÁVEL')
  const [editNote, setEditNote] = useState('')

  // processes
  const [processes, setProcesses] = useState([])
  const [processesError, setProcessesError] = useState(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadAll() {
      setLoading(true)
      await Promise.allSettled([loadAnnouncements(), loadBarra(), loadUpcomingProcesses()])
      if (mounted) setLoading(false)
    }
    loadAll()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -------------------------
  // Announcements
  // -------------------------
  const loadAnnouncements = async () => {
    try {
      setAnnError(null)
      const ref = doc(db, 'announcements', 'home')
      const snap = await getDoc(ref)
      if (snap.exists()) setAnnText(snap.data().text || '')
      else setAnnText('')
    } catch (err) {
      console.error('loadAnnouncements error', err)
      setAnnError(err)
      setAnnText('')
    }
  }

  const saveAnnouncements = async () => {
    try {
      // quick front check
      if (role !== 'comex') {
        alert('Apenas usuários COMEX podem editar avisos.')
        return
      }

      const ref = doc(db, 'announcements', 'home')
      const snap = await getDoc(ref)
      const payload = {
        text: annText,
        updatedAt: serverTimestamp()
      }

      if (snap.exists()) {
        await updateDoc(ref, payload)
        console.log('saveAnnouncements: updated')
      } else {
        await setDoc(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true })
        console.log('saveAnnouncements: created via setDoc')
      }

      setEditingAnn(false)
      await loadAnnouncements()
    } catch (err) {
      console.error('saveAnnouncements error', err)
      if (err?.code === 'permission-denied' || /permission/i.test(String(err))) {
        alert('Você não tem permissão para editar os avisos. Apenas usuários COMEX podem editar.')
      } else {
        alert('Erro ao salvar aviso: ' + (err?.message || String(err)))
      }
    }
  }

  // -------------------------
  // Barra (status)
  // -------------------------
  const loadBarra = async () => {
    try {
      setBarraError(null)
      const ref = doc(db, 'barra', 'status')
      let snap = await getDoc(ref)
      if (!snap.exists()) {
        // fallback para barStatus/status (caso schema antigo)
        snap = await getDoc(doc(db, 'barStatus', 'status'))
      }
      if (snap.exists()) {
        setBarra(snap.data())
        // sincroniza editor
        setEditStatus(snap.data().status || 'PRATICÁVEL')
        setEditNote(snap.data().note || '')
      } else {
        setBarra(null)
      }
    } catch (err) {
      console.error('loadBarra error', err)
      setBarraError(err)
      setBarra(null)
    }
  }

  const saveBarra = async () => {
    try {
      if (role !== 'comex') {
        alert('Apenas usuários COMEX podem editar o status da barra.')
        return
      }

      const ref = doc(db, 'barra', 'status')
      const snap = await getDoc(ref)
      const payload = {
        status: editStatus,
        note: editNote || '',
        updatedAt: serverTimestamp()
      }

      if (snap.exists()) {
        await updateDoc(ref, payload)
        console.log('saveBarra: updated')
      } else {
        await setDoc(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true })
        console.log('saveBarra: created')
      }

      await loadBarra()
      setEditingBarra(false)
    } catch (err) {
      console.error('saveBarra error', err)
      if (err?.code === 'permission-denied' || /permission/i.test(String(err))) {
        alert('Você não tem permissão para alterar a barra (verifique verificação de e-mail e role).')
      } else {
        alert('Erro ao salvar barra: ' + (err?.message || String(err)))
      }
    }
  }

  // -------------------------
  // Processes próximos (15 dias)
  // -------------------------
  const loadUpcomingProcesses = async () => {
    try {
      setProcessesError(null)
      const col = await getDocs(collection(db, 'processes'))
      const now = new Date()
      const limit = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)

      const prox = []
      col.forEach(d => {
        const p = d.data()
        const rawEta = p.eta ?? p.eta_original ?? p.etaDate ?? null
        if (!rawEta) return
        let etaDate = null
        try {
          if (rawEta && typeof rawEta.toDate === 'function') {
            etaDate = rawEta.toDate()
          } else {
            etaDate = new Date(rawEta)
            if (isNaN(etaDate)) etaDate = null
          }
        } catch (e) {
          etaDate = null
        }
        if (!etaDate) return
        if (etaDate >= now && etaDate <= limit) prox.push({ id: d.id, ...p, __etaDate: etaDate })
      })

      prox.sort((a, b) => a.__etaDate - b.__etaDate)
      setProcesses(prox)
    } catch (err) {
      console.error('loadUpcomingProcesses error', err)
      setProcessesError(err)
      setProcesses([])
    }
  }

  const statusStyle = {
    PRATICÁVEL: 'bg-green-500 text-white',
    IMPRATICÁVEL: 'bg-red-500 text-white',
    'PRATICÁVEL C/ RESTRIÇÕES': 'bg-yellow-400 text-black'
  }

  return (
    <div className="space-y-10">
      {/* AVISOS */}
      <div className="bg-white shadow p-6 rounded-xl border">
        <h2 className="text-xl font-bold mb-3">Avisos Importantes</h2>

        {annError && (
          <div className="text-red-600 mb-3">
            Não foi possível carregar os avisos. Verifique permissões ou contate o administrador.
          </div>
        )}

        {editingAnn ? (
          <>
            <textarea
              value={annText}
              onChange={e => setAnnText(e.target.value)}
              className="w-full p-3 border rounded-lg"
              rows={4}
            />
            <div className="flex gap-3 mt-3">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg" onClick={saveAnnouncements}>
                Salvar
              </button>
              <button className="px-4 py-2 bg-gray-300 rounded-lg" onClick={() => { setEditingAnn(false); loadAnnouncements() }}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-gray-700 whitespace-pre-line">{annText || 'Nenhum aviso no momento.'}</p>
            {role === 'comex' && (
              <button
                className="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg"
                onClick={() => setEditingAnn(true)}
              >
                Editar Avisos
              </button>
            )}
          </>
        )}
      </div>

      {/* BARRA DE ITAJAÍ / NAVEGANTES */}
      <div className="bg-white shadow p-6 rounded-xl border">
        <h2 className="text-xl font-bold mb-4">Condições da Barra de Itajaí / Navegantes</h2>

        {barraError ? (
          <div className="text-red-600">Não foi possível carregar o status da barra. Verifique permissões.</div>
        ) : null}

        {barra ? (
          <>
            <div className="flex items-center gap-4 mb-3">
              <div className={`inline-block px-4 py-2 rounded-lg font-bold ${statusStyle[barra.status] ?? 'bg-gray-200 text-gray-800'}`}>
                {barra.status}
              </div>
              <div className="text-sm text-gray-600">{barra.note || ''}</div>

              {role === 'comex' && (
                <div className="ml-auto">
                  <button className="px-3 py-1 border rounded mr-2" onClick={() => setEditingBarra(true)}>Editar</button>
                </div>
              )}
            </div>
          </>
        ) : (
          !barraError && <p className="text-gray-600">Carregando...</p>
        )}

        {/* editor inline para admins/comex */}
        {role === 'comex' && editingBarra && (
          <div className="mt-4 p-4 border rounded-lg bg-gray-50">
            <label className="block mb-2 text-sm font-semibold">Status</label>
            <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="p-2 border rounded w-full max-w-xs">
              <option value="PRATICÁVEL">PRATICÁVEL</option>
              <option value="IMPRATICÁVEL">IMPRATICÁVEL</option>
              <option value="PRATICÁVEL C/ RESTRIÇÕES">PRATICÁVEL C/ RESTRIÇÕES</option>
            </select>

            <label className="block mt-3 mb-2 text-sm font-semibold">Observação (opcional)</label>
            <textarea value={editNote} onChange={e => setEditNote(e.target.value)} className="w-full p-2 border rounded" rows={3} />

            <div className="mt-3 flex gap-2">
              <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={saveBarra}>Salvar</button>
              <button
                className="px-4 py-2 border rounded"
                onClick={() => {
                  setEditingBarra(false)
                  setEditNote(barra?.note || '')
                  setEditStatus(barra?.status || 'PRATICÁVEL')
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PROCESSOS PRÓXIMOS */}
      <div className="bg-white shadow p-6 rounded-xl border">
        <h2 className="text-xl font-bold mb-4">Processos Próximos (até 15 dias)</h2>

        {processesError && <div className="text-red-600 mb-3">Não foi possível carregar processos. Verifique permissões.</div>}

        {loading ? (
          <div className="text-gray-600">Carregando...</div>
        ) : processes.length === 0 ? (
          <p className="text-gray-600">Nenhum processo dentro do período.</p>
        ) : (
          processes.map(p => (
            <div key={p.id} className="p-4 border rounded-lg mb-3">
              <p className="font-semibold">{p.processo || p.description || p.po || 'Processo'}</p>
              <p className="text-gray-600">ETA: {p.__etaDate ? p.__etaDate.toLocaleString() : (p.eta ? String(p.eta) : '—')}</p>
              {p.status && <div className="text-sm text-gray-700 mt-1">Status: {p.status}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
