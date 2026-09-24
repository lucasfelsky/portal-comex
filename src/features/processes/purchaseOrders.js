// F17.2c (D-1): funcoes puras de `purchaseOrders[]` (POs do CONSOLIDADO) -
// sem React, sem firebase, ZERO imports (mesma regra de `containers.js`:
// `tests/ui/ProcessesPage.test.jsx` mocka modulos com lista fechada de
// exports - modulo novo sem imports e' seguro).

export const MAX_PURCHASE_ORDERS = 50
export const MIN_CONSOLIDATED_PURCHASE_ORDERS = 2

/**
 * Normaliza uma lista bruta de POs: trim, descarta vazios, dedup
 * case-insensitive (mantem a 1a ocorrencia e a grafia dela), teto de 50.
 */
export function normalizePurchaseOrders(raw) {
  if (!Array.isArray(raw)) return []

  const seen = new Set()
  const result = []

  for (const value of raw) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }

  return result.slice(0, MAX_PURCHASE_ORDERS)
}

/**
 * `purchaseOrders[]` so' existe no CONSOLIDADO. Array presente e' AUTORITATIVO
 * (mesmo vazio); senao compat de leitura do `processNumber`/`code` cru
 * (docs legados que ainda tem o valor antigo).
 */
export function getProcessPurchaseOrders(process) {
  if (process?.category !== 'CONSOLIDADO') return []

  if (Array.isArray(process?.purchaseOrders)) {
    return normalizePurchaseOrders(process.purchaseOrders)
  }

  const legacyValue = String(process?.processNumber ?? process?.code ?? '').trim()
  return legacyValue ? [legacyValue] : []
}

export function formatPurchaseOrdersSummary(list) {
  const normalized = normalizePurchaseOrders(list)

  if (normalized.length === 0) return ''
  if (normalized.length === 1) return `PO: ${normalized[0]}`

  const shown = normalized.slice(0, 2).join(', ')
  const extra = normalized.length - 2
  return extra > 0 ? `POs: ${shown} (+${extra})` : `POs: ${shown}`
}

/**
 * So' mantem o valor se ele bater exatamente com alguma PO da lista (o
 * select grava o valor exato) - senao devolve ''.
 */
export function normalizeItemPoNumber(value, purchaseOrders) {
  const trimmed = String(value ?? '').trim()
  const list = Array.isArray(purchaseOrders) ? purchaseOrders : []
  return list.includes(trimmed) ? trimmed : ''
}

/**
 * Remove o vinculo dos itens que apontam para uma PO fora da lista atual
 * (`poNumber: ''`). Itens sem `poNumber` ficam intactos.
 */
export function clearRemovedPurchaseOrderLinks(items, purchaseOrders) {
  const list = Array.isArray(purchaseOrders) ? purchaseOrders : []
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item.poNumber !== 'string' || !item.poNumber) return item
    return list.includes(item.poNumber) ? item : { ...item, poNumber: '' }
  })
}
