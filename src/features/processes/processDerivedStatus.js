import { isMaritimeCategory, isAirCategory } from './processCategories'
import { hasArrivalSignal, isDuimpUnderWater } from './arrivalCustoms'
import {
  canonicalizeProcessStatus,
  getDisplayedProcessStatus,
  getQuickReadProcessStatus,
  getUnscheduledItemLabel,
  isCdEnRouteStatus,
  isCdUnloadingOrReceivedStatus,
  isProcessInStock,
  isProcessStatusFinalized,
  normalizeComparableText,
} from './processStatus'
import { getCollectionWindows } from '../../utils/collectionWindows'
import { deriveProcessStatus } from './deriveProcessStatus'

export const DERIVED_STATUS_PHASES = {
  CONCLUIDO: 'concluido',
  POS_RECEBIMENTO: 'pos_recebimento',
  EM_ROTA: 'em_rota',
  COLETA_AGENDADA: 'coleta_agendada',
  ATRASADO: 'atrasado',
  AGUARDANDO_EMBARQUE: 'aguardando_embarque',
  AGUARDANDO_ATRACACAO: 'aguardando_atracacao',
  ATRACADO: 'atracado',
  NO_PORTO: 'no_porto',
  AGUARDANDO_DESEMBARACO: 'aguardando_desembaraco',
  LIBERADO_COLETA: 'liberado_coleta',
  EMBARCADO: 'embarcado',
  EM_TRANSITO: 'em_transito',
}

const DERIVED_STATUS_LABELS = {
  [DERIVED_STATUS_PHASES.CONCLUIDO]: 'Concluído',
  [DERIVED_STATUS_PHASES.POS_RECEBIMENTO]: 'Recebida no CD',
  [DERIVED_STATUS_PHASES.EM_ROTA]: 'Carga a caminho do CD',
  [DERIVED_STATUS_PHASES.COLETA_AGENDADA]: 'Coleta agendada',
  [DERIVED_STATUS_PHASES.ATRASADO]: 'Atrasado',
  [DERIVED_STATUS_PHASES.AGUARDANDO_EMBARQUE]: 'Aguardando embarque',
  [DERIVED_STATUS_PHASES.AGUARDANDO_ATRACACAO]: 'Aguardando atracação',
  [DERIVED_STATUS_PHASES.ATRACADO]: 'Atracado',
  [DERIVED_STATUS_PHASES.NO_PORTO]: 'No porto',
  [DERIVED_STATUS_PHASES.AGUARDANDO_DESEMBARACO]: 'Aguardando desembaraço',
  [DERIVED_STATUS_PHASES.LIBERADO_COLETA]: 'Liberado para coleta',
  [DERIVED_STATUS_PHASES.EMBARCADO]: 'Embarcado',
  [DERIVED_STATUS_PHASES.EM_TRANSITO]: 'Em trânsito',
}

// Mesmos textos de getDisplayedProcessStatus (processStatus.js) para AEREO.
const AIR_DERIVED_STATUS_LABELS = {
  [DERIVED_STATUS_PHASES.AGUARDANDO_ATRACACAO]: 'Aguardando chegada',
  [DERIVED_STATUS_PHASES.ATRACADO]: 'Chegada confirmada',
}

const DERIVED_STATUS_TONES = {
  [DERIVED_STATUS_PHASES.CONCLUIDO]: 'ok',
  [DERIVED_STATUS_PHASES.POS_RECEBIMENTO]: 'info',
  [DERIVED_STATUS_PHASES.EM_ROTA]: 'info',
  [DERIVED_STATUS_PHASES.COLETA_AGENDADA]: 'info',
  [DERIVED_STATUS_PHASES.ATRASADO]: 'danger',
  [DERIVED_STATUS_PHASES.AGUARDANDO_EMBARQUE]: 'neutral',
  [DERIVED_STATUS_PHASES.AGUARDANDO_ATRACACAO]: 'neutral',
  [DERIVED_STATUS_PHASES.ATRACADO]: 'info',
  [DERIVED_STATUS_PHASES.NO_PORTO]: 'info',
  [DERIVED_STATUS_PHASES.AGUARDANDO_DESEMBARACO]: 'warn',
  [DERIVED_STATUS_PHASES.LIBERADO_COLETA]: 'info',
  [DERIVED_STATUS_PHASES.EMBARCADO]: 'neutral',
  [DERIVED_STATUS_PHASES.EM_TRANSITO]: 'neutral',
}

function buildDerived(phase, process) {
  const airLabel = isAirCategory(process?.category)
    ? AIR_DERIVED_STATUS_LABELS[phase]
    : undefined

  return {
    phase,
    label: airLabel ?? DERIVED_STATUS_LABELS[phase],
    tone: DERIVED_STATUS_TONES[phase],
  }
}

function isOverdue(process, todayIso) {
  if (!process?.eta) return false

  const eta = String(process.eta).slice(0, 10)
  if (!eta || eta >= todayIso) return false

  if (isMaritimeCategory(process.category) || isAirCategory(process.category)) {
    return !hasArrivalSignal(process)
  }

  return false
}

// Mapeia o status canonico para a fase derivada. Devolve `null` quando o
// status nao tem fase propria (o caller cai em EM_TRANSITO).
function getPhaseForCanonicalStatus(status, process) {
  if (status === 'Aguardando Embarque') return DERIVED_STATUS_PHASES.AGUARDANDO_EMBARQUE
  if (status === 'Embarcou') return DERIVED_STATUS_PHASES.EMBARCADO
  if (status === 'Aguardando atracação') return DERIVED_STATUS_PHASES.AGUARDANDO_ATRACACAO

  // Chega aqui so quem nao tem janela de coleta com data (ver
  // getProcessDerivedStatus): coleta sem data nao e coleta agendada.
  if (status === 'Coleta Agendada') return DERIVED_STATUS_PHASES.LIBERADO_COLETA
  if (status === 'Carga recebida') return DERIVED_STATUS_PHASES.CONCLUIDO

  if (
    status === 'Atracação Confirmada' ||
    status === 'Aguardando registro da DUIMP' ||
    status === 'Aguardando parametrização da DUIMP' ||
    status === 'Aguardando desembaraço' ||
    status === 'Aguardando agendamento de coleta'
  ) {
    // DUIMP sob aguas (D-5): DUIMP registrada antes da atracacao nao avanca o
    // processo para a fase de porto/desembaraco - segue Embarcado.
    if (isDuimpUnderWater(process)) return DERIVED_STATUS_PHASES.EMBARCADO

    if (status === 'Atracação Confirmada') return DERIVED_STATUS_PHASES.ATRACADO
    if (status === 'Aguardando registro da DUIMP') return DERIVED_STATUS_PHASES.NO_PORTO
    if (status === 'Aguardando agendamento de coleta') return DERIVED_STATUS_PHASES.LIBERADO_COLETA

    return DERIVED_STATUS_PHASES.AGUARDANDO_DESEMBARACO
  }

  return null
}

export function getProcessDerivedStatus(process, now = new Date()) {
  if (!process) {
    return buildDerived(DERIVED_STATUS_PHASES.EM_TRANSITO, null)
  }

  if (isProcessInStock(process)) {
    return buildDerived(DERIVED_STATUS_PHASES.CONCLUIDO, process)
  }

  if (isCdUnloadingOrReceivedStatus(process.collectionStatus)) {
    return buildDerived(DERIVED_STATUS_PHASES.POS_RECEBIMENTO, process)
  }

  if (isProcessStatusFinalized(process.processStatus)) {
    return buildDerived(DERIVED_STATUS_PHASES.CONCLUIDO, process)
  }

  if (isCdEnRouteStatus(process.collectionStatus)) {
    return buildDerived(DERIVED_STATUS_PHASES.EM_ROTA, process)
  }

  // Apenas janelas com data valida contam: janela sem `scheduledAt` nao e
  // coleta agendada nem coleta ja realizada. `getCollectionWindows` ja mapeia
  // o legado `collectionScheduledAt` (dual schema).
  const datedWindows = getCollectionWindows(process).filter(
    (window) => window?.scheduledAt && Number.isFinite(new Date(window.scheduledAt).getTime()),
  )

  if (datedWindows.length > 0) {
    const hasFutureWindow = datedWindows.some(
      (window) => new Date(window.scheduledAt).getTime() >= now.getTime(),
    )
    if (hasFutureWindow) {
      return buildDerived(DERIVED_STATUS_PHASES.COLETA_AGENDADA, process)
    }

    return buildDerived(DERIVED_STATUS_PHASES.EM_ROTA, process)
  }

  // PR #15 (2026-07-09): usa data local (nao' UTC) pra evitar bug
  // de timezone. `now.toISOString()` sempre usa UTC, e em BRT
  // (UTC-3) pode estar num dia diferente do local. Processos com
  // `eta` cadastrado em horario local podem ser mal classificados.
  // O caller passa `todayIso` mas o default agora usa componentes
  // locais (mais seguro).
  const todayIsoLocal = (() => {
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })()
  if (isOverdue(process, todayIsoLocal)) {
    return buildDerived(DERIVED_STATUS_PHASES.ATRASADO, process)
  }

  let status = canonicalizeProcessStatus(process.processStatus)

  // Status vazio, desconhecido ou legado: recalcula a partir dos campos
  // operacionais (mesma fonte da camada de compatibilidade F17).
  if (!status) {
    status = canonicalizeProcessStatus(deriveProcessStatus(process, now))
  }

  return buildDerived(
    getPhaseForCanonicalStatus(status, process) ?? DERIVED_STATUS_PHASES.EM_TRANSITO,
    process,
  )
}

export function getDerivedStatusToneClass(derived) {
  return `status-tag status-tag--${derived?.tone ?? 'neutral'}`
}

// Textos crus (normalizados) que apenas repetem a fase derivada. Chave =
// texto sem acento/lowercase. 'Aguardando registro da DUIMP' e 'Aguardando
// parametrizacao da DUIMP' ficam de fora de proposito: trazem informacao a
// mais que o selo e continuam visiveis.
const DETAIL_EQUIVALENT_PHASE = {
  'aguardando embarque': DERIVED_STATUS_PHASES.AGUARDANDO_EMBARQUE,
  embarcou: DERIVED_STATUS_PHASES.EMBARCADO,
  'aguardando atracacao': DERIVED_STATUS_PHASES.AGUARDANDO_ATRACACAO,
  'aguardando chegada': DERIVED_STATUS_PHASES.AGUARDANDO_ATRACACAO,
  'atracacao confirmada': DERIVED_STATUS_PHASES.ATRACADO,
  'chegada confirmada': DERIVED_STATUS_PHASES.ATRACADO,
  'aguardando desembaraco': DERIVED_STATUS_PHASES.AGUARDANDO_DESEMBARACO,
  'aguardando agendamento de coleta': DERIVED_STATUS_PHASES.LIBERADO_COLETA,
  'coleta agendada': DERIVED_STATUS_PHASES.COLETA_AGENDADA,
  'carga a caminho do cd': DERIVED_STATUS_PHASES.EM_ROTA,
}

/**
 * Detalhe textual exibido junto do selo derivado. Devolve `''` quando o texto
 * apenas repete o selo (mesmo label ou fase equivalente); senao devolve o texto.
 * `source`: 'quickRead' (collectionStatus tem prioridade) ou 'processStatus'.
 */
export function getProcessStatusDetail(process, { now = new Date(), source = 'quickRead' } = {}) {
  if (!process) return ''

  const rawText =
    source === 'processStatus'
      ? getDisplayedProcessStatus(process.processStatus, process.category)
      : getQuickReadProcessStatus(process)
  const text = String(rawText ?? '').trim()
  if (!text) return ''

  const derived = getProcessDerivedStatus(process, now)
  const normalizedText = normalizeComparableText(text).trim()

  if (normalizedText === normalizeComparableText(derived.label).trim()) return ''
  if (DETAIL_EQUIVALENT_PHASE[normalizedText] === derived.phase) return ''

  return text
}

/**
 * Nota de "item nao agendado" da linha de Chegadas (desktop). Some quando o
 * selo derivado ja diz que a coleta saiu (EM_ROTA) ou a carga foi recebida.
 */
export function getArrivalNoteLabel(process, now = new Date()) {
  const { phase } = getProcessDerivedStatus(process, now)
  if (phase === DERIVED_STATUS_PHASES.EM_ROTA || phase === DERIVED_STATUS_PHASES.POS_RECEBIMENTO) {
    return ''
  }

  return getUnscheduledItemLabel(process)
}
