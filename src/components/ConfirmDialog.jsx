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
//   />
//
// O modal gerencia foco, Esc e click-outside via <Modal> wrapper.

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
}) {
  const confirmClass = tone === 'danger' ? 'danger-button' : 'primary-button'

  function handleConfirm() {
    if (tone === 'danger') haptic(10)
    onConfirm?.()
  }

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="confirm-dialog">
        {message ? <p className="confirm-dialog__message">{message}</p> : null}
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="ghost-button"
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
            {busy ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
