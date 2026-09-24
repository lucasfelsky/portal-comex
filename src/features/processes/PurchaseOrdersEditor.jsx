import { useState } from 'react'
import { MAX_PURCHASE_ORDERS, normalizePurchaseOrders } from './purchaseOrders'

// F17.2c (D-10): editor de `purchaseOrders[]` (POs do CONSOLIDADO) - lista
// com "Remover" por PO + campo "Nova PO"/"Adicionar PO" (desabilitado com
// input vazio, PO repetida - case-insensitive - ou teto de 50). Sem edicao
// in-place (rename fora de escopo, F17.2c). So' importa de `./purchaseOrders`
// (mesma regra de import de `LicensesEditor.jsx`).
export default function PurchaseOrdersEditor({ value, onChange, disabled = false }) {
  const purchaseOrders = Array.isArray(value) ? value : []
  const [draftValue, setDraftValue] = useState('')

  const trimmedDraft = draftValue.trim()
  const isDuplicate = purchaseOrders.some(
    (po) => po.toLowerCase() === trimmedDraft.toLowerCase()
  )
  const canAdd =
    Boolean(trimmedDraft) && !isDuplicate && purchaseOrders.length < MAX_PURCHASE_ORDERS

  function handleAdd() {
    if (!canAdd) return
    onChange(normalizePurchaseOrders([...purchaseOrders, trimmedDraft]))
    setDraftValue('')
  }

  function handleRemove(po) {
    onChange(purchaseOrders.filter((item) => item !== po))
  }

  return (
    <div className="collection-windows-editor">
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">
            {purchaseOrders.length} PO{purchaseOrders.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <small className="field-hint">
        Consolidado: várias POs no mesmo HBL (mínimo 2). Remover uma PO limpa o vínculo dos itens
        que a usavam.
      </small>

      <div className="collection-windows-editor__row">
        <label className="field">
          <span>Nova PO</span>
          <input
            className="text-input"
            type="text"
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            placeholder="Ex.: PO-12345"
            disabled={disabled}
          />
        </label>
        <button
          type="button"
          className="ghost-button"
          onClick={handleAdd}
          disabled={disabled || !canAdd}
        >
          Adicionar PO
        </button>
      </div>

      {purchaseOrders.length === 0 ? (
        <div className="empty-state" role="status">
          <strong>Nenhuma PO cadastrada</strong>
          <p>Adicione as POs deste consolidado (mínimo 2).</p>
        </div>
      ) : (
        <ul className="collection-windows-editor__list">
          {purchaseOrders.map((po) => (
            <li key={po} className="collection-windows-editor__item">
              <div className="collection-windows-editor__row">
                <span>{po}</span>
                <button
                  type="button"
                  className="ghost-button collection-windows-editor__remove"
                  onClick={() => handleRemove(po)}
                  disabled={disabled}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
