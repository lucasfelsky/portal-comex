import SelectField from '../../components/SelectField'
import { RECEIPT_DIVERGENCE_TYPES, MAX_RECEIPT_DIVERGENCE_NOTES } from './receiptDivergence'

// F17.4b (B-4): editor de divergencia no recebimento - usado por logistica E
// admin (`CollectionStatusEditView`). Presentacional - so' le `value` (via
// prop) e chama `onChange(field, value)`. Importa SO `SelectField` e
// `./receiptDivergence` (regra de import da suite: `ProcessesPage.test.jsx`
// mocka `processStatus`/`pendingFields`/etc com lista fechada de exports).
export default function ReceiptDivergenceFields({ value, imagesCount, onChange, disabled }) {
  const { receiptDivergence, receiptDivergenceType, receiptDivergenceNotes } = value ?? {}

  return (
    <div className="detail-card">
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={receiptDivergence === true}
          disabled={disabled}
          onChange={(event) => onChange('receiptDivergence', event.target.checked)}
        />
        <span>Houve divergência no recebimento?</span>
      </label>

      {receiptDivergence === true ? (
        <>
          <label className="field">
            <span>Tipo de divergência</span>
            <SelectField
              className="text-input"
              value={receiptDivergenceType ?? ''}
              disabled={disabled}
              onChange={(event) => onChange('receiptDivergenceType', event.target.value)}
            >
              <option value="">Selecione o tipo</option>
              {RECEIPT_DIVERGENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectField>
          </label>

          <label className="field">
            <span>Descrição da divergência</span>
            <textarea
              className="text-input text-area"
              value={receiptDivergenceNotes ?? ''}
              maxLength={MAX_RECEIPT_DIVERGENCE_NOTES}
              disabled={disabled}
              onChange={(event) => onChange('receiptDivergenceNotes', event.target.value)}
              placeholder="Descreva a divergência encontrada no recebimento."
            />
          </label>

          {imagesCount === 0 ? (
            <small className="field-hint">
              Anexe ao menos 1 foto em Fotos do recebimento, abaixo.
            </small>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
