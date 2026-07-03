import NotificationsList from './NotificationsList'

export default {
  title: 'Components/NotificationsList',
  component: NotificationsList,
}

const formatRelative = () => 'há 2h'
const formatDate = () => '03/07/2026 10:00'

function buildGroup(overrides) {
  return {
    processId: 'proc-1',
    type: 'message',
    title: 'PO-1234 · Itajaí',
    unreadCount: 1,
    latestCreatedAt: '2026-07-03T10:00:00.000Z',
    items: [
      { id: 'n1', title: 'Nova mensagem', body: 'O admin respondeu sua dúvida.', createdAt: '2026-07-03T10:00:00.000Z' },
    ],
    ...overrides,
  }
}

export const WithNotifications = {
  args: {
    grouped: [
      buildGroup({}),
      buildGroup({
        processId: 'proc-2',
        title: 'PO-5678 · Santos',
        unreadCount: 0,
        items: [{ id: 'n2', title: 'Processo atualizado', body: 'Status alterado para Embarcou.', createdAt: '2026-07-02T09:00:00.000Z' }],
      }),
    ],
    onOpenNotification: () => {},
    formatRelative,
    formatDate,
  },
}

export const Empty = {
  args: {
    grouped: [],
    onOpenNotification: () => {},
    formatRelative,
    formatDate,
  },
}
