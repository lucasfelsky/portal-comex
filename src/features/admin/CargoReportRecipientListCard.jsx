import { useId, useState } from 'react'
import Icon from '../../components/Icon'
import {
  CARGO_REPORT_RECIPIENTS_MAX_PER_LIST,
  isValidCargoReportRecipientEmail,
  validateNewRecipientEmail,
} from './cargoReportRecipients'

// Card de UMA lista de destinatários (Técnico ou Faturamento/fiscal). Controlado pelo painel:
// `items` é o rascunho; `onChange(novaLista)` devolve a lista alterada.
export default function CargoReportRecipientListCard({ label, description, items, disabled, onChange }) {
  const inputId = useId()
  const errorId = useId()
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')

  const isFull = items.length >= CARGO_REPORT_RECIPIENTS_MAX_PER_LIST

  function handleAdd(event) {
    event.preventDefault()
    if (disabled) return

    const { email, error } = validateNewRecipientEmail(inputValue, items)
    if (error) {
      setInputError(error)
      return
    }

    onChange([...items, email])
    setInputValue('')
    setInputError('')
  }

  function handleRemove(email) {
    onChange(items.filter((item) => item !== email))
    setInputError('')
  }

  return (
    <article className="list-card crr-card">
      <div className="card-heading">
        <div>
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
        <span className="ad-pill ad-pill--neutral">
          {items.length} de {CARGO_REPORT_RECIPIENTS_MAX_PER_LIST}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="field-hint">Nenhum e-mail cadastrado.</p>
      ) : (
        <ul className="detail-stack crr-list">
          {items.map((email) => {
            const isInvalid = !isValidCargoReportRecipientEmail(email)
            return (
              <li key={email} className="crr-item">
                <span className="crr-item__email">
                  {email}
                  {isInvalid ? (
                    <span className="field-hint crr-item__invalid"> Formato inválido - remova para salvar</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="secondary-button crr-item__remove"
                  aria-label={`Remover ${email} da lista ${label}`}
                  disabled={disabled}
                  onClick={() => handleRemove(email)}
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form className="detail-stack crr-form" onSubmit={handleAdd} noValidate>
        <label className="field" htmlFor={inputId}>
          <span>Adicionar e-mail</span>
          <input
            id={inputId}
            type="email"
            className="text-input"
            autoComplete="off"
            placeholder="nome@sqquimica.com"
            value={inputValue}
            disabled={disabled || isFull}
            aria-invalid={inputError ? 'true' : undefined}
            aria-describedby={inputError ? errorId : undefined}
            onChange={(event) => {
              setInputValue(event.target.value)
              if (inputError) setInputError('')
            }}
          />
        </label>
        {inputError ? (
          <p id={errorId} className="field-hint crr-error" role="alert">
            {inputError}
          </p>
        ) : null}
        <div className="action-row">
          <button type="submit" className="secondary-button" disabled={disabled || isFull}>
            Adicionar
          </button>
        </div>
      </form>
    </article>
  )
}
