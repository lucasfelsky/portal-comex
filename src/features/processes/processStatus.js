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

const STATUS_DISPLAY_LABELS = {
  'Aguardando Embarque': 'Aguardando embarque',
  'Embarcou': 'Embarcou',
  'Aguardando atracação': 'Aguardando atracação',
  'Atracação Confirmada': 'Atracação confirmada',
  'Coleta Agendada': 'Coleta agendada',
}

export function getDisplayedProcessStatus(status, category) {
  const normalizedStatus = String(status ?? '').trim()

  if (category === 'AEREO') {
    if (normalizedStatus === 'Aguardando atracação') return 'Aguardando chegada'
    if (normalizedStatus === 'Atracação Confirmada') return 'Chegada confirmada'
  }

  return STATUS_DISPLAY_LABELS[normalizedStatus] || normalizedStatus
}

const COLLECTION_STATUS_DISPLAY_LABELS = {
  'Carga em Conferência/Etiquetagem': 'Carga em conferência/etiquetagem',
  'Carga em processo de Entrada': 'Carga em processo de entrada',
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

  const trimmed = String(status ?? '').trim()
  return COLLECTION_STATUS_DISPLAY_LABELS[trimmed] || trimmed
}

export function isProcessStatusFinalized(status) {
  return canonicalizeProcessStatus(status) === 'Carga recebida'
}

// PR #5 (2026-07-09): "finalizado de verdade" pro dashboard de chegadas
// da semana. Diferente de `isProcessStatusFinalized` (que checa
// `processStatus`), este checa `collectionStatus === 'Carga disponível
// em estoque'` — o ponto sem retorno. Usado por `WeeklyArrivalsCard`
// pra manter o processo visivel mesmo apos o `processStatus` virar
// 'Carga recebida' (desde que ainda nao esteja em estoque). Nao'
// confundir com `isCdUnloadingOrReceivedStatus` (que t inclui "em
// estoque" mas e' usado em outros lugares onde a semantica e'
// diferente).
export function isProcessInStock(process) {
  return normalizeComparableText(process?.collectionStatus) === 'carga disponivel em estoque'
}

// `isProcessTrulyFinalized(process)` e' o sinal consolidado: o
// processo ja' entrou em estoque e pode sair do dashboard. Ate' la,
// mantemos visivel.
export function isProcessTrulyFinalized(process) {
  return isProcessInStock(process)
}

// PR #6 (2026-07-09): label dinamica pro card "Coleta nao
// agendada" (renomeada pra "Previsao de entrega no armazem") do
// WeeklyArrivalsCard. Antes era sempre "Coleta ainda nao
// agendada", o que nao faz sentido quando o processo ja' esta'
// "a caminho do CD" (coleta ja' aconteceu). Agora reflete o
// `collectionStatus` real.
//
// PR #11 (2026-07-09): **consistência badge <-> notes**.
// Investigacao do Lucas (image anexada) mostrou que em
// processos com `collectionStatus` desatualizado (ex: ainda
// "Coleta agendada") MAS com `collectionWindows` ja' passada,
// o `getProcessDerivedStatus` retorna fase `EM_ROTA` (badge
// "Carga a caminho do CD"), mas esta funcao retornava
// "Coleta ainda nao agendada" (notes). Dois sinais do mesmo
// processo chegando a conclusoes opostas = inconsistência
// visual pro usuario.
//
// Fix: usa a **fase derivada** (`getProcessDerivedStatus`)
// como sinal primario, e so' usa `collectionStatus` direto
// se a fase for `EM_TRANSITO` (sem janela, sem rota, sem
// conferencia) ou `COLETA_AGENDADA` (janela no futuro).
//
// Retorna:
// - "Carga em transito para o CD" quando fase EM_ROTA
//   (collectionWindows passada, ou collectionStatus
//   "Carga a caminho do CD" / "Veiculo no CD para descarga").
// - "Carga em processamento no CD" quando fase POS_RECEBIMENTO
//   (em conferencia/etiquetagem, em processo de entrada, sendo
//   descarregada, recebida).
// - "Coleta ainda nao agendada" quando fase COLETA_AGENDADA
//   (janela no futuro) ou EM_TRANSITO sem contexto de CD.
// - "Coleta ainda nao agendada" quando collectionStatus
//   pre-coleta (Aguardando agendamento de coleta, Coleta
//   Agendada) — fallback de seguranca.
// - "" (vazio) como fallback defensivo.
export function getUnscheduledItemLabel(process) {
  // PR #11: alinhamento badge <-> notes.
  // Pra decidir a label, olhamos o `processStatus` cru + a
  // existencia de `collectionWindows` passada. Isso espelha
  // (de forma simplificada) o que `getProcessDerivedStatus`
  // faz pra decidir a fase `EM_ROTA`:
  //   - fase `EM_ROTA` se `collectionWindows` existe e a
  //     proxima janela ja' passou (linha 100-104 do
  //     processDerivedStatus.js)
  //   - fase `POS_RECEBIMENTO` se `collectionStatus` em
  //     status de CD (conferencia, descarga, recebida)
  // Como a funcao abaixo (caminho antigo) olha o
  // `collectionStatus` direto, ha' casos em que o
  // `collectionStatus` foi atualizado pra "Coleta
  // Agendada" (intencao: "ainda vai coletar") mas a
  // `collectionWindows` ja' passou — nesse caso a badge
  // diz "Carga a caminho do CD" e o notes dizia
  // "Coleta ainda nao agendada". Aqui corrigimos
  // olhando tambem a `collectionWindows`.
  const normalized = normalizeComparableText(process?.collectionStatus)

  // Sinais de "em rota" — espelham isCdEnRouteStatus +
  // getProcessDerivedStatus fase EM_ROTA (janela passada).
  const isEnRoute = (
    normalized === 'carga a caminho do cd' ||
    normalized === 'veiculo no cd para descarga'
  )
  const hasOverdueWindow = Array.isArray(process?.collectionWindows) &&
    process.collectionWindows.some((window) => {
      const scheduled = window?.scheduledAt
      if (!scheduled) return false
      const time = new Date(scheduled).getTime()
      return Number.isFinite(time) && time < Date.now()
    })
  if (isEnRoute || hasOverdueWindow) {
    return 'Carga em trânsito para o CD'
  }

  // Sinais de "em processamento no CD" — em conferencia,
  // descarga, recebida, em entrada.
  if (
    normalized === 'carga em conferencia/etiquetagem' ||
    normalized === 'carga em processo de entrada' ||
    normalized === 'carga sendo descarregada no cd' ||
    normalized === 'carga recebida'
  ) {
    return 'Carga em processamento no CD'
  }

  // Pre-coleta — "ainda nao agendada" (ou agendada no futuro).
  if (
    normalized === 'aguardando agendamento de coleta' ||
    normalized === 'coleta agendada'
  ) {
    return 'Coleta ainda não agendada'
  }

  return ''
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

// Uniao deliberada de `isCollectionScheduleRetainingStatus` +
// `isCdUnloadingOrReceivedStatus` — cobre "Coleta Agendada" e todo status
// posterior (veiculo no CD, carga a caminho do CD, pos-recebimento, em
// estoque). Nao cria lista de status nova de proposito: allowlist positiva
// de status ja causou 2 bugs de producao em 2026-07 (L21/L22).
export function isCollectionScheduledOrBeyondStatus(status) {
  return isCollectionScheduleRetainingStatus(status) || isCdUnloadingOrReceivedStatus(status)
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
