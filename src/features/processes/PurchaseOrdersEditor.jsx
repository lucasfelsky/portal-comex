import { useState } from 'react'
import { MAX_PURCHASE_ORDERS, getPurchaseOrderNumbers, normalizePurchaseOrders } from './purchaseOrders'
import { getFieldErrorId } from '../../utils/fieldErrors'

// F17.2d-2 (D-7): editor de `purchaseOrders[]` (POs do CONSOLIDADO) - cada
// PO agora e' um objeto `{ po, reference, supplierName }`. Linha de adicao
// com "Nova PO"/"Referência"/"Fornecedor" + "Adicionar PO" (desabilitado com
// PO vazia, repetida - case-insensitive - ou teto de 50); Enter em qualquer
// um dos 3 campos tambem adiciona. Lista com "Referência"/"Fornecedor"
// editaveis in-place (rename de `po` fora de escopo) + "Remover" por `po`.
// Emite a lista CRUA (a pagina normaliza com `trimText: false`). So' importa
// de `./purchaseOrders` (mesma regra de import de `LicensesEditor.jsx`).
export default function PurchaseOrdersEditor({ value, onChange, disabled = false, errors = {} }) {
  const purchaseOrders = Array.isArray(value) ? value : []
  const groupDomId = 'process-field-purchaseOrders'
  const groupError = errors.purchaseOrders
  const minHintId = 'process-field-purchaseOrders-min-hint'
  const [draftPo, setDraftPo] = useState('')
  const [draftReference, setDraftReference] = useState('')
  const [draftSupplierName, setDraftSupplierName] = useState('')

  const trimmedDraft = draftPo.trim()
  const existingNumbers = getPurchaseOrderNumbers(purchaseOrders)
  const isDuplicate = existingNumbers.some(
    (po) => po.toLowerCase() === trimmedDraft.toLowerCase()
  )
  const canAdd =
    Boolean(trimmedDraft) && !isDuplicate && purchaseOrders.length < MAX_PURCHASE_ORDERS

  function handleAdd() {
    if (!canAdd) return
    onChange(
      normalizePurchaseOrders(
        [
          ...purchaseOrders,
          { po: trimmedDraft, reference: draftReference, supplierName: draftSupplierName },
        ],
        { trimText: false }
      )
    )
    setDraftPo('')
    setDraftReference('')
    setDraftSupplierName('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleAdd()
    }
  }

  function handleFieldChange(po, field, fieldValue) {
    onChange(
      purchaseOrders.map((order) =>
        (typeof order === 'string' ? order : order?.po) === po
          ? { po, reference: order?.reference ?? '', supplierName: order?.supplierName ?? '', [field]: fieldValue }
          : order
      )
    )
  }

  function handleRemove(po) {
    onChange(
      purchaseOrders.filter((order) => (typeof order === 'string' ? order : order?.po) !== po)
    )
  }

  return (
    <div
      className="collection-windows-editor"
      id={groupError ? groupDomId : undefined}
      role={groupError ? 'group' : undefined}
      tabIndex={groupError ? -1 : undefined}
      aria-describedby={groupError ? getFieldErrorId(groupDomId) : undefined}
    >
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">
            {purchaseOrders.length} PO{purchaseOrders.length === 1 ? '' : 's'}
          </span>
          {groupError ? (
            <small className="field-error" id={getFieldErrorId(groupDomId)}>
              {groupError}
            </small>
          ) : null}
        </div>
      </div>

      <small className="field-hint" id={minHintId}>
        Consolidado: várias POs no mesmo HBL (mínimo 2). Remover uma PO limpa o vínculo dos itens
        que a usavam.
      </small>

      <div className="collection-windows-editor__row">
        <label className="field">
          <span>Nova PO</span>
          <input
            className="text-input"
            type="text"
            value={draftPo}
            onChange={(event) => setDraftPo(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ex.: PO-12345"
            disabled={disabled}
            aria-describedby={minHintId}
          />
        </label>
        <label className="field">
          <span>Referência</span>
          <input
            className="text-input"
            type="text"
            value={draftReference}
            onChange={(event) => setDraftReference(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ex.: referência do processo"
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>Fornecedor</span>
          <input
            className="text-input"
            type="text"
            value={draftSupplierName}
            onChange={(event) => setDraftSupplierName(event.target.value)}
            onKeyDown={handleKeyDown}
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
          {purchaseOrders.map((order) => {
            const po = typeof order === 'string' ? order : order?.po
            const reference = typeof order === 'string' ? '' : order?.reference ?? ''
            const supplierName = typeof order === 'string' ? '' : order?.supplierName ?? ''
            return (
              <li key={po} className="collection-windows-editor__item">
                <div className="collection-windows-editor__row">
                  <span>{po}</span>
                  <label className="field">
                    <span>Referência</span>
                    <input
                      className="text-input"
                      type="text"
                      value={reference}
                      onChange={(event) => handleFieldChange(po, 'reference', event.target.value)}
                      disabled={disabled}
                    />
                  </label>
                  <label className="field">
                    <span>Fornecedor</span>
                    <input
                      className="text-input"
                      type="text"
                      value={supplierName}
                      onChange={(event) => handleFieldChange(po, 'supplierName', event.target.value)}
                      disabled={disabled}
                    />
                  </label>
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
            )
          })}
        </ul>
      )}
    </div>
  )
}
