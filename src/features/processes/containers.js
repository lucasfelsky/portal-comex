// F17.2a (D-2, D-4, D-7): funcoes puras de containers[] - sem React, sem
// firebase. Reusadas pelo repositorio (normalizacao/expansao lazy), pelo
// editor (`ContainersEditor.jsx`) e pela leitura (`ProcessOperationalDetails.jsx`).
//
// Regra de import (D-11): este modulo NAO importa de `processStatus.js`,
// `deriveProcessStatus.js`, `pendingFields.js`, `processCategories.js` nem
// `utils/collectionWindows` - `tests/ui/ProcessesPage.test.jsx` mocka esses
// modulos com uma lista fechada de exports.

export const MAX_CONTAINERS = 40

export const CONTAINER_TYPE_OPTIONS = [
  { value: '20DC', label: "20' Dry" },
  { value: '40DC', label: "40' Dry" },
  { value: '40HC', label: "40' High Cube" },
  { value: '20RF', label: "20' Reefer" },
  { value: '40RF', label: "40' Reefer" },
  { value: 'ISOTANK', label: 'ISO tank' },
  { value: '20OT', label: "20' Open Top" },
  { value: '40OT', label: "40' Open Top" },
  { value: '20FR', label: "20' Flat Rack" },
  { value: '40FR', label: "40' Flat Rack" },
]

const CONTAINER_TYPE_VALUES = new Set(CONTAINER_TYPE_OPTIONS.map((option) => option.value))

// D-2: badges especiais (Reefer/ISO tank), ordem fixa.
export const SPECIAL_CONTAINER_TYPES = [
  { types: ['20RF', '40RF'], label: 'Reefer' },
  { types: ['ISOTANK'], label: 'ISO tank' },
]

function isFclOrConsolidado(category) {
  return category === 'FCL' || category === 'CONSOLIDADO'
}

export function normalizeContainerNumber(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

// D-7: valores das letras (A=10, sequencia pulando multiplos de 11).
const LETTER_VALUES = (() => {
  const values = {}
  let value = 10
  for (let code = 65; code <= 90; code += 1) {
    while (value % 11 === 0) value += 1
    values[String.fromCharCode(code)] = value
    value += 1
  }
  return values
})()

const ISO_6346_FORMAT = /^[A-Z]{3}[UJZ]\d{7}$/

/**
 * D-7: valida o numero ISO 6346. Nunca bloqueia - so' orienta (aviso inline).
 * Retorna { status: 'empty' | 'valid' | 'format' | 'checkDigit', expectedCheckDigit }.
 */
export function validateContainerNumber(rawValue) {
  const normalized = normalizeContainerNumber(rawValue)

  if (!normalized) return { status: 'empty', expectedCheckDigit: null }

  if (!ISO_6346_FORMAT.test(normalized)) {
    return { status: 'format', expectedCheckDigit: null }
  }

  const digits = normalized.slice(0, 10)
  let sum = 0
  for (let i = 0; i < 10; i += 1) {
    const char = digits[i]
    const charValue = i < 4 ? LETTER_VALUES[char] : Number(char)
    sum += charValue * 2 ** i
  }
  const remainder = sum % 11
  const expectedCheckDigit = remainder === 10 ? 0 : remainder
  const actualCheckDigit = Number(normalized[10])

  if (expectedCheckDigit !== actualCheckDigit) {
    return { status: 'checkDigit', expectedCheckDigit }
  }

  return { status: 'valid', expectedCheckDigit }
}

export function getContainerNumberWarning(rawValue) {
  const { status, expectedCheckDigit } = validateContainerNumber(rawValue)

  if (status === 'format') {
    return 'Formato fora do padrão ISO 6346 (4 letras + 7 dígitos).'
  }
  if (status === 'checkDigit') {
    return `Dígito verificador não confere (esperado: ${expectedCheckDigit}).`
  }
  return ''
}

export function createEmptyContainer(id) {
  return { id, number: '', seal: '', type: '', returnedAt: '' }
}

function normalizeContainerType(value) {
  return CONTAINER_TYPE_VALUES.has(value) ? value : ''
}

function normalizeContainerEntry(rawContainer, index) {
  const id =
    typeof rawContainer?.id === 'string' && rawContainer.id.trim()
      ? rawContainer.id.trim()
      : `CNT-${index + 1}`

  return {
    id,
    number: normalizeContainerNumber(rawContainer?.number),
    seal: String(rawContainer?.seal ?? '').trim(),
    type: normalizeContainerType(rawContainer?.type),
    // D-1: `returnedAt` so' e' PRESERVADO neste PR (editor do F17.4).
    returnedAt: String(rawContainer?.returnedAt ?? '').trim(),
  }
}

function getMaxCollectionWindowContainerNumber(collectionWindows) {
  if (!Array.isArray(collectionWindows)) return 0
  return collectionWindows.reduce((max, window) => {
    const value = Number(window?.containerNumber)
    return Number.isFinite(value) && value > max ? value : max
  }, 0)
}

/**
 * D-4: normaliza `containers[]` (so FCL/CONSOLIDADO; demais categorias -> []),
 * com teto de 40 itens. Expansao lazy: array vazio/ausente -> gera
 * `N = max(containerQuantity, maior collectionWindows[].containerNumber)`
 * itens vazios com ids deterministicos `CNT-1..CNT-N` (nada de Date.now()/
 * random na leitura).
 */
export function normalizeContainers(
  rawContainers,
  { category, containerQuantity = 0, collectionWindows = [] } = {}
) {
  if (!isFclOrConsolidado(category)) return []

  const arrayContainers = Array.isArray(rawContainers) ? rawContainers : []

  if (arrayContainers.length > 0) {
    return arrayContainers
      .slice(0, MAX_CONTAINERS)
      .map((container, index) => normalizeContainerEntry(container, index))
  }

  const expectedCount = Math.max(
    Number(containerQuantity) || 0,
    getMaxCollectionWindowContainerNumber(collectionWindows)
  )

  if (expectedCount <= 0) return []

  const count = Math.min(expectedCount, MAX_CONTAINERS)
  return Array.from({ length: count }, (_, index) => createEmptyContainer(`CNT-${index + 1}`))
}

// F17.2c (D-6): rotulo de opcao do select "Contêiner" (`CollectionWindowsEditor`).
export function getContainerOptionLabel(container, index) {
  return container?.number || `Contêiner ${index + 1}`
}

/**
 * F17.2c (D-6): liga `collectionWindows[].containerId` a `containers[]`
 * (FCL/CONSOLIDADO). Categoria fora de FCL/CONSOLIDADO -> `containerId: ''`
 * em toda janela. Em FCL/CONSOLIDADO: `containerId` existente e achado ->
 * sincroniza `containerNumber` (indice + 1); `containerId` existente e NAO
 * achado -> janela orfa preservada intacta; `containerId` vazio -> backfill
 * pelo `containerNumber` legado (se existir container correspondente).
 */
export function linkCollectionWindowsToContainers(windows, containers, category) {
  const list = Array.isArray(windows) ? windows : []
  const containerList = Array.isArray(containers) ? containers : []

  if (!isFclOrConsolidado(category)) {
    return list.map((window) => ({ ...window, containerId: '' }))
  }

  return list.map((window) => {
    const containerId = typeof window?.containerId === 'string' ? window.containerId : ''

    if (containerId) {
      const index = containerList.findIndex((container) => container.id === containerId)
      if (index === -1) return window
      return { ...window, containerNumber: index + 1 }
    }

    const legacyIndex = Number(window?.containerNumber) - 1
    const legacyContainer = containerList[legacyIndex]
    if (legacyContainer) {
      return { ...window, containerId: legacyContainer.id }
    }

    return window
  })
}

export function isOrphanCollectionWindow(window, containers) {
  const containerList = Array.isArray(containers) ? containers : []
  return Boolean(window?.containerId) && !containerList.some((c) => c.id === window.containerId)
}

/**
 * F17.2c (D-6): rotulo de exibicao (leitura) de uma janela de coleta.
 * FCL/CONSOLIDADO: container achado -> numero/rotulo do container; orfa ->
 * "Contêiner removido"; sem `containerId` -> "Contêiner N" (legado). Demais
 * categorias -> "Janela de coleta".
 */
export function getCollectionWindowLabel(window, { category, containers } = {}) {
  if (!isFclOrConsolidado(category)) return 'Janela de coleta'

  const containerList = Array.isArray(containers) ? containers : []

  if (window?.containerId) {
    const index = containerList.findIndex((container) => container.id === window.containerId)
    if (index === -1) return 'Contêiner removido'
    return getContainerOptionLabel(containerList[index], index)
  }

  return `Contêiner ${window?.containerNumber}`
}

// D-2/D-7: badges especiais distintos, ordem fixa (Reefer, ISO tank).
export function getContainerSpecialBadges(containers) {
  const types = new Set((Array.isArray(containers) ? containers : []).map((container) => container?.type))

  return SPECIAL_CONTAINER_TYPES.filter((special) =>
    special.types.some((type) => types.has(type))
  ).map((special) => special.label)
}
