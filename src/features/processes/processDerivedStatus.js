import { isMaritimeCategory, isAirCategory } from './processCategories'
import { hasArrivalSignal, isDuimpUnderWater } from './arrivalCustoms'
import {
  canonicalizeProcessStatus,
  isCdEnRouteStatus,
  isCdUnloadingOrReceivedStatus,
  isProcessInStock,
  isProcessStatusFinalized,
} from './processStatus'
import { getCollectionWindows, getNextCollectionWindow } from '../../utils/collectionWindows'

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

  const collectionWindows = getCollectionWindows(process)
  const nextWindow = getNextCollectionWindow(process, now)

  if (collectionWindows.length > 0 && nextWindow) {
    const nextTime = new Date(nextWindow.scheduledAt).getTime()
    if (nextTime >= now.getTime()) {
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

  const status = canonicalizeProcessStatus(process.processStatus)

  if (status === 'Aguardando Embarque') {
    return buildDerived(DERIVED_STATUS_PHASES.AGUARDANDO_EMBARQUE, process)
  }

  if (status === 'Embarcou') {
    return buildDerived(DERIVED_STATUS_PHASES.EMBARCADO, process)
  }

  if (status === 'Aguardando atracação') {
    return buildDerived(DERIVED_STATUS_PHASES.AGUARDANDO_ATRACACAO, process)
  }

  if (
    status === 'Atracação Confirmada' ||
    status === 'Aguardando registro da DUIMP' ||
    status === 'Aguardando parametrização da DUIMP' ||
    status === 'Aguardando desembaraço' ||
    status === 'Aguardando agendamento de coleta'
  ) {
    // DUIMP sob aguas (D-5): DUIMP registrada antes da atracacao nao avanca o
    // processo para a fase de porto/desembaraco - segue Embarcado.
    if (isDuimpUnderWater(process)) {
      return buildDerived(DERIVED_STATUS_PHASES.EMBARCADO, process)
    }

    if (status === 'Atracação Confirmada') {
      return buildDerived(DERIVED_STATUS_PHASES.ATRACADO, process)
    }

    if (status === 'Aguardando registro da DUIMP') {
      return buildDerived(DERIVED_STATUS_PHASES.NO_PORTO, process)
    }

    if (status === 'Aguardando agendamento de coleta') {
      return buildDerived(DERIVED_STATUS_PHASES.LIBERADO_COLETA, process)
    }

    return buildDerived(DERIVED_STATUS_PHASES.AGUARDANDO_DESEMBARACO, process)
  }

  return buildDerived(DERIVED_STATUS_PHASES.EM_TRANSITO, process)
}

export function getDerivedStatusToneClass(derived) {
  return `status-tag status-tag--${derived?.tone ?? 'neutral'}`
}
