export const processStatusOptions = [
  'Aguardando Embarque',
  'Embarcou',
  'Aguardando atracação',
  'Atracação Confirmada',
  'Aguardando registro e parametrização da DUIMP',
  'Aguardando agendamento de coleta',
  'Coleta Agendada',
  // Mantemos "Carga recebida" na lista controlada porque a exibicao das
  // observacoes pos-recebimento depende desse valor e ele ja existe no fluxo
  // operacional atual de coleta.
  'Carga recebida',
]

export function normalizeComparableText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function canonicalizeProcessStatus(status) {
  const normalizedStatus = normalizeComparableText(status)

  if (normalizedStatus === 'aguardando embarque') return 'Aguardando Embarque'
  if (normalizedStatus === 'embarcou') return 'Embarcou'
  if (normalizedStatus === 'aguardando atracacao') return 'Aguardando atracação'
  if (normalizedStatus === 'atracacao confirmada') return 'Atracação Confirmada'
  if (normalizedStatus === 'aguardando registro e parametrizacao da duimp') {
    return 'Aguardando registro e parametrização da DUIMP'
  }
  if (normalizedStatus === 'aguardando agendamento de coleta') {
    return 'Aguardando agendamento de coleta'
  }
  if (normalizedStatus === 'coleta agendada') return 'Coleta Agendada'
  if (normalizedStatus === 'carga recebida') return 'Carga recebida'

  return ''
}

export function isProcessStatusFinalized(status) {
  return canonicalizeProcessStatus(status) === 'Carga recebida'
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
    canonicalStatus === 'Aguardando registro e parametrização da DUIMP' ||
    canonicalStatus === 'Aguardando agendamento de coleta'
  ) {
    return 'warn'
  }
  if (!canonicalStatus) return 'neutral'
  return 'neutral'
}
