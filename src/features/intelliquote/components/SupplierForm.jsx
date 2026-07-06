import { useEffect, useState } from 'react'

const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']
const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
  { value: 'blocked', label: 'Bloqueado' },
]

export default function SupplierForm({ initialValue, onSubmit, onCancel, busy }) {
  const [form, setForm] = useState(() => ({
    name: initialValue?.name ?? '',
    email: initialValue?.email ?? '',
    website: initialValue?.website ?? '',
    country: initialValue?.country ?? '',
    status: initialValue?.status ?? 'active',
    notes: initialValue?.notes ?? '',
    acceptedIncoterms: initialValue?.acceptedIncoterms ?? [],
  }))

  useEffect(() => {
    if (initialValue) {
      setForm({
        name: initialValue.name ?? '',
        email: initialValue.email ?? '',
        website: initialValue.website ?? '',
        country: initialValue.country ?? '',
        status: initialValue.status ?? 'active',
        notes: initialValue.notes ?? '',
        acceptedIncoterms: initialValue.acceptedIncoterms ?? [],
      })
    }
  }, [initialValue])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function toggleIncoterm(value) {
    setForm((current) => {
      const has = current.acceptedIncoterms.includes(value)
      return {
        ...current,
        acceptedIncoterms: has
          ? current.acceptedIncoterms.filter((item) => item !== value)
          : [...current.acceptedIncoterms, value],
      }
    })
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!form.name.trim() || !form.email.includes('@') || form.acceptedIncoterms.length === 0) {
      return
    }
    onSubmit({
      name: form.name.trim(),
      email: form.email.trim(),
      website: form.website.trim() || null,
      country: form.country.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      acceptedIncoterms: form.acceptedIncoterms,
    })
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>{initialValue ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>
      <div className="form-grid">
        <label className="field">
          <span>Nome</span>
          <input
            className="text-input"
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input
            className="text-input"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Website</span>
          <input
            className="text-input"
            type="url"
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
            placeholder="https://"
          />
        </label>
        <label className="field">
          <span>País</span>
          <input
            className="text-input"
            type="text"
            value={form.country}
            onChange={(e) => update('country', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select className="text-input" value={form.status} onChange={(e) => update('status', e.target.value)}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>Incoterms aceitos</span>
          <div className="incoterm-chips">
            {INCOTERMS.map((code) => (
              <button
                key={code}
                type="button"
                className={`chip${form.acceptedIncoterms.includes(code) ? ' chip-active' : ''}`}
                onClick={() => toggleIncoterm(code)}
              >
                {code}
              </button>
            ))}
          </div>
        </label>
        <label className="field full">
          <span>Observações</span>
          <textarea
            className="text-input text-input--textarea"
            rows={2}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </label>
      </div>
      <div className="form-actions">
        {onCancel ? (
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        ) : null}
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? 'Salvando...' : initialValue ? 'Atualizar' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
