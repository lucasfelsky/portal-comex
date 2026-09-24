import { formatPurchaseOrdersSummary, getProcessPurchaseOrders } from './purchaseOrders'

const RESTRICTED_CATEGORIES = new Set(['FCL', 'LCL', 'AEREO'])

export function canSeeProcessName(role) {
  return role === 'admin' || role === 'logistica'
}

export function canShowProcessName(process, canSeeName) {
  return Boolean(canSeeName) || !RESTRICTED_CATEGORIES.has(process?.category)
}

export function getProcessTitle(process, canSeeName) {
  return canShowProcessName(process, canSeeName) ? process?.name : `PO: ${process?.processNumber || '-'}`
}

export function getProcessSubtitle(process, canSeeName) {
  if (!canShowProcessName(process, canSeeName)) return ''
  // F17.2c (D-10): CONSOLIDADO mostra o resumo de `purchaseOrders[]` no
  // lugar do "PO: <n>" (`processNumber` sempre '' nesta categoria).
  if (process?.category === 'CONSOLIDADO') {
    return formatPurchaseOrdersSummary(getProcessPurchaseOrders(process))
  }
  return process?.processNumber ? `PO: ${process.processNumber}` : ''
}