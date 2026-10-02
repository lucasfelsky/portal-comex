// DUIMP sob aguas (D-1/D-3): projecao pura "visao por perfil". Antes da
// atracacao (maritimo) / chegada (aereo), so' admin e logistica enxergam os 9
// campos aduaneiros; os demais roles (fail-closed) recebem o processo SEM
// eles e com o status da VIAGEM. A restricao e' so' de frontend (mesmo padrao
// de `canSeeProcessName`): as rules liberam o doc a qualquer aprovado.
//
// Espelho para as Cloud Functions: `functions/src/process/customsVisibility.js`
// (paridade em `tests/unit/customsVisibility.test.js`).
//
// IMPORTS: so' de `./deriveProcessStatus` e `./arrivalCustoms`. O mock FECHADO
// de `tests/ui/ProcessesPage.test.jsx` so' exporta o que esses modulos
// entregam - importar qualquer outra coisa aqui derruba a suite inteira.
import { deriveProcessStatus, PRE_ARRIVAL_STATUSES } from './deriveProcessStatus'
import { EMPTY_CUSTOMS_CLEARANCE_FIELDS, hasArrivalSignal } from './arrivalCustoms'

const CUSTOMS_FIELD_KEYS = Object.keys(EMPTY_CUSTOMS_CLEARANCE_FIELDS)

// D-1: admin e logistica enxergam a DUIMP sob aguas; qualquer outro role
// (`user`, `compras`, `viewer`, ausente) e' restrito.
export function canSeeCustomsBeforeArrival(role) {
  return role === 'admin' || role === 'logistica'
}

export function isCustomsVisibleTo(process, role) {
  return canSeeCustomsBeforeArrival(role) || hasArrivalSignal(process)
}

function isPreArrivalStatus(status) {
  return PRE_ARRIVAL_STATUSES.includes(String(status ?? '').trim())
}

// Defesa em profundidade, SO' na derivacao de viagem da projecao: um status
// gravado DERIVADO DA DUIMP nunca vale como sinal legado de embarque (processo
// com DUIMP registrada antes do embarque nao pode virar "Embarcou"). O
// `deriveProcessStatus` NAO tem essa exclusao (legado pre-F17.2a segue
// contando). Espelho em `functions/src/process/customsVisibility.js`.
const DUIMP_DERIVED_STATUSES = [
  'Aguardando registro da DUIMP',
  'Aguardando parametrização da DUIMP',
  'Aguardando desembaraço',
]

function withoutDuimpLegacyStatus(process) {
  return DUIMP_DERIVED_STATUSES.includes(String(process?.processStatus ?? '').trim())
    ? { ...process, processStatus: '' }
    : process
}

// D-3: status da viagem. Com atracacao ou status gravado ja pre-chegada,
// mantem o gravado (zero mudanca para processos sem DUIMP sob aguas); senao
// deriva o status ignorando os 9 campos aduaneiros.
export function getVoyageStatus(process, today = new Date()) {
  if (hasArrivalSignal(process) || isPreArrivalStatus(process?.processStatus)) {
    return process?.processStatus
  }
  return deriveProcessStatus(
    { ...withoutDuimpLegacyStatus(process), ...EMPTY_CUSTOMS_CLEARANCE_FIELDS },
    today
  )
}

export function getVisibleProcessStatus(process, role, today = new Date()) {
  if (isCustomsVisibleTo(process, role)) return process?.processStatus
  return getVoyageStatus(process, today)
}

function isFilled(value) {
  if (value == null || value === false) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

function hasAnyCustomsField(process) {
  return CUSTOMS_FIELD_KEYS.some((key) => isFilled(process?.[key]))
}

export function projectProcessForViewer(process, role, today = new Date()) {
  if (!process || typeof process !== 'object') return process
  if (isCustomsVisibleTo(process, role)) return process
  if (!hasAnyCustomsField(process) && isPreArrivalStatus(process.processStatus)) return process

  return {
    ...process,
    ...EMPTY_CUSTOMS_CLEARANCE_FIELDS,
    processStatus: getVoyageStatus(process, today),
  }
}

export function projectProcessesForViewer(list, role, today = new Date()) {
  if (!Array.isArray(list)) return []
  if (canSeeCustomsBeforeArrival(role)) return list
  return list.map((process) => projectProcessForViewer(process, role, today))
}
