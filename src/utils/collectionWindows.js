// Helpers para janelas de coleta multi-container.
// Mantem compatibilidade com docs antigos que ainda usam `collectionScheduledAt`
// (string unica) atraves de uma migration lazy no `normalizeCollectionWindows`.

export function normalizeIsoDateTime(value) {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) return ''
  const date = new Date(normalizedValue)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function generateWindowId() {
  return `WIN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeCollectionWindow(rawWindow, fallbackIndex = 0) {
  if (!rawWindow || typeof rawWindow !== 'object') return null

  const scheduledAt = normalizeIsoDateTime(rawWindow.scheduledAt)
  if (!scheduledAt) return null

  const rawContainerNumber = Number(rawWindow.containerNumber)
  const containerNumber = Number.isFinite(rawContainerNumber) && rawContainerNumber > 0
    ? Math.floor(rawContainerNumber)
    : fallbackIndex + 1

  const id =
    typeof rawWindow.id === 'string' && rawWindow.id.trim()
      ? rawWindow.id.trim()
      : generateWindowId()

  return {
    id,
    containerNumber,
    scheduledAt,
    notes: typeof rawWindow.notes === 'string' ? rawWindow.notes.trim() : '',
  }
}

export function normalizeCollectionWindows(rawWindows, { legacyScheduledAt = '', containerQuantity = 0 } = {}) {
  if (Array.isArray(rawWindows)) {
    const normalized = rawWindows
      .map((window, index) => normalizeCollectionWindow(window, index))
      .filter(Boolean)

    if (normalized.length > 0) {
      return normalized.sort(
        (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      )
    }
  }

  const legacyValue = normalizeIsoDateTime(legacyScheduledAt)
  if (legacyValue) {
    return [
      normalizeCollectionWindow(
        { containerNumber: Math.max(1, Number(containerQuantity) || 1), scheduledAt: legacyValue },
        0
      ),
    ].filter(Boolean)
  }

  return []
}

export function getCollectionWindows(process) {
  if (!process) return []
  return normalizeCollectionWindows(process.collectionWindows, {
    legacyScheduledAt: process.collectionScheduledAt ?? '',
    containerQuantity: process.containerQuantity ?? 0,
  })
}

export function getNextCollectionWindow(process, now = new Date()) {
  const windows = getCollectionWindows(process)
  if (windows.length === 0) return null

  const futureWindows = windows.filter((window) => new Date(window.scheduledAt).getTime() >= now.getTime())
  if (futureWindows.length > 0) return futureWindows[0]

  return windows[windows.length - 1]
}

export function hasActiveCollectionSchedule(process) {
  return getCollectionWindows(process).length > 0
}

export function createCollectionWindow({ containerNumber, scheduledAt, notes } = {}) {
  return normalizeCollectionWindow(
    {
      id: generateWindowId(),
      containerNumber,
      scheduledAt,
      notes,
    },
    0
  )
}

export function addCollectionWindow(windows, partial = {}) {
  const nextWindows = Array.isArray(windows) ? [...windows] : []
  const index = nextWindows.length
  const window = createCollectionWindow({
    containerNumber: partial.containerNumber ?? index + 1,
    scheduledAt: partial.scheduledAt ?? '',
    notes: partial.notes ?? '',
  })

  if (!window) return nextWindows

  nextWindows.push(window)
  return nextWindows.sort(
    (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
  )
}

export function removeCollectionWindow(windows, windowId) {
  return (Array.isArray(windows) ? windows : []).filter((window) => window.id !== windowId)
}

export function updateCollectionWindow(windows, windowId, patch) {
  return (Array.isArray(windows) ? windows : []).map((window) =>
    window.id === windowId ? normalizeCollectionWindow({ ...window, ...patch }, 0) ?? window : window
  )
}

export function serializeCollectionWindowsForFirestore(windows) {
  return normalizeCollectionWindows(windows).map((window) => ({
    id: window.id,
    containerNumber: window.containerNumber,
    scheduledAt: window.scheduledAt,
    notes: window.notes,
  }))
}