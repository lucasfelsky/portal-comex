// UX-3b (D1/D3): validacao pura do rascunho de processo - roda ANTES de
// salvar (sobre o rascunho ja SANEADO por `sanitizeDraft`, que zera campos
// que o form esconde). Sem React, sem firebase.
//
// Regra de import (D1, mesma logica de `containers.js`/`licenses.js`):
// SO' `./operationalOptions`, `./containers`, `./licenses`,
// `./purchaseOrders`, `./arrivalCustoms` - nenhum importa nada, nenhum e'
// mockado em `tests/ui/ProcessesPage.test.jsx`. Categoria e' comparada por
// string literal (NAO importar `processCategories.js`, que o teste mocka).

import { INCOTERM_OPTIONS } from './operationalOptions'
import { MAX_CONTAINERS } from './containers'
import { MAX_LICENSES } from './licenses'
import { MAX_PURCHASE_ORDERS } from './purchaseOrders'
import { FREE_TIME_CATEGORIES } from './arrivalCustoms'

// Mesma ordem visual dos passos do wizard (`ProcessForm.jsx:564-571`).
const STEP_ORDER = ['ident', 'dates', 'status', 'transit', 'flow', 'items']

const STATIC_FIELD_STEPS = {
  purchaseOrders: 'ident',
  incoterm: 'ident',
  etd: 'dates',
  eta: 'dates',
  warehouseDeliveryDateOverride: 'dates',
  containers: 'status',
  licenses: 'status',
  volumeM3: 'status',
  grossWeightKg: 'status',
  chargeableWeightKg: 'status',
  packagesQuantity: 'status',
  transshipmentEtd: 'transit',
  berthedAt: 'flow',
  arrivedAt: 'flow',
  dtaLoadingScheduledAt: 'flow',
  dtaArrivalAtItajai: 'flow',
  cargoPresenceInformedAt: 'flow',
  duimpRegisteredAt: 'flow',
  parameterizedAt: 'flow',
  customsInspectionScheduledAt: 'flow',
  clearanceCompletedAt: 'flow',
  freeTimeDays: 'flow',
  demurrageDailyRateUsd: 'flow',
}

const DATE_ERROR_MESSAGE = 'Data inválida: informe um ano entre 2000 e 2100.'
const DECIMAL_ERROR_MESSAGE = 'Informe um número maior ou igual a zero.'
const INTEGER_ERROR_MESSAGE = 'Informe um número inteiro maior ou igual a zero.'

// D1: passo visual de um campo/chave. Chaves de item de lista
// (`containers.<id>.<field>`, `licenses.<id>.<field>`, `items.<id>.<field>`,
// `collectionWindows.<id>.<field>`) sao reconhecidas por prefixo.
export function getProcessFieldStep(key) {
  const stringKey = String(key ?? '')

  if (stringKey.startsWith('items.')) return 'items'
  if (stringKey.startsWith('collectionWindows.')) return 'flow'
  if (stringKey.startsWith('containers.')) return 'flow'
  if (stringKey.startsWith('licenses.')) return 'status'

  return STATIC_FIELD_STEPS[stringKey] ?? 'ident'
}

// D1: id de DOM estavel a partir da chave logica do campo.
export function getProcessFieldDomId(key) {
  return `process-field-${String(key ?? '').replace(/[^A-Za-z0-9_-]/g, '-')}`
}

// AD-1: canonicaliza o incoterm (trim + maiusculas) ANTES de validar/gravar -
// incoterm legado em caixa baixa/com espaco ('fob', ' Fob ') nao pode travar
// o save; so' bloqueia se, depois de canonicalizado, continuar fora da
// lista de Incoterms 2020 (`INCOTERM_OPTIONS`).
export function canonicalizeIncoterm(value) {
  return String(value ?? '').trim().toUpperCase()
}

// D3: vazio/null/undefined sempre valido. Ano lido do PREFIXO da string
// (`AAAA-MM-DD...`) - nunca `new Date`/`toISOString` (BRT vira dia
// anterior em UTC).
function isValidProcessDate(value) {
  const stringValue = String(value ?? '').trim()
  if (!stringValue) return true

  const match = stringValue.match(/^(\d{4})-\d{2}-\d{2}/)
  if (!match) return false

  const year = Number(match[1])
  return year >= 2000 && year <= 2100
}

// D3: aceita virgula decimal (mesma regra de `normalizeDecimal`); vazio
// valido; negativo/nao-numerico invalido.
function isValidNonNegativeDecimal(value) {
  const stringValue = String(value ?? '').trim()
  if (!stringValue) return true

  const normalized = stringValue.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0
}

// D3: inteiro - so' digitos (sem sinal, sem separador decimal); vazio valido.
function isValidNonNegativeInteger(value) {
  const stringValue = String(value ?? '').trim()
  if (!stringValue) return true

  return /^\d+$/.test(stringValue)
}

export function validateProcessDraft(draft) {
  const errors = {}
  let firstKey = null

  function setError(key, message) {
    if (!errors[key]) errors[key] = message
    if (firstKey === null) firstKey = key
  }

  function checkDate(key, value) {
    if (!isValidProcessDate(value)) setError(key, DATE_ERROR_MESSAGE)
  }

  function checkDecimal(key, value) {
    if (!isValidNonNegativeDecimal(value)) setError(key, DECIMAL_ERROR_MESSAGE)
  }

  function checkInteger(key, value) {
    if (!isValidNonNegativeInteger(value)) setError(key, INTEGER_ERROR_MESSAGE)
  }

  const category = draft?.category

  // ---- ident ----
  if (
    category === 'CONSOLIDADO' &&
    Array.isArray(draft?.purchaseOrders) &&
    draft.purchaseOrders.length > MAX_PURCHASE_ORDERS
  ) {
    const count = draft.purchaseOrders.length
    setError(
      'purchaseOrders',
      `Máximo de ${MAX_PURCHASE_ORDERS} POs por processo (atual: ${count}). Remova ${count - MAX_PURCHASE_ORDERS}.`
    )
  }

  const canonicalIncoterm = canonicalizeIncoterm(draft?.incoterm)
  if (canonicalIncoterm && !INCOTERM_OPTIONS.includes(canonicalIncoterm)) {
    setError('incoterm', `Incoterm "${canonicalIncoterm}" não está na lista. Selecione um valor válido.`)
  }

  // ---- dates ----
  checkDate('etd', draft?.etd)
  checkDate('eta', draft?.eta)
  checkDate('warehouseDeliveryDateOverride', draft?.warehouseDeliveryDateOverride)

  // ---- status ----
  if (
    (category === 'FCL' || category === 'CONSOLIDADO') &&
    Array.isArray(draft?.containers) &&
    draft.containers.length > MAX_CONTAINERS
  ) {
    const count = draft.containers.length
    setError(
      'containers',
      `Máximo de ${MAX_CONTAINERS} contêineres por processo (atual: ${count}). Remova ${count - MAX_CONTAINERS}.`
    )
  }

  if (category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO') {
    checkDecimal('volumeM3', draft?.volumeM3)
  }
  if (category === 'LCL' || category === 'AEREO') {
    checkDecimal('grossWeightKg', draft?.grossWeightKg)
  }
  if (category === 'AEREO') {
    checkDecimal('chargeableWeightKg', draft?.chargeableWeightKg)
    checkInteger('packagesQuantity', draft?.packagesQuantity)
  }

  const licenses = Array.isArray(draft?.licenses) ? draft.licenses : []
  if (licenses.length > MAX_LICENSES) {
    const count = licenses.length
    setError(
      'licenses',
      `Máximo de ${MAX_LICENSES} anuências por processo (atual: ${count}). Remova ${count - MAX_LICENSES}.`
    )
  }
  licenses.forEach((license) => {
    const showInspection =
      license?.status === 'Vistoria agendada' || license?.status === 'Vistoria realizada'
    const showDeferredAt = license?.status === 'Deferida'

    if (showInspection) {
      checkDate(`licenses.${license.id}.inspectionScheduledAt`, license.inspectionScheduledAt)
    }
    if (showDeferredAt) {
      checkDate(`licenses.${license.id}.deferredAt`, license.deferredAt)
    }
  })

  // ---- transit ----
  if (draft?.transshipment === true) {
    checkDate('transshipmentEtd', draft?.transshipmentEtd)
  }

  // ---- flow ----
  checkDate('berthedAt', draft?.berthedAt)
  checkDate('arrivedAt', draft?.arrivedAt)

  if (FREE_TIME_CATEGORIES.includes(category)) {
    checkInteger('freeTimeDays', draft?.freeTimeDays)
    checkDecimal('demurrageDailyRateUsd', draft?.demurrageDailyRateUsd)
  }

  checkDate('dtaLoadingScheduledAt', draft?.dtaLoadingScheduledAt)
  checkDate('dtaArrivalAtItajai', draft?.dtaArrivalAtItajai)
  checkDate('cargoPresenceInformedAt', draft?.cargoPresenceInformedAt)
  checkDate('duimpRegisteredAt', draft?.duimpRegisteredAt)
  checkDate('parameterizedAt', draft?.parameterizedAt)
  checkDate('customsInspectionScheduledAt', draft?.customsInspectionScheduledAt)
  checkDate('clearanceCompletedAt', draft?.clearanceCompletedAt)

  const containers = Array.isArray(draft?.containers) ? draft.containers : []
  const collectionWindows = Array.isArray(draft?.collectionWindows) ? draft.collectionWindows : []
  collectionWindows.forEach((window) => {
    if (window?.id) checkDate(`collectionWindows.${window.id}.scheduledAt`, window.scheduledAt)
  })
  containers.forEach((container) => {
    if (container?.id) checkDate(`containers.${container.id}.returnedAt`, container.returnedAt)
  })

  // ---- items ----
  const items = Array.isArray(draft?.items) ? draft.items : []
  items.forEach((item) => {
    if (item?.id) checkDecimal(`items.${item.id}.quantity`, item.quantity)
  })

  return { errors, firstKey }
}

// Exportado so' pra documentar/testar a ordem visual dos passos (nao e'
// consumido pelo dev - `ProcessForm` conhece a propria lista de `steps`).
export { STEP_ORDER }
