import Breadcrumb from './Breadcrumb'

export default {
  title: 'Components/Breadcrumb',
  component: Breadcrumb,
}

export const TwoLevels = {
  args: {
    items: [
      { label: 'Admin', to: '/admin' },
      { label: 'Usuários' },
    ],
  },
}

export const ThreeLevels = {
  args: {
    items: [
      { label: 'Processos', to: '/processos' },
      { label: 'PO-1234', to: '/processos/1234' },
      { label: 'Itens' },
    ],
  },
}

export const Empty = {
  args: { items: [] },
}
