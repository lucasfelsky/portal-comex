import { ToastProvider, useToast } from './Toast'

export default {
  title: 'Components/Toast',
}

function ToastTriggers() {
  const toast = useToast()
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="primary-button" onClick={() => toast.success('Salvo com sucesso.')}>
        Success
      </button>
      <button type="button" className="danger-button" onClick={() => toast.error('Falha ao salvar.')}>
        Error
      </button>
      <button type="button" className="ghost-button" onClick={() => toast.info('Verifique o e-mail.')}>
        Info
      </button>
      <button type="button" className="ghost-button" onClick={() => toast.warning('Sessão expirando.')}>
        Warning
      </button>
    </div>
  )
}

export const Interactive = {
  render: () => (
    <ToastProvider>
      <p style={{ marginBottom: 12, color: 'var(--ink-soft)', fontSize: 13 }}>
        Clique nos botões para disparar toasts (auto-dismiss em 4s, máx. 5 empilhados).
      </p>
      <ToastTriggers />
    </ToastProvider>
  ),
}
