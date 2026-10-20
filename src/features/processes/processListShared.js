// Helpers compartilhados pelas duas arvores da lista de Chegadas:
// a legada (ProcessListView.jsx, tablet/mobile) e a desktop
// (ProcessListDesktop.jsx, >= 1041px, Chegadas.dc.html). Ficam aqui para a
// ordem de severidade dos alertas e as regras de data nao divergirem.
import { getEstimatedDeliveryDate } from '../../utils/deliveryForecast'
import { getPendingFields } from './pendingFields'
import { getContainerSpecialBadges } from './containers'
import { hasRejectedLicense } from './licenses'
import { hasDangerousGoods, hasFlammableGoods } from './operationalOptions'

export const getDestinationLabel = (category) =>
  category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'

export const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

// Previsão de entrega = data manual (override) OU cálculo automático
// (ETA + dias úteis por categoria / coleta / rolling customs) via
// getEstimatedDeliveryDate — não repetir só o ETA (regressão do F10.6).
export const getEstimatedDeliveryKey = (process) => getEstimatedDeliveryDate(process)

export const getEstimatedDeliveryLabel = (process) => formatDate(getEstimatedDeliveryKey(process))

export const hasUpdatedEta = (process) =>
  Boolean(process?.eta && process?.etaOriginal && process.etaOriginal !== process.eta)

// UX-6a (item 1, D7): ordem de severidade — Anuência indeferida > Carga
// inflamável > Carga perigosa (só se NÃO inflamável) > Dados pendentes >
// Carga perigosa (redundante, quando também é inflamável) > especiais de
// conteiner. D-E: pendências só aparecem pro admin (compras/preenche tudo).
export function buildProcessAlerts(item, isAdmin) {
  const pendingFields = isAdmin ? getPendingFields(item) : []
  const isFlammable = hasFlammableGoods(item)
  const isDangerous = hasDangerousGoods(item)
  return [
    hasRejectedLicense(item) && { label: 'Anuência indeferida', tone: 'danger' },
    isFlammable && { label: 'Carga inflamável', tone: 'danger' },
    isDangerous && !isFlammable && { label: 'Carga perigosa', tone: 'warn' },
    pendingFields.length > 0 && { label: `Dados pendentes (${pendingFields.length})`, tone: 'warn' },
    isDangerous && isFlammable && { label: 'Carga perigosa', tone: 'warn' },
    ...getContainerSpecialBadges(item.containers).map((badge) => ({ label: badge, tone: 'warn' })),
  ].filter(Boolean)
}
