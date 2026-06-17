import { isMaritimeCategory, isAirCategory } from './processCategories'
import {
  isCdEnRouteStatus,
  isCdUnloadingOrReceivedStatus,
  isProcessStatusFinalized,
} from './processStatus'
import { getCollectionWindows, getNextCollectionWindow } from '../../utils/collectionWindows'

export const DERIVED_STATUS_PHASES = {
  CONCLUIDO: 'concluido',
  POS_RECEBIMENTO: 'pos_recebimento',
  EM_ROTA: 'em_rota',
  COLETA_AGENDADA: 'coleta_agendada',
  ATRASADO: 'atrasado',
  NO_PORTO: 'no_porto',
  EMBARCADO: 'embarcado',
  EM_TRANSITO: 'em_transito',
}

const DERIVED_STATUS_LABELS = {
  [DERIVED_STATUS_PHASES.CONCLUIDO]: 'Concluído',
  [DERIVED_STATUS_PHASES.POS_RECEBIMENTO]: 'No CD / pós-recebimento',
  [DERIVED_STATUS_PHASES.EM_ROTA]: 'Carga a caminho do CD',
  [DERIVED_STATUS_PHASES.COLETA_AGENDADA]: 'Coleta agendada',
  [DERIVED_STATUS_PHASES.ATRASADO]: 'Atrasado',
  [DERIVED_STATUS_PHASES.NO_PORTO]: 'No porto / desembaraço',
  [DERIVED_STATUS_PHASES.EMBARCADO]: 'Embarcado',
  [DERIVED_STATUS_PHASES.EM_TRANSITO]: 'Em trânsito',
}

const DERIVED_STATUS_TONES = {
  [DERIVED_STATUS_PHASES.CONCLUIDO]: 'ok',
  [DERIVED_STATUS_PHASES.POS_RECEBIMENTO]: 'info',
  [DERIVED_STATUS_PHASES.EM_ROTA]: 'info',
  [DERIVED_STATUS_PHASES.COLETA_AGENDADA]: 'info',
  [DERIVED_STATUS_PHASES.ATRASADO]: 'danger',
  [DERIVED_STATUS_PHASES.NO_PORTO]: 'warn',
  [DERIVED_STATUS_PHASES.EMBARCADO]: 'neutral',
  [DERIVED_STATUS_PHASES.EM_TRANSITO]: 'neutral',
}

function isOverdue(process, todayIso) {
  if (!process?.eta) return false

  const eta = String(process.eta).slice(0, 10)
  if (!eta || eta >= todayIso) return false

  if (isMaritimeCategory(process.category)) return !process.berthed
  if (isAirCategory(process.category)) return !process.arrived

  return false
}

export function getProcessDerivedStatus(process, now = new Date()) {
  if (!process) {
    return {
      phase: DERIVED_STATUS_PHASES.EM_TRANSITO,
      label: 'Em trânsito',
      tone: 'neutral',
    }
  }

  if (isProcessStatusFinalized(process.processStatus)) {
    return {
      phase: DERIVED_STATUS_PHASES.CONCLUIDO,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.CONCLUIDO],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.CONCLUIDO],
    }
  }

  if (isCdUnloadingOrReceivedStatus(process.collectionStatus)) {
    return {
      phase: DERIVED_STATUS_PHASES.POS_RECEBIMENTO,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.POS_RECEBIMENTO],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.POS_RECEBIMENTO],
    }
  }

  if (isCdEnRouteStatus(process.collectionStatus)) {
    return {
      phase: DERIVED_STATUS_PHASES.EM_ROTA,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.EM_ROTA],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.EM_ROTA],
    }
  }

  const collectionWindows = getCollectionWindows(process)
  const nextWindow = getNextCollectionWindow(process, now)

  if (collectionWindows.length > 0 && nextWindow) {
    const nextTime = new Date(nextWindow.scheduledAt).getTime()
    if (nextTime >= now.getTime()) {
      return {
        phase: DERIVED_STATUS_PHASES.COLETA_AGENDADA,
        label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.COLETA_AGENDADA],
        tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.COLETA_AGENDADA],
      }
    }

    return {
      phase: DERIVED_STATUS_PHASES.EM_ROTA,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.EM_ROTA],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.EM_ROTA],
    }
  }

  const todayIso = now.toISOString().slice(0, 10)
  if (isOverdue(process, todayIso)) {
    return {
      phase: DERIVED_STATUS_PHASES.ATRASADO,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.ATRASADO],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.ATRASADO],
    }
  }

  const status = String(process.processStatus ?? '').toLowerCase()
  if (status === 'aguardando embarque') {
    return {
      phase: DERIVED_STATUS_PHASES.EM_TRANSITO,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.EM_TRANSITO],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.EM_TRANSITO],
    }
  }

  if (status === 'embarcou') {
    return {
      phase: DERIVED_STATUS_PHASES.EMBARCADO,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.EMBARCADO],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.EMBARCADO],
    }
  }

  if (
    status === 'atracação confirmada' ||
    status === 'aguardando registro da duimp' ||
    status === 'aguardando parametrização da duimp' ||
    status === 'aguardando agendamento de coleta'
  ) {
    return {
      phase: DERIVED_STATUS_PHASES.NO_PORTO,
      label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.NO_PORTO],
      tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.NO_PORTO],
    }
  }

  return {
    phase: DERIVED_STATUS_PHASES.EM_TRANSITO,
    label: DERIVED_STATUS_LABELS[DERIVED_STATUS_PHASES.EM_TRANSITO],
    tone: DERIVED_STATUS_TONES[DERIVED_STATUS_PHASES.EM_TRANSITO],
  }
}

export function getDerivedStatusToneClass(derived) {
  return `status-tag status-tag--${derived?.tone ?? 'neutral'}`
}