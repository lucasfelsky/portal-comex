// Dialogo pequeno para renomear o documento adicional ("Outro") ja anexado.
// Muda so' o nome exibido (`description`) - o arquivo nunca e' tocado.
//
// API:
//   <RenameDocumentDialog
//     open={boolean}
//     initialValue="Certificado"      // nome atual
//     busy={boolean}                  // salvando: bloqueia fechar/enviar
//     error={{ title, detail } | null} // erro do servidor (dialogo segue aberto)
//     onSubmit={(nome) => void}       // nome ja aparado (trim + limite)
//     onCancel={() => void}
//   />
//
// O <Modal> cuida de foco inicial (no input), focus trap, Esc e de devolver
// o foco ao botao que abriu. Enter no input envia (submit nativo do form).

import { useId, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { MAX_ADDITIONAL_DOCUMENT_NAME_LENGTH } from './processDocuments'

export default function RenameDocumentDialog({
  open,
  initialValue = '',
  busy = false,
  error = null,
  onSubmit,
  onCancel,
}) {
  const inputRef = useRef(null)
  const hintId = useId()
  const validationId = useId()
  const [value, setValue] = useState(initialValue)
  const [validationError, setValidationError] = useState('')
  const [wasOpen, setWasOpen] = useState(open)

  // Ao abrir, recomeça do nome atual (ajuste de estado durante o render, sem useEffect).
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValue(initialValue)
      setValidationError('')
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const next = value.trim().slice(0, MAX_ADDITIONAL_DOCUMENT_NAME_LENGTH)
    if (!next) {
      setValidationError('Informe o nome do documento.')
      inputRef.current?.focus()
      return
    }
    setValidationError('')
    onSubmit?.(next)
  }

  return (
    <Modal open={open} onClose={onCancel} title="Renomear documento" initialFocusRef={inputRef}>
      <form className="confirm-dialog" noValidate onSubmit={handleSubmit}>
        <div className="field">
          <label className="field">
            <span>Nome do documento</span>
            <input
              ref={inputRef}
              className="text-input"
              type="text"
              maxLength={MAX_ADDITIONAL_DOCUMENT_NAME_LENGTH}
              autoComplete="off"
              value={value}
              readOnly={busy}
              aria-invalid={validationError ? 'true' : undefined}
              aria-describedby={validationError ? `${hintId} ${validationId}` : hintId}
              onChange={(event) => {
                setValue(event.target.value)
                if (validationError) setValidationError('')
              }}
            />
          </label>
          <small id={hintId} className="field-hint">
            O arquivo não muda, só o nome exibido.
          </small>
          {validationError ? (
            <p id={validationId} className="field-error" role="alert">
              {validationError}
            </p>
          ) : null}
        </div>
        {error ? (
          <div className="error-banner" role="alert">
            <strong>{error.title}</strong> {error.detail}
          </div>
        ) : null}
        <div className="confirm-dialog__actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
