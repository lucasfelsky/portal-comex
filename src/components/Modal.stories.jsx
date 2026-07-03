import { useState } from 'react'
import Modal from './Modal'

export default {
  title: 'Components/Modal',
  component: Modal,
}

function ModalDemo(args) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        Abrir modal
      </button>
      <Modal {...args} open={open} onClose={() => setOpen(false)}>
        {args.children}
      </Modal>
    </div>
  )
}

export const Default = {
  render: (args) => <ModalDemo {...args} />,
  args: {
    title: 'Título do modal',
    children: <p>Conteúdo do modal.</p>,
  },
}

export const Wide = {
  render: (args) => <ModalDemo {...args} />,
  args: {
    title: 'Modal largo',
    wide: true,
    children: <p>Usado quando o conteúdo precisa de mais espaço horizontal (ex.: formulários com grid).</p>,
  },
}

export const NoTitle = {
  render: (args) => <ModalDemo {...args} />,
  args: {
    ariaLabel: 'Modal sem título',
    children: <p>Modal sem título visível, mas com aria-label para leitores de tela.</p>,
  },
}
