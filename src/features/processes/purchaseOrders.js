// F17.2c/F17.2d-2 (D-1): funcoes puras de `purchaseOrders[]` (POs do
// CONSOLIDADO) - sem React, sem firebase, ZERO imports (mesma regra de
// `containers.js`: `tests/ui/ProcessesPage.test.jsx` mocka modulos com
// lista fechada de exports - modulo novo sem imports e' seguro).
//
// F17.2d-2 (D-1/Q6): cada PO agora e' um objeto `{ po, reference,
// supplierName }`. Compat de leitura aceita strings legadas (F17.2c) -
// convertidas em objeto com `reference`/`supplierName` vazios.

export const MAX_PURCHASE_ORDERS = 50
export const MIN_CONSOLIDATED_PURCHASE_ORDERS = 2

/**
 * Normaliza uma lista bruta de POs para objetos `{ po, reference,
 * supplierName }`: aceita string (compat legado) OU objeto; `po` sempre
 * trim; `reference`/`supplierName` = `String(v ?? '')`, com `.trim()` so'
 * quando `trimText` (default true - `trimText: false` e' so' para o draft,
 * senao' o espaco digitado entre palavras some a cada tecla). Descarta `po`
 * vazio, dedup case-insensitive por `po` (1a ocorrencia vence), teto de 50.
 */
export function normalizePurchaseOrders(raw, { trimText = true } = {}) {
  if (!Array.isArray(raw)) return []

  const seen = new Set()
  const result = []

  for (const value of raw) {
    const isObject = value && typeof value === 'object'
    const po = String(isObject ? value.po : value ?? '').trim()
    if (!po) continue
    const key = po.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const rawReference = isObject ? value.reference : ''
    const rawSupplierName = isObject ? value.supplierName : ''
    const reference = String(rawReference ?? '')
    const supplierName = String(rawSupplierName ?? '')

    result.push({
      po,
      reference: trimText ? reference.trim() : reference,
      supplierName: trimText ? supplierName.trim() : supplierName,
    })
  }

  return result.slice(0, MAX_PURCHASE_ORDERS)
}

/**
 * Extrai so' os numeros `po` de uma lista (aceita string ou objeto), trim,
 * descarta vazios. Usada onde so' o numero importa (select do item,
 * dedup no editor).
 */
export function getPurchaseOrderNumbers(list) {
  return (Array.isArray(list) ? list : [])
    .map((value) => {
      const isObject = value && typeof value === 'object'
      return String(isObject ? value.po : value ?? '').trim()
    })
    .filter(Boolean)
}

/**
 * `purchaseOrders[]` so' existe no CONSOLIDADO. Array presente e' AUTORITATIVO
 * (mesmo vazio); senao compat de leitura do `processNumber`/`code` cru
 * (docs legados que ainda tem o valor antigo).
 *
 * F17.2d-2 (D-3, Q1): pre-preenchimento do fornecedor legado - se a lista de
 * entrada veio de strings (algum elemento `typeof === 'string'`, OU o
 * fallback `processNumber`/`code`), E nenhuma PO resultante tem
 * `supplierName`, E `process.supplierName` (trim) nao-vazio, cada PO recebe
 * esse `supplierName`. Lista ja' em objetos nunca e' tocada (idempotente).
 */
export function getProcessPurchaseOrders(process) {
  if (process?.category !== 'CONSOLIDADO') return []

  const legacySupplierName = String(process?.supplierName ?? '').trim()

  if (Array.isArray(process?.purchaseOrders)) {
    const normalized = normalizePurchaseOrders(process.purchaseOrders)
    const cameFromStrings = process.purchaseOrders.some((value) => typeof value === 'string')
    const hasSupplierAlready = normalized.some((order) => order.supplierName)

    if (cameFromStrings && !hasSupplierAlready && legacySupplierName) {
      return normalized.map((order) => ({ ...order, supplierName: legacySupplierName }))
    }

    return normalized
  }

  const legacyValue = String(process?.processNumber ?? process?.code ?? '').trim()
  if (!legacyValue) return []

  return normalizePurchaseOrders([
    { po: legacyValue, reference: '', supplierName: legacySupplierName },
  ])
}

export function formatPurchaseOrdersSummary(list) {
  const numbers = getPurchaseOrderNumbers(list)

  if (numbers.length === 0) return ''
  if (numbers.length === 1) return `PO: ${numbers[0]}`

  const shown = numbers.slice(0, 2).join(', ')
  const extra = numbers.length - 2
  return extra > 0 ? `POs: ${shown} (+${extra})` : `POs: ${shown}`
}

/**
 * So' mantem o valor se ele bater exatamente com o `po` de alguma PO da
 * lista (o select grava o valor exato) - senao devolve ''.
 */
export function normalizeItemPoNumber(value, purchaseOrders) {
  const trimmed = String(value ?? '').trim()
  const numbers = getPurchaseOrderNumbers(purchaseOrders)
  return numbers.includes(trimmed) ? trimmed : ''
}

/**
 * Remove o vinculo dos itens que apontam para uma PO fora da lista atual
 * (`poNumber: ''`). Itens sem `poNumber` ficam intactos.
 */
export function clearRemovedPurchaseOrderLinks(items, purchaseOrders) {
  const numbers = getPurchaseOrderNumbers(purchaseOrders)
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item.poNumber !== 'string' || !item.poNumber) return item
    return numbers.includes(item.poNumber) ? item : { ...item, poNumber: '' }
  })
}

// F17.2d-2 (D-1, Q6): ponto unico da mascara - flag de ROLE (`canSeeName`),
// NUNCA `canShowProcessName` (que libera CONSOLIDADO para todos).
export function canSeePurchaseOrderDetails(canSeeName) {
  return Boolean(canSeeName)
}

/**
 * Linha textual de exibicao de uma PO: `po` sozinho; com `canSeeDetails`,
 * acrescenta " · Ref.: <reference>" e " · Fornecedor: <supplierName>"
 * (so' quando presentes).
 */
export function formatPurchaseOrderLine(order, canSeeDetails) {
  const po = typeof order === 'string' ? order.trim() : String(order?.po ?? '').trim()
  if (!canSeeDetails || typeof order !== 'object' || !order) return po

  const parts = [po]
  const reference = String(order.reference ?? '').trim()
  const supplierName = String(order.supplierName ?? '').trim()
  if (reference) parts.push(`Ref.: ${reference}`)
  if (supplierName) parts.push(`Fornecedor: ${supplierName}`)
  return parts.join(' · ')
}

/**
 * Termos pesquisaveis de uma lista de POs: `po` sempre; `reference`/
 * `supplierName` so' com `canSeeDetails`.
 */
export function getPurchaseOrderSearchTerms(list, canSeeDetails) {
  const normalized = Array.isArray(list) ? list : []
  const terms = []

  for (const value of normalized) {
    const isObject = value && typeof value === 'object'
    const po = String(isObject ? value.po : value ?? '').trim()
    if (po) terms.push(po)

    if (canSeeDetails && isObject) {
      const reference = String(value.reference ?? '').trim()
      const supplierName = String(value.supplierName ?? '').trim()
      if (reference) terms.push(reference)
      if (supplierName) terms.push(supplierName)
    }
  }

  return terms
}
