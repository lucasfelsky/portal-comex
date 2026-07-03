import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

export default {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
}

function ConfirmDialogDemo(args) {
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <button type="button" className="danger-button" onClick={() => setOpen(true)}>
        Apagar item
      </button>
      <ConfirmDialog
        {...args}
        open={open}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setBusy(true)
          setTimeout(() => {
            setBusy(false)
            setOpen(false)
          }, 1200)
        }}
      />
    </div>
  )
}

export const Danger = {
  render: (args) => <ConfirmDialogDemo {...args} />,
  args: {
    title: 'Apagar fornecedor',
    message: 'Apagar Fornecedor Exemplo Ltda? Esta ação não pode ser desfeita.',
    confirmLabel: 'Apagar',
    tone: 'danger',
  },
}

export const Primary = {
  render: (args) => <ConfirmDialogDemo {...args} />,
  args: {
    title: 'Restaurar regras padrão',
    message: 'Esta ação restaura todas as regras de previsão para o padrão do sistema e será registrada na auditoria.',
    confirmLabel: 'Restaurar',
    tone: 'primary',
  },
}
