export const processStatusOptions = [
  'Aguardando Embarque',
  'Embarcou',
  'Aguardando atracação',
  'Atracação Confirmada',
  'Aguardando registro da DUIMP',
  'Aguardando parametrização da DUIMP',
  'Aguardando agendamento de coleta',
  'Coleta Agendada',
  // Mantemos "Carga recebida" na lista controlada porque a exibição das
  // observações pós-recebimento depende desse valor e ele já existe no fluxo
  // operacional atual de coleta.
  'Carga recebida',
]

export const postCollectionStatusOptions = [
  'Carga em Conferência/Etiquetagem',
  'Carga em processo de Entrada',
  'Carga disponível em estoque',
]

export const CD_EN_ROUTE_STATUS = 'Carga a caminho do CD'

export function isCdEnRouteStatus(status) {
  return normalizeComparableText(status) === normalizeComparableText(CD_EN_ROUTE_STATUS)
}

export function isLogisticaEditableCollectionStatus(status) {
  const normalizedStatus = normalizeComparableText(status)
  return (
    normalizedStatus === 'carga a caminho do cd' ||
    isPostCollectionStatus(status) ||
    normalizedStatus === 'veiculo no cd para descarga' ||
    normalizedStatus === 'carga recebida'
  )
}

export function normalizeComparableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function isMapaInspectionScheduledStatus(status) {
  return normalizeComparableText(status) === 'vistoria agendada, aguardando realizacao'
}

export function mapaAllowsCollectionStatus(status) {
  return status === 'Liberado' || status === 'LPCO deferida, MAPA liberado'
}

export function isDtaLoadingScheduledStatus(status) {
  return normalizeComparableText(status) === 'carregamento programado'
}

export function isDtaTransitCompletedStatus(status) {
  return normalizeComparableText(status) === 'transito concluido'
}

export function canonicalizeProcessStatus(status, duimpStatus = '') {
  const normalizedStatus = normalizeComparableText(status)
  const normalizedDuimpStatus = normalizeComparableText(duimpStatus)

  if (normalizedStatus === 'aguardando embarque') return 'Aguardando Embarque'
  if (normalizedStatus === 'embarcou') return 'Embarcou'
  if (normalizedStatus === 'aguardando atracacao') return 'Aguardando atracação'
  if (normalizedStatus === 'atracacao confirmada') return 'Atracação Confirmada'
  if (normalizedStatus === 'aguardando registro da duimp') {
    return 'Aguardando registro da DUIMP'
  }
  if (normalizedStatus === 'aguardando parametrizacao da duimp') {
    return 'Aguardando parametrização da DUIMP'
  }
  if (normalizedStatus === 'aguardando registro e parametrizacao da duimp') {
    if (
      normalizedDuimpStatus === 'registrada, aguardando parametrizacao' ||
      normalizedDuimpStatus === 'aguardando parametrizacao da duimp'
    ) {
      return 'Aguardando parametrização da DUIMP'
    }

    return 'Aguardando registro da DUIMP'
  }
  if (normalizedStatus === 'aguardando agendamento de coleta') {
    return 'Aguardando agendamento de coleta'
  }
  if (normalizedStatus === 'coleta agendada') return 'Coleta Agendada'
  if (normalizedStatus === 'carga recebida') return 'Carga recebida'

  return ''
}

export function getDisplayedProcessStatus(status, category) {
  const normalizedStatus = String(status ?? '').trim()

  if (category !== 'AEREO') return normalizedStatus
  if (normalizedStatus === 'Aguardando atracação') return 'Aguardando chegada'
  if (normalizedStatus === 'Atracação Confirmada') return 'Chegada Confirmada'

  return normalizedStatus
}

export function getDisplayedCollectionStatus(status) {
  const normalizedStatus = normalizeComparableText(status)

  if (
    normalizedStatus === 'veiculo no cd para descarga' ||
    normalizedStatus === 'carga sendo descarregada no cd'
  ) {
    return 'Carga sendo descarregada'
  }

  if (normalizedStatus === 'carga a caminho do cd') return CD_EN_ROUTE_STATUS
  if (normalizedStatus === 'carga recebida') return 'Carga recebida'

  return String(status ?? '').trim()
}

export function isProcessStatusFinalized(status) {
  return canonicalizeProcessStatus(status) === 'Carga recebida'
}

export function isCdUnloadingOrReceivedStatus(status) {
  const normalizedStatus = normalizeComparableText(status)

  return (
    normalizedStatus === 'veiculo no cd para descarga' ||
    normalizedStatus === 'carga em conferencia/etiquetagem' ||
    normalizedStatus === 'carga em processo de entrada' ||
    normalizedStatus === 'carga disponivel em estoque' ||
    normalizedStatus === 'carga sendo descarregada no cd' ||
    normalizedStatus === 'carga recebida'
  )
}

export function isPostCollectionStatus(status) {
  const normalizedStatus = normalizeComparableText(status)

  return postCollectionStatusOptions.some(
    (item) => normalizeComparableText(item) === normalizedStatus
  )
}

export function isCollectionScheduleRetainingStatus(status) {
  const normalizedStatus = normalizeComparableText(status)

  return (
    normalizedStatus === 'coleta agendada' ||
    normalizedStatus === 'veiculo no cd para descarga' ||
    isPostCollectionStatus(status) ||
    normalizedStatus === 'carga a caminho do cd' ||
    normalizedStatus === 'carga recebida'
  )
}

export function shouldHideProcessCardSchedule(process) {
  return (
    isCdUnloadingOrReceivedStatus(process?.processStatus) ||
    isCdUnloadingOrReceivedStatus(process?.collectionStatus)
  )
}

export function shouldHideProcessStatusBadge(process) {
  return Boolean(process?.collectionStatus?.trim?.())
}

export function getQuickReadProcessStatus(process) {
  if (shouldHideProcessStatusBadge(process)) {
    return getDisplayedCollectionStatus(process.collectionStatus)
  }

  return getDisplayedProcessStatus(process?.processStatus, process?.category)
}

export function getProcessStatusTone(status) {
  const canonicalStatus = canonicalizeProcessStatus(status)

  if (canonicalStatus === 'Carga recebida') return 'ok'
  if (
    canonicalStatus === 'Atracação Confirmada' ||
    canonicalStatus === 'Coleta Agendada' ||
    canonicalStatus === 'Embarcou'
  ) {
    return 'info'
  }
  if (
    canonicalStatus === 'Aguardando registro da DUIMP' ||
    canonicalStatus === 'Aguardando parametrização da DUIMP' ||
    canonicalStatus === 'Aguardando agendamento de coleta'
  ) {
    return 'warn'
  }
  if (isCdEnRouteStatus(status)) return 'info'
  if (!canonicalStatus) return 'neutral'
  return 'neutral'
}
