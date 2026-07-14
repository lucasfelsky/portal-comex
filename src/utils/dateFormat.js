// F10 (backlog 2026-07-12): util compartilhado de formatação de data/hora.
// Extraído do ProcessesPage durante a decomposição do "god component" — o
// mesmo formatador era usado pela pagina e pelo painel de mensagens, entao
// virou util pra nao duplicar.
export function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
