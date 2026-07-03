import StatCard from './StatCard'

export default {
  title: 'Components/StatCard',
  component: StatCard,
}

export const Basic = {
  args: {
    label: 'Processos ativos',
    value: '42',
  },
}

export const TrendUp = {
  args: {
    label: 'Processos ativos',
    value: '42',
    icon: 'dashboard',
    trend: { delta: 12, period: 'vs. semana passada' },
    sparkline: [10, 14, 12, 18, 22, 19, 25, 30],
  },
}

export const TrendDown = {
  args: {
    label: 'Custo médio por container',
    value: 'US$ 1.850',
    icon: 'dollar',
    trend: { delta: -8, period: 'vs. mês passado' },
    sparkline: [30, 28, 25, 26, 20, 18, 15, 14],
  },
}

export const Grid = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      <StatCard label="Processos ativos" value="42" icon="dashboard" trend={{ delta: 12, period: 'vs. semana passada' }} sparkline={[10, 14, 12, 18, 22, 19, 25, 30]} />
      <StatCard label="Chegadas na semana" value="7" icon="arrivals" />
      <StatCard label="Custo médio" value="US$ 1.850" icon="dollar" trend={{ delta: -8, period: 'vs. mês passado' }} sparkline={[30, 28, 25, 26, 20, 18, 15, 14]} />
    </div>
  ),
}
