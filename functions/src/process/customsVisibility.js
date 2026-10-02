// DUIMP sob aguas (D-6): espelho PURO da projecao "visao por perfil" de
// `src/features/processes/customsVisibility.js`, usado pelo trigger
// `createProcessUpdateNotifications` para NAO avisar (in-app + e-mail + push)
// um favorito restrito sobre a DUIMP antes da atracacao/chegada.
//
// Importa SO de `./milestones.js` (puro). Proibido importar `../core/shared.js`
// (carrega `defineSecret`/`nodemailer`) e `src/` (o deploy empacota so
// `functions/`). O "hoje" (`todayKey`) vem de `getSaoPauloDateKey()` de
// `./operationalAlerts.js` - NUNCA `toISOString()`.
//
// PARIDADE: `tests/unit/customsVisibility.test.js` compara este modulo com o
// do `src/` (listas e matriz de projecao).
import { hasArrivalSignalMirror } from './milestones.js'

// Espelho de `EMPTY_CUSTOMS_CLEARANCE_FIELDS` (`arrivalCustoms.js`).
export const EMPTY_CUSTOMS_CLEARANCE_FIELDS_MIRROR = Object.freeze({
  duimpStatus: '',
  parameterizationChannel: '',
  clearanceCompletedAt: '',
  duimpNumber: '',
  duimpRegisteredAt: '',
  parameterizedAt: '',
  customsInspectionScheduledAt: '',
  customsRequirement: false,
  customsRequirementNotes: '',
})

// Espelho de `PRE_ARRIVAL_STATUSES` (`deriveProcessStatus.js`).
export const PRE_ARRIVAL_STATUSES_MIRROR = Object.freeze([
  'Aguardando Embarque',
  'Embarcou',
  'Aguardando atracação',
])

// Espelho de `processStatusOptions` (`processStatus.js`).
export const PROCESS_STATUS_OPTIONS_MIRROR = Object.freeze([
  'Aguardando Embarque',
  'Embarcou',
  'Aguardando atracação',
  'Atracação Confirmada',
  'Aguardando registro da DUIMP',
  'Aguardando parametrização da DUIMP',
  'Aguardando desembaraço',
  'Aguardando agendamento de coleta',
  'Coleta Agendada',
  'Carga recebida',
])

// Espelho de `DUIMP_DERIVED_STATUSES` (`src/features/processes/customsVisibility.js`).
const DUIMP_DERIVED_STATUSES_MIRROR = Object.freeze([
  'Aguardando registro da DUIMP',
  'Aguardando parametrização da DUIMP',
  'Aguardando desembaraço',
])

function hasValueLocal(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object' && typeof value.toDate === 'function') return true
  return Boolean(value)
}

// Espelho de `canSeeCustomsBeforeArrival` (D-1): so' admin e logistica; todo
// outro role (ou ausente) e' restrito (fail-closed).
export function canSeeCustomsBeforeArrivalMirror(role) {
  return role === 'admin' || role === 'logistica'
}

// Espelho de `getVoyageStatus`. Cobre o doc cru sanitizado; legado com
// `collectionStatus` de estoque antes da atracacao pode divergir (aceito).
export function getVoyageStatusMirror(process, todayKey) {
  const recorded = String(process?.processStatus ?? '').trim()

  if (hasArrivalSignalMirror(process) || PRE_ARRIVAL_STATUSES_MIRROR.includes(recorded)) {
    return process?.processStatus
  }

  // Defesa em profundidade: status gravado derivado da DUIMP NUNCA vale como
  // sinal legado de embarque (espelho de `withoutDuimpLegacyStatus`).
  const legacyShipped =
    !hasValueLocal(process?.shippedAt) &&
    PROCESS_STATUS_OPTIONS_MIRROR.includes(recorded) &&
    recorded !== 'Aguardando Embarque' &&
    !DUIMP_DERIVED_STATUSES_MIRROR.includes(recorded)
  const shipped = hasValueLocal(process?.shippedAt) || legacyShipped

  if (!shipped) return 'Aguardando Embarque'

  const eta = String(process?.eta ?? '').slice(0, 10)
  return eta && eta <= todayKey ? 'Aguardando atracação' : 'Embarcou'
}

// Espelho de `projectProcessForViewer` para um destinatario RESTRITO: com
// atracacao/chegada devolve o MESMO objeto; sem, zera os 9 campos aduaneiros e
// troca o status pelo da viagem.
export function projectProcessForRestrictedRecipientMirror(process, todayKey) {
  if (!process || typeof process !== 'object') return process
  if (hasArrivalSignalMirror(process)) return process

  return {
    ...process,
    ...EMPTY_CUSTOMS_CLEARANCE_FIELDS_MIRROR,
    processStatus: getVoyageStatusMirror(process, todayKey),
  }
}
