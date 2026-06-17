const RESTRICTED_CATEGORIES = new Set(['FCL', 'LCL', 'AEREO'])

export function canShowProcessName(process, isAdmin) {
  return Boolean(isAdmin) || !RESTRICTED_CATEGORIES.has(process?.category)
}

export function getProcessTitle(process, isAdmin) {
  return canShowProcessName(process, isAdmin) ? process?.name : `PO: ${process?.processNumber || '-'}`
}

export function getProcessSubtitle(process, isAdmin) {
  if (!canShowProcessName(process, isAdmin)) return ''
  if (process?.category === 'CONSOLIDADO') return ''
  return process?.processNumber ? `PO: ${process.processNumber}` : ''
}