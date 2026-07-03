import { useState } from 'react'
import FilterChip from './FilterChip'

export default {
  title: 'Components/FilterChip',
  component: FilterChip,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'info', 'success', 'warning', 'danger'],
    },
    size: { control: 'select', options: ['sm', 'md'] },
  },
}

export const Default = {
  args: { label: 'Categoria: FCL', variant: 'default' },
}

export const Removable = {
  render: (args) => {
    const [visible, setVisible] = useState(true)
    if (!visible) return <em style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Filtro removido.</em>
    return <FilterChip {...args} onRemove={() => setVisible(false)} />
  },
  args: { label: 'ETA: 01/01 a 15/01', variant: 'info' },
}

export const AllVariants = {
  render: () => (
    <div className="chip-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {['default', 'primary', 'info', 'success', 'warning', 'danger'].map((variant) => (
        <FilterChip key={variant} label={variant} variant={variant} onRemove={() => {}} />
      ))}
    </div>
  ),
}
