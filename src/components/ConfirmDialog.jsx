// ConfirmDialog: modal de confirmacao (Sprint 32).
// Substitui window.confirm() com UI consistente.
//
// API:
//   <ConfirmDialog
//     open={boolean}
//     title="Restaurar regras?"
//     message="Esta acao sera registrada na auditoria."
//     confirmLabel="Restaurar"
//     cancelLabel="Cancelar"
//     tone="danger" | "primary"  // default primary
//     onConfirm={() => void}
//     onCancel={() => void}
//     busy={boolean}
//     busyLabel="Aguarde..."  // rotulo do botao de confirmacao enquanto busy
//     error=""                // mensagem de erro exibida dentro do dialogo
//   />
//
// O modal gerencia foco, Esc e click-outside via <Modal> wrapper.
// role="alertdialog"; foco inicial no botao Cancelar; Esc/backdrop/x
// nao fecham o dialogo enquanto busy=true.

import { useId, useRef } from 'react'
import Modal from './Modal'

function haptic(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern) } catch { /* noop */ }
  }
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  onConfirm,
  onCancel,
  busy = false,
  busyLabel = 'Aguarde...',
  error = '',
}) {
  const confirmClass = tone === 'danger' ? 'danger-button' : 'primary-button'
  const cancelRef = useRef(null)
  const messageId = useId()

  function handleConfirm() {
    if (tone === 'danger') haptic(10)
    onConfirm?.()
  }

  function handleClose() {
    if (busy) return
    onCancel?.()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      role="alertdialog"
      initialFocusRef={cancelRef}
      ariaDescribedBy={message ? messageId : undefined}
    >
      <div className="confirm-dialog">
        {message ? <p id={messageId} className="confirm-dialog__message">{message}</p> : null}
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="ghost-button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClass}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
