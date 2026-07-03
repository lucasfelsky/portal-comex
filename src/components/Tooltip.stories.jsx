import Tooltip from './Tooltip'

export default {
  title: 'Components/Tooltip',
  component: Tooltip,
  argTypes: {
    side: { control: 'select', options: ['top', 'bottom', 'left', 'right'] },
  },
}

export const Top = {
  args: { label: 'Abrir menu', side: 'top' },
  render: (args) => (
    <div style={{ padding: 60 }}>
      <Tooltip {...args}>
        <button type="button" className="ghost-button">Passe o mouse aqui</button>
      </Tooltip>
    </div>
  ),
}

export const AllSides = {
  render: () => (
    <div style={{ display: 'flex', gap: 40, padding: 60 }}>
      {['top', 'bottom', 'left', 'right'].map((side) => (
        <Tooltip key={side} label={`Tooltip ${side}`} side={side}>
          <button type="button" className="ghost-button">{side}</button>
        </Tooltip>
      ))}
    </div>
  ),
}
