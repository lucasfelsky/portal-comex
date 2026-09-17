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
  if (process?.category === 'CONSOLIDADO') return ''
  return process?.processNumber ? `PO: ${process.processNumber}` : ''
}