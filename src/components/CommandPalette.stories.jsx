import { useState } from 'react'
import CommandPalette from './CommandPalette'

export default {
  title: 'Components/CommandPalette',
  component: CommandPalette,
}

const MOCK_COMMANDS = [
  { id: 'nav-dashboard', label: 'Dashboard', group: 'Navegação', icon: 'dashboard', to: '/' },
  { id: 'nav-news', label: 'Notícias', group: 'Navegação', icon: 'news', to: '/news' },
  { id: 'nav-admin', label: 'Central administrativo', group: 'Navegação', icon: 'admin', to: '/admin' },
  { id: 'action-new-process', label: 'Novo processo', group: 'Ações', icon: 'plus', action: () => {} },
]

function PaletteDemo(args) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        Abrir (Ctrl+K)
      </button>
      <CommandPalette {...args} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

export const StaticCommands = {
  render: (args) => <PaletteDemo {...args} />,
  args: { commands: MOCK_COMMANDS },
}

export const WithAsyncSearcher = {
  render: (args) => <PaletteDemo {...args} />,
  args: {
    commands: MOCK_COMMANDS,
    searcher: async (query) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return [
        { id: 'process-1', label: `Resultado para "${query}"`, description: 'PO-1234 · Itajaí', to: '/processos' },
      ]
    },
  },
}
