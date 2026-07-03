import { useState } from 'react'
import TabButton from './TabButton'

export default {
  title: 'Components/TabButton',
  component: TabButton,
}

export const Active = {
  args: { active: true, children: 'Geral' },
}

export const Inactive = {
  args: { active: false, children: 'Itens' },
}

export const Disabled = {
  args: { active: false, disabled: true, children: 'Indisponível' },
}

export const TabGroup = {
  render: () => {
    const [active, setActive] = useState('geral')
    const tabs = [
      { id: 'geral', label: 'Geral' },
      { id: 'itens', label: 'Itens' },
      { id: 'auditoria', label: 'Auditoria' },
    ]
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        {tabs.map((tab) => (
          <TabButton key={tab.id} active={active === tab.id} onClick={() => setActive(tab.id)}>
            {tab.label}
          </TabButton>
        ))}
      </div>
    )
  },
}
