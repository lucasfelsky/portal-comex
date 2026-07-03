import Icon from './Icon'

const ICON_NAMES = [
  'dashboard', 'news', 'arrivals', 'admin', 'bell', 'check', 'external',
  'logout', 'edit', 'trash', 'plus', 'search', 'download', 'chevron',
  'chevron-left', 'chevron-right', 'dollar', 'trend', 'sparkle', 'inbox',
]

export default {
  title: 'Components/Icon',
  component: Icon,
  argTypes: {
    name: { control: 'select', options: ICON_NAMES },
    size: { control: { type: 'range', min: 12, max: 48, step: 2 } },
    strokeWidth: { control: { type: 'range', min: 1, max: 3, step: 0.25 } },
  },
}

export const Default = {
  args: { name: 'dashboard', size: 24 },
}

export const AllIcons = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
      {ICON_NAMES.map((name) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-soft)' }}>
          <Icon name={name} size={24} />
          <span>{name}</span>
        </div>
      ))}
    </div>
  ),
}
