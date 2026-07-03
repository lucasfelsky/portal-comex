import Spinner from './Spinner'

export default {
  title: 'Components/Spinner',
  component: Spinner,
  argTypes: {
    size: { control: 'select', options: [12, 14, 16, 20, 24] },
  },
}

export const Default = {
  args: { size: 16 },
}

export const WithLabel = {
  args: { size: 16, label: 'Salvando...' },
}

export const AllSizes = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      {[12, 14, 16, 20, 24].map((size) => (
        <Spinner key={size} size={size} />
      ))}
    </div>
  ),
}
