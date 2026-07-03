import EmptyState from './EmptyState'

export default {
  title: 'Components/EmptyState',
  component: EmptyState,
  argTypes: {
    illustration: {
      control: 'select',
      options: ['inbox', 'news', 'search', 'filter'],
    },
  },
}

export const Inbox = {
  args: {
    illustration: 'inbox',
    title: 'Nenhuma notificação',
    message: 'As novas dúvidas e respostas dos processos aparecerão aqui.',
  },
}

export const SearchNoResults = {
  args: {
    illustration: 'search',
    title: 'Nenhum resultado encontrado',
    message: 'Tente ajustar os filtros ou o termo de busca.',
  },
}

export const WithAction = {
  args: {
    illustration: 'filter',
    title: 'Nenhum processo com esse filtro',
    message: 'Remova alguns filtros para ver mais resultados.',
    action: <button type="button" className="ghost-button">Limpar filtros</button>,
  },
}
