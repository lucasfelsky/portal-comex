import Stagger from './Stagger'

export default {
  title: 'Components/Stagger',
  component: Stagger,
}

export const Cards = {
  render: () => (
    <Stagger stepMs={80}>
      {['Processo A', 'Processo B', 'Processo C', 'Processo D'].map((label) => (
        <div key={label} className="card" style={{ padding: 12, marginBottom: 8 }}>
          {label}
        </div>
      ))}
    </Stagger>
  ),
}
