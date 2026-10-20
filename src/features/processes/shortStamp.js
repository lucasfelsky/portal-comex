// Refino F4c: carimbo curto "dd/mm HH:MM" das conversas e do historico do detalhe
// (Processo.dc.html). Horario local (nunca toISOString: em BRT viraria o dia
// anterior); o ano so aparece quando difere do atual. Valor invalido -> ''.
export function formatShortStamp(value, now = new Date()) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
  const year = date.getFullYear() === now.getFullYear() ? '' : `/${date.getFullYear()}`
  return `${day}${year} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
