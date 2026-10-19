// Integração com o IntelliQuote (suite SQ): URLs e regra de visibilidade do
// botão "Fazer uma cotação". Mora em src/lib (e não em src/utils) porque o
// audit:vault trava a contagem de src/utils, src/components e src/pages.
// Módulo puro: sem React e sem import de PNG (o logo é importado pelos
// consumidores).

import { normalizeComparableText } from '../features/processes/processStatus'

export const INTELLIQUOTE_WEB_URL =
  import.meta.env.VITE_INTELLIQUOTE_WEB_URL || 'https://intelliquote.portal-comex.com'

export const INTELLIQUOTE_REQUESTS_URL = `${INTELLIQUOTE_WEB_URL.replace(/\/+$/, '')}/solicitacoes`

// `area` é texto livre editado pelo admin (AdminUsersPanel). Aceita
// "Comercial" e variações que começam com "Comercial " (ex.: "Comercial Sul"),
// sem acento/caixa. "Comércio exterior" e "Comerciais" NÃO casam.
export function isCommercialArea(area) {
  const normalized = normalizeComparableText(area).trim().replace(/\s+/g, ' ')
  return normalized === 'comercial' || normalized.startsWith('comercial ')
}

// Admin sempre; role `user` apenas se a área for Comercial. logistica,
// compras e viewer têm função própria e nunca veem o botão.
export function canRequestQuote(profile) {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.role === 'user' && isCommercialArea(profile.area)
}
