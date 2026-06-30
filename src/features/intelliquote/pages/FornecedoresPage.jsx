import { useEffect, useState } from 'react'
import { useSuppliers } from '../hooks/useSuppliers'
import SupplierForm from '../components/SupplierForm'

const STATUS_LABELS = {
  active: 'Ativo',
  inactive: 'Inativo',
  blocked: 'Bloqueado',
}

export default function FornecedoresPage() {
  const { suppliers, contacts, loading, error, reload, create, update, remove } = useSuppliers()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 3500)
    return () => clearTimeout(timer)
  }, [feedback])

  const filtered = suppliers.filter((supplier) => {
    if (!search) return true
    const term = search.toLowerCase()
    return (
      supplier.name?.toLowerCase().includes(term) ||
      supplier.email?.toLowerCase().includes(term) ||
      supplier.country?.toLowerCase().includes(term)
    )
  })

  async function handleSubmit(payload) {
    setBusy(true)
    try {
      if (editing) {
        await update(editing.id, payload)
        setFeedback('Fornecedor atualizado.')
      } else {
        await create(payload)
        setFeedback('Fornecedor criado.')
      }
      setEditing(null)
    } catch (err) {
      setFeedback({ message: err.message, error: true })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(supplier) {
    if (!window.confirm(`Apagar ${supplier.name}?`)) return
    try {
      await remove(supplier.id)
      setFeedback('Fornecedor removido.')
    } catch (err) {
      setFeedback({ message: err.message, error: true })
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Fornecedores</h1>
        <p className="page-subtitle">
          Cadastro de fornecedores, contatos principais e incoterms aceites.
        </p>
      </header>

      {feedback ? (
        <div className={`feedback${feedback.error ? ' error' : ''}`}>{feedback.message ?? feedback}</div>
      ) : null}
      {error ? <div className="feedback error">Erro: {error}</div> : null}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por nome, e-mail ou pais..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="primary-button"
          onClick={() => setEditing({})}
          disabled={busy}
        >
          Novo fornecedor
        </button>
      </div>

      {editing ? (
        <SupplierForm
          initialValue={editing.id ? editing : null}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
          busy={busy}
        />
      ) : null}

      <section className="card">
        {loading && suppliers.length === 0 ? (
          <p>A carregar fornecedores...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome / Contato principal</th>
                <th>E-mail</th>
                <th>Pais</th>
                <th>Status</th>
                <th>Incoterms</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((supplier) => {
                const supplierContacts = contacts[supplier.id] ?? []
                const primary = supplierContacts.find((c) => c.isPrimary)
                return (
                  <tr key={supplier.id}>
                    <td>
                      <strong>{supplier.name}</strong>
                      <div className="table-subtle">
                        {primary ? primary.name : 'Sem contato principal'}
                        {supplierContacts.length === 0 ? (
                          <span className="chip warning" title="Cadastre ao menos um contato">
                            {' '}Sem contato
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{supplier.email}</td>
                    <td>{supplier.country ?? '-'}</td>
                    <td>
                      <span className={`chip ${supplier.status === 'blocked' ? 'warning' : 'neutral'}`}>
                        {STATUS_LABELS[supplier.status] ?? supplier.status}
                      </span>
                    </td>
                    <td>
                      {(supplier.acceptedIncoterms ?? [])
                        .map((code) => <span key={code} className="chip">{code}</span>)}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button type="button" onClick={() => setEditing(supplier)}>Editar</button>
                        <button type="button" className="danger-button" onClick={() => handleDelete(supplier)}>
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center' }}>
                    Nenhum fornecedor encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}